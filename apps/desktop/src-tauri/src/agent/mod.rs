pub mod ai_orchestrator;
pub mod approval;
pub mod autonomous;
pub mod change_tracker;
pub mod code_generator;
pub mod context_compactor;
pub mod context_manager;
pub mod executor;
pub mod intelligent_file_access;
pub mod planner;
pub mod prompt_engineer;
pub mod rag_system;
pub mod runtime;
pub mod vision;

#[cfg(test)]
mod tests;

pub use approval::ApprovalManager;
pub use autonomous::AutonomousAgent;
pub use executor::TaskExecutor;
pub use planner::TaskPlanner;
pub use runtime::AgentRuntime;
pub use vision::VisionAutomation;

use serde::ser::SerializeStruct;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::time::Duration;

/// Task status during execution
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TaskStatus {
    Pending,
    Planning,
    Executing,
    WaitingApproval,
    Paused,
    Completed,
    Failed(String),
    Cancelled,
}

/// A task to be executed by the autonomous agent
#[derive(Debug, Clone)]
pub struct Task {
    pub id: String,
    pub description: String,
    pub status: TaskStatus,
    pub created_at: std::time::Instant,
    pub updated_at: std::time::Instant,
    pub steps: Vec<TaskStep>,
    pub current_step: usize,
    pub max_retries: usize,
    pub retry_count: usize,
    pub requires_approval: bool,
    pub auto_approve: bool,
}

impl Serialize for Task {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("Task", 9)?;
        state.serialize_field("id", &self.id)?;
        state.serialize_field("description", &self.description)?;
        state.serialize_field("status", &self.status)?;
        state.serialize_field("created_at_secs", &self.created_at.elapsed().as_secs())?;
        state.serialize_field("updated_at_secs", &self.updated_at.elapsed().as_secs())?;
        state.serialize_field("steps", &self.steps)?;
        state.serialize_field("current_step", &self.current_step)?;
        state.serialize_field("max_retries", &self.max_retries)?;
        state.serialize_field("retry_count", &self.retry_count)?;
        state.serialize_field("requires_approval", &self.requires_approval)?;
        state.serialize_field("auto_approve", &self.auto_approve)?;
        state.end()
    }
}

impl<'de> Deserialize<'de> for Task {
    fn deserialize<D>(_deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        // Simplified deserialization - Instant will be set to now()
        let _created_at = std::time::Instant::now();
        let _updated_at = std::time::Instant::now();
        // ... rest of fields would be deserialized normally
        // This is a simplified version
        Err(serde::de::Error::custom(
            "Task deserialization not fully implemented",
        ))
    }
}

/// A single step in a task execution plan
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskStep {
    pub id: String,
    pub action: Action,
    pub description: String,
    pub expected_result: Option<String>,
    pub timeout: Duration,
    pub retry_on_failure: bool,
}

/// Actions the agent can perform
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Action {
    /// Take a screenshot of the current screen
    Screenshot { region: Option<ScreenRegion> },
    /// Click on an element (by coordinates, UIA, or image match)
    Click { target: ClickTarget },
    /// Type text into an element
    Type { target: ClickTarget, text: String },
    /// Navigate to a URL in browser
    Navigate { url: String },
    /// Wait for an element to appear
    WaitForElement {
        target: ClickTarget,
        timeout: Duration,
    },
    /// Execute a command in terminal
    ExecuteCommand { command: String, args: Vec<String> },
    /// Read file content
    ReadFile { path: String },
    /// Write file content
    WriteFile { path: String, content: String },
    /// Search for text in UI (using OCR or UIA)
    SearchText { query: String },
    /// Scroll in a direction
    Scroll {
        direction: ScrollDirection,
        amount: i32,
    },
    /// Press a key combination
    PressKey { keys: Vec<String> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ClickTarget {
    Coordinates { x: i32, y: i32 },
    UIAElement { element_id: String },
    ImageMatch { image_path: String, threshold: f64 },
    TextMatch { text: String, fuzzy: bool },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenRegion {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ScrollDirection {
    Up,
    Down,
    Left,
    Right,
}

/// Execution result for a task step
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepResult {
    pub step_id: String,
    pub success: bool,
    pub result: Option<String>,
    pub error: Option<String>,
    pub screenshot_path: Option<String>,
    pub duration: Duration,
}

/// Configuration for the autonomous agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub auto_approve: bool,
    pub max_concurrent_tasks: usize,
    pub default_timeout: Duration,
    pub max_retries: usize,
    pub use_local_llm_fallback: bool,
    pub local_llm_threshold_tokens: u64,
    pub screenshot_quality: ScreenshotQuality,
    pub vision_model: VisionModel,
    pub cpu_limit_percent: f64,
    pub memory_limit_mb: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ScreenshotQuality {
    Low,    // Faster, lower quality
    Medium, // Balanced
    High,   // Slower, higher quality
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VisionModel {
    LocalOCR,    // Use local OCR (faster, no API calls)
    CloudVision, // Use cloud vision API (more accurate)
    Hybrid,      // Try local first, fallback to cloud
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            auto_approve: false,
            max_concurrent_tasks: 1,
            default_timeout: Duration::from_secs(30),
            max_retries: 3,
            use_local_llm_fallback: true,
            local_llm_threshold_tokens: 1000,
            screenshot_quality: ScreenshotQuality::Medium,
            vision_model: VisionModel::Hybrid,
            cpu_limit_percent: 50.0,
            memory_limit_mb: 512,
        }
    }
}
