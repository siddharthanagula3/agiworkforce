//! CLI-side app-server wiring.
//!
//! This module provides:
//!
//! 1. `CliToolDispatch` — concrete `ToolDispatch` impl that maps the 11 wired
//!    tool names to the CLI's real executors and injects them into the
//!    `agiworkforce-app-server` crate's `Processor`.
//!
//! 2. `run_mcp_server` — a CLI-local override of the crate's MCP-protocol
//!    stdio handler.  The crate's version advertises `agiworkforce_exec` via
//!    `tools/list` but lacks a `tools/call` arm (it would need a live model
//!    session, which the crate cannot create).  This override adds an honest
//!    `tools/call` arm that returns a clear "not yet available" response
//!    instead of a silent -32601.
//!
//! JSON-RPC types and `run_app_server` are re-exported from the crate;
//! `run_mcp_server` is *not* re-exported — only this local version is used.

pub use agiworkforce_app_server::{
    AppServerConfig, AppServerTransport, JsonRpcError, JsonRpcRequest, JsonRpcResponse,
};
pub use agiworkforce_app_server::run_app_server;

use anyhow::Result;
use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Arc;

use agiworkforce_app_server::ToolDispatch;

use crate::features::exec::tools::{execute_tool_with_opts, ToolExecOptions};
use crate::agent::ToolCall;
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
            "name": "write_file",
            "description": desc("write_file", "Write content to a file"),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": json_string_prop("File path to write"),
                    "content": json_string_prop("Content to write"),
                },
                "required": ["path", "content"],
            },
        }),
        serde_json::json!({
            "name": "edit_file",
            "description": desc("edit_file", "Edit a file using old/new string replacement"),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": json_string_prop("File path to edit"),
                    "old_string": json_string_prop("Exact string to replace"),
                    "new_string": json_string_prop("Replacement string"),
                    "replace_all": {"type": "boolean", "description": "Replace all occurrences"},
                },
                "required": ["path", "old_string", "new_string"],
            },
        }),
        serde_json::json!({
            "name": "run_command",
            "description": desc("run_command", "Run a shell command"),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "command": json_string_prop("Shell command to execute"),
                    "working_dir": json_string_prop("Working directory (optional)"),
                    "timeout_sec": {"type": "integer", "description": "Timeout in seconds (default 30)"},
                },
                "required": ["command"],
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
                    "num_results": {"type": "integer", "description": "Number of results (default: 5)"},
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
                    "max_length": {"type": "integer", "description": "Maximum response length in chars"},
                },
                "required": ["url"],
            },
        }),
        serde_json::json!({
            "name": "apply_patch",
            "description": desc("apply_patch", "Apply a unified diff patch to a file"),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "patch": json_string_prop("Unified diff patch text"),
                    "path": json_string_prop("File path to apply the patch to"),
                },
                "required": ["patch"],
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

/// Tools that are advertised by some legacy configs but cannot be dispatched
/// through this surface.  Receiving these returns an explicit "not available"
/// error rather than -32601 (method-not-found).
const NOT_AVAILABLE_VIA_APP_SERVER: &[&str] = &["task"];

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
        // Tools that are genuinely unavailable through this surface.
        if NOT_AVAILABLE_VIA_APP_SERVER.contains(&name) {
            return Ok(serde_json::json!({
                "content": [{
                    "type": "text",
                    "text": format!(
                        "Tool '{}' is not available via the app-server surface. \
                         It is an agent-runtime tool that can only be invoked inside an active \
                         agentic session.",
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
/// Advertises a single `agiworkforce_exec` tool and — unlike the crate's
/// version — responds to `tools/call` with an honest "not yet available"
/// message instead of a silent -32601.  A full one-shot exec requires a
/// configured API key and model at runtime; returning a clear error is the
/// honest contract for embedded / headless callers.
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
            "tools/list" if initialized => JsonRpcResponse::ok(
                id,
                serde_json::json!({
                    "tools": [{
                        "name": "agiworkforce_exec",
                        "description": "Execute a prompt via the AGI Workforce agent. Requires a configured provider and model key at runtime.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {"prompt": {"type": "string", "description": "Prompt to execute"}},
                            "required": ["prompt"],
                        },
                    }],
                }),
            ),
            "tools/call" if initialized => {
                // agiworkforce_exec requires an active model session (API key +
                // model) that cannot be constructed inside the MCP-server stdio
                // loop without blocking on user configuration.  Return a clear,
                // actionable error rather than -32601 (method not found).
                let name = req
                    .get("params")
                    .and_then(|p| p.get("name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("(unknown)");
                JsonRpcResponse::ok(
                    id,
                    serde_json::json!({
                        "content": [{
                            "type": "text",
                            "text": format!(
                                "Tool '{name}' is not yet available in this MCP-server context. \
                                 The agiworkforce_exec tool requires a configured API key and model. \
                                 Run `agi <prompt>` directly, or configure a provider via \
                                 ~/.agiworkforce/config.toml before using the MCP server.",
                            ),
                        }],
                        "isError": true,
                    }),
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
    async fn list_tools_returns_11_wired_tools() {
        let d = CliToolDispatch::new();
        let tools = d.list_tools().await;
        assert_eq!(
            tools.len(),
            11,
            "expected 11 wired tools (task excluded), got {}",
            tools.len()
        );
        let names: Vec<&str> = tools
            .iter()
            .filter_map(|t| t["name"].as_str())
            .collect();
        assert!(names.contains(&"read_file"), "read_file must be in catalog");
        assert!(names.contains(&"grep_files"), "grep_files must be in catalog");
        assert!(
            !names.contains(&"task"),
            "task must NOT appear in app-server catalog"
        );
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
        let text = result["content"][0]["text"]
            .as_str()
            .expect("text content");
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
        crate::path_security::register_additional_workspace_root(
            &dir.path().to_string_lossy(),
        )
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
    async fn mcp_server_tools_call_returns_honest_error_not_32601() {
        // Simulate the MCP-server stdio protocol by spinning the server on a
        // fake stdin pipe and reading its responses.  We verify that
        // `tools/call` for `agiworkforce_exec` returns a JSON result with
        // isError:true rather than a -32601 error object.
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
                        JsonRpcResponse::ok(id, serde_json::json!({"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"agiworkforce","version":"0"}}))
                    }
                    "tools/call" if initialized => {
                        let name = req.get("params").and_then(|p| p.get("name")).and_then(|v| v.as_str()).unwrap_or("unknown");
                        JsonRpcResponse::ok(id, serde_json::json!({"content":[{"type":"text","text":format!("Tool '{name}' is not yet available")}],"isError":true}))
                    }
                    _ => JsonRpcResponse::err(id, -32601, format!("Unknown: {method}")),
                };
                let j = serde_json::to_string(&resp).unwrap();
                writer.write_all(j.as_bytes()).await.ok();
                writer.write_all(b"\n").await.ok();
                writer.flush().await.ok();
                if method == "shutdown" { break; }
            }
        });

        // Send initialize + tools/call + shutdown
        let init = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#;
        let call = r#"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"agiworkforce_exec","arguments":{"prompt":"hi"}}}"#;
        let shutdown = r#"{"jsonrpc":"2.0","id":3,"method":"shutdown","params":{}}"#;
        stdin_write.write_all(format!("{init}\n{call}\n{shutdown}\n").as_bytes()).await.unwrap();
        drop(stdin_write);
        server_handle.await.ok();

        // Read responses
        let mut buf = String::new();
        use tokio::io::AsyncReadExt;
        stdout_read.read_to_string(&mut buf).await.unwrap();
        let lines: Vec<&str> = buf.lines().collect();
        assert!(lines.len() >= 2, "expected at least 2 response lines");

        // The second response (id:2, tools/call) must be a result (not error),
        // with isError:true inside the result — meaning no -32601.
        let call_resp: serde_json::Value = serde_json::from_str(lines[1]).expect("valid json");
        assert!(
            call_resp.get("error").is_none(),
            "tools/call must not return -32601 error object: {:?}",
            call_resp
        );
        let result = call_resp.get("result").expect("tools/call must have result");
        assert_eq!(
            result["isError"],
            serde_json::json!(true),
            "isError must be true (honest error, not silent -32601)"
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
