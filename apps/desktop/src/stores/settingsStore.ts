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
import { getSimpleErrorMessage } from '../lib/errorMessages';
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { storageFallback } from '../lib/storageFallback';
import {
  getAllowedAutoModesForTier,
  getModelMetadata,
  isModelAllowedForTier,
  normalizeSubscriptionTier,
} from '../constants/llm';

import type { Provider } from '../types/provider';
import type { CustomModelConfig } from '../types/customModel';
import type { SubscriptionTier } from '../constants/planModels';
export type { Provider };
import { applyTheme, clearAppliedTheme, getThemeById } from '../themes/index';
import { useUnifiedAuthStore } from './auth';
// AgentMode is now defined at bottom of this file (absorbed from chatPreferencesStore)

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
}

export interface ChatPreferences {
  /** Enable AI-powered prompt completion (ghost text suggestions) */
  promptCompletionEnabled: boolean;
  /** Always use agent mode with tools for all messages (not just action requests) */
  alwaysUseAgentMode: boolean;
  /** Show simple one-line status messages instead of detailed command/code blocks */
  compactMode: boolean;
  /**
   * Auto-approve all tool confirmation dialogs — skips every "Allow this action?" popup.
   * Equivalent to God Mode / trust-all. Use with caution.
   */
  autoApproveTools: boolean;
  /** Enable automatic skill injection based on message intent */
  autoInjectSkills?: boolean;
  /** Automatically save detected assistant decisions as memories */
  autoSaveMemories?: boolean;
  /** Agent execution mode — controls which tools are allowed and whether approval dialogs appear */
  agentMode: AgentMode;
  /**
   * Where chat history is persisted.
   * 'local'  — SQLite only, never synced to cloud (default & recommended for privacy).
   * 'cloud'  — SQLite + best-effort Supabase sync after every message save.
   */
  chatStorageMode: 'local' | 'cloud';
  /** Automatically speak assistant responses via text-to-speech */
  autoTTS?: boolean;
}

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

  setTheme: (theme: Theme) => void;
  setSelectedTheme: (themeId: string | undefined) => void;
  setDyslexicFont: (enabled: boolean) => void;
  setChatFont: (font: ChatFont) => void;
  setLanguage: (language: Language) => void;
  setStartupPosition: (position: 'center' | 'remember') => void;
  setDockOnStartup: (dock: 'left' | 'right' | null) => void;

  setPromptCompletionEnabled: (enabled: boolean) => void;
  setAlwaysUseAgentMode: (enabled: boolean) => void;
  setCompactMode: (enabled: boolean) => void;
  setAutoApproveTools: (enabled: boolean) => Promise<void>;
  setAutoInjectSkills: (enabled: boolean) => void;
  setAutoSaveMemories: (enabled: boolean) => Promise<void>;
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
  },
  chatPreferences: {
    promptCompletionEnabled: true, // AI-powered ghost text enabled by default
    alwaysUseAgentMode: false, // Off by default - only use agent mode for action requests
    compactMode: true, // Show simple status messages like ChatGPT/Claude/Gemini
    autoApproveTools: false, // Off by default - show confirmation dialogs
    autoInjectSkills: true, // Auto-inject relevant skills based on message intent
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
const SETTINGS_STORE_VERSION = 23;

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
          void get().saveSettings();
        },

        setOllamaUrl: (url: string) => {
          set(
            (state) => ({
              llmConfig: { ...state.llmConfig, ollamaUrl: url },
            }),
            undefined,
            'settings/setOllamaUrl',
          );
          void get().saveSettings();
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

        setAutoInjectSkills: (enabled: boolean) => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, autoInjectSkills: enabled },
            }),
            undefined,
            'settings/setAutoInjectSkills',
          );
        },

        setAutoSaveMemories: async (enabled: boolean) => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, autoSaveMemories: enabled },
            }),
            undefined,
            'settings/setAutoSaveMemories',
          );
          try {
            await get().saveSettings();
          } catch (error) {
            console.error('Failed to persist auto-save memories setting:', error);
          }
        },

        setAutoApproveTools: async (enabled: boolean) => {
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

            // Try to load settings from disk first, falling back to in-memory defaults
            let settings: {
              llmConfig: LLMConfig;
              windowPreferences: WindowPreferences;
              chatPreferences?: ChatPreferences;
              executionPreferences?: ExecutionPreferences;
              globalHotkeyPreferences?: GlobalHotkeyPreferences;
              allowedDirectories: string[];
              customModels?: CustomModelConfig[];
              featureFlags?: Record<string, boolean>;
            };

            try {
              settings = await invoke<{
                llmConfig: LLMConfig;
                windowPreferences: WindowPreferences;
                chatPreferences?: ChatPreferences;
                executionPreferences?: ExecutionPreferences;
                globalHotkeyPreferences?: GlobalHotkeyPreferences;
                allowedDirectories: string[];
                customModels?: CustomModelConfig[];
                featureFlags?: Record<string, boolean>;
              }>('settings_load_from_disk');
            } catch (diskError) {
              console.warn(
                '[settingsStore] Failed to load from disk, using in-memory defaults:',
                diskError,
              );
              settings = await invoke<{
                llmConfig: LLMConfig;
                windowPreferences: WindowPreferences;
                chatPreferences?: ChatPreferences;
                executionPreferences?: ExecutionPreferences;
                globalHotkeyPreferences?: GlobalHotkeyPreferences;
                allowedDirectories: string[];
                customModels?: CustomModelConfig[];
                featureFlags?: Record<string, boolean>;
              }>('settings_load');
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
            };

            const mergedWindowPreferences: WindowPreferences = {
              ...defaultSettings.windowPreferences,
              ...(settings.windowPreferences ?? defaultSettings.windowPreferences),
              language:
                settings.windowPreferences?.language ?? defaultSettings.windowPreferences.language,
            };

            const mergedChatPreferences: ChatPreferences = {
              ...defaultSettings.chatPreferences,
              ...(settings.chatPreferences ?? defaultSettings.chatPreferences),
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
            };

            const mergedGlobalHotkeyPreferences: GlobalHotkeyPreferences = {
              ...defaultSettings.globalHotkeyPreferences,
              ...(settings.globalHotkeyPreferences ?? defaultSettings.globalHotkeyPreferences),
            };

            // Configure local Ollama provider
            try {
              await invoke('llm_configure_provider', {
                provider: 'ollama',
                apiKey: null,
                baseUrl: mergedLLMConfig.ollamaUrl || 'http://localhost:11434',
              });
            } catch (error) {
              console.error('Failed to configure Ollama provider:', error);
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
                allowedDirectories: settings.allowedDirectories ?? [],
                customModels: Array.isArray(settings.customModels) ? settings.customModels : [],
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

            // Sync autoApproveTools to backend on load
            try {
              await invoke('set_auto_approve_all', {
                enabled: mergedChatPreferences.autoApproveTools ?? false,
              });
            } catch (error) {
              console.error('Failed to sync auto-approve-all to backend:', error);
            }

            try {
              await invoke('set_agent_mode', {
                mode: mergedChatPreferences.agentMode ?? 'build',
              });
            } catch (error) {
              console.error('Failed to sync agent mode to backend:', error);
            }

            // Keep backend capability enforcement in sync with loaded settings.
            try {
              await invoke('sync_capabilities', {
                capabilities:
                  settings.featureFlags && typeof settings.featureFlags === 'object'
                    ? settings.featureFlags
                    : get().features,
              });
            } catch (error) {
              console.error('Failed to sync capabilities to backend:', error);
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
            } = get();
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
              },
            });

            // FIX-003: Sync allowed directories to the backend security guard
            // This ensures file operations respect user-configured allowed directories
            try {
              await invoke('update_allowed_directories', { paths: allowedDirectories });

              if (allowedDirectories.length > 0) {
                // Also update MCP filesystem server to use the allowed directories
                await McpClient.updateFilesystemDirectories(allowedDirectories);
              }
            } catch (error) {
              console.error('Failed to sync allowed directories to backend:', error);
            }

            // Sync autoApproveTools flag to the backend confirmation state
            try {
              await invoke('set_auto_approve_all', { enabled: chatPreferences.autoApproveTools });
            } catch (error) {
              console.error('Failed to sync auto-approve-all to backend:', error);
            }

            try {
              await invoke('set_agent_mode', { mode: chatPreferences.agentMode });
            } catch (error) {
              console.error('Failed to sync agent mode to backend:', error);
            }

            // Sync capability toggles on explicit save.
            try {
              await invoke('sync_capabilities', { capabilities: features });
            } catch (error) {
              console.error('Failed to sync capabilities to backend:', error);
            }

            set({ loading: false }, undefined, 'settings/saveSettings/success');
          } catch (error) {
            console.error('Failed to save settings:', error);
            set(
              { error: getSimpleErrorMessage(error), loading: false },
              undefined,
              'settings/saveSettings/error',
            );
            throw error;
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

if (typeof window !== 'undefined') {
  useUnifiedAuthStore.subscribe(
    (state) => state.plan,
    (plan) => {
      enforceTaskRoutingTierRestriction(plan ?? 'free');
    },
  );
  enforceTaskRoutingTierRestriction(useUnifiedAuthStore.getState().plan ?? 'free');
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
// Settings Dialog Store (absorbed from settingsDialogStore.ts — task-w58)
// ============================================================================

export type SettingsTab =
  | 'general'
  | 'account'
  | 'appearance'
  | 'privacy'
  | 'models-keys'
  | 'agents'
  | 'mcp-skills'
  | 'connectors'
  | 'notifications'
  | 'voice'
  | 'team'
  | 'personalization'
  | 'features'
  | 'oauth-credentials'
  | 'api-keys'
  | 'task-routing'
  | 'agent-execution'
  | 'mcp'
  | 'mcp-server'
  | 'extensions'
  | 'analytics'
  | 'tools'
  | 'research'
  | 'keybindings'
  | 'themes'
  | 'apps-integrations'
  | 'customize'
  | 'billing';

export const LEGACY_TAB_MAP: Partial<Record<SettingsTab, SettingsTab>> = {
  team: 'account',
  personalization: 'appearance',
  features: 'agents',
  'oauth-credentials': 'connectors',
  'api-keys': 'models-keys',
  'task-routing': 'models-keys',
  'agent-execution': 'agents',
  mcp: 'mcp-skills',
  'mcp-server': 'mcp-skills',
  extensions: 'connectors',
  analytics: 'privacy',
  tools: 'mcp-skills',
  research: 'mcp-skills',
  keybindings: 'general',
  themes: 'appearance',
  'apps-integrations': 'connectors',
  customize: 'mcp-skills',
  billing: 'account',
};

interface SettingsDialogState {
  settingsOpen: boolean;
  settingsInitialTab: SettingsTab;
  shortcutsOpen: boolean;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  openShortcuts: () => void;
  closeShortcuts: () => void;
}

export const useSettingsDialogStore = create<SettingsDialogState>((set) => ({
  settingsOpen: false,
  settingsInitialTab: 'general',
  shortcutsOpen: false,
  openSettings: (tab = 'general') => set({ settingsOpen: true, settingsInitialTab: tab }),
  closeSettings: () => set({ settingsOpen: false }),
  openShortcuts: () => set({ shortcutsOpen: true }),
  closeShortcuts: () => set({ shortcutsOpen: false }),
}));

// ============================================================================
// Thinking Store (absorbed from thinkingStore.ts — task-w58)
// ============================================================================

import { immer as thinkingImmer } from 'zustand/middleware/immer';
import { listen as thinkingListen, isTauri as isTauriThinking } from '@/lib/tauri-mock';

export interface ThinkingConfigResponse {
  enabled: boolean;
  budget: string;
  budget_tokens: number;
  emit_thinking_events: boolean;
  include_thinking_summary: boolean;
}

export interface SetThinkingConfigRequest {
  enabled?: boolean;
  budget?: string;
  emitThinkingEvents?: boolean;
  includeThinkingSummary?: boolean;
}

export interface ThinkingContent {
  thinking: string;
  started_at: string;
  completed_at: string | null;
}

export interface ThinkingEvent {
  event_type: string;
  content: string | null;
  tokens: number | null;
  message_id: string | null;
}

interface ThinkingStateShape {
  config: ThinkingConfigResponse | null;
  isConfigLoading: boolean;
  currentThinking: ThinkingContent | null;
  modelSupport: Record<string, boolean>;
}

interface ThinkingActionsShape {
  loadConfig: () => Promise<ThinkingConfigResponse>;
  setConfig: (request: SetThinkingConfigRequest) => Promise<ThinkingConfigResponse>;
  toggle: () => Promise<boolean>;
  setBudget: (budget: string) => Promise<ThinkingConfigResponse>;
  detectTrigger: (message: string) => Promise<ThinkingConfigResponse>;
  checkModelSupport: (model: string) => Promise<boolean>;
  getCurrentThinking: () => Promise<ThinkingContent | null>;
  initialize: () => Promise<void>;
}

export const useThinkingStore = create<ThinkingStateShape & ThinkingActionsShape>()(
  devtools(
    thinkingImmer((set, get) => ({
      config: null,
      isConfigLoading: false,
      currentThinking: null,
      modelSupport: {},

      loadConfig: async () => {
        if (!isTauriThinking) {
          set((state) => {
            state.isConfigLoading = false;
          });
          return (
            get().config ?? {
              enabled: false,
              budget: 'medium',
              budget_tokens: 10000,
              emit_thinking_events: false,
              include_thinking_summary: false,
            }
          );
        }
        set((state) => {
          state.isConfigLoading = true;
        });
        try {
          const config = (await invoke('thinking_get_config')) as ThinkingConfigResponse;
          set((state) => {
            state.config = config;
            state.isConfigLoading = false;
          });
          return config;
        } catch (error) {
          console.error('Failed to load thinking config:', error);
          set((state) => {
            state.isConfigLoading = false;
          });
          throw error;
        }
      },

      setConfig: async (request) => {
        if (!isTauriThinking)
          return (
            get().config ?? {
              enabled: false,
              budget: 'medium',
              budget_tokens: 10000,
              emit_thinking_events: false,
              include_thinking_summary: false,
            }
          );
        try {
          const config = (await invoke('thinking_set_config', {
            request: {
              enabled: request.enabled,
              budget: request.budget,
              emit_thinking_events: request.emitThinkingEvents,
              include_thinking_summary: request.includeThinkingSummary,
            },
          })) as ThinkingConfigResponse;
          set((state) => {
            state.config = config;
          });
          return config;
        } catch (error) {
          console.error('Failed to set thinking config:', error);
          throw error;
        }
      },

      toggle: async () => {
        if (!isTauriThinking) {
          const newEnabled = !(get().config?.enabled ?? false);
          set((state) => {
            if (state.config) state.config.enabled = newEnabled;
          });
          return newEnabled;
        }
        try {
          const enabled = (await invoke('thinking_toggle')) as boolean;
          set((state) => {
            if (state.config) state.config.enabled = enabled;
          });
          return enabled;
        } catch (error) {
          console.error('Failed to toggle thinking:', error);
          throw error;
        }
      },

      setBudget: async (budget) => {
        if (!isTauriThinking)
          return (
            get().config ?? {
              enabled: false,
              budget,
              budget_tokens: 10000,
              emit_thinking_events: false,
              include_thinking_summary: false,
            }
          );
        try {
          const config = (await invoke('thinking_set_budget', {
            budget,
          })) as ThinkingConfigResponse;
          set((state) => {
            state.config = config;
          });
          return config;
        } catch (error) {
          console.error('Failed to set thinking budget:', error);
          throw error;
        }
      },

      detectTrigger: async (message) => {
        if (!isTauriThinking)
          return (
            get().config ?? {
              enabled: false,
              budget: 'medium',
              budget_tokens: 10000,
              emit_thinking_events: false,
              include_thinking_summary: false,
            }
          );
        try {
          return (await invoke('thinking_detect_trigger', { message })) as ThinkingConfigResponse;
        } catch (error) {
          console.error('Failed to detect thinking trigger:', error);
          throw error;
        }
      },

      checkModelSupport: async (model) => {
        if (!isTauriThinking) return false;
        const cached = get().modelSupport[model];
        if (cached !== undefined) return cached;
        try {
          const supported = (await invoke('thinking_model_supports', { model })) as boolean;
          set((state) => {
            state.modelSupport[model] = supported;
          });
          return supported;
        } catch (error) {
          console.error('Failed to check model thinking support:', error);
          return false;
        }
      },

      getCurrentThinking: async () => {
        if (!isTauriThinking) return get().currentThinking;
        try {
          const thinking = (await invoke('thinking_get_current')) as ThinkingContent | null;
          set((state) => {
            state.currentThinking = thinking;
          });
          return thinking;
        } catch (error) {
          console.error('Failed to get current thinking:', error);
          return null;
        }
      },

      initialize: async () => {
        if (!isTauriThinking) return;
        await get().loadConfig();
        thinkingListen<ThinkingEvent>('thinking:event', (event) => {
          const payload = event.payload;
          if (payload.event_type === 'start') {
            set((state) => {
              state.currentThinking = {
                thinking: '',
                started_at: new Date().toISOString(),
                completed_at: null,
              };
            });
          } else if (payload.event_type === 'delta' && payload.content) {
            set((state) => {
              if (state.currentThinking) state.currentThinking.thinking += payload.content ?? '';
            });
          } else if (payload.event_type === 'complete') {
            set((state) => {
              if (state.currentThinking) {
                state.currentThinking.completed_at = new Date().toISOString();
                if (payload.content) state.currentThinking.thinking = payload.content;
              }
            });
          }
        });
      },
    })),
    { name: 'ThinkingStore', enabled: import.meta.env.DEV },
  ),
);

export const selectThinkingConfig = (state: ThinkingStateShape) => state.config;
export const selectIsThinkingEnabled = (state: ThinkingStateShape) =>
  state.config?.enabled ?? false;
export const selectThinkingBudget = (state: ThinkingStateShape) => state.config?.budget ?? 'medium';
export const selectCurrentThinking = (state: ThinkingStateShape) => state.currentThinking;

// ============================================================================
// Chat Preferences Store (absorbed from chatPreferencesStore.ts — task-w58)
// ============================================================================

import {
  persist as chatPrefPersist,
  subscribeWithSelector as chatPrefSWS,
  createJSONStorage as chatPrefJSONStorage,
} from 'zustand/middleware';

export type AgentMode = 'safe' | 'plan' | 'build' | 'autopilot';

interface ChatPreferencesState {
  chatPreferences: ChatPreferences;
  lastInputWasVoice: boolean;
}

interface ChatPreferencesActions {
  setPromptCompletionEnabled: (enabled: boolean) => void;
  setAlwaysUseAgentMode: (enabled: boolean) => void;
  setCompactMode: (enabled: boolean) => void;
  setAutoInjectSkills: (enabled: boolean) => void;
  setAutoApproveTools: (enabled: boolean) => Promise<void>;
  setChatAgentMode: (mode: AgentMode) => Promise<void>;
  setAutoTTS: (enabled: boolean) => void;
  setLastInputWasVoice: (wasVoice: boolean) => void;
}

export type ChatPreferencesStore = ChatPreferencesState & ChatPreferencesActions;

export const defaultChatPreferences: ChatPreferences = {
  promptCompletionEnabled: true,
  alwaysUseAgentMode: false,
  compactMode: true,
  autoApproveTools: false,
  autoInjectSkills: true,
  agentMode: 'build' as AgentMode,
  chatStorageMode: 'local',
  autoTTS: true,
};

export const useChatPreferencesStore = create<ChatPreferencesStore>()(
  devtools(
    chatPrefPersist(
      chatPrefSWS((set) => ({
        chatPreferences: { ...defaultChatPreferences },
        lastInputWasVoice: false,
        setPromptCompletionEnabled: (enabled) => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, promptCompletionEnabled: enabled },
            }),
            undefined,
            'chatPreferences/setPromptCompletionEnabled',
          );
        },
        setAlwaysUseAgentMode: (enabled) => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, alwaysUseAgentMode: enabled },
            }),
            undefined,
            'chatPreferences/setAlwaysUseAgentMode',
          );
        },
        setCompactMode: (enabled) => {
          set(
            (state) => ({ chatPreferences: { ...state.chatPreferences, compactMode: enabled } }),
            undefined,
            'chatPreferences/setCompactMode',
          );
        },
        setAutoInjectSkills: (enabled) => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, autoInjectSkills: enabled },
            }),
            undefined,
            'chatPreferences/setAutoInjectSkills',
          );
        },
        setAutoApproveTools: async (enabled) => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, autoApproveTools: enabled },
            }),
            undefined,
            'chatPreferences/setAutoApproveTools',
          );
          try {
            await invoke('set_auto_approve_all', { enabled });
          } catch (error) {
            console.error('Failed to sync auto-approve-all to backend:', error);
          }
        },
        setChatAgentMode: async (mode) => {
          await useSettingsStore.getState().setAgentMode(mode);
        },
        setAutoTTS: (enabled) => {
          set(
            (state) => ({ chatPreferences: { ...state.chatPreferences, autoTTS: enabled } }),
            undefined,
            'chatPreferences/setAutoTTS',
          );
        },
        setLastInputWasVoice: (wasVoice) => {
          set({ lastInputWasVoice: wasVoice }, undefined, 'chatPreferences/setLastInputWasVoice');
        },
      })),
      {
        name: 'agiworkforce-chat-preferences',
        version: 2,
        storage: chatPrefJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        migrate: (persistedState: unknown, version: number) => {
          const state = persistedState as ChatPreferencesStore;
          if (version < 2)
            state.chatPreferences = {
              ...defaultChatPreferences,
              ...state.chatPreferences,
              autoTTS: true,
            };
          return state;
        },
        partialize: (state) => ({ chatPreferences: state.chatPreferences }),
      },
    ),
    { name: 'ChatPreferencesStore', enabled: import.meta.env.DEV },
  ),
);

