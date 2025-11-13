use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio::time::sleep;

use super::inspector::{ElementSelector, InspectorService};
use crate::automation::{global_service, input::MouseButton};

/// Script action to execute
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptAction {
    pub id: String,
    #[serde(rename = "type")]
    pub action_type: String,
    pub selector: Option<ElementSelector>,
    pub coordinates: Option<Coordinates>,
    pub value: Option<String>,
    pub duration: Option<u64>,
    pub condition: Option<String>,
    pub repeat_count: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Coordinates {
    pub x: i32,
    pub y: i32,
}

/// Complete automation script
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationScript {
    pub id: String,
    pub name: String,
    pub description: String,
    pub tags: Vec<String>,
    pub actions: Vec<ScriptAction>,
    pub created_at: u64,
    pub updated_at: u64,
    pub last_run_at: Option<u64>,
}

/// Execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionResult {
    pub success: bool,
    pub actions_completed: usize,
    pub actions_failed: usize,
    pub duration_ms: u64,
    pub error: Option<String>,
    pub screenshots: Vec<String>,
    pub logs: Vec<ExecutionLog>,
}

/// Execution log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionLog {
    pub timestamp: u64,
    pub level: String,
    pub message: String,
    pub action_id: Option<String>,
}

/// Executor configuration
#[derive(Debug, Clone)]
pub struct ExecutorConfig {
    pub retry_count: u32,
    pub retry_delay_ms: u64,
    pub screenshot_on_error: bool,
    pub emit_progress: bool,
}

impl Default for ExecutorConfig {
    fn default() -> Self {
        Self {
            retry_count: 3,
            retry_delay_ms: 1000,
            screenshot_on_error: true,
            emit_progress: true,
        }
    }
}

/// Script executor service
pub struct ExecutorService {
    inspector: InspectorService,
    config: ExecutorConfig,
}

impl ExecutorService {
    pub fn new(config: ExecutorConfig) -> Result<Self> {
        Ok(Self {
            inspector: InspectorService::new()?,
            config,
        })
    }

    /// Execute an automation script
    pub async fn execute_script(
        &self,
        script: AutomationScript,
        app_handle: Option<&AppHandle>,
    ) -> Result<ExecutionResult> {
        let start = Instant::now();
        let mut logs = Vec::new();
        let mut screenshots = Vec::new();
        let mut actions_completed = 0;
        let mut actions_failed = 0;

        self.log(
            &mut logs,
            "info",
            &format!("Starting execution of script: {}", script.name),
            None,
        );

        // Emit start event
        if let Some(app) = app_handle {
            if self.config.emit_progress {
                let _ = app.emit(
                    "automation:execution_started",
                    serde_json::json!({
                        "script_id": script.id,
                        "script_name": script.name,
                    }),
                );
            }
        }

        for (index, action) in script.actions.iter().enumerate() {
            self.log(
                &mut logs,
                "info",
                &format!(
                    "Executing action {}/{}: {}",
                    index + 1,
                    script.actions.len(),
                    action.action_type
                ),
                Some(&action.id),
            );

            // Emit progress
            if let Some(app) = app_handle {
                if self.config.emit_progress {
                    let _ = app.emit(
                        "automation:action_started",
                        serde_json::json!({
                            "action_id": action.id,
                            "action_type": action.action_type,
                            "progress": (index + 1) as f64 / script.actions.len() as f64,
                        }),
                    );
                }
            }

            // Execute with retry logic
            let mut attempt = 0;
            let mut last_error = None;

            while attempt <= self.config.retry_count {
                match self.execute_action(action, app_handle).await {
                    Ok(_) => {
                        actions_completed += 1;
                        self.log(
                            &mut logs,
                            "info",
                            &format!("Action completed: {}", action.action_type),
                            Some(&action.id),
                        );
                        break;
                    }
                    Err(err) => {
                        last_error = Some(err.to_string());
                        attempt += 1;

                        if attempt <= self.config.retry_count {
                            self.log(
                                &mut logs,
                                "warn",
                                &format!(
                                    "Action failed (attempt {}/{}): {}",
                                    attempt,
                                    self.config.retry_count + 1,
                                    err
                                ),
                                Some(&action.id),
                            );
                            sleep(Duration::from_millis(self.config.retry_delay_ms)).await;
                        } else {
                            actions_failed += 1;
                            self.log(
                                &mut logs,
                                "error",
                                &format!("Action failed after {} attempts: {}", attempt, err),
                                Some(&action.id),
                            );

                            // Take screenshot on error
                            if self.config.screenshot_on_error {
                                if let Ok(screenshot_path) = self.take_error_screenshot().await {
                                    screenshots.push(screenshot_path);
                                }
                            }

                            // Stop execution on error
                            return Ok(ExecutionResult {
                                success: false,
                                actions_completed,
                                actions_failed,
                                duration_ms: start.elapsed().as_millis() as u64,
                                error: last_error,
                                screenshots,
                                logs,
                            });
                        }
                    }
                }
            }

            // Emit action completed
            if let Some(app) = app_handle {
                if self.config.emit_progress {
                    let _ = app.emit(
                        "automation:action_completed",
                        serde_json::json!({
                            "action_id": action.id,
                        }),
                    );
                }
            }
        }

        let duration_ms = start.elapsed().as_millis() as u64;

        self.log(
            &mut logs,
            "info",
            &format!("Script execution completed in {}ms", duration_ms),
            None,
        );

        // Emit completion event
        if let Some(app) = app_handle {
            if self.config.emit_progress {
                let _ = app.emit(
                    "automation:execution_completed",
                    serde_json::json!({
                        "script_id": script.id,
                        "success": true,
                    }),
                );
            }
        }

        Ok(ExecutionResult {
            success: true,
            actions_completed,
            actions_failed,
            duration_ms,
            error: None,
            screenshots,
            logs,
        })
    }

