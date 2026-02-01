# Conversation State Management

Comprehensive conversation state management system for multi-turn optimization, context tracking, and prompt caching.

## Features

### 1. Response ID Tracking
- Track response IDs across conversation turns
- Support for OpenAI Responses API `previous_response_id` parameter
- Automatic conversation continuity without redundant context

### 2. Context Window Management
- Automatic context pruning when exceeding limits
- Configurable context window sizes
- Smart message retention (system messages preserved)
- Token estimation for context sizing

### 3. Multi-turn Optimization
- Reuse previous context through response IDs
- Reduce redundant data transfer
- Leverage prompt caching automatically
- Lower API costs through context reuse

### 4. State Persistence
- SQLite database storage
- In-memory caching for performance
- Conversation resumption across sessions
- Automatic cleanup of expired conversations

### 5. Token Tracking
- Track total tokens used per conversation
- Monitor context token count
- Estimate remaining capacity
- Per-turn token usage tracking

## Architecture

```
ConversationStateManager
├── In-memory cache (RwLock<HashMap>)
├── SQLite persistence (optional)
└── ConversationState
    ├── conversation_id
    ├── model
    ├── previous_response_id
    ├── messages (Vec<ChatMessage>)
    ├── token counters
    └── metadata
```

## API Overview

### Core Types

```rust
// Conversation state for a single thread
pub struct ConversationState {
    pub conversation_id: String,
    pub model: String,
    pub previous_response_id: Option<String>,
    pub messages: Vec<ChatMessage>,
    pub total_tokens: u32,
    pub context_tokens: u32,
    pub max_context_tokens: u32,
    pub turn_count: u32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub metadata: Option<serde_json::Value>,
}

// Manager for state persistence and retrieval
pub struct ConversationStateManager {
    // Configuration and storage
}

// Statistics about conversation usage
pub struct ConversationStats {
    pub active_conversations: usize,
    pub total_turns: u32,
    pub total_tokens: u32,
    pub avg_turns_per_conversation: f64,
}
```

### Manager Methods

```rust
// Create a new manager
pub fn new(
    default_context_window: u32,
    max_context_window: u32,
    db_path: Option<String>,
) -> Self

// Get or create a conversation
pub fn get_or_create(
    &self,
    conversation_id: &str,
    model: &str,
) -> Result<ConversationState, String>

// Update conversation with new turn
pub fn update(
    &self,
    conversation_id: &str,
    request: &LLMRequest,
    response: &LLMResponse,
    response_id: Option<String>,
) -> Result<ConversationState, String>

// Get existing conversation
pub fn get(&self, conversation_id: &str) -> Option<ConversationState>

// Delete conversation
pub fn delete(&self, conversation_id: &str) -> Result<(), String>

// Cleanup expired conversations
pub fn cleanup_expired(&self) -> Result<usize, String>

// Get statistics
pub fn get_stats(&self) -> ConversationStats
```

### State Methods

```rust
impl ConversationState {
    // Add a new turn
    pub fn add_turn(
        &mut self,
        request: &LLMRequest,
        response: &LLMResponse,
        response_id: Option<String>,
    )

    // Prune context to target size
    pub fn prune_context(&mut self, target_tokens: u32)

    // Check if context exceeded
    pub fn exceeds_context_window(&self) -> bool

    // Check if expired
    pub fn is_expired(&self) -> bool

    // Extend expiration
    pub fn extend_expiry(&mut self, hours: i64)

    // Estimate tokens
    pub fn estimate_context_tokens(&self) -> u32
}
```

## LLM Request/Response Extensions

### LLMRequest Fields

```rust
pub struct LLMRequest {
    // ... existing fields ...

    /// Previous response ID for conversation continuity (OpenAI Responses API)
    pub previous_response_id: Option<String>,

    /// Conversation ID for state tracking across turns
    pub conversation_id: Option<String>,
}
```

### LLMResponse Fields

```rust
pub struct LLMResponse {
    // ... existing fields ...

    /// Response ID for conversation continuity (OpenAI Responses API)
    /// This ID can be used as previous_response_id in subsequent requests
    pub response_id: Option<String>,
}
```

## Provider Adapter Integration

### OpenAI Responses API

The `OpenAIAdapter` automatically handles conversation state:

```rust
// In adapt_to_responses_api():
if let Some(prev_response_id) = &request.previous_response_id {
    api_request["previous_response_id"] = serde_json::json!(prev_response_id);
}

// In adapt_from_responses_api():
let response_id = response["id"].as_str().map(|s| s.to_string());
// ... included in LLMResponse
```

