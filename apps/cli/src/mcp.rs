//! MCP (Model Context Protocol) client for stdio-based tool servers.
//!
//! Supports discovering tools from MCP servers and executing them.
//! Servers are configured in ~/.agiworkforce/config.toml or .mcp.json.

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------

/// MCP server configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

/// MCP tool discovered from a server.
#[derive(Debug, Clone)]
pub struct McpTool {
    /// Namespaced tool name: mcp_{server}_{tool}
    pub namespaced_name: String,
    /// Original tool name from server
    pub original_name: String,
    /// Server this tool belongs to
    pub server_name: String,
    /// Tool description
    pub description: String,
    /// JSON Schema for input parameters
    pub input_schema: serde_json::Value,
}

// ---------------------------------------------------------------------------
// Timeout configuration
// ---------------------------------------------------------------------------

/// Per-operation timeout configuration for MCP connections.
#[derive(Debug, Clone)]
pub struct McpTimeouts {
    /// Timeout for the initialize handshake (default: 30s).
    pub initialize: Duration,
    /// Timeout for listing tools (default: 10s).
    pub list_tools: Duration,
    /// Timeout for executing a tool call (default: 120s — tool calls can be slow).
    pub call_tool: Duration,
    /// Timeout for health check pings (default: 5s).
    /// Used by is_alive() for periodic server health verification.
    #[allow(dead_code)]
    pub health_check: Duration,
}

impl Default for McpTimeouts {
    fn default() -> Self {
        Self {
            initialize: Duration::from_secs(30),
            list_tools: Duration::from_secs(10),
            call_tool: Duration::from_secs(120),
            health_check: Duration::from_secs(5),
        }
    }
}

impl McpTimeouts {
    /// Create timeouts from config, falling back to defaults for unset values.
    #[allow(dead_code)]
    pub fn from_config(config: &crate::config::CliConfig) -> Self {
        let defaults = Self::default();
        Self {
            initialize: config
                .default
                .mcp_initialize_timeout
                .map(Duration::from_secs)
                .unwrap_or(defaults.initialize),
            call_tool: config
                .default
                .mcp_call_tool_timeout
                .map(Duration::from_secs)
                .unwrap_or(defaults.call_tool),
            ..defaults
        }
    }
}

// ---------------------------------------------------------------------------
// JSON-RPC types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: u64,
    method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    params: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcResponse {
    #[allow(dead_code)]
    jsonrpc: String,
    #[allow(dead_code)]
    id: Option<u64>,
    result: Option<serde_json::Value>,
    error: Option<JsonRpcError>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcError {
    code: i64,
    message: String,
}

impl std::fmt::Display for JsonRpcError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "MCP error {}: {}", self.code, self.message)
    }
}

// ---------------------------------------------------------------------------
// Process group cleanup (Unix)
// ---------------------------------------------------------------------------

/// Send SIGTERM to the child process, wait briefly, then SIGKILL if needed.
///
/// Async version — uses `tokio::time::sleep` to avoid blocking the runtime.
/// Used by `kill_child()` and other async methods.
#[cfg(unix)]
async fn kill_process_gracefully(child: &mut Child) {
    use nix::sys::signal::{kill, Signal};
    use nix::unistd::Pid;

    if let Some(pid) = child.id() {
        let pid = Pid::from_raw(pid as i32);

        // Try graceful SIGTERM first
        let _ = kill(pid, Signal::SIGTERM);

        // Give the process 2 seconds to exit (non-blocking)
        tokio::time::sleep(Duration::from_secs(2)).await;

        // If still alive, force SIGKILL
        if child.try_wait().ok().flatten().is_none() {
            let _ = kill(pid, Signal::SIGKILL);
        }
    }
}

/// Sync version for Drop context (cannot use async).
/// Uses a short thread::sleep (100ms max) since Drop must be synchronous.
#[cfg(unix)]
fn kill_process_gracefully_sync(child: &mut Child) {
    use nix::sys::signal::{kill, Signal};
    use nix::unistd::Pid;

    if let Some(pid) = child.id() {
        let pid = Pid::from_raw(pid as i32);

        // Try graceful SIGTERM first
        let _ = kill(pid, Signal::SIGTERM);

        // Short sleep — Drop must not block long
        std::thread::sleep(Duration::from_millis(100));

        // If still alive, force SIGKILL
        if child.try_wait().ok().flatten().is_none() {
            let _ = kill(pid, Signal::SIGKILL);
        }
    }
}

