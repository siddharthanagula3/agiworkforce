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
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
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
}

fn default_timeout() -> u64 {
    10
}
fn default_blocking() -> bool {
    true
}

/// Hook events — matches Claude Code's 12+ event lifecycle.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum HookEvent {
    SessionStart,
    SessionEnd,
    BeforeToolUse,
    AfterToolUse,
    BeforeMessage,
    AfterMessage,
    /// Fires before a file edit (write_file or edit_file tool).
    PreEdit,
    /// Fires after a file edit with the modified file path.
    PostEdit,
    /// Fires before a shell command execution.
    PreCommand,
    /// Fires after a shell command completes.
    PostCommand,
    /// Fires when the agent enters/exits plan mode.
    PlanModeChanged,
    /// Fires when context compaction runs.
    ContextCompacted,
    /// Fires when a subagent is spawned.
    SubagentSpawned,
    /// Fires when a subagent completes.
    SubagentCompleted,
    /// Fires on notification events (warnings, errors shown to user).
    Notification,
    /// Fires when the user stops the agentic loop (Ctrl-C or loop detection).
    Stop,
    /// Fires when a cron trigger fires in daemon mode.
    CronTriggered,
    /// Fires when a webhook trigger is received in daemon mode.
    WebhookReceived,
    /// Fires when a watched file changes in daemon mode.
    FileChanged,
    /// Fires when the daemon process starts.
    DaemonStarted,
    /// Fires when the daemon process stops.
    DaemonStopped,
}

impl std::fmt::Display for HookEvent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::SessionStart => write!(f, "SessionStart"),
            Self::SessionEnd => write!(f, "SessionEnd"),
            Self::BeforeToolUse => write!(f, "BeforeToolUse"),
            Self::AfterToolUse => write!(f, "AfterToolUse"),
            Self::BeforeMessage => write!(f, "BeforeMessage"),
            Self::AfterMessage => write!(f, "AfterMessage"),
            Self::PreEdit => write!(f, "PreEdit"),
            Self::PostEdit => write!(f, "PostEdit"),
            Self::PreCommand => write!(f, "PreCommand"),
            Self::PostCommand => write!(f, "PostCommand"),
            Self::PlanModeChanged => write!(f, "PlanModeChanged"),
            Self::ContextCompacted => write!(f, "ContextCompacted"),
            Self::SubagentSpawned => write!(f, "SubagentSpawned"),
            Self::SubagentCompleted => write!(f, "SubagentCompleted"),
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

    /// Bearer token for webhook authentication. If unset, webhooks are unauthenticated.
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
#[derive(Debug)]
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
}

// ---------------------------------------------------------------------------
// Hook result aggregation
// ---------------------------------------------------------------------------

/// Aggregate outcome across multiple hook results.
/// Will be wired into the agent loop to block/stop actions based on hook output.
#[derive(Debug, Clone, PartialEq, Eq)]
#[allow(dead_code)]
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
#[allow(dead_code)]
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

/// Load hooks configuration from ~/.agiworkforce/hooks.json.
pub fn load_hooks() -> Result<HooksConfig> {
    let path = crate::config::CliConfig::config_dir()?.join("hooks.json");

    if !path.exists() {
        return Ok(HooksConfig::default());
    }

    let contents = std::fs::read_to_string(&path).context("Failed to read hooks.json")?;

    let config: HooksConfig =
        serde_json::from_str(&contents).context("Failed to parse hooks.json")?;

    Ok(config)
}

// ---------------------------------------------------------------------------
// Matcher logic
// ---------------------------------------------------------------------------

/// Check whether a hook's optional matcher regex matches the event context.
///
/// If the hook has no matcher the hook always matches.  Otherwise, the regex
/// is tested against:
///   1. the event name (e.g. "AfterToolUse")
///   2. the tool_name from the input (if present)
///
/// Returns `true` if the hook should fire.
fn hook_matches(hook: &Hook, event_name: &str, input: &HookInput) -> bool {
    let pattern = match &hook.matcher {
        Some(p) => p,
        None => return true, // no matcher → always matches
    };

    let re = match Regex::new(pattern) {
        Ok(r) => r,
        Err(_) => return false, // invalid regex → skip hook
    };

    if re.is_match(event_name) {
        return true;
    }

    if let Some(tool_name) = &input.tool_name {
        if re.is_match(tool_name) {
            return true;
        }
    }

    false
}

