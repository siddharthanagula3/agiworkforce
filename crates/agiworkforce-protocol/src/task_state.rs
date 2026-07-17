//! Canonical task lifecycle shared by every agent engine and presentation surface.
//!
//! Engines emit these states. Web, Desktop, Mobile, CLI, and IDE clients render
//! or filter them without inventing surface-local lifecycle vocabularies.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Stable task lifecycle emitted by an agent engine.
///
/// `ReadyForReview` is intentionally distinct from `Completed`: engine work can
/// finish before a human accepts it. Timeouts map to `Failed` with a summary,
/// and recovery maps back to `Running`; neither is a durable product state.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum AgentTaskState {
    Queued,
    Running,
    AwaitingInput,
    ReadyForReview,
    Completed,
    Failed,
    Cancelled,
    Paused,
    Archived,
}

impl AgentTaskState {
    #[must_use]
    pub const fn needs_input(self) -> bool {
        matches!(self, Self::AwaitingInput)
    }

    #[must_use]
    pub const fn needs_review(self) -> bool {
        matches!(self, Self::ReadyForReview)
    }

    #[must_use]
    pub const fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Failed | Self::Cancelled | Self::Archived
        )
    }
}

/// One engine-authored lifecycle transition.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AgentTaskStateChanged {
    pub task_id: String,
    pub state: AgentTaskState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub previous_state: Option<AgentTaskState>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub summary: Option<String>,
}
