import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFolderSelection } from '../useFolderSelection';
import { useProjectStore } from '../../stores/projectStore';
import { useAppModeStore } from '../../stores/appModeStore';
import { useUnifiedAuthStore } from '../../stores/auth';

const invokeMock = vi.fn();
const openDialogMock = vi.fn();

/** The host picks `picked` in its own dialog, then answers the folder command. */
function hostPicks(picked: string | null, setFolder?: () => Promise<unknown>) {
  invokeMock.mockImplementation((command: string) => {
    if (command === 'pick_folder') return Promise.resolve(picked);
    if (command === 'project_context_set_folder' && setFolder) return setFolder();
    return Promise.reject(new Error(`Unexpected command: ${command}`));
  });
}

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
const toastWarningMock = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    info: (...args: unknown[]) => toastInfoMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
    warning: (...args: unknown[]) => toastWarningMock(...args),
  },
}));

function projectContext(folder: string) {
  return { folder, name: folder.split('/').pop() ?? null, isValid: true };
}

describe('useFolderSelection', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    openDialogMock.mockReset();
    toastInfoMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    toastWarningMock.mockReset();
    useProjectStore.setState({ currentFolder: null, recentFolders: [] });
    useAppModeStore.setState({ mode: 'local' });
  });

  it('asks the host to pick the folder and syncs it to the backend + store', async () => {
    hostPicks('/Users/siddhartha/Projects/agiworkforce', () =>
      Promise.resolve(projectContext('/Users/siddhartha/Projects/agiworkforce')),
    );

    const { result } = renderHook(() => useFolderSelection());

    await act(async () => {
      await result.current.selectFolder();
    });

    expect(openDialogMock).not.toHaveBeenCalled();
    expect(invokeMock).toHaveBeenNthCalledWith(1, 'pick_folder', { purpose: 'project_folder' });
    expect(invokeMock).toHaveBeenCalledWith('project_context_set_folder', {
      path: '/Users/siddhartha/Projects/agiworkforce',
    });

    await waitFor(() => {
      expect(useProjectStore.getState().currentFolder).toBe(
        '/Users/siddhartha/Projects/agiworkforce',
      );
    });
    expect(toastSuccessMock).toHaveBeenCalled();
    expect(toastWarningMock).not.toHaveBeenCalled();
  });

  it('keeps the folder the backend resolved and warns when it differs from the pick', async () => {
    hostPicks('/tmp/project', () => Promise.resolve(projectContext('/private/tmp/project')));

    const { result } = renderHook(() => useFolderSelection());
    let picked: Awaited<ReturnType<typeof result.current.selectFolder>> = null;
    await act(async () => {
      picked = await result.current.selectFolder();
    });

    expect(picked).toEqual({ path: '/private/tmp/project', cloudGrantId: null });
    expect(useProjectStore.getState().currentFolder).toBe('/private/tmp/project');
    expect(toastSuccessMock).toHaveBeenCalledWith(expect.stringContaining('/private/tmp/project'));
    expect(toastWarningMock).toHaveBeenCalledWith(
      expect.stringContaining('/tmp/project goes through a link'),
    );
  });

  it('tells the user why a picked folder was refused and keeps the previous one', async () => {
    useProjectStore.setState({ currentFolder: '/Users/me/project' });
    hostPicks('/Users/me/project', () =>
      Promise.reject('a writable folder changed since it was opened: /Users/me/project'),
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useFolderSelection());
    let picked: Awaited<ReturnType<typeof result.current.selectFolder>> = null;
    await act(async () => {
      picked = await result.current.selectFolder();
    });

    expect(picked).toBeNull();
    expect(useProjectStore.getState().currentFolder).toBe('/Users/me/project');
    expect(toastErrorMock).toHaveBeenCalledWith(
      'a writable folder changed since it was opened: /Users/me/project',
    );
    expect(toastSuccessMock).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('does nothing when the user cancels the dialog', async () => {
    hostPicks(null);

    const { result } = renderHook(() => useFolderSelection());

    await act(async () => {
      await result.current.selectFolder();
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('pick_folder', { purpose: 'project_folder' });
    expect(useProjectStore.getState().currentFolder).toBeNull();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it('shows the reason and sets nothing when the host cannot open its picker', async () => {
    invokeMock.mockRejectedValue('The folder picker could not be opened.');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useFolderSelection());
    await act(async () => {
      await result.current.selectFolder();
    });

    expect(invokeMock).not.toHaveBeenCalledWith('project_context_set_folder', expect.anything());
    expect(toastErrorMock).toHaveBeenCalledWith('The folder picker could not be opened.');
    expect(useProjectStore.getState().currentFolder).toBeNull();
    consoleError.mockRestore();
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

describe('useFolderSelection, cloud mode grants no capability', () => {
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
    toastWarningMock.mockReset();
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
    hostPicks('/Users/x/repo', () => Promise.resolve(projectContext('/Users/x/repo')));

    const { result } = renderHook(() => useFolderSelection('local'));
    await act(async () => {
      await result.current.selectFolder();
    });

    expect(invokeMock).toHaveBeenCalledWith('project_context_set_folder', {
      path: '/Users/x/repo',
    });
  });
});
