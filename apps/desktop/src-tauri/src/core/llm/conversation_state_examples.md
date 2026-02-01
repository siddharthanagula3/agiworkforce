# Conversation State Management Examples

This document provides examples of using the conversation state management system for multi-turn optimization and context tracking.

## Overview

The conversation state management system provides:

1. **Response ID Tracking** - Track response IDs across turns for conversation continuity
2. **Context Window Management** - Automatic context pruning when exceeding limits
3. **Multi-turn Optimization** - Reduce redundant data transfer using prompt caching
4. **State Persistence** - Save and resume conversations across sessions
5. **Token Tracking** - Monitor token usage and context size

## Basic Usage

### Creating a Conversation State Manager

```rust
use crate::core::llm::conversation_state::ConversationStateManager;

// Create manager with default settings
let manager = ConversationStateManager::new(
    4096,        // Default context window (tokens)
    32000,       // Maximum context window before pruning (tokens)
    Some("/path/to/database.db".to_string())  // Optional database path
);

// Create with custom expiry
let manager = ConversationStateManager::with_expiry(
    4096,
    32000,
    Some("/path/to/database.db".to_string()),
    48  // Expire conversations after 48 hours
);
```

### Single Turn Conversation

```rust
use crate::core::llm::{LLMRequest, LLMResponse, ChatMessage};

// Create a request
let mut request = LLMRequest::new(
    vec![ChatMessage {
        role: "user".to_string(),
        content: "Hello, how are you?".to_string(),
        ..Default::default()
    }],
    "gpt-5.2".to_string()
);

// Set conversation ID
request.conversation_id = Some("user_123_session_456".to_string());

// Send request (your LLM provider call)
let response: LLMResponse = send_llm_request(&request).await?;

// Update conversation state
if let Some(conversation_id) = &request.conversation_id {
    manager.update(
        conversation_id,
        &request,
        &response,
        response.response_id.clone()
    )?;
}
```

### Multi-Turn Conversation

```rust
// First turn
let conversation_id = "user_123_session_456";
let mut request1 = LLMRequest::new(
    vec![ChatMessage {
        role: "user".to_string(),
        content: "Explain quantum computing".to_string(),
        ..Default::default()
    }],
    "gpt-5.2".to_string()
);
request1.conversation_id = Some(conversation_id.to_string());

let response1 = send_llm_request(&request1).await?;
manager.update(conversation_id, &request1, &response1, response1.response_id.clone())?;

// Second turn - includes previous_response_id for optimization
let state = manager.get(conversation_id).unwrap();
let mut request2 = LLMRequest::new(
    vec![ChatMessage {
        role: "user".to_string(),
        content: "Can you give me a simple example?".to_string(),
        ..Default::default()
    }],
    "gpt-5.2".to_string()
);
request2.conversation_id = Some(conversation_id.to_string());
request2.previous_response_id = state.previous_response_id.clone();

let response2 = send_llm_request(&request2).await?;
manager.update(conversation_id, &request2, &response2, response2.response_id.clone())?;

// The second request will leverage prompt caching and context reuse
```

### Context Window Management

```rust
// Get current conversation state
let state = manager.get_or_create("conversation_123", "gpt-5.2")?;

println!("Current context tokens: {}", state.context_tokens);
println!("Max context tokens: {}", state.max_context_tokens);
println!("Message count: {}", state.message_count());

// Check if context is too large
if state.exceeds_context_window() {
    // Automatic pruning will happen on next update
    println!("Context window exceeded, will prune on next update");
}

// Manually prune to a specific size
let mut state = state;
state.prune_context(2000); // Keep only ~2000 tokens of context
```

### Conversation Statistics

```rust
// Get overall statistics
let stats = manager.get_stats();
println!("Active conversations: {}", stats.active_conversations);
println!("Total turns: {}", stats.total_turns);
println!("Total tokens used: {}", stats.total_tokens);
println!("Avg turns per conversation: {:.2}", stats.avg_turns_per_conversation);

// List all active conversations
let conversation_ids = manager.list_conversations();
for id in conversation_ids {
    if let Some(state) = manager.get(&id) {
        println!("Conversation {}: {} turns, {} tokens",
                 id, state.turn_count, state.total_tokens);
    }
}
```

### Cleanup and Maintenance

```rust
// Remove expired conversations
let removed_count = manager.cleanup_expired()?;
println!("Cleaned up {} expired conversations", removed_count);

// Delete a specific conversation
manager.delete("conversation_123")?;
```

## OpenAI Responses API Integration

The conversation state system is designed to work seamlessly with OpenAI's Responses API:

```rust
use crate::core::llm::provider_adapter::{ProviderAdapter, OpenAIAdapter};

// Create adapter
let adapter = OpenAIAdapter::new();

// First turn
let mut request = LLMRequest::new(messages, "gpt-5.2".to_string());
request.conversation_id = Some("conv_123".to_string());

// Adapter will include previous_response_id if present
let api_request = adapter.adapt_request(&request)?;

// Send to OpenAI
let response = client.post("https://api.openai.com/v1/responses")
    .json(&api_request)
    .send()
    .await?
    .json::<Value>()
    .await?;

// Parse response
let llm_response = adapter.adapt_response(&response)?;

// The response will include response_id
assert!(llm_response.response_id.is_some());

// Update conversation state
manager.update(
    "conv_123",
    &request,
    &llm_response,
    llm_response.response_id.clone()
)?;

// Second turn - automatically includes previous_response_id
let state = manager.get("conv_123").unwrap();
let mut request2 = LLMRequest::new(messages2, "gpt-5.2".to_string());
request2.conversation_id = Some("conv_123".to_string());
request2.previous_response_id = state.previous_response_id;

// OpenAI will use the previous response for context, reducing costs
let api_request2 = adapter.adapt_request(&request2)?;
// api_request2 now contains: { "previous_response_id": "resp_...", ... }
```

