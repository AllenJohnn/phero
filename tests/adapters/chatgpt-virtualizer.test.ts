import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { CaptureOrchestrator } from '@/core/capture/orchestrator.ts';
import { ChatGPTCaptureStrategy } from '@/adapters/chatgpt/capture.ts';

describe('ChatGPT Virtualizer Edge Cases', () => {
  it('correctly waits for logical boundary progress over physical scrolling loops', async () => {
    // Simulate a DOM with a scroll container and virtualizer
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="scroll-container" style="height: 1000px; overflow: auto;">
            <div id="virtualizer"></div>
          </div>
        </body>
      </html>
    `, { url: 'https://chatgpt.com/c/virtual' });
    
    // Mock the layout properties because JSDOM doesn't support them
    const container = dom.window.document.getElementById('scroll-container')!;
    Object.defineProperty(container, 'scrollHeight', { value: 5000, writable: true });
    Object.defineProperty(container, 'clientHeight', { value: 1000, writable: true });
    Object.defineProperty(container, 'scrollTop', { value: 4000, writable: true });
    Object.defineProperty(container, 'isConnected', { value: true, writable: false });
    
    // Helper to render a window
    const virtualizer = dom.window.document.getElementById('virtualizer')!;
    let currentStart = 80;
    
    const renderWindow = (start: number) => {
      virtualizer.innerHTML = '';
      for(let i = start; i < start + 20; i++) {
        const turn = dom.window.document.createElement('article');
        turn.setAttribute('data-testid', `conversation-turn-${i}`);
        turn.setAttribute('data-message-author-role', i % 2 === 0 ? 'user' : 'assistant');
        turn.textContent = `Message ${i}`;
        virtualizer.appendChild(turn);
      }
    };
    
    renderWindow(currentStart);
    
    // Polyfill window.requestAnimationFrame for MutationObserver debounce
    dom.window.requestAnimationFrame = (cb) => setTimeout(cb, 0) as any;
    
    const strategy = new ChatGPTCaptureStrategy();
    strategy.scrollUp = async (cont: any) => {
      if (cont.scrollTop) {
        cont.scrollTop = Math.max(0, cont.scrollTop - 1000);
      }
      
      // Simulate async network request and react reconciliation taking 300ms
      setTimeout(() => {
        if (currentStart > 0) {
          currentStart = Math.max(0, currentStart - 10);
          renderWindow(currentStart);
          
          if (currentStart === 0) {
             cont.scrollTop = 0; // Container hit top
          }
        }
      }, 300);
    };
    
    const start = Date.now();
    const result = await CaptureOrchestrator.executeCapture(
      dom.window.document,
      strategy,
      { providerId: 'chatgpt', conversationId: 'virtual' },
      { maxScrollAttempts: 50, scrollDelayMs: 0 } // Event-driven
    );
    
    const duration = Date.now() - start;
    
    expect(result.isComplete).toBe(true);
    expect(result.totalCaptured).toBe(100);
    expect(duration).toBeGreaterThanOrEqual(2000); // 8 steps * 300ms = 2400ms
    expect(result.capturedWindowsCount).toBeGreaterThan(5);
  });
});
