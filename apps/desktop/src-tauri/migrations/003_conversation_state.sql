-- Migration: Add Conversation State Management
-- Version: 003_conversation_state
-- Date: 2026-02-01
-- Purpose: Add conversation state tracking for multi-turn optimization and context management

-- Conversation States Table
-- Stores conversation state for multi-turn optimization, context tracking, and prompt caching
CREATE TABLE IF NOT EXISTS conversation_states (
    conversation_id TEXT PRIMARY KEY,
    model TEXT NOT NULL,
    previous_response_id TEXT, -- Response ID from previous turn (OpenAI Responses API)
    messages TEXT NOT NULL, -- JSON array of ChatMessage objects
    total_tokens INTEGER NOT NULL DEFAULT 0,
    context_tokens INTEGER NOT NULL DEFAULT 0,
    max_context_tokens INTEGER NOT NULL DEFAULT 4096,
    turn_count INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    metadata TEXT -- JSON object for custom extensions
);

-- Index for fast lookup by conversation_id
CREATE INDEX idx_conversation_states_id ON conversation_states(conversation_id);

-- Index for cleanup of expired states
CREATE INDEX idx_conversation_states_expires_at ON conversation_states(expires_at);

-- Index for querying by model
CREATE INDEX idx_conversation_states_model ON conversation_states(model);

-- Index for sorting by last activity
CREATE INDEX idx_conversation_states_updated_at ON conversation_states(updated_at DESC);

-- Conversation State Analytics View
-- Provides statistics on conversation state usage
CREATE VIEW IF NOT EXISTS conversation_state_stats AS
SELECT
    COUNT(*) as total_conversations,
    SUM(turn_count) as total_turns,
    SUM(total_tokens) as total_tokens_used,
    AVG(turn_count) as avg_turns_per_conversation,
    AVG(total_tokens) as avg_tokens_per_conversation,
    AVG(context_tokens) as avg_context_tokens,
    COUNT(CASE WHEN previous_response_id IS NOT NULL THEN 1 END) as conversations_with_context
FROM conversation_states
WHERE expires_at > CURRENT_TIMESTAMP;

-- Model-specific conversation stats
CREATE VIEW IF NOT EXISTS conversation_state_by_model AS
SELECT
    model,
    COUNT(*) as conversation_count,
    SUM(turn_count) as total_turns,
    SUM(total_tokens) as total_tokens,
    AVG(turn_count) as avg_turns,
    AVG(total_tokens) as avg_tokens
FROM conversation_states
WHERE expires_at > CURRENT_TIMESTAMP
GROUP BY model
ORDER BY conversation_count DESC;
