//! Writable MCP server registry — the mutation backend for `/mcp add|remove|
//! enable|disable` and `agi mcp`.
//!
//! The read-only side of MCP (config discovery, connection, tool namespacing)
//! lives in [`super`]. This module owns the *global* user registry file
//! (`~/.agiworkforce/mcp.json`) and edits it in place. Servers live under the
//! standard `mcpServers` object so [`super::McpManager::load_configs`] picks
//! them up unchanged; **disabled** servers are parked under a sibling
//! `disabledServers` object that the loader deliberately ignores, so disabling a
//! server genuinely stops it from being loaded and connected (no fake toggle).
//!
//! All user-supplied server URLs and stdio commands are validated before they
//! are written, so a malformed or option-injecting entry never lands on disk.

use anyhow::{bail, Context, Result};
use serde_json::{Map, Value};
use std::path::PathBuf;

const ENABLED_KEY: &str = "mcpServers";
const DISABLED_KEY: &str = "disabledServers";

/// Kind of transport a user is registering.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransportKind {
    Stdio,
    Sse,
    Http,
}

impl TransportKind {
    fn as_str(self) -> &'static str {
        match self {
            TransportKind::Stdio => "stdio",
            TransportKind::Sse => "sse",
            TransportKind::Http => "http",
        }
    }
}

/// A single registry row for listing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RegistryEntry {
    pub name: String,
    pub enabled: bool,
    pub kind: String,
    pub target: String,
}

/// The parsed, editable registry file.
#[derive(Debug, Clone, Default)]
pub struct McpRegistry {
    path: PathBuf,
    enabled: Map<String, Value>,
    disabled: Map<String, Value>,
}

impl McpRegistry {
    /// Path to the global registry file (`~/.agiworkforce/mcp.json`).
    pub fn default_path() -> Result<PathBuf> {
        Ok(crate::config::CliConfig::config_dir()?.join("mcp.json"))
    }

    /// Load the global registry, creating an empty in-memory one when the file
    /// does not exist yet.
    pub fn load() -> Result<Self> {
        Self::load_from(Self::default_path()?)
    }

    /// Load a registry from an explicit path (also the test entry point).
    pub fn load_from(path: impl Into<PathBuf>) -> Result<Self> {
        let path = path.into();
        let (enabled, disabled) = if path.exists() {
            let contents = std::fs::read_to_string(&path)
                .with_context(|| format!("Failed to read MCP registry {}", path.display()))?;
            let root: Value = serde_json::from_str(&contents)
                .with_context(|| format!("Invalid JSON in MCP registry {}", path.display()))?;
            let enabled = object_section(&root, ENABLED_KEY);
            let disabled = object_section(&root, DISABLED_KEY);
            (enabled, disabled)
        } else {
            (Map::new(), Map::new())
        };
        Ok(Self {
            path,
            enabled,
            disabled,
        })
    }

