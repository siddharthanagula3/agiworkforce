//! Cloud CRUD Tauri commands — direct Supabase REST API calls.
//!
//! These commands talk to the Supabase REST API as the authenticated user.
//! Authentication uses the in-memory JWT stored by `account_store_access_token`.
//! The user_id is extracted from the JWT `sub` claim (no signature verification —
//! client-side trusted token; RLS enforces ownership on the server).

use base64::Engine;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::debug;

// ---------------------------------------------------------------------------
// Supabase response types
// ---------------------------------------------------------------------------

/// A conversation row as returned by the Supabase REST API.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudConversation {
    pub id: String,
    pub user_id: String,
    pub title: Option<String>,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub last_message_at: Option<String>,
    pub message_count: Option<i32>,
    pub metadata: Option<serde_json::Value>,
    pub source: Option<String>,
}

/// A message row as returned by the Supabase REST API.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudMessage {
    pub id: String,
    pub conversation_id: String,
    pub user_id: String,
    pub role: String,
    pub content: String,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub token_count: Option<i32>,
    pub cost: Option<f64>,
    pub tool_calls: Option<serde_json::Value>,
    pub tool_results: Option<serde_json::Value>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Build an authenticated reqwest Client (30 s timeout).
fn build_client() -> Result<Client, String> {
    Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))
}

fn supabase_url() -> Result<String, String> {
    crate::sys::account::get_supabase_url()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "SUPABASE_URL is not configured".to_string())
}

fn supabase_anon_key() -> Result<String, String> {
    crate::sys::account::get_supabase_anon_key()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "SUPABASE_ANON_KEY is not configured".to_string())
}

/// Get the stored JWT and extract the user UUID from the `sub` claim.
fn get_jwt_and_user_id() -> Result<(String, String), String> {
    let jwt = crate::sys::account::get_access_token()?;
    let user_id = extract_jwt_sub(&jwt)
        .ok_or_else(|| "Failed to extract user_id from JWT sub claim".to_string())?;
    Ok((jwt, user_id))
}

/// Decode the JWT payload and return the `sub` claim without verifying the signature.
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

/// Check an HTTP response and return an error string if it was not successful.
async fn check_response(res: reqwest::Response, context: &str) -> Result<String, String> {
    if res.status().is_success() {
        res.text()
            .await
            .map_err(|e| format!("{context}: failed to read body: {e}"))
    } else {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        Err(format!("{context}: HTTP {status}: {body}"))
    }
}

// ---------------------------------------------------------------------------
// Task 1 — Cloud CRUD commands
// ---------------------------------------------------------------------------

/// GET /rest/v1/conversations — returns all conversations for the authenticated user,
/// ordered by `updated_at` descending.
#[tauri::command]
pub async fn cloud_get_conversations() -> Result<Vec<CloudConversation>, String> {
    let (jwt, _user_id) = get_jwt_and_user_id()?;
    let base = supabase_url()?;
    let anon_key = supabase_anon_key()?;
    let client = build_client()?;

    let url = format!(
        "{}/rest/v1/conversations?select=*&order=updated_at.desc",
        base
    );

    let body = check_response(
        client
            .get(&url)
            .header("apikey", &anon_key)
            .header("Authorization", format!("Bearer {jwt}"))
            .send()
            .await
            .map_err(|e| format!("cloud_get_conversations request failed: {e}"))?,
        "cloud_get_conversations",
    )
    .await?;

    serde_json::from_str::<Vec<CloudConversation>>(&body)
        .map_err(|e| format!("cloud_get_conversations: failed to parse response: {e}"))
}

/// POST /rest/v1/conversations — creates a new cloud conversation.
/// `user_id` is extracted from the JWT; title, model, provider, and source are optional.
#[tauri::command]
pub async fn cloud_create_conversation(
    title: Option<String>,
    model: Option<String>,
    provider: Option<String>,
    source: Option<String>,
) -> Result<CloudConversation, String> {
    let (jwt, user_id) = get_jwt_and_user_id()?;
    let base = supabase_url()?;
    let anon_key = supabase_anon_key()?;
    let client = build_client()?;

    let url = format!("{}/rest/v1/conversations", base);

    let payload = serde_json::json!({
        "user_id": user_id,
        "title": title,
        "model": model,
        "provider": provider,
        "source": source.unwrap_or_else(|| "desktop".to_string()),
    });

    let body = check_response(
        client
            .post(&url)
            .header("apikey", &anon_key)
            .header("Authorization", format!("Bearer {jwt}"))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("cloud_create_conversation request failed: {e}"))?,
        "cloud_create_conversation",
    )
    .await?;

    // PostgREST returns an array even for single inserts when using return=representation
    let rows = serde_json::from_str::<Vec<CloudConversation>>(&body)
        .map_err(|e| format!("cloud_create_conversation: failed to parse response: {e}"))?;

    rows.into_iter()
        .next()
        .ok_or_else(|| "cloud_create_conversation: no row returned".to_string())
}

