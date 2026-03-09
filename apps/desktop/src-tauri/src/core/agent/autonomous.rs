use super::*;
use crate::automation::browser::PlaywrightBridge;
use crate::automation::AutomationService;
use crate::core::llm::LLMRouter;
use anyhow::{anyhow, Result};
use dashmap::DashMap;
use once_cell::sync::Lazy;
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;
use tokio::sync::{oneshot, Mutex as TokioMutex, Notify, RwLock};
use tokio::time::sleep;

use super::background_tasks::{AutonomousTaskCheckpoint, TaskStorage};

const MAX_SELF_HEAL_RETRIES: usize = 3;
const MAX_PENDING_TASKS: usize = 500;
const MAX_REPLAN_COUNT: usize = 2;
/// Timeout for waiting on user approval before the task is automatically failed.
const APPROVAL_TIMEOUT_SECS: u64 = 300;
/// Safety-net cap on autonomous loop iterations to prevent runaway execution.
const MAX_LOOP_ITERATIONS: usize = 25;
/// Emit a budget warning event when cumulative cost reaches this fraction of the session cap.
const BUDGET_WARNING_THRESHOLD: f64 = 0.80;
/// Maximum number of step outcomes to include in the LLM feedback prompt to avoid
/// exceeding context limits on smaller models.
const MAX_FEEDBACK_HISTORY: usize = 20;

/// Tracks a completed step's description and its execution result so that
/// subsequent LLM consultations have full context of what happened.
#[derive(Debug, Clone)]
struct StepOutcome {
    step_id: String,
    description: String,
    result: String,
}

/// Global registry of pending task approvals.
///
/// When the autonomous agent suspends a task awaiting user approval, it inserts
/// a `oneshot::Sender<bool>` here keyed by task ID. The `resolve_task_approval`
/// Tauri command looks up the sender and delivers the user's decision, waking
/// the suspended task.
pub static PENDING_TASK_APPROVALS: Lazy<DashMap<String, oneshot::Sender<bool>>> =
    Lazy::new(DashMap::new);

pub struct AutonomousAgent {
    config: AgentConfig,
    automation: Arc<AutomationService>,
    router: Arc<RwLock<LLMRouter>>,
    planner: TaskPlanner,
    executor: TaskExecutor,
    vision: VisionAutomation,
    approval: ApprovalManager,
    task_queue: Arc<parking_lot::Mutex<Vec<Task>>>,
    running_tasks: Arc<parking_lot::Mutex<Vec<String>>>,
    stop_signal: Arc<parking_lot::Mutex<bool>>,
    /// Notified when a task reaches a terminal state, waking `run_goal` waiters.
    task_notify: Arc<Notify>,
    app_handle: Option<tauri::AppHandle>,
    /// Optional persistent storage for autonomous task checkpoints.
    /// When set, the agent saves a checkpoint after each successful step
    /// so tasks can be resumed across app restarts.
    task_storage: Option<Arc<TaskStorage>>,
    /// Optional CDP browser bridge for in-process navigation.
    /// Shared with the `TaskExecutor` so Navigate actions target the CDP-controlled browser.
    browser_bridge: Option<Arc<TokioMutex<PlaywrightBridge>>>,
}

impl AutonomousAgent {
    pub fn new(
        config: AgentConfig,
        automation: Arc<AutomationService>,
        router: Arc<RwLock<LLMRouter>>,
    ) -> Result<Self> {
        Self::with_browser_bridge(config, automation, router, None)
    }

    /// Creates an `AutonomousAgent` with an optional CDP browser bridge.
    /// When provided, `Action::Navigate` uses CDP instead of OS-level open.
    pub fn with_browser_bridge(
        config: AgentConfig,
        automation: Arc<AutomationService>,
        router: Arc<RwLock<LLMRouter>>,
        browser_bridge: Option<Arc<TokioMutex<PlaywrightBridge>>>,
    ) -> Result<Self> {
        let planner = TaskPlanner::new(router.clone())?;
        let executor = TaskExecutor::new(automation.clone(), browser_bridge.clone())?;
        let vision = VisionAutomation::new()?;
        let approval = ApprovalManager::new(config.clone());

        Ok(Self {
            config,
            automation,
            router,
            planner,
            executor,
            vision,
            approval,
            task_queue: Arc::new(parking_lot::Mutex::new(Vec::new())),
            running_tasks: Arc::new(parking_lot::Mutex::new(Vec::new())),
            stop_signal: Arc::new(parking_lot::Mutex::new(false)),
            task_notify: Arc::new(Notify::new()),
            app_handle: None,
            task_storage: None,
            browser_bridge,
        })
    }

    /// Set the Tauri AppHandle so the agent can emit events to the frontend.
    pub fn set_app_handle(&mut self, handle: tauri::AppHandle) {
        self.app_handle = Some(handle);
    }

    /// Set persistent storage for autonomous task checkpoints.
    /// When set, the agent saves a checkpoint after each successful step.
    pub fn set_task_storage(&mut self, storage: Arc<TaskStorage>) {
        self.task_storage = Some(storage);
    }

    pub async fn start(&self) -> Result<()> {
        self.run_autonomous_loop().await
    }

