//! MCP (Model Context Protocol) client.
//!
//! Three transports supported today:
//!   * `stdio` — child process speaking JSON-RPC over stdin/stdout (legacy).
//!   * `sse`   — long-lived Server-Sent Events stream + POST for outbound
//!               requests. Sprint B1.
//!   * `http`  — Streamable HTTP per the MCP 2025-06-18 spec: POST per
//!               request, body returned as JSON or SSE-upgrade response,
//!               sticky `Mcp-Session-Id`, optional GET to subscribe to
//!               server-pushed notifications. Sprint B2.
//!
//! Servers are configured in ~/.agiworkforce/config.toml or .mcp.json.
//! Sprint B3 will add OAuth on top of the `http` transport.

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;

mod http;
mod oauth_flow;
mod oauth_store;
mod sse;

use http::{connect_http, send_request_http};
use sse::connect_sse;

pub use oauth_store::McpOAuthStore;
#[allow(unused_imports)]
pub use oauth_store::McpOAuthToken;

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------

/// MCP server configuration. Backward-compatible: a config without
/// `transport` defaults to `Stdio` and uses `command`/`args`/`env` directly.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum McpServerConfig {
    /// New explicit-transport shape (`transport = "stdio" | "sse" | "http"`).
    Tagged(McpTransport),
    /// Legacy shape: `{command, args, env}` at top level → `Stdio`.
    Legacy(LegacyStdioConfig),
}

/// OAuth configuration for an MCP HTTP transport (Sprint B3).
///
/// All fields optional — when absent we run RFC 9728 → RFC 8414 discovery
/// on first 401. When `client_id` is also absent we attempt RFC 7591
/// dynamic client registration against the discovered AS.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct McpOAuthConfig {
    /// Override RFC 9728/8414 discovery for the authorize endpoint.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub authorize_url: Option<String>,
    /// Override the discovered token endpoint.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token_url: Option<String>,
    /// Space-separated scopes requested.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    /// Pre-registered client id. If unset, attempt RFC 7591 dynamic registration.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
    /// Pre-registered client secret (confidential clients only).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_secret: Option<String>,
    /// Override redirect URI; defaults to `http://127.0.0.1:<random>/callback`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub redirect_uri: Option<String>,
}

/// Discriminated transport union. The `Http` variant carries an optional
/// typed `McpOAuthConfig`; when present, the HTTP layer transparently runs
/// the PKCE flow on first 401 and persists tokens to
/// `~/.agiworkforce/mcp-oauth.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "transport", rename_all = "lowercase")]
pub enum McpTransport {
    Stdio {
        command: String,
        #[serde(default)]
        args: Vec<String>,
        #[serde(default)]
        env: HashMap<String, String>,
    },
    Sse {
        url: String,
        #[serde(default)]
        headers: HashMap<String, String>,
    },
    Http {
        url: String,
        #[serde(default)]
        headers: HashMap<String, String>,
        /// OAuth (PKCE) configuration. Sprint B3.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        auth: Option<McpOAuthConfig>,
    },
}

/// Legacy {command, args, env} shape with no `transport` field. Collapses
/// into `McpTransport::Stdio` via `into_transport()`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegacyStdioConfig {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

impl McpServerConfig {
    /// Normalize to `McpTransport`. The Legacy variant collapses into Stdio.
    pub fn into_transport(self) -> McpTransport {
        match self {
            McpServerConfig::Tagged(t) => t,
            McpServerConfig::Legacy(l) => McpTransport::Stdio {
                command: l.command,
                args: l.args,
                env: l.env,
            },
        }
    }

    /// View as `McpTransport` without consuming.
    pub fn as_transport(&self) -> McpTransport {
        self.clone().into_transport()
    }

    /// Convenience constructor for stdio configs (matches the pre-B1 shape).
    pub fn stdio(
        command: impl Into<String>,
        args: Vec<String>,
        env: HashMap<String, String>,
    ) -> Self {
        McpServerConfig::Legacy(LegacyStdioConfig {
            command: command.into(),
            args,
            env,
        })
    }

    /// Convenience constructor for SSE configs.
    pub fn sse(url: impl Into<String>, headers: HashMap<String, String>) -> Self {
        McpServerConfig::Tagged(McpTransport::Sse {
            url: url.into(),
            headers,
        })
    }

