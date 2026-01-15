use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

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
                allowed_directories: Vec::new(),
            })),
        }
    }
}

#[tauri::command]
pub async fn settings_save_api_key(provider: String, key: String) -> Result<(), String> {
    use crate::security::machine_key::{derive_key, KeyPurpose};
    use aes_gcm::{aead::{Aead, OsRng}, Aes256Gcm, KeyInit, Nonce};
    use base64::{engine::general_purpose, Engine as _};
    use rand::RngCore;

    // Trim the key to remove any whitespace before saving
    let trimmed_key = key.trim();
    if trimmed_key.is_empty() {
        return Err("API key cannot be empty".to_string());
    }

    // Encrypt the key
    let encryption_key = derive_key(KeyPurpose::DatabaseEncryption);
    let cipher = Aes256Gcm::new_from_slice(&encryption_key)
        .map_err(|e| format!("Failed to create cipher: {}", e))?;

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    // Store as JSON string for consistency with SettingValue::String
    let json_value = serde_json::to_string(trimmed_key)
        .map_err(|e| format!("Failed to serialize: {}", e))?;

    let ciphertext = cipher
        .encrypt(nonce, json_value.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;

    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);
    let encrypted = general_purpose::STANDARD.encode(combined);

    // Get the database path
    let app_data = dirs::data_dir()
        .ok_or_else(|| "Failed to get app data directory".to_string())?;
    let db_path = app_data.join("agiworkforce").join("agiworkforce.db");

    // Store in database
    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    let api_key_key = format!("api_key_{}", provider);
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT OR REPLACE INTO settings_v2 (key, value, category, encrypted, created_at, updated_at)
         VALUES (?1, ?2, 'security', 1, ?3, ?3)",
        rusqlite::params![api_key_key, encrypted, now],
    )
    .map_err(|e| format!("Failed to save API key: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn settings_get_api_key(provider: String) -> Result<String, String> {
    use crate::security::machine_key::{derive_key, KeyPurpose};
    use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
    use base64::{engine::general_purpose, Engine as _};

    // Get the database path
    let app_data = dirs::data_dir()
        .ok_or_else(|| "Failed to get app data directory".to_string())?;
    let db_path = app_data.join("agiworkforce").join("agiworkforce.db");

    // Query database
    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    let api_key_key = format!("api_key_{}", provider);
    let encrypted: String = conn
        .query_row(
            "SELECT value FROM settings_v2 WHERE key = ?1 AND encrypted = 1",
            rusqlite::params![api_key_key],
            |row| row.get(0),
        )
        .map_err(|_| format!("API key not found for provider: {}", provider))?;

    // Decrypt
    let encryption_key = derive_key(KeyPurpose::DatabaseEncryption);
    let cipher = Aes256Gcm::new_from_slice(&encryption_key)
        .map_err(|e| format!("Failed to create cipher: {}", e))?;

    let combined = general_purpose::STANDARD
        .decode(&encrypted)
        .map_err(|e| format!("Invalid encrypted data: {}", e))?;

    if combined.len() < 12 {
        return Err("Encrypted data too short".to_string());
    }

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Failed to decrypt API key".to_string())?;

    let json_value = String::from_utf8(plaintext)
        .map_err(|e| format!("Invalid UTF-8: {}", e))?;

    // Parse the JSON string value
    let key: String = serde_json::from_str(&json_value)
        .map_err(|e| format!("Failed to parse: {}", e))?;

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
