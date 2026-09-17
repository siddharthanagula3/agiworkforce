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
/// finish before a human accepts it. `AwaitingInput` waits on the user and
/// `AwaitingApproval` on a permission decision. `Partial` finished with only
/// part of the work done, and `TimedOut` stopped on a time budget rather than
/// an error. The last five variants were added after the first nine shipped,
/// so a reader built before them sees each through `legacy_equivalent`.
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
    Planning,
    AwaitingApproval,
    Resuming,
    Partial,
    TimedOut,
}

impl AgentTaskState {
    #[must_use]
    pub const fn needs_input(self) -> bool {
        matches!(self, Self::AwaitingInput | Self::AwaitingApproval)
    }

    #[must_use]
    pub const fn needs_review(self) -> bool {
        matches!(self, Self::ReadyForReview)
    }

    #[must_use]
    pub const fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::Completed
                | Self::Failed
                | Self::Cancelled
                | Self::Archived
                | Self::Partial
                | Self::TimedOut
        )
    }

    /// The state a reader that only knows the original nine variants renders:
    /// the one those readers were shown for the same situation before the
    /// finer state existed, so a step-limit stop still reads as `Failed`.
    #[must_use]
    pub const fn legacy_equivalent(self) -> Self {
        match self {
            Self::Planning | Self::Resuming => Self::Running,
            Self::AwaitingApproval => Self::AwaitingInput,
            Self::Partial | Self::TimedOut => Self::Failed,
            other => other,
        }
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
