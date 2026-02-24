use super::*;
use crate::automation::AutomationService;
use crate::core::llm::LLMRouter;
use anyhow::{anyhow, Result};
use dashmap::DashMap;
use once_cell::sync::Lazy;
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;
use tokio::sync::{oneshot, Notify, RwLock};
use tokio::time::sleep;

const MAX_SELF_HEAL_RETRIES: usize = 3;
const MAX_PENDING_TASKS: usize = 500;
const MAX_REPLAN_COUNT: usize = 2;
/// Timeout for waiting on user approval before the task is automatically failed.
const APPROVAL_TIMEOUT_SECS: u64 = 300;

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
}

impl AutonomousAgent {
    pub fn new(
        config: AgentConfig,
        automation: Arc<AutomationService>,
        router: Arc<RwLock<LLMRouter>>,
    ) -> Result<Self> {
        let planner = TaskPlanner::new(router.clone())?;
        let executor = TaskExecutor::new(automation.clone())?;
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
        })
    }

    /// Set the Tauri AppHandle so the agent can emit events to the frontend.
    pub fn set_app_handle(&mut self, handle: tauri::AppHandle) {
        self.app_handle = Some(handle);
    }

    pub async fn start(&self) -> Result<()> {
        self.run_autonomous_loop().await
    }

    pub async fn run_autonomous_loop(&self) -> Result<()> {
        tracing::info!("[Agent] Starting autonomous agent loop");
        *self.stop_signal.lock() = false;

        loop {
            if *self.stop_signal.lock() {
                tracing::info!("[Agent] Stop signal received, shutting down");
                break;
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
        let task_id = format!("task_{}", &uuid::Uuid::new_v4().to_string()[..8]);
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
                .filter(|t| {
                    matches!(t.status, TaskStatus::Pending | TaskStatus::WaitingApproval)
                })
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
                        let _ = handle.emit(
                            "agent:task_approval_required",
                            json!({
                                "task_id": task_id,
                                "description": task.description,
                            }),
                        );
                    }

                    // Spawn a background future that awaits the user decision
                    // (with timeout), then resumes or fails the task.
                    let agent_clone = self.clone_for_task()?;
                    let approval_task_id = task_id.clone();
                    self.running_tasks
                        .lock()
                        .push(task_id);

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
                                if let Some(t) =
                                    queue.iter_mut().find(|t| t.id == approval_task_id)
                                {
                                    t.status = TaskStatus::Planning;
                                }
                            }
                            if let Err(e) =
                                agent_clone.execute_task(approval_task_id.clone()).await
                            {
                                tracing::error!(
                                    "[Agent] Task {} failed after approval: {}",
                                    approval_task_id,
                                    e
                                );
                                // Clean up running_tasks slot on error
                                agent_clone.running_tasks.lock()
                                    .retain(|id| id != &approval_task_id);
                            }
                        } else {
                            tracing::info!(
                                "[Agent] Task {} rejected or timed out",
                                approval_task_id
                            );
                            {
                                let mut queue = agent_clone.task_queue.lock();
                                if let Some(t) =
                                    queue.iter_mut().find(|t| t.id == approval_task_id)
                                {
                                    t.status = TaskStatus::Failed(
                                        "Task approval denied or timed out".to_string(),
                                    );
                                }
                            }
                            agent_clone.running_tasks.lock()
                                .retain(|id| id != &approval_task_id);
                        }
                    });

                    return Ok(());
                }
            }
        }

        // Push task_id to running_tasks BEFORE spawning to avoid a race where
        // execute_task could finish before the push.
        self.running_tasks
            .lock()
            .push(task_id.clone());

        let agent_clone = self.clone_for_task()?;
        let task_id_clone = task_id;
        tokio::spawn(async move {
            if let Err(e) = agent_clone.execute_task(task_id_clone.clone()).await {
                tracing::error!("[Agent] Task execution failed: {}", e);
                // Clean up running_tasks slot on error (mirrors the approval path)
                agent_clone.running_tasks.lock()
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

        let mut step_index = 0usize;
        while step_index < task.steps.len() {
            let step = task.steps[step_index].clone();
            let total_steps = task.steps.len();
            task.current_step = step_index;
            task.updated_at = std::time::Instant::now();

            // BUG-02 fix: emit step-started event to frontend
            if let Some(ref handle) = self.app_handle {
                handle.emit("agent:step-started", json!({
                    "taskId": task.id,
                    "step": step.description,
                    "stepIndex": step_index,
                    "totalSteps": total_steps
                })).ok();
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
                        tracing::info!(
                            "[Agent] Step {} completed: {}",
                            step.id,
                            result.result.as_deref().unwrap_or("OK")
                        );
                        // BUG-02 fix: emit step-completed event to frontend
                        if let Some(ref handle) = self.app_handle {
                            handle.emit("agent:step-completed", json!({
                                "taskId": task.id,
                                "step": step.description,
                                "result": result.result.as_deref().unwrap_or(""),
                                "stepIndex": step_index
                            })).ok();
                        }
                        completed_summaries.push(format!(
                            "{}: {}",
                            step.id, step.description
                        ));
                        step_succeeded = true;
                        break;
                    }
                    Ok(result) => {
                        let error_msg = result
                            .error
                            .as_deref()
                            .unwrap_or("Unknown error")
                            .to_string();
                        let will_retry = task.retry_count < task.max_retries
                            && attempt <= MAX_SELF_HEAL_RETRIES;
                        tracing::warn!(
                            "[Agent] Step {} failed: {}",
                            step.id,
                            error_msg
                        );
                        // BUG-02 fix: emit step-failed event to frontend
                        if let Some(ref handle) = self.app_handle {
                            handle.emit("agent:step-failed", json!({
                                "taskId": task.id,
                                "step": step.description,
                                "error": error_msg,
                                "attempt": attempt,
                                "retrying": will_retry
                            })).ok();
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
                        let will_retry = task.retry_count < task.max_retries
                            && attempt <= MAX_SELF_HEAL_RETRIES;
                        tracing::error!("[Agent] Step {} error: {}", step.id, error_msg);
                        // BUG-02 fix: emit step-failed event to frontend
                        if let Some(ref handle) = self.app_handle {
                            handle.emit("agent:step-failed", json!({
                                "taskId": task.id,
                                "step": step.description,
                                "error": error_msg,
                                "attempt": attempt,
                                "retrying": will_retry
                            })).ok();
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

            // Only advance to next step if the current step actually succeeded.
            // If we broke out of the inner loop due to replanning, step_succeeded
            // will be false and we re-execute at the same step_index (which now
            // points to the first replanned step).
            if step_succeeded {
                step_index += 1;
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
            match &task.status {
                TaskStatus::Completed => {
                    handle.emit("agent:task-completed", json!({
                        "taskId": task.id,
                        "success": true,
                        "stepsCompleted": completed_count
                    })).ok();
                }
                TaskStatus::Failed(error_message) => {
                    handle.emit("agent:task-failed", json!({
                        "taskId": task.id,
                        "error": error_message
                    })).ok();
                }
                _ => {}
            }
        }

        {
            let mut queue = self.task_queue.lock();
            if let Some(t) = queue.iter_mut().find(|t| t.id == task_id) {
                *t = task.clone();
            }
        }

        self.running_tasks
            .lock()
            .retain(|id| id != &task_id);

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
            executor: TaskExecutor::new(self.automation.clone())
                .map_err(|e| anyhow!("TaskExecutor creation failed: {}", e))?,
            vision: VisionAutomation::new()
                .map_err(|e| anyhow!("VisionAutomation creation failed: {}", e))?,
            approval: ApprovalManager::new(self.config.clone()),
            task_queue: self.task_queue.clone(),
            running_tasks: self.running_tasks.clone(),
            stop_signal: self.stop_signal.clone(),
            task_notify: self.task_notify.clone(),
            app_handle: self.app_handle.clone(),
        })
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
