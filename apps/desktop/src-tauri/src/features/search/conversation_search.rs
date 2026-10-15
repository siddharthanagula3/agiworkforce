//! Agent-callable conversation search tools.
//!
//! Provides two high-level operations modeled after Claude's built-in
//! `conversation_search` and `recent_chats` tools:
//!
//! - **`search_past_conversations`**, FTS5 keyword search across all chat
//!   messages, returning ranked results with conversation context.
//! - **`get_recent_conversations`**, Retrieve the N most recently updated
//!   conversations with title, timestamp, and message count.
//!
//! Both functions operate on the same SQLite database used by the chat module
//! and are designed to be called from the agent tool executor or via Tauri
//! commands from the frontend.
//!
//! Every query takes a [`ConversationScope`]. The database holds every local
//! account's chats on every execution boundary; an unscoped query lists another
//! account's chats and hands one boundary's history to another's provider.

use crate::sys::commands::chat::ChatExecutionMode;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

const EXECUTION_BOUNDARIES: [ChatExecutionMode; 3] = [
    ChatExecutionMode::LocalOnly,
    ChatExecutionMode::Byok,
    ChatExecutionMode::CloudManaged,
];

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

/// The account and the execution boundaries a query may read.
///
/// Local-only and BYOK chats share the device's storage and the `local` app
/// mode, so the app mode alone would hand a Local-only chat to the third-party
/// provider answering a BYOK one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConversationScope {
    user_id: String,
    app_mode: &'static str,
    execution_modes: [Option<&'static str>; 3],
}

impl ConversationScope {
    /// `execution_modes` must sit on one side of storage: Local-only and BYOK
    /// chats are kept on the device, Managed Cloud chats are not.
    pub fn new(user_id: &str, execution_modes: &[ChatExecutionMode]) -> Result<Self, String> {
        let user_id = user_id.trim();
        if user_id.is_empty() {
            return Err("Conversation search needs the signed-in user".to_string());
        }
        let Some(first) = execution_modes.first() else {
            return Err("Conversation search needs an execution boundary".to_string());
        };
        let on_device = first.uses_local_storage();
        if execution_modes
            .iter()
            .any(|mode| mode.uses_local_storage() != on_device)
        {
            return Err("Conversation search cannot span Local and Cloud history".to_string());
        }
        Ok(Self {
            user_id: user_id.to_string(),
            app_mode: if on_device { "local" } else { "cloud" },
            execution_modes: EXECUTION_BOUNDARIES
                .map(|mode| execution_modes.contains(&mode).then_some(mode.as_str())),
        })
    }

    /// The scope of the conversation a turn is running in: the same account on
    /// the same execution boundary, so a model reads only history the person
    /// already agreed to send where this turn is going.
    pub fn of_conversation(conn: &Connection, conversation_id: i64) -> Result<Self, String> {
        let (user_id, stored_mode): (String, String) = conn
            .query_row(
                "SELECT user_id, execution_mode FROM conversations WHERE id = ?1",
                rusqlite::params![conversation_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| format!("Could not read the running conversation: {e}"))?;
        let execution_mode = EXECUTION_BOUNDARIES
            .into_iter()
            .find(|mode| mode.as_str() == stored_mode)
            .ok_or_else(|| {
                format!("The running conversation has an unknown execution boundary: {stored_mode}")
            })?;
        Self::new(&user_id, &[execution_mode])
    }
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
/// If `conversation_id` is provided, results are narrowed to that single
/// conversation. Otherwise every conversation inside `scope` is searched.
pub fn search_past_conversations(
    conn: &Connection,
    scope: &ConversationScope,
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
              AND m.superseded_key IS NULL
              AND c.user_id = ?3
              AND COALESCE(c.app_mode, 'local') = ?4
              AND c.execution_mode IN (?5, ?6, ?7)
              AND CAST(f.conversation_id AS INTEGER) = ?8
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
              AND m.superseded_key IS NULL
              AND c.user_id = ?3
              AND COALESCE(c.app_mode, 'local') = ?4
              AND c.execution_mode IN (?5, ?6, ?7)
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
            rusqlite::params![
                fts_query,
                effective_limit,
                scope.user_id,
                scope.app_mode,
                scope.execution_modes[0],
                scope.execution_modes[1],
                scope.execution_modes[2],
                conv_id
            ],
            map_search_row,
        )
        .map_err(|e| format!("Conversation search failed: {e}"))?
        .filter_map(|r| r.ok())
        .collect()
    } else {
        stmt.query_map(
            rusqlite::params![
                fts_query,
                effective_limit,
                scope.user_id,
                scope.app_mode,
                scope.execution_modes[0],
                scope.execution_modes[1],
                scope.execution_modes[2]
            ],
            map_search_row,
        )
        .map_err(|e| format!("Conversation search failed: {e}"))?
        .filter_map(|r| r.ok())
        .collect()
    };

