/**
 * In-memory storage implementation that fully implements the Storage interface.
 * Used as a fallback when localStorage is unavailable (SSR, private browsing, etc).
 *
 * AUDIT-P3-TYPE: Implements Storage interface properly to avoid unsafe casts.
 */
class MemoryStorage implements Storage {
  private storage = new Map<string, string>();

  getItem(key: string): string | null {
    return this.storage.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.storage.set(key, value);
  }

  removeItem(key: string): void {
    this.storage.delete(key);
  }

  clear(): void {
    this.storage.clear();
  }

  get length(): number {
    return this.storage.size;
  }

  key(index: number): string | null {
    const keys = Array.from(this.storage.keys());
    return keys[index] ?? null;
  }

  // Storage interface requires index signature for bracket access
  [name: string]: unknown;
}

function isLocalStorageAvailable(): boolean {
  try {
    const testKey = '__localStorage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function getStorage(): Storage {
  if (typeof window === 'undefined') {
    // AUDIT-P3-TYPE: MemoryStorage now properly implements Storage interface
    return new MemoryStorage();
  }

  if (isLocalStorageAvailable()) {
    return localStorage;
  }

  console.warn('[localStorage] localStorage is unavailable, using in-memory fallback');
  // AUDIT-P3-TYPE: MemoryStorage now properly implements Storage interface
  return new MemoryStorage();
}

let storageInstance: Storage | null = null;

function getStorageInstance(): Storage {
  if (!storageInstance) {
    storageInstance = getStorage();
  }
  return storageInstance;
}

/**
 * Safely retrieves a string value from localStorage with error handling.
 * Falls back to in-memory storage when localStorage is unavailable.
 *
 * @param key - The storage key to retrieve
 * @param defaultValue - Value to return if key doesn't exist or on error
 * @returns The stored value, or defaultValue if not found/error
 */
export function safeGetItem(key: string, defaultValue: string | null = null): string | null {
  try {
    const storage = getStorageInstance();
    const value = storage.getItem(key);
    return value !== null ? value : defaultValue;
  } catch (error) {
    console.error(`[localStorage] Failed to get item "${key}":`, error);
    return defaultValue;
  }
}

/**
 * Safely stores a string value in localStorage with automatic quota handling.
 * Attempts cleanup of old data if quota is exceeded.
 *
 * @param key - The storage key
 * @param value - The string value to store
 * @returns true if stored successfully, false on failure
 */
export function safeSetItem(key: string, value: string): boolean {
  try {
    const storage = getStorageInstance();
    storage.setItem(key, value);
    return true;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'QuotaExceededError') {
        console.error(`[localStorage] Storage quota exceeded when setting "${key}"`);

        tryCleanupOldData();

        try {
          const storage = getStorageInstance();
          storage.setItem(key, value);
          return true;
        } catch {
          console.error(`[localStorage] Still failed after cleanup for "${key}"`);
        }
      } else if (error.name === 'SecurityError') {
        console.error(`[localStorage] Security error when setting "${key}" (private browsing?)`);
      } else {
        console.error(`[localStorage] Failed to set item "${key}":`, error);
      }
    }
    return false;
  }
}

/**
 * Safely removes an item from localStorage.
 *
 * @param key - The storage key to remove
 * @returns true if removed successfully, false on error
 */
export function safeRemoveItem(key: string): boolean {
  try {
    const storage = getStorageInstance();
    storage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`[localStorage] Failed to remove item "${key}":`, error);
    return false;
  }
}

/**
 * Safely clears all items from localStorage.
 *
 * @returns true if cleared successfully, false on error
 */
export function safeClear(): boolean {
  try {
    const storage = getStorageInstance();
    storage.clear();
    return true;
  } catch (error) {
    console.error('[localStorage] Failed to clear storage:', error);
    return false;
  }
}

/**
 * Retrieves and parses a JSON value from localStorage.
 * Returns the default value if the key doesn't exist or JSON parsing fails.
 *
 * @param key - The storage key
 * @param defaultValue - Value to return if key doesn't exist or parse fails
 * @returns The parsed object, or defaultValue on failure
 *
 * @example
 * const settings = safeGetJSON<Settings>('user-settings', { theme: 'dark' });
 */
export function safeGetJSON<T>(key: string, defaultValue: T): T {
  try {
    const item = safeGetItem(key);
    if (item === null) {
      return defaultValue;
    }
    return JSON.parse(item) as T;
  } catch (error) {
    console.error(`[localStorage] Failed to parse JSON for "${key}":`, error);
    return defaultValue;
  }
}

/**
 * Serializes an object to JSON and stores it in localStorage.
 *
 * @param key - The storage key
 * @param value - The value to serialize and store (must be JSON-serializable)
 * @returns true if stored successfully, false on serialization or storage error
 *
 * @example
 * safeSetJSON('user-settings', { theme: 'dark', fontSize: 14 });
 */
export function safeSetJSON<T>(key: string, value: T): boolean {
  try {
    const serialized = JSON.stringify(value);
    return safeSetItem(key, serialized);
  } catch (error) {
    console.error(`[localStorage] Failed to serialize JSON for "${key}":`, error);
    return false;
  }
}

function tryCleanupOldData(): void {
  try {
    const storage = getStorageInstance();
    const keysToClean = ['analytics_offline_events', 'error_tracking_breadcrumbs', 'debug_logs'];

    for (const key of keysToClean) {
      try {
        storage.removeItem(key);
      } catch {
        // AUDIT-P3-ERROR: Intentionally ignored - cleanup is best-effort during quota recovery
      }
    }
  } catch (error) {
    console.error('[localStorage] Failed to cleanup old data:', error);
  }
}

