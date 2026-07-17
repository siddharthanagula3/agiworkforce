//! Shared sim harness for the MCP client integration tests.
//!
//! Provides:
//!   * `spawn` — bind an axum app on a random loopback port.
//!   * hooks builders (`decline_hooks`, `hooks_with`) + a fixed test `ClientInfo`.
//!   * `http_basic` / `http_oauth` / `http_stale` / `http_oversized` — scripted
//!     Streamable-HTTP MCP servers.
//!   * `sse_sim` — a scripted SSE MCP server (endpoint hint + inline POST
//!     responses) with a transient-failure counter for the reconnect case.
//!
//! These replay fixed transcripts so the tests are the frozen contract the
//! desktop d2 swap must keep green.

#![allow(dead_code)]

use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use axum::{
    Router,
    body::Body,
    extract::Request,
    http::{HeaderMap, StatusCode},
    response::Response,
    routing::{get, post},
};
use futures_util::StreamExt;

use agiworkforce_mcp::hooks::{InMemoryTokenStore, noop_log};
use agiworkforce_mcp::{
    AutoDeclineHandler, BrowserAuthorizer, ClientHooks, ClientInfo, ElicitationHandler,
};

pub fn client_info() -> ClientInfo {
    ClientInfo {
        name: "test-harness".to_string(),
        version: "9.9.9".to_string(),
    }
}

/// Hooks with a caller-supplied elicitation handler + browser authorizer.
pub fn hooks_with(
    elicitation: Arc<dyn ElicitationHandler>,
    browser: Arc<dyn BrowserAuthorizer>,
) -> ClientHooks {
    ClientHooks {
        token_store: Arc::new(InMemoryTokenStore::new()),
        elicitation,
        browser,
        client_info: client_info(),
        on_log: noop_log(),
    }
}

/// The safe non-interactive default: auto-decline elicitations, deny browser.
pub fn decline_hooks() -> ClientHooks {
    hooks_with(Arc::new(AutoDeclineHandler), Arc::new(DenyBrowser))
}

/// A browser authorizer that reports non-interactive and never opens anything.
pub struct DenyBrowser;
impl BrowserAuthorizer for DenyBrowser {
    fn is_interactive(&self) -> bool {
        false
    }
    fn open_url(&self, _url: &str) -> bool {
        false
    }
}

/// Bind an axum app on a random loopback port and return its address.
pub async fn spawn(app: Router) -> SocketAddr {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    addr
}

/// One recorded inbound request.
#[derive(Debug, Clone)]
pub struct RecordedReq {
    pub method: String,
    pub session: Option<String>,
    pub authorization: Option<String>,
    pub body: serde_json::Value,
}

#[derive(Default)]
pub struct HttpRecord {
    pub requests: Mutex<Vec<RecordedReq>>,
}

impl HttpRecord {
    pub fn methods(&self) -> Vec<String> {
        self.requests
            .lock()
            .unwrap()
            .iter()
            .map(|r| r.method.clone())
            .collect()
    }
    pub fn last_for(&self, method: &str) -> Option<RecordedReq> {
        self.requests
            .lock()
            .unwrap()
            .iter()
            .rev()
            .find(|r| r.method == method)
            .cloned()
    }
}

fn header(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(String::from)
}

fn record(rec: &HttpRecord, headers: &HeaderMap, body: &serde_json::Value) -> String {
    let method = body
        .get("method")
        .and_then(|m| m.as_str())
        .unwrap_or("")
        .to_string();
    rec.requests.lock().unwrap().push(RecordedReq {
        method: method.clone(),
        session: header(headers, "Mcp-Session-Id"),
        authorization: header(headers, "Authorization"),
        body: body.clone(),
    });
    method
}

fn json_response(status: StatusCode, session_id: Option<&str>, body: String) -> Response {
    let mut builder = Response::builder()
        .status(status)
        .header("Content-Type", "application/json");
    if let Some(sid) = session_id {
        builder = builder.header("Mcp-Session-Id", sid);
    }
    builder.body(Body::from(body)).unwrap()
}

fn rpc_result(id: &serde_json::Value, result: serde_json::Value) -> String {
    serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": result }).to_string()
}

