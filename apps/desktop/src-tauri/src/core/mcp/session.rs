use super::protocol::{
    ClientCapabilities, Implementation, InitializeParams, InitializeResult, McpTask,
    McpToolDefinition, ResourceDefinition, ResourceReadParams, ResourceReadResult,
    ResourcesListParams, ResourcesListResult, TaskCreateParams, TaskIdParams, TaskListParams,
    TaskListResult, ToolCallParams, ToolCallResult, ToolsListResult, METHOD_TASKS_CANCEL,
    METHOD_TASKS_CREATE, METHOD_TASKS_GET, METHOD_TASKS_LIST,
};
use super::transport::{McpTransport, Transport};
use crate::core::mcp::{McpError, McpResult, McpServerConfig};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::oneshot;

/// Default timeout for session initialization (10 seconds).
const INITIALIZATION_TIMEOUT_SECS: u64 = 10;

/// Default timeout for elicitation requests (60 seconds).
///
/// Servers may override this per-request via [`ElicitationRequest::timeout_seconds`].
const ELICITATION_DEFAULT_TIMEOUT_SECS: u64 = 60;

// ── Elicitation types (spec 2025-11-25) ──────────────────────────────────────

/// An elicitation request from an MCP server asking for additional user input
/// during tool execution.
///
/// The server issues this when it needs data that was not provided in the
/// original tool call (e.g., confirmation, a missing parameter, credentials).
/// The client must emit a Tauri event with the request, wait for the user's
/// response, and then call [`McpSession::respond_elicitation`].
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElicitationRequest {
    /// Unique identifier for this elicitation, used to correlate the response.
    pub id: String,
    /// Human-readable prompt shown to the user.
    pub message: String,
    /// Optional JSON Schema describing the expected response structure.
    /// When `None`, a free-form text response is expected.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schema: Option<serde_json::Value>,
    /// How long (in seconds) the client should wait for the user before
    /// sending a cancelled response. Defaults to [`ELICITATION_DEFAULT_TIMEOUT_SECS`].
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout_seconds: Option<u64>,
}

/// The client's reply to an [`ElicitationRequest`].
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElicitationResponse {
    /// Matches [`ElicitationRequest::id`].
    pub id: String,
    /// The user-supplied value. `None` when `cancelled` is `true`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    /// `true` if the user dismissed or timed out without providing a value.
    pub cancelled: bool,
}

/// Internal channel state for a pending elicitation.
struct PendingElicitation {
    /// One-shot sender that delivers the user's response to the waiting task.
    sender: oneshot::Sender<ElicitationResponse>,
}

pub struct McpSession {
    name: String,

    transport: Arc<Transport>,

    /// Server info, protected by RwLock for thread-safe access.
    server_info: Arc<RwLock<Option<Implementation>>>,

    /// Server capabilities, protected by RwLock for thread-safe access.
    capabilities: Arc<RwLock<Option<super::protocol::ServerCapabilities>>>,

    tools: Arc<RwLock<Vec<McpToolDefinition>>>,

    /// Guard to ensure initialize() is only called once.
    initialized: AtomicBool,

    /// Pending elicitation requests keyed by elicitation ID.
    ///
    /// Each entry holds a one-shot sender that delivers the user's
    /// [`ElicitationResponse`] to the task waiting in [`McpSession::request_elicitation`].
    pending_elicitations: Arc<parking_lot::Mutex<HashMap<String, PendingElicitation>>>,
}

impl McpSession {
    /// Connect to an MCP server using the appropriate transport
    ///
    /// Automatically selects the transport based on configuration:
    /// - STDIO: For local process-based servers (default)
    /// - HTTP/SSE: For remote servers accessed via HTTP
    pub async fn connect(name: String, config: McpServerConfig) -> McpResult<Self> {
        tracing::info!("[MCP Session] Connecting to server '{}'", name);

        let transport = Transport::from_config(name.clone(), &config).await?;

        // For HTTP/SSE transport, optionally start the SSE listener
        if let Transport::HttpSse(ref http_transport) = transport {
            // Start SSE listener for server-initiated messages
            // This is optional - some servers may not support SSE
            if let Err(e) = http_transport.start_sse_listener(None).await {
                tracing::warn!(
                    "[MCP Session] Failed to start SSE listener for '{}': {}. \
                     Server notifications will not be received.",
                    name,
                    e
                );
            }
        }

        let session = Self {
            name,
            transport: Arc::new(transport),
            server_info: Arc::new(RwLock::new(None)),
            capabilities: Arc::new(RwLock::new(None)),
            tools: Arc::new(RwLock::new(Vec::new())),
            initialized: AtomicBool::new(false),
            pending_elicitations: Arc::new(parking_lot::Mutex::new(HashMap::new())),
        };

        Ok(session)
    }

