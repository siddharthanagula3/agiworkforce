pub mod models;
pub mod repository;
pub mod service;
pub mod validation;

#[cfg(test)]
mod tests;

pub use models::{Setting, SettingCategory, SettingValue};

pub use repository::{
    delete_setting, delete_settings_by_prefix, get_setting, get_settings_by_category,
    get_settings_by_prefix, list_all_settings, setting_exists, upsert_setting,
    upsert_settings_batch,
};

pub use service::{SettingsService, SettingsServiceError};

pub use validation::{validate_api_key, validate_temperature, ValidationError};
