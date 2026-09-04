import { describe, it, expect } from 'vitest';
import { NormalizedConversation } from '@/core/models/conversation.ts';
import { buildContinuationPrompt } from '@/core/context/prompt-builder.ts';
import { partitionConversation } from '@/core/context/budget.ts';

describe('Context & Prompt Builder', () => {
  const sampleConversation: NormalizedConversation = {
    id: 'conv-123',
    title: 'Distributed Storage Design',
    sourceProvider: 'chatgpt',
    createdAt: Date.now(),
    messages: [
      {
        id: '1',
        role: 'user',
        content: [{ type: 'text', text: 'Rule: Must support 99.99% availability.' }],
      },
      {
        id: '2',
        role: 'assistant',
        content: [
          {
            type: 'code',
            language: 'go',
            code: 'type RaftNode struct { ID int }',
          },
        ],
      },
      {
        id: '3',
        role: 'user',
        content: [{ type: 'text', text: 'How do we handle network partitions?' }],
      },
      {
        id: '4',
        role: 'assistant',
        content: [{ type: 'text', text: 'We use quorum-based consensus.' }],
      },
      {
        id: '5',
        role: 'user',
        content: [{ type: 'text', text: 'Please implement the leader election loop.' }],
      },
    ],
  };

  it('partitions conversation preserving recent turns and earlier code/constraints', () => {
    const partitioned = partitionConversation(sampleConversation.messages, {
      maxCharacters: 32000,
      verbatimRecentTurnsCount: 3,
    });

    expect(partitioned.recentMessages.length).toBe(3);
    expect(partitioned.earlierMessages.length).toBe(2);
    expect(partitioned.extractedCodeBlocks.length).toBe(1);
    expect(partitioned.extractedCodeBlocks[0].language).toBe('go');
  });

  it('builds concise, structured continuation prompt conforming to specification', () => {
    const prompt = buildContinuationPrompt(sampleConversation);

    expect(prompt).toContain('You are continuing an ongoing conversation');
    expect(prompt).toContain('=== CONTEXT ===');
    expect(prompt).toContain('Source: ChatGPT');
    expect(prompt).toContain('Topic: Distributed Storage Design');
    expect(prompt).toContain('=== RECENT CONVERSATION ===');
    expect(prompt).not.toContain('=== CURRENT REQUEST ===');
    expect(prompt).toContain('Please implement the leader election loop.');
    expect(prompt).toContain('=== INSTRUCTIONS ===');
    expect(prompt).toContain('Continue directly from where the previous assistant stopped.');
    expect(prompt).toContain('Do not restart the task.');
    expect(prompt).toContain('Do not ask the user to repeat information already provided.');
  });
});
