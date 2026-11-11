use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const MAX_EDITOR_TEXT_BYTES: usize = 512 * 1024;
pub const WORKSPACE_DIRECTORY_PAGE_SIZE: usize = 200;
pub const MAX_WORKSPACE_DIRECTORY_SCAN: usize = 20_000;
pub const MAX_EDITOR_RECOVERY_FILES: usize = 64;
pub const MAX_EDITOR_RECOVERY_STORAGE_BYTES: usize = MAX_EDITOR_TEXT_BYTES * 16;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorkspaceFileParams {
    pub root_key: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorkspaceDirectoryParams {
    pub root_key: String,
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub after: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum WorkspaceEntryKind {
    File,
    Directory,
    Unsupported,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorkspaceDirectoryEntry {
    pub path: String,
    pub name: String,
    pub kind: WorkspaceEntryKind,
    pub blocked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorkspaceDirectoryResponse {
    pub root_key: String,
    pub path: String,
    pub entries: Vec<WorkspaceDirectoryEntry>,
    pub omitted_names: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub next_after: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorkspaceFileResponse {
    pub root_key: String,
    pub path: String,
    pub content: String,
    pub revision: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorkspaceFileWriteParams {
    pub root_key: String,
    pub path: String,
    pub revision: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorkspaceFileWriteResponse {
    pub root_key: String,
    pub path: String,
    pub revision: String,
    pub changed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorkspaceFileRecovery {
    pub base_revision: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorkspaceFileRecoverySnapshot {
    pub root_key: String,
    pub path: String,
    pub epoch: String,
    pub revision: Option<String>,
    pub recovery: Option<WorkspaceFileRecovery>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum WorkspaceFileRecoveryChange {
    Set { value: WorkspaceFileRecovery },
    Clear,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorkspaceFileRecoveryWriteParams {
    pub root_key: String,
    pub path: String,
    pub epoch: String,
    pub revision: Option<String>,
    pub change: WorkspaceFileRecoveryChange,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorkspaceFileRecoveryWriteResponse {
    pub accepted: bool,
    pub current: WorkspaceFileRecoverySnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorkspaceFileRecoveryListParams {
    pub root_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorkspaceFileRecoverySummary {
    pub path: String,
    pub revision: String,
    pub byte_count: usize,
    pub source_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorkspaceFileRecoveryListResponse {
    pub root_key: String,
    pub epoch: String,
    pub entries: Vec<WorkspaceFileRecoverySummary>,
    pub unavailable: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorkspaceFileRecoveryRestoreParams {
    pub root_key: String,
    pub path: String,
    pub epoch: String,
    pub revision: String,
    pub destination: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorkspaceFileRecoveryRestoreResponse {
    pub root_key: String,
    pub path: String,
    pub source_revision: String,
    pub destination: String,
    pub revision: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorkspaceFileRecoveryRestoreFailure {
    pub root_key: String,
    pub path: String,
    pub destination: String,
    pub uncertain: bool,
}
