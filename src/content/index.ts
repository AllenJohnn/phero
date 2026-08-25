import { AdapterRegistry } from '../adapters/registry.ts';
import { mountFloatingPill } from '../ui/floating-action/mount.ts';
import { InjectionCoordinator } from './injection-coordinator.ts';
import { Logger } from '../shared/logger.ts';
import { PheroMessage } from '../shared/messages.ts';

Logger.info('PHERO content script loaded on page', { href: window.location.href });

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

  // 3. Listen for popup / background state checks
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
    return false;
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
