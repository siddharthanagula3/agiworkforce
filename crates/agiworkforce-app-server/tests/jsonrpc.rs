//! Public-API JSON-RPC integration test for the app-server `Processor`.
//!
//! Exercises the full lifecycle (initialize → tools/list → tools/call → shutdown)
//! through the public `ToolDispatch` trait, mirroring how the cli wires its
//! own `CliToolDispatch` in production.

use agiworkforce_app_server::{JsonRpcRequest, JsonRpcResponse, Processor, ToolDispatch};
use async_trait::async_trait;
use std::sync::Arc;

struct StubDispatch {
    last_call: tokio::sync::Mutex<Option<(String, serde_json::Value)>>,
}

#[async_trait]
impl ToolDispatch for StubDispatch {
    async fn list_tools(&self) -> Vec<serde_json::Value> {
        vec![
            serde_json::json!({
                "name": "read_file",
                "description": "Read a file from disk",
                "inputSchema": {
                    "type": "object",
                    "properties": {"path": {"type": "string"}},
                    "required": ["path"],
                },
            }),
            serde_json::json!({
                "name": "list_directory",
                "description": "List directory contents",
                "inputSchema": {
                    "type": "object",
                    "properties": {"path": {"type": "string"}},
                    "required": ["path"],
                },
            }),
        ]
    }

    async fn call_tool(
        &self,
        name: &str,
        args: serde_json::Value,
    ) -> anyhow::Result<serde_json::Value> {
        *self.last_call.lock().await = Some((name.to_string(), args.clone()));
        match name {
            "read_file" => {
                let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
                Ok(serde_json::json!({
                    "content": [{"type": "text", "text": format!("<contents of {path}>")}],
                    "isError": false,
                }))
            }
            _ => anyhow::bail!("unknown tool: {name}"),
        }
    }
}

fn req(id: i64, method: &str, params: serde_json::Value) -> JsonRpcRequest {
    JsonRpcRequest {
        jsonrpc: "2.0".into(),
        id: Some(serde_json::json!(id)),
        method: method.into(),
        params,
    }
}

fn ok(resp: JsonRpcResponse) -> serde_json::Value {
    resp.result.expect("expected ok response")
}

#[tokio::test]
async fn full_lifecycle_initialize_list_call_shutdown() {
    let stub = Arc::new(StubDispatch {
        last_call: tokio::sync::Mutex::new(None),
    });
    let proc = Processor::new(stub.clone());

    // 1. initialize
    let init = ok(proc.process(req(1, "initialize", serde_json::json!({}))).await);
    assert_eq!(init["capabilities"]["tools"], serde_json::json!(true));

    // 2. tools/list
    let list = ok(proc.process(req(2, "tools/list", serde_json::json!({}))).await);
    let tools = list["tools"].as_array().expect("tools array");
    assert_eq!(tools.len(), 2);
    assert!(tools.iter().any(|t| t["name"] == "read_file"));

    // 3. tools/call
    let call = ok(proc
        .process(req(
            3,
            "tools/call",
            serde_json::json!({"name": "read_file", "arguments": {"path": "Cargo.toml"}}),
        ))
        .await);
    assert_eq!(call["isError"], serde_json::json!(false));
    assert!(call["content"][0]["text"]
        .as_str()
        .unwrap_or("")
        .contains("Cargo.toml"));

    let last_call = stub.last_call.lock().await.clone();
    assert_eq!(
        last_call,
        Some((
            "read_file".into(),
            serde_json::json!({"path": "Cargo.toml"})
        ))
    );

    // 4. shutdown
    let shutdown = ok(proc.process(req(4, "shutdown", serde_json::json!({}))).await);
    assert_eq!(shutdown, serde_json::json!({"shutdown": true}));
}

#[tokio::test]
async fn parse_error_on_non_jsonrpc_input() {
    // The Processor itself only handles parsed JsonRpcRequest; the stdio/ws
    // transports are responsible for emitting -32700. We verify here that
    // the public response constructor produces the right shape.
    let resp = JsonRpcResponse::err(None, -32700, "Parse error: …".into());
    assert!(resp.result.is_none());
    let err = resp.error.expect("err");
    assert_eq!(err.code, -32700);
}
