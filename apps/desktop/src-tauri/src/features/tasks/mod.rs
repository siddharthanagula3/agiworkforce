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
}

pub async fn start_task_loop(manager: Arc<TaskManager>) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_millis(100));

    loop {
        interval.tick().await;

        if let Err(e) = manager.poll_completions().await {
            tracing::error!("Error polling completions: {}", e);
        }

        if let Err(e) = manager.poll_progress().await {
            tracing::error!("Error polling progress: {}", e);
        }
    }
}
