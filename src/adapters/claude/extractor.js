import { detectClaudeState } from './detector.js';
import { Logger } from '../../shared/logger.js';
import { convertTableToMarkdown } from '../../shared/dom-utils.js';
function extractArtifactBlock(artifactEl) {
  const titleEl = artifactEl.querySelector('[data-testid="artifact-title"], .artifact-title, .artifact-name, header, [role="heading"]');
  const artifactTitle = titleEl?.textContent?.trim() || '';
  const contentEl = artifactEl.querySelector('.artifact-content, [data-testid="artifact-content"], .code-content, pre, code');
  const artifactContent = contentEl?.textContent?.trim() || '';
  let artifactType = '';
  const typeAttr = artifactEl.getAttribute('data-artifact-type') || artifactEl.getAttribute('data-type') || '';
  if (typeAttr) {
    artifactType = typeAttr;
  } else if (artifactEl.querySelector('pre, code')) {
    artifactType = 'code';
  } else if (artifactEl.querySelector('svg, canvas')) {
    artifactType = 'visual';
  }
  if (artifactContent) {
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
        code: artifactContent
      };
    }
    const header = artifactTitle ? `=== ARTIFACT: ${artifactTitle} ===\n` : '=== ARTIFACT ===\n';
    return {
      type: 'text',
      text: `${header}${artifactContent}`
    };
  }
  if (artifactTitle) {
    return {
      type: 'text',
      text: `[Artifact: "${artifactTitle}" — content unavailable for automatic transfer]`
    };
  }
  return {
    type: 'text',
    text: '[Artifact omitted: unavailable for automatic transfer]'
  };
}
export function extractClaudeContentBlocks(turnEl) {
  const blocks = [];
  const artifactContainers = turnEl.querySelectorAll('[data-testid="artifact-block"], .artifact-container, .artifact-panel, [data-artifact-id], div[class*="artifact"]');
  for (const artifactEl of Array.from(artifactContainers)) {
    const block = extractArtifactBlock(artifactEl);
    if (block) {
      blocks.push(block);
    }
  }
  const preBlocks = turnEl.querySelectorAll('pre');
  for (const pre of Array.from(preBlocks)) {
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
        code: codeText.trim()
      });
    }
  }
  const tables = turnEl.querySelectorAll('table');
  for (const table of Array.from(tables)) {
    const md = convertTableToMarkdown(table);
    if (md) {
      blocks.push({
        type: 'text',
        text: md
      });
    }
  }
  const images = turnEl.querySelectorAll('img');
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
  const fileAttachments = turnEl.querySelectorAll('.file-attachment, [data-testid="file-attachment"]');
  for (const fileEl of Array.from(fileAttachments)) {
    const name = fileEl.textContent?.trim() || 'attached_file';
    blocks.push({
      type: 'file',
      name
    });
  }
  const clone = turnEl.cloneNode(true);
  clone.querySelectorAll(['pre', 'table', '[data-testid="artifact-block"]', '.artifact-container', '.artifact-panel', '[data-artifact-id]', 'img', '.file-attachment', '[data-testid="file-attachment"]', 'details', '[data-testid="thought-block"]', '.thinking-block', '.reasoning-summary', 'div[class*="thinking"]', 'button', 'svg', '[role="button"]', '.sr-only', '.copy-button', '[data-testid="copy-turn-action-button"]', '.feedback-container', '[data-testid="good-response-turn-action-button"]', '[data-testid="bad-response-turn-action-button"]', '.retry-button', '[data-testid="regenerate-button"]', '.citation', 'sup', '.source-panel', '[data-testid="citation"]', '[data-testid="view-artifact-button"]', '.artifact-toggle'].join(', ')).forEach(el => el.remove());
  const rawText = clone.textContent?.trim() || '';
  if (rawText) {
    blocks.unshift({
      type: 'text',
      text: rawText
    });
  }
  if (blocks.length === 0) {
    const directText = turnEl.textContent?.trim() || '';
    if (directText) {
      blocks.push({
        type: 'text',
        text: directText
      });
    }
  }
  return blocks;
}
import { ClaudeCaptureStrategy } from './capture.js';
import { CaptureOrchestrator } from '../../core/capture/orchestrator.js';
export async function extractClaudeConversation(doc, options = {}) {
  const state = detectClaudeState(doc);
  Logger.info('Extracting Claude conversation', {
    isAvailable: state.isAvailable,
    messageCount: state.messageCount ?? 0
  });
  const strategy = new ClaudeCaptureStrategy();
  const captureResult = await CaptureOrchestrator.executeCapture(doc, strategy, {
    providerId: 'claude',
    conversationId: state.conversationId,
    title: state.title
  }, {
    skipIncompleteCheck: options.skipIncompleteCheck,
    scrollDelayMs: options.scrollDelayMs
  });
  return {
    conversation: captureResult.conversation,
    isComplete: captureResult.isComplete,
    warning: captureResult.warning,
    totalTurnsDetected: captureResult.totalCaptured
  };
}