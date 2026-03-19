//! Agent-callable conversation search tools.
//!
//! Provides two high-level operations modeled after Claude's built-in
//! `conversation_search` and `recent_chats` tools:
//!
//! - **`search_past_conversations`** — FTS5 keyword search across all chat
//!   messages, returning ranked results with conversation context.
//! - **`get_recent_conversations`** — Retrieve the N most recently updated
//!   conversations with title, timestamp, and message count.
//!
//! Both functions operate on the same SQLite database used by the chat module
//! and are designed to be called from the agent tool executor or via Tauri
//! commands from the frontend.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// A single result returned by `search_past_conversations`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationSearchResult {
    /// Numeric ID of the conversation.
    pub conversation_id: i64,
    /// Human-readable title of the conversation.
    pub conversation_title: String,
    /// Short excerpt of the matching message with context.
    pub message_preview: String,
    /// Role of the message sender: "user", "assistant", or "system".
    pub sender: String,
    /// ISO-8601 creation timestamp of the matching message.
    pub timestamp: String,
    /// BM25 relevance score (lower = more relevant in FTS5 convention).
    /// Negated here so higher = more relevant for the consumer.
    pub relevance_score: f64,
}

/// A recent conversation summary returned by `get_recent_conversations`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationSummary {
    /// Numeric ID of the conversation.
    pub conversation_id: i64,
    /// Human-readable title.
    pub title: String,
    /// ISO-8601 timestamp of the most recent update.
    pub timestamp: String,
    /// Total number of messages in this conversation.
    pub message_count: i64,
}

// ---------------------------------------------------------------------------
// FTS query helpers (re-used from chat/search.rs pattern)
// ---------------------------------------------------------------------------

/// Escape a single term for safe use inside an FTS5 MATCH expression.
fn escape_fts_term(term: &str) -> String {
    let escaped = term.trim().replace('"', "\"\"");
    format!("\"{escaped}\"")
}

/// Build a literal FTS5 query by quoting each word and joining with `AND`.
fn build_fts_query(query: &str) -> Result<String, String> {
    let terms: Vec<String> = query
        .split(|c: char| c.is_whitespace() || c.is_ascii_punctuation())
        .filter(|t| !t.is_empty())
        .map(escape_fts_term)
        .collect();

    if terms.is_empty() {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Err("Search query contains no searchable words".to_string());
        }
        return Ok(escape_fts_term(trimmed));
    }

    Ok(terms.join(" AND "))
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/// Search past conversations for messages matching `query`.
///
/// Uses the `messages_fts` FTS5 table joined with `messages` and
/// `conversations` for metadata. Results are ranked by BM25 relevance.
///
/// If `conversation_id` is provided, results are scoped to that single
/// conversation. Otherwise all conversations are searched.
pub fn search_past_conversations(
    conn: &Connection,
    query: &str,
    limit: Option<usize>,
    conversation_id: Option<i64>,
) -> Result<Vec<ConversationSearchResult>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Err("Search query cannot be empty".to_string());
    }

    let fts_query = build_fts_query(trimmed)?;
    let effective_limit = limit.unwrap_or(5).clamp(1, 50) as i64;

    // Guard: make sure FTS5 table exists
    let fts_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='messages_fts'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;

    if !fts_exists {
        tracing::warn!(
            "search_past_conversations: messages_fts table not found; returning empty results"
        );
        return Ok(Vec::new());
    }

    let (sql, use_conv_filter) = if conversation_id.is_some() {
        (
            "SELECT
                CAST(f.conversation_id AS INTEGER) AS conversation_id,
                COALESCE(c.title, 'Untitled')      AS conversation_title,
                snippet(messages_fts, 2, '[', ']', '...', 24) AS message_preview,
                f.sender                            AS sender,
                m.created_at                        AS created_at,
                bm25(messages_fts)                  AS rank
            FROM messages_fts f
            JOIN messages      m ON m.id  = CAST(f.message_id      AS INTEGER)
            JOIN conversations c ON c.id  = CAST(f.conversation_id AS INTEGER)
            WHERE messages_fts MATCH ?1
              AND CAST(f.conversation_id AS INTEGER) = ?3
            ORDER BY rank
            LIMIT ?2"
                .to_string(),
            true,
        )
    } else {
        (
            "SELECT
                CAST(f.conversation_id AS INTEGER) AS conversation_id,
                COALESCE(c.title, 'Untitled')      AS conversation_title,
                snippet(messages_fts, 2, '[', ']', '...', 24) AS message_preview,
                f.sender                            AS sender,
                m.created_at                        AS created_at,
                bm25(messages_fts)                  AS rank
            FROM messages_fts f
            JOIN messages      m ON m.id  = CAST(f.message_id      AS INTEGER)
            JOIN conversations c ON c.id  = CAST(f.conversation_id AS INTEGER)
            WHERE messages_fts MATCH ?1
            ORDER BY rank
            LIMIT ?2"
                .to_string(),
            false,
        )
    };

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Failed to prepare conversation search: {e}"))?;

    let rows: Vec<ConversationSearchResult> = if use_conv_filter {
        let conv_id = conversation_id.unwrap_or(0);
        stmt.query_map(
            rusqlite::params![fts_query, effective_limit, conv_id],
            map_search_row,
        )
        .map_err(|e| format!("Conversation search failed: {e}"))?
        .filter_map(|r| r.ok())
        .collect()
    } else {
        stmt.query_map(
            rusqlite::params![fts_query, effective_limit],
            map_search_row,
        )
        .map_err(|e| format!("Conversation search failed: {e}"))?
        .filter_map(|r| r.ok())
        .collect()
    };

    Ok(rows)
}

