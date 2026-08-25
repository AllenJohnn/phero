import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { ClaudeAdapter } from '@/adapters/claude/index.ts';
import { detectClaudeState } from '@/adapters/claude/detector.ts';
import { extractClaudeConversation } from '@/adapters/claude/extractor.ts';
import { injectClaude } from '@/adapters/claude/injector.ts';

describe('Claude Adapter', () => {
  const adapter = new ClaudeAdapter();

  it('matches valid Claude URLs', () => {
    expect(adapter.matches(new URL('https://claude.ai/new'))).toBe(true);
    expect(adapter.matches(new URL('https://claude.ai/chat/123-abc'))).toBe(true);
    expect(adapter.matches(new URL('https://chatgpt.com/'))).toBe(false);
  });

  it('extracts turns and code blocks from Claude fixture', async () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/claude-sample.html');
    const html = fs.readFileSync(fixturePath, 'utf-8');
    const dom = new JSDOM(html, { url: 'https://claude.ai/chat/test-uuid' });

    const state = detectClaudeState(dom.window.document);
    expect(state.isAvailable).toBe(true);
    expect(state.isInConversation).toBe(true);
    expect(state.title).toBe('System Architecture');

    const result = await extractClaudeConversation(dom.window.document);
    expect(result.conversation.messages.length).toBe(2);
    expect(result.conversation.messages[0].role).toBe('user');
    expect(result.conversation.messages[1].role).toBe('assistant');
  });

  it('injects continuation prompt into ProseMirror composer and verifies content', async () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/claude-sample.html');
    const html = fs.readFileSync(fixturePath, 'utf-8');
    const dom = new JSDOM(html, { url: 'https://claude.ai/new' });

    const prompt =
      'You are continuing an ongoing conversation transferred from another AI assistant.\n\n=== INSTRUCTIONS ===\nContinue work.';

    const injection = await injectClaude(dom.window.document, prompt);
    expect(injection.success).toBe(true);
    expect(injection.verified).toBe(true);
    expect(injection.composerElement).toBeDefined();
    expect(injection.composerElement?.textContent).toContain('You are continuing');
  });
});
