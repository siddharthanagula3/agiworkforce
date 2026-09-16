// Clippy allows: style-preference categories that produced 12+ pre-existing
// failures in CI. Real issues (private-type leaks, missing is_empty, duplicated
// attributes, default-method-confusion) fixed inline.
#![allow(clippy::type_complexity)]
#![allow(clippy::doc_overindented_list_items)]
#![allow(clippy::question_mark)]
#![allow(clippy::ptr_arg)]
#![allow(clippy::result_large_err)]

// Active modules, core CLI functionality
pub mod agent;
pub mod agent_events;
pub mod agents;
pub mod auth;
pub mod browser_bridge;
pub mod claude_parity;
pub mod cli_options;
pub mod cloud;
pub mod command_registry;
pub mod compaction;
pub mod config;
pub mod context;
pub mod context_handoff;
pub mod conversations;
pub mod custom_commands;
pub mod daemon;
pub mod design_system;
pub mod doctor;
pub mod errors;
pub mod hex;
// hooks lives at features::hooks::hooks; re-exported here so all 20 call-sites
// using `crate::hooks::*` continue to resolve unchanged.
pub use features::hooks::hooks;
pub mod markdown;
// lsp lives at platform::lsp; re-exported here so all 4 call-sites
// in features/exec/tools/task_registry.rs resolve unchanged.
pub use platform::lsp;
pub mod mcp;
pub mod memory;
pub mod mentions;
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
pub mod sensitive_files;
pub mod sessions;
pub mod skills;
pub mod subagent;
pub mod subagent_v2;
pub mod teams;
// tools lives at features::exec::tools; re-exported here so all 42 call-sites
// using `crate::tools::*` continue to resolve unchanged.
pub use features::exec::tools;
pub mod tui;
/// Audio capture and transcription. Off by default: `cpal` links `libasound.so.2`
/// on Linux, which the dynamic loader resolves before `main`, so a build that
/// carries it cannot start on a host without ALSA. The language table it used to
/// own lives in `voice_languages` so `/voice` still validates either way.
#[cfg(feature = "voice")]
pub mod voice;
pub mod voice_languages;

/// Stand-in for `voice` in builds without the feature, so `/voice` reports why
/// it is unavailable instead of the command vanishing from the registry.
#[cfg(not(feature = "voice"))]
pub mod voice {
    use crate::agent::AgentSession;
    use crate::config::CliConfig;
    use anyhow::{bail, Result};

    pub async fn run_voice_mode(
        _session: &mut AgentSession,
        _config: &CliConfig,
        _voice_lang: &str,
    ) -> Result<()> {
        bail!(
            "This build was compiled without voice support, so audio capture is unavailable. \
             Install a build with the `voice` feature enabled to use /voice."
        )
    }
}

// Extended CLI modules, used by subcommand handlers
pub mod app_server;
pub mod apply_patch;
pub mod approval_audit;
pub mod ecosystem;
pub mod init;
pub mod keybindings;
pub mod local_models;
pub mod model_catalog;
pub mod model_reachability;
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
pub mod schedules;
pub mod shell_snapshot;
pub mod sync;
pub mod terminal_style;
pub mod terminal_text;
pub mod tier_cache;
pub(crate) mod tool_filters;
pub mod tool_search;
pub mod update_check;
pub mod usage_summary;

// Phase-2 candidates, implementations exist but the user-facing surface is
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
// PHASE2: WS transport for a2a, wraps jsonrpc::handle_request over persistent WS connections
pub mod a2a_ws;
pub mod memory_pipeline; // used by agent/mod.rs + agent/chat.rs + agent/prompt.rs
pub mod skill_learner; // used by agent/chat.rs session-end hook

// A2A protocol, lives at features::a2a; re-exported here so 6 call-sites in
// a2a_ws.rs, agent/mod.rs, and repl/mod.rs resolve unchanged.
#[allow(dead_code)] // PHASE2: expose `agi a2a serve/discover/delegate`
pub use features::a2a;

// Phase 6 reorg, feature/platform/data layers.
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

/// AGI CLI, multi-model AI agent in your terminal
#[derive(Parser, Debug)]
#[command(
    name = "agi",
    version,
    about = "AGI CLI, multi-model AI agent in your terminal",
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

    /// Read a browser selection handed over from the Chrome extension
    /// (`agi-context://v1?…`). The link carries the whole selection, nothing is
    /// fetched.
    #[arg(long = "context-url", value_name = "URL")]
    context_url: Option<String>,

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

    /// Output format for the one-shot response and for `agi models`. Canonical
    /// name `--output-format`; `--output` is kept as an alias for backward
    /// compatibility.
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
    /// Exhaustive, use all available context (max_turns=100, max_tokens=32768)
    Max,
}

/// Coding CLI whose settings `agi migrate` can import.
#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
enum MigrationSource {
    /// Claude Code settings, MCP servers, and instructions.
    Claude,
    /// Same as claude.
    #[value(alias = "claude_code")]
    ClaudeCode,
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
/// 1. An explicit `RUST_LOG` (or `AGIWORKFORCE_LOG`) env value always wins, it
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
    /// Compare this build against the newest published CLI release.
    ///
    /// Reads the release feed by default and downloads nothing. `--install`
    /// runs the documented install command after printing it and asking.
    ///
    /// Installing needs a signed release: the install routes refuse an archive
    /// without its signed checksum manifest, and no published CLI release
    /// carries one yet, so an install can fail on provenance.
    Update {
        /// Exit non-zero when a newer release is published, for scripts.
        #[arg(long)]
        check: bool,
        /// Run the documented install command when a newer release exists.
        #[arg(long)]
        install: bool,
        /// Skip the confirmation prompt. Only meaningful with `--install`.
        #[arg(long, short = 'y', requires = "install")]
        yes: bool,
    },
    /// Manage the global MCP server registry (~/.agiworkforce/mcp.json).
    Mcp {
        #[command(subcommand)]
        action: McpSubcommand,
    },
    /// Manage the hooks the agent fires (~/.agiworkforce/hooks.json).
    Hooks {
        #[command(subcommand)]
        action: Option<HooksSubcommand>,
    },
    /// Run as MCP server (stdio). Exposes no tools yet, see `agi app-server`.
    ///
    /// The handler speaks the protocol and answers initialize/tools/list, but
    /// advertises an empty tool list on purpose: one-shot agent exec over stdio
    /// MCP needs provider/model session, approval plumbing and event streaming,
    /// and advertising a tool before it is callable would be fake wiring. Stated
    /// here so the command's help matches what it does, the behaviour itself is
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
    /// Continue previous session, from this device or from your account.
    Resume {
        session_id: Option<String>,
        /// Resolve the id against your AGI Workforce account rather than this device.
        #[arg(long)]
        cloud: bool,
    },
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
        /// Source to migrate from.
        #[arg(value_enum, default_value_t = MigrationSource::Claude)]
        source: MigrationSource,
        /// Show what would be imported without writing files.
        #[arg(long)]
        dry_run: bool,
    },
    /// Browse session history, on this device and in your account.
    History {
        #[command(subcommand)]
        action: Option<HistorySubcommand>,
        /// Maximum number of sessions to display.
        #[arg(long, default_value = "20")]
        limit: usize,
        /// Show only the conversations stored in your AGI Workforce account.
        #[arg(long)]
        cloud: bool,
    },
    /// Sync dotfiles and settings across devices.
    Sync {
        #[command(subcommand)]
        action: SyncSubcommand,
    },
    /// Sign in to your AGI Workforce account, or store a provider API key.
    Login {
        /// Omit for your AGI Workforce account; name a provider (anthropic, openai, google, …) to enter its API key under Your Key; copilot uses its device flow.
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
    /// Show the account's managed allowance from the shared usage ledger.
    Usage,
    /// Manage the account's scheduled agent tasks in AGI cloud.
    Schedules {
        #[command(subcommand)]
        action: SchedulesSubcommand,
    },
    /// Browse and create the projects in your AGI Workforce account.
    Projects {
        #[command(subcommand)]
        action: ProjectsSubcommand,
    },
    /// Browse, read and publish the artifacts in your AGI Workforce account.
    Artifacts {
        #[command(subcommand)]
        action: ArtifactsSubcommand,
    },
    /// Read and write the memory your AGI Workforce account shares across clients.
    Memory {
        #[command(subcommand)]
        action: MemorySubcommand,
    },
    /// Generate an image with your AGI Workforce account and save it to a file.
    ///
    /// Runs on the same hosted image route the web and mobile apps use, so the
    /// image lands in your account library as well as on disk. Managed privacy
    /// mode only.
    Image {
        /// What to draw.
        prompt: Option<String>,
        /// Where to write the image. A directory takes a name from the prompt;
        /// a filename is used as given. Defaults to the working directory.
        #[arg(long)]
        out: Option<String>,
        /// Image size, e.g. 256x256. The account decides the default.
        #[arg(long)]
        size: Option<String>,
        /// Rendering quality the hosted route accepts (standard or hd).
        #[arg(long)]
        quality: Option<String>,
        /// How many images to generate.
        #[arg(long, short = 'n', default_value_t = 1)]
        count: u8,
        /// Catalogue image model to use instead of the first admitted one.
        #[arg(short, long)]
        model: Option<String>,
        /// List the image models this account can generate with, and exit.
        #[arg(long)]
        list_models: bool,
    },
}

