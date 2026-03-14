use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::executor::McpServerExecutor;

#[derive(Debug, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub method: String,
    pub params: Option<Value>,
    pub id: Option<Value>,
}

#[derive(Debug, Serialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
    pub id: Option<Value>,
}

#[derive(Debug, Serialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
}

impl JsonRpcResponse {
    pub fn success(id: Option<Value>, result: Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            result: Some(result),
            error: None,
            id,
        }
    }

    pub fn error(id: Option<Value>, code: i32, message: String) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            result: None,
            error: Some(JsonRpcError { code, message }),
            id,
        }
    }
}

pub async fn dispatch(
    request: &JsonRpcRequest,
    enabled_tools: &[String],
    executor: Arc<dyn McpServerExecutor>,
) -> JsonRpcResponse {
    match request.method.as_str() {
        "initialize" => handle_initialize(request),
        "tools/list" => handle_tools_list(request, enabled_tools),
        "tools/call" => handle_tools_call(request, enabled_tools, executor).await,
        _ => JsonRpcResponse::error(
            request.id.clone(),
            -32601,
            format!("Method not found: {}", request.method),
        ),
    }
}

fn handle_initialize(request: &JsonRpcRequest) -> JsonRpcResponse {
    JsonRpcResponse::success(
        request.id.clone(),
        json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "tools": {}
            },
            "serverInfo": {
                "name": "agi-workforce",
                "version": env!("CARGO_PKG_VERSION")
            }
        }),
    )
}

fn handle_tools_list(request: &JsonRpcRequest, enabled_tools: &[String]) -> JsonRpcResponse {
    use crate::core::mcp::server::tools::McpServerToolRegistry;
    let tools = McpServerToolRegistry::list_tools(enabled_tools);
    JsonRpcResponse::success(request.id.clone(), json!({ "tools": tools }))
}

async fn handle_tools_call(
    request: &JsonRpcRequest,
    enabled_tools: &[String],
    executor: Arc<dyn McpServerExecutor>,
) -> JsonRpcResponse {
    use crate::core::mcp::protocol::ToolCallParams;
    use crate::core::mcp::server::tools::McpServerToolRegistry;

    let params = match &request.params {
        Some(p) => p,
        None => {
            return JsonRpcResponse::error(request.id.clone(), -32602, "Missing params".to_string())
        }
    };

    let call_params: ToolCallParams = match serde_json::from_value(params.clone()) {
        Ok(call_params) => call_params,
        Err(error) => {
            return JsonRpcResponse::error(
                request.id.clone(),
                -32602,
                format!("Invalid tool call params: {}", error),
            )
        }
    };

    if call_params.name.trim().is_empty() {
        return JsonRpcResponse::error(request.id.clone(), -32602, "Missing tool name".to_string());
    }

    if !McpServerToolRegistry::is_tool_enabled(enabled_tools, &call_params.name) {
        return JsonRpcResponse::error(
            request.id.clone(),
            -32601,
            format!(
                "Tool '{}' is not enabled on this MCP server.",
                call_params.name
            ),
        );
    }

    let arguments: HashMap<String, Value> = call_params.arguments.unwrap_or_default();

    match executor.execute_tool(&call_params.name, arguments).await {
        Ok(outcome) => JsonRpcResponse::success(request.id.clone(), outcome.into_json()),
        Err(error) => JsonRpcResponse::error(request.id.clone(), -32603, error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::mcp::server::executor::{McpServerExecutor, McpServerToolOutcome};
    use async_trait::async_trait;
    use parking_lot::Mutex;

    #[derive(Default)]
    struct StubExecutor {
        last_call: Mutex<Option<(String, HashMap<String, Value>)>>,
        outcome: Mutex<Option<McpServerToolOutcome>>,
    }

    #[async_trait]
    impl McpServerExecutor for StubExecutor {
        async fn execute_tool(
            &self,
            tool_name: &str,
            arguments: HashMap<String, Value>,
        ) -> Result<McpServerToolOutcome, String> {
            *self.last_call.lock() = Some((tool_name.to_string(), arguments));
            Ok(self
                .outcome
                .lock()
                .clone()
                .unwrap_or_else(|| McpServerToolOutcome::success("ok".to_string(), None)))
        }
    }

    #[tokio::test]
    async fn tools_call_routes_to_executor() {
        let executor = Arc::new(StubExecutor::default());
        *executor.outcome.lock() = Some(McpServerToolOutcome::success(
            "done".to_string(),
            Some(json!({ "status": "ok" })),
        ));

        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            method: "tools/call".to_string(),
            params: Some(json!({
                "name": "agi_chat",
                "arguments": {
                    "message": "hello"
                }
            })),
            id: Some(json!(1)),
        };

        let response = dispatch(&request, &["agi_chat".to_string()], executor.clone()).await;
        assert!(response.error.is_none());
        assert_eq!(
            response.result.as_ref().unwrap()["content"][0]["text"],
            "done"
        );
        assert_eq!(
            executor.last_call.lock().as_ref().unwrap().1["message"],
            "hello"
        );
    }

    #[tokio::test]
    async fn tools_call_rejects_disabled_tool() {
        let executor = Arc::new(StubExecutor::default());
        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            method: "tools/call".to_string(),
            params: Some(json!({
                "name": "agi_bash",
                "arguments": {
                    "command": "pwd"
                }
            })),
            id: Some(json!(1)),
        };

        let response = dispatch(&request, &["agi_chat".to_string()], executor).await;
        assert!(response.result.is_none());
        assert_eq!(response.error.as_ref().unwrap().code, -32601);
    }

    #[tokio::test]
    async fn tools_call_returns_tool_error_result() {
        let executor = Arc::new(StubExecutor::default());
        *executor.outcome.lock() = Some(McpServerToolOutcome::error(
            "failed".to_string(),
            Some(json!({ "reason": "boom" })),
        ));

        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            method: "tools/call".to_string(),
            params: Some(json!({
                "name": "agi_chat",
                "arguments": {
                    "message": "hello"
                }
            })),
            id: Some(json!(1)),
        };

        let response = dispatch(&request, &["agi_chat".to_string()], executor).await;
        assert!(response.error.is_none());
        assert_eq!(response.result.as_ref().unwrap()["isError"], true);
        assert_eq!(
            response.result.as_ref().unwrap()["structuredContent"]["reason"],
            "boom"
        );
    }
}
