import '@testing-library/jest-dom';

// JSDOM scroll polyfills
if (typeof window !== 'undefined') {
  if (!window.scrollTo) {
    window.scrollTo = vi.fn();
  }
  if (!window.scrollBy) {
    window.scrollBy = vi.fn();
  }
}

// Polyfill chrome extension APIs for testing environment
const mockStorageSession = {};
const mockStorageLocal = {};
globalThis.chrome = {
  runtime: {
    id: 'phero-test-extension-id',
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    },
    getURL: vi.fn(path => `chrome-extension://phero-test-extension-id/${path}`)
  },
  tabs: {
    create: vi.fn(async props => ({
      id: 123,
      ...props
    })),
    update: vi.fn(async (id, props) => ({
      id,
      ...props
    })),
    get: vi.fn(async id => ({
      id,
      status: 'complete'
    })),
    sendMessage: vi.fn()
  },
  storage: {
    session: {
      get: vi.fn(async keys => {
        if (!keys) return {
          ...mockStorageSession
        };
        if (typeof keys === 'string') return {
          [keys]: mockStorageSession[keys]
        };
        const res = {};
        for (const k of keys) res[k] = mockStorageSession[k];
        return res;
      }),
      set: vi.fn(async items => {
        Object.assign(mockStorageSession, items);
      }),
      remove: vi.fn(async keys => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete mockStorageSession[k];
      }),
      clear: vi.fn(async () => {
        for (const k of Object.keys(mockStorageSession)) delete mockStorageSession[k];
      })
    },
    local: {
      get: vi.fn(async keys => {
        if (!keys) return {
          ...mockStorageLocal
        };
        if (typeof keys === 'string') return {
          [keys]: mockStorageLocal[keys]
        };
        const res = {};
        for (const k of keys) res[k] = mockStorageLocal[k];
        return res;
      }),
      set: vi.fn(async items => {
        Object.assign(mockStorageLocal, items);
      }),
      remove: vi.fn(async keys => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete mockStorageLocal[k];
      })
    }
  }
};