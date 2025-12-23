use super::types::{ProgressUpdate, Task, TaskContext};
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

pub type TaskExecutorFn = Arc<
    dyn Fn(TaskContext) -> Pin<Box<dyn Future<Output = anyhow::Result<String>> + Send>>
        + Send
        + Sync,
>;

struct RunningTask {
    task: Task,
    handle: JoinHandle<anyhow::Result<String>>,
    cancel_token: CancellationToken,
}

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

    pub async fn can_accept(&self) -> bool {
        let running = self.running_tasks.read().await;
        running.len() < self.max_concurrent
    }

    pub async fn running_count(&self) -> usize {
        let running = self.running_tasks.read().await;
        running.len()
    }

    pub async fn execute<F>(&self, mut task: Task, executor_fn: F) -> anyhow::Result<()>
    where
        F: Future<Output = anyhow::Result<String>> + Send + 'static,
    {
        if !self.can_accept().await {
            return Err(anyhow::anyhow!(
                "Executor at max capacity ({} concurrent tasks)",
                self.max_concurrent
            ));
        }

        let task_id = task.id.clone();
        let cancel_token = CancellationToken::new();

        task.start();

        let handle = tokio::spawn(executor_fn);

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

    pub async fn execute_with(
        &self,
        mut task: Task,
        executor_fn: TaskExecutorFn,
    ) -> anyhow::Result<()> {
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

        task.start();

        let ctx = TaskContext::new(
            task_id.clone(),
            payload,
            progress_tx.clone(),
            cancel_token.clone(),
        );

        let handle = tokio::spawn(executor_fn(ctx));

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

    pub async fn cancel(&self, task_id: &str) -> anyhow::Result<()> {
        let running = self.running_tasks.write().await;

        if let Some(running_task) = running.get(task_id) {
            running_task.cancel_token.cancel();
            Ok(())
        } else {
            Err(anyhow::anyhow!("Task {} is not running", task_id))
        }
    }

    pub async fn get_running(&self, task_id: &str) -> Option<Task> {
        let running = self.running_tasks.read().await;
        running.get(task_id).map(|rt| rt.task.clone())
    }

    pub async fn list_running(&self) -> Vec<Task> {
        let running = self.running_tasks.read().await;
        running.values().map(|rt| rt.task.clone()).collect()
    }

    pub async fn poll_completions(&self) -> Vec<(String, anyhow::Result<String>)> {
        let mut completed = Vec::new();
        let mut running = self.running_tasks.write().await;

        let task_ids: Vec<String> = running.keys().cloned().collect();

        for task_id in task_ids {
            if let Some(running_task) = running.get_mut(&task_id) {
                if running_task.handle.is_finished() {
                    if let Some(running_task) = running.remove(&task_id) {
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

    pub async fn get_progress_updates(&self) -> Vec<ProgressUpdate> {
        let mut updates = Vec::new();
        let mut rx = self.progress_rx.write().await;

        while let Ok(update) = rx.try_recv() {
            updates.push(update);
        }

        updates
    }

    pub async fn pause(&self, task_id: &str) -> anyhow::Result<()> {
        let mut running = self.running_tasks.write().await;

        if let Some(running_task) = running.get_mut(task_id) {
            running_task.task.pause();
            Ok(())
        } else {
            Err(anyhow::anyhow!("Task {} is not running", task_id))
        }
    }

    pub async fn resume(&self, task_id: &str) -> anyhow::Result<()> {
        let mut running = self.running_tasks.write().await;

        if let Some(running_task) = running.get_mut(task_id) {
            running_task.task.resume();
            Ok(())
        } else {
            Err(anyhow::anyhow!("Task {} is not running", task_id))
        }
    }

    pub async fn shutdown(&self) {
        let mut running = self.running_tasks.write().await;

        for (_, running_task) in running.drain() {
            running_task.cancel_token.cancel();
            running_task.handle.abort();
        }
    }

    pub async fn wait_for(&self, task_id: &str) -> anyhow::Result<String> {
        loop {
            let completions = self.poll_completions().await;

            for (completed_id, result) in completions {
                if completed_id == task_id {
                    return result;
                }
            }

            if self.get_running(task_id).await.is_none() {
                return Err(anyhow::anyhow!("Task {} not found", task_id));
            }

            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }
    }
}

impl Drop for TaskExecutor {
    fn drop(&mut self) {
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
