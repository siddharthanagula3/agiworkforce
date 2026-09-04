//! CLI-side app-server wiring.
//!
//! This module provides:
//!
//! 1. `CliDeveloperSessionHost`: the full CLI agent engine used by both the
//!    typed stdio and authenticated WebSocket developer-session transports.
//!
//! 2. `run_mcp_server`: a CLI-local MCP-protocol stdio handler. It advertises
//!    only tools that are actually callable from this context. Until agent exec
//!    is wired for stdio MCP, the tool list is intentionally empty.

mod developer_host;

pub use developer_host::CliDeveloperSessionHost;

pub use agiworkforce_app_server::{
    run_developer_session_stdio, run_developer_session_websocket, WebSocketSecurity,
};

use agiworkforce_app_server::JsonRpcResponse;
use anyhow::Result;

// ---------------------------------------------------------------------------
// MCP-server entry point (CLI-local)
// ---------------------------------------------------------------------------

/// MCP-protocol stdio handler for `agi mcp-server`.
///
/// The stdio MCP server currently exposes no tools. A full one-shot agent exec
/// requires a configured provider/model session, approval plumbing, and event
/// streaming; advertising that tool before it is callable would be fake wiring.
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

        if method == "notifications/initialized" {
            continue;
        }

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
            "tools/list" if initialized => {
                JsonRpcResponse::ok(id, serde_json::json!({ "tools": [] }))
            }
            "tools/call" if initialized => {
                let name = req
                    .get("params")
                    .and_then(|p| p.get("name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("(unknown)");
                JsonRpcResponse::err(
                    id,
                    -32602,
                    format!(
                        "Tool '{name}' is not advertised by this MCP server. Use a typed CLI developer session (stdio or WebSocket), or run `agi <prompt>` directly."
                    ),
                )
            }
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

    #[tokio::test]
    async fn mcp_server_does_not_advertise_unwired_exec_tool() {
        // Simulate the MCP-server stdio protocol by spinning the server on a
        // local stdin pipe and reading its responses. The stdio MCP server must
        // not advertise tools that cannot be executed from this context.
        use tokio::io::AsyncWriteExt;
        let (mut stdin_write, stdin_read) = tokio::io::duplex(4096);
        let (stdout_write, mut stdout_read) = tokio::io::duplex(4096);

        // Spawn the MCP server reading from our fake stdin/stdout
        let server_handle = tokio::spawn(async move {
            use tokio::io::{AsyncBufReadExt, BufReader};
            let mut reader = BufReader::new(stdin_read);
            let mut writer = stdout_write;
            let mut initialized = false;
            let mut line = String::new();
            loop {
                line.clear();
                if reader.read_line(&mut line).await.unwrap_or(0) == 0 {
                    break;
                }
                let t = line.trim();
                if t.is_empty() {
                    continue;
                }
                let req: serde_json::Value = match serde_json::from_str(t) {
                    Ok(v) => v,
                    Err(e) => {
                        let resp = JsonRpcResponse::err(None, -32700, format!("{e}"));
                        let j = serde_json::to_string(&resp).unwrap();
                        writer.write_all(j.as_bytes()).await.ok();
                        writer.write_all(b"\n").await.ok();
                        continue;
                    }
                };
                let method = req.get("method").and_then(|v| v.as_str()).unwrap_or("");
                let id = req.get("id").cloned();
                if method == "notifications/initialized" {
                    continue;
                }
                let resp = match method {
                    "initialize" => {
                        initialized = true;
                        JsonRpcResponse::ok(
                            id,
                            serde_json::json!({"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"agiworkforce","version":"0"}}),
                        )
                    }
                    "tools/list" if initialized => {
                        JsonRpcResponse::ok(id, serde_json::json!({"tools": []}))
                    }
                    "tools/call" if initialized => {
                        let name = req
                            .get("params")
                            .and_then(|p| p.get("name"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("unknown");
                        JsonRpcResponse::err(
                            id,
                            -32602,
                            format!("Tool '{name}' is not advertised by this MCP server."),
                        )
                    }
                    _ => JsonRpcResponse::err(id, -32601, format!("Unknown: {method}")),
                };
                let j = serde_json::to_string(&resp).unwrap();
                writer.write_all(j.as_bytes()).await.ok();
                writer.write_all(b"\n").await.ok();
                writer.flush().await.ok();
                if method == "shutdown" {
                    break;
                }
            }
        });

        // Send initialize + tools/list + tools/call + shutdown
        let init = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#;
        let list = r#"{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}"#;
        let call = r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"agiworkforce_exec","arguments":{"prompt":"hi"}}}"#;
        let shutdown = r#"{"jsonrpc":"2.0","id":4,"method":"shutdown","params":{}}"#;
        stdin_write
            .write_all(format!("{init}\n{list}\n{call}\n{shutdown}\n").as_bytes())
            .await
            .unwrap();
        drop(stdin_write);
        server_handle.await.ok();

        // Read responses
        let mut buf = String::new();
        use tokio::io::AsyncReadExt;
        stdout_read.read_to_string(&mut buf).await.unwrap();
        let lines: Vec<&str> = buf.lines().collect();
        assert!(lines.len() >= 3, "expected at least 3 response lines");

        let list_resp: serde_json::Value = serde_json::from_str(lines[1]).expect("valid json");
        let tools = list_resp["result"]["tools"]
            .as_array()
            .expect("tools/list must return a tools array");
        assert!(tools.is_empty(), "unwired exec tool must not be advertised");

        let call_resp: serde_json::Value = serde_json::from_str(lines[2]).expect("valid json");
        assert_eq!(
            call_resp["error"]["code"],
            serde_json::json!(-32602),
            "tools/call for an unadvertised tool must fail explicitly"
        );
    }
}
