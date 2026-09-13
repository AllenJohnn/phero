import { ChatGPTAdapter } from './chatgpt/index.js';
import { ClaudeAdapter } from './claude/index.js';
import { GeminiAdapter } from './gemini/index.js';
export class AdapterRegistry {
  adapters = new Map();
  constructor() {
    this.register(new ChatGPTAdapter());
    this.register(new ClaudeAdapter());
    this.register(new GeminiAdapter());
  }
  static getInstance() {
    if (!AdapterRegistry.instance) {
      AdapterRegistry.instance = new AdapterRegistry();
    }
    return AdapterRegistry.instance;
  }
  register(adapter) {
    this.adapters.set(adapter.id, adapter);
  }
  getAdapter(id) {
    return this.adapters.get(id);
  }
  getAllAdapters() {
    return Array.from(this.adapters.values());
  }
  findAdapterByUrl(url) {
    for (const adapter of this.adapters.values()) {
      if (adapter.matches(url)) {
        return adapter;
      }
    }
    return undefined;
  }

}