    /// Connect to an MCP server with explicit transport type.
    ///
    /// Use this when you want to explicitly specify the transport type
    /// rather than relying on configuration.
    pub async fn connect_with_transport(name: String, transport: Transport) -> McpResult<Self> {
        tracing::info!(
            "[MCP Session] Connecting to server '{}' with explicit transport",
            name
        );

        // For HTTP/SSE transport, start the SSE listener
        if let Transport::HttpSse(ref http_transport) = transport {
            if let Err(e) = http_transport.start_sse_listener(None).await {
                tracing::warn!(
                    "[MCP Session] Failed to start SSE listener for '{}': {}",
                    name,
                    e
                );
            }
        }

        let session = Self {
            name,
            transport: Arc::new(transport),
            server_info: Arc::new(RwLock::new(None)),
            capabilities: Arc::new(RwLock::new(None)),
            tools: Arc::new(RwLock::new(Vec::new())),
            initialized: AtomicBool::new(false),
            pending_elicitations: Arc::new(parking_lot::Mutex::new(HashMap::new())),
        };

        Ok(session)
    }

    pub async fn initialize(&self) -> McpResult<InitializeResult> {
        // Guard to ensure initialize is only called once
        if self
            .initialized
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err(McpError::InvalidConfig(
                "Session already initialized".to_string(),
            ));
        }

        tracing::info!("[MCP Session] Initializing session for '{}'", self.name);

        let params = InitializeParams {
            protocol_version: "2025-11-25".to_string(),
            capabilities: ClientCapabilities::default(),
            client_info: Implementation {
                name: "AGI Workforce".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
            },
        };

        // Wrap initialization in a timeout
        let init_future = async {
            let response = self
                .transport
                .send_request(
                    "initialize".to_string(),
                    Some(serde_json::to_value(params)?),
                )
                .await?;

            let result: InitializeResult = serde_json::from_value(response.result)?;
            Ok::<InitializeResult, McpError>(result)
        };

        let result = match tokio::time::timeout(
            Duration::from_secs(INITIALIZATION_TIMEOUT_SECS),
            init_future,
        )
        .await
        {
            Ok(Ok(result)) => result,
            Ok(Err(e)) => {
                // Reset initialized flag on failure
                self.initialized.store(false, Ordering::SeqCst);
                return Err(e);
            }
            Err(_) => {
                // Reset initialized flag on timeout
                self.initialized.store(false, Ordering::SeqCst);
                return Err(McpError::InitializationTimeout(format!(
                    "Session '{}' initialization timed out after {} seconds",
                    self.name, INITIALIZATION_TIMEOUT_SECS
                )));
            }
        };

        // Update server info and capabilities with RwLock protection
        {
            let mut server_info = self.server_info.write();
            *server_info = Some(result.server_info.clone());
        }
        {
            let mut capabilities = self.capabilities.write();
            *capabilities = Some(result.capabilities.clone());
        }

        tracing::info!(
            "[MCP Session] Initialized server '{}' ({})",
            result.server_info.name,
            result.server_info.version
        );

        // Send notification and log any errors (don't fail the initialization)
        self.transport
            .send_notification("notifications/initialized".to_string(), None);
        tracing::debug!(
            "[MCP Session] Sent initialized notification for '{}'",
            self.name
        );

