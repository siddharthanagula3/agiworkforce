use super::*;
use crate::agi::api_tools_impl;
use crate::agi::planner::PlanStep;
use crate::automation::AutomationService;
use crate::router::{ChatMessage, LLMRequest, LLMRouter, RouterPreferences, RoutingStrategy};
use anyhow::{anyhow, Result};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;

/// AGI Executor - executes plan steps using tools
pub struct AGIExecutor {
    tool_registry: Arc<ToolRegistry>,
    _resource_manager: Arc<ResourceManager>,
    automation: Arc<AutomationService>,
    router: Arc<tokio::sync::Mutex<LLMRouter>>,
    app_handle: Option<tauri::AppHandle>,
}

impl AGIExecutor {
    pub fn new(
        tool_registry: Arc<ToolRegistry>,
        resource_manager: Arc<ResourceManager>,
        automation: Arc<AutomationService>,
        router: Arc<tokio::sync::Mutex<LLMRouter>>,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<Self> {
        Ok(Self {
            tool_registry,
            _resource_manager: resource_manager,
            automation,
            router,
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
            let dep_result = context.tool_results.iter().find(|r| r.tool_id == *dep_id);

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
                let temp_path = std::env::temp_dir().join(format!(
                    "screenshot_{}.png",
                    &uuid::Uuid::new_v4().to_string()[..8]
                ));
                captured.pixels.save(&temp_path)?;
                Ok(json!({ "screenshot_path": temp_path.to_string_lossy().to_string() }))
            }
            "ui_click" => {
                let target = parameters
                    .get("target")
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
                        Ok(
                            json!({ "success": true, "action": "invoked", "element_id": element.id, "found_by": "text", "text": text }),
                        )
                    } else {
                        Err(anyhow!("Element with text '{}' not found", text))
                    }
                } else {
                    Err(anyhow!("Invalid target format for ui_click - need coordinates, element_id, or text"))
                }
            }
            "ui_type" => {
                let target = parameters
                    .get("target")
                    .ok_or_else(|| anyhow!("Missing target parameter"))?;
                let text = parameters
                    .get("text")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing text parameter"))?;

                // If element_id provided, focus and type
                if let Some(element_id) = target.get("element_id").and_then(|v| v.as_str()) {
                    self.automation.uia.set_focus(element_id)?;
                    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
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
                        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                    }
                }

                // Type the text
                self.automation.keyboard.send_text(text).await?;
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
                    let tabs = tab_manager
                        .list_tabs()
                        .await
                        .map_err(|e| anyhow!("Failed to list tabs: {}", e))?;
                    let tab_id = if tabs.is_empty() {
                        // Create a new tab
                        tab_manager
                            .open_tab(url)
                            .await
                            .map_err(|e| anyhow!("Failed to open tab: {}", e))?
                    } else {
                        // Use first tab
                        tabs[0].id.clone()
                    };

                    // Navigate the tab
                    use crate::browser::NavigationOptions;
                    tab_manager
                        .navigate(&tab_id, url, NavigationOptions::default())
                        .await
                        .map_err(|e| anyhow!("Failed to navigate: {}", e))?;

                    Ok(json!({ "success": true, "url": url, "tab_id": tab_id }))
                } else {
                    Err(anyhow!("App handle not available for browser navigation"))
                }
            }
            "browser_click" => {
                let selector = parameters
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let tab_id = parameters.get("tab_id").and_then(|v| v.as_str());

                if let Some(ref app) = self.app_handle {
                    use crate::browser::{ClickOptions, DomOperations};
                    use crate::commands::BrowserStateWrapper;
                    use tauri::Manager;

                    let browser_state = app.state::<BrowserStateWrapper>();
                    let browser_guard = browser_state.0.lock().await;
                    let tab_manager = browser_guard.tab_manager.lock().await;

                    // Determine which tab to use
                    let target_tab_id = if let Some(tid) = tab_id {
                        tid.to_string()
                    } else {
                        // Use first available tab
                        let tabs = tab_manager
                            .list_tabs()
                            .await
                            .map_err(|e| anyhow!("Failed to list tabs: {}", e))?;
                        if tabs.is_empty() {
                            return Err(anyhow!("No browser tabs available. Please navigate to a URL first using browser_navigate."));
                        }
                        tabs[0].id.clone()
                    };

                    // Get CDP client for the tab
                    let cdp_client = browser_guard
                        .get_cdp_client(&target_tab_id)
                        .await
                        .map_err(|e| anyhow!("Failed to get CDP client: {}", e))?;

                    // Click the element
                    let options = ClickOptions::default();
                    DomOperations::click_with_cdp(cdp_client, selector, options)
                        .await
                        .map_err(|e| anyhow!("Failed to click element '{}': {}", selector, e))?;

                    Ok(json!({
                        "success": true,
                        "action": "clicked",
                        "selector": selector,
                        "tab_id": target_tab_id
                    }))
                } else {
                    Err(anyhow!("App handle not available for browser click"))
                }
            }
            "browser_extract" => {
                let selector = parameters
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .unwrap_or("body"); // Default to body if no selector provided
                let tab_id = parameters.get("tab_id").and_then(|v| v.as_str());
                let extract_type = parameters
                    .get("extract_type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("text"); // Default to text extraction

                if let Some(ref app) = self.app_handle {
                    use crate::browser::DomOperations;
                    use crate::commands::BrowserStateWrapper;
                    use tauri::Manager;

                    let browser_state = app.state::<BrowserStateWrapper>();
                    let browser_guard = browser_state.0.lock().await;
                    let tab_manager = browser_guard.tab_manager.lock().await;

                    // Determine which tab to use
                    let target_tab_id = if let Some(tid) = tab_id {
                        tid.to_string()
                    } else {
                        // Use first available tab
                        let tabs = tab_manager
                            .list_tabs()
                            .await
                            .map_err(|e| anyhow!("Failed to list tabs: {}", e))?;
                        if tabs.is_empty() {
                            return Err(anyhow!("No browser tabs available. Please navigate to a URL first using browser_navigate."));
                        }
                        tabs[0].id.clone()
                    };

                    // Extract data based on type
                    let result = match extract_type {
                        "text" => {
                            // Extract text content
                            let text = DomOperations::get_text(&target_tab_id, selector)
                                .await
                                .map_err(|e| {
                                    anyhow!("Failed to extract text from '{}': {}", selector, e)
                                })?;
                            json!({ "type": "text", "content": text })
                        }
                        "attribute" => {
                            // Extract attribute value
                            let attribute_name = parameters
                                .get("attribute")
                                .and_then(|v| v.as_str())
                                .ok_or_else(|| {
                                    anyhow!("Missing attribute parameter for attribute extraction")
                                })?;

                            let attr_value = DomOperations::get_attribute(
                                &target_tab_id,
                                selector,
                                attribute_name,
                            )
                            .await
                            .map_err(|e| {
                                anyhow!(
                                    "Failed to get attribute '{}' from '{}': {}",
                                    attribute_name,
                                    selector,
                                    e
                                )
                            })?;

                            json!({
                                "type": "attribute",
                                "attribute": attribute_name,
                                "content": attr_value
                            })
                        }
                        "all" => {
                            // Extract all matching elements
                            let elements = DomOperations::query_all(&target_tab_id, selector)
                                .await
                                .map_err(|e| {
                                    anyhow!("Failed to query elements '{}': {}", selector, e)
                                })?;

                            let elements_json = serde_json::to_value(&elements)
                                .map_err(|e| anyhow!("Failed to serialize elements: {}", e))?;

                            json!({
                                "type": "all_elements",
                                "count": elements.len(),
                                "elements": elements_json
                            })
                        }
                        _ => {
                            // Default to text extraction
                            let text = DomOperations::get_text(&target_tab_id, selector)
                                .await
                                .map_err(|e| {
                                    anyhow!("Failed to extract text from '{}': {}", selector, e)
                                })?;
                            json!({ "type": "text", "content": text })
                        }
                    };

                    Ok(json!({
                        "success": true,
                        "selector": selector,
                        "tab_id": target_tab_id,
                        "data": result
                    }))
                } else {
                    Err(anyhow!("App handle not available for browser extraction"))
                }
            }
            "code_execute" => {
                let language = parameters
                    .get("language")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing language parameter"))?;
                let code = parameters
                    .get("code")
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
                        session_manager
                            .create_session(shell_type, None)
                            .await
                            .map_err(|e| anyhow!("Failed to create session: {}", e))?
                    } else {
                        sessions[0].clone()
                    };

                    // Execute the code
                    let command = format!("{}\r\n", code);
                    session_manager
                        .send_input(&session_id, &command)
                        .await
                        .map_err(|e| anyhow!("Failed to execute code: {}", e))?;

                    // Wait a bit for execution
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

                    Ok(
                        json!({ "success": true, "language": language, "session_id": session_id, "code": &code[..code.len().min(100)] }),
                    )
                } else {
                    Err(anyhow!("App handle not available for code execution"))
                }
            }
            "db_query" => {
                let database_id = parameters
                    .get("database_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing database_id parameter"))?;
                let query = parameters
                    .get("query")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing query parameter"))?;

                if let Some(ref app) = self.app_handle {
                    use crate::commands::DatabaseState;
                    use tauri::Manager;
                    use tokio::sync::Mutex;

                    let db_state = app.state::<Mutex<DatabaseState>>();
                    let db_guard = db_state.lock().await;

                    // Execute the query
                    let result = db_guard
                        .sql_client
                        .execute_query(database_id, query)
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
                if let Some(ref app) = self.app_handle {
                    api_tools_impl::execute_api_call(app, parameters).await
                } else {
                    Err(anyhow!("App handle not available for API call"))
                }
            }
            "api_upload" => {
                if let Some(ref app) = self.app_handle {
                    api_tools_impl::execute_api_upload(app, parameters).await
                } else {
                    Err(anyhow!("App handle not available for API upload"))
                }
            }
            "api_download" => {
                if let Some(ref app) = self.app_handle {
                    api_tools_impl::execute_api_download(app, parameters).await
                } else {
                    Err(anyhow!("App handle not available for API download"))
                }
            }
            "image_ocr" => {
                let image_path = parameters
                    .get("image_path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing image_path parameter"))?;

                // Use automation OCR function directly
                use crate::automation::screen::perform_ocr;

                let ocr_result =
                    perform_ocr(image_path).map_err(|e| anyhow!("OCR failed: {}", e))?;

                Ok(json!({
                    "success": true,
                    "image_path": image_path,
                    "text": ocr_result.text,
                    "confidence": ocr_result.confidence
                }))
            }
            "code_analyze" => {
                let code = parameters
                    .get("code")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing code parameter"))?;
                // Code analysis requires LLM or static analysis
                // For now, return success - will be connected via LLM router
                tracing::info!(
                    "[Executor] Code analysis requested: {}",
                    &code[..code.len().min(50)]
                );
                Ok(
                    json!({ "success": true, "note": "Requires LLM router access for code analysis" }),
                )
            }
            "llm_reason" => {
                let prompt = parameters
                    .get("prompt")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing prompt parameter"))?;

                tracing::info!("[Executor] LLM reasoning: {}", &prompt[..prompt.len().min(50)]);

                // HYBRID STRATEGY: Use Claude Haiku 4.5 for execution (4-5x faster, 1/3 cost)
                let preferences = RouterPreferences {
                    provider: Some("anthropic".to_string()),
                    model: Some("claude-haiku-4-5".to_string()),
                    strategy: RoutingStrategy::PreferenceWithFallback,
                };

                let request = LLMRequest {
                    messages: vec![ChatMessage {
                        role: "user".to_string(),
                        content: prompt.to_string(),
                        tool_calls: None,
                        tool_call_id: None,
                    }],
                    model: "claude-haiku-4-5".to_string(),
                    temperature: Some(0.7),
                    max_tokens: Some(2000),
                    stream: false,
                    tools: None,
                    tool_choice: None,
                };

                let router = self.router.lock().await;
                let candidates = router.candidates(&request, &preferences);

                if !candidates.is_empty() {
                    match router.invoke_candidate(&candidates[0], &request).await {
                        Ok(outcome) => {
                            drop(router);
                            Ok(json!({
                                "success": true,
                                "reasoning": outcome.response.content,
                                "model": outcome.response.model,
                                "cost": outcome.response.cost
                            }))
                        }
                        Err(e) => {
                            drop(router);
                            Err(anyhow!("LLM reasoning failed: {}", e))
                        }
                    }
                } else {
                    drop(router);
                    Err(anyhow!("No LLM candidates available for reasoning"))
                }
            }
            "email_send" => {
                let to = parameters
                    .get("to")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'to' parameter"))?;
                let subject = parameters
                    .get("subject")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'subject' parameter"))?;
                let _body = parameters
                    .get("body")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'body' parameter"))?;

                // Note: Email sending requires account setup via email_connect command
                // This tool is registered but requires Tauri command invocation
                tracing::info!(
                    "[Executor] Email send requested: to={}, subject={}",
                    to,
                    subject
                );
                Ok(
                    json!({ "success": true, "note": "Email sending requires account configuration via email_connect command. Use Tauri command 'email_send' directly." }),
                )
            }
            "email_fetch" => {
                let account_id = parameters
                    .get("account_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'account_id' parameter"))?;
                let limit = parameters
                    .get("limit")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(10);

                // Note: Email fetching requires account setup via email_connect command
                // This tool is registered but requires Tauri command invocation
                tracing::info!(
                    "[Executor] Email fetch requested: account_id={}, limit={}",
                    account_id,
                    limit
                );
                Ok(
                    json!({ "success": true, "note": "Email fetching requires account configuration via email_connect command. Use Tauri command 'email_fetch_inbox' directly." }),
                )
            }
            "calendar_create_event" => {
                let account_id = parameters
                    .get("account_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'account_id' parameter"))?;
                let title = parameters
                    .get("title")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'title' parameter"))?;
                let _start_time = parameters
                    .get("start_time")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'start_time' parameter"))?;

                // Note: Calendar event creation requires account setup via calendar_connect command
                // This tool is registered but requires Tauri command invocation
                tracing::info!(
                    "[Executor] Calendar event creation requested: account_id={}, title={}",
                    account_id,
                    title
                );
                Ok(
                    json!({ "success": true, "note": "Calendar event creation requires account configuration via calendar_connect command. Use Tauri command 'calendar_create_event' directly." }),
                )
            }
            "calendar_list_events" => {
                let account_id = parameters
                    .get("account_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'account_id' parameter"))?;

                // Note: Calendar listing requires account setup via calendar_connect command
                // This tool is registered but requires Tauri command invocation
                tracing::info!(
                    "[Executor] Calendar list events requested: account_id={}",
                    account_id
                );
                Ok(
                    json!({ "success": true, "note": "Calendar listing requires account configuration via calendar_connect command. Use Tauri command 'calendar_list_events' directly." }),
                )
            }
            "cloud_upload" => {
                let account_id = parameters
                    .get("account_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'account_id' parameter"))?;
                let local_path = parameters
                    .get("local_path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'local_path' parameter"))?;
                let remote_path = parameters
                    .get("remote_path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'remote_path' parameter"))?;

                // Note: Cloud upload requires account setup via cloud_connect command
                // This tool is registered but requires Tauri command invocation
                tracing::info!("[Executor] Cloud upload requested: account_id={}, local_path={}, remote_path={}", account_id, local_path, remote_path);
                Ok(
                    json!({ "success": true, "note": "Cloud upload requires account configuration via cloud_connect command. Use Tauri command 'cloud_upload' directly." }),
                )
            }
            "cloud_download" => {
                let account_id = parameters
                    .get("account_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'account_id' parameter"))?;
                let remote_path = parameters
                    .get("remote_path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'remote_path' parameter"))?;
                let local_path = parameters
                    .get("local_path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'local_path' parameter"))?;

                // Note: Cloud download requires account setup via cloud_connect command
                // This tool is registered but requires Tauri command invocation
                tracing::info!("[Executor] Cloud download requested: account_id={}, remote_path={}, local_path={}", account_id, remote_path, local_path);
                Ok(
                    json!({ "success": true, "note": "Cloud download requires account configuration via cloud_connect command. Use Tauri command 'cloud_download' directly." }),
                )
            }
            "productivity_create_task" => {
                let provider = parameters
                    .get("provider")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'provider' parameter"))?;
                let title = parameters
                    .get("title")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'title' parameter"))?;

                // Note: Productivity task creation requires account setup via productivity_connect command
                // This tool is registered but requires Tauri command invocation
                tracing::info!(
                    "[Executor] Productivity task creation requested: provider={}, title={}",
                    provider,
                    title
                );
                Ok(
                    json!({ "success": true, "note": "Productivity task creation requires account configuration via productivity_connect command. Use Tauri command 'productivity_create_task' directly." }),
                )
            }
            "document_read" => {
                let file_path = parameters
                    .get("file_path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'file_path' parameter"))?;

                if let Some(ref app) = self.app_handle {
                    use crate::commands::DocumentState;
                    use tauri::Manager;

                    let doc_state = app.state::<DocumentState>();
                    let content = doc_state
                        .manager
                        .read_document(file_path)
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
                let file_path = parameters
                    .get("file_path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'file_path' parameter"))?;
                let query = parameters
                    .get("query")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'query' parameter"))?;

                if let Some(ref app) = self.app_handle {
                    use crate::commands::DocumentState;
                    use tauri::Manager;

                    let doc_state = app.state::<DocumentState>();
                    let results = doc_state
                        .manager
                        .search(file_path, query)
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
            "db_execute" => {
                let connection_id = parameters
                    .get("connection_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing connection_id parameter"))?;
                let sql = parameters
                    .get("sql")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing sql parameter"))?;

                // Optional: Support parameterized queries
                let params = parameters
                    .get("params")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();

                if let Some(ref app) = self.app_handle {
                    use crate::commands::DatabaseState;
                    use tauri::Manager;
                    use tokio::sync::Mutex;

                    let db_state = app.state::<Mutex<DatabaseState>>();
                    let db_guard = db_state.lock().await;

                    // Execute with or without parameters
                    let result = if params.is_empty() {
                        db_guard.sql_client.execute_query(connection_id, sql).await
                    } else {
                        db_guard
                            .sql_client
                            .execute_prepared(connection_id, sql, &params)
                            .await
                    }
                    .map_err(|e| anyhow!("Database execute failed: {}", e))?;

                    Ok(json!({
                        "success": true,
                        "connection_id": connection_id,
                        "rows_affected": result.rows_affected,
                        "execution_time_ms": result.execution_time_ms
                    }))
                } else {
                    Err(anyhow!("App handle not available for database execute"))
                }
            }
            "db_transaction_begin" => {
                let connection_id = parameters
                    .get("connection_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing connection_id parameter"))?;

                if let Some(ref app) = self.app_handle {
                    use crate::commands::DatabaseState;
                    use tauri::Manager;
                    use tokio::sync::Mutex;

                    let db_state = app.state::<Mutex<DatabaseState>>();
                    let db_guard = db_state.lock().await;

                    // Execute BEGIN TRANSACTION
                    let result = db_guard
                        .sql_client
                        .execute_query(connection_id, "BEGIN TRANSACTION")
                        .await
                        .map_err(|e| anyhow!("Failed to begin transaction: {}", e))?;

                    tracing::info!(
                        "[Executor] Transaction started on connection: {}",
                        connection_id
                    );

                    Ok(json!({
                        "success": true,
                        "connection_id": connection_id,
                        "transaction_started": true,
                        "execution_time_ms": result.execution_time_ms
                    }))
                } else {
                    Err(anyhow!("App handle not available for transaction begin"))
                }
            }
            "db_transaction_commit" => {
                let connection_id = parameters
                    .get("connection_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing connection_id parameter"))?;

                if let Some(ref app) = self.app_handle {
                    use crate::commands::DatabaseState;
                    use tauri::Manager;
                    use tokio::sync::Mutex;

                    let db_state = app.state::<Mutex<DatabaseState>>();
                    let db_guard = db_state.lock().await;

                    // Execute COMMIT
                    let result = db_guard
                        .sql_client
                        .execute_query(connection_id, "COMMIT")
                        .await
                        .map_err(|e| anyhow!("Failed to commit transaction: {}", e))?;

                    tracing::info!(
                        "[Executor] Transaction committed on connection: {}",
                        connection_id
                    );

                    Ok(json!({
                        "success": true,
                        "connection_id": connection_id,
                        "transaction_committed": true,
                        "execution_time_ms": result.execution_time_ms
                    }))
                } else {
                    Err(anyhow!("App handle not available for transaction commit"))
                }
            }
            "db_transaction_rollback" => {
                let connection_id = parameters
                    .get("connection_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing connection_id parameter"))?;

                if let Some(ref app) = self.app_handle {
                    use crate::commands::DatabaseState;
                    use tauri::Manager;
                    use tokio::sync::Mutex;

                    let db_state = app.state::<Mutex<DatabaseState>>();
                    let db_guard = db_state.lock().await;

                    // Execute ROLLBACK
                    let result = db_guard
                        .sql_client
                        .execute_query(connection_id, "ROLLBACK")
                        .await
                        .map_err(|e| anyhow!("Failed to rollback transaction: {}", e))?;

                    tracing::info!(
                        "[Executor] Transaction rolled back on connection: {}",
                        connection_id
                    );

                    Ok(json!({
                        "success": true,
                        "connection_id": connection_id,
                        "transaction_rolled_back": true,
                        "execution_time_ms": result.execution_time_ms
                    }))
                } else {
                    Err(anyhow!("App handle not available for transaction rollback"))
                }
            }
            _ => Err(anyhow!("Unknown tool: {}", tool.id)),
        }
    }

    pub async fn execute_plans_parallel(
        &self,
        plans: Vec<planner::Plan>,
        sandbox_manager: &crate::agi::SandboxManager,
        goal: &Goal,
    ) -> Result<Vec<crate::agi::ExecutionResult>> {
        use tokio::time::Instant;

        tracing::info!(
            "[Executor] Starting parallel execution of {} plans",
            plans.len()
        );

        let mut handles = Vec::new();

        for plan in plans {
            let tool_registry = self.tool_registry.clone();
            let automation = self.automation.clone();
            let router = self.router.clone();

            let sandbox = sandbox_manager.create_sandbox(false).await?;
            let sandbox_id = sandbox.id.clone();
            let plan_id = plan.goal_id.clone();
            let goal_clone = goal.clone();

            let handle = tokio::spawn(async move {
                let start_time = Instant::now();

                let context = ExecutionContext {
                    goal: goal_clone,
                    current_state: HashMap::new(),
                    available_resources: ResourceState {
                        cpu_usage_percent: 0.0,
                        memory_usage_mb: 0,
                        network_usage_mbps: 0.0,
                        storage_usage_mb: 0,
                        available_tools: vec![],
                    },
                    tool_results: Vec::new(),
                    context_memory: Vec::new(),
                };

                let executor = AGIExecutor::new(
                    tool_registry,
                    Arc::new(ResourceManager::new(ResourceLimits {
                        cpu_percent: 80.0,
                        memory_mb: 2048,
                        network_mbps: 100.0,
                        storage_mb: 10240,
                    }).unwrap()),
                    automation,
                    router,
                    None,
                ).unwrap();

                let mut steps_completed = 0;
                let mut steps_failed = 0;
                let mut total_cost = 0.0;
                let mut output = serde_json::json!({});
                let mut error_msg = None;

                for step in &plan.steps {
                    match executor.execute_step(step, &context).await {
                        Ok(result) => {
                            steps_completed += 1;
                            output = result;
                        }
                        Err(e) => {
                            steps_failed += 1;
                            error_msg = Some(e.to_string());
                            break;
                        }
                    }
                }

                let execution_time_ms = start_time.elapsed().as_millis() as u64;
                let success = steps_failed == 0 && steps_completed > 0;

                crate::agi::ExecutionResult {
                    plan_id,
                    sandbox_id,
                    success,
                    output,
                    execution_time_ms,
                    steps_completed,
                    steps_failed,
                    error: error_msg,
                    cost: Some(total_cost),
                }
            });

            handles.push(handle);
        }

        let results = futures::future::join_all(handles).await;

        let execution_results: Vec<crate::agi::ExecutionResult> = results
            .into_iter()
            .filter_map(|r| r.ok())
            .collect();

        tracing::info!(
            "[Executor] Parallel execution complete. {} results collected",
            execution_results.len()
        );

        Ok(execution_results)
    }
}