    /// Persist the registry back to disk, preserving any pre-existing top-level
    /// keys is intentionally NOT done — the registry file is owned by this store.
    pub fn save(&self) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent).with_context(|| {
                format!("Failed to create config directory {}", parent.display())
            })?;
        }
        let mut root = Map::new();
        root.insert(ENABLED_KEY.to_string(), Value::Object(self.enabled.clone()));
        if !self.disabled.is_empty() {
            root.insert(
                DISABLED_KEY.to_string(),
                Value::Object(self.disabled.clone()),
            );
        }
        let serialized = serde_json::to_string_pretty(&Value::Object(root))
            .context("Failed to serialize MCP registry")?;
        std::fs::write(&self.path, serialized)
            .with_context(|| format!("Failed to write MCP registry {}", self.path.display()))?;
        Ok(())
    }

    /// True if a server with this name exists in either section.
    pub fn contains(&self, name: &str) -> bool {
        self.enabled.contains_key(name) || self.disabled.contains_key(name)
    }

    /// Add (or, with `overwrite`, replace) an enabled server. Fails on a
    /// duplicate name unless `overwrite` is set. The entry is validated by the
    /// caller via [`build_server_entry`].
    pub fn add(&mut self, name: &str, entry: Value, overwrite: bool) -> Result<()> {
        let name = validate_server_name(name)?;
        if !overwrite && self.contains(name) {
            bail!("MCP server '{name}' already exists — pass overwrite/--force to replace it");
        }
        self.disabled.remove(name);
        self.enabled.insert(name.to_string(), entry);
        Ok(())
    }

    /// Remove a server from both sections. Returns true if something was removed.
    pub fn remove(&mut self, name: &str) -> bool {
        let a = self.enabled.remove(name).is_some();
        let b = self.disabled.remove(name).is_some();
        a || b
    }

    /// Disable a server (move enabled → disabled). Returns Ok(true) if it moved,
    /// Ok(false) if it was already disabled, Err if unknown.
    pub fn disable(&mut self, name: &str) -> Result<bool> {
        if let Some(entry) = self.enabled.remove(name) {
            self.disabled.insert(name.to_string(), entry);
            Ok(true)
        } else if self.disabled.contains_key(name) {
            Ok(false)
        } else {
            bail!("no MCP server named '{name}' in the registry")
        }
    }

    /// Enable a server (move disabled → enabled). Returns Ok(true) if it moved,
    /// Ok(false) if it was already enabled, Err if unknown.
    pub fn enable(&mut self, name: &str) -> Result<bool> {
        if let Some(entry) = self.disabled.remove(name) {
            self.enabled.insert(name.to_string(), entry);
            Ok(true)
        } else if self.enabled.contains_key(name) {
            Ok(false)
        } else {
            bail!("no MCP server named '{name}' in the registry")
        }
    }

    /// List every registered server, enabled first, each sorted by name.
    pub fn list(&self) -> Vec<RegistryEntry> {
        let mut rows: Vec<RegistryEntry> = Vec::new();
        for (name, value) in &self.enabled {
            let (kind, target) = describe_entry(value);
            rows.push(RegistryEntry {
                name: name.clone(),
                enabled: true,
                kind,
                target,
            });
        }
        for (name, value) in &self.disabled {
            let (kind, target) = describe_entry(value);
            rows.push(RegistryEntry {
                name: name.clone(),
                enabled: false,
                kind,
                target,
            });
        }
        rows.sort_by(|a, b| b.enabled.cmp(&a.enabled).then_with(|| a.name.cmp(&b.name)));
        rows
    }
}

fn object_section(root: &Value, key: &str) -> Map<String, Value> {
    root.get(key)
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default()
}

fn describe_entry(value: &Value) -> (String, String) {
    let obj = match value.as_object() {
        Some(obj) => obj,
        None => return ("unknown".to_string(), String::new()),
    };
    // Tagged transport shape.
    if let Some(kind) = obj.get("transport").and_then(Value::as_str) {
        let target = match kind {
            "stdio" => obj
                .get("command")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            _ => obj
                .get("url")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
        };
        return (kind.to_string(), target);
    }
    // Legacy stdio shape ({command, args}).
    if let Some(command) = obj.get("command").and_then(Value::as_str) {
        return ("stdio".to_string(), command.to_string());
    }
    ("unknown".to_string(), String::new())
}

/// Validate a server name: non-empty, bounded, and free of whitespace/control
/// characters or path separators that could escape the registry namespace.
pub fn validate_server_name(name: &str) -> Result<&str> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        bail!("MCP server name must not be empty");
    }
    if trimmed.chars().count() > 100 {
        bail!("MCP server name is too long (max 100 characters)");
    }
    if trimmed != name {
        bail!("MCP server name must not have leading or trailing whitespace");
    }
    for ch in name.chars() {
        let ok = ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | ':');
        if !ok {
            bail!(
                "MCP server name '{name}' has an invalid character '{ch}' \
                 (allowed: letters, digits, '-', '_', '.', ':')"
            );
        }
    }
    Ok(name)
}

