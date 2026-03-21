#[allow(dead_code)]
mod a2a;
mod agent;
mod agents;
mod auth;
mod compaction;
mod config;
mod context;
mod conversations;
mod daemon;
mod errors;
mod hooks;
mod markdown;
mod mcp;
mod memory;
mod models;
mod output;
mod permissions;
mod provider;
mod repl;
mod safety;
mod sessions;
mod skills;
mod subagent;
mod teams;
mod tools;
mod tui;
mod voice;
// --- Codex CLI parity modules ---
mod app_server;
mod apply_patch;
mod cloud;
mod model_catalog;
mod exec_policy;
mod plugins;
mod review;
mod sandbox;
mod tool_search;

use anyhow::Result;
use clap::{CommandFactory, Parser, Subcommand, ValueEnum};
use colored::Colorize;
use std::io::{self, IsTerminal, Read};

/// AGI Workforce CLI — multi-model AI agent in your terminal
#[derive(Parser, Debug)]
#[command(
    name = "agiworkforce",
    version,
    about = "AGI Workforce CLI — multi-model AI agent in your terminal",
    long_about = "A Claude Code competitor with multi-model support. \
                  Connects to Anthropic, OpenAI, Google, Ollama, and more."
)]
struct Cli {
    /// Subcommand (exec, review, apply, sandbox, cloud, etc.)
    #[command(subcommand)]
    command: Option<Command>,

    /// One-shot prompt (if omitted, starts interactive REPL)
    #[arg(value_name = "PROMPT")]
    prompt: Option<String>,

    /// Model to use (e.g. claude-opus-4-6, gpt-4o, gemini-3-flash-preview, llama3.1:8b)
    #[arg(short, long, value_name = "MODEL")]
    model: Option<String>,

    /// Provider override (anthropic, openai, google, ollama)
    #[arg(short, long, value_name = "PROVIDER")]
    provider: Option<String>,

    /// Maximum tokens in response
    #[arg(long, value_name = "N")]
    max_tokens: Option<u32>,

    /// Enable streaming output (default: true)
    #[arg(long, default_value_t = true)]
    stream: bool,

    /// Disable streaming (get complete response at once)
    #[arg(long)]
    no_stream: bool,

    /// Output raw JSON response
    #[arg(long)]
    json: bool,

    /// Verbose output (show debug info)
    #[arg(short, long)]
    verbose: bool,

    /// Show current configuration
    #[arg(long)]
    config: bool,

    /// Show session cost summary
    #[arg(long)]
    cost: bool,

    /// Files to include in context
    #[arg(short = 'f', long = "file", value_name = "FILE")]
    files: Vec<String>,

    /// System prompt override
    #[arg(long = "system-prompt", value_name = "PROMPT")]
    system_prompt: Option<String>,

    /// Read prompt from stdin (auto-detected when stdin is piped)
    #[arg(long)]
    stdin: bool,

    /// Continue conversation from last session
    #[arg(short = 'c', long)]
    continue_session: bool,

    /// Print output without any formatting (raw text only)
    #[arg(long)]
    raw: bool,

    /// Temperature (0.0 - 1.0)
    #[arg(short = 't', long, value_name = "TEMP")]
    temperature: Option<f32>,

    /// List available models and exit
    #[arg(long)]
    list_models: bool,

    /// Search saved sessions by keyword
    #[arg(long, value_name = "QUERY")]
    search: Option<String>,

    /// Resume a specific session by ID
    #[arg(long, value_name = "ID")]
    session: Option<String>,

    /// Show database statistics
    #[arg(long)]
    stats: bool,

    /// Suppress non-essential output (only print the response)
    #[arg(short, long)]
    quiet: bool,

    /// Output format for structured commands
    #[arg(long, value_name = "FORMAT", value_enum)]
    output: Option<OutputFormat>,

    /// Generate shell completions and exit
    #[arg(long, value_name = "SHELL", value_enum)]
    completions: Option<ShellType>,

    /// Explicit print mode (non-interactive, output response and exit)
    #[arg(long)]
    print: bool,

    /// Resume a specific session (alias for --session)
    #[arg(short = 'r', long, value_name = "ID")]
    resume: Option<String>,

