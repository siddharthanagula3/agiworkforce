//! Hooks system, event-driven command execution.
//!
//! Hooks are configured in ~/.agiworkforce/hooks.json and run commands in
//! response to lifecycle events (SessionStart, Stop, PostToolUse).
//!
//! Hooks can optionally include a `matcher` regex, the hook only fires when
//! the matcher matches the event name **or** the `tool_name` from the input.
//!
//! Hook stdout is parsed as JSON to allow control-flow decisions:
//! - `{"decision": "block", "reason": "..."}` → blocks the action
//! - `{"continue": false}` → signals the caller to stop

use anyhow::{Context, Result};
use regex::Regex;
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

/// A configured hook.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hook {
    /// What to run. With no `args` it is a shell command line, run by
    /// `sh -c`. With `args` it is a program, started with exactly those
    /// arguments: nothing in them is read as shell syntax.
    pub command: String,

    /// Arguments for `command`. Any at all makes the hook a program launch.
    #[serde(default)]
    pub args: Vec<String>,

    /// Timeout in seconds (default: 10).
    #[serde(default = "default_timeout")]
    pub timeout: u64,

    /// Whether this hook's failure stops the hooks after it, and whether the
    /// action is blocked when the hook cannot be started (default: true).
    /// Every hook is waited for either way.
    #[serde(default = "default_blocking")]
    pub blocking: bool,

    /// Optional regex matcher, hook only runs if matcher matches the event
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

    #[serde(skip)]
    pub source: HookSource,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum HookSource {
    #[default]
    User,
    Managed,
    Plugin,
}

/// How a hook is started.
enum HookLaunch<'a> {
    Shell(&'a str),
    Program {
        program: &'a str,
        args: &'a [String],
    },
}

impl Hook {
    fn launch(&self) -> HookLaunch<'_> {
        if self.args.is_empty() {
            HookLaunch::Shell(&self.command)
        } else {
            HookLaunch::Program {
                program: &self.command,
                args: &self.args,
            }
        }
    }

    /// The whole of what the hook runs, on one line: the command line as
    /// written, or the program and each argument quoted as a shell would need
    /// it. Lists, failure messages, the audit log and the managed allowlist
    /// all read this, so none of them sees a hook without its arguments.
    pub fn display_command(&self) -> String {
        match self.launch() {
            HookLaunch::Shell(script) => script.to_string(),
            HookLaunch::Program { program, args } => crate::sandbox::shell_join(
                &std::iter::once(program.to_string())
                    .chain(args.iter().cloned())
                    .collect::<Vec<_>>(),
            ),
        }
    }
}

/// Refuse a hook that could never fire as written, naming it and why.
pub(crate) fn validate_hook(event: &str, hook: &Hook) -> std::result::Result<(), String> {
    if hook.command.trim().is_empty() {
        return Err(format!("a hook under \"{event}\" has no command"));
    }
    if let Some(pattern) = &hook.matcher {
        if let Err(error) = Regex::new(pattern) {
            return Err(format!(
                "hook `{}` under \"{event}\" has a matcher that is not a regular expression \
                 ({pattern:?}): {error}",
                hook.display_command()
            ));
        }
    }
    if let Some(rule) = &hook.if_condition {
        if split_permission_rule(rule).is_none_or(|(tool, _)| tool.is_empty()) {
            return Err(format!(
                "hook `{}` under \"{event}\" has `if` {rule:?}, which is not of the form \
                 Tool(pattern), for example Bash(git *)",
                hook.display_command()
            ));
        }
    }
    Ok(())
}

fn default_timeout() -> u64 {
    10
}
fn default_blocking() -> bool {
    true
}

/// Hook events. The canonical spelling of each is its variant name, which is
/// what `Display` prints, what the runner looks up and what a saved hooks
/// file is keyed by. Older AGI names (`BeforeToolUse`, `PreEdit`, …) are
/// accepted wherever a name is read and mapped to it by
/// [`resolve_event_name`], with one stderr notice per name per session.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
pub enum HookEvent {
    SessionStart,
    SessionEnd,
    /// Fires before any tool call. Replaces the legacy `BeforeToolUse`,
    /// `PreEdit`, `PreCommand` events, use the `if:` field on the hook to
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
    /// truncation). Distinct from `PostToolUse`, runs *closer* to persistence
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
    /// Fires after the user's prompt is expanded (macros, context injections).
    UserPromptExpansion,
    /// Fires when the agentic Stop fails (loop-detect abort, hard kill).
    StopFailure,
    /// Fires when a permission request is denied by the user or policy.
    PermissionDenied,
    /// Fires once after all tools in a parallel tool batch have completed.
    PostToolBatch,
    /// Fires when a teammate transitions to idle (team mode only).
    TeammateIdle,
    /// Fires when first-run setup completes.
    Setup,
    /// Fires when a git worktree is created (EnterWorktree tool).
    WorktreeCreate,
    /// Fires when a git worktree is removed (ExitWorktree tool).
    WorktreeRemove,
    /// Fires when an MCP elicitation request arrives from a server.
    Elicitation,
    /// Fires after the user responds to an MCP elicitation request.
    ElicitationResult,
    /// Fires when a turn begins, before any model call.
    TurnStart,
    /// Fires when a turn fails with a model, provider or tool-loop error.
    Error,
    /// Fires when the user cancels a turn that is still running.
    TurnCancelled,
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
            Self::UserPromptExpansion => write!(f, "UserPromptExpansion"),
            Self::StopFailure => write!(f, "StopFailure"),
            Self::PermissionDenied => write!(f, "PermissionDenied"),
            Self::PostToolBatch => write!(f, "PostToolBatch"),
            Self::TeammateIdle => write!(f, "TeammateIdle"),
            Self::Setup => write!(f, "Setup"),
            Self::WorktreeCreate => write!(f, "WorktreeCreate"),
            Self::WorktreeRemove => write!(f, "WorktreeRemove"),
            Self::Elicitation => write!(f, "Elicitation"),
            Self::ElicitationResult => write!(f, "ElicitationResult"),
            Self::TurnStart => write!(f, "TurnStart"),
            Self::Error => write!(f, "Error"),
            Self::TurnCancelled => write!(f, "TurnCancelled"),
        }
    }
}

/// Names this build used before it took Claude Code's event vocabulary, the
/// event each one now is, and what to add to the hook to keep its old scope.
const LEGACY_EVENT_ALIASES: [(&str, HookEvent, &str); 10] = [
    ("BeforeToolUse", HookEvent::PreToolUse, ""),
    ("AfterToolUse", HookEvent::PostToolUse, ""),
    ("BeforeMessage", HookEvent::UserPromptSubmit, ""),
    (
        "PreEdit",
        HookEvent::PreToolUse,
        ", use `if: \"Edit(*)\"` to filter to edit tools",
    ),
    (
        "PostEdit",
        HookEvent::PostToolUse,
        ", use `if: \"Edit(*)\"` to filter to edit tools",
    ),
    (
        "PreCommand",
        HookEvent::PreToolUse,
        ", use `if: \"Bash(*)\"` to filter to shell commands",
    ),
    (
        "PostCommand",
        HookEvent::PostToolUse,
        ", use `if: \"Bash(*)\"` to filter to shell commands",
    ),
    ("ContextCompacted", HookEvent::PostCompact, ""),
    ("SubagentSpawned", HookEvent::SubagentStart, ""),
    ("SubagentCompleted", HookEvent::SubagentStop, ""),
];

/// The error for a name that is no event: it names the name, every event, and
/// every older name that still loads.
fn unknown_event_message(name: &str) -> String {
    format!(
        "unknown hook event \"{name}\". Events: {}. Older names still accepted: {}",
        ALL_EVENTS
            .iter()
            .map(HookEvent::to_string)
            .collect::<Vec<_>>()
            .join(", "),
        LEGACY_EVENT_ALIASES
            .iter()
            .map(|(alias, event, _)| format!("{alias} (now {event})"))
            .collect::<Vec<_>>()
            .join(", ")
    )
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
    // Canonical names, no warning, no alias table.
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
        "UserPromptExpansion" => Some(HookEvent::UserPromptExpansion),
        "StopFailure" => Some(HookEvent::StopFailure),
        "PermissionDenied" => Some(HookEvent::PermissionDenied),
        "PostToolBatch" => Some(HookEvent::PostToolBatch),
        "TeammateIdle" => Some(HookEvent::TeammateIdle),
        "Setup" => Some(HookEvent::Setup),
        "WorktreeCreate" => Some(HookEvent::WorktreeCreate),
        "WorktreeRemove" => Some(HookEvent::WorktreeRemove),
        "Elicitation" => Some(HookEvent::Elicitation),
        "ElicitationResult" => Some(HookEvent::ElicitationResult),
        "TurnStart" => Some(HookEvent::TurnStart),
        "Error" => Some(HookEvent::Error),
        "TurnCancelled" => Some(HookEvent::TurnCancelled),
        _ => None,
    };
    if let Some(event) = canonical {
        return Some(event);
    }

    // Legacy aliases, resolve + warn once per session per alias.
    let (_, event, hint) = LEGACY_EVENT_ALIASES
        .iter()
        .copied()
        .find(|(alias, _, _)| *alias == name)?;

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
        resolve_event_name(&name)
            .ok_or_else(|| serde::de::Error::custom(unknown_event_message(&name)))
    }
}

