use chrono::Utc;
use once_cell::sync::Lazy;
use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use tracing::{info, warn};

use crate::data::db::models::{Message, MessageRole};
use crate::data::db::repository;

use super::state::{AppDatabase, MAX_PENDING_MESSAGE_CHARS, PENDING_MESSAGES};

pub(crate) const MAX_PENDING_MESSAGES_PER_CONVERSATION: usize = 20;

/// How many settled steer ids are remembered, so a late or repeated
/// withdrawal still gets a truthful answer.
const SETTLED_STEERS_REMEMBERED: usize = 256;

/// What happened to a steer that left the queue.
#[derive(Debug, Clone)]
enum Settled {
    /// The turn sent it to the model.
    Consumed,
    /// The user withdrew it.
    Withdrawn(PendingUserMessage),
    /// Its turn ended or was stopped before it was sent.
    Discarded(PendingUserMessage),
}

#[derive(Default)]
struct SettledSteers {
    by_id: HashMap<String, Settled>,
    order: VecDeque<String>,
}

impl SettledSteers {
    fn record(&mut self, id: &str, settled: Settled) {
        if self.by_id.insert(id.to_string(), settled).is_none() {
            self.order.push_back(id.to_string());
        }
        while self.order.len() > SETTLED_STEERS_REMEMBERED {
            if let Some(oldest) = self.order.pop_front() {
                self.by_id.remove(&oldest);
            }
        }
    }

    fn is_withdrawn(&self, id: &str) -> bool {
        matches!(self.by_id.get(id), Some(Settled::Withdrawn(_)))
    }
}

/// Lock order: `PENDING_MESSAGES` first, then this.
static SETTLED_STEERS: Lazy<Mutex<SettledSteers>> =
    Lazy::new(|| Mutex::new(SettledSteers::default()));

/// The result of withdrawing a steer by id.
#[derive(Debug, Clone)]
pub(crate) enum Withdrawal {
    /// It was still queued and is now removed.
    Withdrawn(PendingUserMessage),
    /// It had already left the queue without reaching the model: withdrawn
    /// earlier, or dropped when its turn ended or stopped.
    AlreadyRemoved(PendingUserMessage),
    /// The model already received it.
    Consumed,
    /// No steer with this id is known.
    Unknown,
}

impl Withdrawal {
    pub(crate) fn was_consumed(&self) -> bool {
        matches!(self, Withdrawal::Consumed)
    }
}

/// Withdraws a steer by id. Safe to call more than once and after the turn
/// consumed it; the answer says which happened.
pub(crate) fn withdraw_pending_message(id: &str, conversation_id: Option<i64>) -> Withdrawal {
    let Ok(mut queue) = PENDING_MESSAGES.lock() else {
        return Withdrawal::Unknown;
    };
    let Ok(mut settled) = SETTLED_STEERS.lock() else {
        return Withdrawal::Unknown;
    };
    let position = queue.iter().position(|message| {
        message.id == id
            && conversation_id
                .map(|cid| message.conversation_id == Some(cid))
                .unwrap_or(true)
    });
    if let Some(position) = position {
        let message = queue.remove(position);
        settled.record(id, Settled::Withdrawn(message.clone()));
        return Withdrawal::Withdrawn(message);
    }
    match settled.by_id.get(id) {
        Some(Settled::Consumed) => Withdrawal::Consumed,
        Some(Settled::Withdrawn(message)) | Some(Settled::Discarded(message)) => {
            Withdrawal::AlreadyRemoved(message.clone())
        }
        None => Withdrawal::Unknown,
    }
}

