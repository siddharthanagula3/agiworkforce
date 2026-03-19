//! SQLite-backed session storage for conversation persistence.
//!
//! Creates `~/.agiworkforce/sessions.db` with WAL mode.
//!
//! Schema:
//! - `sessions`   — metadata (id, title, model, cwd, git_branch, timestamps, total_tokens)
//! - `messages`   — per-message content (role, content_json, tokens, created_at)
//! - `tool_calls` — per-tool-call records (name, args, output, success, duration_ms)

use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use std::path::PathBuf;

use crate::models::{Message, MessageContent};

// ---------------------------------------------------------------------------
// DB initialization
// ---------------------------------------------------------------------------

/// Open (or create) the sessions database with WAL mode and FK enforcement.
pub fn open_db() -> Result<Connection> {
    let path = db_path()?;
    let conn = Connection::open(&path)
        .with_context(|| format!("Failed to open sessions DB at {}", path.display()))?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .context("Failed to set PRAGMA options")?;
    create_tables(&conn)?;
    Ok(conn)
}

fn db_path() -> Result<PathBuf> {
    let dir = crate::config::CliConfig::config_dir()
        .context("Failed to locate config directory")?;
    Ok(dir.join("sessions.db"))
}

fn create_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS sessions (
            id           TEXT    PRIMARY KEY,
            title        TEXT    NOT NULL DEFAULT '',
            model        TEXT    NOT NULL DEFAULT '',
            cwd          TEXT    NOT NULL DEFAULT '',
            git_branch   TEXT    NOT NULL DEFAULT '',
            created_at   INTEGER NOT NULL,
            updated_at   INTEGER NOT NULL,
            total_tokens INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS messages (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id   TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            role         TEXT    NOT NULL,
            content_json TEXT    NOT NULL,
            tokens       INTEGER NOT NULL DEFAULT 0,
            created_at   INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_messages_session
            ON messages(session_id);

        CREATE TABLE IF NOT EXISTS tool_calls (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id   INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
            tool_name    TEXT    NOT NULL,
            args_json    TEXT    NOT NULL DEFAULT '{}',
            output       TEXT    NOT NULL DEFAULT '',
            success      INTEGER NOT NULL DEFAULT 1,
            duration_ms  INTEGER NOT NULL DEFAULT 0,
            created_at   INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_tool_calls_message
            ON tool_calls(message_id);
        ",
    )
    .context("Failed to create tables")
}

// ---------------------------------------------------------------------------
// Session CRUD
// ---------------------------------------------------------------------------

/// Lightweight view of a session returned by list/search queries.
#[derive(Debug, Clone)]
pub struct SessionSummary {
    pub id: String,
    pub title: String,
    pub model: String,
    pub cwd: String,
    pub git_branch: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub total_tokens: i64,
    pub message_count: i64,
}

/// Upsert session metadata.
///
/// If `session_id` already exists, the title and `updated_at` are refreshed.
pub fn save_session(
    conn: &Connection,
    session_id: &str,
    title: &str,
    model: &str,
    cwd: &str,
    git_branch: &str,
) -> Result<()> {
    let now = now_ms();
    conn.execute(
        "INSERT INTO sessions (id, title, model, cwd, git_branch, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(id) DO UPDATE SET
             title      = excluded.title,
             updated_at = excluded.updated_at",
        params![session_id, title, model, cwd, git_branch, now],
    )
    .context("Failed to save session")?;
    Ok(())
}

/// Append a message to a session.
///
/// Returns the auto-generated row ID (useful for [`record_tool_call`]).
pub fn save_message(
    conn: &Connection,
    session_id: &str,
    msg: &Message,
    tokens: usize,
) -> Result<i64> {
    let content_json =
        serde_json::to_string(&msg.content).context("Failed to serialize message content")?;
    let now = now_ms();
    conn.execute(
        "INSERT INTO messages (session_id, role, content_json, tokens, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![session_id, msg.role, content_json, tokens as i64, now],
    )
    .context("Failed to save message")?;

    let row_id = conn.last_insert_rowid();

    conn.execute(
        "UPDATE sessions SET total_tokens = total_tokens + ?1, updated_at = ?2 WHERE id = ?3",
        params![tokens as i64, now, session_id],
    )
    .context("Failed to update session token count")?;

    Ok(row_id)
}

/// List sessions ordered by most-recently-updated, up to `limit` rows.
pub fn list_sessions(conn: &Connection, limit: usize) -> Result<Vec<SessionSummary>> {
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.title, s.model, s.cwd, s.git_branch,
                    s.created_at, s.updated_at, s.total_tokens,
                    COUNT(m.id) AS message_count
             FROM sessions s
             LEFT JOIN messages m ON m.session_id = s.id
             GROUP BY s.id
             ORDER BY s.updated_at DESC
             LIMIT ?1",
        )
        .context("Failed to prepare list query")?;

    let rows = stmt
        .query_map(params![limit as i64], row_to_summary)
        .context("Failed to query sessions")?;

    rows.collect::<std::result::Result<Vec<_>, _>>()
        .context("Failed to collect session rows")
}