#[derive(Subcommand, Debug)]
enum HistorySubcommand {
    /// Delete a conversation from your AGI Workforce account.
    Delete {
        /// Conversation id, as `agi history` prints it.
        id: String,
        /// Skip the confirmation prompt.
        #[arg(long, short = 'y')]
        yes: bool,
        #[arg(long)]
        json: bool,
    },
}

#[derive(Subcommand, Debug)]
enum ProjectsSubcommand {
    /// List the account's projects, refreshed from the account.
    List,
    /// Create a project in the account.
    Create {
        /// Project name.
        name: String,
        /// Optional description.
        #[arg(long)]
        description: Option<String>,
    },
    /// Link this directory to an account project by id or name.
    Link {
        /// Project id or name.
        project: String,
    },
    /// Delete a project from the account by id or name.
    Delete {
        /// Project id or name.
        project: String,
        /// Skip the confirmation prompt.
        #[arg(long, short = 'y')]
        yes: bool,
        #[arg(long)]
        json: bool,
    },
    /// Archive a project so it leaves the active list without being deleted.
    Archive {
        /// Project id or name.
        project: String,
        /// Bring an archived project back instead.
        #[arg(long)]
        undo: bool,
        #[arg(long)]
        json: bool,
    },
}

#[derive(Subcommand, Debug)]
enum ArtifactsSubcommand {
    /// List the account's artifacts, newest first.
    List {
        /// Only the artifacts of this project id.
        #[arg(long)]
        project: Option<String>,
        /// Maximum number of artifacts to return.
        #[arg(long, default_value_t = cloud::artifacts::DEFAULT_ARTIFACT_LIMIT)]
        limit: u32,
        #[arg(long)]
        json: bool,
    },
    /// Print an artifact's content, or write it to a file.
    Show {
        /// Artifact id, as `agi artifacts list` prints it.
        id: String,
        /// Write the content here instead of printing it. A directory takes the
        /// artifact's own name; a path with no extension gains one.
        #[arg(long)]
        out: Option<String>,
        #[arg(long)]
        json: bool,
    },
    /// Open an artifact in the browser: its published page, or the conversation
    /// it was produced in.
    Open {
        /// Artifact id.
        id: String,
        #[arg(long)]
        json: bool,
    },
    /// Publish an artifact to a shareable URL.
    Publish {
        /// Artifact id.
        id: String,
        #[arg(long)]
        json: bool,
    },
    /// Take a published artifact's URL away again.
    Unpublish {
        /// Artifact id.
        id: String,
        /// Skip the confirmation prompt.
        #[arg(long, short = 'y')]
        yes: bool,
        #[arg(long)]
        json: bool,
    },
}

#[derive(Subcommand, Debug)]
enum MemorySubcommand {
    /// List the memories in the account, refreshed from the account.
    List,
    /// Record a memory in the account.
    Add {
        /// What to remember.
        text: Vec<String>,
        /// Optional category label.
        #[arg(long)]
        category: Option<String>,
    },
    /// Remove a memory from the account by id or exact text.
    Forget {
        /// Memory id or its exact text.
        memory: String,
    },
}

#[derive(Subcommand, Debug)]
enum SchedulesSubcommand {
    /// List the account's schedules with status, cadence and next run.
    List {
        /// Maximum number of schedules to return.
        #[arg(long, default_value_t = schedules::DEFAULT_SCHEDULE_LIMIT)]
        limit: u32,
        /// Number of schedules to skip.
        #[arg(long, default_value_t = 0)]
        offset: u32,
        #[arg(long)]
        json: bool,
    },
    /// Create a cron schedule that runs in AGI cloud.
    Create {
        /// Human-readable schedule name.
        #[arg(long)]
        name: String,
        /// 5-field cron expression, for example "0 9 * * *".
        #[arg(long)]
        schedule: String,
        /// Prompt the scheduled agent runs each time it fires.
        #[arg(long)]
        prompt: String,
        /// IANA time zone the cron expression is read in. Defaults to this machine's.
        #[arg(long)]
        timezone: Option<String>,
        /// Model to run it on. Defaults to the account's automatic selection.
        #[arg(long)]
        model: Option<String>,
        /// Optional description stored with the schedule.
        #[arg(long)]
        description: Option<String>,
        /// Create it paused instead of active.
        #[arg(long)]
        paused: bool,
        #[arg(long)]
        json: bool,
    },
    /// Delete a schedule by id or name.
    Delete {
        /// Schedule id, or its exact name.
        id: String,
        /// Skip the confirmation prompt.
        #[arg(long, short = 'y')]
        yes: bool,
        #[arg(long)]
        json: bool,
    },
    /// Show a schedule's run history.
    Runs {
        /// Schedule id, or its exact name.
        id: String,
        /// Maximum number of runs to return.
        #[arg(long, default_value_t = schedules::DEFAULT_RUN_LIMIT)]
        limit: u32,
        /// Number of runs to skip.
        #[arg(long, default_value_t = 0)]
        offset: u32,
        #[arg(long)]
        json: bool,
    },
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
    /// `--force`/`--yes` supplied, proceed without prompting.
    Proceed,
    /// Interactive terminal, ask the user to confirm.
    Prompt,
    /// Neither forced nor interactive, refuse rather than delete blindly.
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
        /// Bypass integrity verification. AUDIT-FIX: H-16, prints a warning to stderr every install.
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
enum McpSubcommand {
    /// Register an MCP server.
    Add {
        /// Registry name for the server.
        name: String,
        /// Executable for a stdio server.
        #[arg(long, value_name = "COMMAND", conflicts_with = "url")]
        command: Option<String>,
        /// Argument for the stdio command, repeat for each argument.
        #[arg(
            long = "arg",
            value_name = "ARG",
            requires = "command",
            allow_hyphen_values = true
        )]
        args: Vec<String>,
        /// URL for a remote server.
        #[arg(long, value_name = "URL")]
        url: Option<String>,
        /// Transport for a remote server.
        #[arg(long, value_enum, default_value_t = RemoteMcpTransport::Http, requires = "url")]
        transport: RemoteMcpTransport,
        /// Replace an existing entry with the same name.
        #[arg(long)]
        force: bool,
    },
    /// List registered MCP servers.
    List,
    /// Show one registered MCP server.
    Get {
        /// Registry name of the server to show.
        name: String,
    },
    /// Authorize a remote MCP server over OAuth and store the token.
    Login {
        /// Registry name of the remote server to authorize.
        name: String,
    },
    /// Forget the stored OAuth token for a remote MCP server.
    Logout {
        /// Registry name of the remote server to sign out of.
        name: String,
    },
    /// Remove a registered MCP server.
    Remove {
        /// Registry name of the server to remove.
        name: String,
    },
}

#[derive(Subcommand, Debug)]
enum HooksSubcommand {
    /// Show every configured hook, plugin-declared ones included.
    List,
    /// Add a hook to an event. The command runs under `sh -c`.
    Add {
        /// Event name, e.g. PreToolUse. `agi hooks add` with an unknown event
        /// lists every event the runner honours.
        event: String,
        /// Shell command to run. Quote it to keep it as one argument.
        command: String,
    },
    /// Remove a hook by its 1-based position under an event.
    Remove {
        /// Event the hook is registered under.
        event: String,
        /// 1-based position, as shown by `agi hooks list`.
        index: usize,
    },
}

