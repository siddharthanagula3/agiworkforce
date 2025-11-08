use super::llm::LLMState;
use crate::db::models::{
    Conversation, ConversationCostBreakdown, CostTimeseriesPoint, Message, MessageRole,
    ProviderCostBreakdown,
};
use crate::db::repository;
use crate::router::{
    cache_manager::{CacheManager, CacheRecord},
    llm_router::{RouteOutcome, RouterPreferences, RoutingStrategy},
    ChatMessage as RouterChatMessage, LLMRequest, LLMResponse, Provider,
};
use futures_util::StreamExt;
use anyhow::anyhow;
use chrono::{Datelike, Duration as ChronoDuration, TimeZone, Utc};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Emitter, State};
use tokio::time::{sleep, Duration as TokioDuration};
use tracing::warn;

/// Shared database connection wrapper exposed to Tauri commands.
pub struct AppDatabase(pub Mutex<Connection>);

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateConversationRequest {
    pub title: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateMessageRequest {
    pub conversation_id: i64,
    pub role: String,
    pub content: String,
    pub tokens: Option<i32>,
    pub cost: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateConversationRequest {
    pub title: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatSendMessageRequest {
    #[serde(default)]
    pub conversation_id: Option<i64>,
    pub content: String,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub strategy: Option<String>,
    #[serde(default)]
    pub stream: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct ChatSendMessageResponse {
    pub conversation: Conversation,
    pub user_message: Message,
    pub assistant_message: Message,
    pub stats: ConversationStats,
    pub last_message: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
struct StreamStartPayload {
    conversation_id: i64,
    message_id: i64,
    created_at: String,
}

#[derive(Debug, Serialize, Clone)]
struct StreamChunkPayload {
    conversation_id: i64,
    message_id: i64,
    delta: String,
    content: String,
}

#[derive(Debug, Serialize, Clone)]
struct StreamEndPayload {
    conversation_id: i64,
    message_id: i64,
}

#[derive(Debug, Serialize)]
pub struct ConversationStats {
    pub message_count: usize,
    pub total_tokens: i32,
    pub total_cost: f64,
}

#[tauri::command]
pub fn chat_create_conversation(
    db: State<AppDatabase>,
    request: CreateConversationRequest,
) -> Result<Conversation, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let id = repository::create_conversation(&conn, request.title)
        .map_err(|e| format!("Failed to create conversation: {}", e))?;
    repository::get_conversation(&conn, id)
        .map_err(|e| format!("Failed to retrieve conversation: {}", e))
}

#[tauri::command]
pub fn chat_get_conversations(db: State<AppDatabase>) -> Result<Vec<Conversation>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    repository::list_conversations(&conn, 1000, 0)
        .map_err(|e| format!("Failed to list conversations: {}", e))
}

#[tauri::command]
pub fn chat_get_conversation(db: State<AppDatabase>, id: i64) -> Result<Conversation, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    repository::get_conversation(&conn, id)
        .map_err(|e| format!("Failed to get conversation: {}", e))
}

#[tauri::command]
pub fn chat_update_conversation(
    db: State<AppDatabase>,
    id: i64,
    request: UpdateConversationRequest,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    repository::update_conversation_title(&conn, id, request.title)
        .map_err(|e| format!("Failed to update conversation: {}", e))
}

#[tauri::command]
pub fn chat_delete_conversation(db: State<AppDatabase>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    repository::delete_conversation(&conn, id)
        .map_err(|e| format!("Failed to delete conversation: {}", e))
}

#[tauri::command]
pub fn chat_create_message(
    db: State<AppDatabase>,
    request: CreateMessageRequest,
) -> Result<Message, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let role = match request.role.as_str() {
        "user" => MessageRole::User,
        "assistant" => MessageRole::Assistant,
        "system" => MessageRole::System,
        other => return Err(format!("Invalid role: {other}")),
    };

    let message = Message {
        id: 0,
        conversation_id: request.conversation_id,
        role,
        content: request.content,
        tokens: request.tokens,
        cost: request.cost,
        provider: None,
        model: None,
        created_at: Utc::now(),
    };

    let id = repository::create_message(&conn, &message)
        .map_err(|e| format!("Failed to create message: {}", e))?;
    repository::get_message(&conn, id).map_err(|e| format!("Failed to retrieve message: {}", e))
}

#[tauri::command]
pub fn chat_get_messages(
    db: State<AppDatabase>,
    conversation_id: i64,
) -> Result<Vec<Message>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    repository::list_messages(&conn, conversation_id)
        .map_err(|e| format!("Failed to list messages: {}", e))
}

