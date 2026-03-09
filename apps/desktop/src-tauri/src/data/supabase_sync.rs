//! Best-effort Supabase sync for conversations and messages.
//!
//! SQLite remains the source of truth. All Supabase writes are fire-and-forget:
//! they are spawned as background tokio tasks and never block the main chat flow.
//! On failure, a warning is logged and the operation is silently dropped.

use base64::Engine;
use reqwest::Client;
use serde::Serialize;
use tracing::{debug, warn};
use uuid::Uuid;

use super::db::models::{Conversation, Message};

/// Namespace UUID for deterministic cloud ID generation (uuid v5).
const SYNC_NAMESPACE: Uuid = Uuid::from_bytes([
    0x6b, 0xa7, 0xb8, 0x10, 0x9d, 0xad, 0x11, 0xd1, 0x80, 0xb4, 0x00, 0xc0, 0x4f, 0xd4, 0x30,
    0xc8,
]);

/// Best-effort Supabase sync client.
pub struct SupabaseSyncClient {
    http_client: Client,
    supabase_url: String,
    supabase_anon_key: String,
}

#[derive(Serialize)]
struct SupabaseConversation {
    id: String,
    user_id: String,
    title: Option<String>,
    model: Option<String>,
    provider: Option<String>,
    created_at: String,
    updated_at: String,
    message_count: i32,
    source: String,
    metadata: serde_json::Value,
}

#[derive(Serialize)]
struct SupabaseMessage {
    id: String,
    conversation_id: String,
    user_id: String,
    role: String,
    content: String,
    model: Option<String>,
    provider: Option<String>,
    token_count: Option<i32>,
    cost: Option<f64>,
    created_at: String,
    metadata: serde_json::Value,
}

/// Result from a bulk sync operation.
#[derive(Debug, Clone, Serialize)]
pub struct BulkSyncResult {
    pub conversations_synced: usize,
    pub conversations_failed: usize,
    pub messages_synced: usize,
    pub messages_failed: usize,
}

impl SupabaseSyncClient {
    /// Create a new sync client. Returns `None` if Supabase is not configured.
    pub fn new() -> Option<Self> {
        let supabase_url = std::env::var("VITE_SUPABASE_URL")
            .or_else(|_| std::env::var("SUPABASE_URL"))
            .unwrap_or_default();
        let supabase_anon_key = std::env::var("VITE_SUPABASE_ANON_KEY")
            .or_else(|_| std::env::var("SUPABASE_ANON_KEY"))
            .unwrap_or_default();

        if supabase_url.is_empty() || supabase_anon_key.is_empty() {
            debug!("Supabase sync disabled: missing URL or anon key");
            return None;
        }

        let http_client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .ok()?;

        Some(Self {
            http_client,
            supabase_url,
            supabase_anon_key,
        })
    }

    /// Get the user's JWT and extract their Supabase UUID from the `sub` claim.
    fn get_auth() -> Option<(String, String)> {
        let jwt = crate::sys::account::get_access_token().ok()?;
        let user_uuid = extract_jwt_sub(&jwt)?;
        Some((jwt, user_uuid))
    }

    /// Generate a deterministic cloud UUID for a conversation.
    pub fn conversation_cloud_id(user_uuid: &str, local_id: i64) -> Uuid {
        Uuid::new_v5(
            &SYNC_NAMESPACE,
            format!("{user_uuid}:conv:{local_id}").as_bytes(),
        )
    }

    /// Generate a deterministic cloud UUID for a message.
    pub fn message_cloud_id(user_uuid: &str, local_id: i64) -> Uuid {
        Uuid::new_v5(
            &SYNC_NAMESPACE,
            format!("{user_uuid}:msg:{local_id}").as_bytes(),
        )
    }

    /// Sync a single conversation to Supabase (upsert via deterministic UUID).
    pub async fn sync_conversation(&self, conversation: &Conversation) -> Result<(), String> {
        let (jwt, user_uuid) =
            Self::get_auth().ok_or_else(|| "Not authenticated — skipping sync".to_string())?;

        let cloud_id = Self::conversation_cloud_id(&user_uuid, conversation.id);
        let payload = SupabaseConversation {
            id: cloud_id.to_string(),
            user_id: user_uuid,
            title: Some(conversation.title.clone()),
            model: None,
            provider: None,
            created_at: conversation.created_at.to_rfc3339(),
            updated_at: conversation.updated_at.to_rfc3339(),
            message_count: 0,
            source: "desktop".to_string(),
            metadata: serde_json::json!({"local_id": conversation.id}),
        };

        let url = format!("{}/rest/v1/conversations", self.supabase_url);
        let res = self
            .http_client
            .post(&url)
            .header("apikey", &self.supabase_anon_key)
            .header("Authorization", format!("Bearer {jwt}"))
            .header("Content-Type", "application/json")
            .header("Prefer", "resolution=merge-duplicates")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Supabase sync request failed: {e}"))?;

        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(format!(
                "Supabase conversation sync error {status}: {text}"
            ));
        }

