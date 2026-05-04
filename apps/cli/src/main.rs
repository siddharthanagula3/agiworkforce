// Active modules — core CLI functionality
mod agent;
mod agent_events;
mod agents;
mod auth;
mod cli_options;
mod command_registry;
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
mod output_styles;
mod permissions;
mod plan_mode;
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

// Extended CLI modules — used by subcommand handlers
mod app_server;
mod apply_patch;
mod cloud;
mod ecosystem;
mod exec_policy;
mod init;
mod model_catalog;
mod models_cache;
mod oauth;
mod onboarding;
mod plugins;
mod project_registry;
mod project_scope;
mod review;
mod routing;
mod runtime;
mod sandbox;
mod shell_snapshot;
mod sync;
mod tool_search;

// Phase-2 candidates — implementations exist but the user-facing surface is
// not yet wired. Each carries an inline PHASE2 marker explaining the unblock.
#[allow(dead_code)] // PHASE2: registry.agiworkforce.com not deployed; rewires to plugin-manifest discovery (Sprint B6)
mod marketplace;
#[allow(dead_code)] // PHASE2: Gemini-style declarative TOML tool-rule eval not yet wired into agent
mod policy;
#[allow(dead_code)] // PHASE2: SDK stdin-reader surface (StdinReader, ControlRequest, etc.) ships in Sprint B (headless mode hardening)
mod sdk_io;

// Phase-2 candidates — implementations exist with no current call sites.
// PHASE2 markers in each module describe what wires them up.
// Removed 2026-05-03 (dead): history, models_cache, shell_snapshot, tui_basic.
#[allow(dead_code)] // PHASE2: expose `agiworkforce a2a serve/discover/delegate`
mod a2a;
#[allow(dead_code)] // PHASE2: hook into session-end lifecycle in daemon.rs
mod memory_pipeline;
#[allow(dead_code)] // PHASE2: wire into daemon background tick
mod skill_learner;

use anyhow::{Context, Result};
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

    /// Model to use (e.g. claude-opus-4-6, gpt-5.4, gemini-3.1-flash-lite, llama3.1:8b)
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

    /// Output format for structured commands. Canonical name `--output-format`;
    /// `--output` is kept as an alias for backward compatibility.
    #[arg(
        long = "output-format",
        alias = "output",
        value_name = "FORMAT",
        value_enum
    )]
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

    /// Input format for print/SDK mode (text or stream-json).
    #[arg(long, value_name = "FORMAT", value_enum, default_value = "text")]
    input_format: cli_options::InputFormat,

    /// Permission mode for tool use.
    #[arg(long, value_name = "MODE", value_enum)]
    permission_mode: Option<cli_options::PermissionMode>,

    /// Sprint B4: short alias for `--permission-mode`. Accepts the same
    /// values (default, plan, accept-edits, bypass-permissions, dont-ask).
    /// When both `--mode` and `--permission-mode` are provided, `--mode`
    /// wins (it's the more visible flag for plan-mode users).
    #[arg(long, value_name = "MODE", value_enum)]
    mode: Option<cli_options::PermissionMode>,

    /// Sprint B4: in plan mode, auto-approve the first complete plan the
    /// model writes via `update_plan` -- intended for headless / CI runs
    /// where there is no human at the prompt to type `/plan accept`.
    #[arg(long)]
    auto_approve_plan: bool,

    /// Allow specific tools or tool patterns. Comma-separated and repeatable.
    #[arg(long = "allowedTools", alias = "allowed-tools", value_delimiter = ',')]
    allowed_tools: Vec<String>,

    /// Disallow specific tools or tool patterns. Comma-separated and repeatable.
    #[arg(
        long = "disallowedTools",
        alias = "disallowed-tools",
        value_delimiter = ','
    )]
    disallowed_tools: Vec<String>,

    /// Load MCP server configuration from a file. Repeatable.
    #[arg(long = "mcp-config", value_name = "FILE")]
    mcp_config: Vec<String>,

    /// Use only MCP servers from explicit --mcp-config files.
    #[arg(long)]
    strict_mcp_config: bool,

    /// Add an extra working directory to the session context. Repeatable.
    #[arg(long = "add-dir", value_name = "DIR")]
    add_dir: Vec<String>,

    /// Start with a named agent definition.
    #[arg(long, value_name = "AGENT")]
    agent: Option<String>,

    /// Resume or bind to a specific agent thread id.
    #[arg(long = "agent-id", value_name = "ID")]
    agent_id: Option<String>,

    /// Disable session persistence for this run.
    #[arg(long = "no-session-persistence", default_value_t = true, action = clap::ArgAction::SetFalse)]
    session_persistence: bool,

    /// Resume a session at a specific event/turn marker.
    #[arg(long = "resume-session-at", value_name = "MARKER")]
    resume_session_at: Option<String>,

    /// Restrict settings sources. Comma-separated and repeatable.
    #[arg(long, value_name = "SOURCE", value_delimiter = ',')]
    settings: Vec<String>,

    /// Emit machine-readable JSONL agent events to stdout (one per line).
    /// Pipe through `jq` for inspection in CI / dashboards.
    #[arg(long = "json-events")]
    json_events: bool,

    /// Demo mode: synthesizes a rate-limit error on the first model call so
    /// the multi-model fallback chain visibly fires. For live demos and
    /// integration tests where you don't want to wait for a real 429.
    #[arg(long)]
    demo: bool,

    /// Read the system prompt from a file. Mutually composes with
    /// `--system-prompt`: file contents win when both are supplied.
    #[arg(long = "system-prompt-file", value_name = "FILE")]
    system_prompt_file: Option<String>,

    /// Append the contents of a file to the system prompt.
    #[arg(long = "append-system-prompt-file", value_name = "FILE")]
    append_system_prompt_file: Option<String>,

    /// Emit partial-message chunks (token deltas) as `stream_event` events
    /// when `--output-format stream-json` is active. Off by default — final
    /// `assistant_message` events are still emitted either way.
    #[arg(long = "include-partial-messages")]
    include_partial_messages: bool,

    /// Stop the session when total spend exceeds this many USD.
    /// Returns a `status_update` event with reason `budget_exhausted`.
    #[arg(long = "max-budget-usd", value_name = "USD")]
    max_budget_usd: Option<f64>,

    /// Use a specific session UUID for this run. Differs from `--resume <id>`
    /// (which loads an existing session): `--session-id` sets the id at start
    /// even when no prior session exists, useful for embedder-driven flows
    /// that pre-allocate ids.
    #[arg(long = "session-id", value_name = "UUID")]
    session_id_override: Option<String>,

    /// Print the assembled system prompt to stdout and exit. No API call is
    /// made. Useful for inspecting `<environment>`, memory injection, and
    /// project instructions before running a session.
    #[arg(long = "dump-system-prompt")]
    dump_system_prompt: bool,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OneShotOutputMode {
    Text,
    RawText,
    JsonPretty,
    JsonLine,
}

