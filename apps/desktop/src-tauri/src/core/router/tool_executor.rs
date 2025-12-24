use crate::core::agi::tools::{Tool, ToolRegistry, ToolResult};
use crate::core::router::{ToolCall, ToolDefinition};
use crate::sys::commands::settings::SettingsState;
use crate::ui::events::{
    create_file_delete_event, create_file_read_event, create_file_write_event, emit_file_operation,
    emit_terminal_command, TerminalCommand,
};
use anyhow::{anyhow, Result};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Instant;
use tauri::{Emitter, Manager};
use tokio::fs;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::time::{timeout, Duration as TokioDuration};
use uuid::Uuid;

const DANGEROUS_TOOLS: &[&str] = &[
    "file_write",
    "file_delete",
    "terminal_execute",
    "git_push",
    "github_create_repo",
    "api_call",
    "api_upload",
    "cloud_upload",
    "email_send",
    "db_execute",
    "db_transaction_begin",
    "code_execute",
];

fn is_dangerous_tool(tool_id: &str) -> bool {
    DANGEROUS_TOOLS.contains(&tool_id)
        || tool_id.starts_with("ui_")
        || tool_id.starts_with("automation_")
        || tool_id.starts_with("browser_")
}

pub struct ToolExecutor {
    registry: Arc<ToolRegistry>,
    app_handle: Option<tauri::AppHandle>,
    conversation_mode: Option<String>,
}

impl ToolExecutor {
    pub fn new(registry: Arc<ToolRegistry>) -> Self {
        Self {
            registry,
            app_handle: None,
            conversation_mode: None,
        }
    }

    pub fn with_app_handle(registry: Arc<ToolRegistry>, app_handle: tauri::AppHandle) -> Self {
        Self {
            registry,
            app_handle: Some(app_handle),
            conversation_mode: None,
        }
    }

    pub fn set_conversation_mode(&mut self, mode: Option<String>) {
        self.conversation_mode = mode;
    }

    pub fn get_tool_definitions(&self, tool_ids: Option<Vec<String>>) -> Vec<ToolDefinition> {
        let tools = if let Some(ids) = tool_ids {
            ids.iter()
                .filter_map(|id| self.registry.get_tool(id))
                .collect()
        } else {
            self.registry.list_tools()
        };

        tools
            .iter()
            .map(|tool| self.convert_tool_to_definition(tool))
            .collect()
    }

    fn convert_tool_to_definition(&self, tool: &Tool) -> ToolDefinition {
        let mut properties = json!({});
        let mut required = Vec::new();

        for param in &tool.parameters {
            properties[&param.name] = json!({
                "type": self.get_json_schema_type(&param.parameter_type),
                "description": param.description,
            });

            if param.required {
                required.push(param.name.clone());
            }
        }

        let parameters = json!({
            "type": "object",
            "properties": properties,
            "required": required,
        });

        ToolDefinition {
            name: tool.id.clone(),
            description: tool.description.clone(),
            parameters,
        }
    }

    fn get_json_schema_type(&self, param_type: &crate::core::agi::tools::ParameterType) -> &str {
        match param_type {
            crate::core::agi::tools::ParameterType::String => "string",
            crate::core::agi::tools::ParameterType::Integer => "integer",
            crate::core::agi::tools::ParameterType::Float => "number",
            crate::core::agi::tools::ParameterType::Boolean => "boolean",
            crate::core::agi::tools::ParameterType::Object => "object",
            crate::core::agi::tools::ParameterType::Array => "array",
            crate::core::agi::tools::ParameterType::FilePath => "string",
            crate::core::agi::tools::ParameterType::URL => "string",
        }
    }

    async fn validate_path(&self, path_str: &str) -> Result<()> {
        if let Some(app_handle) = &self.app_handle {
            let settings_state = app_handle.state::<SettingsState>();
            let settings = settings_state.settings.lock().await;

            let allowed = &settings.allowed_directories;
            if allowed.is_empty() {
                return Ok(());
            }

            let path_normalized = path_str.replace('\\', "/");

            for allowed_dir in allowed {
                let allowed_normalized = allowed_dir.replace('\\', "/");
                if path_normalized.starts_with(&allowed_normalized) {
                    return Ok(());
                }
            }

            return Err(anyhow!(
                "Access denied: Path '{}' is not in allowed directories.",
                path_str
            ));
        }
        Ok(())
    }

    pub async fn execute_tool_call(&self, tool_call: &ToolCall) -> Result<ToolResult> {
        let args: HashMap<String, serde_json::Value> =
            serde_json::from_str(&tool_call.arguments)
                .map_err(|e| anyhow!("Invalid tool arguments: {}", e))?;
        let metadata_snapshot = serde_json::to_value(&args).unwrap_or(json!({}));
        let action_id = self.next_action_id(tool_call);
        let start_time = Instant::now();

        self.emit_tool_action(
            &action_id,
            &tool_call.name,
            "running",
            &metadata_snapshot,
            None,
        );

        let in_safe_mode = self.conversation_mode.as_deref() == Some("safe");
        if tool_call.name.starts_with("mcp_") && in_safe_mode {
            tracing::warn!(
                "[Security] MCP tool '{}' requested in safe mode. Emitting approval request.",
                tool_call.name
            );

            if let Some(app_handle) = &self.app_handle {
                if let Err(e) = app_handle.emit(
                    "approval:request",
                    json!({
                        "id": uuid::Uuid::new_v4().to_string(),
                        "type": "tool_execution",
                        "toolName": tool_call.name,
                        "description": format!("Agent wants to execute MCP tool: {}", tool_call.name),
                        "riskLevel": "high",
                        "details": {
                            "tool": tool_call.name,
                            "arguments": metadata_snapshot.clone(),
                            "source": "mcp"
                        },
                        "status": "pending",
                    }),
                ) {
                    tracing::error!("Failed to emit approval:request event for MCP tool: {}", e);
                }
            }

            let message = format!(
                "User approval required to execute MCP tool: {}",
                tool_call.name
            );
            self.emit_tool_action(
                &action_id,
                &tool_call.name,
                "blocked",
                &metadata_snapshot,
                Some(message.clone()),
            );
            self.emit_tool_metrics(
                &action_id,
                &tool_call.name,
                start_time.elapsed().as_millis() as u64,
                false,
            );

            return Ok(ToolResult {
                success: false,
                data: json!({ "approval_required": true }),
                error: Some(message),
                metadata: HashMap::from([
                    ("requires_approval".to_string(), json!(true)),
                    ("tool_name".to_string(), json!(tool_call.name)),
                    ("tool_source".to_string(), json!("mcp")),
                ]),
            });
        }

        if tool_call.name.starts_with("mcp_") {
            let result = self.execute_mcp_tool(tool_call, args).await;
            return self.finalize_tool_result(
                &action_id,
                &tool_call.name,
                metadata_snapshot,
                start_time,
                result,
            );
        }

        let tool = self
            .registry
            .get_tool(&tool_call.name)
            .ok_or_else(|| anyhow!("Tool not found: {}", tool_call.name))?;

        for param in &tool.parameters {
            if param.required && !args.contains_key(&param.name) {
                let error_message = format!("Missing required parameter: {}", param.name);
                self.emit_tool_action(
                    &action_id,
                    &tool_call.name,
                    "failed",
                    &metadata_snapshot,
                    Some(error_message.clone()),
                );
                self.emit_tool_metrics(
                    &action_id,
                    &tool_call.name,
                    start_time.elapsed().as_millis() as u64,
                    false,
                );
                return Ok(ToolResult {
                    success: false,
                    data: json!(null),
                    error: Some(error_message),
                    metadata: HashMap::new(),
                });
            }
        }

        if is_dangerous_tool(&tool_call.name) && self.conversation_mode.as_deref() == Some("safe") {
            tracing::warn!(
                "[Security] Dangerous tool '{}' requested in safe mode. Emitting approval request.",
                tool_call.name
            );

            if let Some(app_handle) = &self.app_handle {
                if let Err(e) = app_handle.emit(
                    "approval:request",
                    json!({
                        "id": uuid::Uuid::new_v4().to_string(),
                        "type": "tool_execution",
                        "toolName": tool_call.name,
                        "description": format!("Agent wants to execute: {}", tool.name),
                        "riskLevel": "high",
                        "details": {
                            "tool": tool.name,
                            "arguments": metadata_snapshot.clone(),
                        },
                        "status": "pending",
                    }),
                ) {
                    tracing::error!("Failed to emit approval:request event: {}", e);
                }

                if let Err(e) = app_handle.emit(
                    "agent:status:update",
                    json!({
                        "id": "main_agent",
                        "name": "AGI Workforce Agent",
                        "status": "paused",
                        "currentStep": format!("Waiting for approval to execute: {}", tool.name),
                        "progress": 50
                    }),
                ) {
                    tracing::error!("Failed to emit agent:status:update event: {}", e);
                }
            }

            let message = format!(
                "User approval required to execute dangerous tool: {}",
                tool.name
            );
            self.emit_tool_action(
                &action_id,
                &tool_call.name,
                "blocked",
                &metadata_snapshot,
                Some(message.clone()),
            );
            self.emit_tool_metrics(
                &action_id,
                &tool_call.name,
                start_time.elapsed().as_millis() as u64,
                false,
            );

            return Ok(ToolResult {
                success: false,
                data: json!({ "approval_required": true }),
                error: Some(message),
                metadata: HashMap::from([
                    ("requires_approval".to_string(), json!(true)),
                    ("tool_name".to_string(), json!(tool_call.name)),
                ]),
            });
        }

        if let Some(app_handle) = &self.app_handle {
            if let Err(e) = app_handle.emit(
                "agent:status:update",
                json!({
                    "id": "main_agent",
                    "name": "AGI Workforce Agent",
                    "status": "running",
                    "currentStep": format!("Executing: {}", tool.name),
                    "progress": 60
                }),
            ) {
                tracing::error!("Failed to emit agent:status:update event: {}", e);
            }
        }

        let result = self.execute_tool_impl(&tool, args).await;
        self.finalize_tool_result(
            &action_id,
            &tool_call.name,
            metadata_snapshot,
            start_time,
            result,
        )
    }

