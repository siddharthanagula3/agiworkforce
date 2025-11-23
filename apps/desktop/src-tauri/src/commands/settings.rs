use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

const SERVICE_NAME: &str = "AGIWorkforce";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
    pub xai: String,
    pub deepseek: String,
    pub qwen: String,
    pub mistral: String,
    pub moonshot: String,
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
                        openai: "gpt-5.1".to_string(),
                        anthropic: "claude-sonnet-4-5".to_string(),
                        google: "gemini-3-pro".to_string(),
                        ollama: "llama4-maverick".to_string(),
                        xai: "grok-4.1".to_string(),
                        deepseek: "".to_string(),
                        qwen: "qwen3-max".to_string(),
                        mistral: "".to_string(),
                        moonshot: "kimi-k2-thinking".to_string(),
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

    // Trim the key to remove any whitespace before saving
    let trimmed_key = key.trim();
    if trimmed_key.is_empty() {
        return Err("API key cannot be empty".to_string());
    }

    entry
        .set_password(trimmed_key)
        .map_err(|e| format!("Failed to save API key: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn settings_get_api_key(provider: String) -> Result<String, String> {
    let entry = Entry::new(SERVICE_NAME, &format!("api_key_{}", provider))
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;

    let key = entry
        .get_password()
        .map_err(|e| format!("Failed to get API key: {}", e))?;

    // Trim the key when retrieving to ensure no extra whitespace
    Ok(key.trim().to_string())
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
