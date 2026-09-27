use std::net::SocketAddr;
use std::sync::Arc;

use parking_lot::Mutex;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tracing::{error, info, warn};

use super::auth::McpAuth;
use super::executor::{DesktopMcpServerExecutor, McpServerExecutor};
use super::handlers::{serve, HttpReply, RequestHeaders};

const MAX_REQUEST_BYTES: usize = 4 * 1024 * 1024;

pub struct McpHttpServer {
    pub port: u16,
    pub auth: Arc<McpAuth>,
    pub enabled_tools: Arc<Mutex<Vec<String>>>,
    executor: Arc<dyn McpServerExecutor>,
    shutdown_tx: Option<oneshot::Sender<()>>,
}

impl McpHttpServer {
    pub fn new(port: u16, app_handle: tauri::AppHandle) -> Self {
        Self::new_with_executor(port, Arc::new(DesktopMcpServerExecutor::new(app_handle)))
    }

    pub fn new_with_executor(port: u16, executor: Arc<dyn McpServerExecutor>) -> Self {
        Self {
            port,
            auth: Arc::new(McpAuth::new()),
            enabled_tools: Arc::new(Mutex::new(Vec::new())),
            executor,
            shutdown_tx: None,
        }
    }

    pub async fn start(&mut self) -> Result<(), String> {
        let addr: SocketAddr = format!("127.0.0.1:{}", self.port)
            .parse()
            .map_err(|e| format!("Invalid address: {e}"))?;

        let listener = TcpListener::bind(&addr)
            .await
            .map_err(|e| format!("Failed to bind port {}: {e}", self.port))?;

        info!("MCP server listening on {}", addr);

        let (tx, mut rx) = oneshot::channel::<()>();
        self.shutdown_tx = Some(tx);

        let auth = self.auth.clone();
        let enabled_tools = self.enabled_tools.clone();
        let executor = self.executor.clone();

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = &mut rx => {
                        info!("MCP server shutting down");
                        break;
                    }
                    result = listener.accept() => {
                        match result {
                            Ok((stream, peer_addr)) => {
                                // Enforce localhost-only
                                if !peer_addr.ip().is_loopback() {
                                    warn!("Rejected non-loopback connection from {}", peer_addr.ip());
                                    continue;
                                }
                                let auth = auth.clone();
                                let tools = enabled_tools.lock().clone();
                                let executor = executor.clone();
                                tokio::spawn(handle_connection(stream, auth, tools, executor));
                            }
                            Err(e) => {
                                error!("Accept error: {e}");
                            }
                        }
                    }
                }
            }
        });

        Ok(())
    }

    pub fn stop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
    }

    pub fn is_running(&self) -> bool {
        self.shutdown_tx.is_some()
    }
}

async fn handle_connection(
    mut stream: tokio::net::TcpStream,
    auth: Arc<McpAuth>,
    enabled_tools: Vec<String>,
    executor: Arc<dyn McpServerExecutor>,
) {
    let Some((head, body)) = read_request(&mut stream).await else {
        let _ = stream.write_all(&plain_status(400, "Bad Request")).await;
        return;
    };

    let mut lines = head.lines();
    let request_line = lines.next().unwrap_or("");
    let headers: Vec<(String, String)> = lines
        .filter_map(|line| line.split_once(':'))
        .map(|(name, value)| (name.trim().to_ascii_lowercase(), value.trim().to_string()))
        .collect();
    let header = |name: &str| {
        headers
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.as_str())
    };

    if header("origin").is_some_and(|origin| !is_loopback_origin(origin)) {
        let _ = stream.write_all(&plain_status(403, "Forbidden")).await;
        return;
    }

    if !request_line.starts_with("POST ") {
        let _ = stream
            .write_all(&plain_status(405, "Method Not Allowed"))
            .await;
        return;
    }

    let token = header("authorization")
        .and_then(|value| value.strip_prefix("Bearer "))
        .unwrap_or("");
    if !auth.verify(token) {
        let _ = stream.write_all(&plain_status(401, "Unauthorized")).await;
        return;
    }

    let reply = serve(
        &String::from_utf8_lossy(&body),
        RequestHeaders {
            protocol_version: header("mcp-protocol-version"),
            method: header("mcp-method"),
            name: header("mcp-name"),
        },
        &enabled_tools,
        executor,
    )
    .await;

    let response = match reply {
        HttpReply::Accepted => plain_status(202, "Accepted"),
        HttpReply::Json { status, body } => {
            let body = serde_json::to_string(&body).unwrap_or_default();
            format!(
                "HTTP/1.1 {status} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                reason_phrase(status),
                body.len()
            )
            .into_bytes()
        }
        HttpReply::EventStream(frames) => {
            let mut response = String::from(
                "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nX-Accel-Buffering: no\r\nConnection: close\r\n\r\n",
            );
            for frame in frames {
                response.push_str("data: ");
                response.push_str(&serde_json::to_string(&frame).unwrap_or_default());
                response.push_str("\n\n");
            }
            response.into_bytes()
        }
    };
    let _ = stream.write_all(&response).await;
    let _ = stream.shutdown().await;
}

async fn read_request(stream: &mut tokio::net::TcpStream) -> Option<(String, Vec<u8>)> {
    let mut buf: Vec<u8> = Vec::new();
    let mut chunk = [0u8; 16 * 1024];
    loop {
        if let Some(end) = buf.windows(4).position(|window| window == b"\r\n\r\n") {
            let head = String::from_utf8_lossy(&buf[..end]).into_owned();
            let length: usize = head
                .lines()
                .filter_map(|line| line.split_once(':'))
                .find(|(name, _)| name.trim().eq_ignore_ascii_case("content-length"))
                .and_then(|(_, value)| value.trim().parse().ok())
                .unwrap_or(0);
            if end + 4 + length > MAX_REQUEST_BYTES {
                return None;
            }
            while buf.len() < end + 4 + length {
                let n = stream.read(&mut chunk).await.ok()?;
                if n == 0 {
                    return None;
                }
                buf.extend_from_slice(&chunk[..n]);
            }
            return Some((head, buf[end + 4..end + 4 + length].to_vec()));
        }
        if buf.len() > MAX_REQUEST_BYTES {
            return None;
        }
        let n = stream.read(&mut chunk).await.ok()?;
        if n == 0 {
            return None;
        }
        buf.extend_from_slice(&chunk[..n]);
    }
}

fn is_loopback_origin(origin: &str) -> bool {
    url::Url::parse(origin)
        .ok()
        .and_then(|parsed| match parsed.host()? {
            url::Host::Domain(domain) => Some(domain.eq_ignore_ascii_case("localhost")),
            url::Host::Ipv4(v4) => Some(v4.is_loopback()),
            url::Host::Ipv6(v6) => Some(v6.is_loopback()),
        })
        .unwrap_or(false)
}

fn reason_phrase(status: u16) -> &'static str {
    match status {
        200 => "OK",
        202 => "Accepted",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        _ => "Internal Server Error",
    }
}

fn plain_status(status: u16, reason: &str) -> Vec<u8> {
    format!("HTTP/1.1 {status} {reason}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
        .into_bytes()
}
