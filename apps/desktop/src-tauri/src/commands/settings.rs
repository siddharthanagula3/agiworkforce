use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

const SERVICE_NAME: &str = "AGIWorkforce";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMConfig {
    pub default_provider: String,
    pub temperature: f32,
    pub max_tokens: u32,
    pub default_models: DefaultModels,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DefaultModels {
    pub openai: String,
    pub anthropic: String,
    pub google: String,
    pub ollama: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowPreferences {
    pub theme: String,
    pub startup_position: String,
    pub dock_on_startup: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub llm_config: LLMConfig,
    pub window_preferences: WindowPreferences,
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
                    default_provider: "openai".to_string(),
                    temperature: 0.7,
                    max_tokens: 4096,
                    default_models: DefaultModels {
                        openai: "gpt-4o-mini".to_string(),
                        anthropic: "claude-3-5-sonnet-20241022".to_string(),
                        google: "gemini-1.5-flash".to_string(),
                        ollama: "llama3".to_string(),
                    },
                },
                window_preferences: WindowPreferences {
                    theme: "system".to_string(),
                    startup_position: "center".to_string(),
                    dock_on_startup: None,
                },
            })),
        }
    }
}

#[tauri::command]
pub async fn settings_save_api_key(provider: String, key: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, &format!("api_key_{}", provider))
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;

    entry
        .set_password(&key)
        .map_err(|e| format!("Failed to save API key: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn settings_get_api_key(provider: String) -> Result<String, String> {
    let entry = Entry::new(SERVICE_NAME, &format!("api_key_{}", provider))
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;

    entry
        .get_password()
        .map_err(|e| format!("Failed to get API key: {}", e))
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
) -> Result<(), String> {
    let mut current_settings = state.settings.lock().await;
    *current_settings = settings;
    Ok(())
}
