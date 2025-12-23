use super::llm::LLMState;
// use crate::agent::approval::ApprovalController; // Unused
// TODO: Re-enable auto-compaction ... (comments)
// ...
use crate::db::models::{
    Conversation, ConversationCostBreakdown, CostTimeseriesPoint, Message, MessageRole,
    ProviderCostBreakdown,
};
use crate::db::repository;
use chrono::{Datelike, Duration as ChronoDuration, TimeZone, Utc};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, State};
// use tokio::sync::Mutex as TokioMutex; // Unused
use tracing::info;

/// Global atomic flag for stopping stream generation
static STOP_GENERATION: AtomicBool = AtomicBool::new(false);

/// Detect if a user message indicates a complex multi-step task suitable for agent mode
fn detect_agentic_intent(content: &str) -> bool {
    let content_lower = content.to_lowercase();

    // Patterns that indicate multi-step/agentic tasks
    let agentic_patterns = [
        // Task-oriented phrases
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
        // Multi-step indicators
        "step by step",
        "multiple steps",
        "series of",
        "workflow",
        "pipeline",
        // Research/analysis tasks
        "research and",
        "analyze and",
        "find and",
        "gather and",
        "collect and",
        // File/system operations
        "across all files",
        "in every file",
        "throughout the",
        "recursively",
        // Complex requests
        "and then",
        "after that",
        "once done",
        "followed by",
    ];

    agentic_patterns
        .iter()
        .any(|pattern| content_lower.contains(pattern))
}

/// Shared database connection wrapper exposed to Tauri commands.
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

/* TODO: Re-enable auto-compaction once ContextManager API is compatible
/// Auto-compact conversation history if needed (like Cursor/Claude Code)
async fn auto_compact_conversation(db: &AppDatabase, conversation_id: i64) -> Result<(), String> {
    let messages = {
        let conn = db.conn.lock().await;
        repository::list_messages(&conn, conversation_id)
            .map_err(|e| format!("Failed to list messages: {}", e))?
    };

    // Auto-compact context if needed
    let compactor = ContextCompactor::with_default_config();

    if compactor.should_compact(&messages) {
        info!(
            "Auto-compacting conversation {} ({} messages, {} tokens)",
            conversation_id,
            messages.len(),
            ContextCompactor::calculate_tokens(&messages)
        );

        match compactor.compact_if_needed(&messages).await {
            Ok(Some(compaction_result)) => {
                info!(
                    "Compaction result: {} messages compacted, {} -> {} tokens",
                    compaction_result.messages_compacted,
                    compaction_result.tokens_before,
                    compaction_result.tokens_after
                );

                // Generate summary
                let summary = compactor
                    .generate_summary(
                        &messages[..messages.len() - compaction_result.messages_compacted],
                    )
                    .await
                    .unwrap_or_else(|_| "Context was compacted".to_string());

                // Replace old messages with summary in database
                let keep_count = compactor.config.keep_recent.min(messages.len());
                let old_count = messages.len() - keep_count;

                if old_count > 0 {
                    let conn = db.conn.lock().await;

                    // Delete old messages (except recent ones)
                    let old_messages: Vec<i64> =
                        messages[..old_count].iter().map(|m| m.id).collect();

                    for msg_id in old_messages {
                        let _ = repository::delete_message(&conn, msg_id);
                    }

                    // Insert summary message
                    let summary_msg = Message {
                        id: 0,
                        conversation_id,
                        role: MessageRole::System,
                        content: format!("[Compacted Context]\n\n{}", summary),
                        tokens: Some(compaction_result.tokens_after as i32),
                        cost: None,
                        provider: None,
                        model: None,
                        created_at: Utc::now(),
                    };
                    let _summary_id = repository::create_message(&conn, &summary_msg)
                        .map_err(|e| format!("Failed to create summary message: {}", e))?;
                }
            }
            Ok(None) => {
                // No compaction needed
            }
            Err(e) => {
                warn!("Compaction failed: {}, continuing with full history", e);
            }
        }
    }

    Ok(())
}
*/

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateConversationRequest {
    pub title: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateMessageRequest {
    pub conversation_id: i64,
    pub role: MessageRole,
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
    #[serde(default, alias = "conversationId")]
    pub conversation_id: Option<i64>,
    pub content: String,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default, alias = "providerOverride")]
    pub provider_override: Option<String>,
    #[serde(default, alias = "modelOverride")]
    pub model_override: Option<String>,
    #[serde(default)]
    pub strategy: Option<String>,
    #[serde(default)]
    pub stream: Option<bool>,
    #[serde(default, alias = "enableTools")]
    pub enable_tools: Option<bool>,
    #[serde(default, alias = "conversationMode")]
    pub conversation_mode: Option<String>, // "safe" or "full_control"
    #[serde(default, alias = "workflowHash")]
    pub workflow_hash: Option<String>,
    #[serde(default, alias = "taskMetadata")]
    pub task_metadata: Option<TaskMetadata>,
    /// Focus mode for specialized searches (web, code, academic, reasoning, deep-research)
    #[serde(default, alias = "focusMode")]
    pub focus_mode: Option<String>,
    /// Image/file attachments for multimodal messages
    #[serde(default)]
    pub attachments: Option<Vec<ChatAttachment>>,
    #[serde(default, alias = "thinkingMode")]
    pub thinking_mode: Option<bool>,
    /// Enable autonomous agent mode for complex multi-step tasks
    #[serde(default, alias = "enableAgentMode")]
    pub enable_agent_mode: Option<bool>,
}

