use anyhow::Result;
use colored::Colorize;
use dialoguer::{Input, Select};
use rustyline::error::ReadlineError;
use rustyline::DefaultEditor;

use crate::agent::AgentSession;
use crate::config::CliConfig;
use crate::context::SystemContext;
use crate::conversations;
use crate::markdown::MarkdownRenderer;
use crate::memory::{self, MemoryManager, MemoryTier};
use crate::output;
use crate::sessions;

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
    max_turns: Option<usize>,
    skip_permissions: bool,
    fallback_model: Option<String>,
    session_name: Option<String>,
    team_mode: bool,
) -> Result<()> {
    let provider_name = crate::models::detect_provider(model);
    output::print_banner(model, &format!("{:?}", provider_name).to_lowercase());

    let mut session = AgentSession::new(model, sys_context, custom_system_prompt);
    session.max_turns = max_turns;
    session.skip_permissions = skip_permissions;
    session.fallback_model = fallback_model;
    session.session_name = session_name;

    // Enable team mode if requested
    if team_mode {
        session.enable_team_mode();
        eprintln!("{}", "Team mode enabled. Teammate messaging and shared tasks are active.".cyan());
    }

    // Pre-load messages from a resumed session (--session flag)
    if let Some(messages) = resume_messages {
        for msg in messages {
            session.messages.push(msg);
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

    let mut editor = DefaultEditor::new()?;

    // Load history if available
    let history_path = CliConfig::config_dir()
        .ok()
        .map(|d| d.join("history.txt"));
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
                        SlashResult::Btw(question) => {
                            // Side query: send to LLM without affecting main history
                            let spinner = output::create_spinner("Side query...");
                            let md_btw = std::sync::Arc::new(std::sync::Mutex::new(MarkdownRenderer::new()));
                            let md_btw_cb = std::sync::Arc::clone(&md_btw);

                            let btw_result = session
                                .send_btw(config, &question, Box::new(move |chunk| {
                                    if let Ok(mut renderer) = md_btw_cb.lock() {
                                        output::print_assistant_chunk_formatted(&mut renderer, chunk);
                                    }
                                }))
                                .await;

                            spinner.finish_and_clear();

                            if let Ok(mut renderer) = md_btw.lock() {
                                output::flush_markdown(&mut renderer);
                            }

                            match btw_result {
                                Ok(_) => {
                                    output::print_assistant_end();
                                    eprintln!("{}", "  (side query — not added to conversation)".dimmed());
                                }
                                Err(e) => {
                                    output::print_error(&format!("Side query failed: {:#}", e));
                                }
                            }
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
                    .send(config, &full_input, Box::new(move |chunk| {
                        if let Ok(mut renderer) = md_cb.lock() {
                            output::print_assistant_chunk_formatted(&mut renderer, chunk);
                        }
                    }))
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
                            output::print_subscription_cost(
                                turn.input_tokens,
                                turn.output_tokens,
                            );
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
                output::print_info(&format!("Current model: {}", session.model));
            } else {
                session.switch_model(arg);
                let provider = format!("{:?}", session.provider).to_lowercase();
                output::print_info(&format!(
                    "Switched to {} ({})",
                    arg, provider
                ));
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
        "/plan" => {
            session.plan_mode = !session.plan_mode;
            if session.plan_mode {
                output::print_info("Plan mode ON — only read-only tools (read_file, search_files, list_directory, web_search, web_fetch).");
            } else {
                output::print_info("Plan mode OFF — all tools available.");
            }
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
        "/memory" | "/mem" => {
            handle_memory(arg);
        }
        "/init" => {
            handle_init_project();
        }
        "/config" => {
            handle_config(arg, config);
        }
        "/login" => {
            return SlashResult::Login;
        }
        "/logout" => {
            return SlashResult::Logout;
        }
        "/help" | "/h" | "/?" => {
            print_help();
        }
        _ => {
            output::print_warn(&format!("Unknown command: {}. Type /help for available commands.", cmd));
        }
    }

    SlashResult::Handled
}

fn print_help() {
    eprintln!("{}", "Agent & Mode:".cyan().bold());
    eprintln!("  {}    Switch model (e.g. /model gpt-4o)", "/model <name>".bold());
    eprintln!("  {}             Toggle plan mode (read-only tools)", "/plan".bold());
    eprintln!("  {}    Toggle fast mode (cheaper model)", "/fast [on|off]".bold());
    eprintln!("  {} Manual context compaction", "/compact [focus]".bold());
    eprintln!("  {}  Side query (not added to history)", "/btw <question>".bold());
    eprintln!("  {}           Rewind to previous checkpoint", "/rewind".bold());
    eprintln!("  {}   Fork conversation at current point", "/branch [name]".bold());
    eprintln!("  {}             Show uncommitted git changes", "/diff".bold());
    eprintln!();
    eprintln!("{}", "Configuration:".cyan().bold());
    eprintln!("  {}           Show current configuration", "/config".bold());
    eprintln!("  {} Set config value", "/config set <k> <v>".bold());
    eprintln!("  {}    Get config value", "/config get <key>".bold());
    eprintln!("  {}        List all providers and key status", "/providers".bold());
    eprintln!("  {}            Interactive provider setup", "/setup".bold());
    eprintln!("  {}     View/reset permissions", "/permissions".bold());
    eprintln!();
    eprintln!("{}", "Sessions:".cyan().bold());
    eprintln!("  {}             Save conversation", "/save".bold());
    eprintln!("  {}     Load a saved conversation", "/load <id>".bold());
    eprintln!("  {}          List saved conversations", "/history".bold());
    eprintln!("  {}   Delete a conversation", "/delete <id>".bold());
    eprintln!("  {}           Export (markdown or /export json)", "/export".bold());
    eprintln!("  {} Rename session", "/rename <id> <title>".bold());
    eprintln!("  {}         List sessions (SQLite)", "/sessions".bold());
    eprintln!("  {}          Migrate JSON to SQLite", "/migrate".bold());
    eprintln!();
    eprintln!("{}", "Memory & Project:".cyan().bold());
    eprintln!("  {}        Show all memory tiers (global/project/local)", "/memory".bold());
    eprintln!("  {}  View a specific tier", "/memory <tier>".bold());
    eprintln!("  {} Add text to tier (default: project)", "/memory add [tier] <text>".bold());
    eprintln!("  {}      Edit tier in $EDITOR", "/memory edit [tier]".bold());
    eprintln!("  {}             Initialize project with CLAUDE.md", "/init".bold());
    eprintln!("  {}        Append text to project CLAUDE.md", "# <text>".bold());
    eprintln!();
    eprintln!("{}", "Info:".cyan().bold());
    eprintln!("  {}             Show session cost summary", "/cost".bold());
    eprintln!("  {}          Show context window usage", "/context".bold());
    eprintln!("  {}           List available models", "/models".bold());
    eprintln!("  {}           List available skills", "/skills".bold());
    eprintln!("  {}            Show configured hooks", "/hooks".bold());
    eprintln!("  {}            Login with subscription", "/login".bold());
    eprintln!("  {}           Logout", "/logout".bold());
    eprintln!("  {}            Clear conversation context", "/clear".bold());
    eprintln!("  {}             Show this help", "/help".bold());
    eprintln!("  {}             Exit", "/exit".bold());
    eprintln!();
    eprintln!("{}", "Tips:".cyan().bold());
    eprintln!("  - End a line with \\ for multi-line input");
    eprintln!("  - Ctrl-C cancels current input, Ctrl-D exits");
}

// ---------------------------------------------------------------------------
// Conversation commands
// ---------------------------------------------------------------------------

fn handle_save(session: &AgentSession) {
    if session.turn_count == 0 {
        output::print_warn("Nothing to save — no messages in session yet.");
        return;
    }

    // Save to JSON (legacy format)
    let json_id = match conversations::save_conversation(session) {
        Ok(id) => {
            output::print_info(&format!("Conversation saved (JSON): {}", id));
            id
        }
        Err(e) => {
            output::print_error(&format!("Failed to save JSON: {:#}", e));
            return;
        }
    };

    // Also save to SQLite
    let conn = match sessions::open_db() {
        Ok(c) => c,
        Err(e) => {
            output::print_error(&format!("Failed to open sessions DB: {:#}", e));
            return;
        }
    };

    let title = session
        .messages
        .iter()
        .find(|m| m.role == "user")
        .map(|m| {
            let text = m.text_content();
            let truncated: String = text.chars().take(50).collect();
            if text.chars().count() > 50 {
                format!("{}...", truncated)
            } else {
                truncated
            }
        })
        .unwrap_or_else(|| "Untitled".to_string());

    let cwd = std::env::current_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_default();

    if let Err(e) = sessions::save_session(&conn, &json_id, &title, &session.model, &cwd, "") {
        output::print_error(&format!("Failed to save session to SQLite: {:#}", e));
        return;
    }

    for msg in &session.messages {
        let tokens = crate::compaction::estimate_tokens(&msg.text_content());
        if let Err(e) = sessions::save_message(&conn, &json_id, msg, tokens) {
            output::print_error(&format!("Failed to save message to SQLite: {:#}", e));
            return;
        }
    }

    output::print_info(&format!("Session saved (SQLite): {}", json_id));
}

fn handle_load(arg: &str, session: &mut AgentSession) {
    if arg.is_empty() {
        output::print_warn("Usage: /load <id>  (use /history to see IDs)");
        return;
    }

    match conversations::load_conversation(arg) {
        Ok(conv) => {
            let msg_count = conv.messages.len();
            let model = conv.model.clone();
            conversations::restore_into_session(session, &conv);
            output::print_info(&format!(
                "Loaded conversation {} ({} messages, model: {})",
                arg, msg_count, model
            ));
        }
        Err(e) => {
            output::print_error(&format!("Failed to load: {:#}", e));
        }
    }
}

fn handle_history() {
    // Show SQLite sessions first
    let has_sqlite = match sessions::open_db() {
        Ok(conn) => match sessions::list_sessions(&conn, 20) {
            Ok(list) if !list.is_empty() => {
                eprintln!("{}", "Sessions (SQLite):".cyan().bold());
                eprintln!("{}", sessions::format_session_list(&list));
                true
            }
            Ok(_) => false,
            Err(e) => {
                output::print_error(&format!("Failed to list sessions: {:#}", e));
                false
            }
        },
        Err(e) => {
            output::print_error(&format!("Failed to open sessions DB: {:#}", e));
            false
        }
    };

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
            if !has_sqlite {
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

    match conversations::delete_conversation(arg) {
        Ok(()) => {
            output::print_info(&format!("Deleted conversation: {}", arg));
        }
        Err(e) => {
            output::print_error(&format!("Failed to delete: {:#}", e));
        }
    }
}

fn handle_export(arg: &str, session: &AgentSession) {
    if session.turn_count == 0 {
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
        "anthropic", "openai", "google", "mistral", "xai", "deepseek", "ollama",
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

    let key_result: std::result::Result<String, _> = Input::new()
        .with_prompt("API key")
        .interact_text();

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

fn handle_permissions(arg: &str) {
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
// Session commands (SQLite)
// ---------------------------------------------------------------------------

fn handle_sessions(arg: &str) {
    let sub_parts: Vec<&str> = arg.splitn(2, ' ').collect();
    let sub_cmd = sub_parts[0];
    let sub_arg = sub_parts.get(1).map(|s| s.trim()).unwrap_or_default();

    match sub_cmd {
        "" | "list" => {
            let conn = match sessions::open_db() {
                Ok(c) => c,
                Err(e) => {
                    output::print_error(&format!("Failed to open sessions DB: {:#}", e));
                    return;
                }
            };
            match sessions::list_sessions(&conn, 20) {
                Ok(list) => {
                    eprintln!("{}", "Sessions (SQLite):".cyan().bold());
                    eprintln!("{}", sessions::format_session_list(&list));
                }
                Err(e) => output::print_error(&format!("Failed to list sessions: {:#}", e)),
            }
        }
        "search" => {
            if sub_arg.is_empty() {
                output::print_warn("Usage: /sessions search <query>");
                return;
            }
            let conn = match sessions::open_db() {
                Ok(c) => c,
                Err(e) => {
                    output::print_error(&format!("Failed to open sessions DB: {:#}", e));
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
                    output::print_error(&format!("Failed to open sessions DB: {:#}", e));
                    return;
                }
            };
            match sessions::db_stats(&conn) {
                Ok(stats) => {
                    eprintln!("{}", "Session Database Stats:".cyan().bold());
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

fn handle_rename(arg: &str) {
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
            output::print_error(&format!("Failed to open sessions DB: {:#}", e));
            return;
        }
    };

    match sessions::rename_session(&conn, session_id, new_title) {
        Ok(()) => {
            output::print_info(&format!("Renamed session {} to '{}'", session_id, new_title));
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
            output::print_error(&format!("Failed to open sessions DB: {:#}", e));
            return;
        }
    };

    match sessions::migrate_json_conversations(&conn, &conv_dir) {
        Ok(0) => output::print_info("No new conversations to migrate."),
        Ok(n) => output::print_info(&format!("Migrated {} conversation(s) to SQLite.", n)),
        Err(e) => output::print_error(&format!("Migration failed: {:#}", e)),
    }
}

// ---------------------------------------------------------------------------
// New commands: compact, rewind, branch, diff, memory, init, config
// ---------------------------------------------------------------------------

fn handle_compact(arg: &str, session: &mut AgentSession) {
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
        if focus.is_some() { format!(" [focus: {}]", arg) } else { String::new() }
    ));
}

fn handle_rewind(arg: &str, session: &mut AgentSession) {
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

fn handle_branch(arg: &str, session: &AgentSession) {
    // For now, branch saves current state to a new SQLite session
    if session.turn_count == 0 {
        output::print_warn("Nothing to branch — no messages yet.");
        return;
    }

    let branch_name = if arg.is_empty() {
        format!("branch-{}", chrono::Utc::now().format("%H%M%S"))
    } else {
        arg.to_string()
    };

    let conn = match sessions::open_db() {
        Ok(c) => c,
        Err(e) => {
            output::print_error(&format!("Failed to open sessions DB: {:#}", e));
            return;
        }
    };

    let branch_id = format!("branch-{}", &sha2_short(&branch_name));
    let cwd = std::env::current_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_default();

    if let Err(e) = sessions::save_session(&conn, &branch_id, &branch_name, &session.model, &cwd, "") {
        output::print_error(&format!("Failed to save branch: {:#}", e));
        return;
    }

    for msg in &session.messages {
        let tokens = crate::compaction::estimate_tokens(&msg.text_content());
        if let Err(e) = sessions::save_message(&conn, &branch_id, msg, tokens) {
            output::print_error(&format!("Failed to save branch message: {:#}", e));
            return;
        }
    }

    output::print_info(&format!(
        "Branched conversation as '{}' (id: {}). Resume with: agiworkforce --session {}",
        branch_name, branch_id, branch_id
    ));
}

fn sha2_short(input: &str) -> String {
    use sha2::{Digest, Sha256};
    let hash = Sha256::digest(input.as_bytes());
    format!("{:x}", hash)[..8].to_string()
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
            match std::process::Command::new("git")
                .args(["diff"])
                .output()
            {
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
                        eprintln!("{}", format!("... ({} more lines)", lines.len() - max_lines).dimmed());
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

fn handle_memory(arg: &str) {
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
            match std::process::Command::new(&editor)
                .arg(&path)
                .status()
            {
                Ok(status) => {
                    if status.success() {
                        output::print_info(&format!("Saved {} memory.", tier));
                    } else {
                        output::print_warn("Editor exited with non-zero status.");
                    }
                }
                Err(e) => output::print_error(&format!(
                    "Failed to open editor '{}': {}",
                    editor, e
                )),
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
            let matching: Vec<&memory::MemoryEntry> = entries
                .iter()
                .filter(|e| e.source == tier)
                .collect();

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

fn handle_init_project() {
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

fn handle_memory_prefix(input: &str) {
    let text = input.strip_prefix("# ").unwrap_or(
        input.strip_prefix('#').unwrap_or("")
    );
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
