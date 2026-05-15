mod dialogs;
mod registry;
mod slash_commands;

use anyhow::Result;
use colored::Colorize;
use rustyline::error::ReadlineError;
use rustyline::{Config, DefaultEditor, EditMode};

use crate::agent::AgentSession;
use crate::config::CliConfig;
use crate::context::SystemContext;
use crate::markdown::MarkdownRenderer;
use crate::memory::{MemoryManager, MemoryTier};
use crate::output;

use slash_commands::{handle_slash_command, SlashResult};

// Re-export the public handler functions used by tui_app.rs and lib.rs.
pub use registry::{
    handle_branch, handle_compact, handle_export, handle_history, handle_init_project,
    handle_load, handle_memory, handle_permissions, handle_rename, handle_rewind, handle_save,
};

type ManagedSessionResume = (crate::runtime::session::ManagedSession, std::path::PathBuf);

/// Run the interactive REPL loop.
///
/// If `resume_messages` is provided, those messages are pre-loaded into the
/// session history (e.g. from `--session <ID>`).
#[allow(clippy::too_many_arguments)]
pub async fn run_repl(
    config: &mut CliConfig,
    model: &str,
    sys_context: &SystemContext,
    custom_system_prompt: Option<&str>,
    resume_messages: Option<Vec<crate::models::Message>>,
    resume_managed_session: Option<ManagedSessionResume>,
    max_turns: Option<usize>,
    skip_permissions: bool,
    fallback_model: Option<String>,
    session_name: Option<String>,
    team_mode: bool,
    auto_approve_safe: bool,
    quiet: bool,
    permission_mode: crate::cli_options::PermissionMode,
    auto_approve_plan: bool,
) -> Result<()> {
    let provider_name = crate::models::detect_provider(model);
    let provider_str = format!("{:?}", provider_name).to_lowercase();
    output::print_compact_header(&provider_str);
    output::print_banner(model, &provider_str);
    output::print_tier_status();

    let mut session = AgentSession::new(model, sys_context, custom_system_prompt);
    session.max_turns = max_turns;
    session.skip_permissions = skip_permissions;
    session.auto_approve_safe = auto_approve_safe;
    session.quiet = quiet;
    session.fallback_model = fallback_model;
    session.session_name = session_name;
    session.permission_mode = permission_mode;
    session.auto_approve_plan = auto_approve_plan;
    if matches!(permission_mode, crate::cli_options::PermissionMode::Plan) {
        session.plan_mode = true;
    }

    if team_mode {
        session.enable_team_mode();
        eprintln!(
            "{}",
            "Team mode enabled. Teammate messaging and shared tasks are active.".cyan()
        );
    }

    match (resume_messages, resume_managed_session) {
        (Some(messages), Some((managed_session, path))) => {
            load_messages_into_session(&mut session, messages);
            session.adopt_managed_session(managed_session, path);
        }
        (Some(messages), None) => {
            load_messages_into_session(&mut session, messages);
            session.enable_managed_session()?;
        }
        (None, Some((managed_session, path))) => {
            load_messages_into_session(&mut session, managed_session.messages.clone());
            session.adopt_managed_session(managed_session, path);
        }
        (None, None) => {
            session.enable_managed_session()?;
        }
    }

    let mcp_configs = crate::mcp::McpManager::load_configs().unwrap_or_default();
    if !mcp_configs.is_empty() {
        eprintln!("{}", "Connecting to MCP servers...".dimmed());
        let mut mcp_mgr = crate::mcp::McpManager::new();
        if let Err(e) = mcp_mgr.connect_all(&mcp_configs).await {
            output::print_warn(&format!("MCP connection error: {:#}", e));
        }
        session.set_mcp_manager(mcp_mgr);
    }

    let hooks_config = session.hooks_config().clone();
    crate::hooks::run_hooks(
        &hooks_config,
        crate::hooks::HookEvent::SessionStart,
        &crate::hooks::HookInput {
            event: "SessionStart".to_string(),
            session_id: None,
            model: Some(model.to_string()),
            tool_name: None,
            tool_args: None,
            tool_output: None,
            message: None,
            tool_execution: None,
        },
    )
    .await;

    let edit_mode = if std::env::var("AGIWORKFORCE_VI").is_ok_and(|v| v == "1" || v == "true")
        || std::env::var("EDITOR").is_ok_and(|e| e.contains("vi"))
    {
        EditMode::Vi
    } else {
        EditMode::Emacs
    };
    let rl_config = Config::builder()
        .edit_mode(edit_mode)
        .auto_add_history(false)
        .build();
    let mut editor = DefaultEditor::with_config(rl_config)?;

    let history_path = CliConfig::config_dir().ok().map(|d| d.join("history.txt"));
    if let Some(ref path) = history_path {
        let _ = editor.load_history(path);
    }

    loop {
        output::print_user_prompt();
        let readline = editor.readline("");

        match readline {
            Ok(line) => {
                let input = line.trim();

                if input.is_empty() {
                    continue;
                }

                let _ = editor.add_history_entry(input);

                if input.starts_with("# ") || input == "#" {
                    handle_memory_prefix(input);
                    continue;
                }

                if input.starts_with('!') {
                    let cmd = input.strip_prefix('!').unwrap_or("").trim();
                    if !cmd.is_empty() {
                        handle_bash_prefix(cmd, &mut session);
                    }
                    continue;
                }

                if input.starts_with('/') {
                    let result = handle_slash_command(input, &mut session, config);
                    match result {
                        SlashResult::Exit => break,
                        SlashResult::Login => {
                            if let Err(e) = crate::auth::interactive_login().await {
                                output::print_error(&format!("Login failed: {:#}", e));
                            }
                        }
                        SlashResult::Logout => {
                            dialogs::handle_logout();
                        }
                        SlashResult::Voice(lang) => {
                            eprintln!(
                                "{}",
                                "Entering voice mode. Press SPACE to talk, ESC to exit."
                                    .cyan()
                                    .bold()
                            );
                            if let Err(e) =
                                crate::voice::run_voice_mode(&mut session, config, &lang).await
                            {
                                output::print_error(&format!("Voice mode error: {:#}", e));
                            }
                        }
                        SlashResult::Ecosystem(subcmd) => match subcmd.as_str() {
                            "scan" => {
                                let detected = crate::ecosystem::scan();
                                eprintln!("{}", crate::ecosystem::format_table(&detected));
                            }
                            "import" => {
                                let detected = crate::ecosystem::scan();
                                let servers = crate::ecosystem::import_mcp_servers(&detected);
                                if servers.is_empty() {
                                    eprintln!("No MCP server configs found to import.");
                                } else {
                                    eprintln!("Imported {} MCP server config(s):", servers.len());
                                    for s in &servers {
                                        eprintln!("  {} ({})", s.name, s.source);
                                    }
                                }
                            }
                            _ => {
                                let detected = crate::ecosystem::scan();
                                eprintln!("{}", crate::ecosystem::format_table(&detected));
                            }
                        },
                        SlashResult::Marketplace(subcmd) => {
                            let home = crate::config::CliConfig::config_dir();
                            match (subcmd.as_str(), home) {
                                (sub, Ok(_home)) if sub.starts_with("search ") => {
                                    let query = sub.strip_prefix("search ").unwrap_or_default();
                                    let mp = crate::marketplace::Marketplace::new_production();
                                    match mp.search(query).await {
                                        Ok(results) => {
                                            eprintln!(
                                                "{}",
                                                crate::marketplace::format_search_results(&results)
                                            );
                                        }
                                        Err(e) => {
                                            output::print_error(&format!(
                                                "Marketplace search failed: {}",
                                                e
                                            ));
                                        }
                                    }
                                }
                                ("list", Ok(home)) => {
                                    let registry =
                                        crate::marketplace::Marketplace::list_installed(&home);
                                    eprintln!(
                                        "{}",
                                        crate::marketplace::format_installed(&registry)
                                    );
                                }
                                (_, Err(e)) => {
                                    output::print_error(&format!("Config dir error: {}", e));
                                }
                                _ => {
                                    output::print_info(
                                        "Usage: /marketplace search <query> | /marketplace list",
                                    );
                                }
                            }
                        }
                        SlashResult::Sync(subcmd) => {
                            match crate::config::CliConfig::config_dir() {
                                Ok(home) => match subcmd.as_str() {
                                    "status" => match crate::sync::ConfigSync::status(&home) {
                                        Ok(changes) => {
                                            if changes.is_empty() {
                                                eprintln!("No synced files found.");
                                            } else {
                                                for (path, change) in &changes {
                                                    eprintln!("  {:<35} {}", path, change);
                                                }
                                            }
                                        }
                                        Err(e) => output::print_error(&format!(
                                            "Sync status failed: {}",
                                            e
                                        )),
                                    },
                                    "export" => match crate::sync::ConfigSync::export(&home) {
                                        Ok(bundle) => {
                                            if let Ok(json) = serde_json::to_string_pretty(&bundle)
                                            {
                                                println!("{}", json);
                                            }
                                        }
                                        Err(e) => output::print_error(&format!(
                                            "Sync export failed: {}",
                                            e
                                        )),
                                    },
                                    _ => {
                                        output::print_info("Usage: /sync status | /sync export");
                                    }
                                },
                                Err(e) => {
                                    output::print_error(&format!("Config dir error: {}", e))
                                }
                            }
                        }
                        SlashResult::Onboarding => {
                            match crate::onboarding::run_onboarding().await {
                                Ok(true) => output::print_info(
                                    "Onboarding complete. Restart to apply changes.",
                                ),
                                Ok(false) => output::print_info("Onboarding skipped."),
                                Err(e) => {
                                    output::print_error(&format!("Onboarding error: {}", e))
                                }
                            }
                        }
                        SlashResult::Btw(question) => {
                            let spinner = output::create_spinner("Side query...");
                            let md_btw = std::sync::Arc::new(std::sync::Mutex::new(
                                MarkdownRenderer::new(),
                            ));
                            let md_btw_cb = std::sync::Arc::clone(&md_btw);

                            let btw_result = session
                                .send_btw(
                                    config,
                                    &question,
                                    Box::new(move |chunk| {
                                        if let Ok(mut renderer) = md_btw_cb.lock() {
                                            output::print_assistant_chunk_formatted(
                                                &mut renderer,
                                                chunk,
                                            );
                                        }
                                    }),
                                )
                                .await;

                            spinner.finish_and_clear();

                            if let Ok(mut renderer) = md_btw.lock() {
                                output::flush_markdown(&mut renderer);
                            }

                            match btw_result {
                                Ok(_) => {
                                    output::print_assistant_end();
                                    eprintln!(
                                        "{}",
                                        "  (side query — not added to conversation)".dimmed()
                                    );
                                }
                                Err(e) => {
                                    output::print_error(&format!("Side query failed: {:#}", e));
                                }
                            }
                        }
                        SlashResult::A2a(subcmd, subarg) => {
                            match crate::a2a::handle_a2a_command(
                                &subcmd,
                                &subarg,
                                config,
                                &session.model,
                            )
                            .await
                            {
                                Ok(output) => {
                                    eprintln!("{}", output);
                                }
                                Err(e) => {
                                    output::print_error(&format!("A2A error: {:#}", e));
                                }
                            }
                        }
                        SlashResult::Batch(glob_pat, prompt) => {
                            registry::handle_batch_command(
                                &glob_pat,
                                &prompt,
                                &mut session,
                                config,
                            )
                            .await;
                        }
                        SlashResult::Handled => {}
                    }
                    continue;
                }

                let full_input = if input.ends_with('\\') {
                    collect_multiline(input, &mut editor)?
                } else {
                    input.to_string()
                };

                let spinner = output::create_spinner("Thinking...");
                let md = std::sync::Arc::new(std::sync::Mutex::new(MarkdownRenderer::new()));
                let md_cb = std::sync::Arc::clone(&md);

                let result = session
                    .send(
                        config,
                        &full_input,
                        Box::new(move |chunk| {
                            if let Ok(mut renderer) = md_cb.lock() {
                                output::print_assistant_chunk_formatted(&mut renderer, chunk);
                            }
                        }),
                    )
                    .await;

                spinner.finish_and_clear();

                if let Ok(mut renderer) = md.lock() {
                    output::flush_markdown(&mut renderer);
                }

                match result {
                    Ok(turn) => {
                        output::print_assistant_end();
                        if turn.via_subscription {
                            output::print_subscription_cost(turn.input_tokens, turn.output_tokens);
                        } else {
                            output::print_cost(
                                &session.model,
                                turn.input_tokens,
                                turn.output_tokens,
                            );
                        }
                    }
                    Err(e) => {
                        output::print_error(&format!("{:#}", e));
                    }
                }
            }
            Err(ReadlineError::Interrupted) => {
                eprintln!("{}", "(Ctrl-C to cancel, /exit to quit)".dimmed());
                continue;
            }
            Err(ReadlineError::Eof) => {
                break;
            }
            Err(e) => {
                output::print_error(&format!("Input error: {}", e));
                break;
            }
        }
    }

    if let Some(ref path) = history_path {
        let _ = editor.save_history(path);
    }

    crate::hooks::run_hooks(
        &hooks_config,
        crate::hooks::HookEvent::SessionEnd,
        &crate::hooks::HookInput {
            event: "SessionEnd".to_string(),
            session_id: None,
            model: Some(session.model.clone()),
            tool_name: None,
            tool_args: None,
            tool_output: None,
            message: None,
            tool_execution: None,
        },
    )
    .await;

    if let Some(mut mgr) = session.take_mcp_manager() {
        mgr.shutdown_all().await;
    }

    output::print_session_cost(
        &session.model,
        session.total_input_tokens,
        session.total_output_tokens,
        session.turn_count,
    );

    Ok(())
}

