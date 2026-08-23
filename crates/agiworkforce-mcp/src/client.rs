//! The transport-agnostic MCP client: JSON-RPC framing, id correlation,
//! per-operation timeouts, connection-error detection + one-shot tool-call
//! reconnect, and the elicitation dispatch — all ported verbatim (behavior
//! preserved) from the CLI's `McpConnection`.

use anyhow::{Context, Result, anyhow, bail};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;

use agiworkforce_protocol::mcp::{CallToolResult, Tool};

use crate::config::{McpTimeouts, TransportConfig};
use crate::elicitation;
use crate::error::McpError;
use crate::hooks::ClientHooks;
use crate::jsonrpc::{JsonRpcRequest, extract_matching_response, match_single_response};
use crate::notification::McpNotification;
use crate::transport::{http, sse};

/// Transport-specific connection state. Shared JSON-RPC bookkeeping lives on
/// [`McpClient`]. Constructed by the transport bringup in [`crate::transport`].
pub(crate) enum TransportConn {
    Stdio {
        child: Child,
    },
    Sse {
        /// URL for outbound POSTs. May be overridden by an `endpoint` SSE event.
        post_url: String,
        headers: HashMap<String, String>,
        client: reqwest::Client,
        /// Channel receiving server-pushed JSON-RPC frames. Filled by the SSE
        /// background drain task.
        rx: mpsc::Receiver<serde_json::Value>,
        /// Optional session id from `Mcp-Session-Id`, forwarded on POSTs.
        session_id: Option<String>,
    },
    Http {
        url: String,
        headers: HashMap<String, String>,
        client: reqwest::Client,
        /// Sticky session id captured on every response, echoed on requests.
        session_id: Option<String>,
        /// OAuth (PKCE) config if the transport opted in.
        oauth: Option<crate::config::OAuthConfig>,
    },
}

/// A running MCP server connection over one of the three transports.
pub struct McpClient {
    pub(crate) server_name: String,
    transport_config: TransportConfig,
    pub(crate) inner: TransportConn,
    request_id: u64,
    pub(crate) timeouts: McpTimeouts,
    /// Buffered lines from a stdio child's stderr. Empty for SSE/HTTP.
    stderr_buf: Arc<Mutex<Vec<String>>>,
    pub(crate) hooks: ClientHooks,
    /// Best-effort notification fan-out (fed by the SSE drain). Cloned into each
    /// transport (re)connect so a taken receiver survives reconnects.
    notif_tx: mpsc::Sender<McpNotification>,
    notif_rx: Option<mpsc::Receiver<McpNotification>>,
}

impl McpClient {
    /// Connect and run the MCP initialize handshake.
    pub async fn connect(
        server_name: &str,
        config: TransportConfig,
        timeouts: McpTimeouts,
        hooks: ClientHooks,
    ) -> Result<Self, McpError> {
        Self::connect_inner(server_name, config, timeouts, hooks)
            .await
            .map_err(McpError::from)
    }

    async fn connect_inner(
        server_name: &str,
        config: TransportConfig,
        timeouts: McpTimeouts,
        hooks: ClientHooks,
    ) -> Result<Self> {
        let kind = config.kind();
        let mut conn = Self::bringup(server_name, config, timeouts, hooks).await?;

        if kind == "stdio" {
            conn.initialize().await.map_err(|e| {
                let lines = conn
                    .stderr_buf
                    .lock()
                    .map(|l| l.join("\n"))
                    .unwrap_or_default();
                if lines.is_empty() {
                    e
                } else {
                    e.context(format!("[{}] server stderr:\n{lines}", conn.server_name))
                }
            })?;
        } else {
            conn.initialize().await?;
        }

        conn.hooks
            .log(&format!("[{server_name}] MCP connected via {kind}"));
        Ok(conn)
    }

    /// Connect and bring up the transport WITHOUT running the MCP `initialize`
    /// handshake. The host drives its own `initialize` /
    /// `notifications/initialized` via [`Self::request`] / [`Self::notify`].
    ///
    /// Used by hosts (desktop) that own a different protocol version, client
    /// capabilities, and `InitializeResult` capture than this crate's built-in
    /// handshake — the exact handshake bytes stay host-controlled while the
    /// JSON-RPC transport mechanics (framing, id correlation, timeouts,
    /// transports, OAuth) are shared.
    pub async fn connect_without_handshake(
        server_name: &str,
        config: TransportConfig,
        timeouts: McpTimeouts,
        hooks: ClientHooks,
    ) -> Result<Self, McpError> {
        let kind = config.kind();
        let conn = Self::bringup(server_name, config, timeouts, hooks)
            .await
            .map_err(McpError::from)?;
        conn.hooks.log(&format!(
            "[{server_name}] MCP transport up (no handshake) via {kind}"
        ));
        Ok(conn)
    }

