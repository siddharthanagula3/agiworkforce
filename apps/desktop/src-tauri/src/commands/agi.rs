use crate::agi::{AGIConfig, AGICore, Goal, Priority, ExecutionContext};
use crate::automation::AutomationService;
use crate::commands::llm::LLMState;
use crate::router::LLMRouter;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex as TokioMutex;
use parking_lot::Mutex;

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

// Global AGI instance - use parking_lot::Mutex for outer, Arc<TokioMutex> for inner
static AGI_CORE: Mutex<Option<Arc<TokioMutex<AGICore>>>> = Mutex::new(None);

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
    let router_for_agi = Arc::new(tokio::sync::Mutex::new(LLMRouter::new()));
    drop(router);

    let agi = AGICore::new(config, router_for_agi, automation.inner().clone(), Some(app.clone()))
        .map_err(|e| format!("Failed to create AGI: {}", e))?;

    let agi_arc = Arc::new(TokioMutex::new(agi));

    // Start AGI loop in background
    let agi_clone = agi_arc.clone();
    let app_for_events = app.clone();
    tokio::spawn(async move {
        // Clone the AGI core to avoid holding the lock
        let agi = {
            let guard = agi_clone.lock().await;
            let cloned = guard.clone_for_execution();
            // Restore app handle for event emission
            let mut cloned_with_handle = cloned;
            cloned_with_handle.app_handle = Some(app_for_events);
            cloned_with_handle
        };
        if let Err(e) = agi.start().await {
            tracing::error!("[AGI] AGI loop error: {}", e);
        }
    });

    *AGI_CORE.lock() = Some(agi_arc);
    Ok(())
}

/// Submit a goal to the AGI
#[tauri::command]
pub async fn agi_submit_goal(request: SubmitGoalRequest) -> Result<SubmitGoalResponse, String> {
    let agi_arc = {
        let agi_guard = AGI_CORE.lock();
        agi_guard
            .as_ref()
            .ok_or_else(|| "AGI not initialized".to_string())?
            .clone()
    }; // Drop the guard immediately

    let priority = match request.priority.as_deref() {
        Some("low") => Priority::Low,
        Some("medium") => Priority::Medium,
        Some("high") => Priority::High,
        Some("critical") => Priority::Critical,
        _ => Priority::Medium,
    };

    let goal = Goal {
        id: format!("goal_{}", &uuid::Uuid::new_v4().to_string()[..8]),
        description: request.description,
        priority,
        deadline: request.deadline,
        constraints: vec![],
        success_criteria: request.success_criteria.unwrap_or_default(),
    };

    let goal_id = goal.id.clone();

    // Now we can safely await with tokio::Mutex
    let agi = agi_arc.lock().await;
    agi.submit_goal(goal)
        .await
        .map_err(|e| format!("Failed to submit goal: {}", e))?;

    Ok(SubmitGoalResponse { goal_id })
}

/// Get goal status
#[tauri::command]
pub async fn agi_get_goal_status(goal_id: String) -> Result<GoalStatusResponse, String> {
    let agi_arc = {
        let agi_guard = AGI_CORE.lock();
        agi_guard
            .as_ref()
            .ok_or_else(|| "AGI not initialized".to_string())?
            .clone()
    }; // Drop the guard immediately

    let agi = agi_arc.lock().await;
    let context = agi
        .get_goal_status(&goal_id)
        .ok_or_else(|| format!("Goal {} not found", goal_id))?;

    Ok(GoalStatusResponse { context })
}

/// List all active goals
#[tauri::command]
pub async fn agi_list_goals() -> Result<Vec<Goal>, String> {
    let agi_arc = {
        let agi_guard = AGI_CORE.lock();
        agi_guard
            .as_ref()
            .ok_or_else(|| "AGI not initialized".to_string())?
            .clone()
    }; // Drop the guard immediately

    let agi = agi_arc.lock().await;
    let goals = agi.list_goals();

    Ok(goals)
}

/// Stop the AGI system
#[tauri::command]
pub async fn agi_stop() -> Result<(), String> {
    let agi_arc_opt = {
        let agi_guard = AGI_CORE.lock();
        agi_guard.as_ref().cloned()
    }; // Drop the guard immediately

    if let Some(agi_arc) = agi_arc_opt {
        let agi = agi_arc.lock().await;
        agi.stop();
    }
    Ok(())
}