    pub async fn run_autonomous_loop(&self) -> Result<()> {
        tracing::info!("[Agent] Starting autonomous agent loop");
        *self.stop_signal.lock() = false;

        let mut iteration: usize = 0;
        let mut budget_warning_emitted = false;

        loop {
            if *self.stop_signal.lock() {
                tracing::info!("[Agent] Stop signal received, shutting down");
                break;
            }

            // Safety-net iteration cap to prevent runaway loops.
            iteration += 1;
            if iteration > MAX_LOOP_ITERATIONS {
                tracing::warn!(
                    "[Agent] Iteration limit ({}) reached, shutting down autonomous loop",
                    MAX_LOOP_ITERATIONS
                );
                if let Some(ref handle) = self.app_handle {
                    if let Err(e) = handle.emit(
                        "agent:loop-iteration-limit",
                        json!({
                            "maxIterations": MAX_LOOP_ITERATIONS,
                            "message": format!(
                                "Autonomous loop stopped after {} iterations (safety limit)",
                                MAX_LOOP_ITERATIONS
                            )
                        }),
                    ) {
                        tracing::warn!("Failed to emit agent:loop-iteration-limit: {}", e);
                    }
                }
                break;
            }

            // Per-iteration budget check: compare cumulative cost against session cap.
            let cumulative_cost = self.router.read().await.get_cumulative_cost();
            if cumulative_cost > self.config.max_session_cost {
                tracing::warn!(
                    "[Agent] Session budget exceeded (${:.2} > ${:.2}), stopping autonomous loop",
                    cumulative_cost,
                    self.config.max_session_cost
                );
                if let Some(ref handle) = self.app_handle {
                    if let Err(e) = handle.emit(
                        "agent:budget-exceeded",
                        json!({
                            "cumulativeCost": cumulative_cost,
                            "sessionLimit": self.config.max_session_cost,
                            "message": format!(
                                "Budget exceeded: ${:.2} spent of ${:.2} limit",
                                cumulative_cost, self.config.max_session_cost
                            )
                        }),
                    ) {
                        tracing::warn!("Failed to emit agent:budget-exceeded: {}", e);
                    }
                }
                break;
            }

            // Emit a one-time warning when approaching the budget threshold.
            if !budget_warning_emitted
                && cumulative_cost > self.config.max_session_cost * BUDGET_WARNING_THRESHOLD
            {
                budget_warning_emitted = true;
                let pct = (cumulative_cost / self.config.max_session_cost * 100.0) as u32;
                tracing::warn!(
                    "[Agent] Budget warning: ${:.2} spent ({}% of ${:.2} limit)",
                    cumulative_cost,
                    pct,
                    self.config.max_session_cost
                );
                if let Some(ref handle) = self.app_handle {
                    if let Err(e) = handle.emit(
                        "agent:budget-warning",
                        json!({
                            "cumulativeCost": cumulative_cost,
                            "sessionLimit": self.config.max_session_cost,
                            "percentUsed": pct,
                            "message": format!(
                                "Budget warning: {}% of session limit used (${:.2} of ${:.2})",
                                pct, cumulative_cost, self.config.max_session_cost
                            )
                        }),
                    ) {
                        tracing::warn!("Failed to emit agent:budget-warning: {}", e);
                    }
                }
            }

            if !self.check_resource_limits().await? {
                tracing::warn!("[Agent] Resource limits exceeded, pausing");
                sleep(Duration::from_secs(5)).await;
                continue;
            }

            self.process_task_queue().await?;

            sleep(Duration::from_millis(50)).await;
        }

        Ok(())
    }

    pub fn stop(&self) {
        tracing::info!("[Agent] Stopping autonomous agent");
        *self.stop_signal.lock() = true;
    }

    pub async fn submit_task(
        &self,
        description: String,
        auto_approve: Option<bool>,
    ) -> Result<String> {
        let task_id = format!("task_{}", &uuid::Uuid::new_v4().to_string()[..12]);
        let auto_approve = auto_approve.unwrap_or(self.config.auto_approve);

        tracing::info!("[Agent] Planning task: {}", description);
        let steps = self.planner.plan_task(&description).await?;

        let task = Task {
            id: task_id.clone(),
            description,
            status: TaskStatus::Pending,
            created_at: std::time::Instant::now(),
            updated_at: std::time::Instant::now(),
            steps,
            current_step: 0,
            max_retries: self.config.max_retries,
            retry_count: 0,
            replan_count: 0,
            requires_approval: !auto_approve,
            auto_approve,
        };

        {
            let mut queue = self.task_queue.lock();
            let pending_count = queue
                .iter()
                .filter(|t| matches!(t.status, TaskStatus::Pending | TaskStatus::WaitingApproval))
                .count();
            if pending_count >= MAX_PENDING_TASKS {
                return Err(anyhow!(
                    "Task queue full ({} pending tasks)",
                    MAX_PENDING_TASKS
                ));
            }
            queue.push(task);
        }

        tracing::info!("[Agent] Task {} queued for execution", task_id);
        Ok(task_id)
    }

