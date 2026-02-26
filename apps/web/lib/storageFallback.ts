/**
 * Storage Fallback
 *
 * A no-op Storage implementation for SSR / non-browser environments
 * (e.g. Vitest running in Node, server-side rendering).
 *
 * Shared across all Zustand persist stores that need:
 *   createJSONStorage(() => (typeof window === 'undefined' ? storageFallback : window.localStorage))
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
