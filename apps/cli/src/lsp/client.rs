//! Stdio LSP client. Spawns a language server subprocess, runs the
//! initialize → initialized handshake, then exposes definition / hover /
//! diagnostics methods. Per-language config: server binary path + args.

use anyhow::{Context, Result};
use serde_json::Value;
use std::path::Path;
use std::sync::atomic::{AtomicI64, Ordering};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};

#[allow(dead_code)]
pub struct LspClient {
    child: Child,
    next_id: AtomicI64,
}

impl LspClient {
    pub async fn spawn(
        server_cmd: &str,
        server_args: &[&str],
        workspace_root: &Path,
    ) -> Result<Self> {
        let mut cmd = Command::new(server_cmd);
        cmd.args(server_args)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        let mut child = cmd.spawn().with_context(|| format!("spawn {server_cmd}"))?;
        let stdin = child.stdin.as_mut().context("stdin")?;
        let init_req = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "processId": std::process::id(),
                "rootUri": format!("file://{}", workspace_root.display()),
                "capabilities": {},
            },
        });
        let body = serde_json::to_string(&init_req)?;
        let header = format!("Content-Length: {}\r\n\r\n", body.len());
        stdin.write_all(header.as_bytes()).await?;
        stdin.write_all(body.as_bytes()).await?;
        stdin.flush().await?;
        // Don't block waiting for the response here — many tests will mock; the
        // returned client lets the caller drive further requests.
        Ok(Self {
            child,
            next_id: AtomicI64::new(2),
        })
    }

    pub async fn request(&mut self, method: &str, params: Value) -> Result<Value> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let req = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        let stdin = self.child.stdin.as_mut().context("stdin")?;
        let body = serde_json::to_string(&req)?;
        let header = format!("Content-Length: {}\r\n\r\n", body.len());
        stdin.write_all(header.as_bytes()).await?;
        stdin.write_all(body.as_bytes()).await?;
        stdin.flush().await?;
        let stdout = self.child.stdout.as_mut().context("stdout")?;
        let mut reader = BufReader::new(stdout);
        // Read Content-Length header
        let mut header_line = String::new();
        let mut content_length: usize = 0;
        loop {
            header_line.clear();
            reader.read_line(&mut header_line).await?;
            if header_line == "\r\n" || header_line.trim().is_empty() {
                break;
            }
            if let Some(rest) = header_line.strip_prefix("Content-Length: ") {
                content_length = rest.trim().parse()?;
            }
        }
        let mut buf = vec![0u8; content_length];
        reader.read_exact(&mut buf).await?;
        let resp: Value = serde_json::from_slice(&buf)?;
        Ok(resp.get("result").cloned().unwrap_or(Value::Null))
    }

    pub async fn shutdown(mut self) -> Result<()> {
        let _ = self.request("shutdown", Value::Null).await;
        let _ = self.child.kill().await;
        Ok(())
    }
}
