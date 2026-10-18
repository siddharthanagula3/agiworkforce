use chrono::{DateTime, Duration, TimeZone, Utc};
use rusqlite::{params, Connection, Result, Row};

use super::models::{
    AutomationHistory, Conversation, ConversationBranchGroup, ConversationCostBreakdown,
    ConversationListItem, CostTimeseriesPoint, Message, MessageRole, MessageWithDetail,
    ProviderCostBreakdown, Setting, TaskType, COMPACTION_SUMMARIZED, COMPACTION_SUMMARY,
};

/// Validates a provider or model name string (M12).
/// Rejects values that are too long or contain characters outside the expected
/// alphanumeric / punctuation set, guarding against injection via filter params.
fn validate_provider_model(value: &str) -> std::result::Result<(), rusqlite::Error> {
    if value.len() > 100 {
        return Err(rusqlite::Error::InvalidParameterName(
            "Provider/model name exceeds maximum length of 100 characters".to_string(),
        ));
    }
    if value
        .chars()
        .any(|c| !c.is_alphanumeric() && c != '-' && c != '.' && c != '/' && c != '_')
    {
        return Err(rusqlite::Error::InvalidParameterName(
            "Provider/model name contains invalid characters".to_string(),
        ));
    }
    Ok(())
}

pub fn create_conversation(conn: &Connection, title: String, user_id: String) -> Result<i64> {
    conn.execute(
        "INSERT INTO conversations (title, user_id) VALUES (?1, ?2)",
        params![title, user_id],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Create a conversation tagged with the active app mode ("local" or "cloud").
/// Use this for all new conversations created after migration v66 so that the
/// mode-scoped list queries correctly partition the history.
pub fn create_conversation_with_mode(
    conn: &Connection,
    title: String,
    user_id: String,
    app_mode: &str,
) -> Result<i64> {
    // Reject unknown modes at the repository boundary so mis-wired callers fail loudly
    // rather than persisting an invalid value.
    let safe_mode = match app_mode {
        "cloud" => "cloud",
        _ => "local", // default to local for unknown values
    };
    let execution_mode = if safe_mode == "cloud" {
        "cloud_managed"
    } else {
        "local_only"
    };
    conn.execute(
        "INSERT INTO conversations (title, user_id, app_mode, execution_mode) VALUES (?1, ?2, ?3, ?4)",
        params![title, user_id, safe_mode, execution_mode],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn create_conversation_with_execution_mode(
    conn: &Connection,
    title: String,
    user_id: String,
    app_mode: &str,
    execution_mode: &str,
    project_id: Option<&str>,
) -> Result<i64> {
    let safe_mode = match app_mode {
        "local" | "cloud" => app_mode,
        _ => {
            return Err(rusqlite::Error::InvalidParameterName(
                "invalid app_mode".to_string(),
            ))
        }
    };
    let safe_execution_mode = match execution_mode {
        "local_only" | "byok" | "cloud_managed" => execution_mode,
        _ => {
            return Err(rusqlite::Error::InvalidParameterName(
                "invalid execution_mode".to_string(),
            ))
        }
    };
    let expected_mode = if safe_execution_mode == "cloud_managed" {
        "cloud"
    } else {
        "local"
    };
    if safe_mode != expected_mode {
        return Err(rusqlite::Error::InvalidParameterName(
            "app_mode and execution_mode disagree".to_string(),
        ));
    }
    // Normalize blank scope to NULL so "no project" is a single representation.
    let safe_project_id = project_id.map(str::trim).filter(|s| !s.is_empty());
    conn.execute(
        "INSERT INTO conversations (title, user_id, app_mode, execution_mode, project_id) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![title, user_id, safe_mode, safe_execution_mode, safe_project_id],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_conversation(conn: &Connection, id: i64, user_id: &str) -> Result<Conversation> {
    conn.query_row(
        "SELECT id, title, created_at, updated_at, user_id, execution_mode, project_id FROM conversations WHERE id = ?1 AND user_id = ?2",
        params![id, user_id],
        map_conversation,
    )
}

pub fn list_conversations(
    conn: &Connection,
    limit: i64,
    offset: i64,
    user_id: &str,
) -> Result<Vec<Conversation>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, created_at, updated_at, user_id, execution_mode, project_id
         FROM conversations
         WHERE user_id = ?3
         ORDER BY updated_at DESC
         LIMIT ?1 OFFSET ?2",
    )?;

    let conversations = stmt
        .query_map(params![limit, offset, user_id], map_conversation)?
        .collect::<Result<Vec<_>>>()?;

    Ok(conversations)
}

/// One page of the history list, newest first, with the archived and pinned
/// flags the sidebar renders.
///
/// This is the PREFERRED query for all UI-facing conversation list calls.
/// With `app_mode` it enforces the hard Local/Cloud boundary so each mode shows
/// only its own history; without it every conversation of the user is listed.
/// `id` breaks `updated_at` ties so consecutive pages never repeat or skip a row.
pub fn list_conversations_by_mode(
    conn: &Connection,
    limit: i64,
    offset: i64,
    user_id: &str,
    app_mode: Option<&str>,
) -> Result<Vec<ConversationListItem>> {
    let safe_mode = app_mode.map(|mode| match mode {
        "cloud" => "cloud",
        _ => "local",
    });
    let mut stmt = conn.prepare(
        "SELECT id, title, created_at, updated_at, user_id, execution_mode, project_id,
                COALESCE(archived, 0), COALESCE(pinned, 0)
         FROM conversations
         WHERE user_id = ?3
           AND (?4 IS NULL OR app_mode = ?4 OR app_mode IS NULL)
         ORDER BY updated_at DESC, id DESC
         LIMIT ?1 OFFSET ?2",
    )?;

    let conversations = stmt
        .query_map(params![limit, offset, user_id, safe_mode], |row| {
            Ok(ConversationListItem {
                conversation: map_conversation(row)?,
                archived: row.get::<_, i64>(7)? != 0,
                pinned: row.get::<_, i64>(8)? != 0,
            })
        })?
        .collect::<Result<Vec<_>>>()?;

    Ok(conversations)
}

pub fn update_conversation_title(
    conn: &Connection,
    id: i64,
    user_id: &str,
    title: String,
) -> Result<()> {
    let updated = conn.execute(
        "UPDATE conversations SET title = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2 AND user_id = ?3",
        params![title, id, user_id],
    )?;
    if updated == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(())
}

/// Set the `archived` flag on a conversation (1 = archived, 0 = active).
/// Archiving also unpins, so a restored chat returns to Recents unpinned.
pub fn archive_conversation(
    conn: &Connection,
    id: i64,
    user_id: &str,
    archived: bool,
) -> Result<()> {
    let flag: i32 = if archived { 1 } else { 0 };
    let updated = conn.execute(
        "UPDATE conversations
         SET archived = ?1,
             pinned = CASE WHEN ?1 = 1 THEN 0 ELSE COALESCE(pinned, 0) END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2 AND user_id = ?3",
        params![flag, id, user_id],
    )?;
    if updated == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(())
}

/// Set the `pinned` flag on a conversation. Pinning leaves `updated_at` alone so
/// the chat keeps its place in Recents.
pub fn set_conversation_pinned(
    conn: &Connection,
    id: i64,
    user_id: &str,
    pinned: bool,
) -> Result<()> {
    let updated = conn.execute(
        "UPDATE conversations SET pinned = ?1 WHERE id = ?2 AND user_id = ?3",
        params![i32::from(pinned), id, user_id],
    )?;
    if updated == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(())
}

/// Move a conversation into a project, or out of every project with `None`.
/// A blank id is stored as NULL so "no project" has one representation.
pub fn set_conversation_project(
    conn: &Connection,
    id: i64,
    user_id: &str,
    project_id: Option<&str>,
) -> Result<()> {
    let safe_project_id = project_id.map(str::trim).filter(|s| !s.is_empty());
    let updated = conn.execute(
        "UPDATE conversations SET project_id = ?1 WHERE id = ?2 AND user_id = ?3",
        params![safe_project_id, id, user_id],
    )?;
    if updated == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(())
}

pub fn delete_conversation(conn: &Connection, id: i64, user_id: &str) -> Result<usize> {
    let rows_affected = conn.execute(
        "DELETE FROM conversations WHERE id = ?1 AND user_id = ?2",
        params![id, user_id],
    )?;
    Ok(rows_affected)
}

fn map_conversation(row: &Row) -> Result<Conversation> {
    Ok(Conversation {
        id: row.get(0)?,
        title: row.get(1)?,
        created_at: parse_datetime(&row.get::<_, String>(2)?),
        updated_at: parse_datetime(&row.get::<_, String>(3)?),
        user_id: row.get(4)?,
        execution_mode: row.get(5)?,
        project_id: row.get(6)?,
    })
}

pub fn create_message(conn: &Connection, message: &Message) -> Result<i64> {
    let tx = conn.unchecked_transaction()?;
    let last_id = insert_message(&tx, message)?;
    tx.commit()?;
    Ok(last_id)
}

/// Stores a message on a connection whose caller already holds the
/// transaction. SQLite refuses a second BEGIN, so a caller inside its own
/// transaction uses this instead of [`create_message`].
pub fn insert_message(conn: &Connection, message: &Message) -> Result<i64> {
    conn.execute(
        "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?1 AND user_id = ?2",
        params![message.conversation_id, message.user_id],
    )?;

    conn.execute(
        "INSERT INTO messages (conversation_id, user_id, role, content, tokens, cost, provider, model)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            message.conversation_id,
            message.user_id,
            message.role.as_str(),
            message.content,
            message.tokens,
            message.cost,
            message.provider,
            message.model,
        ],
    )?;

    Ok(conn.last_insert_rowid())
}

/// Fetches a single message by its primary key.
///
/// # Security Note (IDOR risk for multi-user deployments)
/// AGI Workforce is a single-user desktop application; there is no concept of
/// separate user sessions in the current data model, so a `user_id` guard is not
/// enforced here. If this codebase is ever adapted for a multi-tenant server
/// deployment, an additional `AND user_id = ?2` predicate **must** be added and
/// the caller must supply the authenticated user's ID to prevent cross-user IDOR.
pub fn get_message(conn: &Connection, id: i64) -> Result<Message> {
    conn.query_row(
        "SELECT id, conversation_id, user_id, role, content, tokens, cost, provider, model, created_at, parent_message_id, branch_id
         FROM messages
         WHERE id = ?1",
        params![id],
        map_message,
    )
}

/// The messages the model sees: a message compaction summarized is left out,
/// as its summary stands in for it. The transcript lists it with
/// [`list_messages_with_detail`].
pub fn list_messages(conn: &Connection, conversation_id: i64) -> Result<Vec<Message>> {
    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, user_id, role, content, tokens, cost, provider, model, created_at, parent_message_id, branch_id
         FROM messages
         WHERE conversation_id = ?1 AND superseded_key IS NULL AND compacted_into IS NULL
         ORDER BY created_at ASC, id ASC",
    )?;
    let messages = stmt
        .query_map(params![conversation_id], map_message)?
        .collect::<Result<Vec<_>>>()?;
    Ok(messages)
}

/// Deletes a message by its primary key.
///
/// # Security Note (IDOR risk for multi-user deployments)
/// Same caveat as `get_message`: no user_id ownership check is performed because
/// the desktop app is single-user. A multi-tenant adaptation must add
/// `AND user_id = ?2` with the authenticated caller's ID.
pub fn delete_message(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM messages WHERE id = ?1", params![id])?;
    Ok(())
}

/// Which row of a conversation a delete names: the stored id, or the id the
/// renderer gave the message when it was sent.
pub enum MessageRef<'a> {
    Id(i64),
    ClientId(&'a str),
}

/// Deletes one message of a conversation the user owns. Returns the number of
/// rows removed, 0 when the message was already gone.
pub fn delete_message_for_user(
    conn: &Connection,
    conversation_id: i64,
    message: MessageRef<'_>,
    user_id: &str,
) -> Result<usize> {
    match message {
        MessageRef::Id(id) => conn.execute(
            "DELETE FROM messages
             WHERE id = ?1
               AND conversation_id = ?2
               AND conversation_id IN (SELECT id FROM conversations WHERE user_id = ?3)",
            params![id, conversation_id, user_id],
        ),
        MessageRef::ClientId(client_id) => conn.execute(
            "DELETE FROM messages
             WHERE client_id = ?1
               AND conversation_id = ?2
               AND conversation_id IN (SELECT id FROM conversations WHERE user_id = ?3)",
            params![client_id, conversation_id, user_id],
        ),
    }
}

/// Stores the turn detail rendered live for one message. A `None` field keeps
/// what is already stored, so the user row and the assistant row can each be
/// written separately.
pub fn update_message_detail(
    conn: &Connection,
    message_id: i64,
    user_id: &str,
    client_id: Option<&str>,
    tool_calls: Option<&str>,
    thinking: Option<&str>,
    attachments: Option<&str>,
    sources: Option<&str>,
) -> Result<()> {
    let updated = conn.execute(
        "UPDATE messages
         SET client_id = COALESCE(?1, client_id),
             tool_calls = COALESCE(?2, tool_calls),
             thinking = COALESCE(?3, thinking),
             attachments = COALESCE(?4, attachments),
             sources = COALESCE(?7, sources)
         WHERE id = ?5
           AND conversation_id IN (SELECT id FROM conversations WHERE user_id = ?6)",
        params![
            client_id,
            tool_calls,
            thinking,
            attachments,
            message_id,
            user_id,
            sources
        ],
    )?;
    if updated == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(())
}

/// Lists a conversation's messages with their stored turn detail. Detail that
/// no longer parses as JSON is dropped rather than failing the whole load.
pub fn list_messages_with_detail(
    conn: &Connection,
    conversation_id: i64,
) -> Result<Vec<MessageWithDetail>> {
    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, user_id, role, content, tokens, cost, provider, model, created_at, parent_message_id, branch_id,
                tool_calls, thinking, attachments, feedback,
                compacted_into IS NOT NULL,
                EXISTS(SELECT 1 FROM messages summarized WHERE summarized.compacted_into = messages.id),
                sources
         FROM messages
         WHERE conversation_id = ?1 AND superseded_key IS NULL
         ORDER BY created_at ASC, id ASC",
    )?;
    let messages = stmt
        .query_map(params![conversation_id], |row| {
            let parse_json = |index: usize| -> Result<Option<serde_json::Value>> {
                Ok(row
                    .get::<_, Option<String>>(index)?
                    .and_then(|raw| serde_json::from_str(&raw).ok()))
            };
            Ok(MessageWithDetail {
                message: map_message(row)?,
                tool_calls: parse_json(12)?,
                thinking: row.get(13)?,
                attachments: parse_json(14)?,
                sources: parse_json(18)?,
                feedback: row.get(15)?,
                compaction: if row.get::<_, bool>(16)? {
                    Some(COMPACTION_SUMMARIZED.to_string())
                } else if row.get::<_, bool>(17)? {
                    Some(COMPACTION_SUMMARY.to_string())
                } else {
                    None
                },
            })
        })?
        .collect::<Result<Vec<_>>>()?;
    Ok(messages)
}

