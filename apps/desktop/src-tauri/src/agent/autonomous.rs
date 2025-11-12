use super::*;
use crate::automation::AutomationService;
use crate::router::LLMRouter;
use anyhow::{anyhow, Result};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::time::sleep;

pub struct AutonomousAgent {
    config: AgentConfig,
    automation: Arc<AutomationService>,
    router: Arc<LLMRouter>,
    planner: TaskPlanner,
    executor: TaskExecutor,
    vision: VisionAutomation,
    approval: ApprovalManager,
    task_queue: Arc<Mutex<Vec<Task>>>,
    running_tasks: Arc<Mutex<Vec<String>>>, // Task IDs
    stop_signal: Arc<Mutex<bool>>,
}

impl AutonomousAgent {
    pub fn new(
        config: AgentConfig,
        automation: Arc<AutomationService>,
        router: Arc<LLMRouter>,
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
            task_queue: Arc::new(Mutex::new(Vec::new())),
            running_tasks: Arc::new(Mutex::new(Vec::new())),
            stop_signal: Arc::new(Mutex::new(false)),
        })
    }

    /// Start the autonomous agent loop (runs 24/7)
    pub async fn start(&self) -> Result<()> {
        tracing::info!("[Agent] Starting autonomous agent loop");
        *self
            .stop_signal
            .lock()
            .map_err(|_| anyhow!("Failed to acquire stop signal lock"))? = false;

        loop {
            // Check if we should stop
            if *self
                .stop_signal
                .lock()
                .map_err(|_| anyhow!("Failed to acquire stop signal lock"))?
            {
                tracing::info!("[Agent] Stop signal received, shutting down");
                break;
            }

            // Check resource limits
            if !self.check_resource_limits().await? {
                tracing::warn!("[Agent] Resource limits exceeded, pausing");
                sleep(Duration::from_secs(5)).await;
                continue;
            }

            // Process task queue
            self.process_task_queue().await?;

            // Small delay to prevent tight loop
            sleep(Duration::from_millis(100)).await;
        }

        Ok(())
    }

    /// Stop the autonomous agent
    pub fn stop(&self) {
        tracing::info!("[Agent] Stopping autonomous agent");
        if let Ok(mut stop) = self.stop_signal.lock() {
            *stop = true;
        }
    }

    /// Submit a new task for execution
    pub async fn submit_task(
        &self,
        description: String,
        auto_approve: Option<bool>,
    ) -> Result<String> {
        let task_id = format!("task_{}", &uuid::Uuid::new_v4().to_string()[..8]);
        let auto_approve = auto_approve.unwrap_or(self.config.auto_approve);

        // Plan the task
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
            requires_approval: !auto_approve,
            auto_approve,
        };

        // Add to queue
        self.task_queue.lock().unwrap().push(task);

        tracing::info!("[Agent] Task {} queued for execution", task_id);
        Ok(task_id)
    }

    /// Process the task queue
    async fn process_task_queue(&self) -> Result<()> {
        // Check if we can start more tasks
        {
            let running = self.running_tasks.lock().unwrap();
            if running.len() >= self.config.max_concurrent_tasks {
                return Ok(());
            }
        }

        // Find next pending task
        let (task_id, requires_approval_check) = {
            let mut queue = self.task_queue.lock().unwrap();
            if let Some(task) = queue.iter_mut().find(|t| t.status == TaskStatus::Pending) {
                let task_id = task.id.clone();
                let requires_approval = task.requires_approval && !task.auto_approve;
                task.status = TaskStatus::Planning;
                (task_id, requires_approval)
            } else {
                return Ok(());
            }
        };

        // Check approval if needed (outside of lock)
        if requires_approval_check {
            let task_clone = {
                let queue = self.task_queue.lock().unwrap();
                queue.iter().find(|t| t.id == task_id).cloned()
            };

            if let Some(task) = task_clone {
                if !self.approval.should_approve(&task).await? {
                    tracing::info!("[Agent] Task {} requires approval", task_id);
                    // Update status back to WaitingApproval
                    let mut queue = self.task_queue.lock().unwrap();
                    if let Some(t) = queue.iter_mut().find(|t| t.id == task_id) {
                        t.status = TaskStatus::WaitingApproval;
                    }
                    return Ok(());
                }
            }
        }

        // Start task execution in background
        let agent_clone = self.clone_for_task();
        let task_id_clone = task_id.clone();
        tokio::spawn(async move {
            if let Err(e) = agent_clone.execute_task(task_id_clone).await {
                tracing::error!("[Agent] Task execution failed: {}", e);
            }
        });

        self.running_tasks.lock().unwrap().push(task_id);
        Ok(())
    }

    /// Execute a task
    async fn execute_task(&self, task_id: String) -> Result<()> {
        let mut task = {
            let mut queue = self.task_queue.lock().unwrap();
            queue
                .iter_mut()
                .find(|t| t.id == task_id)
                .ok_or_else(|| anyhow!("Task {} not found", task_id))?
                .clone()
        };

        task.status = TaskStatus::Executing;
        tracing::info!("[Agent] Executing task {}: {}", task_id, task.description);

        // Execute each step
        for (index, step) in task.steps.iter().enumerate() {
            task.current_step = index;
            task.updated_at = std::time::Instant::now();

            // Update task in queue
            {
                let mut queue = self.task_queue.lock().unwrap();
                if let Some(t) = queue.iter_mut().find(|t| t.id == task_id) {
                    *t = task.clone();
                }
            }

            let step_result = self.executor.execute_step(step, &self.vision).await;

            match step_result {
                Ok(result) if result.success => {
                    tracing::info!(
                        "[Agent] Step {} completed: {}",
                        step.id,
                        result.result.as_deref().unwrap_or("OK")
                    );
                }
                Ok(result) => {
                    tracing::warn!(
                        "[Agent] Step {} failed: {}",
                        step.id,
                        result.error.as_deref().unwrap_or("Unknown error")
                    );
                    if step.retry_on_failure && task.retry_count < task.max_retries {
                        task.retry_count += 1;
                        tracing::info!(
                            "[Agent] Retrying step {} (attempt {}/{})",
                            step.id,
                            task.retry_count,
                            task.max_retries
                        );
                        // Retry the step
                        continue;
                    } else {
                        task.status = TaskStatus::Failed(format!(
                            "Step {} failed: {}",
                            step.id,
                            result.error.as_deref().unwrap_or("Unknown")
                        ));
                        break;
                    }
                }
                Err(e) => {
                    tracing::error!("[Agent] Step {} error: {}", step.id, e);
                    if step.retry_on_failure && task.retry_count < task.max_retries {
                        task.retry_count += 1;
                        continue;
                    } else {
                        task.status = TaskStatus::Failed(e.to_string());
                        break;
                    }
                }
            }

            // Small delay between steps
            sleep(Duration::from_millis(100)).await;
        }

        // Update final status
        if task.status == TaskStatus::Executing {
            task.status = TaskStatus::Completed;
        }

        {
            let mut queue = self.task_queue.lock().unwrap();
            if let Some(t) = queue.iter_mut().find(|t| t.id == task_id) {
                *t = task.clone();
            }
        }

        // Remove from running tasks
        self.running_tasks
            .lock()
            .unwrap()
            .retain(|id| id != &task_id);

        tracing::info!(
            "[Agent] Task {} completed with status: {:?}",
            task_id,
            task.status
        );
        Ok(())
    }

    /// Check resource limits (CPU, memory)
    async fn check_resource_limits(&self) -> Result<bool> {
        // Use sysinfo to monitor actual system resources
        use sysinfo::System;

        let mut sys = System::new_all();
        sys.refresh_all();

        // Check CPU usage
        let cpu_usage = sys.global_cpu_info().cpu_usage() as f64;
        if cpu_usage > self.config.cpu_limit_percent {
            tracing::warn!(
                "[Agent] CPU usage ({:.1}%) exceeds limit ({:.1}%)",
                cpu_usage,
                self.config.cpu_limit_percent
            );
            return Ok(false);
        }

        // Check memory usage for current process
        let current_pid =
            sysinfo::get_current_pid().map_err(|e| anyhow!("Failed to get current PID: {}", e))?;

        if let Some(process) = sys.process(current_pid) {
            // process.memory() returns bytes in newer sysinfo versions
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

        // Check CPU usage again (throttle if > 80%)
        let cpu_usage = sys.global_cpu_info().cpu_usage();
        if cpu_usage > 80.0 {
            tracing::warn!(
                "CPU usage high: {:.1}%, throttling autonomous agent",
                cpu_usage
            );
            return Ok(false);
        }

        // Check memory usage (throttle if > 80% of available)
        let used_memory = system.used_memory();
        let total_memory = system.total_memory();
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

    /// Clone agent for task execution (creates a new instance with shared state)
    pub fn clone_for_task(&self) -> Self {
        Self {
            config: self.config.clone(),
            automation: self.automation.clone(),
            router: self.router.clone(),
            planner: TaskPlanner::new(self.router.clone()).unwrap(),
            executor: TaskExecutor::new(self.automation.clone()).unwrap(),
            vision: VisionAutomation::new().unwrap(),
            approval: ApprovalManager::new(self.config.clone()),
            task_queue: self.task_queue.clone(),
            running_tasks: self.running_tasks.clone(),
            stop_signal: self.stop_signal.clone(),
        }
    }

    /// Get task status
    pub fn get_task_status(&self, task_id: &str) -> Option<Task> {
        self.task_queue
            .lock()
            .unwrap()
            .iter()
            .find(|t| t.id == task_id)
            .cloned()
    }

    /// List all tasks
    pub fn list_tasks(&self) -> Vec<Task> {
        self.task_queue.lock().unwrap().clone()
    }
}
