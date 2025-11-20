use crate::mcp::{
    emit_mcp_event, McpClient, McpEvent, McpHealthMonitor, McpServersConfig, McpToolRegistry,
};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tauri::State;

/// MCP state managed by Tauri
pub struct McpState {
    pub client: Arc<McpClient>,
    pub registry: Arc<McpToolRegistry>,
    pub config: Arc<Mutex<McpServersConfig>>,
    pub health_monitor: Arc<McpHealthMonitor>,
}

impl McpState {
    pub fn new() -> Self {
        let client = Arc::new(McpClient::new());
        let registry = Arc::new(McpToolRegistry::new(client.clone()));
        let config = Arc::new(Mutex::new(McpServersConfig::default()));
        let health_monitor = Arc::new(McpHealthMonitor::new(client.clone()));

        Self {
            client,
            registry,
            config,
            health_monitor,
        }
    }

    /// Start health monitoring with app handle
    pub fn start_health_monitoring(&self, app_handle: tauri::AppHandle) {
        let monitor = self.health_monitor.clone();
        monitor.start_monitoring(std::time::Duration::from_secs(30), app_handle);
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct McpServerInfo {
    pub name: String,
    pub enabled: bool,
    pub connected: bool,
    pub tool_count: usize,
    pub command: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct McpToolInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub server: String,
    pub parameters: Vec<String>,
}

/// Initialize MCP system and load configuration
#[tauri::command]
pub async fn mcp_initialize(
    state: State<'_, McpState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    tracing::info!("Initializing MCP system");

    // Load configuration from file
    let config_path = McpServersConfig::default_config_path()
        .map_err(|e| format!("Failed to get config path: {}", e))?;

    let mut config = if config_path.exists() {
        McpServersConfig::from_file(&config_path)
            .await
            .map_err(|e| format!("Failed to load MCP config: {}", e))?
    } else {
        // Create default configuration
        let default_config = McpServersConfig::default();
        default_config
            .save_to_file(&config_path)
            .await
            .map_err(|e| format!("Failed to save default config: {}", e))?;
        default_config
    };

    // Inject credentials from credential manager
    config
        .inject_credentials()
        .map_err(|e| format!("Failed to inject credentials: {}", e))?;

    // Store configuration
    *state.config.lock() = config.clone();

    // Connect to enabled servers
    let mut connected_count = 0;
    let mut total_tools = 0;
    for (name, server_config) in &config.mcp_servers {
        if server_config.enabled {
            match state
                .client
                .connect_server(name.clone(), server_config.clone())
                .await
            {
                Ok(_) => {
                    connected_count += 1;
                    tracing::info!("Connected to MCP server: {}", name);

                    // Emit connection event
                    emit_mcp_event(
                        &app,
                        McpEvent::ServerConnectionChanged {
                            server_name: name.clone(),
                            connected: true,
                            error: None,
                        },
                    );

                    // Count tools
                    if let Ok(tools) = state.client.list_server_tools(name) {
                        total_tools += tools.len();
                        emit_mcp_event(
                            &app,
                            McpEvent::ToolsUpdated {
                                server_name: name.clone(),
                                tool_count: tools.len(),
                            },
                        );
                    }
                }
                Err(e) => {
                    tracing::warn!("Failed to connect to MCP server '{}': {}", name, e);
                    emit_mcp_event(
                        &app,
                        McpEvent::ServerConnectionChanged {
                            server_name: name.clone(),
                            connected: false,
                            error: Some(e.to_string()),
                        },
                    );
                }
            }
        }
    }

    // Emit system initialized event
    emit_mcp_event(
        &app,
        McpEvent::SystemInitialized {
            server_count: connected_count,
            tool_count: total_tools,
        },
    );

    // Start health monitoring
    state.start_health_monitoring(app);

    Ok(format!(
        "MCP initialized. Connected to {} server(s) with {} tool(s)",
        connected_count, total_tools
    ))
}

/// Get list of all MCP servers (configured and connected)
#[tauri::command]
pub async fn mcp_list_servers(state: State<'_, McpState>) -> Result<Vec<McpServerInfo>, String> {
    let config = state.config.lock();
    let stats = state.client.get_stats();
    let connected: HashSet<String> = state
        .client
        .get_connected_servers()
        .into_iter()
        .collect();

    let servers: Vec<McpServerInfo> = config
        .mcp_servers
        .iter()
        .map(|(name, server_config)| McpServerInfo {
            name: name.clone(),
            enabled: server_config.enabled,
             connected: connected.contains(name),
            tool_count: stats.get(name).copied().unwrap_or(0),
            command: format!("{} {}", server_config.command, server_config.args.join(" ")),
        })
        .collect();

    Ok(servers)
}

/// Connect to an MCP server
#[tauri::command]
pub async fn mcp_connect_server(
    state: State<'_, McpState>,
    name: String,
) -> Result<String, String> {
    let config = state.config.lock().clone();

    let server_config = config
        .mcp_servers
        .get(&name)
        .ok_or_else(|| format!("Server '{}' not found in configuration", name))?
        .clone();

    state
        .client
        .connect_server(name.clone(), server_config)
        .await
        .map_err(|e| format!("Failed to connect: {}", e))?;

    Ok(format!("Connected to server '{}'", name))
}

/// Disconnect from an MCP server
#[tauri::command]
pub async fn mcp_disconnect_server(
    state: State<'_, McpState>,
    name: String,
) -> Result<String, String> {
    state
        .client
        .disconnect_server(&name)
        .await
        .map_err(|e| format!("Failed to disconnect: {}", e))?;

    Ok(format!("Disconnected from server '{}'", name))
}

/// Get all available tools from all connected servers
#[tauri::command]
pub async fn mcp_list_tools(state: State<'_, McpState>) -> Result<Vec<McpToolInfo>, String> {
    let tools = state.client.list_all_tools();

    let tool_infos: Vec<McpToolInfo> = tools
        .into_iter()
        .map(|(server_name, tool)| {
            let parameters: Vec<String> = tool
                .input_schema
                .get("properties")
                .and_then(|p| p.as_object())
                .map(|obj| obj.keys().cloned().collect())
                .unwrap_or_default();

            McpToolInfo {
                id: format!("mcp_{}_{}", server_name, tool.name),
                name: tool.name.clone(),
                description: tool.description.unwrap_or_default(),
                server: server_name,
                parameters,
            }
        })
        .collect();

    Ok(tool_infos)
}

/// Search for tools by query
#[tauri::command]
pub async fn mcp_search_tools(
    state: State<'_, McpState>,
    query: String,
) -> Result<Vec<McpToolInfo>, String> {
    let tools = state.client.search_tools(&query);

    let tool_infos: Vec<McpToolInfo> = tools
        .into_iter()
        .map(|(server_name, tool)| {
            let parameters: Vec<String> = tool
                .input_schema
                .get("properties")
                .and_then(|p| p.as_object())
                .map(|obj| obj.keys().cloned().collect())
                .unwrap_or_default();

            McpToolInfo {
                id: format!("mcp_{}_{}", server_name, tool.name),
                name: tool.name.clone(),
                description: tool.description.unwrap_or_default(),
                server: server_name,
                parameters,
            }
        })
        .collect();

    Ok(tool_infos)
}

/// Call an MCP tool
#[tauri::command]
pub async fn mcp_call_tool(
    state: State<'_, McpState>,
    tool_id: String,
    arguments: HashMap<String, Value>,
) -> Result<Value, String> {
    let result = state
        .registry
        .execute_tool(&tool_id, arguments)
        .await
        .map_err(|e| format!("Tool execution failed: {}", e))?;

    Ok(result)
}

/// Get MCP configuration
#[tauri::command]
pub async fn mcp_get_config(state: State<'_, McpState>) -> Result<Value, String> {
    let config = state.config.lock();
    serde_json::to_value(&*config).map_err(|e| format!("Failed to serialize config: {}", e))
}

/// Update MCP configuration
#[tauri::command]
pub async fn mcp_update_config(
    state: State<'_, McpState>,
    new_config: Value,
) -> Result<String, String> {
    let mut parsed_config: McpServersConfig =
        serde_json::from_value(new_config).map_err(|e| format!("Invalid config: {}", e))?;

    // Inject credentials
    parsed_config
        .inject_credentials()
        .map_err(|e| format!("Failed to inject credentials: {}", e))?;

    // Save to file
    let config_path = McpServersConfig::default_config_path()
        .map_err(|e| format!("Failed to get config path: {}", e))?;
    parsed_config
        .save_to_file(&config_path)
        .await
        .map_err(|e| format!("Failed to save config: {}", e))?;

    // Update state
    *state.config.lock() = parsed_config;

    Ok("Configuration updated successfully".to_string())
}

#[tauri::command]
pub async fn mcp_enable_server(state: State<'_, McpState>, name: String) -> Result<String, String> {
    set_server_enabled(state, name, true).await
}

#[tauri::command]
pub async fn mcp_disable_server(state: State<'_, McpState>, name: String) -> Result<String, String> {
    set_server_enabled(state, name, false).await
}

async fn set_server_enabled(
    state: State<'_, McpState>,
    name: String,
    enabled: bool,
) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Server name cannot be empty".to_string());
    }

