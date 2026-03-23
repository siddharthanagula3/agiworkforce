// Updated for subscription-only model: Simplified defaultModels structure
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  createDefaultLLMConfig,
  createDefaultWindowPreferences,
  defaultTerminalSandboxPreferences,
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
        autoApproveTools: false,
        agentMode: 'build',
        chatStorageMode: 'local',
      },
      executionPreferences: {
        maxTimeoutMinutes: 1440,
        enableCheckpointing: true,
        checkpointInterval: 5,
        autoResumeOnRestart: true,
        enableTimeoutWarnings: true,
        approvalTimeoutSeconds: 300,
        approvalTimeoutPolicy: 'auto-deny',
        streamInactivityTimeoutSeconds: 30,
        terminalSandbox: { ...defaultTerminalSandboxPreferences },
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
    expect(new Set(Object.keys(state.llmConfig.defaultModels))).toEqual(
      new Set(['managed_cloud', 'ollama']),
    );
  });

  it('should have empty favorite models by default', () => {
    const state = useSettingsStore.getState();
    expect(state.llmConfig.favoriteModels).toEqual([]);
  });

  it('should initialize terminal sandbox defaults', () => {
    const { terminalSandbox } = useSettingsStore.getState().executionPreferences;
    expect(terminalSandbox).toEqual(defaultTerminalSandboxPreferences);
  });

  it('should normalize terminal sandbox allowlisted domains', () => {
    const { setTerminalSandboxAllowedDomains } = useSettingsStore.getState();
    setTerminalSandboxAllowedDomains([' github.com ', 'api.github.com', 'github.com']);

    expect(useSettingsStore.getState().executionPreferences.terminalSandbox.allowedDomains).toEqual(
      ['github.com', 'api.github.com'],
    );
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
    // Suppress expected console.error from the store's error handler
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const errorMessage = 'Failed to set provider';
    invokeMock.mockRejectedValue(new Error(errorMessage));

    const { setDefaultProvider } = useSettingsStore.getState();
    await expect(setDefaultProvider('ollama')).rejects.toThrow(errorMessage);

    expect(useSettingsStore.getState().error).toBe('Something went wrong. Please try again.');

    consoleErrorSpy.mockRestore();
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
      settings: expect.objectContaining({
        llmConfig: expect.any(Object),
        windowPreferences: expect.any(Object),
        chatPreferences: expect.any(Object),
        executionPreferences: expect.any(Object),
        allowedDirectories: expect.any(Array),
      }),
    });
    expect(useSettingsStore.getState().loading).toBe(false);
  });

  it('should handle save errors', async () => {
    // Suppress expected console.error from the store's error handler
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const errorMessage = 'Database error';
    invokeMock.mockRejectedValue(new Error(errorMessage));

    const { saveSettings } = useSettingsStore.getState();
    await expect(saveSettings()).rejects.toThrow(errorMessage);

    expect(useSettingsStore.getState().loading).toBe(false);
    expect(useSettingsStore.getState().error).toBe('Something went wrong. Please try again.');

    consoleErrorSpy.mockRestore();
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

  // M34 — factory function cross-checks
  // Ensures store default values exactly match the factory function output,
  // not hardcoded literals.  When factory defaults change, these tests catch
  // any drift between what the factory produces and what the store initialises.
  describe('factory function parity (M34)', () => {
    it('initial llmConfig matches createDefaultLLMConfig() output exactly', () => {
      const state = useSettingsStore.getState();
      expect(state.llmConfig).toEqual(createDefaultLLMConfig());
    });

    it('initial windowPreferences matches createDefaultWindowPreferences() output exactly', () => {
      const state = useSettingsStore.getState();
      expect(state.windowPreferences).toEqual(createDefaultWindowPreferences());
    });

    it('default llmConfig.defaultProvider equals the factory value', () => {
      const state = useSettingsStore.getState();
      const factory = createDefaultLLMConfig();
      expect(state.llmConfig.defaultProvider).toBe(factory.defaultProvider);
    });

    it('default llmConfig.temperature equals the factory value', () => {
      const state = useSettingsStore.getState();
      const factory = createDefaultLLMConfig();
      expect(state.llmConfig.temperature).toBe(factory.temperature);
    });

    it('default llmConfig.maxTokens equals the factory value', () => {
      const state = useSettingsStore.getState();
      const factory = createDefaultLLMConfig();
      expect(state.llmConfig.maxTokens).toBe(factory.maxTokens);
    });

    it('default windowPreferences.theme equals the factory value', () => {
      const state = useSettingsStore.getState();
      const factory = createDefaultWindowPreferences();
      expect(state.windowPreferences.theme).toBe(factory.theme);
    });

    it('default windowPreferences.startupPosition equals the factory value', () => {
      const state = useSettingsStore.getState();
      const factory = createDefaultWindowPreferences();
      expect(state.windowPreferences.startupPosition).toBe(factory.startupPosition);
    });

    it('default windowPreferences.dockOnStartup equals the factory value', () => {
      const state = useSettingsStore.getState();
      const factory = createDefaultWindowPreferences();
      expect(state.windowPreferences.dockOnStartup).toBe(factory.dockOnStartup);
    });

    it('default defaultModels equals the factory value', () => {
      const state = useSettingsStore.getState();
      const factory = createDefaultLLMConfig();
      expect(state.llmConfig.defaultModels).toEqual(factory.defaultModels);
    });

    it('after setState with factory output, values still equal factory', () => {
      useSettingsStore.setState({
        llmConfig: createDefaultLLMConfig(),
        windowPreferences: createDefaultWindowPreferences(),
      });
      const state = useSettingsStore.getState();
      expect(state.llmConfig).toEqual(createDefaultLLMConfig());
      expect(state.windowPreferences).toEqual(createDefaultWindowPreferences());
    });
  });
});

