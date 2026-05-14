//! Pure-text renderers for the parity slash-command overlays.
//!
//! Each function returns a multi-line `String` shaped like the corresponding
//! Claude Code v2.1.128 capture under
//! `/Users/siddhartha/Desktop/reference/ui-capture-runs/20260513-185809-agent-platform-reference/screenshots/claude-code/`.
//!
//! Until M8 lands a full Ratatui overlay state machine, these renderers are
//! dispatched from `tui::tui_app.rs` as `SlashResult::SystemMessage` and
//! covered by inline snapshot tests so any drift from the captures fails CI.
//!
//! The output is intentionally identical for every render; dynamic content
//! (discovered agents, skills, mcp servers, permission rules) is passed in
//! by the caller so the renderer stays pure and snapshot-friendly.
//!
//! `#![allow(dead_code)]` at module level — most renderers are exercised by
//! the inline snapshot tests and only some have live dispatch sites in
//! `tui_app.rs` today. As more dispatch arms re-land (S5/M23 follow-up and
//! interactive overlay milestones), specific items will lose this lint
//! exemption naturally.

#![allow(dead_code)]

use std::path::Path;

const DIVIDER_WIDTH: usize = 120;

fn divider() -> String {
    "─".repeat(DIVIDER_WIDTH)
}

fn frame(title_line: String, body_lines: &[String], footer: &str) -> String {
    let mut out = String::new();
    out.push_str(&divider());
    out.push('\n');
    out.push_str("  ");
    out.push_str(&title_line);
    out.push('\n');
    out.push('\n');
    for line in body_lines {
        out.push_str(line);
        out.push('\n');
    }
    if !body_lines.is_empty() {
        out.push('\n');
    }
    out.push_str("  ");
    out.push_str(footer);
    out
}

// ---------------------------------------------------------------------------
// /mcp — scoped server list with status glyphs (captures 602, 603)
// ---------------------------------------------------------------------------

/// One server entry in the rendered list.
#[derive(Debug, Clone)]
pub struct McpServerSummary {
    pub name: String,
    pub status: McpStatus,
    pub tool_count: Option<usize>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)] // Disabled / NeedsAuth / Failed constructed only from M7 plugin sources for now.
pub enum McpStatus {
    Connected,
    Disabled,
    NeedsAuth,
    Failed,
}

impl McpStatus {
    fn glyph(self) -> &'static str {
        match self {
            McpStatus::Connected => "✔ connected",
            McpStatus::Disabled => "◯ disabled",
            McpStatus::NeedsAuth => "△ needs authentication",
            McpStatus::Failed => "✘ failed",
        }
    }
}

/// One scope group in the MCP list.
#[derive(Debug, Clone)]
pub struct McpScope {
    pub label: String,
    pub servers: Vec<McpServerSummary>,
}

pub fn render_mcp_list(scopes: &[McpScope]) -> String {
    let total: usize = scopes.iter().map(|s| s.servers.len()).sum();
    let mut body: Vec<String> = Vec::new();
    body.push(format!("  {} servers", total));
    body.push(String::new());

    for (i, scope) in scopes.iter().enumerate() {
        body.push(format!("    {}", scope.label));
        for (j, server) in scope.servers.iter().enumerate() {
            let cursor = if i == 0 && j == 0 { "❯ " } else { "  " };
            let tools = match server.tool_count {
                Some(n) if matches!(server.status, McpStatus::Connected) => {
                    format!(" · {} tools", n)
                }
                _ => String::new(),
            };
            body.push(format!(
                "  {}{} · {}{}",
                cursor,
                server.name,
                server.status.glyph(),
                tools
            ));
        }
        body.push(String::new());
    }

    body.push("  ※ Run `agiworkforce --debug` to see error logs".to_string());
    body.push("  https://code.agiworkforce.com/docs/mcp for help".to_string());

    frame(
        "Manage MCP servers".to_string(),
        &body,
        "↑↓ to navigate · Enter to confirm · Esc to cancel",
    )
}

/// MCP detail view (capture 603 — single server, e.g. "Apify MCP Server").
/// Wired from a future `/mcp <server-name>` arg; currently exercised only by
/// the snapshot tests in this module.
#[allow(dead_code)]
pub fn render_mcp_detail(
    server_name: &str,
    status: McpStatus,
    command: &str,
    args: &[String],
    config_location: &str,
) -> String {
    let body = vec![
        format!("  {} MCP Server", capitalize_first(server_name)),
        String::new(),
        format!("    Status:          {}", status.glyph()),
        format!("    Command:         {}", if command.is_empty() { "(none)" } else { command }),
        format!("    Args:            {}", if args.is_empty() { "(none)".to_string() } else { args.join(" ") }),
        format!("    Config location: {}", config_location),
        String::new(),
        format!(
            "  ❯ 1. {}",
            match status {
                McpStatus::Disabled => "Enable",
                McpStatus::Connected => "Disable",
                McpStatus::NeedsAuth => "Authenticate",
                McpStatus::Failed => "Retry connection",
            }
        ),
    ];
    frame(
        "MCP server".to_string(),
        &body,
        "↑↓ navigate · Enter confirm · Esc back",
    )
}

