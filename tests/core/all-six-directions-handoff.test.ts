import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { AdapterRegistry } from '@/adapters/registry.ts';
import { buildContinuationPrompt } from '@/core/context/prompt-builder.ts';
import { SessionStorageManager } from '@/core/storage/session.ts';
import { HandoffPayload } from '@/core/models/handoff.ts';
import { ProviderId } from '@/core/models/conversation.ts';

const loadFixture = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, '../fixtures', name), 'utf-8');

describe('Full Six-Way End-to-End Transfer Suite', () => {
  const registry = AdapterRegistry.getInstance();

  beforeEach(async () => {
    await chrome.storage.session.clear();
  });

  const getSourceDoc = (provider: ProviderId): Document => {
    if (provider === 'chatgpt') {
      const html = loadFixture('chatgpt-sample.html');
      return new JSDOM(html, { url: 'https://chatgpt.com/c/test-chatgpt' }).window.document;
    }
    if (provider === 'claude') {
      const html = loadFixture('claude-sample.html');
      return new JSDOM(html, { url: 'https://claude.ai/chat/test-claude' }).window.document;
    }
    // gemini
    const html = loadFixture('gemini-sample.html');
    return new JSDOM(html, { url: 'https://gemini.google.com/app/test-gemini' }).window.document;
  };

  const getDestinationDoc = (provider: ProviderId): Document => {
    if (provider === 'chatgpt') {
      return new JSDOM(
        '<!DOCTYPE html><html><body><div id="prompt-textarea" contenteditable="true"></div></body></html>',
        { url: 'https://chatgpt.com/' }
      ).window.document;
    }
    if (provider === 'claude') {
      return new JSDOM(
        '<!DOCTYPE html><html><body><div class="ProseMirror" contenteditable="true"><p><br></p></div></body></html>',
        { url: 'https://claude.ai/new' }
      ).window.document;
    }
    // gemini
    return new JSDOM(
      '<!DOCTYPE html><html><body><rich-textarea><div class="ql-editor" contenteditable="true"><p><br></p></div></rich-textarea></body></html>',
      { url: 'https://gemini.google.com/app' }
    ).window.document;
  };

  const matrix: [ProviderId, ProviderId][] = [
    ['chatgpt', 'claude'],
    ['chatgpt', 'gemini'],
    ['claude', 'chatgpt'],
    ['claude', 'gemini'],
    ['gemini', 'chatgpt'],
    ['gemini', 'claude'],
  ];

  for (const [src, dest] of matrix) {
    it(`executes full handoff cycle: ${src} → ${dest}`, async () => {
      const srcAdapter = registry.getAdapter(src)!;
      const destAdapter = registry.getAdapter(dest)!;

      // 1. Extract from source
      const srcDoc = getSourceDoc(src);
      const extraction = await srcAdapter.extractConversation(srcDoc, { scrollDelayMs: 0, topReconciliationTimeoutMs: 10, networkTimeoutMs: 10 });
      expect(extraction.conversation.messages.length).toBeGreaterThan(0);
      expect(extraction.isComplete).toBe(true);

      // 2. Build continuation prompt
      const prompt = buildContinuationPrompt(extraction.conversation);
      expect(prompt).toContain('You are continuing an ongoing conversation');
      expect(prompt).toContain('=== INSTRUCTIONS ===');

      // 3. Store handoff in session storage
      const handoffId = `handoff_${src}_to_${dest}_${Date.now()}`;
      const payload: HandoffPayload = {
        handoffId,
        sourceProvider: src,
        destinationProvider: dest,
        conversation: extraction.conversation,
        continuationPrompt: prompt,
        createdAt: Date.now(),
        expiresAt: Date.now() + 5 * 60 * 1000,
        status: 'opening_destination',
        isCompletenessVerified: extraction.isComplete,
        totalMessagesExtracted: extraction.totalTurnsDetected,
      };

      await SessionStorageManager.saveHandoff(payload);

      // 4. Destination retrieval
      const pending = await SessionStorageManager.getPendingHandoff(dest);
      expect(pending).toBeDefined();
      expect(pending?.handoffId).toBe(handoffId);

      // 5. Destination injection
      const destDoc = getDestinationDoc(dest);
      const injection = await destAdapter.injectPrompt(destDoc, pending!.continuationPrompt);
      expect(injection.success).toBe(true);
      expect(injection.verified).toBe(true);
      expect(injection.composerElement?.textContent).toContain('You are continuing an ongoing conversation');

      // 6. Cleanup
      await SessionStorageManager.clearHandoff(handoffId, dest);
      const cleared = await SessionStorageManager.getPendingHandoff(dest);
      expect(cleared).toBeNull();
    });
  }
});
