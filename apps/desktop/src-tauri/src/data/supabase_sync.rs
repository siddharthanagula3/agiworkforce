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
    0x6b, 0xa7, 0xb8, 0x10, 0x9d, 0xad, 0x11, 0xd1, 0x80, 0xb4, 0x00, 0xc0, 0x4f, 0xd4, 0x30, 0xc8,
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
    ///
    /// Checks `SUPABASE_URL` / `SUPABASE_ANON_KEY` first (correct for the Rust
    /// backend), then falls back to the Vite-prefixed variants for dev parity.
    pub fn new() -> Option<Self> {
        let supabase_url = match crate::sys::account::get_supabase_url() {
            Some(u) if !u.is_empty() => u,
            _ => {
                debug!("Supabase sync disabled: credentials not configured");
                return None;
            }
        };
        let supabase_anon_key = crate::sys::account::get_supabase_anon_key().unwrap_or_default();

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
            return Err(format!("Supabase conversation sync error {status}: {text}"));
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

        let cloud_conv_id = Self::conversation_cloud_id(&user_uuid, message.conversation_id);
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

    /// FIX-030 (Sprint 5): Supabase REST upsert in batches of up to
    /// `BATCH_SIZE` rows. The previous implementation issued one POST per
    /// row, turning a 10 000-row sync into 10 000 round-trips. Now a
    /// 10 000-row sync becomes ~10 round-trips, each with the
    /// `Prefer: resolution=merge-duplicates` header set once.
    ///
    /// Each chunk gets up to `MAX_RETRIES` attempts with exponential
    /// backoff. A whole chunk that still fails counts as failed for every
    /// row in that chunk (best-effort sync — SQLite remains the source of
    /// truth, so no data loss occurs from a failed batch).
    pub async fn bulk_sync(
        &self,
        conversations: &[Conversation],
        messages: &[Message],
    ) -> BulkSyncResult {
        const BATCH_SIZE: usize = 1000;

        let Some((jwt, user_uuid)) = Self::get_auth() else {
            warn!("bulk_sync: not authenticated — skipping");
            return BulkSyncResult {
                conversations_synced: 0,
                conversations_failed: conversations.len(),
                messages_synced: 0,
                messages_failed: messages.len(),
            };
        };

        let mut conv_ok = 0usize;
        let mut conv_err = 0usize;
        let mut msg_ok = 0usize;
        let mut msg_err = 0usize;

        for chunk in conversations.chunks(BATCH_SIZE) {
            let payload: Vec<SupabaseConversation> = chunk
                .iter()
                .map(|c| SupabaseConversation {
                    id: Self::conversation_cloud_id(&user_uuid, c.id).to_string(),
                    user_id: user_uuid.clone(),
                    title: Some(c.title.clone()),
                    model: None,
                    provider: None,
                    created_at: c.created_at.to_rfc3339(),
                    updated_at: c.updated_at.to_rfc3339(),
                    message_count: 0,
                    source: "desktop".to_string(),
                    metadata: serde_json::json!({"local_id": c.id}),
                })
                .collect();

            match self
                .post_batch_with_retry("conversations", &jwt, &payload)
                .await
            {
                Ok(()) => conv_ok += chunk.len(),
                Err(e) => {
                    warn!(
                        "bulk_sync: conversation batch of {} failed: {}",
                        chunk.len(),
                        e
                    );
                    conv_err += chunk.len();
                }
            }
        }

        for chunk in messages.chunks(BATCH_SIZE) {
            let payload: Vec<SupabaseMessage> = chunk
                .iter()
                .map(|m| SupabaseMessage {
                    id: Self::message_cloud_id(&user_uuid, m.id).to_string(),
                    conversation_id: Self::conversation_cloud_id(&user_uuid, m.conversation_id)
                        .to_string(),
                    user_id: user_uuid.clone(),
                    role: m.role.as_str().to_string(),
                    content: m.content.clone(),
                    model: m.model.clone(),
                    provider: m.provider.clone(),
                    token_count: m.tokens,
                    cost: m.cost,
                    created_at: m.created_at.to_rfc3339(),
                    metadata: serde_json::json!({
                        "local_id": m.id,
                        "local_conversation_id": m.conversation_id,
                    }),
                })
                .collect();

            match self
                .post_batch_with_retry("messages", &jwt, &payload)
                .await
            {
                Ok(()) => msg_ok += chunk.len(),
                Err(e) => {
                    warn!(
                        "bulk_sync: message batch of {} failed: {}",
                        chunk.len(),
                        e
                    );
                    msg_err += chunk.len();
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

    /// POST a JSON array to a Supabase REST endpoint with
    /// `Prefer: resolution=merge-duplicates` (upsert semantics) and
    /// exponential-backoff retry. Returns `Ok(())` once the chunk is
    /// confirmed accepted, or the last error after `MAX_RETRIES`.
    async fn post_batch_with_retry<T: Serialize>(
        &self,
        table: &str,
        jwt: &str,
        payload: &[T],
    ) -> Result<(), String> {
        const MAX_RETRIES: usize = 3;
        let url = format!("{}/rest/v1/{table}", self.supabase_url);
        let mut delay = std::time::Duration::from_millis(500);
        let mut last_err = String::new();

        for attempt in 0..MAX_RETRIES {
            let res = self
                .http_client
                .post(&url)
                .header("apikey", &self.supabase_anon_key)
                .header("Authorization", format!("Bearer {jwt}"))
                .header("Content-Type", "application/json")
                .header("Prefer", "resolution=merge-duplicates")
                .json(payload)
                .send()
                .await;

            match res {
                Ok(r) if r.status().is_success() => {
                    if attempt > 0 {
                        debug!(
                            "supabase {table} batch succeeded on retry {} ({} rows)",
                            attempt,
                            payload.len()
                        );
                    }
                    return Ok(());
                }
                Ok(r) => {
                    let status = r.status();
                    let body = r.text().await.unwrap_or_default();
                    last_err = format!("HTTP {status}: {body}");
                    // 4xx other than 408/429 are not retryable — schema or
                    // auth errors won't get better with a re-send.
                    if status.is_client_error() && status.as_u16() != 408 && status.as_u16() != 429
                    {
                        return Err(last_err);
                    }
                }
                Err(e) => {
                    last_err = format!("transport: {e}");
                }
            }

            if attempt < MAX_RETRIES - 1 {
                tokio::time::sleep(delay).await;
                delay *= 2;
            }
        }
        Err(last_err)
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
