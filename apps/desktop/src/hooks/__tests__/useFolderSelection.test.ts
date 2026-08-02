import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFolderSelection } from '../useFolderSelection';
import { useProjectStore } from '../../stores/projectStore';
import { useAppModeStore } from '../../stores/appModeStore';
import { useUnifiedAuthStore } from '../../stores/auth';

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
const toastErrorMock = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    info: (...args: unknown[]) => toastInfoMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

describe('useFolderSelection', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    openDialogMock.mockReset();
    toastInfoMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    useProjectStore.setState({ currentFolder: null, recentFolders: [] });
    useAppModeStore.setState({ mode: 'local' });
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
  const cloudGrant = {
    grantId: '11111111-1111-4111-8111-111111111111',
    path: '/Users/x/repo',
  };

  beforeEach(() => {
    invokeMock.mockReset();
    openDialogMock.mockReset();
    toastInfoMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    useProjectStore.getState().setCurrentFolder(null);
    useAppModeStore.setState({ mode: 'cloud' });
    useUnifiedAuthStore.setState({
      user: { id: 'cloud-user', email: 'cloud@agi.local', name: 'Cloud User' },
      isAuthenticated: true,
      isLocalDeviceAccount: false,
      accessToken: 'cloud-token-a',
      refreshToken: 'refresh-token-a',
      cloudSessionEpoch: 1,
    });
  });

  /**
   * The whole point of the cloud mode. `project_context_set_folder` persists the
   * path into settings.allowed_directories, writes settings.json, reloads MCP
   * config to project-local scope and repoints the MCP filesystem root. Calling
   * it from Managed Cloud would widen filesystem permissions with no consent
   * step and leave them in place after switching back to Local.
   */
  it('uses only the native picker-owned grant and never invokes the folder-scope command', async () => {
    invokeMock.mockResolvedValue(cloudGrant);

    const { result } = renderHook(() => useFolderSelection('cloud'));
    await act(async () => {
      await result.current.selectFolder();
    });

    expect(invokeMock).toHaveBeenCalledWith('select_cloud_handoff_folder');
    expect(invokeMock).not.toHaveBeenCalledWith('project_context_set_folder', expect.anything());
    expect(openDialogMock).not.toHaveBeenCalled();
  });

  it('records the display path and returns the opaque native grant', async () => {
    invokeMock.mockResolvedValue(cloudGrant);

    const { result } = renderHook(() => useFolderSelection('cloud'));
    let picked: Awaited<ReturnType<typeof result.current.selectFolder>> = null;
    await act(async () => {
      picked = await result.current.selectFolder();
    });

    expect(picked).toEqual({ path: '/Users/x/repo', cloudGrantId: cloudGrant.grantId });
    await waitFor(() => {
      expect(useProjectStore.getState().currentFolder).toBe('/Users/x/repo');
    });
  });

  it('tells the user files stay on the device until approved', async () => {
    invokeMock.mockResolvedValue(cloudGrant);

    const { result } = renderHook(() => useFolderSelection('cloud'));
    await act(async () => {
      await result.current.selectFolder();
    });

    expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringContaining('stay on this device until you approve them'),
    );
  });

  it('revokes and suppresses a grant when the same account changes auth incarnation', async () => {
    let resolvePicker!: (grant: typeof cloudGrant) => void;
    const picker = new Promise<typeof cloudGrant>((resolve) => {
      resolvePicker = resolve;
    });
    invokeMock.mockImplementation((command: string) => {
      if (command === 'select_cloud_handoff_folder') return picker;
      if (command === 'revoke_cloud_handoff_grant') return Promise.resolve(true);
      return Promise.resolve(undefined);
    });
    const { result } = renderHook(() => useFolderSelection('cloud'));
    let selection!: Promise<Awaited<ReturnType<typeof result.current.selectFolder>>>;
    act(() => {
      selection = result.current.selectFolder();
    });
    act(() => {
      useUnifiedAuthStore.setState({
        user: { id: 'cloud-user', email: 'cloud@agi.local', name: 'Cloud User' },
        isAuthenticated: true,
        isLocalDeviceAccount: false,
        accessToken: 'cloud-token-b',
        refreshToken: 'refresh-token-b',
        cloudSessionEpoch: 2,
      });
    });
    resolvePicker(cloudGrant);

    await expect(selection).resolves.toBeNull();
    expect(invokeMock).toHaveBeenCalledWith('revoke_cloud_handoff_grant', {
      grantId: cloudGrant.grantId,
    });
    expect(useProjectStore.getState().currentFolder).toBeNull();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it('clears without revoking a capability it never granted', async () => {
    invokeMock.mockResolvedValue(cloudGrant);
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
    useAppModeStore.setState({ mode: 'local' });
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
