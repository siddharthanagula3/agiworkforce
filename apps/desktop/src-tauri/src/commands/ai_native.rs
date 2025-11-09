use crate::agent::code_generator::{CodeGenRequest, CodeGenResult, CodeGenerator};
/// Tauri commands for AI-native software engineering features
use crate::agent::context_manager::{Constraint, ConstraintType, ContextManager};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

/// ContextManager state
pub struct ContextManagerState(pub Arc<Mutex<ContextManager>>);

/// CodeGenerator state
pub struct CodeGeneratorState(pub Arc<Mutex<CodeGenerator>>);

/// Analyze project and build context
#[tauri::command]
pub async fn ai_analyze_project(
    state: State<'_, ContextManagerState>,
    project_root: String,
) -> Result<String, String> {
    let mut manager = state.0.lock().await;
    manager.set_project_root(PathBuf::from(project_root));
    manager
        .analyze_project()
        .await
        .map_err(|e| format!("Failed to analyze project: {}", e))?;

    let context = manager.get_project_context();
    Ok(format!(
        "Project analyzed: {} ({})",
        context.language, context.project_type
    ))
}

/// Add a constraint
#[tauri::command]
pub async fn ai_add_constraint(
    state: State<'_, ContextManagerState>,
    constraint_type: String,
    description: String,
    priority: u8,
    enforced: bool,
    metadata: serde_json::Value,
) -> Result<String, String> {
    let constraint_type = match constraint_type.as_str() {
        "code_style" => {
            let rules = metadata["rules"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            ConstraintType::CodeStyle { rules }
        }
        "performance" => {
            let requirements = metadata["requirements"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            ConstraintType::Performance { requirements }
        }
        "security" => {
            let requirements = metadata["requirements"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            ConstraintType::Security { requirements }
        }
        "architecture" => {
            let patterns = metadata["patterns"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            ConstraintType::Architecture { patterns }
        }
        "dependencies" => {
            let allowed = metadata["allowed"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            let forbidden = metadata["forbidden"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            ConstraintType::Dependencies { allowed, forbidden }
        }
        "testing" => {
            let requirements = metadata["requirements"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            ConstraintType::Testing { requirements }
        }
        "documentation" => {
            let requirements = metadata["requirements"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            ConstraintType::Documentation { requirements }
        }
        _ => return Err(format!("Unknown constraint type: {}", constraint_type)),
    };

    let constraint = Constraint {
        id: uuid::Uuid::new_v4().to_string(),
        constraint_type,
        priority,
        description,
        enforced,
    };

    let mut manager = state.0.lock().await;
    manager.add_constraint(constraint.clone());

    Ok(format!("Constraint added: {}", constraint.description))
}

/// Generate code based on description and constraints
#[tauri::command]
pub async fn ai_generate_code(
    state: State<'_, CodeGeneratorState>,
    task_id: String,
    description: String,
    target_files: Vec<String>,
    context: Option<String>,
) -> Result<CodeGenResult, String> {
    let generator = state.0.lock().await;

    // Get constraints from context manager
    let constraints = Vec::new(); // TODO: Get from context manager

    let request = CodeGenRequest {
        task_id,
        description,
        target_files: target_files.into_iter().map(PathBuf::from).collect(),
        constraints,
        context: context.unwrap_or_default(),
    };

    generator
        .generate_code(request)
        .await
        .map_err(|e| format!("Code generation failed: {}", e))
}

/// Refactor existing code
#[tauri::command]
pub async fn ai_refactor_code(
    state: State<'_, CodeGeneratorState>,
    files: Vec<String>,
    description: String,
) -> Result<CodeGenResult, String> {
    let generator = state.0.lock().await;

    generator
        .refactor_code(
            files.into_iter().map(PathBuf::from).collect(),
            description,
            Vec::new(), // TODO: Get constraints
        )
        .await
        .map_err(|e| format!("Refactoring failed: {}", e))
}

/// Generate tests for files
#[tauri::command]
pub async fn ai_generate_tests(
    state: State<'_, CodeGeneratorState>,
    source_files: Vec<String>,
    test_framework: Option<String>,
) -> Result<Vec<crate::agent::code_generator::GeneratedFile>, String> {
    let generator = state.0.lock().await;

    generator
        .generate_tests(
            source_files.into_iter().map(PathBuf::from).collect(),
            test_framework,
        )
        .await
        .map_err(|e| format!("Test generation failed: {}", e))
}

/// Get project context
#[tauri::command]
pub async fn ai_get_project_context(
    state: State<'_, ContextManagerState>,
) -> Result<serde_json::Value, String> {
    let manager = state.0.lock().await;
    let context = manager.get_project_context();

    serde_json::to_value(context).map_err(|e| format!("Serialization failed: {}", e))
}

/// Generate context prompt for LLM
#[tauri::command]
pub async fn ai_generate_context_prompt(
    state: State<'_, ContextManagerState>,
    task_description: String,
) -> Result<String, String> {
    let manager = state.0.lock().await;
    Ok(manager.generate_context_prompt(&task_description))
}

/// Intelligently access a file (with screenshot fallback)
#[tauri::command]
pub async fn ai_access_file(
    file_path: String,
    context: Option<String>,
) -> Result<crate::agent::intelligent_file_access::FileAccessResult, String> {
    use crate::agent::intelligent_file_access::IntelligentFileAccess;

    let file_access = IntelligentFileAccess::new()
        .map_err(|e| format!("Failed to initialize file access: {}", e))?;

    file_access
        .access_file(PathBuf::from(file_path).as_path(), context.as_deref())
        .await
        .map_err(|e| format!("File access failed: {}", e))
}
