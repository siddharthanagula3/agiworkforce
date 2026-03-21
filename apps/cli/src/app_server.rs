#![allow(dead_code, unused_imports)]
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use anyhow::Result;
use axum::extract::ws::{Message, WebSocket};
use axum::extract::WebSocketUpgrade;
use axum::routing::get;
use axum::Router;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

#[derive(Debug, Clone)]
pub enum AppServerTransport { Stdio, WebSocket { addr: SocketAddr } }
impl Default for AppServerTransport { fn default() -> Self { Self::Stdio } }

#[derive(Debug, Clone)]
pub struct AppServerConfig { pub transport: AppServerTransport, pub max_sessions: usize, pub session_timeout_secs: u64 }
impl Default for AppServerConfig { fn default() -> Self { Self { transport: AppServerTransport::default(), max_sessions: 10, session_timeout_secs: 3600 } } }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest { pub jsonrpc: String, pub id: Option<serde_json::Value>, pub method: String, #[serde(default)] pub params: serde_json::Value }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcResponse { pub jsonrpc: String, pub id: Option<serde_json::Value>, #[serde(skip_serializing_if = "Option::is_none")] pub result: Option<serde_json::Value>, #[serde(skip_serializing_if = "Option::is_none")] pub error: Option<JsonRpcError> }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError { pub code: i32, pub message: String }

impl JsonRpcResponse {
    fn ok(id: Option<serde_json::Value>, result: serde_json::Value) -> Self { Self { jsonrpc: "2.0".into(), id, result: Some(result), error: None } }
    fn err(id: Option<serde_json::Value>, code: i32, msg: String) -> Self { Self { jsonrpc: "2.0".into(), id, result: None, error: Some(JsonRpcError { code, message: msg }) } }
}

struct Processor;
impl Processor {
    fn new() -> Self { Self }
    async fn process(&self, req: JsonRpcRequest) -> JsonRpcResponse {
        match req.method.as_str() {
            "initialize" => JsonRpcResponse::ok(req.id, serde_json::json!({"capabilities": {"tools": true, "streaming": true}, "serverInfo": {"name": "agiworkforce-app-server", "version": env!("CARGO_PKG_VERSION")}})),
            "tools/list" => JsonRpcResponse::ok(req.id, serde_json::json!({"tools": ["read_file","write_file","edit_file","run_command","search_files","list_directory","web_search","web_fetch","apply_patch","grep_files","tool_search","task"]})),
            "shutdown" => JsonRpcResponse::ok(req.id, serde_json::json!({"shutdown": true})),
            _ => JsonRpcResponse::err(req.id, -32601, format!("Method not found: {}", req.method)),
        }
    }
}

pub async fn run_app_server(config: AppServerConfig) -> Result<()> {
    match config.transport { AppServerTransport::Stdio => run_stdio(config).await, AppServerTransport::WebSocket { .. } => run_ws(config).await }
}

async fn run_ws(config: AppServerConfig) -> Result<()> {
    let addr = match config.transport { AppServerTransport::WebSocket { addr } => addr, _ => "127.0.0.1:8787".parse()? };
    let proc = Arc::new(Processor::new());
    let app = Router::new()
        .route("/ws", get({ let p = Arc::clone(&proc); move |ws: WebSocketUpgrade| async move { ws.on_upgrade(move |s| handle_ws(s, p)) } }))
        .route("/health", get(|| async { "ok" }));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    eprintln!("App server on ws://{}", addr);
    axum::serve(listener, app).await?;
    Ok(())
}

async fn handle_ws(mut socket: WebSocket, proc: Arc<Processor>) {
    while let Some(Ok(msg)) = futures_util::StreamExt::next(&mut socket).await {
        if let Message::Text(text) = msg {
            let resp = match serde_json::from_str::<JsonRpcRequest>(&text) {
                Ok(req) => proc.process(req).await,
                Err(e) => JsonRpcResponse::err(None, -32700, format!("Parse error: {e}")),
            };
            if let Ok(j) = serde_json::to_string(&resp) {
                if let Err(e) = futures_util::SinkExt::send(&mut socket, Message::Text(j.into())).await {
                    eprintln!("WebSocket send error: {e}");
                    break;
                }
            }
        }
    }
}

async fn run_stdio(_config: AppServerConfig) -> Result<()> {
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    let proc = Processor::new();
    let mut reader = BufReader::new(tokio::io::stdin());
    let mut stdout = tokio::io::stdout();
    eprintln!("App server on stdio");
    let mut line = String::new();
    loop {
        line.clear();
        if reader.read_line(&mut line).await? == 0 { break; }
        let t = line.trim();
        if t.is_empty() { continue; }
        let (resp, is_shutdown) = match serde_json::from_str::<JsonRpcRequest>(t) {
            Ok(req) => {
                let shutdown = req.method == "shutdown";
                (proc.process(req).await, shutdown)
            }
            Err(e) => (JsonRpcResponse::err(None, -32700, format!("Parse error: {e}")), false),
        };
        let j = serde_json::to_string(&resp)?;
        stdout.write_all(j.as_bytes()).await?;
        stdout.write_all(b"\n").await?;
        stdout.flush().await?;
        if is_shutdown { break; }
    }
    Ok(())
}

pub async fn run_mcp_server() -> Result<()> {
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    let mut reader = BufReader::new(tokio::io::stdin());
    let mut stdout = tokio::io::stdout();
    let mut initialized = false;
    let mut line = String::new();
    loop {
        line.clear();
        if reader.read_line(&mut line).await? == 0 { break; }
        let t = line.trim();
        if t.is_empty() { continue; }
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
            "initialize" => { initialized = true; JsonRpcResponse::ok(id, serde_json::json!({"protocolVersion": "2024-11-05", "capabilities": {"tools": {}}, "serverInfo": {"name": "agiworkforce", "version": env!("CARGO_PKG_VERSION")}})) }
            "tools/list" if initialized => JsonRpcResponse::ok(id, serde_json::json!({"tools": [{"name": "agiworkforce_exec", "description": "Execute prompt via AGI Workforce", "inputSchema": {"type": "object", "properties": {"prompt": {"type": "string"}}, "required": ["prompt"]}}]})),
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