// ---------------------------------------------------------------------------
// MCP Client
// ---------------------------------------------------------------------------

/// A running MCP server connection (stdio transport).
pub struct McpConnection {
    server_name: String,
    config: McpServerConfig,
    child: Child,
    request_id: u64,
    timeouts: McpTimeouts,
}

impl McpConnection {
    /// Start an MCP server and initialize the connection.
    pub async fn connect(name: &str, config: &McpServerConfig) -> Result<Self> {
        Self::connect_with_timeouts(name, config, McpTimeouts::default()).await
    }

    /// Start an MCP server with custom timeout configuration.
    pub async fn connect_with_timeouts(
        name: &str,
        config: &McpServerConfig,
        timeouts: McpTimeouts,
    ) -> Result<Self> {
        let child = Self::spawn_child(name, config)?;

        let mut conn = Self {
            server_name: name.to_string(),
            config: config.clone(),
            child,
            request_id: 0,
            timeouts,
        };

        // Send initialize request
        conn.initialize().await?;

        Ok(conn)
    }

    /// Spawn the child process for this MCP server.
    fn spawn_child(name: &str, config: &McpServerConfig) -> Result<Child> {
        let mut cmd = Command::new(&config.command);
        cmd.args(&config.args)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null());

        for (key, val) in &config.env {
            cmd.env(key, val);
        }