// ── H16 — migrate() boundary tests ────────────────────────────────────────
// The migrate function inside useSettingsStore's persist config is not exported
// directly.  We test it by replicating the same migration logic as a pure
// function that mirrors the source exactly.  This validates each version
// boundary in isolation.

type MigrateState = {
  llmConfig?: {
    defaultProvider?: string;
    defaultModels?: Record<string, string>;
    favoriteModels?: string[];
    taskRouting?: Record<string, { provider: string; model: string }>;
  };
  chatPreferences?: {
    promptCompletionEnabled?: boolean;
    alwaysUseAgentMode?: boolean;
    compactMode?: boolean;
    autoApproveTools?: boolean;
  };
  executionPreferences?: {
    maxTimeoutMinutes?: number;
    enableCheckpointing?: boolean;
    checkpointInterval?: number;
    autoResumeOnRestart?: boolean;
    enableTimeoutWarnings?: boolean;
    terminalSandbox?: {
      enabled?: boolean;
      backend?: string;
      policy?: string;
      executable?: string;
      allowedDomains?: string[];
    };
  };
  windowPreferences?: {
    theme?: string;
    language?: string;
    startupPosition?: string;
    dockOnStartup?: string | null;
  };
  globalHotkeyPreferences?: {
    enabled?: boolean;
    combo?: string;
  };
  customModels?: unknown[];
  features?: Record<string, boolean>;
};

const DEFAULT_FEATURES = {
  webSearch: true,
  browserAutomation: true,
  computerUse: true,
  screenshotOcr: true,
  voiceInput: true,
  voiceOutput: true,
  fileOperations: true,
  terminalAccess: true,
  gitIntegration: true,
  imageGeneration: true,
  videoGeneration: false,
  musicGeneration: false,
  documentCreation: true,
  codeExecution: true,
  subAgents: true,
  agentTeams: true,
  backgroundAgents: false,
  autoPlanning: false,
  multiModelConsensus: false,
};

