import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { extractClaudeConversation } from '@/adapters/claude/extractor.ts';
import { buildContinuationPrompt } from '@/core/context/prompt-builder.ts';
import { SessionStorageManager } from '@/core/storage/session.ts';
import { HandoffPayload } from '@/core/models/handoff.ts';
import { injectChatGPT } from '@/adapters/chatgpt/injector.ts';

const loadFixture = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, '../fixtures', name), 'utf-8');

describe('End-to-End Flow: Claude → ChatGPT Handoff', () => {
  beforeEach(async () => {
    await chrome.storage.session.clear();
  });

  it('completes the full handoff cycle from Claude extraction to ChatGPT injection', async () => {
    // 1. Source: Extract conversation from Claude DOM
    const claudeHtml = loadFixture('claude-sample.html');
    const claudeDom = new JSDOM(claudeHtml, { url: 'https://claude.ai/chat/test-uuid' });

    const extraction = await extractClaudeConversation(claudeDom.window.document);
    expect(extraction.conversation.messages.length).toBeGreaterThan(0);
    expect(extraction.isComplete).toBe(true);
    expect(extraction.conversation.sourceProvider).toBe('claude');

    // 2. Build continuation context prompt
    const continuationPrompt = buildContinuationPrompt(extraction.conversation);
    expect(continuationPrompt).toContain('You are continuing an ongoing conversation');
    expect(continuationPrompt).toContain('modular adapter system');
    expect(continuationPrompt).toContain('=== INSTRUCTIONS ===');

    // 3. Create Handoff Payload and store in ephemeral session storage
    const handoffId = `handoff_chatgpt_${Date.now()}`;
    const payload: HandoffPayload = {
      handoffId,
      sourceProvider: 'claude',
      destinationProvider: 'chatgpt',
      conversation: extraction.conversation,
      continuationPrompt,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
      status: 'opening_destination',
      isCompletenessVerified: extraction.isComplete,
      totalMessagesExtracted: extraction.totalTurnsDetected,
    };

    await SessionStorageManager.saveHandoff(payload);

    // 4. Destination: Query pending handoff for 'chatgpt'
    const pendingHandoff = await SessionStorageManager.getPendingHandoff('chatgpt');
    expect(pendingHandoff).toBeDefined();
    expect(pendingHandoff?.handoffId).toBe(handoffId);
    expect(pendingHandoff?.sourceProvider).toBe('claude');
    expect(pendingHandoff?.destinationProvider).toBe('chatgpt');

    // 5. Destination: Inject into ChatGPT DOM (minimal fixture with prompt-textarea)
    const chatgptDom = new JSDOM(
      '<!DOCTYPE html><html><body><div id="prompt-textarea" contenteditable="true"></div></body></html>',
      { url: 'https://chatgpt.com/' }
    );

    const injection = await injectChatGPT(chatgptDom.window.document, pendingHandoff!.continuationPrompt);
    expect(injection.success).toBe(true);
    expect(injection.verified).toBe(true);
    expect(injection.composerElement?.textContent).toContain('You are continuing an ongoing conversation');
    expect(injection.composerElement?.textContent).toContain('modular adapter system');

    // 6. Cleanup: Clear handoff after verified injection
    await SessionStorageManager.clearHandoff(handoffId, 'chatgpt');
    const cleared = await SessionStorageManager.getPendingHandoff('chatgpt');
    expect(cleared).toBeNull();
  });
});
