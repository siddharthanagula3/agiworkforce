/**
 * MCP Extension Store
 *
 * Manages MCP desktop extensions: listing, installing, uninstalling,
 * enabling, and disabling .agiext extension packages.
 *
 * Follows Zustand v5 best practices consistent with mcpStore.ts / mcpbStore.ts:
 * - Middleware composition: devtools(subscribeWithSelector(...))
 * - TypeScript: Using create<State>()() pattern for type inference
 * - subscribeWithSelector for granular subscriptions
 *
 * Note: This store manages ephemeral extension state.  Extension lifecycle
 * events (install_progress, install_completed, etc.) are emitted by the Rust
 * backend and can be listened to via Tauri events.
 */
import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { McpClient } from '../api/mcp';
import { listen } from '../lib/tauri-mock';
import type { McpExtensionInfo } from '../types/mcp';

// ---------------------------------------------------------------------------
// Tauri event payload types
// ---------------------------------------------------------------------------

interface ExtensionInstallProgressEvent {
  phase: string;
  message: string;
  percentage: number;
}

interface ExtensionInstallCompletedEvent {
  extensionId: string;
  name: string;
  version: string;
  timestamp: number;
}

interface ExtensionInstallFailedEvent {
  filePath: string;
  error: string;
  timestamp: number;
}

export interface ExtensionInstallProgress {
  phase: string;
  message: string;
  percentage: number;
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface McpExtensionState {
  extensions: McpExtensionInfo[];
  selectedExtension: McpExtensionInfo | null;
  isLoading: boolean;
  isInstalling: boolean;
  installProgress: ExtensionInstallProgress | null;
  error: string | null;

  // Lifecycle actions
  fetchExtensions: () => Promise<void>;
  getExtension: (extensionId: string) => Promise<McpExtensionInfo | null>;
  installExtension: (filePath: string) => Promise<McpExtensionInfo | null>;
  selectAndInstall: () => Promise<McpExtensionInfo | null>;
  uninstallExtension: (extensionId: string) => Promise<void>;
  enableExtension: (extensionId: string) => Promise<void>;
  disableExtension: (extensionId: string) => Promise<void>;

  // UI state
  setSelectedExtension: (ext: McpExtensionInfo | null) => void;
  setInstallProgress: (progress: ExtensionInstallProgress | null) => void;
  clearError: () => void;
  resetOnLogout: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useMcpExtensionStore = create<McpExtensionState>()(
  devtools(
    subscribeWithSelector((set) => ({
      extensions: [],
      selectedExtension: null,
      isLoading: false,
      isInstalling: false,
      installProgress: null,
      error: null,

      fetchExtensions: async () => {
        set({ isLoading: true, error: null }, undefined, 'mcpExtension/fetchExtensions/start');
        try {
          const extensions = await McpClient.listExtensions();
          set({ extensions, isLoading: false }, undefined, 'mcpExtension/fetchExtensions/success');
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : 'Failed to list extensions',
              isLoading: false,
            },
            undefined,
            'mcpExtension/fetchExtensions/error',
          );
        }
      },

      getExtension: async (extensionId: string) => {
        set({ isLoading: true, error: null }, undefined, 'mcpExtension/getExtension/start');
        try {
          const ext = await McpClient.getExtension(extensionId);
          set(
            { selectedExtension: ext, isLoading: false },
            undefined,
            'mcpExtension/getExtension/success',
          );
          return ext;
        } catch (error) {
          set(
            {
              error:
                error instanceof Error ? error.message : `Failed to get extension ${extensionId}`,
              isLoading: false,
            },
            undefined,
            'mcpExtension/getExtension/error',
          );
          return null;
        }
      },

      installExtension: async (filePath: string) => {
        set(
          {
            isInstalling: true,
            error: null,
            installProgress: {
              phase: 'installing',
              message: 'Installing extension...',
              percentage: 10,
            },
          },
          undefined,
          'mcpExtension/installExtension/start',
        );
        try {
          const ext = await McpClient.installExtension(filePath);
          // Refresh extensions list after install
          const extensions = await McpClient.listExtensions();
          set(
            { extensions, isInstalling: false, installProgress: null },
            undefined,
            'mcpExtension/installExtension/success',
          );
          return ext;
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : 'Failed to install extension',
              isInstalling: false,
              installProgress: null,
            },
            undefined,
            'mcpExtension/installExtension/error',
          );
          return null;
        }
      },

      selectAndInstall: async () => {
        set(
          {
            isInstalling: true,
            error: null,
            installProgress: {
              phase: 'selecting',
              message: 'Select an extension package...',
              percentage: 0,
            },
          },
          undefined,
          'mcpExtension/selectAndInstall/start',
        );
        try {
          const filePath = await McpClient.selectExtensionPackage();
          if (!filePath) {
            set(
              { isInstalling: false, installProgress: null },
              undefined,
              'mcpExtension/selectAndInstall/cancelled',
            );
            return null;
          }

          set(
            {
              installProgress: {
                phase: 'installing',
                message: 'Installing extension...',
                percentage: 10,
              },
            },
            undefined,
            'mcpExtension/selectAndInstall/installing',
          );

          const ext = await McpClient.installExtension(filePath);
          const extensions = await McpClient.listExtensions();
          set(
            { extensions, isInstalling: false, installProgress: null },
            undefined,
            'mcpExtension/selectAndInstall/success',
          );
          return ext;
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : 'Failed to install extension',
              isInstalling: false,
              installProgress: null,
            },
            undefined,
            'mcpExtension/selectAndInstall/error',
          );
          return null;
        }
      },