// =============================================================================
// Connectors Store (absorbed from connectorsStore.ts — task-w58)
// =============================================================================

import { CONNECTORS } from '../components/Connectors/connectorDefinitions';

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

interface ConnectorsState {
  connectedIds: string[];
  loading: Record<string, boolean>;
  error: Record<string, string | null>;
  pendingOAuth: Record<string, boolean>;
  oauthStartedAt: Record<string, number>;
  _oauthTimers: Record<string, ReturnType<typeof setTimeout>>;

  connect: (id: string) => Promise<void>;
  connectWithApiKey: (id: string, apiKey: string) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  fetchConnected: () => Promise<void>;
  completeOAuth: (id: string) => Promise<void>;
  timeoutOAuth: (id: string) => void;
  isConnected: (id: string) => boolean;
  isLoading: (id: string) => boolean;
  getError: (id: string) => string | null;
  clearError: (id: string) => void;
  clearAllTimers: () => void;
  resetOnLogout: () => void;
}

export const useConnectorsStore = create<ConnectorsState>()(
  devtools(
    persist(
      (set, get) => ({
        connectedIds: [],
        loading: {},
        error: {},
        pendingOAuth: {},
        oauthStartedAt: {},
        _oauthTimers: {},

        connect: async (id) => {
          set((state) => ({
            loading: { ...state.loading, [id]: true },
            error: { ...state.error, [id]: null },
          }));
          try {
            const connector = CONNECTORS.find((c) => c.id === id);
            const authType = connector?.authType ?? 'oauth';
            switch (authType) {
              case 'oauth': {
                await McpClient.oauthStartRaw(id);
                const now = Date.now();
                const timerId = setTimeout(() => {
                  get().timeoutOAuth(id);
                }, OAUTH_TIMEOUT_MS);
                set((state) => ({
                  loading: { ...state.loading, [id]: false },
                  pendingOAuth: { ...state.pendingOAuth, [id]: true },
                  oauthStartedAt: { ...state.oauthStartedAt, [id]: now },
                  _oauthTimers: { ...state._oauthTimers, [id]: timerId },
                }));
                return;
              }
              case 'api_key':
                await McpClient.connectConnector(id);
                break;
              case 'mcp_remote':
                await McpClient.connectConnector(id);
                break;
              case 'none':
                break;
            }
            set((state) => ({
              connectedIds: [...new Set([...state.connectedIds, id])],
              loading: { ...state.loading, [id]: false },
            }));
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            set((state) => ({
              loading: { ...state.loading, [id]: false },
              error: { ...state.error, [id]: message },
            }));
            throw err;
          }
        },

        connectWithApiKey: async (id, apiKey) => {
          set((state) => ({
            loading: { ...state.loading, [id]: true },
            error: { ...state.error, [id]: null },
          }));
          try {
            await McpClient.saveApiKey(id, apiKey);
            await McpClient.connectConnector(id);
            set((state) => ({
              connectedIds: [...new Set([...state.connectedIds, id])],
              loading: { ...state.loading, [id]: false },
            }));
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            set((state) => ({
              loading: { ...state.loading, [id]: false },
              error: { ...state.error, [id]: message },
            }));
            throw err;
          }
        },

        disconnect: async (id) => {
          set((state) => ({
            loading: { ...state.loading, [id]: true },
            error: { ...state.error, [id]: null },
          }));
          try {
            await McpClient.oauthDisconnectRaw(id);
            set((state) => ({
              connectedIds: state.connectedIds.filter((cid) => cid !== id),
              loading: { ...state.loading, [id]: false },
              pendingOAuth: { ...state.pendingOAuth, [id]: false },
            }));
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Disconnection failed';
            set((state) => ({
              loading: { ...state.loading, [id]: false },
              error: { ...state.error, [id]: message },
            }));
          }
        },

        fetchConnected: async () => {
          try {
            const providers = await McpClient.listConnectedProviders();
            set({ connectedIds: providers });
          } catch {
            /* silently fail */
          }
        },

        completeOAuth: async (id) => {
          const timerId = get()._oauthTimers[id];
          if (timerId !== undefined) clearTimeout(timerId);
          set((state) => ({
            loading: { ...state.loading, [id]: true },
            pendingOAuth: { ...state.pendingOAuth, [id]: false },
            oauthStartedAt: { ...state.oauthStartedAt, [id]: 0 },
            _oauthTimers: {
              ...state._oauthTimers,
              [id]: undefined as unknown as ReturnType<typeof setTimeout>,
            },
          }));
          try {
            await McpClient.connectConnector(id);
            const providers = await McpClient.listConnectedProviders().catch(() => [] as string[]);
            if (!providers.includes(id))
              console.warn(
                `[ConnectorsStore] MCP server for "${id}" not active after OAuth — marking connected anyway (tokens stored)`,
              );
            set((state) => ({
              connectedIds: [...new Set([...state.connectedIds, id])],
              loading: { ...state.loading, [id]: false },
            }));
          } catch {
            set((state) => ({
              connectedIds: [...new Set([...state.connectedIds, id])],
              loading: { ...state.loading, [id]: false },
            }));
          }
        },

        timeoutOAuth: (id) => {
          set((state) => ({
            pendingOAuth: { ...state.pendingOAuth, [id]: false },
            loading: { ...state.loading, [id]: false },
            error: {
              ...state.error,
              [id]: 'Authorization timed out. Please try connecting again.',
            },
            oauthStartedAt: { ...state.oauthStartedAt, [id]: 0 },
          }));
        },
        isConnected: (id) => get().connectedIds.includes(id),
        isLoading: (id) => Boolean(get().loading[id]),
        getError: (id) => get().error[id] ?? null,
        clearError: (id) => {
          set((state) => ({ error: { ...state.error, [id]: null } }));
        },
        clearAllTimers: () => {
          const timers = get()._oauthTimers;
          for (const timerId of Object.values(timers)) {
            if (timerId !== undefined) clearTimeout(timerId);
          }
          set({ _oauthTimers: {} });
        },
        resetOnLogout: () => {
          get().clearAllTimers();
          set({
            connectedIds: [],
            loading: {},
            error: {},
            pendingOAuth: {},
            oauthStartedAt: {},
            _oauthTimers: {},
          });
        },
      }),
      {
        name: 'connectors-store',
        version: 4,
        migrate: (persistedState, version) => {
          if (version < 3)
            return {
              ...(persistedState as object),
              connectedIds: [],
              loading: {},
              error: {},
              pendingOAuth: {},
              oauthStartedAt: {},
              _oauthTimers: {},
            };
          if (version < 4)
            return { ...(persistedState as ConnectorsState), oauthStartedAt: {}, _oauthTimers: {} };
          return persistedState as ConnectorsState;
        },
        partialize: (state) => ({
          connectedIds: state.connectedIds,
          loading: state.loading,
          error: state.error,
          pendingOAuth: state.pendingOAuth,
          oauthStartedAt: state.oauthStartedAt,
        }),
      },
    ),
    { name: 'ConnectorsStore' },
  ),
);

