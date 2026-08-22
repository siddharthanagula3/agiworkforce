// Clippy allows: style-preference categories that produced 12+ pre-existing
// failures in CI. Real issues (private-type leaks, missing is_empty, duplicated
// attributes, default-method-confusion) fixed inline.
#![allow(clippy::type_complexity)]
#![allow(clippy::doc_overindented_list_items)]
#![allow(clippy::question_mark)]
#![allow(clippy::ptr_arg)]
#![allow(clippy::result_large_err)]

// Active modules — core CLI functionality
pub mod agent;
pub mod agent_events;
pub mod agents;
pub mod auth;
pub mod auth_oauth;
pub mod claude_parity;
pub mod cli_options;
pub mod command_registry;
pub mod compaction;
pub mod config;
pub mod context;
pub mod conversations;
pub mod custom_commands;
pub mod daemon;
pub mod design_system;
pub mod doctor;
pub mod errors;
// hooks lives at features::hooks::hooks; re-exported here so all 20 call-sites
// using `crate::hooks::*` continue to resolve unchanged.
pub use features::hooks::hooks;
pub mod markdown;
// lsp lives at platform::lsp; re-exported here so all 4 call-sites
// in features/exec/tools/task_registry.rs resolve unchanged.
pub use platform::lsp;
pub mod mcp;
pub mod memory;
#[allow(dead_code)]
// FOUNDATION: cross-surface send-pipeline contract; CLI integrations wire through Sprint B (REPL drain + SDK headless)
pub mod message_queue;
pub mod models;
pub mod output;
pub mod output_styles;
pub mod path_security;
pub mod permissions;
pub(crate) mod process_tree;
// plan_mode lives at features::plan::plan_mode; re-exported here so all
// internal callers using `crate::plan_mode::*` continue to resolve unchanged.
pub use features::plan::plan_mode;
pub mod provider;
pub mod repl;
pub mod safety;
pub mod secret_redaction;
pub mod sessions;
pub mod skills;
pub mod subagent;
pub mod subagent_v2;
pub mod teams;
// tools lives at features::exec::tools; re-exported here so all 42 call-sites
// using `crate::tools::*` continue to resolve unchanged.
pub use features::exec::tools;
pub mod tui;
pub mod voice;

// Extended CLI modules — used by subcommand handlers
pub mod app_server;
pub mod apply_patch;
pub mod approval_audit;
pub mod ecosystem;
pub mod init;
pub mod keybindings;
pub mod local_models;
pub mod model_catalog;
pub mod models_cache;
pub mod oauth;
pub mod onboarding;
// plugins lives at features::plugins::plugins; re-exported here so all
// internal callers using `crate::plugins::*` continue to resolve unchanged.
pub use features::plugins::plugins;
pub mod project_registry;
pub mod project_scope;
pub mod provenance;
pub mod review;
pub mod routing;
// runtime lives at platform::runtime; re-exported here so all 27 call-sites
// using `crate::runtime::<submod>::*` continue to resolve unchanged.
pub use platform::runtime;
pub mod cost_ledger;
pub mod notebook_edit;
pub mod powershell_tool;
pub mod sandbox;
pub mod shell_snapshot;
pub mod sync;
pub mod terminal_style;
pub mod terminal_text;
pub mod tier_cache;
pub(crate) mod tool_filters;
pub mod tool_search;

// Phase-2 candidates — implementations exist but the user-facing surface is
// not yet wired. Each carries an inline PHASE2 marker explaining the unblock.
#[allow(dead_code)]
// PHASE2: registry.agiworkforce.com not deployed; rewires to plugin-manifest discovery (Sprint B6)
pub mod marketplace;
#[allow(dead_code)] // bidirectional SDK stdin/control remains intentionally inactive
pub mod sdk_io; // used by OneShotOutputMode::JsonLine in lib.rs
                // policy lives at platform::policy; re-exported here so callers using
                // `crate::policy::*` continue to resolve unchanged.
pub use platform::policy;
#[allow(dead_code)]
// PHASE2: WS transport for a2a — wraps jsonrpc::handle_request over persistent WS connections
pub mod a2a_ws;
pub mod memory_pipeline; // used by agent/mod.rs + agent/chat.rs + agent/prompt.rs
pub mod skill_learner; // used by agent/chat.rs session-end hook

// A2A protocol — lives at features::a2a; re-exported here so 6 call-sites in
// a2a_ws.rs, agent/mod.rs, and repl/mod.rs resolve unchanged.
#[allow(dead_code)] // PHASE2: expose `agi a2a serve/discover/delegate`
pub use features::a2a;

// Phase 6 reorg — feature/platform/data layers.
// features/ has a real mod.rs; submodules migrate here incrementally.
// platform/ and data/ are layout anchors for future surface-specific code.
#[allow(dead_code)]
pub mod data;
pub mod features;
pub mod file_state;
#[allow(dead_code)]
pub mod platform;

use crate::terminal_style as ts;
use anyhow::{Context, Result};
use clap::{CommandFactory, Parser, Subcommand, ValueEnum};
use colored::Colorize;
use std::io::{self, IsTerminal, Read};

/// AGI CLI — multi-model AI agent in your terminal
#[derive(Parser, Debug)]
#[command(
    name = "agi",
    version,
    about = "AGI CLI — multi-model AI agent in your terminal",
    long_about = "Multi-provider AI agent for your terminal. \
                  Connects to Anthropic, OpenAI, Google, Ollama, and more."
)]
pub struct Cli {
    /// Subcommand (exec, review, apply, sandbox, etc.)
    #[command(subcommand)]
    command: Option<Command>,

    /// One-shot prompt (if omitted, starts interactive REPL)
    #[arg(value_name = "PROMPT")]
    prompt: Option<String>,

