import {
  NormalizedConversation,
  NormalizedMessage,
  ContentBlock,
  Role,
} from '../../core/models/conversation.ts';
import { ExtractionOptions, ExtractionResult } from '../types.ts';
import { detectClaudeState } from './detector.ts';
import { Logger } from '../../shared/logger.ts';

export async function extractClaudeConversation(
  doc: Document,
  _options: ExtractionOptions = {}
): Promise<ExtractionResult> {
  const state = detectClaudeState(doc);
  Logger.info('Extracting Claude conversation', { isAvailable: state.isAvailable });

  const messages: NormalizedMessage[] = [];

  // Search for message containers in Claude UI
  const userTurns = Array.from(
    doc.querySelectorAll<HTMLElement>('.font-user-message, div[data-is-streaming="false"]:has(.font-user-message), div.whitespace-pre-wrap')
  );
  const assistantTurns = Array.from(
    doc.querySelectorAll<HTMLElement>('.font-claude-message, div.standard-markdown')
  );

  // General turns search
  const turnElements = Array.from(
    doc.querySelectorAll<HTMLElement>('div[data-test-render-count], div.group\\/message, div[data-testid="chat-message"]')
  );

  if (turnElements.length > 0) {
    let turnIndex = 0;
    for (const turnEl of turnElements) {
      turnIndex++;
      const isAssistant =
        turnEl.querySelector('.font-claude-message') ||
        turnEl.querySelector('div.standard-markdown') ||
        turnEl.classList.contains('font-claude-message');

      const role: Role = isAssistant ? 'assistant' : 'user';
      const blocks: ContentBlock[] = [];

      // Extract code blocks
      const preBlocks = turnEl.querySelectorAll<HTMLPreElement>('pre');
      if (preBlocks.length > 0) {
        preBlocks.forEach((pre) => {
          const codeEl = pre.querySelector('code');
          const codeText = codeEl ? codeEl.textContent || '' : pre.textContent || '';
          let language = '';
          if (codeEl?.className) {
            const match = codeEl.className.match(/language-([a-zA-Z0-9_-]+)/);
            if (match) language = match[1];
          }
          if (codeText.trim()) {
            blocks.push({
              type: 'code',
              language,
              code: codeText.trim(),
            });
          }
        });
      }

      // Extract text
      const clone = turnEl.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('pre, button, svg, [role="button"]').forEach((el) => el.remove());
      const rawText = clone.textContent?.trim() || '';
      if (rawText) {
        blocks.unshift({ type: 'text', text: rawText });
      }

      if (blocks.length > 0) {
        messages.push({
          id: `claude-turn-${turnIndex}`,
          role,
          content: blocks,
          timestamp: Date.now(),
        });
      }
    }
  } else {
    // Fallback: interleave userTurns and assistantTurns
    const maxLen = Math.max(userTurns.length, assistantTurns.length);
    for (let i = 0; i < maxLen; i++) {
      if (userTurns[i]) {
        const text = userTurns[i].textContent?.trim() || '';
        if (text) {
          messages.push({
            id: `claude-user-${i}`,
            role: 'user',
            content: [{ type: 'text', text }],
            timestamp: Date.now(),
          });
        }
      }
      if (assistantTurns[i]) {
        const text = assistantTurns[i].textContent?.trim() || '';
        if (text) {
          messages.push({
            id: `claude-assistant-${i}`,
            role: 'assistant',
            content: [{ type: 'text', text }],
            timestamp: Date.now(),
          });
        }
      }
    }
  }

  const conversation: NormalizedConversation = {
    id: state.conversationId,
    title: state.title,
    sourceProvider: 'claude',
    createdAt: Date.now(),
    messages,
    metadata: {
      url: doc.location?.href,
      totalDetectedTurns: messages.length,
      extractedTurns: messages.length,
      isTruncated: false,
    },
  };

  return {
    conversation,
    isComplete: true,
    totalTurnsDetected: messages.length,
  };
}
