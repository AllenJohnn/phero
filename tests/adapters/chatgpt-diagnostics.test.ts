import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '../../src/shared/logger.ts';
import { startManualScrollDiagnostics, resetDiagnostics } from '../../src/adapters/chatgpt/diagnostics.ts';

describe('ChatGPT Manual Scroll Diagnostics v2', () => {
  beforeEach(() => {
    resetDiagnostics();
    vi.useFakeTimers();
    vi.spyOn(Logger, 'info').mockImplementation(() => {});
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    document.body.innerHTML = '';
  });

  afterEach(() => {
    resetDiagnostics();
    vi.clearAllTimers();
    vi.restoreAllMocks();
  });

  it('captures wheel events and detects element scroll (CASE A)', () => {
    document.body.innerHTML = `
      <div id="wrapper" class="wrapper-class">
        <div id="scroll-container" class="scroll-class">
          <div style="height: 500px;">
            <article data-testid="conversation-turn-1"></article>
          </div>
        </div>
      </div>
    `;
    const container = document.getElementById('scroll-container')!;
    
    // Setup getters
    Object.defineProperty(container, 'scrollTop', { value: 0, writable: true });
    Object.defineProperty(container, 'scrollHeight', { value: 500 });
    Object.defineProperty(container, 'clientHeight', { value: 100 });
    
    startManualScrollDiagnostics(document);

    // Simulate wheel event with composed path
    const wheelEvent = new WheelEvent('wheel');
    Object.defineProperty(wheelEvent, 'composedPath', {
      value: () => [container, document.body, document.documentElement, document]
    });

    // Fire wheel event
    window.dispatchEvent(wheelEvent);
    
    // Simulate scroll happening immediately after wheel
    container.scrollTop = 50;

    // Fast-forward timeout
    vi.advanceTimersByTime(250);

    expect(Logger.info).toHaveBeenCalledWith('[PHERO DIAGNOSTIC]', expect.objectContaining({
      event: 'WHEEL_TRANSITION',
      mechanismCase: 'CASE A: ELEMENT_SCROLL',
      targetStructuralIdentity: 'DIV.scroll-class',
      scrollTopBefore: 0,
      scrollTopAfter: 50,
      scrollHeightBefore: 500,
      scrollHeightAfter: 500,
      clientHeight: 100
    }));
  });

  it('detects window/document scrolling (CASE B)', () => {
    document.body.innerHTML = `
      <div>
        <article data-testid="conversation-turn-1"></article>
      </div>
    `;
    
    // Mock window scrollY
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
    
    startManualScrollDiagnostics(document);

    const wheelEvent = new WheelEvent('wheel');
    Object.defineProperty(wheelEvent, 'composedPath', {
      value: () => [document.body, document.documentElement, document]
    });

    window.dispatchEvent(wheelEvent);
    
    // Simulate window scroll
    Object.defineProperty(window, 'scrollY', { value: 100, writable: true, configurable: true });

    vi.advanceTimersByTime(250);

    expect(Logger.info).toHaveBeenCalledWith('[PHERO DIAGNOSTIC]', expect.objectContaining({
      event: 'WHEEL_TRANSITION',
      mechanismCase: 'CASE B: WINDOW_DOCUMENT_SCROLL',
      targetStructuralIdentity: 'Window/Document',
      scrollTopBefore: 0,
      scrollTopAfter: 100
    }));
  });

  it('detects container replacement (CASE E)', () => {
    // We will fire two wheel events on two different elements that scroll.
    document.body.innerHTML = `
      <div id="container1" class="c1"></div>
    `;
    const c1 = document.getElementById('container1')!;
    Object.defineProperty(c1, 'scrollTop', { value: 0, writable: true });
    
    startManualScrollDiagnostics(document);

    const wheel1 = new WheelEvent('wheel');
    Object.defineProperty(wheel1, 'composedPath', { value: () => [c1] });
    window.dispatchEvent(wheel1);
    
    c1.scrollTop = 10;
    vi.advanceTimersByTime(250);
    
    // Now second wheel on a different element
    document.body.innerHTML = `
      <div id="container2" class="c2"></div>
    `;
    const c2 = document.getElementById('container2')!;
    Object.defineProperty(c2, 'scrollTop', { value: 0, writable: true });
    
    const wheel2 = new WheelEvent('wheel');
    Object.defineProperty(wheel2, 'composedPath', { value: () => [c2] });
    window.dispatchEvent(wheel2);
    
    c2.scrollTop = 20;
    vi.advanceTimersByTime(250);

    expect(Logger.info).toHaveBeenCalledWith('[PHERO] DIAGNOSTIC CONTAINER_CHANGED', expect.objectContaining({
      oldStructuralIdentity: 'DIV.c1',
      newStructuralIdentity: 'DIV.c2',
      newScrollTop: 20
    }));
  });

  it('logs STANDALONE_MUTATION when mutation happens without wheel', async () => {
    startManualScrollDiagnostics(document);
    
    // Simulate mutation
    const div = document.createElement('div');
    document.body.appendChild(div);
    
    await Promise.resolve();
    vi.advanceTimersByTime(600); // Wait for debounce
    
    expect(Logger.info).toHaveBeenCalledWith('[PHERO DIAGNOSTIC]', expect.objectContaining({
      event: 'STANDALONE_MUTATION',
      mutationObserved: true
    }));
  });

  it('detects CASE C when mutation happens during wheel but no scroll', async () => {
    document.body.innerHTML = `
      <div id="container1"></div>
    `;
    const c1 = document.getElementById('container1')!;
    Object.defineProperty(c1, 'scrollTop', { value: 0, writable: true });
    
    startManualScrollDiagnostics(document);

    const wheel = new WheelEvent('wheel');
    Object.defineProperty(wheel, 'composedPath', { value: () => [c1] });
    window.dispatchEvent(wheel);
    
    // Mutate
    document.body.appendChild(document.createElement('span'));
    await Promise.resolve();
    
    // No scrollTop change!
    vi.advanceTimersByTime(250);
    
    expect(Logger.info).toHaveBeenCalledWith('[PHERO DIAGNOSTIC]', expect.objectContaining({
      event: 'WHEEL_TRANSITION',
      mechanismCase: 'CASE C: NO_SCROLL_BUT_MUTATIONS',
      mutationObserved: true
    }));
  });
  
  it('does not log PII text', () => {
    document.body.innerHTML = `
      <div class="c1">
        <article data-testid="conversation-turn-1">SECRET_DATA</article>
      </div>
    `;
    const c1 = document.querySelector('.c1')!;
    Object.defineProperty(c1, 'scrollTop', { value: 0, writable: true });
    
    startManualScrollDiagnostics(document);
    
    const wheel = new WheelEvent('wheel');
    Object.defineProperty(wheel, 'composedPath', { value: () => [c1] });
    window.dispatchEvent(wheel);
    
    c1.scrollTop = 10;
    vi.advanceTimersByTime(250);
    
    const logs = (Logger.info as any).mock.calls.map((call: any[]) => JSON.stringify(call)).join(' ');
    expect(logs).not.toContain('SECRET_DATA');
  });
});