/// Attachment data from frontend (images, screenshots, files)
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatAttachment {
    pub id: String,
    #[serde(rename = "type")]
    pub attachment_type: String, // "image" | "file" | "screenshot"
    pub name: String,
    #[serde(default)]
    pub mime_type: Option<String>,
    /// Base64-encoded content (for images: data URL or raw base64)
    #[serde(default)]
    pub content: Option<String>,
    /// File path for local files (PDFs, DOCX, etc.)
    #[serde(default)]
    pub path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskMetadata {
    #[serde(default)]
    pub intents: Vec<String>,
    #[serde(default)]
    pub requires_vision: bool,
    #[serde(default)]
    pub token_estimate: Option<u32>,
    #[serde(default)]
    pub cost_priority: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ChatSendMessageResponse {
    pub conversation: Conversation,
    pub user_message: Message,
    pub assistant_message: Message,
    pub stats: ConversationStats,
    pub last_message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ConversationStats {
    pub message_count: usize,
    pub total_tokens: i32,
    pub total_cost: f64,
}

// Updated Nov 16, 2025: Added input validation for title length
// Updated Nov 30, 2025: Migrated to async with tokio::sync::Mutex
#[tauri::command]
pub fn chat_create_conversation(
    db: State<'_, AppDatabase>,
    request: CreateConversationRequest,
) -> Result<Conversation, String> {
    // Validate title is not empty and not too long
    let trimmed_title = request.title.trim();
    if trimmed_title.is_empty() {
        return Err("Conversation title cannot be empty".to_string());
    }
    if trimmed_title.len() > 500 {
        return Err("Conversation title cannot exceed 500 characters".to_string());
    }

    let conn = db.connection()?;
    let id = repository::create_conversation(&conn, trimmed_title.to_string())
        .map_err(|e| format!("Failed to create conversation: {}", e))?;
    repository::get_conversation(&conn, id)
        .map_err(|e| format!("Failed to retrieve conversation {}: {}", id, e))
}

#[tauri::command]
pub fn chat_get_conversations(db: State<'_, AppDatabase>) -> Result<Vec<Conversation>, String> {
    let conn = db.connection()?;
    repository::list_conversations(&conn, 1000, 0)
        .map_err(|e| format!("Failed to list conversations: {}", e))
}

// Updated Nov 16, 2025: Added input validation for conversation ID
// Updated Nov 30, 2025: Migrated to async with tokio::sync::Mutex
#[tauri::command]
pub fn chat_get_conversation(db: State<'_, AppDatabase>, id: i64) -> Result<Conversation, String> {
    // Validate ID is positive
    if id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            id
        ));
    }

    let conn = db.connection()?;
    repository::get_conversation(&conn, id)
        .map_err(|e| format!("Failed to get conversation {}: {}", id, e))
}

