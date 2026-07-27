import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFolderSelection } from '../useFolderSelection';
import { useProjectStore } from '../../stores/projectStore';

// Mirrors the module-mock pattern in features/chat/FolderSelector.test.tsx —
// override the global test/setup.ts mock (which pins isTauri: false) so the
// native-dialog branch of `selectFolder` is actually exercised.
const invokeMock = vi.fn();
const openDialogMock = vi.fn();

vi.mock('../../lib/tauri-mock', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  isTauri: true,
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => openDialogMock(...args),
}));

const toastInfoMock = vi.fn();
const toastSuccessMock = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    info: (...args: unknown[]) => toastInfoMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

describe('useFolderSelection', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    openDialogMock.mockReset();
    toastInfoMock.mockReset();
    toastSuccessMock.mockReset();
    useProjectStore.setState({ currentFolder: null, recentFolders: [] });
  });

  it('opens the native dialog and syncs the selected path to the backend + store', async () => {
    openDialogMock.mockResolvedValue('/Users/siddhartha/Projects/agiworkforce');
    invokeMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useFolderSelection());

    await act(async () => {
      await result.current.selectFolder();
    });

    expect(openDialogMock).toHaveBeenCalledWith(
      expect.objectContaining({ directory: true, multiple: false }),
    );
    // The core ask: the flow reaches the real backend command.
    expect(invokeMock).toHaveBeenCalledWith('project_context_set_folder', {
      path: '/Users/siddhartha/Projects/agiworkforce',
    });

    await waitFor(() => {
      expect(useProjectStore.getState().currentFolder).toBe(
        '/Users/siddhartha/Projects/agiworkforce',
      );
    });
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it('does nothing when the user cancels the dialog', async () => {
    openDialogMock.mockResolvedValue(null);

    const { result } = renderHook(() => useFolderSelection());

    await act(async () => {
      await result.current.selectFolder();
    });

    expect(invokeMock).not.toHaveBeenCalled();
    expect(useProjectStore.getState().currentFolder).toBeNull();
  });

  it('reflects the currently scoped folder as a formatted label', () => {
    useProjectStore.setState({
      currentFolder: '/Users/siddhartha/Projects/agiworkforce',
      recentFolders: [],
    });

    const { result } = renderHook(() => useFolderSelection());

    expect(result.current.currentFolderLabel).toBe('~/Projects/agiworkforce');
  });
});

describe('useFolderSelection — cloud mode grants no capability', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    openDialogMock.mockReset();
    toastInfoMock.mockReset();
    toastSuccessMock.mockReset();
    useProjectStore.getState().setCurrentFolder(null);
  });

  /**
   * The whole point of the cloud mode. `project_context_set_folder` persists the
   * path into settings.allowed_directories, writes settings.json, reloads MCP
   * config to project-local scope and repoints the MCP filesystem root. Calling
   * it from Managed Cloud would widen filesystem permissions with no consent
   * step and leave them in place after switching back to Local.
   */
  it('never invokes the backend folder-scope command', async () => {
    openDialogMock.mockResolvedValue('/Users/x/repo');

    const { result } = renderHook(() => useFolderSelection('cloud'));
    await act(async () => {
      await result.current.selectFolder();
    });

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('still records the folder for display and returns the picked path', async () => {
    openDialogMock.mockResolvedValue('/Users/x/repo');

    const { result } = renderHook(() => useFolderSelection('cloud'));
    let picked: string | null = null;
    await act(async () => {
      picked = await result.current.selectFolder();
    });

    expect(picked).toBe('/Users/x/repo');
    await waitFor(() => {
      expect(useProjectStore.getState().currentFolder).toBe('/Users/x/repo');
    });
  });

  it('tells the user files stay on the device until approved', async () => {
    openDialogMock.mockResolvedValue('/Users/x/repo');

    const { result } = renderHook(() => useFolderSelection('cloud'));
    await act(async () => {
      await result.current.selectFolder();
    });

    expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringContaining('stay on this device until you approve them'),
    );
  });

  it('clears without revoking a capability it never granted', async () => {
    openDialogMock.mockResolvedValue('/Users/x/repo');
    const { result } = renderHook(() => useFolderSelection('cloud'));
    await act(async () => {
      await result.current.selectFolder();
    });
    invokeMock.mockReset();

    act(() => {
      result.current.clearFolder();
    });

    expect(invokeMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(useProjectStore.getState().currentFolder).toBeNull();
    });
  });

  it('local mode still grants the working scope', async () => {
    openDialogMock.mockResolvedValue('/Users/x/repo');
    invokeMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useFolderSelection('local'));
    await act(async () => {
      await result.current.selectFolder();
    });

    expect(invokeMock).toHaveBeenCalledWith('project_context_set_folder', {
      path: '/Users/x/repo',
    });
  });
});
