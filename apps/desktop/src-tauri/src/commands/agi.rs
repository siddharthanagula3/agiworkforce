use crate::agi::{AGIConfig, AGICore, Goal, Priority, ExecutionContext};
use crate::automation::AutomationService;
use crate::commands::llm::LLMState;
use crate::router::LLMRouter;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct SubmitGoalRequest {
    pub description: String,
    pub priority: Option<String>,
    pub deadline: Option<u64>,
    pub success_criteria: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SubmitGoalResponse {
    pub goal_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GoalStatusResponse {
    pub context: ExecutionContext,
}

// Global AGI instance
static AGI_CORE: Mutex<Option<Arc<Mutex<AGICore>>>> = Mutex::new(None);

/// Initialize the AGI system
#[tauri::command]
pub async fn agi_init(
    config: AGIConfig,
    automation: State<'_, Arc<AutomationService>>,
    llm_state: State<'_, LLMState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Get router from LLM state
    let router = llm_state.router.lock().await;
    // Create a new router instance for AGI (since we can't clone)
    // TODO: Refactor to share router properly
    let router_for_agi = Arc::new(LLMRouter::new());
    drop(router);
    
    let agi = AGICore::new(config, router_for_agi, automation.inner().clone(), Some(app.clone()))
        .map_err(|e| format!("Failed to create AGI: {}", e))?;

    let agi_arc = Arc::new(Mutex::new(agi));

    // Start AGI loop in background
    let agi_clone = agi_arc.clone();
    let app_for_events = app.clone();
    tauri::async_runtime::spawn(async move {
        // Clone the AGI core to avoid holding the lock
        let mut agi = {
            let guard = agi_clone.lock().unwrap();
            let mut cloned = guard.clone_for_execution();
            // Restore app handle for event emission
            cloned.app_handle = Some(app_for_events);
            cloned
        };
        if let Err(e) = agi.start().await {
            tracing::error!("[AGI] AGI loop error: {}", e);
        }
    });

    *AGI_CORE.lock().unwrap() = Some(agi_arc);
    Ok(())
}

/// Submit a goal to the AGI
#[tauri::command]
pub async fn agi_submit_goal(request: SubmitGoalRequest) -> Result<SubmitGoalResponse, String> {
    let agi_guard = AGI_CORE.lock().unwrap();
    let agi = agi_guard
        .as_ref()
        .ok_or_else(|| "AGI not initialized".to_string())?;

    let priority = match request.priority.as_deref() {
        Some("low") => Priority::Low,
        Some("medium") => Priority::Medium,
        Some("high") => Priority::High,
        Some("critical") => Priority::Critical,
        _ => Priority::Medium,
    };

    let goal = Goal {
        id: format!("goal_{}", uuid::Uuid::new_v4().to_string()[..8].to_string()),
        description: request.description,
        priority,
        deadline: request.deadline,
        constraints: vec![],
        success_criteria: request.success_criteria.unwrap_or_default(),
    };

    let agi = agi.lock().unwrap();
    let goal_id = agi
        .submit_goal(goal)
        .await
        .map_err(|e| format!("Failed to submit goal: {}", e))?;

    Ok(SubmitGoalResponse { goal_id })
}

/// Get goal status
#[tauri::command]
pub async fn agi_get_goal_status(goal_id: String) -> Result<GoalStatusResponse, String> {
    let agi_guard = AGI_CORE.lock().unwrap();
    let agi = agi_guard
        .as_ref()
        .ok_or_else(|| "AGI not initialized".to_string())?;

    let agi = agi.lock().unwrap();
    let context = agi
        .get_goal_status(&goal_id)
        .ok_or_else(|| format!("Goal {} not found", goal_id))?;

    Ok(GoalStatusResponse { context })
}

/// List all active goals
#[tauri::command]
pub async fn agi_list_goals() -> Result<Vec<Goal>, String> {
    let agi_guard = AGI_CORE.lock().unwrap();
    let agi = agi_guard
        .as_ref()
        .ok_or_else(|| "AGI not initialized".to_string())?;

    let agi = agi.lock().unwrap();
    Ok(agi.list_goals())
}

/// Stop the AGI system
#[tauri::command]
pub async fn agi_stop() -> Result<(), String> {
    let agi_guard = AGI_CORE.lock().unwrap();
    if let Some(agi) = agi_guard.as_ref() {
        let agi = agi.lock().unwrap();
        agi.stop();
    }
    Ok(())
}

