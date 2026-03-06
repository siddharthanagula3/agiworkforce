/**
 * LocalStorage wrapper for web to polyfill desktop behavior and provide safe parsing
 */

export function getItem<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const item = window.localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.warn(`Error reading localStorage key "${key}":`, error);
    return defaultValue;
  }
}

export function setItem<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Error setting localStorage key "${key}":`, error);
  }
}

export function removeItem(key: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(key);
}

export function safeGetJSON<T>(key: string, defaultValue: T): T {
  return getItem(key, defaultValue);
}
export function safeSetJSON<T>(key: string, value: T): boolean {
  setItem(key, value);
  return true;
}
export const storageFallback = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