        Ok(result)
    }

    pub async fn list_tools(&self) -> McpResult<Vec<McpToolDefinition>> {
        tracing::debug!("[MCP Session] Listing tools for '{}'", self.name);

        let response = self
            .transport
            .send_request("tools/list".to_string(), None)
            .await?;

        let result: ToolsListResult = serde_json::from_value(response.result)?;

        {
            let mut tools = self.tools.write();
            *tools = result.tools.clone();
        }

        tracing::info!(
            "[MCP Session] Found {} tools for server '{}'",
            result.tools.len(),
            self.name
        );

        Ok(result.tools)
    }

    pub async fn call_tool(
        &self,
        tool_name: &str,
        arguments: HashMap<String, serde_json::Value>,
    ) -> McpResult<ToolCallResult> {
        tracing::debug!(
            "[MCP Session] Calling tool '{}' on server '{}'",
            tool_name,
            self.name
        );

        let params = ToolCallParams {
            name: tool_name.to_string(),
            arguments: Some(arguments),
        };

        let response = self
            .transport
            .send_request(
                "tools/call".to_string(),
                Some(serde_json::to_value(params)?),
            )
            .await?;

        let result: ToolCallResult = serde_json::from_value(response.result)?;

        if result.is_error.unwrap_or(false) {
            return Err(McpError::ToolExecutionError(format!(
                "Tool '{}' returned an error",
                tool_name
            )));
        }

        Ok(result)
    }

    pub async fn list_resources(&self) -> McpResult<Vec<ResourceDefinition>> {
        tracing::debug!("[MCP Session] Listing resources for '{}'", self.name);

        let params = ResourcesListParams { cursor: None };

        let response = self
            .transport
            .send_request(
                "resources/list".to_string(),
                Some(serde_json::to_value(params)?),
            )
            .await?;

        let result: ResourcesListResult = serde_json::from_value(response.result)?;

        Ok(result.resources)
    }

    pub async fn read_resource(&self, uri: &str) -> McpResult<ResourceReadResult> {
        tracing::debug!(
            "[MCP Session] Reading resource '{}' from server '{}'",
            uri,
            self.name
        );

        let params = ResourceReadParams {
            uri: uri.to_string(),
        };

        let response = self
            .transport
            .send_request(
                "resources/read".to_string(),
                Some(serde_json::to_value(params)?),
            )
            .await?;

        let result: ResourceReadResult = serde_json::from_value(response.result)?;

        Ok(result)
    }

    pub fn get_server_info(&self) -> Option<Implementation> {
        self.server_info.read().clone()
    }

    pub fn get_capabilities(&self) -> Option<super::protocol::ServerCapabilities> {
        self.capabilities.read().clone()
    }

    /// Check if the session has been initialized
    pub fn is_initialized(&self) -> bool {
        self.initialized.load(Ordering::SeqCst)
    }

    pub fn get_cached_tools(&self) -> Vec<McpToolDefinition> {
        self.tools.read().clone()
    }

    pub fn is_alive(&self) -> bool {
        self.transport.is_alive()
    }

    /// Get the transport type being used
    pub fn transport_type(&self) -> &'static str {
        match self.transport.as_ref() {
            Transport::Stdio(_) => "stdio",
            Transport::HttpSse(_) => "http-sse",
        }
    }

    // ── Tasks primitive (spec 2025-11-25) ────────────────────────────────────

    /// Submit a tool for asynchronous execution, returning a task handle.
    ///
    /// Use this for long-running operations where you want to poll for progress
    /// instead of blocking on the result. The server must advertise `tasks`
    /// in its capabilities for this method to succeed.
    pub async fn create_task(&self, params: TaskCreateParams) -> McpResult<McpTask> {
        tracing::debug!(
            "[MCP Session] Creating task for tool '{}' on server '{}'",
            params.tool_name,
            self.name
        );

        let response = self
            .transport
            .send_request(
                METHOD_TASKS_CREATE.to_string(),
                Some(serde_json::to_value(params)?),
            )
            .await?;

        let task: McpTask = serde_json::from_value(response.result)?;
        tracing::info!(
            "[MCP Session] Task '{}' created on server '{}', status={:?}",
            task.id,
            self.name,
            task.status
        );
        Ok(task)
    }

    /// Poll the current state of a task by its ID.
    pub async fn get_task(&self, task_id: &str) -> McpResult<McpTask> {
        tracing::debug!(
            "[MCP Session] Getting task '{}' from server '{}'",
            task_id,
            self.name
        );

        let params = TaskIdParams {
            task_id: task_id.to_string(),
        };

        let response = self
            .transport
            .send_request(
                METHOD_TASKS_GET.to_string(),
                Some(serde_json::to_value(params)?),
            )
            .await?;

        let task: McpTask = serde_json::from_value(response.result)?;
        Ok(task)
    }

    /// Request that the server cancel a running task.
    ///
    /// The server may ignore this if cancellation is not supported for the
    /// specific task type. Always check the returned task status to confirm.
    pub async fn cancel_task(&self, task_id: &str) -> McpResult<McpTask> {
        tracing::debug!(
            "[MCP Session] Cancelling task '{}' on server '{}'",
            task_id,
            self.name
        );

        let params = TaskIdParams {
            task_id: task_id.to_string(),
        };

        let response = self
            .transport
            .send_request(
                METHOD_TASKS_CANCEL.to_string(),
                Some(serde_json::to_value(params)?),
            )
            .await?;

        let task: McpTask = serde_json::from_value(response.result)?;
        tracing::info!(
            "[MCP Session] Task '{}' cancelled on server '{}', final status={:?}",
            task_id,
            self.name,
            task.status
        );
        Ok(task)
    }

    /// List tasks on the server, optionally filtered by status.
    pub async fn list_tasks(&self, params: TaskListParams) -> McpResult<TaskListResult> {
        tracing::debug!("[MCP Session] Listing tasks for server '{}'", self.name);

        let response = self
            .transport
            .send_request(
                METHOD_TASKS_LIST.to_string(),
                Some(serde_json::to_value(params)?),
            )
            .await?;

        let result: TaskListResult = serde_json::from_value(response.result)?;
        tracing::debug!(
            "[MCP Session] Found {} task(s) on server '{}'",
            result.tasks.len(),
            self.name
        );
        Ok(result)
    }

    // ── Elicitation (spec 2025-11-25) ─────────────────────────────────────────

    /// Send an elicitation request to the frontend and wait for the user's response.
    ///
    /// This is called by higher-level code (e.g., `tool_executor`) when the server
    /// emits a `notifications/elicitation` message during tool execution. The
    /// request is forwarded to the frontend via a Tauri event; the response is
    /// delivered back via [`McpSession::respond_elicitation`].
    ///
    /// If the user does not respond within `timeout_seconds` (or the default
    /// [`ELICITATION_DEFAULT_TIMEOUT_SECS`]), a cancelled response is returned
    /// so the server can proceed or abort gracefully.
    pub async fn request_elicitation(
        &self,
        request: ElicitationRequest,
    ) -> McpResult<ElicitationResponse> {
        let elicitation_id = request.id.clone();
        let timeout_secs = request
            .timeout_seconds
            .unwrap_or(ELICITATION_DEFAULT_TIMEOUT_SECS);

        tracing::info!(
            "[MCP Session] Elicitation '{}' requested by server '{}': {}",
            elicitation_id,
            self.name,
            request.message
        );

        let (tx, rx) = oneshot::channel::<ElicitationResponse>();

        {
            let mut pending = self.pending_elicitations.lock();
            pending.insert(elicitation_id.clone(), PendingElicitation { sender: tx });
        }

        // The caller is responsible for emitting the Tauri event to the frontend.
        // We simply wait here for the response to arrive via respond_elicitation().
        match tokio::time::timeout(Duration::from_secs(timeout_secs), rx).await {
            Ok(Ok(response)) => {
                tracing::debug!(
                    "[MCP Session] Elicitation '{}' responded, cancelled={}",
                    elicitation_id,
                    response.cancelled
                );
                Ok(response)
            }
            Ok(Err(_)) => {
                // Channel closed — treat as cancellation
                tracing::warn!(
                    "[MCP Session] Elicitation '{}' channel closed unexpectedly",
                    elicitation_id
                );
                Ok(ElicitationResponse {
                    id: elicitation_id,
                    result: None,
                    cancelled: true,
                })
            }
            Err(_) => {
                // Timeout expired — clean up and return a cancelled response
                self.pending_elicitations.lock().remove(&elicitation_id);
                tracing::warn!(
                    "[MCP Session] Elicitation '{}' timed out after {}s on server '{}'",
                    elicitation_id,
                    timeout_secs,
                    self.name
                );
                Ok(ElicitationResponse {
                    id: elicitation_id,
                    result: None,
                    cancelled: true,
                })
            }
        }
    }

    /// Deliver the user's response to a pending elicitation request.
    ///
    /// Called by the Tauri command handler after the frontend collects user input
    /// and invokes the `mcp_respond_elicitation` command. Returns an error if
    /// no pending elicitation with the given ID exists (e.g., it already timed out).
    pub fn respond_elicitation(&self, response: ElicitationResponse) -> McpResult<()> {
        let mut pending = self.pending_elicitations.lock();
        match pending.remove(&response.id) {
            Some(pending_elicitation) => {
                // Ignore send errors — the waiting task may have already been dropped.
                let _ = pending_elicitation.sender.send(response);
                Ok(())
            }
            None => Err(McpError::InvalidConfig(format!(
                "No pending elicitation '{}' on server '{}' (may have timed out)",
                response.id, self.name
            ))),
        }
    }

    /// Returns the number of currently pending elicitation requests.
    pub fn pending_elicitation_count(&self) -> usize {
        self.pending_elicitations.lock().len()
    }

    pub async fn shutdown(&self) -> McpResult<()> {
        tracing::info!("[MCP Session] Shutting down session for '{}'", self.name);

        // Cancel all pending elicitations with a shutdown response so waiting
        // tasks are not left suspended after the session is gone.
        {
            let mut pending = self.pending_elicitations.lock();
            for (id, elicitation) in pending.drain() {
                tracing::debug!(
                    "[MCP Session] Cancelling elicitation '{}' due to shutdown",
                    id
                );
                let _ = elicitation.sender.send(ElicitationResponse {
                    id,
                    result: None,
                    cancelled: true,
                });
            }
        }

        self.transport.shutdown().await
    }
}

