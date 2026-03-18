use crate::core::llm::sse_parser::StreamingToolCall;
use crate::core::llm::{ToolCall, ToolChoice, ToolDefinition};
use crate::sys::commands::chat::tools;
use crate::sys::commands::chat::types::ModelCapabilitiesDto;
use crate::sys::commands::mcp::McpState;
use std::sync::Arc;
use tracing::{debug, info, warn};

/// Build tool definitions for chat, including MCP tools and optional web search injection.
///
/// Returns `(Option<Vec<ToolDefinition>>, Option<ToolChoice>, Option<Arc<ToolRegistry>>)`.
/// The `Arc<ToolRegistry>` is returned so callers can reuse it for tool execution without
/// reconstructing it on every tool call.
pub(super) fn build_tool_definitions(
    enable_tools: Option<bool>,
    mcp_state: &McpState,
    model_capabilities: Option<&ModelCapabilitiesDto>,
    is_web_focus: bool,
    model: &str,
) -> (
    Option<Vec<ToolDefinition>>,
    Option<ToolChoice>,
    Option<Arc<crate::core::agi::tools::ToolRegistry>>,
) {
    if !enable_tools.unwrap_or(true) {
        debug!("[Chat] Tools explicitly disabled by request");
        return (None, None, None);
    }

    let registry = match tools::create_tool_registry_for_schema() {
        Ok(registry) => Some(registry),
        Err(error) => {
            warn!(
                "[Chat] Failed to pre-build ToolRegistry for schema: {}",
                error
            );
            None
        }
    };

    let mut tool_defs = tools::build_chat_tools(registry.as_ref(), Some(mcp_state));

    if let Some(capabilities) = model_capabilities {
        let before_count = tool_defs.len();
        tool_defs = tools::filter_tools_by_capabilities(tool_defs, capabilities);
        if tool_defs.len() < before_count {
            info!(
                "[Chat] Filtered tools by model capabilities: {} -> {} tools",
                before_count,
                tool_defs.len()
            );
        }
    }

    if is_web_focus {
        // web_search is an Anthropic server tool — only inject for Claude models
        if model.to_lowercase().contains("claude") {
            let already_has_web_search = tool_defs.iter().any(|tool| tool.name == "web_search");
            if !already_has_web_search {
                tool_defs.push(ToolDefinition {
                    name: "web_search".to_string(),
                    description: "Search the web for real-time information. Use this for current events, prices, news, and anything requiring up-to-date data.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "The search query"
                            }
                        },
                        "required": ["query"]
                    }),
                    strict: None,
                });
                info!("[Chat] Injected Anthropic web_search server tool for web focus mode");
            }
        } else {
            debug!("Web focus mode active but web_search tool only supported for Claude models (current: {})", model);
        }
    }

    if !tool_defs.is_empty() {
        info!(
            "[Chat] Enabling {} tools for chat (Claude Desktop-like mode, includes MCP tools)",
            tool_defs.len()
        );
        (Some(tool_defs), Some(ToolChoice::Auto), registry)
    } else {
        debug!("[Chat] No tools available, proceeding without tool support");
        (None, None, None)
    }
}

/// Normalize tool call IDs to prevent blank or missing IDs from causing
/// artifact/status update collisions.
pub(super) fn normalize_tool_calls(
    tool_calls: &[ToolCall],
    id_prefix: &str,
) -> Vec<StreamingToolCall> {
    tool_calls
        .iter()
        .enumerate()
        .map(|(index, tool_call)| {
            let mut normalized_id = tool_call.id.clone();
            if normalized_id.trim().is_empty() {
                normalized_id = format!("{}_{}", id_prefix, index);
            }

            StreamingToolCall {
                index,
                id: normalized_id,
                name: if tool_call.name.trim().is_empty() {
                    "unknown_tool".to_string()
                } else {
                    tool_call.name.clone()
                },
                arguments: tool_call.arguments.clone(),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::normalize_tool_calls;
    use crate::core::llm::ToolCall;

    #[test]
    fn normalize_tool_calls_fills_missing_ids_and_names() {
        let normalized = normalize_tool_calls(
            &[ToolCall {
                id: " ".to_string(),
                name: " ".to_string(),
                arguments: "{}".to_string(),
            }],
            "tool_call",
        );

        assert_eq!(normalized.len(), 1);
        assert_eq!(normalized[0].id, "tool_call_0");
        assert_eq!(normalized[0].name, "unknown_tool");
    }
}
