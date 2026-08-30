import {
  NormalizedConversation,
  NormalizedMessage,
  ContentBlock,
  Role,
} from '../../core/models/conversation.ts';
import { ExtractionOptions, ExtractionResult } from '../types.ts';
import { detectClaudeState } from './detector.ts';
import { Logger } from '../../shared/logger.ts';

/**
 * Converts an HTML table element to Markdown table format.
 */
function convertTableToMarkdown(table: HTMLTableElement): string {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) return '';

  const tableData: string[][] = [];
  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll('th, td')).map(
      (cell) => cell.textContent?.replace(/\|/g, '\\|').trim() || ''
    );
    if (cells.length > 0) {
      tableData.push(cells);
    }
  }

  if (tableData.length === 0) return '';

  const columnCount = Math.max(...tableData.map((r) => r.length));
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
 * Extracts artifact metadata from a Claude artifact container element.
 * Returns a text block representing the artifact, or null if extraction fails.
 */
function extractArtifactBlock(artifactEl: HTMLElement): ContentBlock | null {
  // Try to find artifact title/name
  const titleEl = artifactEl.querySelector<HTMLElement>(
    '[data-testid="artifact-title"], .artifact-title, .artifact-name, header, [role="heading"]'
  );
  const artifactTitle = titleEl?.textContent?.trim() || '';

  // Try to find artifact content
  const contentEl = artifactEl.querySelector<HTMLElement>(
    '.artifact-content, [data-testid="artifact-content"], .code-content, pre, code'
  );
  const artifactContent = contentEl?.textContent?.trim() || '';

  // Try to detect artifact type from attributes or class names
  let artifactType = '';
  const typeAttr = artifactEl.getAttribute('data-artifact-type') ||
    artifactEl.getAttribute('data-type') || '';
  if (typeAttr) {
    artifactType = typeAttr;
  } else if (artifactEl.querySelector('pre, code')) {
    artifactType = 'code';
  } else if (artifactEl.querySelector('svg, canvas')) {
    artifactType = 'visual';
  }

  if (artifactContent) {
    // Check if it's a code artifact
    if (artifactType === 'code' || contentEl?.tagName === 'PRE' || contentEl?.tagName === 'CODE') {
      const codeEl = contentEl?.querySelector('code') || contentEl;
      let language = '';
      if (codeEl?.className) {
        const langMatch = codeEl.className.match(/language-([a-zA-Z0-9_-]+)/);
        if (langMatch) language = langMatch[1];
      }
      return {
        type: 'code',
        language,
        code: artifactContent,
      } as ContentBlock;
    }

    const header = artifactTitle
      ? `=== ARTIFACT: ${artifactTitle} ===\n`
      : '=== ARTIFACT ===\n';
    return {
      type: 'text',
      text: `${header}${artifactContent}`,
    };
  }

  // Cannot extract content — represent honestly
  if (artifactTitle) {
    return {
      type: 'text',
      text: `[Artifact: "${artifactTitle}" — content unavailable for automatic transfer]`,
    };
  }

  return {
    type: 'text',
    text: '[Artifact omitted: unavailable for automatic transfer]',
  };
}

/**
 * Extracts structured content blocks from a Claude turn element.
 * Handles code blocks, tables, artifacts, and strips UI noise.
 */