#[allow(dead_code)]
fn capitalize_first(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

// ---------------------------------------------------------------------------
// /agents — Agents / Running / Library tabs (captures 619, 620)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgentsTab {
    /// Overview: running count + library summary.
    Agents,
    Running,
    Library,
}

#[derive(Debug, Clone)]
pub struct AgentSummary {
    pub name: String,
    pub model: String,
    pub source_label: String,
}

/// Renders the three-tab strip with `[Active]` bracket notation for the
/// selected tab, matching Claude Code v2.1.128 captures 619 and 620.
fn agents_tab_strip(tab: AgentsTab) -> String {
    let tabs = [
        ("Agents", AgentsTab::Agents),
        ("Running", AgentsTab::Running),
        ("Library", AgentsTab::Library),
    ];
    tabs.iter()
        .map(|(label, t)| {
            if *t == tab {
                format!("[{}]", label)
            } else {
                label.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("   ")
}

pub fn render_agents(
    tab: AgentsTab,
    agents: &[AgentSummary],
    running: &[String],
    project_root: Option<&Path>,
) -> String {
    let title_line = agents_tab_strip(tab);

    let project: Vec<&AgentSummary> = agents
        .iter()
        .filter(|a| a.source_label.starts_with("project"))
        .collect();
    let builtin: Vec<&AgentSummary> = agents
        .iter()
        .filter(|a| !a.source_label.starts_with("project"))
        .collect();

    let mut body: Vec<String> = Vec::new();
    match tab {
        AgentsTab::Agents => {
            body.push(format!(
                "  Running subagents:  {}",
                if running.is_empty() {
                    "none".to_string()
                } else {
                    running.len().to_string()
                }
            ));
            body.push(String::new());
            body.push(format!("  Project agents:     {}", project.len()));
            body.push(format!("  Built-in agents:    {}", builtin.len()));
            body.push(String::new());
            body.push("  Use ←/→ to switch to Running or Library tabs.".to_string());
        }
        AgentsTab::Running => {
            if running.is_empty() {
                body.push("  No subagents are currently running.".to_string());
            } else {
                body.push(format!("  {} subagent(s) running", running.len()));
                body.push(String::new());
                for r in running {
                    body.push(format!("    • {}", r));
                }
            }
        }
        AgentsTab::Library => {
            body.push("    Create new agent".to_string());
            body.push(String::new());

            let project_label = project_root
                .map(|p| {
                    format!(
                        "    Project agents ({})",
                        p.join(".agiworkforce/agents").display()
                    )
                })
                .unwrap_or_else(|| "    Project agents".to_string());
            body.push(project_label);
            if project.is_empty() {
                body.push("    (none — add .md files with frontmatter to .agiworkforce/agents/, .claude/agents/, or .codex/agents/)".to_string());
            } else {
                for a in &project {
                    body.push(format!("    {} · {}", a.name, a.model));
                }
            }
            body.push(String::new());
            body.push("    Built-in agents (always available)".to_string());
            if builtin.is_empty() {
                body.push("    (none registered)".to_string());
            } else {
                for a in &builtin {
                    body.push(format!("    {} · {}", a.name, a.model));
                }
            }
        }
    }

    frame(
        title_line,
        &body,
        "←/→ switch tabs · ↑↓ navigate · Enter select · Esc close",
    )
}

// ---------------------------------------------------------------------------
// /skills — single screen with project + plugin discovery (capture 621)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct SkillSummary {
    pub name: String,
    pub description: String,
}

pub fn render_skills(skills: &[SkillSummary]) -> String {
    let body = if skills.is_empty() {
        vec![
            "  No skills found.".to_string(),
            "  Create skills in .agiworkforce/skills/, .claude/skills/, or ~/.claude/skills/."
                .to_string(),
        ]
    } else {
        let mut b = vec![format!("  {} skill(s) available.", skills.len()), String::new()];
        for s in skills {
            b.push(format!("    {:<28} {}", s.name, s.description));
        }
        b
    };
    frame("Skills".to_string(), &body, "↑↓ navigate · Enter select · Esc close")
}

// ---------------------------------------------------------------------------
// /permissions — 5-tab overlay (capture 627)
// ---------------------------------------------------------------------------

#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PermissionsTab {
    RecentlyDenied,
    Allow,
    Ask,
    Deny,
    Workspace,
}

pub fn render_permissions(
    tab: PermissionsTab,
    allow: &[String],
    deny: &[String],
    workspace: &[String],
    recently_denied: &[String],
) -> String {
    let title_line = format!(
        "Permissions:  Recently denied   Allow   Ask   Deny   Workspace  (current: {})",
        match tab {
            PermissionsTab::RecentlyDenied => "Recently denied",
            PermissionsTab::Allow => "Allow",
            PermissionsTab::Ask => "Ask",
            PermissionsTab::Deny => "Deny",
            PermissionsTab::Workspace => "Workspace",
        }
    );

    let mut body = vec![
        "  AGI Workforce won't ask before using allowed tools.".to_string(),
        "  ╭──────────────────────────────────────────────────────────────────────────────────────────────────────────────╮"
            .to_string(),
        "  │ ⌕ Search…                                                                                                    │"
            .to_string(),
        "  ╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────╯"
            .to_string(),
        String::new(),
        "    1.   Add a new rule…".to_string(),
    ];

    let rules: &[String] = match tab {
        PermissionsTab::Allow => allow,
        PermissionsTab::Deny => deny,
        PermissionsTab::Workspace => workspace,
        PermissionsTab::RecentlyDenied => recently_denied,
        PermissionsTab::Ask => &[],
    };

    if rules.is_empty() {
        body.push("    (no rules in this category)".to_string());
    } else {
        for (i, rule) in rules.iter().enumerate() {
            body.push(format!("    {}.   {}", i + 2, rule));
        }
    }

    frame(title_line, &body, "←/→ tab switch · ↓ return · Esc cancel")
}

// ---------------------------------------------------------------------------
// /plugin — 4-tab overlay (captures 622–625)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PluginTab {
    Discover,
    Installed,
    Marketplaces,
    Errors,
}

