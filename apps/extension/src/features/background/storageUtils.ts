import { logger } from '../../utils';

export const storageUtils = {
  async getItem<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    try {
      const result = await chrome.storage.local.get(key);
      return (result[key] as T | undefined) ?? defaultValue;
    } catch (error) {
      logger.error(`Failed to get item: ${key}`, error);
      return defaultValue;
    }
  },

  async setItem<T>(key: string, value: T): Promise<void> {
    try {
      await chrome.storage.local.set({ [key]: value });
    } catch (error) {
      logger.error(`Failed to set item: ${key}`, error);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await chrome.storage.local.remove(key);
    } catch (error) {
      logger.error(`Failed to remove item: ${key}`, error);
    }
  },

  async clear(): Promise<void> {
    try {
      await chrome.storage.local.clear();
    } catch (error) {
      logger.error('Failed to clear storage', error);
    }
  },
};
