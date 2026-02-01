//! Conversation state management for multi-turn optimization and context tracking.
//!
//! This module provides conversation state tracking that enables:
//! - Response ID tracking for continuity across turns
//! - Context window management with automatic pruning
//! - Multi-turn optimization through context reuse
//! - State persistence for conversation resumption
//! - Prompt caching optimization
//!
//! # OpenAI Conversation State
//!
//! OpenAI's Responses API supports conversation state through `previous_response_id`:
//! - Include the previous response's ID to maintain context
//! - Reduces redundant data transfer
//! - Leverages prompt caching automatically
//! - Optimizes multi-turn conversations
//!
//! # Example
//!
//! ```rust,no_run
//! use crate::core::llm::conversation_state::{ConversationState, ConversationStateManager};
//! use crate::core::llm::{LLMRequest, ChatMessage};
//!
//! let manager = ConversationStateManager::new(4096, 32000, None);
//! let conversation_id = "user_123_chat_456".to_string();
//!
//! // First turn
//! let request1 = LLMRequest::new(
//!     vec![ChatMessage { role: "user".into(), content: "Hello".into(), ..Default::default() }],
//!     "gpt-5.2".into()
//! );
//! let state = manager.create_or_update(&conversation_id, &request1, None);
//!
//! // Second turn - includes previous_response_id
//! let request2 = LLMRequest::new(
//!     vec![ChatMessage { role: "user".into(), content: "Tell me more".into(), ..Default::default() }],
//!     "gpt-5.2".into()
//! );
//! let updated_state = manager.create_or_update(&conversation_id, &request2, Some("resp_xyz123".into()));
//! ```

use chrono::{DateTime, Duration, Utc};
use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use super::{ChatMessage, LLMRequest, LLMResponse};

/// Conversation state tracking for a single conversation thread.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationState {
    /// Unique conversation identifier (e.g., "user_123_chat_456")
    pub conversation_id: String,

    /// Model being used for this conversation
    pub model: String,

    /// Previous response ID from the last turn (for OpenAI Responses API)
    pub previous_response_id: Option<String>,

    /// Complete conversation history
    pub messages: Vec<ChatMessage>,

    /// Total tokens used in conversation so far
    pub total_tokens: u32,

    /// Prompt tokens in the current context window
    pub context_tokens: u32,

    /// Maximum context window size for this model
    pub max_context_tokens: u32,

    /// Turn number in this conversation (increments with each exchange)
    pub turn_count: u32,

    /// When this conversation was created
    pub created_at: DateTime<Utc>,

    /// When this conversation was last updated
    pub updated_at: DateTime<Utc>,

    /// When this conversation expires (for cleanup)
    pub expires_at: DateTime<Utc>,

    /// Metadata for custom extensions
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

impl ConversationState {
    /// Create a new conversation state.
    pub fn new(
        conversation_id: String,
        model: String,
        max_context_tokens: u32,
        expiry_hours: i64,
    ) -> Self {
        let now = Utc::now();
        Self {
            conversation_id,
            model,
            previous_response_id: None,
            messages: Vec::new(),
            total_tokens: 0,
            context_tokens: 0,
            max_context_tokens,
            turn_count: 0,
            created_at: now,
            updated_at: now,
            expires_at: now + Duration::hours(expiry_hours),
            metadata: None,
        }
    }

    /// Add a new turn to the conversation.
    pub fn add_turn(
        &mut self,
        request: &LLMRequest,
        response: &LLMResponse,
        response_id: Option<String>,
    ) {
        // Add request messages
        self.messages.extend(request.messages.clone());

        // Add response as assistant message
        if !response.content.is_empty() {
            self.messages.push(ChatMessage {
                role: "assistant".to_string(),
                content: response.content.clone(),
                tool_calls: response.tool_calls.clone(),
                tool_call_id: None,
                multimodal_content: None,
            });
        }

        // Update state
        self.previous_response_id = response_id;
        self.turn_count += 1;
        self.updated_at = Utc::now();

        // Update token counts
        if let Some(tokens) = response.tokens {
            self.total_tokens += tokens;
        }
        if let Some(prompt_tokens) = response.prompt_tokens {
            self.context_tokens = prompt_tokens;
        }
    }

