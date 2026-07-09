//! Tool-call delta assembly.
//!
//! Providers stream tool calls three different ways:
//!
//! - **OpenAI-compatible**: indexed deltas — `id`/`name` arrive once,
//!   `arguments` accumulates as string fragments, possibly interleaved across
//!   indexes and out of order. Finalized at end-of-stream ([`ToolCallAssembler::finish`]).
//! - **Anthropic**: sequential content blocks — `id`/`name` at
//!   `content_block_start`, `input_json_delta` fragments, finalized at
//!   `content_block_stop` ([`ToolCallAssembler::finalize_block`]). A truncated
//!   stream that never delivers the stop MUST NOT surface the partial call
//!   ([`ToolCallAssembler::into_completed`] drops unfinalized buffers).
//! - **Gemini / Ollama-native**: complete calls in a single event
//!   ([`ToolCallAssembler::push_completed`]).
//!
//! Argument parsing is centralized in [`parse_tool_arguments_json`]: malformed
//! or non-object arguments never reach an executor raw — they are wrapped in a
//! marker object ([`INVALID_TOOL_ARGS_MARKER`]) the agent loop converts into a
//! tool error the model can react to.

use std::collections::HashMap;

use serde_json::Value;

use crate::wire::ToolCall;

/// Internal marker attached to tool-call arguments when a provider streams
/// malformed function-call JSON. The agent loop turns this into a tool error
/// before any executor sees the arguments.
pub const INVALID_TOOL_ARGS_MARKER: &str = "__agi_invalid_tool_args";

fn value_kind(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

fn empty_tool_arguments() -> Value {
    Value::Object(serde_json::Map::new())
}

fn invalid_tool_arguments(
    tool_name: &str,
    error: impl Into<String>,
    raw: impl Into<String>,
) -> Value {
    let raw = raw.into().chars().take(2_000).collect::<String>();
    let mut payload = serde_json::Map::new();
    payload.insert(INVALID_TOOL_ARGS_MARKER.to_string(), Value::Bool(true));
    payload.insert(
        "tool_name".to_string(),
        Value::String(tool_name.to_string()),
    );
    payload.insert("error".to_string(), Value::String(error.into()));
    payload.insert("raw".to_string(), Value::String(raw));
    Value::Object(payload)
}

/// Parse an accumulated tool-argument JSON string. Empty input yields `{}`;
/// non-object or unparsable input yields the invalid-arguments marker object.
pub fn parse_tool_arguments_json(tool_name: &str, raw: &str) -> Value {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return empty_tool_arguments();
    }

    match serde_json::from_str::<Value>(trimmed) {
        Ok(Value::Object(map)) => Value::Object(map),
        Ok(other) => invalid_tool_arguments(
            tool_name,
            format!("expected JSON object, got {}", value_kind(&other)),
            trimmed,
        ),
        Err(error) => invalid_tool_arguments(tool_name, error.to_string(), trimmed),
    }
}

/// Normalize a tool-argument JSON *value* (Ollama-native can deliver either an
/// object or a stringified object). Strings are parsed; objects pass through;
/// null/absent become `{}`; anything else becomes the marker object.
pub fn normalize_tool_arguments_value(tool_name: &str, value: Option<&Value>) -> Value {
    match value {
        Some(Value::String(raw)) => parse_tool_arguments_json(tool_name, raw),
        Some(Value::Object(map)) => Value::Object(map.clone()),
        Some(Value::Null) | None => empty_tool_arguments(),
        Some(other) => invalid_tool_arguments(
            tool_name,
            format!("expected JSON object, got {}", value_kind(other)),
            other.to_string(),
        ),
    }
}

/// Assembles streamed tool-call deltas into complete [`ToolCall`]s.
#[derive(Debug, Default)]
pub struct ToolCallAssembler {
    /// Indexed delta buffers: index -> (id, name, accumulated args JSON).
    buffers: HashMap<usize, (String, String, String)>,
    /// Calls already finalized (block stop / complete-call dialects), in
    /// finalization order.
    completed: Vec<ToolCall>,
}

impl ToolCallAssembler {
    pub fn new() -> Self {
        Self::default()
    }

    /// Apply an OpenAI-style delta for `index`. Any subset of `id` / `name` /
    /// `args_fragment` may be present: id/name overwrite, fragments append.
    /// Returns `true` when this is the first delta observed for `index`.
    pub fn update(
        &mut self,
        index: usize,
        id: Option<&str>,
        name: Option<&str>,
        args_fragment: Option<&str>,
    ) -> bool {
        let mut newly_seen = false;
        let entry = self.buffers.entry(index).or_insert_with(|| {
            newly_seen = true;
            (String::new(), String::new(), String::new())
        });
        if let Some(id) = id {
            entry.0 = id.to_string();
        }
        if let Some(name) = name {
            entry.1 = name.to_string();
        }
        if let Some(fragment) = args_fragment {
            entry.2.push_str(fragment);
        }
        newly_seen
    }

    /// Anthropic `content_block_stop`: parse the buffered fragments for
    /// `index` NOW and move the call to `completed`. Calls with an empty name
    /// are dropped (matching the CLI's historical behavior). No-op when the
    /// index has no buffer.
    pub fn finalize_block(&mut self, index: usize) {
        if let Some((id, name, args)) = self.buffers.remove(&index)
            && !name.is_empty() {
                let arguments = parse_tool_arguments_json(&name, &args);
                self.completed.push(ToolCall {
                    id,
                    name,
                    arguments,
                });
            }
    }

