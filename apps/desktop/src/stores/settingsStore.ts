import { invoke, isTauriContext } from '../lib/tauri-mock';
import { McpClient } from '../api/mcp';
import { getTimeoutConfig, setTimeoutConfig, minutesToSeconds } from '../api/timeout';
import { configureMemoryInjection } from '../api/memory';
import { getSimpleErrorMessage } from '../lib/errorMessages';
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { storageFallback } from '../lib/storageFallback';
import {
  getAllowedAutoModesForTier,
  getModelMetadata,
  isModelAllowedForTier,
  normalizeModelId,
  normalizeSubscriptionTier,
} from '../constants/llm';

import type { Provider } from '../types/provider';
import type { CustomModelConfig } from '@agiworkforce/types';
import type { SubscriptionTier } from '../constants/planModels';
export type { Provider };
import { applyTheme, clearAppliedTheme, getThemeById } from '../themes/index';
import { useUnifiedAuthStore } from './auth';
import type { AgentMode, ChatPreferences } from './settings/chatPrefs';
export type { AgentMode, ChatPreferences };
// Absorbed sub-stores are re-exported from ./settings/ sub-directory.

export type Theme = 'light' | 'dark' | 'system' | string;
export type ChatFont = 'default' | 'sans' | 'mono' | 'dyslexic';
export type Language =
  | 'en'
  | 'es'
  | 'zh'
  | 'ja'
  | 'ko'
  | 'fr'
  | 'de'
  | 'pt'
  | 'it'
  | 'ru'
  | 'ar'
  | 'hi';

export type TaskCategory = 'search' | 'code' | 'docs' | 'chat' | 'vision' | 'image' | 'video';

export type EmojiUsage = 'never' | 'sometimes' | 'often';

export interface PersonalizationPreferences {
  name: string;
  occupation: string;
  bio: string;
  formality: number;
  warmth: number;
  detail: number;
  emojiUsage: EmojiUsage;
}

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
    ollama: string;
    managed_cloud: string;
  };
  taskRouting: TaskRouting;
  favoriteModels: string[];
  providerMode: 'auto' | 'local' | 'cloud';
  ollamaUrl: string;
  lmstudioUrl: string;
  llamacppUrl: string;
  vllmUrl: string;
}

interface WindowPreferences {
  theme: Theme;
  language: Language;
  startupPosition: 'center' | 'remember';
  dockOnStartup: 'left' | 'right' | null;
  selectedTheme?: string;
  dyslexicFont?: boolean;
  chatFont?: ChatFont;
  uiScale?: 90 | 100 | 110;
  reduceMotion?: boolean;
}

type NativeSettingsPayload = {
  llmConfig?: Partial<LLMConfig> & {
    defaultModels?: Partial<LLMConfig['defaultModels']>;
    taskRouting?: Partial<TaskRouting>;
  };
  windowPreferences?: Partial<WindowPreferences>;
  chatPreferences?: Partial<ChatPreferences>;
  executionPreferences?: Partial<ExecutionPreferences> & {
    terminalSandbox?: Partial<TerminalSandboxPreferences>;
  };
  globalHotkeyPreferences?: Partial<GlobalHotkeyPreferences>;
  allowedDirectories?: string[];
  customModels?: CustomModelConfig[];
  featureFlags?: Record<string, boolean>;
  personalization?: Partial<PersonalizationPreferences>;
  customKeybindings?: Record<string, string>;
};

// ChatPreferences and AgentMode are defined in ./settings/chatPrefs and re-exported above.

export type ApprovalTimeoutPolicy = 'auto-deny' | 'auto-approve' | 'pause';

export type TerminalSandboxPolicy = 'danger-full-access' | 'read-only' | 'workspace-write';
export type TerminalSandboxBackend = 'none' | 'srt';

export interface TerminalSandboxPreferences {
  enabled: boolean;
  backend: TerminalSandboxBackend;
  policy: TerminalSandboxPolicy;
  executable: string;
  allowedDomains: string[];
}

export interface ExecutionPreferences {
  maxTimeoutMinutes: number;
  enableCheckpointing: boolean;
  checkpointInterval: number;
  autoResumeOnRestart: boolean;
  enableTimeoutWarnings: boolean;
  approvalTimeoutSeconds: number;
  approvalTimeoutPolicy: ApprovalTimeoutPolicy;
  streamInactivityTimeoutSeconds: number;
  showComputerUseOverlay: boolean;
  terminalSandbox: TerminalSandboxPreferences;
}

export interface GlobalHotkeyPreferences {
  enabled: boolean;
  combo: string;
}

const FALLBACK_GLOBAL_HOTKEY_COMBO = 'CommandOrControl+Shift+Space';

export function getDefaultGlobalHotkeyCombo(): string {
  if (typeof navigator === 'undefined') {
    return FALLBACK_GLOBAL_HOTKEY_COMBO;
  }

  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = (nav.userAgentData?.platform || navigator.platform || '').toLowerCase();

  if (platform.includes('mac')) {
    return 'Command+Shift+Space';
  }
  if (platform.includes('win')) {
    return 'Control+Shift+Space';
  }

  return FALLBACK_GLOBAL_HOTKEY_COMBO;
}

interface SettingsState {
  llmConfig: LLMConfig;
  windowPreferences: WindowPreferences;
  chatPreferences: ChatPreferences;
  executionPreferences: ExecutionPreferences;
  globalHotkeyPreferences: GlobalHotkeyPreferences;
  personalization: PersonalizationPreferences;
  allowedDirectories: string[];
  customModels: CustomModelConfig[];
  customKeybindings: Record<string, string>;
  loading: boolean;
  error: string | null;

  addCustomModel: (config: CustomModelConfig) => void;
  updateCustomModel: (id: string, config: CustomModelConfig) => void;
  removeCustomModel: (id: string) => void;

  setDefaultProvider: (provider: Provider) => Promise<void>;
  setTemperature: (temperature: number) => void;
  setMaxTokens: (maxTokens: number) => void;
  setDefaultModel: (provider: Provider, model: string) => void;
  setTaskRouting: (category: TaskCategory, provider: Provider, model: string) => void;
  setFavoriteModels: (models: string[]) => void;
  addFavoriteModel: (model: string) => void;
  removeFavoriteModel: (model: string) => void;
  setProviderMode: (mode: 'auto' | 'local' | 'cloud') => void;
  setOllamaUrl: (url: string) => void;
  setLmStudioUrl: (url: string) => void;
  setLlamaCppUrl: (url: string) => void;
  setVllmUrl: (url: string) => void;

  setTheme: (theme: Theme) => void;
  setSelectedTheme: (themeId: string | undefined) => void;
  setDyslexicFont: (enabled: boolean) => void;
  setChatFont: (font: ChatFont) => void;
  setUiScale: (scale: 90 | 100 | 110) => void;
  setReduceMotion: (enabled: boolean) => void;
  setLanguage: (language: Language) => void;
  setStartupPosition: (position: 'center' | 'remember') => void;
  setDockOnStartup: (dock: 'left' | 'right' | null) => void;

  setPromptCompletionEnabled: (enabled: boolean) => void;
  setAlwaysUseAgentMode: (enabled: boolean) => void;
  setCompactMode: (enabled: boolean) => void;
  setTemporaryChat: (enabled: boolean) => void;
  setSendShortcut: (shortcut: 'enter' | 'mod-enter') => void;
  setAutoApproveTools: (enabled: boolean) => Promise<void>;
  setAutoInjectSkills: (enabled: boolean) => void;
  setAutoSaveMemories: (enabled: boolean) => Promise<void>;
  setMemoryEnabled: (enabled: boolean) => Promise<void>;
  setAllowToolAssistedMemoryGeneration: (enabled: boolean) => Promise<void>;
  setAgentMode: (mode: AgentMode) => Promise<void>;
  setChatStorageMode: (mode: 'local' | 'cloud') => void;

  setMaxTimeoutMinutes: (minutes: number) => void;
  setEnableCheckpointing: (enabled: boolean) => void;
  setCheckpointInterval: (interval: number) => void;
  setAutoResumeOnRestart: (enabled: boolean) => void;
  setEnableTimeoutWarnings: (enabled: boolean) => void;
  setApprovalTimeoutSeconds: (seconds: number) => void;
  setApprovalTimeoutPolicy: (policy: ApprovalTimeoutPolicy) => void;
  setStreamInactivityTimeoutSeconds: (seconds: number) => void;
  setShowComputerUseOverlay: (show: boolean) => void;
  setTerminalSandboxEnabled: (enabled: boolean) => void;
  setTerminalSandboxBackend: (backend: TerminalSandboxBackend) => void;
  setTerminalSandboxPolicy: (policy: TerminalSandboxPolicy) => void;
  setTerminalSandboxExecutable: (executable: string) => void;
  setTerminalSandboxAllowedDomains: (domains: string[]) => void;

  setPersonalization: (updates: Partial<PersonalizationPreferences>) => void;

  setGlobalHotkeyEnabled: (enabled: boolean) => void;
  setGlobalHotkeyCombo: (combo: string) => void;

  setCustomKeybinding: (id: string, combo: string) => void;
  resetCustomKeybinding: (id: string) => void;
  resetAllCustomKeybindings: () => void;

