import { NormalizedMessage, Role } from '../../core/models/conversation.ts';
import { ProviderCaptureStrategy } from '../../core/capture/types.ts';
import { extractClaudeContentBlocks } from './extractor.ts';

export class ClaudeCaptureStrategy implements ProviderCaptureStrategy {
  public readonly providerId = 'claude' as const;

  public captureCurrentVisibleMessages(doc: Document): NormalizedMessage[] {
    const messages: NormalizedMessage[] = [];

    // Structured turn containers
    let turnElements = Array.from(
      doc.querySelectorAll<HTMLElement>(
        'div[data-test-render-count], div[data-testid="chat-message"]'
      )
    );

    if (turnElements.length === 0) {
      turnElements = Array.from(
        doc.querySelectorAll<HTMLElement>('div.group\\/message')
      );
    }

    if (turnElements.length > 0) {
      let turnIndex = 0;
      for (const turnEl of turnElements) {
        turnIndex++;
        const isAssistant =
          !!turnEl.querySelector('.font-claude-message') ||
          !!turnEl.querySelector('div.standard-markdown') ||
          turnEl.classList.contains('font-claude-message') ||
          !!turnEl.querySelector('[data-message-author-role="assistant"]') ||
          !!turnEl.querySelector('.agent-turn');

        const isUser =
          !!turnEl.querySelector('.font-user-message') ||
          !!turnEl.querySelector('[data-message-author-role="user"]') ||
          turnEl.classList.contains('font-user-message');

        let role: Role;
        if (isAssistant) {
          role = 'assistant';
        } else if (isUser) {
          role = 'user';
        } else {
          role = turnIndex % 2 === 1 ? 'user' : 'assistant';
        }

        const stableId =
          turnEl.getAttribute('data-message-id') ||
          turnEl.getAttribute('data-testid') ||
          `claude-turn-${turnIndex}`;

        const blocks = extractClaudeContentBlocks(turnEl);
        if (blocks.length > 0) {
          messages.push({
            id: stableId,
            role,
            content: blocks,
            timestamp: Date.now(),
          });
        }
      }
    } else {
      // Fallback
      const userTurns = Array.from(
        doc.querySelectorAll<HTMLElement>(
          '.font-user-message, div[data-is-streaming="false"]:has(.font-user-message), div.whitespace-pre-wrap'
        )
      );
      const assistantTurns = Array.from(
        doc.querySelectorAll<HTMLElement>(
          '.font-claude-message, div.standard-markdown'
        )
      );

      const maxLen = Math.max(userTurns.length, assistantTurns.length);
      for (let i = 0; i < maxLen; i++) {
        if (userTurns[i]) {
          const blocks = extractClaudeContentBlocks(userTurns[i]);
          if (blocks.length > 0) {
            messages.push({
              id: `claude-user-${i + 1}`,
              role: 'user',
              content: blocks,
              timestamp: Date.now(),
            });
          }
        }
        if (assistantTurns[i]) {
          const blocks = extractClaudeContentBlocks(assistantTurns[i]);
          if (blocks.length > 0) {
            messages.push({
              id: `claude-assistant-${i + 1}`,
              role: 'assistant',
              content: blocks,
              timestamp: Date.now(),
            });
          }
        }
      }
    }

    return messages;
  }

  public isAtBeginning(doc: Document, _messages: NormalizedMessage[]): boolean {
    // Check if there is a "Load earlier messages" button
    const loadMoreBtn = doc.querySelector('button[data-testid="load-more-messages"], .load-earlier-messages');
    if (loadMoreBtn) {
      return false;
    }

    // Check if chat top header or conversation title banner is at the top of scroll view
    const topMarker = doc.querySelector('[data-testid="chat-title"], h1.chat-title, .chat-start-marker');
    if (topMarker) {
      return true;
    }

    return true; // If no pagination button exists, DOM typically holds all loaded messages
  }

  public getScrollContainer(doc: Document): HTMLElement | Window {
    const scrollEl = doc.querySelector<HTMLElement>(
      'div.overflow-y-auto, [data-testid="scroll-container"], main div.flex-1.overflow-y-auto'
    );
    return scrollEl || (typeof window !== 'undefined' ? window : (doc.documentElement as any));
  }

  public async scrollUp(container: HTMLElement | Window): Promise<void> {
    if (container instanceof HTMLElement) {
      container.scrollTop = Math.max(0, container.scrollTop - 1000);
    } else if (typeof window !== 'undefined') {
      window.scrollBy({ top: -1000, behavior: 'smooth' });
    }
  }

  public async waitForNewMessages(doc: Document, previousCount: number, timeoutMs = 300): Promise<boolean> {
    const startTime = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        const currentCount = doc.querySelectorAll('div[data-test-render-count], div.group\\/message').length;
        if (currentCount !== previousCount || Date.now() - startTime >= timeoutMs) {
          resolve(currentCount !== previousCount);
          return;
        }
        requestAnimationFrame(check);
      };
      check();
    });
  }
}
