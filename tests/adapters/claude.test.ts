import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { ClaudeAdapter } from '@/adapters/claude/index.ts';
import { detectClaudeState } from '@/adapters/claude/detector.ts';
import { extractClaudeConversation } from '@/adapters/claude/extractor.ts';
import { injectClaude } from '@/adapters/claude/injector.ts';

const loadFixture = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, '../fixtures', name), 'utf-8');

describe('Claude Adapter', () => {
  const adapter = new ClaudeAdapter();

  // ─── Detection ───────────────────────────────────────────────────

  describe('Detection', () => {
    it('matches valid Claude URLs and rejects other domains', () => {
      expect(adapter.matches(new URL('https://claude.ai/new'))).toBe(true);
      expect(adapter.matches(new URL('https://claude.ai/chat/123-abc'))).toBe(true);
      expect(adapter.matches(new URL('https://chatgpt.com/'))).toBe(false);
      expect(adapter.matches(new URL('https://gemini.google.com/'))).toBe(false);
    });

    it('detects active conversation vs new-chat page', () => {
      const activeHtml = loadFixture('claude-sample.html');
      const activeDom = new JSDOM(activeHtml, { url: 'https://claude.ai/chat/test-uuid' });
      const activeState = detectClaudeState(activeDom.window.document);
      expect(activeState.isAvailable).toBe(true);
      expect(activeState.isInConversation).toBe(true);

      const newDom = new JSDOM(
        '<!DOCTYPE html><html><head><title>Claude</title></head><body></body></html>',
        { url: 'https://claude.ai/new' }
      );
      const newState = detectClaudeState(newDom.window.document);
      expect(newState.isAvailable).toBe(true);
      expect(newState.isInConversation).toBe(false);
    });

    it('extracts conversation ID from URL path', () => {
      const dom = new JSDOM(
        '<!DOCTYPE html><html><head><title>Claude</title></head><body></body></html>',
        { url: 'https://claude.ai/chat/conv-abc-123' }
      );
      const state = detectClaudeState(dom.window.document);
      expect(state.conversationId).toBe('conv-abc-123');
    });

    it('extracts title from <title> tag, stripping Claude suffix', () => {
      const html = loadFixture('claude-sample.html');
      const dom = new JSDOM(html, { url: 'https://claude.ai/chat/test-uuid' });
      const state = detectClaudeState(dom.window.document);
      expect(state.title).toBe('System Architecture');
    });

    it('reports correct messageCount from DOM', () => {
      const html = loadFixture('claude-sample.html');
      const dom = new JSDOM(html, { url: 'https://claude.ai/chat/test-uuid' });
      const state = detectClaudeState(dom.window.document);
      expect(state.messageCount).toBe(4);
    });

    it('detects incomplete history when load-more button exists', () => {
      const html = loadFixture('claude-incomplete.html');
      const dom = new JSDOM(html, { url: 'https://claude.ai/chat/incomplete-conv-id' });
      const state = detectClaudeState(dom.window.document);
      expect(state.isHistoryFullyLoaded).toBe(false);
    });
  });

  // ─── Extraction ──────────────────────────────────────────────────

  describe('Extraction', () => {
    it('extracts correct number of turns (4 messages)', async () => {
      const html = loadFixture('claude-sample.html');
      const dom = new JSDOM(html, { url: 'https://claude.ai/chat/test-uuid' });
      const result = await extractClaudeConversation(dom.window.document, { scrollDelayMs: 0 });
      expect(result.conversation.messages.length).toBe(4);
    });

    it('assigns correct user/assistant roles for all turns', async () => {
      const html = loadFixture('claude-sample.html');
      const dom = new JSDOM(html, { url: 'https://claude.ai/chat/test-uuid' });
      const result = await extractClaudeConversation(dom.window.document, { scrollDelayMs: 0 });

      expect(result.conversation.messages[0].role).toBe('user');
      expect(result.conversation.messages[1].role).toBe('assistant');
      expect(result.conversation.messages[2].role).toBe('user');
      expect(result.conversation.messages[3].role).toBe('assistant');
    });

    it('preserves TypeScript code blocks with language identifier', async () => {
      const html = loadFixture('claude-sample.html');
      const dom = new JSDOM(html, { url: 'https://claude.ai/chat/test-uuid' });
      const result = await extractClaudeConversation(dom.window.document, { scrollDelayMs: 0 });

      // Turn 2 (assistant) should contain a TypeScript code block
      const assistantMsg = result.conversation.messages[1];
      const codeBlock = assistantMsg.content.find(
        (b) => b.type === 'code' && (b as any).language === 'typescript'
      );
      expect(codeBlock).toBeDefined();
      expect((codeBlock as any).code).toContain('export interface Adapter');
      expect((codeBlock as any).code).toContain('AdapterRegistry');
    });

    it('extracts markdown table as text block with pipe-delimited content', async () => {
      const html = loadFixture('claude-sample.html');
      const dom = new JSDOM(html, { url: 'https://claude.ai/chat/test-uuid' });
      const result = await extractClaudeConversation(dom.window.document, { scrollDelayMs: 0 });

      const assistantMsg = result.conversation.messages[1];
      const tableBlock = assistantMsg.content.find(
        (b) => b.type === 'text' && b.text.includes('| Provider |')
      );
      expect(tableBlock).toBeDefined();
      expect((tableBlock as any).text).toContain('| ChatGPT |');
      expect((tableBlock as any).text).toContain('| Claude |');
    });

    it('strips UI noise: Copy code, Good response, Copied!', async () => {
      const html = loadFixture('claude-sample.html');
      const dom = new JSDOM(html, { url: 'https://claude.ai/chat/test-uuid' });
      const result = await extractClaudeConversation(dom.window.document, { scrollDelayMs: 0 });

      const allText = result.conversation.messages
        .flatMap((m) => m.content.map((b) => (b.type === 'text' ? b.text : '')))
        .join(' ');
      expect(allText).not.toContain('Copy code');
      expect(allText).not.toContain('Good response');
      expect(allText).not.toContain('Copied!');
    });

    it('strips thinking/reasoning blocks', async () => {
      const html = loadFixture('claude-sample.html');
      const dom = new JSDOM(html, { url: 'https://claude.ai/chat/test-uuid' });
      const result = await extractClaudeConversation(dom.window.document, { scrollDelayMs: 0 });

      const allText = result.conversation.messages
        .flatMap((m) => m.content.map((b) => (b.type === 'text' ? b.text : '')))
        .join(' ');
      expect(allText).not.toContain('Let me think about');
    });

    it('extracts artifact content from artifact containers', async () => {
      const html = loadFixture('claude-sample.html');
      const dom = new JSDOM(html, { url: 'https://claude.ai/chat/test-uuid' });
      const result = await extractClaudeConversation(dom.window.document, { scrollDelayMs: 0 });

      // Turn 4 (assistant) has an artifact
      const artifactMsg = result.conversation.messages[3];
      const hasArtifact = artifactMsg.content.some(
        (b) =>
          (b.type === 'code' && (b as any).code.includes('CodeGenerator')) ||
          (b.type === 'text' && b.text.includes('ARTIFACT'))
      );
      expect(hasArtifact).toBe(true);
    });

    it('strips artifact view buttons', async () => {
      const html = loadFixture('claude-sample.html');
      const dom = new JSDOM(html, { url: 'https://claude.ai/chat/test-uuid' });
      const result = await extractClaudeConversation(dom.window.document, { scrollDelayMs: 0 });

      const allText = result.conversation.messages
        .flatMap((m) => m.content.map((b) => (b.type === 'text' ? b.text : '')))
        .join(' ');
      expect(allText).not.toContain('View Artifact');
    });

    it('sets sourceProvider to "claude" in normalized conversation', async () => {
      const html = loadFixture('claude-sample.html');
      const dom = new JSDOM(html, { url: 'https://claude.ai/chat/test-uuid' });
      const result = await extractClaudeConversation(dom.window.document, { scrollDelayMs: 0 });
      expect(result.conversation.sourceProvider).toBe('claude');
    });
  });

  // ─── Completeness ────────────────────────────────────────────────

  describe('Completeness', () => {
    it('complete fixture returns isComplete: true', async () => {
      const html = loadFixture('claude-sample.html');
      const dom = new JSDOM(html, { url: 'https://claude.ai/chat/test-uuid' });
      const result = await extractClaudeConversation(dom.window.document, { scrollDelayMs: 0 });
      expect(result.isComplete).toBe(true);
    });

    it('incomplete fixture returns isComplete: false with warning', async () => {
      const html = loadFixture('claude-incomplete.html');
      const dom = new JSDOM(html, { url: 'https://claude.ai/chat/incomplete-conv-id' });
      const result = await extractClaudeConversation(dom.window.document, { scrollDelayMs: 0 });
      expect(result.isComplete).toBe(false);
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('earlier messages');
    });
  });

  // ─── Injection ───────────────────────────────────────────────────

  describe('Injection', () => {
    it('injects continuation prompt into ProseMirror composer and verifies content', async () => {
      const html = loadFixture('claude-sample.html');
      const dom = new JSDOM(html, { url: 'https://claude.ai/new' });

      const prompt =
        'You are continuing an ongoing conversation transferred from another AI assistant.\n\n=== INSTRUCTIONS ===\nContinue work on the adapter system.';

      const injection = await injectClaude(dom.window.document, prompt);
      expect(injection.success).toBe(true);
      expect(injection.verified).toBe(true);
      expect(injection.composerElement).toBeDefined();
      expect(injection.composerElement?.textContent).toContain('You are continuing');
      expect(injection.composerElement?.textContent).toContain('INSTRUCTIONS');
    });

    it('injected content persists across blur/focus events', async () => {
      const html = loadFixture('claude-sample.html');
      const dom = new JSDOM(html, { url: 'https://claude.ai/new' });

      const prompt =
        'You are continuing an ongoing conversation... === INSTRUCTIONS === Test Persistence.';
      const injection = await injectClaude(dom.window.document, prompt);
      expect(injection.verified).toBe(true);

      const el = injection.composerElement!;
      el.dispatchEvent(new dom.window.Event('blur'));
      el.dispatchEvent(new dom.window.Event('focus'));

      expect(el.textContent).toContain('You are continuing');
      expect(el.textContent).toContain('INSTRUCTIONS');
    });
  });
});
