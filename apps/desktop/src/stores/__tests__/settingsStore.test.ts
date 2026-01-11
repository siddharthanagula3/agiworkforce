// Updated Jan 11, 2026: Fixed test to match current settingsStore structure
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
      chatPreferences: { promptCompletionEnabled: true },
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
    await setDefaultProvider('openai');

    expect(useSettingsStore.getState().llmConfig.defaultProvider).toBe('openai');
    expect(invokeMock).toHaveBeenCalledWith('llm_set_default_provider', { provider: 'openai' });
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

  it('should set default model for provider', () => {
    const { setDefaultModel } = useSettingsStore.getState();

    setDefaultModel('openai', 'gpt-5.1-thinking');
    expect(useSettingsStore.getState().llmConfig.defaultModels.openai).toBe('gpt-5.1-thinking');

    setDefaultModel('anthropic', 'claude-opus-4-5');
    expect(useSettingsStore.getState().llmConfig.defaultModels.anthropic).toBe('claude-opus-4-5');
  });

  it('should add favorite model', () => {
    const { addFavoriteModel } = useSettingsStore.getState();
    const initialFavorites = useSettingsStore.getState().llmConfig.favoriteModels;
    const newModel = 'openai/gpt-5.1-thinking';

    addFavoriteModel(newModel);

    const favorites = useSettingsStore.getState().llmConfig.favoriteModels;
    expect(favorites.length).toBeGreaterThanOrEqual(initialFavorites.length);
    expect(favorites).toContain(newModel);
  });

  it('should not add duplicate favorite models', () => {
    const { addFavoriteModel } = useSettingsStore.getState();
    const model = 'openai/gpt-5.1';

    addFavoriteModel(model);
    const lengthAfterFirst = useSettingsStore.getState().llmConfig.favoriteModels.length;

    addFavoriteModel(model);
    const lengthAfterSecond = useSettingsStore.getState().llmConfig.favoriteModels.length;

    expect(lengthAfterFirst).toBe(lengthAfterSecond);
  });

  it('should remove favorite model', () => {
    const { removeFavoriteModel } = useSettingsStore.getState();
    const favorites = useSettingsStore.getState().llmConfig.favoriteModels;
    const modelToRemove = favorites[0];

    expect(modelToRemove).toBeDefined();
    removeFavoriteModel(modelToRemove!);

    const updatedFavorites = useSettingsStore.getState().llmConfig.favoriteModels;
    expect(updatedFavorites).not.toContain(modelToRemove);
    expect(updatedFavorites.length).toBe(favorites.length - 1);
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
});
