import { NormalizedMessage, Role } from '../../core/models/conversation.ts';
import { ProviderCaptureStrategy } from '../../core/capture/types.ts';
import { extractContentBlocksFromElement } from './extractor.ts';
import { findActiveScrollContainer, executeScrollUp, getScrollMetrics } from '../../core/capture/scroll-helper.ts';

export class ChatGPTCaptureStrategy implements ProviderCaptureStrategy {
  public readonly providerId = 'chatgpt' as const;

  public captureCurrentVisibleMessages(doc: Document): NormalizedMessage[] {
    const messages: NormalizedMessage[] = [];

    // Search for turns
    let turnElements = Array.from(
      doc.querySelectorAll<HTMLElement>('article[data-testid^="conversation-turn-"]')
    );

    if (turnElements.length === 0) {
      turnElements = Array.from(
        doc.querySelectorAll<HTMLElement>('[data-message-author-role]')
      );
    }

    if (turnElements.length === 0) {
      turnElements = Array.from(
        doc.querySelectorAll<HTMLElement>('div.group\\/conversation-turn, div.w-full.text-token-text-primary')
      );
    }

    let idx = 0;
    for (const turnEl of turnElements) {
      idx++;
      let role: Role = 'user';
      const authorRoleAttr = turnEl.getAttribute('data-message-author-role');
      const testId = turnEl.getAttribute('data-testid') || '';
      const stableId = turnEl.getAttribute('data-message-id') || testId || `chatgpt-turn-${idx}`;

      if (authorRoleAttr === 'assistant' || authorRoleAttr === 'user' || authorRoleAttr === 'system') {
        role = authorRoleAttr;
      } else {
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
          role = idx % 2 === 1 ? 'user' : 'assistant';
        }
      }

      const messageContainer =
        turnEl.querySelector<HTMLElement>('div.markdown, div.text-message, [data-message-author-role] > div, div.whitespace-pre-wrap') ||
        turnEl;

      const content = extractContentBlocksFromElement(messageContainer);

      if (content.length > 0) {
        messages.push({
          id: stableId,
          role,
          content,
          timestamp: Date.now(),
        });
      }
    }

    return messages;
  }

  public isAtBeginning(doc: Document, messages: NormalizedMessage[]): boolean {
    const turns = doc.querySelectorAll('article[data-testid^="conversation-turn-"]');
    if (turns.length > 0) {
      const firstTurn = turns[0];
      const testId = firstTurn.getAttribute('data-testid') || '';
      const match = testId.match(/conversation-turn-(\d+)/);
      if (match) {
        const turnNum = parseInt(match[1], 10);
        if (turnNum <= 1) return true;
      }
    }

    const topElement = doc.querySelector('article[data-testid="conversation-turn-1"], article[data-testid="conversation-turn-0"]');
    if (topElement) return true;

    if (messages.some((m) => m.id.includes('turn-0') || m.id.includes('turn-1'))) {
      return true;
    }

    // Check if scroll container is at top and top turn is at top of container
    const container = this.getScrollContainer(doc);
    const metrics = getScrollMetrics(container, doc);
    if (metrics.isAtTop && turns.length > 0) {
      const firstTurn = turns[0];
      const rect = firstTurn.getBoundingClientRect();
      if (rect.top >= 0 && rect.top < 300) {
        // If first turn is at the top and container is scrolled all the way up
        const testId = firstTurn.getAttribute('data-testid') || '';
        if (testId.includes('turn-1') || testId.includes('turn-0')) {
          return true;
        }
      }
    }

    return false;
  }

  public getScrollContainer(doc: Document): HTMLElement | Window {
    const turnElements = Array.from(
      doc.querySelectorAll('article[data-testid^="conversation-turn-"], [data-message-author-role]')
    );
    return findActiveScrollContainer(doc, turnElements);
  }

  public async scrollUp(container: HTMLElement | Window): Promise<void> {
    const doc = (container instanceof HTMLElement ? container.ownerDocument : (typeof document !== 'undefined' ? document : null)) || document;
    const topTurn = doc.querySelector<HTMLElement>('article[data-testid^="conversation-turn-"], [data-message-author-role]');
    await executeScrollUp(doc, container, topTurn);
  }

  public async waitForNewMessages(doc: Document, previousCount: number, timeoutMs = 350): Promise<boolean> {
    const startTime = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        const currentTurns = doc.querySelectorAll('article[data-testid^="conversation-turn-"], [data-message-author-role]').length;
        if (currentTurns !== previousCount || Date.now() - startTime >= timeoutMs) {
          resolve(currentTurns !== previousCount);
          return;
        }
        requestAnimationFrame(check);
      };
      check();
    });
  }
}