/// Return the N most recently updated conversations with message counts.
pub fn get_recent_conversations(
    conn: &Connection,
    limit: Option<usize>,
) -> Result<Vec<ConversationSummary>, String> {
    let effective_limit = limit.unwrap_or(10).clamp(1, 50) as i64;

    let sql = "
        SELECT
            c.id                         AS conversation_id,
            COALESCE(c.title, 'Untitled') AS title,
            c.updated_at                 AS updated_at,
            COUNT(m.id)                  AS message_count
        FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.id
        GROUP BY c.id
        ORDER BY c.updated_at DESC
        LIMIT ?1
    ";

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("Failed to prepare recent conversations query: {e}"))?;

    let rows: Vec<ConversationSummary> = stmt
        .query_map(rusqlite::params![effective_limit], |row| {
            Ok(ConversationSummary {
                conversation_id: row.get(0)?,
                title: row.get(1)?,
                timestamp: row.get(2)?,
                message_count: row.get(3)?,
            })
        })
        .map_err(|e| format!("Recent conversations query failed: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

fn map_search_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ConversationSearchResult> {
    let rank: f64 = row.get(5)?;
    Ok(ConversationSearchResult {
        conversation_id: row.get(0)?,
        conversation_title: row.get(1)?,
        message_preview: row.get(2)?,
        sender: row.get(3)?,
        timestamp: row.get(4)?,
        // FTS5 bm25() returns negative values (lower = more relevant).
        // Negate so higher = more relevant for the consumer.
        relevance_score: -rank,
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory db");

        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL DEFAULT 'test',
                title TEXT NOT NULL DEFAULT 'Untitled',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL,
                user_id TEXT NOT NULL DEFAULT 'test',
                role TEXT NOT NULL DEFAULT 'user',
                content TEXT NOT NULL DEFAULT '',
                tokens INTEGER DEFAULT 0,
                cost REAL DEFAULT 0.0,
                provider TEXT,
                model TEXT,
                parent_message_id INTEGER,
                branch_id TEXT DEFAULT 'main',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
                message_id UNINDEXED,
                conversation_id UNINDEXED,
                content,
                sender UNINDEXED,
                message_type UNINDEXED,
                timestamp UNINDEXED,
                tokenize = 'porter unicode61 remove_diacritics 2'
            );
            ",
        )
        .expect("schema setup");

        conn
    }

    fn insert_conversation(conn: &Connection, title: &str) -> i64 {
        conn.execute(
            "INSERT INTO conversations (user_id, title) VALUES ('test', ?1)",
            rusqlite::params![title],
        )
        .expect("insert conversation");
        conn.last_insert_rowid()
    }

    fn insert_message(conn: &Connection, conv_id: i64, role: &str, content: &str) {
        conn.execute(
            "INSERT INTO messages (conversation_id, user_id, role, content) VALUES (?1, 'test', ?2, ?3)",
            rusqlite::params![conv_id, role, content],
        )
        .expect("insert message");
        let msg_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO messages_fts (message_id, conversation_id, content, sender, message_type, timestamp)
             VALUES (?1, ?2, ?3, ?4, 'text', datetime('now'))",
            rusqlite::params![msg_id.to_string(), conv_id.to_string(), content, role],
        )
        .expect("index message");
    }

    #[test]
    fn search_finds_matching_messages() {
        let conn = setup_test_db();
        let conv_id = insert_conversation(&conn, "Rust Discussion");
        insert_message(&conn, conv_id, "user", "How do I use async await in Rust?");
        insert_message(
            &conn,
            conv_id,
            "assistant",
            "You can use async/await with tokio runtime.",
        );

        let results = search_past_conversations(&conn, "async await", None, None).unwrap();
        assert!(!results.is_empty());
        assert_eq!(results[0].conversation_title, "Rust Discussion");
    }

    #[test]
    fn search_scoped_to_conversation() {
        let conn = setup_test_db();
        let conv1 = insert_conversation(&conn, "Conversation A");
        let conv2 = insert_conversation(&conn, "Conversation B");
        insert_message(&conn, conv1, "user", "alpha beta gamma");
        insert_message(&conn, conv2, "user", "alpha delta epsilon");

        let results =
            search_past_conversations(&conn, "alpha", Some(5), Some(conv1)).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].conversation_id, conv1);
    }

    #[test]
    fn search_empty_query_returns_error() {
        let conn = setup_test_db();
        let result = search_past_conversations(&conn, "   ", None, None);
        assert!(result.is_err());
    }

    #[test]
    fn recent_conversations_returns_ordered() {
        let conn = setup_test_db();
        let conv1 = insert_conversation(&conn, "Older Chat");
        insert_message(&conn, conv1, "user", "hello");

        // Make conv2 more recent by updating its timestamp
        let conv2 = insert_conversation(&conn, "Newer Chat");
        insert_message(&conn, conv2, "user", "world");
        conn.execute(
            "UPDATE conversations SET updated_at = datetime('now', '+1 minute') WHERE id = ?1",
            rusqlite::params![conv2],
        )
        .unwrap();

        let results = get_recent_conversations(&conn, Some(10)).unwrap();
        assert!(results.len() >= 2);
        // Most recent first
        assert_eq!(results[0].title, "Newer Chat");
    }

    #[test]
    fn recent_conversations_includes_message_count() {
        let conn = setup_test_db();
        let conv_id = insert_conversation(&conn, "Counting Messages");
        insert_message(&conn, conv_id, "user", "message 1");
        insert_message(&conn, conv_id, "assistant", "message 2");
        insert_message(&conn, conv_id, "user", "message 3");

        let results = get_recent_conversations(&conn, Some(10)).unwrap();
        let found = results
            .iter()
            .find(|r| r.conversation_id == conv_id)
            .expect("conversation not found");
        assert_eq!(found.message_count, 3);
    }
}
