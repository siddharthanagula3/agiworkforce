pub mod executor;
pub mod persistence;
pub mod queue;
pub mod types;

use anyhow::Context;
use executor::{TaskExecutor, TaskExecutorFn};
use persistence::{TaskPersistence, TaskStats};
use queue::TaskQueue;
use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;
use types::{Priority, Task, TaskFilter, TaskResult, TaskStatus};

// AUDIT-004-012: Added cleanup configuration for old completed tasks
// Previously held all tasks indefinitely; now supports periodic cleanup
/// Maximum age (in seconds) for completed/failed/cancelled tasks before cleanup
const COMPLETED_TASK_MAX_AGE_SECS: i64 = 24 * 60 * 60; // 24 hours

pub struct TaskManager {
    queue: Arc<TaskQueue>,
    executor: Arc<TaskExecutor>,
    persistence: Arc<TaskPersistence>,
    tasks: Arc<RwLock<HashMap<String, Task>>>,
    executors: Arc<RwLock<HashMap<String, TaskExecutorFn>>>,
    app_handle: AppHandle,
}

impl TaskManager {
    pub fn new(
        conn: Arc<std::sync::Mutex<Connection>>,
        app_handle: AppHandle,
        max_concurrent: usize,
    ) -> Self {
        Self {
            queue: Arc::new(TaskQueue::new()),
            executor: Arc::new(TaskExecutor::new(max_concurrent)),
            persistence: Arc::new(TaskPersistence::new(conn)),
            tasks: Arc::new(RwLock::new(HashMap::new())),
            executors: Arc::new(RwLock::new(HashMap::new())),
            app_handle,
        }
    }

    pub async fn register_executor(&self, task_type: &str, executor: TaskExecutorFn) {
        let mut executors = self.executors.write().await;
        executors.insert(task_type.to_string(), executor);
    }

    pub async fn submit(
        &self,
        name: String,
        description: Option<String>,
        priority: Priority,
        payload: Option<String>,
    ) -> anyhow::Result<String> {
        let mut task = Task::new(name.clone(), description, priority);
        if let Some(payload) = payload {
            task = task.with_payload(payload);
        }

        let task_id = task.id.clone();

        self.persistence
            .save(&task)
            .context("Failed to persist task")?;

        {
            let mut tasks = self.tasks.write().await;
            tasks.insert(task_id.clone(), task.clone());
        }

        self.queue.enqueue(task.clone()).await?;

        self.emit_event("task:created", &task)?;

        self.process_queue().await?;

        Ok(task_id)
    }

    async fn process_queue(&self) -> anyhow::Result<()> {
        while self.executor.can_accept().await && !self.queue.is_empty().await {
            if let Some(mut task) = self.queue.dequeue().await {
                let task_id = task.id.clone();

                let executors = self.executors.read().await;

                let executor_fn = executors.values().next().cloned();

                if let Some(executor_fn) = executor_fn {
                    task.start();
                    {
                        let mut tasks = self.tasks.write().await;
                        tasks.insert(task_id.clone(), task.clone());
                    }
                    self.persistence.save(&task)?;
                    self.emit_event("task:started", &task)?;

                    self.executor.execute_with(task, executor_fn).await?;
                } else {
                    self.queue.enqueue(task).await?;
                    break;
                }
            }
        }

        Ok(())
    }

    pub async fn cancel(&self, task_id: &str) -> anyhow::Result<()> {
        if let Some(mut task) = self.executor.get_running(task_id).await {
            self.executor.cancel(task_id).await?;
            task.cancel();

            {
                let mut tasks = self.tasks.write().await;
                tasks.insert(task_id.to_string(), task.clone());
            }
            self.persistence.save(&task)?;
            self.emit_event("task:cancelled", &task)?;

            return Ok(());
        }

        if let Some(mut task) = self.queue.remove(task_id).await {
            task.cancel();

            {
                let mut tasks = self.tasks.write().await;
                tasks.insert(task_id.to_string(), task.clone());
            }
            self.persistence.save(&task)?;
            self.emit_event("task:cancelled", &task)?;

            return Ok(());
        }

        Err(anyhow::anyhow!(
            "Task {} not found or already completed",
            task_id
        ))
    }

    pub async fn pause(&self, task_id: &str) -> anyhow::Result<()> {
        self.executor.pause(task_id).await?;

        if let Some(task) = self.executor.get_running(task_id).await {
            {
                let mut tasks = self.tasks.write().await;
                tasks.insert(task_id.to_string(), task.clone());
            }
            self.persistence.save(&task)?;
        }

        Ok(())
    }

    pub async fn resume(&self, task_id: &str) -> anyhow::Result<()> {
        self.executor.resume(task_id).await?;

        if let Some(task) = self.executor.get_running(task_id).await {
            {
                let mut tasks = self.tasks.write().await;
                tasks.insert(task_id.to_string(), task.clone());
            }
            self.persistence.save(&task)?;
        }

        Ok(())
    }