/// Transport for a remote MCP server registered with `agi mcp add --url`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
enum RemoteMcpTransport {
    Http,
    Sse,
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

/// The model a resumed conversation continues on.
///
/// A conversation carries the model it was held on, and continuing it on the
/// configured default silently moves the user to a different, often far more
/// expensive, model. The default is the fallback for a session that records no
/// model or one this build no longer knows.
fn resumed_model(managed: Option<&ManagedResumeSession>, fallback: &str) -> String {
    managed
        .and_then(|(session, _)| session.model.as_deref())
        .map(str::trim)
        .filter(|model| !model.is_empty() && model_catalog::find(model).is_some())
        .map(str::to_string)
        .unwrap_or_else(|| fallback.to_string())
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

/// How a structured command renders, resolved from its own `--json` flag and
/// the global `--output-format`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StructuredOutput {
    Text,
    Json,
    Ndjson,
}

pub fn structured_output(json_flag: bool, output: Option<OutputFormat>) -> StructuredOutput {
    match output {
        Some(OutputFormat::Json) => StructuredOutput::Json,
        Some(OutputFormat::StreamJson) => StructuredOutput::Ndjson,
        Some(OutputFormat::Text) => StructuredOutput::Text,
        None if json_flag => StructuredOutput::Json,
        None => StructuredOutput::Text,
    }
}

/// Ask before an account change that cannot be undone, naming what stops
/// working rather than asking "are you sure".
///
/// A non-interactive stdin cannot answer, so it refuses instead of proceeding
/// unasked. `--yes` is how a script says yes.
fn confirm_destructive(prompt: &str, yes: bool) -> bool {
    confirm_destructive_when(
        prompt,
        yes,
        io::stdin().is_terminal() && io::stderr().is_terminal(),
    )
}

fn confirm_destructive_when(prompt: &str, yes: bool, interactive: bool) -> bool {
    match resolve_destructive_decision(yes, interactive) {
        DestructiveDecision::Proceed => true,
        DestructiveDecision::Refuse => {
            output::print_warn(
                "Nothing was deleted: this run cannot ask for confirmation. Re-run with --yes to \
                 confirm non-interactively.",
            );
            false
        }
        DestructiveDecision::Prompt => dialoguer::Confirm::new()
            .with_prompt(prompt)
            .default(false)
            .interact()
            .unwrap_or(false),
    }
}

fn print_structured(value: &serde_json::Value, mode: StructuredOutput) -> Result<()> {
    match (mode, value.as_array()) {
        (StructuredOutput::Ndjson, Some(rows)) => {
            for row in rows {
                println!("{}", serde_json::to_string(row)?);
            }
        }
        (StructuredOutput::Ndjson, None) => println!("{}", serde_json::to_string(value)?),
        _ => println!("{}", serde_json::to_string_pretty(value)?),
    }
    Ok(())
}

/// The privacy boundary the account commands run under. They read and write
/// the account, so Local and BYOK are refused with a message that names the
/// mode rather than failing silently.
///
/// The project's own `.agiworkforce/config.toml` is merged in, because a
/// directory a user marked Local must not reach the account from inside it.
fn account_privacy_mode() -> platform::runtime::session::PrivacyMode {
    let config = config::CliConfig::load_merged()
        .or_else(|_| config::CliConfig::load_without_project())
        .unwrap_or_default();
    config
        .ui
        .privacy_mode
        .as_deref()
        .and_then(platform::runtime::session::PrivacyMode::from_arg)
        .unwrap_or(platform::runtime::session::PrivacyMode::Managed)
}

/// Pull one conversation out of the account and write it into the managed
/// session store, returning the local id the resume path takes.
async fn adopt_hosted_conversation(conversation_id: &str) -> Result<String> {
    let privacy = account_privacy_mode();
    let conversation = cloud::hosted_conversation(privacy, conversation_id)
        .await
        .map_err(|error| anyhow::anyhow!("{error}"))?
        .ok_or_else(|| {
            anyhow::anyhow!("No conversation '{conversation_id}' in your AGI Workforce account")
        })?;

    let messages = conversation
        .messages
        .iter()
        .map(|message| models::Message::text(&message.role, &message.content))
        .collect::<Vec<_>>();
    let conn = sessions::open_db()?;
    sessions::import_hosted_session(
        &conn,
        &conversation.id,
        &conversation.title,
        conversation.model.as_deref(),
        messages,
    )?;
    eprintln!(
        "Resuming '{}' from your account ({} messages).",
        conversation.title,
        conversation.messages.len()
    );
    Ok(conversation.id)
}

/// Print the account's conversations under the device list. A boundary (signed
/// out, Local mode) is stated, never swallowed and never shown as an empty
/// account.
async fn print_hosted_history(limit: usize) {
    let privacy = account_privacy_mode();
    match cloud::hosted_conversations(privacy).await {
        Ok(conversations) if conversations.is_empty() => {
            println!("No conversations in your AGI Workforce account yet.");
        }
        Ok(conversations) => {
            println!("In your AGI Workforce account:");
            for conversation in conversations.iter().take(limit) {
                println!(
                    "  {}  {}  {} messages  {}",
                    conversation.id,
                    conversation.title,
                    conversation.messages.len(),
                    conversation.updated_at
                );
            }
            println!();
            println!("Resume one with `agi resume --cloud <id>`.");
        }
        Err(error) => println!("Account history unavailable: {error}"),
    }
}

/// `agi image "<prompt>"`: one hosted generation, saved where the user asked.
async fn handle_image_command(
    prompt: Option<&str>,
    out: Option<&str>,
    size: Option<&str>,
    quality: Option<&str>,
    count: u8,
    model: Option<&str>,
    list_models: bool,
) -> Result<()> {
    let privacy = account_privacy_mode();

    if list_models {
        let models = cloud::image::image_models(privacy)
            .await
            .map_err(|error| anyhow::anyhow!("{error}"))?;
        if models.is_empty() {
            println!("Your account's catalogue publishes no image models.");
            return Ok(());
        }
        for model in &models {
            println!(
                "{}  {}  {}  {}",
                model.model_id, model.name, model.provider, model.state
            );
        }
        return Ok(());
    }

    let Some(prompt) = prompt.map(str::trim).filter(|prompt| !prompt.is_empty()) else {
        anyhow::bail!("An image needs a prompt: agi image \"a red bicycle\"");
    };

    let options = cloud::image::ImageRequestOptions {
        prompt: prompt.to_string(),
        count,
        size: size.map(str::to_string),
        quality: quality.map(str::to_string),
        model: model.map(str::to_string),
        out: out.map(std::path::PathBuf::from),
    };
    let cwd = std::env::current_dir()?;
    let generation = cloud::image::generate(privacy, &options, &cwd)
        .await
        .map_err(|error| anyhow::anyhow!("{error}"))?;

    for path in &generation.paths {
        println!("{}", path.display());
    }
    output::print_info(&format!("{} via {}", generation.model, generation.provider));
    Ok(())
}

/// Render a structured command's result, honouring the global
/// `--output-format` and the command's own `--json`.
fn render_structured(
    value: serde_json::Value,
    text: String,
    json_flag: bool,
    output: Option<OutputFormat>,
) -> Result<()> {
    match structured_output(json_flag, output) {
        StructuredOutput::Text => {
            println!("{text}");
            Ok(())
        }
        mode => print_structured(&value, mode),
    }
}

async fn handle_projects_command(
    action: &ProjectsSubcommand,
    output: Option<OutputFormat>,
) -> Result<()> {
    let privacy = account_privacy_mode();
    match action {
        ProjectsSubcommand::Delete { project, yes, json } => {
            let cache = cloud::refresh_projects(privacy)
                .await
                .map_err(|error| anyhow::anyhow!("{error}"))?;
            let found = cache.find(project).ok_or_else(|| {
                anyhow::anyhow!("No project '{project}' in your AGI Workforce account")
            })?;
            let (id, name) = (found.id.clone(), found.name.clone());
            if !confirm_destructive(
                &format!(
                    "Delete project '{name}'? Its knowledge files are deleted with it and every \
                     client loses the workspace. Its conversations stay in your history, unfiled. \
                     This cannot be undone."
                ),
                *yes,
            ) {
                println!("Left the project in place.");
                return Ok(());
            }
            cloud::delete_project(privacy, &id)
                .await
                .map_err(|error| anyhow::anyhow!("{error}"))?;
            render_structured(
                serde_json::json!({ "deleted": id, "name": name }),
                format!("Deleted project '{name}' ({id}) from your account."),
                *json,
                output,
            )
        }
        ProjectsSubcommand::Archive {
            project,
            undo,
            json,
        } => {
            let cache = cloud::refresh_projects(privacy)
                .await
                .map_err(|error| anyhow::anyhow!("{error}"))?;
            let found = cache.find(project).ok_or_else(|| {
                anyhow::anyhow!("No project '{project}' in your AGI Workforce account")
            })?;
            let (id, name) = (found.id.clone(), found.name.clone());
            cloud::set_project_archived(privacy, &id, !*undo)
                .await
                .map_err(|error| anyhow::anyhow!("{error}"))?;
            let verb = if *undo { "Unarchived" } else { "Archived" };
            render_structured(
                serde_json::json!({ "id": id, "name": name, "isArchived": !*undo }),
                format!("{verb} '{name}' ({id}) in your account."),
                *json,
                output,
            )
        }
        ProjectsSubcommand::List => {
            let cache = cloud::refresh_projects(privacy)
                .await
                .map_err(|error| anyhow::anyhow!("{error}"))?;
            if cache.projects.is_empty() {
                println!("No projects in your AGI Workforce account.");
                println!("Create one with `agi projects create <name>`.");
                return Ok(());
            }
            for project in &cache.projects {
                let archived = if project.is_archived {
                    "  [archived]"
                } else {
                    ""
                };
                println!("{}  {}{}", project.id, project.name, archived);
                if let Some(description) = project.description.as_deref() {
                    println!("  {description}");
                }
            }
            Ok(())
        }
        ProjectsSubcommand::Create { name, description } => {
            if name.trim().is_empty() {
                anyhow::bail!("A project needs a name");
            }
            let project = cloud::create_project(privacy, name, description.as_deref())
                .await
                .map_err(|error| anyhow::anyhow!("{error}"))?;
            println!(
                "Created '{}' in your account ({}).",
                project.name, project.id
            );
            Ok(())
        }
        ProjectsSubcommand::Link { project } => {
            let cache = cloud::refresh_projects(privacy)
                .await
                .map_err(|error| anyhow::anyhow!("{error}"))?;
            let found = cache.find(project).ok_or_else(|| {
                anyhow::anyhow!("No project '{project}' in your AGI Workforce account")
            })?;
            let cwd = std::env::current_dir()?;
            let home = config::CliConfig::config_dir()?;
            let mut registry = project_registry::ProjectRegistry::load(&home)?;
            registry.link_cloud_project(&cwd, &found.id)?;
            registry.save(&home)?;
            println!(
                "{} is linked to the account project '{}'.",
                cwd.display(),
                found.name
            );
            Ok(())
        }
    }
}

async fn handle_artifacts_command(
    action: &ArtifactsSubcommand,
    output: Option<OutputFormat>,
) -> Result<()> {
    use cloud::artifacts;

    let privacy = account_privacy_mode();
    let client =
        cloud::CloudClient::connect(privacy).map_err(|error| anyhow::anyhow!("{error}"))?;

    match action {
        ArtifactsSubcommand::List {
            project,
            limit,
            json,
        } => {
            let entries = artifacts::list(&client, *limit, project.as_deref())
                .await
                .map_err(|error| anyhow::anyhow!("{error}"))?;
            render_structured(
                serde_json::to_value(&entries)?,
                artifacts::render_index(&entries),
                *json,
                output,
            )
        }
        ArtifactsSubcommand::Show { id, out, json } => {
            let entry = artifacts::resolve(&client, id)
                .await
                .map_err(|error| anyhow::anyhow!("{error}"))?;
            let block = artifacts::content(&client, &entry)
                .await
                .map_err(|error| anyhow::anyhow!("{error}"))?;
            let extension = artifacts::file_extension(
                &entry.artifact_type,
                entry.language.as_deref().or(Some(&block.language)),
            );

            let Some(out) = out else {
                return render_structured(
                    serde_json::json!({
                        "id": entry.id,
                        "title": entry.display_title(),
                        "type": entry.artifact_type,
                        "language": block.language,
                        "content": block.content,
                    }),
                    block.content.clone(),
                    *json,
                    output,
                );
            };

            let cwd = std::env::current_dir()?;
            let path =
                artifacts::output_path(std::path::Path::new(out), &cwd, &entry.id, extension);
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&path, &block.content)?;
            render_structured(
                serde_json::json!({ "id": entry.id, "path": path.to_string_lossy() }),
                format!("{}", path.display()),
                *json,
                output,
            )
        }
        ArtifactsSubcommand::Open { id, json } => {
            let entry = artifacts::resolve(&client, id)
                .await
                .map_err(|error| anyhow::anyhow!("{error}"))?;
            let share_url = artifacts::published_for(&client, &entry.id)
                .await
                .map_err(|error| anyhow::anyhow!("{error}"))?
                .and_then(|published| published.share_url);
            let url = artifacts::browse_url(client.base(), &entry, share_url.as_deref());
            let opened = oauth::open_external_url(&url, oauth::UserActionContext::user_initiated());
            render_structured(
                serde_json::json!({ "id": entry.id, "url": url, "opened": opened }),
                if opened {
                    format!("Opened {url}")
                } else {
                    format!("Open it yourself: {url}")
                },
                *json,
                output,
            )
        }
        ArtifactsSubcommand::Publish { id, json } => {
            let entry = artifacts::resolve(&client, id)
                .await
                .map_err(|error| anyhow::anyhow!("{error}"))?;
            let block = artifacts::content(&client, &entry)
                .await
                .map_err(|error| anyhow::anyhow!("{error}"))?;
            let published = artifacts::publish(&client, &entry, &block)
                .await
                .map_err(|error| anyhow::anyhow!("{error}"))?;
            render_structured(
                serde_json::to_value(&published)?,
                format!(
                    "Published '{}' at {} ({}).",
                    entry.display_title(),
                    published.share_url,
                    published.visibility
                ),
                *json,
                output,
            )
        }
        ArtifactsSubcommand::Unpublish { id, yes, json } => {
            let Some(published) = artifacts::published_for(&client, id)
                .await
                .map_err(|error| anyhow::anyhow!("{error}"))?
            else {
                anyhow::bail!("Artifact '{id}' is not published from your account")
            };
            if !confirm_destructive(
                &format!(
                    "Unpublish artifact {id}? Its link stops working for everyone who has it, and \
                     publishing again mints a different one. This cannot be undone."
                ),
                *yes,
            ) {
                println!("Left the artifact published.");
                return Ok(());
            }
            artifacts::unpublish(&client, &published.token)
                .await
                .map_err(|error| anyhow::anyhow!("{error}"))?;
            render_structured(
                serde_json::json!({ "unpublished": id, "token": published.token }),
                format!("Unpublished artifact {id}. Its share link no longer resolves."),
                *json,
                output,
            )
        }
    }
}

