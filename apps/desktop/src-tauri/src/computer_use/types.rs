use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ComputerAction {
    Click { x: i32, y: i32 },
    DoubleClick { x: i32, y: i32 },
    RightClick { x: i32, y: i32 },
    Type { text: String },
    Scroll { direction: ScrollDirection, amount: i32 },
    KeyPress { key: String },
    Wait { ms: u64 },
    DragTo { from_x: i32, from_y: i32, to_x: i32, to_y: i32 },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScrollDirection {
    Up,
    Down,
    Left,
    Right,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionPlan {
    pub actions: Vec<ComputerAction>,
    pub reasoning: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressVerification {
    pub task_complete: bool,
    pub making_progress: bool,
    pub reasoning: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputerUseResult {
    pub success: bool,
    pub actions_taken: usize,
    pub session_id: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputerUseSession {
    pub id: String,
    pub user_id: String,
    pub task_description: String,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub status: SessionStatus,
    pub actions_taken: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Running,
    Completed,
    Failed,
    Stopped,
}

impl fmt::Display for SessionStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SessionStatus::Running => write!(f, "running"),
            SessionStatus::Completed => write!(f, "completed"),
            SessionStatus::Failed => write!(f, "failed"),
            SessionStatus::Stopped => write!(f, "stopped"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputerUseActionLog {
    pub id: String,
    pub session_id: String,
    pub action_type: String,
    pub action_data: String, // JSON serialized
    pub screenshot_path: Option<String>,
    pub timestamp: i64,
    pub success: bool,
}

#[derive(Debug)]
pub enum ComputerUseError {
    ActionFailed(String),
    ActionBlockedBySafety,
    MaxIterationsReached,
    NotMakingProgress,
    VisionError(String),
}

impl fmt::Display for ComputerUseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ComputerUseError::ActionFailed(msg) => write!(f, "Action failed: {}", msg),
            ComputerUseError::ActionBlockedBySafety => {
                write!(f, "Action blocked by safety layer")
            }
            ComputerUseError::MaxIterationsReached => {
                write!(f, "Maximum iterations reached without completing task")
            }
            ComputerUseError::NotMakingProgress => write!(f, "Task is not making progress"),
            ComputerUseError::VisionError(msg) => write!(f, "Vision error: {}", msg),
        }
    }
}

impl std::error::Error for ComputerUseError {}