  addAllowedDirectory: (path: string) => void;
  removeAllowedDirectory: (path: string) => void;
  setAllowedDirectories: (paths: string[]) => void;

  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;

  features: Record<string, boolean>;
  setFeature: (key: string, enabled: boolean) => void;

  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}

const defaultPersonalization: PersonalizationPreferences = {
  name: '',
  occupation: '',
  bio: '',
  formality: 3,
  warmth: 3,
  detail: 3,
  emojiUsage: 'sometimes',
};

export const defaultTerminalSandboxPreferences: TerminalSandboxPreferences = {
  enabled: false,
  backend: 'srt',
  policy: 'workspace-write',
  executable: 'srt',
  allowedDomains: [],
};

const defaultSettings: Pick<
  SettingsState,
  | 'llmConfig'
  | 'windowPreferences'
  | 'chatPreferences'
  | 'executionPreferences'
  | 'globalHotkeyPreferences'
  | 'personalization'
  | 'allowedDirectories'
  | 'customModels'
  | 'customKeybindings'
  | 'features'
> = {
  llmConfig: {
    defaultProvider: 'managed_cloud',
    temperature: 0.7,
    maxTokens: 4096,
    defaultModels: {
      ollama: '',
      managed_cloud: 'auto',
    },
    favoriteModels: [],
    providerMode: 'auto' as const,
    ollamaUrl: 'http://localhost:11434',
    lmstudioUrl: 'http://localhost:1234/v1',
    llamacppUrl: 'http://localhost:8080/v1',
    vllmUrl: 'http://localhost:8000/v1',
    taskRouting: {
      search: { provider: 'managed_cloud', model: 'auto' },
      code: { provider: 'managed_cloud', model: 'auto' },
      docs: { provider: 'managed_cloud', model: 'auto' },
      chat: { provider: 'managed_cloud', model: 'auto' },
      vision: { provider: 'managed_cloud', model: 'auto' },
      image: { provider: 'managed_cloud', model: 'auto' },
      video: { provider: 'managed_cloud', model: 'auto' },
    },
  },
  windowPreferences: {
    theme: 'system',
    language: 'en',
    startupPosition: 'center',
    dockOnStartup: null,
    uiScale: 100,
    reduceMotion: false,
  },
  chatPreferences: {
    promptCompletionEnabled: true, // AI-powered ghost text enabled by default
    alwaysUseAgentMode: false, // Off by default - only use agent mode for action requests
    compactMode: true, // Show simple status messages like ChatGPT/Claude/Gemini
    sendShortcut: 'enter' as const,
    autoApproveTools: false, // Off by default - show confirmation dialogs
    autoInjectSkills: true, // Auto-inject relevant skills based on message intent
    memoryEnabled: false, // Privacy-safe opt-in: no retrieval or generation until enabled
    allowToolAssistedMemoryGeneration: false,
    autoSaveMemories: false, // Off by default - avoid implicit memory growth
    agentMode: 'build' as AgentMode, // Default to Build mode
    chatStorageMode: 'local' as const, // Local-only by default (privacy-preserving)
  },
  executionPreferences: {
    maxTimeoutMinutes: 1440, // 24 hours default
    enableCheckpointing: true,
    checkpointInterval: 5, // Steps between checkpoints
    autoResumeOnRestart: true,
    enableTimeoutWarnings: true,
    approvalTimeoutSeconds: 300, // 5 minutes default
    approvalTimeoutPolicy: 'auto-deny' as ApprovalTimeoutPolicy,
    streamInactivityTimeoutSeconds: 30, // 30 seconds default
    showComputerUseOverlay: true,
    terminalSandbox: { ...defaultTerminalSandboxPreferences },
  },
  globalHotkeyPreferences: {
    enabled: true, // Enabled by default — competitive parity with Claude Desktop / ChatGPT Desktop
    combo: getDefaultGlobalHotkeyCombo(),
  },
  personalization: defaultPersonalization,
  allowedDirectories: [],
  customModels: [],
  customKeybindings: {},
  features: {},
};

export const createDefaultLLMConfig = (): LLMConfig => ({
  ...defaultSettings.llmConfig,
  defaultModels: { ...defaultSettings.llmConfig.defaultModels },
  taskRouting: { ...defaultSettings.llmConfig.taskRouting },
  favoriteModels: [],
});

export const createDefaultWindowPreferences = (): WindowPreferences => ({
  ...defaultSettings.windowPreferences,
});

function oneOf<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.some((candidate) => Object.is(candidate, value)) ? (value as T) : fallback;
}

function boundedInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

async function configureLocalRuntimeProviders(config: LLMConfig): Promise<void> {
  const runtimes = [
    ['ollama', config.ollamaUrl || 'http://localhost:11434'],
    ['lmstudio', config.lmstudioUrl || 'http://localhost:1234/v1'],
    ['llamacpp', config.llamacppUrl || 'http://localhost:8080/v1'],
    ['vllm', config.vllmUrl || 'http://localhost:8000/v1'],
  ] as const;

  const results = await Promise.allSettled(
    runtimes.map(([provider, baseUrl]) =>
      invoke('llm_configure_provider', { provider, apiKey: null, baseUrl }),
    ),
  );
  const failedProviders = results.flatMap((result, index) =>
    result.status === 'rejected' ? [runtimes[index]![0]] : [],
  );
  if (failedProviders.length > 0) {
    throw new Error(`Could not apply local runtime settings for: ${failedProviders.join(', ')}`);
  }
}

type LiveSettingsSnapshot = {
  llmConfig: LLMConfig;
  chatPreferences: ChatPreferences;
  executionPreferences: ExecutionPreferences;
  allowedDirectories: string[];
  features: Record<string, boolean>;
};

function resolveNativeLiveSettings(
  settings: NativeSettingsPayload | undefined,
): LiveSettingsSnapshot {
  const native = settings ?? {};
  return {
    llmConfig: {
      ...defaultSettings.llmConfig,
      ...(native.llmConfig ?? {}),
      defaultModels: {
        ...defaultSettings.llmConfig.defaultModels,
        ...(native.llmConfig?.defaultModels ?? {}),
      },
      taskRouting: {
        ...defaultSettings.llmConfig.taskRouting,
        ...(native.llmConfig?.taskRouting ?? {}),
      },
      favoriteModels: Array.isArray(native.llmConfig?.favoriteModels)
        ? native.llmConfig.favoriteModels
        : [],
    },
    chatPreferences: {
      ...defaultSettings.chatPreferences,
      ...(native.chatPreferences ?? {}),
    },
    executionPreferences: {
      ...defaultSettings.executionPreferences,
      ...(native.executionPreferences ?? {}),
      terminalSandbox: {
        ...defaultSettings.executionPreferences.terminalSandbox,
        ...(native.executionPreferences?.terminalSandbox ?? {}),
      },
    },
    allowedDirectories: Array.isArray(native.allowedDirectories) ? native.allowedDirectories : [],
    features:
      native.featureFlags && typeof native.featureFlags === 'object' ? native.featureFlags : {},
  };
}

async function applyLiveSettingsSnapshot(snapshot: LiveSettingsSnapshot): Promise<void> {
  await invoke('sync_capabilities', { capabilities: snapshot.features });
  await configureLocalRuntimeProviders(snapshot.llmConfig);
  await configureMemoryInjection(
    snapshot.chatPreferences.memoryEnabled === true,
    10,
    5,
    snapshot.chatPreferences.allowToolAssistedMemoryGeneration === true,
  );
  await invoke('update_allowed_directories', { paths: snapshot.allowedDirectories });
  if (snapshot.allowedDirectories.length > 0) {
    await McpClient.updateFilesystemDirectories(snapshot.allowedDirectories);
  }
  await syncExecutionTimeoutToBackend(snapshot.executionPreferences);
}

async function restoreLiveSettingsSnapshot(snapshot: LiveSettingsSnapshot): Promise<string[]> {
  const failures: string[] = [];
  const restore = async (label: string, operation: () => Promise<unknown>) => {
    try {
      await operation();
    } catch (error) {
      console.error(`Failed to restore ${label} after Settings save failure:`, error);
      failures.push(label);
    }
  };

  await restore('capability policy', () =>
    invoke('sync_capabilities', { capabilities: snapshot.features }),
  );
  await restore('local runtime endpoints', () =>
    configureLocalRuntimeProviders(snapshot.llmConfig),
  );
  await restore('memory policy', () =>
    configureMemoryInjection(
      snapshot.chatPreferences.memoryEnabled === true,
      10,
      5,
      snapshot.chatPreferences.allowToolAssistedMemoryGeneration === true,
    ),
  );
  await restore('allowed directories', () =>
    invoke('update_allowed_directories', { paths: snapshot.allowedDirectories }),
  );
  if (snapshot.allowedDirectories.length > 0) {
    await restore('filesystem MCP roots', () =>
      McpClient.updateFilesystemDirectories(snapshot.allowedDirectories),
    );
  }
  await restore('task timeout policy', () =>
    syncExecutionTimeoutToBackend(snapshot.executionPreferences),
  );
  return failures;
}

const SETTINGS_STORE_VERSION = 28;