fn resolve_oneshot_output_mode(
    json: bool,
    raw: bool,
    print: bool,
    output: Option<OutputFormat>,
) -> OneShotOutputMode {
    match output {
        Some(OutputFormat::Json) => OneShotOutputMode::JsonPretty,
        Some(OutputFormat::StreamJson) => OneShotOutputMode::JsonLine,
        Some(OutputFormat::Text) => {
            if raw || print {
                OneShotOutputMode::RawText
            } else {
                OneShotOutputMode::Text
            }
        }
        None if json => OneShotOutputMode::JsonPretty,
        None if raw || print => OneShotOutputMode::RawText,
        None => OneShotOutputMode::Text,
    }
}

/// Shell type for completions generation.
#[derive(Debug, Clone, Copy, ValueEnum)]
enum ShellType {
    Bash,
    Zsh,
    Fish,
}

// ---------------------------------------------------------------------------
// Subcommands
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
    /// Inspect or branch sessions (replay).
    Session {
        #[command(subcommand)]
        action: SessionAction,
    },
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
    /// Scan for ecosystem tools (Claude, Codex, Cursor, Gemini) and import MCP configs.
    Ecosystem {
        #[command(subcommand)]
        action: EcosystemSubcommand,
    },
    /// Browse session history.
    History {
        /// Maximum number of sessions to display.
        #[arg(long, default_value = "20")]
        limit: usize,
    },
    /// Sync dotfiles and settings across devices.
    Sync {
        #[command(subcommand)]
        action: SyncSubcommand,
    },
    /// Login to AGI Workforce cloud (or an LLM provider via OAuth).
    Login {
        /// Provider to login with (agiworkforce, anthropic, openai). Omit for interactive menu.
        provider: Option<String>,
    },
    /// Logout from AGI Workforce cloud.
    Logout,
    /// Show authentication status for all configured providers.
    AuthStatus,
    /// Browse and install marketplace plugins.
    Marketplace {
        #[command(subcommand)]
        action: MarketplaceSubcommand,
    },
    /// Initialize ~/.agiworkforce/ directory structure and project registration.
    Init,
    /// Run the first-run onboarding wizard again.
    Onboarding,
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

