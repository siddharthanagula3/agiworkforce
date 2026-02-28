import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke, isTauriContext } from '../../lib/tauri-mock';
import {
  enforceTaskRoutingTierRestriction,
  isTaskRoutingModelAllowedForTier,
  useSettingsStore,
  type Provider,
} from '../../stores/settingsStore';

vi.mock('../../lib/tauri-mock', () => ({
  invoke: vi.fn(),
  isTauriContext: vi.fn(),
}));

// Simplified taskRouting for subscription-only model
const buildTaskRouting = () => ({
  search: { provider: 'managed_cloud' as Provider, model: 'auto' },
  code: { provider: 'managed_cloud' as Provider, model: 'auto' },
  docs: { provider: 'managed_cloud' as Provider, model: 'auto' },
  chat: { provider: 'managed_cloud' as Provider, model: 'auto' },
  vision: { provider: 'managed_cloud' as Provider, model: 'auto' },
  image: { provider: 'managed_cloud' as Provider, model: 'auto' },
  video: { provider: 'managed_cloud' as Provider, model: 'auto' },
});

describe('settingsStore', () => {
  beforeEach(() => {
    // Simplified defaultModels for subscription-only model
    const defaultModels = {
      managed_cloud: 'auto',
      ollama: '',
    };

    useSettingsStore.setState({
      llmConfig: {
        defaultProvider: 'managed_cloud',
        temperature: 0.7,
        maxTokens: 4096,
        defaultModels,
        taskRouting: buildTaskRouting(),
        favoriteModels: [],
      },
      windowPreferences: {
        theme: 'system',
        language: 'en',
        startupPosition: 'center',
        dockOnStartup: null,
      },
      chatPreferences: {
        promptCompletionEnabled: true,
        alwaysUseAgentMode: false,
        compactMode: true,
        autoApproveTools: false,
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

    it('should have correct default models (subscription-only)', () => {
      const state = useSettingsStore.getState();
      expect(state.llmConfig.defaultModels.managed_cloud).toBe('auto');
      expect(state.llmConfig.defaultModels.ollama).toBe('');
    });

    it('should have empty favorite models by default', () => {
      const state = useSettingsStore.getState();
      expect(state.llmConfig.favoriteModels).toEqual([]);
    });
  });

  describe('LLM Configuration', () => {
    it('should set default provider', async () => {
      await useSettingsStore.getState().setDefaultProvider('managed_cloud');

      expect(vi.mocked(invoke)).toHaveBeenCalledWith('llm_set_default_provider', {
        provider: 'managed_cloud',
      });

      const state = useSettingsStore.getState();
      expect(state.llmConfig.defaultProvider).toBe('managed_cloud');
    });

    it('should handle set default provider error', async () => {
      vi.mocked(invoke).mockImplementation(() => {
        throw new Error('Provider error');
      });

      await expect(useSettingsStore.getState().setDefaultProvider('ollama')).rejects.toThrow();

      const state = useSettingsStore.getState();
      expect(state.error).toBe('Something went wrong. Please try again.');
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

    it('should set default model for managed_cloud provider', () => {
      useSettingsStore.getState().setDefaultModel('managed_cloud', 'auto');

      const state = useSettingsStore.getState();
      expect(state.llmConfig.defaultModels.managed_cloud).toBe('auto');
    });

    it('should set default model for ollama provider', () => {
      useSettingsStore.getState().setDefaultModel('ollama', 'llama3');

      const state = useSettingsStore.getState();
      expect(state.llmConfig.defaultModels.ollama).toBe('llama3');
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
          language: 'en',
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
          defaultProvider: 'managed_cloud' as Provider,
          temperature: 0.8,
          maxTokens: 8192,
          defaultModels: {
            managed_cloud: 'auto',
            ollama: 'llama3',
          },
          taskRouting: buildTaskRouting(),
          favoriteModels: [],
        },
        windowPreferences: {
          theme: 'dark' as const,
          startupPosition: 'remember' as const,
          dockOnStartup: 'left' as const,
        },
        allowedDirectories: [],
      };

      // Mock isTauriContext to return true so loadSettings executes the Tauri code path
      vi.mocked(isTauriContext).mockReturnValue(true);

      vi.mocked(invoke).mockImplementation((cmd: string) => {
        if (cmd === 'settings_load_from_disk') return Promise.resolve(mockSettings);
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
      expect(state.llmConfig.defaultProvider).toBe('managed_cloud');
      expect(state.llmConfig.temperature).toBe(0.8);
      expect(state.llmConfig.maxTokens).toBe(8192);
      expect(state.windowPreferences.theme).toBe('dark');
      expect(state.windowPreferences.dockOnStartup).toBe('left');
      expect(state.loading).toBe(false);
    });

    it('should handle settings load error', async () => {
      // Mock isTauriContext to return true so loadSettings executes the Tauri code path
      vi.mocked(isTauriContext).mockReturnValue(true);
      vi.mocked(invoke).mockRejectedValue(new Error('Load failed'));

      await useSettingsStore.getState().loadSettings();

      const state = useSettingsStore.getState();
      expect(state.error).toBe('Something went wrong. Please try again.');
      expect(state.loading).toBe(false);
    });

    it('should save settings to backend', async () => {
      useSettingsStore.setState({
        llmConfig: {
          defaultProvider: 'managed_cloud',
          temperature: 0.8,
          maxTokens: 8192,
          defaultModels: {
            managed_cloud: 'auto',
            ollama: 'llama3',
          },
          taskRouting: buildTaskRouting(),
          favoriteModels: [],
        },
        windowPreferences: {
          theme: 'dark',
          language: 'en',
          startupPosition: 'remember',
          dockOnStartup: 'left',
        },
      });

      vi.mocked(invoke).mockResolvedValue(undefined);

      await useSettingsStore.getState().saveSettings();

      expect(vi.mocked(invoke)).toHaveBeenCalledWith('settings_save', {
        settings: expect.objectContaining({
          llmConfig: expect.any(Object),
          windowPreferences: expect.any(Object),
          chatPreferences: expect.any(Object),
          executionPreferences: expect.any(Object),
          allowedDirectories: expect.any(Array),
        }),
      });

      const state = useSettingsStore.getState();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should handle settings save error', async () => {
      vi.mocked(invoke).mockRejectedValue(new Error('Save failed'));

      await expect(useSettingsStore.getState().saveSettings()).rejects.toThrow();

      const state = useSettingsStore.getState();
      expect(state.error).toBe('Something went wrong. Please try again.');
      expect(state.loading).toBe(false);
    });
  });

  describe('Provider Configuration', () => {
    it('should configure Ollama provider during load', async () => {
      // Mock isTauriContext to return true so loadSettings executes the Tauri code path
      vi.mocked(isTauriContext).mockReturnValue(true);

      // Mock settings_load_from_disk (the primary method)
      vi.mocked(invoke).mockImplementation((cmd: string) => {
        if (cmd === 'settings_load_from_disk') {
          return Promise.resolve({
            llmConfig: {
              defaultProvider: 'managed_cloud' as Provider,
              temperature: 0.7,
              maxTokens: 4096,
              defaultModels: {
                managed_cloud: 'auto',
                ollama: 'llama3',
              },
              taskRouting: buildTaskRouting(),
              favoriteModels: [],
            },
            windowPreferences: {
              theme: 'system' as const,
              startupPosition: 'center' as const,
              dockOnStartup: null,
            },
            allowedDirectories: [],
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

  describe('Task Routing', () => {
    it('should set task routing for a category', () => {
      useSettingsStore.getState().setTaskRouting('code', 'managed_cloud', 'auto');

      const state = useSettingsStore.getState();
      expect(state.llmConfig.taskRouting.code).toEqual({
        provider: 'managed_cloud',
        model: 'auto',
      });
    });

    it('should preserve other task routing when updating one', () => {
      useSettingsStore.getState().setTaskRouting('search', 'managed_cloud', 'auto');

      const state = useSettingsStore.getState();
      expect(state.llmConfig.taskRouting.search).toEqual({
        provider: 'managed_cloud',
        model: 'auto',
      });
      expect(state.llmConfig.taskRouting.code).toEqual({
        provider: 'managed_cloud',
        model: 'auto',
      });
    });

    it('should block hobby tier from selecting higher-tier routed models', () => {
      expect(isTaskRoutingModelAllowedForTier('code', 'gpt-5.2-codex-low', 'hobby')).toBe(false);
      expect(isTaskRoutingModelAllowedForTier('code', 'gpt-5.2-codex-low', 'pro')).toBe(true);
      expect(isTaskRoutingModelAllowedForTier('code', 'auto-balanced', 'hobby')).toBe(false);
      expect(isTaskRoutingModelAllowedForTier('code', 'auto-balanced', 'pro')).toBe(true);
      expect(isTaskRoutingModelAllowedForTier('image', 'dall-e-3', 'hobby')).toBe(true);
    });

    it('should downgrade disallowed hobby-tier task routing models back to auto', () => {
      useSettingsStore.getState().setTaskRouting('code', 'managed_cloud', 'gpt-5.2-codex-low');
      useSettingsStore.getState().setTaskRouting('search', 'managed_cloud', 'auto-balanced');

      enforceTaskRoutingTierRestriction('hobby');

      const state = useSettingsStore.getState();
      expect(state.llmConfig.taskRouting.code).toEqual({
        provider: 'managed_cloud',
        model: 'auto',
      });
      expect(state.llmConfig.taskRouting.search).toEqual({
        provider: 'managed_cloud',
        model: 'auto',
      });
    });
  });
});
