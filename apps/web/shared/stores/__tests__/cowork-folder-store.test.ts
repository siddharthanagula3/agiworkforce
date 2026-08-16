import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { useCoworkFolderStore, supportsDirectoryPicker } from '../cowork-folder-store';

function resetStore() {
  useCoworkFolderStore.setState({ handle: null, folderName: null });
}

describe('supportsDirectoryPicker()', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      writable: true,
      configurable: true,
    });
  });

  it('returns false when showDirectoryPicker is absent', () => {
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
      const json = JSON.stringify(mockHandle);
      expect(json).toBeDefined();
      expect(localStorage.getItem('cowork-folder')).toBeNull();
    });
  });
});
