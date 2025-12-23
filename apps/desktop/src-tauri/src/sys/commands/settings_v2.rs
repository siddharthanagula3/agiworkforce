use crate::data::settings::{
    models::{AppSettings, SettingCategory, SettingValue},
    SettingsService,
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::State;

pub struct SettingsServiceState {
    pub service: Arc<Mutex<SettingsService>>,
}

impl SettingsServiceState {
    pub fn new(service: SettingsService) -> Self {
        Self {
            service: Arc::new(Mutex::new(service)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsResponse {
    pub success: bool,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetSettingRequest {
    pub key: String,
    pub value: serde_json::Value,
    pub category: String,
    pub encrypted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetSettingsRequest {
    pub keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetSettingsResponse {
    pub settings: std::collections::HashMap<String, serde_json::Value>,
}

#[tauri::command]
pub async fn settings_v2_get(
    key: String,
    state: State<'_, SettingsServiceState>,
) -> Result<serde_json::Value, String> {
    let service = state
        .service
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    let value = service
        .get(&key)
        .map_err(|e| format!("Failed to get setting '{}': {}", key, e))?;

    match value {
        SettingValue::String(s) => Ok(serde_json::Value::String(s)),
        SettingValue::Integer(i) => Ok(serde_json::Value::Number(i.into())),
        SettingValue::Float(f) => Ok(serde_json::json!(f)),
        SettingValue::Boolean(b) => Ok(serde_json::Value::Bool(b)),
        SettingValue::Json(j) => Ok(j),
    }
}

#[tauri::command]
pub async fn settings_v2_set(
    request: SetSettingRequest,
    state: State<'_, SettingsServiceState>,
) -> Result<SettingsResponse, String> {
    let service = state
        .service
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    let category = SettingCategory::from_str(&request.category)
        .ok_or_else(|| format!("Invalid category: {}", request.category))?;

    let value = json_to_setting_value(&request.value);

    service
        .set(request.key.clone(), value, category, request.encrypted)
        .map_err(|e| format!("Failed to set setting '{}': {}", request.key, e))?;

    Ok(SettingsResponse {
        success: true,
        message: None,
    })
}

#[tauri::command]
pub async fn settings_v2_get_batch(
    request: GetSettingsRequest,
    state: State<'_, SettingsServiceState>,
) -> Result<GetSettingsResponse, String> {
    let service = state
        .service
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    let mut settings = std::collections::HashMap::new();

    for key in request.keys {
        if let Ok(value) = service.get(&key) {
            let json_value = setting_value_to_json(&value);
            settings.insert(key, json_value);
        }
    }

    Ok(GetSettingsResponse { settings })
}

#[tauri::command]
pub async fn settings_v2_delete(
    key: String,
    state: State<'_, SettingsServiceState>,
) -> Result<SettingsResponse, String> {
    let service = state
        .service
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    service
        .delete(&key)
        .map_err(|e| format!("Failed to delete setting '{}': {}", key, e))?;

    Ok(SettingsResponse {
        success: true,
        message: Some(format!("Setting '{}' deleted", key)),
    })
}

#[tauri::command]
pub async fn settings_v2_get_category(
    category: String,
    state: State<'_, SettingsServiceState>,
) -> Result<GetSettingsResponse, String> {
    let service = state
        .service
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    let category_enum = SettingCategory::from_str(&category)
        .ok_or_else(|| format!("Invalid category: {}", category))?;

    let settings_list = service
        .get_by_category(category_enum)
        .map_err(|e| format!("Failed to get settings for category '{}': {}", category, e))?;

    let mut settings = std::collections::HashMap::new();

    for setting in settings_list {
        if let Ok(value) = setting.get_value() {
            let json_value = setting_value_to_json(&value);
            settings.insert(setting.key, json_value);
        }
    }

    Ok(GetSettingsResponse { settings })
}

#[tauri::command]
pub async fn settings_v2_save_api_key(
    provider: String,
    key: String,
    state: State<'_, SettingsServiceState>,
) -> Result<SettingsResponse, String> {
    let service = state
        .service
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    service
        .save_api_key(&provider, &key)
        .map_err(|e| format!("Failed to save API key: {}", e))?;

    Ok(SettingsResponse {
        success: true,
        message: Some("API key saved successfully".to_string()),
    })
}

#[tauri::command]
pub async fn settings_v2_get_api_key(
    provider: String,
    state: State<'_, SettingsServiceState>,
) -> Result<String, String> {
    let service = state
        .service
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    service
        .get_api_key(&provider)
        .map_err(|e| format!("Failed to get API key: {}", e))
}

#[tauri::command]
pub async fn settings_v2_load_app_settings(
    state: State<'_, SettingsServiceState>,
) -> Result<AppSettings, String> {
    let service = state
        .service
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    service
        .load_app_settings()
        .map_err(|e| format!("Failed to load app settings: {}", e))
}

#[tauri::command]
pub async fn settings_v2_save_app_settings(
    settings: AppSettings,
    state: State<'_, SettingsServiceState>,
) -> Result<SettingsResponse, String> {
    let service = state
        .service
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    service
        .save_app_settings(&settings)
        .map_err(|e| format!("Failed to save app settings: {}", e))?;

    Ok(SettingsResponse {
        success: true,
        message: Some("Application settings saved successfully".to_string()),
    })
}

#[tauri::command]
pub async fn settings_v2_clear_cache(
    state: State<'_, SettingsServiceState>,
) -> Result<SettingsResponse, String> {
    let service = state
        .service
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    service.clear_cache();

    Ok(SettingsResponse {
        success: true,
        message: Some("Cache cleared".to_string()),
    })
}

#[tauri::command]
pub async fn settings_v2_list_all(
    state: State<'_, SettingsServiceState>,
) -> Result<GetSettingsResponse, String> {
    let service = state
        .service
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    let all_settings = service
        .list_all()
        .map_err(|e| format!("Failed to list settings: {}", e))?;

    let mut settings = std::collections::HashMap::new();

    for setting in all_settings {
        if !setting.encrypted {
            if let Ok(value) = setting.get_value() {
                let json_value = setting_value_to_json(&value);
                settings.insert(setting.key, json_value);
            }
        }
    }

    Ok(GetSettingsResponse { settings })
}

fn json_to_setting_value(json: &serde_json::Value) -> SettingValue {
    match json {
        serde_json::Value::String(s) => SettingValue::String(s.clone()),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                SettingValue::Integer(i)
            } else if let Some(f) = n.as_f64() {
                SettingValue::Float(f)
            } else {
                SettingValue::Json(json.clone())
            }
        }
        serde_json::Value::Bool(b) => SettingValue::Boolean(*b),
        _ => SettingValue::Json(json.clone()),
    }
}

fn setting_value_to_json(value: &SettingValue) -> serde_json::Value {
    match value {
        SettingValue::String(s) => serde_json::Value::String(s.clone()),
        SettingValue::Integer(i) => serde_json::Value::Number((*i).into()),
        SettingValue::Float(f) => serde_json::json!(f),
        SettingValue::Boolean(b) => serde_json::Value::Bool(*b),
        SettingValue::Json(j) => j.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_json_conversions() {
        let json_str = serde_json::Value::String("test".to_string());
        let setting_val = json_to_setting_value(&json_str);
        assert_eq!(setting_val.as_string(), Some("test"));

        let back_to_json = setting_value_to_json(&setting_val);
        assert_eq!(back_to_json, json_str);
    }

    #[test]
    fn test_number_conversions() {
        let json_int = serde_json::Value::Number(42.into());
        let setting_val = json_to_setting_value(&json_int);
        assert_eq!(setting_val.as_integer(), Some(42));

        let json_float = serde_json::json!(3.15);
        let setting_val = json_to_setting_value(&json_float);
        assert_eq!(setting_val.as_float(), Some(3.15));
    }
}
