/**
 * Comprehensive tests for settingsStore
 * Tests settings persistence, API key management, LLM configuration, and window preferences
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore, type Provider } from '../../stores/settingsStore';
import { invoke } from '../../lib/tauri-mock';

vi.mock('../../lib/tauri-mock', () => ({
  invoke: vi.fn(),
}));

const buildTaskRouting = (defaults: {
  openai: string;
  anthropic: string;
  google: string;
  ollama: string;
  xai: string;
  deepseek: string;
  qwen: string;
  mistral: string;
  moonshot: string;
}) => ({
  search: { provider: 'openai' as Provider, model: defaults.openai },
  code: { provider: 'anthropic' as Provider, model: defaults.anthropic },
  docs: { provider: 'anthropic' as Provider, model: defaults.anthropic },
  chat: { provider: 'openai' as Provider, model: defaults.openai },
  vision: { provider: 'openai' as Provider, model: defaults.openai },
  image: { provider: 'google' as Provider, model: defaults.google },
  video: { provider: 'google' as Provider, model: defaults.google },
});

describe('settingsStore', () => {
  beforeEach(() => {
    const defaultModels = {
      openai: 'gpt-5.1',
      anthropic: 'claude-sonnet-4-5',
      google: 'gemini-3-pro',
      ollama: 'llama4-maverick',
      xai: 'grok-4.1',
      deepseek: '',
      qwen: 'qwen3-max',
      mistral: '',
      moonshot: 'kimi-k2-thinking',
    };

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
        moonshot: '',
      },
      llmConfig: {
        defaultProvider: 'openai',
        temperature: 0.7,
        maxTokens: 4096,
        defaultModels,
        taskRouting: buildTaskRouting(defaultModels),
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
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'settings_get_api_key') return Promise.resolve('');
      return Promise.resolve(undefined);
    });
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
      expect(state.llmConfig.defaultModels.openai).toBe('gpt-5.1');
      expect(state.llmConfig.defaultModels.anthropic).toBe('claude-sonnet-4-5');
      expect(state.llmConfig.defaultModels.google).toBe('gemini-3-pro');
      expect(state.llmConfig.defaultModels.ollama).toBe('llama4-maverick');
      expect(state.llmConfig.defaultModels.xai).toBe('grok-4.1');
      expect(state.llmConfig.defaultModels.deepseek).toBe('');
      expect(state.llmConfig.defaultModels.qwen).toBe('qwen3-max');
      expect(state.llmConfig.defaultModels.mistral).toBe('');
    });
  });

  describe('API Key Management', () => {
    it('should set OpenAI API key', async () => {
      const testKey = 'sk-test123';
      await useSettingsStore.getState().setAPIKey('openai', testKey);

      expect(vi.mocked(invoke)).toHaveBeenCalledWith('settings_save_api_key', {
        provider: 'openai',
        key: testKey,
      });
      expect(vi.mocked(invoke)).toHaveBeenCalledWith('llm_configure_provider', {
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
      const testKey = 'sk-ant-test123';
      await useSettingsStore.getState().setAPIKey('anthropic', testKey);

      expect(vi.mocked(invoke)).toHaveBeenCalledWith('settings_save_api_key', {
        provider: 'anthropic',
        key: testKey,
      });

      const state = useSettingsStore.getState();
      expect(state.apiKeys.anthropic).toBe(testKey);
    });

    it('should configure Ollama without API key', async () => {
      await useSettingsStore.getState().setAPIKey('ollama', '');

      expect(vi.mocked(invoke)).toHaveBeenCalledWith('llm_configure_provider', {
        provider: 'ollama',
        apiKey: null,
        baseUrl: 'http://localhost:11434',
      });
    });

    it('should get API key', async () => {
      vi.mocked(invoke).mockImplementation((cmd: string) => {
        if (cmd === 'settings_get_api_key') return Promise.resolve('sk-test123');
        return Promise.resolve(undefined);
      });

      const key = await useSettingsStore.getState().getAPIKey('openai');

      expect(vi.mocked(invoke)).toHaveBeenCalledWith('settings_get_api_key', {
        provider: 'openai',
      });
      expect(key).toBe('sk-test123');
    });

    it('should return empty string if API key not found', async () => {
      vi.mocked(invoke).mockImplementation((cmd: string) => {
        if (cmd === 'settings_get_api_key') return Promise.resolve(null);
        return Promise.resolve(undefined);
      });

      const key = await useSettingsStore.getState().getAPIKey('openai');

      expect(key).toBe('');
    });

    it('should handle API key retrieval error', async () => {
      vi.mocked(invoke).mockImplementation(() => {
        throw new Error('Keyring error');
      });

      const key = await useSettingsStore.getState().getAPIKey('openai');

      expect(key).toBe('');
    });

    it('should handle API key save error', async () => {
      vi.mocked(invoke).mockImplementation(() => {
        throw new Error('Save failed');
      });

      await expect(useSettingsStore.getState().setAPIKey('openai', 'sk-test123')).rejects.toThrow();

      const state = useSettingsStore.getState();
      expect(state.error).toBe('Error: Save failed');
      expect(state.loading).toBe(false);
    });
  });

  describe('API Key Testing', () => {
    it('should test valid API key', async () => {
      vi.mocked(invoke).mockImplementation((cmd: string) => {
        if (cmd === 'settings_get_api_key') return Promise.resolve('sk-test123');
        return Promise.resolve({ content: 'Hello' });
      });

      const isValid = await useSettingsStore.getState().testAPIKey('openai');

      expect(vi.mocked(invoke)).toHaveBeenCalledWith('llm_send_message', {
        request: {
          messages: [{ role: 'user', content: 'Hi' }],
          model: 'gpt-5.1',
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
      vi.mocked(invoke).mockImplementation((cmd: string) => {
        if (cmd === 'settings_get_api_key') return Promise.resolve('sk-test123');
        return Promise.reject(new Error('Invalid API key'));
      });

      const isValid = await useSettingsStore.getState().testAPIKey('openai');

      expect(isValid).toBe(false);
      const state = useSettingsStore.getState();
      expect(state.error).toBe('Invalid API key');
      expect(state.loading).toBe(false);
    });
  });

  describe('LLM Configuration', () => {
    it('should set default provider', async () => {
      await useSettingsStore.getState().setDefaultProvider('anthropic');

      expect(vi.mocked(invoke)).toHaveBeenCalledWith('llm_set_default_provider', {
        provider: 'anthropic',
      });

      const state = useSettingsStore.getState();
      expect(state.llmConfig.defaultProvider).toBe('anthropic');
    });

    it('should handle set default provider error', async () => {
      vi.mocked(invoke).mockImplementation(() => {
        throw new Error('Provider error');
      });

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
      useSettingsStore.getState().setDefaultModel('openai', 'gpt-5.1-thinking');

      const state = useSettingsStore.getState();
      expect(state.llmConfig.defaultModels.openai).toBe('gpt-5.1-thinking');
    });

    it('should preserve other models when setting one', () => {
      useSettingsStore.getState().setDefaultModel('anthropic', 'claude-opus-4-5');

      const state = useSettingsStore.getState();
      expect(state.llmConfig.defaultModels.anthropic).toBe('claude-opus-4-5');
      expect(state.llmConfig.defaultModels.openai).toBe('gpt-5.1'); // unchanged
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
            openai: 'gpt-5.1',
            anthropic: 'claude-opus-4-5',
            google: 'gemini-3-pro',
            ollama: 'llama4-maverick',
            xai: 'grok-4.1',
            deepseek: '',
            qwen: 'qwen3-max',
            mistral: '',
            moonshot: 'kimi-k2-thinking',
          },
          taskRouting: buildTaskRouting({
            openai: 'gpt-5.1',
            anthropic: 'claude-opus-4-5',
            google: 'gemini-3-pro',
            ollama: 'llama4-maverick',
            xai: 'grok-4.1',
            deepseek: '',
            qwen: 'qwen3-max',
            mistral: '',
            moonshot: 'kimi-k2-thinking',
          }),
          favoriteModels: [],
        },
        windowPreferences: {
          theme: 'dark' as const,
          startupPosition: 'remember' as const,
          dockOnStartup: 'left' as const,
        },
      };

      vi.mocked(invoke).mockImplementation((cmd: string) => {
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
      vi.mocked(invoke).mockRejectedValue(new Error('Load failed'));

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
            openai: 'gpt-5.1',
            anthropic: 'claude-opus-4-5',
            google: 'gemini-3-pro',
            ollama: 'llama4-maverick',
            xai: 'grok-4.1',
            deepseek: '',
            qwen: 'qwen3-max',
            mistral: '',
            moonshot: 'kimi-k2-thinking',
          },
          taskRouting: buildTaskRouting({
            openai: 'gpt-5.1',
            anthropic: 'claude-opus-4-5',
            google: 'gemini-3-pro',
            ollama: 'llama4-maverick',
            xai: 'grok-4.1',
            deepseek: '',
            qwen: 'qwen3-max',
            mistral: '',
            moonshot: 'kimi-k2-thinking',
          }),
          favoriteModels: [],
        },
        windowPreferences: {
          theme: 'dark',
          startupPosition: 'remember',
          dockOnStartup: 'left',
        },
      });

      vi.mocked(invoke).mockResolvedValue(undefined);

      await useSettingsStore.getState().saveSettings();

      expect(vi.mocked(invoke)).toHaveBeenCalledWith('settings_save', {
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
      vi.mocked(invoke).mockRejectedValue(new Error('Save failed'));

      await expect(useSettingsStore.getState().saveSettings()).rejects.toThrow();

      const state = useSettingsStore.getState();
      expect(state.error).toBe('Error: Save failed');
      expect(state.loading).toBe(false);
    });
  });

  describe('Loading States', () => {
    it('should set loading while saving API key', async () => {
      let resolvePromise: any;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(invoke).mockReturnValue(promise);

      const savePromise = useSettingsStore.getState().setAPIKey('openai', 'sk-test');

      expect(useSettingsStore.getState().loading).toBe(true);

      resolvePromise(undefined);
      await savePromise;

      expect(useSettingsStore.getState().loading).toBe(false);
    });

    it('should set loading while testing API key', async () => {
      let resolvePromise: any;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(invoke).mockReturnValue(promise);

      const testPromise = useSettingsStore.getState().testAPIKey('openai');

      expect(useSettingsStore.getState().loading).toBe(true);

      resolvePromise({ content: 'Hello' });
      await testPromise;

      expect(useSettingsStore.getState().loading).toBe(false);
    });
  });

  describe('Multiple Providers', () => {
    it('should manage API keys for all providers', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      await useSettingsStore.getState().setAPIKey('openai', 'sk-openai-test');
      await useSettingsStore.getState().setAPIKey('anthropic', 'sk-ant-test');
      await useSettingsStore.getState().setAPIKey('google', 'google-key-test');

      const state = useSettingsStore.getState();
      expect(state.apiKeys.openai).toBe('sk-openai-test');
      expect(state.apiKeys.anthropic).toBe('sk-ant-test');
      expect(state.apiKeys.google).toBe('google-key-test');
    });

    it('should configure all providers during load', async () => {
      vi.mocked(invoke).mockImplementation((cmd: string, args?: any) => {
        if (cmd === 'settings_load') {
          return Promise.resolve({
            llmConfig: {
              defaultProvider: 'openai' as Provider,
              temperature: 0.7,
              maxTokens: 4096,
              defaultModels: {
                openai: 'gpt-5.1',
                anthropic: 'claude-sonnet-4-5',
                google: 'gemini-1.5-flash',
                ollama: 'llama3',
                xai: 'grok-beta',
                deepseek: 'deepseek-chat',
                qwen: 'qwen-turbo',
                mistral: 'mistral-small',
              },
              taskRouting: buildTaskRouting({
                openai: 'gpt-5.1',
                anthropic: 'claude-sonnet-4-5',
                google: 'gemini-1.5-flash',
                ollama: 'llama3',
                xai: 'grok-beta',
                deepseek: 'deepseek-chat',
                qwen: 'qwen-turbo',
                mistral: 'mistral-small',
                moonshot: 'kimi-k2-thinking',
              }),
              favoriteModels: [],
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
      expect(vi.mocked(invoke)).toHaveBeenCalledWith('llm_configure_provider', {
        provider: 'ollama',
        apiKey: null,
        baseUrl: 'http://localhost:11434',
      });

      // Should configure OpenAI with API key
      expect(vi.mocked(invoke)).toHaveBeenCalledWith('llm_configure_provider', {
        provider: 'openai',
        apiKey: 'sk-test',
        baseUrl: null,
      });
    });
  });
});
