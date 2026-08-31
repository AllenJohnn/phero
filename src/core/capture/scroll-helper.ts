import { Logger } from '../../shared/logger.ts';

export type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  isAtTop: boolean;
};

export type VisibleTurnRange = {
  totalTurnsInDom: number;
  earliestTurnId: string;
  latestTurnId: string;
  turnIds: string[];
};

/**
 * Robust scroll container detection.
 * Walks up the DOM tree from message elements to find the ancestor that actually scrolls.
 */
export function findActiveScrollContainer(
  doc: Document,
  turnElements: Element[] = []
): HTMLElement | Window {
  // Strategy 1: Walk up from turn elements to find the overflow ancestor
  for (const turnEl of turnElements) {
    let curr: HTMLElement | null = turnEl.parentElement;
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
          scrollTop: curr.scrollTop,
        });
        return curr;
      }
      curr = curr.parentElement;
    }
  }

  // Strategy 2: Check standard provider selectors with active scroll overflow
  const candidateSelectors = [
    'div[class*="react-scroll-to-bottom"]',
    '[data-testid="scroll-container"]',
    'main div.overflow-y-auto',
    'div.overflow-y-auto',
    'infinite-scroller',
    'div.chat-history',
    'div.conversation-container',
    'main',
    '[role="main"]',
  ];

  for (const sel of candidateSelectors) {
    try {
      const elements = Array.from(doc.querySelectorAll<HTMLElement>(sel));
      for (const el of elements) {
        if (el.scrollHeight > el.clientHeight + 10) {
          Logger.info('Found active scroll container via selector', {
            selector: sel,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
            scrollTop: el.scrollTop,
          });
          return el;
        }
      }
    } catch {
      // Ignore query errors
    }
  }

  // Strategy 3: Check document scrolling element
  const scrollingEl = doc.scrollingElement as HTMLElement || doc.documentElement || doc.body;
  if (scrollingEl && scrollingEl.scrollHeight > scrollingEl.clientHeight + 10) {
    return scrollingEl;
  }

  return typeof window !== 'undefined' ? window : ((doc.documentElement || doc.body) as any);
}

/**
 * Retrieves normalized scroll metrics regardless of whether container is HTMLElement or Window.
 */
export function getScrollMetrics(container: HTMLElement | Window, doc?: Document): ScrollMetrics {
  if (container instanceof HTMLElement) {
    return {
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
      isAtTop: container.scrollTop <= 5,
    };
  }

  const d = doc || (typeof document !== 'undefined' ? document : null);
  const scrollTop = typeof window !== 'undefined' ? window.scrollY || d?.documentElement.scrollTop || d?.body.scrollTop || 0 : 0;
  const scrollHeight = d?.documentElement.scrollHeight || d?.body.scrollHeight || 0;
  const clientHeight = typeof window !== 'undefined' ? window.innerHeight : d?.documentElement.clientHeight || 0;

  return {
    scrollTop,
    scrollHeight,
    clientHeight,
    isAtTop: scrollTop <= 5,
  };
}

/**
 * Identifies the range of conversation turns currently visible in the DOM.
 */
export function getVisibleTurnRange(doc: Document): VisibleTurnRange {
  // Check articles first
  let turns = Array.from(
    doc.querySelectorAll<HTMLElement>('article[data-testid^="conversation-turn-"]')
  );

  if (turns.length === 0) {
    turns = Array.from(
      doc.querySelectorAll<HTMLElement>(
        '[data-message-author-role], div[data-test-render-count], conversation-turn, user-query, model-response'
      )
    );
  }

  if (turns.length === 0) {
    return { totalTurnsInDom: 0, earliestTurnId: 'none', latestTurnId: 'none', turnIds: [] };
  }

  const getTurnId = (el: HTMLElement, index: number) => {
    const directId =
      el.getAttribute('data-message-id') ||
      el.getAttribute('data-testid') ||
      el.getAttribute('data-test-id');
    if (directId) return directId;

    const childId =
      el.querySelector('[data-message-id]')?.getAttribute('data-message-id') ||
      el.querySelector('[data-testid]')?.getAttribute('data-testid');
    if (childId) return childId;

    return `turn-dom-${index}`;
  };

  const turnIds = turns.map((t, idx) => getTurnId(t, idx));

  return {
    totalTurnsInDom: turns.length,
    earliestTurnId: turnIds[0] || 'none',
    latestTurnId: turnIds[turnIds.length - 1] || 'none',
    turnIds,
  };
}

/**
 * Performs a controlled upward scroll and activates virtualizer intersection observers.
 */
export async function executeScrollUp(
  doc: Document,
  container: HTMLElement | Window
): Promise<ScrollMetrics> {
  // 1. Identify earliest mounted turn to anchor intersection or scrollIntoView if needed
  const turns = Array.from(
    doc.querySelectorAll<HTMLElement>(
      'article[data-testid^="conversation-turn-"], [data-message-author-role]'
    )
  );

  // 2. Smart relative scroll decrement
  if (container instanceof HTMLElement) {
    const clientH = container.clientHeight || 800;
    let targetScrollTop = container.scrollTop - clientH * 0.8;

    // Smart Jump: If we know the earliest turn in the DOM, we've already captured it entirely.
    // We can jump the viewport directly to the top of that turn, placing it at the bottom of the new viewport.
    if (turns.length > 0) {
      const topTurn = turns[0];
      const containerRect = container.getBoundingClientRect();
      const topTurnRect = topTurn.getBoundingClientRect();
      
      // Calculate where the top of the earliest turn is, relative to the scroll container's top
      const relativeTop = topTurnRect.top - containerRect.top;
      const topTurnAbsoluteTop = container.scrollTop + relativeTop;

      const buffer = 150; 
      const smartTarget = topTurnAbsoluteTop - clientH + buffer;

      // Only use smart target if it advances us upward (less than current scrollTop)
      // Limit the max jump to 15000px per step for safety against crazy DOM measurements.
      if (smartTarget < container.scrollTop) {
        targetScrollTop = Math.max(container.scrollTop - 15000, smartTarget);
      }
    }

    container.scrollTop = Math.max(0, targetScrollTop);
    container.dispatchEvent(new Event('scroll', { bubbles: true }));
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

    window.scrollBy({ top: -scrollStep, behavior: 'auto' });
    window.dispatchEvent(new Event('scroll', { bubbles: true }));
  }

  // Click any pagination / load more buttons if present
  const loadMoreBtn = doc.querySelector<HTMLElement>(
    'button[data-testid="load-more-messages"], .load-earlier-messages, button.load-more, [data-testid="load-earlier-turns"], [aria-label*="earlier messages" i], [aria-label*="load more" i]'
  );
  if (loadMoreBtn && typeof loadMoreBtn.click === 'function') {
    Logger.info('Clicking "Load earlier messages" button');
    try {
      loadMoreBtn.click();
    } catch (err) {
      Logger.warn('Error clicking load-more button', { err: String(err) });
    }
  }

  return getScrollMetrics(container, doc);
}