    let server_config = {
        let mut config_guard = state.config.lock();
        let entry = config_guard
            .mcp_servers
            .get_mut(trimmed)
            .ok_or_else(|| format!("Server '{}' not found in configuration", trimmed))?;
        entry.enabled = enabled;
        entry.clone()
    };
    let snapshot = {
        let config_guard = state.config.lock();
        config_guard.clone()
    };

    let config_path = McpServersConfig::default_config_path()
        .map_err(|e| format!("Failed to get config path: {}", e))?;
    snapshot
        .save_to_file(&config_path)
        .await
        .map_err(|e| format!("Failed to save MCP config: {}", e))?;

    if enabled {
        state
            .client
            .connect_server(trimmed.to_string(), server_config)
            .await
            .map_err(|e| format!("Failed to start '{}': {}", trimmed, e))?;
        Ok(format!("Server '{}' enabled", trimmed))
    } else {
        if let Err(err) = state.client.disconnect_server(trimmed).await {
            tracing::warn!(
                "Server '{}' disabled but disconnect failed: {}",
                trimmed,
                err
            );
        }
        Ok(format!("Server '{}' disabled", trimmed))
    }
}

/// Get MCP statistics
#[tauri::command]
pub async fn mcp_get_stats(state: State<'_, McpState>) -> Result<HashMap<String, usize>, String> {
    Ok(state.client.get_stats())
}

