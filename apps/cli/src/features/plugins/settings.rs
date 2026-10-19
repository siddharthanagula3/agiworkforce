//! A plugin's own settings, declared under `userConfig` in its manifest the
//! way Claude Code plugins declare them. Plain values live in
//! `plugin-settings.json` under the config root; a setting marked
//! `sensitive` goes to the OS credential store instead.

use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const SETTINGS_FILE: &str = "plugin-settings.json";
const SECRET_SERVICE: &str = "agiworkforce-plugin-settings";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SettingKind {
    String,
    Number,
    Boolean,
    Directory,
    File,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginSetting {
    #[serde(rename = "type")]
    pub kind: SettingKind,
    pub title: String,
    pub description: String,
    #[serde(default)]
    pub required: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub options: Vec<String>,
    #[serde(default)]
    pub multiple: bool,
    #[serde(default)]
    pub sensitive: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
}

pub type PluginSettings = BTreeMap<String, PluginSetting>;

fn settings_path() -> Result<PathBuf> {
    Ok(crate::config::CliConfig::config_dir()?.join(SETTINGS_FILE))
}

fn read_store() -> BTreeMap<String, BTreeMap<String, Value>> {
    settings_path()
        .ok()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn write_store(store: &BTreeMap<String, BTreeMap<String, Value>>) -> Result<()> {
    let path = settings_path()?;
    let json = serde_json::to_vec_pretty(store)?;
    crate::secure_store::write_owner_only(&path, &json)
}

fn secret_account(plugin: &str, key: &str) -> String {
    format!("{plugin}/{key}")
}

/// Check a typed value against its setting and return what is stored.
pub fn parse_value(setting: &PluginSetting, raw: &str) -> Result<Value, String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err(format!("{} needs a value", setting.title));
    }
    if setting.multiple && setting.kind == SettingKind::String {
        let items: Vec<Value> = raw
            .split(',')
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(|item| Value::String(item.to_string()))
            .collect();
        return Ok(Value::Array(items));
    }
    match setting.kind {
        SettingKind::String => {
            if !setting.options.is_empty() && !setting.options.iter().any(|option| option == raw) {
                return Err(format!(
                    "{} must be one of: {}",
                    setting.title,
                    setting.options.join(", ")
                ));
            }
            Ok(Value::String(raw.to_string()))
        }
        SettingKind::Number => {
            let number: f64 = raw
                .parse()
                .map_err(|_| format!("{} must be a number", setting.title))?;
            if setting.min.is_some_and(|min| number < min)
                || setting.max.is_some_and(|max| number > max)
            {
                return Err(format!(
                    "{} must be between {} and {}",
                    setting.title,
                    setting
                        .min
                        .map_or_else(|| "any".to_string(), |n| n.to_string()),
                    setting
                        .max
                        .map_or_else(|| "any".to_string(), |n| n.to_string())
                ));
            }
            serde_json::Number::from_f64(number)
                .map(Value::Number)
                .ok_or_else(|| format!("{} must be a finite number", setting.title))
        }
        SettingKind::Boolean => match raw.to_ascii_lowercase().as_str() {
            "true" | "yes" | "on" | "1" => Ok(Value::Bool(true)),
            "false" | "no" | "off" | "0" => Ok(Value::Bool(false)),
            _ => Err(format!("{} must be true or false", setting.title)),
        },
        SettingKind::Directory | SettingKind::File => {
            let path = expand_home(raw);
            let found = if setting.kind == SettingKind::Directory {
                path.is_dir()
            } else {
                path.is_file()
            };
            if !found {
                return Err(format!(
                    "{} must name an existing {}: {} was not found",
                    setting.title,
                    if setting.kind == SettingKind::Directory {
                        "folder"
                    } else {
                        "file"
                    },
                    path.display()
                ));
            }
            let absolute = path.canonicalize().unwrap_or(path);
            Ok(Value::String(absolute.to_string_lossy().into_owned()))
        }
    }
}

fn expand_home(raw: &str) -> PathBuf {
    match raw.strip_prefix("~/") {
        Some(rest) => dirs::home_dir()
            .map(|home| home.join(rest))
            .unwrap_or_else(|| PathBuf::from(raw)),
        None => PathBuf::from(raw),
    }
}

