use futures_util::FutureExt;
use std::{future::Future, panic::AssertUnwindSafe};
use tokio::{sync::Mutex, task::JoinSet};
#[derive(Default)]
pub(super) struct AccountFileTasks {
    tasks: Mutex<JoinSet<()>>,
}
impl AccountFileTasks {
    pub(super) async fn spawn(
        &self,
        work: impl Future<Output = ()> + Send + 'static,
        failed: impl Future<Output = ()> + Send + 'static,
    ) {
        let mut tasks = self.tasks.lock().await;
        while let Some(result) = tasks.try_join_next() {
            if let Err(error) = result {
                tracing::error!(%error, "account file task did not finish normally");
            }
        }
        tasks.spawn(async move {
            if AssertUnwindSafe(work).catch_unwind().await.is_err() {
                failed.await;
            }
        });
    }
    pub(super) async fn drain(&self) {
        let mut tasks = self.tasks.lock().await;
        while let Some(result) = tasks.join_next().await {
            if let Err(error) = result {
                tracing::error!(%error, "account file task did not finish normally");
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use tokio::sync::Semaphore;
    #[tokio::test]
    async fn account_file_tasks_remain_owned_after_a_cleanup_waiter_is_cancelled() {
        let tasks = Arc::new(AccountFileTasks::default());
        let gate = Arc::new(Semaphore::new(0));
        let blocked = gate.clone();
        tasks
            .spawn(
                async move {
                    let _permit = blocked.acquire().await.unwrap();
                },
                async {
                    panic!("the gate worker unexpectedly panicked");
                },
            )
            .await;
        let clearing = tasks.clone();
        let request = tokio::spawn(async move {
            clearing.drain().await;
        });
        tokio::time::timeout(std::time::Duration::from_secs(1), async {
            while tasks.tasks.try_lock().is_ok() {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        request.abort();
        assert!(request.await.unwrap_err().is_cancelled());
        assert_eq!(tasks.tasks.lock().await.len(), 1);
        let closing = tasks.clone();
        let shutdown = tokio::spawn(async move {
            closing.drain().await;
        });
        tokio::task::yield_now().await;
        assert!(!shutdown.is_finished());
        gate.add_permits(1);
        shutdown.await.unwrap();
        assert!(tasks.tasks.lock().await.is_empty());
    }
}
