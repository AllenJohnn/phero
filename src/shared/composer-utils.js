import { Logger } from './logger.js';

export function waitForComposer(doc, { selectors, providerName, timeoutMs = 12000 }) {
  const startTime = Date.now();
  Logger.info(`Waiting for ${providerName} composer editor...`);
  return new Promise((resolve, reject) => {
    const findComposer = () => {
      for (const sel of selectors) {
        const el = doc.querySelector(sel);
        if (el) return el;
      }
      return null;
    };
    const immediate = findComposer();
    if (immediate) {
      Logger.info(`Found ${providerName} composer immediately`);
      resolve(immediate);
      return;
    }
    const observer = new MutationObserver(() => {
      const el = findComposer();
      if (el) {
        observer.disconnect();
        Logger.info(`Found ${providerName} composer via MutationObserver`);
        resolve(el);
      } else if (Date.now() - startTime >= timeoutMs) {
        observer.disconnect();
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for ${providerName} composer.`));
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
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for ${providerName} composer.`));
      }
    }, timeoutMs);
  });
}

export function fallbackDOMInjection(composer, prompt, doc) {
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
