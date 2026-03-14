use std::sync::Arc;

use tauri::State;
use tokio::sync::Mutex;

use crate::core::mcp::server::McpHttpServer;

pub struct McpServerState {
    pub server: Arc<Mutex<McpHttpServer>>,
}

impl McpServerState {
    pub fn new(port: u16, app_handle: tauri::AppHandle) -> Self {
        Self {
            server: Arc::new(Mutex::new(McpHttpServer::new(port, app_handle))),
        }
    }
}

#[tauri::command]
pub async fn mcp_server_start(state: State<'_, McpServerState>) -> Result<(), String> {
    let mut server = state.server.lock().await;
    if server.is_running() {
        return Ok(());
    }
    server.start().await
}

#[tauri::command]
pub async fn mcp_server_stop(state: State<'_, McpServerState>) -> Result<(), String> {
    state.server.lock().await.stop();
    Ok(())
}

#[tauri::command]
pub async fn mcp_server_status(state: State<'_, McpServerState>) -> Result<bool, String> {
    Ok(state.server.lock().await.is_running())
}

/// Bug #89 fix: Redact the auth token from the IPC response so it is
/// never exposed to the frontend JavaScript context.
#[tauri::command]
pub async fn mcp_server_get_config(
    state: State<'_, McpServerState>,
) -> Result<serde_json::Value, String> {
    let server = state.server.lock().await;
    let token = server.auth.token();
    // Show only the last 4 characters, mask the rest
    let redacted = if token.len() > 4 {
        format!(
            "{}...{}",
            &"*".repeat(token.len() - 4),
            &token[token.len() - 4..]
        )
    } else {
        "*".repeat(token.len())
    };
    Ok(serde_json::json!({
        "port": server.port,
        "token": redacted,
        "enabled_tools": *server.enabled_tools.lock(),
        "running": server.is_running(),
    }))
}

#[tauri::command]
pub async fn mcp_server_update_config(
    port: Option<u16>,
    enabled_tools: Option<Vec<String>>,
    state: State<'_, McpServerState>,
) -> Result<(), String> {
    let mut server = state.server.lock().await;
    if let Some(tools) = enabled_tools {
        *server.enabled_tools.lock() = tools;
    }
    if let Some(p) = port {
        if server.is_running() {
            return Err("Stop the server before changing port".to_string());
        }
        server.port = p;
    }
    Ok(())
}

#[tauri::command]
pub async fn mcp_server_list_tools(
    state: State<'_, McpServerState>,
) -> Result<serde_json::Value, String> {
    use crate::core::mcp::server::tools::McpServerToolRegistry;
    let server = state.server.lock().await;
    let tools = McpServerToolRegistry::list_tools(&server.enabled_tools.lock());
    Ok(serde_json::json!({ "tools": tools }))
}
