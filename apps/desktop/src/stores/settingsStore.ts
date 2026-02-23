/**
 * Settings Store
 *
 * Manages application settings including LLM configuration, window preferences,
 * chat preferences, and allowed directories.
 *
 * Updated to Zustand v5 best practices:
 * - Middleware composition: devtools(persist(subscribeWithSelector(...)))
 * - TypeScript: Using create<State>()() pattern for type inference
 * - Persist middleware: Using createJSONStorage, partialize, version, migrate
 * - Better devtools integration with store name
 * - subscribeWithSelector for granular subscriptions
 */
import { invoke, isTauriContext } from '../lib/tauri-mock';
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';

import type { Provider } from '../types/provider';
export type { Provider };
export type Theme = 'light' | 'dark' | 'system';
export type Language = 'en' | 'es';

export type TaskCategory = 'search' | 'code' | 'docs' | 'chat' | 'vision' | 'image' | 'video';

export interface TaskRouting {
  search: { provider: Provider; model: string };
  code: { provider: Provider; model: string };
  docs: { provider: Provider; model: string };
  chat: { provider: Provider; model: string };
  vision: { provider: Provider; model: string };
  image: { provider: Provider; model: string };
  video: { provider: Provider; model: string };
}

interface LLMConfig {
  defaultProvider: Provider;
  temperature: number;
  maxTokens: number;
  defaultModels: {
    ollama: string;
    managed_cloud: string;
  };
  taskRouting: TaskRouting;
  favoriteModels: string[];
}

interface WindowPreferences {
  theme: Theme;
  language: Language;
  startupPosition: 'center' | 'remember';
  dockOnStartup: 'left' | 'right' | null;
}

export interface ChatPreferences {
  /** Enable AI-powered prompt completion (ghost text suggestions) */
  promptCompletionEnabled: boolean;
  /** Always use agent mode with tools for all messages (not just action requests) */
  alwaysUseAgentMode: boolean;
  /** Show simple one-line status messages instead of detailed command/code blocks */
  compactMode: boolean;
  /**
   * Auto-approve all tool confirmation dialogs — skips every "Allow this action?" popup.
   * Equivalent to God Mode / trust-all. Use with caution.
   */
  autoApproveTools: boolean;
}

export interface ExecutionPreferences {
  /** Maximum task timeout in minutes (1-4320, default 1440=24hrs) */
  maxTimeoutMinutes: number;
  /** Enable automatic checkpointing of task progress */
  enableCheckpointing: boolean;
  /** Interval between checkpoints in steps (default 5) */
  checkpointInterval: number;
  /** Enable task resumption after app restart */
  autoResumeOnRestart: boolean;
  /** Show timeout warnings at 1hr, 30min, 5min remaining */
  enableTimeoutWarnings: boolean;
}

interface SettingsState {
  llmConfig: LLMConfig;
  windowPreferences: WindowPreferences;
  chatPreferences: ChatPreferences;
  executionPreferences: ExecutionPreferences;
  allowedDirectories: string[];
  loading: boolean;
  error: string | null;

  setDefaultProvider: (provider: Provider) => Promise<void>;
  setTemperature: (temperature: number) => void;
  setMaxTokens: (maxTokens: number) => void;
  setDefaultModel: (provider: Provider, model: string) => void;
  setTaskRouting: (category: TaskCategory, provider: Provider, model: string) => void;
  setFavoriteModels: (models: string[]) => void;
  addFavoriteModel: (model: string) => void;
  removeFavoriteModel: (model: string) => void;

  setTheme: (theme: Theme) => void;
  setLanguage: (language: Language) => void;
  setStartupPosition: (position: 'center' | 'remember') => void;
  setDockOnStartup: (dock: 'left' | 'right' | null) => void;

  setPromptCompletionEnabled: (enabled: boolean) => void;
  setAlwaysUseAgentMode: (enabled: boolean) => void;
  setCompactMode: (enabled: boolean) => void;
  setAutoApproveTools: (enabled: boolean) => void;

  setMaxTimeoutMinutes: (minutes: number) => void;
  setEnableCheckpointing: (enabled: boolean) => void;
  setCheckpointInterval: (interval: number) => void;
  setAutoResumeOnRestart: (enabled: boolean) => void;
  setEnableTimeoutWarnings: (enabled: boolean) => void;

