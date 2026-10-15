//! Global state, named constants, and stop/cancel flag management for the chat module.

use once_cell::sync::Lazy;
use rusqlite::Connection;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

// === Named constants for previously-hardcoded values ===
/// Default temperature for LLM requests
pub(crate) const DEFAULT_TEMPERATURE: f32 = 0.7;
/// Default max tokens for LLM responses
pub(crate) const DEFAULT_MAX_TOKENS: u32 = 4096;
/// Maximum characters to extract from text/PDF file attachments (~100 KB)
pub(crate) const MAX_FILE_EXTRACT_CHARS: usize = 100_000;
/// Conversations returned per history page when the caller names no limit
pub(crate) const DEFAULT_CONVERSATION_PAGE_SIZE: i64 = 200;
/// Largest history page one call may request
pub(crate) const MAX_CONVERSATION_PAGE_SIZE: i64 = 500;
/// Maximum length for pending user messages
pub(crate) const MAX_PENDING_MESSAGE_CHARS: usize = 100_000;
/// Max idle wait for next streaming chunk before failing the stream.
/// 300s (5 minutes) to accommodate:
///   - Image/video generation tools (30-120s)
///   - Extended thinking / reasoning models (60-180s before first token)
///   - High-latency networks and provider cold-starts
///   - Provider keepalive gaps during heavy load
///     The SSE parser emits keepalive chunks for provider heartbeats (`: keep-alive`,
///     `event: ping`), so this timeout only fires if truly NO bytes are received.
///
/// Bug #34 fix: Reduced from 300s to 90s. Since SSE keepalives reset the timer,
/// 90s of total silence means the connection is dead. This prevents frozen UI
/// while still accommodating reasoning models (60-90s before first token).
pub(crate) const STREAM_CHUNK_IDLE_TIMEOUT_SECS: u64 = 90;
/// Max wait per follow-up model invocation in tool loop (e.g. after image generation).
/// 120s to accommodate reasoning/thinking models that can take 30-90s before first token.
pub(crate) const FOLLOWUP_INVOKE_TIMEOUT_SECS: u64 = 120;
/// Extended followup timeout for image/video generation tools.
/// These tools produce large outputs that take 30-120s, and the followup
/// model invocation needs additional time to process the result.
pub(crate) const MEDIA_FOLLOWUP_INVOKE_TIMEOUT_SECS: u64 = 300;
/// Max total wait across all candidate retries for a single follow-up call.
pub(crate) const FOLLOWUP_TOTAL_TIMEOUT_SECS: u64 = 180;
/// Fast metadata follow-ups should still allow for MCP startup and remote latency.
pub(crate) const FAST_METADATA_FOLLOWUP_INVOKE_TIMEOUT_SECS: u64 = 15;
/// Fast metadata follow-ups should have a bounded but realistic retry budget.
pub(crate) const FAST_METADATA_FOLLOWUP_TOTAL_TIMEOUT_SECS: u64 = 45;
/// Hard upper bound for a streaming tool loop.
/// 600s (10 minutes) to accommodate multi-step agentic workflows with
/// image/video generation and reasoning model follow-ups.
pub(crate) const STREAMING_TOOL_LOOP_MAX_SECS: u64 = 600;
/// Fast metadata loops should remain bounded while tolerating transient slowness.
pub(crate) const FAST_METADATA_TOOL_LOOP_MAX_SECS: u64 = 120;
/// Default streaming tool-loop iteration limit.
pub(crate) const STREAMING_TOOL_LOOP_MAX_ITERATIONS: usize = 25;
/// Fast metadata loops should terminate quickly while still allowing recovery retries.
pub(crate) const FAST_METADATA_TOOL_LOOP_MAX_ITERATIONS: usize = 8;
/// How long the agent waits for the user to answer a question it asked, the
/// same window the CLI gives a tool approval.
pub(crate) const USER_ANSWER_TIMEOUT_SECS: u64 = 600;
/// Long-running operations that can legitimately take minutes.
pub(crate) const LONG_RUNNING_TOOL_TIMEOUT_SECS: u64 = 300;
/// Default timeout for most tools.
pub(crate) const DEFAULT_TOOL_TIMEOUT_SECS: u64 = 120;
/// Fast metadata tools should fail fast enough for UX but not before realistic completion windows.
pub(crate) const FAST_TOOL_TIMEOUT_SECS: u64 = 45;
/// Maximum age (in milliseconds) for browser page context before it is considered stale.
pub(crate) const PAGE_CONTEXT_MAX_AGE_MS: u64 = 300_000; // 5 minutes
/// Maximum length for sanitized URLs injected into prompts.
pub(crate) const PAGE_CONTEXT_URL_MAX_LEN: usize = 2048;
/// Maximum length for sanitized page titles injected into prompts.
pub(crate) const PAGE_CONTEXT_TITLE_MAX_LEN: usize = 200;
/// Maximum length for sanitized selected text injected into prompts.
pub(crate) const PAGE_CONTEXT_SELECTED_TEXT_MAX_LEN: usize = 4096;

