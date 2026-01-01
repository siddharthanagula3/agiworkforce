use super::llm::LLMState;

use crate::data::db::models::{Conversation, Message, MessageRole};
use crate::data::db::repository;
use chrono::{Datelike, Duration as ChronoDuration, TimeZone, Utc};
use rusqlite::Connection;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, State};

use tracing::info;

pub mod types;
pub use types::*;

use once_cell::sync::Lazy;

static STOP_GENERATION: AtomicBool = AtomicBool::new(false);

// Pending messages queue for mid-task user input
static PENDING_MESSAGES: Lazy<Mutex<Vec<PendingUserMessage>>> =
    Lazy::new(|| Mutex::new(Vec::new()));

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PendingUserMessage {
    pub id: String,
    pub content: String,
    pub timestamp: chrono::DateTime<Utc>,
    pub conversation_id: Option<i64>,
}

fn detect_agentic_intent(content: &str) -> bool {
    let content_lower = content.to_lowercase();

    let agentic_patterns = [
        "build me",
        "create for me",
        "set up",
        "configure",
        "deploy",
        "migrate",
        "refactor",
        "implement",
        "automate",
        "schedule",
        "step by step",
        "multiple steps",
        "series of",
        "workflow",
        "pipeline",
        "research and",
        "analyze and",
        "find and",
        "gather and",
        "collect and",
        "across all files",
        "in every file",
        "throughout the",
        "recursively",
        "and then",
        "after that",
        "once done",
        "followed by",
    ];

    agentic_patterns
        .iter()
        .any(|pattern| content_lower.contains(pattern))
}

pub struct AppDatabase {
    pub conn: Arc<Mutex<Connection>>,
}

impl AppDatabase {
    pub fn connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.conn
            .lock()
            .map_err(|e| format!("Failed to acquire database lock: {e}"))
    }
}

#[tauri::command]
pub fn chat_create_conversation(
    db: State<'_, AppDatabase>,
    request: CreateConversationRequest,
) -> Result<Conversation, String> {
    let trimmed_title = request.title.trim();
    if trimmed_title.is_empty() {
        return Err("Conversation title cannot be empty".to_string());
    }
    if trimmed_title.len() > 500 {
        return Err("Conversation title cannot exceed 500 characters".to_string());
    }

    let conn = db.connection()?;
    let id = repository::create_conversation(&conn, trimmed_title.to_string())
        .map_err(|e| format!("Failed to create conversation: {e}"))?;
    repository::get_conversation(&conn, id)
        .map_err(|e| format!("Failed to retrieve conversation {}: {e}", id))
}

#[tauri::command]
pub fn chat_get_conversations(db: State<'_, AppDatabase>) -> Result<Vec<Conversation>, String> {
    let conn = db.connection()?;
    repository::list_conversations(&conn, 1000, 0)
        .map_err(|e| format!("Failed to list conversations: {e}"))
}

#[tauri::command]
pub fn chat_get_conversation(db: State<'_, AppDatabase>, id: i64) -> Result<Conversation, String> {
    if id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            id
        ));
    }

    let conn = db.connection()?;
    repository::get_conversation(&conn, id)
        .map_err(|e| format!("Failed to get conversation {}: {e}", id))
}

#[tauri::command]
pub fn chat_update_conversation(
    db: State<'_, AppDatabase>,
    id: i64,
    request: UpdateConversationRequest,
) -> Result<(), String> {
    if id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            id
        ));
    }

    let trimmed_title = request.title.trim();
    if trimmed_title.is_empty() {
        return Err("Conversation title cannot be empty".to_string());
    }
    if trimmed_title.len() > 500 {
        return Err("Conversation title cannot exceed 500 characters".to_string());
    }

    let conn = db.connection()?;
    repository::update_conversation_title(&conn, id, trimmed_title.to_string())
        .map_err(|e| format!("Failed to update conversation {}: {e}", id))
}

#[tauri::command]
pub fn chat_delete_conversation(db: State<'_, AppDatabase>, id: i64) -> Result<(), String> {
    if id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            id
        ));
    }

    let conn = db.connection()?;
    repository::delete_conversation(&conn, id)
        .map_err(|e| format!("Failed to delete conversation {}: {e}", id))
}

