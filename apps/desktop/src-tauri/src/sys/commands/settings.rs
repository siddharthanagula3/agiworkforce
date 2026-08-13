use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::Path;
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lmstudio_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub llamacpp_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vllm_url: Option<String>,
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
    #[serde(default, rename = "managed_cloud", alias = "managedCloud")]
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_theme: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dyslexic_font: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chat_font: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ui_scale: Option<u16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reduce_motion: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    /// Master policy for both automatic memory retrieval and generation.
    /// Missing values from older settings files fail closed.
    #[serde(default)]
    pub memory_enabled: bool,
    /// Whether automatic generation may run on tool/web-assisted turns.
    #[serde(default)]
    pub allow_tool_assisted_memory_generation: bool,
    #[serde(default)]
    pub auto_save_memories: bool,
    /// Where chat history is persisted.
    /// `"local"` — SQLite only, never synced to cloud (default).
    /// `"cloud"` — reserved for explicit cloud storage; unavailable in Desktop v1.
    #[serde(default = "default_chat_storage_mode")]
    pub chat_storage_mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub send_shortcut: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temporary_chat: Option<bool>,
}

impl Default for ChatPreferences {
    fn default() -> Self {
        Self {
            prompt_completion_enabled: default_prompt_completion_enabled(),
            show_timestamps: false,
            always_use_agent_mode: false,
            compact_mode: default_compact_mode(),
            auto_approve_tools: false,
            auto_inject_skills: default_auto_inject_skills(),
            memory_enabled: false,
            allow_tool_assisted_memory_generation: false,
            auto_save_memories: false,
            // IMPORTANT: must match default_chat_storage_mode(); cloud sync is
            // off by default unless the user explicitly enables a cloud path.
            chat_storage_mode: default_chat_storage_mode(),
            send_shortcut: Some(default_send_shortcut()),
            temporary_chat: Some(false),
        }
    }
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval_timeout_seconds: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval_timeout_policy: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stream_inactivity_timeout_seconds: Option<u32>,
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

fn default_send_shortcut() -> String {
    "enter".to_string()
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

pub(crate) fn default_allowed_directories() -> Vec<String> {
    let mut dirs = Vec::new();

    // The selected project/workspace is added explicitly when the user chooses
    // it. Do not seed broad home-directory access for approval-free file reads.
    if let Ok(cwd) = std::env::current_dir() {
        dirs.push(cwd.to_string_lossy().to_string());
    }

    dirs.push(std::env::temp_dir().to_string_lossy().to_string());

    dirs
}

#[cfg(test)]
mod tests {
    use super::*;

    /// R23 gate: cloud sync must be off unless a cloud path is explicit.
    /// `chat_storage_mode` defaults to "local", so `cloud_sync_enabled` is
    /// `false` unless the user explicitly opts in (which requires Cloud Managed).
    #[test]
    fn chat_storage_mode_defaults_to_local() {
        assert_eq!(
            default_chat_storage_mode(),
            "local",
            "cloud sync must be disabled by default"
        );
        let prefs = ChatPreferences::default();
        assert_eq!(
            prefs.chat_storage_mode, "local",
            "ChatPreferences::default() must have chat_storage_mode=local"
        );
        // Derive the same boolean the send_message command uses
        let cloud_sync_enabled = prefs.chat_storage_mode.as_str() == "cloud";
        assert!(
            !cloud_sync_enabled,
            "cloud_sync_enabled must be false with default settings"
        );
    }

    #[test]
    fn default_allowed_directories_excludes_home_directory() {
        let dirs = default_allowed_directories();

        if let Some(home) = dirs::home_dir() {
            assert!(
                !dirs.contains(&home.to_string_lossy().to_string()),
                "home directory must not be allowed by default"
            );
        }
    }

    #[test]
    fn default_allowed_directories_includes_workspace_and_temp() {
        let dirs = default_allowed_directories();
        let cwd = std::env::current_dir()
            .expect("current directory should resolve")
            .to_string_lossy()
            .to_string();
        let temp = std::env::temp_dir().to_string_lossy().to_string();

        assert!(
            dirs.contains(&cwd),
            "workspace cwd should be allowed by default"
        );
        assert!(
            dirs.contains(&temp),
            "temp directory should be allowed by default"
        );
    }

    #[test]
    fn legacy_settings_keep_new_fields_unset_and_migrate_managed_cloud_key() {
        let legacy = serde_json::json!({
            "llmConfig": {
                "defaultProvider": "managed_cloud",
                "temperature": 0.7,
                "maxTokens": 4096,
                "defaultModels": { "ollama": "", "managedCloud": "auto" },
                "favoriteModels": [],
                "providerMode": "auto",
                "ollamaUrl": "http://localhost:11434"
            },
            "windowPreferences": {
                "theme": "system",
                "language": "en",
                "startupPosition": "center",
                "dockOnStartup": null
            },
            "globalHotkeyPreferences": {
                "enabled": true,
                "combo": "CommandOrControl+Shift+Space"
            }
        });

        let parsed: Settings = serde_json::from_value(legacy).expect("legacy settings deserialize");
        assert_eq!(parsed.llm_config.default_models.managed_cloud, "auto");
        assert_eq!(parsed.llm_config.lmstudio_url, None);
        assert_eq!(parsed.window_preferences.ui_scale, None);
        assert!(parsed.personalization.is_none());
        assert!(parsed.custom_keybindings.is_none());

        let migrated = serde_json::to_value(parsed).expect("migrated settings serialize");
        assert_eq!(
            migrated
                .pointer("/llmConfig/defaultModels/managed_cloud")
                .and_then(serde_json::Value::as_str),
            Some("auto")
        );
        assert!(migrated
            .pointer("/llmConfig/defaultModels/managedCloud")
            .is_none());
    }

    #[tokio::test]
    async fn settings_snapshot_atomically_replaces_an_existing_file() {
        let directory = tempfile::tempdir().expect("temporary settings directory");
        let settings_path = directory.path().join("settings.json");
        std::fs::write(&settings_path, b"previous valid snapshot")
            .expect("seed previous settings snapshot");

        let state = SettingsState::default();
        let mut settings = state.settings.lock().await.clone();
        settings.window_preferences.language = "fr".to_string();

        persist_settings_snapshot_to_path(&settings_path, &settings)
            .await
            .expect("replace settings snapshot");

        let persisted: Settings = serde_json::from_slice(
            &std::fs::read(&settings_path).expect("read committed settings snapshot"),
        )
        .expect("committed snapshot is complete JSON");
        assert_eq!(persisted.window_preferences.language, "fr");
        assert!(
            std::fs::read_dir(directory.path())
                .expect("read settings directory")
                .all(|entry| {
                    !entry
                        .expect("settings directory entry")
                        .file_name()
                        .to_string_lossy()
                        .starts_with(".settings.json.")
                }),
            "a successful commit must not leave a staged settings file behind"
        );
    }
}

/// Personalization preferences sent from the frontend on each save.
/// These are stored in settings.json alongside other preferences.
/// Defaults match defaultPersonalization in settingsStore.ts so that
/// a neutral profile round-trips without emitting any guidance.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Personalization {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub occupation: String,
    #[serde(default)]
    pub bio: String,
    #[serde(default = "default_slider_neutral")]
    pub formality: u8,
    #[serde(default = "default_slider_neutral")]
    pub warmth: u8,
    #[serde(default = "default_slider_neutral")]
    pub detail: u8,
    #[serde(default = "default_emoji_usage")]
    pub emoji_usage: String,
}

fn default_slider_neutral() -> u8 {
    3
}

fn default_emoji_usage() -> String {
    "sometimes".to_string()
}

impl Default for Personalization {
    fn default() -> Self {
        Self {
            name: String::new(),
            occupation: String::new(),
            bio: String::new(),
            formality: default_slider_neutral(),
            warmth: default_slider_neutral(),
            detail: default_slider_neutral(),
            emoji_usage: default_emoji_usage(),
        }
    }
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
    /// Optional during migration so an older settings.json does not replace a
    /// renderer-hydrated personalization profile with neutral defaults.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub personalization: Option<Personalization>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_keybindings: Option<std::collections::HashMap<String, String>>,
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
                    lmstudio_url: Some("http://localhost:1234/v1".to_string()),
                    llamacpp_url: Some("http://localhost:8080/v1".to_string()),
                    vllm_url: Some("http://localhost:8000/v1".to_string()),
                },
                window_preferences: WindowPreferences {
                    theme: "system".to_string(),
                    language: default_language(),
                    startup_position: "center".to_string(),
                    dock_on_startup: None,
                    selected_theme: None,
                    dyslexic_font: Some(false),
                    chat_font: Some("default".to_string()),
                    ui_scale: Some(100),
                    reduce_motion: Some(false),
                },
                chat_preferences: Some(ChatPreferences {
                    prompt_completion_enabled: true,
                    show_timestamps: false,
                    always_use_agent_mode: false,
                    compact_mode: true,
                    auto_approve_tools: false,
                    auto_inject_skills: true,
                    memory_enabled: false,
                    allow_tool_assisted_memory_generation: false,
                    auto_save_memories: false,
                    chat_storage_mode: default_chat_storage_mode(),
                    send_shortcut: Some(default_send_shortcut()),
                    temporary_chat: Some(false),
                }),
                execution_preferences: Some(ExecutionPreferences {
                    max_timeout_minutes: default_max_timeout_minutes(),
                    enable_checkpointing: default_enable_checkpointing(),
                    checkpoint_interval: default_checkpoint_interval(),
                    auto_resume_on_restart: default_auto_resume_on_restart(),
                    enable_timeout_warnings: default_enable_timeout_warnings(),
                    terminal_sandbox: TerminalSandboxPreferences::default(),
                    approval_timeout_seconds: Some(300),
                    approval_timeout_policy: Some("auto-deny".to_string()),
                    stream_inactivity_timeout_seconds: Some(30),
                }),
                global_hotkey_preferences: default_global_hotkey_preferences(),
                allowed_directories: default_allowed_directories(),
                custom_models: Vec::new(),
                feature_flags: std::collections::HashMap::new(),
                personalization: Some(Personalization::default()),
                custom_keybindings: Some(std::collections::HashMap::new()),
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

