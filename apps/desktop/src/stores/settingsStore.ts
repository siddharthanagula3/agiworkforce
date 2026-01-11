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
    openai: string;
    anthropic: string;
    google: string;
    ollama: string;
    xai: string;
    deepseek: string;
    qwen: string;
    moonshot: string;
    managed_cloud: string;
  };
  taskRouting: TaskRouting;
  favoriteModels: string[];
}

interface WindowPreferences {
  theme: Theme;
  startupPosition: 'center' | 'remember';
  dockOnStartup: 'left' | 'right' | null;
}

export interface ChatPreferences {
  /** Enable AI-powered prompt completion (ghost text suggestions) */
  promptCompletionEnabled: boolean;
}

interface SettingsState {
  llmConfig: LLMConfig;
  windowPreferences: WindowPreferences;
  chatPreferences: ChatPreferences;
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
  setStartupPosition: (position: 'center' | 'remember') => void;
  setDockOnStartup: (dock: 'left' | 'right' | null) => void;

  setPromptCompletionEnabled: (enabled: boolean) => void;

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
  'llmConfig' | 'windowPreferences' | 'chatPreferences' | 'allowedDirectories'
> = {
  llmConfig: {
    defaultProvider: 'managed_cloud',
    temperature: 0.7,
    maxTokens: 4096,
    defaultModels: {
      openai: '',
      anthropic: '',
      google: '',
      ollama: '',
      xai: '',
      deepseek: '',
      qwen: '',
      moonshot: '',
      managed_cloud: 'auto',
    },
    favoriteModels: [
      'openai/gpt-5.2',
      'openai/gpt-5.2-pro',
      'openai/gpt-5.2-chat-latest',
      'openai/gpt-5.2-codex',
      'openai/gpt-5.1-thinking',
      'anthropic/claude-sonnet-4-5',
      'anthropic/claude-haiku-4-5',
      'anthropic/claude-opus-4-5',
      'google/gemini-3-pro',
      'google/gemini-3-flash',
      'google/gemini-3-deep-think',
      'xai/grok-4.1',
      'xai/grok-4.1-fast',
      'qwen/qwen3-max',
      'ollama/llama4-maverick',
      'moonshot/kimi-k2-thinking',
    ],
    taskRouting: {
      search: { provider: 'managed_cloud', model: 'managed-cloud-auto' },
      code: { provider: 'managed_cloud', model: 'managed-cloud-auto' },
      docs: { provider: 'managed_cloud', model: 'managed-cloud-auto' },

      chat: { provider: 'managed_cloud', model: 'managed-cloud-auto' },
      vision: { provider: 'managed_cloud', model: 'managed-cloud-auto' },
      image: { provider: 'managed_cloud', model: 'managed-cloud-auto' },
      video: { provider: 'managed_cloud', model: 'managed-cloud-auto' },
    },
  },
  windowPreferences: {
    theme: 'system',
    startupPosition: 'center',
    dockOnStartup: null,
  },
  chatPreferences: {
    promptCompletionEnabled: true, // AI-powered ghost text enabled by default
  },
  allowedDirectories: [],
};

export const createDefaultLLMConfig = (): LLMConfig => ({
  ...defaultSettings.llmConfig,
  defaultModels: { ...defaultSettings.llmConfig.defaultModels },
  favoriteModels: [...defaultSettings.llmConfig.favoriteModels],
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
const SETTINGS_STORE_VERSION = 1;

export const useSettingsStore = create<SettingsState>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        ...defaultSettings,
        loading: false,
        error: null,
        _hasHydrated: false,

        setHasHydrated: (state: boolean) => {
          set({ _hasHydrated: state });
        },

        setDefaultProvider: async (provider: Provider) => {
          try {
            await invoke('llm_set_default_provider', { provider });
            set((state) => ({
              llmConfig: { ...state.llmConfig, defaultProvider: provider },
            }));
          } catch (error) {
            console.error('Failed to set default provider:', error);
            set({ error: String(error) });
            throw error;
          }
        },

        setTemperature: (temperature: number) => {
          set((state) => ({
            llmConfig: { ...state.llmConfig, temperature },
          }));
        },

        setMaxTokens: (maxTokens: number) => {
          set((state) => ({
            llmConfig: { ...state.llmConfig, maxTokens },
          }));
        },

        setDefaultModel: (provider: Provider, model: string) => {
          set((state) => ({
            llmConfig: {
              ...state.llmConfig,
              defaultModels: { ...state.llmConfig.defaultModels, [provider]: model },
            },
          }));
        },

        setTaskRouting: (category: TaskCategory, provider: Provider, model: string) => {
          set((state) => ({
            llmConfig: {
              ...state.llmConfig,
              taskRouting: {
                ...state.llmConfig.taskRouting,
                [category]: { provider, model },
              },
            },
          }));
        },

        setFavoriteModels: (models: string[]) => {
          set((state) => ({
            llmConfig: { ...state.llmConfig, favoriteModels: models },
          }));
        },

        addFavoriteModel: (model: string) => {
          set((state) => {
            const favoriteModels = [...state.llmConfig.favoriteModels];
            if (!favoriteModels.includes(model)) {
              favoriteModels.push(model);
            }
            return {
              llmConfig: { ...state.llmConfig, favoriteModels },
            };
          });
        },

        removeFavoriteModel: (model: string) => {
          set((state) => {
            const favoriteModels = state.llmConfig.favoriteModels.filter((m) => m !== model);
            return {
              llmConfig: { ...state.llmConfig, favoriteModels },
            };
          });
        },

        setTheme: (theme: Theme) => {
          set((state) => ({
            windowPreferences: { ...state.windowPreferences, theme },
          }));

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

        setStartupPosition: (position: 'center' | 'remember') => {
          set((state) => ({
            windowPreferences: { ...state.windowPreferences, startupPosition: position },
          }));
        },

        setDockOnStartup: (dock: 'left' | 'right' | null) => {
          set((state) => ({
            windowPreferences: { ...state.windowPreferences, dockOnStartup: dock },
          }));
        },

        setPromptCompletionEnabled: (enabled: boolean) => {
          set((state) => ({
            chatPreferences: { ...state.chatPreferences, promptCompletionEnabled: enabled },
          }));
        },

        addAllowedDirectory: (path: string) => {
          set((state) => {
            if (state.allowedDirectories.includes(path)) return {};
            return { allowedDirectories: [...state.allowedDirectories, path] };
          });
        },

        removeAllowedDirectory: (path: string) => {
          set((state) => ({
            allowedDirectories: state.allowedDirectories.filter((p) => p !== path),
          }));
        },

        setAllowedDirectories: (paths: string[]) => {
          set({ allowedDirectories: paths });
        },

        loadSettings: async () => {
          set({ loading: true, error: null });

          try {
            // Web development mode: Tauri commands are unavailable.
            // Use persisted localStorage state + in-memory defaults and skip disk/native calls.
            if (!isTauriContext()) {
              set({ loading: false, error: null });
              get().setTheme(get().windowPreferences.theme);
              return;
            }

            // Try to load settings from disk first, falling back to in-memory defaults
            let settings: {
              llmConfig: LLMConfig;
              windowPreferences: WindowPreferences;
              chatPreferences?: ChatPreferences;
              allowedDirectories: string[];
            };

            try {
              settings = await invoke<{
                llmConfig: LLMConfig;
                windowPreferences: WindowPreferences;
                chatPreferences?: ChatPreferences;
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
                ...(settings.llmConfig?.defaultModels ?? defaultSettings.llmConfig.defaultModels),
              },
              favoriteModels:
                settings.llmConfig?.favoriteModels ?? defaultSettings.llmConfig.favoriteModels,
            };

            const mergedWindowPreferences: WindowPreferences = {
              ...defaultSettings.windowPreferences,
              ...(settings.windowPreferences ?? defaultSettings.windowPreferences),
            };

            const mergedChatPreferences: ChatPreferences = {
              ...defaultSettings.chatPreferences,
              ...(settings.chatPreferences ?? defaultSettings.chatPreferences),
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

            set({
              llmConfig: mergedLLMConfig,
              windowPreferences: mergedWindowPreferences,
              chatPreferences: mergedChatPreferences,
              allowedDirectories: settings.allowedDirectories ?? [],
              loading: false,
            });

            get().setTheme(mergedWindowPreferences.theme);

            try {
              await invoke('llm_set_default_provider', {
                provider: mergedLLMConfig.defaultProvider,
              });
            } catch (error) {
              console.error('Failed to restore default provider:', error);
            }
          } catch (error) {
            console.error('Failed to load settings:', error);

            if (get().loading) {
              set({ error: String(error), loading: false });
            }
          }
        },

        saveSettings: async () => {
          set({ loading: true, error: null });
          try {
            const { llmConfig, windowPreferences, chatPreferences, allowedDirectories } = get();
            await invoke('settings_save', {
              settings: {
                llmConfig,
                windowPreferences,
                chatPreferences,
                allowedDirectories,
              },
            });
            set({ loading: false });
          } catch (error) {
            console.error('Failed to save settings:', error);
            set({ error: String(error), loading: false });
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
          windowPreferences: state.windowPreferences,
          chatPreferences: state.chatPreferences,
          allowedDirectories: state.allowedDirectories,
        }),
        merge: (persistedState, currentState) => {
          const persisted = persistedState as Partial<SettingsState> | undefined;
          const mergedLLMConfig: LLMConfig = {
            ...currentState.llmConfig,
            ...(persisted?.llmConfig ?? {}),
            defaultModels: {
              ...currentState.llmConfig.defaultModels,
              ...(persisted?.llmConfig?.defaultModels ?? {}),
            },
            favoriteModels:
              persisted?.llmConfig?.favoriteModels ?? currentState.llmConfig.favoriteModels,
          };

          const mergedWindowPreferences: WindowPreferences = {
            ...currentState.windowPreferences,
            ...(persisted?.windowPreferences ?? {}),
          };

          const mergedChatPreferences: ChatPreferences = {
            ...currentState.chatPreferences,
            ...(persisted?.chatPreferences ?? {}),
          };

          return {
            ...currentState,
            ...persisted,
            llmConfig: mergedLLMConfig,
            windowPreferences: mergedWindowPreferences,
            chatPreferences: mergedChatPreferences,
            allowedDirectories: persisted?.allowedDirectories ?? currentState.allowedDirectories,
          };
        },
        migrate: (persistedState: unknown, version: number) => {
          // Migration logic for future schema changes
          if (version === 0) {
            return persistedState as SettingsState;
          }
          return persistedState as SettingsState;
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
