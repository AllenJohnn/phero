import { NormalizedMessage, Role } from '../../core/models/conversation.ts';
import { ProviderCaptureStrategy } from '../../core/capture/types.ts';
import { extractContentBlocksFromElement } from './extractor.ts';
import { findActiveScrollContainer, executeScrollUp, getVisibleTurnRange, VisibleTurnRange } from '../../core/capture/scroll-helper.ts';

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
      
      let stableId =
        turnEl.getAttribute('data-message-id') ||
        turnEl.querySelector('[data-message-id]')?.getAttribute('data-message-id') ||
        '';

      if (!stableId && /conversation-turn-\d+/.test(testId)) {
        stableId = testId;
      }

      if (!stableId) {
        stableId = `turn-fallback-${idx}`;
      }

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
    const turns = Array.from(
      doc.querySelectorAll<HTMLElement>('article[data-testid^="conversation-turn-"]')
    );

    // If conversation-turn-0 or conversation-turn-1 or conversation-turn-2 is present
    for (const turn of turns) {
      const testId = turn.getAttribute('data-testid') || '';
      const match = testId.match(/conversation-turn-(\d+)/);
      if (match) {
        const turnNum = parseInt(match[1], 10);
        if (turnNum <= 1) return true;
      }
    }

    // Check collected messages for true earliest turns
    if (messages.some((m) => /conversation-turn-[01]($|\b)/.test(m.id) || m.id === 'turn-1' || m.id === 'turn-0')) {
      return true;
    }

    const topElement = doc.querySelector('article[data-testid="conversation-turn-1"], article[data-testid="conversation-turn-0"]');
    if (topElement) return true;

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
    
    // Check if there is an active scroll container in case it shifted
    let activeContainer = container;
    if (container instanceof HTMLElement && (!container.isConnected || container.scrollHeight <= container.clientHeight)) {
      activeContainer = this.getScrollContainer(doc);
    }

    await executeScrollUp(doc, activeContainer);
  }

  public async waitForNewMessages(
    doc: Document,
    beforeTurnRange: VisibleTurnRange,
    timeoutMs = 2500
  ): Promise<boolean> {
    return new Promise((resolve) => {
      let timeoutId: any;
      let observer: MutationObserver;
      
      const check = () => {
        const currentRange = getVisibleTurnRange(doc);
        // Logical progress condition: The earliest turn ID has changed.
        if (
          (currentRange.earliestTurnId !== 'none' && currentRange.earliestTurnId !== beforeTurnRange.earliestTurnId) ||
          doc.querySelector('article[data-testid="conversation-turn-1"], article[data-testid="conversation-turn-0"]')
        ) {
          cleanup(true);
        }
      };

      const cleanup = (result: boolean) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (observer) observer.disconnect();
        resolve(result);
      };

      observer = new MutationObserver(() => {
        // Debounce slightly to avoid checking on every single node insertion
        requestAnimationFrame(() => check());
      });

      // Observe the document body for changes (handles container recreation)
      observer.observe(doc.body, { childList: true, subtree: true });

      // Initial check in case it changed synchronously
      check();

      timeoutId = setTimeout(() => {
        cleanup(false); // Timeout reached, no logical progress detected
      }, timeoutMs);
    });
  }
}