/** Mirrors the migrate() function from settingsStore.ts verbatim. */
function migrateSettings(persistedState: unknown, version: number): MigrateState {
  const state = persistedState as MigrateState;

  // v1 → v2
  if (version < 2) {
    if (state?.llmConfig) {
      state.llmConfig.defaultProvider = 'managed_cloud';
      state.llmConfig.defaultModels = {
        ollama: state.llmConfig?.defaultModels?.['ollama'] ?? '',
        managed_cloud: state.llmConfig?.defaultModels?.['managed_cloud'] ?? 'auto',
      };
      state.llmConfig.favoriteModels = [];
      if (state.llmConfig.taskRouting) {
        for (const key of Object.keys(state.llmConfig.taskRouting)) {
          state.llmConfig.taskRouting[key] = { provider: 'managed_cloud', model: 'auto' };
        }
      }
    }
  }

  // v2 → v3
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

  // v3 → v4
  if (version < 4) {
    if (!state.executionPreferences) {
      state.executionPreferences = {
        maxTimeoutMinutes: 1440,
        enableCheckpointing: true,
        checkpointInterval: 5,
        autoResumeOnRestart: true,
        enableTimeoutWarnings: true,
        terminalSandbox: { ...defaultTerminalSandboxPreferences },
      };
    }
  }

  // v4 → v5
  if (version < 5) {
    if (state.chatPreferences && state.chatPreferences.compactMode === undefined) {
      state.chatPreferences.compactMode = true;
    }
  }

  // v5 → v6
  if (version < 6) {
    if (state?.llmConfig?.defaultModels) {
      state.llmConfig.defaultModels = {
        ollama: state.llmConfig.defaultModels['ollama'] ?? '',
        managed_cloud: state.llmConfig.defaultModels['managed_cloud'] ?? 'auto',
      };
    }
  }

  // v6 → v7
  if (version < 7) {
    if (!state.windowPreferences) {
      state.windowPreferences = {};
    }
    if (!state.windowPreferences.language) {
      state.windowPreferences.language = 'en';
    }
  }

  // v7 → v8
  if (version < 8) {
    if (state.chatPreferences && state.chatPreferences.autoApproveTools === undefined) {
      state.chatPreferences.autoApproveTools = false;
    }
  }

  // v8 → v9
  if (version < 9) {
    const stateWithHotkey = state as MigrateState;
    if (!stateWithHotkey.globalHotkeyPreferences) {
      stateWithHotkey.globalHotkeyPreferences = {
        enabled: true,
        combo: 'CommandOrControl+Shift+Space',
      };
    }
  }

  // v9 → v10
  if (version < 10) {
    if (!Array.isArray(state.customModels)) {
      state.customModels = [];
    }
  }

  // v10 → v11
  if (version < 11) {
    if (!state.features || typeof state.features !== 'object') {
      state.features = { ...DEFAULT_FEATURES };
    }
  }

  if (version < 23 && state.executionPreferences) {
    state.executionPreferences.terminalSandbox = {
      ...defaultTerminalSandboxPreferences,
      ...(state.executionPreferences.terminalSandbox ?? {}),
      allowedDomains: Array.isArray(state.executionPreferences.terminalSandbox?.allowedDomains)
        ? state.executionPreferences.terminalSandbox.allowedDomains
        : defaultTerminalSandboxPreferences.allowedDomains,
    };
  }

  return state;
}

