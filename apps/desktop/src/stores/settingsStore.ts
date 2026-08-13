/**
 * Settings Store
 *
 * Manages application settings including LLM configuration, window preferences,
 * chat preferences, and allowed directories.
 *
 * Updated to Zustand v5 best practices:
 * - Middleware composition: devtools(persist(subscribeWithSelector(...)))
 * - TypeScript: Using create<State>()() pattern for type inference
 * - Persist middleware: Using createJSONStorage, partialize, version, migrate
 * - Better devtools integration with store name
 * - subscribeWithSelector for granular subscriptions
 */
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

/** Base theme modes. Any other string value is treated as a named theme ID from the theme registry. */
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
  /** User's display name shown to the AI */
  name: string;
  /** User's occupation or role */
  occupation: string;
  /** Background info about the user */
  bio: string;
  /** Response formality: 1 = very casual, 5 = very formal */
  formality: number;
  /** Response warmth: 1 = very direct, 5 = very warm */
  warmth: number;
  /** Response detail level: 1 = very concise, 5 = very detailed */
  detail: number;
  /** How often the AI should use emoji */
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
  /** Base URL for the local LM Studio server (OpenAI-compatible). Default: http://localhost:1234/v1 */
  lmstudioUrl: string;
  /** Base URL for the local llama.cpp `llama-server` (OpenAI-compatible). Default: http://localhost:8080/v1 */
  llamacppUrl: string;
  /** Base URL for the local vLLM server (OpenAI-compatible). Default: http://localhost:8000/v1 */
  vllmUrl: string;
}

interface WindowPreferences {
  theme: Theme;
  language: Language;
  startupPosition: 'center' | 'remember';
  dockOnStartup: 'left' | 'right' | null;
  /** Named theme ID from the theme registry. When set, overrides `theme` for color values. */
  selectedTheme?: string;
  /** When true, applies the OpenDyslexic font for improved readability. */
  dyslexicFont?: boolean;
  /** Selected chat font family: default | sans | mono | dyslexic */
  chatFont?: ChatFont;
  /** Persisted application scale, expressed as a root-font percentage. */
  uiScale?: 90 | 100 | 110;
  /** User override for reduced motion, independent of the OS preference. */
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

/**
 * Policy applied when an approval request times out.
 * - 'auto-deny'    — automatically reject the tool call (safest, default)
 * - 'auto-approve' — automatically approve (use with caution)
 * - 'pause'        — pause the agent and wait for the user to return
 */
export type ApprovalTimeoutPolicy = 'auto-deny' | 'auto-approve' | 'pause';

export type TerminalSandboxPolicy = 'danger-full-access' | 'read-only' | 'workspace-write';
export type TerminalSandboxBackend = 'none' | 'srt';

export interface TerminalSandboxPreferences {
  /** Whether terminal commands should be wrapped in an OS-level sandbox runtime */
  enabled: boolean;
  /** Backend used to enforce sandboxing */
  backend: TerminalSandboxBackend;
  /** Filesystem access preset */
  policy: TerminalSandboxPolicy;
  /** Executable name or absolute path for the sandbox runtime */
  executable: string;
  /** Domain allowlist passed to the sandbox runtime; empty blocks all network access */
  allowedDomains: string[];
}

export interface ExecutionPreferences {
  /** Maximum task timeout in minutes (1-4320, default 1440=24hrs) */
  maxTimeoutMinutes: number;
  /** Enable automatic checkpointing of task progress */
  enableCheckpointing: boolean;
  /** Interval between checkpoints in steps (default 5) */
  checkpointInterval: number;
  /** Enable task resumption after app restart */
  autoResumeOnRestart: boolean;
  /** Show timeout warnings at 1hr, 30min, 5min remaining */
  enableTimeoutWarnings: boolean;
  /** Seconds before a pending approval times out (default 300 = 5 minutes) */
  approvalTimeoutSeconds: number;
  /** What to do when an approval request times out */
  approvalTimeoutPolicy: ApprovalTimeoutPolicy;
  /** Duration (seconds) of inactivity on an active stream before triggering timeout recovery */
  streamInactivityTimeoutSeconds: number;
  /** OS-level sandbox wrapper for terminal command execution */
  terminalSandbox: TerminalSandboxPreferences;
}

export interface GlobalHotkeyPreferences {
  /** Whether the global hotkey is enabled */
  enabled: boolean;
  /** The key combo string, e.g. "CommandOrControl+Shift+Space" */
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
  /**
   * User-customized keybindings.
   * Key = shortcut ID (from DEFAULT_SHORTCUTS), value = serialized combo ("meta+shift+m").
   * Only overrides are stored — missing IDs fall back to DEFAULT_SHORTCUTS.
   */
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

