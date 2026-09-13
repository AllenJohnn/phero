import { detectGeminiState } from './detector.js';
import { Logger } from '../../shared/logger.js';
import { convertTableToMarkdown } from '../../shared/dom-utils.js';
export function extractGeminiContentBlocks(element) {
  const blocks = [];
  const preElements = element.querySelectorAll('pre, code-block, div.code-block');
  if (preElements.length > 0) {
    preElements.forEach(pre => {
      const codeEl = pre.querySelector('code');
      const codeText = codeEl ? codeEl.textContent || '' : pre.textContent || '';
      let language = '';
      if (codeEl?.className) {
        const langMatch = codeEl.className.match(/language-([a-zA-Z0-9_-]+)/);
        if (langMatch) language = langMatch[1];
      }
      if (!language) {
        const headerEl = pre.querySelector('.code-block-decoration span, .code-block-header span, .language-header, span.code-lang');
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
          code: codeText.trim()
        });
      }
    });
  }
  const tables = element.querySelectorAll('table');
  const tableMarkdowns = [];
  tables.forEach(t => {
    const md = convertTableToMarkdown(t);
    if (md) tableMarkdowns.push(md);
  });
  const images = element.querySelectorAll('img');
  for (const img of Array.from(images)) {
    const src = img.getAttribute('src');
    if (src && !src.startsWith('data:image/svg+xml')) {
      blocks.push({
        type: 'image',
        url: src,
        alt: img.getAttribute('alt') || undefined
      });
    }
  }
  const fileAttachments = element.querySelectorAll('file-attachment, .file-attachment-chip');
  for (const fileEl of Array.from(fileAttachments)) {
    const name = fileEl.textContent?.trim() || 'attached_file';
    blocks.push({
      type: 'file',
      name
    });
  }
  const clone = element.cloneNode(true);
  clone.querySelectorAll('pre, code-block, div.code-block, table, img, file-attachment, .file-attachment-chip, button, svg, mat-icon, expand-code-button, .copy-button, tts-control, .bottom-actions, .feedback-container, .citation, sup, [role="button"], .sr-only, .hide-from-screen').forEach(el => el.remove());
  const rawText = clone.textContent?.trim() || '';
  if (rawText) {
    blocks.unshift({
      type: 'text',
      text: rawText
    });
  }
  for (const tableMd of tableMarkdowns) {
    blocks.push({
      type: 'text',
      text: tableMd
    });
  }
  if (blocks.length === 0) {
    const directText = element.textContent?.trim() || '';
    if (directText) {
      blocks.push({
        type: 'text',
        text: directText
      });
    }
  }
  return blocks;
}
import { GeminiCaptureStrategy } from './capture.js';
import { CaptureOrchestrator } from '../../core/capture/orchestrator.js';
export async function extractGeminiConversation(doc, options = {}) {
  const state = detectGeminiState(doc);
  Logger.info('Extracting Gemini conversation', {
    isAvailable: state.isAvailable
  });
  const strategy = new GeminiCaptureStrategy();
  const captureResult = await CaptureOrchestrator.executeCapture(doc, strategy, {
    providerId: 'gemini',
    conversationId: state.conversationId,
    title: state.title
  }, {
    skipIncompleteCheck: options.skipIncompleteCheck
  });
  return {
    conversation: captureResult.conversation,
    isComplete: captureResult.isComplete,
    warning: captureResult.warning,
    totalTurnsDetected: captureResult.totalCaptured
  };
}