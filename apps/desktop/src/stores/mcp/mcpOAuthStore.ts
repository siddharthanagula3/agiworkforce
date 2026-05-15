import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { isTauri } from '../../lib/tauri-mock';
import { McpClient } from '../../api/mcp';
import type {
  McpExtensionInfo,
  McpExtensionPackageInfo,
  McpOAuthConnectionStatus,
  McpOAuthProvider,
  McpOAuthProviderConfig,
  McpOAuthStartResponse,
  McpOAuthTokenResponse,
} from '../../types/mcp';

export interface McpOAuthState {
  extensions: McpExtensionInfo[];
  error: string | null;
  activeOperations: number;
  isLoading: boolean;

  oauthStart: (provider: McpOAuthProvider) => Promise<McpOAuthStartResponse>;
  oauthCallback: (
    provider: McpOAuthProvider,
    code: string,
    callbackState: string,
  ) => Promise<McpOAuthTokenResponse>;
  oauthStatus: (provider: McpOAuthProvider) => Promise<McpOAuthConnectionStatus>;
  oauthDisconnect: (provider: McpOAuthProvider) => Promise<void>;
  oauthRefresh: (provider: McpOAuthProvider) => Promise<McpOAuthTokenResponse>;
  oauthSetCredentials: (
    provider: McpOAuthProvider,
    clientId: string,
    clientSecret: string,
  ) => Promise<void>;
  oauthGetAllStatuses: () => Promise<Record<McpOAuthProvider, McpOAuthConnectionStatus>>;
  oauthNeedsRefresh: (provider: McpOAuthProvider) => Promise<boolean>;
  getOAuthProviders: () => McpOAuthProviderConfig[];
  refreshExtensions: () => Promise<void>;
  installExtension: (filePath: string) => Promise<McpExtensionInfo>;
  uninstallExtension: (extensionId: string) => Promise<void>;
  enableExtension: (extensionId: string) => Promise<void>;
  disableExtension: (extensionId: string) => Promise<void>;
  validateExtensionPackage: (filePath: string) => Promise<McpExtensionPackageInfo>;
  startAllExtensions: () => Promise<void>;
  stopAllExtensions: () => Promise<void>;
  getExtension: (extensionId: string) => Promise<McpExtensionInfo>;
  selectExtensionPackage: () => Promise<string | null>;
  listExtensionsByStatus: (status: string) => Promise<McpExtensionInfo[]>;
  getExtensionsDirectory: () => Promise<string>;
  getExtensionConfig: (extensionId: string) => Promise<Record<string, unknown>>;
  setExtensionConfig: (extensionId: string, config: Record<string, unknown>) => Promise<void>;
  clearError: () => void;
}

