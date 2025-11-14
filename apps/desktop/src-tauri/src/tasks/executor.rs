use super::types::{ProgressUpdate, Task, TaskContext, TaskResult, TaskStatus};
use anyhow::Context;
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

/// Type alias for task executor function
pub type TaskExecutorFn = Arc<
    dyn Fn(TaskContext) -> Pin<Box<dyn Future<Output = anyhow::Result<String>> + Send>>
        + Send
        + Sync,
>;

/// Running task information
struct RunningTask {
    task: Task,
    handle: JoinHandle<anyhow::Result<String>>,
    cancel_token: CancellationToken,
}

/// Task executor that manages concurrent task execution
pub struct TaskExecutor {
    max_concurrent: usize,
    running_tasks: Arc<RwLock<HashMap<String, RunningTask>>>,
    progress_tx: mpsc::UnboundedSender<ProgressUpdate>,
    progress_rx: Arc<RwLock<mpsc::UnboundedReceiver<ProgressUpdate>>>,
}

impl TaskExecutor {
    pub fn new(max_concurrent: usize) -> Self {
        let (progress_tx, progress_rx) = mpsc::unbounded_channel();

        Self {
            max_concurrent,
            running_tasks: Arc::new(RwLock::new(HashMap::new())),
            progress_tx,
            progress_rx: Arc::new(RwLock::new(progress_rx)),
        }
    }

    /// Check if we can accept more tasks
    pub async fn can_accept(&self) -> bool {
        let running = self.running_tasks.read().await;
        running.len() < self.max_concurrent
    }

    /// Get the number of running tasks
    pub async fn running_count(&self) -> usize {
        let running = self.running_tasks.read().await;
        running.len()
    }

    /// Execute a task asynchronously
    pub async fn execute<F>(&self, mut task: Task, executor_fn: F) -> anyhow::Result<()>
    where
        F: Future<Output = anyhow::Result<String>> + Send + 'static,
    {
        // Check if we can accept more tasks
        if !self.can_accept().await {
            return Err(anyhow::anyhow!(
                "Executor at max capacity ({} concurrent tasks)",
                self.max_concurrent
            ));
        }

        let task_id = task.id.clone();
        let cancel_token = CancellationToken::new();
        let progress_tx = self.progress_tx.clone();

        // Update task status to running
        task.start();

        // Spawn the task
        let handle = tokio::spawn(executor_fn);

        // Store running task info
        let mut running = self.running_tasks.write().await;
        running.insert(
            task_id.clone(),
            RunningTask {
                task,
                handle,
                cancel_token,
            },
        );

        Ok(())
    }

    /// Execute a task with a custom executor function
    pub async fn execute_with(
        &self,
        mut task: Task,
        executor_fn: TaskExecutorFn,
    ) -> anyhow::Result<()> {
        // Check if we can accept more tasks
        if !self.can_accept().await {
            return Err(anyhow::anyhow!(
                "Executor at max capacity ({} concurrent tasks)",
                self.max_concurrent
            ));
        }

        let task_id = task.id.clone();
        let payload = task.payload.clone();
        let cancel_token = CancellationToken::new();
        let progress_tx = self.progress_tx.clone();

        // Update task status to running
        task.start();

        // Create task context
        let ctx = TaskContext::new(
            task_id.clone(),
            payload,
            progress_tx.clone(),
            cancel_token.clone(),
        );

        // Spawn the task
        let handle = tokio::spawn(executor_fn(ctx));

        // Store running task info
        let mut running = self.running_tasks.write().await;
        running.insert(
            task_id.clone(),
            RunningTask {
                task,
                handle,
                cancel_token,
            },
        );

        Ok(())
    }

    /// Cancel a running task
    pub async fn cancel(&self, task_id: &str) -> anyhow::Result<()> {
        let mut running = self.running_tasks.write().await;

        if let Some(running_task) = running.get(task_id) {
            // Trigger cancellation
            running_task.cancel_token.cancel();
            Ok(())
        } else {
            Err(anyhow::anyhow!("Task {} is not running", task_id))
        }
    }

    /// Get a running task by ID
    pub async fn get_running(&self, task_id: &str) -> Option<Task> {
        let running = self.running_tasks.read().await;
        running.get(task_id).map(|rt| rt.task.clone())
    }

    /// List all running tasks
    pub async fn list_running(&self) -> Vec<Task> {
        let running = self.running_tasks.read().await;
        running.values().map(|rt| rt.task.clone()).collect()
    }

    /// Poll for task completion and return completed tasks
    pub async fn poll_completions(&self) -> Vec<(String, anyhow::Result<String>)> {
        let mut completed = Vec::new();
        let mut running = self.running_tasks.write().await;

        // Check each running task
        let task_ids: Vec<String> = running.keys().cloned().collect();

        for task_id in task_ids {
            if let Some(running_task) = running.get_mut(&task_id) {
                // Check if task has completed
                if running_task.handle.is_finished() {
                    if let Some(running_task) = running.remove(&task_id) {
                        // Get the result
                        match running_task.handle.await {
                            Ok(result) => {
                                completed.push((task_id, result));
                            }
                            Err(e) => {
                                completed
                                    .push((task_id, Err(anyhow::anyhow!("Task panicked: {}", e))));
                            }
                        }
                    }
                }
            }
        }

        completed
    }

    /// Get progress updates
    pub async fn get_progress_updates(&self) -> Vec<ProgressUpdate> {
        let mut updates = Vec::new();
        let mut rx = self.progress_rx.write().await;

        while let Ok(update) = rx.try_recv() {
            updates.push(update);
        }

        updates
    }

    /// Pause a running task (if supported by the task implementation)
    pub async fn pause(&self, task_id: &str) -> anyhow::Result<()> {
        let mut running = self.running_tasks.write().await;

        if let Some(running_task) = running.get_mut(task_id) {
            running_task.task.pause();
            Ok(())
        } else {
            Err(anyhow::anyhow!("Task {} is not running", task_id))
        }
    }

    /// Resume a paused task
    pub async fn resume(&self, task_id: &str) -> anyhow::Result<()> {
        let mut running = self.running_tasks.write().await;

        if let Some(running_task) = running.get_mut(task_id) {
            running_task.task.resume();
            Ok(())
        } else {
            Err(anyhow::anyhow!("Task {} is not running", task_id))
        }
    }

    /// Shutdown the executor and cancel all running tasks
    pub async fn shutdown(&self) {
        let mut running = self.running_tasks.write().await;

        for (_, running_task) in running.drain() {
            running_task.cancel_token.cancel();
            running_task.handle.abort();
        }
    }

    /// Wait for a specific task to complete
    pub async fn wait_for(&self, task_id: &str) -> anyhow::Result<String> {
        loop {
            let completions = self.poll_completions().await;

            for (completed_id, result) in completions {
                if completed_id == task_id {
                    return result;
                }
            }

            // Check if task is still running
            if self.get_running(task_id).await.is_none() {
                return Err(anyhow::anyhow!("Task {} not found", task_id));
            }

            // Small delay before polling again
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }
    }
}

impl Drop for TaskExecutor {
    fn drop(&mut self) {
        // Cancel all running tasks on drop
        let running = self.running_tasks.clone();
        tokio::spawn(async move {
            let mut running = running.write().await;
            for (_, running_task) in running.drain() {
                running_task.cancel_token.cancel();
                running_task.handle.abort();
            }
        });
    }
}
