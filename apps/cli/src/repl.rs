use anyhow::Result;
use colored::Colorize;
use dialoguer::{Input, Select};
use rustyline::error::ReadlineError;
use rustyline::{Config, DefaultEditor, EditMode};

use crate::agent::AgentSession;
use crate::config::CliConfig;
use crate::context::SystemContext;
use crate::conversations;
use crate::markdown::MarkdownRenderer;
use crate::memory::{self, MemoryManager, MemoryTier};
use crate::output;
use crate::sessions;

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
    // Show tier + token balance from cache (non-blocking — reads disk only).
    output::print_tier_status();

    let mut session = AgentSession::new(model, sys_context, custom_system_prompt);
    session.max_turns = max_turns;
    session.skip_permissions = skip_permissions;
    session.auto_approve_safe = auto_approve_safe;
    session.quiet = quiet;
    session.fallback_model = fallback_model;
    session.session_name = session_name;
    // Sprint B4: thread the initial permission mode + auto-approve flag
    // into the session before the REPL loop. The /plan slash command can
    // change permission_mode at runtime; auto_approve_plan is a one-shot
    // CLI flag and only affects the very first plan write.
    session.permission_mode = permission_mode;
    session.auto_approve_plan = auto_approve_plan;
    if matches!(permission_mode, crate::cli_options::PermissionMode::Plan) {
        session.plan_mode = true;
    }

    // Enable team mode if requested
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

    // Connect to MCP servers (from .mcp.json)
    let mcp_configs = crate::mcp::McpManager::load_configs().unwrap_or_default();
    if !mcp_configs.is_empty() {
        eprintln!("{}", "Connecting to MCP servers...".dimmed());
        let mut mcp_mgr = crate::mcp::McpManager::new();
        if let Err(e) = mcp_mgr.connect_all(&mcp_configs).await {
            output::print_warn(&format!("MCP connection error: {:#}", e));
        }
        session.set_mcp_manager(mcp_mgr);
    }

    // Fire SessionStart hook
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

    // Configure editor: respect EDITOR=vi or AGIWORKFORCE_VI=1 for vim mode
    let edit_mode = if std::env::var("AGIWORKFORCE_VI").is_ok_and(|v| v == "1" || v == "true")
        || std::env::var("EDITOR").is_ok_and(|e| e.contains("vi"))
    {
        EditMode::Vi
    } else {
        EditMode::Emacs
    };
    let rl_config = Config::builder()
        .edit_mode(edit_mode)
        .auto_add_history(false) // we add history manually
        .build();
    let mut editor = DefaultEditor::with_config(rl_config)?;

    // Load history if available
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

                // Skip empty lines
                if input.is_empty() {
                    continue;
                }

                // Add to history
                let _ = editor.add_history_entry(input);

                // Handle # prefix: append to CLAUDE.md (memory)
                if input.starts_with("# ") || input == "#" {
                    handle_memory_prefix(input);
                    continue;
                }

                // Handle ! prefix: direct bash execution (output added to context)
                if input.starts_with('!') {
                    let cmd = input.strip_prefix('!').unwrap_or("").trim();
                    if !cmd.is_empty() {
                        handle_bash_prefix(cmd, &mut session);
                    }
                    continue;
                }

                // Handle slash commands
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
                            handle_logout();
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
                        SlashResult::Sync(subcmd) => match crate::config::CliConfig::config_dir() {
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
                                    Err(e) => {
                                        output::print_error(&format!("Sync status failed: {}", e))
                                    }
                                },
                                "export" => match crate::sync::ConfigSync::export(&home) {
                                    Ok(bundle) => {
                                        if let Ok(json) = serde_json::to_string_pretty(&bundle) {
                                            println!("{}", json);
                                        }
                                    }
                                    Err(e) => {
                                        output::print_error(&format!("Sync export failed: {}", e))
                                    }
                                },
                                _ => {
                                    output::print_info("Usage: /sync status | /sync export");
                                }
                            },
                            Err(e) => output::print_error(&format!("Config dir error: {}", e)),
                        },
                        SlashResult::Onboarding => {
                            match crate::onboarding::run_onboarding().await {
                                Ok(true) => output::print_info(
                                    "Onboarding complete. Restart to apply changes.",
                                ),
                                Ok(false) => output::print_info("Onboarding skipped."),
                                Err(e) => output::print_error(&format!("Onboarding error: {}", e)),
                            }
                        }
                        SlashResult::Btw(question) => {
                            // Side query: send to LLM without affecting main history
                            let spinner = output::create_spinner("Side query...");
                            let md_btw =
                                std::sync::Arc::new(std::sync::Mutex::new(MarkdownRenderer::new()));
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
                            handle_batch_command(&glob_pat, &prompt, &mut session, config).await;
                        }
                        SlashResult::Handled => {}
                    }
                    continue;
                }

                // Handle multi-line input (trailing backslash)
                let full_input = if input.ends_with('\\') {
                    collect_multiline(input, &mut editor)?
                } else {
                    input.to_string()
                };

                // Send to LLM with markdown rendering
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

                // Flush remaining markdown buffer
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
                // Ctrl-C: cancel current input, continue loop
                eprintln!("{}", "(Ctrl-C to cancel, /exit to quit)".dimmed());
                continue;
            }
            Err(ReadlineError::Eof) => {
                // Ctrl-D: exit
                break;
            }
            Err(e) => {
                output::print_error(&format!("Input error: {}", e));
                break;
            }
        }
    }

    // Save history
    if let Some(ref path) = history_path {
        let _ = editor.save_history(path);
    }

    // Fire SessionEnd hook
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

    // Shut down MCP servers gracefully
    if let Some(mut mgr) = session.take_mcp_manager() {
        mgr.shutdown_all().await;
    }

    // Print session summary
    output::print_session_cost(
        &session.model,
        session.total_input_tokens,
        session.total_output_tokens,
        session.turn_count,
    );

    Ok(())
}

