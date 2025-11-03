import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-shell';
import type {
  CloudFile,
  CloudProvider,
  OAuthCredentials,
  PendingAuthorization,
  ShareLink,
} from '../types/cloud';

type Account = {
  accountId: string;
  provider: CloudProvider;
  label?: string | null;
};

interface CloudState {
  accounts: Account[];
  activeAccountId: string | null;
  files: CloudFile[];
  currentPath: string;
  loading: boolean;
  error: string | null;
  pendingAuth: PendingAuthorization | null;
  lastShareLink: ShareLink | null;

  refreshAccounts: () => Promise<void>;
  selectAccount: (accountId: string | null) => Promise<void>;
  listFiles: (path?: string, options?: { search?: string; includeFolders?: boolean }) => Promise<void>;
  beginConnect: (provider: CloudProvider, credentials: OAuthCredentials) => Promise<void>;
  completeConnect: (state: string, code: string) => Promise<void>;
  uploadFile: (localPath: string, remotePath: string) => Promise<void>;
  downloadFile: (remotePath: string, localPath: string) => Promise<void>;
  deleteEntry: (remotePath: string) => Promise<void>;
  createFolder: (remotePath: string) => Promise<string>;
  shareLink: (remotePath: string, allowEdit?: boolean) => Promise<ShareLink | null>;
  clearError: () => void;
}

type RawAccountResponse = {
  account_id: string;
  provider: CloudProvider;
  label?: string | null;
};

type RawFileResponse = CloudFile;

type RawAuthResponse = {
  auth_url: string;
  state: string;
};

type RawShareResponse = {
  url: string;
  expires_at?: string | null;
  scope?: string | null;
  allow_edit: boolean;
};

let listenersRegistered = false;

function mapAccount(raw: RawAccountResponse): Account {
  return {
    accountId: raw.account_id,
    provider: raw.provider,
    label: raw.label ?? null,
  };
}

