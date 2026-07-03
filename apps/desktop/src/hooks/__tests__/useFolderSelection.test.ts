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