function normalizeKnownCatalogModelId(modelId: string | undefined): string | null {
  if (!modelId) return null;
  const canonical = normalizeModelId(modelId) ?? modelId;
  if (canonical === 'auto' || canonical.startsWith('auto-')) return canonical;
  return getModelMetadata(canonical) ? canonical : null;
}

export function isTaskRoutingModelAllowedForTier(
  category: TaskCategory,
  modelId: string,
  tier: SubscriptionTier | string | null | undefined,
): boolean {
  if (!modelId || modelId === 'auto') {
    return true;
  }

  if (modelId.startsWith('auto')) {
    return getAllowedAutoModesForTier(tier).includes(modelId);
  }

  if (category === 'image' || category === 'video') {
    return true;
  }

  const metadata = getModelMetadata(modelId);
  if (metadata?.provider === 'ollama') {
    return true;
  }

  const normalizedTier = normalizeSubscriptionTier(tier);
  return isModelAllowedForTier(modelId, normalizedTier);
}

async function syncExecutionTimeoutToBackend(prefs: ExecutionPreferences): Promise<void> {
  const current = await getTimeoutConfig();
  await setTimeoutConfig({
    ...current,
    max_duration_secs: minutesToSeconds(prefs.maxTimeoutMinutes),
    enable_warnings: prefs.enableTimeoutWarnings,
  });
}