#[tauri::command]
pub fn chat_create_message(
    db: State<'_, AppDatabase>,
    request: CreateMessageRequest,
) -> Result<Message, String> {
    if request.conversation_id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            request.conversation_id
        ));
    }

    let trimmed_content = request.content.trim();
    if trimmed_content.is_empty() {
        return Err("Message content cannot be empty".to_string());
    }
    if trimmed_content.len() > 1_000_000 {
        return Err("Message content cannot exceed 1,000,000 characters".to_string());
    }

    if let Some(tokens) = request.tokens {
        if tokens < 0 {
            return Err(format!(
                "Invalid tokens value: {}. Tokens must be non-negative",
                tokens
            ));
        }
    }

    if let Some(cost) = request.cost {
        if cost < 0.0 {
            return Err(format!(
                "Invalid cost value: {}. Cost must be non-negative",
                cost
            ));
        }
    }

    let conn = db.connection()?;

    let message = Message {
        id: 0,
        conversation_id: request.conversation_id,
        role: request.role,
        content: trimmed_content.to_string(),
        tokens: request.tokens,
        cost: request.cost,
        provider: None,
        model: None,
        created_at: Utc::now(),
    };

    let id = repository::create_message(&conn, &message).map_err(|e| {
        format!(
            "Failed to create message in conversation {}: {e}",
            request.conversation_id
        )
    })?;
    repository::get_message(&conn, id)
        .map_err(|e| format!("Failed to retrieve message {}: {e}", id))
}

#[tauri::command]
pub fn chat_get_messages(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
) -> Result<Vec<Message>, String> {
    if conversation_id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            conversation_id
        ));
    }

    let conn = db.connection()?;
    repository::list_messages(&conn, conversation_id).map_err(|e| {
        format!(
            "Failed to list messages for conversation {}: {e}",
            conversation_id
        )
    })
}

#[tauri::command]
pub fn chat_update_message(
    db: State<'_, AppDatabase>,
    id: i64,
    content: String,
) -> Result<Message, String> {
    if id <= 0 {
        return Err(format!("Invalid message ID: {}. ID must be positive", id));
    }

    let trimmed_content = content.trim();
    if trimmed_content.is_empty() {
        return Err("Message content cannot be empty".to_string());
    }
    if trimmed_content.len() > 1_000_000 {
        return Err("Message content cannot exceed 1,000,000 characters".to_string());
    }

    let conn = db.connection()?;
    repository::update_message_content(&conn, id, trimmed_content.to_string())
        .map_err(|e| format!("Failed to update message {}: {e}", id))
}

#[tauri::command]
pub fn chat_delete_message(db: State<'_, AppDatabase>, id: i64) -> Result<(), String> {
    if id <= 0 {
        return Err(format!("Invalid message ID: {}. ID must be positive", id));
    }

    let conn = db.connection()?;
    repository::delete_message(&conn, id)
        .map_err(|e| format!("Failed to delete message {}: {e}", id))
}

#[tauri::command]
pub fn chat_get_conversation_stats(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
) -> Result<ConversationStats, String> {
    if conversation_id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            conversation_id
        ));
    }

    let conn = db.connection()?;
    let messages = repository::list_messages(&conn, conversation_id).map_err(|e| {
        format!(
            "Failed to list messages for conversation {}: {e}",
            conversation_id
        )
    })?;

    let message_count = messages.len();
    let total_tokens = messages.iter().filter_map(|m| m.tokens).sum();
    let total_cost = messages.iter().filter_map(|m| m.cost).sum();

    Ok(ConversationStats {
        message_count,
        total_tokens,
        total_cost,
    })
}

