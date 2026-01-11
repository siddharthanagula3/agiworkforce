use crate::orchestration::{
    WorkflowDefinition, WorkflowEngine, WorkflowExecution, WorkflowExecutionLog, WorkflowExecutor,
    WorkflowScheduler,
};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;

/// State for workflow engine
pub struct WorkflowEngineState {
    pub engine: Arc<WorkflowEngine>,
    pub executor: Arc<WorkflowExecutor>,
    pub scheduler: Arc<WorkflowScheduler>,
}

impl WorkflowEngineState {
    pub fn new(db_path: String) -> Self {
        let engine = Arc::new(WorkflowEngine::new(db_path));
        let executor = Arc::new(WorkflowExecutor::new(Arc::clone(&engine)));
        let scheduler = Arc::new(WorkflowScheduler::new(
            Arc::clone(&engine),
            Arc::clone(&executor),
        ));

        Self {
            engine,
            executor,
            scheduler,
        }
    }
}

/// Create a new workflow
#[tauri::command]
pub fn create_workflow(
    definition: WorkflowDefinition,
    state: State<WorkflowEngineState>,
) -> Result<String, String> {
    state.engine.create_workflow(definition)
}

/// Update an existing workflow
#[tauri::command]
pub fn update_workflow(
    id: String,
    definition: WorkflowDefinition,
    state: State<WorkflowEngineState>,
) -> Result<(), String> {
    state.engine.update_workflow(&id, definition)
}

/// Delete a workflow
#[tauri::command]
pub fn delete_workflow(id: String, state: State<WorkflowEngineState>) -> Result<(), String> {
    state.engine.delete_workflow(&id)
}

/// Get a workflow by ID
#[tauri::command]
pub fn get_workflow(
    id: String,
    state: State<WorkflowEngineState>,
) -> Result<WorkflowDefinition, String> {
    state.engine.get_workflow(&id)
}

/// Get all workflows for a user
#[tauri::command]
pub fn get_user_workflows(
    user_id: String,
    state: State<WorkflowEngineState>,
) -> Result<Vec<WorkflowDefinition>, String> {
    state.engine.get_user_workflows(&user_id)
}

/// Execute a workflow
#[tauri::command]
pub async fn execute_workflow(
    workflow_id: String,
    inputs: HashMap<String, Value>,
    state: State<'_, WorkflowEngineState>,
) -> Result<String, String> {
    state.executor.execute_workflow(workflow_id, inputs).await
}

/// Pause a workflow execution
#[tauri::command]
pub fn pause_workflow(
    execution_id: String,
    state: State<WorkflowEngineState>,
) -> Result<(), String> {
    state.executor.pause_execution(&execution_id)
}

/// Resume a paused workflow execution
#[tauri::command]
pub fn resume_workflow(
    execution_id: String,
    state: State<WorkflowEngineState>,
) -> Result<(), String> {
    state.executor.resume_execution(&execution_id)
}

/// Cancel a workflow execution
#[tauri::command]
pub fn cancel_workflow(
    execution_id: String,
    state: State<WorkflowEngineState>,
) -> Result<(), String> {
    state.executor.cancel_execution(&execution_id)
}

/// Get workflow execution status
#[tauri::command]
pub fn get_workflow_status(
    execution_id: String,
    state: State<WorkflowEngineState>,
) -> Result<WorkflowExecution, String> {
    state.engine.get_execution_status(&execution_id)
}

/// Get execution logs
#[tauri::command]
pub fn get_execution_logs(
    execution_id: String,
    state: State<WorkflowEngineState>,
) -> Result<Vec<WorkflowExecutionLog>, String> {
    state.engine.get_execution_logs(&execution_id)
}

/// Schedule a workflow with cron expression
#[tauri::command]
pub fn schedule_workflow(
    workflow_id: String,
    cron_expr: String,
    timezone: Option<String>,
    state: State<WorkflowEngineState>,
) -> Result<(), String> {
    state
        .scheduler
        .schedule_workflow(&workflow_id, &cron_expr, timezone)
}

/// Trigger workflow on event
#[tauri::command]
pub async fn trigger_workflow_on_event(
    workflow_id: String,
    event_type: String,
    event_data: HashMap<String, Value>,
    state: State<'_, WorkflowEngineState>,
) -> Result<String, String> {
    state
        .scheduler
        .trigger_on_event(&workflow_id, &event_type, event_data)
        .await
}

/// Get next scheduled execution time for a cron expression
#[tauri::command]
pub fn get_next_execution_time(
    cron_expr: String,
    state: State<WorkflowEngineState>,
) -> Result<i64, String> {
    state.scheduler.get_next_execution_time(&cron_expr)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workflow_engine_state_creation() {
        let state = WorkflowEngineState::new(":memory:".to_string());
        assert!(Arc::strong_count(&state.engine) >= 1);
        assert!(Arc::strong_count(&state.executor) >= 1);
        assert!(Arc::strong_count(&state.scheduler) >= 1);
    }
}
