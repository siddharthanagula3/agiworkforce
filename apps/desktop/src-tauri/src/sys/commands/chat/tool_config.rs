use crate::core::llm::sse_parser::StreamingToolCall;
use crate::core::llm::{ToolCall, ToolChoice, ToolDefinition};
use crate::sys::commands::chat::tools;
use crate::sys::commands::chat::types::{ChatToolScope, ModelCapabilitiesDto};
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
/// filtering entirely, and the desktop renderer never sends one, so every model,
/// including a Local one, was offered `image_generate` / `video_generate`. Those
/// two execute against AGI Managed Cloud (`sys/commands/media.rs`), which means
/// the prompt leaves the device the moment the model calls one. Unknown
/// capabilities now close that gate; see `capabilities_assumed_when_unknown`.
pub(super) fn build_tool_definitions(
    enable_tools: Option<bool>,
    tool_scope: Option<ChatToolScope>,
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
    if enable_tools != Some(true) || tool_scope.is_none() {
        debug!("[Chat] Tools disabled: no explicit user-selected tool scope");
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

    match tool_scope.expect("checked above") {
        ChatToolScope::WebSearch => {
            // Local Web search is a narrow network permission. It never grants
            // file, shell, MCP, browser-control, memory, or connector tools.
            tool_defs.retain(|tool| tool.name == "search_web");
        }
        ChatToolScope::AgiWork => {
            if !capabilities.agentic {
                warn!(
                    "[Chat] AGI Work tools withheld: selected model lacks verified agentic capability"
                );
                return (None, None, None);
            }
        }
    }

    if is_web_focus {
        // web_search is an Anthropic server tool, only inject for Claude models
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

/// Capabilities assumed for a model the caller described no capabilities for.
/// a local Ollama build is the common case, since only catalog models carry
/// capability metadata in the renderer.
///
/// Capability discovery is provider-owned. An absent or malformed payload is
/// not evidence that a dynamic Local model supports function calls, vision,
/// browser control, search, code execution, or agentic workflows.
fn capabilities_assumed_when_unknown() -> ModelCapabilitiesDto {
    ModelCapabilitiesDto {
        tools: false,
        vision: false,
        computer_use: false,
        search: false,
        code_execution: false,
        image_gen: false,
        agentic: false,
        thinking: false,
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

/// Keep only tool calls that were present in the exact request sent to the
/// provider. Some local function-calling models can emit a remembered or
/// prompt-shaped tool call even when `tools` was omitted. Treating that output
/// as authorization would let model text cross the privileged execution
/// boundary, so unadvertised names are rejected before any event or executor is
/// reached.
pub(super) fn filter_advertised_tool_calls(
    tool_calls: Vec<StreamingToolCall>,
    advertised_tools: Option<&[ToolDefinition]>,
) -> (Vec<StreamingToolCall>, Vec<String>) {
    let advertised: std::collections::HashSet<&str> = advertised_tools
        .unwrap_or_default()
        .iter()
        .map(|tool| tool.name.as_str())
        .collect();

    let mut accepted = Vec::with_capacity(tool_calls.len());
    let mut rejected = Vec::new();
    for tool_call in tool_calls {
        if advertised.contains(tool_call.name.as_str()) {
            accepted.push(tool_call);
        } else {
            rejected.push(tool_call.name);
        }
    }
    (accepted, rejected)
}

#[cfg(test)]
mod tests {
    use super::{build_tool_definitions, filter_advertised_tool_calls, normalize_tool_calls};
    use crate::core::llm::sse_parser::StreamingToolCall;
    use crate::core::llm::{ToolCall, ToolDefinition};
    use crate::sys::commands::chat::types::{ChatToolScope, ModelCapabilitiesDto};
    use crate::sys::commands::mcp::McpState;

    #[test]
    fn unknown_model_capabilities_withhold_all_tools_until_provider_discovery() {
        let mcp_state = McpState::new();
        let (tool_defs, _, _) = build_tool_definitions(
            Some(true),
            Some(ChatToolScope::AgiWork),
            &mcp_state,
            // The desktop renderer sends no capabilities for an off-catalog local model.
            None,
            false,
            "fixture-local-model:dynamic",
            true,
        );

        assert!(
            tool_defs.is_none(),
            "unknown capability metadata must not be promoted into tool support"
        );
    }

    #[test]
    fn absent_scope_withholds_tools_even_for_a_tool_capable_model() {
        let mcp_state = McpState::new();
        let capabilities = ModelCapabilitiesDto {
            tools: true,
            agentic: true,
            ..Default::default()
        };
        let (tool_defs, _, _) = build_tool_definitions(
            Some(true),
            None,
            &mcp_state,
            Some(&capabilities),
            false,
            "fixture-tool-model",
            true,
        );

        assert!(tool_defs.is_none());
    }

    #[test]
    fn web_search_scope_exposes_only_the_generic_search_tool() {
        let mcp_state = McpState::new();
        let capabilities = ModelCapabilitiesDto {
            tools: true,
            ..Default::default()
        };
        let (tool_defs, _, _) = build_tool_definitions(
            Some(true),
            Some(ChatToolScope::WebSearch),
            &mcp_state,
            Some(&capabilities),
            false,
            "fixture-tool-model",
            false,
        );

        let names: Vec<&str> = tool_defs
            .as_deref()
            .unwrap_or_default()
            .iter()
            .map(|tool| tool.name.as_str())
            .collect();
        assert_eq!(names, vec!["search_web"]);
    }

    #[test]
    fn agi_work_scope_requires_verified_agentic_capability() {
        let mcp_state = McpState::new();
        let capabilities = ModelCapabilitiesDto {
            tools: true,
            agentic: false,
            ..Default::default()
        };
        let (tool_defs, _, _) = build_tool_definitions(
            Some(true),
            Some(ChatToolScope::AgiWork),
            &mcp_state,
            Some(&capabilities),
            false,
            "fixture-tool-model",
            true,
        );

        assert!(tool_defs.is_none());
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

    #[test]
    fn unadvertised_provider_tool_calls_are_rejected() {
        let calls = vec![
            StreamingToolCall {
                index: 0,
                id: "allowed".to_string(),
                name: "fixture_read".to_string(),
                arguments: "{}".to_string(),
            },
            StreamingToolCall {
                index: 1,
                id: "blocked".to_string(),
                name: "terminal_execute".to_string(),
                arguments: "{}".to_string(),
            },
        ];
        let advertised = vec![ToolDefinition {
            name: "fixture_read".to_string(),
            description: "Synthetic test tool".to_string(),
            parameters: serde_json::json!({"type": "object"}),
            strict: None,
        }];

        let (accepted, rejected) = filter_advertised_tool_calls(calls, Some(advertised.as_slice()));
        assert_eq!(accepted.len(), 1);
        assert_eq!(accepted[0].name, "fixture_read");
        assert_eq!(rejected, vec!["terminal_execute"]);
    }

    #[test]
    fn no_advertised_tools_rejects_every_provider_call() {
        let calls = vec![StreamingToolCall {
            index: 0,
            id: "blocked".to_string(),
            name: "terminal_execute".to_string(),
            arguments: "{}".to_string(),
        }];

        let (accepted, rejected) = filter_advertised_tool_calls(calls, None);
        assert!(accepted.is_empty());
        assert_eq!(rejected, vec!["terminal_execute"]);
    }
}