export const useSettingsStore = create<SettingsState>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        ...defaultSettings,
        loading: false,
        error: null,
        _hasHydrated: false,

        setHasHydrated: (state: boolean) => {
          set({ _hasHydrated: state }, undefined, 'settings/setHasHydrated');
        },

        setFeature: (key: string, enabled: boolean) => {
          set(
            (state) => ({ features: { ...state.features, [key]: enabled } }),
            undefined,
            'settings/setFeature',
          );
        },

        addCustomModel: (config: CustomModelConfig) => {
          set(
            (state) => ({ customModels: [...state.customModels, config] }),
            undefined,
            'settings/addCustomModel',
          );
        },

        updateCustomModel: (id: string, config: CustomModelConfig) => {
          set(
            (state) => ({
              customModels: state.customModels.map((m) => (m.id === id ? config : m)),
            }),
            undefined,
            'settings/updateCustomModel',
          );
        },

        removeCustomModel: (id: string) => {
          set(
            (state) => ({ customModels: state.customModels.filter((m) => m.id !== id) }),
            undefined,
            'settings/removeCustomModel',
          );
        },

        setMaxTimeoutMinutes: (minutes: number) => {
          const clamped = Math.max(1, Math.min(4320, minutes));
          set(
            (state) => ({
              executionPreferences: { ...state.executionPreferences, maxTimeoutMinutes: clamped },
            }),
            undefined,
            'settings/setMaxTimeoutMinutes',
          );
        },

        setEnableCheckpointing: (enabled: boolean) => {
          set(
            (state) => ({
              executionPreferences: { ...state.executionPreferences, enableCheckpointing: enabled },
            }),
            undefined,
            'settings/setEnableCheckpointing',
          );
        },

        setCheckpointInterval: (interval: number) => {
          const clamped = Math.max(1, Math.min(100, interval));
          set(
            (state) => ({
              executionPreferences: { ...state.executionPreferences, checkpointInterval: clamped },
            }),
            undefined,
            'settings/setCheckpointInterval',
          );
        },

        setAutoResumeOnRestart: (enabled: boolean) => {
          set(
            (state) => ({
              executionPreferences: { ...state.executionPreferences, autoResumeOnRestart: enabled },
            }),
            undefined,
            'settings/setAutoResumeOnRestart',
          );
        },

        setEnableTimeoutWarnings: (enabled: boolean) => {
          set(
            (state) => ({
              executionPreferences: {
                ...state.executionPreferences,
                enableTimeoutWarnings: enabled,
              },
            }),
            undefined,
            'settings/setEnableTimeoutWarnings',
          );
        },

        setApprovalTimeoutSeconds: (seconds: number) => {
          const clamped = Math.max(30, Math.min(3600, seconds));
          set(
            (state) => ({
              executionPreferences: {
                ...state.executionPreferences,
                approvalTimeoutSeconds: clamped,
              },
            }),
            undefined,
            'settings/setApprovalTimeoutSeconds',
          );
        },

        setApprovalTimeoutPolicy: (policy: ApprovalTimeoutPolicy) => {
          set(
            (state) => ({
              executionPreferences: {
                ...state.executionPreferences,
                approvalTimeoutPolicy: policy,
              },
            }),
            undefined,
            'settings/setApprovalTimeoutPolicy',
          );
        },

        setStreamInactivityTimeoutSeconds: (seconds: number) => {
          const clamped = Math.max(10, Math.min(300, seconds));
          set(
            (state) => ({
              executionPreferences: {
                ...state.executionPreferences,
                streamInactivityTimeoutSeconds: clamped,
              },
            }),
            undefined,
            'settings/setStreamInactivityTimeoutSeconds',
          );
        },

        setShowComputerUseOverlay: (show: boolean) => {
          set(
            (state) => ({
              executionPreferences: { ...state.executionPreferences, showComputerUseOverlay: show },
            }),
            undefined,
            'settings/setShowComputerUseOverlay',
          );
        },

        setTerminalSandboxEnabled: (enabled: boolean) => {
          set(
            (state) => ({
              executionPreferences: {
                ...state.executionPreferences,
                terminalSandbox: {
                  ...state.executionPreferences.terminalSandbox,
                  enabled,
                },
              },
            }),
            undefined,
            'settings/setTerminalSandboxEnabled',
          );
        },

        setTerminalSandboxBackend: (backend: TerminalSandboxBackend) => {
          set(
            (state) => ({
              executionPreferences: {
                ...state.executionPreferences,
                terminalSandbox: {
                  ...state.executionPreferences.terminalSandbox,
                  backend,
                },
              },
            }),
            undefined,
            'settings/setTerminalSandboxBackend',
          );
        },

        setTerminalSandboxPolicy: (policy: TerminalSandboxPolicy) => {
          set(
            (state) => ({
              executionPreferences: {
                ...state.executionPreferences,
                terminalSandbox: {
                  ...state.executionPreferences.terminalSandbox,
                  policy,
                },
              },
            }),
            undefined,
            'settings/setTerminalSandboxPolicy',
          );
        },

        setTerminalSandboxExecutable: (executable: string) => {
          set(
            (state) => ({
              executionPreferences: {
                ...state.executionPreferences,
                terminalSandbox: {
                  ...state.executionPreferences.terminalSandbox,
                  executable,
                },
              },
            }),
            undefined,
            'settings/setTerminalSandboxExecutable',
          );
        },

        setTerminalSandboxAllowedDomains: (domains: string[]) => {
          const normalized = Array.from(
            new Set(domains.map((domain) => domain.trim()).filter(Boolean)),
          );
          set(
            (state) => ({
              executionPreferences: {
                ...state.executionPreferences,
                terminalSandbox: {
                  ...state.executionPreferences.terminalSandbox,
                  allowedDomains: normalized,
                },
              },
            }),
            undefined,
            'settings/setTerminalSandboxAllowedDomains',
          );
        },

        setPersonalization: (updates: Partial<PersonalizationPreferences>) => {
          set(
            (state) => ({
              personalization: { ...state.personalization, ...updates },
            }),
            undefined,
            'settings/setPersonalization',
          );
        },

        setGlobalHotkeyEnabled: (enabled: boolean) => {
          set(
            (state) => ({
              globalHotkeyPreferences: { ...state.globalHotkeyPreferences, enabled },
            }),
            undefined,
            'settings/setGlobalHotkeyEnabled',
          );
        },

        setGlobalHotkeyCombo: (combo: string) => {
          set(
            (state) => ({
              globalHotkeyPreferences: { ...state.globalHotkeyPreferences, combo },
            }),
            undefined,
            'settings/setGlobalHotkeyCombo',
          );
        },

        setCustomKeybinding: (id: string, combo: string) => {
          set(
            (state) => ({
              customKeybindings: { ...state.customKeybindings, [id]: combo },
            }),
            undefined,
            'settings/setCustomKeybinding',
          );
        },

        resetCustomKeybinding: (id: string) => {
          set(
            (state) => {
              const { [id]: _removed, ...rest } = state.customKeybindings;
              return { customKeybindings: rest };
            },
            undefined,
            'settings/resetCustomKeybinding',
          );
        },

        resetAllCustomKeybindings: () => {
          set({ customKeybindings: {} }, undefined, 'settings/resetAllCustomKeybindings');
        },

        setDefaultProvider: async (provider: Provider) => {
          try {
            await invoke('llm_set_default_provider', { provider });
            set(
              (state) => ({
                llmConfig: { ...state.llmConfig, defaultProvider: provider },
              }),
              undefined,
              'settings/setDefaultProvider',
            );
          } catch (error) {
            console.error('Failed to set default provider:', error);
            set(
              { error: getSimpleErrorMessage(error) },
              undefined,
              'settings/setDefaultProvider/error',
            );
            throw error;
          }
        },

        setTemperature: (temperature: number) => {
          set(
            (state) => ({
              llmConfig: { ...state.llmConfig, temperature },
            }),
            undefined,
            'settings/setTemperature',
          );
        },

        setMaxTokens: (maxTokens: number) => {
          set(
            (state) => ({
              llmConfig: { ...state.llmConfig, maxTokens },
            }),
            undefined,
            'settings/setMaxTokens',
          );
        },

        setDefaultModel: (provider: Provider, model: string) => {
          set(
            (state) => ({
              llmConfig: {
                ...state.llmConfig,
                defaultModels: { ...state.llmConfig.defaultModels, [provider]: model },
              },
            }),
            undefined,
            'settings/setDefaultModel',
          );
        },

        setTaskRouting: (category: TaskCategory, provider: Provider, model: string) => {
          set(
            (state) => ({
              llmConfig: {
                ...state.llmConfig,
                taskRouting: {
                  ...state.llmConfig.taskRouting,
                  [category]: { provider, model },
                },
              },
            }),
            undefined,
            'settings/setTaskRouting',
          );
        },

        setFavoriteModels: (models: string[]) => {
          set(
            (state) => ({
              llmConfig: { ...state.llmConfig, favoriteModels: models },
            }),
            undefined,
            'settings/setFavoriteModels',
          );
        },

        addFavoriteModel: (model: string) => {
          set(
            (state) => {
              const favoriteModels = [...state.llmConfig.favoriteModels];
              if (!favoriteModels.includes(model)) {
                favoriteModels.push(model);
              }
              return {
                llmConfig: { ...state.llmConfig, favoriteModels },
              };
            },
            undefined,
            'settings/addFavoriteModel',
          );
        },

        removeFavoriteModel: (model: string) => {
          set(
            (state) => {
              const favoriteModels = state.llmConfig.favoriteModels.filter((m) => m !== model);
              return {
                llmConfig: { ...state.llmConfig, favoriteModels },
              };
            },
            undefined,
            'settings/removeFavoriteModel',
          );
        },

        setProviderMode: (mode: 'auto' | 'local' | 'cloud') => {
          set(
            (state) => ({
              llmConfig: { ...state.llmConfig, providerMode: mode },
            }),
            undefined,
            'settings/setProviderMode',
          );
        },

        setOllamaUrl: (url: string) => {
          set(
            (state) => ({
              llmConfig: { ...state.llmConfig, ollamaUrl: url },
            }),
            undefined,
            'settings/setOllamaUrl',
          );
        },

        setLmStudioUrl: (url: string) => {
          set(
            (state) => ({
              llmConfig: { ...state.llmConfig, lmstudioUrl: url },
            }),
            undefined,
            'settings/setLmStudioUrl',
          );
        },

        setLlamaCppUrl: (url: string) => {
          set(
            (state) => ({
              llmConfig: { ...state.llmConfig, llamacppUrl: url },
            }),
            undefined,
            'settings/setLlamaCppUrl',
          );
        },

        setVllmUrl: (url: string) => {
          set(
            (state) => ({
              llmConfig: { ...state.llmConfig, vllmUrl: url },
            }),
            undefined,
            'settings/setVllmUrl',
          );
        },

        setTheme: (theme: Theme) => {
          set(
            (state) => ({
              windowPreferences: { ...state.windowPreferences, theme },
            }),
            undefined,
            'settings/setTheme',
          );

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

        setSelectedTheme: (themeId: string | undefined) => {
          set(
            (state) => ({
              windowPreferences: { ...state.windowPreferences, selectedTheme: themeId },
            }),
            undefined,
            'settings/setSelectedTheme',
          );
          if (themeId) {
            const theme = getThemeById(themeId);
            if (theme) applyTheme(theme);
          } else {
            clearAppliedTheme();
          }
        },

        setDyslexicFont: (enabled: boolean) => {
          set(
            (state) => ({
              windowPreferences: { ...state.windowPreferences, dyslexicFont: enabled },
            }),
            undefined,
            'settings/setDyslexicFont',
          );
          if (typeof document !== 'undefined') {
            if (enabled) {
              document.documentElement.classList.add('dyslexic-font');
            } else {
              document.documentElement.classList.remove('dyslexic-font');
            }
          }
        },

        setChatFont: (font: ChatFont) => {
          set(
            (state) => ({
              windowPreferences: { ...state.windowPreferences, chatFont: font },
            }),
            undefined,
            'settings/setChatFont',
          );
          if (typeof document !== 'undefined') {
            const fontMap: Record<ChatFont, string> = {
              default: 'ui-sans-serif, system-ui, sans-serif',
              sans: "'Inter', system-ui, sans-serif",
              mono: "'JetBrains Mono', ui-monospace, monospace",
              dyslexic: "'OpenDyslexic', sans-serif",
            };
            document.documentElement.style.setProperty('--chat-font-family', fontMap[font]);
          }
        },

        setUiScale: (scale: 90 | 100 | 110) => {
          set(
            (state) => ({
              windowPreferences: { ...state.windowPreferences, uiScale: scale },
            }),
            undefined,
            'settings/setUiScale',
          );
          if (typeof document !== 'undefined') {
            document.documentElement.style.fontSize = `${scale}%`;
          }
        },

        setReduceMotion: (enabled: boolean) => {
          set(
            (state) => ({
              windowPreferences: { ...state.windowPreferences, reduceMotion: enabled },
            }),
            undefined,
            'settings/setReduceMotion',
          );
          if (typeof document !== 'undefined') {
            document.documentElement.classList.toggle('reduce-motion', enabled);
          }
        },

        setLanguage: (language: Language) => {
          set(
            (state) => ({
              windowPreferences: { ...state.windowPreferences, language },
            }),
            undefined,
            'settings/setLanguage',
          );
        },

        setStartupPosition: (position: 'center' | 'remember') => {
          set(
            (state) => ({
              windowPreferences: { ...state.windowPreferences, startupPosition: position },
            }),
            undefined,
            'settings/setStartupPosition',
          );
        },

        setDockOnStartup: (dock: 'left' | 'right' | null) => {
          set(
            (state) => ({
              windowPreferences: { ...state.windowPreferences, dockOnStartup: dock },
            }),
            undefined,
            'settings/setDockOnStartup',
          );
        },

        setPromptCompletionEnabled: (enabled: boolean) => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, promptCompletionEnabled: enabled },
            }),
            undefined,
            'settings/setPromptCompletionEnabled',
          );
        },

        setAlwaysUseAgentMode: (enabled: boolean) => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, alwaysUseAgentMode: enabled },
            }),
            undefined,
            'settings/setAlwaysUseAgentMode',
          );
        },

        setCompactMode: (enabled: boolean) => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, compactMode: enabled },
            }),
            undefined,
            'settings/setCompactMode',
          );
        },

        setTemporaryChat: (enabled: boolean) => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, temporaryChat: enabled },
            }),
            undefined,
            'settings/setTemporaryChat',
          );
        },

        setSendShortcut: (shortcut: 'enter' | 'mod-enter') => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, sendShortcut: shortcut },
            }),
            undefined,
            'settings/setSendShortcut',
          );
        },

        setAutoInjectSkills: (enabled: boolean) => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, autoInjectSkills: enabled },
            }),
            undefined,
            'settings/setAutoInjectSkills',
          );
        },

        setMemoryEnabled: async (enabled: boolean) => {
          set(
            (state) => ({
              chatPreferences: {
                ...state.chatPreferences,
                memoryEnabled: enabled,
                autoSaveMemories: enabled,
              },
            }),
            undefined,
            'settings/setMemoryEnabled',
          );
        },

        setAllowToolAssistedMemoryGeneration: async (enabled: boolean) => {
          set(
            (state) => ({
              chatPreferences: {
                ...state.chatPreferences,
                allowToolAssistedMemoryGeneration: enabled,
              },
            }),
            undefined,
            'settings/setAllowToolAssistedMemoryGeneration',
          );
        },

        setAutoSaveMemories: async (enabled: boolean) => {
          await get().setMemoryEnabled(enabled);
        },

        setAutoApproveTools: async (enabled: boolean) => {
          // Safety toggle: if the backend sync fails we must NOT leave the UI
          const previousAutoApprove = get().chatPreferences.autoApproveTools;
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, autoApproveTools: enabled },
            }),
            undefined,
            'settings/setAutoApproveTools',
          );
          try {
            await invoke('set_auto_approve_all', { enabled });
          } catch (error) {
            console.error('Failed to sync auto-approve-all to backend:', error);
            set(
              (state) => ({
                chatPreferences: {
                  ...state.chatPreferences,
                  autoApproveTools: previousAutoApprove,
                },
              }),
              undefined,
              'settings/setAutoApproveTools/rollback',
            );
            throw error;
          }
        },

        setAgentMode: async (mode: AgentMode) => {
          const previousMode = get().chatPreferences.agentMode;
          const previousAutoApprove = get().chatPreferences.autoApproveTools;
          const previousAlwaysAgent = get().chatPreferences.alwaysUseAgentMode;

          set(
            (state) => ({
              chatPreferences: {
                ...state.chatPreferences,
                agentMode: mode,
                autoApproveTools: mode === 'autopilot',
                alwaysUseAgentMode:
                  mode === 'plan' ? true : state.chatPreferences.alwaysUseAgentMode,
              },
            }),
            undefined,
            'settings/setAgentMode',
          );
          try {
            await invoke('set_agent_mode', { mode });
            await invoke('set_auto_approve_all', { enabled: mode === 'autopilot' });
          } catch (error) {
            console.error('Failed to sync agent mode to backend:', error);
            set(
              (state) => ({
                chatPreferences: {
                  ...state.chatPreferences,
                  agentMode: previousMode,
                  autoApproveTools: previousAutoApprove,
                  alwaysUseAgentMode: previousAlwaysAgent,
                },
              }),
              undefined,
              'settings/setAgentMode/rollback',
            );
            throw error;
          }
        },

        setChatStorageMode: (mode: 'local' | 'cloud') => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, chatStorageMode: mode },
            }),
            undefined,
            'settings/setChatStorageMode',
          );
          void get().saveSettings();
        },

        addAllowedDirectory: (path: string) => {
          set(
            (state) => {
              if (state.allowedDirectories.includes(path)) return {};
              return { allowedDirectories: [...state.allowedDirectories, path] };
            },
            undefined,
            'settings/addAllowedDirectory',
          );
        },

        removeAllowedDirectory: (path: string) => {
          set(
            (state) => ({
              allowedDirectories: state.allowedDirectories.filter((p) => p !== path),
            }),
            undefined,
            'settings/removeAllowedDirectory',
          );
        },

        setAllowedDirectories: (paths: string[]) => {
          set({ allowedDirectories: paths }, undefined, 'settings/setAllowedDirectories');
        },

        loadSettings: async () => {
          set({ loading: true, error: null }, undefined, 'settings/loadSettings/start');

          try {
            if (!isTauriContext()) {
              set({ loading: false, error: null }, undefined, 'settings/loadSettings/webMode');
              get().setTheme(get().windowPreferences.theme);
              return;
            }

            const hydratedCurrent = get();
            let settings: NativeSettingsPayload;

            try {
              settings = await invoke<NativeSettingsPayload>('settings_load_from_disk');
            } catch (diskError) {
              console.warn(
                '[settingsStore] Failed to load from disk, using in-memory defaults:',
                diskError,
              );
              settings = await invoke<NativeSettingsPayload>('settings_load');
            }

            if (get().loading === false) {
              return;
            }

            const mergedLLMConfig: LLMConfig = {
              ...defaultSettings.llmConfig,
              ...(settings.llmConfig ?? defaultSettings.llmConfig),
              defaultModels: {
                ...defaultSettings.llmConfig.defaultModels,
                managed_cloud:
                  settings.llmConfig?.defaultModels?.managed_cloud ??
                  defaultSettings.llmConfig.defaultModels.managed_cloud,
                ollama:
                  settings.llmConfig?.defaultModels?.ollama ??
                  defaultSettings.llmConfig.defaultModels.ollama,
              },
              taskRouting: {
                ...defaultSettings.llmConfig.taskRouting,
                ...(settings.llmConfig?.taskRouting ?? defaultSettings.llmConfig.taskRouting),
              },
              favoriteModels: Array.isArray(settings.llmConfig?.favoriteModels)
                ? settings.llmConfig.favoriteModels
                : [],
              providerMode:
                settings.llmConfig?.providerMode ?? defaultSettings.llmConfig.providerMode,
              ollamaUrl: settings.llmConfig?.ollamaUrl ?? defaultSettings.llmConfig.ollamaUrl,
              lmstudioUrl:
                settings.llmConfig?.lmstudioUrl ??
                hydratedCurrent.llmConfig.lmstudioUrl ??
                defaultSettings.llmConfig.lmstudioUrl,
              llamacppUrl:
                settings.llmConfig?.llamacppUrl ??
                hydratedCurrent.llmConfig.llamacppUrl ??
                defaultSettings.llmConfig.llamacppUrl,
              vllmUrl:
                settings.llmConfig?.vllmUrl ??
                hydratedCurrent.llmConfig.vllmUrl ??
                defaultSettings.llmConfig.vllmUrl,
            };

            const mergedWindowPreferences: WindowPreferences = {
              ...defaultSettings.windowPreferences,
              ...(settings.windowPreferences ?? defaultSettings.windowPreferences),
              language:
                settings.windowPreferences?.language ?? defaultSettings.windowPreferences.language,
              selectedTheme:
                settings.windowPreferences?.selectedTheme ??
                hydratedCurrent.windowPreferences.selectedTheme,
              dyslexicFont:
                settings.windowPreferences?.dyslexicFont ??
                hydratedCurrent.windowPreferences.dyslexicFont ??
                false,
              chatFont: oneOf(
                settings.windowPreferences?.chatFont,
                ['default', 'sans', 'mono', 'dyslexic'] as const,
                hydratedCurrent.windowPreferences.chatFont ?? 'default',
              ),
              uiScale: oneOf(
                settings.windowPreferences?.uiScale,
                [90, 100, 110] as const,
                hydratedCurrent.windowPreferences.uiScale ?? 100,
              ),
              reduceMotion:
                settings.windowPreferences?.reduceMotion ??
                hydratedCurrent.windowPreferences.reduceMotion ??
                false,
            };

            const mergedChatPreferences: ChatPreferences = {
              ...defaultSettings.chatPreferences,
              ...(settings.chatPreferences ?? defaultSettings.chatPreferences),
              sendShortcut: oneOf(
                settings.chatPreferences?.sendShortcut,
                ['enter', 'mod-enter'] as const,
                hydratedCurrent.chatPreferences.sendShortcut ?? 'enter',
              ),
              temporaryChat:
                settings.chatPreferences?.temporaryChat ??
                hydratedCurrent.chatPreferences.temporaryChat ??
                false,
            };

            const mergedExecutionPreferences: ExecutionPreferences = {
              ...defaultSettings.executionPreferences,
              ...(settings.executionPreferences ?? defaultSettings.executionPreferences),
              terminalSandbox: {
                ...defaultSettings.executionPreferences.terminalSandbox,
                ...(settings.executionPreferences?.terminalSandbox ??
                  defaultSettings.executionPreferences.terminalSandbox),
                allowedDomains: Array.isArray(
                  settings.executionPreferences?.terminalSandbox?.allowedDomains,
                )
                  ? settings.executionPreferences?.terminalSandbox?.allowedDomains
                  : defaultSettings.executionPreferences.terminalSandbox.allowedDomains,
              },
              approvalTimeoutSeconds: boundedInteger(
                settings.executionPreferences?.approvalTimeoutSeconds,
                30,
                3600,
                hydratedCurrent.executionPreferences.approvalTimeoutSeconds ?? 300,
              ),
              approvalTimeoutPolicy: oneOf(
                settings.executionPreferences?.approvalTimeoutPolicy,
                ['auto-deny', 'auto-approve', 'pause'] as const,
                hydratedCurrent.executionPreferences.approvalTimeoutPolicy ?? 'auto-deny',
              ),
              streamInactivityTimeoutSeconds: boundedInteger(
                settings.executionPreferences?.streamInactivityTimeoutSeconds,
                10,
                300,
                hydratedCurrent.executionPreferences.streamInactivityTimeoutSeconds ?? 30,
              ),
              showComputerUseOverlay:
                settings.executionPreferences?.showComputerUseOverlay ??
                hydratedCurrent.executionPreferences.showComputerUseOverlay ??
                true,
            };

            const mergedGlobalHotkeyPreferences: GlobalHotkeyPreferences = {
              ...defaultSettings.globalHotkeyPreferences,
              ...(settings.globalHotkeyPreferences ?? defaultSettings.globalHotkeyPreferences),
            };

            const mergedPersonalization: PersonalizationPreferences = {
              ...defaultPersonalization,
              ...hydratedCurrent.personalization,
              name:
                typeof settings.personalization?.name === 'string'
                  ? settings.personalization.name
                  : hydratedCurrent.personalization.name,
              occupation:
                typeof settings.personalization?.occupation === 'string'
                  ? settings.personalization.occupation
                  : hydratedCurrent.personalization.occupation,
              bio:
                typeof settings.personalization?.bio === 'string'
                  ? settings.personalization.bio
                  : hydratedCurrent.personalization.bio,
              formality: boundedInteger(
                settings.personalization?.formality,
                1,
                5,
                hydratedCurrent.personalization.formality,
              ),
              warmth: boundedInteger(
                settings.personalization?.warmth,
                1,
                5,
                hydratedCurrent.personalization.warmth,
              ),
              detail: boundedInteger(
                settings.personalization?.detail,
                1,
                5,
                hydratedCurrent.personalization.detail,
              ),
              emojiUsage: oneOf(
                settings.personalization?.emojiUsage,
                ['never', 'sometimes', 'often'] as const,
                hydratedCurrent.personalization.emojiUsage,
              ),
            };

            try {
              await configureLocalRuntimeProviders(mergedLLMConfig);
            } catch (error) {
              console.error('Failed to restore one or more local runtime providers:', error);
            }

            if (get().loading === false) {
              return;
            }

            set(
              {
                llmConfig: mergedLLMConfig,
                windowPreferences: mergedWindowPreferences,
                chatPreferences: mergedChatPreferences,
                executionPreferences: mergedExecutionPreferences,
                globalHotkeyPreferences: mergedGlobalHotkeyPreferences,
                personalization: mergedPersonalization,
                allowedDirectories: settings.allowedDirectories ?? [],
                customModels: Array.isArray(settings.customModels) ? settings.customModels : [],
                customKeybindings:
                  settings.customKeybindings && typeof settings.customKeybindings === 'object'
                    ? settings.customKeybindings
                    : hydratedCurrent.customKeybindings,
                features:
                  settings.featureFlags && typeof settings.featureFlags === 'object'
                    ? settings.featureFlags
                    : get().features,
                loading: false,
              },
              undefined,
              'settings/loadSettings/success',
            );

            get().setTheme(mergedWindowPreferences.theme);

            try {
              await invoke('llm_set_default_provider', {
                provider: mergedLLMConfig.defaultProvider,
              });
            } catch (error) {
              console.error('Failed to restore default provider:', error);
            }

            // e.g. never updated by SafetyPolicies.tsx, which calls
            // exact "safety setting reverts on restart" regression even
            let resolvedAgentMode: AgentMode = mergedChatPreferences.agentMode ?? 'build';
            try {
              resolvedAgentMode = await invoke<AgentMode>('get_agent_mode');
            } catch (error) {
              console.error(
                'Failed to read persisted agent mode from backend, pushing frontend value:',
                error,
              );
              try {
                await invoke('set_agent_mode', { mode: resolvedAgentMode });
              } catch (pushError) {
                console.error('Failed to sync agent mode to backend:', pushError);
              }
            }

            let resolvedAutoApprove = mergedChatPreferences.autoApproveTools ?? false;
            try {
              resolvedAutoApprove = await invoke<boolean>('get_auto_approve_all');
            } catch (error) {
              console.error(
                'Failed to read persisted auto-approve-all from backend, pushing frontend value:',
                error,
              );
              try {
                await invoke('set_auto_approve_all', { enabled: resolvedAutoApprove });
              } catch (pushError) {
                console.error('Failed to sync auto-approve-all to backend:', pushError);
              }
            }

            if (
              resolvedAgentMode !== mergedChatPreferences.agentMode ||
              resolvedAutoApprove !== mergedChatPreferences.autoApproveTools
            ) {
              set(
                (state) => ({
                  chatPreferences: {
                    ...state.chatPreferences,
                    agentMode: resolvedAgentMode,
                    autoApproveTools: resolvedAutoApprove,
                  },
                }),
                undefined,
                'settings/loadSettings/hydrateAgentModeFromBackend',
              );
            }

            try {
              await configureMemoryInjection(
                mergedChatPreferences.memoryEnabled === true,
                10,
                5,
                mergedChatPreferences.allowToolAssistedMemoryGeneration === true,
              );
            } catch (error) {
              console.error('Failed to restore native memory policy:', error);
            }

            try {
              await invoke('sync_capabilities', {
                capabilities:
                  settings.featureFlags && typeof settings.featureFlags === 'object'
                    ? settings.featureFlags
                    : get().features,
              });
            } catch (error) {
              console.error('Failed to sync capabilities to backend:', error);
              set(
                {
                  error:
                    'Capability settings could not be applied. Disabled capabilities are not being enforced — restart the app before running tools.',
                },
                undefined,
                'settings/loadSettings/capabilitySyncFailed',
              );
            }

            try {
              const dirs = settings.allowedDirectories ?? [];
              await invoke('update_allowed_directories', { paths: dirs });

              if (dirs.length > 0) {
                await McpClient.updateFilesystemDirectories(dirs);
              }
            } catch (error) {
              console.error('Failed to sync allowed directories to backend:', error);
            }

            try {
              await syncExecutionTimeoutToBackend(get().executionPreferences);
            } catch (error) {
              console.error('Failed to restore task timeout policy:', error);
              set(
                {
                  error:
                    get().error ??
                    'Task timeout settings could not be applied. Restart the app before running long tasks.',
                },
                undefined,
                'settings/loadSettings/timeoutSyncFailed',
              );
            }
          } catch (error) {
            console.error('Failed to load settings:', error);

            if (get().loading) {
              set(
                { error: getSimpleErrorMessage(error), loading: false },
                undefined,
                'settings/loadSettings/error',
              );
            }
          } finally {
            // Safety net: ensure loading is always cleared even if catch handler throws
            if (get().loading) {
              set({ loading: false }, undefined, 'settings/loadSettings/finally');
            }
          }
        },

        saveSettings: async () => {
          set({ loading: true, error: null }, undefined, 'settings/saveSettings/start');
          let previousLiveSettings: LiveSettingsSnapshot | null = null;
          try {
            const {
              llmConfig,
              windowPreferences,
              chatPreferences,
              executionPreferences,
              globalHotkeyPreferences,
              allowedDirectories,
              customModels,
              features,
              personalization,
              customKeybindings,
            } = get();

            previousLiveSettings = resolveNativeLiveSettings(
              await invoke<NativeSettingsPayload>('settings_load'),
            );
            await applyLiveSettingsSnapshot({
              llmConfig,
              chatPreferences,
              executionPreferences,
              allowedDirectories,
              features,
            });

            await invoke('settings_save', {
              settings: {
                llmConfig,
                windowPreferences,
                chatPreferences,
                executionPreferences,
                globalHotkeyPreferences,
                allowedDirectories,
                customModels,
                featureFlags: features,
                personalization,
                customKeybindings,
              },
            });

            // is the source of truth for these two safety-gating fields and
            // SafetyPolicies.tsx's direct `set_agent_mode`/
            // mode via SafetyPolicies.tsx, which never touches this store),

            set({ loading: false }, undefined, 'settings/saveSettings/success');
          } catch (error) {
            const rollbackFailures = previousLiveSettings
              ? await restoreLiveSettingsSnapshot(previousLiveSettings)
              : [];
            const originalMessage = error instanceof Error ? error.message : String(error);
            const resolvedError =
              rollbackFailures.length > 0
                ? new Error(
                    `${originalMessage}. Previous live settings could not be fully restored: ${rollbackFailures.join(', ')}`,
                  )
                : error;
            console.error('Failed to save settings:', resolvedError);
            set(
              { error: getSimpleErrorMessage(resolvedError), loading: false },
              undefined,
              'settings/saveSettings/error',
            );
            throw resolvedError;
          }
        },
      })),
      {
        name: 'agiworkforce-settings',
        version: SETTINGS_STORE_VERSION,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => {
          const base = {
            llmConfig: state.llmConfig,
            windowPreferences: {
              theme: state.windowPreferences.theme,
              language: state.windowPreferences.language,
              selectedTheme: state.windowPreferences.selectedTheme,
              chatFont: state.windowPreferences.chatFont,
              dyslexicFont: state.windowPreferences.dyslexicFont,
              uiScale: state.windowPreferences.uiScale,
              reduceMotion: state.windowPreferences.reduceMotion,
            },
            chatPreferences: state.chatPreferences,
            executionPreferences: state.executionPreferences,
            personalization: state.personalization,
            allowedDirectories: state.allowedDirectories,
            customModels: state.customModels,
            customKeybindings: state.customKeybindings,
          };

          if (isTauriContext()) {
            return {
              ...base,
              windowPreferences: {
                ...base.windowPreferences,
                startupPosition: state.windowPreferences.startupPosition,
                dockOnStartup: state.windowPreferences.dockOnStartup,
              },
              globalHotkeyPreferences: state.globalHotkeyPreferences,
            };
          }

          return base;
        },
        merge: (persistedState, currentState) => {
          const persisted = persistedState as Partial<SettingsState> | undefined;

          const persistedDefaultModels = persisted?.llmConfig?.defaultModels as
            | { managed_cloud?: string; ollama?: string }
            | undefined;

          const mergedLLMConfig: LLMConfig = {
            ...currentState.llmConfig,
            ...(persisted?.llmConfig ?? {}),
            defaultProvider:
              persisted?.llmConfig?.defaultProvider ?? currentState.llmConfig.defaultProvider,
            defaultModels: {
              managed_cloud:
                persistedDefaultModels?.managed_cloud ??
                currentState.llmConfig.defaultModels.managed_cloud,
              ollama: persistedDefaultModels?.ollama ?? currentState.llmConfig.defaultModels.ollama,
            },
            taskRouting: {
              ...currentState.llmConfig.taskRouting,
              ...(persisted?.llmConfig?.taskRouting ?? {}),
            },
            favoriteModels: Array.isArray(persisted?.llmConfig?.favoriteModels)
              ? persisted.llmConfig.favoriteModels
              : currentState.llmConfig.favoriteModels,
            providerMode: persisted?.llmConfig?.providerMode ?? currentState.llmConfig.providerMode,
            ollamaUrl: persisted?.llmConfig?.ollamaUrl ?? currentState.llmConfig.ollamaUrl,
            lmstudioUrl: persisted?.llmConfig?.lmstudioUrl ?? currentState.llmConfig.lmstudioUrl,
            llamacppUrl: persisted?.llmConfig?.llamacppUrl ?? currentState.llmConfig.llamacppUrl,
            vllmUrl: persisted?.llmConfig?.vllmUrl ?? currentState.llmConfig.vllmUrl,
          };

          const mergedWindowPreferences: WindowPreferences = {
            ...currentState.windowPreferences,
            ...(persisted?.windowPreferences ?? {}),
            language:
              persisted?.windowPreferences?.language ?? currentState.windowPreferences.language,
          };

          const mergedChatPreferences: ChatPreferences = {
            ...currentState.chatPreferences,
            ...(persisted?.chatPreferences ?? {}),
          };

          const mergedExecutionPreferences: ExecutionPreferences = {
            ...currentState.executionPreferences,
            ...(persisted?.executionPreferences ?? {}),
            terminalSandbox: {
              ...currentState.executionPreferences.terminalSandbox,
              ...(persisted?.executionPreferences?.terminalSandbox ?? {}),
              allowedDomains: Array.isArray(
                persisted?.executionPreferences?.terminalSandbox?.allowedDomains,
              )
                ? persisted.executionPreferences.terminalSandbox.allowedDomains
                : currentState.executionPreferences.terminalSandbox.allowedDomains,
            },
          };

          const mergedGlobalHotkeyPreferences: GlobalHotkeyPreferences = {
            ...currentState.globalHotkeyPreferences,
            ...(persisted?.globalHotkeyPreferences ?? {}),
          };

          const mergedPersonalization: PersonalizationPreferences = {
            ...defaultPersonalization,
            ...currentState.personalization,
            ...(persisted?.personalization ?? {}),
          };

          return {
            ...currentState,
            ...persisted,
            llmConfig: mergedLLMConfig,
            windowPreferences: mergedWindowPreferences,
            chatPreferences: mergedChatPreferences,
            executionPreferences: mergedExecutionPreferences,
            globalHotkeyPreferences: mergedGlobalHotkeyPreferences,
            personalization: mergedPersonalization,
            allowedDirectories: persisted?.allowedDirectories ?? currentState.allowedDirectories,
            customModels: Array.isArray(persisted?.customModels)
              ? persisted.customModels
              : currentState.customModels,
            customKeybindings:
              persisted?.customKeybindings && typeof persisted.customKeybindings === 'object'
                ? persisted.customKeybindings
                : currentState.customKeybindings,
          };
        },
        migrate: (persistedState: unknown, version: number) => {
          const state = persistedState as Partial<SettingsState> & {
            llmConfig?: Partial<LLMConfig> & {
              defaultProvider?: string;
              defaultModels?: Record<string, string>;
              favoriteModels?: string[];
              taskRouting?: Record<string, { provider: Provider; model: string }>;
            };
            chatPreferences?: Partial<ChatPreferences>;
            executionPreferences?: Partial<ExecutionPreferences>;
          };

          if (version < 2) {
            if (state?.llmConfig) {
              state.llmConfig.defaultProvider = 'managed_cloud';
              state.llmConfig.defaultModels = {
                ollama: state.llmConfig?.defaultModels?.ollama ?? '',
                managed_cloud: state.llmConfig?.defaultModels?.managed_cloud ?? 'auto',
              };
              state.llmConfig.favoriteModels = [];
              if (state.llmConfig.taskRouting) {
                for (const key of Object.keys(state.llmConfig.taskRouting)) {
                  state.llmConfig.taskRouting[key] = { provider: 'managed_cloud', model: 'auto' };
                }
              }
            }
          }

          if (version < 3) {
            if (!state.chatPreferences) {
              state.chatPreferences = {
                promptCompletionEnabled: true,
                alwaysUseAgentMode: false,
                compactMode: true,
                autoApproveTools: false,
                agentMode: 'build',
                chatStorageMode: 'local',
              };
            } else if (state.chatPreferences.alwaysUseAgentMode === undefined) {
              state.chatPreferences.alwaysUseAgentMode = false;
            }
          }

          if (version < 4) {
            if (!state.executionPreferences) {
              state.executionPreferences = {
                maxTimeoutMinutes: 1440, // 24 hours
                enableCheckpointing: true,
                checkpointInterval: 5,
                autoResumeOnRestart: true,
                enableTimeoutWarnings: true,
                approvalTimeoutSeconds: 300,
                approvalTimeoutPolicy: 'auto-deny' as ApprovalTimeoutPolicy,
                streamInactivityTimeoutSeconds: 30,
                showComputerUseOverlay: true,
                terminalSandbox: { ...defaultTerminalSandboxPreferences },
              };
            }
          }

          if (version < 5) {
            if (state.chatPreferences && state.chatPreferences.compactMode === undefined) {
              state.chatPreferences.compactMode = true;
            }
          }

          if (version < 6) {
            if (state?.llmConfig?.defaultModels) {
              state.llmConfig.defaultModels = {
                ollama: state.llmConfig.defaultModels.ollama ?? '',
                managed_cloud: state.llmConfig.defaultModels.managed_cloud ?? 'auto',
              };
            }
          }

          if (version < 7) {
            if (!state.windowPreferences) {
              state.windowPreferences = {} as WindowPreferences;
            }
            if (!state.windowPreferences.language) {
              state.windowPreferences.language = 'en';
            }
          }

          if (version < 8) {
            if (state.chatPreferences && state.chatPreferences.autoApproveTools === undefined) {
              state.chatPreferences.autoApproveTools = false;
            }
          }

          if (version < 9) {
            const stateWithHotkey = state as Partial<SettingsState> & {
              globalHotkeyPreferences?: Partial<GlobalHotkeyPreferences>;
            };
            if (!stateWithHotkey.globalHotkeyPreferences) {
              stateWithHotkey.globalHotkeyPreferences = {
                enabled: true,
                combo: getDefaultGlobalHotkeyCombo(),
              };
            }
          }

          if (version < 10) {
            const stateWithCustomModels = state as Partial<SettingsState>;
            if (!Array.isArray(stateWithCustomModels.customModels)) {
              stateWithCustomModels.customModels = [];
            }
          }

          if (version < 11) {
            if (!state.features || typeof state.features !== 'object') {
              (state as Partial<SettingsState>).features = {};
            }
          }

          if (version < 12) {
            if (state.chatPreferences && state.chatPreferences.autoInjectSkills === undefined) {
              state.chatPreferences.autoInjectSkills = true;
            }
          }

          if (version < 13) {
            if (state.chatPreferences && state.chatPreferences.agentMode === undefined) {
              state.chatPreferences.agentMode = state.chatPreferences.autoApproveTools
                ? 'autopilot'
                : 'build';
            }
          }

          if (version < 14) {
            if (state.llmConfig) {
              const llmConfig = state.llmConfig as Partial<LLMConfig>;
              if (llmConfig.providerMode === undefined) {
                llmConfig.providerMode = 'auto';
              }
              if (llmConfig.ollamaUrl === undefined) {
                llmConfig.ollamaUrl = 'http://localhost:11434';
              }
            }
          }

          if (version < 15) {
            if (state.chatPreferences) {
              const cp = state.chatPreferences as Partial<ChatPreferences>;
              if (cp.chatStorageMode === undefined) {
                cp.chatStorageMode = 'local';
              }
            }
          }

          if (version < 16) {
            const stateWithKeys = state as Partial<SettingsState>;
            if (
              !stateWithKeys.customKeybindings ||
              typeof stateWithKeys.customKeybindings !== 'object'
            ) {
              stateWithKeys.customKeybindings = {};
            }
          }

          if (version < 17) {
            const stateWithTheme = state as Partial<SettingsState>;
            if (stateWithTheme.windowPreferences) {
              if (stateWithTheme.windowPreferences.selectedTheme === undefined) {
                stateWithTheme.windowPreferences = {
                  ...stateWithTheme.windowPreferences,
                  selectedTheme: undefined,
                };
              }
            }
          }

          if (version < 18) {
            // No-op: version bump only to signal coding tools parity release
          }

          if (version < 19) {
            if (state.windowPreferences && state.windowPreferences.dyslexicFont === undefined) {
              state.windowPreferences = {
                ...state.windowPreferences,
                dyslexicFont: false,
              };
            }
          }

          if (version < 20) {
            if (state.executionPreferences) {
              const ep = state.executionPreferences as Partial<ExecutionPreferences>;
              if (ep.approvalTimeoutSeconds === undefined) {
                ep.approvalTimeoutSeconds = 300;
              }
              if (ep.approvalTimeoutPolicy === undefined) {
                ep.approvalTimeoutPolicy = 'auto-deny';
              }
              if (ep.streamInactivityTimeoutSeconds === undefined) {
                ep.streamInactivityTimeoutSeconds = 30;
              }
            }
          }

          if (version < 21) {
            if (state.windowPreferences && state.windowPreferences.chatFont === undefined) {
              state.windowPreferences = {
                ...state.windowPreferences,
                chatFont: 'default',
              };
            }
          }

          if (version < 22) {
            const stateWithPersonalization = state as Partial<SettingsState>;
            if (!stateWithPersonalization.personalization) {
              stateWithPersonalization.personalization = { ...defaultPersonalization };
            }
          }

          if (version < 23 && state.executionPreferences) {
            const ep = state.executionPreferences as Partial<ExecutionPreferences>;
            ep.terminalSandbox = {
              ...defaultTerminalSandboxPreferences,
              ...(ep.terminalSandbox ?? {}),
              allowedDomains: Array.isArray(ep.terminalSandbox?.allowedDomains)
                ? ep.terminalSandbox.allowedDomains
                : defaultTerminalSandboxPreferences.allowedDomains,
            };
          }

          if (version < 24 && state.llmConfig) {
            const llmConfig = state.llmConfig as Partial<LLMConfig>;
            if (llmConfig.lmstudioUrl === undefined) {
              llmConfig.lmstudioUrl = 'http://localhost:1234/v1';
            }
            if (llmConfig.llamacppUrl === undefined) {
              llmConfig.llamacppUrl = 'http://localhost:8080/v1';
            }
          }

          if (version < 25 && state.llmConfig) {
            const llmConfig = state.llmConfig as Partial<LLMConfig>;
            if (llmConfig.vllmUrl === undefined) {
              llmConfig.vllmUrl = 'http://localhost:8000/v1';
            }
          }

          if (version < 26 && state.llmConfig) {
            const llmConfig = state.llmConfig as Partial<LLMConfig>;
            if (llmConfig.defaultModels) {
              llmConfig.defaultModels.managed_cloud =
                normalizeKnownCatalogModelId(llmConfig.defaultModels.managed_cloud) ?? 'auto';
            }
            llmConfig.favoriteModels = (llmConfig.favoriteModels ?? [])
              .map((modelId) => normalizeKnownCatalogModelId(modelId))
              .filter((modelId): modelId is string => modelId !== null);
            if (llmConfig.taskRouting) {
              for (const [category, route] of Object.entries(llmConfig.taskRouting)) {
                const model = normalizeKnownCatalogModelId(route.model);
                llmConfig.taskRouting[category as TaskCategory] = model
                  ? {
                      provider: getModelMetadata(model)?.provider ?? route.provider,
                      model,
                    }
                  : { provider: 'managed_cloud', model: 'auto' };
              }
            }
          }

          if (version < 27 && state.chatPreferences) {
            const cp = state.chatPreferences as Partial<ChatPreferences>;
            cp.memoryEnabled = cp.autoSaveMemories === true;
            cp.autoSaveMemories = cp.memoryEnabled;
            cp.allowToolAssistedMemoryGeneration = false;
          }

          if (version < 28 && state.windowPreferences) {
            state.windowPreferences = {
              ...state.windowPreferences,
              uiScale: state.windowPreferences.uiScale ?? 100,
              reduceMotion: state.windowPreferences.reduceMotion ?? false,
            };
          }
          if (version < 28 && state.chatPreferences) {
            state.chatPreferences = {
              ...state.chatPreferences,
              sendShortcut: state.chatPreferences.sendShortcut ?? 'enter',
            };
          }

          return state as SettingsState;
        },
        onRehydrateStorage: () => (state) => {
          if (state) {
            state.setHasHydrated(true);
            if (isTauriContext() && state.features && Object.keys(state.features).length > 0) {
              invoke('sync_capabilities', { capabilities: state.features }).catch(
                (err: unknown) => {
                  console.warn('[Settings] Failed to sync capabilities on rehydration:', err);
                },
              );
            }
          }
        },
      },
    ),
    { name: 'SettingsStore', enabled: import.meta.env.DEV },
  ),
);

