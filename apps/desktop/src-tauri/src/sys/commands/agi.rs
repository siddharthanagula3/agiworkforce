use crate::core::agi::{
    AGIConfig, AGICore, AgentOrchestrator, AgentResult, AgentStatus, Constraint, ConstraintValue,
    ExecutionContext, Goal, Priority,
};
use crate::core::llm::{LLMRouter, Provider, TaskType};
use crate::sys::billing::BillingStateWrapper;
use crate::sys::commands::llm::LLMState;
use crate::sys::commands::AppDatabase;
use agiworkforce_protocol::task_state::AgentTaskState;
use anyhow::Result;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tauri::{Emitter, Manager, State};
use tokio::sync::Mutex as TokioMutex;
use tokio::time::{sleep, Duration};

/// Wire representation of the active session's trust boundary. Deliberately
/// narrower than `agiworkforce_model_registry::TrustMode`'s own serde repr
/// (which also exposes `on_device`), callers of these commands only ever
/// mean "this device's local models", "my own API key", or "AGI Workforce's
/// managed cloud", so the wire contract is exactly `local` | `byok` |
/// `managed` (desktop-trust-boundary-01).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
enum TrustModeWire {
    Local,
    Byok,
    Managed,
}

impl From<TrustModeWire> for agiworkforce_model_registry::TrustMode {
    fn from(wire: TrustModeWire) -> Self {
        match wire {
            TrustModeWire::Local => Self::Local,
            TrustModeWire::Byok => Self::Byok,
            TrustModeWire::Managed => Self::ManagedCloud,
        }
    }
}