        debug!(
            "Synced conversation {} -> {} to Supabase",
            conversation.id, cloud_id
        );
        Ok(())
    }

    /// Sync a single message to Supabase (upsert via deterministic UUID).
    pub async fn sync_message(&self, message: &Message) -> Result<(), String> {
        let (jwt, user_uuid) =
            Self::get_auth().ok_or_else(|| "Not authenticated — skipping sync".to_string())?;

        let cloud_conv_id =
            Self::conversation_cloud_id(&user_uuid, message.conversation_id);
        let cloud_msg_id = Self::message_cloud_id(&user_uuid, message.id);

        let payload = SupabaseMessage {
            id: cloud_msg_id.to_string(),
            conversation_id: cloud_conv_id.to_string(),
            user_id: user_uuid,
            role: message.role.as_str().to_string(),
            content: message.content.clone(),
            model: message.model.clone(),
            provider: message.provider.clone(),
            token_count: message.tokens,
            cost: message.cost,
            created_at: message.created_at.to_rfc3339(),
            metadata: serde_json::json!({
                "local_id": message.id,
                "local_conversation_id": message.conversation_id,
            }),
        };

        let url = format!("{}/rest/v1/messages", self.supabase_url);
        let res = self
            .http_client
            .post(&url)
            .header("apikey", &self.supabase_anon_key)
            .header("Authorization", format!("Bearer {jwt}"))
            .header("Content-Type", "application/json")
            .header("Prefer", "resolution=merge-duplicates")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Supabase message sync request failed: {e}"))?;

        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(format!("Supabase message sync error {status}: {text}"));
        }

        debug!(
            "Synced message {} -> {} to Supabase",
            message.id, cloud_msg_id
        );
        Ok(())
    }

    /// Bulk sync multiple conversations and their messages.
    pub async fn bulk_sync(
        &self,
        conversations: &[Conversation],
        messages: &[Message],
    ) -> BulkSyncResult {
        let mut conv_ok: usize = 0;
        let mut conv_err: usize = 0;
        let mut msg_ok: usize = 0;
        let mut msg_err: usize = 0;

        for conv in conversations {
            match self.sync_conversation(conv).await {
                Ok(()) => conv_ok += 1,
                Err(e) => {
                    warn!("Bulk sync: conversation {} failed: {}", conv.id, e);
                    conv_err += 1;
                }
            }
        }

        for msg in messages {
            match self.sync_message(msg).await {
                Ok(()) => msg_ok += 1,
                Err(e) => {
                    warn!("Bulk sync: message {} failed: {}", msg.id, e);
                    msg_err += 1;
                }
            }
        }

        BulkSyncResult {
            conversations_synced: conv_ok,
            conversations_failed: conv_err,
            messages_synced: msg_ok,
            messages_failed: msg_err,
        }
    }
}

/// Extract the `sub` (subject / user UUID) claim from a Supabase JWT
/// without verifying the signature (we are the client, not the server).
fn extract_jwt_sub(jwt: &str) -> Option<String> {
    let parts: Vec<&str> = jwt.split('.').collect();
    if parts.len() < 2 {
        return None;
    }
    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(parts[1])
        .ok()?;
    let payload: serde_json::Value = serde_json::from_slice(&decoded).ok()?;
    payload
        .get("sub")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

// ============================================================================
// Fire-and-forget spawn helpers
// ============================================================================

/// Spawn a background task to sync a conversation to Supabase.
/// Does nothing if Supabase is not configured or the user is not authenticated.
pub fn spawn_sync_conversation(conversation: Conversation) {
    tokio::spawn(async move {
        if let Some(client) = SupabaseSyncClient::new() {
            if let Err(e) = client.sync_conversation(&conversation).await {
                warn!("Supabase conversation sync: {e}");
            }
        }
    });
}

/// Spawn a background task to sync a message to Supabase.
/// Does nothing if Supabase is not configured or the user is not authenticated.
pub fn spawn_sync_message(message: Message) {
    tokio::spawn(async move {
        if let Some(client) = SupabaseSyncClient::new() {
            if let Err(e) = client.sync_message(&message).await {
                warn!("Supabase message sync: {e}");
            }
        }
    });
}
