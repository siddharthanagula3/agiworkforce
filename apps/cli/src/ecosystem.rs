//! Ecosystem scanner — detects and imports config from competing AI tools and IDEs.
//!
//! Scans well-known paths for tools like Claude Code, Codex CLI, Gemini CLI,
//! Cursor, VS Code, Zed, etc. Imports their MCP server configs and skill
//! definitions so AGI Workforce can leverage the user's existing setup.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// A detected AI tool or IDE on the user's machine.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedTool {
    pub name: String,
    pub path: PathBuf,
    pub has_mcp: bool,
    pub has_skills: bool,
    pub has_instructions: bool,
    pub has_settings: bool,
    pub mcp_config_path: Option<PathBuf>,
    pub skills_paths: Vec<PathBuf>,
    pub instructions_path: Option<PathBuf>,
}

/// An MCP server config imported from another tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportedMcpServer {
    /// Prefixed name: "claude:stripe"
    pub name: String,
    /// Source tool identifier: "claude", "codex", etc.
    pub source: String,
    /// Original server name from the source config
    pub original_name: String,
    /// Command to launch the server (stdio transport)
    pub command: Option<String>,
    /// Command arguments
    pub args: Vec<String>,
    /// Environment variables
    pub env: HashMap<String, String>,
    /// URL for HTTP/SSE transport servers
    pub url: Option<String>,
}

/// Reference to an instruction file from another tool.
#[derive(Debug, Clone, Serialize)]
pub struct InstructionRef {
    pub tool: String,
    pub path: PathBuf,
    pub size_bytes: u64,
}

/// Full ecosystem scan result.
#[derive(Debug, Clone, Serialize)]
pub struct EcosystemContext {
    pub detected_tools: Vec<DetectedTool>,
    pub available_instructions: Vec<InstructionRef>,
    pub imported_mcp_count: usize,
    pub imported_skills_count: usize,
}

// ---------------------------------------------------------------------------
// Internal tool registry
// ---------------------------------------------------------------------------

struct ToolDefinition {
    name: &'static str,
    /// Short identifier used as prefix in imported names
    source_id: &'static str,
    /// Paths to check (first found wins). Relative to home.
    home_relative_paths: Vec<&'static str>,
    /// MCP config path relative to the tool's home dir
    mcp_relative: Option<&'static str>,
    /// Glob patterns for skill files relative to tool home
    skills_globs: Vec<&'static str>,
    /// Instruction file path relative to tool home
    instructions_relative: Option<&'static str>,
    /// Whether this is a file-only check (no directory)
    is_file_check: bool,
}