  // Feature capability toggles (key=capability name, value=enabled)
  features: Record<string, boolean>;
  setFeature: (key: string, enabled: boolean) => void;

  // Hydration tracking for persist middleware
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
  // The filesystem MCP command intentionally rejects an empty root list. The
  // native ToolGuard still enforces an empty allowed-directory list as deny-all.
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

// storageFallback is imported from '../lib/storageFallback'

// Version for storage migration
// v2: Simplified for subscription-only model - removed hardcoded providers, only managed_cloud + ollama
// v3: Added alwaysUseAgentMode setting
// v4: Added executionPreferences for extended timeout support
// v5: Added compactMode for simple status messages (like ChatGPT/Claude/Gemini)
// v6: Added language preference
// v7: Added language preference to windowPreferences
// v8: Added autoApproveTools to chatPreferences
// v9: Added globalHotkeyPreferences for system-wide Quick Query hotkey
// v10: Added customModels for user-defined OpenAI-compatible endpoints
// v11: Added features for capability toggles
// v12: Added autoInjectSkills to chatPreferences
// v13: Added agentMode to chatPreferences
// v14: Added providerMode and ollamaUrl to llmConfig
// v15: Added chatStorageMode to chatPreferences (local | cloud)
// v16: Added customKeybindings for user-defined keyboard shortcuts
// v17: Added selectedTheme to windowPreferences (named theme registry ID)
// v18: Coding tools parity (no schema changes, version bump to invalidate stale caches)
// v19: Added dyslexicFont accessibility toggle to windowPreferences
// v20: Added approvalTimeoutSeconds, approvalTimeoutPolicy, streamInactivityTimeoutSeconds
// v21: Added chatFont to windowPreferences for chat font selector tiles
// v22: Added personalization preferences (name, occupation, bio, formality, warmth, detail, emojiUsage)
// v23: Added terminalSandbox execution preferences
// v24: Added lmstudioUrl/llamacppUrl to llmConfig (LM Studio/llama.cpp local runtimes)
// v25: Added vllmUrl to llmConfig (vLLM local runtime)
// v26: Normalized persisted model aliases to canonical catalog IDs
// v27: Added the authoritative memory master and tool-assisted generation scope
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

/**
 * Bridge the persisted "Max Task Timeout" + "Timeout Warnings" execution
 * preferences into the LIVE global TimeoutConfig the task executor actually reads.
 * `settings_save` only stores ExecutionPreferences to disk (unread by the
 * executor); `timeout_set_config` updates the global TIMEOUT_CONFIG that governs
 * task timeouts (per-task overrides aside). Runs on both save (change-time) and
 * load (startup — the global config resets to its 72h default on each launch).
 * Checkpointing/auto-resume need the separate per-task TaskConfig path (tracked as
 * DESKTOP-SETTINGS-PERSISTED-BUT-UNREAD) and are deliberately left untouched here.
 */
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
          const clamped = Math.max(1, Math.min(4320, minutes)); // 1 min to 72 hours
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
          const clamped = Math.max(30, Math.min(3600, seconds)); // 30s to 1 hour
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
          const clamped = Math.max(10, Math.min(300, seconds)); // 10s to 5 minutes
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
          // Apply theme immediately so the entire app updates
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
          // Apply/remove dyslexic font class immediately
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
          // Apply chat font CSS variable immediately
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
                // The former auto-save toggle had no mounted control. Keep it
                // as a wire-compatible mirror of the new master policy.
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
          // showing a value the backend never applied (auto-approving dangerous
          // tools the user thinks are gated, or vice versa). Roll back on failure,
          // mirroring setAgentMode.
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
                // autopilot skips all confirmations; plan mode forces read-only
                autoApproveTools: mode === 'autopilot',
                // plan mode implies "always use agent mode" so the LLM can explore
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
            // Rollback frontend state to match backend
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
            // Web development mode: Tauri commands are unavailable.
            // Use persisted localStorage state + in-memory defaults and skip disk/native calls.
            if (!isTauriContext()) {
              set({ loading: false, error: null }, undefined, 'settings/loadSettings/webMode');
              get().setTheme(get().windowPreferences.theme);
              return;
            }

