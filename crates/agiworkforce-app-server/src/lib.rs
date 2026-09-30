//! AGI Workforce app-server transport layer.
//!
//! The primary developer-session protocol runs the full host-owned agent over
//! typed JSONL stdio or authenticated WebSocket: threads, turns, streaming,
//! interruption, MCP status, and approval round-trips share one contract.
//!
//! A legacy direct-tool JSON-RPC surface remains available to embedders through
//! [`run_app_server`]. Tool dispatch is injected through [`ToolDispatch`], so
//! this crate never depends on CLI tool implementations. Its methods are:
//! - `initialize`: handshake, returns capabilities + server info.
//! - `tools/list`: enumerated catalog from `ToolDispatch::list_tools`.
//! - `tools/call`: dispatches via `ToolDispatch::call_tool` with `{name, arguments}` params.
//! - `shutdown`: clean exit (stdio mode closes the loop).

mod developer_sessions;

pub use developer_sessions::{
    run_developer_session_stdio, serve_developer_session_io, DeveloperConnectionTrust,
    DeveloperSessionHost, DeveloperSessionHostError, DeveloperSessionProcessor,
};

use agiworkforce_protocol::developer_session::{
    method as developer_method, AppServerCapabilities, AppServerNotification, AppServerRequest,
    AppServerResponse,
};
use anyhow::Result;
use async_trait::async_trait;
use axum::extract::ws::{Message, WebSocket};
use axum::extract::WebSocketUpgrade;
use axum::http::header::{AUTHORIZATION, HOST, ORIGIN};
use axum::http::uri::Authority;
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

#[derive(Debug, Clone, Default)]
pub struct AppServerConfig {
    pub transport: AppServerTransport,
    pub ws_security: WebSocketSecurity,
}

#[derive(Debug, Clone, Default)]
pub struct WebSocketSecurity {
    pub auth_token: Option<String>,
    pub allowed_origins: Vec<String>,
    /// Accept `?token=` during the WebSocket upgrade. Disabled by default
    /// because URL tokens are commonly captured by logs and browser history.
    pub allow_query_token: bool,
    pub allow_public_listen: bool,
}

impl WebSocketSecurity {
    fn authorize_listen_address(&self, addr: SocketAddr) -> Result<()> {
        if !self.allow_public_listen && !addr.ip().is_loopback() {
            anyhow::bail!(
                "app-server refuses non-loopback listen address {addr}; pass --allow-public-listen only after adding network/firewall controls"
            );
        }
        if self
            .auth_token
            .as_deref()
            .is_none_or(|token| token.trim().is_empty())
        {
            anyhow::bail!("WebSocket app-server requires a non-empty auth token");
        }
        Ok(())
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
    security.authorize_listen_address(addr)?;
    let proc = Arc::new(Processor::new(dispatch));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    let listen_addr = listener.local_addr()?;
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
                            Ok(_) => ws.on_upgrade(move |s| handle_ws(s, p)).into_response(),
                            Err(status) => status.into_response(),
                        }
                    }
                }
            }),
        )
        .route("/health", get(|| async { "ok" }));
    eprintln!("App server on ws://{}", listen_addr);
    axum::serve(listener, app).await?;
    Ok(())
}

/// Run the full typed developer-session protocol over an authenticated
/// WebSocket. Each connection receives its own handshake/client identity while
/// sharing the host's durable threads, turns, tools, MCP attachments, and
/// approval continuations.
pub async fn run_developer_session_websocket(
    addr: SocketAddr,
    security: WebSocketSecurity,
    host: Arc<dyn DeveloperSessionHost>,
    capabilities: AppServerCapabilities,
) -> Result<()> {
    security.authorize_listen_address(addr)?;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    eprintln!("Developer app server on ws://{}", listener.local_addr()?);
    serve_developer_session_websocket(listener, security, host, capabilities).await
}

