use std::collections::HashMap;
use std::sync::Arc;

use agiworkforce_mcp::protocol::{
    Implementation, RpcError, INVALID_PARAMS, INVALID_REQUEST, METHOD_NOT_FOUND, PARSE_ERROR,
};
use agiworkforce_mcp::server::{self, CacheScope, RequestEra};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::executor::McpServerExecutor;

const DISCOVER_TTL_MS: u64 = 3_600_000;
const TOOLS_TTL_MS: u64 = 60_000;

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

pub struct RequestHeaders<'a> {
    pub protocol_version: Option<&'a str>,
    pub method: Option<&'a str>,
    pub name: Option<&'a str>,
}

pub enum HttpReply {
    Json { status: u16, body: Value },
    Accepted,
    EventStream(Vec<Value>),
}

fn server_identity() -> Implementation {
    Implementation {
        name: "agi-workforce".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

fn server_capabilities() -> Value {
    json!({ "tools": {} })
}

fn rejected(status: u16, error: RpcError, id: Option<&Value>) -> HttpReply {
    HttpReply::Json {
        status,
        body: error.to_response(id),
    }
}

pub async fn serve(
    body: &str,
    headers: RequestHeaders<'_>,
    enabled_tools: &[String],
    executor: Arc<dyn McpServerExecutor>,
) -> HttpReply {
    let request: JsonRpcRequest = match serde_json::from_str::<Value>(body) {
        Err(e) => {
            return rejected(
                400,
                RpcError::new(PARSE_ERROR, format!("Parse error: {e}")),
                None,
            )
        }
        Ok(Value::Object(object)) => match serde_json::from_value(Value::Object(object)) {
            Ok(request) => request,
            Err(e) => {
                return rejected(
                    400,
                    RpcError::new(INVALID_REQUEST, format!("Invalid request: {e}")),
                    None,
                )
            }
        },
        Ok(_) => {
            return rejected(
                400,
                RpcError::new(INVALID_REQUEST, "Expected a single JSON-RPC request object"),
                None,
            )
        }
    };
    let Some(id) = request.id.clone() else {
        return HttpReply::Accepted;
    };
    let identity = server_identity();

    if request.method == "initialize" {
        let requested = request
            .params
            .as_ref()
            .and_then(|params| params.get("protocolVersion"))
            .and_then(Value::as_str);
        return HttpReply::Json {
            status: 200,
            body: server::success(
                Some(&id),
                server::initialize_result(requested, server_capabilities(), &identity),
            ),
        };
    }

    let modern = match server::classify_request(request.params.as_ref(), headers.protocol_version) {
        Ok(RequestEra::Modern { .. }) => true,
        Ok(RequestEra::Legacy) => false,
        Err(error) => return rejected(400, error, Some(&id)),
    };
    if modern {
        if let Err(error) = server::validate_standard_headers(
            &request.method,
            request.params.as_ref(),
            headers.method,
            headers.name,
        ) {
            return rejected(400, error, Some(&id));
        }
        match request.method.as_str() {
            "server/discover" => {
                return HttpReply::Json {
                    status: 200,
                    body: server::success(
                        Some(&id),
                        server::complete(
                            server::discover_result(server_capabilities(), DISCOVER_TTL_MS),
                            &identity,
                        ),
                    ),
                }
            }
            "subscriptions/listen" => {
                return HttpReply::EventStream(vec![
                    server::subscription_acknowledged(&id),
                    server::subscription_closed(&id, &identity),
                ])
            }
            "tools/list" | "tools/call" => {}
            other => {
                return rejected(
                    404,
                    RpcError::new(METHOD_NOT_FOUND, format!("Method not found: {other}")),
                    Some(&id),
                )
            }
        }
    }

    let response = dispatch(&request, enabled_tools, executor).await;
    let body = match (response.error, response.result) {
        (Some(error), _) => {
            RpcError::new(i64::from(error.code), error.message).to_response(Some(&id))
        }
        (None, result) => {
            let result = result.unwrap_or_else(|| json!({}));
            let result = match (modern, request.method.as_str()) {
                (true, "tools/list") => server::complete(
                    server::cacheable(result, TOOLS_TTL_MS, CacheScope::Private),
                    &identity,
                ),
                (true, _) => server::complete(result, &identity),
                (false, _) => result,
            };
            server::success(Some(&id), result)
        }
    };
    HttpReply::Json { status: 200, body }
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
        "tools/list" => handle_tools_list(request, enabled_tools),
        "tools/call" => handle_tools_call(request, enabled_tools, executor).await,
        _ => JsonRpcResponse::error(
            request.id.clone(),
            -32601,
            format!("Method not found: {}", request.method),
        ),
    }
}

fn handle_tools_list(request: &JsonRpcRequest, enabled_tools: &[String]) -> JsonRpcResponse {
    use crate::core::mcp::server::tools::McpServerToolRegistry;
    let tools = McpServerToolRegistry::list_tools(enabled_tools);
    JsonRpcResponse::success(request.id.clone(), json!({ "tools": tools }))
}

fn validate_tool_arguments(
    tool_schema: &Value,
    arguments: &HashMap<String, Value>,
) -> Result<(), String> {
    let input_schema = tool_schema
        .get("inputSchema")
        .and_then(Value::as_object)
        .ok_or_else(|| "Tool inputSchema is missing or invalid".to_string())?;
    let properties = input_schema
        .get("properties")
        .and_then(Value::as_object)
        .ok_or_else(|| "Tool inputSchema.properties is missing or invalid".to_string())?;

    if let Some(required) = input_schema.get("required").and_then(Value::as_array) {
        for key in required.iter().filter_map(Value::as_str) {
            if !arguments.contains_key(key) {
                return Err(format!("Missing required argument '{}'", key));
            }
        }
    }

    for (key, value) in arguments {
        let Some(property) = properties.get(key).and_then(Value::as_object) else {
            return Err(format!("Unknown argument '{}'", key));
        };
        if let Some(expected_type) = property.get("type").and_then(Value::as_str) {
            let ok = match expected_type {
                "string" => value.is_string(),
                "integer" => value.as_i64().is_some() || value.as_u64().is_some(),
                "number" => {
                    value.as_f64().is_some() || value.as_i64().is_some() || value.as_u64().is_some()
                }
                "boolean" => value.is_boolean(),
                "object" => value.is_object(),
                "array" => value.is_array(),
                _ => true,
            };
            if !ok {
                return Err(format!("Argument '{}' must be {}", key, expected_type));
            }
        }
        if let Some(enum_values) = property.get("enum").and_then(Value::as_array) {
            if !enum_values.iter().any(|item| item == value) {
                return Err(format!("Argument '{}' is not an allowed value", key));
            }
        }
    }

    Ok(())
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
            return JsonRpcResponse::error(
                request.id.clone(),
                INVALID_PARAMS as i32,
                "Missing params".to_string(),
            )
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
            INVALID_PARAMS as i32,
            format!(
                "Tool '{}' is not enabled on this MCP server.",
                call_params.name
            ),
        );
    }

    let arguments: HashMap<String, Value> = call_params.arguments.unwrap_or_default();
    let tool_schema = McpServerToolRegistry::list_tools(enabled_tools)
        .into_iter()
        .find(|tool| tool.get("name").and_then(Value::as_str) == Some(call_params.name.as_str()));
    let Some(tool_schema) = tool_schema else {
        return JsonRpcResponse::error(
            request.id.clone(),
            INVALID_PARAMS as i32,
            format!("Tool '{}' is not available.", call_params.name),
        );
    };
    if let Err(error) = validate_tool_arguments(&tool_schema, &arguments) {
        return JsonRpcResponse::error(request.id.clone(), -32602, error);
    }

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
        assert_eq!(response.error.as_ref().unwrap().code, -32602);
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

