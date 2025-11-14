/**
 * Inline Code Editing & Composer Mode
 * Similar to Claude Code and Cursor's inline editing with diff views
 */
use crate::router::{ChatMessage, LLMRequest, LLMRouter, RouterPreferences};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeEdit {
    pub id: String,
    pub file_path: PathBuf,
    pub original_content: String,
    pub modified_content: String,
    pub diff: String,
    pub description: String,
    pub status: EditStatus,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum EditStatus {
    Pending,
    Applied,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComposerSession {
    pub id: String,
    pub edits: Vec<CodeEdit>,
    pub prompt: String,
    pub context_files: Vec<PathBuf>,
    pub status: String,
    pub created_at: u64,
}

pub struct CodeEditingState {
    pub edits: Arc<Mutex<HashMap<String, CodeEdit>>>,
    pub composer_sessions: Arc<Mutex<HashMap<String, ComposerSession>>>,
}

impl CodeEditingState {
    pub fn new() -> Self {
        Self {
            edits: Arc::new(Mutex::new(HashMap::new())),
            composer_sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl Default for CodeEditingState {
    fn default() -> Self {
        Self::new()
    }
}

/// Generate inline code edit suggestion
#[tauri::command]
pub async fn code_generate_edit(
    file_path: PathBuf,
    selection: String,
    instruction: String,
    router_state: State<'_, Arc<Mutex<LLMRouter>>>,
    edit_state: State<'_, Arc<Mutex<CodeEditingState>>>,
) -> Result<CodeEdit, String> {
    tracing::info!("Generating code edit for: {:?}", file_path);

    // Read current file content
    let original_content =
        std::fs::read_to_string(&file_path).map_err(|e| format!("Failed to read file: {}", e))?;

    // Build prompt for LLM
    let prompt = format!(
        r#"You are an expert code editor. Edit the following code according to the instruction.

FILE: {:?}

CURRENT CODE:
```
{}
```

SELECTED CODE:
```
{}
```

INSTRUCTION: {}

Respond ONLY with the modified code. Do not include explanations or markdown formatting."#,
        file_path.file_name().unwrap(),
        original_content,
        selection,
        instruction
    );

    let llm_request = LLMRequest {
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: prompt,
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }],
        model: "".to_string(), // Will be set by router
        max_tokens: Some(4000),
        temperature: Some(0.3),
        stream: false,
        tools: None,
        tool_choice: None,
    };

    let router = router_state.lock().await;
    let preferences = RouterPreferences::default();
    let candidates = router.candidates(&llm_request, &preferences);

    if candidates.is_empty() {
        return Err("No LLM providers configured".to_string());
    }

    let outcome = router
        .invoke_candidate(&candidates[0], &llm_request)
        .await
        .map_err(|e| format!("LLM request failed: {}", e))?;

    let modified_content = outcome.response.content.trim().to_string();

    // Generate diff
    let diff = generate_diff(&original_content, &modified_content);

    let edit_id = uuid::Uuid::new_v4().to_string();
    let edit = CodeEdit {
        id: edit_id.clone(),
        file_path,
        original_content,
        modified_content,
        diff,
        description: instruction,
        status: EditStatus::Pending,
        created_at: current_timestamp(),
    };

    // Store edit
    let editing_state = edit_state.lock().await;
    let mut edits = editing_state.edits.lock().await;
    edits.insert(edit_id.clone(), edit.clone());

    Ok(edit)
}

/// Apply code edit
#[tauri::command]
pub async fn code_apply_edit(
    edit_id: String,
    edit_state: State<'_, Arc<Mutex<CodeEditingState>>>,
) -> Result<(), String> {
    tracing::info!("Applying code edit: {}", edit_id);

    let editing_state = edit_state.lock().await;
    let mut edits = editing_state.edits.lock().await;

    let edit = edits.get_mut(&edit_id).ok_or("Edit not found")?;

    // Write modified content to file
    std::fs::write(&edit.file_path, &edit.modified_content)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    edit.status = EditStatus::Applied;

    Ok(())
}

/// Reject code edit
#[tauri::command]
pub async fn code_reject_edit(
    edit_id: String,
    edit_state: State<'_, Arc<Mutex<CodeEditingState>>>,
) -> Result<(), String> {
    tracing::info!("Rejecting code edit: {}", edit_id);

    let editing_state = edit_state.lock().await;
    let mut edits = editing_state.edits.lock().await;

    let edit = edits.get_mut(&edit_id).ok_or("Edit not found")?;

    edit.status = EditStatus::Rejected;

    Ok(())
}

/// Start composer session for multi-file changes
#[tauri::command]
pub async fn composer_start_session(
    prompt: String,
    context_files: Vec<PathBuf>,
    router_state: State<'_, Arc<Mutex<LLMRouter>>>,
    edit_state: State<'_, Arc<Mutex<CodeEditingState>>>,
) -> Result<ComposerSession, String> {
    tracing::info!(
        "Starting composer session with {} context files",
        context_files.len()
    );

    let session_id = uuid::Uuid::new_v4().to_string();

    // Read context files
    let mut context_content = String::new();
    for file_path in &context_files {
        if let Ok(content) = std::fs::read_to_string(file_path) {
            context_content.push_str(&format!(
                "\n\nFILE: {:?}\n```\n{}\n```\n",
                file_path.file_name().unwrap(),
                content
            ));
        }
    }

    // Build prompt for LLM
    let llm_prompt = format!(
        r#"You are an expert software engineer. Analyze the following code and implement the requested changes across multiple files.

CONTEXT FILES:
{}

REQUEST: {}

For each file that needs changes, provide:
1. File path
2. Complete modified content
3. Brief explanation of changes

Format your response as JSON:
[
  {{
    "file_path": "path/to/file",
    "content": "complete file content after changes",
    "explanation": "what was changed and why"
  }}
]"#,
        context_content, prompt
    );

    let llm_request = LLMRequest {
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: llm_prompt,
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }],
        model: "".to_string(), // Will be set by router
        max_tokens: Some(8000),
        temperature: Some(0.4),
        stream: false,
        tools: None,
        tool_choice: None,
    };

    let router = router_state.lock().await;
    let preferences = RouterPreferences::default();
    let candidates = router.candidates(&llm_request, &preferences);

    if candidates.is_empty() {
        return Err("No LLM providers configured".to_string());
    }

    let outcome = router
        .invoke_candidate(&candidates[0], &llm_request)
        .await
        .map_err(|e| format!("LLM request failed: {}", e))?;

    // Parse response
    let json_str = extract_json(&outcome.response.content)?;
    let file_changes: Vec<serde_json::Value> =
        serde_json::from_str(&json_str).map_err(|e| format!("Failed to parse response: {}", e))?;

    // Create edits for each file
    let mut edits = Vec::new();
    for change in file_changes {
        let file_path = PathBuf::from(change["file_path"].as_str().ok_or("Missing file_path")?);
        let modified_content = change["content"]
            .as_str()
            .ok_or("Missing content")?
            .to_string();
        let explanation = change["explanation"]
            .as_str()
            .unwrap_or("No explanation provided")
            .to_string();

        // Read original content
        let original_content = std::fs::read_to_string(&file_path).unwrap_or_default();

        // Generate diff
        let diff = generate_diff(&original_content, &modified_content);

        let edit_id = uuid::Uuid::new_v4().to_string();
        let edit = CodeEdit {
            id: edit_id.clone(),
            file_path,
            original_content,
            modified_content,
            diff,
            description: explanation,
            status: EditStatus::Pending,
            created_at: current_timestamp(),
        };

        edits.push(edit);
    }

    let session = ComposerSession {
        id: session_id.clone(),
        edits,
        prompt,
        context_files,
        status: "pending".to_string(),
        created_at: current_timestamp(),
    };

    // Store session
    let editing_state = edit_state.lock().await;
    let mut sessions = editing_state.composer_sessions.lock().await;
    sessions.insert(session_id.clone(), session.clone());

    Ok(session)
}

/// Apply all changes from composer session
#[tauri::command]
pub async fn composer_apply_session(
    session_id: String,
    edit_state: State<'_, Arc<Mutex<CodeEditingState>>>,
) -> Result<(), String> {
    tracing::info!("Applying composer session: {}", session_id);

    let editing_state = edit_state.lock().await;
    let mut sessions = editing_state.composer_sessions.lock().await;

    let session = sessions.get_mut(&session_id).ok_or("Session not found")?;

    // Apply all edits
    for edit in &mut session.edits {
        std::fs::write(&edit.file_path, &edit.modified_content)
            .map_err(|e| format!("Failed to write file {:?}: {}", edit.file_path, e))?;
        edit.status = EditStatus::Applied;
    }

    session.status = "applied".to_string();

    Ok(())
}

/// Get composer session
#[tauri::command]
pub async fn composer_get_session(
    session_id: String,
    edit_state: State<'_, Arc<Mutex<CodeEditingState>>>,
) -> Result<ComposerSession, String> {
    let editing_state = edit_state.lock().await;
    let sessions = editing_state.composer_sessions.lock().await;

    sessions
        .get(&session_id)
        .cloned()
        .ok_or_else(|| format!("Session not found: {}", session_id))
}

/// List all pending edits
#[tauri::command]
pub async fn code_list_pending_edits(
    edit_state: State<'_, Arc<Mutex<CodeEditingState>>>,
) -> Result<Vec<CodeEdit>, String> {
    let editing_state = edit_state.lock().await;
    let edits = editing_state.edits.lock().await;

    Ok(edits
        .values()
        .filter(|e| e.status == EditStatus::Pending)
        .cloned()
        .collect())
}

// Helper functions

fn generate_diff(original: &str, modified: &str) -> String {
    // Simple line-by-line diff
    let original_lines: Vec<&str> = original.lines().collect();
    let modified_lines: Vec<&str> = modified.lines().collect();

    let mut diff = String::new();
    let max_lines = original_lines.len().max(modified_lines.len());

    for i in 0..max_lines {
        let orig = original_lines.get(i);
        let modif = modified_lines.get(i);

        match (orig, modif) {
            (Some(o), Some(m)) if o != m => {
                diff.push_str(&format!("-{}\n+{}\n", o, m));
            }
            (Some(o), None) => {
                diff.push_str(&format!("-{}\n", o));
            }
            (None, Some(m)) => {
                diff.push_str(&format!("+{}\n", m));
            }
            _ => {}
        }
    }

    diff
}

fn extract_json(text: &str) -> Result<String, String> {
    // Try to find JSON array or object
    if let Some(start) = text.find('[') {
        if let Some(end) = text.rfind(']') {
            return Ok(text[start..=end].to_string());
        }
    }
    if let Some(start) = text.find('{') {
        if let Some(end) = text.rfind('}') {
            return Ok(text[start..=end].to_string());
        }
    }
    Err("No JSON found in response".to_string())
}

fn current_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

/// Enhanced diff generation with hunk-level granularity
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    pub file_path: String,
    pub hunks: Vec<DiffHunk>,
    pub stats: DiffStats,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffHunk {
    pub old_start: usize,
    pub old_lines: usize,
    pub new_start: usize,
    pub new_lines: usize,
    pub changes: Vec<LineChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LineChange {
    #[serde(rename = "type")]
    pub change_type: String, // "add" | "delete" | "context"
    pub old_line_number: Option<usize>,
    pub new_line_number: Option<usize>,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffStats {
    pub additions: usize,
    pub deletions: usize,
    pub changes: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChange {
    pub path: String,
    pub original_content: String,
    pub modified_content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplyResult {
    pub success: bool,
    pub files_modified: Vec<String>,
    pub errors: Vec<String>,
}

/// Generate detailed file diff with hunks
#[tauri::command]
pub async fn get_file_diff(
    file_path: String,
    original: String,
    modified: String,
) -> Result<FileDiff, String> {
    tracing::info!("Generating diff for: {}", file_path);

    let original_lines: Vec<&str> = original.lines().collect();
    let modified_lines: Vec<&str> = modified.lines().collect();

    let mut hunks = Vec::new();
    let mut additions = 0;
    let mut deletions = 0;

    // Simple line-by-line diff algorithm
    // In production, you'd use a proper diff library like similar or diff
    let mut i = 0;
    let mut j = 0;

    while i < original_lines.len() || j < modified_lines.len() {
        let mut changes = Vec::new();
        let hunk_start_old = i;
        let hunk_start_new = j;

        // Collect context and changes for this hunk
        let mut context_before = Vec::new();
        let mut hunk_changes = Vec::new();
        let mut context_after = Vec::new();

        // Simplified diff: compare lines directly
        while i < original_lines.len() || j < modified_lines.len() {
            if i >= original_lines.len() {
                // Only new lines left
                hunk_changes.push(LineChange {
                    change_type: "add".to_string(),
                    old_line_number: None,
                    new_line_number: Some(j + 1),
                    content: modified_lines[j].to_string(),
                });
                additions += 1;
                j += 1;
            } else if j >= modified_lines.len() {
                // Only old lines left
                hunk_changes.push(LineChange {
                    change_type: "delete".to_string(),
                    old_line_number: Some(i + 1),
                    new_line_number: None,
                    content: original_lines[i].to_string(),
                });
                deletions += 1;
                i += 1;
            } else if original_lines[i] == modified_lines[j] {
                // Lines match - context
                hunk_changes.push(LineChange {
                    change_type: "context".to_string(),
                    old_line_number: Some(i + 1),
                    new_line_number: Some(j + 1),
                    content: original_lines[i].to_string(),
                });
                i += 1;
                j += 1;
            } else {
                // Lines differ
                hunk_changes.push(LineChange {
                    change_type: "delete".to_string(),
                    old_line_number: Some(i + 1),
                    new_line_number: None,
                    content: original_lines[i].to_string(),
                });
                hunk_changes.push(LineChange {
                    change_type: "add".to_string(),
                    old_line_number: None,
                    new_line_number: Some(j + 1),
                    content: modified_lines[j].to_string(),
                });
                deletions += 1;
                additions += 1;
                i += 1;
                j += 1;
            }

            // Break into hunks every 50 lines or at the end
            if hunk_changes.len() > 50 || (i >= original_lines.len() && j >= modified_lines.len()) {
                break;
            }
        }

        if !hunk_changes.is_empty() {
            let old_lines = i - hunk_start_old;
            let new_lines = j - hunk_start_new;

            hunks.push(DiffHunk {
                old_start: hunk_start_old + 1,
                old_lines,
                new_start: hunk_start_new + 1,
                new_lines,
                changes: hunk_changes,
            });
        }

        if i >= original_lines.len() && j >= modified_lines.len() {
            break;
        }
    }

    // If no hunks were created, create a single hunk with all changes
    if hunks.is_empty() {
        let mut all_changes = Vec::new();
        for (idx, line) in original_lines.iter().enumerate() {
            all_changes.push(LineChange {
                change_type: "context".to_string(),
                old_line_number: Some(idx + 1),
                new_line_number: Some(idx + 1),
                content: line.to_string(),
            });
        }
        hunks.push(DiffHunk {
            old_start: 1,
            old_lines: original_lines.len(),
            new_start: 1,
            new_lines: modified_lines.len(),
            changes: all_changes,
        });
    }

    Ok(FileDiff {
        file_path,
        hunks,
        stats: DiffStats {
            additions,
            deletions,
            changes: additions + deletions,
        },
    })
}

/// Apply multiple file changes
#[tauri::command]
pub async fn apply_changes(changes: Vec<FileChange>) -> Result<ApplyResult, String> {
    tracing::info!("Applying {} file changes", changes.len());

    let mut files_modified = Vec::new();
    let mut errors = Vec::new();

    for change in changes {
        match std::fs::write(&change.path, &change.modified_content) {
            Ok(_) => {
                files_modified.push(change.path.clone());
                tracing::info!("Applied changes to: {}", change.path);
            }
            Err(e) => {
                let error_msg = format!("Failed to write {}: {}", change.path, e);
                errors.push(error_msg.clone());
                tracing::error!("{}", error_msg);
            }
        }
    }

    Ok(ApplyResult {
        success: errors.is_empty(),
        files_modified,
        errors,
    })
}

/// Revert changes to files
#[tauri::command]
pub async fn revert_changes(file_paths: Vec<String>) -> Result<(), String> {
    tracing::info!("Reverting {} files", file_paths.len());

    for path in file_paths {
        // In a real implementation, you'd restore from backup or git
        tracing::warn!("Revert not implemented for: {}", path);
    }

    Ok(())
}
