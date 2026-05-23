//! Shared Claude-Code-parity slash command behavior.
//!
//! The TUI and classic REPL have separate event loops, so high-value slash
//! commands live here as pure helpers to keep their behavior aligned.

use crate::agent::{AgentSession, PrivacyMode};

#[derive(Debug, PartialEq, Eq)]
pub enum ParityCommandResult {
    NotHandled,
    SystemMessage(String),
    Prompt(String),
    DraftPrompt(String),
}

#[cfg(test)]
pub(crate) fn shared_runtime_command_names() -> &'static [&'static str] {
    &[
        "review",
        "copy",
        "new",
        "mcp",
        "tasks",
        "output-style",
        "fallback",
        "replay",
        "insights",
        "feedback",
        "bug",
        "focus",
        "background",
        "bg",
        "advisor",
        "team-onboarding",
        "terminal-setup",
        "shell-setup",
        "reload-plugins",
        "extra-usage",
        "pricing",
        "remote-env",
        "add-dir",
        "files",
        "privacy-settings",
        "privacy-mode",
        "trust-boundary",
        "continue-with-byok",
        "fork-byok",
        "byok",
        "rate-limit-options",
        "stats",
        "passes",
        "sandbox",
        "agents",
        "chrome",
        "ide",
        "doctor",
        "diagnose",
        "health",
        "release-notes",
        "changelog",
        "keybindings",
        "keys",
        "effort",
        "statusline",
        "desktop",
        "app",
        "mobile",
        "ios",
        "android",
        "install-github-app",
        "install-slack-app",
        "tag",
        "upgrade",
        "vim",
        "color",
        "heapdump",
        "stickers",
        "thinkback-play",
        "recap",
        "security-review",
        "pr-comments",
        "ultrareview",
        "think-back",
        "remote-control",
        "rc",
        "debug",
        "tui",
        "powerup",
    ]
}

