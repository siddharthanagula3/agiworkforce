/// Frontend event emission module
///
/// This module provides functions to emit events to the Tauri frontend
/// for real-time updates to the UI. These events are consumed by the
/// useAgenticEvents hook in the React application.
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};

/// File operation types matching frontend TypeScript enum
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FileOperationType {
    Read,
    Write,
    Create,
    Delete,
    Move,
    Rename,
}

/// File operation event payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileOperation {
    pub id: String,
    #[serde(rename = "type")]
    pub op_type: FileOperationType,
    #[serde(rename = "filePath")]
    pub file_path: String,
    #[serde(rename = "oldContent")]
    pub old_content: Option<String>,
    #[serde(rename = "newContent")]
    pub new_content: Option<String>,
    #[serde(rename = "sizeBytes")]
    pub size_bytes: Option<usize>,
    pub success: bool,
    pub error: Option<String>,
    #[serde(rename = "sessionId")]
    pub session_id: Option<String>,
    #[serde(rename = "agentId")]
    pub agent_id: Option<String>,
    #[serde(rename = "goalId")]
    pub goal_id: Option<String>,
}

/// Terminal command event payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalCommand {
    pub id: String,
    pub command: String,
    pub cwd: String,
    #[serde(rename = "exitCode")]
    pub exit_code: Option<i32>,
    pub stdout: Option<String>,
    pub stderr: Option<String>,
    pub duration: Option<u64>, // milliseconds
    #[serde(rename = "sessionId")]
    pub session_id: Option<String>,
    #[serde(rename = "agentId")]
    pub agent_id: Option<String>,
}

/// Tool execution event payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolExecution {
    pub id: String,
    #[serde(rename = "toolName")]
    pub tool_name: String,
    pub input: serde_json::Value,
    pub output: Option<serde_json::Value>,
    pub error: Option<String>,
    pub duration: u64, // milliseconds
    pub success: bool,
}

/// Screenshot event payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Screenshot {
    pub id: String,
    #[serde(rename = "imageBase64")]
    pub image_base64: String,
    pub action: Option<String>,
    #[serde(rename = "elementBounds")]
    pub element_bounds: Option<ElementBounds>,
    pub confidence: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementBounds {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// Emit file operation event to frontend
pub fn emit_file_operation(app_handle: &AppHandle, operation: FileOperation) {
    if let Err(e) = app_handle.emit(
        "agi:file_operation",
        serde_json::json!({ "operation": operation }),
    ) {
        tracing::error!("[Events] Failed to emit file operation event: {}", e);
    } else {
        tracing::debug!(
            "[Events] Emitted file operation: {:?} {}",
            operation.op_type,
            operation.file_path
        );
    }
}

/// Emit terminal command event to frontend
pub fn emit_terminal_command(app_handle: &AppHandle, command: TerminalCommand) {
    if let Err(e) = app_handle.emit(
        "agi:terminal_command",
        serde_json::json!({ "command": command }),
    ) {
        tracing::error!("[Events] Failed to emit terminal command event: {}", e);
    } else {
        tracing::debug!("[Events] Emitted terminal command: {}", command.command);
    }
}

/// Emit tool execution event to frontend
pub fn emit_tool_execution(app_handle: &AppHandle, execution: ToolExecution) {
    if let Err(e) = app_handle.emit(
        "agi:tool_execution",
        serde_json::json!({ "execution": execution }),
    ) {
        tracing::error!("[Events] Failed to emit tool execution event: {}", e);
    } else {
        tracing::debug!("[Events] Emitted tool execution: {}", execution.tool_name);
    }
}

/// Emit screenshot event to frontend
pub fn emit_screenshot(app_handle: &AppHandle, screenshot: Screenshot) {
    if let Err(e) = app_handle.emit(
        "agi:screenshot",
        serde_json::json!({ "screenshot": screenshot }),
    ) {
        tracing::error!("[Events] Failed to emit screenshot event: {}", e);
    } else {
        tracing::debug!("[Events] Emitted screenshot: {}", screenshot.id);
    }
}

/// Helper to create file operation event for file read
pub fn create_file_read_event(
    file_path: &str,
    content: &str,
    success: bool,
    error: Option<String>,
    session_id: Option<String>,
) -> FileOperation {
    FileOperation {
        id: uuid::Uuid::new_v4().to_string(),
        op_type: FileOperationType::Read,
        file_path: file_path.to_string(),
        old_content: None,
        new_content: Some(content.to_string()),
        size_bytes: Some(content.len()),
        success,
        error,
        session_id,
        agent_id: None,
        goal_id: None,
    }
}

/// Helper to create file operation event for file write
pub fn create_file_write_event(
    file_path: &str,
    old_content: Option<&str>,
    new_content: &str,
    success: bool,
    error: Option<String>,
    session_id: Option<String>,
) -> FileOperation {
    FileOperation {
        id: uuid::Uuid::new_v4().to_string(),
        op_type: FileOperationType::Write,
        file_path: file_path.to_string(),
        old_content: old_content.map(|s| s.to_string()),
        new_content: Some(new_content.to_string()),
        size_bytes: Some(new_content.len()),
        success,
        error,
        session_id,
        agent_id: None,
        goal_id: None,
    }
}

/// Helper to create tool execution event
pub fn create_tool_execution_event(
    tool_name: &str,
    input: &HashMap<String, serde_json::Value>,
    output: Option<serde_json::Value>,
    error: Option<String>,
    duration_ms: u64,
    success: bool,
) -> ToolExecution {
    ToolExecution {
        id: uuid::Uuid::new_v4().to_string(),
        tool_name: tool_name.to_string(),
        input: serde_json::to_value(input).unwrap_or(serde_json::json!({})),
        output,
        error,
        duration: duration_ms,
        success,
    }
}

/// Approval request event payload matching frontend ApprovalRequest interface
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalRequestPayload {
    pub id: String,
    #[serde(rename = "type")]
    pub request_type: String,
    pub description: String,
    pub impact: Option<String>,
    #[serde(rename = "riskLevel")]
    pub risk_level: String,
    pub status: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "approvedAt")]
    pub approved_at: Option<String>,
    #[serde(rename = "rejectedAt")]
    pub rejected_at: Option<String>,
    #[serde(rename = "rejectionReason")]
    pub rejection_reason: Option<String>,
    #[serde(rename = "timeoutSeconds")]
    pub timeout_seconds: Option<i64>,
    pub details: Option<serde_json::Value>,
}

/// Emit approval request event to frontend
pub fn emit_approval_request(app_handle: &AppHandle, approval: ApprovalRequestPayload) {
    if let Err(e) = app_handle.emit(
        "agi:approval_required",
        serde_json::json!({ "approval": approval }),
    ) {
        tracing::error!("[Events] Failed to emit approval request event: {}", e);
    } else {
        tracing::debug!(
            "[Events] Emitted approval request: {} ({})",
            approval.id,
            approval.request_type
        );
    }
}