// ---------------------------------------------------------------------------
// Internal helpers (also used by registry.rs via super::)
// ---------------------------------------------------------------------------

pub(super) fn load_messages_into_session(
    session: &mut AgentSession,
    messages: Vec<crate::models::Message>,
) {
    if !messages.is_empty() {
        session.messages = messages;
    }
    session.total_input_tokens = 0;
    session.total_output_tokens = 0;
    session.turn_count = session
        .messages
        .iter()
        .filter(|message| message.role == "user")
        .count() as u32;
}

fn collect_multiline(first_line: &str, editor: &mut DefaultEditor) -> Result<String> {
    let mut lines = vec![first_line.trim_end_matches('\\').to_string()];

    loop {
        eprint!("{}", "... ".dimmed());
        match editor.readline("") {
            Ok(line) => {
                let trimmed = line.trim_end();
                if trimmed.ends_with('\\') {
                    lines.push(trimmed.trim_end_matches('\\').to_string());
                } else {
                    lines.push(trimmed.to_string());
                    break;
                }
            }
            Err(_) => break,
        }
    }

    Ok(lines.join("\n"))
}

fn handle_bash_prefix(cmd: &str, session: &mut AgentSession) {
    eprintln!("{}", format!("$ {}", cmd).dimmed());
    match std::process::Command::new("sh").arg("-c").arg(cmd).output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);

            if !stdout.is_empty() {
                eprint!("{}", stdout);
            }
            if !stderr.is_empty() {
                eprint!("{}", stderr.to_string().red());
            }

            let context_msg = format!(
                "I ran this shell command:\n```\n$ {}\n```\nOutput:\n```\n{}{}\n```",
                cmd,
                stdout,
                if stderr.is_empty() {
                    String::new()
                } else {
                    format!("\n[stderr]: {}", stderr)
                }
            );
            session
                .messages
                .push(crate::models::Message::text("user", context_msg));

            let exit_str = if output.status.success() {
                "0".green().to_string()
            } else {
                format!("{}", output.status.code().unwrap_or(-1))
                    .red()
                    .to_string()
            };
            eprintln!("{}", format!("(exit {})", exit_str).dimmed());
        }
        Err(e) => {
            output::print_error(&format!("Failed to execute: {}", e));
        }
    }
}

fn handle_memory_prefix(input: &str) {
    let text = input
        .strip_prefix("# ")
        .unwrap_or(input.strip_prefix('#').unwrap_or(""));
    if text.trim().is_empty() {
        output::print_warn("Usage: # <text to append to CLAUDE.md>");
        return;
    }

    let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let mgr = MemoryManager::new(&cwd);

    match mgr.save(&MemoryTier::Project, text) {
        Ok(path) => {
            output::print_info(&format!("Appended to {}", path.display()));
        }
        Err(e) => output::print_error(&e),
    }
}