fn tool_registry() -> Vec<ToolDefinition> {
    vec![
        // --- AI CLIs ---
        ToolDefinition {
            name: "Claude Code",
            source_id: "claude",
            home_relative_paths: vec![".claude"],
            mcp_relative: Some("mcp.json"),
            skills_globs: vec!["plugins/cache/*/skills/*/SKILL.md"],
            instructions_relative: Some("CLAUDE.md"),
            is_file_check: false,
        },
        ToolDefinition {
            name: "Codex CLI",
            source_id: "codex",
            home_relative_paths: vec![".codex"],
            mcp_relative: Some("config.toml"),
            skills_globs: vec![
                "skills/*.md",
                "vendor_imports/skills/skills/.curated/*/SKILL.md",
            ],
            instructions_relative: Some("AGENTS.md"),
            is_file_check: false,
        },
        ToolDefinition {
            name: "Gemini CLI",
            source_id: "gemini",
            home_relative_paths: vec![".gemini"],
            mcp_relative: Some("config.yaml"),
            skills_globs: vec!["skills/*/SKILL.md", "commands/*.md"],
            instructions_relative: Some("GEMINI.md"),
            is_file_check: false,
        },
        ToolDefinition {
            name: "OpenCode",
            source_id: "opencode",
            home_relative_paths: vec![".config/opencode"],
            mcp_relative: Some("opencode.jsonc"),
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: false,
        },
        ToolDefinition {
            name: "Copilot CLI",
            source_id: "copilot",
            home_relative_paths: vec![".copilot"],
            mcp_relative: Some("mcp-config.json"),
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: false,
        },
        ToolDefinition {
            name: "Aider",
            source_id: "aider",
            home_relative_paths: vec![".aider.conf.yml"],
            mcp_relative: None,
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: true,
        },
        ToolDefinition {
            name: "Continue.dev",
            source_id: "continue",
            home_relative_paths: vec![".continue"],
            mcp_relative: Some("config.json"),
            skills_globs: vec!["checks/*.md"],
            instructions_relative: None,
            is_file_check: false,
        },
        // --- IDEs ---
        ToolDefinition {
            name: "VS Code",
            source_id: "vscode",
            #[cfg(target_os = "macos")]
            home_relative_paths: vec![".vscode", "Library/Application Support/Code"],
            #[cfg(not(target_os = "macos"))]
            home_relative_paths: vec![".vscode"],
            mcp_relative: None,
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: false,
        },
        ToolDefinition {
            name: "Cursor",
            source_id: "cursor",
            home_relative_paths: vec![".cursor"],
            mcp_relative: Some("mcp.json"),
            skills_globs: vec!["skills-cursor/*/SKILL.md"],
            instructions_relative: None,
            is_file_check: false,
        },
        ToolDefinition {
            name: "Windsurf",
            source_id: "windsurf",
            home_relative_paths: vec![".windsurf"],
            mcp_relative: None,
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: false,
        },
        ToolDefinition {
            name: "Zed",
            source_id: "zed",
            home_relative_paths: vec![".config/zed"],
            mcp_relative: Some("settings.json"),
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: false,
        },
        ToolDefinition {
            name: "JetBrains",
            source_id: "jetbrains",
            #[cfg(target_os = "macos")]
            home_relative_paths: vec!["Library/Application Support/JetBrains"],
            #[cfg(not(target_os = "macos"))]
            home_relative_paths: vec![".local/share/JetBrains"],
            mcp_relative: None,
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: false,
        },
        ToolDefinition {
            name: "Cline",
            source_id: "cline",
            home_relative_paths: vec![".vscode/extensions"],
            mcp_relative: None,
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: false,
        },
        // --- Terminal ---
        ToolDefinition {
            name: "Warp",
            source_id: "warp",
            home_relative_paths: vec![".warp"],
            mcp_relative: None,
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: false,
        },
    ]
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

/// Scan the filesystem for known AI tools and IDEs.
/// Fast path-existence checks only — no file parsing.
pub fn scan() -> Vec<DetectedTool> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return Vec::new(),
    };

    let registry = tool_registry();
    let mut detected = Vec::new();

    for def in &registry {
        if let Some(tool) = detect_tool(&home, def) {
            detected.push(tool);
        }
    }

    detected
}