#[derive(Subcommand, Debug, Clone)]
enum SessionAction {
    /// List recent sessions, newest first.
    List {
        #[arg(long, default_value = "20")]
        limit: usize,
    },
    /// Show the turn-by-turn transcript of a session.
    Show {
        session_id: String,
    },
    /// Fork a session at a specific turn into a new named session.
    Fork {
        session_id: String,
        /// Turn index to fork at (0-based, counts user→assistant pairs).
        #[arg(long = "at-turn")]
        at_turn: Option<usize>,
        /// New session name; auto-generated if omitted.
        #[arg(long = "as")]
        as_name: Option<String>,
    },
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

#[derive(Subcommand, Debug)]
enum EcosystemSubcommand {
    /// Scan for installed AI tools and IDEs.
    Scan,
    /// Import MCP server configs from detected tools.
    Import,
    /// Show detected tools and available MCP servers in detail.
    Show,
}

#[derive(Subcommand, Debug)]
enum SyncSubcommand {
    /// Show which synced files have changed since last sync.
    Status,
    /// Export synced files to a JSON bundle (prints to stdout).
    Export,
    /// Import a sync bundle from a JSON file.
    Import {
        /// Path to the sync bundle JSON file.
        file: String,
    },
}

#[derive(Subcommand, Debug)]
enum MarketplaceSubcommand {
    /// Search the remote plugin marketplace.
    Search {
        /// Search query.
        query: String,
    },
    /// Install a plugin from a local path or git URL.
    Install {
        /// Local path or git URL to install from.
        source: String,
        /// Installation scope (user, project, local).
        #[arg(long, default_value = "user")]
        scope: String,
    },
    /// Uninstall a plugin by name.
    Uninstall {
        /// Plugin name to uninstall.
        name: String,
    },
    /// List all installed marketplace plugins.
    List,
    /// Update all git-installed plugins.
    Update,
}

type ManagedResumeSession = (runtime::session::ManagedSession, std::path::PathBuf);

type ResumePayload = (Vec<crate::models::Message>, Option<ManagedResumeSession>);

fn managed_resume_payload_from_resolved(
    resolved: runtime::session_control::ResolvedManagedSessionReference,
) -> Result<ResumePayload> {
    let managed_session = runtime::session::ManagedSession::load_from_path(&resolved.path)?;
    let messages = managed_session.messages.clone();
    Ok((messages, Some((managed_session, resolved.path))))
}

fn load_legacy_session_messages(reference: &str) -> Result<Vec<crate::models::Message>> {
    if matches!(reference, "latest" | "@latest" | "last") {
        return latest_legacy_session_messages()?
            .map(|(_, messages)| messages)
            .ok_or_else(|| anyhow::anyhow!("No legacy JSON conversations found"));
    }

    let conversation = conversations::load_conversation(reference)?;
    Ok(conversation
        .messages
        .into_iter()
        .map(|message| crate::models::Message::text(&message.role, message.content))
        .collect())
}

fn latest_legacy_session_messages() -> Result<Option<(String, Vec<crate::models::Message>)>> {
    let Some(summary) = conversations::list_conversations()?.into_iter().next() else {
        return Ok(None);
    };
    let conversation = conversations::load_conversation(&summary.id)?;
    let messages = conversation
        .messages
        .into_iter()
        .map(|message| crate::models::Message::text(&message.role, message.content))
        .collect();
    Ok(Some((summary.id, messages)))
}

fn resolve_resume_payload(reference: &str, fork: bool) -> Result<ResumePayload> {
    let managed_attempt = if fork {
        runtime::session_control::fork_managed_session(reference)
    } else {
        runtime::session_control::resolve_managed_session_reference(reference)
    };

    match managed_attempt {
        Ok(resolved) => managed_resume_payload_from_resolved(resolved),
        Err(managed_error) => load_legacy_session_messages(reference).with_context(|| {
            format!(
                "Managed session resolution failed ({managed_error:#}); legacy JSON conversation fallback also failed"
            )
        }).map(|messages| (messages, None)),
    }
}

fn resolve_latest_resume_payload() -> Result<Option<(String, ResumePayload)>> {
    if let Some(resolved) = runtime::session_control::latest_managed_session()? {
        let session_id = resolved.summary.session_id.clone();
        return Ok(Some((
            session_id,
            managed_resume_payload_from_resolved(resolved)?,
        )));
    }

    if let Some((session_id, messages)) = latest_legacy_session_messages()? {
        return Ok(Some((session_id, (messages, None))));
    }

    Ok(None)
}

// ---------------------------------------------------------------------------
// Session subcommand handler — replay / branch points
// ---------------------------------------------------------------------------

async fn handle_session_action(action: SessionAction) -> Result<()> {
    use colored::Colorize;
    match action {
        SessionAction::List { limit } => {
            let mut summaries = runtime::session_control::list_managed_sessions()
                .unwrap_or_default();
            summaries.sort_by(|a, b| b.created_at.cmp(&a.created_at));
            summaries.truncate(limit);
            if summaries.is_empty() {
                println!("No sessions found.");
                return Ok(());
            }
            println!("{}", "Recent sessions:".cyan().bold());
            for s in summaries {
                println!(
                    "  {}  {:>4} msgs  {}",
                    s.session_id.dimmed(),
                    s.message_count,
                    s.created_at.format("%Y-%m-%d %H:%M:%S"),
                );
            }
            Ok(())
        }
        SessionAction::Show { session_id } => {
            let (messages, _) = resolve_resume_payload(&session_id, false)?;
            println!(
                "{}: {} messages",
                session_id.cyan().bold(),
                messages.len()
            );
            for (i, msg) in messages.iter().enumerate() {
                let preview: String = msg.text_content().chars().take(120).collect();
                println!("  [{:>3}] {:<10}  {}", i, msg.role, preview);
            }
            Ok(())
        }
        SessionAction::Fork {
            session_id,
            at_turn,
            as_name,
        } => {
            let (mut messages, _) = resolve_resume_payload(&session_id, true)?;
            if let Some(turn) = at_turn {
                // Truncate to the first `turn` user→assistant pairs.
                let mut user_seen = 0usize;
                let mut keep_to = messages.len();
                for (i, m) in messages.iter().enumerate() {
                    if m.role == "user" {
                        if user_seen == turn {
                            keep_to = i + 1;
                            if let Some(next) = messages.get(i + 1) {
                                if next.role == "assistant" {
                                    keep_to = i + 2;
                                }
                            }
                            break;
                        }
                        user_seen += 1;
                    }
                }
                messages.truncate(keep_to);
            }
            let new_name = as_name
                .clone()
                .unwrap_or_else(|| format!("{}-fork", session_id));
            println!(
                "{} Forked '{}' → '{}' ({} messages{}).",
                "fork:".green().bold(),
                session_id,
                new_name,
                messages.len(),
                at_turn
                    .map(|t| format!(", at turn {t}"))
                    .unwrap_or_default(),
            );
            Ok(())
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let normalized_cli_options = cli_options::CliOptions::from_cli(&cli);

    // Load configuration (global + project + env overrides merged)
    let mut app_config = config::CliConfig::load_merged()?;

    // Pull any user-defined `[providers.<name>]` blocks into the runtime
    // OpenAI-compatible registry (OpenRouter, NVIDIA NIM, Groq, Together,
    // Fireworks, etc.). Reserved provider names are ignored — see
    // `models::register_custom_providers`.
    models::register_custom_providers(&app_config);

    // --debug: enable verbose logging
    if cli.debug.is_some() {
        // Setting verbose mode so debug info is visible
        if !cli.quiet {
            eprintln!(
                "[debug] Debug mode enabled. Categories: {}",
                cli.debug
                    .as_ref()
                    .and_then(|d| d.as_deref())
                    .unwrap_or("all")
            );
        }
    }

    // --fork-session: noted for session loading (handled below)
    let _fork_session = cli.fork_session;

    // Validate configuration — warn but continue with defaults on failure
    if let Err(e) = app_config.validate() {
        eprintln!(
            "Warning: config validation failed: {}. Continuing with defaults.",
            e
        );
    }

    // --- First-run: initialize home directory and run onboarding if needed ---
    if let Ok(home) = config::CliConfig::config_dir() {
        // Always ensure the directory structure exists (idempotent)
        if let Err(e) = init::init_home_dir(&home) {
            eprintln!("Warning: failed to initialize home directory: {}", e);
        }

        // First-run onboarding wizard (only if interactive terminal and no subcommand).
        // Skipped when the user is running a non-interactive read-only flag like
        // `--dump-system-prompt` — those should never block on a TTY prompt.
        if cli.command.is_none()
            && cli.prompt.is_none()
            && !cli.dump_system_prompt
            && io::stdin().is_terminal()
            && !onboarding::is_setup_complete()
        {
            match onboarding::run_onboarding().await {
                Ok(true) => {
                    // Reload config after onboarding may have changed it
                    app_config = config::CliConfig::load_merged()?;
                    models::register_custom_providers(&app_config);
                }
                Ok(false) => {
                    // User skipped or interrupted — continue with defaults
                }
                Err(e) => {
                    eprintln!("Warning: onboarding error: {}. Continuing.", e);
                }
            }
        }
    }

    // --- Subcommand dispatch ---
    if let Some(ref command) = cli.command {
        let sys_ctx = context::gather_system_context();
        return match command {
            Command::Exec {
                prompt,
                model,
                full_auto,
                json,
            } => {
                let raw_model = model
                    .as_deref()
                    .unwrap_or(&app_config.default.model)
                    .to_string();
                let chain = routing::fallback::FallbackChain::parse(&raw_model);
                let m = chain
                    .head()
                    .map(|s| s.to_string())
                    .unwrap_or(raw_model.clone());
                let mut session = agent::AgentSession::new(&m, &sys_ctx, None);
                session.set_provider_override(&app_config.default.provider);
                if chain.primaries.len() > 1 {
                    session.fallback_chain = Some(chain);
                }
                session.demo_force_rate_limit = cli.demo;
                session.demo_mode = cli.demo;
                if *full_auto {
                    session.skip_permissions = true;
                    session.auto_approve_safe = true;
                }
                session.quiet = true;
                session.enable_managed_session()?;
                let is_json = *json;
                let json_events = cli.json_events;
                let session_id = session
                    .managed_session_id()
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| "exec".to_string());
                if cli.json_events {
                    let sid = session_id.clone();
                    session.on_fallback =
                        Some(agent::FallbackSink(Box::new(move |from, to, kind| {
                            agent_events::AgentEvent::FallbackTriggered {
                                session_id: sid.clone(),
                                from: from.to_string(),
                                to: to.to_string(),
                                reason: match kind {
                                    "api_rate_limit" => "api_rate_limit",
                                    "network" => "network",
                                    "stream_disconnect" => "stream_disconnect",
                                    "api_server_error" => "api_server_error",
                                    _ => "transient",
                                },
                            }
                            .emit_stdout();
                        })));
                }
                let provider_label = format!("{:?}", session.provider).to_lowercase();

                if json_events {
                    agent_events::AgentEvent::Spawning {
                        session_id: session_id.clone(),
                        model: m.clone(),
                        provider: provider_label.clone(),
                    }
                    .emit_stdout();
                    agent_events::AgentEvent::ReadyForPrompt {
                        session_id: session_id.clone(),
                    }
                    .emit_stdout();
                }

                let session_id_for_chunks = session_id.clone();
                let result = session
                    .send(
                        &app_config,
                        prompt,
                        Box::new(move |chunk| {
                            if json_events {
                                agent_events::AgentEvent::MessageDelta {
                                    session_id: session_id_for_chunks.clone(),
                                    text: chunk.to_string(),
                                }
                                .emit_stdout();
                            } else if !is_json {
                                output::print_assistant_chunk(chunk);
                            }
                        }),
                    )
                    .await;
                match result {
                    Ok(turn) => {
                        if json_events {
                            agent_events::AgentEvent::TurnUsage {
                                session_id: session_id.clone(),
                                in_tokens: turn.input_tokens as u32,
                                out_tokens: turn.output_tokens as u32,
                                cache_read: turn.cache_read_tokens,
                                cache_creation: turn.cache_creation_tokens,
                                cumulative_dollars: 0.0,
                            }
                            .emit_stdout();
                            agent_events::AgentEvent::Finished {
                                session_id,
                                reason: "completed",
                            }
                            .emit_stdout();
                        } else if *json {
                            println!(
                                "{}",
                                serde_json::to_string_pretty(&serde_json::json!({
                                    "response": turn.response, "input_tokens": turn.input_tokens,
                                    "output_tokens": turn.output_tokens,
                                }))?
                            );
                        } else {
                            println!();
                        }
                        Ok(())
                    }
                    Err(e) => {
                        if json_events {
                            // Best-effort classify into a deterministic kind. Anything
                            // we can't classify becomes a generic stream_disconnect.
                            let cli_err = errors::CliError::StreamError {
                                provider: provider_label.clone(),
                                message: e.to_string(),
                                is_retryable: false,
                            };
                            agent_events::AgentEvent::from_error(session_id.clone(), &cli_err)
                                .emit_stdout();
                        } else {
                            eprintln!("{}", e);
                        }
                        std::process::exit(1);
                    }
                }
            }
            Command::Resume { session_id } => {
                let (session_label, (messages, managed_session)) = match session_id {
                    Some(id) => (id.clone(), resolve_resume_payload(id, false)?),
                    None => resolve_latest_resume_payload()?
                        .ok_or_else(|| anyhow::anyhow!("No sessions found"))?,
                };
                if messages.is_empty() {
                    eprintln!("Warning: session '{}' has no messages.", session_label);
                } else {
                    eprintln!(
                        "Resuming session '{}' ({} messages).",
                        session_label,
                        messages.len()
                    );
                }
                let model = app_config.default.model.clone();
                repl::run_repl(
                    &mut app_config,
                    &model,
                    &sys_ctx,
                    None,
                    Some(messages),
                    managed_session,
                    None,
                    false,
                    None,
                    None,
                    false,
                    false,
                    false,
                    cli_options::PermissionMode::Default,
                    false,
                )
                .await
            }
            Command::Fork { session_id } => {
                let (messages, managed_session) = resolve_resume_payload(session_id, true)?;
                eprintln!(
                    "{} Forked session '{}' ({} messages)",
                    "fork:".cyan().bold(),
                    session_id,
                    messages.len()
                );
                let model = app_config.default.model.clone();
                repl::run_repl(
                    &mut app_config,
                    &model,
                    &sys_ctx,
                    None,
                    Some(messages),
                    managed_session,
                    None,
                    false,
                    None,
                    None,
                    false,
                    false,
                    false,
                    cli_options::PermissionMode::Default,
                    false,
                )
                .await
            }
            Command::Session { action } => handle_session_action(action.clone()).await,
            Command::Review {
                base,
                commit,
                prompt,
                model,
                ..
            } => {
                let opts = review::ReviewOptions {
                    uncommitted: base.is_none() && commit.is_none(),
                    base_branch: base.clone(),
                    commit: commit.clone(),
                    instructions: prompt.clone(),
                    model: model.clone(),
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
                    } else {
                        eprintln!("No sessions found.");
                    }
                }
                Ok(())
            }
            Command::Sandbox { full_auto, command } => {
                let cmd_str = command.join(" ");
                let cwd = std::env::current_dir()?;
                let mgr = if *full_auto {
                    sandbox::SandboxManager::full_auto(cwd.clone())
                } else {
                    sandbox::SandboxManager::new(sandbox::SandboxPolicy::default(), cwd.clone())
                };
                eprintln!("Sandbox [{}]: {}", mgr.sandbox_type.name(), cmd_str);
                let out = sandbox::execute_sandboxed(&mgr, &cmd_str, Some(&cwd)).await?;
                io::Write::write_all(&mut io::stdout(), &out.stdout)?;
                io::Write::write_all(&mut io::stderr(), &out.stderr)?;
                std::process::exit(out.status.code().unwrap_or(1));
            }
            Command::McpServer => app_server::run_mcp_server().await,
            Command::AppServer { listen } => {
                const DEFAULT_APP_SERVER_ADDR: &str = "127.0.0.1:8787";
                let cfg = if listen == "stdio" {
                    app_server::AppServerConfig::default()
                } else {
                    app_server::AppServerConfig {
                        transport: app_server::AppServerTransport::WebSocket {
                            addr: listen
                                .trim_start_matches("ws://")
                                .parse()
                                // SAFETY: DEFAULT_APP_SERVER_ADDR is a valid const SocketAddr
                                .unwrap_or_else(|_| {
                                    DEFAULT_APP_SERVER_ADDR.parse().expect(
                                        "const DEFAULT_APP_SERVER_ADDR must be a valid SocketAddr",
                                    )
                                }),
                        },
                        ..Default::default()
                    }
                };
                app_server::run_app_server(cfg).await
            }
            Command::Cloud { action } => {
                let cc = cloud::CloudConfig::default();
                match action {
                    CloudSubcommand::Exec { prompt, model } => {
                        cloud::cloud_exec(&cc, prompt, model.as_deref()).await?;
                        Ok(())
                    }
                    CloudSubcommand::List { .. } => {
                        println!("Cloud tasks: connect to cloud backend to list");
                        Ok(())
                    }
                    CloudSubcommand::Models => {
                        println!("{}", cloud::format_cloud_models());
                        cloud::print_cloud_status(&cc);
                        Ok(())
                    }
                }
            }
            Command::Plugin { action } => {
                let mut mgr = plugins::PluginsManager::new();
                match action {
                    PluginSubcommand::List => {
                        mgr.load_all(std::env::current_dir().ok().as_deref())?;
                        for p in mgr.plugins() {
                            let st = if p.enabled {
                                "enabled".green()
                            } else {
                                "disabled".red()
                            };
                            // Sprint B6: surface manifest format origin so users can
                            // tell at a glance whether a plugin is using the AGI,
                            // Claude, Codex, or legacy schema.
                            let fmt_tag = match p.format {
                                Some(fmt) => format!("[{}]", fmt.short_tag()),
                                None => "[no-manifest]".to_string(),
                            };
                            println!(
                                "  {} {} [{}] {}",
                                p.config_name,
                                fmt_tag,
                                st,
                                p.root.display()
                            );
                        }
                        Ok(())
                    }
                    PluginSubcommand::Install { source, name } => {
                        let pname = name.clone().unwrap_or_else(|| {
                            source.rsplit('/').next().unwrap_or("plugin").to_string()
                        });
                        let psrc = if source.starts_with("http") || source.contains("git") {
                            plugins::PluginSource::Git {
                                url: source.clone(),
                                branch: None,
                            }
                        } else {
                            plugins::PluginSource::Local(std::path::PathBuf::from(source))
                        };
                        match mgr.install(plugins::PluginInstallRequest {
                            source: psrc,
                            name: pname,
                        }) {
                            plugins::PluginInstallOutcome::Installed { path, format } => {
                                let fmt_tag = match format {
                                    Some(fmt) => format!(" ({} manifest)", fmt.short_tag()),
                                    None => String::new(),
                                };
                                println!("Installed to {}{}", path.display(), fmt_tag)
                            }
                            plugins::PluginInstallOutcome::AlreadyInstalled { path } => {
                                println!("Already at {}", path.display())
                            }
                            plugins::PluginInstallOutcome::Failed { error } => {
                                eprintln!("Failed: {}", error)
                            }
                        }
                        Ok(())
                    }
                }
            }
            Command::Features => {
                let f = tool_search::FeatureFlags::standard();
                println!(
                    "Feature Flags:\n  shell_tool: {}\n  code_mode: {}\n  tool_suggest: {}\n  web_search: {}\n  apply_patch: {}",
                    f.shell_tool, f.code_mode, f.tool_suggest, f.web_search, f.apply_patch_freeform
                );
                Ok(())
            }
            Command::Execpolicy => {
                let policy = exec_policy::ExecPolicy::load()?;
                if policy.rules.is_empty() {
                    println!("No rules. Add .rules files to ~/.agiworkforce/rules/");
                } else {
                    println!("{} rule(s):", policy.rules.len());
                    for r in &policy.rules {
                        println!("  {:?} — {}", r.effect, r.source);
                    }
                }
                Ok(())
            }

            // --- Ecosystem ---
            Command::Ecosystem { action } => match action {
                EcosystemSubcommand::Scan => {
                    let detected = ecosystem::scan();
                    println!("{}", ecosystem::format_table(&detected));
                    Ok(())
                }
                EcosystemSubcommand::Import => {
                    let detected = ecosystem::scan();
                    let servers = ecosystem::import_mcp_servers(&detected);
                    if servers.is_empty() {
                        println!("No MCP server configs found to import.");
                    } else {
                        println!("Imported {} MCP server config(s):", servers.len());
                        for s in &servers {
                            let transport = if s.url.is_some() { "HTTP/SSE" } else { "stdio" };
                            println!("  {} ({}) [{}]", s.name, s.source, transport);
                        }
                    }
                    let skills = ecosystem::discover_external_skills(&detected);
                    if !skills.is_empty() {
                        println!("\nDiscovered {} external skill file(s).", skills.len());
                    }
                    Ok(())
                }
                EcosystemSubcommand::Show => {
                    let detected = ecosystem::scan();
                    let ctx = ecosystem::build_context(&detected);
                    println!("{}", ecosystem::format_table(&detected));
                    if !ctx.available_instructions.is_empty() {
                        println!("\nAvailable instruction files:");
                        for i in &ctx.available_instructions {
                            println!(
                                "  {} — {} ({} bytes)",
                                i.tool,
                                i.path.display(),
                                i.size_bytes
                            );
                        }
                    }
                    let servers = ecosystem::import_mcp_servers(&detected);
                    if !servers.is_empty() {
                        println!("\nImportable MCP servers:");
                        for s in &servers {
                            let cmd_display = s
                                .command
                                .as_deref()
                                .or(s.url.as_deref())
                                .unwrap_or("(unknown)");
                            println!("  {} — {}", s.name, cmd_display);
                        }
                    }
                    Ok(())
                }
            },

            // --- History ---
            Command::History { limit } => {
                let conn = sessions::open_db()?;
                let list = sessions::list_sessions(&conn, *limit)?;
                if list.is_empty() {
                    println!("No sessions found.");
                } else {
                    println!("{}", sessions::format_session_list(&list));
                }
                Ok(())
            }

            // --- Sync ---
            Command::Sync { action } => {
                let home = config::CliConfig::config_dir()?;
                match action {
                    SyncSubcommand::Status => {
                        let changes = sync::ConfigSync::status(&home)?;
                        if changes.is_empty() {
                            println!("No synced files found.");
                        } else {
                            println!("{:<35} Status", "File");
                            println!("{}", "-".repeat(50));
                            for (path, change) in &changes {
                                println!("{:<35} {}", path, change);
                            }
                        }
                        Ok(())
                    }
                    SyncSubcommand::Export => {
                        let bundle = sync::ConfigSync::export(&home)?;
                        let json = serde_json::to_string_pretty(&bundle)?;
                        println!("{}", json);
                        Ok(())
                    }
                    SyncSubcommand::Import { file } => {
                        let contents = std::fs::read_to_string(file)
                            .map_err(|e| anyhow::anyhow!("Failed to read {}: {}", file, e))?;
                        let bundle: sync::SyncBundle = serde_json::from_str(&contents)
                            .map_err(|e| anyhow::anyhow!("Failed to parse sync bundle: {}", e))?;
                        let report = sync::ConfigSync::import(&home, &bundle)?;
                        if !report.files_updated.is_empty() {
                            println!("Updated:");
                            for f in &report.files_updated {
                                println!("  {}", f);
                            }
                        }
                        if !report.files_skipped.is_empty() {
                            println!("Skipped (unchanged):");
                            for f in &report.files_skipped {
                                println!("  {}", f);
                            }
                        }
                        if !report.conflicts.is_empty() {
                            println!("Conflicts (local kept):");
                            for f in &report.conflicts {
                                println!("  {}", f);
                            }
                        }
                        Ok(())
                    }
                }
            }

            // --- Login ---
            Command::Login { provider } => {
                match provider.as_deref() {
                    Some("agiworkforce") | Some("agi") => {
                        let api_base = "https://api.agiworkforce.com";
                        let entry = oauth::device_code_login(api_base).await?;
                        let mut store = auth::AuthStore::load()?;
                        store.entries.insert("agiworkforce".to_string(), entry);
                        store.save()?;
                        Ok(())
                    }
                    Some(pid) => {
                        if let Some(provider_cfg) = oauth::get_provider(pid) {
                            let entry = oauth::oauth_login(provider_cfg).await?;
                            let mut store = auth::AuthStore::load()?;
                            store.entries.insert(pid.to_string(), entry);
                            store.save()?;
                        } else {
                            eprintln!(
                                "Unknown provider '{}'. Available: agiworkforce, anthropic, openai",
                                pid
                            );
                        }
                        Ok(())
                    }
                    None => {
                        // Interactive menu via existing auth flow
                        auth::interactive_login().await?;
                        Ok(())
                    }
                }
            }

            // --- Logout ---
            Command::Logout => {
                let mut store = auth::AuthStore::load()?;
                if store.entries.is_empty() {
                    println!("No active sessions to logout from.");
                } else {
                    let count = store.entries.len();
                    store.entries.clear();
                    store.save()?;
                    println!("Logged out from {} provider(s).", count);
                }
                Ok(())
            }

            // --- Auth Status ---
            Command::AuthStatus => {
                let statuses = auth::auth_status()?;
                if statuses.is_empty() {
                    println!("No authentication configured.");
                    println!("Run `agiworkforce login` to authenticate.");
                } else {
                    println!("{:<18} {:<10} {:<12} Expires", "Provider", "Type", "Status");
                    println!("{}", "-".repeat(60));
                    for s in &statuses {
                        println!(
                            "{:<18} {:<10} {:<12} {}",
                            s.provider,
                            s.auth_type,
                            s.status,
                            s.expires_in.as_deref().unwrap_or("-"),
                        );
                    }
                }
                Ok(())
            }

            // --- Marketplace ---
            Command::Marketplace { action } => {
                let home = config::CliConfig::config_dir()?;
                let mp = marketplace::Marketplace::new();
                match action {
                    MarketplaceSubcommand::Search { query } => {
                        let results = mp.search(query).await?;
                        println!("{}", marketplace::format_search_results(&results));
                        Ok(())
                    }
                    MarketplaceSubcommand::Install { source, scope } => {
                        mp.install(source, &home, scope).await?;
                        Ok(())
                    }
                    MarketplaceSubcommand::Uninstall { name } => {
                        mp.uninstall(name, &home)?;
                        Ok(())
                    }
                    MarketplaceSubcommand::List => {
                        let registry = marketplace::Marketplace::list_installed(&home);
                        println!("{}", marketplace::format_installed(&registry));
                        Ok(())
                    }
                    MarketplaceSubcommand::Update => {
                        mp.update_all(&home).await?;
                        Ok(())
                    }
                }
            }

            // --- Init ---
            Command::Init => {
                let home = config::CliConfig::config_dir()?;
                init::init_home_dir(&home)?;
                println!("Initialized ~/.agiworkforce/ directory structure.");

                // Register current directory as a project
                let cwd = std::env::current_dir()?;
                let project_root = project_scope::resolve_project_scope(&cwd);
                let mut registry = project_registry::ProjectRegistry::load(&home)?;
                registry.register_project(&project_root, "trusted")?;
                registry.save(&home)?;
                println!("Registered project: {}", project_root.display());
                Ok(())
            }

            // --- Onboarding ---
            Command::Onboarding => {
                match onboarding::run_onboarding().await {
                    Ok(true) => {
                        println!("Onboarding complete.");
                    }
                    Ok(false) => {
                        println!("Onboarding skipped.");
                    }
                    Err(e) => {
                        eprintln!("Onboarding error: {}", e);
                    }
                }
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
                let title = if s.title.is_empty() {
                    "(untitled)"
                } else {
                    &s.title
                };
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
    let stdin_content = if is_piped || cli.stdin || cli.prompt.as_deref() == Some("-") {
        let mut buf = String::new();
        io::stdin().read_to_string(&mut buf)?;
        if buf.is_empty() {
            None
        } else {
            Some(buf)
        }
    } else {
        None
    };

    // --cost with no prompt and no stdin: just show pricing info
    if cli.cost && cli.prompt.is_none() && stdin_content.is_none() {
        let model = cli.model.as_deref().unwrap_or(&app_config.default.model);
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

    // --dump-system-prompt: assemble the system prompt the way AgentSession::new
    // would, print it to stdout, and exit. No API call. Useful for debugging.
    if cli.dump_system_prompt {
        let prompt =
            agent::assemble_system_prompt(&sys_context, effective_system_prompt.as_deref());
        println!("{}", prompt);
        return Ok(());
    }

    let oneshot_output_mode = resolve_oneshot_output_mode(cli.json, cli.raw, cli.print, cli.output);
    let effective_skip_permissions =
        normalized_cli_options.should_skip_permissions(cli.dangerously_skip_permissions);
    let effective_auto_approve_safe = normalized_cli_options.should_auto_approve_safe(cli.yes);

    // Sprint B4: `--mode` wins over `--permission-mode` when both are
    // provided. Falls back to Default when neither is set, matching the
    // existing PermissionMode default.
    let effective_permission_mode: cli_options::PermissionMode = cli
        .mode
        .or(cli.permission_mode)
        .unwrap_or(cli_options::PermissionMode::Default);
    let effective_auto_approve_plan = cli.auto_approve_plan;

    // Resolve effective max_turns: explicit --max-turns wins, then --effort preset
    let effective_max_turns = cli.max_turns.or(effort_max_turns);

    // Determine mode: one-shot if we have a prompt (from arg or stdin) or --print, REPL otherwise
    if let Some(ref prompt) = final_prompt {
        return run_oneshot(
            &app_config,
            &model,
            prompt,
            oneshot_output_mode,
            &sys_context,
            effective_system_prompt.as_deref(),
            effective_max_turns,
            effective_skip_permissions,
            effective_auto_approve_safe,
            cli.quiet,
            effective_permission_mode,
            effective_auto_approve_plan,
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
    let resume_payload = if let Some(session_id) = session_id {
        let payload = resolve_resume_payload(session_id, fork_session)?;
        let message_count = payload.0.len();
        if message_count == 0 {
            eprintln!("Warning: session '{}' has no messages.", session_id);
        } else if fork_session {
            eprintln!(
                "{} Forked session '{}' ({} messages). Changes will not modify the original.",
                "fork:".cyan().bold(),
                session_id,
                message_count
            );
        } else {
            eprintln!(
                "Resuming session '{}' ({} messages).",
                session_id, message_count
            );
        }
        Some(payload)
    } else if cli.continue_session {
        if let Some((session_label, payload)) = resolve_latest_resume_payload()? {
            let message_count = payload.0.len();
            if message_count == 0 {
                eprintln!(
                    "Warning: latest session '{}' has no messages.",
                    session_label
                );
            } else {
                eprintln!(
                    "Continuing session '{}' ({} messages).",
                    session_label, message_count
                );
            }
            Some(payload)
        } else {
            eprintln!("No saved sessions to continue.");
            None
        }
    } else {
        None
    };
    let (resume_messages, resume_managed_session) = match resume_payload {
        Some((messages, managed_session)) => (Some(messages), managed_session),
        None => (None, None),
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
            resume_managed_session,
            effective_max_turns,
            effective_skip_permissions,
            cli.fallback_model,
            cli.name,
            team_mode,
            effective_auto_approve_safe,
            cli.quiet,
            effective_permission_mode,
            effective_auto_approve_plan,
        )
        .await
    } else {
        tui::run(
            &mut app_config,
            &model,
            &sys_context,
            effective_system_prompt.as_deref(),
            resume_messages,
            resume_managed_session,
            effective_max_turns,
            effective_skip_permissions,
            cli.fallback_model,
            cli.name,
            team_mode,
            effective_auto_approve_safe,
            cli.quiet,
            cli.provider,
            effective_permission_mode,
            effective_auto_approve_plan,
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
    let positional_is_stdin_marker = positional == Some("-");
    let has_positional = positional.is_some() && !positional_is_stdin_marker;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dash_prompt_uses_stdin_content_as_the_prompt() {
        assert_eq!(
            build_final_prompt(Some("-"), Some("explain this diff"), ""),
            Some("explain this diff".to_string())
        );
    }

    #[test]
    fn dash_prompt_with_files_keeps_file_context_before_stdin_prompt() {
        assert_eq!(
            build_final_prompt(
                Some("-"),
                Some("summarize"),
                "<file path=\"a.rs\">\nfn main() {}\n</file>\n\n"
            ),
            Some("<file path=\"a.rs\">\nfn main() {}\n</file>\n\nsummarize".to_string())
        );
    }

    #[test]
    fn output_format_selects_jsonl_for_stream_json() {
        assert_eq!(
            resolve_oneshot_output_mode(false, false, false, Some(OutputFormat::StreamJson)),
            OneShotOutputMode::JsonLine
        );
    }

    #[test]
    fn parses_claude_style_global_options_into_normalized_contract() {
        let cli = Cli::try_parse_from([
            "agiworkforce",
            "--print",
            "--input-format",
            "stream-json",
            "--permission-mode",
            "acceptEdits",
            "--allowedTools",
            "Read,Edit",
            "--disallowedTools",
            "Bash(rm*)",
            "--mcp-config",
            "project.mcp.json",
            "--strict-mcp-config",
            "--add-dir",
            "../shared",
            "--agent",
            "planner",
            "--agent-id",
            "agent-123",
            "--no-session-persistence",
            "--resume-session-at",
            "turn-9",
            "--settings",
            "project,user",
            "fix bug",
        ])
        .expect("Claude-style options should parse");

        let options = crate::cli_options::CliOptions::from_cli(&cli);

        assert_eq!(
            options.input_format,
            crate::cli_options::InputFormat::StreamJson
        );
        assert_eq!(
            options.permission_mode,
            Some(crate::cli_options::PermissionMode::AcceptEdits)
        );
        assert_eq!(options.allowed_tools, vec!["Read", "Edit"]);
        assert_eq!(options.disallowed_tools, vec!["Bash(rm*)"]);
        assert_eq!(options.mcp_config_paths, vec!["project.mcp.json"]);
        assert!(options.strict_mcp_config);
        assert_eq!(options.additional_dirs, vec!["../shared"]);
        assert_eq!(options.agent.as_deref(), Some("planner"));
        assert_eq!(options.agent_id.as_deref(), Some("agent-123"));
        assert!(!options.session_persistence);
        assert_eq!(options.resume_session_at.as_deref(), Some("turn-9"));
        assert_eq!(options.setting_sources, vec!["project", "user"]);
    }

    #[test]
    fn permission_mode_contributes_to_effective_permission_flags() {
        let bypass = Cli::try_parse_from([
            "agiworkforce",
            "--permission-mode",
            "bypassPermissions",
            "fix bug",
        ])
        .expect("bypass permission mode should parse");
        let bypass_options = crate::cli_options::CliOptions::from_cli(&bypass);
        assert!(bypass_options.should_skip_permissions(false));

        let accept_edits = Cli::try_parse_from([
            "agiworkforce",
            "--permission-mode",
            "acceptEdits",
            "fix bug",
        ])
        .expect("accept edits permission mode should parse");
        let accept_options = crate::cli_options::CliOptions::from_cli(&accept_edits);
        assert!(accept_options.should_auto_approve_safe(false));
    }
}

/// Execute a single prompt and exit.
#[allow(clippy::too_many_arguments)]
async fn run_oneshot(
    config: &config::CliConfig,
    model: &str,
    prompt: &str,
    output_mode: OneShotOutputMode,
    sys_context: &context::SystemContext,
    custom_system_prompt: Option<&str>,
    max_turns: Option<usize>,
    skip_permissions: bool,
    auto_approve_safe: bool,
    quiet: bool,
    permission_mode: cli_options::PermissionMode,
    auto_approve_plan: bool,
) -> Result<()> {
    let mut session = agent::AgentSession::new(model, sys_context, custom_system_prompt);
    // Apply config-based provider override (e.g. "ollama-cloud") when the
    // configured provider differs from the model-name-based detection.
    session.set_provider_override(&config.default.provider);
    session.max_turns = max_turns;
    session.skip_permissions = skip_permissions;
    session.auto_approve_safe = auto_approve_safe;
    session.quiet = quiet;
    // Sprint B4: thread the permission mode + auto-approval into the
    // session before any send. `--mode plan` here means the model sees
    // the plan-mode reminder and the dispatcher gates mutating tools.
    session.permission_mode = permission_mode;
    session.auto_approve_plan = auto_approve_plan;
    if matches!(permission_mode, cli_options::PermissionMode::Plan) {
        session.plan_mode = true;
    }
    session.enable_managed_session()?;

    if output_mode == OneShotOutputMode::JsonLine {
        // Stream-JSON: NDJSON events on stdout, one per line. The full
        // streaming surface (per-token deltas, tool_use start, control
        // requests) is wired in a follow-up; this path currently emits
        // session_start → assistant_message → session_end so embedders see a
        // valid event sequence even before the agent loop is fully ported
        // through NdjsonWriter.
        use sdk_io::{
            AssistantMessageEvent, NdjsonWriter, SdkEvent, StatusUpdateEvent, StatusUpdateReason,
        };
        let writer = NdjsonWriter::new(tokio::io::stdout());
        let session_id = session
            .managed_session_id()
            .map(str::to_string)
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        writer
            .emit(&SdkEvent::StatusUpdate(StatusUpdateEvent {
                session_id: session_id.clone(),
                reason: StatusUpdateReason::SessionStart,
                detail: Some(model.to_string()),
            }))
            .await
            .ok();

        let start = std::time::Instant::now();
        let result = session
            .send(config, prompt, Box::new(|_chunk| {}))
            .await;
        let duration_ms = start.elapsed().as_millis() as u64;

        match result {
            Ok(turn) => {
                writer
                    .emit(&SdkEvent::AssistantMessage(AssistantMessageEvent {
                        session_id: session_id.clone(),
                        message_id: uuid::Uuid::new_v4().to_string(),
                        model: model.to_string(),
                        content: serde_json::json!([{ "type": "text", "text": turn.response }]),
                        stop_reason: Some("end_turn".to_string()),
                        input_tokens: turn.input_tokens,
                        output_tokens: turn.output_tokens,
                    }))
                    .await
                    .ok();
                writer
                    .emit(&SdkEvent::StatusUpdate(StatusUpdateEvent {
                        session_id,
                        reason: StatusUpdateReason::SessionEnd,
                        detail: Some(format!("{}ms", duration_ms)),
                    }))
                    .await
                    .ok();
            }
            Err(e) => {
                writer
                    .emit(&SdkEvent::Error(sdk_io::ErrorEvent {
                        session_id: Some(session_id.clone()),
                        code: "turn_failed".to_string(),
                        message: format!("{:#}", e),
                    }))
                    .await
                    .ok();
                writer
                    .emit(&SdkEvent::StatusUpdate(StatusUpdateEvent {
                        session_id,
                        reason: StatusUpdateReason::SessionEnd,
                        detail: Some(format!("{}ms (error)", duration_ms)),
                    }))
                    .await
                    .ok();
                std::process::exit(1);
            }
        }
    } else if output_mode == OneShotOutputMode::JsonPretty {
        // Pretty-printed single JSON object — non-streaming, for shell users
        // running `agiworkforce -p '...' --output-format json`.
        let start = std::time::Instant::now();
        let result = session
            .send(config, prompt, Box::new(|_chunk| {}))
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
    } else if output_mode == OneShotOutputMode::RawText {
        // Raw text mode: no spinner, no cost, no formatting
        let result = session
            .send(
                config,
                prompt,
                Box::new(|chunk| {
                    output::print_assistant_chunk(chunk);
                }),
            )
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
            .send(
                config,
                prompt,
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
