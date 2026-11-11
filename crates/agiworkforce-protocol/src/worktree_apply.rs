use crate::developer_session::CheckpointFileStatus;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeApplyPlanParams {
    pub root_key: String,
    pub worktree_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeApplyCommitParams {
    pub root_key: String,
    pub worktree_id: String,
    pub plan_id: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
pub enum WorktreeApplyFileState {
    Ready,
    Unchanged,
    Conflict,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeApplyContent {
    pub bytes: u64,
    pub revision: String,
    pub text: Option<String>,
    pub truncated: bool,
    pub binary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeApplyFile {
    pub path: String,
    pub status: CheckpointFileStatus,
    pub state: WorktreeApplyFileState,
    pub reason: Option<String>,
    pub before: Option<WorktreeApplyContent>,
    pub after: Option<WorktreeApplyContent>,
    pub executable_before: Option<bool>,
    pub executable_after: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeApplyPlan {
    pub root_key: String,
    pub worktree_id: String,
    pub plan_id: String,
    pub source_revision: String,
    pub files: Vec<WorktreeApplyFile>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
pub enum WorktreeApplyOutcome {
    Applied,
    Skipped,
    Conflict,
    Blocked,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeApplyFileResult {
    pub path: String,
    pub outcome: WorktreeApplyOutcome,
    pub reason: Option<String>,
    pub uncertain: bool,
    pub recovery_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeApplyResult {
    pub root_key: String,
    pub worktree_id: String,
    pub plan_id: String,
    pub files: Vec<WorktreeApplyFileResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeApplyResultParams {
    pub root_key: String,
    pub worktree_id: String,
    pub plan_id: String,
    pub after: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeApplyResultPage {
    pub root_key: String,
    pub worktree_id: String,
    pub plan_id: String,
    pub files: Vec<WorktreeApplyFileResult>,
    pub total_files: u32,
    pub next_after: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeApplyCommitFailure {
    pub root_key: String,
    pub worktree_id: String,
    pub plan_id: String,
    pub uncertain: bool,
}
