import { InjectionResult } from '../types.ts';
import { Logger } from '../../shared/logger.ts';

export async function waitForChatGPTInput(
  doc: Document,
  timeoutMs = 8000
): Promise<HTMLElement> {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const el =
        doc.querySelector<HTMLElement>('#prompt-textarea') ||
        doc.querySelector<HTMLElement>('div[contenteditable="true"][id="prompt-textarea"]') ||
        doc.querySelector<HTMLElement>('textarea[data-id="root"]');

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

export async function injectChatGPT(
  doc: Document,
  prompt: string
): Promise<InjectionResult> {
  try {
    const composer = await waitForChatGPTInput(doc);
    Logger.info('Found ChatGPT composer element');

    composer.focus();

    if (composer instanceof HTMLTextAreaElement) {
      composer.value = prompt;
      composer.dispatchEvent(new Event('input', { bubbles: true }));
      composer.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // ContentEditable div
      // Use execCommand for React / ProseMirror compatibility
      composer.textContent = '';
      let inserted = false;
      try {
        inserted = doc.execCommand('insertText', false, prompt);
      } catch {
        // execCommand not available (e.g. JSDOM) — fall through to fallback
      }
      if (!inserted) {
        // Fallback to direct text and input event
        composer.textContent = prompt;
        composer.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: prompt,
          })
        );
      }
    }

    const currentText = composer.textContent || (composer as HTMLTextAreaElement).value || '';
    const verified = currentText.length > 0 && currentText.includes('You are continuing');

    Logger.info('ChatGPT injection result', { verified });

    return {
      success: true,
      verified,
      composerElement: composer,
    };
  } catch (error) {
    Logger.error('Failed to inject into ChatGPT', error);
    return {
      success: false,
      verified: false,
      error: error instanceof Error ? error.message : 'Unknown injection error',
    };
  }
}