    /// Prune old messages to fit within context window.
    ///
    /// Keeps system messages and the most recent messages that fit in the window.
    /// Uses a simple token estimation: ~4 characters per token.
    pub fn prune_context(&mut self, target_tokens: u32) {
        if self.context_tokens <= target_tokens {
            return;
        }

        // Separate system messages from regular messages
        let (system_msgs, regular_msgs): (Vec<_>, Vec<_>) = self
            .messages
            .drain(..)
            .partition(|msg| msg.role == "system");

        // Estimate tokens for system messages
        let system_tokens: usize = system_msgs.iter().map(|msg| msg.content.len() / 4).sum();

        let available_tokens = if target_tokens as usize > system_tokens {
            target_tokens as usize - system_tokens
        } else {
            0
        };

        // Keep most recent messages that fit
        let mut kept_tokens = 0;
        let mut keep_from_index = regular_msgs.len();

        for (i, msg) in regular_msgs.iter().enumerate().rev() {
            let msg_tokens = msg.content.len() / 4;
            if kept_tokens + msg_tokens <= available_tokens {
                kept_tokens += msg_tokens;
                keep_from_index = i;
            } else {
                break;
            }
        }

        // Rebuild messages: system messages + recent messages
        self.messages = system_msgs;
        self.messages
            .extend(regular_msgs.into_iter().skip(keep_from_index));

        // Update context token count (rough estimate)
        self.context_tokens = (system_tokens + kept_tokens) as u32;
    }

    /// Check if this conversation has exceeded the context window.
    pub fn exceeds_context_window(&self) -> bool {
        self.context_tokens > self.max_context_tokens
    }

    /// Check if this conversation has expired.
    pub fn is_expired(&self) -> bool {
        Utc::now() > self.expires_at
    }

    /// Extend the expiration time.
    pub fn extend_expiry(&mut self, hours: i64) {
        self.expires_at = Utc::now() + Duration::hours(hours);
    }

    /// Get the number of messages in this conversation.
    pub fn message_count(&self) -> usize {
        self.messages.len()
    }

    /// Estimate the total tokens in the current context.
    pub fn estimate_context_tokens(&self) -> u32 {
        // Simple estimation: ~4 characters per token
        let total_chars: usize = self.messages.iter().map(|msg| msg.content.len()).sum();
        (total_chars / 4) as u32
    }
}

/// Manager for conversation state persistence and retrieval.
pub struct ConversationStateManager {
    /// In-memory cache of active conversations
    cache: Arc<RwLock<HashMap<String, ConversationState>>>,

    /// Default context window size (tokens)
    default_context_window: u32,

    /// Maximum context window size before pruning (tokens)
    max_context_window: u32,

    /// Conversation expiry time in hours
    expiry_hours: i64,

    /// Database connection for persistence (optional)
    db_path: Option<String>,
}

impl ConversationStateManager {
    /// Create a new conversation state manager.
    ///
    /// # Arguments
    ///
    /// * `default_context_window` - Default context window size (e.g., 4096 tokens)
    /// * `max_context_window` - Maximum context window before pruning (e.g., 32000 tokens)
    /// * `db_path` - Optional path to SQLite database for persistence
    pub fn new(
        default_context_window: u32,
        max_context_window: u32,
        db_path: Option<String>,
    ) -> Self {
        Self {
            cache: Arc::new(RwLock::new(HashMap::new())),
            default_context_window,
            max_context_window,
            expiry_hours: 24,
            db_path,
        }
    }

    /// Create a new conversation state manager with custom expiry.
    pub fn with_expiry(
        default_context_window: u32,
        max_context_window: u32,
        db_path: Option<String>,
        expiry_hours: i64,
    ) -> Self {
        Self {
            cache: Arc::new(RwLock::new(HashMap::new())),
            default_context_window,
            max_context_window,
            expiry_hours,
            db_path,
        }
    }

    /// Get or create a conversation state.
    pub fn get_or_create(
        &self,
        conversation_id: &str,
        model: &str,
    ) -> Result<ConversationState, String> {
        // Check cache first
        {
            let cache = self
                .cache
                .read()
                .map_err(|e| format!("Failed to read cache: {}", e))?;
            if let Some(state) = cache.get(conversation_id) {
                if !state.is_expired() {
                    return Ok(state.clone());
                }
            }
        }

        // Try to load from database
        if let Some(ref db_path) = self.db_path {
            if let Ok(state) = self.load_from_db(db_path, conversation_id) {
                if !state.is_expired() {
                    // Update cache
                    let mut cache = self
                        .cache
                        .write()
                        .map_err(|e| format!("Failed to write cache: {}", e))?;
                    cache.insert(conversation_id.to_string(), state.clone());
                    return Ok(state);
                }
            }
        }

        // Create new conversation state
        let state = ConversationState::new(
            conversation_id.to_string(),
            model.to_string(),
            self.max_context_window,
            self.expiry_hours,
        );

        // Update cache
        let mut cache = self
            .cache
            .write()
            .map_err(|e| format!("Failed to write cache: {}", e))?;
        cache.insert(conversation_id.to_string(), state.clone());

        Ok(state)
    }

