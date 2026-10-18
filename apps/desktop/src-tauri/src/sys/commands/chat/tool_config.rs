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
/// capability whose catalog it was not shown.
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
    turn_text: &str,
    capability_switches: Option<&crate::sys::commands::capabilities::CapabilityState>,
) -> (
    Option<Vec<ToolDefinition>>,
    Option<ToolChoice>,
    Option<Arc<crate::core::agi::tools::ToolRegistry>>,
    Option<String>,
) {
    if enable_tools != Some(true) || tool_scope.is_none() {
        debug!("[Chat] Tools disabled: no explicit user-selected tool scope");
        return (None, None, None, None);
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

    let tools::ChatToolSet {
        tools: mut tool_defs,
        mut deferred_mcp,
    } = tools::build_chat_tools_for_turn(registry.as_ref(), Some(mcp_state), turn_text);

    // A capability that is off is not offered: the model is shown only tools
    // it would be allowed to call. The refusal on call stays as the backstop.
    if let Some(switches) = capability_switches {
        tool_defs.retain(|tool| switches.tool_refusal_now(&tool.name).is_none());
        deferred_mcp.retain(|deferred| switches.tool_refusal_now(&deferred.name).is_none());
    }

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
            deferred_mcp.clear();
        }
        ChatToolScope::AgiWork => {
            if !capabilities.agentic {
                warn!(
                    "[Chat] AGI Work tools withheld: selected model lacks verified agentic capability"
                );
                return (None, None, None, None);
            }
        }
    }

    let server_web_search_is_off = capability_switches
        .is_some_and(|switches| switches.tool_refusal_now("web_search").is_some());
    if is_web_focus && !server_web_search_is_off {
        if supports_anthropic_server_web_search(model) {
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
            debug!(
                "Web focus mode active but the catalog lists no Anthropic server web search for {}",
                model
            );
        }
    }

    if !tool_defs.is_empty() {
        info!(
            "[Chat] Enabling {} tools for chat (Claude Desktop-like mode, includes MCP tools)",
            tool_defs.len()
        );
        (
            Some(tool_defs),
            Some(ToolChoice::Auto),
            registry,
            crate::core::mcp::schema_budget::deferred_tools_notice(&deferred_mcp),
        )
    } else {
        debug!("[Chat] No tools available, proceeding without tool support");
        (None, None, None, None)
    }
}

/// What to tell the user when a turn that asked for tools is sent without any
/// because of the selected model. `None` when the turn did not ask for tools
/// or the model is not the reason.
pub(super) fn tools_withheld_notice(
    enable_tools: Option<bool>,
    tool_scope: Option<ChatToolScope>,
    model_capabilities: Option<&ModelCapabilitiesDto>,
    model: &str,
) -> Option<String> {
    if enable_tools != Some(true) {
        return None;
    }
    let scope = tool_scope?;
    let reason = if !model_capabilities.is_some_and(|capabilities| capabilities.tools) {
        "does not support tool calling"
    } else if scope == ChatToolScope::AgiWork
        && !model_capabilities.is_some_and(|capabilities| capabilities.agentic)
    {
        "is not verified for agent work"
    } else {
        return None;
    };
    Some(format!(
        "Tools are off for {model}. This model {reason}, so it answers without them."
    ))
}

const MAX_TOOLS_WITHHELD_NOTICE_KEYS: usize = 2048;

static TOOLS_WITHHELD_NOTIFIED: once_cell::sync::Lazy<
    std::sync::Mutex<std::collections::HashSet<(i64, String)>>,
> = once_cell::sync::Lazy::new(Default::default);

/// True the first time a conversation is told that a given model runs without
/// tools, so the notice is not repeated on every turn.
pub(super) fn is_first_tools_withheld_notice(conversation_id: i64, model: &str) -> bool {
    let mut notified = TOOLS_WITHHELD_NOTIFIED
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if notified.len() >= MAX_TOOLS_WITHHELD_NOTICE_KEYS {
        notified.clear();
    }
    notified.insert((conversation_id, model.to_string()))
}

