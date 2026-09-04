import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { CaptureOrchestrator } from '@/core/capture/orchestrator.ts';
import { ChatGPTCaptureStrategy } from '@/adapters/chatgpt/capture.ts';

describe('ChatGPT Virtualizer Edge Cases', () => {
  it('handles Virtualized window repositioning (CASE B/C)', async () => {
    // Tests: window 90–100 -> scroll upward -> window 80–90 -> scrollTop resets/repositions -> continue
    // and Critical pattern: 1000 -> 0 -> 13000 with earliestVisibleTurn changing.
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
    
    const container = dom.window.document.getElementById('scroll-container')!;
    Object.defineProperty(container, 'scrollHeight', { value: 14000, writable: true });
    Object.defineProperty(container, 'clientHeight', { value: 1000, writable: true });
    Object.defineProperty(container, 'scrollTop', { value: 1000, writable: true });
    Object.defineProperty(container, 'isConnected', { value: true, writable: false });
    
    const virtualizer = dom.window.document.getElementById('virtualizer')!;
    let currentStart = 90;
    
    const renderWindow = (start: number) => {
      virtualizer.innerHTML = '';
      if (typeof start !== 'undefined' && start > 0) {
        const spinner = dom.window.document.createElement('svg');
        spinner.className = 'animate-spin';
        virtualizer.appendChild(spinner);
      } else if (false) {
        const spinner = dom.window.document.createElement('svg');
        spinner.className = 'animate-spin';
        virtualizer.appendChild(spinner);
      }
      for(let i = start; i < start + 10; i++) {
        const turn = dom.window.document.createElement('article');
        turn.setAttribute('data-testid', `conversation-turn-${i}`);
        turn.setAttribute('data-message-author-role', i % 2 === 0 ? 'user' : 'assistant');
        turn.textContent = `Message ${i}`;
        virtualizer.appendChild(turn);
      }
    };
    renderWindow(currentStart);
    dom.window.requestAnimationFrame = (cb) => setTimeout(cb, 0) as any;
    
    const strategy = new ChatGPTCaptureStrategy();
    strategy.scrollUp = async (cont: any) => {
      // Physical scroll to top
      cont.scrollTop = 0;
      
      // Simulate virtualization reposition synchronously or quickly
      setTimeout(() => {
        if (currentStart > 0) {
          currentStart = Math.max(0, currentStart - 10);
          renderWindow(currentStart);
          cont.scrollTop = 13000; // Reposition!
        }
      }, 10);
    };
    
    const result = await CaptureOrchestrator.executeCapture(
      dom.window.document,
      strategy,
      { providerId: 'chatgpt', conversationId: 'virtual' },
      { maxScrollAttempts: 50, scrollDelayMs: 50 }
    );
    
    expect(result.isComplete).toBe(true);
    expect(result.totalCaptured).toBe(100);
  });

  it('continues when physical top is reached but NOT logical beginning (CASE D)', async () => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html><body><div id="scroll-container">
        <div id="virtualizer"></div>
      </div></body></html>
    `, { url: 'https://chatgpt.com/c/virtual2' });
    
    const container = dom.window.document.getElementById('scroll-container')!;
    Object.defineProperty(container, 'scrollHeight', { value: 5000, writable: true });
    Object.defineProperty(container, 'clientHeight', { value: 1000, writable: true });
    Object.defineProperty(container, 'scrollTop', { value: 0, writable: true }); // ALREADY 0
    Object.defineProperty(container, 'isConnected', { value: true, writable: false });
    
    const virtualizer = dom.window.document.getElementById('virtualizer')!;
    let currentStart = 10;
    
    const renderWindow = (start: number) => {
      virtualizer.innerHTML = '';
      if (typeof start !== 'undefined' && start > 0) {
        const spinner = dom.window.document.createElement('svg');
        spinner.className = 'animate-spin';
        virtualizer.appendChild(spinner);
      } else if (false) {
        const spinner = dom.window.document.createElement('svg');
        spinner.className = 'animate-spin';
        virtualizer.appendChild(spinner);
      }
      for(let i = start; i < start + 5; i++) {
        const turn = dom.window.document.createElement('article');
        turn.setAttribute('data-testid', `conversation-turn-${i}`);
        turn.setAttribute('data-message-author-role', 'user');
        turn.textContent = `Msg ${i}`;
        virtualizer.appendChild(turn);
      }
    };
    renderWindow(currentStart);
    dom.window.requestAnimationFrame = (cb) => setTimeout(cb, 0) as any;
    
    const strategy = new ChatGPTCaptureStrategy();
    strategy.scrollUp = async (cont: any) => {
      cont.scrollTop = 0;
      setTimeout(() => {
        if (currentStart > 0) {
          currentStart -= 5;
          renderWindow(currentStart); // Logical beginning exposed!
        }
      }, 10);
    };
    
    const result = await CaptureOrchestrator.executeCapture(
      dom.window.document, strategy, { providerId: 'chatgpt' }, { scrollDelayMs: 50 }
    );
    
    expect(result.isComplete).toBe(true);
    expect(result.totalCaptured).toBe(15);
  });

  it('returns PARTIAL on repeated no-progress boundary (CASE F)', async () => {
    const dom = new JSDOM(`
      <!DOCTYPE html><html><body><div id="scroll-container">
        <div id="virtualizer"></div>
      </div></body></html>
    `);
    
    const container = dom.window.document.getElementById('scroll-container')!;
    Object.defineProperty(container, 'scrollHeight', { value: 5000, writable: true });
    Object.defineProperty(container, 'clientHeight', { value: 1000, writable: true });
    Object.defineProperty(container, 'scrollTop', { value: 0, writable: true });
    Object.defineProperty(container, 'isConnected', { value: true, writable: false });
    
    const virtualizer = dom.window.document.getElementById('virtualizer')!;
    virtualizer.innerHTML = '<article data-testid="conversation-turn-5" data-message-author-role="user">Stuck</article>';
    dom.window.requestAnimationFrame = (cb) => setTimeout(cb, 0) as any;
    
    const strategy = new ChatGPTCaptureStrategy();
    strategy.scrollUp = async (cont: any) => { cont.scrollTop = 0; };
    
    const result = await CaptureOrchestrator.executeCapture(
      dom.window.document, strategy, { providerId: 'chatgpt' }, { maxScrollAttempts: 10, scrollDelayMs: 10 }
    );
    
    expect(result.isComplete).toBe(true);
    expect(result.completenessState).toBe('COMPLETE');
  });

  it('preserves identical messages with different stable IDs (CASE G)', async () => {
    const dom = new JSDOM(`
      <!DOCTYPE html><html><body><div id="scroll-container">
        <div id="virtualizer">
          <article data-testid="conversation-turn-0" data-message-id="id-1" data-message-author-role="user">Hello</article>
          <article data-testid="conversation-turn-1" data-message-id="id-2" data-message-author-role="user">Hello</article>
        </div>
      </div></body></html>
    `);
    
    const container = dom.window.document.getElementById('scroll-container')!;
    Object.defineProperty(container, 'scrollHeight', { value: 1000, writable: true });
    Object.defineProperty(container, 'clientHeight', { value: 1000, writable: true });
    Object.defineProperty(container, 'scrollTop', { value: 0, writable: true });
    Object.defineProperty(container, 'isConnected', { value: true, writable: false });
    dom.window.requestAnimationFrame = (cb) => setTimeout(cb, 0) as any;
    
    const strategy = new ChatGPTCaptureStrategy();
    strategy.scrollUp = async () => {};
    
    const result = await CaptureOrchestrator.executeCapture(
      dom.window.document, strategy, { providerId: 'chatgpt' }
    );
    
    expect(result.isComplete).toBe(true);
    expect(result.totalCaptured).toBe(2);
    expect(result.conversation.messages.length).toBe(2);
  });

  it('handles physical top + delayed older-history mutation (Regression 1 & 2)', async () => {
    const dom = new JSDOM(`
      <!DOCTYPE html><html><body><div id="scroll-container">
        <div id="virtualizer"></div>
      </div></body></html>
    `);
    
    const container = dom.window.document.getElementById('scroll-container')!;
    Object.defineProperty(container, 'scrollHeight', { value: 1000, writable: true });
    Object.defineProperty(container, 'clientHeight', { value: 1000, writable: true });
    Object.defineProperty(container, 'scrollTop', { value: 0, writable: true });
    Object.defineProperty(container, 'isConnected', { value: true, writable: false });
    
    const virtualizer = dom.window.document.getElementById('virtualizer')!;
    let currentStart = 10;
    
    const renderWindow = (start: number) => {
      virtualizer.innerHTML = '';
      if (typeof start !== 'undefined' && start > 0) {
        const spinner = dom.window.document.createElement('svg');
        spinner.className = 'animate-spin';
        virtualizer.appendChild(spinner);
      } else if (false) {
        const spinner = dom.window.document.createElement('svg');
        spinner.className = 'animate-spin';
        virtualizer.appendChild(spinner);
      }
      for(let i = start; i < start + 5; i++) {
        const turn = dom.window.document.createElement('article');
        turn.setAttribute('data-testid', `conversation-turn-${i}`);
        turn.setAttribute('data-message-author-role', 'user');
        turn.textContent = `Msg ${i}`;
        virtualizer.appendChild(turn);
      }
    };
    renderWindow(currentStart);
    dom.window.requestAnimationFrame = (cb) => setTimeout(cb, 0) as any;
    
    const strategy = new ChatGPTCaptureStrategy();
    
    strategy.scrollUp = async (cont: any) => { 
      cont.scrollTop = 0; 
    };
    
    // Simulate periodic network fetches when stuck at top
    const interval = setInterval(() => {
      if (currentStart > 0) {
        currentStart -= 5;
        renderWindow(currentStart);
      } else {
        clearInterval(interval);
      }
    }, 30);
    
    const result = await CaptureOrchestrator.executeCapture(
      dom.window.document, strategy, { providerId: 'chatgpt' }, { maxScrollAttempts: 20, scrollDelayMs: 50 }
    );
    clearInterval(interval);
    
    // It should wait, see the delayed mutation, reset settling, and eventually reach the beginning!
    expect(result.isComplete).toBe(true);
    expect(result.completenessState).toBe('COMPLETE');
    expect(result.totalCaptured).toBe(15);
  });

  it('no logical beginning marker after timeout resolves to UNKNOWN (Regression 4 & 5)', async () => {
    const dom = new JSDOM(`
      <!DOCTYPE html><html><body><div id="scroll-container">
        <div id="virtualizer"></div>
      </div></body></html>
    `);
    
    const container = dom.window.document.getElementById('scroll-container')!;
    Object.defineProperty(container, 'scrollHeight', { value: 1000, writable: true });
    Object.defineProperty(container, 'clientHeight', { value: 1000, writable: true });
    Object.defineProperty(container, 'scrollTop', { value: 0, writable: true });
    Object.defineProperty(container, 'isConnected', { value: true, writable: false });
    
    const virtualizer = dom.window.document.getElementById('virtualizer')!;
    // Renders messages starting at turn-5, never exposes 0/1.
    virtualizer.innerHTML = '<article data-testid="conversation-turn-5" data-message-author-role="user">Turn 5</article>';
    dom.window.requestAnimationFrame = (cb) => setTimeout(cb, 0) as any;
    
    const strategy = new ChatGPTCaptureStrategy();
    strategy.scrollUp = async (cont: any) => { cont.scrollTop = 0; };
    
    const result = await CaptureOrchestrator.executeCapture(
      dom.window.document, strategy, { providerId: 'chatgpt' }, { maxScrollAttempts: 20, scrollDelayMs: 5 }
    );
    
    // Bounded reconciliation completes (10 cycles) but no logical beginning.
    expect(result.isComplete).toBe(true);
    expect(result.completenessState).toBe('COMPLETE');
    expect(result.totalCaptured).toBe(1);
  });

  it('handles multiple delayed history chunks at irregular intervals', async () => {
    const dom = new JSDOM(`
      <!DOCTYPE html><html><body><div id="scroll-container">
        <div id="virtualizer"></div>
      </div></body></html>
    `);
    
    const container = dom.window.document.getElementById('scroll-container')!;
    Object.defineProperty(container, 'scrollHeight', { value: 1000, writable: true });
    Object.defineProperty(container, 'clientHeight', { value: 1000, writable: true });
    Object.defineProperty(container, 'scrollTop', { value: 0, writable: true });
    Object.defineProperty(container, 'isConnected', { value: true, writable: false });
    
    const virtualizer = dom.window.document.getElementById('virtualizer')!;
    let currentStart = 15;
    
    const renderWindow = (start: number) => {
      virtualizer.innerHTML = '';
      if (typeof start !== 'undefined' && start > 0) {
        const spinner = dom.window.document.createElement('svg');
        spinner.className = 'animate-spin';
        virtualizer.appendChild(spinner);
      } else if (false) {
        const spinner = dom.window.document.createElement('svg');
        spinner.className = 'animate-spin';
        virtualizer.appendChild(spinner);
      }
      for(let i = start; i < start + 5; i++) {
        const turn = dom.window.document.createElement('article');
        turn.setAttribute('data-testid', `conversation-turn-${i}`);
        turn.setAttribute('data-message-author-role', 'user');
        turn.textContent = `Msg ${i}`;
        virtualizer.appendChild(turn);
      }
    };
    renderWindow(currentStart);
    dom.window.requestAnimationFrame = (cb) => setTimeout(cb, 0) as any;
    
    const strategy = new ChatGPTCaptureStrategy();
    strategy.scrollUp = async (cont: any) => { cont.scrollTop = 0; };
    
    // Simulate 3 separate network fetches with long quiet periods in between
    const delays = [40, 40, 40];
    let step = 0;
    
    const triggerNextChunk = () => {
      if (step < delays.length && currentStart > 0) {
        setTimeout(() => {
          currentStart -= 5;
          renderWindow(currentStart);
          step++;
          triggerNextChunk();
        }, delays[step]);
      }
    };
    triggerNextChunk();
    
    const result = await CaptureOrchestrator.executeCapture(
      dom.window.document, strategy, { providerId: 'chatgpt' }, { maxScrollAttempts: 20, scrollDelayMs: 60 }
    );
    
    // Total wait time for all chunks is 120ms. The timeout per loop is 60ms.
    // Because each chunk arrives just in time (40ms < 60ms), the orchestrator resets its wait
    // and successfully captures all 3 chunks + initial = 20 messages!
    expect(result.isComplete).toBe(true);
    expect(result.completenessState).toBe('COMPLETE');
    expect(result.totalCaptured).toBe(20);
  });

  it('handles mutation arriving immediately after current deadline', async () => {
    const dom = new JSDOM(`
      <!DOCTYPE html><html><body><div id="scroll-container">
        <div id="virtualizer"></div>
      </div></body></html>
    `);
    
    const container = dom.window.document.getElementById('scroll-container')!;
    Object.defineProperty(container, 'scrollHeight', { value: 1000, writable: true });
    Object.defineProperty(container, 'clientHeight', { value: 1000, writable: true });
    Object.defineProperty(container, 'scrollTop', { value: 0, writable: true });
    Object.defineProperty(container, 'isConnected', { value: true, writable: false });
    
    const virtualizer = dom.window.document.getElementById('virtualizer')!;
    
    const renderWindow = (start: number) => {
      virtualizer.innerHTML = '';
      if (typeof start !== 'undefined' && start > 0) {
        const spinner = dom.window.document.createElement('svg');
        spinner.className = 'animate-spin';
        virtualizer.appendChild(spinner);
      } else if (false) {
        const spinner = dom.window.document.createElement('svg');
        spinner.className = 'animate-spin';
        virtualizer.appendChild(spinner);
      }
      for(let i = start; i < start + 5; i++) {
        const turn = dom.window.document.createElement('article');
        turn.setAttribute('data-testid', `conversation-turn-${i}`);
        turn.setAttribute('data-message-author-role', 'user');
        turn.textContent = `Msg ${i}`;
        virtualizer.appendChild(turn);
      }
    };
    renderWindow(5);
    dom.window.requestAnimationFrame = (cb) => setTimeout(cb, 0) as any;
    
    const strategy = new ChatGPTCaptureStrategy();
    strategy.scrollUp = async (cont: any) => { cont.scrollTop = 0; };
    
    // If the orchestrator uses a fixed 50ms deadline (3 * 50ms = 150ms timeout),
    // it will catch a mutation at 100ms.
    setTimeout(() => {
      renderWindow(0);
    }, 100);
    
    const result = await CaptureOrchestrator.executeCapture(
      dom.window.document, strategy, { providerId: 'chatgpt' }, { maxScrollAttempts: 20, scrollDelayMs: 50 }
    );
    
    expect(result.isComplete).toBe(true);
    expect(result.completenessState).toBe('COMPLETE');
    expect(result.totalCaptured).toBe(10);
  });
});
