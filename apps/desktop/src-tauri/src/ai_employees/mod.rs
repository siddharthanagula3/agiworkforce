pub mod registry;
pub mod employees;
pub mod executor;
pub mod marketplace;
pub mod demo_workflows;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// AI Employee definition with role, capabilities, and demo workflows
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIEmployee {
    pub id: String,
    pub name: String,
    pub role: EmployeeRole,
    pub description: String,
    pub capabilities: Vec<String>,
    pub estimated_time_saved_per_run: u64, // minutes
    pub estimated_cost_saved_per_run: f64, // USD
    pub demo_workflow: Option<DemoWorkflow>,
    pub required_integrations: Vec<String>,
    pub template_id: Option<String>,
    pub is_verified: bool,
    pub usage_count: u64,
    pub avg_rating: f64,
    pub created_at: i64,
    pub tags: Vec<String>,
}

/// Employee roles categorized by business function
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum EmployeeRole {
    // Customer Support
    SupportAgent,
    EmailResponder,
    LiveChatBot,
    TicketTriager,

    // Sales & Marketing
    LeadQualifier,
    EmailCampaigner,
    SocialMediaManager,
    ContentWriter,

    // Operations
    DataEntry,
    InvoiceProcessor,
    ExpenseReconciler,
    ScheduleManager,

    // Development
    CodeReviewer,
    BugTriager,
    DocumentationWriter,
    TestRunner,

    // Personal Assistant
    InboxManager,
    CalendarOptimizer,
    TaskOrganizer,
    ResearchAssistant,
}

impl EmployeeRole {
    pub fn category(&self) -> &str {
        match self {
            Self::SupportAgent | Self::EmailResponder | Self::LiveChatBot | Self::TicketTriager => {
                "Customer Support"
            }
            Self::LeadQualifier | Self::EmailCampaigner | Self::SocialMediaManager | Self::ContentWriter => {
                "Sales & Marketing"
            }
            Self::DataEntry | Self::InvoiceProcessor | Self::ExpenseReconciler | Self::ScheduleManager => {
                "Operations"
            }
            Self::CodeReviewer | Self::BugTriager | Self::DocumentationWriter | Self::TestRunner => {
                "Development"
            }
            Self::InboxManager | Self::CalendarOptimizer | Self::TaskOrganizer | Self::ResearchAssistant => {
                "Personal Assistant"
            }
        }
    }
}

/// Demo workflow configuration for instant testing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DemoWorkflow {
    pub title: String,
    pub steps: Vec<DemoStep>,
    pub sample_input: String,
    pub expected_output: String,
    pub duration_seconds: u64,
}

/// Individual step in a demo workflow
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DemoStep {
    pub description: String,
    pub tool: String,
    pub input: HashMap<String, String>,
    pub expected_result: String,
}

/// Task to be assigned to an AI employee
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmployeeTask {
    pub id: String,
    pub user_employee_id: String,
    pub task_type: String,
    pub input_data: HashMap<String, serde_json::Value>,
    pub output_data: Option<HashMap<String, serde_json::Value>>,
    pub time_saved_minutes: Option<u64>,
    pub cost_saved_usd: Option<f64>,
    pub started_at: i64,
    pub completed_at: Option<i64>,
    pub status: TaskStatus,
    pub error: Option<String>,
}

/// Task execution status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TaskStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
}

/// User's hired employee instance
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserEmployee {
    pub id: String,
    pub user_id: String,
    pub employee_id: String,
    pub hired_at: i64,
    pub tasks_completed: u64,
    pub time_saved_minutes: u64,
    pub cost_saved_usd: f64,
    pub is_active: bool,
    pub custom_config: Option<HashMap<String, serde_json::Value>>,
}

/// Result of a task execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResult {
    pub task_id: String,
    pub status: TaskStatus,
    pub output: HashMap<String, serde_json::Value>,
    pub time_saved_minutes: u64,
    pub cost_saved_usd: f64,
    pub execution_time_seconds: f64,
    pub steps_completed: Vec<String>,
    pub error: Option<String>,
}

/// Result of a demo execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DemoResult {
    pub employee_id: String,
    pub success: bool,
    pub output: HashMap<String, serde_json::Value>,
    pub time_saved_minutes: u64,
    pub cost_saved_usd: f64,
    pub execution_time_seconds: f64,
    pub steps_completed: Vec<DemoStepResult>,
    pub error: Option<String>,
}

/// Result of a single demo step
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DemoStepResult {
    pub step_number: usize,
    pub description: String,
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
}

/// Employee marketplace statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmployeeStats {
    pub total_hires: u64,
    pub total_tasks_completed: u64,
    pub total_time_saved_hours: f64,
    pub total_cost_saved_usd: f64,
    pub avg_rating: f64,
    pub testimonials: Vec<Testimonial>,
    pub recent_activity: Vec<ActivityLog>,
}

/// User testimonial for an employee
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Testimonial {
    pub user_id: String,
    pub rating: u8,
    pub comment: String,
    pub created_at: i64,
}

/// Activity log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityLog {
    pub timestamp: i64,
    pub action: String,
    pub details: String,
}

/// Filters for searching employees
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EmployeeFilters {
    pub roles: Vec<EmployeeRole>,
    pub tags: Vec<String>,
    pub required_integrations: Vec<String>,
    pub min_rating: Option<f64>,
    pub verified_only: bool,
}

/// Error types for AI employee operations
#[derive(Debug, thiserror::Error)]
pub enum EmployeeError {
    #[error("Employee not found: {0}")]
    NotFound(String),

    #[error("Employee already hired: {0}")]
    AlreadyHired(String),

    #[error("Task execution failed: {0}")]
    ExecutionFailed(String),

    #[error("Demo execution failed: {0}")]
    DemoFailed(String),

    #[error("Database error: {0}")]
    DatabaseError(String),

    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),

    #[error("Required integration missing: {0}")]
    MissingIntegration(String),
}

// Implement From<String> for convenient error conversions
impl From<String> for EmployeeError {
    fn from(msg: String) -> Self {
        EmployeeError::ExecutionFailed(msg)
    }
}

pub type Result<T> = std::result::Result<T, EmployeeError>;
