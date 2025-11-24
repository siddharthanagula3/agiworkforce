use super::llm::LLMState;
use crate::agent::approval::ApprovalController;
// TODO: Re-enable auto-compaction once ContextManager API is compatible with chat.rs
// The deleted agent/context_compactor used std::sync::Mutex, but agi::ContextManager
// requires tokio::sync::Mutex. Need to either:
// 1. Change LLMState to use tokio::sync::Mutex, or
// 2. Create an adapter/wrapper, or
// 3. Port ContextCompactor functionality to a chat-specific helper
// use crate::agi::ContextManager;
use crate::db::models::{
    Conversation, ConversationCostBreakdown, CostTimeseriesPoint, Message, MessageRole,
    ProviderCostBreakdown,
};
use crate::db::repository;
use crate::router::{
    cache_manager::{CacheManager, CacheRecord},
    llm_router::{CostPriority, RouteOutcome, RouterContext, RouterPreferences, RoutingStrategy},
    ChatMessage as RouterChatMessage, LLMRequest, LLMResponse, Provider,
};
use chrono::{Datelike, Duration as ChronoDuration, TimeZone, Utc};
use futures_util::StreamExt;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, State};
use tokio::time::{sleep, Duration as TokioDuration};
use tracing::{info, warn};

/// Shared database connection wrapper exposed to Tauri commands.
pub struct AppDatabase {
    pub conn: Arc<Mutex<Connection>>,
}