// === Static globals ===

#[derive(Default)]
pub(crate) struct StopRegistry {
    stopped: HashSet<i64>,
    running: HashMap<i64, usize>,
}

pub(crate) static STOP_REGISTRY: Lazy<Mutex<StopRegistry>> =
    Lazy::new(|| Mutex::new(StopRegistry::default()));

#[derive(Default)]
struct UserWaitClock {
    open_waits: usize,
    open_since: Option<std::time::Instant>,
    total: std::time::Duration,
}

/// Time spent waiting on the user (an agent question or a tool approval).
/// Process-wide: approvals carry no conversation id, and a wait in one chat
/// only ever lengthens another chat's allowance, never shortens it.
static USER_WAIT_CLOCK: Lazy<Mutex<UserWaitClock>> =
    Lazy::new(|| Mutex::new(UserWaitClock::default()));

/// Counts the time it is alive as time spent waiting on the user.
pub(crate) struct UserWaitGuard(());

impl UserWaitGuard {
    pub(crate) fn start() -> Self {
        if let Ok(mut clock) = USER_WAIT_CLOCK.lock() {
            if clock.open_waits == 0 {
                clock.open_since = Some(std::time::Instant::now());
            }
            clock.open_waits += 1;
        }
        Self(())
    }
}

impl Drop for UserWaitGuard {
    fn drop(&mut self) {
        if let Ok(mut clock) = USER_WAIT_CLOCK.lock() {
            clock.open_waits = clock.open_waits.saturating_sub(1);
            if clock.open_waits == 0 {
                if let Some(since) = clock.open_since.take() {
                    clock.total += since.elapsed();
                }
            }
        }
    }
}

/// Total time spent waiting on the user so far, including a wait still open.
pub(crate) fn user_wait_total() -> std::time::Duration {
    USER_WAIT_CLOCK
        .lock()
        .map(|clock| {
            clock.total
                + clock
                    .open_since
                    .map(|since| since.elapsed())
                    .unwrap_or_default()
        })
        .unwrap_or_default()
}

/// Time since `started` that was not spent waiting on the user, given the
/// wait total read when the clock started.
pub(crate) fn active_elapsed(
    started: std::time::Instant,
    user_wait_at_start: std::time::Duration,
) -> std::time::Duration {
    started
        .elapsed()
        .saturating_sub(user_wait_total().saturating_sub(user_wait_at_start))
}

pub(crate) static PLAN_MODE_CONVERSATIONS: Lazy<Mutex<HashSet<i64>>> =
    Lazy::new(|| Mutex::new(HashSet::new()));

// Pending messages queue for mid-task user input
pub(crate) static PENDING_MESSAGES: Lazy<Mutex<Vec<super::PendingUserMessage>>> =
    Lazy::new(|| Mutex::new(Vec::new()));
// Tracks tool_call IDs explicitly cancelled by the user so long-running handlers can stop early.
pub(crate) static CANCELLED_TOOL_CALLS: Lazy<Mutex<HashSet<String>>> =
    Lazy::new(|| Mutex::new(HashSet::new()));

// === AppDatabase ===

#[derive(Clone)]
pub struct AppDatabase {
    pub conn: Arc<Mutex<Connection>>,
}

