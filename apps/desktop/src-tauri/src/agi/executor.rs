use super::*;
use crate::agi::api_tools_impl;
use crate::agi::outcome_tracker::OutcomeTracker;
use crate::agi::planner::PlanStep;
use crate::agi::process_reasoning::ProcessReasoning;
use crate::automation::AutomationService;
use crate::cache::ToolResultCache;
use crate::router::{ChatMessage, LLMRequest, LLMRouter, RouterPreferences, RoutingStrategy};
use crate::security::ToolExecutionGuard;
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
    tool_cache: Arc<ToolResultCache>,
    process_reasoning: Option<Arc<ProcessReasoning>>,
    outcome_tracker: Option<Arc<OutcomeTracker>>,
    security_guard: Arc<ToolExecutionGuard>,
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
            tool_cache: Arc::new(ToolResultCache::new()),
            process_reasoning: None,
            outcome_tracker: None,
            security_guard: Arc::new(ToolExecutionGuard::new()),
        })
    }

    /// Create executor with process reasoning and outcome tracking
    pub fn with_process_reasoning(
        tool_registry: Arc<ToolRegistry>,
        resource_manager: Arc<ResourceManager>,
        automation: Arc<AutomationService>,
        router: Arc<tokio::sync::Mutex<LLMRouter>>,
        app_handle: Option<tauri::AppHandle>,
        process_reasoning: Arc<ProcessReasoning>,
        outcome_tracker: Arc<OutcomeTracker>,
    ) -> Result<Self> {
        Ok(Self {
            tool_registry,
            _resource_manager: resource_manager,
            automation,
            router,
            app_handle,
            tool_cache: Arc::new(ToolResultCache::new()),
            process_reasoning: Some(process_reasoning),
            outcome_tracker: Some(outcome_tracker),
            security_guard: Arc::new(ToolExecutionGuard::new()),
        })
    }

    /// Create a new executor with custom cache capacity
    pub fn with_cache_capacity(
        tool_registry: Arc<ToolRegistry>,
        resource_manager: Arc<ResourceManager>,
        automation: Arc<AutomationService>,
        router: Arc<tokio::sync::Mutex<LLMRouter>>,
        app_handle: Option<tauri::AppHandle>,
        cache_size_bytes: usize,
    ) -> Result<Self> {
        Ok(Self {
            tool_registry,
            _resource_manager: resource_manager,
            automation,
            router,
            app_handle,
            tool_cache: Arc::new(ToolResultCache::with_capacity(cache_size_bytes)),
            process_reasoning: None,
            outcome_tracker: None,
            security_guard: Arc::new(ToolExecutionGuard::new()),
        })
    }

    /// Get cache statistics
    pub fn get_cache_stats(&self) -> crate::cache::ToolCacheStats {
        self.tool_cache.get_stats()
    }

    /// Clear the tool result cache
    pub fn clear_cache(&self) -> Result<()> {
        self.tool_cache.clear()
    }

    /// Prune expired cache entries
    pub fn prune_cache(&self) -> Result<usize> {
        self.tool_cache.prune_expired()
    }

    /// Execute a plan step
    pub async fn execute_step(
        &self,
        step: &PlanStep,
        context: &ExecutionContext,
    ) -> Result<serde_json::Value> {
        tracing::info!("[Executor] Executing step: {}", step.description);

        // Emit StepStart hook event
        let session_id = uuid::Uuid::new_v4().to_string();
        crate::hooks::emit_event(crate::hooks::HookEvent::step_start(
            session_id.clone(),
            step.id
                .clone()
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            step.description.clone(),
            context.goal.id.clone(),
        ))
        .await;

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
        let result = match self.execute_tool(&tool, &step.parameters, context).await {
            Ok(res) => {
                // Emit StepCompleted hook event
                crate::hooks::emit_event(crate::hooks::HookEvent::step_completed(
                    session_id,
                    step.id
                        .clone()
                        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
                    step.description.clone(),
                    context.goal.id.clone(),
                    res.clone(),
                ))
                .await;
                Ok(res)
            }
            Err(e) => {
                // Emit StepError hook event
                crate::hooks::emit_event(crate::hooks::HookEvent::step_error(
                    session_id,
                    step.id
                        .clone()
                        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
                    step.description.clone(),
                    context.goal.id.clone(),
                    e.to_string(),
                ))
                .await;
                Err(e)
            }
        }?;

        Ok(result)
    }

    async fn execute_tool(
        &self,
        tool: &Tool,
        parameters: &HashMap<String, serde_json::Value>,
        _context: &ExecutionContext,
    ) -> Result<serde_json::Value> {
        let tool_name = tool.id.as_str();

        // Check cache before executing
        if let Some(cached_result) = self.tool_cache.get(tool_name, parameters) {
            tracing::info!(
                "[Executor] Using cached result for tool '{}' (cache hit)",
                tool_name
            );
            return Ok(cached_result);
        }

        // Execute tool
        let result = self
            .execute_tool_impl(tool_name, parameters, _context)
            .await?;

        // Cache the result (cache will determine if it should be cached based on TTL)
        if let Err(e) = self.tool_cache.set(tool_name, parameters, result.clone()) {
            tracing::warn!(
                "[Executor] Failed to cache result for tool '{}': {}",
                tool_name,
                e
            );
        }

        Ok(result)
    }

    async fn execute_tool_impl(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, serde_json::Value>,
        _context: &ExecutionContext,
    ) -> Result<serde_json::Value> {
        // Emit PreToolUse hook event
        let session_id = uuid::Uuid::new_v4().to_string();
        let start_time = std::time::Instant::now();
        crate::hooks::emit_event(crate::hooks::HookEvent::pre_tool_use(
            session_id.clone(),
            tool_name.to_string(),
            tool_name.to_string(),
            parameters.clone(),
        ))
        .await;

        // Security validation before execution
        let params_json = serde_json::to_value(parameters)?;
        if let Err(e) = self
            .security_guard
            .validate_tool_call(tool_name, &params_json)
            .await
        {
            tracing::error!(
                "[Executor] Security validation failed for tool '{}': {}",
                tool_name,
                e
            );
            // Emit ToolError hook event for security validation failure
            crate::hooks::emit_event(crate::hooks::HookEvent::tool_error(
                session_id,
                tool_name.to_string(),
                tool_name.to_string(),
                parameters.clone(),
                format!("Security validation failed: {}", e),
            ))
            .await;
            return Err(anyhow::anyhow!("Security validation failed: {}", e));
        }

        tracing::debug!(
            "[Executor] Security validation passed for tool '{}'",
            tool_name
        );

        let result = match tool_name {
            "file_read" => {
                let path = parameters["path"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("Missing path parameter"))?;

                let result = std::fs::read_to_string(path);

                // Emit frontend event for file read
                if let Some(ref app_handle) = self.app_handle {
                    let file_op = match &result {
                        Ok(content) => crate::events::create_file_read_event(
                            path,
                            content,
                            true,
                            None,
                            Some(session_id.clone()),
                        ),
                        Err(e) => crate::events::create_file_read_event(
                            path,
                            "",
                            false,
                            Some(e.to_string()),
                            Some(session_id.clone()),
                        ),
                    };
                    crate::events::emit_file_operation(app_handle, file_op);
                }

                let content = result?;
                Ok(json!({ "content": content, "path": path }))
            }
            "file_write" => {
                let path = parameters["path"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("Missing path parameter"))?;
                let content = parameters["content"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("Missing content parameter"))?;

                // Read old content if file exists
                let old_content = std::fs::read_to_string(path).ok();

                let result = std::fs::write(path, content);

                // Emit frontend event for file write
                if let Some(ref app_handle) = self.app_handle {
                    let file_op = crate::events::create_file_write_event(
                        path,
                        old_content.as_deref(),
                        content,
                        result.is_ok(),
                        result.as_ref().err().map(|e| e.to_string()),
                        Some(session_id.clone()),
                    );
                    crate::events::emit_file_operation(app_handle, file_op);
                }

                result?;

                // Invalidate file_read cache for this path
                let mut read_params = HashMap::new();
                read_params.insert("path".to_string(), serde_json::json!(path));
                let _ = self.tool_cache.invalidate("file_read", &read_params);

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

                // Emit frontend event for screenshot
                if let Some(ref app_handle) = self.app_handle {
                    // Convert image to base64
                    let image_bytes = std::fs::read(&temp_path)?;
                    let image_base64 = base64::Engine::encode(
                        &base64::engine::general_purpose::STANDARD,
                        &image_bytes,
                    );

                    let screenshot = crate::events::Screenshot {
                        id: uuid::Uuid::new_v4().to_string(),
                        image_base64,
                        action: parameters
                            .get("action")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        element_bounds: None, // Future: add element bounds if provided
                        confidence: None,
                    };
                    crate::events::emit_screenshot(app_handle, screenshot);
                }

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
                    let start_time = std::time::Instant::now();

                    // Determine shell type based on language
                    let shell_type = match language.to_lowercase().as_str() {
                        "powershell" | "ps1" => ShellType::PowerShell,
                        "bash" | "sh" | "shell" => ShellType::Wsl,
                        "cmd" | "batch" => ShellType::Cmd,
                        _ => ShellType::PowerShell, // Default to PowerShell
                    };

                    // Get or create a session
                    let sessions = session_manager.list_sessions().await;
                    let session_id_result = if sessions.is_empty() {
                        session_manager
                            .create_session(shell_type, None)
                            .await
                            .map_err(|e| anyhow!("Failed to create session: {}", e))?
                    } else {
                        sessions[0].clone()
                    };

                    // Execute the code
                    let command = format!("{}\r\n", code);
                    let execution_result = session_manager
                        .send_input(&session_id_result, &command)
                        .await;

                    // Wait a bit for execution
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

                    let duration_ms = start_time.elapsed().as_millis() as u64;

                    // Try to get current working directory from session
                    let cwd = std::env::current_dir()
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_else(|_| "/".to_string());

                    // Emit frontend event for terminal command
                    let terminal_cmd = crate::events::TerminalCommand {
                        id: uuid::Uuid::new_v4().to_string(),
                        command: code.to_string(),
                        cwd,
                        exit_code: if execution_result.is_ok() {
                            Some(0)
                        } else {
                            Some(1)
                        },
                        stdout: None, // Would need to capture from session output
                        stderr: if execution_result.is_err() {
                            Some(execution_result.as_ref().unwrap_err().to_string())
                        } else {
                            None
                        },
                        duration: Some(duration_ms),
                        session_id: Some(session_id_result.clone()),
                        agent_id: None,
                    };
                    crate::events::emit_terminal_command(app, terminal_cmd);

                    execution_result.map_err(|e| anyhow!("Failed to execute code: {}", e))?;

                    Ok(
                        json!({ "success": true, "language": language, "session_id": session_id_result, "code": &code[..code.len().min(100)] }),
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

                tracing::info!(
                    "[Executor] LLM reasoning: {}",
                    &prompt[..prompt.len().min(50)]
                );

                // HYBRID STRATEGY: Use Claude Haiku 4.5 for execution (4-5x faster, 1/3 cost)
                let preferences = RouterPreferences {
                    provider: Some(crate::router::Provider::Anthropic),
                    model: Some("claude-haiku-4-5".to_string()),
                    strategy: RoutingStrategy::Auto,
                };

                let request = LLMRequest {
                    messages: vec![ChatMessage {
                        role: "user".to_string(),
                        content: prompt.to_string(),
                        tool_calls: None,
                        tool_call_id: None,
                        multimodal_content: None,
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
                let body = parameters
                    .get("body")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'body' parameter"))?;

                if let Some(ref app) = self.app_handle {
                    use crate::commands::email::email_list_accounts;
                    use crate::commands::email::SendEmailRequest;
                    use crate::communications::EmailAddress;

                    // Get available email accounts
                    let accounts = email_list_accounts(app.clone()).await
                        .map_err(|e| anyhow!("Failed to list email accounts: {}. Please connect an email account first using email_connect.", e))?;

                    if accounts.is_empty() {
                        return Err(anyhow!("No email accounts configured. Please connect an email account first using email_connect command."));
                    }

                    // Use the first account (or could be parameterized)
                    let account = &accounts[0];

                    // Parse recipient email
                    let to_addresses = to
                        .split(',')
                        .map(|addr| EmailAddress::new(addr.trim().to_string(), None))
                        .collect();

                    // Create send request
                    let send_request = SendEmailRequest {
                        account_id: account.id,
                        to: to_addresses,
                        cc: vec![],
                        bcc: vec![],
                        reply_to: None,
                        subject: subject.to_string(),
                        body_text: Some(body.to_string()),
                        body_html: None,
                        attachments: vec![],
                    };

                    // Send via email_send command
                    use crate::commands::email::email_send;
                    let message_id = email_send(app.clone(), send_request)
                        .await
                        .map_err(|e| anyhow!("Email send failed: {}", e))?;

                    tracing::info!(
                        "[Executor] Email sent successfully: message_id={}",
                        message_id
                    );

                    Ok(json!({
                        "success": true,
                        "message_id": message_id,
                        "to": to,
                        "subject": subject,
                        "from": account.email
                    }))
                } else {
                    Err(anyhow!("App handle not available for email send"))
                }
            }
            "email_fetch" => {
                let account_id_str = parameters
                    .get("account_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'account_id' parameter"))?;
                let limit = parameters
                    .get("limit")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(10) as usize;

                if let Some(ref app) = self.app_handle {
                    use crate::commands::email::email_fetch_inbox;

                    // Parse account_id as i64
                    let account_id: i64 = account_id_str
                        .parse()
                        .map_err(|_| anyhow!("Invalid account_id format. Must be a number."))?;

                    // Fetch emails from inbox
                    let emails = email_fetch_inbox(
                        app.clone(),
                        account_id,
                        None, // folder (defaults to INBOX)
                        Some(limit),
                        None, // filter
                    )
                    .await
                    .map_err(|e| {
                        anyhow!(
                            "Failed to fetch emails: {}. Ensure the account is connected.",
                            e
                        )
                    })?;

                    tracing::info!(
                        "[Executor] Fetched {} emails for account_id={}",
                        emails.len(),
                        account_id
                    );

                    Ok(json!({
                        "success": true,
                        "account_id": account_id,
                        "count": emails.len(),
                        "emails": serde_json::to_value(&emails).map_err(|e| anyhow!("Failed to serialize emails: {}", e))?
                    }))
                } else {
                    Err(anyhow!("App handle not available for email fetch"))
                }
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
                let start_time = parameters
                    .get("start_time")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'start_time' parameter"))?;
                let end_time = parameters
                    .get("end_time")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'end_time' parameter"))?;
                let calendar_id = parameters
                    .get("calendar_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("primary"); // Default to primary calendar

                if let Some(ref app) = self.app_handle {
                    use crate::calendar::CreateEventRequest;
                    use tauri::Manager;

                    let calendar_state = app.state::<crate::commands::CalendarState>();

                    // Create event request
                    let request = CreateEventRequest {
                        calendar_id: calendar_id.to_string(),
                        title: title.to_string(),
                        description: parameters
                            .get("description")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        start: start_time.to_string(),
                        end: end_time.to_string(),
                        location: parameters
                            .get("location")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        attendees: vec![], // Could be extended to parse attendees from parameters
                        timezone: None,    // Will use default timezone
                    };

                    // Create event via CalendarState
                    let event = calendar_state.manager
                        .create_event(account_id, &request)
                        .await
                        .map_err(|e| anyhow!("Failed to create calendar event: {}. Ensure the calendar account is connected via calendar_connect.", e))?;

                    tracing::info!(
                        "[Executor] Calendar event created: id={}, title={}",
                        event.id,
                        event.title
                    );

                    Ok(json!({
                        "success": true,
                        "event_id": event.id,
                        "title": event.title,
                        "start": event.start,
                        "end": event.end,
                        "calendar_id": calendar_id
                    }))
                } else {
                    Err(anyhow!(
                        "App handle not available for calendar event creation"
                    ))
                }
            }
            "calendar_list_events" => {
                let account_id = parameters
                    .get("account_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'account_id' parameter"))?;

                if let Some(ref app) = self.app_handle {
                    use crate::calendar::ListEventsRequest;
                    use tauri::Manager;

                    let calendar_state = app.state::<crate::commands::CalendarState>();

                    // Build list events request
                    let request = ListEventsRequest {
                        calendar_id: parameters
                            .get("calendar_id")
                            .and_then(|v| v.as_str())
                            .unwrap_or("primary")
                            .to_string(),
                        time_min: parameters
                            .get("time_min")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        time_max: parameters
                            .get("time_max")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        max_results: parameters
                            .get("max_results")
                            .and_then(|v| v.as_u64())
                            .map(|n| n as usize),
                        page_token: None,
                    };

                    // List events via CalendarState
                    let response = calendar_state.manager
                        .list_events(account_id, &request)
                        .await
                        .map_err(|e| anyhow!("Failed to list calendar events: {}. Ensure the calendar account is connected via calendar_connect.", e))?;

                    tracing::info!(
                        "[Executor] Listed {} calendar events for account_id={}",
                        response.events.len(),
                        account_id
                    );

                    Ok(json!({
                        "success": true,
                        "account_id": account_id,
                        "count": response.events.len(),
                        "events": serde_json::to_value(&response.events).map_err(|e| anyhow!("Failed to serialize events: {}", e))?,
                        "next_page_token": response.next_page_token
                    }))
                } else {
                    Err(anyhow!("App handle not available for calendar list events"))
                }
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

                if let Some(ref app) = self.app_handle {
                    use tauri::Manager;

                    let cloud_state = app.state::<crate::commands::CloudState>();

                    // Upload file via CloudState
                    let account_id_clone = account_id.to_string();
                    let remote_path_clone = remote_path.to_string();
                    let local_path_clone = local_path.to_string();

                    let file_id = cloud_state.manager
                        .with_client(&account_id_clone, move |client| {
                            let remote = remote_path_clone.clone();
                            let local = local_path_clone.clone();
                            Box::pin(async move { client.upload(&local, &remote).await })
                        })
                        .await
                        .map_err(|e| anyhow!("Cloud upload failed: {}. Ensure the cloud account is connected via cloud_connect.", e))?;

                    tracing::info!("[Executor] Cloud upload successful: file_id={}, local_path={}, remote_path={}", file_id, local_path, remote_path);

                    Ok(json!({
                        "success": true,
                        "file_id": file_id,
                        "account_id": account_id,
                        "local_path": local_path,
                        "remote_path": remote_path
                    }))
                } else {
                    Err(anyhow!("App handle not available for cloud upload"))
                }
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

                if let Some(ref app) = self.app_handle {
                    use tauri::Manager;

                    let cloud_state = app.state::<crate::commands::CloudState>();

                    // Download file via CloudState
                    let account_id_clone = account_id.to_string();
                    let remote_path_clone = remote_path.to_string();
                    let local_path_clone = local_path.to_string();

                    cloud_state.manager
                        .with_client(&account_id_clone, move |client| {
                            let remote = remote_path_clone.clone();
                            let local = local_path_clone.clone();
                            Box::pin(async move { client.download(&remote, &local).await })
                        })
                        .await
                        .map_err(|e| anyhow!("Cloud download failed: {}. Ensure the cloud account is connected via cloud_connect.", e))?;

                    tracing::info!(
                        "[Executor] Cloud download successful: remote_path={}, local_path={}",
                        remote_path,
                        local_path
                    );

                    Ok(json!({
                        "success": true,
                        "account_id": account_id,
                        "remote_path": remote_path,
                        "local_path": local_path
                    }))
                } else {
                    Err(anyhow!("App handle not available for cloud download"))
                }
            }
            "productivity_create_task" => {
                let provider_str = parameters
                    .get("provider")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'provider' parameter"))?;
                let title = parameters
                    .get("title")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'title' parameter"))?;

                if let Some(ref app) = self.app_handle {
                    use crate::productivity::{Provider, Task};
                    use tauri::Manager;

                    let productivity_state = app.state::<crate::commands::ProductivityState>();

                    // Parse provider
                    let provider = match provider_str.to_lowercase().as_str() {
                        "notion" => Provider::Notion,
                        "trello" => Provider::Trello,
                        "asana" => Provider::Asana,
                        _ => {
                            return Err(anyhow!(
                            "Unknown productivity provider: {}. Supported: notion, trello, asana",
                            provider_str
                        ))
                        }
                    };

                    // Build task
                    let task = Task {
                        id: String::new(), // Will be assigned by the service
                        title: title.to_string(),
                        description: parameters
                            .get("description")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        status: parameters
                            .get("status")
                            .and_then(|v| v.as_str())
                            .unwrap_or("todo")
                            .to_string(),
                        priority: parameters
                            .get("priority")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        due_date: parameters
                            .get("due_date")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        assignee: parameters
                            .get("assignee")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        project_id: parameters
                            .get("project_id")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        labels: vec![],
                        created_at: None,
                        updated_at: None,
                    };

                    // Create task via ProductivityState
                    let manager = productivity_state.manager.lock().await;
                    let task_id = manager.create_task(provider, task).await
                        .map_err(|e| anyhow!("Failed to create productivity task: {}. Ensure the provider account is connected via productivity_connect.", e))?;

                    tracing::info!(
                        "[Executor] Productivity task created: provider={}, task_id={}, title={}",
                        provider_str,
                        task_id,
                        title
                    );

                    Ok(json!({
                        "success": true,
                        "task_id": task_id,
                        "provider": provider_str,
                        "title": title
                    }))
                } else {
                    Err(anyhow!(
                        "App handle not available for productivity task creation"
                    ))
                }
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
            _ => Err(anyhow!("Unknown tool: {}", tool_name)),
        };

        // Emit PostToolUse or ToolError hook event based on result
        let execution_time_ms = start_time.elapsed().as_millis() as u64;
        match &result {
            Ok(res) => {
                crate::hooks::emit_event(crate::hooks::HookEvent::post_tool_use(
                    session_id.clone(),
                    tool_name.to_string(),
                    tool_name.to_string(),
                    parameters.clone(),
                    res.clone(),
                    execution_time_ms,
                ))
                .await;
            }
            Err(e) => {
                crate::hooks::emit_event(crate::hooks::HookEvent::tool_error(
                    session_id.clone(),
                    tool_name.to_string(),
                    tool_name.to_string(),
                    parameters.clone(),
                    e.to_string(),
                ))
                .await;
            }
        }

        // Emit frontend event for tool execution
        if let Some(ref app_handle) = self.app_handle {
            let tool_execution = crate::events::create_tool_execution_event(
                tool_name,
                parameters,
                result.as_ref().ok().cloned(),
                result.as_ref().err().map(|e| e.to_string()),
                execution_time_ms,
                result.is_ok(),
            );
            crate::events::emit_tool_execution(app_handle, tool_execution);
        }

        result
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
            let tool_cache = self.tool_cache.clone();

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

                // Create executor with shared cache
                let mut executor = AGIExecutor::new(
                    tool_registry,
                    Arc::new(
                        ResourceManager::new(ResourceLimits {
                            cpu_percent: 80.0,
                            memory_mb: 2048,
                            network_mbps: 100.0,
                            storage_mb: 10240,
                        })
                        .unwrap(),
                    ),
                    automation,
                    router,
                    None,
                )
                .unwrap();

                // Replace the cache with shared cache for parallel execution
                executor.tool_cache = tool_cache;

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

        let execution_results: Vec<crate::agi::ExecutionResult> =
            results.into_iter().filter_map(|r| r.ok()).collect();

        tracing::info!(
            "[Executor] Parallel execution complete. {} results collected",
            execution_results.len()
        );

        Ok(execution_results)
    }

    /// Execute a goal with outcome tracking and process reasoning
    pub async fn execute_goal_with_outcomes(
        &self,
        goal: &Goal,
        plan: &planner::Plan,
        context: &ExecutionContext,
    ) -> Result<ExecutionResultWithOutcomes> {
        use tokio::time::Instant;

        let start_time = Instant::now();

        // 1. Identify process type if process reasoning is available
        let process_type = if let Some(ref pr) = self.process_reasoning {
            match pr.identify_process_type(goal).await {
                Ok(pt) => {
                    tracing::info!(
                        "[Executor] Identified process type: {:?} for goal {}",
                        pt,
                        goal.id
                    );
                    Some(pt)
                }
                Err(e) => {
                    tracing::warn!("[Executor] Failed to identify process type: {}", e);
                    None
                }
            }
        } else {
            None
        };

        // 2. Define expected outcomes if process type identified
        let expected_outcomes =
            if let (Some(pt), Some(ref pr)) = (process_type, &self.process_reasoning) {
                pr.define_outcomes(pt, goal)
            } else {
                vec![]
            };

        // 3. Execute plan steps
        let mut steps_completed = 0;
        let mut steps_failed = 0;
        let mut output = serde_json::json!({});
        let mut error_msg = None;

        for step in &plan.steps {
            match self.execute_step(step, context).await {
                Ok(result) => {
                    steps_completed += 1;
                    output = result;
                }
                Err(e) => {
                    steps_failed += 1;
                    error_msg = Some(e.to_string());
                    tracing::error!("[Executor] Step execution failed: {}", e);
                    break;
                }
            }
        }

        let execution_time_ms = start_time.elapsed().as_millis() as u64;
        let success = steps_failed == 0 && steps_completed > 0;

        // 4. Measure and track outcomes
        let mut tracked_outcomes = vec![];
        if let Some(ref tracker) = self.outcome_tracker {
            for mut outcome in expected_outcomes {
                // Measure actual outcome based on execution results
                let actual_value = self.measure_outcome(&outcome, context).await?;
                outcome.actual_value = Some(actual_value);

                // Determine if outcome was achieved
                outcome.achieved = match outcome.metric_name.as_str() {
                    // For time-based metrics, lower is better
                    "processing_time" | "response_time" | "deployment_time" => {
                        actual_value <= outcome.target_value
                    }
                    // For rate metrics (0.0 - 1.0), higher is better
                    "data_accuracy" | "response_quality" | "test_coverage" | "completion_rate" => {
                        actual_value >= outcome.target_value
                    }
                    // For count metrics, meeting or exceeding target
                    "invoices_processed" | "tickets_resolved" | "records_processed" => {
                        actual_value >= outcome.target_value
                    }
                    // For inverse metrics (false positive rate, rollback needed), lower is better
                    "false_positive_rate" | "rollback_needed" => {
                        actual_value <= outcome.target_value
                    }
                    // Default: compare directly
                    _ => actual_value >= outcome.target_value,
                };

                // Track the outcome
                if let Err(e) = tracker.track_outcome(goal.id.clone(), outcome.clone()) {
                    tracing::warn!("[Executor] Failed to track outcome: {}", e);
                } else {
                    tracked_outcomes.push(outcome);
                }
            }
        }

        // 5. Calculate outcome score if process reasoning available
        let outcome_score = if let Some(ref pr) = self.process_reasoning {
            if let Some(pt) = process_type {
                Some(pr.evaluate_outcome(pt, &tracked_outcomes, context))
            } else {
                None
            }
        } else {
            None
        };

        Ok(ExecutionResultWithOutcomes {
            success,
            output,
            execution_time_ms,
            steps_completed,
            steps_failed,
            error: error_msg,
            process_type,
            tracked_outcomes,
            outcome_score,
        })
    }

    /// Measure an outcome based on execution results
    async fn measure_outcome(
        &self,
        outcome: &crate::agi::process_reasoning::Outcome,
        context: &ExecutionContext,
    ) -> Result<f64> {
        // Measure actual outcome based on type
        match outcome.metric_name.as_str() {
            "processing_time" | "response_time" | "deployment_time" => {
                // Calculate total execution time in seconds
                let total_time_ms: u64 = context
                    .tool_results
                    .iter()
                    .map(|r| r.execution_time_ms)
                    .sum();
                Ok(total_time_ms as f64 / 1000.0)
            }
            "data_accuracy" | "categorization_accuracy" | "response_quality" => {
                // Calculate success rate of tool executions as proxy for accuracy
                let total = context.tool_results.len();
                if total == 0 {
                    return Ok(0.0);
                }
                let successful = context.tool_results.iter().filter(|r| r.success).count();
                Ok(successful as f64 / total as f64)
            }
            "invoices_processed" | "tickets_resolved" | "records_processed"
            | "emails_categorized" | "leads_scored" | "posts_scheduled" => {
                // Count successful operations
                let successful = context.tool_results.iter().filter(|r| r.success).count();
                Ok(successful as f64)
            }
            "test_coverage" | "documentation_completeness" | "completion_rate" => {
                // Use success rate as proxy for coverage/completeness
                let total = context.tool_results.len();
                if total == 0 {
                    return Ok(0.0);
                }
                let successful = context.tool_results.iter().filter(|r| r.success).count();
                Ok(successful as f64 / total as f64)
            }
            "false_positive_rate" => {
                // Calculate error rate
                let total = context.tool_results.len();
                if total == 0 {
                    return Ok(0.0);
                }
                let failed = context.tool_results.iter().filter(|r| !r.success).count();
                Ok(failed as f64 / total as f64)
            }
            "deployment_success" | "rollback_needed" => {
                // Boolean metrics: 1.0 if all steps succeeded, 0.0 otherwise
                let all_succeeded = context.tool_results.iter().all(|r| r.success);
                Ok(if all_succeeded { 1.0 } else { 0.0 })
            }
            "tests_passed" => {
                // Ratio of passed tests
                let total = context.tool_results.len();
                if total == 0 {
                    return Ok(0.0);
                }
                let passed = context.tool_results.iter().filter(|r| r.success).count();
                Ok(passed as f64 / total as f64)
            }
            _ => {
                // Default: use success rate as proxy
                let total = context.tool_results.len();
                if total == 0 {
                    return Ok(0.0);
                }
                let successful = context.tool_results.iter().filter(|r| r.success).count();
                Ok(successful as f64 / total as f64)
            }
        }
    }
}

/// Execution result with outcome tracking
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionResultWithOutcomes {
    pub success: bool,
    pub output: serde_json::Value,
    pub execution_time_ms: u64,
    pub steps_completed: usize,
    pub steps_failed: usize,
    pub error: Option<String>,
    pub process_type: Option<crate::agi::ProcessType>,
    pub tracked_outcomes: Vec<crate::agi::process_reasoning::Outcome>,
    pub outcome_score: Option<crate::agi::process_reasoning::OutcomeScore>,
}