// ---------------------------------------------------------------------------
// JSON output parsing
// ---------------------------------------------------------------------------

/// Parse hook stdout as JSON to extract control-flow signals.
///
/// Recognised shapes:
/// - `{"decision": "block", "reason": "..."}` → (blocked=true, reason, should_stop=false)
/// - `{"continue": false}` → (blocked=false, None, should_stop=true)
///
/// Any other output (including non-JSON) is ignored → all flags false/None.
fn parse_hook_output(stdout: &str) -> (bool, Option<String>, bool) {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return (false, None, false);
    }

    let parsed: serde_json::Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(_) => return (false, None, false),
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

    (blocked, reason, should_stop)
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
            let (blocked, reason, should_stop) = parse_hook_output(&stdout);
            HookResult {
                hook_command: hook.command.clone(),
                success: output.status.success(),
                stdout,
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                duration_ms,
                blocked,
                reason,
                should_stop,
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
        assert_eq!(format!("{}", HookEvent::AfterToolUse), "AfterToolUse");
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
            "AfterToolUse".to_string(),
            vec![
                Hook {
                    command: "echo matched".to_string(),
                    args: Vec::new(),
                    timeout: 5,
                    blocking: true,
                    matcher: Some("^bash$".to_string()),
                },
                Hook {
                    command: "echo always".to_string(),
                    args: Vec::new(),
                    timeout: 5,
                    blocking: true,
                    matcher: None,
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
        let results = run_hooks(&config, HookEvent::AfterToolUse, &input).await;
        assert_eq!(results.len(), 1);
        assert!(results[0].stdout.contains("always"));
    }

    // -- JSON output parsing tests --

    #[test]
    fn test_parse_hook_output_empty() {
        let (blocked, reason, stop) = parse_hook_output("");
        assert!(!blocked);
        assert!(reason.is_none());
        assert!(!stop);
    }

    #[test]
    fn test_parse_hook_output_non_json() {
        let (blocked, reason, stop) = parse_hook_output("just some text\n");
        assert!(!blocked);
        assert!(reason.is_none());
        assert!(!stop);
    }

    #[test]
    fn test_parse_hook_output_block_decision() {
        let stdout = r#"{"decision": "block", "reason": "unsafe command detected"}"#;
        let (blocked, reason, stop) = parse_hook_output(stdout);
        assert!(blocked);
        assert_eq!(reason.unwrap(), "unsafe command detected");
        assert!(!stop);
    }

    #[test]
    fn test_parse_hook_output_block_without_reason() {
        let stdout = r#"{"decision": "block"}"#;
        let (blocked, reason, _stop) = parse_hook_output(stdout);
        assert!(blocked);
        assert!(reason.is_none());
    }

    #[test]
    fn test_parse_hook_output_continue_false() {
        let stdout = r#"{"continue": false}"#;
        let (blocked, reason, stop) = parse_hook_output(stdout);
        assert!(!blocked);
        assert!(reason.is_none());
        assert!(stop);
    }

    #[test]
    fn test_parse_hook_output_continue_true() {
        let stdout = r#"{"continue": true}"#;
        let (blocked, _reason, stop) = parse_hook_output(stdout);
        assert!(!blocked);
        assert!(!stop);
    }

    #[test]
    fn test_parse_hook_output_irrelevant_json() {
        let stdout = r#"{"status": "ok", "count": 42}"#;
        let (blocked, reason, stop) = parse_hook_output(stdout);
        assert!(!blocked);
        assert!(reason.is_none());
        assert!(!stop);
    }

    #[tokio::test]
    async fn test_run_single_hook_block_json() {
        let hook = Hook {
            command: r#"echo '{"decision":"block","reason":"nope"}'"#.to_string(),
            args: Vec::new(),
            timeout: 5,
            blocking: true,
            matcher: None,
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
            "AfterToolUse".to_string(),
            vec![Hook {
                command: "guard.sh".to_string(),
                args: Vec::new(),
                timeout: 10,
                blocking: true,
                matcher: Some("^bash$".to_string()),
            }],
        );
        let config = HooksConfig { hooks };
        let list = format_hooks_list(&config);
        assert!(list.contains("[matcher: ^bash$]"));
    }
}