    /// Convenience method for background agents: plans and executes a goal
    /// synchronously (blocks until complete or fails). Returns a human-readable
    /// completion message.
    ///
    /// This combines submit_task + process_task_queue polling into a single call.
    /// Uses auto_approve=true since background agents run unattended.
    pub async fn run_goal(&self, goal: String) -> Result<String> {
        let task_id = self.submit_task(goal, Some(true)).await?;

        let timeout = std::time::Duration::from_secs(86400); // 24h max
        let start = std::time::Instant::now();

        loop {
            if start.elapsed() > timeout {
                return Err(anyhow!("run_goal timed out after 24 hours"));
            }

            // Process one cycle of the task queue
            self.process_task_queue().await?;

            // Check if our task is done
            if let Some(task) = self.get_task_status(&task_id)? {
                match &task.status {
                    TaskStatus::Completed => {
                        return Ok(format!("Task completed: {}", task.description));
                    }
                    TaskStatus::Failed(err) => {
                        return Err(anyhow!("Task failed: {}", err));
                    }
                    TaskStatus::Cancelled => {
                        return Err(anyhow!("Task was cancelled"));
                    }
                    _ => {
                        // Still running — wait for notification instead of busy-polling
                    }
                }
            } else {
                return Err(anyhow!("Task {} disappeared from queue", task_id));
            }

            // Wait for a task to change state, with a 5s fallback to re-check
            tokio::time::timeout(
                std::time::Duration::from_secs(5),
                self.task_notify.notified(),
            )
            .await
            .ok(); // timeout is fine — just re-loop and check
        }
    }

    pub(crate) async fn process_task_queue(&self) -> Result<()> {
        {
            let running = self.running_tasks.lock();
            if running.len() >= self.config.max_concurrent_tasks {
                return Ok(());
            }
        }

        let (task_id, requires_approval_check) = {
            let mut queue = self.task_queue.lock();
            if let Some(task) = queue.iter_mut().find(|t| t.status == TaskStatus::Pending) {
                let task_id = task.id.clone();
                let requires_approval = task.requires_approval && !task.auto_approve;
                task.status = TaskStatus::Planning;
                (task_id, requires_approval)
            } else {
                return Ok(());
            }
        };

        if requires_approval_check {
            let task_clone = {
                let queue = self.task_queue.lock();
                queue.iter().find(|t| t.id == task_id).cloned()
            };

            if let Some(task) = task_clone {
                if !self.approval.should_approve(&task).await? {
                    tracing::info!(
                        "[Agent] Task {} requires approval, suspending until user responds",
                        task_id
                    );

                    // Create a oneshot channel so the Tauri command
                    // `resolve_task_approval` can wake us up.
                    let (tx, rx) = oneshot::channel::<bool>();
                    PENDING_TASK_APPROVALS.insert(task_id.clone(), tx);

                    {
                        let mut queue = self.task_queue.lock();
                        if let Some(t) = queue.iter_mut().find(|t| t.id == task_id) {
                            t.status = TaskStatus::WaitingApproval;
                        }
                    }

                    // Emit an event so the frontend knows a task needs approval.
                    if let Some(ref handle) = self.app_handle {
                        if let Err(e) = handle.emit(
                            "agent:task_approval_required",
                            json!({
                                "task_id": task_id,
                                "description": task.description,
                            }),
                        ) {
                            tracing::warn!("Failed to emit agent:task_approval_required: {}", e);
                        }
                    }

                    // Spawn a background future that awaits the user decision
                    // (with timeout), then resumes or fails the task.
                    let agent_clone = self.clone_for_task()?;
                    let approval_task_id = task_id.clone();
                    self.running_tasks.lock().push(task_id);

                    tokio::spawn(async move {
                        let approved = match tokio::time::timeout(
                            Duration::from_secs(APPROVAL_TIMEOUT_SECS),
                            rx,
                        )
                        .await
                        {
                            Ok(Ok(v)) => v,
                            Ok(Err(_)) => {
                                tracing::warn!(
                                    "[Agent] Approval channel dropped for task {}",
                                    approval_task_id
                                );
                                false
                            }
                            Err(_) => {
                                PENDING_TASK_APPROVALS.remove(&approval_task_id);
                                tracing::warn!(
                                    "[Agent] Approval timeout ({}s) for task {}",
                                    APPROVAL_TIMEOUT_SECS,
                                    approval_task_id
                                );
                                false
                            }
                        };

                        if approved {
                            tracing::info!(
                                "[Agent] Task {} approved, resuming execution",
                                approval_task_id
                            );
                            {
                                let mut queue = agent_clone.task_queue.lock();
                                if let Some(t) = queue.iter_mut().find(|t| t.id == approval_task_id)
                                {
                                    t.status = TaskStatus::Planning;
                                }
                            }
                            if let Err(e) = agent_clone.execute_task(approval_task_id.clone()).await
                            {
                                tracing::error!(
                                    "[Agent] Task {} failed after approval: {}",
                                    approval_task_id,
                                    e
                                );
                                // Clean up running_tasks slot on error
                                agent_clone
                                    .running_tasks
                                    .lock()
                                    .retain(|id| id != &approval_task_id);
                            }
                        } else {
                            tracing::info!(
                                "[Agent] Task {} rejected or timed out",
                                approval_task_id
                            );
                            {
                                let mut queue = agent_clone.task_queue.lock();
                                if let Some(t) = queue.iter_mut().find(|t| t.id == approval_task_id)
                                {
                                    t.status = TaskStatus::Failed(
                                        "Task approval denied or timed out".to_string(),
                                    );
                                }
                            }
                            agent_clone
                                .running_tasks
                                .lock()
                                .retain(|id| id != &approval_task_id);
                        }
                    });

                    return Ok(());
                }
            }
        }

        let agent_clone = self.clone_for_task()?;

        // Push task_id to running_tasks AFTER clone_for_task succeeds to avoid
        // leaking a slot if clone_for_task fails.
        self.running_tasks.lock().push(task_id.clone());
        let task_id_clone = task_id;
        tokio::spawn(async move {
            if let Err(e) = agent_clone.execute_task(task_id_clone.clone()).await {
                tracing::error!("[Agent] Task execution failed: {}", e);
                // Clean up running_tasks slot on error (mirrors the approval path)
                agent_clone
                    .running_tasks
                    .lock()
                    .retain(|id| id != &task_id_clone);
            }
        });

        Ok(())
    }