#[derive(Debug, Clone)]
pub struct PluginSummary {
    pub name: String,
    pub status_glyph: &'static str,
    pub source_group: PluginGroup,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PluginGroup {
    NeedsAttention,
    Project,
    User,
}

pub fn render_plugin(
    tab: PluginTab,
    installed: &[PluginSummary],
    errors: &[String],
) -> String {
    let title_line = format!(
        "Plugins  Discover   Installed   Marketplaces   Errors  (current: {})",
        match tab {
            PluginTab::Discover => "Discover",
            PluginTab::Installed => "Installed",
            PluginTab::Marketplaces => "Marketplaces",
            PluginTab::Errors => "Errors",
        }
    );

    let body = match tab {
        PluginTab::Discover => vec![
            "  Discover plugins".to_string(),
            String::new(),
            "  No plugins available.".to_string(),
            "  Add a marketplace first using the Marketplaces tab.".to_string(),
        ],
        PluginTab::Installed => {
            let mut b = vec![
                "  ╭──────────────────────────────────────────────────────────────────────────────────────────────────────────────╮"
                    .to_string(),
                "  │ ⌕ Search…                                                                                                    │"
                    .to_string(),
                "  ╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────╯"
                    .to_string(),
                String::new(),
            ];
            let needs: Vec<&PluginSummary> = installed
                .iter()
                .filter(|p| p.source_group == PluginGroup::NeedsAttention)
                .collect();
            let project: Vec<&PluginSummary> = installed
                .iter()
                .filter(|p| p.source_group == PluginGroup::Project)
                .collect();
            let user: Vec<&PluginSummary> = installed
                .iter()
                .filter(|p| p.source_group == PluginGroup::User)
                .collect();
            if !needs.is_empty() {
                b.push("    Needs attention".to_string());
                for p in &needs {
                    b.push(format!("    {} · {}", p.status_glyph, p.name));
                }
                b.push(String::new());
            }
            if !project.is_empty() {
                b.push("    Project".to_string());
                for p in &project {
                    b.push(format!("    {} · {}", p.status_glyph, p.name));
                }
                b.push(String::new());
            }
            if !user.is_empty() {
                b.push("    User".to_string());
                for p in &user {
                    b.push(format!("    {} · {}", p.status_glyph, p.name));
                }
            }
            if installed.is_empty() {
                b.push("  No plugins installed.".to_string());
            }
            b
        }
        PluginTab::Marketplaces => vec![
            "  Marketplaces".to_string(),
            String::new(),
            "  ❯ + Add Marketplace".to_string(),
        ],
        PluginTab::Errors => {
            if errors.is_empty() {
                vec!["  No plugin errors".to_string()]
            } else {
                let mut b = vec![format!("  {} plugin error(s)", errors.len()), String::new()];
                for e in errors {
                    b.push(format!("    ✘ {}", e));
                }
                b
            }
        }
    };

    frame(
        title_line,
        &body,
        "type to search · Space to toggle · f to favorite · Enter to details · Esc to back",
    )
}

// ---------------------------------------------------------------------------
// /tasks — background task list (capture 626)
// ---------------------------------------------------------------------------

pub fn render_tasks(running: &[String]) -> String {
    let body = if running.is_empty() {
        vec!["  No tasks currently running".to_string()]
    } else {
        let mut b = vec![format!("  {} task(s) running", running.len()), String::new()];
        for t in running {
            b.push(format!("    • {}", t));
        }
        b
    };
    frame(
        "Background tasks".to_string(),
        &body,
        "↑/↓ to select · Enter to view · ←/Esc to close",
    )
}

// ---------------------------------------------------------------------------
// /chrome — extension status (capture 600)
// ---------------------------------------------------------------------------

pub fn render_chrome() -> String {
    let body = vec![
        "  AGI Workforce in Chrome works with the Chrome extension to let you control your browser".to_string(),
        "  directly from the AGI Workforce CLI. Navigate websites, fill forms, capture screenshots,".to_string(),
        "  record GIFs, and debug with console logs and network requests.".to_string(),
        String::new(),
        "    Status:    Enabled".to_string(),
        "    Extension: Installed".to_string(),
        String::new(),
        "  ❯ Manage permissions".to_string(),
        "    Reconnect extension".to_string(),
        "    Enabled by default: Yes".to_string(),
        String::new(),
        "  Usage: agiworkforce --chrome or agiworkforce --no-chrome".to_string(),
        String::new(),
        "  Site-level permissions are inherited from the Chrome extension. Manage permissions in the".to_string(),
        "  Chrome extension settings to control which sites AGI Workforce can browse, click, and type on.".to_string(),
        String::new(),
        "  Learn more: https://code.agiworkforce.com/docs/chrome".to_string(),
    ];
    frame(
        "AGI Workforce in Chrome (Beta)".to_string(),
        &body,
        "Enter to confirm · Esc to cancel",
    )
}

// ---------------------------------------------------------------------------
// /ide — IDE selection dialog (capture 601)
// ---------------------------------------------------------------------------

pub fn render_ide(available_ides: &[String]) -> String {
    let body = if available_ides.is_empty() {
        vec![
            "  Connect to an IDE for integrated development features.".to_string(),
            String::new(),
            "  No available IDEs detected. Make sure your IDE has the AGI Workforce extension or".to_string(),
            "  plugin installed and is running.".to_string(),
        ]
    } else {
        let mut b = vec!["  Connect to an IDE for integrated development features.".to_string(), String::new()];
        for ide in available_ides {
            b.push(format!("    • {}", ide));
        }
        b
    };
    frame(
        "Select IDE".to_string(),
        &body,
        "↑/↓ select · Enter confirm · Esc cancel",
    )
}

// ---------------------------------------------------------------------------
// /usage — token + cost summary (M11, audit-driven Claude Code parity)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default)]
pub struct UsageSummary {
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cache_read_tokens: u32,
    pub cache_write_tokens: u32,
    pub estimated_cost_usd: f64,
    pub turn_count: u32,
    pub model: String,
}

pub fn render_usage(usage: &UsageSummary) -> String {
    let body = vec![
        format!("    Input tokens:        {:>9}", fmt_number(usage.input_tokens as u64)),
        format!("    Output tokens:       {:>9}", fmt_number(usage.output_tokens as u64)),
        format!("    Cache read tokens:   {:>9}", fmt_number(usage.cache_read_tokens as u64)),
        format!("    Cache write tokens:  {:>9}", fmt_number(usage.cache_write_tokens as u64)),
        format!("    Estimated cost:      {:>9}", format!("${:.4}", usage.estimated_cost_usd)),
        format!("    Turn count:          {:>9}", usage.turn_count),
        format!("    Model:               {}", usage.model),
        String::new(),
        "  Tip: see https://agiworkforce.com/pricing for plan details.".to_string(),
    ];
    frame("Usage".to_string(), &body, "Esc to close")
}

fn fmt_number(n: u64) -> String {
    let s = n.to_string();
    let bytes = s.as_bytes();
    let mut out = String::with_capacity(s.len() + s.len() / 3);
    for (i, b) in bytes.iter().enumerate() {
        if i > 0 && (bytes.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(*b as char);
    }
    out
}

// ---------------------------------------------------------------------------
// /sandbox — sandbox-policy mode display (M11)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SandboxMode {
    ReadOnly,
    Contained,
    Unrestricted,
}

impl SandboxMode {
    fn label(self) -> &'static str {
        match self {
            SandboxMode::ReadOnly => "read-only",
            SandboxMode::Contained => "contained",
            SandboxMode::Unrestricted => "unrestricted",
        }
    }