#[tauri::command]
pub fn chat_update_message(
    db: State<AppDatabase>,
    id: i64,
    content: String,
) -> Result<Message, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    repository::update_message_content(&conn, id, content)
        .map_err(|e| format!("Failed to update message: {}", e))
}

#[tauri::command]
pub fn chat_delete_message(db: State<AppDatabase>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    repository::delete_message(&conn, id).map_err(|e| format!("Failed to delete message: {}", e))
}

#[tauri::command]
pub fn chat_get_conversation_stats(
    db: State<AppDatabase>,
    conversation_id: i64,
) -> Result<ConversationStats, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let messages = repository::list_messages(&conn, conversation_id)
        .map_err(|e| format!("Failed to list messages: {}", e))?;

    let message_count = messages.len();
    let total_tokens = messages.iter().filter_map(|m| m.tokens).sum();
    let total_cost = messages.iter().filter_map(|m| m.cost).sum();

    Ok(ConversationStats {
        message_count,
        total_tokens,
        total_cost,
    })
}

/// Handle streaming chat messages with real SSE streaming
async fn chat_send_message_streaming(
    db: State<'_, AppDatabase>,
    llm_state: State<'_, LLMState>,
    app_handle: tauri::AppHandle,
    request: ChatSendMessageRequest,
) -> Result<ChatSendMessageResponse, String> {
    let trimmed_content = request.content.trim().to_string();
    if trimmed_content.is_empty() {
        return Err("Message cannot be empty".to_string());
    }

    // Create conversation and user message
    let (conversation_id, _user_message_id, assistant_message_id) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;

        let conversation_id = match request.conversation_id {
            Some(id) => {
                repository::get_conversation(&conn, id)
                    .map_err(|e| format!("Conversation not found: {}", e))?;
                id
            }
            None => repository::create_conversation(&conn, "New Conversation".to_string())
                .map_err(|e| format!("Failed to create conversation: {}", e))?,
        };

        let user_msg = Message::new(conversation_id, MessageRole::User, trimmed_content.clone());
        let user_msg_id = repository::create_message(&conn, &user_msg)
            .map_err(|e| format!("Failed to create user message: {}", e))?;

        // Create placeholder assistant message
        let assistant_msg = Message::new(conversation_id, MessageRole::Assistant, String::new());
        let assistant_msg_id = repository::create_message(&conn, &assistant_msg)
            .map_err(|e| format!("Failed to create assistant message: {}", e))?;

        (conversation_id, user_msg_id, assistant_msg_id)
    };

    // Get conversation history
    let history = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        repository::list_messages(&conn, conversation_id)
            .map_err(|e| format!("Failed to list messages: {}", e))?
    };

    let router_messages: Vec<RouterChatMessage> = history
        .iter()
        .filter(|m| m.id != assistant_message_id) // Exclude placeholder
        .map(|message| RouterChatMessage {
            role: message.role.as_str().to_string(),
            content: message.content.clone(),
            tool_calls: None,
            tool_call_id: None,
        })
        .collect();

    let llm_request = LLMRequest {
        messages: router_messages,
        model: request.model.clone().unwrap_or_else(|| "gpt-4o-mini".to_string()),
        temperature: None,
        max_tokens: None,
        stream: true,
        tools: None,
        tool_choice: None,
    };

    let preferences = RouterPreferences {
        provider: request.provider.as_deref().and_then(Provider::from_string),
        model: request.model.clone(),
        strategy: parse_routing_strategy(request.strategy.as_deref()),
    };

    // Emit stream start
    let start_payload = StreamStartPayload {
        conversation_id,
        message_id: assistant_message_id,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    if let Err(error) = app_handle.emit("chat:stream-start", start_payload) {
        warn!("Failed to emit stream start event: {}", error);
    }

    // Get streaming response
    let mut stream = {
        let router = llm_state.router.lock().await;
        router.send_message_streaming(&llm_request, &preferences)
            .await
            .map_err(|e| format!("Streaming failed: {}", e))?
    };

    // Process stream chunks
    let mut accumulated_content = String::new();
    let _total_tokens: Option<i32> = None;

    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(chunk) => {
                if !chunk.content.is_empty() {
                    accumulated_content.push_str(&chunk.content);
                    
                    let payload = StreamChunkPayload {
                        conversation_id,
                        message_id: assistant_message_id,
                        delta: chunk.content.clone(),
                        content: accumulated_content.clone(),
                    };
                    
                    if let Err(error) = app_handle.emit("chat:stream-chunk", payload) {
                        warn!("Failed to emit stream chunk: {}", error);
                    }
                }

                if chunk.done {
                    // Token usage will be updated via database on message save
                    break;
                }
            }
            Err(e) => {
                warn!("Stream chunk error: {}", e);
                break;
            }
        }
    }

    // Emit stream end
    if let Err(error) = app_handle.emit(
        "chat:stream-end",
        StreamEndPayload {
            conversation_id,
            message_id: assistant_message_id,
        },
    ) {
        warn!("Failed to emit stream end event: {}", error);
    }

    // Update assistant message with final content
    let assistant_msg = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        repository::update_message_content(&conn, assistant_message_id, accumulated_content.clone())
            .map_err(|e| format!("Failed to update assistant message: {}", e))?
    };

    // Fetch final conversation state
    let (conversation, user_msg, messages) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let conversation = repository::get_conversation(&conn, conversation_id)
            .map_err(|e| format!("Failed to get conversation: {}", e))?;
        let user_msg = repository::get_message(&conn, _user_message_id)
            .map_err(|e| format!("Failed to get user message: {}", e))?;
        let messages = repository::list_messages(&conn, conversation_id)
            .map_err(|e| format!("Failed to list messages: {}", e))?;
        (conversation, user_msg, messages)
    };

    let total_tokens_sum: i32 = messages.iter().filter_map(|m| m.tokens).sum();
    let total_cost: f64 = messages.iter().filter_map(|m| m.cost).sum();

    Ok(ChatSendMessageResponse {
        conversation,
        user_message: user_msg,
        assistant_message: assistant_msg,
        stats: ConversationStats {
            message_count: messages.len(),
            total_tokens: total_tokens_sum,
            total_cost,
        },
        last_message: Some(accumulated_content),
    })
}

