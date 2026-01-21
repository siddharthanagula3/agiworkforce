use super::*;
use crate::automation::{input::KeyboardSimulator, AutomationService};
use crate::core::agent::ChangeTracker;
use crate::core::agi::api_tools_impl;
use crate::core::agi::outcome_tracker::OutcomeTracker;
use crate::core::agi::planner::PlanStep;
use crate::core::agi::process_reasoning::ProcessReasoning;
use crate::core::llm::{ChatMessage, LLMRequest, LLMRouter, RouterPreferences, RoutingStrategy};
use crate::data::cache::ToolResultCache;
use crate::features::calendar::EventDateTime;
use crate::sys::security::ToolExecutionGuard;
use crate::ui::events::tool_stream::{
    emit_tool_completed, emit_tool_error, emit_tool_progress, emit_tool_started, OutputChunkType,
};
use anyhow::{anyhow, Result};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use serde_json::json;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

pub struct AGIExecutor {
    tool_registry: Arc<ToolRegistry>,
    _resource_manager: Arc<ResourceManager>,
    automation: Arc<AutomationService>,
    router: Arc<tokio::sync::RwLock<LLMRouter>>,
    app_handle: Option<tauri::AppHandle>,
    tool_cache: Arc<ToolResultCache>,
    process_reasoning: Option<Arc<ProcessReasoning>>,
    outcome_tracker: Option<Arc<OutcomeTracker>>,
    security_guard: Arc<ToolExecutionGuard>,
    change_tracker: Option<Arc<ChangeTracker>>,
}

