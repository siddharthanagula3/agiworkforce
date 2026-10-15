use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

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

    pub fn to_json_string(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Setting {
    pub key: String,
    pub value: String,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_setting_value_conversions() {
        let str_val = SettingValue::from("test");
        assert_eq!(str_val.as_string(), Some("test"));

        let int_val = SettingValue::from(42i64);
        assert_eq!(int_val.as_integer(), Some(42));

        let float_val = SettingValue::from(3.15);
        assert_eq!(float_val.as_float(), Some(3.15));

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
    fn test_category_conversion() {
        assert_eq!(SettingCategory::from_str("llm"), Some(SettingCategory::Llm));
        assert_eq!(SettingCategory::Llm.as_str(), "llm");
        assert_eq!(SettingCategory::from_str("invalid"), None);
    }
}