    pub async fn execute_task(&self, task_id: String) -> Result<()> {
        let mut task = {
            let mut queue = self.task_queue.lock();
            queue
                .iter_mut()
                .find(|t| t.id == task_id)
                .ok_or_else(|| anyhow!("Task {} not found", task_id))?
                .clone()
        };

        task.status = TaskStatus::Executing;
        tracing::info!("[Agent] Executing task {}: {}", task_id, task.description);

        // P1: Capture cost before this task starts for per-task cost cap enforcement
        let cost_before_task = self.router.read().await.get_cumulative_cost();

        // Track completed step summaries for replanning context
        let mut completed_summaries: Vec<String> = Vec::new();

        // H3 fix: Track step outcomes (description + result) for LLM feedback loop.
        // After each successful step, the LLM is consulted with the full execution
        // history so it can adjust remaining steps based on actual tool output.
        let mut step_outcomes: Vec<StepOutcome> = Vec::new();

        let mut step_index = 0usize;
        while step_index < task.steps.len() {
            let step = task.steps[step_index].clone();
            let total_steps = task.steps.len();
            task.current_step = step_index;
            task.updated_at = std::time::Instant::now();

            // Pre-step budget gate: check cumulative cost BEFORE making the next LLM call.
            let pre_step_cost = self.router.read().await.get_cumulative_cost();
            let task_cost_so_far = pre_step_cost - cost_before_task;
            if task_cost_so_far > self.config.max_cost_per_task {
                task.status = TaskStatus::Failed(format!(
                    "Task cost cap exceeded before step {}: ${:.2} > ${:.2} limit",
                    step_index, task_cost_so_far, self.config.max_cost_per_task
                ));
                tracing::warn!(
                    "[Agent] Task {} budget gate: ${:.2} exceeds per-task cap ${:.2} before step {}",
                    task_id,
                    task_cost_so_far,
                    self.config.max_cost_per_task,
                    step_index
                );
                break;
            }
            if pre_step_cost > self.config.max_session_cost {
                task.status = TaskStatus::Failed(format!(
                    "Session cost cap exceeded before step {}: ${:.2} > ${:.2} limit",
                    step_index, pre_step_cost, self.config.max_session_cost
                ));
                tracing::warn!(
                    "[Agent] Task {} budget gate: session cost ${:.2} exceeds cap ${:.2} before step {}",
                    task_id,
                    pre_step_cost,
                    self.config.max_session_cost,
                    step_index
                );
                break;
            }

            // BUG-02 fix: emit step-started event to frontend
            if let Some(ref handle) = self.app_handle {
                if let Err(e) = handle.emit(
                    "agent:step-started",
                    json!({
                        "taskId": task.id,
                        "step": step.description,
                        "stepIndex": step_index,
                        "totalSteps": total_steps
                    }),
                ) {
                    tracing::warn!("Failed to emit agent:step-started: {}", e);
                }
            }

            {
                let mut queue = self.task_queue.lock();
                if let Some(t) = queue.iter_mut().find(|t| t.id == task_id) {
                    *t = task.clone();
                }
            }

            let mut attempt = 0usize;
            let mut step_succeeded = false;
            loop {
                attempt += 1;
                let step_result = self.executor.execute_step(&step, &self.vision).await;

                match step_result {
                    Ok(result) if result.success => {
                        let result_text = result.result.as_deref().unwrap_or("OK").to_string();
                        tracing::info!(
                            "[Agent] Step {} completed: {}",
                            step.id,
                            result_text
                        );
                        // BUG-02 fix: emit step-completed event to frontend
                        if let Some(ref handle) = self.app_handle {
                            if let Err(e) = handle.emit(
                                "agent:step-completed",
                                json!({
                                    "taskId": task.id,
                                    "step": step.description,
                                    "result": result_text,
                                    "stepIndex": step_index
                                }),
                            ) {
                                tracing::warn!("Failed to emit agent:step-completed: {}", e);
                            }
                        }
                        completed_summaries.push(format!("{}: {}", step.id, step.description));

                        // H3 fix: record the step outcome for LLM feedback
                        step_outcomes.push(StepOutcome {
                            step_id: step.id.clone(),
                            description: step.description.clone(),
                            result: result_text,
                        });

                        step_succeeded = true;
                        break;
                    }
                    Ok(result) => {
                        let error_msg = result
                            .error
                            .as_deref()
                            .unwrap_or("Unknown error")
                            .to_string();
                        let will_retry =
                            task.retry_count < task.max_retries && attempt <= MAX_SELF_HEAL_RETRIES;
                        tracing::warn!("[Agent] Step {} failed: {}", step.id, error_msg);
                        // BUG-02 fix: emit step-failed event to frontend
                        if let Some(ref handle) = self.app_handle {
                            if let Err(e) = handle.emit(
                                "agent:step-failed",
                                json!({
                                    "taskId": task.id,
                                    "step": step.description,
                                    "error": error_msg,
                                    "attempt": attempt,
                                    "retrying": will_retry
                                }),
                            ) {
                                tracing::warn!("Failed to emit agent:step-failed: {}", e);
                            }
                        }
                        if will_retry {
                            task.retry_count += 1;

                            // BUG-01 fix: On the 2nd retry attempt, ask the LLM
                            // to replan instead of blindly retrying the same step.
                            if attempt == 2 && task.replan_count < MAX_REPLAN_COUNT {
                                match self
                                    .replan_on_failure(
                                        &step.description,
                                        &error_msg,
                                        &completed_summaries,
                                        &task.description,
                                    )
                                    .await
                                {
                                    Ok(new_steps) => {
                                        if new_steps.is_empty() {
                                            tracing::warn!("[Agent] Replan returned 0 steps, falling back to blind retry");
                                            continue;
                                        }
                                        tracing::info!(
                                            "[Agent] Replan succeeded ({} new steps, replan {}/{})",
                                            new_steps.len(),
                                            task.replan_count + 1,
                                            MAX_REPLAN_COUNT
                                        );
                                        task.steps.truncate(step_index);
                                        task.steps.extend(new_steps);
                                        task.retry_count = 0;
                                        task.replan_count += 1;
                                        // Break inner loop; outer while-loop will
                                        // pick up the first replanned step at step_index.
                                        break;
                                    }
                                    Err(e) => {
                                        tracing::warn!(
                                            "[Agent] Replan failed ({}), falling back to blind retry",
                                            e
                                        );
                                        continue;
                                    }
                                }
                            }

                            tracing::info!(
                                "[Agent] Self-correcting step {} (attempt {}/{})",
                                step.id,
                                attempt,
                                MAX_SELF_HEAL_RETRIES
                            );
                            continue;
                        } else {
                            task.status = TaskStatus::Failed(format!(
                                "Step {} failed: {}",
                                step.id, error_msg
                            ));
                            break;
                        }
                    }
                    Err(e) => {
                        let error_msg = e.to_string();
                        let will_retry =
                            task.retry_count < task.max_retries && attempt <= MAX_SELF_HEAL_RETRIES;
                        tracing::error!("[Agent] Step {} error: {}", step.id, error_msg);
                        // BUG-02 fix: emit step-failed event to frontend
                        if let Some(ref handle) = self.app_handle {
                            if let Err(e) = handle.emit(
                                "agent:step-failed",
                                json!({
                                    "taskId": task.id,
                                    "step": step.description,
                                    "error": error_msg,
                                    "attempt": attempt,
                                    "retrying": will_retry
                                }),
                            ) {
                                tracing::warn!("Failed to emit agent:step-failed: {}", e);
                            }
                        }
                        if will_retry {
                            task.retry_count += 1;

                            // BUG-01 fix: On the 2nd retry attempt, ask the LLM
                            // to replan instead of blindly retrying the same step.
                            if attempt == 2 && task.replan_count < MAX_REPLAN_COUNT {
                                match self
                                    .replan_on_failure(
                                        &step.description,
                                        &error_msg,
                                        &completed_summaries,
                                        &task.description,
                                    )
                                    .await
                                {
                                    Ok(new_steps) => {
                                        if new_steps.is_empty() {
                                            tracing::warn!("[Agent] Replan returned 0 steps, falling back to blind retry");
                                            continue;
                                        }
                                        tracing::info!(
                                            "[Agent] Replan succeeded ({} new steps, replan {}/{})",
                                            new_steps.len(),
                                            task.replan_count + 1,
                                            MAX_REPLAN_COUNT
                                        );
                                        task.steps.truncate(step_index);
                                        task.steps.extend(new_steps);
                                        task.retry_count = 0;
                                        task.replan_count += 1;
                                        break;
                                    }
                                    Err(replan_err) => {
                                        tracing::warn!(
                                            "[Agent] Replan failed ({}), falling back to blind retry",
                                            replan_err
                                        );
                                        continue;
                                    }
                                }
                            }

                            tracing::warn!(
                                "[Agent] Retrying step {} after error (attempt {}/{})",
                                step.id,
                                attempt,
                                MAX_SELF_HEAL_RETRIES
                            );
                            continue;
                        } else {
                            task.status = TaskStatus::Failed(error_msg);
                            break;
                        }
                    }
                }
            }

            if matches!(task.status, TaskStatus::Failed(_)) {
                break;
            }

            // P1: Check cost caps after each successful step
            if step_succeeded {
                let current_cost = self.router.read().await.get_cumulative_cost();
                let task_cost = current_cost - cost_before_task;
                if task_cost > self.config.max_cost_per_task {
                    task.status = TaskStatus::Failed(format!(
                        "Task cost cap exceeded: ${:.2} > ${:.2} limit",
                        task_cost, self.config.max_cost_per_task
                    ));
                    tracing::warn!(
                        "[Agent] Task {} aborted: cost ${:.2} exceeds per-task cap ${:.2}",
                        task_id,
                        task_cost,
                        self.config.max_cost_per_task
                    );
                    break;
                }
                if current_cost > self.config.max_session_cost {
                    task.status = TaskStatus::Failed(format!(
                        "Session cost cap exceeded: ${:.2} > ${:.2} limit",
                        current_cost, self.config.max_session_cost
                    ));
                    tracing::warn!(
                        "[Agent] Task {} aborted: session cost ${:.2} exceeds cap ${:.2}",
                        task_id,
                        current_cost,
                        self.config.max_session_cost
                    );
                    break;
                }
            }

            // H3 fix: After a successful step, feed the result back to the LLM
            // so it can adjust remaining steps based on actual tool output.
            // Only consult if there are remaining steps to potentially revise.
            if step_succeeded && step_index + 1 < task.steps.len() {
                match self
                    .consult_llm_after_step(
                        &task.description,
                        &step_outcomes,
                        &task.steps[step_index + 1..],
                    )
                    .await
                {
                    Ok(Some(revised_steps)) => {
                        if !revised_steps.is_empty() {
                            tracing::info!(
                                "[Agent] LLM feedback revised remaining plan: {} steps (was {})",
                                revised_steps.len(),
                                task.steps.len() - step_index - 1
                            );
                            task.steps.truncate(step_index + 1);
                            task.steps.extend(revised_steps);
                        }
                    }
                    Ok(None) => {
                        // LLM confirmed the existing plan is fine, continue as-is
                    }
                    Err(e) => {
                        // Non-fatal: if the feedback call fails, continue with
                        // the original plan rather than aborting the task.
                        tracing::warn!(
                            "[Agent] LLM feedback consultation failed ({}), continuing with original plan",
                            e
                        );
                    }
                }
            }

            // Only advance to next step if the current step actually succeeded.
            // If we broke out of the inner loop due to replanning, step_succeeded
            // will be false and we re-execute at the same step_index (which now
            // points to the first replanned step).
            if step_succeeded {
                step_index += 1;

                // P5D: Save a checkpoint after each successful step so the task
                // can be resumed if the app restarts or the user pauses.
                if let Some(ref storage) = self.task_storage {
                    let current_cost = self.router.read().await.get_cumulative_cost();
                    let steps_json = serde_json::to_string(&task.steps).unwrap_or_default();
                    let summaries_json =
                        serde_json::to_string(&completed_summaries).unwrap_or_default();
                    let checkpoint = AutonomousTaskCheckpoint::new(
                        task.id.clone(),
                        task.description.clone(),
                        steps_json,
                        step_index as i32,
                        task.steps.len() as i32,
                        task.retry_count as i32,
                        task.replan_count as i32,
                        task.auto_approve,
                        current_cost - cost_before_task,
                        summaries_json,
                        "[]".to_string(),
                        "executing".to_string(),
                    );
                    if let Err(e) = storage.save_autonomous_checkpoint(&checkpoint) {
                        tracing::warn!(
                            "[Agent] Failed to save autonomous checkpoint for task {}: {}",
                            task_id,
                            e
                        );
                    } else {
                        tracing::debug!(
                            "[Agent] Checkpoint saved for task {} at step {}/{}",
                            task_id,
                            step_index,
                            task.steps.len()
                        );
                    }
                }
            }

            sleep(Duration::from_millis(75)).await;
        }

        // BUG-02 fix: count completed steps for the task-completed event
        let completed_count = if task.status == TaskStatus::Executing {
            task.steps.len()
        } else {
            task.current_step
        };

        if task.status == TaskStatus::Executing {
            task.status = TaskStatus::Completed;
        }

        // BUG-02 fix: emit task-completed or task-failed event to frontend
        if let Some(ref handle) = self.app_handle {
            let emit_result = match &task.status {
                TaskStatus::Completed => handle.emit(
                    "agent:task-completed",
                    json!({
                        "taskId": task.id,
                        "success": true,
                        "stepsCompleted": completed_count
                    }),
                ),
                TaskStatus::Failed(error_message) => handle.emit(
                    "agent:task-failed",
                    json!({
                        "taskId": task.id,
                        "error": error_message
                    }),
                ),
                _ => Ok(()),
            };
            if let Err(e) = emit_result {
                tracing::warn!("Failed to emit agent task status event: {}", e);
            }
        }

        {
            let mut queue = self.task_queue.lock();
            if let Some(t) = queue.iter_mut().find(|t| t.id == task_id) {
                // TOCTOU guard: only write back if the in-queue task's status
                // hasn't been mutated concurrently (e.g. by an approval handler).
                // If someone else changed the status while we were executing,
                // preserve their update instead of blindly overwriting.
                let status_unchanged = std::mem::discriminant(&t.status)
                    == std::mem::discriminant(&TaskStatus::Executing)
                    || std::mem::discriminant(&t.status)
                        == std::mem::discriminant(&TaskStatus::Planning);
                if status_unchanged {
                    *t = task.clone();
                } else {
                    tracing::info!(
                        "[Agent] Task {} status was concurrently changed to {:?}, skipping write-back",
                        task_id,
                        t.status
                    );
                }
            }
        }

        self.running_tasks.lock().retain(|id| id != &task_id);

        // Wake any `run_goal` waiters now that this task reached a terminal state.
        self.task_notify.notify_waiters();

        // BUG-05 fix: evict old terminal tasks to prevent unbounded task_queue growth.
        // Keep the 50 most-recently completed/failed tasks for status queries; anything
        // beyond that is evicted oldest-first.
        {
            const MAX_TERMINAL_TASKS: usize = 50;
            let mut queue = self.task_queue.lock();
            let terminal_count = queue
                .iter()
                .filter(|t| matches!(t.status, TaskStatus::Completed | TaskStatus::Failed(_)))
                .count();
            if terminal_count > MAX_TERMINAL_TASKS {
                let to_remove = terminal_count - MAX_TERMINAL_TASKS;
                let mut removed = 0;
                queue.retain(|t| {
                    if removed < to_remove
                        && matches!(t.status, TaskStatus::Completed | TaskStatus::Failed(_))
                    {
                        removed += 1;
                        false
                    } else {
                        true
                    }
                });
            }
        }

        tracing::info!(
            "[Agent] Task {} completed with status: {:?}",
            task_id,
            task.status
        );
        Ok(())
    }