#[tauri::command]
pub async fn chat_send_message(
    db: State<'_, AppDatabase>,
    llm_state: State<'_, LLMState>,
    app_handle: tauri::AppHandle,
    request: ChatSendMessageRequest,
) -> Result<ChatSendMessageResponse, String> {
    let stream_mode = request.stream.unwrap_or(false);
    
    // Use separate streaming path if requested
    if stream_mode {
        return chat_send_message_streaming(db, llm_state, app_handle, request).await;
    }
    let trimmed_content = request.content.trim().to_string();
    if trimmed_content.is_empty() {
        return Err("Message cannot be empty".to_string());
    }

    let (conversation_id, user_message) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;

        let conversation_id = match request.conversation_id {
            Some(id) => {
                repository::get_conversation(&conn, id)
                    .map_err(|e| format!("Conversation not found: {}", e))?;
                id
            }
            None => repository::create_conversation(&conn, "New Conversation".to_string())
                .map_err(|e| format!("Failed to create conversation: {}", e))?,
        };

        let message = Message::new(conversation_id, MessageRole::User, trimmed_content.clone());
        let message_id = repository::create_message(&conn, &message)
            .map_err(|e| format!("Failed to create message: {}", e))?;
        let message = repository::get_message(&conn, message_id)
            .map_err(|e| format!("Failed to retrieve message: {}", e))?;

        (conversation_id, message)
    };

    let history = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        repository::list_messages(&conn, conversation_id)
            .map_err(|e| format!("Failed to list messages: {}", e))?
    };

    let router_messages: Vec<RouterChatMessage> = history
        .iter()
        .map(|message| RouterChatMessage {
            role: message.role.as_str().to_string(),
            content: message.content.clone(),
            tool_calls: None,
            tool_call_id: None,
        })
        .collect();

    // TODO: Add tool definitions from AGI registry if tools are enabled
    // let tool_executor = ToolExecutor::new(app_handle.state::<Arc<ToolRegistry>>().inner().clone());
    // let tool_definitions = tool_executor.get_tool_definitions(None);
    
    let llm_request = LLMRequest {
        messages: router_messages,
        model: request
            .model
            .clone()
            .unwrap_or_else(|| "gpt-4o-mini".to_string()),
        temperature: None,
        max_tokens: None,
        stream: stream_mode, // Use real streaming based on request
        tools: None, // TODO: Enable tools: Some(tool_definitions)
        tool_choice: None, // TODO: Add tool_choice: Some(ToolChoice::Auto)
    };

    let preferences = RouterPreferences {
        provider: request.provider.as_deref().and_then(Provider::from_string),
        model: request.model.clone(),
        strategy: parse_routing_strategy(request.strategy.as_deref()),
    };

    let candidates = {
        let router = llm_state.router.lock().await;
        router.candidates(&llm_request, &preferences)
    };

    if candidates.is_empty() {
        return Err("No LLM providers are configured.".to_string());
    }

    let prompt_hash = CacheManager::compute_hash(&llm_request.messages);
    let mut outcome: Option<RouteOutcome> = None;
    let mut last_error: Option<anyhow::Error> = None;

    for candidate in candidates {
        let cache_key = CacheManager::compute_cache_key(
            candidate.provider,
            &candidate.model,
            &llm_request.messages,
        );

        if let Some(entry) = {
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            llm_state
                .cache_manager
                .fetch(&conn, &cache_key)
                .map_err(|e| format!("Failed to read cache: {}", e))?
        } {
            if let Some(provider) = Provider::from_string(&entry.provider) {
                let tokens = entry.tokens.map(|t| t as u32);
                let response = LLMResponse {
                    content: entry.response.clone(),
                    tokens,
                    prompt_tokens: tokens,
                    completion_tokens: None,
                    cost: entry.cost,
                    model: entry.model.clone(),
                    cached: true,
                    tool_calls: None,
                    finish_reason: None,
                };
                outcome = Some(RouteOutcome {
                    provider,
                    model: entry.model.clone(),
                    response,
                    prompt_tokens: tokens.unwrap_or(0),
                    completion_tokens: 0,
                    cost: entry.cost.unwrap_or(0.0),
                });
                break;
            }
        }

        let res = {
            let router = llm_state.router.lock().await;
            router.invoke_candidate(&candidate, &llm_request).await
        };
        match res {
            Ok(mut route_outcome) => {
                route_outcome.response.cached = false;
                {
                    let conn = db.0.lock().map_err(|e| e.to_string())?;
                    let expires_at = llm_state.cache_manager.default_expiry();
                    llm_state
                        .cache_manager
                        .upsert(
                            &conn,
                            CacheRecord {
                                cache_key: &cache_key,
                                provider: route_outcome.provider,
                                model: &route_outcome.model,
                                prompt_hash: &prompt_hash,
                                response: &route_outcome.response.content,
                                tokens: route_outcome.response.tokens,
                                cost: route_outcome.response.cost,
                                expires_at,
                            },
                        )
                        .map_err(|e| format!("Failed to store cache entry: {}", e))?;
                }
                // TODO: Handle tool calls in response
                // if let Some(tool_calls) = &route_outcome.response.tool_calls {
                //     // Execute tools
                //     // Add tool results to messages
                //     // Continue conversation
                // }
                
                outcome = Some(route_outcome);
                break;
            }
            Err(err) => {
                last_error = Some(err);
            }
        }
    }

    let outcome = outcome.ok_or_else(|| {
        last_error
            .unwrap_or_else(|| anyhow!("All providers failed"))
            .to_string()
    })?;

    let (conversation, assistant_message, stats, last_message) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;

        let mut assistant = Message::new(
            conversation_id,
            MessageRole::Assistant,
            outcome.response.content.clone(),
        )
        .with_source(
            Some(outcome.provider.as_string().to_string()),
            Some(outcome.model.clone()),
        );

        if let Some(tokens) = outcome.response.tokens {
            assistant.tokens = Some(tokens as i32);
        }
        if let Some(cost) = outcome.response.cost {
            assistant.cost = Some(cost);
        }

        let assistant_id = repository::create_message(&conn, &assistant)
            .map_err(|e| format!("Failed to create assistant message: {}", e))?;
        let assistant_message = repository::get_message(&conn, assistant_id)
            .map_err(|e| format!("Failed to retrieve assistant message: {}", e))?;

        let mut conversation = repository::get_conversation(&conn, conversation_id)
            .map_err(|e| format!("Failed to load conversation: {}", e))?;

        if conversation.title == "New Conversation" {
            let new_title = trimmed_content
                .split('\n')
                .next()
                .unwrap_or_default()
                .chars()
                .take(50)
                .collect::<String>()
                .trim()
                .to_string();

            if !new_title.is_empty() && new_title != conversation.title {
                repository::update_conversation_title(&conn, conversation_id, new_title.clone())
                    .map_err(|e| format!("Failed to update conversation title: {}", e))?;
                conversation = repository::get_conversation(&conn, conversation_id)
                    .map_err(|e| format!("Failed to refresh conversation: {}", e))?;
            }
        }

        let messages = repository::list_messages(&conn, conversation_id)
            .map_err(|e| format!("Failed to list messages: {}", e))?;

        let stats = ConversationStats {
            message_count: messages.len(),
            total_tokens: messages.iter().filter_map(|m| m.tokens).sum(),
            total_cost: messages.iter().filter_map(|m| m.cost).sum(),
        };

        let last_message = messages.last().map(|m| m.content.clone());

        (conversation, assistant_message, stats, last_message)
    };

    if stream_mode {
        let start_payload = StreamStartPayload {
            conversation_id: conversation.id,
            message_id: assistant_message.id,
            created_at: assistant_message.created_at.to_rfc3339(),
        };
        if let Err(error) = app_handle.emit("chat:stream-start", start_payload) {
            warn!("Failed to emit stream start event: {}", error);
        } else {
            let mut accumulated = String::new();
            for chunk in split_stream_chunks(&assistant_message.content) {
                accumulated.push_str(&chunk);
                let payload = StreamChunkPayload {
                    conversation_id: conversation.id,
                    message_id: assistant_message.id,
                    delta: chunk.clone(),
                    content: accumulated.clone(),
                };
                if let Err(error) = app_handle.emit("chat:stream-chunk", payload) {
                    warn!("Failed to emit stream chunk event: {}", error);
                    break;
                }
                sleep(TokioDuration::from_millis(35)).await;
            }
            if let Err(error) = app_handle.emit(
                "chat:stream-end",
                StreamEndPayload {
                    conversation_id: conversation.id,
                    message_id: assistant_message.id,
                },
            ) {
                warn!("Failed to emit stream end event: {}", error);
            }
        }
    }

    Ok(ChatSendMessageResponse {
        conversation,
        user_message,
        assistant_message,
        stats,
        last_message,
    })
}

