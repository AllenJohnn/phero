import '@testing-library/jest-dom';

// Polyfill chrome extension APIs for testing environment
const mockStorageSession: Record<string, any> = {};
const mockStorageLocal: Record<string, any> = {};

(globalThis as any).chrome = {
  runtime: {
    id: 'phero-test-extension-id',
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    getURL: vi.fn((path: string) => `chrome-extension://phero-test-extension-id/${path}`),
  },
  tabs: {
    create: vi.fn(async (props: any) => ({ id: 123, ...props })),
    update: vi.fn(async (id: number, props: any) => ({ id, ...props })),
    get: vi.fn(async (id: number) => ({ id, status: 'complete' })),
    sendMessage: vi.fn(),
  },
  storage: {
    session: {
      get: vi.fn(async (keys?: string | string[] | null) => {
        if (!keys) return { ...mockStorageSession };
        if (typeof keys === 'string') return { [keys]: mockStorageSession[keys] };
        const res: Record<string, any> = {};
        for (const k of keys) res[k] = mockStorageSession[k];
        return res;
      }),
      set: vi.fn(async (items: Record<string, any>) => {
        Object.assign(mockStorageSession, items);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete mockStorageSession[k];
      }),
      clear: vi.fn(async () => {
        for (const k of Object.keys(mockStorageSession)) delete mockStorageSession[k];
      }),
    },
    local: {
      get: vi.fn(async (keys?: string | string[] | null) => {
        if (!keys) return { ...mockStorageLocal };
        if (typeof keys === 'string') return { [keys]: mockStorageLocal[keys] };
        const res: Record<string, any> = {};
        for (const k of keys) res[k] = mockStorageLocal[k];
        return res;
      }),
      set: vi.fn(async (items: Record<string, any>) => {
        Object.assign(mockStorageLocal, items);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete mockStorageLocal[k];
      }),
    },
  },
};