    /// BUG-01 fix: Ask the LLM to produce revised steps when a step fails on
    /// the second retry attempt. The prompt includes the failed step, the error
    /// message, and summaries of already-completed steps so the LLM can craft a
    /// plan that accounts for the failure. Returns the new steps parsed from the
    /// LLM response. Falls back to an error if the LLM call or JSON parsing fails,
    /// allowing the caller to continue with the normal retry path.
    async fn replan_on_failure(
        &self,
        failed_step_description: &str,
        error_message: &str,
        completed_summaries: &[String],
        task_goal: &str,
    ) -> Result<Vec<TaskStep>> {
        let completed_str = if completed_summaries.is_empty() {
            "None".to_string()
        } else {
            completed_summaries.join("\n- ")
        };

        let prompt = format!(
            r#"A task step failed during autonomous execution. Provide revised steps to complete the goal.

Failed step: "{}"
Error: "{}"

Previously completed steps:
- {}

Goal: "{}"

Provide ONLY the remaining steps needed (do not repeat completed steps).
Output a JSON array of steps in the same format as the original plan.
Each step needs: id, action (with type), description, expected_result, timeout (seconds), retry_on_failure (boolean).
Be concise."#,
            failed_step_description, error_message, completed_str, task_goal
        );

        let response = self
            .router
            .read()
            .await
            .send_message(&prompt, None)
            .await
            .map_err(|e| anyhow!("LLM replan request failed: {}", e))?;

        // Reuse the planner's JSON parsing logic
        self.planner
            .parse_plan_response(&response)
            .map_err(|e| anyhow!("Failed to parse replanned steps: {}", e))
    }