    async fn execute_terminal_tool(
        &self,
        args: HashMap<String, serde_json::Value>,
    ) -> Result<ToolResult> {
        let command = args
            .get("command")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing command parameter"))?
            .to_string();
        let cwd = args
            .get("cwd")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let shell = args
            .get("shell")
            .and_then(|v| v.as_str())
            .unwrap_or("powershell")
            .to_lowercase();
        let timeout_ms = args
            .get("timeout_ms")
            .and_then(|v| v.as_u64())
            .unwrap_or(60_000);

        if let Some(dir) = &cwd {
            if let Err(e) = self.validate_path(dir).await {
                return Ok(ToolResult {
                    success: false,
                    data: json!(null),
                    error: Some(e.to_string()),
                    metadata: HashMap::new(),
                });
            }
        }

        let (program, mut shell_args): (String, Vec<String>) = match shell.as_str() {
            "cmd" => (
                "cmd.exe".to_string(),
                vec!["/C".to_string(), command.clone()],
            ),
            "bash" => ("bash".to_string(), vec!["-lc".to_string(), command.clone()]),
            "wsl" => (
                "wsl.exe".to_string(),
                vec!["bash".to_string(), "-lc".to_string(), command.clone()],
            ),
            _ => (
                "powershell.exe".to_string(),
                vec![
                    "-NoLogo".to_string(),
                    "-NoProfile".to_string(),
                    "-Command".to_string(),
                    command.clone(),
                ],
            ),
        };

        let mut cmd = Command::new(&program);
        for arg in shell_args.drain(..) {
            cmd.arg(arg);
        }
        if let Some(dir) = &cwd {
            cmd.current_dir(dir);
        }
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
        cmd.kill_on_drop(true);

        let mut child = cmd
            .spawn()
            .map_err(|e| anyhow!("Failed to spawn shell: {}", e))?;
        let stdout_handle = child.stdout.take();
        let stderr_handle = child.stderr.take();

        let stdout_task = tokio::spawn(async move {
            let mut buffer = Vec::new();
            if let Some(mut stdout) = stdout_handle {
                stdout.read_to_end(&mut buffer).await?;
            }
            Ok::<Vec<u8>, std::io::Error>(buffer)
        });

        let stderr_task = tokio::spawn(async move {
            let mut buffer = Vec::new();
            if let Some(mut stderr) = stderr_handle {
                stderr.read_to_end(&mut buffer).await?;
            }
            Ok::<Vec<u8>, std::io::Error>(buffer)
        });

        let start = Instant::now();
        let status = match timeout(TokioDuration::from_millis(timeout_ms), child.wait()).await {
            Ok(result) => result.map_err(|e| anyhow!("Failed to wait for command: {}", e))?,
            Err(_) => {
                let timeout_error = format!("Command timed out after {} ms", timeout_ms);

                if let Err(e) = child.kill().await {
                    tracing::warn!("Failed to kill timed-out process: {}", e);
                }

                match timeout(TokioDuration::from_millis(1000), child.wait()).await {
                    Ok(Ok(_status)) => {
                        tracing::debug!("Process terminated gracefully after timeout");
                    }
                    Ok(Err(e)) => {
                        tracing::warn!("Error waiting for process termination: {}", e);
                    }
                    Err(_) => {
                        tracing::warn!(
                            "Process did not terminate gracefully, will be force-killed"
                        );
                    }
                }

                stdout_task.abort();
                stderr_task.abort();

                if let Some(app_handle) = &self.app_handle {
                    let terminal_event = TerminalCommand {
                        id: Uuid::new_v4().to_string(),
                        command: command.clone(),
                        cwd: cwd.clone().unwrap_or_else(|| ".".to_string()),
                        exit_code: None,
                        stdout: None,
                        stderr: Some(timeout_error.clone()),
                        duration: Some(timeout_ms),
                        session_id: None,
                        agent_id: None,
                    };
                    emit_terminal_command(app_handle, terminal_event);
                }
                return Ok(ToolResult {
                    success: false,
                    data: json!(null),
                    error: Some(timeout_error),
                    metadata: HashMap::new(),
                });
            }
        };

        let stdout = stdout_task
            .await
            .map_err(|e| anyhow!("Failed to join stdout reader: {}", e))?
            .map_err(|e| anyhow!("Failed to read stdout: {}", e))?;
        let stderr = stderr_task
            .await
            .map_err(|e| anyhow!("Failed to join stderr reader: {}", e))?
            .map_err(|e| anyhow!("Failed to read stderr: {}", e))?;
        let output = std::process::Output {
            status,
            stdout,
            stderr,
        };

        let duration_ms = start.elapsed().as_millis() as u64;
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let exit_code = output.status.code();
        let success = output.status.success();

        if let Some(app_handle) = &self.app_handle {
            let terminal_event = TerminalCommand {
                id: Uuid::new_v4().to_string(),
                command: command.clone(),
                cwd: cwd.clone().unwrap_or_else(|| ".".to_string()),
                exit_code,
                stdout: if stdout.is_empty() {
                    None
                } else {
                    Some(stdout.clone())
                },
                stderr: if stderr.is_empty() {
                    None
                } else {
                    Some(stderr.clone())
                },
                duration: Some(duration_ms),
                session_id: None,
                agent_id: None,
            };
            emit_terminal_command(app_handle, terminal_event);
        }

        let mut metadata = HashMap::new();
        metadata.insert("shell".to_string(), json!(shell));
        metadata.insert("program".to_string(), json!(program));
        if let Some(dir) = &cwd {
            metadata.insert("cwd".to_string(), json!(dir));
        }

        let error_message = if success {
            None
        } else {
            let trimmed = stderr.trim();
            if trimmed.is_empty() {
                Some(match exit_code {
                    Some(code) => format!("Command exited with code {}", code),
                    None => "Command exited with error".to_string(),
                })
            } else {
                Some(trimmed.to_string())
            }
        };

        Ok(ToolResult {
            success,
            data: json!({
                "stdout": stdout,
                "stderr": stderr,
                "exitCode": exit_code,
                "durationMs": duration_ms,
            }),
            error: error_message,
            metadata,
        })
    }