    /// Record a fully-formed call (Gemini / Ollama-native complete calls).
    /// `arguments` must already be an object or a marker payload — see
    /// [`normalize_tool_arguments_value`].
    pub fn push_completed(&mut self, call: ToolCall) {
        self.completed.push(call);
    }

    /// Number of completed calls so far (used to synthesize `gemini_N` /
    /// `ollama_N` ids for dialects that don't provide call ids).
    pub fn completed_len(&self) -> usize {
        self.completed.len()
    }

    /// End-of-stream for block dialects (Anthropic): return only the calls
    /// finalized by an explicit block stop. Buffers still open when the stream
    /// ended (truncated stream) are dropped, never surfaced half-parsed.
    pub fn into_completed(self) -> Vec<ToolCall> {
        self.completed
    }

    /// End-of-stream for indexed dialects (OpenAI-compatible): flush remaining
    /// buffers in ascending index order, skipping nameless entries, parsing
    /// each accumulated argument string. Previously-completed calls (if any)
    /// keep their order ahead of the flushed ones.
    pub fn finish(mut self) -> Vec<ToolCall> {
        let mut sorted_indices: Vec<usize> = self.buffers.keys().copied().collect();
        sorted_indices.sort_unstable();
        for idx in sorted_indices {
            if let Some((id, name, args_json)) = self.buffers.remove(&idx)
                && !name.is_empty() {
                    let arguments = parse_tool_arguments_json(&name, &args_json);
                    self.completed.push(ToolCall {
                        id,
                        name,
                        arguments,
                    });
                }
        }
        self.completed
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_empty_args_yield_empty_object() {
        assert_eq!(
            parse_tool_arguments_json("read_file", "  "),
            serde_json::json!({})
        );
    }

    #[test]
    fn parse_object_args_pass_through() {
        assert_eq!(
            parse_tool_arguments_json("read_file", r#"{"path":"a.txt"}"#),
            serde_json::json!({"path": "a.txt"})
        );
    }

    #[test]
    fn parse_non_object_args_get_marker() {
        let v = parse_tool_arguments_json("read_file", "[1,2]");
        assert_eq!(v[INVALID_TOOL_ARGS_MARKER], true);
        assert_eq!(v["tool_name"], "read_file");
        assert_eq!(v["error"], "expected JSON object, got array");
        assert_eq!(v["raw"], "[1,2]");
    }

    #[test]
    fn parse_malformed_json_args_get_marker_with_parse_error() {
        let v = parse_tool_arguments_json("run_command", r#"{"command": "echo"#);
        assert_eq!(v[INVALID_TOOL_ARGS_MARKER], true);
        assert_eq!(v["tool_name"], "run_command");
        let err = v["error"].as_str().unwrap();
        assert!(!err.is_empty(), "marker must carry the parser error");
        assert_eq!(v["raw"], r#"{"command": "echo"#);
    }

    #[test]
    fn parse_marker_raw_is_capped_at_2000_chars() {
        let raw = "x".repeat(5_000);
        let v = parse_tool_arguments_json("t", &raw);
        assert_eq!(v["raw"].as_str().unwrap().chars().count(), 2_000);
    }

    #[test]
    fn normalize_string_object_null_and_other() {
        assert_eq!(
            normalize_tool_arguments_value("t", Some(&serde_json::json!("{\"a\":1}"))),
            serde_json::json!({"a": 1})
        );
        assert_eq!(
            normalize_tool_arguments_value("t", Some(&serde_json::json!({"b": 2}))),
            serde_json::json!({"b": 2})
        );
        assert_eq!(
            normalize_tool_arguments_value("t", Some(&Value::Null)),
            serde_json::json!({})
        );
        assert_eq!(
            normalize_tool_arguments_value("t", None),
            serde_json::json!({})
        );
        let v = normalize_tool_arguments_value("t", Some(&serde_json::json!(5)));
        assert_eq!(v[INVALID_TOOL_ARGS_MARKER], true);
        assert_eq!(v["error"], "expected JSON object, got number");
    }

    #[test]
    fn finish_sorts_indexes_and_skips_nameless() {
        let mut a = ToolCallAssembler::new();
        assert!(a.update(1, Some("call_b"), Some("write_file"), Some("")));
        assert!(a.update(0, Some("call_a"), Some("read_file"), Some("")));
        assert!(!a.update(1, None, None, Some(r#"{"p":"b"}"#)));
        assert!(!a.update(0, None, None, Some(r#"{"p":"a"}"#)));
        // Nameless index must be dropped.
        assert!(a.update(2, Some("call_c"), None, Some("{}")));
        let calls = a.finish();
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].id, "call_a");
        assert_eq!(calls[0].arguments, serde_json::json!({"p": "a"}));
        assert_eq!(calls[1].id, "call_b");
        assert_eq!(calls[1].arguments, serde_json::json!({"p": "b"}));
    }

    #[test]
    fn into_completed_drops_unfinalized_blocks() {
        // Anthropic truncated-stream semantics: a tool block that never saw
        // content_block_stop must not surface.
        let mut a = ToolCallAssembler::new();
        a.update(0, Some("toolu_1"), Some("read_file"), Some(r#"{"p":"a"}"#));
        a.finalize_block(0);
        a.update(1, Some("toolu_2"), Some("write_file"), Some(r#"{"p":"#));
        let calls = a.into_completed();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].id, "toolu_1");
    }

    #[test]
    fn finalize_block_skips_empty_names_and_missing_indexes() {
        let mut a = ToolCallAssembler::new();
        a.update(0, Some("id0"), Some(""), Some("{}"));
        a.finalize_block(0);
        a.finalize_block(7); // absent — no-op
        assert_eq!(a.into_completed().len(), 0);
    }
}
