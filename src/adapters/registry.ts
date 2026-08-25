import { AIProviderAdapter } from './types.ts';
import { ProviderId } from '../core/models/conversation.ts';
import { ChatGPTAdapter } from './chatgpt/index.ts';
import { ClaudeAdapter } from './claude/index.ts';

export class AdapterRegistry {
  private static instance: AdapterRegistry;
  private adapters: Map<ProviderId, AIProviderAdapter> = new Map();

  private constructor() {
    this.register(new ChatGPTAdapter());
    this.register(new ClaudeAdapter());
  }

  public static getInstance(): AdapterRegistry {
    if (!AdapterRegistry.instance) {
      AdapterRegistry.instance = new AdapterRegistry();
    }
    return AdapterRegistry.instance;
  }

  public register(adapter: AIProviderAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  public getAdapter(id: ProviderId): AIProviderAdapter | undefined {
    return this.adapters.get(id);
  }

  public getAllAdapters(): AIProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  public findAdapterByUrl(url: URL): AIProviderAdapter | undefined {
    for (const adapter of this.adapters.values()) {
      if (adapter.matches(url)) {
        return adapter;
      }
    }
    return undefined;
  }

  public findAdapterByDocument(doc: Document): AIProviderAdapter | undefined {
    try {
      const url = new URL(doc.location?.href || 'https://unknown');
      return this.findAdapterByUrl(url);
    } catch {
      return undefined;
    }
  }
}
