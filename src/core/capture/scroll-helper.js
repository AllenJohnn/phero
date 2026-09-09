import { Logger } from '../../shared/logger.js';
export function findActiveScrollContainer(doc, turnElements = []) {
  for (const turnEl of turnElements) {
    let curr = turnEl.parentElement;
    while (curr && curr !== doc.body && curr !== doc.documentElement) {
      const style = typeof window !== 'undefined' ? window.getComputedStyle(curr) : null;
      const overflowY = style ? style.overflowY : '';
      const isScrollableStyle = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
      if (isScrollableStyle && curr.scrollHeight > curr.clientHeight + 10) {
        Logger.info('Found active scroll container via turn ancestor', {
          tagName: curr.tagName,
          className: curr.className?.toString().slice(0, 50),
          scrollHeight: curr.scrollHeight,
          clientHeight: curr.clientHeight,
          scrollTop: curr.scrollTop
        });
        return curr;
      }
      curr = curr.parentElement;
    }
  }
  const candidateSelectors = ['div[class*="react-scroll-to-bottom"]', '[data-testid="scroll-container"]', 'main div.overflow-y-auto', 'div.overflow-y-auto', 'infinite-scroller', 'div.chat-history', 'div.conversation-container', 'main', '[role="main"]'];
  for (const sel of candidateSelectors) {
    try {
      const elements = Array.from(doc.querySelectorAll(sel));
      for (const el of elements) {
        if (el.scrollHeight > el.clientHeight + 10) {
          Logger.info('Found active scroll container via selector', {
            selector: sel,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
            scrollTop: el.scrollTop
          });
          return el;
        }
      }
    } catch {}
  }
  const scrollingEl = doc.scrollingElement || doc.documentElement || doc.body;
  if (scrollingEl && scrollingEl.scrollHeight > scrollingEl.clientHeight + 10) {
    return scrollingEl;
  }
  return typeof window !== 'undefined' ? window : doc.documentElement || doc.body;
}
export function getScrollMetrics(container, doc) {
  const mockIsAtTop = globalThis.PHERO_MOCK_IS_AT_TOP;
  if (typeof HTMLElement !== 'undefined' && container instanceof HTMLElement) {
    return {
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
      isAtTop: mockIsAtTop !== undefined ? mockIsAtTop : container.scrollTop <= 5
    };
  }
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) {
    return {
      scrollTop: 0,
      scrollHeight: 0,
      clientHeight: 0,
      isAtTop: mockIsAtTop !== undefined ? mockIsAtTop : true
    };
  }
  return {
    scrollTop: (typeof window !== 'undefined' ? window.scrollY : 0) || d.documentElement.scrollTop,
    scrollHeight: d.documentElement.scrollHeight,
    clientHeight: (typeof window !== 'undefined' ? window.innerHeight : 0) || d.documentElement.clientHeight,
    isAtTop: mockIsAtTop !== undefined ? mockIsAtTop : ((typeof window !== 'undefined' ? window.scrollY : 0) || d.documentElement.scrollTop) <= 5
  };
}
export function getVisibleTurnRange(doc) {
  let turns = Array.from(doc.querySelectorAll('article[data-testid^="conversation-turn-"]'));
  if (turns.length === 0) {
    turns = Array.from(doc.querySelectorAll('[data-message-author-role], div[data-test-render-count], conversation-turn, user-query, model-response'));
  }
  if (turns.length === 0) {
    return {
      totalTurnsInDom: 0,
      earliestTurnId: 'none',
      latestTurnId: 'none',
      turnIds: []
    };
  }
  const getTurnId = (el, index) => {
    const directId = el.getAttribute('data-message-id') || el.getAttribute('data-testid') || el.getAttribute('data-test-id');
    if (directId) return directId;
    const childId = el.querySelector('[data-message-id]')?.getAttribute('data-message-id') || el.querySelector('[data-testid]')?.getAttribute('data-testid');
    if (childId) return childId;
    return `turn-dom-${index}`;
  };
  const turnIds = turns.map((t, idx) => getTurnId(t, idx));
  return {
    totalTurnsInDom: turns.length,
    earliestTurnId: turnIds[0] || 'none',
    latestTurnId: turnIds[turnIds.length - 1] || 'none',
    turnIds
  };
}
export async function executeScrollUp(doc, container) {
  const turns = Array.from(doc.querySelectorAll('article[data-testid^="conversation-turn-"], [data-message-author-role]'));
  if (typeof HTMLElement !== 'undefined' && container instanceof HTMLElement) {
    const clientH = container.clientHeight || 800;
    let targetScrollTop = container.scrollTop - clientH * 0.8;
    if (turns.length > 0) {
      const topTurn = turns[0];
      const containerRect = container.getBoundingClientRect();
      const topTurnRect = topTurn.getBoundingClientRect();
      const relativeTop = topTurnRect.top - containerRect.top;
      const topTurnAbsoluteTop = container.scrollTop + relativeTop;
      const buffer = 150;
      const smartTarget = topTurnAbsoluteTop - clientH + buffer;
      if (smartTarget < container.scrollTop) {
        targetScrollTop = Math.max(container.scrollTop - 15000, smartTarget);
      }
    }
    if (container.scrollTop < 50) {
      container.scrollTop = 150;
      container.dispatchEvent(new Event('scroll', {
        bubbles: true
      }));
      if (typeof window !== 'undefined') await new Promise(r => setTimeout(r, 50));
    }
    container.scrollTop = Math.max(0, targetScrollTop);
    container.dispatchEvent(new Event('scroll', {
      bubbles: true
    }));
  } else if (typeof window !== 'undefined') {
    const clientH = window.innerHeight || 800;
    let scrollStep = clientH * 0.8;
    if (turns.length > 0) {
      const topTurn = turns[0];
      const topTurnRect = topTurn.getBoundingClientRect();
      const buffer = 150;
      const smartStep = -topTurnRect.top + clientH - buffer;
      if (smartStep > 0) {
        scrollStep = Math.min(15000, Math.max(scrollStep, smartStep));
      }
    }
    window.scrollBy({
      top: -scrollStep,
      behavior: 'auto'
    });
    window.dispatchEvent(new Event('scroll', {
      bubbles: true
    }));
  }
  const loadMoreBtn = doc.querySelector('button[data-testid="load-more-messages"], .load-earlier-messages, button.load-more, [data-testid="load-earlier-turns"], [aria-label*="earlier messages" i], [aria-label*="load more" i]');
  if (loadMoreBtn && typeof loadMoreBtn.click === 'function') {
    Logger.info('Clicking "Load earlier messages" button');
    try {
      loadMoreBtn.click();
    } catch (err) {
      Logger.warn('Error clicking load-more button', {
        err: String(err)
      });
    }
  }
  return getScrollMetrics(container, doc);
}