// Updated Nov 16, 2025: Added input validation for ID and title
// Updated Nov 30, 2025: Migrated to async with tokio::sync::Mutex
#[tauri::command]
pub fn chat_update_conversation(
    db: State<'_, AppDatabase>,
    id: i64,
    request: UpdateConversationRequest,
) -> Result<(), String> {
    // Validate ID is positive
    if id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            id
        ));
    }

    // Validate title
    let trimmed_title = request.title.trim();
    if trimmed_title.is_empty() {
        return Err("Conversation title cannot be empty".to_string());
    }
    if trimmed_title.len() > 500 {
        return Err("Conversation title cannot exceed 500 characters".to_string());
    }

    let conn = db.connection()?;
    repository::update_conversation_title(&conn, id, trimmed_title.to_string())
        .map_err(|e| format!("Failed to update conversation {}: {}", id, e))
}

// Updated Nov 16, 2025: Added input validation for ID
// Updated Nov 30, 2025: Migrated to async with tokio::sync::Mutex
#[tauri::command]
pub fn chat_delete_conversation(db: State<'_, AppDatabase>, id: i64) -> Result<(), String> {
    // Validate ID is positive
    if id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            id
        ));
    }

    let conn = db.connection()?;
    repository::delete_conversation(&conn, id)
        .map_err(|e| format!("Failed to delete conversation {}: {}", id, e))
}

// Updated Nov 16, 2025: Added comprehensive input validation
// Updated Nov 30, 2025: Migrated to async with tokio::sync::Mutex
#[tauri::command]
pub fn chat_create_message(
    db: State<'_, AppDatabase>,
    request: CreateMessageRequest,
) -> Result<Message, String> {
    // Validate conversation_id is positive
    if request.conversation_id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            request.conversation_id
        ));
    }

    // Validate content is not empty and within limits
    let trimmed_content = request.content.trim();
    if trimmed_content.is_empty() {
        return Err("Message content cannot be empty".to_string());
    }
    if trimmed_content.len() > 1_000_000 {
        return Err("Message content cannot exceed 1,000,000 characters".to_string());
    }

    // Validate tokens if provided
    if let Some(tokens) = request.tokens {
        if tokens < 0 {
            return Err(format!(
                "Invalid tokens value: {}. Tokens must be non-negative",
                tokens
            ));
        }
    }

    // Validate cost if provided
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
            "Failed to create message in conversation {}: {}",
            request.conversation_id, e
        )
    })?;
    repository::get_message(&conn, id)
        .map_err(|e| format!("Failed to retrieve message {}: {}", id, e))
}

// Updated Nov 16, 2025: Added input validation for conversation ID
// Updated Nov 30, 2025: Migrated to async with tokio::sync::Mutex
#[tauri::command]
pub fn chat_get_messages(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
) -> Result<Vec<Message>, String> {
    // Validate conversation_id is positive
    if conversation_id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            conversation_id
        ));
    }

    let conn = db.connection()?;
    repository::list_messages(&conn, conversation_id).map_err(|e| {
        format!(
            "Failed to list messages for conversation {}: {}",
            conversation_id, e
        )
    })
}