/// Serve the full typed developer-session protocol on an already-bound TCP
/// listener. Accepting a listener keeps port selection race-free for embedded
/// hosts and integration tests.
pub async fn serve_developer_session_websocket(
    listener: tokio::net::TcpListener,
    security: WebSocketSecurity,
    host: Arc<dyn DeveloperSessionHost>,
    capabilities: AppServerCapabilities,
) -> Result<()> {
    let listen_addr = listener.local_addr()?;
    security.authorize_listen_address(listen_addr)?;
    let app = Router::new()
        .route(
            "/ws",
            get({
                let host = Arc::clone(&host);
                let capabilities = capabilities.clone();
                let security = security.clone();
                move |ws: WebSocketUpgrade, headers: HeaderMap, uri: Uri| {
                    let host = Arc::clone(&host);
                    let capabilities = capabilities.clone();
                    let security = security.clone();
                    async move {
                        match validate_ws_request(&headers, &uri, listen_addr, &security) {
                            Ok(trust) => ws
                                .on_upgrade(move |socket| {
                                    handle_developer_session_ws(socket, host, capabilities, trust)
                                })
                                .into_response(),
                            Err(status) => status.into_response(),
                        }
                    }
                }
            }),
        )
        .route("/health", get(|| async { "ok" }));

    axum::serve(listener, app).await?;
    Ok(())
}

/// Validate an upgrade and report how the connection proved itself.
///
/// A token presented in a header stays out of browser history, proxy logs and
/// referrers; a `?token=` query does not. The caller carries that difference
/// forward so credential-minting methods can refuse the weaker proof.
fn validate_ws_request(
    headers: &HeaderMap,
    uri: &Uri,
    addr: SocketAddr,
    security: &WebSocketSecurity,
) -> std::result::Result<DeveloperConnectionTrust, StatusCode> {
    if !host_allowed(headers, uri, addr) {
        return Err(StatusCode::FORBIDDEN);
    }

    let expected_token = security
        .auth_token
        .as_deref()
        .filter(|token| !token.trim().is_empty())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let presented = request_token(headers, uri, security.allow_query_token);
    let Some(presented) = presented else {
        return Err(StatusCode::UNAUTHORIZED);
    };
    if !tokens_match(presented.token.as_bytes(), expected_token.as_bytes()) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    if !origin_allowed(headers, addr, &security.allowed_origins) {
        return Err(StatusCode::FORBIDDEN);
    }

    Ok(presented.trust)
}

fn host_allowed(headers: &HeaderMap, uri: &Uri, addr: SocketAddr) -> bool {
    if !addr.ip().is_loopback() {
        return true;
    }
    let Some(authority) = headers
        .get(HOST)
        .and_then(|value| value.to_str().ok())
        .or_else(|| uri.authority().map(Authority::as_str))
    else {
        return false;
    };
    let Ok(authority) = authority.trim().parse::<Authority>() else {
        return false;
    };
    let host = authority
        .host()
        .trim_start_matches('[')
        .trim_end_matches(']');
    let names_loopback = host.eq_ignore_ascii_case("localhost")
        || host
            .parse::<std::net::IpAddr>()
            .is_ok_and(|ip| ip.is_loopback());
    names_loopback && authority.port_u16().unwrap_or(80) == addr.port()
}

fn tokens_match(presented: &[u8], expected: &[u8]) -> bool {
    let mut difference = presented.len() ^ expected.len();
    for (index, expected_byte) in expected.iter().enumerate() {
        let presented_byte = presented.get(index).copied().unwrap_or(0);
        difference |= usize::from(presented_byte ^ expected_byte);
    }
    std::hint::black_box(difference) == 0
}

struct PresentedToken {
    token: String,
    trust: DeveloperConnectionTrust,
}

