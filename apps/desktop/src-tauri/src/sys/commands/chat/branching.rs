use crate::data::db::models::{ConversationBranch, ForkResult, Message, DEFAULT_BRANCH_ID};
use crate::data::db::repository;
use crate::sys::commands::chat::AppDatabase;
use rusqlite::params;
use tauri::State;
use uuid::Uuid;

/// Verifies that the conversation exists and (optionally) belongs to the given user.
/// When `user_id` is provided, checks ownership. When None, only verifies existence.
fn verify_conversation_access(
    conn: &rusqlite::Connection,
    conversation_id: i64,
    user_id: Option<&str>,
) -> Result<(), String> {
    let owner: String = conn
        .query_row(
            "SELECT user_id FROM conversations WHERE id = ?1",
            params![conversation_id],
            |row| row.get(0),
        )
        .map_err(|_| format!("Conversation {} not found", conversation_id))?;
    if let Some(uid) = user_id {
        if !uid.is_empty() && owner != uid {
            return Err("Not authorized to access this conversation".to_string());
        }
    }
    Ok(())
}

/// Fork a conversation at a specific message, creating a new branch.
///
/// Copies all messages from the start of the conversation up to and including
/// `message_id` into the new branch, then returns the new branch and copied messages.
#[tauri::command]
pub fn conversation_fork(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
    message_id: i64,
    branch_name: String,
    user_id: Option<String>,
) -> Result<ForkResult, String> {
    if conversation_id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            conversation_id
        ));
    }
    if message_id <= 0 {
        return Err(format!(
            "Invalid message ID: {}. ID must be positive",
            message_id
        ));
    }
    let trimmed_name = branch_name.trim();
    if trimmed_name.is_empty() {
        return Err("Branch name cannot be empty".to_string());
    }
    if trimmed_name.len() > 200 {
        return Err("Branch name cannot exceed 200 characters".to_string());
    }

    let conn = db.connection()?;

    // Verify the caller has access to this conversation
    verify_conversation_access(&conn, conversation_id, user_id.as_deref())?;

    // Verify the fork-point message exists and belongs to this conversation
    let fork_msg = repository::get_message(&conn, message_id)
        .map_err(|e| format!("Fork-point message not found: {e}"))?;
    if fork_msg.conversation_id != conversation_id {
        return Err("Fork-point message does not belong to this conversation".to_string());
    }
    let source_branch = fork_msg
        .branch_id
        .clone()
        .unwrap_or_else(|| DEFAULT_BRANCH_ID.to_string());

    let new_branch_id = Uuid::new_v4().to_string();

    // Fetch messages up to and including the fork point on the source branch
    let messages_to_copy =
        repository::list_messages_by_branch(&conn, conversation_id, Some(&source_branch))
            .map_err(|e| format!("Failed to list source branch messages: {e}"))?
            .into_iter()
            .filter(|m| m.id <= message_id)
            .collect::<Vec<_>>();

    // Create the branch record
    let branch = repository::create_branch(
        &conn,
        conversation_id,
        Some(&source_branch),
        Some(message_id),
        trimmed_name,
        &new_branch_id,
    )
    .map_err(|e| format!("Failed to create branch: {e}"))?;

    // Copy messages into the new branch — use a transaction for atomicity
    // unchecked_transaction is safe here: we are not inside another transaction scope
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    for src in &messages_to_copy {
        let mut copy = src.clone();
        copy.id = 0;
        copy.branch_id = Some(new_branch_id.clone());
        copy.parent_message_id = Some(src.id);
        repository::create_message(&tx, &copy)
            .map_err(|e| format!("Failed to copy message {}: {e}", src.id))?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    // Return the branch and the copied messages for the new branch
    let new_messages =
        repository::list_messages_by_branch(&conn, conversation_id, Some(&new_branch_id))
            .map_err(|e| format!("Failed to list new branch messages: {e}"))?;

    Ok(ForkResult {
        branch,
        messages: new_messages,
    })
}

/// List all branches for a conversation.
#[tauri::command]
pub fn conversation_list_branches(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
    user_id: Option<String>,
) -> Result<Vec<ConversationBranch>, String> {
    if conversation_id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            conversation_id
        ));
    }
    let conn = db.connection()?;
    verify_conversation_access(&conn, conversation_id, user_id.as_deref())?;
    repository::list_branches(&conn, conversation_id).map_err(|e| {
        format!(
            "Failed to list branches for conversation {}: {e}",
            conversation_id
        )
    })
}

/// Switch to a branch — returns all messages on that branch in order.
#[tauri::command]
pub fn conversation_switch_branch(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
    branch_id: String,
    user_id: Option<String>,
) -> Result<Vec<Message>, String> {
    if conversation_id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            conversation_id
        ));
    }
    if branch_id.is_empty() {
        return Err("Branch ID cannot be empty".to_string());
    }
    let conn = db.connection()?;
    verify_conversation_access(&conn, conversation_id, user_id.as_deref())?;
    repository::list_messages_by_branch(&conn, conversation_id, Some(&branch_id)).map_err(|e| {
        format!(
            "Failed to load branch '{}' for conversation {}: {e}",
            branch_id, conversation_id
        )
    })
}

/// Delete a branch and all its messages. Refuses to delete 'main'.
#[tauri::command]
pub fn conversation_delete_branch(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
    branch_id: String,
    user_id: Option<String>,
) -> Result<(), String> {
    if conversation_id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            conversation_id
        ));
    }
    if branch_id == DEFAULT_BRANCH_ID {
        return Err("Cannot delete the 'main' branch".to_string());
    }
    if branch_id.is_empty() {
        return Err("Branch ID cannot be empty".to_string());
    }
    let conn = db.connection()?;
    verify_conversation_access(&conn, conversation_id, user_id.as_deref())?;
    repository::delete_branch(&conn, conversation_id, &branch_id)
        .map_err(|e| format!("Failed to delete branch '{}': {e}", branch_id))
}
