use super::protocol::{JsonRpcRequest, JsonRpcResponse, McpMessage, RequestId};
use crate::core::mcp::{McpError, McpResult};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot};

pub struct StdioTransport {
    child: Arc<Mutex<Option<Child>>>,

    request_id: Arc<AtomicU64>,

    pending: Arc<Mutex<HashMap<RequestId, oneshot::Sender<McpResult<JsonRpcResponse>>>>>,

    tx: mpsc::UnboundedSender<JsonRpcRequest>,

    shutdown_tx: Mutex<Option<oneshot::Sender<()>>>,
}

impl StdioTransport {
    pub async fn new(
        command: &str,
        args: &[String],
        env: &HashMap<String, String>,
    ) -> McpResult<Self> {
        tracing::info!("[MCP Transport] Starting server: {} {:?}", command, args);

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

        let pending: Arc<Mutex<HashMap<RequestId, oneshot::Sender<McpResult<JsonRpcResponse>>>>> =
            Arc::new(Mutex::new(HashMap::new()));

        let child_arc = Arc::new(Mutex::new(Some(child)));

        let pending_write = pending.clone();
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

                                    let mut pending = pending_write.lock();
                                    if let Some(sender) = pending.remove(&request.id) {
                                        let _ = sender.send(Err(McpError::ConnectionError(
                                            format!("Failed to write request: {}", e)
                                        )));
                                    }
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
                        break;
                    }
                }
            }
        });

        let pending_read = pending.clone();
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
                        if let Some(sender) = pending.remove(&response.id) {
                            let _ = sender.send(Ok(response));
                        } else {
                            tracing::warn!(
                                "[MCP Transport] Received response for unknown request: {:?}",
                                response.id
                            );
                        }
                    }
                    Ok(McpMessage::Error(error)) => {
                        let mut pending = pending_read.lock();
                        if let Some(sender) = pending.remove(&error.id) {
                            let _ = sender.send(Err(McpError::RmcpError(error.error.message)));
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
                    }
                }
            }

            tracing::info!("[MCP Transport] stdout reader finished");
        });

        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                tracing::debug!("[MCP Server stderr] {}", line);
            }
        });

        Ok(Self {
            child: child_arc,
            request_id: Arc::new(AtomicU64::new(1)),
            pending,
            tx,
            shutdown_tx: Mutex::new(Some(shutdown_tx)),
        })
    }

    pub async fn send_request(
        &self,
        method: String,
        params: Option<serde_json::Value>,
    ) -> McpResult<JsonRpcResponse> {
        let id = RequestId::Number(self.request_id.fetch_add(1, Ordering::SeqCst) as i64);

        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            method,
            params,
            id: id.clone(),
        };

        let (response_tx, response_rx) = oneshot::channel();

        {
            let mut pending = self.pending.lock();
            pending.insert(id.clone(), response_tx);
        }

        self.tx.send(request).map_err(|_| {
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
                self.pending.lock().remove(&id);
                Err(McpError::ConnectionError("Request timeout".to_string()))
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
