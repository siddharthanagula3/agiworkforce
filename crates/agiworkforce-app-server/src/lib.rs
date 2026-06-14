//! AGI Workforce app-server — JSON-RPC stdio + WebSocket transport exposing
//! the tool catalog and `tools/call` dispatch to programmatic clients
//! (desktop bridge, MCP host, automation scripts).
//!
//! Tool dispatch is injected via the [`ToolDispatch`] trait so this crate
//! never depends on the cli's tool implementations. The cli wires its own
//! `CliToolDispatch` at construction.
//!
//! Methods supported:
//! - `initialize` — handshake, returns capabilities + server info.
//! - `tools/list` — enumerated catalog from `ToolDispatch::list_tools`.
//! - `tools/call` — dispatches via `ToolDispatch::call_tool` with `{name, arguments}` params.
//! - `shutdown` — clean exit (stdio mode closes the loop).
//!
//! A second entry point `run_mcp_server` speaks the MCP wire protocol on
//! stdio with a single `agiworkforce_exec` tool — used when the cli is
//! launched as an MCP server from another agent. That path does NOT use the
//! `ToolDispatch` trait by design (it exposes a single, agent-facing entry).

use anyhow::Result;
use async_trait::async_trait;
use axum::extract::ws::{Message, WebSocket};
use axum::extract::WebSocketUpgrade;
use axum::http::header::{AUTHORIZATION, ORIGIN};
use axum::http::{HeaderMap, StatusCode, Uri};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;

// ---------------------------------------------------------------------------
// Tool dispatch trait
// ---------------------------------------------------------------------------

/// Pluggable tool dispatch surface. Implementations enumerate tools for
/// `tools/list` and execute them for `tools/call`. The returned JSON
/// follows MCP conventions: each tool entry is `{name, description, inputSchema}`
/// and each call result is `{content: [...], isError: bool}`.
#[async_trait]
pub trait ToolDispatch: Send + Sync {
    /// Enumerate available tools as MCP-style JSON entries.
    async fn list_tools(&self) -> Vec<serde_json::Value>;

    /// Invoke a tool by name with arbitrary JSON arguments.
    async fn call_tool(&self, name: &str, args: serde_json::Value) -> Result<serde_json::Value>;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default)]
pub enum AppServerTransport {
    #[default]
    Stdio,
    WebSocket {
        addr: SocketAddr,
    },
}

#[derive(Debug, Clone)]
pub struct AppServerConfig {
    pub transport: AppServerTransport,
    pub max_sessions: usize,
    pub session_timeout_secs: u64,
    pub ws_security: WebSocketSecurity,
}

#[derive(Debug, Clone, Default)]
pub struct WebSocketSecurity {
    pub auth_token: Option<String>,
    pub allowed_origins: Vec<String>,
    /// Accept `?token=` during the WebSocket upgrade. Disabled by default
    /// because URL tokens are commonly captured by logs and browser history.
    pub allow_query_token: bool,
}

impl Default for AppServerConfig {
    fn default() -> Self {
        Self {
            transport: AppServerTransport::default(),
            max_sessions: 10,
            session_timeout_secs: 3600,
            ws_security: WebSocketSecurity::default(),
        }
    }
}

// ---------------------------------------------------------------------------
// JSON-RPC envelope
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: Option<serde_json::Value>,
    pub method: String,
    #[serde(default)]
    pub params: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
}

impl JsonRpcResponse {
    pub fn ok(id: Option<serde_json::Value>, result: serde_json::Value) -> Self {
        Self {
            jsonrpc: "2.0".into(),
            id,
            result: Some(result),
            error: None,
        }
    }
    pub fn err(id: Option<serde_json::Value>, code: i32, msg: String) -> Self {
        Self {
            jsonrpc: "2.0".into(),
            id,
            result: None,
            error: Some(JsonRpcError { code, message: msg }),
        }
    }
}

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

/// Routes JSON-RPC method names to handler functions, optionally backed by a
/// `ToolDispatch` implementation for `tools/list` / `tools/call`.
pub struct Processor {
    dispatch: Arc<dyn ToolDispatch>,
}

impl Processor {
    pub fn new(dispatch: Arc<dyn ToolDispatch>) -> Self {
        Self { dispatch }
    }

