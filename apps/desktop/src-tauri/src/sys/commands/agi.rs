use crate::automation::AutomationService;
use crate::core::agi::{
    AGIConfig, AGICore, AgentOrchestrator, AgentResult, AgentStatus, ExecutionContext, Goal,
    Priority, ScoredResult,
};
// use crate::core::agi::reflection::ReflectionEngine;
use crate::core::llm::Provider;
use crate::sys::billing::BillingStateWrapper;
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
    automation: State<'_, Option<Arc<AutomationService>>>,
    llm_state: State<'_, LLMState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    if automation.is_none() {
        return Err(
            "Automation service not available. Please grant accessibility permissions.".to_string(),
        );
    }

    let router_for_agi = llm_state.router.clone();

    let automation_arc = automation.inner().clone().ok_or_else(|| {
        "Automation service not available. Please grant accessibility permissions.".to_string()
    })?;

    let agi = AGICore::new(config, router_for_agi, automation_arc, Some(app.clone()))
        .map_err(|e| format!("Failed to create AGI: {}", e))?;

    // We need to inject reflection engine into AGI, but AGICore::new doesn't take it yet.
    // This implies AGICore needs update too.
    // Let's check AGICore definition first.

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
    automation: State<'_, Option<Arc<AutomationService>>>,
    llm_state: State<'_, LLMState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    if automation.is_none() {
        return Err(
            "Automation service not available. Please grant accessibility permissions.".to_string(),
        );
    }

    let router_for_orchestrator = llm_state.router.clone();

    let automation_arc = automation.inner().clone().ok_or_else(|| {
        "Automation service not available. Please grant accessibility permissions.".to_string()
    })?;

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
    automation: State<'_, Option<Arc<AutomationService>>>,
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
    let mut sys = sysinfo::System::new_all();
    sys.refresh_cpu();
    sys.refresh_memory();
    let cpu_usage_percent = sys.global_cpu_info().cpu_usage() as f64;
    let process_memory_mb = sys
        .process(sysinfo::Pid::from(std::process::id() as usize))
        .map(|p| p.memory() / 1024 / 1024)
        .unwrap_or(0);
    let memory_total_mb = sys.total_memory() / 1024 / 1024;
    let storage_total_mb = 1000000;

    let fallback_response = SystemResourcesResponse {
        cpu_usage_percent,
        memory_usage_mb: process_memory_mb,
        memory_total_mb,
        network_usage_mbps: 0.0,
        storage_usage_mb: 0,
        storage_total_mb,
        available_tools: vec![],
    };

    let agi_arc = {
        let guard = AGI_CORE.lock();
        guard.clone()
    };

    let Some(agi_arc) = agi_arc else {
        return Ok(fallback_response);
    };

    let agi = agi_arc.lock().await;
    let resource_state = match agi.resource_manager().get_state().await {
        Ok(state) => state,
        Err(e) => {
            tracing::warn!("Failed to get AGI resource state, using fallback system metrics: {}", e);
            return Ok(fallback_response);
        }
    };

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

/// Helper function to get user tier from billing state
async fn get_user_tier_from_billing(billing: &BillingStateWrapper) -> String {
    let billing_guard = billing.0.lock().await;

    #[cfg(feature = "billing")]
    {
        if let Ok(service) = billing_guard.stripe_service() {
            if let Ok(Some(sub)) = service.get_primary_subscription() {
                let plan = sub.plan_name.to_lowercase();
                // Map subscription plan names to tier names
                return match plan.as_str() {
                    p if p.contains("max") || p.contains("enterprise") => "max".to_string(),
                    p if p.contains("pro") || p.contains("professional") => "pro".to_string(),
                    p if p.contains("hobby") || p.contains("basic") => "hobby".to_string(),
                    _ => "free".to_string(),
                };
            }
        }
        "free".to_string()
    }

    #[cfg(not(feature = "billing"))]
    {
        drop(billing_guard);
        // Without billing feature, default to "pro" for development
        "pro".to_string()
    }
}

