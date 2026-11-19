use crate::agent_events::AgentEventApprovalRequested;
use crate::task_state::AgentTaskState;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudWorkGoal {
    pub goal: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub constraints: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub deliverable: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub excluded_tools: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudWorkPlanStep {
    pub id: String,
    pub description: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudWorkPlanReview {
    pub review_id: String,
    pub planning_message_id: String,
    pub run_id: String,
    pub conversation_id: String,
    pub model: String,
    pub mode: String,
    pub goal: CloudWorkGoal,
    pub steps: Vec<CloudWorkPlanStep>,
    pub awaiting_approval: bool,
    pub declined: bool,
}

impl CloudWorkPlanReview {
    pub fn same_content(&self, other: &Self) -> bool {
        self.review_id == other.review_id
            && self.planning_message_id == other.planning_message_id
            && self.run_id == other.run_id
            && self.conversation_id == other.conversation_id
            && self.model == other.model
            && self.mode == other.mode
            && self.goal == other.goal
            && self.steps.len() == other.steps.len()
            && self
                .steps
                .iter()
                .zip(&other.steps)
                .all(|(a, b)| a.id == b.id && a.description == b.description)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudWorkRequest {
    pub mode: String,
    pub goal: CloudWorkGoal,
    pub plan: Option<CloudWorkPlanReview>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudWorkPlanUpdateParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub workspace: Option<CloudConversationWorkspace>,
    pub scope: String,
    pub reviewed: CloudWorkPlanReview,
    pub decline: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudRunSummary {
    pub id: String,
    pub request_id: String,
    pub conversation_id: Option<String>,
    #[serde(default)]
    pub conversation_title: Option<String>,
    #[serde(default)]
    pub conversation_preview: Option<String>,
    pub state: AgentTaskState,
    #[serde(default)]
    pub work_state: Option<AgentTaskState>,
    pub origin_surface: String,
    pub provider: String,
    pub model: String,
    pub updated_at: String,
}

impl CloudRunSummary {
    pub fn effective_state(&self) -> AgentTaskState {
        self.work_state.unwrap_or(self.state)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudRunListParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub workspace: Option<CloudConversationWorkspace>,
    pub scope: Option<String>,
    pub limit: u32,
    pub cursor: Option<String>,
    #[serde(default)]
    pub states: Vec<AgentTaskState>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudRunListResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub workspace: Option<CloudConversationWorkspace>,
    pub scope: String,
    pub runs: Vec<CloudRunSummary>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudRunAttachParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub workspace: Option<CloudConversationWorkspace>,
    pub scope: String,
    pub run_id: String,
    pub page_size: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudRunAttachResponse {
    pub run: CloudRunSummary,
    pub turn: CloudTurnSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudConversationCreateParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub project_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub workspace: Option<CloudConversationWorkspace>,
    pub scope: String,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudConversationCreateResponse {
    pub scope: String,
    pub conversation: CloudHistoryConversation,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudTurnStartParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub workspace: Option<CloudConversationWorkspace>,
    pub scope: String,
    pub conversation_id: String,
    pub request_id: String,
    pub user_message_id: String,
    pub text: String,
    #[serde(default)]
    pub attachments: Vec<CloudHistoryAttachment>,
    pub page_size: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub model: Option<String>,
    #[serde(default)]
    pub work: Option<CloudWorkRequest>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudModelListParams {
    pub scope: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudModelSummary {
    pub id: String,
    pub display_name: String,
    pub developer_label: String,
    pub admitted: bool,
    pub temporarily_unavailable: bool,
    pub minimum_plan_label: Option<String>,
}

impl CloudModelSummary {
    pub fn selectable(&self) -> bool {
        self.admitted && !self.temporarily_unavailable
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudModelListResponse {
    pub scope: String,
    pub models: Vec<CloudModelSummary>,
    pub plan_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudTurnIdParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub workspace: Option<CloudConversationWorkspace>,
    pub scope: String,
    pub request_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub run_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudTurnResumeParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub workspace: Option<CloudConversationWorkspace>,
    pub scope: String,
    pub request_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub run_id: Option<String>,
    pub action: CloudTurnResumeAction,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(tag = "kind", rename_all = "camelCase")]
pub enum CloudTurnResumeAction {
    Approval {
        checkpoint: String,
        approved: bool,
        reviewed: Vec<AgentEventApprovalRequested>,
    },
    Paused,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudTurnSnapshot {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub attachment_recovery_error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub workspace: Option<CloudConversationWorkspace>,
    #[ts(type = "number")]
    pub revision: u64,
    pub scope: String,
    pub conversation_id: Option<String>,
    pub request_id: String,
    pub state: AgentTaskState,
    pub accepted: bool,
    pub output: String,
    pub progress: Option<String>,
    pub error: Option<String>,
    pub run_id: Option<String>,
    pub detachable: bool,
    #[serde(default)]
    pub stream_attached: bool,
    #[serde(default)]
    pub catching_up: bool,
    #[serde(default)]
    pub approval_checkpoint: Option<String>,
    #[serde(default)]
    pub approvals: Vec<AgentEventApprovalRequested>,
    #[serde(default)]
    pub work_plan: Option<CloudWorkPlanReview>,
    #[serde(default)]
    pub rejected: bool,
    #[serde(default)]
    pub work_plan_saved: bool,
    #[serde(default)]
    pub work_plan_error: Option<String>,
}

impl CloudTurnSnapshot {
    pub fn needs_attention(&self) -> bool {
        self.stream_attached
            || self.catching_up
            || self
                .work_plan
                .as_ref()
                .is_some_and(|plan| plan.awaiting_approval)
            || (!self.state.is_terminal() && self.state != AgentTaskState::ReadyForReview)
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "lowercase")]
#[ts(rename_all = "lowercase")]
pub enum CloudHistoryArchiveFilter {
    Include,
    Only,
    Exclude,
}

impl CloudHistoryArchiveFilter {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Include => "include",
            Self::Only => "only",
            Self::Exclude => "exclude",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudHistoryListParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub project_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub workspace: Option<CloudConversationWorkspace>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub archive_filter: Option<CloudHistoryArchiveFilter>,
    pub limit: u32,
    #[serde(default)]
    pub offset: u32,
    #[serde(default)]
    pub cursor: Option<String>,
    #[serde(default)]
    pub query: Option<String>,
    #[serde(default)]
    pub scope: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudHistoryReadParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub workspace: Option<CloudConversationWorkspace>,
    pub conversation_id: String,
    pub scope: String,
    pub limit: u32,
    #[serde(default)]
    pub offset: u32,
    #[serde(default)]
    pub latest: bool,
    #[serde(default)]
    /// Exclusive message offset for an older window, distinct from a forward offset.
    pub before: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(tag = "kind", rename_all = "camelCase")]
pub enum CloudConversationWorkspace {
    Personal,
    Organization { id: String },
}

impl CloudConversationWorkspace {
    pub fn from_organization(id: Option<&str>) -> Self {
        id.map_or(Self::Personal, |id| Self::Organization { id: id.into() })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudHistoryConversation {
    #[serde(default)]
    pub archived: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub temporary: Option<bool>,
    pub id: String,
    pub title: Option<String>,
    pub model: Option<String>,
    pub project_id: Option<String>,
    pub organization_id: Option<String>,
    pub updated_at: String,
    pub work_mode: Option<String>,
    pub pinned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(tag = "kind", rename_all = "camelCase")]
pub enum CloudConversationChange {
    Rename { title: String },
    Model { model: String },
    Pin { pinned: bool },
    Archive { archived: bool },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudConversationUpdateParams {
    pub scope: String,
    pub conversation_id: String,
    pub organization_id: Option<String>,
    pub expected_version: String,
    pub change: CloudConversationChange,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudConversationUpdateResponse {
    pub scope: String,
    pub conversation: CloudHistoryConversation,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudHistoryMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub content_truncated: bool,
    #[serde(default)]
    pub attachments: Vec<CloudHistoryAttachment>,
    #[serde(default)]
    pub attachments_incomplete: bool,
    #[serde(default)]
    pub work_plan: Option<CloudWorkPlanReview>,
    #[serde(default)]
    pub work_plan_incomplete: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudHistoryAttachment {
    pub id: String,
    pub asset_id: String,
    #[serde(rename = "type")]
    #[ts(rename = "type")]
    pub kind: CloudHistoryAttachmentKind,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional, type = "number")]
    pub size: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub mime_type: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "lowercase")]
#[ts(rename_all = "lowercase")]
pub enum CloudHistoryAttachmentKind {
    Image,
    File,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudHistoryListResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub workspace: Option<CloudConversationWorkspace>,
    pub scope: String,
    pub conversations: Vec<CloudHistoryConversation>,
    pub has_more: bool,
    pub next_offset: u32,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudHistoryReadResponse {
    pub scope: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub draft: Option<CloudConversationDraft>,
    pub conversation: CloudHistoryConversation,
    pub messages: Vec<CloudHistoryMessage>,
    pub has_more: bool,
    pub next_offset: u32,
    #[serde(default)]
    pub start_offset: u32,
    #[serde(default)]
    /// Exclusive upper bound for the next older window; absent at the beginning.
    pub previous_before: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudConversationDraft {
    pub text: String,
    pub revision: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudDraftSaveParams {
    pub scope: String,
    pub workspace: CloudConversationWorkspace,
    pub conversation_id: String,
    pub draft: CloudConversationDraft,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(tag = "kind", rename_all = "camelCase")]
pub enum CloudDraftSaveOutcome {
    Saved { revision: Option<String> },
    Conflict { current: CloudConversationDraft },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudDraftSaveResponse {
    pub scope: String,
    pub workspace: CloudConversationWorkspace,
    pub conversation_id: String,
    pub outcome: CloudDraftSaveOutcome,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudWorkspaceSummary {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub selector: CloudConversationWorkspace,
    pub role: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudWorkspacesListParams {
    pub scope: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudWorkspacesListResponse {
    pub scope: String,
    pub workspaces: Vec<CloudWorkspaceSummary>,
    pub selected: CloudWorkspaceSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudWorkspaceSelectParams {
    pub scope: String,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudWorkspaceSelectResponse {
    pub scope: String,
    pub selected: CloudWorkspaceSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudProject {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub instructions: Option<String>,
    pub organization_id: Option<String>,
    pub version: Option<String>,
    pub archived: bool,
    pub can_edit: bool,
    pub can_archive: bool,
    pub default_model_id: Option<String>,
    pub conversation_count: Option<u32>,
    pub knowledge_file_count: Option<u32>,
    pub can_start_chat: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudProjectTarget {
    pub scope: String,
    pub workspace: CloudConversationWorkspace,
    pub project_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudProjectListParams {
    pub scope: String,
    pub workspace: CloudConversationWorkspace,
    pub limit: u32,
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudProjectListResponse {
    pub scope: String,
    pub workspace: CloudConversationWorkspace,
    pub projects: Vec<CloudProject>,
    pub has_more: bool,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudProjectResponse {
    pub scope: String,
    pub workspace: CloudConversationWorkspace,
    pub project: CloudProject,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudProjectDetails {
    pub name: String,
    pub description: String,
    pub instructions: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudProjectCreateParams {
    pub scope: String,
    pub workspace: CloudConversationWorkspace,
    pub details: CloudProjectDetails,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(tag = "kind", rename_all = "camelCase")]
pub enum CloudProjectChange {
    Details { details: CloudProjectDetails },
    Archive { archived: bool },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CloudProjectUpdateParams {
    pub target: CloudProjectTarget,
    pub expected_version: String,
    pub change: CloudProjectChange,
}
