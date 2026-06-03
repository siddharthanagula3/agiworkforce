//! CLI-side app-server wiring.
//!
//! This module provides:
//!
//! 1. `CliToolDispatch` — concrete `ToolDispatch` impl that maps the 11 wired
//!    tool names to the CLI's real executors and injects them into the
//!    `agiworkforce-app-server` crate's `Processor`.
//!
//! 2. `run_mcp_server` — a CLI-local MCP-protocol stdio handler. It advertises
//!    only tools that are actually callable from this context. Until agent exec
//!    is wired for stdio MCP, the tool list is intentionally empty.
//!
//! JSON-RPC types and `run_app_server` are re-exported from the crate;
//! `run_mcp_server` is *not* re-exported — only this local version is used.

pub use agiworkforce_app_server::run_app_server;
pub use agiworkforce_app_server::{
    AppServerConfig, AppServerTransport, JsonRpcError, JsonRpcRequest, JsonRpcResponse,
    WebSocketSecurity,
};

use anyhow::Result;
use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Arc;

use agiworkforce_app_server::ToolDispatch;

use crate::agent::ToolCall;
use crate::features::exec::tools::{execute_tool_with_opts, ToolExecOptions};
use crate::runtime::tool_catalog;

// ---------------------------------------------------------------------------
// Tool schema helpers
// ---------------------------------------------------------------------------

fn json_string_prop(desc: &str) -> serde_json::Value {
    serde_json::json!({"type": "string", "description": desc})
}

/// Build MCP-style `{name, description, inputSchema}` for the 11 tools we
/// actually wire.  `task` is agent-runtime only and is deliberately excluded
/// (see `NOT_AVAILABLE_VIA_APP_SERVER` below).
fn cli_tool_catalog() -> Vec<serde_json::Value> {
    // Pull canonical descriptions from the shared tool catalog where available
    // so the advertised schema matches what the executor actually honors.
    let catalog: HashMap<String, String> = tool_catalog::all_builtin_tool_definitions()
        .into_iter()
        .map(|t| (t.name, t.description))
        .collect();

    let desc = |name: &str, fallback: &str| -> String {
        catalog
            .get(name)
            .cloned()
            .unwrap_or_else(|| fallback.to_string())
    };

    vec![
        serde_json::json!({
            "name": "read_file",
            "description": desc("read_file", "Read the contents of a file"),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": json_string_prop("File path to read"),
                    "start_line": {"type": "integer", "description": "First line to read (1-based, inclusive)"},
                    "end_line": {"type": "integer", "description": "Last line to read (1-based, inclusive)"},
                },
                "required": ["path"],
            },
        }),
        serde_json::json!({
            "name": "search_files",
            "description": desc("search_files", "Search for text patterns across files"),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "pattern": json_string_prop("Search pattern (regex or literal)"),
                    "path": json_string_prop("Directory to search (default: current directory)"),
                    "file_pattern": json_string_prop("Glob pattern to filter files (e.g., *.rs)"),
                },
                "required": ["pattern"],
            },
        }),
        serde_json::json!({
            "name": "list_directory",
            "description": desc("list_directory", "List the contents of a directory"),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": json_string_prop("Directory path (default: current directory)"),
                    "recursive": {"type": "boolean", "description": "List recursively"},
                },
                "required": [],
            },
        }),
        serde_json::json!({
            "name": "web_search",
            "description": desc("web_search", "Search the web for information"),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": json_string_prop("Search query"),
                    "max_results": {"type": "integer", "description": "Number of results (default: 5)"},
                },
                "required": ["query"],
            },
        }),
        serde_json::json!({
            "name": "web_fetch",
            "description": desc("web_fetch", "Fetch content from a URL"),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "url": json_string_prop("URL to fetch"),
                },
                "required": ["url"],
            },
        }),
        serde_json::json!({
            "name": "grep_files",
            "description": desc("grep_files", "Search file contents using grep-style patterns"),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "pattern": json_string_prop("Grep pattern"),
                    "path": json_string_prop("Directory or file path to search"),
                    "include": json_string_prop("File pattern to include (e.g., *.rs)"),
                    "ignore_case": {"type": "boolean", "description": "Case-insensitive search"},
                },
                "required": ["pattern"],
            },
        }),
        serde_json::json!({
            "name": "tool_search",
            "description": desc("tool_search", "Search available tools and their capabilities"),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": json_string_prop("Search query for tool discovery"),
                },
                "required": ["query"],
            },
        }),
    ]
}

// ---------------------------------------------------------------------------
// CliToolDispatch
// ---------------------------------------------------------------------------