/// Select best model and provider based on user tier
fn select_best_model_by_tier(tier: &str) -> (&'static str, Provider) {
    match tier.to_lowercase().as_str() {
        "max" | "enterprise" => ("claude-sonnet-4-5", Provider::Anthropic),
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
    billing_state: State<'_, BillingStateWrapper>,
    user_id: Option<String>,
) -> Result<String, String> {
    tracing::info!("[start_agent_task] Starting agent task with goal: {}", goal);

    // 1. Determine User Tier from billing state
    let user_tier = get_user_tier_from_billing(&billing_state).await;
    let user_tier_str = user_tier.as_str();

    // 2. Select Best Model based on Tier
    let (model, provider) = select_best_model_by_tier(user_tier_str);

    tracing::info!(
        "[start_agent_task] Auto-selecting model {} (provider: {:?}) for tier {}",
        model,
        provider,
        user_tier_str
    );

    // 3. Prepare the Request
    let router = llm_state.router.clone();
    let request = crate::core::llm::LLMRequest {
        messages: vec![crate::core::llm::ChatMessage {
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
        ..Default::default()
    };

    // 4. Call API
    let router_guard = router.read().await;
    let preferences = crate::core::llm::llm_router::RouterPreferences {
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

// ============================================================================
// Reflection Engine Commands
// ============================================================================

/// Response type for reflection insights
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReflectionInsightResponse {
    pub id: String,
    pub goal_id: String,
    pub assessment: ExecutionAssessmentResponse,
    pub failure_patterns: Vec<FailurePatternResponse>,
    pub corrections: Vec<CorrectionResponse>,
    pub sub_goals: Vec<SubGoalResponse>,
    pub recommendations: Vec<String>,
    pub confidence: f64,
    pub timestamp: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionAssessmentResponse {
    pub success_rate: f64,
    pub successful_steps: Vec<String>,
    pub failed_steps: Vec<FailedStepResponse>,
    pub goal_achievable: bool,
    pub progress_estimate: f64,
    pub resource_efficiency: f64,
    pub time_efficiency: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FailedStepResponse {
    pub step_id: String,
    pub tool_id: String,
    pub description: String,
    pub error: Option<String>,
    pub failure_category: String,
    pub recoverable: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FailurePatternResponse {
    pub pattern_id: String,
    pub category: String,
    pub description: String,
    pub affected_steps: Vec<String>,
    pub root_cause: Option<String>,
    pub frequency: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CorrectionResponse {
    pub for_step_id: String,
    pub correction_type: String,
    pub description: String,
    pub alternative_tool: Option<String>,
    pub modified_parameters: Option<std::collections::HashMap<String, serde_json::Value>>,
    pub priority: u32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubGoalResponse {
    pub id: String,
    pub parent_goal_id: String,
    pub from_step_id: String,
    pub description: String,
    pub success_criteria: Vec<String>,
    pub suggested_tools: Vec<String>,
    pub priority: u32,
}

/// Get reflection insights from execution context
/// Returns the most recent reflection insight for a goal if available
#[tauri::command]
pub async fn agi_get_reflection_insights(
    goal_id: String,
) -> Result<Option<ReflectionInsightResponse>, String> {
    let agi_arc = {
        let agi_guard = AGI_CORE.lock();
        match agi_guard.as_ref() {
            Some(arc) => arc.clone(),
            None => return Ok(None),
        }
    };

    let agi = agi_arc.lock().await;

    // Get goal status to access context memory which contains reflections
    let context = match agi.get_goal_status(&goal_id) {
        Some(ctx) => ctx,
        None => return Ok(None),
    };

    // Find the most recent reflection insight from context memory
    let reflection_entry = context
        .context_memory
        .iter()
        .rev()
        .find(|entry| entry.event.starts_with("reflection_iteration_"));

    match reflection_entry {
        Some(entry) => {
            // Parse the reflection insight from the context entry data
            let insight: crate::core::agi::ReflectionInsight =
                serde_json::from_value(entry.data.clone())
                    .map_err(|e| format!("Failed to parse reflection insight: {}", e))?;

            Ok(Some(convert_reflection_insight(&insight)))
        }
        None => Ok(None),
    }
}

/// Get all failure patterns from recent reflections for a goal
#[tauri::command]
pub async fn agi_get_failure_patterns(
    goal_id: String,
) -> Result<Vec<FailurePatternResponse>, String> {
    let agi_arc = {
        let agi_guard = AGI_CORE.lock();
        match agi_guard.as_ref() {
            Some(arc) => arc.clone(),
            None => return Ok(vec![]),
        }
    };

    let agi = agi_arc.lock().await;

    let context = match agi.get_goal_status(&goal_id) {
        Some(ctx) => ctx,
        None => return Ok(vec![]),
    };

    // Collect all failure patterns from all reflections
    let mut all_patterns: Vec<FailurePatternResponse> = vec![];

    for entry in context.context_memory.iter() {
        if entry.event.starts_with("reflection_iteration_") {
            if let Ok(insight) =
                serde_json::from_value::<crate::core::agi::ReflectionInsight>(entry.data.clone())
            {
                for pattern in insight.failure_patterns {
                    all_patterns.push(convert_failure_pattern(&pattern));
                }
            }
        }
    }

    // Deduplicate by pattern_id and aggregate frequency
    let mut pattern_map: std::collections::HashMap<String, FailurePatternResponse> =
        std::collections::HashMap::new();
    for pattern in all_patterns {
        pattern_map
            .entry(pattern.category.clone())
            .and_modify(|existing| {
                existing.frequency += pattern.frequency;
                for step in &pattern.affected_steps {
                    if !existing.affected_steps.contains(step) {
                        existing.affected_steps.push(step.clone());
                    }
                }
            })
            .or_insert(pattern);
    }

    let mut patterns: Vec<_> = pattern_map.into_values().collect();
    patterns.sort_by(|a, b| b.frequency.cmp(&a.frequency));

    Ok(patterns)
}

/// Get suggested corrections for failed steps
#[tauri::command]
pub async fn agi_get_suggested_corrections(
    goal_id: String,
) -> Result<Vec<CorrectionResponse>, String> {
    let agi_arc = {
        let agi_guard = AGI_CORE.lock();
        match agi_guard.as_ref() {
            Some(arc) => arc.clone(),
            None => return Ok(vec![]),
        }
    };

    let agi = agi_arc.lock().await;

    let context = match agi.get_goal_status(&goal_id) {
        Some(ctx) => ctx,
        None => return Ok(vec![]),
    };

    // Get the most recent reflection's corrections
    let reflection_entry = context
        .context_memory
        .iter()
        .rev()
        .find(|entry| entry.event.starts_with("reflection_iteration_"));

    match reflection_entry {
        Some(entry) => {
            if let Ok(insight) =
                serde_json::from_value::<crate::core::agi::ReflectionInsight>(entry.data.clone())
            {
                let corrections: Vec<CorrectionResponse> =
                    insight.corrections.iter().map(convert_correction).collect();
                Ok(corrections)
            } else {
                Ok(vec![])
            }
        }
        None => Ok(vec![]),
    }
}

/// Get sub-goals derived from failed steps
#[tauri::command]
pub async fn agi_get_sub_goals(goal_id: String) -> Result<Vec<SubGoalResponse>, String> {
    let agi_arc = {
        let agi_guard = AGI_CORE.lock();
        match agi_guard.as_ref() {
            Some(arc) => arc.clone(),
            None => return Ok(vec![]),
        }
    };

    let agi = agi_arc.lock().await;

    let context = match agi.get_goal_status(&goal_id) {
        Some(ctx) => ctx,
        None => return Ok(vec![]),
    };

    // Get the most recent reflection's sub-goals
    let reflection_entry = context
        .context_memory
        .iter()
        .rev()
        .find(|entry| entry.event.starts_with("reflection_iteration_"));

    match reflection_entry {
        Some(entry) => {
            if let Ok(insight) =
                serde_json::from_value::<crate::core::agi::ReflectionInsight>(entry.data.clone())
            {
                let sub_goals: Vec<SubGoalResponse> =
                    insight.sub_goals.iter().map(convert_sub_goal).collect();
                Ok(sub_goals)
            } else {
                Ok(vec![])
            }
        }
        None => Ok(vec![]),
    }
}

/// Get recommendations for improving execution
#[tauri::command]
pub async fn agi_get_recommendations(goal_id: String) -> Result<Vec<String>, String> {
    let agi_arc = {
        let agi_guard = AGI_CORE.lock();
        match agi_guard.as_ref() {
            Some(arc) => arc.clone(),
            None => return Ok(vec![]),
        }
    };

    let agi = agi_arc.lock().await;

    let context = match agi.get_goal_status(&goal_id) {
        Some(ctx) => ctx,
        None => return Ok(vec![]),
    };

    // Get the most recent reflection's recommendations
    let reflection_entry = context
        .context_memory
        .iter()
        .rev()
        .find(|entry| entry.event.starts_with("reflection_iteration_"));

    match reflection_entry {
        Some(entry) => {
            if let Ok(insight) =
                serde_json::from_value::<crate::core::agi::ReflectionInsight>(entry.data.clone())
            {
                Ok(insight.recommendations)
            } else {
                Ok(vec![])
            }
        }
        None => Ok(vec![]),
    }
}

// Helper functions to convert internal types to response types

fn convert_reflection_insight(
    insight: &crate::core::agi::ReflectionInsight,
) -> ReflectionInsightResponse {
    ReflectionInsightResponse {
        id: insight.id.clone(),
        goal_id: insight.goal_id.clone(),
        assessment: convert_assessment(&insight.assessment),
        failure_patterns: insight
            .failure_patterns
            .iter()
            .map(convert_failure_pattern)
            .collect(),
        corrections: insight.corrections.iter().map(convert_correction).collect(),
        sub_goals: insight.sub_goals.iter().map(convert_sub_goal).collect(),
        recommendations: insight.recommendations.clone(),
        confidence: insight.confidence,
        timestamp: insight.timestamp,
    }
}

fn convert_assessment(
    assessment: &crate::core::agi::ExecutionAssessment,
) -> ExecutionAssessmentResponse {
    ExecutionAssessmentResponse {
        success_rate: assessment.success_rate,
        successful_steps: assessment.successful_steps.clone(),
        failed_steps: assessment
            .failed_steps
            .iter()
            .map(convert_failed_step)
            .collect(),
        goal_achievable: assessment.goal_achievable,
        progress_estimate: assessment.progress_estimate,
        resource_efficiency: assessment.resource_efficiency,
        time_efficiency: assessment.time_efficiency,
    }
}

fn convert_failed_step(step: &crate::core::agi::FailedStep) -> FailedStepResponse {
    FailedStepResponse {
        step_id: step.step_id.clone(),
        tool_id: step.tool_id.clone(),
        description: step.description.clone(),
        error: step.error.clone(),
        failure_category: format!("{:?}", step.failure_category),
        recoverable: step.recoverable,
    }
}

fn convert_failure_pattern(pattern: &crate::core::agi::FailurePattern) -> FailurePatternResponse {
    FailurePatternResponse {
        pattern_id: pattern.pattern_id.clone(),
        category: format!("{:?}", pattern.category),
        description: pattern.description.clone(),
        affected_steps: pattern.affected_steps.clone(),
        root_cause: pattern.root_cause.clone(),
        frequency: pattern.frequency,
    }
}

fn convert_correction(correction: &crate::core::agi::Correction) -> CorrectionResponse {
    CorrectionResponse {
        for_step_id: correction.for_step_id.clone(),
        correction_type: format!("{:?}", correction.correction_type),
        description: correction.description.clone(),
        alternative_tool: correction.alternative_tool.clone(),
        modified_parameters: correction.modified_parameters.clone(),
        priority: correction.priority,
    }
}

fn convert_sub_goal(sub_goal: &crate::core::agi::SubGoal) -> SubGoalResponse {
    SubGoalResponse {
        id: sub_goal.id.clone(),
        parent_goal_id: sub_goal.parent_goal_id.clone(),
        from_step_id: sub_goal.from_step_id.clone(),
        description: sub_goal.description.clone(),
        success_criteria: sub_goal.success_criteria.clone(),
        suggested_tools: sub_goal.suggested_tools.clone(),
        priority: sub_goal.priority,
    }
}

// === Swarm Coordination Commands ===
// These commands provide access to the swarm orchestration system for
// massively parallel multi-agent execution. The swarm is transparent to
// users - it's an internal optimization for complex parallelizable goals.

/// Response from swarm goal execution.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwarmGoalResponse {
    pub success: bool,
    pub goal_id: String,
    pub succeeded: usize,
    pub failed: usize,
    pub wall_time_ms: u64,
    pub speedup_ratio: f64,
    pub critical_path_length: usize,
    pub max_parallelism: usize,
    pub summary: String,
}

/// Submits a goal for swarm execution with parallel multi-agent processing.
///
/// The swarm system decomposes the goal into parallelizable subtasks and
/// spawns multiple agents to execute them concurrently. This is ideal for
/// complex goals that can be broken into independent work units.
#[tauri::command]
pub async fn agi_submit_goal_swarm(
    request: SubmitGoalRequest,
) -> Result<SwarmGoalResponse, String> {
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
    let result = agi
        .submit_goal_swarm(goal)
        .await
        .map_err(|e| format!("Swarm execution failed: {}", e))?;

    Ok(SwarmGoalResponse {
        success: result.success,
        goal_id,
        succeeded: result.succeeded,
        failed: result.failed,
        wall_time_ms: result.wall_time.as_millis() as u64,
        speedup_ratio: result.speedup_ratio,
        critical_path_length: result.critical_path_length,
        max_parallelism: result.max_parallelism,
        summary: result.summary,
    })
}

/// Submits a goal with automatic execution strategy selection.
///
/// The AGI automatically determines whether to use:
/// - Sequential execution (simple goals)
/// - Parallel plans (moderately complex goals)
/// - Swarm execution (highly parallelizable goals)
///
/// This is the recommended entry point for goal submission.
#[tauri::command]
pub async fn agi_submit_goal_auto(
    request: SubmitGoalRequest,
) -> Result<SubmitGoalResponse, String> {
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
    agi.submit_goal_auto(goal)
        .await
        .map_err(|e| format!("Failed to submit goal: {}", e))?;

    Ok(SubmitGoalResponse { goal_id })
}

/// Checks if a goal would benefit from swarm execution.
///
/// Returns true if the goal description indicates parallelizable work.
/// This is useful for UI components to show appropriate feedback.
#[tauri::command]
pub async fn agi_should_use_swarm(description: String) -> Result<bool, String> {
    let agi_arc = {
        let agi_guard = AGI_CORE.lock();
        agi_guard
            .as_ref()
            .ok_or_else(|| "AGI not initialized".to_string())?
            .clone()
    };

    let goal = Goal {
        id: "check".to_string(),
        description,
        priority: Priority::Medium,
        deadline: None,
        constraints: vec![],
        success_criteria: vec![],
    };

    let agi = agi_arc.lock().await;
    Ok(agi.should_use_swarm(&goal))
}
