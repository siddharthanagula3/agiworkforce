class MemoryStorage {
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
    return new MemoryStorage() as unknown as Storage;
  }

  if (isLocalStorageAvailable()) {
    return localStorage;
  }

  console.warn('[localStorage] localStorage is unavailable, using in-memory fallback');
  return new MemoryStorage() as unknown as Storage;
}

let storageInstance: Storage | null = null;

function getStorageInstance(): Storage {
  if (!storageInstance) {
    storageInstance = getStorage();
  }
  return storageInstance;
}

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
        // ignore
      }
    }
  } catch (error) {
    console.error('[localStorage] Failed to cleanup old data:', error);
  }
}

export function getStorageType(): 'localStorage' | 'memory' {
  const storage = getStorageInstance();
  return storage instanceof MemoryStorage ? 'memory' : 'localStorage';
}

export function isStorageAvailable(): boolean {
  return isLocalStorageAvailable();
}

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
