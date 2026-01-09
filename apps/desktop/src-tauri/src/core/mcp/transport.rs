use super::logs::append_server_log;
use super::protocol::{JsonRpcRequest, JsonRpcResponse, McpMessage, RequestId};
use crate::core::mcp::{McpError, McpResult};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot};

/// Maximum age for pending requests before they are considered stale (5 minutes)
const MAX_REQUEST_AGE_SECS: u64 = 300;

/// Interval for cleaning up stale pending requests
const CLEANUP_INTERVAL_SECS: u64 = 60;

/// Holds a pending request with its creation timestamp for age-based cleanup
struct PendingRequest {
    sender: oneshot::Sender<McpResult<JsonRpcResponse>>,
    created_at: Instant,
}

pub struct StdioTransport {
    child: Arc<Mutex<Option<Child>>>,

    request_id: Arc<AtomicU64>,

    pending: Arc<Mutex<HashMap<RequestId, PendingRequest>>>,

    tx: mpsc::UnboundedSender<JsonRpcRequest>,

    shutdown_tx: Mutex<Option<oneshot::Sender<()>>>,

    /// Shared flag to signal shutdown to all tasks
    is_shutdown: Arc<AtomicBool>,
}

impl StdioTransport {
    pub async fn new(
        server_name: String,
        command: &str,
        args: &[String],
        env: &HashMap<String, String>,
    ) -> McpResult<Self> {
        tracing::info!(
            "[MCP Transport] Starting server '{}': {} {:?}",
            server_name,
            command,
            args
        );

        let mut cmd = Command::new(command);
        cmd.args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .envs(env);

        let mut child = cmd
            .spawn()
            .map_err(|e| McpError::ConnectionError(format!("Failed to spawn process: {}", e)))?;

        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| McpError::ConnectionError("Failed to get stdin handle".to_string()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| McpError::ConnectionError("Failed to get stdout handle".to_string()))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| McpError::ConnectionError("Failed to get stderr handle".to_string()))?;

        let (tx, mut rx) = mpsc::unbounded_channel::<JsonRpcRequest>();
        let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();

        let pending: Arc<Mutex<HashMap<RequestId, PendingRequest>>> =
            Arc::new(Mutex::new(HashMap::new()));

        let child_arc = Arc::new(Mutex::new(Some(child)));
        let is_shutdown = Arc::new(AtomicBool::new(false));