    pub async fn get_status(&self, task_id: &str) -> anyhow::Result<Task> {
        let tasks = self.tasks.read().await;
        tasks
            .get(task_id)
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("Task {} not found", task_id))
    }

    pub async fn list(&self, filter: TaskFilter) -> anyhow::Result<Vec<Task>> {
        let tasks = self.tasks.read().await;
        let mut result: Vec<Task> = tasks.values().cloned().collect();

        if let Some(status) = &filter.status {
            result.retain(|t| &t.status == status);
        }

        if let Some(priority) = &filter.priority {
            result.retain(|t| &t.priority == priority);
        }

        result.sort_by(|a, b| {
            b.priority
                .cmp(&a.priority)
                .then_with(|| b.created_at.cmp(&a.created_at))
        });

        if let Some(limit) = filter.limit {
            result.truncate(limit);
        }

        Ok(result)
    }

    pub fn stats(&self) -> anyhow::Result<TaskStats> {
        self.persistence.get_stats()
    }

    pub async fn poll_completions(&self) -> anyhow::Result<()> {
        let completions = self.executor.poll_completions().await;

        for (task_id, result) in completions {
            if let Some(task) = self.tasks.write().await.get_mut(&task_id) {
                match result {
                    Ok(output) => {
                        task.complete(TaskResult::success(output));
                        self.persistence.save(task)?;
                        self.emit_event("task:completed", task)?;
                    }
                    Err(e) => {
                        task.fail(e.to_string());
                        self.persistence.save(task)?;
                        self.emit_event("task:failed", task)?;
                    }
                }
            }
        }

        self.process_queue().await?;

        Ok(())
    }

    pub async fn poll_progress(&self) -> anyhow::Result<()> {
        let updates = self.executor.get_progress_updates().await;

        for update in updates {
            if let Some(task) = self.tasks.write().await.get_mut(&update.task_id) {
                task.update_progress(update.progress);
                self.persistence.save(task)?;

                self.app_handle
                    .emit(
                        "task:progress",
                        serde_json::json!({
                            "task_id": update.task_id,
                            "progress": update.progress,
                        }),
                    )
                    .ok();
            }
        }

        Ok(())
    }

    pub async fn restore(&self) -> anyhow::Result<()> {
        let filter = TaskFilter {
            status: Some(TaskStatus::Queued),
            ..Default::default()
        };

        let queued_tasks = self.persistence.list(&filter)?;

        for task in queued_tasks {
            let task_id = task.id.clone();
            {
                let mut tasks = self.tasks.write().await;
                tasks.insert(task_id, task.clone());
            }
            self.queue.enqueue(task).await?;
        }

        let filter = TaskFilter {
            status: Some(TaskStatus::Running),
            ..Default::default()
        };

        let running_tasks = self.persistence.list(&filter)?;

        for mut task in running_tasks {
            task.status = TaskStatus::Queued;
            let task_id = task.id.clone();
            {
                let mut tasks = self.tasks.write().await;
                tasks.insert(task_id, task.clone());
            }
            self.persistence.save(&task)?;
            self.queue.enqueue(task).await?;
        }

        Ok(())
    }

    fn emit_event(&self, event: &str, task: &Task) -> anyhow::Result<()> {
        self.app_handle
            .emit(event, task)
            .context("Failed to emit event")?;
        Ok(())
    }

    pub async fn shutdown(&self) {
        self.executor.shutdown().await;
    }

    /// Extend the per-task deadline override by `additional_secs`.
    ///
    /// If the task has no existing override, the global `max_duration_secs` baseline
    /// is used as the starting point before adding the extension.
    pub async fn extend_deadline(
        &self,
        task_id: &str,
        additional_secs: i64,
        global_max_secs: i64,
    ) -> anyhow::Result<i64> {
        let mut tasks = self.tasks.write().await;
        let task = tasks
            .get_mut(task_id)
            .ok_or_else(|| anyhow::anyhow!("Task '{}' not found", task_id))?;

        let current_max = task.deadline_override_secs.unwrap_or(global_max_secs);
        let new_max = current_max + additional_secs;
        task.deadline_override_secs = Some(new_max);
        Ok(new_max)
    }

    // AUDIT-004-012: Cleanup old completed/failed/cancelled tasks
    /// Remove tasks that have been in a terminal state for longer than the max age
    pub async fn cleanup_old_tasks(&self) -> anyhow::Result<usize> {
        let now = chrono::Utc::now();
        let cutoff = now - chrono::Duration::seconds(COMPLETED_TASK_MAX_AGE_SECS);

        let mut tasks = self.tasks.write().await;
        let initial_count = tasks.len();

        tasks.retain(|_id, task| {
            // Keep tasks that are not in a terminal state
            if !matches!(
                task.status,
                TaskStatus::Completed | TaskStatus::Failed | TaskStatus::Cancelled
            ) {
                return true;
            }

            // Keep tasks that completed recently
            if let Some(completed_at) = task.completed_at {
                completed_at > cutoff
            } else {
                // No completion time recorded, keep if created recently
                task.created_at > cutoff
            }
        });

        let removed_count = initial_count - tasks.len();

        if removed_count > 0 {
            tracing::info!(
                "[TaskManager] Cleaned up {} old completed tasks",
                removed_count
            );
        }

        Ok(removed_count)
    }
}

// AUDIT-004-012: Task loop now includes periodic cleanup of old tasks
pub async fn start_task_loop(manager: Arc<TaskManager>) {
    let mut poll_interval = tokio::time::interval(tokio::time::Duration::from_millis(100));
    let mut cleanup_interval = tokio::time::interval(tokio::time::Duration::from_secs(3600)); // 1 hour

    // Don't run cleanup immediately on startup
    cleanup_interval.tick().await;

    loop {
        tokio::select! {
            _ = poll_interval.tick() => {
                if let Err(e) = manager.poll_completions().await {
                    tracing::error!("Error polling completions: {}", e);
                }

                if let Err(e) = manager.poll_progress().await {
                    tracing::error!("Error polling progress: {}", e);
                }
            }
            _ = cleanup_interval.tick() => {
                if let Err(e) = manager.cleanup_old_tasks().await {
                    tracing::error!("Error cleaning up old tasks: {}", e);
                }
            }
        }
    }
}
