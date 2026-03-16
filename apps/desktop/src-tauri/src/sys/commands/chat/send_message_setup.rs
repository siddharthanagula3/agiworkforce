use super::*;

use crate::core::agent::prompt_engineer::PromptEngineer;
use crate::core::llm::{
    cost_calculator::CostCalculator,
    llm_router::{RouterContext, RouterPreferences, RoutingStrategy},
    token_counter::TokenCounter,
    ChatMessage, LLMRequest, Provider, ThinkingParameter,
};
use std::collections::HashSet;
use std::sync::Arc;

#[derive(Debug, Clone, Copy)]
pub(super) struct SendMessageFlags {
    pub agent_mode: bool,
    pub is_deep_research: bool,
    pub is_web_focus: bool,
    pub stream_mode: bool,
    pub incognito: bool,
}

pub(super) struct PreparedSendMessage {
    pub request: ChatSendMessageRequest,
    pub conversation: Conversation,
    pub user_message: Message,
    pub llm_request: LLMRequest,
    pub preferences: RouterPreferences,
    pub provider_enum: Option<Provider>,
    pub model: String,
    pub agent_instruction: String,
    pub memory_handler: memory_handler::ChatMemoryHandler,
    pub tool_registry: Option<Arc<crate::core::agi::tools::ToolRegistry>>,
    pub flags: SendMessageFlags,
    pub cloud_sync_enabled: bool,
}

pub(super) fn log_chat_request(request: &ChatSendMessageRequest, correlation_id: &str) {
    if let Some(attachments) = request.attachments.as_ref() {
        if !attachments.is_empty() {
            let attachment_names: Vec<&str> = attachments.iter().map(|a| a.name.as_str()).collect();
            info!(
                target: "chat",
                correlation_id = %correlation_id,
                attachment_count = attachments.len(),
                attachments = ?attachment_names,
                "Chat message with attachments received"
            );
        }
    }
}

pub(super) fn resolve_request_flags(
    request: &ChatSendMessageRequest,
    app_handle: &tauri::AppHandle,
) -> SendMessageFlags {
    let explicit_model = is_explicit_model_selection(request.model_override.as_deref());
    let agent_mode = if explicit_model {
        request.enable_agent_mode == Some(true)
    } else {
        detect_agent_mode(request.enable_agent_mode, &request.content, app_handle)
    };

    SendMessageFlags {
        agent_mode,
        is_deep_research: matches!(request.focus_mode.as_deref(), Some("deep-research"))
            || request.research_task_id.is_some(),
        is_web_focus: matches!(request.focus_mode.as_deref(), Some("web") | Some("search")),
        stream_mode: request.stream.unwrap_or(false),
        incognito: request.incognito.unwrap_or(false),
    }
}

pub(super) fn resolve_provider_and_model(
    request: &ChatSendMessageRequest,
) -> (Option<Provider>, String) {
    let provider_enum = request
        .provider_override
        .as_deref()
        .or(request.provider.as_deref())
        .and_then(Provider::from_string);

    let model = request
        .model_override
        .clone()
        .or(request.model.clone())
        .unwrap_or_else(|| "gpt-5-nano".to_string());

    (provider_enum, model)
}

pub(super) fn build_router_preferences(
    request: &ChatSendMessageRequest,
    provider_enum: Option<Provider>,
    model: &str,
    plan_tier: String,
) -> RouterPreferences {
    let router_context = request.task_metadata.as_ref().map(|meta| RouterContext {
        intents: meta.intents.clone(),
        requires_vision: meta.requires_vision,
        token_estimate: meta.token_estimate.unwrap_or(0),
        cost_priority: Default::default(),
        plan_tier,
        intent_type: meta.intent_type.clone(),
        model_category: meta.model_category.clone(),
        selected_model: meta.selected_model.clone(),
        suggested_tool_categories: meta.suggested_tool_categories.clone(),
        auto_execute_tools: meta.auto_execute_tools,
        confidence: meta.confidence,
        routing_reason: meta.routing_reason.clone(),
    });

    RouterPreferences {
        provider: provider_enum,
        model: Some(model.to_string()),
        strategy: resolve_routing_strategy(model),
        context: router_context,
        prefer_cloud_credits: request.prefer_cloud_credits,
    }
}