    /// Update a conversation state with a new turn.
    pub fn update(
        &self,
        conversation_id: &str,
        request: &LLMRequest,
        response: &LLMResponse,
        response_id: Option<String>,
    ) -> Result<ConversationState, String> {
        let mut state = self.get_or_create(conversation_id, &request.model)?;

        // Add the turn
        state.add_turn(request, response, response_id);

        // Prune if necessary
        if state.exceeds_context_window() {
            state.prune_context(self.default_context_window);
        }

        // Update cache
        {
            let mut cache = self
                .cache
                .write()
                .map_err(|e| format!("Failed to write cache: {}", e))?;
            cache.insert(conversation_id.to_string(), state.clone());
        }

        // Persist to database
        if let Some(ref db_path) = self.db_path {
            if let Err(e) = self.save_to_db(db_path, &state) {
                tracing::warn!("Failed to persist conversation state to database: {}", e);
            }
        }

        Ok(state)
    }

    /// Create or update conversation state in one operation.
    pub fn create_or_update(
        &self,
        conversation_id: &str,
        request: &LLMRequest,
        response_id: Option<String>,
    ) -> Result<ConversationState, String> {
        let mut state = self.get_or_create(conversation_id, &request.model)?;

        // Update previous response ID if provided
        if response_id.is_some() {
            state.previous_response_id = response_id;
            state.updated_at = Utc::now();
        }

        // Update cache
        {
            let mut cache = self
                .cache
                .write()
                .map_err(|e| format!("Failed to write cache: {}", e))?;
            cache.insert(conversation_id.to_string(), state.clone());
        }

        Ok(state)
    }

    /// Get a conversation state without creating it.
    pub fn get(&self, conversation_id: &str) -> Option<ConversationState> {
        // Check cache
        if let Ok(cache) = self.cache.read() {
            if let Some(state) = cache.get(conversation_id) {
                if !state.is_expired() {
                    return Some(state.clone());
                }
            }
        }

        // Try database
        if let Some(ref db_path) = self.db_path {
            if let Ok(state) = self.load_from_db(db_path, conversation_id) {
                if !state.is_expired() {
                    // Update cache
                    if let Ok(mut cache) = self.cache.write() {
                        cache.insert(conversation_id.to_string(), state.clone());
                    }
                    return Some(state);
                }
            }
        }

        None
    }

    /// Delete a conversation state.
    pub fn delete(&self, conversation_id: &str) -> Result<(), String> {
        // Remove from cache
        {
            let mut cache = self
                .cache
                .write()
                .map_err(|e| format!("Failed to write cache: {}", e))?;
            cache.remove(conversation_id);
        }

        // Remove from database
        if let Some(ref db_path) = self.db_path {
            self.delete_from_db(db_path, conversation_id)?;
        }

        Ok(())
    }

    /// Clear all expired conversations.
    pub fn cleanup_expired(&self) -> Result<usize, String> {
        let mut removed_count = 0;

        // Clean cache
        {
            let mut cache = self
                .cache
                .write()
                .map_err(|e| format!("Failed to write cache: {}", e))?;
            cache.retain(|_, state| {
                if state.is_expired() {
                    removed_count += 1;
                    false
                } else {
                    true
                }
            });
        }

        // Clean database
        if let Some(ref db_path) = self.db_path {
            removed_count += self.cleanup_expired_from_db(db_path)?;
        }

        Ok(removed_count)
    }

    /// Get all active conversation IDs.
    pub fn list_conversations(&self) -> Vec<String> {
        if let Ok(cache) = self.cache.read() {
            cache
                .iter()
                .filter(|(_, state)| !state.is_expired())
                .map(|(id, _)| id.clone())
                .collect()
        } else {
            Vec::new()
        }
    }

