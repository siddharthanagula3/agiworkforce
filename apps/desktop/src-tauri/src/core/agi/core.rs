use super::*;
use crate::automation::AutomationService;
use crate::core::agent::ChangeTracker;
use crate::core::agi::planner::Plan;
use crate::core::llm::LLMRouter;
use agiworkforce_protocol::task_state::{AgentTaskState, AgentTaskStateChanged};
use anyhow::{anyhow, Result};
use chrono::Utc;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;
use tauri::Emitter;
use tokio::time::sleep;

use tokio::sync::RwLock;

// === Mutex Recovery Helpers (CRITICAL-001 fix) ===
// These helpers recover from poisoned mutexes by clearing the poison
// and returning the guard, logging a warning when recovery occurs.

/// Acquires a mutex lock, recovering from poison if necessary.
/// Returns the guard or an error if lock acquisition fails for other reasons.
fn lock_with_recovery<'a, T>(mutex: &'a Mutex<T>, context: &str) -> Result<MutexGuard<'a, T>> {
    match mutex.lock() {
        Ok(guard) => Ok(guard),
        Err(poisoned) => {
            tracing::warn!(
                "[AGI] Recovered from poisoned mutex ({}): prior thread panicked",
                context
            );
            Ok(poisoned.into_inner())
        }
    }
}

fn goal_iteration_limit(goal: &Goal) -> usize {
    const DEFAULT_MAX_ITERATIONS: usize = 1000;

    goal.constraints
        .iter()
        .find_map(|constraint| match &constraint.value {
            ConstraintValue::Custom { key, value } if key == "max_steps" => value
                .parse::<usize>()
                .ok()
                .filter(|limit| *limit > 0)
                .map(|limit| limit.min(DEFAULT_MAX_ITERATIONS)),
            _ => None,
        })
        .unwrap_or(DEFAULT_MAX_ITERATIONS)
}

// === MEDIUM-006 fix: Context memory limits ===
/// Maximum number of context memory entries to prevent unbounded growth.
const MAX_CONTEXT_MEMORY_ENTRIES: usize = 1000;
/// Maximum number of tool results to keep in context.
const MAX_TOOL_RESULTS: usize = 500;
/// Completed/reviewable tasks retained for status queries and task history.
const MAX_RETAINED_AGENT_TASKS: usize = 500;

fn remember_finished_task(
    history: &mut VecDeque<String>,
    task_id: &str,
    limit: usize,
) -> Option<String> {
    history.retain(|existing_id| existing_id != task_id);
    history.push_back(task_id.to_string());
    (history.len() > limit)
        .then(|| history.pop_front())
        .flatten()
}

/// MEDIUM-006 fix: Truncates context memory to prevent unbounded growth.
/// Keeps the most recent entries when limit is exceeded.
fn truncate_context_memory(context: &mut ExecutionContext) {
    if context.context_memory.len() > MAX_CONTEXT_MEMORY_ENTRIES {
        let excess = context.context_memory.len() - MAX_CONTEXT_MEMORY_ENTRIES;
        tracing::debug!(
            "Truncating context_memory: removing {} oldest entries",
            excess
        );
        context.context_memory.drain(0..excess);
    }

    if context.tool_results.len() > MAX_TOOL_RESULTS {
        let excess = context.tool_results.len() - MAX_TOOL_RESULTS;
        tracing::debug!(
            "Truncating tool_results: removing {} oldest entries",
            excess
        );
        context.tool_results.drain(0..excess);
    }
}

#[derive(Clone)]
struct PlanStepRuntimeState {
    status: String,
    result: Option<String>,
    error: Option<String>,
}

impl Default for PlanStepRuntimeState {
    fn default() -> Self {
        Self {
            status: "pending".to_string(),
            result: None,
            error: None,
        }
    }
}

pub struct AGICore {
    config: AGIConfig,
    capabilities: AGICapabilities,
    tool_registry: Arc<ToolRegistry>,
    knowledge_base: Arc<KnowledgeBase>,
    resource_manager: Arc<ResourceManager>,
    planner: Arc<AGIPlanner>,
    executor: Arc<AGIExecutor>,
    learning: Arc<LearningSystem>,
    router: Arc<RwLock<LLMRouter>>,
    automation: Arc<AutomationService>,
    // Bug #36: std::sync::Mutex used here because AGICore is constructed outside async
    // context AND several sync methods (get_goal_status, list_goals, cleanup_goal) access
    // these fields. Migrating to tokio::sync::Mutex would require making those methods
    // async, which propagates through the orchestrator. The lock scopes are kept minimal
    // (clone-and-release pattern) to avoid blocking the async runtime for meaningful
    // durations. lock_with_recovery() additionally handles poison from panicked threads.
    // TODO: Migrate to tokio::sync::Mutex when all callers are fully async-native.
    active_goals: Arc<Mutex<Vec<Goal>>>,
    execution_contexts: Arc<Mutex<HashMap<String, ExecutionContext>>>,
    /// Canonical lifecycle emitted by the engine. UI stores consume this map
    /// directly instead of inferring completion from legacy progress events.
    task_states: Arc<Mutex<HashMap<String, AgentTaskState>>>,
    /// Oldest-first completed/reviewable task ids used to bound retained
    /// contexts and lifecycle state without pruning active work.
    task_history: Arc<Mutex<VecDeque<String>>>,
    /// FIX-031 (Sprint 5): registry of spawned goal-execution JoinHandles,
    /// keyed by goal_id. Lets `cancel_goal` `.abort()` the worker so it
    /// stops within the next .await even if the loop is mid-LLM-call.
    /// The polling-based `cancellation_requested` flag in
    /// `execution_contexts` is still set for graceful exit; abort is the
    /// hard fallback if the worker can't return to the loop top in time.
    goal_handles: Arc<Mutex<HashMap<String, tokio::task::JoinHandle<()>>>>,
    stop_signal: Arc<AtomicBool>,
    pause_signal: Arc<AtomicBool>,
    pub(crate) app_handle: Option<tauri::AppHandle>,
    process_reasoning: Option<Arc<ProcessReasoning>>,
    process_ontology: Option<Arc<ProcessOntology>>,
    outcome_tracker: Option<Arc<OutcomeTracker>>,
    /// Reflection engine for multi-turn agentic reasoning
    reflection_engine: Option<Arc<ReflectionEngine>>,
}