## Advanced Features

### Custom Metadata

```rust
let mut state = manager.get_or_create("conv_123", "gpt-5.2")?;

// Add custom metadata
state.metadata = Some(serde_json::json!({
    "user_id": "user_123",
    "session_type": "coding_assistance",
    "priority": "high",
    "tags": ["rust", "backend", "optimization"]
}));

// Persist the updated state
manager.update("conv_123", &request, &response, response.response_id.clone())?;
```

### Context Preservation

```rust
// Extend conversation expiry when user is actively engaged
if let Some(mut state) = manager.get("conv_123") {
    state.extend_expiry(24); // Extend by 24 hours
}
```

### Token Estimation

```rust
let state = manager.get("conv_123").unwrap();

// Get estimated context size
let estimated_tokens = state.estimate_context_tokens();
println!("Estimated context: {} tokens", estimated_tokens);

// Check remaining capacity
let remaining = state.max_context_tokens - state.context_tokens;
println!("Remaining capacity: {} tokens", remaining);
```

## Database Schema

The conversation states are stored in SQLite with the following schema:

```sql
CREATE TABLE conversation_states (
    conversation_id TEXT PRIMARY KEY,
    model TEXT NOT NULL,
    previous_response_id TEXT,
    messages TEXT NOT NULL, -- JSON array
    total_tokens INTEGER NOT NULL DEFAULT 0,
    context_tokens INTEGER NOT NULL DEFAULT 0,
    max_context_tokens INTEGER NOT NULL DEFAULT 4096,
    turn_count INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    metadata TEXT -- JSON object
);
```

## Performance Considerations

1. **In-Memory Cache**: Frequently accessed conversations are cached in memory
2. **Lazy Loading**: Conversations are only loaded from database when needed
3. **Automatic Pruning**: Context is automatically pruned to stay within limits
4. **Batch Cleanup**: Use `cleanup_expired()` periodically to remove old conversations

## Error Handling

```rust
use std::error::Error;

fn handle_conversation(
    manager: &ConversationStateManager,
    conversation_id: &str
) -> Result<(), Box<dyn Error>> {
    // Safe operations with error handling
    let state = manager.get_or_create(conversation_id, "gpt-5.2")
        .map_err(|e| format!("Failed to get/create conversation: {}", e))?;

    // Update with proper error handling
    manager.update(conversation_id, &request, &response, response_id)
        .map_err(|e| format!("Failed to update conversation: {}", e))?;

    Ok(())
}
```

## Best Practices

1. **Use Consistent IDs**: Use a consistent format for conversation IDs (e.g., `user_{user_id}_session_{session_id}`)
2. **Set Reasonable Limits**: Configure context windows based on model capabilities
3. **Monitor Token Usage**: Track token consumption to optimize costs
4. **Regular Cleanup**: Run `cleanup_expired()` periodically (e.g., daily cron job)
5. **Preserve Context**: Extend expiry for active conversations
6. **Test Pruning**: Verify context pruning logic preserves important messages

## Integration with Chat Commands

```rust
#[tauri::command]
async fn send_chat_message(
    conversation_id: String,
    message: String,
    state_manager: tauri::State<'_, ConversationStateManager>,
) -> Result<LLMResponse, String> {
    // Get conversation state
    let conv_state = state_manager.get_or_create(&conversation_id, "gpt-5.2")?;

    // Create request with previous_response_id
    let mut request = LLMRequest::new(
        vec![ChatMessage {
            role: "user".to_string(),
            content: message,
            ..Default::default()
        }],
        "gpt-5.2".to_string()
    );
    request.conversation_id = Some(conversation_id.clone());
    request.previous_response_id = conv_state.previous_response_id;

    // Send to LLM
    let response = send_llm_request(&request).await?;

    // Update state
    state_manager.update(
        &conversation_id,
        &request,
        &response,
        response.response_id.clone()
    )?;

    Ok(response)
}
```

## Testing

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_multi_turn_conversation() {
        let manager = ConversationStateManager::new(4096, 32000, None);
        let conv_id = "test_conv";

        // First turn
        let request1 = create_test_request("Hello");
        let response1 = create_test_response("Hi there!", Some("resp_1".to_string()));
        manager.update(conv_id, &request1, &response1, response1.response_id.clone()).unwrap();

        // Verify state
        let state = manager.get(conv_id).unwrap();
        assert_eq!(state.turn_count, 1);
        assert_eq!(state.previous_response_id, Some("resp_1".to_string()));

        // Second turn with context
        let mut request2 = create_test_request("Tell me more");
        request2.previous_response_id = state.previous_response_id;
        let response2 = create_test_response("Sure!", Some("resp_2".to_string()));
        manager.update(conv_id, &request2, &response2, response2.response_id.clone()).unwrap();

        // Verify updated state
        let state = manager.get(conv_id).unwrap();
        assert_eq!(state.turn_count, 2);
        assert_eq!(state.previous_response_id, Some("resp_2".to_string()));
    }
}
```
