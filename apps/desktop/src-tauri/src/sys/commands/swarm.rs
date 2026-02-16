use crate::automation::AutomationService;
use crate::core::agi::Goal;
use crate::core::llm::LLMRouter;
use crate::core::swarm::{SwarmConfig, SwarmOrchestrator, SwarmResult, SwarmStats};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, State};
use tokio::sync::RwLock as TokioRwLock;

/// Managed state for the Swarm Orchestrator
pub struct SwarmState {
    pub orchestrator: Arc<TokioRwLock<Option<SwarmOrchestrator>>>,
}

impl Default for SwarmState {
    fn default() -> Self {
        Self::new()
    }
}

impl SwarmState {
    pub fn new() -> Self {
        Self {
            orchestrator: Arc::new(TokioRwLock::new(None)),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SwarmInitRequest {
    pub max_agents: usize,
    pub auto_spawn: bool,
    pub optimize_critical_path: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SwarmGoalRequest {
    pub goal: String,
    pub priority: Option<String>,
}

#[tauri::command]
pub async fn swarm_init(
    request: SwarmInitRequest,
    state: State<'_, SwarmState>,
    app_handle: AppHandle,
    automation: State<'_, Option<Arc<AutomationService>>>,
    llm_router: State<'_, Arc<TokioRwLock<LLMRouter>>>,
) -> Result<(), String> {
    let config = SwarmConfig {
        max_agents: request.max_agents,
        auto_spawn: request.auto_spawn,
        optimize_critical_path: request.optimize_critical_path,
        ..Default::default()
    };

    let automation_service = automation
        .inner()
        .clone()
        .ok_or_else(|| "Automation service not available".to_string())?;

    let orchestrator = SwarmOrchestrator::new(
        config,
        llm_router.inner().clone(),
        automation_service,
        Some(app_handle),
    )
    .map_err(|e| format!("Failed to create orchestrator: {}", e))?;

    let mut guard = state.orchestrator.write().await;
    *guard = Some(orchestrator);

    Ok(())
}

#[tauri::command]
pub async fn swarm_execute_goal(
    request: SwarmGoalRequest,
    state: State<'_, SwarmState>,
) -> Result<SwarmResult, String> {
    let guard = state.orchestrator.read().await;
    let orchestrator = guard
        .as_ref()
        .ok_or_else(|| "Swarm not initialized".to_string())?;

    let goal = Goal {
        id: uuid::Uuid::new_v4().to_string(),
        description: request.goal,
        priority: request
            .priority
            .map(|p| match p.to_lowercase().as_str() {
                "high" | "critical" => crate::core::agi::Priority::High,
                "low" => crate::core::agi::Priority::Low,
                _ => crate::core::agi::Priority::Medium,
            })
            .unwrap_or(crate::core::agi::Priority::Medium),
        constraints: vec![],
        success_criteria: vec![],
        deadline: None,
    };

    let result = orchestrator
        .execute_swarm_task(goal)
        .await
        .map_err(|e| format!("Swarm execution failed: {}", e))?;

    Ok(result)
}

#[tauri::command]
pub async fn swarm_get_stats(state: State<'_, SwarmState>) -> Result<SwarmStats, String> {
    let guard = state.orchestrator.read().await;
    if let Some(orchestrator) = guard.as_ref() {
        return Ok(orchestrator.get_stats());
    }
    Ok(SwarmStats::default())
}

#[tauri::command]
pub async fn swarm_stop(state: State<'_, SwarmState>) -> Result<(), String> {
    let guard = state.orchestrator.write().await;
    if let Some(orchestrator) = guard.as_ref() {
        orchestrator.stop();
        // Also terminate all agents to ensure clean shutdown
        orchestrator.terminate_all();
    }
    Ok(())
}