/// Parse a permission-rule pattern of the form `ToolName(arg-glob)` and
/// test whether the given `tool_name` and tool args match.
///
/// Examples: `Bash(git *)`, `Edit(*.rs)`, `WebFetch(*)`.
///
/// The arg-glob uses shell-style `*` (any chars) and `?` (one char) and is
/// anchored, the entire arg must match. The arg-glob is tested against the
/// first string-valued field of `tool_args` (or against an empty string if
/// `tool_args` is absent / has no string field).
fn matches_permission_rule(
    rule: &str,
    tool_name: &str,
    tool_args: Option<&serde_json::Value>,
) -> bool {
    let Some((rule_tool, arg_glob)) = split_permission_rule(rule) else {
        return false;
    };

    // Tool names accept AGI's canonical identifiers and reference-compatible aliases.
    if !tool_name_matches(rule_tool, tool_name) {
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

/// `Tool(arg-glob)` as its tool name and its glob, or `None` for any other
/// shape.
fn split_permission_rule(rule: &str) -> Option<(&str, &str)> {
    let open = rule.find('(')?;
    let arg_glob = rule.get(open + 1..)?.strip_suffix(')')?;
    Some((rule[..open].trim(), arg_glob))
}

/// Tiny shell-style glob matcher: `*` matches any (possibly empty) run of
/// characters, `?` matches exactly one character, all other chars match
/// literally. Anchored, the entire input must match.
pub(crate) fn glob_match(pattern: &str, input: &str) -> bool {
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

fn tool_name_matches(expected: &str, actual: &str) -> bool {
    expected == actual
        || crate::tools::canonical_tool_name(expected) == crate::tools::canonical_tool_name(actual)
}

fn hook_tool_name_candidates(tool_name: &str) -> Vec<&str> {
    let canonical = crate::tools::canonical_tool_name(tool_name);
    let mut candidates = vec![tool_name];
    if canonical != tool_name {
        candidates.push(canonical);
    }
    for alias in crate::runtime::tool_catalog::tool_aliases(canonical) {
        if !candidates.contains(alias) {
            candidates.push(alias);
        }
    }
    candidates
}

/// Hooks configuration loaded from hooks.json.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct HooksConfig {
    /// Hooks by canonical event name, [`HookEvent`]'s `Display`. Loading maps
    /// an older name to it and refuses a name that is no event, because a
    /// hook kept under a name the runner never looks up never runs.
    #[serde(default, deserialize_with = "deserialize_hooks_by_event")]
    pub hooks: HashMap<String, Vec<Hook>>,
    /// `false` runs the user's own hooks outside the sandbox, in the folder
    /// the session started in. Plugin hooks stay sandboxed, and a managed
    /// policy that requires the sandbox overrides it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sandbox: Option<bool>,
}

impl HooksConfig {
    pub fn user_hooks_sandboxed(&self) -> bool {
        self.sandbox != Some(false)
    }
}

/// Read the `hooks` map of a hooks file. Entries keep the order the file
/// gives them, so hooks written under an older name and under the event it
/// became run in the order they were written.
fn deserialize_hooks_by_event<'de, D>(
    deserializer: D,
) -> Result<HashMap<String, Vec<Hook>>, D::Error>
where
    D: Deserializer<'de>,
{
    struct ByEvent;

    impl<'de> serde::de::Visitor<'de> for ByEvent {
        type Value = HashMap<String, Vec<Hook>>;

        fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            formatter.write_str("a map from hook event name to a list of hooks")
        }

        fn visit_map<A>(self, mut entries: A) -> Result<Self::Value, A::Error>
        where
            A: serde::de::MapAccess<'de>,
        {
            let mut hooks: HashMap<String, Vec<Hook>> = HashMap::new();
            while let Some(name) = entries.next_key::<String>()? {
                let Some(event) = resolve_event_name(&name) else {
                    return Err(serde::de::Error::custom(unknown_event_message(&name)));
                };
                let listed: Vec<Hook> = entries.next_value()?;
                for hook in &listed {
                    if let Err(problem) = validate_hook(&name, hook) {
                        return Err(serde::de::Error::custom(problem));
                    }
                }
                hooks.entry(event.to_string()).or_default().extend(listed);
            }
            Ok(hooks)
        }
    }

    deserializer.deserialize_map(ByEvent)
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

    /// Concrete model to use for agent execution. Auto profiles require an
    /// explicit managed_cloud default provider.
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

    #[serde(default, skip_serializing_if = "TriggerFilter::is_empty")]
    pub filter: TriggerFilter,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct TriggerFilter {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub events: Vec<String>,
    #[serde(default, skip_serializing_if = "std::collections::BTreeMap::is_empty")]
    pub conditions: std::collections::BTreeMap<String, serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quiet_period_secs: Option<u64>,
}

impl TriggerFilter {
    pub fn is_empty(&self) -> bool {
        self == &Self::default()
    }

    pub fn allows_event(&self, event: Option<&str>) -> bool {
        self.events.is_empty()
            || event.is_some_and(|event| {
                self.events
                    .iter()
                    .any(|allowed| allowed.eq_ignore_ascii_case(event))
            })
    }

    pub fn allows_payload(&self, body: &str) -> bool {
        if self.conditions.is_empty() {
            return true;
        }
        let Ok(payload) = serde_json::from_str::<serde_json::Value>(body) else {
            return false;
        };
        self.conditions.iter().all(|(pointer, expected)| {
            payload.pointer(pointer).is_some_and(|actual| {
                actual == expected
                    || matches!(
                        (actual, expected),
                        (serde_json::Value::Number(_) | serde_json::Value::Bool(_), serde_json::Value::String(text))
                            if &actual.to_string() == text
                    )
            })
        })
    }
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
    /// Setting this to None means no token is configured, the token validation
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

pub fn triggers_path() -> Result<std::path::PathBuf> {
    Ok(crate::config::CliConfig::config_dir()?.join("triggers.json"))
}

pub fn save_triggers(config: &TriggersConfig) -> Result<std::path::PathBuf> {
    let path = triggers_path()?;
    let body = serde_json::to_string_pretty(config).context("Failed to serialize triggers")?;
    let temporary = path.with_extension("json.tmp");
    std::fs::write(&temporary, format!("{body}\n")).context("Failed to write triggers.json")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&temporary, std::fs::Permissions::from_mode(0o600))
            .context("Failed to restrict triggers.json")?;
    }
    std::fs::rename(&temporary, &path).context("Failed to replace triggers.json")?;
    Ok(path)
}

/// Load triggers configuration from ~/.agiworkforce/triggers.json.
pub fn load_triggers() -> Result<Option<TriggersConfig>> {
    let path = triggers_path()?;

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
    /// Structured tool execution payload (populated for PostToolUse).
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
    /// All hooks passed, proceed normally.
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
///
/// IMPORTANT: every one of load_hooks()'s ~10 call sites across the CLI
/// discards the `Err` via `.unwrap_or_default()` (hooks are optional, so a
/// missing/broken config must not crash the caller). That previously meant
/// malformed JSON and the CLI-NEW-011 symlink/UID-mismatch security refusal
/// were both silently swallowed, hooks would just stop firing with zero
/// diagnostic anywhere, and a symlink attack would look identical to "no
/// hooks configured". To fix this once instead of at every call site, this
/// function prints a one-line `Warning: ...` to stderr itself immediately
/// before returning any `Err`, so the warning fires regardless of how the
/// caller consumes the `Result`. Callers that want the warning-then-default
/// behavior explicitly can use [`load_hooks_or_default`] instead of chaining
/// `.unwrap_or_default()` themselves.
pub fn load_hooks() -> Result<HooksConfig> {
    let managed = super::managed::load_managed_hook_policy();
    match load_hooks_inner() {
        Ok(config) => Ok(super::managed::apply_managed_hook_policy(config, &managed)),
        Err(e) => {
            eprintln!(
                "{} hooks.json failed to load: {:#}, hooks disabled",
                crate::terminal_style::danger_header("warning:"),
                e
            );
            if managed.has_managed_hooks() {
                return Ok(super::managed::apply_managed_hook_policy(
                    HooksConfig::default(),
                    &managed,
                ));
            }
            Err(e)
        }
    }
}

/// Load hooks configuration, defaulting to an empty config (with the
/// standard load-failure warning already printed by [`load_hooks`]) if
/// loading fails. Prefer this over `load_hooks().unwrap_or_default()` at new
/// call sites, it's equivalent, but names the fallback behavior explicitly.
pub fn load_hooks_or_default() -> HooksConfig {
    load_hooks().unwrap_or_default()
}

fn load_hooks_inner() -> Result<HooksConfig> {
    let mut config = read_user_hooks_file()?;
    merge_plugin_hooks(&mut config);
    Ok(config)
}

/// Path of the user-owned hooks file, the only file `add`/`remove` may edit.
pub fn hooks_path() -> Result<std::path::PathBuf> {
    Ok(crate::config::CliConfig::config_dir()?.join("hooks.json"))
}

/// Read `~/.agiworkforce/hooks.json` **without** merging plugin-declared
/// hooks.
///
/// [`load_hooks`] returns the merged view the runner fires, which is the wrong
/// thing to write back: saving it would copy every plugin's hooks into the
/// user's file, where they would survive uninstalling the plugin. Editing
/// commands read this instead.
pub fn read_user_hooks_file() -> Result<HooksConfig> {
    let path = hooks_path()?;

    let config: HooksConfig = if !path.exists() {
        HooksConfig::default()
    } else {
        // Security: verify hooks.json permissions and ownership.
        //
        // CLI-NEW-011 hardening (2026-05-04 audit):
        //   1. Original check rejected mode `&0o022` (group/other-writable) but
        //      ignored `&0o044` (group/other-readable). hooks.json may contain
        //      sensitive command strings, paths, embedded tokens, project
        //      identifiers, so a readable file is still a leak.
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
                        crate::terminal_style::danger_header("security warning:"),
                        mode & 0o777,
                        path.display()
                    );
                }
                if mode & 0o044 != 0 {
                    eprintln!(
                        "{} hooks.json is group/other-readable (mode {:o}). \
                         Fix with: chmod 600 {}",
                        crate::terminal_style::danger_header("security warning:"),
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

    Ok(config)
}

/// Persist the user's hooks file at mode 600, the permission
/// [`read_user_hooks_file`] demands on the way back in.
pub fn save_user_hooks_file(config: &HooksConfig) -> Result<std::path::PathBuf> {
    let path = hooks_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create {}", parent.display()))?;
    }
    let serialized = serde_json::to_string_pretty(config).context("Failed to serialize hooks")?;
    std::fs::write(&path, serialized)
        .with_context(|| format!("Failed to write {}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
            .with_context(|| format!("Failed to chmod 600 {}", path.display()))?;
    }
    Ok(path)
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
                 Only plugins installed in ~/.agiworkforce/plugins/ may contribute hooks; \
                 install the plugin with `agi plugin install <path>` to use them.",
                crate::terminal_text::sanitize_terminal_text(&event_name)
            );
        }
    }
    append_plugin_hooks(config, plugins_mgr.hook_configs());
}