// =============================================================================
// Absorbed from voiceModeStore.ts
// =============================================================================

import {
  listen as voiceListen,
  isTauri as voiceIsTauri,
  type UnlistenFn as VoiceUnlistenFn,
} from '../lib/tauri-mock';
import { getProviderDefaultModel, getTaskModelForProvider } from '../constants/llm';
import { getDefaultModelFor } from '@agiworkforce/types';
import { useModelStore } from './modelStore';
import {
  voiceGetCapabilities,
  voiceGetSettings,
  voiceConfigure,
  voiceTtsSpeak,
  voiceTtsSpeakWithBargeIn,
  voiceTtsStop,
  voiceTtsIsPlaying,
  voiceTtsListVoices,
  voiceTtsConfigure,
  voiceTtsSpeakLocal,
  voiceWakeEnable,
  voiceWakeDisable,
  voiceWakeStatus,
  voiceWakeConfigure,
  voicePttConfigure,
  voicePttState,
  voicePttKeyDown,
  voicePttKeyUp,
  voiceStartGlobalPtt,
  voiceStopGlobalPtt,
  voiceInjectText,
  voiceDeepgramConfigure,
  voiceStartDeepgramStream,
  voiceStopDeepgramStream,
  voiceDeepgramSendAudio,
  voiceDeepgramStatus,
  voiceEnableBargeIn,
  voiceGetBargeInStatus,
  voiceConfigureBargeIn,
  voiceStartBargeInMonitoring,
  voiceStopBargeInMonitoring,
  speechStartRecording,
  speechStopAndTranscribe,
  voiceListLocalModels,
  voiceDownloadWhisperModel,
  voiceListWhisperModels,
  voiceSetWhisperModel,
  voiceDownloadPiperVoice,
  voiceListPiperVoices,
  voiceSetPiperVoice,
  voiceTranscribeBlob,
} from '../api/voice';
import type {
  VoiceCapabilities,
  VoiceSettings as VoiceSettingsApi,
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
} from '../api/voice';