/// `web_search` is the Anthropic-native server tool, so it is offered only to a
/// catalog model that is served by Anthropic and lists the search capability.
/// An uncatalogued id never qualifies, whatever its name resembles.
fn supports_anthropic_server_web_search(model: &str) -> bool {
    use crate::core::llm::models_config;

    let canonical = models_config::get_canonicalized_id(model);
    models_config::get_all_model_entries()
        .get(&canonical)
        .is_some_and(|entry| {
            entry.capabilities.search
                && crate::core::llm::Provider::from_string(&entry.provider)
                    == Some(crate::core::llm::Provider::Anthropic)
        })
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
    use super::{
        build_tool_definitions, filter_advertised_tool_calls, is_first_tools_withheld_notice,
        normalize_tool_calls, supports_anthropic_server_web_search, tools_withheld_notice,
    };
    use crate::core::llm::sse_parser::StreamingToolCall;
    use crate::core::llm::{ToolCall, ToolDefinition};
    use crate::sys::commands::chat::types::{ChatToolScope, ModelCapabilitiesDto};
    use crate::sys::commands::mcp::McpState;

    #[test]
    fn unknown_model_capabilities_withhold_all_tools_until_provider_discovery() {
        let mcp_state = McpState::new();
        let (tool_defs, _, _, _) = build_tool_definitions(
            Some(true),
            Some(ChatToolScope::AgiWork),
            &mcp_state,
            // The desktop renderer sends no capabilities for an off-catalog local model.
            None,
            false,
            "fixture-local-model:dynamic",
            true,
            "",
            None,
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
        let (tool_defs, _, _, _) = build_tool_definitions(
            Some(true),
            None,
            &mcp_state,
            Some(&capabilities),
            false,
            "fixture-tool-model",
            true,
            "",
            None,
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
        let (tool_defs, _, _, _) = build_tool_definitions(
            Some(true),
            Some(ChatToolScope::WebSearch),
            &mcp_state,
            Some(&capabilities),
            false,
            "fixture-tool-model",
            false,
            "",
            None,
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
        let (tool_defs, _, _, _) = build_tool_definitions(
            Some(true),
            Some(ChatToolScope::AgiWork),
            &mcp_state,
            Some(&capabilities),
            false,
            "fixture-tool-model",
            true,
            "",
            None,
        );

        assert!(tool_defs.is_none());
    }

    #[test]
    fn a_tool_less_model_gets_a_notice_only_when_the_turn_asked_for_tools() {
        let tool_less = ModelCapabilitiesDto::default();
        let tool_capable = ModelCapabilitiesDto {
            tools: true,
            ..Default::default()
        };
        let agentic = ModelCapabilitiesDto {
            tools: true,
            agentic: true,
            ..Default::default()
        };
        let model = "fixture-local-model:dynamic";

        for capabilities in [None, Some(&tool_less)] {
            for scope in [ChatToolScope::WebSearch, ChatToolScope::AgiWork] {
                let notice = tools_withheld_notice(Some(true), Some(scope), capabilities, model)
                    .expect("a tool-less model must be explained");
                assert!(notice.contains(model));
                assert!(notice.contains("does not support tool calling"));
            }
        }

        let not_agentic = tools_withheld_notice(
            Some(true),
            Some(ChatToolScope::AgiWork),
            Some(&tool_capable),
            model,
        )
        .expect("a model withheld from agent work must be explained");
        assert!(not_agentic.contains("not verified for agent work"));

        assert!(tools_withheld_notice(
            Some(true),
            Some(ChatToolScope::WebSearch),
            Some(&tool_capable),
            model
        )
        .is_none());
        assert!(tools_withheld_notice(
            Some(true),
            Some(ChatToolScope::AgiWork),
            Some(&agentic),
            model
        )
        .is_none());
        assert!(tools_withheld_notice(Some(true), None, None, model).is_none());
        assert!(
            tools_withheld_notice(Some(false), Some(ChatToolScope::AgiWork), None, model).is_none()
        );
        assert!(tools_withheld_notice(None, Some(ChatToolScope::AgiWork), None, model).is_none());
    }

    #[test]
    fn the_tools_withheld_notice_is_given_once_per_conversation_and_model() {
        let conversation_id = i64::MIN + 27;
        assert!(is_first_tools_withheld_notice(
            conversation_id,
            "fixture-once-a"
        ));
        assert!(!is_first_tools_withheld_notice(
            conversation_id,
            "fixture-once-a"
        ));
        assert!(is_first_tools_withheld_notice(
            conversation_id,
            "fixture-once-b"
        ));
        assert!(is_first_tools_withheld_notice(
            conversation_id + 1,
            "fixture-once-a"
        ));
    }

    #[test]
    fn server_web_search_follows_the_catalog_not_the_model_name() {
        use crate::core::llm::{models_config, Provider};

        for lookalike in [
            "claude-not-in-the-catalog",
            "fixture-claude-model",
            "CLAUDE",
        ] {
            assert!(
                !supports_anthropic_server_web_search(lookalike),
                "'{lookalike}' is not a catalog model and must not receive the server tool"
            );
        }

        let canonical_entries = || {
            models_config::get_all_model_entries()
                .iter()
                .filter(|(id, _)| models_config::get_canonicalized_id(id) == **id)
        };
        let is_anthropic =
            |provider: &str| Provider::from_string(provider) == Some(Provider::Anthropic);

        for (id, entry) in canonical_entries() {
            assert_eq!(
                supports_anthropic_server_web_search(id),
                entry.capabilities.search && is_anthropic(&entry.provider),
                "catalog entry {id} disagrees with its own capability metadata"
            );
        }
        assert!(
            canonical_entries().any(|(_, entry)| !is_anthropic(&entry.provider)),
            "the catalog must hold a non-Anthropic model for this test to prove anything"
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

    fn agentic_model() -> ModelCapabilitiesDto {
        ModelCapabilitiesDto {
            tools: true,
            agentic: true,
            code_execution: true,
            ..Default::default()
        }
    }

    fn advertised_with(
        switches: &crate::sys::commands::capabilities::CapabilityState,
    ) -> Vec<String> {
        let mcp_state = McpState::new();
        let (tool_defs, _, _, _) = build_tool_definitions(
            Some(true),
            Some(ChatToolScope::AgiWork),
            &mcp_state,
            Some(&agentic_model()),
            false,
            "fixture-tool-model",
            true,
            "",
            Some(switches),
        );
        tool_defs
            .unwrap_or_default()
            .into_iter()
            .map(|tool| tool.name)
            .collect()
    }

    #[test]
    fn a_capability_that_is_off_is_not_offered_to_the_model() {
        use crate::sys::commands::capabilities::{
            tool_to_capability, CapabilityState, SavedSwitches,
        };
        use std::collections::HashMap;

        let all_on = advertised_with(&CapabilityState::new());
        assert!(all_on.iter().any(|name| name == "file_read"));
        assert!(all_on.iter().any(|name| name == "terminal_execute"));

        let files_off = CapabilityState::from_saved(SavedSwitches::Saved(HashMap::from([(
            "fileOperations".to_string(),
            false,
        )])));
        let offered = advertised_with(&files_off);
        let file_tools: Vec<&String> = offered
            .iter()
            .filter(|name| tool_to_capability(name) == Some("fileOperations"))
            .collect();
        assert!(
            file_tools.is_empty(),
            "Files is off, yet the model is offered {file_tools:?}"
        );
        assert!(
            offered.iter().any(|name| name == "terminal_execute"),
            "another capability's tools are still offered"
        );
        assert!(offered.iter().any(|name| name == "todo_write"));
    }
}