/* TODO: Re-enable auto-compaction once ContextManager API is compatible
/// Auto-compact conversation history if needed (like Cursor/Claude Code)
async fn auto_compact_conversation(db: &AppDatabase, conversation_id: i64) -> Result<(), String> {
    let messages = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
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
                    let conn = db.conn.lock().map_err(|e| e.to_string())?;

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

fn router_context_from_metadata(metadata: &TaskMetadata) -> RouterContext {
    RouterContext {
        intents: metadata.intents.clone(),
        requires_vision: metadata.requires_vision,
        token_estimate: metadata.token_estimate.unwrap_or(0),
        cost_priority: parse_cost_priority(metadata.cost_priority.as_deref()),
    }
}

fn parse_cost_priority(source: Option<&str>) -> CostPriority {
    match source {
        Some(value) if value.eq_ignore_ascii_case("low") => CostPriority::Low,
        _ => CostPriority::Balanced,
    }
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

// Updated Nov 16, 2025: Added input validation for title length
#[tauri::command]
pub fn chat_create_conversation(
    db: State<AppDatabase>,
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

    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("Failed to acquire database lock: {}", e))?;
    let id = repository::create_conversation(&conn, trimmed_title.to_string())
        .map_err(|e| format!("Failed to create conversation: {}", e))?;
    repository::get_conversation(&conn, id)
        .map_err(|e| format!("Failed to retrieve conversation {}: {}", id, e))
}

#[tauri::command]
pub fn chat_get_conversations(db: State<AppDatabase>) -> Result<Vec<Conversation>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    repository::list_conversations(&conn, 1000, 0)
        .map_err(|e| format!("Failed to list conversations: {}", e))
}

// Updated Nov 16, 2025: Added input validation for conversation ID
#[tauri::command]
pub fn chat_get_conversation(db: State<AppDatabase>, id: i64) -> Result<Conversation, String> {
    // Validate ID is positive
    if id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            id
        ));
    }

    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("Failed to acquire database lock: {}", e))?;
    repository::get_conversation(&conn, id)
        .map_err(|e| format!("Failed to get conversation {}: {}", id, e))
}

// Updated Nov 16, 2025: Added input validation for ID and title
#[tauri::command]
pub fn chat_update_conversation(
    db: State<AppDatabase>,
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

    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("Failed to acquire database lock: {}", e))?;
    repository::update_conversation_title(&conn, id, trimmed_title.to_string())
        .map_err(|e| format!("Failed to update conversation {}: {}", id, e))
}

// Updated Nov 16, 2025: Added input validation for ID
#[tauri::command]
pub fn chat_delete_conversation(db: State<AppDatabase>, id: i64) -> Result<(), String> {
    // Validate ID is positive
    if id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            id
        ));
    }

    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("Failed to acquire database lock: {}", e))?;
    repository::delete_conversation(&conn, id)
        .map_err(|e| format!("Failed to delete conversation {}: {}", id, e))
}

// Updated Nov 16, 2025: Added comprehensive input validation
#[tauri::command]
pub fn chat_create_message(
    db: State<AppDatabase>,
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

    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("Failed to acquire database lock: {}", e))?;

    let role = match request.role.as_str() {
        "user" => MessageRole::User,
        "assistant" => MessageRole::Assistant,
        "system" => MessageRole::System,
        other => {
            return Err(format!(
                "Invalid role: '{}'. Must be 'user', 'assistant', or 'system'",
                other
            ))
        }
    };

    let message = Message {
        id: 0,
        conversation_id: request.conversation_id,
        role,
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
#[tauri::command]
pub fn chat_get_messages(
    db: State<AppDatabase>,
    conversation_id: i64,
) -> Result<Vec<Message>, String> {
    // Validate conversation_id is positive
    if conversation_id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            conversation_id
        ));
    }

    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("Failed to acquire database lock: {}", e))?;
    repository::list_messages(&conn, conversation_id).map_err(|e| {
        format!(
            "Failed to list messages for conversation {}: {}",
            conversation_id, e
        )
    })
}

// Updated Nov 16, 2025: Added input validation for ID and content
#[tauri::command]
pub fn chat_update_message(
    db: State<AppDatabase>,
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

    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("Failed to acquire database lock: {}", e))?;
    repository::update_message_content(&conn, id, trimmed_content.to_string())
        .map_err(|e| format!("Failed to update message {}: {}", id, e))
}

// Updated Nov 16, 2025: Added input validation for ID
#[tauri::command]
pub fn chat_delete_message(db: State<AppDatabase>, id: i64) -> Result<(), String> {
    // Validate ID is positive
    if id <= 0 {
        return Err(format!("Invalid message ID: {}. ID must be positive", id));
    }

    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("Failed to acquire database lock: {}", e))?;
    repository::delete_message(&conn, id)
        .map_err(|e| format!("Failed to delete message {}: {}", id, e))
}

// Updated Nov 16, 2025: Added input validation for conversation ID
#[tauri::command]
pub fn chat_get_conversation_stats(
    db: State<AppDatabase>,
    conversation_id: i64,
) -> Result<ConversationStats, String> {
    // Validate conversation_id is positive
    if conversation_id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            conversation_id
        ));
    }

    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("Failed to acquire database lock: {}", e))?;
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

/// Handle streaming chat messages with real SSE streaming
async fn chat_send_message_streaming(
    db: State<'_, AppDatabase>,
    llm_state: State<'_, LLMState>,
    settings_state: State<'_, crate::commands::settings::SettingsState>,
    app_handle: tauri::AppHandle,
    request: ChatSendMessageRequest,
) -> Result<ChatSendMessageResponse, String> {
    let task_start = std::time::Instant::now();
    if let Some(approval_state) = app_handle.try_state::<ApprovalController>() {
        approval_state
            .set_current_hash(request.workflow_hash.clone())
            .await;
    }
    let trimmed_content = request.content.trim().to_string();
    if trimmed_content.is_empty() {
        return Err("Message cannot be empty".to_string());
    }

    // Security: Check for prompt injection attempts
    use crate::security::{PromptInjectionDetector, SecurityRecommendation};
    let detector = PromptInjectionDetector::new();
    let security_analysis = detector.analyze(&trimmed_content);

    if !security_analysis.is_safe {
        warn!(
            "Potential prompt injection detected in streaming! Risk: {:.2}, Patterns: {:?}",
            security_analysis.risk_score, security_analysis.detected_patterns
        );

        match security_analysis.recommendation {
            SecurityRecommendation::Block => {
                return Err(format!(
                    "Message blocked due to security concerns. Detected patterns: {}",
                    security_analysis.detected_patterns.join(", ")
                ));
            }
            SecurityRecommendation::FlagForReview => {
                info!(
                    "Message flagged for review but allowed. Risk: {:.2}",
                    security_analysis.risk_score
                );
            }
            SecurityRecommendation::Allow => {}
        }
    }

    // Create conversation and user message
    let (conversation_id, _user_message_id, assistant_message_id) = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

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

    // TODO: Re-enable auto-compaction once ContextManager API is compatible
    // auto_compact_conversation(&db, conversation_id)
    //     .await
    //     .unwrap_or_else(|e| warn!("Auto-compaction failed: {}", e));

    // Get conversation history (after compaction)
    let history = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        repository::list_messages(&conn, conversation_id)
            .map_err(|e| format!("Failed to list messages: {}", e))?
    };

    // Construct messages for the router
    let mut router_messages: Vec<RouterChatMessage> = Vec::new();

    // Add System Prompt with Tool Usage + Thinking Process instructions
    router_messages.push(RouterChatMessage {
        role: "system".to_string(),
        content: "You are AGI Workforce, an intelligent AI assistant with access to powerful automation tools.

TOOL USAGE - CRITICAL:
You have access to tools for file operations, web searches, terminal commands, screenshots, and more. 
When a user requests an action, automatically identify and call the appropriate tools:

Common patterns:
- \"read [file]\" or \"show me [file]\" → Use file_read tool
- \"create [file]\" or \"write to [file]\" → Use file_write tool  
- \"search for [query]\" or \"find information about [topic]\" → Use web_search tool
- \"run [command]\" or \"execute [command]\" → Use terminal_execute tool
- \"take a screenshot\" or \"show me the screen\" → Use screenshot_capture tool
- \"list files in [directory]\" → Use file_list tool

IMPORTANT: You should proactively use tools when they would help answer the user's question. 
Don"
.to_string() + "'t wait for explicit \"use tool\" commands. Be intelligent and helpful.

THINKING PROCESS:
For complex problems, show your reasoning using <thinking> tags before the final answer:
<thinking>
1. Analyze the user's request → Identify required tools
2. Plan tool execution → Determine parameters
3. Review tool results → Synthesize response
</thinking>

RESPONSE STYLE:
- Be concise and clear
- Explain what tools you're using and why
- Synthesize tool results into helpful answers
- If a tool fails, explain the error and suggest alternatives

Remember: You are an autonomous agent. Use tools proactively to provide the best assistance.",
        tool_calls: None,
        tool_call_id: None,
        multimodal_content: None,
    });

    router_messages.extend(history
        .iter()
        .filter(|m| m.id != assistant_message_id) // Exclude placeholder
        .map(|message| RouterChatMessage {
            role: message.role.as_str().to_string(),
            content: message.content.clone(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }));

    let provider_override = request
        .provider_override
        .as_ref()
        .or(request.provider.as_ref())
        .and_then(|value| Provider::from_string(value));

    let model_override = request.model_override.clone().or(request.model.clone());

    let router_context = request
        .task_metadata
        .as_ref()
        .map(router_context_from_metadata);

    // Get default model from settings if not provided
    let model = if let Some(model) = model_override.clone() {
        model
    } else {
        let settings = settings_state.settings.lock().await;
        let provider_name = request
            .provider_override
            .as_ref()
            .or(request.provider.as_ref())
            .cloned()
            .unwrap_or_else(|| settings.llm_config.default_provider.clone());
        match provider_name.as_str() {
            "openai" => settings.llm_config.default_models.openai.clone(),
            "anthropic" => settings.llm_config.default_models.anthropic.clone(),
            "google" => settings.llm_config.default_models.google.clone(),
            "ollama" => settings.llm_config.default_models.ollama.clone(),
            "xai" => settings.llm_config.default_models.xai.clone(),
            "deepseek" => settings.llm_config.default_models.deepseek.clone(),
            "qwen" => settings.llm_config.default_models.qwen.clone(),
            "mistral" => settings.llm_config.default_models.mistral.clone(),
            "moonshot" => settings.llm_config.default_models.moonshot.clone(),
            _ => settings.llm_config.default_models.openai.clone(),
        }
    };

    // ✅ Add tool definitions from AGI registry + MCP tools + AI Employees (same as non-streaming)
    let (tool_definitions, tool_executor) = if request.enable_tools.unwrap_or(true) {
        use crate::agi::tools::ToolRegistry;
        use crate::commands::McpState;
        use crate::router::tool_executor::ToolExecutor;
        use std::sync::Arc;

        match ToolRegistry::new() {
            Ok(registry) => {
                let tool_registry = Arc::new(registry);
                let mut tool_executor =
                    ToolExecutor::with_app_handle(tool_registry.clone(), app_handle.clone());

                // 🔒 Set conversation mode for security checks
                tool_executor.set_conversation_mode(request.conversation_mode.clone());

                let mut tool_defs = tool_executor.get_tool_definitions(None);

                // ✅ Add MCP tools if available
                if let Some(mcp_state) = app_handle.try_state::<McpState>() {
                    let mcp_tools = mcp_state.registry.get_all_tool_definitions();
                    if !mcp_tools.is_empty() {
                        tracing::info!(
                            "[Chat Streaming] Adding {} MCP tools to function definitions",
                            mcp_tools.len()
                        );
                        tool_defs.extend(mcp_tools);
                    }
                }

                // TODO: AI Employees integration (future feature)
                // AI employee tools will be added here when the marketplace feature is ready

                (Some(tool_defs), Some(tool_executor))
            }
            Err(e) => {
                tracing::warn!("[Chat Streaming] Failed to initialize tool registry: {}", e);
                (None, None)
            }
        }
    } else {
        (None, None)
    };

    let has_tools = tool_definitions.is_some();
    let tool_defs_for_follow_up = tool_definitions.clone();
    let router_messages_clone = router_messages.clone(); // Clone for potential follow-up request

    let llm_request = LLMRequest {
        messages: router_messages,
        model,
        temperature: None,
        max_tokens: None,
        stream: true,
        tools: tool_definitions, // ✅ Enable tools in streaming
        tool_choice: if has_tools {
            Some(crate::router::ToolChoice::Auto) // ✅ Let LLM decide when to use tools
        } else {
            None
        },
    };

    let preferences = RouterPreferences {
        provider: provider_override,
        model: model_override,
        strategy: parse_routing_strategy(request.strategy.as_deref()),
        context: router_context.clone(),
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
        router
            .send_message_streaming(&llm_request, &preferences)
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

                // Note: finish_reason is captured but tool execution is determined by has_tools flag

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
    let mut assistant_msg = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        repository::update_message_content(&conn, assistant_message_id, accumulated_content.clone())
            .map_err(|e| format!("Failed to update assistant message: {}", e))?
    };

    // ✅ Check for tool calls after streaming completes
    // Since streaming doesn't include tool calls in chunks, we make a follow-up non-streaming request
    // if tools are enabled to check for and execute tool calls
    if has_tools && tool_executor.is_some() {
        // Make a non-streaming request with the accumulated content to check for tool calls
        let follow_up_request = LLMRequest {
            messages: {
                let mut msgs = router_messages_clone;
                msgs.push(crate::router::ChatMessage {
                    role: "assistant".to_string(),
                    content: accumulated_content.clone(),
                    tool_calls: None,
                    tool_call_id: None,
                    multimodal_content: None,
                });
                msgs
            },
            model: llm_request.model.clone(),
            temperature: None,
            max_tokens: None,
            stream: false, // Non-streaming to get tool calls
            tools: tool_defs_for_follow_up.clone(),
            tool_choice: Some(crate::router::ToolChoice::Auto),
        };

        let candidates = {
            let router = llm_state.router.lock().await;
            router.candidates(&follow_up_request, &preferences)
        };

        if let Some(candidate) = candidates.first() {
            if let Ok(outcome) = {
                let router = llm_state.router.lock().await;
                router.invoke_candidate(candidate, &follow_up_request).await
            } {
                // Check if we got tool calls
                if let Some(tool_calls) = &outcome.response.tool_calls {
                    if let Some(ref executor) = tool_executor {
                        tracing::info!(
                            "[Chat Streaming] Found {} tool calls, executing...",
                            tool_calls.len()
                        );

                        // Execute tool calls
                        let mut tool_results = Vec::new();
                        for tool_call in tool_calls {
                            tracing::info!(
                                "[Chat Streaming] Executing tool: {} ({})",
                                tool_call.name,
                                tool_call.id
                            );

                            let start_time = std::time::Instant::now();
                            match executor.execute_tool_call(tool_call).await {
                                Ok(result) => {
                                    let duration = start_time.elapsed().as_millis() as u64;
                                    let formatted = executor.format_tool_result(tool_call, &result);
                                    tool_results.push((tool_call.id.clone(), formatted));
                                    tracing::info!(
                                        "[Chat Streaming] Tool {} succeeded",
                                        tool_call.name
                                    );

                                    // Emit tool execution event
                                    let input_map: std::collections::HashMap<String, serde_json::Value> =
                                        serde_json::from_str(&tool_call.arguments).unwrap_or_default();
                                    
                                    let event = crate::events::frontend_events::create_tool_execution_event(
                                        &tool_call.name,
                                        &input_map,
                                        Some(serde_json::json!(result)),
                                        None,
                                        duration,
                                        true
                                    );
                                    crate::events::frontend_events::emit_tool_execution(&app_handle, event);
                                }
                                Err(e) => {
                                    let duration = start_time.elapsed().as_millis() as u64;
                                    let error_msg = format!("Tool execution failed: {}", e);
                                    tool_results.push((tool_call.id.clone(), error_msg.clone()));
                                    tracing::error!(
                                        "[Chat Streaming] Tool {} failed: {}",
                                        tool_call.name,
                                        e
                                    );

                                    // Emit tool execution event
                                    let input_map: std::collections::HashMap<String, serde_json::Value> =
                                        serde_json::from_str(&tool_call.arguments).unwrap_or_default();

                                    let event = crate::events::frontend_events::create_tool_execution_event(
                                        &tool_call.name,
                                        &input_map,
                                        None,
                                        Some(e.to_string()),
                                        duration,
                                        false
                                    );
                                    crate::events::frontend_events::emit_tool_execution(&app_handle, event);
                                }
                            }
                        }

                        // Add tool results to conversation
                        for (tool_call_id, result_content) in tool_results {
                            let conn = db.conn.lock().map_err(|e| e.to_string())?;
                            let tool_result_msg = Message::new(
                                conversation_id,
                                MessageRole::System,
                                format!("Tool result [{}]: {}", tool_call_id, result_content),
                            );
                            repository::create_message(&conn, &tool_result_msg)
                                .map_err(|e| format!("Failed to save tool result: {}", e))?;
                        }

                        // Continue conversation with tool results (make another request)
                        let updated_history = {
                            let conn = db.conn.lock().map_err(|e| e.to_string())?;
                            repository::list_messages(&conn, conversation_id)
                                .map_err(|e| format!("Failed to list messages: {}", e))?
                        };

                        let updated_messages: Vec<RouterChatMessage> = updated_history
                            .iter()
                            .map(|message| RouterChatMessage {
                                role: message.role.as_str().to_string(),
                                content: message.content.clone(),
                                tool_calls: None,
                                tool_call_id: None,
                                multimodal_content: None,
                            })
                            .collect();

                        let final_request = LLMRequest {
                            messages: updated_messages,
                            model: llm_request.model.clone(),
                            temperature: None,
                            max_tokens: None,
                            stream: false,
                            tools: tool_defs_for_follow_up.clone(),
                            tool_choice: Some(crate::router::ToolChoice::Auto),
                        };

                        // Get final response with tool results
                        if let Ok(final_outcome) = {
                            let router = llm_state.router.lock().await;
                            router.invoke_candidate(candidate, &final_request).await
                        } {
                            // Update assistant message with final response
                            let conn = db.conn.lock().map_err(|e| e.to_string())?;
                            assistant_msg = repository::update_message_content(
                                &conn,
                                assistant_message_id,
                                final_outcome.response.content.clone(),
                            )
                            .map_err(|e| format!("Failed to update assistant message: {}", e))?;
                        }
                    }
                }
            }
        }
    }

    // Fetch final conversation state
    let (conversation, user_msg, messages) = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
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

    let duration_ms = task_start.elapsed().as_millis() as u64;
    let stream_tokens = assistant_msg.tokens.unwrap_or(0).max(0) as u32;
    let stream_cost = assistant_msg.cost.unwrap_or(0.0);
    let metrics_payload = serde_json::json!({
        "metrics": {
            "workflowHash": request.workflow_hash.clone(),
            "actionId": format!("chat-stream-{}", assistant_msg.id),
            "tokens": stream_tokens,
            "costUsd": stream_cost,
            "durationMs": duration_ms,
            "completionReason": "stream_completed",
        }
    });
    if let Err(err) = app_handle.emit("agent:metrics", metrics_payload) {
        warn!("Failed to emit streaming metrics event: {}", err);
    }

    let assistant_content = assistant_msg.content.clone();
    Ok(ChatSendMessageResponse {
        conversation,
        user_message: user_msg,
        assistant_message: assistant_msg,
        stats: ConversationStats {
            message_count: messages.len(),
            total_tokens: total_tokens_sum,
            total_cost,
        },
        last_message: Some(assistant_content),
    })
}

#[tauri::command]
pub async fn chat_send_message(
    db: State<'_, AppDatabase>,
    llm_state: State<'_, LLMState>,
    settings_state: State<'_, crate::commands::settings::SettingsState>,
    app_handle: tauri::AppHandle,
    request: ChatSendMessageRequest,
) -> Result<ChatSendMessageResponse, String> {
    let stream_mode = request.stream.unwrap_or(false);

    // Use separate streaming path if requested
    if stream_mode {
        return chat_send_message_streaming(db, llm_state, settings_state, app_handle, request)
            .await;
    }
    let task_start = std::time::Instant::now();
    if let Some(approval_state) = app_handle.try_state::<ApprovalController>() {
        approval_state
            .set_current_hash(request.workflow_hash.clone())
            .await;
    }

    let trimmed_content = request.content.trim().to_string();
    if trimmed_content.is_empty() {
        return Err("Message cannot be empty".to_string());
    }

    // Security: Check for prompt injection attempts
    use crate::security::{PromptInjectionDetector, SecurityRecommendation};
    let detector = PromptInjectionDetector::new();
    let security_analysis = detector.analyze(&trimmed_content);

    if !security_analysis.is_safe {
        warn!(
            "Potential prompt injection detected! Risk: {:.2}, Patterns: {:?}",
            security_analysis.risk_score, security_analysis.detected_patterns
        );

        match security_analysis.recommendation {
            SecurityRecommendation::Block => {
                return Err(format!(
                    "Message blocked due to security concerns. Detected patterns: {}",
                    security_analysis.detected_patterns.join(", ")
                ));
            }
            SecurityRecommendation::FlagForReview => {
                info!(
                    "Message flagged for review but allowed. Risk: {:.2}",
                    security_analysis.risk_score
                );
            }
            SecurityRecommendation::Allow => {}
        }
    }

    let (conversation_id, user_message) = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

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

    // TODO: Re-enable auto-compaction once ContextManager API is compatible
    // auto_compact_conversation(&db, conversation_id)
    //     .await
    //     .unwrap_or_else(|e| warn!("Auto-compaction failed: {}", e));

    // 🔔 Emit agent status: Analyzing request
    let _ = app_handle.emit(
        "agent:status:update",
        serde_json::json!({
            "id": "main_agent",
            "name": "AGI Workforce Agent",
            "status": "running",
            "currentStep": "Analyzing request...",
            "progress": 10
        }),
    );

    // Get conversation history (after compaction)
    let history = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
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
            multimodal_content: None,
        })
        .collect();

    // ✅ Add tool definitions from AGI registry + MCP tools + AI Employees
    let (tool_definitions, _tool_executor) = if request.enable_tools.unwrap_or(true) {
        use crate::agi::tools::ToolRegistry;
        use crate::commands::McpState;
        use crate::router::tool_executor::ToolExecutor;
        use std::sync::Arc;

        match ToolRegistry::new() {
            Ok(registry) => {
                let tool_registry = Arc::new(registry);
                let mut tool_executor =
                    ToolExecutor::with_app_handle(tool_registry.clone(), app_handle.clone());

                // 🔒 Set conversation mode for security checks
                tool_executor.set_conversation_mode(request.conversation_mode.clone());

                let mut tool_defs = tool_executor.get_tool_definitions(None);

                // ✅ Add MCP tools if available
                if let Some(mcp_state) = app_handle.try_state::<McpState>() {
                    let mcp_tools = mcp_state.registry.get_all_tool_definitions();
                    if !mcp_tools.is_empty() {
                        tracing::info!(
                            "[Chat] Adding {} MCP tools to function definitions",
                            mcp_tools.len()
                        );
                        tool_defs.extend(mcp_tools);
                    }
                }

                // TODO: AI Employees integration (future feature)
                // AI employee tools will be added here when the marketplace feature is ready

                (Some(tool_defs), Some(tool_executor))
            }
            Err(e) => {
                tracing::warn!("[Chat] Failed to initialize tool registry: {}", e);
                (None, None)
            }
        }
    } else {
        (None, None)
    };

    let has_tools = tool_definitions.is_some();
    let tool_defs_for_follow_up = tool_definitions.clone(); // Clone for potential follow-up request

    // 🔔 Emit agent status: Planning
    let _ = app_handle.emit(
        "agent:status:update",
        serde_json::json!({
            "id": "main_agent",
            "name": "AGI Workforce Agent",
            "status": "running",
            "currentStep": "Planning actions...",
            "progress": 30
        }),
    );

    let provider_override = request
        .provider_override
        .as_ref()
        .or(request.provider.as_ref())
        .and_then(|value| Provider::from_string(value));

    let model_override = request.model_override.clone().or(request.model.clone());

    let router_context = request
        .task_metadata
        .as_ref()
        .map(router_context_from_metadata);

    // Get default model from settings if not provided
    let model = if let Some(model) = model_override.clone() {
        model
    } else {
        let settings = settings_state.settings.lock().await;
        let provider_name = request
            .provider_override
            .as_ref()
            .or(request.provider.as_ref())
            .cloned()
            .unwrap_or_else(|| settings.llm_config.default_provider.clone());
        match provider_name.as_str() {
            "openai" => settings.llm_config.default_models.openai.clone(),
            "anthropic" => settings.llm_config.default_models.anthropic.clone(),
            "google" => settings.llm_config.default_models.google.clone(),
            "ollama" => settings.llm_config.default_models.ollama.clone(),
            "xai" => settings.llm_config.default_models.xai.clone(),
            "deepseek" => settings.llm_config.default_models.deepseek.clone(),
            "qwen" => settings.llm_config.default_models.qwen.clone(),
            "mistral" => settings.llm_config.default_models.mistral.clone(),
            "moonshot" => settings.llm_config.default_models.moonshot.clone(),
            _ => settings.llm_config.default_models.openai.clone(),
        }
    };

    let llm_request = LLMRequest {
        messages: router_messages,
        model,
        temperature: None,
        max_tokens: None,
        stream: stream_mode,     // Use real streaming based on request
        tools: tool_definitions, // ✅ Enable tools
        tool_choice: if has_tools {
            Some(crate::router::ToolChoice::Auto) // ✅ Let LLM decide when to use tools
        } else {
            None
        },
    };

    let preferences = RouterPreferences {
        provider: provider_override,
        model: model_override,
        strategy: parse_routing_strategy(request.strategy.as_deref()),
        context: router_context.clone(),
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
            llm_request.temperature,
            llm_request.max_tokens,
        );

        if let Some(entry) = {
            let conn = db.conn.lock().map_err(|e| e.to_string())?;
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
                    let conn = db.conn.lock().map_err(|e| e.to_string())?;
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
                                temperature: llm_request.temperature,
                                max_tokens: llm_request.max_tokens,
                                expires_at,
                            },
                        )
                        .map_err(|e| format!("Failed to store cache entry: {}", e))?;
                }

                // ✅ Handle tool calls in response
                if let Some(tool_calls) = &route_outcome.response.tool_calls {
                    if let Some(ref executor) = _tool_executor {
                        // Save assistant message with tool calls
                        let _assistant_msg_with_tools = {
                            let conn = db.conn.lock().map_err(|e| e.to_string())?;
                            let mut assistant = Message::new(
                                conversation_id,
                                MessageRole::Assistant,
                                route_outcome.response.content.clone(),
                            )
                            .with_source(
                                Some(route_outcome.provider.as_string().to_string()),
                                Some(route_outcome.model.clone()),
                            );

                            if let Some(tokens) = route_outcome.response.tokens {
                                assistant.tokens = Some(tokens as i32);
                            }
                            if let Some(cost) = route_outcome.response.cost {
                                assistant.cost = Some(cost);
                            }

                            let msg_id =
                                repository::create_message(&conn, &assistant).map_err(|e| {
                                    format!("Failed to create assistant message: {}", e)
                                })?;
                            repository::get_message(&conn, msg_id).map_err(|e| {
                                format!("Failed to retrieve assistant message: {}", e)
                            })?
                        };

                        // Execute all tool calls
                        let mut tool_results = Vec::new();
                        for tool_call in tool_calls {
                            tracing::info!(
                                "[Chat] Executing tool: {} ({})",
                                tool_call.name,
                                tool_call.id
                            );

                            match executor.execute_tool_call(tool_call).await {
                                Ok(result) => {
                                    let formatted = executor.format_tool_result(tool_call, &result);
                                    tool_results.push((tool_call.id.clone(), formatted));
                                    tracing::info!("[Chat] Tool {} succeeded", tool_call.name);
                                }
                                Err(e) => {
                                    let error_msg = format!("Tool execution failed: {}", e);
                                    tool_results.push((tool_call.id.clone(), error_msg));
                                    tracing::error!("[Chat] Tool {} failed: {}", tool_call.name, e);
                                }
                            }
                        }

                        // Add tool results to conversation
                        for (tool_call_id, result_content) in tool_results {
                            let conn = db.conn.lock().map_err(|e| e.to_string())?;
                            let tool_result_msg = Message::new(
                                conversation_id,
                                MessageRole::System, // Tool results as system messages
                                format!("Tool result [{}]: {}", tool_call_id, result_content),
                            );
                            repository::create_message(&conn, &tool_result_msg)
                                .map_err(|e| format!("Failed to save tool result: {}", e))?;
                        }

                        // Continue conversation with tool results (non-streaming for now)
                        tracing::info!(
                            "[Chat] Continuing conversation with {} tool results",
                            tool_calls.len()
                        );

                        let updated_history = {
                            let conn = db.conn.lock().map_err(|e| e.to_string())?;
                            repository::list_messages(&conn, conversation_id)
                                .map_err(|e| format!("Failed to list messages: {}", e))?
                        };

                        let updated_messages: Vec<RouterChatMessage> = updated_history
                            .iter()
                            .map(|message| RouterChatMessage {
                                role: message.role.as_str().to_string(),
                                content: message.content.clone(),
                                tool_calls: None,
                                tool_call_id: None,
                                multimodal_content: None,
                            })
                            .collect();

                        let follow_up_request = LLMRequest {
                            messages: updated_messages,
                            model: llm_request.model.clone(),
                            temperature: None,
                            max_tokens: None,
                            stream: false,
                            tools: tool_defs_for_follow_up.clone(),
                            tool_choice: Some(crate::router::ToolChoice::Auto),
                        };

                        // Make follow-up request
                        let follow_up_outcome = {
                            let router = llm_state.router.lock().await;
                            router
                                .invoke_candidate(&candidate, &follow_up_request)
                                .await
                                .map_err(|e| format!("Follow-up request failed: {}", e))?
                        };

                        // Update outcome with follow-up response
                        outcome = Some(follow_up_outcome);
                        break;
                    }
                }

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
            .map(|e| e.to_string())
            .unwrap_or_else(|| "All providers failed with unknown errors.".to_string())
    })?;

    let (conversation, assistant_message, stats, last_message) = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

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

    let duration_ms = task_start.elapsed().as_millis() as u64;
    let completion_reason = outcome.response.finish_reason.clone().unwrap_or_else(|| {
        if outcome.response.cached {
            "cache_hit".to_string()
        } else {
            "completed".to_string()
        }
    });
    let response_tokens = outcome.response.tokens.unwrap_or(0);
    let response_cost = outcome.response.cost.unwrap_or(0.0);
    let metrics_payload = serde_json::json!({
        "metrics": {
            "workflowHash": request.workflow_hash.clone(),
            "actionId": format!("chat-response-{}", assistant_message.id),
            "tokens": response_tokens,
            "costUsd": response_cost,
            "durationMs": duration_ms,
            "completionReason": completion_reason,
        }
    });
    if let Err(err) = app_handle.emit("agent:metrics", metrics_payload) {
        warn!("Failed to emit metrics event: {}", err);
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
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

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
    db: State<AppDatabase>,
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

    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("Failed to acquire database lock: {}", e))?;
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
pub fn chat_set_monthly_budget(db: State<AppDatabase>, amount: Option<f64>) -> Result<(), String> {
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

    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("Failed to acquire database lock: {}", e))?;

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