fn initialize_result() -> serde_json::Value {
    serde_json::json!({
        "protocolVersion": "2024-11-05",
        "serverInfo": { "name": "http-sim", "version": "0.0.0" },
        "capabilities": {}
    })
}

fn tools_list_result() -> serde_json::Value {
    serde_json::json!({
        "tools": [{
            "name": "echo",
            "description": "Echo the input back.",
            "inputSchema": { "type": "object", "properties": { "text": { "type": "string" } } }
        }]
    })
}

fn tools_call_result(args: &serde_json::Value) -> serde_json::Value {
    let text = args
        .get("text")
        .and_then(|t| t.as_str())
        .unwrap_or("(none)")
        .to_string();
    serde_json::json!({
        "content": [{ "type": "text", "text": text }],
        "isError": false
    })
}

// ---------------------------------------------------------------------------
// Streamable-HTTP sims
// ---------------------------------------------------------------------------

/// A basic Streamable-HTTP MCP server: initialize + tools/list + tools/call,
/// inline JSON responses, echoing the request id. If `session_id` is set, it is
/// returned on `initialize` and recorded on every later request (stickiness).
pub fn http_basic(session_id: Option<String>) -> (Router, Arc<HttpRecord>) {
    let rec = Arc::new(HttpRecord::default());
    let rec2 = Arc::clone(&rec);
    let app = Router::new().route(
        "/",
        post(move |headers: HeaderMap, body: String| {
            let rec = Arc::clone(&rec2);
            let session_id = session_id.clone();
            async move {
                let frame: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
                let method = record(&rec, &headers, &frame);
                let id = frame.get("id").cloned().unwrap_or(serde_json::Value::Null);
                match method.as_str() {
                    "initialize" => json_response(
                        StatusCode::OK,
                        session_id.as_deref(),
                        rpc_result(&id, initialize_result()),
                    ),
                    "notifications/initialized" | "notifications/cancelled" => {
                        json_response(StatusCode::ACCEPTED, None, String::new())
                    }
                    "tools/list" => {
                        json_response(StatusCode::OK, None, rpc_result(&id, tools_list_result()))
                    }
                    "tools/call" => {
                        let args = frame
                            .get("params")
                            .and_then(|p| p.get("arguments"))
                            .cloned()
                            .unwrap_or(serde_json::Value::Null);
                        json_response(
                            StatusCode::OK,
                            None,
                            rpc_result(&id, tools_call_result(&args)),
                        )
                    }
                    _ => {
                        json_response(StatusCode::OK, None, rpc_result(&id, serde_json::json!({})))
                    }
                }
            }
        }),
    );
    (app, rec)
}

/// A Streamable-HTTP server that requires OAuth: every request without a valid
/// bearer gets a 401 pointing at the discovery metadata. Once a bearer is
/// present, requests succeed. Serves RFC 9728/8414/7591 discovery + token.
pub fn http_oauth() -> (Router, Arc<HttpRecord>) {
    let rec = Arc::new(HttpRecord::default());
    let rec_mcp = Arc::clone(&rec);

    let mcp = move |headers: HeaderMap, body: String| {
        let rec = Arc::clone(&rec_mcp);
        async move {
            let frame: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
            let method = record(&rec, &headers, &frame);
            let id = frame.get("id").cloned().unwrap_or(serde_json::Value::Null);
            let has_bearer = header(&headers, "Authorization")
                .map(|a| a.starts_with("Bearer "))
                .unwrap_or(false);
            if !has_bearer {
                let host = header(&headers, "host").unwrap_or_else(|| "127.0.0.1".to_string());
                return Response::builder()
                    .status(StatusCode::UNAUTHORIZED)
                    .header(
                        "WWW-Authenticate",
                        format!(
                            "Bearer resource_metadata=\"http://{host}/.well-known/oauth-protected-resource\""
                        ),
                    )
                    .body(Body::from("unauthorized"))
                    .unwrap();
            }
            let result = match method.as_str() {
                "initialize" => initialize_result(),
                "tools/list" => tools_list_result(),
                "tools/call" => tools_call_result(&serde_json::json!({})),
                _ => serde_json::json!({}),
            };
            if method.starts_with("notifications/") {
                return json_response(StatusCode::ACCEPTED, None, String::new());
            }
            json_response(StatusCode::OK, None, rpc_result(&id, result))
        }
    };

    // Discovery + token endpoints. `authorization_endpoint` is never actually
    // fetched — the driving browser shortcuts straight to the redirect_uri.
    let prm = get(|req: Request| async move {
        let host = host_of(&req);
        axum::Json(serde_json::json!({
            "resource": format!("http://{host}/"),
            "authorization_servers": [format!("http://{host}")]
        }))
    });
    let asm = get(|req: Request| async move {
        let host = host_of(&req);
        axum::Json(serde_json::json!({
            "authorization_endpoint": format!("http://{host}/authorize"),
            "token_endpoint": format!("http://{host}/token"),
            "registration_endpoint": format!("http://{host}/register")
        }))
    });
    let register =
        post(|| async { axum::Json(serde_json::json!({ "client_id": "sim-client-id" })) });
    let token = post(|| async {
        axum::Json(serde_json::json!({
            "access_token": "sim-access-token",
            "token_type": "Bearer",
            "expires_in": 3600,
            "refresh_token": "sim-refresh-token"
        }))
    });

    let app = Router::new()
        .route("/", post(mcp))
        .route("/.well-known/oauth-protected-resource", prm)
        .route("/.well-known/oauth-authorization-server", asm)
        .route("/register", register)
        .route("/token", token);
    (app, rec)
}

