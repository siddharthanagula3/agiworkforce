
// Module API surface is intentionally broad: used by the REPL /agents command
// and the --agent CLI flag. Tests exercise all public items.

use anyhow::{bail, Context, Result};
use std::path::{Path, PathBuf};

/// A loaded agent definition.
#[derive(Debug, Clone)]
pub struct AgentDefinition {
    /// Agent name from frontmatter.
    pub name: String,
    /// Human-readable description from frontmatter.
    pub description: String,
    /// Optional model override selected by the user or inherited from a catalog route.
    pub model: Option<String>,
    /// Allowed tools whitelist. When set, only these tools are available.
    pub tools: Option<Vec<String>>,
    /// Disallowed tools blacklist. These tools are removed from the session.
    pub disallowed_tools: Option<Vec<String>>,
    /// Maximum agentic loop iterations.
    pub max_turns: Option<usize>,
    /// Permission mode override (default, accept-edits, plan, bypass-permissions).
    pub permission_mode: Option<String>,
    pub system_prompt: String,
    /// Source file path.
    pub path: PathBuf,
}

impl AgentDefinition {
    /// Apply this agent definition's overrides to an `AgentSession`.
    ///
    /// The following fields are applied when set:
    /// - `model`: calls `session.switch_model()`
    /// - `tools`: sets `session.allowed_tools` (whitelist)
    /// - `disallowed_tools`: appends to `session.disallowed_tools`
    /// - `max_turns`: sets `session.max_turns`
    /// - `permission_mode`: sets `session.permission_mode`
    /// - `system_prompt`: injects as a "system" context message
    ///
    /// This method does NOT clear the existing conversation history, so callers
    /// may prepend agent context to an ongoing session.
    pub fn apply_to_session(&self, session: &mut crate::agent::AgentSession) {
        if let Some(ref model) = self.model {
            if !model.is_empty() {
                if let Err(err) = session.switch_model(model) {
                    eprintln!(
                        "Agent `{}` model override ignored: {}",
                        crate::terminal_text::sanitize_terminal_text(&self.name),
                        crate::terminal_text::sanitize_terminal_text(&err.to_string())
                    );
                }
            }
        }
        if let Some(ref tools) = self.tools {
            if !tools.is_empty() {
                session.allowed_tools = Some(tools.clone());
            }
        }
        if let Some(ref disallowed) = self.disallowed_tools {
            for t in disallowed {
                if !session.disallowed_tools.contains(t) {
                    session.disallowed_tools.push(t.clone());
                }
            }
        }
        if let Some(max_turns) = self.max_turns {
            session.max_turns = Some(max_turns);
        }
        if let Some(ref perm) = self.permission_mode {
            use crate::cli_options::PermissionMode;
            let mode = match perm.as_str() {
                "plan" => Some(PermissionMode::Plan),
                "acceptEdits" | "accept-edits" => Some(PermissionMode::AcceptEdits),
                "bypassPermissions" | "bypass-permissions" => {
                    Some(PermissionMode::BypassPermissions)
                }
                "dontAsk" | "dont-ask" => Some(PermissionMode::DontAsk),
                _ => None,
            };
            if let Some(m) = mode {
                session.permission_mode = m;
            }
        }
        if !self.system_prompt.trim().is_empty() {
            use crate::models::Message;
            session.messages.push(Message::text(
                "system",
                format!(
                    "<agent_system_prompt agent=\"{}\">\n{}\n</agent_system_prompt>",
                    self.name,
                    self.system_prompt.trim()
                ),
            ));
        }
    }

