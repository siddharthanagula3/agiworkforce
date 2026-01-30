//! Settings service with encryption and caching
//!
//! Uses machine-derived keys for encryption instead of OS keyring.

use crate::data::settings::{
    models::{AppSettings, Setting, SettingCategory, SettingValue},
    repository,
    validation::{self, ValidationError},
};
use crate::sys::security::machine_key::{self, KeyPurpose};
use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use parking_lot::RwLock;
use rusqlite::Connection;
use std::collections::HashMap;
use std::convert::TryInto;
use std::sync::{Arc, Mutex};
use thiserror::Error;

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

    #[error("Setting not found: {0}")]
    NotFound(String),

    #[error("Invalid setting value type for key: {0}")]
    InvalidType(String),

    #[error("Failed to acquire lock: {0}")]
    LockError(String),
}

/// Settings service with encryption and caching
pub struct SettingsService {
    conn: Arc<Mutex<Connection>>,
    cipher: Arc<Mutex<Aes256Gcm>>,
    // DAT-002 fix: Use RwLock instead of Mutex for cache to reduce lock contention on reads
    cache: Arc<RwLock<HashMap<String, SettingValue>>>,
}

impl SettingsService {
    /// Create a new settings service
    pub fn new(conn: Arc<Mutex<Connection>>) -> Result<Self, SettingsServiceError> {
        // Get encryption key from machine-derived keys
        let master_key = machine_key::derive_key(KeyPurpose::DatabaseEncryption);
        let key_bytes: [u8; 32] = master_key
            .as_slice()
            .try_into()
            .map_err(|_| SettingsServiceError::Encryption("Invalid master key length".into()))?;
        let key = Key::<Aes256Gcm>::from(key_bytes);
        let cipher = Aes256Gcm::new(&key);

        Ok(Self {
            conn,
            cipher: Arc::new(Mutex::new(cipher)),
            cache: Arc::new(RwLock::new(HashMap::new())),
        })
    }

    fn encrypt(&self, plaintext: &str) -> Result<String, SettingsServiceError> {
        let cipher = self.cipher.lock().map_err(|_| {
            SettingsServiceError::Encryption("Failed to acquire cipher lock".into())
        })?;

        let mut nonce_bytes = [0u8; 12];
        use rand::RngCore;
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from(nonce_bytes);

        let ciphertext = cipher
            .encrypt(&nonce, plaintext.as_bytes())
            .map_err(|e| SettingsServiceError::Encryption(format!("Encryption failed: {}", e)))?;

        let mut combined = nonce_bytes.to_vec();
        combined.extend_from_slice(&ciphertext);

        Ok(general_purpose::STANDARD.encode(combined))
    }

    fn decrypt(&self, encrypted: &str) -> Result<String, SettingsServiceError> {
        let cipher = self.cipher.lock().map_err(|_| {
            SettingsServiceError::Encryption("Failed to acquire cipher lock".into())
        })?;

        let combined = general_purpose::STANDARD.decode(encrypted).map_err(|e| {
            SettingsServiceError::Encryption(format!("Invalid encrypted data: {}", e))
        })?;

        if combined.len() < 12 {
            return Err(SettingsServiceError::Encryption(
                "Encrypted data too short".to_string(),
            ));
        }

        let (nonce_bytes, ciphertext) = combined.split_at(12);
        let nonce_array: [u8; 12] = nonce_bytes
            .try_into()
            .map_err(|_| SettingsServiceError::Encryption("Invalid nonce length".into()))?;
        let nonce = Nonce::from(nonce_array);

        let plaintext = cipher
            .decrypt(&nonce, ciphertext)
            .map_err(|e| SettingsServiceError::Encryption(format!("Decryption failed: {}", e)))?;

        String::from_utf8(plaintext)
            .map_err(|e| SettingsServiceError::Encryption(format!("Invalid UTF-8: {}", e)))
    }

    pub fn set(
        &self,
        key: String,
        value: SettingValue,
        category: SettingCategory,
        encrypted: bool,
    ) -> Result<(), SettingsServiceError> {
        self.validate_setting(&key, &value)?;

        let conn = self
            .conn
            .lock()
            .map_err(|e| SettingsServiceError::LockError(e.to_string()))?;

        let value_to_store = if encrypted {
            let plaintext = value.to_json_string()?;
            let encrypted_str = self.encrypt(&plaintext)?;
            SettingValue::String(encrypted_str)
        } else {
            value.clone()
        };

        repository::upsert_setting(&conn, key.clone(), value_to_store, category, encrypted)?;

        // DAT-002: Use write lock for cache update
        self.cache.write().insert(key, value);

        Ok(())
    }

