//! The main `chat_send_message` command and its direct helpers.

use std::sync::Arc;
use chrono::Utc;
use tauri::{Emitter, Manager, State};
use tracing::{debug, error, info, warn};

use crate::data::db::models::{Conversation, Message, MessageRole};
use crate::data::db::repository;
use crate::sys::commands::llm::LLMState;

use super::state::{
    AppDatabase, DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE, STREAM_CHUNK_IDLE_TIMEOUT_SECS,
    reset_stop_flag,
};
use super::context::{
    append_history_messages, build_os_context, build_project_context_message,
    build_tool_definitions, inject_browser_page_context, inject_memory_context,
    sanitize_multiline_for_prompt,
};
use super::attachments::{process_document_attachments, process_multimodal_attachments};
use super::cost::check_billing_and_budget;
use super::intent::detect_agentic_intent;
use super::memory_handler;
use super::messages::{compute_or_skip_stats, save_or_skip_assistant_message};
use super::pending::{
    has_pending_messages, has_pending_messages_for_conversation, peek_pending_messages_for_conversation,
    pending_messages_count, pop_pending_message_for_conversation,
};
use super::streaming::{
    consume_llm_stream, emit_stream_failure, ensure_managed_cloud_provider,
    execute_tool_calls_batch, normalize_tool_calls,
    build_fast_metadata_failure_message, did_fast_metadata_batch_fail,
    is_fast_metadata_batch, is_media_generation_tool,
    resolve_followup_invoke_timeout_secs, resolve_followup_total_timeout_secs,
    resolve_streaming_tool_loop_max_iterations, resolve_streaming_tool_loop_max_secs,
};
use super::types::*;

/// Check if the user explicitly selected a specific model (not auto-routing).
/// When a concrete model is selected, skip intent-based agent detection.
fn is_explicit_model_selection(model_override: Option<&str>) -> bool {
    matches!(
        model_override.map(str::trim),
        Some(model) if !model.is_empty()
            && model != "auto"
            && !model.starts_with("auto-")
    )
}

/// Determine whether agent mode should be used and emit a permission warning
/// if the user explicitly requested it but automation is unavailable.
///
/// Returns `true` if agent mode is available and should be activated.
/// Check whether the macOS Accessibility permission has been granted.
/// AXUIElementCreateSystemWide() always succeeds (even without permission),
/// so we use AXIsProcessTrusted() which reads the actual TCC grant.
#[cfg(target_os = "macos")]
#[allow(unsafe_code)]
fn accessibility_permission_granted() -> bool {
    use accessibility_sys::AXIsProcessTrusted;
    unsafe { AXIsProcessTrusted() }
}

fn detect_agent_mode(
    request_enable_agent_mode: Option<bool>,
    content: &str,
    app_handle: &tauri::AppHandle,
) -> bool {
    // User explicitly disabled agent mode — respect that, never auto-detect.
    if request_enable_agent_mode == Some(false) {
        return false;
    }
    let explicitly_requested_agent = request_enable_agent_mode == Some(true);
    let wants_agent = explicitly_requested_agent || detect_agentic_intent(content);

    #[cfg(target_os = "macos")]
    let has_accessibility = accessibility_permission_granted();
    #[cfg(not(target_os = "macos"))]
    let has_accessibility = true;

    let agent_mode = if wants_agent && has_accessibility {
        use crate::automation::AutomationService;
        AutomationService::new().is_ok()
    } else {
        false
    };

    // When explicitly requested but unavailable — non-blocking permission toast.
    if explicitly_requested_agent && !agent_mode {
        let _ = app_handle.emit(
            "automation:permission_required",
            serde_json::json!({
                "reason": "accessibility",
                "message": "Grant Accessibility permission to use Agent mode: System Settings → Privacy & Security → Accessibility → enable AGI Workforce.",
                "graceful": false
            }),
        );
    }

    // When auto-detected from content but permissions missing — fall back to LLM
    // silently and emit a soft (non-blocking) toast so the user can enable if desired.
    if !explicitly_requested_agent && wants_agent && !agent_mode {
        let _ = app_handle.emit(
            "automation:permission_required",
            serde_json::json!({
                "reason": "accessibility",
                "message": "Agent automation needs Accessibility permission. Answering with standard chat instead.",
                "graceful": true
            }),
        );
    }

    agent_mode
}

