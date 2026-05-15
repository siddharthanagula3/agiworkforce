use colored::Colorize;

use crate::agent::AgentSession;
use crate::config::CliConfig;
use crate::output;

use super::dialogs;
use super::registry;

#[derive(PartialEq, Eq)]
pub(super) enum SlashResult {
    Handled,
    Exit,
    Login,
    Logout,
    /// Side query — carries the question text for async execution.
    Btw(String),
    /// Enter voice mode with the given language code.
    Voice(String),
    /// A2A command — carries (subcommand, args) for async execution.
    A2a(String, String),
    /// Batch operation — carries (glob_pattern, prompt) for parallel file processing.
    Batch(String, String),
    /// Run ecosystem scan.
    Ecosystem(String),
    /// Run marketplace search.
    Marketplace(String),
    /// Run sync operation.
    Sync(String),
    /// Re-run onboarding wizard.
    Onboarding,
}

pub(super) fn handle_slash_command(
    input: &str,
    session: &mut AgentSession,
    config: &mut CliConfig,
) -> SlashResult {
    let parts: Vec<&str> = input.splitn(2, ' ').collect();
    let cmd = parts[0].to_lowercase();
    let arg = parts.get(1).map(|s| s.trim()).unwrap_or_default();

    match cmd.as_str() {
        "/exit" | "/quit" | "/q" => {
            return SlashResult::Exit;
        }
        "/model" | "/m" => {
            if arg.is_empty() {
                output::print_info(&format!("Current model: {}", session.model));
                output::print_info(
                    "Tip: run without --no-tui and type /model to open the \
                     interactive model picker (search + provider sections + effort selector).",
                );
            } else {
                session.switch_model(arg);
                let provider = format!("{:?}", session.provider).to_lowercase();
                output::print_info(&format!("Switched to {} ({})", arg, provider));
            }
        }
        "/clear" => {
            session.clear();
            output::print_info("Context cleared. Starting fresh.");
        }
        "/cost" => {
            let stats = crate::conversations::conversation_stats(session);
            eprintln!(
                "  Messages: {} ({} user, {} assistant, {} tool calls)",
                stats.total_messages,
                stats.user_messages,
                stats.assistant_messages,
                stats.tool_calls_count,
            );
            output::print_session_cost(
                &session.model,
                session.total_input_tokens,
                session.total_output_tokens,
                session.turn_count,
            );
        }
        "/save" => {
            registry::handle_save(session);
        }
        "/load" => {
            registry::handle_load(arg, session);
        }
        "/history" => {
            registry::handle_history();
        }
        "/delete" => {
            registry::handle_delete(arg);
        }
        "/export" => {
            registry::handle_export(arg, session);
        }
        "/providers" => {
            registry::handle_providers(config);
        }
        "/setup" => {
            dialogs::handle_setup(config);
        }
        "/permissions" | "/perms" => {
            registry::handle_permissions(arg);
        }
        "/models" => {
            eprintln!("{}", crate::provider::format_model_list());
        }
        "/skills" => {
            let all = crate::skills::discover_skills();
            eprintln!("{}", crate::skills::format_skill_list(&all));
        }
        "/hooks" => {
            let hcfg = crate::hooks::load_hooks().unwrap_or_default();
            eprintln!("{}", crate::hooks::format_hooks_list(&hcfg));
        }
        "/context" | "/ctx" => {
            eprintln!("{}", session.context_report());
        }
        "/status" => {
            eprintln!("{}", "Status:".cyan().bold());
            eprintln!("  Version:    {}", env!("CARGO_PKG_VERSION"));
            eprintln!("  Model:      {}", session.model);
            eprintln!("  Provider:   {:?}", session.provider);
            eprintln!(
                "  Plan mode:  {}",
                if session.plan_mode { "ON" } else { "OFF" }
            );
            eprintln!(
                "  Fast mode:  {}",
                if session.fast_mode { "ON" } else { "OFF" }
            );
            eprintln!("  Turns:      {}", session.turn_count);
            eprintln!(
                "  Tokens:     {} in / {} out",
                session.total_input_tokens, session.total_output_tokens
            );
            eprintln!("  Checkpoints: {}", session.checkpoint_count());
            eprintln!("  Skip perms: {}", session.skip_permissions);
        }
        "/sessions" => {
            registry::handle_sessions(arg);
        }
        "/rename" => {
            registry::handle_rename(arg);
        }
        "/import" | "/migrate" => {
            registry::handle_migrate();
        }
        "/compact" => {
            registry::handle_compact(arg, session);
        }
        "/btw" => {
            if arg.is_empty() {
                output::print_warn("Usage: /btw <question>");
            } else {
                return SlashResult::Btw(arg.to_string());
            }
        }
        "/plan" if arg.is_empty() || arg == "on" => {
            session.permission_mode = crate::cli_options::PermissionMode::Plan;
            session.plan_mode = true;
            session.plan_approved = false;
            output::print_info(
                "Plan mode ON. Ask the model to plan; then `/plan accept` or `/plan reject <feedback>`.",
            );
        }
        "/plan" if arg == "off" => {
            session.permission_mode = crate::cli_options::PermissionMode::Default;
            session.plan_mode = false;
            session.reset_plan_state();
            output::print_info("Plan mode OFF. All tools available.");
        }
        "/plan" if arg == "accept" || arg == "approve" => {
            if !matches!(
                session.permission_mode,
                crate::cli_options::PermissionMode::Plan
            ) {
                output::print_warn(
                    "/plan accept: not in plan mode. Use `/plan` to enter first.",
                );
            } else if session.current_plan.is_none() {
                output::print_warn(
                    "/plan accept: no plan to approve yet. Ask the model to call `update_plan` first.",
                );
            } else {
                session.plan_approved = true;
                output::print_info("Plan approved. Mutating tools enabled for this session.");
            }
        }
        "/plan" if arg.starts_with("reject") => {
            let feedback = arg.strip_prefix("reject").unwrap_or("").trim().to_string();
            if feedback.is_empty() {
                output::print_warn(
                    "/plan reject: needs a reason. Usage: /plan reject <feedback>",
                );
            } else {
                session.plan_rejection_feedback = Some(feedback);
                session.current_plan = None;
                session.current_plan_path = None;
                session.plan_approved = false;
                output::print_info(
                    "Plan rejected. Feedback queued for the model on the next turn.",
                );
            }
        }
        "/plan" if arg == "show" || arg == "view" => {
            match (&session.current_plan, &session.current_plan_path) {
                (Some(plan), Some(path)) => {
                    eprintln!("\n# Plan ({})\n\n{}", path.display(), plan.render_markdown());
                }
                (Some(plan), None) => {
                    eprintln!("\n{}", plan.render_markdown());
                }
                _ => output::print_info("No plan yet. Ask the model to call `update_plan`."),
            }
        }
        "/plan" => {
            output::print_warn(&format!(
                "Unknown /plan subcommand: {arg}. Use one of: on | off | accept | reject <feedback> | show"
            ));
        }
        "/fast" => {
            let fast_model = config.default.fast_model.as_deref();
            match arg {
                "on" => {
                    if !session.fast_mode {
                        session.toggle_fast_mode(fast_model);
                    }
                    output::print_info(&format!("Fast mode ON — using {}", session.model));
                }
                "off" => {
                    if session.fast_mode {
                        session.toggle_fast_mode(None);
                    }
                    output::print_info(&format!("Fast mode OFF — using {}", session.model));
                }
                _ => {
                    session.toggle_fast_mode(fast_model);
                    let status = if session.fast_mode { "ON" } else { "OFF" };
                    output::print_info(&format!("Fast mode {} — using {}", status, session.model));
                }
            }
        }
        "/rewind" => {
            registry::handle_rewind(arg, session);
        }
        "/branch" | "/fork" => {
            registry::handle_branch(arg, session);
        }
        "/diff" => {
            registry::handle_diff();
        }
        "/batch" => {
            let batch_parts: Vec<&str> = arg.splitn(2, ' ').collect();
            let glob_pat = batch_parts.first().copied().unwrap_or_default();
            let prompt = batch_parts.get(1).copied().unwrap_or_default();
            if glob_pat.is_empty() || prompt.is_empty() {
                output::print_warn(
                    "Usage: /batch <glob_pattern> <prompt>\n  Example: /batch src/**/*.rs add error handling",
                );
            } else {
                return SlashResult::Batch(glob_pat.to_string(), prompt.to_string());
            }
        }
        "/memory" | "/mem" => {
            registry::handle_memory(arg);
        }
        "/init" => {
            registry::handle_init_project();
        }
        "/config" => {
            registry::handle_config(arg, config);
        }
        "/voice" | "/v" => {
            let lang = if arg.is_empty() { "en" } else { arg };
            if !crate::voice::is_valid_language(lang) {
                let langs = crate::voice::supported_languages();
                let codes: Vec<&str> = langs.iter().map(|(c, _)| *c).collect();
                output::print_warn(&format!(
                    "Unsupported language '{}'. Supported: {}",
                    lang,
                    codes.join(", ")
                ));
            } else {
                return SlashResult::Voice(lang.to_string());
            }
        }
        "/theme" => {
            if arg.is_empty() {
                output::print_info(
                    "Available themes: dark | light | ansi | solarized-dark | solarized-light | colorblind\n  \
                     Use /theme <name> to set directly.\n  \
                     In TUI mode, /theme (no arg) opens the interactive picker with live preview.",
                );
            } else {
                use crate::tui::widgets::theme_picker::ThemeChoice;
                match ThemeChoice::from_arg(arg) {
                    Some(choice) => output::print_info(&format!("Theme set to {}", choice.label())),
                    None => output::print_warn(&format!(
                        "Unknown theme: '{arg}'. Available: dark | light | ansi | solarized-dark | solarized-light | colorblind"
                    )),
                }
            }
        }
        "/login" => {
            return SlashResult::Login;
        }
        "/logout" => {
            return SlashResult::Logout;
        }
        "/a2a" => {
            let a2a_parts: Vec<&str> = arg.splitn(2, ' ').collect();
            let subcmd = a2a_parts.first().copied().unwrap_or_default();
            let subarg = a2a_parts.get(1).copied().unwrap_or_default();
            if subcmd.is_empty() {
                output::print_warn("Usage: /a2a <discover|delegate|serve|register|card> [args]");
            } else {
                return SlashResult::A2a(subcmd.to_string(), subarg.to_string());
            }
        }
        "/ecosystem" | "/eco" => {
            let subcmd = if arg.is_empty() { "scan" } else { arg };
            return SlashResult::Ecosystem(subcmd.to_string());
        }
        "/marketplace" | "/market" => {
            let subcmd = if arg.is_empty() { "list" } else { arg };
            return SlashResult::Marketplace(subcmd.to_string());
        }
        "/sync" => {
            let subcmd = if arg.is_empty() { "status" } else { arg };
            return SlashResult::Sync(subcmd.to_string());
        }
        "/onboarding" => {
            return SlashResult::Onboarding;
        }
        "/auth" => match crate::auth::auth_status() {
            Ok(statuses) => {
                if statuses.is_empty() {
                    eprintln!("No authentication configured. Use /login to authenticate.");
                } else {
                    eprintln!("{}", "Auth Status:".cyan().bold());
                    for s in &statuses {
                        eprintln!(
                            "  {:<18} {:<10} {}{}",
                            s.provider,
                            s.auth_type,
                            s.status,
                            s.expires_in
                                .as_ref()
                                .map(|e| format!(" (expires: {})", e))
                                .unwrap_or_default(),
                        );
                    }
                }
            }
            Err(e) => {
                output::print_error(&format!("Failed to read auth status: {}", e));
            }
        },
        "/help" | "/h" | "/?" => {
            print_help();
        }
        _ => {
            output::print_warn(&format!(
                "Unknown command: {}. Type /help for available commands.",
                cmd
            ));
        }
    }

    SlashResult::Handled
}