  addAllowedDirectory: (path: string) => void;
  removeAllowedDirectory: (path: string) => void;
  setAllowedDirectories: (paths: string[]) => void;

  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;

  // Hydration tracking for persist middleware
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}

const defaultSettings: Pick<
  SettingsState,
  | 'llmConfig'
  | 'windowPreferences'
  | 'chatPreferences'
  | 'executionPreferences'
  | 'allowedDirectories'
> = {
  llmConfig: {
    defaultProvider: 'managed_cloud',
    temperature: 0.7,
    maxTokens: 4096,
    defaultModels: {
      ollama: '',
      managed_cloud: 'auto',
    },
    favoriteModels: [],
    taskRouting: {
      search: { provider: 'managed_cloud', model: 'auto' },
      code: { provider: 'managed_cloud', model: 'auto' },
      docs: { provider: 'managed_cloud', model: 'auto' },
      chat: { provider: 'managed_cloud', model: 'auto' },
      vision: { provider: 'managed_cloud', model: 'auto' },
      image: { provider: 'managed_cloud', model: 'auto' },
      video: { provider: 'managed_cloud', model: 'auto' },
    },
  },
  windowPreferences: {
    theme: 'system',
    language: 'en',
    startupPosition: 'center',
    dockOnStartup: null,
  },
  chatPreferences: {
    promptCompletionEnabled: true, // AI-powered ghost text enabled by default
    alwaysUseAgentMode: false, // Off by default - only use agent mode for action requests
    compactMode: true, // Show simple status messages like ChatGPT/Claude/Gemini
    autoApproveTools: false, // Off by default - show confirmation dialogs
  },
  executionPreferences: {
    maxTimeoutMinutes: 1440, // 24 hours default
    enableCheckpointing: true,
    checkpointInterval: 5, // Steps between checkpoints
    autoResumeOnRestart: true,
    enableTimeoutWarnings: true,
  },
  allowedDirectories: [],
};

export const createDefaultLLMConfig = (): LLMConfig => ({
  ...defaultSettings.llmConfig,
  defaultModels: { ...defaultSettings.llmConfig.defaultModels },
  taskRouting: { ...defaultSettings.llmConfig.taskRouting },
  favoriteModels: [],
});

export const createDefaultWindowPreferences = (): WindowPreferences => ({
  ...defaultSettings.windowPreferences,
});

