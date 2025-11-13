use serde::{Deserialize, Serialize};
use super::{PresenceStatus, UserActivity, CursorPosition};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum RealtimeEvent {
    Authenticate {
        user_id: String,
        team_id: Option<String>,
    },

    UserPresenceChanged {
        user_id: String,
        status: PresenceStatus,
    },

    UserTyping {
        user_id: String,
        resource_id: String,
    },

    GoalCreated {
        goal: serde_json::Value,
    },

    GoalUpdated {
        goal_id: String,
        changes: serde_json::Value,
    },

    WorkflowUpdated {
        workflow: serde_json::Value,
    },

    ApprovalRequested {
        request: serde_json::Value,
    },

    TeamMemberJoined {
        team_id: String,
        user_id: String,
    },

    CursorMoved {
        user_id: String,
        position: CursorPosition,
    },

    ResourceLocked {
        resource_id: String,
        user_id: String,
    },

    ResourceUnlocked {
        resource_id: String,
        user_id: String,
    },

    MessageSent {
        message: serde_json::Value,
    },

    MetricsUpdated {
        metrics: serde_json::Value,
    },

    MilestoneReached {
        milestone: serde_json::Value,
    },
}
