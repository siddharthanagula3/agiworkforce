//! Runaway/loop guard primitives, moved VERBATIM from the CLI's
//! `apps/cli/src/agent/executor.rs` (Wave 5e1). These are pure, side-effect-free
//! detectors plus the cross-turn [`RunawayTracker`] state the engine threads
//! through the loop. The UI/hook RESPONSE to a detected runaway (strike prompts,
//! dialoguer confirmation, hook fan-out) stays app-local in the host — only the
//! detection math and the persistent counters live here.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

/// Maximum agentic loop iterations to prevent infinite loops.
pub const MAX_AGENTIC_ITERATIONS: usize = 25;

/// Number of consecutive identical tool calls before triggering loop detection.
pub const LOOP_DETECTION_THRESHOLD: usize = 5;

/// Sliding window size (in chars) for content chanting detection.
pub const CONTENT_CHUNK_SIZE: usize = 50;

/// Number of identical content chunks within the distance window to flag a content loop.
pub const CONTENT_LOOP_CHUNK_THRESHOLD: usize = 10;

/// Maximum character distance between first and last matching chunk to trigger detection.
pub const CONTENT_LOOP_DISTANCE: usize = 500;

/// Hash a tool call (name + args) for loop detection.
pub fn hash_tool_call(name: &str, args: &serde_json::Value) -> u64 {
    let mut hasher = DefaultHasher::new();
    name.hash(&mut hasher);
    args.to_string().hash(&mut hasher);
    hasher.finish()
}

/// Detect content chanting: repeated identical chunks in LLM text output.
pub fn detect_content_loop(text: &str) -> bool {
    if text.len() < CONTENT_CHUNK_SIZE * 2 {
        return false;
    }

    let mut plain = String::with_capacity(text.len());
    let mut in_code_block = false;
    for line in text.lines() {
        if line.trim_start().starts_with("```") {
            in_code_block = !in_code_block;
            continue;
        }
        if !in_code_block {
            plain.push_str(line);
            plain.push('\n');
        }
    }

    if plain.len() < CONTENT_CHUNK_SIZE * 2 {
        return false;
    }

    let chars: Vec<char> = plain.chars().collect();
    let mut chunk_entries: Vec<(u64, usize)> = Vec::new();
    let mut byte_offset: usize = 0;
    for chunk_start in
        (0..chars.len().saturating_sub(CONTENT_CHUNK_SIZE - 1)).step_by(CONTENT_CHUNK_SIZE)
    {
        let chunk: String = chars[chunk_start..chunk_start + CONTENT_CHUNK_SIZE]
            .iter()
            .collect();
        let mut hasher = DefaultHasher::new();
        chunk.hash(&mut hasher);
        chunk_entries.push((hasher.finish(), byte_offset));
        byte_offset += chunk.len();
    }

    let mut seen: std::collections::HashMap<u64, Vec<usize>> = std::collections::HashMap::new();
    for (h, offset) in &chunk_entries {
        seen.entry(*h).or_default().push(*offset);
    }

    for offsets in seen.values() {
        if offsets.len() >= CONTENT_LOOP_CHUNK_THRESHOLD {
            for window in offsets.windows(CONTENT_LOOP_CHUNK_THRESHOLD) {
                let span = window[CONTENT_LOOP_CHUNK_THRESHOLD - 1] - window[0];
                if span <= CONTENT_LOOP_DISTANCE {
                    return true;
                }
            }
        }
    }

    false
}

/// Cross-turn runaway state: the rolling window of recent tool-call hashes and
/// the session's loop-strike counter. Owned by the host session (it persists
/// across turns — a second strike auto-stops), lent `&mut` to the engine so the
/// detection math lives with the loop mechanics while the state lives with the
/// session.
#[derive(Debug, Default)]
pub struct RunawayTracker {
    /// Hashes of tool calls seen this session, appended each iteration.
    pub recent_tool_calls: Vec<u64>,
    /// Number of loops detected (tool-call OR content) this session. Two strikes
    /// auto-stop the loop.
    pub loop_strike_count: u32,
}

impl RunawayTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Append this iteration's tool-call hashes to the rolling window.
    pub fn extend(&mut self, hashes: &[u64]) {
        self.recent_tool_calls.extend(hashes);
    }

    /// True when the last [`LOOP_DETECTION_THRESHOLD`] recorded hashes are all
    /// identical (the classic "same tool call over and over" doom loop). Mirrors
    /// the CLI's historical tail-window check exactly.
    pub fn has_identical_tail(&self) -> bool {
        if self.recent_tool_calls.len() < LOOP_DETECTION_THRESHOLD {
            return false;
        }
        let tail = &self.recent_tool_calls[self.recent_tool_calls.len() - LOOP_DETECTION_THRESHOLD..];
        tail.windows(2).all(|w| w[0] == w[1])
    }

    /// Increment and return the strike count (called when a loop is confirmed).
    pub fn bump_strike(&mut self) -> u32 {
        self.loop_strike_count += 1;
        self.loop_strike_count
    }

    /// Reset the rolling tool-call window (after the user confirms a first-strike
    /// runaway should continue).
    pub fn clear_recent(&mut self) {
        self.recent_tool_calls.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_tool_call_same_inputs() {
        let a = hash_tool_call("read_file", &serde_json::json!({"path": "a.txt"}));
        let b = hash_tool_call("read_file", &serde_json::json!({"path": "a.txt"}));
        assert_eq!(a, b);
    }

    #[test]
    fn hash_tool_call_different_inputs() {
        let a = hash_tool_call("read_file", &serde_json::json!({"path": "a.txt"}));
        let b = hash_tool_call("read_file", &serde_json::json!({"path": "b.txt"}));
        assert_ne!(a, b);
    }

    #[test]
    fn identical_tail_needs_threshold_repeats() {
        let mut t = RunawayTracker::new();
        // Four identical + one different -> not a runaway.
        t.extend(&[1, 1, 1, 1, 2]);
        assert!(!t.has_identical_tail());
        // Five identical in the tail -> runaway.
        let mut t2 = RunawayTracker::new();
        t2.extend(&[9, 9, 9, 9, 9]);
        assert!(t2.has_identical_tail());
    }

    #[test]
    fn detect_content_loop_short_text_ignored() {
        assert!(!detect_content_loop("short"));
    }

    #[test]
    fn detect_content_loop_repeated_content() {
        // Same fixture shape as the CLI's historical test: many identical
        // chunk-aligned windows within the distance threshold.
        let chunk = "A".repeat(CONTENT_CHUNK_SIZE);
        let repeated = chunk.repeat(CONTENT_LOOP_CHUNK_THRESHOLD + 5);
        assert!(detect_content_loop(&repeated));
    }

    #[test]
    fn detect_content_loop_code_blocks_skipped() {
        let chunk = "B".repeat(CONTENT_CHUNK_SIZE);
        let repeated = chunk.repeat(CONTENT_LOOP_CHUNK_THRESHOLD + 5);
        let text = format!("Some intro text.\n```\n{repeated}\n```\nSome outro text.");
        assert!(!detect_content_loop(&text));
    }

    #[test]
    fn bump_and_clear() {
        let mut t = RunawayTracker::new();
        assert_eq!(t.bump_strike(), 1);
        assert_eq!(t.bump_strike(), 2);
        t.extend(&[1, 2, 3]);
        t.clear_recent();
        assert!(t.recent_tool_calls.is_empty());
        assert_eq!(t.loop_strike_count, 2);
    }
}
