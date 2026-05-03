#![allow(dead_code, unused_imports)]
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

// ---------------------------------------------------------------------------
// Manifest discovery — Sprint B6
// ---------------------------------------------------------------------------
//
// AGI Workforce CLI accepts plugin manifests in five locations, in priority
// order. The first one found wins; legacy paths emit a one-time deprecation
// notice on stderr per session per plugin.
//
//   1. .agiworkforce-plugin/plugin.json  (own format — preferred)
//   2. .claude-plugin/plugin.json        (Claude Code interop)
//   3. .codex-plugin/plugin.json         (Codex CLI interop)
//   4. .app.json                         (legacy — pre-B6)
//   5. .mcp.json                         (legacy — pre-B6)
//
// All five share one schema: PluginManifest. Unknown fields land in
// `extra` via serde-flatten so claude/codex-format manifests with
// surplus keys (e.g. `transport`, `url`, `marketplace`) load without
// error.

/// Format origin of a plugin manifest. Used for `plugin list` display
/// + deprecation notices when legacy formats are loaded.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ManifestFormat {
    /// `.agiworkforce-plugin/plugin.json` — own format, preferred.
    Agiworkforce,
    /// `.claude-plugin/plugin.json` — Claude Code interop.
    ClaudeCode,
    /// `.codex-plugin/plugin.json` — Codex CLI interop.
    Codex,
    /// `.app.json` — legacy AGI format pre-B6.
    LegacyApp,
    /// `.mcp.json` — legacy AGI format pre-B6.
    LegacyMcp,
}

impl ManifestFormat {
    /// Short tag for `plugin list` display: `[agi]`, `[claude]`, `[codex]`,
    /// `[legacy]`.
    pub fn short_tag(&self) -> &'static str {
        match self {
            Self::Agiworkforce => "agi",
            Self::ClaudeCode => "claude",
            Self::Codex => "codex",
            Self::LegacyApp | Self::LegacyMcp => "legacy",
        }
    }

    /// Manifest file path relative to plugin root (e.g.
    /// `.claude-plugin/plugin.json`).
    pub fn manifest_path(&self) -> &'static str {
        match self {
            Self::Agiworkforce => ".agiworkforce-plugin/plugin.json",
            Self::ClaudeCode => ".claude-plugin/plugin.json",
            Self::Codex => ".codex-plugin/plugin.json",
            Self::LegacyApp => ".app.json",
            Self::LegacyMcp => ".mcp.json",
        }
    }
}

/// Priority-ordered list of manifest paths to probe inside a plugin
/// directory. The first path that exists + parses wins.
const MANIFEST_PATHS: &[(ManifestFormat, &str)] = &[
    (ManifestFormat::Agiworkforce, ".agiworkforce-plugin/plugin.json"),
    (ManifestFormat::ClaudeCode, ".claude-plugin/plugin.json"),
    (ManifestFormat::Codex, ".codex-plugin/plugin.json"),
    (ManifestFormat::LegacyApp, ".app.json"),
    (ManifestFormat::LegacyMcp, ".mcp.json"),
];