impl AGICore {
    pub fn new(
        config: AGIConfig,
        router: Arc<RwLock<LLMRouter>>,
        automation: Arc<AutomationService>,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<Self> {
        let tool_registry = Arc::new(ToolRegistry::new()?);
        let knowledge_base = Arc::new(KnowledgeBase::new(config.knowledge_memory_mb)?);
        let resource_manager = Arc::new(ResourceManager::new(config.resource_limits.clone())?);

        // Initialize learning system first as it is needed for reflection
        let learning = Arc::new(LearningSystem::new(
            config.enable_learning,
            config.enable_self_improvement,
        )?);

        let planner = Arc::new(AGIPlanner::new(
            router.clone(),
            tool_registry.clone(),
            knowledge_base.clone(),
        )?);

        // Create reflection engine EARLY so we can pass it to executor
        let reflection_engine = Arc::new(ReflectionEngine::new(
            router.clone(),
            knowledge_base.clone(),
            learning.clone(),
        )?);

        // Create a shared ChangeTracker for undo capability
        let change_tracker = Arc::new(ChangeTracker::new());

        let executor = Arc::new(AGIExecutor::new(
            tool_registry.clone(),
            resource_manager.clone(),
            automation.clone(),
            router.clone(),
            app_handle.clone(),
            Some(reflection_engine.clone()),
            Some(change_tracker),
        )?);

        tool_registry.register_all_tools()?;

        Ok(Self {
            config,
            capabilities: AGICapabilities::default(),
            tool_registry,
            knowledge_base,
            resource_manager,
            planner,
            executor,
            learning,
            router,
            automation,
            active_goals: Arc::new(Mutex::new(Vec::new())),
            execution_contexts: Arc::new(Mutex::new(HashMap::new())),
            task_states: Arc::new(Mutex::new(HashMap::new())),
            task_history: Arc::new(Mutex::new(VecDeque::new())),
            goal_handles: Arc::new(Mutex::new(HashMap::new())),
            stop_signal: Arc::new(AtomicBool::new(false)),
            pause_signal: Arc::new(AtomicBool::new(false)),
            app_handle,
            process_reasoning: None,
            process_ontology: None,
            outcome_tracker: None,
            reflection_engine: Some(reflection_engine),
        })
    }

    pub fn resource_manager(&self) -> Arc<ResourceManager> {
        Arc::clone(&self.resource_manager)
    }

    pub fn knowledge_base(&self) -> Arc<KnowledgeBase> {
        Arc::clone(&self.knowledge_base)
    }

    pub fn with_process_reasoning(
        config: AGIConfig,
        router: Arc<RwLock<LLMRouter>>,
        automation: Arc<AutomationService>,
        app_handle: Option<tauri::AppHandle>,
        db_path: String,
    ) -> Result<Self> {
        let tool_registry = Arc::new(ToolRegistry::new()?);
        let knowledge_base = Arc::new(KnowledgeBase::new(config.knowledge_memory_mb)?);
        let resource_manager = Arc::new(ResourceManager::new(config.resource_limits.clone())?);

        let process_reasoning = Arc::new(ProcessReasoning::new(router.clone())?);
        let process_ontology = Arc::new(ProcessOntology::new(db_path.clone())?);
        let outcome_tracker = Arc::new(OutcomeTracker::new(db_path)?);

        let planner = Arc::new(AGIPlanner::with_process_reasoning(
            router.clone(),
            tool_registry.clone(),
            knowledge_base.clone(),
            process_reasoning.clone(),
            process_ontology.clone(),
        )?);

        // Create a shared ChangeTracker for undo capability
        let change_tracker = Arc::new(ChangeTracker::new());

        // Initialize learning system first
        let learning = Arc::new(LearningSystem::new(
            config.enable_learning,
            config.enable_self_improvement,
        )?);

        // Create reflection engine EARLY
        let reflection_engine = Arc::new(ReflectionEngine::new(
            router.clone(),
            knowledge_base.clone(),
            learning.clone(),
        )?);

        let encoder = crate::core::agi::executor::AGIExecutor::with_process_reasoning(
            tool_registry.clone(),
            resource_manager.clone(),
            automation.clone(),
            router.clone(),
            app_handle.clone(),
            process_reasoning.clone(),
            outcome_tracker.clone(),
            Some(reflection_engine.clone()),
            Some(change_tracker),
        );

        let executor = Arc::new(encoder?);

        // learning already initialized above

        tool_registry.register_all_tools()?;

        // Reflection engine already created above

        Ok(Self {
            config,
            capabilities: AGICapabilities::default(),
            tool_registry,
            knowledge_base,
            resource_manager,
            planner,
            executor,
            learning,
            router,
            automation,
            active_goals: Arc::new(Mutex::new(Vec::new())),
            execution_contexts: Arc::new(Mutex::new(HashMap::new())),
            task_states: Arc::new(Mutex::new(HashMap::new())),
            task_history: Arc::new(Mutex::new(VecDeque::new())),
            goal_handles: Arc::new(Mutex::new(HashMap::new())),
            stop_signal: Arc::new(AtomicBool::new(false)),
            pause_signal: Arc::new(AtomicBool::new(false)),
            app_handle,
            process_reasoning: Some(process_reasoning),
            process_ontology: Some(process_ontology),
            outcome_tracker: Some(outcome_tracker),
            reflection_engine: Some(reflection_engine),
        })
    }

    fn emit_event(&self, event: &str, payload: serde_json::Value) {
        if let Some(ref app) = self.app_handle {
            if let Err(e) = app.emit(event, payload) {
                tracing::warn!("Failed to emit event {}: {}", event, e);
            }
        }
    }

    fn transition_task_state(
        &self,
        task_id: &str,
        state: AgentTaskState,
        summary: impl Into<String>,
    ) {
        let previous_state = match lock_with_recovery(&self.task_states, "transition_task_state") {
            Ok(mut states) => states.insert(task_id.to_string(), state),
            Err(error) => {
                tracing::error!(
                    "[AGI] Failed to store task state for {}: {}",
                    task_id,
                    error
                );
                None
            }
        };
        if previous_state == Some(state) {
            return;
        }

        if state == AgentTaskState::ReadyForReview || state.is_terminal() {
            let evicted_task_id = lock_with_recovery(&self.task_history, "transition_task_state")
                .ok()
                .and_then(|mut history| {
                    remember_finished_task(&mut history, task_id, MAX_RETAINED_AGENT_TASKS)
                });
            if let Some(evicted_task_id) = evicted_task_id {
                if let Ok(mut states) =
                    lock_with_recovery(&self.task_states, "transition_task_state:prune_states")
                {
                    states.remove(&evicted_task_id);
                }
                if let Ok(mut contexts) = lock_with_recovery(
                    &self.execution_contexts,
                    "transition_task_state:prune_contexts",
                ) {
                    contexts.remove(&evicted_task_id);
                }
            }
        } else if let Ok(mut history) =
            lock_with_recovery(&self.task_history, "transition_task_state:reactivate")
        {
            history.retain(|existing_id| existing_id != task_id);
        }

        let payload = AgentTaskStateChanged {
            task_id: task_id.to_string(),
            state,
            previous_state,
            summary: Some(summary.into()),
        };
        match serde_json::to_value(payload) {
            Ok(payload) => self.emit_event("agi:task:state_changed", payload),
            Err(error) => tracing::error!(
                "[AGI] Failed to serialize task state for {}: {}",
                task_id,
                error
            ),
        }
    }

    fn emit_agent_plan_update(
        &self,
        goal_id: &str,
        description: &str,
        plan: &Plan,
        states: &[PlanStepRuntimeState],
        workflow_hash: Option<&str>,
        created_at_ms: i64,
    ) {
        let steps_payload: Vec<_> = plan
            .steps
            .iter()
            .enumerate()
            .map(|(index, step)| {
                let runtime = states.get(index).cloned().unwrap_or_default();
                let step_title = step.description.clone();
                let detail = format!("{} (tool: {})", step.description, step.tool_id);
                json!({
                    "id": step.id.clone(),
                    "title": step_title,
                    "description": detail,
                    "status": runtime.status,
                    "result": runtime.result,
                    "error": runtime.error,
                })
            })
            .collect();
        let updated_at = Utc::now().timestamp_millis();
        self.emit_event(
            "agent:plan_update",
            json!({
                "plan": {
                    "id": goal_id,
                    "workflowHash": workflow_hash,
                    "description": description,
                    "steps": steps_payload,
                    "createdAt": created_at_ms,
                    "updatedAt": updated_at,
                }
            }),
        );
    }

    pub async fn start(&self) -> Result<()> {
        tracing::info!("[AGI] Starting AGI Core");
        self.stop_signal.store(false, Ordering::SeqCst);

        loop {
            if self.stop_signal.load(Ordering::SeqCst) {
                tracing::info!("[AGI] Stop signal received");
                break;
            }

            if !self.resource_manager.check_availability().await? {
                tracing::warn!("[AGI] Resources limited, waiting...");
                sleep(Duration::from_secs(1)).await;
                continue;
            }

            self.process_goals().await?;

            self.update_knowledge().await?;

            if self.config.enable_learning {
                self.learning.update().await?;
            }

            sleep(Duration::from_millis(100)).await;
        }

        Ok(())
    }

    pub async fn submit_goal(&self, goal: Goal) -> Result<String> {
        tracing::info!("[AGI] New goal submitted: {}", goal.description);

        self.transition_task_state(
            &goal.id,
            AgentTaskState::Queued,
            "Task accepted by the agent engine.",
        );

        self.emit_event(
            "agi:goal:submitted",
            json!({
                "goal_id": goal.id,
                "description": goal.description,
                "priority": goal.priority,
            }),
        );

        self.knowledge_base.add_goal(&goal).await?;

        // CRITICAL-001 fix: Use recovery helper
        lock_with_recovery(&self.active_goals, "submit_goal:active_goals")?.push(goal.clone());

        let context = ExecutionContext {
            goal: goal.clone(),
            current_state: HashMap::new(),
            available_resources: self.resource_manager.get_state().await?,
            tool_results: Vec::new(),
            context_memory: Vec::new(),
        };

        // CRITICAL-001 fix: Use recovery helper
        lock_with_recovery(&self.execution_contexts, "submit_goal:execution_contexts")?
            .insert(goal.id.clone(), context);

        let goal_id = goal.id.clone();
        let core_clone = self.clone_for_execution();

        let app_handle_clone = self.app_handle.clone();
        let mut core_with_app = core_clone;
        core_with_app.app_handle = app_handle_clone;
        let goal_id_for_spawn = goal_id.clone();

        // FIX-031: keep the JoinHandle so cancel_goal can abort the worker
        // even if it's mid-LLM-call (the polling flag inside achieve_goal
        // only fires at loop boundaries, which can be 30s+ apart).
        let handle = tokio::spawn(async move {
            if let Err(e) = core_with_app.achieve_goal(goal_id_for_spawn.clone()).await {
                tracing::error!("[AGI] Goal execution failed: {}", e);
                core_with_app.transition_task_state(
                    &goal_id_for_spawn,
                    AgentTaskState::Failed,
                    format!("Agent work ended with an error: {e}"),
                );
                core_with_app.emit_event(
                    "agi:goal:error",
                    json!({
                        "goal_id": goal_id_for_spawn,
                        "error": e.to_string(),
                    }),
                );
            }
        });
        if let Ok(mut handles) = lock_with_recovery(&self.goal_handles, "submit_goal:goal_handles")
        {
            handles.insert(goal_id.clone(), handle);
        }

        Ok(goal.id)
    }

    pub async fn submit_goal_parallel(
        &self,
        goal: Goal,
        num_agents: usize,
    ) -> Result<crate::core::agi::ScoredResult> {
        tracing::info!(
            "[AGI] Parallel goal submitted: {} (agents: {})",
            goal.description,
            num_agents
        );
        self.transition_task_state(
            &goal.id,
            AgentTaskState::Queued,
            "Parallel task accepted by the agent engine.",
        );
        self.transition_task_state(
            &goal.id,
            AgentTaskState::Running,
            "Parallel agents started working.",
        );

        self.emit_event(
            "agi:goal:parallel_submitted",
            json!({
                "goal_id": goal.id,
                "description": goal.description,
                "num_agents": num_agents,
            }),
        );

        let result: Result<crate::core::agi::ScoredResult> = async {
            self.knowledge_base.add_goal(&goal).await?;

            let context = ExecutionContext {
                goal: goal.clone(),
                current_state: HashMap::new(),
                available_resources: self.resource_manager.get_state().await?,
                tool_results: Vec::new(),
                context_memory: Vec::new(),
            };

            tracing::info!("[AGI] Generating {} parallel plans", num_agents);
            let plans = self
                .planner
                .create_parallel_plans(&goal, &context, num_agents)
                .await?;

            self.emit_event(
                "agi:goal:parallel_plans_created",
                json!({
                    "goal_id": goal.id,
                    "num_plans": plans.len(),
                }),
            );

            let sandbox_manager = crate::core::agi::SandboxManager::new()?;

            tracing::info!("[AGI] Executing {} plans in parallel", plans.len());
            let execution_result = self
                .executor
                .execute_plans_parallel(plans, &sandbox_manager, &goal)
                .await;
            let cleanup_result = sandbox_manager.cleanup_all().await;
            let results = match (execution_result, cleanup_result) {
                (Ok(results), Ok(())) => results,
                (Err(execution_error), Ok(())) => return Err(execution_error),
                (Ok(_), Err(cleanup_error)) => return Err(cleanup_error),
                (Err(execution_error), Err(cleanup_error)) => {
                    return Err(execution_error.context(format!(
                        "parallel sandbox cleanup also failed: {cleanup_error}"
                    )));
                }
            };

            self.emit_event(
                "agi:goal:parallel_execution_completed",
                json!({
                    "goal_id": goal.id,
                    "num_results": results.len(),
                }),
            );

            let comparator = crate::core::agi::ResultComparator::new();
            let scored_results = comparator.compare_and_rank(results);
            let comparison_output = comparator.format_comparison(&scored_results);
            tracing::info!("[AGI] Parallel execution results:\n{}", comparison_output);

            let best_result = scored_results
                .first()
                .cloned()
                .ok_or_else(|| anyhow!("No valid results from parallel execution"))?;

            self.emit_event(
                "agi:goal:parallel_best_result",
                json!({
                    "goal_id": goal.id,
                    "best_plan_id": best_result.result.plan_id,
                    "score": best_result.score,
                    "rank": best_result.rank,
                    "success": best_result.result.success,
                    "execution_time_ms": best_result.result.execution_time_ms,
                    "error": best_result.result.error,
                }),
            );

            self.emit_event(
                "agi:goal:parallel_comparison",
                json!({
                    "goal_id": goal.id,
                    "comparison": comparison_output,
                    "all_results": scored_results,
                }),
            );

            Ok(best_result)
        }
        .await;

        match result {
            Ok(best_result) => {
                self.transition_task_state(
                    &goal.id,
                    if best_result.result.success {
                        AgentTaskState::ReadyForReview
                    } else {
                        AgentTaskState::Failed
                    },
                    if best_result.result.success {
                        "Parallel agent work finished and is ready for review."
                    } else {
                        "Parallel agent work ended with an error."
                    },
                );
                Ok(best_result)
            }
            Err(error) => {
                self.transition_task_state(
                    &goal.id,
                    AgentTaskState::Failed,
                    format!("Parallel agent work ended with an error: {error}"),
                );
                self.emit_event(
                    "agi:goal:error",
                    json!({
                        "goal_id": goal.id,
                        "error": error.to_string(),
                    }),
                );
                Err(error)
            }
        }
    }

    /// Submits a goal for execution using the swarm orchestration system.
    ///
    /// This method uses the SwarmOrchestrator for massively parallel execution,
    /// spawning up to 100 concurrent sub-agents to work on decomposed subtasks.
    /// The swarm system is ideal for complex goals that can be broken into
    /// many independent or semi-independent subtasks.
    ///
    /// Key features:
    /// - Automatic task decomposition via LLM analysis
    /// - Dynamic agent spawning with frozen weights (Kimi K2.5 pattern)
    /// - Circuit breaker pattern for fault tolerance
    /// - Critical path optimization for minimum execution time
    /// - Result aggregation with multiple strategies
    ///
    /// # Arguments
    /// * `goal` - The goal to achieve
    ///
    /// # Returns
    /// * `SwarmResult` containing aggregated results, metrics, and speedup ratio
    pub async fn submit_goal_swarm(&self, goal: Goal) -> Result<crate::core::swarm::SwarmResult> {
        use crate::core::swarm::{SwarmConfig, SwarmOrchestrator};

        tracing::info!("[AGI] Swarm goal submitted: {}", goal.description);
        self.transition_task_state(
            &goal.id,
            AgentTaskState::Queued,
            "Swarm task accepted by the agent engine.",
        );
        self.transition_task_state(
            &goal.id,
            AgentTaskState::Running,
            "Swarm agents started working.",
        );

        self.emit_event(
            "agi:goal:swarm_submitted",
            json!({
                "goal_id": goal.id,
                "description": goal.description,
                "priority": goal.priority,
            }),
        );

        // Create swarm configuration
        let config = SwarmConfig {
            max_agents: 20, // Start with conservative limit, can be increased
            optimize_critical_path: true,
            auto_spawn: true,
            ..Default::default()
        };

        // Create swarm orchestrator
        let orchestrator = match SwarmOrchestrator::new(
            config,
            self.router.clone(),
            self.automation.clone(),
            self.app_handle.clone(),
        ) {
            Ok(orchestrator) => orchestrator,
            Err(error) => {
                let error = anyhow::anyhow!("Failed to create swarm orchestrator: {}", error);
                self.transition_task_state(
                    &goal.id,
                    AgentTaskState::Failed,
                    format!("Swarm initialization failed: {error}"),
                );
                self.emit_event(
                    "agi:goal:error",
                    json!({
                        "goal_id": goal.id,
                        "error": error.to_string(),
                    }),
                );
                return Err(error);
            }
        };

        // Execute the goal using swarm
        let result = match orchestrator.execute_swarm_task(goal.clone()).await {
            Ok(result) => result,
            Err(error) => {
                let error = anyhow::anyhow!("Swarm execution failed: {}", error);
                self.transition_task_state(
                    &goal.id,
                    AgentTaskState::Failed,
                    format!("Swarm execution failed: {error}"),
                );
                self.emit_event(
                    "agi:goal:error",
                    json!({
                        "goal_id": goal.id,
                        "error": error.to_string(),
                    }),
                );
                return Err(error);
            }
        };

        self.emit_event(
            "agi:goal:swarm_completed",
            json!({
                "goal_id": goal.id,
                "success": result.success,
                "succeeded": result.succeeded,
                "failed": result.failed,
                "wall_time_ms": result.wall_time.as_millis(),
                "speedup_ratio": result.speedup_ratio,
                "critical_path_length": result.critical_path_length,
                "max_parallelism": result.max_parallelism,
                "error": if result.success { None } else { Some(result.summary.clone()) },
            }),
        );
        self.transition_task_state(
            &goal.id,
            if result.success {
                AgentTaskState::ReadyForReview
            } else {
                AgentTaskState::Failed
            },
            if result.success {
                "Swarm work finished and is ready for review."
            } else {
                "Swarm work ended with an error."
            },
        );

        tracing::info!(
            "[AGI] Swarm execution completed: {} ({}/{} subtasks, {:.2}x speedup)",
            if result.success { "SUCCESS" } else { "FAILED" },
            result.succeeded,
            result.succeeded + result.failed,
            result.speedup_ratio
        );

        Ok(result)
    }

    /// Determines whether a goal should use swarm execution.
    ///
    /// Returns true if the goal is complex enough to benefit from parallel
    /// multi-agent execution. Uses heuristics based on:
    /// - Goal description complexity
    /// - Presence of parallelizable keywords
    /// - Estimated task decomposition potential
    pub fn should_use_swarm(&self, goal: &Goal) -> bool {
        let description = goal.description.to_lowercase();

        // Keywords suggesting parallelizable work
        let parallel_keywords = [
            "multiple",
            "all",
            "each",
            "every",
            "batch",
            "files",
            "documents",
            "pages",
            "items",
            "records",
            "analyze all",
            "process all",
            "check all",
            "update all",
            "across",
            "simultaneously",
            "in parallel",
            "concurrently",
        ];

        // Check for parallel keywords
        let has_parallel_keywords = parallel_keywords.iter().any(|kw| description.contains(kw));

        // Check description length (longer descriptions often indicate complex tasks)
        let is_complex = description.len() > 100;

        // Check for multiple success criteria (indicates multi-step goals)
        let has_multiple_criteria = goal.success_criteria.len() > 2;

        // Use swarm if any strong indicator is present
        has_parallel_keywords || (is_complex && has_multiple_criteria)
    }

    /// Submits a goal with automatic execution strategy selection.
    ///
    /// Automatically chooses between:
    /// - Sequential execution (simple goals)
    /// - Parallel plans (moderately complex goals)
    /// - Swarm execution (highly parallelizable goals)
    ///
    /// This is the recommended entry point for goal submission when you want
    /// the AGI to automatically optimize execution strategy.
    pub async fn submit_goal_auto(&self, goal: Goal) -> Result<String> {
        if self.should_use_swarm(&goal) {
            tracing::info!(
                "[AGI] Auto-selected swarm execution for goal: {}",
                goal.description
            );
            let goal_id = goal.id.clone();
            let core_clone = self.clone_for_execution();
            let goal_clone = goal.clone();

            tokio::spawn(async move {
                match core_clone.submit_goal_swarm(goal_clone).await {
                    Ok(result) => {
                        tracing::info!(
                            "[AGI] Swarm goal completed with speedup: {:.2}x",
                            result.speedup_ratio
                        );
                    }
                    Err(e) => {
                        tracing::error!("[AGI] Swarm goal failed: {}", e);
                    }
                }
            });

            Ok(goal_id)
        } else {
            // Use standard sequential execution
            self.submit_goal(goal).await
        }
    }

    async fn process_goals(&self) -> Result<()> {
        // CRITICAL-001 fix: Use recovery helpers
        let goals = lock_with_recovery(&self.active_goals, "process_goals:active_goals")?.clone();

        for goal in goals {
            let context =
                lock_with_recovery(&self.execution_contexts, "process_goals:get_context")?
                    .get(&goal.id)
                    .cloned();

            if let Some(mut ctx) = context {
                ctx.available_resources = self.resource_manager.get_state().await?;
                lock_with_recovery(&self.execution_contexts, "process_goals:update_context")?
                    .insert(goal.id.clone(), ctx);
            }
        }

        Ok(())
    }

    async fn achieve_goal(&self, goal_id: String) -> Result<()> {
        // CRITICAL-001 fix: Use recovery helper
        let mut context = lock_with_recovery(&self.execution_contexts, "achieve_goal:get_context")?
            .get(&goal_id)
            .ok_or_else(|| anyhow!("Goal {} not found", goal_id))?
            .clone();

        tracing::info!("[AGI] Achieving goal: {}", context.goal.description);
        self.transition_task_state(&goal_id, AgentTaskState::Running, "Agent started working.");

        let max_iterations = goal_iteration_limit(&context.goal);
        let max_duration = Duration::from_secs(300); // 5 minute absolute timeout
        let start_time = std::time::Instant::now();
        let mut iteration = 0;
        let mut last_reflection: Option<reflection::ReflectionInsight> = None;
        let mut consecutive_failures = 0;
        const MAX_CONSECUTIVE_FAILURES: u32 = 3;

        loop {
            // Check cancellation first
            if self.is_goal_cancelled(&goal_id).await {
                tracing::info!("[AGI] Goal {} cancelled by user", goal_id);
                self.transition_task_state(
                    &goal_id,
                    AgentTaskState::Cancelled,
                    "Agent work was cancelled.",
                );
                self.emit_event("agi:goal:cancelled", json!({ "goal_id": goal_id }));
                break;
            }

            // Check global or goal-specific pause state and wait if paused.
            if self.is_goal_paused(&goal_id) {
                tracing::info!("[AGI] Goal {} paused", goal_id);
                self.transition_task_state(
                    &goal_id,
                    AgentTaskState::Paused,
                    "Agent work is paused.",
                );
                self.emit_event("agi:goal:paused", json!({ "goal_id": goal_id.clone() }));

                // Wait until unpaused
                while self.is_goal_paused(&goal_id) {
                    sleep(Duration::from_millis(100)).await;
                }

                tracing::info!("[AGI] Goal {} resumed", goal_id);
                self.transition_task_state(
                    &goal_id,
                    AgentTaskState::Running,
                    "Agent resumed working.",
                );
                self.emit_event("agi:goal:resumed", json!({ "goal_id": goal_id.clone() }));
            }

            // Check absolute timeout
            if start_time.elapsed() > max_duration {
                tracing::warn!(
                    "[AGI] Goal {} timed out after {:?}",
                    goal_id,
                    start_time.elapsed()
                );
                self.emit_event(
                    "agi:goal:timeout",
                    json!({
                        "goal_id": goal_id,
                        "elapsed_secs": start_time.elapsed().as_secs(),
                        "iterations": iteration,
                    }),
                );
                self.transition_task_state(
                    &goal_id,
                    AgentTaskState::Failed,
                    "Agent work timed out.",
                );
                break;
            }

            iteration += 1;
            if iteration > max_iterations {
                tracing::warn!(
                    "[AGI] Max iterations ({}) reached for goal {}",
                    max_iterations,
                    goal_id
                );
                self.emit_event(
                    "agi:goal:max_iterations",
                    json!({
                        "goal_id": goal_id,
                        "iterations": iteration,
                    }),
                );
                self.transition_task_state(
                    &goal_id,
                    AgentTaskState::Failed,
                    format!("Agent stopped after reaching the {max_iterations}-iteration limit."),
                );
                break;
            }

            context.current_state.insert(
                "current_iteration".to_string(),
                serde_json::Value::from(iteration),
            );
            if let Ok(mut contexts) =
                lock_with_recovery(&self.execution_contexts, "achieve_goal:update_iteration")
            {
                if let Some(shared_context) = contexts.get_mut(&goal_id) {
                    shared_context.current_state.insert(
                        "current_iteration".to_string(),
                        serde_json::Value::from(iteration),
                    );
                }
            }

            tracing::info!(
                "[AGI] Iteration {}/{} for goal {}",
                iteration,
                max_iterations,
                goal_id
            );

            // Emit iteration start event
            self.emit_event(
                "agi:goal:iteration_start",
                json!({
                    "goal_id": goal_id.clone(),
                    "iteration": iteration,
                    "has_prior_reflection": last_reflection.is_some(),
                }),
            );

            if self.check_goal_achieved(&context).await? {
                let completed_steps = context.tool_results.len();
                tracing::info!("[AGI] Goal {} achieved (pre-check)!", goal_id);
                self.emit_event(
                    "agi:goal:achieved",
                    json!({
                        "goal_id": goal_id,
                        "total_steps": completed_steps,
                        "completed_steps": completed_steps,
                        "iterations": iteration,
                    }),
                );
                self.transition_task_state(
                    &goal_id,
                    AgentTaskState::ReadyForReview,
                    "Agent work finished and is ready for review.",
                );
                break;
            }

            // Create plan, potentially informed by previous reflection
            let mut plan = self.planner.create_plan(&context.goal, &context).await?;

            tracing::info!("[AGI] Plan created with {} steps", plan.steps.len());

            if plan.steps.is_empty() {
                tracing::warn!("[AGI] Planner returned empty plan. Assuming blocked or done.");
                self.transition_task_state(
                    &goal_id,
                    AgentTaskState::Failed,
                    "The agent could not produce an executable plan.",
                );
                break;
            }

            // === MULTI-TURN REFLECTION: Pre-execution plan critique ===
            if let Some(ref reflection_engine) = self.reflection_engine {
                // Critique the plan before execution (on iterations > 1 or if we have prior failures)
                if iteration > 1 || consecutive_failures > 0 {
                    tracing::info!("[AGI] Critiquing plan before execution");
                    match reflection_engine
                        .critique_plan(&context.goal, &plan, &context)
                        .await
                    {
                        Ok(critique) => {
                            self.emit_event(
                                "agi:reflection:plan_critique",
                                json!({
                                    "goal_id": goal_id.clone(),
                                    "iteration": iteration,
                                    "quality_score": critique.quality_score,
                                    "likely_to_succeed": critique.likely_to_succeed,
                                    "risks_count": critique.risks.len(),
                                    "suggestions": critique.suggestions,
                                }),
                            );

                            // If plan quality is too low, try to apply corrections from last reflection
                            if critique.quality_score < 50 && last_reflection.is_some() {
                                if let Some(ref insight) = last_reflection {
                                    tracing::info!(
                                        "[AGI] Applying corrections from previous reflection"
                                    );
                                    match reflection_engine
                                        .apply_corrections(&plan, &insight.corrections)
                                        .await
                                    {
                                        Ok(revised_plan) => {
                                            plan = revised_plan;
                                            self.emit_event("agi:reflection:plan_revised", json!({
                                                "goal_id": goal_id.clone(),
                                                "iteration": iteration,
                                                "corrections_applied": insight.corrections.len(),
                                            }));
                                        }
                                        Err(e) => {
                                            tracing::warn!(
                                                "[AGI] Failed to apply corrections: {}",
                                                e
                                            );
                                        }
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            tracing::warn!("[AGI] Plan critique failed: {}", e);
                        }
                    }
                }
            }

            let workflow_hash = compute_plan_workflow_hash(&context.goal, &plan);
            let plan_created_at = Utc::now().timestamp_millis();
            let mut step_states = vec![PlanStepRuntimeState::default(); plan.steps.len()];
            self.emit_agent_plan_update(
                &goal_id,
                &context.goal.description,
                &plan,
                &step_states,
                Some(workflow_hash.as_str()),
                plan_created_at,
            );

            self.emit_event(
                "agi:goal:plan_created",
                json!({
                    "goal_id": goal_id,
                    "total_steps": plan.steps.len(),
                    "estimated_duration_ms": plan.estimated_duration.as_millis(),
                    "iteration": iteration,
                }),
            );

            let mut plan_interrupted = false;
            let mut steps_succeeded = 0;
            let mut steps_failed = 0;

            for (index, step) in plan.steps.iter().enumerate() {
                tracing::info!(
                    "[AGI] Executing step {}/{}: {}",
                    index + 1,
                    plan.steps.len(),
                    step.description
                );

                self.emit_event(
                    "agi:goal:step_started",
                    json!({
                        "goal_id": goal_id.clone(),
                        "step_id": step.id,
                        "step_index": index,
                        "total_steps": plan.steps.len(),
                        "description": step.description,
                    }),
                );

                if !self
                    .resource_manager
                    .reserve_resources(&step.estimated_resources)
                    .await?
                {
                    tracing::warn!("[AGI] Insufficient resources for step, waiting...");
                    sleep(Duration::from_secs(1)).await;
                    continue;
                }

                if let Some(state) = step_states.get_mut(index) {
                    state.status = "running".to_string();
                    state.result = None;
                    state.error = None;
                }
                self.emit_agent_plan_update(
                    &goal_id,
                    &context.goal.description,
                    &plan,
                    &step_states,
                    Some(workflow_hash.as_str()),
                    plan_created_at,
                );

                let start = std::time::Instant::now();
                let execution = self.executor.execute_step(step, &context).await;
                let execution_time = start.elapsed();
                let (success, step_value, error_text) = match execution {
                    Ok(value) => (true, value, None),
                    Err(err) => (false, serde_json::Value::Null, Some(err.to_string())),
                };

                self.resource_manager
                    .release_resources(&step.estimated_resources)
                    .await?;

                let tool_result = ToolExecutionResult {
                    tool_id: step.tool_id.clone(),
                    step_id: step.id.clone(),
                    success,
                    result: step_value.clone(),
                    error: error_text.clone(),
                    execution_time_ms: execution_time.as_millis() as u64,
                    resources_used: step.estimated_resources.clone(),
                };

                if success {
                    steps_succeeded += 1;
                } else {
                    steps_failed += 1;
                }

                if let Some(state) = step_states.get_mut(index) {
                    state.status = if success {
                        "success".to_string()
                    } else {
                        "failed".to_string()
                    };
                    state.result = format_plan_result_snippet(&step_value);
                    state.error = error_text.clone();
                }
                self.emit_agent_plan_update(
                    &goal_id,
                    &context.goal.description,
                    &plan,
                    &step_states,
                    Some(workflow_hash.as_str()),
                    plan_created_at,
                );

                self.emit_event(
                    "agi:goal:step_completed",
                    json!({
                        "goal_id": goal_id.clone(),
                        "step_id": step.id,
                        "step_index": index,
                        "total_steps": plan.steps.len(),
                        "success": tool_result.success,
                        "execution_time_ms": tool_result.execution_time_ms,
                        "error": tool_result.error,
                    }),
                );

                context.tool_results.push(tool_result.clone());
                context.context_memory.push(ContextEntry {
                    timestamp: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or(std::time::Duration::from_secs(0))
                        .as_secs(),
                    event: format!("step_{}_executed", index),
                    data: serde_json::to_value(&tool_result)?,
                });

                // MEDIUM-006 fix: Prevent unbounded memory growth
                truncate_context_memory(&mut context);

                self.knowledge_base
                    .add_experience(&context.goal, &tool_result)
                    .await?;

                if self.config.enable_learning {
                    self.learning.record_experience(step, &tool_result).await?;
                }

                self.emit_event("agi:goal:progress", json!({
                    "goal_id": goal_id.clone(),
                    "completed_steps": index + 1,
                    "total_steps": plan.steps.len(),
                    "progress_percent": ((index + 1) as f64 / plan.steps.len() as f64 * 100.0) as u32,
                }));

                // CRITICAL-001 fix: Use recovery helper
                lock_with_recovery(&self.execution_contexts, "achieve_goal:update_after_step")?
                    .insert(goal_id.clone(), context.clone());

                if self.check_goal_achieved(&context).await? {
                    tracing::info!("[AGI] Goal {} achieved (mid-plan)!", goal_id);
                    self.emit_event(
                        "agi:goal:achieved",
                        json!({
                            "goal_id": goal_id,
                            "total_steps": plan.steps.len(),
                            "completed_steps": index + 1,
                            "iterations": iteration,
                        }),
                    );
                    self.transition_task_state(
                        &goal_id,
                        AgentTaskState::ReadyForReview,
                        "Agent work finished and is ready for review.",
                    );
                    plan_interrupted = true;
                    break;
                }
            }

            if plan_interrupted {
                break;
            }

            // === MULTI-TURN REFLECTION: Post-execution reflection ===
            if let Some(ref reflection_engine) = self.reflection_engine {
                tracing::info!("[AGI] Starting post-execution reflection");

                match reflection_engine
                    .reflect(&context.goal, &context, &plan)
                    .await
                {
                    Ok(insight) => {
                        // Track consecutive failures
                        if insight.assessment.success_rate < 0.5 {
                            consecutive_failures += 1;
                        } else {
                            consecutive_failures = 0;
                        }

                        // Emit reflection completed event with full insight data
                        self.emit_event(
                            "agi:reflection:completed",
                            json!({
                                "goal_id": goal_id.clone(),
                                "iteration": iteration,
                                "insight": serde_json::to_value(&insight).unwrap_or_default(),
                            }),
                        );

                        // Also emit individual events for UI components
                        if !insight.failure_patterns.is_empty() {
                            self.emit_event(
                                "agi:reflection:failure_patterns",
                                json!({
                                    "goal_id": goal_id.clone(),
                                    "iteration": iteration,
                                    "patterns": insight.failure_patterns.iter().map(|p| json!({
                                        "pattern_id": p.pattern_id,
                                        "category": format!("{:?}", p.category),
                                        "description": p.description,
                                        "affected_steps": p.affected_steps,
                                        "root_cause": p.root_cause,
                                        "frequency": p.frequency,
                                    })).collect::<Vec<_>>(),
                                }),
                            );
                        }

                        if !insight.corrections.is_empty() {
                            self.emit_event(
                                "agi:reflection:corrections",
                                json!({
                                    "goal_id": goal_id.clone(),
                                    "iteration": iteration,
                                    "corrections": insight.corrections.iter().map(|c| json!({
                                        "for_step_id": c.for_step_id,
                                        "correction_type": format!("{:?}", c.correction_type),
                                        "description": c.description,
                                        "alternative_tool": c.alternative_tool,
                                        "modified_parameters": c.modified_parameters,
                                        "priority": c.priority,
                                    })).collect::<Vec<_>>(),
                                }),
                            );
                        }

                        if !insight.recommendations.is_empty() {
                            self.emit_event(
                                "agi:reflection:recommendations",
                                json!({
                                    "goal_id": goal_id.clone(),
                                    "iteration": iteration,
                                    "recommendations": insight.recommendations,
                                }),
                            );
                        }

                        // Store insight in context memory
                        context.context_memory.push(ContextEntry {
                            timestamp: insight.timestamp,
                            event: format!("reflection_iteration_{}", iteration),
                            data: serde_json::to_value(&insight)?,
                        });

                        // Check if we should give up based on reflection
                        if !insight.assessment.goal_achievable
                            && consecutive_failures >= MAX_CONSECUTIVE_FAILURES
                        {
                            tracing::warn!(
                                "[AGI] Goal {} appears unachievable after {} consecutive failures",
                                goal_id,
                                consecutive_failures
                            );
                            self.emit_event(
                                "agi:goal:unachievable",
                                json!({
                                    "goal_id": goal_id,
                                    "iterations": iteration,
                                    "consecutive_failures": consecutive_failures,
                                    "final_insight": insight,
                                }),
                            );
                            self.transition_task_state(
                                &goal_id,
                                AgentTaskState::Failed,
                                "The agent determined that the goal is not currently achievable.",
                            );
                            break;
                        }

                        // Handle sub-goals if any were generated
                        if !insight.sub_goals.is_empty() {
                            tracing::info!(
                                "[AGI] {} sub-goals generated, adding to context",
                                insight.sub_goals.len()
                            );
                            self.emit_event(
                                "agi:reflection:sub_goals",
                                json!({
                                    "goal_id": goal_id.clone(),
                                    "sub_goals": insight.sub_goals,
                                }),
                            );
                        }

                        // Store for next iteration
                        last_reflection = Some(insight);
                    }
                    Err(e) => {
                        tracing::warn!("[AGI] Reflection failed: {}", e);
                    }
                }
            } else {
                // No reflection engine, just track basic failure counts
                if steps_failed > steps_succeeded {
                    consecutive_failures += 1;
                } else {
                    consecutive_failures = 0;
                }
            }

            // Emit iteration complete event
            self.emit_event(
                "agi:goal:iteration_complete",
                json!({
                    "goal_id": goal_id.clone(),
                    "iteration": iteration,
                    "steps_succeeded": steps_succeeded,
                    "steps_failed": steps_failed,
                    "consecutive_failures": consecutive_failures,
                }),
            );

            // Adaptive delay based on failure rate
            let delay_secs = if consecutive_failures > 0 {
                std::cmp::min(2_u64.pow(consecutive_failures), 30)
            } else {
                2
            };
            sleep(Duration::from_secs(delay_secs)).await;
        }

        // Remove live execution ownership while retaining the final context and
        // canonical state for status queries, review, and archival.
        self.cleanup_goal(&goal_id);

        Ok(())
    }

    /// MEDIUM-007 fix: Remove a goal from active tracking structures.
    /// Called when achieve_goal exits for any reason (success, failure, timeout, cancellation).
    fn cleanup_goal(&self, goal_id: &str) {
        // Remove from active_goals
        if let Ok(mut goals) = lock_with_recovery(&self.active_goals, "cleanup_goal:active_goals") {
            let original_len = goals.len();
            goals.retain(|g| g.id != goal_id);
            if goals.len() < original_len {
                tracing::debug!("[AGI] Removed goal {} from active_goals", goal_id);
            }
        }

        // FIX-031: drop the JoinHandle so the registry doesn't grow without
        // bound. We don't .abort() here — by the time cleanup_goal runs the
        // worker has already returned (achieve_goal exited on its own).
        if let Ok(mut handles) = lock_with_recovery(&self.goal_handles, "cleanup_goal:goal_handles")
        {
            if handles.remove(goal_id).is_some() {
                tracing::debug!("[AGI] Removed goal {} JoinHandle from registry", goal_id);
            }
        }

        self.emit_event("agi:goal:cleanup", json!({ "goal_id": goal_id }));
    }

    async fn check_goal_achieved(&self, context: &ExecutionContext) -> Result<bool> {
        for criterion in &context.goal.success_criteria {
            let evaluation = self.planner.evaluate_criterion(criterion, context).await?;

            if !evaluation {
                return Ok(false);
            }
        }

        Ok(true)
    }

    /// Updates the knowledge base with learnings from execution.
    /// 1. Consolidates in-memory experiences from the learning system
    /// 2. Persists high-value strategies to the knowledge base
    /// 3. Triggers memory cleanup if limits are exceeded
    async fn update_knowledge(&self) -> Result<()> {
        // Step 1: Consolidate learning system experiences
        self.learning.update().await?;

        // Step 2: Persist high-performing strategies as knowledge entries
        let strategies = [
            "file_operations",
            "web_search",
            "code_execution",
            "api_calls",
        ];

        for tool_category in strategies {
            if let Some(strategy) = self.learning.get_best_strategy(tool_category) {
                // Only persist strategies with meaningful data
                if strategy.usage_count > 0 && strategy.success_rate > 0.0 {
                    let entry = super::knowledge::KnowledgeEntry {
                        id: format!("strategy_{}", tool_category),
                        category: "strategy".to_string(),
                        content: format!(
                            "Tool '{}': success_rate={:.2}%, avg_time={}ms, usage_count={}",
                            strategy.tool_id,
                            strategy.success_rate * 100.0,
                            strategy.avg_execution_time_ms,
                            strategy.usage_count
                        ),
                        metadata: std::collections::HashMap::from([
                            ("tool_id".to_string(), strategy.tool_id.clone()),
                            (
                                "success_rate".to_string(),
                                strategy.success_rate.to_string(),
                            ),
                            (
                                "avg_execution_time_ms".to_string(),
                                strategy.avg_execution_time_ms.to_string(),
                            ),
                            ("usage_count".to_string(), strategy.usage_count.to_string()),
                        ]),
                        timestamp: std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_secs())
                            .unwrap_or(0),
                        importance: strategy.success_rate, // Higher success = more important
                    };

                    if let Err(e) = self.knowledge_base.add_entry(entry).await {
                        tracing::warn!("Failed to persist strategy {}: {}", tool_category, e);
                    }
                }
            }
        }

        tracing::debug!("Knowledge update completed");
        Ok(())
    }

    pub fn clone_for_execution(&self) -> Self {
        Self {
            config: self.config.clone(),
            capabilities: self.capabilities.clone(),
            tool_registry: self.tool_registry.clone(),
            knowledge_base: self.knowledge_base.clone(),
            resource_manager: self.resource_manager.clone(),
            planner: self.planner.clone(),
            executor: self.executor.clone(),
            learning: self.learning.clone(),
            router: self.router.clone(),
            automation: self.automation.clone(),
            active_goals: self.active_goals.clone(),
            execution_contexts: self.execution_contexts.clone(),
            task_states: self.task_states.clone(),
            task_history: self.task_history.clone(),
            goal_handles: self.goal_handles.clone(),
            stop_signal: self.stop_signal.clone(),
            pause_signal: self.pause_signal.clone(),
            app_handle: None,
            process_reasoning: self.process_reasoning.clone(),
            process_ontology: self.process_ontology.clone(),
            outcome_tracker: self.outcome_tracker.clone(),
            reflection_engine: self.reflection_engine.clone(),
        }
    }

    pub fn stop(&self) {
        self.stop_signal.store(true, Ordering::SeqCst);
    }

    pub fn pause(&self) {
        self.pause_signal.store(true, Ordering::SeqCst);
    }

    pub async fn cancel_goal(&self, goal_id: &str) -> Result<()> {
        // Step 1: set the polling flag so the loop can exit gracefully on
        // its next iteration (preserving the existing event-emit + cleanup
        // path inside achieve_goal).
        {
            let mut contexts = lock_with_recovery(&self.execution_contexts, "cancel_goal")?;
            if let Some(context) = contexts.get_mut(goal_id) {
                context.current_state.insert(
                    "cancellation_requested".to_string(),
                    serde_json::Value::Bool(true),
                );
            } else {
                return Err(anyhow!("Goal {} not found", goal_id));
            }
        }

        // FIX-031: hard-cancel — abort the spawned worker so a long-running
        // .await (e.g. an LLM call) is interrupted immediately instead of
        // waiting for the iteration to finish. The handle is removed from
        // the registry so future cancels are no-ops on the same id.
        if let Ok(mut handles) = lock_with_recovery(&self.goal_handles, "cancel_goal:goal_handles")
        {
            if let Some(handle) = handles.remove(goal_id) {
                handle.abort();
                tracing::info!("[AGI] Aborted goal {} worker via JoinHandle", goal_id);
            }
        }

        self.transition_task_state(
            goal_id,
            AgentTaskState::Cancelled,
            "Agent work was cancelled.",
        );
        // Aborting the worker prevents `achieve_goal` from reaching its own
        // cleanup epilogue. Release live ownership here while retaining the
        // bounded status context for review and history.
        self.cleanup_goal(goal_id);
        tracing::info!("[AGI] Cancellation requested for goal {}", goal_id);
        Ok(())
    }

    pub fn pause_goal(&self, goal_id: &str) -> Result<()> {
        let mut contexts = lock_with_recovery(&self.execution_contexts, "pause_goal")?;
        let context = contexts
            .get_mut(goal_id)
            .ok_or_else(|| anyhow!("Goal {} not found", goal_id))?;
        context
            .current_state
            .insert("pause_requested".to_string(), serde_json::Value::Bool(true));
        drop(contexts);
        self.transition_task_state(goal_id, AgentTaskState::Paused, "Agent work is paused.");
        Ok(())
    }

    pub fn resume_goal(&self, goal_id: &str) -> Result<()> {
        let mut contexts = lock_with_recovery(&self.execution_contexts, "resume_goal")?;
        let context = contexts
            .get_mut(goal_id)
            .ok_or_else(|| anyhow!("Goal {} not found", goal_id))?;
        context.current_state.insert(
            "pause_requested".to_string(),
            serde_json::Value::Bool(false),
        );
        drop(contexts);
        self.transition_task_state(goal_id, AgentTaskState::Running, "Agent resumed working.");
        Ok(())
    }

    pub fn is_goal_paused(&self, goal_id: &str) -> bool {
        if self.is_paused() {
            return true;
        }
        lock_with_recovery(&self.execution_contexts, "is_goal_paused")
            .ok()
            .and_then(|contexts| {
                contexts
                    .get(goal_id)
                    .and_then(|context| context.current_state.get("pause_requested"))
                    .and_then(serde_json::Value::as_bool)
            })
            .unwrap_or(false)
    }

    /// HIGH-001 fix: Properly handle mutex poisoning in cancellation check.
    /// Returns true on poison (fail-safe: assume cancelled if state is corrupted).
    pub async fn is_goal_cancelled(&self, goal_id: &str) -> bool {
        match lock_with_recovery(&self.execution_contexts, "is_goal_cancelled") {
            Ok(contexts) => {
                if let Some(context) = contexts.get(goal_id) {
                    if let Some(val) = context.current_state.get("cancellation_requested") {
                        return val.as_bool().unwrap_or(false);
                    }
                }
                false
            }
            Err(e) => {
                // Fail-safe: if we can't check, assume cancelled to prevent runaway
                tracing::error!("[AGI] Failed to check cancellation for {}: {}", goal_id, e);
                true
            }
        }
    }

    pub fn resume(&self) {
        self.pause_signal.store(false, Ordering::SeqCst);
    }

    pub fn is_paused(&self) -> bool {
        self.pause_signal.load(Ordering::SeqCst)
    }

    pub fn get_capabilities(&self) -> &AGICapabilities {
        &self.capabilities
    }

    pub fn get_goal_status(&self, goal_id: &str) -> Option<ExecutionContext> {
        // CRITICAL-001 fix: Use recovery helper
        lock_with_recovery(&self.execution_contexts, "get_goal_status")
            .ok()?
            .get(goal_id)
            .cloned()
    }

    pub fn get_task_state(&self, goal_id: &str) -> Option<AgentTaskState> {
        lock_with_recovery(&self.task_states, "get_task_state")
            .ok()?
            .get(goal_id)
            .copied()
    }

    pub fn list_goals(&self) -> Vec<Goal> {
        // CRITICAL-001 fix: Use recovery helper
        lock_with_recovery(&self.active_goals, "list_goals")
            .map(|g| g.clone())
            .unwrap_or_default()
    }
}

fn compute_plan_workflow_hash(goal: &Goal, plan: &Plan) -> String {
    let mut hasher = Sha256::new();
    hasher.update(goal.id.as_bytes());
    hasher.update(goal.description.as_bytes());
    for step in &plan.steps {
        hasher.update(step.id.as_bytes());
        hasher.update(step.tool_id.as_bytes());
        hasher.update(step.description.as_bytes());
    }
    hex::encode(hasher.finalize())
}

fn format_plan_result_snippet(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::Null => None,
        serde_json::Value::String(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        _ => serde_json::to_string(value).ok(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn goal_iteration_limit_defaults_to_global_cap() {
        let goal = Goal {
            id: "goal-1".to_string(),
            description: "default".to_string(),
            priority: Priority::Medium,
            deadline: None,
            constraints: vec![],
            success_criteria: vec![],
            trust_mode: None,
        };

        assert_eq!(goal_iteration_limit(&goal), 1000);
    }

    #[test]
    fn goal_iteration_limit_uses_max_steps_constraint() {
        let goal = Goal {
            id: "goal-2".to_string(),
            description: "bounded".to_string(),
            priority: Priority::Medium,
            deadline: None,
            constraints: vec![Constraint {
                name: "max_steps".to_string(),
                value: ConstraintValue::Custom {
                    key: "max_steps".to_string(),
                    value: "12".to_string(),
                },
            }],
            success_criteria: vec![],
            trust_mode: None,
        };

        assert_eq!(goal_iteration_limit(&goal), 12);
    }

    #[test]
    fn finished_task_history_is_bounded_and_refreshes_existing_ids() {
        let mut history = VecDeque::from(["task-1".to_string(), "task-2".to_string()]);

        assert_eq!(remember_finished_task(&mut history, "task-1", 2), None);
        assert_eq!(
            history,
            VecDeque::from(["task-2".to_string(), "task-1".to_string()])
        );

        assert_eq!(
            remember_finished_task(&mut history, "task-3", 2),
            Some("task-2".to_string())
        );
        assert_eq!(
            history,
            VecDeque::from(["task-1".to_string(), "task-3".to_string()])
        );
    }
}