    // Hold the native settings lock for the complete commit. Concurrent save
    // commands must not interleave their shortcut, disk, and in-memory stages.
    let mut current_settings = state.settings.lock().await;
    let previous_settings = current_settings.clone();

    let shortcuts_state =
        app_handle.try_state::<Arc<Mutex<crate::sys::commands::shortcuts::ShortcutsState>>>();
    if let Some(shortcuts_state) = shortcuts_state.as_ref() {
        crate::sys::commands::shortcuts::apply_quick_query_hotkey_preferences(
            &app_handle,
            shortcuts_state,
            crate::sys::commands::shortcuts::QuickQueryHotkeyPreferences {
                enabled: settings.global_hotkey_preferences.enabled,
                combo: settings.global_hotkey_preferences.combo.clone(),
            },
        )
        .await?;
    }

    if let Err(save_error) = persist_settings_snapshot(&app_handle, &settings).await {
        // The OS shortcut was the only live side effect staged before disk.
        // Restore it before reporting failure so the Settings panel can keep
        // the draft open without having silently applied part of it.
        let rollback_error = if let Some(shortcuts_state) = shortcuts_state.as_ref() {
            crate::sys::commands::shortcuts::apply_quick_query_hotkey_preferences(
                &app_handle,
                shortcuts_state,
                crate::sys::commands::shortcuts::QuickQueryHotkeyPreferences {
                    enabled: previous_settings.global_hotkey_preferences.enabled,
                    combo: previous_settings.global_hotkey_preferences.combo.clone(),
                },
            )
            .await
            .err()
        } else {
            None
        };

        return Err(match rollback_error {
            Some(rollback_error) => format!(
                "{save_error}. The previous global shortcut could not be restored: {rollback_error}"
            ),
            None => save_error,
        });
    }