pub fn save_value(plugin: &str, key: &str, setting: &PluginSetting, value: &Value) -> Result<()> {
    let mut store = read_store();
    if setting.sensitive {
        let text = value_text(value);
        crate::secure_store::set(SECRET_SERVICE, &secret_account(plugin, key), &text)?;
        if let Some(values) = store.get_mut(plugin) {
            values.remove(key);
        }
    } else {
        store
            .entry(plugin.to_string())
            .or_default()
            .insert(key.to_string(), value.clone());
    }
    store.retain(|_, values| !values.is_empty());
    write_store(&store).context("save the plugin's settings")
}

pub fn clear_value(plugin: &str, key: &str, setting: &PluginSetting) -> Result<()> {
    if setting.sensitive {
        crate::secure_store::set(SECRET_SERVICE, &secret_account(plugin, key), "")?;
    }
    let mut store = read_store();
    if let Some(values) = store.get_mut(plugin) {
        values.remove(key);
    }
    store.retain(|_, values| !values.is_empty());
    write_store(&store).context("save the plugin's settings")
}

/// Every setting's current value as text, from what the user saved, then the
/// manifest's default. A setting with neither is absent.
pub fn current_values(plugin: &str, settings: &PluginSettings) -> HashMap<String, String> {
    let saved = read_store().remove(plugin).unwrap_or_default();
    settings
        .iter()
        .filter_map(|(key, setting)| {
            let stored = if setting.sensitive {
                crate::secure_store::get(SECRET_SERVICE, &secret_account(plugin, key))
                    .ok()
                    .flatten()
                    .filter(|secret| !secret.is_empty())
                    .map(Value::String)
            } else {
                saved.get(key).cloned()
            };
            stored
                .or_else(|| setting.default.clone())
                .map(|value| (key.clone(), value_text(&value)))
        })
        .collect()
}

fn value_text(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Array(items) => items.iter().map(value_text).collect::<Vec<_>>().join(","),
        other => other.to_string(),
    }
}

/// The settings a plugin needs before it can run that have no value yet.
pub fn missing_required(
    settings: &PluginSettings,
    values: &HashMap<String, String>,
) -> Vec<String> {
    settings
        .iter()
        .filter(|(key, setting)| setting.required && !values.contains_key(*key))
        .map(|(key, _)| key.clone())
        .collect()
}

/// Replace `${CLAUDE_PLUGIN_ROOT}`, `${AGIWORKFORCE_PLUGIN_ROOT}` and
/// `${user_config.KEY}` in one manifest string. A reference to a setting
/// with no value fails with that setting's key.
pub fn substitute(
    text: &str,
    root: &Path,
    values: &HashMap<String, String>,
) -> Result<String, String> {
    let root = root.to_string_lossy();
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find("${") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        let Some(end) = after.find('}') else {
            out.push_str(&rest[start..]);
            return Ok(out);
        };
        let name = &after[..end];
        match name {
            "CLAUDE_PLUGIN_ROOT" | "AGIWORKFORCE_PLUGIN_ROOT" => out.push_str(&root),
            _ => match name.strip_prefix("user_config.") {
                Some(key) => out.push_str(values.get(key).ok_or_else(|| key.to_string())?),
                None => out.push_str(&rest[start..start + 2 + end + 1]),
            },
        }
        rest = &after[end + 1..];
    }
    out.push_str(rest);
    Ok(out)
}

/// One line per setting for `agi plugin info` and `agi plugin configure`,
/// with a sensitive value never shown.
pub fn describe(settings: &PluginSettings, values: &HashMap<String, String>) -> Vec<String> {
    settings
        .iter()
        .map(|(key, setting)| {
            let shown = match values.get(key) {
                Some(_) if setting.sensitive => "set (hidden)".to_string(),
                Some(value) => value.clone(),
                None if setting.required => "not set, required".to_string(),
                None => "not set".to_string(),
            };
            format!("{key} ({}): {shown}", setting.title)
        })
        .collect()
}

