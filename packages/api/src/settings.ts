/**
 * Settings API — typed wrappers for settings_*, settings_v2_*, and config_hierarchy commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types (matching Rust structs with serde(rename_all = "camelCase")) ----

export interface DefaultModels {
  ollama: string;
  managedCloud: string;
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
}

export interface WindowPreferences {
  theme: string;
  language: string;
  startupPosition: string;
  dockOnStartup?: string;
}

export interface ChatPreferences {
  promptCompletionEnabled: boolean;
  showTimestamps: boolean;
  alwaysUseAgentMode: boolean;
  compactMode: boolean;
  autoApproveTools: boolean;
  autoInjectSkills: boolean;
  chatStorageMode: string;
}

export interface ExecutionPreferences {
  maxTimeoutMinutes: number;
  enableCheckpointing: boolean;
  checkpointInterval: number;
  autoResumeOnRestart: boolean;
  enableTimeoutWarnings: boolean;
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

// ---- Settings V1 Commands ----

export async function settingsLoad(): Promise<Settings> {
  return command<Settings>('settings_load');
}

export async function settingsSave(settings: Settings): Promise<void> {
  return command<void>('settings_save', { settings });
}

export async function settingsLoadFromDisk(): Promise<Settings> {
  return command<Settings>('settings_load_from_disk');
}

// ---- Settings V2 Commands ----

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

// ---- Config Hierarchy Commands ----

export async function getResolvedConfig(projectRoot?: string): Promise<ProjectConfig> {
  return command<ProjectConfig>('get_resolved_config', { projectRoot });
}

export async function saveProjectConfig(config: ProjectConfig, projectRoot: string): Promise<void> {
  return command<void>('save_project_config', { config, projectRoot });
}

export async function saveGlobalConfig(config: ProjectConfig): Promise<void> {
  return command<void>('save_global_config', { config });
}
