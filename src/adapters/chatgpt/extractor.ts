import {
  NormalizedConversation,
  NormalizedMessage,
  ContentBlock,
  Role,
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

/**
 * Multi-tier extractor for ChatGPT conversations.
 */
export async function extractChatGPTConversation(
  doc: Document,
  _options: ExtractionOptions = {}
): Promise<ExtractionResult> {
  const state = detectChatGPTState(doc);
  Logger.info('Extracting ChatGPT conversation', { isAvailable: state.isAvailable });

  const messages: NormalizedMessage[] = [];
  let isComplete = state.isHistoryFullyLoaded ?? true;
  let warning: string | undefined;

  // Tier 1: Search for article[data-testid^="conversation-turn-"]
  let turnElements = Array.from(
    doc.querySelectorAll<HTMLElement>('article[data-testid^="conversation-turn-"]')
  );

  // Tier 2: Search for [data-message-author-role]
  if (turnElements.length === 0) {
    turnElements = Array.from(
      doc.querySelectorAll<HTMLElement>('[data-message-author-role]')
    );
  }

  // Tier 3: Search for .text-message / [data-testid="conversation-turn"] containers
  if (turnElements.length === 0) {
    turnElements = Array.from(
      doc.querySelectorAll<HTMLElement>('div.group\\/conversation-turn, div.w-full.text-token-text-primary')
    );
  }

  let turnIndex = 0;
  for (const turnEl of turnElements) {
    turnIndex++;
    // Determine author role
    let role: Role = 'user';
    const authorRoleAttr = turnEl.getAttribute('data-message-author-role');
    const testId = turnEl.getAttribute('data-testid') || '';

    if (authorRoleAttr === 'assistant' || authorRoleAttr === 'user' || authorRoleAttr === 'system') {
      role = authorRoleAttr;
    } else {
      // Check internal elements or classes
      const isAssistant =
        turnEl.querySelector('[data-message-author-role="assistant"]') ||
        turnEl.querySelector('.agent-turn') ||
        turnEl.querySelector('div.markdown') ||
        testId.includes('assistant');

      const isUser =
        turnEl.querySelector('[data-message-author-role="user"]') ||
        turnEl.querySelector('.user-turn') ||
        testId.includes('user');

      if (isAssistant) {
        role = 'assistant';
      } else if (isUser) {
        role = 'user';
      } else {
        // Alternate turns if unknown
        role = turnIndex % 2 === 1 ? 'user' : 'assistant';
      }
    }

    // Locate the message body inside the turn element
    const messageContainer =
      turnEl.querySelector<HTMLElement>('div.markdown, div.text-message, [data-message-author-role] > div, div.whitespace-pre-wrap') ||
      turnEl;

    const content = extractContentBlocksFromElement(messageContainer);

    if (content.length > 0) {
      messages.push({
        id: `turn-${turnIndex}`,
        role,
        content,
        timestamp: Date.now(),
      });
    }
  }

  // Check completeness
  if (!isComplete || (state.messageCount && messages.length < state.messageCount)) {
    isComplete = false;
    warning = 'Some earlier messages may not be loaded in the page view.';
  }

  const conversation: NormalizedConversation = {
    id: state.conversationId,
    title: state.title,
    sourceProvider: 'chatgpt',
    createdAt: Date.now(),
    messages,
    metadata: {
      url: doc.location?.href,
      totalDetectedTurns: state.messageCount || messages.length,
      extractedTurns: messages.length,
      isTruncated: !isComplete,
    },
  };

  Logger.info(`Extracted ${messages.length} messages from ChatGPT`, {
    isComplete,
    hasWarning: !!warning,
  });

  return {
    conversation,
    isComplete,
    warning,
    totalTurnsDetected: messages.length,
  };
}