    /// Name the current session
    #[arg(short = 'n', long, value_name = "NAME")]
    name: Option<String>,

    /// Maximum agentic tool-use iterations
    #[arg(long, value_name = "N")]
    max_turns: Option<usize>,

    /// Skip all tool confirmation prompts (DANGEROUS)
    #[arg(long)]
    dangerously_skip_permissions: bool,

    /// Auto-approve safe tool calls (reads, searches, listings).
    /// Unknown tools still prompt; dangerous tools always prompt.
    #[arg(short = 'y', long)]
    yes: bool,

    /// Append text to the system prompt
    #[arg(long, value_name = "TEXT")]
    append_system_prompt: Option<String>,

    /// Fork a session: create a new branch from --session/--resume ID
    #[arg(long)]
    fork_session: bool,

    /// Fallback model on primary model failure
    #[arg(long, value_name = "MODEL")]
    fallback_model: Option<String>,

    /// Initialize project with CLAUDE.md
    #[arg(long)]
    init: bool,

    /// Enable debug logging (optional: comma-separated categories)
    #[arg(long, value_name = "CATEGORIES")]
    debug: Option<Option<String>>,

    /// Enable agent teams mode (teammate messaging + shared task list).
    /// Also activatable via AGI_TEAM=1 environment variable.
    #[arg(long)]
    team: bool,

    /// Effort level preset: low (fast/cheap), medium (default), high (thorough), max (exhaustive)
    #[arg(long, value_name = "LEVEL", value_enum)]
    effort: Option<EffortLevel>,

    /// Voice mode language hint (ISO 639-1 code, default: en).
    /// Used with /voice command for Whisper STT transcription.
    #[arg(long = "voice-lang", value_name = "LANG", default_value = "en")]
    voice_lang: String,

    /// Run in daemon mode: execute triggers from ~/.agiworkforce/triggers.json
    /// (cron schedules, webhooks, file watchers).
    #[arg(long)]
    daemon: bool,

    /// Disable full-screen TUI and use the classic line-based REPL instead.
    #[arg(long)]
    no_tui: bool,
}

/// Effort level presets that bundle max_turns + max_tokens + temperature.
#[derive(Debug, Clone, Copy, ValueEnum)]
enum EffortLevel {
    /// Fast responses, minimal tool use (max_turns=3, max_tokens=2048)
    Low,
    /// Default balanced settings
    Medium,
    /// Thorough analysis and implementation (max_turns=50, max_tokens=16384)
    High,
    /// Exhaustive — use all available context (max_turns=100, max_tokens=32768)
    Max,
}

/// Output format for structured data.
#[derive(Debug, Clone, Copy, ValueEnum)]
enum OutputFormat {
    Text,
    Json,
    /// Newline-delimited JSON for streaming consumption (CI/CD compatible)
    StreamJson,
}

/// Shell type for completions generation.
#[derive(Debug, Clone, Copy, ValueEnum)]
enum ShellType {
    Bash,
    Zsh,
    Fish,
}

// ---------------------------------------------------------------------------
// Subcommands — Codex CLI parity
// ---------------------------------------------------------------------------

#[derive(Subcommand, Debug)]
enum Command {
    /// Run non-interactively (alias: e).
    #[command(alias = "e")]
    Exec {
        prompt: String,
        #[arg(short, long)]
        model: Option<String>,
        #[arg(long)]
        full_auto: bool,
        #[arg(long)]
        json: bool,
    },
    /// Non-interactive code review.
    Review {
        #[arg(long)]
        base: Option<String>,
        #[arg(long)]
        commit: Option<String>,
        prompt: Option<String>,
        #[arg(short, long)]
        model: Option<String>,
    },
    /// Apply latest diff as git patch (alias: a).
    #[command(alias = "a")]
    Apply {
        session_id: Option<String>,
        #[arg(long)]
        file: Option<String>,
    },
    /// Run commands inside a sandbox.
    Sandbox {
        #[arg(long)]
        full_auto: bool,
        command: Vec<String>,
    },
    /// Run as MCP server (stdio).
    McpServer,
    /// Run app server for IDE integration.
    AppServer {
        #[arg(long, default_value = "stdio")]
        listen: String,
    },
    /// Continue previous session.
    Resume { session_id: Option<String> },
    /// Fork a previous session.
    Fork { session_id: String },
    /// Cloud tasks (BYOK, top models only).
    Cloud {
        #[command(subcommand)]
        action: CloudSubcommand,
    },
    /// Manage plugins.
    Plugin {
        #[command(subcommand)]
        action: PluginSubcommand,
    },
    /// Inspect feature flags.
    Features,
    /// Show execution policy rules.
    Execpolicy,
}

