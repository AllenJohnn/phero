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
    const scrollDelay = options.scrollDelayMs ?? 200;
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
        const prevCount = collectedMessages.length;
        const beforeMetrics = getScrollMetrics(scrollContainer, doc);
        const beforeTurnRange = getVisibleTurnRange(doc);

        // Scroll upward
        await strategy.scrollUp(scrollContainer);

        // Wait for virtual DOM rendering or lazy loading using logical boundary changes
        // Allow up to 2500ms for network requests to complete if older history is being fetched
        await strategy.waitForNewMessages(doc, beforeTurnRange, 2500);

        // Capture newly rendered window
        const newBatch = strategy.captureCurrentVisibleMessages(doc);
        const mergeResult = deduplicateMessagesWithAudit(newBatch, collectedMessages); // put older ones first
        const merged = mergeResult.messages;
        windowsCount++;

        const addedCount = merged.length - collectedMessages.length;
        collectedMessages = merged;

        // Check if scroll container was replaced during prepending / virtualization
        let activeContainer = scrollContainer;
        if (scrollContainer instanceof HTMLElement && (!scrollContainer.isConnected || scrollContainer.scrollHeight <= scrollContainer.clientHeight)) {
          activeContainer = strategy.getScrollContainer(doc);
        }

        const currentMetrics = getScrollMetrics(activeContainer, doc);
        const currentTurnRange = getVisibleTurnRange(doc);

        const currentStableIds = collectedMessages.filter((m) => isStableMessageId(m.id)).length;
        const currentFallbackIds = collectedMessages.length - currentStableIds;

        let stepStatus = 'CONTINUING_TRAVERSAL';
        if (addedCount > 0) {
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

        Logger.info(`[PHERO CAPTURE STEP ${attempts}]`, {
          attempt: attempts,
          status: stepStatus,
          addedInStep: addedCount,
          totalCollected: collectedMessages.length,
          batchExtractedCount: newBatch.length,
          batchExtractedIds: newBatch.map((m) => m.id).join(', '),
          stableIds: currentStableIds,
          fallbackIds: currentFallbackIds,
          skippedDupId: mergeResult.audit.skippedDuplicateIdCount,
          skippedDupFingerprint: mergeResult.audit.skippedDuplicateFingerprintCount,
          scrollTopBefore: beforeMetrics.scrollTop,
          scrollTopAfter: currentMetrics.scrollTop,
          scrollHeightBefore: beforeMetrics.scrollHeight,
          scrollHeightAfter: currentMetrics.scrollHeight,
          clientHeight: currentMetrics.clientHeight,
          visibleTurnsCount: currentTurnRange.totalTurnsInDom,
          earliestVisibleTurn: currentTurnRange.earliestTurnId,
          latestVisibleTurn: currentTurnRange.latestTurnId,
          visibleTurnIds: currentTurnRange.turnIds.join(', '),
          isAtTop: currentMetrics.isAtTop,
        });

        onProgress?.({
          status: 'RECOVERING',
          messagesCaptured: collectedMessages.length,
          currentStepDescription: `Recovered ${collectedMessages.length} messages...`,
        });

        if (strategy.isAtBeginning(doc, collectedMessages)) {
          reachedBeginning = true;
          completenessState = 'COMPLETE';
          break;
        }

        // Bounded reconciliation when at container top:
        // Physical scrollTop === 0 is NOT automatically logical beginning.
        if (currentMetrics.isAtTop) {
          if (addedCount === 0) {
            sameStateCount++;
            // Try triggering scroll/pagination again up to 6 times with a slight delay
            if (sameStateCount < 6) {
              await new Promise((r) => setTimeout(r, 250));
            } else {
              // Re-check beginning with definitive evidence
              reachedBeginning = strategy.isAtBeginning(doc, collectedMessages);
              completenessState = reachedBeginning ? 'COMPLETE' : 'PARTIAL';
              break;
            }
          }
        }
      }

      if (reachedBeginning) {
        completenessState = 'COMPLETE';
      } else if (completenessState !== 'COMPLETE') {
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
