use super::*;
use crate::automation::AutomationService;
use crate::router::LLMRouter;
use anyhow::{anyhow, Result};
use serde_json::json;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Emitter;
use tokio::time::sleep;

/// AGI Core - The central intelligence that coordinates all systems
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
    pub(crate) app_handle: Option<tauri::AppHandle>,
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
            app_handle.clone(),
        )?);
        let memory = Arc::new(AGIMemory::new()?);
        let learning = Arc::new(LearningSystem::new(
            config.enable_learning,
            config.enable_self_improvement,
        )?);

        // Register all available tools
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
            app_handle,
        })
    }

    /// Emit an event to the frontend
    fn emit_event(&self, event: &str, payload: serde_json::Value) {
        if let Some(ref app) = self.app_handle {
            if let Err(e) = app.emit(event, payload) {
                tracing::warn!("Failed to emit event {}: {}", event, e);
            }
        }
    }

    /// Start the AGI core loop (runs continuously)
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

            // Check resource availability
            if !self.resource_manager.check_availability().await? {
                tracing::warn!("[AGI] Resources limited, waiting...");
                sleep(Duration::from_secs(1)).await;
                continue;
            }

            // Process active goals
            self.process_goals().await?;

            // Update knowledge base
            self.update_knowledge().await?;

            // Learning and self-improvement
            if self.config.enable_learning {
                self.learning.update().await?;
            }

            sleep(Duration::from_millis(100)).await;
        }

        Ok(())
    }

    /// Submit a goal for the AGI to achieve
    pub async fn submit_goal(&self, goal: Goal) -> Result<String> {
        tracing::info!("[AGI] New goal submitted: {}", goal.description);

        // Emit goal submitted event
        self.emit_event(
            "agi:goal:submitted",
            json!({
                "goal_id": goal.id,
                "description": goal.description,
                "priority": goal.priority,
            }),
        );

        // Store in knowledge base
        self.knowledge_base.add_goal(&goal).await?;

        // Add to active goals
        self.active_goals
            .lock()
            .map_err(|_| anyhow!("Failed to acquire active goals lock"))?
            .push(goal.clone());

        // Create execution context
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

        // Start planning and execution in background
        let goal_id = goal.id.clone();
        let core_clone = self.clone_for_execution();
        // Restore app handle for event emission (clone separately to avoid Send issues)
        let app_handle_clone = self.app_handle.clone();
        let mut core_with_app = core_clone;
        core_with_app.app_handle = app_handle_clone;
        let goal_id_for_spawn = goal_id.clone();
        // Use tokio::spawn instead of tauri::async_runtime::spawn to avoid Send issues
        tokio::spawn(async move {
            if let Err(e) = core_with_app.achieve_goal(goal_id_for_spawn).await {
                tracing::error!("[AGI] Goal execution failed: {}", e);
            }
        });

        Ok(goal.id)
    }

    /// Process all active goals
    async fn process_goals(&self) -> Result<()> {
        let goals = self
            .active_goals
            .lock()
            .map_err(|_| anyhow!("Failed to acquire active goals lock"))?
            .clone();

        for goal in goals {
            // Check if goal is still active
            let context = self
                .execution_contexts
                .lock()
                .map_err(|_| anyhow!("Failed to acquire execution contexts lock"))?
                .get(&goal.id)
                .cloned();

            if let Some(mut ctx) = context {
                // Update context with current state
                ctx.available_resources = self.resource_manager.get_state().await?;
                self.execution_contexts
                    .lock()
                    .map_err(|_| anyhow!("Failed to acquire execution contexts lock"))?
                    .insert(goal.id.clone(), ctx);
            }
        }

        Ok(())
    }

    /// Achieve a specific goal
    async fn achieve_goal(&self, goal_id: String) -> Result<()> {
        let mut context = self
            .execution_contexts
            .lock()
            .unwrap()
            .get(&goal_id)
            .ok_or_else(|| anyhow!("Goal {} not found", goal_id))?
            .clone();

        tracing::info!("[AGI] Achieving goal: {}", context.goal.description);

        // Plan the approach
        let plan = self.planner.create_plan(&context.goal, &context).await?;

        tracing::info!("[AGI] Plan created with {} steps", plan.steps.len());

        // Emit plan created event
        self.emit_event(
            "agi:goal:plan_created",
            json!({
                "goal_id": goal_id,
                "total_steps": plan.steps.len(),
                "estimated_duration_ms": plan.estimated_duration.as_millis(),
            }),
        );

        // Execute the plan
        for (index, step) in plan.steps.iter().enumerate() {
            tracing::info!(
                "[AGI] Executing step {}/{}: {}",
                index + 1,
                plan.steps.len(),
                step.description
            );

            // Emit step started event
            self.emit_event(
                "agi:goal:step_started",
                json!({
                    "goal_id": goal_id,
                    "step_id": step.id,
                    "step_index": index,
                    "total_steps": plan.steps.len(),
                    "description": step.description,
                }),
            );

            // Check resources before execution
            if !self
                .resource_manager
                .reserve_resources(&step.estimated_resources)
                .await?
            {
                tracing::warn!("[AGI] Insufficient resources for step, waiting...");
                sleep(Duration::from_secs(1)).await;
                continue;
            }

            // Execute step
            let start = std::time::Instant::now();
            let result = self.executor.execute_step(step, &context).await;
            let execution_time = start.elapsed();

            // Release resources
            self.resource_manager
                .release_resources(&step.estimated_resources)
                .await?;

            // Record result
            let tool_result = ToolExecutionResult {
                tool_id: step.tool_id.clone(),
                success: result.is_ok(),
                result: result
                    .as_ref()
                    .ok()
                    .cloned()
                    .unwrap_or(serde_json::Value::Null),
                error: result.err().map(|e| e.to_string()),
                execution_time_ms: execution_time.as_millis() as u64,
                resources_used: step.estimated_resources.clone(),
            };

            // Emit step completed event
            self.emit_event(
                "agi:goal:step_completed",
                json!({
                    "goal_id": goal_id,
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
                    .unwrap()
                    .as_secs(),
                event: format!("step_{}_executed", index),
                data: serde_json::to_value(&tool_result)?,
            });

            // Update knowledge base with result
            self.knowledge_base
                .add_experience(&context.goal, &tool_result)
                .await?;

            // Learn from result
            if self.config.enable_learning {
                self.learning.record_experience(step, &tool_result).await?;
            }

            // Emit progress update
            self.emit_event("agi:goal:progress", json!({
                "goal_id": goal_id,
                "completed_steps": index + 1,
                "total_steps": plan.steps.len(),
                "progress_percent": ((index + 1) as f64 / plan.steps.len() as f64 * 100.0) as u32,
            }));

            // Check if goal is achieved
            if self.check_goal_achieved(&context).await? {
                tracing::info!("[AGI] Goal {} achieved!", goal_id);

                // Emit goal achieved event
                self.emit_event(
                    "agi:goal:achieved",
                    json!({
                        "goal_id": goal_id,
                        "total_steps": plan.steps.len(),
                        "completed_steps": index + 1,
                    }),
                );

                break;
            }

            // Update context
            self.execution_contexts
                .lock()
                .unwrap()
                .insert(goal_id.clone(), context.clone());
        }

        Ok(())
    }

    /// Check if goal has been achieved
    async fn check_goal_achieved(&self, context: &ExecutionContext) -> Result<bool> {
        // Check success criteria
        for criterion in &context.goal.success_criteria {
            // Use LLM to evaluate if criterion is met
            let evaluation = self.planner.evaluate_criterion(criterion, context).await?;

            if !evaluation {
                return Ok(false);
            }
        }

        Ok(true)
    }

    /// Update knowledge base with new information
    async fn update_knowledge(&self) -> Result<()> {
        // Extract insights from recent executions
        // Update knowledge base
        // This runs periodically to keep knowledge fresh
        Ok(())
    }

    /// Clone core for execution (creates new instance with shared state)
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
            app_handle: None, // Don't clone app handle (not Send) - events will be emitted from main thread
        }
    }

    /// Stop the AGI core
    pub fn stop(&self) {
        if let Ok(mut stop) = self.stop_signal.lock() {
            *stop = true;
        }
    }

    /// Get current capabilities
    pub fn get_capabilities(&self) -> &AGICapabilities {
        &self.capabilities
    }

    /// Get goal status
    pub fn get_goal_status(&self, goal_id: &str) -> Option<ExecutionContext> {
        self.execution_contexts
            .lock()
            .ok()?
            .get(goal_id)
            .cloned()
    }

    /// List all active goals
    pub fn list_goals(&self) -> Vec<Goal> {
        self.active_goals.lock().ok().map_or(Vec::new(), |g| g.clone())
    }
}
