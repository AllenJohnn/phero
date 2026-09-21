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
        case 'claude-fetch-conversation':
          {
            const { conversationId } = message;
            if (!/^[a-zA-Z0-9-]+$/.test(conversationId)) {
              sendResponse({ success: false, error: 'Invalid conversation ID' });
              break;
            }

            const sessionCookie = await chrome.cookies.get({ url: 'https://claude.ai', name: 'sessionKey' });
            if (!sessionCookie || !sessionCookie.value) {
              sendResponse({ success: false, error: 'Missing Claude sessionKey cookie. Please log in to Claude.' });
              break;
            }

            // Using getAll for lastActiveOrg as requested
            const orgCookies = await chrome.cookies.getAll({ name: 'lastActiveOrg' });
            const orgCookie = orgCookies.find(c => c.domain.includes('claude.ai'));
            const orgId = orgCookie ? orgCookie.value : '';
            if (!orgId) {
              sendResponse({ success: false, error: 'Missing Claude lastActiveOrg cookie.' });
              break;
            }

            const endpoint = `https://claude.ai/api/organizations/${orgId}/chat_conversations/${conversationId}?tree=True&rendering_mode=messages&render_all_tools=true`;
            
            const res = await fetch(endpoint, {
              headers: {
                'Cookie': `sessionKey=${sessionCookie.value}; lastActiveOrg=${orgId}`
              }
            });

            if (!res.ok) {
              sendResponse({ success: false, error: `Claude API responded with ${res.status}` });
              break;
            }

            const data = await res.json();
            sendResponse({ success: true, data });
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