    /// H3 fix: Feed step execution results back to the LLM so it can adjust
    /// the remaining plan. This creates the tool-result feedback loop that was
    /// previously missing — the LLM now sees what each step actually produced
    /// and can revise future steps accordingly.
    ///
    /// Returns `Ok(Some(steps))` if the LLM wants to revise the remaining plan,
    /// `Ok(None)` if the existing plan is confirmed, or `Err` on LLM failure
    /// (caller should treat this as non-fatal and continue with the original plan).
    async fn consult_llm_after_step(
        &self,
        task_goal: &str,
        completed_outcomes: &[StepOutcome],
        remaining_steps: &[TaskStep],
    ) -> Result<Option<Vec<TaskStep>>> {
        // Build the execution history, capping to avoid context overflow
        let history_start = completed_outcomes
            .len()
            .saturating_sub(MAX_FEEDBACK_HISTORY);
        let history_lines: Vec<String> = completed_outcomes[history_start..]
            .iter()
            .map(|o| format!("- [{}] {}\n  Result: {}", o.step_id, o.description, o.result))
            .collect();

        let remaining_lines: Vec<String> = remaining_steps
            .iter()
            .map(|s| format!("- [{}] {}", s.id, s.description))
            .collect();

        let prompt = format!(
            r#"You are an autonomous task execution agent. A step just completed. Review the result and decide if the remaining plan needs adjustment.

Goal: "{task_goal}"

Completed steps and their results:
{history}

Remaining planned steps:
{remaining}

Based on the actual results above, do the remaining steps still make sense?

If the plan is still correct, respond with exactly: PLAN_OK

If the plan needs adjustment based on the step results, provide ONLY the revised remaining steps as a JSON array. Each step needs: id, action (with type), description, expected_result, timeout (seconds), retry_on_failure (boolean).

Use the same action types: Screenshot, Click, Type, Navigate, WaitForElement, ExecuteCommand, ReadFile, WriteFile, SearchText, Scroll, PressKey."#,
            task_goal = task_goal,
            history = history_lines.join("\n"),
            remaining = remaining_lines.join("\n"),
        );

        let response = self
            .router
            .read()
            .await
            .send_message(&prompt, None)
            .await
            .map_err(|e| anyhow!("LLM feedback consultation failed: {}", e))?;

        let trimmed = response.trim();

        // If the LLM confirms the plan is fine, return None
        if trimmed == "PLAN_OK" || trimmed.starts_with("PLAN_OK") {
            tracing::debug!("[Agent] LLM confirmed remaining plan is correct");
            return Ok(None);
        }

        // Otherwise, try to parse revised steps
        match self.planner.parse_plan_response(trimmed) {
            Ok(steps) if steps.is_empty() => {
                tracing::debug!("[Agent] LLM feedback returned 0 steps, keeping original plan");
                Ok(None)
            }
            Ok(steps) => Ok(Some(steps)),
            Err(e) => {
                // If the response isn't valid JSON steps, the LLM probably just
                // gave a text confirmation. Treat it as "plan is fine".
                tracing::debug!(
                    "[Agent] LLM feedback response wasn't a step array ({}), keeping original plan",
                    e
                );
                Ok(None)
            }
        }
    }