export function extractClaudeContentBlocks(turnEl: HTMLElement): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  // 1. Extract artifact containers before they get removed with UI noise
  const artifactContainers = turnEl.querySelectorAll<HTMLElement>(
    '[data-testid="artifact-block"], .artifact-container, .artifact-panel, [data-artifact-id], div[class*="artifact"]'
  );
  for (const artifactEl of Array.from(artifactContainers)) {
    const block = extractArtifactBlock(artifactEl);
    if (block) {
      blocks.push(block);
    }
  }

  // 2. Extract code blocks (outside artifacts)
  const preBlocks = turnEl.querySelectorAll<HTMLPreElement>('pre');
  for (const pre of Array.from(preBlocks)) {
    // Skip if this pre is inside an artifact we already processed
    if (pre.closest('[data-testid="artifact-block"], .artifact-container, .artifact-panel, [data-artifact-id]')) {
      continue;
    }

    const codeEl = pre.querySelector('code');
    const codeText = codeEl ? codeEl.textContent || '' : pre.textContent || '';
    let language = '';

    if (codeEl?.className) {
      const langMatch = codeEl.className.match(/language-([a-zA-Z0-9_-]+)/);
      if (langMatch) language = langMatch[1];
    }

    // Fallback: check for language header element that Claude uses
    if (!language) {
      const headerEl = pre.previousElementSibling;
      if (headerEl && headerEl.textContent) {
        const headerText = headerEl.textContent.trim().toLowerCase();
        if (headerText && !headerText.includes('copy') && headerText.length < 30) {
          language = headerText;
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
  }

  // 3. Extract tables as markdown
  const tables = turnEl.querySelectorAll<HTMLTableElement>('table');
  for (const table of Array.from(tables)) {
    const md = convertTableToMarkdown(table);
    if (md) {
      blocks.push({ type: 'text', text: md });
    }
  }

  // 4. Extract cleaned text content
  const clone = turnEl.cloneNode(true) as HTMLElement;

  // Remove elements that are UI noise, not conversation content
  clone.querySelectorAll([
    // Code blocks (already extracted above)
    'pre',
    // Tables (already extracted above)
    'table',
    // Artifacts (already extracted above)
    '[data-testid="artifact-block"]',
    '.artifact-container',
    '.artifact-panel',
    '[data-artifact-id]',
    // Thinking/reasoning blocks
    'details',
    '[data-testid="thought-block"]',
    '.thinking-block',
    '.reasoning-summary',
    'div[class*="thinking"]',
    // UI controls
    'button',
    'svg',
    '[role="button"]',
    '.sr-only',
    // Copy/feedback/regenerate controls
    '.copy-button',
    '[data-testid="copy-turn-action-button"]',
    '.feedback-container',
    '[data-testid="good-response-turn-action-button"]',
    '[data-testid="bad-response-turn-action-button"]',
    '.retry-button',
    '[data-testid="regenerate-button"]',
    // Citation/source panels
    '.citation',
    'sup',
    '.source-panel',
    '[data-testid="citation"]',
    // Artifact open/view buttons
    '[data-testid="view-artifact-button"]',
    '.artifact-toggle',
  ].join(', ')).forEach((el) => el.remove());

  const rawText = clone.textContent?.trim() || '';
  if (rawText) {
    blocks.unshift({ type: 'text', text: rawText });
  }

  // Fallback if no blocks extracted but container has text
  if (blocks.length === 0) {
    const directText = turnEl.textContent?.trim() || '';
    if (directText) {
      blocks.push({ type: 'text', text: directText });
    }
  }

  return blocks;
}

/**
 * Multi-tier extractor for Claude conversations.
 * Handles turn containers, role detection, code blocks, tables, artifacts,
 * and strips thinking blocks, UI noise, and provider controls.
 */
export async function extractClaudeConversation(
  doc: Document,
  _options: ExtractionOptions = {}
): Promise<ExtractionResult> {
  const state = detectClaudeState(doc);
  Logger.info('Extracting Claude conversation', {
    isAvailable: state.isAvailable,
    messageCount: state.messageCount ?? 0,
  });

  const messages: NormalizedMessage[] = [];
  let isComplete = state.isHistoryFullyLoaded ?? true;
  let warning: string | undefined;

  // Tier 1: Structured turn containers with data attributes
  let turnElements = Array.from(
    doc.querySelectorAll<HTMLElement>(
      'div[data-test-render-count], div[data-testid="chat-message"]'
    )
  );

  // Tier 2: group/message containers
  if (turnElements.length === 0) {
    turnElements = Array.from(
      doc.querySelectorAll<HTMLElement>('div.group\\/message')
    );
  }

  if (turnElements.length > 0) {
    let turnIndex = 0;
    for (const turnEl of turnElements) {
      turnIndex++;

      // Determine role
      const isAssistant =
        !!turnEl.querySelector('.font-claude-message') ||
        !!turnEl.querySelector('div.standard-markdown') ||
        turnEl.classList.contains('font-claude-message') ||
        !!turnEl.querySelector('[data-message-author-role="assistant"]') ||
        !!turnEl.querySelector('.agent-turn');

      const isUser =
        !!turnEl.querySelector('.font-user-message') ||
        !!turnEl.querySelector('[data-message-author-role="user"]') ||
        turnEl.classList.contains('font-user-message');

      let role: Role;
      if (isAssistant) {
        role = 'assistant';
      } else if (isUser) {
        role = 'user';
      } else {
        // Fallback: alternate turns starting with user
        role = turnIndex % 2 === 1 ? 'user' : 'assistant';
      }

      const blocks = extractClaudeContentBlocks(turnEl);

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
    // Tier 3 Fallback: separate user/assistant element searches
    const userTurns = Array.from(
      doc.querySelectorAll<HTMLElement>(
        '.font-user-message, div[data-is-streaming="false"]:has(.font-user-message), div.whitespace-pre-wrap'
      )
    );
    const assistantTurns = Array.from(
      doc.querySelectorAll<HTMLElement>(
        '.font-claude-message, div.standard-markdown'
      )
    );

    const maxLen = Math.max(userTurns.length, assistantTurns.length);
    for (let i = 0; i < maxLen; i++) {
      if (userTurns[i]) {
        const blocks = extractClaudeContentBlocks(userTurns[i]);
        if (blocks.length > 0) {
          messages.push({
            id: `claude-user-${i + 1}`,
            role: 'user',
            content: blocks,
            timestamp: Date.now(),
          });
        }
      }
      if (assistantTurns[i]) {
        const blocks = extractClaudeContentBlocks(assistantTurns[i]);
        if (blocks.length > 0) {
          messages.push({
            id: `claude-assistant-${i + 1}`,
            role: 'assistant',
            content: blocks,
            timestamp: Date.now(),
          });
        }
      }
    }
  }

  // Check completeness
  if (!isComplete || (state.messageCount && state.messageCount > 0 && messages.length < state.messageCount)) {
    isComplete = false;
    warning = 'Some earlier messages may not be loaded in the page view.';
  }

  const conversation: NormalizedConversation = {
    id: state.conversationId,
    title: state.title,
    sourceProvider: 'claude',
    createdAt: Date.now(),
    messages,
    metadata: {
      url: doc.location?.href,
      totalDetectedTurns: state.messageCount || messages.length,
      extractedTurns: messages.length,
      isTruncated: !isComplete,
    },
  };

  Logger.info(`Extracted ${messages.length} messages from Claude`, {
    isComplete,
    hasWarning: !!warning,
  });

  return {
    conversation,
    isComplete,
    warning,
    totalTurnsDetected: messages.length,
  };
}