impl AGIExecutor {
    pub fn new(
        tool_registry: Arc<ToolRegistry>,
        resource_manager: Arc<ResourceManager>,
        automation: Arc<AutomationService>,
        router: Arc<tokio::sync::RwLock<LLMRouter>>,
        app_handle: Option<tauri::AppHandle>,
        change_tracker: Option<Arc<ChangeTracker>>,
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
            change_tracker,
        })
    }

    pub fn with_process_reasoning(
        tool_registry: Arc<ToolRegistry>,
        resource_manager: Arc<ResourceManager>,
        automation: Arc<AutomationService>,
        router: Arc<tokio::sync::RwLock<LLMRouter>>,
        app_handle: Option<tauri::AppHandle>,
        process_reasoning: Arc<ProcessReasoning>,
        outcome_tracker: Arc<OutcomeTracker>,
        change_tracker: Option<Arc<ChangeTracker>>,
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
            change_tracker,
        })
    }

    pub fn with_cache_capacity(
        tool_registry: Arc<ToolRegistry>,
        resource_manager: Arc<ResourceManager>,
        automation: Arc<AutomationService>,
        router: Arc<tokio::sync::RwLock<LLMRouter>>,
        app_handle: Option<tauri::AppHandle>,
        cache_size_bytes: usize,
        change_tracker: Option<Arc<ChangeTracker>>,
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
            change_tracker,
        })
    }

    pub fn get_cache_stats(&self) -> crate::data::cache::ToolCacheStats {
        self.tool_cache.get_stats()
    }

    pub fn clear_cache(&self) -> Result<()> {
        self.tool_cache.clear()
    }

    pub fn prune_cache(&self) -> Result<usize> {
        self.tool_cache.prune_expired()
    }

    /// Get the list of allowed directories for file operations.
    /// This is used to prevent path traversal attacks by ensuring all file
    /// operations are restricted to explicitly allowed directories.
    ///
    /// Returns an empty Vec if no restrictions are configured (backwards compatibility),
    /// which will trigger a security warning but allow access.
    fn get_allowed_directories(&self) -> Vec<std::path::PathBuf> {
        // Try to get allowed directories from settings via app_handle
        if let Some(ref app) = self.app_handle {
            use tauri::Manager;

            // Try to get from settings state if available
            if let Some(settings_state) =
                app.try_state::<crate::sys::commands::settings::SettingsState>()
            {
                if let Ok(settings) = settings_state.settings.try_lock() {
                    // Return allowed directories from settings if configured and non-empty
                    if !settings.allowed_directories.is_empty() {
                        return settings
                            .allowed_directories
                            .iter()
                            .filter_map(|p| std::fs::canonicalize(p).ok())
                            .collect();
                    }
                }
            }
        }

        // Fallback: Return common safe directories as defaults
        // This provides reasonable security while maintaining backwards compatibility
        let mut defaults = Vec::new();

        // User's home directory
        if let Some(home) = dirs::home_dir() {
            defaults.push(home);
        }

        // Current working directory
        if let Ok(cwd) = std::env::current_dir() {
            defaults.push(cwd);
        }

        // Temp directory (for sandbox operations)
        defaults.push(std::env::temp_dir());

        defaults
    }

    fn normalized_step_id(step_id: &str) -> String {
        if step_id.trim().is_empty() {
            uuid::Uuid::new_v4().to_string()
        } else {
            step_id.to_string()
        }
    }

    fn parse_event_date_time(value: &str, timezone_hint: Option<&str>) -> Result<EventDateTime> {
        if value.contains('T') {
            let parsed = DateTime::parse_from_rfc3339(value)
                .map_err(|e| anyhow!("Invalid datetime '{}': {}", value, e))?
                .with_timezone(&Utc);
            Ok(EventDateTime::DateTime {
                date_time: parsed,
                timezone: timezone_hint.unwrap_or("UTC").to_string(),
            })
        } else {
            Ok(EventDateTime::Date {
                date: value.to_string(),
            })
        }
    }

    fn parse_rfc3339_ts(value: &str) -> Result<DateTime<Utc>> {
        Ok(DateTime::parse_from_rfc3339(value)
            .map_err(|e| anyhow!("Invalid datetime '{}': {}", value, e))?
            .with_timezone(&Utc))
    }

    fn parse_task_priority(value: &serde_json::Value) -> Option<u8> {
        if let Some(num) = value.as_u64() {
            return Some(num.min(u8::MAX as u64) as u8);
        }
        value.as_str().and_then(|s| s.parse::<u8>().ok())
    }

    fn map_task_status(status: &str) -> crate::features::productivity::TaskStatus {
        crate::features::productivity::TaskStatus::from_notion_status(status)
    }

    pub async fn execute_step(
        &self,
        step: &PlanStep,
        context: &ExecutionContext,
    ) -> Result<serde_json::Value> {
        tracing::info!("[Executor] Executing step: {}", step.description);

        let session_id = uuid::Uuid::new_v4().to_string();
        let normalized_step_id = Self::normalized_step_id(&step.id);
        crate::ui::hooks::emit_event(crate::ui::hooks::HookEvent::step_start(
            session_id.clone(),
            normalized_step_id.clone(),
            step.description.clone(),
            context.goal.id.clone(),
        ))
        .await;

        let tool = self
            .tool_registry
            .get_tool(&step.tool_id)
            .ok_or_else(|| anyhow::anyhow!("Tool {} not found", step.tool_id))?;

        for dep_id in &step.dependencies {
            let dep_result = context.tool_results.iter().find(|r| r.step_id == *dep_id);

            if let Some(result) = dep_result {
                if !result.success {
                    return Err(anyhow::anyhow!("Dependency {} failed", dep_id));
                }
            } else {
                return Err(anyhow::anyhow!("Dependency {} not found", dep_id));
            }
        }

        let result = match self.execute_tool(&tool, &step.parameters, context).await {
            Ok(res) => {
                crate::ui::hooks::emit_event(crate::ui::hooks::HookEvent::step_completed(
                    session_id,
                    normalized_step_id.clone(),
                    step.description.clone(),
                    context.goal.id.clone(),
                    res.clone(),
                ))
                .await;
                Ok(res)
            }
            Err(e) => {
                crate::ui::hooks::emit_event(crate::ui::hooks::HookEvent::step_error(
                    session_id,
                    normalized_step_id,
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

        if let Some(cached_result) = self.tool_cache.get(tool_name, parameters) {
            tracing::info!(
                "[Executor] Using cached result for tool '{}' (cache hit)",
                tool_name
            );
            return Ok(cached_result);
        }

        let result = self
            .execute_tool_impl(tool_name, parameters, _context)
            .await?;

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
        let session_id = uuid::Uuid::new_v4().to_string();
        let tool_id = format!("{}_{}", tool_name, &session_id[..8]);
        let start_time = std::time::Instant::now();

        // Emit tool stream started event
        if let Some(ref app_handle) = self.app_handle {
            emit_tool_started(
                app_handle,
                &tool_id,
                tool_name,
                Some(serde_json::to_value(parameters).unwrap_or_default()),
            );
        }

        crate::ui::hooks::emit_event(crate::ui::hooks::HookEvent::pre_tool_use(
            session_id.clone(),
            tool_name.to_string(),
            tool_name.to_string(),
            parameters.clone(),
        ))
        .await;

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

            // Emit tool stream error event
            if let Some(ref app_handle) = self.app_handle {
                emit_tool_error(
                    app_handle,
                    &tool_id,
                    &format!("Security validation failed: {}", e),
                    start_time.elapsed().as_millis() as u64,
                    false,
                );
            }

            crate::ui::hooks::emit_event(crate::ui::hooks::HookEvent::tool_error(
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

        // Clone tool_id for use in streaming within tool execution
        let tool_id_for_stream = tool_id.clone();

        let result = match tool_name {
            "file_read" => {
                let path = parameters["path"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("Missing path parameter"))?;

                // SECURITY: Canonicalize the path to resolve symlinks and prevent path traversal attacks
                // This converts relative paths to absolute and resolves "..", ".", and symlinks
                let canonical_path = std::fs::canonicalize(path).map_err(|e| {
                    anyhow::anyhow!("Invalid or inaccessible path '{}': {}", path, e)
                })?;

                // SECURITY: Validate the canonicalized path is within allowed directories
                // This prevents path traversal attacks like "../../../etc/passwd"
                let allowed_directories = self.get_allowed_directories();
                let path_allowed = if allowed_directories.is_empty() {
                    // If no restrictions configured, allow access (backwards compatibility)
                    // but log a security warning
                    tracing::warn!(
                        "[Executor] No allowed_directories configured - file access unrestricted. \
                        Consider configuring allowed directories for security."
                    );
                    true
                } else {
                    allowed_directories
                        .iter()
                        .any(|allowed_dir| canonical_path.starts_with(allowed_dir))
                };

                if !path_allowed {
                    tracing::error!(
                        "[Executor] Path traversal attempt blocked: '{}' resolved to '{}' which is outside allowed directories",
                        path,
                        canonical_path.display()
                    );
                    return Err(anyhow::anyhow!(
                        "Access denied: path '{}' is outside allowed directories",
                        path
                    ));
                }

                let result = std::fs::read_to_string(&canonical_path);

                if let Some(ref app_handle) = self.app_handle {
                    let display_path = canonical_path.to_string_lossy().to_string();
                    let file_op = match &result {
                        Ok(content) => crate::ui::events::create_file_read_event(
                            &display_path,
                            content,
                            true,
                            None,
                            Some(session_id.clone()),
                        ),
                        Err(e) => crate::ui::events::create_file_read_event(
                            &display_path,
                            "",
                            false,
                            Some(e.to_string()),
                            Some(session_id.clone()),
                        ),
                    };
                    crate::ui::events::emit_file_operation(app_handle, file_op);
                }

                let content = result?;
                Ok(json!({ "content": content, "path": canonical_path.to_string_lossy() }))
            }
            "file_write" => {
                let path = parameters["path"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("Missing path parameter"))?;
                let content = parameters["content"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("Missing content parameter"))?;

                // SECURITY: For new files, validate the parent directory exists and is allowed
                // For existing files, canonicalize the path to prevent path traversal
                let path_obj = std::path::Path::new(path);
                let canonical_path = if path_obj.exists() {
                    // File exists, canonicalize it
                    std::fs::canonicalize(path).map_err(|e| {
                        anyhow::anyhow!("Invalid or inaccessible path '{}': {}", path, e)
                    })?
                } else {
                    // New file - validate parent directory
                    let parent = path_obj
                        .parent()
                        .ok_or_else(|| anyhow::anyhow!("Invalid path: no parent directory"))?;
                    if !parent.exists() {
                        return Err(anyhow::anyhow!(
                            "Parent directory does not exist: {}",
                            parent.display()
                        ));
                    }
                    let canonical_parent = std::fs::canonicalize(parent).map_err(|e| {
                        anyhow::anyhow!("Invalid parent directory '{}': {}", parent.display(), e)
                    })?;
                    canonical_parent.join(
                        path_obj
                            .file_name()
                            .ok_or_else(|| anyhow::anyhow!("Invalid filename"))?,
                    )
                };

                // SECURITY: Validate the canonicalized path is within allowed directories
                // This prevents path traversal attacks like "../../../etc/passwd"
                let allowed_directories = self.get_allowed_directories();
                let path_allowed = if allowed_directories.is_empty() {
                    // If no restrictions configured, allow access (backwards compatibility)
                    // but log a security warning
                    tracing::warn!(
                        "[Executor] No allowed_directories configured - file write unrestricted. \
                        Consider configuring allowed directories for security."
                    );
                    true
                } else {
                    allowed_directories
                        .iter()
                        .any(|allowed_dir| canonical_path.starts_with(allowed_dir))
                };

                if !path_allowed {
                    tracing::error!(
                        "[Executor] Path traversal attempt blocked: '{}' resolved to '{}' which is outside allowed directories",
                        path,
                        canonical_path.display()
                    );
                    return Err(anyhow::anyhow!(
                        "Access denied: path '{}' is outside allowed directories",
                        path
                    ));
                }

                let old_content = std::fs::read_to_string(&canonical_path).ok();

                let result = std::fs::write(&canonical_path, content);

                if let Some(ref app_handle) = self.app_handle {
                    let display_path = canonical_path.to_string_lossy().to_string();
                    let file_op = crate::ui::events::create_file_write_event(
                        &display_path,
                        old_content.as_deref(),
                        content,
                        result.is_ok(),
                        result.as_ref().err().map(|e| e.to_string()),
                        Some(session_id.clone()),
                    );
                    crate::ui::events::emit_file_operation(app_handle, file_op);
                }

                result?;

                // Track file change for undo capability (CRITICAL for safety model)
                if let Some(ref tracker) = self.change_tracker {
                    let task_id = session_id.clone();
                    if old_content.is_some() {
                        // File was modified
                        tracker
                            .record_file_modified(
                                PathBuf::from(&canonical_path),
                                old_content.clone().unwrap_or_default(),
                                content.to_string(),
                                task_id,
                            )
                            .await;
                        tracing::debug!(
                            "[Executor] Tracked file modification for undo: {}",
                            canonical_path.display()
                        );
                    } else {
                        // File was created
                        tracker
                            .record_file_created(
                                PathBuf::from(&canonical_path),
                                content.to_string(),
                                task_id,
                            )
                            .await;
                        tracing::debug!(
                            "[Executor] Tracked file creation for undo: {}",
                            canonical_path.display()
                        );
                    }
                }

                let mut read_params = HashMap::new();
                read_params.insert(
                    "path".to_string(),
                    serde_json::json!(canonical_path.to_string_lossy()),
                );
                let _ = self.tool_cache.invalidate("file_read", &read_params);

                Ok(json!({ "success": true, "path": canonical_path.to_string_lossy() }))
            }
            "file_delete" => {
                let path = parameters["path"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("Missing path parameter"))?;

                // SECURITY: Canonicalize the path to resolve symlinks and prevent path traversal attacks
                // This converts relative paths to absolute and resolves "..", ".", and symlinks
                let canonical_path = std::fs::canonicalize(path).map_err(|e| {
                    anyhow::anyhow!("Invalid or inaccessible path '{}': {}", path, e)
                })?;

                // SECURITY: Validate the canonicalized path is within allowed directories
                // This prevents path traversal attacks like "../../../etc/passwd"
                let allowed_directories = self.get_allowed_directories();
                let path_allowed = if allowed_directories.is_empty() {
                    // If no restrictions configured, allow access (backwards compatibility)
                    // but log a security warning
                    tracing::warn!(
                        "[Executor] No allowed_directories configured - file delete unrestricted. \
                        Consider configuring allowed directories for security."
                    );
                    true
                } else {
                    allowed_directories
                        .iter()
                        .any(|allowed_dir| canonical_path.starts_with(allowed_dir))
                };

                if !path_allowed {
                    tracing::error!(
                        "[Executor] Path traversal attempt blocked: '{}' resolved to '{}' which is outside allowed directories",
                        path,
                        canonical_path.display()
                    );
                    return Err(anyhow::anyhow!(
                        "Access denied: path '{}' is outside allowed directories",
                        path
                    ));
                }

                // SECURITY: Ensure we're deleting a file, not a directory
                // Directories require a separate tool with different safety considerations
                let metadata = std::fs::metadata(&canonical_path)
                    .map_err(|e| anyhow::anyhow!("Cannot access file '{}': {}", path, e))?;

                if metadata.is_dir() {
                    return Err(anyhow::anyhow!(
                        "Cannot delete '{}': path is a directory. Use a directory deletion tool instead.",
                        path
                    ));
                }

                // Store content before deletion for undo capability (CRITICAL for safety model)
                // This enables the reversibility principle - users can undo file deletions
                let content_before = std::fs::read_to_string(&canonical_path).ok();
                let size_bytes = metadata.len() as usize;

                // Perform the deletion
                let result = std::fs::remove_file(&canonical_path);

                // Emit file operation event for UI and audit trail
                if let Some(ref app_handle) = self.app_handle {
                    let display_path = canonical_path.to_string_lossy().to_string();
                    let file_op = crate::ui::events::create_file_delete_event(
                        &display_path,
                        Some(size_bytes),
                        result.is_ok(),
                        result.as_ref().err().map(|e| e.to_string()),
                        Some(session_id.clone()),
                    );
                    crate::ui::events::emit_file_operation(app_handle, file_op);
                }

                // Check if deletion succeeded
                result?;

                // Track file deletion for undo capability (CRITICAL for safety model)
                if let Some(ref tracker) = self.change_tracker {
                    if let Some(ref content) = content_before {
                        tracker
                            .record_file_deleted(
                                PathBuf::from(&canonical_path),
                                content.clone(),
                                session_id.clone(),
                            )
                            .await;
                        tracing::debug!(
                            "[Executor] Tracked file deletion for undo: {}",
                            canonical_path.display()
                        );
                    }
                }

                // Invalidate any cached file_read results for this path
                let mut read_params = HashMap::new();
                read_params.insert(
                    "path".to_string(),
                    serde_json::json!(canonical_path.to_string_lossy()),
                );
                let _ = self.tool_cache.invalidate("file_read", &read_params);

                Ok(json!({
                    "success": true,
                    "path": canonical_path.to_string_lossy(),
                    "size_bytes": size_bytes,
                    "had_content": content_before.is_some(),
                    "content_backup": content_before
                }))
            }
            "ui_screenshot" => {
                use crate::automation::screen::capture_primary_screen;
                let captured = capture_primary_screen()?;
                let temp_path = std::env::temp_dir().join(format!(
                    "screenshot_{}.png",
                    &uuid::Uuid::new_v4().to_string()[..8]
                ));
                captured.pixels.save(&temp_path)?;

                if let Some(ref app_handle) = self.app_handle {
                    let image_bytes = std::fs::read(&temp_path)?;
                    let image_base64 = base64::Engine::encode(
                        &base64::engine::general_purpose::STANDARD,
                        &image_bytes,
                    );

                    let screenshot = crate::ui::events::Screenshot {
                        id: uuid::Uuid::new_v4().to_string(),
                        image_base64,
                        action: parameters
                            .get("action")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        element_bounds: None,
                        confidence: None,
                    };
                    crate::ui::events::emit_screenshot(app_handle, screenshot);
                }

                Ok(json!({ "screenshot_path": temp_path.to_string_lossy().to_string() }))
            }
            "ui_click" => {
                let target = parameters
                    .get("target")
                    .ok_or_else(|| anyhow!("Missing target parameter"))?;

                if let Some(coords) = target.get("coordinates") {
                    let x = coords.get("x").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                    let y = coords.get("y").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                    use crate::automation::input::MouseButton;
                    self.automation
                        .mouse
                        .lock()
                        .unwrap()
                        .click(x, y, MouseButton::Left)?;
                    Ok(json!({ "success": true, "action": "clicked", "x": x, "y": y }))
                } else if let Some(element_id) = target.get("element_id").and_then(|v| v.as_str()) {
                    self.automation.native.invoke(element_id)?;
                    Ok(json!({ "success": true, "action": "invoked", "element_id": element_id }))
                } else if let Some(text) = target.get("text").and_then(|v| v.as_str()) {
                    use crate::automation::types::ElementQuery;
                    let query = ElementQuery {
                        window: None,
                        window_class: None,
                        name: Some(text.to_string()),
                        class_name: None,
                        automation_id: None,
                        control_type: None,
                        max_results: Some(1),
                    };
                    let elements = self.automation.native.find_elements(None, &query)?;
                    if let Some(element) = elements.first() {
                        self.automation.native.invoke(&element.id)?;
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

                if let Some(element_id) = target.get("element_id").and_then(|v| v.as_str()) {
                    self.automation.native.set_focus(element_id)?;
                    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                } else if let Some(target_text) = target.get("text").and_then(|v| v.as_str()) {
                    use crate::automation::types::ElementQuery;
                    let query = ElementQuery {
                        window: None,
                        window_class: None,
                        name: Some(target_text.to_string()),
                        class_name: None,
                        automation_id: None,
                        control_type: None,
                        max_results: Some(1),
                    };
                    let elements = self.automation.native.find_elements(None, &query)?;
                    if let Some(element) = elements.first() {
                        self.automation.native.set_focus(&element.id)?;
                        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                    }
                }

                let mut keyboard = KeyboardSimulator::new()?;
                keyboard.send_text(text).await?;
                Ok(json!({ "success": true, "action": "typed", "text": text }))
            }
            "browser_navigate" => {
                let url = parameters["url"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("Missing url parameter"))?;

                if let Some(ref app) = self.app_handle {
                    use crate::sys::commands::BrowserStateWrapper;
                    use tauri::Manager;

                    let browser_state = app.state::<BrowserStateWrapper>();
                    let tab_manager = browser_state
                        .get_tab_manager()
                        .map_err(|e| anyhow!("{}", e))?
                        .lock()
                        .await;

                    let tabs = tab_manager
                        .list_tabs()
                        .await
                        .map_err(|e| anyhow!("Failed to list tabs: {}", e))?;
                    let tab_id = if tabs.is_empty() {
                        tab_manager
                            .open_tab(url)
                            .await
                            .map_err(|e| anyhow!("Failed to open tab: {}", e))?
                    } else {
                        tabs[0].id.clone()
                    };

                    use crate::automation::browser::NavigationOptions;
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
                    use crate::automation::browser::{ClickOptions, DomOperations};
                    use crate::sys::commands::BrowserStateWrapper;
                    use tauri::Manager;

                    let browser_state = app.state::<BrowserStateWrapper>();
                    let tab_manager = browser_state
                        .get_tab_manager()
                        .map_err(|e| anyhow!("{}", e))?
                        .lock()
                        .await;

                    let target_tab_id = if let Some(tid) = tab_id {
                        tid.to_string()
                    } else {
                        let tabs = tab_manager
                            .list_tabs()
                            .await
                            .map_err(|e| anyhow!("Failed to list tabs: {}", e))?;
                        if tabs.is_empty() {
                            return Err(anyhow!("No browser tabs available. Please navigate to a URL first using browser_navigate."));
                        }
                        tabs[0].id.clone()
                    };

                    let cdp_client = browser_state
                        .get_cdp_client_for_tab(&target_tab_id)
                        .await
                        .map_err(|e| anyhow!("{}", e))?;

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
                    .unwrap_or("body");
                let tab_id = parameters.get("tab_id").and_then(|v| v.as_str());
                let extract_type = parameters
                    .get("extract_type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("text");

                if let Some(ref app) = self.app_handle {
                    use crate::automation::browser::DomOperations;
                    use crate::sys::commands::BrowserStateWrapper;
                    use tauri::Manager;

                    let browser_state = app.state::<BrowserStateWrapper>();
                    let tab_manager = browser_state
                        .get_tab_manager()
                        .map_err(|e| anyhow!("{}", e))?
                        .lock()
                        .await;

                    let target_tab_id = if let Some(tid) = tab_id {
                        tid.to_string()
                    } else {
                        let tabs = tab_manager
                            .list_tabs()
                            .await
                            .map_err(|e| anyhow!("Failed to list tabs: {}", e))?;
                        if tabs.is_empty() {
                            return Err(anyhow!("No browser tabs available. Please navigate to a URL first using browser_navigate."));
                        }
                        tabs[0].id.clone()
                    };

                    let result = match extract_type {
                        "text" => {
                            let text = DomOperations::get_text(&target_tab_id, selector)
                                .await
                                .map_err(|e| {
                                    anyhow!("Failed to extract text from '{}': {}", selector, e)
                                })?;
                            json!({ "type": "text", "content": text })
                        }
                        "attribute" => {
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

                // Optional parameters for sandbox execution
                let timeout_secs = parameters
                    .get("timeout")
                    .and_then(|v| v.as_u64())
                    .or_else(|| parameters.get("timeout_secs").and_then(|v| v.as_u64()));
                let stdin = parameters
                    .get("stdin")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let allow_network = parameters
                    .get("allow_network")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

                // Parse environment variables if provided
                let env_vars = parameters
                    .get("env")
                    .or_else(|| parameters.get("env_vars"))
                    .and_then(|v| v.as_object())
                    .map(|obj| {
                        obj.iter()
                            .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                            .collect::<HashMap<String, String>>()
                    });

                // Parse additional files if provided
                let files = parameters
                    .get("files")
                    .and_then(|v| v.as_object())
                    .map(|obj| {
                        obj.iter()
                            .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                            .collect::<HashMap<String, String>>()
                    });

                use crate::ui::events::tool_stream::emit_tool_output_chunk;

                // Emit progress: creating sandbox
                if let Some(ref app) = self.app_handle {
                    emit_tool_progress(
                        app,
                        &tool_id_for_stream,
                        0.1,
                        Some("Creating isolated sandbox..."),
                    );
                }

                // Create sandbox manager and execute code in isolation
                let sandbox_manager = crate::core::agi::SandboxManager::new()
                    .map_err(|e| anyhow!("Failed to create sandbox manager: {}", e))?;

                // Emit progress: executing code
                if let Some(ref app) = self.app_handle {
                    emit_tool_progress(
                        app,
                        &tool_id_for_stream,
                        0.3,
                        Some(&format!("Executing {} code in sandbox...", language)),
                    );
                }

                // Build execution config
                let exec_config = crate::core::agi::ExecutionConfig {
                    language: language.to_string(),
                    code: code.to_string(),
                    stdin,
                    timeout_secs,
                    env_vars,
                    allow_network,
                    memory_limit_mb: Some(512), // Default 512MB limit
                    files,
                };

                // Execute code in sandbox
                let exec_result = sandbox_manager
                    .execute_code(exec_config)
                    .await
                    .map_err(|e| anyhow!("Sandbox execution failed: {}", e))?;

                // Emit progress: processing result
                if let Some(ref app) = self.app_handle {
                    emit_tool_progress(
                        app,
                        &tool_id_for_stream,
                        0.9,
                        Some("Processing execution result..."),
                    );
                }

                // Emit output chunks for streaming display
                if let Some(ref app) = self.app_handle {
                    // Emit command that was executed
                    emit_tool_output_chunk(
                        app,
                        &tool_id_for_stream,
                        &format!(
                            "$ {} [{}]\n",
                            language,
                            if exec_result.success { "OK" } else { "FAILED" }
                        ),
                        OutputChunkType::Stdout,
                        false,
                    );

                    // Emit stdout if present
                    if !exec_result.stdout.is_empty() {
                        emit_tool_output_chunk(
                            app,
                            &tool_id_for_stream,
                            &exec_result.stdout,
                            OutputChunkType::Stdout,
                            false,
                        );
                    }

                    // Emit stderr if present
                    if !exec_result.stderr.is_empty() {
                        emit_tool_output_chunk(
                            app,
                            &tool_id_for_stream,
                            &exec_result.stderr,
                            OutputChunkType::Stderr,
                            false,
                        );
                    }

                    // Emit completion marker
                    emit_tool_output_chunk(
                        app,
                        &tool_id_for_stream,
                        &format!(
                            "\n[Exit code: {}] [Time: {}ms]\n",
                            exec_result
                                .exit_code
                                .map(|c| c.to_string())
                                .unwrap_or_else(|| "N/A".to_string()),
                            exec_result.execution_time_ms
                        ),
                        OutputChunkType::Stdout,
                        true,
                    );
                }

                // Emit terminal command event for UI
                if let Some(ref app) = self.app_handle {
                    let terminal_cmd = crate::ui::events::TerminalCommand {
                        id: uuid::Uuid::new_v4().to_string(),
                        command: code.to_string(),
                        cwd: exec_result.working_directory.clone(),
                        exit_code: exec_result.exit_code,
                        stdout: Some(exec_result.stdout.clone()),
                        stderr: if exec_result.stderr.is_empty() {
                            None
                        } else {
                            Some(exec_result.stderr.clone())
                        },
                        duration: Some(exec_result.execution_time_ms),
                        session_id: None, // Sandbox execution doesn't use terminal sessions
                        agent_id: None,
                    };
                    crate::ui::events::emit_terminal_command(app, terminal_cmd);
                }

                // Return structured result
                if exec_result.success {
                    Ok(json!({
                        "success": true,
                        "language": exec_result.language,
                        "output": exec_result.output,
                        "stdout": exec_result.stdout,
                        "stderr": exec_result.stderr,
                        "exit_code": exec_result.exit_code,
                        "execution_time_ms": exec_result.execution_time_ms,
                        "timed_out": exec_result.timed_out,
                        "working_directory": exec_result.working_directory,
                        "code_preview": &code[..code.len().min(100)]
                    }))
                } else {
                    // Return error information but still as a valid JSON response
                    Ok(json!({
                        "success": false,
                        "language": exec_result.language,
                        "output": exec_result.output,
                        "stdout": exec_result.stdout,
                        "stderr": exec_result.stderr,
                        "error": exec_result.error,
                        "exit_code": exec_result.exit_code,
                        "execution_time_ms": exec_result.execution_time_ms,
                        "timed_out": exec_result.timed_out,
                        "working_directory": exec_result.working_directory
                    }))
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

                // SECURITY: SQL injection protection
                // Block dangerous SQL statements that could modify or destroy data.
                // The db_query tool is intended for READ-ONLY operations.
                // For write operations, use db_execute with proper authorization.
                const DANGEROUS_SQL_KEYWORDS: &[&str] = &[
                    // Data destruction
                    "DROP",
                    "TRUNCATE",
                    "DELETE",
                    // Schema modification
                    "ALTER",
                    "CREATE",
                    "RENAME",
                    // Data modification (use db_execute for these)
                    "INSERT",
                    "UPDATE",
                    "REPLACE",
                    "MERGE",
                    "UPSERT",
                    // Permission/security changes
                    "GRANT",
                    "REVOKE",
                    // Database administration
                    "VACUUM",
                    "ANALYZE",
                    "REINDEX",
                    "CLUSTER",
                    // Transaction control (should be explicit via db_transaction_* tools)
                    "BEGIN",
                    "COMMIT",
                    "ROLLBACK",
                    "SAVEPOINT",
                    // Dangerous operations
                    "EXEC",
                    "EXECUTE",
                    "CALL",
                    // File system access
                    "COPY",
                    "LOAD",
                    "ATTACH",
                    "DETACH",
                    // SQLite specific
                    "PRAGMA",
                ];

                // Normalize query for keyword detection (uppercase, collapse whitespace)
                let normalized_query = query.to_uppercase();
                let query_words: Vec<&str> = normalized_query.split_whitespace().collect();

                // Check for dangerous keywords at word boundaries
                for keyword in DANGEROUS_SQL_KEYWORDS {
                    // Check if keyword appears as a standalone word (not part of a string literal)
                    // This prevents false positives like "SELECT description FROM items"
                    // where "description" contains "DROP"
                    for word in query_words.iter() {
                        // Remove common SQL punctuation for comparison
                        let clean_word = word.trim_matches(|c: char| !c.is_alphanumeric());
                        if clean_word == *keyword {
                            // Additional check: don't block if it's clearly inside a string
                            // (basic heuristic - proper parsing would require SQL parser)
                            let keyword_pos = normalized_query.find(keyword);
                            if let Some(pos) = keyword_pos {
                                // Count quotes before this position
                                let prefix = &query[..pos.min(query.len())];
                                let single_quotes = prefix.matches('\'').count();
                                let double_quotes = prefix.matches('"').count();

                                // If odd number of quotes, we're inside a string literal
                                if single_quotes % 2 == 0 && double_quotes % 2 == 0 {
                                    tracing::error!(
                                        "[Executor] SQL injection attempt blocked: dangerous keyword '{}' in query",
                                        keyword
                                    );
                                    return Err(anyhow!(
                                        "Dangerous SQL operation '{}' is not allowed in db_query. \
                                        Use db_execute for write operations with proper authorization.",
                                        keyword
                                    ));
                                }
                            }
                        }
                    }
                }

                // Additional check for SQL comment-based injection attempts
                if normalized_query.contains("--") || normalized_query.contains("/*") {
                    tracing::warn!(
                        "[Executor] SQL query contains comment syntax which may indicate injection attempt"
                    );
                    // Don't block, but log for monitoring
                }

                // Check for multiple statements (semicolon outside strings)
                let mut in_string = false;
                let mut string_char = ' ';
                for (i, c) in query.chars().enumerate() {
                    if !in_string && (c == '\'' || c == '"') {
                        in_string = true;
                        string_char = c;
                    } else if in_string && c == string_char {
                        // Check for escaped quote
                        let prev_char = query.chars().nth(i.saturating_sub(1));
                        if prev_char != Some('\\') {
                            in_string = false;
                        }
                    } else if !in_string && c == ';' {
                        // Found semicolon outside string - check if there's more SQL after it
                        let remaining = query[i + 1..].trim();
                        if !remaining.is_empty() {
                            tracing::error!(
                                "[Executor] SQL injection attempt blocked: multiple statements detected"
                            );
                            return Err(anyhow!(
                                "Multiple SQL statements are not allowed. Use separate db_query calls."
                            ));
                        }
                    }
                }

                if let Some(ref app) = self.app_handle {
                    use crate::sys::commands::DatabaseState;
                    use tauri::Manager;
                    use tokio::sync::Mutex;

                    let db_state = app.state::<Mutex<DatabaseState>>();
                    let db_guard = db_state.lock().await;

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

                use crate::automation::screen::perform_ocr;

                let ocr_result = perform_ocr(image_path)
                    .await
                    .map_err(|e| anyhow!("OCR failed: {}", e))?;

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

                let preferences = RouterPreferences {
                    provider: Some(crate::core::llm::Provider::Anthropic),
                    model: Some("claude-haiku-4-5".to_string()),
                    strategy: RoutingStrategy::Auto,
                    context: None,
                    prefer_cloud_credits: false,
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
                    thinking_mode: None,
                };

                let router = self.router.read().await;
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
                    use crate::features::communications::EmailAddress;
                    use crate::sys::commands::email::email_list_accounts;
                    use crate::sys::commands::email::SendEmailRequest;

                    let accounts = email_list_accounts(app.clone()).await
                        .map_err(|e| anyhow!("Failed to list email accounts: {}. Please connect an email account first using email_connect.", e))?;

                    if accounts.is_empty() {
                        return Err(anyhow!("No email accounts configured. Please connect an email account first using email_connect command."));
                    }

                    let account = &accounts[0];

                    let to_addresses = to
                        .split(',')
                        .map(|addr| EmailAddress::new(addr.trim().to_string(), None))
                        .collect();

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

                    use crate::sys::commands::email::email_send;
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
                    use crate::sys::commands::email::email_fetch_inbox;

                    let account_id: i64 = account_id_str
                        .parse()
                        .map_err(|_| anyhow!("Invalid account_id format. Must be a number."))?;

                    let emails =
                        email_fetch_inbox(app.clone(), account_id, None, Some(limit), None)
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
                    .unwrap_or("primary");

                if let Some(ref app) = self.app_handle {
                    use crate::features::calendar::CreateEventRequest;
                    use tauri::Manager;

                    let calendar_state = app.state::<crate::sys::commands::CalendarState>();

                    let start_timezone = parameters
                        .get("start_timezone")
                        .and_then(|v| v.as_str())
                        .or_else(|| parameters.get("timezone").and_then(|v| v.as_str()));
                    let end_timezone = parameters
                        .get("end_timezone")
                        .and_then(|v| v.as_str())
                        .or_else(|| parameters.get("timezone").and_then(|v| v.as_str()));

                    let attendees = parameters
                        .get("attendees")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|item| item.as_str().map(|s| s.to_string()))
                                .collect::<Vec<String>>()
                        })
                        .unwrap_or_default();

                    let request = CreateEventRequest {
                        calendar_id: calendar_id.to_string(),
                        title: title.to_string(),
                        description: parameters
                            .get("description")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        start: Self::parse_event_date_time(start_time, start_timezone)?,
                        end: Self::parse_event_date_time(end_time, end_timezone)?,
                        location: parameters
                            .get("location")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        attendees,
                        reminders: Vec::new(),
                        recurrence: None,
                    };

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
                    use crate::features::calendar::ListEventsRequest;
                    use tauri::Manager;

                    let calendar_state = app.state::<crate::sys::commands::CalendarState>();

                    let start_time = parameters
                        .get("start_time")
                        .or_else(|| parameters.get("time_min"))
                        .and_then(|v| v.as_str());
                    let end_time = parameters
                        .get("end_time")
                        .or_else(|| parameters.get("time_max"))
                        .and_then(|v| v.as_str());

                    let parsed_start = match start_time {
                        Some(value) => Self::parse_rfc3339_ts(value)?,
                        None => Utc::now(),
                    };
                    let parsed_end = match end_time {
                        Some(value) => Self::parse_rfc3339_ts(value)?,
                        None => parsed_start + ChronoDuration::days(7),
                    };

                    let request = ListEventsRequest {
                        calendar_id: parameters
                            .get("calendar_id")
                            .and_then(|v| v.as_str())
                            .unwrap_or("primary")
                            .to_string(),
                        start_time: parsed_start,
                        end_time: parsed_end,
                        max_results: parameters
                            .get("max_results")
                            .and_then(|v| v.as_u64())
                            .map(|n| n as u32),
                        show_deleted: parameters.get("show_deleted").and_then(|v| v.as_bool()),
                    };

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

                    let cloud_state = app.state::<crate::sys::commands::CloudState>();

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

                    let cloud_state = app.state::<crate::sys::commands::CloudState>();

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
                    use crate::features::productivity::{Provider, Task, TaskStatus};
                    use tauri::Manager;

                    let productivity_state = app.state::<crate::sys::commands::ProductivityState>();

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

                    let mut task = Task::new(String::new(), title.to_string());
                    if let Some(desc) = parameters.get("description").and_then(|v| v.as_str()) {
                        task.description = Some(desc.to_string());
                    }

                    let status = parameters
                        .get("status")
                        .and_then(|v| v.as_str())
                        .map(Self::map_task_status)
                        .unwrap_or(TaskStatus::Todo);
                    task.status = status;

                    task.priority = parameters
                        .get("priority")
                        .and_then(Self::parse_task_priority);

                    task.due_date = match parameters.get("due_date").and_then(|v| v.as_str()) {
                        Some(raw) => Some(
                            Self::parse_rfc3339_ts(raw)
                                .map_err(|e| anyhow!("Invalid 'due_date': {}", e))?,
                        ),
                        None => None,
                    };

                    if let Some(assignee) = parameters.get("assignee").and_then(|v| v.as_str()) {
                        task.assignee = Some(assignee.to_string());
                    }

                    if let Some(project_id) = parameters.get("project_id").and_then(|v| v.as_str())
                    {
                        task.project_id = Some(project_id.to_string());
                    }

                    if let Some(project_name) =
                        parameters.get("project_name").and_then(|v| v.as_str())
                    {
                        task.project_name = Some(project_name.to_string());
                    }

                    if let Some(url) = parameters.get("url").and_then(|v| v.as_str()) {
                        task.url = Some(url.to_string());
                    }

                    let tags_source = parameters.get("tags").or_else(|| parameters.get("labels"));
                    task.tags = tags_source
                        .and_then(|value| value.as_array())
                        .map(|items| {
                            items
                                .iter()
                                .filter_map(|item| item.as_str().map(|s| s.to_string()))
                                .collect::<Vec<String>>()
                        })
                        .unwrap_or_default();

                    let manager_arc = productivity_state.manager();
                    let manager = manager_arc.lock().await;
                    let task_id = manager
                        .create_task(provider, task)
                        .await
                        .map_err(|e| {
                            anyhow!("Failed to create productivity task: {}. Ensure the provider account is connected via productivity_connect.", e)
                        })?;

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
                    use crate::sys::commands::DocumentState;
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
                    use crate::sys::commands::DocumentState;
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

                let params = parameters
                    .get("params")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();

                if let Some(ref app) = self.app_handle {
                    use crate::sys::commands::DatabaseState;
                    use tauri::Manager;
                    use tokio::sync::Mutex;

                    let db_state = app.state::<Mutex<DatabaseState>>();
                    let db_guard = db_state.lock().await;

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
                    use crate::sys::commands::DatabaseState;
                    use tauri::Manager;
                    use tokio::sync::Mutex;

                    let db_state = app.state::<Mutex<DatabaseState>>();
                    let db_guard = db_state.lock().await;

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
                    use crate::sys::commands::DatabaseState;
                    use tauri::Manager;
                    use tokio::sync::Mutex;

                    let db_state = app.state::<Mutex<DatabaseState>>();
                    let db_guard = db_state.lock().await;

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
                    use crate::sys::commands::DatabaseState;
                    use tauri::Manager;
                    use tokio::sync::Mutex;

                    let db_state = app.state::<Mutex<DatabaseState>>();
                    let db_guard = db_state.lock().await;

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
            "git_status" => {
                let path = parameters["path"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("Missing path parameter"))?;

                // SECURITY: Canonicalize the path to resolve symlinks and prevent path traversal attacks
                let canonical_path = std::fs::canonicalize(path).map_err(|e| {
                    anyhow::anyhow!("Invalid or inaccessible path '{}': {}", path, e)
                })?;

                // SECURITY: Validate the canonicalized path is within allowed directories
                let allowed_directories = self.get_allowed_directories();
                let path_allowed = if allowed_directories.is_empty() {
                    tracing::warn!(
                        "[Executor] No allowed_directories configured - git_status access unrestricted. \
                        Consider configuring allowed directories for security."
                    );
                    true
                } else {
                    allowed_directories
                        .iter()
                        .any(|allowed_dir| canonical_path.starts_with(allowed_dir))
                };

                if !path_allowed {
                    tracing::error!(
                        "[Executor] Path traversal attempt blocked for git_status: '{}' resolved to '{}' which is outside allowed directories",
                        path,
                        canonical_path.display()
                    );
                    return Err(anyhow::anyhow!(
                        "Access denied: path '{}' is outside allowed directories",
                        path
                    ));
                }

                // Open the git repository
                use git2::Repository;
                let repo = Repository::open(&canonical_path).map_err(|e| {
                    anyhow::anyhow!(
                        "Failed to open git repository at '{}': {}",
                        canonical_path.display(),
                        e
                    )
                })?;

                // Get current branch name
                let branch = match repo.head() {
                    Ok(head) => {
                        if head.is_branch() {
                            head.shorthand().map(|s| s.to_string())
                        } else {
                            // Detached HEAD - show commit hash
                            head.target()
                                .map(|oid| format!("HEAD detached at {}", &oid.to_string()[..7]))
                        }
                    }
                    Err(_) => None,
                }
                .unwrap_or_else(|| "unknown".to_string());

                // Get repository status
                let statuses = repo
                    .statuses(None)
                    .map_err(|e| anyhow::anyhow!("Failed to get repository status: {}", e))?;

                let mut staged: Vec<String> = Vec::new();
                let mut modified: Vec<String> = Vec::new();
                let mut untracked: Vec<String> = Vec::new();

                for entry in statuses.iter() {
                    let path_str = entry.path().unwrap_or("unknown").to_string();
                    let status = entry.status();

                    // Check for staged changes (index changes)
                    if status.is_index_new()
                        || status.is_index_modified()
                        || status.is_index_deleted()
                        || status.is_index_renamed()
                        || status.is_index_typechange()
                    {
                        staged.push(path_str.clone());
                    }

                    // Check for working directory modifications (unstaged)
                    if status.is_wt_modified()
                        || status.is_wt_deleted()
                        || status.is_wt_renamed()
                        || status.is_wt_typechange()
                    {
                        modified.push(path_str.clone());
                    }

                    // Check for untracked files
                    if status.is_wt_new() {
                        untracked.push(path_str);
                    }
                }

                let clean = staged.is_empty() && modified.is_empty() && untracked.is_empty();

                tracing::info!(
                    "[Executor] git_status completed for '{}': branch={}, staged={}, modified={}, untracked={}, clean={}",
                    canonical_path.display(),
                    branch,
                    staged.len(),
                    modified.len(),
                    untracked.len(),
                    clean
                );

                Ok(json!({
                    "success": true,
                    "path": canonical_path.to_string_lossy(),
                    "branch": branch,
                    "staged": staged,
                    "modified": modified,
                    "untracked": untracked,
                    "clean": clean
                }))
            }
            "git_init" => {
                let path = parameters["path"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("Missing path parameter"))?;

                // For git_init, the directory might not exist yet, so we handle both cases
                let path_obj = std::path::Path::new(path);
                let canonical_path = if path_obj.exists() {
                    // Directory exists, canonicalize it
                    std::fs::canonicalize(path).map_err(|e| {
                        anyhow::anyhow!("Invalid or inaccessible path '{}': {}", path, e)
                    })?
                } else {
                    // Directory doesn't exist - validate parent directory
                    let parent = path_obj
                        .parent()
                        .ok_or_else(|| anyhow::anyhow!("Invalid path: no parent directory"))?;
                    if !parent.exists() {
                        return Err(anyhow::anyhow!(
                            "Parent directory does not exist: {}",
                            parent.display()
                        ));
                    }
                    let canonical_parent = std::fs::canonicalize(parent).map_err(|e| {
                        anyhow::anyhow!("Invalid parent directory '{}': {}", parent.display(), e)
                    })?;
                    canonical_parent.join(
                        path_obj
                            .file_name()
                            .ok_or_else(|| anyhow::anyhow!("Invalid directory name"))?,
                    )
                };

                // SECURITY: Validate the canonicalized path is within allowed directories
                let allowed_directories = self.get_allowed_directories();
                let path_allowed = if allowed_directories.is_empty() {
                    tracing::warn!(
                        "[Executor] No allowed_directories configured - git_init access unrestricted. \
                        Consider configuring allowed directories for security."
                    );
                    true
                } else {
                    allowed_directories
                        .iter()
                        .any(|allowed_dir| canonical_path.starts_with(allowed_dir))
                };

                if !path_allowed {
                    tracing::error!(
                        "[Executor] Path traversal attempt blocked for git_init: '{}' resolved to '{}' which is outside allowed directories",
                        path,
                        canonical_path.display()
                    );
                    return Err(anyhow::anyhow!(
                        "Access denied: path '{}' is outside allowed directories",
                        path
                    ));
                }

                // Create the directory if it doesn't exist
                if !canonical_path.exists() {
                    std::fs::create_dir_all(&canonical_path).map_err(|e| {
                        anyhow::anyhow!(
                            "Failed to create directory '{}': {}",
                            canonical_path.display(),
                            e
                        )
                    })?;
                }

                // Initialize the git repository
                use git2::Repository;
                let repo = Repository::init(&canonical_path).map_err(|e| {
                    anyhow::anyhow!(
                        "Failed to initialize git repository at '{}': {}",
                        canonical_path.display(),
                        e
                    )
                })?;

                // Get the path to the created .git directory
                let git_dir = repo.path().to_string_lossy().to_string();

                tracing::info!(
                    "[Executor] git_init completed: initialized repository at '{}'",
                    canonical_path.display()
                );

                Ok(json!({
                    "success": true,
                    "path": canonical_path.to_string_lossy(),
                    "git_dir": git_dir,
                    "message": format!("Initialized empty Git repository in {}", canonical_path.display())
                }))
            }
            "git_add" => {
                let path = parameters
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing 'path' parameter"))?;
                let files = parameters
                    .get("files")
                    .and_then(|v| v.as_array())
                    .ok_or_else(|| anyhow!("Missing 'files' parameter"))?;

                // SECURITY: Canonicalize the repository path to prevent path traversal attacks
                let canonical_path = std::fs::canonicalize(path).map_err(|e| {
                    anyhow!("Invalid or inaccessible repository path '{}': {}", path, e)
                })?;

                // SECURITY: Validate the canonicalized path is within allowed directories
                let allowed_directories = self.get_allowed_directories();
                let path_allowed = if allowed_directories.is_empty() {
                    tracing::warn!(
                        "[Executor] No allowed_directories configured - git operations unrestricted. \
                        Consider configuring allowed directories for security."
                    );
                    true
                } else {
                    allowed_directories
                        .iter()
                        .any(|allowed_dir| canonical_path.starts_with(allowed_dir))
                };

                if !path_allowed {
                    tracing::error!(
                        "[Executor] Path traversal attempt blocked for git_add: '{}' resolved to '{}' which is outside allowed directories",
                        path,
                        canonical_path.display()
                    );
                    return Err(anyhow!(
                        "Access denied: repository path '{}' is outside allowed directories",
                        path
                    ));
                }

                use git2::Repository;

                let repo = Repository::open(&canonical_path).map_err(|e| {
                    anyhow!(
                        "Failed to open git repository at '{}': {}",
                        canonical_path.display(),
                        e
                    )
                })?;

                let mut index = repo
                    .index()
                    .map_err(|e| anyhow!("Failed to get repository index: {}", e))?;

                // Collect file paths to add
                let file_paths: Vec<String> = files
                    .iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect();

                if file_paths.is_empty() {
                    return Err(anyhow!("No valid file paths provided in 'files' array"));
                }

                let mut files_added: Vec<String> = Vec::new();

                // Check if adding all files (e.g., ["."] or ["*"])
                let add_all =
                    file_paths.len() == 1 && (file_paths[0] == "." || file_paths[0] == "*");

                if add_all {
                    // Add all files using glob pattern
                    index
                        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
                        .map_err(|e| anyhow!("Failed to add all files to index: {}", e))?;

                    // Get list of files that were staged
                    for entry in index.iter() {
                        if let Ok(path_str) = std::str::from_utf8(&entry.path) {
                            files_added.push(path_str.to_string());
                        }
                    }

                    tracing::info!(
                        "[Executor] git_add: Added all files ({} total) to staging area in '{}'",
                        files_added.len(),
                        canonical_path.display()
                    );
                } else {
                    // Add specific files
                    for file_path in &file_paths {
                        // SECURITY: Ensure the file path doesn't escape the repository
                        let full_path = canonical_path.join(file_path);
                        let canonical_file_path = match std::fs::canonicalize(&full_path) {
                            Ok(p) => p,
                            Err(_) => {
                                // File might not exist yet (new file), check parent
                                let parent = full_path.parent();
                                if let Some(p) = parent {
                                    if let Ok(canonical_parent) = std::fs::canonicalize(p) {
                                        if !canonical_parent.starts_with(&canonical_path) {
                                            tracing::error!(
                                                "[Executor] git_add: File path '{}' escapes repository",
                                                file_path
                                            );
                                            return Err(anyhow!(
                                                "File path '{}' is outside the repository",
                                                file_path
                                            ));
                                        }
                                    }
                                }
                                full_path.clone()
                            }
                        };

                        // Ensure file is within repository
                        if canonical_file_path != full_path
                            && !canonical_file_path.starts_with(&canonical_path)
                        {
                            tracing::error!(
                                "[Executor] git_add: File path '{}' escapes repository",
                                file_path
                            );
                            return Err(anyhow!(
                                "File path '{}' is outside the repository",
                                file_path
                            ));
                        }

                        // Add the file to the index
                        index
                            .add_path(std::path::Path::new(file_path))
                            .map_err(|e| {
                                anyhow!("Failed to add '{}' to index: {}", file_path, e)
                            })?;

                        files_added.push(file_path.clone());
                    }

                    tracing::info!(
                        "[Executor] git_add: Added {} files to staging area in '{}'",
                        files_added.len(),
                        canonical_path.display()
                    );
                }

                // Write the index to disk
                index
                    .write()
                    .map_err(|e| anyhow!("Failed to write index: {}", e))?;

                Ok(json!({
                    "success": true,
                    "repository_path": canonical_path.to_string_lossy(),
                    "files_added": files_added,
                    "files_count": files_added.len()
                }))
            }
            "git_commit" => {
                let path = parameters
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing 'path' parameter"))?;
                let message = parameters
                    .get("message")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing 'message' parameter"))?;

                // SECURITY: Canonicalize the repository path to prevent path traversal attacks
                let canonical_path = std::fs::canonicalize(path).map_err(|e| {
                    anyhow!("Invalid or inaccessible repository path '{}': {}", path, e)
                })?;

                // SECURITY: Validate the canonicalized path is within allowed directories
                let allowed_directories = self.get_allowed_directories();
                let path_allowed = if allowed_directories.is_empty() {
                    tracing::warn!(
                        "[Executor] No allowed_directories configured - git operations unrestricted. \
                        Consider configuring allowed directories for security."
                    );
                    true
                } else {
                    allowed_directories
                        .iter()
                        .any(|allowed_dir| canonical_path.starts_with(allowed_dir))
                };

                if !path_allowed {
                    tracing::error!(
                        "[Executor] Path traversal attempt blocked for git_commit: '{}' resolved to '{}' which is outside allowed directories",
                        path,
                        canonical_path.display()
                    );
                    return Err(anyhow!(
                        "Access denied: repository path '{}' is outside allowed directories",
                        path
                    ));
                }

                // Perform all git operations in a synchronous closure to avoid Send issues
                // git2 types are not Send, so we extract simple Send-able results
                // Returns Option<(commit_hash, author_string)> - None means no changes to commit
                let git_result: Result<Option<(String, String)>, anyhow::Error> = (|| {
                    use git2::Repository;

                    let repo = Repository::open(&canonical_path).map_err(|e| {
                        anyhow!(
                            "Failed to open git repository at '{}': {}",
                            canonical_path.display(),
                            e
                        )
                    })?;

                    // Get the index
                    let mut index = repo
                        .index()
                        .map_err(|e| anyhow!("Failed to get repository index: {}", e))?;

                    // Check if there are staged changes
                    let tree_id = index
                        .write_tree()
                        .map_err(|e| anyhow!("Failed to write tree from index: {}", e))?;

                    let tree = repo
                        .find_tree(tree_id)
                        .map_err(|e| anyhow!("Failed to find tree: {}", e))?;

                    // Get the signature (author/committer)
                    let signature = repo
                        .signature()
                        .or_else(|_| {
                            // Fallback to a default signature if git config is not set
                            git2::Signature::now("AGI Workforce", "agi@agiworkforce.com")
                        })
                        .map_err(|e| anyhow!("Failed to create signature: {}", e))?;

                    // Get the parent commit (HEAD), if it exists
                    let parent_commit = match repo.head() {
                        Ok(head) => {
                            let oid = head
                                .target()
                                .ok_or_else(|| anyhow!("HEAD reference has no target"))?;
                            Some(
                                repo.find_commit(oid)
                                    .map_err(|e| anyhow!("Failed to find HEAD commit: {}", e))?,
                            )
                        }
                        Err(e) => {
                            // No HEAD means this is the first commit
                            if e.code() == git2::ErrorCode::UnbornBranch
                                || e.code() == git2::ErrorCode::NotFound
                            {
                                None
                            } else {
                                return Err(anyhow!("Failed to get HEAD: {}", e));
                            }
                        }
                    };

                    // Check if there are actual changes to commit
                    if let Some(ref parent) = parent_commit {
                        let parent_tree = parent
                            .tree()
                            .map_err(|e| anyhow!("Failed to get parent tree: {}", e))?;

                        let diff = repo
                            .diff_tree_to_tree(Some(&parent_tree), Some(&tree), None)
                            .map_err(|e| anyhow!("Failed to compute diff: {}", e))?;

                        if diff.deltas().count() == 0 {
                            tracing::info!(
                                "[Executor] git_commit: No changes to commit in '{}'",
                                canonical_path.display()
                            );
                            // Return None to signal no changes
                            return Ok(None);
                        }
                    }

                    // Create the commit
                    let parents: Vec<&git2::Commit> = parent_commit.iter().collect();
                    let commit_oid = repo
                        .commit(
                            Some("HEAD"),
                            &signature,
                            &signature,
                            message,
                            &tree,
                            &parents,
                        )
                        .map_err(|e| anyhow!("Failed to create commit: {}", e))?;

                    let commit_hash = commit_oid.to_string();

                    // Extract author string before signature goes out of scope
                    let author_string = format!(
                        "{} <{}>",
                        signature.name().unwrap_or("Unknown"),
                        signature.email().unwrap_or("unknown@example.com")
                    );

                    Ok(Some((commit_hash, author_string)))
                })(
                );

                // Handle the result outside the git2 scope
                let Some((commit_hash, author_string)) = git_result? else {
                    // No changes to commit
                    return Ok(json!({
                        "success": false,
                        "repository_path": canonical_path.to_string_lossy(),
                        "message": "Nothing to commit - no changes staged",
                        "commit_hash": null
                    }));
                };

                tracing::info!(
                    "[Executor] git_commit: Created commit {} with message '{}' in '{}'",
                    &commit_hash[..8],
                    message,
                    canonical_path.display()
                );

                // Track git commit for audit trail (note: commits are not auto-revertible)
                if let Some(ref tracker) = self.change_tracker {
                    tracker
                        .record_git_commit(
                            PathBuf::from(&canonical_path),
                            commit_hash.clone(),
                            message.to_string(),
                            session_id.clone(),
                        )
                        .await;
                    tracing::debug!(
                        "[Executor] Tracked git commit {} for audit: {}",
                        &commit_hash[..8],
                        canonical_path.display()
                    );
                }

                Ok(json!({
                    "success": true,
                    "repository_path": canonical_path.to_string_lossy(),
                    "commit_hash": commit_hash,
                    "commit_hash_short": &commit_hash[..8.min(commit_hash.len())],
                    "message": message,
                    "author": author_string
                }))
            }
            "git_push" => {
                let path = parameters
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing 'path' parameter"))?;
                let remote = parameters
                    .get("remote")
                    .and_then(|v| v.as_str())
                    .unwrap_or("origin");
                let branch = parameters.get("branch").and_then(|v| v.as_str());

                // SECURITY: Validate the repository path is within allowed directories
                let canonical_path = std::fs::canonicalize(path).map_err(|e| {
                    anyhow!("Invalid or inaccessible repository path '{}': {}", path, e)
                })?;

                let allowed_directories = self.get_allowed_directories();
                let path_allowed = if allowed_directories.is_empty() {
                    tracing::warn!(
                        "[Executor] No allowed_directories configured - git push unrestricted. \
                        Consider configuring allowed directories for security."
                    );
                    true
                } else {
                    allowed_directories
                        .iter()
                        .any(|allowed_dir| canonical_path.starts_with(allowed_dir))
                };

                if !path_allowed {
                    tracing::error!(
                        "[Executor] Path traversal attempt blocked: '{}' resolved to '{}' which is outside allowed directories",
                        path,
                        canonical_path.display()
                    );
                    return Err(anyhow!(
                        "Access denied: repository path '{}' is outside allowed directories",
                        path
                    ));
                }

                // Open the existing repository
                let repo = git2::Repository::open(&canonical_path)
                    .map_err(|e| anyhow!("Failed to open git repository at '{}': {}", path, e))?;

                // Get the branch to push (current branch if not specified)
                let branch_name = if let Some(b) = branch {
                    b.to_string()
                } else {
                    let head = repo
                        .head()
                        .map_err(|e| anyhow!("Failed to get HEAD reference: {}", e))?;
                    if !head.is_branch() {
                        return Err(anyhow!(
                            "HEAD is detached. Please specify a branch to push."
                        ));
                    }
                    head.shorthand()
                        .ok_or_else(|| anyhow!("Failed to get current branch name"))?
                        .to_string()
                };

                // Get the remote
                let mut remote_obj = repo
                    .find_remote(remote)
                    .map_err(|e| anyhow!("Failed to find remote '{}': {}", remote, e))?;

                // Set up callbacks for authentication
                let mut callbacks = git2::RemoteCallbacks::new();

                // Credential callback - tries SSH agent first, then username from URL
                callbacks.credentials(|url, username_from_url, allowed_types| {
                    // Try SSH agent authentication first
                    if allowed_types.contains(git2::CredentialType::SSH_KEY) {
                        if let Some(username) = username_from_url {
                            // Try to use SSH agent
                            if let Ok(cred) = git2::Cred::ssh_key_from_agent(username) {
                                return Ok(cred);
                            }

                            // Try default SSH key locations
                            if let Some(home) = dirs::home_dir() {
                                let id_rsa = home.join(".ssh").join("id_rsa");
                                let id_ed25519 = home.join(".ssh").join("id_ed25519");

                                // Try ed25519 first (more modern)
                                if id_ed25519.exists() {
                                    if let Ok(cred) = git2::Cred::ssh_key(
                                        username,
                                        None,
                                        &id_ed25519,
                                        None,
                                    ) {
                                        return Ok(cred);
                                    }
                                }

                                // Fall back to RSA
                                if id_rsa.exists() {
                                    if let Ok(cred) =
                                        git2::Cred::ssh_key(username, None, &id_rsa, None)
                                    {
                                        return Ok(cred);
                                    }
                                }
                            }
                        }
                    }

                    // Try default credentials (git credential helper)
                    if allowed_types.contains(git2::CredentialType::USER_PASS_PLAINTEXT) {
                        if let Ok(cred) = git2::Cred::default() {
                            return Ok(cred);
                        }
                    }

                    // Try credential helper via git config
                    if allowed_types.contains(git2::CredentialType::USER_PASS_PLAINTEXT) {
                        return git2::Cred::credential_helper(
                            &git2::Config::open_default()
                                .unwrap_or_else(|_| git2::Config::new().unwrap()),
                            url,
                            username_from_url,
                        );
                    }

                    Err(git2::Error::from_str(
                        "No valid credentials found. Ensure SSH agent is running or git credentials are configured.",
                    ))
                });

                // Progress callback for UI feedback
                let tool_id_for_push_progress = tool_id_for_stream.clone();
                let app_handle_for_push_progress = self.app_handle.clone();
                callbacks.push_transfer_progress(move |current, total, _bytes| {
                    if let Some(ref app) = app_handle_for_push_progress {
                        let progress = if total > 0 {
                            current as f32 / total as f32
                        } else {
                            0.0
                        };
                        emit_tool_progress(
                            app,
                            &tool_id_for_push_progress,
                            progress,
                            Some(&format!("Pushing objects: {}/{}", current, total)),
                        );
                    }
                });

                // Create push options with callbacks
                let mut push_options = git2::PushOptions::new();
                push_options.remote_callbacks(callbacks);

                // Build the refspec for pushing
                let refspec = format!("refs/heads/{}:refs/heads/{}", branch_name, branch_name);

                // Perform the push
                remote_obj
                    .push(&[&refspec], Some(&mut push_options))
                    .map_err(|e| {
                        anyhow!(
                            "Failed to push branch '{}' to remote '{}': {}",
                            branch_name,
                            remote,
                            e
                        )
                    })?;

                tracing::info!(
                    "[Executor] Git push successful: branch={} remote={} path={}",
                    branch_name,
                    remote,
                    canonical_path.display()
                );

                Ok(json!({
                    "success": true,
                    "branch": branch_name,
                    "remote": remote,
                    "path": canonical_path.to_string_lossy()
                }))
            }
            "git_clone" => {
                let url = parameters
                    .get("url")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing 'url' parameter"))?;
                let destination = parameters
                    .get("destination")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing 'destination' parameter"))?;

                // Validate the URL format - accept both HTTPS and SSH URLs
                let is_valid_url =
                    if url.starts_with("git@") || (url.contains(':') && !url.contains("://")) {
                        // SSH URL format (git@github.com:user/repo.git)
                        true
                    } else {
                        // Try parsing as standard URL
                        url::Url::parse(url).is_ok()
                    };

                if !is_valid_url {
                    return Err(anyhow!("Invalid repository URL format: {}", url));
                }

                // Validate destination path
                let dest_path = std::path::Path::new(destination);

                // If destination exists, it must be empty
                if dest_path.exists() {
                    let is_empty = dest_path
                        .read_dir()
                        .map(|mut d| d.next().is_none())
                        .unwrap_or(false);
                    if !is_empty {
                        return Err(anyhow!(
                            "Destination directory '{}' already exists and is not empty",
                            destination
                        ));
                    }
                }

                // Validate parent directory exists and is allowed
                let parent = dest_path
                    .parent()
                    .ok_or_else(|| anyhow!("Invalid destination path: no parent directory"))?;

                if !parent.exists() {
                    return Err(anyhow!(
                        "Parent directory does not exist: {}",
                        parent.display()
                    ));
                }

                let canonical_parent = std::fs::canonicalize(parent).map_err(|e| {
                    anyhow!("Invalid parent directory '{}': {}", parent.display(), e)
                })?;

                // SECURITY: Validate destination is within allowed directories
                let allowed_directories = self.get_allowed_directories();
                let path_allowed = if allowed_directories.is_empty() {
                    tracing::warn!(
                        "[Executor] No allowed_directories configured - git clone unrestricted. \
                        Consider configuring allowed directories for security."
                    );
                    true
                } else {
                    allowed_directories
                        .iter()
                        .any(|allowed_dir| canonical_parent.starts_with(allowed_dir))
                };

                if !path_allowed {
                    tracing::error!(
                        "[Executor] Path traversal attempt blocked: destination parent '{}' is outside allowed directories",
                        canonical_parent.display()
                    );
                    return Err(anyhow!(
                        "Access denied: destination '{}' is outside allowed directories",
                        destination
                    ));
                }

                // Compute final destination path
                let final_dest = canonical_parent.join(
                    dest_path
                        .file_name()
                        .ok_or_else(|| anyhow!("Invalid destination path"))?,
                );

                // Set up fetch options with callbacks for authentication
                let mut callbacks = git2::RemoteCallbacks::new();

                // Credential callback - same as git_push
                callbacks.credentials(|url, username_from_url, allowed_types| {
                    // Try SSH agent authentication first
                    if allowed_types.contains(git2::CredentialType::SSH_KEY) {
                        if let Some(username) = username_from_url {
                            // Try to use SSH agent
                            if let Ok(cred) = git2::Cred::ssh_key_from_agent(username) {
                                return Ok(cred);
                            }

                            // Try default SSH key locations
                            if let Some(home) = dirs::home_dir() {
                                let id_rsa = home.join(".ssh").join("id_rsa");
                                let id_ed25519 = home.join(".ssh").join("id_ed25519");

                                // Try ed25519 first (more modern)
                                if id_ed25519.exists() {
                                    if let Ok(cred) = git2::Cred::ssh_key(
                                        username,
                                        None,
                                        &id_ed25519,
                                        None,
                                    ) {
                                        return Ok(cred);
                                    }
                                }

                                // Fall back to RSA
                                if id_rsa.exists() {
                                    if let Ok(cred) =
                                        git2::Cred::ssh_key(username, None, &id_rsa, None)
                                    {
                                        return Ok(cred);
                                    }
                                }
                            }
                        }
                    }

                    // Try default credentials (git credential helper)
                    if allowed_types.contains(git2::CredentialType::USER_PASS_PLAINTEXT) {
                        if let Ok(cred) = git2::Cred::default() {
                            return Ok(cred);
                        }
                    }

                    // Try credential helper via git config
                    if allowed_types.contains(git2::CredentialType::USER_PASS_PLAINTEXT) {
                        return git2::Cred::credential_helper(
                            &git2::Config::open_default()
                                .unwrap_or_else(|_| git2::Config::new().unwrap()),
                            url,
                            username_from_url,
                        );
                    }

                    Err(git2::Error::from_str(
                        "No valid credentials found. Ensure SSH agent is running or git credentials are configured.",
                    ))
                });

                // Progress callback for fetch/clone progress
                let tool_id_for_clone_progress = tool_id_for_stream.clone();
                let app_handle_for_clone_progress = self.app_handle.clone();
                callbacks.transfer_progress(move |stats| {
                    if let Some(ref app) = app_handle_for_clone_progress {
                        let received = stats.received_objects();
                        let total = stats.total_objects();
                        let progress = if total > 0 {
                            received as f32 / total as f32
                        } else {
                            0.0
                        };
                        emit_tool_progress(
                            app,
                            &tool_id_for_clone_progress,
                            progress,
                            Some(&format!(
                                "Cloning: {}/{} objects ({} bytes)",
                                received,
                                total,
                                stats.received_bytes()
                            )),
                        );
                    }
                    true
                });

                // Build fetch options
                let mut fetch_options = git2::FetchOptions::new();
                fetch_options.remote_callbacks(callbacks);

                // Build clone options
                let mut builder = git2::build::RepoBuilder::new();
                builder.fetch_options(fetch_options);

                // Perform the clone
                let repo = builder.clone(url, &final_dest).map_err(|e| {
                    anyhow!(
                        "Failed to clone repository '{}' to '{}': {}",
                        url,
                        final_dest.display(),
                        e
                    )
                })?;

                // Get the default branch name
                let head = repo.head().ok();
                let branch_name = head
                    .as_ref()
                    .and_then(|h| h.shorthand())
                    .unwrap_or("unknown");

                tracing::info!(
                    "[Executor] Git clone successful: url={} destination={} branch={}",
                    url,
                    final_dest.display(),
                    branch_name
                );

                Ok(json!({
                    "success": true,
                    "url": url,
                    "path": final_dest.to_string_lossy(),
                    "branch": branch_name
                }))
            }
            "search_web" => {
                let query = parameters
                    .get("query")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing 'query' parameter"))?;

                // Validate query
                let query_trimmed = query.trim();
                if query_trimmed.is_empty() {
                    return Err(anyhow!("Search query cannot be empty"));
                }

                if query_trimmed.len() > 500 {
                    return Err(anyhow!(
                        "Search query too long (max 500 characters, got {})",
                        query_trimmed.len()
                    ));
                }

                // Get optional parameters with defaults
                let num_results = parameters
                    .get("num_results")
                    .and_then(|v| v.as_i64())
                    .map(|n| n.clamp(1, 20) as usize)
                    .unwrap_or(10);

                let search_type = parameters
                    .get("search_type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("web");

                // Validate search type
                if !["web", "news", "images"].contains(&search_type) {
                    return Err(anyhow!(
                        "Invalid search_type '{}'. Must be 'web', 'news', or 'images'",
                        search_type
                    ));
                }

                tracing::info!(
                    "[Executor] search_web: query='{}' type={} num_results={}",
                    &query_trimmed[..query_trimmed.len().min(50)],
                    search_type,
                    num_results
                );

                // Use DuckDuckGo Instant Answer API (free, no API key required)
                // Note: DuckDuckGo's API is primarily for instant answers, not full search results.
                // For comprehensive web search, consider integrating with a paid search API.
                let encoded_query = urlencoding::encode(query_trimmed);
                let url = format!(
                    "https://api.duckduckgo.com/?q={}&format=json&no_html=1&skip_disambig=1",
                    encoded_query
                );

                let client = reqwest::Client::new();
                let response = client
                    .get(&url)
                    .header("User-Agent", "AGI Workforce Desktop/1.0")
                    .timeout(std::time::Duration::from_secs(15))
                    .send()
                    .await
                    .map_err(|e| anyhow!("Search request failed: {}", e))?;

                if !response.status().is_success() {
                    return Err(anyhow!(
                        "Search request returned error status: {}",
                        response.status()
                    ));
                }

                let data: serde_json::Value = response
                    .json()
                    .await
                    .map_err(|e| anyhow!("Failed to parse search results: {}", e))?;

                // Extract and format results from DuckDuckGo response
                let abstract_text = data["Abstract"].as_str().unwrap_or("");
                let abstract_source = data["AbstractSource"].as_str().unwrap_or("");
                let abstract_url = data["AbstractURL"].as_str().unwrap_or("");
                let heading = data["Heading"].as_str().unwrap_or("");
                let answer = data["Answer"].as_str().unwrap_or("");
                let answer_type = data["AnswerType"].as_str().unwrap_or("");

                // Extract related topics as search-like results
                let mut results: Vec<serde_json::Value> = Vec::new();

                // Add the main abstract as a result if available
                if !abstract_text.is_empty() {
                    results.push(json!({
                        "title": heading,
                        "url": abstract_url,
                        "snippet": abstract_text,
                        "source": abstract_source,
                        "type": "instant_answer"
                    }));
                }

                // Add direct answer if available
                if !answer.is_empty() {
                    results.push(json!({
                        "title": format!("Direct Answer ({})", answer_type),
                        "url": "",
                        "snippet": answer,
                        "source": "DuckDuckGo",
                        "type": "direct_answer"
                    }));
                }

                // Extract related topics
                if let Some(related_topics) = data["RelatedTopics"].as_array() {
                    for topic in related_topics
                        .iter()
                        .take(num_results.saturating_sub(results.len()))
                    {
                        if let Some(topic_obj) = topic.as_object() {
                            // Regular topic
                            if let Some(text) = topic_obj.get("Text").and_then(|v| v.as_str()) {
                                let first_url = topic_obj
                                    .get("FirstURL")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("");
                                results.push(json!({
                                    "title": text.split(" - ").next().unwrap_or(text),
                                    "url": first_url,
                                    "snippet": text,
                                    "source": "DuckDuckGo",
                                    "type": "related_topic"
                                }));
                            }
                            // Nested topics (categories)
                            if let Some(topics) = topic_obj.get("Topics").and_then(|v| v.as_array())
                            {
                                for nested_topic in topics.iter().take(3) {
                                    if let Some(text) =
                                        nested_topic.get("Text").and_then(|v| v.as_str())
                                    {
                                        let first_url = nested_topic
                                            .get("FirstURL")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("");
                                        results.push(json!({
                                            "title": text.split(" - ").next().unwrap_or(text),
                                            "url": first_url,
                                            "snippet": text,
                                            "source": "DuckDuckGo",
                                            "type": "related_topic"
                                        }));
                                    }
                                }
                            }
                        }
                    }
                }

                // Extract results from Results array if available
                if let Some(ddg_results) = data["Results"].as_array() {
                    for result in ddg_results
                        .iter()
                        .take(num_results.saturating_sub(results.len()))
                    {
                        if let Some(result_obj) = result.as_object() {
                            let text = result_obj
                                .get("Text")
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            let first_url = result_obj
                                .get("FirstURL")
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            results.push(json!({
                                "title": text.split(" - ").next().unwrap_or(text),
                                "url": first_url,
                                "snippet": text,
                                "source": "DuckDuckGo",
                                "type": "result"
                            }));
                        }
                    }
                }

                // Truncate to requested number of results
                results.truncate(num_results);

                let has_results =
                    !results.is_empty() || !abstract_text.is_empty() || !answer.is_empty();

                tracing::info!(
                    "[Executor] search_web completed: query='{}' results_count={} has_instant_answer={}",
                    &query_trimmed[..query_trimmed.len().min(30)],
                    results.len(),
                    !abstract_text.is_empty()
                );

                Ok(json!({
                    "success": true,
                    "query": query_trimmed,
                    "search_type": search_type,
                    "results_count": results.len(),
                    "results": results,
                    "instant_answer": {
                        "text": abstract_text,
                        "source": abstract_source,
                        "url": abstract_url,
                        "heading": heading
                    },
                    "direct_answer": if !answer.is_empty() { Some(&answer) } else { None },
                    "has_results": has_results,
                    "note": if results.is_empty() && abstract_text.is_empty() {
                        "DuckDuckGo Instant Answer API returned no results. For comprehensive web search, the AGI can use browser_navigate to search directly on search engines."
                    } else {
                        ""
                    }
                }))
            }
            "terminal_execute" => {
                // ============================================================
                // TERMINAL EXECUTE TOOL
                // Executes shell commands with comprehensive security controls
                // ============================================================

                // Security blocklist: patterns that are NEVER allowed
                // These represent destructive, dangerous, or potentially malicious commands
                const BLOCKED_PATTERNS: &[&str] = &[
                    // Destructive file system operations
                    "rm -rf /",
                    "rm -rf /*",
                    "rm -rf ~",
                    "sudo rm -rf",
                    // Disk destruction
                    "dd if=/dev/zero of=/dev/",
                    "dd if=/dev/random of=/dev/",
                    "mkfs.",
                    "format c:",
                    // Fork bomb
                    ":(){ :|:& };:",
                    ":(){:|:&};:",
                    // Remote code execution via pipe
                    "curl | bash",
                    "wget | bash",
                    "curl|bash",
                    "wget|bash",
                    "curl | sh",
                    "wget | sh",
                    "curl|sh",
                    "wget|sh",
                    "| sh",
                    "| bash",
                    "| zsh",
                    "|sh",
                    "|bash",
                    "|zsh",
                    "base64 -d | sh",
                    "base64 -d | bash",
                    "base64 -d|sh",
                    "base64 -d|bash",
                    // System control
                    "shutdown",
                    "reboot",
                    "halt",
                    "poweroff",
                    "init 0",
                    "init 6",
                    // Destructive redirects to system files/devices
                    "> /dev/sda",
                    "> /dev/hda",
                    "> /dev/nvme",
                    ">/dev/sda",
                    ">/dev/hda",
                    ">/dev/nvme",
                    "> /etc/passwd",
                    "> /etc/shadow",
                    ">/etc/passwd",
                    ">/etc/shadow",
                    // Dangerous permission changes
                    "chmod 777 /",
                    "chmod -R 777 /",
                    "chmod 777 /*",
                    "chown -R root /",
                    // Kernel manipulation
                    "insmod",
                    "rmmod",
                    "modprobe -r",
                    // Network security bypass
                    "iptables -F",
                    "iptables --flush",
                    // History manipulation (potential evasion)
                    "history -c",
                    "export HISTSIZE=0",
                    // Windows-specific destructive commands
                    "del /f /s /q c:\\",
                    "rd /s /q c:\\",
                    "format c: /y",
                ];

                // Additional blocked command prefixes for extra safety
                const BLOCKED_PREFIXES: &[&str] = &["sudo dd ", "sudo mkfs", "sudo rm -rf /"];

                let command = parameters["command"]
                    .as_str()
                    .ok_or_else(|| anyhow!("Missing required 'command' parameter"))?;

                // Validate command is not empty or whitespace-only
                if command.trim().is_empty() {
                    return Err(anyhow!("Command cannot be empty"));
                }

                // SECURITY: Check blocklist patterns (case-insensitive)
                let cmd_lower = command.to_lowercase();
                let cmd_normalized = cmd_lower.replace(['\t', '\n', '\r'], " ");

                for pattern in BLOCKED_PATTERNS {
                    if cmd_normalized.contains(&pattern.to_lowercase()) {
                        tracing::error!(
                            "[Executor] SECURITY: Blocked dangerous command pattern '{}' in command: {}",
                            pattern,
                            command
                        );
                        return Err(anyhow!(
                            "Command blocked for security: contains dangerous pattern"
                        ));
                    }
                }

                // Check blocked prefixes
                for prefix in BLOCKED_PREFIXES {
                    if cmd_normalized.starts_with(&prefix.to_lowercase()) {
                        tracing::error!(
                            "[Executor] SECURITY: Blocked dangerous command prefix '{}' in command: {}",
                            prefix,
                            command
                        );
                        return Err(anyhow!(
                            "Command blocked for security: starts with dangerous pattern"
                        ));
                    }
                }

                // Get optional working directory
                let cwd = parameters
                    .get("cwd")
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
                    .map(std::path::PathBuf::from);

                // SECURITY: Validate working directory if provided
                if let Some(ref dir) = cwd {
                    // Canonicalize the path to resolve symlinks and prevent path traversal
                    let canonical_dir = std::fs::canonicalize(dir).map_err(|e| {
                        anyhow!(
                            "Invalid or inaccessible working directory '{}': {}",
                            dir.display(),
                            e
                        )
                    })?;

                    // Verify it's actually a directory
                    if !canonical_dir.is_dir() {
                        return Err(anyhow!(
                            "Working directory '{}' is not a valid directory",
                            dir.display()
                        ));
                    }

                    // Validate path is within allowed directories
                    let allowed_directories = self.get_allowed_directories();
                    let path_allowed = if allowed_directories.is_empty() {
                        tracing::warn!(
                            "[Executor] No allowed_directories configured - terminal cwd unrestricted"
                        );
                        true
                    } else {
                        allowed_directories
                            .iter()
                            .any(|allowed_dir| canonical_dir.starts_with(allowed_dir))
                    };

                    if !path_allowed {
                        tracing::error!(
                            "[Executor] SECURITY: Working directory '{}' resolved to '{}' which is outside allowed directories",
                            dir.display(),
                            canonical_dir.display()
                        );
                        return Err(anyhow!(
                            "Access denied: working directory '{}' is outside allowed directories",
                            dir.display()
                        ));
                    }
                }

                // Get optional shell type (default based on platform)
                let shell = parameters
                    .get("shell")
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty());

                // Get timeout (default 60s, max 300s for safety)
                // Note: tools.rs defines timeout_ms in milliseconds
                let timeout_ms = parameters
                    .get("timeout_ms")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(60_000)
                    .min(300_000); // Cap at 5 minutes

                let timeout_duration = std::time::Duration::from_millis(timeout_ms);

                // Determine shell and arguments based on platform and user preference
                let (shell_cmd, shell_arg) = if cfg!(windows) {
                    match shell {
                        Some("cmd") => ("cmd", "/C"),
                        Some("bash") => ("bash", "-c"),
                        Some("powershell") | None => ("powershell", "-Command"),
                        Some(other) => {
                            tracing::warn!(
                                "[Executor] Unknown shell '{}', defaulting to powershell",
                                other
                            );
                            ("powershell", "-Command")
                        }
                    }
                } else {
                    // Unix-like systems (macOS, Linux)
                    match shell {
                        Some("zsh") => ("zsh", "-c"),
                        Some("sh") => ("sh", "-c"),
                        Some("bash") | None => ("bash", "-c"),
                        Some(other) => {
                            tracing::warn!(
                                "[Executor] Unknown shell '{}', defaulting to bash",
                                other
                            );
                            ("bash", "-c")
                        }
                    }
                };

                tracing::info!(
                    "[Executor] Executing terminal command: shell={} timeout_ms={} cwd={:?}",
                    shell_cmd,
                    timeout_ms,
                    cwd
                );

                // Build the command
                use tokio::process::Command;

                let mut cmd = Command::new(shell_cmd);
                cmd.arg(shell_arg).arg(command);

                // Set working directory if provided
                if let Some(ref dir) = cwd {
                    let canonical_dir = std::fs::canonicalize(dir)?;
                    cmd.current_dir(canonical_dir);
                }

                // Capture stdout and stderr
                cmd.stdout(std::process::Stdio::piped());
                cmd.stderr(std::process::Stdio::piped());

                // Prevent the command from inheriting stdin (security measure)
                cmd.stdin(std::process::Stdio::null());

                // Execute with timeout
                let output = tokio::time::timeout(timeout_duration, cmd.output()).await;

                // Process output limits
                const MAX_STDOUT_BYTES: usize = 10 * 1024 * 1024; // 10MB
                const MAX_STDERR_BYTES: usize = 1024 * 1024; // 1MB

                match output {
                    Ok(Ok(result)) => {
                        // Process stdout with size limit
                        let stdout_raw = result.stdout;
                        let stdout_truncated = stdout_raw.len() > MAX_STDOUT_BYTES;
                        let stdout_bytes = if stdout_truncated {
                            &stdout_raw[..MAX_STDOUT_BYTES]
                        } else {
                            &stdout_raw[..]
                        };
                        let mut stdout = String::from_utf8_lossy(stdout_bytes).to_string();
                        if stdout_truncated {
                            stdout.push_str("\n... [stdout truncated at 10MB]");
                        }

                        // Process stderr with size limit
                        let stderr_raw = result.stderr;
                        let stderr_truncated = stderr_raw.len() > MAX_STDERR_BYTES;
                        let stderr_bytes = if stderr_truncated {
                            &stderr_raw[..MAX_STDERR_BYTES]
                        } else {
                            &stderr_raw[..]
                        };
                        let mut stderr = String::from_utf8_lossy(stderr_bytes).to_string();
                        if stderr_truncated {
                            stderr.push_str("\n... [stderr truncated at 1MB]");
                        }

                        let exit_code = result.status.code();
                        let success = result.status.success();

                        tracing::info!(
                            "[Executor] Terminal command completed: exit_code={:?} success={} stdout_len={} stderr_len={}",
                            exit_code,
                            success,
                            stdout.len(),
                            stderr.len()
                        );

                        // Emit terminal execution event for UI
                        if let Some(ref app_handle) = self.app_handle {
                            use crate::ui::events::frontend_events::{
                                emit_terminal_command, TerminalCommand,
                            };
                            emit_terminal_command(
                                app_handle,
                                TerminalCommand {
                                    id: uuid::Uuid::new_v4().to_string(),
                                    command: command.to_string(),
                                    cwd: cwd
                                        .as_ref()
                                        .map(|p| p.to_string_lossy().to_string())
                                        .unwrap_or_else(|| ".".to_string()),
                                    exit_code,
                                    stdout: Some(stdout.clone()),
                                    stderr: Some(stderr.clone()),
                                    duration: Some(timeout_ms),
                                    session_id: Some(session_id.clone()),
                                    agent_id: None,
                                },
                            );
                        }

                        Ok(json!({
                            "success": success,
                            "exit_code": exit_code,
                            "stdout": stdout,
                            "stderr": stderr,
                            "timed_out": false,
                            "shell": shell_cmd,
                            "cwd": cwd.as_ref().map(|p| p.to_string_lossy().to_string())
                        }))
                    }
                    Ok(Err(e)) => {
                        // Command failed to execute (e.g., shell not found)
                        tracing::error!("[Executor] Terminal command failed to execute: {}", e);

                        // Emit error event for UI
                        if let Some(ref app_handle) = self.app_handle {
                            use crate::ui::events::frontend_events::{
                                emit_terminal_command, TerminalCommand,
                            };
                            emit_terminal_command(
                                app_handle,
                                TerminalCommand {
                                    id: uuid::Uuid::new_v4().to_string(),
                                    command: command.to_string(),
                                    cwd: cwd
                                        .as_ref()
                                        .map(|p| p.to_string_lossy().to_string())
                                        .unwrap_or_else(|| ".".to_string()),
                                    exit_code: None,
                                    stdout: None,
                                    stderr: Some(e.to_string()),
                                    duration: None,
                                    session_id: Some(session_id.clone()),
                                    agent_id: None,
                                },
                            );
                        }

                        Err(anyhow!("Failed to execute command: {}", e))
                    }
                    Err(_timeout_error) => {
                        // Command timed out
                        tracing::warn!(
                            "[Executor] Terminal command timed out after {}ms: {}",
                            timeout_ms,
                            command
                        );

                        // Emit timeout event for UI
                        if let Some(ref app_handle) = self.app_handle {
                            use crate::ui::events::frontend_events::{
                                emit_terminal_command, TerminalCommand,
                            };
                            emit_terminal_command(
                                app_handle,
                                TerminalCommand {
                                    id: uuid::Uuid::new_v4().to_string(),
                                    command: command.to_string(),
                                    cwd: cwd
                                        .as_ref()
                                        .map(|p| p.to_string_lossy().to_string())
                                        .unwrap_or_else(|| ".".to_string()),
                                    exit_code: None,
                                    stdout: None,
                                    stderr: Some(format!(
                                        "Command timed out after {}ms",
                                        timeout_ms
                                    )),
                                    duration: Some(timeout_ms),
                                    session_id: Some(session_id.clone()),
                                    agent_id: None,
                                },
                            );
                        }

                        // Return a result indicating timeout (not an error)
                        // This allows the AGI to handle timeouts gracefully
                        Ok(json!({
                            "success": false,
                            "exit_code": null,
                            "stdout": "",
                            "stderr": format!("Command timed out after {}ms", timeout_ms),
                            "timed_out": true,
                            "shell": shell_cmd,
                            "cwd": cwd.as_ref().map(|p| p.to_string_lossy().to_string())
                        }))
                    }
                }
            }
            _ => Err(anyhow!("Unknown tool: {}", tool_name)),
        };

        let execution_time_ms = start_time.elapsed().as_millis() as u64;

        // Emit tool stream completed/error event
        if let Some(ref app_handle) = self.app_handle {
            match &result {
                Ok(res) => {
                    emit_tool_completed(app_handle, &tool_id, res.clone(), execution_time_ms);
                }
                Err(e) => {
                    emit_tool_error(
                        app_handle,
                        &tool_id,
                        &e.to_string(),
                        execution_time_ms,
                        true,
                    );
                }
            }
        }

        match &result {
            Ok(res) => {
                crate::ui::hooks::emit_event(crate::ui::hooks::HookEvent::post_tool_use(
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
                crate::ui::hooks::emit_event(crate::ui::hooks::HookEvent::tool_error(
                    session_id.clone(),
                    tool_name.to_string(),
                    tool_name.to_string(),
                    parameters.clone(),
                    e.to_string(),
                ))
                .await;
            }
        }

        if let Some(ref app_handle) = self.app_handle {
            let tool_execution = crate::ui::events::create_tool_execution_event(
                tool_name,
                parameters,
                result.as_ref().ok().cloned(),
                result.as_ref().err().map(|e| e.to_string()),
                execution_time_ms,
                result.is_ok(),
            );
            crate::ui::events::emit_tool_execution(app_handle, tool_execution);
        }

        result
    }

    pub async fn execute_plans_parallel(
        &self,
        plans: Vec<planner::Plan>,
        sandbox_manager: &crate::core::agi::SandboxManager,
        goal: &Goal,
    ) -> Result<Vec<crate::core::agi::ExecutionResult>> {
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
                    None, // No change tracker for parallel execution tests
                )
                .unwrap();

                executor.tool_cache = tool_cache;

                let mut steps_completed = 0;
                let mut steps_failed = 0;
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

                crate::core::agi::ExecutionResult {
                    plan_id,
                    sandbox_id,
                    success,
                    output,
                    execution_time_ms,
                    steps_completed,
                    steps_failed,
                    error: error_msg,
                    cost: None,
                }
            });

            handles.push(handle);
        }

        let results = futures::future::join_all(handles).await;

        let execution_results: Vec<crate::core::agi::ExecutionResult> =
            results.into_iter().filter_map(|r| r.ok()).collect();

        tracing::info!(
            "[Executor] Parallel execution complete. {} results collected",
            execution_results.len()
        );

        Ok(execution_results)
    }

    pub async fn execute_goal_with_outcomes(
        &self,
        goal: &Goal,
        plan: &planner::Plan,
        context: &ExecutionContext,
    ) -> Result<ExecutionResultWithOutcomes> {
        use tokio::time::Instant;

        let start_time = Instant::now();

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

        let expected_outcomes =
            if let (Some(pt), Some(ref pr)) = (process_type, &self.process_reasoning) {
                pr.define_outcomes(pt, goal)
            } else {
                vec![]
            };

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

        let mut tracked_outcomes = vec![];
        if let Some(ref tracker) = self.outcome_tracker {
            for mut outcome in expected_outcomes {
                let actual_value = self.measure_outcome(&outcome, context).await?;
                outcome.actual_value = Some(actual_value);

                outcome.achieved = match outcome.metric_name.as_str() {
                    "processing_time" | "response_time" | "deployment_time" => {
                        actual_value <= outcome.target_value
                    }

                    "data_accuracy" | "response_quality" | "test_coverage" | "completion_rate" => {
                        actual_value >= outcome.target_value
                    }

                    "invoices_processed" | "tickets_resolved" | "records_processed" => {
                        actual_value >= outcome.target_value
                    }

                    "false_positive_rate" | "rollback_needed" => {
                        actual_value <= outcome.target_value
                    }

                    _ => actual_value >= outcome.target_value,
                };

                if let Err(e) = tracker.track_outcome(goal.id.clone(), outcome.clone()) {
                    tracing::warn!("[Executor] Failed to track outcome: {}", e);
                } else {
                    tracked_outcomes.push(outcome);
                }
            }
        }

        let outcome_score = if let Some(ref pr) = self.process_reasoning {
            process_type.map(|pt| pr.evaluate_outcome(pt, &tracked_outcomes, context))
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

    async fn measure_outcome(
        &self,
        outcome: &crate::core::agi::process_reasoning::Outcome,
        context: &ExecutionContext,
    ) -> Result<f64> {
        match outcome.metric_name.as_str() {
            "processing_time" | "response_time" | "deployment_time" => {
                let total_time_ms: u64 = context
                    .tool_results
                    .iter()
                    .map(|r| r.execution_time_ms)
                    .sum();
                Ok(total_time_ms as f64 / 1000.0)
            }
            "data_accuracy" | "categorization_accuracy" | "response_quality" => {
                let total = context.tool_results.len();
                if total == 0 {
                    return Ok(0.0);
                }
                let successful = context.tool_results.iter().filter(|r| r.success).count();
                Ok(successful as f64 / total as f64)
            }
            "invoices_processed" | "tickets_resolved" | "records_processed"
            | "emails_categorized" | "leads_scored" | "posts_scheduled" => {
                let successful = context.tool_results.iter().filter(|r| r.success).count();
                Ok(successful as f64)
            }
            "test_coverage" | "documentation_completeness" | "completion_rate" => {
                let total = context.tool_results.len();
                if total == 0 {
                    return Ok(0.0);
                }
                let successful = context.tool_results.iter().filter(|r| r.success).count();
                Ok(successful as f64 / total as f64)
            }
            "false_positive_rate" => {
                let total = context.tool_results.len();
                if total == 0 {
                    return Ok(0.0);
                }
                let failed = context.tool_results.iter().filter(|r| !r.success).count();
                Ok(failed as f64 / total as f64)
            }
            "deployment_success" | "rollback_needed" => {
                let all_succeeded = context.tool_results.iter().all(|r| r.success);
                Ok(if all_succeeded { 1.0 } else { 0.0 })
            }
            "tests_passed" => {
                let total = context.tool_results.len();
                if total == 0 {
                    return Ok(0.0);
                }
                let passed = context.tool_results.iter().filter(|r| r.success).count();
                Ok(passed as f64 / total as f64)
            }
            _ => {
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionResultWithOutcomes {
    pub success: bool,
    pub output: serde_json::Value,
    pub execution_time_ms: u64,
    pub steps_completed: usize,
    pub steps_failed: usize,
    pub error: Option<String>,
    pub process_type: Option<crate::core::agi::ProcessType>,
    pub tracked_outcomes: Vec<crate::core::agi::process_reasoning::Outcome>,
    pub outcome_score: Option<crate::core::agi::process_reasoning::OutcomeScore>,
}