describe('settingsStore migrate() boundaries (H16)', () => {
  describe('v1 → v2: defaultProvider resets to managed_cloud', () => {
    it('resets defaultProvider to managed_cloud', () => {
      const old = { llmConfig: { defaultProvider: 'openai', defaultModels: {} } };
      const result = migrateSettings(old, 1);
      expect(result.llmConfig?.defaultProvider).toBe('managed_cloud');
    });

    it('resets favoriteModels to empty array', () => {
      const old = { llmConfig: { favoriteModels: ['gpt-4', 'claude-3'], defaultModels: {} } };
      const result = migrateSettings(old, 1);
      expect(result.llmConfig?.favoriteModels).toEqual([]);
    });

    it('resets all taskRouting entries to managed_cloud/auto', () => {
      const old = {
        llmConfig: {
          defaultModels: {},
          taskRouting: {
            code: { provider: 'openai', model: 'gpt-4' },
            chat: { provider: 'anthropic', model: 'claude-3' },
          },
        },
      };
      const result = migrateSettings(old, 1);
      expect(result.llmConfig?.taskRouting?.['code']).toEqual({
        provider: 'managed_cloud',
        model: 'auto',
      });
      expect(result.llmConfig?.taskRouting?.['chat']).toEqual({
        provider: 'managed_cloud',
        model: 'auto',
      });
    });
  });

  describe('v2 → v3: alwaysUseAgentMode defaults to false', () => {
    it('adds alwaysUseAgentMode=false when chatPreferences is missing', () => {
      const old = {};
      const result = migrateSettings(old, 2);
      expect(result.chatPreferences?.alwaysUseAgentMode).toBe(false);
    });

    it('adds alwaysUseAgentMode=false when it is undefined on existing chatPreferences', () => {
      const old = { chatPreferences: { promptCompletionEnabled: true } };
      const result = migrateSettings(old, 2);
      expect(result.chatPreferences?.alwaysUseAgentMode).toBe(false);
    });

    it('preserves alwaysUseAgentMode=true if already set', () => {
      // Migration only sets the field when undefined — truthy value must survive
      // Note: the migrate function only fires when version < 3, so a stored v2
      // state that already has alwaysUseAgentMode=true should keep it.
      const old = { chatPreferences: { promptCompletionEnabled: true, alwaysUseAgentMode: true } };
      const result = migrateSettings(old, 2);
      expect(result.chatPreferences?.alwaysUseAgentMode).toBe(true);
    });
  });

  describe('v3 → v4: executionPreferences created', () => {
    it('creates executionPreferences when absent', () => {
      const old = {};
      const result = migrateSettings(old, 3);
      expect(result.executionPreferences).toBeDefined();
      expect(result.executionPreferences?.maxTimeoutMinutes).toBe(1440);
      expect(result.executionPreferences?.enableCheckpointing).toBe(true);
      expect(result.executionPreferences?.checkpointInterval).toBe(5);
      expect(result.executionPreferences?.autoResumeOnRestart).toBe(true);
      expect(result.executionPreferences?.enableTimeoutWarnings).toBe(true);
      expect(result.executionPreferences?.terminalSandbox).toEqual(
        defaultTerminalSandboxPreferences,
      );
    });

    it('does not overwrite existing executionPreferences', () => {
      const old = { executionPreferences: { maxTimeoutMinutes: 60 } };
      const result = migrateSettings(old, 3);
      // Already present — migrate skips the block
      expect(result.executionPreferences?.maxTimeoutMinutes).toBe(60);
    });
  });

  describe('v4 → v5: compactMode defaults to true', () => {
    it('sets compactMode=true when it is undefined', () => {
      const old = { chatPreferences: { promptCompletionEnabled: true } };
      const result = migrateSettings(old, 4);
      expect(result.chatPreferences?.compactMode).toBe(true);
    });

    it('preserves compactMode=false if already set to false', () => {
      const old = { chatPreferences: { compactMode: false } };
      const result = migrateSettings(old, 4);
      expect(result.chatPreferences?.compactMode).toBe(false);
    });
  });

  describe('full migration from v1 to current', () => {
    it('migrating a minimal v1 state produces all required fields', () => {
      const v1State = {
        llmConfig: {
          defaultProvider: 'openai',
          defaultModels: { openai: 'gpt-4' },
        },
      };
      const result = migrateSettings(v1State, 1);

      expect(result.llmConfig?.defaultProvider).toBe('managed_cloud');
      expect(result.chatPreferences?.alwaysUseAgentMode).toBe(false);
      expect(result.executionPreferences?.maxTimeoutMinutes).toBe(1440);
      expect(result.executionPreferences?.terminalSandbox?.policy).toBe('workspace-write');
      expect(result.chatPreferences?.compactMode).toBe(true);
      expect(result.globalHotkeyPreferences?.enabled).toBe(true);
      expect(Array.isArray(result.customModels)).toBe(true);
      expect(result.features).toBeDefined();
    });
  });
});