    pub async fn process(&self, req: JsonRpcRequest) -> JsonRpcResponse {
        match req.method.as_str() {
            "initialize" => JsonRpcResponse::ok(
                req.id,
                serde_json::json!({
                    "capabilities": {"tools": true, "streaming": true},
                    "serverInfo": {
                        "name": "agiworkforce-app-server",
                        "version": env!("CARGO_PKG_VERSION"),
                    },
                }),
            ),
            "tools/list" => {
                let tools = self.dispatch.list_tools().await;
                JsonRpcResponse::ok(req.id, serde_json::json!({ "tools": tools }))
            }
            "tools/call" => {
                let name = req
                    .params
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                if name.is_empty() {
                    return JsonRpcResponse::err(
                        req.id,
                        -32602,
                        "Missing required parameter: name".to_string(),
                    );
                }
                let args = req
                    .params
                    .get("arguments")
                    .cloned()
                    .unwrap_or(serde_json::Value::Null);
                match self.dispatch.call_tool(&name, args).await {
                    Ok(result) => JsonRpcResponse::ok(req.id, result),
                    Err(e) => JsonRpcResponse::err(req.id, -32603, format!("Tool error: {e}")),
                }
            }
            "shutdown" => JsonRpcResponse::ok(req.id, serde_json::json!({ "shutdown": true })),
            _ => JsonRpcResponse::err(req.id, -32601, format!("Method not found: {}", req.method)),
        }
    }
}

// ---------------------------------------------------------------------------
// Run entry points
// ---------------------------------------------------------------------------

/// Run the JSON-RPC app server on the configured transport. Inject a
/// concrete `ToolDispatch` to plumb `tools/call` to real tool implementations.
pub async fn run_app_server(
    config: AppServerConfig,
    dispatch: Arc<dyn ToolDispatch>,
) -> Result<()> {
    let AppServerConfig {
        transport,
        ws_security,
        ..
    } = config;
    match transport {
        AppServerTransport::Stdio => run_stdio(dispatch).await,
        AppServerTransport::WebSocket { addr } => run_ws(addr, ws_security, dispatch).await,
    }
}

async fn run_ws(
    addr: SocketAddr,
    security: WebSocketSecurity,
    dispatch: Arc<dyn ToolDispatch>,
) -> Result<()> {
    if security
        .auth_token
        .as_deref()
        .is_none_or(|token| token.trim().is_empty())
    {
        anyhow::bail!("WebSocket app-server requires a non-empty auth token");
    }
    let proc = Arc::new(Processor::new(dispatch));
    let listen_addr = addr;
    let app = Router::new()
        .route(
            "/ws",
            get({
                let p = Arc::clone(&proc);
                let security = security.clone();
                move |ws: WebSocketUpgrade, headers: HeaderMap, uri: Uri| {
                    let p = Arc::clone(&p);
                    let security = security.clone();
                    async move {
                        match validate_ws_request(&headers, &uri, listen_addr, &security) {
                            Ok(()) => ws.on_upgrade(move |s| handle_ws(s, p)).into_response(),
                            Err(status) => status.into_response(),
                        }
                    }
                }
            }),
        )
        .route("/health", get(|| async { "ok" }));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    eprintln!("App server on ws://{}", addr);
    axum::serve(listener, app).await?;
    Ok(())
}

fn validate_ws_request(
    headers: &HeaderMap,
    uri: &Uri,
    addr: SocketAddr,
    security: &WebSocketSecurity,
) -> std::result::Result<(), StatusCode> {
    let expected_token = security
        .auth_token
        .as_deref()
        .filter(|token| !token.trim().is_empty())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    if request_token(headers, uri, security.allow_query_token).as_deref() != Some(expected_token) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    if !origin_allowed(headers, addr, &security.allowed_origins) {
        return Err(StatusCode::FORBIDDEN);
    }

    Ok(())
}

fn request_token(headers: &HeaderMap, uri: &Uri, allow_query_token: bool) -> Option<String> {
    if let Some(value) = headers.get(AUTHORIZATION).and_then(|v| v.to_str().ok()) {
        if let Some(token) = value.strip_prefix("Bearer ") {
            return Some(token.to_string());
        }
    }

    if let Some(value) = headers
        .get("x-agi-app-server-token")
        .and_then(|v| v.to_str().ok())
    {
        return Some(value.to_string());
    }

    if allow_query_token {
        uri.query()?.split('&').find_map(|pair| {
            let (key, value) = pair.split_once('=')?;
            (key == "token").then(|| value.to_string())
        })
    } else {
        None
    }
}

