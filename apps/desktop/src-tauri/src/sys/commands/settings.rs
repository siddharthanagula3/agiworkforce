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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DefaultModels {
    pub ollama: String,
    pub managed_cloud: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowPreferences {
    pub theme: String,
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
}

fn default_prompt_completion_enabled() -> bool {
    true
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
    pub allowed_directories: Vec<String>,
}

pub struct SettingsState {
    pub settings: Arc<Mutex<Settings>>,
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
                },
                window_preferences: WindowPreferences {
                    theme: "system".to_string(),
                    startup_position: "center".to_string(),
                    dock_on_startup: None,
                },
                chat_preferences: Some(ChatPreferences {
                    prompt_completion_enabled: true,
                    show_timestamps: false,
                }),
                allowed_directories: default_allowed_directories(),
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
    // Update in-memory state
    let mut current_settings = state.settings.lock().await;
    *current_settings = settings.clone();

    // Persist to disk
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let settings_path = app_data_dir.join("settings.json");

    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    tokio::fs::write(&settings_path, json)
        .await
        .map_err(|e| format!("Failed to write settings file: {}", e))?;

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
