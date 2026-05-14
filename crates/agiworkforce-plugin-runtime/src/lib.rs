//! Plugin manifest schema + discovery for AGI Workforce CLI.
//!
//! AGI Workforce CLI accepts plugin manifests in five locations, in priority
//! order. The first one found wins; legacy paths emit a one-time deprecation
//! notice on stderr per session per plugin.
//!
//!   1. `.agiworkforce-plugin/plugin.json`  (own format — preferred)
//!   2. `.claude-plugin/plugin.json`        (Claude Code interop)
//!   3. `.codex-plugin/plugin.json`         (Codex CLI interop)
//!   4. `.app.json`                          (legacy — pre-B6)
//!   5. `.mcp.json`                          (legacy — pre-B6)
//!
//! All five share one schema: [`PluginManifest`]. Unknown fields land in
//! `extra` via serde-flatten so Claude/Codex-format manifests with surplus
//! keys (`transport`, `url`, `marketplace`, …) load without error.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Format origin of a plugin manifest. Used for `plugin list` display
/// and deprecation notices when legacy formats are loaded.
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
    /// Short tag for `plugin list` display: `[agi]`, `[claude]`, `[codex]`, `[legacy]`.
    pub fn short_tag(&self) -> &'static str {
        match self {
            Self::Agiworkforce => "agi",
            Self::ClaudeCode => "claude",
            Self::Codex => "codex",
            Self::LegacyApp | Self::LegacyMcp => "legacy",
        }
    }

    /// Manifest file path relative to plugin root.
    pub fn manifest_path(&self) -> &'static str {
        match self {
            Self::Agiworkforce => ".agiworkforce-plugin/plugin.json",
            Self::ClaudeCode => ".claude-plugin/plugin.json",
            Self::Codex => ".codex-plugin/plugin.json",
            Self::LegacyApp => ".app.json",
            Self::LegacyMcp => ".mcp.json",
        }
    }

    /// Whether this format is legacy (i.e., should emit a deprecation notice).
    pub fn is_legacy(&self) -> bool {
        matches!(self, Self::LegacyApp | Self::LegacyMcp)
    }
}

/// Priority-ordered list of manifest paths to probe inside a plugin
/// directory. The first path that exists + parses wins.
pub const MANIFEST_PATHS: &[(ManifestFormat, &str)] = &[
    (ManifestFormat::Agiworkforce, ".agiworkforce-plugin/plugin.json"),
    (ManifestFormat::ClaudeCode, ".claude-plugin/plugin.json"),
    (ManifestFormat::Codex, ".codex-plugin/plugin.json"),
    (ManifestFormat::LegacyApp, ".app.json"),
    (ManifestFormat::LegacyMcp, ".mcp.json"),
];

/// MCP server entry as declared in a plugin manifest. Plugin-side schema
/// only — the runtime config used by the MCP manager is a separate type
/// in `crate::mcp` and is built from this one via translation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    /// Catch-all for transport-related fields used by Claude Code / Codex
    /// MCP entries (`transport`, `url`, `headers`, `auth`, …). Preserved
    /// so we don't lose data; surfaced verbatim once HTTP/SSE transports
    /// land (Sprint B1/B2/B3).
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
    /// Inline hooks config (same shape as ~/.agiworkforce/hooks.json's `hooks` field).
    #[serde(default)]
    pub hooks: Option<serde_json::Value>,
    /// MCP server map. Plugin-side schema with passthrough for
    /// Claude/Codex-format fields (`transport`/`url`/`headers`/`auth`).
    #[serde(default)]
    pub mcp_servers: HashMap<String, McpServerConfig>,
    /// Apps (B5-era field): list of app/connector ids declared by this
    /// plugin. Kept for backcompat with `.app.json` manifests.
    #[serde(default)]
    pub apps: Vec<String>,
    /// Cross-plugin dependencies (plugin name or `name@marketplace` shorthand).
    #[serde(default)]
    pub dependencies: Vec<String>,
    /// Catch-all for unknown fields from Claude/Codex-format manifests.
    /// Ignored otherwise so unknown fields don't fail load.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
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
                    if format.is_legacy() {
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

// ---------------------------------------------------------------------------
// Inline tests for pure logic (no fs interaction)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_short_tags_are_distinct_or_grouped_for_legacy() {
        assert_eq!(ManifestFormat::Agiworkforce.short_tag(), "agi");
        assert_eq!(ManifestFormat::ClaudeCode.short_tag(), "claude");
        assert_eq!(ManifestFormat::Codex.short_tag(), "codex");
        assert_eq!(ManifestFormat::LegacyApp.short_tag(), "legacy");
        assert_eq!(ManifestFormat::LegacyMcp.short_tag(), "legacy");
    }

    #[test]
    fn manifest_paths_are_priority_ordered() {
        let paths: Vec<&str> = MANIFEST_PATHS.iter().map(|(_, p)| *p).collect();
        assert_eq!(
            paths,
            vec![
                ".agiworkforce-plugin/plugin.json",
                ".claude-plugin/plugin.json",
                ".codex-plugin/plugin.json",
                ".app.json",
                ".mcp.json",
            ]
        );
    }

    #[test]
    fn is_legacy_only_for_legacy_variants() {
        assert!(!ManifestFormat::Agiworkforce.is_legacy());
        assert!(!ManifestFormat::ClaudeCode.is_legacy());
        assert!(!ManifestFormat::Codex.is_legacy());
        assert!(ManifestFormat::LegacyApp.is_legacy());
        assert!(ManifestFormat::LegacyMcp.is_legacy());
    }

    #[test]
    fn empty_manifest_parses_via_serde_defaults() {
        let m: PluginManifest = serde_json::from_str("{}").expect("parse empty manifest");
        assert!(m.name.is_none());
        assert!(m.commands.is_empty());
        assert!(m.dependencies.is_empty());
        assert!(m.extra.is_empty());
    }

    #[test]
    fn unknown_fields_land_in_extra() {
        let json = r#"{
            "name": "test-plugin",
            "version": "0.1.0",
            "marketplace": "https://example.com",
            "transport": "sse"
        }"#;
        let m: PluginManifest = serde_json::from_str(json).expect("parse with unknown fields");
        assert_eq!(m.name.as_deref(), Some("test-plugin"));
        assert!(m.extra.contains_key("marketplace"));
        assert!(m.extra.contains_key("transport"));
    }

    #[test]
    fn camel_case_is_accepted_for_mcp_servers() {
        let json = r#"{
            "mcpServers": {
                "demo": { "command": "echo", "args": ["hi"] }
            }
        }"#;
        let m: PluginManifest = serde_json::from_str(json).expect("parse camelCase");
        assert!(m.mcp_servers.contains_key("demo"));
        assert_eq!(m.mcp_servers["demo"].command, "echo");
        assert_eq!(m.mcp_servers["demo"].args, vec!["hi"]);
    }

    #[test]
    fn mcp_server_extra_captures_transport_url_headers() {
        let json = r#"{
            "command": "",
            "transport": "http",
            "url": "https://mcp.example.com",
            "headers": {"X-Token": "abc"}
        }"#;
        let cfg: McpServerConfig =
            serde_json::from_str(json).expect("parse mcp server with extras");
        assert_eq!(cfg.command, "");
        assert_eq!(
            cfg.extra.get("transport").and_then(|v| v.as_str()),
            Some("http")
        );
        assert_eq!(
            cfg.extra.get("url").and_then(|v| v.as_str()),
            Some("https://mcp.example.com")
        );
    }
}
