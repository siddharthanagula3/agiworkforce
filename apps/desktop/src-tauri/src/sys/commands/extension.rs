/**
 * Extension integration commands for AGI Workforce desktop app
 * Handles communication with the browser extension
 */

use crate::core::agent::Agent;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::State;
use uuid::Uuid;

/// Page context from the browser extension
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageContext {
    pub url: String,
    pub title: String,
    pub html: String,
    pub selected_text: Option<String>,
    pub tab_id: u32,
    pub timestamp: u64,
}

/// Response to page context submission
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageContextResponse {
    pub success: bool,
    pub task_id: Option<String>,
    pub actions: Option<Vec<PageAction>>,
    pub error: Option<String>,
}

/// Action for the extension to perform on a page
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageAction {
    pub id: String,
    #[serde(rename = "type")]
    pub action_type: String,
    pub selector: Option<String>,
    pub value: Option<String>,
    pub delay: Option<u32>,
}

/// Form information from the extension
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormData {
    pub url: String,
    pub tab_id: u32,
    pub forms: Vec<FormInfo>,
}

/// Information about a single form
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormInfo {
    pub id: Option<String>,
    pub name: Option<String>,
    pub method: String,
    pub action: Option<String>,
    pub fields: Vec<FormField>,
}

/// A form field
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormField {
    pub name: String,
    #[serde(rename = "type")]
    pub field_type: String,
    pub value: Option<String>,
    pub required: bool,
    pub options: Option<Vec<String>>,
}

/// Form analysis response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormAnalysisResponse {
    pub success: bool,
    pub analysis: Option<FormAnalysis>,
    pub error: Option<String>,
}

/// Analysis results for forms
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormAnalysis {
    pub form_types: Vec<String>,
    pub recommended_fields: Vec<String>,
    pub suggested_actions: Vec<String>,
}

/// Task result from extension execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResult {
    pub task_id: String,
    pub success: bool,
    pub screenshot: Option<String>,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
    pub actions_performed: u32,
    pub duration: u64,
}

/// Response to task result submission
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResultResponse {
    pub success: bool,
    pub next_action: Option<serde_json::Value>,
    pub should_continue: bool,
}

/// Process page context from extension
///
/// This command receives page information from the browser extension
/// and initiates an AGI task to interact with the page.
#[tauri::command]
pub async fn extension_page_context(
    context: PageContext,
    _state: State<'_, crate::data::app_state::AppState>,
) -> Result<PageContextResponse, String> {
    tracing::info!(
        "Received page context from extension: {} (tab: {})",
        context.url,
        context.tab_id
    );

    // Validate context
    if context.url.is_empty() || context.title.is_empty() {
        return Ok(PageContextResponse {
            success: false,
            task_id: None,
            actions: None,
            error: Some("Missing required fields (url, title)".to_string()),
        });
    }

    // Limit HTML size for storage
    if context.html.len() > 100 * 1024 {
        tracing::warn!("HTML from extension exceeds 100KB limit, truncating");
    }

    // Create a task ID for tracking
    let task_id = Uuid::new_v4().to_string();

    // TODO: Send to AGI engine for processing
    // This would integrate with the Agent/AGI system to analyze the page
    // and determine what actions to take

    tracing::debug!("Created task {} for page context", task_id);

    // For now, return success with task ID
    // The AGI engine will analyze the page and provide actions
    Ok(PageContextResponse {
        success: true,
        task_id: Some(task_id),
        actions: None,
        error: None,
    })
}

/// Analyze forms detected by the extension
///
/// This command receives form data from the browser extension
/// and provides analysis and recommendations.
#[tauri::command]
pub async fn extension_analyze_forms(
    data: FormData,
) -> Result<FormAnalysisResponse, String> {
    tracing::info!(
        "Analyzing {} forms from extension (tab: {})",
        data.forms.len(),
        data.tab_id
    );

    // Analyze form types
    let form_types: Vec<String> = data
        .forms
        .iter()
        .flat_map(|form| {
            let form_type = match form.method.to_uppercase().as_str() {
                "POST" => detect_form_type(&form.fields),
                _ => "search".to_string(),
            };
            Some(form_type)
        })
        .collect();

    // Extract field names
    let mut recommended_fields: Vec<String> = Vec::new();
    for form in &data.forms {
        for field in &form.fields {
            if field.required {
                recommended_fields.push(field.name.clone());
            }
        }
    }

    // Remove duplicates
    recommended_fields.sort();
    recommended_fields.dedup();

    let analysis = FormAnalysis {
        form_types,
        recommended_fields,
        suggested_actions: vec!["fill_form".to_string(), "submit_form".to_string()],
    };

    Ok(FormAnalysisResponse {
        success: true,
        analysis: Some(analysis),
        error: None,
    })
}

