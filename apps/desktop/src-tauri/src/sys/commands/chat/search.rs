use tauri::State;

use super::types::ChatExecutionMode;
use super::AppDatabase;

/// A single result row returned by `search_chat_history`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ChatSearchResult {
    /// Row ID of the matching message in the `messages` table.
    pub message_id: i64,
    /// Row ID of the conversation that owns this message.
    pub conversation_id: i64,
    /// Human-readable title of the conversation, if available.
    pub conversation_title: Option<String>,
    /// A short excerpt of the message content with the match context.
    /// Up to ~160 characters, surrounded by the query terms.
    pub content_snippet: String,
    /// Role of the message sender: "user", "assistant", or "system".
    pub role: String,
    /// ISO-8601 creation timestamp of the message.
    pub created_at: String,
    /// BM25 relevance rank (lower is more relevant in SQLite FTS5 convention).
    pub rank: f64,
}

fn escape_fts_term(term: &str) -> String {
    let escaped = term.trim().replace('"', "\"\"");
    format!("\"{escaped}\"")
}

fn build_literal_fts_query(query: &str, operator: &str) -> Result<String, String> {
    let terms: Vec<String> = query
        .split(|c: char| c.is_whitespace() || c.is_ascii_punctuation())
        .filter(|term| !term.is_empty())
        .map(escape_fts_term)
        .collect();

    if terms.is_empty() {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Err("Search query contains no searchable words".to_string());
        }
        return Ok(escape_fts_term(trimmed));
    }

    Ok(terms.join(&format!(" {operator} ")))
}

fn search_chat_history_inner(
    query: &str,
    limit: Option<i64>,
    user_id: &str,
    app_mode: &str,
    db: &AppDatabase,
) -> Result<Vec<ChatSearchResult>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Err("Search query cannot be empty".to_string());
    }
    let user_id = user_id.trim();
    if user_id.is_empty() {
        return Err("Chat search needs the signed-in user".to_string());
    }
    let app_mode = match app_mode {
        "local" => "local",
        "cloud" => "cloud",
        other => return Err(format!("Chat search does not know the mode '{other}'")),
    };

    let fts_query = build_literal_fts_query(trimmed, "AND")?;
    let effective_limit = limit.unwrap_or(20).clamp(1, 100);
    let conn = db.connection()?;

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
            "search_chat_history: messages_fts table not found; \
             returning empty results (FTS5 may be unavailable)"
        );
        return Ok(Vec::new());
    }

    let sql = "
        SELECT
            CAST(f.message_id AS INTEGER)        AS message_id,
            CAST(f.conversation_id AS INTEGER)   AS conversation_id,
            c.title                              AS conversation_title,
            snippet(messages_fts, 2, '[', ']', '...', 24) AS content_snippet,
            f.sender                             AS role,
            m.created_at                         AS created_at,
            bm25(messages_fts)                   AS rank
        FROM messages_fts f
        JOIN messages     m ON m.id             = CAST(f.message_id      AS INTEGER)
        JOIN conversations c ON c.id            = CAST(f.conversation_id AS INTEGER)
        WHERE messages_fts MATCH ?1
          AND m.superseded_key IS NULL
          AND c.user_id = ?3
          AND COALESCE(c.app_mode, 'local') = ?4
        ORDER BY rank
        LIMIT ?2
    ";
    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("Failed to prepare FTS search statement: {e}"))?;

    let rows = stmt
        .query_map(
            rusqlite::params![fts_query, effective_limit, user_id, app_mode],
            |row| {
                Ok(ChatSearchResult {
                    message_id: row.get(0)?,
                    conversation_id: row.get(1)?,
                    conversation_title: row.get(2)?,
                    content_snippet: row.get(3)?,
                    role: row.get(4)?,
                    created_at: row.get(5)?,
                    rank: row.get(6)?,
                })
            },
        )
        .map_err(|e| format!("Failed to execute FTS search: {e}"))?;

    let results: Result<Vec<ChatSearchResult>, _> = rows.collect();
    results.map_err(|e| format!("Failed to collect FTS search results: {e}"))
}

/// Full-text search across all chat messages using the FTS5 index.
///
/// The user query is normalized into a literal-term MATCH query so FTS5 control
/// operators are treated as plain text instead of being executed. Results are
/// ordered by BM25 relevance (most relevant first) and limited to `limit` rows
/// (default 20, max 100).
///
/// `user_id` and `app_mode` are required: they scope the search to one
/// account's Local or Cloud history. Left out, the search would read every
/// account's chats in both modes.
///
/// Returns an empty list when the FTS5 table is not available (e.g. on an
/// SQLite build without the FTS5 extension), rather than surfacing an error.
#[tauri::command]
pub fn search_chat_history(
    query: String,
    limit: Option<i64>,
    user_id: String,
    app_mode: String,
    db: State<'_, AppDatabase>,
) -> Result<Vec<ChatSearchResult>, String> {
    search_chat_history_inner(&query, limit, &user_id, &app_mode, db.inner())
}