#[tauri::command]
pub async fn chat_send_message(
    _db: State<'_, AppDatabase>,
    _llm_state: State<'_, LLMState>,
    _settings_state: State<'_, crate::sys::commands::settings::SettingsState>,
    #[cfg_attr(not(feature = "billing"), allow(unused_variables))] _billing_state: State<
        '_,
        crate::sys::billing::BillingStateWrapper,
    >,
    app_handle: tauri::AppHandle,
    request: ChatSendMessageRequest,
) -> Result<ChatSendMessageResponse, String> {
    info!(
        "[Chat] Received message for processing: {}",
        request.content
    );

    #[cfg(feature = "billing")]
    {
        let billing = _billing_state.0.lock().await;
        if !billing.check_cloud_access() {
            return Err(
                "Subscription required. Please upgrade to the Hobby plan to use the AGI agent."
                    .to_string(),
            );
        }
    }

    {
        let conn = _db
            .connection()
            .map_err(|e| format!("Budget check failed: {e}"))?;

        if let Ok(budget_setting) = repository::get_setting(&conn, "billing.monthly_budget") {
            if let Ok(budget_limit) = budget_setting.value.parse::<f64>() {
                if budget_limit > 0.0 {
                    let now = Utc::now();
                    let start_of_month = now
                        .date_naive()
                        .with_day(1)
                        .ok_or_else(|| "Failed to determine start of month".to_string())?
                        .and_hms_opt(0, 0, 0)
                        .ok_or_else(|| "Failed to set time for start of month".to_string())?
                        .and_utc();

                    let current_usage =
                        repository::sum_cost_since(&conn, start_of_month).unwrap_or(0.0);

                    if current_usage >= budget_limit {
                        return Err(format!(
                            "Monthly budget exceeded. Usage: ${:.2}, Limit: ${:.2}. Please update settings.",
                            current_usage,
                            budget_limit
                        ));
                    }
                }
            }
        }
    }

    let use_agent = request
        .enable_agent_mode
        .unwrap_or_else(|| detect_agentic_intent(&request.content));

    if use_agent {
        info!("[Chat] Routing to AGI Orchestrator");

        use crate::sys::commands::agi::ORCHESTRATOR;
        let orchestrator_arc = {
            let guard = ORCHESTRATOR.lock();
            guard.as_ref().cloned()
        }
        .ok_or_else(|| "AGI Orchestrator not initialized".to_string())?;

        let orchestrator = orchestrator_arc.lock().await;

        let _ = app_handle.emit(
            "agent:thinking",
            serde_json::json!({
                "status": "Thinking...",
                "instruction": request.content
            }),
        );

        match orchestrator
            .process_instruction(&request.content, request.attachments.clone())
            .await
        {
            Ok(result) => {
                let _ = app_handle.emit(
                    "agent:finished",
                    serde_json::json!({
                        "success": result.success,
                        "summary": result.summary
                    }),
                );

                return Ok(ChatSendMessageResponse {
                    conversation: Conversation::default(),
                    user_message: Message::default(),
                    assistant_message: Message {
                        content: result.summary,
                        ..Message::default()
                    },
                    stats: ConversationStats {
                        message_count: 0,
                        total_tokens: 0,
                        total_cost: 0.0,
                    },
                    last_message: None,
                });
            }
            Err(e) => return Err(format!("Orchestration failed: {e}")),
        }
    }

    use crate::core::router::{
        cost_calculator::CostCalculator,
        llm_router::{RouterContext, RouterPreferences, RoutingStrategy},
        token_counter::TokenCounter,
        ChatMessage, LLMRequest, Provider,
    };
    use futures_util::StreamExt;

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

    let _billing_guard = _billing_state.0.lock().await;
    #[cfg(feature = "billing")]
    let plan_tier = if let Ok(service) = _billing_guard.stripe_service() {
        if let Ok(Some(sub)) = service.get_primary_subscription() {
            sub.plan_name.to_lowercase()
        } else {
            "free".to_string()
        }
    } else {
        "free".to_string()
    };

    #[cfg(not(feature = "billing"))]
    let plan_tier = "free".to_string();

    let router_context = request.task_metadata.as_ref().map(|meta| RouterContext {
        intents: meta.intents.clone(),
        requires_vision: meta.requires_vision,
        token_estimate: meta.token_estimate.unwrap_or(0),
        cost_priority: Default::default(),
        plan_tier,
    });

    let preferences = RouterPreferences {
        provider: provider_enum,
        model: Some(model.clone()),
        strategy: routing_strategy,
        context: router_context,
        prefer_cloud_credits: request.prefer_cloud_credits,
    };

    let db = _db;
    let conversation = {
        let conn = db.connection()?;
        if let Some(conv_id) = request.conversation_id {
            repository::get_conversation(&conn, conv_id)
                .map_err(|e| format!("Failed to get conversation: {e}"))?
        } else {
            let title = request.content.chars().take(50).collect::<String>();
            let id = repository::create_conversation(&conn, title)
                .map_err(|e| format!("Failed to create conversation: {e}"))?;
            repository::get_conversation(&conn, id)
                .map_err(|e| format!("Failed to get new conversation: {e}"))?
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

    let user_message = {
        let conn = db.connection()?;
        let msg = Message {
            id: 0,
            conversation_id: conversation.id,
            role: MessageRole::User,
            content: request.content.clone(),
            tokens: Some(input_tokens as i32),
            cost: Some(input_cost),
            provider: provider_enum.map(|p| p.as_string().to_string()),
            model: Some(model.clone()),
            created_at: Utc::now(),
        };
        let id = repository::create_message(&conn, &msg)
            .map_err(|e| format!("Failed to save user message: {e}"))?;
        repository::get_message(&conn, id)
            .map_err(|e| format!("Failed to retrieve user message: {e}"))?
    };

    let history = {
        let conn = db.connection()?;
        repository::list_messages(&conn, conversation.id)
            .map_err(|e| format!("Failed to load message history: {e}"))?
    };

    let llm_messages: Vec<ChatMessage> = history
        .iter()
        .map(|m| ChatMessage {
            role: match m.role {
                MessageRole::User => "user".to_string(),
                MessageRole::Assistant => "assistant".to_string(),
                MessageRole::System => "system".to_string(),
            },
            content: m.content.clone(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        })
        .collect();

    let llm_request = LLMRequest {
        messages: llm_messages,
        model: model.clone(),
        temperature: Some(0.7),
        max_tokens: Some(4096),
        stream: request.stream.unwrap_or(false),
        tools: None,
        tool_choice: None,
        thinking_mode: request.thinking_mode,
    };

    let stream_mode = request.stream.unwrap_or(false);

    if stream_mode {
        let router = _llm_state.router.read().await;

        reset_stop_flag();

        let _ = app_handle.emit(
            "chat:stream-start",
            serde_json::json!({
                "conversation_id": conversation.id,
                "message_id": 0,
                "created_at": Utc::now().to_rfc3339()
            }),
        );

        match router
            .send_message_streaming(&llm_request, &preferences)
            .await
        {
            Ok(mut stream) => {
                let mut full_content = String::new();
                let mut token_count = 0u32;
                let mut was_stopped = false;

                let mut pending_notified = false;
                while let Some(chunk_result) = stream.next().await {
                    if should_stop_generation() {
                        info!("[Chat] Generation stopped by user");
                        was_stopped = true;
                        break;
                    }

                    // Check for pending user messages during streaming
                    if has_pending_messages() && !pending_notified {
                        let pending = peek_pending_messages();
                        info!(
                            "[Chat] {} pending message(s) detected during streaming",
                            pending.len()
                        );
                        let _ = app_handle.emit(
                            "chat:pending-context-available",
                            serde_json::json!({
                                "pending_messages": pending,
                                "current_phase": "streaming",
                                "count": pending.len()
                            }),
                        );
                        pending_notified = true;
                    }

                    match chunk_result {
                        Ok(chunk) => {
                            full_content.push_str(&chunk.content);
                            token_count += 1;

                            let _ = app_handle.emit(
                                "chat:stream-chunk",
                                serde_json::json!({
                                    "conversation_id": conversation.id,
                                    "message_id": 0,
                                    "delta": chunk.content,
                                    "content": full_content,
                                    "has_pending_messages": has_pending_messages()
                                }),
                            );
                        }
                        Err(e) => {
                            info!("[Chat] Stream error: {e}");
                            break;
                        }
                    }
                }

                if was_stopped && !full_content.is_empty() {
                    full_content.push_str("\n\n*[Generation stopped by user]*");
                }

                let assistant_message = {
                    let conn = db.connection()?;

                    let output_cost = if let Some(p) = provider_enum {
                        CostCalculator::new().calculate(p, &model, 0, token_count)
                    } else {
                        0.0
                    };

                    let msg = Message {
                        id: 0,
                        conversation_id: conversation.id,
                        role: MessageRole::Assistant,
                        content: full_content.clone(),
                        tokens: Some(token_count as i32),
                        cost: Some(output_cost),
                        provider: provider_enum.map(|p| p.as_string().to_string()),
                        model: Some(model.clone()),
                        created_at: Utc::now(),
                    };
                    let id = repository::create_message(&conn, &msg)
                        .map_err(|e| format!("Failed to save assistant message: {e}"))?;
                    repository::get_message(&conn, id)
                        .map_err(|e| format!("Failed to retrieve assistant message: {e}"))?
                };

                // Check for pending messages at stream end
                let pending_at_end = peek_pending_messages();
                let _ = app_handle.emit(
                    "chat:stream-end",
                    serde_json::json!({
                        "conversation_id": conversation.id,
                        "message_id": assistant_message.id,
                        "pending_messages_count": pending_at_end.len(),
                        "has_pending_messages": !pending_at_end.is_empty()
                    }),
                );

                // If there are pending messages, emit them for processing
                if !pending_at_end.is_empty() {
                    info!(
                        "[Chat] Stream ended with {} pending message(s) to process",
                        pending_at_end.len()
                    );
                    let _ = app_handle.emit(
                        "chat:pending-messages-ready",
                        serde_json::json!({
                            "conversation_id": conversation.id,
                            "pending_messages": pending_at_end,
                            "count": pending_at_end.len()
                        }),
                    );
                }

                let stats = {
                    let conn = db.connection()?;
                    let messages = repository::list_messages(&conn, conversation.id)
                        .map_err(|e| format!("Failed to compute stats: {e}"))?;
                    ConversationStats {
                        message_count: messages.len(),
                        total_tokens: messages.iter().filter_map(|m| m.tokens).sum(),
                        total_cost: messages.iter().filter_map(|m| m.cost).sum(),
                    }
                };

                return Ok(ChatSendMessageResponse {
                    conversation,
                    user_message,
                    assistant_message,
                    stats,
                    last_message: Some(full_content),
                });
            }
            Err(e) => {
                return Err(format!("Streaming failed: {e}"));
            }
        }
    }

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

                let fallback_candidate = crate::core::router::llm_router::RouteCandidate {
                    provider: Provider::ManagedCloud,
                    model: model.clone(), // Use the same model name as a hint for the cloud proxy
                    reason: "fallback-redirect-to-managed-cloud",
                };

                let result = router
                    .invoke_candidate(&fallback_candidate, &llm_request)
                    .await;
                match result {
                    Ok(outcome) => {
                        let assistant_message = {
                            let conn = db.connection()?;
                            let msg = Message {
                                id: 0,
                                conversation_id: conversation.id,
                                role: MessageRole::Assistant,
                                content: outcome.response.content.clone(),
                                tokens: outcome.response.tokens.map(|t| t as i32),
                                cost: outcome.response.cost,
                                provider: Some(outcome.provider.as_string().to_string()),
                                model: Some(outcome.model.clone()),
                                created_at: Utc::now(),
                            };
                            let id = repository::create_message(&conn, &msg)
                                .map_err(|e| format!("Failed to save assistant message: {e}"))?;
                            repository::get_message(&conn, id)
                                .map_err(|e| format!("Failed to retrieve assistant message: {e}"))?
                        };

                        let stats = {
                            let conn = db.connection()?;
                            let messages = repository::list_messages(&conn, conversation.id)
                                .map_err(|e| format!("Failed to compute stats: {e}"))?;
                            ConversationStats {
                                message_count: messages.len(),
                                total_tokens: messages.iter().filter_map(|m| m.tokens).sum(),
                                total_cost: messages.iter().filter_map(|m| m.cost).sum(),
                            }
                        };

                        return Ok(ChatSendMessageResponse {
                            conversation,
                            user_message,
                            assistant_message,
                            stats,
                            last_message: Some(outcome.response.content),
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
            Ok(outcome) => {
                let assistant_message = {
                    let conn = db.connection()?;
                    let msg = Message {
                        id: 0,
                        conversation_id: conversation.id,
                        role: MessageRole::Assistant,
                        content: outcome.response.content.clone(),
                        tokens: outcome.response.tokens.map(|t| t as i32),
                        cost: outcome.response.cost,
                        provider: Some(outcome.provider.as_string().to_string()),
                        model: Some(outcome.model.clone()),
                        created_at: Utc::now(),
                    };
                    let id = repository::create_message(&conn, &msg)
                        .map_err(|e| format!("Failed to save assistant message: {e}"))?;
                    repository::get_message(&conn, id)
                        .map_err(|e| format!("Failed to retrieve assistant message: {e}"))?
                };

                let stats = {
                    let conn = db.connection()?;
                    let messages = repository::list_messages(&conn, conversation.id)
                        .map_err(|e| format!("Failed to compute stats: {e}"))?;
                    ConversationStats {
                        message_count: messages.len(),
                        total_tokens: messages.iter().filter_map(|m| m.tokens).sum(),
                        total_cost: messages.iter().filter_map(|m| m.cost).sum(),
                    }
                };

                return Ok(ChatSendMessageResponse {
                    conversation,
                    user_message,
                    assistant_message,
                    stats,
                    last_message: Some(outcome.response.content),
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

#[tauri::command]
pub fn chat_get_cost_overview(db: State<'_, AppDatabase>) -> Result<CostOverviewResponse, String> {
    let conn = db.connection()?;

    let now = Utc::now();
    let today_start = Utc
        .with_ymd_and_hms(now.year(), now.month(), now.day(), 0, 0, 0)
        .single()
        .ok_or_else(|| "Failed to compute start-of-day".to_string())?;
    let month_start = Utc
        .with_ymd_and_hms(now.year(), now.month(), 1, 0, 0, 0)
        .single()
        .ok_or_else(|| "Failed to compute start-of-month".to_string())?;

    let today_total = repository::sum_cost_since(&conn, today_start)
        .map_err(|e| format!("Failed to compute today's cost: {e}"))?;
    let month_total = repository::sum_cost_since(&conn, month_start)
        .map_err(|e| format!("Failed to compute monthly cost: {e}"))?;

    let monthly_budget = repository::get_setting(&conn, "billing.monthly_budget")
        .ok()
        .and_then(|setting| setting.value.parse::<f64>().ok());
    let remaining_budget = monthly_budget.map(|budget| (budget - month_total).max(0.0));

    Ok(CostOverviewResponse {
        today_total,
        month_total,
        monthly_budget,
        remaining_budget,
    })
}

#[tauri::command]
pub fn chat_get_cost_analytics(
    db: State<'_, AppDatabase>,
    days: Option<i64>,
    provider: Option<String>,
    model: Option<String>,
) -> Result<CostAnalyticsResponse, String> {
    if let Some(d) = days {
        if d <= 0 {
            return Err(format!("Invalid days value: {}. Days must be positive", d));
        }
        if d > 3650 {
            return Err(format!(
                "Invalid days value: {}. Days cannot exceed 3650 (10 years)",
                d
            ));
        }
    }

    let conn = db.connection()?;
    let window = days.unwrap_or(30).max(1);

    let provider_clean = provider
        .as_ref()
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty());
    let model_clean = model
        .as_ref()
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty());

    let provider_ref = provider_clean.as_deref();
    let model_ref = model_clean.as_deref();

    let end = Utc::now();
    let span = window - 1;
    let start = if span > 0 {
        end - ChronoDuration::days(span)
    } else {
        end
    };

    let timeseries = repository::list_cost_timeseries(&conn, window, provider_ref, model_ref)
        .map_err(|e| format!("Failed to load cost timeseries: {e}"))?;
    let providers =
        repository::list_cost_by_provider(&conn, Some(start), Some(end), provider_ref, model_ref)
            .map_err(|e| format!("Failed to load provider breakdown: {e}"))?;
    let top_conversations = repository::list_top_conversations_by_cost_filtered(
        &conn,
        10,
        Some(start),
        Some(end),
        provider_ref,
        model_ref,
    )
    .map_err(|e| format!("Failed to load top conversations: {e}"))?;

    Ok(CostAnalyticsResponse {
        timeseries,
        providers,
        top_conversations,
    })
}

#[tauri::command]
pub fn chat_set_monthly_budget(
    db: State<'_, AppDatabase>,
    amount: Option<f64>,
) -> Result<(), String> {
    if let Some(value) = amount {
        if value < 0.0 {
            return Err(format!(
                "Invalid budget amount: {}. Budget must be non-negative",
                value
            ));
        }
        if value > 1_000_000.0 {
            return Err(format!(
                "Invalid budget amount: {}. Budget cannot exceed $1,000,000",
                value
            ));
        }
    }

    let conn = db.connection()?;

    match amount {
        Some(value) => repository::set_setting(
            &conn,
            "billing.monthly_budget".to_string(),
            format!("{:.2}", value),
            false,
        )
        .map_err(|e| format!("Failed to save monthly budget: {e}"))?,
        None => repository::delete_setting(&conn, "billing.monthly_budget")
            .map_err(|e| format!("Failed to clear monthly budget: {e}"))?,
    }

    Ok(())
}

#[tauri::command]
pub async fn chat_stop_generation() -> Result<(), String> {
    info!("[Chat] Stopping generation - setting stop flag");
    STOP_GENERATION.store(true, Ordering::SeqCst);
    Ok(())
}

pub fn should_stop_generation() -> bool {
    STOP_GENERATION.load(Ordering::SeqCst)
}

pub fn reset_stop_flag() {
    STOP_GENERATION.store(false, Ordering::SeqCst);
}

// ============================================================================
// Pending Messages API - Allows users to queue messages while AI is processing
// ============================================================================

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AddPendingMessageRequest {
    pub content: String,
    pub conversation_id: Option<i64>,
}

#[tauri::command]
pub async fn chat_add_pending_message(
    app_handle: tauri::AppHandle,
    request: AddPendingMessageRequest,
) -> Result<PendingUserMessage, String> {
    let trimmed_content = request.content.trim();
    if trimmed_content.is_empty() {
        return Err("Pending message content cannot be empty".to_string());
    }
    if trimmed_content.len() > 100_000 {
        return Err("Pending message content cannot exceed 100,000 characters".to_string());
    }

    let pending_msg = PendingUserMessage {
        id: uuid::Uuid::new_v4().to_string(),
        content: trimmed_content.to_string(),
        timestamp: Utc::now(),
        conversation_id: request.conversation_id,
    };

    {
        let mut queue = PENDING_MESSAGES
            .lock()
            .map_err(|e| format!("Failed to lock pending messages queue: {e}"))?;
        queue.push(pending_msg.clone());
        info!(
            "[Chat] Added pending message (queue size: {}): {}...",
            queue.len(),
            &trimmed_content.chars().take(50).collect::<String>()
        );
    }

    // Emit event to notify frontend
    let _ = app_handle.emit("chat:pending-message-added", &pending_msg);

    Ok(pending_msg)
}

#[tauri::command]
pub async fn chat_get_pending_messages() -> Result<Vec<PendingUserMessage>, String> {
    let queue = PENDING_MESSAGES
        .lock()
        .map_err(|e| format!("Failed to lock pending messages queue: {e}"))?;
    Ok(queue.clone())
}

#[tauri::command]
pub async fn chat_clear_pending_messages(app_handle: tauri::AppHandle) -> Result<(), String> {
    let mut queue = PENDING_MESSAGES
        .lock()
        .map_err(|e| format!("Failed to lock pending messages queue: {e}"))?;
    let count = queue.len();
    queue.clear();
    info!("[Chat] Cleared {} pending messages", count);

    // Emit event to notify frontend
    let _ = app_handle.emit(
        "chat:pending-messages-cleared",
        serde_json::json!({ "count": count }),
    );

    Ok(())
}

#[tauri::command]
pub async fn chat_pop_pending_message(
    app_handle: tauri::AppHandle,
) -> Result<Option<PendingUserMessage>, String> {
    let mut queue = PENDING_MESSAGES
        .lock()
        .map_err(|e| format!("Failed to lock pending messages queue: {e}"))?;

    if queue.is_empty() {
        return Ok(None);
    }

    let msg = queue.remove(0);
    info!(
        "[Chat] Popped pending message (remaining: {}): {}...",
        queue.len(),
        &msg.content.chars().take(50).collect::<String>()
    );

    // Emit event to notify frontend
    let _ = app_handle.emit(
        "chat:pending-message-consumed",
        serde_json::json!({
            "message": msg,
            "remaining": queue.len()
        }),
    );

    Ok(Some(msg))
}

/// Check if there are pending messages (used by tool executor)
pub fn has_pending_messages() -> bool {
    PENDING_MESSAGES
        .lock()
        .map(|q| !q.is_empty())
        .unwrap_or(false)
}

/// Get pending messages count
pub fn pending_messages_count() -> usize {
    PENDING_MESSAGES.lock().map(|q| q.len()).unwrap_or(0)
}

/// Peek at pending messages without removing them
pub fn peek_pending_messages() -> Vec<PendingUserMessage> {
    PENDING_MESSAGES
        .lock()
        .map(|q| q.clone())
        .unwrap_or_default()
}
