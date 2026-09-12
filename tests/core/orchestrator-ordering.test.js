import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { CaptureOrchestrator } from '@/core/capture/orchestrator.js';
import { ChatGPTCaptureStrategy } from '@/adapters/chatgpt/capture.js';

describe('Orchestrator message ordering across scroll passes', () => {
  it('maintains chronological order after multiple scroll-up captures', async () => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="scroll-container" style="height: 1000px; overflow: auto;">
            <div id="virtualizer"></div>
          </div>
        </body>
      </html>
    `, { url: 'https://chatgpt.com/c/order-test' });

    const container = dom.window.document.getElementById('scroll-container');
    Object.defineProperty(container, 'scrollHeight', { value: 14000, writable: true });
    Object.defineProperty(container, 'clientHeight', { value: 1000, writable: true });
    Object.defineProperty(container, 'scrollTop', { value: 1000, writable: true });
    Object.defineProperty(container, 'isConnected', { value: true, writable: false });

    const virtualizer = dom.window.document.getElementById('virtualizer');
    let currentStart = 20;

    const renderWindow = (start) => {
      virtualizer.innerHTML = '';
      if (start > 0) {
        const spinner = dom.window.document.createElement('svg');
        spinner.className = 'animate-spin';
        virtualizer.appendChild(spinner);
      }
      for (let i = start; i < start + 10; i++) {
        const turn = dom.window.document.createElement('article');
        turn.setAttribute('data-testid', `conversation-turn-${i}`);
        turn.setAttribute('data-message-id', `msg-${i}`);
        turn.setAttribute('data-message-author-role', i % 2 === 0 ? 'user' : 'assistant');
        turn.textContent = `Message content ${i}`;
        virtualizer.appendChild(turn);
      }
    };

    renderWindow(currentStart);
    dom.window.requestAnimationFrame = (cb) => setTimeout(cb, 0);

    const strategy = new ChatGPTCaptureStrategy();
    strategy.scrollUp = async (cont) => {
      cont.scrollTop = 0;
      // Simulate virtualization: render new window after a small delay (during waitForNewMessages)
      setTimeout(() => {
        if (currentStart > 0) {
          currentStart = Math.max(0, currentStart - 10);
          renderWindow(currentStart);
          cont.scrollTop = 13000;
        }
      }, 10);
    };

    const result = await CaptureOrchestrator.executeCapture(
      dom.window.document,
      strategy,
      { providerId: 'chatgpt', conversationId: 'order-test' },
      { maxScrollAttempts: 50, scrollDelayMs: 50 }
    );

    expect(result.isComplete).toBe(true);
    expect(result.totalCaptured).toBe(30);

    // Verify chronological order: message IDs should be in ascending order
    const messageIds = result.conversation.messages.map(m => {
      const match = m.id.match(/msg-(\d+)/);
      return match ? parseInt(match[1], 10) : -1;
    }).filter(id => id >= 0);

    for (let i = 1; i < messageIds.length; i++) {
      expect(messageIds[i]).toBeGreaterThan(messageIds[i - 1]);
    }
  });

  it('preserves order when newer batch comes first (matching orchestrator call site)', async () => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="scroll-container">
            <div id="virtualizer"></div>
          </div>
        </body>
      </html>
    `, { url: 'https://chatgpt.com/c/order-test-2' });

    const container = dom.window.document.getElementById('scroll-container');
    Object.defineProperty(container, 'scrollHeight', { value: 5000, writable: true });
    Object.defineProperty(container, 'clientHeight', { value: 1000, writable: true });
    Object.defineProperty(container, 'scrollTop', { value: 1000, writable: true });
    Object.defineProperty(container, 'isConnected', { value: true, writable: false });

    const virtualizer = dom.window.document.getElementById('virtualizer');
    let currentStart = 10;

    const renderWindow = (start) => {
      virtualizer.innerHTML = '';
      if (start > 0) {
        const spinner = dom.window.document.createElement('svg');
        spinner.className = 'animate-spin';
        virtualizer.appendChild(spinner);
      }
      for (let i = start; i < start + 5; i++) {
        const turn = dom.window.document.createElement('article');
        turn.setAttribute('data-testid', `conversation-turn-${i}`);
        turn.setAttribute('data-message-id', `msg-${i}`);
        turn.setAttribute('data-message-author-role', i % 2 === 0 ? 'user' : 'assistant');
        turn.textContent = `Content ${i}`;
        virtualizer.appendChild(turn);
      }
    };

    renderWindow(currentStart);
    dom.window.requestAnimationFrame = (cb) => setTimeout(cb, 0);

    const strategy = new ChatGPTCaptureStrategy();
    strategy.scrollUp = async (cont) => {
      cont.scrollTop = 0;
      setTimeout(() => {
        if (currentStart > 0) {
          currentStart -= 5;
          renderWindow(currentStart);
        }
      }, 10);
    };

    const result = await CaptureOrchestrator.executeCapture(
      dom.window.document,
      strategy,
      { providerId: 'chatgpt', conversationId: 'order-test-2' },
      { maxScrollAttempts: 20, scrollDelayMs: 50 }
    );

    expect(result.isComplete).toBe(true);
    expect(result.totalCaptured).toBe(15);

    // Verify the messages are in ascending ID order even though
    // the orchestrator calls deduplicateMessagesWithAudit(newBatch, collectedMessages)
    const ids = result.conversation.messages.map(m => {
      const match = m.id.match(/msg-(\d+)/);
      return match ? parseInt(match[1], 10) : -1;
    }).filter(id => id >= 0);

    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]).toBeGreaterThan(ids[i - 1]);
    }
  });
});