    /// Model to use (must match the shared model catalog/provider metadata)
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
        value_enum,
        conflicts_with = "json_events"
    )]
    output: Option<OutputFormat>,

    /// Deprecated alias for `agi completion <SHELL>`.
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

    /// Initialize project with AGENTS.md
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

    /// Disable OS-level sandboxing for tool execution.
    /// On macOS this suppresses Seatbelt; on Linux it suppresses bwrap.
    /// The TUI footer will show a red "no sandbox" indicator when this flag is set.
    #[arg(long)]
    no_sandbox: bool,

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

    /// Use automatic model routing (mutually exclusive with --model).
    ///
    /// Resolves the economy profile through AGI's canonical model policy, then
    /// sends the concrete provider model ID through the managed-cloud transport.
    /// Responses disclose the selected provider/model provenance.
    ///
    /// Only applies to managed-cloud sessions; BYOK and local (Ollama / LMStudio)
    /// providers always require an explicit --model.
    #[arg(long, conflicts_with_all = ["model", "provider"])]
    auto: bool,

    /// Read the system prompt from a file. Mutually composes with
    /// `--system-prompt`: file contents win when both are supplied.
    #[arg(long = "system-prompt-file", value_name = "FILE")]
    system_prompt_file: Option<String>,

    /// Append the contents of a file to the system prompt.
    #[arg(long = "append-system-prompt-file", value_name = "FILE")]
    append_system_prompt_file: Option<String>,

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
pub enum OutputFormat {
    Text,
    Json,
    /// Newline-delimited JSON for streaming consumption (CI/CD compatible)
    StreamJson,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OneShotOutputMode {
    Text,
    RawText,
    JsonPretty,
    JsonLine,
}

pub fn resolve_oneshot_output_mode(
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

/// Build the canonical one-shot JSON result object emitted by
/// `--output-format json` / `--json`. Extracted so the REPL `/raw json` alias
/// renders through the exact same shape as the headless raw-output mode instead
/// of a divergent hand-rolled object.
#[allow(clippy::too_many_arguments)]
pub fn oneshot_result_json_value(
    model: &str,
    response: &str,
    input_tokens: u32,
    output_tokens: u32,
    via_subscription: bool,
    cost: &str,
    duration_ms: u64,
    is_error: bool,
) -> serde_json::Value {
    serde_json::json!({
        "type": "result",
        "model": model,
        "response": response,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "via_subscription": via_subscription,
        "cost": cost,
        "duration_ms": duration_ms,
        "is_error": is_error,
    })
}

/// Compute the effective `tracing`/`log` env-filter directive string from the
/// `-v/--verbose` and `--debug[=categories]` controls.
///
/// Precedence:
/// 1. An explicit `RUST_LOG` (or `AGIWORKFORCE_LOG`) env value always wins — it
///    is returned verbatim so operators keep full control.
/// 2. `--debug` with an explicit comma-separated category list raises exactly
///    those crate sub-modules (`agiworkforce_cli::<category>`) to `debug`, on
///    top of a crate-wide `info` floor. This is the category-aware behavior the
///    `--debug` help text promises.
/// 3. `--debug` with no categories, or `-v/--verbose`, raises the whole
///    `agiworkforce_cli` crate to `debug`.
/// 4. Otherwise the crate logs at `warn` (quiet default).
///
/// Returned as a directive string so it is unit-testable without installing a
/// global subscriber.
pub fn compute_log_filter(
    verbose: bool,
    debug: Option<&Option<String>>,
    env: Option<&str>,
) -> String {
    if let Some(explicit) = env {
        let trimmed = explicit.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }

    // `--debug=cat1,cat2` → per-category debug directives on an info floor.
    if let Some(Some(categories)) = debug {
        let mut directives: Vec<String> = Vec::new();
        let mut any_category = false;
        for category in categories.split(',') {
            let category = category.trim();
            if category.is_empty() {
                continue;
            }
            any_category = true;
            // Map a category to a crate sub-module target. `all` is the escape
            // hatch for whole-crate debug.
            if category.eq_ignore_ascii_case("all") {
                return "agiworkforce_cli=debug".to_string();
            }
            directives.push(format!("agiworkforce_cli::{category}=debug"));
        }
        if any_category {
            // Crate-wide info floor so unrelated modules still surface warnings
            // and above, then raise the requested categories to debug.
            let mut filter = vec!["agiworkforce_cli=info".to_string()];
            filter.extend(directives);
            return filter.join(",");
        }
        // `--debug` with an empty/whitespace category list → whole-crate debug.
        return "agiworkforce_cli=debug".to_string();
    }

    // `--debug` (no category argument) or `-v/--verbose` → whole-crate debug.
    if debug.is_some() || verbose {
        return "agiworkforce_cli=debug".to_string();
    }

    "agiworkforce_cli=warn".to_string()
}

/// Install the process-wide `tracing` subscriber using the filter computed from
/// the `-v/--verbose` and `--debug` controls. Idempotent: a second call (or a
/// subscriber already installed by an embedder) is ignored rather than
/// panicking. Returns the effective filter directive that was applied.
pub fn init_tracing(verbose: bool, debug: Option<&Option<String>>) -> String {
    use tracing_subscriber::{fmt, EnvFilter};

    let env = std::env::var("RUST_LOG")
        .or_else(|_| std::env::var("AGIWORKFORCE_LOG"))
        .ok();
    let directive = compute_log_filter(verbose, debug, env.as_deref());

    let filter =
        EnvFilter::try_new(&directive).unwrap_or_else(|_| EnvFilter::new("agiworkforce_cli=warn"));

    // Diagnostics go to stderr so they never contaminate stdout payloads
    // (raw/JSON one-shot output, SDK JSONL streams).
    let _ = fmt()
        .with_env_filter(filter)
        .with_writer(std::io::stderr)
        .try_init();

    directive
}

/// Shell type for completions generation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
enum ShellType {
    Bash,
    Zsh,
    Fish,
}

impl ShellType {
    fn to_clap_shell(self) -> clap_complete::Shell {
        match self {
            ShellType::Bash => clap_complete::Shell::Bash,
            ShellType::Zsh => clap_complete::Shell::Zsh,
            ShellType::Fish => clap_complete::Shell::Fish,
        }
    }
}

fn generate_shell_completion(shell: ShellType, bin_name: &str, out: &mut impl std::io::Write) {
    let mut cmd = Cli::command();
    clap_complete::generate(shell.to_clap_shell(), &mut cmd, bin_name, out);
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FirstRunLaunchDecision {
    Continue,
    Exit,
}

fn first_run_launch_decision(onboarding_completed: bool) -> FirstRunLaunchDecision {
    if onboarding_completed {
        FirstRunLaunchDecision::Continue
    } else {
        FirstRunLaunchDecision::Exit
    }
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
        /// Provider override (e.g. ollama, anthropic, openai). Falls back to the
        /// top-level --provider, then config. Required to run a local/BYOK model
        /// that isn't the configured default.
        #[arg(long)]
        provider: Option<String>,
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
    /// Run as MCP server (stdio). Exposes no tools yet — see `agi app-server`.
    ///
    /// The handler speaks the protocol and answers initialize/tools/list, but
    /// advertises an empty tool list on purpose: one-shot agent exec over stdio
    /// MCP needs provider/model session, approval plumbing and event streaming,
    /// and advertising a tool before it is callable would be fake wiring. Stated
    /// here so the command's help matches what it does — the behaviour itself is
    /// deliberate, not a defect.
    McpServer,
    /// Generate shell completion scripts.
    #[command(alias = "completions")]
    Completion {
        /// Shell to generate completions for.
        #[arg(value_name = "SHELL", value_enum)]
        shell: ShellType,
    },
    /// Run app server for IDE integration.
    AppServer {
        /// Transport: `stdio`, `ws`, or a WebSocket bind address such as `127.0.0.1:8788`.
        #[arg(long, default_value = "stdio")]
        listen: String,
        /// Permit a non-loopback WebSocket bind after network controls are configured.
        #[arg(long)]
        allow_public_listen: bool,
        /// WebSocket bearer token (required unless AGI_APP_SERVER_TOKEN is set).
        #[arg(long)]
        auth_token: Option<String>,
        /// Browser origin allowed to open the WebSocket; repeat for multiple origins.
        #[arg(long = "allowed-origin")]
        allowed_origin: Vec<String>,
        /// Accept `?token=` for browser clients. Prefer headers because URLs are logged.
        #[arg(long)]
        allow_query_token: bool,
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
    /// Manage and inspect model configuration.
    Models {
        #[command(subcommand)]
        action: ModelsSubcommand,
    },
    /// Manage plugins.
    Plugin {
        #[command(subcommand)]
        action: PluginSubcommand,
    },
    /// Inspect feature flags.
    Features,
    /// Manage command and file-operation approvals.
    Approvals {
        #[command(subcommand)]
        action: ApprovalsSubcommand,
    },
    /// Show execution policy rules.
    Execpolicy,
    /// Scan for ecosystem tools (Claude, Codex, Cursor, Gemini) and import MCP configs.
    Ecosystem {
        #[command(subcommand)]
        action: EcosystemSubcommand,
    },
    /// Migrate settings from another coding CLI. Defaults to Claude Code.
    Migrate {
        /// Source to migrate from: claude or claude-code.
        #[arg(default_value = "claude")]
        source: String,
        /// Show what would be imported without writing files.
        #[arg(long)]
        dry_run: bool,
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
    /// Login to AGI cloud (or an LLM provider via OAuth).
    Login {
        /// Provider to login with (agiworkforce, anthropic, openai, copilot, chatgpt). Omit for AGI Workforce.
        provider: Option<String>,
    },
    /// Logout from AGI cloud.
    Logout,
    /// Show authentication status for all configured providers.
    AuthStatus,
    /// Run local preflight diagnostics.
    Doctor {
        /// Emit the diagnostic report as JSON.
        #[arg(long)]
        json: bool,
    },
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

fn invocation_requires_project_trust(cli: &Cli) -> bool {
    if cli.dump_system_prompt {
        return false;
    }

    matches!(
        cli.command.as_ref(),
        None | Some(
            Command::Exec { .. }
                | Command::Review { .. }
                | Command::Apply { .. }
                | Command::AppServer { .. }
                | Command::Resume { .. }
                | Command::Fork { .. }
                | Command::Onboarding
        )
    )
}

#[derive(Subcommand, Debug)]
enum ModelsSubcommand {
    /// List catalog models and discovered local models.
    List {
        /// Emit JSON.
        #[arg(long)]
        json: bool,
    },
    /// Show local model server status.
    Status {
        /// Emit JSON.
        #[arg(long)]
        json: bool,
    },
    /// Probe local model servers and list installed models.
    Scan {
        /// Emit JSON.
        #[arg(long)]
        json: bool,
    },
    /// Set the default model.
    Set {
        model: String,
        /// Provider override. If omitted, AGI infers from installed local models or catalog metadata.
        #[arg(long)]
        provider: Option<String>,
    },
}

#[derive(Subcommand, Debug)]
enum ApprovalsSubcommand {
    /// Show saved approval rules.
    List,
    /// Always allow a command prefix.
    Allow { rule: String },
    /// Always deny a command prefix.
    Deny { rule: String },
    /// Allow a command prefix for this process.
    Session { rule: String },
    /// Remove a saved or session rule.
    Remove {
        /// allow, deny, or session.
        scope: String,
        rule: String,
    },
    /// Export approval rules as JSON.
    Export,
    /// Import approval rules from JSON exported by `agi approvals export`.
    Import {
        /// Path to the exported JSON file.
        file: String,
        /// Replace existing persistent rules instead of merging.
        #[arg(long)]
        replace: bool,
    },
    /// Reset all approval rules.
    Reset,
}

#[derive(Subcommand, Debug, Clone)]
enum SessionAction {
    /// List recent sessions, newest first.
    List {
        #[arg(long, default_value = "20")]
        limit: usize,
    },
    /// Show the turn-by-turn transcript of a session.
    Show { session_id: String },
    /// Fork a session at a specific turn into a new named session.
    Fork {
        session_id: String,
        /// Turn index to fork at (0-based, counts user→assistant pairs).
        #[arg(long = "at-turn")]
        at_turn: Option<usize>,
        /// New session name; auto-generated if omitted.
        #[arg(long = "as")]
        as_name: Option<String>,
        /// Overwrite an existing session with the same name/id if one exists.
        #[arg(long)]
        force: bool,
    },
    /// Archive a session (hidden from active listings, kept on disk).
    Archive { session_id: String },
    /// Unarchive a previously archived session.
    Unarchive { session_id: String },
    /// Permanently delete a session file. Requires confirmation.
    Delete {
        session_id: String,
        /// Skip the interactive confirmation (for scripts / CI).
        #[arg(long, visible_alias = "yes")]
        force: bool,
    },
}

/// Outcome of gating a destructive operation on confirmation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DestructiveDecision {
    /// `--force`/`--yes` supplied — proceed without prompting.
    Proceed,
    /// Interactive terminal — ask the user to confirm.
    Prompt,
    /// Neither forced nor interactive — refuse rather than delete blindly.
    Refuse,
}

/// Decide how a destructive command should proceed. Pure and unit-testable:
/// `force` bypasses the prompt, an interactive terminal gets a confirmation,
/// and a non-interactive run without `--force` is refused so scripts never
/// delete data by surprise.
pub fn resolve_destructive_decision(force: bool, interactive: bool) -> DestructiveDecision {
    if force {
        DestructiveDecision::Proceed
    } else if interactive {
        DestructiveDecision::Prompt
    } else {
        DestructiveDecision::Refuse
    }
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
        /// `sha256:<hex>` integrity claim. AUDIT-FIX: H-16
        #[arg(long)]
        integrity: Option<String>,
        /// Bypass integrity verification. AUDIT-FIX: H-16 — prints a warning to stderr every install.
        #[arg(long)]
        unsafe_no_integrity: bool,
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
    managed_session.require_model()?;
    managed_session.require_routing_authority()?;
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
    match runtime::session_control::resolve_managed_session_reference(reference) {
        Ok(source) => {
            // Validate the source before creating a fork so unknown legacy
            // authority cannot be copied into an executable session.
            managed_resume_payload_from_resolved(source.clone())?;
            if fork {
                managed_resume_payload_from_resolved(
                    runtime::session_control::fork_managed_session(reference)?,
                )
            } else {
                managed_resume_payload_from_resolved(source)
            }
        }
        Err(managed_error) => match load_legacy_session_messages(reference) {
            Ok(_) => anyhow::bail!(
                "Legacy conversation '{}' has no persisted privacy/provider authority and cannot be resumed safely; start a new session with an explicit route",
                reference
            ),
            Err(legacy_error) => Err(managed_error).with_context(|| {
                format!(
                    "Legacy JSON conversation fallback also failed: {legacy_error:#}"
                )
            }),
        },
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

    if let Some((session_id, _)) = latest_legacy_session_messages()? {
        anyhow::bail!(
            "Latest conversation '{}' is a legacy session with no persisted privacy/provider authority and cannot be resumed safely",
            session_id
        );
    }

    Ok(None)
}

async fn handle_models_command(
    action: &ModelsSubcommand,
    config: &config::CliConfig,
) -> Result<()> {
    match action {
        ModelsSubcommand::List { json } => {
            if *json {
                let value = models_json_with_discovery(config).await;
                println!("{}", serde_json::to_string_pretty(&value)?);
            } else {
                println!(
                    "{}",
                    provider::format_model_list_with_discovery(config).await
                );
            }
            Ok(())
        }
        ModelsSubcommand::Status { json } | ModelsSubcommand::Scan { json } => {
            let probes = local_models::discover_all(config).await;
            if *json {
                println!("{}", serde_json::to_string_pretty(&probes)?);
            } else {
                println!("{}", local_models::format_probe_report(&probes));
                if matches!(action, ModelsSubcommand::Scan { .. }) {
                    let models = local_models::discovered_models(&probes);
                    println!("\n{}", local_models::format_discovered_models(&models));
                }
            }
            Ok(())
        }
        ModelsSubcommand::Set { model, provider } => {
            let provider = match provider.as_deref() {
                Some(provider) => provider.to_string(),
                None => infer_provider_for_model(config, model).await?,
            };
            onboarding::update_config_model(model, &provider, None)?;
            println!("Default model set to {} ({})", model, provider);
            Ok(())
        }
    }
}

async fn infer_provider_for_model(config: &config::CliConfig, model: &str) -> Result<String> {
    let probes = local_models::discover_all(config).await;
    let matching_local: Vec<_> = local_models::discovered_models(&probes)
        .into_iter()
        .filter(|candidate| candidate.id == model)
        .collect();

    if matching_local.len() == 1 {
        return Ok(matching_local[0].provider.clone());
    }
    if matching_local.len() > 1 {
        anyhow::bail!(
            "model '{}' is installed in multiple local providers; pass --provider explicitly",
            model
        );
    }

    if let Some(provider) = model_catalog::provider_for(model) {
        return Ok(provider.to_string());
    }
    if let Some(provider) = provider::provider_for_model(model) {
        return Ok(provider.to_string());
    }

    anyhow::bail!(
        "could not infer provider for model '{}'. Run `agi models scan` or pass --provider",
        model
    )
}

fn catalog_model_json(model: &provider::ModelInfo) -> serde_json::Value {
    let input_token_pricing_tiers = model_catalog::input_token_pricing_tiers(&model.id)
        .into_iter()
        .map(|tier| {
            serde_json::json!({
                "threshold_tokens_exclusive": tier.threshold_tokens,
                "input_price_per_1m": tier.pricing.input_price_per_1m,
                "output_price_per_1m": tier.pricing.output_price_per_1m,
                "cache_read_price_per_1m": tier.pricing.cache_read_price_per_1m,
                "cache_write_price_per_1m": tier.pricing.cache_write_price_per_1m,
            })
        })
        .collect::<Vec<_>>();
    serde_json::json!({
        "id": model.id,
        "provider": model.provider,
        "source": "catalog",
        "context_window": model.context_window,
        "max_output_tokens": model.max_output_tokens,
        "input_price_per_1m": model.input_price_per_1m,
        "output_price_per_1m": model.output_price_per_1m,
        "pricing_basis": "base",
        "input_token_pricing_tiers": input_token_pricing_tiers,
        "supports_tools": model.supports_tools,
        "supports_vision": model.supports_vision,
        "supports_reasoning": model.supports_reasoning,
        "status": model.status,
    })
}

async fn models_json_with_discovery(config: &config::CliConfig) -> serde_json::Value {
    let catalog = provider::model_catalog();
    let mut models: Vec<serde_json::Value> = catalog.iter().map(catalog_model_json).collect();

    let (probes, gateway) = tokio::join!(
        local_models::discover_all(config),
        models::gateway_models::discover_gateway_models(),
    );
    match gateway {
        Ok(catalog) => {
            for model in models::gateway_models::picker_models(&catalog) {
                let upstream = catalog
                    .models
                    .iter()
                    .find(|remote| remote.id == model.id)
                    .map(|remote| remote.owned_by.as_str())
                    .unwrap_or_default();
                models.push(serde_json::json!({
                    "id": model.id,
                    "provider": "managed_cloud",
                    "upstream_provider": upstream,
                    "source": "gateway",
                    "user_tier": catalog.user_tier,
                    "authenticated": catalog.authenticated,
                    "context_window": model.context_window,
                    "max_output_tokens": model.max_output_tokens,
                    "supports_tools": model.supports_tools,
                    "supports_vision": model.supports_vision,
                    "supports_reasoning": model.supports_reasoning,
                    "status": model.status,
                }));
            }
        }
        Err(error) => eprintln!("Warning: AGI managed model discovery unavailable: {error}"),
    }

    for model in local_models::discovered_models(&probes) {
        models.push(serde_json::json!({
            "id": model.id,
            "provider": model.provider,
            "source": model.source,
            "base_url": model.base_url,
            "status": "installed"
        }));
    }
    serde_json::Value::Array(models)
}

fn handle_approvals_command(action: &ApprovalsSubcommand) -> Result<()> {
    let mut store = permissions::PermissionStore::load()?;
    match action {
        ApprovalsSubcommand::List => {
            println!("{}", store.display_tab("allow"));
            println!();
            println!("{}", store.display_tab("deny"));
            println!();
            println!("{}", store.display_tab("ask"));
            println!();
            println!("{}", store.display_tab("workspace"));
            Ok(())
        }
        ApprovalsSubcommand::Allow { rule } => {
            store.allow_always(rule);
            store.save()?;
            println!("Always allow: {}", rule.trim());
            Ok(())
        }
        ApprovalsSubcommand::Deny { rule } => {
            store.deny_always(rule);
            store.save()?;
            println!("Always deny: {}", rule.trim());
            Ok(())
        }
        ApprovalsSubcommand::Session { rule } => {
            store.allow_session_for_process(rule);
            println!("Allow for this process: {}", rule.trim());
            Ok(())
        }
        ApprovalsSubcommand::Remove { scope, rule } => {
            let removed = match scope.as_str() {
                "allow" => store.remove_always_allow(rule),
                "deny" => store.remove_always_deny(rule),
                "session" => store.remove_session(rule),
                other => {
                    anyhow::bail!(
                        "unknown approval scope '{}'; use allow, deny, or session",
                        other
                    )
                }
            };
            if removed {
                if scope != "session" {
                    store.save()?;
                }
                println!("Removed {} rule: {}", scope, rule.trim());
            } else {
                println!("No {} rule matched: {}", scope, rule.trim());
            }
            Ok(())
        }
        ApprovalsSubcommand::Export => {
            println!("{}", serde_json::to_string_pretty(&store)?);
            Ok(())
        }
        ApprovalsSubcommand::Import { file, replace } => {
            let contents = std::fs::read_to_string(file)
                .with_context(|| format!("Failed to read approval import file '{}'", file))?;
            let imported: permissions::PermissionStore = serde_json::from_str(&contents)
                .with_context(|| format!("Failed to parse approval import JSON '{}'", file))?;
            if *replace {
                store.always_allow = imported.always_allow;
                store.always_deny = imported.always_deny;
                store.ask_list = imported.ask_list;
                store.workspace_rules = imported.workspace_rules;
            } else {
                store.always_allow.extend(imported.always_allow);
                store.always_deny.extend(imported.always_deny);
                for rule in imported.ask_list {
                    if !store.ask_list.contains(&rule) {
                        store.ask_list.push(rule);
                    }
                }
                for rule in imported.workspace_rules {
                    if !store.workspace_rules.contains(&rule) {
                        store.workspace_rules.push(rule);
                    }
                }
            }
            store.save()?;
            println!(
                "Imported approval rules ({} allow, {} deny, {} ask, {} workspace).",
                store.always_allow.len(),
                store.always_deny.len(),
                store.ask_list.len(),
                store.workspace_rules.len()
            );
            Ok(())
        }
        ApprovalsSubcommand::Reset => {
            store.reset();
            store.save()?;
            println!("Approval rules reset.");
            Ok(())
        }
    }
}

// ---------------------------------------------------------------------------
// Session subcommand handler — replay / branch points
// ---------------------------------------------------------------------------

async fn handle_session_action(action: SessionAction) -> Result<()> {
    match action {
        SessionAction::List { limit } => {
            let mut summaries =
                runtime::session_control::list_managed_sessions().unwrap_or_default();
            summaries.sort_by(|a, b| b.created_at.cmp(&a.created_at));
            summaries.truncate(limit);
            if summaries.is_empty() {
                println!("No sessions found.");
                return Ok(());
            }
            println!("{}", ts::accent_header("Recent sessions:"));
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
            // Inspection remains available for legacy/unknown sessions even
            // though executing them is fail-closed.
            let messages =
                match runtime::session_control::resolve_managed_session_reference(&session_id) {
                    Ok(resolved) => {
                        runtime::session::ManagedSession::load_from_path(resolved.path)?.messages
                    }
                    Err(_) => load_legacy_session_messages(&session_id)?,
                };
            println!(
                "{}: {} messages",
                ts::accent_header(session_id),
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
            force,
        } => {
            let source_resolved =
                runtime::session_control::resolve_managed_session_reference(&session_id)?;
            let source = runtime::session::ManagedSession::load_from_path(&source_resolved.path)?;
            source.require_model()?;
            source.require_routing_authority()?;
            let mut messages = source.messages.clone();
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
            // Derive a safe session ID from --as (slugify) or auto-generate.
            let new_id = if let Some(ref name) = as_name {
                // Slugify: lowercase, replace non-alphanumeric with '-', collapse runs.
                let raw: String = name
                    .chars()
                    .map(|c| {
                        if c.is_alphanumeric() {
                            c.to_ascii_lowercase()
                        } else {
                            '-'
                        }
                    })
                    .collect();
                let slug = raw
                    .split('-')
                    .filter(|s| !s.is_empty())
                    .collect::<Vec<_>>()
                    .join("-");
                if slug.is_empty() {
                    format!("{}-fork", session_id)
                } else {
                    slug
                }
            } else {
                format!("{}-fork", session_id)
            };
            // Refuse to silently clobber an existing session with the same target
            // id/name unless the user explicitly opts in with --force.
            if !force && runtime::session_control::managed_session_exists(&new_id)? {
                anyhow::bail!(
                    "session '{new_id}' already exists — use --force to overwrite it or choose a different --as name",
                );
            }
            // Preserve ancestry and routing authority instead of recreating a
            // provider-less session from message bytes.
            let mut forked = runtime::session::ManagedSession::forked_from(
                &source,
                new_id.clone(),
                chrono::Utc::now(),
                Some(source_resolved.path),
            );
            forked.messages = messages.clone();
            let store = runtime::session_control::ManagedSessionStore::user_config()?;
            store.save(&forked)?;
            let saved_id = forked.session_id;
            println!(
                "{} Forked '{}' → '{}' ({} messages{}).",
                ts::success_header("fork:"),
                session_id,
                saved_id,
                messages.len(),
                at_turn
                    .map(|t| format!(", at turn {t}"))
                    .unwrap_or_default(),
            );
            println!(
                "  Resume with: {}",
                ts::accent_header(format!("agi --resume {saved_id}"))
            );
            Ok(())
        }
        SessionAction::Archive { session_id } => {
            runtime::session_control::archive_managed_session(&session_id)
                .with_context(|| format!("failed to archive session '{session_id}'"))?;
            println!(
                "{} Archived '{}'. Unarchive with: {}",
                ts::success_header("archive:"),
                session_id,
                ts::accent_header(format!("agi session unarchive {session_id}"))
            );
            Ok(())
        }
        SessionAction::Unarchive { session_id } => {
            runtime::session_control::unarchive_managed_session(&session_id)
                .with_context(|| format!("failed to unarchive session '{session_id}'"))?;
            println!(
                "{} Unarchived '{}'.",
                ts::success_header("unarchive:"),
                session_id
            );
            Ok(())
        }
        SessionAction::Delete { session_id, force } => {
            // Resolve first so a bad id fails before we prompt or delete.
            runtime::session_control::resolve_managed_session_reference(&session_id)
                .with_context(|| format!("session '{session_id}' was not found"))?;

            let interactive = io::stdin().is_terminal() && io::stderr().is_terminal();
            match resolve_destructive_decision(force, interactive) {
                DestructiveDecision::Refuse => {
                    anyhow::bail!(
                        "refusing to delete session '{session_id}' without confirmation. \
                         Re-run with --force (alias --yes) to delete non-interactively."
                    );
                }
                DestructiveDecision::Prompt => {
                    let confirmed = dialoguer::Confirm::new()
                        .with_prompt(format!(
                            "Permanently delete session '{session_id}'? This cannot be undone."
                        ))
                        .default(false)
                        .interact()
                        .unwrap_or(false);
                    if !confirmed {
                        println!("Aborted. Session '{session_id}' was not deleted.");
                        return Ok(());
                    }
                }
                DestructiveDecision::Proceed => {}
            }

            runtime::session_control::delete_managed_session(&session_id)
                .with_context(|| format!("failed to delete session '{session_id}'"))?;
            println!(
                "{} Deleted '{}'.",
                ts::success_header("delete:"),
                session_id
            );
            Ok(())
        }
    }
}

/// Classify a `agi plugin install <source>` argument as a git remote or a
/// local filesystem path.
///
/// A naive `.contains("git")` substring check misrouted any local directory
/// whose path merely contained the letters "git" (e.g. `my-git-plugin`, or
/// even `digit-plugin`) into `git clone`, which then failed with a
/// confusing "repository does not exist" error. An existing local path is
/// always treated as local regardless of its name; remaining sources are
/// only classified as git when they look like an actual git remote (a
/// scheme URL, scp-like `user@host:path` shorthand, or a `.git` suffix).
fn is_git_plugin_source(source: &str) -> bool {
    // `--upload-pack=...git` matches the heuristics below; never hand a
    // `-`-prefixed source to git as a remote.
    if source.starts_with('-') {
        return false;
    }
    // An existing local path wins over any name-based heuristic.
    if std::path::Path::new(source).exists() {
        return false;
    }
    if source.starts_with("http://")
        || source.starts_with("https://")
        || source.starts_with("git://")
        || source.starts_with("ssh://")
    {
        return true;
    }
    // scp-like SSH shorthand: user@host:path — but not an absolute local
    // path that happens to contain a colon-free '@' somewhere.
    if source.contains('@') && source.contains(':') && !source.starts_with('/') {
        return true;
    }
    source.ends_with(".git")
}

/// Host the quota check talks to when `AGI_API_URL` is unset.
const DEFAULT_QUOTA_API_BASE: &str = "https://api.agiworkforce.com";

/// Resolve the base URL that `fetch_remaining_pct` sends the account bearer
/// token to.
///
/// `AGI_API_URL` is an operator override, so anyone able to plant it in the
/// environment could otherwise redirect the `Authorization` header to a host of
/// their choosing. Route it through the same allowlist that guards
/// `AGIWORKFORCE_API_BASE`: HTTPS, and an `agiworkforce.com` origin. Anything
/// else yields `None` so the caller skips the fetch instead of leaking the
/// token.
fn resolve_quota_api_base(raw: Option<&str>) -> Option<String> {
    let raw = raw.map(str::trim).filter(|s| !s.is_empty());
    tier_cache::resolve_agi_api_base(raw.unwrap_or(DEFAULT_QUOTA_API_BASE))
}

/// Fetch the user's remaining credit percentage from the AGI cloud API.
/// Returns `None` on any network/parse failure so callers can fall back gracefully.
/// The response exposes only percentage/reset metadata and availability.
async fn fetch_remaining_pct(bearer: &str, api_base: &str) -> Option<u8> {
    #[derive(serde::Deserialize)]
    struct Credits {
        usage_percentage: f64,
        has_usage_remaining: bool,
    }
    #[derive(serde::Deserialize)]
    struct BalanceResp {
        credits: Option<Credits>,
    }

    let url = format!("{}/api/llm/v1/credits/balance", api_base);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .ok()?;

    let resp = client.get(&url).bearer_auth(bearer).send().await.ok()?;

    if !resp.status().is_success() {
        return None;
    }

    let body: BalanceResp = resp.json().await.ok()?;
    let credits = body.credits?;
    if !credits.has_usage_remaining {
        return Some(0);
    }
    let used = credits.usage_percentage.clamp(0.0, 100.0);
    Some((100.0 - used).round() as u8)
}

/// Main async entry point — called from `main.rs`.
pub async fn run_main() -> Result<()> {
    let cli = Cli::parse();

    // Install the single logging owner before anything else runs so `-v/--verbose`
    // and `--debug[=categories]` actually change what `tracing` emits. Without
    // this, every `tracing::{debug,info,warn}` call in the crate went nowhere and
    // the flags were inert (CLI-DEBUG-CONTROLS-INERT-01).
    let effective_log_filter = init_tracing(cli.verbose, cli.debug.as_ref());

    sandbox::set_sandbox_disabled(cli.no_sandbox);
    let normalized_cli_options = cli_options::CliOptions::from_cli(&cli);
    // `--no-session-persistence` is a privacy opt-out, so it has to be in force
    // before ANY session is constructed — including inside the subcommand arms
    // below, which dispatch ahead of the per-run option resolution. Every
    // `AgentSession` reads this policy once at construction and refuses to
    // write managed-session state when it is off.
    cli_options::set_session_persistence_enabled(normalized_cli_options.session_persistence);

    for dir in &normalized_cli_options.additional_dirs {
        crate::path_security::register_additional_workspace_root(dir)
            .map_err(|e| anyhow::anyhow!("--add-dir {}: {}", dir, e))?;
    }

    // --debug / --verbose: the tracing subscriber is already installed above with
    // the computed filter. Surface the effective filter so the banner reflects
    // what was actually applied (category-aware) instead of a fixed claim.
    if (cli.debug.is_some() || cli.verbose) && !cli.quiet {
        eprintln!("[debug] logging filter: {effective_log_filter}");
    }

    // --fork-session: noted for session loading (handled below)
    let _fork_session = cli.fork_session;

    // --- First-run: initialize home directory and run onboarding if needed ---
    // This must happen before loading merged configuration. Project config is
    // repository-controlled input and must not be read or applied until the
    // user accepts this directory's trust prompt.
    let mut trusted_during_first_run = false;
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
            && io::stderr().is_terminal()
            && !onboarding::is_setup_complete()
        {
            match onboarding::run_onboarding().await {
                Ok(completed) => match first_run_launch_decision(completed) {
                    FirstRunLaunchDecision::Continue => trusted_during_first_run = true,
                    FirstRunLaunchDecision::Exit => return Ok(()),
                },
                Err(e) => {
                    eprintln!("Warning: onboarding error: {}. Exiting.", e);
                    return Ok(());
                }
            }
        }
    }

    // Trust is project-scoped, not just a one-time install decision. Every
    // developer execution must either inherit the trust accepted moments ago,
    // prompt on a real terminal, or fail closed in headless use. This check
    // deliberately precedes project config, memory, hook, and tool discovery.
    let mut project_trusted = trusted_during_first_run;
    if invocation_requires_project_trust(&cli) {
        if !project_trusted {
            if io::stdin().is_terminal() && io::stderr().is_terminal() {
                match onboarding::ensure_current_directory_trusted() {
                    Ok(true) => project_trusted = true,
                    Ok(false) => return Ok(()),
                    Err(error) => {
                        eprintln!("Warning: project trust check failed: {error}. Exiting.");
                        return Ok(());
                    }
                }
            } else if onboarding::is_current_directory_trusted()? {
                project_trusted = true;
            } else {
                return Err(anyhow::anyhow!(
                    "Current project is not trusted. Run `agi` interactively and accept the directory trust prompt, or run `agi init` as an explicit trust action before headless use."
                ));
            }
        }
    } else if onboarding::is_current_directory_trusted().unwrap_or(false) {
        project_trusted = true;
    }

    // Commands outside a trusted project still get global config and explicit
    // environment overrides, but repository-controlled config remains unread.
    let mut app_config = if project_trusted {
        config::CliConfig::load_merged()?
    } else {
        config::CliConfig::load_without_project()?
    };

    // Pull any user-defined `[providers.<name>]` blocks into the runtime
    // OpenAI-compatible registry (OpenRouter, NVIDIA NIM, Groq, Together,
    // Fireworks, etc.). Reserved provider names are ignored — see
    // `models::register_custom_providers`.
    models::register_custom_providers(&app_config);

    // Validate configuration — warn but continue with defaults on failure
    if let Err(e) = app_config.validate() {
        eprintln!(
            "Warning: config validation failed: {}. Continuing with defaults.",
            e
        );
    }

    // --- Subcommand dispatch ---
    if let Some(ref command) = cli.command {
        let sys_ctx = context::gather_system_context();
        return match command {
            Command::Exec {
                prompt,
                model,
                provider,
                full_auto,
                json,
            } => {
                // Honor an explicit model: exec-level --model first, then the
                // top-level --model, then config. Mirrors the provider fallback
                // below — without this, `agi --model X exec` silently dropped X
                // and ran the config-default model.
                let raw_model = models::resolve_exec_model(
                    model.as_deref(),
                    cli.model.as_deref(),
                    &app_config.default.model,
                );
                let chain = routing::fallback::FallbackChain::parse(&raw_model);
                let m = chain
                    .head()
                    .map(|s| s.to_string())
                    .unwrap_or(raw_model.clone());
                // Honor an explicit provider: exec-level --provider first, then the
                // top-level --provider, then config. Without this, exec hardcoded
                // None and a local/BYOK model (e.g. `exec --provider ollama`)
                // silently fell back to the default provider (anthropic).
                let exec_provider_override = provider.as_deref().or(cli.provider.as_deref());
                let mut session = agent::AgentSession::new_checked(
                    &m,
                    &sys_ctx,
                    None,
                    models::selection_provider_override(
                        &m,
                        &app_config.default.model,
                        &app_config.default.provider,
                        exec_provider_override,
                    ),
                )?;
                session.apply_ui_config(&app_config);
                session.apply_tool_filters(
                    &normalized_cli_options.allowed_tools,
                    &normalized_cli_options.disallowed_tools,
                );
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
                attach_mcp_manager_for_session(
                    &mut session,
                    &normalized_cli_options.mcp_config_load_options(),
                    false,
                    false,
                )
                .await?;
                let is_json = *json;
                let json_events = cli.json_events;
                let session_id = session
                    .managed_session_id()
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| "exec".to_string());
                if cli.json_events {
                    // Thread json_events mode so continuation/retry/fallback turns
                    // emit MessageDelta events instead of raw print!.
                    session.json_events = true;
                    session.json_session_id = session_id.clone();
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
                // Accumulate streamed text so a SIGINT can reconcile session
                // history with the partial reply (the TUI does the same via its
                // shared stream buffer on the Esc/Ctrl-C cancel path).
                let partial_buffer = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
                let partial_sink = std::sync::Arc::clone(&partial_buffer);
                // Race the turn against Ctrl-C. Cancellation reuses the TUI's
                // mechanism: dropping the `send()` future aborts the in-flight
                // provider stream and tool loop (tokio::select! drops the losing
                // branch), then `finalize_cancelled_turn` repairs history.
                let outcome = tokio::select! {
                    result = session.send(
                        &app_config,
                        prompt,
                        Box::new(move |chunk| {
                            if let Ok(mut buf) = partial_sink.lock() {
                                buf.push_str(chunk);
                            }
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
                    ) => Some(result),
                    _ = tokio::signal::ctrl_c() => None,
                };
                let Some(result) = outcome else {
                    // First SIGINT: the send future was dropped above, which
                    // cancelled the stream. A second Ctrl-C during shutdown
                    // exits immediately.
                    tokio::spawn(async {
                        let _ = tokio::signal::ctrl_c().await;
                        std::process::exit(130);
                    });
                    let partial = partial_buffer
                        .lock()
                        .map(|buf| buf.clone())
                        .unwrap_or_default();
                    session.finalize_cancelled_turn(&partial);
                    use std::io::Write as _;
                    let _ = io::stdout().flush();
                    if json_events {
                        agent_events::AgentEvent::Finished {
                            session_id: session_id.clone(),
                            reason: "interrupted",
                        }
                        .emit_stdout();
                    } else {
                        eprintln!();
                        eprintln!("Interrupted — turn cancelled before completion.");
                    }
                    // 130 = 128 + SIGINT, the conventional exit code.
                    std::process::exit(130);
                };
                match result {
                    Ok(turn) => {
                        if json_events {
                            agent_events::AgentEvent::TurnUsage {
                                session_id: session_id.clone(),
                                in_tokens: turn.input_tokens,
                                out_tokens: turn.output_tokens,
                                cache_read: turn.cache_read_tokens,
                                cache_creation: turn.cache_creation_tokens,
                                // Read accumulated cost from the session ledger instead of
                                // hardcoding 0.0 — the ledger is updated by send() internally.
                                cumulative_dollars: session.cost_ledger.total_usd,
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
                        exit_with_error(&e);
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
                    None,
                    cli_options::PermissionMode::Default,
                    false,
                    normalized_cli_options.allowed_tools.clone(),
                    normalized_cli_options.disallowed_tools.clone(),
                    normalized_cli_options.mcp_config_load_options(),
                    None,
                    None,
                )
                .await
            }
            Command::Fork { session_id } => {
                let (messages, managed_session) = resolve_resume_payload(session_id, true)?;
                eprintln!(
                    "{} Forked session '{}' ({} messages)",
                    ts::accent_header("fork:"),
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
                    None,
                    cli_options::PermissionMode::Default,
                    false,
                    normalized_cli_options.allowed_tools.clone(),
                    normalized_cli_options.disallowed_tools.clone(),
                    normalized_cli_options.mcp_config_load_options(),
                    None,
                    None,
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
                // Propagate a non-zero exit code whenever the underlying
                // `git apply` did not actually succeed, so scripts/CI can
                // detect a failed patch instead of always seeing exit 0.
                let result = if let Some(fp) = file {
                    let r = apply_patch::apply_from_file(std::path::Path::new(fp)).await?;
                    apply_patch::print_patch_result(&r);
                    Some(r)
                } else if let Some(sid) = session_id {
                    let r = apply_patch::apply_from_session(sid).await?;
                    apply_patch::print_patch_result(&r);
                    Some(r)
                } else {
                    let conn = sessions::open_db()?;
                    if let Some(s) = sessions::list_sessions(&conn, 1)?.first() {
                        let r = apply_patch::apply_from_session(&s.id).await?;
                        apply_patch::print_patch_result(&r);
                        Some(r)
                    } else {
                        eprintln!("No sessions found.");
                        None
                    }
                };
                match result {
                    Some(r) if r.exit_code != 0 => {
                        anyhow::bail!("patch did not apply cleanly (exit code {})", r.exit_code)
                    }
                    _ => Ok(()),
                }
            }
            Command::Sandbox { full_auto, command } => {
                // argv must survive the sh -c round-trip; a plain join loses quoting.
                let cmd_str = sandbox::shell_join(command);
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
            Command::Completion { shell } => {
                generate_shell_completion(*shell, "agi", &mut io::stdout());
                Ok(())
            }
            Command::AppServer {
                listen,
                allow_public_listen,
                auth_token,
                allowed_origin,
                allow_query_token,
            } => {
                let workspace_root = std::env::current_dir()?;
                let host = std::sync::Arc::new(app_server::CliDeveloperSessionHost::new(
                    app_config.clone(),
                    workspace_root,
                )?);
                let capabilities = host.capabilities();
                if listen == "stdio" {
                    return app_server::run_developer_session_stdio(host, capabilities).await;
                }

                // CLI app-server binds 8788 by default; Desktop occupies 8787.
                // Override at runtime via AGI_CLI_SERVER_ADDR env var.
                let cli_server_addr = std::env::var("AGI_CLI_SERVER_ADDR")
                    .unwrap_or_else(|_| "127.0.0.1:8788".to_string());
                let addr: std::net::SocketAddr = listen
                    .trim_start_matches("ws://")
                    .parse()
                    .unwrap_or_else(|_| {
                        cli_server_addr.parse().expect(
                            "AGI_CLI_SERVER_ADDR (or default 127.0.0.1:8788) must be a valid SocketAddr",
                        )
                    });
                if !allow_public_listen && !addr.ip().is_loopback() {
                    anyhow::bail!(
                        "app-server refuses non-loopback listen address {addr}; pass --allow-public-listen only after adding network/firewall controls"
                    );
                }
                let token = auth_token
                    .clone()
                    .or_else(|| std::env::var("AGI_APP_SERVER_TOKEN").ok())
                    .map(|token| token.trim().to_string())
                    .filter(|token| !token.is_empty())
                    .ok_or_else(|| {
                        anyhow::anyhow!(
                            "WebSocket app-server requires --auth-token or AGI_APP_SERVER_TOKEN; auth tokens are never printed"
                        )
                    })?;
                app_server::run_developer_session_websocket(
                    addr,
                    app_server::WebSocketSecurity {
                        auth_token: Some(token),
                        allowed_origins: allowed_origin.clone(),
                        allow_query_token: *allow_query_token,
                    },
                    host,
                    capabilities,
                )
                .await
            }
            Command::Models { action } => handle_models_command(action, &app_config).await,
            Command::Plugin { action } => {
                let mut mgr = plugins::PluginsManager::new();
                match action {
                    PluginSubcommand::List => {
                        mgr.load_all(std::env::current_dir().ok().as_deref())?;
                        for p in mgr.plugins() {
                            let st = if p.enabled {
                                ts::success("enabled")
                            } else {
                                ts::danger("disabled")
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
                    PluginSubcommand::Install {
                        source,
                        name,
                        integrity,
                        unsafe_no_integrity,
                    } => {
                        let pname =
                            match plugins::derive_plugin_install_name(source, name.as_deref()) {
                                Ok(name) => name,
                                Err(error) => {
                                    anyhow::bail!("Refusing install: {error}");
                                }
                            };
                        let psrc = if is_git_plugin_source(source) {
                            plugins::PluginSource::Git {
                                url: source.clone(),
                                branch: None,
                            }
                        } else {
                            plugins::PluginSource::Local(std::path::PathBuf::from(source))
                        };
                        // AUDIT-FIX: H-16 — supply-chain integrity is required.
                        let pintegrity = match (integrity.as_deref(), *unsafe_no_integrity) {
                            (Some(s), _) if s.starts_with("sha256:") => {
                                plugins::PluginIntegrity::PinnedSha256(s.to_string())
                            }
                            (Some(s), _) => {
                                anyhow::bail!(
                                    "Refusing install: unsupported integrity claim '{}'. Only --integrity sha256:<hex> is implemented.",
                                    s
                                );
                            }
                            (None, true) => plugins::PluginIntegrity::UnsafeSkip,
                            (None, false) => {
                                anyhow::bail!(
                                    "Refusing install: pass --integrity sha256:<hex> (or --unsafe-no-integrity)"
                                );
                            }
                        };
                        match mgr.install(plugins::PluginInstallRequest {
                            source: psrc,
                            name: pname,
                            integrity: pintegrity,
                        }) {
                            plugins::PluginInstallOutcome::Installed { path, format } => {
                                let fmt_tag = match format {
                                    Some(fmt) => format!(" ({} manifest)", fmt.short_tag()),
                                    None => String::new(),
                                };
                                println!("Installed to {}{}", path.display(), fmt_tag);
                                Ok(())
                            }
                            plugins::PluginInstallOutcome::AlreadyInstalled { path } => {
                                println!("Already at {}", path.display());
                                Ok(())
                            }
                            plugins::PluginInstallOutcome::Failed { error } => {
                                // Non-zero exit on failure so scripts/CI can detect
                                // it, matching `agi marketplace install`'s behavior.
                                anyhow::bail!("Failed: {}", error)
                            }
                        }
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
            Command::Approvals { action } => handle_approvals_command(action),
            Command::Execpolicy => {
                let policy = features::exec::exec_policy::load_policy()?;
                let prefixes = policy.get_allowed_prefixes();
                if prefixes.is_empty() {
                    println!("No rules. Add .rules files to ~/.agiworkforce/rules/");
                } else {
                    println!("{} allowed command prefix(es):", prefixes.len());
                    for prefix in prefixes {
                        println!("  {}", prefix.join(" "));
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
                        let report = ecosystem::import_mcp_servers_to_global(&servers, false)?;
                        println!(
                            "Imported {} MCP server config(s) into {}:",
                            report.added.len(),
                            report.path.display()
                        );
                        for s in &servers {
                            let transport = if s.url.is_some() { "HTTP/SSE" } else { "stdio" };
                            println!("  {} ({}) [{}]", s.name, s.source, transport);
                        }
                        if !report.skipped_existing.is_empty() {
                            println!(
                                "Skipped {} existing server config(s).",
                                report.skipped_existing.len()
                            );
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

            Command::Migrate { source, dry_run } => {
                let normalized = source.to_ascii_lowercase();
                if !matches!(
                    normalized.as_str(),
                    "claude" | "claude-code" | "claude_code"
                ) {
                    anyhow::bail!(
                        "Unsupported migration source '{}'. Supported sources: claude, claude-code",
                        source
                    );
                }
                let report = ecosystem::migrate_claude_code(*dry_run)?;
                print!("{}", ecosystem::format_claude_migration_report(&report));
                Ok(())
            }

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
                auth::interactive_login_for_provider(provider.as_deref()).await?;
                Ok(())
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
                    println!("Run `agi login` to authenticate.");
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

            // --- Doctor ---
            Command::Doctor { json } => doctor::run_doctor(&app_config, *json),

            // --- Marketplace ---
            Command::Marketplace { action } => {
                let home = config::CliConfig::config_dir()?;
                let mp = marketplace::Marketplace::new_production();
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
        generate_shell_completion(shell, "agi", &mut io::stdout());
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
            println!(
                "{}",
                serde_json::to_string_pretty(&models_json_with_discovery(&app_config).await)?
            );
        } else {
            println!(
                "{}",
                crate::provider::format_model_list_with_discovery(&app_config).await
            );
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
                ts::accent(query)
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
                                // Clamp the context window to UTF-8 char boundaries so
                                // multibyte content cannot panic the slice below.
                                let mut start = pos.saturating_sub(40);
                                while start > 0 && !text.is_char_boundary(start) {
                                    start -= 1;
                                }
                                let mut end = (pos + query.len() + 40).min(text.len());
                                while end < text.len() && !text.is_char_boundary(end) {
                                    end += 1;
                                }
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
            println!("{}", "Resume with: agi --resume <ID>".dimmed());
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

    // --init: create AGENTS.md in current directory
    if cli.init {
        let agents_md = std::path::Path::new("AGENTS.md");
        if agents_md.exists() {
            eprintln!("AGENTS.md already exists in current directory.");
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
            std::fs::write(agents_md, template)?;
            eprintln!("Created AGENTS.md in current directory.");
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
        println!("{}", output::format_model_pricing_report(model));
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

    // Resolve model.
    //
    // Priority (highest first):
    //   1. `--auto` explicitly opts into the managed-cloud policy router.
    //   2. Explicit `--model` CLI flag.
    //   3. `config.toml` default.model.
    //
    // Account-tier lookup must never silently turn an ordinary Local/BYOK CLI
    // launch into managed cloud. The managed boundary is entered only through
    // the explicit `--auto`/managed-provider path.
    let auto_route = if cli.auto {
        let jwt = tier_cache::load_jwt();
        let tier_resolution = tokio::time::timeout(
            std::time::Duration::from_secs(3),
            tier_cache::resolve_user_tier(jwt.as_deref()),
        )
        .await
        .unwrap_or_default();
        if tier_resolution.needs_reauth && jwt.is_some() {
            eprintln!(
                "{}",
                colored::Colorize::yellow(
                    "AGI session expired — run `agi login` (or set AGIWORKFORCE_JWT) to use managed Auto routing."
                )
            );
        }
        let tier = tier_resolution
            .cached
            .as_ref()
            // BYOK is not a server entitlement. The shared mapping fails it
            // closed to the Free policy until an account tier is proven.
            .map(|cached| cached.tier.managed_auto_routing_tier())
            .unwrap_or("free");
        // AUTO-ROUTER-MIGRATION-01 (CLI clause): classify the launch prompt
        // through the canonical taxonomy instead of hardcoding Coding.
        // One-shot runs classify their real prompt text; interactive launches
        // have no text yet and land on simple_chat — AgentSession::send then
        // re-classifies and re-resolves every turn with continuity.
        let launch_text = match cli.prompt.as_deref() {
            Some("-") | None => stdin_content.as_deref().unwrap_or(""),
            Some(prompt) => prompt,
        };
        let launch_task = routing::classify::classify_turn_task(launch_text, false);
        let route = model_catalog::resolve_auto_model(
            "auto",
            launch_task,
            tier,
            agiworkforce_model_registry::TrustMode::ManagedCloud,
        )
        .map_err(anyhow::Error::msg)?;
        Some((route, tier.to_string(), launch_task))
    } else {
        None
    };

    let model: String = if let Some((route, _, _)) = &auto_route {
        route.provider_model_id.clone()
    } else if let Some(ref explicit_model) = cli.model {
        explicit_model.clone()
    } else {
        app_config.default.model.clone()
    };

    // Parse `-m model1,model2,...` fallback-chain syntax. Without this the
    // whole comma-joined string was passed through as a single literal model
    // id (for example, two comma-separated local catalog selections), so the fallback chain never
    // fired and lookups failed with a bogus "model not installed" error. The
    // `Exec` subcommand already parses this correctly (see `FallbackChain::parse`
    // above) — mirror that here for the interactive/one-shot path so `-m`
    // behaves consistently across `agi exec` and plain `agi`.
    let model_fallback_chain = routing::fallback::FallbackChain::parse(&model);
    let model: String = model_fallback_chain
        .head()
        .map(|s| s.to_string())
        .unwrap_or(model);
    // `--auto` selects a concrete upstream model locally, but execution must
    // remain inside the Managed Cloud trust boundary. Never let provider
    // inference turn that concrete model into a silent direct/BYOK request.
    let effective_provider_override = if cli.auto {
        Some("agiworkforce")
    } else {
        cli.provider.as_deref()
    };
    if let Some((route, _, _)) = &auto_route {
        eprintln!(
            "Auto route: managed_cloud -> {}/{} (harness: {})",
            route.upstream_provider, route.provider_model_id, route.harness_id
        );
    }

    // Read file contents for -f flag — text files and images are handled separately
    let file_context_result = read_file_contexts(&cli.files)?;

    // Gather system context
    let sys_context = context::gather_system_context();

    // Build the final prompt from components (text files only; images attach as blocks)
    let final_prompt = build_final_prompt(
        cli.prompt.as_deref(),
        stdin_content.as_deref(),
        &file_context_result.text,
    );

    // --system-prompt-file: read base system prompt from file (wins over --system-prompt).
    let file_base_prompt: Option<String> = if let Some(ref path) = cli.system_prompt_file {
        match std::fs::read_to_string(path) {
            Ok(contents) => Some(contents),
            Err(e) => {
                anyhow::bail!("--system-prompt-file: cannot read '{}': {}", path, e);
            }
        }
    } else {
        None
    };

    // --append-system-prompt-file: read append content from file.
    let file_append_prompt: Option<String> = if let Some(ref path) = cli.append_system_prompt_file {
        match std::fs::read_to_string(path) {
            Ok(contents) => Some(contents),
            Err(e) => {
                anyhow::bail!("--append-system-prompt-file: cannot read '{}': {}", path, e);
            }
        }
    } else {
        None
    };

    // Build effective system prompt (base + append).
    // Priority: file contents win over inline flags when both are provided.
    let resolved_base = file_base_prompt.as_deref().or(cli.system_prompt.as_deref());
    let resolved_append = {
        // Combine inline append and file append with a newline separator when both present.
        match (
            cli.append_system_prompt.as_deref(),
            file_append_prompt.as_deref(),
        ) {
            (Some(inline), Some(from_file)) => Some(format!("{}\n\n{}", inline, from_file)),
            (Some(inline), None) => Some(inline.to_string()),
            (None, Some(from_file)) => Some(from_file.to_string()),
            (None, None) => None,
        }
    };
    let effective_system_prompt = match (resolved_base, resolved_append.as_deref()) {
        (Some(base), Some(append)) => Some(format!("{}\n\n{}", base, append)),
        (Some(base), None) => Some(base.to_string()),
        (None, Some(append)) => Some(append.to_string()),
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

    // Determine mode: one-shot if we have a prompt (from arg or stdin), image
    // attachments, or --print. REPL otherwise.
    //
    // Images alone (with no text prompt) are valid: the user may want the model
    // to describe the image without an explicit question, so we treat the empty
    // string as the user turn and let the model respond to the image content.
    let effective_prompt = final_prompt.clone().or_else(|| {
        if !file_context_result.images.is_empty() {
            Some(String::new())
        } else {
            None
        }
    });
    if let Some(ref prompt) = effective_prompt {
        return run_oneshot(
            &app_config,
            &model,
            effective_provider_override,
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
            normalized_cli_options.allowed_tools.clone(),
            normalized_cli_options.disallowed_tools.clone(),
            normalized_cli_options.mcp_config_load_options(),
            file_context_result.images,
            cli.max_budget_usd,
            cli.session_id_override.clone(),
            cli.json_events,
            cli.agent.clone(),
            model_fallback_chain.clone(),
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
                ts::accent_header("fork:"),
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

    // TODO(openQuestion): This block uses the AGI_PLAN=="hobby" env guard and calls
    // fetch_remaining_pct against https://api.agiworkforce.com (AGI_API_URL).
    // "Hobby" has been removed from the canonical tier model (tier_cache::UserTier no longer
    // has a Hobby variant) and the quota endpoint/host is unproven.  This block is left
    // intact (it only fires if AGI_PLAN=="hobby" is explicitly set, which is not standard)
    // but should be removed or re-targeted when the flat Pro/Max subscription quota contract
    // is confirmed.  Tracked as openQuestion in the AGI-subscription implementation plan.
    // BYOK and Local users never see this banner — they have no managed quota.
    {
        // Guard first — skip the auth load and network call entirely for non-Hobby plans.
        let is_hobby = std::env::var("AGI_PLAN")
            .map(|v| v.eq_ignore_ascii_case("hobby"))
            .unwrap_or(false);

        if is_hobby {
            // Attempt to fetch live remaining credits from the cloud API.
            // Falls back to the AGI_QUOTA_REMAINING_PCT env var (or 100) on any
            // failure so offline / unauthenticated runs are unaffected.
            let token = auth::AuthStore::load()
                .ok()
                .and_then(|s| s.entries.get("agiworkforce").cloned())
                .map(|e| match e {
                    auth::AuthEntry::OAuth { access, .. } => access,
                    auth::AuthEntry::ApiKey { key } => key,
                });

            let remaining: u8 = if let Some(bearer) = token {
                let raw_base = std::env::var("AGI_API_URL").ok();
                let fetched = match resolve_quota_api_base(raw_base.as_deref()) {
                    Some(api_base) => fetch_remaining_pct(&bearer, &api_base).await,
                    None => {
                        eprintln!(
                            "{}",
                            colored::Colorize::yellow(
                                "Warning: AGI_API_URL is not an https agiworkforce.com origin — skipping the quota check instead of sending your token there."
                            )
                        );
                        None
                    }
                };
                fetched
                    .or_else(|| {
                        std::env::var("AGI_QUOTA_REMAINING_PCT")
                            .ok()
                            .and_then(|s| s.parse().ok())
                    })
                    .unwrap_or(100)
            } else {
                // Not authenticated — fall back to env var (decorative / CI override).
                std::env::var("AGI_QUOTA_REMAINING_PCT")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(100)
            };

            if remaining < 10 {
                eprintln!(
                    "{}",
                    colored::Colorize::yellow(
                        "Warning: you have less than 10% of your weekly limit left. Run /status for a breakdown."
                    )
                );
            }
        }
    }

    // Seed interactive sessions with the Auto launch state so per-turn
    // re-classification has full continuity (selection, model_key, task,
    // trust, tier) — see AgentSession::re_resolve_auto_route_for_turn.
    let auto_route_seed =
        auto_route
            .as_ref()
            .map(|(route, tier, task)| routing::classify::AutoRouteSeed {
                state: crate::runtime::session::ManagedSessionAutoRouting {
                    selection: "auto".to_string(),
                    model_key: route.model_key.clone(),
                    task_type: routing::classify::developer_task_type(*task),
                    trust_mode: agiworkforce_model_registry::TrustMode::ManagedCloud,
                },
                tier: tier.clone(),
            });

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
            effective_provider_override,
            effective_permission_mode,
            effective_auto_approve_plan,
            normalized_cli_options.allowed_tools.clone(),
            normalized_cli_options.disallowed_tools.clone(),
            normalized_cli_options.mcp_config_load_options(),
            cli.agent.clone(),
            auto_route_seed,
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
            effective_provider_override.map(str::to_string),
            effective_permission_mode,
            effective_auto_approve_plan,
            cli.no_sandbox,
            normalized_cli_options.allowed_tools.clone(),
            normalized_cli_options.disallowed_tools.clone(),
            normalized_cli_options.mcp_config_load_options(),
            cli.agent.clone(),
            auto_route_seed,
        )
        .await
    }
}

/// An image file attached via the `--file / -f` flag, ready to be included in a
/// multipart message as a `ContentBlock::Image`.
pub struct ImageAttachment {
    /// Original file path (for display/error messages).
    pub path: String,
    /// MIME type (e.g. "image/png").
    pub mime: String,
    /// Raw base64-encoded image bytes (no `data:` prefix).
    pub data_b64: String,
}

/// Return value from [`read_file_contexts`]: text file context and detected image
/// attachments are separated so callers can handle them differently.
pub struct FileContextResult {
    /// Formatted text from non-image files (XML-wrapped, as before).
    pub text: String,
    /// Image files encoded and ready for multipart message injection.
    pub images: Vec<ImageAttachment>,
}

/// Image file extensions recognised for vision attachment.
fn is_image_extension(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    matches!(
        std::path::Path::new(&lower)
            .extension()
            .and_then(|e| e.to_str()),
        Some("png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "ico" | "tiff" | "tif")
    )
}

/// Read file contents for the -f flag, returning formatted text context and any
/// image attachments separately.
pub fn read_file_contexts(files: &[String]) -> Result<FileContextResult> {
    let mut context = String::new();
    let mut images = Vec::new();

    for path in files {
        if is_image_extension(path) {
            // Read raw bytes and encode for vision
            match std::fs::read(path) {
                Ok(bytes) => {
                    use agiworkforce_utils_image::{load_for_prompt_bytes, PromptImageMode};
                    match load_for_prompt_bytes(
                        std::path::Path::new(path),
                        bytes,
                        PromptImageMode::ResizeToFit,
                    ) {
                        Ok(encoded) => {
                            use base64::Engine as _;
                            let data_b64 =
                                base64::engine::general_purpose::STANDARD.encode(&encoded.bytes);
                            images.push(ImageAttachment {
                                path: path.clone(),
                                mime: encoded.mime,
                                data_b64,
                            });
                        }
                        Err(e) => {
                            output::print_error(&format!(
                                "Failed to process image '{}': {}",
                                path, e
                            ));
                            std::process::exit(1);
                        }
                    }
                }
                Err(e) => {
                    output::print_error(&format!("Failed to read image '{}': {}", path, e));
                    std::process::exit(1);
                }
            }
        } else {
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
        } // end else (non-image file)
    } // end for path in files
    Ok(FileContextResult {
        text: context,
        images,
    })
}

/// Combine positional prompt, stdin content, and file context into the final prompt.
pub fn build_final_prompt(
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

/// Exit with the appropriate status code for the given error.
///
/// Paywall errors use EX_CONFIG (78, sysexits.h) so callers can distinguish
/// "user needs to upgrade" from a generic execution failure.  All other errors
/// use exit code 1.
pub fn exit_with_error(e: &anyhow::Error) -> ! {
    // Walk the error chain looking for a CliError::Paywall.
    let exit_code = e
        .chain()
        .find_map(|cause| cause.downcast_ref::<errors::CliError>())
        .map(|cli_err| cli_err.exit_code())
        .unwrap_or(1);
    std::process::exit(exit_code)
}

pub(crate) async fn attach_mcp_manager_for_session(
    session: &mut agent::AgentSession,
    mcp_config_options: &mcp::McpConfigLoadOptions,
    include_default_configs: bool,
    include_plugin_configs: bool,
) -> Result<()> {
    if let Some(mgr) = build_mcp_manager(
        mcp_config_options,
        include_default_configs,
        include_plugin_configs,
        session.privacy_mode,
    )
    .await?
    {
        session.set_mcp_manager(mgr);
    }
    Ok(())
}

/// Load MCP configs, connect all servers, and return the connected manager.
///
/// This is the sessionless half of `attach_mcp_manager_for_session` — it can
/// be called from a `tokio::spawn` background task and the resulting
/// `McpManager` injected into a session later via `set_mcp_manager`.
///
/// Returns `Ok(None)` when there are no servers to connect (no-op case).
pub(crate) async fn build_mcp_manager(
    mcp_config_options: &mcp::McpConfigLoadOptions,
    include_default_configs: bool,
    include_plugin_configs: bool,
    privacy_mode: agent::PrivacyMode,
) -> Result<Option<mcp::McpManager>> {
    build_mcp_manager_inner(
        mcp_config_options,
        include_default_configs,
        include_plugin_configs,
        privacy_mode,
        None,
    )
    .await
}

/// TUI-only MCP builder. Headless/REPL/app-server callers intentionally keep
/// the fail-closed auto-decline handler installed by [`build_mcp_manager`].
pub(crate) async fn build_mcp_manager_with_elicitation(
    mcp_config_options: &mcp::McpConfigLoadOptions,
    include_default_configs: bool,
    include_plugin_configs: bool,
    privacy_mode: agent::PrivacyMode,
    elicitation: std::sync::Arc<dyn agiworkforce_mcp::ElicitationHandler>,
) -> Result<Option<mcp::McpManager>> {
    build_mcp_manager_inner(
        mcp_config_options,
        include_default_configs,
        include_plugin_configs,
        privacy_mode,
        Some(elicitation),
    )
    .await
}

async fn build_mcp_manager_inner(
    mcp_config_options: &mcp::McpConfigLoadOptions,
    include_default_configs: bool,
    include_plugin_configs: bool,
    privacy_mode: agent::PrivacyMode,
    elicitation: Option<std::sync::Arc<dyn agiworkforce_mcp::ElicitationHandler>>,
) -> Result<Option<mcp::McpManager>> {
    if !include_default_configs && !mcp_config_options.has_explicit_sources() {
        return Ok(None);
    }

    let mut load_options = mcp_config_options.clone();
    if !include_default_configs {
        load_options.strict = true;
    }

    let mut mcp_configs = mcp::McpManager::load_configs_with_options(&load_options)?;
    if include_plugin_configs && !load_options.strict {
        let mut plugin_mgr = plugins::PluginsManager::new();
        if plugin_mgr
            .load_all(std::env::current_dir().ok().as_deref())
            .is_ok()
        {
            mcp_configs.extend(plugin_mgr.mcp_configs());
        }
    }

    if mcp_configs.is_empty() {
        return Ok(None);
    }

    let mut mcp_mgr = mcp::McpManager::new();
    let connect_result = match elicitation {
        Some(handler) => {
            mcp_mgr
                .connect_all_with_elicitation(&mcp_configs, privacy_mode, handler)
                .await
        }
        None => mcp_mgr.connect_all(&mcp_configs, privacy_mode).await,
    };
    if let Err(err) = connect_result {
        // Suppress the raw stderr warning while the full-screen TUI owns the
        // terminal (it would corrupt the alternate screen); exec/REPL still
        // surface it.
        if !crate::tui::tui_active() {
            output::print_warn(&format!("MCP connection error: {err:#}"));
        }
    }
    Ok(Some(mcp_mgr))
}

fn sdk_tool_lifecycle_event(
    session_id: &str,
    event: &crate::tui::app_event::TuiAppEvent,
) -> Option<sdk_io::SdkEvent> {
    match event {
        crate::tui::app_event::TuiAppEvent::ToolStarted { call_id, name, .. } => Some(
            sdk_io::SdkEvent::StreamEvent(sdk_io::StreamEvent::ToolUseStart {
                session_id: session_id.to_string(),
                tool_use_id: call_id.clone(),
                tool_name: name.clone(),
            }),
        ),
        crate::tui::app_event::TuiAppEvent::ToolCompleted {
            call_id,
            name,
            status,
            output,
            ..
        } => Some(sdk_io::SdkEvent::ToolResult(sdk_io::ToolResultEvent {
            session_id: session_id.to_string(),
            tool_use_id: call_id.clone(),
            tool_name: name.clone(),
            is_error: !matches!(status, crate::tui::app_event::ToolStatus::Succeeded),
            content: serde_json::Value::String(output.clone()),
        })),
        _ => None,
    }
}

/// Execute a single prompt and exit.
#[allow(clippy::too_many_arguments)]
pub async fn run_oneshot(
    config: &config::CliConfig,
    model: &str,
    provider_override: Option<&str>,
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
    allowed_tools: Vec<String>,
    disallowed_tools: Vec<String>,
    mcp_config_options: mcp::McpConfigLoadOptions,
    image_attachments: Vec<ImageAttachment>,
    max_budget_usd: Option<f64>,
    session_id_override: Option<String>,
    json_events: bool,
    agent_name: Option<String>,
    fallback_chain: routing::fallback::FallbackChain,
) -> Result<()> {
    let mut session = agent::AgentSession::new_checked(
        model,
        sys_context,
        custom_system_prompt,
        models::selection_provider_override(
            model,
            &config.default.model,
            &config.default.provider,
            provider_override,
        ),
    )?;
    session.apply_ui_config(config);
    session.max_turns = max_turns;
    session.max_budget_usd = max_budget_usd;
    session.skip_permissions = skip_permissions;
    session.auto_approve_safe = auto_approve_safe;
    session.quiet = quiet;
    // `-m model1,model2,...` fallback chain — mirrors the `Exec` subcommand's
    // handling so a `,`-separated `-m` list actually rotates through
    // fallback models on transient failure instead of being silently dropped.
    if fallback_chain.primaries.len() > 1 {
        session.fallback_chain = Some(fallback_chain);
    }
    // Sprint B4: thread the permission mode + auto-approval into the
    // session before any send. `--mode plan` here means the model sees
    // the plan-mode reminder and the dispatcher gates mutating tools.
    session.permission_mode = permission_mode;
    session.auto_approve_plan = auto_approve_plan;
    session.apply_tool_filters(&allowed_tools, &disallowed_tools);
    if matches!(permission_mode, cli_options::PermissionMode::Plan) {
        session.plan_mode = true;
    }
    // Wire --agent: load the named agent definition and apply overrides to the session.
    if let Some(ref name) = agent_name {
        match agents::find_agent(name) {
            Some(agent_def) => {
                agent_def.apply_to_session(&mut session);
            }
            None => {
                eprintln!(
                    "Warning: agent '{}' not found. Continuing without agent.",
                    name
                );
            }
        }
    }
    session.enable_managed_session()?;
    // Wire --session-id: override the auto-generated session UUID with the
    // caller-supplied one.  Must be called after enable_managed_session so
    // the managed session object exists.
    if let Some(ref sid) = session_id_override {
        session.override_session_id(sid)?;
    }
    // Event-stream correlation id. `--no-session-persistence` suppresses the
    // managed session entirely, so an explicit `--session-id` has to be read
    // straight from the flag — otherwise a caller that opted out of disk
    // persistence would silently lose the id it correlates events by. When
    // persistence is on this is the same value `override_session_id` just
    // wrote, so the two paths agree.
    let event_session_id = session_id_override
        .clone()
        .or_else(|| session.managed_session_id().map(str::to_string));
    // Thread json_events mode into the session so ALL turns (continuation,
    // retry, fallback) emit MessageDelta events instead of raw print!.
    if json_events && output_mode != OneShotOutputMode::JsonLine {
        session.json_events = true;
        session.json_session_id = event_session_id
            .clone()
            .unwrap_or_else(|| "exec".to_string());
    }
    // Wire --max-budget-usd: emit BudgetExhausted only when --json-events is
    // active so stdout is not polluted in text/json-pretty output modes.
    if max_budget_usd.is_some() && json_events && output_mode != OneShotOutputMode::JsonLine {
        let managed_id = event_session_id
            .clone()
            .unwrap_or_else(|| "(no session)".to_string());
        session.on_budget_exhausted =
            Some(agent::BudgetSink(Box::new(move |cumulative, limit| {
                agent_events::AgentEvent::BudgetExhausted {
                    session_id: managed_id.clone(),
                    cumulative_dollars: cumulative,
                    limit_dollars: limit,
                }
                .emit_stdout();
            })));
    }
    attach_mcp_manager_for_session(&mut session, &mcp_config_options, false, false).await?;

    // If the user attached image files via --file, queue them as pending image
    // blocks on the session.  The next `session.send()` call will prepend them
    // to the user message so text + images arrive in a single multipart turn.
    if !image_attachments.is_empty() {
        use models::ContentBlock;
        session.pending_image_blocks = image_attachments
            .into_iter()
            .map(|img| ContentBlock::Image {
                mime: img.mime,
                data_b64: img.data_b64,
            })
            .collect();
    }

    let sdk_stream_context = if output_mode == OneShotOutputMode::JsonLine {
        let context = agent::SdkStreamContext {
            session_id: session
                .managed_session_id()
                .map(str::to_string)
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            message_id: uuid::Uuid::new_v4().to_string(),
        };
        session.sdk_stream_context = Some(context.clone());

        let tool_session_id = context.session_id.clone();
        session.on_tool_event = Some(agent::ToolEventSink(std::sync::Arc::new(move |event| {
            if let Some(event) = sdk_tool_lifecycle_event(&tool_session_id, &event) {
                let _ = sdk_io::write_event_stdout(&event);
            }
        })));

        if max_budget_usd.is_some() {
            let budget_session_id = context.session_id.clone();
            session.on_budget_exhausted = Some(agent::BudgetSink(Box::new(move |spent, limit| {
                let _ = sdk_io::write_event_stdout(&sdk_io::SdkEvent::StatusUpdate(
                    sdk_io::StatusUpdateEvent {
                        session_id: budget_session_id.clone(),
                        reason: sdk_io::StatusUpdateReason::BudgetExhausted,
                        detail: Some(format!("${spent:.4} >= ${limit:.4}")),
                    },
                ));
            })));
        }

        Some(context)
    } else {
        None
    };

    if output_mode == OneShotOutputMode::JsonLine {
        // Canonical stream-JSON: flushed NDJSON records on stdout in live turn
        // order, including text deltas across tool continuations and bounded
        // tool lifecycle events. The finalized assistant message remains the
        // authoritative terminal snapshot for consumers that do not assemble
        // deltas themselves.
        use sdk_io::{
            AssistantMessageEvent, NdjsonWriter, SdkEvent, StatusUpdateEvent, StatusUpdateReason,
            UserMessageBody,
        };
        let writer = NdjsonWriter::new(tokio::io::stdout());
        let stream_context = sdk_stream_context.expect("stream-json context configured");
        let session_id = stream_context.session_id.clone();

        writer
            .emit(&SdkEvent::StatusUpdate(StatusUpdateEvent {
                session_id: session_id.clone(),
                reason: StatusUpdateReason::SessionStart,
                detail: Some(model.to_string()),
            }))
            .await
            .ok();
        writer
            .emit(&SdkEvent::UserMessage {
                session_id: session_id.clone(),
                message: UserMessageBody {
                    role: "user".to_string(),
                    content: serde_json::json!([{ "type": "text", "text": prompt }]),
                },
            })
            .await
            .ok();

        let start = std::time::Instant::now();
        let delta_context = stream_context.clone();
        let result = session
            .send(
                config,
                prompt,
                Box::new(move |chunk| delta_context.emit_text_delta(chunk)),
            )
            .await;
        let duration_ms = start.elapsed().as_millis() as u64;

        match result {
            Ok(turn) => {
                writer
                    .emit(&SdkEvent::AssistantMessage(AssistantMessageEvent {
                        session_id: session_id.clone(),
                        message_id: stream_context.message_id,
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
                exit_with_error(&e);
            }
        }
    } else if output_mode == OneShotOutputMode::JsonPretty {
        // Pretty-printed single JSON object — non-streaming, for shell users
        // running `agi -p '...' --output-format json`.
        let start = std::time::Instant::now();
        let result = session.send(config, prompt, Box::new(|_chunk| {})).await;
        let duration_ms = start.elapsed().as_millis() as u64;

        match result {
            Ok(turn) => {
                let cost_str = if turn.via_subscription {
                    output::format_subscription_cost(turn.input_tokens, turn.output_tokens)
                } else {
                    output::format_recorded_cost(
                        turn.input_tokens,
                        turn.output_tokens,
                        turn.cost_usd,
                    )
                };
                let json_out = oneshot_result_json_value(
                    model,
                    &turn.response,
                    turn.input_tokens,
                    turn.output_tokens,
                    turn.via_subscription,
                    &cost_str,
                    duration_ms,
                    false,
                );
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
                exit_with_error(&e);
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
                exit_with_error(&e);
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
                    output::print_recorded_cost(
                        turn.input_tokens,
                        turn.output_tokens,
                        turn.cost_usd,
                    );
                }
            }
            Err(e) => {
                output::print_error(&format!("{:#}", e));
                exit_with_error(&e);
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[test]
    fn catalog_json_labels_base_rates_and_projects_every_input_tier() {
        let model = provider::model_catalog()
            .into_iter()
            .find(|entry| !model_catalog::input_token_pricing_tiers(&entry.id).is_empty())
            .expect("embedded catalog must include a request-tiered model");
        let expected = model_catalog::input_token_pricing_tiers(&model.id);

        let projected = catalog_model_json(&model);

        assert_eq!(projected["pricing_basis"], "base");
        assert_eq!(
            projected["input_token_pricing_tiers"]
                .as_array()
                .map(Vec::len),
            Some(expected.len())
        );
        assert_eq!(
            projected["input_token_pricing_tiers"][0]["threshold_tokens_exclusive"],
            expected[0].threshold_tokens
        );
    }

    #[test]
    fn verbose_and_debug_flags_change_the_effective_log_filter() {
        // Quiet default keeps the crate at warn.
        assert_eq!(
            compute_log_filter(false, None, None),
            "agiworkforce_cli=warn"
        );
        // -v/--verbose raises the whole crate to debug — the flag now has effect.
        assert_eq!(
            compute_log_filter(true, None, None),
            "agiworkforce_cli=debug"
        );
        assert_ne!(
            compute_log_filter(true, None, None),
            compute_log_filter(false, None, None),
            "--verbose must change the effective filter"
        );
        // Bare --debug → whole-crate debug.
        assert_eq!(
            compute_log_filter(false, Some(&None), None),
            "agiworkforce_cli=debug"
        );
        // --debug=mcp,agent → per-category debug on an info floor (category-aware).
        assert_eq!(
            compute_log_filter(false, Some(&Some("mcp,agent".to_string())), None),
            "agiworkforce_cli=info,agiworkforce_cli::mcp=debug,agiworkforce_cli::agent=debug"
        );
        // --debug=all is the whole-crate escape hatch.
        assert_eq!(
            compute_log_filter(false, Some(&Some("all".to_string())), None),
            "agiworkforce_cli=debug"
        );
        // An explicit RUST_LOG-style env value always wins verbatim.
        assert_eq!(
            compute_log_filter(true, Some(&None), Some("warn,foo=trace")),
            "warn,foo=trace"
        );
        // The computed directive must be a valid EnvFilter that installs cleanly
        // (idempotent — safe even if another test already installed a subscriber).
        // Skip the exact-value assertion when the environment pins a log filter.
        let applied = init_tracing(true, None);
        if std::env::var("RUST_LOG").is_err() && std::env::var("AGIWORKFORCE_LOG").is_err() {
            assert_eq!(
                applied, "agiworkforce_cli=debug",
                "init_tracing must apply the computed verbose filter"
            );
        }
    }

    #[test]
    fn destructive_delete_refuses_without_force_or_a_terminal() {
        // Non-interactive and unforced → refuse rather than delete silently.
        assert_eq!(
            resolve_destructive_decision(false, false),
            DestructiveDecision::Refuse
        );
        // --force / --yes bypasses the prompt for scripts.
        assert_eq!(
            resolve_destructive_decision(true, false),
            DestructiveDecision::Proceed
        );
        // Interactive terminal without force → ask the user.
        assert_eq!(
            resolve_destructive_decision(false, true),
            DestructiveDecision::Prompt
        );
        // Force wins even on a terminal.
        assert_eq!(
            resolve_destructive_decision(true, true),
            DestructiveDecision::Proceed
        );
    }

    #[test]
    fn session_delete_parses_force_alias() {
        let cli = Cli::try_parse_from(["agi", "session", "delete", "abc", "--yes"])
            .expect("--yes alias should parse");
        match cli.command {
            Some(Command::Session {
                action: SessionAction::Delete { session_id, force },
            }) => {
                assert_eq!(session_id, "abc");
                assert!(force, "--yes must set force");
            }
            other => panic!("expected session delete, got {other:?}"),
        }
    }

    #[test]
    fn declined_first_run_trust_exits_before_launching_the_cli() {
        assert_eq!(
            first_run_launch_decision(false),
            FirstRunLaunchDecision::Exit
        );
        assert_eq!(
            first_run_launch_decision(true),
            FirstRunLaunchDecision::Continue
        );
    }

    #[test]
    fn developer_invocations_require_project_trust_before_loading_context() {
        for args in [
            vec!["agi"],
            vec!["agi", "exec", "inspect this project"],
            vec!["agi", "review"],
            vec!["agi", "app-server"],
            vec!["agi", "onboarding"],
        ] {
            let cli = Cli::try_parse_from(args).expect("developer invocation should parse");
            assert!(invocation_requires_project_trust(&cli));
        }

        let doctor = Cli::try_parse_from(["agi", "doctor"])
            .expect("project-independent command should parse");
        assert!(!invocation_requires_project_trust(&doctor));

        let system_prompt = Cli::try_parse_from(["agi", "--dump-system-prompt"])
            .expect("read-only system prompt flag should parse");
        assert!(!invocation_requires_project_trust(&system_prompt));
    }

    #[test]
    fn cli_does_not_advertise_an_unimplemented_cloud_task_surface() {
        let subcommands: Vec<String> = Cli::command()
            .get_subcommands()
            .map(|command| command.get_name().to_string())
            .collect();

        assert!(
            !subcommands.iter().any(|command| command == "cloud"),
            "managed execution uses the normal model/session path; an unwired cloud task command must not be exposed: {subcommands:?}"
        );
    }

    #[tokio::test]
    async fn cloud_balance_reads_the_public_percentage_contract() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind test listener");
        let address = listener.local_addr().expect("listener address");
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.expect("accept request");
            let mut request = [0_u8; 2048];
            let _ = socket.read(&mut request).await.expect("read request");
            let body = r#"{"credits":{"usage_percentage":28,"reset_at":"2026-08-01T00:00:00.000Z","seconds_until_reset":86400,"has_usage_remaining":true}}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            socket
                .write_all(response.as_bytes())
                .await
                .expect("write response");
        });

        let remaining = fetch_remaining_pct("test-token", &format!("http://{address}")).await;
        server.await.expect("test server finished");

        assert_eq!(remaining, Some(72));
    }

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
    fn stream_json_text_delta_uses_canonical_ids_and_envelope() {
        let context = agent::SdkStreamContext {
            session_id: "session-42".to_string(),
            message_id: "message-7".to_string(),
        };
        let event = serde_json::to_value(context.text_delta_event("hello"))
            .expect("stream event serializes");

        assert_eq!(event["type"], "stream_event");
        assert_eq!(event["subtype"], "text_delta");
        assert_eq!(event["session_id"], "session-42");
        assert_eq!(event["message_id"], "message-7");
        assert_eq!(event["delta"], "hello");
    }

    #[test]
    fn stream_json_tool_lifecycle_preserves_call_identity_and_result() {
        let started = crate::tui::app_event::TuiAppEvent::ToolStarted {
            call_id: "call-9".to_string(),
            name: "read_file".to_string(),
            summary: "Read a file".to_string(),
            input: serde_json::json!({"path": "redacted"}),
        };
        let completed = crate::tui::app_event::TuiAppEvent::ToolCompleted {
            call_id: "call-9".to_string(),
            name: "read_file".to_string(),
            status: crate::tui::app_event::ToolStatus::Succeeded,
            output: "contents".to_string(),
            duration_ms: 12,
        };

        let started = serde_json::to_value(
            sdk_tool_lifecycle_event("session-42", &started).expect("tool start maps"),
        )
        .unwrap();
        let completed = serde_json::to_value(
            sdk_tool_lifecycle_event("session-42", &completed).expect("tool result maps"),
        )
        .unwrap();

        assert_eq!(started["type"], "stream_event");
        assert_eq!(started["subtype"], "tool_use_start");
        assert_eq!(started["tool_use_id"], "call-9");
        assert_eq!(completed["type"], "tool_result");
        assert_eq!(completed["tool_use_id"], "call-9");
        assert_eq!(completed["is_error"], false);
        assert_eq!(completed["content"], "contents");
    }

    #[test]
    fn stream_json_rejects_the_incompatible_legacy_event_schema() {
        assert!(Cli::try_parse_from([
            "agiworkforce",
            "--output-format",
            "stream-json",
            "--json-events",
            "hello",
        ])
        .is_err());
    }

    #[test]
    fn parses_claude_style_global_options_into_normalized_contract() {
        let cli = Cli::try_parse_from([
            "agiworkforce",
            "--print",
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
        .expect("reference-compatible options should parse");

        let options = crate::cli_options::CliOptions::from_cli(&cli);

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

    #[test]
    fn system_prompt_file_flag_parses() {
        let cli = Cli::try_parse_from([
            "agiworkforce",
            "--system-prompt-file",
            "/tmp/sys.txt",
            "hello",
        ])
        .expect("--system-prompt-file should parse");
        assert_eq!(cli.system_prompt_file.as_deref(), Some("/tmp/sys.txt"));
    }

    #[test]
    fn max_budget_usd_flag_parses() {
        let cli = Cli::try_parse_from(["agiworkforce", "--max-budget-usd", "1.50", "hello"])
            .expect("--max-budget-usd should parse");
        assert!((cli.max_budget_usd.unwrap() - 1.50).abs() < 1e-9);
    }

    #[test]
    fn auto_rejects_direct_provider_or_model_overrides() {
        assert!(
            Cli::try_parse_from(["agi", "--auto", "--provider", "openai"]).is_err(),
            "managed Auto must not be combined with a direct BYOK provider"
        );
        let catalog_model = model_catalog::default_model();
        assert!(
            Cli::try_parse_from(["agi", "--auto", "--model", catalog_model]).is_err(),
            "Auto policy and an explicit model are mutually exclusive"
        );
    }

    #[test]
    fn session_id_flag_parses() {
        let cli = Cli::try_parse_from(["agiworkforce", "--session-id", "my-session-abc", "hello"])
            .expect("--session-id should parse");
        assert_eq!(cli.session_id_override.as_deref(), Some("my-session-abc"));
    }

    #[tokio::test]
    async fn session_id_override_wires_to_managed_session() {
        // Behavioral test: override_session_id() actually mutates the managed
        // session's session_id so managed_session_id() returns the caller value.
        //
        // Takes the session-persistence policy lock because this test depends on
        // the default (persistence on) while the `--no-session-persistence`
        // tests flip that process-wide policy.
        let _policy = cli_options::session_persistence_policy_lock();
        let sys_ctx = context::gather_system_context();
        // Source the model ID from the canonical catalog (models.json) rather than
        // a hardcoded literal, per the locked no-hardcoded-model-IDs rule.
        let model = model_catalog::default_model();
        let mut session = agent::AgentSession::new(model, &sys_ctx, None);
        session
            .enable_managed_session()
            .expect("enable_managed_session should succeed");
        let auto_id = session
            .managed_session_id()
            .expect("session should exist after enable")
            .to_string();
        assert!(
            !auto_id.is_empty(),
            "auto-generated session id should not be empty"
        );

        let custom = "test-override-id-behavioral";
        session
            .override_session_id(custom)
            .expect("override_session_id should succeed");
        assert_eq!(
            session.managed_session_id(),
            Some(custom),
            "managed_session_id should reflect the overridden id"
        );
        assert_ne!(
            session.managed_session_id(),
            Some(auto_id.as_str()),
            "id should have changed from the auto-generated value"
        );
    }

    #[test]
    fn sdk_input_and_redundant_partial_flags_are_not_active_cli_surface() {
        assert!(
            Cli::try_parse_from(["agiworkforce", "--input-format", "stream-json", "hello",])
                .is_err(),
            "--input-format must not be accepted until bidirectional SDK input is wired"
        );
        assert!(
            Cli::try_parse_from(["agiworkforce", "--include-partial-messages", "hello"]).is_err(),
            "stream-json emits live deltas by contract; a redundant compatibility flag is not exposed"
        );
    }

    #[test]
    fn completion_subcommand_parses_shell() {
        let cli = Cli::try_parse_from(["agiworkforce", "completion", "zsh"])
            .expect("completion subcommand should parse");
        match cli.command {
            Some(Command::Completion { shell }) => assert_eq!(shell, ShellType::Zsh),
            other => panic!("expected completion command, got {other:?}"),
        }
    }

    #[test]
    fn completions_alias_subcommand_parses_shell() {
        let cli = Cli::try_parse_from(["agiworkforce", "completions", "fish"])
            .expect("completions alias should parse");
        match cli.command {
            Some(Command::Completion { shell }) => assert_eq!(shell, ShellType::Fish),
            other => panic!("expected completion command, got {other:?}"),
        }
    }

    #[test]
    fn api_base_resolution_defaults_to_the_agiworkforce_quota_host() {
        assert_eq!(
            resolve_quota_api_base(None).as_deref(),
            Some("https://api.agiworkforce.com")
        );
        // A blank override is a misconfiguration, not a redirect — fall back.
        assert_eq!(
            resolve_quota_api_base(Some("   ")).as_deref(),
            Some("https://api.agiworkforce.com")
        );
    }

    #[test]
    fn api_base_resolution_accepts_agiworkforce_origins() {
        assert_eq!(
            resolve_quota_api_base(Some("https://api.agiworkforce.com")).as_deref(),
            Some("https://api.agiworkforce.com")
        );
        assert_eq!(
            resolve_quota_api_base(Some("https://agiworkforce.com/")).as_deref(),
            Some("https://agiworkforce.com")
        );
    }

    #[test]
    fn api_base_resolution_rejects_attacker_supplied_hosts() {
        // The quota request carries the account bearer token, so an override
        // that names any other host must abort the fetch, not redirect it.
        assert_eq!(resolve_quota_api_base(Some("https://evil.example")), None);
        assert_eq!(
            resolve_quota_api_base(Some("https://api.agiworkforce.com.evil.example")),
            None
        );
        assert_eq!(
            resolve_quota_api_base(Some("https://evil.example/api.agiworkforce.com")),
            None
        );
    }

    #[test]
    fn api_base_resolution_rejects_plaintext_and_non_http_schemes() {
        assert_eq!(
            resolve_quota_api_base(Some("http://api.agiworkforce.com")),
            None
        );
        assert_eq!(resolve_quota_api_base(Some("file:///etc/passwd")), None);
    }

    #[test]
    fn completion_output_is_generated_for_agi_binary_name() {
        let mut out = Vec::new();
        generate_shell_completion(ShellType::Bash, "agi", &mut out);
        let rendered =
            String::from_utf8(out).expect("bash completion output should be valid utf-8");
        assert!(
            rendered.contains("_agi()"),
            "expected bash completion function for agi, got:\n{rendered}"
        );
    }
}
