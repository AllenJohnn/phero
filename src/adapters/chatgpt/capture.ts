import { NormalizedMessage, Role } from '../../core/models/conversation.ts';
import { ProviderCaptureStrategy } from '../../core/capture/types.ts';
import { extractContentBlocksFromElement } from './extractor.ts';
import { findActiveScrollContainer, executeScrollUp, getVisibleTurnRange, VisibleTurnRange, getScrollMetrics } from '../../core/capture/scroll-helper.ts';

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

  public isAtBeginning(doc: Document, _messages: NormalizedMessage[]): boolean {
    const container = this.getScrollContainer(doc);
    const metrics = getScrollMetrics(container, doc);

    // If we are not at physical top, we haven't reached the beginning
    if (!metrics.isAtTop) {
      return false;
    }

    // Check for explicit loading spinners or "loading earlier" elements
    const searchRoot = (container instanceof HTMLElement) ? container : doc.querySelector('main') || doc.body;
    if (searchRoot) {
      const loadingEl = searchRoot.querySelector(
        'svg.animate-spin, [data-testid*="loading"], [data-testid*="spinner"]'
      );
      if (loadingEl) return false;
    }

    // Evidence: we are at the top, and there is no loading spinner.
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
          doc.querySelector('article[data-testid="conversation-turn-4"], article[data-testid="conversation-turn-3"], article[data-testid="conversation-turn-2"], article[data-testid="conversation-turn-1"], article[data-testid="conversation-turn-0"]')
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
