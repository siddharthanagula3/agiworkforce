use crate::settings::{
    models::{AppSettings, Setting, SettingCategory, SettingValue},
    repository,
    validation::{self, ValidationError},
};
use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use keyring::Entry;
use rusqlite::Connection;
use std::collections::HashMap;
use std::convert::TryInto;
use std::sync::{Arc, Mutex};
use thiserror::Error;

const SERVICE_NAME: &str = "AGIWorkforce";
const ENCRYPTION_KEY_NAME: &str = "encryption_master_key";

/// Settings service error types
#[derive(Debug, Error)]
pub enum SettingsServiceError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Validation error: {0}")]
    Validation(#[from] ValidationError),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Encryption error: {0}")]
    Encryption(String),

    #[error("Keyring error: {0}")]
    Keyring(String),

    #[error("Setting not found: {0}")]
    NotFound(String),

    #[error("Invalid setting value type for key: {0}")]
    InvalidType(String),
}

/// Settings service with encryption and caching
pub struct SettingsService {
    conn: Arc<Mutex<Connection>>,
    cipher: Arc<Mutex<Aes256Gcm>>,
    cache: Arc<Mutex<HashMap<String, SettingValue>>>,
}

impl SettingsService {
    /// Create a new settings service
    pub fn new(conn: Arc<Mutex<Connection>>) -> Result<Self, SettingsServiceError> {
        // Get or create encryption key
        let master_key = Self::get_or_create_master_key()?;
        let key_bytes: [u8; 32] = master_key
            .as_slice()
            .try_into()
            .map_err(|_| SettingsServiceError::Encryption("Invalid master key length".into()))?;
        let key = Key::<Aes256Gcm>::from(key_bytes);
        let cipher = Aes256Gcm::new(&key);

        Ok(Self {
            conn,
            cipher: Arc::new(Mutex::new(cipher)),
            cache: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    /// Get or create master encryption key in system keyring
    fn get_or_create_master_key() -> Result<Vec<u8>, SettingsServiceError> {
        let entry = Entry::new(SERVICE_NAME, ENCRYPTION_KEY_NAME).map_err(|e| {
            SettingsServiceError::Keyring(format!("Failed to access keyring: {}", e))
        })?;

        match entry.get_password() {
            Ok(key_b64) => {
                // Decode existing key
                general_purpose::STANDARD.decode(key_b64).map_err(|e| {
                    SettingsServiceError::Encryption(format!("Invalid key format: {}", e))
                })
            }
            Err(_) => {
                // Generate new key
                let mut key = vec![0u8; 32];
                use rand::RngCore;
                OsRng.fill_bytes(&mut key);

                let key_b64 = general_purpose::STANDARD.encode(&key);
                entry.set_password(&key_b64).map_err(|e| {
                    SettingsServiceError::Keyring(format!("Failed to store key: {}", e))
                })?;

                Ok(key)
            }
        }
    }

    /// Encrypt a value
    fn encrypt(&self, plaintext: &str) -> Result<String, SettingsServiceError> {
        let cipher = self.cipher.lock().unwrap();

        // Generate random nonce
        let mut nonce_bytes = [0u8; 12];
        use rand::RngCore;
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from(nonce_bytes);

        // Encrypt
        let ciphertext = cipher
            .encrypt(&nonce, plaintext.as_bytes())
            .map_err(|e| SettingsServiceError::Encryption(format!("Encryption failed: {}", e)))?;

        // Combine nonce + ciphertext and encode as base64
        let mut combined = nonce_bytes.to_vec();
        combined.extend_from_slice(&ciphertext);

        Ok(general_purpose::STANDARD.encode(combined))
    }

    /// Decrypt a value
    fn decrypt(&self, encrypted: &str) -> Result<String, SettingsServiceError> {
        let cipher = self.cipher.lock().unwrap();

        // Decode from base64
        let combined = general_purpose::STANDARD.decode(encrypted).map_err(|e| {
            SettingsServiceError::Encryption(format!("Invalid encrypted data: {}", e))
        })?;

        if combined.len() < 12 {
            return Err(SettingsServiceError::Encryption(
                "Encrypted data too short".to_string(),
            ));
        }

        // Split nonce and ciphertext
        let (nonce_bytes, ciphertext) = combined.split_at(12);
        let nonce_array: [u8; 12] = nonce_bytes
            .try_into()
            .map_err(|_| SettingsServiceError::Encryption("Invalid nonce length".into()))?;
        let nonce = Nonce::from(nonce_array);

        // Decrypt
        let plaintext = cipher
            .decrypt(&nonce, ciphertext)
            .map_err(|e| SettingsServiceError::Encryption(format!("Decryption failed: {}", e)))?;

        String::from_utf8(plaintext)
            .map_err(|e| SettingsServiceError::Encryption(format!("Invalid UTF-8: {}", e)))
    }

    /// Set a setting value
    pub fn set(
        &self,
        key: String,
        value: SettingValue,
        category: SettingCategory,
        encrypted: bool,
    ) -> Result<(), SettingsServiceError> {
        // Validate based on key
        self.validate_setting(&key, &value)?;

        let conn = self.conn.lock().unwrap();

        // Encrypt value if needed
        let value_to_store = if encrypted {
            let plaintext = value.to_json_string()?;
            let encrypted_str = self.encrypt(&plaintext)?;
            SettingValue::String(encrypted_str)
        } else {
            value.clone()
        };

        repository::upsert_setting(&conn, key.clone(), value_to_store, category, encrypted)?;

        // Update cache
        let mut cache = self.cache.lock().unwrap();
        cache.insert(key, value);

        Ok(())
    }

    /// Get a setting value
    pub fn get(&self, key: &str) -> Result<SettingValue, SettingsServiceError> {
        // Check cache first
        {
            let cache = self.cache.lock().unwrap();
            if let Some(value) = cache.get(key) {
                return Ok(value.clone());
            }
        }

        // Load from database
        let conn = self.conn.lock().unwrap();
        let setting = repository::get_setting(&conn, key)
            .map_err(|_| SettingsServiceError::NotFound(key.to_string()))?;

        let stored_value = setting.get_value()?;
        let value = if setting.encrypted {
            // Decrypt value
            let encrypted_str = stored_value
                .as_string()
                .ok_or_else(|| SettingsServiceError::InvalidType(key.to_string()))?
                .to_owned();
            let decrypted = self.decrypt(&encrypted_str)?;
            SettingValue::from_json_string(&decrypted)?
        } else {
            stored_value
        };

        // Update cache
        let mut cache = self.cache.lock().unwrap();
        cache.insert(key.to_string(), value.clone());

        Ok(value)
    }

    /// Get a setting with a default value if not found
    pub fn get_or_default(&self, key: &str, default: SettingValue) -> SettingValue {
        self.get(key).unwrap_or(default)
    }

    /// Batch set multiple settings
    pub fn set_batch(
        &self,
        settings: Vec<(String, SettingValue, SettingCategory, bool)>,
    ) -> Result<(), SettingsServiceError> {
        // Validate all settings first
        for (key, value, _, _) in &settings {
            self.validate_setting(key, value)?;
        }

        let mut processed_settings = Vec::new();
        for (key, value, category, encrypted) in settings {
            let value_to_store = if encrypted {
                let plaintext = value.to_json_string()?;
                let encrypted_str = self.encrypt(&plaintext)?;
                SettingValue::String(encrypted_str)
            } else {
                value.clone()
            };

            processed_settings.push((key.clone(), value_to_store, category, encrypted));

            // Update cache
            let mut cache = self.cache.lock().unwrap();
            cache.insert(key, value);
        }

        let conn = self.conn.lock().unwrap();
        repository::upsert_settings_batch(&conn, processed_settings)?;

        Ok(())
    }

    /// Delete a setting
    pub fn delete(&self, key: &str) -> Result<(), SettingsServiceError> {
        let conn = self.conn.lock().unwrap();
        repository::delete_setting(&conn, key)?;

        // Remove from cache
        let mut cache = self.cache.lock().unwrap();
        cache.remove(key);

        Ok(())
    }

    /// Get all settings by category
    pub fn get_by_category(
        &self,
        category: SettingCategory,
    ) -> Result<Vec<Setting>, SettingsServiceError> {
        let conn = self.conn.lock().unwrap();
        Ok(repository::get_settings_by_category(&conn, category)?)
    }

    /// List all settings
    pub fn list_all(&self) -> Result<Vec<Setting>, SettingsServiceError> {
        let conn = self.conn.lock().unwrap();
        Ok(repository::list_all_settings(&conn)?)
    }

    /// Clear cache
    pub fn clear_cache(&self) {
        let mut cache = self.cache.lock().unwrap();
        cache.clear();
    }

    /// Validate a setting based on its key
    fn validate_setting(
        &self,
        key: &str,
        value: &SettingValue,
    ) -> Result<(), SettingsServiceError> {
        match key {
            k if k.ends_with("_api_key") => {
                let provider = k.strip_suffix("_api_key").unwrap_or("");
                if let Some(api_key) = value.as_string() {
                    validation::validate_api_key(provider, api_key)?;
                }
            }
            "temperature" => {
                if let Some(temp) = value.as_float() {
                    validation::validate_temperature(temp)?;
                }
            }
            "max_tokens" => {
                if let Some(tokens) = value.as_integer() {
                    validation::validate_max_tokens(tokens as u32)?;
                }
            }
            "theme" => {
                if let Some(theme) = value.as_string() {
                    validation::validate_theme(theme)?;
                }
            }
            "language" => {
                if let Some(lang) = value.as_string() {
                    validation::validate_language_code(lang)?;
                }
            }
            "font_size" => {
                if let Some(size) = value.as_integer() {
                    validation::validate_font_size(size as u32)?;
                }
            }
            _ => {} // No specific validation
        }

        Ok(())
    }

    /// Save API key to keyring (legacy support)
    pub fn save_api_key(&self, provider: &str, key: &str) -> Result<(), SettingsServiceError> {
        validation::validate_api_key(provider, key)?;

        let entry = Entry::new(SERVICE_NAME, &format!("api_key_{}", provider)).map_err(|e| {
            SettingsServiceError::Keyring(format!("Failed to access keyring: {}", e))
        })?;

        entry
            .set_password(key)
            .map_err(|e| SettingsServiceError::Keyring(format!("Failed to save API key: {}", e)))?;

        Ok(())
    }

    /// Get API key from keyring (legacy support)
    pub fn get_api_key(&self, provider: &str) -> Result<String, SettingsServiceError> {
        let entry = Entry::new(SERVICE_NAME, &format!("api_key_{}", provider)).map_err(|e| {
            SettingsServiceError::Keyring(format!("Failed to access keyring: {}", e))
        })?;

        entry
            .get_password()
            .map_err(|e| SettingsServiceError::Keyring(format!("Failed to get API key: {}", e)))
    }

    /// Load complete application settings
    pub fn load_app_settings(&self) -> Result<AppSettings, SettingsServiceError> {
        let conn = self.conn.lock().unwrap();
        let all_settings = repository::list_all_settings(&conn)?;

        let mut app_settings = AppSettings::default();

        for setting in all_settings {
            let stored_value = setting.get_value()?;
            let value = if setting.encrypted {
                let encrypted_str = stored_value
                    .as_string()
                    .ok_or_else(|| SettingsServiceError::InvalidType(setting.key.clone()))?
                    .to_owned();
                let decrypted = self.decrypt(&encrypted_str)?;
                SettingValue::from_json_string(&decrypted)?
            } else {
                stored_value
            };

            // Map settings to AppSettings structure
            match setting.key.as_str() {
                "default_provider" => {
                    if let Some(s) = value.as_string() {
                        app_settings.default_provider = s.to_string();
                    }
                }
                "default_model" => {
                    if let Some(s) = value.as_string() {
                        app_settings.default_model = s.to_string();
                    }
                }
                "ui_preferences" => {
                    if let Some(json) = value.as_json() {
                        app_settings.ui_preferences = serde_json::from_value(json.clone())?;
                    }
                }
                "window_preferences" => {
                    if let Some(json) = value.as_json() {
                        app_settings.window_preferences = serde_json::from_value(json.clone())?;
                    }
                }
                "security_settings" => {
                    if let Some(json) = value.as_json() {
                        app_settings.security_settings = serde_json::from_value(json.clone())?;
                    }
                }
                _ => {}
            }
        }

        Ok(app_settings)
    }

    /// Save complete application settings
    pub fn save_app_settings(&self, settings: &AppSettings) -> Result<(), SettingsServiceError> {
        let batch = vec![
            (
                "default_provider".to_string(),
                SettingValue::String(settings.default_provider.clone()),
                SettingCategory::Llm,
                false,
            ),
            (
                "default_model".to_string(),
                SettingValue::String(settings.default_model.clone()),
                SettingCategory::Llm,
                false,
            ),
            (
                "ui_preferences".to_string(),
                SettingValue::Json(serde_json::to_value(&settings.ui_preferences)?),
                SettingCategory::Ui,
                false,
            ),
            (
                "window_preferences".to_string(),
                SettingValue::Json(serde_json::to_value(&settings.window_preferences)?),
                SettingCategory::Window,
                false,
            ),
            (
                "security_settings".to_string(),
                SettingValue::Json(serde_json::to_value(&settings.security_settings)?),
                SettingCategory::Security,
                false,
            ),
        ];

        self.set_batch(batch)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_test_service() -> SettingsService {
        let conn = Connection::open_in_memory().unwrap();

        conn.execute(
            "CREATE TABLE settings_v2 (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                category TEXT NOT NULL,
                encrypted INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )
        .unwrap();

        SettingsService::new(Arc::new(Mutex::new(conn))).unwrap()
    }

    #[test]
    fn test_set_and_get() {
        let service = setup_test_service();

        service
            .set(
                "test_key".to_string(),
                SettingValue::String("test_value".to_string()),
                SettingCategory::System,
                false,
            )
            .unwrap();

        let value = service.get("test_key").unwrap();
        assert_eq!(value.as_string(), Some("test_value"));
    }

    #[test]
    fn test_encryption() {
        let service = setup_test_service();

        let sensitive = "sensitive_data";
        service
            .set(
                "encrypted_key".to_string(),
                SettingValue::String(sensitive.to_string()),
                SettingCategory::Security,
                true,
            )
            .unwrap();

        let value = service.get("encrypted_key").unwrap();
        assert_eq!(value.as_string(), Some(sensitive));
    }

    #[test]
    fn test_cache() {
        let service = setup_test_service();

        service
            .set(
                "cached_key".to_string(),
                SettingValue::Integer(42),
                SettingCategory::System,
                false,
            )
            .unwrap();

        // First get loads from DB
        let value1 = service.get("cached_key").unwrap();
        assert_eq!(value1.as_integer(), Some(42));

        // Second get should come from cache
        let value2 = service.get("cached_key").unwrap();
        assert_eq!(value2.as_integer(), Some(42));
    }

    #[test]
    fn test_validation() {
        let service = setup_test_service();

        // Invalid temperature
        let result = service.set(
            "temperature".to_string(),
            SettingValue::Float(3.0),
            SettingCategory::Llm,
            false,
        );
        assert!(result.is_err());

        // Valid temperature
        let result = service.set(
            "temperature".to_string(),
            SettingValue::Float(0.7),
            SettingCategory::Llm,
            false,
        );
        assert!(result.is_ok());
    }
}
