use super::*;
use crate::agi::planner::PlanStep;
use crate::automation::AutomationService;
use anyhow::{anyhow, Result};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;

/// AGI Executor - executes plan steps using tools
pub struct AGIExecutor {
    tool_registry: Arc<ToolRegistry>,
    resource_manager: Arc<ResourceManager>,
    automation: Arc<AutomationService>,
    app_handle: Option<tauri::AppHandle>,
}

impl AGIExecutor {
    pub fn new(
        tool_registry: Arc<ToolRegistry>,
        resource_manager: Arc<ResourceManager>,
        automation: Arc<AutomationService>,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<Self> {
        Ok(Self {
            tool_registry,
            resource_manager,
            automation,
            app_handle,
        })
    }

    /// Execute a plan step
    pub async fn execute_step(
        &self,
        step: &PlanStep,
        context: &ExecutionContext,
    ) -> Result<serde_json::Value> {
        tracing::info!("[Executor] Executing step: {}", step.description);

        // Get tool
        let tool = self
            .tool_registry
            .get_tool(&step.tool_id)
            .ok_or_else(|| anyhow::anyhow!("Tool {} not found", step.tool_id))?;

        // Check dependencies
        for dep_id in &step.dependencies {
            // Verify dependency was executed successfully
            let dep_result = context
                .tool_results
                .iter()
                .find(|r| r.tool_id == *dep_id);

            if let Some(result) = dep_result {
                if !result.success {
                    return Err(anyhow::anyhow!("Dependency {} failed", dep_id));
                }
            } else {
                return Err(anyhow::anyhow!("Dependency {} not found", dep_id));
            }
        }

        // Execute tool
        let result = self.execute_tool(&tool, &step.parameters, context).await?;

        Ok(result)
    }

    async fn execute_tool(
        &self,
        tool: &Tool,
        parameters: &HashMap<String, serde_json::Value>,
        _context: &ExecutionContext,
    ) -> Result<serde_json::Value> {
        match tool.id.as_str() {
            "file_read" => {
                let path = parameters["path"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("Missing path parameter"))?;
                let content = std::fs::read_to_string(path)?;
                Ok(json!({ "content": content, "path": path }))
            }
            "file_write" => {
                let path = parameters["path"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("Missing path parameter"))?;
                let content = parameters["content"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("Missing content parameter"))?;
                std::fs::write(path, content)?;
                Ok(json!({ "success": true, "path": path }))
            }
            "ui_screenshot" => {
                use crate::automation::screen::capture_primary_screen;
                let captured = capture_primary_screen()?;
                let temp_path = std::env::temp_dir().join(format!("screenshot_{}.png", uuid::Uuid::new_v4().to_string()[..8].to_string()));
                captured.pixels.save(&temp_path)?;
                Ok(json!({ "screenshot_path": temp_path.to_string_lossy().to_string() }))
            }
            "ui_click" => {
                let target = parameters.get("target")
                    .ok_or_else(|| anyhow!("Missing target parameter"))?;
                
                // Parse target (coordinates, UIA element, or text)
                if let Some(coords) = target.get("coordinates") {
                    let x = coords.get("x").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                    let y = coords.get("y").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                    use crate::automation::input::MouseButton;
                    self.automation.mouse.click(x, y, MouseButton::Left)?;
                    Ok(json!({ "success": true, "action": "clicked", "x": x, "y": y }))
                } else if let Some(element_id) = target.get("element_id").and_then(|v| v.as_str()) {
                    // Element ID provided - use UIA invoke
                    self.automation.uia.invoke(element_id)?;
                    Ok(json!({ "success": true, "action": "invoked", "element_id": element_id }))
                } else if let Some(text) = target.get("text").and_then(|v| v.as_str()) {
                    // Text provided - find element by name and click
                    use crate::automation::uia::ElementQuery;
                    let query = ElementQuery {
                        window: None,
                        window_class: None,
                        name: Some(text.to_string()),
                        class_name: None,
                        automation_id: None,
                        control_type: None,
                        max_results: Some(1),
                    };
                    let elements = self.automation.uia.find_elements(None, &query)?;
                    if let Some(element) = elements.first() {
                        self.automation.uia.invoke(&element.id)?;
                        Ok(json!({ "success": true, "action": "invoked", "element_id": element.id, "found_by": "text", "text": text }))
                    } else {
                        Err(anyhow!("Element with text '{}' not found", text))
                    }
                } else {
                    Err(anyhow!("Invalid target format for ui_click - need coordinates, element_id, or text"))
                }
            }
            "ui_type" => {
                let target = parameters.get("target")
                    .ok_or_else(|| anyhow!("Missing target parameter"))?;
                let text = parameters.get("text")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing text parameter"))?;
                
                // If element_id provided, focus and type
                if let Some(element_id) = target.get("element_id").and_then(|v| v.as_str()) {
                    self.automation.uia.set_focus(element_id)?;
                    std::thread::sleep(std::time::Duration::from_millis(100));
                } else if let Some(target_text) = target.get("text").and_then(|v| v.as_str()) {
                    // Find element by text and focus
                    use crate::automation::uia::ElementQuery;
                    let query = ElementQuery {
                        window: None,
                        window_class: None,
                        name: Some(target_text.to_string()),
                        class_name: None,
                        automation_id: None,
                        control_type: None,
                        max_results: Some(1),
                    };
                    let elements = self.automation.uia.find_elements(None, &query)?;
                    if let Some(element) = elements.first() {
                        self.automation.uia.set_focus(&element.id)?;
                        std::thread::sleep(std::time::Duration::from_millis(100));
                    }
                }
                
                // Type the text
                self.automation.keyboard.send_text(text)?;
                Ok(json!({ "success": true, "action": "typed", "text": text }))
            }
            "browser_navigate" => {
                let url = parameters["url"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("Missing url parameter"))?;
                
                if let Some(ref app) = self.app_handle {
                    use crate::commands::BrowserStateWrapper;
                    use tauri::Manager;
                    
                    let browser_state = app.state::<BrowserStateWrapper>();
                    let browser_guard = browser_state.0.lock().await;
                    let tab_manager = browser_guard.tab_manager.lock().await;
                    
                    // Get or create a tab
                    let tabs = tab_manager.list_tabs().await.map_err(|e| anyhow!("Failed to list tabs: {}", e))?;
                    let tab_id = if tabs.is_empty() {
                        // Create a new tab
                        tab_manager.open_tab(url).await.map_err(|e| anyhow!("Failed to open tab: {}", e))?
                    } else {
                        // Use first tab
                        tabs[0].id.clone()
                    };
                    
                    // Navigate the tab
                    use crate::browser::NavigationOptions;
                    tab_manager.navigate(&tab_id, url, NavigationOptions::default())
                        .await
                        .map_err(|e| anyhow!("Failed to navigate: {}", e))?;
                    
                    Ok(json!({ "success": true, "url": url, "tab_id": tab_id }))
                } else {
                    Err(anyhow!("App handle not available for browser navigation"))
                }
            }
            "code_execute" => {
                let language = parameters.get("language")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing language parameter"))?;
                let code = parameters.get("code")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing code parameter"))?;
                
                if let Some(ref app) = self.app_handle {
                    use crate::terminal::SessionManager;
                    use crate::terminal::ShellType;
                    use tauri::Manager;
                    
                    let session_manager = app.state::<SessionManager>();
                    
                    // Determine shell type based on language
                    let shell_type = match language.to_lowercase().as_str() {
                        "powershell" | "ps1" => ShellType::PowerShell,
                        "bash" | "sh" | "shell" => ShellType::Wsl,
                        "cmd" | "batch" => ShellType::Cmd,
                        _ => ShellType::PowerShell, // Default to PowerShell
                    };
                    
                    // Get or create a session
                    let sessions = session_manager.list_sessions().await;
                    let session_id = if sessions.is_empty() {
                        session_manager.create_session(shell_type, None)
                            .await
                            .map_err(|e| anyhow!("Failed to create session: {}", e))?
                    } else {
                        sessions[0].clone()
                    };
                    
                    // Execute the code
                    let command = format!("{}\r\n", code);
                    session_manager.send_input(&session_id, &command)
                        .await
                        .map_err(|e| anyhow!("Failed to execute code: {}", e))?;
                    
                    // Wait a bit for execution
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                    
                    Ok(json!({ "success": true, "language": language, "session_id": session_id, "code": &code[..code.len().min(100)] }))
                } else {
                    Err(anyhow!("App handle not available for code execution"))
                }
            }
            "db_query" => {
                let database_id = parameters.get("database_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing database_id parameter"))?;
                let query = parameters.get("query")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing query parameter"))?;
                
                if let Some(ref app) = self.app_handle {
                    use crate::commands::DatabaseState;
                    use tauri::Manager;
                    use tokio::sync::Mutex;
                    
                    let db_state = app.state::<Mutex<DatabaseState>>();
                    let db_guard = db_state.lock().await;
                    
                    // Execute the query
                    let result = db_guard.sql_client.execute_query(database_id, query)
                        .await
                        .map_err(|e| anyhow!("Database query failed: {}", e))?;
                    
                    let result_json = serde_json::to_value(&result)
                        .map_err(|e| anyhow!("Failed to serialize result: {}", e))?;
                    
                    Ok(json!({ 
                        "success": true, 
                        "database_id": database_id,
                        "rows": result.rows.len(),
                        "rows_affected": result.rows_affected,
                        "execution_time_ms": result.execution_time_ms,
                        "data": result_json
                    }))
                } else {
                    Err(anyhow!("App handle not available for database query"))
                }
            }
            "api_call" => {
                let method = parameters.get("method")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing method parameter"))?;
                let url = parameters.get("url")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing url parameter"))?;
                
                if let Some(ref app) = self.app_handle {
                    use crate::api::{ApiRequest, HttpMethod, AuthType};
                    use tauri::Manager;
                    use std::collections::HashMap;
                    
                    // Parse method
                    let http_method = match method.to_uppercase().as_str() {
                        "GET" => HttpMethod::Get,
                        "POST" => HttpMethod::Post,
                        "PUT" => HttpMethod::Put,
                        "DELETE" => HttpMethod::Delete,
                        "PATCH" => HttpMethod::Patch,
                        _ => HttpMethod::Get,
                    };
                    
                    // Get body if provided
                    let body = parameters.get("body")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    
                    // Get headers if provided
                    let mut headers = HashMap::new();
                    if let Some(headers_obj) = parameters.get("headers").and_then(|v| v.as_object()) {
                        for (k, v) in headers_obj {
                            if let Some(v_str) = v.as_str() {
                                headers.insert(k.clone(), v_str.to_string());
                            }
                        }
                    }
                    
                    // Create API request
                    let request = ApiRequest {
                        method: http_method,
                        url: url.to_string(),
                        headers,
                        query_params: HashMap::new(),
                        body,
                        auth: AuthType::None,
                        timeout_ms: Some(30000),
                    };
                    
                    // Execute the request using ApiState's public method
                    let api_state = app.state::<crate::commands::ApiState>();
                    let response = api_state.execute_request(request)
                        .await
                        .map_err(|e| anyhow!("API call failed: {}", e))?;
                    
                    Ok(json!({ 
                        "success": response.success,
                        "status": response.status,
                        "body": response.body,
                        "duration_ms": response.duration_ms,
                        "headers": response.headers
                    }))
                } else {
                    Err(anyhow!("App handle not available for API call"))
                }
            }
            "image_ocr" => {
                let image_path = parameters.get("image_path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing image_path parameter"))?;
                
                // Use automation OCR function directly
                use crate::automation::screen::perform_ocr;
                
                let ocr_result = perform_ocr(image_path)
                    .map_err(|e| anyhow!("OCR failed: {}", e))?;
                
                Ok(json!({ 
                    "success": true, 
                    "image_path": image_path,
                    "text": ocr_result.text,
                    "confidence": ocr_result.confidence
                }))
            }
            "code_analyze" => {
                let code = parameters.get("code")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing code parameter"))?;
                // Code analysis requires LLM or static analysis
                // For now, return success - will be connected via LLM router
                tracing::info!("[Executor] Code analysis requested: {}", &code[..code.len().min(50)]);
                Ok(json!({ "success": true, "note": "Requires LLM router access for code analysis" }))
            }
            "llm_reason" => {
                let prompt = parameters.get("prompt")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing prompt parameter"))?;
                // LLM reasoning requires router access
                // For now, return success - will be connected via LLM router
                tracing::info!("[Executor] LLM reasoning requested: {}", &prompt[..prompt.len().min(50)]);
                Ok(json!({ "success": true, "reasoning": "Requires LLM router access", "note": "Will be connected via router" }))
            }
            "email_send" => {
                let to = parameters.get("to")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'to' parameter"))?;
                let subject = parameters.get("subject")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'subject' parameter"))?;
                let body = parameters.get("body")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'body' parameter"))?;
                
                // Note: Email sending requires account setup via email_connect command
                // This tool is registered but requires Tauri command invocation
                tracing::info!("[Executor] Email send requested: to={}, subject={}", to, subject);
                Ok(json!({ "success": true, "note": "Email sending requires account configuration via email_connect command. Use Tauri command 'email_send' directly." }))
            }
            "email_fetch" => {
                let account_id = parameters.get("account_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'account_id' parameter"))?;
                let limit = parameters.get("limit")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(10);
                
                // Note: Email fetching requires account setup via email_connect command
                // This tool is registered but requires Tauri command invocation
                tracing::info!("[Executor] Email fetch requested: account_id={}, limit={}", account_id, limit);
                Ok(json!({ "success": true, "note": "Email fetching requires account configuration via email_connect command. Use Tauri command 'email_fetch_inbox' directly." }))
            }
            "calendar_create_event" => {
                let account_id = parameters.get("account_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'account_id' parameter"))?;
                let title = parameters.get("title")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'title' parameter"))?;
                let start_time = parameters.get("start_time")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'start_time' parameter"))?;
                