pub fn update_message_content(conn: &Connection, id: i64, content: String) -> Result<Message> {
    let updated = conn.execute(
        "UPDATE messages SET content = ?1 WHERE id = ?2",
        params![content, id],
    )?;
    if updated == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }

    get_message(conn, id)
}

fn map_message(row: &Row) -> Result<Message> {
    let role_str: String = row.get(3)?;
    let role = MessageRole::from_str(&role_str).ok_or_else(|| rusqlite::Error::InvalidQuery)?;

    Ok(Message {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        user_id: row.get(2)?,
        role,
        content: row.get(4)?,
        tokens: row.get(5)?,
        cost: row.get(6)?,
        provider: row.get(7)?,
        model: row.get(8)?,
        created_at: parse_datetime(&row.get::<_, String>(9)?),
        parent_message_id: row.get(10)?,
        branch_id: row.get(11)?,
    })
}

/// Whether compaction replaced message `id` in the model's history
/// (`"summarized"`) or made it to stand in for such messages (`"summary"`).
pub fn message_compaction(conn: &Connection, id: i64) -> Result<Option<&'static str>> {
    let (summarized, summary): (bool, bool) = conn.query_row(
        "SELECT compacted_into IS NOT NULL,
                EXISTS(SELECT 1 FROM messages summarized WHERE summarized.compacted_into = messages.id)
         FROM messages WHERE id = ?1",
        params![id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    Ok(if summarized {
        Some(COMPACTION_SUMMARIZED)
    } else if summary {
        Some(COMPACTION_SUMMARY)
    } else {
        None
    })
}

/// The error for an edit, retry or branch aimed at a message compaction
/// summarized, or at its summary: replacing either would hide the summarized
/// messages from the model for good.
pub fn compaction_refusal(action: &str) -> rusqlite::Error {
    rusqlite::Error::InvalidParameterName(format!(
        "a message that was summarized, or its summary, cannot be {action}; use a later message"
    ))
}

// =============================================================================
// Branching into a new conversation
// =============================================================================

fn resolve_message_id(
    conn: &Connection,
    conversation_id: i64,
    message: &MessageRef<'_>,
) -> Result<i64> {
    match message {
        MessageRef::Id(id) => conn.query_row(
            "SELECT id FROM messages WHERE id = ?1 AND conversation_id = ?2",
            params![id, conversation_id],
            |row| row.get(0),
        ),
        MessageRef::ClientId(client_id) => conn.query_row(
            "SELECT id FROM messages WHERE client_id = ?1 AND conversation_id = ?2
             ORDER BY id DESC LIMIT 1",
            params![client_id, conversation_id],
            |row| row.get(0),
        ),
    }
}

/// Copies a conversation up to and including one message into a new
/// conversation, in one transaction, and records where it branched from.
/// Returns the new conversation id.
pub fn branch_conversation(
    conn: &Connection,
    source_id: i64,
    user_id: &str,
    through: MessageRef<'_>,
) -> Result<i64> {
    let tx = conn.unchecked_transaction()?;
    let source = get_conversation(&tx, source_id, user_id)?;
    let fork_message_id = resolve_message_id(&tx, source_id, &through)?;
    if message_compaction(&tx, fork_message_id)? == Some(COMPACTION_SUMMARIZED) {
        return Err(compaction_refusal("branched from"));
    }
    let (fork_created_at, app_mode): (String, Option<String>) = tx.query_row(
        "SELECT m.created_at, c.app_mode
         FROM messages m JOIN conversations c ON c.id = m.conversation_id
         WHERE m.id = ?1",
        params![fork_message_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;

    tx.execute(
        "INSERT INTO conversations
            (title, user_id, app_mode, execution_mode, project_id,
             branched_from_conversation_id, branched_from_message_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            source.title,
            user_id,
            app_mode,
            source.execution_mode,
            source.project_id,
            source_id,
            fork_message_id
        ],
    )?;
    let branch_id = tx.last_insert_rowid();

    let copied = tx.execute(
        "INSERT INTO messages
            (conversation_id, user_id, role, content, tokens, cost, provider, model, created_at,
             tool_calls, thinking, attachments, feedback, sources)
         SELECT ?1, user_id, role, content, tokens, cost, provider, model, created_at,
                tool_calls, thinking, attachments, feedback, sources
         FROM messages
         WHERE conversation_id = ?2
           AND superseded_key IS NULL
           AND compacted_into IS NULL
           AND (created_at < ?3 OR (created_at = ?3 AND id <= ?4))
         ORDER BY created_at ASC, id ASC",
        params![branch_id, source_id, fork_created_at, fork_message_id],
    )?;
    if copied == 0 {
        return Err(rusqlite::Error::InvalidParameterName(
            "the branch would hold no message".to_string(),
        ));
    }
    let branch_point_id = tx.last_insert_rowid();
    tx.execute(
        "UPDATE conversations SET branch_point_message_id = ?1 WHERE id = ?2",
        params![branch_point_id, branch_id],
    )?;
    tx.commit()?;
    Ok(branch_id)
}

fn branch_siblings(
    conn: &Connection,
    source_id: i64,
    fork_message_id: i64,
    user_id: &str,
) -> Result<Vec<i64>> {
    let mut ids: Vec<i64> = conn
        .query_row(
            "SELECT id FROM conversations WHERE id = ?1 AND user_id = ?2",
            params![source_id, user_id],
            |row| row.get(0),
        )
        .map(|id| vec![id])
        .or_else(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => Ok(Vec::new()),
            other => Err(other),
        })?;
    let mut stmt = conn.prepare(
        "SELECT id FROM conversations
         WHERE branched_from_conversation_id = ?1
           AND branched_from_message_id = ?2
           AND user_id = ?3
         ORDER BY created_at ASC, id ASC",
    )?;
    let branches = stmt
        .query_map(params![source_id, fork_message_id, user_id], |row| {
            row.get(0)
        })?
        .collect::<Result<Vec<i64>>>()?;
    ids.extend(branches);
    Ok(ids)
}

/// The places in a conversation where it and other chats share a history: each
/// message the user branched at, and, for a branch, the message it was branched
/// from. Each group lists the sibling conversations in a stable order.
pub fn list_branch_groups(
    conn: &Connection,
    conversation_id: i64,
    user_id: &str,
) -> Result<Vec<ConversationBranchGroup>> {
    let mut groups = Vec::new();

    let mut stmt = conn.prepare(
        "SELECT DISTINCT c.branched_from_message_id, m.client_id
         FROM conversations c
         LEFT JOIN messages m ON m.id = c.branched_from_message_id
         WHERE c.branched_from_conversation_id = ?1 AND c.user_id = ?2
           AND c.branched_from_message_id IS NOT NULL",
    )?;
    let forks = stmt
        .query_map(params![conversation_id, user_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?))
        })?
        .collect::<Result<Vec<_>>>()?;
    for (fork_message_id, client_id) in forks {
        let conversation_ids = branch_siblings(conn, conversation_id, fork_message_id, user_id)?;
        groups.push(ConversationBranchGroup {
            message_id: fork_message_id,
            client_id,
            active_index: 0,
            conversation_ids,
        });
    }

    let lineage: Option<(Option<i64>, Option<i64>, Option<i64>)> = conn
        .query_row(
            "SELECT branched_from_conversation_id, branched_from_message_id, branch_point_message_id
             FROM conversations WHERE id = ?1 AND user_id = ?2",
            params![conversation_id, user_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map(Some)
        .or_else(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(other),
        })?;
    if let Some((Some(source_id), Some(fork_message_id), Some(branch_point_id))) = lineage {
        let conversation_ids = branch_siblings(conn, source_id, fork_message_id, user_id)?;
        if let Some(active_index) = conversation_ids
            .iter()
            .position(|id| *id == conversation_id)
        {
            groups.push(ConversationBranchGroup {
                message_id: branch_point_id,
                client_id: None,
                active_index,
                conversation_ids,
            });
        }
    }

    Ok(groups)
}

/// Records the thumbs feedback on one message of a conversation the user owns;
/// `None` clears it.
pub fn set_message_feedback(
    conn: &Connection,
    conversation_id: i64,
    message: MessageRef<'_>,
    user_id: &str,
    feedback: Option<&str>,
) -> Result<()> {
    if !matches!(feedback, None | Some("up") | Some("down")) {
        return Err(rusqlite::Error::InvalidParameterName(
            "feedback must be up, down or none".to_string(),
        ));
    }
    let message_id = resolve_message_id(conn, conversation_id, &message)?;
    let updated = conn.execute(
        "UPDATE messages SET feedback = ?1
         WHERE id = ?2
           AND conversation_id IN (SELECT id FROM conversations WHERE user_id = ?3)",
        params![feedback, message_id, user_id],
    )?;
    if updated == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(())
}

pub fn sum_cost_since(conn: &Connection, since: DateTime<Utc>, user_id: &str) -> Result<f64> {
    conn.query_row(
        "SELECT COALESCE(SUM(cost), 0.0)
         FROM messages
         WHERE role = 'assistant'
           AND cost IS NOT NULL
           AND created_at >= ?1
           AND user_id = ?2",
        params![to_sqlite_timestamp(since), user_id],
        |row| row.get(0),
    )
}

pub fn list_cost_timeseries(
    conn: &Connection,
    days: i64,
    provider: Option<&str>,
    model: Option<&str>,
    user_id: &str,
) -> Result<Vec<CostTimeseriesPoint>> {
    // M12: validate provider/model filter parameters before use
    if let Some(p) = provider {
        validate_provider_model(p)?;
    }
    if let Some(m) = model {
        validate_provider_model(m)?;
    }

    let span = days.max(1) - 1;
    let cutoff = start_of_day(Utc::now() - Duration::days(span));

    let mut sql = String::from(
        "SELECT DATE(created_at) AS bucket,
                COALESCE(SUM(cost), 0.0) AS total_cost
         FROM messages
         WHERE role = 'assistant'
           AND cost IS NOT NULL
           AND created_at >= ?1
           AND user_id = ?2",
    );

    let mut params: Vec<String> = vec![to_sqlite_timestamp(cutoff), user_id.to_string()];

    if let Some(provider_value) = provider {
        let placeholder = params.len() + 1;
        sql.push_str(&format!(" AND provider = ?{}", placeholder));
        params.push(provider_value.to_string());
    }

    if let Some(model_value) = model {
        let placeholder = params.len() + 1;
        sql.push_str(&format!(" AND model = ?{}", placeholder));
        params.push(model_value.to_string());
    }

    sql.push_str(" GROUP BY bucket ORDER BY bucket ASC");

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
        Ok(CostTimeseriesPoint {
            date: row.get(0)?,
            total_cost: row.get(1)?,
        })
    })?;

    rows.collect::<Result<Vec<_>>>()
}

