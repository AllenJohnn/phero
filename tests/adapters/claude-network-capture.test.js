import { describe, it, expect } from 'vitest';
import { parseClaudeMessages } from '../../src/adapters/claude/network-capture.js';

describe('Claude Network Capture - parseClaudeMessages', () => {
  it('walks the tree from leaf to root correctly and maps roles', () => {
    const messages = [
      {
        uuid: 'msg-3',
        parent_message_uuid: 'msg-2',
        sender: 'human',
        content: [{ type: 'text', text: 'This is the leaf.' }]
      },
      {
        uuid: 'msg-1',
        parent_message_uuid: '00000000-0000-4000-8000-000000000000',
        sender: 'human',
        content: [{ type: 'text', text: 'Root message.' }]
      },
      {
        uuid: 'msg-2',
        parent_message_uuid: 'msg-1',
        sender: 'assistant',
        content: [{ type: 'text', text: 'Assistant reply.' }]
      },
      {
        uuid: 'msg-4', // An abandoned branch
        parent_message_uuid: 'msg-1',
        sender: 'assistant',
        content: [{ type: 'text', text: 'Orphaned branch.' }]
      }
    ];

    const result = parseClaudeMessages(messages, 'msg-3');

    expect(result.length).toBe(3);
    expect(result[0].id).toBe('msg-1');
    expect(result[0].role).toBe('user');
    expect(result[0].content[0].text).toBe('Root message.');

    expect(result[1].id).toBe('msg-2');
    expect(result[1].role).toBe('assistant');
    
    expect(result[2].id).toBe('msg-3');
    expect(result[2].role).toBe('user');
    expect(result[2].content[0].text).toBe('This is the leaf.');
  });

  it('splits markdown code blocks into distinct code content blocks', () => {
    const messages = [
      {
        uuid: 'msg-1',
        parent_message_uuid: '00000000-0000-4000-8000-000000000000',
        sender: 'assistant',
        content: [{ type: 'text', text: 'Here is some code:\n```javascript\nconsole.log("hello");\n```\nAnd some trailing text.' }]
      }
    ];

    const result = parseClaudeMessages(messages, 'msg-1');
    const content = result[0].content;

    expect(content.length).toBe(3);
    expect(content[0]).toEqual({ type: 'text', text: 'Here is some code:' });
    expect(content[1]).toEqual({ type: 'code', language: 'javascript', code: 'console.log("hello");' });
    expect(content[2]).toEqual({ type: 'text', text: 'And some trailing text.' });
  });

  it('handles tool_use and tool_result blocks, ignores thinking blocks', () => {
    const messages = [
      {
        uuid: 'msg-1',
        parent_message_uuid: '00000000-0000-4000-8000-000000000000',
        sender: 'assistant',
        content: [
          { type: 'thinking', text: 'I should use a tool.' },
          { type: 'tool_use', input: { query: 'test' } },
          { type: 'tool_result', content: 'Success' },
          { type: 'text', text: 'Final answer.' }
        ]
      }
    ];

    const result = parseClaudeMessages(messages, 'msg-1');
    const content = result[0].content;

    expect(content.length).toBe(3); // thinking is skipped
    expect(content[0].text).toContain('[tool_use]');
    expect(content[0].text).toContain('test');
    expect(content[1].text).toContain('[tool_result]');
    expect(content[1].text).toContain('Success');
    expect(content[2]).toEqual({ type: 'text', text: 'Final answer.' });
  });

  it('falls back to msg.text if msg.content array is not present', () => {
    const messages = [
      {
        uuid: 'msg-1',
        parent_message_uuid: '00000000-0000-4000-8000-000000000000',
        sender: 'human',
        text: 'Legacy flat text format'
      }
    ];

    const result = parseClaudeMessages(messages, 'msg-1');
    expect(result.length).toBe(1);
    expect(result[0].content[0]).toEqual({ type: 'text', text: 'Legacy flat text format' });
  });
});