fn detect_tool(home: &Path, def: &ToolDefinition) -> Option<DetectedTool> {
    // Special case for Cline: look for specific extension directory pattern
    if def.source_id == "cline" {
        return detect_cline(home);
    }

    // Find the first existing path
    let tool_path = def.home_relative_paths.iter().find_map(|rel| {
        let p = home.join(rel);
        if def.is_file_check {
            if p.is_file() {
                Some(p)
            } else {
                None
            }
        } else if p.is_dir() {
            Some(p)
        } else {
            None
        }
    })?;

    let mcp_config_path = def.mcp_relative.and_then(|rel| {
        let p = tool_path.join(rel);
        if p.is_file() {
            Some(p)
        } else {
            None
        }
    });

    let instructions_path = def.instructions_relative.and_then(|rel| {
        // Instructions may be in tool home or project root
        let in_tool = tool_path.join(rel);
        if in_tool.is_file() {
            return Some(in_tool);
        }
        // Also check home dir root (e.g. ~/CLAUDE.md)
        let in_home = home.join(rel);
        if in_home.is_file() {
            return Some(in_home);
        }
        None
    });

    // Check skills paths exist (just check if any glob pattern has results)
    let has_skills = !def.skills_globs.is_empty() && {
        def.skills_globs.iter().any(|pattern| {
            let full_pattern = tool_path.join(pattern);
            glob::glob(&full_pattern.to_string_lossy())
                .ok()
                .map(|mut iter| iter.next().is_some())
                .unwrap_or(false)
        })
    };

    // Collect concrete skill paths from globs
    let skills_paths: Vec<PathBuf> = def
        .skills_globs
        .iter()
        .flat_map(|pattern| {
            let full = tool_path.join(pattern);
            glob::glob(&full.to_string_lossy())
                .ok()
                .into_iter()
                .flatten()
                .filter_map(|r| r.ok())
        })
        .collect();

    Some(DetectedTool {
        name: def.name.to_string(),
        path: tool_path.clone(),
        has_mcp: mcp_config_path.is_some(),
        has_skills,
        has_instructions: instructions_path.is_some(),
        has_settings: mcp_config_path.is_some(), // settings ≈ config presence
        mcp_config_path,
        skills_paths,
        instructions_path,
    })
}

/// Special detection for Cline (VS Code extension).
fn detect_cline(home: &Path) -> Option<DetectedTool> {
    let ext_dir = home.join(".vscode").join("extensions");
    if !ext_dir.is_dir() {
        return None;
    }

    // Look for saoudrizwan.claude-dev-* directory
    let pattern = ext_dir.join("saoudrizwan.claude-dev-*");
    let cline_path = glob::glob(&pattern.to_string_lossy())
        .ok()?
        .filter_map(|r| r.ok())
        .find(|p| p.is_dir())?;

    Some(DetectedTool {
        name: "Cline".to_string(),
        path: cline_path,
        has_mcp: false,
        has_skills: false,
        has_instructions: false,
        has_settings: false,
        mcp_config_path: None,
        skills_paths: Vec::new(),
        instructions_path: None,
    })
}

// ---------------------------------------------------------------------------
// MCP Import
// ---------------------------------------------------------------------------

/// Import MCP server configs from all detected tools.
/// Best-effort: silently skips unparseable configs.
pub fn import_mcp_servers(detected: &[DetectedTool]) -> Vec<ImportedMcpServer> {
    let mut servers = Vec::new();

    for tool in detected {
        if let Some(ref mcp_path) = tool.mcp_config_path {
            let source_id = source_id_for(&tool.name);
            if let Ok(contents) = std::fs::read_to_string(mcp_path) {
                let imported = parse_mcp_config(&source_id, &contents, mcp_path);
                servers.extend(imported);
            }
        }
    }

    servers
}

/// Determine the short source ID from a tool name.
fn source_id_for(name: &str) -> String {
    match name {
        "Claude Code" => "claude".to_string(),
        "Codex CLI" => "codex".to_string(),
        "Gemini CLI" => "gemini".to_string(),
        "OpenCode" => "opencode".to_string(),
        "Copilot CLI" => "copilot".to_string(),
        "Continue.dev" => "continue".to_string(),
        "Cursor" => "cursor".to_string(),
        "Zed" => "zed".to_string(),
        other => other.to_lowercase().replace(' ', "-"),
    }
}

/// Parse MCP server configs from a file, dispatching by format.
fn parse_mcp_config(source: &str, contents: &str, path: &Path) -> Vec<ImportedMcpServer> {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");

    match ext {
        "toml" => parse_toml_mcp(source, contents),
        "json" | "jsonc" => parse_json_mcp(source, contents, path),
        "yaml" | "yml" => Vec::new(), // Gemini YAML — future extension
        _ => parse_json_mcp(source, contents, path),
    }
}

