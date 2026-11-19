use crate::account_cloud::{CloudConversationWorkspace, CloudHistoryAttachment};
use crate::cloud_uploads::CloudChatTarget;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AttachmentPendingSend {
    pub request_id: String,
    pub user_message_id: String,
    pub asset_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AttachmentRecoverySnapshot {
    pub target: CloudChatTarget,
    pub epoch: String,
    pub revision: Option<String>,
    pub files: Vec<CloudHistoryAttachment>,
    pub pending_send: Option<AttachmentPendingSend>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AttachmentRecoveryReadResponse {
    pub target: CloudChatTarget,
    pub available: bool,
    pub snapshot: Option<AttachmentRecoverySnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(tag = "kind", rename_all = "camelCase")]
pub enum AttachmentRecoveryChange {
    Restore,
    Remove { asset_id: String },
    Clear,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AttachmentRecoveryChangeParams {
    pub target: CloudChatTarget,
    pub epoch: String,
    pub revision: Option<String>,
    pub change: AttachmentRecoveryChange,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AttachmentRecoveryChangeResponse {
    pub accepted: bool,
    pub target: CloudChatTarget,
    pub snapshot: Option<AttachmentRecoverySnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AttachmentRecoveryListParams {
    pub scope: String,
    pub workspace: Option<CloudConversationWorkspace>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AttachmentRecoverySummary {
    pub target: CloudChatTarget,
    pub revision: String,
    pub title: Option<String>,
    pub file_count: u32,
    pub pending_send: bool,
    pub readable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AttachmentRecoveryListResponse {
    pub scope: String,
    pub workspace: Option<CloudConversationWorkspace>,
    pub epoch: String,
    pub selections: Vec<AttachmentRecoverySummary>,
}