    /// Convenience constructor for Streamable HTTP configs (no OAuth).
    /// Plugins.rs constructs the OAuth-enabled variant directly via the
    /// `McpTransport::Http` enum — see `mcp_configs()`.
    #[allow(dead_code)]
    pub fn http(url: impl Into<String>, headers: HashMap<String, String>) -> Self {
        McpServerConfig::Tagged(McpTransport::Http {
            url: url.into(),
            headers,
            auth: None,
        })
    }

    /// Short string for logging.
    #[allow(dead_code)]
    pub fn transport_kind(&self) -> &'static str {
        match self.as_transport() {
            McpTransport::Stdio { .. } => "stdio",
            McpTransport::Sse { .. } => "sse",
            McpTransport::Http { .. } => "http",
        }
    }
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
pub(super) struct JsonRpcRequest {
    pub(super) jsonrpc: String,
    pub(super) id: u64,
    pub(super) method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) params: Option<serde_json::Value>,
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

/// A running MCP server connection. Wraps either a child process (stdio) or
/// a long-lived SSE/HTTP transport.
pub struct McpConnection {
    pub(super) server_name: String,
    pub(super) config: McpServerConfig,
    pub(super) inner: McpTransportConn,
    pub(super) request_id: u64,
    pub(super) timeouts: McpTimeouts,
}