pub fn list_cost_by_provider(
    conn: &Connection,
    start: Option<DateTime<Utc>>,
    end: Option<DateTime<Utc>>,
    provider: Option<&str>,
    model: Option<&str>,
    user_id: &str,
) -> Result<Vec<ProviderCostBreakdown>> {
    // M12: validate provider/model filter parameters before use
    if let Some(p) = provider {
        validate_provider_model(p)?;
    }
    if let Some(m) = model {
        validate_provider_model(m)?;
    }

    let mut sql = String::from(
        "SELECT COALESCE(provider, 'unknown') AS provider,
                       COALESCE(SUM(cost), 0.0) AS total_cost
                FROM messages
                WHERE role = 'assistant'
                  AND cost IS NOT NULL
                  AND user_id = ?",
    );

    let mut params: Vec<String> = vec![user_id.to_string()];

    if let Some(start_dt) = start {
        let placeholder = params.len() + 1;
        sql.push_str(&format!(" AND created_at >= ?{}", placeholder));
        params.push(to_sqlite_timestamp(start_of_day(start_dt)));
    }

    if let Some(end_dt) = end {
        let placeholder = params.len() + 1;
        sql.push_str(&format!(" AND created_at < ?{}", placeholder));
        params.push(to_sqlite_timestamp(start_of_day(
            end_dt + Duration::days(1),
        )));
    }

    if let Some(provider_value) = provider {
        let placeholder = params.len() + 1;
        sql.push_str(&format!(" AND provider = ?{}", placeholder));
        params.push(provider_value.to_string());
    }

    if let Some(model_value) = model {
        let placeholder = params.len() + 1;
        sql.push_str(&format!(" AND model = ?{}", placeholder));
        params.push(model_value.to_string());
    }

    sql.push_str(" GROUP BY provider ORDER BY total_cost DESC");

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
        Ok(ProviderCostBreakdown {
            provider: row.get(0)?,
            total_cost: row.get(1)?,
        })
    })?;
    rows.collect::<Result<Vec<_>>>()
}

