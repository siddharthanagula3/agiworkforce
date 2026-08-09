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
///
/// `skills_offered` reflects whether this turn advertised the skill catalog. When
/// it is false the `skill` tool is withheld too, so the model is never offered a
/// capability whose catalog it was not shown (DESKTOP-SKILLS-EAGER-INJECTION-01).
///
/// TRUST-BOUNDARY: an absent `model_capabilities` payload used to skip capability
/// filtering entirely, and the desktop renderer never sends one — so every model,
/// including a Local one, was offered `image_generate` / `video_generate`. Those
/// two execute against AGI Managed Cloud (`sys/commands/media.rs`), which means
/// the prompt leaves the device the moment the model calls one. Unknown
/// capabilities now close that gate; see `capabilities_assumed_when_unknown`.
pub(super) fn build_tool_definitions(
    enable_tools: Option<bool>,
    mcp_state: &McpState,
    model_capabilities: Option<&ModelCapabilitiesDto>,
    is_web_focus: bool,
    model: &str,
    skills_offered: bool,
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

    if !skills_offered {
        tool_defs.retain(|tool| tool.name != crate::core::agi::tools::SKILL_TOOL_ID);
    }

    let capabilities = match model_capabilities {
        Some(capabilities) => capabilities.clone(),
        None => capabilities_assumed_when_unknown(),
    };
    let before_count = tool_defs.len();
    tool_defs = tools::filter_tools_by_capabilities(tool_defs, &capabilities);
    if tool_defs.len() < before_count {
        info!(
            "[Chat] Filtered tools by model capabilities: {} -> {} tools",
            before_count,
            tool_defs.len()
        );
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

/// Capabilities assumed for a model the caller described no capabilities for —
/// a local Ollama build is the common case, since only catalog models carry
/// capability metadata in the renderer.
///
/// Every gate an unknown model could plausibly satisfy on-device stays open:
/// withholding a tool the model can actually run is a worse failure than offering
/// one it cannot, and that fake-unavailability regression is why `search_web` is
/// deliberately ungated in `tools::required_model_capability`. `image_gen` is the
/// exception because it is the one capability whose tools cross the managed-cloud
/// trust boundary, where guessing wrong leaks the prompt instead of wasting a turn.
fn capabilities_assumed_when_unknown() -> ModelCapabilitiesDto {
    ModelCapabilitiesDto {
        tools: true,
        vision: true,
        computer_use: true,
        search: true,
        code_execution: true,
        image_gen: false,
        agentic: true,
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
    use super::{build_tool_definitions, normalize_tool_calls};
    use crate::core::llm::ToolCall;
    use crate::sys::commands::mcp::McpState;

    #[test]
    fn unknown_model_capabilities_withhold_the_managed_cloud_media_tools() {
        let mcp_state = McpState::new();
        let (tool_defs, _, _) = build_tool_definitions(
            Some(true),
            &mcp_state,
            // The desktop renderer sends no capabilities for an off-catalog local model.
            None,
            false,
            "llama3.3:70b",
            true,
        );

        let names: Vec<String> = tool_defs
            .expect("a tool-capable turn must still be offered tools")
            .into_iter()
            .map(|tool| tool.name)
            .collect();

        for managed_cloud_tool in ["image_generate", "video_generate"] {
            assert!(
                !names.iter().any(|name| name == managed_cloud_tool),
                "'{managed_cloud_tool}' posts the prompt to managed cloud and must not be \
                 offered to a model of unknown capability; offered: {names:?}"
            );
        }

        // The on-device tools survive, so this is a boundary gate and not a
        // blanket withholding that would strip the local agent of its tools.
        assert!(
            names.iter().any(|name| name == "terminal_execute"),
            "locally executed tools must stay available; offered: {names:?}"
        );
    }

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