// Updated Nov 16, 2025: Added input validation for ID and content
// Updated Nov 30, 2025: Migrated to async with tokio::sync::Mutex
#[tauri::command]
pub fn chat_update_message(
    db: State<'_, AppDatabase>,
    id: i64,
    content: String,
) -> Result<Message, String> {
    // Validate ID is positive
    if id <= 0 {
        return Err(format!("Invalid message ID: {}. ID must be positive", id));
    }

    // Validate content is not empty and within limits
    let trimmed_content = content.trim();
    if trimmed_content.is_empty() {
        return Err("Message content cannot be empty".to_string());
    }
    if trimmed_content.len() > 1_000_000 {
        return Err("Message content cannot exceed 1,000,000 characters".to_string());
    }

    let conn = db.connection()?;
    repository::update_message_content(&conn, id, trimmed_content.to_string())
        .map_err(|e| format!("Failed to update message {}: {}", id, e))
}

// Updated Nov 16, 2025: Added input validation for ID
// Updated Nov 30, 2025: Migrated to async with tokio::sync::Mutex
#[tauri::command]
pub fn chat_delete_message(db: State<'_, AppDatabase>, id: i64) -> Result<(), String> {
    // Validate ID is positive
    if id <= 0 {
        return Err(format!("Invalid message ID: {}. ID must be positive", id));
    }

    let conn = db.connection()?;
    repository::delete_message(&conn, id)
        .map_err(|e| format!("Failed to delete message {}: {}", id, e))
}