pub fn list_top_conversations_by_cost(
    conn: &Connection,
    limit: usize,
    start: Option<DateTime<Utc>>,
    end: Option<DateTime<Utc>>,
    user_id: &str,
) -> Result<Vec<ConversationCostBreakdown>> {
    list_top_conversations_by_cost_filtered(conn, limit, start, end, None, None, user_id)
}

pub fn list_top_conversations_by_cost_filtered(
    conn: &Connection,
    limit: usize,
    start: Option<DateTime<Utc>>,
    end: Option<DateTime<Utc>>,
    provider: Option<&str>,
    model: Option<&str>,
    user_id: &str,
) -> Result<Vec<ConversationCostBreakdown>> {
    // M12: validate provider/model filter parameters before use
    if let Some(p) = provider {
        validate_provider_model(p)?;
    }
    if let Some(m) = model {
        validate_provider_model(m)?;
    }

    let base = "SELECT m.conversation_id,
                       c.title,
                       COALESCE(SUM(m.cost), 0.0) AS total_cost
                FROM messages m
                JOIN conversations c ON m.conversation_id = c.id
                WHERE m.role = 'assistant'
                  AND m.cost IS NOT NULL
                  AND m.user_id = ?1";

    let mut sql = String::from(base);
    let mut params: Vec<String> = vec![user_id.to_string()];

    if let Some(start_dt) = start {
        let placeholder = params.len() + 1;
        sql.push_str(&format!(" AND m.created_at >= ?{}", placeholder));
        params.push(to_sqlite_timestamp(start_of_day(start_dt)));
    }

    if let Some(end_dt) = end {
        let placeholder = params.len() + 1;
        sql.push_str(&format!(" AND m.created_at < ?{}", placeholder));
        params.push(to_sqlite_timestamp(start_of_day(
            end_dt + Duration::days(1),
        )));
    }

    if let Some(provider_value) = provider {
        let placeholder = params.len() + 1;
        sql.push_str(&format!(" AND m.provider = ?{}", placeholder));
        params.push(provider_value.to_string());
    }

    if let Some(model_value) = model {
        let placeholder = params.len() + 1;
        sql.push_str(&format!(" AND m.model = ?{}", placeholder));
        params.push(model_value.to_string());
    }

    sql.push_str(" GROUP BY m.conversation_id, c.title ORDER BY total_cost DESC");
    let placeholder = params.len() + 1;
    sql.push_str(&format!(" LIMIT ?{}", placeholder));
    params.push(limit.to_string());

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
        Ok(ConversationCostBreakdown {
            conversation_id: row.get(0)?,
            title: row.get(1)?,
            total_cost: row.get(2)?,
        })
    })?;
    rows.collect::<Result<Vec<_>>>()
}