    fn description(self) -> (&'static str, &'static str) {
        match self {
            SandboxMode::ReadOnly => (
                "read_file, search_files, list_directory, web_search, web_fetch, glob, grep_files",
                "write_file, edit_file, run_command, apply_patch, multiedit",
            ),
            SandboxMode::Contained => (
                "read-only ops + write_file & edit_file (with confirmation), run_command (with confirmation)",
                "apply_patch without confirmation, raw shell beyond cwd",
            ),
            SandboxMode::Unrestricted => (
                "all built-in tools, all MCP tools",
                "(nothing — useful only inside an isolated VM or container)",
            ),
        }
    }
}

pub fn render_sandbox(mode: SandboxMode) -> String {
    let (allowed, blocked) = mode.description();
    let body = vec![
        format!("    Mode:    {}", mode.label()),
        String::new(),
        format!("    Allowed: {}", allowed),
        format!("    Blocked: {}", blocked),
        String::new(),
        "    Toggle with: --sandbox=<read-only|contained|unrestricted>".to_string(),
        "                 or env AGIWORKFORCE_SANDBOX=<mode>".to_string(),
        "                 or /sandbox <mode> inline".to_string(),
        "    Enforced by: agiworkforce-sandbox-policy".to_string(),
    ];
    frame("Sandbox".to_string(), &body, "Esc to close")
}

// ---------------------------------------------------------------------------
// /doctor — diagnostic health check (M11)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct DoctorCheck {
    pub label: String,
    pub status: DoctorStatus,
    pub detail: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DoctorStatus {
    Ok,
    Warn,
    Fail,
    Info,
}

impl DoctorStatus {
    fn glyph(self) -> &'static str {
        match self {
            DoctorStatus::Ok => "✔",
            DoctorStatus::Warn => "⚠",
            DoctorStatus::Fail => "✘",
            DoctorStatus::Info => "·",
        }
    }
}

