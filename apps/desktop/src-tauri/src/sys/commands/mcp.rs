use crate::core::mcp::{
    emit_mcp_event, McpClient, McpEvent, McpHealthMonitor, McpServersConfig, McpToolRegistry,
};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tauri::State;

pub struct McpState {
    pub client: Arc<McpClient>,
    pub registry: Arc<McpToolRegistry>,
    pub config: Arc<Mutex<McpServersConfig>>,
    pub health_monitor: Arc<McpHealthMonitor>,
}

impl Default for McpState {
    fn default() -> Self {
        Self::new()
    }
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

    pub fn start_health_monitoring(&self, app_handle: tauri::AppHandle) {
        let monitor = self.health_monitor.clone();
        monitor.start_monitoring(std::time::Duration::from_secs(30), app_handle);
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerInfo {
    pub name: String,
    pub enabled: bool,
    pub connected: bool,
    pub tool_count: usize,
    pub command: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub server: String,
    pub parameters: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryPackage {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub category: String,
    pub npm_package: Option<String>,
    pub github: Option<String>,
    pub tools: Vec<String>,
    pub rating: f64,
    pub downloads: u32,
    pub installed: bool,
}

#[tauri::command]
pub async fn mcp_get_registry(state: State<'_, McpState>) -> Result<Vec<RegistryPackage>, String> {
    let config = state.config.lock();
    let installed_servers: HashSet<String> = config.mcp_servers.keys().cloned().collect();

    // Mock registry data
    let registry = vec![
        RegistryPackage {
            id: "mcp-filesystem".to_string(),
            name: "Filesystem".to_string(),
            version: "0.2.0".to_string(),
            description: "Secure access to local filesystem".to_string(),
            author: "Model Context Protocol".to_string(),
            category: "automation".to_string(),
            npm_package: Some("@modelcontextprotocol/server-filesystem".to_string()),
            github: Some("https://github.com/modelcontextprotocol/servers".to_string()),
            tools: vec![
                "read_file".to_string(),
                "write_file".to_string(),
                "list_directory".to_string(),
            ],
            rating: 4.9,
            downloads: 45000,
            installed: installed_servers.contains("filesystem"),
        },
        RegistryPackage {
            id: "mcp-google-drive".to_string(),
            name: "Google Drive".to_string(),
            version: "0.1.5".to_string(),
            description: "Access and manage Google Drive files".to_string(),
            author: "Model Context Protocol".to_string(),
            category: "data".to_string(),
            npm_package: Some("@modelcontextprotocol/server-google-drive".to_string()),
            github: Some("https://github.com/modelcontextprotocol/servers".to_string()),
            tools: vec![
                "drive_list".to_string(),
                "drive_read".to_string(),
                "drive_upload".to_string(),
            ],
            rating: 4.7,
            downloads: 8900,
            installed: installed_servers.contains("google-drive"),
        },
        RegistryPackage {
            id: "mcp-slack".to_string(),
            name: "Slack".to_string(),
            version: "0.1.2".to_string(),
            description: "Send messages and read channels in Slack".to_string(),
            author: "Model Context Protocol".to_string(),
            category: "productivity".to_string(),
            npm_package: Some("@modelcontextprotocol/server-slack".to_string()),
            github: Some("https://github.com/modelcontextprotocol/servers".to_string()),
            tools: vec![
                "slack_post_message".to_string(),
                "slack_list_channels".to_string(),
            ],
            rating: 4.6,
            downloads: 15200,
            installed: installed_servers.contains("slack"),
        },
        RegistryPackage {
            id: "mcp-github".to_string(),
            name: "GitHub".to_string(),
            version: "0.3.1".to_string(),
            description: "Interact with GitHub repositories, issues, and PRs".to_string(),
            author: "Model Context Protocol".to_string(),
            category: "development".to_string(),
            npm_package: Some("@modelcontextprotocol/server-github".to_string()),
            github: Some("https://github.com/modelcontextprotocol/servers".to_string()),
            tools: vec![
                "github_create_issue".to_string(),
                "github_list_prs".to_string(),
                "github_read_file".to_string(),
            ],
            rating: 4.9,
            downloads: 32000,
            installed: installed_servers.contains("github"),
        },
        RegistryPackage {
            id: "mcp-postgres".to_string(),
            name: "PostgreSQL".to_string(),
            version: "0.1.1".to_string(),
            description: "Read-only access to PostgreSQL databases".to_string(),
            author: "Model Context Protocol".to_string(),
            category: "data".to_string(),
            npm_package: Some("@modelcontextprotocol/server-postgres".to_string()),
            github: Some("https://github.com/modelcontextprotocol/servers".to_string()),
            tools: vec![
                "postgres_query".to_string(),
                "postgres_list_tables".to_string(),
            ],
            rating: 4.5,
            downloads: 6700,
            installed: installed_servers.contains("postgres"),
        },
        RegistryPackage {
            id: "mcp-memory".to_string(),
            name: "Memory".to_string(),
            version: "0.1.0".to_string(),
            description: "Persistent memory server for storing knowledge graph".to_string(),
            author: "Model Context Protocol".to_string(),
            category: "data".to_string(),
            npm_package: Some("@modelcontextprotocol/server-memory".to_string()),
            github: Some("https://github.com/modelcontextprotocol/servers".to_string()),
            tools: vec!["memory_store".to_string(), "memory_retrieve".to_string()],
            rating: 4.2,
            downloads: 3400,
            installed: installed_servers.contains("memory"),
        },
        RegistryPackage {
            id: "mcp-time".to_string(),
            name: "Time".to_string(),
            version: "0.1.0".to_string(),
            description: "Time and timezone utilities".to_string(),
            author: "Model Context Protocol".to_string(),
            category: "productivity".to_string(),
            npm_package: Some("@modelcontextprotocol/server-time".to_string()),
            github: Some("https://github.com/modelcontextprotocol/servers".to_string()),
            tools: vec![
                "get_current_time".to_string(),
                "convert_timezone".to_string(),
            ],
            rating: 4.0,
            downloads: 2100,
            installed: installed_servers.contains("time"),
        },
    ];

    Ok(registry)
}

#[tauri::command]
pub async fn mcp_initialize(
    state: State<'_, McpState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    tracing::info!("Initializing MCP system");

    let config_path = McpServersConfig::default_config_path()
        .map_err(|e| format!("Failed to get config path: {}", e))?;

    let mut config = if config_path.exists() {
        McpServersConfig::from_file(&config_path)
            .await
            .map_err(|e| format!("Failed to load MCP config: {}", e))?
    } else {
        let default_config = McpServersConfig::default();
        default_config
            .save_to_file(&config_path)
            .await
            .map_err(|e| format!("Failed to save default config: {}", e))?;
        default_config
    };

    config
        .inject_credentials()
        .map_err(|e| format!("Failed to inject credentials: {}", e))?;

    *state.config.lock() = config.clone();

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

                    emit_mcp_event(
                        &app,
                        McpEvent::ServerConnectionChanged {
                            server_name: name.clone(),
                            connected: true,
                            error: None,
                        },
                    );

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

    emit_mcp_event(
        &app,
        McpEvent::SystemInitialized {
            server_count: connected_count,
            tool_count: total_tools,
        },
    );

    state.start_health_monitoring(app);

    Ok(format!(
        "MCP initialized. Connected to {} server(s) with {} tool(s)",
        connected_count, total_tools
    ))
}

#[tauri::command]
pub async fn mcp_list_servers(state: State<'_, McpState>) -> Result<Vec<McpServerInfo>, String> {
    let config = state.config.lock();
    let stats = state.client.get_stats();
    let connected: HashSet<String> = state.client.get_connected_servers().into_iter().collect();

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
                // Use double underscore format to match registry's expected format
                id: format!("mcp__{}__{}", server_name, tool.name),
                name: tool.name.clone(),
                description: tool.description.unwrap_or_default(),
                server: server_name,
                parameters,
            }
        })
        .collect();