pub fn set_setting(conn: &Connection, key: String, value: String, encrypted: bool) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value, encrypted) VALUES (?1, ?2, ?3)",
        params![key, value, encrypted as i32],
    )?;
    Ok(())
}

pub fn get_setting(conn: &Connection, key: &str) -> Result<Setting> {
    conn.query_row(
        "SELECT key, value, encrypted FROM settings WHERE key = ?1",
        params![key],
        map_setting,
    )
}

pub fn list_settings(conn: &Connection) -> Result<Vec<Setting>> {
    let mut stmt = conn.prepare("SELECT key, value, encrypted FROM settings ORDER BY key")?;

    let settings = stmt
        .query_map([], map_setting)?
        .collect::<Result<Vec<_>>>()?;

    Ok(settings)
}

pub fn delete_setting(conn: &Connection, key: &str) -> Result<()> {
    conn.execute("DELETE FROM settings WHERE key = ?1", params![key])?;
    Ok(())
}

fn map_setting(row: &Row) -> Result<Setting> {
    Ok(Setting {
        key: row.get(0)?,
        value: row.get(1)?,
        encrypted: row.get::<_, i32>(2)? != 0,
    })
}

pub fn create_automation_history(conn: &Connection, history: &AutomationHistory) -> Result<i64> {
    conn.execute(
        "INSERT INTO automation_history (task_type, success, error, duration_ms, cost)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            history.task_type.as_str(),
            history.success as i32,
            history.error,
            history.duration_ms,
            history.cost,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_automation_history(conn: &Connection, id: i64) -> Result<AutomationHistory> {
    conn.query_row(
        "SELECT id, task_type, success, error, duration_ms, cost, created_at
         FROM automation_history
         WHERE id = ?1",
        params![id],
        map_automation_history,
    )
}

pub fn list_automation_history(
    conn: &Connection,
    limit: i64,
    offset: i64,
) -> Result<Vec<AutomationHistory>> {
    let mut stmt = conn.prepare(
        "SELECT id, task_type, success, error, duration_ms, cost, created_at
         FROM automation_history
         ORDER BY created_at DESC
         LIMIT ?1 OFFSET ?2",
    )?;

    let history = stmt
        .query_map(params![limit, offset], map_automation_history)?
        .collect::<Result<Vec<_>>>()?;

    Ok(history)
}

pub fn get_automation_stats(conn: &Connection) -> Result<(i64, i64, f64, f64)> {
    conn.query_row(
        "SELECT
            COUNT(*) as total,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
            AVG(duration_ms) as avg_duration,
            SUM(COALESCE(cost, 0)) as total_cost
         FROM automation_history",
        [],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )
}

fn map_automation_history(row: &Row) -> Result<AutomationHistory> {
    let task_type_str: String = row.get(1)?;
    let task_type =
        TaskType::from_str(&task_type_str).ok_or_else(|| rusqlite::Error::InvalidQuery)?;

    Ok(AutomationHistory {
        id: row.get(0)?,
        task_type,
        success: row.get::<_, i32>(2)? != 0,
        error: row.get(3)?,
        duration_ms: row.get(4)?,
        cost: row.get(5)?,
        created_at: parse_datetime(&row.get::<_, String>(6)?),
    })
}

/// Log warnings instead of silently corrupting timestamps.
/// Returns Utc::now() as fallback but logs the parsing failure for debugging.
fn parse_datetime(s: &str) -> DateTime<Utc> {
    // Try RFC3339 format first (preferred)
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return dt.with_timezone(&Utc);
    }

    // Try SQLite format
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
        return dt.and_utc();
    }

    // Try date-only format (common in SQLite)
    if let Ok(date) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        if let Some(dt) = date.and_hms_opt(0, 0, 0) {
            return dt.and_utc();
        }
    }

    tracing::warn!(
        "Failed to parse datetime '{}', using current time as fallback. \
         Supported formats: RFC3339, 'YYYY-MM-DD HH:MM:SS', 'YYYY-MM-DD'",
        s
    );
    Utc::now()
}