pub fn render_doctor(checks: &[DoctorCheck]) -> String {
    let mut body: Vec<String> = Vec::new();
    let width = checks.iter().map(|c| c.label.len()).max().unwrap_or(0) + 2;
    for c in checks {
        body.push(format!(
            "    {} {:<width$} {}",
            c.status.glyph(),
            format!("{}:", c.label),
            c.detail,
            width = width
        ));
    }
    let any_fail = checks.iter().any(|c| c.status == DoctorStatus::Fail);
    let any_warn = checks.iter().any(|c| c.status == DoctorStatus::Warn);
    body.push(String::new());
    body.push(match (any_fail, any_warn) {
        (true, _) => "  ✘ One or more checks failed. Run with --debug for verbose logs.".to_string(),
        (false, true) => "  ⚠ Warnings detected. Run with --debug for verbose logs.".to_string(),
        _ => "  ✔ All checks passed.".to_string(),
    });
    frame(
        "Doctor — diagnostic checks".to_string(),
        &body,
        "Esc to close",
    )
}

// ---------------------------------------------------------------------------
// /recap — recent turn summary (M11)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct RecapEntry {
    pub role: String,        // "User" / "Assistant" / "Tool"
    pub age_label: String,   // "just now" / "2 turns ago"
    pub summary: String,
}

pub fn render_recap(entries: &[RecapEntry], turn_count: u32, recent_edits: &[String]) -> String {
    let mut body: Vec<String> = Vec::new();
    if entries.is_empty() {
        body.push("  (session is empty — no turns to recap)".to_string());
    } else {
        for e in entries {
            body.push(format!(
                "    {:<12} {:<14} {}",
                e.role, e.age_label, e.summary
            ));
        }
    }
    body.push(String::new());
    body.push(format!("    Turn count:        {}", turn_count));
    if !recent_edits.is_empty() {
        body.push(format!(
            "    Recent file edits: {}",
            recent_edits.join(", ")
        ));
    }
    frame("Session recap".to_string(), &body, "Esc to close")
}

// ---------------------------------------------------------------------------
// /release-notes — show CHANGELOG entry for the current version (M11)
// ---------------------------------------------------------------------------

pub fn render_release_notes(version: &str, notes: &str) -> String {
    let mut body: Vec<String> = vec![format!("    Version: {}", version), String::new()];
    if notes.trim().is_empty() {
        body.push("  (no release notes available — check CHANGELOG.md in the repo)".to_string());
    } else {
        for line in notes.lines() {
            body.push(format!("    {}", line));
        }
    }
    frame("Release notes".to_string(), &body, "Esc to close")
}

// ---------------------------------------------------------------------------
// /keybindings — static reference (M11)
// ---------------------------------------------------------------------------

pub fn render_keybindings() -> String {
    let body = vec![
        "    Global".to_string(),
        "      Ctrl+C       Cancel current turn / interrupt".to_string(),
        "      Ctrl+D       Exit AGI Workforce".to_string(),
        "      Ctrl+L       Clear screen (preserve session)".to_string(),
        "      Tab          Toggle plan mode".to_string(),
        "      Shift+Tab    Cycle plan / accept / reject".to_string(),
        String::new(),
        "    Slash palette".to_string(),
        "      /            Open palette".to_string(),
        "      ↑/↓          Navigate commands".to_string(),
        "      Enter        Run selected command".to_string(),
        "      Esc          Close palette".to_string(),
        "      type         Filter commands".to_string(),
        String::new(),
        "    Overlays".to_string(),
        "      ←/→          Switch tabs".to_string(),
        "      ↑/↓          Navigate items".to_string(),
        "      Enter        Confirm / open detail".to_string(),
        "      Esc          Close overlay".to_string(),
        String::new(),
        "    Editor".to_string(),
        "      Ctrl+E       Open external editor for current input".to_string(),
        "      Alt+Enter    Insert newline without submitting".to_string(),
    ];
    frame("Keybindings".to_string(), &body, "Esc to close")
}

