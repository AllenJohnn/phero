import { Logger } from '../../shared/logger.js';
import { CONTINUATION_HEADER_MARKER } from '../../core/context/prompt-builder.js';
import { waitForComposer, fallbackDOMInjection } from '../../shared/composer-utils.js';

const CLAUDE_COMPOSER_SELECTORS = [
  'div.ProseMirror[contenteditable="true"]',
  'div[contenteditable="true"][data-placeholder]',
  'fieldset div[contenteditable="true"]',
  'div[contenteditable="true"]',
  'textarea[placeholder*="Reply"]',
  'textarea'
];

export function waitForClaudeInput(doc, timeoutMs = 12000) {
  return waitForComposer(doc, { selectors: CLAUDE_COMPOSER_SELECTORS, providerName: 'Claude', timeoutMs });
}

export async function injectClaude(doc, prompt) {
  try {
    const composer = await waitForClaudeInput(doc);
    Logger.info('Focusing and injecting prompt into Claude composer');
    composer.focus();
    const isContentEditable = composer.isContentEditable || composer.getAttribute('contenteditable') === 'true';
    if (isContentEditable) {
      const selection = doc.getSelection();
      const range = doc.createRange();
      range.selectNodeContents(composer);
      selection?.removeAllRanges();
      selection?.addRange(range);
      let inserted = false;
      try {
        inserted = doc.execCommand('insertText', false, prompt);
      } catch (err) {
        Logger.warn('execCommand insertText failed, trying DOM fallback', {
          err: String(err)
        });
      }
      if (!inserted || !composer.textContent?.includes(CONTINUATION_HEADER_MARKER)) {
        fallbackDOMInjection(composer, prompt, doc);
      }
    } else if (composer instanceof HTMLTextAreaElement) {
      composer.value = prompt;
      composer.dispatchEvent(new Event('input', { bubbles: true }));
      composer.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 80));
    const contentText = composer.textContent || composer.value || '';
    const verified = contentText.length > 50 && contentText.includes(CONTINUATION_HEADER_MARKER) && contentText.includes('INSTRUCTIONS');
    Logger.info('Claude injection verification status', {
      verified,
      contentLength: contentText.length
    });
    composer.focus();
    return {
      success: true,
      verified,
      composerElement: composer,
      error: verified ? undefined : 'Injected text could not be verified in Claude editor.'
    };
  } catch (error) {
    Logger.error('Failed to inject into Claude', error);
    return {
      success: false,
      verified: false,
      error: error instanceof Error ? error.message : 'Unknown Claude injection error'
    };
  }
}