fn to_sqlite_timestamp(dt: DateTime<Utc>) -> String {
    dt.format("%Y-%m-%d %H:%M:%S").to_string()
}

fn start_of_day(dt: DateTime<Utc>) -> DateTime<Utc> {
    dt.date_naive()
        .and_hms_opt(0, 0, 0)
        .map(|naive| Utc.from_utc_datetime(&naive))
        // 00:00:00 is always a valid time, so default to beginning of UNIX epoch as fallback
        .unwrap_or_else(|| DateTime::<Utc>::from_timestamp(0, 0).unwrap_or(dt))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::llm::{models_config, Provider};
    use crate::data::db::migrations::run_migrations;
    use chrono::Utc;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn test_conversation_crud() {
        let conn = setup_test_db();
        let test_user_id = "test_user";

        let id = create_conversation(
            &conn,
            "Test Conversation".to_string(),
            test_user_id.to_string(),
        )
        .unwrap();
        assert!(id > 0);

        let conv = get_conversation(&conn, id, test_user_id).unwrap();
        assert_eq!(conv.title, "Test Conversation");

        update_conversation_title(&conn, id, test_user_id, "Updated Title".to_string()).unwrap();
        let conv = get_conversation(&conn, id, test_user_id).unwrap();
        assert_eq!(conv.title, "Updated Title");

        let convs = list_conversations(&conn, 10, 0, test_user_id).unwrap();
        assert_eq!(convs.len(), 1);

        delete_conversation(&conn, id, test_user_id).unwrap();
        assert!(get_conversation(&conn, id, test_user_id).is_err());
    }

    #[test]
    fn list_pages_carry_archive_pin_and_project_and_never_repeat() {
        let conn = setup_test_db();
        let user = "user-a";
        let mut ids = Vec::new();
        for index in 0..5 {
            ids.push(
                create_conversation_with_mode(
                    &conn,
                    format!("Chat {index}"),
                    user.to_string(),
                    "local",
                )
                .unwrap(),
            );
        }
        create_conversation_with_mode(&conn, "Cloud".to_string(), user.to_string(), "cloud")
            .unwrap();
        archive_conversation(&conn, ids[0], user, true).unwrap();
        set_conversation_pinned(&conn, ids[1], user, true).unwrap();
        set_conversation_project(&conn, ids[2], user, Some("project-1")).unwrap();
        assert!(set_conversation_pinned(&conn, ids[1], "user-b", true).is_err());

        let first = list_conversations_by_mode(&conn, 3, 0, user, Some("local")).unwrap();
        let second = list_conversations_by_mode(&conn, 3, 3, user, Some("local")).unwrap();
        let all: Vec<_> = first.iter().chain(second.iter()).collect();
        assert_eq!(all.len(), 5);
        let mut seen: Vec<i64> = all.iter().map(|item| item.conversation.id).collect();
        seen.sort_unstable();
        seen.dedup();
        assert_eq!(seen.len(), 5, "a page repeated or skipped a conversation");

        let find = |id: i64| all.iter().find(|item| item.conversation.id == id).unwrap();
        assert!(find(ids[0]).archived);
        assert!(find(ids[1]).pinned);
        assert_eq!(
            find(ids[2]).conversation.project_id.as_deref(),
            Some("project-1")
        );

        set_conversation_project(&conn, ids[2], user, None).unwrap();
        assert_eq!(
            get_conversation(&conn, ids[2], user).unwrap().project_id,
            None
        );
        assert_eq!(
            list_conversations_by_mode(&conn, 10, 0, user, None)
                .unwrap()
                .len(),
            6
        );
    }

    #[test]
    fn message_detail_round_trips_and_client_id_deletes_only_the_owner_rows() {
        let conn = setup_test_db();
        let user = "user-a";
        let conv_id = create_conversation(&conn, "Detail".to_string(), user.to_string()).unwrap();
        let message_id = create_message(
            &conn,
            &Message::new(
                conv_id,
                user.to_string(),
                MessageRole::Assistant,
                "Done".to_string(),
            ),
        )
        .unwrap();

        update_message_detail(
            &conn,
            message_id,
            user,
            Some("client-1"),
            Some(r#"[{"id":"t1","name":"web_search","args":{},"status":"completed"}]"#),
            Some("Checked the docs first."),
            None,
            Some(
                r#"[{"id":"t1","query":"rust async","results":[{"url":"https://tokio.rs/","title":"Tokio"}],"resultCount":1}]"#,
            ),
        )
        .unwrap();
        assert!(update_message_detail(
            &conn,
            message_id,
            "user-b",
            None,
            None,
            Some("x"),
            None,
            None
        )
        .is_err());
        update_message_detail(&conn, message_id, user, None, None, None, None, None).unwrap();

        let stored = list_messages_with_detail(&conn, conv_id).unwrap();
        assert_eq!(stored.len(), 1);
        assert_eq!(
            stored[0].thinking.as_deref(),
            Some("Checked the docs first.")
        );
        assert_eq!(
            stored[0]
                .tool_calls
                .as_ref()
                .and_then(|calls| calls[0]["name"].as_str()),
            Some("web_search")
        );
        assert!(stored[0].attachments.is_none());
        assert_eq!(
            stored[0]
                .sources
                .as_ref()
                .and_then(|searches| searches[0]["results"][0]["url"].as_str()),
            Some("https://tokio.rs/"),
            "a later detail write that carries no sources must keep the stored ones"
        );

        assert_eq!(
            delete_message_for_user(&conn, conv_id, MessageRef::ClientId("client-1"), "user-b")
                .unwrap(),
            0
        );
        assert_eq!(
            delete_message_for_user(&conn, conv_id, MessageRef::ClientId("client-1"), user)
                .unwrap(),
            1
        );
        assert!(list_messages(&conn, conv_id).unwrap().is_empty());
    }

    #[test]
    fn feedback_is_stored_cleared_and_validated() {
        let conn = setup_test_db();
        let conv_id = create_conversation(&conn, "Rate".to_string(), "user".to_string()).unwrap();
        let reply = create_message(
            &conn,
            &Message::new(
                conv_id,
                "user".to_string(),
                MessageRole::Assistant,
                "ok".to_string(),
            ),
        )
        .unwrap();

        set_message_feedback(&conn, conv_id, MessageRef::Id(reply), "user", Some("down")).unwrap();
        assert_eq!(
            list_messages_with_detail(&conn, conv_id).unwrap()[0]
                .feedback
                .as_deref(),
            Some("down")
        );
        assert!(
            set_message_feedback(&conn, conv_id, MessageRef::Id(reply), "user", Some("meh"))
                .is_err()
        );
        assert!(set_message_feedback(
            &conn,
            conv_id,
            MessageRef::Id(reply),
            "intruder",
            Some("up")
        )
        .is_err());
        set_message_feedback(&conn, conv_id, MessageRef::Id(reply), "user", None).unwrap();
        assert_eq!(
            list_messages_with_detail(&conn, conv_id).unwrap()[0].feedback,
            None
        );
    }

    #[test]
    fn test_message_crud() {
        let conn = setup_test_db();
        let test_user_id = "test_user";

        let conv_id =
            create_conversation(&conn, "Test".to_string(), test_user_id.to_string()).unwrap();
        let msg = Message::new(
            conv_id,
            test_user_id.to_string(),
            MessageRole::User,
            "Hello".to_string(),
        );

        let id = create_message(&conn, &msg).unwrap();
        assert!(id > 0);

        let retrieved = get_message(&conn, id).unwrap();
        assert_eq!(retrieved.content, "Hello");
        assert_eq!(retrieved.role, MessageRole::User);

        let messages = list_messages(&conn, conv_id).unwrap();
        assert_eq!(messages.len(), 1);
    }

    #[test]
    fn test_settings_crud() {
        let conn = setup_test_db();

        set_setting(&conn, "theme".to_string(), "dark".to_string(), false).unwrap();

        let setting = get_setting(&conn, "theme").unwrap();
        assert_eq!(setting.value, "dark");
        assert!(!setting.encrypted);

        let settings = list_settings(&conn).unwrap();
        assert!(settings.iter().any(|s| s.key == "theme"));

        delete_setting(&conn, "theme").unwrap();
        assert!(get_setting(&conn, "theme").is_err());
    }

    #[test]
    fn test_cost_analytics_empty() {
        let conn = setup_test_db();
        let test_user_id = "test_user";

        let total = sum_cost_since(&conn, Utc::now(), test_user_id).unwrap();
        assert_eq!(total, 0.0);

        let timeseries = list_cost_timeseries(&conn, 7, None, None, test_user_id).unwrap();
        assert!(timeseries.is_empty());

        let providers = list_cost_by_provider(&conn, None, None, None, None, test_user_id).unwrap();
        assert!(providers.is_empty());

        let top = list_top_conversations_by_cost(&conn, 5, None, None, test_user_id).unwrap();
        assert!(top.is_empty());
    }

    #[test]
    fn test_cost_analytics_filters() {
        let conn = setup_test_db();
        let test_user_id = "test_user";

        let conv_a = create_conversation(
            &conn,
            "Conversation A".to_string(),
            test_user_id.to_string(),
        )
        .unwrap();
        let conv_b = create_conversation(
            &conn,
            "Conversation B".to_string(),
            test_user_id.to_string(),
        )
        .unwrap();

        let mut message_a = Message::new(
            conv_a,
            test_user_id.to_string(),
            MessageRole::Assistant,
            "Response A".to_string(),
        )
        .with_metrics(100, 0.5);
        message_a.provider = Some("openai".to_string());
        // Catalog: see packages/contracts/types/src/models.json
        message_a.model = Some(models_config::get_default_model(&Provider::OpenAI).to_string());
        create_message(&conn, &message_a).unwrap();

        let mut message_b = Message::new(
            conv_b,
            test_user_id.to_string(),
            MessageRole::Assistant,
            "Response B".to_string(),
        )
        .with_metrics(80, 0.2);
        message_b.provider = Some("google".to_string());
        message_b.model = Some("fixture-database-model".to_string());
        create_message(&conn, &message_b).unwrap();

        let all_timeseries = list_cost_timeseries(&conn, 7, None, None, test_user_id).unwrap();
        assert_eq!(all_timeseries.len(), 1);
        assert!((all_timeseries[0].total_cost - 0.7).abs() < f64::EPSILON);

        let openai_timeseries =
            list_cost_timeseries(&conn, 7, Some("openai"), None, test_user_id).unwrap();
        assert_eq!(openai_timeseries.len(), 1);
        assert!((openai_timeseries[0].total_cost - 0.5).abs() < f64::EPSILON);

        let providers = list_cost_by_provider(&conn, None, None, None, None, test_user_id).unwrap();
        assert_eq!(providers.len(), 2);
        assert!(providers
            .iter()
            .any(|p| p.provider == "openai" && (p.total_cost - 0.5).abs() < f64::EPSILON));

        let google_only =
            list_cost_by_provider(&conn, None, None, Some("google"), None, test_user_id).unwrap();
        assert_eq!(google_only.len(), 1);
        assert_eq!(google_only[0].provider, "google");

        let top_openai = list_top_conversations_by_cost_filtered(
            &conn,
            5,
            None,
            None,
            Some("openai"),
            None,
            test_user_id,
        )
        .unwrap();
        assert_eq!(top_openai.len(), 1);
        assert_eq!(top_openai[0].conversation_id, conv_a);
    }
}
