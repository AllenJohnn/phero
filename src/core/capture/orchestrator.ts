import { NormalizedMessage, ProviderId } from '../models/conversation.ts';
import {
  CaptureCompletenessState,
  CaptureMethod,
  CaptureOptions,
  CaptureResult,
  ProviderCaptureStrategy,
} from './types.ts';
import { deduplicateMessagesWithAudit, reindexMessages } from './deduplication.ts';
import { getScrollMetrics, getVisibleTurnRange } from './scroll-helper.ts';
import { Logger } from '../../shared/logger.ts';

export class CaptureOrchestrator {
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

    let scrollContainer = strategy.getScrollContainer(doc);
    let originalScrollTop = 0;
    let originalScrollLeft = 0;
    const activeElement = doc.activeElement as HTMLElement | null;

    if (typeof HTMLElement !== 'undefined' && scrollContainer instanceof HTMLElement) {
      originalScrollTop = scrollContainer.scrollTop;
      originalScrollLeft = scrollContainer.scrollLeft;
    } else if (typeof window !== 'undefined') {
      originalScrollTop = window.scrollY || doc.documentElement.scrollTop || 0;
      originalScrollLeft = window.scrollX || doc.documentElement.scrollLeft || 0;
    }

    const refreshContainer = (): HTMLElement | Window => {
      if (typeof HTMLElement !== 'undefined' && scrollContainer instanceof HTMLElement && (!scrollContainer.isConnected || scrollContainer.scrollHeight <= scrollContainer.clientHeight)) {
        scrollContainer = strategy.getScrollContainer(doc);
      }
      return scrollContainer;
    };

    let collectedMessages: NormalizedMessage[] = strategy.captureCurrentVisibleMessages(doc);
    let reachedBeginning = strategy.isAtBeginning(doc, collectedMessages);
    let completenessState: CaptureCompletenessState = reachedBeginning ? 'COMPLETE' : 'RECOVERING';
    
    const initialMetrics = getScrollMetrics(scrollContainer, doc);
    const estimatedSteps = Math.ceil(initialMetrics.scrollTop / 500);
    const maxAttempts = options.maxScrollAttempts ?? Math.min(1000, Math.max(100, estimatedSteps * 3 + 50));
    
    let attempts = 0;
    let sameStateCount = 0;
    let windowsCount = 1;

    onProgress?.({ status: 'RECOVERING', messagesCaptured: collectedMessages.length, currentStepDescription: `Captured initial ${collectedMessages.length} messages` });

    try {
      while (!reachedBeginning && attempts < maxAttempts) {
        attempts++;
        const activeContainer = refreshContainer();
        const beforeTurnRange = getVisibleTurnRange(doc);
        
        await strategy.scrollUp(activeContainer);
        
        const waitTime = options.scrollDelayMs !== undefined ? options.scrollDelayMs : 1500;
        await strategy.waitForNewMessages(doc, beforeTurnRange, waitTime);
        
        const currentContainer = refreshContainer();
        const currentTurnRange = getVisibleTurnRange(doc);
        
        const newBatch = strategy.captureCurrentVisibleMessages(doc);
        const mergeResult = deduplicateMessagesWithAudit(newBatch, collectedMessages);
        
        const addedCount = mergeResult.messages.length - collectedMessages.length;
        collectedMessages = mergeResult.messages;
        windowsCount++;
        
        reachedBeginning = strategy.isAtBeginning(doc, collectedMessages);
        
        if (reachedBeginning) {
           completenessState = 'COMPLETE';
           break;
        }

        if (addedCount > 0 || currentTurnRange.earliestTurnId !== beforeTurnRange.earliestTurnId) {
          sameStateCount = 0;
        } else {
          sameStateCount++;
          
          // Determine how patient we should be based on our physical location
          const metrics = getScrollMetrics(currentContainer, doc);
          const maxStalls = metrics.isAtTop ? 6 : 3; // Wait 9 seconds at the top, 4.5s midway
          
          if (sameStateCount >= maxStalls) {
            Logger.warn('[PHERO] Scrolling stalled mid-conversation. Assuming complete or dead-end.');
            if (metrics.isAtTop || strategy.isAtBeginning(doc, collectedMessages)) {
                completenessState = 'COMPLETE';
                reachedBeginning = true;
            } else {
                completenessState = 'UNKNOWN';
            }
            break;
          }
        }
      }

      if (completenessState === 'RECOVERING') {
        completenessState = attempts >= maxAttempts ? 'PARTIAL' : 'UNKNOWN';
      }
    } catch (err) {
      Logger.error('Error during capture orchestrator execution', err);
      completenessState = collectedMessages.length > 0 ? 'PARTIAL' : 'UNKNOWN';
    } finally {
      try {
        const restorationContainer = refreshContainer();
        if (typeof HTMLElement !== 'undefined' && restorationContainer instanceof HTMLElement) {
          restorationContainer.scrollTop = originalScrollTop;
          restorationContainer.scrollLeft = originalScrollLeft;
        } else if (typeof window !== 'undefined') {
          window.scrollTo(originalScrollLeft, originalScrollTop);
        }
        if (activeElement && typeof activeElement.focus === 'function') activeElement.focus();
      } catch {}
    }

    const finalMessages = reindexMessages(collectedMessages);
    const isComplete = completenessState === 'COMPLETE';
    const warning = !isComplete && finalMessages.length > 0
        ? `Some earlier messages couldn't be retrieved. ${finalMessages.length} messages were captured.`
        : undefined;

    return {
      conversation: {
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
      },
      completenessState,
      captureMethod: 'DOM_VIRTUALIZATION' as CaptureMethod,
      isComplete,
      totalCaptured: finalMessages.length,
      warning,
      capturedWindowsCount: windowsCount,
    };
  }
}