export const useCloudStore = create<CloudState>((set, get) => {
  async function ensureListeners() {
    if (listenersRegistered) {
      return;
    }
    listenersRegistered = true;

    await listen<{ accountId: string }>('cloud:connected', async () => {
      await get().refreshAccounts();
    });

    await listen('cloud:file_uploaded', async (event) => {
      const payload = event.payload as { accountId?: string };
      if (payload?.accountId && payload.accountId === get().activeAccountId) {
        await get().listFiles(get().currentPath);
      }
    });

    await listen('cloud:file_deleted', async (event) => {
      const payload = event.payload as { accountId?: string };
      if (payload?.accountId && payload.accountId === get().activeAccountId) {
        await get().listFiles(get().currentPath);
      }
    });
  }

  return {
    accounts: [],
    activeAccountId: null,
    files: [],
    currentPath: '/',
    loading: false,
    error: null,
    pendingAuth: null,
    lastShareLink: null,

    refreshAccounts: async () => {
      await ensureListeners();

      try {
        const response = (await invoke<RawAccountResponse[]>('cloud_list_accounts')).map(mapAccount);
        set({ accounts: response });

        const { activeAccountId } = get();
        if (response.length > 0 && (!activeAccountId || !response.some((acc) => acc.accountId === activeAccountId))) {
          const firstAccount = response[0];
          if (firstAccount) {
            await get().selectAccount(firstAccount.accountId);
          }
        }
      } catch (error) {
        console.error('[cloud] failed to load accounts', error);
        set({ error: (error as Error).message });
      }
    },

    selectAccount: async (accountId) => {
      set({ activeAccountId: accountId, files: [], currentPath: '/' });
      if (accountId) {
        await get().listFiles('/');
      }
    },

    listFiles: async (path = '/', options) => {
      const { activeAccountId } = get();
      if (!activeAccountId) {
        return;
      }

      set({ loading: true, error: null });
      try {
        const files = await invoke<RawFileResponse[]>('cloud_list', {
          request: {
            accountId: activeAccountId,
            folderPath: path,
            search: options?.search,
            includeFolders: options?.includeFolders ?? true,
          },
        });
        set({ files, currentPath: path, loading: false });
      } catch (error) {
        console.error('[cloud] listing files failed', error);
        set({ error: (error as Error).message, loading: false });
      }
    },

    beginConnect: async (provider, credentials) => {
      set({ error: null, pendingAuth: null });

      try {
        const response = await invoke<RawAuthResponse>('cloud_connect', {
          config: {
            provider,
            clientId: credentials.clientId,
            clientSecret: credentials.clientSecret,
            redirectUri: credentials.redirectUri,
          },
        });

        const pending: PendingAuthorization = {
          provider,
          state: response.state,
          authUrl: response.auth_url,
        };

        set({ pendingAuth: pending });
        await open(response.auth_url);
      } catch (error) {
        console.error('[cloud] failed to initiate connection', error);
        set({ error: (error as Error).message });
      }
    },

    completeConnect: async (stateValue, code) => {
      const { pendingAuth } = get();
      if (!pendingAuth) {
        set({ error: 'No pending authorization. Start the connection process again.' });
        return;
      }

      try {
        await invoke('cloud_complete_oauth', {
          request: {
            state: stateValue,
            code,
          },
        });
        set({ pendingAuth: null });
        await get().refreshAccounts();
      } catch (error) {
        console.error('[cloud] failed to complete OAuth', error);
        set({ error: (error as Error).message });
      }
    },

    uploadFile: async (localPath, remotePath) => {
      const { activeAccountId } = get();
      if (!activeAccountId) {
        return;
      }

      set({ loading: true, error: null });
      try {
        await invoke<string>('cloud_upload', {
          request: {
            accountId: activeAccountId,
            localPath,
            remotePath,
          },
        });
        await get().listFiles(get().currentPath);
      } catch (error) {
        console.error('[cloud] upload failed', error);
        set({ error: (error as Error).message, loading: false });
      }
    },

    downloadFile: async (remotePath, localPath) => {
      const { activeAccountId } = get();
      if (!activeAccountId) {
        return;
      }

      set({ loading: true, error: null });
      try {
        await invoke('cloud_download', {
          request: {
            accountId: activeAccountId,
            remotePath,
            localPath,
          },
        });
        set({ loading: false });
      } catch (error) {
        console.error('[cloud] download failed', error);
        set({ error: (error as Error).message, loading: false });
      }
    },

    deleteEntry: async (remotePath) => {
      const { activeAccountId } = get();
      if (!activeAccountId) {
        return;
      }

      try {
        await invoke('cloud_delete', {
          request: {
            accountId: activeAccountId,
            remotePath,
          },
        });
        await get().listFiles(get().currentPath);
      } catch (error) {
        console.error('[cloud] delete failed', error);
        set({ error: (error as Error).message });
      }
    },

    createFolder: async (remotePath) => {
      const { activeAccountId } = get();
      if (!activeAccountId) {
        throw new Error('No active account selected');
      }

      try {
        const folderId = await invoke<string>('cloud_create_folder', {
          request: {
            accountId: activeAccountId,
            remotePath,
          },
        });
        await get().listFiles(get().currentPath);
        return folderId;
      } catch (error) {
        console.error('[cloud] create folder failed', error);
        set({ error: (error as Error).message });
        throw error;
      }
    },

    shareLink: async (remotePath, allowEdit = false) => {
      const { activeAccountId } = get();
      if (!activeAccountId) {
        return null;
      }

      try {
        const raw = await invoke<RawShareResponse>('cloud_share', {
          request: {
            accountId: activeAccountId,
            remotePath,
            allowEdit,
          },
        });
        const link: ShareLink = {
          url: raw.url,
          expires_at: raw.expires_at ?? null,
          scope: raw.scope ?? null,
          allow_edit: raw.allow_edit,
        };
        set({ lastShareLink: link });
        return link;
      } catch (error) {
        console.error('[cloud] share link failed', error);
        set({ error: (error as Error).message });
        return null;
      }
    },

    clearError: () => set({ error: null }),
  };
});