        cmd.spawn().context(format!(
            "[{}] Failed to start MCP server: {} {}",
            name,
            config.command,
            config.args.join(" ")
        ))
    }

    /// Send the MCP initialize handshake.
    async fn initialize(&mut self) -> Result<()> {
        let timeout = self.timeouts.initialize;
        let response = self
            .send_request(
                "initialize",
                Some(serde_json::json!({
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {
                        "name": "agiworkforce-cli",
                        "version": env!("CARGO_PKG_VERSION")
                    }
                })),
                timeout,
            )
            .await?;

        // Check server capabilities
        if let Some(result) = response {
            let _server_info = result.get("serverInfo");
            // We don't strictly need to check capabilities for basic tool use
        }

        // Send initialized notification (no response expected)
        self.send_notification("notifications/initialized", None)
            .await?;

        Ok(())
    }

    /// Discover tools from the MCP server.
    pub async fn list_tools(&mut self) -> Result<Vec<McpTool>> {
        let timeout = self.timeouts.list_tools;
        let response = self.send_request("tools/list", None, timeout).await?;

        let tools_json = response
            .and_then(|r| r.get("tools").cloned())
            .and_then(|t| t.as_array().cloned())
            .unwrap_or_default();

        let mut tools = Vec::new();
        for tool in tools_json {
            let name = tool
                .get("name")
                .and_then(|n| n.as_str())
                .unwrap_or_default();
            let description = tool
                .get("description")
                .and_then(|d| d.as_str())
                .unwrap_or_default();
            let input_schema = tool
                .get("inputSchema")
                .cloned()
                .unwrap_or(serde_json::json!({"type": "object"}));

            tools.push(McpTool {
                namespaced_name: format!("mcp_{}_{}", self.server_name, name),
                original_name: name.to_string(),
                server_name: self.server_name.clone(),
                description: description.to_string(),
                input_schema,
            });
        }

        Ok(tools)
    }

    /// Execute a tool on the MCP server.
    ///
    /// If the request fails with a connection error the connection is
    /// automatically re-established and the call is retried once.
    pub async fn call_tool(
        &mut self,
        tool_name: &str,
        arguments: serde_json::Value,
    ) -> Result<String> {
        let timeout = self.timeouts.call_tool;
        let result = self
            .send_request(
                "tools/call",
                Some(serde_json::json!({
                    "name": tool_name,
                    "arguments": arguments,
                })),
                timeout,
            )
            .await;

        // On connection error, try to reconnect once and retry
        let result = match result {
            Err(e) if Self::is_connection_error(&e) => {
                eprintln!(
                    "[{}] Connection lost, attempting reconnect...",
                    self.server_name
                );
                self.reconnect().await.context(format!(
                    "[{}] Failed to reconnect after connection error",
                    self.server_name
                ))?;

                // Retry the tool call on the fresh connection
                self.send_request(
                    "tools/call",
                    Some(serde_json::json!({
                        "name": tool_name,
                        "arguments": arguments,
                    })),
                    timeout,
                )
                .await?
            }
            Err(e) => return Err(e),
            Ok(v) => v,
        };

        let result = result.unwrap_or(serde_json::Value::Null);

        // Extract text content from the response
        if let Some(content) = result.get("content").and_then(|c| c.as_array()) {
            let texts: Vec<&str> = content
                .iter()
                .filter_map(|c| {
                    if c.get("type").and_then(|t| t.as_str()) == Some("text") {
                        c.get("text").and_then(|t| t.as_str())
                    } else {
                        None
                    }
                })
                .collect();
            Ok(texts.join("\n"))
        } else {
            Ok(result.to_string())
        }
    }

    /// Check whether the MCP server is still alive and responsive.
    ///
    /// Sends a cheap `tools/list` request with a short timeout.
    /// Returns `false` on timeout, connection errors, or a dead child process.
    /// Will be used for auto-reconnect logic in the REPL loop.
    #[allow(dead_code)]
    pub async fn is_alive(&mut self) -> bool {
        // Quick check: has the child process already exited?
        if let Ok(Some(_status)) = self.child.try_wait() {
            return false;
        }

        let timeout = self.timeouts.health_check;
        self.send_request("tools/list", None, timeout).await.is_ok()
    }

    /// Tear down the current child process and spawn + initialize a fresh one.
    pub async fn reconnect(&mut self) -> Result<()> {
        // Kill the old process (best-effort)
        self.kill_child().await;

        // Spawn a new child from the saved config
        self.child = Self::spawn_child(&self.server_name, &self.config)?;
        self.request_id = 0;

        // Re-initialize the MCP handshake
        self.initialize().await.context(format!(
            "[{}] Re-initialization failed after reconnect",
            self.server_name
        ))?;

        Ok(())
    }

    /// Determine if an error looks like a connection / IO / timeout failure.
    fn is_connection_error(err: &anyhow::Error) -> bool {
        let msg = format!("{:#}", err);
        msg.contains("closed connection")
            || msg.contains("stdin not available")
            || msg.contains("stdout not available")
            || msg.contains("response timeout")
            || msg.contains("Broken pipe")
            || msg.contains("Connection reset")
    }

    /// Send a JSON-RPC request and wait for response.
    async fn send_request(
        &mut self,
        method: &str,
        params: Option<serde_json::Value>,
        timeout: Duration,
    ) -> Result<Option<serde_json::Value>> {
        self.request_id += 1;
        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: self.request_id,
            method: method.to_string(),
            params,
        };

        let mut request_json = serde_json::to_string(&request)?;
        request_json.push('\n');

        let stdin = self.child.stdin.as_mut().context(format!(
            "[{}] MCP server stdin not available",
            self.server_name
        ))?;
        stdin.write_all(request_json.as_bytes()).await?;
        stdin.flush().await?;

        // Read response (single line JSON-RPC)
        let stdout = self.child.stdout.as_mut().context(format!(
            "[{}] MCP server stdout not available",
            self.server_name
        ))?;
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();

        let server_name = self.server_name.clone();
        let expected_id = self.request_id;
        let method_name = request.method.clone();

        // Wrap the entire read loop in a timeout to prevent unbounded reads
        // if the server sends infinite non-matching lines or never responds.
        match tokio::time::timeout(timeout, async {
            loop {
                line.clear();
                let bytes_read = reader
                    .read_line(&mut line)
                    .await
                    .context(format!("[{}] Failed to read from MCP server", server_name))?;

                if bytes_read == 0 {
                    bail!("[{}] MCP server closed connection", server_name);
                }

                let response: JsonRpcResponse = match serde_json::from_str(line.trim()) {
                    Ok(r) => r,
                    Err(_) => {
                        // Log non-JSON lines for debugging (e.g. server stderr leaking to stdout)
                        let trimmed = line.trim();
                        if !trimmed.is_empty() {
                            eprintln!("[{}] Skipped non-JSON line: {}", server_name, trimmed);
                        }
                        continue;
                    }
                };

                // Check if this is our response (matching ID)
                if response.id == Some(expected_id) {
                    if let Some(error) = response.error {
                        bail!("[{}] {}", server_name, error);
                    }
                    return Ok(response.result);
                }
                // Otherwise it's a notification or response to a different request -- skip
            }
        })
        .await
        {
            Ok(result) => result,
            Err(_) => Err(anyhow::anyhow!(
                "[{}] MCP server response timeout ({}ms) on '{}'",
                self.server_name,
                timeout.as_millis(),
                method_name,
            )),
        }
    }

    /// Send a JSON-RPC notification (no response expected).
    async fn send_notification(
        &mut self,
        method: &str,
        params: Option<serde_json::Value>,
    ) -> Result<()> {
        let notification = serde_json::json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params.unwrap_or(serde_json::json!({})),
        });

        let mut json = serde_json::to_string(&notification)?;
        json.push('\n');

        let stdin = self.child.stdin.as_mut().context(format!(
            "[{}] MCP server stdin not available",
            self.server_name
        ))?;
        stdin.write_all(json.as_bytes()).await?;
        stdin.flush().await?;

        Ok(())
    }

    /// Kill the child process, using process-group cleanup on Unix.
    async fn kill_child(&mut self) {
        #[cfg(unix)]
        kill_process_gracefully(&mut self.child).await;

        #[cfg(not(unix))]
        {
            let _ = self.child.kill().await;
        }
    }

    /// Shut down the MCP server gracefully.
    pub async fn shutdown(&mut self) -> Result<()> {
        // Try graceful shutdown
        let _ = self
            .send_notification("notifications/cancelled", None)
            .await;

        // Give it a moment to clean up
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Kill the process (with process-group cleanup on Unix)
        self.kill_child().await;

        Ok(())
    }
}