/// DELETE /rest/v1/conversations?id=eq.{id} — deletes a cloud conversation by UUID.
#[tauri::command]
pub async fn cloud_delete_conversation(id: String) -> Result<(), String> {
    if id.is_empty() {
        return Err("Conversation ID cannot be empty".to_string());
    }
    let (jwt, _user_id) = get_jwt_and_user_id()?;
    let base = supabase_url()?;
    let anon_key = supabase_anon_key()?;
    let client = build_client()?;

    let url = format!("{}/rest/v1/conversations?id=eq.{}", base, id);

    check_response(
        client
            .delete(&url)
            .header("apikey", &anon_key)
            .header("Authorization", format!("Bearer {jwt}"))
            .send()
            .await
            .map_err(|e| format!("cloud_delete_conversation request failed: {e}"))?,
        "cloud_delete_conversation",
    )
    .await?;

    debug!("Deleted cloud conversation {id}");
    Ok(())
}

/// GET /rest/v1/messages?conversation_id=eq.{id}&order=created_at.asc
/// Returns all messages for a cloud conversation, oldest first.
#[tauri::command]
pub async fn cloud_get_messages(conversation_id: String) -> Result<Vec<CloudMessage>, String> {
    if conversation_id.is_empty() {
        return Err("Conversation ID cannot be empty".to_string());
    }
    let (jwt, _user_id) = get_jwt_and_user_id()?;
    let base = supabase_url()?;
    let anon_key = supabase_anon_key()?;
    let client = build_client()?;

    let url = format!(
        "{}/rest/v1/messages?select=*&conversation_id=eq.{}&order=created_at.asc",
        base, conversation_id
    );

    let body = check_response(
        client
            .get(&url)
            .header("apikey", &anon_key)
            .header("Authorization", format!("Bearer {jwt}"))
            .send()
            .await
            .map_err(|e| format!("cloud_get_messages request failed: {e}"))?,
        "cloud_get_messages",
    )
    .await?;

    serde_json::from_str::<Vec<CloudMessage>>(&body)
        .map_err(|e| format!("cloud_get_messages: failed to parse response: {e}"))
}

/// POST /rest/v1/messages — creates a cloud message.
/// `user_id` is extracted from the JWT.
#[tauri::command]
pub async fn cloud_create_message(
    conversation_id: String,
    role: String,
    content: String,
    model: Option<String>,
    provider: Option<String>,
    token_count: Option<i32>,
    cost: Option<f64>,
) -> Result<CloudMessage, String> {
    if conversation_id.is_empty() {
        return Err("Conversation ID cannot be empty".to_string());
    }
    // Validate role against Supabase CHECK constraint
    let valid_roles = ["user", "assistant", "system", "tool"];
    if !valid_roles.contains(&role.as_str()) {
        return Err(format!(
            "Invalid role '{}'. Must be one of: user, assistant, system, tool",
            role
        ));
    }
    if content.trim().is_empty() {
        return Err("Message content cannot be empty".to_string());
    }

    let (jwt, user_id) = get_jwt_and_user_id()?;
    let base = supabase_url()?;
    let anon_key = supabase_anon_key()?;
    let client = build_client()?;

    let url = format!("{}/rest/v1/messages", base);

    let payload = serde_json::json!({
        "conversation_id": conversation_id,
        "user_id": user_id,
        "role": role,
        "content": content,
        "model": model,
        "provider": provider,
        "token_count": token_count,
        "cost": cost,
    });

    let body = check_response(
        client
            .post(&url)
            .header("apikey", &anon_key)
            .header("Authorization", format!("Bearer {jwt}"))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("cloud_create_message request failed: {e}"))?,
        "cloud_create_message",
    )
    .await?;

    let rows = serde_json::from_str::<Vec<CloudMessage>>(&body)
        .map_err(|e| format!("cloud_create_message: failed to parse response: {e}"))?;

    rows.into_iter()
        .next()
        .ok_or_else(|| "cloud_create_message: no row returned".to_string())
}

/// PATCH /rest/v1/conversations?id=eq.{id} — updates the title of a cloud conversation.
#[tauri::command]
pub async fn cloud_update_conversation_title(id: String, title: String) -> Result<(), String> {
    if id.is_empty() {
        return Err("Conversation ID cannot be empty".to_string());
    }
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err("Title cannot be empty".to_string());
    }

    let (jwt, _user_id) = get_jwt_and_user_id()?;
    let base = supabase_url()?;
    let anon_key = supabase_anon_key()?;
    let client = build_client()?;

    let url = format!("{}/rest/v1/conversations?id=eq.{}", base, id);

    let payload = serde_json::json!({ "title": trimmed });

    check_response(
        client
            .patch(&url)
            .header("apikey", &anon_key)
            .header("Authorization", format!("Bearer {jwt}"))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("cloud_update_conversation_title request failed: {e}"))?,
        "cloud_update_conversation_title",
    )
    .await?;

    debug!("Updated title for cloud conversation {id}");
    Ok(())
}