#[derive(Subcommand, Debug)]
enum CloudSubcommand {
    /// Submit a task (BYOK).
    Exec {
        prompt: String,
        #[arg(short, long)]
        model: Option<String>,
    },
    /// List cloud tasks.
    List {
        #[arg(long, default_value = "10")]
        limit: usize,
    },
    /// Show cloud models & BYOK status.
    Models,
}

#[derive(Subcommand, Debug)]
enum PluginSubcommand {
    /// List installed plugins.
    List,
    /// Install a plugin.
    Install {
        source: String,
        #[arg(long)]
        name: Option<String>,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    // Load configuration (global + project + env overrides merged)
    let mut app_config = config::CliConfig::load_merged()?;

    // --debug: enable verbose logging
    if cli.debug.is_some() {
        // Setting verbose mode so debug info is visible
        if !cli.quiet {
            eprintln!("[debug] Debug mode enabled. Categories: {}",
                cli.debug.as_ref().and_then(|d| d.as_deref()).unwrap_or("all"));
        }
    }

    // --fork-session: noted for session loading (handled below)
    let _fork_session = cli.fork_session;

    // Validate configuration — warn but continue with defaults on failure
    if let Err(e) = app_config.validate() {
        eprintln!("Warning: config validation failed: {}. Continuing with defaults.", e);
    }

    // --- Subcommand dispatch (Codex CLI parity) ---
    if let Some(ref command) = cli.command {
        let sys_ctx = context::gather_system_context();
        return match command {
            Command::Exec { prompt, model, full_auto, json } => {
                let m = model.as_deref().unwrap_or(&app_config.default.model).to_string();
                let mut session = agent::AgentSession::new(&m, &sys_ctx, None);
                if *full_auto { session.skip_permissions = true; session.auto_approve_safe = true; }
                session.quiet = true;
                let is_json = *json;
                let result = session.send(&app_config, prompt, Box::new(move |chunk| {
                    if !is_json { output::print_assistant_chunk(chunk); }
                })).await;
                match result {
                    Ok(turn) => {
                        if *json {
                            println!("{}", serde_json::to_string_pretty(&serde_json::json!({
                                "response": turn.response, "input_tokens": turn.input_tokens,
                                "output_tokens": turn.output_tokens,
                            }))?);
                        } else { println!(); }
                        Ok(())
                    }
                    Err(e) => { eprintln!("{}", e); std::process::exit(1); }
                }
            }
            Command::Resume { session_id } => {
                let conn = sessions::open_db()?;
                let sid = match session_id {
                    Some(id) => id.clone(),
                    None => sessions::list_sessions(&conn, 1)?
                        .first().map(|s| s.id.clone())
                        .ok_or_else(|| anyhow::anyhow!("No sessions found"))?,
                };
                let msgs = sessions::load_session(&conn, &sid)?;
                let model = app_config.default.model.clone();
                repl::run_repl(&mut app_config, &model, &sys_ctx, None, Some(msgs), None, false, None, None, false, false, false).await
            }
            Command::Fork { session_id } => {
                let conn = sessions::open_db()?;
                let msgs = sessions::load_session(&conn, session_id)?;
                eprintln!("{} Forked session '{}' ({} messages)", "fork:".cyan().bold(), session_id, msgs.len());
                let model = app_config.default.model.clone();
                repl::run_repl(&mut app_config, &model, &sys_ctx, None, Some(msgs), None, false, None, None, false, false, false).await
            }
            Command::Review { base, commit, prompt, model, .. } => {
                let opts = review::ReviewOptions {
                    uncommitted: base.is_none() && commit.is_none(),
                    base_branch: base.clone(), commit: commit.clone(),
                    instructions: prompt.clone(), model: model.clone(),
                };
                review::run_review(&app_config, &sys_ctx, &opts).await?;
                Ok(())
            }
            Command::Apply { session_id, file } => {
                if let Some(fp) = file {
                    let r = apply_patch::apply_from_file(std::path::Path::new(fp)).await?;
                    apply_patch::print_patch_result(&r);
                } else if let Some(sid) = session_id {
                    let r = apply_patch::apply_from_session(sid).await?;
                    apply_patch::print_patch_result(&r);
                } else {
                    let conn = sessions::open_db()?;
                    if let Some(s) = sessions::list_sessions(&conn, 1)?.first() {
                        let r = apply_patch::apply_from_session(&s.id).await?;
                        apply_patch::print_patch_result(&r);
                    } else { eprintln!("No sessions found."); }
                }
                Ok(())
            }
            Command::Sandbox { full_auto, command } => {
                let cmd_str = command.join(" ");
                let cwd = std::env::current_dir()?;
                let mgr = if *full_auto { sandbox::SandboxManager::full_auto(cwd.clone()) }
                    else { sandbox::SandboxManager::new(sandbox::SandboxPolicy::default(), cwd.clone()) };
                eprintln!("Sandbox [{}]: {}", mgr.sandbox_type.name(), cmd_str);
                let out = sandbox::execute_sandboxed(&mgr, &cmd_str, Some(&cwd)).await?;
                io::Write::write_all(&mut io::stdout(), &out.stdout)?;
                io::Write::write_all(&mut io::stderr(), &out.stderr)?;
                std::process::exit(out.status.code().unwrap_or(1));
            }
            Command::McpServer => app_server::run_mcp_server().await,
            Command::AppServer { listen } => {
                const DEFAULT_APP_SERVER_ADDR: &str = "127.0.0.1:8787";
                let cfg = if listen == "stdio" { app_server::AppServerConfig::default() }
                    else { app_server::AppServerConfig { transport: app_server::AppServerTransport::WebSocket {
                        addr: listen.trim_start_matches("ws://").parse().unwrap_or_else(|_| DEFAULT_APP_SERVER_ADDR.parse().unwrap()),
                    }, ..Default::default() } };
                app_server::run_app_server(cfg).await
            }
            Command::Cloud { action } => {
                let cc = cloud::CloudConfig::default();
                match action {
                    CloudSubcommand::Exec { prompt, model } => { cloud::cloud_exec(&cc, prompt, model.as_deref()).await?; Ok(()) }
                    CloudSubcommand::List { .. } => { println!("Cloud tasks: connect to cloud backend to list"); Ok(()) }
                    CloudSubcommand::Models => { println!("{}", cloud::format_cloud_models()); cloud::print_cloud_status(&cc); Ok(()) }
                }
            }
            Command::Plugin { action } => {
                let mut mgr = plugins::PluginsManager::new();
                match action {
                    PluginSubcommand::List => {
                        mgr.load_all(std::env::current_dir().ok().as_deref())?;
                        for p in mgr.plugins() {
                            let st = if p.enabled { "enabled".green() } else { "disabled".red() };
                            println!("  {} [{}] {}", p.config_name, st, p.root.display());
                        }
                        Ok(())
                    }
                    PluginSubcommand::Install { source, name } => {
                        let pname = name.clone().unwrap_or_else(|| source.rsplit('/').next().unwrap_or("plugin").to_string());
                        let psrc = if source.starts_with("http") || source.contains("git") {
                            plugins::PluginSource::Git { url: source.clone(), branch: None }
                        } else { plugins::PluginSource::Local(std::path::PathBuf::from(source)) };
                        match mgr.install(plugins::PluginInstallRequest { source: psrc, name: pname }) {
                            plugins::PluginInstallOutcome::Installed { path } => println!("Installed to {}", path.display()),
                            plugins::PluginInstallOutcome::AlreadyInstalled { path } => println!("Already at {}", path.display()),
                            plugins::PluginInstallOutcome::Failed { error } => eprintln!("Failed: {}", error),
                        }
                        Ok(())
                    }
                }
            }
            Command::Features => {
                let f = tool_search::FeatureFlags::standard();
                println!("Feature Flags:\n  shell_tool: {}\n  code_mode: {}\n  tool_suggest: {}\n  web_search: {}\n  apply_patch: {}",
                    f.shell_tool, f.code_mode, f.tool_suggest, f.web_search, f.apply_patch_freeform);
                Ok(())
            }
            Command::Execpolicy => {
                let policy = exec_policy::ExecPolicy::load()?;
                if policy.rules.is_empty() { println!("No rules. Add .rules files to ~/.agiworkforce/rules/"); }
                else { println!("{} rule(s):", policy.rules.len()); for r in &policy.rules { println!("  {:?} — {}", r.effect, r.source); } }
                Ok(())
            }
        };
    }

    // --completions: generate shell completions and exit
    if let Some(shell) = cli.completions {
        let mut cmd = Cli::command();
        let shell_type = match shell {
            ShellType::Bash => clap_complete::Shell::Bash,
            ShellType::Zsh => clap_complete::Shell::Zsh,
            ShellType::Fish => clap_complete::Shell::Fish,
        };
        clap_complete::generate(shell_type, &mut cmd, "agiworkforce", &mut io::stdout());
        return Ok(());
    }

    // --config: show configuration and exit
    if cli.config {
        println!("{}", app_config.display());
        return Ok(());
    }

    // --list-models: show available models and exit
    if cli.list_models {
        if matches!(cli.output, Some(OutputFormat::Json)) {
            let catalog = crate::provider::model_catalog();
            let json_models: Vec<serde_json::Value> = catalog
                .iter()
                .map(|m| {
                    serde_json::json!({
                        "id": m.id,
                        "provider": m.provider,
                        "context_window": m.context_window,
                        "max_output_tokens": m.max_output_tokens,
                        "input_price_per_1m": m.input_price_per_1m,
                        "output_price_per_1m": m.output_price_per_1m,
                        "supports_tools": m.supports_tools,
                        "supports_vision": m.supports_vision,
                        "supports_reasoning": m.supports_reasoning,
                        "status": m.status,
                    })
                })
                .collect();
            println!("{}", serde_json::to_string_pretty(&json_models)?);
        } else {
            println!("{}", crate::provider::format_model_list());
        }
        return Ok(());
    }

    // --search: search saved sessions by keyword with message context
    if let Some(ref query) = cli.search {
        let conn = crate::sessions::open_db()?;
        let results = crate::sessions::search_sessions(&conn, query)?;
        if matches!(cli.output, Some(OutputFormat::Json)) {
            let json_results: Vec<serde_json::Value> = results
                .iter()
                .map(|s| {
                    serde_json::json!({
                        "id": s.id,
                        "title": s.title,
                        "model": s.model,
                        "message_count": s.message_count,
                        "total_tokens": s.total_tokens,
                    })
                })
                .collect();
            println!("{}", serde_json::to_string_pretty(&json_results)?);
        } else if results.is_empty() {
            println!("No sessions matching \"{}\".", query);
        } else {
            println!(
                "{} session(s) matching \"{}\":\n",
                results.len().to_string().bold(),
                query.cyan()
            );
            for s in &results {
                let title = if s.title.is_empty() { "(untitled)" } else { &s.title };
                let short_id = &s.id[..s.id.len().min(8)];
                println!(
                    "  {} {}  {} msgs  {}",
                    short_id.dimmed(),
                    title.bold(),
                    s.message_count,
                    s.model.dimmed(),
                );
                // Show matching message snippets
                if let Ok(messages) = crate::sessions::load_session(&conn, &s.id) {
                    let query_lower = query.to_lowercase();
                    let mut shown = 0;
                    for msg in &messages {
                        let text = msg.text_content();
                        let text_lower = text.to_lowercase();
                        if text_lower.contains(&query_lower) {
                            // Find the match position and show surrounding context
                            if let Some(pos) = text_lower.find(&query_lower) {
                                let start = pos.saturating_sub(40);
                                let end = (pos + query.len() + 40).min(text.len());
                                let snippet = &text[start..end];
                                let prefix = if start > 0 { "..." } else { "" };
                                let suffix = if end < text.len() { "..." } else { "" };
                                println!(
                                    "    {} {}{}{}",
                                    format!("[{}]", msg.role).dimmed(),
                                    prefix.dimmed(),
                                    snippet.replace('\n', " "),
                                    suffix.dimmed(),
                                );
                                shown += 1;
                                if shown >= 2 {
                                    break;
                                }
                            }
                        }
                    }
                }
                println!();
            }
            println!("{}", "Resume with: agiworkforce --resume <ID>".dimmed());
        }
        return Ok(());
    }

    // --stats: show session database statistics and exit
    if cli.stats {
        let conn = crate::sessions::open_db()?;
        let stats = crate::sessions::db_stats(&conn)?;
        if matches!(cli.output, Some(OutputFormat::Json)) {
            let json = serde_json::json!({
                "sessions": stats.session_count,
                "messages": stats.message_count,
                "tool_calls": stats.tool_call_count,
                "tokens": stats.total_tokens,
            });
            println!("{}", serde_json::to_string_pretty(&json)?);
        } else {
            println!("Sessions:   {}", stats.session_count);
            println!("Messages:   {}", stats.message_count);
            println!("Tool calls: {}", stats.tool_call_count);
            println!("Tokens:     {}", stats.total_tokens);
        }
        return Ok(());
    }

    // --daemon: run in daemon mode (cron + webhook + file-watcher triggers)
    if cli.daemon {
        return daemon::run_daemon(&app_config).await;
    }

    // --init: create CLAUDE.md in current directory
    if cli.init {
        let claude_md = std::path::Path::new("CLAUDE.md");
        if claude_md.exists() {
            eprintln!("CLAUDE.md already exists in current directory.");
        } else {
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
            std::fs::write(claude_md, template)?;
            eprintln!("Created CLAUDE.md in current directory.");
        }
        return Ok(());
    }

    // Detect piped stdin early (before --cost check, since cost+stdin should work)
    let is_piped = !io::stdin().is_terminal();
    let stdin_content = if is_piped || cli.stdin {
        let mut buf = String::new();
        io::stdin().read_to_string(&mut buf)?;
        if buf.is_empty() { None } else { Some(buf) }
    } else {
        None
    };

    // --cost with no prompt and no stdin: just show pricing info
    if cli.cost && cli.prompt.is_none() && stdin_content.is_none() {
        let model = cli
            .model
            .as_deref()
            .unwrap_or(&app_config.default.model);
        let (input_rate, output_rate) = output::model_pricing(model);
        if input_rate == 0.0 && output_rate == 0.0 {
            println!("Model '{}' — no cost (local/unknown model)", model);
        } else {
            println!(
                "Model '{}' pricing:\n  Input:  ${:.2}/1M tokens\n  Output: ${:.2}/1M tokens",
                model, input_rate, output_rate
            );
        }
        return Ok(());
    }

    // Apply --effort preset (before individual overrides so explicit flags win)
    let effort_max_turns = match cli.effort {
        Some(EffortLevel::Low) => {
            app_config.default.max_tokens = 2048;
            app_config.default.temperature = Some(0.3);
            Some(3usize)
        }
        Some(EffortLevel::Medium) => None, // use defaults
        Some(EffortLevel::High) => {
            app_config.default.max_tokens = 16384;
            Some(50usize)
        }
        Some(EffortLevel::Max) => {
            app_config.default.max_tokens = 32768;
            Some(100usize)
        }
        None => None,
    };

    // Apply CLI overrides to config (explicit flags override effort presets)
    if let Some(ref max_tokens) = cli.max_tokens {
        app_config.default.max_tokens = *max_tokens;
    }
    if cli.no_stream {
        app_config.default.stream = false;
    }
    if let Some(temp) = cli.temperature {
        app_config.default.temperature = Some(temp);
    }

    // Resolve model
    let model = cli
        .model
        .as_deref()
        .unwrap_or(&app_config.default.model)
        .to_string();

    // Read file contents for -f flag
    let file_context = read_file_contexts(&cli.files)?;

    // Gather system context
    let sys_context = context::gather_system_context();

    // Build the final prompt from components
    let final_prompt = build_final_prompt(
        cli.prompt.as_deref(),
        stdin_content.as_deref(),
        &file_context,
    );

    // Build effective system prompt (base + append)
    let effective_system_prompt = match (&cli.system_prompt, &cli.append_system_prompt) {
        (Some(base), Some(append)) => Some(format!("{}\n\n{}", base, append)),
        (Some(base), None) => Some(base.clone()),
        (None, Some(append)) => Some(append.clone()),
        (None, None) => None,
    };

    // --print: force oneshot mode with raw output (for piping)
    let raw_output = cli.raw || cli.print;

    // Resolve effective max_turns: explicit --max-turns wins, then --effort preset
    let effective_max_turns = cli.max_turns.or(effort_max_turns);

    // Determine mode: one-shot if we have a prompt (from arg or stdin) or --print, REPL otherwise
    if let Some(ref prompt) = final_prompt {
        return run_oneshot(
            &app_config,
            &model,
            prompt,
            cli.json,
            raw_output,
            &sys_context,
            effective_system_prompt.as_deref(),
            effective_max_turns,
            cli.dangerously_skip_permissions,
            cli.yes,
            cli.quiet,
        )
        .await;
    }

    // --print with no prompt is an error
    if cli.print {
        output::print_error("--print requires a prompt argument.");
        std::process::exit(1);
    }

    // If stdin was piped but empty, don't start REPL
    if is_piped {
        output::print_error("No input received from stdin.");
        std::process::exit(1);
    }

    // --session / --resume / --continue: load a saved session for REPL
    let session_id = cli.session.as_ref().or(cli.resume.as_ref());
    let fork_session = cli.fork_session;
    let resume_messages = if let Some(session_id) = session_id {
        let conn = crate::sessions::open_db()?;
        let messages = crate::sessions::load_session(&conn, session_id)?;
        if messages.is_empty() {
            eprintln!("Warning: session '{}' has no messages.", session_id);
        } else if fork_session {
            eprintln!(
                "{} Forked session '{}' ({} messages). Changes will not modify the original.",
                "fork:".cyan().bold(),
                session_id,
                messages.len()
            );
        } else {
            eprintln!("Resuming session '{}' ({} messages).", session_id, messages.len());
        }
        Some(messages)
    } else if cli.continue_session {
        // -c / --continue: load the most recent session
        let conn = crate::sessions::open_db()?;
        let sessions = crate::sessions::list_sessions(&conn, 1)?;
        if let Some(latest) = sessions.first() {
            let messages = crate::sessions::load_session(&conn, &latest.id)?;
            if messages.is_empty() {
                eprintln!("Warning: latest session '{}' has no messages.", latest.id);
            } else {
                eprintln!(
                    "Continuing session '{}' — {} ({} messages).",
                    latest.id,
                    latest.title,
                    messages.len()
                );
            }
            Some(messages)
        } else {
            eprintln!("No saved sessions to continue.");
            None
        }
    } else {
        None
    };

    // Resolve team mode from --team flag or AGI_TEAM env var
    let team_mode = cli.team || std::env::var("AGI_TEAM").is_ok_and(|v| v == "1" || v == "true");

    // Interactive mode: TUI (default) or classic REPL (--no-tui)
    if cli.no_tui {
        repl::run_repl(
            &mut app_config,
            &model,
            &sys_context,
            effective_system_prompt.as_deref(),
            resume_messages,
            effective_max_turns,
            cli.dangerously_skip_permissions,
            cli.fallback_model,
            cli.name,
            team_mode,
            cli.yes,
            cli.quiet,
        )
        .await
    } else {
        tui::run(
            &mut app_config,
            &model,
            &sys_context,
            effective_system_prompt.as_deref(),
            resume_messages,
            effective_max_turns,
            cli.dangerously_skip_permissions,
            cli.fallback_model,
            cli.name,
            team_mode,
            cli.yes,
            cli.quiet,
        )
        .await
    }
}

/// Read file contents for the -f flag, returning formatted file context.
fn read_file_contexts(files: &[String]) -> Result<String> {
    let mut context = String::new();
    for path in files {
        match std::fs::read_to_string(path) {
            Ok(contents) => {
                context.push_str(&format!(
                    "<file path=\"{}\">\n{}\n</file>\n\n",
                    path, contents
                ));
            }
            Err(e) => {
                output::print_error(&format!("Failed to read file '{}': {}", path, e));
                std::process::exit(1);
            }
        }
    }
    Ok(context)
}

/// Combine positional prompt, stdin content, and file context into the final prompt.
fn build_final_prompt(
    positional: Option<&str>,
    stdin_content: Option<&str>,
    file_context: &str,
) -> Option<String> {
    let has_positional = positional.is_some();
    let has_stdin = stdin_content.is_some();
    let has_files = !file_context.is_empty();

    if !has_positional && !has_stdin && !has_files {
        return None;
    }

    let mut prompt = String::new();

    // File context goes first
    if has_files {
        prompt.push_str(file_context);
    }

    // If we have both a positional prompt and stdin, use stdin as context
    if has_positional && has_stdin {
        prompt.push_str(&format!(
            "<stdin>\n{}\n</stdin>\n\n{}",
            stdin_content.unwrap_or_default(),
            positional.unwrap_or_default()
        ));
    } else if has_positional {
        prompt.push_str(positional.unwrap_or_default());
    } else if has_stdin {
        prompt.push_str(stdin_content.unwrap_or_default());
    }

    Some(prompt)
}

/// Execute a single prompt and exit.
#[allow(clippy::too_many_arguments)]
async fn run_oneshot(
    config: &config::CliConfig,
    model: &str,
    prompt: &str,
    json_output: bool,
    raw_output: bool,
    sys_context: &context::SystemContext,
    custom_system_prompt: Option<&str>,
    max_turns: Option<usize>,
    skip_permissions: bool,
    auto_approve_safe: bool,
    quiet: bool,
) -> Result<()> {
    let mut session = agent::AgentSession::new(model, sys_context, custom_system_prompt);
    session.max_turns = max_turns;
    session.skip_permissions = skip_permissions;
    session.auto_approve_safe = auto_approve_safe;
    session.quiet = quiet;

    if json_output {
        // Non-streaming JSON mode: collect full response
        let start = std::time::Instant::now();
        let result = session
            .send(config, prompt, Box::new(|_chunk| {
                // Collect silently — we use the returned text
            }))
            .await;
        let duration_ms = start.elapsed().as_millis() as u64;

        match result {
            Ok(turn) => {
                let cost_str = if turn.via_subscription {
                    output::format_subscription_cost(turn.input_tokens, turn.output_tokens)
                } else {
                    output::format_cost(model, turn.input_tokens, turn.output_tokens)
                };
                let json_out = serde_json::json!({
                    "type": "result",
                    "model": model,
                    "response": turn.response,
                    "input_tokens": turn.input_tokens,
                    "output_tokens": turn.output_tokens,
                    "via_subscription": turn.via_subscription,
                    "cost": cost_str,
                    "duration_ms": duration_ms,
                    "is_error": false,
                });
                println!("{}", serde_json::to_string_pretty(&json_out)?);
            }
            Err(e) => {
                let json_out = serde_json::json!({
                    "type": "result",
                    "is_error": true,
                    "error": format!("{:#}", e),
                    "duration_ms": duration_ms,
                });
                eprintln!("{}", serde_json::to_string_pretty(&json_out)?);
                std::process::exit(1);
            }
        }
    } else if raw_output {
        // Raw text mode: no spinner, no cost, no formatting
        let result = session
            .send(config, prompt, Box::new(|chunk| {
                output::print_assistant_chunk(chunk);
            }))
            .await;

        match result {
            Ok(_turn) => {
                println!();
            }
            Err(e) => {
                eprintln!("{}", e);
                std::process::exit(1);
            }
        }
    } else {
        // Streaming text mode with markdown rendering
        let spinner = output::create_spinner("Thinking...");
        let md = std::sync::Arc::new(std::sync::Mutex::new(markdown::MarkdownRenderer::new()));
        let md_cb = std::sync::Arc::clone(&md);

        let result = session
            .send(config, prompt, Box::new(move |chunk| {
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
                    output::print_subscription_cost(turn.input_tokens, turn.output_tokens);
                } else {
                    output::print_cost(model, turn.input_tokens, turn.output_tokens);
                }
            }
            Err(e) => {
                output::print_error(&format!("{:#}", e));
                std::process::exit(1);
            }
        }
    }

    Ok(())
}
