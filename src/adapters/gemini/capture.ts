import { NormalizedMessage, Role } from '../../core/models/conversation.ts';
import { ProviderCaptureStrategy } from '../../core/capture/types.ts';
import { extractGeminiContentBlocks } from './extractor.ts';

export class GeminiCaptureStrategy implements ProviderCaptureStrategy {
  public readonly providerId = 'gemini' as const;

  public captureCurrentVisibleMessages(doc: Document): NormalizedMessage[] {
    const messages: NormalizedMessage[] = [];

    // Search for unified conversation turn containers
    const turnElements = Array.from(
      doc.querySelectorAll<HTMLElement>(
        'conversation-turn, div[data-test-id="conversation-turn"], .conversation-turn'
      )
    );

    if (turnElements.length > 0) {
      let turnIndex = 0;
      for (const turnEl of turnElements) {
        turnIndex++;
        const isAssistant =
          turnEl.querySelector('model-response, .response-container, message-content, div.markdown') ||
          turnEl.classList.contains('model-turn');

        const role: Role = isAssistant ? 'assistant' : 'user';
        const bodyContainer =
          turnEl.querySelector<HTMLElement>(
            'message-content, .response-container, .query-content, div.markdown'
          ) || turnEl;

        const stableId =
          turnEl.getAttribute('data-test-id') ||
          turnEl.getAttribute('id') ||
          `gemini-turn-${turnIndex}`;

        const content = extractGeminiContentBlocks(bodyContainer);
        if (content.length > 0) {
          messages.push({
            id: stableId,
            role,
            content,
            timestamp: Date.now(),
          });
        }
      }
    } else {
      // Individual queries and responses
      const userElements = Array.from(
        doc.querySelectorAll<HTMLElement>(
          'user-query, .user-query-container, div[data-test-id="user-query"]'
        )
      );
      const assistantElements = Array.from(
        doc.querySelectorAll<HTMLElement>(
          'model-response, .response-container, div[data-test-id="model-response"]'
        )
      );

      const maxLen = Math.max(userElements.length, assistantElements.length);
      for (let i = 0; i < maxLen; i++) {
        if (userElements[i]) {
          const content = extractGeminiContentBlocks(userElements[i]);
          if (content.length > 0) {
            messages.push({
              id: `gemini-user-${i + 1}`,
              role: 'user',
              content,
              timestamp: Date.now(),
            });
          }
        }
        if (assistantElements[i]) {
          const content = extractGeminiContentBlocks(assistantElements[i]);
          if (content.length > 0) {
            messages.push({
              id: `gemini-assistant-${i + 1}`,
              role: 'assistant',
              content,
              timestamp: Date.now(),
            });
          }
        }
      }
    }

    return messages;
  }

  public isAtBeginning(doc: Document, _messages: NormalizedMessage[]): boolean {
    const topGreeting = doc.querySelector('div.greeting, .gemini-intro-title, div[data-test-id="conversation-title"]');
    if (topGreeting) return true;

    // Check if scroll container is at top
    const container = this.getScrollContainer(doc);
    if (container instanceof HTMLElement) {
      if (container.scrollTop <= 10) return true;
    }

    return true; // Gemini keeps full loaded conversation in DOM without removing earlier turns
  }

  public getScrollContainer(doc: Document): HTMLElement | Window {
    const scrollEl = doc.querySelector<HTMLElement>(
      'infinite-scroller, div.chat-history, div.conversation-container, main'
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
        const currentCount = doc.querySelectorAll('conversation-turn, user-query').length;
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
