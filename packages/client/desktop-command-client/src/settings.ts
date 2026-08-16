
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
  favoriteModels: string[];
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
  promptCompletionEnabled: boolean;
  showTimestamps: boolean;
  alwaysUseAgentMode: boolean;
  compactMode: boolean;
  autoApproveTools: boolean;
  autoInjectSkills: boolean;
  memoryEnabled: boolean;
  allowToolAssistedMemoryGeneration: boolean;
  autoSaveMemories: boolean;
  chatStorageMode: string;
  sendShortcut?: 'enter' | 'mod-enter';
  temporaryChat?: boolean;
}

export interface ExecutionPreferences {
  maxTimeoutMinutes: number;
  enableCheckpointing: boolean;
  checkpointInterval: number;
  autoResumeOnRestart: boolean;
  enableTimeoutWarnings: boolean;
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
  customModels: unknown[];
  featureFlags: Record<string, boolean>;
  personalization?: PersonalizationPreferences;
  customKeybindings?: Record<string, string>;
}

export interface SettingsResponse {
  success: boolean;
  message?: string;
}

export interface GetSettingsResponse {
  settings: Record<string, unknown>;
}

export interface SetSettingRequest {
  key: string;
  value: unknown;
  category: string;
  encrypted: boolean;
}

export interface ProjectConfig {
  [key: string]: unknown;
}

export interface AppSettings {
  [key: string]: unknown;
}

export async function settingsLoad(): Promise<Settings> {
  return command<Settings>('settings_load');
}

export async function settingsSave(settings: Settings): Promise<void> {
  return command<void>('settings_save', { settings });
}

export async function settingsLoadFromDisk(): Promise<Settings> {
  return command<Settings>('settings_load_from_disk');
}

export async function settingsV2Get(key: string): Promise<unknown> {
  return command<unknown>('settings_v2_get', { key });
}

export async function settingsV2Set(request: SetSettingRequest): Promise<SettingsResponse> {
  return command<SettingsResponse>('settings_v2_set', { request });
}

export async function settingsV2GetBatch(keys: string[]): Promise<GetSettingsResponse> {
  return command<GetSettingsResponse>('settings_v2_get_batch', { request: { keys } });
}

export async function settingsV2Delete(key: string): Promise<SettingsResponse> {
  return command<SettingsResponse>('settings_v2_delete', { key });
}

export async function settingsV2GetCategory(category: string): Promise<GetSettingsResponse> {
  return command<GetSettingsResponse>('settings_v2_get_category', { category });
}

export async function settingsV2LoadAppSettings(): Promise<AppSettings> {
  return command<AppSettings>('settings_v2_load_app_settings');
}

export async function settingsV2SaveAppSettings(settings: AppSettings): Promise<SettingsResponse> {
  return command<SettingsResponse>('settings_v2_save_app_settings', { settings });
}

export async function settingsV2ClearCache(): Promise<SettingsResponse> {
  return command<SettingsResponse>('settings_v2_clear_cache');
}

export async function settingsV2ListAll(): Promise<GetSettingsResponse> {
  return command<GetSettingsResponse>('settings_v2_list_all');
}

export async function getResolvedConfig(projectRoot?: string): Promise<ProjectConfig> {
  return command<ProjectConfig>('get_resolved_config', { projectRoot });
}

export async function saveProjectConfig(config: ProjectConfig, projectRoot: string): Promise<void> {
  return command<void>('save_project_config', { config, projectRoot });
}

export async function saveGlobalConfig(config: ProjectConfig): Promise<void> {
  return command<void>('save_global_config', { config });
}
