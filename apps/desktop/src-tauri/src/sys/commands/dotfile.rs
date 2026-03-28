//! Bridge to the shared `~/.agiworkforce/config.toml` configuration.
//!
//! The CLI and desktop app share a TOML config file. This module exposes
//! Tauri commands for the frontend to read and write that shared config,
//! enabling unified settings across all AGI Workforce surfaces.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// Mirrors the CLI's `CliConfig` struct for deserialization from TOML.
/// We intentionally duplicate the shape here rather than sharing the crate,
/// because the desktop may only need a subset and the CLI crate has heavy
/// dependencies we don't want to pull in.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SharedDefaultConfig {
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub stream: Option<bool>,
    #[serde(default)]
    pub max_tokens: Option<u32>,
    #[serde(default)]
    pub temperature: Option<f32>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fallback_chain: Vec<String>,
    #[serde(default)]
    pub fast_model: Option<String>,
    #[serde(default)]
    pub approval_mode: Option<String>,
    #[serde(default)]
    pub sandbox_mode: Option<String>,
    #[serde(default)]
    pub review_model: Option<String>,
    #[serde(default)]
    pub cloud_model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SharedProviderConfig {
    pub api_key_env: Option<String>,
    pub base_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SharedConfig {
    #[serde(default)]
    pub default: SharedDefaultConfig,
    #[serde(default)]
    pub providers: HashMap<String, SharedProviderConfig>,
}

/// Returns the path to `~/.agiworkforce/config.toml`.
fn shared_config_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not determine home directory".to_string())?;
    Ok(home.join(".agiworkforce").join("config.toml"))
}

/// Read the shared `~/.agiworkforce/config.toml` and return it as JSON.
///
/// Returns `{}` if the file does not exist. Returns an error only on
/// genuine I/O or parse failures — a missing file is not an error.
#[tauri::command]
pub async fn read_shared_config() -> Result<serde_json::Value, String> {
    let config_path = shared_config_path()?;

    if !config_path.exists() {
        return Ok(serde_json::json!({}));
    }

    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;
    let config: toml::Value =
        toml::from_str(&content).map_err(|e| format!("Failed to parse config: {}", e))?;

    serde_json::to_value(&config).map_err(|e| format!("Failed to convert to JSON: {}", e))
}

/// Write a single top-level key in `~/.agiworkforce/config.toml`.
///
/// Reads the existing file (or starts from an empty table), sets/replaces
/// the given `key` with `value`, and writes back. The value is a JSON
/// value that gets converted to TOML before writing.
#[tauri::command]
pub async fn write_shared_config(key: String, value: serde_json::Value) -> Result<(), String> {
    let config_path = shared_config_path()?;

    // Ensure the directory exists.
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    // Read existing config or start fresh.
    let mut table: toml::Table = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read existing config: {}", e))?;
        toml::from_str(&content).map_err(|e| format!("Failed to parse existing config: {}", e))?
    } else {
        toml::Table::new()
    };

    // Convert JSON value to TOML value.
    let toml_value = json_to_toml(&value)?;
    table.insert(key, toml_value);

    let output =
        toml::to_string_pretty(&table).map_err(|e| format!("Failed to serialize config: {}", e))?;
    std::fs::write(&config_path, output).map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(())
}

/// Read the shared config as a strongly-typed struct.
///
/// This is used internally by the desktop app at startup to pick up
/// default model/provider preferences from the CLI config.
pub fn load_shared_config() -> SharedConfig {
    let config_path = match shared_config_path() {
        Ok(p) => p,
        Err(_) => return SharedConfig::default(),
    };

    if !config_path.exists() {
        return SharedConfig::default();
    }

    let content = match std::fs::read_to_string(&config_path) {
        Ok(c) => c,
        Err(_) => return SharedConfig::default(),
    };

    toml::from_str(&content).unwrap_or_default()
}

// ---------------------------------------------------------------------------
// Dotfile path helpers
// ---------------------------------------------------------------------------

/// Returns the path to `~/.agiworkforce/`.
fn dotfile_root() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not determine home directory".to_string())?;
    Ok(home.join(".agiworkforce"))
}

/// Returns the path to `~/.agiworkforce/mcp.json`.
fn mcp_json_path() -> Result<PathBuf, String> {
    Ok(dotfile_root()?.join("mcp.json"))
}

// ---------------------------------------------------------------------------
// MCP server management
// ---------------------------------------------------------------------------

/// List all MCP servers from `~/.agiworkforce/mcp.json`.
///
/// Returns the `mcpServers` object (or `{}` if the file does not exist).
#[tauri::command]
pub async fn dotfile_list_mcp_servers() -> Result<serde_json::Value, String> {
    let path = mcp_json_path()?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read mcp.json: {}", e))?;
    let parsed: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse mcp.json: {}", e))?;
    Ok(parsed
        .get("mcpServers")
        .cloned()
        .unwrap_or(serde_json::json!({})))
}