const storageFallback: Storage = {
  get length() {
    return 0;
  },
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

// Version for storage migration
// v2: Simplified for subscription-only model - removed hardcoded providers, only managed_cloud + ollama
// v3: Added alwaysUseAgentMode setting
// v4: Added executionPreferences for extended timeout support
// v5: Added compactMode for simple status messages (like ChatGPT/Claude/Gemini)
// v6: Added language preference
const SETTINGS_STORE_VERSION = 8;

export const useSettingsStore = create<SettingsState>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        ...defaultSettings,
        loading: false,
        error: null,
        _hasHydrated: false,

        setHasHydrated: (state: boolean) => {
          set({ _hasHydrated: state }, undefined, 'settings/setHasHydrated');
        },

        setMaxTimeoutMinutes: (minutes: number) => {
          const clamped = Math.max(1, Math.min(4320, minutes)); // 1 min to 72 hours
          set(
            (state) => ({
              executionPreferences: { ...state.executionPreferences, maxTimeoutMinutes: clamped },
            }),
            undefined,
            'settings/setMaxTimeoutMinutes',
          );
        },

        setEnableCheckpointing: (enabled: boolean) => {
          set(
            (state) => ({
              executionPreferences: { ...state.executionPreferences, enableCheckpointing: enabled },
            }),
            undefined,
            'settings/setEnableCheckpointing',
          );
        },

        setCheckpointInterval: (interval: number) => {
          const clamped = Math.max(1, Math.min(100, interval));
          set(
            (state) => ({
              executionPreferences: { ...state.executionPreferences, checkpointInterval: clamped },
            }),
            undefined,
            'settings/setCheckpointInterval',
          );
        },

        setAutoResumeOnRestart: (enabled: boolean) => {
          set(
            (state) => ({
              executionPreferences: { ...state.executionPreferences, autoResumeOnRestart: enabled },
            }),
            undefined,
            'settings/setAutoResumeOnRestart',
          );
        },

        setEnableTimeoutWarnings: (enabled: boolean) => {
          set(
            (state) => ({
              executionPreferences: {
                ...state.executionPreferences,
                enableTimeoutWarnings: enabled,
              },
            }),
            undefined,
            'settings/setEnableTimeoutWarnings',
          );
        },

        setDefaultProvider: async (provider: Provider) => {
          try {
            await invoke('llm_set_default_provider', { provider });
            set(
              (state) => ({
                llmConfig: { ...state.llmConfig, defaultProvider: provider },
              }),
              undefined,
              'settings/setDefaultProvider',
            );
          } catch (error) {
            console.error('Failed to set default provider:', error);
            set({ error: String(error) }, undefined, 'settings/setDefaultProvider/error');
            throw error;
          }
        },

        setTemperature: (temperature: number) => {
          set(
            (state) => ({
              llmConfig: { ...state.llmConfig, temperature },
            }),
            undefined,
            'settings/setTemperature',
          );
        },

        setMaxTokens: (maxTokens: number) => {
          set(
            (state) => ({
              llmConfig: { ...state.llmConfig, maxTokens },
            }),
            undefined,
            'settings/setMaxTokens',
          );
        },

        setDefaultModel: (provider: Provider, model: string) => {
          set(
            (state) => ({
              llmConfig: {
                ...state.llmConfig,
                defaultModels: { ...state.llmConfig.defaultModels, [provider]: model },
              },
            }),
            undefined,
            'settings/setDefaultModel',
          );
        },

        setTaskRouting: (category: TaskCategory, provider: Provider, model: string) => {
          set(
            (state) => ({
              llmConfig: {
                ...state.llmConfig,
                taskRouting: {
                  ...state.llmConfig.taskRouting,
                  [category]: { provider, model },
                },
              },
            }),
            undefined,
            'settings/setTaskRouting',
          );
        },

        setFavoriteModels: (models: string[]) => {
          set(
            (state) => ({
              llmConfig: { ...state.llmConfig, favoriteModels: models },
            }),
            undefined,
            'settings/setFavoriteModels',
          );
        },

        addFavoriteModel: (model: string) => {
          set(
            (state) => {
              const favoriteModels = [...state.llmConfig.favoriteModels];
              if (!favoriteModels.includes(model)) {
                favoriteModels.push(model);
              }
              return {
                llmConfig: { ...state.llmConfig, favoriteModels },
              };
            },
            undefined,
            'settings/addFavoriteModel',
          );
        },

        removeFavoriteModel: (model: string) => {
          set(
            (state) => {
              const favoriteModels = state.llmConfig.favoriteModels.filter((m) => m !== model);
              return {
                llmConfig: { ...state.llmConfig, favoriteModels },
              };
            },
            undefined,
            'settings/removeFavoriteModel',
          );
        },

        setTheme: (theme: Theme) => {
          set(
            (state) => ({
              windowPreferences: { ...state.windowPreferences, theme },
            }),
            undefined,
            'settings/setTheme',
          );

          if (typeof window !== 'undefined' && typeof document !== 'undefined') {
            if (
              theme === 'dark' ||
              (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
            ) {
              document.documentElement.classList.add('dark');
            } else {
              document.documentElement.classList.remove('dark');
            }
          }
        },

        setLanguage: (language: Language) => {
          set(
            (state) => ({
              windowPreferences: { ...state.windowPreferences, language },
            }),
            undefined,
            'settings/setLanguage',
          );
        },

        setStartupPosition: (position: 'center' | 'remember') => {
          set(
            (state) => ({
              windowPreferences: { ...state.windowPreferences, startupPosition: position },
            }),
            undefined,
            'settings/setStartupPosition',
          );
        },

        setDockOnStartup: (dock: 'left' | 'right' | null) => {
          set(
            (state) => ({
              windowPreferences: { ...state.windowPreferences, dockOnStartup: dock },
            }),
            undefined,
            'settings/setDockOnStartup',
          );
        },

        setPromptCompletionEnabled: (enabled: boolean) => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, promptCompletionEnabled: enabled },
            }),
            undefined,
            'settings/setPromptCompletionEnabled',
          );
        },

        setAlwaysUseAgentMode: (enabled: boolean) => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, alwaysUseAgentMode: enabled },
            }),
            undefined,
            'settings/setAlwaysUseAgentMode',
          );
        },

        setCompactMode: (enabled: boolean) => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, compactMode: enabled },
            }),
            undefined,
            'settings/setCompactMode',
          );
        },

        setAutoApproveTools: (enabled: boolean) => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, autoApproveTools: enabled },
            }),
            undefined,
            'settings/setAutoApproveTools',
          );
        },

        addAllowedDirectory: (path: string) => {
          set(
            (state) => {
              if (state.allowedDirectories.includes(path)) return {};
              return { allowedDirectories: [...state.allowedDirectories, path] };
            },
            undefined,
            'settings/addAllowedDirectory',
          );
        },

        removeAllowedDirectory: (path: string) => {
          set(
            (state) => ({
              allowedDirectories: state.allowedDirectories.filter((p) => p !== path),
            }),
            undefined,
            'settings/removeAllowedDirectory',
          );
        },

        setAllowedDirectories: (paths: string[]) => {
          set({ allowedDirectories: paths }, undefined, 'settings/setAllowedDirectories');
        },

        loadSettings: async () => {
          set({ loading: true, error: null }, undefined, 'settings/loadSettings/start');

          try {
            // Web development mode: Tauri commands are unavailable.
            // Use persisted localStorage state + in-memory defaults and skip disk/native calls.
            if (!isTauriContext()) {
              set({ loading: false, error: null }, undefined, 'settings/loadSettings/webMode');
              get().setTheme(get().windowPreferences.theme);
              return;
            }

            // Try to load settings from disk first, falling back to in-memory defaults
            let settings: {
              llmConfig: LLMConfig;
              windowPreferences: WindowPreferences;
              chatPreferences?: ChatPreferences;
              executionPreferences?: ExecutionPreferences;
              allowedDirectories: string[];
            };

            try {
              settings = await invoke<{
                llmConfig: LLMConfig;
                windowPreferences: WindowPreferences;
                chatPreferences?: ChatPreferences;
                executionPreferences?: ExecutionPreferences;
                allowedDirectories: string[];
              }>('settings_load_from_disk');
            } catch (diskError) {
              console.warn(
                '[settingsStore] Failed to load from disk, using in-memory defaults:',
                diskError,
              );
              settings = await invoke<{
                llmConfig: LLMConfig;
                windowPreferences: WindowPreferences;
                chatPreferences?: ChatPreferences;
                executionPreferences?: ExecutionPreferences;
                allowedDirectories: string[];
              }>('settings_load');
            }

            if (get().loading === false) {
              console.debug('[settingsStore] Load cancelled - another operation started');
              return;
            }

            const mergedLLMConfig: LLMConfig = {
              ...defaultSettings.llmConfig,
              ...(settings.llmConfig ?? defaultSettings.llmConfig),
              defaultModels: {
                ...defaultSettings.llmConfig.defaultModels,
                // Only merge managed_cloud and ollama from persisted settings
                managed_cloud:
                  settings.llmConfig?.defaultModels?.managed_cloud ??
                  defaultSettings.llmConfig.defaultModels.managed_cloud,
                ollama:
                  settings.llmConfig?.defaultModels?.ollama ??
                  defaultSettings.llmConfig.defaultModels.ollama,
              },
              taskRouting: {
                ...defaultSettings.llmConfig.taskRouting,
                ...(settings.llmConfig?.taskRouting ?? defaultSettings.llmConfig.taskRouting),
              },
              // SET-005 fix: Preserve persisted favoriteModels instead of resetting to []
              favoriteModels: Array.isArray(settings.llmConfig?.favoriteModels)
                ? settings.llmConfig.favoriteModels
                : [],
            };

            const mergedWindowPreferences: WindowPreferences = {
              ...defaultSettings.windowPreferences,
              ...(settings.windowPreferences ?? defaultSettings.windowPreferences),
              language:
                settings.windowPreferences?.language ?? defaultSettings.windowPreferences.language,
            };

            const mergedChatPreferences: ChatPreferences = {
              ...defaultSettings.chatPreferences,
              ...(settings.chatPreferences ?? defaultSettings.chatPreferences),
            };

            const mergedExecutionPreferences: ExecutionPreferences = {
              ...defaultSettings.executionPreferences,
              ...(settings.executionPreferences ?? defaultSettings.executionPreferences),
            };

            // Configure local Ollama provider
            try {
              await invoke('llm_configure_provider', {
                provider: 'ollama',
                apiKey: null,
                baseUrl: 'http://localhost:11434',
              });
            } catch (error) {
              console.error('Failed to configure Ollama provider:', error);
            }

            if (get().loading === false) {
              console.debug('[settingsStore] Load cancelled before final update');
              return;
            }

            set(
              {
                llmConfig: mergedLLMConfig,
                windowPreferences: mergedWindowPreferences,
                chatPreferences: mergedChatPreferences,
                executionPreferences: mergedExecutionPreferences,
                allowedDirectories: settings.allowedDirectories ?? [],
                loading: false,
              },
              undefined,
              'settings/loadSettings/success',
            );

            get().setTheme(mergedWindowPreferences.theme);

            try {
              await invoke('llm_set_default_provider', {
                provider: mergedLLMConfig.defaultProvider,
              });
            } catch (error) {
              console.error('Failed to restore default provider:', error);
            }

            // Sync autoApproveTools to backend on load
            try {
              await invoke('set_auto_approve_all', {
                enabled: mergedChatPreferences.autoApproveTools ?? false,
              });
            } catch (error) {
              console.error('Failed to sync auto-approve-all to backend:', error);
            }

            // FIX-003: Sync allowed directories to the backend security guard
            // This ensures file operations respect user-configured allowed directories
            try {
              const dirs = settings.allowedDirectories ?? [];
              if (dirs.length > 0) {
                await invoke('update_allowed_directories', { paths: dirs });
                console.log('[settingsStore] Synced allowed directories to backend:', dirs.length);

                // Also update MCP filesystem server to use the allowed directories
                await invoke('mcp_update_filesystem_directories', { directories: dirs });
                console.log(
                  '[settingsStore] Updated MCP filesystem with allowed directories:',
                  dirs.length,
                );
              }
            } catch (error) {
              console.error('Failed to sync allowed directories to backend:', error);
            }
          } catch (error) {
            console.error('Failed to load settings:', error);

            if (get().loading) {
              set(
                { error: String(error), loading: false },
                undefined,
                'settings/loadSettings/error',
              );
            }
          }
        },

        saveSettings: async () => {
          set({ loading: true, error: null }, undefined, 'settings/saveSettings/start');
          try {
            const {
              llmConfig,
              windowPreferences,
              chatPreferences,
              executionPreferences,
              allowedDirectories,
            } = get();
            await invoke('settings_save', {
              settings: {
                llmConfig,
                windowPreferences,
                chatPreferences,
                executionPreferences,
                allowedDirectories,
              },
            });

            // FIX-003: Sync allowed directories to the backend security guard
            // This ensures file operations respect user-configured allowed directories
            try {
              if (allowedDirectories.length > 0) {
                await invoke('update_allowed_directories', { paths: allowedDirectories });

                // Also update MCP filesystem server to use the allowed directories
                await invoke('mcp_update_filesystem_directories', {
                  directories: allowedDirectories,
                });
                console.log(
                  '[settingsStore] Updated MCP filesystem with allowed directories:',
                  allowedDirectories.length,
                );
              }
            } catch (error) {
              console.error('Failed to sync allowed directories to backend:', error);
            }

            // Sync autoApproveTools flag to the backend confirmation state
            try {
              await invoke('set_auto_approve_all', { enabled: chatPreferences.autoApproveTools });
            } catch (error) {
              console.error('Failed to sync auto-approve-all to backend:', error);
            }

            set({ loading: false }, undefined, 'settings/saveSettings/success');
          } catch (error) {
            console.error('Failed to save settings:', error);
            set({ error: String(error), loading: false }, undefined, 'settings/saveSettings/error');
            throw error;
          }
        },
      })),
      {
        name: 'agiworkforce-settings',
        version: SETTINGS_STORE_VERSION,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          llmConfig: state.llmConfig,
          windowPreferences: {
            theme: state.windowPreferences.theme,
            language: state.windowPreferences.language,
            startupPosition: state.windowPreferences.startupPosition,
            dockOnStartup: state.windowPreferences.dockOnStartup,
          },
          chatPreferences: state.chatPreferences,
          executionPreferences: state.executionPreferences,
          allowedDirectories: state.allowedDirectories,
        }),
        merge: (persistedState, currentState) => {
          const persisted = persistedState as Partial<SettingsState> | undefined;

          const persistedDefaultModels = persisted?.llmConfig?.defaultModels as
            | { managed_cloud?: string; ollama?: string }
            | undefined;

          const mergedLLMConfig: LLMConfig = {
            ...currentState.llmConfig,
            ...(persisted?.llmConfig ?? {}),
            defaultProvider: 'managed_cloud', // Always use managed_cloud
            defaultModels: {
              managed_cloud:
                persistedDefaultModels?.managed_cloud ??
                currentState.llmConfig.defaultModels.managed_cloud,
              ollama: persistedDefaultModels?.ollama ?? currentState.llmConfig.defaultModels.ollama,
            },
            taskRouting: {
              ...currentState.llmConfig.taskRouting,
              ...(persisted?.llmConfig?.taskRouting ?? {}),
            },
            // SET-005 fix: Preserve user's favoriteModels instead of resetting
            favoriteModels: Array.isArray(persisted?.llmConfig?.favoriteModels)
              ? persisted.llmConfig.favoriteModels
              : currentState.llmConfig.favoriteModels,
          };

          const mergedWindowPreferences: WindowPreferences = {
            ...currentState.windowPreferences,
            ...(persisted?.windowPreferences ?? {}),
            language:
              persisted?.windowPreferences?.language ?? currentState.windowPreferences.language,
          };

          const mergedChatPreferences: ChatPreferences = {
            ...currentState.chatPreferences,
            ...(persisted?.chatPreferences ?? {}),
          };

          const mergedExecutionPreferences: ExecutionPreferences = {
            ...currentState.executionPreferences,
            ...(persisted?.executionPreferences ?? {}),
          };

          return {
            ...currentState,
            ...persisted,
            llmConfig: mergedLLMConfig,
            windowPreferences: mergedWindowPreferences,
            chatPreferences: mergedChatPreferences,
            executionPreferences: mergedExecutionPreferences,
            allowedDirectories: persisted?.allowedDirectories ?? currentState.allowedDirectories,
          };
        },
        migrate: (persistedState: unknown, version: number) => {
          const state = persistedState as Partial<SettingsState> & {
            llmConfig?: Partial<LLMConfig> & {
              defaultProvider?: string;
              defaultModels?: Record<string, string>;
              favoriteModels?: string[];
              taskRouting?: Record<string, { provider: Provider; model: string }>;
            };
            chatPreferences?: Partial<ChatPreferences>;
            executionPreferences?: Partial<ExecutionPreferences>;
          };

          // Migration from v1 to v2: Simplified subscription-only model
          if (version < 2) {
            // Reset to subscription defaults
            if (state?.llmConfig) {
              state.llmConfig.defaultProvider = 'managed_cloud';
              state.llmConfig.defaultModels = {
                ollama: state.llmConfig?.defaultModels?.ollama ?? '',
                managed_cloud: state.llmConfig?.defaultModels?.managed_cloud ?? 'auto',
              };
              state.llmConfig.favoriteModels = [];
              // Update taskRouting to use managed_cloud with 'auto'
              if (state.llmConfig.taskRouting) {
                for (const key of Object.keys(state.llmConfig.taskRouting)) {
                  state.llmConfig.taskRouting[key] = { provider: 'managed_cloud', model: 'auto' };
                }
              }
            }
          }

          // Migration from v2 to v3: Add alwaysUseAgentMode setting
          if (version < 3) {
            if (!state.chatPreferences) {
              state.chatPreferences = {
                promptCompletionEnabled: true,
                alwaysUseAgentMode: false,
                compactMode: true,
                autoApproveTools: false,
              };
            } else if (state.chatPreferences.alwaysUseAgentMode === undefined) {
              state.chatPreferences.alwaysUseAgentMode = false;
            }
          }

          // Migration from v3 to v4: Add executionPreferences for extended timeout support
          if (version < 4) {
            if (!state.executionPreferences) {
              state.executionPreferences = {
                maxTimeoutMinutes: 1440, // 24 hours
                enableCheckpointing: true,
                checkpointInterval: 5,
                autoResumeOnRestart: true,
                enableTimeoutWarnings: true,
              };
            }
          }

          // Migration from v4 to v5: Add compactMode to chatPreferences
          if (version < 5) {
            if (state.chatPreferences && state.chatPreferences.compactMode === undefined) {
              state.chatPreferences.compactMode = true; // Enable compact mode by default
            }
          }

          // Migration from v5 to v6: Cleanup - remove unused provider fields
          if (version < 6) {
            if (state?.llmConfig?.defaultModels) {
              state.llmConfig.defaultModels = {
                ollama: state.llmConfig.defaultModels.ollama ?? '',
                managed_cloud: state.llmConfig.defaultModels.managed_cloud ?? 'auto',
              };
            }
          }

          // Migration from v6 to v7: Add language preference
          if (version < 7) {
            if (!state.windowPreferences) {
              state.windowPreferences = {} as WindowPreferences;
            }
            if (!state.windowPreferences.language) {
              state.windowPreferences.language = 'en';
            }
          }

          // Migration from v7 to v8: Add autoApproveTools setting
          if (version < 8) {
            if (state.chatPreferences && state.chatPreferences.autoApproveTools === undefined) {
              state.chatPreferences.autoApproveTools = false;
            }
          }

          return state as SettingsState;
        },
        // Called when rehydration finishes (with or without errors)
        onRehydrateStorage: () => (state) => {
          if (state) {
            state.setHasHydrated(true);
            console.log('[SettingsStore] Rehydration complete');
          }
        },
      },
    ),
    { name: 'SettingsStore', enabled: import.meta.env.DEV },
  ),
);