fn request_token(
    headers: &HeaderMap,
    uri: &Uri,
    allow_query_token: bool,
) -> Option<PresentedToken> {
    if let Some(value) = headers.get(AUTHORIZATION).and_then(|v| v.to_str().ok()) {
        if let Some(token) = value.strip_prefix("Bearer ") {
            return Some(PresentedToken {
                token: token.to_string(),
                trust: DeveloperConnectionTrust::LoopbackOwner,
            });
        }
    }

    if let Some(value) = headers
        .get("x-agi-app-server-token")
        .and_then(|v| v.to_str().ok())
    {
        return Some(PresentedToken {
            token: value.to_string(),
            trust: DeveloperConnectionTrust::LoopbackOwner,
        });
    }

    if allow_query_token {
        uri.query()?.split('&').find_map(|pair| {
            let (key, value) = pair.split_once('=')?;
            (key == "token").then(|| PresentedToken {
                token: value.to_string(),
                trust: DeveloperConnectionTrust::Untrusted,
            })
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

async fn handle_developer_session_ws(
    socket: WebSocket,
    host: Arc<dyn DeveloperSessionHost>,
    capabilities: AppServerCapabilities,
    trust: DeveloperConnectionTrust,
) {
    let mut processor = DeveloperSessionProcessor::new_with_trust(host, capabilities, trust);
    let mut notifications = processor.subscribe();
    let (mut sender, mut receiver) = futures_util::StreamExt::split(socket);
    let mut initialized = false;

    loop {
        tokio::select! {
            incoming = futures_util::StreamExt::next(&mut receiver) => {
                let Some(incoming) = incoming else {
                    break;
                };
                let message = match incoming {
                    Ok(message) => message,
                    Err(error) => {
                        eprintln!("Developer app-server WebSocket receive error: {error}");
                        break;
                    }
                };

                match message {
                    Message::Text(text) => {
                        let (response, is_initialize, is_shutdown) =
                            match serde_json::from_str::<AppServerRequest>(text.as_str()) {
                                Ok(request) => {
                                    let is_initialize = request.method == developer_method::INITIALIZE;
                                    let is_shutdown = request.method == developer_method::SHUTDOWN;
                                    (processor.process(request).await, is_initialize, is_shutdown)
                                }
                                Err(error) => (
                                    AppServerResponse::failure(
                                        serde_json::Value::Null,
                                        -32700,
                                        format!("Parse error: {error}"),
                                    ),
                                    false,
                                    false,
                                ),
                            };
                        if is_initialize && response.error.is_none() {
                            initialized = true;
                        }
                        if send_developer_ws_json(&mut sender, &response).await.is_err() {
                            break;
                        }
                        if is_shutdown && response.error.is_none() {
                            break;
                        }
                    }
                    Message::Binary(_) => {
                        let response = AppServerResponse::failure(
                            serde_json::Value::Null,
                            -32700,
                            "Developer-session requests must be UTF-8 JSON text",
                        );
                        if send_developer_ws_json(&mut sender, &response).await.is_err() {
                            break;
                        }
                    }
                    Message::Ping(payload) => {
                        if futures_util::SinkExt::send(&mut sender, Message::Pong(payload))
                            .await
                            .is_err()
                        {
                            break;
                        }
                    }
                    Message::Pong(_) => {}
                    Message::Close(_) => break,
                }
            }
            notification = notifications.recv(), if initialized => {
                match notification {
                    Ok(notification) => {
                        if send_developer_ws_json(&mut sender, &notification).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                        let warning = match AppServerNotification::new(
                            "server/warning",
                            serde_json::json!({
                                "code": "notification_lag",
                                "skipped": skipped,
                            }),
                        ) {
                            Ok(warning) => warning,
                            Err(error) => {
                                eprintln!("Developer app-server warning serialization failed: {error}");
                                break;
                            }
                        };
                        if send_developer_ws_json(&mut sender, &warning).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }

    let _ = futures_util::SinkExt::close(&mut sender).await;
}

async fn send_developer_ws_json(
    sender: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    value: &impl Serialize,
) -> Result<()> {
    let serialized = serde_json::to_string(value)?;
    futures_util::SinkExt::send(sender, Message::Text(serialized.into())).await?;
    Ok(())
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
            allow_public_listen: false,
        }
    }

    fn loopback_headers() -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(HOST, "127.0.0.1:8787".parse().unwrap());
        headers
    }

    #[test]
    fn ws_security_rejects_missing_token() {
        let headers = loopback_headers();
        let uri: Uri = "/ws".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        assert_eq!(
            validate_ws_request(&headers, &uri, addr, &ws_security()),
            Err(StatusCode::UNAUTHORIZED)
        );
    }

    #[test]
    fn ws_security_accepts_bearer_token_and_loopback_origin() {
        let mut headers = loopback_headers();
        headers.insert(AUTHORIZATION, "Bearer secret-token".parse().unwrap());
        headers.insert(ORIGIN, "http://localhost:8787".parse().unwrap());
        let uri: Uri = "/ws".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        assert_eq!(
            validate_ws_request(&headers, &uri, addr, &ws_security()),
            Ok(DeveloperConnectionTrust::LoopbackOwner)
        );
    }

    #[test]
    fn ws_security_accepts_custom_header_token() {
        let mut headers = loopback_headers();
        headers.insert("x-agi-app-server-token", "secret-token".parse().unwrap());
        let uri: Uri = "/ws".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        assert_eq!(
            validate_ws_request(&headers, &uri, addr, &ws_security()),
            Ok(DeveloperConnectionTrust::LoopbackOwner)
        );
    }

    #[test]
    fn ws_security_rejects_query_token_by_default() {
        let headers = loopback_headers();
        let uri: Uri = "/ws?token=secret-token".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        assert_eq!(
            validate_ws_request(&headers, &uri, addr, &ws_security()),
            Err(StatusCode::UNAUTHORIZED)
        );
    }

    #[test]
    fn ws_security_accepts_query_token_when_explicitly_enabled() {
        let headers = loopback_headers();
        let uri: Uri = "/ws?token=secret-token".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        let mut security = ws_security();
        security.allow_query_token = true;

        // A URL token authenticates the connection but is logged by browsers
        // and proxies, so it never carries credential-minting trust.
        assert_eq!(
            validate_ws_request(&headers, &uri, addr, &security),
            Ok(DeveloperConnectionTrust::Untrusted)
        );
    }

    #[test]
    fn ws_security_rejects_untrusted_origin() {
        let mut headers = loopback_headers();
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
        let mut headers = loopback_headers();
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
        let mut headers = loopback_headers();
        headers.insert(AUTHORIZATION, "Bearer secret-token".parse().unwrap());
        let uri: Uri = "/ws".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        assert_eq!(
            validate_ws_request(&headers, &uri, addr, &ws_security()),
            Ok(DeveloperConnectionTrust::LoopbackOwner)
        );
    }

    #[test]
    fn ws_security_rejects_a_host_the_loopback_server_is_not_bound_to() {
        let uri: Uri = "/ws".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        for host in [
            "attacker.example:8787",
            "localhost.attacker.example:8787",
            "localhost:9999",
            "192.168.1.20:8787",
            "",
        ] {
            let mut headers = HeaderMap::new();
            headers.insert(HOST, host.parse().unwrap());
            headers.insert(AUTHORIZATION, "Bearer secret-token".parse().unwrap());
            assert_eq!(
                validate_ws_request(&headers, &uri, addr, &ws_security()),
                Err(StatusCode::FORBIDDEN),
                "{host}"
            );
        }
    }

    #[test]
    fn ws_security_accepts_every_loopback_name_for_the_bound_port() {
        let uri: Uri = "/ws".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        for host in [
            "127.0.0.1:8787",
            "localhost:8787",
            "LOCALHOST:8787",
            "[::1]:8787",
        ] {
            let mut headers = HeaderMap::new();
            headers.insert(HOST, host.parse().unwrap());
            headers.insert(AUTHORIZATION, "Bearer secret-token".parse().unwrap());
            assert_eq!(
                validate_ws_request(&headers, &uri, addr, &ws_security()),
                Ok(DeveloperConnectionTrust::LoopbackOwner),
                "{host}"
            );
        }
    }

    #[test]
    fn ws_security_rejects_tokens_that_only_share_a_prefix() {
        let uri: Uri = "/ws".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        for presented in ["secret", "secret-token-2", "secret-tokeN", ""] {
            let mut headers = loopback_headers();
            headers.insert(
                AUTHORIZATION,
                format!("Bearer {presented}").parse().unwrap(),
            );
            assert_eq!(
                validate_ws_request(&headers, &uri, addr, &ws_security()),
                Err(StatusCode::UNAUTHORIZED),
                "{presented}"
            );
        }
        assert!(tokens_match(b"secret-token", b"secret-token"));
        assert!(!tokens_match(b"secret-token", b"secret-tokem"));
        assert!(!tokens_match(b"secret-token\0", b"secret-token"));
    }

    #[test]
    fn a_public_listen_address_needs_the_explicit_opt_in() {
        let public: SocketAddr = "0.0.0.0:8788".parse().unwrap();
        let loopback: SocketAddr = "127.0.0.1:8788".parse().unwrap();
        assert!(ws_security().authorize_listen_address(public).is_err());
        assert!(ws_security().authorize_listen_address(loopback).is_ok());
        let mut opted_in = ws_security();
        opted_in.allow_public_listen = true;
        assert!(opted_in.authorize_listen_address(public).is_ok());
    }

    #[tokio::test]
    async fn the_library_refuses_a_public_bind_whatever_the_caller_checked() {
        let config = AppServerConfig {
            transport: AppServerTransport::WebSocket {
                addr: "0.0.0.0:0".parse().unwrap(),
            },
            ws_security: ws_security(),
        };

        let outcome = tokio::time::timeout(
            std::time::Duration::from_secs(5),
            run_app_server(config, Arc::new(MockDispatch::new())),
        )
        .await
        .expect("a public bind must be refused, not served");

        assert!(outcome
            .expect_err("public listen without opt-in")
            .to_string()
            .contains("non-loopback"));
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