/**
 * Returns the type of storage currently in use.
 * Useful for debugging and informing users about data persistence.
 *
 * @returns 'localStorage' if browser storage is available, 'memory' otherwise
 */
export function getStorageType(): 'localStorage' | 'memory' {
  const storage = getStorageInstance();
  return storage instanceof MemoryStorage ? 'memory' : 'localStorage';
}

/**
 * Checks if browser localStorage is available and writable.
 * Returns false in private browsing mode or when storage is disabled.
 *
 * @returns true if localStorage is available, false otherwise
 */
export function isStorageAvailable(): boolean {
  return isLocalStorageAvailable();
}

/**
 * Calculates current localStorage usage statistics.
 * Assumes a 5MB quota (standard browser limit).
 *
 * @returns Object with used bytes, available bytes, and percentage used
 *
 * @example
 * const usage = getStorageUsage();
 * console.log(`Storage is ${usage.percentage.toFixed(1)}% full`);
 */
export function getStorageUsage(): { used: number; available: number; percentage: number } {
  try {
    const storage = getStorageInstance();
    let used = 0;

    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key) {
        const value = storage.getItem(key);
        if (value) {
          used += key.length + value.length;
        }
      }
    }

    const available = 5 * 1024 * 1024;
    const percentage = (used / available) * 100;

    return {
      used,
      available,
      percentage: Math.min(percentage, 100),
    };
  } catch (error) {
    console.error('[localStorage] Failed to calculate storage usage:', error);
    return { used: 0, available: 0, percentage: 0 };
  }
}

/**
 * Checks if there's enough storage space before persisting data.
 * Pre-validates writes to avoid QuotaExceededError during critical operations.
 *
 * @param dataSize - Size of data to persist in bytes
 * @param safetyMargin - Percentage of total space to keep free (default 10%)
 * @returns true if there's enough space, false otherwise
 *
 * @example
 * const data = JSON.stringify(largeObject);
 * if (hasStorageQuota(data.length * 2)) { // UTF-16 = 2 bytes per char
 *   safeSetItem('key', data);
 * }
 */
export function hasStorageQuota(dataSize: number, safetyMargin = 0.1): boolean {
  try {
    const usage = getStorageUsage();
    const maxUsable = usage.available * (1 - safetyMargin);
    const projectedUsage = usage.used + dataSize;

    if (projectedUsage > maxUsable) {
      console.warn(
        `[localStorage] STR-008: Quota check failed. Current: ${usage.used}, Adding: ${dataSize}, Max: ${maxUsable}`,
      );
      return false;
    }
    return true;
  } catch {
    // If we can't check, assume we have space and let the actual write fail
    return true;
  }
}

/**
 * Stores JSON with quota pre-check and detailed error reporting.
 * Verifies available space before attempting the write operation.
 *
 * @param key - The storage key
 * @param value - The value to serialize and store
 * @returns Object with success status and optional error type
 *
 * @example
 * const result = safeSetJSONWithQuotaCheck('large-data', bigObject);
 * if (!result.success && result.error === 'quota_exceeded') {
 *   showStorageFullWarning();
 * }
 */
export function safeSetJSONWithQuotaCheck<T>(
  key: string,
  value: T,
): { success: boolean; error?: 'quota_exceeded' | 'serialization_error' | 'write_error' } {
  try {
    const serialized = JSON.stringify(value);
    const dataSize = serialized.length * 2; // UTF-16 encoding

    if (!hasStorageQuota(dataSize)) {
      console.warn(`[localStorage] STR-008: Quota would be exceeded for key "${key}"`);
      return { success: false, error: 'quota_exceeded' };
    }

    const success = safeSetItem(key, serialized);
    if (!success) {
      return { success: false, error: 'write_error' };
    }
    return { success: true };
  } catch (error) {
    console.error(`[localStorage] STR-008: Failed to set "${key}":`, error);
    return { success: false, error: 'serialization_error' };
  }
}

/**
 * Gets the estimated size of a key's data in storage (in bytes).
 * Accounts for UTF-16 encoding used by JavaScript strings.
 *
 * @param key - The storage key to measure
 * @returns Size in bytes, or 0 if key doesn't exist
 */
export function getKeySize(key: string): number {
  try {
    const storage = getStorageInstance();
    const value = storage.getItem(key);
    if (value === null) return 0;
    return (key.length + value.length) * 2; // UTF-16 encoding
  } catch {
    return 0;
  }
}

/**
 * Removes specified keys from storage to free up space.
 * Keys are removed in order until the target free space is reached.
 *
 * @param keysToClean - Keys to remove, in priority order (first = most expendable)
 * @param targetFreeBytes - Target amount of bytes to free
 * @returns Actual number of bytes freed
 *
 * @example
 * // Free up 100KB by removing debug data first
 * const freed = cleanupStorage(['debug_logs', 'analytics_cache'], 100 * 1024);
 */
export function cleanupStorage(keysToClean: string[], targetFreeBytes: number): number {
  let freedBytes = 0;

  for (const key of keysToClean) {
    if (freedBytes >= targetFreeBytes) break;

    const keySize = getKeySize(key);
    if (keySize > 0) {
      if (safeRemoveItem(key)) {
        freedBytes += keySize;
        console.debug(`[localStorage] STR-008: Cleaned up "${key}", freed ${keySize} bytes`);
      }
    }
  }

  return freedBytes;
}

/**
 * No-op Storage implementation used as a Zustand persist fallback in SSR and
 * non-browser environments (Tauri IPC tests, Vitest JSDOM without localStorage).
 *
 * Shared here so chatStore and toolStore don't each define an identical copy.
 */
export const storageFallback: Storage = {
  get length() {
    return 0;
  },
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};
