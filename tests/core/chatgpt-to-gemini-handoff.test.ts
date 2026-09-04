import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { extractChatGPTConversation } from '@/adapters/chatgpt/extractor.ts';
import { buildContinuationPrompt } from '@/core/context/prompt-builder.ts';
import { SessionStorageManager } from '@/core/storage/session.ts';
import { HandoffPayload } from '@/core/models/handoff.ts';
import { injectGemini } from '@/adapters/gemini/injector.ts';

describe('End-to-End Flow: ChatGPT → Gemini Handoff', () => {
  beforeEach(async () => {
    await chrome.storage.session.clear();
  });

  it('completes the full handoff cycle from ChatGPT extraction to Gemini injection', async () => {
    // 1. Source: Extract conversation from ChatGPT DOM
    const chatgptFixturePath = path.resolve(__dirname, '../fixtures/chatgpt-sample.html');
    const chatgptHtml = fs.readFileSync(chatgptFixturePath, 'utf-8');
    const chatgptDom = new JSDOM(chatgptHtml, { url: 'https://chatgpt.com/c/test-chatgpt-id' });

    const extraction = await extractChatGPTConversation(chatgptDom.window.document, { scrollDelayMs: 0, topReconciliationTimeoutMs: 10, networkTimeoutMs: 10 });
    expect(extraction.conversation.messages.length).toBeGreaterThan(0);
    expect(extraction.isComplete).toBe(true);

    // 2. Build continuation context prompt
    const continuationPrompt = buildContinuationPrompt(extraction.conversation);
    expect(continuationPrompt).toContain('You are continuing an ongoing conversation');
    expect(continuationPrompt).toContain('export interface Adapter');
    expect(continuationPrompt).toContain('=== INSTRUCTIONS ===');

    // 3. Create Handoff Payload and store in ephemeral session storage
    const handoffId = `handoff_gemini_${Date.now()}`;
    const payload: HandoffPayload = {
      handoffId,
      sourceProvider: 'chatgpt',
      destinationProvider: 'gemini',
      conversation: extraction.conversation,
      continuationPrompt,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
      status: 'opening_destination',
      isCompletenessVerified: extraction.isComplete,
      totalMessagesExtracted: extraction.totalTurnsDetected,
    };

    await SessionStorageManager.saveHandoff(payload);

    // 4. Destination: Query pending handoff for 'gemini'
    const pendingHandoff = await SessionStorageManager.getPendingHandoff('gemini');
    expect(pendingHandoff).toBeDefined();
    expect(pendingHandoff?.handoffId).toBe(handoffId);

    // 5. Destination: Inject into Gemini DOM
    const geminiFixturePath = path.resolve(__dirname, '../fixtures/gemini-sample.html');
    const geminiHtml = fs.readFileSync(geminiFixturePath, 'utf-8');
    const geminiDom = new JSDOM(geminiHtml, { url: 'https://gemini.google.com/app' });

    const injection = await injectGemini(geminiDom.window.document, pendingHandoff!.continuationPrompt);
    expect(injection.success).toBe(true);
    expect(injection.verified).toBe(true);
    expect(injection.composerElement?.textContent).toContain('You are continuing an ongoing conversation');
    expect(injection.composerElement?.textContent).toContain('modular adapter system');

    // 6. Cleanup: Clear handoff after verified injection
    await SessionStorageManager.clearHandoff(handoffId, 'gemini');
    const cleared = await SessionStorageManager.getPendingHandoff('gemini');
    expect(cleared).toBeNull();
  });
});