impl AppDatabase {
    pub fn connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.conn.lock().map_err(|e| e.to_string())
    }
}

// === Stop/cancel flag helpers ===

pub(crate) fn mark_tool_cancelled(tool_call_id: &str) {
    if let Ok(mut cancelled) = CANCELLED_TOOL_CALLS.lock() {
        cancelled.insert(tool_call_id.to_string());
    }
}

pub(crate) fn take_tool_cancelled(tool_call_id: &str) -> bool {
    if let Ok(mut cancelled) = CANCELLED_TOOL_CALLS.lock() {
        return cancelled.remove(tool_call_id);
    }
    false
}

/// Check if a tool has been cancelled without removing it from the set.
/// This allows the cancellation check to be non-destructive so it can be polled frequently.
/// AUDIT-CANCEL-060 fix: Added non-consuming check for immediate cancellation detection.
pub(crate) fn is_tool_cancelled(tool_call_id: &str) -> bool {
    if let Ok(cancelled) = CANCELLED_TOOL_CALLS.lock() {
        return cancelled.contains(tool_call_id);
    }
    false
}

/// Marks a conversation stopped, or with `None` every conversation that has
/// a turn running, and returns the conversations it marked.
pub fn request_stop(conversation_id: Option<i64>) -> Vec<i64> {
    let Ok(mut registry) = STOP_REGISTRY.lock() else {
        return Vec::new();
    };
    let stopped: Vec<i64> = match conversation_id {
        Some(id) => vec![id],
        None => registry.running.keys().copied().collect(),
    };
    registry.stopped.extend(stopped.iter().copied());
    stopped
}

pub fn should_stop_for_conversation(conversation_id: i64) -> bool {
    STOP_REGISTRY
        .lock()
        .map(|registry| registry.stopped.contains(&conversation_id))
        .unwrap_or(false)
}

pub fn reset_stop_flag(conversation_id: i64) {
    if let Ok(mut registry) = STOP_REGISTRY.lock() {
        registry.stopped.remove(&conversation_id);
    }
}

pub(crate) fn mark_turn_running(conversation_id: i64) {
    if let Ok(mut registry) = STOP_REGISTRY.lock() {
        *registry.running.entry(conversation_id).or_default() += 1;
    }
}

/// Records that one turn of `conversation_id` ended, and returns true when no
/// other turn of it is still running.
pub(crate) fn mark_turn_finished(conversation_id: i64) -> bool {
    let Ok(mut registry) = STOP_REGISTRY.lock() else {
        return false;
    };
    match registry.running.get_mut(&conversation_id) {
        Some(turns) if *turns > 1 => {
            *turns -= 1;
            false
        }
        _ => {
            registry.running.remove(&conversation_id);
            true
        }
    }
}

/// Chat turns running now, for the quit prompt.
pub fn active_turn_count() -> usize {
    STOP_REGISTRY
        .lock()
        .map(|registry| registry.running.values().sum())
        .unwrap_or(0)
}

pub fn set_conversation_plan_mode(conversation_id: i64, enabled: bool) {
    if let Ok(mut conversations) = PLAN_MODE_CONVERSATIONS.lock() {
        if enabled {
            conversations.insert(conversation_id);
        } else {
            conversations.remove(&conversation_id);
        }
    }
}

pub fn is_conversation_in_plan_mode(conversation_id: i64) -> bool {
    PLAN_MODE_CONVERSATIONS
        .lock()
        .map(|conversations| conversations.contains(&conversation_id))
        .unwrap_or(false)
}

/// The refusal a plan-mode conversation returns for a tool that could change
/// something, or `None` when the tool may run.
pub(crate) fn plan_mode_refusal(conversation_id: i64, tool_name: &str) -> Option<String> {
    use crate::sys::commands::tool_confirmation::{AgentMode, ToolConfirmationState};

    if !is_conversation_in_plan_mode(conversation_id)
        || ToolConfirmationState::is_tool_permitted_for_mode(tool_name, AgentMode::Plan)
    {
        return None;
    }
    Some(format!(
        "Tool '{tool_name}' is not permitted in plan mode. Plan mode can only read; present the plan and ask the user to switch to Ask mode to carry it out."
    ))
}