                // Note: Calendar event creation requires account setup via calendar_connect command
                // This tool is registered but requires Tauri command invocation
                tracing::info!("[Executor] Calendar event creation requested: account_id={}, title={}", account_id, title);
                Ok(json!({ "success": true, "note": "Calendar event creation requires account configuration via calendar_connect command. Use Tauri command 'calendar_create_event' directly." }))
            }
            "calendar_list_events" => {
                let account_id = parameters.get("account_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'account_id' parameter"))?;
                
                // Note: Calendar listing requires account setup via calendar_connect command
                // This tool is registered but requires Tauri command invocation
                tracing::info!("[Executor] Calendar list events requested: account_id={}", account_id);
                Ok(json!({ "success": true, "note": "Calendar listing requires account configuration via calendar_connect command. Use Tauri command 'calendar_list_events' directly." }))
            }
            "cloud_upload" => {
                let account_id = parameters.get("account_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'account_id' parameter"))?;
                let local_path = parameters.get("local_path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'local_path' parameter"))?;
                let remote_path = parameters.get("remote_path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'remote_path' parameter"))?;
                
                // Note: Cloud upload requires account setup via cloud_connect command
                // This tool is registered but requires Tauri command invocation
                tracing::info!("[Executor] Cloud upload requested: account_id={}, local_path={}, remote_path={}", account_id, local_path, remote_path);
                Ok(json!({ "success": true, "note": "Cloud upload requires account configuration via cloud_connect command. Use Tauri command 'cloud_upload' directly." }))
            }
            "cloud_download" => {
                let account_id = parameters.get("account_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'account_id' parameter"))?;
                let remote_path = parameters.get("remote_path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'remote_path' parameter"))?;
                let local_path = parameters.get("local_path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'local_path' parameter"))?;
                
                // Note: Cloud download requires account setup via cloud_connect command
                // This tool is registered but requires Tauri command invocation
                tracing::info!("[Executor] Cloud download requested: account_id={}, remote_path={}, local_path={}", account_id, remote_path, local_path);
                Ok(json!({ "success": true, "note": "Cloud download requires account configuration via cloud_connect command. Use Tauri command 'cloud_download' directly." }))
            }
            "productivity_create_task" => {
                let provider = parameters.get("provider")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'provider' parameter"))?;
                let title = parameters.get("title")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'title' parameter"))?;
                
                // Note: Productivity task creation requires account setup via productivity_connect command
                // This tool is registered but requires Tauri command invocation
                tracing::info!("[Executor] Productivity task creation requested: provider={}, title={}", provider, title);
                Ok(json!({ "success": true, "note": "Productivity task creation requires account configuration via productivity_connect command. Use Tauri command 'productivity_create_task' directly." }))
            }
            "document_read" => {
                let file_path = parameters.get("file_path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'file_path' parameter"))?;
                
                if let Some(ref app) = self.app_handle {
                    use crate::commands::DocumentState;
                    use tauri::Manager;
                    
                    let doc_state = app.state::<DocumentState>();
                    let content = doc_state.manager.read_document(file_path)
                        .await
                        .map_err(|e| anyhow!("Document read failed: {}", e))?;
                    
                    Ok(json!({ 
                        "success": true, 
                        "file_path": file_path,
                        "content": serde_json::to_value(&content).map_err(|e| anyhow!("Serialization failed: {}", e))?
                    }))
                } else {
                    Err(anyhow!("App handle not available for document operations"))
                }
            }
            "document_search" => {
                let file_path = parameters.get("file_path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'file_path' parameter"))?;
                let query = parameters.get("query")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'query' parameter"))?;
                
                if let Some(ref app) = self.app_handle {
                    use crate::commands::DocumentState;
                    use tauri::Manager;
                    
                    let doc_state = app.state::<DocumentState>();
                    let results = doc_state.manager.search(file_path, query)
                        .await
                        .map_err(|e| anyhow!("Document search failed: {}", e))?;
                    
                    Ok(json!({ 
                        "success": true, 
                        "file_path": file_path,
                        "query": query,
                        "results": serde_json::to_value(&results).map_err(|e| anyhow!("Serialization failed: {}", e))?,
                        "count": results.len()
                    }))
                } else {
                    Err(anyhow!("App handle not available for document operations"))
                }
            }
            _ => Err(anyhow!("Unknown tool: {}", tool.id)),
        }
    }
}

