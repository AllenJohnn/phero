import { HandoffPayload } from '../core/models/handoff.ts';
import { SessionStorageManager } from '../core/storage/session.ts';
import { AdapterRegistry } from '../adapters/registry.ts';
import { Logger } from '../shared/logger.ts';

export class BackgroundHandoffManager {
  private static instance: BackgroundHandoffManager;

  public static getInstance(): BackgroundHandoffManager {
    if (!BackgroundHandoffManager.instance) {
      BackgroundHandoffManager.instance = new BackgroundHandoffManager();
    }
    return BackgroundHandoffManager.instance;
  }

  public async startHandoff(payload: HandoffPayload): Promise<{ success: boolean; tabId?: number; error?: string }> {
    try {
      Logger.info('Starting handoff process in background', {
        source: payload.sourceProvider,
        destination: payload.destinationProvider,
      });

      // 1. Store payload in ephemeral session storage
      await SessionStorageManager.saveHandoff(payload);

      // 2. Resolve destination URL from adapter
      const registry = AdapterRegistry.getInstance();
      const destAdapter = registry.getAdapter(payload.destinationProvider);

      if (!destAdapter) {
        throw new Error(`Unsupported destination provider: ${payload.destinationProvider}`);
      }

      const destinationUrl = destAdapter.getDestinationUrl();

      // 3. Open destination in a new tab
      const tab = await chrome.tabs.create({
        url: destinationUrl,
        active: true,
      });

      Logger.info('Destination tab created', { tabId: tab.id ?? 0, url: destinationUrl });

      return {
        success: true,
        tabId: tab.id,
      };
    } catch (err) {
      Logger.error('Failed to initiate handoff', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to create destination tab',
      };
    }
  }

  public async getPendingHandoff(destinationProvider: string): Promise<HandoffPayload | null> {
    return SessionStorageManager.getPendingHandoff(destinationProvider);
  }

  public async clearHandoff(handoffId: string, destination?: string): Promise<void> {
    return SessionStorageManager.clearHandoff(handoffId, destination);
  }
}
