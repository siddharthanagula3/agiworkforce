use crate::ai_employees::*;
use std::collections::HashMap;
use std::result::Result as StdResult;
use std::sync::{Arc, Mutex};
use tauri::State;

/// State wrapper for AI Employee system
pub struct AIEmployeeState {
    pub executor: Arc<executor::AIEmployeeExecutor>,
    pub marketplace: Arc<Mutex<marketplace::EmployeeMarketplace>>,
    pub registry: Arc<Mutex<registry::AIEmployeeRegistry>>,
}

/// Get all available AI employees
#[tauri::command]
pub async fn ai_employees_get_all(
    state: State<'_, AIEmployeeState>,
) -> StdResult<Vec<AIEmployee>, String> {
    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    registry.get_all().map_err(|e| e.to_string())
}

/// Get employee by ID
#[tauri::command]
pub async fn ai_employees_get_by_id(
    employee_id: String,
    state: State<'_, AIEmployeeState>,
) -> StdResult<AIEmployee, String> {
    let marketplace = state.marketplace.lock().map_err(|e| e.to_string())?;
    marketplace
        .get_employee_by_id(&employee_id)
        .map_err(|e| e.to_string())
}

/// Search employees with filters
#[tauri::command]
pub async fn ai_employees_search(
    query: String,
    filters: EmployeeFilters,
    state: State<'_, AIEmployeeState>,
) -> StdResult<Vec<AIEmployee>, String> {
    let marketplace = state.marketplace.lock().map_err(|e| e.to_string())?;
    marketplace
        .search_employees(&query, filters)
        .map_err(|e| e.to_string())
}

/// Get featured employees
#[tauri::command]
pub async fn ai_employees_get_featured(
    state: State<'_, AIEmployeeState>,
) -> StdResult<Vec<AIEmployee>, String> {
    let marketplace = state.marketplace.lock().map_err(|e| e.to_string())?;
    marketplace
        .get_featured_employees()
        .map_err(|e| e.to_string())
}

/// Get employees by category
#[tauri::command]
pub async fn ai_employees_get_by_category(
    category: String,
    state: State<'_, AIEmployeeState>,
) -> StdResult<Vec<AIEmployee>, String> {
    let marketplace = state.marketplace.lock().map_err(|e| e.to_string())?;
    marketplace
        .get_employees_by_category(&category)
        .map_err(|e| e.to_string())
}

/// Hire an employee
#[tauri::command]
pub async fn ai_employees_hire(
    employee_id: String,
    user_id: String,
    state: State<'_, AIEmployeeState>,
) -> StdResult<String, String> {
    state
        .executor
        .hire(&employee_id, &user_id)
        .await
        .map_err(|e| e.to_string())
}

/// Fire (deactivate) an employee
#[tauri::command]
pub async fn ai_employees_fire(
    user_employee_id: String,
    state: State<'_, AIEmployeeState>,
) -> StdResult<(), String> {
    state
        .executor
        .fire(&user_employee_id)
        .await
        .map_err(|e| e.to_string())
}

/// Get user's hired employees
#[tauri::command]
pub async fn ai_employees_get_user_employees(
    user_id: String,
    state: State<'_, AIEmployeeState>,
) -> StdResult<Vec<UserEmployee>, String> {
    let marketplace = state.marketplace.lock().map_err(|e| e.to_string())?;
    marketplace
        .get_user_employees(&user_id)
        .map_err(|e| e.to_string())
}

/// Assign a task to an employee
#[tauri::command]
pub async fn ai_employees_assign_task(
    user_employee_id: String,
    task_type: String,
    input_data: HashMap<String, serde_json::Value>,
    state: State<'_, AIEmployeeState>,
) -> StdResult<EmployeeTask, String> {
    state
        .executor
        .assign_task(&user_employee_id, task_type, input_data)
        .await
        .map_err(|e| e.to_string())
}

/// Execute a task
#[tauri::command]
pub async fn ai_employees_execute_task(
    task_id: String,
    state: State<'_, AIEmployeeState>,
) -> StdResult<TaskResult, String> {
    state
        .executor
        .execute_task(&task_id)
        .await
        .map_err(|e| e.to_string())
}

/// Get task status
#[tauri::command]
pub async fn ai_employees_get_task_status(
    task_id: String,
    state: State<'_, AIEmployeeState>,
) -> StdResult<EmployeeTask, String> {
    state
        .executor
        .get_task_status(&task_id)
        .await
        .map_err(|e| e.to_string())
}

/// List all tasks for a user employee
#[tauri::command]
pub async fn ai_employees_list_tasks(
    user_employee_id: String,
    state: State<'_, AIEmployeeState>,
) -> StdResult<Vec<EmployeeTask>, String> {
    state
        .executor
        .list_tasks(&user_employee_id)
        .await
        .map_err(|e| e.to_string())
}

/// Run a demo workflow for an employee
#[tauri::command]
pub async fn ai_employees_run_demo(
    employee_id: String,
    state: State<'_, AIEmployeeState>,
) -> StdResult<DemoResult, String> {
    state
        .executor
        .run_demo(&employee_id)
        .await
        .map_err(|e| e.to_string())
}

/// Get employee statistics
#[tauri::command]
pub async fn ai_employees_get_stats(
    employee_id: String,
    state: State<'_, AIEmployeeState>,
) -> StdResult<EmployeeStats, String> {
    let marketplace = state.marketplace.lock().map_err(|e| e.to_string())?;
    marketplace
        .get_employee_stats(&employee_id)
        .map_err(|e| e.to_string())
}

/// Publish a custom employee
#[tauri::command]
pub async fn ai_employees_publish(
    employee: AIEmployee,
    creator_id: String,
    state: State<'_, AIEmployeeState>,
) -> StdResult<String, String> {
    let marketplace = state.marketplace.lock().map_err(|e| e.to_string())?;
    marketplace
        .publish_employee(employee, &creator_id)
        .map_err(|e| e.to_string())
}

/// Update a custom employee configuration
#[tauri::command]
pub async fn update_custom_employee(
    employee_id: String,
    config: AIEmployee,
    state: State<'_, AIEmployeeState>,
) -> StdResult<(), String> {
    let marketplace = state.marketplace.lock().map_err(|e| e.to_string())?;
    marketplace
        .update_employee(&employee_id, config)
        .map_err(|e| e.to_string())
}

/// Delete a custom employee
#[tauri::command]
pub async fn delete_custom_employee(
    employee_id: String,
    state: State<'_, AIEmployeeState>,
) -> StdResult<(), String> {
    let marketplace = state.marketplace.lock().map_err(|e| e.to_string())?;
    marketplace
        .delete_employee(&employee_id)
        .map_err(|e| e.to_string())
}

/// Publish employee to marketplace with metadata
#[tauri::command]
pub async fn publish_employee_to_marketplace(
    employee_id: String,
    creator_id: String,
    is_public: bool,
    state: State<'_, AIEmployeeState>,
) -> StdResult<String, String> {
    let marketplace = state.marketplace.lock().map_err(|e| e.to_string())?;
    marketplace
        .publish_to_marketplace(&employee_id, &creator_id, is_public)
        .map_err(|e| e.to_string())
}

/// Initialize the AI employee system
#[tauri::command]
pub async fn ai_employees_initialize(
    state: State<'_, AIEmployeeState>,
) -> StdResult<usize, String> {
    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    registry.initialize().map_err(|e| e.to_string())?;
    registry.count().map_err(|e| e.to_string())
}