#[derive(Debug, Clone)]
pub struct LoadedPlugin {
    pub config_name: String,
    pub manifest_name: Option<String>,
    pub root: PathBuf,
    pub enabled: bool,
    pub skill_roots: Vec<PathBuf>,
    pub mcp_servers: HashMap<String, McpServerConfig>,
    pub apps: Vec<String>,
    pub error: Option<String>,
    /// Format of the manifest this plugin was loaded from. `None` if no
    /// manifest was found (the plugin still loads as a bare directory).
    pub format: Option<ManifestFormat>,
    /// Plugin-declared command markdown paths (relative to plugin root).
    pub manifest_commands: Vec<PathBuf>,
    /// Plugin-declared agent markdown paths (relative to plugin root).
    pub manifest_agents: Vec<PathBuf>,
    /// Plugin-declared skill paths (file or dir, relative to plugin root).
    pub manifest_skills: Vec<PathBuf>,
    /// Plugin-declared inline hooks config — same shape as the `hooks`
    /// field of `~/.agiworkforce/hooks.json`. `None` if absent.
    pub manifest_hooks: Option<serde_json::Value>,
    /// Cross-plugin dependencies (e.g. `"otherplugin"` or
    /// `"otherplugin@marketplace"`). Recorded for later resolution.
    pub manifest_dependencies: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    /// Catch-all for transport-related fields used by Claude Code / Codex
    /// MCP entries (`transport`, `url`, `headers`, …) that AGI's
    /// stdio-only McpManager doesn't yet consume. Preserved so we don't
    /// lose data; surfaced verbatim once HTTP/SSE transports land
    /// (Sprint B1/B2).
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    /// Plugin name. Falls back to directory name if absent.
    #[serde(default)]
    pub name: Option<String>,
    /// Semver version string.
    #[serde(default)]
    pub version: Option<String>,
    /// One-line description.
    #[serde(default)]
    pub description: Option<String>,
    /// Paths (relative to plugin root) to slash-command markdown files.
    #[serde(default)]
    pub commands: Vec<PathBuf>,
    /// Paths to agent markdown files (sub-agent definitions).
    #[serde(default)]
    pub agents: Vec<PathBuf>,
    /// Paths to skill SKILL.md files (or skill directories).
    #[serde(default)]
    pub skills: Vec<PathBuf>,
    /// Inline hooks config (same shape as ~/.agiworkforce/hooks.json's
    /// `hooks` field).
    #[serde(default)]
    pub hooks: Option<serde_json::Value>,
    /// MCP server map (same shape as before, plus passthrough for
    /// Claude/Codex formats which may include `transport`/`url` fields
    /// — accept via flatten on McpServerConfig).
    #[serde(default)]
    pub mcp_servers: HashMap<String, McpServerConfig>,
    /// Apps (B5-era field): list of app/connector ids declared by this
    /// plugin. Kept for backcompat with `.app.json` manifests.
    #[serde(default)]
    pub apps: Vec<String>,
    /// Cross-plugin dependencies (plugin name or `name@marketplace`
    /// shorthand).
    #[serde(default)]
    pub dependencies: Vec<String>,
    /// Catch-all for unknown fields from Claude/Codex-format manifests.
    /// Logged at debug level; ignored otherwise so unknown fields don't
    /// fail load.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

pub struct PluginsManager {
    global_dir: PathBuf,
    plugins: Vec<LoadedPlugin>,
}

pub enum PluginSource {
    Local(PathBuf),
    Git { url: String, branch: Option<String> },
}
pub struct PluginInstallRequest {
    pub source: PluginSource,
    pub name: String,
}
pub enum PluginInstallOutcome {
    Installed { path: PathBuf, format: Option<ManifestFormat> },
    AlreadyInstalled { path: PathBuf },
    Failed { error: String },
}

const AGIWORKFORCE_DIR: &str = ".agiworkforce";
const PLUGINS_DIR: &str = "plugins";

impl PluginsManager {
    pub fn new() -> Self {
        let global_dir = match dirs::home_dir() {
            Some(home) => home.join(AGIWORKFORCE_DIR).join(PLUGINS_DIR),
            None => {
                eprintln!(
                    "[plugins] warning: could not determine home directory, using current dir"
                );
                PathBuf::from(".").join(AGIWORKFORCE_DIR).join(PLUGINS_DIR)
            }
        };
        Self {
            global_dir,
            plugins: Vec::new(),
        }
    }
    pub fn load_all(&mut self, project_dir: Option<&Path>) -> Result<&[LoadedPlugin]> {
        self.plugins.clear();
        if self.global_dir.exists() {
            self.load_from_dir(&self.global_dir.clone())?;
        }
        if let Some(p) = project_dir {
            let pp = p.join(".agiworkforce").join("plugins");
            if pp.exists() {
                self.load_from_dir(&pp)?;
            }
        }
        Ok(&self.plugins)
    }
    fn load_from_dir(&mut self, dir: &Path) -> Result<()> {
        for entry in std::fs::read_dir(dir)? {
            let path = entry?.path();
            if !path.is_dir() {
                continue;
            }
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            // Try each manifest path in priority order.
            let parsed = load_manifest_for(&path);
            let (manifest, format) = match parsed {
                Some((mut m, fmt)) => {
                    // Validate MCP server commands in stdio entries —
                    // reject shell metacharacters that could enable
                    // command injection. HTTP/SSE entries (no command,
                    // url in `extra`) are passed through untouched.
                    m.mcp_servers.retain(|sname, cfg| {
                        if cfg.command.is_empty() {
                            // No command means HTTP/SSE transport —
                            // safety check doesn't apply.
                            return true;
                        }
                        let has_metachar = cfg
                            .command
                            .contains(&['|', ';', '&', '$', '`', '\0'][..]);
                        if has_metachar {
                            eprintln!(
                                "[plugins] Rejected MCP server '{}' in plugin '{}': \
                                 command contains shell metacharacters",
                                sname, name
                            );
                        }
                        !has_metachar
                    });
                    (Some(m), Some(fmt))
                }
                None => (None, None),
            };

            // Surface unknown manifest fields once at debug level so
            // ecosystem authors notice when a field they need isn't
            // wired up yet.
            if let Some(m) = &manifest {
                if !m.extra.is_empty() {
                    let keys: Vec<&str> = m.extra.keys().map(|k| k.as_str()).collect();
                    eprintln!(
                        "[plugins debug] plugin '{}' manifest has unknown fields: {}",
                        name,
                        keys.join(", ")
                    );
                }
            }

            self.plugins.push(LoadedPlugin {
                config_name: name,
                manifest_name: manifest.as_ref().and_then(|m| m.name.clone()),
                root: path,
                enabled: true,
                skill_roots: vec![],
                mcp_servers: manifest
                    .as_ref()
                    .map(|m| m.mcp_servers.clone())
                    .unwrap_or_default(),
                apps: manifest
                    .as_ref()
                    .map(|m| m.apps.clone())
                    .unwrap_or_default(),
                error: None,
                format,
                manifest_commands: manifest
                    .as_ref()
                    .map(|m| m.commands.clone())
                    .unwrap_or_default(),
                manifest_agents: manifest
                    .as_ref()
                    .map(|m| m.agents.clone())
                    .unwrap_or_default(),
                manifest_skills: manifest
                    .as_ref()
                    .map(|m| m.skills.clone())
                    .unwrap_or_default(),
                manifest_hooks: manifest.as_ref().and_then(|m| m.hooks.clone()),
                manifest_dependencies: manifest
                    .as_ref()
                    .map(|m| m.dependencies.clone())
                    .unwrap_or_default(),
            });
        }
        Ok(())
    }
    pub fn plugins(&self) -> &[LoadedPlugin] {
        &self.plugins
    }

