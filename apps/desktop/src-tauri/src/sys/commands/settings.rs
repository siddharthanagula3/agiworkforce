use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{Manager, State};
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LLMConfig {
    pub default_provider: String,
    pub temperature: f32,
    pub max_tokens: u32,
    pub default_models: DefaultModels,
    #[serde(default)]
    pub favorite_models: Vec<String>,
    #[serde(default)]
    pub task_routing: Option<serde_json::Value>,
    #[serde(default = "default_provider_mode")]
    pub provider_mode: String,
    #[serde(default = "default_ollama_url")]
    pub ollama_url: String,
}

fn default_provider_mode() -> String {
    "auto".to_string()
}

fn default_ollama_url() -> String {
    "http://localhost:11434".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DefaultModels {
    pub ollama: String,
    #[serde(default)]
    pub managed_cloud: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowPreferences {
    pub theme: String,
    #[serde(default = "default_language")]
    pub language: String,
    pub startup_position: String,
    pub dock_on_startup: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChatPreferences {
    #[serde(default = "default_prompt_completion_enabled")]
    pub prompt_completion_enabled: bool,
    #[serde(default)]
    pub show_timestamps: bool,
    #[serde(default)]
    pub always_use_agent_mode: bool,
    #[serde(default = "default_compact_mode")]
    pub compact_mode: bool,
    #[serde(default)]
    pub auto_approve_tools: bool,
    #[serde(default = "default_auto_inject_skills")]
    pub auto_inject_skills: bool,
    /// Where chat history is persisted.
    /// `"local"` — SQLite only, never synced to cloud (default).
    /// `"cloud"` — SQLite + best-effort Supabase sync on every save.
    #[serde(default = "default_chat_storage_mode")]
    pub chat_storage_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSandboxPreferences {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_terminal_sandbox_backend")]
    pub backend: String,
    #[serde(default = "default_terminal_sandbox_policy")]
    pub policy: String,
    #[serde(default = "default_terminal_sandbox_executable")]
    pub executable: String,
    #[serde(default)]
    pub allowed_domains: Vec<String>,
}

fn default_terminal_sandbox_backend() -> String {
    "srt".to_string()
}

fn default_terminal_sandbox_policy() -> String {
    agiworkforce_sandbox_policy::SandboxPolicy::default()
        .mode_name()
        .to_string()
}

fn default_terminal_sandbox_executable() -> String {
    "srt".to_string()
}

impl Default for TerminalSandboxPreferences {
    fn default() -> Self {
        Self {
            enabled: false,
            backend: default_terminal_sandbox_backend(),
            policy: default_terminal_sandbox_policy(),
            executable: default_terminal_sandbox_executable(),
            allowed_domains: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionPreferences {
    #[serde(default = "default_max_timeout_minutes")]
    pub max_timeout_minutes: u32,
    #[serde(default = "default_enable_checkpointing")]
    pub enable_checkpointing: bool,
    #[serde(default = "default_checkpoint_interval")]
    pub checkpoint_interval: u32,
    #[serde(default = "default_auto_resume_on_restart")]
    pub auto_resume_on_restart: bool,
    #[serde(default = "default_enable_timeout_warnings")]
    pub enable_timeout_warnings: bool,
    #[serde(default)]
    pub terminal_sandbox: TerminalSandboxPreferences,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalHotkeyPreferences {
    #[serde(default = "default_global_hotkey_enabled")]
    pub enabled: bool,
    #[serde(default = "default_global_hotkey_combo")]
    pub combo: String,
}

fn default_chat_storage_mode() -> String {
    "local".to_string()
}

fn default_prompt_completion_enabled() -> bool {
    true
}

fn default_language() -> String {
    "en".to_string()
}

fn default_compact_mode() -> bool {
    true
}

fn default_auto_inject_skills() -> bool {
    true
}

fn default_max_timeout_minutes() -> u32 {
    1440
}

fn default_enable_checkpointing() -> bool {
    true
}

fn default_checkpoint_interval() -> u32 {
    5
}

fn default_auto_resume_on_restart() -> bool {
    true
}

fn default_enable_timeout_warnings() -> bool {
    true
}

fn default_global_hotkey_enabled() -> bool {
    true
}

fn default_global_hotkey_combo() -> String {
    crate::sys::commands::shortcuts::platform_default_quick_query_combo().to_string()
}

fn default_allowed_directories() -> Vec<String> {
    let mut dirs = Vec::new();

    if let Some(home) = dirs::home_dir() {
        dirs.push(home.to_string_lossy().to_string());
    }

    if let Ok(cwd) = std::env::current_dir() {
        dirs.push(cwd.to_string_lossy().to_string());
    }

    dirs.push(std::env::temp_dir().to_string_lossy().to_string());

    dirs
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub llm_config: LLMConfig,
    pub window_preferences: WindowPreferences,
    #[serde(default)]
    pub chat_preferences: Option<ChatPreferences>,
    #[serde(default)]
    pub execution_preferences: Option<ExecutionPreferences>,
    #[serde(default = "default_global_hotkey_preferences")]
    pub global_hotkey_preferences: GlobalHotkeyPreferences,

    #[serde(default)]
    pub allowed_directories: Vec<String>,
    #[serde(default)]
    pub custom_models: Vec<serde_json::Value>,
    #[serde(default)]
    pub feature_flags: std::collections::HashMap<String, bool>,
}

fn default_global_hotkey_preferences() -> GlobalHotkeyPreferences {
    GlobalHotkeyPreferences {
        enabled: default_global_hotkey_enabled(),
        combo: default_global_hotkey_combo(),
    }
}

pub struct SettingsState {
    pub settings: Arc<Mutex<Settings>>,
}

impl SettingsState {
    /// Get the current allowed directories from settings
    pub fn get_allowed_directories(&self) -> Vec<String> {
        // Use blocking lock since this is called from sync contexts
        let settings = self.settings.blocking_lock();
        settings.allowed_directories.clone()
    }
}

impl Default for SettingsState {
    fn default() -> Self {
        Self::new()
    }
}

impl SettingsState {
    pub fn new() -> Self {
        Self {
            settings: Arc::new(Mutex::new(Settings {
                llm_config: LLMConfig {
                    default_provider: "managed_cloud".to_string(),
                    temperature: 0.7,
                    max_tokens: 4096,
                    default_models: DefaultModels {
                        ollama: "".to_string(),
                        managed_cloud: "auto".to_string(),
                    },
                    favorite_models: Vec::new(),
                    task_routing: None,
                    provider_mode: default_provider_mode(),
                    ollama_url: default_ollama_url(),
                },
                window_preferences: WindowPreferences {
                    theme: "system".to_string(),
                    language: default_language(),
                    startup_position: "center".to_string(),
                    dock_on_startup: None,
                },
                chat_preferences: Some(ChatPreferences {
                    prompt_completion_enabled: true,
                    show_timestamps: false,
                    always_use_agent_mode: false,
                    compact_mode: true,
                    auto_approve_tools: false,
                    auto_inject_skills: true,
                    chat_storage_mode: default_chat_storage_mode(),
                }),
                execution_preferences: Some(ExecutionPreferences {
                    max_timeout_minutes: default_max_timeout_minutes(),
                    enable_checkpointing: default_enable_checkpointing(),
                    checkpoint_interval: default_checkpoint_interval(),
                    auto_resume_on_restart: default_auto_resume_on_restart(),
                    enable_timeout_warnings: default_enable_timeout_warnings(),
                    terminal_sandbox: TerminalSandboxPreferences::default(),
                }),
                global_hotkey_preferences: default_global_hotkey_preferences(),
                allowed_directories: default_allowed_directories(),
                custom_models: Vec::new(),
                feature_flags: std::collections::HashMap::new(),
            })),
        }
    }
}

#[tauri::command]
pub async fn settings_load(state: State<'_, SettingsState>) -> Result<Settings, String> {
    let settings = state.settings.lock().await;
    Ok(settings.clone())
}

#[tauri::command]
pub async fn settings_save(
    settings: Settings,
    state: State<'_, SettingsState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let mut settings = settings;
    settings.global_hotkey_preferences.combo =
        crate::sys::commands::shortcuts::normalize_accelerator_for_platform(
            &settings.global_hotkey_preferences.combo,
        );
    if settings.global_hotkey_preferences.combo.is_empty() {
        settings.global_hotkey_preferences.combo = default_global_hotkey_combo();
    }

    // Update in-memory state
    let mut current_settings = state.settings.lock().await;
    *current_settings = settings.clone();

    // Persist to disk
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let settings_path = app_data_dir.join("settings.json");
    if let Err(e) = tokio::fs::create_dir_all(&app_data_dir).await {
        return Err(format!("Failed to create app data directory: {}", e));
    }

    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    tokio::fs::write(&settings_path, json)
        .await
        .map_err(|e| format!("Failed to write settings file: {}", e))?;

    if let Some(shortcuts_state) =
        app_handle.try_state::<Arc<Mutex<crate::sys::commands::shortcuts::ShortcutsState>>>()
    {
        crate::sys::commands::shortcuts::apply_quick_query_hotkey_preferences(
            &app_handle,
            &shortcuts_state,
            crate::sys::commands::shortcuts::QuickQueryHotkeyPreferences {
                enabled: settings.global_hotkey_preferences.enabled,
                combo: settings.global_hotkey_preferences.combo.clone(),
            },
        )
        .await?;
    }

    tracing::info!("Settings persisted to {:?}", settings_path);
    Ok(())
}

#[tauri::command]
pub async fn settings_load_from_disk(
    state: State<'_, SettingsState>,
    app_handle: tauri::AppHandle,
) -> Result<Settings, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let settings_path = app_data_dir.join("settings.json");

    if settings_path.exists() {
        let json = tokio::fs::read_to_string(&settings_path)
            .await
            .map_err(|e| format!("Failed to read settings file: {}", e))?;

        let loaded_settings: Settings =
            serde_json::from_str(&json).map_err(|e| format!("Failed to parse settings: {}", e))?;
        let mut loaded_settings = loaded_settings;
        loaded_settings.global_hotkey_preferences.combo =
            crate::sys::commands::shortcuts::normalize_accelerator_for_platform(
                &loaded_settings.global_hotkey_preferences.combo,
            );
        if loaded_settings.global_hotkey_preferences.combo.is_empty() {
            loaded_settings.global_hotkey_preferences.combo = default_global_hotkey_combo();
        }

        // Update in-memory state
        let mut current_settings = state.settings.lock().await;
        *current_settings = loaded_settings.clone();

        tracing::info!("Settings loaded from {:?}", settings_path);
        Ok(loaded_settings)
    } else {
        // Return default settings
        let settings = state.settings.lock().await;
        Ok(settings.clone())
    }
}
