/**
 * Extension integration commands for AGI Workforce desktop app
 * Handles communication with the browser extension
 */
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Mutex;
use tauri::Emitter;
use tauri::Manager;
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

/// Global storage for the latest page context received from the browser extension.
/// Read by chat/mod.rs when building the LLM system prompt.
pub static LATEST_PAGE_CONTEXT: Mutex<Option<PageContext>> = Mutex::new(None);

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

/// Shared page-context processing used by both Tauri command and native transport paths.
pub(crate) async fn process_page_context_event(
    context: PageContext,
    app_handle: &tauri::AppHandle,
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

    // Store the latest page context so chat can inject it into the LLM system prompt
    if let Ok(mut guard) = LATEST_PAGE_CONTEXT.lock() {
        *guard = Some(context.clone());
    }

    // Limit HTML size for in-memory analysis/event payloads
    let html_for_analysis = if context.html.len() > 100 * 1024 {
        tracing::warn!("HTML from extension exceeds 100KB limit, truncating for analysis");
        context.html.chars().take(100 * 1024).collect::<String>()
    } else {
        context.html.clone()
    };

    // Create a task ID for tracking
    let task_id = Uuid::new_v4().to_string();
    let actions = plan_page_actions(&context, &html_for_analysis);

    tracing::debug!("Created task {} for page context", task_id);

    let event_payload = json!({
        "task_id": task_id,
        "url": context.url,
        "title": context.title,
        "tab_id": context.tab_id,
        "timestamp": context.timestamp,
        "selected_text": context.selected_text,
        "actions": actions.clone(),
    });
    if let Err(e) = app_handle.emit("extension:page-context", &event_payload) {
        tracing::warn!("Failed to emit extension:page-context event: {}", e);
    }

    Ok(PageContextResponse {
        success: true,
        task_id: Some(task_id),
        actions: Some(actions),
        error: None,
    })
}