/// Concrete `ToolDispatch` for the app-server that delegates to the CLI's real
/// tool executors.  `task` is an agent-runtime tool that cannot be invoked
/// through the JSON-RPC surface; callers receive an honest error instead of
/// `-32601`.
pub struct CliToolDispatch;

impl CliToolDispatch {
    pub fn new() -> Self {
        Self
    }
}

impl Default for CliToolDispatch {
    fn default() -> Self {
        Self::new()
    }
}

/// Tools allowed through the non-interactive app-server surface. Mutating tools
/// are deliberately unavailable because there is no user approval channel here.
const AVAILABLE_VIA_APP_SERVER: &[&str] = &[
    "read_file",
    "search_files",
    "list_directory",
    "web_search",
    "web_fetch",
    "grep_files",
    "tool_search",
];

/// Convert a JSON object of arbitrary values to `HashMap<String, String>` using
/// the same strategy as `execute_batch` in `tools/mod.rs`: `String` values are
/// cloned directly; everything else is serialized with `to_string()`.
fn json_object_to_string_map(v: &serde_json::Value) -> HashMap<String, String> {
    match v.as_object() {
        Some(map) => map
            .iter()
            .map(|(k, val)| {
                let s = match val {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                (k.clone(), s)
            })
            .collect(),
        None => HashMap::new(),
    }
}

#[async_trait]
impl ToolDispatch for CliToolDispatch {
    async fn list_tools(&self) -> Vec<serde_json::Value> {
        cli_tool_catalog()
    }

    async fn call_tool(&self, name: &str, args: serde_json::Value) -> Result<serde_json::Value> {
        if !AVAILABLE_VIA_APP_SERVER.contains(&name) {
            return Ok(serde_json::json!({
                "content": [{
                    "type": "text",
                    "text": format!(
                        "Tool '{}' is not available via the app-server surface. \
                         The app-server is a read-only, non-interactive surface; \
                         use the TUI/REPL for mutating tools that require approval.",
                        name
                    ),
                }],
                "isError": true,
            }));
        }

        let string_args = json_object_to_string_map(&args);
        let call = ToolCall {
            name: name.to_string(),
            args: string_args,
        };

        // Non-interactive server context: never prompt the user for confirmation,
        // auto-approve read-only tools, operate quietly (no eprintln status lines
        // on the stdout-framing path — status goes to stderr anyway per common.rs).
        let opts = ToolExecOptions {
            require_confirmation: false,
            auto_approve_safe: true,
            quiet: true,
            approval_callback: None,
        };

        let result = execute_tool_with_opts(&call, &opts).await?;
        Ok(serde_json::json!({
            "content": [{"type": "text", "text": result.output}],
            "isError": !result.success,
        }))
    }
}

// ---------------------------------------------------------------------------
// Public constructor for use in lib.rs dispatch
// ---------------------------------------------------------------------------

pub fn make_dispatch() -> Arc<CliToolDispatch> {
    Arc::new(CliToolDispatch::new())
}

// ---------------------------------------------------------------------------
// MCP-server entry point (CLI-local)
// ---------------------------------------------------------------------------

/// MCP-protocol stdio handler for `agi mcp-server`.
///
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
                        "Tool '{name}' is not advertised by this MCP server. Use the CLI app-server WebSocket tool bridge for wired CLI tools, or run `agi <prompt>` directly."
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
    async fn list_tools_returns_read_only_tools() {
        let d = CliToolDispatch::new();
        let tools = d.list_tools().await;
        assert_eq!(
            tools.len(),
            7,
            "expected 7 read-only tools, got {}",
            tools.len()
        );
        let names: Vec<&str> = tools.iter().filter_map(|t| t["name"].as_str()).collect();
        assert!(names.contains(&"read_file"), "read_file must be in catalog");
        assert!(
            names.contains(&"grep_files"),
            "grep_files must be in catalog"
        );
        assert!(
            !names.contains(&"task"),
            "task must NOT appear in app-server catalog"
        );
        assert!(
            !names.contains(&"write_file"),
            "mutating tools must not appear in app-server catalog"
        );
        assert!(
            !names.contains(&"run_command"),
            "mutating tools must not appear in app-server catalog"
        );
    }

    #[tokio::test]
    async fn list_tools_schema_matches_executor_contract() {
        let d = CliToolDispatch::new();
        let tools = d.list_tools().await;
        let props = |name: &str| -> serde_json::Map<String, serde_json::Value> {
            tools
                .iter()
                .find(|tool| tool["name"] == name)
                .and_then(|tool| tool["inputSchema"]["properties"].as_object())
                .cloned()
                .unwrap_or_default()
        };

        assert!(props("web_search").contains_key("max_results"));
        assert!(!props("web_search").contains_key("num_results"));
        assert!(!props("web_fetch").contains_key("max_length"));
        assert!(props("run_command").is_empty());
        assert!(props("edit_file").is_empty());
    }

    #[tokio::test]
    async fn call_read_file_returns_real_content() {
        use std::io::Write;
        let mut tmp = tempfile::NamedTempFile::new_in(".").expect("tempfile");
        writeln!(tmp, "hello app-server").expect("write");
        let path = tmp.path().to_string_lossy().to_string();

        let d = CliToolDispatch::new();
        let result = d
            .call_tool("read_file", serde_json::json!({"path": path}))
            .await
            .expect("call_tool should not error");

        assert_eq!(
            result["isError"],
            serde_json::json!(false),
            "read_file should succeed: {:?}",
            result
        );
        let text = result["content"][0]["text"].as_str().expect("text content");
        assert!(
            text.contains("hello app-server"),
            "file content should appear in result: {}",
            text
        );
    }

    #[tokio::test]
    async fn call_grep_files_returns_real_result() {
        use std::io::Write;
        let dir = tempfile::tempdir_in(".").expect("tempdir");
        let file = dir.path().join("target.txt");
        std::fs::File::create(&file)
            .and_then(|mut f| writeln!(f, "needle_xyz found here"))
            .expect("write file");

        // Register the temp dir so path_security allows it
        crate::path_security::register_additional_workspace_root(&dir.path().to_string_lossy())
            .expect("register workspace root");

        let d = CliToolDispatch::new();
        let result = d
            .call_tool(
                "grep_files",
                serde_json::json!({
                    "pattern": "needle_xyz",
                    "path": dir.path().to_string_lossy().as_ref(),
                }),
            )
            .await
            .expect("call_tool should not error");

        assert_eq!(
            result["isError"],
            serde_json::json!(false),
            "grep_files should succeed: {:?}",
            result
        );
        let text = result["content"][0]["text"].as_str().expect("text content");
        assert!(
            text.contains("needle_xyz"),
            "grep result should contain pattern: {}",
            text
        );
    }

    #[tokio::test]
    async fn call_task_returns_honest_not_available_error() {
        let d = CliToolDispatch::new();
        let result = d
            .call_tool("task", serde_json::json!({"prompt": "do something"}))
            .await
            .expect("call_tool should not propagate error");

        assert_eq!(
            result["isError"],
            serde_json::json!(true),
            "task should return isError=true"
        );
        let text = result["content"][0]["text"].as_str().expect("text content");
        assert!(
            text.contains("not available via the app-server"),
            "should explain why: {}",
            text
        );
    }

    #[tokio::test]
    async fn call_mutating_tool_returns_read_only_surface_error() {
        let d = CliToolDispatch::new();
        let result = d
            .call_tool(
                "write_file",
                serde_json::json!({"path": "x.txt", "content": "nope"}),
            )
            .await
            .expect("call_tool should not propagate error");

        assert_eq!(result["isError"], serde_json::json!(true));
        let text = result["content"][0]["text"].as_str().expect("text content");
        assert!(
            text.contains("read-only"),
            "should explain read-only surface: {}",
            text
        );
    }

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

    #[tokio::test]
    async fn processor_tools_call_read_file_via_crate() {
        use agiworkforce_app_server::{JsonRpcRequest, Processor};
        use std::io::Write;

        let mut tmp = tempfile::NamedTempFile::new_in(".").expect("tempfile");
        writeln!(tmp, "processor_test_content").expect("write");
        let path = tmp.path().to_string_lossy().to_string();

        let proc = Processor::new(Arc::new(CliToolDispatch::new()));
        let resp = proc
            .process(JsonRpcRequest {
                jsonrpc: "2.0".into(),
                id: Some(serde_json::json!(99)),
                method: "tools/call".into(),
                params: serde_json::json!({
                    "name": "read_file",
                    "arguments": {"path": path},
                }),
            })
            .await;

        assert!(resp.error.is_none(), "should not error: {:?}", resp.error);
        let result = resp.result.expect("result");
        assert_eq!(result["isError"], serde_json::json!(false));
        assert!(
            result["content"][0]["text"]
                .as_str()
                .unwrap_or("")
                .contains("processor_test_content"),
            "expected file content in result: {:?}",
            result
        );
    }
}