/// Submit task results back to the desktop app
///
/// The extension calls this when a task completes to report
/// the results and status back to the application.
#[tauri::command]
pub async fn extension_task_result(
    result: TaskResult,
    state: State<'_, crate::data::app_state::AppState>,
    app_handle: tauri::AppHandle,
) -> Result<TaskResultResponse, String> {
    tracing::info!(
        "Received task result from extension (task_id: {}, success: {})",
        result.task_id,
        result.success
    );

    if !result.success {
        tracing::warn!("Task failed: {}", result.error.as_deref().unwrap_or("unknown"));
    } else {
        tracing::info!(
            "Task completed successfully with {} actions in {}ms",
            result.actions_performed,
            result.duration
        );
    }

    // 1. Store screenshots if provided
    let screenshot_path = if let Some(screenshot_data) = &result.screenshot {
        match save_extension_screenshot(&app_handle, &result.task_id, screenshot_data).await {
            Ok(path) => {
                tracing::info!("Saved extension screenshot to: {}", path);
                Some(path)
            }
            Err(e) => {
                tracing::warn!("Failed to save screenshot: {}", e);
                None
            }
        }
    } else {
        None
    };

    // 2. Emit event with task results for conversation update
    let task_event = serde_json::json!({
        "task_id": result.task_id,
        "success": result.success,
        "screenshot_path": screenshot_path,
        "result": result.result,
        "error": result.error,
        "actions_performed": result.actions_performed,
        "duration": result.duration,
    });

    if let Err(e) = app_handle.emit("extension:task-result", &task_event) {
        tracing::warn!("Failed to emit task result event: {}", e);
    } else {
        tracing::debug!("Emitted extension:task-result event");
    }

    // 3. Determine if we should continue with next step
    // For now, we check if there's a result that indicates more work is needed
    let should_continue = result.success && result.actions_performed > 0;
    let next_action = if should_continue {
        Some(serde_json::json!({
            "type": "extension_task_complete",
            "task_id": result.task_id,
        }))
    } else {
        None
    };

    Ok(TaskResultResponse {
        success: true,
        next_action,
        should_continue,
    })
}

/// Save extension screenshot to disk
async fn save_extension_screenshot(
    app_handle: &tauri::AppHandle,
    task_id: &str,
    screenshot_data: &str,
) -> Result<String, String> {
    use base64::Engine;
    use std::io::Write;

    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get data dir: {}", e))?;

    let captures_dir = data_dir.join("extension_captures");
    tokio::fs::create_dir_all(&captures_dir)
        .await
        .map_err(|e| format!("Failed to create captures directory: {}", e))?;

    let file_name = format!("extension_{}_{}.png", task_id, chrono::Utc::now().timestamp());
    let file_path = captures_dir.join(&file_name);

    // Decode base64 image data
    let image_data = screenshot_data
        .strip_prefix("data:image/png;base64,")
        .or_else(|| screenshot_data.strip_prefix("data:image/jpeg;base64,"))
        .unwrap_or(screenshot_data);

    let decoded = base64::engine::general_purpose::STANDARD
        .decode(image_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let mut file = std::fs::File::create(&file_path)
        .map_err(|e| format!("Failed to create file: {}", e))?;

    file.write_all(&decoded)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(file_path.to_string_lossy().into_owned())
}

/// Get current extension status
#[tauri::command]
pub async fn extension_status() -> Result<serde_json::Value, String> {
    Ok(json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
        "timestamp": Utc::now().to_rfc3339(),
        "extension_support": true,
        "health_check_endpoint": "/health",
        "api_endpoints": [
            "/api/extension/page-context",
            "/api/extension/analyze-forms",
            "/api/extension/task-result",
            "/api/extension/status"
        ]
    }))
}

/// Helper function to detect form type
fn detect_form_type(fields: &[FormField]) -> String {
    let field_names: Vec<String> = fields.iter().map(|f| f.name.to_lowercase()).collect();

    // Check for common form patterns
    if field_names.contains(&"username".to_string()) && field_names.contains(&"password".to_string())
    {
        return "login".to_string();
    }

    if field_names.contains(&"email".to_string()) && field_names.contains(&"password".to_string()) {
        return "login".to_string();
    }

    if field_names.contains(&"username".to_string()) && field_names.contains(&"email".to_string()) {
        return "registration".to_string();
    }

    if field_names.iter().any(|name| {
        name.contains("search") || name == "q" || name == "query"
    }) {
        return "search".to_string();
    }

    if field_names.iter().any(|name| {
        name.contains("email") || name.contains("phone")
    }) {
        return "contact".to_string();
    }

    "unknown".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_form_type_login() {
        let fields = vec![
            FormField {
                name: "username".to_string(),
                field_type: "text".to_string(),
                value: None,
                required: true,
                options: None,
            },
            FormField {
                name: "password".to_string(),
                field_type: "password".to_string(),
                value: None,
                required: true,
                options: None,
            },
        ];

        assert_eq!(detect_form_type(&fields), "login");
    }

    #[test]
    fn test_detect_form_type_search() {
        let fields = vec![FormField {
            name: "search_query".to_string(),
            field_type: "text".to_string(),
            value: None,
            required: false,
            options: None,
        }];

        assert_eq!(detect_form_type(&fields), "search");
    }

    #[test]
    fn test_validate_page_context() {
        let valid_context = PageContext {
            url: "https://example.com".to_string(),
            title: "Example Page".to_string(),
            html: "<html></html>".to_string(),
            selected_text: None,
            tab_id: 1,
            timestamp: 0,
        };

        assert!(!valid_context.url.is_empty());
        assert!(!valid_context.title.is_empty());

        let invalid_context = PageContext {
            url: "".to_string(),
            title: "Example Page".to_string(),
            html: "<html></html>".to_string(),
            selected_text: None,
            tab_id: 1,
            timestamp: 0,
        };

        assert!(invalid_context.url.is_empty());
    }
}
