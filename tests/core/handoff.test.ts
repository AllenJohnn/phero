import { describe, it, expect, beforeEach } from 'vitest';
import { SessionStorageManager } from '@/core/storage/session.ts';
import { HandoffPayload } from '@/core/models/handoff.ts';

describe('Handoff Ephemeral Storage & Lifecycle', () => {
  beforeEach(async () => {
    await chrome.storage.session.clear();
  });

  const mockPayload: HandoffPayload = {
    handoffId: 'test-session-999',
    sourceProvider: 'chatgpt',
    destinationProvider: 'claude',
    conversation: {
      id: 'chat-1',
      title: 'Testing',
      sourceProvider: 'chatgpt',
      createdAt: Date.now(),
      messages: [],
    },
    continuationPrompt: 'You are continuing...',
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000,
    status: 'opening_destination',
    isCompletenessVerified: true,
    totalMessagesExtracted: 4,
  };

  it('saves and retrieves pending handoff for destination provider', async () => {
    await SessionStorageManager.saveHandoff(mockPayload);

    const retrieved = await SessionStorageManager.getPendingHandoff('claude');
    expect(retrieved).toBeDefined();
    expect(retrieved?.handoffId).toBe('test-session-999');
    expect(retrieved?.continuationPrompt).toBe('You are continuing...');
  });

  it('purges expired handoff payload automatically', async () => {
    const expiredPayload: HandoffPayload = {
      ...mockPayload,
      handoffId: 'expired-123',
      expiresAt: Date.now() - 1000, // Expired 1 second ago
    };

    await SessionStorageManager.saveHandoff(expiredPayload);

    const retrieved = await SessionStorageManager.getPendingHandoff('claude');
    expect(retrieved).toBeNull();
  });

  it('clears handoff on completion', async () => {
    await SessionStorageManager.saveHandoff(mockPayload);
    await SessionStorageManager.clearHandoff(mockPayload.handoffId, 'claude');

    const retrieved = await SessionStorageManager.getPendingHandoff('claude');
    expect(retrieved).toBeNull();
  });
});
