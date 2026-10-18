use crate::features::productivity::{ProductivityManager, Provider, Task};
use crate::sys::error::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

pub struct ProductivityState {
    manager: Arc<Mutex<ProductivityManager>>,
}

impl ProductivityState {
    pub fn new() -> Self {
        Self {
            manager: Arc::new(Mutex::new(ProductivityManager::new())),
        }
    }

    pub fn manager(&self) -> Arc<Mutex<ProductivityManager>> {
        Arc::clone(&self.manager)
    }
}

impl Default for ProductivityState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateTaskResponse {
    pub task_id: String,
    pub success: bool,
}

pub async fn productivity_create_task(
    state: State<'_, ProductivityState>,
    provider: Provider,
    task: Task,
) -> Result<CreateTaskResponse> {
    tracing::info!("Creating task in {:?} provider: {}", provider, task.title);

    let manager = state.manager.lock().await;
    let task_id = manager.create_task(provider, task).await?;

    tracing::info!("Successfully created task, id: {}", task_id);

    Ok(CreateTaskResponse {
        task_id,
        success: true,
    })
}