export const enforceTaskRoutingTierRestriction = (planTier: string | null): void => {
  const normalizedTier = normalizeSubscriptionTier(planTier);
  const { llmConfig, setTaskRouting } = useSettingsStore.getState();

  (
    Object.entries(llmConfig.taskRouting) as Array<[TaskCategory, TaskRouting[TaskCategory]]>
  ).forEach(([category, route]) => {
    if (isTaskRoutingModelAllowedForTier(category, route.model, normalizedTier)) {
      return;
    }

    setTaskRouting(category, 'managed_cloud', 'auto');
  });
};

export function initializeTaskRoutingTierRestriction(): () => void {
  const applyValidatedPlan = (plan: string | null) => {
    if (plan) {
      enforceTaskRoutingTierRestriction(plan);
    }
  };

  const selectValidatedPlan = (state: ReturnType<typeof useUnifiedAuthStore.getState>) =>
    state.sessionValidated ? (state.plan ?? 'free') : null;

  applyValidatedPlan(selectValidatedPlan(useUnifiedAuthStore.getState()));
  return useUnifiedAuthStore.subscribe(selectValidatedPlan, applyValidatedPlan);
}

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

export const selectLlmConfig = (state: SettingsState) => state.llmConfig;
export const selectDefaultProvider = (state: SettingsState) => state.llmConfig.defaultProvider;
export const selectTemperature = (state: SettingsState) => state.llmConfig.temperature;
export const selectMaxTokens = (state: SettingsState) => state.llmConfig.maxTokens;
export const selectDefaultModels = (state: SettingsState) => state.llmConfig.defaultModels;
export const selectTaskRouting = (state: SettingsState) => state.llmConfig.taskRouting;
export const selectFavoriteModels = (state: SettingsState) => state.llmConfig.favoriteModels;