/// Parse JSON-based MCP configs (Claude Code, Cursor, Copilot, Continue.dev, OpenCode).
fn parse_json_mcp(source: &str, contents: &str, path: &Path) -> Vec<ImportedMcpServer> {
    // Strip JSONC comments (// and /* */) for opencode.jsonc
    let clean = strip_jsonc_comments(contents);

    let parsed: serde_json::Value = match serde_json::from_str(&clean) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };

    let mut servers = Vec::new();

    // Try "mcpServers" key (Claude Code, Cursor, Copilot standard)
    if let Some(mcp_obj) = parsed.get("mcpServers").and_then(|v| v.as_object()) {
        for (name, config) in mcp_obj {
            if let Some(srv) = json_server_entry(source, name, config) {
                servers.push(srv);
            }
        }
    }

    // Zed format: "context_servers" key
    if let Some(ctx_obj) = parsed.get("context_servers").and_then(|v| v.as_object()) {
        for (name, config) in ctx_obj {
            if let Some(srv) = json_server_entry(source, name, config) {
                servers.push(srv);
            }
        }
    }

    // Continue.dev: may have mcpServers nested inside the config
    if servers.is_empty() {
        // Try top-level flat format: { "server_name": { "command": "...", ... } }
        if let Some(obj) = parsed.as_object() {
            for (name, config) in obj {
                if name == "mcpServers" || name == "context_servers" {
                    continue;
                }
                // Only treat as server if it has a "command" or "url" key
                if config.get("command").is_some() || config.get("url").is_some() {
                    if let Some(srv) = json_server_entry(source, name, config) {
                        servers.push(srv);
                    }
                }
            }
        }
    }

    // If this is a Zed settings.json, log the path context
    let _ = path; // used for format dispatch above

    servers
}

/// Extract a single server entry from a JSON config value.
fn json_server_entry(
    source: &str,
    name: &str,
    config: &serde_json::Value,
) -> Option<ImportedMcpServer> {
    let command = config
        .get("command")
        .and_then(|v| v.as_str())
        .and_then(|c| {
            // Reject commands containing shell metacharacters to prevent injection
            if c.contains(&['|', ';', '&', '$', '`', '\0'][..]) {
                eprintln!(
                    "[ecosystem] Skipping imported MCP server '{}:{}': command contains shell metacharacters",
                    source, name
                );
                return None;
            }
            Some(String::from(c))
        });

    let args: Vec<String> = config
        .get("args")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let env: HashMap<String, String> = config
        .get("env")
        .and_then(|v| v.as_object())
        .map(|obj| {
            obj.iter()
                .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                .collect()
        })
        .unwrap_or_default();

    let url = config.get("url").and_then(|v| v.as_str()).map(String::from);

    // Must have at least a command or URL
    if command.is_none() && url.is_none() {
        return None;
    }

    Some(ImportedMcpServer {
        name: format!("{}:{}", source, name),
        source: source.to_string(),
        original_name: name.to_string(),
        command,
        args,
        env,
        url,
    })
}

/// Parse TOML-based MCP configs (Codex CLI config.toml).
fn parse_toml_mcp(source: &str, contents: &str) -> Vec<ImportedMcpServer> {
    let parsed: toml::Value = match contents.parse() {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };

    let mut servers = Vec::new();

    // Look for [mcp_servers."server-name"] tables
    if let Some(mcp_table) = parsed.get("mcp_servers").and_then(|v| v.as_table()) {
        for (name, config) in mcp_table {
            let command = config
                .get("command")
                .and_then(|v| v.as_str())
                .map(String::from);

            let args: Vec<String> = config
                .get("args")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();

            let env: HashMap<String, String> = config
                .get("env")
                .and_then(|v| v.as_table())
                .map(|tbl| {
                    tbl.iter()
                        .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                        .collect()
                })
                .unwrap_or_default();

            let url = config.get("url").and_then(|v| v.as_str()).map(String::from);

            if command.is_none() && url.is_none() {
                continue;
            }

            servers.push(ImportedMcpServer {
                name: format!("{}:{}", source, name),
                source: source.to_string(),
                original_name: name.to_string(),
                command,
                args,
                env,
                url,
            });
        }
    }

    servers
}

