import { invoke } from '../lib/tauri-mock';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Provider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'xai'
  | 'deepseek'
  | 'qwen'
  | 'mistral'
  | 'moonshot';
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

interface APIKeys {
  openai: string;
  anthropic: string;
  google: string;
  ollama: string;
  xai: string;
  deepseek: string;
  qwen: string;
  mistral: string;
  moonshot: string;
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
    mistral: string;
    moonshot: string;
  };
  taskRouting: TaskRouting;
  favoriteModels: string[];
  useCloudCredits: boolean; // Prefer cloud credits over own API keys for Pro/Max users
}

interface WindowPreferences {
  theme: Theme;
  startupPosition: 'center' | 'remember';
  dockOnStartup: 'left' | 'right' | null;
}

interface SettingsState {
  apiKeys: APIKeys;
  llmConfig: LLMConfig;
  windowPreferences: WindowPreferences;
  allowedDirectories: string[];
  loading: boolean;
  error: string | null;

  setAPIKey: (provider: Provider, key: string) => Promise<void>;
  getAPIKey: (provider: Provider) => Promise<string>;
  testAPIKey: (provider: Provider) => Promise<boolean>;

  setDefaultProvider: (provider: Provider) => Promise<void>;
  setTemperature: (temperature: number) => void;
  setMaxTokens: (maxTokens: number) => void;
  setDefaultModel: (provider: Provider, model: string) => void;
  setTaskRouting: (category: TaskCategory, provider: Provider, model: string) => void;
  setFavoriteModels: (models: string[]) => void;
  addFavoriteModel: (model: string) => void;
  removeFavoriteModel: (model: string) => void;
  setUseCloudCredits: (useCloudCredits: boolean) => void;

  setTheme: (theme: Theme) => void;
  setStartupPosition: (position: 'center' | 'remember') => void;
  setDockOnStartup: (dock: 'left' | 'right' | null) => void;

  addAllowedDirectory: (path: string) => void;
  removeAllowedDirectory: (path: string) => void;
  setAllowedDirectories: (paths: string[]) => void;

  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
}

const defaultSettings: Pick<
  SettingsState,
  'apiKeys' | 'llmConfig' | 'windowPreferences' | 'allowedDirectories'
