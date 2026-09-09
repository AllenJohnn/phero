import { Logger } from '../../shared/logger.js';
const SESSION_STORAGE_KEY_PREFIX = 'phero_handoff_';
export const HANDOFF_DEFAULT_TTL_MS = 5 * 60 * 1000;
export class SessionStorageManager {
  static getStorageArea() {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      return chrome.storage.session;
    }
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return chrome.storage.local;
    }
    return {
      get: async _keys => ({}),
      set: async _items => {},
      remove: async _keys => {},
      clear: async () => {}
    };
  }
  static async saveHandoff(payload) {
    const storage = this.getStorageArea();
    const key = `${SESSION_STORAGE_KEY_PREFIX}${payload.destinationProvider}`;
    const directKey = `${SESSION_STORAGE_KEY_PREFIX}id_${payload.handoffId}`;
    const data = {
      [key]: payload,
      [directKey]: payload
    };
    await storage.set(data);
    Logger.info('Saved handoff to ephemeral session storage', {
      handoffId: payload.handoffId,
      destination: payload.destinationProvider
    });
  }
  static async getPendingHandoff(destination) {
    const storage = this.getStorageArea();
    const key = `${SESSION_STORAGE_KEY_PREFIX}${destination}`;
    const result = await storage.get(key);
    const payload = result[key];
    if (!payload) return null;
    if (Date.now() > payload.expiresAt) {
      Logger.warn('Pending handoff has expired, purging', {
        handoffId: payload.handoffId
      });
      await this.clearHandoff(payload.handoffId, destination);
      return null;
    }
    return payload;
  }
  static async getHandoffById(handoffId) {
    const storage = this.getStorageArea();
    const key = `${SESSION_STORAGE_KEY_PREFIX}id_${handoffId}`;
    const result = await storage.get(key);
    const payload = result[key];
    if (!payload) return null;
    if (Date.now() > payload.expiresAt) {
      await this.clearHandoff(handoffId, payload.destinationProvider);
      return null;
    }
    return payload;
  }
  static async clearHandoff(handoffId, destination) {
    const storage = this.getStorageArea();
    const keysToRemove = [`${SESSION_STORAGE_KEY_PREFIX}id_${handoffId}`];
    if (destination) {
      keysToRemove.push(`${SESSION_STORAGE_KEY_PREFIX}${destination}`);
    }
    await storage.remove(keysToRemove);
    Logger.info('Cleared ephemeral handoff payload', {
      handoffId
    });
  }
}