            // Preserve the renderer-hydrated values for fields introduced into
            // the native schema after launch. An older settings.json omits
            // those fields; migration must not overwrite them with defaults.
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
                // Only merge managed_cloud and ollama from persisted settings
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
              // SET-005 fix: Preserve persisted favoriteModels instead of resetting to []
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

            // Restore every persisted local runtime independently. The helper
            // attempts all four before reporting a failure, so an unavailable
            // optional runtime cannot prevent another configured runtime from
            // being restored.
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

            // FIX (DESKTOP-AGENTMODE-GUARDRAIL-SURFACE-01, audit 2026-07-03):
            // `ToolConfirmationState` on the Rust side now persists
            // agent_mode / auto_approve_all itself (settings_v2) and restores
            // them on every launch, failing closed to Safe/false when
            // nothing is persisted yet. The old code here unconditionally
            // PUSHED this frontend store's own (often-default, or stale —
            // e.g. never updated by SafetyPolicies.tsx, which calls
            // `set_agent_mode` directly and bypasses this store) value down
            // to the backend on every load, silently clobbering whatever
            // the backend had just correctly restored — reproducing the
            // exact "safety setting reverts on restart" regression even
            // after the backend fix. The backend is now the source of
            // truth on load: read it and hydrate this store instead of
            // overwriting it. Only fall back to pushing the frontend value
            // if the read itself fails, so the two layers don't disagree
            // indefinitely.
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

            // Re-apply the persisted memory master switch to the process-local
            // native injection policy after every launch. Missing legacy values
            // are treated as disabled; chat_send_message independently checks
            // the same persisted flag before both retrieval and generation.
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

            // Keep backend capability enforcement in sync with loaded settings.
            // Without this the backend falls back to its defaults, which means a
            // capability the user turned off on disk runs enabled for the whole
            // session — surface that rather than logging it and moving on.
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

            // FIX-003: Sync allowed directories to the backend security guard
            // This ensures file operations respect user-configured allowed directories
            try {
              const dirs = settings.allowedDirectories ?? [];
              await invoke('update_allowed_directories', { paths: dirs });

              // Also update MCP filesystem server to use the allowed directories.
              // Empty directory lists are represented by ToolGuard only.
              if (dirs.length > 0) {
                await McpClient.updateFilesystemDirectories(dirs);
              }
            } catch (error) {
              console.error('Failed to sync allowed directories to backend:', error);
            }

            // Push the loaded max-timeout / timeout-warning prefs into the live
            // TimeoutConfig (resets to default on each launch, so sync on startup).
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

            // `settings_load` is a non-mutating read of the last native commit.
            // Keep it as the rollback snapshot while all live policy owners are
            // staged. Native settings_save is deliberately last: once it
            // succeeds there are no remaining fallible stages.
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

            // FIX (DESKTOP-AGENTMODE-GUARDRAIL-SURFACE-01, audit 2026-07-03):
            // deliberately do NOT push `chatPreferences.agentMode` /
            // `autoApproveTools` to the backend here. `ToolConfirmationState`
            // is the source of truth for these two safety-gating fields and
            // is updated immediately by both write paths that can change
            // them (`setAgentMode`/`setAutoApproveTools` in this store, and
            // SafetyPolicies.tsx's direct `set_agent_mode`/
            // `set_auto_approve_all` invokes, which do NOT go through this
            // store). Re-pushing `chatPreferences.agentMode` here re-opens
            // the exact restart-clobber bug this fix closes: if this store's
            // copy is stale (e.g. still 'build' because the user changed
            // mode via SafetyPolicies.tsx, which never touches this store),
            // any call to `saveSettings()` elsewhere in the app would
            // silently downgrade the user's explicit Safe/Plan choice back
            // to 'build' and — now that the backend persists it — make that
            // downgrade survive restarts too. `loadSettings()` reads the
            // backend's persisted value as authoritative, so this store's
            // `chatPreferences.agentMode`/`autoApproveTools` fields are a
            // best-effort mirror for UI/export purposes only, not a write
            // path for backend gating state.

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
          // Fields that apply in both Tauri (desktop) and web environments.
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

