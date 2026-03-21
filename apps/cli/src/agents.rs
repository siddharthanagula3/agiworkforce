//! Agent definitions — custom agent personas loaded from markdown files.
//!
//! Agent definitions are markdown files with YAML frontmatter containing
//! name, description, model override, tool restrictions, and other config.
//! They are discovered from:
//! 1. `.agiworkforce/agents/*.md` in the current project
//! 2. `~/.agiworkforce/agents/*.md` (global agents)
//!
//! When loaded via `--agent <name>`, an agent definition overrides session
//! defaults: model, max_turns, permission_mode, tool filtering, and
//! system prompt.

// Module API surface is intentionally broad: used by the REPL /agents command
// and will be wired into the --agent CLI flag. Tests exercise all public items.
#![allow(dead_code)]

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};

/// A loaded agent definition.
#[derive(Debug, Clone)]
pub struct AgentDefinition {
    /// Agent name from frontmatter.
    pub name: String,
    /// Human-readable description from frontmatter.
    pub description: String,
    /// Optional model override (e.g. "claude-sonnet-4-6").
    pub model: Option<String>,
    /// Allowed tools whitelist. When set, only these tools are available.
    pub tools: Option<Vec<String>>,
    /// Disallowed tools blacklist. These tools are removed from the session.
    pub disallowed_tools: Option<Vec<String>>,
    /// Maximum agentic loop iterations.
    pub max_turns: Option<usize>,
    /// Permission mode override (default, accept-edits, plan, bypass-permissions).
    pub permission_mode: Option<String>,
    /// The markdown body after frontmatter — used as the system prompt.
    pub system_prompt: String,
    /// Source file path.
    pub path: PathBuf,
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/// Discover all available agent definitions from project and global directories.
pub fn discover_agents() -> Vec<AgentDefinition> {
    let mut agents = Vec::new();

    // Project-level agents: .agiworkforce/agents/
    if let Ok(cwd) = std::env::current_dir() {
        let project_dir = cwd.join(".agiworkforce").join("agents");
        if project_dir.exists() {
            load_agents_from_dir(&project_dir, &mut agents);
        }
    }

    // Global agents: ~/.agiworkforce/agents/
    if let Ok(config_dir) = crate::config::CliConfig::config_dir() {
        let global_dir = config_dir.join("agents");
        if global_dir.exists() {
            load_agents_from_dir(&global_dir, &mut agents);
        }
    }

    agents
}

/// Load agent definition markdown files from a directory.
fn load_agents_from_dir(dir: &Path, agents: &mut Vec<AgentDefinition>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("md") {
            if let Ok(agent) = load_agent(&path) {
                agents.push(agent);
            }
        }
    }
}

/// Load and parse a single agent definition file.
fn load_agent(path: &Path) -> Result<AgentDefinition> {
    let content = std::fs::read_to_string(path)
        .context(format!("Failed to read agent file: {}", path.display()))?;

    let fm = parse_agent_frontmatter(&content)?;

    Ok(AgentDefinition {
        name: fm.name,
        description: fm.description,
        model: fm.model,
        tools: fm.tools,
        disallowed_tools: fm.disallowed_tools,
        max_turns: fm.max_turns,
        permission_mode: fm.permission_mode,
        system_prompt: fm.body,
        path: path.to_path_buf(),
    })
}

/// Find an agent definition by name (case-insensitive match).
pub fn find_agent(name: &str) -> Option<AgentDefinition> {
    let agents = discover_agents();
    let name_lower = name.to_lowercase();
    agents
        .into_iter()
        .find(|a| a.name.to_lowercase() == name_lower)
}

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

/// Parsed agent frontmatter fields.
struct AgentFrontmatter {
    name: String,
    description: String,
    model: Option<String>,
    tools: Option<Vec<String>>,
    disallowed_tools: Option<Vec<String>>,
    max_turns: Option<usize>,
    permission_mode: Option<String>,
    body: String,
}