    /// Collect MCP server configs from all loaded plugins, converted to
    /// `crate::mcp::McpServerConfig` so callers can pass them to `McpManager`.
    pub fn mcp_configs(&self) -> HashMap<String, crate::mcp::McpServerConfig> {
        let mut out = HashMap::new();
        for p in &self.plugins {
            for (name, cfg) in &p.mcp_servers {
                if cfg.command.is_empty() {
                    // HTTP/SSE entries land here once the McpServerConfig
                    // shape supports `url`/`transport`. Skip until then.
                    continue;
                }
                out.insert(
                    name.clone(),
                    crate::mcp::McpServerConfig {
                        command: cfg.command.clone(),
                        args: cfg.args.clone(),
                        env: cfg.env.clone(),
                    },
                );
            }
        }
        out
    }

    /// Return all plugin-declared command file paths, absolute.
    /// Loaders should walk these and register the same way user-level
    /// commands get registered.
    pub fn command_paths(&self) -> Vec<PathBuf> {
        self.plugins
            .iter()
            .flat_map(|p| p.manifest_commands.iter().map(|rel| p.root.join(rel)))
            .collect()
    }

    /// Return all plugin-declared skill file/dir paths, absolute.
    pub fn skill_paths(&self) -> Vec<PathBuf> {
        self.plugins
            .iter()
            .flat_map(|p| p.manifest_skills.iter().map(|rel| p.root.join(rel)))
            .collect()
    }

    /// Return all plugin-declared agent file paths, absolute.
    pub fn agent_paths(&self) -> Vec<PathBuf> {
        self.plugins
            .iter()
            .flat_map(|p| p.manifest_agents.iter().map(|rel| p.root.join(rel)))
            .collect()
    }

    /// Merged hook configs from all plugins, keyed by event name.
    ///
    /// Each plugin's `manifest_hooks` is expected to be either:
    ///   - `{ "hooks": { "PreToolUse": [...], "Stop": [...] } }` (full
    ///     hooks.json shape — `hooks` field unwrapped), or
    ///   - `{ "PreToolUse": [...], "Stop": [...] }` (the inner hooks
    ///     map directly — shorthand).
    ///
    /// Returns a flattened `event -> [hook_value, ...]` map. Caller
    /// merges into the user's `~/.agiworkforce/hooks.json` config; plugin
    /// hooks append after user hooks (documented in `hooks.rs`
    /// `merge_plugin_hooks`).
    pub fn hook_configs(&self) -> HashMap<String, Vec<serde_json::Value>> {
        let mut merged: HashMap<String, Vec<serde_json::Value>> = HashMap::new();
        for p in &self.plugins {
            let raw = match &p.manifest_hooks {
                Some(v) => v,
                None => continue,
            };
            // Accept both `{ "hooks": {...} }` and `{...}` shapes.
            let inner = raw.get("hooks").unwrap_or(raw);
            let map = match inner.as_object() {
                Some(m) => m,
                None => continue,
            };
            for (event_name, hooks_val) in map {
                let arr = match hooks_val.as_array() {
                    Some(a) => a,
                    None => continue,
                };
                merged
                    .entry(event_name.clone())
                    .or_default()
                    .extend(arr.iter().cloned());
            }
        }
        merged
    }