export const selectWindowPreferences = (state: SettingsState) => state.windowPreferences;
export const selectTheme = (state: SettingsState) => state.windowPreferences.theme;
export const selectLanguage = (state: SettingsState) => state.windowPreferences.language;
export const selectStartupPosition = (state: SettingsState) =>
  state.windowPreferences.startupPosition;
export const selectDockOnStartup = (state: SettingsState) => state.windowPreferences.dockOnStartup;
export const selectChatFont = (state: SettingsState) =>
  state.windowPreferences.chatFont ?? 'default';

export const selectChatPreferences = (state: SettingsState) => state.chatPreferences;
export const selectPromptCompletionEnabled = (state: SettingsState) =>
  state.chatPreferences.promptCompletionEnabled;
export const selectAlwaysUseAgentMode = (state: SettingsState) =>
  state.chatPreferences.alwaysUseAgentMode;

export const selectExecutionPreferences = (state: SettingsState) => state.executionPreferences;
export const selectMaxTimeoutMinutes = (state: SettingsState) =>
  state.executionPreferences.maxTimeoutMinutes;
export const selectEnableCheckpointing = (state: SettingsState) =>
  state.executionPreferences.enableCheckpointing;
export const selectCheckpointInterval = (state: SettingsState) =>
  state.executionPreferences.checkpointInterval;
