import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '../../lib/tauri-mock';
import { useSettingsStore, type Provider } from '../../stores/settingsStore';

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
      moonshot: 'kimi-k2-thinking',
      managed_cloud: 'auto',
    };

    useSettingsStore.setState({
      llmConfig: {
        defaultProvider: 'managed_cloud',
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
      chatPreferences: {
        promptCompletionEnabled: true,
      },
      allowedDirectories: [],
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
      expect(state.llmConfig.defaultProvider).toBe('managed_cloud');
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
      expect(state.llmConfig.defaultModels.openai).toBe('gpt-5.1');
    });
  });

  describe('Window Preferences', () => {
    it('should set theme to dark', () => {
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
            moonshot: 'kimi-k2-thinking',
            managed_cloud: 'auto',
          },
          taskRouting: buildTaskRouting({
            openai: 'gpt-5.1',
            anthropic: 'claude-opus-4-5',
            google: 'gemini-3-pro',
            ollama: 'llama4-maverick',
            xai: 'grok-4.1',
            deepseek: '',
            qwen: 'qwen3-max',
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
            moonshot: 'kimi-k2-thinking',
            managed_cloud: 'auto',
          },
          taskRouting: buildTaskRouting({
            openai: 'gpt-5.1',
            anthropic: 'claude-opus-4-5',
            google: 'gemini-3-pro',
            ollama: 'llama4-maverick',
            xai: 'grok-4.1',
            deepseek: '',
            qwen: 'qwen3-max',
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
          chatPreferences: expect.any(Object),
          allowedDirectories: expect.any(Array),
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

  describe('Provider Configuration', () => {
    it('should configure Ollama provider during load', async () => {
      // Mock settings_load_from_disk (the primary method)
      vi.mocked(invoke).mockImplementation((cmd: string) => {
        if (cmd === 'settings_load_from_disk') {
          return Promise.resolve({
            llmConfig: {
              defaultProvider: 'openai' as Provider,
              temperature: 0.7,
              maxTokens: 4096,
              defaultModels: {
                openai: 'gpt-5.1',
                anthropic: 'claude-sonnet-4-5',
                google: 'gemini-3-flash',
                ollama: 'llama3',
                xai: 'grok-beta',
                deepseek: 'deepseek-chat',
                qwen: 'qwen-turbo',
                moonshot: 'moonshot-v1',
                managed_cloud: 'auto',
              },
              taskRouting: buildTaskRouting({
                openai: 'gpt-5.1',
                anthropic: 'claude-sonnet-4-5',
                google: 'gemini-3-flash',
                ollama: 'llama3',
                xai: 'grok-beta',
                deepseek: 'deepseek-chat',
                qwen: 'qwen-turbo',
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
        return Promise.resolve(undefined);
      });

      const mockClassList = {
        add: vi.fn(),
        remove: vi.fn(),
      };
      Object.defineProperty(document.documentElement, 'classList', {
        value: mockClassList,
        writable: true,
      });

      await useSettingsStore.getState().loadSettings();

      // Only Ollama should be configured (local LLM)
      expect(vi.mocked(invoke)).toHaveBeenCalledWith('llm_configure_provider', {
        provider: 'ollama',
        apiKey: null,
        baseUrl: 'http://localhost:11434',
      });
    });
  });
});