/// Strip single-line (//) and multi-line (/* */) comments from JSONC content.
fn strip_jsonc_comments(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    let mut in_string = false;
    let mut escape_next = false;

    while let Some(c) = chars.next() {
        if escape_next {
            out.push(c);
            escape_next = false;
            continue;
        }

        if in_string {
            out.push(c);
            if c == '\\' {
                escape_next = true;
            } else if c == '"' {
                in_string = false;
            }
            continue;
        }

        if c == '"' {
            in_string = true;
            out.push(c);
            continue;
        }

        if c == '/' {
            if chars.peek() == Some(&'/') {
                // Single-line comment — skip to end of line
                chars.next();
                for ch in chars.by_ref() {
                    if ch == '\n' {
                        out.push('\n');
                        break;
                    }
                }
                continue;
            } else if chars.peek() == Some(&'*') {
                // Multi-line comment — skip to */
                chars.next();
                let mut prev = ' ';
                for ch in chars.by_ref() {
                    if prev == '*' && ch == '/' {
                        break;
                    }
                    prev = ch;
                }
                continue;
            }
        }

        out.push(c);
    }

    out
}

// ---------------------------------------------------------------------------
// Skills Import
// ---------------------------------------------------------------------------

/// Discover skill file paths from all detected tools.
/// Returns paths to SKILL.md files (or other .md skill files).
pub fn discover_external_skills(detected: &[DetectedTool]) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    for tool in detected {
        for skill_path in &tool.skills_paths {
            if skill_path.is_file() {
                paths.push(skill_path.clone());
            }
        }
    }
    paths
}

// ---------------------------------------------------------------------------
// Ecosystem Context Builder
// ---------------------------------------------------------------------------

/// Build the full ecosystem context from a scan.
pub fn build_context(detected: &[DetectedTool]) -> EcosystemContext {
    let mut instructions = Vec::new();

    for tool in detected {
        if let Some(ref ipath) = tool.instructions_path {
            let size = std::fs::metadata(ipath).map(|m| m.len()).unwrap_or(0);
            instructions.push(InstructionRef {
                tool: tool.name.clone(),
                path: ipath.clone(),
                size_bytes: size,
            });
        }
    }

    let mcp_count = detected.iter().filter(|t| t.has_mcp).count();
    let skills_count: usize = detected.iter().map(|t| t.skills_paths.len()).sum();

    EcosystemContext {
        detected_tools: detected.to_vec(),
        available_instructions: instructions,
        imported_mcp_count: mcp_count,
        imported_skills_count: skills_count,
    }
}

/// Format ecosystem context as a system prompt section.
#[allow(dead_code)]
pub fn format_ecosystem_prompt(ctx: &EcosystemContext) -> String {
    if ctx.detected_tools.is_empty() {
        return String::new();
    }

    let mut out = String::from("\n<ecosystem>\nDetected AI tools on this machine:\n");

    for tool in &ctx.detected_tools {
        let mut features = Vec::new();

        if tool.has_mcp {
            features.push("MCP config".to_string());
        }
        if !tool.skills_paths.is_empty() {
            features.push(format!("{} skills", tool.skills_paths.len()));
        }
        if let Some(ref ipath) = tool.instructions_path {
            let filename = ipath
                .file_name()
                .and_then(|f| f.to_str())
                .unwrap_or("instructions");
            features.push(format!("{} available", filename));
        }
        if features.is_empty() {
            features.push("installed".to_string());
        }

        out.push_str(&format!(
            "- {} ({}) — {}\n",
            tool.name,
            tool.path.display(),
            features.join(", ")
        ));
    }

    out.push_str(
        "\nTo read instructions from another tool, use the file path directly.\n</ecosystem>",
    );
    out
}

