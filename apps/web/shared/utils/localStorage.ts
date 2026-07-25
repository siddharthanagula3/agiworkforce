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

/**
 * Write a JSON value to localStorage.
 *
 * STB-26: this returned `void` and swallowed every failure, so a
 * `QuotaExceededError` (or a Safari private-mode write rejection) was
 * indistinguishable from a successful save. It now reports whether the write
 * actually landed; callers that persist user data MUST check the result.
 *
 * @returns `true` when the value was written, `false` when it was not (no
 *   `window`, quota exceeded, storage disabled, serialization failure).
 */
export function setItem<T>(key: string, value: T): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`Error setting localStorage key "${key}":`, error);
    return false;
  }
}

export function removeItem(key: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(key);
}

export function safeGetJSON<T>(key: string, defaultValue: T): T {
  return getItem(key, defaultValue);
}
/** @returns `true` only when the write actually landed. See {@link setItem}. */
export function safeSetJSON<T>(key: string, value: T): boolean {
  return setItem(key, value);
}
export const storageFallback = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