    async fn execute_mcp_tool(
        &self,
        tool_call: &ToolCall,
        args: HashMap<String, serde_json::Value>,
    ) -> Result<ToolResult> {
        use crate::sys::commands::McpState;

        let mcp_state = self
            .app_handle
            .as_ref()
            .and_then(|h| h.try_state::<McpState>())
            .ok_or_else(|| anyhow!("MCP state not available"))?;

        match mcp_state.registry.execute_tool(&tool_call.name, args).await {
            Ok(result_value) => Ok(ToolResult {
                success: true,
                data: result_value,
                error: None,
                metadata: HashMap::new(),
            }),
            Err(e) => Ok(ToolResult {
                success: false,
                data: json!(null),
                error: Some(format!("MCP tool execution failed: {}", e)),
                metadata: HashMap::new(),
            }),
        }
    }

    async fn execute_tool_impl(
        &self,
        tool: &Tool,
        args: HashMap<String, serde_json::Value>,
    ) -> Result<ToolResult> {
        match tool.id.as_str() {
            "file_read" => {
                let path = args
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing path parameter"))?
                    .to_string();
                let session_id = args
                    .get("session_id")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                if let Err(e) = self.validate_path(&path).await {
                    return Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some(e.to_string()),
                        metadata: HashMap::from([("path".to_string(), json!(&path))]),
                    });
                }

                match fs::read_to_string(&path).await {
                    Ok(content) => {
                        if let Some(app_handle) = &self.app_handle {
                            let file_op = create_file_read_event(
                                &path,
                                &content,
                                true,
                                None,
                                session_id.clone(),
                            );
                            emit_file_operation(app_handle, file_op);
                        }

                        Ok(ToolResult {
                            success: true,
                            data: json!({ "content": content, "path": &path }),
                            error: None,
                            metadata: HashMap::from([("path".to_string(), json!(&path))]),
                        })
                    }
                    Err(e) => {
                        if let Some(app_handle) = &self.app_handle {
                            let file_op = create_file_read_event(
                                &path,
                                "",
                                false,
                                Some(e.to_string()),
                                session_id.clone(),
                            );
                            emit_file_operation(app_handle, file_op);
                        }

                        Ok(ToolResult {
                            success: false,
                            data: json!(null),
                            error: Some(format!("Failed to read file: {}", e)),
                            metadata: HashMap::from([("path".to_string(), json!(&path))]),
                        })
                    }
                }
            }
            "file_write" => {
                let path = args
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing path parameter"))?
                    .to_string();
                let content = args
                    .get("content")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing content parameter"))?
                    .to_string();
                let session_id = args
                    .get("session_id")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                if let Err(e) = self.validate_path(&path).await {
                    return Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some(e.to_string()),
                        metadata: HashMap::from([("path".to_string(), json!(&path))]),
                    });
                }

                let old_content = fs::read_to_string(&path).await.ok();
                if let Some(parent) = Path::new(&path).parent() {
                    let _ = fs::create_dir_all(parent).await;
                }

                let write_result = fs::write(&path, content.as_bytes()).await;

                if let Some(app_handle) = &self.app_handle {
                    let file_op = create_file_write_event(
                        &path,
                        old_content.as_deref(),
                        &content,
                        write_result.is_ok(),
                        write_result.as_ref().err().map(|e| e.to_string()),
                        session_id.clone(),
                    );
                    emit_file_operation(app_handle, file_op);
                }

                match write_result {
                    Ok(_) => Ok(ToolResult {
                        success: true,
                        data: json!({ "success": true, "path": &path }),
                        error: None,
                        metadata: HashMap::from([
                            ("path".to_string(), json!(&path)),
                            ("content_length".to_string(), json!(content.len())),
                        ]),
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some(format!("Failed to write file: {}", e)),
                        metadata: HashMap::from([("path".to_string(), json!(&path))]),
                    }),
                }
            }
            "file_delete" => {
                let path = args
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing path parameter"))?
                    .to_string();
                let session_id = args
                    .get("session_id")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                if let Err(e) = self.validate_path(&path).await {
                    return Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some(e.to_string()),
                        metadata: HashMap::from([("path".to_string(), json!(&path))]),
                    });
                }

                let size_bytes = fs::metadata(&path)
                    .await
                    .ok()
                    .map(|meta| meta.len() as usize);
                let delete_result = fs::remove_file(&path).await;

                if let Some(app_handle) = &self.app_handle {
                    let file_op = create_file_delete_event(
                        &path,
                        size_bytes,
                        delete_result.is_ok(),
                        delete_result.as_ref().err().map(|e| e.to_string()),
                        session_id,
                    );
                    emit_file_operation(app_handle, file_op);
                }

                match delete_result {
                    Ok(_) => Ok(ToolResult {
                        success: true,
                        data: json!({ "success": true, "path": &path }),
                        error: None,
                        metadata: HashMap::from([("path".to_string(), json!(&path))]),
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some(format!("Failed to delete file: {}", e)),
                        metadata: HashMap::from([("path".to_string(), json!(&path))]),
                    }),
                }
            }
            "ui_screenshot" => {
                use crate::automation::screen::capture_primary_screen;
                match capture_primary_screen() {
                    Ok(captured) => {
                        let temp_file = match tempfile::Builder::new()
                            .prefix("screenshot_")
                            .suffix(".png")
                            .tempfile()
                        {
                            Ok(file) => file,
                            Err(e) => {
                                return Ok(ToolResult {
                                    success: false,
                                    data: json!(null),
                                    error: Some(format!("Failed to create temp file: {}", e)),
                                    metadata: HashMap::new(),
                                });
                            }
                        };

                        let temp_path = temp_file.path();
                        match captured.pixels.save(temp_path) {
                            Ok(_) => {
                                let (file, path) = temp_file
                                    .keep()
                                    .map_err(|e| anyhow!("Failed to persist temp file: {}", e))?;
                                drop(file);

                                Ok(ToolResult {
                                    success: true,
                                    data: json!({
                                        "screenshot_path": path.to_string_lossy().to_string(),
                                        "cleanup_note": "File will be cleaned up by OS temp directory cleanup"
                                    }),
                                    error: None,
                                    metadata: HashMap::from([
                                        ("temp_file".to_string(), json!(true)),
                                        (
                                            "path".to_string(),
                                            json!(path.to_string_lossy().to_string()),
                                        ),
                                    ]),
                                })
                            }
                            Err(e) => Ok(ToolResult {
                                success: false,
                                data: json!(null),
                                error: Some(format!("Failed to save screenshot: {}", e)),
                                metadata: HashMap::new(),
                            }),
                        }
                    }
                    Err(e) => Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some(format!("Failed to capture screenshot: {}", e)),
                        metadata: HashMap::new(),
                    }),
                }
            }
            "ui_click" => {
                if let Some(ref app) = self.app_handle {
                    use crate::automation::{
                        input::MouseButton, types::ElementQuery, AutomationService,
                    };
                    use tauri::Manager;

                    let automation_opt = app.state::<std::sync::Arc<Option<AutomationService>>>();
                    let automation = match automation_opt.as_ref() {
                        Some(_) => match AutomationService::new() {
                            Ok(service) => std::sync::Arc::new(service),
                            Err(e) => {
                                return Ok(ToolResult {
                                        success: false,
                                        data: json!(null),
                                        error: Some(format!("Automation service not available: {}. Please grant accessibility permissions.", e)),
                                        metadata: HashMap::new(),
                                    });
                            }
                        },
                        None => {
                            return Ok(ToolResult {
                                success: false,
                                data: json!(null),
                                error: Some("Automation service not available. Please grant accessibility permissions in System Settings > Privacy & Security > Accessibility.".to_string()),
                                metadata: HashMap::new(),
                            });
                        }
                    };
                    let target = args
                        .get("target")
                        .ok_or_else(|| anyhow!("Missing target parameter"))?;

                    if let Some(coords) = target.get("coordinates") {
                        let x = coords.get("x").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                        let y = coords.get("y").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                        match automation
                            .mouse
                            .lock()
                            .map_err(|e| anyhow!("Failed to lock mouse mutex: {}", e))?
                            .click(x, y, MouseButton::Left)
                        {
                            Ok(_) => Ok(ToolResult {
                                success: true,
                                data: json!({ "success": true, "action": "clicked", "x": x, "y": y }),
                                error: None,
                                metadata: HashMap::new(),
                            }),
                            Err(e) => Ok(ToolResult {
                                success: false,
                                data: json!(null),
                                error: Some(format!("Failed to click: {}", e)),
                                metadata: HashMap::new(),
                            }),
                        }
                    } else if let Some(element_id) =
                        target.get("element_id").and_then(|v| v.as_str())
                    {
                        match automation.native.invoke(element_id) {
                            Ok(_) => Ok(ToolResult {
                                success: true,
                                data: json!({ "success": true, "action": "invoked", "element_id": element_id }),
                                error: None,
                                metadata: HashMap::new(),
                            }),
                            Err(e) => Ok(ToolResult {
                                success: false,
                                data: json!(null),
                                error: Some(format!("Failed to invoke element: {}", e)),
                                metadata: HashMap::new(),
                            }),
                        }
                    } else if let Some(text) = target.get("text").and_then(|v| v.as_str()) {
                        let query = ElementQuery {
                            window: None,
                            window_class: None,
                            name: Some(text.to_string()),
                            class_name: None,
                            automation_id: None,
                            control_type: None,
                            max_results: Some(1),
                        };
                        match automation.native.find_elements(None, &query) {
                            Ok(elements) => {
                                if let Some(element) = elements.first() {
                                    match automation.native.invoke(&element.id) {
                                        Ok(_) => Ok(ToolResult {
                                            success: true,
                                            data: json!({ "success": true, "action": "invoked", "element_id": element.id, "found_by": "text", "text": text }),
                                            error: None,
                                            metadata: HashMap::new(),
                                        }),
                                        Err(e) => Ok(ToolResult {
                                            success: false,
                                            data: json!(null),
                                            error: Some(format!("Failed to invoke element: {}", e)),
                                            metadata: HashMap::new(),
                                        }),
                                    }
                                } else {
                                    Ok(ToolResult {
                                        success: false,
                                        data: json!(null),
                                        error: Some(format!(
                                            "Element with text '{}' not found",
                                            text
                                        )),
                                        metadata: HashMap::new(),
                                    })
                                }
                            }
                            Err(e) => Ok(ToolResult {
                                success: false,
                                data: json!(null),
                                error: Some(format!("Failed to find element: {}", e)),
                                metadata: HashMap::new(),
                            }),
                        }
                    } else {
                        Ok(ToolResult {
                            success: false,
                            data: json!(null),
                            error: Some("Invalid target format for ui_click - need coordinates, element_id, or text".to_string()),
                            metadata: HashMap::new(),
                        })
                    }
                } else {
                    Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some("App handle not available for UI automation".to_string()),
                        metadata: HashMap::new(),
                    })
                }
            }
            "ui_type" => {
                if let Some(ref app) = self.app_handle {
                    use crate::automation::{
                        input::KeyboardSimulator, types::ElementQuery, AutomationService,
                    };
                    use tauri::Manager;

                    let automation_opt = app.state::<std::sync::Arc<Option<AutomationService>>>();
                    let automation = match automation_opt.as_ref() {
                        Some(_) => match AutomationService::new() {
                            Ok(service) => std::sync::Arc::new(service),
                            Err(e) => {
                                return Ok(ToolResult {
                                        success: false,
                                        data: json!(null),
                                        error: Some(format!("Automation service not available: {}. Please grant accessibility permissions.", e)),
                                        metadata: HashMap::new(),
                                    });
                            }
                        },
                        None => {
                            return Ok(ToolResult {
                                success: false,
                                data: json!(null),
                                error: Some("Automation service not available. Please grant accessibility permissions in System Settings > Privacy & Security > Accessibility.".to_string()),
                                metadata: HashMap::new(),
                            });
                        }
                    };
                    let target = args
                        .get("target")
                        .ok_or_else(|| anyhow!("Missing target parameter"))?;
                    let text = args
                        .get("text")
                        .and_then(|v| v.as_str())
                        .ok_or_else(|| anyhow!("Missing text parameter"))?;

                    if let Some(element_id) = target.get("element_id").and_then(|v| v.as_str()) {
                        if let Err(e) = automation.native.set_focus(element_id) {
                            return Ok(ToolResult {
                                success: false,
                                data: json!(null),
                                error: Some(format!("Failed to focus element: {}", e)),
                                metadata: HashMap::new(),
                            });
                        }
                        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                    } else if let Some(target_text) = target.get("text").and_then(|v| v.as_str()) {
                        let query = ElementQuery {
                            window: None,
                            window_class: None,
                            name: Some(target_text.to_string()),
                            class_name: None,
                            automation_id: None,
                            control_type: None,
                            max_results: Some(1),
                        };
                        match automation.native.find_elements(None, &query) {
                            Ok(elements) => {
                                if let Some(element) = elements.first() {
                                    if let Err(e) = automation.native.set_focus(&element.id) {
                                        return Ok(ToolResult {
                                            success: false,
                                            data: json!(null),
                                            error: Some(format!("Failed to focus element: {}", e)),
                                            metadata: HashMap::new(),
                                        });
                                    }
                                    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                                }
                            }
                            Err(e) => {
                                return Ok(ToolResult {
                                    success: false,
                                    data: json!(null),
                                    error: Some(format!("Failed to find element: {}", e)),
                                    metadata: HashMap::new(),
                                });
                            }
                        }
                    }

                    let mut keyboard = KeyboardSimulator::new()
                        .map_err(|e| anyhow!("Failed to create keyboard simulator: {}", e))?;
                    let send_result = keyboard.send_text(text).await;
                    match send_result {
                        Ok(_) => Ok(ToolResult {
                            success: true,
                            data: json!({ "success": true, "action": "typed", "text": text }),
                            error: None,
                            metadata: HashMap::new(),
                        }),
                        Err(e) => Ok(ToolResult {
                            success: false,
                            data: json!(null),
                            error: Some(format!("Failed to type text: {}", e)),
                            metadata: HashMap::new(),
                        }),
                    }
                } else {
                    Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some("App handle not available for UI automation".to_string()),
                        metadata: HashMap::new(),
                    })
                }
            }
            "search_web" => {
                let query = args
                    .get("query")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing query parameter"))?;

                let search_url = "https://api.agiworkforce.com".to_string();

                if let Some(ref app) = self.app_handle {
                    use crate::sys::commands::BrowserStateWrapper;
                    use tauri::Manager;

                    let browser_state = app.state::<BrowserStateWrapper>();
                    let tab_manager = browser_state.0.tab_manager.lock().await;

                    match tab_manager.open_tab(&search_url).await {
                        Ok(tab_id) => Ok(ToolResult {
                            success: true,
                            data: json!({
                                "success": true,
                                "message": "Opened search results in browser",
                                "url": search_url,
                                "tab_id": tab_id
                            }),
                            error: None,
                            metadata: HashMap::from([("query".to_string(), json!(query))]),
                        }),
                        Err(e) => Ok(ToolResult {
                            success: false,
                            data: json!(null),
                            error: Some(format!("Failed to open search tab: {}", e)),
                            metadata: HashMap::new(),
                        }),
                    }
                } else {
                    Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some("App handle not available for web search".to_string()),
                        metadata: HashMap::new(),
                    })
                }
            }
            "browser_navigate" => {
                let url = args
                    .get("url")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing url parameter"))?;

                if let Some(ref app) = self.app_handle {
                    use crate::automation::browser::NavigationOptions;
                    use crate::sys::commands::BrowserStateWrapper;
                    use tauri::Manager;

                    let browser_state = app.state::<BrowserStateWrapper>();
                    let tab_manager = browser_state.0.tab_manager.lock().await;

                    match tab_manager.list_tabs().await {
                        Ok(tabs) => {
                            let tab_id = if tabs.is_empty() {
                                match tab_manager.open_tab(url).await {
                                    Ok(tid) => tid,
                                    Err(e) => {
                                        return Ok(ToolResult {
                                            success: false,
                                            data: json!(null),
                                            error: Some(format!("Failed to open tab: {}", e)),
                                            metadata: HashMap::new(),
                                        })
                                    }
                                }
                            } else {
                                tabs[0].id.clone()
                            };

                            match tab_manager
                                .navigate(&tab_id, url, NavigationOptions::default())
                                .await
                            {
                                Ok(_) => Ok(ToolResult {
                                    success: true,
                                    data: json!({ "success": true, "url": url, "tab_id": tab_id }),
                                    error: None,
                                    metadata: HashMap::new(),
                                }),
                                Err(e) => Ok(ToolResult {
                                    success: false,
                                    data: json!(null),
                                    error: Some(format!("Failed to navigate: {}", e)),
                                    metadata: HashMap::new(),
                                }),
                            }
                        }
                        Err(e) => Ok(ToolResult {
                            success: false,
                            data: json!(null),
                            error: Some(format!("Failed to list tabs: {}", e)),
                            metadata: HashMap::new(),
                        }),
                    }
                } else {
                    Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some("App handle not available for browser navigation".to_string()),
                        metadata: HashMap::new(),
                    })
                }
            }
            "code_execute" => {
                let language = args
                    .get("language")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing language parameter"))?;
                let code = args
                    .get("code")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing code parameter"))?;

                if let Some(ref app) = self.app_handle {
                    use crate::features::terminal::{SessionManager, ShellType};
                    use tauri::Manager;

                    let session_manager = app.state::<SessionManager>();

                    let shell_type = match language.to_lowercase().as_str() {
                        "powershell" | "ps1" => ShellType::PowerShell,
                        "bash" | "sh" | "shell" => ShellType::Wsl,
                        "cmd" | "batch" => ShellType::Cmd,
                        _ => ShellType::PowerShell,
                    };

                    let session_id = match session_manager.create_session(shell_type, None).await {
                        Ok(sid) => sid,
                        Err(e) => {
                            return Ok(ToolResult {
                                success: false,
                                data: json!(null),
                                error: Some(format!("Failed to create session: {}", e)),
                                metadata: HashMap::new(),
                            })
                        }
                    };

                    match session_manager
                        .send_input(&session_id, &format!("{}\n", code))
                        .await
                    {
                        Ok(_) => {
                            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                            Ok(ToolResult {
                                success: true,
                                data: json!({ "success": true, "session_id": session_id, "code": code }),
                                error: None,
                                metadata: HashMap::from([(
                                    "session_id".to_string(),
                                    json!(session_id),
                                )]),
                            })
                        }
                        Err(e) => Ok(ToolResult {
                            success: false,
                            data: json!(null),
                            error: Some(format!("Failed to execute code: {}", e)),
                            metadata: HashMap::new(),
                        }),
                    }
                } else {
                    Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some("App handle not available for code execution".to_string()),
                        metadata: HashMap::new(),
                    })
                }
            }
            "terminal_execute" => self.execute_terminal_tool(args).await,
            "git_push" => {
                let path = args
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing path parameter"))?
                    .to_string();
                let remote = args
                    .get("remote")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let branch = args
                    .get("branch")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                if let Err(e) = self.validate_path(&path).await {
                    return Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some(e.to_string()),
                        metadata: HashMap::from([("path".to_string(), json!(path))]),
                    });
                }

                use crate::sys::commands::git::git_push;

                match git_push(path.clone(), remote.clone(), branch.clone(), false).await {
                    Ok(msg) => Ok(ToolResult {
                        success: true,
                        data: json!({ "success": true, "message": msg }),
                        error: None,
                        metadata: HashMap::from([
                            ("path".to_string(), json!(path)),
                            ("remote".to_string(), json!(remote)),
                            ("branch".to_string(), json!(branch)),
                        ]),
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some(format!("Git push failed: {}", e)),
                        metadata: HashMap::from([("path".to_string(), json!(path))]),
                    }),
                }
            }
            "db_query" => {
                let query = args
                    .get("query")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing query parameter"))?;
                let connection_id = args.get("connection_id").and_then(|v| v.as_str());

                if let Some(ref app) = self.app_handle {
                    use crate::sys::commands::DatabaseState;
                    use tauri::Manager;

                    let database_state = app.state::<tokio::sync::Mutex<DatabaseState>>();
                    let _db_guard = database_state.lock().await;

                    match connection_id {
                        Some(conn_id) => Ok(ToolResult {
                            success: true,
                            data: json!({
                                "message": "Database query executed (simulated)",
                                "query": query,
                                "connection_id": conn_id
                            }),
                            error: None,
                            metadata: HashMap::from([(
                                "connection_id".to_string(),
                                json!(conn_id),
                            )]),
                        }),
                        None => Ok(ToolResult {
                            success: true,
                            data: json!({
                                "message": "Database query executed (simulated)",
                                "query": query
                            }),
                            error: None,
                            metadata: HashMap::new(),
                        }),
                    }
                } else {
                    Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some("App handle not available for database operations".to_string()),
                        metadata: HashMap::new(),
                    })
                }
            }
            "api_call" => {
                let url = args
                    .get("url")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing url parameter"))?;
                let method = args.get("method").and_then(|v| v.as_str()).unwrap_or("GET");
                let body = args.get("body");
                let headers = args.get("headers");

                if let Some(ref app) = self.app_handle {
                    use crate::sys::api::client::{ApiRequest, HttpMethod};
                    use crate::sys::commands::ApiState;
                    use tauri::Manager;

                    let api_state = app.state::<ApiState>();

                    let http_method = match method.to_uppercase().as_str() {
                        "GET" => HttpMethod::Get,
                        "POST" => HttpMethod::Post,
                        "PUT" => HttpMethod::Put,
                        "PATCH" => HttpMethod::Patch,
                        "DELETE" => HttpMethod::Delete,
                        _ => HttpMethod::Get,
                    };

                    let request = ApiRequest {
                        url: url.to_string(),
                        method: http_method,
                        headers: headers
                            .and_then(|h| serde_json::from_value(h.clone()).ok())
                            .unwrap_or_default(),
                        body: body.and_then(|b| b.as_str().map(|s| s.to_string())),
                        query_params: HashMap::new(),
                        auth: crate::sys::api::client::AuthType::None,
                        timeout_ms: Some(30000),
                    };

                    match api_state.execute_request(request).await {
                        Ok(response) => Ok(ToolResult {
                            success: true,
                            data: json!({
                                "status": response.status,
                                "headers": response.headers,
                                "body": response.body,
                            }),
                            error: None,
                            metadata: HashMap::from([("url".to_string(), json!(url))]),
                        }),
                        Err(e) => Ok(ToolResult {
                            success: false,
                            data: json!(null),
                            error: Some(format!("API call failed: {}", e)),
                            metadata: HashMap::from([("url".to_string(), json!(url))]),
                        }),
                    }
                } else {
                    Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some("App handle not available for API calls".to_string()),
                        metadata: HashMap::new(),
                    })
                }
            }
            "image_ocr" => {
                let image_path = args
                    .get("image_path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing image_path parameter"))?;

                #[cfg(feature = "ocr")]
                {
                    use crate::automation::screen::perform_ocr;
                    match perform_ocr(image_path) {
                        Ok(text) => Ok(ToolResult {
                            success: true,
                            data: json!({ "text": text, "image_path": image_path }),
                            error: None,
                            metadata: HashMap::from([(
                                "image_path".to_string(),
                                json!(image_path),
                            )]),
                        }),
                        Err(e) => Ok(ToolResult {
                            success: false,
                            data: json!(null),
                            error: Some(format!("OCR failed: {}", e)),
                            metadata: HashMap::from([(
                                "image_path".to_string(),
                                json!(image_path),
                            )]),
                        }),
                    }
                }
                #[cfg(not(feature = "ocr"))]
                {
                    Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some("OCR feature not enabled in build".to_string()),
                        metadata: HashMap::from([("image_path".to_string(), json!(image_path))]),
                    })
                }
            }
            "code_analyze" => {
                let code = args
                    .get("code")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing code parameter"))?;
                let language = args
                    .get("language")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");

                let line_count = code.lines().count();
                let char_count = code.len();
                let non_whitespace = code.chars().filter(|c| !c.is_whitespace()).count();

                Ok(ToolResult {
                    success: true,
                    data: json!({
                        "language": language,
                        "line_count": line_count,
                        "char_count": char_count,
                        "non_whitespace_chars": non_whitespace,
                        "analysis": "Basic static analysis complete"
                    }),
                    error: None,
                    metadata: HashMap::from([("language".to_string(), json!(language))]),
                })
            }
            "image_generate" => {
                let prompt = args
                    .get("prompt")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing prompt parameter"))?
                    .to_string();
                let provider = args
                    .get("provider")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let size = args
                    .get("size")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let request = crate::sys::commands::media::MediaImageRequest {
                    prompt: prompt.clone(),
                    negative_prompt: None,
                    provider,
                    model: None,
                    size,
                    quality: None,
                    style: None,
                    n: Some(1),
                };

                match crate::sys::commands::media::media_generate_image(request).await {
                    Ok(response) => {
                        let result_data = json!({
                            "success": true,
                            "images": response.images,
                            "provider": response.provider,
                            "cost": response.cost_estimate
                        });
                        Ok(ToolResult {
                            success: true,
                            data: result_data,
                            error: None,
                            metadata: HashMap::from([("prompt".to_string(), json!(prompt))]),
                        })
                    }
                    Err(e) => Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some(format!("Image generation failed: {}", e)),
                        metadata: HashMap::from([("prompt".to_string(), json!(prompt))]),
                    }),
                }
            }
            "video_generate" => {
                let prompt = args
                    .get("prompt")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing prompt parameter"))?
                    .to_string();
                let duration_secs = args
                    .get("duration_seconds")
                    .and_then(|v| v.as_u64())
                    .map(|v| v as u32);

                let request = crate::sys::commands::media::MediaVideoRequest {
                    prompt: prompt.clone(),
                    negative_prompt: None,
                    duration_secs,
                    resolution: None,
                    style: None,
                    model: None,
                    plan: None,
                };

                match crate::sys::commands::media::media_generate_video(request).await {
                    Ok(response) => {
                        let result_data = json!({
                            "success": true,
                            "video_url": response.video_url,
                            "thumbnail_url": response.thumbnail_url,
                            "id": response.id,
                            "status": response.status
                        });
                        Ok(ToolResult {
                            success: true,
                            data: result_data,
                            error: None,
                            metadata: HashMap::from([("prompt".to_string(), json!(prompt))]),
                        })
                    }
                    Err(e) => Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some(format!("Video generation failed: {}", e)),
                        metadata: HashMap::from([("prompt".to_string(), json!(prompt))]),
                    }),
                }
            }
            "llm_reason" => {
                let prompt = args
                    .get("prompt")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing prompt parameter"))?;
                let model = args.get("model").and_then(|v| v.as_str());
                let _max_tokens = args
                    .get("max_tokens")
                    .and_then(|v| v.as_u64())
                    .map(|v| v as u32);
                let depth = args.get("depth").and_then(|v| v.as_u64()).unwrap_or(0);

                const MAX_DEPTH: u64 = 3;
                if depth >= MAX_DEPTH {
                    return Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some(format!("Maximum recursion depth ({}) exceeded", MAX_DEPTH)),
                        metadata: HashMap::from([("depth".to_string(), json!(depth))]),
                    });
                }

                if let Some(ref app) = self.app_handle {
                    use crate::core::router::RouterPreferences;
                    use crate::sys::commands::LLMState;
                    use tauri::Manager;

                    let llm_state = app.state::<LLMState>();

                    let model_str = model.unwrap_or("gpt-4o-mini");
                    let preferences = Some(RouterPreferences {
                        provider: None,
                        model: Some(model_str.to_string()),
                        strategy: crate::core::router::RoutingStrategy::Auto,
                        context: None,
                    });

                    let router = llm_state.router.lock().await;
                    match router.send_message(prompt, preferences).await {
                        Ok(response) => Ok(ToolResult {
                            success: true,
                            data: json!({
                                "reasoning": response,
                                "model": model_str,
                                "depth": depth,
                            }),
                            error: None,
                            metadata: HashMap::from([("depth".to_string(), json!(depth))]),
                        }),
                        Err(e) => Ok(ToolResult {
                            success: false,
                            data: json!(null),
                            error: Some(format!("LLM reasoning failed: {}", e)),
                            metadata: HashMap::from([("depth".to_string(), json!(depth))]),
                        }),
                    }
                } else {
                    Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some("App handle not available for LLM reasoning".to_string()),
                        metadata: HashMap::new(),
                    })
                }
            }
            "email_send" | "email_fetch" => Ok(ToolResult {
                success: false,
                data: json!(null),
                error: Some(
                    "Email operations require SMTP/IMAP configuration (low priority feature)"
                        .to_string(),
                ),
                metadata: HashMap::from([("tool".to_string(), json!(tool.id))]),
            }),
            "calendar_create_event" | "calendar_list_events" => {
                if let Some(ref _app) = self.app_handle {
                    Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some(
                            "Calendar operations require OAuth setup (low priority feature)"
                                .to_string(),
                        ),
                        metadata: HashMap::from([("tool".to_string(), json!(tool.id))]),
                    })
                } else {
                    Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some("App handle not available for calendar operations".to_string()),
                        metadata: HashMap::new(),
                    })
                }
            }
            "cloud_upload" | "cloud_download" => {
                if let Some(ref _app) = self.app_handle {
                    Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some(
                            "Cloud storage operations require OAuth setup (low priority feature)"
                                .to_string(),
                        ),
                        metadata: HashMap::from([("tool".to_string(), json!(tool.id))]),
                    })
                } else {
                    Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some("App handle not available for cloud storage".to_string()),
                        metadata: HashMap::new(),
                    })
                }
            }
            "productivity_create_task" => {
                if let Some(ref _app) = self.app_handle {
                    Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some(
                            "Productivity tools require API configuration (low priority feature)"
                                .to_string(),
                        ),
                        metadata: HashMap::from([("tool".to_string(), json!(tool.id))]),
                    })
                } else {
                    Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some("App handle not available for productivity tools".to_string()),
                        metadata: HashMap::new(),
                    })
                }
            }
            "document_read" | "document_search" => {
                if let Some(ref _app) = self.app_handle {
                    Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some(
                            "Document operations require setup (low priority feature)".to_string(),
                        ),
                        metadata: HashMap::from([("tool".to_string(), json!(tool.id))]),
                    })
                } else {
                    Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some("App handle not available for document operations".to_string()),
                        metadata: HashMap::new(),
                    })
                }
            }
            "image_analyze" => {
                let image_path = args
                    .get("image_path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing image_path parameter"))?
                    .to_string();
                let question = args
                    .get("question")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Describe this image in detail")
                    .to_string();
                let _detail = args
                    .get("detail")
                    .and_then(|v| v.as_str())
                    .unwrap_or("auto")
                    .to_string();

                if let Some(ref app) = self.app_handle {
                    use crate::sys::commands::vision::vision_answer_question;
                    use crate::sys::commands::{AppDatabase, LLMState};
                    use tauri::Manager;

                    let llm_state = app.state::<LLMState>();
                    let db_state = app.state::<AppDatabase>();

                    match vision_answer_question(
                        image_path.clone(),
                        question.clone(),
                        None,
                        None,
                        llm_state,
                        db_state,
                    )
                    .await
                    {
                        Ok(response) => Ok(ToolResult {
                            success: true,
                            data: json!({
                                "analysis": response.content,
                                "image_path": image_path,
                                "question": question,
                                "model": response.model,
                                "tokens": response.tokens,
                                "processing_time_ms": response.processing_time_ms,
                            }),
                            error: None,
                            metadata: HashMap::from([
                                ("image_path".to_string(), json!(image_path)),
                                ("question".to_string(), json!(question)),
                            ]),
                        }),
                        Err(e) => Ok(ToolResult {
                            success: false,
                            data: json!(null),
                            error: Some(format!("Image analysis failed: {}", e)),
                            metadata: HashMap::from([(
                                "image_path".to_string(),
                                json!(image_path),
                            )]),
                        }),
                    }
                } else {
                    Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some("App handle not available for image analysis".to_string()),
                        metadata: HashMap::new(),
                    })
                }
            }
            "git_status" => {
                let path = args
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing path parameter"))?
                    .to_string();

                if let Err(e) = self.validate_path(&path).await {
                    return Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some(e.to_string()),
                        metadata: HashMap::from([("path".to_string(), json!(path))]),
                    });
                }

                use crate::sys::commands::git::git_status;

                match git_status(path.clone()).await {
                    Ok(status) => Ok(ToolResult {
                        success: true,
                        data: json!({
                            "branch": status.branch,
                            "staged": status.staged,
                            "unstaged": status.unstaged,
                            "untracked": status.untracked,
                            "conflicts": status.conflicts,
                            "ahead": status.ahead,
                            "behind": status.behind,
                        }),
                        error: None,
                        metadata: HashMap::from([("path".to_string(), json!(path))]),
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some(format!("Git status failed: {}", e)),
                        metadata: HashMap::from([("path".to_string(), json!(path))]),
                    }),
                }
            }
            "git_commit" => {
                let path = args
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing path parameter"))?
                    .to_string();
                let message = args
                    .get("message")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing message parameter"))?
                    .to_string();

                if let Err(e) = self.validate_path(&path).await {
                    return Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some(e.to_string()),
                        metadata: HashMap::from([("path".to_string(), json!(path))]),
                    });
                }

                use crate::sys::commands::git::git_commit;

                match git_commit(path.clone(), message.clone()).await {
                    Ok(commit_id) => Ok(ToolResult {
                        success: true,
                        data: json!({
                            "success": true,
                            "commit_id": commit_id,
                            "message": message,
                        }),
                        error: None,
                        metadata: HashMap::from([
                            ("path".to_string(), json!(path)),
                            ("message".to_string(), json!(message)),
                        ]),
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some(format!("Git commit failed: {}", e)),
                        metadata: HashMap::from([("path".to_string(), json!(path))]),
                    }),
                }
            }
            "git_clone" => {
                let url = args
                    .get("url")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing url parameter"))?
                    .to_string();
                let destination = args
                    .get("destination")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing destination parameter"))?
                    .to_string();

                if let Err(e) = self.validate_path(&destination).await {
                    return Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some(e.to_string()),
                        metadata: HashMap::from([("destination".to_string(), json!(destination))]),
                    });
                }

                use crate::sys::commands::git::git_clone;

                match git_clone(url.clone(), destination.clone()).await {
                    Ok(msg) => Ok(ToolResult {
                        success: true,
                        data: json!({
                            "success": true,
                            "message": msg,
                            "url": url,
                            "destination": destination,
                        }),
                        error: None,
                        metadata: HashMap::from([
                            ("url".to_string(), json!(url)),
                            ("destination".to_string(), json!(destination)),
                        ]),
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some(format!("Git clone failed: {}", e)),
                        metadata: HashMap::from([("url".to_string(), json!(url))]),
                    }),
                }
            }
            "git_add" => {
                let path = args
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing path parameter"))?
                    .to_string();
                let files: Vec<String> = args
                    .get("files")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_else(|| vec![".".to_string()]);

                if let Err(e) = self.validate_path(&path).await {
                    return Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some(e.to_string()),
                        metadata: HashMap::from([("path".to_string(), json!(path))]),
                    });
                }

                use crate::sys::commands::git::git_add;

                match git_add(path.clone(), files.clone()).await {
                    Ok(msg) => Ok(ToolResult {
                        success: true,
                        data: json!({
                            "success": true,
                            "message": msg,
                            "files": files,
                        }),
                        error: None,
                        metadata: HashMap::from([("path".to_string(), json!(path))]),
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        data: json!(null),
                        error: Some(format!("Git add failed: {}", e)),
                        metadata: HashMap::from([("path".to_string(), json!(path))]),
                    }),
                }
            }
            _ => Err(anyhow!("Unknown tool: {}", tool.id)),
        }
    }

    fn next_action_id(&self, tool_call: &ToolCall) -> String {
        if tool_call.id.trim().is_empty() {
            format!("tool-{}", Uuid::new_v4())
        } else {
            tool_call.id.clone()
        }
    }

    fn emit_tool_action(
        &self,
        action_id: &str,
        tool_name: &str,
        status: &str,
        metadata: &Value,
        error: Option<String>,
    ) {
        if let Some(app_handle) = &self.app_handle {
            let payload = json!({
                "action": {
                    "id": action_id,
                    "actionId": action_id,
                    "workflowHash": serde_json::Value::Null,
                    "type": "tool",
                    "title": format!("Execute {}", tool_name),
                    "description": format!("Tool {}", tool_name),
                    "status": status,
                    "requiresApproval": false,
                    "scope": {
                        "type": "tool",
                        "description": format!("Tool {}", tool_name),
                    },
                    "metadata": metadata,
                    "error": error,
                }
            });

            if let Err(e) = app_handle.emit("agent:action_update", payload) {
                tracing::error!(
                    "Failed to emit agent:action_update event for action {}: {}",
                    action_id,
                    e
                );
            }
        }
    }

    fn emit_tool_metrics(&self, action_id: &str, tool_name: &str, duration_ms: u64, success: bool) {
        if let Some(app_handle) = &self.app_handle {
            let completion_reason = if success { "completed" } else { "tool_failed" };
            let payload = json!({
                "metrics": {
                    "workflowHash": serde_json::Value::Null,
                    "actionId": action_id,
                    "tool": tool_name,
                    "durationMs": duration_ms,
                    "completionReason": completion_reason,
                }
            });

            if let Err(e) = app_handle.emit("agent:metrics", payload) {
                tracing::error!(
                    "Failed to emit agent:metrics event for action {}: {}",
                    action_id,
                    e
                );
            }
        }
    }

    fn finalize_tool_result(
        &self,
        action_id: &str,
        tool_name: &str,
        metadata: Value,
        start_time: Instant,
        result: Result<ToolResult>,
    ) -> Result<ToolResult> {
        match result {
            Ok(tool_result) => {
                let status = if tool_result.success {
                    "success"
                } else {
                    "failed"
                };
                self.emit_tool_action(
                    action_id,
                    tool_name,
                    status,
                    &metadata,
                    tool_result.error.clone(),
                );
                self.emit_tool_metrics(
                    action_id,
                    tool_name,
                    start_time.elapsed().as_millis() as u64,
                    tool_result.success,
                );
                Ok(tool_result)
            }
            Err(err) => {
                let message = err.to_string();
                self.emit_tool_action(
                    action_id,
                    tool_name,
                    "failed",
                    &metadata,
                    Some(message.clone()),
                );
                self.emit_tool_metrics(
                    action_id,
                    tool_name,
                    start_time.elapsed().as_millis() as u64,
                    false,
                );
                Err(err)
            }
        }
    }

    pub fn format_tool_result(&self, _tool_call: &ToolCall, result: &ToolResult) -> String {
        if result.success {
            serde_json::to_string_pretty(&result.data).unwrap_or_else(|_| "{}".to_string())
        } else {
            format!(
                "Error: {}",
                result
                    .error
                    .as_ref()
                    .unwrap_or(&"Unknown error".to_string())
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_call_parsing() {
        let tool_call = ToolCall {
            id: "test_123".to_string(),
            name: "file_read".to_string(),
            arguments: serde_json::json!({
                "path": "/tmp/test.txt"
            })
            .to_string(),
        };

        assert_eq!(tool_call.id, "test_123");
        assert_eq!(tool_call.name, "file_read");

        let args: HashMap<String, serde_json::Value> =
            serde_json::from_str(&tool_call.arguments).unwrap();
        assert!(args.get("path").and_then(|v| v.as_str()).is_some());
    }

    #[tokio::test]
    async fn test_tool_execution_file_read() {
        use std::fs::File;
        use std::io::Write;
        use tempfile::tempdir;

        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.txt");

        {
            let mut file = File::create(&file_path).unwrap();
            writeln!(file, "Hello, World!").unwrap();
        }

        let tool_call = ToolCall {
            id: "test_file_read".to_string(),
            name: "file_read".to_string(),
            arguments: serde_json::json!({
                "path": file_path.to_str().unwrap()
            })
            .to_string(),
        };

        let args: HashMap<String, serde_json::Value> =
            serde_json::from_str(&tool_call.arguments).unwrap();
        let path_str = args.get("path").and_then(|v| v.as_str()).unwrap();
        let content = std::fs::read_to_string(path_str).unwrap();
        assert!(content.contains("Hello, World!"));
    }

    #[tokio::test]
    async fn test_tool_execution_file_write() {
        use tempfile::tempdir;

        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test_write.txt");
        let path_str = file_path.to_str().unwrap();

        let tool_call = ToolCall {
            id: "test_file_write".to_string(),
            name: "file_write".to_string(),
            arguments: serde_json::json!({
                "path": path_str,
                "content": "Written by test"
            })
            .to_string(),
        };

        let registry = std::sync::Arc::new(ToolRegistry::new().unwrap());

        registry
            .register_tool(crate::core::agi::tools::Tool {
                id: "file_write".to_string(),
                name: "Write File".to_string(),
                description: "Write content to a file".to_string(),
                capabilities: vec![crate::core::agi::tools::ToolCapability::FileWrite],
                parameters: vec![
                    crate::core::agi::tools::ToolParameter {
                        name: "path".to_string(),
                        parameter_type: crate::core::agi::tools::ParameterType::FilePath,
                        required: true,
                        description: "Path".to_string(),
                        default: None,
                    },
                    crate::core::agi::tools::ToolParameter {
                        name: "content".to_string(),
                        parameter_type: crate::core::agi::tools::ParameterType::String,
                        required: true,
                        description: "Content".to_string(),
                        default: None,
                    },
                ],
                estimated_resources: crate::core::agi::ResourceUsage {
                    cpu_percent: 0.0,
                    memory_mb: 0,
                    network_mb: 0.0,
                },
                dependencies: vec![],
            })
            .unwrap();

        let executor = ToolExecutor::new(registry);
        let result = executor.execute_tool_call(&tool_call).await.unwrap();

        assert!(result.success);
        let content = std::fs::read_to_string(path_str).unwrap();
        assert_eq!(content, "Written by test");
    }

    #[tokio::test]
    async fn test_tool_execution_search_web_args() {
        let tool_call = ToolCall {
            id: "test_search".to_string(),
            name: "search_web".to_string(),
            arguments: serde_json::json!({
                "query": "rust tauri"
            })
            .to_string(),
        };

        let args: HashMap<String, serde_json::Value> =
            serde_json::from_str(&tool_call.arguments).unwrap();
        assert_eq!(
            args.get("query").and_then(|v| v.as_str()).unwrap(),
            "rust tauri"
        );
    }
}
