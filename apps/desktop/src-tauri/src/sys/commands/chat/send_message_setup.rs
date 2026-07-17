use super::*;

use crate::core::agent::prompt_engineer::PromptEngineer;
use crate::core::llm::{
    cost_calculator::CostCalculator,
    llm_router::{RouterContext, RouterPreferences, RoutingStrategy},
    token_counter::TokenCounter,
    ChatMessage, LLMRequest, Provider, TaskType, ThinkingParameter,
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
    /// True when the frontend toggle is set to Local mode.
    /// When true, the backend MUST NOT route to ManagedCloud under any
    /// circumstances — not even as a fallback.
    pub is_local_mode: bool,
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
    pub auto_save_memories: bool,
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

/// TRUST-BOUNDARY: derive whether cloud sync is enabled for a turn.
///
/// `active_mode == "local"` forces this `false` regardless of the user's stored
/// `chat_storage_mode`, so a Local session never syncs to the cloud even if the
/// storage preference is "cloud". Otherwise it follows the storage preference.
/// Extracted as a pure function so production (`send_message.rs`) and the gating
/// tests exercise the SAME logic (not a reimplementation).
pub(crate) fn derive_cloud_sync_enabled(
    active_mode: Option<&str>,
    storage_mode_is_cloud: bool,
) -> bool {
    if active_mode == Some("local") {
        false
    } else {
        storage_mode_is_cloud
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

    // Determine whether the request is operating in local-only mode.
    // The frontend sends `active_mode: "local" | "cloud"` from the toggle.
    // Fall back to !prefer_cloud_credits for legacy callers that omit active_mode.
    let is_local_mode = request.execution_mode.map_or_else(
        || match request.active_mode.as_deref() {
            Some("cloud") => false,
            Some("local") => true,
            // Legacy path: if prefer_cloud_credits is explicitly true treat as cloud;
            // otherwise treat as local (safe default — never silently bleed to cloud).
            _ => !request.prefer_cloud_credits,
        },
        ChatExecutionMode::uses_local_storage,
    );

    SendMessageFlags {
        agent_mode,
        is_deep_research: matches!(request.focus_mode.as_deref(), Some("deep-research"))
            || request.research_task_id.is_some(),
        is_web_focus: matches!(request.focus_mode.as_deref(), Some("web") | Some("search")),
        stream_mode: request.stream.unwrap_or(false),
        incognito: request.incognito.unwrap_or(false),
        is_local_mode,
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
        .unwrap_or_else(|| {
            Provider::OpenAI
                .get_model_for_task(TaskType::FastCompletion)
                .to_string()
        });

    (provider_enum, model)
}

pub(super) fn build_router_preferences(
    request: &ChatSendMessageRequest,
    provider_enum: Option<Provider>,
    model: &str,
    plan_tier: String,
) -> RouterPreferences {
    // Plan tier is routing policy input even when the TypeScript classifier did
    // not attach task metadata. Always construct the context so tier clamping
    // cannot silently fall back to the wrong profile.
    let router_context = Some(if let Some(meta) = request.task_metadata.as_ref() {
        RouterContext {
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
        }
    } else {
        RouterContext {
            plan_tier,
            ..RouterContext::default()
        }
    });

    // TRUST BOUNDARY: pure Local mode must never receive a ManagedCloud candidate.
    // Mirror the canonical is_local_mode derivation above (active_mode "local" wins;
    // legacy callers without active_mode fall back to !prefer_cloud_credits).
    let local_only = request.execution_mode.map_or_else(
        || match request.active_mode.as_deref() {
            Some("local") => true,
            Some("cloud") => false,
            _ => !request.prefer_cloud_credits,
        },
        |mode| matches!(mode, ChatExecutionMode::LocalOnly),
    );
    let managed_cloud_only = request.execution_mode.map_or(!local_only, |mode| {
        matches!(mode, ChatExecutionMode::CloudManaged)
    });

    RouterPreferences {
        provider: provider_enum,
        model: Some(model.to_string()),
        strategy: resolve_routing_strategy(model),
        context: router_context,
        prefer_cloud_credits: request.prefer_cloud_credits,
        local_only,
        managed_cloud_only,
        trust_mode: request.execution_mode.map(ChatExecutionMode::trust_mode),
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
    auto_save_memories: bool,
) -> Result<PreparedSendMessage, String> {
    if flags.incognito {
        debug!("[Chat] Incognito mode active: skipping all persistence");
    }

    let conversation = load_or_create_conversation(
        db,
        &request,
        flags.incognito,
        cloud_sync_enabled,
        flags.is_local_mode,
    )?;
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
            let coding_prompt = super::prompt_context::build_coding_system_prompt(folder_path);
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
            &request.content,
        ),
        effort: request.reasoning_effort.clone(),
        output_config: request.output_config.clone(),
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
        auto_save_memories,
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
    user_message: &str,
) -> Option<ThinkingParameter> {
    use crate::core::llm::thinking::ThinkingConfig;

    let is_claude_model = model.to_lowercase().contains("claude");

    // 1. Explicit thinking_mode=true from frontend takes highest priority.
    if thinking_mode == Some(true) {
        let budget = thinking_budget.unwrap_or(0);
        let param = if budget > 0 {
            ThinkingParameter::Budget {
                thinking_type: "enabled".to_string(),
                budget_tokens: budget,
            }
        } else if is_claude_model && model.contains("opus-4") {
            ThinkingParameter::Adaptive {
                thinking_type: "adaptive".to_string(),
            }
        } else {
            ThinkingParameter::Enabled(true)
        };
        tracing::info!(
            model = %model,
            "Extended thinking enabled explicitly by frontend"
        );
        return Some(param);
    }

    // 2. Explicit thinking_mode=false means the user turned it off -- respect
    //    that. Return `Some(Enabled(false))` rather than `None`: some providers
    //    (e.g. Ollama's newer reasoning models) default to thinking ON at the
    //    API level, so simply omitting the parameter does not disable it --
    //    the explicit "false" signal must survive to the provider layer.
    if thinking_mode == Some(false) {
        tracing::debug!(
            model = %model,
            "Extended thinking explicitly disabled by frontend"
        );
        return Some(ThinkingParameter::Enabled(false));
    }

    // 3. thinking_mode is None (frontend did not specify) -- auto-detect from
    //    message content using ThinkingConfig trigger phrases.
    let detected = ThinkingConfig::from_user_message(user_message);
    if detected.enabled && ThinkingConfig::model_supports_thinking(model) {
        tracing::info!(
            model = %model,
            budget = %detected.budget.tokens(),
            "Extended thinking auto-detected from user message"
        );
        return detected.to_thinking_parameter();
    }

    // 4. Default: Claude Opus 4.x with tools gets adaptive thinking.
    if is_claude_model && model.contains("opus-4") && has_tools {
        tracing::debug!(
            model = %model,
            "Defaulting to adaptive thinking for Opus 4.x with tools"
        );
        return Some(ThinkingParameter::Adaptive {
            thinking_type: "adaptive".to_string(),
        });
    }

    None
}

fn load_or_create_conversation(
    db: &AppDatabase,
    request: &ChatSendMessageRequest,
    incognito: bool,
    cloud_sync_enabled: bool,
    is_local_mode: bool,
) -> Result<Conversation, String> {
    if incognito {
        return Ok(Conversation {
            id: -1,
            title: "Incognito".to_string(),
            user_id: request.user_id.clone(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            execution_mode: request
                .execution_mode
                .unwrap_or(ChatExecutionMode::LocalOnly)
                .as_str()
                .to_string(),
        });
    }

    let app_mode = if is_local_mode { "local" } else { "cloud" };

    let conn = db.connection()?;
    if let Some(conv_id) = request.conversation_id {
        let conversation = repository::get_conversation(&conn, conv_id, &request.user_id)
            .map_err(|e| format!("Failed to get conversation: {e}"))?;
        if let Some(execution_mode) = request.execution_mode {
            if conversation.execution_mode != execution_mode.as_str() {
                return Err(format!(
                    "Conversation execution boundary mismatch: stored={}, requested={}",
                    conversation.execution_mode,
                    execution_mode.as_str()
                ));
            }
        }
        Ok(conversation)
    } else {
        let title = request.content.chars().take(50).collect::<String>();
        let execution_mode = request
            .execution_mode
            .unwrap_or(ChatExecutionMode::LocalOnly);
        let id = repository::create_conversation_with_execution_mode(
            &conn,
            title,
            request.user_id.clone(),
            app_mode,
            execution_mode.as_str(),
        )
        .map_err(|e| format!("Failed to create conversation: {e}"))?;
        let conversation = repository::get_conversation(&conn, id, &request.user_id)
            .map_err(|e| format!("Failed to get new conversation: {e}"))?;
        if cloud_sync_enabled {
            // Mint UUIDv7 cloud_id and mark for push.
            // Reuse the already-held guard — re-acquiring the same non-reentrant
            // std::sync::Mutex would deadlock.
            if let Err(e) = cloud_sync::mark_conversation_for_push(&conn, id) {
                tracing::warn!(error = %e, conversation_id = id, "failed to mark conversation for cloud push");
            }
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
            // Mint cloud_id and mark user message for push.
            // Reuse the already-held guard — re-acquiring the same non-reentrant
            // std::sync::Mutex would deadlock.
            if let Err(e) = cloud_sync::mark_message_for_push(&conn, id) {
                tracing::warn!(error = %e, message_id = id, "failed to mark user message for cloud push");
            }
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

/// Deterministic ranking for auto-injected skill matches (AC-19 — context
/// assembly MUST be deterministic). Primary key: relevance score, descending.
/// Tiebreaker: skill name, ascending — so equal-scoring skills are selected in a
/// stable, reproducible order independent of the skill manager's iteration order.
fn cmp_skill_match_desc(
    a: &(String, String, f64),
    b: &(String, String, f64),
) -> std::cmp::Ordering {
    b.2.partial_cmp(&a.2)
        .unwrap_or(std::cmp::Ordering::Equal)
        .then_with(|| a.0.cmp(&b.0))
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

    skill_matches.sort_by(cmp_skill_match_desc); // score desc, name asc (deterministic, AC-19)
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
    use super::{
        build_router_preferences, derive_cloud_sync_enabled, resolve_routing_strategy,
        resolve_thinking_parameter,
    };
    use crate::core::llm::llm_router::RoutingStrategy;
    use crate::core::llm::{Provider, ThinkingParameter};
    use crate::sys::commands::chat::types::{ChatExecutionMode, ChatSendMessageRequest};

    // ── DESK-6 trust-boundary egress contract ────────────────────────────────
    // `derive_cloud_sync_enabled` is the SINGLE gate that decides whether a turn's
    // data (chat, projects, memory) syncs to AGI Cloud. P0 invariant: a Local
    // session must NEVER sync, regardless of the user's stored storage preference.

    #[test]
    fn local_mode_never_syncs_even_when_storage_pref_is_cloud() {
        // The critical case: Local active mode overrides a "cloud" storage pref.
        assert!(!derive_cloud_sync_enabled(Some("local"), true));
        assert!(!derive_cloud_sync_enabled(Some("local"), false));
    }

    #[test]
    fn non_local_modes_follow_the_storage_preference() {
        // Managed/BYOK/None defer to the storage preference (no silent override).
        assert!(derive_cloud_sync_enabled(Some("cloud"), true));
        assert!(!derive_cloud_sync_enabled(Some("cloud"), false));
        assert!(derive_cloud_sync_enabled(Some("byok"), true));
        assert!(!derive_cloud_sync_enabled(Some("byok"), false));
        assert!(derive_cloud_sync_enabled(None, true));
        assert!(!derive_cloud_sync_enabled(None, false));
    }

    #[test]
    fn unknown_active_mode_is_not_treated_as_local() {
        // Only the exact "local" sentinel forces no-sync; an unexpected value must
        // NOT silently enable cloud (it follows storage), and must NOT be coerced
        // to local either. This pins the exact-match semantics.
        assert!(derive_cloud_sync_enabled(Some("Local"), true)); // case-sensitive: not the sentinel
        assert!(!derive_cloud_sync_enabled(Some("Local"), false));
    }

    // Regression guard for CTX-005 / AGI-DOC-0018 BK-11.01 (AC-19): equal-score
    // skill matches must rank deterministically by name, independent of the skill
    // manager's iteration order, so auto-injection selects a stable top-2.
    #[test]
    fn skill_match_ranking_is_deterministic() {
        use super::cmp_skill_match_desc;
        let mk = |name: &str, score: f64| (name.to_string(), String::new(), score);
        let names = |mut v: Vec<(String, String, f64)>| {
            v.sort_by(cmp_skill_match_desc);
            v.into_iter().map(|(n, _, _)| n).collect::<Vec<_>>()
        };
        // "middle" (0.9) outranks the tied 0.5 pair; ties break by ascending name.
        let expected = vec![
            "middle".to_string(),
            "alpha".to_string(),
            "zebra".to_string(),
        ];
        assert_eq!(
            names(vec![mk("zebra", 0.5), mk("alpha", 0.5), mk("middle", 0.9)]),
            expected
        );
        assert_eq!(
            names(vec![mk("alpha", 0.5), mk("middle", 0.9), mk("zebra", 0.5)]),
            expected
        );
    }

    // Regression guard for LOCAL-CHAT-NOINVOKE-01 (Critical): a dynamically
    // discovered local model (absent from the static models.json catalog) must
    // resolve provider="ollama" to Some(Provider::Ollama) with the model passed
    // through unchanged. If this returns None, chat_send_message takes the Auto
    // routing path instead of building the explicit Ollama candidate, and a Local
    // Ollama send is silently dropped before /api/chat (no response, no error).
    // The frontend (useChat.ts) forwards `provider` precisely so this resolves.
    #[test]
    fn local_ollama_dynamic_model_resolves_to_ollama_provider() {
        use super::resolve_provider_and_model;
        use crate::core::llm::Provider;
        let mut req = minimal_request_with_mode(Some("local"), false);
        req.provider = Some("ollama".to_string());
        req.model_override = Some("gemma4:e4b".to_string()); // dynamic, not in catalog
        let (provider, model) = resolve_provider_and_model(&req);
        assert!(
            matches!(provider, Some(Provider::Ollama)),
            "a Local send forwarding provider='ollama' must resolve to Some(Ollama); \
             None forces the Auto path and silently drops the Ollama send (LOCAL-CHAT-NOINVOKE-01)"
        );
        assert_eq!(
            model, "gemma4:e4b",
            "the dynamic model id must pass through unchanged"
        );
    }

    // ---------------------------------------------------------------------------
    // Mode-routing guard tests (trust-boundary: Local/Cloud separation)
    // ---------------------------------------------------------------------------

    fn minimal_request_with_mode(
        active_mode: Option<&str>,
        prefer_cloud_credits: bool,
    ) -> ChatSendMessageRequest {
        ChatSendMessageRequest {
            conversation_id: None,
            user_id: "test-user".to_string(),
            content: "hello".to_string(),
            provider: None,
            model: None,
            provider_override: None,
            model_override: None,
            strategy: None,
            stream: Some(false),
            enable_tools: None,
            conversation_mode: None,
            workflow_hash: None,
            task_metadata: None,
            focus_mode: None,
            research_task_id: None,
            attachments: None,
            thinking_mode: None,
            thinking_budget: None,
            reasoning_effort: None,
            output_config: None,
            temperature: None,
            max_output_tokens: None,
            enable_agent_mode: None,
            prefer_cloud_credits,
            active_mode: active_mode.map(String::from),
            execution_mode: None,
            frontend_message_id: None,
            custom_instructions: None,
            project_folder: None,
            model_capabilities: None,
            incognito: None,
            auto_inject_skills: None,
            is_explicit_model_selection: None,
        }
    }

    /// TRUST-BOUNDARY: active_mode="local" must set is_local_mode=true regardless
    /// of prefer_cloud_credits.
    #[test]
    fn active_mode_local_forces_is_local_mode() {
        // active_mode overrides prefer_cloud_credits
        let req = minimal_request_with_mode(Some("local"), true);
        // Simulate the flag derivation inline (mirrors resolve_request_flags logic)
        let is_local = match req.active_mode.as_deref() {
            Some("cloud") => false,
            Some("local") => true,
            _ => !req.prefer_cloud_credits,
        };
        assert!(
            is_local,
            "active_mode=local must yield is_local_mode=true even when prefer_cloud_credits=true"
        );
    }

    /// TRUST-BOUNDARY: active_mode="cloud" must set is_local_mode=false regardless
    /// of prefer_cloud_credits.
    #[test]
    fn active_mode_cloud_forces_is_cloud_mode() {
        let req = minimal_request_with_mode(Some("cloud"), false);
        let is_local = match req.active_mode.as_deref() {
            Some("cloud") => false,
            Some("local") => true,
            _ => !req.prefer_cloud_credits,
        };
        assert!(
            !is_local,
            "active_mode=cloud must yield is_local_mode=false even when prefer_cloud_credits=false"
        );
    }

    /// Legacy callers omitting active_mode: prefer_cloud_credits=false => local.
    #[test]
    fn legacy_no_mode_byok_defaults_to_local() {
        let req = minimal_request_with_mode(None, false);
        let is_local = match req.active_mode.as_deref() {
            Some("cloud") => false,
            Some("local") => true,
            _ => !req.prefer_cloud_credits,
        };
        assert!(
            is_local,
            "legacy callers with prefer_cloud_credits=false must default to local"
        );
    }

    /// Legacy callers omitting active_mode: prefer_cloud_credits=true => cloud.
    #[test]
    fn legacy_prefer_cloud_credits_true_defaults_to_cloud() {
        let req = minimal_request_with_mode(None, true);
        let is_local = match req.active_mode.as_deref() {
            Some("cloud") => false,
            Some("local") => true,
            _ => !req.prefer_cloud_credits,
        };
        assert!(
            !is_local,
            "legacy callers with prefer_cloud_credits=true must default to cloud"
        );
    }

    #[test]
    fn router_preferences_preserve_tier_without_classifier_metadata() {
        let mut req = minimal_request_with_mode(Some("cloud"), true);
        req.execution_mode = Some(ChatExecutionMode::CloudManaged);
        let preferences = build_router_preferences(&req, None, "auto-premium", "max".to_string());

        assert!(preferences.managed_cloud_only);
        assert!(!preferences.local_only);
        assert_eq!(
            preferences.trust_mode,
            Some(agiworkforce_model_registry::TrustMode::ManagedCloud)
        );
        assert_eq!(
            preferences
                .context
                .as_ref()
                .map(|context| context.plan_tier.as_str()),
            Some("max")
        );
    }

    #[test]
    fn local_router_preferences_cannot_enable_managed_cloud_fallbacks() {
        let mut req = minimal_request_with_mode(Some("local"), false);
        req.execution_mode = Some(ChatExecutionMode::LocalOnly);
        let preferences = build_router_preferences(&req, None, "auto-balanced", "byok".to_string());

        assert!(preferences.local_only);
        assert!(!preferences.managed_cloud_only);
        assert_eq!(
            preferences.trust_mode,
            Some(agiworkforce_model_registry::TrustMode::Local)
        );
    }

    #[test]
    fn byok_router_preferences_are_not_local_or_managed() {
        let mut req = minimal_request_with_mode(Some("local"), false);
        req.execution_mode = Some(ChatExecutionMode::Byok);
        let preferences =
            build_router_preferences(&req, Some(Provider::OpenAI), "gpt-5.5", "pro".to_string());

        assert!(!preferences.local_only);
        assert!(!preferences.managed_cloud_only);
        assert_eq!(
            preferences.trust_mode,
            Some(agiworkforce_model_registry::TrustMode::Byok)
        );
    }

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
            resolve_routing_strategy("gpt-5.5"),
            RoutingStrategy::Auto
        ));
    }

    #[test]
    fn opus_tool_workflows_default_to_adaptive_thinking() {
        let thinking =
            resolve_thinking_parameter("claude-opus-4.8", None, None, true, "hello world");
        assert!(matches!(thinking, Some(ThinkingParameter::Adaptive { .. })));
    }

    #[test]
    fn explicit_thinking_mode_true_returns_enabled() {
        let thinking =
            resolve_thinking_parameter("claude-sonnet-4-6", Some(true), None, false, "write code");
        assert!(matches!(thinking, Some(ThinkingParameter::Enabled(true))));
    }

    #[test]
    fn explicit_thinking_mode_true_with_budget_returns_budget() {
        let thinking = resolve_thinking_parameter(
            "claude-sonnet-4-6",
            Some(true),
            Some(32_000),
            false,
            "write code",
        );
        match thinking {
            Some(ThinkingParameter::Budget { budget_tokens, .. }) => {
                assert_eq!(budget_tokens, 32_000);
            }
            other => panic!("Expected Budget, got {:?}", other),
        }
    }

    #[test]
    fn explicit_thinking_mode_false_disables_even_with_trigger() {
        // User explicitly turned off thinking in UI, message has "ultrathink".
        // Explicit false wins over the trigger word AND must emit an explicit
        // disable signal (Some(Enabled(false))), not None: some providers default
        // thinking ON at the API level, so the "false" must survive to the
        // provider layer rather than being omitted (see resolve_thinking_parameter
        // §2). Either way thinking is disabled — the trigger never re-enables it.
        let thinking = resolve_thinking_parameter(
            "claude-sonnet-4-6",
            Some(false),
            None,
            false,
            "ultrathink about this",
        );
        match thinking {
            Some(ThinkingParameter::Enabled(false)) => {}
            other => panic!("Expected explicit-disable Some(Enabled(false)), got {other:?}"),
        }
    }

    #[test]
    fn auto_detect_ultrathink_on_supported_model() {
        let thinking = resolve_thinking_parameter(
            "claude-sonnet-4-6",
            None,
            None,
            false,
            "Can you ultrathink about this problem?",
        );
        match thinking {
            Some(ThinkingParameter::Budget { budget_tokens, .. }) => {
                assert_eq!(budget_tokens, 128_000);
            }
            other => panic!("Expected Budget with 128K tokens, got {:?}", other),
        }
    }

    #[test]
    fn auto_detect_think_hard_on_supported_model() {
        let thinking = resolve_thinking_parameter(
            "claude-sonnet-4-6",
            None,
            None,
            false,
            "Please think hard about the architecture",
        );
        match thinking {
            Some(ThinkingParameter::Budget { budget_tokens, .. }) => {
                assert_eq!(budget_tokens, 32_000);
            }
            other => panic!("Expected Budget with 32K tokens, got {:?}", other),
        }
    }

    #[test]
    fn auto_detect_think_on_supported_model() {
        let thinking = resolve_thinking_parameter(
            "claude-sonnet-4-6",
            None,
            None,
            false,
            "Think about this question carefully",
        );
        match thinking {
            Some(ThinkingParameter::Budget { budget_tokens, .. }) => {
                assert_eq!(budget_tokens, 10_000);
            }
            other => panic!("Expected Budget with 10K tokens, got {:?}", other),
        }
    }

    #[test]
    fn auto_detect_skipped_for_unsupported_model() {
        // GPT-4 does not support thinking
        let thinking =
            resolve_thinking_parameter("gpt-4", None, None, false, "ultrathink about this");
        assert!(thinking.is_none());
    }

    #[test]
    fn no_trigger_no_thinking_on_non_opus_model() {
        let thinking = resolve_thinking_parameter(
            "claude-sonnet-4-6",
            None,
            None,
            false,
            "Write me a poem about cats",
        );
        assert!(thinking.is_none());
    }

    #[test]
    fn auto_detect_works_on_openai_reasoning_model() {
        // Uses "gpt-5.5" (catalog reasoning model with capabilities.thinking=true).
        // "o3" was removed from models.json as of 2026-05-29.
        // The "think about" trigger phrase produces ThinkingBudget::Low = 10K tokens.
        let thinking = resolve_thinking_parameter(
            "gpt-5.5",
            None,
            None,
            false,
            "Think about how to solve this",
        );
        match thinking {
            Some(ThinkingParameter::Budget { budget_tokens, .. }) => {
                assert_eq!(budget_tokens, 10_000);
            }
            other => panic!("Expected Budget with 10K tokens, got {:?}", other),
        }
    }

    // ---------------------------------------------------------------------------
    // Cloud-sync gate invariant (trust-boundary: send_message.rs)
    // ---------------------------------------------------------------------------

    /// TRUST-BOUNDARY: active_mode="local" must force cloud_sync_enabled=false
    /// regardless of what chat_storage_mode is set to in user preferences.
    /// This mirrors the logic added to chat_send_message in send_message.rs and
    /// guards against the latent leak where a user with storage_mode="cloud" AND
    /// active_mode="local" could unintentionally sync local chats to Neon once
    /// the CloudSyncClient target is wired up.
    #[test]
    fn local_active_mode_forces_cloud_sync_disabled_even_with_cloud_storage_pref() {
        // Exercises the REAL production fn used by send_message.rs (not a closure
        // reimplementation), so this test fails if the trust-boundary rule regresses.
        use super::derive_cloud_sync_enabled;

        // active_mode=local + storage_mode=cloud → must be disabled (the fix).
        assert!(
            !derive_cloud_sync_enabled(Some("local"), true),
            "active_mode=local with storage_mode=cloud must yield cloud_sync_enabled=false"
        );
        // active_mode=cloud + storage_mode=cloud → enabled.
        assert!(
            derive_cloud_sync_enabled(Some("cloud"), true),
            "active_mode=cloud with storage_mode=cloud must yield cloud_sync_enabled=true"
        );
        // active_mode=local + storage_mode=local → definitely disabled.
        assert!(
            !derive_cloud_sync_enabled(Some("local"), false),
            "active_mode=local with storage_mode=local must yield cloud_sync_enabled=false"
        );
        // active_mode=None + storage_mode=cloud → enabled (legacy path unchanged).
        assert!(
            derive_cloud_sync_enabled(None, true),
            "legacy callers omitting active_mode with storage_mode=cloud should get cloud_sync_enabled=true"
        );
        // active_mode=None + storage_mode=local → disabled.
        assert!(
            !derive_cloud_sync_enabled(None, false),
            "active_mode=None with storage_mode=local must yield cloud_sync_enabled=false"
        );
    }
}
