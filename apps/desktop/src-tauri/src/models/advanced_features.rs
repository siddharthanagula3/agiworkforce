use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use serde_json::Value;

/// Tool execution status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ExecutionStatus {
    Pending,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

/// Tool execution record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolExecution {
    pub id: String,
    pub conversation_id: String,
    pub tool_name: String,
    #[serde(default)]
    pub parameters: Value,
    pub status: ExecutionStatus,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub started_at: DateTime<Utc>,
    #[serde(with = "chrono::serde::ts_seconds_option")]
    pub completed_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub result: Option<Value>,
    pub error: Option<String>,
    #[serde(default)]
    pub can_be_paused: bool,
    #[serde(default)]
    pub is_paused: bool,
    #[serde(default)]
    pub progress: u8, // 0-100
    #[serde(default)]
    pub log_entries: Vec<String>,
}

/// Execution progress update
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionUpdate {
    pub execution_id: String,
    pub progress: u8,
    pub log_message: Option<String>,
    pub intermediate_result: Option<Value>,
    pub timestamp: DateTime<Utc>,
}

/// File metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMetadata {
    pub id: String,
    pub conversation_id: Option<String>,
    pub message_id: Option<String>,
    pub name: String,
    pub size: u64,
    pub mime_type: String,
    pub path: String,
    pub thumbnail_path: Option<String>,
    pub extracted_text: Option<String>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub created_at: DateTime<Utc>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub tags: Vec<String>,
}

/// Message draft
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageDraft {
    pub conversation_id: String,
    pub content: String,
    #[serde(default)]
    pub attachments: Vec<String>,  // file IDs
    pub focus_mode: Option<String>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub saved_at: DateTime<Utc>,
}

/// Approval setting type
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ApprovalType {
    Conversation,
    Tool,
}

/// Conversation-level approval settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationApproval {
    pub auto_approve_all: bool,
    #[serde(with = "chrono::serde::ts_seconds_option")]
    pub expires_at: Option<DateTime<Utc>>,
}

/// Tool-level approval settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolApproval {
    pub always_ask: bool,
    pub always_approve: bool,
    #[serde(default)]
    pub requires_review: Vec<String>, // parameter names
}

/// Approval settings wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalSetting {
    pub key: String,
    #[serde(rename = "type")]
    pub approval_type: ApprovalType,
    pub settings: Value,
    #[serde(with = "chrono::serde::ts_seconds_option")]
    pub expires_at: Option<DateTime<Utc>>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub created_at: DateTime<Utc>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub updated_at: DateTime<Utc>,
}

/// Plan execution status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PlanStatus {
    Draft,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

/// Step execution status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum StepStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Skipped,
}

/// Plan step
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanStep {
    pub id: String,
    pub description: String,
    pub tool: String,
    pub parameters: Value,
    #[serde(default)]
    pub depends_on: Vec<String>, // step IDs
    pub status: StepStatus,
    #[serde(default)]
    pub result: Option<Value>,
    pub error: Option<String>,
}

/// Execution plan
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionPlan {
    pub id: String,
    pub conversation_id: String,
    pub name: String,
    pub description: Option<String>,
    pub steps: Vec<PlanStep>,
    #[serde(default)]
    pub current_step: usize,
    pub status: PlanStatus,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub created_at: DateTime<Utc>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub updated_at: DateTime<Utc>,
    #[serde(with = "chrono::serde::ts_seconds_option")]
    pub started_at: Option<DateTime<Utc>>,
    #[serde(with = "chrono::serde::ts_seconds_option")]
    pub completed_at: Option<DateTime<Utc>>,
}

/// Search result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub conversation_id: String,
    pub message_id: Option<String>,
    pub score: f32,
    pub snippet: String,
    #[serde(default)]
    pub highlights: Vec<String>,
}

/// Search filters
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SearchFilters {
    pub conversation_ids: Option<Vec<String>>,
    pub date_range: Option<(DateTime<Utc>, DateTime<Utc>)>,
    pub role: Option<String>,
}

/// Smart suggestion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmartSuggestion {
    pub text: String,
    pub context: String,
    pub confidence: f32, // 0.0-1.0
    pub category: String, // "continue", "clarify", "explore", "action"
}