fn parse_routing_strategy(input: Option<&str>) -> RoutingStrategy {
    match input {
        Some(value) => match value.to_lowercase().as_str() {
            "cost" | "cost_optimized" => RoutingStrategy::CostOptimized,
            "latency" | "latency_optimized" => RoutingStrategy::LatencyOptimized,
            "local" | "local_first" => RoutingStrategy::LocalFirst,
            _ => RoutingStrategy::Auto,
        },
        None => RoutingStrategy::Auto,
    }
}

fn split_stream_chunks(content: &str) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut start = 0;
    let mut last_break = 0;
    const TARGET: usize = 48;

    for (idx, ch) in content.char_indices() {
        let next = idx + ch.len_utf8();
        if ch == '\n' {
            if start < next {
                chunks.push(content[start..next].to_string());
            } else {
                chunks.push("\n".to_string());
            }
            start = next;
            last_break = next;
            continue;
        }

        if ch.is_whitespace() {
            last_break = next;
        }

        if next - start >= TARGET {
            let end = if last_break > start { last_break } else { next };
            if end > start {
                chunks.push(content[start..end].to_string());
                start = end;
                last_break = end;
            }
        }
    }

    if start < content.len() {
        chunks.push(content[start..].to_string());
    }

    if chunks.is_empty() {
        chunks.push(content.to_string());
    }

    chunks
}

