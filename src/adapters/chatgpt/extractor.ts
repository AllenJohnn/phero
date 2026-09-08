import {
  ContentBlock,
} from '../../core/models/conversation.ts';
import { ExtractionOptions, ExtractionResult } from '../types.ts';
import { detectChatGPTState } from './detector.ts';
import { Logger } from '../../shared/logger.ts';


export function extractContentBlocksFromElement(element: HTMLElement): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  
  const children = Array.from(element.children) as HTMLElement[];

  if (children.length === 0) {
    const rawText = element.textContent?.trim() || '';
    if (rawText) {
      blocks.push({ type: 'text', text: rawText });
    }
    return blocks;
  }

  
  for (const child of children) {
    
    const preEl = child.tagName === 'PRE' ? child : child.querySelector('pre');
    if (preEl) {
      
      const codeEl = preEl.querySelector('code');
      const codeContent = codeEl ? codeEl.textContent || '' : preEl.textContent || '';
      
      
      let language = '';
      if (codeEl) {
        const classNames = codeEl.className || '';
        const langMatch = classNames.match(/language-([a-zA-Z0-9_-]+)/);
        if (langMatch) {
          language = langMatch[1];
        }
      }
      
      if (!language) {
        
        const header = preEl.querySelector('.text-xs, div:first-child');
        if (header && header.textContent) {
          const langText = header.textContent.trim().toLowerCase();
          if (langText && !langText.includes('copy') && langText.length < 20) {
            language = langText;
          }
        }
      }

      if (codeContent.trim()) {
        blocks.push({
          type: 'code',
          language,
          code: codeContent.trim(),
        });
      }
      continue;
    }

    
    if (child.tagName === 'IMG') {
      const src = child.getAttribute('src');
      if (src) {
        blocks.push({ type: 'image', url: src, alt: child.getAttribute('alt') || undefined });
      }
      continue;
    }
    const imgEl = child.querySelector('img');
    if (imgEl) {
      const src = imgEl.getAttribute('src');
      if (src && !src.startsWith('data:image/svg+xml')) {
        blocks.push({ type: 'image', url: src, alt: imgEl.getAttribute('alt') || undefined });
      }
    }

    
    const fileEl = child.closest('[data-testid^="attachment-"]') || child.querySelector('[data-testid^="attachment-"]');
    if (fileEl) {
      const name = fileEl.textContent?.trim() || 'attached_file';
      blocks.push({ type: 'file', name });
      continue;
    }

    
    if (
      child.classList.contains('thought-details') ||
      child.getAttribute('data-testid') === 'thought-block' ||
      child.tagName === 'DETAILS'
    ) {
      continue;
    }

    
    const clone = child.cloneNode(true) as HTMLElement;
    
    clone
      .querySelectorAll('button, svg, [role="button"], .sr-only, details, [data-testid="thought-block"], .citation, sup')
      .forEach((el) => el.remove());
    const text = clone.textContent?.trim() || '';
    if (text) {
      blocks.push({
        type: 'text',
        text,
      });
    }
  }

  
  if (blocks.length === 0) {
    const raw = element.textContent?.trim() || '';
    if (raw) {
      blocks.push({ type: 'text', text: raw });
    }
  }

  return blocks;
}

import { ChatGPTCaptureStrategy } from './capture.ts';
import { CaptureOrchestrator } from '../../core/capture/orchestrator.ts';
import { attemptNetworkCapture } from './network-capture.ts';


export async function extractChatGPTConversation(
  doc: Document,
  options: ExtractionOptions = {}
): Promise<ExtractionResult> {
  const state = detectChatGPTState(doc);
  Logger.info('Extracting ChatGPT conversation', { isAvailable: state.isAvailable });

  
  if (state.conversationId) {
    try {
      const networkResult = await attemptNetworkCapture(location.href);

      if (networkResult && networkResult.messages.length > 0) {
        Logger.info('[PHERO] Network capture succeeded', {
          totalMessages: networkResult.messages.length,
          captureMethod: 'DATA_LEVEL',
        });

        return {
          conversation: {
            id: state.conversationId,
            title: networkResult.title || state.title || 'ChatGPT Conversation',
            sourceProvider: 'chatgpt',
            createdAt: Date.now(),
            messages: networkResult.messages,
            metadata: {
              url: doc.location?.href,
              totalDetectedTurns: networkResult.totalMessages,
              extractedTurns: networkResult.messages.length,
              isTruncated: false,
            },
          },
          isComplete: true,
          totalTurnsDetected: networkResult.totalMessages,
        };
      }

      Logger.info('[PHERO] Network capture returned no data, falling back to DOM capture');
    } catch (err) {
      Logger.warn('[PHERO] Network capture failed, falling back to DOM capture');
    }
  }

  
  const strategy = new ChatGPTCaptureStrategy();
  const captureResult = await CaptureOrchestrator.executeCapture(
    doc,
    strategy,
    {
      providerId: 'chatgpt',
      conversationId: state.conversationId,
      title: state.title,
    },
    {
      skipIncompleteCheck: options.skipIncompleteCheck,
      scrollDelayMs: options.scrollDelayMs,
    }
  );

  return {
    conversation: captureResult.conversation,
    isComplete: captureResult.isComplete,
    warning: captureResult.warning,
    totalTurnsDetected: captureResult.totalCaptured,
  };
}
