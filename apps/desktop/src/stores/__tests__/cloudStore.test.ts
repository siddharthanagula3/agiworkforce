import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());

vi.mock('../../lib/tauri-mock', () => ({
  invoke,
  listen: vi.fn(async () => () => undefined),
  openUrl: vi.fn(),
}));

import { useCloudStore } from '../cloudStore';

const DRIVE = { accountId: 'drive-1', provider: 'google_drive' as const, label: 'Work Drive' };
const DROPBOX = { accountId: 'dropbox-1', provider: 'dropbox' as const, label: 'Dropbox' };

function connected(accountIds: string[]) {
  invoke.mockImplementation(async (command: string) => {
    if (command === 'cloud_list_accounts') {
      return [DRIVE, DROPBOX]
        .filter((account) => accountIds.includes(account.accountId))
        .map((account) => ({
          account_id: account.accountId,
          provider: account.provider,
          label: account.label,
        }));
    }
    if (command === 'cloud_list') return [];
    return undefined;
  });
}

describe('cloudStore', () => {
  beforeEach(() => {
    invoke.mockReset();
    useCloudStore.setState({
      accounts: [],
      activeAccountId: null,
      files: [],
      currentPath: '/',
      loading: false,
      error: null,
      pendingAuth: null,
    });
  });

  it('initializes with sensible defaults', () => {
    const state = useCloudStore.getState();

    expect(state.accounts).toEqual([]);
    expect(state.activeAccountId).toBeNull();
    expect(state.currentPath).toBe('/');
    expect(state.pendingAuth).toBeNull();
    expect(state.loading).toBe(false);
  });

  it('disconnects the open account, forgets its files and opens the one that is left', async () => {
    connected(['dropbox-1']);
    useCloudStore.setState({
      accounts: [DRIVE, DROPBOX],
      activeAccountId: 'drive-1',
      files: [{ id: 'f1', name: 'plan.md' } as never],
      currentPath: '/docs',
    });

    await useCloudStore.getState().disconnectAccount('drive-1');

    expect(invoke).toHaveBeenCalledWith('cloud_disconnect', { accountId: 'drive-1' });
    const state = useCloudStore.getState();
    expect(state.accounts.map((account) => account.accountId)).toEqual(['dropbox-1']);
    expect(state.activeAccountId).toBe('dropbox-1');
    expect(state.files).toEqual([]);
    expect(state.currentPath).toBe('/');
    expect(state.error).toBeNull();
  });

  it('sends every struct argument under the camelCase keys the native commands read', async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === 'cloud_connect') {
        return { auth_url: 'https://accounts.example/authorize', state: 's-1' };
      }
      if (command === 'cloud_list') return [];
      if (command === 'cloud_share') {
        return { url: 'https://share.example/1', expires_at: null, scope: null, allow_edit: true };
      }
      return undefined;
    });
    useCloudStore.setState({ accounts: [DRIVE], activeAccountId: 'drive-1' });
    const store = useCloudStore.getState();

    await store.beginConnect('google_drive', {
      clientId: 'client-1',
      clientSecret: 'secret-1',
      redirectUri: 'http://localhost:1420/callback',
    });
    await store.listFiles('/docs', { search: 'plan' });
    await store.uploadFile('/tmp/plan.md', '/docs/plan.md');
    await store.downloadFile('/docs/plan.md', '/tmp/plan.md');
    await store.deleteEntry('/docs/old.md');
    await store.createFolder('/docs/new');
    const link = await store.shareLink('/docs/plan.md', true);

    expect(invoke).toHaveBeenCalledWith('cloud_connect', {
      config: {
        provider: 'google_drive',
        clientId: 'client-1',
        clientSecret: 'secret-1',
        redirectUri: 'http://localhost:1420/callback',
      },
    });
    expect(invoke).toHaveBeenCalledWith('cloud_list', {
      request: { accountId: 'drive-1', folderPath: '/docs', search: 'plan', includeFolders: true },
    });
    expect(invoke).toHaveBeenCalledWith('cloud_upload', {
      request: { accountId: 'drive-1', localPath: '/tmp/plan.md', remotePath: '/docs/plan.md' },
    });
    expect(invoke).toHaveBeenCalledWith('cloud_download', {
      request: { accountId: 'drive-1', remotePath: '/docs/plan.md', localPath: '/tmp/plan.md' },
    });
    expect(invoke).toHaveBeenCalledWith('cloud_delete', {
      request: { accountId: 'drive-1', remotePath: '/docs/old.md' },
    });
    expect(invoke).toHaveBeenCalledWith('cloud_create_folder', {
      request: { accountId: 'drive-1', remotePath: '/docs/new' },
    });
    expect(invoke).toHaveBeenCalledWith('cloud_share', {
      request: { accountId: 'drive-1', remotePath: '/docs/plan.md', allowEdit: true },
    });
    expect(useCloudStore.getState().pendingAuth?.authUrl).toBe(
      'https://accounts.example/authorize',
    );
    expect(link?.allow_edit).toBe(true);
  });

  it('keeps the account and says why when the disconnect is refused', async () => {
    invoke.mockRejectedValue(new Error('That cloud account is not connected'));
    useCloudStore.setState({ accounts: [DRIVE], activeAccountId: 'drive-1' });

    await useCloudStore.getState().disconnectAccount('drive-1');

    const state = useCloudStore.getState();
    expect(state.accounts).toEqual([DRIVE]);
    expect(state.activeAccountId).toBe('drive-1');
    expect(state.error).toBe('That cloud account is not connected');
  });
});