/// Validate a remote (http/sse) server URL. Must be a syntactically valid
/// http/https URL with a host.
pub fn validate_remote_url(url: &str) -> Result<()> {
    let parsed = reqwest::Url::parse(url).with_context(|| format!("'{url}' is not a valid URL"))?;
    match parsed.scheme() {
        "http" | "https" => {}
        other => bail!("MCP server URL scheme must be http or https, got '{other}'"),
    }
    match parsed.host_str() {
        Some(host) if !host.is_empty() => {}
        _ => bail!("MCP server URL '{url}' has no host"),
    }
    Ok(())
}

/// Validate a stdio launch command. Rejects empty commands and dash-prefixed
/// values (which git/exec layers would mis-parse as options), plus control
/// characters that could smuggle newlines into a config file.
pub fn validate_stdio_command(command: &str) -> Result<()> {
    if command.trim().is_empty() {
        bail!("MCP stdio command must not be empty");
    }
    if command.starts_with('-') {
        bail!("MCP stdio command must not start with '-': {command:?}");
    }
    if command.chars().any(|c| c.is_control()) {
        bail!("MCP stdio command must not contain control characters");
    }
    Ok(())
}

/// Build and validate a server entry `Value` from parsed user input.
///
/// `target` is the URL for http/sse, or the executable for stdio; `args` are
/// the trailing stdio arguments (ignored for remote transports).
pub fn build_server_entry(kind: TransportKind, target: &str, args: &[String]) -> Result<Value> {
    match kind {
        TransportKind::Http | TransportKind::Sse => {
            validate_remote_url(target)?;
            Ok(serde_json::json!({
                "transport": kind.as_str(),
                "url": target,
            }))
        }
        TransportKind::Stdio => {
            validate_stdio_command(target)?;
            for arg in args {
                if arg.chars().any(|c| c.is_control()) {
                    bail!("MCP stdio argument must not contain control characters: {arg:?}");
                }
            }
            Ok(serde_json::json!({
                "transport": "stdio",
                "command": target,
                "args": args,
            }))
        }
    }
}

