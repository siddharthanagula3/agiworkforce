use std::net::SocketAddr;
use std::sync::Arc;

use parking_lot::Mutex;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tracing::{error, info, warn};

use super::auth::McpAuth;
use super::handlers::{dispatch, JsonRpcRequest};

pub struct McpHttpServer {
    pub port: u16,
    pub auth: Arc<McpAuth>,
    pub enabled_tools: Arc<Mutex<Vec<String>>>,
    shutdown_tx: Option<oneshot::Sender<()>>,
}

impl McpHttpServer {
    pub fn new(port: u16) -> Self {
        Self {
            port,
            auth: Arc::new(McpAuth::new()),
            enabled_tools: Arc::new(Mutex::new(Vec::new())),
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
                                tokio::spawn(handle_connection(stream, auth, tools));
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
) {
    let mut buf = vec![0u8; 65536];
    let n = match stream.read(&mut buf).await {
        Ok(n) if n > 0 => n,
        _ => return,
    };

    let raw = String::from_utf8_lossy(&buf[..n]);

    // Parse HTTP/1.1 request manually
    let (headers_section, body) = match raw.split_once("\r\n\r\n") {
        Some(parts) => parts,
        None => {
            let _ = stream
                .write_all(b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n")
                .await;
            return;
        }
    };

    let first_line = headers_section.lines().next().unwrap_or("");
    let is_post = first_line.starts_with("POST");
    if !is_post {
        let resp = b"HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\n\r\n";
        let _ = stream.write_all(resp).await;
        return;
    }

    // Extract Authorization header
    let auth_header = headers_section
        .lines()
        .find(|l| l.to_lowercase().starts_with("authorization:"))
        .and_then(|l| l.split_once(':'))
        .map(|(_, v)| v.trim())
        .unwrap_or("");

    let token = auth_header.strip_prefix("Bearer ").unwrap_or("");
    if !auth.verify(token) {
        let resp = b"HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n";
        let _ = stream.write_all(resp).await;
        return;
    }

    // Parse JSON-RPC
    let request: JsonRpcRequest = match serde_json::from_str(body) {
        Ok(r) => r,
        Err(e) => {
            let err_body = format!(
                "{{\"jsonrpc\":\"2.0\",\"error\":{{\"code\":-32700,\"message\":\"Parse error: {e}\"}},\"id\":null}}"
            );
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                err_body.len(),
                err_body
            );
            let _ = stream.write_all(resp.as_bytes()).await;
            return;
        }
    };

    let rpc_resp = dispatch(&request, &enabled_tools);
    let resp_body = serde_json::to_string(&rpc_resp).unwrap_or_default();
    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
        resp_body.len(),
        resp_body
    );
    let _ = stream.write_all(resp.as_bytes()).await;
}