      uninstallExtension: async (extensionId: string) => {
        set({ isLoading: true, error: null }, undefined, 'mcpExtension/uninstall/start');
        try {
          await McpClient.uninstallExtension(extensionId);
          const extensions = await McpClient.listExtensions();
          set({ extensions, isLoading: false }, undefined, 'mcpExtension/uninstall/success');
        } catch (error) {
          set(
            {
              error:
                error instanceof Error
                  ? error.message
                  : `Failed to uninstall extension ${extensionId}`,
              isLoading: false,
            },
            undefined,
            'mcpExtension/uninstall/error',
          );
        }
      },

      enableExtension: async (extensionId: string) => {
        set({ isLoading: true, error: null }, undefined, 'mcpExtension/enable/start');
        try {
          await McpClient.enableExtension(extensionId);
          const extensions = await McpClient.listExtensions();
          set({ extensions, isLoading: false }, undefined, 'mcpExtension/enable/success');
        } catch (error) {
          set(
            {
              error:
                error instanceof Error
                  ? error.message
                  : `Failed to enable extension ${extensionId}`,
              isLoading: false,
            },
            undefined,
            'mcpExtension/enable/error',
          );
        }
      },

      disableExtension: async (extensionId: string) => {
        set({ isLoading: true, error: null }, undefined, 'mcpExtension/disable/start');
        try {
          await McpClient.disableExtension(extensionId);
          const extensions = await McpClient.listExtensions();
          set({ extensions, isLoading: false }, undefined, 'mcpExtension/disable/success');
        } catch (error) {
          set(
            {
              error:
                error instanceof Error
                  ? error.message
                  : `Failed to disable extension ${extensionId}`,
              isLoading: false,
            },
            undefined,
            'mcpExtension/disable/error',
          );
        }
      },

      setSelectedExtension: (ext: McpExtensionInfo | null) => {
        set({ selectedExtension: ext }, undefined, 'mcpExtension/setSelectedExtension');
      },

      setInstallProgress: (progress: ExtensionInstallProgress | null) => {
        set({ installProgress: progress }, undefined, 'mcpExtension/setInstallProgress');
      },

      clearError: () => {
        set({ error: null }, undefined, 'mcpExtension/clearError');
      },

      resetOnLogout: () => {
        set(
          {
            extensions: [],
            selectedExtension: null,
            isLoading: false,
            isInstalling: false,
            installProgress: null,
            error: null,
          },
          undefined,
          'mcpExtension/resetOnLogout',
        );
      },
    })),
    { name: 'McpExtensionStore', enabled: import.meta.env.DEV },
  ),
);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectExtensions = (state: McpExtensionState) => state.extensions;
export const selectSelectedExtension = (state: McpExtensionState) => state.selectedExtension;
export const selectExtensionIsLoading = (state: McpExtensionState) => state.isLoading;
export const selectExtensionIsInstalling = (state: McpExtensionState) => state.isInstalling;
export const selectExtensionInstallProgress = (state: McpExtensionState) => state.installProgress;
export const selectExtensionError = (state: McpExtensionState) => state.error;

// Derived selectors
export const selectEnabledExtensions = (state: McpExtensionState) =>
  state.extensions.filter((ext) => ext.status === 'enabled' || ext.status === 'running');
export const selectDisabledExtensions = (state: McpExtensionState) =>
  state.extensions.filter((ext) => ext.status === 'disabled');
export const selectErrorExtensions = (state: McpExtensionState) =>
  state.extensions.filter((ext) => ext.status === 'error');
export const selectExtensionById = (id: string) => (state: McpExtensionState) =>
  state.extensions.find((ext) => ext.id === id);
export const selectExtensionCount = (state: McpExtensionState) => state.extensions.length;
export const selectTotalToolCount = (state: McpExtensionState) =>
  state.extensions.reduce((sum, ext) => sum + ext.toolCount, 0);

// ---------------------------------------------------------------------------
// Tauri event listener initialisation
// ---------------------------------------------------------------------------

let extensionListenerInitialized = false;

/**
 * Call once during app bootstrap to wire up extension lifecycle Tauri events.
 */
export async function initializeMcpExtensionListeners(): Promise<void> {
  if (extensionListenerInitialized) {
    return;
  }
  extensionListenerInitialized = true;

  try {
    await listen<ExtensionInstallProgressEvent>('extension:install_progress', (event) => {
      const { phase, message, percentage } = event.payload;
      console.debug('[extension:install_progress]', phase, percentage);
      useMcpExtensionStore.getState().setInstallProgress({ phase, message, percentage });
    });

    await listen<ExtensionInstallCompletedEvent>('extension:install_completed', () => {
      useMcpExtensionStore.getState().setInstallProgress(null);
      void useMcpExtensionStore.getState().fetchExtensions();
    });

    await listen<ExtensionInstallFailedEvent>('extension:install_failed', (event) => {
      const store = useMcpExtensionStore.getState();
      store.setInstallProgress(null);
      // The error is set via the store action that initiated the install,
      // but we log here for debugging.
      console.error('[extension:install_failed]', event.payload.error);
    });

    // Refresh list on uninstall/enable/disable events
    await listen<{ extensionId: string }>('extension:uninstalled', () => {
      void useMcpExtensionStore.getState().fetchExtensions();
    });

    await listen<{ extensionId: string }>('extension:enabled', () => {
      void useMcpExtensionStore.getState().fetchExtensions();
    });

    await listen<{ extensionId: string }>('extension:disabled', () => {
      void useMcpExtensionStore.getState().fetchExtensions();
    });
  } catch (error) {
    extensionListenerInitialized = false;
    console.error('[McpExtensionStore] Failed to initialize extension event listeners:', error);
  }
}
