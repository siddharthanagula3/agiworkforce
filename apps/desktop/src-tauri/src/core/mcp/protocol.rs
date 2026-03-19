use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
    pub id: RequestId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub result: Value,
    pub id: RequestId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub jsonrpc: String,
    pub error: ErrorObject,
    pub id: RequestId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcNotification {
    pub jsonrpc: String,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(untagged)]
pub enum RequestId {
    String(String),
    Number(i64),
    Null,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorObject {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

pub const PARSE_ERROR: i32 = -32700;
pub const INVALID_REQUEST: i32 = -32600;
pub const METHOD_NOT_FOUND: i32 = -32601;
pub const INVALID_PARAMS: i32 = -32602;
pub const INTERNAL_ERROR: i32 = -32603;

#[derive(Debug, Clone)]
pub enum McpMessage {
    Request(JsonRpcRequest),
    Response(JsonRpcResponse),
    Error(JsonRpcError),
    Notification(JsonRpcNotification),
}

impl McpMessage {
    pub fn from_str(s: &str) -> Result<Self, serde_json::Error> {
        if let Ok(req) = serde_json::from_str::<JsonRpcRequest>(s) {
            return Ok(McpMessage::Request(req));
        }
        if let Ok(resp) = serde_json::from_str::<JsonRpcResponse>(s) {
            return Ok(McpMessage::Response(resp));
        }
        if let Ok(err) = serde_json::from_str::<JsonRpcError>(s) {
            return Ok(McpMessage::Error(err));
        }
        if let Ok(notif) = serde_json::from_str::<JsonRpcNotification>(s) {
            return Ok(McpMessage::Notification(notif));
        }

        Err(serde_json::from_str::<Value>(s).err().unwrap_or_else(|| {
            serde_json::Error::io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "Unknown message type",
            ))
        }))
    }

