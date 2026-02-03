// Updated for subscription-only model: Simplified defaultModels structure
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  createDefaultLLMConfig,
  createDefaultWindowPreferences,
  useSettingsStore,
} from '../settingsStore';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

type TauriInvoke = (typeof import('@tauri-apps/api/core'))['invoke'];
type InvokeMock = Mock<TauriInvoke>;

async function getInvokeMock(): Promise<InvokeMock> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke as InvokeMock;
}

describe('settingsStore', () => {
  let invokeMock: InvokeMock;

  beforeEach(async () => {
    // Reset localStorage mock
    localStorageMock.getItem.mockReturnValue(null);
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();

    // Reset Tauri invoke mock
    invokeMock = await getInvokeMock();
    invokeMock.mockReset();
    invokeMock.mockImplementation(async () => {
      return undefined;
    });

    // Reset store to defaults
    useSettingsStore.setState({
      llmConfig: createDefaultLLMConfig(),
      windowPreferences: createDefaultWindowPreferences(),
      chatPreferences: {
        promptCompletionEnabled: true,
        alwaysUseAgentMode: false,
        compactMode: true,
      },
      allowedDirectories: [],
      loading: false,
      error: null,
    });
  });

  it('should initialize with default settings', () => {
    const state = useSettingsStore.getState();

    expect(state.llmConfig.defaultProvider).toBe('managed_cloud');
    expect(state.llmConfig.temperature).toBe(0.7);
    expect(state.llmConfig.maxTokens).toBe(4096);
    expect(state.windowPreferences.theme).toBe('system');
    expect(state.windowPreferences.startupPosition).toBe('center');
    expect(state.windowPreferences.dockOnStartup).toBeNull();
  });

  it('should have simplified default models for subscription-only', () => {
    const state = useSettingsStore.getState();

    // Only managed_cloud and ollama should be present
    expect(state.llmConfig.defaultModels.managed_cloud).toBe('auto');
    expect(state.llmConfig.defaultModels.ollama).toBe('');
    expect(Object.keys(state.llmConfig.defaultModels)).toEqual(['managed_cloud', 'ollama']);
  });

  it('should have empty favorite models by default', () => {
    const state = useSettingsStore.getState();
    expect(state.llmConfig.favoriteModels).toEqual([]);
  });

  it('should update theme', () => {
    const { setTheme } = useSettingsStore.getState();

    setTheme('dark');
    expect(useSettingsStore.getState().windowPreferences.theme).toBe('dark');

    setTheme('light');
    expect(useSettingsStore.getState().windowPreferences.theme).toBe('light');
  });

  it('should set default provider', async () => {
    invokeMock.mockResolvedValue(undefined);

    const { setDefaultProvider } = useSettingsStore.getState();
    await setDefaultProvider('managed_cloud');

    expect(useSettingsStore.getState().llmConfig.defaultProvider).toBe('managed_cloud');
    expect(invokeMock).toHaveBeenCalledWith('llm_set_default_provider', {
      provider: 'managed_cloud',
    });
  });

  it('should handle provider setting errors', async () => {
    const errorMessage = 'Failed to set provider';
    invokeMock.mockRejectedValue(new Error(errorMessage));

    const { setDefaultProvider } = useSettingsStore.getState();
    await expect(setDefaultProvider('ollama')).rejects.toThrow(errorMessage);

    expect(useSettingsStore.getState().error).toBe(`Error: ${errorMessage}`);
  });

  it('should update temperature', () => {
    const { setTemperature } = useSettingsStore.getState();

    setTemperature(0.5);
    expect(useSettingsStore.getState().llmConfig.temperature).toBe(0.5);

    setTemperature(1.0);
    expect(useSettingsStore.getState().llmConfig.temperature).toBe(1.0);
  });

  it('should update max tokens', () => {
    const { setMaxTokens } = useSettingsStore.getState();

    setMaxTokens(2048);
    expect(useSettingsStore.getState().llmConfig.maxTokens).toBe(2048);
  });

  it('should set default model for managed_cloud provider', () => {
    const { setDefaultModel } = useSettingsStore.getState();

    setDefaultModel('managed_cloud', 'auto');
    expect(useSettingsStore.getState().llmConfig.defaultModels.managed_cloud).toBe('auto');
  });

  it('should set default model for ollama provider', () => {
    const { setDefaultModel } = useSettingsStore.getState();

    setDefaultModel('ollama', 'llama3');
    expect(useSettingsStore.getState().llmConfig.defaultModels.ollama).toBe('llama3');
  });

  it('should add favorite model', () => {
    const { addFavoriteModel } = useSettingsStore.getState();
    const newModel = 'managed_cloud/auto';

    addFavoriteModel(newModel);

    const favorites = useSettingsStore.getState().llmConfig.favoriteModels;
    expect(favorites).toContain(newModel);
  });

  it('should not add duplicate favorite models', () => {
    const { addFavoriteModel } = useSettingsStore.getState();
    const model = 'managed_cloud/auto';

    addFavoriteModel(model);
    const lengthAfterFirst = useSettingsStore.getState().llmConfig.favoriteModels.length;

    addFavoriteModel(model);
    const lengthAfterSecond = useSettingsStore.getState().llmConfig.favoriteModels.length;

    expect(lengthAfterFirst).toBe(lengthAfterSecond);
  });

  it('should remove favorite model', () => {
    const { addFavoriteModel, removeFavoriteModel } = useSettingsStore.getState();
    const model = 'managed_cloud/auto';

    addFavoriteModel(model);
    expect(useSettingsStore.getState().llmConfig.favoriteModels).toContain(model);

    removeFavoriteModel(model);
    expect(useSettingsStore.getState().llmConfig.favoriteModels).not.toContain(model);
  });

  it('should update startup position', () => {
    const { setStartupPosition } = useSettingsStore.getState();

    setStartupPosition('remember');
    expect(useSettingsStore.getState().windowPreferences.startupPosition).toBe('remember');

    setStartupPosition('center');
    expect(useSettingsStore.getState().windowPreferences.startupPosition).toBe('center');
  });

  it('should update dock on startup', () => {
    const { setDockOnStartup } = useSettingsStore.getState();

    setDockOnStartup('left');
    expect(useSettingsStore.getState().windowPreferences.dockOnStartup).toBe('left');

    setDockOnStartup('right');
    expect(useSettingsStore.getState().windowPreferences.dockOnStartup).toBe('right');

    setDockOnStartup(null);
    expect(useSettingsStore.getState().windowPreferences.dockOnStartup).toBeNull();
  });

  it('should save settings', async () => {
    invokeMock.mockResolvedValue(undefined);

    const { saveSettings } = useSettingsStore.getState();
    await saveSettings();

    expect(invokeMock).toHaveBeenCalledWith('settings_save', {
      settings: {
        llmConfig: expect.any(Object),
        windowPreferences: expect.any(Object),
        chatPreferences: expect.any(Object),
        allowedDirectories: expect.any(Array),
      },
    });
    expect(useSettingsStore.getState().loading).toBe(false);
  });

  it('should handle save errors', async () => {
    const errorMessage = 'Database error';
    invokeMock.mockRejectedValue(new Error(errorMessage));

    const { saveSettings } = useSettingsStore.getState();
    await expect(saveSettings()).rejects.toThrow(errorMessage);

    expect(useSettingsStore.getState().loading).toBe(false);
    expect(useSettingsStore.getState().error).toBe(`Error: ${errorMessage}`);
  });

  it('should set task routing for managed_cloud', () => {
    const { setTaskRouting } = useSettingsStore.getState();

    setTaskRouting('code', 'managed_cloud', 'auto');

    const state = useSettingsStore.getState();
    expect(state.llmConfig.taskRouting.code).toEqual({
      provider: 'managed_cloud',
      model: 'auto',
    });
  });

  it('should have all task routes default to managed_cloud', () => {
    const state = useSettingsStore.getState();
    const { taskRouting } = state.llmConfig;

    expect(taskRouting.search.provider).toBe('managed_cloud');
    expect(taskRouting.code.provider).toBe('managed_cloud');
    expect(taskRouting.docs.provider).toBe('managed_cloud');
    expect(taskRouting.chat.provider).toBe('managed_cloud');
    expect(taskRouting.vision.provider).toBe('managed_cloud');
    expect(taskRouting.image.provider).toBe('managed_cloud');
    expect(taskRouting.video.provider).toBe('managed_cloud');
  });
});