/// Parse YAML frontmatter from an agent markdown file.
/// Frontmatter is delimited by `---` lines at the top of the file.
fn parse_agent_frontmatter(content: &str) -> Result<AgentFrontmatter> {
    let trimmed = content.trim_start();

    if !trimmed.starts_with("---") {
        // No frontmatter — use "untitled" as name, whole content as body
        return Ok(AgentFrontmatter {
            name: "untitled".to_string(),
            description: String::new(),
            model: None,
            tools: None,
            disallowed_tools: None,
            max_turns: None,
            permission_mode: None,
            body: content.to_string(),
        });
    }

    // Find the closing ---
    let after_first = &trimmed[3..].trim_start_matches('\n');
    if let Some(end_pos) = after_first.find("\n---") {
        let frontmatter_str = &after_first[..end_pos];
        let body = after_first[end_pos + 4..].trim_start_matches('\n');

        // Simple YAML parsing (extract known fields)
        let mut name = String::new();
        let mut description = String::new();
        let mut model: Option<String> = None;
        let mut tools: Option<Vec<String>> = None;
        let mut disallowed_tools: Option<Vec<String>> = None;
        let mut max_turns: Option<usize> = None;
        let mut permission_mode: Option<String> = None;

        for line in frontmatter_str.lines() {
            let line = line.trim();
            if let Some(val) = line.strip_prefix("name:") {
                name = strip_yaml_quotes(val);
            } else if let Some(val) = line.strip_prefix("description:") {
                description = strip_yaml_quotes(val);
            } else if let Some(val) = line.strip_prefix("model:") {
                let v = strip_yaml_quotes(val);
                if !v.is_empty() {
                    model = Some(v);
                }
            } else if let Some(val) = line.strip_prefix("tools:") {
                tools = Some(parse_yaml_list(val));
            } else if let Some(val) = line.strip_prefix("disallowedTools:") {
                disallowed_tools = Some(parse_yaml_list(val));
            } else if let Some(val) = line.strip_prefix("disallowed_tools:") {
                // Also accept snake_case variant
                disallowed_tools = Some(parse_yaml_list(val));
            } else if let Some(val) = line.strip_prefix("maxTurns:") {
                max_turns = strip_yaml_quotes(val).parse().ok();
            } else if let Some(val) = line.strip_prefix("max_turns:") {
                // Also accept snake_case variant
                max_turns = strip_yaml_quotes(val).parse().ok();
            } else if let Some(val) = line.strip_prefix("permissionMode:") {
                let v = strip_yaml_quotes(val);
                if !v.is_empty() {
                    permission_mode = Some(v);
                }
            } else if let Some(val) = line.strip_prefix("permission_mode:") {
                // Also accept snake_case variant
                let v = strip_yaml_quotes(val);
                if !v.is_empty() {
                    permission_mode = Some(v);
                }
            }
        }

        if name.is_empty() {
            // Derive name from filename
            name = "untitled".to_string();
        }

        Ok(AgentFrontmatter {
            name,
            description,
            model,
            tools,
            disallowed_tools,
            max_turns,
            permission_mode,
            body: body.to_string(),
        })
    } else {
        // Malformed frontmatter — treat entire content as body
        Ok(AgentFrontmatter {
            name: "untitled".to_string(),
            description: String::new(),
            model: None,
            tools: None,
            disallowed_tools: None,
            max_turns: None,
            permission_mode: None,
            body: content.to_string(),
        })
    }
}

/// Strip surrounding single/double quotes and whitespace from a YAML value.
fn strip_yaml_quotes(val: &str) -> String {
    val.trim().trim_matches('"').trim_matches('\'').to_string()
}