/**
 * Wait for settings store to finish hydrating from localStorage.
 * Use this before accessing settings that depend on persisted values.
 */
export function waitForSettingsHydration(): Promise<void> {
  return new Promise((resolve) => {
    const state = useSettingsStore.getState();
    if (state._hasHydrated) {
      resolve();
      return;
    }
    const unsub = useSettingsStore.subscribe((s) => {
      if (s._hasHydrated) {
        unsub();
        resolve();
      }
    });
  });
}

// Selectors
export const selectLlmConfig = (state: SettingsState) => state.llmConfig;
export const selectDefaultProvider = (state: SettingsState) => state.llmConfig.defaultProvider;
export const selectTemperature = (state: SettingsState) => state.llmConfig.temperature;
export const selectMaxTokens = (state: SettingsState) => state.llmConfig.maxTokens;
export const selectDefaultModels = (state: SettingsState) => state.llmConfig.defaultModels;
export const selectTaskRouting = (state: SettingsState) => state.llmConfig.taskRouting;
export const selectFavoriteModels = (state: SettingsState) => state.llmConfig.favoriteModels;

export const selectWindowPreferences = (state: SettingsState) => state.windowPreferences;
export const selectTheme = (state: SettingsState) => state.windowPreferences.theme;
export const selectLanguage = (state: SettingsState) => state.windowPreferences.language;
export const selectStartupPosition = (state: SettingsState) =>
  state.windowPreferences.startupPosition;
