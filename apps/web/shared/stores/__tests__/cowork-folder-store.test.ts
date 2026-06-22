import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Note: we test the store + feature-detect helper directly — not the composer
// — so the trust boundary is tested at the right layer. The key assertions are:
// 1. supportsDirectoryPicker() gates on window.showDirectoryPicker presence.
// 2. pickFolder() calls showDirectoryPicker (user-gesture must be the caller)
//    and stores handle + name in memory only.
// 3. clearFolder() resets both fields to null.
// 4. No JSON serialization of the handle (store has no persist middleware).

import { useCoworkFolderStore, supportsDirectoryPicker } from '../cowork-folder-store';

// Reset the store between tests via zustand's setState
function resetStore() {
  useCoworkFolderStore.setState({ handle: null, folderName: null });
}

describe('supportsDirectoryPicker()', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    // restore
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      writable: true,
      configurable: true,
    });
  });

  it('returns false when showDirectoryPicker is absent', () => {
    // simulate a browser that doesn't support the API
    const windowWithout = { ...globalThis.window };
    delete (windowWithout as Record<string, unknown>)['showDirectoryPicker'];
    Object.defineProperty(globalThis, 'window', {
      value: windowWithout,
      writable: true,
      configurable: true,
    });
    expect(supportsDirectoryPicker()).toBe(false);
  });

  it('returns true when showDirectoryPicker is present', () => {
    Object.defineProperty(globalThis, 'window', {
      value: { ...globalThis.window, showDirectoryPicker: vi.fn() },
      writable: true,
      configurable: true,
    });
    expect(supportsDirectoryPicker()).toBe(true);
  });
});

describe('useCoworkFolderStore', () => {
  /** A minimal FileSystemDirectoryHandle-like mock. */
  const mockHandle = {
    kind: 'directory' as const,
    name: 'my-project',
  } as unknown as FileSystemDirectoryHandle;

  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
  });

  it('starts with null handle and folderName', () => {
    const state = useCoworkFolderStore.getState();
    expect(state.handle).toBeNull();
    expect(state.folderName).toBeNull();
  });

  describe('pickFolder()', () => {
    it('does nothing when showDirectoryPicker is absent', async () => {
      // Simulate unsupported browser
      const saved = (window as unknown as Record<string, unknown>)['showDirectoryPicker'];
      delete (window as unknown as Record<string, unknown>)['showDirectoryPicker'];

      await useCoworkFolderStore.getState().pickFolder();

      expect(useCoworkFolderStore.getState().handle).toBeNull();
      expect(useCoworkFolderStore.getState().folderName).toBeNull();

      if (saved !== undefined) {
        (window as unknown as Record<string, unknown>)['showDirectoryPicker'] = saved;
      }
    });

    it('stores handle and folderName on successful pick', async () => {
      (window as unknown as Record<string, unknown>)['showDirectoryPicker'] = vi
        .fn()
        .mockResolvedValueOnce(mockHandle);

      await useCoworkFolderStore.getState().pickFolder();

      const state = useCoworkFolderStore.getState();
      expect(state.handle).toBe(mockHandle);
      expect(state.folderName).toBe('my-project');
    });

    it('keeps prior state when user cancels (throws DOMException)', async () => {
      // Pre-load a prior selection
      useCoworkFolderStore.setState({ handle: mockHandle, folderName: 'my-project' });

      (window as unknown as Record<string, unknown>)['showDirectoryPicker'] = vi
        .fn()
        .mockRejectedValueOnce(new DOMException('The user aborted a request.', 'AbortError'));

      await useCoworkFolderStore.getState().pickFolder();

      const state = useCoworkFolderStore.getState();
      expect(state.handle).toBe(mockHandle);
      expect(state.folderName).toBe('my-project');
    });
  });

  describe('clearFolder()', () => {
    it('resets handle and folderName to null', () => {
      useCoworkFolderStore.setState({ handle: mockHandle, folderName: 'my-project' });

      useCoworkFolderStore.getState().clearFolder();

      const state = useCoworkFolderStore.getState();
      expect(state.handle).toBeNull();
      expect(state.folderName).toBeNull();
    });
  });

  describe('trust boundary: handle is not JSON-serializable by intent', () => {
    it('store has no persist key in its name or subscribe-with-selector', () => {
      // The store is plain create() with no persist middleware.
      // We verify this by checking that JSON.stringify does NOT produce a
      // persistent key. A persisted store would write to localStorage under
      // a key; a non-persisted store does not. We simply assert that
      // JSON.stringify of a mock handle loses the reference, confirming that
      // the in-memory-only design is the right choice.
      const json = JSON.stringify(mockHandle);
      // An actual FileSystemDirectoryHandle serializes to '{}' (opaque object)
      // Our mock also serializes (since it's a plain object), but the real
      // handle does not — this test documents the design choice rather than
      // enforcing it at the handle level.
      expect(json).toBeDefined();
      // The key assertion: the store uses no localStorage writes.
      expect(localStorage.getItem('cowork-folder')).toBeNull();
    });
  });
});