    pub fn install(&self, req: PluginInstallRequest) -> PluginInstallOutcome {
        let target = self.global_dir.join(&req.name);
        if target.exists() {
            return PluginInstallOutcome::AlreadyInstalled { path: target };
        }
        // Ensure parent dir exists so the first-ever install works.
        if let Some(parent) = target.parent() {
            if !parent.exists() {
                if let Err(e) = std::fs::create_dir_all(parent) {
                    return PluginInstallOutcome::Failed {
                        error: format!("failed to create plugins dir: {}", e),
                    };
                }
            }
        }
        let copy_outcome = match req.source {
            PluginSource::Local(src) => copy_dir(&src, &target).map_err(|e| format!("{}", e)),
            PluginSource::Git { url, branch } => {
                let mut cmd = std::process::Command::new("git");
                cmd.arg("clone").arg("--depth").arg("1");
                if let Some(b) = branch {
                    cmd.args(["--branch", &b]);
                }
                cmd.arg(&url).arg(&target);
                match cmd.output() {
                    Ok(o) if o.status.success() => Ok(()),
                    Ok(o) => Err(String::from_utf8_lossy(&o.stderr).to_string()),
                    Err(e) => Err(format!("{}", e)),
                }
            }
        };
        if let Err(error) = copy_outcome {
            return PluginInstallOutcome::Failed { error };
        }

        // Post-install: validate that the copied plugin has a recognized
        // manifest. If not, roll back the install + report which paths
        // we tried.
        match load_manifest_for(&target) {
            Some((_, format)) => {
                PluginInstallOutcome::Installed { path: target, format: Some(format) }
            }
            None => {
                let _ = std::fs::remove_dir_all(&target);
                let tried: Vec<&str> =
                    MANIFEST_PATHS.iter().map(|(_, p)| *p).collect();
                PluginInstallOutcome::Failed {
                    error: format!(
                        "no plugin manifest found in any of: {}",
                        tried.join(", ")
                    ),
                }
            }
        }
    }
}

/// Probe a plugin root for any of the supported manifest paths and
/// return the first parse-able one. Emits a stderr deprecation notice
/// for legacy formats so authors migrate to `.agiworkforce-plugin/`.
pub fn load_manifest_for(plugin_root: &Path) -> Option<(PluginManifest, ManifestFormat)> {
    for (format, rel) in MANIFEST_PATHS {
        let path = plugin_root.join(rel);
        if !path.exists() {
            continue;
        }
        match std::fs::read_to_string(&path) {
            Ok(content) => match serde_json::from_str::<PluginManifest>(&content) {
                Ok(manifest) => {
                    if matches!(format, ManifestFormat::LegacyApp | ManifestFormat::LegacyMcp) {
                        eprintln!(
                            "[plugins] notice: plugin '{}' uses legacy {} manifest; \
                             consider migrating to .agiworkforce-plugin/plugin.json",
                            plugin_root.display(),
                            rel
                        );
                    }
                    return Some((manifest, *format));
                }
                Err(e) => {
                    eprintln!("[plugins] failed to parse {}: {}", path.display(), e);
                }
            },
            Err(e) => {
                eprintln!("[plugins] failed to read {}: {}", path.display(), e);
            }
        }
    }
    None
}

fn copy_dir(src: &Path, dst: &Path) -> Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let e = entry?;
        let d = dst.join(e.file_name());
        if e.path().is_dir() {
            copy_dir(&e.path(), &d)?;
        } else {
            std::fs::copy(e.path(), d)?;
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoverableTool {
    pub name: String,
    pub description: String,
    pub tool_type: DiscoverableToolType,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DiscoverableToolType {
    Function,
    Plugin,
    Skill,
    Mcp,
}

pub fn build_discoverable_tools(
    builtins: &[String],
    mcp: &[String],
    plugins: &[String],
) -> Vec<DiscoverableTool> {
    let mut tools = Vec::new();
    for n in builtins {
        tools.push(DiscoverableTool {
            name: n.clone(),
            description: format!("Built-in: {}", n),
            tool_type: DiscoverableToolType::Function,
            source: "builtin".into(),
        });
    }
    for n in mcp {
        tools.push(DiscoverableTool {
            name: n.clone(),
            description: format!("MCP: {}", n),
            tool_type: DiscoverableToolType::Mcp,
            source: "mcp".into(),
        });
    }
    for n in plugins {
        tools.push(DiscoverableTool {
            name: n.clone(),
            description: format!("Plugin: {}", n),
            tool_type: DiscoverableToolType::Plugin,
            source: "plugin".into(),
        });
    }
    tools
}
