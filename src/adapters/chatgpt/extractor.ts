import {
  ContentBlock,
} from '../../core/models/conversation.ts';
import { ExtractionOptions, ExtractionResult } from '../types.ts';
import { detectChatGPTState } from './detector.ts';
import { Logger } from '../../shared/logger.ts';

/**
 * Extracts code and text content blocks from a message turn element.
 */
export function extractContentBlocksFromElement(element: HTMLElement): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  // Find all children or nodes
  const children = Array.from(element.children) as HTMLElement[];

  if (children.length === 0) {
    const rawText = element.textContent?.trim() || '';
    if (rawText) {
      blocks.push({ type: 'text', text: rawText });
    }
    return blocks;
  }

  // Iterate over top-level markdown elements or code elements
  for (const child of children) {
    // Check if element is a code container / pre
    const preEl = child.tagName === 'PRE' ? child : child.querySelector('pre');
    if (preEl) {
      // Find code inside pre
      const codeEl = preEl.querySelector('code');
      const codeContent = codeEl ? codeEl.textContent || '' : preEl.textContent || '';
      
      // Determine language from class like class="language-typescript"
      let language = '';
      if (codeEl) {
        const classNames = codeEl.className || '';
        const langMatch = classNames.match(/language-([a-zA-Z0-9_-]+)/);
        if (langMatch) {
          language = langMatch[1];
        }
      }
      
      if (!language) {
        // Check for ChatGPT header inside pre that says "python" or "typescript"
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

    // Skip thought/reasoning elements
    if (
      child.classList.contains('thought-details') ||
      child.getAttribute('data-testid') === 'thought-block' ||
      child.tagName === 'DETAILS'
    ) {
      continue;
    }

    // Otherwise extract text, stripping utility/action buttons
    const clone = child.cloneNode(true) as HTMLElement;
    // Remove buttons, tooltips, SVGs, thought summaries, citations
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

  // Fallback if blocks is empty but container has text
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

/**
 * Multi-tier extractor for ChatGPT conversations.
 * PRIMARY: Attempts network-level capture from intercepted backend-api responses.
 * FALLBACK: Uses incremental scrolling and deduplication to recover virtualized history.
 */
export async function extractChatGPTConversation(
  doc: Document,
  options: ExtractionOptions = {}
): Promise<ExtractionResult> {
  const state = detectChatGPTState(doc);
  Logger.info('Extracting ChatGPT conversation', { isAvailable: state.isAvailable });

  // PRIMARY: Try network-level capture (instant, complete, no scrolling needed)
  if (state.conversationId) {
    try {
      const timeoutMs = options.networkTimeoutMs !== undefined ? options.networkTimeoutMs : 5000;
      const networkResult = await attemptNetworkCapture(doc, state.conversationId, timeoutMs);

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

  // FALLBACK: DOM-level capture with scroll-based recovery
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
