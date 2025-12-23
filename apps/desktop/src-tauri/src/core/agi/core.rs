use super::*;
use crate::automation::AutomationService;
use crate::core::agi::planner::Plan;
use crate::core::router::LLMRouter;
use anyhow::{anyhow, Result};
use chrono::Utc;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Emitter;
use tokio::time::sleep;

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
    memory: Arc<AGIMemory>,
    learning: Arc<LearningSystem>,
    router: Arc<tokio::sync::Mutex<LLMRouter>>,
    automation: Arc<AutomationService>,
    active_goals: Arc<Mutex<Vec<Goal>>>,
    execution_contexts: Arc<Mutex<HashMap<String, ExecutionContext>>>,
    stop_signal: Arc<Mutex<bool>>,
    pause_signal: Arc<Mutex<bool>>,
    pub(crate) app_handle: Option<tauri::AppHandle>,
    process_reasoning: Option<Arc<ProcessReasoning>>,
    process_ontology: Option<Arc<ProcessOntology>>,
    outcome_tracker: Option<Arc<OutcomeTracker>>,
}

impl AGICore {
    pub fn new(
        config: AGIConfig,
        router: Arc<tokio::sync::Mutex<LLMRouter>>,
        automation: Arc<AutomationService>,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<Self> {
        let tool_registry = Arc::new(ToolRegistry::new()?);
        let knowledge_base = Arc::new(KnowledgeBase::new(config.knowledge_memory_mb)?);
        let resource_manager = Arc::new(ResourceManager::new(config.resource_limits.clone())?);

        let planner = Arc::new(AGIPlanner::new(
            router.clone(),
            tool_registry.clone(),
            knowledge_base.clone(),
        )?);
        let executor = Arc::new(AGIExecutor::new(
            tool_registry.clone(),
            resource_manager.clone(),
            automation.clone(),
            router.clone(),
            app_handle.clone(),
        )?);
        let memory = Arc::new(AGIMemory::new()?);
        let learning = Arc::new(LearningSystem::new(
            config.enable_learning,
            config.enable_self_improvement,
        )?);

        tool_registry.register_all_tools(automation.clone(), router.clone())?;

        Ok(Self {
            config,
            capabilities: AGICapabilities::default(),
            tool_registry,
            knowledge_base,
            resource_manager,
            planner,
            executor,
            memory,
            learning,
            router,
            automation,
            active_goals: Arc::new(Mutex::new(Vec::new())),
            execution_contexts: Arc::new(Mutex::new(HashMap::new())),
            stop_signal: Arc::new(Mutex::new(false)),
            pause_signal: Arc::new(Mutex::new(false)),
            app_handle,
            process_reasoning: None,
            process_ontology: None,
            outcome_tracker: None,
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
        router: Arc<tokio::sync::Mutex<LLMRouter>>,
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

        let executor = Arc::new(AGIExecutor::with_process_reasoning(
            tool_registry.clone(),
            resource_manager.clone(),
            automation.clone(),
            router.clone(),
            app_handle.clone(),
            process_reasoning.clone(),
            outcome_tracker.clone(),
        )?);

        let memory = Arc::new(AGIMemory::new()?);
        let learning = Arc::new(LearningSystem::new(
            config.enable_learning,
            config.enable_self_improvement,
        )?);

        tool_registry.register_all_tools(automation.clone(), router.clone())?;

        Ok(Self {
            config,
            capabilities: AGICapabilities::default(),
            tool_registry,
            knowledge_base,
            resource_manager,
            planner,
            executor,
            memory,
            learning,
            router,
            automation,
            active_goals: Arc::new(Mutex::new(Vec::new())),
            execution_contexts: Arc::new(Mutex::new(HashMap::new())),
            stop_signal: Arc::new(Mutex::new(false)),
            pause_signal: Arc::new(Mutex::new(false)),
            app_handle,
            process_reasoning: Some(process_reasoning),
            process_ontology: Some(process_ontology),
            outcome_tracker: Some(outcome_tracker),
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
        *self
            .stop_signal
            .lock()
            .map_err(|_| anyhow!("Failed to acquire stop signal lock"))? = false;

        loop {
            if *self
                .stop_signal
                .lock()
                .map_err(|_| anyhow!("Failed to acquire stop signal lock"))?
            {
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

        self.active_goals
            .lock()
            .map_err(|_| anyhow!("Failed to acquire active goals lock"))?
            .push(goal.clone());

        let context = ExecutionContext {
            goal: goal.clone(),
            current_state: HashMap::new(),
            available_resources: self.resource_manager.get_state().await?,
            tool_results: Vec::new(),
            context_memory: Vec::new(),
        };

        self.execution_contexts
            .lock()
            .map_err(|_| anyhow!("Failed to acquire execution contexts lock"))?
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

    async fn process_goals(&self) -> Result<()> {
        let goals = self
            .active_goals
            .lock()
            .map_err(|_| anyhow!("Failed to acquire active goals lock"))?
            .clone();

        for goal in goals {
            let context = self
                .execution_contexts
                .lock()
                .map_err(|_| anyhow!("Failed to acquire execution contexts lock"))?
                .get(&goal.id)
                .cloned();

            if let Some(mut ctx) = context {
                ctx.available_resources = self.resource_manager.get_state().await?;
                self.execution_contexts
                    .lock()
                    .map_err(|_| anyhow!("Failed to acquire execution contexts lock"))?
                    .insert(goal.id.clone(), ctx);
            }
        }

        Ok(())
    }

    async fn achieve_goal(&self, goal_id: String) -> Result<()> {
        let mut context = self
            .execution_contexts
            .lock()
            .map_err(|_| anyhow!("Failed to acquire execution contexts lock"))?
            .get(&goal_id)
            .ok_or_else(|| anyhow!("Goal {} not found", goal_id))?
            .clone();

        tracing::info!("[AGI] Achieving goal: {}", context.goal.description);

        let max_iterations = 1000;
        let mut iteration = 0;

        loop {
            if self.is_goal_cancelled(&goal_id).await {
                tracing::info!("[AGI] Goal {} cancelled by user", goal_id);
                self.emit_event("agi:goal:cancelled", json!({ "goal_id": goal_id }));
                break;
            }

            iteration += 1;
            if iteration > max_iterations {
                tracing::warn!(
                    "[AGI] Max iterations ({}) reached for goal {}",
                    max_iterations,
                    goal_id
                );
                break;
            }

            tracing::info!(
                "[AGI] Iteration {}/{} for goal {}",
                iteration,
                max_iterations,
                goal_id
            );

            if self.check_goal_achieved(&context).await? {
                tracing::info!("[AGI] Goal {} achieved (pre-check)!", goal_id);
                self.emit_event(
                    "agi:goal:achieved",
                    json!({
                        "goal_id": goal_id,
                        "total_steps": 0,
                        "completed_steps": 0,
                    }),
                );
                break;
            }

            let plan = self.planner.create_plan(&context.goal, &context).await?;

            tracing::info!("[AGI] Plan created with {} steps", plan.steps.len());

            if plan.steps.is_empty() {
                tracing::warn!("[AGI] Planner returned empty plan. Assuming blocked or done.");

                break;
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
                }),
            );

            let mut plan_interrupted = false;

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

                self.execution_contexts
                    .lock()
                    .map_err(|_| anyhow!("Failed to acquire execution contexts lock"))?
                    .insert(goal_id.clone(), context.clone());

                if self.check_goal_achieved(&context).await? {
                    tracing::info!("[AGI] Goal {} achieved (mid-plan)!", goal_id);
                    self.emit_event(
                        "agi:goal:achieved",
                        json!({
                            "goal_id": goal_id,
                            "total_steps": plan.steps.len(),
                            "completed_steps": index + 1,
                        }),
                    );
                    plan_interrupted = true;
                    break;
                }
            }

            if plan_interrupted {
                break;
            }

            sleep(Duration::from_secs(2)).await;
        }

        Ok(())
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

    async fn update_knowledge(&self) -> Result<()> {
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
            memory: self.memory.clone(),
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
        }
    }

    pub fn stop(&self) {
        if let Ok(mut stop) = self.stop_signal.lock() {
            *stop = true;
        }
    }

    pub fn pause(&self) {
        if let Ok(mut pause) = self.pause_signal.lock() {
            *pause = true;
        }
    }

    pub async fn cancel_goal(&self, goal_id: &str) -> Result<()> {
        let mut contexts = self
            .execution_contexts
            .lock()
            .map_err(|_| anyhow!("Failed to acquire lock"))?;

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

    pub async fn is_goal_cancelled(&self, goal_id: &str) -> bool {
        if let Ok(contexts) = self.execution_contexts.lock() {
            if let Some(context) = contexts.get(goal_id) {
                if let Some(val) = context.current_state.get("cancellation_requested") {
                    return val.as_bool().unwrap_or(false);
                }
            }
        }
        false
    }

    pub fn resume(&self) {
        if let Ok(mut pause) = self.pause_signal.lock() {
            *pause = false;
        }
    }

    pub fn is_paused(&self) -> bool {
        self.pause_signal.lock().map(|p| *p).unwrap_or(false)
    }

    pub fn get_capabilities(&self) -> &AGICapabilities {
        &self.capabilities
    }

    pub fn get_goal_status(&self, goal_id: &str) -> Option<ExecutionContext> {
        self.execution_contexts.lock().ok()?.get(goal_id).cloned()
    }

    pub fn list_goals(&self) -> Vec<Goal> {
        self.active_goals
            .lock()
            .ok()
            .map_or(Vec::new(), |g| g.clone())
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
