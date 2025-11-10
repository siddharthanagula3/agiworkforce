/**
 * Task Persistence & Multi-App Coordination
 * Background execution, task resumption, and cross-app state management
 */
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Task status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TaskStatus {
    Pending,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

/// Task priority
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TaskPriority {
    Critical,
    High,
    Normal,
    Low,
}

/// Persisted task
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedTask {
    pub id: String,
    pub name: String,
    pub description: String,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    pub progress: f32, // 0.0 to 1.0
    pub created_at: u64,
    pub updated_at: u64,
    pub completed_at: Option<u64>,
    pub steps: Vec<TaskStep>,
    pub current_step: usize,
    pub context: HashMap<String, serde_json::Value>,
    pub requires_approval: bool,
    pub auto_resume: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskStep {
    pub name: String,
    pub status: TaskStatus,
    pub tool: String, // e.g., "browser", "file", "terminal"
    pub params: HashMap<String, serde_json::Value>,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
}

/// Task manager state
pub struct TaskManager {
    tasks: Arc<Mutex<HashMap<String, PersistedTask>>>,
    task_queue: Arc<Mutex<Vec<String>>>,
}

impl Default for TaskManager {
    fn default() -> Self {
        Self::new()
    }
}

impl TaskManager {
    pub fn new() -> Self {
        Self {
            tasks: Arc::new(Mutex::new(HashMap::new())),
            task_queue: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub async fn add_task(&self, task: PersistedTask) -> Result<String, String> {
        let mut tasks = self.tasks.lock().await;
        let task_id = task.id.clone();
        tasks.insert(task_id.clone(), task);

        let mut queue = self.task_queue.lock().await;
        queue.push(task_id.clone());

        Ok(task_id)
    }

    pub async fn get_task(&self, task_id: &str) -> Result<PersistedTask, String> {
        let tasks = self.tasks.lock().await;
        tasks
            .get(task_id)
            .cloned()
            .ok_or_else(|| format!("Task not found: {}", task_id))
    }

    pub async fn update_task(&self, task_id: &str, task: PersistedTask) -> Result<(), String> {
        let mut tasks = self.tasks.lock().await;
        tasks.insert(task_id.to_string(), task);
        Ok(())
    }

    pub async fn list_tasks(&self) -> Result<Vec<PersistedTask>, String> {
        let tasks = self.tasks.lock().await;
        Ok(tasks.values().cloned().collect())
    }

    pub async fn pause_task(&self, task_id: &str) -> Result<(), String> {
        let mut tasks = self.tasks.lock().await;
        if let Some(task) = tasks.get_mut(task_id) {
            task.status = TaskStatus::Paused;
            task.updated_at = current_timestamp();
            Ok(())
        } else {
            Err(format!("Task not found: {}", task_id))
        }
    }

    pub async fn resume_task(&self, task_id: &str) -> Result<(), String> {
        let mut tasks = self.tasks.lock().await;
        if let Some(task) = tasks.get_mut(task_id) {
            task.status = TaskStatus::Running;
            task.updated_at = current_timestamp();
            Ok(())
        } else {
            Err(format!("Task not found: {}", task_id))
        }
    }

    pub async fn cancel_task(&self, task_id: &str) -> Result<(), String> {
        let mut tasks = self.tasks.lock().await;
        if let Some(task) = tasks.get_mut(task_id) {
            task.status = TaskStatus::Cancelled;
            task.updated_at = current_timestamp();
            Ok(())
        } else {
            Err(format!("Task not found: {}", task_id))
        }
    }
}

/// Task manager wrapper for Tauri
pub struct TaskManagerWrapper(pub Arc<Mutex<TaskManager>>);

impl Default for TaskManagerWrapper {
    fn default() -> Self {
        Self::new()
    }
}

impl TaskManagerWrapper {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(TaskManager::new())))
    }
}

// Tauri commands

/// Create a new long-running task
#[tauri::command]
pub async fn task_create(
    name: String,
    description: String,
    steps: Vec<TaskStep>,
    auto_resume: bool,
    state: tauri::State<'_, TaskManagerWrapper>,
) -> Result<String, String> {
    tracing::info!("Creating task: {}", name);

    let task_id = uuid::Uuid::new_v4().to_string();
    let now = current_timestamp();

    let task = PersistedTask {
        id: task_id.clone(),
        name,
        description,
        status: TaskStatus::Pending,
        priority: TaskPriority::Normal,
        progress: 0.0,
        created_at: now,
        updated_at: now,
        completed_at: None,
        steps,
        current_step: 0,
        context: HashMap::new(),
        requires_approval: false,
        auto_resume,
    };

    let manager = state.0.lock().await;
    manager.add_task(task).await
}

/// Get task status
#[tauri::command]
pub async fn task_get_status(
    task_id: String,
    state: tauri::State<'_, TaskManagerWrapper>,
) -> Result<PersistedTask, String> {
    let manager = state.0.lock().await;
    manager.get_task(&task_id).await
}

/// Update task progress
#[tauri::command]
pub async fn task_update_progress(
    task_id: String,
    progress: f32,
    current_step: usize,
    state: tauri::State<'_, TaskManagerWrapper>,
) -> Result<(), String> {
    let manager = state.0.lock().await;
    let mut task = manager.get_task(&task_id).await?;

    task.progress = progress;
    task.current_step = current_step;
    task.updated_at = current_timestamp();

    manager.update_task(&task_id, task).await
}

/// Pause a running task
#[tauri::command]
pub async fn task_pause(
    task_id: String,
    state: tauri::State<'_, TaskManagerWrapper>,
) -> Result<(), String> {
    tracing::info!("Pausing task: {}", task_id);
    let manager = state.0.lock().await;
    manager.pause_task(&task_id).await
}

/// Resume a paused task
#[tauri::command]
pub async fn task_resume(
    task_id: String,
    state: tauri::State<'_, TaskManagerWrapper>,
) -> Result<(), String> {
    tracing::info!("Resuming task: {}", task_id);
    let manager = state.0.lock().await;
    manager.resume_task(&task_id).await
}

/// Cancel a task
#[tauri::command]
pub async fn task_cancel(
    task_id: String,
    state: tauri::State<'_, TaskManagerWrapper>,
) -> Result<(), String> {
    tracing::info!("Cancelling task: {}", task_id);
    let manager = state.0.lock().await;
    manager.cancel_task(&task_id).await
}

/// List all tasks
#[tauri::command]
pub async fn task_list(
    state: tauri::State<'_, TaskManagerWrapper>,
) -> Result<Vec<PersistedTask>, String> {
    let manager = state.0.lock().await;
    manager.list_tasks().await
}

/// List tasks by status
#[tauri::command]
pub async fn task_list_by_status(
    status: String,
    state: tauri::State<'_, TaskManagerWrapper>,
) -> Result<Vec<PersistedTask>, String> {
    let manager = state.0.lock().await;
    let all_tasks = manager.list_tasks().await?;

    let target_status = match status.as_str() {
        "pending" => TaskStatus::Pending,
        "running" => TaskStatus::Running,
        "paused" => TaskStatus::Paused,
        "completed" => TaskStatus::Completed,
        "failed" => TaskStatus::Failed,
        "cancelled" => TaskStatus::Cancelled,
        _ => return Err(format!("Invalid status: {}", status)),
    };

    Ok(all_tasks
        .into_iter()
        .filter(|t| t.status == target_status)
        .collect())
}

/// Mark task as completed
#[tauri::command]
pub async fn task_complete(
    task_id: String,
    result: Option<serde_json::Value>,
    state: tauri::State<'_, TaskManagerWrapper>,
) -> Result<(), String> {
    tracing::info!("Completing task: {}", task_id);

    let manager = state.0.lock().await;
    let mut task = manager.get_task(&task_id).await?;

    task.status = TaskStatus::Completed;
    task.progress = 1.0;
    task.completed_at = Some(current_timestamp());
    task.updated_at = current_timestamp();

    if let Some(result_data) = result {
        task.context.insert("result".to_string(), result_data);
    }

    manager.update_task(&task_id, task).await
}

/// Save task context (for resumption)
#[tauri::command]
pub async fn task_save_context(
    task_id: String,
    context: HashMap<String, serde_json::Value>,
    state: tauri::State<'_, TaskManagerWrapper>,
) -> Result<(), String> {
    let manager = state.0.lock().await;
    let mut task = manager.get_task(&task_id).await?;

    task.context = context;
    task.updated_at = current_timestamp();

    manager.update_task(&task_id, task).await
}

/// Get resumable tasks (for auto-resume on startup)
#[tauri::command]
pub async fn task_get_resumable(
    state: tauri::State<'_, TaskManagerWrapper>,
) -> Result<Vec<PersistedTask>, String> {
    let manager = state.0.lock().await;
    let all_tasks = manager.list_tasks().await?;

    Ok(all_tasks
        .into_iter()
        .filter(|t| {
            t.auto_resume && (t.status == TaskStatus::Paused || t.status == TaskStatus::Running)
        })
        .collect())
}

// Multi-app coordination state
pub struct CoordinationState {
    pub app_states: Arc<Mutex<HashMap<String, AppState>>>,
    pub approval_queue: Arc<Mutex<Vec<ApprovalRequest>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppState {
    pub app_name: String,
    pub status: String,
    pub last_action: String,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalRequest {
    pub id: String,
    pub task_id: String,
    pub action: String,
    pub description: String,
    pub auto_approve_safe: bool,
}

impl Default for CoordinationState {
    fn default() -> Self {
        Self::new()
    }
}

impl CoordinationState {
    pub fn new() -> Self {
        Self {
            app_states: Arc::new(Mutex::new(HashMap::new())),
            approval_queue: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

pub struct CoordinationStateWrapper(pub Arc<Mutex<CoordinationState>>);

impl Default for CoordinationStateWrapper {
    fn default() -> Self {
        Self::new()
    }
}

impl CoordinationStateWrapper {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(CoordinationState::new())))
    }
}

/// Update app state for coordination
#[tauri::command]
pub async fn coord_update_app_state(
    app_name: String,
    status: String,
    action: String,
    state: tauri::State<'_, CoordinationStateWrapper>,
) -> Result<(), String> {
    let coord = state.0.lock().await;
    let mut app_states = coord.app_states.lock().await;

    app_states.insert(
        app_name.clone(),
        AppState {
            app_name,
            status,
            last_action: action,
            timestamp: current_timestamp(),
        },
    );

    Ok(())
}

/// Request approval for action
#[tauri::command]
pub async fn coord_request_approval(
    task_id: String,
    action: String,
    description: String,
    auto_approve_safe: bool,
    state: tauri::State<'_, CoordinationStateWrapper>,
) -> Result<String, String> {
    let coord = state.0.lock().await;
    let mut queue = coord.approval_queue.lock().await;

    let request_id = uuid::Uuid::new_v4().to_string();

    queue.push(ApprovalRequest {
        id: request_id.clone(),
        task_id,
        action,
        description,
        auto_approve_safe,
    });

    Ok(request_id)
}

/// Get pending approvals
#[tauri::command]
pub async fn coord_get_pending_approvals(
    state: tauri::State<'_, CoordinationStateWrapper>,
) -> Result<Vec<ApprovalRequest>, String> {
    let coord = state.0.lock().await;
    let queue = coord.approval_queue.lock().await;
    Ok(queue.clone())
}

// Helper functions

fn current_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_task_creation() {
        let manager = TaskManager::new();
        let task = PersistedTask {
            id: "test-1".to_string(),
            name: "Test Task".to_string(),
            description: "Test".to_string(),
            status: TaskStatus::Pending,
            priority: TaskPriority::Normal,
            progress: 0.0,
            created_at: 0,
            updated_at: 0,
            completed_at: None,
            steps: vec![],
            current_step: 0,
            context: HashMap::new(),
            requires_approval: false,
            auto_resume: false,
        };

        let result = manager.add_task(task).await;
        assert!(result.is_ok());
    }
}