    Ok(rows)
}

/// Return the N most recently updated conversations inside `scope` that are
/// not archived, with message counts.
pub fn get_recent_conversations(
    conn: &Connection,
    scope: &ConversationScope,
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
        LEFT JOIN messages m ON m.conversation_id = c.id AND m.superseded_key IS NULL
        WHERE c.user_id = ?2
          AND COALESCE(c.app_mode, 'local') = ?3
          AND c.execution_mode IN (?4, ?5, ?6)
          AND COALESCE(c.archived, 0) = 0
        GROUP BY c.id
        ORDER BY c.updated_at DESC
        LIMIT ?1
    ";

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("Failed to prepare recent conversations query: {e}"))?;

    let rows: Vec<ConversationSummary> = stmt
        .query_map(
            rusqlite::params![
                effective_limit,
                scope.user_id,
                scope.app_mode,
                scope.execution_modes[0],
                scope.execution_modes[1],
                scope.execution_modes[2]
            ],
            |row| {
                Ok(ConversationSummary {
                    conversation_id: row.get(0)?,
                    title: row.get(1)?,
                    timestamp: row.get(2)?,
                    message_count: row.get(3)?,
                })
            },
        )
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
                app_mode TEXT NOT NULL DEFAULT 'local',
                execution_mode TEXT NOT NULL DEFAULT 'local_only',
                archived INTEGER NOT NULL DEFAULT 0,
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
                superseded_key TEXT,
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
        insert_scoped_conversation(conn, title, "test", ChatExecutionMode::LocalOnly, false)
    }

    fn insert_scoped_conversation(
        conn: &Connection,
        title: &str,
        user_id: &str,
        execution_mode: ChatExecutionMode,
        archived: bool,
    ) -> i64 {
        let app_mode = if execution_mode.uses_local_storage() {
            "local"
        } else {
            "cloud"
        };
        conn.execute(
            "INSERT INTO conversations (user_id, title, app_mode, execution_mode, archived)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![user_id, title, app_mode, execution_mode.as_str(), archived],
        )
        .expect("insert conversation");
        conn.last_insert_rowid()
    }

    fn scope_of(user_id: &str, execution_mode: ChatExecutionMode) -> ConversationScope {
        ConversationScope::new(user_id, &[execution_mode]).expect("scope")
    }

    fn test_scope() -> ConversationScope {
        scope_of("test", ChatExecutionMode::LocalOnly)
    }

    fn recent_titles(conn: &Connection, scope: &ConversationScope) -> Vec<String> {
        let mut titles: Vec<String> = get_recent_conversations(conn, scope, Some(50))
            .unwrap()
            .into_iter()
            .map(|r| r.title)
            .collect();
        titles.sort();
        titles
    }

    fn found_titles(conn: &Connection, scope: &ConversationScope, query: &str) -> Vec<String> {
        let mut titles: Vec<String> = search_past_conversations(conn, scope, query, Some(50), None)
            .unwrap()
            .into_iter()
            .map(|r| r.conversation_title)
            .collect();
        titles.sort();
        titles
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

        let results =
            search_past_conversations(&conn, &test_scope(), "async await", None, None).unwrap();
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
            search_past_conversations(&conn, &test_scope(), "alpha", Some(5), Some(conv1)).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].conversation_id, conv1);
    }

    #[test]
    fn search_empty_query_returns_error() {
        let conn = setup_test_db();
        let result = search_past_conversations(&conn, &test_scope(), "   ", None, None);
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

        let results = get_recent_conversations(&conn, &test_scope(), Some(10)).unwrap();
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

        let results = get_recent_conversations(&conn, &test_scope(), Some(10)).unwrap();
        let found = results
            .iter()
            .find(|r| r.conversation_id == conv_id)
            .expect("conversation not found");
        assert_eq!(found.message_count, 3);
    }

    fn seed_every_boundary(conn: &Connection) {
        for (title, user_id, execution_mode) in [
            ("Mine local", "user-a", ChatExecutionMode::LocalOnly),
            ("Mine byok", "user-a", ChatExecutionMode::Byok),
            ("Mine cloud", "user-a", ChatExecutionMode::CloudManaged),
            ("Someone else", "user-b", ChatExecutionMode::LocalOnly),
        ] {
            let id = insert_scoped_conversation(conn, title, user_id, execution_mode, false);
            insert_message(conn, id, "user", "quarterly roadmap");
        }
    }

    #[test]
    fn recent_conversations_stay_inside_the_account_and_skip_archived() {
        let conn = setup_test_db();
        seed_every_boundary(&conn);
        insert_scoped_conversation(
            &conn,
            "Mine archived",
            "user-a",
            ChatExecutionMode::LocalOnly,
            true,
        );

        assert_eq!(
            recent_titles(&conn, &scope_of("user-a", ChatExecutionMode::LocalOnly)),
            vec!["Mine local".to_string()]
        );
    }

    #[test]
    fn a_local_only_chat_never_reads_byok_or_cloud_history() {
        let conn = setup_test_db();
        seed_every_boundary(&conn);
        let local = scope_of("user-a", ChatExecutionMode::LocalOnly);

        assert_eq!(recent_titles(&conn, &local), vec!["Mine local".to_string()]);
        assert_eq!(
            found_titles(&conn, &local, "quarterly roadmap"),
            vec!["Mine local".to_string()]
        );
    }

    #[test]
    fn a_byok_chat_never_reads_local_only_or_cloud_history() {
        let conn = setup_test_db();
        seed_every_boundary(&conn);
        let byok = scope_of("user-a", ChatExecutionMode::Byok);

        assert_eq!(recent_titles(&conn, &byok), vec!["Mine byok".to_string()]);
        assert_eq!(
            found_titles(&conn, &byok, "quarterly roadmap"),
            vec!["Mine byok".to_string()]
        );
    }

    #[test]
    fn a_cloud_chat_never_reads_history_kept_on_the_device() {
        let conn = setup_test_db();
        seed_every_boundary(&conn);
        let cloud = scope_of("user-a", ChatExecutionMode::CloudManaged);

        assert_eq!(recent_titles(&conn, &cloud), vec!["Mine cloud".to_string()]);
        assert_eq!(
            found_titles(&conn, &cloud, "quarterly roadmap"),
            vec!["Mine cloud".to_string()]
        );
    }

    #[test]
    fn narrowing_to_a_conversation_on_another_boundary_finds_nothing() {
        let conn = setup_test_db();
        let local = insert_scoped_conversation(
            &conn,
            "Local",
            "user-a",
            ChatExecutionMode::LocalOnly,
            false,
        );
        let byok =
            insert_scoped_conversation(&conn, "Byok", "user-a", ChatExecutionMode::Byok, false);
        insert_message(&conn, local, "user", "quarterly roadmap");
        insert_message(&conn, byok, "user", "quarterly roadmap");

        for (scope, other) in [
            (scope_of("user-a", ChatExecutionMode::Byok), local),
            (scope_of("user-a", ChatExecutionMode::LocalOnly), byok),
        ] {
            let narrowed = search_past_conversations(
                &conn,
                &scope,
                "quarterly roadmap",
                Some(10),
                Some(other),
            )
            .unwrap();
            assert!(narrowed.is_empty());
        }
    }

    #[test]
    fn the_persons_own_list_may_name_both_boundaries_kept_on_the_device() {
        let conn = setup_test_db();
        seed_every_boundary(&conn);
        let on_device = ConversationScope::new(
            "user-a",
            &[ChatExecutionMode::LocalOnly, ChatExecutionMode::Byok],
        )
        .unwrap();

        assert_eq!(
            recent_titles(&conn, &on_device),
            vec!["Mine byok".to_string(), "Mine local".to_string()]
        );
    }

    #[test]
    fn a_row_whose_app_mode_contradicts_its_boundary_is_read_by_no_scope() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO conversations (user_id, title, app_mode, execution_mode)
             VALUES ('user-a', 'Contradiction', 'cloud', 'local_only')",
            [],
        )
        .unwrap();

        for execution_mode in EXECUTION_BOUNDARIES {
            assert!(recent_titles(&conn, &scope_of("user-a", execution_mode)).is_empty());
        }
    }

    #[test]
    fn a_scope_needs_a_user_and_boundaries_on_one_side_of_storage() {
        assert!(ConversationScope::new("  ", &[ChatExecutionMode::LocalOnly]).is_err());
        assert!(ConversationScope::new("user-a", &[]).is_err());
        assert!(ConversationScope::new(
            "user-a",
            &[
                ChatExecutionMode::LocalOnly,
                ChatExecutionMode::CloudManaged
            ]
        )
        .is_err());
        assert_ne!(
            scope_of("user-a", ChatExecutionMode::Byok),
            scope_of("user-a", ChatExecutionMode::LocalOnly)
        );
    }

    #[test]
    fn the_scope_of_a_running_conversation_is_its_owner_and_boundary() {
        let conn = setup_test_db();

        for execution_mode in EXECUTION_BOUNDARIES {
            let id = insert_scoped_conversation(&conn, "Chat", "user-a", execution_mode, false);
            assert_eq!(
                ConversationScope::of_conversation(&conn, id).unwrap(),
                scope_of("user-a", execution_mode)
            );
        }
        assert!(ConversationScope::of_conversation(&conn, 9_999).is_err());

        conn.execute(
            "INSERT INTO conversations (user_id, title, execution_mode)
             VALUES ('user-a', 'Unknown', 'shared')",
            [],
        )
        .unwrap();
        assert!(ConversationScope::of_conversation(&conn, conn.last_insert_rowid()).is_err());
    }
}
