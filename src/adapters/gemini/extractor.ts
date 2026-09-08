import {
  ContentBlock,
} from '../../core/models/conversation.ts';
import { ExtractionOptions, ExtractionResult } from '../types.ts';
import { detectGeminiState } from './detector.ts';
import { Logger } from '../../shared/logger.ts';


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


export function extractGeminiContentBlocks(element: HTMLElement): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  
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

  
  const tables = element.querySelectorAll<HTMLTableElement>('table');
  const tableMarkdowns: string[] = [];
  tables.forEach((t) => {
    const md = convertHtmlTableToMarkdown(t);
    if (md) tableMarkdowns.push(md);
  });

  
  const images = element.querySelectorAll<HTMLImageElement>('img');
  for (const img of Array.from(images)) {
    const src = img.getAttribute('src');
    if (src && !src.startsWith('data:image/svg+xml')) {
      blocks.push({ type: 'image', url: src, alt: img.getAttribute('alt') || undefined });
    }
  }

  
  const fileAttachments = element.querySelectorAll<HTMLElement>('file-attachment, .file-attachment-chip');
  for (const fileEl of Array.from(fileAttachments)) {
    const name = fileEl.textContent?.trim() || 'attached_file';
    blocks.push({ type: 'file', name });
  }

  
  const clone = element.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      'pre, code-block, div.code-block, table, img, file-attachment, .file-attachment-chip, button, svg, mat-icon, expand-code-button, .copy-button, tts-control, .bottom-actions, .feedback-container, .citation, sup, [role="button"], .sr-only, .hide-from-screen'
    )
    .forEach((el) => el.remove());

  const rawText = clone.textContent?.trim() || '';
  if (rawText) {
    blocks.unshift({ type: 'text', text: rawText });
  }

  
  for (const tableMd of tableMarkdowns) {
    blocks.push({ type: 'text', text: tableMd });
  }

  
  if (blocks.length === 0) {
    const directText = element.textContent?.trim() || '';
    if (directText) {
      blocks.push({ type: 'text', text: directText });
    }
  }

  return blocks;
}

import { GeminiCaptureStrategy } from './capture.ts';
import { CaptureOrchestrator } from '../../core/capture/orchestrator.ts';


export async function extractGeminiConversation(
  doc: Document,
  options: ExtractionOptions = {}
): Promise<ExtractionResult> {
  const state = detectGeminiState(doc);
  Logger.info('Extracting Gemini conversation', { isAvailable: state.isAvailable });

  const strategy = new GeminiCaptureStrategy();
  const captureResult = await CaptureOrchestrator.executeCapture(
    doc,
    strategy,
    {
      providerId: 'gemini',
      conversationId: state.conversationId,
      title: state.title,
    },
    {
      skipIncompleteCheck: options.skipIncompleteCheck,
    }
  );

  return {
    conversation: captureResult.conversation,
    isComplete: captureResult.isComplete,
    warning: captureResult.warning,
    totalTurnsDetected: captureResult.totalCaptured,
  };
}