    /// Build the connected client with the transport brought up but the MCP
    /// `initialize` handshake NOT yet sent. Shared by [`Self::connect_inner`]
    /// (which then calls [`Self::initialize`]) and
    /// [`Self::connect_without_handshake`] (which leaves the handshake to the
    /// host).
    async fn bringup(
        server_name: &str,
        config: TransportConfig,
        timeouts: McpTimeouts,
        hooks: ClientHooks,
    ) -> Result<Self> {
        let (notif_tx, notif_rx) = mpsc::channel::<McpNotification>(128);
        let stderr_buf: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));

        let inner = match &config {
            TransportConfig::Stdio { command, args, env } => {
                let mut child = Self::spawn_stdio_child(server_name, command, args, env)?;
                Self::spawn_stderr_drain(&mut child, &stderr_buf, server_name);
                TransportConn::Stdio { child }
            }
            TransportConfig::Sse { url, headers } => {
                sse::connect(
                    server_name,
                    url,
                    headers,
                    timeouts.clone(),
                    notif_tx.clone(),
                )
                .await?
            }
            TransportConfig::Http {
                url,
                headers,
                oauth,
            } => http::connect(url, headers, oauth.as_ref(), &timeouts)?,
            TransportConfig::SseLegacy { base_url, headers } => {
                sse::connect_legacy(
                    server_name,
                    base_url,
                    headers,
                    timeouts.clone(),
                    notif_tx.clone(),
                )
                .await?
            }
        };

        Ok(Self {
            server_name: server_name.to_string(),
            transport_config: config,
            inner,
            request_id: 0,
            timeouts,
            stderr_buf,
            hooks,
            notif_tx,
            notif_rx: Some(notif_rx),
        })
    }

    /// Spawn the child process for a stdio MCP server.
    ///
    /// SECURITY: `Command::new()` inherits the full parent env by default.
    /// `DYLD_INSERT_LIBRARIES` (macOS) / `LD_PRELOAD` (Linux) in the parent
    /// shell would inject a malicious dylib into every MCP server child, and
    /// credential env vars would be visible to every server binary. Fix:
    /// `env_clear()` then re-inject only a safe allowlist; the manifest env is
    /// applied after, filtered to exclude loader-injection / proxy-hijack vars.
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
            .stderr(std::process::Stdio::piped());

        cmd.env_clear();

        const ALLOWED_FROM_PARENT: &[&str] = &[
            "PATH",
            "HOME",
            "USER",
            "LOGNAME",
            "LANG",
            "LC_ALL",
            "LC_CTYPE",
            "TMPDIR",
            "TERM",
            "SHELL",
            "XDG_RUNTIME_DIR",
        ];
        for var in ALLOWED_FROM_PARENT {
            if let Ok(val) = std::env::var(var) {
                cmd.env(var, val);
            }
        }

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
                    "[{name}] security: manifest env var {key:?} is blocked (loader-injection / proxy hijack risk)"
                );
                continue;
            }
            if key_upper.ends_with("_PROXY") {
                eprintln!(
                    "[{name}] security: manifest env var {key:?} is blocked (proxy hijack risk)"
                );
                continue;
            }
            cmd.env(key, val);
        }

        cmd.spawn().with_context(|| {
            format!(
                "[{name}] Failed to start MCP server: {command} {}",
                args.join(" ")
            )
        })
    }

    /// Drain a stdio child's stderr on a background task so the pipe never
    /// blocks. Under `AGIWORKFORCE_MCP_DEBUG`, lines are printed immediately;
    /// otherwise buffered and appended to any connection error.
    fn spawn_stderr_drain(child: &mut Child, stderr_buf: &Arc<Mutex<Vec<String>>>, name: &str) {
        let stderr_debug = std::env::var("AGIWORKFORCE_MCP_DEBUG").is_ok();
        if let Some(raw_stderr) = child.stderr.take() {
            let buf = Arc::clone(stderr_buf);
            let server = name.to_string();
            tokio::spawn(async move {
                let mut reader = BufReader::new(raw_stderr);
                let mut line = String::new();
                loop {
                    line.clear();
                    match reader.read_line(&mut line).await {
                        Ok(0) | Err(_) => break,
                        Ok(_) => {
                            let trimmed = line.trim_end_matches('\n').trim_end_matches('\r');
                            if !trimmed.is_empty() {
                                if stderr_debug {
                                    eprintln!("[{server}] stderr: {trimmed}");
                                }
                                if let Ok(mut locked) = buf.lock() {
                                    locked.push(trimmed.to_string());
                                }
                            }
                        }
                    }
                }
            });
        }
    }

    /// Send the MCP initialize handshake, reporting the host-supplied clientInfo.
    pub(crate) async fn initialize(&mut self) -> Result<()> {
        let timeout = self.timeouts.initialize;
        let client_name = self.hooks.client_info.name.clone();
        let client_version = self.hooks.client_info.version.clone();
        let response = self
            .send_rpc(
                "initialize",
                Some(serde_json::json!({
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {
                        "name": client_name,
                        "version": client_version
                    }
                })),
                timeout,
            )
            .await?;

        if let Some(result) = response {
            let _server_info = result.get("serverInfo");
        }

        // Send initialized notification (no response expected).
        self.send_notification("notifications/initialized", None)
            .await?;

        Ok(())
    }

    /// Send a JSON-RPC request and wait for its response. Public boundary — no
    /// automatic reconnect (matches the CLI: only tool calls reconnect). Used
    /// by hosts for `tools/list`, `prompts/list`, `prompts/get`, etc.
    pub async fn request(
        &mut self,
        method: &str,
        params: Option<serde_json::Value>,
        timeout: Duration,
    ) -> Result<Option<serde_json::Value>, McpError> {
        self.send_rpc(method, params, timeout)
            .await
            .map_err(McpError::from)
    }

    /// Discover tools, returned as protocol wire types. Lenient parse (mirrors
    /// `Tool::from_mcp_value`); hosts that need stricter validation drive
    /// [`Self::request`] directly.
    pub async fn list_tools(&mut self) -> Result<Vec<Tool>, McpError> {
        let timeout = self.timeouts.list_tools;
        let response = self.send_rpc("tools/list", None, timeout).await?;

        let tools_json = response
            .and_then(|r| r.get("tools").cloned())
            .and_then(|t| t.as_array().cloned())
            .unwrap_or_default();

        let mut tools = Vec::with_capacity(tools_json.len());
        for tool in tools_json {
            let parsed = Tool::from_mcp_value(tool).map_err(|e| {
                McpError::from(anyhow!("[{}] invalid MCP tool: {e}", self.server_name))
            })?;
            tools.push(parsed);
        }
        Ok(tools)
    }

    /// Execute a tool and return the raw JSON-RPC `result` (or `None` for a
    /// 202-style ack). On a connection error the transport is re-established and
    /// the call retried exactly once — the CLI's original tool-call behavior.
    pub async fn call_tool_value(
        &mut self,
        tool_name: &str,
        arguments: serde_json::Value,
    ) -> Result<Option<serde_json::Value>, McpError> {
        self.call_tool_value_inner(tool_name, arguments)
            .await
            .map_err(McpError::from)
    }

    async fn call_tool_value_inner(
        &mut self,
        tool_name: &str,
        arguments: serde_json::Value,
    ) -> Result<Option<serde_json::Value>> {
        let timeout = self.timeouts.call_tool;
        let params = serde_json::json!({
            "name": tool_name,
            "arguments": arguments,
        });
        let result = self
            .send_rpc("tools/call", Some(params.clone()), timeout)
            .await;

        // On connection error, try to reconnect once and retry.
        let result = match result {
            Err(e) if Self::is_connection_error(&e) => {
                eprintln!(
                    "[{}] Connection lost, attempting reconnect...",
                    self.server_name
                );
                self.reconnect().await.with_context(|| {
                    format!(
                        "[{}] Failed to reconnect after connection error",
                        self.server_name
                    )
                })?;

                self.send_rpc("tools/call", Some(params), timeout).await?
            }
            Err(e) => return Err(e),
            Ok(v) => v,
        };

        Ok(result)
    }

    /// Execute a tool and parse the result as the protocol [`CallToolResult`]
    /// wire type. Reconnects once on connection error (via
    /// [`Self::call_tool_value`]). Hosts that need the CLI's lenient text
    /// extraction drive [`Self::call_tool_value`] instead.
    pub async fn call_tool(
        &mut self,
        tool_name: &str,
        arguments: serde_json::Value,
    ) -> Result<CallToolResult, McpError> {
        let raw = self
            .call_tool_value(tool_name, arguments)
            .await?
            .unwrap_or(serde_json::Value::Null);
        serde_json::from_value::<CallToolResult>(raw).map_err(|e| {
            McpError::from(anyhow!(
                "[{}] tools/call result was not a CallToolResult: {e}",
                self.server_name
            ))
        })
    }

    /// Take the server-notification receiver (fed by the SSE drain). Returns
    /// `None` if already taken — the channel is single-consumer. Only the SSE
    /// transport pushes here; stdio/http yield an idle receiver.
    pub fn notifications(&mut self) -> Option<mpsc::Receiver<McpNotification>> {
        self.notif_rx.take()
    }

    /// Cheap, non-RPC liveness check. For stdio, polls the child process with
    /// `try_wait` (no I/O on the protocol pipes); SSE/HTTP report `true` — their
    /// failures surface on the next request. Used by hosts (desktop health
    /// monitor) that keep a synchronous liveness snapshot; the RPC-based
    /// [`Self::is_alive`] stays for hosts that want a real round-trip probe.
    pub fn transport_alive(&mut self) -> bool {
        match &mut self.inner {
            TransportConn::Stdio { child } => matches!(child.try_wait(), Ok(None)),
            TransportConn::Sse { .. } | TransportConn::Http { .. } => true,
        }
    }

    /// Drain and return any buffered stderr lines from a stdio child, oldest
    /// first. Hosts can stream these into their own per-server log stores
    /// (desktop's MCP server-log viewer). Always empty for SSE/HTTP. Draining
    /// does not affect the connect-time stderr context (that is attached before
    /// the client is handed to the host).
    pub fn drain_stderr(&self) -> Vec<String> {
        self.stderr_buf
            .lock()
            .map(|mut lines| lines.drain(..).collect())
            .unwrap_or_default()
    }

    /// Core request/response dispatch across the three transports. No reconnect.
    async fn send_rpc(
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
        let hooks = self.hooks.clone();
        let elicitation_handler = Arc::clone(&hooks.elicitation);
        let max_frame = self.timeouts.frame_cap();
        let max_response = self.timeouts.response_cap();
        // The POST endpoint of an SSE transport can be replaced at connect time
        // by a hint the *server* pushed, and the headers below are credentials
        // the host configured for the server the user named. Re-check the
        // origin at the sink so no future path can widen it.
        let configured_url = self.transport_config.remote_url().map(str::to_string);

        match &mut self.inner {
            TransportConn::Stdio { child } => {
                let mut request_json = serde_json::to_string(&request)?;
                request_json.push('\n');

                let stdin = child
                    .stdin
                    .as_mut()
                    .with_context(|| format!("[{server_name}] MCP server stdin not available"))?;
                stdin.write_all(request_json.as_bytes()).await?;
                stdin.flush().await?;

                let stdout = child
                    .stdout
                    .as_mut()
                    .with_context(|| format!("[{server_name}] MCP server stdout not available"))?;
                let mut reader = BufReader::new(stdout);
                let mut line = String::new();

                match tokio::time::timeout(timeout, async {
                    loop {
                        line.clear();
                        let bytes_read = reader.read_line(&mut line).await.with_context(|| {
                            format!("[{server_name}] Failed to read from MCP server")
                        })?;

                        if bytes_read == 0 {
                            bail!("[{server_name}] MCP server closed connection");
                        }

                        let trimmed = line.trim();
                        if trimmed.is_empty() {
                            continue;
                        }

                        let frame: serde_json::Value = match serde_json::from_str(trimmed) {
                            Ok(v) => v,
                            Err(_) => {
                                eprintln!("[{server_name}] Skipped non-JSON line: {trimmed}");
                                continue;
                            }
                        };

                        // Detect server-initiated elicitation/create requests.
                        if let Some((srv_method, req_id, params)) = Self::as_server_request(&frame)
                        {
                            if srv_method == "elicitation/create" {
                                if let Ok(elicit_req) = serde_json::from_value::<
                                    elicitation::ElicitationRequest,
                                >(params)
                                {
                                    let resp =
                                        elicitation_handler.handle(&server_name, elicit_req).await;
                                    let reply = serde_json::json!({
                                        "jsonrpc": "2.0",
                                        "id": req_id,
                                        "result": resp,
                                    });
                                    if let Ok(mut json) = serde_json::to_string(&reply) {
                                        json.push('\n');
                                        stdin.write_all(json.as_bytes()).await?;
                                        stdin.flush().await?;
                                    }
                                    continue;
                                }
                            }
                            eprintln!(
                                "[{server_name}] Unhandled server request method '{srv_method}'"
                            );
                            continue;
                        }

                        if let Some(matched) =
                            match_single_response(frame, expected_id, &server_name)?
                        {
                            return Ok(matched);
                        }
                    }
                })
                .await
                {
                    Ok(result) => result,
                    Err(_) => Err(anyhow!(
                        "[{server_name}] MCP server response timeout ({}ms) on '{method_name}'",
                        timeout.as_millis(),
                    )),
                }
            }
            TransportConn::Sse {
                post_url,
                headers,
                client,
                rx,
                session_id,
            } => {
                if let Some(configured) = configured_url.as_deref() {
                    crate::security::enforce_same_origin(
                        configured,
                        post_url.as_str(),
                        "SSE POST endpoint",
                    )
                    .with_context(|| {
                        format!(
                            "[{server_name}] refusing to send configured MCP headers to a foreign origin on '{method_name}'"
                        )
                    })?;
                }
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
                let resp = req_builder
                    .send()
                    .await
                    .with_context(|| format!("[{server_name}] SSE: POST '{method_name}' failed"))?;
                if !resp.status().is_success() {
                    let status = resp.status();
                    let body = http::read_text_capped(resp).await;
                    bail!("[{server_name}] SSE: POST '{method_name}' returned {status} — {body}");
                }

                // Some servers return the JSON-RPC response inline in the POST
                // body; others send it through the SSE stream. Try inline first,
                // under a hard size cap so a hostile server cannot exhaust
                // memory with one giant reply (or a chunked endless one).
                let inline_bytes = http::read_body_capped(resp, max_response)
                    .await
                    .with_context(|| {
                        format!("[{server_name}] SSE: POST '{method_name}' response")
                    })?;
                let inline_body = String::from_utf8_lossy(&inline_bytes).into_owned();
                if !inline_body.trim().is_empty() {
                    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&inline_body) {
                        if let Some(matched) =
                            extract_matching_response(&value, expected_id, &server_name)?
                        {
                            return Ok(matched);
                        }
                    }
                }

                let post_url_clone = post_url.clone();
                let headers_clone = headers.clone();
                let client_clone = client.clone();
                let session_id_clone = session_id.clone();

                match tokio::time::timeout(timeout, async {
                    loop {
                        let frame = match rx.recv().await {
                            Some(f) => f,
                            None => bail!("[{server_name}] SSE channel closed unexpectedly"),
                        };

                        if let Some((srv_method, req_id, params)) = Self::as_server_request(&frame)
                        {
                            if srv_method == "elicitation/create" {
                                if let Ok(elicit_req) = serde_json::from_value::<
                                    elicitation::ElicitationRequest,
                                >(params)
                                {
                                    let elicit_resp =
                                        elicitation_handler.handle(&server_name, elicit_req).await;
                                    Self::reply_elicitation_sse(
                                        &post_url_clone,
                                        &headers_clone,
                                        &client_clone,
                                        session_id_clone.as_deref(),
                                        &req_id,
                                        &elicit_resp,
                                        &server_name,
                                    )
                                    .await;
                                }
                            }
                            continue;
                        }

                        if let Some(matched) =
                            extract_matching_response(&frame, expected_id, &server_name)?
                        {
                            return Ok(matched);
                        }
                        // Otherwise a notification or different-id response — keep draining.
                    }
                })
                .await
                {
                    Ok(result) => result,
                    Err(_) => Err(anyhow!(
                        "[{server_name}] MCP server response timeout ({}ms) on '{method_name}'",
                        timeout.as_millis(),
                    )),
                }
            }
            TransportConn::Http {
                url,
                headers,
                client,
                session_id,
                oauth,
                ..
            } => {
                http::send_request_http(
                    url,
                    headers,
                    client,
                    session_id,
                    oauth.as_ref(),
                    &request,
                    timeout,
                    &server_name,
                    &method_name,
                    &hooks,
                    max_frame,
                    max_response,
                )
                .await
            }
        }
    }

    /// Build a JSON-RPC response frame for an `elicitation/create` request and
    /// POST it back on the SSE transport.
    async fn reply_elicitation_sse(
        post_url: &str,
        headers: &HashMap<String, String>,
        client: &reqwest::Client,
        session_id: Option<&str>,
        request_id: &serde_json::Value,
        response: &elicitation::ElicitationResponse,
        server_name: &str,
    ) {
        let frame = serde_json::json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": response,
        });
        let mut req = client
            .post(post_url)
            .header("Content-Type", "application/json")
            .json(&frame);
        for (k, v) in headers {
            req = req.header(k, v);
        }
        if let Some(sid) = session_id {
            req = req.header("Mcp-Session-Id", sid);
        }
        if let Err(e) = req.send().await {
            eprintln!("[{server_name}] elicitation reply POST failed: {e}");
        }
    }

    /// Check whether a raw JSON frame is any server-initiated request (has both
    /// `method` and `id`). Returns `(method, id, params)`.
    fn as_server_request(
        frame: &serde_json::Value,
    ) -> Option<(&str, serde_json::Value, serde_json::Value)> {
        let method = frame.get("method")?.as_str()?;
        let id = frame.get("id")?.clone();
        let params = frame
            .get("params")
            .cloned()
            .unwrap_or(serde_json::Value::Null);
        Some((method, id, params))
    }

    /// Public wrapper over the transport notification dispatch. Fire-and-forget
    /// (no response). Used by hosts that drive their own handshake / lifecycle
    /// notifications (e.g. `notifications/initialized`,
    /// `notifications/cancelled`) after
    /// [`Self::connect_without_handshake`].
    pub async fn notify(
        &mut self,
        method: &str,
        params: Option<serde_json::Value>,
    ) -> Result<(), McpError> {
        self.send_notification(method, params)
            .await
            .map_err(McpError::from)
    }

    /// Send a JSON-RPC notification (no response expected). Dispatches on transport.
    pub(crate) async fn send_notification(
        &mut self,
        method: &str,
        params: Option<serde_json::Value>,
    ) -> Result<()> {
        let notification = serde_json::json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params.unwrap_or(serde_json::json!({})),
        });
        let server_name = self.server_name.clone();
        let token_store = Arc::clone(&self.hooks.token_store);
        let configured_url = self.transport_config.remote_url().map(str::to_string);

        match &mut self.inner {
            TransportConn::Stdio { child } => {
                let mut json = serde_json::to_string(&notification)?;
                json.push('\n');

                let stdin = child
                    .stdin
                    .as_mut()
                    .with_context(|| format!("[{server_name}] MCP server stdin not available"))?;
                stdin.write_all(json.as_bytes()).await?;
                stdin.flush().await?;
            }
            TransportConn::Sse {
                post_url,
                headers,
                client,
                session_id,
                ..
            } => {
                if let Some(configured) = configured_url.as_deref() {
                    crate::security::enforce_same_origin(
                        configured,
                        post_url.as_str(),
                        "SSE POST endpoint",
                    )
                    .with_context(|| {
                        format!(
                            "[{server_name}] refusing to send configured MCP headers to a foreign origin on '{method}'"
                        )
                    })?;
                }
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
                if let Err(e) = req_builder.send().await {
                    eprintln!("[{server_name}] SSE: notification '{method}' POST failed: {e}");
                }
            }
            TransportConn::Http {
                url,
                headers,
                client,
                session_id,
                oauth,
                ..
            } => {
                // Same sink guard `send_once` applies to requests: the bearer
                // and the configured headers below are credentials, and nothing
                // else on this path re-checks the scheme.
                if let Err(e) = http::refuse_cleartext_credentials(
                    url.as_str(),
                    oauth.is_some() || http::headers_carry_credentials(headers),
                ) {
                    eprintln!("[{server_name}] HTTP: notification '{method}' not sent: {e:#}");
                    return Ok(());
                }
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
                // Attach an OAuth bearer if we have a fresh cached token.
                // Notifications are fire-and-forget so we don't trigger the
                // OAuth dance on 401 — that happens on the next request.
                if oauth.is_some() {
                    if let Some(tok) = token_store.get(url.as_str()) {
                        if !tok.is_expiring_soon(60) {
                            req_builder = req_builder
                                .header("Authorization", format!("Bearer {}", tok.access_token));
                        }
                    }
                }
                if let Err(e) = req_builder.send().await {
                    eprintln!("[{server_name}] HTTP: notification '{method}' POST failed: {e}");
                }
            }
        }

        Ok(())
    }

    /// Check whether the MCP server is still alive and responsive.
    pub async fn is_alive(&mut self) -> bool {
        if let TransportConn::Stdio { child } = &mut self.inner {
            if let Ok(Some(_status)) = child.try_wait() {
                return false;
            }
        }

        let timeout = self.timeouts.health_check;
        self.send_rpc("tools/list", None, timeout).await.is_ok()
    }

    /// Tear down the current connection and rebuild it from the saved config.
    async fn reconnect(&mut self) -> Result<()> {
        self.kill_transport().await;

        match self.transport_config.clone() {
            TransportConfig::Stdio { command, args, env } => {
                let mut child = Self::spawn_stdio_child(&self.server_name, &command, &args, &env)?;
                if let Ok(mut locked) = self.stderr_buf.lock() {
                    locked.clear();
                }
                Self::spawn_stderr_drain(&mut child, &self.stderr_buf, &self.server_name);
                self.inner = TransportConn::Stdio { child };
                self.request_id = 0;
                self.initialize().await.with_context(|| {
                    format!(
                        "[{}] Re-initialization failed after reconnect",
                        self.server_name
                    )
                })?;
                Ok(())
            }
            TransportConfig::Sse { url, headers } => {
                let inner = sse::connect(
                    &self.server_name,
                    &url,
                    &headers,
                    self.timeouts.clone(),
                    self.notif_tx.clone(),
                )
                .await?;
                self.inner = inner;
                self.request_id = 0;
                self.initialize().await?;
                Ok(())
            }
            TransportConfig::Http {
                url,
                headers,
                oauth,
            } => {
                let inner = http::connect(&url, &headers, oauth.as_ref(), &self.timeouts)?;
                self.inner = inner;
                self.request_id = 0;
                self.initialize().await?;
                Ok(())
            }
            TransportConfig::SseLegacy { base_url, headers } => {
                let inner = sse::connect_legacy(
                    &self.server_name,
                    &base_url,
                    &headers,
                    self.timeouts.clone(),
                    self.notif_tx.clone(),
                )
                .await?;
                self.inner = inner;
                self.request_id = 0;
                self.initialize().await?;
                Ok(())
            }
        }
    }

    /// Determine if an error looks like a connection / IO / timeout failure.
    fn is_connection_error(err: &anyhow::Error) -> bool {
        let msg = format!("{err:#}");
        msg.contains("closed connection")
            || msg.contains("stdin not available")
            || msg.contains("stdout not available")
            || msg.contains("response timeout")
            || msg.contains("Broken pipe")
            || msg.contains("Connection reset")
            || msg.contains("SSE channel closed")
            || msg.contains("SSE: POST")
            || msg.contains("SSE GET failed")
            || msg.contains("[mcp http] POST timeout")
            || msg.contains("[mcp http] sse-upgrade idle timeout")
            || msg.contains("[mcp http] sse-upgrade read error")
            || msg.contains("[mcp http] sse-upgrade closed before response")
            || msg.contains("Connection refused")
            || msg.contains("non-success response 502")
            || msg.contains("non-success response 503")
            || msg.contains("non-success response 504")
    }

    /// Tear down the current transport. For stdio, kill the child process. For
    /// SSE/HTTP, dropping the connection state is enough.
    async fn kill_transport(&mut self) {
        match &mut self.inner {
            TransportConn::Stdio { child } => {
                #[cfg(unix)]
                kill_process_gracefully(child).await;

                #[cfg(not(unix))]
                {
                    let _ = child.kill().await;
                }
            }
            TransportConn::Sse { .. } => {}
            TransportConn::Http { .. } => {}
        }
    }

    /// Shut down the MCP server gracefully.
    pub async fn shutdown(&mut self) -> Result<(), McpError> {
        // Try graceful shutdown.
        let _ = self
            .send_notification("notifications/cancelled", None)
            .await;

        tokio::time::sleep(Duration::from_millis(100)).await;

        self.kill_transport().await;

        Ok(())
    }
}

