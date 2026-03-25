//! Ecosystem scanner — Tauri command for detecting AI tools and IDEs.
//!
//! Mirrors the CLI ecosystem scanner logic so the desktop app can show
//! what tools are installed and offer to import their configurations.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

// ---------------------------------------------------------------------------
// Types (duplicated from CLI to avoid cross-crate dependency)
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
    pub name: String,
    pub source: String,
    pub original_name: String,
    pub command: Option<String>,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
    pub url: Option<String>,
}

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

struct ToolDef {
    name: &'static str,
    home_relative_paths: Vec<&'static str>,
    mcp_relative: Option<&'static str>,
    skills_globs: Vec<&'static str>,
    instructions_relative: Option<&'static str>,
    is_file_check: bool,
}

fn tool_registry() -> Vec<ToolDef> {
    vec![
        ToolDef {
            name: "Claude Code",
            home_relative_paths: vec![".claude"],
            mcp_relative: Some("mcp.json"),
            skills_globs: vec!["plugins/cache/*/skills/*/SKILL.md"],
            instructions_relative: Some("CLAUDE.md"),
            is_file_check: false,
        },
        ToolDef {
            name: "Codex CLI",
            home_relative_paths: vec![".codex"],
            mcp_relative: Some("config.toml"),
            skills_globs: vec![
                "skills/*.md",
                "vendor_imports/skills/skills/.curated/*/SKILL.md",
            ],
            instructions_relative: Some("AGENTS.md"),
            is_file_check: false,
        },
        ToolDef {
            name: "Gemini CLI",
            home_relative_paths: vec![".gemini"],
            mcp_relative: Some("config.yaml"),
            skills_globs: vec!["skills/*/SKILL.md", "commands/*.md"],
            instructions_relative: Some("GEMINI.md"),
            is_file_check: false,
        },
        ToolDef {
            name: "OpenCode",
            home_relative_paths: vec![".config/opencode"],
            mcp_relative: Some("opencode.jsonc"),
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: false,
        },
        ToolDef {
            name: "Copilot CLI",
            home_relative_paths: vec![".copilot"],
            mcp_relative: Some("mcp-config.json"),
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: false,
        },
        ToolDef {
            name: "Aider",
            home_relative_paths: vec![".aider.conf.yml"],
            mcp_relative: None,
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: true,
        },
        ToolDef {
            name: "Continue.dev",
            home_relative_paths: vec![".continue"],
            mcp_relative: Some("config.json"),
            skills_globs: vec!["checks/*.md"],
            instructions_relative: None,
            is_file_check: false,
        },
        ToolDef {
            name: "VS Code",
            #[cfg(target_os = "macos")]
            home_relative_paths: vec![".vscode", "Library/Application Support/Code"],
            #[cfg(not(target_os = "macos"))]
            home_relative_paths: vec![".vscode"],
            mcp_relative: None,
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: false,
        },
        ToolDef {
            name: "Cursor",
            home_relative_paths: vec![".cursor"],
            mcp_relative: Some("mcp.json"),
            skills_globs: vec!["skills-cursor/*/SKILL.md"],
            instructions_relative: None,
            is_file_check: false,
        },
        ToolDef {
            name: "Windsurf",
            home_relative_paths: vec![".windsurf"],
            mcp_relative: None,
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: false,
        },
        ToolDef {
            name: "Zed",
            home_relative_paths: vec![".config/zed"],
            mcp_relative: Some("settings.json"),
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: false,
        },
        ToolDef {
            name: "JetBrains",
            #[cfg(target_os = "macos")]
            home_relative_paths: vec!["Library/Application Support/JetBrains"],
            #[cfg(not(target_os = "macos"))]
            home_relative_paths: vec![".local/share/JetBrains"],
            mcp_relative: None,
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: false,
        },
        ToolDef {
            name: "Cline",
            home_relative_paths: vec![".vscode/extensions"],
            mcp_relative: None,
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: false,
        },
        ToolDef {
            name: "Warp",
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

fn scan_ecosystem() -> Vec<DetectedTool> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return Vec::new(),
    };

    let registry = tool_registry();
    let mut detected = Vec::new();

    for def in &registry {
        // Special handling for Cline
        if def.name == "Cline" {
            if let Some(tool) = detect_cline(&home) {
                detected.push(tool);
            }
            continue;
        }

        let tool_path = def.home_relative_paths.iter().find_map(|rel| {
            let p = home.join(rel);
            if def.is_file_check {
                if p.is_file() { Some(p) } else { None }
            } else if p.is_dir() {
                Some(p)
            } else {
                None
            }
        });

        let tool_path = match tool_path {
            Some(p) => p,
            None => continue,
        };

        let mcp_config_path = def.mcp_relative.and_then(|rel| {
            let p = tool_path.join(rel);
            if p.is_file() { Some(p) } else { None }
        });

        let instructions_path = def.instructions_relative.and_then(|rel| {
            let in_tool = tool_path.join(rel);
            if in_tool.is_file() {
                return Some(in_tool);
            }
            let in_home = home.join(rel);
            if in_home.is_file() {
                return Some(in_home);
            }
            None
        });

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

        let has_skills = !skills_paths.is_empty();

        detected.push(DetectedTool {
            name: def.name.to_string(),
            path: tool_path.clone(),
            has_mcp: mcp_config_path.is_some(),
            has_skills,
            has_instructions: instructions_path.is_some(),
            has_settings: mcp_config_path.is_some(),
            mcp_config_path,
            skills_paths,
            instructions_path,
        });
    }

    detected
}

fn detect_cline(home: &Path) -> Option<DetectedTool> {
    let ext_dir = home.join(".vscode").join("extensions");
    if !ext_dir.is_dir() {
        return None;
    }

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
// Tauri commands
// ---------------------------------------------------------------------------

/// Detect all AI tools and IDEs installed on this machine.
#[tauri::command]
pub async fn detect_ecosystem_tools() -> Result<Vec<DetectedTool>, String> {
    Ok(scan_ecosystem())
}

/// Import MCP server configurations from detected ecosystem tools.
#[tauri::command]
pub async fn import_ecosystem_mcp_servers() -> Result<Vec<ImportedMcpServer>, String> {
    let detected = scan_ecosystem();
    let mut servers = Vec::new();

    for tool in &detected {
        if let Some(ref mcp_path) = tool.mcp_config_path {
            let source = source_id(&tool.name);
            if let Ok(contents) = std::fs::read_to_string(mcp_path) {
                let ext = mcp_path
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("");
                match ext {
                    "toml" => {
                        if let Ok(parsed) = contents.parse::<toml::Value>() {
                            if let Some(tbl) =
                                parsed.get("mcp_servers").and_then(|v| v.as_table())
                            {
                                for (name, config) in tbl {
                                    if let Some(srv) =
                                        toml_server_entry(&source, name, config)
                                    {
                                        servers.push(srv);
                                    }
                                }
                            }
                        }
                    }
                    _ => {
                        if let Ok(parsed) =
                            serde_json::from_str::<serde_json::Value>(&contents)
                        {
                            for key in &["mcpServers", "context_servers"] {
                                if let Some(obj) =
                                    parsed.get(*key).and_then(|v| v.as_object())
                                {
                                    for (name, config) in obj {
                                        if let Some(srv) =
                                            json_server_entry(&source, name, config)
                                        {
                                            servers.push(srv);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(servers)
}

fn source_id(name: &str) -> String {
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

fn json_server_entry(
    source: &str,
    name: &str,
    config: &serde_json::Value,
) -> Option<ImportedMcpServer> {
    let command = config.get("command").and_then(|v| v.as_str()).map(String::from);
    let url = config.get("url").and_then(|v| v.as_str()).map(String::from);

    if command.is_none() && url.is_none() {
        return None;
    }

    let args: Vec<String> = config
        .get("args")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
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

fn toml_server_entry(
    source: &str,
    name: &str,
    config: &toml::Value,
) -> Option<ImportedMcpServer> {
    let command = config.get("command").and_then(|v| v.as_str()).map(String::from);
    let url = config.get("url").and_then(|v| v.as_str()).map(String::from);

    if command.is_none() && url.is_none() {
        return None;
    }

    let args: Vec<String> = config
        .get("args")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
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
