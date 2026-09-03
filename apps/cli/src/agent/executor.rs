use serde::{Deserialize, Serialize};

#[cfg(test)]
use crate::models::ToolCallResponse;


/// Represents a tool invocation for execution by tools.rs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub name: String,
    pub args: std::collections::HashMap<String, String>,
}

/// Convert a ToolCallResponse (from native API) to the legacy ToolCall struct.
#[cfg(test)]
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
