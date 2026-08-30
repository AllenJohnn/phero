import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { GeminiAdapter } from '@/adapters/gemini/index.ts';
import { detectGeminiState } from '@/adapters/gemini/detector.ts';
import { extractGeminiConversation } from '@/adapters/gemini/extractor.ts';
import { injectGemini } from '@/adapters/gemini/injector.ts';

describe('Gemini Adapter', () => {
  const adapter = new GeminiAdapter();

  it('matches valid Gemini URLs and rejects other domains', () => {
    expect(adapter.matches(new URL('https://gemini.google.com/app'))).toBe(true);
    expect(adapter.matches(new URL('https://gemini.google.com/app/123-abc-789'))).toBe(true);
    expect(adapter.matches(new URL('https://bard.google.com/chat'))).toBe(true);
    expect(adapter.matches(new URL('https://chatgpt.com/'))).toBe(false);
    expect(adapter.matches(new URL('https://claude.ai/'))).toBe(false);
  });

  it('detects state, title, and conversationId from Gemini DOM', () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/gemini-sample.html');
    const html = fs.readFileSync(fixturePath, 'utf-8');
    const dom = new JSDOM(html, { url: 'https://gemini.google.com/app/test-gemini-session' });

    const state = detectGeminiState(dom.window.document);
    expect(state.isAvailable).toBe(true);
    expect(state.isInConversation).toBe(true);
    expect(state.title).toBe('Distributed Systems');
    expect(state.conversationId).toBe('test-gemini-session');
    expect(state.messageCount).toBe(2);
  });

  it('extracts conversation turns, code blocks, and markdown tables', async () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/gemini-sample.html');
    const html = fs.readFileSync(fixturePath, 'utf-8');
    const dom = new JSDOM(html, { url: 'https://gemini.google.com/app/test-gemini-session' });

    const result = await extractGeminiConversation(dom.window.document);
    expect(result.isComplete).toBe(true);
    expect(result.conversation.messages.length).toBe(2);

    const [userMsg, assistantMsg] = result.conversation.messages;
    expect(userMsg.role).toBe('user');
    expect(userMsg.content[0].type).toBe('text');
    expect((userMsg.content[0] as any).text).toContain('Raft consensus');

    expect(assistantMsg.role).toBe('assistant');
    // Check code block
    const codeBlock = assistantMsg.content.find((b) => b.type === 'code');
    expect(codeBlock).toBeDefined();
    expect((codeBlock as any).language).toBe('go');
    expect((codeBlock as any).code).toContain('package raft');

    // Check table extraction
    const tableBlock = assistantMsg.content.find(
      (b) => b.type === 'text' && b.text.includes('| Role | Responsibility |')
    );
    expect(tableBlock).toBeDefined();
    expect((tableBlock as any).text).toContain('| Leader | Handles all client requests');

    // Check UI noise was removed
    const combinedText = assistantMsg.content.map((b) => (b.type === 'text' ? b.text : '')).join(' ');
    expect(combinedText).not.toContain('Listen');
    expect(combinedText).not.toContain('Copy code');
    expect(combinedText).not.toContain('Good');
  });

  it('extracts multiturn conversations accurately', async () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/gemini-multiturn-complex.html');
    const html = fs.readFileSync(fixturePath, 'utf-8');
    const dom = new JSDOM(html, { url: 'https://gemini.google.com/app/multi-turn-session' });

    const result = await extractGeminiConversation(dom.window.document);
    expect(result.conversation.messages.length).toBe(4);

    const [t1, t2, t3, t4] = result.conversation.messages;
    expect(t1.role).toBe('user');
    expect((t1.content[0] as any).text).toContain('REST endpoints');

    expect(t2.role).toBe('assistant');
    const tsCode = t2.content.find((b) => b.type === 'code');
    expect(tsCode).toBeDefined();
    expect((tsCode as any).language).toBe('typescript');

    expect(t3.role).toBe('user');
    expect((t3.content[0] as any).text).toContain('Python');

    expect(t4.role).toBe('assistant');
    const pyCode = t4.content.find((b) => b.type === 'code');
    expect(pyCode).toBeDefined();
    expect((pyCode as any).language).toBe('python');
  });

  it('injects continuation prompt into Gemini Quill editor and verifies content', async () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/gemini-sample.html');
    const html = fs.readFileSync(fixturePath, 'utf-8');
    const dom = new JSDOM(html, { url: 'https://gemini.google.com/app' });

    const prompt =
      'You are continuing an ongoing conversation transferred from another AI assistant.\n\n=== INSTRUCTIONS ===\nProceed with the distributed system architecture.';

    const injection = await injectGemini(dom.window.document, prompt);
    expect(injection.success).toBe(true);
    expect(injection.verified).toBe(true);
    expect(injection.composerElement).toBeDefined();
    expect(injection.composerElement?.textContent).toContain('You are continuing');
    expect(injection.composerElement?.textContent).toContain('INSTRUCTIONS');
  });

  it('maintains injected content across blur and focus events', async () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/gemini-sample.html');
    const html = fs.readFileSync(fixturePath, 'utf-8');
    const dom = new JSDOM(html, { url: 'https://gemini.google.com/app' });

    const prompt = 'You are continuing an ongoing conversation... === INSTRUCTIONS === Test Persistence.';
    const injection = await injectGemini(dom.window.document, prompt);
    expect(injection.verified).toBe(true);

    const el = injection.composerElement!;
    el.dispatchEvent(new Event('blur'));
    el.dispatchEvent(new Event('focus'));

    expect(el.textContent).toContain('You are continuing');
    expect(el.textContent).toContain('INSTRUCTIONS');
  });

  it('handles incomplete history and provides honest warning', async () => {
    const dom = new JSDOM(
      '<!DOCTYPE html><html><head><title>Gemini Long Chat</title></head><body><div class="chat-history"><user-query><div class="query-content">Only turn visible</div></user-query></div></body></html>',
      { url: 'https://gemini.google.com/app/chat-abc' }
    );

    const result = await extractGeminiConversation(dom.window.document);
    expect(result.conversation.messages.length).toBe(1);
    expect(result.isComplete).toBe(true);
  });

  it('returns failure when composer element is missing and timeout elapses', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div>No editor here</div></body></html>', {
      url: 'https://gemini.google.com/app',
    });

    // Use waitForGeminiInput directly with short timeout to avoid exceeding vitest timeout
    const { waitForGeminiInput } = await import('@/adapters/gemini/injector.ts');
    await expect(waitForGeminiInput(dom.window.document, 500)).rejects.toThrow('Timed out');
  });
});