export const selectAutoResumeOnRestart = (state: SettingsState) =>
  state.executionPreferences.autoResumeOnRestart;
export const selectEnableTimeoutWarnings = (state: SettingsState) =>
  state.executionPreferences.enableTimeoutWarnings;

export const selectGlobalHotkeyPreferences = (state: SettingsState) =>
  state.globalHotkeyPreferences;
export const selectGlobalHotkeyEnabled = (state: SettingsState) =>
  state.globalHotkeyPreferences.enabled;
export const selectGlobalHotkeyCombo = (state: SettingsState) =>
  state.globalHotkeyPreferences.combo;

export const selectApprovalTimeoutSeconds = (state: SettingsState) =>
  state.executionPreferences.approvalTimeoutSeconds;
export const selectApprovalTimeoutPolicy = (state: SettingsState) =>
  state.executionPreferences.approvalTimeoutPolicy;
export const selectStreamInactivityTimeoutSeconds = (state: SettingsState) =>
  state.executionPreferences.streamInactivityTimeoutSeconds;
export const selectTerminalSandbox = (state: SettingsState) =>
  state.executionPreferences.terminalSandbox;

export const selectAllowedDirectories = (state: SettingsState) => state.allowedDirectories;
export const selectSettingsLoading = (state: SettingsState) => state.loading;
export const selectSettingsError = (state: SettingsState) => state.error;
export const selectSettingsHasHydrated = (state: SettingsState) => state._hasHydrated;

