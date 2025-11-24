-- Migration: Add Advanced Features Tables
-- Version: 002_advanced_features
-- Date: 2024-11-24

-- Tool Executions Table
CREATE TABLE IF NOT EXISTS tool_executions (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    parameters TEXT NOT NULL, -- JSON
    status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')),
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    result TEXT, -- JSON
    error TEXT,
    can_be_paused BOOLEAN DEFAULT 0,
    is_paused BOOLEAN DEFAULT 0,
    progress INTEGER DEFAULT 0, -- 0-100
    log_entries TEXT, -- JSON array of log messages
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX idx_tool_executions_conversation ON tool_executions(conversation_id);
CREATE INDEX idx_tool_executions_status ON tool_executions(status);
CREATE INDEX idx_tool_executions_started_at ON tool_executions(started_at DESC);

-- File Metadata Table
CREATE TABLE IF NOT EXISTS file_metadata (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    message_id TEXT,
    name TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    path TEXT NOT NULL,
    thumbnail_path TEXT,
    extracted_text TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX idx_file_metadata_conversation ON file_metadata(conversation_id);
CREATE INDEX idx_file_metadata_message ON file_metadata(message_id);
CREATE INDEX idx_file_metadata_mime_type ON file_metadata(mime_type);
CREATE INDEX idx_file_metadata_created_at ON file_metadata(created_at DESC);

-- File Tags Table
CREATE TABLE IF NOT EXISTS file_tags (
    file_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (file_id, tag),
    FOREIGN KEY (file_id) REFERENCES file_metadata(id) ON DELETE CASCADE
);

CREATE INDEX idx_file_tags_tag ON file_tags(tag);

-- Message Drafts Table
CREATE TABLE IF NOT EXISTS message_drafts (
    conversation_id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    attachments TEXT, -- JSON array of file IDs
    focus_mode TEXT,
    saved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Approval Settings Table
CREATE TABLE IF NOT EXISTS approval_settings (
    key TEXT PRIMARY KEY, -- conversation_id or tool_name
    type TEXT NOT NULL CHECK(type IN ('conversation', 'tool')),
    settings TEXT NOT NULL, -- JSON
    expires_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_approval_settings_type ON approval_settings(type);
CREATE INDEX idx_approval_settings_expires_at ON approval_settings(expires_at);

-- Execution Plans Table
CREATE TABLE IF NOT EXISTS execution_plans (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    steps TEXT NOT NULL, -- JSON array of PlanStep
    current_step INTEGER DEFAULT 0,
    status TEXT NOT NULL CHECK(status IN ('draft', 'running', 'paused', 'completed', 'failed', 'cancelled')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    completed_at DATETIME,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX idx_execution_plans_conversation ON execution_plans(conversation_id);
CREATE INDEX idx_execution_plans_status ON execution_plans(status);
CREATE INDEX idx_execution_plans_created_at ON execution_plans(created_at DESC);

-- Search Metadata Table (for tracking indexed content)
CREATE TABLE IF NOT EXISTS search_metadata (
    document_id TEXT PRIMARY KEY, -- conversation_id or message_id
    document_type TEXT NOT NULL CHECK(document_type IN ('conversation', 'message')),
    indexed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    word_count INTEGER DEFAULT 0
);

CREATE INDEX idx_search_metadata_type ON search_metadata(document_type);
CREATE INDEX idx_search_metadata_indexed_at ON search_metadata(indexed_at DESC);

-- User Preferences for Advanced Features
CREATE TABLE IF NOT EXISTS feature_preferences (
    user_id TEXT NOT NULL,
    feature_key TEXT NOT NULL,
    value TEXT NOT NULL, -- JSON
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, feature_key)
);

-- Suggestion History (for learning)
CREATE TABLE IF NOT EXISTS suggestion_history (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    suggestion_text TEXT NOT NULL,
    context TEXT, -- JSON
    accepted BOOLEAN DEFAULT 0,
    used_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX idx_suggestion_history_conversation ON suggestion_history(conversation_id);
CREATE INDEX idx_suggestion_history_accepted ON suggestion_history(accepted);

-- Triggers for updated_at timestamps
CREATE TRIGGER IF NOT EXISTS update_file_metadata_timestamp 
AFTER UPDATE ON file_metadata
BEGIN
    UPDATE file_metadata SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_approval_settings_timestamp 
AFTER UPDATE ON approval_settings
BEGIN
    UPDATE approval_settings SET updated_at = CURRENT_TIMESTAMP WHERE key = NEW.key;
END;

CREATE TRIGGER IF NOT EXISTS update_execution_plans_timestamp 
AFTER UPDATE ON execution_plans
BEGIN
    UPDATE execution_plans SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
