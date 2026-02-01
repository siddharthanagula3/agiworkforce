import { useCallback, useEffect, useMemo } from 'react';
import { useCloudStore } from '../stores/cloudStore';
import type { CloudFile, CloudProvider, OAuthCredentials, ShareLink } from '../types/cloud';

/**
 * Cloud storage account information
 */
export interface CloudAccount {
  accountId: string;
  provider: CloudProvider;
  label?: string | null;
}

/**
 * Cloud storage quota information
 */
export interface CloudQuota {
  used: number;
  total: number;
  percentUsed: number;
}

/**
 * Options for listing files
 */
export interface ListFilesOptions {
  search?: string;
  includeFolders?: boolean;
}

/**
 * Hook return type for cloud storage operations
 */
export interface UseCloudStorageReturn {
  // State
  accounts: CloudAccount[];
  activeAccount: CloudAccount | null;
  files: CloudFile[];
  currentPath: string;
  loading: boolean;
  error: string | null;
  lastShareLink: ShareLink | null;
  isConnecting: boolean;

  // Account operations
  listProviders: () => CloudProvider[];
  refreshAccounts: () => Promise<void>;
  selectAccount: (accountId: string | null) => Promise<void>;
  connect: (provider: CloudProvider, credentials: OAuthCredentials) => Promise<void>;
  disconnect: (accountId: string) => Promise<void>;

  // File operations
  listFiles: (path?: string, options?: ListFilesOptions) => Promise<void>;
  uploadFile: (localPath: string, remotePath: string) => Promise<void>;
  downloadFile: (remotePath: string, localPath: string) => Promise<void>;
  deleteFile: (remotePath: string) => Promise<void>;
  createFolder: (remotePath: string) => Promise<string>;
  shareFile: (remotePath: string, allowEdit?: boolean) => Promise<ShareLink | null>;

  // Navigation helpers
  navigateTo: (path: string) => Promise<void>;
  navigateUp: () => Promise<void>;
  refresh: () => Promise<void>;

  // Error handling
  clearError: () => void;
}

/**
 * Supported cloud providers
 */
const SUPPORTED_PROVIDERS: CloudProvider[] = ['google_drive', 'dropbox', 'one_drive'];

/**
 * Hook for managing cloud storage operations.
 *
 * Provides a simplified interface for:
 * - Listing and managing cloud storage accounts
 * - Browsing files and folders
 * - Uploading, downloading, and deleting files
 * - Creating folders and sharing files
 *
 * @example
 * ```tsx
 * function CloudBrowser() {
 *   const {
 *     accounts,
 *     activeAccount,
 *     files,
 *     loading,
 *     listFiles,
 *     uploadFile,
 *   } = useCloudStorage();
 *
 *   useEffect(() => {
 *     if (activeAccount) {
 *       listFiles('/');
 *     }
 *   }, [activeAccount, listFiles]);
 *
 *   return (
 *     <div>
 *       {files.map(file => (
 *         <div key={file.id}>{file.name}</div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useCloudStorage(): UseCloudStorageReturn {
  const store = useCloudStore();

  // Map store accounts to our format
  const accounts = useMemo<CloudAccount[]>(() => {
    return store.accounts.map((acc) => ({
      accountId: acc.accountId,
      provider: acc.provider,
      label: acc.label,
    }));
  }, [store.accounts]);

  // Get active account
  const activeAccount = useMemo<CloudAccount | null>(() => {
    if (!store.activeAccountId) return null;
    return accounts.find((acc) => acc.accountId === store.activeAccountId) || null;
  }, [accounts, store.activeAccountId]);

  // Check if connecting (has pending auth)
  const isConnecting = useMemo(() => {
    return store.pendingAuth !== null;
  }, [store.pendingAuth]);

  // List supported providers
  const listProviders = useCallback((): CloudProvider[] => {
    return SUPPORTED_PROVIDERS;
  }, []);

  // Refresh accounts
  const refreshAccounts = useCallback(async (): Promise<void> => {
    await store.refreshAccounts();
  }, [store]);

  // Select account
  const selectAccount = useCallback(
    async (accountId: string | null): Promise<void> => {
      await store.selectAccount(accountId);
    },
    [store],
  );

  // Connect to provider
  const connect = useCallback(
    async (provider: CloudProvider, credentials: OAuthCredentials): Promise<void> => {
      await store.beginConnect(provider, credentials);
    },
    [store],
  );

  // Disconnect account
  const disconnect = useCallback(
    async (accountId: string): Promise<void> => {
      // First deselect if this is the active account
      if (store.activeAccountId === accountId) {
        await store.selectAccount(null);
      }
      // The cloudStore doesn't expose disconnect directly through Zustand,
      // but the backend command exists. For now, refresh accounts after
      // the user completes disconnection flow.
      await store.refreshAccounts();
    },
    [store],
  );

  // List files
  const listFiles = useCallback(
    async (path = '/', options?: ListFilesOptions): Promise<void> => {
      await store.listFiles(path, options);
    },
    [store],
  );

  // Upload file
  const uploadFile = useCallback(
    async (localPath: string, remotePath: string): Promise<void> => {
      await store.uploadFile(localPath, remotePath);
    },
    [store],
  );

  // Download file
  const downloadFile = useCallback(
    async (remotePath: string, localPath: string): Promise<void> => {
      await store.downloadFile(remotePath, localPath);
    },
    [store],
  );

  // Delete file
  const deleteFile = useCallback(
    async (remotePath: string): Promise<void> => {
      await store.deleteEntry(remotePath);
    },
    [store],
  );

  // Create folder
  const createFolder = useCallback(
    async (remotePath: string): Promise<string> => {
      return await store.createFolder(remotePath);
    },
    [store],
  );

  // Share file
  const shareFile = useCallback(
    async (remotePath: string, allowEdit = false): Promise<ShareLink | null> => {
      return await store.shareLink(remotePath, allowEdit);
    },
    [store],
  );

  // Navigate to path
  const navigateTo = useCallback(
    async (path: string): Promise<void> => {
      await store.listFiles(path);
    },
    [store],
  );

  // Navigate up one level
  const navigateUp = useCallback(async (): Promise<void> => {
    const currentPath = store.currentPath;
    if (currentPath === '/' || currentPath === '') {
      return;
    }

    const segments = currentPath.split('/').filter(Boolean);
    segments.pop();
    const parentPath = segments.length === 0 ? '/' : `/${segments.join('/')}`;
    await store.listFiles(parentPath);
  }, [store]);

  // Refresh current directory
  const refresh = useCallback(async (): Promise<void> => {
    await store.refreshAccounts();
    if (store.activeAccountId) {
      await store.listFiles(store.currentPath);
    }
  }, [store]);

  // Clear error
  const clearError = useCallback((): void => {
    store.clearError();
  }, [store]);

  // Auto-refresh accounts on mount
  useEffect(() => {
    void refreshAccounts();
  }, [refreshAccounts]);

  return {
    // State
    accounts,
    activeAccount,
    files: store.files,
    currentPath: store.currentPath,
    loading: store.loading,
    error: store.error,
    lastShareLink: store.lastShareLink,
    isConnecting,

    // Account operations
    listProviders,
    refreshAccounts,
    selectAccount,
    connect,
    disconnect,

    // File operations
    listFiles,
    uploadFile,
    downloadFile,
    deleteFile,
    createFolder,
    shareFile,

    // Navigation helpers
    navigateTo,
    navigateUp,
    refresh,

    // Error handling
    clearError,
  };
}

export default useCloudStorage;