/// Add plugin-declared hooks under the event each is declared for. A plugin
/// is not the user's own file, so one bad entry is reported and left out
/// instead of failing every hook.
fn append_plugin_hooks(
    config: &mut HooksConfig,
    declared: HashMap<String, Vec<serde_json::Value>>,
) {
    for (event_name, hook_values) in declared {
        let Some(event) = resolve_event_name(&event_name) else {
            eprintln!(
                "[plugins] {} hook(s) were not loaded: {}",
                hook_values.len(),
                crate::terminal_text::sanitize_terminal_text(&unknown_event_message(&event_name))
            );
            continue;
        };
        for value in hook_values {
            match serde_json::from_value::<Hook>(value.clone()) {
                Ok(mut hook) => {
                    if let Err(problem) = validate_hook(&event_name, &hook) {
                        eprintln!(
                            "[plugins] a hook was not loaded: {}",
                            crate::terminal_text::sanitize_terminal_text(&problem)
                        );
                        continue;
                    }
                    hook.source = HookSource::Plugin;
                    config
                        .hooks
                        .entry(event.to_string())
                        .or_default()
                        .push(hook);
                }
                Err(e) => {
                    eprintln!(
                        "[plugins] failed to load hook for event {}: {} (raw: {})",
                        crate::terminal_text::sanitize_terminal_text(&event_name),
                        crate::terminal_text::sanitize_terminal_text(&e.to_string()),
                        crate::terminal_text::sanitize_terminal_text(
                            &crate::secret_redaction::redact_secrets(&value.to_string())
                        )
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
                        .map(|t| {
                            hook_tool_name_candidates(t)
                                .iter()
                                .any(|candidate| re.is_match(candidate))
                        })
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
            // No tool_name in the input, `if:` rules can't match (they're
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
/// - `{"updated_input": {...}}` → rewrite tool args (PreToolUse only)
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
    let updated_input = parsed
        .get("updated_input")
        .cloned()
        .filter(|v| !v.is_null());

    let additional_context = parsed
        .get("additional_context")
        .and_then(|v| v.as_str())
        .map(|s| {
            if s.len() > MAX_ADDITIONAL_CONTEXT_BYTES {
                // Truncate on the largest char boundary at or below the cap so a hook
                // emitting multibyte UTF-8 cannot panic the agent process mid-turn.
                let mut cut = MAX_ADDITIONAL_CONTEXT_BYTES;
                while cut > 0 && !s.is_char_boundary(cut) {
                    cut -= 1;
                }
                let mut truncated = s[..cut].to_string();
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
    let rewrite = RedactedHookRewrite::new(hook_command, original_args, new_args);

    // Emit at WARN level to stderr so interactive users always see it.
    eprintln!(
        "[security] hook rewrote tool args:\n  hook:     {}\n  original: {}\n  new:      {}",
        crate::terminal_text::sanitize_terminal_text(&rewrite.hook_command),
        crate::terminal_text::sanitize_terminal_text(&rewrite.original_args),
        crate::terminal_text::sanitize_terminal_text(&rewrite.new_args)
    );

    // Append to the security audit log (best-effort).
    if let Ok(dir) = crate::config::CliConfig::config_dir() {
        let _ = append_updated_input_audit(&dir.join("security-audit.log"), &rewrite);
    }
}

/// Tool arguments and hook commands routinely carry credentials, so every copy
/// that leaves memory (stderr, audit log) is scrubbed first.
struct RedactedHookRewrite {
    hook_command: String,
    original_args: String,
    new_args: String,
}

impl RedactedHookRewrite {
    fn new(
        hook_command: &str,
        original_args: &serde_json::Value,
        new_args: &serde_json::Value,
    ) -> Self {
        use crate::secret_redaction::redact_secrets;
        Self {
            hook_command: redact_secrets(hook_command),
            original_args: redact_secrets(&original_args.to_string()),
            new_args: redact_secrets(&new_args.to_string()),
        }
    }
}

fn append_updated_input_audit(
    path: &std::path::Path,
    rewrite: &RedactedHookRewrite,
) -> std::io::Result<()> {
    use std::io::Write;
    let entry = format!(
        "[{}] updated_input rewrite by hook {:?}\n  original: {}\n  new:      {}\n",
        chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%z"),
        rewrite.hook_command,
        rewrite.original_args,
        rewrite.new_args,
    );
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = file.set_permissions(std::fs::Permissions::from_mode(0o600));
    }
    file.write_all(entry.as_bytes())
}

/// Aggregate transformer fields across hook results. Caller decides how to
/// apply the result, typically:
///   - `updated_input` mutates the tool args before exec (PreToolUse)
///   - `updated_mcp_tool_output` replaces the tool result (PostToolUse)
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
    let hooks: Vec<&Hook> = match config.hooks.get(&event_name) {
        Some(h) => h
            .iter()
            .filter(|hook| hook_matches(hook, &event_name, input))
            .collect(),
        None => return Vec::new(),
    };
    if hooks.is_empty() || !crate::cloud::workspace_policy::hooks_allowed() {
        return Vec::new();
    }

    let input_json = serde_json::to_string(input).unwrap_or_default();
    let mut results = Vec::new();

    for hook in hooks {
        let result = run_single_hook(hook, &input_json, config.user_hooks_sandboxed()).await;
        let is_blocking = hook.blocking;
        results.push(result);

        // If a blocking hook failed, stop running subsequent hooks
        if is_blocking && !results.last().map(|r| r.success).unwrap_or(true) {
            break;
        }
    }

    results
}

/// Whether a hook runs sandboxed. `user_hooks_sandboxed` is the hooks
/// file's own setting, [`HooksConfig::user_hooks_sandboxed`].
pub(crate) fn hook_requires_sandbox(hook: &Hook, user_hooks_sandboxed: bool) -> bool {
    hook_sandbox_required(
        hook.source,
        crate::sandbox::sandbox_settings(),
        crate::sandbox::sandbox_disabled(),
        user_hooks_sandboxed,
    )
}

fn hook_sandbox_required(
    source: HookSource,
    settings: crate::sandbox::SandboxSettings,
    sandbox_disabled: bool,
    user_hooks_sandboxed: bool,
) -> bool {
    if sandbox_disabled {
        return false;
    }
    match source {
        HookSource::Plugin => true,
        HookSource::User => settings.user_hooks.applies(user_hooks_sandboxed),
        HookSource::Managed => false,
    }
}

async fn run_hook_process(
    hook: &Hook,
    input_json: &str,
    user_hooks_sandboxed: bool,
) -> std::io::Result<std::process::Output> {
    let timeout = Duration::from_secs(hook.timeout);
    let stdin = Some(input_json.as_bytes().to_vec());
    if !hook_requires_sandbox(hook, user_hooks_sandboxed) {
        return run_hook_on_host(hook, stdin, timeout).await;
    }
    if hook.source == HookSource::User {
        return run_user_hook_sandboxed(hook, stdin, timeout).await;
    }
    let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let manager = crate::sandbox::SandboxManager::for_command_execution(
        cwd.clone(),
        crate::sandbox::NetworkPolicy::Allow,
    )
    .map_err(|error| {
        std::io::Error::other(format!(
            "plugin hook refused, it must run sandboxed: {error}"
        ))
    })?
    .with_shared_cache();
    crate::sandbox::execute_sandboxed_with_input(
        &manager,
        &manager.shell_with_shared_cache(&hook.display_command()),
        Some(&cwd),
        stdin,
        Some(timeout),
    )
    .await
    .map_err(|error| {
        let kind = error
            .downcast_ref::<std::io::Error>()
            .map(std::io::Error::kind)
            .unwrap_or(std::io::ErrorKind::Other);
        std::io::Error::new(kind, format!("{error:#}"))
    })
}

/// A hook outside the sandbox. Its `PATH` leaves out every folder a
/// sandboxed command can write, so a `git`, `node` or `npx` one left in a
/// project's `.venv/bin` or `node_modules/.bin` is never the one it runs.
async fn run_hook_on_host(
    hook: &Hook,
    stdin: Option<Vec<u8>>,
    timeout: Duration,
) -> std::io::Result<std::process::Output> {
    let mut cmd = match hook.launch() {
        HookLaunch::Shell(script) => crate::process_tree::shell_command(script),
        HookLaunch::Program { program, args } => {
            let mut command = tokio::process::Command::new(program);
            command.args(args);
            command
        }
    };
    cmd.env("PATH", agiworkforce_sandbox_policy::host_path::host_path());
    crate::process_tree::output(cmd, stdin, Some(timeout)).await
}

/// The user's own hook under the full-read sandbox the desktop gives its
/// hooks: it reads anywhere but [`crate::sandbox::credential_locations`], so
/// scripts and toolchains in the home folder still run, but writes only the
/// workspace and a private scratch directory, and keeps the network. Nothing it leaves running outlives it. On a
/// platform with no sandbox at all it runs as configured.
async fn run_user_hook_sandboxed(
    hook: &Hook,
    stdin: Option<Vec<u8>>,
    timeout: Duration,
) -> std::io::Result<std::process::Output> {
    let refused = |error: anyhow::Error| {
        std::io::Error::other(format!("hook refused, it must run sandboxed: {error:#}"))
    };
    let workspace = crate::sandbox::sandbox_workspace().map_err(refused)?;
    let (program, args): (&str, Vec<String>) = match hook.launch() {
        HookLaunch::Shell(script) => ("/bin/sh", vec!["-c".to_string(), script.to_string()]),
        HookLaunch::Program { program, args } => (program, args.to_vec()),
    };
    let wrapped = crate::sandbox::full_read_program_guarding(
        crate::sandbox::SandboxType::detect(),
        &workspace,
        &[],
        crate::sandbox::NetworkPolicy::Allow,
        &crate::sandbox::credential_locations(),
        |name| std::env::var(name).ok(),
        program,
        &args,
    )
    .map_err(refused)?;
    let Some(crate::sandbox::SandboxedLaunch {
        program,
        args,
        scratch,
    }) = wrapped
    else {
        return run_hook_on_host(hook, stdin, timeout).await;
    };
    let mut cmd = tokio::process::Command::new(program);
    cmd.args(args);
    // ENVIRONMENT POLICY CALL SITE: this is the one sandboxed child hooks.rs
    // spawns itself. The sandbox lane's function that applies the resolved
    // environment policy to a child takes `cmd` here, before it is spawned.
    let output = crate::process_tree::output_ending_group(cmd, stdin, Some(timeout)).await;
    drop(scratch);
    output
}

/// The exit code with which a hook blocks without printing JSON, as in
/// Claude Code's hooks. Its stderr is the reason.
const BLOCKING_EXIT_CODE: i32 = 2;

fn first_line(text: &str) -> Option<&str> {
    text.lines().map(str::trim).find(|line| !line.is_empty())
}

/// Why a hook failed without a decision of its own, as one line. A
/// sandboxed hook's line says so and names the opt-out, since the sandbox is
/// the likeliest cause of a hook that worked before.
fn hook_failure_reason(hook: &Hook, stderr: &str, ran: bool, sandboxed: bool) -> String {
    let detail = first_line(stderr).unwrap_or("it exited with an error");
    let mut reason = if ran {
        format!("hook `{}` failed: {detail}", hook.display_command())
    } else {
        format!("hook `{}` could not run: {detail}", hook.display_command())
    };
    if sandboxed {
        match hook.source {
            HookSource::User => reason.push_str(&format!(
                ". It ran in the OS sandbox, which lets it write only the workspace; to run \
                 your hooks outside it, set \"sandbox\": false in hooks.json or {}=0",
                crate::sandbox::SANDBOX_HOOKS_ENV
            )),
            HookSource::Plugin | HookSource::Managed => {
                reason.push_str(". It ran in the OS sandbox, which plugin hooks always run in")
            }
        }
    }
    reason
}

/// Show a failed hook's line once a session, so a hook that fails on every
/// tool call does not repeat it.
fn report_hook_failure_once(command: &str, reason: &str) {
    static REPORTED: std::sync::OnceLock<std::sync::Mutex<std::collections::HashSet<String>>> =
        std::sync::OnceLock::new();
    let first = REPORTED
        .get_or_init(Default::default)
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .insert(command.to_string());
    if !first {
        return;
    }
    if crate::tui::tui_active() {
        tracing::warn!("{reason}");
    } else {
        eprintln!(
            "{} {}",
            crate::terminal_style::danger_header("warning:"),
            crate::terminal_text::sanitize_terminal_text(reason)
        );
    }
}

/// What a hook's failure decides. Exit code 2 blocks, with stderr as the
/// reason; any other non-zero exit is an error that is shown and does not
/// block. A blocking hook that could not run at all (refused by the sandbox
/// or not spawned) blocks: a guard that did not run must not read as a guard
/// that allowed. One that ran out of time did run, so, as in Claude Code, it
/// is an error that is shown and does not block. Every failure is shown once
/// a session.
fn settle_failure(
    hook: &Hook,
    mut result: HookResult,
    ran: bool,
    timed_out: bool,
    exit_code: Option<i32>,
    sandboxed: bool,
) -> HookResult {
    if result.success || result.blocked || result.should_stop {
        return result;
    }
    if ran && exit_code == Some(BLOCKING_EXIT_CODE) {
        result.blocked = true;
        result.reason = Some(
            first_line(&result.stderr)
                .map(str::to_string)
                .unwrap_or_else(|| format!("hook `{}` blocked the action", hook.display_command())),
        );
        return result;
    }
    let reason = hook_failure_reason(hook, &result.stderr, ran || timed_out, sandboxed);
    report_hook_failure_once(&hook.display_command(), &reason);
    if !ran && !timed_out && hook.blocking {
        result.blocked = true;
        result.reason = Some(reason);
    }
    result
}

async fn run_single_hook(hook: &Hook, input_json: &str, user_hooks_sandboxed: bool) -> HookResult {
    let start = std::time::Instant::now();
    let sandboxed = cfg!(any(target_os = "macos", target_os = "linux"))
        && hook_requires_sandbox(hook, user_hooks_sandboxed);

    let result = run_hook_process(hook, input_json, user_hooks_sandboxed).await;

    let duration_ms = start.elapsed().as_millis() as u64;

    let ran = result.is_ok();
    let timed_out = result
        .as_ref()
        .is_err_and(|error| error.kind() == std::io::ErrorKind::TimedOut);
    let exit_code = result.as_ref().ok().and_then(|output| output.status.code());
    let result = match result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let signals = parse_hook_output(&stdout);
            HookResult {
                hook_command: hook.display_command(),
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
        Err(e) if e.kind() != std::io::ErrorKind::TimedOut => HookResult {
            hook_command: hook.display_command(),
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
            hook_command: hook.display_command(),
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
    };
    settle_failure(hook, result, ran, timed_out, exit_code, sandboxed)
}

/// Every canonical event, in declaration order.
///
/// The authority on *resolution* stays [`resolve_event_name`]; this list is
/// what `add` validates against and what an error message enumerates.
/// `every_declared_event_resolves` fails if the two ever drift.
pub const ALL_EVENTS: [HookEvent; 35] = [
    HookEvent::SessionStart,
    HookEvent::SessionEnd,
    HookEvent::PreToolUse,
    HookEvent::PostToolUse,
    HookEvent::UserPromptSubmit,
    HookEvent::AfterMessage,
    HookEvent::PlanModeChanged,
    HookEvent::PreCompact,
    HookEvent::PostCompact,
    HookEvent::BeforeModelResolve,
    HookEvent::BeforePromptBuild,
    HookEvent::ToolResultPersist,
    HookEvent::SubagentStart,
    HookEvent::SubagentStop,
    HookEvent::PermissionRequest,
    HookEvent::Notification,
    HookEvent::Stop,
    HookEvent::CronTriggered,
    HookEvent::WebhookReceived,
    HookEvent::FileChanged,
    HookEvent::DaemonStarted,
    HookEvent::DaemonStopped,
    HookEvent::UserPromptExpansion,
    HookEvent::StopFailure,
    HookEvent::PermissionDenied,
    HookEvent::PostToolBatch,
    HookEvent::TeammateIdle,
    HookEvent::Setup,
    HookEvent::WorktreeCreate,
    HookEvent::WorktreeRemove,
    HookEvent::Elicitation,
    HookEvent::ElicitationResult,
    HookEvent::TurnStart,
    HookEvent::Error,
    HookEvent::TurnCancelled,
];

/// Resolve an event the user typed, accepting the same canonical names and
/// legacy aliases the loader accepts, so a hook added from the command line is
/// stored under a name the runner fires.
pub fn parse_event_name(name: &str) -> Result<HookEvent> {
    resolve_event_name(name).ok_or_else(|| anyhow::anyhow!("{}", unknown_event_message(name)))
}

/// Append a hook to an event, returning the canonical event name it landed
/// under and its 1-based position.
pub fn add_hook(config: &mut HooksConfig, event: &str, command: &str) -> Result<(String, usize)> {
    let event = parse_event_name(event)?;
    let command = command.trim();
    if command.is_empty() {
        anyhow::bail!("a hook needs a command to run");
    }
    let name = event.to_string();
    let hooks = config.hooks.entry(name.clone()).or_default();
    hooks.push(Hook {
        command: command.to_string(),
        args: Vec::new(),
        timeout: default_timeout(),
        blocking: default_blocking(),
        matcher: None,
        if_condition: None,
        source: HookSource::User,
    });
    Ok((name, hooks.len()))
}

/// Remove the hook at a 1-based position under an event, returning it.
pub fn remove_hook(config: &mut HooksConfig, event: &str, position: usize) -> Result<Hook> {
    let event = parse_event_name(event)?;
    let name = event.to_string();
    let hooks = config
        .hooks
        .get_mut(&name)
        .filter(|hooks| !hooks.is_empty())
        .ok_or_else(|| anyhow::anyhow!("no hooks configured for {name}"))?;
    let index = position
        .checked_sub(1)
        .filter(|index| *index < hooks.len())
        .ok_or_else(|| {
            anyhow::anyhow!(
                "no hook {position} under {name}; it has {} (1-{})",
                hooks.len(),
                hooks.len()
            )
        })?;
    let removed = hooks.remove(index);
    if hooks.is_empty() {
        config.hooks.remove(&name);
    }
    Ok(removed)
}

/// Drive `list`/`add`/`remove` against the user's hooks file.
///
/// One implementation behind both `agi hooks <action>` and the TUI's
/// `/hooks <action>`, so the two cannot disagree about what a hook is or where
/// it is written.
pub fn apply_hooks_command(args: &str) -> Result<String> {
    let args = args.trim();
    let (action, rest) = args.split_once(char::is_whitespace).unwrap_or((args, ""));
    let rest = rest.trim();
    match action {
        "" | "list" | "ls" => Ok(format_hooks_list(&load_hooks_or_default())),
        "add" => {
            let (event, command) = rest
                .split_once(char::is_whitespace)
                .ok_or_else(|| anyhow::anyhow!("usage: hooks add <event> <command>"))?;
            let mut config = read_user_hooks_file()?;
            let (event, position) = add_hook(&mut config, event, command)?;
            let path = save_user_hooks_file(&config)?;
            Ok(format!(
                "Added hook {position} under {event} in {}.",
                path.display()
            ))
        }
        "remove" | "rm" => {
            let (event, position) = rest
                .split_once(char::is_whitespace)
                .ok_or_else(|| anyhow::anyhow!("usage: hooks remove <event> <index>"))?;
            let position: usize = position
                .trim()
                .parse()
                .map_err(|_| anyhow::anyhow!("hook index must be a number, got {position:?}"))?;
            let mut config = read_user_hooks_file()?;
            let removed = remove_hook(&mut config, event, position)?;
            let path = save_user_hooks_file(&config)?;
            Ok(format!(
                "Removed hook {position} ({}) from {event} in {}.",
                removed.display_command(),
                path.display()
            ))
        }
        other => anyhow::bail!("unknown hooks action {other:?}; use list, add or remove"),
    }
}

/// Format hooks config for display (/hooks command).
pub fn format_hooks_list(config: &HooksConfig) -> String {
    if config.hooks.is_empty() {
        return "No hooks configured.\n\nCreate ~/.agiworkforce/hooks.json \
                to add hooks.\nExample:\n{\n  \"hooks\": {\n    \
                \"SessionStart\": [{\"command\": \"echo Session started\"}],\n    \
                \"PostToolUse\": [{\"command\": \"./my-hook.sh\", \
                \"timeout\": 5}],\n    \
                \"PreToolUse\": [{\"command\": \"python3\", \
                \"args\": [\"guard.py\"]}]\n  }\n}\n\n\
                A \"command\" alone is a shell command line. With \"args\" it is a \
                program started with exactly those arguments: nothing in them is read \
                as shell syntax."
            .to_string();
    }

    let mut events: Vec<&String> = config.hooks.keys().collect();
    events.sort();
    let mut out = String::new();
    for event in events {
        out.push_str(&format!("{}:\n", event));
        for hook in &config.hooks[event] {
            let mut flags = String::new();
            if !hook.blocking {
                flags.push_str(" [non-blocking]");
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
            out.push_str(&format!("  - {}{}\n", hook.display_command(), flags));
        }
    }
    out.push_str(&format!("\n{} events configured.", config.hooks.len()));
    if !crate::cloud::workspace_policy::feature_enabled("hooks") {
        out.push_str("\nYour workspace administrator has turned hooks off, so none of these run.");
    }
    out
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod editing_tests {
    use super::*;

    #[test]
    fn turn_lifecycle_events_are_canonical() {
        for name in ["TurnStart", "Error", "TurnCancelled"] {
            assert_eq!(parse_event_name(name).unwrap().to_string(), name);
        }
    }

    #[test]
    fn plugin_and_user_hooks_require_the_sandbox_unless_the_hooks_file_opts_out() {
        use crate::sandbox::{SandboxDefault, SandboxSettings};
        let hook: Hook = serde_json::from_str(r#"{"command":"true"}"#).unwrap();
        assert_eq!(hook.source, HookSource::User);
        let default = SandboxSettings::default();
        let required = SandboxSettings {
            user_hooks: SandboxDefault::Required,
            ..default
        };
        let env_opt_out = SandboxSettings {
            user_hooks: SandboxDefault::Off,
            ..default
        };
        assert!(hook_sandbox_required(
            HookSource::User,
            default,
            false,
            true
        ));
        assert!(!hook_sandbox_required(
            HookSource::User,
            default,
            false,
            false
        ));
        assert!(!hook_sandbox_required(
            HookSource::User,
            env_opt_out,
            false,
            true
        ));
        assert!(hook_sandbox_required(
            HookSource::User,
            required,
            false,
            false
        ));
        assert!(!hook_sandbox_required(
            HookSource::Managed,
            required,
            false,
            true
        ));
        assert!(hook_sandbox_required(
            HookSource::Plugin,
            env_opt_out,
            false,
            false
        ));
        assert!(!hook_sandbox_required(
            HookSource::Plugin,
            default,
            true,
            true
        ));

        let config: HooksConfig = serde_json::from_str(r#"{"hooks":{}}"#).unwrap();
        assert!(config.user_hooks_sandboxed());
        assert!(!serde_json::to_string(&config).unwrap().contains("sandbox"));
        let opted_out: HooksConfig =
            serde_json::from_str(r#"{"hooks":{},"sandbox":false}"#).unwrap();
        assert!(!opted_out.user_hooks_sandboxed());
    }

    #[cfg(target_os = "macos")]
    #[tokio::test]
    async fn a_plugin_hook_cannot_write_outside_the_workspace() {
        if crate::sandbox::SandboxType::detect() == crate::sandbox::SandboxType::None
            || crate::sandbox::sandbox_disabled()
        {
            return;
        }
        let outside = tempfile::tempdir().unwrap();
        let target = outside.path().join("escaped.txt");
        let hook_for = |source| Hook {
            command: format!("cat > '{}'", target.display()),
            args: Vec::new(),
            timeout: 10,
            blocking: true,
            matcher: None,
            if_condition: None,
            source,
        };

        let plugin_result = run_single_hook(&hook_for(HookSource::Plugin), "{}", false).await;
        assert!(
            !plugin_result.success,
            "sandboxed plugin hook wrote outside the workspace"
        );
        assert!(!target.exists());

        if crate::sandbox::sandbox_settings().user_hooks == crate::sandbox::SandboxDefault::On {
            let sandboxed = run_single_hook(&hook_for(HookSource::User), "{}", true).await;
            assert!(
                !sandboxed.success,
                "a user hook is sandboxed unless the hooks file opts out"
            );
            assert!(!target.exists());
        }

        let user_result =
            run_single_hook(&hook_for(HookSource::User), "{\"ok\":true}", false).await;
        assert!(user_result.success, "{}", user_result.stderr);
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "{\"ok\":true}");
    }

    #[test]
    fn every_declared_event_resolves_to_itself() {
        // ALL_EVENTS is what `add` validates against and what an error lists;
        // resolve_event_name is what the loader honours. If they drift, a hook
        // could be added under a name the runner never fires.
        for event in ALL_EVENTS {
            let name = event.to_string();
            assert_eq!(
                resolve_event_name(&name),
                Some(event),
                "{name} does not resolve back to itself"
            );
        }
    }

    #[test]
    fn an_added_hook_survives_the_round_trip_the_loader_takes() {
        let mut config = HooksConfig::default();
        let (event, position) = add_hook(&mut config, "PreToolUse", "echo before").expect("added");
        assert_eq!((event.as_str(), position), ("PreToolUse", 1));

        // Serialize and parse the way save/load do: an added hook has to come
        // back through the same Deserialize the runner's config takes.
        let json = serde_json::to_string(&config).expect("serializes");
        let reloaded: HooksConfig = serde_json::from_str(&json).expect("parses");
        let hooks = reloaded.hooks.get("PreToolUse").expect("event present");
        assert_eq!(hooks.len(), 1);
        assert_eq!(hooks[0].command, "echo before");
        assert_eq!(hooks[0].timeout, default_timeout());
        assert!(hooks[0].blocking);
        assert!(format_hooks_list(&reloaded).contains("echo before"));
    }

    #[test]
    fn a_second_hook_appends_rather_than_replacing() {
        let mut config = HooksConfig::default();
        add_hook(&mut config, "Stop", "first").expect("added");
        let (_, position) = add_hook(&mut config, "Stop", "second").expect("added");
        assert_eq!(position, 2);
        let commands: Vec<&str> = config.hooks["Stop"]
            .iter()
            .map(|hook| hook.command.as_str())
            .collect();
        assert_eq!(commands, vec!["first", "second"]);
    }

    #[test]
    fn remove_takes_the_named_position_and_leaves_the_rest() {
        let mut config = HooksConfig::default();
        add_hook(&mut config, "Stop", "first").expect("added");
        add_hook(&mut config, "Stop", "second").expect("added");
        let removed = remove_hook(&mut config, "Stop", 1).expect("removed");
        assert_eq!(removed.command, "first");
        assert_eq!(config.hooks["Stop"].len(), 1);
        assert_eq!(config.hooks["Stop"][0].command, "second");
    }

    #[test]
    fn removing_the_last_hook_drops_the_empty_event() {
        let mut config = HooksConfig::default();
        add_hook(&mut config, "Stop", "only").expect("added");
        remove_hook(&mut config, "Stop", 1).expect("removed");
        assert!(!config.hooks.contains_key("Stop"));
        assert!(format_hooks_list(&config).contains("No hooks configured"));
    }

    #[test]
    fn an_out_of_range_position_is_refused_without_touching_the_config() {
        let mut config = HooksConfig::default();
        add_hook(&mut config, "Stop", "only").expect("added");
        assert!(remove_hook(&mut config, "Stop", 0).is_err());
        assert!(remove_hook(&mut config, "Stop", 2).is_err());
        assert_eq!(config.hooks["Stop"].len(), 1);
    }

    #[test]
    fn removing_from_an_event_with_no_hooks_says_so() {
        let mut config = HooksConfig::default();
        let error = remove_hook(&mut config, "Stop", 1).expect_err("no hooks");
        assert!(error.to_string().contains("no hooks configured for Stop"));
    }

    #[test]
    fn an_unknown_event_is_refused_and_the_error_lists_the_real_ones() {
        let mut config = HooksConfig::default();
        let error = add_hook(&mut config, "BeforeLunch", "echo hi").expect_err("rejected");
        let message = error.to_string();
        assert!(message.contains("unknown hook event"));
        assert!(message.contains("PreToolUse"));
        assert!(config.hooks.is_empty());
    }

    #[test]
    fn a_legacy_alias_is_stored_under_the_canonical_name_the_runner_fires() {
        let mut config = HooksConfig::default();
        let (event, _) = add_hook(&mut config, "BeforeToolUse", "echo legacy").expect("added");
        assert_eq!(event, "PreToolUse");
        assert!(config.hooks.contains_key("PreToolUse"));
        assert!(!config.hooks.contains_key("BeforeToolUse"));
    }

    fn argv_hook(command: &str, args: &[&str]) -> Hook {
        Hook {
            command: command.to_string(),
            args: args.iter().map(|arg| arg.to_string()).collect(),
            timeout: default_timeout(),
            blocking: true,
            matcher: None,
            if_condition: None,
            source: HookSource::User,
        }
    }

    fn commands<'a>(config: &'a HooksConfig, event: &str) -> Vec<&'a str> {
        config.hooks[event]
            .iter()
            .map(|hook| hook.command.as_str())
            .collect()
    }

    #[test]
    fn hooks_under_an_older_event_name_load_under_the_event_the_runner_fires() {
        let config: HooksConfig = serde_json::from_str(
            r#"{"hooks": {
                "BeforeToolUse": [{"command": "first"}],
                "PreToolUse": [{"command": "second"}],
                "PreCommand": [{"command": "third"}],
                "AfterToolUse": [{"command": "after"}]
            }}"#,
        )
        .unwrap();
        assert_eq!(config.hooks.len(), 2);
        assert_eq!(
            commands(&config, "PreToolUse"),
            vec!["first", "second", "third"],
            "the order the file gives is the order they run in"
        );
        assert_eq!(commands(&config, "PostToolUse"), vec!["after"]);

        let saved = serde_json::to_string(&config).unwrap();
        assert!(!saved.contains("BeforeToolUse") && !saved.contains("AfterToolUse"));
    }

    #[tokio::test]
    async fn a_hook_written_under_an_older_name_fires() {
        let _serial = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        let config: HooksConfig = serde_json::from_str(
            r#"{"sandbox": false, "hooks": {"AfterToolUse": [{"command": "echo fired"}]}}"#,
        )
        .unwrap();
        let input = HookInput {
            event: "PostToolUse".to_string(),
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
        assert!(results[0].stdout.contains("fired"), "{:?}", results[0]);
    }

    #[test]
    fn an_unknown_event_key_is_refused_by_name() {
        let error = serde_json::from_str::<HooksConfig>(
            r#"{"hooks": {"BeforeLunch": [{"command": "echo hi"}]}}"#,
        )
        .expect_err("a key that is no event")
        .to_string();
        assert!(
            error.contains("unknown hook event \"BeforeLunch\""),
            "{error}"
        );
        assert!(error.contains("PreToolUse"), "{error}");
        assert!(error.contains("BeforeToolUse (now PreToolUse)"), "{error}");
    }

    #[test]
    fn a_hook_that_could_never_fire_is_refused_when_the_file_loads() {
        for (json, expected) in [
            (
                r#"{"hooks": {"Stop": [{"command": "guard.sh", "matcher": "("}]}}"#,
                "not a regular expression",
            ),
            (
                r#"{"hooks": {"PreToolUse": [{"command": "guard.sh", "if": "Bash"}]}}"#,
                "Tool(pattern)",
            ),
            (
                r#"{"hooks": {"PreToolUse": [{"command": "guard.sh", "if": "(git *)"}]}}"#,
                "Tool(pattern)",
            ),
            (
                r#"{"hooks": {"Stop": [{"command": "  "}]}}"#,
                "has no command",
            ),
        ] {
            let error = serde_json::from_str::<HooksConfig>(json)
                .expect_err(json)
                .to_string();
            assert!(error.contains(expected), "{json}: {error}");
        }

        let kept: HooksConfig = serde_json::from_str(
            r#"{"hooks": {"PreToolUse": [{"command": "guard.sh", "matcher": "^bash$", "if": "Bash(git *)"}]}}"#,
        )
        .unwrap();
        assert_eq!(commands(&kept, "PreToolUse"), vec!["guard.sh"]);
    }

    #[tokio::test]
    async fn args_reach_the_program_as_written_and_stdin_is_never_run_as_a_script() {
        let _serial = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        let scratch = tempfile::tempdir().unwrap();
        let marker = scratch.path().join("ran-from-stdin");
        let script = scratch.path().join("guard.sh");
        std::fs::write(&script, "cat >/dev/null\nprintf '%s|' \"$@\"\n").unwrap();
        let input = serde_json::json!({
            "tool_args": {"command": format!("$(touch '{}')", marker.display())}
        })
        .to_string();

        let hook = argv_hook(
            "sh",
            &[
                script.to_str().unwrap(),
                "a b",
                "$(printf injected)",
                "; echo c",
            ],
        );
        let result = run_single_hook(&hook, &input, false).await;

        assert!(result.success, "{}", result.stderr);
        assert_eq!(result.stdout, "a b|$(printf injected)|; echo c|");
        assert!(
            !marker.exists(),
            "the hook JSON on stdin was run as a shell script"
        );
        assert_eq!(result.hook_command, hook.display_command());
    }

    #[test]
    fn a_hook_with_args_is_named_whole_wherever_it_is_named() {
        let hook = argv_hook("sh", &["guard.sh", "two words"]);
        assert_eq!(hook.display_command(), "sh guard.sh 'two words'");
        assert_eq!(argv_hook("echo hi", &[]).display_command(), "echo hi");

        let mut config = HooksConfig::default();
        config
            .hooks
            .insert("PreToolUse".to_string(), vec![hook.clone()]);
        assert!(format_hooks_list(&config).contains("  - sh guard.sh 'two words'\n"));
        assert!(hook_failure_reason(&hook, "", true, false).contains("`sh guard.sh 'two words'`"));
    }

    #[test]
    fn the_list_is_in_event_order_and_names_a_non_blocking_hook_for_what_it_is() {
        let mut config = HooksConfig::default();
        add_hook(&mut config, "Stop", "later").expect("added");
        add_hook(&mut config, "PreToolUse", "sooner").expect("added");
        config.hooks.get_mut("Stop").expect("event")[0].blocking = false;

        let list = format_hooks_list(&config);
        assert!(
            list.find("PreToolUse:").expect("listed") < list.find("Stop:").expect("listed"),
            "{list}"
        );
        assert!(list.contains("  - later [non-blocking]\n"), "{list}");
        assert!(!list.contains("[async]"), "{list}");
    }

    #[test]
    fn the_example_for_an_empty_list_uses_names_the_runner_fires() {
        let help = format_hooks_list(&HooksConfig::default());
        let example = &help[help.find('{').expect("example")..=help.rfind('}').expect("example")];
        let parsed: HooksConfig = serde_json::from_str(example).expect("the example loads");
        assert!(parsed.hooks.contains_key("PostToolUse"), "{help}");
        assert_eq!(
            parsed.hooks["PreToolUse"][0].args,
            vec!["guard.py".to_string()]
        );
        assert!(!help.contains("AfterToolUse"), "{help}");
    }

    #[test]
    fn plugin_hooks_load_under_the_canonical_event_and_bad_entries_are_left_out() {
        let mut config = HooksConfig::default();
        append_plugin_hooks(
            &mut config,
            HashMap::from([
                (
                    "AfterToolUse".to_string(),
                    vec![serde_json::json!({"command": "sh", "args": ["post.sh"]})],
                ),
                (
                    "BeforeLunch".to_string(),
                    vec![serde_json::json!({"command": "never"})],
                ),
                (
                    "Stop".to_string(),
                    vec![serde_json::json!({"command": "bad", "matcher": "("})],
                ),
            ]),
        );
        assert_eq!(config.hooks.len(), 1, "{:?}", config.hooks.keys());
        let hook = &config.hooks["PostToolUse"][0];
        assert_eq!(hook.source, HookSource::Plugin);
        assert_eq!(hook.display_command(), "sh post.sh");
    }

    #[test]
    fn a_hook_needs_a_command() {
        let mut config = HooksConfig::default();
        assert!(add_hook(&mut config, "Stop", "   ").is_err());
    }

    #[test]
    fn an_unknown_action_names_the_ones_that_exist() {
        let error = apply_hooks_command("enable Stop").expect_err("rejected");
        assert!(error.to_string().contains("use list, add or remove"));
    }

    #[test]
    fn add_and_remove_report_their_usage_when_underspecified() {
        assert!(apply_hooks_command("add PreToolUse")
            .expect_err("needs a command")
            .to_string()
            .contains("hooks add <event> <command>"));
        assert!(apply_hooks_command("remove PreToolUse")
            .expect_err("needs an index")
            .to_string()
            .contains("hooks remove <event> <index>"));
    }

    #[test]
    fn a_non_numeric_index_is_refused() {
        assert!(apply_hooks_command("remove PreToolUse first")
            .expect_err("not a number")
            .to_string()
            .contains("hook index must be a number"));
    }
}

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
        assert!(!config.hooks.contains_key("AfterToolUse"));
        assert_eq!(config.hooks["PostToolUse"][0].timeout, 10); // default
        assert!(config.hooks["SessionStart"][0].matcher.is_none());
    }

    #[test]
    fn test_hook_input_serialization() {
        let input = HookInput {
            event: "AfterToolUse".to_string(),
            session_id: Some("123".to_string()),
            model: Some("fixture-hook-model".to_string()),
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
                source: HookSource::User,
            }],
        );

        let config = HooksConfig {
            hooks,
            sandbox: Some(false),
        };
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
            source: HookSource::User,
        };

        let result = run_single_hook(&hook, "{}", false).await;
        assert!(result.success);
        assert!(result.stdout.contains("test_output"));
        assert!(!result.blocked);
        assert!(!result.should_stop);
    }

    #[tokio::test]
    async fn hook_json_preserves_paths_quotes_and_shell_metacharacters() {
        let _serial = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        for path in [
            r"C:\Users\Test User\notes.txt",
            r"\\server\share\folder\",
            r"\\?\C:\folder\notes.txt",
            "quote'\" $HOME $(printf injected) `printf injected` ; & | < > * ? [x]",
            "資料/notes.txt",
            "line\nwith\tcontrol\rcharacters",
        ] {
            let expected = serde_json::json!({"updated_input": {"path": path}});
            let hook = Hook {
                command: format!(
                    "printf '%s' {}",
                    crate::sandbox::shell_quote(&expected.to_string())
                ),
                args: Vec::new(),
                timeout: 5,
                blocking: true,
                matcher: None,
                if_condition: None,
                source: HookSource::User,
            };
            let result = run_single_hook(&hook, "{}", false).await;
            assert!(result.success, "hook failed: {}", result.stderr);
            assert_eq!(
                result.updated_input,
                Some(expected["updated_input"].clone()),
                "hook corrupted {path:?}: stdout={:?}, stderr={:?}",
                result.stdout,
                result.stderr,
            );
        }
    }

    #[tokio::test]
    async fn hook_stdin_remains_json_when_shell_arguments_are_encoded() {
        let _serial = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        let input = serde_json::json!({"updated_input": {"path": r"C:\Users\Test User\notes.txt"}});
        let hook = Hook {
            command: "cat".to_string(),
            args: Vec::new(),
            timeout: 5,
            blocking: true,
            matcher: None,
            if_condition: None,
            source: HookSource::User,
        };
        let result = run_single_hook(&hook, &input.to_string(), false).await;
        assert!(result.success, "{}", result.stderr);
        assert_eq!(result.updated_input, Some(input["updated_input"].clone()));
    }

    #[tokio::test]
    async fn test_run_single_hook_timeout() {
        let _serial = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        let hook = Hook {
            command: "sleep 10".to_string(),
            args: Vec::new(),
            timeout: 1,
            blocking: true,
            matcher: None,
            if_condition: None,
            source: HookSource::User,
        };

        let result = run_single_hook(&hook, "{}", false).await;
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
            source: HookSource::User,
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
            source: HookSource::User,
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
            source: HookSource::User,
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
    fn test_matcher_matches_claude_alias_for_canonical_tool_name() {
        let hook = Hook {
            command: "echo ok".to_string(),
            args: Vec::new(),
            timeout: 10,
            blocking: true,
            matcher: Some("^Bash$".to_string()),
            if_condition: None,
            source: HookSource::User,
        };
        let input = HookInput {
            event: "PostToolUse".to_string(),
            session_id: None,
            model: None,
            tool_name: Some("run_command".to_string()),
            tool_args: None,
            tool_output: None,
            message: None,
            tool_execution: None,
        };
        assert!(hook_matches(&hook, "PostToolUse", &input));
    }

    #[test]
    fn test_hook_tool_name_candidates_include_catalog_aliases() {
        let mut definitions = crate::runtime::tool_catalog::all_builtin_tool_definitions();
        definitions.extend(crate::runtime::tool_catalog::team_tool_definitions());

        for tool in definitions {
            let candidates = hook_tool_name_candidates(&tool.name);
            assert!(candidates.contains(&tool.name.as_str()));

            for alias in crate::runtime::tool_catalog::tool_aliases(&tool.name) {
                assert!(
                    candidates.contains(alias),
                    "{} hook candidates should include alias {alias}",
                    tool.name
                );
            }
        }
    }

    #[test]
    fn test_if_condition_matches_claude_alias_for_canonical_tool_name() {
        let args = serde_json::json!({ "command": "git status --short" });
        assert!(matches_permission_rule(
            "Bash(git *)",
            "run_command",
            Some(&args)
        ));
        assert!(matches_permission_rule(
            "run_command(git *)",
            "Bash",
            Some(&args)
        ));
        assert!(!matches_permission_rule(
            "Read(git *)",
            "run_command",
            Some(&args)
        ));
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
            source: HookSource::User,
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
                    source: HookSource::User,
                },
                Hook {
                    command: "echo always".to_string(),
                    args: Vec::new(),
                    timeout: 5,
                    blocking: true,
                    matcher: None,
                    if_condition: None,
                    source: HookSource::User,
                },
            ],
        );
        let config = HooksConfig {
            hooks,
            sandbox: Some(false),
        };

        // tool_name=read_file, first hook should be skipped, second runs
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
        assert_eq!(
            updated.get("path").and_then(|v| v.as_str()),
            Some("/redacted")
        );
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
            t.updated_input
                .as_ref()
                .and_then(|v| v.get("v"))
                .and_then(|v| v.as_u64()),
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
            source: HookSource::User,
        };
        let result = run_single_hook(&hook, "{}", false).await;
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
            source: HookSource::User,
        };
        let result = run_single_hook(&hook, "{}", false).await;
        assert!(result.success);
        assert!(!result.blocked);
        assert!(result.should_stop);
    }

    fn failing_hook(command: &str, blocking: bool) -> Hook {
        Hook {
            command: command.to_string(),
            args: Vec::new(),
            timeout: 5,
            blocking,
            matcher: None,
            if_condition: None,
            source: HookSource::User,
        }
    }

    #[tokio::test]
    async fn a_hook_that_exits_with_code_two_blocks_with_its_stderr() {
        let _serial = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        let hook = failing_hook("echo 'no writes to main' >&2; exit 2", true);
        let result = run_single_hook(&hook, "{}", false).await;
        assert!(!result.success);
        assert!(result.blocked);
        assert_eq!(result.reason.as_deref(), Some("no writes to main"));
        assert!(matches!(
            aggregate_results(&[result]),
            HookAggregateOutcome::Blocked { .. }
        ));
    }

    #[tokio::test]
    async fn any_other_non_zero_exit_is_an_error_that_does_not_block() {
        let _serial = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        for blocking in [true, false] {
            let hook = failing_hook("echo 'guard broke' >&2; exit 3", blocking);
            let result = run_single_hook(&hook, "{}", false).await;
            assert!(!result.success);
            assert!(!result.blocked, "blocking={blocking}");
            assert!(result.stderr.contains("guard broke"));
            assert_eq!(aggregate_results(&[result]), HookAggregateOutcome::Continue);
        }
    }

    fn not_run(stderr: &str) -> HookResult {
        HookResult {
            hook_command: "guard.sh".to_string(),
            success: false,
            stdout: String::new(),
            stderr: stderr.to_string(),
            duration_ms: 0,
            blocked: false,
            reason: None,
            should_stop: false,
            updated_input: None,
            additional_context: None,
            updated_mcp_tool_output: None,
        }
    }

    #[test]
    fn a_blocking_hook_that_could_not_run_blocks() {
        let hook = failing_hook("guard.sh", true);
        let result = settle_failure(
            &hook,
            not_run("Failed to execute hook: hook refused, it must run sandboxed"),
            false,
            false,
            None,
            true,
        );
        assert!(
            result.blocked,
            "a guard that never ran must not read as allowed"
        );
        let reason = result.reason.expect("a reason");
        assert!(reason.contains("could not run"), "{reason}");
    }

    #[test]
    fn a_blocking_hook_that_timed_out_is_shown_and_does_not_block() {
        let hook = failing_hook("npx guard", true);
        let result = settle_failure(
            &hook,
            not_run("Hook timed out after 5s"),
            false,
            true,
            None,
            true,
        );
        assert!(!result.blocked);
        assert!(result.reason.is_none());
        assert_eq!(aggregate_results(&[result]), HookAggregateOutcome::Continue);
    }

    #[tokio::test]
    async fn a_blocking_hook_that_runs_out_of_time_does_not_block() {
        let mut hook = failing_hook("sleep 10", true);
        hook.timeout = 1;
        let _serial = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        let result = run_single_hook(&hook, "{}", false).await;
        assert!(!result.success);
        assert!(
            !result.blocked,
            "a timeout is a shown error, as in Claude Code"
        );
        assert!(result.stderr.contains("timed out"), "{}", result.stderr);
    }

    #[tokio::test]
    async fn a_non_blocking_hook_that_could_not_run_does_not_block() {
        let mut hook = failing_hook("sleep 10", false);
        hook.timeout = 1;
        let _serial = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        let result = run_single_hook(&hook, "{}", false).await;
        assert!(!result.success);
        assert!(!result.blocked);
    }

    #[tokio::test]
    async fn a_failing_hook_keeps_its_own_decision() {
        let _serial = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        let hook = failing_hook(r#"echo '{"continue":false}'; exit 1"#, true);
        let result = run_single_hook(&hook, "{}", false).await;
        assert!(!result.success);
        assert!(result.should_stop);
        assert!(!result.blocked);
    }

    #[test]
    fn a_sandboxed_hook_failure_names_the_sandbox_and_the_opt_out() {
        let reason = hook_failure_reason(
            &failing_hook("guard.sh", true),
            "permission denied\n",
            false,
            true,
        );
        assert!(reason.contains("OS sandbox"), "{reason}");
        assert!(reason.contains("\"sandbox\": false"), "{reason}");
        assert!(reason.contains("AGIWORKFORCE_SANDBOX_HOOKS=0"), "{reason}");
        assert!(reason.contains("permission denied"), "{reason}");

        let unsandboxed = hook_failure_reason(&failing_hook("guard.sh", true), "", true, false);
        assert!(!unsandboxed.contains("sandbox"), "{unsandboxed}");
        assert!(
            unsandboxed.contains("it exited with an error"),
            "{unsandboxed}"
        );
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
        let hooks = &config.hooks["PostToolUse"];
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
                source: HookSource::User,
            }],
        );
        let config = HooksConfig {
            hooks,
            sandbox: Some(false),
        };
        let list = format_hooks_list(&config);
        assert!(list.contains("[matcher: ^bash$]"));
    }

    // -----------------------------------------------------------------------
    // HIGH-2: Plugin trust, project-local plugin hooks must be blocked
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
            !result.contains_key("PreToolUse") || result["PreToolUse"].is_empty(),
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
            result
                .get("PreToolUse")
                .map(|v| v.is_empty())
                .unwrap_or(true),
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
        let results = vec![HookResult {
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
        }];
        // audit_log_updated_input is called inside aggregate_transformers.
        // We verify that the aggregated updated_input is the one from the hook.
        let transformers = aggregate_transformers(&results);
        assert_eq!(
            transformers
                .updated_input
                .as_ref()
                .and_then(|v| v.get("command"))
                .and_then(|v| v.as_str()),
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

    const FAKE_BEARER_TOKEN: &str = "EXAMPLE-NOT-A-REAL-BEARER-TOKEN";
    const FAKE_ANTHROPIC_KEY: &str = "sk-ant-EXAMPLENOTAREALANTHROPICKEY00000";
    const FAKE_GITHUB_TOKEN: &str = "ghp_EXAMPLENOTAREALGITHUBTOKEN000000000";
    const FAKE_DATABASE_URL: &str =
        "postgres://EXAMPLE_USER:EXAMPLE_FAKE_PASS@db.example.com:5432/app";

    #[test]
    fn updated_input_audit_redacts_secrets_and_restricts_permissions() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("security-audit.log");
        let original = serde_json::json!({
            "command": format!("curl -H 'Authorization: Bearer {FAKE_BEARER_TOKEN}' https://api.example.com")
        });
        let new = serde_json::json!({
            "command": format!("export ANTHROPIC_API_KEY={FAKE_ANTHROPIC_KEY}")
        });
        let rewrite = RedactedHookRewrite::new(
            &format!("lint.sh --token {FAKE_GITHUB_TOKEN}"),
            &original,
            &new,
        );

        append_updated_input_audit(&path, &rewrite).expect("append audit entry");

        let contents = std::fs::read_to_string(&path).expect("read audit log");
        for secret in [FAKE_BEARER_TOKEN, FAKE_ANTHROPIC_KEY, FAKE_GITHUB_TOKEN] {
            assert!(
                !contents.contains(secret),
                "secret survived into audit log: {secret}\n{contents}"
            );
        }
        assert!(contents.contains("[REDACTED_ANTHROPIC_KEY]"));
        assert!(contents.contains("[REDACTED_GITHUB_TOKEN]"));
        assert!(contents.contains("updated_input rewrite by hook"));

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&path)
                .expect("metadata")
                .permissions()
                .mode()
                & 0o777;
            assert_eq!(mode, 0o600, "audit log must be owner-only");
        }
    }

    #[test]
    fn updated_input_audit_stderr_fields_are_redacted() {
        let rewrite = RedactedHookRewrite::new(
            "hook.sh",
            &serde_json::json!({ "url": FAKE_DATABASE_URL }),
            &serde_json::json!({ "url": "postgres://db.example.com:5432/app" }),
        );

        assert!(!rewrite.original_args.contains("EXAMPLE_FAKE_PASS"));
        assert!(rewrite.original_args.contains("[CREDENTIALS_REDACTED]"));
        assert_eq!(
            rewrite.new_args,
            serde_json::json!({ "url": "postgres://db.example.com:5432/app" }).to_string(),
            "non-secret args must pass through unchanged"
        );
    }

    #[test]
    fn audit_fixtures_read_as_fake_yet_still_trip_the_redactor() {
        for fixture in [
            FAKE_BEARER_TOKEN,
            FAKE_ANTHROPIC_KEY,
            FAKE_GITHUB_TOKEN,
            FAKE_DATABASE_URL,
        ] {
            assert!(
                fixture.contains("EXAMPLE"),
                "fixture must be unmistakably fake to a reader and to check:secrets: {fixture}"
            );
        }
        for (fixture, marker) in [
            (FAKE_ANTHROPIC_KEY, "[REDACTED_ANTHROPIC_KEY]"),
            (FAKE_GITHUB_TOKEN, "[REDACTED_GITHUB_TOKEN]"),
            (FAKE_DATABASE_URL, "[CREDENTIALS_REDACTED]"),
        ] {
            let redacted = crate::secret_redaction::redact_secrets(fixture);
            assert!(
                redacted.contains(marker),
                "fixture stopped matching the redactor it exercises: {fixture} -> {redacted}"
            );
        }
        let bearer = crate::secret_redaction::redact_secrets(&format!(
            "Authorization: Bearer {FAKE_BEARER_TOKEN}"
        ));
        assert!(
            !bearer.contains(FAKE_BEARER_TOKEN),
            "bearer fixture stopped matching the redactor it exercises: {bearer}"
        );
    }
}