async fn handle_history_command(
    action: &HistorySubcommand,
    output: Option<OutputFormat>,
) -> Result<()> {
    let privacy = account_privacy_mode();
    match action {
        HistorySubcommand::Delete { id, yes, json } => {
            if !confirm_destructive(
                &format!(
                    "Delete conversation {id} from your account? Every signed-in client loses it, \
                     any artifact published out of it is unpublished, and this cannot be undone."
                ),
                *yes,
            ) {
                println!("Left the conversation in place.");
                return Ok(());
            }
            cloud::delete_conversation(privacy, id)
                .await
                .map_err(|error| anyhow::anyhow!("{error}"))?;
            render_structured(
                serde_json::json!({ "deleted": id }),
                format!("Deleted conversation {id} from your account."),
                *json,
                output,
            )
        }
    }
}

async fn handle_memory_command(action: &MemorySubcommand) -> Result<()> {
    let privacy = account_privacy_mode();
    match action {
        MemorySubcommand::List => {
            let cache = cloud::refresh_memory(privacy)
                .await
                .map_err(|error| anyhow::anyhow!("{error}"))?;
            if cache.entries.is_empty() {
                println!("Your AGI Workforce account holds no memories.");
                println!("Add one with `agi memory add <text>`.");
                return Ok(());
            }
            for entry in &cache.entries {
                let pin = if entry.pinned { "*" } else { " " };
                let origin = entry.source.as_deref().unwrap_or("web");
                println!("{pin} {}  [{origin}]", entry.id);
                println!("    {}", entry.content);
            }
            Ok(())
        }
        MemorySubcommand::Add { text, category } => {
            let content = text.join(" ");
            if content.trim().is_empty() {
                anyhow::bail!("Usage: agi memory add <text>");
            }
            let refusals = cloud::add_memory(privacy, &content, category.as_deref())
                .await
                .map_err(|error| anyhow::anyhow!("{error}"))?;
            if refusals.is_empty() {
                println!("Remembered in your account, on every client.");
                return Ok(());
            }
            for refusal in &refusals {
                println!("Not remembered: {refusal}");
            }
            anyhow::bail!("Your account did not store this memory")
        }
        MemorySubcommand::Forget { memory } => {
            cloud::refresh_memory(privacy)
                .await
                .map_err(|error| anyhow::anyhow!("{error}"))?;
            let removed = cloud::forget_memory(privacy, memory)
                .await
                .map_err(|error| anyhow::anyhow!("{error}"))?;
            if removed {
                println!("Forgotten in your account, on every client.");
                Ok(())
            } else {
                anyhow::bail!("No memory '{memory}' in your AGI Workforce account")
            }
        }
    }
}