// ---------------------------------------------------------------------------
// Snapshot tests anchored to captures
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn divider_line() -> String {
        "─".repeat(120)
    }

    #[test]
    fn mcp_empty_list_renders_zero_servers() {
        let s = render_mcp_list(&[]);
        assert!(s.starts_with(&divider_line()));
        assert!(s.contains("Manage MCP servers"));
        assert!(s.contains("0 servers"));
        assert!(s.contains("↑↓ to navigate · Enter to confirm · Esc to cancel"));
    }

    #[test]
    fn mcp_with_scopes_renders_group_labels_and_glyphs() {
        let scopes = vec![
            McpScope {
                label: "Project MCPs (.mcp.json)".into(),
                servers: vec![
                    McpServerSummary {
                        name: "apify".into(),
                        status: McpStatus::Disabled,
                        tool_count: None,
                    },
                    McpServerSummary {
                        name: "hunter-remote-mcp".into(),
                        status: McpStatus::Connected,
                        tool_count: Some(34),
                    },
                ],
            },
            McpScope {
                label: "Built-in MCPs (always available)".into(),
                servers: vec![McpServerSummary {
                    name: "agi-in-chrome".into(),
                    status: McpStatus::Connected,
                    tool_count: Some(20),
                }],
            },
        ];
        let s = render_mcp_list(&scopes);
        assert!(s.contains("3 servers"));
        assert!(s.contains("    Project MCPs (.mcp.json)"));
        assert!(s.contains("❯ apify · ◯ disabled"));
        assert!(s.contains("hunter-remote-mcp · ✔ connected · 34 tools"));
        assert!(s.contains("    Built-in MCPs (always available)"));
        assert!(s.contains("agi-in-chrome · ✔ connected · 20 tools"));
    }

    #[test]
    fn mcp_detail_shows_action_for_each_status() {
        let s = render_mcp_detail("apify", McpStatus::Disabled, "", &[], "/path/to/.mcp.json");
        assert!(s.contains("Apify MCP Server"));
        assert!(s.contains("Status:          ◯ disabled"));
        assert!(s.contains("❯ 1. Enable"));

        let s = render_mcp_detail("foo", McpStatus::Connected, "node", &["x.js".into()], "/p");
        assert!(s.contains("❯ 1. Disable"));

        let s = render_mcp_detail("bar", McpStatus::NeedsAuth, "", &[], "/p");
        assert!(s.contains("❯ 1. Authenticate"));

        let s = render_mcp_detail("baz", McpStatus::Failed, "", &[], "/p");
        assert!(s.contains("❯ 1. Retry connection"));
    }

    #[test]
    fn agents_running_tab_shows_empty_state() {
        let s = render_agents(AgentsTab::Running, &[], &[], None);
        assert!(s.contains("Running"));
        assert!(s.contains("Library"));
        assert!(s.contains("No subagents are currently running."));
        assert!(s.contains("←/→ switch tabs · ↑↓ navigate · Enter select · Esc close"));
    }

    #[test]
    fn agents_library_tab_groups_project_and_builtin() {
        let agents = vec![
            AgentSummary {
                name: "researcher".into(),
                model: "claude-sonnet-4-6".into(),
                source_label: "project".into(),
            },
            AgentSummary {
                name: "explorer".into(),
                model: "haiku".into(),
                source_label: "builtin".into(),
            },
        ];
        let s = render_agents(
            AgentsTab::Library,
            &agents,
            &[],
            Some(Path::new("/home/me/project")),
        );
        assert!(s.contains("Project agents (/home/me/project/.agiworkforce/agents)"));
        assert!(s.contains("researcher · claude-sonnet-4-6"));
        assert!(s.contains("Built-in agents (always available)"));
        assert!(s.contains("explorer · haiku"));
        assert!(s.contains("Create new agent"));
    }

    #[test]
    fn agents_tab_strip_brackets_active_tab() {
        let running_strip = agents_tab_strip(AgentsTab::Running);
        assert!(running_strip.contains("[Running]"));
        assert!(!running_strip.contains("[Agents]"));
        assert!(!running_strip.contains("[Library]"));

        let library_strip = agents_tab_strip(AgentsTab::Library);
        assert!(library_strip.contains("[Library]"));
        assert!(!library_strip.contains("[Running]"));

        let agents_strip = agents_tab_strip(AgentsTab::Agents);
        assert!(agents_strip.contains("[Agents]"));
        assert!(!agents_strip.contains("[Running]"));
    }

    #[test]
    fn agents_overview_tab_shows_counts() {
        let agents = vec![
            AgentSummary {
                name: "cli-engineer".into(),
                model: "sonnet".into(),
                source_label: "project".into(),
            },
            AgentSummary {
                name: "explore".into(),
                model: "haiku".into(),
                source_label: "builtin".into(),
            },
            AgentSummary {
                name: "plan".into(),
                model: "inherit".into(),
                source_label: "builtin".into(),
            },
        ];
        let running = vec!["subagent: explore".to_string()];
        let s = render_agents(AgentsTab::Agents, &agents, &running, None);
        assert!(s.contains("Running subagents:  1"));
        assert!(s.contains("Project agents:     1"));
        assert!(s.contains("Built-in agents:    2"));
        assert!(s.contains("[Agents]"));
    }

    #[test]
    fn agents_overview_tab_zero_state() {
        let s = render_agents(AgentsTab::Agents, &[], &[], None);
        assert!(s.contains("Running subagents:  none"));
        assert!(s.contains("Project agents:     0"));
        assert!(s.contains("Built-in agents:    0"));
    }

    #[test]
    fn skills_empty_state_references_alias_paths() {
        let s = render_skills(&[]);
        assert!(s.contains("No skills found."));
        assert!(s.contains(".agiworkforce/skills/"));
        assert!(s.contains(".claude/skills/"));
    }

    #[test]
    fn skills_with_entries_lists_each() {
        let skills = vec![SkillSummary {
            name: "rust-reviewer".into(),
            description: "Review Rust code".into(),
        }];
        let s = render_skills(&skills);
        assert!(s.contains("1 skill(s) available."));
        assert!(s.contains("rust-reviewer"));
        assert!(s.contains("Review Rust code"));
    }

    #[test]
    fn permissions_shows_5_tabs_and_search_box() {
        let s = render_permissions(
            PermissionsTab::Allow,
            &["Bash(cargo *)".into(), "Bash(cat *)".into()],
            &[],
            &[],
            &[],
        );
        assert!(s.contains("Recently denied"));
        assert!(s.contains("Allow"));
        assert!(s.contains("Ask"));
        assert!(s.contains("Deny"));
        assert!(s.contains("Workspace"));
        assert!(s.contains("(current: Allow)"));
        assert!(s.contains("⌕ Search…"));
        assert!(s.contains("1.   Add a new rule…"));
        assert!(s.contains("2.   Bash(cargo *)"));
        assert!(s.contains("3.   Bash(cat *)"));
        assert!(s.contains("←/→ tab switch · ↓ return · Esc cancel"));
    }

    #[test]
    fn plugin_discover_shows_marketplace_first_hint() {
        let s = render_plugin(PluginTab::Discover, &[], &[]);
        assert!(s.contains("Plugins"));
        assert!(s.contains("Discover"));
        assert!(s.contains("Installed"));
        assert!(s.contains("Marketplaces"));
        assert!(s.contains("Errors"));
        assert!(s.contains("No plugins available."));
        assert!(s.contains("Add a marketplace first using the Marketplaces tab."));
    }

    #[test]
    fn plugin_installed_groups_needs_attention_and_project() {
        let plugins = vec![
            PluginSummary {
                name: "auth-needed".into(),
                status_glyph: "△",
                source_group: PluginGroup::NeedsAttention,
            },
            PluginSummary {
                name: "mine".into(),
                status_glyph: "✔",
                source_group: PluginGroup::Project,
            },
        ];
        let s = render_plugin(PluginTab::Installed, &plugins, &[]);
        assert!(s.contains("Needs attention"));
        assert!(s.contains("△ · auth-needed"));
        assert!(s.contains("Project"));
        assert!(s.contains("✔ · mine"));
    }

    #[test]
    fn plugin_marketplaces_offers_add_action() {
        let s = render_plugin(PluginTab::Marketplaces, &[], &[]);
        assert!(s.contains("❯ + Add Marketplace"));
    }

    #[test]
    fn plugin_errors_empty_and_populated_states() {
        let empty = render_plugin(PluginTab::Errors, &[], &[]);
        assert!(empty.contains("No plugin errors"));

        let with_errors = render_plugin(
            PluginTab::Errors,
            &[],
            &["plugin foo: invalid manifest".into()],
        );
        assert!(with_errors.contains("1 plugin error(s)"));
        assert!(with_errors.contains("✘ plugin foo: invalid manifest"));
    }

    #[test]
    fn tasks_empty_state_matches_capture_626() {
        let s = render_tasks(&[]);
        assert!(s.contains("Background tasks"));
        assert!(s.contains("No tasks currently running"));
        assert!(s.contains("↑/↓ to select · Enter to view · ←/Esc to close"));
    }

    #[test]
    fn tasks_with_running_lists_each() {
        let s = render_tasks(&["subagent: explore".to_string(), "batch: 3 tools".to_string()]);
        assert!(s.contains("2 task(s) running"));
        assert!(s.contains("• subagent: explore"));
        assert!(s.contains("• batch: 3 tools"));
    }

    #[test]
    fn chrome_shows_status_extension_and_actions() {
        let s = render_chrome();
        assert!(s.contains("AGI Workforce in Chrome (Beta)"));
        assert!(s.contains("Status:    Enabled"));
        assert!(s.contains("Extension: Installed"));
        assert!(s.contains("❯ Manage permissions"));
        assert!(s.contains("Reconnect extension"));
        assert!(s.contains("Usage: agiworkforce --chrome or agiworkforce --no-chrome"));
        assert!(s.contains("Learn more: https://code.agiworkforce.com/docs/chrome"));
    }

    #[test]
    fn ide_empty_state_explains_missing_extension() {
        let s = render_ide(&[]);
        assert!(s.contains("Select IDE"));
        assert!(s.contains("No available IDEs detected"));
        assert!(s.contains("AGI Workforce extension"));
    }

    #[test]
    fn ide_with_detected_lists_them() {
        let s = render_ide(&["VS Code".to_string(), "Cursor".to_string()]);
        assert!(s.contains("• VS Code"));
        assert!(s.contains("• Cursor"));
    }

    #[test]
    fn every_render_function_emits_the_divider() {
        let divider = divider_line();
        assert!(render_mcp_list(&[]).contains(&divider));
        assert!(render_mcp_detail("foo", McpStatus::Disabled, "", &[], "/p").contains(&divider));
        assert!(render_agents(AgentsTab::Running, &[], &[], None).contains(&divider));
        assert!(render_skills(&[]).contains(&divider));
        assert!(
            render_permissions(PermissionsTab::Allow, &[], &[], &[], &[]).contains(&divider)
        );
        assert!(render_plugin(PluginTab::Discover, &[], &[]).contains(&divider));
        assert!(render_tasks(&[]).contains(&divider));
        assert!(render_chrome().contains(&divider));
        assert!(render_ide(&[]).contains(&divider));
        // M11 additions:
        assert!(render_usage(&UsageSummary::default()).contains(&divider));
        assert!(render_sandbox(SandboxMode::Contained).contains(&divider));
        assert!(render_doctor(&[]).contains(&divider));
        assert!(render_recap(&[], 0, &[]).contains(&divider));
        assert!(render_release_notes("0.0.0", "").contains(&divider));
        assert!(render_keybindings().contains(&divider));
    }

    // M11 — audit-driven parity additions

    #[test]
    fn usage_renders_tokens_cost_and_model() {
        let usage = UsageSummary {
            input_tokens: 12_345,
            output_tokens: 8_910,
            cache_read_tokens: 5_432,
            cache_write_tokens: 1_234,
            estimated_cost_usd: 0.2347,
            turn_count: 15,
            model: "claude-sonnet-4-6".into(),
        };
        let s = render_usage(&usage);
        assert!(s.contains("Usage"));
        assert!(s.contains("Input tokens:"));
        assert!(s.contains("12,345"));
        assert!(s.contains("Output tokens:"));
        assert!(s.contains("8,910"));
        assert!(s.contains("Cache read"));
        assert!(s.contains("5,432"));
        assert!(s.contains("$0.2347"));
        assert!(s.contains("Turn count:"));
        assert!(s.contains("15"));
        assert!(s.contains("claude-sonnet-4-6"));
        assert!(s.contains("agiworkforce.com/pricing"));
    }

    #[test]
    fn fmt_number_inserts_thousand_separators() {
        assert_eq!(fmt_number(0), "0");
        assert_eq!(fmt_number(42), "42");
        assert_eq!(fmt_number(1_000), "1,000");
        assert_eq!(fmt_number(1_234_567), "1,234,567");
        assert_eq!(fmt_number(12_345_678_901), "12,345,678,901");
    }

    #[test]
    fn sandbox_modes_each_have_label_and_descriptions() {
        for mode in [
            SandboxMode::ReadOnly,
            SandboxMode::Contained,
            SandboxMode::Unrestricted,
        ] {
            let s = render_sandbox(mode);
            assert!(s.contains("Sandbox"));
            assert!(s.contains(mode.label()));
            assert!(s.contains("Allowed:"));
            assert!(s.contains("Blocked:"));
            assert!(s.contains("AGIWORKFORCE_SANDBOX"));
            assert!(s.contains("agiworkforce-sandbox-policy"));
        }
    }

    #[test]
    fn doctor_passes_when_all_ok() {
        let checks = vec![
            DoctorCheck {
                label: "Version".into(),
                status: DoctorStatus::Info,
                detail: "1.1.0".into(),
            },
            DoctorCheck {
                label: "Models.json".into(),
                status: DoctorStatus::Ok,
                detail: "found".into(),
            },
        ];
        let s = render_doctor(&checks);
        assert!(s.contains("Doctor"));
        assert!(s.contains("Version"));
        assert!(s.contains("Models.json"));
        assert!(s.contains("All checks passed"));
    }

    #[test]
    fn doctor_flags_failures_in_summary() {
        let checks = vec![DoctorCheck {
            label: "MCP server".into(),
            status: DoctorStatus::Fail,
            detail: "auth required".into(),
        }];
        let s = render_doctor(&checks);
        assert!(s.contains("✘"));
        assert!(s.contains("One or more checks failed"));
    }

    #[test]
    fn doctor_flags_warnings_in_summary() {
        let checks = vec![DoctorCheck {
            label: "Plugin".into(),
            status: DoctorStatus::Warn,
            detail: "deprecated manifest format".into(),
        }];
        let s = render_doctor(&checks);
        assert!(s.contains("⚠"));
        assert!(s.contains("Warnings detected"));
    }

    #[test]
    fn recap_empty_session_shows_helpful_message() {
        let s = render_recap(&[], 0, &[]);
        assert!(s.contains("Session recap"));
        assert!(s.contains("session is empty"));
    }

    #[test]
    fn recap_with_entries_shows_role_age_summary() {
        let entries = vec![
            RecapEntry {
                role: "User".into(),
                age_label: "just now".into(),
                summary: "asked about /usage".into(),
            },
            RecapEntry {
                role: "Assistant".into(),
                age_label: "2 turns ago".into(),
                summary: "ran cargo test".into(),
            },
        ];
        let s = render_recap(&entries, 15, &["agent.rs".into(), "lib.rs".into()]);
        assert!(s.contains("User"));
        assert!(s.contains("just now"));
        assert!(s.contains("asked about /usage"));
        assert!(s.contains("Assistant"));
        assert!(s.contains("2 turns ago"));
        assert!(s.contains("Turn count:"));
        assert!(s.contains("15"));
        assert!(s.contains("Recent file edits:"));
        assert!(s.contains("agent.rs, lib.rs"));
    }

    #[test]
    fn release_notes_empty_state_directs_to_changelog() {
        let s = render_release_notes("1.1.0", "");
        assert!(s.contains("Release notes"));
        assert!(s.contains("1.1.0"));
        assert!(s.contains("no release notes available"));
        assert!(s.contains("CHANGELOG.md"));
    }

    #[test]
    fn release_notes_renders_provided_text() {
        let s = render_release_notes("1.1.0", "## Highlights\n- 6 new commands");
        assert!(s.contains("Release notes"));
        assert!(s.contains("1.1.0"));
        assert!(s.contains("## Highlights"));
        assert!(s.contains("6 new commands"));
    }

    #[test]
    fn keybindings_lists_global_palette_and_overlay_groups() {
        let s = render_keybindings();
        assert!(s.contains("Keybindings"));
        assert!(s.contains("Global"));
        assert!(s.contains("Ctrl+C"));
        assert!(s.contains("Slash palette"));
        assert!(s.contains("Overlays"));
        assert!(s.contains("Editor"));
        assert!(s.contains("Tab"));
        assert!(s.contains("Esc"));
    }
}