### Chat Completions API

Also extracts response IDs for backward compatibility:

```rust
let response_id = response["id"].as_str().map(|s| s.to_string());
```

## Database Schema

```sql
CREATE TABLE conversation_states (
    conversation_id TEXT PRIMARY KEY,
    model TEXT NOT NULL,
    previous_response_id TEXT,
    messages TEXT NOT NULL,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    context_tokens INTEGER NOT NULL DEFAULT 0,
    max_context_tokens INTEGER NOT NULL DEFAULT 4096,
    turn_count INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    metadata TEXT
);
```

### Indexes

- `idx_conversation_states_id` - Fast lookup
- `idx_conversation_states_expires_at` - Cleanup
- `idx_conversation_states_model` - Filtering by model
- `idx_conversation_states_updated_at` - Sorting by activity

### Views

- `conversation_state_stats` - Overall statistics
- `conversation_state_by_model` - Per-model analytics

## Usage Workflow

```
1. User sends first message
   ↓
2. Create conversation state
   ↓
3. Send LLM request
   ↓
4. Receive response with response_id
   ↓
5. Update conversation state
   ↓
6. User sends second message
   ↓
7. Retrieve conversation state
   ↓
8. Set previous_response_id from state
   ↓
9. Send LLM request (with previous_response_id)
   ↓
10. OpenAI uses previous context (cached)
   ↓
11. Receive response (reduced cost/latency)
   ↓
12. Update conversation state
   ↓
13. Repeat for subsequent turns
```

## Benefits

### Cost Reduction
- Prompt caching reduces API costs
- Context reuse minimizes redundant token usage
- Automatic pruning prevents oversized contexts

### Performance
- In-memory caching for fast access
- Reduced latency through context reuse
- Efficient database queries with indexes

### Reliability
- Persistent state across sessions
- Automatic cleanup of expired data
- Error handling and recovery

### Developer Experience
- Simple API for complex functionality
- Automatic state management
- Comprehensive examples and tests

## Configuration

### Default Settings

```rust
// Default context window: 4096 tokens
// Maximum before pruning: 32000 tokens
// Expiry: 24 hours
// Database: Optional

let manager = ConversationStateManager::new(4096, 32000, None);
```

### Custom Settings

```rust
// Larger context for long conversations
let manager = ConversationStateManager::new(
    8192,    // Default window
    128000,  // Max window (for GPT-4 Turbo)
    Some(db_path)
);

// Custom expiry for short-lived sessions
let manager = ConversationStateManager::with_expiry(
    4096,
    32000,
    Some(db_path),
    1  // Expire after 1 hour
);
```

## Testing

Comprehensive test suite included:

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn test_conversation_state_creation() { /* ... */ }

    #[test]
    fn test_add_turn() { /* ... */ }

    #[test]
    fn test_context_pruning() { /* ... */ }

    #[test]
    fn test_conversation_manager() { /* ... */ }

    #[test]
    fn test_cleanup_expired() { /* ... */ }

    #[test]
    fn test_conversation_stats() { /* ... */ }
}
```

## Future Enhancements

- [ ] Conversation branching support
- [ ] Message editing with state updates
- [ ] Export/import conversation state
- [ ] Compression for large conversations
- [ ] Semantic search across conversations
- [ ] Conversation analytics dashboard
- [ ] Multi-modal conversation support
- [ ] Conversation templates

## References

- [OpenAI Responses API Documentation](https://platform.openai.com/docs/api-reference/responses)
- [OpenAI Conversation State Guide](https://platform.openai.com/docs/guides/conversation-state)
- [Prompt Caching Best Practices](https://platform.openai.com/docs/guides/prompt-caching)
- [Context Window Management](https://platform.openai.com/docs/guides/context-window)

## Migration Guide

### From Legacy Chat System

```rust
// Before
let response = send_message(&messages, &model).await?;

// After
let conversation_id = format!("user_{}_session_{}", user_id, session_id);
let mut request = LLMRequest::new(messages, model);
request.conversation_id = Some(conversation_id.clone());

// Get previous context
if let Some(state) = manager.get(&conversation_id) {
    request.previous_response_id = state.previous_response_id;
}

let response = send_message(&request).await?;

// Update state
manager.update(&conversation_id, &request, &response, response.response_id.clone())?;
```

## Contributing

When modifying conversation state:

1. Update tests in `conversation_state.rs`
2. Update examples in `conversation_state_examples.md`
3. Update this README
4. Run full test suite: `cargo test --package agiworkforce`
5. Check clippy: `cargo clippy -- -D warnings`