    /// Get statistics for all conversations.
    pub fn get_stats(&self) -> ConversationStats {
        if let Ok(cache) = self.cache.read() {
            let active_conversations = cache
                .iter()
                .filter(|(_, state)| !state.is_expired())
                .count();

            let total_turns: u32 = cache
                .iter()
                .filter(|(_, state)| !state.is_expired())
                .map(|(_, state)| state.turn_count)
                .sum();

            let total_tokens: u32 = cache
                .iter()
                .filter(|(_, state)| !state.is_expired())
                .map(|(_, state)| state.total_tokens)
                .sum();

            let avg_turns_per_conversation = if active_conversations > 0 {
                total_turns as f64 / active_conversations as f64
            } else {
                0.0
            };

            ConversationStats {
                active_conversations,
                total_turns,
                total_tokens,
                avg_turns_per_conversation,
            }
        } else {
            ConversationStats::default()
        }
    }

    /// Load conversation state from database.
    fn load_from_db(
        &self,
        db_path: &str,
        conversation_id: &str,
    ) -> Result<ConversationState, String> {
        let conn =
            Connection::open(db_path).map_err(|e| format!("Failed to open database: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT conversation_id, model, previous_response_id, messages, total_tokens,
                        context_tokens, max_context_tokens, turn_count, created_at, updated_at,
                        expires_at, metadata
                 FROM conversation_states
                 WHERE conversation_id = ?1",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let state = stmt
            .query_row(params![conversation_id], |row| {
                let messages_json: String = row.get(3)?;
                let messages: Vec<ChatMessage> =
                    serde_json::from_str(&messages_json).unwrap_or_default();

                let metadata_json: Option<String> = row.get(11)?;
                let metadata = metadata_json.and_then(|json| serde_json::from_str(&json).ok());

                Ok(ConversationState {
                    conversation_id: row.get(0)?,
                    model: row.get(1)?,
                    previous_response_id: row.get(2)?,
                    messages,
                    total_tokens: row.get::<_, i64>(4)? as u32,
                    context_tokens: row.get::<_, i64>(5)? as u32,
                    max_context_tokens: row.get::<_, i64>(6)? as u32,
                    turn_count: row.get::<_, i64>(7)? as u32,
                    created_at: parse_datetime(&row.get::<_, String>(8)?),
                    updated_at: parse_datetime(&row.get::<_, String>(9)?),
                    expires_at: parse_datetime(&row.get::<_, String>(10)?),
                    metadata,
                })
            })
            .map_err(|e| format!("Failed to query conversation state: {}", e))?;

        Ok(state)
    }

    /// Save conversation state to database.
    fn save_to_db(&self, db_path: &str, state: &ConversationState) -> SqlResult<()> {
        let conn = Connection::open(db_path)?;

        let messages_json =
            serde_json::to_string(&state.messages).unwrap_or_else(|_| "[]".to_string());
        let metadata_json = state
            .metadata
            .as_ref()
            .and_then(|m| serde_json::to_string(m).ok());

        conn.execute(
            "INSERT INTO conversation_states (
                conversation_id, model, previous_response_id, messages, total_tokens,
                context_tokens, max_context_tokens, turn_count, created_at, updated_at,
                expires_at, metadata
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            ON CONFLICT(conversation_id) DO UPDATE SET
                model = excluded.model,
                previous_response_id = excluded.previous_response_id,
                messages = excluded.messages,
                total_tokens = excluded.total_tokens,
                context_tokens = excluded.context_tokens,
                max_context_tokens = excluded.max_context_tokens,
                turn_count = excluded.turn_count,
                updated_at = excluded.updated_at,
                expires_at = excluded.expires_at,
                metadata = excluded.metadata",
            params![
                &state.conversation_id,
                &state.model,
                &state.previous_response_id,
                &messages_json,
                state.total_tokens as i64,
                state.context_tokens as i64,
                state.max_context_tokens as i64,
                state.turn_count as i64,
                to_sqlite_timestamp(state.created_at),
                to_sqlite_timestamp(state.updated_at),
                to_sqlite_timestamp(state.expires_at),
                metadata_json,
            ],
        )?;

        Ok(())
    }

    /// Delete conversation state from database.
    fn delete_from_db(&self, db_path: &str, conversation_id: &str) -> Result<(), String> {
        let conn =
            Connection::open(db_path).map_err(|e| format!("Failed to open database: {}", e))?;

        conn.execute(
            "DELETE FROM conversation_states WHERE conversation_id = ?1",
            params![conversation_id],
        )
        .map_err(|e| format!("Failed to delete conversation state: {}", e))?;

        Ok(())
    }

    /// Cleanup expired conversations from database.
    fn cleanup_expired_from_db(&self, db_path: &str) -> Result<usize, String> {
        let conn =
            Connection::open(db_path).map_err(|e| format!("Failed to open database: {}", e))?;

        let count = conn
            .execute(
                "DELETE FROM conversation_states WHERE expires_at <= CURRENT_TIMESTAMP",
                [],
            )
            .map_err(|e| format!("Failed to cleanup expired conversations: {}", e))?;

        Ok(count)
    }
}

/// Statistics about conversation state.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ConversationStats {
    pub active_conversations: usize,
    pub total_turns: u32,
    pub total_tokens: u32,
    pub avg_turns_per_conversation: f64,
}

/// Helper function to parse datetime from database.
fn parse_datetime(value: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(|_| {
            chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S")
                .map(|dt| dt.and_utc())
                .unwrap_or_else(|_| Utc::now())
        })
}

/// Helper function to convert datetime to SQLite timestamp.
fn to_sqlite_timestamp(dt: DateTime<Utc>) -> String {
    dt.format("%Y-%m-%d %H:%M:%S").to_string()
}

// Implement Default for ChatMessage if not already implemented
impl Default for ChatMessage {
    fn default() -> Self {
        Self {
            role: String::new(),
            content: String::new(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_conversation_state_creation() {
        let state =
            ConversationState::new("test_conv_1".to_string(), "gpt-5.2".to_string(), 4096, 24);

        assert_eq!(state.conversation_id, "test_conv_1");
        assert_eq!(state.model, "gpt-5.2");
        assert_eq!(state.turn_count, 0);
        assert_eq!(state.messages.len(), 0);
        assert!(!state.is_expired());
    }

    #[test]
    fn test_add_turn() {
        let mut state =
            ConversationState::new("test_conv_2".to_string(), "gpt-5.2".to_string(), 4096, 24);

        let request = LLMRequest::new(
            vec![ChatMessage {
                role: "user".to_string(),
                content: "Hello".to_string(),
                ..Default::default()
            }],
            "gpt-5.2".to_string(),
        );

        let response = LLMResponse {
            content: "Hi there!".to_string(),
            tokens: Some(100),
            prompt_tokens: Some(50),
            completion_tokens: Some(50),
            model: "gpt-5.2".to_string(),
            ..Default::default()
        };

        state.add_turn(&request, &response, Some("resp_123".to_string()));

        assert_eq!(state.turn_count, 1);
        assert_eq!(state.messages.len(), 2); // user + assistant
        assert_eq!(state.previous_response_id, Some("resp_123".to_string()));
        assert_eq!(state.total_tokens, 100);
        assert_eq!(state.context_tokens, 50);
    }

    #[test]
    fn test_context_pruning() {
        let mut state =
            ConversationState::new("test_conv_3".to_string(), "gpt-5.2".to_string(), 4096, 24);

        // Add many messages to exceed context
        for i in 0..100 {
            state.messages.push(ChatMessage {
                role: "user".to_string(),
                content: format!("Message {} with some content to use tokens", i),
                ..Default::default()
            });
        }

        state.context_tokens = 5000; // Exceeds 4096 limit
        state.prune_context(1000); // Prune to 1000 tokens

        // Should have fewer messages now
        assert!(state.messages.len() < 100);
        // Context should be reduced
        assert!(state.context_tokens < 5000);
    }

    #[test]
    fn test_conversation_manager() {
        let manager = ConversationStateManager::new(4096, 32000, None);

        let state = manager
            .get_or_create("test_conv_4", "gpt-5.2")
            .expect("Failed to create conversation");

        assert_eq!(state.conversation_id, "test_conv_4");
        assert_eq!(state.model, "gpt-5.2");

        // Should retrieve same conversation
        let state2 = manager
            .get_or_create("test_conv_4", "gpt-5.2")
            .expect("Failed to get conversation");

        assert_eq!(state.conversation_id, state2.conversation_id);
    }

    #[test]
    fn test_cleanup_expired() {
        let manager = ConversationStateManager::with_expiry(4096, 32000, None, -1); // Expire immediately

        // Create a conversation that will be expired
        let _ = manager
            .get_or_create("expired_conv", "gpt-5.2")
            .expect("Failed to create conversation");

        // Cleanup expired conversations
        let removed = manager
            .cleanup_expired()
            .expect("Failed to cleanup expired");

        assert_eq!(removed, 1);
    }

    #[test]
    fn test_conversation_stats() {
        let manager = ConversationStateManager::new(4096, 32000, None);

        // Create multiple conversations
        for i in 0..5 {
            let _ = manager
                .get_or_create(&format!("conv_{}", i), "gpt-5.2")
                .expect("Failed to create conversation");
        }

        let stats = manager.get_stats();
        assert_eq!(stats.active_conversations, 5);
    }
}