export const selectPersonalization = (state: SettingsState) =>
  state.personalization ?? defaultPersonalization;

export type { SettingsTab } from './settings/dialog';
export { LEGACY_TAB_MAP, useSettingsDialogStore } from './settings/dialog';

export type {
  ThinkingConfigResponse,
  SetThinkingConfigRequest,
  ThinkingContent,
  ThinkingEvent,
} from './settings/thinking';
export {
  useThinkingStore,
  selectThinkingConfig,
  selectIsThinkingEnabled,
  selectThinkingBudget,
  selectCurrentThinking,
} from './settings/thinking';

export type { ChatPreferencesStore } from './settings/chatPrefs';
export { useChatPreferencesStore, defaultChatPreferences } from './settings/chatPrefs';

export { useConnectorsStore } from './settings/connectors';

export type {
  VoiceSettingsBackend,
  VoiceModePhase,
  VoiceTurn,
  VoiceCapabilities,
  TtsVoice,
  WakeWordConfig,
  PttConfig,
  DeepgramConfig,
  DeepgramStreamStatus,
  DeepgramStreamingStats,
  BargeInStatus,
  BargeInStats,
  BargeInConfig,
  SpeechTranscriptResult,
  WhisperModelInfo,
  PiperVoiceInfo,
  LocalModelsInfo,
  TtsConfig,
  PostProcessingMode,
  VoiceInputHotkey,
} from './settings/voice';
export { useVoiceModeStore, useVoiceInputStore, detectVoiceCommand } from './settings/voice';