export const selectDockOnStartup = (state: SettingsState) => state.windowPreferences.dockOnStartup;

export const selectChatPreferences = (state: SettingsState) => state.chatPreferences;
export const selectPromptCompletionEnabled = (state: SettingsState) =>
  state.chatPreferences.promptCompletionEnabled;
export const selectAlwaysUseAgentMode = (state: SettingsState) =>
  state.chatPreferences.alwaysUseAgentMode;

export const selectExecutionPreferences = (state: SettingsState) => state.executionPreferences;
export const selectMaxTimeoutMinutes = (state: SettingsState) =>
  state.executionPreferences.maxTimeoutMinutes;
export const selectEnableCheckpointing = (state: SettingsState) =>
  state.executionPreferences.enableCheckpointing;
export const selectCheckpointInterval = (state: SettingsState) =>
  state.executionPreferences.checkpointInterval;
export const selectAutoResumeOnRestart = (state: SettingsState) =>
  state.executionPreferences.autoResumeOnRestart;
export const selectEnableTimeoutWarnings = (state: SettingsState) =>
  state.executionPreferences.enableTimeoutWarnings;

export const selectAllowedDirectories = (state: SettingsState) => state.allowedDirectories;
export const selectSettingsLoading = (state: SettingsState) => state.loading;
export const selectSettingsError = (state: SettingsState) => state.error;
export const selectSettingsHasHydrated = (state: SettingsState) => state._hasHydrated;