// Updated Nov 16, 2025: Added input validation for conversation ID
// Updated Nov 30, 2025: Migrated to async with tokio::sync::Mutex
#[tauri::command]
pub fn chat_get_conversation_stats(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
) -> Result<ConversationStats, String> {
    // Validate conversation_id is positive
    if conversation_id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            conversation_id
        ));
    }

    let conn = db.connection()?;
    let messages = repository::list_messages(&conn, conversation_id).map_err(|e| {
        format!(
            "Failed to list messages for conversation {}: {}",
            conversation_id, e
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
    _settings_state: State<'_, crate::commands::settings::SettingsState>,
    #[cfg_attr(not(feature = "billing"), allow(unused_variables))] _billing_state: State<
        '_,
        crate::billing::BillingStateWrapper,
    >,
    app_handle: tauri::AppHandle,
    request: ChatSendMessageRequest,
) -> Result<ChatSendMessageResponse, String> {
    info!(
        "[Chat] Received message for processing: {}",
        request.content
    );

    // 1. Check Budget (Added for Analytics & Monitoring Task)
    {
        // Get settings and DB for budget check
        let conn = _db
            .connection()
            .map_err(|e| format!("Budget check failed: {}", e))?;

        // Check if budget is enabled and set
        if let Ok(budget_setting) = repository::get_setting(&conn, "billing.monthly_budget") {
            if let Ok(budget_limit) = budget_setting.value.parse::<f64>() {
                if budget_limit > 0.0 {
                    // Calculate start of current month
                    let now = Utc::now();
                    let start_of_month = now
                        .date_naive()
                        .with_day(1)
                        .unwrap()
                        .and_hms_opt(0, 0, 0)
                        .unwrap()
                        .and_utc();

                    // Sum cost since start of month
                    let current_usage =
                        repository::sum_cost_since(&conn, start_of_month).unwrap_or(0.0);

                    if current_usage >= budget_limit {
                        return Err(format!(
                            "Monthly budget exceeded. Usage: ${:.2}, Limit: ${:.2}. Please update settings.", 
                            current_usage, budget_limit
                        ));
                    }
                }
            }
        }
    }

    // 2. Detect if we should use AGI mode
    let use_agent = request
        .enable_agent_mode
        .unwrap_or_else(|| detect_agentic_intent(&request.content));

    if use_agent {
        info!("[Chat] Routing to AGI Orchestrator");

        // Get the orchestrator from global state
        use crate::commands::agi::ORCHESTRATOR;
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

        // Zero cost for AGI tasks for now, or implement specific AGI pricing

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
            Err(e) => return Err(format!("Orchestration failed: {}", e)),
        }
    }

    // 2. Standard LLM routing (Non-AGI)
    use crate::router::{
        cost_calculator::CostCalculator,
        llm_router::{RouterContext, RouterPreferences, RoutingStrategy},
        token_counter::TokenCounter,
        ChatMessage, LLMRequest, Provider,
    };
    use futures_util::StreamExt;

    // Parse provider preference early for cost estimation
    let provider_enum = request
        .provider_override
        .as_deref()
        .or(request.provider.as_deref())
        .and_then(|p| match p {
            "openai" => Some(Provider::OpenAI),
            "anthropic" => Some(Provider::Anthropic),
            "google" => Some(Provider::Google),
            "ollama" => Some(Provider::Ollama),
            "xai" | "grok" => Some(Provider::XAI),
            "deepseek" => Some(Provider::DeepSeek),
            "qwen" | "alibaba" => Some(Provider::Qwen),
            "mistral" | "mistralai" => Some(Provider::Mistral),
            _ => None,
        });

    let model = request
        .model_override
        .or(request.model.clone())
        .unwrap_or_else(|| "gpt-4o-mini".to_string());

    // Build router context from task metadata
    let router_context = request.task_metadata.as_ref().map(|meta| RouterContext {
        intents: meta.intents.clone(),
        requires_vision: meta.requires_vision,
        token_estimate: meta.token_estimate.unwrap_or(0),
        cost_priority: Default::default(),
    });

    let preferences = RouterPreferences {
        provider: provider_enum,
        model: Some(model.clone()),
        strategy: RoutingStrategy::Auto,
        context: router_context,
    };

    // Get or create conversation
    let db = _db;
    let conversation = {
        let conn = db.connection()?;
        if let Some(conv_id) = request.conversation_id {
            repository::get_conversation(&conn, conv_id)
                .map_err(|e| format!("Failed to get conversation: {}", e))?
        } else {
            // Create new conversation with first message as title
            let title = request.content.chars().take(50).collect::<String>();
            let id = repository::create_conversation(&conn, title)
                .map_err(|e| format!("Failed to create conversation: {}", e))?;
            repository::get_conversation(&conn, id)
                .map_err(|e| format!("Failed to get new conversation: {}", e))?
        }
    };

    // Calculate prompt tokens and cost
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

    // Save user message
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
            .map_err(|e| format!("Failed to save user message: {}", e))?;
        repository::get_message(&conn, id)
            .map_err(|e| format!("Failed to retrieve user message: {}", e))?
    };

    // Build conversation history for context
    let history = {
        let conn = db.connection()?;
        repository::list_messages(&conn, conversation.id)
            .map_err(|e| format!("Failed to load message history: {}", e))?
    };

    // Convert to LLM messages format
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
        // Streaming mode: emit events for real-time updates
        let router = _llm_state.router.lock().await;

        // Reset stop flag before starting new generation
        reset_stop_flag();

        // Emit stream start
        let _ = app_handle.emit(
            "chat:stream-start",
            serde_json::json!({
                "conversation_id": conversation.id,
                "message_id": 0,  // Will be assigned after saving
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

                while let Some(chunk_result) = stream.next().await {
                    // Check if generation was stopped
                    if should_stop_generation() {
                        info!("[Chat] Generation stopped by user");
                        was_stopped = true;
                        break;
                    }

                    match chunk_result {
                        Ok(chunk) => {
                            full_content.push_str(&chunk.content);
                            token_count += 1; // Rough estimate

                            // Emit chunk to frontend
                            let _ = app_handle.emit(
                                "chat:stream-chunk",
                                serde_json::json!({
                                    "conversation_id": conversation.id,
                                    "message_id": 0,
                                    "delta": chunk.content,
                                    "content": full_content
                                }),
                            );
                        }
                        Err(e) => {
                            info!("[Chat] Stream error: {}", e);
                            break;
                        }
                    }
                }

                // Add note if generation was stopped
                if was_stopped && !full_content.is_empty() {
                    full_content.push_str("\n\n*[Generation stopped by user]*");
                }

                // Save assistant message after streaming completes
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
                        .map_err(|e| format!("Failed to save assistant message: {}", e))?;
                    repository::get_message(&conn, id)
                        .map_err(|e| format!("Failed to retrieve assistant message: {}", e))?
                };

                // Emit stream end
                let _ = app_handle.emit(
                    "chat:stream-end",
                    serde_json::json!({
                        "conversation_id": conversation.id,
                        "message_id": assistant_message.id
                    }),
                );

                let stats = {
                    let conn = db.connection()?;
                    let messages = repository::list_messages(&conn, conversation.id)
                        .map_err(|e| format!("Failed to compute stats: {}", e))?;
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
                return Err(format!("Streaming failed: {}", e));
            }
        }
    }

    // Non-streaming mode: get complete response
    let candidates = {
        let router = _llm_state.router.lock().await;
        router.candidates(&llm_request, &preferences)
    };

    if candidates.is_empty() {
        return Err(
            "No LLM providers configured. Please add an API key in Settings > API Keys."
                .to_string(),
        );
    }

    let mut last_error: Option<String> = None;
    for candidate in candidates {
        let result = {
            let router = _llm_state.router.lock().await;
            router.invoke_candidate(&candidate, &llm_request).await
        };

        match result {
            Ok(outcome) => {
                // Save assistant message
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
                        .map_err(|e| format!("Failed to save assistant message: {}", e))?;
                    repository::get_message(&conn, id)
                        .map_err(|e| format!("Failed to retrieve assistant message: {}", e))?
                };

                let stats = {
                    let conn = db.connection()?;
                    let messages = repository::list_messages(&conn, conversation.id)
                        .map_err(|e| format!("Failed to compute stats: {}", e))?;
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
                last_error = Some(format!("{}: {}", candidate.provider.as_string(), e));
            }
        }
    }

    Err(format!(
        "All providers failed. Last error: {}",
        last_error.unwrap_or_else(|| "Unknown error".to_string())
    ))
}

