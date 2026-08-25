import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { ChatGPTAdapter } from '@/adapters/chatgpt/index.ts';
import { detectChatGPTState } from '@/adapters/chatgpt/detector.ts';
import { extractChatGPTConversation } from '@/adapters/chatgpt/extractor.ts';

describe('ChatGPT Adapter', () => {
  const adapter = new ChatGPTAdapter();

  it('matches valid ChatGPT URLs', () => {
    expect(adapter.matches(new URL('https://chatgpt.com/c/123-abc'))).toBe(true);
    expect(adapter.matches(new URL('https://chat.openai.com/'))).toBe(true);
    expect(adapter.matches(new URL('https://claude.ai/'))).toBe(false);
  });

  it('extracts complete conversation with turns and code blocks from fixture', async () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/chatgpt-sample.html');
    const html = fs.readFileSync(fixturePath, 'utf-8');
    const dom = new JSDOM(html, { url: 'https://chatgpt.com/c/test-thread-id' });

    const state = detectChatGPTState(dom.window.document);
    expect(state.isAvailable).toBe(true);
    expect(state.isInConversation).toBe(true);
    expect(state.title).toBe('Refactoring TypeScript Engine');
    expect(state.conversationId).toBe('test-thread-id');

    const result = await extractChatGPTConversation(dom.window.document);
    expect(result.isComplete).toBe(true);
    expect(result.conversation.messages.length).toBe(5);

    // Verify turn sequence
    const [t1, t2, , , t5] = result.conversation.messages;
    expect(t1.role).toBe('user');
    expect(t1.content[0].type).toBe('text');
    expect((t1.content[0] as any).text).toContain('modular adapter system');

    expect(t2.role).toBe('assistant');
    const codeBlock2 = t2.content.find((b) => b.type === 'code');
    expect(codeBlock2).toBeDefined();
    expect((codeBlock2 as any).code).toContain('export interface Adapter');
    expect((codeBlock2 as any).language).toBe('typescript');

    expect(t5.role).toBe('user');
    expect((t5.content[0] as any).text).toContain('write the Registry class');
  });

  it('detects incomplete history when top turn is lazy loaded', async () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/chatgpt-incomplete.html');
    const html = fs.readFileSync(fixturePath, 'utf-8');
    const dom = new JSDOM(html, { url: 'https://chatgpt.com/c/long-thread-id' });

    const result = await extractChatGPTConversation(dom.window.document);
    expect(result.isComplete).toBe(false);
    expect(result.warning).toBeDefined();
    expect(result.conversation.metadata?.isTruncated).toBe(true);
  });

  it('strips internal thought blocks and citations while preserving tables and code', async () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/chatgpt-reasoning-and-tables.html');
    const html = fs.readFileSync(fixturePath, 'utf-8');
    const dom = new JSDOM(html, { url: 'https://chatgpt.com/c/sharding-thread' });

    const result = await extractChatGPTConversation(dom.window.document);
    expect(result.conversation.messages.length).toBe(2);

    const assistantMsg = result.conversation.messages[1];
    const textContent = assistantMsg.content.map((c) => (c.type === 'text' ? c.text : '')).join(' ');

    // Verify thought block was excluded
    expect(textContent).not.toContain('Thought for 8 seconds');
    expect(textContent).not.toContain('Internal reasoning details');

    // Verify table content was preserved
    expect(textContent).toContain('Horizontal');
    expect(textContent).toContain('Vertical');

    // Verify code was preserved
    const sqlCode = assistantMsg.content.find((c) => c.type === 'code');
    expect(sqlCode).toBeDefined();
    expect((sqlCode as any).language).toBe('sql');
  });
});
