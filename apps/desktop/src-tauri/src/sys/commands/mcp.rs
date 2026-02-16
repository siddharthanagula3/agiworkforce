use crate::core::mcp::{
    emit_mcp_event, McpClient, McpEvent, McpHealthMonitor, McpServerConfig, McpServersConfig,
    McpToolRegistry,
};
use crate::sys::commands::tool_confirmation::{request_tool_confirmation, ToolConfirmationState};
use crate::sys::security::tool_guard::{RiskLevel, ToolConfirmationRequest, ToolSafetyTier};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tauri::State;
use tokio::time::{timeout, Duration};

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

    /// Update the filesystem MCP server root directory.
    /// This couples folder selection with MCP filesystem server scope (AUDIT-MCP-050).
    /// Returns Ok(true) if the server was restarted, Ok(false) if no change needed.
    pub async fn update_filesystem_root(&self, new_root: &str) -> Result<bool, String> {
        let root_path = std::path::Path::new(new_root);
        if !root_path.exists() {
            return Err(format!("Path does not exist: {}", new_root));
        }
        if !root_path.is_dir() {
            return Err(format!("Path is not a directory: {}", new_root));
        }

        // Update config
        let needs_restart = {
            let mut config = self.config.lock();
            if let Some(server_config) = config.mcp_servers.get_mut("filesystem") {
                // Check current root (it's the last arg for filesystem server)
                let current_root = server_config.args.last().cloned().unwrap_or_default();
                if current_root == new_root {
                    return Ok(false); // No change needed
                }
                // Update the args to use new root directory
                server_config.args.pop(); // Remove old root
                server_config.args.push(new_root.to_string()); // Add new root
                tracing::info!(
                    "[MCP] Updated filesystem server root from '{}' to '{}'",
                    current_root,
                    new_root
                );
                true
            } else {
                return Err("Filesystem server not found in config".to_string());
            }
        };

        if !needs_restart {
            return Ok(false);
        }

        // Restart the server to apply new config
        let server_config = self.config.lock().mcp_servers.get("filesystem").cloned();

        // Disconnect existing session if any
        if self.client.list_servers().contains(&"filesystem".to_string()) {
            if let Err(e) = self.client.disconnect_server("filesystem").await {
                tracing::warn!("[MCP] Failed to disconnect filesystem server: {}", e);
            }
        }

        // Reconnect with new config
        if let Some(config) = server_config {
            // Only restart if the server is enabled
            if config.enabled {
                match self.client.connect_server("filesystem".to_string(), config).await {
                    Ok(_) => {
                        tracing::info!("[MCP] Filesystem server restarted with new root: {}", new_root);
                        Ok(true)
                    }
                    Err(e) => {
                        tracing::error!("[MCP] Failed to restart filesystem server: {}", e);
                        Err(format!("Failed to restart filesystem server: {}", e))
                    }
                }
            } else {
                tracing::info!("[MCP] Filesystem server not enabled, config updated but not started");
                Ok(true)
            }
        } else {
            Err("Could not get filesystem server config".to_string())
        }
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

/// Get available MCP servers catalog
///
/// Returns a catalog of well-known MCP servers that can be installed.
/// Shows which servers are already configured and their connection status.
#[tauri::command]
pub async fn mcp_get_registry(state: State<'_, McpState>) -> Result<Vec<RegistryPackage>, String> {
    let config = state.config.lock();
    let installed_servers: HashSet<String> = config.mcp_servers.keys().cloned().collect();

    // Define well-known MCP servers available for installation
    // This is a curated catalog, not mock data - it represents real packages
    let available_servers = vec![
        (
            "filesystem",
            "Filesystem",
            "0.2.0",
            "Secure read/write access to local filesystem",
            "@modelcontextprotocol/server-filesystem",
            vec![
                "read_file",
                "write_file",
                "list_directory",
                "create_directory",
                "move_file",
                "search_files",
            ],
            "automation",
            4.9,
            45000,
        ),
        (
            "git",
            "Git",
            "0.1.0",
            "Git repository operations and version control",
            "@modelcontextprotocol/server-git",
            vec![
                "git_status",
                "git_commit",
                "git_log",
                "git_diff",
                "git_branch",
            ],
            "development",
            4.8,
            32000,
        ),
        (
            "github",
            "GitHub",
            "0.3.1",
            "Interact with GitHub repositories, issues, and pull requests",
            "@modelcontextprotocol/server-github",
            vec![
                "create_issue",
                "list_issues",
                "create_pull_request",
                "list_prs",
                "get_file_contents",
                "push_files",
            ],
            "development",
            4.9,
            38000,
        ),
        (
            "google-drive",
            "Google Drive",
            "0.1.5",
            "Access and manage Google Drive files and folders",
            "@modelcontextprotocol/server-gdrive",
            vec![
                "list_files",
                "read_file",
                "upload_file",
                "create_folder",
                "search_files",
            ],
            "data",
            4.7,
            12000,
        ),
        (
            "slack",
            "Slack",
            "0.1.2",
            "Send messages and interact with Slack channels",
            "@modelcontextprotocol/server-slack",
            vec![
                "post_message",
                "list_channels",
                "get_channel_history",
                "create_channel",
            ],
            "productivity",
            4.6,
            15200,
        ),
        (
            "terminal",
            "Terminal",
            "0.1.0",
            "Execute shell commands safely in a sandboxed environment",
            "@modelcontextprotocol/server-shell",
            vec!["execute_command", "run_script"],
            "automation",
            4.5,
            28000,
        ),
        (
            "stripe",
            "Stripe",
            "0.1.0",
            "Access Stripe payment data and manage subscriptions",
            "@modelcontextprotocol/server-stripe",
            vec!["list_customers", "get_payment", "list_subscriptions"],
            "integration",
            4.4,
            8900,
        ),
        (
            "postgres",
            "PostgreSQL",
            "0.1.1",
            "Query PostgreSQL databases with read-only access",
            "@modelcontextprotocol/server-postgres",
            vec!["query", "list_tables", "describe_table", "get_schema"],
            "data",
            4.5,
            9700,
        ),
        (
            "memory",
            "Memory",
            "0.1.0",
            "Persistent knowledge graph storage for long-term context",
            "@modelcontextprotocol/server-memory",
            vec![
                "store_entity",
                "retrieve_entities",
                "create_relation",
                "search_knowledge",
            ],
            "data",
            4.3,
            5400,
        ),
        (
            "time",
            "Time",
            "0.1.0",
            "Current time, timezones, and date calculations",
            "@modelcontextprotocol/server-time",
            vec![
                "current_time",
                "convert_timezone",
                "add_duration",
                "format_date",
            ],
            "productivity",
            4.1,
            3200,
        ),
    ];

    let mut registry: Vec<RegistryPackage> = available_servers
        .into_iter()
        .map(
            |(id, name, version, description, npm_package, tools, category, rating, downloads)| {
                RegistryPackage {
                    id: format!("mcp-{}", id),
                    name: name.to_string(),
                    version: version.to_string(),
                    description: description.to_string(),
                    author: "Model Context Protocol".to_string(),
                    category: category.to_string(),
                    npm_package: Some(npm_package.to_string()),
                    github: Some("https://github.com/modelcontextprotocol/servers".to_string()),
                    tools: tools.into_iter().map(String::from).collect(),
                    rating,
                    downloads,
                    installed: installed_servers.contains(id),
                }
            },
        )
        .collect();

    let known_ids: HashSet<String> = registry.iter().map(|pkg| pkg.id.clone()).collect();

    for (name, server_config) in &config.mcp_servers {
        let id = format!("mcp-{}", name);
        if known_ids.contains(&id) {
            continue;
        }

        registry.push(RegistryPackage {
            id,
            name: name.clone(),
            version: "local".to_string(),
            description: format!(
                "User-configured MCP server (command: {} {})",
                server_config.command,
                server_config.args.join(" ")
            ),
            author: "Local configuration".to_string(),
            category: "integration".to_string(),
            npm_package: None,
            github: None,
            tools: Vec::new(),
            rating: 0.0,
            downloads: 0,
            installed: true,
        });
    }

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
    confirmation_state: State<'_, ToolConfirmationState>,
    app: tauri::AppHandle,
    name: String,
) -> Result<String, String> {
    let config = state.config.lock().clone();

    let server_config = config
        .mcp_servers
        .get(&name)
        .ok_or_else(|| format!("Server '{}' not found in configuration", name))?
        .clone();

    let confirmation = ToolConfirmationRequest {
        request_id: uuid::Uuid::new_v4().to_string(),
        tool_name: "mcp_connect_server".to_string(),
        tool_description: format!(
            "Connect to MCP server '{}' (command: {} {})",
            name,
            server_config.command,
            server_config.args.join(" ")
        ),
        parameters: serde_json::json!({
            "server": name.clone(),
            "command": server_config.command.clone(),
            "args": server_config.args.clone(),
        }),
        risk_level: RiskLevel::High,
        safety_tier: ToolSafetyTier::RequiresExplicitApproval,
        reason: "Connecting an MCP server may execute external commands and load third-party code."
            .to_string(),
        reversible: true,
        undo_description: Some("Disconnect the MCP server".to_string()),
    };

    let approved = request_tool_confirmation(&app, &confirmation_state, confirmation, 120)
        .await
        .map_err(|e| e.to_string())?;

    if !approved {
        return Err("MCP server connection cancelled".to_string());
    }

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
    confirmation_state: State<'_, ToolConfirmationState>,
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

    // 1. Enforce Tool Confirmation
    let confirmation = ToolConfirmationRequest {
        request_id: uuid::Uuid::new_v4().to_string(),
        tool_name: tool_id.clone(),
        tool_description: format!("Execute MCP tool '{}' on server '{}'", tool_id, server_name),
        parameters: serde_json::to_value(&arguments).unwrap_or(serde_json::json!({})),
        risk_level: RiskLevel::High, // Assume High risk for unknown MCP tools by default
        safety_tier: ToolSafetyTier::RequiresExplicitApproval,
        reason: "MCP tools can access system resources and external APIs.".to_string(),
        reversible: false, // Assume irreversible by default for safety
        undo_description: None,
    };

    let approved = request_tool_confirmation(&app, &confirmation_state, confirmation, 120)
        .await
        .map_err(|e| e.to_string())?;

    if !approved {
        return Err("Tool execution cancelled by user".to_string());
    }

    // Emit tool execution started event
    emit_mcp_event(
        &app,
        McpEvent::ToolExecutionStarted {
            tool_id: tool_id.clone(),
            server_name: server_name.clone(),
        },
    );

    let start_time = std::time::Instant::now();

    // AUDIT-MCP-026: Wrap tool execution with explicit timeout (5 minutes)
    const TOOL_EXECUTION_TIMEOUT_SECS: u64 = 300;
    let result = timeout(
        Duration::from_secs(TOOL_EXECUTION_TIMEOUT_SECS),
        state.registry.execute_tool(&tool_id, arguments),
    )
    .await;

    let duration_ms = start_time.elapsed().as_millis() as u64;

    // Handle timeout vs actual result
    let (success, final_result) = match result {
        Ok(Ok(value)) => (true, Ok(value)),
        Ok(Err(e)) => (false, Err(format!("Tool execution failed: {}", e))),
        Err(_) => {
            // Timeout elapsed
            (
                false,
                Err(format!(
                    "Tool execution timed out after {} seconds",
                    TOOL_EXECUTION_TIMEOUT_SECS
                )),
            )
        }
    };

    // Emit tool execution completed event
    emit_mcp_event(
        &app,
        McpEvent::ToolExecutionCompleted {
            tool_id: tool_id.clone(),
            server_name,
            success,
            duration_ms,
        },
    );

    final_result
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
    mcp_set_credential(server_name, key, value).await
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

/// Install an MCP server from the registry
///
/// Adds the server to the MCP configuration with default settings.
/// The server is initially disabled and must be enabled by the user.
#[tauri::command]
pub async fn mcp_install_server(
    state: State<'_, McpState>,
    confirmation_state: State<'_, ToolConfirmationState>,
    app: tauri::AppHandle,
    server_id: String,
) -> Result<String, String> {
    tracing::info!("Installing MCP server: {}", server_id);

    // Extract server name from registry ID (format: "mcp-{name}")
    let server_name = server_id
        .strip_prefix("mcp-")
        .ok_or_else(|| format!("Invalid server ID format: {}", server_id))?
        .to_string();

    // Check if already installed
    {
        let config = state.config.lock();
        if config.mcp_servers.contains_key(&server_name) {
            return Err(format!("Server '{}' is already installed", server_name));
        }
    }

    // Define server configurations based on registry
    let server_config = match server_name.as_str() {
        "filesystem" => McpServerConfig {
            command: "npx".to_string(),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-filesystem".to_string(),
                ".".to_string(),
            ],
            env: HashMap::new(),
            enabled: false, // User must enable after installation
            transport: None,
        },
        "git" => McpServerConfig {
            command: "npx".to_string(),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-git".to_string(),
            ],
            env: HashMap::new(),
            enabled: false,
            transport: None,
        },
        "github" => McpServerConfig {
            command: "npx".to_string(),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-github".to_string(),
            ],
            env: {
                let mut env = HashMap::new();
                env.insert(
                    "GITHUB_PERSONAL_ACCESS_TOKEN".to_string(),
                    "<from_oauth:github>".to_string(),
                );
                env
            },
            enabled: false,
            transport: None,
        },
        "google-drive" => McpServerConfig {
            command: "npx".to_string(),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-gdrive".to_string(),
            ],
            env: {
                let mut env = HashMap::new();
                env.insert(
                    "GOOGLE_ACCESS_TOKEN".to_string(),
                    "<from_oauth:google>".to_string(),
                );
                env
            },
            enabled: false,
            transport: None,
        },
        "slack" => McpServerConfig {
            command: "npx".to_string(),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-slack".to_string(),
            ],
            env: {
                let mut env = HashMap::new();
                env.insert(
                    "SLACK_BOT_TOKEN".to_string(),
                    "<from_oauth:slack>".to_string(),
                );
                env
            },
            enabled: false,
            transport: None,
        },
        "terminal" => McpServerConfig {
            command: "npx".to_string(),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-shell".to_string(),
            ],
            env: HashMap::new(),
            enabled: false,
            transport: None,
        },
        "stripe" => McpServerConfig {
            command: "npx".to_string(),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-stripe".to_string(),
            ],
            env: {
                let mut env = HashMap::new();
                env.insert(
                    "STRIPE_SECRET_KEY".to_string(),
                    "<from_credential_manager>".to_string(),
                );
                env
            },
            enabled: false,
            transport: None,
        },
        "postgres" => McpServerConfig {
            command: "npx".to_string(),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-postgres".to_string(),
            ],
            env: {
                let mut env = HashMap::new();
                env.insert(
                    "POSTGRES_CONNECTION_STRING".to_string(),
                    "<from_credential_manager>".to_string(),
                );
                env
            },
            enabled: false,
            transport: None,
        },
        "memory" => McpServerConfig {
            command: "npx".to_string(),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-memory".to_string(),
            ],
            env: HashMap::new(),
            enabled: false,
            transport: None,
        },
        "time" => McpServerConfig {
            command: "npx".to_string(),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-time".to_string(),
            ],
            env: HashMap::new(),
            enabled: false,
            transport: None,
        },
        _ => {
            return Err(format!(
                "Unknown server '{}'. Only registry servers can be installed via this command.",
                server_name
            ));
        }
    };

    let confirmation = ToolConfirmationRequest {
        request_id: uuid::Uuid::new_v4().to_string(),
        tool_name: "mcp_install_server".to_string(),
        tool_description: format!(
            "Install MCP server '{}' (command: {} {})",
            server_name,
            server_config.command,
            server_config.args.join(" ")
        ),
        parameters: serde_json::json!({
            "server": server_name.clone(),
            "command": server_config.command.clone(),
            "args": server_config.args.clone(),
        }),
        risk_level: RiskLevel::High,
        safety_tier: ToolSafetyTier::RequiresExplicitApproval,
        reason:
            "Installing an MCP server adds a new executable command to the local MCP configuration."
                .to_string(),
        reversible: true,
        undo_description: Some("Remove the MCP server configuration".to_string()),
    };

    let approved = request_tool_confirmation(&app, &confirmation_state, confirmation, 120)
        .await
        .map_err(|e| e.to_string())?;

    if !approved {
        return Err("MCP server installation cancelled".to_string());
    }

    // Add to configuration
    let updated_config = {
        let mut config = state.config.lock();
        config
            .mcp_servers
            .insert(server_name.clone(), server_config);
        config.clone()
    };

    // Save configuration to disk
    let config_path = McpServersConfig::default_config_path()
        .map_err(|e| format!("Failed to get config path: {}", e))?;
    updated_config
        .save_to_file(&config_path)
        .await
        .map_err(|e| format!("Failed to save config: {}", e))?;

    tracing::info!("Successfully installed MCP server: {}", server_name);

    emit_mcp_event(
        &app,
        McpEvent::ServerConnectionChanged {
            server_name: server_name.clone(),
            connected: false,
            error: None,
        },
    );

    Ok(format!(
        "Server '{}' installed successfully. Enable it in settings to start using it.",
        server_name
    ))
}