    pub fn to_string(&self) -> Result<String, serde_json::Error> {
        match self {
            McpMessage::Request(req) => serde_json::to_string(req),
            McpMessage::Response(resp) => serde_json::to_string(resp),
            McpMessage::Error(err) => serde_json::to_string(err),
            McpMessage::Notification(notif) => serde_json::to_string(notif),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitializeParams {
    #[serde(rename = "protocolVersion")]
    pub protocol_version: String,
    pub capabilities: ClientCapabilities,
    #[serde(rename = "clientInfo")]
    pub client_info: Implementation,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ClientCapabilities {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub roots: Option<RootsCapability>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sampling: Option<HashMap<String, Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RootsCapability {
    #[serde(rename = "listChanged")]
    pub list_changed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Implementation {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitializeResult {
    #[serde(rename = "protocolVersion")]
    pub protocol_version: String,
    pub capabilities: ServerCapabilities,
    #[serde(rename = "serverInfo")]
    pub server_info: Implementation,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ServerCapabilities {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<HashMap<String, Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resources: Option<HashMap<String, Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompts: Option<HashMap<String, Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logging: Option<HashMap<String, Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolDefinition {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(rename = "inputSchema")]
    pub input_schema: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolsListResult {
    pub tools: Vec<McpToolDefinition>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "nextCursor")]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallParams {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arguments: Option<HashMap<String, Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallResult {
    pub content: Vec<ToolContent>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "isError")]
    pub is_error: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ToolContent {
    Text {
        text: String,
    },
    Image {
        data: String,
        #[serde(rename = "mimeType")]
        mime_type: String,
    },
    Resource {
        resource: ResourceReference,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceReference {
    pub uri: String,
    #[serde(skip_serializing_if = "Option::is_none", rename = "mimeType")]
    pub mime_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ResourcesListParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourcesListResult {
    pub resources: Vec<ResourceDefinition>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "nextCursor")]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceDefinition {
    pub uri: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "mimeType")]
    pub mime_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceReadParams {
    pub uri: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceReadResult {
    pub contents: Vec<ResourceContent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ResourceContent {
    Text { uri: String, text: String },
    Blob { uri: String, blob: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptsListResult {
    pub prompts: Vec<PromptDefinition>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "nextCursor")]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptDefinition {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arguments: Option<Vec<PromptArgument>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptArgument {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required: Option<bool>,
}

// ── MCP Tasks primitive (spec 2025-11-25) ────────────────────────────────────

/// JSON-RPC method names for the Tasks primitive.
pub const METHOD_TASKS_CREATE: &str = "tasks/create";
/// Get the current state of a task by ID.
pub const METHOD_TASKS_GET: &str = "tasks/get";
/// Request cancellation of a running task.
pub const METHOD_TASKS_CANCEL: &str = "tasks/cancel";
/// List all tasks, optionally filtered by status.
pub const METHOD_TASKS_LIST: &str = "tasks/list";

/// Lifecycle status of an MCP task.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum McpTaskStatus {
    /// Task has been accepted but not yet started.
    Pending,
    /// Task is actively executing.
    Running,
    /// Task finished successfully; `result` is populated.
    Completed,
    /// Task encountered an error; `error` is populated.
    Failed,
    /// Task was cancelled before completion.
    Cancelled,
}

/// Progress report attached to a running [`McpTask`].
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTaskProgress {
    /// Units of work completed so far.
    pub current: u64,
    /// Total units of work, if known.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<u64>,
    /// Human-readable progress description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// MCP Task — represents a long-running operation with progress tracking.
///
/// Tasks allow MCP servers to execute work asynchronously and report
/// incremental progress back to the client. The client polls via
/// [`METHOD_TASKS_GET`] or receives push notifications via SSE.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTask {
    /// Unique, server-assigned task identifier.
    pub id: String,
    /// Current lifecycle status.
    pub status: McpTaskStatus,
    /// Incremental progress, populated while status is [`McpTaskStatus::Running`].
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<McpTaskProgress>,
    /// Final tool call result, populated when status is [`McpTaskStatus::Completed`].
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<ToolCallResult>,
    /// Error details, populated when status is [`McpTaskStatus::Failed`].
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorObject>,
    /// RFC 3339 timestamp at which the task was created.
    pub created_at: String,
    /// RFC 3339 timestamp of the most recent status change.
    pub updated_at: String,
}

/// Parameters for `tasks/create`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskCreateParams {
    /// Name of the tool to execute asynchronously.
    pub tool_name: String,
    /// Tool arguments, forwarded verbatim to the server.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arguments: Option<std::collections::HashMap<String, Value>>,
}

/// Parameters for `tasks/get` and `tasks/cancel`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskIdParams {
    /// The task ID returned by `tasks/create`.
    pub task_id: String,
}

/// Parameters for `tasks/list`.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TaskListParams {
    /// Filter by status; returns all tasks when `None`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<McpTaskStatus>,
    /// Pagination cursor from a previous response.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

/// Result for `tasks/list`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskListResult {
    /// Matching tasks for this page.
    pub tasks: Vec<McpTask>,
    /// Opaque cursor to fetch the next page, if any.
    #[serde(skip_serializing_if = "Option::is_none", rename = "nextCursor")]
    pub next_cursor: Option<String>,
}

// ── Capability advertisement (spec 2025-11-25) ────────────────────────────────

/// Extended server capabilities including Tasks and Elicitation support.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ServerCapabilitiesV2 {
    /// Tool listing and calling capability.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<std::collections::HashMap<String, Value>>,
    /// Resource listing and reading capability.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resources: Option<std::collections::HashMap<String, Value>>,
    /// Prompt listing and retrieval capability.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompts: Option<std::collections::HashMap<String, Value>>,
    /// Log streaming capability.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logging: Option<std::collections::HashMap<String, Value>>,
    /// Tasks primitive support (spec 2025-11-25).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tasks: Option<std::collections::HashMap<String, Value>>,
    /// Elicitation support — server can request user input (spec 2025-11-25).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub elicitation: Option<std::collections::HashMap<String, Value>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_request() {
        let json = r#"{"jsonrpc":"2.0","method":"tools/list","id":1}"#;
        let msg = McpMessage::from_str(json).unwrap();
        match msg {
            McpMessage::Request(req) => {
                assert_eq!(req.method, "tools/list");
                assert_eq!(req.jsonrpc, "2.0");
            }
            _ => panic!("Expected Request"),
        }
    }

    #[test]
    fn test_parse_response() {
        let json = r#"{"jsonrpc":"2.0","result":{"tools":[]},"id":1}"#;
        let msg = McpMessage::from_str(json).unwrap();
        match msg {
            McpMessage::Response(_) => {}
            _ => panic!("Expected Response"),
        }
    }

    #[test]
    fn test_parse_error() {
        let json =
            r#"{"jsonrpc":"2.0","error":{"code":-32601,"message":"Method not found"},"id":1}"#;
        let msg = McpMessage::from_str(json).unwrap();
        match msg {
            McpMessage::Error(err) => {
                assert_eq!(err.error.code, METHOD_NOT_FOUND);
            }
            _ => panic!("Expected Error"),
        }
    }

    #[test]
    fn test_serialize_request() {
        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            method: "initialize".to_string(),
            params: Some(serde_json::json!({"protocolVersion": "2024-11-05"})),
            id: RequestId::Number(1),
        };
        let msg = McpMessage::Request(req);
        let json = msg.to_string().unwrap();
        assert!(json.contains("initialize"));
        assert!(json.contains("2.0"));
    }

    #[test]
    fn test_tool_definition() {
        let tool = McpToolDefinition {
            name: "read_file".to_string(),
            description: Some("Read file contents".to_string()),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string"}
                },
                "required": ["path"]
            }),
        };
        let json = serde_json::to_string(&tool).unwrap();
        assert!(json.contains("read_file"));
        assert!(json.contains("inputSchema"));
    }

    // ── Tasks primitive tests ────────────────────────────────────────────────

    #[test]
    fn test_mcp_task_status_serde() {
        let cases = [
            (McpTaskStatus::Pending, "\"pending\""),
            (McpTaskStatus::Running, "\"running\""),
            (McpTaskStatus::Completed, "\"completed\""),
            (McpTaskStatus::Failed, "\"failed\""),
            (McpTaskStatus::Cancelled, "\"cancelled\""),
        ];
        for (status, expected_json) in &cases {
            let json = serde_json::to_string(status).unwrap();
            assert_eq!(&json, expected_json, "serialization mismatch for {:?}", status);
            let deserialized: McpTaskStatus = serde_json::from_str(&json).unwrap();
            assert_eq!(&deserialized, status);
        }
    }

    #[test]
    fn test_mcp_task_progress_optional_fields() {
        let progress = McpTaskProgress {
            current: 5,
            total: Some(10),
            message: Some("Halfway done".to_string()),
        };
        let json = serde_json::to_string(&progress).unwrap();
        assert!(json.contains("\"current\":5"));
        assert!(json.contains("\"total\":10"));
        assert!(json.contains("Halfway done"));

        // Without optional fields
        let minimal = McpTaskProgress {
            current: 1,
            total: None,
            message: None,
        };
        let minimal_json = serde_json::to_string(&minimal).unwrap();
        assert!(!minimal_json.contains("total"), "total should be omitted when None");
        assert!(!minimal_json.contains("message"), "message should be omitted when None");
    }

    #[test]
    fn test_mcp_task_full_roundtrip() {
        let task = McpTask {
            id: "task-001".to_string(),
            status: McpTaskStatus::Running,
            progress: Some(McpTaskProgress {
                current: 3,
                total: Some(10),
                message: Some("Processing…".to_string()),
            }),
            result: None,
            error: None,
            created_at: "2025-11-25T00:00:00Z".to_string(),
            updated_at: "2025-11-25T00:00:01Z".to_string(),
        };

        let json = serde_json::to_string(&task).unwrap();
        assert!(json.contains("task-001"));
        assert!(json.contains("\"status\":\"running\""));
        assert!(json.contains("\"current\":3"));
        // result and error should be absent
        assert!(!json.contains("\"result\""), "result should be omitted");
        assert!(!json.contains("\"error\""), "error should be omitted");

        let deserialized: McpTask = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "task-001");
        assert_eq!(deserialized.status, McpTaskStatus::Running);
    }

    #[test]
    fn test_task_method_constants() {
        assert_eq!(METHOD_TASKS_CREATE, "tasks/create");
        assert_eq!(METHOD_TASKS_GET, "tasks/get");
        assert_eq!(METHOD_TASKS_CANCEL, "tasks/cancel");
        assert_eq!(METHOD_TASKS_LIST, "tasks/list");
    }

    #[test]
    fn test_task_create_params_serde() {
        let mut args = std::collections::HashMap::new();
        args.insert("path".to_string(), serde_json::json!("/tmp/test.txt"));

        let params = TaskCreateParams {
            tool_name: "read_file".to_string(),
            arguments: Some(args),
        };
        let json = serde_json::to_string(&params).unwrap();
        assert!(json.contains("read_file"));
        assert!(json.contains("toolName"));
    }

    #[test]
    fn test_task_list_params_defaults() {
        let params = TaskListParams::default();
        let json = serde_json::to_string(&params).unwrap();
        // Both optional fields should be absent when None
        assert!(!json.contains("status"), "status should be omitted by default");
        assert!(!json.contains("cursor"), "cursor should be omitted by default");
    }
}