export const useMcpOAuthStore = create<McpOAuthState>()(
  devtools(
    subscribeWithSelector((set, get) => {
      function startOp(): void {
        const s = get();
        const next = (s.activeOperations ?? 0) + 1;
        set({ activeOperations: next, isLoading: true });
      }
      function endOp(): void {
        const s = get();
        const next = Math.max(0, (s.activeOperations ?? 1) - 1);
        set({ activeOperations: next, isLoading: next > 0 });
      }

      return {
        extensions: [],
        error: null,
        activeOperations: 0,
        isLoading: false,

        oauthStart: async (provider: McpOAuthProvider) => {
          if (!isTauri) throw new Error('OAuth not available outside Tauri');
          try {
            return await McpClient.oauthStart(provider);
          } catch (error) {
            set(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : `Failed to start OAuth for '${provider}'`,
              },
              undefined,
              'mcpOAuth/oauthStart/error',
            );
            throw error;
          }
        },

        oauthCallback: async (provider: McpOAuthProvider, code: string, callbackState: string) => {
          if (!isTauri) throw new Error('OAuth not available outside Tauri');
          try {
            return await McpClient.oauthCallback(provider, code, callbackState);
          } catch (error) {
            set(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : `Failed to complete OAuth for '${provider}'`,
              },
              undefined,
              'mcpOAuth/oauthCallback/error',
            );
            throw error;
          }
        },

        oauthStatus: async (provider: McpOAuthProvider) => {
          if (!isTauri) return { connected: false, userInfo: null, expiresAt: null };
          try {
            return await McpClient.oauthStatus(provider);
          } catch (error) {
            console.warn('[mcpOAuthStore] Failed to check OAuth status:', error);
            return { connected: false, userInfo: null, expiresAt: null };
          }
        },

        oauthDisconnect: async (provider: McpOAuthProvider) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcpOAuth/oauthDisconnect/start');
          try {
            await McpClient.oauthDisconnect(provider);
            endOp();
          } catch (error) {
            endOp();
            set(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : `Failed to disconnect OAuth for '${provider}'`,
              },
              undefined,
              'mcpOAuth/oauthDisconnect/error',
            );
          }
        },

        oauthRefresh: async (provider: McpOAuthProvider) => {
          if (!isTauri) throw new Error('OAuth not available outside Tauri');
          try {
            return await McpClient.oauthRefresh(provider);
          } catch (error) {
            set(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : `Failed to refresh OAuth for '${provider}'`,
              },
              undefined,
              'mcpOAuth/oauthRefresh/error',
            );
            throw error;
          }
        },

        oauthSetCredentials: async (
          provider: McpOAuthProvider,
          clientId: string,
          clientSecret: string,
        ) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcpOAuth/oauthSetCredentials/start');
          try {
            await McpClient.oauthSetCredentials(provider, clientId, clientSecret);
            endOp();
          } catch (error) {
            endOp();
            set(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : `Failed to set OAuth credentials for '${provider}'`,
              },
              undefined,
              'mcpOAuth/oauthSetCredentials/error',
            );
          }
        },

        oauthGetAllStatuses: async () => {
          if (!isTauri) throw new Error('OAuth not available outside Tauri');
          try {
            const statuses = await McpClient.oauthGetAllStatuses();
            set({ error: null }, undefined, 'mcpOAuth/oauthGetAllStatuses');
            return statuses;
          } catch (error) {
            set(
              {
                error: error instanceof Error ? error.message : 'Failed to get all OAuth statuses',
              },
              undefined,
              'mcpOAuth/oauthGetAllStatuses/error',
            );
            throw error;
          }
        },

        oauthNeedsRefresh: async (provider: McpOAuthProvider) => {
          if (!isTauri) return false;
          try {
            return await McpClient.oauthNeedsRefresh(provider);
          } catch (error) {
            console.warn('[mcpOAuthStore] oauthNeedsRefresh failed:', error);
            return false;
          }
        },

        getOAuthProviders: () => {
          return McpClient.getOAuthProviders();
        },

        refreshExtensions: async () => {
          if (!isTauri) return;
          try {
            const extensions = await McpClient.listExtensions();
            set({ extensions, error: null }, undefined, 'mcpOAuth/refreshExtensions');
          } catch (error) {
            set(
              { error: error instanceof Error ? error.message : 'Failed to list extensions' },
              undefined,
              'mcpOAuth/refreshExtensions/error',
            );
          }
        },

        installExtension: async (filePath: string) => {
          if (!isTauri) throw new Error('Extensions not available outside Tauri');
          startOp();
          set({ error: null }, undefined, 'mcpOAuth/installExtension/start');
          try {
            const info = await McpClient.installExtension(filePath);
            await get().refreshExtensions();
            endOp();
            return info;
          } catch (error) {
            endOp();
            set(
              { error: error instanceof Error ? error.message : 'Failed to install extension' },
              undefined,
              'mcpOAuth/installExtension/error',
            );
            throw error;
          }
        },

        uninstallExtension: async (extensionId: string) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcpOAuth/uninstallExtension/start');
          try {
            await McpClient.uninstallExtension(extensionId);
            await get().refreshExtensions();
            endOp();
          } catch (error) {
            endOp();
            set(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : `Failed to uninstall extension '${extensionId}'`,
              },
              undefined,
              'mcpOAuth/uninstallExtension/error',
            );
          }
        },

        enableExtension: async (extensionId: string) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcpOAuth/enableExtension/start');
          try {
            await McpClient.enableExtension(extensionId);
            await get().refreshExtensions();
            endOp();
          } catch (error) {
            endOp();
            set(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : `Failed to enable extension '${extensionId}'`,
              },
              undefined,
              'mcpOAuth/enableExtension/error',
            );
          }
        },

        disableExtension: async (extensionId: string) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcpOAuth/disableExtension/start');
          try {
            await McpClient.disableExtension(extensionId);
            await get().refreshExtensions();
            endOp();
          } catch (error) {
            endOp();
            set(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : `Failed to disable extension '${extensionId}'`,
              },
              undefined,
              'mcpOAuth/disableExtension/error',
            );
          }
        },

        validateExtensionPackage: async (filePath: string) => {
          if (!isTauri) throw new Error('Extensions not available outside Tauri');
          try {
            return await McpClient.validateExtensionPackage(filePath);
          } catch (error) {
            set(
              { error: error instanceof Error ? error.message : 'Failed to validate extension' },
              undefined,
              'mcpOAuth/validateExtensionPackage/error',
            );
            throw error;
          }
        },

        startAllExtensions: async () => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcpOAuth/startAllExtensions/start');
          try {
            await McpClient.startAllExtensions();
            await get().refreshExtensions();
            endOp();
          } catch (error) {
            endOp();
            set(
              { error: error instanceof Error ? error.message : 'Failed to start all extensions' },
              undefined,
              'mcpOAuth/startAllExtensions/error',
            );
          }
        },

        stopAllExtensions: async () => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcpOAuth/stopAllExtensions/start');
          try {
            await McpClient.stopAllExtensions();
            await get().refreshExtensions();
            endOp();
          } catch (error) {
            endOp();
            set(
              { error: error instanceof Error ? error.message : 'Failed to stop all extensions' },
              undefined,
              'mcpOAuth/stopAllExtensions/error',
            );
          }
        },

        getExtension: async (extensionId: string) => {
          if (!isTauri) throw new Error('Extensions not available outside Tauri');
          try {
            const extension = await McpClient.getExtension(extensionId);
            set({ error: null }, undefined, 'mcpOAuth/getExtension');
            return extension;
          } catch (error) {
            set(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : `Failed to get extension '${extensionId}'`,
              },
              undefined,
              'mcpOAuth/getExtension/error',
            );
            throw error;
          }
        },

        selectExtensionPackage: async () => {
          if (!isTauri) return null;
          try {
            return await McpClient.selectExtensionPackage();
          } catch (error) {
            set(
              {
                error:
                  error instanceof Error ? error.message : 'Failed to open extension file picker',
              },
              undefined,
              'mcpOAuth/selectExtensionPackage/error',
            );
            return null;
          }
        },

        listExtensionsByStatus: async (status: string) => {
          if (!isTauri) return [];
          try {
            return await McpClient.listExtensionsByStatus(status);
          } catch (error) {
            set(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : `Failed to list extensions by status '${status}'`,
              },
              undefined,
              'mcpOAuth/listExtensionsByStatus/error',
            );
            return [];
          }
        },

        getExtensionsDirectory: async () => {
          if (!isTauri) throw new Error('Extensions not available outside Tauri');
          try {
            return await McpClient.getExtensionsDirectory();
          } catch (error) {
            set(
              {
                error:
                  error instanceof Error ? error.message : 'Failed to get extensions directory',
              },
              undefined,
              'mcpOAuth/getExtensionsDirectory/error',
            );
            throw error;
          }
        },

        getExtensionConfig: async (extensionId: string) => {
          if (!isTauri) throw new Error('Extensions not available outside Tauri');
          try {
            return await McpClient.getExtensionConfig(extensionId);
          } catch (error) {
            set(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : `Failed to get config for extension '${extensionId}'`,
              },
              undefined,
              'mcpOAuth/getExtensionConfig/error',
            );
            throw error;
          }
        },

        setExtensionConfig: async (extensionId: string, config: Record<string, unknown>) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcpOAuth/setExtensionConfig/start');
          try {
            await McpClient.setExtensionConfig(extensionId, config);
            await get().refreshExtensions();
            endOp();
          } catch (error) {
            endOp();
            set(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : `Failed to set config for extension '${extensionId}'`,
              },
              undefined,
              'mcpOAuth/setExtensionConfig/error',
            );
          }
        },

        clearError: () => {
          set({ error: null }, undefined, 'mcpOAuth/clearError');
        },
      };
    }),
    { name: 'McpOAuthStore', enabled: import.meta.env.DEV },
  ),
);

export const selectMcpExtensions = (state: McpOAuthState) => state.extensions;
export const selectMcpOAuthIsLoading = (state: McpOAuthState) => state.isLoading;
export const selectMcpOAuthError = (state: McpOAuthState) => state.error;