async fn handle_schedules_command(
    action: &SchedulesSubcommand,
    output: Option<OutputFormat>,
) -> Result<()> {
    let client = match schedules::SchedulesClient::connect() {
        Ok(client) => client,
        Err(error) => {
            eprintln!("{} {}", ts::error_label(), ts::danger(error.to_string()));
            std::process::exit(1);
        }
    };

    let render = |value: serde_json::Value, text: String, json_flag: bool| -> Result<()> {
        match structured_output(json_flag, output) {
            StructuredOutput::Text => {
                println!("{text}");
                Ok(())
            }
            mode => print_structured(&value, mode),
        }
    };

    let result = match action {
        SchedulesSubcommand::List {
            limit,
            offset,
            json,
        } => match client.list(*limit, *offset).await {
            Ok(rows) => render(
                serde_json::to_value(&rows)?,
                schedules::render_schedules(&rows),
                *json,
            ),
            Err(error) => Err(anyhow::anyhow!("{error}")),
        },
        SchedulesSubcommand::Create {
            name,
            schedule,
            prompt,
            timezone,
            model,
            description,
            paused,
            json,
        } => {
            let zone = timezone.clone().unwrap_or_else(schedules::local_timezone);
            let request = schedules::cron_create_request(
                name,
                schedule,
                prompt,
                !*paused,
                &zone,
                model.as_deref(),
                description.as_deref(),
            );
            match client.create(&request).await {
                Ok(created) => render(
                    serde_json::to_value(&created)?,
                    schedules::render_schedules(std::slice::from_ref(&created)),
                    *json,
                ),
                Err(error) => Err(anyhow::anyhow!("{error}")),
            }
        }
        SchedulesSubcommand::Delete { id, yes, json } => match client.resolve_id(id).await {
            Ok(resolved) => {
                if !confirm_destructive(
                    &format!(
                        "Delete schedule {resolved}? It stops firing for every surface and its \
                         run history goes with it. This cannot be undone."
                    ),
                    *yes,
                ) {
                    println!("Left the schedule in place.");
                    return Ok(());
                }
                match client.delete(&resolved).await {
                    Ok(()) => render(
                        serde_json::json!({ "deleted": resolved }),
                        format!("Deleted schedule {resolved}."),
                        *json,
                    ),
                    Err(error) => Err(anyhow::anyhow!("{error}")),
                }
            }
            Err(error) => Err(anyhow::anyhow!("{error}")),
        },
        SchedulesSubcommand::Runs {
            id,
            limit,
            offset,
            json,
        } => {
            let resolved = match client.resolve_id(id).await {
                Ok(resolved) => resolved,
                Err(error) => return schedules_command_failure(error.to_string()),
            };
            match client.runs(&resolved, *limit, *offset).await {
                Ok(rows) => render(
                    serde_json::to_value(&rows)?,
                    schedules::render_runs(&rows),
                    *json,
                ),
                Err(error) => Err(anyhow::anyhow!("{error}")),
            }
        }
    };

    match result {
        Ok(()) => Ok(()),
        Err(error) => schedules_command_failure(error.to_string()),
    }
}

fn schedules_command_failure(message: String) -> Result<()> {
    eprintln!("{} {}", ts::error_label(), ts::danger(message));
    std::process::exit(1);
}