    /// Execute a single action
    async fn execute_action(
        &self,
        action: &ScriptAction,
        _app_handle: Option<&AppHandle>,
    ) -> Result<()> {
        match action.action_type.as_str() {
            "click" => self.execute_click(action).await,
            "type" => self.execute_type(action).await,
            "wait" => self.execute_wait(action).await,
            "screenshot" => self.execute_screenshot(action).await,
            "hotkey" => self.execute_hotkey(action).await,
            "drag" => self.execute_drag(action).await,
            "scroll" => self.execute_scroll(action).await,
            _ => Err(anyhow!("Unknown action type: {}", action.action_type)),
        }
    }

    /// Execute click action
    async fn execute_click(&self, action: &ScriptAction) -> Result<()> {
        let (x, y) = self.resolve_coordinates(action)?;

        let mut guard = global_service()?;
        let service = guard
            .as_mut()
            .ok_or_else(|| anyhow!("Automation service unavailable"))?;

        service.mouse.click(x, y, MouseButton::Left)?;
        Ok(())
    }

    /// Execute type action
    async fn execute_type(&self, action: &ScriptAction) -> Result<()> {
        let text = action
            .value
            .as_ref()
            .ok_or_else(|| anyhow!("Type action requires value"))?;

        // Optionally click first if coordinates provided
        if action.coordinates.is_some() || action.selector.is_some() {
            let (x, y) = self.resolve_coordinates(action)?;
            let mut guard = global_service()?;
            let service = guard
                .as_mut()
                .ok_or_else(|| anyhow!("Automation service unavailable"))?;
            service.mouse.click(x, y, MouseButton::Left)?;
            sleep(Duration::from_millis(100)).await;
        }

        let mut guard = global_service()?;
        let service = guard
            .as_mut()
            .ok_or_else(|| anyhow!("Automation service unavailable"))?;

        service.keyboard.send_text(text).await?;
        Ok(())
    }

    /// Execute wait action
    async fn execute_wait(&self, action: &ScriptAction) -> Result<()> {
        let duration_ms = action
            .duration
            .or_else(|| action.value.as_ref().and_then(|v| v.parse().ok()))
            .unwrap_or(1000);

        sleep(Duration::from_millis(duration_ms)).await;
        Ok(())
    }

    /// Execute screenshot action
    async fn execute_screenshot(&self, _action: &ScriptAction) -> Result<()> {
        // Screenshot implementation would go here
        // For now, just return success
        Ok(())
    }

    /// Execute hotkey action
    async fn execute_hotkey(&self, action: &ScriptAction) -> Result<()> {
        let value = action
            .value
            .as_ref()
            .ok_or_else(|| anyhow!("Hotkey action requires value"))?;

        // Parse hotkey format like "Ctrl+C"
        let parts: Vec<&str> = value.split('+').collect();
        if parts.is_empty() {
            return Err(anyhow!("Invalid hotkey format"));
        }

        // Implementation would require parsing key codes
        // For now, placeholder
        Ok(())
    }

    /// Execute drag action
    async fn execute_drag(&self, action: &ScriptAction) -> Result<()> {
        let (from_x, from_y) = self.resolve_coordinates(action)?;

        // Get target coordinates from metadata or value
        // Placeholder for now
        Ok(())
    }

    /// Execute scroll action
    async fn execute_scroll(&self, _action: &ScriptAction) -> Result<()> {
        // Scroll implementation would go here
        Ok(())
    }

    /// Resolve coordinates from action (selector or direct coordinates)
    fn resolve_coordinates(&self, action: &ScriptAction) -> Result<(i32, i32)> {
        if let Some(ref coords) = action.coordinates {
            return Ok((coords.x, coords.y));
        }

        if let Some(ref selector) = action.selector {
            if let Some(element_id) = self.inspector.find_element_by_selector(selector)? {
                let info = self.inspector.inspect_element_by_id(&element_id)?;
                if let Some(rect) = info.bounding_rect {
                    let x = (rect.left + rect.width / 2.0).round() as i32;
                    let y = (rect.top + rect.height / 2.0).round() as i32;
                    return Ok((x, y));
                }
            }
            return Err(anyhow!("Element not found for selector"));
        }

        Err(anyhow!("No coordinates or selector provided"))
    }

    /// Take screenshot on error
    async fn take_error_screenshot(&self) -> Result<String> {
        // Implementation would capture and save screenshot
        // Return path to saved screenshot
        Ok("error_screenshot.png".to_string())
    }

    /// Add log entry
    fn log(
        &self,
        logs: &mut Vec<ExecutionLog>,
        level: &str,
        message: &str,
        action_id: Option<&str>,
    ) {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        logs.push(ExecutionLog {
            timestamp,
            level: level.to_string(),
            message: message.to_string(),
            action_id: action_id.map(|s| s.to_string()),
        });

        tracing::info!("[{}] {}", level.to_uppercase(), message);
    }
}