#[tauri::command]
pub async fn chat_send_message(
    _db: State<'_, AppDatabase>,
    _llm_state: State<'_, LLMState>,
    settings_state: State<'_, crate::sys::commands::settings::SettingsState>,
    #[cfg_attr(not(feature = "billing"), allow(unused_variables))] _billing_state: State<
        '_,
        crate::sys::billing::BillingStateWrapper,
    >,
    mcp_state: State<'_, crate::sys::commands::mcp::McpState>,
    project_context_state: State<'_, crate::sys::commands::project_context::ProjectContextState>,
    memory_state: State<'_, crate::sys::commands::memory::MemoryState>,
    _research_state: State<'_, crate::sys::commands::research::ResearchState>,
    app_handle: tauri::AppHandle,
    request: ChatSendMessageRequest,
) -> Result<ChatSendMessageResponse, String> {
    // Generate correlation ID for request tracing
    let correlation_id = uuid::Uuid::new_v4().to_string();

    // Read chat storage mode once — guard all Supabase sync calls below.
    // "cloud" → dual-write to Supabase; anything else ("local" / missing) → local-only.
    let cloud_sync_enabled = {
        let s = settings_state.settings.lock().await;
        s.chat_preferences
            .as_ref()
            .map(|p| p.chat_storage_mode.as_str() == "cloud")
            .unwrap_or(false)
    };

    // Clear any stale stop flag from previous conversations/runs.
    // Without this, one stopped run can leak into future chats.
    reset_stop_flag();

    // Validate request fields (content length, user_id, attachments, etc.)
    request.validate().map_err(|e| e.to_string())?;

    // Log request details including attachments
    // AUDIT-P3-003: Use if-let instead of unwrap() for optional attachments
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

    info!(
        target: "chat",
        correlation_id = %correlation_id,
        conversation_id = ?request.conversation_id,
        content_length = request.content.len(),
        "Chat send_message started"
    );

    // Check billing subscription and monthly budget limits
    #[cfg(feature = "billing")]
    {
        let billing = _billing_state.0.lock().await;
        check_billing_and_budget(&billing, &_db, &request.user_id)?;
    }
    #[cfg(not(feature = "billing"))]
    {
        check_billing_and_budget(&_db, &request.user_id)?;
    }

    // Determine whether agent mode should be used.
    // When the user explicitly selected a concrete model (not auto/auto-*),
    // skip intent-based agent detection to avoid unwanted mode switching.
    let explicit_model = is_explicit_model_selection(request.model_override.as_deref());
    let agent_mode = if explicit_model {
        request.enable_agent_mode == Some(true)
    } else {
        detect_agent_mode(request.enable_agent_mode, &request.content, &app_handle)
    };

    let is_deep_research = matches!(request.focus_mode.as_deref(), Some("deep-research"))
        || request.research_task_id.is_some();

    let is_web_focus = matches!(request.focus_mode.as_deref(), Some("web") | Some("search"));

    use crate::core::llm::{
        cost_calculator::CostCalculator,
        llm_router::{RouterContext, RouterPreferences, RoutingStrategy},
        token_counter::TokenCounter,
        ChatMessage, LLMRequest, Provider,
    };

    let provider_enum = request
        .provider_override
        .as_deref()
        .or(request.provider.as_deref())
        .and_then(Provider::from_string);

    let model = request
        .model_override
        .or(request.model.clone())
        .unwrap_or_else(|| "gpt-5-nano".to_string());

    // Map auto mode model IDs to routing strategies (2026)
    let routing_strategy = match model.as_str() {
        "auto" => RoutingStrategy::Auto, // Legacy - maps to AutoBalanced
        "auto-economy" => RoutingStrategy::AutoEconomy,
        "auto-balanced" => RoutingStrategy::AutoBalanced,
        "auto-premium" => RoutingStrategy::AutoPremium,
        _ => RoutingStrategy::Auto, // Default to Auto (maps to AutoBalanced)
    };

    // BUG-11 fix: acquire billing lock only long enough to read plan tier, then release
    // before any streaming work begins to avoid blocking other concurrent requests.
    #[cfg(feature = "billing")]
    let plan_tier = {
        let _billing_guard = _billing_state.0.lock().await;
        if let Ok(service) = _billing_guard.stripe_service() {
            if let Ok(Some(sub)) = service.get_primary_subscription() {
                sub.plan_name.to_lowercase()
            } else {
                "free".to_string()
            }
        } else {
            "free".to_string()
        }
        // _billing_guard dropped here, before streaming starts
    };

    #[cfg(not(feature = "billing"))]
    let plan_tier = "free".to_string();

    let router_context = request.task_metadata.as_ref().map(|meta| RouterContext {
        // Legacy fields
        intents: meta.intents.clone(),
        requires_vision: meta.requires_vision,
        token_estimate: meta.token_estimate.unwrap_or(0),
        cost_priority: Default::default(),
        plan_tier,
        // New intelligent routing fields (January 2026)
        intent_type: meta.intent_type.clone(),
        model_category: meta.model_category.clone(),
        selected_model: meta.selected_model.clone(),
        suggested_tool_categories: meta.suggested_tool_categories.clone(),
        auto_execute_tools: meta.auto_execute_tools,
        confidence: meta.confidence,
        routing_reason: meta.routing_reason.clone(),
    });

    let preferences = RouterPreferences {
        provider: provider_enum,
        model: Some(model.clone()),
        strategy: routing_strategy,
        context: router_context,
        prefer_cloud_credits: request.prefer_cloud_credits,
    };

    // Incognito mode: when true, skip all persistence (conversation/message/FTS/memory)
    let incognito = request.incognito.unwrap_or(false);
    if incognito {
        debug!("[Chat] Incognito mode active: skipping all persistence");
    }

    // Clone the inner Arc before moving _db
    let db_arc = AppDatabase {
        conn: _db.inner().conn.clone(),
    };
    let conversation = if incognito {
        // Use a sentinel conversation with id = -1 for incognito sessions
        Conversation {
            id: -1,
            title: "Incognito".to_string(),
            user_id: request.user_id.clone(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    } else {
        let conn = db_arc.connection()?;
        if let Some(conv_id) = request.conversation_id {
            repository::get_conversation(&conn, conv_id, &request.user_id)
                .map_err(|e| format!("Failed to get conversation: {e}"))?
        } else {
            let title = request.content.chars().take(50).collect::<String>();
            let id = repository::create_conversation(&conn, title, request.user_id.clone())
                .map_err(|e| format!("Failed to create conversation: {e}"))?;
            let new_conv = repository::get_conversation(&conn, id, &request.user_id)
                .map_err(|e| format!("Failed to get new conversation: {e}"))?;
            // Best-effort dual-write new conversation to Supabase (only in cloud storage mode)
            if cloud_sync_enabled {
                crate::data::supabase_sync::spawn_sync_conversation(new_conv.clone());
            }
            new_conv
        }
    };

    let temp_chat_msg = ChatMessage {
        role: "user".to_string(),
        content: request.content.clone(),
        tool_calls: None,
        tool_call_id: None,
        multimodal_content: None,
    };
    let input_tokens = TokenCounter::estimate_prompt_tokens(&[temp_chat_msg]);
    let input_cost = if let Some(p) = provider_enum {
        CostCalculator::new().calculate(p, &model, input_tokens, 0)
    } else {
        0.0
    };

    let user_message = if incognito {
        // In incognito mode, create an in-memory Message without persisting
        Message {
            id: -1,
            conversation_id: conversation.id,
            user_id: request.user_id.clone(),
            role: MessageRole::User,
            content: request.content.clone(),
            tokens: Some(input_tokens as i32),
            cost: Some(input_cost),
            provider: provider_enum.map(|p| p.as_string().to_string()),
            model: Some(model.clone()),
            created_at: Utc::now(),
            parent_message_id: None,
            branch_id: Some("main".to_string()),
        }
    } else {
        let conn = _db.connection()?;
        let msg = Message {
            id: 0,
            conversation_id: conversation.id,
            user_id: request.user_id.clone(),
            role: MessageRole::User,
            content: request.content.clone(),
            tokens: Some(input_tokens as i32),
            cost: Some(input_cost),
            provider: provider_enum.map(|p| p.as_string().to_string()),
            model: Some(model.clone()),
            created_at: Utc::now(),
            parent_message_id: None,
            branch_id: Some("main".to_string()),
        };
        let id = repository::create_message(&conn, &msg)
            .map_err(|e| format!("Failed to save user message: {e}"))?;
        let saved_msg = repository::get_message(&conn, id)
            .map_err(|e| format!("Failed to retrieve user message: {e}"))?;
        // Best-effort dual-write user message to Supabase (only in cloud storage mode)
        if cloud_sync_enabled {
            crate::data::supabase_sync::spawn_sync_message(saved_msg.clone());
        }
        saved_msg
    };

    let history = if incognito {
        // No history in incognito mode
        Vec::new()
    } else {
        let conn = _db.connection()?;
        repository::list_messages(&conn, conversation.id)
            .map_err(|e| format!("Failed to load message history: {e}"))?
    };

    // Build conversation messages, prepending system prompt
    let mut llm_messages: Vec<ChatMessage> = Vec::new();

    use crate::core::agent::prompt_engineer::PromptEngineer;
    let default_system_prompt = PromptEngineer::default_system_prompt();

    // Add the default system prompt
    llm_messages.push(ChatMessage {
        role: "system".to_string(),
        content: default_system_prompt,
        tool_calls: None,
        tool_call_id: None,
        multimodal_content: None,
    });
    debug!("[Chat] Added default AGI Workforce system prompt");

    // Load relevant memories and inject into context (skip in incognito mode)
    let memory_handler = memory_handler::ChatMemoryHandler::new(Some(memory_state.manager.clone()))
        .map_err(|e| format!("Failed to initialize memory handler: {e}"))?;

    if !incognito {
        inject_memory_context(
            &memory_handler,
            request.project_folder.as_deref(),
            &mut llm_messages,
        );
    } else {
        debug!("[Chat] Incognito mode: skipping memory injection");
    }

    // Add OS/platform context so the LLM knows the user's operating system
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

    // Add project folder context if one is set
    // Priority: request.project_folder > state context
    let effective_folder = if let Some(ref folder) = request.project_folder {
        // Update the project context state so tools can use it.
        // Reload MCP scope only when folder actually changes to avoid reconnect churn.
        let previous_folder = project_context_state.get_folder().await;
        let folder_changed = previous_folder.as_deref() != Some(folder.as_str());
        project_context_state.set_folder(folder.clone()).await;
        if folder_changed {
            if let Err(err) = mcp_state.reload_active_config(&app_handle).await {
                warn!(
                    "[Chat] Failed to reload MCP config for project folder '{}': {}",
                    folder, err
                );
            }
        }
        Some(folder.clone())
    } else {
        let ctx = project_context_state.get_context().await;
        if ctx.is_valid {
            ctx.folder.clone()
        } else {
            // Fallback: use the user's home directory so file tools always
            // have a valid base path.  This prevents "file not found" errors
            // when the user hasn't explicitly selected a project folder.
            let home_fallback = dirs::home_dir().map(|h| h.to_string_lossy().to_string());
            if home_fallback.is_some() {
                debug!("[Chat] No project folder set, falling back to home directory");
            }
            home_fallback
        }
    };

    let project_context_for_agent: Option<String> = if let Some(ref folder) = effective_folder {
        let project_context_content = build_project_context_message(folder);
        llm_messages.push(ChatMessage {
            role: "system".to_string(),
            content: project_context_content.clone(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        });
        Some(project_context_content)
    } else {
        None
    };

    // Append custom instructions if provided (they supplement the default prompt)
    if let Some(ref custom_instructions) = request.custom_instructions {
        if !custom_instructions.trim().is_empty() {
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
    }

    // Inject browser page context from the extension if available
    inject_browser_page_context(&mut llm_messages);

    // Auto-inject matching skills into the system prompt based on message content.
    // Controlled by the auto_inject_skills field (default: true).
    let should_inject_skills = request.auto_inject_skills.unwrap_or(true);
    if should_inject_skills && !incognito {
        // Use the inline skill matching logic (same algorithm as skill_match_for_message command)
        // We store (name, context_string, score) as owned data to avoid lifetime issues.
        let skill_matches: Vec<(String, String, f64)> = {
            use crate::core::skills::SkillSourceFilter;
            let skills = app_handle
                .try_state::<crate::sys::commands::skills::SkillsState>()
                .map(|state| state.manager.skills_by_source(SkillSourceFilter::All))
                .unwrap_or_default();

            let msg_lower = request.content.to_lowercase();
            let msg_tokens: std::collections::HashSet<String> = msg_lower
                .split(|c: char| c.is_whitespace() || c.is_ascii_punctuation())
                .filter(|w| !w.is_empty() && w.len() > 1)
                .map(String::from)
                .collect();

            if msg_tokens.is_empty() {
                Vec::new()
            } else {
                let mut scored: Vec<(String, String, f64)> = skills
                    .iter()
                    .filter_map(|skill| {
                        let skill_text =
                            format!("{} {}", skill.name, skill.description).to_lowercase();
                        let skill_tokens: std::collections::HashSet<String> = skill_text
                            .split(|c: char| c.is_whitespace() || c.is_ascii_punctuation())
                            .filter(|w| !w.is_empty() && w.len() > 1)
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
                scored.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));
                scored.truncate(2); // Inject at most 2 skills
                scored
            }
        };

        if !skill_matches.is_empty() {
            let skill_names: Vec<&str> = skill_matches
                .iter()
                .map(|(name, _, _)| name.as_str())
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

            // Emit event so frontend can show which skills were injected
            let _ = app_handle.emit(
                "chat:skills-injected",
                serde_json::json!({
                    "conversation_id": conversation.id,
                    "skills": skill_names
                }),
            );
        }
    }

    // Process image attachments (and auto-capture screen context if needed)
    let multimodal_parts =
        process_multimodal_attachments(request.attachments.as_ref(), &model, &request.content);

    // Extract text from document attachments (non-image files)
    let attachment_text_context =
        process_document_attachments(request.attachments.as_ref(), &mut llm_messages);

    let mut agent_instruction = request.content.clone();
    if let Some(ref context) = project_context_for_agent {
        agent_instruction.push_str("\n\n");
        agent_instruction.push_str(context);
    }
    if let Some(ref docs) = attachment_text_context {
        agent_instruction.push_str("\n\n");
        agent_instruction.push_str(docs);
    }

    // Add conversation history with multimodal content on the current user message
    append_history_messages(
        &mut llm_messages,
        &history,
        user_message.id,
        multimodal_parts.as_ref(),
    );

    // Log debug info about the message being sent
    if let Some(ref parts) = multimodal_parts {
        debug!(
            "[Chat] Sending message with {} text chars and {} image(s) to model '{}'",
            request.content.len(),
            parts.len(),
            model
        );
    }

    // Build tool definitions if tools are enabled
    let (chat_tools, tool_choice) = build_tool_definitions(
        request.enable_tools,
        &mcp_state,
        request.model_capabilities.as_ref(),
        is_web_focus,
        &model,
    );

    // Enable prompt caching for Anthropic Claude models to reduce cost/latency.
    // This adds cache_control breakpoints to system prompts and tool definitions.
    let is_claude_model = model.to_lowercase().contains("claude");
    let cache_control = if is_claude_model {
        Some(crate::core::llm::CacheControl {
            cache_type: "ephemeral".to_string(),
        })
    } else {
        None
    };

    // For Claude Opus 4.6+, default to adaptive thinking for tool use workflows
    // unless the user explicitly set a thinking mode or thinking_budget.
    let thinking = if request.thinking_mode == Some(true) {
        // User explicitly enabled thinking — use Budget when a budget is provided.
        let budget = request.thinking_budget.unwrap_or(0);
        if budget > 0 {
            Some(crate::core::llm::ThinkingParameter::Budget {
                thinking_type: "enabled".to_string(),
                budget_tokens: budget,
            })
        } else {
            // thinking_mode true but no budget: fall back to adaptive for Claude Opus,
            // or a simple Enabled(true) for other models.
            if is_claude_model && model.contains("opus-4") {
                Some(crate::core::llm::ThinkingParameter::Adaptive {
                    thinking_type: "adaptive".to_string(),
                })
            } else {
                Some(crate::core::llm::ThinkingParameter::Enabled(true))
            }
        }
    } else if is_claude_model
        && model.contains("opus-4")
        && chat_tools.is_some()
        && request.thinking_mode.is_none()
    {
        // Default adaptive thinking for Claude Opus 4.x tool workflows
        Some(crate::core::llm::ThinkingParameter::Adaptive {
            thinking_type: "adaptive".to_string(),
        })
    } else {
        None
    };

    // Resolve temperature and max_tokens: prefer values forwarded from the frontend,
    // fall back to module-level defaults.
    let resolved_temperature = request.temperature.unwrap_or(DEFAULT_TEMPERATURE);
    let resolved_max_tokens = request.max_output_tokens.unwrap_or(DEFAULT_MAX_TOKENS);

    let llm_request = LLMRequest {
        messages: llm_messages,
        model: model.clone(),
        temperature: Some(resolved_temperature),
        max_tokens: Some(resolved_max_tokens),
        stream: request.stream.unwrap_or(false),
        tools: chat_tools.clone(),
        tool_choice: tool_choice.clone(),
        thinking_mode: request.thinking_mode,
        cache_control,
        thinking,
        // Forward reasoning effort (OpenAI o-series) when provided by the frontend
        effort: request.reasoning_effort.clone(),
        ..Default::default()
    };

    let stream_mode = request.stream.unwrap_or(false);

    if stream_mode {
        reset_stop_flag();

        let frontend_message_id = request
            .frontend_message_id
            .clone()
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| "Streaming chat requires a frontend message id".to_string())?;

        // Emit stream start event
        let _ = app_handle.emit(
            "chat:stream-start",
            serde_json::json!({
                "conversation_id": conversation.id,
                "message_id": frontend_message_id,
                "created_at": Utc::now().to_rfc3339()
            }),
        );

        if is_deep_research {
            use crate::core::research::{ResearchMode, ResearchOrchestrator};

            let research_task_id = request.research_task_id.clone().unwrap_or_else(|| {
                format!(
                    "research-{}-{}",
                    Utc::now().timestamp_millis(),
                    uuid::Uuid::new_v4()
                        .to_string()
                        .split('-')
                        .next()
                        .unwrap_or("x")
                )
            });

            let query = request.content.clone();
            let app_handle_clone = app_handle.clone();
            let frontend_message_id_clone = frontend_message_id.clone();
            let conversation_id_clone = conversation.id;
            let db_arc_clone = db_arc.clone();
            let user_id_clone = request.user_id.clone();
            let model_clone = model.clone();
            let provider_enum_clone = provider_enum;
            let router_clone = _llm_state.router.clone();
            let research_config = _research_state.config.read().await.clone();
            let correlation_id_clone = correlation_id.clone();

            tauri::async_runtime::spawn(async move {
                info!(
                    target: "chat",
                    correlation_id = %correlation_id_clone,
                    "Deep research chat message processing started"
                );

                let _ = app_handle_clone.emit(
                    "chat:stream-chunk",
                    serde_json::json!({
                        "conversation_id": conversation_id_clone,
                        "message_id": frontend_message_id_clone,
                        "delta": "Starting deep research...\n",
                        "content": "Starting deep research...\n",
                        "has_pending_messages": has_pending_messages()
                    }),
                );

                let orchestrator = match ResearchOrchestrator::new(router_clone, research_config) {
                    Ok(orchestrator) => orchestrator
                        .with_app_handle(app_handle_clone.clone())
                        .with_task_id(Some(research_task_id.clone())),
                    Err(e) => {
                        let error_msg = format!("Failed to initialize research orchestrator: {e}");
                        let _ = app_handle_clone.emit(
                            "research:error",
                            serde_json::json!({
                                "task_id": research_task_id,
                                "query": query,
                                "error": error_msg,
                            }),
                        );
                        let _ = app_handle_clone.emit(
                            "chat:stream-error",
                            serde_json::json!({
                                "conversation_id": conversation_id_clone,
                                "message_id": frontend_message_id_clone,
                                "error": "Failed to start deep research"
                            }),
                        );
                        let _ = app_handle_clone.emit(
                            "chat:stream-end",
                            serde_json::json!({
                                "conversation_id": conversation_id_clone,
                                "message_id": frontend_message_id_clone,
                                "content": "Failed to start deep research.",
                                "error": true,
                                "has_pending_messages": has_pending_messages()
                            }),
                        );
                        return;
                    }
                };

                let result = orchestrator.research(&query, ResearchMode::Deep).await;
                match result {
                    Ok(result) => {
                        let content = result.report.clone();

                        let _ = app_handle_clone.emit(
                            "chat:stream-chunk",
                            serde_json::json!({
                                "conversation_id": conversation_id_clone,
                                "message_id": frontend_message_id_clone,
                                "delta": content.clone(),
                                "content": content,
                                "has_pending_messages": has_pending_messages()
                            }),
                        );

                        let assistant_message = if incognito {
                            Message {
                                id: -1,
                                conversation_id: conversation_id_clone,
                                user_id: user_id_clone.clone(),
                                role: MessageRole::Assistant,
                                content: result.report.clone(),
                                tokens: None,
                                cost: None,
                                provider: provider_enum_clone.map(|p| p.as_string().to_string()),
                                model: Some(model_clone.clone()),
                                created_at: Utc::now(),
                                parent_message_id: None,
                                branch_id: Some("main".to_string()),
                            }
                        } else {
                            let conn = match db_arc_clone.connection() {
                                Ok(conn) => conn,
                                Err(e) => {
                                    emit_stream_failure(
                                        &app_handle_clone,
                                        conversation_id_clone,
                                        &frontend_message_id_clone,
                                        format!("Database error: {e}"),
                                        Some(&result.report),
                                    );
                                    return;
                                }
                            };

                            let msg = Message {
                                id: 0,
                                conversation_id: conversation_id_clone,
                                user_id: user_id_clone.clone(),
                                role: MessageRole::Assistant,
                                content: result.report.clone(),
                                tokens: None,
                                cost: None,
                                provider: provider_enum_clone.map(|p| p.as_string().to_string()),
                                model: Some(model_clone.clone()),
                                created_at: Utc::now(),
                                parent_message_id: None,
                                branch_id: Some("main".to_string()),
                            };
                            match repository::create_message(&conn, &msg) {
                                Ok(id) => match repository::get_message(&conn, id) {
                                    Ok(msg) => msg,
                                    Err(e) => {
                                        emit_stream_failure(
                                            &app_handle_clone,
                                            conversation_id_clone,
                                            &frontend_message_id_clone,
                                            format!(
                                                "Failed to retrieve deep research message: {e}"
                                            ),
                                            Some(&result.report),
                                        );
                                        return;
                                    }
                                },
                                Err(e) => {
                                    emit_stream_failure(
                                        &app_handle_clone,
                                        conversation_id_clone,
                                        &frontend_message_id_clone,
                                        format!("Failed to save deep research message: {e}"),
                                        Some(&result.report),
                                    );
                                    return;
                                }
                            }
                        };

                        let _ = app_handle_clone.emit(
                            "chat:stream-end",
                            serde_json::json!({
                                "conversation_id": conversation_id_clone,
                                "message_id": frontend_message_id_clone,
                                "backend_message_id": assistant_message.id,
                                "pending_messages_count": pending_messages_count(),
                                "has_pending_messages": has_pending_messages()
                            }),
                        );
                    }
                    Err(e) => {
                        let error_msg = e.to_string();
                        let _ = app_handle_clone.emit(
                            "research:error",
                            serde_json::json!({
                                "task_id": research_task_id,
                                "query": query,
                                "error": error_msg.clone(),
                            }),
                        );
                        let _ = app_handle_clone.emit(
                            "chat:stream-error",
                            serde_json::json!({
                                "conversation_id": conversation_id_clone,
                                "message_id": frontend_message_id_clone,
                                "error": error_msg
                            }),
                        );
                        let _ = app_handle_clone.emit(
                            "chat:stream-end",
                            serde_json::json!({
                                "conversation_id": conversation_id_clone,
                                "message_id": frontend_message_id_clone,
                                "content": "Deep research failed.",
                                "error": true,
                                "has_pending_messages": has_pending_messages()
                            }),
                        );
                    }
                }
            });

            return Ok(ChatSendMessageResponse {
                conversation,
                user_message,
                assistant_message: Message::default(),
                stats: ConversationStats {
                    message_count: 0,
                    total_tokens: 0,
                    total_input_tokens: 0,
                    total_output_tokens: 0,
                    total_cost: 0.0,
                },
                last_message: None,
                credits: None,
            });
        }

        info!(
            target: "chat",
            correlation_id = %correlation_id,
            agent_mode = agent_mode,
            is_deep_research = is_deep_research,
            "Starting chat message processing"
        );

        if agent_mode {
            use crate::automation::AutomationService;
            use crate::core::agi::{AGIConfig, AgentOrchestrator};

            let app_handle_clone = app_handle.clone();
            let frontend_message_id_clone = frontend_message_id.clone();
            let conversation_id_clone = conversation.id;
            let db_arc_clone = db_arc.clone();
            let user_id_clone = request.user_id.clone();
            let model_clone = model.clone();
            let provider_enum_clone = provider_enum;
            let router_clone = _llm_state.router.clone();
            let preferences_clone = preferences.clone();
            let attachments_clone = request.attachments.clone();
            let agent_instruction_clone = agent_instruction.clone();
            let llm_messages_clone = llm_request.messages.clone();
            let correlation_id_clone = correlation_id.clone();

            tauri::async_runtime::spawn(async move {
                let start_time = std::time::Instant::now();
                let _ = app_handle_clone.emit(
                    "agent:thinking",
                    serde_json::json!({
                        "thinking": true,
                        "message": "Executing agent plan..."
                    }),
                );

                let orchestrator_arc = {
                    let guard = crate::sys::commands::agi::ORCHESTRATOR.lock();
                    guard.clone()
                };

                let orchestrator_arc = match orchestrator_arc {
                    Some(orch) => orch,
                    None => {
                        let automation = match AutomationService::new() {
                            Ok(service) => Arc::new(service),
                            Err(e) => {
                                let error_msg = format!("Automation service unavailable: {}", e);
                                let _ = app_handle_clone.emit(
                                    "agent:finished",
                                    serde_json::json!({
                                        "success": false,
                                        "error": error_msg,
                                        "duration_ms": start_time.elapsed().as_millis() as u64
                                    }),
                                );
                                let _ = app_handle_clone.emit(
                                    "automation:permission_required",
                                    serde_json::json!({
                                        "reason": "agent_mode",
                                        "message": "Grant Accessibility, Screen Recording, and Input Monitoring permissions to use Agent mode."
                                    }),
                                );
                                let _ = app_handle_clone.emit(
                                    "chat:stream-error",
                                    serde_json::json!({
                                        "conversation_id": conversation_id_clone,
                                        "message_id": frontend_message_id_clone,
                                        "error": "Agent mode requires automation permissions"
                                    }),
                                );
                                let _ = app_handle_clone.emit(
                                    "chat:stream-end",
                                    serde_json::json!({
                                        "conversation_id": conversation_id_clone,
                                        "message_id": frontend_message_id_clone,
                                        "content": "Agent mode is unavailable (missing automation permissions).",
                                        "error": true,
                                        "has_pending_messages": has_pending_messages()
                                    }),
                                );
                                return;
                            }
                        };

                        let orchestrator = match AgentOrchestrator::new(
                            4,
                            AGIConfig::default(),
                            router_clone.clone(),
                            automation,
                            Some(app_handle_clone.clone()),
                        ) {
                            Ok(orchestrator) => orchestrator,
                            Err(e) => {
                                let error_msg = format!("Failed to initialize orchestrator: {}", e);
                                let _ = app_handle_clone.emit(
                                    "agent:finished",
                                    serde_json::json!({
                                        "success": false,
                                        "error": error_msg,
                                        "duration_ms": start_time.elapsed().as_millis() as u64
                                    }),
                                );
                                let _ = app_handle_clone.emit(
                                    "chat:stream-error",
                                    serde_json::json!({
                                        "conversation_id": conversation_id_clone,
                                        "message_id": frontend_message_id_clone,
                                        "error": "Failed to start agent mode"
                                    }),
                                );
                                let _ = app_handle_clone.emit(
                                    "chat:stream-end",
                                    serde_json::json!({
                                        "conversation_id": conversation_id_clone,
                                        "message_id": frontend_message_id_clone,
                                        "content": "Failed to start agent mode.",
                                        "error": true,
                                        "has_pending_messages": has_pending_messages()
                                    }),
                                );
                                return;
                            }
                        };

                        let orchestrator_arc = Arc::new(tokio::sync::Mutex::new(orchestrator));
                        *crate::sys::commands::agi::ORCHESTRATOR.lock() =
                            Some(orchestrator_arc.clone());
                        orchestrator_arc
                    }
                };

                let result = {
                    let orchestrator = orchestrator_arc.lock().await;
                    orchestrator
                        .process_instruction(&agent_instruction_clone, attachments_clone)
                        .await
                };

                let _ = app_handle_clone.emit(
                    "agent:thinking",
                    serde_json::json!({
                        "thinking": false,
                    }),
                );

                match result {
                    Ok(orchestrator_result) => {
                        let success = orchestrator_result.success;
                        let summary = orchestrator_result.summary;
                        let mut final_content = summary.clone();
                        let mut final_tokens: Option<u32> = None;
                        let mut final_cost: Option<f64> = None;

                        if success {
                            let mut messages = llm_messages_clone.clone();
                            // Sanitize the orchestrator summary before injecting it into the
                            // system prompt — the summary may contain tool-result content from
                            // attacker-controlled sources (files, web pages, terminal output).
                            let sanitized_summary = sanitize_multiline_for_prompt(&summary, 4096);
                            messages.push(crate::core::llm::ChatMessage {
                                role: "system".to_string(),
                                content: format!(
                                    "Agent execution summary:\n{}\n\nProvide a clear final response to the user using this summary.",
                                    sanitized_summary
                                ),
                                tool_calls: None,
                                tool_call_id: None,
                                multimodal_content: None,
                            });

                            let final_request = crate::core::llm::LLMRequest {
                                messages,
                                model: model_clone.clone(),
                                temperature: Some(DEFAULT_TEMPERATURE),
                                max_tokens: Some(DEFAULT_MAX_TOKENS),
                                stream: false,
                                tools: None,
                                tool_choice: None,
                                thinking_mode: None,
                                ..Default::default()
                            };

                            let router = router_clone.read().await;
                            let candidates = router.candidates(&final_request, &preferences_clone);
                            if let Some(candidate) = candidates.first() {
                                match router.invoke_candidate(candidate, &final_request).await {
                                    Ok(outcome) => {
                                        final_content = outcome.response.content.clone();
                                        final_tokens = outcome.response.tokens;
                                        final_cost = outcome.response.cost;
                                    }
                                    Err(e) => {
                                        tracing::warn!(
                                            target: "chat",
                                            correlation_id = %correlation_id_clone,
                                            error = %e,
                                            "Agent response synthesis failed"
                                        );
                                    }
                                }
                            }
                        }

                        let _ = app_handle_clone.emit(
                            "chat:stream-chunk",
                            serde_json::json!({
                                "conversation_id": conversation_id_clone,
                                "message_id": frontend_message_id_clone,
                                "delta": final_content.clone(),
                                "content": final_content.clone(),
                                "has_pending_messages": has_pending_messages()
                            }),
                        );

                        let assistant_message = if incognito {
                            Message {
                                id: -1,
                                conversation_id: conversation_id_clone,
                                user_id: user_id_clone.clone(),
                                role: MessageRole::Assistant,
                                content: final_content.clone(),
                                tokens: final_tokens.map(|t| t as i32),
                                cost: final_cost,
                                provider: provider_enum_clone.map(|p| p.as_string().to_string()),
                                model: Some(model_clone.clone()),
                                created_at: Utc::now(),
                                parent_message_id: None,
                                branch_id: Some("main".to_string()),
                            }
                        } else {
                            let conn = match db_arc_clone.connection() {
                                Ok(conn) => conn,
                                Err(e) => {
                                    emit_stream_failure(
                                        &app_handle_clone,
                                        conversation_id_clone,
                                        &frontend_message_id_clone,
                                        format!("Database error while saving agent response: {e}"),
                                        Some(&final_content),
                                    );
                                    return;
                                }
                            };

                            let msg = Message {
                                id: 0,
                                conversation_id: conversation_id_clone,
                                user_id: user_id_clone.clone(),
                                role: MessageRole::Assistant,
                                content: final_content.clone(),
                                tokens: final_tokens.map(|t| t as i32),
                                cost: final_cost,
                                provider: provider_enum_clone.map(|p| p.as_string().to_string()),
                                model: Some(model_clone.clone()),
                                created_at: Utc::now(),
                                parent_message_id: None,
                                branch_id: Some("main".to_string()),
                            };
                            match repository::create_message(&conn, &msg) {
                                Ok(id) => {
                                    match repository::get_message(&conn, id) {
                                        Ok(msg) => msg,
                                        Err(e) => {
                                            emit_stream_failure(
                                            &app_handle_clone,
                                            conversation_id_clone,
                                            &frontend_message_id_clone,
                                            format!("Failed to retrieve agent response message: {e}"),
                                            Some(&final_content),
                                        );
                                            return;
                                        }
                                    }
                                }
                                Err(e) => {
                                    emit_stream_failure(
                                        &app_handle_clone,
                                        conversation_id_clone,
                                        &frontend_message_id_clone,
                                        format!("Failed to save agent response message: {e}"),
                                        Some(&final_content),
                                    );
                                    return;
                                }
                            }
                        };

                        let _ = app_handle_clone.emit(
                            "chat:stream-end",
                            serde_json::json!({
                                "conversation_id": conversation_id_clone,
                                "message_id": frontend_message_id_clone,
                                "backend_message_id": assistant_message.id,
                                "pending_messages_count": pending_messages_count(),
                                "has_pending_messages": has_pending_messages()
                            }),
                        );

                        let _ = app_handle_clone.emit(
                            "agent:finished",
                            serde_json::json!({
                                "success": success,
                                "result": final_content,
                                "duration_ms": start_time.elapsed().as_millis() as u64
                            }),
                        );
                    }
                    Err(e) => {
                        let error_msg = e.to_string();
                        let _ = app_handle_clone.emit(
                            "agent:finished",
                            serde_json::json!({
                                "success": false,
                                "error": error_msg,
                                "duration_ms": start_time.elapsed().as_millis() as u64
                            }),
                        );
                        let _ = app_handle_clone.emit(
                            "chat:stream-error",
                            serde_json::json!({
                                "conversation_id": conversation_id_clone,
                                "message_id": frontend_message_id_clone,
                                "error": "Agent execution failed"
                            }),
                        );
                        let _ = app_handle_clone.emit(
                            "chat:stream-end",
                            serde_json::json!({
                                "conversation_id": conversation_id_clone,
                                "message_id": frontend_message_id_clone,
                                "content": "Agent execution failed.",
                                "error": true,
                                "has_pending_messages": has_pending_messages()
                            }),
                        );
                    }
                }
            });

            return Ok(ChatSendMessageResponse {
                conversation,
                user_message,
                assistant_message: Message::default(),
                stats: ConversationStats {
                    message_count: 0,
                    total_tokens: 0,
                    total_input_tokens: 0,
                    total_output_tokens: 0,
                    total_cost: 0.0,
                },
                last_message: None,
                credits: None,
            });
        }

        // Clone all needed variables for the spawned task
        let app_handle_clone = app_handle.clone();
        let frontend_message_id_clone = frontend_message_id.clone();
        let conversation_id_clone = conversation.id;
        let llm_request_clone = llm_request.clone();
        let preferences_clone = preferences.clone();
        let router_arc = _llm_state.router.clone();
        let db_arc_clone = db_arc.clone();
        let provider_enum_clone = provider_enum;
        let model_clone = model.clone();
        let user_id_clone = request.user_id.clone();
        let project_folder_clone = request.project_folder.clone();
        let conversation_mode_clone = request.conversation_mode.clone();
        let correlation_id_clone = correlation_id.clone();

        // Spawn streaming task to avoid blocking the command response
        // Return immediately - events will handle the streaming updates
        tauri::async_runtime::spawn(async move {
            let router = router_arc.read().await;

            match router
                .send_message_streaming(&llm_request_clone, &preferences_clone)
                .await
            {
                Ok(stream) => {
                    let mut full_content = String::new();

                    // Consume the initial SSE stream via the shared helper.
                    let stream_result = consume_llm_stream(
                        stream,
                        &app_handle_clone,
                        conversation_id_clone,
                        &frontend_message_id_clone,
                        &mut full_content,
                        STREAM_CHUNK_IDLE_TIMEOUT_SECS,
                    )
                    .await;

                    let stream_data = match stream_result {
                        Ok(data) => data,
                        Err(_) => {
                            // consume_llm_stream already emitted stream-error;
                            // emit stream-end so the frontend can clean up loading state.
                            let _ = app_handle_clone.emit(
                                "chat:stream-end",
                                serde_json::json!({
                                    "conversation_id": conversation_id_clone,
                                    "message_id": frontend_message_id_clone,
                                    "content": full_content.clone(),
                                    "error": true,
                                    "has_pending_messages": has_pending_messages()
                                }),
                            );
                            return;
                        }
                    };

                    let mut token_count = stream_data.token_count;
                    let mut final_usage = stream_data.usage;
                    let mut final_credits = stream_data.credits;
                    let final_finish_reason = stream_data.finish_reason.clone();
                    let was_stopped = stream_data.was_stopped;
                    let tool_calls = stream_data.tool_calls;

                    // Execute tool calls whenever we actually received streamed tool deltas.
                    // Some OpenAI-compatible providers omit finish_reason=tool_calls even when
                    // tool calls are present in streamed chunks.
                    let has_tool_calls = !tool_calls.is_empty();
                    let mut tool_failure_summaries: Vec<String> = Vec::new();

                    if has_tool_calls && !was_stopped {
                        if final_finish_reason.as_deref() != Some("tool_calls") {
                            info!(
                                "[Chat] Streamed tool calls detected without finish_reason=tool_calls (finish_reason={:?})",
                                final_finish_reason
                            );
                        }
                        info!(
                            "[Chat] Streaming completed with {} tool call(s) - executing tools",
                            tool_calls.len()
                        );

                        // Emit tool calls event
                        let _ = app_handle_clone.emit(
                            "chat:tool-calls",
                            serde_json::json!({
                                "conversation_id": conversation_id_clone,
                                "message_id": frontend_message_id_clone,
                                "tool_calls": tool_calls,
                                "streaming": true
                            }),
                        );

                        // Execute each tool and collect results
                        let (tool_results, batch_failures) = execute_tool_calls_batch(
                            &tool_calls,
                            &app_handle_clone,
                            conversation_id_clone,
                            &frontend_message_id_clone,
                            project_folder_clone.clone(),
                            conversation_mode_clone.clone(),
                            0,
                            None,
                        )
                        .await;
                        tool_failure_summaries.extend(batch_failures);

                        if did_fast_metadata_batch_fail(&tool_results) {
                            let fallback =
                                build_fast_metadata_failure_message(&tool_failure_summaries);
                            full_content.push_str(&fallback);
                            let _ = app_handle_clone.emit(
                                "chat:stream-chunk",
                                serde_json::json!({
                                    "conversation_id": conversation_id_clone,
                                    "message_id": frontend_message_id_clone,
                                    "delta": fallback,
                                    "content": full_content.clone(),
                                    "has_pending_messages": has_pending_messages()
                                }),
                            );
                        } else {
                            // ── Streaming agentic loop ────────────────────────────
                            // Send follow-up requests to the LLM with tool results,
                            // continuing until the model stops requesting more tools
                            // or we hit the safety limit.
                            let mut streaming_tool_iteration = 0;
                            let mut current_tool_calls = tool_calls;
                            let mut current_tool_results = tool_results;
                            let mut only_fast_metadata_tools =
                                is_fast_metadata_batch(&current_tool_results);
                            let mut has_media_tools = current_tool_results
                                .iter()
                                .any(|r| is_media_generation_tool(&r.tool_name));
                            let mut max_streaming_tool_iterations =
                                resolve_streaming_tool_loop_max_iterations(
                                    only_fast_metadata_tools,
                                );
                            let streaming_tool_loop_started = std::time::Instant::now();

                            // Task 13: Emit loop lifecycle start event
                            let _ = app_handle_clone.emit(
                                "agentic:loop-started",
                                serde_json::json!({
                                    "conversation_id": conversation_id_clone,
                                    "message_id": frontend_message_id_clone,
                                    "max_iterations": max_streaming_tool_iterations,
                                }),
                            );

                            loop {
                                streaming_tool_iteration += 1;
                                let loop_max_secs =
                                    resolve_streaming_tool_loop_max_secs(only_fast_metadata_tools);
                                if streaming_tool_loop_started.elapsed().as_secs() >= loop_max_secs
                                {
                                    warn!(
                                        "[Chat] Streaming tool loop exceeded {}s, stopping",
                                        loop_max_secs
                                    );
                                    full_content.push_str(
                                        "\n\n*Stopped tool loop after timeout while waiting for follow-up responses.*",
                                    );
                                    // AUDIT-STREAM-027 fix: Emit stream-chunk for fallback text
                                    let _ = app_handle_clone.emit(
                                        "chat:stream-chunk",
                                        serde_json::json!({
                                            "conversation_id": conversation_id_clone,
                                            "message_id": frontend_message_id_clone,
                                            "delta": "\n\n*Stopped tool loop after timeout while waiting for follow-up responses.*",
                                            "content": full_content.clone(),
                                            "has_pending_messages": has_pending_messages()
                                        }),
                                    );
                                    let _ = app_handle_clone.emit(
                                        "chat:agent-progress",
                                        serde_json::json!({
                                            "conversation_id": conversation_id_clone,
                                            "iteration": streaming_tool_iteration,
                                            "max_iterations": max_streaming_tool_iterations,
                                            "status": "timeout_reached"
                                        }),
                                    );
                                    // Task 13: Emit loop lifecycle end event
                                    let _ = app_handle_clone.emit(
                                        "agentic:loop-ended",
                                        serde_json::json!({
                                            "conversation_id": conversation_id_clone,
                                            "message_id": frontend_message_id_clone,
                                            "iterations_used": streaming_tool_iteration,
                                            "reason": "timeout",
                                        }),
                                    );
                                    break;
                                }
                                if streaming_tool_iteration > max_streaming_tool_iterations {
                                    warn!(
                                        "[Chat] Streaming tool iteration limit reached ({}), stopping",
                                        max_streaming_tool_iterations
                                    );
                                    let _ = app_handle_clone.emit(
                                        "chat:agent-progress",
                                        serde_json::json!({
                                            "conversation_id": conversation_id_clone,
                                            "iteration": streaming_tool_iteration - 1,
                                            "max_iterations": max_streaming_tool_iterations,
                                            "status": "limit_reached"
                                        }),
                                    );
                                    // Task 13: Emit loop lifecycle end event
                                    let _ = app_handle_clone.emit(
                                        "agentic:loop-ended",
                                        serde_json::json!({
                                            "conversation_id": conversation_id_clone,
                                            "message_id": frontend_message_id_clone,
                                            "iterations_used": streaming_tool_iteration - 1,
                                            "reason": "limit_reached",
                                        }),
                                    );
                                    break;
                                }

                                // Task 13: Emit per-iteration loop status
                                let _ = app_handle_clone.emit(
                                    "agentic:loop-status",
                                    serde_json::json!({
                                        "conversation_id": conversation_id_clone,
                                        "message_id": frontend_message_id_clone,
                                        "iteration": streaming_tool_iteration,
                                        "max_iterations": max_streaming_tool_iterations,
                                        "status": "executing",
                                        "has_pending_messages": has_pending_messages_for_conversation(conversation_id_clone),
                                    }),
                                );

                                // Emit agent progress event so the UI can show iteration state
                                let _ = app_handle_clone.emit(
                                    "chat:agent-progress",
                                    serde_json::json!({
                                        "conversation_id": conversation_id_clone,
                                        "iteration": streaming_tool_iteration,
                                        "max_iterations": max_streaming_tool_iterations,
                                        "status": "executing_tools"
                                    }),
                                );

                                // Build follow-up messages with tool results
                                let mut followup_messages = llm_request_clone.messages.clone();

                                // Add assistant message with tool calls
                                followup_messages.push(crate::core::llm::ChatMessage {
                                    role: "assistant".to_string(),
                                    content: full_content.clone(),
                                    tool_calls: Some(
                                        current_tool_calls
                                            .iter()
                                            .map(|tc| crate::core::llm::ToolCall {
                                                id: tc.id.clone(),
                                                name: tc.name.clone(),
                                                arguments: tc.arguments.clone(),
                                            })
                                            .collect(),
                                    ),
                                    tool_call_id: None,
                                    multimodal_content: None,
                                });

                                // Add tool results as tool role messages
                                for result in &current_tool_results {
                                    followup_messages.push(crate::core::llm::ChatMessage {
                                        role: "tool".to_string(),
                                        content: result.to_message_content(),
                                        tool_calls: None,
                                        tool_call_id: Some(result.tool_call_id.clone()),
                                        multimodal_content: None,
                                    });
                                }

                                // Task 3: Check for queued follow-up messages from the user
                                // and inject them into the conversation before the next LLM call.
                                // Use atomic pop (single lock) to avoid check-then-act race.
                                if let Some(pending) =
                                    pop_pending_message_for_conversation(conversation_id_clone)
                                {
                                    info!(
                                        "[Chat] Injecting pending user message into agentic loop: {}...",
                                        pending.content.chars().take(50).collect::<String>()
                                    );
                                    followup_messages.push(crate::core::llm::ChatMessage {
                                        role: "user".to_string(),
                                        content: pending.content.clone(),
                                        tool_calls: None,
                                        tool_call_id: None,
                                        multimodal_content: None,
                                    });
                                    let _ = app_handle_clone.emit(
                                        "agentic:message-consumed",
                                        serde_json::json!({
                                            "conversation_id": conversation_id_clone,
                                            "message_id": frontend_message_id_clone,
                                            "pending_message": pending,
                                        }),
                                    );
                                }

                                // BUG-06: compact followup_messages to prevent unbounded
                                // context growth across streaming tool loop iterations.
                                const TOOL_LOOP_COMPACT_THRESHOLD: usize = 20;
                                const TOOL_LOOP_KEEP_RECENT: usize = 10;
                                if followup_messages.len() > TOOL_LOOP_COMPACT_THRESHOLD {
                                    let total = followup_messages.len();
                                    let keep_start = 1.min(total);
                                    let mut keep_end_start =
                                        total.saturating_sub(TOOL_LOOP_KEEP_RECENT);
                                    // Snap backward to the nearest assistant message to avoid splitting
                                    // a tool_use/tool_result pair.
                                    while keep_end_start > keep_start
                                        && followup_messages[keep_end_start].role != "assistant"
                                    {
                                        keep_end_start -= 1;
                                    }
                                    let compacted_count = keep_end_start.saturating_sub(keep_start);
                                    if compacted_count > 0 {
                                        let mut summary_parts: Vec<String> = Vec::new();
                                        for msg in &followup_messages[keep_start..keep_end_start] {
                                            let preview: String =
                                                msg.content.chars().take(200).collect();
                                            summary_parts
                                                .push(format!("[{}]: {}", msg.role, preview));
                                        }
                                        let summary_msg = crate::core::llm::ChatMessage {
                                            role: "user".to_string(),
                                            content: format!(
                                                "[Context Summary — compacted {} earlier tool-loop messages]\n{}",
                                                compacted_count,
                                                summary_parts.join("\n")
                                            ),
                                            tool_calls: None,
                                            tool_call_id: None,
                                            multimodal_content: None,
                                        };
                                        let mut compacted =
                                            Vec::with_capacity(2 + TOOL_LOOP_KEEP_RECENT);
                                        if keep_start > 0 {
                                            compacted.push(followup_messages[0].clone());
                                        }
                                        compacted.push(summary_msg);
                                        compacted.extend_from_slice(
                                            &followup_messages[keep_end_start..],
                                        );
                                        tracing::debug!(
                                            "[Chat] Compacted tool loop messages: {} -> {}",
                                            total,
                                            compacted.len()
                                        );
                                        followup_messages = compacted;
                                    }
                                }

                                // Send follow-up request to LLM with streaming enabled
                                // so users see tokens arrive in real-time during multi-turn tool use.
                                let followup_request = crate::core::llm::LLMRequest {
                                    messages: followup_messages,
                                    model: model_clone.clone(),
                                    temperature: Some(DEFAULT_TEMPERATURE),
                                    max_tokens: Some(DEFAULT_MAX_TOKENS),
                                    stream: true,
                                    tools: llm_request_clone.tools.clone(),
                                    tool_choice: llm_request_clone.tool_choice.clone(),
                                    thinking_mode: llm_request_clone.thinking_mode,
                                    thinking: llm_request_clone.thinking.clone(),
                                    ..Default::default()
                                };

                                let followup_total_timeout_secs =
                                    resolve_followup_total_timeout_secs(only_fast_metadata_tools);
                                let followup_invoke_timeout_secs =
                                    resolve_followup_invoke_timeout_secs(
                                        only_fast_metadata_tools,
                                        has_media_tools,
                                    );

                                // Attempt to open a streaming connection with retry/fallback.
                                let followup_stream_result = tokio::time::timeout(
                                    std::time::Duration::from_secs(followup_total_timeout_secs),
                                    router.send_message_streaming(
                                        &followup_request,
                                        &preferences_clone,
                                    ),
                                )
                                .await;

                                let followup_stream = match followup_stream_result {
                                    Ok(Ok(s)) => Some(s),
                                    Ok(Err(e)) => {
                                        warn!("[Chat] Follow-up streaming request failed: {}", e);
                                        None
                                    }
                                    Err(_) => {
                                        warn!(
                                            "[Chat] Follow-up streaming request timed out after {}s",
                                            followup_total_timeout_secs
                                        );
                                        None
                                    }
                                };

                                match followup_stream {
                                    Some(stream) => {
                                        // Separate the follow-up content with a blank line.
                                        full_content.push_str("\n\n");
                                        let _ = app_handle_clone.emit(
                                            "chat:stream-chunk",
                                            serde_json::json!({
                                                "conversation_id": conversation_id_clone,
                                                "message_id": frontend_message_id_clone,
                                                "delta": "\n\n",
                                                "content": full_content.clone(),
                                                "has_pending_messages": has_pending_messages()
                                            }),
                                        );

                                        // Consume the follow-up stream through the same helper
                                        // used for the initial request, so users see tokens in
                                        // real-time during agentic loop iterations.
                                        let followup_consume = consume_llm_stream(
                                            stream,
                                            &app_handle_clone,
                                            conversation_id_clone,
                                            &frontend_message_id_clone,
                                            &mut full_content,
                                            followup_invoke_timeout_secs,
                                        )
                                        .await;

                                        match followup_consume {
                                            Ok(followup_data) => {
                                                token_count += followup_data.token_count;

                                                if let Some(credits) = followup_data.credits {
                                                    final_credits = Some(credits);
                                                }
                                                if let Some(usage) = followup_data.usage {
                                                    final_usage = Some(usage);
                                                }

                                                // ── Handle pause_turn stop reason ────────
                                                // Anthropic may pause a long-running turn; we
                                                // just continue by feeding the response back.
                                                if followup_data.finish_reason.as_deref()
                                                    == Some("pause_turn")
                                                {
                                                    info!(
                                                        "[Chat] Received pause_turn, continuing conversation"
                                                    );
                                                    current_tool_calls = Vec::new();
                                                    current_tool_results = Vec::new();
                                                    continue;
                                                }

                                                // Check if the follow-up response also has tool calls
                                                let new_tool_calls = followup_data.tool_calls;
                                                if !new_tool_calls.is_empty() {
                                                    info!(
                                                        "[Chat] Follow-up streaming response has {} more tool call(s) (iteration {})",
                                                        new_tool_calls.len(),
                                                        streaming_tool_iteration
                                                    );

                                                    // Emit tool calls event
                                                    let _ = app_handle_clone.emit(
                                                        "chat:tool-calls",
                                                        serde_json::json!({
                                                            "conversation_id": conversation_id_clone,
                                                            "message_id": frontend_message_id_clone,
                                                            "tool_calls": new_tool_calls,
                                                            "streaming": true,
                                                            "iteration": streaming_tool_iteration
                                                        }),
                                                    );

                                                    // Execute the new tool calls
                                                    let (new_results, batch_failures) =
                                                        execute_tool_calls_batch(
                                                            &new_tool_calls,
                                                            &app_handle_clone,
                                                            conversation_id_clone,
                                                            &frontend_message_id_clone,
                                                            project_folder_clone.clone(),
                                                            conversation_mode_clone.clone(),
                                                            streaming_tool_iteration,
                                                            None,
                                                        )
                                                        .await;
                                                    tool_failure_summaries.extend(batch_failures);

                                                    if did_fast_metadata_batch_fail(&new_results) {
                                                        let fallback =
                                                            build_fast_metadata_failure_message(
                                                                &tool_failure_summaries,
                                                            );
                                                        full_content.push_str("\n\n");
                                                        full_content.push_str(&fallback);
                                                        let _ = app_handle_clone.emit(
                                                            "chat:stream-chunk",
                                                            serde_json::json!({
                                                                "conversation_id": conversation_id_clone,
                                                                "message_id": frontend_message_id_clone,
                                                                "delta": fallback,
                                                                "content": full_content.clone(),
                                                                "has_pending_messages": has_pending_messages()
                                                            }),
                                                        );
                                                        // Task 13: Emit loop lifecycle end event
                                                        let _ = app_handle_clone.emit(
                                                            "agentic:loop-ended",
                                                            serde_json::json!({
                                                                "conversation_id": conversation_id_clone,
                                                                "message_id": frontend_message_id_clone,
                                                                "iterations_used": streaming_tool_iteration,
                                                                "reason": "fast_metadata_failed",
                                                            }),
                                                        );
                                                        break;
                                                    }

                                                    if !new_results.is_empty() {
                                                        // Continue the loop with the new tool results.
                                                        // Tool calls from consume_llm_stream are already
                                                        // StreamingToolCall values with normalized IDs,
                                                        // so use them directly.
                                                        current_tool_calls = new_tool_calls;
                                                        current_tool_results = new_results;
                                                        has_media_tools =
                                                            current_tool_results.iter().any(|r| {
                                                                is_media_generation_tool(
                                                                    &r.tool_name,
                                                                )
                                                            });
                                                        only_fast_metadata_tools =
                                                            is_fast_metadata_batch(
                                                                &current_tool_results,
                                                            );
                                                        max_streaming_tool_iterations =
                                                            resolve_streaming_tool_loop_max_iterations(
                                                                only_fast_metadata_tools,
                                                            );
                                                        continue;
                                                    }
                                                }

                                                // No more tool calls or all were server-side -- done
                                                // Task 13: Emit loop lifecycle end event
                                                let _ = app_handle_clone.emit(
                                                    "agentic:loop-ended",
                                                    serde_json::json!({
                                                        "conversation_id": conversation_id_clone,
                                                        "message_id": frontend_message_id_clone,
                                                        "iterations_used": streaming_tool_iteration,
                                                        "reason": "completed",
                                                    }),
                                                );
                                                break;
                                            }
                                            Err(e) => {
                                                // Stream consumption failed (timeout or provider error).
                                                // consume_llm_stream already emitted stream-error.
                                                warn!(
                                                    "[Chat] Follow-up stream consumption failed: {}",
                                                    e
                                                );
                                                // Task 13: Emit loop lifecycle end event
                                                let _ = app_handle_clone.emit(
                                                    "agentic:loop-ended",
                                                    serde_json::json!({
                                                        "conversation_id": conversation_id_clone,
                                                        "message_id": frontend_message_id_clone,
                                                        "iterations_used": streaming_tool_iteration,
                                                        "reason": "stream_error",
                                                    }),
                                                );
                                                break;
                                            }
                                        }
                                    }
                                    None => {
                                        error!("[Chat] All follow-up streaming candidates failed");
                                        let fallback_delta = {
                                            let successful_tool_outputs = current_tool_results
                                                .iter()
                                                .filter(|result| result.success)
                                                .take(3)
                                                .filter_map(|result| {
                                                    let content = result.to_message_content();
                                                    let trimmed = content.trim();
                                                    if trimmed.is_empty() {
                                                        return None;
                                                    }
                                                    let snippet: String =
                                                        trimmed.chars().take(3000).collect();
                                                    Some(format!(
                                                        "Tool `{}` output:\n{}",
                                                        result.tool_name, snippet
                                                    ))
                                                })
                                                .collect::<Vec<_>>();

                                            if !successful_tool_outputs.is_empty() {
                                                format!(
                                                    "\n\nI couldn't generate a final explanation from the model, but the tool ran successfully:\n\n{}",
                                                    successful_tool_outputs.join("\n\n")
                                                )
                                            } else {
                                                "\n\n*Tool execution completed but unable to generate final response.*".to_string()
                                            }
                                        };

                                        full_content.push_str(&fallback_delta);
                                        // AUDIT-STREAM-027 fix: Emit stream-chunk for fallback text
                                        let _ = app_handle_clone.emit(
                                            "chat:stream-chunk",
                                            serde_json::json!({
                                                "conversation_id": conversation_id_clone,
                                                "message_id": frontend_message_id_clone,
                                                "delta": fallback_delta,
                                                "content": full_content.clone(),
                                                "has_pending_messages": has_pending_messages()
                                            }),
                                        );
                                        // Task 13: Emit loop lifecycle end event
                                        let _ = app_handle_clone.emit(
                                            "agentic:loop-ended",
                                            serde_json::json!({
                                                "conversation_id": conversation_id_clone,
                                                "message_id": frontend_message_id_clone,
                                                "iterations_used": streaming_tool_iteration,
                                                "reason": "candidates_failed",
                                            }),
                                        );
                                        break;
                                    }
                                }
                            }

                            if streaming_tool_iteration > 1 {
                                info!(
                                    "[Chat] Streaming tool loop completed after {} iteration(s)",
                                    streaming_tool_iteration
                                );
                            }
                        }
                    }

                    if was_stopped && !full_content.is_empty() {
                        full_content.push_str("\n\n*[Generation stopped by user]*");
                        // AUDIT-STREAM-027 fix: Emit stream-chunk for stop message
                        let _ = app_handle_clone.emit(
                            "chat:stream-chunk",
                            serde_json::json!({
                                "conversation_id": conversation_id_clone,
                                "message_id": frontend_message_id_clone,
                                "delta": "\n\n*[Generation stopped by user]*",
                                "content": full_content.clone(),
                                "has_pending_messages": has_pending_messages()
                            }),
                        );
                    }

                    if full_content.trim().is_empty() {
                        let fallback = if !tool_failure_summaries.is_empty() {
                            format!(
                                "I couldn't complete that because one or more tools failed: {}. \
Please confirm the tool permissions or try a different approach.",
                                tool_failure_summaries.join("; ")
                            )
                        } else {
                            "I couldn't generate a response. Please try again.".to_string()
                        };

                        full_content = fallback.clone();
                        let _ = app_handle_clone.emit(
                            "chat:stream-chunk",
                            serde_json::json!({
                                "conversation_id": conversation_id_clone,
                                "message_id": frontend_message_id_clone,
                                "delta": fallback,
                                "content": full_content.clone(),
                                "has_pending_messages": has_pending_messages()
                            }),
                        );
                    }

                    // Save assistant message to database
                    let assistant_message = if incognito {
                        // Compute final tokens/cost for the in-memory message
                        let (final_tokens, final_cost) = {
                            let output_tokens = if let Some(usage) = &final_usage {
                                if let Some(comp) = usage.completion_tokens {
                                    comp
                                } else if let (Some(total), Some(prompt)) =
                                    (usage.total_tokens, usage.prompt_tokens)
                                {
                                    total.saturating_sub(prompt)
                                } else {
                                    token_count
                                }
                            } else {
                                token_count
                            };
                            let cost = if let Some(p) = provider_enum_clone {
                                CostCalculator::new().calculate(p, &model_clone, 0, output_tokens)
                            } else {
                                0.0
                            };
                            (output_tokens, cost)
                        };
                        Message {
                            id: -1,
                            conversation_id: conversation_id_clone,
                            user_id: user_id_clone.clone(),
                            role: MessageRole::Assistant,
                            content: full_content.clone(),
                            tokens: Some(final_tokens as i32),
                            cost: Some(final_cost),
                            provider: provider_enum_clone.map(|p| p.as_string().to_string()),
                            model: Some(model_clone.clone()),
                            created_at: Utc::now(),
                            parent_message_id: None,
                            branch_id: Some("main".to_string()),
                        }
                    } else {
                        let conn = match db_arc_clone.connection() {
                            Ok(conn) => conn,
                            Err(e) => {
                                emit_stream_failure(
                                    &app_handle_clone,
                                    conversation_id_clone,
                                    &frontend_message_id_clone,
                                    format!("Database error: {e}"),
                                    Some(&full_content),
                                );
                                return;
                            }
                        };

                        // Implement accurate token/cost tracking favoring provider data
                        // If we have explicit credits (e.g. ManagedCloud), use that cost directly
                        // Otherwise calculate based on accurate token counts from usage statistics
                        let (final_tokens, final_cost) = if let Some(credits) = &final_credits {
                            let cost = credits.cost_cents / 100.0;
                            let tokens = if let Some(usage) = &final_usage {
                                usage.completion_tokens.unwrap_or(token_count)
                            } else {
                                token_count
                            };
                            (tokens, cost)
                        } else {
                            // Determine best estimate of output tokens
                            let output_tokens = if let Some(usage) = &final_usage {
                                if let Some(comp) = usage.completion_tokens {
                                    comp
                                } else if let (Some(total), Some(prompt)) =
                                    (usage.total_tokens, usage.prompt_tokens)
                                {
                                    total.saturating_sub(prompt)
                                } else {
                                    token_count
                                }
                            } else {
                                token_count
                            };

                            let cost = if let Some(p) = provider_enum_clone {
                                CostCalculator::new().calculate(p, &model_clone, 0, output_tokens)
                            } else {
                                0.0
                            };
                            (output_tokens, cost)
                        };

                        let msg = Message {
                            id: 0,
                            conversation_id: conversation_id_clone,
                            user_id: user_id_clone.clone(),
                            role: MessageRole::Assistant,
                            content: full_content.clone(),
                            tokens: Some(final_tokens as i32),
                            cost: Some(final_cost),
                            provider: provider_enum_clone.map(|p| p.as_string().to_string()),
                            model: Some(model_clone.clone()),
                            created_at: Utc::now(),
                            parent_message_id: None,
                            branch_id: Some("main".to_string()),
                        };
                        match repository::create_message(&conn, &msg) {
                            Ok(id) => match repository::get_message(&conn, id) {
                                Ok(msg) => msg,
                                Err(e) => {
                                    emit_stream_failure(
                                        &app_handle_clone,
                                        conversation_id_clone,
                                        &frontend_message_id_clone,
                                        format!("Failed to retrieve message: {e}"),
                                        Some(&full_content),
                                    );
                                    return;
                                }
                            },
                            Err(e) => {
                                emit_stream_failure(
                                    &app_handle_clone,
                                    conversation_id_clone,
                                    &frontend_message_id_clone,
                                    format!("Failed to save message: {e}"),
                                    Some(&full_content),
                                );
                                return;
                            }
                        }
                    };

                    // AUDIT-STREAM-062 fix: Check pending messages only for this conversation
                    let pending_at_end =
                        peek_pending_messages_for_conversation(conversation_id_clone);

                    info!(
                        target: "chat",
                        correlation_id = %correlation_id_clone,
                        conversation_id = conversation_id_clone,
                        message_id = %frontend_message_id_clone,
                        backend_message_id = assistant_message.id,
                        token_count = token_count,
                        pending_messages = pending_at_end.len(),
                        "Chat send_message completed successfully"
                    );

                    let _ = app_handle_clone.emit(
                        "chat:stream-end",
                        serde_json::json!({
                            "conversation_id": conversation_id_clone,
                            "message_id": frontend_message_id_clone,
                            "backend_message_id": assistant_message.id,
                            "pending_messages_count": pending_at_end.len(),
                            "has_pending_messages": !pending_at_end.is_empty(),
                            "usage": final_usage,
                            "credits": final_credits,
                            "finish_reason": final_finish_reason
                        }),
                    );

                    // If there are pending messages, emit them for processing
                    if !pending_at_end.is_empty() {
                        info!(
                            target: "chat",
                            correlation_id = %correlation_id_clone,
                            pending_count = pending_at_end.len(),
                            "Stream ended with pending messages to process"
                        );
                        let _ = app_handle_clone.emit(
                            "chat:pending-messages-ready",
                            serde_json::json!({
                                "conversation_id": conversation_id_clone,
                                "pending_messages": pending_at_end,
                                "count": pending_at_end.len()
                            }),
                        );
                    }
                }
                Err(e) => {
                    tracing::error!(
                        target: "chat",
                        correlation_id = %correlation_id_clone,
                        conversation_id = conversation_id_clone,
                        error = %e,
                        "Chat send_message failed with streaming error"
                    );
                    emit_stream_failure(
                        &app_handle_clone,
                        conversation_id_clone,
                        &frontend_message_id_clone,
                        format!("Streaming failed: {e}"),
                        None,
                    );
                }
            }
        });

        // Return immediately for streaming mode - events handle the response
        return Ok(ChatSendMessageResponse {
            conversation,
            user_message,
            assistant_message: Message::default(),
            stats: ConversationStats {
                message_count: 0,
                total_tokens: 0,
                total_input_tokens: 0,
                total_output_tokens: 0,
                total_cost: 0.0,
            },
            last_message: None,
            credits: None,
        });
    }

    if is_deep_research {
        use crate::core::research::{ResearchMode, ResearchOrchestrator};

        let research_config = _research_state.config.read().await.clone();
        let orchestrator = ResearchOrchestrator::new(_llm_state.router.clone(), research_config)
            .map_err(|e| format!("Failed to initialize research: {}", e))?
            .with_app_handle(app_handle.clone())
            .with_task_id(request.research_task_id.clone());

        let result = orchestrator
            .research(&request.content, ResearchMode::Deep)
            .await
            .map_err(|e| e.to_string())?;

        let assistant_message = save_or_skip_assistant_message(
            &_db,
            conversation.id,
            &conversation.user_id,
            &result.report,
            None,
            None,
            provider_enum.map(|p| p.as_string()),
            &model,
            incognito,
            cloud_sync_enabled,
        )?;

        let stats = compute_or_skip_stats(&_db, conversation.id, incognito)?;

        return Ok(ChatSendMessageResponse {
            conversation,
            user_message,
            assistant_message,
            stats,
            last_message: Some(result.report),
            credits: None,
        });
    }

    if agent_mode {
        use crate::automation::AutomationService;
        use crate::core::agi::{AGIConfig, AgentOrchestrator};

        let orchestrator_arc = {
            let guard = crate::sys::commands::agi::ORCHESTRATOR.lock();
            guard.clone()
        };

        let orchestrator_arc = match orchestrator_arc {
            Some(orch) => orch,
            None => {
                let automation = match AutomationService::new() {
                    Ok(service) => service,
                    Err(e) => {
                        let _ = app_handle.emit(
                            "automation:permission_required",
                            serde_json::json!({
                                "reason": "agent_mode",
                                "message": "Grant Accessibility, Screen Recording, and Input Monitoring permissions to use Agent mode."
                            }),
                        );
                        return Err(format!("Automation service unavailable: {}", e));
                    }
                };
                let orchestrator = AgentOrchestrator::new(
                    4,
                    AGIConfig::default(),
                    _llm_state.router.clone(),
                    Arc::new(automation),
                    Some(app_handle.clone()),
                )
                .map_err(|e| format!("Failed to initialize orchestrator: {}", e))?;

                let orchestrator_arc = Arc::new(tokio::sync::Mutex::new(orchestrator));
                *crate::sys::commands::agi::ORCHESTRATOR.lock() = Some(orchestrator_arc.clone());
                orchestrator_arc
            }
        };

        let orchestrator_result = {
            let orchestrator = orchestrator_arc.lock().await;
            orchestrator
                .process_instruction(&agent_instruction, request.attachments.clone())
                .await
                .map_err(|e| format!("Agent execution failed: {}", e))?
        };

        let mut final_content = orchestrator_result.summary.clone();
        let mut final_tokens: Option<u32> = None;
        let mut final_cost: Option<f64> = None;

        if orchestrator_result.success {
            let mut messages = llm_request.messages.clone();
            messages.push(ChatMessage {
                role: "system".to_string(),
                content: format!(
                    "Agent execution summary:\n{}\n\nProvide a clear final response to the user using this summary.",
                    orchestrator_result.summary
                ),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            });

            let final_request = LLMRequest {
                messages,
                model: model.clone(),
                temperature: Some(DEFAULT_TEMPERATURE),
                max_tokens: Some(DEFAULT_MAX_TOKENS),
                stream: false,
                tools: None,
                tool_choice: None,
                thinking_mode: None,
                ..Default::default()
            };

            let router = _llm_state.router.read().await;
            let candidates = router.candidates(&final_request, &preferences);
            if let Some(candidate) = candidates.first() {
                if let Ok(outcome) = router.invoke_candidate(candidate, &final_request).await {
                    final_content = outcome.response.content.clone();
                    final_tokens = outcome.response.tokens;
                    final_cost = outcome.response.cost;
                }
            }
        }

        let assistant_message = save_or_skip_assistant_message(
            &_db,
            conversation.id,
            &conversation.user_id,
            &final_content,
            final_tokens.map(|t| t as i32),
            final_cost,
            provider_enum.map(|p| p.as_string()),
            &model,
            incognito,
            cloud_sync_enabled,
        )?;

        let stats = compute_or_skip_stats(&_db, conversation.id, incognito)?;

        return Ok(ChatSendMessageResponse {
            conversation,
            user_message,
            assistant_message,
            stats,
            last_message: Some(final_content),
            credits: None,
        });
    }

    // Ensure ManagedCloud provider is initialized if user is authenticated
    ensure_managed_cloud_provider(&_llm_state.router).await;

    let candidates = {
        let router = _llm_state.router.read().await;
        router.candidates(&llm_request, &preferences)
    };

    if candidates.is_empty() {
        // Fallback logic: If the requested provider (e.g. OpenAI) is not locally configured,
        // but Managed Cloud IS available (authenticated user), redirect to Managed Cloud proxy.
        let router = _llm_state.router.read().await;
        if router.has_provider(Provider::ManagedCloud) {
            let provider_name = request
                .provider_override
                .clone()
                .or(request.provider.clone());
            if let Some(name) = provider_name {
                info!(
                    "[Chat] Redirecting request for unconfigured provider '{}' to Managed Cloud",
                    name
                );

                let fallback_candidate = crate::core::llm::llm_router::RouteCandidate {
                    provider: Provider::ManagedCloud,
                    model: model.clone(), // Use the same model name as a hint for the cloud proxy
                    reason: "fallback-redirect-to-managed-cloud",
                    strategy: None,
                };

                let result = router
                    .invoke_candidate(&fallback_candidate, &llm_request)
                    .await;
                match result {
                    Ok(outcome) => {
                        let assistant_message = save_or_skip_assistant_message(
                            &_db,
                            conversation.id,
                            &conversation.user_id,
                            &outcome.response.content,
                            outcome.response.tokens.map(|t| t as i32),
                            outcome.response.cost,
                            Some(outcome.provider.as_string()),
                            &outcome.model,
                            incognito,
                            cloud_sync_enabled,
                        )?;

                        let stats = compute_or_skip_stats(&_db, conversation.id, incognito)?;

                        return Ok(ChatSendMessageResponse {
                            conversation,
                            user_message,
                            assistant_message,
                            stats,
                            last_message: Some(outcome.response.content),
                            credits: outcome.response.credits,
                        });
                    }
                    Err(e) => {
                        info!("[Chat] Managed Cloud fallback failed: {e}");
                    }
                }
            }
        }

        return Err(
            "No LLM providers configured. Please add an API key in Settings > API Keys or sign in to use Managed Cloud."
                .to_string(),
        );
    }

    let mut last_error: Option<String> = None;
    for candidate in candidates {
        let result = {
            let router = _llm_state.router.read().await;
            router.invoke_candidate(&candidate, &llm_request).await
        };

        match result {
            Ok(mut outcome) => {
                // Tool call handling loop - execute tools and send results back to LLM
                // This enables Claude Desktop/Code-like autonomous tool execution
                let max_tool_iterations = 25; // Safety limit -- OpenClaw/Cowork style
                let mut tool_iteration = 0;
                let mut current_messages = llm_request.messages.clone();
                let mut final_content = outcome.response.content.clone();
                let mut total_tool_tokens: u32 = 0;

                while let Some(ref tool_calls) = outcome.response.tool_calls {
                    if tool_calls.is_empty() {
                        break;
                    }

                    tool_iteration += 1;
                    if tool_iteration > max_tool_iterations {
                        warn!(
                            "[Chat] Tool iteration limit reached ({}), stopping tool execution",
                            max_tool_iterations
                        );
                        let _ = app_handle.emit(
                            "chat:agent-progress",
                            serde_json::json!({
                                "conversation_id": conversation.id,
                                "iteration": tool_iteration - 1,
                                "max_iterations": max_tool_iterations,
                                "status": "limit_reached"
                            }),
                        );
                        break;
                    }

                    info!(
                        "[Chat] LLM requested {} tool call(s) (iteration {})",
                        tool_calls.len(),
                        tool_iteration
                    );

                    // AUDIT-STREAM-072 fix: Normalize tool call IDs
                    let normalized_tool_calls =
                        normalize_tool_calls(tool_calls, &format!("tool_call_{}", tool_iteration));

                    // Emit agent progress event
                    let _ = app_handle.emit(
                        "chat:agent-progress",
                        serde_json::json!({
                            "conversation_id": conversation.id,
                            "iteration": tool_iteration,
                            "max_iterations": max_tool_iterations,
                            "status": "executing_tools",
                            "tool_count": tool_calls.len()
                        }),
                    );

                    // Emit tool calls event for UI feedback with normalized IDs
                    let _ = app_handle.emit(
                        "chat:tool-calls",
                        serde_json::json!({
                            "conversation_id": conversation.id,
                            "message_id": request.frontend_message_id.clone(),
                            "tool_calls": normalized_tool_calls,
                            "iteration": tool_iteration
                        }),
                    );

                    // Add assistant message with tool calls to conversation
                    // Convert normalized StreamingToolCall to ToolCall for the message
                    let tool_calls_for_message: Vec<crate::core::llm::ToolCall> =
                        normalized_tool_calls
                            .iter()
                            .map(|tc| crate::core::llm::ToolCall {
                                id: tc.id.clone(),
                                name: tc.name.clone(),
                                arguments: tc.arguments.clone(),
                            })
                            .collect();
                    current_messages.push(crate::core::llm::ChatMessage {
                        role: "assistant".to_string(),
                        content: outcome.response.content.clone(),
                        tool_calls: Some(tool_calls_for_message),
                        tool_call_id: None,
                        multimodal_content: None,
                    });

                    // Execute each tool and collect results
                    let frontend_msg_id = request.frontend_message_id.clone().unwrap_or_default();
                    let (tool_results, _batch_failures) = execute_tool_calls_batch(
                        &normalized_tool_calls,
                        &app_handle,
                        conversation.id,
                        &frontend_msg_id,
                        request.project_folder.clone(),
                        request.conversation_mode.clone(),
                        0,
                        None,
                    )
                    .await;

                    // Add tool results as messages
                    for result in &tool_results {
                        current_messages.push(crate::core::llm::ChatMessage {
                            role: "tool".to_string(),
                            content: result.to_message_content(),
                            tool_calls: None,
                            tool_call_id: Some(result.tool_call_id.clone()),
                            multimodal_content: None,
                        });
                    }

                    // Send updated conversation back to LLM
                    let followup_request = crate::core::llm::LLMRequest {
                        messages: current_messages.clone(),
                        model: model.clone(),
                        temperature: Some(DEFAULT_TEMPERATURE),
                        max_tokens: Some(DEFAULT_MAX_TOKENS),
                        stream: false,
                        tools: chat_tools.clone(),
                        tool_choice: tool_choice.clone(),
                        thinking_mode: request.thinking_mode,
                        ..Default::default()
                    };

                    // Use extended timeout if any tool in the batch was a media generation tool
                    let batch_has_media = tool_results
                        .iter()
                        .any(|r| is_media_generation_tool(&r.tool_name));
                    let nonstream_followup_timeout =
                        resolve_followup_invoke_timeout_secs(false, batch_has_media);

                    let followup_result = {
                        let router = _llm_state.router.read().await;
                        tokio::time::timeout(
                            std::time::Duration::from_secs(nonstream_followup_timeout),
                            router.invoke_candidate(&candidate, &followup_request),
                        )
                        .await
                    };

                    match followup_result {
                        Ok(Ok(new_outcome)) => {
                            total_tool_tokens += new_outcome.response.tokens.unwrap_or(0);
                            final_content = new_outcome.response.content.clone();

                            // Handle pause_turn stop reason (Anthropic long-running turns)
                            if new_outcome.response.finish_reason.as_deref() == Some("pause_turn") {
                                info!(
                                    "[Chat] Received pause_turn, continuing conversation (iteration {})",
                                    tool_iteration
                                );
                                // Feed the paused response back to the model by appending
                                // the assistant turn and continuing the tool loop, just as
                                // the streaming path does.
                                current_messages.push(crate::core::llm::ChatMessage {
                                    role: "assistant".to_string(),
                                    content: new_outcome.response.content.clone(),
                                    tool_calls: None,
                                    tool_call_id: None,
                                    multimodal_content: None,
                                });
                                final_content = new_outcome.response.content.clone();
                                outcome = new_outcome;
                                // Clear pending tool state so the while-loop condition
                                // re-evaluates cleanly on the next iteration.
                                outcome.response.tool_calls = None;
                                continue;
                            }

                            outcome = new_outcome;
                        }
                        Ok(Err(e)) => {
                            error!("[Chat] Follow-up LLM call failed: {}", e);
                            // Use the last successful content
                            break;
                        }
                        Err(_) => {
                            error!(
                                "[Chat] Follow-up LLM call timed out after {}s",
                                nonstream_followup_timeout
                            );
                            break;
                        }
                    }
                }

                if tool_iteration > 0 {
                    info!(
                        "[Chat] Tool execution complete after {} iteration(s), {} additional tokens used",
                        tool_iteration,
                        total_tool_tokens
                    );
                }

                let total_tokens = outcome
                    .response
                    .tokens
                    .map(|t| t as i32)
                    .map(|t| t + total_tool_tokens as i32);

                let assistant_message = save_or_skip_assistant_message(
                    &_db,
                    conversation.id,
                    &conversation.user_id,
                    &final_content,
                    total_tokens,
                    outcome.response.cost,
                    Some(outcome.provider.as_string()),
                    &outcome.model,
                    incognito,
                    cloud_sync_enabled,
                )?;

                let stats = compute_or_skip_stats(&_db, conversation.id, incognito)?;

                // Auto-detect and save architectural decisions from the conversation
                if let Err(e) = memory_handler.detect_and_save_decision(&final_content) {
                    warn!("[Chat] Failed to auto-save decision (non-fatal): {}", e);
                }

                return Ok(ChatSendMessageResponse {
                    conversation,
                    user_message,
                    assistant_message,
                    stats,
                    last_message: Some(final_content),
                    credits: outcome.response.credits,
                });
            }
            Err(e) => {
                last_error = Some(format!("{}: {e}", candidate.provider.as_string()));
            }
        }
    }

    Err(format!(
        "All providers failed. Last error:{}",
        last_error.unwrap_or_else(|| "Unknown error".to_string())
    ))
}
