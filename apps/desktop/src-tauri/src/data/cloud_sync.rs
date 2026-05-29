//! Local-only cloud sync boundary for conversations and messages.
//!
//! SQLite remains the source of truth for Desktop v1. Cloud chat persistence is
//! intentionally not implemented in the native runtime until the Web API
//! boundary is available and explicitly enabled.

use serde::Serialize;

use super::db::models::{Conversation, Message};

/// Result from a bulk sync operation.
#[derive(Debug, Clone, Serialize)]
pub struct BulkSyncResult {
    pub conversations_synced: usize,
    pub conversations_failed: usize,
    pub messages_synced: usize,
    pub messages_failed: usize,
}

/// Fail-closed cloud sync client placeholder.
pub struct CloudSyncClient;

impl CloudSyncClient {
    pub fn new() -> Option<Self> {
        Some(Self)
    }

    pub async fn bulk_sync(
        &self,
        conversations: &[Conversation],
        messages: &[Message],
    ) -> BulkSyncResult {
        BulkSyncResult {
            conversations_synced: 0,
            conversations_failed: conversations.len(),
            messages_synced: 0,
            messages_failed: messages.len(),
        }
    }
}

/// No-op: Desktop v1 must not silently sync a local conversation to cloud.
pub fn spawn_sync_conversation(_conversation: Conversation) {}

/// No-op: Desktop v1 must not silently sync a local message to cloud.
pub fn spawn_sync_message(_message: Message) {}

#[cfg(test)]
pub(crate) fn test_take_spawn_count() -> usize {
    0
}