/// Parse a YAML inline list: `[item1, item2, item3]` or bare `item1, item2`.
fn parse_yaml_list(val: &str) -> Vec<String> {
    let trimmed = val.trim();
    // Strip surrounding brackets if present
    let inner = trimmed
        .strip_prefix('[')
        .and_then(|s| s.strip_suffix(']'))
        .unwrap_or(trimmed);

    inner
        .split(',')
        .map(strip_yaml_quotes)
        .filter(|s| !s.is_empty())
        .collect()
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/// Format all agent definitions for display (`/agents` command).
pub fn format_agent_list(agents: &[AgentDefinition]) -> String {
    if agents.is_empty() {
        return "No agent definitions found.\n\n\
                Agent directories:\n  \
                .agiworkforce/agents/ (project)\n  \
                ~/.agiworkforce/agents/ (global)"
            .to_string();
    }

    let mut out = String::new();
    for agent in agents {
        let source = if agent
            .path
            .to_string_lossy()
            .contains(".agiworkforce/agents")
        {
            if agent
                .path
                .to_string_lossy()
                .contains("/.agiworkforce/agents")
            {
                // Could be project or global — check if under home dir
                let is_global = dirs::home_dir()
                    .map(|h| agent.path.starts_with(h.join(".agiworkforce")))
                    .unwrap_or(false);
                if is_global {
                    "global"
                } else {
                    "project"
                }
            } else {
                "project"
            }
        } else {
            "project"
        };

        let model_tag = agent
            .model
            .as_deref()
            .map(|m| format!(" model={}", m))
            .unwrap_or_default();
        let turns_tag = agent
            .max_turns
            .map(|n| format!(" max_turns={}", n))
            .unwrap_or_default();

        out.push_str(&format!(
            "  {:<25} {}{}{} [{}]\n",
            agent.name,
            if agent.description.is_empty() {
                "(no description)"
            } else {
                &agent.description
            },
            model_tag,
            turns_tag,
            source,
        ));
    }
    out.push_str(&format!("\n{} agent(s) available.", agents.len()));
    out
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_agent_frontmatter_full() {
        let content = r#"---
name: researcher
description: "Research agent for deep web analysis"
model: claude-sonnet-4-6
tools: [read_file, search_files, web_search, web_fetch]
disallowedTools: [write_file, run_command]
maxTurns: 20
permissionMode: plan
---

You are a research specialist. Your job is to analyze topics deeply."#;

        let fm = parse_agent_frontmatter(content).expect("parse should succeed");
        assert_eq!(fm.name, "researcher");
        assert_eq!(fm.description, "Research agent for deep web analysis");
        assert_eq!(fm.model.as_deref(), Some("claude-sonnet-4-6"));
        assert_eq!(
            fm.tools.as_deref(),
            Some(
                &["read_file", "search_files", "web_search", "web_fetch"]
                    .iter()
                    .map(|s| s.to_string())
                    .collect::<Vec<_>>()[..]
            )
        );
        assert_eq!(
            fm.disallowed_tools.as_deref(),
            Some(
                &["write_file", "run_command"]
                    .iter()
                    .map(|s| s.to_string())
                    .collect::<Vec<_>>()[..]
            )
        );
        assert_eq!(fm.max_turns, Some(20));
        assert_eq!(fm.permission_mode.as_deref(), Some("plan"));
        assert!(fm.body.contains("research specialist"));
    }

    #[test]
    fn test_parse_agent_frontmatter_minimal() {
        let content = "---\nname: helper\n---\n\nJust a helper agent.";
        let fm = parse_agent_frontmatter(content).expect("parse should succeed");
        assert_eq!(fm.name, "helper");
        assert!(fm.description.is_empty());
        assert!(fm.model.is_none());
        assert!(fm.tools.is_none());
        assert!(fm.disallowed_tools.is_none());
        assert!(fm.max_turns.is_none());
        assert!(fm.permission_mode.is_none());
        assert!(fm.body.contains("helper agent"));
    }

    #[test]
    fn test_parse_agent_frontmatter_no_frontmatter() {
        let content = "Just a plain markdown file with no frontmatter.";
        let fm = parse_agent_frontmatter(content).expect("parse should succeed");
        assert_eq!(fm.name, "untitled");
        assert_eq!(fm.body, content);
    }

    #[test]
    fn test_parse_agent_frontmatter_snake_case_variants() {
        let content =
            "---\nname: coder\ndisallowed_tools: [web_search]\nmax_turns: 10\npermission_mode: accept-edits\n---\n\nBody.";
        let fm = parse_agent_frontmatter(content).expect("parse should succeed");
        assert_eq!(fm.name, "coder");
        assert_eq!(
            fm.disallowed_tools.as_deref(),
            Some(&["web_search".to_string()][..])
        );
        assert_eq!(fm.max_turns, Some(10));
        assert_eq!(fm.permission_mode.as_deref(), Some("accept-edits"));
    }

    #[test]
    fn test_parse_yaml_list_bracketed() {
        let result = parse_yaml_list("[read_file, write_file, run_command]");
        assert_eq!(result, vec!["read_file", "write_file", "run_command"]);
    }

    #[test]
    fn test_parse_yaml_list_bare() {
        let result = parse_yaml_list("read_file, write_file");
        assert_eq!(result, vec!["read_file", "write_file"]);
    }

    #[test]
    fn test_parse_yaml_list_quoted() {
        let result = parse_yaml_list("[\"read_file\", 'write_file']");
        assert_eq!(result, vec!["read_file", "write_file"]);
    }

    #[test]
    fn test_parse_yaml_list_empty() {
        let result = parse_yaml_list("[]");
        assert!(result.is_empty());
    }

    #[test]
    fn test_format_agent_list_empty() {
        let out = format_agent_list(&[]);
        assert!(out.contains("No agent definitions found."));
    }

    #[test]
    fn test_format_agent_list_with_agents() {
        let agents = vec![AgentDefinition {
            name: "researcher".to_string(),
            description: "Research agent".to_string(),
            model: Some("claude-sonnet-4-6".to_string()),
            tools: None,
            disallowed_tools: None,
            max_turns: Some(20),
            permission_mode: None,
            system_prompt: "You are a researcher.".to_string(),
            path: PathBuf::from("/tmp/.agiworkforce/agents/researcher.md"),
        }];
        let out = format_agent_list(&agents);
        assert!(out.contains("researcher"));
        assert!(out.contains("Research agent"));
        assert!(out.contains("model=claude-sonnet-4-6"));
        assert!(out.contains("max_turns=20"));
        assert!(out.contains("1 agent(s) available."));
    }

    #[test]
    fn test_discover_agents_no_crash() {
        // Should not crash even if no agent directories exist
        let agents = discover_agents();
        let _ = agents;
    }
}