pub(super) fn print_help() {
    eprintln!("{}", "Agent & Mode:".cyan().bold());
    eprintln!(
        "  {}    Switch model (e.g. /model gpt-5.5)",
        "/model <name>".bold()
    );
    eprintln!(
        "  {}             Toggle plan mode (read-only tools)",
        "/plan".bold()
    );
    eprintln!(
        "  {}    Toggle fast mode (cheaper model)",
        "/fast [on|off]".bold()
    );
    eprintln!("  {} Manual context compaction", "/compact [focus]".bold());
    eprintln!(
        "  {}  Set syntax theme (dark/light/ansi/solarized-dark/…)",
        "/theme [name]".bold()
    );
    eprintln!(
        "  {}  Side query (not added to history)",
        "/btw <question>".bold()
    );
    eprintln!(
        "  {}  Voice input (push-to-talk with Whisper STT)",
        "/voice [lang]".bold()
    );
    eprintln!(
        "  {}           Rewind to previous checkpoint",
        "/rewind".bold()
    );
    eprintln!(
        "  {}   Fork conversation at current point",
        "/branch [name]".bold()
    );
    eprintln!(
        "  {}             Show uncommitted git changes",
        "/diff".bold()
    );
    eprintln!(
        "  {} Batch apply prompt to files",
        "/batch <glob> <prompt>".bold()
    );
    eprintln!();
    eprintln!("{}", "Configuration:".cyan().bold());
    eprintln!(
        "  {}           Show current configuration",
        "/config".bold()
    );
    eprintln!("  {} Set config value", "/config set <k> <v>".bold());
    eprintln!("  {}    Get config value", "/config get <key>".bold());
    eprintln!(
        "  {}        List all providers and key status",
        "/providers".bold()
    );
    eprintln!(
        "  {}            Interactive provider setup",
        "/setup".bold()
    );
    eprintln!("  {}     View/reset permissions", "/permissions".bold());
    eprintln!();
    eprintln!("{}", "Sessions:".cyan().bold());
    eprintln!("  {}             Save conversation", "/save".bold());
    eprintln!("  {}     Load a saved conversation", "/load <id>".bold());
    eprintln!("  {}          List saved conversations", "/history".bold());
    eprintln!("  {}   Delete a conversation", "/delete <id>".bold());
    eprintln!(
        "  {}           Export (markdown or /export json)",
        "/export".bold()
    );
    eprintln!("  {} Rename session", "/rename <id> <title>".bold());
    eprintln!("  {}         List managed sessions", "/sessions".bold());
    eprintln!("  {}   Migrate JSON conversations", "/migrate".bold());
    eprintln!();
    eprintln!("{}", "Memory & Project:".cyan().bold());
    eprintln!(
        "  {}        Show all memory tiers (global/project/local)",
        "/memory".bold()
    );
    eprintln!("  {}  View a specific tier", "/memory <tier>".bold());
    eprintln!(
        "  {} Add text to tier (default: project)",
        "/memory add [tier] <text>".bold()
    );
    eprintln!(
        "  {}      Edit tier in $EDITOR",
        "/memory edit [tier]".bold()
    );
    eprintln!(
        "  {}             Initialize project with CLAUDE.md",
        "/init".bold()
    );
    eprintln!(
        "  {}        Append text to project CLAUDE.md",
        "# <text>".bold()
    );
    eprintln!();
    eprintln!("{}", "Info:".cyan().bold());
    eprintln!(
        "  {}           Show version, model, provider, status",
        "/status".bold()
    );
    eprintln!("  {}             Show session cost summary", "/cost".bold());
    eprintln!("  {}          Show context window usage", "/context".bold());
    eprintln!("  {}           List available models", "/models".bold());
    eprintln!("  {}           List available skills", "/skills".bold());
    eprintln!("  {}            Show configured hooks", "/hooks".bold());
    eprintln!("  {}            Login with subscription", "/login".bold());
    eprintln!("  {}           Logout", "/logout".bold());
    eprintln!(
        "  {}            Clear conversation context",
        "/clear".bold()
    );
    eprintln!("  {}             Show this help", "/help".bold());
    eprintln!("  {}             Exit", "/exit".bold());
    eprintln!();
    eprintln!("{}", "Ecosystem & Sync:".cyan().bold());
    eprintln!(
        "  {}     Scan for AI tools (Claude, Codex, Cursor, etc.)",
        "/ecosystem".bold()
    );
    eprintln!(
        "  {}     Import MCP configs from detected tools",
        "/eco import".bold()
    );
    eprintln!(
        "  {}     Search/list marketplace plugins",
        "/marketplace".bold()
    );
    eprintln!("  {}  Search marketplace", "/market search <q>".bold());
    eprintln!(
        "  {}             Check sync status of dotfiles",
        "/sync".bold()
    );
    eprintln!(
        "  {}      Export synced settings as JSON",
        "/sync export".bold()
    );
    eprintln!(
        "  {}             Show auth status for all providers",
        "/auth".bold()
    );
    eprintln!(
        "  {}       Re-run first-run setup wizard",
        "/onboarding".bold()
    );
    eprintln!();
    eprintln!("{}", "Agent-to-Agent (A2A):".cyan().bold());
    eprintln!("  {}     List known peer agents", "/a2a discover".bold());
    eprintln!("  {} Delegate task", "/a2a delegate <agent> <task>".bold());
    eprintln!("  {} Start A2A server", "/a2a serve [port]".bold());
    eprintln!("  {} Add peer agent", "/a2a register <url>".bold());
    eprintln!("  {}         Show this agent's card", "/a2a card".bold());
    eprintln!();
    eprintln!("{}", "Shortcuts:".cyan().bold());
    eprintln!(
        "  {}           Run shell command (output added to context)",
        "! <command>".bold()
    );
    eprintln!(
        "  {}        Append text to project CLAUDE.md",
        "# <text>".bold()
    );
    eprintln!("  {} Multi-line input", "\\".bold());
    eprintln!(
        "  {}              Cancel input / {} Exit",
        "Ctrl-C".bold(),
        "Ctrl-D".bold()
    );
    eprintln!(
        "  {}            Set AGIWORKFORCE_VI=1 for vim keybindings",
        "Vi mode".bold()
    );
}