pub fn handle_shared_command(
    cmd: &str,
    arg: &str,
    session: &mut AgentSession,
) -> ParityCommandResult {
    let normalized = cmd.trim().to_ascii_lowercase();
    let command = if normalized.starts_with('/') {
        normalized
    } else {
        format!("/{normalized}")
    };

    match command.as_str() {
        "/review" => ParityCommandResult::Prompt(review_prompt(arg)),
        "/copy" => ParityCommandResult::SystemMessage(render_copy()),
        "/new" => {
            session.clear();
            ParityCommandResult::SystemMessage("Started new conversation.".to_string())
        }
        "/mcp" => ParityCommandResult::SystemMessage(render_mcp(session)),
        "/tasks" => ParityCommandResult::SystemMessage(render_tasks()),
        "/output-style" => ParityCommandResult::SystemMessage(handle_output_style(session, arg)),
        "/fallback" => ParityCommandResult::SystemMessage(render_fallback(session)),
        "/replay" => ParityCommandResult::SystemMessage(render_replay()),
        "/insights" => ParityCommandResult::SystemMessage(render_insights(session)),
        "/feedback" | "/bug" => ParityCommandResult::SystemMessage(
            "Report issues at: https://github.com/agiworkforce/agiworkforce/issues".to_string(),
        ),
        "/focus" => ParityCommandResult::SystemMessage(
            "Focus mode: hide chrome and maximize composer width. Currently controlled via --no-status-bar at startup.".to_string(),
        ),
        "/background" | "/bg" => ParityCommandResult::SystemMessage(
            "Current task moved to background context. Use /tasks to view active tasks.".to_string(),
        ),
        "/advisor" => ParityCommandResult::SystemMessage(render_advisor(arg)),
        "/team-onboarding" => ParityCommandResult::SystemMessage(render_team_onboarding()),
        "/terminal-setup" | "/shell-setup" => {
            ParityCommandResult::SystemMessage(render_terminal_setup())
        }
        "/reload-plugins" => ParityCommandResult::SystemMessage(render_reload_plugins()),
        "/extra-usage" | "/pricing" => ParityCommandResult::SystemMessage(render_extra_usage()),
        "/remote-env" => ParityCommandResult::SystemMessage(render_remote_env()),
        "/add-dir" => ParityCommandResult::SystemMessage(handle_add_dir(session, arg)),
        "/files" => ParityCommandResult::SystemMessage(handle_files(session, arg)),
        "/privacy-settings" => ParityCommandResult::SystemMessage(render_privacy_settings(session)),
        "/privacy-mode" | "/trust-boundary" => {
            ParityCommandResult::SystemMessage(handle_privacy_mode(session, arg))
        }
        "/continue-with-byok" | "/fork-byok" | "/byok" => {
            ParityCommandResult::DraftPrompt(continue_with_byok_draft(session, arg))
        }
        "/rate-limit-options" => {
            ParityCommandResult::SystemMessage(render_rate_limit_options(session))
        }
        "/stats" => ParityCommandResult::SystemMessage(render_stats(session)),
        "/passes" => ParityCommandResult::SystemMessage(render_passes(session)),
        "/sandbox" => ParityCommandResult::SystemMessage(render_sandbox(session)),
        "/agents" => ParityCommandResult::SystemMessage(render_agents(arg)),
        "/chrome" => ParityCommandResult::SystemMessage(render_chrome()),
        "/ide" => ParityCommandResult::SystemMessage(render_ide()),
        "/doctor" | "/diagnose" | "/health" => {
            ParityCommandResult::SystemMessage(render_doctor(session))
        }
        "/release-notes" | "/changelog" => {
            ParityCommandResult::SystemMessage(render_release_notes())
        }
        "/keybindings" | "/keys" => ParityCommandResult::SystemMessage(render_keybindings()),
        "/effort" => ParityCommandResult::SystemMessage(render_effort(arg)),
        "/statusline" => ParityCommandResult::SystemMessage(render_statusline()),
        "/desktop" | "/app" => {
            ParityCommandResult::SystemMessage(render_companion("Desktop"))
        }
        "/mobile" | "/ios" | "/android" => {
            ParityCommandResult::SystemMessage(render_companion("Mobile"))
        }
        "/install-github-app" => {
            ParityCommandResult::SystemMessage(render_install_app("GitHub"))
        }
        "/install-slack-app" => ParityCommandResult::SystemMessage(render_install_app("Slack")),
        "/tag" => ParityCommandResult::SystemMessage(handle_tag(session, arg)),
        "/upgrade" => ParityCommandResult::SystemMessage(render_upgrade()),
        "/vim" => ParityCommandResult::SystemMessage(render_vim(arg)),
        "/color" => ParityCommandResult::SystemMessage(
            "Color command recognized. Theme color is controlled by /theme; prompt accent persistence is coming through shared settings.".into(),
        ),
        "/heapdump" => ParityCommandResult::SystemMessage(
            "Heap diagnostics are not enabled in this build. Use /stats for session counters and AGIWORKFORCE_DEBUG=1 for logs.".into(),
        ),
        "/stickers" => ParityCommandResult::SystemMessage(
            "Stickers are a Claude UI affordance. AGI Workforce keeps this command for migration compatibility; no local sticker pack is installed.".into(),
        ),
        "/thinkback-play" => ParityCommandResult::SystemMessage(
            "Think Back playback is not installed. Use /think-back to generate a recap prompt for this session.".into(),
        ),
        "/recap" => ParityCommandResult::Prompt(recap_prompt(arg)),
        "/security-review" => ParityCommandResult::Prompt(security_review_prompt(arg)),
        "/pr-comments" => ParityCommandResult::Prompt(pr_comments_prompt(arg)),
        "/ultrareview" => ParityCommandResult::Prompt(ultrareview_prompt(arg)),
        "/think-back" => ParityCommandResult::Prompt(think_back_prompt(arg)),
        "/remote-control" | "/rc" => {
            ParityCommandResult::SystemMessage(render_remote_control())
        }
        "/debug" => ParityCommandResult::SystemMessage(handle_debug(session)),
        "/tui" => ParityCommandResult::SystemMessage(handle_tui(session, arg)),
        "/powerup" => ParityCommandResult::Prompt(powerup_prompt(arg)),
        _ => ParityCommandResult::NotHandled,
    }
}

pub fn handle_add_dir(session: &mut AgentSession, arg: &str) -> String {
    let dirs = split_shell_words(arg);
    if dirs.is_empty() {
        return "Usage: /add-dir <directory> [more directories...]".to_string();
    }

    let mut lines = Vec::new();
    for dir in dirs {
        match session.add_context_dir(&dir) {
            Ok(report) => {
                let state = if report.already_present {
                    "already present"
                } else {
                    "added"
                };
                let instructions = if report.instructions_loaded {
                    "instructions loaded"
                } else {
                    "no instructions found"
                };
                lines.push(format!(
                    "{}: {} ({})",
                    state,
                    report.path.display(),
                    instructions
                ));
            }
            Err(e) => lines.push(format!("failed: {dir} ({e})")),
        }
    }
    lines.join("\n")
}

pub fn handle_files(session: &mut AgentSession, arg: &str) -> String {
    let paths = split_shell_words(arg);
    if paths.is_empty() {
        return render_context_files(session);
    }

    let report = session.attach_context_files(paths);
    let mut lines = Vec::new();
    for path in &report.added {
        lines.push(format!("attached: {}", path.display()));
    }
    for path in &report.skipped_existing {
        lines.push(format!("already attached: {}", path.display()));
    }
    for path in &report.truncated {
        lines.push(format!("truncated to budget: {}", path.display()));
    }
    for (path, error) in &report.failed {
        lines.push(format!("failed: {path} ({error})"));
    }
    if lines.is_empty() {
        "No files attached.".to_string()
    } else {
        lines.join("\n")
    }
}

