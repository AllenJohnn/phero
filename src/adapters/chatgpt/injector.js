import { Logger } from '../../shared/logger.js';
import { CONTINUATION_HEADER_MARKER } from '../../core/context/prompt-builder.js';
export async function waitForChatGPTInput(doc, timeoutMs = 8000) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const el = doc.querySelector('#prompt-textarea') || doc.querySelector('div[contenteditable="true"][id="prompt-textarea"]') || doc.querySelector('textarea[data-id="root"]');
      if (el) {
        resolve(el);
        return;
      }
      if (Date.now() - startTime >= timeoutMs) {
        reject(new Error('Timed out waiting for ChatGPT composer input.'));
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}
export async function injectChatGPT(doc, prompt) {
  try {
    const composer = await waitForChatGPTInput(doc);
    Logger.info('Found ChatGPT composer element');
    composer.focus();
    if (composer instanceof HTMLTextAreaElement) {
      composer.value = prompt;
      composer.dispatchEvent(new Event('input', {
        bubbles: true
      }));
      composer.dispatchEvent(new Event('change', {
        bubbles: true
      }));
    } else {
      composer.textContent = '';
      let inserted = false;
      try {
        inserted = doc.execCommand('insertText', false, prompt);
      } catch {}
      if (!inserted) {
        composer.textContent = prompt;
        composer.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: prompt
        }));
      }
    }
    const currentText = composer.textContent || composer.value || '';
    const verified = currentText.length > 0 && currentText.includes(CONTINUATION_HEADER_MARKER);
    Logger.info('ChatGPT injection result', {
      verified
    });
    return {
      success: true,
      verified,
      composerElement: composer
    };
  } catch (error) {
    Logger.error('Failed to inject into ChatGPT', error);
    return {
      success: false,
      verified: false,
      error: error instanceof Error ? error.message : 'Unknown injection error'
    };
  }
}