    pub fn get(&self, key: &str) -> Result<SettingValue, SettingsServiceError> {
        // DAT-002: Use read lock for cache lookup (allows concurrent reads)
        {
            let cache = self.cache.read();
            if let Some(value) = cache.get(key) {
                return Ok(value.clone());
            }
        }

        let conn = self
            .conn
            .lock()
            .map_err(|e| SettingsServiceError::LockError(e.to_string()))?;
        let setting = repository::get_setting(&conn, key)
            .map_err(|_| SettingsServiceError::NotFound(key.to_string()))?;

        let stored_value = setting.get_value()?;
        let value = if setting.encrypted {
            let encrypted_str = stored_value
                .as_string()
                .ok_or_else(|| SettingsServiceError::InvalidType(key.to_string()))?
                .to_owned();
            let decrypted = self.decrypt(&encrypted_str)?;
            SettingValue::from_json_string(&decrypted)?
        } else {
            stored_value
        };

        // DAT-002: Use write lock for cache population
        self.cache.write().insert(key.to_string(), value.clone());

        Ok(value)
    }

    pub fn get_or_default(&self, key: &str, default: SettingValue) -> SettingValue {
        self.get(key).unwrap_or(default)
    }

    pub fn set_batch(
        &self,
        settings: Vec<(String, SettingValue, SettingCategory, bool)>,
    ) -> Result<(), SettingsServiceError> {
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

            // DAT-002: Use write lock for cache update
            self.cache.write().insert(key, value);
        }

        let conn = self
            .conn
            .lock()
            .map_err(|e| SettingsServiceError::LockError(e.to_string()))?;
        repository::upsert_settings_batch(&conn, processed_settings)?;

        Ok(())
    }

    pub fn delete(&self, key: &str) -> Result<(), SettingsServiceError> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| SettingsServiceError::LockError(e.to_string()))?;
        repository::delete_setting(&conn, key)?;

        // DAT-002: Use write lock for cache removal
        self.cache.write().remove(key);

        Ok(())
    }

    pub fn get_by_category(
        &self,
        category: SettingCategory,
    ) -> Result<Vec<Setting>, SettingsServiceError> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| SettingsServiceError::LockError(e.to_string()))?;
        Ok(repository::get_settings_by_category(&conn, category)?)
    }

    pub fn list_all(&self) -> Result<Vec<Setting>, SettingsServiceError> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| SettingsServiceError::LockError(e.to_string()))?;
        Ok(repository::list_all_settings(&conn)?)
    }

    pub fn clear_cache(&self) {
        // DAT-002: parking_lot RwLock doesn't use poisoning, so no error handling needed
        self.cache.write().clear();
    }

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
            _ => {}
        }

        Ok(())
    }

    /// Save API key to database (encrypted)
    pub fn save_api_key(&self, provider: &str, key: &str) -> Result<(), SettingsServiceError> {
        validation::validate_api_key(provider, key)?;

        self.set(
            format!("api_key_{}", provider),
            SettingValue::String(key.to_string()),
            SettingCategory::Security,
            true, // Always encrypt API keys
        )
    }

    /// Get API key from database (decrypted)
    pub fn get_api_key(&self, provider: &str) -> Result<String, SettingsServiceError> {
        let value = self.get(&format!("api_key_{}", provider))?;
        value
            .as_string()
            .map(|s| s.to_string())
            .ok_or_else(|| SettingsServiceError::InvalidType(format!("api_key_{}", provider)))
    }

    pub fn load_app_settings(&self) -> Result<AppSettings, SettingsServiceError> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| SettingsServiceError::LockError(e.to_string()))?;
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

        let value1 = service.get("cached_key").unwrap();
        assert_eq!(value1.as_integer(), Some(42));

        let value2 = service.get("cached_key").unwrap();
        assert_eq!(value2.as_integer(), Some(42));
    }

    #[test]
    fn test_validation() {
        let service = setup_test_service();

        let result = service.set(
            "temperature".to_string(),
            SettingValue::Float(3.0),
            SettingCategory::Llm,
            false,
        );
        assert!(result.is_err());

        let result = service.set(
            "temperature".to_string(),
            SettingValue::Float(0.7),
            SettingCategory::Llm,
            false,
        );
        assert!(result.is_ok());
    }
}