#[derive(Debug, Serialize)]
pub struct CostOverviewResponse {
    pub today_total: f64,
    pub month_total: f64,
    pub monthly_budget: Option<f64>,
    pub remaining_budget: Option<f64>,
}

#[tauri::command]
pub fn chat_get_cost_overview(db: State<AppDatabase>) -> Result<CostOverviewResponse, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

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
        .map_err(|e| format!("Failed to compute today's cost: {}", e))?;
    let month_total = repository::sum_cost_since(&conn, month_start)
        .map_err(|e| format!("Failed to compute monthly cost: {}", e))?;

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

#[derive(Debug, Serialize)]
pub struct CostAnalyticsResponse {
    pub timeseries: Vec<CostTimeseriesPoint>,
    pub providers: Vec<ProviderCostBreakdown>,
    pub top_conversations: Vec<ConversationCostBreakdown>,
}

#[tauri::command]
pub fn chat_get_cost_analytics(
    db: State<AppDatabase>,
    days: Option<i64>,
    provider: Option<String>,
    model: Option<String>,
) -> Result<CostAnalyticsResponse, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
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
        .map_err(|e| format!("Failed to load cost timeseries: {}", e))?;
    let providers =
        repository::list_cost_by_provider(&conn, Some(start), Some(end), provider_ref, model_ref)
            .map_err(|e| format!("Failed to load provider breakdown: {}", e))?;
    let top_conversations = repository::list_top_conversations_by_cost_filtered(
        &conn,
        10,
        Some(start),
        Some(end),
        provider_ref,
        model_ref,
    )
    .map_err(|e| format!("Failed to load top conversations: {}", e))?;

    Ok(CostAnalyticsResponse {
        timeseries,
        providers,
        top_conversations,
    })
}

#[tauri::command]
pub fn chat_set_monthly_budget(db: State<AppDatabase>, amount: Option<f64>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    match amount {
        Some(value) => repository::set_setting(
            &conn,
            "billing.monthly_budget".to_string(),
            format!("{:.2}", value),
            false,
        )
        .map_err(|e| format!("Failed to save monthly budget: {}", e))?,
        None => repository::delete_setting(&conn, "billing.monthly_budget")
            .map_err(|e| format!("Failed to clear monthly budget: {}", e))?,
    }

    Ok(())
}
