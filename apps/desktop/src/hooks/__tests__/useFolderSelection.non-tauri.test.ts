import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { open } from '@tauri-apps/plugin-dialog';
import { useFolderSelection } from '../useFolderSelection';
import { useProjectStore } from '../../stores/projectStore';

// Deliberately relies on the GLOBAL test/setup.ts mock of '../../lib/tauri-mock'
// (isTauri: false) to prove the graceful non-desktop fallback — e.g. what a
// Playwright run against the browser-mode dev server (no real Tauri) sees when
// it clicks "Select folder" in the live composer.
const toastInfoMock = vi.fn();
vi.mock('sonner', () => ({
  toast: { info: (...args: unknown[]) => toastInfoMock(...args), success: vi.fn() },
}));

describe('useFolderSelection (isTauri: false)', () => {
  beforeEach(() => {
    toastInfoMock.mockReset();
    vi.mocked(open).mockReset();
    useProjectStore.setState({ currentFolder: null, recentFolders: [] });
  });

  it('shows a fallback toast and never opens the native dialog', async () => {
    const { result } = renderHook(() => useFolderSelection());

    await act(async () => {
      await result.current.selectFolder();
    });

    expect(toastInfoMock).toHaveBeenCalledWith('Folder selection requires the desktop app');
    expect(open).not.toHaveBeenCalled();
    expect(useProjectStore.getState().currentFolder).toBeNull();
  });
});
