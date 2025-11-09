use serde::{Deserialize, Serialize};
use tauri::Emitter;

/// MCP Event types for real-time UI updates
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum McpEvent {
    /// Server connection state changed
    ServerConnectionChanged {
        server_name: String,
        connected: bool,
        error: Option<String>,
    },
    /// Server tool list updated
    ToolsUpdated {
        server_name: String,
        tool_count: usize,
    },
    /// Tool execution started
    ToolExecutionStarted {
        tool_id: String,
        server_name: String,
    },
    /// Tool execution completed
    ToolExecutionCompleted {
        tool_id: String,
        server_name: String,
        success: bool,
        duration_ms: u64,
    },
    /// MCP system initialized
    SystemInitialized {
        server_count: usize,
        tool_count: usize,
    },
    /// Configuration updated
    ConfigurationUpdated { servers_enabled: Vec<String> },
}

impl McpEvent {
    /// Get the event name for Tauri event emission
    pub fn event_name(&self) -> &'static str {
        match self {
            Self::ServerConnectionChanged { .. } => "mcp://server-connection-changed",
            Self::ToolsUpdated { .. } => "mcp://tools-updated",
            Self::ToolExecutionStarted { .. } => "mcp://tool-execution-started",
            Self::ToolExecutionCompleted { .. } => "mcp://tool-execution-completed",
            Self::SystemInitialized { .. } => "mcp://system-initialized",
            Self::ConfigurationUpdated { .. } => "mcp://configuration-updated",
        }
    }
}

/// Emit an MCP event to the frontend
pub fn emit_mcp_event(app_handle: &tauri::AppHandle, event: McpEvent) {
    let event_name = event.event_name();
    if let Err(e) = app_handle.emit(event_name, &event) {
        tracing::error!("[MCP] Failed to emit event {}: {}", event_name, e);
    } else {
        tracing::debug!("[MCP] Emitted event: {}", event_name);
    }
}