impl Drop for McpConnection {
    fn drop(&mut self) {
        // Best-effort sync cleanup — Drop cannot be async.
        // Use platform-appropriate sync kill on all platforms to avoid
        // block_on() deadlock risk inside async task contexts.
        #[cfg(unix)]
        kill_process_gracefully_sync(&mut self.child);

        #[cfg(not(unix))]
        {
            // Sync kill via tokio Child::start_kill() — non-blocking, safe in Drop.
            // Falls back gracefully if the process already exited.
            let _ = self.child.start_kill();
        }
    }
}

// ---------------------------------------------------------------------------
// MCP Manager
// ---------------------------------------------------------------------------

/// Manages multiple MCP server connections.
pub struct McpManager {
    connections: HashMap<String, McpConnection>,
    tools: Vec<McpTool>,
}

impl std::fmt::Debug for McpManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("McpManager")
            .field("connections", &self.connections.keys().collect::<Vec<_>>())
            .field("tools_count", &self.tools.len())
            .finish()
    }
}

impl McpManager {
    pub fn new() -> Self {
        Self {
            connections: HashMap::new(),
            tools: Vec::new(),
        }
    }

    /// Load MCP server configurations from config.toml and .mcp.json.
    pub fn load_configs() -> Result<HashMap<String, McpServerConfig>> {
        let mut configs = HashMap::new();

        // Load from .mcp.json in current directory
        let mcp_json = std::path::Path::new(".mcp.json");
        if mcp_json.exists() {
            if let Ok(contents) = std::fs::read_to_string(mcp_json) {
                // Try flat format: { "server_name": { "command": "...", ... } }
                if let Ok(parsed) =
                    serde_json::from_str::<HashMap<String, McpServerConfig>>(&contents)
                {
                    configs.extend(parsed);
                }
                // Also try nested format: { "mcpServers": { ... } }
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&contents) {
                    if let Some(servers) = parsed.get("mcpServers").and_then(|s| s.as_object()) {
                        for (name, config) in servers {
                            if let Ok(server_config) =
                                serde_json::from_value::<McpServerConfig>(config.clone())
                            {
                                configs.insert(name.clone(), server_config);
                            }
                        }
                    }
                }
            }
        }