/// Deserializes the `trustMode` wire field (`"local" | "byok" | "managed"`,
/// or absent) into `Option<TrustMode>`. Absent stays `None`, which
/// `llm_router::effective_trust_mode` resolves to `TrustMode::Local`
/// (fail-closed), this function does not itself apply that default so the
/// two layers don't silently drift. `pub(crate)` so sibling IPC entry points
/// that also accept a session boundary (e.g. `swarm.rs`) share one wire
/// contract instead of drifting copies.
pub(crate) fn deserialize_trust_mode<'de, D>(
    deserializer: D,
) -> std::result::Result<Option<agiworkforce_model_registry::TrustMode>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let wire = Option::<TrustModeWire>::deserialize(deserializer)?;
    Ok(wire.map(agiworkforce_model_registry::TrustMode::from))
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitGoalRequest {
    pub description: String,
    pub priority: Option<String>,
    pub deadline: Option<u64>,
    pub success_criteria: Option<Vec<String>>,
    /// Caller-chosen iteration ceiling for the sequential loop, surfaced as the
    /// `max_steps` constraint `goal_iteration_limit()` reads. Absent leaves the
    /// engine default in place.
    pub max_steps: Option<u64>,
    /// Exact model/provider selected in the visible Task launcher. Both are
    /// required at the privileged boundary, which also verifies that the
    /// canonical catalog marks the model as agentic and tool-capable.
    pub model_id: Option<String>,
    pub provider: Option<String>,
    /// TRUST BOUNDARY (desktop-trust-boundary-01): the active session's
    /// execution boundary, threaded into the submitted `Goal` and from there
    /// into every LLM call made while planning/executing it. Absent (or
    /// `None`) fails closed to Local.
    #[serde(default, deserialize_with = "deserialize_trust_mode")]
    pub trust_mode: Option<agiworkforce_model_registry::TrustMode>,
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
    pub state: AgentTaskState,
    pub current_iteration: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitParallelGoalRequest {
    pub description: String,
    pub priority: Option<String>,
    pub deadline: Option<u64>,
    pub success_criteria: Option<Vec<String>>,
    pub num_agents: Option<usize>,
    pub model_id: Option<String>,
    pub provider: Option<String>,
    /// TRUST BOUNDARY (desktop-trust-boundary-01): see `SubmitGoalRequest`.
    #[serde(default, deserialize_with = "deserialize_trust_mode")]
    pub trust_mode: Option<agiworkforce_model_registry::TrustMode>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitParallelGoalResponse {
    pub goal_id: String,
    /// Canonical engine-authored state after the synchronous parallel run.
    /// Returning it closes the event-loss gap: the renderer must not recreate
    /// a completed native task as `queued` after this command resolves.
    pub state: AgentTaskState,
    /// Bounded, reviewable output from the winning execution. Comparator
    /// scores are deliberately not exposed as goal-satisfaction claims.
    pub output: Option<String>,
    pub error: Option<String>,
}

const MAX_RESULT_OUTPUT_CHARS: usize = 16_000;

pub(crate) fn bounded_result_output(value: &serde_json::Value) -> Option<String> {
    let rendered = match value {
        serde_json::Value::Null => return None,
        serde_json::Value::String(value) => value.trim().to_string(),
        serde_json::Value::Object(value) if value.is_empty() => return None,
        serde_json::Value::Array(value) if value.is_empty() => return None,
        value => serde_json::to_string_pretty(value).ok()?,
    };
    if rendered.is_empty() {
        return None;
    }

    let mut chars = rendered.chars();
    let bounded: String = chars.by_ref().take(MAX_RESULT_OUTPUT_CHARS).collect();
    if chars.next().is_some() {
        Some(format!("{bounded}\n\n… [output truncated]"))
    } else {
        Some(bounded)
    }
}

/// Every parallel agent costs one planning round-trip plus its own sandbox, and
/// `Planner::create_parallel_plans` only has eight distinct strategy hints.
/// past that the extra agents replan the same "balanced approach" at full cost.
const MAX_PARALLEL_AGENTS: usize = 8;
const DEFAULT_PARALLEL_AGENTS: usize = 4;
const GOAL_PROMPT_SOURCE: &str = "goal";

/// Zero agents would hand the comparator an empty result set, so the floor is 1.
fn clamp_num_agents(requested: Option<usize>) -> usize {
    requested
        .unwrap_or(DEFAULT_PARALLEL_AGENTS)
        .clamp(1, MAX_PARALLEL_AGENTS)
}

fn max_steps_constraints(max_steps: Option<u64>) -> Vec<Constraint> {
    max_steps
        .map(|max_steps| {
            vec![Constraint {
                name: "max_steps".to_string(),
                value: ConstraintValue::Custom {
                    key: "max_steps".to_string(),
                    value: max_steps.to_string(),
                },
            }]
        })
        .unwrap_or_default()
}

pub(crate) const MAX_DURATION_CONSTRAINT: &str = "max_duration_secs";

pub(crate) async fn configured_task_time_limit(app: &tauri::AppHandle) -> Option<Duration> {
    let settings = app.try_state::<crate::sys::commands::settings::SettingsState>()?;
    let minutes = settings
        .settings
        .lock()
        .await
        .execution_preferences
        .as_ref()
        .map(|preferences| preferences.max_timeout_minutes)?;
    (minutes > 0).then(|| Duration::from_secs(u64::from(minutes) * 60))
}

pub(crate) fn time_limit_constraint(limit: Duration) -> Constraint {
    Constraint {
        name: MAX_DURATION_CONSTRAINT.to_string(),
        value: ConstraintValue::Custom {
            key: MAX_DURATION_CONSTRAINT.to_string(),
            value: limit.as_secs().to_string(),
        },
    }
}

async fn configured_time_limit_constraint(app: &tauri::AppHandle) -> Option<Constraint> {
    configured_task_time_limit(app)
        .await
        .map(time_limit_constraint)
}

fn provider_allowed_for_trust_mode(
    provider: Provider,
    trust_mode: agiworkforce_model_registry::TrustMode,
) -> bool {
    let local = matches!(
        provider,
        Provider::Ollama | Provider::LmStudio | Provider::LlamaCpp | Provider::Vllm
    );
    match trust_mode {
        agiworkforce_model_registry::TrustMode::Local
        | agiworkforce_model_registry::TrustMode::OnDevice => local,
        agiworkforce_model_registry::TrustMode::Byok => {
            !local && provider != Provider::ManagedCloud
        }
        agiworkforce_model_registry::TrustMode::ManagedCloud => provider == Provider::ManagedCloud,
    }
}

fn goal_constraints(
    max_steps: Option<u64>,
    model_id: Option<String>,
    provider: Option<String>,
    trust_mode: Option<agiworkforce_model_registry::TrustMode>,
) -> Result<Vec<Constraint>, String> {
    let mut constraints = max_steps_constraints(max_steps);
    let (model_id, provider_name) = match (model_id, provider) {
        (None, None) => {
            return Err(
                "Choose a model verified for agentic planning and tool execution before launching a Task."
                    .to_string(),
            )
        }
        (Some(model_id), Some(provider)) => {
            (model_id.trim().to_string(), provider.trim().to_string())
        }
        _ => return Err("A Task model target requires both modelId and provider.".to_string()),
    };

    if model_id.is_empty()
        || model_id.chars().count() > 256
        || model_id.chars().any(char::is_control)
    {
        return Err("The selected Task model ID is invalid.".to_string());
    }
    let provider = Provider::from_string(&provider_name)
        .ok_or_else(|| format!("Unsupported Task provider: {provider_name}"))?;
    let boundary = trust_mode.unwrap_or(agiworkforce_model_registry::TrustMode::Local);
    if !provider_allowed_for_trust_mode(provider, boundary) {
        return Err(format!(
            "The selected {} model is not available inside the {:?} boundary.",
            provider.as_string(),
            boundary
        ));
    }
    if !crate::core::llm::models_config::model_is_verified_for_agi_tasks(&model_id) {
        return Err(format!(
            "The selected model ({model_id}) is available for chat but is not verified for Tasks. Tasks require catalog-verified agentic planning and tool execution."
        ));
    }
    if provider != Provider::ManagedCloud
        && crate::core::llm::models_config::get_provider_for_model(&model_id) != Some(provider)
    {
        return Err(format!(
            "The selected Task model does not belong to the submitted {} provider.",
            provider.as_string()
        ));
    }

    constraints.push(Constraint {
        name: "execution_model".to_string(),
        value: ConstraintValue::Custom {
            key: "execution_model".to_string(),
            value: model_id,
        },
    });
    constraints.push(Constraint {
        name: "execution_provider".to_string(),
        value: ConstraintValue::Custom {
            key: "execution_provider".to_string(),
            value: provider.as_string().to_string(),
        },
    });
    Ok(constraints)
}

static AGI_CORE: Mutex<Option<Arc<TokioMutex<AGICore>>>> = Mutex::new(None);

async fn ensure_goal_provider(goal: &Goal, llm_state: &LLMState) -> Result<(), String> {
    let Some((_, provider_name)) = goal.execution_target() else {
        return Ok(());
    };
    let provider = Provider::from_string(provider_name)
        .ok_or_else(|| format!("Unsupported Task provider: {provider_name}"))?;
    crate::sys::commands::chat::provider_access::ensure_task_provider(&llm_state.router, provider)
        .await;
    if !llm_state.router.read().await.has_provider(provider) {
        return Err(format!(
            "The selected {} provider is not configured for Tasks.",
            provider.as_string()
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn agi_init(
    config: AGIConfig,
    llm_state: State<'_, LLMState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Renderer reloads do not restart the native process. Replacing an
    // existing core here would orphan every in-flight task merely because the
    // WebView reloaded, so native initialization must be idempotent too (the
    // TypeScript module-level guard cannot provide that process-wide promise).
    if AGI_CORE.lock().is_some() {
        return Ok(());
    }

    let router_for_agi = llm_state.router.clone();

    let agi = AGICore::new(config, router_for_agi, Some(app.clone()))
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
    if crate::core::swarm::stop_swarm_run(&goal_id) {
        return Ok(());
    }

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
pub async fn agi_pause_goal(goal_id: String) -> Result<(), String> {
    let agi = AGI_CORE
        .lock()
        .clone()
        .ok_or_else(|| "AGI not initialized".to_string())?;
    let result = agi
        .lock()
        .await
        .pause_goal(&goal_id)
        .map_err(|error| error.to_string());
    result
}

#[tauri::command]
pub async fn agi_resume_goal(goal_id: String) -> Result<(), String> {
    let agi = AGI_CORE
        .lock()
        .clone()
        .ok_or_else(|| "AGI not initialized".to_string())?;
    let result = agi
        .lock()
        .await
        .resume_goal(&goal_id)
        .map_err(|error| error.to_string());
    result
}

#[tauri::command]
pub async fn agi_submit_goal(
    request: SubmitGoalRequest,
    app: tauri::AppHandle,
    llm_state: State<'_, LLMState>,
) -> Result<SubmitGoalResponse, String> {
    crate::ui::hooks::gate_user_prompt(GOAL_PROMPT_SOURCE, &request.description).await?;

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

    let mut constraints = goal_constraints(
        request.max_steps,
        request.model_id,
        request.provider,
        request.trust_mode,
    )?;
    constraints.extend(configured_time_limit_constraint(&app).await);
    let goal = Goal {
        id: format!("goal_{}", &uuid::Uuid::new_v4().to_string()[..8]),
        description: request.description,
        priority,
        deadline: request.deadline,
        constraints,
        success_criteria: request.success_criteria.unwrap_or_default(),
        trust_mode: request.trust_mode,
    };

    let goal_id = goal.id.clone();
    ensure_goal_provider(&goal, &llm_state).await?;

    let agi = agi_arc.lock().await;
    agi.submit_goal(goal)
        .await
        .map_err(|e| format!("Failed to submit goal: {}", e))?;

    Ok(SubmitGoalResponse { goal_id })
}

#[tauri::command]
pub async fn agi_submit_goal_parallel(
    request: SubmitParallelGoalRequest,
    app: tauri::AppHandle,
    llm_state: State<'_, LLMState>,
) -> Result<SubmitParallelGoalResponse, String> {
    crate::ui::hooks::gate_user_prompt(GOAL_PROMPT_SOURCE, &request.description).await?;

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

    let mut constraints =
        goal_constraints(None, request.model_id, request.provider, request.trust_mode)?;
    constraints.extend(configured_time_limit_constraint(&app).await);
    let goal = Goal {
        id: format!("goal_{}", &uuid::Uuid::new_v4().to_string()[..8]),
        description: request.description,
        priority,
        deadline: request.deadline,
        constraints,
        success_criteria: request.success_criteria.unwrap_or_default(),
        trust_mode: request.trust_mode,
    };

    let goal_id = goal.id.clone();
    ensure_goal_provider(&goal, &llm_state).await?;
    let num_agents = clamp_num_agents(request.num_agents);

    let agi = agi_arc.lock().await;
    let best_result = match agi.submit_goal_parallel(goal, num_agents).await {
        Ok(result) => result,
        Err(error) => {
            let message = format!("Failed to execute parallel goal: {}", error);
            if let Err(emit_error) = app.emit(
                "agi:goal:error",
                serde_json::json!({
                    "goal_id": goal_id,
                    "error": message,
                }),
            ) {
                tracing::warn!("Failed to emit parallel goal error: {}", emit_error);
            }
            return Err(message);
        }
    };

    let state = agi
        .get_task_state(&goal_id)
        .ok_or_else(|| format!("Parallel goal {goal_id} completed without a canonical state"))?;
    let output = bounded_result_output(&best_result.result.output);
    let error = best_result.result.error;

    Ok(SubmitParallelGoalResponse {
        goal_id,
        state,
        output,
        error,
    })
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
    let state = agi
        .get_task_state(&goal_id)
        .ok_or_else(|| format!("Goal {} has no task state", goal_id))?;
    let current_iteration = context
        .current_state
        .get("current_iteration")
        .and_then(serde_json::Value::as_u64)
        .and_then(|iteration| usize::try_from(iteration).ok())
        .unwrap_or_default();

    Ok(GoalStatusResponse {
        context,
        state,
        current_iteration,
    })
}

/// Returns the native engine-authored lifecycle even for execution modes
/// (notably swarm) that do not retain an `ExecutionContext`. `None` is an
/// honest recovery signal: this process has no native ownership of the task.
#[tauri::command]
pub async fn agi_get_task_state(goal_id: String) -> Result<Option<AgentTaskState>, String> {
    let Some(agi_arc) = AGI_CORE.lock().clone() else {
        return Ok(None);
    };

    let state = agi_arc.lock().await.get_task_state(&goal_id);
    Ok(state)
}

#[tauri::command]
pub async fn agi_list_goals() -> Result<Vec<Goal>, String> {
    let agi_arc = {
        let agi_guard = AGI_CORE.lock();
        let Some(agi_arc) = agi_guard.as_ref() else {
            // A fresh native process owns no live goals. Returning an empty
            // authoritative list lets the renderer terminate stale persisted
            // rows instead of leaving them queued/running forever.
            return Ok(Vec::new());
        };
        agi_arc.clone()
    };

    let agi = agi_arc.lock().await;
    let goals = agi.list_goals();

    Ok(goals)
}

pub static ORCHESTRATOR: Mutex<Option<Arc<TokioMutex<AgentOrchestrator>>>> = Mutex::new(None);

const ORCHESTRATOR_MAX_AGENTS: usize = 4;

pub fn ensure_orchestrator(
    app: &tauri::AppHandle,
    router: Arc<tokio::sync::RwLock<LLMRouter>>,
) -> Result<Arc<TokioMutex<AgentOrchestrator>>, String> {
    if let Some(existing) = ORCHESTRATOR.lock().clone() {
        return Ok(existing);
    }

    let orchestrator = AgentOrchestrator::new(
        ORCHESTRATOR_MAX_AGENTS,
        AGIConfig::default(),
        router,
        Some(app.clone()),
    )
    .map_err(|e| format!("Failed to create orchestrator: {}", e))?;

    Ok(ORCHESTRATOR
        .lock()
        .get_or_insert_with(|| Arc::new(TokioMutex::new(orchestrator)))
        .clone())
}

fn is_live_agent(status: &AgentStatus) -> bool {
    matches!(
        status.status,
        crate::core::agi::AgentState::Running | crate::core::agi::AgentState::Paused
    )
}

static AWAITED_AGENT_RUNS: AtomicUsize = AtomicUsize::new(0);

struct AwaitedAgentRun;

impl AwaitedAgentRun {
    fn enter() -> Self {
        AWAITED_AGENT_RUNS.fetch_add(1, Ordering::SeqCst);
        Self
    }
}

impl Drop for AwaitedAgentRun {
    fn drop(&mut self) {
        AWAITED_AGENT_RUNS.fetch_sub(1, Ordering::SeqCst);
    }
}

/// Agent runs started for a caller that waits on the result here. A chat
/// turn or a scheduled run that owns an agent is counted by its owner.
pub fn awaited_agent_run_count() -> usize {
    AWAITED_AGENT_RUNS.load(Ordering::SeqCst)
}

pub async fn cancel_live_orchestrator_agents() -> usize {
    let Some(orchestrator_arc) = ORCHESTRATOR.lock().clone() else {
        return 0;
    };
    let orchestrator = orchestrator_arc.lock().await.clone();
    let mut cancelled = 0;
    for status in orchestrator.list_active_agents().await {
        if !is_live_agent(&status) {
            continue;
        }
        match orchestrator.cancel_agent(&status.id).await {
            Ok(()) => cancelled += 1,
            Err(error) => {
                tracing::warn!(
                    "[Orchestrator] Failed to cancel agent {}: {error}",
                    status.id
                )
            }
        }
    }
    cancelled
}

fn is_live_goal(state: Option<AgentTaskState>) -> bool {
    state.is_some_and(|state| !state.is_terminal() && !state.needs_review())
}

pub async fn live_goal_count() -> usize {
    let Some(agi_arc) = AGI_CORE.lock().clone() else {
        return 0;
    };
    let agi = agi_arc.lock().await;
    agi.list_goals()
        .iter()
        .filter(|goal| is_live_goal(agi.get_task_state(&goal.id)))
        .count()
}

pub async fn cancel_live_goals() -> usize {
    let Some(agi_arc) = AGI_CORE.lock().clone() else {
        return 0;
    };
    let agi = agi_arc.lock().await;
    let mut cancelled = 0;
    for goal in agi.list_goals() {
        if !is_live_goal(agi.get_task_state(&goal.id)) {
            continue;
        }
        match agi.cancel_goal(&goal.id).await {
            Ok(()) => cancelled += 1,
            Err(error) => tracing::warn!("[AGI] Failed to cancel goal {}: {error}", goal.id),
        }
    }
    agi.stop();
    cancelled
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnAgentRequest {
    pub description: String,
    pub priority: Option<String>,
    pub deadline: Option<u64>,
    pub success_criteria: Option<Vec<String>>,
    pub max_steps: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnAgentResponse {
    pub agent_id: String,
}

/// The boundary a run started with no session of its own stays inside: the
/// one the app is in now. BYOK is never chosen here, because it is entered
/// only by a conversation the user forked with consent.
fn app_trust_mode(cloud_app_mode: bool) -> agiworkforce_model_registry::TrustMode {
    if cloud_app_mode {
        agiworkforce_model_registry::TrustMode::ManagedCloud
    } else {
        agiworkforce_model_registry::TrustMode::Local
    }
}

pub async fn orchestrator_spawn_agent(
    request: SpawnAgentRequest,
) -> Result<SpawnAgentResponse, String> {
    crate::ui::hooks::gate_user_prompt(GOAL_PROMPT_SOURCE, &request.description).await?;

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

    let mut constraints = max_steps_constraints(request.max_steps);
    constraints.push(crate::core::agi::executor::unattended_constraint());
    let goal = Goal {
        id: format!("goal_{}", &uuid::Uuid::new_v4().to_string()[..8]),
        description: request.description,
        priority,
        deadline: request.deadline,
        constraints,
        success_criteria: request.success_criteria.unwrap_or_default(),
        trust_mode: Some(app_trust_mode(
            crate::sys::account::app_mode::is_cloud_app_mode(),
        )),
    };

    let orchestrator = orchestrator_arc.lock().await;
    let agent_id = orchestrator
        .spawn_agent(goal)
        .await
        .map_err(|e| format!("Failed to spawn agent: {}", e))?;

    Ok(SpawnAgentResponse { agent_id })
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

    let orchestrator = orchestrator_arc.lock().await.clone();
    orchestrator
        .cancel_all_agents()
        .await
        .map_err(|e| format!("Failed to cancel all agents: {}", e))
}

pub async fn wait_for_agent_result(
    agent_id: &str,
    timeout: Duration,
) -> Result<AgentResult, String> {
    let orchestrator_arc = ORCHESTRATOR
        .lock()
        .clone()
        .ok_or_else(|| "Orchestrator not initialized".to_string())?;
    let orchestrator = orchestrator_arc.lock().await.clone();
    let _run = AwaitedAgentRun::enter();

    let started = std::time::Instant::now();

    loop {
        let status = orchestrator
            .get_agent_status(agent_id)
            .await
            .ok_or_else(|| format!("Agent '{}' not found", agent_id))?;

        if matches!(
            status.status,
            crate::core::agi::AgentState::Completed | crate::core::agi::AgentState::Failed
        ) {
            let result = orchestrator
                .get_agent_result(agent_id)
                .await
                .ok_or_else(|| format!("Agent '{}' completed without a result", agent_id))?;
            orchestrator.remove_finished_agent(agent_id).await;
            return Ok(result);
        }

        if started.elapsed() > timeout {
            if let Err(error) = orchestrator.cancel_agent(agent_id).await {
                tracing::warn!("[Orchestrator] Failed to cancel agent {agent_id}: {error}");
            }
            orchestrator.remove_finished_agent(agent_id).await;
            return Err(format!(
                "Agent '{}' did not finish within {} seconds and was stopped.",
                agent_id,
                timeout.as_secs()
            ));
        }

        sleep(Duration::from_millis(100)).await;
    }
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
            tracing::warn!(
                "Failed to get AGI resource state, using fallback system metrics: {}",
                e
            );
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

async fn get_user_tier_from_billing(_billing: &BillingStateWrapper) -> String {
    "free".to_string()
}

/// Select best model and provider based on user tier
fn select_best_model_by_tier(tier: &str) -> (&'static str, Provider) {
    match tier.to_lowercase().as_str() {
        "max" | "enterprise" => (
            Provider::Anthropic.get_model_for_task(TaskType::ComplexReasoning),
            Provider::Anthropic,
        ),
        "pro" => (Provider::OpenAI.default_model(), Provider::OpenAI),
        _ => (
            Provider::OpenAI.get_model_for_task(TaskType::FastCompletion),
            Provider::OpenAI,
        ),
    }
}

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
    // TRUST BOUNDARY (desktop-trust-boundary-01): `start_agent_task` takes a
    // `_mode: String` param that is unused, and its only frontend caller
    // (apps/desktop/src/api/agent.ts `startAgentTask`) has no callers of its
    // own, this command is currently unreachable from the UI. Fails closed
    // to Local via `effective_trust_mode`'s default; `provider` is tier-
    // selected (may be Anthropic/OpenAI/ManagedCloud), so this would need a
    // real trust_mode threaded from `_mode` (with `_mode`'s semantics
    // defined) before it could go live safely.
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

/// Starts a swarm run for the goal and returns its id straight away.
///
/// The run reports through `agi:task:state_changed`, the `swarm:subtask_*`
/// events and `agi:goal:swarm_completed`, and `agi_cancel_goal` stops it. It
/// works on a clone of the engine, so the engine lock is free for the status,
/// list and cancel commands while the swarm is busy.
#[tauri::command]
pub async fn agi_submit_goal_swarm(
    request: SubmitGoalRequest,
    app: tauri::AppHandle,
    llm_state: State<'_, LLMState>,
) -> Result<SubmitGoalResponse, String> {
    crate::ui::hooks::gate_user_prompt(GOAL_PROMPT_SOURCE, &request.description).await?;

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

    let mut constraints = goal_constraints(
        request.max_steps,
        request.model_id,
        request.provider,
        request.trust_mode,
    )?;
    constraints.extend(configured_time_limit_constraint(&app).await);
    let goal = Goal {
        id: format!("goal_{}", &uuid::Uuid::new_v4().to_string()[..8]),
        description: request.description,
        priority,
        deadline: request.deadline,
        constraints,
        success_criteria: request.success_criteria.unwrap_or_default(),
        trust_mode: request.trust_mode,
    };

    let goal_id = goal.id.clone();
    ensure_goal_provider(&goal, &llm_state).await?;

    let swarm_engine = {
        let agi = agi_arc.lock().await;
        let mut engine = agi.clone_for_execution();
        engine.app_handle = Some(app);
        engine
    };
    tokio::spawn(async move {
        if let Err(error) = swarm_engine.submit_goal_swarm(goal).await {
            tracing::warn!("[AGI] Swarm goal ended without a result: {error}");
        }
    });

    Ok(SubmitGoalResponse { goal_id })
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
    app: tauri::AppHandle,
    llm_state: State<'_, LLMState>,
) -> Result<SubmitGoalResponse, String> {
    crate::ui::hooks::gate_user_prompt(GOAL_PROMPT_SOURCE, &request.description).await?;

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

    let mut constraints = goal_constraints(
        request.max_steps,
        request.model_id,
        request.provider,
        request.trust_mode,
    )?;
    constraints.extend(configured_time_limit_constraint(&app).await);
    let goal = Goal {
        id: format!("goal_{}", &uuid::Uuid::new_v4().to_string()[..8]),
        description: request.description,
        priority,
        deadline: request.deadline,
        // `SubmitGoalRequest::max_steps` is part of this command's wire contract
        // too: auto's non-swarm branch runs the same execute/reflect loop as
        // `agi_submit_goal`, so accepting the field here and dropping it would
        // silently ignore a caller-chosen bound.
        constraints,
        success_criteria: request.success_criteria.unwrap_or_default(),
        trust_mode: request.trust_mode,
    };

    let goal_id = goal.id.clone();
    ensure_goal_provider(&goal, &llm_state).await?;

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
        trust_mode: None,
    };

    let agi = agi_arc.lock().await;
    Ok(agi.should_use_swarm(&goal))
}

#[cfg(test)]
mod tests {
    use super::*;
    use agiworkforce_model_registry::TrustMode;

    fn parse(json: &str) -> Result<SubmitGoalRequest, serde_json::Error> {
        serde_json::from_str(json)
    }

    #[test]
    fn a_run_with_no_session_takes_the_app_mode_and_never_byok() {
        assert_eq!(
            app_trust_mode(false),
            agiworkforce_model_registry::TrustMode::Local
        );
        assert_eq!(
            app_trust_mode(true),
            agiworkforce_model_registry::TrustMode::ManagedCloud
        );
    }

    #[test]
    fn trust_mode_wire_maps_all_three_boundaries() {
        for (wire, expected) in [
            ("local", TrustMode::Local),
            ("byok", TrustMode::Byok),
            ("managed", TrustMode::ManagedCloud),
        ] {
            let request = parse(&format!(r#"{{"description":"d","trustMode":"{wire}"}}"#))
                .expect("valid wire value must deserialize");
            assert_eq!(request.trust_mode, Some(expected), "wire value {wire:?}");
        }
    }

    #[test]
    fn trust_mode_absent_or_null_stays_none_for_fail_closed_default() {
        let absent = parse(r#"{"description":"d"}"#).expect("absent trustMode is valid");
        assert_eq!(absent.trust_mode, None);

        let null =
            parse(r#"{"description":"d","trustMode":null}"#).expect("null trustMode is valid");
        assert_eq!(null.trust_mode, None);
    }

    #[test]
    fn trust_mode_rejects_unknown_and_registry_repr_values() {
        // The wire contract is exactly `local` | `byok` | `managed`. The
        // registry's own serde names (`managed_cloud`, `on_device`) and
        // arbitrary strings must be rejected, not silently defaulted.
        for invalid in ["managed_cloud", "on_device", "cloud", "Local", ""] {
            let result = parse(&format!(r#"{{"description":"d","trustMode":"{invalid}"}}"#));
            assert!(result.is_err(), "wire value {invalid:?} must be rejected");
        }
    }

    #[test]
    fn num_agents_clamp_holds_the_parallel_fan_out_inside_the_planner_budget() {
        assert_eq!(clamp_num_agents(Some(20)), MAX_PARALLEL_AGENTS);
        assert_eq!(clamp_num_agents(Some(usize::MAX)), MAX_PARALLEL_AGENTS);
        assert_eq!(clamp_num_agents(Some(0)), 1);
        assert_eq!(clamp_num_agents(Some(3)), 3);
        assert_eq!(clamp_num_agents(None), DEFAULT_PARALLEL_AGENTS);
    }

    #[test]
    fn num_agents_clamp_reads_the_wire_field_the_launcher_sends() {
        // `agentTaskStore.submitGoal` posts `numAgents` on this struct; the
        // clamp is only worth anything if it sees that field. Absent stays
        // absent so the command applies its own default rather than 8.
        let oversized: SubmitParallelGoalRequest =
            serde_json::from_str(r#"{"description":"d","numAgents":20}"#)
                .expect("numAgents is part of the wire");
        assert_eq!(clamp_num_agents(oversized.num_agents), MAX_PARALLEL_AGENTS);

        let absent: SubmitParallelGoalRequest = serde_json::from_str(r#"{"description":"d"}"#)
            .expect("numAgents is optional on the wire");
        assert_eq!(absent.num_agents, None);
        assert_eq!(clamp_num_agents(absent.num_agents), DEFAULT_PARALLEL_AGENTS);
    }

    #[test]
    fn sequential_max_steps_reaches_the_goal_as_a_constraint() {
        let request =
            parse(r#"{"description":"d","maxSteps":12}"#).expect("maxSteps is part of the wire");
        assert_eq!(request.max_steps, Some(12));

        let constraints = max_steps_constraints(request.max_steps);
        match constraints.as_slice() {
            [Constraint {
                name,
                value: ConstraintValue::Custom { key, value },
            }] => {
                assert_eq!(name, "max_steps");
                assert_eq!(key, "max_steps");
                assert_eq!(value, "12");
            }
            other => panic!("expected one max_steps constraint, got {other:?}"),
        }

        assert!(max_steps_constraints(None).is_empty());
    }

    #[test]
    fn result_output_is_reviewable_and_bounded() {
        assert_eq!(bounded_result_output(&serde_json::json!({})), None);
        assert_eq!(
            bounded_result_output(&serde_json::json!({"answer": 42})),
            Some("{\n  \"answer\": 42\n}".to_string())
        );

        let oversized = "x".repeat(MAX_RESULT_OUTPUT_CHARS + 1);
        let rendered = bounded_result_output(&serde_json::json!(oversized))
            .expect("non-empty output is retained");
        assert!(rendered.ends_with("… [output truncated]"));
        assert!(rendered.chars().count() < MAX_RESULT_OUTPUT_CHARS + 32);
    }

    #[test]
    fn task_model_target_is_complete_and_trust_scoped() {
        let eligible_model = crate::core::llm::models_config::config()
            .models
            .values()
            .find(|model| {
                model.capabilities.agentic
                    && model.capabilities.tools
                    && Provider::from_string(&model.provider).is_some_and(|provider| {
                        provider_allowed_for_trust_mode(provider, TrustMode::Byok)
                    })
            })
            .expect("the catalog carries a BYOK model verified for Tasks");
        let constraints = goal_constraints(
            Some(1),
            Some(eligible_model.id.clone()),
            Some(eligible_model.provider.clone()),
            Some(TrustMode::Byok),
        )
        .expect("an exact catalog model with matching provider is admitted");
        assert!(constraints.iter().any(|constraint| {
            matches!(
                &constraint.value,
                ConstraintValue::Custom { key, value }
                    if key == "execution_model" && value == &eligible_model.id
            )
        }));

        let unverified_error = goal_constraints(
            None,
            Some("fixture-local-model".to_string()),
            Some("ollama".to_string()),
            Some(TrustMode::Local),
        )
        .expect_err("runtime function-call support is not proof of Task capability");
        assert!(unverified_error.contains("not verified for Tasks"));
        assert!(goal_constraints(
            None,
            Some("fixture-cloud-model".to_string()),
            Some("managed_cloud".to_string()),
            Some(TrustMode::Local),
        )
        .is_err());
        assert!(goal_constraints(
            None,
            Some("fixture-local-model".to_string()),
            None,
            Some(TrustMode::Local),
        )
        .is_err());
        assert!(goal_constraints(None, None, None, Some(TrustMode::Local)).is_err());
    }
}