#[cfg(test)]
mod protocol_version_tests {
    use agiworkforce_mcp::server::negotiate_legacy_version;

    /// The client asked for a revision we serve, so confirm that one. Answering
    /// a fixed older revision made us look two behind to every modern client.
    #[test]
    fn test_supported_request_is_echoed_back() {
        assert_eq!(negotiate_legacy_version(Some("2025-11-25")), "2025-11-25");
        assert_eq!(negotiate_legacy_version(Some("2024-11-05")), "2024-11-05");
    }

    /// A revision `initialize` cannot serve gets our preference, not silence
    /// and not the client's own string echoed back as if we understood it.
    #[test]
    fn test_unsupported_request_falls_back_to_our_preference() {
        assert_eq!(negotiate_legacy_version(Some("2026-07-28")), "2025-11-25");
        assert_eq!(negotiate_legacy_version(Some("1900-01-01")), "2025-11-25");
        assert_eq!(negotiate_legacy_version(None), "2025-11-25");
    }

    /// The stateless revision is served per request through `server/discover`
    /// and `_meta`, and is the first revision the server advertises.
    #[test]
    fn test_stateless_revision_is_advertised() {
        assert_eq!(
            agiworkforce_mcp::protocol::supported_versions()[0],
            "2026-07-28"
        );
    }
}