          // Fields that are only meaningful in the native desktop (Tauri) environment.
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
            // SET-005 fix: Preserve user's favoriteModels instead of resetting
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

          // Migration from v1 to v2: Simplified subscription-only model
          if (version < 2) {
            // Reset to subscription defaults
            if (state?.llmConfig) {
              state.llmConfig.defaultProvider = 'managed_cloud';
              state.llmConfig.defaultModels = {
                ollama: state.llmConfig?.defaultModels?.ollama ?? '',
                managed_cloud: state.llmConfig?.defaultModels?.managed_cloud ?? 'auto',
              };
              state.llmConfig.favoriteModels = [];
              // Update taskRouting to use managed_cloud with 'auto'
              if (state.llmConfig.taskRouting) {
                for (const key of Object.keys(state.llmConfig.taskRouting)) {
                  state.llmConfig.taskRouting[key] = { provider: 'managed_cloud', model: 'auto' };
                }
              }
            }
          }

          // Migration from v2 to v3: Add alwaysUseAgentMode setting
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

          // Migration from v3 to v4: Add executionPreferences for extended timeout support
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
                terminalSandbox: { ...defaultTerminalSandboxPreferences },
              };
            }
          }

          // Migration from v4 to v5: Add compactMode to chatPreferences
          if (version < 5) {
            if (state.chatPreferences && state.chatPreferences.compactMode === undefined) {
              state.chatPreferences.compactMode = true; // Enable compact mode by default
            }
          }

          // Migration from v5 to v6: Cleanup - remove unused provider fields
          if (version < 6) {
            if (state?.llmConfig?.defaultModels) {
              state.llmConfig.defaultModels = {
                ollama: state.llmConfig.defaultModels.ollama ?? '',
                managed_cloud: state.llmConfig.defaultModels.managed_cloud ?? 'auto',
              };
            }
          }

          // Migration from v6 to v7: Add language preference
          if (version < 7) {
            if (!state.windowPreferences) {
              state.windowPreferences = {} as WindowPreferences;
            }
            if (!state.windowPreferences.language) {
              state.windowPreferences.language = 'en';
            }
          }

          // Migration from v7 to v8: Add autoApproveTools setting
          if (version < 8) {
            if (state.chatPreferences && state.chatPreferences.autoApproveTools === undefined) {
              state.chatPreferences.autoApproveTools = false;
            }
          }

          // Migration from v8 to v9: Add globalHotkeyPreferences
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

          // Migration from v9 to v10: Add customModels array
          if (version < 10) {
            const stateWithCustomModels = state as Partial<SettingsState>;
            if (!Array.isArray(stateWithCustomModels.customModels)) {
              stateWithCustomModels.customModels = [];
            }
          }

          // Migration from v10 to v11: Add features capability toggles
          if (version < 11) {
            if (!state.features || typeof state.features !== 'object') {
              (state as Partial<SettingsState>).features = {};
            }
          }

          // Migration from v11 to v12: Add autoInjectSkills to chatPreferences
          if (version < 12) {
            if (state.chatPreferences && state.chatPreferences.autoInjectSkills === undefined) {
              state.chatPreferences.autoInjectSkills = true;
            }
          }

          // Migration from v12 to v13: Add agentMode derived from autoApproveTools
          if (version < 13) {
            if (state.chatPreferences && state.chatPreferences.agentMode === undefined) {
              state.chatPreferences.agentMode = state.chatPreferences.autoApproveTools
                ? 'autopilot'
                : 'build';
            }
          }

          // Migration from v13 to v14: Add providerMode and ollamaUrl to llmConfig
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

          // Migration from v14 to v15: Add chatStorageMode to chatPreferences
          if (version < 15) {
            if (state.chatPreferences) {
              const cp = state.chatPreferences as Partial<ChatPreferences>;
              if (cp.chatStorageMode === undefined) {
                cp.chatStorageMode = 'local';
              }
            }
          }

          // Migration from v15 to v16: Add customKeybindings map
          if (version < 16) {
            const stateWithKeys = state as Partial<SettingsState>;
            if (
              !stateWithKeys.customKeybindings ||
              typeof stateWithKeys.customKeybindings !== 'object'
            ) {
              stateWithKeys.customKeybindings = {};
            }
          }

          // Migration from v16 to v17: Add selectedTheme to windowPreferences
          if (version < 17) {
            const stateWithTheme = state as Partial<SettingsState>;
            if (stateWithTheme.windowPreferences) {
              // selectedTheme is undefined by default (no named theme selected)
              if (stateWithTheme.windowPreferences.selectedTheme === undefined) {
                stateWithTheme.windowPreferences = {
                  ...stateWithTheme.windowPreferences,
                  selectedTheme: undefined,
                };
              }
            }
          }

          // Migration from v17 to v18: Coding tools parity — no schema changes needed
          if (version < 18) {
            // No-op: version bump only to signal coding tools parity release
          }

          // Migration from v18 to v19: Add dyslexicFont to windowPreferences
          if (version < 19) {
            if (state.windowPreferences && state.windowPreferences.dyslexicFont === undefined) {
              state.windowPreferences = {
                ...state.windowPreferences,
                dyslexicFont: false,
              };
            }
          }

          // Migration from v19 to v20: Add approval timeout + stream inactivity settings
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

          // Migration from v20 to v21: Add chatFont to windowPreferences
          if (version < 21) {
            if (state.windowPreferences && state.windowPreferences.chatFont === undefined) {
              state.windowPreferences = {
                ...state.windowPreferences,
                chatFont: 'default',
              };
            }
          }

          // Migration from v21 to v22: Add personalization preferences
          if (version < 22) {
            const stateWithPersonalization = state as Partial<SettingsState>;
            if (!stateWithPersonalization.personalization) {
              stateWithPersonalization.personalization = { ...defaultPersonalization };
            }
          }

          // Migration from v22 to v23: Add terminal sandbox preferences
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

          // Migration from v23 to v24: Add lmstudioUrl/llamacppUrl to llmConfig
          if (version < 24 && state.llmConfig) {
            const llmConfig = state.llmConfig as Partial<LLMConfig>;
            if (llmConfig.lmstudioUrl === undefined) {
              llmConfig.lmstudioUrl = 'http://localhost:1234/v1';
            }
            if (llmConfig.llamacppUrl === undefined) {
              llmConfig.llamacppUrl = 'http://localhost:8080/v1';
            }
          }

          // Migration from v24 to v25: Add vllmUrl to llmConfig
          if (version < 25 && state.llmConfig) {
            const llmConfig = state.llmConfig as Partial<LLMConfig>;
            if (llmConfig.vllmUrl === undefined) {
              llmConfig.vllmUrl = 'http://localhost:8000/v1';
            }
          }

          // Migration from v25 to v26: purge selections that refer to models
          // removed by latest-family-only catalog updates.
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

          // Migration from v26 to v27: replace the unmounted auto-save toggle
          // with one explicit master policy. Preserve the old opt-in when it
          // exists; otherwise fail closed instead of silently enabling memory.
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
        // Called when rehydration finishes (with or without errors)
        onRehydrateStorage: () => (state) => {
          if (state) {
            state.setHasHydrated(true);
            // Sync capability toggles to backend on startup
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

/**
 * Keep persisted task routing within the authenticated account's effective
 * tier. This must be installed by the main Desktop window only: auxiliary
 * webviews have independent auth memory and would otherwise rewrite shared
 * settings as Free as soon as they import this module.
 */
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

/**
 * Wait for settings store to finish hydrating from localStorage.
 * Use this before accessing settings that depend on persisted values.
 */
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

// Selectors
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

// ============================================================================
// Absorbed stores — now in settings/ sub-directory (Phase B split)
// All original export names preserved for backwards compat.
// ============================================================================

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
