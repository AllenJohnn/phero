import { NormalizedConversation, NormalizedMessage, ProviderId } from '../models/conversation.ts';
import {
  CaptureCompletenessState,
  CaptureOptions,
  CaptureResult,
  ProviderCaptureStrategy,
} from './types.ts';
import { deduplicateMessages, reindexMessages } from './deduplication.ts';
import { getScrollMetrics } from './scroll-helper.ts';
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
    const maxAttempts = options.maxScrollAttempts ?? 50;
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

    let collectedMessages: NormalizedMessage[] = [];
    let windowsCount = 0;
    let attempts = 0;
    let zeroAddedAtTopCount = 0;
    let reachedBeginning = false;
    let completenessState: CaptureCompletenessState = 'RECOVERING';

    try {
      // 2. Initial capture of currently rendered window
      const initialBatch = strategy.captureCurrentVisibleMessages(doc);
      collectedMessages = deduplicateMessages(collectedMessages, initialBatch);
      windowsCount++;

      const initialMetrics = getScrollMetrics(scrollContainer, doc);
      Logger.info(`[PHERO CAPTURE INIT] ${meta.providerId}`, {
        initialExtracted: initialBatch.length,
        totalCollected: collectedMessages.length,
        scrollTop: initialMetrics.scrollTop,
        scrollHeight: initialMetrics.scrollHeight,
        clientHeight: initialMetrics.clientHeight,
        isAtTop: initialMetrics.isAtTop,
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

        // Scroll upward
        await strategy.scrollUp(scrollContainer);

        // Wait for potential virtual DOM rendering or lazy loading
        await new Promise((r) => setTimeout(r, scrollDelay));
        await strategy.waitForNewMessages(doc, prevCount, 350);

        // Capture newly rendered window
        const newBatch = strategy.captureCurrentVisibleMessages(doc);
        const merged = deduplicateMessages(newBatch, collectedMessages); // put older ones first
        windowsCount++;

        const addedCount = merged.length - collectedMessages.length;
        collectedMessages = merged;

        const currentMetrics = getScrollMetrics(scrollContainer, doc);

        Logger.info(`[PHERO CAPTURE STEP ${attempts}]`, {
          addedInStep: addedCount,
          totalCollected: collectedMessages.length,
          scrollTop: currentMetrics.scrollTop,
          scrollHeight: currentMetrics.scrollHeight,
          clientHeight: currentMetrics.clientHeight,
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

        if (currentMetrics.isAtTop) {
          if (addedCount === 0) {
            zeroAddedAtTopCount++;
            if (zeroAddedAtTopCount >= 3) {
              // At the very top for 3 attempts and no more messages appeared
              reachedBeginning = strategy.isAtBeginning(doc, collectedMessages);
              completenessState = reachedBeginning ? 'COMPLETE' : 'PARTIAL';
              break;
            }
          } else {
            zeroAddedAtTopCount = 0;
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