/// Ask for every setting in turn at the terminal. Enter keeps the current
/// value; a sensitive value is typed without echo.
pub fn prompt_all(plugin: &str, settings: &PluginSettings) -> Result<()> {
    let theme = dialoguer::theme::ColorfulTheme::default();
    for (key, setting) in settings {
        let values = current_values(plugin, settings);
        let current = values.get(key);
        println!("{}: {}", setting.title, setting.description);
        let raw = if setting.sensitive {
            dialoguer::Password::with_theme(&theme)
                .with_prompt(if current.is_some() {
                    format!("{key} (set; Enter keeps it)")
                } else {
                    key.clone()
                })
                .allow_empty_password(true)
                .interact()?
        } else if !setting.options.is_empty() && !setting.multiple {
            let start = current
                .and_then(|value| setting.options.iter().position(|option| option == value))
                .unwrap_or(0);
            let index = dialoguer::Select::with_theme(&theme)
                .with_prompt(key)
                .items(&setting.options)
                .default(start)
                .interact()?;
            setting.options[index].clone()
        } else {
            dialoguer::Input::<String>::with_theme(&theme)
                .with_prompt(key)
                .with_initial_text(current.cloned().unwrap_or_default())
                .allow_empty(true)
                .validate_with(|input: &String| -> Result<(), String> {
                    if input.trim().is_empty() {
                        return if setting.required && current.is_none() {
                            Err(format!("{} is required", setting.title))
                        } else {
                            Ok(())
                        };
                    }
                    parse_value(setting, input).map(|_| ())
                })
                .interact_text()?
        };
        if raw.trim().is_empty() {
            continue;
        }
        let value = parse_value(setting, &raw).map_err(anyhow::Error::msg)?;
        save_value(plugin, key, setting, &value)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setting(json: &str) -> PluginSetting {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn a_setting_with_a_key_claude_code_does_not_define_is_refused() {
        assert!(serde_json::from_str::<PluginSetting>(
            r#"{"type": "string", "title": "T", "description": "D", "secret": true}"#
        )
        .is_err());
    }

    #[test]
    fn each_kind_of_value_is_checked_before_it_is_saved() {
        let tone = setting(
            r#"{"type": "string", "title": "Tone", "description": "D", "options": ["warm", "formal"]}"#,
        );
        assert_eq!(parse_value(&tone, "warm").unwrap(), Value::from("warm"));
        assert!(parse_value(&tone, "loud").is_err());

        let port = setting(
            r#"{"type": "number", "title": "Port", "description": "D", "min": 1, "max": 65535}"#,
        );
        assert_eq!(parse_value(&port, "8080").unwrap(), Value::from(8080.0));
        assert!(parse_value(&port, "70000").is_err());
        assert!(parse_value(&port, "eighty").is_err());

        let flag = setting(r#"{"type": "boolean", "title": "Flag", "description": "D"}"#);
        assert_eq!(parse_value(&flag, "yes").unwrap(), Value::Bool(true));
        assert!(parse_value(&flag, "maybe").is_err());

        let folder = setting(r#"{"type": "directory", "title": "Folder", "description": "D"}"#);
        let dir = tempfile::tempdir().unwrap();
        assert!(parse_value(&folder, &dir.path().to_string_lossy()).is_ok());
        assert!(parse_value(&folder, &dir.path().join("absent").to_string_lossy()).is_err());

        let tags =
            setting(r#"{"type": "string", "title": "Tags", "description": "D", "multiple": true}"#);
        assert_eq!(
            parse_value(&tags, "a, b").unwrap(),
            serde_json::json!(["a", "b"])
        );
    }

    #[test]
    fn references_fill_from_the_root_and_settings_and_a_missing_one_is_named() {
        let values = HashMap::from([("token".to_string(), "abc".to_string())]);
        let root = Path::new("/plugins/demo");
        assert_eq!(
            substitute(
                "${CLAUDE_PLUGIN_ROOT}/bin --t=${user_config.token} $HOME ${OTHER}",
                root,
                &values
            )
            .unwrap(),
            "/plugins/demo/bin --t=abc $HOME ${OTHER}"
        );
        assert_eq!(
            substitute("${user_config.endpoint}", root, &values).unwrap_err(),
            "endpoint"
        );
    }

    #[test]
    fn a_sensitive_value_is_described_without_showing_it() {
        let settings: PluginSettings = serde_json::from_str(
            r#"{"token": {"type": "string", "title": "Token", "description": "D", "sensitive": true},
                "url": {"type": "string", "title": "URL", "description": "D", "required": true}}"#,
        )
        .unwrap();
        let values = HashMap::from([("token".to_string(), "abc".to_string())]);
        let lines = describe(&settings, &values);
        assert_eq!(
            lines,
            vec![
                "token (Token): set (hidden)".to_string(),
                "url (URL): not set, required".to_string()
            ]
        );
        assert_eq!(
            missing_required(&settings, &values),
            vec!["url".to_string()]
        );
    }
}