/// Transport-specific connection state. Per-variant data is held inline
/// here; shared JSON-RPC bookkeeping lives on `McpConnection`.
pub(super) enum McpTransportConn {
    Stdio {
        child: Child,
    },
    Sse {
        /// URL for outbound POSTs. May be overridden by an `endpoint` SSE
        /// event from the server (servers like the official MCP "everything"
        /// server emit a POST URL on connect).
        post_url: String,
        headers: HashMap<String, String>,
        client: reqwest::Client,
        /// Channel receiving server-pushed JSON-RPC frames as
        /// `serde_json::Value`. Filled by a background task that owns the
        /// SSE bytes_stream.
        rx: mpsc::Receiver<serde_json::Value>,
        /// Optional session id from `Mcp-Session-Id` header. Forwarded on
        /// outbound POSTs for sticky session routing.
        session_id: Option<String>,
    },
    Http {
        /// Endpoint URL — used as both POST target and (optional) GET
        /// target for the server-push notification stream.
        url: String,
        headers: HashMap<String, String>,
        client: reqwest::Client,
        /// Receiver for server-pushed notifications (only populated if the
        /// server returned `text/event-stream` on the GET). `None` means
        /// pure request/response mode (POST + JSON body or POST +
        /// SSE-upgrade body).
        #[allow(dead_code)]
        notification_rx: Option<mpsc::Receiver<serde_json::Value>>,
        /// Sticky session id from `Mcp-Session-Id` header — captured on
        /// every response and echoed on every subsequent request.
        session_id: Option<String>,
        /// OAuth (PKCE) configuration if the transport opted into it
        /// (B3). When `Some`, send_request_http checks the token store
        /// before each request, attaches `Authorization: Bearer ...`,
        /// and runs the OAuth dance on 401.
        oauth: Option<McpOAuthConfig>,
    },
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
        match config.as_transport() {
            McpTransport::Stdio { command, args, env } => {
                let child = Self::spawn_stdio_child(name, &command, &args, &env)?;

                let mut conn = Self {
                    server_name: name.to_string(),
                    config: config.clone(),
                    inner: McpTransportConn::Stdio { child },
                    request_id: 0,
                    timeouts,
                };

                conn.initialize().await?;
                Ok(conn)
            }
            McpTransport::Sse { url, headers } => {
                connect_sse(name, &url, &headers, timeouts, config.clone()).await
            }
            McpTransport::Http { url, headers, auth } => {
                connect_http(name, &url, &headers, auth.as_ref(), timeouts, config.clone()).await
            }
        }
    }

    /// Spawn the child process for a stdio MCP server.
    ///
    /// SECURITY (HIGH-1 + LOW-1): `Command::new()` inherits the full parent env by default.
    /// `DYLD_INSERT_LIBRARIES` (macOS) / `LD_PRELOAD` (Linux) in the parent shell would inject
    /// a malicious dylib into every MCP server child. Separately, `ANTHROPIC_API_KEY` and
    /// other credential env vars would be visible to every MCP server binary.
    ///
    /// Fix: call `env_clear()` before setting the manifest env map, then re-inject only
    /// a safe allowlist. The manifest env is applied after, but filtered to exclude
    /// loader-injection vars even if the manifest attempts to set them.
    fn spawn_stdio_child(
        name: &str,
        command: &str,
        args: &[String],
        env: &HashMap<String, String>,
    ) -> Result<Child> {
        let mut cmd = Command::new(command);
        cmd.args(args)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null());

        // SECURITY: clear the inherited parent environment to prevent
        // DYLD_INSERT_LIBRARIES / LD_PRELOAD injection and API key leakage.
        cmd.env_clear();

        // Re-inject only a minimal safe allowlist from the parent environment.
        const ALLOWED_FROM_PARENT: &[&str] = &[
            "PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "LC_CTYPE",
            "TMPDIR", "TERM", "SHELL", "XDG_RUNTIME_DIR",
        ];
        for var in ALLOWED_FROM_PARENT {
            if let Ok(val) = std::env::var(var) {
                cmd.env(var, val);
            }
        }

        // Apply the manifest-declared env, but filter out loader-injection vars
        // that could be used to hijack the child process even via manifest.
        const BLOCKED_MANIFEST_VARS: &[&str] = &[
            "DYLD_INSERT_LIBRARIES",
            "DYLD_LIBRARY_PATH",
            "DYLD_FORCE_FLAT_NAMESPACE",
            "LD_PRELOAD",
            "LD_LIBRARY_PATH",
            "LD_AUDIT",
            "NODE_OPTIONS",
            "PYTHONPATH",
            "RUBYLIB",
            "PERL5LIB",
            "http_proxy",
            "https_proxy",
            "HTTP_PROXY",
            "HTTPS_PROXY",
            "ALL_PROXY",
            "all_proxy",
        ];
        for (key, val) in env {
            let key_upper = key.to_uppercase();
            let blocked = BLOCKED_MANIFEST_VARS
                .iter()
                .any(|b| b.eq_ignore_ascii_case(key));
            if blocked {
                eprintln!(
                    "[{}] security: manifest env var {:?} is blocked (loader-injection / proxy hijack risk)",
                    name, key
                );
                continue;
            }
            // Also block any *_PROXY vars not listed explicitly (case-insensitive suffix).
            if key_upper.ends_with("_PROXY") {
                eprintln!(
                    "[{}] security: manifest env var {:?} is blocked (proxy hijack risk)",
                    name, key
                );
                continue;
            }
            cmd.env(key, val);
        }

        cmd.spawn().context(format!(
            "[{}] Failed to start MCP server: {} {}",
            name,
            command,
            args.join(" ")
        ))
    }

    /// Send the MCP initialize handshake.
    pub(super) async fn initialize(&mut self) -> Result<()> {
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
        // Quick check on stdio: has the child process already exited?
        if let McpTransportConn::Stdio { child } = &mut self.inner {
            if let Ok(Some(_status)) = child.try_wait() {
                return false;
            }
        }

        let timeout = self.timeouts.health_check;
        self.send_request("tools/list", None, timeout).await.is_ok()
    }

    /// Tear down the current connection and rebuild it from the saved config.
    pub async fn reconnect(&mut self) -> Result<()> {
        // Kill the old transport (best-effort)
        self.kill_transport().await;

        match self.config.as_transport() {
            McpTransport::Stdio { command, args, env } => {
                let child = Self::spawn_stdio_child(&self.server_name, &command, &args, &env)?;
                self.inner = McpTransportConn::Stdio { child };
                self.request_id = 0;
                self.initialize().await.context(format!(
                    "[{}] Re-initialization failed after reconnect",
                    self.server_name
                ))?;
                Ok(())
            }
            McpTransport::Sse { url, headers } => {
                let mut fresh = connect_sse(
                    &self.server_name,
                    &url,
                    &headers,
                    self.timeouts.clone(),
                    self.config.clone(),
                )
                .await?;
                // Swap in the fresh transport state without moving fields out
                // of `fresh` (which would conflict with its Drop impl).
                std::mem::swap(&mut self.inner, &mut fresh.inner);
                self.request_id = 0;
                // `fresh` now holds the OLD transport state and will Drop it
                // (closing the prior SSE channel / killing the prior child).
                Ok(())
            }
            McpTransport::Http { url, headers, auth } => {
                let mut fresh = connect_http(
                    &self.server_name,
                    &url,
                    &headers,
                    auth.as_ref(),
                    self.timeouts.clone(),
                    self.config.clone(),
                )
                .await?;
                std::mem::swap(&mut self.inner, &mut fresh.inner);
                self.request_id = 0;
                Ok(())
            }
        }
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
            || msg.contains("SSE channel closed")
            || msg.contains("SSE: POST")
            || msg.contains("SSE GET failed")
            // HTTP transport patterns:
            || msg.contains("[mcp http] POST timeout")
            || msg.contains("[mcp http] sse-upgrade idle timeout")
            || msg.contains("[mcp http] sse-upgrade read error")
            || msg.contains("[mcp http] sse-upgrade closed before response")
            || msg.contains("Connection refused")
            || msg.contains("non-success response 502")
            || msg.contains("non-success response 503")
            || msg.contains("non-success response 504")
    }

    /// Send a JSON-RPC request and wait for response. Dispatches on transport.
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
        let expected_id = self.request_id;
        let method_name = request.method.clone();
        let server_name = self.server_name.clone();

        match &mut self.inner {
            McpTransportConn::Stdio { child } => {
                let mut request_json = serde_json::to_string(&request)?;
                request_json.push('\n');

                let stdin = child.stdin.as_mut().context(format!(
                    "[{}] MCP server stdin not available",
                    server_name
                ))?;
                stdin.write_all(request_json.as_bytes()).await?;
                stdin.flush().await?;

                let stdout = child.stdout.as_mut().context(format!(
                    "[{}] MCP server stdout not available",
                    server_name
                ))?;
                let mut reader = BufReader::new(stdout);
                let mut line = String::new();

                match tokio::time::timeout(timeout, async {
                    loop {
                        line.clear();
                        let bytes_read = reader.read_line(&mut line).await.context(format!(
                            "[{}] Failed to read from MCP server",
                            server_name
                        ))?;

                        if bytes_read == 0 {
                            bail!("[{}] MCP server closed connection", server_name);
                        }

                        let response: JsonRpcResponse = match serde_json::from_str(line.trim()) {
                            Ok(r) => r,
                            Err(_) => {
                                let trimmed = line.trim();
                                if !trimmed.is_empty() {
                                    eprintln!(
                                        "[{}] Skipped non-JSON line: {}",
                                        server_name, trimmed
                                    );
                                }
                                continue;
                            }
                        };

                        if response.id == Some(expected_id) {
                            if let Some(error) = response.error {
                                bail!("[{}] {}", server_name, error);
                            }
                            return Ok(response.result);
                        }
                    }
                })
                .await
                {
                    Ok(result) => result,
                    Err(_) => Err(anyhow::anyhow!(
                        "[{}] MCP server response timeout ({}ms) on '{}'",
                        server_name,
                        timeout.as_millis(),
                        method_name,
                    )),
                }
            }
            McpTransportConn::Sse {
                post_url,
                headers,
                client,
                rx,
                session_id,
            } => {
                // POST the JSON-RPC request to the server's message endpoint.
                let mut req_builder = client
                    .post(post_url.as_str())
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json, text/event-stream")
                    .json(&request);
                for (k, v) in headers.iter() {
                    req_builder = req_builder.header(k, v);
                }
                if let Some(sid) = session_id.as_deref() {
                    req_builder = req_builder.header("Mcp-Session-Id", sid);
                }
                let resp = req_builder.send().await.context(format!(
                    "[{}] SSE: POST '{}' failed",
                    server_name, method_name
                ))?;
                if !resp.status().is_success() {
                    let status = resp.status();
                    let body = resp.text().await.unwrap_or_default();
                    bail!(
                        "[{}] SSE: POST '{}' returned {} — {}",
                        server_name,
                        method_name,
                        status,
                        body
                    );
                }

                // Some servers return the JSON-RPC response inline in the POST
                // body (synchronous transport pattern); others send it through
                // the SSE stream. Try inline first, fall back to channel.
                let inline_body = resp.text().await.unwrap_or_default();
                if !inline_body.trim().is_empty() {
                    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&inline_body) {
                        if let Some(matched) =
                            extract_matching_response(&value, expected_id, &server_name)?
                        {
                            return Ok(matched);
                        }
                    }
                }

                // Drain the SSE channel until we find a matching id.
                match tokio::time::timeout(timeout, async {
                    loop {
                        let frame = match rx.recv().await {
                            Some(f) => f,
                            None => bail!("[{}] SSE channel closed unexpectedly", server_name),
                        };
                        if let Some(matched) =
                            extract_matching_response(&frame, expected_id, &server_name)?
                        {
                            return Ok(matched);
                        }
                        // Otherwise it's a notification or a response for a
                        // different request — keep draining.
                    }
                })
                .await
                {
                    Ok(result) => result,
                    Err(_) => Err(anyhow::anyhow!(
                        "[{}] MCP server response timeout ({}ms) on '{}'",
                        server_name,
                        timeout.as_millis(),
                        method_name,
                    )),
                }
            }
            McpTransportConn::Http {
                url,
                headers,
                client,
                session_id,
                oauth,
                ..
            } => {
                send_request_http(
                    url,
                    headers,
                    client,
                    session_id,
                    oauth.as_ref(),
                    &request,
                    timeout,
                    &server_name,
                    &method_name,
                )
                .await
            }
        }
    }

    /// Send a JSON-RPC notification (no response expected). Dispatches on transport.
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

        match &mut self.inner {
            McpTransportConn::Stdio { child } => {
                let mut json = serde_json::to_string(&notification)?;
                json.push('\n');

                let stdin = child.stdin.as_mut().context(format!(
                    "[{}] MCP server stdin not available",
                    self.server_name
                ))?;
                stdin.write_all(json.as_bytes()).await?;
                stdin.flush().await?;
            }
            McpTransportConn::Sse {
                post_url,
                headers,
                client,
                session_id,
                ..
            } => {
                let mut req_builder = client
                    .post(post_url.as_str())
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json, text/event-stream")
                    .json(&notification);
                for (k, v) in headers.iter() {
                    req_builder = req_builder.header(k, v);
                }
                if let Some(sid) = session_id.as_deref() {
                    req_builder = req_builder.header("Mcp-Session-Id", sid);
                }
                // Notifications don't expect a response — fire and forget.
                if let Err(e) = req_builder.send().await {
                    eprintln!(
                        "[{}] SSE: notification '{}' POST failed: {}",
                        self.server_name, method, e
                    );
                }
            }
            McpTransportConn::Http {
                url,
                headers,
                client,
                session_id,
                oauth,
                ..
            } => {
                let mut req_builder = client
                    .post(url.as_str())
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json, text/event-stream")
                    .json(&notification);
                for (k, v) in headers.iter() {
                    req_builder = req_builder.header(k, v);
                }
                if let Some(sid) = session_id.as_deref() {
                    req_builder = req_builder.header("Mcp-Session-Id", sid);
                }
                // Attach OAuth bearer if we have a cached token. Notifications
                // are fire-and-forget so we don't bother triggering the OAuth
                // dance on 401 here — that happens on the next request.
                if oauth.is_some() {
                    if let Ok(store) = McpOAuthStore::load() {
                        if let Some(tok) = store.get(url.as_str()) {
                            if !tok.is_expiring_soon(60) {
                                req_builder = req_builder.header(
                                    "Authorization",
                                    format!("Bearer {}", tok.access_token),
                                );
                            }
                        }
                    }
                }
                if let Err(e) = req_builder.send().await {
                    eprintln!(
                        "[{}] HTTP: notification '{}' POST failed: {}",
                        self.server_name, method, e
                    );
                }
            }
        }

        Ok(())
    }

    /// Tear down the current transport. For stdio, kill the child process.
    /// For SSE/HTTP, dropping the connection is enough — background tasks
    /// exit when their mpsc senders are dropped (and bytes_streams are
    /// dropped along with their response handles).
    async fn kill_transport(&mut self) {
        match &mut self.inner {
            McpTransportConn::Stdio { child } => {
                #[cfg(unix)]
                kill_process_gracefully(child).await;

                #[cfg(not(unix))]
                {
                    let _ = child.kill().await;
                }
            }
            McpTransportConn::Sse { .. } => {
                // No explicit cleanup — the SSE forwarding task exits when
                // its mpsc sender is dropped (which happens when this
                // McpConnection is dropped or `inner` is overwritten).
            }
            McpTransportConn::Http { .. } => {
                // Same as SSE: the optional notification forwarding task
                // (if any) exits when its mpsc sender is dropped. There's
                // no long-lived process or socket to tear down.
            }
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

        // Tear down the transport (kills child on stdio).
        self.kill_transport().await;

        Ok(())
    }
}

