import { getScrollMetrics, getVisibleTurnRange, findActiveScrollContainer } from '../../core/capture/scroll-helper.ts';
import { Logger } from '../../shared/logger.ts';

export function startManualScrollDiagnostics(doc: Document) {
  Logger.info('[DIAGNOSTICS] Starting live manual scroll observation...');
  
  let currentContainer = findActiveScrollContainer(doc, Array.from(doc.querySelectorAll('article[data-testid^="conversation-turn-"]')));
  let observedTurnIds = new Set<string>();
  
  const logState = (trigger: string) => {
    // Re-check container identity
    const newContainer = findActiveScrollContainer(doc, Array.from(doc.querySelectorAll('article[data-testid^="conversation-turn-"]')));
    if (newContainer !== currentContainer) {
      Logger.warn(`[DIAGNOSTICS] Scroll container identity changed!`);
      
      // Re-attach scroll listener to new container
      if (currentContainer instanceof HTMLElement) {
        currentContainer.removeEventListener('scroll', handleScroll);
      } else if (currentContainer === doc.defaultView) {
        doc.defaultView.removeEventListener('scroll', handleScroll);
      }
      
      currentContainer = newContainer;
      
      if (currentContainer instanceof HTMLElement) {
        currentContainer.addEventListener('scroll', handleScroll, { passive: true });
      } else if (currentContainer === doc.defaultView) {
        doc.defaultView.addEventListener('scroll', handleScroll, { passive: true });
      }
    }

    const metrics = getScrollMetrics(currentContainer, doc);
    const range = getVisibleTurnRange(doc);
    
    // Check for newly observed stable IDs
    const newIds = range.turnIds.filter(id => !observedTurnIds.has(id));
    newIds.forEach(id => observedTurnIds.add(id));
    
    // We only log if something structural changed, to avoid spam, or we log every time?
    // Let's log if there are new IDs, or if it's a specific interval, but for now we log on events.
    Logger.info(`[DIAGNOSTICS - ${trigger}]`, {
      containerType: currentContainer === doc.defaultView ? 'Window' : (currentContainer as HTMLElement).tagName + (currentContainer as HTMLElement).id,
      scrollTop: metrics.scrollTop,
      scrollHeight: metrics.scrollHeight,
      clientHeight: metrics.clientHeight,
      isAtTop: metrics.isAtTop,
      visibleTurnsCount: range.totalTurnsInDom,
      earliestVisibleTurn: range.earliestTurnId,
      latestVisibleTurn: range.latestTurnId,
      visibleTurnIds: range.turnIds,
      newlyObservedIds: newIds
    });
  };

  // 1. Listen to scroll events
  let scrollTimeout: any;
  const handleScroll = () => {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      logState('SCROLL_EVENT');
    }, 150);
  };
  
  if (currentContainer instanceof HTMLElement) {
    currentContainer.addEventListener('scroll', handleScroll, { passive: true });
  } else if (doc.defaultView) {
    doc.defaultView.addEventListener('scroll', handleScroll, { passive: true });
  }

  // 2. Listen to DOM mutations
  let mutationTimeout: any;
  const observer = new MutationObserver((mutations) => {
    let meaningfulMutation = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0 || m.removedNodes.length > 0) {
        meaningfulMutation = true;
        break;
      }
    }
    
    if (meaningfulMutation) {
      if (mutationTimeout) clearTimeout(mutationTimeout);
      mutationTimeout = setTimeout(() => {
        logState('DOM_MUTATION');
      }, 150);
    }
  });
  
  observer.observe(doc.body, { childList: true, subtree: true });

  // Initial state log
  logState('INIT');
  
  // Attach to window so user can stop it if needed
  (window as any).__PHERO_STOP_DIAGNOSTICS__ = () => {
    Logger.info('[DIAGNOSTICS] Stopping observation.');
    if (currentContainer instanceof HTMLElement) {
      currentContainer.removeEventListener('scroll', handleScroll);
    } else if (doc.defaultView) {
      doc.defaultView.removeEventListener('scroll', handleScroll);
    }
    observer.disconnect();
  };
}
