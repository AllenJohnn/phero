import { NormalizedConversation, NormalizedMessage, ProviderId } from '../models/conversation.ts';
import {
  CaptureCompletenessState,
  CaptureOptions,
  CaptureResult,
  ProviderCaptureStrategy,
} from './types.ts';
import { deduplicateMessagesWithAudit, reindexMessages, isStableMessageId } from './deduplication.ts';
import { getScrollMetrics, getVisibleTurnRange } from './scroll-helper.ts';
import { Logger } from '../../shared/logger.ts';

export class CaptureOrchestrator {
  /**
   * Coordinates multi-window incremental conversation capture with scroll restoration.
   */
  public static async executeCapture(
    doc: Document,
    strategy: ProviderCaptureStrategy,
    meta: {
      providerId: ProviderId;
      conversationId?: string;
      title?: string;
    },
    options: CaptureOptions = {}
  ): Promise<CaptureResult> {
    const onProgress = options.onProgress;

    Logger.info(`Starting capture orchestrator for ${meta.providerId}`);

    // 1. Save scroll position and focused element before capture
    const scrollContainer = strategy.getScrollContainer(doc);
    let originalScrollTop = 0;
    let originalScrollLeft = 0;
    const activeElement = doc.activeElement as HTMLElement | null;

    if (scrollContainer instanceof HTMLElement) {
      originalScrollTop = scrollContainer.scrollTop;
      originalScrollLeft = scrollContainer.scrollLeft;
    } else if (typeof window !== 'undefined') {
      originalScrollTop = window.scrollY || doc.documentElement.scrollTop || 0;
      originalScrollLeft = window.scrollX || doc.documentElement.scrollLeft || 0;
    }

    const initialMetrics = getScrollMetrics(scrollContainer, doc);
    // Dynamic safety limit based on initial scroll height/position
    const estimatedSteps = Math.ceil(initialMetrics.scrollTop / 500);
    const dynamicSafetyLimit = Math.min(1000, Math.max(300, estimatedSteps * 3 + 100));
    const maxAttempts = options.maxScrollAttempts ?? dynamicSafetyLimit;

    let collectedMessages: NormalizedMessage[] = [];
    let windowsCount = 0;
    let attempts = 0;
    let sameStateCount = 0;
    let reachedBeginning = false;
    let completenessState: CaptureCompletenessState = 'RECOVERING';

    try {
      // 2. Initial capture of currently rendered window
      const initialBatch = strategy.captureCurrentVisibleMessages(doc);
      const initialMergeResult = deduplicateMessagesWithAudit(collectedMessages, initialBatch);
      collectedMessages = initialMergeResult.messages;
      windowsCount++;

      const initialTurnRange = getVisibleTurnRange(doc);
      const stableIds = collectedMessages.filter((m) => isStableMessageId(m.id)).length;
      const fallbackIds = collectedMessages.length - stableIds;

      Logger.info(`[PHERO CAPTURE INIT] ${meta.providerId}`, {
        initialExtracted: initialBatch.length,
        totalCollected: collectedMessages.length,
        stableIds,
        fallbackIds,
        scrollTop: initialMetrics.scrollTop,
        scrollHeight: initialMetrics.scrollHeight,
        clientHeight: initialMetrics.clientHeight,
        visibleTurnsCount: initialTurnRange.totalTurnsInDom,
        earliestVisibleTurn: initialTurnRange.earliestTurnId,
        latestVisibleTurn: initialTurnRange.latestTurnId,
        visibleTurnIds: initialTurnRange.turnIds.join(', '),
        extractedMessageIds: initialBatch.map((m) => m.id).join(', '),
        maxSafetyAttempts: maxAttempts,
      });

      onProgress?.({
        status: 'RECOVERING',
        messagesCaptured: collectedMessages.length,
        currentStepDescription: `Captured initial ${collectedMessages.length} messages`,
      });

      // Check if we are already at the beginning
      if (strategy.isAtBeginning(doc, collectedMessages)) {
        reachedBeginning = true;
        completenessState = 'COMPLETE';
      }

      // 3. Incremental upward scrolling loop
      while (!reachedBeginning && attempts < maxAttempts) {
        attempts++;
        
        const beforeMetrics = getScrollMetrics(scrollContainer, doc);
        const beforeTurnRange = getVisibleTurnRange(doc);

        // Scroll upward
        await strategy.scrollUp(scrollContainer);

        // Wait for virtual DOM rendering or lazy loading using logical boundary changes
        const isNearTop = beforeMetrics.scrollTop <= Math.max(2500, beforeMetrics.clientHeight * 2);
        const defaultWaitTime = isNearTop ? 3000 : 500;
        const waitTime = options.scrollDelayMs ?? defaultWaitTime;
        const logicalProgress = await strategy.waitForNewMessages(doc, beforeTurnRange, waitTime);

        // Check if scroll container was replaced during prepending / virtualization
        let activeContainer = scrollContainer;
        if (scrollContainer instanceof HTMLElement && (!scrollContainer.isConnected || scrollContainer.scrollHeight <= scrollContainer.clientHeight)) {
          activeContainer = strategy.getScrollContainer(doc);
        }

        const currentMetrics = getScrollMetrics(activeContainer, doc);
        const currentTurnRange = getVisibleTurnRange(doc);

        // Capture newly rendered window
        const newBatch = strategy.captureCurrentVisibleMessages(doc);
        const mergeResult = deduplicateMessagesWithAudit(newBatch, collectedMessages); // put older ones first
        const merged = mergeResult.messages;
        windowsCount++;

        const addedCount = merged.length - collectedMessages.length;
        collectedMessages = merged;

        const currentStableIds = collectedMessages.filter((m) => isStableMessageId(m.id)).length;
        const currentFallbackIds = collectedMessages.length - currentStableIds;
        
        let stepStatus = 'CONTINUING_TRAVERSAL';
        let virtualizationRepositionDetected = false;
        let mutationObserved = logicalProgress;

        if (
          beforeMetrics.scrollTop <= Math.max(1500, beforeMetrics.clientHeight * 2) && 
          currentMetrics.scrollTop > beforeMetrics.scrollTop + 1000 && 
          currentTurnRange.earliestTurnId !== beforeTurnRange.earliestTurnId
        ) {
          virtualizationRepositionDetected = true;
          stepStatus = 'VIRTUAL_WINDOW_ADVANCED';
          sameStateCount = 0;
        } else if (addedCount > 0 || currentTurnRange.earliestTurnId !== beforeTurnRange.earliestTurnId) {
          stepStatus = 'OLDER_HISTORY_LOADED';
          sameStateCount = 0;
        } else if (currentMetrics.scrollHeight !== beforeMetrics.scrollHeight) {
          stepStatus = 'PREPEND_RECONCILIATION';
          sameStateCount = 0;
        } else if (currentMetrics.isAtTop) {
          stepStatus = 'AT_CONTAINER_TOP';
        } else if (
          currentTurnRange.earliestTurnId === beforeTurnRange.earliestTurnId &&
          currentMetrics.scrollTop === beforeMetrics.scrollTop
        ) {
          sameStateCount++;
          stepStatus = `NO_PROGRESS_${sameStateCount}`;
        }

        reachedBeginning = strategy.isAtBeginning(doc, collectedMessages);

        Logger.info(`[PHERO CAPTURE STEP ${attempts}]`, {
          attempt: attempts,
          status: stepStatus,
          scrollTopBefore: beforeMetrics.scrollTop,
          scrollTopAfter: currentMetrics.scrollTop,
          scrollHeightBefore: beforeMetrics.scrollHeight,
          scrollHeightAfter: currentMetrics.scrollHeight,
          earliestVisibleTurnBefore: beforeTurnRange.earliestTurnId,
          earliestVisibleTurnAfter: currentTurnRange.earliestTurnId,
          latestVisibleTurn: currentTurnRange.latestTurnId,
          visibleTurnsCount: currentTurnRange.totalTurnsInDom,
          addedInStep: addedCount,
          totalCollected: collectedMessages.length,
          uniqueCollected: currentStableIds + currentFallbackIds,
          virtualizationRepositionDetected,
          mutationObserved,
          isAtPhysicalTop: currentMetrics.isAtTop,
          logicalBeginningDetected: reachedBeginning
        });

        onProgress?.({
          status: 'RECOVERING',
          messagesCaptured: collectedMessages.length,
          currentStepDescription: `Recovered ${collectedMessages.length} messages...`,
        });

        if (reachedBeginning) {
          completenessState = 'COMPLETE';
          break;
        }

        // Robust top-boundary state machine:
        // Physical scrollTop === 0 is NOT automatically logical beginning.
        if (currentMetrics.isAtTop && stepStatus !== 'VIRTUAL_WINDOW_ADVANCED') {
          if (addedCount === 0 && currentTurnRange.earliestTurnId === beforeTurnRange.earliestTurnId) {
            
            Logger.info(`[PHERO] Entering TOP_RECONCILIATION quiet period`);
            
            const reconResult = await new Promise<{ progressMade: boolean, reachedBeginning: boolean }>((resolve) => {
              let observer: MutationObserver;
              let cycleInterval: any;

              // The quiet period must be long enough to allow ChatGPT's network requests.
              // Unrelated mutations will NOT reset this timer.
              // We use a robust 15-second default to outlast slow network fetches, since physical top without logical beginning GUARANTEES a fetch.
              const maxQuietMs = options.topReconciliationTimeoutMs !== undefined ? options.topReconciliationTimeoutMs : 15000;
              const pollIntervalMs = options.scrollDelayMs !== undefined ? Math.min(options.scrollDelayMs / 2, 500) : 500;
              let quietElapsedMs = 0;
              
              const isHistoryLoading = () => {
                return !!doc.querySelector('svg.animate-spin, .animate-pulse, [class*="spinner"], [class*="loading"]');
              };
              
              let lastEarliestId = currentTurnRange.earliestTurnId;
              let lastScrollHeight = currentMetrics.scrollHeight;

              const cleanup = (progress: boolean) => {
                if (cycleInterval) clearInterval(cycleInterval);
                if (observer) observer.disconnect();
                
                Logger.info(`[PHERO] TOP_RECONCILIATION_EXIT`, {
                  progressMade: progress,
                  quietElapsedMs,
                  earliestVisibleTurnId: getVisibleTurnRange(doc).earliestTurnId,
                  previousEarliestVisibleTurnId: lastEarliestId,
                  scrollTop: getScrollMetrics(activeContainer, doc).scrollTop,
                  scrollHeight: getScrollMetrics(activeContainer, doc).scrollHeight
                });
                
                resolve({
                  progressMade: progress,
                  reachedBeginning: strategy.isAtBeginning(doc, collectedMessages)
                });
              };

              const checkProgress = () => {
                const range = getVisibleTurnRange(doc);
                const metrics = getScrollMetrics(activeContainer, doc);
                const isBeginning = strategy.isAtBeginning(doc, collectedMessages);

                if (isBeginning) {
                  Logger.info(`[PHERO] TOP_RECONCILIATION_LOGICAL_BEGINNING detected`);
                  cleanup(true);
                  return;
                }

                if (
                  range.earliestTurnId !== lastEarliestId ||
                  metrics.scrollHeight !== lastScrollHeight ||
                  range.totalTurnsInDom !== currentTurnRange.totalTurnsInDom
                ) {
                  Logger.info(`[PHERO] TOP_RECONCILIATION_PROGRESS`, {
                    newEarliestId: range.earliestTurnId,
                    newScrollHeight: metrics.scrollHeight
                  });
                  cleanup(true);
                }
              };

              // 1. Event-driven fast path
              observer = new MutationObserver(() => {
                // DO NOT reset the quiet timer here. Unrelated mutations (e.g. clocks) must not keep us alive indefinitely.
                requestAnimationFrame(() => checkProgress());
              });

              observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

              // 2. Active polling quiet cycles
              cycleInterval = setInterval(() => {
                if (isHistoryLoading()) {
                  // Do not increment the quiet timer if there is an active loading indicator!
                  Logger.info(`[PHERO] TOP_RECONCILIATION paused quiet timer due to active loading indicator`);
                  quietElapsedMs = 0; // Keep it perfectly fresh while loading
                } else {
                  quietElapsedMs += pollIntervalMs;
                }
                
                checkProgress();
                
                if (quietElapsedMs >= maxQuietMs) {
                  Logger.info(`[PHERO] TOP_RECONCILIATION_DEADLINE reached without relevant mutations`);
                  cleanup(false);
                }
              }, pollIntervalMs);

              // Prod virtualizer
              try {
                if (activeContainer instanceof HTMLElement) {
                  activeContainer.scrollTop = 10;
                  activeContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
                  activeContainer.scrollTop = 0;
                  activeContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
                } else if (typeof window !== 'undefined') {
                  window.scrollBy({ top: 10, behavior: 'auto' });
                  window.dispatchEvent(new Event('scroll', { bubbles: true }));
                  window.scrollBy({ top: -10, behavior: 'auto' });
                  window.dispatchEvent(new Event('scroll', { bubbles: true }));
                }
              } catch (e) {}
            });

            if (reconResult.progressMade) {
              sameStateCount = 0;
              continue; // Return to normal traversal loop to capture the newly exposed window
            } else {
              reachedBeginning = reconResult.reachedBeginning;
              if (reachedBeginning) {
                completenessState = 'COMPLETE';
              } else {
                // We did not find a definitive logical beginning marker, but we timed out.
                // It is unsafe to declare COMPLETE. Return UNKNOWN.
                completenessState = 'UNKNOWN';
              }
              break;
            }
          } else {
            sameStateCount = 0;
          }
        } else if (sameStateCount > 5) {
          Logger.warn('[PHERO] Scrolling stalled mid-conversation. Aborting early.');
          completenessState = 'UNKNOWN';
          break;
        }
      }

      if (reachedBeginning) {
        completenessState = 'COMPLETE';
      } else if (completenessState === 'RECOVERING') {
        completenessState = attempts >= maxAttempts ? 'PARTIAL' : 'UNKNOWN';
      }
    } catch (err) {
      Logger.error('Error during capture orchestrator execution', err);
      completenessState = collectedMessages.length > 0 ? 'PARTIAL' : 'UNKNOWN';
    } finally {
      // 4. Restore original scroll position and focus
      try {
        if (scrollContainer instanceof HTMLElement) {
          scrollContainer.scrollTop = originalScrollTop;
          scrollContainer.scrollLeft = originalScrollLeft;
        } else if (typeof window !== 'undefined') {
          window.scrollTo(originalScrollLeft, originalScrollTop);
        }
        if (activeElement && typeof activeElement.focus === 'function') {
          activeElement.focus();
        }
      } catch {
        // Non-fatal if scroll restoration fails
      }
    }

    const finalMessages = reindexMessages(collectedMessages);
    const isComplete = completenessState === 'COMPLETE';
    const warning =
      !isComplete && finalMessages.length > 0
        ? `Some earlier messages couldn't be retrieved. ${finalMessages.length} messages were captured.`
        : undefined;

    const conversation: NormalizedConversation = {
      id: meta.conversationId,
      title: meta.title || 'Conversation',
      sourceProvider: meta.providerId,
      createdAt: Date.now(),
      messages: finalMessages,
      metadata: {
        url: doc.location?.href,
        totalDetectedTurns: finalMessages.length,
        extractedTurns: finalMessages.length,
        isTruncated: !isComplete,
      },
    };

    Logger.info(`Capture completed for ${meta.providerId}`, {
      isComplete,
      completenessState,
      totalCaptured: finalMessages.length,
      windowsCount,
    });

    return {
      conversation,
      completenessState,
      isComplete,
      totalCaptured: finalMessages.length,
      warning,
      capturedWindowsCount: windowsCount,
    };
  }
}
