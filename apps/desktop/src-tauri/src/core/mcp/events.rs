use serde::{Deserialize, Serialize};
use tauri::Emitter;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum McpEvent {
    ServerConnectionChanged {
        server_name: String,
        connected: bool,
        error: Option<String>,
    },

    ToolsUpdated {
        server_name: String,
        tool_count: usize,
    },

    ToolExecutionStarted {
        tool_id: String,
        server_name: String,
    },

    ToolExecutionCompleted {
        tool_id: String,
        server_name: String,
        success: bool,
        duration_ms: u64,
    },

    SystemInitialized {
        server_count: usize,
        tool_count: usize,
    },

    ConfigurationUpdated {
        servers_enabled: Vec<String>,
    },
}

impl McpEvent {
    pub fn event_name(&self) -> &'static str {
        match self {
            Self::ServerConnectionChanged { .. } => "mcp:connection_changed",
            Self::ToolsUpdated { .. } => "mcp:tools_updated",
            Self::ToolExecutionStarted { .. } => "mcp:tool_execution_started",
            Self::ToolExecutionCompleted { .. } => "mcp:tool_execution_completed",
            Self::SystemInitialized { .. } => "mcp:system_initialized",
            Self::ConfigurationUpdated { .. } => "mcp:configuration_updated",
        }
    }
}

pub fn emit_mcp_event(app_handle: &tauri::AppHandle, event: McpEvent) {
    let event_name = event.event_name();
    if let Err(e) = app_handle.emit(event_name, &event) {
        tracing::error!("[MCP] Failed to emit event {}: {}", event_name, e);
    } else {
        tracing::debug!("[MCP] Emitted event: {}", event_name);
    }
}
