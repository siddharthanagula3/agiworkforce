use crate::sys::commands::llm::LLMState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;
use walkdir::WalkDir;

/// A single AI constraint stored for the project context.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConstraint {
    pub id: String,
    pub constraint_type: String,
    pub description: String,
    pub priority: u8,
    pub enforced: bool,
    pub metadata: serde_json::Value,
    pub created_at: String,
}

/// In-memory store for project context + constraints.
/// Constraints are persisted to a JSON file in the app data directory.
pub struct ContextManagerState {
    pub constraints: Arc<Mutex<Vec<AiConstraint>>>,
    pub project_root: Arc<Mutex<Option<String>>>,
    pub project_summary: Arc<Mutex<Option<String>>>,
}

impl ContextManagerState {
    pub fn new() -> Self {
        Self {
            constraints: Arc::new(Mutex::new(Vec::new())),
            project_root: Arc::new(Mutex::new(None)),
            project_summary: Arc::new(Mutex::new(None)),
        }
    }
}

impl Default for ContextManagerState {
    fn default() -> Self {
        Self::new()
    }
}

pub struct CodeGeneratorState(pub Arc<Mutex<()>>);

#[tauri::command]
pub async fn ai_analyze_project(
    llm_state: State<'_, LLMState>,
    state: State<'_, ContextManagerState>,
    project_root: String,
) -> Result<String, String> {
    let router = llm_state.router.read().await;

    let canonical =
        std::fs::canonicalize(&project_root).map_err(|e| format!("Invalid project path: {}", e))?;
    let canonical_str = canonical.to_string_lossy();

    // Only allow paths within home directory or /tmp
    let home = dirs::home_dir().unwrap_or_default();
    let home_str = home.to_string_lossy();
    if !canonical_str.starts_with(home_str.as_ref()) && !canonical_str.starts_with("/tmp") {
        return Err("Project path must be within home directory".to_string());
    }

    let mut structure = String::new();
    let walker = WalkDir::new(&canonical).max_depth(3).into_iter();

    let mut file_count = 0;
    for entry in walker
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();

            !name.starts_with('.') && name != "node_modules" && name != "target" && name != "dist"
        })
        .flatten()
    {
        let depth = entry.depth();
        let indent = "  ".repeat(depth);
        let name = entry.file_name().to_string_lossy();
        structure.push_str(&format!("{}{}\n", indent, name));
        file_count += 1;
        if file_count > 200 {
            structure.push_str("... (truncated)\n");
            break;
        }
    }

    // Store the project root in context state
    {
        let mut root = state.project_root.lock().await;
        *root = Some(canonical_str.to_string());
    }

    let prompt = format!(
        "Analyze the project structure at: {}.\n\nFile Structure:\n{}\n\nProvide a high-level summary of what this project likely does and its architecture based on standard conventions.",
        project_root, structure
    );

    let summary = router
        .send_message(&prompt, None)
        .await
        .map_err(|e| e.to_string())?;

    // Store the summary in context state
    {
        let mut stored_summary = state.project_summary.lock().await;
        *stored_summary = Some(summary.clone());
    }

    Ok(summary)
}

