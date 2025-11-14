use crate::agi::{
    AGIConfig, AGICore, AgentOrchestrator, AgentResult, AgentStatus, ExecutionContext, Goal,
    Priority, ScoredResult,
};
use crate::automation::AutomationService;
use crate::commands::llm::LLMState;
use crate::router::LLMRouter;
use anyhow::Result;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex as TokioMutex;

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

#[derive(Debug, Serialize, Deserialize)]
pub struct SubmitParallelGoalRequest {
    pub description: String,
    pub priority: Option<String>,
    pub deadline: Option<u64>,
    pub success_criteria: Option<Vec<String>>,
    pub num_agents: Option<usize>, // Number of parallel agents (default: 8)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SubmitParallelGoalResponse {
    pub best_result: ScoredResult,
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

    let agi = AGICore::new(
        config,
        router_for_agi,
        automation.inner().clone(),
        Some(app.clone()),
    )
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

/// Submit a goal for parallel execution with multiple agents (Cursor 2.0-style)
///
/// Spawns N agents that work on the same goal with different strategies in isolated sandboxes.
/// Returns the best result after comparing all executions.
#[tauri::command]
pub async fn agi_submit_goal_parallel(
    request: SubmitParallelGoalRequest,
) -> Result<SubmitParallelGoalResponse, String> {
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

    let num_agents = request.num_agents.unwrap_or(8); // Default: 8 agents

    // Now we can safely await with tokio::Mutex
    let agi = agi_arc.lock().await;
    let best_result = agi
        .submit_goal_parallel(goal, num_agents)
        .await
        .map_err(|e| format!("Failed to execute parallel goal: {}", e))?;

    Ok(SubmitParallelGoalResponse { best_result })
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

// ============================================================================
// Parallel Agent Orchestration Commands
// ============================================================================

// Global orchestrator instance
static ORCHESTRATOR: Mutex<Option<Arc<TokioMutex<AgentOrchestrator>>>> = Mutex::new(None);

#[derive(Debug, Serialize, Deserialize)]
pub struct OrchestratorInitRequest {
    pub max_agents: usize, // Maximum number of concurrent agents
    pub config: AGIConfig,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SpawnAgentRequest {
    pub description: String,
    pub priority: Option<String>,
    pub deadline: Option<u64>,
    pub success_criteria: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SpawnAgentResponse {
    pub agent_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SpawnParallelAgentsRequest {
    pub goals: Vec<SpawnAgentRequest>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SpawnParallelAgentsResponse {
    pub agent_ids: Vec<String>,
}

/// Initialize the agent orchestrator
#[tauri::command]
pub async fn orchestrator_init(
    request: OrchestratorInitRequest,
    automation: State<'_, Arc<AutomationService>>,
    llm_state: State<'_, LLMState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Get router from LLM state
    let router = llm_state.router.lock().await;
    // Create a new router instance for orchestrator
    let router_for_orchestrator = Arc::new(tokio::sync::Mutex::new(LLMRouter::new()));
    drop(router);

    let orchestrator = AgentOrchestrator::new(
        request.max_agents,
        request.config,
        router_for_orchestrator,
        automation.inner().clone(),
        Some(app.clone()),
    )
    .map_err(|e| format!("Failed to create orchestrator: {}", e))?;

    let orchestrator_arc = Arc::new(TokioMutex::new(orchestrator));
    *ORCHESTRATOR.lock() = Some(orchestrator_arc);

    tracing::info!(
        "[Orchestrator] Initialized with max_agents={}",
        request.max_agents
    );

    Ok(())
}

/// Spawn a single agent
#[tauri::command]
pub async fn orchestrator_spawn_agent(
    request: SpawnAgentRequest,
) -> Result<SpawnAgentResponse, String> {
    let orchestrator_arc = {
        let guard = ORCHESTRATOR.lock();
        guard
            .as_ref()
            .ok_or_else(|| "Orchestrator not initialized".to_string())?
            .clone()
    };

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

    let orchestrator = orchestrator_arc.lock().await;
    let agent_id = orchestrator
        .spawn_agent(goal)
        .await
        .map_err(|e| format!("Failed to spawn agent: {}", e))?;

    Ok(SpawnAgentResponse { agent_id })
}

/// Spawn multiple agents in parallel
#[tauri::command]
pub async fn orchestrator_spawn_parallel(
    request: SpawnParallelAgentsRequest,
) -> Result<SpawnParallelAgentsResponse, String> {
    let orchestrator_arc = {
        let guard = ORCHESTRATOR.lock();
        guard
            .as_ref()
            .ok_or_else(|| "Orchestrator not initialized".to_string())?
            .clone()
    };

    let mut goals = Vec::new();
    for req in request.goals {
        let priority = match req.priority.as_deref() {
            Some("low") => Priority::Low,
            Some("medium") => Priority::Medium,
            Some("high") => Priority::High,
            Some("critical") => Priority::Critical,
            _ => Priority::Medium,
        };

        let goal = Goal {
            id: format!("goal_{}", &uuid::Uuid::new_v4().to_string()[..8]),
            description: req.description,
            priority,
            deadline: req.deadline,
            constraints: vec![],
            success_criteria: req.success_criteria.unwrap_or_default(),
        };
        goals.push(goal);
    }

    let orchestrator = orchestrator_arc.lock().await;
    let agent_ids = orchestrator
        .spawn_parallel(goals)
        .await
        .map_err(|e| format!("Failed to spawn parallel agents: {}", e))?;

    Ok(SpawnParallelAgentsResponse { agent_ids })
}

/// Get status of a specific agent
#[tauri::command]
pub async fn orchestrator_get_agent_status(
    agent_id: String,
) -> Result<Option<AgentStatus>, String> {
    let orchestrator_arc = {
        let guard = ORCHESTRATOR.lock();
        guard
            .as_ref()
            .ok_or_else(|| "Orchestrator not initialized".to_string())?
            .clone()
    };

    let orchestrator = orchestrator_arc.lock().await;
    let status = orchestrator.get_agent_status(&agent_id).await;

    Ok(status)
}

/// List all active agents
#[tauri::command]
pub async fn orchestrator_list_agents() -> Result<Vec<AgentStatus>, String> {
    let orchestrator_arc = {
        let guard = ORCHESTRATOR.lock();
        guard
            .as_ref()
            .ok_or_else(|| "Orchestrator not initialized".to_string())?
            .clone()
    };

    let orchestrator = orchestrator_arc.lock().await;
    let agents = orchestrator.list_active_agents().await;

    Ok(agents)
}

/// Cancel a specific agent
#[tauri::command]
pub async fn orchestrator_cancel_agent(agent_id: String) -> Result<(), String> {
    let orchestrator_arc = {
        let guard = ORCHESTRATOR.lock();
        guard
            .as_ref()
            .ok_or_else(|| "Orchestrator not initialized".to_string())?
            .clone()
    };

    let orchestrator = orchestrator_arc.lock().await;
    orchestrator
        .cancel_agent(&agent_id)
        .await
        .map_err(|e| format!("Failed to cancel agent: {}", e))
}

/// Cancel all agents
#[tauri::command]
pub async fn orchestrator_cancel_all() -> Result<(), String> {
    let orchestrator_arc = {
        let guard = ORCHESTRATOR.lock();
        guard
            .as_ref()
            .ok_or_else(|| "Orchestrator not initialized".to_string())?
            .clone()
    };

    let orchestrator = orchestrator_arc.lock().await;
    orchestrator
        .cancel_all_agents()
        .await
        .map_err(|e| format!("Failed to cancel all agents: {}", e))
}

/// Wait for all agents to complete and return results
#[tauri::command]
pub async fn orchestrator_wait_all() -> Result<Vec<AgentResult>, String> {
    let orchestrator_arc = {
        let guard = ORCHESTRATOR.lock();
        guard
            .as_ref()
            .ok_or_else(|| "Orchestrator not initialized".to_string())?
            .clone()
    };

    let orchestrator = orchestrator_arc.lock().await;
    let results = orchestrator.wait_for_all().await;

    Ok(results)
}

/// Cleanup completed agents
#[tauri::command]
pub async fn orchestrator_cleanup() -> Result<usize, String> {
    let orchestrator_arc = {
        let guard = ORCHESTRATOR.lock();
        guard
            .as_ref()
            .ok_or_else(|| "Orchestrator not initialized".to_string())?
            .clone()
    };

    let orchestrator = orchestrator_arc.lock().await;
    let removed = orchestrator
        .cleanup_completed()
        .await
        .map_err(|e| format!("Failed to cleanup: {}", e))?;

    Ok(removed)
}