    Ok(tool_infos)
}

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
                // Use double underscore format to match registry's expected format
                id: format!("mcp__{}__{}", server_name, tool.name),
                name: tool.name.clone(),
                description: tool.description.unwrap_or_default(),
                server: server_name,
                parameters,
            }
        })
        .collect();

    Ok(tool_infos)
}

#[tauri::command]
pub async fn mcp_call_tool(
    state: State<'_, McpState>,
    app: tauri::AppHandle,
    tool_id: String,
    arguments: HashMap<String, Value>,
) -> Result<Value, String> {
    // Extract server name from tool_id (format: mcp__servername__toolname__)
    // Use double underscore delimiter to match registry format
    let server_name = tool_id
        .strip_prefix("mcp__")
        .and_then(|s| s.split("__").next())
        .unwrap_or("unknown")
        .to_string();

    // Emit tool execution started event
    emit_mcp_event(
        &app,
        McpEvent::ToolExecutionStarted {
            tool_id: tool_id.clone(),
            server_name: server_name.clone(),
        },
    );

    let start_time = std::time::Instant::now();
    let result = state.registry.execute_tool(&tool_id, arguments).await;

    let duration_ms = start_time.elapsed().as_millis() as u64;

    // Emit tool execution completed event
    emit_mcp_event(
        &app,
        McpEvent::ToolExecutionCompleted {
            tool_id: tool_id.clone(),
            server_name,
            success: result.is_ok(),
            duration_ms,
        },
    );

    result.map_err(|e| format!("Tool execution failed: {}", e))
}

#[tauri::command]
pub async fn mcp_get_config(state: State<'_, McpState>) -> Result<Value, String> {
    let config = state.config.lock();
    serde_json::to_value(&*config).map_err(|e| format!("Failed to serialize config: {}", e))
}

#[tauri::command]
pub async fn mcp_update_config(
    state: State<'_, McpState>,
    new_config: Value,
) -> Result<String, String> {
    let mut parsed_config: McpServersConfig =
        serde_json::from_value(new_config).map_err(|e| format!("Invalid config: {}", e))?;

    parsed_config
        .inject_credentials()
        .map_err(|e| format!("Failed to inject credentials: {}", e))?;

    let config_path = McpServersConfig::default_config_path()
        .map_err(|e| format!("Failed to get config path: {}", e))?;
    parsed_config
        .save_to_file(&config_path)
        .await
        .map_err(|e| format!("Failed to save config: {}", e))?;

    *state.config.lock() = parsed_config;

    Ok("Configuration updated successfully".to_string())
}