/// Store a credential in Windows Credential Manager
#[tauri::command]
pub async fn mcp_store_credential(
    server_name: String,
    key: String,
    value: String,
) -> Result<String, String> {
    let service = format!("agiworkforce-mcp-{}", server_name);
    let entry = keyring::Entry::new(&service, &key)
        .map_err(|e| format!("Failed to create credential entry: {}", e))?;

    entry
        .set_password(&value)
        .map_err(|e| format!("Failed to store credential: {}", e))?;

    Ok(format!("Credential stored for {} / {}", server_name, key))
}

/// Get MCP tool schemas for LLM function calling (OpenAI format)
#[tauri::command]
pub async fn mcp_get_tool_schemas(state: State<'_, McpState>) -> Result<Vec<Value>, String> {
    Ok(state.registry.get_all_openai_functions())
}

/// Get health status for all MCP servers
#[tauri::command]
pub async fn mcp_get_health(
    state: State<'_, McpState>,
) -> Result<Vec<crate::mcp::ServerHealth>, String> {
    Ok(state.health_monitor.get_all_health())
}

/// Check health of a specific MCP server
#[tauri::command]
pub async fn mcp_check_server_health(
    state: State<'_, McpState>,
    server_name: String,
) -> Result<crate::mcp::ServerHealth, String> {
    let health = state.health_monitor.check_server_health(&server_name).await;
    Ok(health)
}
