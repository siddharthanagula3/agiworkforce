//! CLI-side app-server wiring.
//!
//! This module provides:
//!
//! 1. `CliDeveloperSessionHost`: the full CLI agent engine used by both the
//!    typed stdio and authenticated WebSocket developer-session transports.
//!
//! 2. `run_mcp_server`: a CLI-local MCP stdio server that serves MCP
//!    2026-07-28 statelessly and 2025-era clients through `initialize`. It
//!    exposes the CLI's own file, search, shell, git and LSP tools; the
//!    connecting client is responsible for confirming each call.

pub(crate) mod account;
mod cloud_threads;
mod developer_host;
mod pull_request;
pub(crate) mod surfaces;
mod threads;

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

use crate::tui::approval_broker::ApprovalDecision;

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

const MCP_SERVER_CORE_TOOLS: &[&str] = &[
    "read_file",
    "read_many_files",
    "write_file",
    "edit_file",
    "multiedit",
    "apply_patch",
    "notebook_edit",
    "resolve_conflict",
    "run_command",
    "list_directory",
    "search_files",
    "grep_files",
    "glob",
    "list_worktrees",
    "lsp_definition",
    "lsp_hover",
    "lsp_completion",
    "lsp_document_symbols",
    "lsp_format",
];

/// MCP-protocol stdio handler for `agi mcp-server`.
///
/// Like `claude mcp serve`, it exposes the tools that run on this machine
/// without an agent session. Tools that need a model, a session plan or a
/// person at this terminal stay out of the list.
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
        for reply in mcp_server_replies(frame).await {
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

fn mcp_server_tools() -> Vec<crate::models::ToolDefinition> {
    use crate::runtime::tool_catalog::{built_in_tool_definitions, git_tool_definitions};
    let shell = cfg!(windows).then_some("powershell");
    let mut tools: Vec<_> = built_in_tool_definitions()
        .into_iter()
        .filter(|definition| {
            MCP_SERVER_CORE_TOOLS.contains(&definition.name.as_str())
                || Some(definition.name.as_str()) == shell
        })
        .collect();
    tools.extend(git_tool_definitions());
    tools
}

fn mcp_tool_listing(definition: &crate::models::ToolDefinition) -> Value {
    json!({
        "name": definition.name,
        "description": definition.description,
        "inputSchema": definition.input_schema,
        "annotations": { "readOnlyHint": definition.is_read_only },
    })
}

async fn call_cli_tool(params: Option<&Value>) -> Result<Value, RpcError> {
    let name = params
        .and_then(|params| params.get("name"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    if !mcp_server_tools().iter().any(|tool| tool.name == name) {
        return Err(RpcError::new(
            INVALID_PARAMS,
            format!("Tool '{name}' is not advertised by this MCP server."),
        ));
    }
    let arguments = params
        .and_then(|params| params.get("arguments"))
        .cloned()
        .unwrap_or_else(|| json!({}));
    let call = crate::agent::ToolCall {
        name: name.to_string(),
        args: crate::agent::value_to_legacy_args(&arguments),
    };
    let refuse_prompts: crate::tools::ApprovalCallback =
        Arc::new(|_| Box::pin(async { ApprovalDecision::Deny }));
    let opts = crate::tools::ToolExecOptions {
        require_confirmation: false,
        auto_approve_safe: false,
        auto_approve_edits: false,
        quiet: true,
        approval_callback: Some(refuse_prompts),
        privacy_mode: crate::agent::PrivacyMode::Local,
        workspace_root: std::env::current_dir().ok(),
        mcp_tool_definitions: None,
    };
    let (text, is_error) = match crate::tools::execute_tool_with_opts(&call, &opts).await {
        Ok(result) => (result.output, !result.success),
        Err(error) => (format!("{error:#}"), true),
    };
    Ok(json!({
        "content": [{ "type": "text", "text": text }],
        "isError": is_error,
    }))
}

async fn mcp_server_replies(frame: &str) -> Vec<Value> {
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
            json!({ "tools": mcp_server_tools().iter().map(mcp_tool_listing).collect::<Vec<_>>() }),
            MCP_SERVER_CACHE_TTL_MS,
            CacheScope::Public,
        )),
        "tools/call" => call_cli_tool(params).await,
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

    #[tokio::test]
    async fn mcp_server_does_not_advertise_unwired_exec_tool() {
        let mut replies: Vec<Value> = Vec::new();
        for frame in [
            r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#,
            r#"{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}"#,
            r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"agiworkforce_exec","arguments":{"prompt":"hi"}}}"#,
        ] {
            replies.extend(mcp_server_replies(frame).await);
        }
        assert!(replies.len() >= 3, "expected at least 3 response lines");

        let tools = replies[1]["result"]["tools"]
            .as_array()
            .expect("tools/list must return a tools array");
        assert!(
            tools.iter().all(|tool| tool["name"] != "agiworkforce_exec"),
            "unwired exec tool must not be advertised"
        );

        assert_eq!(
            replies[2]["error"]["code"],
            serde_json::json!(-32602),
            "tools/call for an unadvertised tool must fail explicitly"
        );
    }
}