/// Add a server entry to `~/.agiworkforce/mcp.json`.
///
/// Creates the file with a `{ "mcpServers": {} }` skeleton when missing.
#[tauri::command]
pub async fn dotfile_add_mcp_server(name: String, config: serde_json::Value) -> Result<(), String> {
    let path = mcp_json_path()?;

    // Ensure the directory exists.
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create dotfile directory: {}", e))?;
    }

    let mut root = if path.exists() {
        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read mcp.json: {}", e))?;
        serde_json::from_str::<serde_json::Value>(&content)
            .map_err(|e| format!("Failed to parse mcp.json: {}", e))?
    } else {
        serde_json::json!({ "mcpServers": {} })
    };

    let servers = root
        .as_object_mut()
        .ok_or_else(|| "mcp.json root is not an object".to_string())?
        .entry("mcpServers")
        .or_insert_with(|| serde_json::json!({}));

    let servers_map = servers
        .as_object_mut()
        .ok_or_else(|| "mcpServers is not an object".to_string())?;

    servers_map.insert(name, config);

    let output = serde_json::to_string_pretty(&root)
        .map_err(|e| format!("Failed to serialize mcp.json: {}", e))?;
    std::fs::write(&path, output).map_err(|e| format!("Failed to write mcp.json: {}", e))?;
    Ok(())
}

/// Remove a server from `~/.agiworkforce/mcp.json`.
#[tauri::command]
pub async fn dotfile_remove_mcp_server(name: String) -> Result<(), String> {
    let path = mcp_json_path()?;
    if !path.exists() {
        return Ok(());
    }

    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read mcp.json: {}", e))?;
    let mut root: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse mcp.json: {}", e))?;

    if let Some(servers) = root.get_mut("mcpServers").and_then(|v| v.as_object_mut()) {
        servers.remove(&name);
    }

    let output = serde_json::to_string_pretty(&root)
        .map_err(|e| format!("Failed to serialize mcp.json: {}", e))?;
    std::fs::write(&path, output).map_err(|e| format!("Failed to write mcp.json: {}", e))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Skills discovery
// ---------------------------------------------------------------------------

/// Scan `~/.agiworkforce/skills/` for `SKILL.md` files.
///
/// Returns a vec of `{ name, description, path, source }` objects.
#[tauri::command]
pub async fn dotfile_list_skills() -> Result<Vec<serde_json::Value>, String> {
    let skills_dir = dotfile_root()?.join("skills");
    if !skills_dir.is_dir() {
        return Ok(Vec::new());
    }

    let pattern = skills_dir.join("*").join("SKILL.md");
    let entries = glob::glob(&pattern.to_string_lossy())
        .map_err(|e| format!("Glob error: {}", e))?
        .filter_map(|r| r.ok())
        .collect::<Vec<_>>();

    let mut skills = Vec::new();
    for path in entries {
        let folder = path
            .parent()
            .and_then(|p| p.file_name())
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        // Extract the first line as description (skip leading `# ` header).
        let content = std::fs::read_to_string(&path).unwrap_or_default();
        let description = content
            .lines()
            .find(|l| !l.trim().is_empty())
            .map(|l| l.trim_start_matches('#').trim().to_string())
            .unwrap_or_default();

        skills.push(serde_json::json!({
            "name": folder,
            "description": description,
            "path": path.to_string_lossy(),
            "source": "system",
        }));
    }

    Ok(skills)
}

// ---------------------------------------------------------------------------
// Instructions file
// ---------------------------------------------------------------------------

/// Read `~/.agiworkforce/INSTRUCTIONS.md`.
///
/// Returns an empty string if the file does not exist.
#[tauri::command]
pub async fn dotfile_read_instructions() -> Result<String, String> {
    let path = dotfile_root()?.join("INSTRUCTIONS.md");
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read INSTRUCTIONS.md: {}", e))
}

/// Write `~/.agiworkforce/INSTRUCTIONS.md`.
#[tauri::command]
pub async fn dotfile_write_instructions(content: String) -> Result<(), String> {
    let root = dotfile_root()?;
    std::fs::create_dir_all(&root)
        .map_err(|e| format!("Failed to create dotfile directory: {}", e))?;
    let path = root.join("INSTRUCTIONS.md");
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write INSTRUCTIONS.md: {}", e))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Memory viewer
// ---------------------------------------------------------------------------

/// Read `~/.agiworkforce/memories/raw_memories.md`.
///
/// Returns an empty string if the file does not exist.
#[tauri::command]
pub async fn dotfile_read_memories() -> Result<String, String> {
    let path = dotfile_root()?.join("memories").join("raw_memories.md");
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read raw_memories.md: {}", e))
}

// ---------------------------------------------------------------------------
// JSON → TOML helpers
// ---------------------------------------------------------------------------

/// Convert a `serde_json::Value` into a `toml::Value`.
///
/// TOML doesn't support null, so nulls are dropped. Arrays of mixed
/// types are serialized via the JSON string roundtrip as a fallback.
fn json_to_toml(json: &serde_json::Value) -> Result<toml::Value, String> {
    match json {
        serde_json::Value::Null => {
            // TOML has no null — use empty string as a placeholder.
            Ok(toml::Value::String(String::new()))
        }
        serde_json::Value::Bool(b) => Ok(toml::Value::Boolean(*b)),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Ok(toml::Value::Integer(i))
            } else if let Some(f) = n.as_f64() {
                Ok(toml::Value::Float(f))
            } else {
                Err(format!("Unsupported number: {}", n))
            }
        }
        serde_json::Value::String(s) => Ok(toml::Value::String(s.clone())),
        serde_json::Value::Array(arr) => {
            let items: Result<Vec<toml::Value>, String> = arr.iter().map(json_to_toml).collect();
            Ok(toml::Value::Array(items?))
        }
        serde_json::Value::Object(map) => {
            let mut table = toml::Table::new();
            for (k, v) in map {
                table.insert(k.clone(), json_to_toml(v)?);
            }
            Ok(toml::Value::Table(table))
        }
    }
}
