import { SessionStorageManager } from '../core/storage/session.js';
import { AdapterRegistry } from '../adapters/registry.js';
import { Logger } from '../shared/logger.js';
export class BackgroundHandoffManager {
  static getInstance() {
    if (!BackgroundHandoffManager.instance) {
      BackgroundHandoffManager.instance = new BackgroundHandoffManager();
    }
    return BackgroundHandoffManager.instance;
  }
  async startHandoff(payload) {
    try {
      Logger.info('Starting handoff process in background', {
        source: payload.sourceProvider,
        destination: payload.destinationProvider
      });
      await SessionStorageManager.saveHandoff(payload);
      const registry = AdapterRegistry.getInstance();
      const destAdapter = registry.getAdapter(payload.destinationProvider);
      if (!destAdapter) {
        throw new Error(`Unsupported destination provider: ${payload.destinationProvider}`);
      }
      const destinationUrl = destAdapter.getDestinationUrl();
      const tab = await chrome.tabs.create({
        url: destinationUrl,
        active: true
      });
      Logger.info('Destination tab created', {
        tabId: tab.id ?? 0,
        url: destinationUrl
      });
      return {
        success: true,
        tabId: tab.id
      };
    } catch (err) {
      Logger.error('Failed to initiate handoff', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to create destination tab'
      };
    }
  }
  async getPendingHandoff(destinationProvider) {
    return SessionStorageManager.getPendingHandoff(destinationProvider);
  }
  async clearHandoff(handoffId, destination) {
    return SessionStorageManager.clearHandoff(handoffId, destination);
  }
}