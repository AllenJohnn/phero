import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock chrome.runtime
global.chrome = {
  runtime: {
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    sendMessage: vi.fn(),
  }
} as any;

// Mock InjectionCoordinator
vi.mock('../src/content/injection-coordinator.ts', () => ({
  InjectionCoordinator: {
    checkAndPerformInjection: vi.fn(),
  }
}));

// Mock FloatingPill mounting
let mountCount = 0;
let unmountCount = 0;
vi.mock('../src/ui/floating-action/mount.ts', () => ({
  mountFloatingPill: vi.fn(() => {
    mountCount++;
    const host = document.createElement('div');
    host.id = 'phero-floating-host';
    document.body.appendChild(host);
    return () => {
      unmountCount++;
      host.remove();
    };
  })
}));

// We need to import the content script to trigger its initialization
// Because it executes immediately, we can just dynamic import it or re-require it
describe('Content Script Lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mountCount = 0;
    unmountCount = 0;
    document.body.innerHTML = '';
    // Set URL to ChatGPT
    Object.defineProperty(window, 'location', {
      value: new URL('https://chatgpt.com/c/123'),
      writable: true,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('mounts PHERO pill, survives host removal, and handles SPA navigation', async () => {
    // 1. Load the module to trigger initialization
    await import('../src/content/index.ts?t=' + Date.now());

    // Initial mount
    expect(mountCount).toBe(1);
    expect(document.getElementById('phero-floating-host')).not.toBeNull();

    // 2. Simulate ChatGPT removing the host (hydration)
    document.getElementById('phero-floating-host')?.remove();
    expect(document.getElementById('phero-floating-host')).toBeNull();

    // Advance time by 1s to trigger lifecycle interval
    vi.advanceTimersByTime(1100);

    // 3. PHERO safely remounts
    expect(mountCount).toBe(2);
    expect(unmountCount).toBe(1); // the previous instance's unmount is called
    expect(document.getElementById('phero-floating-host')).not.toBeNull();

    // 4. No duplicate hosts if we just advance time
    vi.advanceTimersByTime(2000);
    expect(mountCount).toBe(2); // Still 2
    expect(document.querySelectorAll('#phero-floating-host').length).toBe(1);

    // 5. Simulate SPA navigation to unsupported URL
    Object.defineProperty(window, 'location', {
      value: new URL('https://example.com'),
      writable: true,
    });

    vi.advanceTimersByTime(1100);

    // Should unmount
    expect(unmountCount).toBe(2);
    expect(document.getElementById('phero-floating-host')).toBeNull();

    // Simulate SPA navigation to another supported URL (Claude)
    Object.defineProperty(window, 'location', {
      value: new URL('https://claude.ai/chat/456'),
      writable: true,
    });

    vi.advanceTimersByTime(1100);

    // Should mount for new provider
    expect(mountCount).toBe(3);
    expect(document.getElementById('phero-floating-host')).not.toBeNull();
  });
});