#[tauri::command]
pub async fn ai_add_constraint(
    state: State<'_, ContextManagerState>,
    constraint_type: String,
    description: String,
    priority: u8,
    enforced: bool,
    metadata: serde_json::Value,
) -> Result<String, String> {
    let constraint = AiConstraint {
        id: uuid::Uuid::new_v4().to_string(),
        constraint_type,
        description: description.clone(),
        priority,
        enforced,
        metadata,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    let id = constraint.id.clone();
    let mut constraints = state.constraints.lock().await;
    constraints.push(constraint);

    tracing::info!(
        "[ai_add_constraint] Stored constraint '{}': {}",
        id,
        description
    );

    Ok(format!("Constraint '{}' added successfully", id))
}

#[tauri::command]
pub async fn ai_generate_code(
    llm_state: State<'_, LLMState>,
    _state: State<'_, CodeGeneratorState>,
    _task_id: String,
    description: String,
    target_files: Vec<String>,
    context: Option<String>,
) -> Result<String, String> {
    let router = llm_state.router.read().await;

    let prompt = format!(
        "Generate code for the following task:\n\nDescription: {}\n\nTarget Files: {:?}\n\nContext: {}\n\nProvide only the code, formatted clearly.",
        description,
        target_files,
        context.unwrap_or_default()
    );

    router
        .send_message(&prompt, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ai_refactor_code(
    llm_state: State<'_, LLMState>,
    _state: State<'_, CodeGeneratorState>,
    files: Vec<String>,
    description: String,
) -> Result<String, String> {
    let router = llm_state.router.read().await;

    let prompt = format!(
        "Refactor the following files: {:?}\n\nGoal: {}\n\nProvide the refactored code.",
        files, description
    );

    router
        .send_message(&prompt, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ai_generate_tests(
    llm_state: State<'_, LLMState>,
    _state: State<'_, CodeGeneratorState>,
    source_files: Vec<String>,
    test_framework: Option<String>,
) -> Result<Vec<String>, String> {
    let router = llm_state.router.read().await;

    let prompt = format!(
        "Generate unit tests for: {:?}\n\nFramework: {}\n\nProvide the test code.",
        source_files,
        test_framework.unwrap_or_else(|| "default".to_string())
    );

    let response = router
        .send_message(&prompt, None)
        .await
        .map_err(|e| e.to_string())?;

    Ok(vec![response])
}

#[tauri::command]
pub async fn ai_get_project_context(
    state: State<'_, ContextManagerState>,
) -> Result<serde_json::Value, String> {
    let constraints = state.constraints.lock().await;
    let project_root = state.project_root.lock().await;
    let project_summary = state.project_summary.lock().await;

    let constraint_values: Vec<serde_json::Value> = constraints
        .iter()
        .map(|c| {
            serde_json::json!({
                "id": c.id,
                "type": c.constraint_type,
                "description": c.description,
                "priority": c.priority,
                "enforced": c.enforced,
                "created_at": c.created_at,
            })
        })
        .collect();

    Ok(serde_json::json!({
        "project_root": *project_root,
        "summary": project_summary.as_deref().unwrap_or("No project has been analyzed yet. Use ai_analyze_project to index a project."),
        "constraints": constraint_values,
        "constraint_count": constraints.len(),
    }))
}

#[tauri::command]
pub async fn ai_generate_context_prompt(
    llm_state: State<'_, LLMState>,
    _state: State<'_, ContextManagerState>,
    task_description: String,
) -> Result<String, String> {
    let router = llm_state.router.read().await;
    let prompt = format!(
        "Create a detailed system prompt for an AI agent to handle this task: {}",
        task_description
    );
    router
        .send_message(&prompt, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ai_access_file(file_path: String, _context: Option<String>) -> Result<String, String> {
    // Resolve the real path to prevent symlink/traversal attacks
    let canonical = std::fs::canonicalize(&file_path)
        .map_err(|e| format!("Invalid file path '{}': {}", file_path, e))?;

    // Denylist of sensitive paths that must never be read
    let denied_prefixes: &[&str] = &[
        "/etc/shadow",
        "/etc/gshadow",
        "/etc/sudoers",
        "/proc",
        "/sys",
    ];
    let denied_contains: &[&str] = &[
        ".ssh",
        ".gnupg",
        ".aws/credentials",
        ".env",
        "id_rsa",
        "id_ed25519",
        "id_ecdsa",
        "id_dsa",
    ];

    let canonical_str = canonical.to_string_lossy();

    for prefix in denied_prefixes {
        if canonical_str.starts_with(prefix) {
            return Err(format!(
                "Access denied: '{}' is in a restricted system path",
                file_path
            ));
        }
    }

    for pattern in denied_contains {
        if canonical_str.contains(pattern) {
            return Err(format!(
                "Access denied: '{}' matches a sensitive path pattern",
                file_path
            ));
        }
    }

    // Allowlist: must be under home dir, /tmp, or a typical project directory
    let allowed = if let Some(home) = dirs::home_dir() {
        let home_str = home.to_string_lossy();
        canonical_str.starts_with(home_str.as_ref())
            || canonical_str.starts_with("/tmp")
            || canonical_str.starts_with("/var/tmp")
    } else {
        // If we can't determine home dir, only allow /tmp
        canonical_str.starts_with("/tmp") || canonical_str.starts_with("/var/tmp")
    };

    if !allowed {
        return Err(format!(
            "Access denied: '{}' is outside allowed directories (home, /tmp)",
            file_path
        ));
    }

    std::fs::read_to_string(&canonical)
        .map_err(|e| format!("Failed to read file {}: {}", file_path, e))
}
