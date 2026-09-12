import { Logger } from '../../shared/logger.js';
import { CONTINUATION_HEADER_MARKER } from '../../core/context/prompt-builder.js';
export async function waitForGeminiInput(doc, timeoutMs = 14000) {
  const startTime = Date.now();
  Logger.info('Waiting for Gemini composer editor...');
  return new Promise((resolve, reject) => {
    const findComposer = () => {
      return doc.querySelector('rich-textarea div.ql-editor[contenteditable="true"]') || doc.querySelector('div.ql-editor[contenteditable="true"]') || doc.querySelector('rich-textarea div[contenteditable="true"]') || doc.querySelector('div[contenteditable="true"][role="textbox"]') || doc.querySelector('div[contenteditable="true"][aria-label*="prompt" i]') || doc.querySelector('div[contenteditable="true"][aria-label*="Ask" i]') || doc.querySelector('div[contenteditable="true"][aria-label*="Gemini" i]') || doc.querySelector('div[contenteditable="true"]') || doc.querySelector('textarea[placeholder*="Ask" i]') || doc.querySelector('textarea');
    };
    const immediate = findComposer();
    if (immediate) {
      Logger.info('Found Gemini composer immediately');
      resolve(immediate);
      return;
    }
    const observer = new MutationObserver(() => {
      const el = findComposer();
      if (el) {
        observer.disconnect();
        Logger.info('Found Gemini composer via MutationObserver');
        resolve(el);
      } else if (Date.now() - startTime >= timeoutMs) {
        observer.disconnect();
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for Gemini composer.`));
      }
    });
    observer.observe(doc.body || doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true
    });
    setTimeout(() => {
      observer.disconnect();
      const el = findComposer();
      if (el) {
        resolve(el);
      } else {
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for Gemini composer.`));
      }
    }, timeoutMs);
  });
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
        composer.innerHTML = '';
        const lines = prompt.split('\n');
        for (const line of lines) {
          const p = doc.createElement('p');
          if (line.trim().length === 0) {
            p.innerHTML = '<br>';
          } else {
            p.textContent = line;
          }
          composer.appendChild(p);
        }
        composer.dispatchEvent(new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: prompt
        }));
        composer.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: prompt
        }));
        composer.dispatchEvent(new Event('input', {
          bubbles: true
        }));
        composer.dispatchEvent(new Event('change', {
          bubbles: true
        }));
        composer.dispatchEvent(new KeyboardEvent('keyup', {
          bubbles: true,
          key: ' '
        }));
      }
    } else if (composer instanceof HTMLTextAreaElement) {
      composer.value = prompt;
      composer.dispatchEvent(new Event('input', {
        bubbles: true
      }));
      composer.dispatchEvent(new Event('change', {
        bubbles: true
      }));
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