impl Drop for McpConnection {
    fn drop(&mut self) {
        // Best-effort sync cleanup — Drop cannot be async.
        match &mut self.inner {
            McpTransportConn::Stdio { child } => {
                #[cfg(unix)]
                kill_process_gracefully_sync(child);

                #[cfg(not(unix))]
                {
                    // Sync kill via tokio Child::start_kill() — non-blocking, safe in Drop.
                    let _ = child.start_kill();
                }
            }
            McpTransportConn::Sse { .. } => {
                // SSE forwarding task exits naturally when the receiver is
                // dropped here.
            }
            McpTransportConn::Http { .. } => {
                // Same as SSE — the (optional) notification forwarding task
                // exits when its sender is dropped along with this conn.
            }
        }
    }
}

/// Helper: given a JSON value that may be either a single JSON-RPC response
/// or an array of responses, extract the one matching `expected_id`.
/// Returns `Ok(Some(result))` if matched, `Ok(None)` if not in this frame,
/// or `Err(...)` if the matched response carries a JSON-RPC error.
pub(super) fn extract_matching_response(
    frame: &serde_json::Value,
    expected_id: u64,
    server_name: &str,
) -> Result<Option<Option<serde_json::Value>>> {
    // Frames may be a single object or an array (batched responses).
    let candidates: Vec<&serde_json::Value> = if let Some(arr) = frame.as_array() {
        arr.iter().collect()
    } else {
        vec![frame]
    };
    for candidate in candidates {
        let response: JsonRpcResponse = match serde_json::from_value(candidate.clone()) {
            Ok(r) => r,
            Err(_) => continue,
        };
        if response.id == Some(expected_id) {
            if let Some(error) = response.error {
                bail!("[{}] {}", server_name, error);
            }
            return Ok(Some(response.result));
        }
    }
    Ok(None)
}

