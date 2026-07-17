//! Cloud chat Tauri commands.
//!
//! Desktop local chats remain local by default. Shared cloud chat persistence
//! must go through an explicit Web API boundary and fails closed here until
//! that contract is implemented.
//!
//! DCL-3 — INTENTIONAL ABSENCE (do not "implement" these in Rust).
//!
//! Desktop managed-cloud chat persistence is the ONE logical cloud product and is
//! served through the shared web API boundary, NOT this local Tauri runtime. The
//! desktop seam lives entirely in TypeScript:
//!
//! - client: `packages/ui/unified-chat` `createCloudChatPersistenceClient`.
//! - wiring: `apps/desktop/src/lib/cloudChatPersistence.ts` (managed-cloud only).
//! - egress: `apps/desktop/src/lib/egressGuard.ts` `guardedFetch` allows the call
//!   ONLY in managed mode and BLOCKS it in Local/BYOK.
//!
//! These `cloud_*` commands are an orphaned placeholder kept ONLY as a fail-closed
//! backstop. They have no caller (the TS path never invokes them); adding a caller
//! here would breach the trust boundary by routing cloud through the local runtime.
//! If you think you need a Rust cloud command, you do not — wire the TS seam.
//! Tracked in `docs/strategy/PORTING-TRACKER.md` (DCL-3).

use serde::{Deserialize, Serialize};

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

fn cloud_not_available() -> String {
    "[ERR_CLOUD_NOT_IMPLEMENTED] Desktop cloud chat persistence requires the AGI Web API boundary and explicit user handoff; it is not available in this local runtime.".to_string()
}

#[tauri::command]
pub async fn cloud_get_conversations() -> Result<Vec<CloudConversation>, String> {
    Err(cloud_not_available())
}

#[tauri::command]
pub async fn cloud_create_conversation(
    _title: Option<String>,
    _model: Option<String>,
    _provider: Option<String>,
    _source: Option<String>,
) -> Result<CloudConversation, String> {
    Err(cloud_not_available())
}

#[tauri::command]
pub async fn cloud_delete_conversation(_id: String) -> Result<(), String> {
    Err(cloud_not_available())
}

#[tauri::command]
pub async fn cloud_get_messages(_conversation_id: String) -> Result<Vec<CloudMessage>, String> {
    Err(cloud_not_available())
}

#[tauri::command]
pub async fn cloud_create_message(
    _conversation_id: String,
    _role: String,
    _content: String,
    _model: Option<String>,
    _provider: Option<String>,
    _token_count: Option<i32>,
    _cost: Option<f64>,
) -> Result<CloudMessage, String> {
    Err(cloud_not_available())
}

#[tauri::command]
pub async fn cloud_update_conversation_title(_id: String, _title: String) -> Result<(), String> {
    Err(cloud_not_available())
}
