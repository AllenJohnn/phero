import { InjectionResult } from '../types.ts';
import { Logger } from '../../shared/logger.ts';

/**
 * Dynamically waits for the Claude composer editor to mount in the DOM.
 */
export async function waitForClaudeInput(
  doc: Document,
  timeoutMs = 12000
): Promise<HTMLElement> {
  const startTime = Date.now();
  Logger.info('Waiting for Claude composer editor...');

  return new Promise((resolve, reject) => {
    // Quick check function
    const findComposer = (): HTMLElement | null => {
      return (
        doc.querySelector<HTMLElement>('div.ProseMirror[contenteditable="true"]') ||
        doc.querySelector<HTMLElement>('div[contenteditable="true"][data-placeholder]') ||
        doc.querySelector<HTMLElement>('fieldset div[contenteditable="true"]') ||
        doc.querySelector<HTMLElement>('div[contenteditable="true"]') ||
        doc.querySelector<HTMLElement>('textarea[placeholder*="Reply"]') ||
        doc.querySelector<HTMLElement>('textarea')
      );
    };

    const immediate = findComposer();
    if (immediate) {
      Logger.info('Found Claude composer immediately');
      resolve(immediate);
      return;
    }

    // Set up MutationObserver
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
      attributes: true,
    });

    // Backup timeout
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

/**
 * Injects continuation prompt into Claude's ProseMirror editor without auto-submitting.
 */
export async function injectClaude(
  doc: Document,
  prompt: string
): Promise<InjectionResult> {
  try {
    const composer = await waitForClaudeInput(doc);
    Logger.info('Focusing and injecting prompt into Claude composer');

    // 1. Focus the composer
    composer.focus();

    // 2. Clear any empty placeholder paragraph
    const isContentEditable = composer.isContentEditable || composer.getAttribute('contenteditable') === 'true';
    if (isContentEditable) {
      // Create a clean selection inside composer
      const selection = doc.getSelection();
      const range = doc.createRange();
      range.selectNodeContents(composer);
      selection?.removeAllRanges();
      selection?.addRange(range);

      // 3. Try standard document.execCommand for ProseMirror/Lexical
      let inserted = false;
      try {
        inserted = doc.execCommand('insertText', false, prompt);
      } catch (err) {
        Logger.warn('execCommand insertText failed, trying DOM fallback', { err: String(err) });
      }

      // 4. Fallback if execCommand did not work or returned false
      if (!inserted || !composer.textContent?.includes('You are continuing')) {
        // Build paragraphs for ProseMirror
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

        // Dispatch synthetic beforeinput and InputEvents to notify ProseMirror / Lexical state listeners
        composer.dispatchEvent(
          new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: prompt,
          })
        );
        composer.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: prompt,
          })
        );
        composer.dispatchEvent(new Event('input', { bubbles: true }));
        composer.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (composer instanceof HTMLTextAreaElement) {
      composer.value = prompt;
      composer.dispatchEvent(new Event('input', { bubbles: true }));
      composer.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 5. Verification step: Ensure text exists inside composer
    // Give framework microtask to update
    await new Promise((r) => setTimeout(r, 80));

    const contentText = composer.textContent || (composer as HTMLTextAreaElement).value || '';
    const verified =
      contentText.length > 50 &&
      contentText.includes('You are continuing') &&
      contentText.includes('INSTRUCTIONS');

    Logger.info('Claude injection verification status', {
      verified,
      contentLength: contentText.length,
    });

    // Re-focus composer and scroll to bottom so user can review
    composer.focus();

    return {
      success: true,
      verified,
      composerElement: composer,
      error: verified ? undefined : 'Injected text could not be verified in Claude editor.',
    };
  } catch (error) {
    Logger.error('Failed to inject into Claude', error);
    return {
      success: false,
      verified: false,
      error: error instanceof Error ? error.message : 'Unknown Claude injection error',
    };
  }
}
