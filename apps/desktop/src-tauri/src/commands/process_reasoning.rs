use crate::agi::{OutcomeTracker, ProcessOntology, ProcessTemplate, ProcessType, TrackedOutcome};
use crate::db::Database;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

/// Get all available process templates
#[tauri::command]
pub async fn get_process_templates(
    db: State<'_, Database>,
) -> Result<Vec<ProcessTemplateDTO>, String> {
    let db_path = db.path().to_string_lossy().to_string();

    let ontology = ProcessOntology::new(db_path)
        .map_err(|e| format!("Failed to create process ontology: {}", e))?;

    let templates = ontology.get_all_templates();

    Ok(templates
        .into_iter()
        .map(|t| ProcessTemplateDTO {
            id: t.id.clone(),
            process_type: format!("{:?}", t.process_type),
            name: t.name.clone(),
            description: t.description.clone(),
            required_tools: t.required_tools.clone(),
            expected_duration_ms: t.expected_duration_ms,
            best_practices: t.best_practices.clone(),
        })
        .collect())
}

/// Get outcome tracking for a specific goal
#[tauri::command]
pub async fn get_outcome_tracking(
    goal_id: String,
    db: State<'_, Database>,
) -> Result<Vec<TrackedOutcomeDTO>, String> {
    let db_path = db.path().to_string_lossy().to_string();

    let tracker = OutcomeTracker::new(db_path)
        .map_err(|e| format!("Failed to create outcome tracker: {}", e))?;

    let outcomes = tracker
        .get_outcomes_for_goal(&goal_id)
        .map_err(|e| format!("Failed to get outcomes: {}", e))?;

    Ok(outcomes
        .into_iter()
        .map(|o| TrackedOutcomeDTO {
            id: o.id,
            goal_id: o.goal_id,
            process_type: format!("{:?}", o.process_type),
            metric_name: o.metric_name,
            target_value: o.target_value,
            actual_value: o.actual_value,
            achieved: o.achieved,
            tracked_at: o.tracked_at,
        })
        .collect())
}

/// Get success rates for all process types
#[tauri::command]
pub async fn get_process_success_rates(
    db: State<'_, Database>,
) -> Result<HashMap<String, f64>, String> {
    let db_path = db.path().to_string_lossy().to_string();

    let tracker = OutcomeTracker::new(db_path)
        .map_err(|e| format!("Failed to create outcome tracker: {}", e))?;

    let mut rates = HashMap::new();

    for process_type in ProcessType::all() {
        let rate = tracker
            .calculate_success_rate(process_type)
            .map_err(|e| format!("Failed to calculate success rate: {}", e))?;
        rates.insert(format!("{:?}", process_type), rate);
    }

    Ok(rates)
}

/// Get best practices for a specific process type
#[tauri::command]
pub async fn get_best_practices(
    process_type: String,
    db: State<'_, Database>,
) -> Result<Vec<String>, String> {
    let db_path = db.path().to_string_lossy().to_string();

    let ontology = ProcessOntology::new(db_path)
        .map_err(|e| format!("Failed to create process ontology: {}", e))?;

    // Parse process type
    let pt = match process_type.as_str() {
        "AccountsPayable" => ProcessType::AccountsPayable,
        "CustomerSupport" => ProcessType::CustomerSupport,
        "DataEntry" => ProcessType::DataEntry,
        "EmailManagement" => ProcessType::EmailManagement,
        "CodeReview" => ProcessType::CodeReview,
        "Testing" => ProcessType::Testing,
        "Documentation" => ProcessType::Documentation,
        "Deployment" => ProcessType::Deployment,
        "LeadQualification" => ProcessType::LeadQualification,
        "SocialMedia" => ProcessType::SocialMedia,
        _ => return Err(format!("Unknown process type: {}", process_type)),
    };

    Ok(ontology.get_best_practices(pt))
}

/// Get detailed process statistics
#[tauri::command]
pub async fn get_process_statistics(
    db: State<'_, Database>,
) -> Result<Vec<ProcessStatDTO>, String> {
    let db_path = db.path().to_string_lossy().to_string();

    let tracker = OutcomeTracker::new(db_path)
        .map_err(|e| format!("Failed to create outcome tracker: {}", e))?;

    let mut stats = Vec::new();

    for process_type in ProcessType::all() {
        let process_stats = tracker
            .get_process_success_stats(process_type)
            .map_err(|e| format!("Failed to get process stats: {}", e))?;

        stats.push(ProcessStatDTO {
            process_type: format!("{:?}", process_stats.process_type),
            success_rate: process_stats.success_rate,
            total_executions: process_stats.total_executions,
            successful_executions: process_stats.successful_executions,
            average_score: process_stats.average_score,
        });
    }

    Ok(stats)
}

/// Data Transfer Objects for Tauri commands
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessTemplateDTO {
    pub id: String,
    pub process_type: String,
    pub name: String,
    pub description: String,
    pub required_tools: Vec<String>,
    pub expected_duration_ms: u64,
    pub best_practices: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackedOutcomeDTO {
    pub id: String,
    pub goal_id: String,
    pub process_type: String,
    pub metric_name: String,
    pub target_value: f64,
    pub actual_value: f64,
    pub achieved: bool,
    pub tracked_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessStatDTO {
    pub process_type: String,
    pub success_rate: f64,
    pub total_executions: usize,
    pub successful_executions: usize,
    pub average_score: f64,
}
