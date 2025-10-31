use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Setting category for organization
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Hash)]
#[serde(rename_all = "snake_case")]
pub enum SettingCategory {
    Llm,
    Ui,
    Security,
    Window,
    System,
}

impl SettingCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            SettingCategory::Llm => "llm",
            SettingCategory::Ui => "ui",
            SettingCategory::Security => "security",
            SettingCategory::Window => "window",
            SettingCategory::System => "system",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "llm" => Some(SettingCategory::Llm),
            "ui" => Some(SettingCategory::Ui),
            "security" => Some(SettingCategory::Security),
            "window" => Some(SettingCategory::Window),
            "system" => Some(SettingCategory::System),
            _ => None,
        }
    }
}

/// Type-safe setting value with validation
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum SettingValue {
    String(String),
    Integer(i64),
    Float(f64),
    Boolean(bool),
    Json(serde_json::Value),
}

impl SettingValue {
    pub fn as_string(&self) -> Option<&str> {
        match self {
            SettingValue::String(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_integer(&self) -> Option<i64> {
        match self {
            SettingValue::Integer(i) => Some(*i),
            _ => None,
        }
    }

    pub fn as_float(&self) -> Option<f64> {
        match self {
            SettingValue::Float(f) => Some(*f),
            _ => None,
        }
    }

    pub fn as_boolean(&self) -> Option<bool> {
        match self {
            SettingValue::Boolean(b) => Some(*b),
            _ => None,
        }
    }

    pub fn as_json(&self) -> Option<&serde_json::Value> {
        match self {
            SettingValue::Json(j) => Some(j),
            _ => None,
        }
    }

    /// Convert to JSON string for storage
    pub fn to_json_string(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }

    /// Parse from JSON string
    pub fn from_json_string(s: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(s)
    }
}

impl From<String> for SettingValue {
    fn from(s: String) -> Self {
        SettingValue::String(s)
    }
}

impl From<&str> for SettingValue {
    fn from(s: &str) -> Self {
        SettingValue::String(s.to_string())
    }
}

impl From<i64> for SettingValue {
    fn from(i: i64) -> Self {
        SettingValue::Integer(i)
    }
}

impl From<f64> for SettingValue {
    fn from(f: f64) -> Self {
        SettingValue::Float(f)
    }
}

impl From<bool> for SettingValue {
    fn from(b: bool) -> Self {
        SettingValue::Boolean(b)
    }
}

/// Database setting model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Setting {
    pub key: String,
    pub value: String, // JSON-serialized SettingValue
    pub category: SettingCategory,
    pub encrypted: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Setting {
    pub fn new(
        key: String,
        value: SettingValue,
        category: SettingCategory,
        encrypted: bool,
    ) -> Self {
        let now = Utc::now();
        Self {
            key,
            value: value
                .to_json_string()
                .unwrap_or_else(|_| "null".to_string()),
            category,
            encrypted,
            created_at: now,
            updated_at: now,
        }
    }

    pub fn get_value(&self) -> Result<SettingValue, serde_json::Error> {
        SettingValue::from_json_string(&self.value)
    }

    pub fn set_value(&mut self, value: SettingValue) -> Result<(), serde_json::Error> {
        self.value = value.to_json_string()?;
        self.updated_at = Utc::now();
        Ok(())
    }
}

/// LLM Provider configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LLMProviderConfig {
    pub provider: String,
    pub api_key: Option<String>, // Stored in keyring, not in DB
    pub base_url: Option<String>,
    pub timeout_seconds: u64,
    pub max_retries: u32,
    pub enabled: bool,
}

impl Default for LLMProviderConfig {
    fn default() -> Self {
        Self {
            provider: String::new(),
            api_key: None,
            base_url: None,
            timeout_seconds: 60,
            max_retries: 3,
            enabled: true,
        }
    }
}

/// Model-specific configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelConfig {
    pub model_name: String,
    pub temperature: f64,
    pub max_tokens: u32,
    pub top_p: Option<f64>,
    pub frequency_penalty: Option<f64>,
    pub presence_penalty: Option<f64>,
}

impl Default for ModelConfig {
    fn default() -> Self {
        Self {
            model_name: String::new(),
            temperature: 0.7,
            max_tokens: 4096,
            top_p: None,
            frequency_penalty: None,
            presence_penalty: None,
        }
    }
}

/// UI Preferences
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UIPreferences {
    pub theme: String, // "light", "dark", "system"
    pub language: String,
    pub font_size: u32,
    pub compact_mode: bool,
    pub show_token_counts: bool,
    pub show_cost_estimates: bool,
}

impl Default for UIPreferences {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            language: "en".to_string(),
            font_size: 14,
            compact_mode: false,
            show_token_counts: true,
            show_cost_estimates: true,
        }
    }
}