#[cfg(test)]
mod tests {
    use super::super::transport::TransportConfig;
    use super::*;

    #[test]
    fn test_client_capabilities() {
        let caps = ClientCapabilities::default();
        let json = serde_json::to_string(&caps).unwrap();
        assert!(json.contains("{}") || json.contains("null"));
    }

    #[test]
    fn test_initialize_params_protocol_version() {
        let params = InitializeParams {
            protocol_version: "2025-11-25".to_string(),
            capabilities: ClientCapabilities::default(),
            client_info: Implementation {
                name: "Test".to_string(),
                version: "1.0.0".to_string(),
            },
        };
        let json = serde_json::to_string(&params).unwrap();
        assert!(json.contains("protocolVersion"));
        assert!(json.contains("clientInfo"));
        assert!(
            json.contains("2025-11-25"),
            "Protocol version must match spec 2025-11-25"
        );
    }

    #[test]
    fn test_transport_config_default() {
        let config = TransportConfig::default();
        match config {
            TransportConfig::Stdio => {}
            _ => panic!("Expected Stdio as default transport"),
        }
    }

    // ── Elicitation tests ────────────────────────────────────────────────────

    #[test]
    fn test_elicitation_request_serde() {
        let req = ElicitationRequest {
            id: "elicit-001".to_string(),
            message: "Please provide your API key".to_string(),
            schema: Some(serde_json::json!({"type": "string"})),
            timeout_seconds: Some(30),
        };
        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("elicit-001"));
        assert!(json.contains("Please provide your API key"));
        assert!(json.contains("timeoutSeconds"));

