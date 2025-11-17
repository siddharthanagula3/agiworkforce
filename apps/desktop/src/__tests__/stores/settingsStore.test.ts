/**
 * Comprehensive tests for settingsStore
 * Tests settings persistence, API key management, LLM configuration, and window preferences
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettingsStore, type Provider } from '../../stores/settingsStore';

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('settingsStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useSettingsStore.setState({
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
        favoriteModels: [],
      },
      windowPreferences: {
        theme: 'system',
        startupPosition: 'center',
        dockOnStartup: null,
      },
      loading: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should have correct default settings', () => {
      const state = useSettingsStore.getState();
      expect(state.apiKeys.openai).toBe('');
      expect(state.llmConfig.defaultProvider).toBe('openai');
      expect(state.llmConfig.temperature).toBe(0.7);
      expect(state.llmConfig.maxTokens).toBe(4096);
      expect(state.windowPreferences.theme).toBe('system');
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should have correct default models', () => {
      const state = useSettingsStore.getState();
      expect(state.llmConfig.defaultModels.openai).toBe('gpt-4o-mini');
      expect(state.llmConfig.defaultModels.anthropic).toBe('claude-3-5-sonnet-20241022');
      expect(state.llmConfig.defaultModels.google).toBe('gemini-1.5-flash');
      expect(state.llmConfig.defaultModels.ollama).toBe('llama3.3');
      expect(state.llmConfig.defaultModels.xai).toBe('grok-4');
      expect(state.llmConfig.defaultModels.deepseek).toBe('deepseek-chat');
      expect(state.llmConfig.defaultModels.qwen).toBe('qwen-max');
      expect(state.llmConfig.defaultModels.mistral).toBe('mistral-large-latest');
    });
  });

  describe('API Key Management', () => {
    it('should set OpenAI API key', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      (invoke as any).mockResolvedValue(undefined);

      const testKey = 'sk-test123';
      await useSettingsStore.getState().setAPIKey('openai', testKey);

      expect(invoke).toHaveBeenCalledWith('settings_save_api_key', {
        provider: 'openai',
        key: testKey,
      });
      expect(invoke).toHaveBeenCalledWith('llm_configure_provider', {
        provider: 'openai',
        apiKey: testKey,
        baseUrl: null,
      });

      const state = useSettingsStore.getState();
      expect(state.apiKeys.openai).toBe(testKey);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should set Anthropic API key', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      (invoke as any).mockResolvedValue(undefined);

      const testKey = 'sk-ant-test123';
      await useSettingsStore.getState().setAPIKey('anthropic', testKey);

      expect(invoke).toHaveBeenCalledWith('settings_save_api_key', {
        provider: 'anthropic',
        key: testKey,
      });

      const state = useSettingsStore.getState();
      expect(state.apiKeys.anthropic).toBe(testKey);
    });

    it('should configure Ollama without API key', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      (invoke as any).mockResolvedValue(undefined);

      await useSettingsStore.getState().setAPIKey('ollama', '');

      expect(invoke).toHaveBeenCalledWith('llm_configure_provider', {
        provider: 'ollama',
        apiKey: null,
        baseUrl: 'http://localhost:11434',
      });
    });

    it('should get API key', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      (invoke as any).mockResolvedValue('sk-test123');

      const key = await useSettingsStore.getState().getAPIKey('openai');

      expect(invoke).toHaveBeenCalledWith('settings_get_api_key', {
        provider: 'openai',
      });
      expect(key).toBe('sk-test123');
    });

    it('should return empty string if API key not found', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      (invoke as any).mockResolvedValue(null);

      const key = await useSettingsStore.getState().getAPIKey('openai');

      expect(key).toBe('');
    });

    it('should handle API key retrieval error', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      (invoke as any).mockRejectedValue(new Error('Keyring error'));

      const key = await useSettingsStore.getState().getAPIKey('openai');

      expect(key).toBe('');
    });

    it('should handle API key save error', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      (invoke as any).mockRejectedValue(new Error('Save failed'));

      await expect(useSettingsStore.getState().setAPIKey('openai', 'sk-test123')).rejects.toThrow();

      const state = useSettingsStore.getState();
      expect(state.error).toBe('Error: Save failed');
      expect(state.loading).toBe(false);
    });
  });

  describe('API Key Testing', () => {
    it('should test valid API key', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      (invoke as any).mockResolvedValue({ content: 'Hello' });

      const isValid = await useSettingsStore.getState().testAPIKey('openai');

      expect(invoke).toHaveBeenCalledWith('llm_send_message', {
        request: {
          messages: [{ role: 'user', content: 'Hello' }],
          model: null,
          provider: 'openai',
          temperature: null,
          max_tokens: 10,
        },
      });
      expect(isValid).toBe(true);
      const state = useSettingsStore.getState();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should test invalid API key', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      (invoke as any).mockRejectedValue(new Error('Invalid API key'));

      const isValid = await useSettingsStore.getState().testAPIKey('openai');

      expect(isValid).toBe(false);
      const state = useSettingsStore.getState();
      expect(state.error).toBe('Error: Invalid API key');
      expect(state.loading).toBe(false);
    });
  });

  describe('LLM Configuration', () => {
    it('should set default provider', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      (invoke as any).mockResolvedValue(undefined);

      await useSettingsStore.getState().setDefaultProvider('anthropic');

      expect(invoke).toHaveBeenCalledWith('llm_set_default_provider', {
        provider: 'anthropic',
      });

      const state = useSettingsStore.getState();
      expect(state.llmConfig.defaultProvider).toBe('anthropic');
    });

    it('should handle set default provider error', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      (invoke as any).mockRejectedValue(new Error('Provider error'));

      await expect(useSettingsStore.getState().setDefaultProvider('anthropic')).rejects.toThrow();

      const state = useSettingsStore.getState();
      expect(state.error).toBe('Error: Provider error');
    });

    it('should set temperature', () => {
      useSettingsStore.getState().setTemperature(0.9);

      const state = useSettingsStore.getState();
      expect(state.llmConfig.temperature).toBe(0.9);
    });

    it('should set max tokens', () => {
      useSettingsStore.getState().setMaxTokens(8192);

      const state = useSettingsStore.getState();
      expect(state.llmConfig.maxTokens).toBe(8192);
    });

    it('should set default model for provider', () => {
      useSettingsStore.getState().setDefaultModel('openai', 'gpt-4');

      const state = useSettingsStore.getState();
      expect(state.llmConfig.defaultModels.openai).toBe('gpt-4');
    });

    it('should preserve other models when setting one', () => {
      useSettingsStore.getState().setDefaultModel('anthropic', 'claude-3-opus');

      const state = useSettingsStore.getState();
      expect(state.llmConfig.defaultModels.anthropic).toBe('claude-3-opus');
      expect(state.llmConfig.defaultModels.openai).toBe('gpt-4o-mini'); // unchanged
    });
  });

  describe('Window Preferences', () => {
    it('should set theme to dark', () => {
      // Mock document.documentElement
      const mockClassList = {
        add: vi.fn(),
        remove: vi.fn(),
      };
      Object.defineProperty(document.documentElement, 'classList', {
        value: mockClassList,
        writable: true,
      });

      useSettingsStore.getState().setTheme('dark');

      const state = useSettingsStore.getState();
      expect(state.windowPreferences.theme).toBe('dark');
      expect(mockClassList.add).toHaveBeenCalledWith('dark');
    });

    it('should set theme to light', () => {
      const mockClassList = {
        add: vi.fn(),
        remove: vi.fn(),
      };
      Object.defineProperty(document.documentElement, 'classList', {
        value: mockClassList,
        writable: true,
      });

      useSettingsStore.getState().setTheme('light');

      const state = useSettingsStore.getState();
      expect(state.windowPreferences.theme).toBe('light');
      expect(mockClassList.remove).toHaveBeenCalledWith('dark');
    });

    it('should set startup position', () => {
      useSettingsStore.getState().setStartupPosition('remember');

      const state = useSettingsStore.getState();
      expect(state.windowPreferences.startupPosition).toBe('remember');
    });

    it('should set dock on startup', () => {
      useSettingsStore.getState().setDockOnStartup('left');

      const state = useSettingsStore.getState();
      expect(state.windowPreferences.dockOnStartup).toBe('left');
    });

    it('should clear dock on startup', () => {
      useSettingsStore.setState({
        windowPreferences: {
          theme: 'system',
          startupPosition: 'center',
          dockOnStartup: 'left',
        },
      });

      useSettingsStore.getState().setDockOnStartup(null);

      const state = useSettingsStore.getState();
      expect(state.windowPreferences.dockOnStartup).toBeNull();
    });
  });

  describe('Settings Persistence', () => {
    it('should load settings from backend', async () => {
      const mockSettings = {
        llmConfig: {
          defaultProvider: 'anthropic' as Provider,
          temperature: 0.8,
          maxTokens: 8192,
          defaultModels: {
            openai: 'gpt-4',
            anthropic: 'claude-3-opus',
            google: 'gemini-pro',
            ollama: 'llama3',
            xai: 'grok-beta',
            deepseek: 'deepseek-chat',
            qwen: 'qwen-turbo',
            mistral: 'mistral-small',
          },
          favoriteModels: [],
        },
        windowPreferences: {
          theme: 'dark' as const,
          startupPosition: 'remember' as const,
          dockOnStartup: 'left' as const,
        },
      };

      const { invoke } = await import('@tauri-apps/api/core');
      (invoke as any).mockImplementation((cmd: string) => {
        if (cmd === 'settings_load') return Promise.resolve(mockSettings);
        if (cmd === 'settings_get_api_key') return Promise.resolve('');
        if (cmd === 'llm_configure_provider') return Promise.resolve(undefined);
        if (cmd === 'llm_set_default_provider') return Promise.resolve(undefined);
        return Promise.reject(new Error('Unknown command'));
      });

      // Mock document.documentElement for theme application
      const mockClassList = {
        add: vi.fn(),
        remove: vi.fn(),
      };
      Object.defineProperty(document.documentElement, 'classList', {
        value: mockClassList,
        writable: true,
      });

      await useSettingsStore.getState().loadSettings();

      const state = useSettingsStore.getState();
      expect(state.llmConfig.defaultProvider).toBe('anthropic');
      expect(state.llmConfig.temperature).toBe(0.8);
      expect(state.llmConfig.maxTokens).toBe(8192);
      expect(state.windowPreferences.theme).toBe('dark');
      expect(state.windowPreferences.dockOnStartup).toBe('left');
      expect(state.loading).toBe(false);
    });

    it('should handle settings load error', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      (invoke as any).mockRejectedValue(new Error('Load failed'));

      await useSettingsStore.getState().loadSettings();

      const state = useSettingsStore.getState();
      expect(state.error).toBe('Error: Load failed');
      expect(state.loading).toBe(false);
    });

    it('should save settings to backend', async () => {
      useSettingsStore.setState({
        llmConfig: {
          defaultProvider: 'anthropic',
          temperature: 0.8,
          maxTokens: 8192,
          defaultModels: {
            openai: 'gpt-4',
            anthropic: 'claude-3-opus',
            google: 'gemini-pro',
            ollama: 'llama3',
            xai: 'grok-beta',
            deepseek: 'deepseek-chat',
            qwen: 'qwen-turbo',
            mistral: 'mistral-small',
          },
          favoriteModels: [],
        },
        windowPreferences: {
          theme: 'dark',
          startupPosition: 'remember',
          dockOnStartup: 'left',
        },
      });

      const { invoke } = await import('@tauri-apps/api/core');
      (invoke as any).mockResolvedValue(undefined);

      await useSettingsStore.getState().saveSettings();

      expect(invoke).toHaveBeenCalledWith('settings_save', {
        settings: {
          llmConfig: expect.any(Object),
          windowPreferences: expect.any(Object),
        },
      });

      const state = useSettingsStore.getState();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should handle settings save error', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      (invoke as any).mockRejectedValue(new Error('Save failed'));

      await expect(useSettingsStore.getState().saveSettings()).rejects.toThrow();

      const state = useSettingsStore.getState();
      expect(state.error).toBe('Error: Save failed');
      expect(state.loading).toBe(false);
    });
  });

  describe('Loading States', () => {
    it('should set loading while saving API key', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      let resolvePromise: any;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      (invoke as any).mockReturnValue(promise);

      const savePromise = useSettingsStore.getState().setAPIKey('openai', 'sk-test');

      expect(useSettingsStore.getState().loading).toBe(true);

      resolvePromise(undefined);
      await savePromise;

      expect(useSettingsStore.getState().loading).toBe(false);
    });

    it('should set loading while testing API key', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      let resolvePromise: any;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      (invoke as any).mockReturnValue(promise);

      const testPromise = useSettingsStore.getState().testAPIKey('openai');

      expect(useSettingsStore.getState().loading).toBe(true);

      resolvePromise({ content: 'Hello' });
      await testPromise;

      expect(useSettingsStore.getState().loading).toBe(false);
    });
  });

  describe('Multiple Providers', () => {
    it('should manage API keys for all providers', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      (invoke as any).mockResolvedValue(undefined);

      await useSettingsStore.getState().setAPIKey('openai', 'sk-openai-test');
      await useSettingsStore.getState().setAPIKey('anthropic', 'sk-ant-test');
      await useSettingsStore.getState().setAPIKey('google', 'google-key-test');

      const state = useSettingsStore.getState();
      expect(state.apiKeys.openai).toBe('sk-openai-test');
      expect(state.apiKeys.anthropic).toBe('sk-ant-test');
      expect(state.apiKeys.google).toBe('google-key-test');
    });

    it('should configure all providers during load', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      (invoke as any).mockImplementation((cmd: string, args?: any) => {
        if (cmd === 'settings_load') {
          return Promise.resolve({
            llmConfig: {
              defaultProvider: 'openai' as Provider,
              temperature: 0.7,
              maxTokens: 4096,
              defaultModels: {
                openai: 'gpt-4o-mini',
                anthropic: 'claude-3-5-sonnet-20241022',
                google: 'gemini-1.5-flash',
                ollama: 'llama3',
                xai: 'grok-beta',
                deepseek: 'deepseek-chat',
                qwen: 'qwen-turbo',
                mistral: 'mistral-small',
              },
            },
            windowPreferences: {
              theme: 'system' as const,
              startupPosition: 'center' as const,
              dockOnStartup: null,
            },
          });
        }
        if (cmd === 'settings_get_api_key') {
          return Promise.resolve(args?.provider === 'openai' ? 'sk-test' : '');
        }
        return Promise.resolve(undefined);
      });

      // Mock document.documentElement for theme application
      const mockClassList = {
        add: vi.fn(),
        remove: vi.fn(),
      };
      Object.defineProperty(document.documentElement, 'classList', {
        value: mockClassList,
        writable: true,
      });

      await useSettingsStore.getState().loadSettings();

      // Should configure Ollama with base URL
      expect(invoke).toHaveBeenCalledWith('llm_configure_provider', {
        provider: 'ollama',
        apiKey: null,
        baseUrl: 'http://localhost:11434',
      });

      // Should configure OpenAI with API key
      expect(invoke).toHaveBeenCalledWith('llm_configure_provider', {
        provider: 'openai',
        apiKey: 'sk-test',
        baseUrl: null,
      });
    });
  });
});
