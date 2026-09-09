import { BackgroundHandoffManager } from './handoff-manager.js';
import { Logger } from '../shared/logger.js';
Logger.info('PHERO background service worker initialized');
const handoffManager = BackgroundHandoffManager.getInstance();
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) return false;
  (async () => {
    try {
      switch (message.type) {
        case 'PHERO_START_HANDOFF':
          {
            Logger.info('Received PHERO_START_HANDOFF', {
              source: message.sourceProvider,
              destination: message.destinationProvider
            });
            const result = await handoffManager.startHandoff(message.payload);
            sendResponse(result);
            break;
          }
        case 'PHERO_GET_PENDING_HANDOFF':
          {
            const handoff = await handoffManager.getPendingHandoff(message.destinationProvider);
            sendResponse({
              type: 'PHERO_PENDING_HANDOFF_RESPONSE',
              handoff
            });
            break;
          }
        case 'PHERO_CLEAR_HANDOFF':
          {
            await handoffManager.clearHandoff(message.handoffId);
            sendResponse({
              success: true
            });
            break;
          }
        default:
          sendResponse({
            error: 'Unknown message type'
          });
          break;
      }
    } catch (err) {
      Logger.error('Error handling background message', err);
      sendResponse({
        error: err instanceof Error ? err.message : 'Unknown background error'
      });
    }
  })();
  return true;
});