pub mod tutorial_manager;
pub mod progress_tracker;
pub mod sample_data;
pub mod rewards;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Onboarding progress for a user
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnboardingProgress {
    pub user_id: String,
    pub tutorial_id: String,
    pub current_step: usize,
    pub completed_steps: Vec<String>,
    pub started_at: i64,
    pub completed_at: Option<i64>,
    pub last_updated: i64,
}

/// Tutorial step definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TutorialStep {
    pub id: String,
    pub title: String,
    pub description: String,
    pub component: String, // Which UI component to highlight
    pub action_required: ActionType,
    pub help_text: String,
    pub estimated_duration_seconds: u32,
    pub validation_criteria: Option<ValidationCriteria>,
}

/// Type of action required in a tutorial step
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ActionType {
    Click { selector: String },
    Input { field: String, value: Option<String>, placeholder: Option<String> },
    Wait { duration_ms: u64 },
    Navigate { route: String },
    Complete, // User marks as complete manually
    Observe, // Just show information, no action needed
}

/// Validation criteria for step completion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationCriteria {
    pub check_type: ValidationType,
    pub expected_value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ValidationType {
    ElementExists,
    ValueEquals,
    StateMatches,
    Custom(String),
}

/// Complete tutorial definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tutorial {
    pub id: String,
    pub title: String,
    pub description: String,
    pub category: TutorialCategory,
    pub difficulty: TutorialDifficulty,
    pub estimated_minutes: usize,
    pub steps: Vec<TutorialStep>,
    pub prerequisites: Vec<String>, // IDs of tutorials that must be completed first
    pub rewards: Vec<String>, // Reward IDs granted upon completion
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TutorialCategory {
    GettingStarted,
    AgentTemplates,
    WorkflowOrchestration,
    TeamCollaboration,
    AdvancedFeatures,
    Integrations,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum TutorialDifficulty {
    Beginner = 1,
    Intermediate = 2,
    Advanced = 3,
    Expert = 4,
}

/// User tutorial progress summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserTutorialProgress {
    pub user_id: String,
    pub completed_tutorials: HashMap<String, i64>, // tutorial_id -> completion_timestamp
    pub in_progress_tutorials: HashMap<String, OnboardingProgress>,
    pub total_tutorials: usize,
    pub completion_percentage: f64,
    pub earned_rewards: Vec<String>,
}

/// Tutorial statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TutorialStats {
    pub tutorial_id: String,
    pub total_starts: u32,
    pub total_completions: u32,
    pub average_completion_time_seconds: f64,
    pub completion_rate: f64, // completions / starts
    pub average_steps_completed: f64,
    pub most_common_drop_off_step: Option<String>,
}

pub use tutorial_manager::{TutorialManager, TutorialError};
pub use progress_tracker::{ProgressTracker, ProgressError};
pub use sample_data::{SampleDataGenerator, SampleDataError};
pub use rewards::{RewardSystem, Reward, RewardType};