fn origin_allowed(headers: &HeaderMap, addr: SocketAddr, configured: &[String]) -> bool {
    let Some(origin) = headers.get(ORIGIN).and_then(|v| v.to_str().ok()) else {
        // Defense-in-depth: when an explicit allowlist is configured, treat a
        // missing Origin as untrusted (reject) so a non-browser client cannot
        // skip the cross-site origin check by omitting the header. When no
        // explicit allowlist is set we fall back to permissive loopback defaults
        // (local dev / native tooling legitimately omit Origin); token auth in
        // `validate_ws_request` remains the mandatory boundary for that case.
        return configured.is_empty();
    };
    let origin = normalize_origin(origin);
    let allowed = if configured.is_empty() {
        default_allowed_origins(addr)
    } else {
        configured.to_vec()
    };

    allowed
        .iter()
        .map(|candidate| normalize_origin(candidate))
        .any(|candidate| candidate == origin)
}

fn normalize_origin(origin: &str) -> String {
    origin.trim().trim_end_matches('/').to_ascii_lowercase()
}

fn default_allowed_origins(addr: SocketAddr) -> Vec<String> {
    let port = addr.port();
    [
        format!("http://localhost:{port}"),
        format!("https://localhost:{port}"),
        format!("http://127.0.0.1:{port}"),
        format!("https://127.0.0.1:{port}"),
        format!("http://[::1]:{port}"),
        format!("https://[::1]:{port}"),
    ]
    .into()
}

async fn handle_ws(mut socket: WebSocket, proc: Arc<Processor>) {
    while let Some(Ok(msg)) = futures_util::StreamExt::next(&mut socket).await {
        if let Message::Text(text) = msg {
            let resp = match serde_json::from_str::<JsonRpcRequest>(&text) {
                Ok(req) => proc.process(req).await,
                Err(e) => JsonRpcResponse::err(None, -32700, format!("Parse error: {e}")),
            };
            if let Ok(j) = serde_json::to_string(&resp) {
                if let Err(e) =
                    futures_util::SinkExt::send(&mut socket, Message::Text(j.into())).await
                {
                    eprintln!("WebSocket send error: {e}");
                    break;
                }
            }
        }
    }
}

async fn run_stdio(dispatch: Arc<dyn ToolDispatch>) -> Result<()> {
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    let proc = Processor::new(dispatch);
    let mut reader = BufReader::new(tokio::io::stdin());
    let mut stdout = tokio::io::stdout();
    eprintln!("App server on stdio");
    let mut line = String::new();
    loop {
        line.clear();
        if reader.read_line(&mut line).await? == 0 {
            break;
        }
        let t = line.trim();
        if t.is_empty() {
            continue;
        }
        let (resp, is_shutdown) = match serde_json::from_str::<JsonRpcRequest>(t) {
            Ok(req) => {
                let shutdown = req.method == "shutdown";
                (proc.process(req).await, shutdown)
            }
            Err(e) => (
                JsonRpcResponse::err(None, -32700, format!("Parse error: {e}")),
                false,
            ),
        };
        let j = serde_json::to_string(&resp)?;
        stdout.write_all(j.as_bytes()).await?;
        stdout.write_all(b"\n").await?;
        stdout.flush().await?;
        if is_shutdown {
            break;
        }
    }
    Ok(())
}