    async fn check_resource_limits(&self) -> Result<bool> {
        use sysinfo::System;

        let mut sys = System::new_all();
        sys.refresh_all();

        let cpu_usage = sys.global_cpu_info().cpu_usage() as f64;
        if cpu_usage > self.config.cpu_limit_percent {
            tracing::warn!(
                "[Agent] CPU usage ({:.1}%) exceeds limit ({:.1}%)",
                cpu_usage,
                self.config.cpu_limit_percent
            );
            return Ok(false);
        }

        let current_pid =
            sysinfo::get_current_pid().map_err(|e| anyhow!("Failed to get current PID: {}", e))?;

        if let Some(process) = sys.process(current_pid) {
            let memory_mb = process.memory() / (1024 * 1024);
            if memory_mb > self.config.memory_limit_mb {
                tracing::warn!(
                    "[Agent] Memory usage ({}MB) exceeds limit ({}MB)",
                    memory_mb,
                    self.config.memory_limit_mb
                );
                return Ok(false);
            }
        }

        let cpu_usage = sys.global_cpu_info().cpu_usage();
        let used_memory = sys.used_memory();
        let total_memory = sys.total_memory();
        let memory_percent = (used_memory as f64 / total_memory as f64) * 100.0;
        if memory_percent > 80.0 {
            tracing::warn!(
                "Memory usage high: {:.1}%, throttling autonomous agent",
                memory_percent
            );
            return Ok(false);
        }

        tracing::debug!(
            "Resource check passed: CPU {:.1}%, Memory {:.1}%",
            cpu_usage,
            memory_percent
        );
        Ok(true)
    }