> = {
  apiKeys: {
    openai: '',
    anthropic: '',
    google: '',
    ollama: '',
    xai: '',
    deepseek: '',
    qwen: '',
    mistral: '',
    moonshot: '',
  },
  llmConfig: {
    defaultProvider: 'anthropic',
    temperature: 0.7,
    maxTokens: 4096,
    useCloudCredits: true, // Default to using cloud credits for Pro/Max users
    defaultModels: {
      openai: 'gpt-5.1',
      anthropic: 'claude-sonnet-4-5',
      google: 'gemini-3-pro',
      ollama: 'llama4-maverick',
      xai: 'grok-4.1',
      deepseek: '',
      qwen: 'qwen3-max',
      mistral: '',
      moonshot: 'kimi-k2-thinking',
    },
    favoriteModels: [
      'openai/gpt-5.1',
      'openai/gpt-5.1-instant',
      'openai/gpt-5.1-thinking',
      'openai/gpt-5.1-codex-max',
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
      search: { provider: 'openai', model: 'gpt-5.1' },
      code: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
      docs: { provider: 'anthropic', model: 'claude-sonnet-4-5' },

      chat: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
      vision: { provider: 'google', model: 'gemini-3-pro' },
      image: { provider: 'google', model: 'imagen-3' },
      video: { provider: 'google', model: 'veo-3.1' },
    },
  },
  windowPreferences: {
    theme: 'system',
    startupPosition: 'center',
    dockOnStartup: null,
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

const settingsStorage = createJSONStorage<{
  llmConfig: LLMConfig;
  windowPreferences: WindowPreferences;
}>(() => (typeof window === 'undefined' ? storageFallback : window.localStorage));

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...defaultSettings,
      loading: false,
      error: null,

      setAPIKey: async (provider: Provider, key: string) => {
        set({ loading: true, error: null });
        try {
          const trimmedKey = key.trim();

          await invoke('settings_save_api_key', { provider, key: trimmedKey });

          if (provider === 'ollama') {
            await invoke('llm_configure_provider', {
              provider,
              apiKey: null,
              baseUrl: 'http://localhost:11434',
            });
          } else {
            await invoke('llm_configure_provider', {
              provider,
              apiKey: trimmedKey,
              baseUrl: null,
            });
          }

          set((state) => ({
            apiKeys: { ...state.apiKeys, [provider]: trimmedKey },
            loading: false,
          }));
        } catch (error) {
          console.error(`Failed to set API key for ${provider}:`, error);
          set({ error: String(error), loading: false });
          throw error;
        }
      },

      getAPIKey: async (provider: Provider) => {
        try {
          const key = await invoke<string>('settings_get_api_key', { provider });
          return key || '';
        } catch (error) {
          console.error(`Failed to get API key for ${provider}:`, error);
          return '';
        }
      },

      testAPIKey: async (provider: Provider) => {
        set({ loading: true, error: null });
        try {
          const key = await get().getAPIKey(provider);
          if (!key || !key.trim()) {
            throw new Error(`No API key found for ${provider}. Please save your API key first.`);
          }

          if (provider !== 'ollama') {
            await invoke('llm_configure_provider', {
              provider,
              apiKey: key.trim(),
              baseUrl: null,
            });
          }

          const defaultModel = get().llmConfig.defaultModels[provider];
          if (!defaultModel || !defaultModel.trim()) {
            throw new Error(
              `No default model configured for provider: ${provider}. Please set a default model in settings.`,
            );
          }

          await invoke('llm_send_message', {
            request: {
              messages: [{ role: 'user', content: 'Hi' }],
              model: defaultModel.trim(),
              provider,
              temperature: null,
              max_tokens: 10,
              preferCloudCredits: false, // When testing API keys, don't use cloud credits
            },
          });
          set({ loading: false, error: null });
          return true;
        } catch (error) {
          console.error(`API key test failed for ${provider}:`, error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          set({ error: errorMessage, loading: false });
          return false;
        }
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

      setUseCloudCredits: (useCloudCredits: boolean) => {
        set((state) => ({
          llmConfig: { ...state.llmConfig, useCloudCredits },
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
          const settings = await invoke<{
            llmConfig: LLMConfig;
            windowPreferences: WindowPreferences;
            allowedDirectories: string[];
          }>('settings_load');

          if (get().loading === false) {
            console.warn('[settingsStore] Load cancelled - another operation started');
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

          const providers: Provider[] = [
            'openai',
            'anthropic',
            'google',
            'ollama',
            'xai',
            'deepseek',
            'qwen',
            'mistral',
            'moonshot',
          ];

          const apiKeyResults = await Promise.allSettled(
            providers.map(async (provider) => {
              try {
                const key = await get().getAPIKey(provider);
                return { provider, key };
              } catch (error) {
                console.error(`Failed to load API key for ${provider}:`, error);
                return { provider, key: '' };
              }
            }),
          );

          const apiKeys: APIKeys = {
            openai: '',
            anthropic: '',
            google: '',
            ollama: '',
            xai: '',
            deepseek: '',
            qwen: '',
            mistral: '',
            moonshot: '',
          };

          for (const result of apiKeyResults) {
            if (result.status === 'fulfilled') {
              apiKeys[result.value.provider] = result.value.key;
            }
          }

          if (get().loading === false) {
            console.warn('[settingsStore] Load cancelled before setting state');
            return;
          }

          const configPromises = providers.map(async (provider) => {
            try {
              if (provider === 'ollama') {
                await invoke('llm_configure_provider', {
                  provider,
                  apiKey: null,
                  baseUrl: 'http://localhost:11434',
                });
              } else if (apiKeys[provider].trim().length > 0) {
                await invoke('llm_configure_provider', {
                  provider,
                  apiKey: apiKeys[provider],
                  baseUrl: null,
                });
              }
            } catch (error) {
              console.error(`Failed to configure provider ${provider}:`, error);
            }
          });

          await Promise.allSettled(configPromises);

          if (get().loading === false) {
            console.warn('[settingsStore] Load cancelled before final update');
            return;
          }

          set({
            apiKeys,
            llmConfig: mergedLLMConfig,
            windowPreferences: mergedWindowPreferences,
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
          const { llmConfig, windowPreferences, allowedDirectories } = get();
          await invoke('settings_save', {
            settings: {
              llmConfig,
              windowPreferences,
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
    }),
    {
      name: 'agiworkforce-settings',
      storage: settingsStorage,
      partialize: (state) => ({
        llmConfig: state.llmConfig,
        windowPreferences: state.windowPreferences,
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

        return {
          ...currentState,
          ...persisted,
          llmConfig: mergedLLMConfig,
          windowPreferences: mergedWindowPreferences,
          allowedDirectories: persisted?.allowedDirectories ?? currentState.allowedDirectories,
        };
      },
    },
  ),
);
