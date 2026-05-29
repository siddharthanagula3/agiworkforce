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
    /// Turn the slash command into a first-class prompt.
    Prompt(String),
    /// Resolve and send an MCP prompt command.
    McpPrompt(String),
    /// Run ecosystem scan.
    Ecosystem(String),
    /// Run marketplace search.
    Marketplace(String),
    /// Run sync operation.
    Sync(String),
    /// Re-run onboarding wizard.
    Onboarding,
    /// Invoke an agent by name — applies its overrides to the current session.
    AgentInvoke(String),
}

pub(super) fn handle_slash_command(
    input: &str,
    session: &mut AgentSession,
    config: &mut CliConfig,
) -> SlashResult {
    let parts: Vec<&str> = input.splitn(2, ' ').collect();
    let cmd = parts[0].to_lowercase();
    let arg = parts.get(1).map(|s| s.trim()).unwrap_or_default();

    match crate::claude_parity::handle_shared_command(cmd.as_str(), arg, session) {
        crate::claude_parity::ParityCommandResult::SystemMessage(message) => {
            persist_shared_ui_config(cmd.as_str(), arg, session, config);
            eprintln!("{message}");
            return SlashResult::Handled;
        }
        crate::claude_parity::ParityCommandResult::Prompt(prompt) => {
            return SlashResult::Prompt(prompt);
        }
        crate::claude_parity::ParityCommandResult::DraftPrompt(prompt) => {
            eprintln!("{prompt}");
            output::print_info(
                "Review this BYOK continuation draft. It was not sent automatically.",
            );
            return SlashResult::Handled;
        }
        crate::claude_parity::ParityCommandResult::NotHandled => {}
    }

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
        "/load" | "/resume" => {
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
        "/permissions" | "/perms" | "/approvals" => {
            registry::handle_permissions(arg);
        }
        "/models" => {
            eprintln!("{}", crate::provider::format_model_list());
        }
        "/skills" => {
            let all = crate::skills::discover_skills();
            eprintln!("{}", crate::skills::format_skill_list(&all));
        }
        "/agents" | "/agent" => {
            // Quick-invoke: /agents <name> — apply agent overrides to current session.
            // Management subcommands and bare /agents — display text output.
            let is_quick_invoke = !arg.is_empty()
                && !matches!(
                    arg.split_whitespace().next().unwrap_or(""),
                    "list" | "ls" | "show" | "view" | "inspect" | "path" | "where"
                        | "new" | "create" | "init" | "validate" | "doctor" | "check"
                        | "help" | "-h" | "--help"
                );
            if is_quick_invoke {
                return SlashResult::AgentInvoke(arg.to_string());
            }
            eprintln!("{}", crate::agents::render_agents_command(arg));
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
        "/usage" => {
            eprintln!("{}", crate::claude_parity::render_stats(session));
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
                output::print_warn("/plan accept: not in plan mode. Use `/plan` to enter first.");
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
                output::print_warn("/plan reject: needs a reason. Usage: /plan reject <feedback>");
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
                    eprintln!(
                        "\n# Plan ({})\n\n{}",
                        path.display(),
                        plan.render_markdown()
                    );
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
        "/marketplace" | "/market" | "/plugin" | "/plugins" => {
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
            if let Some(prompt) = crate::custom_commands::expand_custom_slash_invocation(input) {
                return SlashResult::Prompt(prompt);
            }
            if input.trim_start().starts_with("/mcp:") {
                return SlashResult::McpPrompt(input.to_string());
            }
            output::print_warn(&format!(
                "Unknown command: {}. Type /help for available commands.",
                cmd
            ));
        }
    }

    SlashResult::Handled
}

#[cfg(test)]
fn repl_runtime_command_names() -> std::collections::BTreeSet<&'static str> {
    let mut names = std::collections::BTreeSet::new();
    names.extend(
        crate::claude_parity::shared_runtime_command_names()
            .iter()
            .copied(),
    );
    names.extend([
        "agents",
        "agent",
        "exit",
        "quit",
        "q",
        "model",
        "m",
        "clear",
        "cost",
        "save",
        "load",
        "resume",
        "history",
        "delete",
        "export",
        "providers",
        "setup",
        "permissions",
        "perms",
        "approvals",
        "models",
        "skills",
        "hooks",
        "context",
        "ctx",
        "status",
        "usage",
        "sessions",
        "rename",
        "import",
        "migrate",
        "compact",
        "btw",
        "plan",
        "fast",
        "rewind",
        "branch",
        "fork",
        "diff",
        "batch",
        "memory",
        "mem",
        "init",
        "config",
        "voice",
        "v",
        "theme",
        "login",
        "logout",
        "a2a",
        "ecosystem",
        "eco",
        "marketplace",
        "market",
        "plugin",
        "plugins",
        "sync",
        "onboarding",
        "auth",
        "help",
        "h",
        "?",
    ]);
    names
}

fn persist_shared_ui_config(cmd: &str, arg: &str, session: &AgentSession, config: &mut CliConfig) {
    match cmd {
        "/output-style" if !arg.trim().is_empty() => {
            if let Err(err) = config.persist_output_style_project(&session.output_style) {
                output::print_warn(&format!("Failed to persist output style: {err}"));
            }
        }
        "/privacy-mode" | "/trust-boundary" => {
            if crate::agent::PrivacyMode::from_arg(arg)
                .is_some_and(|mode| mode == session.privacy_mode)
            {
                if let Err(err) = config.persist_privacy_mode_project(session.privacy_mode.label())
                {
                    output::print_warn(&format!("Failed to persist privacy mode: {err}"));
                }
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn registered_builtin_commands_have_repl_runtime_coverage() {
        let runtime = super::repl_runtime_command_names();

        for command in crate::command_registry::builtin_slash_registry_commands() {
            assert!(
                runtime.contains(command.name.as_str()),
                "/{} is registered but has no REPL runtime coverage",
                command.name
            );
            for alias in command.aliases {
                assert!(
                    runtime.contains(alias.as_str()),
                    "/{} alias for /{} has no REPL runtime coverage",
                    alias,
                    command.name
                );
            }
        }
    }
}

pub(super) fn print_help() {
    let skills = crate::skills::discover_skills();
    let registry = crate::command_registry::registry_from_builtins_and_skills(&skills);
    eprintln!(
        "{}",
        crate::command_registry::format_command_help(
            &registry,
            crate::command_registry::ShortcutHelp::Repl,
        )
    );
}