export type {
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
};

export type VoiceSettingsBackend = VoiceSettingsApi;
export type VoiceModePhase = 'idle' | 'listening' | 'processing' | 'speaking';

export interface VoiceTurn {
  id: string;
  userText: string;
  aiText: string;
  timestamp: number;
}

interface VoiceDeepgramTranscriptEvent {
  transcript?: string;
  text?: string;
  isFinal?: boolean;
  is_final?: boolean;
}

interface VoiceLLMResponse {
  content: string;
}

interface VoiceModeState {
  isOpen: boolean;
  phase: VoiceModePhase;
  userTranscript: string;
  aiResponse: string;
  error: string | null;
  turns: VoiceTurn[];
  audioLevel: number;
  capabilities: VoiceCapabilities | null;
  wakeWordActive: boolean;
  globalPttActive: boolean;
  deepgramStreaming: boolean;
  bargeInEnabled: boolean;
  _mediaStream: MediaStream | null;
  _recorder: MediaRecorder | null;
  _audioChunks: Blob[];
  _analyser: AnalyserNode | null;
  _audioContext: AudioContext | null;
  _animFrameId: number | null;
  _isSpeaking: boolean;
  _deepgramUnlisten: VoiceUnlistenFn | null;
  open: () => void;
  close: () => void;
  startListening: () => Promise<void>;
  stopListeningAndProcess: (onSend?: (text: string) => void) => Promise<void>;
  stopSpeaking: () => Promise<void>;
  reset: () => void;
  fetchCapabilities: () => Promise<VoiceCapabilities | null>;
  getBackendSettings: () => Promise<VoiceSettingsBackend | null>;
  configureBackend: (provider?: string, model?: string, language?: string) => Promise<void>;
  speakWithBargeIn: (text: string) => Promise<void>;
  stopTts: () => Promise<boolean>;
  isTtsPlaying: () => Promise<boolean>;
  listTtsVoices: () => Promise<TtsVoice[]>;
  configureTts: (config: TtsConfig) => Promise<void>;
  speakLocal: (text: string, rate?: number, volume?: number) => Promise<void>;
  enableWakeWord: (config?: WakeWordConfig) => Promise<void>;
  disableWakeWord: () => Promise<void>;
  getWakeWordStatus: () => Promise<boolean>;
  configureWakeWord: (config: WakeWordConfig) => Promise<void>;
  configurePtt: (config: PttConfig) => Promise<void>;
  getPttState: () => Promise<string>;
  pttKeyDown: () => Promise<void>;
  pttKeyUp: () => Promise<number | null>;
  startGlobalPtt: () => Promise<void>;
  stopGlobalPtt: () => Promise<void>;
  injectText: (text: string) => Promise<void>;
  configureDeepgram: (config: DeepgramConfig) => Promise<void>;
  startDeepgramStream: () => Promise<void>;
  stopDeepgramStream: () => Promise<DeepgramStreamingStats | null>;
  sendDeepgramAudio: (audioData: number[]) => Promise<void>;
  getDeepgramStatus: () => Promise<DeepgramStreamStatus | null>;
  enableBargeIn: (enabled: boolean) => Promise<boolean>;
  getBargeInStatus: () => Promise<BargeInStatus | null>;
  configureBargeIn: (
    sensitivity?: number,
    minSpeechMs?: number,
    consecutiveFramesThreshold?: number,
  ) => Promise<BargeInConfig | null>;
  startBargeInMonitoring: () => Promise<boolean>;
  stopBargeInMonitoring: () => Promise<boolean>;
  startNativeRecording: (provider?: string) => Promise<void>;
  stopNativeRecordingAndTranscribe: (
    provider?: string,
    language?: string,
  ) => Promise<SpeechTranscriptResult | null>;
  listLocalModels: () => Promise<LocalModelsInfo | null>;
  downloadWhisperModel: (modelSize: string) => Promise<string | null>;
  listWhisperModels: () => Promise<WhisperModelInfo[]>;
  setWhisperModel: (modelSize: string) => Promise<void>;
  downloadPiperVoice: (voiceId: string) => Promise<string | null>;
  listPiperVoices: () => Promise<PiperVoiceInfo[]>;
  setPiperVoice: (voiceId: string) => Promise<void>;
}

