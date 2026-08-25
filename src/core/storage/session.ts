import { HandoffPayload } from '../models/handoff.ts';
import { Logger } from '../../shared/logger.ts';

const SESSION_STORAGE_KEY_PREFIX = 'phero_handoff_';
export const HANDOFF_DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

export class SessionStorageManager {
  private static getStorageArea(): chrome.storage.StorageArea {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      return chrome.storage.session;
    }
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return chrome.storage.local;
    }
    // In-memory fallback for unit testing
    return {
      get: async (_keys: any) => ({}),
      set: async (_items: any) => {},
      remove: async (_keys: any) => {},
      clear: async () => {},
    } as any;
  }

  public static async saveHandoff(payload: HandoffPayload): Promise<void> {
    const storage = this.getStorageArea();
    const key = `${SESSION_STORAGE_KEY_PREFIX}${payload.destinationProvider}`;
    const directKey = `${SESSION_STORAGE_KEY_PREFIX}id_${payload.handoffId}`;

    const data = {
      [key]: payload,
      [directKey]: payload,
    };

    await storage.set(data);
    Logger.info('Saved handoff to ephemeral session storage', {
      handoffId: payload.handoffId,
      destination: payload.destinationProvider,
    });
  }

  public static async getPendingHandoff(destination: string): Promise<HandoffPayload | null> {
    const storage = this.getStorageArea();
    const key = `${SESSION_STORAGE_KEY_PREFIX}${destination}`;
    const result = await storage.get(key);
    const payload = result[key] as HandoffPayload | undefined;

    if (!payload) return null;

    // Verify TTL
    if (Date.now() > payload.expiresAt) {
      Logger.warn('Pending handoff has expired, purging', { handoffId: payload.handoffId });
      await this.clearHandoff(payload.handoffId, destination);
      return null;
    }

    return payload;
  }

  public static async getHandoffById(handoffId: string): Promise<HandoffPayload | null> {
    const storage = this.getStorageArea();
    const key = `${SESSION_STORAGE_KEY_PREFIX}id_${handoffId}`;
    const result = await storage.get(key);
    const payload = result[key] as HandoffPayload | undefined;

    if (!payload) return null;
    if (Date.now() > payload.expiresAt) {
      await this.clearHandoff(handoffId, payload.destinationProvider);
      return null;
    }
    return payload;
  }

  public static async clearHandoff(handoffId: string, destination?: string): Promise<void> {
    const storage = this.getStorageArea();
    const keysToRemove = [`${SESSION_STORAGE_KEY_PREFIX}id_${handoffId}`];
    if (destination) {
      keysToRemove.push(`${SESSION_STORAGE_KEY_PREFIX}${destination}`);
    }
    await storage.remove(keysToRemove);
    Logger.info('Cleared ephemeral handoff payload', { handoffId });
  }
}