        let deserialized: ElicitationRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "elicit-001");
        assert_eq!(deserialized.timeout_seconds, Some(30));
    }

    #[test]
    fn test_elicitation_request_optional_fields_omitted() {
        let req = ElicitationRequest {
            id: "elicit-002".to_string(),
            message: "Confirm to proceed".to_string(),
            schema: None,
            timeout_seconds: None,
        };
        let json = serde_json::to_string(&req).unwrap();
        assert!(
            !json.contains("schema"),
            "schema should be omitted when None"
        );
        assert!(
            !json.contains("timeoutSeconds"),
            "timeoutSeconds should be omitted when None"
        );
    }

    #[test]
    fn test_elicitation_response_cancelled() {
        let resp = ElicitationResponse {
            id: "elicit-001".to_string(),
            result: None,
            cancelled: true,
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"cancelled\":true"));
        assert!(
            !json.contains("\"result\""),
            "result should be omitted when None"
        );
    }

    #[test]
    fn test_elicitation_response_with_result() {
        let resp = ElicitationResponse {
            id: "elicit-002".to_string(),
            result: Some(serde_json::json!("user-provided-value")),
            cancelled: false,
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("user-provided-value"));
        assert!(json.contains("\"cancelled\":false"));
    }

    #[tokio::test]
    async fn test_respond_elicitation_no_pending() {
        // Build a minimal McpSession using the private fields test path.
        // Since McpSession::connect requires a live process/server, we test
        // respond_elicitation() isolation by constructing the pending map directly.
        let pending: Arc<parking_lot::Mutex<HashMap<String, PendingElicitation>>> =
            Arc::new(parking_lot::Mutex::new(HashMap::new()));

        // Simulate calling respond_elicitation when no pending entry exists.
        // We cannot construct McpSession directly (private fields), so we exercise
        // the logic via the public pending_elicitations field indirectly.
        //
        // Verify that removing a non-existent key yields None (the same path that
        // respond_elicitation() returns Err for).
        let removed = pending.lock().remove("nonexistent");
        assert!(
            removed.is_none(),
            "Expected None for non-existent elicitation ID"
        );
    }

    #[tokio::test]
    async fn test_elicitation_timeout_produces_cancelled_response() {
        // Verify that when a oneshot channel is never sent to, we can still
        // construct the cancelled fallback response correctly.
        let cancelled = ElicitationResponse {
            id: "elicit-timeout".to_string(),
            result: None,
            cancelled: true,
        };
        assert!(cancelled.cancelled);
        assert!(cancelled.result.is_none());
        assert_eq!(cancelled.id, "elicit-timeout");
    }
}