    /// Apply a named agent to a model-spawned subagent without allowing the
    /// definition to widen the parent session's authority.
    ///
    /// Model and permission-mode overrides are intentionally ignored here:
    /// choosing a different egress/billing boundary or bypassing approvals is
    /// a user action. Tool allowlists are intersected with the inherited parent
    /// allowlist, denylists are unioned, and max turns can only be reduced.
    pub fn apply_to_subagent_session(&self, session: &mut crate::agent::AgentSession) {
        if let Some(ref tools) = self.tools {
            session.allowed_tools = Some(match session.allowed_tools.take() {
                Some(parent_tools) => parent_tools
                    .into_iter()
                    .filter(|tool| tools.iter().any(|allowed| allowed == tool))
                    .collect(),
                None => tools.clone(),
            });
        }
        if let Some(ref disallowed) = self.disallowed_tools {
            for tool in disallowed {
                if !session.disallowed_tools.contains(tool) {
                    session.disallowed_tools.push(tool.clone());
                }
            }
        }
        if let Some(max_turns) = self.max_turns {
            session.max_turns = Some(
                session
                    .max_turns
                    .map_or(max_turns, |parent_limit| parent_limit.min(max_turns)),
            );
        }
        if !self.system_prompt.trim().is_empty() {
            use crate::models::Message;
            session.messages.push(Message::text(
                "system",
                format!(
                    "<agent_system_prompt agent=\"{}\">\n{}\n</agent_system_prompt>",
                    self.name,
                    self.system_prompt.trim()
                ),
            ));
        }
    }
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/// Discover all available agent definitions from project and global directories.
///
/// Discovery order (later entries can shadow earlier ones by name):
/// 1. `.agiworkforce/agents/` in the current project directory
/// 2. `.claude/agents/` in the current project directory (Claude Code compat)
/// 3. `~/.agiworkforce/agents/` global agents
/// 4. `~/.claude/agents/` global agents (Claude Code compat)
/// 5. Plugin-declared agent paths (via installed plugin manifests)
pub fn discover_agents() -> Vec<AgentDefinition> {
    let mut agents = Vec::new();

    // Project-level agents: .agiworkforce/agents/ and .claude/agents/
    if let Ok(cwd) = std::env::current_dir() {
        let agi_dir = cwd.join(".agiworkforce").join("agents");
        if agi_dir.exists() {
            load_agents_from_dir(&agi_dir, &mut agents);
        }
        let claude_dir = cwd.join(".claude").join("agents");
        if claude_dir.exists() {
            load_agents_from_dir(&claude_dir, &mut agents);
        }
    }

    // Global agents: ~/.agiworkforce/agents/ and ~/.claude/agents/
    if let Ok(config_dir) = crate::config::CliConfig::config_dir() {
        let global_dir = config_dir.join("agents");
        if global_dir.exists() {
            load_agents_from_dir(&global_dir, &mut agents);
        }
    }
    if let Some(home) = dirs::home_dir() {
        let claude_global = home.join(".claude").join("agents");
        if claude_global.exists() {
            load_agents_from_dir(&claude_global, &mut agents);
        }
    }

    // Plugin-declared agent paths
    let mut plugins_mgr = crate::plugins::PluginsManager::new();
    if plugins_mgr
        .load_all(std::env::current_dir().ok().as_deref())
        .is_ok()
    {
        for entry in plugins_mgr.agent_path_entries() {
            let plugin_root = entry.plugin_root;
            let path = entry.path;
            if !crate::plugins::plugin_path_stays_within_root(&plugin_root, &path) {
                continue;
            }
            if path.is_dir() {
                load_agents_from_plugin_dir(&path, &plugin_root, &mut agents);
            } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
                if let Ok(agent) = load_agent(&path) {
                    agents.push(agent);
                }
            }
        }
    }

    agents
}

/// Load agent definition markdown files from a directory.
fn load_agents_from_dir(dir: &Path, agents: &mut Vec<AgentDefinition>) {
    load_agents_from_dir_depth(dir, agents, 0);
}

fn load_agents_from_plugin_dir(dir: &Path, plugin_root: &Path, agents: &mut Vec<AgentDefinition>) {
    load_agents_from_plugin_dir_depth(dir, plugin_root, agents, 0);
}

fn load_agents_from_dir_depth(dir: &Path, agents: &mut Vec<AgentDefinition>, depth: usize) {
    if depth > 6 {
        return;
    }

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    let mut paths: Vec<PathBuf> = entries.flatten().map(|entry| entry.path()).collect();
    paths.sort();

    for path in paths {
        if path.is_dir() {
            load_agents_from_dir_depth(&path, agents, depth + 1);
            continue;
        }

        if path.extension().and_then(|e| e.to_str()) == Some("md") {
            if let Ok(agent) = load_agent(&path) {
                agents.push(agent);
            }
        }
    }
}

