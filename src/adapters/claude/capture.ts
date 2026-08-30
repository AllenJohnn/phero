import { NormalizedMessage, Role } from '../../core/models/conversation.ts';
import { ProviderCaptureStrategy } from '../../core/capture/types.ts';
import { extractClaudeContentBlocks } from './extractor.ts';
import { findActiveScrollContainer, executeScrollUp, getScrollMetrics } from '../../core/capture/scroll-helper.ts';

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
    // 1. If load earlier messages button exists, we are definitely NOT at the beginning
    const loadMoreBtn = doc.querySelector('button[data-testid="load-more-messages"], .load-earlier-messages, [data-testid="load-earlier-turns"]');
    if (loadMoreBtn) {
      return false;
    }

    // 2. Check if scroll container is at top
    const container = this.getScrollContainer(doc);
    const metrics = getScrollMetrics(container, doc);

    // 3. If scroll container is scrolled down, we have not reached the top
    if (!metrics.isAtTop) {
      return false;
    }

    // 4. Check if top header or start marker is visible
    const topMarker = doc.querySelector('[data-testid="chat-title"], h1.chat-title, .chat-start-marker, div[data-testid="conversation-header"]');
    if (topMarker) {
      return true;
    }

    // If scrollTop <= 5, we are at the top of the scroll container
    return metrics.isAtTop;
  }

  public getScrollContainer(doc: Document): HTMLElement | Window {
    const turnElements = Array.from(
      doc.querySelectorAll('div[data-test-render-count], div[data-testid="chat-message"], div.group\\/message')
    );
    return findActiveScrollContainer(doc, turnElements);
  }

  public async scrollUp(container: HTMLElement | Window): Promise<void> {
    const doc = (container instanceof HTMLElement ? container.ownerDocument : (typeof document !== 'undefined' ? document : null)) || document;
    const topTurn = doc.querySelector<HTMLElement>('div[data-test-render-count], div[data-testid="chat-message"], div.group\\/message');
    await executeScrollUp(doc, container, topTurn);
  }

  public async waitForNewMessages(doc: Document, previousCount: number, timeoutMs = 350): Promise<boolean> {
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