/// Load all messages for `session_id` in chronological order.
pub fn load_session(conn: &Connection, session_id: &str) -> Result<Vec<Message>> {
    let mut stmt = conn
        .prepare(
            "SELECT role, content_json FROM messages
             WHERE session_id = ?1
             ORDER BY id ASC",
        )
        .context("Failed to prepare message query")?;

    let rows = stmt
        .query_map(params![session_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .context("Failed to query messages")?;

    let mut messages = Vec::new();
    for row in rows {
        let (role, content_json) = row.context("Failed to read message row")?;
        let content: MessageContent = serde_json::from_str(&content_json)
            .with_context(|| format!("Failed to deserialize content: {}", content_json))?;
        messages.push(Message { role, content });
    }
    Ok(messages)
}

/// Delete a session and its messages/tool_calls via CASCADE.
pub fn delete_session(conn: &Connection, session_id: &str) -> Result<()> {
    let n = conn
        .execute("DELETE FROM sessions WHERE id = ?1", params![session_id])
        .context("Failed to delete session")?;
    if n == 0 {
        anyhow::bail!("Session '{}' not found", session_id);
    }
    Ok(())
}

/// Rename a session's title.
pub fn rename_session(conn: &Connection, session_id: &str, new_title: &str) -> Result<()> {
    let now = now_ms();
    let n = conn
        .execute(
            "UPDATE sessions SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![new_title, now, session_id],
        )
        .context("Failed to rename session")?;
    if n == 0 {
        anyhow::bail!("Session '{}' not found", session_id);
    }
    Ok(())
}

/// Archive (delete) a session.
///
/// Currently implemented as a delete. A future version may set an `archived`
/// flag instead, but for now the simplest approach is full removal.
pub fn archive_session(conn: &Connection, session_id: &str) -> Result<()> {
    delete_session(conn, session_id)
}

/// Full-text search across session titles and message content.
pub fn search_sessions(conn: &Connection, query: &str) -> Result<Vec<SessionSummary>> {
    let pattern = format!("%{}%", query);
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT s.id, s.title, s.model, s.cwd, s.git_branch,
                    s.created_at, s.updated_at, s.total_tokens,
                    COUNT(m2.id) AS message_count
             FROM sessions s
             LEFT JOIN messages m  ON m.session_id  = s.id
                 AND (m.content_json LIKE ?1 OR m.role LIKE ?1)
             LEFT JOIN messages m2 ON m2.session_id = s.id
             WHERE s.title LIKE ?1 OR m.id IS NOT NULL
             GROUP BY s.id
             ORDER BY s.updated_at DESC
             LIMIT 50",
        )
        .context("Failed to prepare search query")?;

    let rows = stmt
        .query_map(params![pattern], row_to_summary)
        .context("Failed to execute search")?;

    rows.collect::<std::result::Result<Vec<_>, _>>()
        .context("Failed to collect search results")
}

// ---------------------------------------------------------------------------
// Tool call recording
// ---------------------------------------------------------------------------

/// Record a tool call associated with a message row.
///
/// `message_id` is the value returned by [`save_message`].
pub fn record_tool_call(
    conn: &Connection,
    message_id: i64,
    tool_name: &str,
    args: &serde_json::Value,
    output: &str,
    success: bool,
    duration_ms: u64,
) -> Result<i64> {
    let args_json = serde_json::to_string(args).context("Failed to serialize tool args")?;
    let now = now_ms();
    conn.execute(
        "INSERT INTO tool_calls
             (message_id, tool_name, args_json, output, success, duration_ms, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            message_id,
            tool_name,
            args_json,
            output,
            success as i64,
            duration_ms as i64,
            now
        ],
    )
    .context("Failed to record tool call")?;
    Ok(conn.last_insert_rowid())
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

/// High-level database statistics.
#[derive(Debug, Clone)]
pub struct DbStats {
    pub session_count: i64,
    pub message_count: i64,
    pub tool_call_count: i64,
    pub total_tokens: i64,
}

/// Retrieve overall database statistics.
pub fn db_stats(conn: &Connection) -> Result<DbStats> {
    let session_count: i64 =
        conn.query_row("SELECT COUNT(*) FROM sessions", [], |r| r.get(0))?;
    let message_count: i64 =
        conn.query_row("SELECT COUNT(*) FROM messages", [], |r| r.get(0))?;
    let tool_call_count: i64 =
        conn.query_row("SELECT COUNT(*) FROM tool_calls", [], |r| r.get(0))?;
    let total_tokens: i64 = conn.query_row(
        "SELECT COALESCE(SUM(total_tokens), 0) FROM sessions",
        [],
        |r| r.get(0),
    )?;
    Ok(DbStats {
        session_count,
        message_count,
        tool_call_count,
        total_tokens,
    })
}

// ---------------------------------------------------------------------------
// Migration from JSON conversations
// ---------------------------------------------------------------------------

/// Import existing JSON conversation files into the SQLite DB.
///
/// Reads `*.json` files from `json_dir`.  Each file must contain:
/// `{ "id": "...", "title": "...", "model": "...", "messages": [...] }`.
/// Already-imported sessions are skipped.  Returns the number of sessions
/// successfully imported.
pub fn migrate_json_conversations(conn: &Connection, json_dir: &std::path::Path) -> Result<usize> {
    if !json_dir.exists() {
        return Ok(0);
    }

    let entries =
        std::fs::read_dir(json_dir).with_context(|| format!("Cannot read {}", json_dir.display()))?;

    let mut imported = 0usize;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }

        let text = match std::fs::read_to_string(&path) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let json: serde_json::Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let session_id = match json["id"].as_str() {
            Some(id) if !id.is_empty() => id,
            _ => continue,
        };

        // Skip already-imported sessions.
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sessions WHERE id = ?1",
                params![session_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if exists > 0 {
            continue;
        }

        let title = json["title"].as_str().unwrap_or("Imported session");
        let model = json["model"].as_str().unwrap_or("unknown");
        save_session(conn, session_id, title, model, "", "")?;

        if let Some(msgs) = json["messages"].as_array() {
            for mv in msgs {
                let role = mv["role"].as_str().unwrap_or("user");
                let content = mv["content"].as_str().unwrap_or("");
                let msg = Message::text(role, content);
                let tokens = crate::compaction::estimate_tokens(content);
                save_message(conn, session_id, &msg, tokens)?;
            }
        }

        imported += 1;
    }

    Ok(imported)
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/// Group sessions by date bucket: "Today", "Yesterday", "This Week", or a date string.
pub fn date_group_sessions(sessions: &[SessionSummary]) -> Vec<(String, Vec<&SessionSummary>)> {
    let now = now_ms();
    let today_start = now - (now % 86_400_000);
    let yesterday_start = today_start - 86_400_000;
    let week_start = today_start - 7 * 86_400_000;

    let mut groups: Vec<(String, Vec<&SessionSummary>)> = Vec::new();

    for s in sessions {
        let label = if s.updated_at >= today_start {
            "Today".to_string()
        } else if s.updated_at >= yesterday_start {
            "Yesterday".to_string()
        } else if s.updated_at >= week_start {
            "This Week".to_string()
        } else {
            format_date_only(s.updated_at)
        };

        if let Some(group) = groups.iter_mut().find(|(l, _)| *l == label) {
            group.1.push(s);
        } else {
            groups.push((label, vec![s]));
        }
    }

    groups
}

/// Format a session list for terminal output, grouped by date.
pub fn format_session_list(sessions: &[SessionSummary]) -> String {
    if sessions.is_empty() {
        return "No sessions found.".to_string();
    }

    let groups = date_group_sessions(sessions);
    let mut out = String::new();

    for (label, group) in &groups {
        out.push_str(&format!("  {}:\n", label));
        for s in group {
            let title = if s.title.is_empty() { "(untitled)" } else { &s.title };
            let short_id = &s.id[..s.id.len().min(8)];
            out.push_str(&format!(
                "    {:<40} {:>4} msgs  {}\n",
                format!("{} [{}]", title, short_id),
                s.message_count,
                s.model,
            ));
        }
    }
    out
}

/// Very lightweight timestamp formatter (no chrono dependency needed).
fn format_timestamp(ms: i64) -> String {
    let secs = ms / 1_000;
    let days = secs / 86_400;
    let year = 1970 + days / 365;
    let doy = days % 365;
    let month = doy / 30 + 1;
    let day = doy % 30 + 1;
    let hour = (secs % 86_400) / 3_600;
    let min = (secs % 3_600) / 60;
    format!("{:04}-{:02}-{:02} {:02}:{:02}", year, month, day, hour, min)
}

/// Date-only variant of `format_timestamp` for grouping labels.
fn format_date_only(ms: i64) -> String {
    let secs = ms / 1_000;
    let days = secs / 86_400;
    let year = 1970 + days / 365;
    let doy = days % 365;
    let month = doy / 30 + 1;
    let day = doy % 30 + 1;
    format!("{:04}-{:02}-{:02}", year, month, day)
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// Map a result row to [`SessionSummary`].
fn row_to_summary(row: &rusqlite::Row<'_>) -> rusqlite::Result<SessionSummary> {
    Ok(SessionSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        model: row.get(2)?,
        cwd: row.get(3)?,
        git_branch: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
        total_tokens: row.get(7)?,
        message_count: row.get(8)?,
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn mem_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        create_tables(&conn).unwrap();
        conn
    }

    #[test]
    fn test_tables_created() {
        let conn = mem_db();
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(n >= 3, "expected ≥3 tables, got {}", n);
    }

    #[test]
    fn test_save_and_list_session() {
        let conn = mem_db();
        save_session(&conn, "s1", "Hello", "claude-opus-4-6", "/tmp", "main").unwrap();
        let list = list_sessions(&conn, 10).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "s1");
        assert_eq!(list[0].title, "Hello");
        assert_eq!(list[0].model, "claude-opus-4-6");
    }

    #[test]
    fn test_upsert_session_updates_title() {
        let conn = mem_db();
        save_session(&conn, "s1", "Original", "m", "/", "").unwrap();
        save_session(&conn, "s1", "Updated", "m", "/", "").unwrap();
        let list = list_sessions(&conn, 10).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].title, "Updated");
    }

    #[test]
    fn test_save_and_load_messages() {
        let conn = mem_db();
        save_session(&conn, "s2", "t", "m", "/", "").unwrap();

        let m1 = Message::text("user", "Hello");
        let m2 = Message::text("assistant", "Hi!");
        save_message(&conn, "s2", &m1, 5).unwrap();
        save_message(&conn, "s2", &m2, 3).unwrap();

        let loaded = load_session(&conn, "s2").unwrap();
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].role, "user");
        assert_eq!(loaded[1].role, "assistant");
    }

    #[test]
    fn test_total_tokens_tracked() {
        let conn = mem_db();
        save_session(&conn, "s3", "t", "m", "/", "").unwrap();
        let msg = Message::text("user", "Hello");
        save_message(&conn, "s3", &msg, 10).unwrap();
        save_message(&conn, "s3", &msg, 20).unwrap();

        let list = list_sessions(&conn, 10).unwrap();
        assert_eq!(list[0].total_tokens, 30);
    }

    #[test]
    fn test_delete_session() {
        let conn = mem_db();
        save_session(&conn, "s4", "t", "m", "/", "").unwrap();
        delete_session(&conn, "s4").unwrap();
        assert!(list_sessions(&conn, 10).unwrap().is_empty());
    }

    #[test]
    fn test_delete_nonexistent_returns_err() {
        let conn = mem_db();
        assert!(delete_session(&conn, "missing").is_err());
    }

    #[test]
    fn test_record_tool_call() {
        let conn = mem_db();
        save_session(&conn, "s5", "t", "m", "/", "").unwrap();
        let msg = Message::text("user", "run it");
        let mid = save_message(&conn, "s5", &msg, 5).unwrap();
        let tc_id = record_tool_call(
            &conn,
            mid,
            "read_file",
            &serde_json::json!({"path": "/tmp/a.txt"}),
            "contents",
            true,
            42,
        )
        .unwrap();
        assert!(tc_id > 0);
    }

    #[test]
    fn test_db_stats_empty() {
        let conn = mem_db();
        let stats = db_stats(&conn).unwrap();
        assert_eq!(stats.session_count, 0);
        assert_eq!(stats.message_count, 0);
        assert_eq!(stats.tool_call_count, 0);
        assert_eq!(stats.total_tokens, 0);
    }

    #[test]
    fn test_db_stats_with_data() {
        let conn = mem_db();
        save_session(&conn, "s6", "t", "m", "/", "").unwrap();
        let msg = Message::text("user", "hi");
        save_message(&conn, "s6", &msg, 7).unwrap();
        let stats = db_stats(&conn).unwrap();
        assert_eq!(stats.session_count, 1);
        assert_eq!(stats.message_count, 1);
        assert_eq!(stats.total_tokens, 7);
    }

    #[test]
    fn test_search_sessions_by_title() {
        let conn = mem_db();
        save_session(&conn, "s7", "Rust debugging", "claude", "/", "").unwrap();
        save_session(&conn, "s8", "Python tutorial", "gpt-4o", "/", "").unwrap();
        let results = search_sessions(&conn, "Rust").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "s7");
    }

    #[test]
    fn test_migrate_nonexistent_dir() {
        let conn = mem_db();
        let n =
            migrate_json_conversations(&conn, std::path::Path::new("/nonexistent-test-xyz")).unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn test_format_session_list_empty() {
        assert_eq!(format_session_list(&[]), "No sessions found.");
    }

    #[test]
    fn test_format_session_list_with_data() {
        let s = SessionSummary {
            id: "abc123def".to_string(),
            title: "My session".to_string(),
            model: "claude-opus-4-6".to_string(),
            cwd: "/home/user".to_string(),
            git_branch: "main".to_string(),
            created_at: 1_700_000_000_000,
            updated_at: 1_700_000_000_000,
            total_tokens: 5_000,
            message_count: 10,
        };
        let out = format_session_list(&[s]);
        assert!(out.contains("My session"));
        assert!(out.contains("abc123d"));
        assert!(out.contains("claude-opus-4-6"));
    }

    #[test]
    fn test_rename_session() {
        let conn = mem_db();
        save_session(&conn, "r1", "Old Title", "m", "/", "").unwrap();
        rename_session(&conn, "r1", "New Title").unwrap();
        let list = list_sessions(&conn, 10).unwrap();
        assert_eq!(list[0].title, "New Title");
    }

    #[test]
    fn test_rename_nonexistent_returns_err() {
        let conn = mem_db();
        assert!(rename_session(&conn, "missing", "New").is_err());
    }

    #[test]
    fn test_archive_session() {
        let conn = mem_db();
        save_session(&conn, "a1", "To Archive", "m", "/", "").unwrap();
        archive_session(&conn, "a1").unwrap();
        assert!(list_sessions(&conn, 10).unwrap().is_empty());
    }

    #[test]
    fn test_date_group_sessions_empty() {
        let groups = date_group_sessions(&[]);
        assert!(groups.is_empty());
    }

    #[test]
    fn test_date_group_sessions_buckets() {
        let now = super::now_ms();
        let yesterday = now - 86_400_000 + 1000; // just inside yesterday
        let old = now - 30 * 86_400_000; // 30 days ago

        let s1 = SessionSummary {
            id: "t1".into(),
            title: "Today".into(),
            model: "m".into(),
            cwd: "/".into(),
            git_branch: "".into(),
            created_at: now,
            updated_at: now,
            total_tokens: 0,
            message_count: 1,
        };
        let s2 = SessionSummary {
            id: "y1".into(),
            title: "Yest".into(),
            model: "m".into(),
            cwd: "/".into(),
            git_branch: "".into(),
            created_at: yesterday,
            updated_at: yesterday,
            total_tokens: 0,
            message_count: 1,
        };
        let s3 = SessionSummary {
            id: "o1".into(),
            title: "Old".into(),
            model: "m".into(),
            cwd: "/".into(),
            git_branch: "".into(),
            created_at: old,
            updated_at: old,
            total_tokens: 0,
            message_count: 1,
        };
        let sessions = [s1, s2, s3];
        let groups = date_group_sessions(&sessions);

        // Should have at least 2 distinct groups (today + something else)
        assert!(groups.len() >= 2, "expected >=2 groups, got {}", groups.len());
        assert_eq!(groups[0].0, "Today");
        assert_eq!(groups[0].1.len(), 1);
    }
}
