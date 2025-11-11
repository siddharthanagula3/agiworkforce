import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Provider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'xai'
  | 'deepseek'
  | 'qwen'
  | 'mistral';
export type Theme = 'light' | 'dark' | 'system';

interface APIKeys {
  openai: string;
  anthropic: string;
  google: string;
  ollama: string; // Local provider, typically empty
  xai: string;
  deepseek: string;
  qwen: string;
  mistral: string;
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
  };
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
  loading: boolean;
  error: string | null;

  // API Key Management
  setAPIKey: (provider: Provider, key: string) => Promise<void>;
  getAPIKey: (provider: Provider) => Promise<string>;
  testAPIKey: (provider: Provider) => Promise<boolean>;

  // LLM Configuration
  setDefaultProvider: (provider: Provider) => Promise<void>;
  setTemperature: (temperature: number) => void;
  setMaxTokens: (maxTokens: number) => void;
  setDefaultModel: (provider: Provider, model: string) => void;

  // Window Preferences
  setTheme: (theme: Theme) => void;
  setStartupPosition: (position: 'center' | 'remember') => void;
  setDockOnStartup: (dock: 'left' | 'right' | null) => void;

  // Persistence
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
}

const defaultSettings: Pick<SettingsState, 'apiKeys' | 'llmConfig' | 'windowPreferences'> = {
  apiKeys: {
    openai: '',
    anthropic: '',
    google: '',
    ollama: '',
    xai: '',
    deepseek: '',
    qwen: '',
    mistral: '',
  },
  llmConfig: {
    defaultProvider: 'openai',
    temperature: 0.7,
    maxTokens: 4096,
    defaultModels: {
      openai: 'gpt-4o-mini',
      anthropic: 'claude-3-5-sonnet-20241022',
      google: 'gemini-1.5-flash',
      ollama: 'llama3.3',
      xai: 'grok-4',
      deepseek: 'deepseek-chat',
      qwen: 'qwen-max',
      mistral: 'mistral-large-latest',
    },
  },
  windowPreferences: {
    theme: 'system',
    startupPosition: 'center',
    dockOnStartup: null,
  },
};

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
          // Save to keyring via backend
          await invoke('settings_save_api_key', { provider, key });

          // Configure the provider with the new key
          if (provider === 'ollama') {
            await invoke('llm_configure_provider', {
              provider,
              apiKey: null,
              baseUrl: 'http://localhost:11434',
            });
          } else {
            await invoke('llm_configure_provider', {
              provider,
              apiKey: key,
              baseUrl: null,
            });
          }

          set((state) => ({
            apiKeys: { ...state.apiKeys, [provider]: key },
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
          // Send a simple test message
          await invoke('llm_send_message', {
            request: {
              messages: [{ role: 'user', content: 'Hello' }],
              model: null,
              provider,
              temperature: null,
              max_tokens: 10,
            },
          });
          set({ loading: false });
          return true;
        } catch (error) {
          console.error(`API key test failed for ${provider}:`, error);
          set({ error: String(error), loading: false });
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

      setDefaultModel: (provider: Provider, model: string) => {
        set((state) => ({
          llmConfig: {
            ...state.llmConfig,
            defaultModels: { ...state.llmConfig.defaultModels, [provider]: model },
          },
        }));
      },

      setTheme: (theme: Theme) => {
        set((state) => ({
          windowPreferences: { ...state.windowPreferences, theme },
        }));
        // Apply theme to document
        if (
          theme === 'dark' ||
          (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
        ) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
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

      loadSettings: async () => {
        set({ loading: true, error: null });
        try {
          // Load settings from backend/database
          const settings = await invoke<{
            llmConfig: LLMConfig;
            windowPreferences: WindowPreferences;
          }>('settings_load');

          // Load API keys from keyring
          const providers: Provider[] = [
            'openai',
            'anthropic',
            'google',
            'ollama',
            'xai',
            'deepseek',
            'qwen',
            'mistral',
          ];
          const apiKeys: APIKeys = {
            openai: '',
            anthropic: '',
            google: '',
            ollama: '',
            xai: '',
            deepseek: '',
            qwen: '',
            mistral: '',
          };

          for (const provider of providers) {
            try {
              const key = await get().getAPIKey(provider);
              apiKeys[provider] = key;

              if (provider === 'ollama') {
                await invoke('llm_configure_provider', {
                  provider,
                  apiKey: null,
                  baseUrl: 'http://localhost:11434',
                });
              } else if (key.trim().length > 0) {
                await invoke('llm_configure_provider', {
                  provider,
                  apiKey: key,
                  baseUrl: null,
                });
              }
            } catch (error) {
              console.error(`Failed to load API key for ${provider}:`, error);
            }
          }

          set({
            apiKeys,
            llmConfig: settings.llmConfig,
            windowPreferences: settings.windowPreferences,
            loading: false,
          });

          // Apply theme
          get().setTheme(settings.windowPreferences.theme);

          // Restore router default provider preference
          try {
            await invoke('llm_set_default_provider', {
              provider: settings.llmConfig.defaultProvider,
            });
          } catch (error) {
            console.error('Failed to restore default provider:', error);
          }
        } catch (error) {
          console.error('Failed to load settings:', error);
          set({ error: String(error), loading: false });
        }
      },

      saveSettings: async () => {
        set({ loading: true, error: null });
        try {
          const { llmConfig, windowPreferences } = get();
          await invoke('settings_save', {
            settings: {
              llmConfig,
              windowPreferences,
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
      }),
    },
  ),
);