fn host_of(req: &Request) -> String {
    req.headers()
        .get("host")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("127.0.0.1")
        .to_string()
}

/// A server whose `tools/list` never responds (the request hangs), so the
/// client's per-op timeout fires. `initialize` succeeds so connect works.
pub fn http_stale() -> Router {
    Router::new().route(
        "/",
        post(|headers: HeaderMap, body: String| async move {
            let frame: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
            let method = frame
                .get("method")
                .and_then(|m| m.as_str())
                .unwrap_or("")
                .to_string();
            let id = frame.get("id").cloned().unwrap_or(serde_json::Value::Null);
            let _ = &headers;
            match method.as_str() {
                "initialize" => {
                    json_response(StatusCode::OK, None, rpc_result(&id, initialize_result()))
                }
                "notifications/initialized" | "notifications/cancelled" => {
                    json_response(StatusCode::ACCEPTED, None, String::new())
                }
                _ => {
                    // Hang: never send response headers → client POST times out.
                    tokio::time::sleep(Duration::from_secs(30)).await;
                    json_response(StatusCode::OK, None, rpc_result(&id, serde_json::json!({})))
                }
            }
        }),
    )
}

/// A server whose `tools/call` returns an SSE-upgrade stream with one enormous
/// frame (no boundary), to exercise the optional frame cap.
pub fn http_oversized(frame_bytes: usize) -> Router {
    Router::new().route(
        "/",
        post(move |_headers: HeaderMap, body: String| async move {
            let frame: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
            let method = frame
                .get("method")
                .and_then(|m| m.as_str())
                .unwrap_or("")
                .to_string();
            let id = frame.get("id").cloned().unwrap_or(serde_json::Value::Null);
            match method.as_str() {
                "initialize" => {
                    json_response(StatusCode::OK, None, rpc_result(&id, initialize_result()))
                }
                "notifications/initialized" | "notifications/cancelled" => {
                    json_response(StatusCode::ACCEPTED, None, String::new())
                }
                "tools/call" => {
                    // One giant `data:` line with no "\n\n" boundary.
                    let payload = "x".repeat(frame_bytes);
                    Response::builder()
                        .status(StatusCode::OK)
                        .header("Content-Type", "text/event-stream")
                        .body(Body::from(format!("data: {payload}")))
                        .unwrap()
                }
                _ => json_response(StatusCode::OK, None, rpc_result(&id, serde_json::json!({}))),
            }
        }),
    )
}

// ---------------------------------------------------------------------------
// SSE sim
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct SseRecord {
    pub get_hits: AtomicUsize,
    pub call_attempts: AtomicUsize,
}

