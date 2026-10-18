use std::sync::Arc;

use tauri::State;
use tokio::sync::Mutex;

use crate::core::mcp::server::McpHttpServer;
use crate::sys::native_confirm::{ConfirmGate, NativeConfirm};

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

/// The auth token is redacted so it never reaches the frontend JavaScript
/// context.
#[tauri::command]
pub async fn mcp_server_get_config(
    state: State<'_, McpServerState>,
) -> Result<serde_json::Value, String> {
    let server = state.server.lock().await;
    let token = server.auth.token();
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

/// One reveal question at a time, with a growing wait after each no.
static TOKEN_REVEALS: ConfirmGate = ConfirmGate::new();

/// The full auth token, for a client the person is setting up by hand. Anyone
/// holding it can call the enabled tools, so it leaves Rust only after a yes in
/// a native dialog the page cannot answer for itself.
#[tauri::command]
pub async fn mcp_server_reveal_token(
    app: tauri::AppHandle,
    state: State<'_, McpServerState>,
) -> Result<String, String> {
    let confirmed = TOKEN_REVEALS
        .confirm(
            &app,
            "reveal-mcp-server-token",
            NativeConfirm {
                title: "Copy the MCP server token?".to_string(),
                body: "Any program on this computer that has this token can use the tools you enabled for the MCP server, as you, until the app restarts.".to_string(),
                confirm_label: "Copy Token".to_string(),
            },
        )
        .await
        .map_err(|held| held.message())?;
    if !confirmed {
        return Err("The token was not revealed.".to_string());
    }
    Ok(state.server.lock().await.auth.token().to_string())
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
