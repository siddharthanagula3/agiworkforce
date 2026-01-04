use crate::automation::AutomationService;
use crate::core::agi::{
    AGIConfig, AGICore, AgentOrchestrator, AgentResult, AgentStatus, ExecutionContext, Goal,
    Priority, ScoredResult,
};
use crate::core::router::Provider;
use crate::sys::commands::llm::LLMState;
use crate::sys::commands::AppDatabase;
use anyhow::Result;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{Emitter, Manager, State};
use tokio::sync::Mutex as TokioMutex;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitGoalRequest {
    pub description: String,
    pub priority: Option<String>,
    pub deadline: Option<u64>,
    pub success_criteria: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitGoalResponse {
    pub goal_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalStatusResponse {
    pub context: ExecutionContext,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitParallelGoalRequest {
    pub description: String,
    pub priority: Option<String>,
    pub deadline: Option<u64>,
    pub success_criteria: Option<Vec<String>>,
    pub num_agents: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitParallelGoalResponse {
    pub best_result: ScoredResult,
}

static AGI_CORE: Mutex<Option<Arc<TokioMutex<AGICore>>>> = Mutex::new(None);

#[tauri::command]
pub async fn agi_init(
    config: AGIConfig,
    automation: State<'_, Arc<Option<AutomationService>>>,
    llm_state: State<'_, LLMState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    if automation.is_none() {
        return Err(
            "Automation service not available. Please grant accessibility permissions.".to_string(),
        );
    }

    let router_for_agi = llm_state.router.clone();

    let automation_arc = Arc::new(
        AutomationService::new()
            .map_err(|e| format!("Failed to create automation service for AGI: {}", e))?,
    );

    let agi = AGICore::new(config, router_for_agi, automation_arc, Some(app.clone()))
        .map_err(|e| format!("Failed to create AGI: {}", e))?;

    let agi_arc = Arc::new(TokioMutex::new(agi));

    let agi_clone = agi_arc.clone();
    let app_for_events = app.clone();
    tokio::spawn(async move {
        let agi = {
            let guard = agi_clone.lock().await;
            let cloned = guard.clone_for_execution();

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

#[tauri::command]
pub async fn agi_cancel_goal(goal_id: String) -> Result<(), String> {
    let agi_opt = {
        let guard = AGI_CORE.lock();
        guard.clone()
    };

    if let Some(agi) = agi_opt {
        let agi = agi.lock().await;
        agi.cancel_goal(&goal_id).await.map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("AGI not initialized".to_string())
    }
}

#[tauri::command]
pub async fn agi_submit_goal(request: SubmitGoalRequest) -> Result<SubmitGoalResponse, String> {
    let agi_arc = {
        let agi_guard = AGI_CORE.lock();
        agi_guard
            .as_ref()
            .ok_or_else(|| "AGI not initialized".to_string())?
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

    let goal_id = goal.id.clone();

    let agi = agi_arc.lock().await;
    agi.submit_goal(goal)
        .await
        .map_err(|e| format!("Failed to submit goal: {}", e))?;

    Ok(SubmitGoalResponse { goal_id })
}

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

    let num_agents = request.num_agents.unwrap_or(8);

    let agi = agi_arc.lock().await;
    let best_result = agi
        .submit_goal_parallel(goal, num_agents)
        .await
        .map_err(|e| format!("Failed to execute parallel goal: {}", e))?;

    Ok(SubmitParallelGoalResponse { best_result })
}

#[tauri::command]
pub async fn agi_get_goal_status(goal_id: String) -> Result<GoalStatusResponse, String> {
    let agi_arc = {
        let agi_guard = AGI_CORE.lock();
        agi_guard
            .as_ref()
            .ok_or_else(|| "AGI not initialized".to_string())?
            .clone()
    };

    let agi = agi_arc.lock().await;
    let context = agi
        .get_goal_status(&goal_id)
        .ok_or_else(|| format!("Goal {} not found", goal_id))?;

    Ok(GoalStatusResponse { context })
}

#[tauri::command]
pub async fn agi_list_goals() -> Result<Vec<Goal>, String> {
    let agi_arc = {
        let agi_guard = AGI_CORE.lock();
        agi_guard
            .as_ref()
            .ok_or_else(|| "AGI not initialized".to_string())?
            .clone()
    };

    let agi = agi_arc.lock().await;
    let goals = agi.list_goals();

    Ok(goals)
}

#[tauri::command]
pub async fn agi_stop() -> Result<(), String> {
    let agi_arc_opt = {
        let agi_guard = AGI_CORE.lock();
        agi_guard.as_ref().cloned()
    };

    if let Some(agi_arc) = agi_arc_opt {
        let agi = agi_arc.lock().await;
        agi.stop();
    }
    Ok(())
}

pub static ORCHESTRATOR: Mutex<Option<Arc<TokioMutex<AgentOrchestrator>>>> = Mutex::new(None);

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestratorInitRequest {
    pub max_agents: usize,
    pub config: AGIConfig,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnAgentRequest {
    pub description: String,
    pub priority: Option<String>,
    pub deadline: Option<u64>,
    pub success_criteria: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnAgentResponse {
    pub agent_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnParallelAgentsRequest {
    pub goals: Vec<SpawnAgentRequest>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnParallelAgentsResponse {
    pub agent_ids: Vec<String>,
}

#[tauri::command]
pub async fn orchestrator_init(
    request: OrchestratorInitRequest,
    automation: State<'_, Arc<Option<AutomationService>>>,
    llm_state: State<'_, LLMState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    if automation.is_none() {
        return Err(
            "Automation service not available. Please grant accessibility permissions.".to_string(),
        );
    }

    let router_for_orchestrator = llm_state.router.clone();

    let automation_arc = Arc::new(
        AutomationService::new()
            .map_err(|e| format!("Failed to create automation service: {}", e))?,
    );

    let orchestrator = AgentOrchestrator::new(
        request.max_agents,
        request.config,
        router_for_orchestrator,
        automation_arc,
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

#[tauri::command]
pub async fn orchestrator_init_default(
    automation: State<'_, Arc<Option<AutomationService>>>,
    llm_state: State<'_, LLMState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let request = OrchestratorInitRequest {
        max_agents: 4,
        config: AGIConfig::default(),
    };
    orchestrator_init(request, automation, llm_state, app).await
}

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

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemResourcesResponse {
    pub cpu_usage_percent: f64,
    pub memory_usage_mb: u64,
    pub memory_total_mb: u64,
    pub network_usage_mbps: f64,
    pub storage_usage_mb: u64,
    pub storage_total_mb: u64,
    pub available_tools: Vec<String>,
}

#[tauri::command]
pub async fn get_system_resources() -> Result<SystemResourcesResponse, String> {
    let agi_arc = {
        let guard = AGI_CORE.lock();
        guard
            .as_ref()
            .ok_or_else(|| "AGI not initialized".to_string())?
            .clone()
    };

    let agi = agi_arc.lock().await;
    let resource_state = agi
        .resource_manager()
        .get_state()
        .await
        .map_err(|e| format!("Failed to get resource state: {}", e))?;

    let mut sys = sysinfo::System::new_all();
    sys.refresh_memory();
    let memory_total_mb = sys.total_memory() / 1024 / 1024;
    let storage_total_mb = 1000000;

    Ok(SystemResourcesResponse {
        cpu_usage_percent: resource_state.cpu_usage_percent,
        memory_usage_mb: resource_state.memory_usage_mb,
        memory_total_mb,
        network_usage_mbps: resource_state.network_usage_mbps,
        storage_usage_mb: resource_state.storage_usage_mb,
        storage_total_mb,
        available_tools: resource_state.available_tools,
    })
}

#[tauri::command]
pub async fn pause_agent(agent_id: String) -> Result<(), String> {
    let orchestrator_arc = {
        let guard = ORCHESTRATOR.lock();
        guard
            .as_ref()
            .ok_or_else(|| "Orchestrator not initialized".to_string())?
            .clone()
    };

    let orchestrator = orchestrator_arc.lock().await;
    orchestrator
        .pause_agent(&agent_id)
        .await
        .map_err(|e| format!("Failed to pause agent: {}", e))
}

#[tauri::command]
pub async fn resume_agent(agent_id: String) -> Result<(), String> {
    let orchestrator_arc = {
        let guard = ORCHESTRATOR.lock();
        guard
            .as_ref()
            .ok_or_else(|| "Orchestrator not initialized".to_string())?
            .clone()
    };

    let orchestrator = orchestrator_arc.lock().await;
    orchestrator
        .resume_agent(&agent_id)
        .await
        .map_err(|e| format!("Failed to resume agent: {}", e))
}

#[tauri::command]
pub async fn cancel_agent(agent_id: String) -> Result<(), String> {
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

#[tauri::command]
pub async fn refresh_agent_status() -> Result<Vec<AgentStatus>, String> {
    let orchestrator_arc = {
        let guard = ORCHESTRATOR.lock();
        match guard.as_ref() {
            Some(arc) => arc.clone(),
            None => {
                // Orchestrator not yet initialized - return empty list instead of error
                // This is normal during app startup before AGI features are used
                return Ok(vec![]);
            }
        }
    };

    let orchestrator = orchestrator_arc.lock().await;
    let statuses = orchestrator
        .list_agents()
        .await
        .map_err(|e| format!("Failed to list agents: {}", e))?;

    Ok(statuses)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeEntryResponse {
    pub id: String,
    pub category: String,
    pub content: String,
    pub metadata: std::collections::HashMap<String, String>,
    pub timestamp: u64,
    pub importance: f64,
}

#[tauri::command]
pub async fn query_knowledge(
    query: String,
    limit: usize,
) -> Result<Vec<KnowledgeEntryResponse>, String> {
    let agi_arc = {
        let guard = AGI_CORE.lock();
        guard
            .as_ref()
            .ok_or_else(|| "AGI not initialized".to_string())?
            .clone()
    };

    let agi = agi_arc.lock().await;
    let entries = agi
        .knowledge_base()
        .query(&query, limit)
        .await
        .map_err(|e| format!("Failed to query knowledge: {}", e))?;

    Ok(entries
        .into_iter()
        .map(|e| KnowledgeEntryResponse {
            id: e.id,
            category: e.category,
            content: e.content,
            metadata: e.metadata,
            timestamp: e.timestamp,
            importance: e.importance,
        })
        .collect())
}

#[tauri::command]
pub async fn get_recent_knowledge(limit: usize) -> Result<Vec<KnowledgeEntryResponse>, String> {
    let agi_arc = {
        let guard = AGI_CORE.lock();
        guard
            .as_ref()
            .ok_or_else(|| "AGI not initialized".to_string())?
            .clone()
    };

    let agi = agi_arc.lock().await;

    let entries = agi
        .knowledge_base()
        .query("", limit)
        .await
        .map_err(|e| format!("Failed to get recent knowledge: {}", e))?;

    Ok(entries
        .into_iter()
        .map(|e| KnowledgeEntryResponse {
            id: e.id,
            category: e.category,
            content: e.content,
            metadata: e.metadata,
            timestamp: e.timestamp,
            importance: e.importance,
        })
        .collect())
}

#[tauri::command]
pub async fn get_knowledge_by_category(
    category: String,
    limit: usize,
) -> Result<Vec<KnowledgeEntryResponse>, String> {
    let agi_arc = {
        let guard = AGI_CORE.lock();
        guard
            .as_ref()
            .ok_or_else(|| "AGI not initialized".to_string())?
            .clone()
    };

    let agi = agi_arc.lock().await;
    let entries = agi
        .knowledge_base()
        .query(&category, limit)
        .await
        .map_err(|e| format!("Failed to get knowledge by category: {}", e))?;

    let filtered: Vec<_> = entries
        .into_iter()
        .filter(|e| e.category == category)
        .map(|e| KnowledgeEntryResponse {
            id: e.id,
            category: e.category,
            content: e.content,
            metadata: e.metadata,
            timestamp: e.timestamp,
            importance: e.importance,
        })
        .collect();

    Ok(filtered)
}

/// Helper function to get user tier (simplified - can be enhanced with actual DB lookup)
fn get_user_tier() -> &'static str {
    // TODO: Replace with actual subscription lookup from database
    // For now, defaulting to "pro" - in production, fetch from:
    // - get_current_plan() or
    // - UserSubscription from billing state
    "pro"
}

/// Select best model and provider based on user tier
fn select_best_model_by_tier(tier: &str) -> (&'static str, Provider) {
    match tier.to_lowercase().as_str() {
        "max" | "enterprise" => ("claude-3-5-sonnet-20241022", Provider::Anthropic),
        "pro" => ("gpt-4o", Provider::OpenAI),
        _ => ("gpt-4o-mini", Provider::OpenAI), // Default/Free/Hobby
    }
}

#[tauri::command]
pub async fn start_agent_task(
    app: tauri::AppHandle,
    goal: String,
    _mode: String,
    llm_state: State<'_, LLMState>,
    user_id: Option<String>,
) -> Result<String, String> {
    tracing::info!("[start_agent_task] Starting agent task with goal: {}", goal);

    // 1. Determine User Tier
    let user_tier = get_user_tier();

    // 2. Select Best Model based on Tier
    let (model, provider) = select_best_model_by_tier(user_tier);

    tracing::info!(
        "[start_agent_task] Auto-selecting model {} (provider: {:?}) for tier {}",
        model,
        provider,
        user_tier
    );

    // 3. Prepare the Request
    let router = llm_state.router.clone();
    let request = crate::core::router::LLMRequest {
        messages: vec![crate::core::router::ChatMessage {
            role: "user".to_string(),
            content: goal.clone(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }],
        model: model.to_string(),
        temperature: Some(0.7),
        max_tokens: Some(4096),
        stream: false,
        tools: None,
        tool_choice: None,
        thinking_mode: None,
    };

    // 4. Call API
    let router_guard = router.read().await;
    let preferences = crate::core::router::llm_router::RouterPreferences {
        provider: Some(provider),
        model: Some(model.to_string()),
        ..Default::default()
    };

    let route_outcome = router_guard
        .route_with_retry(
            &request,
            &preferences,
            None, // Use default retry config
        )
        .await
        .map_err(|e| format!("Failed to route request: {}", e))?;

    // 5. Emit streaming tokens to frontend (for real-time updates)
    // Emit the full response content
    let _ = app.emit("chat-token", &route_outcome.response.content);

    // 6. Calculate and log token usage
    let input_tokens = route_outcome.prompt_tokens;
    let output_tokens = route_outcome.completion_tokens;
    let total_cost = route_outcome.cost;

    tracing::info!(
        "[start_agent_task] Tokens Used: {} input + {} output = {} total | Cost: ${:.6}",
        input_tokens,
        output_tokens,
        input_tokens + output_tokens,
        total_cost
    );

    // Save token usage to database
    let user_id_val = user_id.unwrap_or_else(|| "unknown".to_string());
    let token_usage = crate::data::db::models::TokenUsage::new(
        user_id_val,
        input_tokens as i32,
        output_tokens as i32,
        total_cost,
        Some(model.to_string()),
        Some(provider.as_string().to_string()),
    );

    let db_state = app.state::<AppDatabase>();
    if let Ok(conn) = db_state.connection() {
        if let Err(e) = crate::data::db::repository::create_token_usage(&conn, &token_usage) {
            tracing::error!("[start_agent_task] Failed to save token usage: {}", e);
        }
    } else {
        tracing::error!("[start_agent_task] Failed to get database connection");
    }

    Ok(route_outcome.response.content)
}