    /// Clone agent state for spawning a parallel task.
    /// Returns Result instead of panicking if component creation fails.
    pub fn clone_for_task(&self) -> Result<Self> {
        Ok(Self {
            config: self.config.clone(),
            automation: self.automation.clone(),
            router: self.router.clone(),
            planner: TaskPlanner::new(self.router.clone())
                .map_err(|e| anyhow!("TaskPlanner creation failed: {}", e))?,
            executor: TaskExecutor::new(self.automation.clone(), self.browser_bridge.clone())
                .map_err(|e| anyhow!("TaskExecutor creation failed: {}", e))?,
            vision: VisionAutomation::new()
                .map_err(|e| anyhow!("VisionAutomation creation failed: {}", e))?,
            approval: ApprovalManager::new(self.config.clone()),
            task_queue: self.task_queue.clone(),
            running_tasks: self.running_tasks.clone(),
            stop_signal: self.stop_signal.clone(),
            task_notify: self.task_notify.clone(),
            app_handle: self.app_handle.clone(),
            task_storage: self.task_storage.clone(),
            browser_bridge: self.browser_bridge.clone(),
        })
    }

    /// Resume a task from a previously saved autonomous checkpoint.
    ///
    /// Reconstructs the Task from checkpoint data, inserts it into the task queue
    /// at the checkpoint's step index, and begins execution from there.
    pub async fn resume_from_checkpoint(
        &self,
        checkpoint: &AutonomousTaskCheckpoint,
    ) -> Result<String> {
        let steps: Vec<TaskStep> = serde_json::from_str(&checkpoint.steps_json)
            .map_err(|e| anyhow!("Failed to deserialize checkpoint steps: {}", e))?;

        let task = Task {
            id: checkpoint.task_id.clone(),
            description: checkpoint.description.clone(),
            status: TaskStatus::Pending,
            created_at: std::time::Instant::now(),
            updated_at: std::time::Instant::now(),
            steps,
            current_step: checkpoint.completed_step_index as usize,
            max_retries: self.config.max_retries,
            retry_count: checkpoint.retry_count as usize,
            replan_count: checkpoint.replan_count as usize,
            requires_approval: !checkpoint.auto_approve,
            auto_approve: checkpoint.auto_approve,
        };

        let task_id = task.id.clone();

        {
            let mut queue = self.task_queue.lock();
            let pending_count = queue
                .iter()
                .filter(|t| matches!(t.status, TaskStatus::Pending | TaskStatus::WaitingApproval))
                .count();
            if pending_count >= MAX_PENDING_TASKS {
                return Err(anyhow!(
                    "Task queue full ({} pending tasks)",
                    MAX_PENDING_TASKS
                ));
            }
            queue.push(task);
        }

        tracing::info!(
            "[Agent] Resumed task {} from checkpoint at step {}/{}",
            task_id,
            checkpoint.completed_step_index,
            checkpoint.total_steps
        );

        Ok(task_id)
    }

    pub fn get_task_status(&self, task_id: &str) -> Result<Option<Task>> {
        let queue = self.task_queue.lock();
        Ok(queue.iter().find(|t| t.id == task_id).cloned())
    }

    pub fn list_tasks(&self) -> Result<Vec<Task>> {
        let queue = self.task_queue.lock();
        Ok(queue.clone())
    }
}