impl Drop for McpClient {
    fn drop(&mut self) {
        // Best-effort sync cleanup — Drop cannot be async.
        match &mut self.inner {
            TransportConn::Stdio { child } => {
                #[cfg(unix)]
                kill_process_gracefully_sync(child);

                #[cfg(not(unix))]
                {
                    let _ = child.start_kill();
                }
            }
            TransportConn::Sse { .. } => {}
            TransportConn::Http { .. } => {}
        }
    }
}

/// Send SIGTERM, wait briefly, then SIGKILL if needed. Async variant.
#[cfg(unix)]
async fn kill_process_gracefully(child: &mut Child) {
    use nix::sys::signal::{Signal, kill};
    use nix::unistd::Pid;

    if let Some(pid) = child.id() {
        let pid = Pid::from_raw(pid as i32);
        let _ = kill(pid, Signal::SIGTERM);
        tokio::time::sleep(Duration::from_secs(2)).await;
        if child.try_wait().ok().flatten().is_none() {
            let _ = kill(pid, Signal::SIGKILL);
        }
    }
}

/// Sync variant for Drop context (cannot use async).
#[cfg(unix)]
fn kill_process_gracefully_sync(child: &mut Child) {
    use nix::sys::signal::{Signal, kill};
    use nix::unistd::Pid;

    if let Some(pid) = child.id() {
        let pid = Pid::from_raw(pid as i32);
        let _ = kill(pid, Signal::SIGTERM);
        std::thread::sleep(Duration::from_millis(100));
        if child.try_wait().ok().flatten().is_none() {
            let _ = kill(pid, Signal::SIGKILL);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::elicitation::AutoDeclineHandler;
    use crate::hooks::{ClientInfo, DenyBrowserAuthorizer, InMemoryTokenStore, noop_log};

    fn test_hooks() -> ClientHooks {
        ClientHooks {
            token_store: Arc::new(InMemoryTokenStore::new()),
            elicitation: Arc::new(AutoDeclineHandler),
            browser: Arc::new(DenyBrowserAuthorizer),
            client_info: ClientInfo {
                name: "unit-test".to_string(),
                version: "0.0.0".to_string(),
            },
            on_log: noop_log(),
        }
    }

    fn auth_header() -> HashMap<String, String> {
        HashMap::from([("Authorization".to_string(), "Bearer s3cret".to_string())])
    }

    // -----------------------------------------------------------------------
    // Credentials never transit a cleartext remote connection
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn http_bringup_refuses_cleartext_credentials() {
        // Http bringup is lazy (no I/O), so the refusal must land at connect.
        let err = match McpClient::connect_without_handshake(
            "cleartext-http",
            TransportConfig::Http {
                url: "http://mcp.example.com/".to_string(),
                headers: auth_header(),
                oauth: None,
            },
            McpTimeouts::default(),
            test_hooks(),
        )
        .await
        {
            Ok(_) => panic!("cleartext credentials must be refused"),
            Err(e) => e,
        };
        let msg = format!("{:#}", err.as_anyhow());
        assert!(msg.contains("must use HTTPS"), "unexpected error: {msg}");
    }

    #[tokio::test]
    async fn legacy_sse_bringup_refuses_cleartext_credentials() {
        let err = match McpClient::connect_without_handshake(
            "cleartext-legacy",
            TransportConfig::SseLegacy {
                base_url: "http://mcp.example.com/".to_string(),
                headers: auth_header(),
            },
            McpTimeouts::default(),
            test_hooks(),
        )
        .await
        {
            Ok(_) => panic!("cleartext credentials must be refused"),
            Err(e) => e,
        };
        let msg = format!("{:#}", err.as_anyhow());
        assert!(msg.contains("must use HTTPS"), "unexpected error: {msg}");
    }

    #[tokio::test]
    async fn sse_bringup_refuses_cleartext_credentials_before_any_request() {
        let err = match McpClient::connect_without_handshake(
            "cleartext-sse",
            TransportConfig::Sse {
                url: "http://mcp.example.com/sse".to_string(),
                headers: auth_header(),
            },
            McpTimeouts::default(),
            test_hooks(),
        )
        .await
        {
            Ok(_) => panic!("cleartext credentials must be refused"),
            Err(e) => e,
        };
        let msg = format!("{:#}", err.as_anyhow());
        assert!(msg.contains("must use HTTPS"), "unexpected error: {msg}");
    }

    // -----------------------------------------------------------------------
    // Connection-error detection
    // -----------------------------------------------------------------------

    #[test]
    fn is_connection_error_closed() {
        assert!(McpClient::is_connection_error(&anyhow!(
            "MCP server closed connection"
        )));
    }

    #[test]
    fn is_connection_error_stdin() {
        assert!(McpClient::is_connection_error(&anyhow!(
            "MCP server stdin not available"
        )));
    }

    #[test]
    fn is_connection_error_timeout() {
        assert!(McpClient::is_connection_error(&anyhow!(
            "MCP server response timeout (30000ms)"
        )));
    }

    #[test]
    fn is_connection_error_broken_pipe() {
        assert!(McpClient::is_connection_error(&anyhow!("Broken pipe")));
    }

    #[test]
    fn is_connection_error_reset() {
        assert!(McpClient::is_connection_error(&anyhow!(
            "Connection reset by peer"
        )));
    }

    #[test]
    fn is_connection_error_http_timeout() {
        assert!(McpClient::is_connection_error(&anyhow!(
            "[srv] [mcp http] POST timeout (5000ms) on 'tools/call'"
        )));
    }

    #[test]
    fn is_not_connection_error_protocol() {
        assert!(!McpClient::is_connection_error(&anyhow!(
            "MCP error -32600: Invalid Request"
        )));
    }

    #[test]
    fn is_not_connection_error_json() {
        assert!(!McpClient::is_connection_error(&anyhow!(
            "Failed to parse JSON response"
        )));
    }

    // -----------------------------------------------------------------------
    // Stdio child env sanitization (decision logic mirrored, no spawn)
    // -----------------------------------------------------------------------

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
            let is_blocked =
                BLOCKED.iter().any(|b| b.eq_ignore_ascii_case(k)) || key_upper.ends_with("_PROXY");
            if is_blocked {
                blocked_keys.push(k.clone());
            } else {
                allowed.insert(k.clone(), v.clone());
            }
        }
        (allowed, blocked_keys)
    }

    fn manifest_env(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn env_blocks_dyld_insert_libraries() {
        let env = manifest_env(&[("DYLD_INSERT_LIBRARIES", "~/.config/evil.dylib")]);
        let (allowed, blocked) = filter_manifest_env(&env);
        assert!(!allowed.contains_key("DYLD_INSERT_LIBRARIES"));
        assert!(blocked.contains(&"DYLD_INSERT_LIBRARIES".to_string()));
    }

    #[test]
    fn env_blocks_ld_preload() {
        let env = manifest_env(&[("LD_PRELOAD", "/tmp/evil.so")]);
        let (allowed, blocked) = filter_manifest_env(&env);
        assert!(!allowed.contains_key("LD_PRELOAD"));
        assert!(blocked.contains(&"LD_PRELOAD".to_string()));
    }

    #[test]
    fn env_blocks_node_options() {
        let env = manifest_env(&[("NODE_OPTIONS", "--require ./malicious.js")]);
        let (allowed, blocked) = filter_manifest_env(&env);
        assert!(!allowed.contains_key("NODE_OPTIONS"));
        assert!(blocked.contains(&"NODE_OPTIONS".to_string()));
    }

    #[test]
    fn env_blocks_http_proxy_family() {
        for var in &[
            "HTTP_PROXY",
            "HTTPS_PROXY",
            "http_proxy",
            "https_proxy",
            "ALL_PROXY",
        ] {
            let env = manifest_env(&[(var, "http://attacker.com")]);
            let (allowed, blocked) = filter_manifest_env(&env);
            assert!(!allowed.contains_key(*var), "{var} should be blocked");
            assert!(
                blocked.iter().any(|k| k.eq_ignore_ascii_case(var)),
                "{var} not in blocked list"
            );
        }
    }

    #[test]
    fn env_blocks_custom_proxy_suffix() {
        let env = manifest_env(&[("MY_CUSTOM_PROXY", "http://attacker.com")]);
        let (allowed, blocked) = filter_manifest_env(&env);
        assert!(!allowed.contains_key("MY_CUSTOM_PROXY"));
        assert!(blocked.contains(&"MY_CUSTOM_PROXY".to_string()));
    }

    #[test]
    fn env_allows_path_from_manifest() {
        let env = manifest_env(&[("PATH", "/usr/local/bin:/usr/bin")]);
        let (allowed, blocked) = filter_manifest_env(&env);
        assert_eq!(
            allowed.get("PATH").map(String::as_str),
            Some("/usr/local/bin:/usr/bin")
        );
        assert!(!blocked.contains(&"PATH".to_string()));
    }

    #[test]
    fn env_allows_safe_custom_vars() {
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
    fn env_api_keys_not_in_parent_allowlist() {
        const ALLOWED_FROM_PARENT: &[&str] = &[
            "PATH",
            "HOME",
            "USER",
            "LOGNAME",
            "LANG",
            "LC_ALL",
            "LC_CTYPE",
            "TMPDIR",
            "TERM",
            "SHELL",
            "XDG_RUNTIME_DIR",
        ];
        assert!(!ALLOWED_FROM_PARENT.contains(&"ANTHROPIC_API_KEY"));
        assert!(!ALLOWED_FROM_PARENT.contains(&"OPENAI_API_KEY"));
    }
}
