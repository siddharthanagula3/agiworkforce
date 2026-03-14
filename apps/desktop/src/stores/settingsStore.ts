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
import type { AgentMode } from './chatPreferencesStore';
export type { AgentMode };

/** Base theme modes. Any other string value is treated as a named theme ID from the theme registry. */
export type Theme = 'light' | 'dark' | 'system' | string;
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
  /** Agent execution mode — controls which tools are allowed and whether approval dialogs appear */
  agentMode: AgentMode;
  /**
   * Where chat history is persisted.
   * 'local'  — SQLite only, never synced to cloud (default & recommended for privacy).
   * 'cloud'  — SQLite + best-effort Supabase sync after every message save.
   */
  chatStorageMode: 'local' | 'cloud';
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
  setLanguage: (language: Language) => void;
  setStartupPosition: (position: 'center' | 'remember') => void;
  setDockOnStartup: (dock: 'left' | 'right' | null) => void;

  setPromptCompletionEnabled: (enabled: boolean) => void;
  setAlwaysUseAgentMode: (enabled: boolean) => void;
  setCompactMode: (enabled: boolean) => void;
  setAutoApproveTools: (enabled: boolean) => Promise<void>;
  setAutoInjectSkills: (enabled: boolean) => void;
  setAgentMode: (mode: AgentMode) => Promise<void>;
  setChatStorageMode: (mode: 'local' | 'cloud') => void;

  setMaxTimeoutMinutes: (minutes: number) => void;
  setEnableCheckpointing: (enabled: boolean) => void;
  setCheckpointInterval: (interval: number) => void;
  setAutoResumeOnRestart: (enabled: boolean) => void;
  setEnableTimeoutWarnings: (enabled: boolean) => void;

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

const defaultSettings: Pick<
  SettingsState,
  | 'llmConfig'
  | 'windowPreferences'
  | 'chatPreferences'
  | 'executionPreferences'
  | 'globalHotkeyPreferences'
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
    agentMode: 'build' as AgentMode, // Default to Build mode
    chatStorageMode: 'local' as const, // Local-only by default (privacy-preserving)
  },
  executionPreferences: {
    maxTimeoutMinutes: 1440, // 24 hours default
    enableCheckpointing: true,
    checkpointInterval: 5, // Steps between checkpoints
    autoResumeOnRestart: true,
    enableTimeoutWarnings: true,
  },
  globalHotkeyPreferences: {
    enabled: true, // Enabled by default — competitive parity with Claude Desktop / ChatGPT Desktop
    combo: getDefaultGlobalHotkeyCombo(),
  },
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
const SETTINGS_STORE_VERSION = 17;

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
              console.debug('[settingsStore] Load cancelled - another operation started');
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
              console.debug('[settingsStore] Load cancelled before final update');
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
              console.debug('[settingsStore] Synced allowed directories to backend:', dirs.length);

              // Also update MCP filesystem server to use the allowed directories.
              // Empty directory lists are represented by ToolGuard only.
              if (dirs.length > 0) {
                await McpClient.updateFilesystemDirectories(dirs);
                console.debug(
                  '[settingsStore] Updated MCP filesystem with allowed directories:',
                  dirs.length,
                );
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
                console.debug(
                  '[settingsStore] Updated MCP filesystem with allowed directories:',
                  allowedDirectories.length,
                );
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
        partialize: (state) => ({
          llmConfig: state.llmConfig,
          windowPreferences: {
            theme: state.windowPreferences.theme,
            language: state.windowPreferences.language,
            startupPosition: state.windowPreferences.startupPosition,
            dockOnStartup: state.windowPreferences.dockOnStartup,
            selectedTheme: state.windowPreferences.selectedTheme,
          },
          chatPreferences: state.chatPreferences,
          executionPreferences: state.executionPreferences,
          globalHotkeyPreferences: state.globalHotkeyPreferences,
          allowedDirectories: state.allowedDirectories,
          customModels: state.customModels,
          customKeybindings: state.customKeybindings,
        }),
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
          };

          const mergedGlobalHotkeyPreferences: GlobalHotkeyPreferences = {
            ...currentState.globalHotkeyPreferences,
            ...(persisted?.globalHotkeyPreferences ?? {}),
          };

          return {
            ...currentState,
            ...persisted,
            llmConfig: mergedLLMConfig,
            windowPreferences: mergedWindowPreferences,
            chatPreferences: mergedChatPreferences,
            executionPreferences: mergedExecutionPreferences,
            globalHotkeyPreferences: mergedGlobalHotkeyPreferences,
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

          return state as SettingsState;
        },
        // Called when rehydration finishes (with or without errors)
        onRehydrateStorage: () => (state) => {
          if (state) {
            state.setHasHydrated(true);
            console.debug('[SettingsStore] Rehydration complete');
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

    console.debug(
      `[SettingsStore] Enforcing task routing restriction: ${normalizedTier} tier cannot use ${route.model} for ${category}, switching to auto`,
    );
    setTaskRouting(category, 'managed_cloud', 'auto');
  });
};

if (typeof window !== 'undefined') {
  import('./auth')
    .then(({ useUnifiedAuthStore }) => {
      if (useUnifiedAuthStore?.subscribe) {
        useUnifiedAuthStore.subscribe(
          (state) => state.plan,
          (plan) => {
            enforceTaskRoutingTierRestriction(plan ?? 'free');
          },
        );
        enforceTaskRoutingTierRestriction(useUnifiedAuthStore.getState().plan ?? 'free');
      }
    })
    .catch((err) => {
      console.warn('[settingsStore] Failed to load auth for plan subscription:', err);
    });
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

export const selectAllowedDirectories = (state: SettingsState) => state.allowedDirectories;
export const selectSettingsLoading = (state: SettingsState) => state.loading;
export const selectSettingsError = (state: SettingsState) => state.error;
export const selectSettingsHasHydrated = (state: SettingsState) => state._hasHydrated;
