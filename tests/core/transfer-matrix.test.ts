import { describe, it, expect } from 'vitest';
import { AdapterRegistry } from '@/adapters/registry.ts';
import { ProviderId } from '@/core/models/conversation.ts';

describe('Six-Way Destination Transfer Matrix', () => {
  const registry = AdapterRegistry.getInstance();

  it('registers all 3 AI provider adapters', () => {
    const adapters = registry.getAllAdapters();
    expect(adapters.length).toBe(3);
    expect(adapters.map((a) => a.id).sort()).toEqual(['chatgpt', 'claude', 'gemini'].sort());
  });

  it('ChatGPT adapter exposes exactly Claude and Gemini as destinations', () => {
    const chatgpt = registry.getAdapter('chatgpt');
    expect(chatgpt).toBeDefined();
    expect(chatgpt?.supportedDestinations.sort()).toEqual(['claude', 'gemini'].sort());
    expect(chatgpt?.supportedDestinations).not.toContain('chatgpt');
  });

  it('Claude adapter exposes exactly ChatGPT and Gemini as destinations', () => {
    const claude = registry.getAdapter('claude');
    expect(claude).toBeDefined();
    expect(claude?.supportedDestinations.sort()).toEqual(['chatgpt', 'gemini'].sort());
    expect(claude?.supportedDestinations).not.toContain('claude');
  });

  it('Gemini adapter exposes exactly ChatGPT and Claude as destinations', () => {
    const gemini = registry.getAdapter('gemini');
    expect(gemini).toBeDefined();
    expect(gemini?.supportedDestinations.sort()).toEqual(['chatgpt', 'claude'].sort());
    expect(gemini?.supportedDestinations).not.toContain('gemini');
  });

  it('verifies all 6 directed pairwise transfers are validly configured', () => {
    const expectedPairs: [ProviderId, ProviderId][] = [
      ['chatgpt', 'claude'],
      ['chatgpt', 'gemini'],
      ['claude', 'chatgpt'],
      ['claude', 'gemini'],
      ['gemini', 'chatgpt'],
      ['gemini', 'claude'],
    ];

    for (const [src, dest] of expectedPairs) {
      const srcAdapter = registry.getAdapter(src);
      const destAdapter = registry.getAdapter(dest);

      expect(srcAdapter).toBeDefined();
      expect(destAdapter).toBeDefined();
      expect(srcAdapter?.supportedDestinations).toContain(dest);
      expect(destAdapter?.getDestinationUrl()).toBeTruthy();
    }
  });
});