pub(super) async fn prepare_send_message(
    db: &AppDatabase,
    mcp_state: &State<'_, crate::sys::commands::mcp::McpState>,
    project_context_state: &State<'_, crate::sys::commands::project_context::ProjectContextState>,
    memory_state: &State<'_, crate::sys::commands::memory::MemoryState>,
    app_handle: &tauri::AppHandle,
    request: ChatSendMessageRequest,
    provider_enum: Option<Provider>,
    model: String,
    preferences: RouterPreferences,
    flags: SendMessageFlags,
    cloud_sync_enabled: bool,
) -> Result<PreparedSendMessage, String> {
    if flags.incognito {
        debug!("[Chat] Incognito mode active: skipping all persistence");
    }

    let conversation =
        load_or_create_conversation(db, &request, flags.incognito, cloud_sync_enabled)?;
    let (user_message, input_tokens, input_cost) = create_user_message_record(
        db,
        &conversation,
        &request,
        provider_enum,
        &model,
        flags.incognito,
        cloud_sync_enabled,
    )?;

    let history = load_message_history(db, conversation.id, flags.incognito)?;

    let mut llm_messages = vec![ChatMessage {
        role: "system".to_string(),
        content: PromptEngineer::default_system_prompt(),
        tool_calls: None,
        tool_call_id: None,
        multimodal_content: None,
    }];
    debug!("[Chat] Added default AGI Workforce system prompt");

    let memory_handler = memory_handler::ChatMemoryHandler::new(Some(memory_state.manager.clone()))
        .map_err(|e| format!("Failed to initialize memory handler: {e}"))?;

    if !flags.incognito {
        inject_memory_context(
            &memory_handler,
            request.project_folder.as_deref(),
            &mut llm_messages,
        );
    } else {
        debug!("[Chat] Incognito mode: skipping memory injection");
    }

    llm_messages.push(ChatMessage {
        role: "system".to_string(),
        content: build_os_context(),
        tool_calls: None,
        tool_call_id: None,
        multimodal_content: None,
    });
    debug!(
        "[Chat] Added OS context: {} ({})",
        std::env::consts::OS,
        std::env::consts::ARCH
    );

    let effective_folder = resolve_effective_folder(
        project_context_state,
        mcp_state,
        app_handle,
        request.project_folder.as_ref(),
    )
    .await;

    let project_context_for_agent = effective_folder.as_ref().map(|folder| {
        let project_context_content = build_project_context_message(folder);
        llm_messages.push(ChatMessage {
            role: "system".to_string(),
            content: project_context_content.clone(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        });
        project_context_content
    });

    // Inject coding context if project folder exists
    if let Some(ref folder) = effective_folder {
        let folder_path = std::path::Path::new(folder);
        if folder_path.is_dir() {
            let coding_prompt =
                super::prompt_context::build_coding_system_prompt(folder_path);
            if !coding_prompt.is_empty() {
                llm_messages.push(ChatMessage {
                    role: "system".to_string(),
                    content: coding_prompt,
                    tool_calls: None,
                    tool_call_id: None,
                    multimodal_content: None,
                });
                debug!("[Chat] Added coding context for project folder: {}", folder);
            }
        }
    }

    if let Some(custom_instructions) = request
        .custom_instructions
        .as_ref()
        .filter(|value| !value.trim().is_empty())
    {
        llm_messages.push(ChatMessage {
            role: "system".to_string(),
            content: format!("## Additional User Instructions\n\n{}", custom_instructions),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        });
        debug!(
            "[Chat] Added custom instructions to system prompt ({} chars)",
            custom_instructions.len()
        );
    }

    inject_browser_page_context(&mut llm_messages);
    maybe_inject_matching_skills(
        app_handle,
        &conversation,
        &request,
        flags.incognito,
        &mut llm_messages,
    );

    let multimodal_parts =
        process_multimodal_attachments(request.attachments.as_ref(), &model, &request.content);
    let attachment_text_context =
        process_document_attachments(request.attachments.as_ref(), &mut llm_messages);

    let mut agent_instruction = request.content.clone();
    if let Some(context) = project_context_for_agent.as_ref() {
        agent_instruction.push_str("\n\n");
        agent_instruction.push_str(context);
    }
    if let Some(docs) = attachment_text_context.as_ref() {
        agent_instruction.push_str("\n\n");
        agent_instruction.push_str(docs);
    }

    append_history_messages(
        &mut llm_messages,
        &history,
        user_message.id,
        multimodal_parts.as_ref(),
    );

    if let Some(parts) = multimodal_parts.as_ref() {
        debug!(
            "[Chat] Sending message with {} text chars and {} image(s) to model '{}'",
            request.content.len(),
            parts.len(),
            model
        );
    }

    let (chat_tools, tool_choice, tool_registry) = build_tool_definitions(
        request.enable_tools,
        mcp_state,
        request.model_capabilities.as_ref(),
        flags.is_web_focus,
        &model,
    );

    let llm_request = LLMRequest {
        messages: llm_messages,
        model: model.clone(),
        temperature: Some(request.temperature.unwrap_or(DEFAULT_TEMPERATURE)),
        max_tokens: Some(request.max_output_tokens.unwrap_or(DEFAULT_MAX_TOKENS)),
        stream: flags.stream_mode,
        tools: chat_tools.clone(),
        tool_choice: tool_choice.clone(),
        thinking_mode: request.thinking_mode,
        cache_control: build_cache_control(&model),
        thinking: resolve_thinking_parameter(
            &model,
            request.thinking_mode,
            request.thinking_budget,
            chat_tools.is_some(),
        ),
        effort: request.reasoning_effort.clone(),
        ..Default::default()
    };

    let _ = (input_tokens, input_cost);

    Ok(PreparedSendMessage {
        request,
        conversation,
        user_message,
        llm_request,
        preferences,
        provider_enum,
        model,
        agent_instruction,
        memory_handler,
        tool_registry,
        flags,
        cloud_sync_enabled,
    })
}

fn resolve_routing_strategy(model: &str) -> RoutingStrategy {
    match model {
        "auto" => RoutingStrategy::Auto,
        "auto-economy" => RoutingStrategy::AutoEconomy,
        "auto-balanced" => RoutingStrategy::AutoBalanced,
        "auto-premium" => RoutingStrategy::AutoPremium,
        _ => RoutingStrategy::Auto,
    }
}

fn build_cache_control(model: &str) -> Option<crate::core::llm::CacheControl> {
    if model.to_lowercase().contains("claude") {
        Some(crate::core::llm::CacheControl {
            cache_type: "ephemeral".to_string(),
        })
    } else {
        None
    }
}

fn resolve_thinking_parameter(
    model: &str,
    thinking_mode: Option<bool>,
    thinking_budget: Option<u32>,
    has_tools: bool,
) -> Option<ThinkingParameter> {
    let is_claude_model = model.to_lowercase().contains("claude");

    if thinking_mode == Some(true) {
        let budget = thinking_budget.unwrap_or(0);
        if budget > 0 {
            Some(ThinkingParameter::Budget {
                thinking_type: "enabled".to_string(),
                budget_tokens: budget,
            })
        } else if is_claude_model && model.contains("opus-4") {
            Some(ThinkingParameter::Adaptive {
                thinking_type: "adaptive".to_string(),
            })
        } else {
            Some(ThinkingParameter::Enabled(true))
        }
    } else if is_claude_model && model.contains("opus-4") && has_tools && thinking_mode.is_none() {
        Some(ThinkingParameter::Adaptive {
            thinking_type: "adaptive".to_string(),
        })
    } else {
        None
    }
}

fn load_or_create_conversation(
    db: &AppDatabase,
    request: &ChatSendMessageRequest,
    incognito: bool,
    cloud_sync_enabled: bool,
) -> Result<Conversation, String> {
    if incognito {
        return Ok(Conversation {
            id: -1,
            title: "Incognito".to_string(),
            user_id: request.user_id.clone(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        });
    }

    let conn = db.connection()?;
    if let Some(conv_id) = request.conversation_id {
        repository::get_conversation(&conn, conv_id, &request.user_id)
            .map_err(|e| format!("Failed to get conversation: {e}"))
    } else {
        let title = request.content.chars().take(50).collect::<String>();
        let id = repository::create_conversation(&conn, title, request.user_id.clone())
            .map_err(|e| format!("Failed to create conversation: {e}"))?;
        let conversation = repository::get_conversation(&conn, id, &request.user_id)
            .map_err(|e| format!("Failed to get new conversation: {e}"))?;
        if cloud_sync_enabled {
            supabase_sync::spawn_sync_conversation(conversation.clone());
        }
        Ok(conversation)
    }
}

fn create_user_message_record(
    db: &AppDatabase,
    conversation: &Conversation,
    request: &ChatSendMessageRequest,
    provider_enum: Option<Provider>,
    model: &str,
    incognito: bool,
    cloud_sync_enabled: bool,
) -> Result<(Message, u32, f64), String> {
    let temp_chat_msg = ChatMessage {
        role: "user".to_string(),
        content: request.content.clone(),
        tool_calls: None,
        tool_call_id: None,
        multimodal_content: None,
    };
    let input_tokens = TokenCounter::estimate_prompt_tokens(&[temp_chat_msg]);
    let input_cost = provider_enum
        .map(|provider| CostCalculator::new().calculate(provider, model, input_tokens, 0))
        .unwrap_or(0.0);

    let message = if incognito {
        Message {
            id: -1,
            conversation_id: conversation.id,
            user_id: request.user_id.clone(),
            role: MessageRole::User,
            content: request.content.clone(),
            tokens: Some(input_tokens as i32),
            cost: Some(input_cost),
            provider: provider_enum.map(|provider| provider.as_string().to_string()),
            model: Some(model.to_string()),
            created_at: Utc::now(),
            parent_message_id: None,
            branch_id: Some("main".to_string()),
        }
    } else {
        let conn = db.connection()?;
        let message = Message {
            id: 0,
            conversation_id: conversation.id,
            user_id: request.user_id.clone(),
            role: MessageRole::User,
            content: request.content.clone(),
            tokens: Some(input_tokens as i32),
            cost: Some(input_cost),
            provider: provider_enum.map(|provider| provider.as_string().to_string()),
            model: Some(model.to_string()),
            created_at: Utc::now(),
            parent_message_id: None,
            branch_id: Some("main".to_string()),
        };
        let id = repository::create_message(&conn, &message)
            .map_err(|e| format!("Failed to save user message: {e}"))?;
        let saved_message = repository::get_message(&conn, id)
            .map_err(|e| format!("Failed to retrieve user message: {e}"))?;
        if cloud_sync_enabled {
            supabase_sync::spawn_sync_message(saved_message.clone());
        }
        saved_message
    };

    Ok((message, input_tokens, input_cost))
}

fn load_message_history(
    db: &AppDatabase,
    conversation_id: i64,
    incognito: bool,
) -> Result<Vec<Message>, String> {
    if incognito {
        return Ok(Vec::new());
    }

    let conn = db.connection()?;
    repository::list_messages(&conn, conversation_id)
        .map_err(|e| format!("Failed to load message history: {e}"))
}

async fn resolve_effective_folder(
    project_context_state: &State<'_, crate::sys::commands::project_context::ProjectContextState>,
    mcp_state: &State<'_, crate::sys::commands::mcp::McpState>,
    app_handle: &tauri::AppHandle,
    requested_folder: Option<&String>,
) -> Option<String> {
    if let Some(folder) = requested_folder {
        let previous_folder = project_context_state.get_folder().await;
        let folder_changed = previous_folder.as_deref() != Some(folder.as_str());
        project_context_state.set_folder(folder.clone()).await;
        if folder_changed {
            if let Err(err) = mcp_state.reload_active_config(app_handle).await {
                warn!(
                    "[Chat] Failed to reload MCP config for project folder '{}': {}",
                    folder, err
                );
            }
        }
        return Some(folder.clone());
    }

    let ctx = project_context_state.get_context().await;
    if ctx.is_valid {
        ctx.folder.clone()
    } else {
        let home_fallback = dirs::home_dir().map(|home| home.to_string_lossy().to_string());
        if home_fallback.is_some() {
            debug!("[Chat] No project folder set, falling back to home directory");
        }
        home_fallback
    }
}

fn maybe_inject_matching_skills(
    app_handle: &tauri::AppHandle,
    conversation: &Conversation,
    request: &ChatSendMessageRequest,
    incognito: bool,
    llm_messages: &mut Vec<ChatMessage>,
) {
    if !request.auto_inject_skills.unwrap_or(true) || incognito {
        return;
    }

    use crate::core::skills::SkillSourceFilter;

    let skills = app_handle
        .try_state::<crate::sys::commands::skills::SkillsState>()
        .map(|state| state.manager.skills_by_source(SkillSourceFilter::All))
        .unwrap_or_default();

    let msg_lower = request.content.to_lowercase();
    let msg_tokens: HashSet<String> = msg_lower
        .split(|c: char| c.is_whitespace() || c.is_ascii_punctuation())
        .filter(|word| !word.is_empty() && word.len() > 1)
        .map(String::from)
        .collect();

    if msg_tokens.is_empty() {
        return;
    }

    let mut skill_matches: Vec<(String, String, f64)> = skills
        .iter()
        .filter_map(|skill| {
            let skill_text = format!("{} {}", skill.name, skill.description).to_lowercase();
            let skill_tokens: HashSet<String> = skill_text
                .split(|c: char| c.is_whitespace() || c.is_ascii_punctuation())
                .filter(|word| !word.is_empty() && word.len() > 1)
                .map(String::from)
                .collect();
            if skill_tokens.is_empty() {
                return None;
            }

            let intersection = msg_tokens.intersection(&skill_tokens).count() as f64;
            let union = msg_tokens.union(&skill_tokens).count() as f64;
            let mut score = if union > 0.0 {
                intersection / union
            } else {
                0.0
            };

            if msg_lower.contains(&skill.name.to_lowercase()) {
                score += 0.3;
            }

            if score > 0.15 {
                Some((skill.name.clone(), skill.to_context_string(), score))
            } else {
                None
            }
        })
        .collect();

    skill_matches.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));
    skill_matches.truncate(2);

    if skill_matches.is_empty() {
        return;
    }

    let skill_names: Vec<String> = skill_matches
        .iter()
        .map(|(name, _, _)| name.clone())
        .collect();

    debug!(
        "[Chat] Auto-injecting {} skill(s): {:?}",
        skill_matches.len(),
        skill_names
    );

    for (name, context, score) in &skill_matches {
        llm_messages.push(ChatMessage {
            role: "system".to_string(),
            content: format!(
                "## Auto-Injected Skill: {} (relevance: {:.2})\n\n{}",
                name, score, context
            ),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        });
    }

    let _ = app_handle.emit(
        "chat:skills-injected",
        serde_json::json!({
            "conversation_id": conversation.id,
            "skills": skill_names,
        }),
    );
}

#[cfg(test)]
mod tests {
    use super::{resolve_routing_strategy, resolve_thinking_parameter};
    use crate::core::llm::llm_router::RoutingStrategy;
    use crate::core::llm::ThinkingParameter;

    #[test]
    fn routing_strategy_maps_auto_variants() {
        assert!(matches!(
            resolve_routing_strategy("auto-economy"),
            RoutingStrategy::AutoEconomy
        ));
        assert!(matches!(
            resolve_routing_strategy("auto-balanced"),
            RoutingStrategy::AutoBalanced
        ));
        assert!(matches!(
            resolve_routing_strategy("auto-premium"),
            RoutingStrategy::AutoPremium
        ));
        assert!(matches!(
            resolve_routing_strategy("gpt-5.4"),
            RoutingStrategy::Auto
        ));
    }

    #[test]
    fn opus_tool_workflows_default_to_adaptive_thinking() {
        let thinking = resolve_thinking_parameter("claude-opus-4.6", None, None, true);
        assert!(matches!(thinking, Some(ThinkingParameter::Adaptive { .. })));
    }
}
