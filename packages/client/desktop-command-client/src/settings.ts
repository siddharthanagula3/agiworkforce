import { command } from '@agiworkforce/client-runtime';

export interface DefaultModels {
  ollama: string;
  managed_cloud: string;
}

export interface LLMConfig {
  defaultProvider: string;
  temperature: number;
  maxTokens: number;
  defaultModels: DefaultModels;
  taskRouting?: unknown;
  providerMode: string;
  ollamaUrl: string;
  lmstudioUrl?: string;
  llamacppUrl?: string;
  vllmUrl?: string;
}

export interface WindowPreferences {
  theme: string;
  language: string;
  startupPosition: string;
  dockOnStartup?: string;
  selectedTheme?: string;
  dyslexicFont?: boolean;
  chatFont?: 'default' | 'sans' | 'mono' | 'dyslexic';
  uiScale?: 90 | 100 | 110;
  reduceMotion?: boolean;
}

export interface ChatPreferences {
  compactMode: boolean;
  autoApproveTools: boolean;
  memoryEnabled: boolean;
  allowToolAssistedMemoryGeneration: boolean;
  autoSaveMemories: boolean;
  sendShortcut?: 'enter' | 'mod-enter';
  temporaryChat?: boolean;
}

export interface ExecutionPreferences {
  maxTimeoutMinutes: number;
  approvalTimeoutSeconds?: number;
  approvalTimeoutPolicy?: 'auto-deny' | 'auto-approve' | 'pause';
  streamInactivityTimeoutSeconds?: number;
  terminalSandbox?: {
    enabled: boolean;
    backend: string;
    policy: string;
    executable: string;
    allowedDomains: string[];
  };
}

export interface PersonalizationPreferences {
  name: string;
  occupation: string;
  bio: string;
  formality: number;
  warmth: number;
  detail: number;
  emojiUsage: 'never' | 'sometimes' | 'often';
}

export interface GlobalHotkeyPreferences {
  enabled: boolean;
  combo: string;
}

export interface Settings {
  llmConfig: LLMConfig;
  windowPreferences: WindowPreferences;
  chatPreferences?: ChatPreferences;
  executionPreferences?: ExecutionPreferences;
  globalHotkeyPreferences: GlobalHotkeyPreferences;
  allowedDirectories: string[];
  featureFlags: Record<string, boolean>;
  personalization?: PersonalizationPreferences;
  customKeybindings?: Record<string, string>;
}

export interface SettingsResponse {
  success: boolean;
  message?: string;
}

export async function settingsV2ClearCache(): Promise<SettingsResponse> {
  return command<SettingsResponse>('settings_v2_clear_cache');
}
