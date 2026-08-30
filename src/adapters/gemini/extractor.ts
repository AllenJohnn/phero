import {
  NormalizedConversation,
  NormalizedMessage,
  ContentBlock,
  Role,
} from '../../core/models/conversation.ts';
import { ExtractionOptions, ExtractionResult } from '../types.ts';
import { detectGeminiState } from './detector.ts';
import { Logger } from '../../shared/logger.ts';

/**
 * Converts an HTML Table element into standard Markdown table format.
 */
function convertHtmlTableToMarkdown(table: HTMLTableElement): string {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) return '';

  const tableData: string[][] = [];
  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll('th, td')).map((cell) =>
      cell.textContent?.replace(/\|/g, '\\|').trim() || ''
    );
    if (cells.length > 0) {
      tableData.push(cells);
    }
  }

  if (tableData.length === 0) return '';

  const columnCount = Math.max(...tableData.map((r) => r.length));
  // Normalize row lengths
  const normalized = tableData.map((row) => {
    while (row.length < columnCount) row.push('');
    return row;
  });

  const headerRow = normalized[0];
  const headerLine = `| ${headerRow.join(' | ')} |`;
  const separatorLine = `| ${headerRow.map(() => '---').join(' | ')} |`;
  const bodyLines = normalized.slice(1).map((row) => `| ${row.join(' | ')} |`);

  return [headerLine, separatorLine, ...bodyLines].join('\n');
}

/**
 * Extracts structured content blocks (text, code) from a Gemini turn element.
 */
export function extractGeminiContentBlocks(element: HTMLElement): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  // Extract all code blocks first
  const preElements = element.querySelectorAll<HTMLElement>('pre, code-block, div.code-block');
  if (preElements.length > 0) {
    preElements.forEach((pre) => {
      const codeEl = pre.querySelector('code');
      const codeText = codeEl ? codeEl.textContent || '' : pre.textContent || '';

      let language = '';
      if (codeEl?.className) {
        const langMatch = codeEl.className.match(/language-([a-zA-Z0-9_-]+)/);
        if (langMatch) language = langMatch[1];
      }

      if (!language) {
        const headerEl = pre.querySelector(
          '.code-block-decoration span, .code-block-header span, .language-header, span.code-lang'
        );
        if (headerEl?.textContent) {
          const langText = headerEl.textContent.trim().toLowerCase();
          if (langText && !langText.includes('copy') && langText.length < 20) {
            language = langText;
          }
        }
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

  // Handle tables if present
  const tables = element.querySelectorAll<HTMLTableElement>('table');
  const tableMarkdowns: string[] = [];
  tables.forEach((t) => {
    const md = convertHtmlTableToMarkdown(t);
    if (md) tableMarkdowns.push(md);
  });

  // Extract cleaned text content
  const clone = element.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      'pre, code-block, div.code-block, table, button, svg, mat-icon, expand-code-button, .copy-button, tts-control, .bottom-actions, .feedback-container, .citation, sup, [role="button"], .sr-only, .hide-from-screen'
    )
    .forEach((el) => el.remove());

  const rawText = clone.textContent?.trim() || '';
  if (rawText) {
    blocks.unshift({ type: 'text', text: rawText });
  }

  // Add extracted markdown tables as text blocks if any
  for (const tableMd of tableMarkdowns) {
    blocks.push({ type: 'text', text: tableMd });
  }

  // Fallback: if blocks is still empty but container has text
  if (blocks.length === 0) {
    const directText = element.textContent?.trim() || '';
    if (directText) {
      blocks.push({ type: 'text', text: directText });
    }
  }

  return blocks;
}

/**
 * Multi-tier extractor for Google Gemini conversations.
 */
export async function extractGeminiConversation(
  doc: Document,
  _options: ExtractionOptions = {}
): Promise<ExtractionResult> {
  const state = detectGeminiState(doc);
  Logger.info('Extracting Gemini conversation', { isAvailable: state.isAvailable });

  const messages: NormalizedMessage[] = [];

  // Tier 1: Search for unified conversation turn containers
  const turnElements = Array.from(
    doc.querySelectorAll<HTMLElement>(
      'conversation-turn, div[data-test-id="conversation-turn"], .conversation-turn'
    )
  );

  if (turnElements.length > 0) {
    let turnIndex = 0;
    for (const turnEl of turnElements) {
      turnIndex++;
      const isAssistant =
        turnEl.querySelector('model-response, .response-container, message-content, div.markdown') ||
        turnEl.classList.contains('model-turn');

      const role: Role = isAssistant ? 'assistant' : 'user';
      const bodyContainer =
        turnEl.querySelector<HTMLElement>(
          'message-content, .response-container, .query-content, div.markdown'
        ) || turnEl;

      const content = extractGeminiContentBlocks(bodyContainer);
      if (content.length > 0) {
        messages.push({
          id: `gemini-turn-${turnIndex}`,
          role,
          content,
          timestamp: Date.now(),
        });
      }
    }
  } else {
    // Tier 2: Search for user queries and model responses individually
    const userElements = Array.from(
      doc.querySelectorAll<HTMLElement>(
        'user-query, .user-query-container, div[data-test-id="user-query"]'
      )
    );
    const assistantElements = Array.from(
      doc.querySelectorAll<HTMLElement>(
        'model-response, .response-container, div[data-test-id="model-response"]'
      )
    );

    const maxLen = Math.max(userElements.length, assistantElements.length);
    for (let i = 0; i < maxLen; i++) {
      if (userElements[i]) {
        const content = extractGeminiContentBlocks(userElements[i]);
        if (content.length > 0) {
          messages.push({
            id: `gemini-user-${i + 1}`,
            role: 'user',
            content,
            timestamp: Date.now(),
          });
        }
      }
      if (assistantElements[i]) {
        const content = extractGeminiContentBlocks(assistantElements[i]);
        if (content.length > 0) {
          messages.push({
            id: `gemini-assistant-${i + 1}`,
            role: 'assistant',
            content,
            timestamp: Date.now(),
          });
        }
      }
    }
  }

  const conversation: NormalizedConversation = {
    id: state.conversationId,
    title: state.title,
    sourceProvider: 'gemini',
    createdAt: Date.now(),
    messages,
    metadata: {
      url: doc.location?.href,
      totalDetectedTurns: messages.length,
      extractedTurns: messages.length,
      isTruncated: false,
    },
  };

  Logger.info(`Extracted ${messages.length} messages from Gemini`);

  return {
    conversation,
    isComplete: true,
    totalTurnsDetected: messages.length,
  };
}
