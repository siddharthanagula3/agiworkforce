use crate::account_cloud::{
    CloudConversationWorkspace, CloudHistoryAttachment, CloudProjectTarget,
};
use crate::project_files::CloudProjectFile;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudChatTarget {
    pub scope: String,
    pub workspace: CloudConversationWorkspace,
    pub conversation_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(tag = "kind", rename_all = "camelCase")]
pub enum CloudUploadTarget {
    Project { project: CloudProjectTarget },
    Chat { chat: CloudChatTarget },
}
impl CloudUploadTarget {
    pub fn scope(&self) -> &str {
        match self {
            Self::Project { project } => &project.scope,
            Self::Chat { chat } => &chat.scope,
        }
    }
    pub fn workspace(&self) -> &CloudConversationWorkspace {
        match self {
            Self::Project { project } => &project.workspace,
            Self::Chat { chat } => &chat.workspace,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudUploadPrepareParams {
    pub target: CloudUploadTarget,
    pub path: String,
    #[ts(type = "number")]
    pub selected_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudUploadId {
    pub target: CloudUploadTarget,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudUploadReview {
    pub upload: CloudUploadId,
    pub destination_name: String,
    pub file_name: String,
    pub mime_type: String,
    #[ts(type = "number")]
    pub byte_count: u64,
    pub checksum_sha256: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum CloudUploadPhase {
    Ready,
    Uploading,
    Completing,
    Cancelling,
    Succeeded,
    Failed,
    Cancelled,
}
impl CloudUploadPhase {
    pub fn running(self) -> bool {
        matches!(self, Self::Uploading | Self::Completing | Self::Cancelling)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(tag = "kind", rename_all = "camelCase")]
pub enum CloudUploadedFile {
    Project { file: CloudProjectFile },
    Chat { attachment: CloudHistoryAttachment },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudUploadSnapshot {
    pub review: CloudUploadReview,
    pub phase: CloudUploadPhase,
    #[ts(type = "number")]
    pub uploaded_bytes: u64,
    pub file: Option<CloudUploadedFile>,
    pub error: Option<String>,
    pub uncertain: bool,
    pub retryable: bool,
    pub cancelable: bool,
}