/// Window state preferences
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowStatePreferences {
    pub startup_position: String,        // "center", "last", "custom"
    pub dock_on_startup: Option<String>, // "left", "right", null
    pub remember_size: bool,
    pub remember_position: bool,
    pub start_minimized: bool,
}

impl Default for WindowStatePreferences {
    fn default() -> Self {
        Self {
            startup_position: "center".to_string(),
            dock_on_startup: None,
            remember_size: true,
            remember_position: true,
            start_minimized: false,
        }
    }
}

/// Security settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecuritySettings {
    pub require_confirmation_for_actions: bool,
    pub allow_file_system_access: bool,
    pub allow_network_access: bool,
    pub enable_telemetry: bool,
    pub auto_clear_sensitive_data: bool,
    pub session_timeout_minutes: u32,
}

impl Default for SecuritySettings {
    fn default() -> Self {
        Self {
            require_confirmation_for_actions: true,
            allow_file_system_access: true,
            allow_network_access: true,
            enable_telemetry: true,
            auto_clear_sensitive_data: false,
            session_timeout_minutes: 30,
        }
    }
}

/// Complete application settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub default_provider: String,
    pub default_model: String,
    pub model_configs: HashMap<String, ModelConfig>,
    pub provider_configs: HashMap<String, LLMProviderConfig>,
    pub ui_preferences: UIPreferences,
    pub window_preferences: WindowStatePreferences,
    pub security_settings: SecuritySettings,
    pub schema_version: u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        let mut model_configs = HashMap::new();
        model_configs.insert(
            "gpt-4o-mini".to_string(),
            ModelConfig {
                model_name: "gpt-4o-mini".to_string(),
                ..Default::default()
            },
        );
        model_configs.insert(
            "claude-3-5-sonnet-20241022".to_string(),
            ModelConfig {
                model_name: "claude-3-5-sonnet-20241022".to_string(),
                ..Default::default()
            },
        );

        let mut provider_configs = HashMap::new();
        provider_configs.insert(
            "openai".to_string(),
            LLMProviderConfig {
                provider: "openai".to_string(),
                ..Default::default()
            },
        );
        provider_configs.insert(
            "anthropic".to_string(),
            LLMProviderConfig {
                provider: "anthropic".to_string(),
                ..Default::default()
            },
        );

        Self {
            default_provider: "openai".to_string(),
            default_model: "gpt-4o-mini".to_string(),
            model_configs,
            provider_configs,
            ui_preferences: UIPreferences::default(),
            window_preferences: WindowStatePreferences::default(),
            security_settings: SecuritySettings::default(),
            schema_version: 1,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_setting_value_conversions() {
        let str_val = SettingValue::from("test");
        assert_eq!(str_val.as_string(), Some("test"));

        let int_val = SettingValue::from(42i64);
        assert_eq!(int_val.as_integer(), Some(42));

        let float_val = SettingValue::from(3.14);
        assert_eq!(float_val.as_float(), Some(3.14));

        let bool_val = SettingValue::from(true);
        assert_eq!(bool_val.as_boolean(), Some(true));
    }

    #[test]
    fn test_setting_value_serialization() {
        let val = SettingValue::String("test".to_string());
        let json = val.to_json_string().unwrap();
        let parsed = SettingValue::from_json_string(&json).unwrap();
        assert_eq!(val, parsed);
    }

    #[test]
    fn test_default_app_settings() {
        let settings = AppSettings::default();
        assert_eq!(settings.default_provider, "openai");
        assert_eq!(settings.ui_preferences.theme, "system");
        assert!(settings.security_settings.require_confirmation_for_actions);
    }

    #[test]
    fn test_category_conversion() {
        assert_eq!(SettingCategory::from_str("llm"), Some(SettingCategory::Llm));
        assert_eq!(SettingCategory::Llm.as_str(), "llm");
        assert_eq!(SettingCategory::from_str("invalid"), None);
    }
}
