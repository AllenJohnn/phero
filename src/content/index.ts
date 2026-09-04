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

// IMMEDIATE INJECTION: Run network interceptors instantly at document_start
// before React hydration fires the fetch requests.
const currentUrl = new URL(window.location.href);
const registry = AdapterRegistry.getInstance();
const adapter = registry.findAdapterByUrl(currentUrl);
if (adapter && adapter.startDiagnostics) {
  adapter.startDiagnostics(document);
}

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

let currentUnmount: (() => void) | null = null;
let currentProviderId: ProviderId | null = null;
let lastUrl = window.location.href;

function initialize(forceRemount = false) {
  const registry = AdapterRegistry.getInstance();
  const currentUrl = new URL(window.location.href);
  const adapter = registry.findAdapterByUrl(currentUrl);

  if (!adapter) {
    if (currentProviderId) {
      Logger.info('[PHERO LIFECYCLE] Provider no longer matches. Cleaning up.', { url: currentUrl.hostname });
      if (currentUnmount) {
        currentUnmount();
        currentUnmount = null;
      }
      currentProviderId = null;
    }
    return;
  }

  // If provider changed, or we are forced to remount, or host is missing
  const host = document.getElementById('phero-floating-host');
  const needsMount = forceRemount || !host || currentProviderId !== adapter.id;

  if (needsMount) {
    Logger.info(`[PHERO LIFECYCLE] Mounting for provider: ${adapter.name}`, { id: adapter.id, forceRemount, hasHost: !!host });
    
    if (currentUnmount) {
      currentUnmount();
      currentUnmount = null;
    }

    currentProviderId = adapter.id;
    currentUnmount = mountFloatingPill(adapter.id);
    
    // Check for pending handoffs
    InjectionCoordinator.checkAndPerformInjection(adapter.id);

    // Start diagnostics if available for root cause discovery
    if (adapter.startDiagnostics) {
      adapter.startDiagnostics(document);
    }
  }
}

// 3. Listen for popup / background messages (attach only once)
let messageListenerAttached = false;
function attachMessageListener() {
  if (messageListenerAttached) return;
  messageListenerAttached = true;
  
  chrome.runtime.onMessage.addListener((message: PheroMessage, _sender, sendResponse) => {
    const registry = AdapterRegistry.getInstance();
    const adapter = registry.findAdapterByUrl(new URL(window.location.href));
    
    if (!adapter) {
      if (message.type === 'PHERO_CHECK_STATE' || message.type === 'PHERO_TRIGGER_HANDOFF') {
        sendResponse({ error: 'No active provider' });
      }
      return false;
    }

    if (message.type === 'PHERO_CHECK_STATE') {
      (async () => {
        try {
          const state = await adapter.detectState(document);
          sendResponse({
            type: 'PHERO_STATE_RESPONSE',
            providerId: adapter.id,
            state,
          });
        } catch (err) {
          sendResponse({
            type: 'PHERO_STATE_RESPONSE',
            providerId: adapter.id,
            state: { isAvailable: false, isInConversation: false },
          });
        }
      })();
      return true;
    }

    if (message.type === 'PHERO_TRIGGER_HANDOFF') {
      (async () => {
        try {
          const res = await executeHandoff(adapter, message.destinationProvider);
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

function startLifecycleManager() {
  Logger.info('[PHERO LIFECYCLE] Starting resilient lifecycle manager');
  
  attachMessageListener();
  initialize();

  // Use a lightweight interval to check for SPA navigation and host removal
  // This survives document.body replacement and avoids heavy MutationObservers
  setInterval(() => {
    try {
      let shouldCheck = false;
      
      // 1. Check for SPA navigation
      if (window.location.href !== lastUrl) {
        Logger.info('[PHERO LIFECYCLE] SPA navigation detected', { from: lastUrl, to: window.location.href });
        lastUrl = window.location.href;
        shouldCheck = true;
      }
      
      // 2. Check if host was removed (e.g. during hydration or body replacement)
      if (currentProviderId) {
        const host = document.getElementById('phero-floating-host');
        if (!host) {
          Logger.info('[PHERO LIFECYCLE] Host element removed from DOM. Hydration or body replacement suspected.');
          shouldCheck = true;
        } else if (!document.body.contains(host)) {
          Logger.info('[PHERO LIFECYCLE] Host element disconnected from body.');
          shouldCheck = true;
        }
      }
      
      if (shouldCheck) {
        initialize();
      }
    } catch (err) {
      Logger.error('[PHERO LIFECYCLE] Exception in lifecycle loop', err);
    }
  }, 1000);
}

// Initialize when DOM is ready, or immediately if already interactive/complete
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startLifecycleManager);
} else {
  startLifecycleManager();
}