async fn handle_models_command(
    action: &ModelsSubcommand,
    config: &config::CliConfig,
    output: Option<OutputFormat>,
) -> Result<()> {
    match action {
        ModelsSubcommand::List { json } => {
            match structured_output(*json, output) {
                StructuredOutput::Text => println!(
                    "{}",
                    provider::format_model_list_with_discovery(config).await
                ),
                mode => {
                    let value = models_json_with_discovery(config).await;
                    print_structured(&value, mode)?;
                }
            }
            Ok(())
        }
        ModelsSubcommand::Status { json } | ModelsSubcommand::Scan { json } => {
            let probes = local_models::discover_all(config).await;
            match structured_output(*json, output) {
                StructuredOutput::Text => {
                    println!("{}", local_models::format_probe_report(&probes));
                    if matches!(action, ModelsSubcommand::Scan { .. }) {
                        let models = local_models::discovered_models(&probes);
                        println!("\n{}", local_models::format_discovered_models(&models));
                    }
                }
                mode => print_structured(&serde_json::to_value(&probes)?, mode)?,
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

/// The URL of a registered remote MCP server, or an error naming why the
/// OAuth commands do not apply to it.
fn remote_server_url(registry: &crate::mcp::registry::McpRegistry, name: &str) -> Result<String> {
    let Some(row) = registry.list().into_iter().find(|row| row.name == name) else {
        anyhow::bail!(
            "no MCP server named '{}' in the registry",
            terminal_text::sanitize_terminal_text(name)
        )
    };
    if row.kind == "stdio" {
        anyhow::bail!(
            "'{}' is a stdio server; OAuth applies to remote (--url) servers only",
            terminal_text::sanitize_terminal_text(name)
        );
    }
    Ok(row.target)
}

fn run_hooks_command(action: Option<&HooksSubcommand>) -> Result<()> {
    // One implementation for `agi hooks` and the TUI's `/hooks`, so a hook
    // added from either lands in the same file under the same event name.
    let request = match action {
        None | Some(HooksSubcommand::List) => "list".to_string(),
        Some(HooksSubcommand::Add { event, command }) => format!("add {event} {command}"),
        Some(HooksSubcommand::Remove { event, index }) => format!("remove {event} {index}"),
    };
    println!("{}", hooks::apply_hooks_command(&request)?);
    Ok(())
}

/// Print what `agi update --install` will run, ask, then run it.
fn run_update_install(running: &str, release: &update_check::CliRelease, yes: bool) -> Result<()> {
    let plan = update_check::InstallPlan::new(running, release);
    for line in plan.render() {
        println!("{line}");
    }
    if !plan.has_work() {
        return Ok(());
    }
    if !yes {
        let confirmed = dialoguer::Confirm::new()
            .with_prompt(format!("Run `{}` now?", plan.command))
            .default(false)
            .interact()
            .unwrap_or(false);
        if !confirmed {
            println!("Nothing was installed.");
            return Ok(());
        }
    }
    let status = update_check::run_install_command(&plan.command)?;
    if status.success() {
        println!("Installed. Re-run `agi update` to confirm the new version.");
        Ok(())
    } else {
        anyhow::bail!(
            "`{}` exited with {}. {}",
            plan.command,
            status.code().unwrap_or(-1),
            update_check::INSTALL_SIGNING_NOTE
        )
    }
}

async fn run_mcp_registry_command(action: &McpSubcommand) -> Result<()> {
    use crate::mcp::registry::{self, McpRegistry, TransportKind};

    let mut registry_file = McpRegistry::load()?;
    match action {
        McpSubcommand::Add {
            name,
            command,
            args,
            url,
            transport,
            force,
        } => {
            let entry = match (command, url) {
                (Some(command), None) => {
                    registry::build_server_entry(TransportKind::Stdio, command, args)?
                }
                (None, Some(url)) => {
                    let kind = match transport {
                        RemoteMcpTransport::Http => TransportKind::Http,
                        RemoteMcpTransport::Sse => TransportKind::Sse,
                    };
                    registry::build_server_entry(kind, url, &[])?
                }
                _ => anyhow::bail!(
                    "pass either --command <executable> for a stdio server or --url <url> for a remote one"
                ),
            };
            registry_file.add(name, entry, *force)?;
            registry_file.save()?;
            println!(
                "Registered MCP server '{}' in {}.",
                terminal_text::sanitize_terminal_text(name),
                McpRegistry::default_path()?.display()
            );
            Ok(())
        }
        McpSubcommand::List => {
            let rows = registry_file.list();
            if rows.is_empty() {
                println!(
                    "No MCP servers registered in {}.",
                    McpRegistry::default_path()?.display()
                );
                return Ok(());
            }
            for row in rows {
                println!(
                    "{:<24} {:<8} {:<6} {}",
                    terminal_text::sanitize_terminal_text(&row.name),
                    if row.enabled { "enabled" } else { "disabled" },
                    terminal_text::sanitize_terminal_text(&row.kind),
                    terminal_text::sanitize_terminal_text(&row.target)
                );
            }
            Ok(())
        }
        McpSubcommand::Get { name } => {
            // Reads the same `RegistryEntry` rows `list` prints, so the two
            // commands can never describe the same server differently.
            let Some(row) = registry_file
                .list()
                .into_iter()
                .find(|row| &row.name == name)
            else {
                anyhow::bail!(
                    "no MCP server named '{}' in {}. `agi mcp list` shows the registered names.",
                    terminal_text::sanitize_terminal_text(name),
                    McpRegistry::default_path()?.display()
                )
            };
            println!(
                "{:<10} {}",
                "name",
                terminal_text::sanitize_terminal_text(&row.name)
            );
            println!(
                "{:<10} {}",
                "status",
                if row.enabled { "enabled" } else { "disabled" }
            );
            println!(
                "{:<10} {}",
                "transport",
                terminal_text::sanitize_terminal_text(&row.kind)
            );
            println!(
                "{:<10} {}",
                "target",
                terminal_text::sanitize_terminal_text(&row.target)
            );
            println!("{:<10} {}", "file", McpRegistry::default_path()?.display());
            Ok(())
        }
        McpSubcommand::Login { name } => {
            remote_server_url(&registry_file, name)?;
            let entry = registry_file
                .entry(name)
                .cloned()
                .ok_or_else(|| anyhow::anyhow!("no MCP server named '{name}' in the registry"))?;
            let config: crate::mcp::McpServerConfig = serde_json::from_value(entry)
                .with_context(|| format!("registry entry for '{name}' is not a server config"))?;
            crate::mcp::login_to_remote_server(name, &config).await?;
            println!(
                "Authorized MCP server '{}'. The token is stored in the OS credential store.",
                terminal_text::sanitize_terminal_text(name)
            );
            Ok(())
        }
        McpSubcommand::Logout { name } => {
            let url = remote_server_url(&registry_file, name)?;
            let had_token = crate::mcp::logout_from_remote_server(&url)?;
            println!(
                "{} '{}'.",
                if had_token {
                    "Removed the stored OAuth token for"
                } else {
                    "No OAuth token was stored for"
                },
                terminal_text::sanitize_terminal_text(name)
            );
            Ok(())
        }
        McpSubcommand::Remove { name } => {
            let removed = registry_file
                .list()
                .into_iter()
                .find(|row| &row.name == name);
            let Some(removed) = removed else {
                anyhow::bail!("no MCP server named '{name}' in the registry")
            };
            registry_file.remove(name);
            registry_file.save()?;
            println!(
                "Removed MCP server '{}'. Re-add it with: agi mcp add {} {} {}",
                terminal_text::sanitize_terminal_text(name),
                terminal_text::sanitize_terminal_text(name),
                if removed.kind == "stdio" {
                    "--command"
                } else {
                    "--url"
                },
                terminal_text::sanitize_terminal_text(&removed.target)
            );
            Ok(())
        }
    }
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
// Session subcommand handler, replay / branch points
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
                    "  {}  {:>9}  {}",
                    s.session_id.dimmed(),
                    output::format_message_count(s.message_count as i64),
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
                    Err(managed_error) => {
                        load_legacy_session_messages(&session_id).map_err(|legacy_error| {
                            managed_error.context(format!(
                                "Legacy JSON conversation fallback also failed: {legacy_error:#}"
                            ))
                        })?
                    }
                };
            println!(
                "{}: {} messages",
                ts::accent_header(session_id),
                messages.len()
            );
            for (i, msg) in messages.iter().enumerate() {
                let preview: String = msg.text_content().chars().take(120).collect();
                println!(
                    "  [{:>3}] {:<10}  {}",
                    i,
                    msg.role,
                    terminal_text::sanitize_terminal_text(&preview)
                );
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
                    "session '{new_id}' already exists, use --force to overwrite it or choose a different --as name",
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
    // scp-like SSH shorthand: user@host:path, but not an absolute local
    // path that happens to contain a colon-free '@' somewhere.
    if source.contains('@') && source.contains(':') && !source.starts_with('/') {
        return true;
    }
    source.ends_with(".git")
}

/// Main async entry point, called from `main.rs`.
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
    // before ANY session is constructed, including inside the subcommand arms
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
        // `--dump-system-prompt`, those should never block on a TTY prompt.
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
    // Fireworks, etc.). Reserved provider names are ignored, see
    // `models::register_custom_providers`.
    models::register_custom_providers(&app_config);

    // Validate configuration, warn but continue with defaults on failure
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
                // below, without this, `agi --model X exec` silently dropped X
                // and ran the config-default model.
                let raw_model = models::resolve_exec_model(
                    model.as_deref(),
                    cli.model.as_deref(),
                    &app_config.default.model,
                );
                let chain = routing::fallback::FallbackChain::parse(&raw_model)
                    .with_fallback(cli.fallback_model.as_deref());
                let m = chain
                    .head()
                    .map(|s| s.to_string())
                    .unwrap_or(raw_model.clone());
                // Honor an explicit provider: exec-level --provider first, then the
                // top-level --provider, then config. Without this, exec hardcoded
                // None and a local/BYOK model (e.g. `exec --provider ollama`)
                // silently fell back to the default provider (anthropic).
                crate::tier_cache::ensure_plan_models_cached().await;
                let exec_provider_override = models::plan_first_provider_override(
                    &models::AccountRoute::load(),
                    &m,
                    &app_config.default.model,
                    &app_config.default.provider,
                    provider.as_deref().or(cli.provider.as_deref()),
                );
                let mut session = agent::AgentSession::new_checked(
                    &m,
                    &sys_ctx,
                    None,
                    exec_provider_override.as_deref(),
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
                let exec_permissions = normalized_cli_options.effective_permissions(
                    cli.mode,
                    cli.dangerously_skip_permissions,
                    cli.yes,
                    app_config.default.permission_mode.as_deref(),
                );
                session.permission_mode = exec_permissions.mode;
                session.skip_permissions = exec_permissions.skip_permissions || *full_auto;
                session.auto_approve_safe = exec_permissions.auto_approve_safe || *full_auto;
                session.auto_approve_plan = cli.auto_approve_plan;
                if matches!(exec_permissions.mode, cli_options::PermissionMode::Plan) {
                    session.plan_mode = true;
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
                    agent_events::claim_machine_stream(session_id.clone());
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
                    // The repair `finalize_cancelled_turn` just made lives only
                    // in memory, and the turn-end persist never runs on this
                    // path. Without this write the session file ends on a lone
                    // user message, so `agi resume` reopens it with two user
                    // turns in a row. Report and continue: a failed write must
                    // not change the interrupt's exit code.
                    if let Err(error) = session.persist_managed_session() {
                        tracing::warn!("failed to persist the cancelled turn: {error:#}");
                    }
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
                        eprintln!("Interrupted, turn cancelled before completion.");
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
                                // hardcoding 0.0, the ledger is updated by send() internally.
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
                            output::print_assistant_end();
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
                        } else if *json {
                            eprintln!(
                                "{}",
                                serde_json::to_string_pretty(&errors::result_error_json(&e))?
                            );
                        } else {
                            output::print_assistant_end();
                            eprintln!("{}", errors::terminal_text(&e));
                        }
                        exit_with_error(&e);
                    }
                }
            }
            Command::Resume { session_id, cloud } => {
                let resolved_id = match (session_id, cloud) {
                    (Some(id), true) => Some(adopt_hosted_conversation(id).await?),
                    (Some(id), false) => Some(match resolve_resume_payload(id, false) {
                        Ok(_) => id.clone(),
                        Err(local_error) => match adopt_hosted_conversation(id).await {
                            Ok(adopted) => adopted,
                            Err(_) => return Err(local_error),
                        },
                    }),
                    (None, _) => None,
                };
                let (session_label, (messages, managed_session)) = match resolved_id.as_ref() {
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
                let model = resumed_model(managed_session.as_ref(), &app_config.default.model);
                repl::run_repl(
                    &mut app_config,
                    &model,
                    &sys_ctx,
                    None,
                    Some(messages),
                    managed_session,
                    None,
                    false,
                    routing::fallback::FallbackChain::default(),
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
                let model = resumed_model(managed_session.as_ref(), &app_config.default.model);
                repl::run_repl(
                    &mut app_config,
                    &model,
                    &sys_ctx,
                    None,
                    Some(messages),
                    managed_session,
                    None,
                    false,
                    routing::fallback::FallbackChain::default(),
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
            Command::Update {
                check,
                install,
                yes,
            } => {
                let release = update_check::fetch_latest_release().await?;
                let running = update_check::running_version();
                if *install {
                    return run_update_install(running, &release, *yes);
                }
                for line in update_check::render_verdict(
                    running,
                    &release,
                    &update_check::install_command(),
                ) {
                    println!("{line}");
                }
                if *check
                    && update_check::compare_versions(running, &release.version)
                        == update_check::UpdateVerdict::Available
                {
                    std::process::exit(1);
                }
                Ok(())
            }
            Command::Hooks { action } => run_hooks_command(action.as_ref()),
            Command::Mcp { action } => run_mcp_registry_command(action).await,
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
            Command::Models { action } => {
                handle_models_command(action, &app_config, cli.output).await
            }
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
                        // AUDIT-FIX: H-16, supply-chain integrity is required.
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
                            println!(
                                "  {} ({}) [{}]",
                                terminal_text::sanitize_terminal_text(&s.name),
                                terminal_text::sanitize_terminal_text(&s.source),
                                transport
                            );
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
                                "  {}, {} ({} bytes)",
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
                            println!(
                                "  {}, {}",
                                terminal_text::sanitize_terminal_text(&s.name),
                                terminal_text::sanitize_terminal_text(cmd_display)
                            );
                        }
                    }
                    Ok(())
                }
            },

            Command::Migrate { source, dry_run } => {
                let report = match source {
                    MigrationSource::Claude | MigrationSource::ClaudeCode => {
                        ecosystem::migrate_claude_code(*dry_run)?
                    }
                };
                print!("{}", ecosystem::format_claude_migration_report(&report));
                Ok(())
            }

            // --- History ---
            Command::History {
                action: Some(action),
                ..
            } => handle_history_command(action, cli.output).await,
            Command::History {
                action: None,
                limit,
                cloud,
            } => {
                if !cloud {
                    let conn = sessions::open_db()?;
                    let list = sessions::list_sessions(&conn, *limit)?;
                    if list.is_empty() {
                        println!("No sessions on this device.");
                    } else {
                        println!("On this device:");
                        println!("{}", sessions::format_session_list(&list));
                        println!();
                    }
                }
                print_hosted_history(*limit).await;
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
                        println!(
                            "{}",
                            terminal_text::sanitize_terminal_text(
                                &marketplace::format_search_results(&results)
                            )
                        );
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

            // --- Usage ---
            Command::Usage => {
                println!("{}", usage_summary::account_lines().await.join("\n"));
                Ok(())
            }

            // --- Schedules ---
            Command::Schedules { action } => handle_schedules_command(action, cli.output).await,
            Command::Projects { action } => handle_projects_command(action, cli.output).await,
            Command::Artifacts { action } => handle_artifacts_command(action, cli.output).await,
            Command::Memory { action } => handle_memory_command(action).await,
            Command::Image {
                prompt,
                out,
                size,
                quality,
                count,
                model,
                list_models,
            } => {
                handle_image_command(
                    prompt.as_deref(),
                    out.as_deref(),
                    size.as_deref(),
                    quality.as_deref(),
                    *count,
                    model.as_deref(),
                    *list_models,
                )
                .await
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
                    "  {} {}  {}  {}",
                    short_id.dimmed(),
                    title.bold(),
                    output::format_message_count(s.message_count),
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
                    "AGI session expired, run `agi login` (or set AGIWORKFORCE_JWT) to use managed Auto routing."
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
        // have no text yet and land on simple_chat, AgentSession::send then
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
    // above), mirror that here for the interactive/one-shot path so `-m`
    // behaves consistently across `agi exec` and plain `agi`.
    let model_fallback_chain = routing::fallback::FallbackChain::parse(&model)
        .with_fallback(cli.fallback_model.as_deref());
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

    // Read file contents for -f flag, text files and images are handled separately
    let mut file_context_result = read_file_contexts(&cli.files)?;

    if let Some(ref handoff_url) = cli.context_url {
        let handoff = context_handoff::parse_context_handoff_url(handoff_url)?;
        file_context_result
            .text
            .insert_str(0, &handoff.to_prompt_context());
    }

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
    let resolved_permissions = normalized_cli_options.effective_permissions(
        cli.mode,
        cli.dangerously_skip_permissions,
        cli.yes,
        app_config.default.permission_mode.as_deref(),
    );
    let effective_skip_permissions = resolved_permissions.skip_permissions;
    let effective_auto_approve_safe = resolved_permissions.auto_approve_safe;
    let effective_permission_mode: cli_options::PermissionMode = resolved_permissions.mode;
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

    // Seed interactive sessions with the Auto launch state so per-turn
    // re-classification has full continuity (selection, model_key, task,
    // trust, tier), see AgentSession::re_resolve_auto_route_for_turn.
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
            model_fallback_chain.clone(),
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
            model_fallback_chain.clone(),
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

impl ImageAttachment {
    /// The multipart block a pending attachment becomes on the next turn.
    pub fn into_image_block(self) -> models::ContentBlock {
        models::ContentBlock::Image {
            mime: self.mime,
            data_b64: self.data_b64,
        }
    }
}

/// Read, decode and re-encode one image file for a prompt attachment.
///
/// The canonical encoder for every image the CLI attaches: `--file` at launch,
/// `/attach` in the composer, and an `@image.png` mention all land here, so
/// resize bounds and MIME resolution cannot diverge between them. Unlike
/// [`read_file_contexts`] it returns the error instead of exiting, because the
/// interactive paths have to keep the session alive after a bad path.
pub fn load_image_attachment(path: &str) -> Result<ImageAttachment> {
    use agiworkforce_utils_image::{load_for_prompt_bytes, PromptImageMode};
    use base64::Engine as _;

    let bytes = std::fs::read(path).with_context(|| format!("Failed to read image '{path}'"))?;
    let encoded = load_for_prompt_bytes(
        std::path::Path::new(path),
        bytes,
        PromptImageMode::ResizeToFit,
    )
    .with_context(|| format!("Failed to process image '{path}'"))?;
    Ok(ImageAttachment {
        path: path.to_string(),
        mime: encoded.mime,
        data_b64: base64::engine::general_purpose::STANDARD.encode(&encoded.bytes),
    })
}

/// Turn a clipboard bitmap into a prompt attachment through the same encoder.
pub fn clipboard_image_attachment(
    width: u32,
    height: u32,
    rgba: Vec<u8>,
) -> Result<ImageAttachment> {
    use base64::Engine as _;

    let encoded = agiworkforce_utils_image::encode_rgba_for_prompt(width, height, rgba)
        .context("Failed to encode the clipboard image")?;
    Ok(ImageAttachment {
        path: "clipboard".to_string(),
        mime: encoded.mime,
        data_b64: base64::engine::general_purpose::STANDARD.encode(&encoded.bytes),
    })
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
pub(crate) fn is_image_extension(path: &str) -> bool {
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
            match load_image_attachment(path) {
                Ok(attachment) => images.push(attachment),
                Err(e) => {
                    output::print_error(&format!("{e:#}"));
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
/// This is the sessionless half of `attach_mcp_manager_for_session`, it can
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
    crate::tier_cache::ensure_plan_models_cached().await;
    let resolved_provider_override = models::plan_first_provider_override(
        &models::AccountRoute::load(),
        model,
        &config.default.model,
        &config.default.provider,
        provider_override,
    );
    let resolved_provider_override = resolved_provider_override.as_deref();
    agent::AgentSession::prime_account_memory(model, resolved_provider_override).await;
    let mut session = agent::AgentSession::new_checked(
        model,
        sys_context,
        custom_system_prompt,
        resolved_provider_override,
    )?;
    session.apply_ui_config(config);
    session.max_turns = max_turns;
    session.max_budget_usd = max_budget_usd;
    session.skip_permissions = skip_permissions;
    session.auto_approve_safe = auto_approve_safe;
    session.quiet = quiet;
    // `-m model1,model2,...` fallback chain, mirrors the `Exec` subcommand's
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
    // straight from the flag, otherwise a caller that opted out of disk
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
        session.pending_image_blocks = image_attachments
            .into_iter()
            .map(ImageAttachment::into_image_block)
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
        // Pretty-printed single JSON object, non-streaming, for shell users
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
                        crate::design_system::AccessMode::for_provider(&session.provider),
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
                let mut json_out = errors::result_error_json(&e);
                json_out["duration_ms"] = duration_ms.into();
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
                output::print_assistant_end();
            }
            Err(e) => {
                output::print_assistant_end();
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
                        crate::design_system::AccessMode::for_provider(&session.provider),
                    );
                }
            }
            Err(e) => {
                output::print_error(&errors::terminal_text(&e));
                exit_with_error(&e);
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {

    #[test]
    fn a_resumed_conversation_keeps_the_model_it_was_held_on() {
        let mut session = runtime::session::ManagedSession::new(
            "11111111-1111-4111-8111-111111111111".to_string(),
            chrono::Utc::now(),
        );
        let known = model_catalog::default_model().to_string();
        session.model = Some(known.clone());
        let managed = (session, std::path::PathBuf::from("/tmp/session.jsonl"));
        assert_eq!(resumed_model(Some(&managed), "some-other-model"), known);
    }

    #[test]
    fn a_resumed_conversation_with_no_model_falls_back_to_the_default() {
        let session = runtime::session::ManagedSession::new(
            "22222222-2222-4222-8222-222222222222".to_string(),
            chrono::Utc::now(),
        );
        let managed = (session, std::path::PathBuf::from("/tmp/session.jsonl"));
        assert_eq!(
            resumed_model(Some(&managed), "fallback-model"),
            "fallback-model"
        );
        assert_eq!(resumed_model(None, "fallback-model"), "fallback-model");
    }

    #[test]
    fn a_model_this_build_no_longer_knows_falls_back_instead_of_failing() {
        let mut session = runtime::session::ManagedSession::new(
            "33333333-3333-4333-8333-333333333333".to_string(),
            chrono::Utc::now(),
        );
        session.model = Some("a-model-that-was-retired".to_string());
        let managed = (session, std::path::PathBuf::from("/tmp/session.jsonl"));
        assert_eq!(
            resumed_model(Some(&managed), "fallback-model"),
            "fallback-model"
        );
    }
    use super::*;

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
        // -v/--verbose raises the whole crate to debug, the flag now has effect.
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
        // (idempotent, safe even if another test already installed a subscriber).
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
    fn a_non_interactive_run_refuses_an_irreversible_change_it_cannot_ask_about() {
        assert!(
            !confirm_destructive_when("Delete it?", false, false),
            "a piped stdin can never answer the prompt, so the deletion must not proceed"
        );
    }

    #[test]
    fn the_yes_flag_is_how_a_script_answers_the_prompt() {
        assert!(confirm_destructive_when("Delete it?", true, false));
        assert!(confirm_destructive_when("Delete it?", true, true));
    }

    #[test]
    fn the_account_deletion_commands_parse_with_their_confirmation_opt_out() {
        let projects = Cli::try_parse_from(["agi", "projects", "delete", "cli-parity-qa", "--yes"])
            .expect("projects delete parses");
        assert!(matches!(
            projects.command,
            Some(Command::Projects {
                action: ProjectsSubcommand::Delete { yes: true, .. }
            })
        ));

        let history = Cli::try_parse_from(["agi", "history", "delete", "abc", "-y"])
            .expect("history delete parses");
        assert!(matches!(
            history.command,
            Some(Command::History {
                action: Some(HistorySubcommand::Delete { yes: true, .. }),
                ..
            })
        ));

        let listing = Cli::try_parse_from(["agi", "history", "--limit", "5"])
            .expect("the bare history listing still parses");
        assert!(matches!(
            listing.command,
            Some(Command::History {
                action: None,
                limit: 5,
                ..
            })
        ));
    }

    #[test]
    fn the_artifact_commands_parse() {
        for argv in [
            vec!["agi", "artifacts", "list", "--limit", "5"],
            vec!["agi", "artifacts", "show", "abc", "--out", "out.html"],
            vec!["agi", "artifacts", "open", "abc"],
            vec!["agi", "artifacts", "publish", "abc"],
            vec!["agi", "artifacts", "unpublish", "abc", "--yes"],
        ] {
            let parsed = Cli::try_parse_from(argv.clone())
                .unwrap_or_else(|error| panic!("{argv:?} must parse: {error}"));
            assert!(matches!(parsed.command, Some(Command::Artifacts { .. })));
        }
    }

    #[test]
    fn a_command_json_flag_and_the_global_output_format_agree() {
        assert_eq!(structured_output(true, None), StructuredOutput::Json);
        assert_eq!(
            structured_output(false, Some(OutputFormat::Json)),
            StructuredOutput::Json
        );
        assert_eq!(
            structured_output(false, Some(OutputFormat::StreamJson)),
            StructuredOutput::Ndjson
        );
        assert_eq!(structured_output(false, None), StructuredOutput::Text);
    }

    #[test]
    fn an_explicit_text_format_wins_over_a_bare_json_flag() {
        assert_eq!(
            structured_output(true, Some(OutputFormat::Text)),
            StructuredOutput::Text
        );
    }

    #[test]
    fn migrate_rejects_an_unsupported_source_and_names_the_accepted_values() {
        let error = Cli::try_parse_from(["agi", "migrate", "cursor"])
            .expect_err("an unsupported migration source must not parse");
        let rendered = error.to_string();
        assert!(rendered.contains("claude"), "{rendered}");
        assert!(rendered.contains("claude-code"), "{rendered}");
    }

    #[test]
    fn migrate_defaults_to_claude_and_accepts_every_spelling() {
        for (args, expected) in [
            (vec!["agi", "migrate"], MigrationSource::Claude),
            (vec!["agi", "migrate", "claude"], MigrationSource::Claude),
            (
                vec!["agi", "migrate", "claude-code"],
                MigrationSource::ClaudeCode,
            ),
            (
                vec!["agi", "migrate", "claude_code"],
                MigrationSource::ClaudeCode,
            ),
        ] {
            let cli = Cli::try_parse_from(&args).expect("migration source should parse");
            match cli.command {
                Some(Command::Migrate { source, .. }) => assert_eq!(source, expected),
                other => panic!("expected migrate, got {other:?}"),
            }
        }
    }

    #[test]
    fn mcp_add_refuses_a_command_and_a_url_together() {
        Cli::try_parse_from([
            "agi",
            "mcp",
            "add",
            "srv",
            "--command",
            "node",
            "--url",
            "https://example.test",
        ])
        .expect_err("--command and --url are mutually exclusive");
    }

    #[test]
    fn mcp_add_parses_a_stdio_server_with_repeated_arguments() {
        let cli = Cli::try_parse_from([
            "agi",
            "mcp",
            "add",
            "srv",
            "--command",
            "node",
            "--arg",
            "server.js",
            "--arg",
            "--port=1",
        ])
        .expect("stdio registration should parse");
        match cli.command {
            Some(Command::Mcp {
                action:
                    McpSubcommand::Add {
                        name,
                        command,
                        args,
                        url,
                        ..
                    },
            }) => {
                assert_eq!(name, "srv");
                assert_eq!(command.as_deref(), Some("node"));
                assert_eq!(args, vec!["server.js", "--port=1"]);
                assert!(url.is_none());
            }
            other => panic!("expected mcp add, got {other:?}"),
        }
    }

    #[test]
    fn mcp_add_defaults_a_url_server_to_http() {
        let cli =
            Cli::try_parse_from(["agi", "mcp", "add", "srv", "--url", "https://example.test"])
                .expect("remote registration should parse");
        match cli.command {
            Some(Command::Mcp {
                action: McpSubcommand::Add { transport, .. },
            }) => assert_eq!(transport, RemoteMcpTransport::Http),
            other => panic!("expected mcp add, got {other:?}"),
        }
    }

    #[test]
    fn mcp_transport_flag_requires_a_url() {
        Cli::try_parse_from(["agi", "mcp", "add", "srv", "--transport", "sse"])
            .expect_err("--transport without --url must not parse");
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
    fn exec_resolves_the_same_permissions_as_an_interactive_run() {
        use crate::cli_options::{CliOptions, PermissionMode};

        // `agi exec` read only --full-auto, so every one of these was dropped on
        // that path while the interactive path honoured all of them.
        let accept = Cli::try_parse_from([
            "agiworkforce",
            "--permission-mode",
            "acceptEdits",
            "exec",
            "fix bug",
        ])
        .expect("exec with a permission mode should parse");
        let resolved =
            CliOptions::from_cli(&accept).effective_permissions(accept.mode, false, false, None);
        assert_eq!(resolved.mode, PermissionMode::AcceptEdits);
        assert!(resolved.auto_approve_safe);
        assert!(!resolved.skip_permissions);
        assert!(resolved.mode.auto_approves_edits());

        let bypass =
            Cli::try_parse_from(["agiworkforce", "--mode", "bypassPermissions", "exec", "go"])
                .expect("exec with --mode should parse");
        let resolved =
            CliOptions::from_cli(&bypass).effective_permissions(bypass.mode, false, false, None);
        assert!(resolved.skip_permissions);

        let plain = Cli::try_parse_from(["agiworkforce", "exec", "go"]).expect("plain exec parses");
        let options = CliOptions::from_cli(&plain);

        // The persisted default is read when no flag is given, and not when one is.
        let persisted = options.effective_permissions(plain.mode, false, false, Some("plan"));
        assert_eq!(persisted.mode, PermissionMode::Plan);
        assert_eq!(
            options
                .effective_permissions(plain.mode, false, false, None)
                .mode,
            PermissionMode::Default
        );

        // --yes and --dangerously-skip-permissions still stand on their own.
        assert!(
            options
                .effective_permissions(plain.mode, false, true, None)
                .auto_approve_safe
        );
        assert!(
            options
                .effective_permissions(plain.mode, true, false, None)
                .skip_permissions
        );
    }

    #[test]
    fn mode_wins_over_permission_mode_when_both_are_given() {
        use crate::cli_options::{CliOptions, PermissionMode};

        let cli = Cli::try_parse_from([
            "agiworkforce",
            "--permission-mode",
            "acceptEdits",
            "--mode",
            "plan",
            "go",
        ])
        .expect("both flags should parse");
        let resolved = CliOptions::from_cli(&cli).effective_permissions(cli.mode, false, false, None);

        assert_eq!(resolved.mode, PermissionMode::Plan);
        assert!(!resolved.mode.auto_approves_edits());
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
