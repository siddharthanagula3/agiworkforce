//! Global state, named constants, and stop/cancel flag management for the chat module.

use once_cell::sync::Lazy;
use rusqlite::Connection;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

// === Named constants for previously-hardcoded values ===
/// Default temperature for LLM requests
pub(crate) const DEFAULT_TEMPERATURE: f32 = 0.7;
/// Default max tokens for LLM responses
pub(crate) const DEFAULT_MAX_TOKENS: u32 = 4096;
/// Maximum characters to extract from text/PDF file attachments (~100 KB)
pub(crate) const MAX_FILE_EXTRACT_CHARS: usize = 100_000;
/// Default limit when listing conversations
pub(crate) const DEFAULT_CONVERSATION_LIST_LIMIT: i64 = 1000;
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
pub(crate) const STREAM_CHUNK_IDLE_TIMEOUT_SECS: u64 = 300;
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

pub(crate) static STOP_GENERATION: AtomicBool = AtomicBool::new(false);
// AUDIT-STREAM-038 fix: Track active conversation for scoped stop
pub(crate) static ACTIVE_STOP_CONVERSATION: Lazy<Mutex<Option<i64>>> =
    Lazy::new(|| Mutex::new(None));

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

#[cfg(test)]
pub fn should_stop_generation() -> bool {
    STOP_GENERATION.load(Ordering::SeqCst)
}

// AUDIT-STREAM-038 fix: Check if stop is scoped to a specific conversation
pub fn should_stop_for_conversation(conversation_id: i64) -> bool {
    if !STOP_GENERATION.load(Ordering::SeqCst) {
        return false;
    }
    // If no active conversation is set, stop for all (backwards compatibility)
    if let Ok(active) = ACTIVE_STOP_CONVERSATION.lock() {
        if let Some(active_conv) = *active {
            return active_conv == conversation_id;
        }
    }
    // No active conversation set, allow stop for any (global stop)
    true
}

pub fn reset_stop_flag() {
    STOP_GENERATION.store(false, Ordering::SeqCst);
    // AUDIT-STREAM-038 fix: Clear active conversation
    if let Ok(mut active) = ACTIVE_STOP_CONVERSATION.lock() {
        *active = None;
    }
}