/// A scripted SSE MCP server.
///
/// `GET /sse` emits an `event: endpoint` hint pointing at `/messages`, then
/// holds the stream open. `POST /messages` answers inline. The first
/// `tools/call` returns 503 (a transient drop that trips the client's
/// connection-error reconnect); after `fail_calls` failures it returns the real
/// result. `get_hits` counts stream (re)connections.
pub fn sse_sim(fail_calls: usize) -> (Router, Arc<SseRecord>) {
    let rec = Arc::new(SseRecord::default());
    let rec_get = Arc::clone(&rec);
    let rec_post = Arc::clone(&rec);

    let sse_get = get(move |req: Request| {
        let rec = Arc::clone(&rec_get);
        async move {
            rec.get_hits.fetch_add(1, Ordering::SeqCst);
            let host = host_of(&req);
            let endpoint = format!("http://{host}/messages");
            let first = futures_util::stream::once(async move {
                Ok::<_, std::io::Error>(axum::body::Bytes::from(format!(
                    "event: endpoint\ndata: {endpoint}\n\n"
                )))
            });
            // Keep the stream open after the hint.
            let body = Body::from_stream(first.chain(futures_util::stream::pending()));
            Response::builder()
                .status(StatusCode::OK)
                .header("Content-Type", "text/event-stream")
                .body(body)
                .unwrap()
        }
    });

    let messages = post(move |body: String| {
        let rec = Arc::clone(&rec_post);
        async move {
            let frame: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
            let method = frame
                .get("method")
                .and_then(|m| m.as_str())
                .unwrap_or("")
                .to_string();
            let id = frame.get("id").cloned().unwrap_or(serde_json::Value::Null);
            match method.as_str() {
                "initialize" => {
                    json_response(StatusCode::OK, None, rpc_result(&id, initialize_result()))
                }
                "notifications/initialized" | "notifications/cancelled" => {
                    json_response(StatusCode::ACCEPTED, None, String::new())
                }
                "tools/list" => {
                    json_response(StatusCode::OK, None, rpc_result(&id, tools_list_result()))
                }
                "tools/call" => {
                    let n = rec.call_attempts.fetch_add(1, Ordering::SeqCst);
                    if n < fail_calls {
                        // Transient failure — trips is_connection_error via
                        // "SSE: POST '...' returned 503".
                        return json_response(
                            StatusCode::SERVICE_UNAVAILABLE,
                            None,
                            "temporarily unavailable".to_string(),
                        );
                    }
                    let args = frame
                        .get("params")
                        .and_then(|p| p.get("arguments"))
                        .cloned()
                        .unwrap_or(serde_json::Value::Null);
                    json_response(
                        StatusCode::OK,
                        None,
                        rpc_result(&id, tools_call_result(&args)),
                    )
                }
                _ => json_response(StatusCode::OK, None, rpc_result(&id, serde_json::json!({}))),
            }
        }
    });

    let app = Router::new()
        .route("/sse", sse_get)
        .route("/messages", messages);
    (app, rec)
}

/// A driving `BrowserAuthorizer` for the OAuth flow: on `open_url` it parses the
/// authorize URL, then (on a spawned task) hits the loopback `redirect_uri` with
/// a fake `code` and the exact `state`, simulating the user approving.
#[derive(Default)]
pub struct DrivingBrowser {
    pub opened: AtomicUsize,
}

impl DrivingBrowser {
    pub fn new() -> Self {
        Self::default()
    }
}

impl BrowserAuthorizer for DrivingBrowser {
    fn is_interactive(&self) -> bool {
        true
    }
    fn open_url(&self, url: &str) -> bool {
        self.opened.fetch_add(1, Ordering::SeqCst);
        let parsed = match reqwest::Url::parse(url) {
            Ok(u) => u,
            Err(_) => return false,
        };
        let mut redirect_uri = None;
        let mut state = None;
        for (k, v) in parsed.query_pairs() {
            match k.as_ref() {
                "redirect_uri" => redirect_uri = Some(v.into_owned()),
                "state" => state = Some(v.into_owned()),
                _ => {}
            }
        }
        let (Some(redirect_uri), Some(state)) = (redirect_uri, state) else {
            return false;
        };
        tokio::spawn(async move {
            // Small delay so the flow reaches `wait_for_callback` first.
            tokio::time::sleep(Duration::from_millis(50)).await;
            let sep = if redirect_uri.contains('?') { '&' } else { '?' };
            let cb = format!("{redirect_uri}{sep}code=sim-code&state={state}");
            let _ = reqwest::get(&cb).await;
        });
        true
    }
}
