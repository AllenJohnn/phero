import { describe, it, expect } from 'vitest';
import { deduplicateMessages, reindexMessages } from '@/core/capture/deduplication.ts';
import { NormalizedMessage } from '@/core/models/conversation.ts';

describe('Capture Deduplication & Ordering', () => {
  it('deduplicates overlapping windows based on message IDs', () => {
    const windowA: NormalizedMessage[] = [
      { id: 'turn-1', role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      { id: 'turn-2', role: 'assistant', content: [{ type: 'text', text: 'Hi there!' }] },
      { id: 'turn-3', role: 'user', content: [{ type: 'text', text: 'Tell me a joke.' }] },
    ];

    const windowB: NormalizedMessage[] = [
      { id: 'turn-2', role: 'assistant', content: [{ type: 'text', text: 'Hi there!' }] },
      { id: 'turn-3', role: 'user', content: [{ type: 'text', text: 'Tell me a joke.' }] },
      { id: 'turn-4', role: 'assistant', content: [{ type: 'text', text: 'Why did the chicken cross the road?' }] },
    ];

    const merged = deduplicateMessages(windowA, windowB);
    expect(merged.length).toBe(4);
    expect(merged.map((m) => m.id)).toEqual(['turn-1', 'turn-2', 'turn-3', 'turn-4']);
  });

  it('preserves legitimate identical consecutive messages if they have distinct IDs', () => {
    const msg1: NormalizedMessage = {
      id: 'turn-1',
      role: 'user',
      content: [{ type: 'text', text: 'Retry' }],
    };
    const msg2: NormalizedMessage = {
      id: 'turn-2',
      role: 'assistant',
      content: [{ type: 'text', text: 'Failed' }],
    };
    const msg3: NormalizedMessage = {
      id: 'turn-3',
      role: 'user',
      content: [{ type: 'text', text: 'Retry' }], // Identical prompt, but different turn ID
    };

    const merged = deduplicateMessages([msg1, msg2], [msg3]);
    expect(merged.length).toBe(3);
    expect(merged[0].id).toBe('turn-1');
    expect(merged[2].id).toBe('turn-3');
  });

  it('deduplicates based on content fingerprint when fallback ID is used', () => {
    const msg1: NormalizedMessage = {
      id: 'turn-fallback-1',
      role: 'user',
      content: [{ type: 'text', text: 'Identical message' }],
    };
    const msg2: NormalizedMessage = {
      id: 'turn-fallback-2',
      role: 'user',
      content: [{ type: 'text', text: 'Identical message' }],
    };

    const merged = deduplicateMessages([msg1], [msg2]);
    expect(merged.length).toBe(1);
  });

  it('reindexes messages sequentially', () => {
    const messages: NormalizedMessage[] = [
      { id: 'node-xyz', role: 'user', content: [{ type: 'text', text: 'A' }] },
      { id: '', role: 'assistant', content: [{ type: 'text', text: 'B' }] },
    ];

    const reindexed = reindexMessages(messages);
    expect(reindexed[0].id).toBe('node-xyz');
    expect(reindexed[1].id).toBe('msg-2');
  });
});
