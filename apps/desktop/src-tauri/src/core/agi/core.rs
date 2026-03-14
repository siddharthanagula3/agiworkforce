use super::*;
use crate::automation::AutomationService;
use crate::core::agent::ChangeTracker;
use crate::core::agi::planner::Plan;
use crate::core::llm::LLMRouter;
use anyhow::{anyhow, Result};
use chrono::Utc;
use serde_json::json;
use sha2::{Digest, Sha256};
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
        // Bug #35 fix: Removed duplicate LearningSystem::new() call.
        // The `learning` Arc created at line 121 is reused here; the second
        // instantiation leaked the first instance.

        tool_registry.register_all_tools()?;

        // Create reflection engine for multi-turn reasoning
        // MOVED UP to line 117 to be available for executor
        // let reflection_engine = Arc::new(ReflectionEngine::new(
        //    router.clone(),
        //    knowledge_base.clone(),
        //    learning.clone(),
        // )?);

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

        tokio::spawn(async move {
            if let Err(e) = core_with_app.achieve_goal(goal_id_for_spawn).await {
                tracing::error!("[AGI] Goal execution failed: {}", e);
            }
        });

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

        self.emit_event(
            "agi:goal:parallel_submitted",
            json!({
                "goal_id": goal.id,
                "description": goal.description,
                "num_agents": num_agents,
            }),
        );

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
        let results = self
            .executor
            .execute_plans_parallel(plans, &sandbox_manager, &goal)
            .await?;

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

        sandbox_manager.cleanup_all().await?;

        let best_result = scored_results
            .first()
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

        Ok(best_result.clone())
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
        let orchestrator = SwarmOrchestrator::new(
            config,
            self.router.clone(),
            self.automation.clone(),
            self.app_handle.clone(),
        )
        .map_err(|e| anyhow::anyhow!("Failed to create swarm orchestrator: {}", e))?;

        // Execute the goal using swarm
        let result = orchestrator
            .execute_swarm_task(goal.clone())
            .await
            .map_err(|e| anyhow::anyhow!("Swarm execution failed: {}", e))?;

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
            }),
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
                self.emit_event("agi:goal:cancelled", json!({ "goal_id": goal_id }));
                break;
            }

            // Check pause signal and wait if paused
            if self.is_paused() {
                tracing::info!("[AGI] Goal {} paused", goal_id);
                self.emit_event("agi:goal:paused", json!({ "goal_id": goal_id.clone() }));

                // Wait until unpaused
                while self.is_paused() {
                    sleep(Duration::from_millis(100)).await;
                }

                tracing::info!("[AGI] Goal {} resumed", goal_id);
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
                break;
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
                break;
            }

            // Create plan, potentially informed by previous reflection
            let mut plan = self.planner.create_plan(&context.goal, &context).await?;

            tracing::info!("[AGI] Plan created with {} steps", plan.steps.len());

            if plan.steps.is_empty() {
                tracing::warn!("[AGI] Planner returned empty plan. Assuming blocked or done.");
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

        // MEDIUM-007 fix: Clean up goal from active_goals and execution_contexts
        // This ensures resources are freed regardless of how the goal ended
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

        // Remove from execution_contexts
        if let Ok(mut contexts) =
            lock_with_recovery(&self.execution_contexts, "cleanup_goal:contexts")
        {
            if contexts.remove(goal_id).is_some() {
                tracing::debug!("[AGI] Removed goal {} from execution_contexts", goal_id);
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
        // CRITICAL-001 fix: Use recovery helper
        let mut contexts = lock_with_recovery(&self.execution_contexts, "cancel_goal")?;

        if let Some(context) = contexts.get_mut(goal_id) {
            context.current_state.insert(
                "cancellation_requested".to_string(),
                serde_json::Value::Bool(true),
            );
            tracing::info!("[AGI] Cancellation requested for goal {}", goal_id);
            Ok(())
        } else {
            Err(anyhow!("Goal {} not found", goal_id))
        }
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
        };

        assert_eq!(goal_iteration_limit(&goal), 12);
    }
}