/// Shared task-result processing used by both Tauri command and native transport paths.
pub(crate) async fn process_task_result_event(
    result: TaskResult,
    app_handle: &tauri::AppHandle,
) -> Result<TaskResultResponse, String> {
    tracing::info!(
        "Received task result from extension (task_id: {}, success: {})",
        result.task_id,
        result.success
    );

    if !result.success {
        tracing::warn!(
            "Task failed: {}",
            result.error.as_deref().unwrap_or("unknown")
        );
    } else {
        tracing::info!(
            "Task completed successfully with {} actions in {}ms",
            result.actions_performed,
            result.duration
        );
    }

    // 1. Store screenshots if provided
    let screenshot_path = if let Some(screenshot_data) = &result.screenshot {
        match save_extension_screenshot(app_handle, &result.task_id, screenshot_data).await {
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

/// Process page context from extension
///
/// This command receives page information from the browser extension
/// and initiates an AGI task to interact with the page.
#[tauri::command]
pub async fn extension_page_context(
    context: PageContext,
    _state: State<'_, crate::AppState>,
    app_handle: tauri::AppHandle,
) -> Result<PageContextResponse, String> {
    process_page_context_event(context, &app_handle).await
}

/// Analyze forms detected by the extension
///
/// This command receives form data from the browser extension
/// and provides analysis and recommendations.
#[tauri::command]
pub async fn extension_analyze_forms(data: FormData) -> Result<FormAnalysisResponse, String> {
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
    _state: State<'_, crate::AppState>,
    app_handle: tauri::AppHandle,
) -> Result<TaskResultResponse, String> {
    process_task_result_event(result, &app_handle).await
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

    let file_name = format!(
        "extension_{}_{}.png",
        task_id,
        chrono::Utc::now().timestamp()
    );
    let file_path = captures_dir.join(&file_name);

    // Decode base64 image data
    let image_data = screenshot_data
        .strip_prefix("data:image/png;base64,")
        .or_else(|| screenshot_data.strip_prefix("data:image/jpeg;base64,"))
        .unwrap_or(screenshot_data);

    let decoded = base64::engine::general_purpose::STANDARD
        .decode(image_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let mut file =
        std::fs::File::create(&file_path).map_err(|e| format!("Failed to create file: {}", e))?;

    file.write_all(&decoded)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(file_path.to_string_lossy().into_owned())
}

/// Get current extension status
#[tauri::command]
pub async fn extension_status(app_handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let (token_path, token_exists, token_valid, token_error) =
        match app_handle.path().app_data_dir() {
            Ok(app_data_dir) => {
                let path = app_data_dir.join(".ipc_token");
                match std::fs::read_to_string(&path) {
                    Ok(contents) => {
                        let trimmed = contents.trim();
                        (
                            path.to_string_lossy().to_string(),
                            true,
                            !trimmed.is_empty(),
                            if trimmed.is_empty() {
                                Some("Realtime auth token is empty".to_string())
                            } else {
                                None
                            },
                        )
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => (
                        path.to_string_lossy().to_string(),
                        false,
                        false,
                        Some("Realtime auth token file not found".to_string()),
                    ),
                    Err(e) => (
                        path.to_string_lossy().to_string(),
                        false,
                        false,
                        Some(format!("Failed to read realtime auth token: {}", e)),
                    ),
                }
            }
            Err(e) => (
                String::new(),
                false,
                false,
                Some(format!("Failed to resolve app data directory: {}", e)),
            ),
        };

    let (connection_state, extension_id) = if let Some(native_state) =
        app_handle.try_state::<crate::sys::commands::NativeMessagingStateWrapper>()
    {
        let state = native_state.state.read().await;
        let connection_state = match &state.connection_state {
            crate::integrations::native_messaging::ConnectionState::Disconnected => {
                "disconnected".to_string()
            }
            crate::integrations::native_messaging::ConnectionState::Connecting => {
                "connecting".to_string()
            }
            crate::integrations::native_messaging::ConnectionState::Connected => {
                "connected".to_string()
            }
            crate::integrations::native_messaging::ConnectionState::Error(error) => {
                format!("error: {}", error)
            }
        };
        (
            connection_state,
            native_state.extension_id.read().await.clone(),
        )
    } else {
        ("state_unavailable".to_string(), Option::<String>::None)
    };

    let mut recommendations: Vec<String> = Vec::new();
    if !token_exists {
        recommendations.push(
            "Start or restart the desktop app to generate the realtime auth token.".to_string(),
        );
    } else if !token_valid {
        recommendations.push(
            "Realtime auth token is invalid. Restart the desktop app to regenerate .ipc_token."
                .to_string(),
        );
    }

    if connection_state == "disconnected" {
        recommendations.push(
            "Reconnect the browser extension or reload the extension service worker.".to_string(),
        );
    } else if connection_state == "connecting" {
        recommendations.push(
            "Extension connection is still initializing. Retry the tool once connection becomes connected."
                .to_string(),
        );
    } else if connection_state == "state_unavailable" {
        recommendations.push(
            "Native messaging state is unavailable. Restart the desktop app to restore extension transport state."
                .to_string(),
        );
    } else if connection_state.starts_with("error:") {
        recommendations.push(
            "Check native messaging installation and extension ID configuration.".to_string(),
        );
    }

    let transport_ready = token_valid && connection_state == "connected";
    let status = if transport_ready { "ok" } else { "degraded" };

    Ok(json!({
        "status": status,
        "version": env!("CARGO_PKG_VERSION"),
        "timestamp": Utc::now().to_rfc3339(),
        "extension_support": true,
        "transport": {
            "native_messaging": true,
            "websocket_port": 8787
        },
        "diagnostics": {
            "realtime_token": {
                "path": token_path,
                "exists": token_exists,
                "valid": token_valid,
                "error": token_error,
            },
            "native_connection": {
                "state": connection_state,
                "extension_id": extension_id,
                "ready": transport_ready,
            },
            "recommendations": recommendations,
        },
        "commands": [
            "extension_page_context",
            "extension_analyze_forms",
            "extension_task_result",
            "extension_status"
        ]
    }))
}

/// Helper function to detect form type
fn detect_form_type(fields: &[FormField]) -> String {
    let field_names: Vec<String> = fields.iter().map(|f| f.name.to_lowercase()).collect();

    // Check for common form patterns
    if field_names.contains(&"username".to_string())
        && field_names.contains(&"password".to_string())
    {
        return "login".to_string();
    }

    if field_names.contains(&"email".to_string()) && field_names.contains(&"password".to_string()) {
        return "login".to_string();
    }

    if field_names.contains(&"username".to_string()) && field_names.contains(&"email".to_string()) {
        return "registration".to_string();
    }

    if field_names
        .iter()
        .any(|name| name.contains("search") || name == "q" || name == "query")
    {
        return "search".to_string();
    }

    if field_names
        .iter()
        .any(|name| name.contains("email") || name.contains("phone"))
    {
        return "contact".to_string();
    }

    "unknown".to_string()
}

fn plan_page_actions(context: &PageContext, html: &str) -> Vec<PageAction> {
    let mut actions = Vec::new();
    let lower_html = html.to_lowercase();
    let has_form = lower_html.contains("<form");
    let has_password = lower_html.contains("type=\"password\"")
        || lower_html.contains("type='password'")
        || lower_html.contains("name=\"password\"")
        || lower_html.contains("name='password'");
    let selected_text = context
        .selected_text
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    actions.push(PageAction {
        id: Uuid::new_v4().to_string(),
        action_type: "get_page_info".to_string(),
        selector: None,
        value: None,
        delay: None,
    });

    if has_form {
        actions.push(PageAction {
            id: Uuid::new_v4().to_string(),
            action_type: "get_forms".to_string(),
            selector: None,
            value: None,
            delay: None,
        });
    }

    if let Some(selection) = selected_text {
        actions.push(PageAction {
            id: Uuid::new_v4().to_string(),
            action_type: "analyze_selection".to_string(),
            selector: None,
            value: Some(selection.chars().take(1000).collect()),
            delay: None,
        });
    }

    if has_password {
        actions.push(PageAction {
            id: Uuid::new_v4().to_string(),
            action_type: "wait_for_selector".to_string(),
            selector: Some("input[type='password']".to_string()),
            value: None,
            delay: Some(300),
        });
    }

    actions
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

    #[test]
    fn test_plan_page_actions_includes_forms_and_selection() {
        let context = PageContext {
            url: "https://example.com/login".to_string(),
            title: "Login".to_string(),
            html: "<form><input type='password' name='password' /></form>".to_string(),
            selected_text: Some("Remember this page".to_string()),
            tab_id: 7,
            timestamp: 0,
        };

        let actions = plan_page_actions(&context, &context.html);
        let action_types = actions
            .iter()
            .map(|action| action.action_type.as_str())
            .collect::<Vec<_>>();

        assert!(action_types.contains(&"get_page_info"));
        assert!(action_types.contains(&"get_forms"));
        assert!(action_types.contains(&"analyze_selection"));
        assert!(action_types.contains(&"wait_for_selector"));
    }
}