/// Parse a `/mcp add` / `agi mcp add` argument tail into a validated entry.
///
/// Accepted forms:
///   `<name> <https-or-http-url>`            → http transport
///   `<name> http <url>` / `<name> sse <url>` → explicit remote transport
///   `<name> stdio <command> [args...]`       → stdio transport
///
/// Returns `(name, entry_value)`.
pub fn parse_add_spec(tokens: &[&str]) -> Result<(String, Value)> {
    let name = match tokens.first() {
        Some(name) => validate_server_name(name)?.to_string(),
        None => bail!("Usage: add <name> <url> | add <name> stdio <command> [args...]"),
    };
    let rest = &tokens[1..];
    let (kind, target, args): (TransportKind, &str, Vec<String>) = match rest.first().copied() {
        Some("http") => (
            TransportKind::Http,
            rest.get(1).copied().unwrap_or_default(),
            Vec::new(),
        ),
        Some("sse") => (
            TransportKind::Sse,
            rest.get(1).copied().unwrap_or_default(),
            Vec::new(),
        ),
        Some("stdio") => {
            let command = rest.get(1).copied().unwrap_or_default();
            let args = rest.iter().skip(2).map(|s| s.to_string()).collect();
            (TransportKind::Stdio, command, args)
        }
        Some(url) if url.starts_with("http://") || url.starts_with("https://") => {
            (TransportKind::Http, url, Vec::new())
        }
        Some(other) => bail!(
            "unrecognized transport '{other}'. Use an http(s) URL, or `stdio <command>`, \
             `http <url>`, `sse <url>`"
        ),
        None => bail!("Usage: add <name> <url> | add <name> stdio <command> [args...]"),
    };
    if target.is_empty() {
        bail!("missing target (URL or command) for MCP server '{name}'");
    }
    let entry = build_server_entry(kind, target, &args)?;
    Ok((name, entry))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_list_disable_remove_round_trip() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("mcp.json");
        let mut reg = McpRegistry::load_from(&path).unwrap();

        // add
        let entry =
            build_server_entry(TransportKind::Http, "https://mcp.example.com/", &[]).unwrap();
        reg.add("example", entry, false).unwrap();
        reg.save().unwrap();

        // list — reload from disk to prove persistence.
        let reloaded = McpRegistry::load_from(&path).unwrap();
        let rows = reloaded.list();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].name, "example");
        assert!(rows[0].enabled);
        assert_eq!(rows[0].kind, "http");
        assert_eq!(rows[0].target, "https://mcp.example.com/");

        // The enabled server lands under mcpServers so the real loader sees it.
        let mut reg = reloaded;
        assert!(reg.disable("example").unwrap());
        reg.save().unwrap();
        let on_disk: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert!(
            on_disk["mcpServers"].as_object().unwrap().is_empty(),
            "disabled server must leave mcpServers so the loader skips it"
        );
        assert!(on_disk["disabledServers"]["example"].is_object());

        // A disabled server is not loadable by the real MCP config loader.
        let loaded = super::super::McpManager::load_configs_with_options(
            &super::super::McpConfigLoadOptions {
                explicit_paths: vec![path.clone()],
                strict: true,
            },
        );
        // Strict explicit load of a file whose mcpServers is empty must define
        // no servers → error, proving the disabled entry is genuinely inert.
        assert!(loaded.is_err());

        // enable → back to mcpServers
        let mut reg = McpRegistry::load_from(&path).unwrap();
        assert!(reg.enable("example").unwrap());
        reg.save().unwrap();

        // remove
        let mut reg = McpRegistry::load_from(&path).unwrap();
        assert!(reg.remove("example"));
        reg.save().unwrap();
        let final_reg = McpRegistry::load_from(&path).unwrap();
        assert!(final_reg.list().is_empty());
    }

    #[test]
    fn duplicate_add_is_rejected_without_overwrite() {
        let tmp = tempfile::tempdir().unwrap();
        let mut reg = McpRegistry::load_from(tmp.path().join("mcp.json")).unwrap();
        let entry = build_server_entry(TransportKind::Http, "https://a.example/", &[]).unwrap();
        reg.add("dup", entry.clone(), false).unwrap();
        assert!(reg.add("dup", entry.clone(), false).is_err());
        assert!(reg.add("dup", entry, true).is_ok());
    }

    #[test]
    fn invalid_urls_and_names_and_commands_are_rejected() {
        assert!(validate_remote_url("ftp://example.com").is_err());
        assert!(validate_remote_url("not a url").is_err());
        assert!(validate_remote_url("http://").is_err());
        assert!(validate_remote_url("https://mcp.example.com/").is_ok());

        assert!(validate_server_name("").is_err());
        assert!(validate_server_name("bad name").is_err());
        assert!(validate_server_name("bad/name").is_err());
        assert!(validate_server_name("claude:stripe").is_ok());

        assert!(validate_stdio_command("").is_err());
        assert!(validate_stdio_command("--rm").is_err());
        assert!(validate_stdio_command("npx").is_ok());
    }

    #[test]
    fn parse_add_spec_infers_and_validates_transports() {
        let (name, entry) = parse_add_spec(&["srv", "https://mcp.example.com/"]).unwrap();
        assert_eq!(name, "srv");
        assert_eq!(entry["transport"], "http");

        let (_, entry) = parse_add_spec(&["srv", "stdio", "npx", "-y", "server"]).unwrap();
        assert_eq!(entry["transport"], "stdio");
        assert_eq!(entry["command"], "npx");
        assert_eq!(entry["args"][0], "-y");

        // Bad URL is rejected at parse time.
        assert!(parse_add_spec(&["srv", "ftp://nope"]).is_err());
        // Dash-prefixed stdio command is rejected (option injection guard).
        assert!(parse_add_spec(&["srv", "stdio", "--evil"]).is_err());
    }
}
