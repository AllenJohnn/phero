import { getVisibleTurnRange } from '../../core/capture/scroll-helper.ts';
import { Logger } from '../../shared/logger.ts';

let isDiagnosticsRunning = false;
let globalTeardown: (() => void) | null = null;

export function resetDiagnostics() {
  isDiagnosticsRunning = false;
  if (globalTeardown) {
    globalTeardown();
    globalTeardown = null;
  }
}

function getStructuralIdentity(el: Element | null | undefined): string {
  if (!el) return 'none';
  if (el === document.documentElement) return 'HTML';
  if (el === document.body) return 'BODY';
  const tag = el.tagName;
  const cls = el.className ? `.${el.className.split(' ').join('.')}` : '';
  const tid = el.getAttribute('data-testid') ? `[data-testid="${el.getAttribute('data-testid')}"]` : '';
  return `${tag}${cls}${tid}`;
}

type ElementScrollState = {
  el: Element;
  identity: string;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

type GlobalScrollState = {
  windowScrollY: number;
  docElementScrollTop: number;
  bodyScrollTop: number;
  scrollingElementScrollTop: number;
};

export function startManualScrollDiagnostics(doc: Document) {
  if (isDiagnosticsRunning) return;
  isDiagnosticsRunning = true;

  Logger.info('[PHERO] CHATGPT MANUAL DIAGNOSTICS ACTIVE');
  Logger.info('[PHERO] DIAGNOSTIC SCROLL CONTAINER - Analyzing real scroll mechanism');

  let wheelTimeout: any = null;
  let beforeStateElements: Map<Element, ElementScrollState> | null = null;
  let beforeStateGlobal: GlobalScrollState | null = null;
  let lastIdentifiedContainer: string | null = null;
  
  // Track mutations
  let mutationTimeout: any = null;
  let recentMutationsObserved = false;

  const captureGlobalState = (): GlobalScrollState => ({
    windowScrollY: doc.defaultView?.scrollY || 0,
    docElementScrollTop: doc.documentElement.scrollTop,
    bodyScrollTop: doc.body.scrollTop,
    scrollingElementScrollTop: doc.scrollingElement ? doc.scrollingElement.scrollTop : -1
  });

  const captureElementState = (el: Element): ElementScrollState => ({
    el,
    identity: getStructuralIdentity(el),
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight
  });

  const logTransition = () => {
    if (!beforeStateElements || !beforeStateGlobal) return;

    // Capture "after" state
    const afterGlobal = captureGlobalState();
    const afterElements = new Map<Element, ElementScrollState>();
    
    for (const [el] of beforeStateElements.entries()) {
      afterElements.set(el, captureElementState(el));
    }

    // Find what changed
    let targetStructuralIdentity = 'none';
    let scrollTopBefore = 0;
    let scrollTopAfter = 0;
    let scrollHeightBefore = 0;
    let scrollHeightAfter = 0;
    let clientHeight = 0;
    let mechanismCase = 'UNKNOWN';

    // 1. Check window/document scrolling (CASE B)
    if (
      beforeStateGlobal.windowScrollY !== afterGlobal.windowScrollY ||
      beforeStateGlobal.docElementScrollTop !== afterGlobal.docElementScrollTop ||
      beforeStateGlobal.scrollingElementScrollTop !== afterGlobal.scrollingElementScrollTop
    ) {
      mechanismCase = 'CASE B: WINDOW_DOCUMENT_SCROLL';
      targetStructuralIdentity = 'Window/Document';
      scrollTopBefore = beforeStateGlobal.windowScrollY || beforeStateGlobal.docElementScrollTop;
      scrollTopAfter = afterGlobal.windowScrollY || afterGlobal.docElementScrollTop;
    } else {
      // 2. Check element scrolling (CASE A)
      for (const [el, beforeState] of beforeStateElements.entries()) {
        const afterState = afterElements.get(el)!;
        // Check if this element actually scrolled
        if (Math.abs(beforeState.scrollTop - afterState.scrollTop) > 0) {
          mechanismCase = 'CASE A: ELEMENT_SCROLL';
          targetStructuralIdentity = beforeState.identity;
          scrollTopBefore = beforeState.scrollTop;
          scrollTopAfter = afterState.scrollTop;
          scrollHeightBefore = beforeState.scrollHeight;
          scrollHeightAfter = afterState.scrollHeight;
          clientHeight = beforeState.clientHeight;
          break;
        }
      }
    }

    // 3. Check for virtualized positioning or DOM mutation (CASE C/D)
    if (mechanismCase === 'UNKNOWN') {
      if (recentMutationsObserved) {
        mechanismCase = 'CASE C: NO_SCROLL_BUT_MUTATIONS';
      } else {
        // Maybe check if visible turns changed despite no scroll?
        mechanismCase = 'CASE D: VIRTUAL_POSITIONING_NO_SCROLL';
      }
    }

    // Container replacement detection (CASE E)
    if (mechanismCase === 'CASE A: ELEMENT_SCROLL' && lastIdentifiedContainer) {
      if (lastIdentifiedContainer !== targetStructuralIdentity) {
        Logger.info('[PHERO] DIAGNOSTIC CONTAINER_CHANGED', {
          oldStructuralIdentity: lastIdentifiedContainer,
          newStructuralIdentity: targetStructuralIdentity,
          oldScrollTop: 0, // We only know it was a different container
          newScrollTop: scrollTopAfter
        });
      }
    }
    
    if (mechanismCase === 'CASE A: ELEMENT_SCROLL') {
      lastIdentifiedContainer = targetStructuralIdentity;
    }

    const range = getVisibleTurnRange(doc);

    Logger.info('[PHERO DIAGNOSTIC]', {
      event: 'WHEEL_TRANSITION',
      mechanismCase,
      targetStructuralIdentity,
      scrollTopBefore,
      scrollTopAfter,
      scrollHeightBefore,
      scrollHeightAfter,
      clientHeight,
      windowScrollYBefore: beforeStateGlobal.windowScrollY,
      windowScrollYAfter: afterGlobal.windowScrollY,
      documentScrollTopBefore: beforeStateGlobal.docElementScrollTop,
      documentScrollTopAfter: afterGlobal.docElementScrollTop,
      visibleTurnsCount: range.totalTurnsInDom,
      earliestVisibleTurnId: range.earliestTurnId,
      latestVisibleTurnId: range.latestTurnId,
      mutationObserved: recentMutationsObserved
    });

    // Reset tracking
    beforeStateElements = null;
    beforeStateGlobal = null;
    recentMutationsObserved = false;
  };

  const handleWheelCapture = (e: Event) => {
    // If not already tracking a wheel gesture, start tracking
    if (!beforeStateElements) {
      beforeStateElements = new Map();
      beforeStateGlobal = captureGlobalState();

      const path = e.composedPath ? e.composedPath() : [];
      for (const node of path) {
        if (node instanceof Element) {
          beforeStateElements.set(node, captureElementState(node));
        }
      }
      
      // Also always include all visible turns' ancestors just in case
      const turns = Array.from(doc.querySelectorAll('article[data-testid^="conversation-turn-"]'));
      if (turns.length > 0) {
        let curr = turns[0].parentElement;
        while (curr && curr !== doc.body && curr !== doc.documentElement) {
          if (!beforeStateElements.has(curr)) {
            beforeStateElements.set(curr, captureElementState(curr));
          }
          curr = curr.parentElement;
        }
      }
    }

    // Debounce the logTransition
    if (wheelTimeout) clearTimeout(wheelTimeout);
    wheelTimeout = setTimeout(() => {
      requestAnimationFrame(() => {
        logTransition();
      });
    }, 200);
  };

  // MutationObserver to detect hydration/virtualization during scroll
  const observer = new MutationObserver((mutations) => {
    let meaningful = false;
    for (const m of mutations) {
      if (m.type === 'childList' && (m.addedNodes.length > 0 || m.removedNodes.length > 0)) {
        meaningful = true;
        break;
      }
    }
    
    if (meaningful) {
      recentMutationsObserved = true;
      if (mutationTimeout) clearTimeout(mutationTimeout);
      // We don't trigger logTransition immediately here, we just flag it
      // so the next wheel transition or a standalone mutation log can report it.
      mutationTimeout = setTimeout(() => {
        if (!beforeStateElements) { // Only standalone log if not inside a wheel gesture
          const range = getVisibleTurnRange(doc);
          Logger.info('[PHERO DIAGNOSTIC]', {
            event: 'STANDALONE_MUTATION',
            visibleTurnsCount: range.totalTurnsInDom,
            earliestVisibleTurnId: range.earliestTurnId,
            latestVisibleTurnId: range.latestTurnId,
            mutationObserved: true
          });
        }
      }, 500);
    }
  });

  const win = doc.defaultView;
  if (win) {
    win.addEventListener('wheel', handleWheelCapture, { capture: true, passive: true });
  } else {
    doc.addEventListener('wheel', handleWheelCapture, { capture: true, passive: true });
  }

  observer.observe(doc.body, { childList: true, subtree: true });

  globalTeardown = () => {
    if (win) {
      win.removeEventListener('wheel', handleWheelCapture, { capture: true });
    } else {
      doc.removeEventListener('wheel', handleWheelCapture, { capture: true });
    }
    observer.disconnect();
    if (wheelTimeout) clearTimeout(wheelTimeout);
    if (mutationTimeout) clearTimeout(mutationTimeout);
  };
}