#[derive(Debug, Serialize)]
pub struct CostOverviewResponse {
    pub today_total: f64,
    pub month_total: f64,
    pub monthly_budget: Option<f64>,
    pub remaining_budget: Option<f64>,
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

// Updated Nov 16, 2025: Added input validation for days parameter
#[tauri::command]
pub fn chat_get_cost_analytics(
    db: State<'_, AppDatabase>,
    days: Option<i64>,
    provider: Option<String>,
    model: Option<String>,
) -> Result<CostAnalyticsResponse, String> {
    // Validate days parameter
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

// Updated Nov 16, 2025: Added input validation for budget amount
#[tauri::command]
pub fn chat_set_monthly_budget(
    db: State<'_, AppDatabase>,
    amount: Option<f64>,
) -> Result<(), String> {
    // Validate amount if provided
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
        .map_err(|e| format!("Failed to save monthly budget: {}", e))?,
        None => repository::delete_setting(&conn, "billing.monthly_budget")
            .map_err(|e| format!("Failed to clear monthly budget: {}", e))?,
    }

    Ok(())
}

/// Stop the current streaming generation
/// This sets the atomic flag that the streaming loop checks to abort
#[tauri::command]
pub async fn chat_stop_generation() -> Result<(), String> {
    info!("[Chat] Stopping generation - setting stop flag");
    STOP_GENERATION.store(true, Ordering::SeqCst);
    Ok(())
}

/// Check if generation should be stopped
pub fn should_stop_generation() -> bool {
    STOP_GENERATION.load(Ordering::SeqCst)
}

/// Reset the stop flag (called at start of new generation)
pub fn reset_stop_flag() {
    STOP_GENERATION.store(false, Ordering::SeqCst);
}