fn load_agents_from_plugin_dir_depth(
    dir: &Path,
    plugin_root: &Path,
    agents: &mut Vec<AgentDefinition>,
    depth: usize,
) {
    if depth > 6 || !crate::plugins::plugin_path_stays_within_root(plugin_root, dir) {
        return;
    }

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    let mut paths: Vec<PathBuf> = entries.flatten().map(|entry| entry.path()).collect();
    paths.sort();

    for path in paths {
        if !crate::plugins::plugin_path_stays_within_root(plugin_root, &path) {
            continue;
        }
        if path.is_dir() {
            load_agents_from_plugin_dir_depth(&path, plugin_root, agents, depth + 1);
            continue;
        }

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

/// Find an agent using an exact, case-sensitive installed name. Model tool
/// calls use this stricter resolver so the catalog output is authoritative.
pub fn find_agent_exact(name: &str) -> Option<AgentDefinition> {
    discover_agents()
        .into_iter()
        .find(|agent| agent.name == name)
}

/// Return bounded metadata for the model-callable `agent` tool. Prompt bodies,
/// paths, model overrides, and permission modes are deliberately withheld.
pub fn agent_tool_catalog() -> String {
    const MAX_CATALOG_BYTES: usize = 18_000;
    let discovered = discover_agents();
    let available_count = discovered.len();
    let mut agents = Vec::new();
    let mut truncated = available_count > 200;
    for agent in discovered.into_iter().take(200) {
        agents.push(serde_json::json!({
            "name": agent.name.chars().take(128).collect::<String>(),
            "description": agent.description.chars().take(500).collect::<String>(),
            "has_tool_allowlist": agent.tools.as_ref().is_some_and(|tools| !tools.is_empty()),
            "max_turns": agent.max_turns,
        }));
        let candidate = serde_json::json!({
            "untrusted": true,
            "agents": agents,
            "count": agents.len(),
            "available_count": available_count,
            "truncated": truncated,
        })
        .to_string();
        if candidate.len() > MAX_CATALOG_BYTES {
            agents.pop();
            truncated = true;
            break;
        }
    }
    let count = agents.len();
    serde_json::json!({
        "untrusted": true,
        "agents": agents,
        "count": count,
        "available_count": available_count,
        "truncated": truncated,
    })
    .to_string()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AgentScope {
    Project,
    Global,
}

impl AgentScope {
    fn from_flags(tokens: &[&str]) -> Self {
        if tokens
            .iter()
            .any(|token| matches!(*token, "--global" | "-g"))
        {
            Self::Global
        } else {
            Self::Project
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Project => "project",
            Self::Global => "global",
        }
    }
}

/// Render the `/agents` management command.
pub fn render_agents_command(arg: &str) -> String {
    let tokens: Vec<&str> = arg.split_whitespace().collect();
    let subcommand = tokens
        .first()
        .copied()
        .unwrap_or("list")
        .to_ascii_lowercase();

    match subcommand.as_str() {
        "" | "list" | "ls" => format_agents_overview(&discover_agents()),
        "help" | "-h" | "--help" => render_agents_help(),
        "show" | "view" | "inspect" => match first_non_flag(&tokens[1..]) {
            Some(name) => match find_agent(name) {
                Some(agent) => format_agent_detail(&agent),
                None => format!("Agent `{name}` was not found.\n\n{}", render_agents_help()),
            },
            None => "Usage: /agents show <name>".to_string(),
        },
        "path" | "where" => match first_non_flag(&tokens[1..]) {
            Some(name) => match find_agent(name) {
                Some(agent) => agent.path.display().to_string(),
                None => format!("Agent `{name}` was not found."),
            },
            None => "Usage: /agents path <name>".to_string(),
        },
        "new" | "create" | "init" => {
            let scope = AgentScope::from_flags(&tokens[1..]);
            match first_non_flag(&tokens[1..]) {
                Some(name) => match create_agent_template(name, scope) {
                    Ok(path) => format!(
                        "Created {} agent `{}` at {}",
                        scope.label(),
                        name,
                        path.display()
                    ),
                    Err(err) => format!("Failed to create agent `{name}`: {err:#}"),
                },
                None => "Usage: /agents create <name> [--global]".to_string(),
            }
        }
        "validate" | "doctor" | "check" => format_agent_validation(&discover_agents()),
        maybe_name => match find_agent(maybe_name) {
            Some(agent) => format_agent_detail(&agent),
            None => format!(
                "Unknown /agents command `{maybe_name}`.\n\n{}",
                render_agents_help()
            ),
        },
    }
}

fn first_non_flag<'a>(tokens: &'a [&'a str]) -> Option<&'a str> {
    tokens.iter().copied().find(|token| !token.starts_with('-'))
}

fn render_agents_help() -> String {
    [
        "Agents",
        "  /agents                  list project and global agents",
        "  /agents show <name>      show metadata and prompt body",
        "  /agents path <name>      print the backing markdown path",
        "  /agents create <name>    create .agiworkforce/agents/<name>.md",
        "  /agents create <name> --global",
        "  /agents validate         report duplicate or incomplete agents",
    ]
    .join("\n")
}

fn format_agents_overview(agents: &[AgentDefinition]) -> String {
    if agents.is_empty() {
        return [
            "Agents",
            "  none discovered",
            "  project: .agiworkforce/agents/",
            "  global:  ~/.agiworkforce/agents/",
            "",
            "Create one with: /agents create <name>",
        ]
        .join("\n");
    }

    let mut lines = vec![format!("Agents ({})", agents.len())];
    lines.push(format!(
        "  {:<24} {:<9} {:<18} {}",
        "name", "scope", "model", "description"
    ));
    for agent in agents {
        let model = agent.model.as_deref().unwrap_or("default model");
        let description = if agent.description.trim().is_empty() {
            "no description"
        } else {
            agent.description.trim()
        };
        lines.push(format!(
            "  {:<24} {:<9} {:<18} {}",
            agent.name,
            agent_source(agent),
            model,
            description
        ));
    }
    lines.push(String::new());
    lines.push("Manage: /agents show <name> | /agents create <name> | /agents validate".into());
    lines.join("\n")
}

fn format_agent_detail(agent: &AgentDefinition) -> String {
    let mut lines = vec![format!("Agent: {}", agent.name)];
    lines.push(format!("  scope: {}", agent_source(agent)));
    lines.push(format!("  path: {}", agent.path.display()));
    lines.push(format!(
        "  description: {}",
        empty_as(agent.description.trim(), "none")
    ));
    lines.push(format!(
        "  model: {}",
        agent.model.as_deref().unwrap_or("default model")
    ));
    if let Some(max_turns) = agent.max_turns {
        lines.push(format!("  max_turns: {max_turns}"));
    }
    if let Some(permission_mode) = agent.permission_mode.as_deref() {
        lines.push(format!("  permission_mode: {permission_mode}"));
    }
    if let Some(tools) = agent.tools.as_ref().filter(|tools| !tools.is_empty()) {
        lines.push(format!("  tools: {}", tools.join(", ")));
    }
    if let Some(tools) = agent
        .disallowed_tools
        .as_ref()
        .filter(|tools| !tools.is_empty())
    {
        lines.push(format!("  disallowed_tools: {}", tools.join(", ")));
    }
    lines.push(String::new());
    lines.push("Prompt:".into());
    lines.push(indent_block(
        empty_as(agent.system_prompt.trim(), "(empty)"),
        "  ",
    ));
    lines.join("\n")
}

fn format_agent_validation(agents: &[AgentDefinition]) -> String {
    let mut issues = Vec::new();
    let mut names = std::collections::HashMap::<String, Vec<&AgentDefinition>>::new();

    for agent in agents {
        names
            .entry(agent.name.to_ascii_lowercase())
            .or_default()
            .push(agent);
        if agent.name.trim().is_empty() || agent.name == "untitled" {
            issues.push(format!(
                "{}: missing explicit `name` frontmatter",
                agent.path.display()
            ));
        }
        if agent.description.trim().is_empty() {
            issues.push(format!("{}: missing `description`", agent.path.display()));
        }
        if agent.system_prompt.trim().is_empty() {
            issues.push(format!("{}: empty prompt body", agent.path.display()));
        }
        if let Some(permission_mode) = agent.permission_mode.as_deref() {
            if !valid_permission_mode(permission_mode) {
                issues.push(format!(
                    "{}: unknown permission_mode `{}`",
                    agent.path.display(),
                    permission_mode
                ));
            }
        }
    }

    // Deterministic ordering (AC-19): HashMap iteration is randomized per process,
    // so emit duplicate-name issues sorted by name. Without this, `agents
    // validate|doctor|check` prints the duplicate lines in a different order across
    // runs. The per-agent issues above already iterate the input slice in order, and
    // each group's `matches` preserves input order, so this makes the output fully
    // deterministic.
    let mut duplicate_groups: Vec<(String, Vec<&AgentDefinition>)> = names
        .into_iter()
        .filter(|(_, matches)| matches.len() > 1)
        .collect();
    duplicate_groups.sort_by(|a, b| a.0.cmp(&b.0));
    for (name, matches) in duplicate_groups {
        let paths = matches
            .iter()
            .map(|agent| agent.path.display().to_string())
            .collect::<Vec<_>>()
            .join(", ");
        issues.push(format!("duplicate agent name `{name}`: {paths}"));
    }

    if issues.is_empty() {
        format!("Agents validation passed ({} checked).", agents.len())
    } else {
        let mut lines = vec![format!(
            "Agents validation found {} issue(s):",
            issues.len()
        )];
        lines.extend(issues.into_iter().map(|issue| format!("  - {issue}")));
        lines.join("\n")
    }
}

fn valid_permission_mode(value: &str) -> bool {
    matches!(
        value,
        "default"
            | "plan"
            | "acceptEdits"
            | "accept-edits"
            | "bypassPermissions"
            | "bypass-permissions"
            | "dontAsk"
            | "dont-ask"
    )
}

fn create_agent_template(name: &str, scope: AgentScope) -> Result<PathBuf> {
    let dir = match scope {
        AgentScope::Project => project_agents_dir()?,
        AgentScope::Global => global_agents_dir()?,
    };
    create_agent_template_in_dir(name, &dir)
}

fn create_agent_template_in_dir(name: &str, dir: &Path) -> Result<PathBuf> {
    let slug = slugify_agent_name(name);
    if slug.is_empty() {
        bail!("agent name must contain at least one letter or number");
    }

    std::fs::create_dir_all(dir)
        .with_context(|| format!("Failed to create agent directory {}", dir.display()))?;
    let path = dir.join(format!("{slug}.md"));
    if path.exists() {
        bail!("{} already exists", path.display());
    }

    let display_name = name.trim();
    let content = format!(
        "---\nname: {slug}\ndescription: \"{display_name} specialist\"\nmodel:\ntools: []\ndisallowedTools: []\nmaxTurns: 20\npermissionMode: default\n---\n\nYou are {display_name}. Define the exact responsibilities, workflows, and constraints for this agent before using it in production.\n"
    );
    std::fs::write(&path, content)
        .with_context(|| format!("Failed to write agent template {}", path.display()))?;
    Ok(path)
}

fn slugify_agent_name(name: &str) -> String {
    let mut out = String::new();
    let mut last_dash = false;
    for ch in name.trim().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            last_dash = false;
        } else if matches!(ch, '-' | '_' | ' ' | '/' | ':') && !last_dash && !out.is_empty() {
            out.push('-');
            last_dash = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    out
}

fn project_agents_dir() -> Result<PathBuf> {
    Ok(std::env::current_dir()?
        .join(".agiworkforce")
        .join("agents"))
}

fn global_agents_dir() -> Result<PathBuf> {
    Ok(crate::config::CliConfig::config_dir()?.join("agents"))
}

fn agent_source(agent: &AgentDefinition) -> &'static str {
    agent_scope_label(agent)
}

/// Classify an agent as "global", "claude-global", or "project" based on its
/// backing file path. Public so TUI widgets can display the scope badge.
pub fn agent_scope_label(agent: &AgentDefinition) -> &'static str {
    // ~/.agiworkforce/agents/
    if crate::config::CliConfig::config_dir()
        .map(|dir| agent.path.starts_with(dir.join("agents")))
        .unwrap_or(false)
    {
        return "global";
    }
    // ~/.claude/agents/
    if dirs::home_dir()
        .map(|h| agent.path.starts_with(h.join(".claude").join("agents")))
        .unwrap_or(false)
    {
        return "claude-global";
    }
    "project"
}

fn empty_as<'a>(value: &'a str, fallback: &'a str) -> &'a str {
    if value.is_empty() {
        fallback
    } else {
        value
    }
}

fn indent_block(value: &str, indent: &str) -> String {
    value
        .lines()
        .map(|line| format!("{indent}{line}"))
        .collect::<Vec<_>>()
        .join("\n")
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

/// Render the `/subagents` management view: each configured subagent
/// (agent definition) with its model override, tool restrictions, and the
/// description that tells the model when to use it. Read-only.
pub fn format_subagents(agents: &[AgentDefinition]) -> String {
    if agents.is_empty() {
        return "No configured subagents found.\n\n\
                Define subagents as agent files in:\n  \
                .agiworkforce/agents/ or .claude/agents/ (project)\n  \
                ~/.agiworkforce/agents/ or ~/.claude/agents/ (global)"
            .to_string();
    }

    let mut lines = vec![format!("Configured subagents ({})", agents.len())];
    for agent in agents {
        lines.push(String::new());
        lines.push(format!("  {}", agent.name));
        let when = if agent.description.trim().is_empty() {
            "(no description, add one so the model knows when to delegate)"
        } else {
            agent.description.trim()
        };
        lines.push(format!("    when to use: {when}"));
        lines.push(format!(
            "    model:       {}",
            agent.model.as_deref().unwrap_or("(inherits parent)")
        ));
        let tools = match &agent.tools {
            Some(list) if !list.is_empty() => list.join(", "),
            _ => "(inherits parent toolset)".to_string(),
        };
        lines.push(format!("    tools:       {tools}"));
        if let Some(disallowed) = &agent.disallowed_tools {
            if !disallowed.is_empty() {
                lines.push(format!("    disallowed:  {}", disallowed.join(", ")));
            }
        }
        if let Some(mode) = &agent.permission_mode {
            lines.push(format!("    permission:  {mode}"));
        }
    }
    lines.join("\n")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_subagents_renders_model_tools_and_when_to_use() {
        let agents = vec![
            AgentDefinition {
                name: "researcher".to_string(),
                description: "Use for deep multi-source research".to_string(),
                model: Some("fixture-agent-model".to_string()),
                tools: Some(vec!["web_search".to_string(), "read_file".to_string()]),
                disallowed_tools: None,
                max_turns: Some(20),
                permission_mode: Some("plan".to_string()),
                system_prompt: "You research.".to_string(),
                path: std::path::PathBuf::from(".agiworkforce/agents/researcher.md"),
            },
            AgentDefinition {
                name: "minimal".to_string(),
                description: String::new(),
                model: None,
                tools: None,
                disallowed_tools: None,
                max_turns: None,
                permission_mode: None,
                system_prompt: String::new(),
                path: std::path::PathBuf::from(".agiworkforce/agents/minimal.md"),
            },
        ];

        let out = format_subagents(&agents);
        assert!(out.contains("Configured subagents (2)"), "{out}");
        assert!(out.contains("researcher"), "{out}");
        assert!(
            out.contains("when to use: Use for deep multi-source research"),
            "{out}"
        );
        assert!(out.contains("model:       fixture-agent-model"), "{out}");
        assert!(out.contains("web_search, read_file"), "{out}");
        assert!(out.contains("permission:  plan"), "{out}");
        // Minimal agent falls back to inherited defaults, not fabricated data.
        assert!(out.contains("model:       (inherits parent)"), "{out}");
        assert!(
            out.contains("tools:       (inherits parent toolset)"),
            "{out}"
        );
    }

    #[test]
    fn format_subagents_handles_empty() {
        assert!(format_subagents(&[]).contains("No configured subagents found."));
    }

    #[test]
    fn test_parse_agent_frontmatter_full() {
        let content = r#"---
name: researcher
description: "Research agent for deep web analysis"
model: fixture-agent-model
tools: [read_file, search_files, web_search, web_fetch]
disallowedTools: [write_file, run_command]
maxTurns: 20
permissionMode: plan
---

You are a research specialist. Your job is to analyze topics deeply."#;

        let fm = parse_agent_frontmatter(content).expect("parse should succeed");
        assert_eq!(fm.name, "researcher");
        assert_eq!(fm.description, "Research agent for deep web analysis");
        assert_eq!(fm.model.as_deref(), Some("fixture-agent-model"));
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
        let content = "---\nname: coder\ndisallowed_tools: [web_search]\nmax_turns: 10\npermission_mode: accept-edits\n---\n\nBody.";
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
            model: Some("fixture-agent-model".to_string()),
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
        assert!(out.contains("model=fixture-agent-model"));
        assert!(out.contains("max_turns=20"));
        assert!(out.contains("1 agent(s) available."));
    }

    #[test]
    fn test_load_agents_from_dir_recurses_for_imported_claude_agents() {
        let temp = tempfile::tempdir().expect("tempdir");
        let nested = temp.path().join("claude").join("team");
        std::fs::create_dir_all(&nested).expect("nested dir");
        std::fs::write(
            nested.join("explorer.md"),
            "---\nname: explorer\ndescription: Explore code\n---\n\nRead-only mapping agent.",
        )
        .expect("agent file");

        let mut agents = Vec::new();
        load_agents_from_dir(temp.path(), &mut agents);

        assert_eq!(agents.len(), 1);
        assert_eq!(agents[0].name, "explorer");
        assert!(agents[0].path.ends_with("explorer.md"));
    }

    #[test]
    fn test_create_agent_template_in_dir_slugifies_name() {
        let temp = tempfile::tempdir().expect("tempdir");

        let path = create_agent_template_in_dir("QA Reviewer", temp.path()).expect("create agent");

        assert_eq!(
            path.file_name().and_then(|n| n.to_str()),
            Some("qa-reviewer.md")
        );
        let agent = load_agent(&path).expect("load created agent");
        assert_eq!(agent.name, "qa-reviewer");
        assert_eq!(agent.max_turns, Some(20));
        assert!(agent.system_prompt.contains("QA Reviewer"));
    }

    #[test]
    fn test_format_agent_detail_includes_operational_fields() {
        let agent = AgentDefinition {
            name: "reviewer".to_string(),
            description: "Review code".to_string(),
            model: Some("fixture-agent-model".to_string()),
            tools: Some(vec!["read_file".to_string()]),
            disallowed_tools: Some(vec!["run_command".to_string()]),
            max_turns: Some(12),
            permission_mode: Some("plan".to_string()),
            system_prompt: "You review code.".to_string(),
            path: PathBuf::from("/tmp/project/.agiworkforce/agents/reviewer.md"),
        };

        let out = format_agent_detail(&agent);

        assert!(out.contains("Agent: reviewer"));
        assert!(out.contains("model: fixture-agent-model"));
        assert!(out.contains("permission_mode: plan"));
        assert!(out.contains("disallowed_tools: run_command"));
        assert!(out.contains("You review code."));
    }

    #[test]
    fn test_format_agent_validation_reports_duplicates_and_bad_modes() {
        let agents = vec![
            AgentDefinition {
                name: "dupe".to_string(),
                description: String::new(),
                model: None,
                tools: None,
                disallowed_tools: None,
                max_turns: None,
                permission_mode: Some("wild".to_string()),
                system_prompt: String::new(),
                path: PathBuf::from("/tmp/a.md"),
            },
            AgentDefinition {
                name: "DUPE".to_string(),
                description: "Duplicate".to_string(),
                model: None,
                tools: None,
                disallowed_tools: None,
                max_turns: None,
                permission_mode: None,
                system_prompt: "Body".to_string(),
                path: PathBuf::from("/tmp/b.md"),
            },
        ];

        let out = format_agent_validation(&agents);

        assert!(out.contains("duplicate agent name `dupe`"));
        assert!(out.contains("missing `description`"));
        assert!(out.contains("empty prompt body"));
        assert!(out.contains("unknown permission_mode `wild`"));
    }

    #[test]
    fn test_format_agent_validation_orders_duplicate_names_deterministically() {
        let mk = |name: &str, path: &str| AgentDefinition {
            name: name.to_string(),
            description: "d".to_string(),
            model: None,
            tools: None,
            disallowed_tools: None,
            max_turns: None,
            permission_mode: None,
            system_prompt: "Body".to_string(),
            path: PathBuf::from(path),
        };
        let agents = vec![
            mk("zebra", "/tmp/z1.md"),
            mk("zebra", "/tmp/z2.md"),
            mk("alpha", "/tmp/a1.md"),
            mk("alpha", "/tmp/a2.md"),
        ];

        let out = format_agent_validation(&agents);
        let alpha_idx = out
            .find("duplicate agent name `alpha`")
            .expect("alpha duplicate line present");
        let zebra_idx = out
            .find("duplicate agent name `zebra`")
            .expect("zebra duplicate line present");
        assert!(
            alpha_idx < zebra_idx,
            "duplicate-name issues must be name-sorted (alpha before zebra) for deterministic CLI output; got:\n{out}"
        );
    }

    #[test]
    fn test_discover_agents_no_crash() {
        // Should not crash even if no agent directories exist
        let agents = discover_agents();
        let _ = agents;
    }

    #[test]
    fn test_discover_agents_finds_claude_agents_dir() {
        // Verify that .claude/agents/ is discovered as a root (not only .agiworkforce/agents/).
        let temp = tempfile::tempdir().expect("tempdir");
        let claude_dir = temp.path().join(".claude").join("agents");
        std::fs::create_dir_all(&claude_dir).expect("create .claude/agents/");
        std::fs::write(
            claude_dir.join("compat-agent.md"),
            "---\nname: compat-agent\ndescription: Claude-compat\n---\n\nBody.",
        )
        .expect("write agent");

        let mut agents = Vec::new();
        load_agents_from_dir(&claude_dir, &mut agents);
        assert_eq!(agents.len(), 1);
        assert_eq!(agents[0].name, "compat-agent");
    }

    #[test]
    fn test_agent_scope_label_project() {
        let agent = AgentDefinition {
            name: "test".to_string(),
            description: String::new(),
            model: None,
            tools: None,
            disallowed_tools: None,
            max_turns: None,
            permission_mode: None,
            system_prompt: String::new(),
            path: PathBuf::from("/some/project/.agiworkforce/agents/test.md"),
        };
        assert_eq!(agent_scope_label(&agent), "project");
    }

    fn make_test_context() -> crate::context::SystemContext {
        crate::context::SystemContext {
            cwd: "/tmp".to_string(),
            git_branch: None,
            git_status_summary: None,
            git_remote_url: None,
            project_type: None,
            project_language: None,
            ci_providers: vec![],
            monorepo_type: None,
            package_manager: None,
            containerization: vec![],
            editor_configs: vec![],
            os: "test".to_string(),
            shell: "test".to_string(),
        }
    }

    #[test]
    fn test_apply_to_session_sets_model_and_tools() {
        let ctx = make_test_context();
        let mut session = crate::agent::AgentSession::new("fixture-parent-model", &ctx, None);
        let agent = AgentDefinition {
            name: "test-agent".to_string(),
            description: "Test".to_string(),
            model: None,
            tools: Some(vec!["read_file".to_string()]),
            disallowed_tools: Some(vec!["run_command".to_string()]),
            max_turns: Some(5),
            permission_mode: Some("plan".to_string()),
            system_prompt: "You are a test agent.".to_string(),
            path: PathBuf::from("/tmp/test-agent.md"),
        };

        agent.apply_to_session(&mut session);

        assert_eq!(
            session.allowed_tools.as_deref(),
            Some(&["read_file".to_string()][..])
        );
        assert!(session
            .disallowed_tools
            .contains(&"run_command".to_string()));
        assert_eq!(session.max_turns, Some(5));
        assert!(matches!(
            session.permission_mode,
            crate::cli_options::PermissionMode::Plan
        ));
        // System prompt injected as a system message
        let has_prompt = session
            .messages
            .iter()
            .any(|m| m.role == "system" && m.text_content().contains("You are a test agent."));
        assert!(
            has_prompt,
            "apply_to_session should inject system prompt message"
        );
    }

    #[test]
    fn test_apply_to_session_with_model_override() {
        let ctx = make_test_context();
        let models = crate::model_catalog::models_for("anthropic");
        let parent_model = models
            .first()
            .expect("catalog must contain an Anthropic parent model")
            .id
            .clone();
        let override_model = models
            .iter()
            .find(|model| model.id != parent_model)
            .expect("catalog must contain a distinct Anthropic override model")
            .id
            .clone();
        let mut session = crate::agent::AgentSession::new(&parent_model, &ctx, None);
        let initial_model = session.model.clone();

        let agent = AgentDefinition {
            name: "model-override-agent".to_string(),
            description: "Test".to_string(),
            model: Some(override_model.clone()),
            tools: None,
            disallowed_tools: None,
            max_turns: None,
            permission_mode: None,
            system_prompt: String::new(),
            path: PathBuf::from("/tmp/model-override.md"),
        };

        agent.apply_to_session(&mut session);
        assert_ne!(session.model, initial_model);
        assert_eq!(session.model, override_model);
    }

    #[test]
    fn model_invoked_agent_can_only_narrow_parent_authority() {
        let ctx = make_test_context();
        let mut session = crate::agent::AgentSession::new("fixture-parent-model", &ctx, None);
        session.allowed_tools = Some(vec!["read_file".to_string(), "write_file".to_string()]);
        session.disallowed_tools = vec!["web_fetch".to_string()];
        session.max_turns = Some(15);
        let original_model = session.model.clone();
        let original_permission_mode = session.permission_mode;

        let agent = AgentDefinition {
            name: "reviewer".to_string(),
            description: "Review safely".to_string(),
            model: Some("fixture-override-model".to_string()),
            tools: Some(vec!["read_file".to_string(), "run_command".to_string()]),
            disallowed_tools: Some(vec!["write_file".to_string()]),
            max_turns: Some(20),
            permission_mode: Some("bypassPermissions".to_string()),
            system_prompt: "Review the requested change.".to_string(),
            path: PathBuf::from("/tmp/reviewer.md"),
        };

        agent.apply_to_subagent_session(&mut session);

        assert_eq!(
            session.model, original_model,
            "model override must be ignored"
        );
        assert_eq!(session.permission_mode, original_permission_mode);
        assert_eq!(
            session.allowed_tools,
            Some(vec!["read_file".to_string()]),
            "named agent allowlist must intersect the parent allowlist"
        );
        assert_eq!(session.max_turns, Some(15), "turn limit cannot be widened");
        assert!(session.disallowed_tools.contains(&"web_fetch".to_string()));
        assert!(session.disallowed_tools.contains(&"write_file".to_string()));
        assert!(session.messages.iter().any(|message| message
            .text_content()
            .contains("Review the requested change.")));
    }

    #[test]
    fn model_agent_catalog_is_bounded_and_withholds_definition_secrets() {
        let output = agent_tool_catalog();
        assert!(output.len() <= 20_000);
        let catalog: serde_json::Value = serde_json::from_str(&output).unwrap();
        assert_eq!(
            catalog.get("untrusted").and_then(|value| value.as_bool()),
            Some(true)
        );
        for agent in catalog
            .get("agents")
            .and_then(|value| value.as_array())
            .unwrap()
        {
            let object = agent.as_object().unwrap();
            assert!(!object.contains_key("system_prompt"));
            assert!(!object.contains_key("path"));
            assert!(!object.contains_key("model"));
            assert!(!object.contains_key("permission_mode"));
        }
    }
}
