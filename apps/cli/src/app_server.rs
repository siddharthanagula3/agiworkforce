//! CLI-side app-server wiring.
//!
//! This module provides:
//!
//! 1. `CliDeveloperSessionHost`: the full CLI agent engine used by both the
//!    typed stdio and authenticated WebSocket developer-session transports.
//!
//! 2. `run_mcp_server`: a CLI-local MCP stdio server that serves MCP
//!    2026-07-28 statelessly and 2025-era clients through `initialize`. It
//!    advertises only tools that are actually callable from this context. Until
//!    agent exec is wired for stdio MCP, the tool list is intentionally empty.

pub(crate) mod account;
mod developer_host;
mod surfaces;

pub use developer_host::CliDeveloperSessionHost;

pub use agiworkforce_app_server::{run_developer_session_websocket, WebSocketSecurity};

use agiworkforce_app_server::DeveloperSessionHost;
use agiworkforce_mcp::protocol::{
    Implementation, RpcError, INVALID_PARAMS, METHOD_NOT_FOUND, PARSE_ERROR,
};
use agiworkforce_mcp::server::{self, CacheScope, RequestEra};
use agiworkforce_protocol::developer_session::AppServerCapabilities;
use anyhow::Result;
use serde_json::{json, Value};
use std::sync::Arc;

/// Serve a developer session over stdio.
///
/// Stdout becomes the protocol channel here and stays one for the life of the
/// process: one JSON value per line, nothing else. The claim is what keeps a
/// human-facing write, a streamed continuation chunk, a tool banner, off it,
/// because the client's reader treats the first non-JSON line as a fatal
/// framing error and drops the session.
pub async fn run_developer_session_stdio(
    host: Arc<dyn DeveloperSessionHost>,
    capabilities: AppServerCapabilities,
) -> Result<()> {
    crate::output::claim_stdout_for_protocol();
    agiworkforce_app_server::run_developer_session_stdio(host, capabilities).await
}

const MCP_SERVER_CACHE_TTL_MS: u64 = 3_600_000;

/// MCP-protocol stdio handler for `agi mcp-server`.
///
/// The stdio MCP server currently exposes no tools. A full one-shot agent exec
/// requires a configured provider/model session, approval plumbing, and event
/// streaming; advertising that tool before it is callable would be fake wiring.
pub async fn run_mcp_server() -> Result<()> {
    crate::output::claim_stdout_for_protocol();
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    let mut reader = BufReader::new(tokio::io::stdin());
    let mut stdout = tokio::io::stdout();
    let mut line = String::new();
    loop {
        line.clear();
        if reader.read_line(&mut line).await? == 0 {
            break;
        }
        let frame = line.trim();
        if frame.is_empty() {
            continue;
        }
        for reply in mcp_server_replies(frame) {
            stdout
                .write_all(serde_json::to_string(&reply)?.as_bytes())
                .await?;
            stdout.write_all(b"\n").await?;
        }
        stdout.flush().await?;
    }
    Ok(())
}

fn mcp_server_identity() -> Implementation {
    Implementation {
        name: "agiworkforce".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

fn mcp_server_replies(frame: &str) -> Vec<Value> {
    let request: Value = match serde_json::from_str(frame) {
        Ok(request) => request,
        Err(e) => {
            return vec![RpcError::new(PARSE_ERROR, format!("Parse error: {e}")).to_response(None)]
        }
    };
    let Some(id) = request.get("id") else {
        return Vec::new();
    };
    let method = request
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let params = request.get("params");
    let identity = mcp_server_identity();
    let capabilities = json!({ "tools": {} });

    if method == "initialize" {
        let requested = params
            .and_then(|params| params.get("protocolVersion"))
            .and_then(Value::as_str);
        return vec![server::success(
            Some(id),
            server::initialize_result(requested, capabilities, &identity),
        )];
    }

    let modern = match server::classify_request(params, None) {
        Ok(RequestEra::Modern { .. }) => true,
        Ok(RequestEra::Legacy) => false,
        Err(error) => return vec![error.to_response(Some(id))],
    };
    let result = match method {
        "server/discover" if modern => Ok(server::discover_result(
            capabilities,
            MCP_SERVER_CACHE_TTL_MS,
        )),
        "subscriptions/listen" if modern => {
            return vec![
                server::subscription_acknowledged(id),
                server::subscription_closed(id, &identity),
            ];
        }
        "tools/list" => Ok(server::cacheable(
            json!({ "tools": [] }),
            MCP_SERVER_CACHE_TTL_MS,
            CacheScope::Public,
        )),
        "tools/call" => {
            let name = params
                .and_then(|params| params.get("name"))
                .and_then(Value::as_str)
                .unwrap_or("(unknown)");
            Err(RpcError::new(
                INVALID_PARAMS,
                format!(
                    "Tool '{name}' is not advertised by this MCP server. Use a typed CLI developer session (stdio or WebSocket), or run `agi <prompt>` directly."
                ),
            ))
        }
        _ => Err(RpcError::new(
            METHOD_NOT_FOUND,
            format!("Unknown: {method}"),
        )),
    };
    vec![match result {
        Ok(result) if modern => server::success(Some(id), server::complete(result, &identity)),
        Ok(result) => server::success(Some(id), result),
        Err(error) => error.to_response(Some(id)),
    }]
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mcp_server_does_not_advertise_unwired_exec_tool() {
        let replies: Vec<Value> = [
            r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#,
            r#"{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}"#,
            r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"agiworkforce_exec","arguments":{"prompt":"hi"}}}"#,
        ]
        .iter()
        .flat_map(|frame| mcp_server_replies(frame))
        .collect();
        assert!(replies.len() >= 3, "expected at least 3 response lines");

        let tools = replies[1]["result"]["tools"]
            .as_array()
            .expect("tools/list must return a tools array");
        assert!(tools.is_empty(), "unwired exec tool must not be advertised");

        assert_eq!(
            replies[2]["error"]["code"],
            serde_json::json!(-32602),
            "tools/call for an unadvertised tool must fail explicitly"
        );
    }
}