#[tauri::command]
pub async fn mcp_enable_server(state: State<'_, McpState>, name: String) -> Result<String, String> {
    set_server_enabled(state, name, true).await
}

#[tauri::command]
pub async fn mcp_disable_server(
    state: State<'_, McpState>,
    name: String,
) -> Result<String, String> {
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

#[tauri::command]
pub async fn mcp_get_stats(state: State<'_, McpState>) -> Result<HashMap<String, usize>, String> {
    Ok(state.client.get_stats())
}

#[tauri::command]
pub async fn mcp_get_server_logs(
    #[allow(non_snake_case)] serverName: String,
    lines: Option<usize>,
    _state: State<'_, McpState>,
) -> Result<Vec<String>, String> {
    Ok(crate::core::mcp::logs::get_server_logs(&serverName, lines))
}

/// Store a credential in encrypted database storage
#[tauri::command]
pub async fn mcp_store_credential(
    server_name: String,
    key: String,
    value: String,
) -> Result<String, String> {
    use crate::core::mcp::config::encrypt_mcp_credential;

    // Encrypt the credential
    let encrypted =
        encrypt_mcp_credential(&value).ok_or_else(|| "Failed to encrypt credential".to_string())?;

    // Get the database path
    let app_data =
        dirs::data_dir().ok_or_else(|| "Failed to get app data directory".to_string())?;
    let db_path = app_data.join("agiworkforce").join("agiworkforce.db");

    // Store in database
    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    let cred_key = format!("mcp_credential_{}_{}", server_name, key);
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT OR REPLACE INTO settings_v2 (key, value, category, encrypted, created_at, updated_at)
         VALUES (?1, ?2, 'mcp_credentials', 1, ?3, ?3)",
        rusqlite::params![cred_key, encrypted, now],
    )
    .map_err(|e| format!("Failed to store credential: {}", e))?;

    tracing::info!(
        "Credential stored for MCP server: {} / {}",
        server_name,
        key
    );
    Ok(format!("Credential stored for {} / {}", server_name, key))
}

#[tauri::command]
pub async fn mcp_get_tool_schemas(state: State<'_, McpState>) -> Result<Vec<Value>, String> {
    Ok(state.registry.get_all_openai_functions())
}

#[tauri::command]
pub async fn mcp_get_health(
    state: State<'_, McpState>,
) -> Result<Vec<crate::core::mcp::ServerHealth>, String> {
    Ok(state.health_monitor.get_all_health())
}

#[tauri::command]
pub async fn mcp_check_server_health(
    state: State<'_, McpState>,
    server_name: String,
) -> Result<crate::core::mcp::ServerHealth, String> {
    let health = state.health_monitor.check_server_health(&server_name).await;
    Ok(health)
}

/// Set a credential for an MCP server (stores in encrypted database)
#[tauri::command]
pub async fn mcp_set_credential(
    server_name: String,
    key: String,
    value: String,
) -> Result<String, String> {
    use crate::core::mcp::config::encrypt_mcp_credential;

    // Encrypt the credential
    let encrypted =
        encrypt_mcp_credential(&value).ok_or_else(|| "Failed to encrypt credential".to_string())?;

    // Get the database path
    let app_data =
        dirs::data_dir().ok_or_else(|| "Failed to get app data directory".to_string())?;
    let db_path = app_data.join("agiworkforce").join("agiworkforce.db");

    // Store in database
    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    let cred_key = format!("mcp_credential_{}_{}", server_name, key);
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT OR REPLACE INTO settings_v2 (key, value, category, encrypted, created_at, updated_at)
         VALUES (?1, ?2, 'mcp_credentials', 1, ?3, ?3)",
        rusqlite::params![cred_key, encrypted, now],
    )
    .map_err(|e| format!("Failed to store credential: {}", e))?;

    tracing::info!(
        "Credential stored for MCP server: {} / {}",
        server_name,
        key
    );
    Ok(format!("Credential stored for {} / {}", server_name, key))
}

/// Delete a credential for an MCP server from encrypted database
#[tauri::command]
pub async fn mcp_delete_credential(server_name: String, key: String) -> Result<String, String> {
    // Get the database path
    let app_data =
        dirs::data_dir().ok_or_else(|| "Failed to get app data directory".to_string())?;
    let db_path = app_data.join("agiworkforce").join("agiworkforce.db");

    // Delete from database
    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    let cred_key = format!("mcp_credential_{}_{}", server_name, key);

    conn.execute(
        "DELETE FROM settings_v2 WHERE key = ?1",
        rusqlite::params![cred_key],
    )
    .map_err(|e| format!("Failed to delete credential: {}", e))?;

    tracing::info!(
        "Credential deleted for MCP server: {} / {}",
        server_name,
        key
    );
    Ok(format!("Credential deleted for {} / {}", server_name, key))
}