/// Format a CLI-friendly table of detected tools.
pub fn format_table(detected: &[DetectedTool]) -> String {
    if detected.is_empty() {
        return "No AI tools or IDEs detected on this machine.".to_string();
    }

    let mut out = String::new();
    out.push_str(&format!(
        "{:<18} {:<45} {:>4} {:>6} {:>6}\n",
        "Tool", "Path", "MCP", "Skills", "Instr"
    ));
    out.push_str(&"-".repeat(83));
    out.push('\n');

    for tool in detected {
        let path_str = tool.path.to_string_lossy();
        let path_display = if path_str.len() > 42 {
            format!("...{}", &path_str[path_str.len() - 39..])
        } else {
            path_str.to_string()
        };

        out.push_str(&format!(
            "{:<18} {:<45} {:>4} {:>6} {:>6}\n",
            tool.name,
            path_display,
            if tool.has_mcp { "yes" } else { "-" },
            if tool.skills_paths.is_empty() {
                "-".to_string()
            } else {
                tool.skills_paths.len().to_string()
            },
            if tool.has_instructions { "yes" } else { "-" },
        ));
    }

    out.push_str(&format!("\n{} tools detected.", detected.len()));

    out
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scan_no_crash() {
        // Should not crash even if no tools exist
        let detected = scan();
        let _ = detected;
    }

    #[test]
    fn test_import_mcp_empty() {
        let servers = import_mcp_servers(&[]);
        assert!(servers.is_empty());
    }

    #[test]
    fn test_parse_json_mcp_claude_format() {
        let json = r#"{"mcpServers":{"stripe":{"command":"npx","args":["-y","@stripe/mcp"],"env":{"STRIPE_KEY":"sk_test"}}}}"#;
        let servers = parse_json_mcp("claude", json, Path::new("mcp.json"));
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].name, "claude:stripe");
        assert_eq!(servers[0].original_name, "stripe");
        assert_eq!(servers[0].command, Some("npx".to_string()));
        assert_eq!(servers[0].args, vec!["-y", "@stripe/mcp"]);
        assert_eq!(
            servers[0].env.get("STRIPE_KEY"),
            Some(&"sk_test".to_string())
        );
    }

    #[test]
    fn test_parse_json_mcp_zed_format() {
        let json = r#"{"context_servers":{"my-server":{"command":"node","args":["server.js"]}}}"#;
        let servers = parse_json_mcp("zed", json, Path::new("settings.json"));
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].name, "zed:my-server");
    }

    #[test]
    fn test_parse_toml_mcp_codex_format() {
        let toml_str = r#"
[mcp_servers."playwright"]
command = "npx"
args = ["-y", "@playwright/mcp"]

[mcp_servers."github"]
command = "gh"
args = ["mcp"]
"#;
        let servers = parse_toml_mcp("codex", toml_str);
        assert_eq!(servers.len(), 2);
        let names: Vec<&str> = servers.iter().map(|s| s.name.as_str()).collect();
        assert!(names.contains(&"codex:playwright"));
        assert!(names.contains(&"codex:github"));
    }

    #[test]
    fn test_parse_json_mcp_invalid_json() {
        let servers = parse_json_mcp("test", "not json {{{", Path::new("bad.json"));
        assert!(servers.is_empty());
    }

    #[test]
    fn test_parse_toml_mcp_invalid_toml() {
        let servers = parse_toml_mcp("test", "not valid toml [[[");
        assert!(servers.is_empty());
    }

    #[test]
    fn test_strip_jsonc_comments() {
        let input = r#"{
  // This is a comment
  "key": "value", // inline comment
  /* multi
     line */
  "key2": "val2"
}"#;
        let clean = strip_jsonc_comments(input);
        let parsed: serde_json::Value = serde_json::from_str(&clean).unwrap();
        assert_eq!(parsed["key"], "value");
        assert_eq!(parsed["key2"], "val2");
    }

    #[test]
    fn test_strip_jsonc_preserves_strings() {
        let input = r#"{"url": "https://example.com/path"}"#;
        let clean = strip_jsonc_comments(input);
        let parsed: serde_json::Value = serde_json::from_str(&clean).unwrap();
        assert_eq!(parsed["url"], "https://example.com/path");
    }

    #[test]
    fn test_source_id_for() {
        assert_eq!(source_id_for("Claude Code"), "claude");
        assert_eq!(source_id_for("Codex CLI"), "codex");
        assert_eq!(source_id_for("Zed"), "zed");
        assert_eq!(source_id_for("VS Code"), "vs-code");
    }

    #[test]
    fn test_format_table_empty() {
        let out = format_table(&[]);
        assert!(out.contains("No AI tools"));
    }

    #[test]
    fn test_format_table_with_tools() {
        let tools = vec![DetectedTool {
            name: "TestTool".to_string(),
            path: PathBuf::from("/home/user/.test"),
            has_mcp: true,
            has_skills: true,
            has_instructions: false,
            has_settings: true,
            mcp_config_path: Some(PathBuf::from("/home/user/.test/mcp.json")),
            skills_paths: vec![PathBuf::from("/home/user/.test/skills/a.md")],
            instructions_path: None,
        }];
        let out = format_table(&tools);
        assert!(out.contains("TestTool"));
        assert!(out.contains("yes")); // MCP
        assert!(out.contains("1 tools detected"));
    }

    #[test]
    fn test_format_ecosystem_prompt_empty() {
        let ctx = EcosystemContext {
            detected_tools: vec![],
            available_instructions: vec![],
            imported_mcp_count: 0,
            imported_skills_count: 0,
        };
        assert!(format_ecosystem_prompt(&ctx).is_empty());
    }

    #[test]
    fn test_format_ecosystem_prompt_with_tools() {
        let ctx = EcosystemContext {
            detected_tools: vec![DetectedTool {
                name: "Claude Code".to_string(),
                path: PathBuf::from("/home/.claude"),
                has_mcp: true,
                has_skills: false,
                has_instructions: true,
                has_settings: true,
                mcp_config_path: Some(PathBuf::from("/home/.claude/mcp.json")),
                skills_paths: vec![],
                instructions_path: Some(PathBuf::from("/home/.claude/CLAUDE.md")),
            }],
            available_instructions: vec![InstructionRef {
                tool: "Claude Code".to_string(),
                path: PathBuf::from("/home/.claude/CLAUDE.md"),
                size_bytes: 1024,
            }],
            imported_mcp_count: 1,
            imported_skills_count: 0,
        };
        let prompt = format_ecosystem_prompt(&ctx);
        assert!(prompt.contains("<ecosystem>"));
        assert!(prompt.contains("Claude Code"));
        assert!(prompt.contains("CLAUDE.md available"));
        assert!(prompt.contains("</ecosystem>"));
    }

    #[test]
    fn test_discover_external_skills_empty() {
        let paths = discover_external_skills(&[]);
        assert!(paths.is_empty());
    }

    #[test]
    fn test_build_context_no_tools() {
        let ctx = build_context(&[]);
        assert!(ctx.detected_tools.is_empty());
        assert_eq!(ctx.imported_mcp_count, 0);
        assert_eq!(ctx.imported_skills_count, 0);
    }

    #[test]
    fn test_json_server_entry_command() {
        let config = serde_json::json!({"command": "npx", "args": ["-y", "foo"]});
        let srv = json_server_entry("test", "myserver", &config).unwrap();
        assert_eq!(srv.name, "test:myserver");
        assert_eq!(srv.command, Some("npx".to_string()));
        assert_eq!(srv.args, vec!["-y", "foo"]);
    }

    #[test]
    fn test_json_server_entry_url() {
        let config = serde_json::json!({"url": "http://localhost:3000/sse"});
        let srv = json_server_entry("test", "remote", &config).unwrap();
        assert_eq!(srv.url, Some("http://localhost:3000/sse".to_string()));
        assert!(srv.command.is_none());
    }

    #[test]
    fn test_json_server_entry_no_command_or_url() {
        let config = serde_json::json!({"description": "just metadata"});
        let srv = json_server_entry("test", "empty", &config);
        assert!(srv.is_none());
    }
}
