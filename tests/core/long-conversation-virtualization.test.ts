import { describe, it, expect } from 'vitest';

import { buildContinuationPrompt } from '@/core/context/prompt-builder.ts';
import { partitionConversation } from '@/core/context/budget.ts';
import { NormalizedMessage } from '@/core/models/conversation.ts';

describe('Long Virtualized Conversation Simulation (100+ turns)', () => {
  it('partitions 100-message conversation preserving key decisions, constraints, and code while respecting token budget', () => {
    const messages: NormalizedMessage[] = [];

    // Message 1: Project definition & requirements
    messages.push({
      id: 'turn-1',
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Project Goal: Build a low-latency geo-replicated Raft cluster.\nConstraint: Max latency under 15ms.\nRule: Must use Go 1.22+ and zero allocation serialization.',
        },
      ],
    });

    // Message 2: Architecture Decision
    messages.push({
      id: 'turn-2',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'Decision: We decided to use memory-mapped ring buffers for the write-ahead log.\nArchitecture choice: Use FlatBuffers instead of JSON for wire format.',
        },
        {
          type: 'code',
          language: 'go',
          code: 'type LogEntry struct { Term uint64; Index uint64; Data []byte }',
        },
      ],
    });

    // Messages 3-90: Deep incremental discussions and iterations
    for (let i = 3; i <= 90; i++) {
      const role = i % 2 === 1 ? 'user' : 'assistant';
      messages.push({
        id: `turn-${i}`,
        role,
        content: [
          {
            type: 'text',
            text: `Turn ${i}: discussing optimization step ${i}, benchmark profiling, and memory alignment considerations.`,
          },
        ],
      });
    }

    // Message 91: Encountered a blocker
    messages.push({
      id: 'turn-91',
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Bug: Network partition split-brain occurring when node 3 rejoins.\nIssue: Term check is failing in vote request handler.',
        },
      ],
    });

    // Messages 92-99: Recent turns
    for (let i = 92; i <= 99; i++) {
      const role = i % 2 === 1 ? 'user' : 'assistant';
      messages.push({
        id: `turn-${i}`,
        role,
        content: [
          {
            type: 'text',
            text: `Recent turn ${i}: analyzing raft term increment logic and election timeout jitter.`,
          },
        ],
      });
    }

    // Message 100: Active immediate task
    messages.push({
      id: 'turn-100',
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Please write the fixed RequestVote handler in Go that properly rejects stale terms.',
        },
      ],
    });

    // 1. Partition conversation
    const partitioned = partitionConversation(messages, {
      maxCharacters: 32000,
      verbatimRecentTurnsCount: 6,
    });

    expect(partitioned.recentMessages.length).toBe(6);
    expect(partitioned.earlierMessages.length).toBe(94);

    // Verify key constraints from turn 1 were preserved
    expect(partitioned.extractedConstraints.some((c) => c.includes('Max latency under 15ms'))).toBe(true);

    // Verify decisions from turn 2 were preserved
    expect(partitioned.extractedDecisions.some((d) => d.includes('memory-mapped ring buffers'))).toBe(true);

    // Verify unresolved issue from turn 91 was preserved
    expect(partitioned.extractedUnresolvedIssues.some((issue) => issue.includes('split-brain occurring'))).toBe(true);

    // Verify early code block was preserved
    expect(partitioned.extractedCodeBlocks.length).toBe(1);
    expect(partitioned.extractedCodeBlocks[0].code).toContain('type LogEntry struct');

    // 2. Build continuation prompt
    const prompt = buildContinuationPrompt({
      id: 'long-chat',
      title: 'Raft Cluster Engineering',
      sourceProvider: 'chatgpt',
      createdAt: Date.now(),
      messages,
    });

    expect(prompt).toContain('=== IMPORTANT CONTEXT ===');
    expect(prompt).toContain('Project Requirements & Constraints:');
    expect(prompt).toContain('Key Decisions & Agreed Architecture:');
    expect(prompt).toContain('Unresolved Issues & Blockers:');
    expect(prompt).toContain('=== PREVIOUS WORK ===');
    expect(prompt).toContain('type LogEntry struct');
    expect(prompt).toContain('=== RECENT CONVERSATION ===');
    expect(prompt).toContain('=== CURRENT REQUEST ===');
    expect(prompt).toContain('Please write the fixed RequestVote handler in Go that properly rejects stale terms.');
  });
});
