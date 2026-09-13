import { Logger } from '../../shared/logger.js';
import { CONTINUATION_HEADER_MARKER } from '../../core/context/prompt-builder.js';
import { waitForComposer, fallbackDOMInjection } from '../../shared/composer-utils.js';

const GEMINI_COMPOSER_SELECTORS = [
  'rich-textarea div.ql-editor[contenteditable="true"]',
  'div.ql-editor[contenteditable="true"]',
  'rich-textarea div[contenteditable="true"]',
  'div[contenteditable="true"][role="textbox"]',
  'div[contenteditable="true"][aria-label*="prompt" i]',
  'div[contenteditable="true"][aria-label*="Ask" i]',
  'div[contenteditable="true"][aria-label*="Gemini" i]',
  'div[contenteditable="true"]',
  'textarea[placeholder*="Ask" i]',
  'textarea'
];

export function waitForGeminiInput(doc, timeoutMs = 14000) {
  return waitForComposer(doc, { selectors: GEMINI_COMPOSER_SELECTORS, providerName: 'Gemini', timeoutMs });
}

export async function injectGemini(doc, prompt) {
  try {
    const composer = await waitForGeminiInput(doc);
    Logger.info('Focusing and injecting prompt into Gemini composer');
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
        Logger.warn('execCommand insertText failed on Gemini, using DOM insertion fallback', {
          err: String(err)
        });
      }
      if (!inserted || !composer.textContent?.includes(CONTINUATION_HEADER_MARKER)) {
        fallbackDOMInjection(composer, prompt, doc);
        // Gemini's Quill editor needs an additional keyup to register the change
        composer.dispatchEvent(new KeyboardEvent('keyup', {
          bubbles: true,
          key: ' '
        }));
      }
    } else if (composer instanceof HTMLTextAreaElement) {
      composer.value = prompt;
      composer.dispatchEvent(new Event('input', { bubbles: true }));
      composer.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 100));
    const contentText = composer.textContent || composer.value || '';
    const verified = contentText.length > 50 && contentText.includes(CONTINUATION_HEADER_MARKER) && contentText.includes('INSTRUCTIONS');
    Logger.info('Gemini injection verification status', {
      verified,
      contentLength: contentText.length
    });
    composer.focus();
    return {
      success: true,
      verified,
      composerElement: composer,
      error: verified ? undefined : 'Injected text could not be verified in Gemini editor.'
    };
  } catch (error) {
    Logger.error('Failed to inject into Gemini', error);
    return {
      success: false,
      verified: false,
      error: error instanceof Error ? error.message : 'Unknown Gemini injection error'
    };
  }
}