pub fn render_context_files(session: &AgentSession) -> String {
    let mut lines = Vec::new();
    lines.push("Context files".to_string());
    if session.attached_context_files.is_empty() {
        lines.push("  attached: none".to_string());
    } else {
        lines.push(format!(
            "  attached: {} file(s)",
            session.attached_context_files.len()
        ));
        for path in &session.attached_context_files {
            lines.push(format!("    {}", path.display()));
        }
    }

    let roots = crate::path_security::registered_additional_workspace_roots();
    if roots.is_empty() {
        lines.push("  additional directories: none".to_string());
    } else {
        lines.push(format!("  additional directories: {}", roots.len()));
        for root in roots {
            lines.push(format!("    {}", root.display()));
        }
    }
    lines.join("\n")
}

pub fn render_privacy_settings(session: &AgentSession) -> String {
    [
        "Privacy settings".to_string(),
        format!(
            "  Active mode: {} ({})",
            session.privacy_mode.label(),
            session.privacy_mode.description()
        ),
        format!(
            "  Provider route: {} ({})",
            session.provider_privacy_mode().label(),
            session.provider_privacy_mode().description()
        ),
        "  Local file access: explicit workspace roots only".to_string(),
        "  Additional roots: opt-in with --add-dir or /add-dir".to_string(),
        "  Local -> BYOK: explicit only with /continue-with-byok".to_string(),
        "  Attached files: never included in BYOK handoff drafts automatically".to_string(),
        "  Telemetry: CLI-local unless managed cloud features are enabled".to_string(),
        "  Sync: opt-in with agi sync".to_string(),
    ]
    .join("\n")
}

pub fn handle_privacy_mode(session: &mut AgentSession, arg: &str) -> String {
    let trimmed = arg.trim();
    if trimmed.is_empty() {
        return render_privacy_settings(session);
    }

    let Some(mode) = PrivacyMode::from_arg(trimmed) else {
        return "Usage: /privacy-mode local | byok | managed".to_string();
    };

    session.set_privacy_mode(mode);
    let mut lines = vec![
        format!("Privacy mode set: {}", mode.label()),
        format!("  {}", mode.description()),
    ];
    if mode == PrivacyMode::Local && session.provider_privacy_mode() != PrivacyMode::Local {
        lines.push(format!(
            "  warning: current model `{}` routes through {} mode; sends are blocked until you switch to a local model or explicitly choose BYOK.",
            session.model,
            session.provider_privacy_mode().label()
        ));
    }
    lines.join("\n")
}

pub fn continue_with_byok_draft(session: &AgentSession, arg: &str) -> String {
    let selected = selected_handoff_messages(session, arg);
    let transcript = if selected.is_empty() {
        "No non-system conversation messages were selected.".to_string()
    } else {
        selected
            .iter()
            .map(|message| {
                format!(
                    "{}:\n{}",
                    message.role,
                    redact_sensitive_lines(&message.text_content())
                )
            })
            .collect::<Vec<_>>()
            .join("\n\n---\n\n")
    };

    let mut lines = vec![
        "You are continuing an AGI Workforce Local chat in BYOK mode.".to_string(),
        String::new(),
        "Privacy boundary: the user explicitly selected this handoff. Do not assume attached files, local-only tool outputs, or unlisted context are available.".to_string(),
        format!("Source privacy mode: {}", session.privacy_mode.label()),
        format!("Current model: {}", session.model),
        format!("Current provider route: {}", session.provider_privacy_mode().label()),
        format!("Selected messages: {}", selected.len()),
    ];

    if !session.attached_context_files.is_empty() {
        lines.push(format!(
            "Attached files excluded from this handoff: {}",
            session.attached_context_files.len()
        ));
        for path in &session.attached_context_files {
            lines.push(format!("  - {}", path.display()));
        }
    }

    lines.extend([
        String::new(),
        "Review the transcript below, then continue the task from the latest user intent."
            .to_string(),
        String::new(),
        "<selected_local_transcript>".to_string(),
        transcript,
        "</selected_local_transcript>".to_string(),
    ]);
    lines.join("\n")
}

fn selected_handoff_messages<'a>(
    session: &'a AgentSession,
    arg: &str,
) -> Vec<&'a crate::models::Message> {
    let non_system = session
        .messages
        .iter()
        .filter(|message| message.role != "system")
        .collect::<Vec<_>>();
    if non_system.is_empty() {
        return Vec::new();
    }

    let limit = parse_handoff_limit(arg).unwrap_or(8);
    if limit == usize::MAX || non_system.len() <= limit {
        non_system
    } else {
        non_system[non_system.len() - limit..].to_vec()
    }
}

fn parse_handoff_limit(arg: &str) -> Option<usize> {
    let words = split_shell_words(arg);
    if words.is_empty() {
        return None;
    }
    if words.iter().any(|word| word.eq_ignore_ascii_case("full")) {
        return Some(usize::MAX);
    }
    for pair in words.windows(2) {
        if pair[0].eq_ignore_ascii_case("last") {
            if let Ok(limit) = pair[1].parse::<usize>() {
                return Some(limit.max(1));
            }
        }
    }
    words
        .iter()
        .find_map(|word| word.parse::<usize>().ok())
        .map(|limit| limit.max(1))
}

