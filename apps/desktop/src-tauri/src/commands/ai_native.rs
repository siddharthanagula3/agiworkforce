// TODO: These commands are currently stubbed out because they were part of the deleted
// agent/ module. The equivalent functionality exists in agi/ but has different APIs.
// These commands are NOT used by the frontend, so they're safely disabled for now.
// If needed in the future, they should be reimplemented using the agi/ module.

use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

/// Placeholder state - not actually used
pub struct ContextManagerState(pub Arc<Mutex<()>>);

/// Placeholder state - not actually used
pub struct CodeGeneratorState(pub Arc<Mutex<()>>);

/// Analyze project and build context (STUBBED - not implemented)
#[tauri::command]
pub async fn ai_analyze_project(
    _state: State<'_, ContextManagerState>,
    _project_root: String,
) -> Result<String, String> {
    Err("ai_analyze_project is not implemented. This command was part of the deleted agent/ module.".to_string())
}

/// Add a constraint (STUBBED - not implemented)
#[tauri::command]
pub async fn ai_add_constraint(
    _state: State<'_, ContextManagerState>,
    _constraint_type: String,
    _description: String,
    _priority: u8,
    _enforced: bool,
    _metadata: serde_json::Value,
) -> Result<String, String> {
    Err("ai_add_constraint is not implemented. This command was part of the deleted agent/ module.".to_string())
}

/// Generate code based on description and constraints (STUBBED - not implemented)
#[tauri::command]
pub async fn ai_generate_code(
    _state: State<'_, CodeGeneratorState>,
    _task_id: String,
    _description: String,
    _target_files: Vec<String>,
    _context: Option<String>,
) -> Result<String, String> {
    Err("ai_generate_code is not implemented. This command was part of the deleted agent/ module.".to_string())
}

/// Refactor existing code (STUBBED - not implemented)
#[tauri::command]
pub async fn ai_refactor_code(
    _state: State<'_, CodeGeneratorState>,
    _files: Vec<String>,
    _description: String,
) -> Result<String, String> {
    Err("ai_refactor_code is not implemented. This command was part of the deleted agent/ module.".to_string())
}

/// Generate tests for files (STUBBED - not implemented)
#[tauri::command]
pub async fn ai_generate_tests(
    _state: State<'_, CodeGeneratorState>,
    _source_files: Vec<String>,
    _test_framework: Option<String>,
) -> Result<Vec<String>, String> {
    Err("ai_generate_tests is not implemented. This command was part of the deleted agent/ module.".to_string())
}

/// Get project context (STUBBED - not implemented)
#[tauri::command]
pub async fn ai_get_project_context(
    _state: State<'_, ContextManagerState>,
) -> Result<serde_json::Value, String> {
    Err("ai_get_project_context is not implemented. This command was part of the deleted agent/ module.".to_string())
}

/// Generate context prompt for LLM (STUBBED - not implemented)
#[tauri::command]
pub async fn ai_generate_context_prompt(
    _state: State<'_, ContextManagerState>,
    _task_description: String,
) -> Result<String, String> {
    Err("ai_generate_context_prompt is not implemented. This command was part of the deleted agent/ module.".to_string())
}

/// Intelligently access a file (with screenshot fallback) (STUBBED - not implemented)
#[tauri::command]
pub async fn ai_access_file(
    _file_path: String,
    _context: Option<String>,
) -> Result<String, String> {
    Err("ai_access_file is not implemented. This command was part of the deleted agent/ module.".to_string())
}