function voiceUid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useVoiceModeStore = create<VoiceModeState>()(
  devtools(
    persist(
      (set, get) => ({
        isOpen: false,
        phase: 'idle',
        userTranscript: '',
        aiResponse: '',
        error: null,
        turns: [],
        audioLevel: 0,
        capabilities: null,
        wakeWordActive: false,
        globalPttActive: false,
        deepgramStreaming: false,
        bargeInEnabled: false,
        _mediaStream: null,
        _recorder: null,
        _audioChunks: [],
        _analyser: null,
        _audioContext: null,
        _animFrameId: null,
        _isSpeaking: false,
        _deepgramUnlisten: null,

        open: () => {
          set({ isOpen: true, phase: 'idle', error: null, userTranscript: '', aiResponse: '' });
          get()
            .fetchCapabilities()
            .catch((err: unknown) => {
              console.warn('[voiceMode] fetchCapabilities failed', err);
            });
        },

        close: () => {
          const { _mediaStream, _recorder, _audioContext, _animFrameId, _deepgramUnlisten } = get();
          if (get()._isSpeaking) {
            voiceTtsStop().catch((err: unknown) => {
              console.warn('[voiceMode] voiceTtsStop on close failed', err);
            });
          }
          if (_recorder && _recorder.state !== 'inactive') {
            try {
              _recorder.stop();
            } catch (err) {
              console.warn('[voiceMode] recorder.stop on close failed', err);
            }
          }
          _mediaStream?.getTracks().forEach((t) => t.stop());
          if (_animFrameId !== null) {
            cancelAnimationFrame(_animFrameId);
          }
          if (_audioContext) {
            try {
              _audioContext.close();
            } catch {
              /* ignore */
            }
          }
          _deepgramUnlisten?.();
          set({
            isOpen: false,
            phase: 'idle',
            userTranscript: '',
            aiResponse: '',
            error: null,
            audioLevel: 0,
            _mediaStream: null,
            _recorder: null,
            _audioChunks: [],
            _analyser: null,
            _audioContext: null,
            _animFrameId: null,
            _isSpeaking: false,
            _deepgramUnlisten: null,
          });
        },

        startListening: async () => {
          const state = get();
          if (state.phase === 'listening') return;
          set({
            phase: 'listening',
            userTranscript: '',
            aiResponse: '',
            error: null,
            audioLevel: 0,
          });
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
            });
            let audioContext: AudioContext | null = null;
            let analyser: AnalyserNode | null = null;
            let frameId: number | null = null;
            try {
              audioContext = new AudioContext();
              const source = audioContext.createMediaStreamSource(stream);
              analyser = audioContext.createAnalyser();
              analyser.fftSize = 256;
              analyser.smoothingTimeConstant = 0.8;
              source.connect(analyser);
              const dataArray = new Uint8Array(analyser.frequencyBinCount);
              const updateLevel = () => {
                if (get().phase !== 'listening') return;
                if (!analyser) return;
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                  const val = dataArray[i] ?? 0;
                  sum += val * val;
                }
                const rms = Math.sqrt(sum / dataArray.length) / 255;
                set({ audioLevel: Math.min(1, rms * 2.5) });
                const id = requestAnimationFrame(updateLevel);
                set({ _animFrameId: id });
              };
              frameId = requestAnimationFrame(updateLevel);
            } catch {
              audioContext = null;
              analyser = null;
            }
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
              ? 'audio/webm;codecs=opus'
              : MediaRecorder.isTypeSupported('audio/webm')
                ? 'audio/webm'
                : 'audio/mp4';
            const recorder = new MediaRecorder(stream, { mimeType });
            const chunks: Blob[] = [];
            recorder.ondataavailable = (e) => {
              if (e.data.size > 0) chunks.push(e.data);
            };
            recorder.start(100);
            set({
              _mediaStream: stream,
              _recorder: recorder,
              _audioChunks: chunks,
              _analyser: analyser,
              _audioContext: audioContext,
              _animFrameId: frameId,
            });
          } catch (e) {
            const err = e as Error;
            const msg =
              err.name === 'NotAllowedError'
                ? 'Microphone access denied. Allow mic access in System Preferences.'
                : err.name === 'NotFoundError'
                  ? 'No microphone found. Connect a mic and try again.'
                  : String(e);
            set({ phase: 'idle', error: msg });
          }
        },

        stopListeningAndProcess: async (onSend?: (text: string) => void) => {
          if (!voiceIsTauri) return;
          const { phase, _recorder, _mediaStream, _audioContext, _animFrameId } = get();
          if (phase !== 'listening' || !_recorder) return;
          if (_animFrameId !== null) {
            cancelAnimationFrame(_animFrameId);
          }
          set({ phase: 'processing', audioLevel: 0, _animFrameId: null });
          await new Promise<void>((resolve) => {
            _recorder.onstop = () => resolve();
            _recorder.stop();
          });
          _mediaStream?.getTracks().forEach((t) => t.stop());
          if (_audioContext) {
            try {
              _audioContext.close();
            } catch {
              /* ignore */
            }
          }
          const { _audioChunks } = get();
          try {
            const blob = new Blob(_audioChunks, { type: _audioChunks[0]?.type ?? 'audio/webm' });
            if (blob.size === 0) {
              set({
                phase: 'idle',
                _recorder: null,
                _mediaStream: null,
                _audioChunks: [],
                _analyser: null,
                _audioContext: null,
              });
              return;
            }
            const arrayBuffer = await blob.arrayBuffer();
            const audioData = Array.from(new Uint8Array(arrayBuffer));
            const format = blob.type.includes('mp4') ? 'mp4' : 'webm';
            const transcriptionResult = await voiceTranscribeBlob(
              audioData,
              format,
              'local_whisper',
              'en',
            );
            const userText = transcriptionResult?.text?.trim() ?? '';
            if (!userText) {
              set({
                phase: 'idle',
                _recorder: null,
                _mediaStream: null,
                _audioChunks: [],
                _analyser: null,
                _audioContext: null,
              });
              return;
            }
            set({ userTranscript: userText });
            onSend?.(userText);
            const { selectedModel, selectedProvider } = useModelStore.getState();
            const fallbackProvider = selectedProvider ?? 'anthropic';
            const fallbackModel =
              selectedModel ??
              getTaskModelForProvider(fallbackProvider, 'fast_completion') ??
              getProviderDefaultModel(fallbackProvider) ??
              getDefaultModelFor(null, 'voice');
            const { turns } = get();
            const contextMessages: Array<{ role: string; content: string }> = [
              {
                role: 'system',
                content:
                  'You are a helpful voice assistant. Keep responses concise and conversational since they will be spoken aloud. Aim for 1-3 sentences unless the user asks for detail.',
              },
            ];
            const recentTurns = turns.slice(-5);
            for (const turn of recentTurns) {
              contextMessages.push({ role: 'user', content: turn.userText });
              contextMessages.push({ role: 'assistant', content: turn.aiText });
            }
            contextMessages.push({ role: 'user', content: userText });
            const llmResponse = await invoke<VoiceLLMResponse>('llm_send_message', {
              messages: contextMessages,
              model: fallbackModel,
              provider: fallbackProvider,
              maxTokens: 300,
              preferCloudCredits: false,
            });
            const aiText = llmResponse?.content?.trim() ?? '';
            if (!aiText) {
              set({
                phase: 'idle',
                aiResponse: '',
                error: 'No response from AI',
                _recorder: null,
                _mediaStream: null,
                _audioChunks: [],
                _analyser: null,
                _audioContext: null,
              });
              return;
            }
            const newTurn: VoiceTurn = { id: voiceUid(), userText, aiText, timestamp: Date.now() };
            set((s) => ({ aiResponse: aiText, turns: [...s.turns, newTurn] }));
            set({ phase: 'speaking', _isSpeaking: true });
            try {
              if (get().bargeInEnabled) {
                await voiceTtsSpeakWithBargeIn(aiText);
              } else {
                await voiceTtsSpeak(aiText);
              }
            } catch (ttsErr) {
              console.warn('[voiceMode] TTS speak failed', ttsErr);
            }
            const postTtsState = get();
            if (postTtsState.phase === 'speaking' && postTtsState.isOpen) {
              set({
                phase: 'idle',
                _isSpeaking: false,
                _recorder: null,
                _mediaStream: null,
                _audioChunks: [],
                _analyser: null,
                _audioContext: null,
              });
            }
          } catch (e) {
            set({
              phase: 'idle',
              error: String(e),
              _recorder: null,
              _mediaStream: null,
              _audioChunks: [],
              _analyser: null,
              _audioContext: null,
            });
          }
        },

        stopSpeaking: async () => {
          if (!voiceIsTauri) {
            set({ phase: 'idle', _isSpeaking: false });
            return;
          }
          try {
            await voiceTtsStop();
          } catch (stopErr) {
            console.warn('[voiceMode] voiceTtsStop on reset failed', stopErr);
          }
          set({ phase: 'idle', _isSpeaking: false });
        },

        reset: () => {
          const {
            _mediaStream,
            _recorder,
            _audioContext,
            _animFrameId,
            _isSpeaking,
            _deepgramUnlisten,
          } = get();
          if (_isSpeaking) {
            voiceTtsStop().catch((err: unknown) => {
              console.warn('[voiceMode] voiceTtsStop on cancel failed', err);
            });
          }
          if (_recorder && _recorder.state !== 'inactive') {
            try {
              _recorder.stop();
            } catch (err) {
              console.warn('[voiceMode] recorder.stop on cancel failed', err);
            }
          }
          _mediaStream?.getTracks().forEach((t) => t.stop());
          if (_animFrameId !== null) {
            cancelAnimationFrame(_animFrameId);
          }
          if (_audioContext) {
            try {
              _audioContext.close();
            } catch {
              /* ignore */
            }
          }
          _deepgramUnlisten?.();
          set({
            phase: 'idle',
            userTranscript: '',
            aiResponse: '',
            error: null,
            turns: [],
            audioLevel: 0,
            _mediaStream: null,
            _recorder: null,
            _audioChunks: [],
            _analyser: null,
            _audioContext: null,
            _animFrameId: null,
            _isSpeaking: false,
            _deepgramUnlisten: null,
          });
        },

        fetchCapabilities: async () => {
          if (!voiceIsTauri) return null;
          try {
            const caps = await voiceGetCapabilities();
            set({
              capabilities: caps,
              wakeWordActive: caps?.wakeWordEnabled ?? false,
              bargeInEnabled: caps?.bargeInEnabled ?? false,
            });
            return caps;
          } catch (error) {
            console.warn('[voiceMode] fetchCapabilities failed:', error);
            return null;
          }
        },

        getBackendSettings: async () => {
          if (!voiceIsTauri) return null;
          try {
            return await voiceGetSettings();
          } catch (error) {
            console.warn('[voiceMode] getBackendSettings failed:', error);
            return null;
          }
        },

        configureBackend: async (provider?: string, model?: string, language?: string) => {
          if (!voiceIsTauri) return;
          try {
            await voiceConfigure(provider, model, language);
          } catch (e) {
            set({ error: String(e) });
          }
        },

        speakWithBargeIn: async (text: string) => {
          if (!voiceIsTauri) return;
          set({ phase: 'speaking', _isSpeaking: true });
          try {
            await voiceTtsSpeakWithBargeIn(text);
          } catch (error) {
            console.warn('[voiceMode] speakWithBargeIn failed, trying regular TTS:', error);
            try {
              await voiceTtsSpeak(text);
            } catch (fallbackError) {
              console.warn(
                '[voiceMode] speakWithBargeIn regular TTS fallback also failed:',
                fallbackError,
              );
            }
          }
          if (get().phase === 'speaking') {
            set({ phase: 'idle', _isSpeaking: false });
          }
        },

        stopTts: async () => {
          if (!voiceIsTauri) {
            set({ _isSpeaking: false });
            return false;
          }
          try {
            const stopped = await voiceTtsStop();
            set({ _isSpeaking: false });
            if (get().phase === 'speaking') {
              set({ phase: 'idle' });
            }
            return stopped;
          } catch {
            set({ _isSpeaking: false });
            return false;
          }
        },

        isTtsPlaying: async () => {
          if (!voiceIsTauri) return false;
          try {
            return await voiceTtsIsPlaying();
          } catch {
            return false;
          }
        },
        listTtsVoices: async () => {
          if (!voiceIsTauri) return [];
          try {
            return await voiceTtsListVoices();
          } catch {
            return [];
          }
        },
        configureTts: async (config: TtsConfig) => {
          if (!voiceIsTauri) return;
          try {
            await voiceTtsConfigure(config);
          } catch (e) {
            set({ error: String(e) });
          }
        },
        speakLocal: async (text: string, rate?: number, volume?: number) => {
          if (!voiceIsTauri) return;
          try {
            await voiceTtsSpeakLocal(text, rate, volume);
          } catch (e) {
            set({ error: String(e) });
          }
        },
        enableWakeWord: async (config?: WakeWordConfig) => {
          if (!voiceIsTauri) return;
          try {
            await voiceWakeEnable(config);
            set({ wakeWordActive: true });
          } catch (e) {
            set({ error: String(e) });
          }
        },
        disableWakeWord: async () => {
          if (!voiceIsTauri) return;
          try {
            await voiceWakeDisable();
            set({ wakeWordActive: false });
          } catch (e) {
            set({ error: String(e) });
          }
        },
        getWakeWordStatus: async () => {
          if (!voiceIsTauri) return false;
          try {
            const active = await voiceWakeStatus();
            set({ wakeWordActive: active });
            return active;
          } catch {
            return false;
          }
        },
        configureWakeWord: async (config: WakeWordConfig) => {
          if (!voiceIsTauri) return;
          try {
            await voiceWakeConfigure(config);
          } catch (e) {
            set({ error: String(e) });
          }
        },
        configurePtt: async (config: PttConfig) => {
          if (!voiceIsTauri) return;
          try {
            await voicePttConfigure(config);
          } catch (e) {
            set({ error: String(e) });
          }
        },
        getPttState: async () => {
          if (!voiceIsTauri) return 'idle';
          try {
            return await voicePttState();
          } catch {
            return 'idle';
          }
        },
        pttKeyDown: async () => {
          if (!voiceIsTauri) return;
          try {
            await voicePttKeyDown();
          } catch (e) {
            set({ error: String(e) });
          }
        },
        pttKeyUp: async () => {
          if (!voiceIsTauri) return null;
          try {
            return await voicePttKeyUp();
          } catch {
            return null;
          }
        },
        startGlobalPtt: async () => {
          if (!voiceIsTauri) return;
          try {
            await voiceStartGlobalPtt();
            set({ globalPttActive: true });
          } catch (e) {
            set({ error: String(e) });
          }
        },
        stopGlobalPtt: async () => {
          if (!voiceIsTauri) return;
          try {
            await voiceStopGlobalPtt();
            set({ globalPttActive: false });
          } catch (e) {
            set({ error: String(e) });
          }
        },
        injectText: async (text: string) => {
          if (!voiceIsTauri) return;
          try {
            await voiceInjectText(text);
          } catch (e) {
            set({ error: String(e) });
          }
        },
        configureDeepgram: async (config: DeepgramConfig) => {
          if (!voiceIsTauri) return;
          try {
            await voiceDeepgramConfigure(config);
          } catch (e) {
            set({ error: String(e) });
          }
        },

        startDeepgramStream: async () => {
          if (!voiceIsTauri) return;
          try {
            get()._deepgramUnlisten?.();
            const unlisten = await voiceListen<VoiceDeepgramTranscriptEvent>(
              'deepgram:transcript',
              (event) => {
                const payload = event.payload ?? {};
                const nextTranscript = payload.text ?? payload.transcript ?? '';
                if (!nextTranscript) return;
                set((state) => ({
                  userTranscript:
                    (payload.isFinal ?? payload.is_final)
                      ? nextTranscript
                      : state.userTranscript
                        ? `${state.userTranscript} ${nextTranscript}`.trim()
                        : nextTranscript,
                }));
              },
            );
            await voiceStartDeepgramStream();
            set({ deepgramStreaming: true, error: null, _deepgramUnlisten: unlisten });
          } catch (e) {
            get()._deepgramUnlisten?.();
            set({ _deepgramUnlisten: null, error: String(e) });
          }
        },

        stopDeepgramStream: async () => {
          if (!voiceIsTauri) return null;
          try {
            const stats = await voiceStopDeepgramStream();
            get()._deepgramUnlisten?.();
            set({ deepgramStreaming: false, _deepgramUnlisten: null });
            return stats;
          } catch {
            get()._deepgramUnlisten?.();
            set({ deepgramStreaming: false, _deepgramUnlisten: null });
            return null;
          }
        },

        sendDeepgramAudio: async (audioData: number[]) => {
          if (!voiceIsTauri) return;
          try {
            await voiceDeepgramSendAudio(audioData);
          } catch (e) {
            set({ error: String(e) });
          }
        },
        getDeepgramStatus: async () => {
          if (!voiceIsTauri) return null;
          try {
            const status = await voiceDeepgramStatus();
            if (status) {
              set({ deepgramStreaming: status.isStreaming });
            }
            return status;
          } catch {
            return null;
          }
        },
        enableBargeIn: async (enabled: boolean) => {
          if (!voiceIsTauri) return false;
          try {
            const result = await voiceEnableBargeIn(enabled);
            set({ bargeInEnabled: result });
            return result;
          } catch (e) {
            set({ error: String(e) });
            return false;
          }
        },
        getBargeInStatus: async () => {
          if (!voiceIsTauri) return null;
          try {
            const status = await voiceGetBargeInStatus();
            if (status) {
              set({ bargeInEnabled: status.enabled });
            }
            return status;
          } catch {
            return null;
          }
        },
        configureBargeIn: async (
          sensitivity?: number,
          minSpeechMs?: number,
          consecutiveFramesThreshold?: number,
        ) => {
          if (!voiceIsTauri) return null;
          try {
            return await voiceConfigureBargeIn(
              sensitivity,
              minSpeechMs,
              consecutiveFramesThreshold,
            );
          } catch (e) {
            set({ error: String(e) });
            return null;
          }
        },
        startBargeInMonitoring: async () => {
          if (!voiceIsTauri) return false;
          try {
            return await voiceStartBargeInMonitoring();
          } catch (e) {
            set({ error: String(e) });
            return false;
          }
        },
        stopBargeInMonitoring: async () => {
          if (!voiceIsTauri) return false;
          try {
            return await voiceStopBargeInMonitoring();
          } catch {
            return false;
          }
        },
        startNativeRecording: async (provider?: string) => {
          if (!voiceIsTauri) return;
          try {
            await speechStartRecording(provider ?? 'cloud');
          } catch (e) {
            set({ error: String(e) });
          }
        },
        stopNativeRecordingAndTranscribe: async (provider?: string, language?: string) => {
          if (!voiceIsTauri) return null;
          try {
            return await speechStopAndTranscribe(provider ?? 'cloud', language ?? 'en');
          } catch (e) {
            set({ error: String(e) });
            return null;
          }
        },
        listLocalModels: async () => {
          if (!voiceIsTauri) return null;
          try {
            return await voiceListLocalModels();
          } catch {
            return null;
          }
        },
        downloadWhisperModel: async (modelSize: string) => {
          if (!voiceIsTauri) return null;
          try {
            const path = await voiceDownloadWhisperModel(modelSize);
            return path || null;
          } catch (e) {
            set({ error: String(e) });
            return null;
          }
        },
        listWhisperModels: async () => {
          if (!voiceIsTauri) return [];
          try {
            return await voiceListWhisperModels();
          } catch {
            return [];
          }
        },
        setWhisperModel: async (modelSize: string) => {
          if (!voiceIsTauri) return;
          try {
            await voiceSetWhisperModel(modelSize);
          } catch (e) {
            set({ error: String(e) });
          }
        },
        downloadPiperVoice: async (voiceId: string) => {
          if (!voiceIsTauri) return null;
          try {
            const path = await voiceDownloadPiperVoice(voiceId);
            return path || null;
          } catch (e) {
            set({ error: String(e) });
            return null;
          }
        },
        listPiperVoices: async () => {
          if (!voiceIsTauri) return [];
          try {
            return await voiceListPiperVoices();
          } catch {
            return [];
          }
        },
        setPiperVoice: async (voiceId: string) => {
          if (!voiceIsTauri) return;
          try {
            await voiceSetPiperVoice(voiceId);
          } catch (e) {
            set({ error: String(e) });
          }
        },
      }),
      {
        name: 'agiworkforce-voice-mode',
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          wakeWordActive: state.wakeWordActive,
          bargeInEnabled: state.bargeInEnabled,
        }),
      },
    ),
    { name: 'VoiceModeStore', enabled: import.meta.env.DEV },
  ),
);