    // Publish the new native state only after every fallible commit stage has
    // succeeded. A failed Save therefore leaves disk, shortcut, and memory on
    // the same previous snapshot.
    *current_settings = settings;

    tracing::info!("Settings persisted");
    Ok(())
}

pub(crate) async fn persist_settings_snapshot(
    app_handle: &tauri::AppHandle,
    settings: &Settings,
) -> Result<(), String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let settings_path = app_data_dir.join("settings.json");
    persist_settings_snapshot_to_path(&settings_path, settings).await?;

    tracing::info!("Settings persisted to {:?}", settings_path);
    Ok(())
}

async fn persist_settings_snapshot_to_path(
    settings_path: &Path,
    settings: &Settings,
) -> Result<(), String> {
    let parent = settings_path
        .parent()
        .ok_or_else(|| "Settings path has no parent directory".to_string())?;
    tokio::fs::create_dir_all(parent)
        .await
        .map_err(|error| format!("Failed to create app data directory: {error}"))?;

    let json = serde_json::to_vec_pretty(settings)
        .map_err(|error| format!("Failed to serialize settings: {error}"))?;
    let parent = parent.to_path_buf();
    let settings_path = settings_path.to_path_buf();

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let mut staged = tempfile::Builder::new()
            .prefix(".settings.json.")
            .suffix(".tmp")
            .tempfile_in(&parent)
            .map_err(|error| format!("Failed to stage settings file: {error}"))?;
        staged
            .write_all(&json)
            .map_err(|error| format!("Failed to write staged settings file: {error}"))?;
        staged
            .as_file_mut()
            .sync_all()
            .map_err(|error| format!("Failed to sync staged settings file: {error}"))?;
        staged
            .persist(&settings_path)
            .map_err(|error| format!("Failed to atomically replace settings file: {error}"))?;
        Ok(())
    })
    .await
    .map_err(|error| format!("Settings persistence task failed: {error}"))?
}

/// Persist a native-authoritative extension of the Allowed Directories list.
///
/// Used by the just-in-time folder consent flow. The snapshot is written before
/// the in-memory state is widened, so a disk failure leaves both enforcement
/// and the settings UI on the previous, fail-closed value.
pub(crate) async fn add_allowed_directories_persisted(
    app_handle: &tauri::AppHandle,
    state: &SettingsState,
    paths: &[String],
) -> Result<Vec<String>, String> {
    let mut current = state.settings.lock().await;
    let mut updated = current.clone();

    for path in paths {
        let path = path.trim();
        if path.is_empty()
            || updated
                .allowed_directories
                .iter()
                .any(|entry| entry == path)
        {
            continue;
        }
        updated.allowed_directories.push(path.to_string());
    }

    updated.allowed_directories.sort();
    updated.allowed_directories.dedup();

    if updated.allowed_directories != current.allowed_directories {
        persist_settings_snapshot(app_handle, &updated).await?;
        *current = updated;
    }

    Ok(current.allowed_directories.clone())
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

        // REMOVED: do NOT coerce the user's persisted chat_storage_mode.
        // A mode the user explicitly saved must be honored exactly.
        // (The old coercion from 'cloud'->'local' was a silent trust-boundary
        // violation that hid the actual persisted state from the backend.)

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
