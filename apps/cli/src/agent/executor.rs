use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use serde::{Deserialize, Serialize};

use crate::models::ToolCallResponse;

/// Maximum agentic loop iterations to prevent infinite loops.
pub(super) const MAX_AGENTIC_ITERATIONS: usize = 25;

/// Number of consecutive identical tool calls before triggering loop detection.
pub(super) const LOOP_DETECTION_THRESHOLD: usize = 5;

/// Sliding window size (in chars) for content chanting detection.
pub(super) const CONTENT_CHUNK_SIZE: usize = 50;

/// Number of identical content chunks within the distance window to flag a content loop.
pub(super) const CONTENT_LOOP_CHUNK_THRESHOLD: usize = 10;

/// Maximum character distance between first and last matching chunk to trigger detection.
pub(super) const CONTENT_LOOP_DISTANCE: usize = 500;

/// Represents a tool invocation for execution by tools.rs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub name: String,
    pub args: std::collections::HashMap<String, String>,
}

/// Convert a ToolCallResponse (from native API) to the legacy ToolCall struct.
pub(super) fn tool_call_to_legacy(tc: &ToolCallResponse) -> ToolCall {
    ToolCall {
        name: tc.name.clone(),
        args: value_to_legacy_args(&tc.arguments),
    }
}

/// Convert a JSON args object into the flat HashMap<String, String> shape
/// that `tools::execute_tool_with_opts` expects.
pub(super) fn value_to_legacy_args(
    args: &serde_json::Value,
) -> std::collections::HashMap<String, String> {
    let mut out = std::collections::HashMap::new();
    if let Some(obj) = args.as_object() {
        for (k, v) in obj {
            out.insert(
                k.clone(),
                match v {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                },
            );
        }
    }
    out
}

/// Hash a tool call (name + args) for loop detection.
pub(super) fn hash_tool_call(name: &str, args: &serde_json::Value) -> u64 {
    let mut hasher = DefaultHasher::new();
    name.hash(&mut hasher);
    args.to_string().hash(&mut hasher);
    hasher.finish()
}

/// Detect content chanting: repeated identical chunks in LLM text output.
pub(super) fn detect_content_loop(text: &str) -> bool {
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
