import { Logger } from '../../shared/logger.js';
export async function waitForClaudeInput(doc, timeoutMs = 12000) {
  const startTime = Date.now();
  Logger.info('Waiting for Claude composer editor...');
  return new Promise((resolve, reject) => {
    const findComposer = () => {
      return doc.querySelector('div.ProseMirror[contenteditable="true"]') || doc.querySelector('div[contenteditable="true"][data-placeholder]') || doc.querySelector('fieldset div[contenteditable="true"]') || doc.querySelector('div[contenteditable="true"]') || doc.querySelector('textarea[placeholder*="Reply"]') || doc.querySelector('textarea');
    };
    const immediate = findComposer();
    if (immediate) {
      Logger.info('Found Claude composer immediately');
      resolve(immediate);
      return;
    }
    const observer = new MutationObserver(() => {
      const el = findComposer();
      if (el) {
        observer.disconnect();
        Logger.info('Found Claude composer via MutationObserver');
        resolve(el);
      } else if (Date.now() - startTime >= timeoutMs) {
        observer.disconnect();
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for Claude composer.`));
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
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for Claude composer.`));
      }
    }, timeoutMs);
  });
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
      if (!inserted || !composer.textContent?.includes('You are continuing')) {
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
    await new Promise(r => setTimeout(r, 80));
    const contentText = composer.textContent || composer.value || '';
    const verified = contentText.length > 50 && contentText.includes('You are continuing') && contentText.includes('INSTRUCTIONS');
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