// -- VoiceInput Store (was previously absorbed into voiceModeStore from voiceInputStore) --

import { cleanupVoiceDictation, detectVoiceCommand } from '@agiworkforce/utils';

type VoiceInputMode = 'idle' | 'listening' | 'transcribing' | 'processing' | 'preview';
export type PostProcessingMode = 'ai' | 'basic' | 'none';
export { detectVoiceCommand };

interface VoiceLLMResponsePayload {
  content: string;
}
interface VoiceTranscriptResult {
  text: string;
  isCommand: boolean;
}

interface VoiceInputState {
  voiceMode: VoiceInputMode;
  transcript: string;
  pendingTranscript: string;
  lastTranscriptIsCommand: boolean;
  voiceError: string | null;
  hotkey: 'option' | 'ctrl+space' | 'ctrl+shift+v' | 'caps_lock';
  voiceProvider: 'local_whisper' | 'deepgram' | 'openai_whisper';
  voiceLanguage: string;
  postProcessingMode: PostProcessingMode;
  _mediaStream: MediaStream | null;
  _recorder: MediaRecorder | null;
  _audioChunks: Blob[];
  _startAborted: boolean;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  confirmTranscript: () => void;
  setHotkey: (hotkey: VoiceInputState['hotkey']) => void;
  setProvider: (provider: VoiceInputState['voiceProvider']) => void;
  setLanguage: (language: string) => void;
  setPostProcessingMode: (mode: PostProcessingMode) => void;
  clearTranscript: () => void;
  processTranscript: (rawTranscript: string) => Promise<VoiceTranscriptResult>;
}

