import { AdapterRegistry } from '../adapters/registry.ts';
import { AIProviderAdapter } from '../adapters/types.ts';
import { mountFloatingPill } from '../ui/floating-action/mount.ts';
import { InjectionCoordinator } from './injection-coordinator.ts';
import { Logger } from '../shared/logger.ts';
import { PheroMessage } from '../shared/messages.ts';
import { ProviderId } from '../core/models/conversation.ts';
import { HandoffPayload } from '../core/models/handoff.ts';
import { buildContinuationPrompt } from '../core/context/prompt-builder.ts';

Logger.info('PHERO content script loaded on page', { href: window.location.href });

async function executeHandoff(currentAdapter: AIProviderAdapter, destination: ProviderId) {
  Logger.info('Executing handoff from content script', {
    source: currentAdapter.id,
    destination,
  });

  const extraction = await currentAdapter.extractConversation(document);
  if (extraction.conversation.messages.length === 0) {
    throw new Error('No conversation messages detected on page.');
  }

  const continuationPrompt = buildContinuationPrompt(extraction.conversation);
  const handoffId = `handoff_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const payload: HandoffPayload = {
    handoffId,
    sourceProvider: currentAdapter.id,
    destinationProvider: destination,
    conversation: extraction.conversation,
    continuationPrompt,
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000,
    status: 'opening_destination',
    isCompletenessVerified: extraction.isComplete,
    totalMessagesExtracted: extraction.totalTurnsDetected,
  };

  const response = await chrome.runtime.sendMessage({
    type: 'PHERO_START_HANDOFF',
    sourceProvider: currentAdapter.id,
    destinationProvider: destination,
    payload,
  });

  return response;
}

function initialize() {
  const registry = AdapterRegistry.getInstance();
  const currentUrl = new URL(window.location.href);
  const currentAdapter = registry.findAdapterByUrl(currentUrl);

  if (!currentAdapter) {
    Logger.info('Current URL does not match any supported provider', { url: currentUrl.hostname });
    return;
  }

  Logger.info(`Detected provider: ${currentAdapter.name}`, { id: currentAdapter.id });

  // 1. Mount the in-page Floating Action Pill
  mountFloatingPill(currentAdapter.id);

  // 2. If we are on Claude (or any destination), check for pending handoffs to inject
  if (currentAdapter.id === 'claude') {
    InjectionCoordinator.checkAndPerformInjection('claude');
  }

  // 3. Listen for popup / background messages
  chrome.runtime.onMessage.addListener((message: PheroMessage, _sender, sendResponse) => {
    if (message.type === 'PHERO_CHECK_STATE') {
      (async () => {
        try {
          const state = await currentAdapter.detectState(document);
          sendResponse({
            type: 'PHERO_STATE_RESPONSE',
            providerId: currentAdapter.id,
            state,
          });
        } catch (err) {
          sendResponse({
            type: 'PHERO_STATE_RESPONSE',
            providerId: currentAdapter.id,
            state: { isAvailable: false, isInConversation: false },
          });
        }
      })();
      return true;
    }

    if (message.type === 'PHERO_TRIGGER_HANDOFF') {
      (async () => {
        try {
          const res = await executeHandoff(currentAdapter, message.destinationProvider);
          sendResponse({ success: true, result: res });
        } catch (err) {
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : 'Failed to extract conversation',
          });
        }
      })();
      return true;
    }

    return false;
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