/// MCP-protocol stdio handler. Exposes a single `agiworkforce_exec` tool —
/// the entry point used when the cli is launched as an MCP server from
/// another agent. Independent of the `ToolDispatch` trait.
pub async fn run_mcp_server() -> Result<()> {
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    let mut reader = BufReader::new(tokio::io::stdin());
    let mut stdout = tokio::io::stdout();
    let mut initialized = false;
    let mut line = String::new();
    loop {
        line.clear();
        if reader.read_line(&mut line).await? == 0 {
            break;
        }
        let t = line.trim();
        if t.is_empty() {
            continue;
        }
        let req: serde_json::Value = match serde_json::from_str(t) {
            Ok(v) => v,
            Err(e) => {
                let resp = JsonRpcResponse::err(None, -32700, format!("Parse error: {e}"));
                let j = serde_json::to_string(&resp)?;
                stdout.write_all(j.as_bytes()).await?;
                stdout.write_all(b"\n").await?;
                stdout.flush().await?;
                continue;
            }
        };
        let method = req.get("method").and_then(|v| v.as_str()).unwrap_or("");
        let id = req.get("id").cloned();
        let resp = match method {
            "initialize" => {
                initialized = true;
                JsonRpcResponse::ok(
                    id,
                    serde_json::json!({
                        "protocolVersion": "2024-11-05",
                        "capabilities": {"tools": {}},
                        "serverInfo": {
                            "name": "agiworkforce",
                            "version": env!("CARGO_PKG_VERSION"),
                        },
                    }),
                )
            }
            "tools/list" if initialized => JsonRpcResponse::ok(
                id,
                serde_json::json!({
                    "tools": [{
                        "name": "agiworkforce_exec",
                        "description": "Execute prompt via AGI Workforce",
                        "inputSchema": {
                            "type": "object",
                            "properties": {"prompt": {"type": "string"}},
                            "required": ["prompt"],
                        },
                    }],
                }),
            ),
            "notifications/initialized" => continue,
            _ => JsonRpcResponse::err(id, -32601, format!("Unknown: {}", method)),
        };
        let j = serde_json::to_string(&resp)?;
        stdout.write_all(j.as_bytes()).await?;
        stdout.write_all(b"\n").await?;
        stdout.flush().await?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// In-memory mock dispatch for unit tests.
    struct MockDispatch {
        tools: Vec<serde_json::Value>,
        last_call: tokio::sync::Mutex<Option<(String, serde_json::Value)>>,
    }

    impl MockDispatch {
        fn new() -> Self {
            Self {
                tools: vec![serde_json::json!({
                    "name": "echo",
                    "description": "Echo input back",
                    "inputSchema": {"type": "object", "properties": {"msg": {"type": "string"}}}
                })],
                last_call: tokio::sync::Mutex::new(None),
            }
        }
    }

    #[async_trait]
    impl ToolDispatch for MockDispatch {
        async fn list_tools(&self) -> Vec<serde_json::Value> {
            self.tools.clone()
        }

        async fn call_tool(
            &self,
            name: &str,
            args: serde_json::Value,
        ) -> Result<serde_json::Value> {
            *self.last_call.lock().await = Some((name.to_string(), args.clone()));
            if name == "echo" {
                Ok(serde_json::json!({
                    "content": [{"type": "text", "text": args.get("msg").and_then(|v| v.as_str()).unwrap_or("")}],
                    "isError": false,
                }))
            } else {
                anyhow::bail!("unknown tool: {name}")
            }
        }
    }

    fn req(id: i64, method: &str, params: serde_json::Value) -> JsonRpcRequest {
        JsonRpcRequest {
            jsonrpc: "2.0".into(),
            id: Some(serde_json::json!(id)),
            method: method.into(),
            params,
        }
    }

    fn ws_security() -> WebSocketSecurity {
        WebSocketSecurity {
            auth_token: Some("secret-token".into()),
            allowed_origins: Vec::new(),
            allow_query_token: false,
        }
    }

    #[test]
    fn ws_security_rejects_missing_token() {
        let headers = HeaderMap::new();
        let uri: Uri = "/ws".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        assert_eq!(
            validate_ws_request(&headers, &uri, addr, &ws_security()),
            Err(StatusCode::UNAUTHORIZED)
        );
    }

    #[test]
    fn ws_security_accepts_bearer_token_and_loopback_origin() {
        let mut headers = HeaderMap::new();
        headers.insert(AUTHORIZATION, "Bearer secret-token".parse().unwrap());
        headers.insert(ORIGIN, "http://localhost:8787".parse().unwrap());
        let uri: Uri = "/ws".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        assert_eq!(
            validate_ws_request(&headers, &uri, addr, &ws_security()),
            Ok(())
        );
    }

    #[test]
    fn ws_security_accepts_custom_header_token() {
        let mut headers = HeaderMap::new();
        headers.insert("x-agi-app-server-token", "secret-token".parse().unwrap());
        let uri: Uri = "/ws".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        assert_eq!(
            validate_ws_request(&headers, &uri, addr, &ws_security()),
            Ok(())
        );
    }

    #[test]
    fn ws_security_rejects_query_token_by_default() {
        let headers = HeaderMap::new();
        let uri: Uri = "/ws?token=secret-token".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        assert_eq!(
            validate_ws_request(&headers, &uri, addr, &ws_security()),
            Err(StatusCode::UNAUTHORIZED)
        );
    }

    #[test]
    fn ws_security_accepts_query_token_when_explicitly_enabled() {
        let headers = HeaderMap::new();
        let uri: Uri = "/ws?token=secret-token".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        let mut security = ws_security();
        security.allow_query_token = true;

        assert_eq!(validate_ws_request(&headers, &uri, addr, &security), Ok(()));
    }

    #[test]
    fn ws_security_rejects_untrusted_origin() {
        let mut headers = HeaderMap::new();
        headers.insert(AUTHORIZATION, "Bearer secret-token".parse().unwrap());
        headers.insert(ORIGIN, "https://evil.example".parse().unwrap());
        let uri: Uri = "/ws".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        assert_eq!(
            validate_ws_request(&headers, &uri, addr, &ws_security()),
            Err(StatusCode::FORBIDDEN)
        );
    }

    #[test]
    fn ws_security_rejects_missing_origin_when_allowlist_configured() {
        // Defense-in-depth: with an explicit allowlist set, a request that omits
        // the Origin header must not bypass the cross-site origin check.
        let mut headers = HeaderMap::new();
        headers.insert(AUTHORIZATION, "Bearer secret-token".parse().unwrap());
        let uri: Uri = "/ws".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        let mut security = ws_security();
        security.allowed_origins = vec!["https://trusted.example".into()];
        assert_eq!(
            validate_ws_request(&headers, &uri, addr, &security),
            Err(StatusCode::FORBIDDEN)
        );
    }

    #[test]
    fn ws_security_allows_missing_origin_without_explicit_allowlist() {
        // With no explicit allowlist (defaults), missing Origin stays permissive
        // for native/local tooling; token auth remains the mandatory boundary.
        let mut headers = HeaderMap::new();
        headers.insert(AUTHORIZATION, "Bearer secret-token".parse().unwrap());
        let uri: Uri = "/ws".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        assert_eq!(
            validate_ws_request(&headers, &uri, addr, &ws_security()),
            Ok(())
        );
    }

    #[tokio::test]
    async fn initialize_returns_capabilities() {
        let p = Processor::new(Arc::new(MockDispatch::new()));
        let resp = p.process(req(1, "initialize", serde_json::json!({}))).await;
        let result = resp.result.expect("initialize should succeed");
        assert_eq!(result["capabilities"]["tools"], serde_json::json!(true));
        assert_eq!(
            result["serverInfo"]["name"],
            serde_json::json!("agiworkforce-app-server")
        );
    }

    #[tokio::test]
    async fn tools_list_returns_dispatch_catalog() {
        let p = Processor::new(Arc::new(MockDispatch::new()));
        let resp = p.process(req(2, "tools/list", serde_json::json!({}))).await;
        let result = resp.result.expect("tools/list should succeed");
        let tools = result["tools"].as_array().expect("tools array");
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0]["name"], "echo");
        assert!(tools[0]["inputSchema"].is_object(),);
    }

    #[tokio::test]
    async fn tools_call_dispatches_to_trait() {
        let mock = Arc::new(MockDispatch::new());
        let p = Processor::new(mock.clone());
        let resp = p
            .process(req(
                3,
                "tools/call",
                serde_json::json!({"name": "echo", "arguments": {"msg": "hello"}}),
            ))
            .await;
        let result = resp.result.expect("tools/call should succeed");
        assert_eq!(result["isError"], serde_json::json!(false));
        assert_eq!(result["content"][0]["text"], serde_json::json!("hello"));

        let last = mock.last_call.lock().await;
        assert_eq!(
            *last,
            Some(("echo".into(), serde_json::json!({"msg": "hello"})))
        );
    }

    #[tokio::test]
    async fn tools_call_missing_name_returns_invalid_params() {
        let p = Processor::new(Arc::new(MockDispatch::new()));
        let resp = p
            .process(req(4, "tools/call", serde_json::json!({"arguments": {}})))
            .await;
        let err = resp.error.expect("missing name should error");
        assert_eq!(err.code, -32602);
    }

    #[tokio::test]
    async fn tools_call_unknown_tool_returns_internal_error() {
        let p = Processor::new(Arc::new(MockDispatch::new()));
        let resp = p
            .process(req(
                5,
                "tools/call",
                serde_json::json!({"name": "nope", "arguments": {}}),
            ))
            .await;
        let err = resp.error.expect("unknown tool should error");
        assert_eq!(err.code, -32603);
        assert!(err.message.contains("unknown tool"));
    }

    #[tokio::test]
    async fn unknown_method_returns_method_not_found() {
        let p = Processor::new(Arc::new(MockDispatch::new()));
        let resp = p
            .process(req(6, "bogus/method", serde_json::json!({})))
            .await;
        let err = resp.error.expect("unknown method should error");
        assert_eq!(err.code, -32601);
    }

    #[tokio::test]
    async fn shutdown_acknowledged() {
        let p = Processor::new(Arc::new(MockDispatch::new()));
        let resp = p.process(req(7, "shutdown", serde_json::json!({}))).await;
        assert_eq!(resp.result, Some(serde_json::json!({"shutdown": true})));
    }
}
