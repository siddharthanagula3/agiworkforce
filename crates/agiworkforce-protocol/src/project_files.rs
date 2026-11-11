use crate::account_cloud::CloudProjectTarget;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudProjectFile {
    pub id: String,
    pub project_id: String,
    pub file_name: String,
    pub mime_type: String,
    #[ts(type = "number")]
    pub byte_count: u64,
    pub checksum_sha256: String,
    pub added_at: String,
    pub added_by_user_id: Option<String>,
    pub preview_kind: Option<ProjectFilePreviewKind>,
    pub indexing: Option<ProjectFileIndexState>,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "lowercase")]
#[ts(rename_all = "lowercase")]
pub enum ProjectFilePreviewKind {
    Text,
    Table,
    Office,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ProjectFileIndexState {
    pub status: String,
    pub chunk_count: u32,
    pub semantic: bool,
    pub attempts: u32,
    pub error: Option<String>,
    pub indexed_at: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudProjectFilesResponse {
    pub target: CloudProjectTarget,
    pub files: Vec<CloudProjectFile>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudProjectFileTarget {
    pub project: CloudProjectTarget,
    pub file_id: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudProjectFilePreview {
    pub target: CloudProjectFileTarget,
    pub checksum_sha256: String,
    pub kind: ProjectFilePreviewKind,
    pub text: String,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudProjectUploadPrepareParams {
    pub target: CloudProjectTarget,
    pub path: String,
    #[ts(type = "number")]
    pub selected_at_ms: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudProjectUploadId {
    pub target: CloudProjectTarget,
    pub id: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudProjectUploadReview {
    pub upload: CloudProjectUploadId,
    pub project_name: String,
    pub file_name: String,
    pub mime_type: String,
    #[ts(type = "number")]
    pub byte_count: u64,
    pub checksum_sha256: String,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum ProjectUploadPhase {
    Ready,
    Uploading,
    Completing,
    Cancelling,
    Succeeded,
    Failed,
    Cancelled,
}
impl ProjectUploadPhase {
    pub fn running(self) -> bool {
        matches!(self, Self::Uploading | Self::Completing | Self::Cancelling)
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudProjectUploadSnapshot {
    pub review: CloudProjectUploadReview,
    pub phase: ProjectUploadPhase,
    #[ts(type = "number")]
    pub uploaded_bytes: u64,
    pub file: Option<CloudProjectFile>,
    pub error: Option<String>,
    pub uncertain: bool,
    pub retryable: bool,
    pub cancelable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudProjectFileVersion {
    pub target: CloudProjectFileTarget,
    pub checksum_sha256: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudProjectDownloadPrepareParams {
    pub file: CloudProjectFileVersion,
    pub destination: String,
    #[ts(type = "number")]
    pub selected_at_ms: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudProjectDownloadId {
    pub file: CloudProjectFileTarget,
    pub id: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudProjectDownloadReview {
    pub download: CloudProjectDownloadId,
    pub file: CloudProjectFile,
    pub project_name: String,
    pub destination: String,
    pub replaces: bool,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum ProjectDownloadPhase {
    Ready,
    Downloading,
    Saving,
    Cancelling,
    Succeeded,
    Failed,
    Cancelled,
}
impl ProjectDownloadPhase {
    pub fn running(self) -> bool {
        matches!(self, Self::Downloading | Self::Saving | Self::Cancelling)
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudProjectDownloadSnapshot {
    pub review: CloudProjectDownloadReview,
    pub phase: ProjectDownloadPhase,
    #[ts(type = "number")]
    pub received_bytes: u64,
    pub error: Option<String>,
    pub uncertain: bool,
    pub retryable: bool,
    pub cancelable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudProjectFileReindexResponse {
    pub new_request: bool,
    pub target: CloudProjectFileTarget,
    pub indexing: Option<ProjectFileIndexState>,
    pub dispatched: bool,
}