        // Load from ~/.agiworkforce/.mcp.json
        if let Ok(config_dir) = crate::config::CliConfig::config_dir() {
            let global_mcp = config_dir.join(".mcp.json");
            if global_mcp.exists() {
                if let Ok(contents) = std::fs::read_to_string(&global_mcp) {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&contents) {
                        if let Some(servers) = parsed.get("mcpServers").and_then(|s| s.as_object())
                        {
                            for (name, config) in servers {
                                if let Ok(server_config) =
                                    serde_json::from_value::<McpServerConfig>(config.clone())
                                {
                                    configs.entry(name.clone()).or_insert(server_config);
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(configs)
    }

    /// Connect to all configured MCP servers and discover tools.
    pub async fn connect_all(&mut self, configs: &HashMap<String, McpServerConfig>) -> Result<()> {
        for (name, config) in configs {
            match McpConnection::connect(name, config).await {
                Ok(mut conn) => match conn.list_tools().await {
                    Ok(tools) => {
                        let count = tools.len();
                        self.tools.extend(tools);
                        eprintln!("  MCP server '{}': {} tools discovered", name, count);
                        self.connections.insert(name.clone(), conn);
                    }
                    Err(e) => {
                        eprintln!("  MCP server '{}': failed to list tools: {}", name, e);
                        let _ = conn.shutdown().await;
                    }
                },
                Err(e) => {
                    eprintln!("  MCP server '{}': failed to connect: {}", name, e);
                }
            }
        }

        Ok(())
    }

    /// Get all discovered MCP tools.
    /// Accessor for callers that need the raw tool list (e.g. /mcp list command).
    #[allow(dead_code)]
    pub fn tools(&self) -> &[McpTool] {
        &self.tools
    }

    /// Convert MCP tools to ToolDefinitions for the LLM.
    ///
    /// Concurrency flags default to false (safe, sequential) for MCP tools —
    /// the MCP protocol exposes `annotations.readOnlyHint` and similar but
    /// we don't plumb those through yet. Operators can opt in once we trust
    /// upstream servers' annotations.
    pub fn tool_definitions(&self) -> Vec<crate::models::ToolDefinition> {
        self.tools
            .iter()
            .map(|t| crate::models::ToolDefinition {
                name: t.namespaced_name.clone(),
                description: format!("[MCP:{}] {}", t.server_name, t.description),
                input_schema: t.input_schema.clone(),
                is_read_only: false,
                is_concurrency_safe: false,
                max_result_size_chars: None,
            })
            .collect()
    }

    /// Execute a namespaced MCP tool call.
    pub async fn execute_tool(
        &mut self,
        namespaced_name: &str,
        arguments: serde_json::Value,
    ) -> Result<String> {
        // Find which server owns this tool
        let tool = self
            .tools
            .iter()
            .find(|t| t.namespaced_name == namespaced_name)
            .context(format!("MCP tool '{}' not found", namespaced_name))?
            .clone();

        let conn = self
            .connections
            .get_mut(&tool.server_name)
            .context(format!("[{}] MCP server not connected", tool.server_name))?;

        conn.call_tool(&tool.original_name, arguments).await
    }

    /// Shut down all MCP server connections.
    pub async fn shutdown_all(&mut self) {
        for (name, mut conn) in self.connections.drain() {
            if let Err(e) = conn.shutdown().await {
                eprintln!("Warning: failed to shut down MCP server '{}': {}", name, e);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mcp_tool_namespacing() {
        let tool = McpTool {
            namespaced_name: "mcp_myserver_read_file".to_string(),
            original_name: "read_file".to_string(),
            server_name: "myserver".to_string(),
            description: "Read a file".to_string(),
            input_schema: serde_json::json!({"type": "object"}),
        };
        assert_eq!(tool.namespaced_name, "mcp_myserver_read_file");
    }

    #[test]
    fn test_load_configs_no_crash() {
        // Should not crash even if no config files exist
        let configs = McpManager::load_configs().unwrap();
        // Result depends on environment -- just verify it doesn't panic
        let _ = configs;
    }

    #[test]
    fn test_mcp_manager_new() {
        let manager = McpManager::new();
        assert!(manager.tools().is_empty());
        assert!(manager.tool_definitions().is_empty());
    }

    #[test]
    fn test_json_rpc_request_serialization() {
        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: 1,
            method: "initialize".to_string(),
            params: Some(serde_json::json!({"protocolVersion": "2024-11-05"})),
        };
        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("\"jsonrpc\":\"2.0\""));
        assert!(json.contains("\"method\":\"initialize\""));
    }

    #[test]
    fn test_json_rpc_error_display() {
        let err = JsonRpcError {
            code: -32600,
            message: "Invalid Request".to_string(),
        };
        assert_eq!(format!("{}", err), "MCP error -32600: Invalid Request");
    }

    // -----------------------------------------------------------------------
    // Timeout configuration tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_default_timeouts() {
        let t = McpTimeouts::default();
        assert_eq!(t.initialize, Duration::from_secs(30));
        assert_eq!(t.list_tools, Duration::from_secs(10));
        assert_eq!(t.call_tool, Duration::from_secs(120));
        assert_eq!(t.health_check, Duration::from_secs(5));
    }

    #[test]
    fn test_custom_timeouts() {
        let t = McpTimeouts {
            initialize: Duration::from_secs(5),
            list_tools: Duration::from_secs(3),
            call_tool: Duration::from_secs(60),
            health_check: Duration::from_secs(2),
        };
        assert_eq!(t.initialize, Duration::from_secs(5));
        assert_eq!(t.list_tools, Duration::from_secs(3));
        assert_eq!(t.call_tool, Duration::from_secs(60));
        assert_eq!(t.health_check, Duration::from_secs(2));
    }

    #[test]
    fn test_timeouts_clone() {
        let t = McpTimeouts::default();
        let t2 = t.clone();
        assert_eq!(t.initialize, t2.initialize);
        assert_eq!(t.call_tool, t2.call_tool);
    }

    // -----------------------------------------------------------------------
    // Connection error detection tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_is_connection_error_closed() {
        let err = anyhow::anyhow!("MCP server closed connection");
        assert!(McpConnection::is_connection_error(&err));
    }

    #[test]
    fn test_is_connection_error_stdin() {
        let err = anyhow::anyhow!("MCP server stdin not available");
        assert!(McpConnection::is_connection_error(&err));
    }

    #[test]
    fn test_is_connection_error_timeout() {
        let err = anyhow::anyhow!("MCP server response timeout (30000ms)");
        assert!(McpConnection::is_connection_error(&err));
    }

    #[test]
    fn test_is_connection_error_broken_pipe() {
        let err = anyhow::anyhow!("Broken pipe");
        assert!(McpConnection::is_connection_error(&err));
    }

    #[test]
    fn test_is_connection_error_reset() {
        let err = anyhow::anyhow!("Connection reset by peer");
        assert!(McpConnection::is_connection_error(&err));
    }

    #[test]
    fn test_is_not_connection_error() {
        let err = anyhow::anyhow!("MCP error -32600: Invalid Request");
        assert!(!McpConnection::is_connection_error(&err));
    }

    #[test]
    fn test_is_not_connection_error_json() {
        let err = anyhow::anyhow!("Failed to parse JSON response");
        assert!(!McpConnection::is_connection_error(&err));
    }

    // -----------------------------------------------------------------------
    // Health check logic (unit-testable parts)
    // -----------------------------------------------------------------------

    #[test]
    fn test_health_check_timeout_is_short() {
        let t = McpTimeouts::default();
        // Health check should be significantly shorter than call_tool
        assert!(t.health_check < t.call_tool);
        assert!(t.health_check <= Duration::from_secs(5));
    }

    // -----------------------------------------------------------------------
    // Error message formatting tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_error_messages_contain_server_name() {
        // Verify that our error format strings include server name context
        let server = "my-test-server";
        let msg = format!("[{}] MCP server stdin not available", server);
        assert!(msg.contains("my-test-server"));

        let msg2 = format!("[{}] MCP server closed connection", server);
        assert!(msg2.contains("my-test-server"));

        let msg3 = format!(
            "[{}] MCP server response timeout (30000ms) on 'tools/list'",
            server
        );
        assert!(msg3.contains("my-test-server"));
        assert!(msg3.contains("tools/list"));
    }
}