/// Return the N most recently updated, unarchived conversations with message counts.
///
/// `user_id` and `execution_modes` are required: without them the list carries
/// every local account's titles on every execution boundary. The caller is the
/// person's own picker, which names the boundaries it shows.
#[tauri::command]
pub fn get_recent_conversations(
    limit: Option<usize>,
    user_id: String,
    execution_modes: Vec<ChatExecutionMode>,
    db: State<'_, AppDatabase>,
) -> Result<Vec<crate::features::search::ConversationSummary>, String> {
    let scope = crate::features::search::ConversationScope::new(&user_id, &execution_modes)?;
    let conn = db.connection()?;
    crate::features::search::get_recent_conversations(&conn, &scope, limit)
}

#[cfg(test)]
mod tests {
    use super::{build_literal_fts_query, search_chat_history_inner};
    use crate::data::db::{
        models::{Message, MessageRole},
        repository, Database,
    };
    use crate::sys::commands::chat::state::AppDatabase;

    fn test_db() -> AppDatabase {
        let db = Database::in_memory().expect("in-memory db");
        AppDatabase {
            conn: db.get_connection(),
        }
    }

    fn add_message(db: &AppDatabase, conversation_id: i64, user_id: &str, content: &str) {
        let conn = db.connection().expect("db connection");
        repository::create_message(
            &conn,
            &Message::new(
                conversation_id,
                user_id.to_string(),
                MessageRole::Assistant,
                content.to_string(),
            ),
        )
        .expect("message");
    }

    #[test]
    fn build_literal_fts_query_quotes_reserved_terms() {
        let query = build_literal_fts_query("alpha NOT beta", "AND").expect("query");
        assert_eq!(query, "\"alpha\" AND \"NOT\" AND \"beta\"");
    }

    #[test]
    fn build_literal_fts_query_joins_terms_with_the_given_operator() {
        let query = build_literal_fts_query("alpha near beta", "OR").expect("query");
        assert_eq!(query, "\"alpha\" OR \"near\" OR \"beta\"");
    }

    #[test]
    fn search_chat_history_treats_reserved_tokens_as_plain_text() {
        let db = test_db();
        let user_id = "test-user";
        let conversation_id = {
            let conn = db.connection().expect("db connection");
            repository::create_conversation(&conn, "Search Test".to_string(), user_id.to_string())
                .expect("conversation")
        };
        add_message(&db, conversation_id, user_id, "alpha NOT beta");

        let results = search_chat_history_inner("alpha NOT beta", Some(10), user_id, "local", &db)
            .expect("search");
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn search_chat_history_refuses_to_run_without_an_account_or_a_known_mode() {
        let db = test_db();

        assert!(search_chat_history_inner("alpha", Some(10), "  ", "local", &db).is_err());
        assert!(search_chat_history_inner("alpha", Some(10), "user-a", "", &db).is_err());
        assert!(search_chat_history_inner("alpha", Some(10), "user-a", "all", &db).is_err());
    }

    #[test]
    fn search_chat_history_stays_inside_the_requested_account_and_mode() {
        let db = test_db();
        let (local_id, cloud_id, other_user_id) = {
            let conn = db.connection().expect("db connection");
            (
                repository::create_conversation_with_mode(
                    &conn,
                    "Local".to_string(),
                    "user-a".to_string(),
                    "local",
                )
                .expect("local conversation"),
                repository::create_conversation_with_mode(
                    &conn,
                    "Cloud".to_string(),
                    "user-a".to_string(),
                    "cloud",
                )
                .expect("cloud conversation"),
                repository::create_conversation_with_mode(
                    &conn,
                    "Other".to_string(),
                    "user-b".to_string(),
                    "local",
                )
                .expect("other user conversation"),
            )
        };
        add_message(&db, local_id, "user-a", "quarterly roadmap local");
        add_message(&db, cloud_id, "user-a", "quarterly roadmap cloud");
        add_message(&db, other_user_id, "user-b", "quarterly roadmap other");

        let results =
            search_chat_history_inner("quarterly roadmap", Some(10), "user-a", "local", &db)
                .expect("search");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].conversation_id, local_id);
    }
}