/// Drops the steers still queued for a conversation whose turn ended or was
/// stopped, so a later turn can never send them.
pub(crate) fn discard_pending_messages_for_conversation(conversation_id: i64) -> usize {
    let Ok(mut queue) = PENDING_MESSAGES.lock() else {
        return 0;
    };
    let Ok(mut settled) = SETTLED_STEERS.lock() else {
        return 0;
    };
    let before = queue.len();
    queue.retain(|message| {
        if message.conversation_id == Some(conversation_id) {
            settled.record(&message.id, Settled::Discarded(message.clone()));
            false
        } else {
            true
        }
    });
    let discarded = before - queue.len();
    if discarded > 0 {
        info!("[Chat] Dropped {discarded} unsent steer(s) for conversation {conversation_id}");
    }
    discarded
}

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PendingUserMessage {
    pub id: String,
    pub content: String,
    pub timestamp: chrono::DateTime<Utc>,
    pub conversation_id: Option<i64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AddPendingMessageRequest {
    pub content: String,
    #[serde(default, alias = "conversationId")]
    pub conversation_id: Option<i64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PopPendingMessageRequest {
    #[serde(default, alias = "conversationId")]
    pub conversation_id: Option<i64>,
    #[serde(alias = "pendingMessageId")]
    pub pending_message_id: String,
}

// ============================================================================
// Tauri command handlers
// ============================================================================

#[tauri::command]
pub async fn chat_add_pending_message(
    request: AddPendingMessageRequest,
) -> Result<PendingUserMessage, String> {
    let trimmed_content = request.content.trim();
    if trimmed_content.is_empty() {
        return Err("Pending message content cannot be empty".to_string());
    }
    if trimmed_content.len() > MAX_PENDING_MESSAGE_CHARS {
        return Err(format!(
            "Pending message content cannot exceed {} characters",
            MAX_PENDING_MESSAGE_CHARS
        ));
    }

    if let Some(reason) = crate::ui::hooks::lifecycle::steered_prompt_submitted(
        request.conversation_id,
        trimmed_content,
    )
    .await
    {
        return Err(crate::ui::hooks::prompt_refusal(&reason));
    }

    let pending_msg = PendingUserMessage {
        id: uuid::Uuid::new_v4().to_string(),
        content: trimmed_content.to_string(),
        timestamp: Utc::now(),
        conversation_id: request.conversation_id,
    };

    {
        let mut queue = PENDING_MESSAGES
            .lock()
            .map_err(|e| format!("Failed to lock pending messages queue: {e}"))?;
        enqueue_pending_message(&mut queue, pending_msg.clone())?;
        info!(
            "[Chat] Added pending message (queue size: {}): {}...",
            queue.len(),
            &trimmed_content.chars().take(50).collect::<String>()
        );
    }

    Ok(pending_msg)
}

#[tauri::command]
pub async fn chat_pop_pending_message(
    request: PopPendingMessageRequest,
) -> Result<Option<PendingUserMessage>, String> {
    // The answer is `Some` whenever the message did not reach the model, so a
    // repeated withdrawal gets the same answer.
    let withdrawal = withdraw_pending_message(&request.pending_message_id, request.conversation_id);
    if withdrawal.was_consumed() {
        info!(
            "[Chat] Steer {} was already sent to the model",
            request.pending_message_id
        );
    }
    Ok(match withdrawal {
        Withdrawal::Withdrawn(message) | Withdrawal::AlreadyRemoved(message) => Some(message),
        Withdrawal::Consumed | Withdrawal::Unknown => None,
    })
}

// ============================================================================
// Utility functions (used internally by streaming / agentic loop)
// ============================================================================

fn enqueue_pending_message(
    queue: &mut Vec<PendingUserMessage>,
    message: PendingUserMessage,
) -> Result<(), String> {
    let queued_for_conversation = queue
        .iter()
        .filter(|queued| queued.conversation_id == message.conversation_id)
        .count();
    if queued_for_conversation >= MAX_PENDING_MESSAGES_PER_CONVERSATION {
        return Err(format!(
            "Pending message queue is full (max {MAX_PENDING_MESSAGES_PER_CONVERSATION} messages). Please wait for the agent to process current messages."
        ));
    }
    queue.push(message);
    Ok(())
}

/// Check if there are pending messages (used by tool executor)
pub fn has_pending_messages() -> bool {
    PENDING_MESSAGES
        .lock()
        .map(|q| !q.is_empty())
        .unwrap_or(false)
}

// Check pending messages for a specific conversation
pub fn has_pending_messages_for_conversation(conversation_id: i64) -> bool {
    PENDING_MESSAGES
        .lock()
        .map(|q| q.iter().any(|m| m.conversation_id == Some(conversation_id)))
        .unwrap_or(false)
}

/// Get pending messages count
pub fn pending_messages_count() -> usize {
    PENDING_MESSAGES.lock().map(|q| q.len()).unwrap_or(0)
}

// Peek at pending messages for a specific conversation
pub fn peek_pending_messages_for_conversation(conversation_id: i64) -> Vec<PendingUserMessage> {
    PENDING_MESSAGES
        .lock()
        .map(|q| {
            q.iter()
                .filter(|m| m.conversation_id == Some(conversation_id))
                .cloned()
                .collect()
        })
        .unwrap_or_default()
}

/// Pop the first pending message for a specific conversation (used by agentic
/// loop) and record it as consumed. A message already withdrawn is skipped.
pub fn pop_pending_message_for_conversation(conversation_id: i64) -> Option<PendingUserMessage> {
    let mut queue = PENDING_MESSAGES.lock().ok()?;
    let mut settled = SETTLED_STEERS.lock().ok()?;
    queue.retain(|message| !settled.is_withdrawn(&message.id));
    let idx = queue
        .iter()
        .position(|m| m.conversation_id == Some(conversation_id))?;
    let message = queue.remove(idx);
    settled.record(&message.id, Settled::Consumed);
    Some(message)
}

/// Saves a message the user steered into a running turn so it stays in the
/// conversation history after the turn ends.
pub(crate) fn persist_steered_message(
    db: &AppDatabase,
    conversation_id: i64,
    user_id: &str,
    content: &str,
) -> Option<i64> {
    let conn = match db.connection() {
        Ok(conn) => conn,
        Err(error) => {
            warn!("[Chat] Failed to open database for steered message: {error}");
            return None;
        }
    };
    let message = Message::new(
        conversation_id,
        user_id.to_string(),
        MessageRole::User,
        content.to_string(),
    );
    let id = match repository::create_message(&conn, &message) {
        Ok(id) => id,
        Err(error) => {
            warn!("[Chat] Failed to save steered message: {error}");
            return None;
        }
    };
    Some(id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pending(id: &str, conversation_id: i64) -> PendingUserMessage {
        PendingUserMessage {
            id: id.to_string(),
            content: "queued".to_string(),
            timestamp: Utc::now(),
            conversation_id: Some(conversation_id),
        }
    }

    #[test]
    fn pending_queue_cap_is_per_conversation() {
        let mut queue = Vec::new();
        for index in 0..MAX_PENDING_MESSAGES_PER_CONVERSATION {
            enqueue_pending_message(&mut queue, pending(&format!("a-{index}"), 1))
                .expect("under the cap");
        }

        assert!(enqueue_pending_message(&mut queue, pending("a-over", 1)).is_err());
        assert!(enqueue_pending_message(&mut queue, pending("b-0", 2)).is_ok());
    }

    #[test]
    fn pop_for_conversation_leaves_other_conversations_queued() {
        {
            let mut queue = PENDING_MESSAGES.lock().expect("pending queue lock");
            queue.retain(|message| {
                message.conversation_id != Some(8_901) && message.conversation_id != Some(8_902)
            });
            queue.push(PendingUserMessage {
                id: "steer-a".to_string(),
                content: "for a".to_string(),
                timestamp: Utc::now(),
                conversation_id: Some(8_901),
            });
            queue.push(PendingUserMessage {
                id: "steer-b".to_string(),
                content: "for b".to_string(),
                timestamp: Utc::now(),
                conversation_id: Some(8_902),
            });
        }

        let popped = pop_pending_message_for_conversation(8_902).expect("message for b");
        assert_eq!(popped.id, "steer-b");
        assert!(has_pending_messages_for_conversation(8_901));
        assert!(!has_pending_messages_for_conversation(8_902));

        PENDING_MESSAGES
            .lock()
            .expect("pending queue lock")
            .retain(|message| message.conversation_id != Some(8_901));
    }

    fn queue_steer(id: &str, conversation_id: i64) {
        let mut queue = PENDING_MESSAGES.lock().expect("pending queue lock");
        queue.retain(|message| message.conversation_id != Some(conversation_id));
        queue.push(pending(id, conversation_id));
    }

    #[test]
    fn withdrawing_twice_gives_the_same_answer() {
        queue_steer("steer-w", 8_911);

        assert!(matches!(
            withdraw_pending_message("steer-w", Some(8_911)),
            Withdrawal::Withdrawn(_)
        ));
        assert!(matches!(
            withdraw_pending_message("steer-w", Some(8_911)),
            Withdrawal::AlreadyRemoved(_)
        ));
        assert!(pop_pending_message_for_conversation(8_911).is_none());
    }

    #[test]
    fn withdrawing_after_the_turn_sent_it_reports_consumed() {
        queue_steer("steer-c", 8_912);

        let sent = pop_pending_message_for_conversation(8_912).expect("steer sent");
        assert_eq!(sent.id, "steer-c");

        let late = withdraw_pending_message("steer-c", Some(8_912));
        assert!(late.was_consumed());
    }

    #[test]
    fn a_withdrawn_steer_is_never_injected() {
        queue_steer("steer-x", 8_913);
        SETTLED_STEERS
            .lock()
            .expect("settled lock")
            .record("steer-x", Settled::Withdrawn(pending("steer-x", 8_913)));

        assert!(pop_pending_message_for_conversation(8_913).is_none());
        assert!(!has_pending_messages_for_conversation(8_913));
    }

    #[test]
    fn ending_a_turn_drops_its_unsent_steers_only() {
        queue_steer("steer-end", 8_914);
        queue_steer("steer-other", 8_915);

        assert_eq!(discard_pending_messages_for_conversation(8_914), 1);

        assert!(!has_pending_messages_for_conversation(8_914));
        assert!(has_pending_messages_for_conversation(8_915));
        assert!(matches!(
            withdraw_pending_message("steer-end", Some(8_914)),
            Withdrawal::AlreadyRemoved(_)
        ));
        discard_pending_messages_for_conversation(8_915);
    }

    #[test]
    fn steered_message_is_saved_to_history() {
        let db = crate::data::db::Database::in_memory().expect("in-memory db");
        let app_db = AppDatabase {
            conn: db.get_connection(),
        };
        let conversation_id = {
            let conn = app_db.connection().expect("db connection");
            repository::create_conversation(&conn, "Steer".to_string(), "user-1".to_string())
                .expect("conversation")
        };

        let id = persist_steered_message(&app_db, conversation_id, "user-1", "use tabs")
            .expect("steered message id");

        let conn = app_db.connection().expect("db connection");
        let saved = repository::get_message(&conn, id).expect("saved message");
        assert_eq!(saved.content, "use tabs");
        assert_eq!(saved.role, MessageRole::User);
    }
}