export const useVoiceInputStore = create<VoiceInputState>()(
  devtools(
    persist(
      (set, get) => ({
        voiceMode: 'idle',
        transcript: '',
        pendingTranscript: '',
        lastTranscriptIsCommand: false,
        voiceError: null,
        hotkey: 'option',
        voiceProvider: 'local_whisper',
        voiceLanguage: 'en',
        postProcessingMode: 'ai',
        _mediaStream: null,
        _recorder: null,
        _audioChunks: [],
        _startAborted: false,

        startListening: async () => {
          set({
            voiceMode: 'listening',
            transcript: '',
            voiceError: null,
            lastTranscriptIsCommand: false,
            _startAborted: false,
          });
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (get()._startAborted) {
              stream.getTracks().forEach((t) => t.stop());
              set({ voiceMode: 'idle', _startAborted: false });
              return;
            }
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
              ? 'audio/webm;codecs=opus'
              : MediaRecorder.isTypeSupported('audio/webm')
                ? 'audio/webm'
                : 'audio/mp4';
            const recorder = new MediaRecorder(stream, { mimeType });
            const chunks: Blob[] = [];
            recorder.ondataavailable = (e) => {
              if (e.data.size > 0) chunks.push(e.data);
            };
            recorder.start(100);
            set({ _mediaStream: stream, _recorder: recorder, _audioChunks: chunks });
          } catch (e) {
            const err = e as Error;
            const msg =
              err.name === 'NotAllowedError'
                ? 'Microphone access denied.'
                : err.name === 'NotFoundError'
                  ? 'No microphone found.'
                  : String(e);
            set({ voiceMode: 'idle', voiceError: msg });
          }
        },

        stopListening: async () => {
          const { voiceMode, _recorder, _mediaStream } = get();
          if (voiceMode !== 'listening') return;
          if (!_recorder) {
            set({ _startAborted: true, voiceMode: 'idle' });
            return;
          }
          set({ voiceMode: 'transcribing' });
          await new Promise<void>((resolve) => {
            _recorder.onstop = () => resolve();
            _recorder.stop();
          });
          _mediaStream?.getTracks().forEach((t) => t.stop());
          const { _audioChunks } = get();
          try {
            const blob = new Blob(_audioChunks, { type: _audioChunks[0]?.type ?? 'audio/webm' });
            if (blob.size === 0) {
              set({
                voiceMode: 'idle',
                _recorder: null,
                _mediaStream: null,
                _audioChunks: [],
                _startAborted: false,
              });
              return;
            }
            const arrayBuffer = await blob.arrayBuffer();
            const audioData = Array.from(new Uint8Array(arrayBuffer));
            const format = (blob.type.includes('mp4') ? 'mp4' : 'webm') as string;
            const { voiceProvider, voiceLanguage } = get();
            const result = await voiceTranscribeBlob(
              audioData,
              format,
              voiceProvider,
              voiceLanguage,
            );
            const rawText = result?.text?.trim() ?? '';
            if (!rawText) {
              set({
                voiceMode: 'idle',
                _recorder: null,
                _mediaStream: null,
                _audioChunks: [],
                _startAborted: false,
              });
              return;
            }
            if (get().postProcessingMode === 'ai') set({ voiceMode: 'processing' });
            const { text: cleanText, isCommand } = await get().processTranscript(rawText);
            set({
              voiceMode: 'preview',
              pendingTranscript: cleanText,
              lastTranscriptIsCommand: isCommand,
              _recorder: null,
              _mediaStream: null,
              _audioChunks: [],
              _startAborted: false,
            });
          } catch (e) {
            set({
              voiceMode: 'idle',
              voiceError: String(e),
              _recorder: null,
              _mediaStream: null,
              _audioChunks: [],
              _startAborted: false,
            });
          }
        },

        confirmTranscript: () => {
          const { pendingTranscript, lastTranscriptIsCommand } = get();
          set({
            voiceMode: 'idle',
            transcript: pendingTranscript,
            pendingTranscript: '',
            lastTranscriptIsCommand,
          });
        },

        processTranscript: async (rawTranscript: string): Promise<VoiceTranscriptResult> => {
          const raw = rawTranscript.trim();
          if (raw.length < 3) return { text: raw, isCommand: false };
          const isCommand = detectVoiceCommand(raw);
          const { postProcessingMode } = get();
          if (postProcessingMode === 'none') return { text: raw, isCommand };
          if (postProcessingMode === 'basic')
            return { text: cleanupVoiceDictation(raw), isCommand };
          try {
            const { selectedModel, selectedProvider } = useModelStore.getState();
            const systemContent = isCommand
              ? 'You are a voice command interpreter. Output ONLY the cleaned command instruction. No explanation.'
              : 'You are a voice transcription editor. Clean up dictation: remove fillers, fix run-ons, add punctuation. Output ONLY cleaned text.';
            const response = await invoke<VoiceLLMResponsePayload>('llm_send_message', {
              messages: [
                { role: 'system', content: systemContent },
                { role: 'user', content: raw },
              ],
              model: selectedModel ?? 'auto-economy',
              provider: selectedProvider ?? 'anthropic',
              max_tokens: 500,
              prefer_cloud_credits: false,
            });
            const cleaned = response?.content?.trim() ?? '';
            return { text: cleaned || cleanupVoiceDictation(raw), isCommand };
          } catch {
            return { text: cleanupVoiceDictation(raw), isCommand };
          }
        },

        setHotkey: (hotkey) => set({ hotkey }),
        setProvider: (provider) => set({ voiceProvider: provider }),
        setLanguage: (language) => set({ voiceLanguage: language }),
        setPostProcessingMode: (mode) => set({ postProcessingMode: mode }),
        clearTranscript: () =>
          set({ transcript: '', pendingTranscript: '', lastTranscriptIsCommand: false }),
      }),
      {
        name: 'agiworkforce-voice-input',
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          hotkey: state.hotkey,
          voiceProvider: state.voiceProvider,
          voiceLanguage: state.voiceLanguage,
          postProcessingMode: state.postProcessingMode,
        }),
      },
    ),
    { name: 'voice-input-store' },
  ),
);