        // Writer task
        let pending_write = pending.clone();
        let is_shutdown_write = is_shutdown.clone();
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    Some(request) = rx.recv() => {
                        let msg = McpMessage::Request(request.clone());
                        match msg.to_string() {
                            Ok(json) => {
                                let line = format!("{}\n", json);
                                if let Err(e) = stdin.write_all(line.as_bytes()).await {
                                    tracing::error!("[MCP Transport] Failed to write to stdin: {}", e);

                                    // Notify the specific request about the failure
                                    let mut pending = pending_write.lock();
                                    if let Some(pending_req) = pending.remove(&request.id) {
                                        let _ = pending_req.sender.send(Err(McpError::ConnectionError(
                                            format!("Failed to write request: {}", e)
                                        )));
                                    }

                                    // Notify all remaining pending requests about the connection failure
                                    tracing::warn!("[MCP Transport] Notifying {} pending requests of connection failure", pending.len());
                                    for (_, pending_req) in pending.drain() {
                                        let _ = pending_req.sender.send(Err(McpError::ConnectionError(
                                            "Transport connection lost".to_string()
                                        )));
                                    }

                                    is_shutdown_write.store(true, Ordering::SeqCst);
                                    break;
                                }
                                if let Err(e) = stdin.flush().await {
                                    tracing::error!("[MCP Transport] Failed to flush stdin: {}", e);
                                }
                            }
                            Err(e) => {
                                tracing::error!("[MCP Transport] Failed to serialize request: {}", e);
                            }
                        }
                    }
                    _ = &mut shutdown_rx => {
                        tracing::info!("[MCP Transport] Shutdown signal received");
                        is_shutdown_write.store(true, Ordering::SeqCst);

                        // Clean up any remaining pending requests
                        let mut pending = pending_write.lock();
                        for (_, pending_req) in pending.drain() {
                            let _ = pending_req.sender.send(Err(McpError::ConnectionError(
                                "Transport shutting down".to_string()
                            )));
                        }
                        break;
                    }
                }
            }
        });

        // Reader task (stdout: protocol + potential stray logs)
        let pending_read = pending.clone();
        let is_shutdown_read = is_shutdown.clone();
        let server_name_for_stdout = server_name.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                if line.trim().is_empty() {
                    continue;
                }

                tracing::debug!("[MCP Transport] Received: {}", line);

                match McpMessage::from_str(&line) {
                    Ok(McpMessage::Response(response)) => {
                        let mut pending = pending_read.lock();
                        if let Some(pending_req) = pending.remove(&response.id) {
                            let _ = pending_req.sender.send(Ok(response));
                        } else {
                            tracing::warn!(
                                "[MCP Transport] Received response for unknown request: {:?}",
                                response.id
                            );
                        }
                    }
                    Ok(McpMessage::Error(error)) => {
                        let mut pending = pending_read.lock();
                        if let Some(pending_req) = pending.remove(&error.id) {
                            let _ = pending_req
                                .sender
                                .send(Err(McpError::RmcpError(error.error.message)));
                        } else {
                            tracing::warn!(
                                "[MCP Transport] Received error for unknown request: {:?}",
                                error.id
                            );
                        }
                    }
                    Ok(McpMessage::Notification(notif)) => {
                        tracing::info!("[MCP Transport] Received notification: {}", notif.method);
                    }
                    Ok(McpMessage::Request(_)) => {
                        tracing::warn!("[MCP Transport] Received request from server (not supported in client mode)");
                    }
                    Err(e) => {
                        tracing::error!("[MCP Transport] Failed to parse message: {}", e);
                        append_server_log(&server_name_for_stdout, format!("[stdout] {}", line));
                    }
                }
            }

            tracing::info!("[MCP Transport] stdout reader finished");

            // Signal shutdown and clean up pending requests when reader exits
            is_shutdown_read.store(true, Ordering::SeqCst);
            let mut pending = pending_read.lock();
            if !pending.is_empty() {
                tracing::warn!(
                    "[MCP Transport] Reader exited, notifying {} pending requests",
                    pending.len()
                );
                for (_, pending_req) in pending.drain() {
                    let _ = pending_req.sender.send(Err(McpError::ConnectionError(
                        "Transport reader disconnected".to_string(),
                    )));
                }
            }
        });

        // Stderr reader task (server logs)
        let server_name_for_stderr = server_name.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                tracing::debug!("[MCP Server stderr] {}", line);
                append_server_log(&server_name_for_stderr, format!("[stderr] {}", line));
            }
        });

        // Periodic cleanup task for stale pending requests
        let pending_cleanup = pending.clone();
        tokio::spawn(async move {
            let mut interval =
                tokio::time::interval(tokio::time::Duration::from_secs(CLEANUP_INTERVAL_SECS));
            loop {
                interval.tick().await;

                let mut pending = pending_cleanup.lock();
                let now = Instant::now();
                let stale_keys: Vec<RequestId> = pending
                    .iter()
                    .filter(|(_, req)| {
                        now.duration_since(req.created_at).as_secs() > MAX_REQUEST_AGE_SECS
                    })
                    .map(|(id, _)| id.clone())
                    .collect();

                for key in stale_keys {
                    if let Some(pending_req) = pending.remove(&key) {
                        tracing::warn!("[MCP Transport] Cleaning up stale request: {:?}", key);
                        let _ = pending_req.sender.send(Err(McpError::ConnectionError(
                            "Request expired due to age".to_string(),
                        )));
                    }
                }
            }
        });

        Ok(Self {
            child: child_arc,
            request_id: Arc::new(AtomicU64::new(1)),
            pending,
            tx,
            shutdown_tx: Mutex::new(Some(shutdown_tx)),
            is_shutdown,
        })
    }

    pub async fn send_request(
        &self,
        method: String,
        params: Option<serde_json::Value>,
    ) -> McpResult<JsonRpcResponse> {
        // Check if transport is shutdown
        if self.is_shutdown.load(Ordering::SeqCst) {
            return Err(McpError::ConnectionError(
                "Transport is shutdown".to_string(),
            ));
        }

        // Generate a unique request ID with collision detection
        let id = loop {
            let next_id = self.request_id.fetch_add(1, Ordering::SeqCst);
            // Handle potential wrap-around at u64::MAX
            let candidate = RequestId::Number((next_id % i64::MAX as u64) as i64);
            let pending = self.pending.lock();
            if !pending.contains_key(&candidate) {
                break candidate;
            }
            // If collision detected, try next ID
            tracing::debug!("[MCP Transport] Request ID collision detected, trying next ID");
        };

        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            method,
            params,
            id: id.clone(),
        };

        let (response_tx, response_rx) = oneshot::channel();

        {
            let mut pending = self.pending.lock();
            pending.insert(
                id.clone(),
                PendingRequest {
                    sender: response_tx,
                    created_at: Instant::now(),
                },
            );
        }

        self.tx.send(request).map_err(|_| {
            // Clean up pending request if send fails
            self.pending.lock().remove(&id);
            McpError::ConnectionError("Failed to send request: channel closed".to_string())
        })?;

        match tokio::time::timeout(tokio::time::Duration::from_secs(30), response_rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => {
                self.pending.lock().remove(&id);
                Err(McpError::ConnectionError(
                    "Response channel closed".to_string(),
                ))
            }
            Err(_) => {
                // Remove timed out request and return error
                self.pending.lock().remove(&id);
                Err(McpError::ConnectionError(
                    "Request timeout after 30 seconds".to_string(),
                ))
            }
        }
    }

    pub fn send_notification(&self, method: String, params: Option<serde_json::Value>) {
        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            method,
            params,
            id: RequestId::Null,
        };

        let _ = self.tx.send(request);
    }

    pub fn is_alive(&self) -> bool {
        if self.is_shutdown.load(Ordering::SeqCst) {
            return false;
        }
        let child = self.child.lock();
        child.is_some()
    }

    pub async fn shutdown(&self) -> McpResult<()> {
        tracing::info!("[MCP Transport] Shutting down");

        if let Some(tx) = self.shutdown_tx.lock().take() {
            let _ = tx.send(());
        }

        let child = {
            let mut guard = self.child.lock();
            guard.take()
        };
        if let Some(mut c) = child {
            match c.kill().await {
                Ok(_) => {
                    tracing::info!("[MCP Transport] Process killed");
                }
                Err(e) => {
                    tracing::warn!("[MCP Transport] Failed to kill process: {}", e);
                }
            }
        }

        Ok(())
    }
}

impl Drop for StdioTransport {
    fn drop(&mut self) {
        let mut child = self.child.lock();
        if let Some(mut c) = child.take() {
            let _ = c.start_kill();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_request_id_increment() {
        let counter = Arc::new(AtomicU64::new(1));
        let id1 = counter.fetch_add(1, Ordering::SeqCst);
        let id2 = counter.fetch_add(1, Ordering::SeqCst);
        assert_eq!(id1, 1);
        assert_eq!(id2, 2);
    }

    #[test]
    fn test_message_serialization() {
        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            method: "test".to_string(),
            params: None,
            id: RequestId::Number(1),
        };
        let msg = McpMessage::Request(req);
        let json = msg.to_string().unwrap();
        assert!(json.contains("\"method\":\"test\""));
    }
}