fn redact_sensitive_lines(text: &str) -> String {
    text.lines()
        .map(|line| {
            let lower = line.to_ascii_lowercase();
            if lower.contains("api_key")
                || lower.contains("apikey")
                || lower.contains("authorization:")
                || lower.contains("bearer ")
                || lower.contains("password")
                || lower.contains("private key")
                || lower.contains("secret")
                || lower.contains("token=")
                || lower.contains("token:")
                || lower.contains("sk-")
            {
                "[redacted sensitive line]".to_string()
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn render_rate_limit_options(session: &AgentSession) -> String {
    let mut lines = vec![
        "Rate-limit options".to_string(),
        "  Use /fallback to inspect model fallback routing.".to_string(),
        "  Start with -m model_a,model_b to rotate on rate limits.".to_string(),
        "  Use /fast to switch to the configured fast model.".to_string(),
        format!("  Current model: {}", session.model),
    ];
    if let Some(chain) = &session.fallback_chain {
        lines.push(format!(
            "  Active fallback chain: {}",
            chain.primaries.join(" -> ")
        ));
    } else {
        lines.push("  Active fallback chain: none".to_string());
    }
    lines.join("\n")
}

pub fn render_stats(session: &AgentSession) -> String {
    format!(
        "Session stats\n  turns: {}\n  input tokens: {}\n  output tokens: {}\n  cache read: {}\n  cache write: {}\n  estimated cost: ${:.6}\n  checkpoints: {}",
        session.turn_count,
        session.total_input_tokens,
        session.total_output_tokens,
        session.total_cache_read_tokens,
        session.total_cache_creation_tokens,
        session.cost_ledger.total_usd,
        session.checkpoint_count(),
    )
}

pub fn render_passes(session: &AgentSession) -> String {
    format!(
        "Active passes\n  permission mode: {:?}\n  plan mode: {}\n  plan approved: {}\n  auto-approve safe tools: {}\n  skip permissions: {}\n  additional directories: {}",
        session.permission_mode,
        session.plan_mode,
        session.plan_approved,
        session.auto_approve_safe,
        session.skip_permissions,
        crate::path_security::registered_additional_workspace_roots().len(),
    )
}

pub fn render_sandbox(session: &AgentSession) -> String {
    let roots = crate::path_security::registered_additional_workspace_roots();
    let mut lines = vec![
        "Sandbox".to_string(),
        format!("  permission mode: {:?}", session.permission_mode),
        format!("  skip permissions: {}", session.skip_permissions),
        format!("  additional roots: {}", roots.len()),
    ];
    for root in roots {
        lines.push(format!("    {}", root.display()));
    }
    lines.join("\n")
}

pub fn handle_tag(session: &mut AgentSession, arg: &str) -> String {
    if arg.trim().is_empty() {
        return format!(
            "Current session tag: {}",
            session.session_name.as_deref().unwrap_or("<unset>")
        );
    }
    session.session_name = Some(arg.trim().to_string());
    format!("Session tagged: {}", arg.trim())
}

pub fn render_install_app(app_name: &str) -> String {
    let url = match app_name {
        "GitHub" | "github" | "install-github-app" => {
            Some("https://github.com/apps/agiworkforce/installations/new")
        }
        "Slack" | "slack" | "install-slack-app" => {
            Some("https://api.slack.com/apps?new_app=1")
        }
        _ => None,
    };

    if let Some(install_url) = url {
        let opened = webbrowser::open(install_url).is_ok();
        if opened {
            format!(
                "{app_name} app installation\n  Opening install page in your browser: {install_url}\n  Complete the authorization flow and then reconnect via /plugin."
            )
        } else {
            format!(
                "{app_name} app installation\n  Visit: {install_url}\n  Complete the authorization flow and then reconnect via /plugin."
            )
        }
    } else {
        format!(
            "{app_name} app integration\n  Use the connector/app plugin flow when available.\n  Authenticate in the target service, then run /plugin or agi plugin list."
        )
    }
}

pub fn render_companion(surface: &str) -> String {
    format!(
        "{surface} companion\n  AGI Workforce CLI is the source of truth for tools, sessions, MCP, skills, and permissions.\n  Companion surfaces should reuse the CLI engine contracts exposed by this crate."
    )
}

pub fn render_upgrade() -> String {
    "Upgrade options\n  Local/BYOK: use your own provider keys.\n  Managed cloud: authenticate with /login.\n  Extra usage: /extra-usage".to_string()
}

pub fn render_vim(arg: &str) -> String {
    match arg.trim() {
        "on" | "true" | "1" => "Vim mode requested. Restart with AGIWORKFORCE_VI=1.".to_string(),
        "off" | "false" | "0" => {
            "Vim mode disabled for new shells by unsetting AGIWORKFORCE_VI.".to_string()
        }
        _ => "Vim mode: set AGIWORKFORCE_VI=1 before launching the CLI.".to_string(),
    }
}

pub fn review_prompt(arg: &str) -> String {
    if arg.trim().is_empty() {
        "Please review my current code changes. Run `git diff` to see what changed, then analyze for bugs, security issues, and improvements.".to_string()
    } else {
        format!(
            "Please review the code related to: {}. Look for bugs, security issues, and improvements.",
            arg.trim()
        )
    }
}

pub fn render_copy() -> String {
    "Copy is available in the TUI for the last assistant response. In REPL mode, select or redirect terminal output directly.".to_string()
}

pub fn render_mcp(session: &AgentSession) -> String {
    let Some(tools) = session.mcp_info() else {
        return "No MCP servers connected.".to_string();
    };

    let mut servers: Vec<&str> = tools.iter().map(|tool| tool.server_name.as_str()).collect();
    servers.sort_unstable();
    servers.dedup();

    let mut lines = vec![format!("MCP servers ({})", servers.len())];
    for server in servers {
        let server_tools: Vec<_> = tools
            .iter()
            .filter(|tool| tool.server_name == server)
            .collect();
        lines.push(format!("  {} ({} tools)", server, server_tools.len()));
        for tool in server_tools.iter().take(5) {
            lines.push(format!(
                "    {:<25} {}",
                tool.original_name, tool.description
            ));
        }
        if server_tools.len() > 5 {
            lines.push(format!("    ... +{} more", server_tools.len() - 5));
        }
    }
    lines.join("\n")
}

pub fn render_tasks() -> String {
    let tasks = crate::tools::session_task_summaries();
    if tasks.is_empty() {
        return "Tasks\n  no background tasks in this session".to_string();
    }

    let mut lines = vec![format!("Tasks ({})", tasks.len())];
    for task in tasks {
        lines.push(format!("  {task}"));
    }
    lines.join("\n")
}

pub fn handle_output_style(session: &mut AgentSession, arg: &str) -> String {
    if arg.trim().is_empty() {
        let mut lines = vec![
            format!("Active output style: {}", session.output_style),
            "Available styles:".to_string(),
        ];
        for style in crate::output_styles::load_all() {
            let marker = if style.name == session.output_style {
                "*"
            } else {
                " "
            };
            lines.push(format!(
                "  {marker} {:<14} {}",
                style.name, style.description
            ));
        }
        lines.push("Switch with: /output-style <name>".to_string());
        return lines.join("\n");
    }

    session.apply_output_style(arg.trim());
    format!(
        "Output style: {} (applies on next turn)",
        session.output_style
    )
}

pub fn render_fallback(session: &AgentSession) -> String {
    match session.fallback_chain.as_ref() {
        Some(chain) if !chain.primaries.is_empty() => {
            let head = chain.head().unwrap_or("?");
            let tail = chain.tail().join(" -> ");
            let display = if tail.is_empty() {
                head.to_string()
            } else {
                format!("{head} -> {tail}")
            };
            format!("Fallback chain: {display}\nRotates on: {:?}", chain.on)
        }
        _ => "No fallback chain set. Restart with -m a,b,c to enable.".to_string(),
    }
}

pub fn render_replay() -> String {
    "Session replay: run\n  agi session list\n  agi session fork <id> --at-turn N --as <name>"
        .to_string()
}

pub fn render_insights(session: &AgentSession) -> String {
    let session_id = session.managed_session_id().unwrap_or("(no session)");
    format!(
        "Inspect this session as JSONL events:\n  agi exec --json-events --session {session_id} \"<prompt>\" | jq"
    )
}

pub fn render_advisor(arg: &str) -> String {
    if arg.trim().is_empty() {
        return "Advisor: consult a higher-tier model without affecting context.\n  Usage: /advisor <question>\n  Default model: claude-opus-4-7. Set with AGIWORKFORCE_ADVISOR_MODEL env.".to_string();
    }
    format!(
        "Advisor request captured: {}\n  Dedicated advisor routing is not enabled in this build; send this as /btw or a normal prompt.",
        arg.trim()
    )
}

pub fn render_team_onboarding() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let path = std::path::PathBuf::from(home)
        .join(".claude")
        .join("team-onboarding.md");
    if path.exists() {
        return match std::fs::read_to_string(&path) {
            Ok(content) => format!("# Team onboarding\n\n{content}"),
            Err(e) => format!("Failed to read {}: {e}", path.display()),
        };
    }
    format!(
        "No team-onboarding guide found at {}. Run `agi onboarding` to generate one.",
        path.display()
    )
}

pub fn render_terminal_setup() -> String {
    [
        "Shell integration:",
        "# Add to ~/.bashrc or ~/.zshrc:",
        "export AGIWORKFORCE_HOME=\"$HOME/.agiworkforce\"",
        "# agi is the primary command; agiworkforce remains a compatibility alias",
        "# fish: set -gx AGIWORKFORCE_HOME ~/.agiworkforce",
    ]
    .join("\n")
}

pub fn render_reload_plugins() -> String {
    let mut manager = crate::plugins::PluginsManager::new();
    match manager.load_all(None) {
        Ok(plugins) => format!("Reloaded {} plugin(s).", plugins.len()),
        Err(e) => format!("Plugin reload failed: {e}"),
    }
}

pub fn render_extra_usage() -> String {
    "Pricing & extra usage:\n  https://agiworkforce.com/pricing\nLocal + BYOK: free forever.\nHobby: managed cloud with credits.".to_string()
}

pub fn render_remote_env() -> String {
    let mut lines = vec!["# Remote-env defaults".to_string()];
    for key in [
        "AGIWORKFORCE_API_BASE",
        "AGIWORKFORCE_PROXY",
        "HTTPS_PROXY",
        "HTTP_PROXY",
        "NO_PROXY",
    ] {
        let value = std::env::var(key).unwrap_or_else(|_| "<unset>".to_string());
        lines.push(format!("{key} = {value}"));
    }
    lines.join("\n")
}

pub fn render_effort(arg: &str) -> String {
    if arg.trim().is_empty() {
        return "Effort: use /effort low | medium | high | max in TUI mode, or pass the model-specific reasoning option through config when available.".to_string();
    }
    format!(
        "Effort level `{}` recognized. The REPL will use the configured model defaults; TUI mode applies effort interactively.",
        arg.trim()
    )
}

pub fn render_statusline() -> String {
    "Statusline setup is available in TUI mode. In REPL mode, use /status, /usage, and /context for the same session telemetry.".to_string()
}

pub fn render_agents(arg: &str) -> String {
    crate::agents::render_agents_command(arg)
}

pub fn render_chrome() -> String {
    [
        "Chrome integration",
        "  Use the AGI Workforce Chrome extension for browser context and page actions.",
        "  Install or inspect the extension from apps/extension-vscode or the Chrome listing when packaged.",
        "  CLI engine compatibility: MCP, tools, permissions, and session context remain owned by the Rust CLI.",
    ]
    .join("\n")
}

pub fn render_ide() -> String {
    [
        "IDE integration",
        "  Use the VS Code extension for editor context, selections, diagnostics, and chat.",
        "  CLI engine compatibility: slash commands, tools, permissions, and session state should stay shared.",
        "  Start from the extension package in apps/extension-vscode.",
    ]
    .join("\n")
}

pub fn render_doctor(session: &AgentSession) -> String {
    let (config, config_note) = match crate::config::CliConfig::load_merged() {
        Ok(config) => (config, None),
        Err(err) => (
            crate::config::CliConfig::default(),
            Some(format!(
                "  config: failed to load merged config; using defaults ({err})"
            )),
        ),
    };
    let report = crate::doctor::collect_doctor_report(&config);
    let mut lines = vec![
        "Diagnostics".to_string(),
        crate::doctor::format_text_report(&report),
        String::new(),
        "Session".to_string(),
        format!("  model: {}", session.model),
        format!("  provider: {:?}", session.provider),
        format!("  privacy mode: {}", session.privacy_mode.label()),
        format!("  permission mode: {:?}", session.permission_mode),
        format!("  skip permissions: {}", session.skip_permissions),
    ];

    if let Some(note) = config_note {
        lines.push(note);
    }

    let mcp_tool_count = session.mcp_info().map(|tools| tools.len()).unwrap_or(0);
    lines.push(format!("  live mcp tools: {mcp_tool_count}"));

    lines.push(format!(
        "  agents: {}",
        crate::agents::discover_agents().len()
    ));
    lines.push(format!(
        "  additional roots: {}",
        crate::path_security::registered_additional_workspace_roots().len()
    ));
    lines.push(format!(
        "  attached files: {}",
        session.attached_context_files.len()
    ));
    lines.join("\n")
}

pub fn render_release_notes() -> String {
    let path = std::path::Path::new("CHANGELOG.md");
    let Ok(content) = std::fs::read_to_string(path) else {
        return "Release notes\n  CHANGELOG.md was not found in the current working directory."
            .to_string();
    };

    let mut section = Vec::new();
    let mut in_first_section = false;
    for line in content.lines() {
        if line.starts_with("## ") {
            if in_first_section {
                break;
            }
            in_first_section = true;
        }
        if in_first_section {
            section.push(line);
        }
    }

    if section.is_empty() {
        return "Release notes\n  No release sections found in CHANGELOG.md.".to_string();
    }

    let latest = section.join("\n");
    let latest = if latest.chars().count() > 4_000 {
        let mut truncated: String = latest.chars().take(4_000).collect();
        truncated.push_str("\n... truncated ...");
        truncated
    } else {
        latest
    };
    format!("Release notes\n{latest}")
}

pub fn render_keybindings() -> String {
    [
        "Keybindings",
        "  /             open command palette",
        "  Shift+Tab     cycle permission mode",
        "  Up/Down       scroll chat history or navigate overlays",
        "  Enter         send prompt or confirm focused overlay action",
        "  Esc           close overlay or quit",
        "  Ctrl-L        clear screen",
        "  Ctrl-C        clear current input",
        "  AGIWORKFORCE_VI=1 enables vi-style line editing in REPL mode",
    ]
    .join("\n")
}

pub fn recap_prompt(arg: &str) -> String {
    let focus = if arg.trim().is_empty() {
        "this session"
    } else {
        arg.trim()
    };
    format!(
        "Summarize {focus}. Include the current objective, decisions made, files or commands touched, verification already run, open risks, and the next concrete actions."
    )
}

pub fn security_review_prompt(arg: &str) -> String {
    let scope = if arg.trim().is_empty() {
        "the current repository and uncommitted changes"
    } else {
        arg.trim()
    };
    format!(
        "Run a security-focused review of {scope}. Inspect the relevant code and git diff. Prioritize exploitable bugs, unsafe command/file handling, secret exposure, network trust boundaries, injection risks, auth bypasses, and missing tests. Return findings first with file/line references."
    )
}

pub fn pr_comments_prompt(arg: &str) -> String {
    let scope = if arg.trim().is_empty() {
        "the current pull request"
    } else {
        arg.trim()
    };
    format!(
        "Inspect actionable review comments for {scope}. Summarize unresolved comments, identify required code changes, then implement the fixes if repository access is available."
    )
}

pub fn ultrareview_prompt(arg: &str) -> String {
    let scope = if arg.trim().is_empty() {
        "the current branch"
    } else {
        arg.trim()
    };
    format!(
        "Run an ultrareview of {scope}: perform a deep bug-hunt across changed code and adjacent contracts. Check correctness, security, concurrency, data loss, migrations, CLI UX regressions, and missing tests. Lead with only high-confidence findings."
    )
}

pub fn think_back_prompt(arg: &str) -> String {
    let focus = if arg.trim().is_empty() {
        "this session"
    } else {
        arg.trim()
    };
    format!(
        "Create a concise Think Back recap for {focus}: key goals, major decisions, files changed, tests run, unresolved risks, and the next best actions."
    )
}

pub fn render_remote_control() -> String {
    "AGI desktop bridge listens on port 8787. Launch the desktop companion first, then reconnect \
     this CLI session to mirror commands and share context. Use /desktop to open the companion \
     or run `agiworkforce bridge --port 8787` for a manual connection."
        .to_string()
}

pub fn handle_debug(session: &mut AgentSession) -> String {
    session.debug_mode = !session.debug_mode;
    if session.debug_mode {
        "Debug mode ON — verbose tool output and hook traces enabled.".to_string()
    } else {
        "Debug mode OFF.".to_string()
    }
}

pub fn handle_tui(_session: &mut AgentSession, arg: &str) -> String {
    match arg.trim() {
        "fullscreen" | "full" | "on" | "1" | "true" => {
            "TUI renderer: fullscreen mode requested. Restart without --no-tui to apply.".to_string()
        }
        "default" | "off" | "0" | "false" => {
            "TUI renderer: REPL (default) mode requested. Restart with --no-tui to apply.".to_string()
        }
        "" => {
            let active = std::env::var("AGIWORKFORCE_NO_TUI").is_ok_and(|v| v == "1");
            let current = if active { "default (REPL)" } else { "fullscreen (TUI)" };
            format!(
                "Current renderer: {current}\n  Use /tui fullscreen to enable the TUI renderer or /tui default to use REPL mode."
            )
        }
        other => format!(
            "Unknown renderer '{other}'. Valid options: default, fullscreen."
        ),
    }
}

pub fn powerup_prompt(arg: &str) -> String {
    let topic = arg.trim();
    if topic.is_empty() {
        "Walk me through the top 5 AGI Workforce CLI features I should know about. For each \
         feature: state its name, show a one-line example command, and explain what problem it \
         solves. Keep each lesson concise and interactive — ask me to try one before moving on."
            .to_string()
    } else {
        format!(
            "Teach me how to use the '{topic}' feature of the AGI Workforce CLI. Show a \
             concrete example, explain when to use it, and end with a quick exercise I can try."
        )
    }
}

pub fn split_shell_words(input: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut escaped = false;

    for ch in input.chars() {
        if escaped {
            current.push(ch);
            escaped = false;
            continue;
        }
        if ch == '\\' {
            escaped = true;
            continue;
        }
        match quote {
            Some(q) if ch == q => quote = None,
            Some(_) => current.push(ch),
            None if ch == '"' || ch == '\'' => quote = Some(ch),
            None if ch.is_whitespace() => {
                if !current.is_empty() {
                    words.push(std::mem::take(&mut current));
                }
            }
            None => current.push(ch),
        }
    }
    if escaped {
        current.push('\\');
    }
    if !current.is_empty() {
        words.push(current);
    }
    words
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::SystemContext;

    fn test_session() -> AgentSession {
        AgentSession::new(
            "test-model",
            &SystemContext {
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
            },
            None,
        )
    }

    #[test]
    fn shell_word_split_supports_quotes() {
        assert_eq!(
            split_shell_words("one \"two words\" 'three words'"),
            vec!["one", "two words", "three words"]
        );
    }

    #[test]
    fn files_command_attaches_context_file() {
        let mut session = test_session();
        let file = tempfile::NamedTempFile::new_in(".").expect("workspace file");
        std::fs::write(file.path(), "hello attached").unwrap();

        let output = handle_files(&mut session, &file.path().to_string_lossy());

        assert!(output.contains("attached:"));
        assert_eq!(session.attached_context_files.len(), 1);
    }

    #[test]
    fn add_dir_command_registers_directory() {
        crate::path_security::clear_additional_workspace_roots_for_tests();
        let mut session = test_session();
        let dir = tempfile::tempdir().expect("extra dir");

        let output = handle_add_dir(&mut session, &dir.path().to_string_lossy());

        assert!(output.contains("added:"));
        assert_eq!(session.additional_context_dirs.len(), 1);
        crate::path_security::clear_additional_workspace_roots_for_tests();
    }

    #[test]
    fn shared_command_returns_system_message() {
        let mut session = test_session();

        let result = handle_shared_command("/privacy-settings", "", &mut session);

        match result {
            ParityCommandResult::SystemMessage(message) => {
                assert!(message.contains("Privacy settings"));
            }
            other => panic!("expected system message, got {other:?}"),
        }
    }

    #[test]
    fn shared_command_returns_prompt() {
        let mut session = test_session();

        let result = handle_shared_command("/security-review", "auth module", &mut session);

        match result {
            ParityCommandResult::Prompt(prompt) => {
                assert!(prompt.contains("security-focused review"));
                assert!(prompt.contains("auth module"));
            }
            other => panic!("expected prompt, got {other:?}"),
        }
    }

    #[test]
    fn shared_command_mutates_session_for_tag() {
        let mut session = test_session();

        let result = handle_shared_command("/tag", "claude-parity", &mut session);

        assert!(matches!(result, ParityCommandResult::SystemMessage(_)));
        assert_eq!(session.session_name.as_deref(), Some("claude-parity"));
    }

    #[test]
    fn shared_command_ignores_unknown_commands() {
        let mut session = test_session();

        let result = handle_shared_command("/not-real", "", &mut session);

        assert_eq!(result, ParityCommandResult::NotHandled);
    }

    #[test]
    fn shared_runtime_command_names_are_handled() {
        for command in shared_runtime_command_names() {
            let mut session = test_session();
            let arg = match *command {
                "privacy-mode" | "trust-boundary" => "byok",
                "tag" => "test-tag",
                "add-dir" => ".",
                "files" => "",
                "output-style" => "",
                _ => "test",
            };

            let result = handle_shared_command(command, arg, &mut session);

            assert_ne!(
                result,
                ParityCommandResult::NotHandled,
                "/{command} is listed as shared runtime command but is not handled"
            );
        }
    }

    #[test]
    fn shared_command_handles_registered_runtime_equivalents() {
        let mut session = test_session();

        for (command, expected) in [
            ("/agents", "Agents"),
            ("/chrome", "Chrome integration"),
            ("/ide", "IDE integration"),
            ("/diagnose", "Diagnostics"),
            ("/changelog", "Release notes"),
            ("/keys", "Keybindings"),
            ("/trust-boundary", "Privacy settings"),
        ] {
            let result = handle_shared_command(command, "", &mut session);
            match result {
                ParityCommandResult::SystemMessage(message) => {
                    assert!(message.contains(expected), "{command} output: {message}");
                }
                other => panic!("expected system message for {command}, got {other:?}"),
            }
        }
    }

    #[test]
    fn privacy_mode_command_sets_boundary() {
        let mut session = test_session();

        let result = handle_shared_command("/privacy-mode", "byok", &mut session);

        assert!(matches!(result, ParityCommandResult::SystemMessage(_)));
        assert_eq!(session.privacy_mode, PrivacyMode::Byok);
    }

    #[test]
    fn continue_with_byok_returns_reviewable_draft() {
        let mut session = test_session();
        session.messages.push(crate::models::Message::text(
            "user",
            "use api_key = sk-test-secret",
        ));
        session.messages.push(crate::models::Message::text(
            "assistant",
            "I will keep it local.",
        ));

        let result = handle_shared_command("/continue-with-byok", "full", &mut session);

        match result {
            ParityCommandResult::DraftPrompt(prompt) => {
                assert!(prompt.contains("Local chat in BYOK mode"));
                assert!(prompt.contains("[redacted sensitive line]"));
                assert!(!prompt.contains("sk-test-secret"));
            }
            other => panic!("expected draft prompt, got {other:?}"),
        }
    }

    #[test]
    fn shared_recap_command_returns_prompt() {
        let mut session = test_session();

        let result = handle_shared_command("/recap", "the migration work", &mut session);

        match result {
            ParityCommandResult::Prompt(prompt) => {
                assert!(prompt.contains("the migration work"));
                assert!(prompt.contains("next concrete actions"));
            }
            other => panic!("expected prompt, got {other:?}"),
        }
    }
}
