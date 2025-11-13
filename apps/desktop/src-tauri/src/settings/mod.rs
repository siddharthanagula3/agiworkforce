/// Settings storage and management module
///
/// Provides persistent storage for application settings with:
/// - Type-safe settings API
/// - Encryption for sensitive data (API keys, credentials)
/// - Validation and defaults
/// - Schema migrations
/// - Thread-safe access
pub mod models;
pub mod repository;
pub mod service;
pub mod validation;

#[cfg(test)]
mod tests;

// Re-export commonly used types
pub use models::{
    AppSettings, LLMProviderConfig, ModelConfig, SecuritySettings, Setting, SettingCategory,
    SettingValue, UIPreferences, WindowStatePreferences,
};

pub use repository::{
    upsert_setting, get_setting, get_settings_by_category, list_all_settings,
    get_settings_by_prefix, delete_setting, delete_settings_by_category,
    delete_settings_by_prefix, setting_exists, count_settings_by_category,
    upsert_settings_batch,
};

pub use service::{SettingsService, SettingsServiceError};

pub use validation::{
    validate_api_key, validate_model_name, validate_temperature, ValidationError,
};