// ---------------------------------------------------------------------------
// Slash commands
// ---------------------------------------------------------------------------

#[derive(PartialEq, Eq)]
enum SlashResult {
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

fn handle_slash_command(
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
                // In the REPL (non-TUI) path there is no ratatui terminal,
                // so we print the current model and hint the user toward the
                // interactive TUI picker (available via `agiworkforce` with no
                // --no-tui flag, then `/model` with no argument).
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
            handle_save(session);
        }
        "/load" => {
            handle_load(arg, session);
        }
        "/history" => {
            handle_history();
        }
        "/delete" => {
            handle_delete(arg);
        }
        "/export" => {
            handle_export(arg, session);
        }
        "/providers" => {
            handle_providers(config);
        }
        "/setup" => {
            handle_setup(config);
        }
        "/permissions" | "/perms" => {
            handle_permissions(arg);
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
            handle_sessions(arg);
        }
        "/rename" => {
            handle_rename(arg);
        }
        "/import" | "/migrate" => {
            handle_migrate();
        }
        "/compact" => {
            handle_compact(arg, session);
        }
        "/btw" => {
            if arg.is_empty() {
                output::print_warn("Usage: /btw <question>");
            } else {
                return SlashResult::Btw(arg.to_string());
            }
        }
        // Sprint B4: 3-state /plan command. The legacy boolean toggle
        // (`/plan`) becomes "/plan on" (entering plan mode + clearing
        // approval). Sub-commands `accept`, `reject`, `show`, `off` drive
        // the model-written-plan -> approve -> execute flow. Without
        // arguments, `/plan` flips between on (Plan + unapproved) and
        // off (Default + reset).
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
            handle_rewind(arg, session);
        }
        "/branch" | "/fork" => {
            handle_branch(arg, session);
        }
        "/diff" => {
            handle_diff();
        }
        "/batch" => {
            // Syntax: /batch <glob_pattern> <prompt>
            // Split arg into first token (glob) and the rest (prompt)
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
            handle_memory(arg);
        }
        "/init" => {
            handle_init_project();
        }
        "/config" => {
            handle_config(arg, config);
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
            // Sub-dispatch A2A commands: /a2a discover, /a2a delegate, /a2a serve, etc.
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

/// Execute `/batch <glob_pattern> <prompt>` — expand the glob, then send the
/// prompt to the LLM for every matched file in parallel (up to 25 files).
async fn handle_batch_command(
    glob_pattern: &str,
    prompt: &str,
    session: &mut AgentSession,
    config: &CliConfig,
) {
    // Expand glob
    let entries: Vec<String> = match glob::glob(glob_pattern) {
        Ok(paths) => paths
            .filter_map(|e| e.ok())
            .filter(|p| p.is_file())
            .map(|p| p.display().to_string())
            .collect(),
        Err(e) => {
            output::print_error(&format!("Invalid glob pattern: {}", e));
            return;
        }
    };

    if entries.is_empty() {
        output::print_warn(&format!("No files matched: {}", glob_pattern));
        return;
    }

    const MAX_BATCH_FILES: usize = 25;
    if entries.len() > MAX_BATCH_FILES {
        output::print_error(&format!(
            "Too many files ({}). Batch limited to {} files. Use a narrower glob.",
            entries.len(),
            MAX_BATCH_FILES,
        ));
        return;
    }

    eprintln!(
        "{}",
        format!("Batch: {} files matched, processing...", entries.len())
            .cyan()
            .bold()
    );
    for f in &entries {
        eprintln!("  {}", f);
    }

    // Build a combined prompt that includes all files with the user's instruction
    let mut file_list = String::new();
    for f in &entries {
        file_list.push_str(&format!("- {}\n", f));
    }

    let batch_prompt = format!(
        "Apply the following instruction to EACH of these files (process them all):\n\n\
         Instruction: {}\n\n\
         Files:\n{}",
        prompt, file_list,
    );

    // Send through the normal agent loop so tools (edit_file, etc.) are available
    let spinner = output::create_spinner("Batch processing...");
    let md = std::sync::Arc::new(std::sync::Mutex::new(MarkdownRenderer::new()));
    let md_cb = std::sync::Arc::clone(&md);

    let result = session
        .send(
            config,
            &batch_prompt,
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
        Ok(_) => {
            output::print_assistant_end();
        }
        Err(e) => {
            output::print_error(&format!("Batch failed: {:#}", e));
        }
    }
}

fn print_help() {
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

// ---------------------------------------------------------------------------
// Conversation commands
// ---------------------------------------------------------------------------

pub fn handle_save(session: &mut AgentSession) {
    if !session
        .messages
        .iter()
        .any(|message| message.role != "system")
    {
        output::print_warn("Nothing to save — no messages in session yet.");
        return;
    }

    if session.managed_session_id().is_none() {
        if let Err(error) = session.enable_managed_session() {
            output::print_error(&format!("Failed to initialize managed session: {error:#}"));
            return;
        }
    }

    if let Err(error) = session.persist_managed_session() {
        output::print_error(&format!("Failed to persist managed session: {error:#}"));
        return;
    }

    if let Some(session_id) = session.managed_session_id() {
        output::print_info(&format!("Managed session saved: {}", session_id));
    }
}

pub fn handle_load(arg: &str, session: &mut AgentSession) {
    if arg.is_empty() {
        output::print_warn("Usage: /load <id>  (use /history to see IDs)");
        return;
    }

    match crate::runtime::session_control::resolve_managed_session_reference(arg) {
        Ok(resolved) => match crate::runtime::session_control::load_managed_session(arg) {
            Ok(managed_session) => {
                let session_id = managed_session.session_id.clone();
                let message_count = managed_session.messages.len();
                load_messages_into_session(session, managed_session.messages.clone());
                session.adopt_managed_session(managed_session, resolved.path);
                output::print_info(&format!(
                    "Loaded managed session {} ({} messages)",
                    session_id, message_count
                ));
            }
            Err(error) => {
                output::print_error(&format!("Failed to load managed session: {error:#}"));
            }
        },
        Err(_) => match conversations::load_conversation(arg) {
            Ok(conv) => {
                let msg_count = conv.messages.len();
                let model = conv.model.clone();
                conversations::restore_into_session(session, &conv);
                if let Err(error) = session.enable_managed_session() {
                    output::print_warn(&format!(
                        "Loaded legacy conversation, but managed session setup failed: {error:#}"
                    ));
                }
                output::print_info(&format!(
                    "Loaded conversation {} ({} messages, model: {})",
                    arg, msg_count, model
                ));
            }
            Err(e) => {
                output::print_error(&format!("Failed to load: {:#}", e));
            }
        },
    }
}

pub fn handle_history() {
    let mut showed_any = false;

    match crate::runtime::session_control::list_managed_sessions() {
        Ok(summaries) if !summaries.is_empty() => {
            eprintln!("{}", "Managed Sessions:".cyan().bold());
            for (index, summary) in summaries.iter().take(20).enumerate() {
                eprintln!(
                    "  {} {} {} ({})",
                    format!("{:>2}.", index + 1).dimmed(),
                    summary.session_id.bold(),
                    summary
                        .updated_at
                        .format("%Y-%m-%d %H:%M")
                        .to_string()
                        .dimmed(),
                    format!("{} msgs", summary.message_count).dimmed(),
                );
            }
            if summaries.len() > 20 {
                eprintln!(
                    "  {}",
                    format!("... and {} more", summaries.len() - 20).dimmed()
                );
            }
            showed_any = true;
        }
        Ok(_) => {}
        Err(error) => output::print_error(&format!("Failed to list managed sessions: {error:#}")),
    }

    // Then show legacy JSON conversations
    match conversations::list_conversations() {
        Ok(summaries) if !summaries.is_empty() => {
            eprintln!("{}", "Legacy (JSON):".cyan().bold());
            for (i, s) in summaries.iter().take(20).enumerate() {
                eprintln!(
                    "  {}. {} {} {} ({})",
                    format!("{:>2}", i + 1).dimmed(),
                    s.id.bold(),
                    s.title.dimmed(),
                    format!("[{}]", s.model).dimmed(),
                    format!("{} msgs", s.message_count).dimmed(),
                );
            }
            if summaries.len() > 20 {
                eprintln!(
                    "  {}",
                    format!("... and {} more", summaries.len() - 20).dimmed()
                );
            }
        }
        Ok(_) => {
            if !showed_any {
                output::print_info("No saved conversations yet. Use /save to save one.");
            }
        }
        Err(e) => {
            output::print_error(&format!("Failed to list: {:#}", e));
        }
    }
}

fn handle_delete(arg: &str) {
    if arg.is_empty() {
        output::print_warn("Usage: /delete <id>  (use /history to see IDs)");
        return;
    }

    if crate::runtime::session_control::delete_managed_session(arg).is_ok() {
        output::print_info(&format!("Deleted managed session: {}", arg));
        return;
    }

    match conversations::delete_conversation(arg) {
        Ok(()) => {
            output::print_info(&format!("Deleted conversation: {}", arg));
        }
        Err(e) => {
            output::print_error(&format!("Failed to delete: {:#}", e));
        }
    }
}

pub fn handle_export(arg: &str, session: &AgentSession) {
    if !session
        .messages
        .iter()
        .any(|message| message.role != "system")
    {
        output::print_warn("Nothing to export — no messages in session yet.");
        return;
    }

    if arg == "json" {
        match conversations::export_as_json(session) {
            Ok(json) => println!("{}", json),
            Err(e) => output::print_error(&format!("Export failed: {:#}", e)),
        }
    } else {
        let md = conversations::export_as_markdown(session);
        println!("{}", md);
    }
}

// ---------------------------------------------------------------------------
// Provider commands
// ---------------------------------------------------------------------------

fn handle_providers(config: &CliConfig) {
    eprintln!("{}", "Providers:".cyan().bold());

    let mut names: Vec<&String> = config.providers.keys().collect();
    names.sort();

    let headers = &["Provider", "Status", "URL"];
    let rows: Vec<Vec<String>> = names
        .iter()
        .map(|name| {
            let pc = &config.providers[*name];
            let status = if let Some(env_var) = &pc.api_key_env {
                if std::env::var(env_var).is_ok() {
                    format!("OK ({})", env_var)
                } else {
                    format!("NOT SET ({})", env_var)
                }
            } else {
                "no key needed".to_string()
            };
            let url = pc.base_url.as_deref().unwrap_or("default").to_string();
            vec![name.to_string(), status, url]
        })
        .collect();

    eprintln!("{}", output::format_table(headers, &rows));
}

fn handle_setup(config: &mut CliConfig) {
    let providers = vec![
        "anthropic",
        "openai",
        "google",
        "mistral",
        "xai",
        "deepseek",
        "ollama",
    ];

    let selection = Select::new()
        .with_prompt("Select provider to configure")
        .items(&providers)
        .interact_opt();

    let idx = match selection {
        Ok(Some(idx)) => idx,
        Ok(None) => {
            output::print_info("Setup cancelled.");
            return;
        }
        Err(e) => {
            output::print_error(&format!("Selection error: {}", e));
            return;
        }
    };

    let selected_provider = providers[idx];

    if selected_provider == "ollama" {
        // Ollama: configure base URL instead of API key
        let current_url = config
            .base_url("ollama")
            .unwrap_or_else(|| "http://localhost:11434".to_string());

        let url_result: std::result::Result<String, _> = Input::new()
            .with_prompt("Ollama base URL")
            .default(current_url)
            .interact_text();

        match url_result {
            Ok(url) => {
                if let Some(pc) = config.providers.get_mut("ollama") {
                    pc.base_url = Some(url);
                }
                if let Err(e) = config.save() {
                    output::print_error(&format!("Failed to save config: {:#}", e));
                } else {
                    output::print_info("Ollama configuration saved.");
                }
            }
            Err(e) => {
                output::print_error(&format!("Input error: {}", e));
            }
        }
        return;
    }

    // For API-key-based providers
    let env_var = config
        .providers
        .get(selected_provider)
        .and_then(|p| p.api_key_env.as_deref())
        .unwrap_or("UNKNOWN");

    eprintln!(
        "{}",
        format!(
            "Enter API key for {} (will be set as {} for this session):",
            selected_provider, env_var
        )
        .dimmed()
    );

    let key_result: std::result::Result<String, _> =
        Input::new().with_prompt("API key").interact_text();

    match key_result {
        Ok(key) => {
            if key.is_empty() {
                output::print_warn("Empty key — skipping.");
                return;
            }

            // Set for current session
            std::env::set_var(env_var, &key);
            output::print_info(&format!(
                "{} set for this session. To persist, add to your shell profile:\n  export {}={}",
                env_var, env_var, key
            ));
        }
        Err(e) => {
            output::print_error(&format!("Input error: {}", e));
        }
    }
}

// ---------------------------------------------------------------------------
// Permissions commands
// ---------------------------------------------------------------------------

pub fn handle_permissions(arg: &str) {
    match arg {
        "reset" => match crate::permissions::PermissionStore::load() {
            Ok(mut store) => {
                store.reset();
                match store.save() {
                    Ok(()) => output::print_info("All permissions reset."),
                    Err(e) => output::print_error(&format!("Failed to save: {:#}", e)),
                }
            }
            Err(e) => output::print_error(&format!("Failed to load: {:#}", e)),
        },
        _ => match crate::permissions::PermissionStore::load() {
            Ok(store) => eprintln!("{}", store.display()),
            Err(e) => output::print_error(&format!("Failed to load permissions: {:#}", e)),
        },
    }
}

// ---------------------------------------------------------------------------
// Session commands
// ---------------------------------------------------------------------------

fn handle_sessions(arg: &str) {
    let sub_parts: Vec<&str> = arg.splitn(2, ' ').collect();
    let sub_cmd = sub_parts[0];
    let sub_arg = sub_parts.get(1).map(|s| s.trim()).unwrap_or_default();

    match sub_cmd {
        "" | "list" => match crate::runtime::session_control::list_managed_sessions() {
            Ok(list) if !list.is_empty() => {
                eprintln!("{}", "Managed Sessions:".cyan().bold());
                if let Ok(dir) = crate::runtime::session_control::managed_session_dir() {
                    eprintln!("  {}", dir.display().to_string().dimmed());
                }
                for summary in &list {
                    eprintln!(
                        "  {}  {}  {} msgs  {}",
                        summary.session_id.bold(),
                        summary
                            .updated_at
                            .format("%Y-%m-%d %H:%M")
                            .to_string()
                            .dimmed(),
                        summary.message_count,
                        summary.path.display()
                    );
                }
            }
            Ok(_) => output::print_info("No managed sessions found."),
            Err(e) => output::print_error(&format!("Failed to list sessions: {:#}", e)),
        },
        "search" => {
            if sub_arg.is_empty() {
                output::print_warn("Usage: /sessions search <query>");
                return;
            }
            let conn = match sessions::open_db() {
                Ok(c) => c,
                Err(e) => {
                    output::print_error(&format!("Failed to open session store: {:#}", e));
                    return;
                }
            };
            match sessions::search_sessions(&conn, sub_arg) {
                Ok(results) => {
                    eprintln!(
                        "{}",
                        format!("Search results for '{}':", sub_arg).cyan().bold()
                    );
                    eprintln!("{}", sessions::format_session_list(&results));
                }
                Err(e) => output::print_error(&format!("Search failed: {:#}", e)),
            }
        }
        "stats" => {
            let conn = match sessions::open_db() {
                Ok(c) => c,
                Err(e) => {
                    output::print_error(&format!("Failed to open session store: {:#}", e));
                    return;
                }
            };
            match sessions::db_stats(&conn) {
                Ok(stats) => {
                    eprintln!("{}", "Managed Session Stats:".cyan().bold());
                    eprintln!("  Sessions:   {}", stats.session_count);
                    eprintln!("  Messages:   {}", stats.message_count);
                    eprintln!("  Tool calls: {}", stats.tool_call_count);
                    eprintln!("  Tokens:     {}", stats.total_tokens);
                }
                Err(e) => output::print_error(&format!("Failed to get stats: {:#}", e)),
            }
        }
        other => {
            output::print_warn(&format!(
                "Unknown sessions subcommand: '{}'. Try /sessions, /sessions search <query>, or /sessions stats",
                other
            ));
        }
    }
}

pub fn handle_rename(arg: &str) {
    // Expected format: <id> <new title>
    let parts: Vec<&str> = arg.splitn(2, ' ').collect();
    if parts.len() < 2 || parts[0].is_empty() || parts[1].trim().is_empty() {
        output::print_warn("Usage: /rename <id> <new title>");
        return;
    }
    let session_id = parts[0];
    let new_title = parts[1].trim();

    let conn = match sessions::open_db() {
        Ok(c) => c,
        Err(e) => {
            output::print_error(&format!("Failed to open session store: {:#}", e));
            return;
        }
    };

    match sessions::rename_session(&conn, session_id, new_title) {
        Ok(()) => {
            output::print_info(&format!(
                "Renamed session {} to '{}'",
                session_id, new_title
            ));
        }
        Err(e) => {
            output::print_error(&format!("Failed to rename: {:#}", e));
        }
    }
}

fn handle_migrate() {
    let conv_dir = match crate::config::CliConfig::config_dir() {
        Ok(d) => d.join("conversations"),
        Err(e) => {
            output::print_error(&format!("Failed to locate config dir: {:#}", e));
            return;
        }
    };

    let conn = match sessions::open_db() {
        Ok(c) => c,
        Err(e) => {
            output::print_error(&format!("Failed to open session store: {:#}", e));
            return;
        }
    };

    match sessions::migrate_json_conversations(&conn, &conv_dir) {
        Ok(0) => output::print_info("No new conversations to migrate."),
        Ok(n) => output::print_info(&format!(
            "Migrated {} conversation(s) into managed sessions.",
            n
        )),
        Err(e) => output::print_error(&format!("Migration failed: {:#}", e)),
    }
}

// ---------------------------------------------------------------------------
// New commands: compact, rewind, branch, diff, memory, init, config
// ---------------------------------------------------------------------------

pub fn handle_compact(arg: &str, session: &mut AgentSession) {
    let usage = crate::compaction::context_usage(&session.messages, &session.model);
    let before_tokens = usage.used_tokens;

    if before_tokens < 1000 {
        output::print_info("Context is small — nothing to compact.");
        return;
    }

    let target = usage.limit_tokens * 50 / 100; // compact to 50%
    let focus = if arg.is_empty() { None } else { Some(arg) };

    session.messages = crate::compaction::compact_with_focus(&session.messages, target, focus);

    let after = crate::compaction::context_usage(&session.messages, &session.model);
    output::print_info(&format!(
        "Compacted: ~{} -> ~{} tokens ({}% of limit){}",
        before_tokens,
        after.used_tokens,
        (after.fraction * 100.0) as u32,
        if focus.is_some() {
            format!(" [focus: {}]", arg)
        } else {
            String::new()
        }
    ));
}

pub fn handle_rewind(arg: &str, session: &mut AgentSession) {
    let count = if arg.is_empty() {
        1usize
    } else {
        arg.parse::<usize>().unwrap_or(1)
    };

    let mut rewound = 0;
    for _ in 0..count {
        if session.restore_checkpoint() {
            rewound += 1;
        } else {
            break;
        }
    }

    if rewound == 0 {
        output::print_warn("No checkpoints available to rewind to.");
    } else {
        output::print_info(&format!(
            "Rewound {} checkpoint{}. {} remaining. ({} messages in context)",
            rewound,
            if rewound == 1 { "" } else { "s" },
            session.checkpoint_count(),
            session.messages.len()
        ));
    }
}

pub fn handle_branch(arg: &str, session: &mut AgentSession) {
    if !session
        .messages
        .iter()
        .any(|message| message.role != "system")
    {
        output::print_warn("Nothing to branch — no messages yet.");
        return;
    }

    let branch_name = if arg.is_empty() {
        format!("branch-{}", chrono::Utc::now().format("%H%M%S"))
    } else {
        arg.to_string()
    };

    if session.managed_session_id().is_none() {
        if let Err(error) = session.enable_managed_session() {
            output::print_error(&format!(
                "Failed to initialize a managed session before branching: {error:#}"
            ));
            return;
        }
    }

    let Some(session_id) = session.managed_session_id().map(str::to_string) else {
        output::print_error("Managed session is unavailable for branching.");
        return;
    };

    if let Err(error) = session.persist_managed_session() {
        output::print_error(&format!(
            "Failed to persist current session before fork: {error:#}"
        ));
        return;
    }

    match crate::runtime::session_control::fork_managed_session(&session_id) {
        Ok(forked_session) => {
            if let Ok(conn) = sessions::open_db() {
                let _ = sessions::rename_session(
                    &conn,
                    &forked_session.summary.session_id,
                    &branch_name,
                );
            }
            output::print_info(&format!(
                "Branched conversation '{}' as managed session {}. Resume with: agiworkforce --session {}",
                branch_name, forked_session.summary.session_id, forked_session.summary.session_id
            ));
        }
        Err(error) => {
            output::print_error(&format!("Failed to fork managed session: {error:#}"));
        }
    }
}

fn load_messages_into_session(session: &mut AgentSession, messages: Vec<crate::models::Message>) {
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

fn handle_diff() {
    match std::process::Command::new("git")
        .args(["diff", "--stat"])
        .output()
    {
        Ok(stat_output) => {
            let stat = String::from_utf8_lossy(&stat_output.stdout);
            if stat.trim().is_empty() {
                output::print_info("No uncommitted changes.");
                return;
            }
            eprintln!("{}", "Git diff summary:".cyan().bold());
            eprintln!("{}", stat);

            // Also show the actual diff (truncated)
            match std::process::Command::new("git").args(["diff"]).output() {
                Ok(diff_output) => {
                    let diff = String::from_utf8_lossy(&diff_output.stdout);
                    let lines: Vec<&str> = diff.lines().collect();
                    let max_lines = 100;
                    for line in lines.iter().take(max_lines) {
                        if line.starts_with('+') && !line.starts_with("+++") {
                            eprintln!("{}", line.green());
                        } else if line.starts_with('-') && !line.starts_with("---") {
                            eprintln!("{}", line.red());
                        } else if line.starts_with("@@") {
                            eprintln!("{}", line.cyan());
                        } else {
                            eprintln!("{}", line);
                        }
                    }
                    if lines.len() > max_lines {
                        eprintln!(
                            "{}",
                            format!("... ({} more lines)", lines.len() - max_lines).dimmed()
                        );
                    }
                }
                Err(e) => output::print_error(&format!("Failed to run git diff: {}", e)),
            }
        }
        Err(_) => {
            output::print_warn("git not found or not in a git repository.");
        }
    }
}

pub fn handle_memory(arg: &str) {
    let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let mgr = MemoryManager::new(&cwd);

    let sub_parts: Vec<&str> = arg.splitn(2, ' ').collect();
    let sub_cmd = sub_parts[0];
    let sub_arg = sub_parts.get(1).map(|s| s.trim()).unwrap_or_default();

    match sub_cmd {
        "" | "show" => {
            // Show all memory tiers with status and content preview
            eprintln!("{}", "Memory Hierarchy:".cyan().bold());
            eprintln!();

            let tiers = mgr.list();
            for (tier, path, exists) in &tiers {
                let status = if *exists {
                    "found".green().to_string()
                } else {
                    "not found".dimmed().to_string()
                };
                eprintln!(
                    "  {} {} ({})",
                    format_args!("[{}]", tier).to_string().bold(),
                    path.display(),
                    status
                );

                if *exists {
                    if let Ok(content) = std::fs::read_to_string(path) {
                        let preview = memory::content_preview(&content, 5);
                        for line in preview.lines() {
                            eprintln!("    {}", line.dimmed());
                        }
                        eprintln!();
                    }
                }
            }
        }
        "add" => {
            // /memory add [tier] <text>
            // Defaults to project tier if no tier specified
            let (tier, text) = parse_tier_and_text(sub_arg);
            if text.is_empty() {
                output::print_warn("Usage: /memory add [global|project|local] <text>");
                return;
            }

            match mgr.save(&tier, text) {
                Ok(path) => {
                    output::print_info(&format!(
                        "Appended to {} memory ({})",
                        tier,
                        path.display()
                    ));
                }
                Err(e) => output::print_error(&e),
            }
        }
        "edit" => {
            // /memory edit [tier]  — open the specified tier in $EDITOR
            let tier = match sub_arg {
                "global" | "g" => MemoryTier::Global,
                "local" | "l" => MemoryTier::Local,
                _ => MemoryTier::Project,
            };

            let path = match mgr.path_for_tier(&tier) {
                Some(p) => p.to_path_buf(),
                None => {
                    output::print_warn(&format!("No path for {} memory tier.", tier));
                    return;
                }
            };

            // Ensure the file exists (create empty if needed)
            if !path.exists() {
                if let Some(parent) = path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                let _ = std::fs::write(&path, format!("# {} Memory\n", tier));
            }

            let editor = std::env::var("EDITOR").unwrap_or_else(|_| "vi".to_string());
            match std::process::Command::new(&editor).arg(&path).status() {
                Ok(status) => {
                    if status.success() {
                        output::print_info(&format!("Saved {} memory.", tier));
                    } else {
                        output::print_warn("Editor exited with non-zero status.");
                    }
                }
                Err(e) => {
                    output::print_error(&format!("Failed to open editor '{}': {}", editor, e))
                }
            }
        }
        "global" | "project" | "local" => {
            // /memory global — show just that tier
            let tier = match sub_cmd {
                "global" => MemoryTier::Global,
                "local" => MemoryTier::Local,
                _ => MemoryTier::Project,
            };

            let entries = mgr.load_all();
            let matching: Vec<&memory::MemoryEntry> =
                entries.iter().filter(|e| e.source == tier).collect();

            if matching.is_empty() {
                output::print_info(&format!("No {} memory found.", tier));
            } else {
                for entry in matching {
                    eprintln!(
                        "{}",
                        format!("{} Memory ({}):", entry.source, entry.file_path.display())
                            .cyan()
                            .bold()
                    );
                    eprintln!("{}", entry.content);
                }
            }
        }
        _ => {
            output::print_warn(
                "Usage: /memory [show|add [global|project|local] <text>|edit [global|project|local]|global|project|local]",
            );
        }
    }
}

/// Parse a tier prefix from text input.
///
/// Examples:
///   "global some text" -> (Global, "some text")
///   "project some text" -> (Project, "some text")
///   "some text" -> (Project, "some text")  // default to project
fn parse_tier_and_text(input: &str) -> (MemoryTier, &str) {
    let parts: Vec<&str> = input.splitn(2, ' ').collect();
    if parts.len() < 2 {
        // No space found — check if the whole input is a tier name
        match parts[0] {
            "global" | "g" => return (MemoryTier::Global, ""),
            "project" | "p" => return (MemoryTier::Project, ""),
            "local" | "l" => return (MemoryTier::Local, ""),
            _ => return (MemoryTier::Project, input),
        }
    }

    match parts[0] {
        "global" | "g" => (MemoryTier::Global, parts[1]),
        "project" | "p" => (MemoryTier::Project, parts[1]),
        "local" | "l" => (MemoryTier::Local, parts[1]),
        _ => (MemoryTier::Project, input),
    }
}

pub fn handle_init_project() {
    let claude_md = std::path::Path::new("CLAUDE.md");
    if claude_md.exists() {
        output::print_info("CLAUDE.md already exists in current directory.");
        return;
    }

    let template = "# Project Instructions\n\n\
                    ## Overview\n\n\
                    Describe your project here.\n\n\
                    ## Build Commands\n\n\
                    ```bash\n\
                    # Add your build commands here\n\
                    ```\n\n\
                    ## Architecture\n\n\
                    Describe your project structure.\n\n\
                    ## Development Rules\n\n\
                    - Add your coding conventions here\n";

    match std::fs::write(claude_md, template) {
        Ok(()) => output::print_info("Created CLAUDE.md in current directory."),
        Err(e) => output::print_error(&format!("Failed to create CLAUDE.md: {}", e)),
    }
}

fn handle_config(arg: &str, config: &mut CliConfig) {
    let sub_parts: Vec<&str> = arg.splitn(3, ' ').collect();
    let sub_cmd = sub_parts[0];

    match sub_cmd {
        "" | "show" => {
            eprintln!("{}", config.display());
        }
        "get" => {
            let key = sub_parts.get(1).map(|s| s.trim()).unwrap_or_default();
            if key.is_empty() {
                output::print_warn("Usage: /config get <key>");
                return;
            }
            match config.get_value(key) {
                Some(value) => output::print_info(&format!("{} = {}", key, value)),
                None => output::print_warn(&format!("Unknown or unset key: '{}'", key)),
            }
        }
        "set" => {
            if sub_parts.len() < 3 {
                output::print_warn("Usage: /config set <key> <value>");
                return;
            }
            let key = sub_parts[1].trim();
            let value = sub_parts[2].trim();
            match config.set_value(key, value) {
                Ok(()) => {
                    if let Err(e) = config.save() {
                        output::print_warn(&format!("Set in memory but failed to save: {:#}", e));
                    } else {
                        output::print_info(&format!("{} = {} (saved)", key, value));
                    }
                }
                Err(e) => output::print_error(&format!("{:#}", e)),
            }
        }
        _ => {
            output::print_warn("Usage: /config [show|get <key>|set <key> <value>]");
        }
    }
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

            // Add the command and output to conversation context
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

// ---------------------------------------------------------------------------
// Auth commands
// ---------------------------------------------------------------------------

fn handle_logout() {
    match crate::auth::load_auth() {
        Ok(mut store) => {
            if store.entries.is_empty() {
                output::print_info("No subscription auth to clear.");
                return;
            }
            let count = store.entries.len();
            store.entries.clear();
            match crate::auth::save_auth(&store) {
                Ok(()) => {
                    output::print_info(&format!(
                        "Cleared {} subscription auth {}.",
                        count,
                        if count == 1 { "entry" } else { "entries" },
                    ));
                }
                Err(e) => {
                    output::print_error(&format!("Failed to save auth store: {:#}", e));
                }
            }
        }
        Err(_) => {
            output::print_info("No subscription auth to clear.");
        }
    }
}

// ---------------------------------------------------------------------------
// Multi-line input
// ---------------------------------------------------------------------------

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