// ---------------------------------------------------------------------------
// Shared helpers (used by sse.rs and http.rs)
// ---------------------------------------------------------------------------

/// Locate the first occurrence of `needle` in `haystack`.
/// Used by SSE-frame splitters (b"\n\n" boundary detection).
pub(super) fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
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

    // -----------------------------------------------------------------------
    // HIGH-1 + LOW-1: MCP stdio child env sanitization
    // -----------------------------------------------------------------------

    /// Simulate the BLOCKED_MANIFEST_VARS / allowlist logic from spawn_stdio_child
    /// without actually spawning a process — tests the filtering decision only.
    fn filter_manifest_env(
        manifest_env: &HashMap<String, String>,
    ) -> (HashMap<String, String>, Vec<String>) {
        const BLOCKED: &[&str] = &[
            "DYLD_INSERT_LIBRARIES",
            "DYLD_LIBRARY_PATH",
            "DYLD_FORCE_FLAT_NAMESPACE",
            "LD_PRELOAD",
            "LD_LIBRARY_PATH",
            "LD_AUDIT",
            "NODE_OPTIONS",
            "PYTHONPATH",
            "RUBYLIB",
            "PERL5LIB",
            "http_proxy",
            "https_proxy",
            "HTTP_PROXY",
            "HTTPS_PROXY",
            "ALL_PROXY",
            "all_proxy",
        ];
        let mut allowed = HashMap::new();
        let mut blocked_keys = Vec::new();
        for (k, v) in manifest_env {
            let key_upper = k.to_uppercase();
            let is_blocked = BLOCKED.iter().any(|b| b.eq_ignore_ascii_case(k))
                || key_upper.ends_with("_PROXY");
            if is_blocked {
                blocked_keys.push(k.clone());
            } else {
                allowed.insert(k.clone(), v.clone());
            }
        }
        (allowed, blocked_keys)
    }

    fn manifest_env(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn mcp_env_blocks_dyld_insert_libraries() {
        let env = manifest_env(&[("DYLD_INSERT_LIBRARIES", "~/.config/evil.dylib")]);
        let (allowed, blocked) = filter_manifest_env(&env);
        assert!(allowed.get("DYLD_INSERT_LIBRARIES").is_none());
        assert!(blocked.contains(&"DYLD_INSERT_LIBRARIES".to_string()));
    }

    #[test]
    fn mcp_env_blocks_ld_preload() {
        let env = manifest_env(&[("LD_PRELOAD", "/tmp/evil.so")]);
        let (allowed, blocked) = filter_manifest_env(&env);
        assert!(allowed.get("LD_PRELOAD").is_none());
        assert!(blocked.contains(&"LD_PRELOAD".to_string()));
    }

    #[test]
    fn mcp_env_blocks_node_options() {
        let env = manifest_env(&[("NODE_OPTIONS", "--require ./malicious.js")]);
        let (allowed, blocked) = filter_manifest_env(&env);
        assert!(allowed.get("NODE_OPTIONS").is_none());
        assert!(blocked.contains(&"NODE_OPTIONS".to_string()));
    }

    #[test]
    fn mcp_env_blocks_http_proxy() {
        for var in &["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY"] {
            let env = manifest_env(&[(var, "http://attacker.com")]);
            let (allowed, blocked) = filter_manifest_env(&env);
            assert!(allowed.get(*var).is_none(), "{var} should be blocked");
            assert!(blocked.iter().any(|k| k.eq_ignore_ascii_case(var)), "{var} not in blocked list");
        }
    }

    #[test]
    fn mcp_env_blocks_custom_proxy_suffix() {
        // Any *_PROXY var — even one not in the explicit list.
        let env = manifest_env(&[("MY_CUSTOM_PROXY", "http://attacker.com")]);
        let (allowed, blocked) = filter_manifest_env(&env);
        assert!(allowed.get("MY_CUSTOM_PROXY").is_none());
        assert!(blocked.contains(&"MY_CUSTOM_PROXY".to_string()));
    }

    #[test]
    fn mcp_env_allows_path_from_manifest() {
        // Manifest can set PATH to a safer value.
        let env = manifest_env(&[("PATH", "/usr/local/bin:/usr/bin")]);
        let (allowed, blocked) = filter_manifest_env(&env);
        assert_eq!(
            allowed.get("PATH").map(String::as_str),
            Some("/usr/local/bin:/usr/bin")
        );
        assert!(!blocked.contains(&"PATH".to_string()));
    }

    #[test]
    fn mcp_env_allows_safe_custom_vars() {
        let env = manifest_env(&[
            ("MY_SERVER_PORT", "8080"),
            ("DEBUG", "true"),
            ("SERVER_CONFIG", "/etc/myserver.json"),
        ]);
        let (allowed, blocked) = filter_manifest_env(&env);
        assert_eq!(allowed.len(), 3);
        assert!(blocked.is_empty());
    }

    #[test]
    fn mcp_env_blocks_anthropic_api_key_not_re_injected() {
        // ANTHROPIC_API_KEY is not in the ALLOWED_FROM_PARENT list — verify it
        // would not reach the child via the allowlist re-injection path.
        const ALLOWED_FROM_PARENT: &[&str] = &[
            "PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "LC_CTYPE",
            "TMPDIR", "TERM", "SHELL", "XDG_RUNTIME_DIR",
        ];
        assert!(
            !ALLOWED_FROM_PARENT.contains(&"ANTHROPIC_API_KEY"),
            "ANTHROPIC_API_KEY must not be in the parent env allowlist"
        );
        assert!(
            !ALLOWED_FROM_PARENT.contains(&"OPENAI_API_KEY"),
            "OPENAI_API_KEY must not be in the parent env allowlist"
        );
    }

    #[test]
    fn mcp_env_manifest_cannot_inject_dyld_via_manifest() {
        // Even if the manifest tries to set DYLD_INSERT_LIBRARIES, it is blocked.
        let env = manifest_env(&[
            ("DYLD_INSERT_LIBRARIES", "evil.dylib"),
            ("MY_SERVER_VAR", "ok"),
        ]);
        let (allowed, blocked) = filter_manifest_env(&env);
        assert!(allowed.get("DYLD_INSERT_LIBRARIES").is_none());
        assert_eq!(allowed.get("MY_SERVER_VAR").map(String::as_str), Some("ok"));
        assert!(blocked.contains(&"DYLD_INSERT_LIBRARIES".to_string()));
    }
}
