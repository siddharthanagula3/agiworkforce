//! MCP (Model Context Protocol) tool executor.
//!
//! This module provides an executor for MCP tools that are dynamically registered
//! from connected MCP servers. It routes tool calls through the MCP client and
//! handles streaming results.
//!
//! # Tool ID Format
//!
//! MCP tools use the format `mcp__{server}__{tool}` where:
//! - `mcp` is the prefix identifying MCP tools
//! - `server` is the name of the MCP server providing the tool
//! - `tool` is the name of the tool on that server
//!
//! The double underscore (`__`) delimiter is used to separate components.
//!
//! # Architecture
//!
//! ```text
//! McpExecutor
//!     |
//!     v
//! McpClient (from core/mcp)
//!     |
//!     v
//! MCP Server (external process)
//! ```
//!
//! # Streaming Support
//!
//! The executor supports streaming results by emitting progress events during
//! tool execution. The frontend can subscribe to these events for real-time updates.
//!
//! # Dynamic Tool Registration
//!
//! Tools are dynamically discovered from connected MCP servers. The `tool_names()`
//! method queries the MCP client for all available tools and returns them in the
//! standard `mcp__{server}__{tool}` format.

use super::{ExecutorContext, ToolExecutor};
use crate::core::agi::ExecutionContext;
use crate::core::mcp::{McpClient, McpError, McpResult, McpToolRegistry};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Delimiter used to separate components in tool IDs.
/// Format: mcp__<server_name>__<tool_name>
const TOOL_ID_DELIMITER: &str = "__";

/// MCP tool prefix for identification.
const MCP_TOOL_PREFIX: &str = "mcp";
const ENCODED_HEX_PREFIX: &str = "hex_";
const ENCODED_HEX_PREFIX_LEGACY: &str = "hex:";
const ENCODED_B64_PREFIX: &str = "b64_";
const ENCODED_B64_PREFIX_LEGACY: &str = "b64:";
const TOOL_ID_MAX_LEN: usize = 64;

/// Default timeout for MCP tool execution (30 seconds).
const DEFAULT_TOOL_TIMEOUT_SECS: u64 = 30;

/// Maximum timeout for MCP tool execution (5 minutes).
const MAX_TOOL_TIMEOUT_SECS: u64 = 300;

/// Statistics for MCP tool execution.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct McpExecutorStats {
    /// Total number of tool executions.
    pub total_executions: u64,
    /// Number of successful executions.
    pub successful_executions: u64,
    /// Number of failed executions.
    pub failed_executions: u64,
    /// Number of timed out executions.
    pub timed_out_executions: u64,
    /// Average execution time in milliseconds.
    pub avg_execution_time_ms: f64,
    /// Last execution timestamp (Unix epoch seconds).
    pub last_execution_timestamp: Option<u64>,
}

/// Result from MCP tool execution with metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolResult {
    /// The tool ID that was executed.
    pub tool_id: String,
    /// The server name that provided the tool.
    pub server_name: String,
    /// The actual tool name on the server.
    pub tool_name: String,
    /// The result value from execution.
    pub result: Value,
    /// Execution duration in milliseconds.
    pub duration_ms: u64,
    /// Whether the execution succeeded.
    pub success: bool,
    /// Error message if execution failed.
    pub error: Option<String>,
    /// Content type of the result (text, image, resource).
    pub content_type: String,
}

/// Executor for MCP (Model Context Protocol) tools.
///
/// This executor handles tools provided by connected MCP servers. Tools are
/// identified by IDs in the format `mcp__{server}__{tool}`.
///
/// # Example
///
/// ```ignore
/// let mcp_client = Arc::new(McpClient::new());
/// let executor = McpExecutor::new(mcp_client);
///
/// // Tools are dynamically discovered
/// let tools = executor.tool_names();
/// // Returns: ["mcp__filesystem__read_file", "mcp__github__list_repos", ...]
/// ```
pub struct McpExecutor {
    /// The MCP client for communicating with MCP servers.
    client: Arc<McpClient>,
    /// Registry for tool schema conversion.
    /// Schema validation is performed in `validate_tool_args()` via `McpClient::list_server_tools()`
    /// before each `execute_mcp_tool()` call, checking required fields and additionalProperties.
    #[allow(dead_code)]
    registry: Arc<McpToolRegistry>,
    /// Cached tool names for performance.
    cached_tool_names: Arc<RwLock<Vec<String>>>,
    /// Execution statistics.
    stats: Arc<RwLock<McpExecutorStats>>,
    /// Default timeout for tool execution.
    default_timeout: Duration,
}

impl McpExecutor {
    fn decode_component(value: &str) -> McpResult<String> {
        if let Some(encoded) = value
            .strip_prefix(ENCODED_HEX_PREFIX)
            .or_else(|| value.strip_prefix(ENCODED_HEX_PREFIX_LEGACY))
        {
            let bytes = hex::decode(encoded).map_err(|_| {
                McpError::ToolNotFound(format!("Invalid encoded MCP tool ID component: {}", value))
            })?;
            String::from_utf8(bytes).map_err(|_| {
                McpError::ToolNotFound(format!("Invalid UTF-8 in MCP tool ID component: {}", value))
            })
        } else if let Some(encoded) = value
            .strip_prefix(ENCODED_B64_PREFIX)
            .or_else(|| value.strip_prefix(ENCODED_B64_PREFIX_LEGACY))
        {
            let bytes = URL_SAFE_NO_PAD.decode(encoded).map_err(|_| {
                McpError::ToolNotFound(format!("Invalid encoded MCP tool ID component: {}", value))
            })?;
            String::from_utf8(bytes).map_err(|_| {
                McpError::ToolNotFound(format!("Invalid UTF-8 in MCP tool ID component: {}", value))
            })
        } else if value.len() >= 20 {
            // Compact untagged URL-safe base64 fallback for long tool IDs.
            let bytes = match URL_SAFE_NO_PAD.decode(value) {
                Ok(bytes) => bytes,
                Err(_) => return Ok(value.to_string()),
            };
            let decoded = match String::from_utf8(bytes) {
                Ok(decoded) => decoded,
                Err(_) => return Ok(value.to_string()),
            };
            // Guard against accidental decoding of plain legacy names.
            if URL_SAFE_NO_PAD.encode(decoded.as_bytes()) == value {
                Ok(decoded)
            } else {
                Ok(value.to_string())
            }
        } else {
            Ok(value.to_string())
        }
    }

    /// Creates a new MCP executor with the given client.
    ///
    /// # Arguments
    ///
    /// * `client` - The MCP client for server communication
    pub fn new(client: Arc<McpClient>) -> Self {
        let registry = Arc::new(McpToolRegistry::new(client.clone()));
        Self {
            client,
            registry,
            cached_tool_names: Arc::new(RwLock::new(Vec::new())),
            stats: Arc::new(RwLock::new(McpExecutorStats::default())),
            default_timeout: Duration::from_secs(DEFAULT_TOOL_TIMEOUT_SECS),
        }
    }

    /// Creates a new MCP executor with a custom timeout.
    ///
    /// # Arguments
    ///
    /// * `client` - The MCP client for server communication
    /// * `timeout_secs` - Timeout in seconds for tool execution
    pub fn with_timeout(client: Arc<McpClient>, timeout_secs: u64) -> Self {
        let registry = Arc::new(McpToolRegistry::new(client.clone()));
        let timeout = Duration::from_secs(timeout_secs.min(MAX_TOOL_TIMEOUT_SECS));
        Self {
            client,
            registry,
            cached_tool_names: Arc::new(RwLock::new(Vec::new())),
            stats: Arc::new(RwLock::new(McpExecutorStats::default())),
            default_timeout: timeout,
        }
    }

    /// Parses a tool ID into server name and tool name components.
    ///
    /// # Arguments
    ///
    /// * `tool_id` - The tool ID in format `mcp__server__tool`
    ///
    /// # Returns
    ///
    /// A tuple of (server_name, tool_name) or an error if the format is invalid.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let (server, tool) = McpExecutor::parse_tool_id("mcp__filesystem__read_file")?;
    /// assert_eq!(server, "filesystem");
    /// assert_eq!(tool, "read_file");
    /// ```
    pub fn parse_tool_id(tool_id: &str) -> McpResult<(String, String)> {
        let parts: Vec<&str> = tool_id.splitn(3, TOOL_ID_DELIMITER).collect();

        if parts.len() != 3 {
            return Err(McpError::ToolNotFound(format!(
                "Invalid MCP tool ID format '{}'. Expected format: mcp__<server>__<tool>",
                tool_id
            )));
        }

        if parts[0] != MCP_TOOL_PREFIX {
            return Err(McpError::ToolNotFound(format!(
                "Tool ID '{}' does not have MCP prefix. Expected format: mcp__<server>__<tool>",
                tool_id
            )));
        }

        let server_name = Self::decode_component(parts[1])?;
        let tool_name = Self::decode_component(parts[2])?;

        if server_name == "h" {
            return Err(McpError::ToolNotFound(format!(
                "Hashed MCP tool ID requires registry lookup: {}",
                tool_id
            )));
        }

        if server_name.is_empty() {
            return Err(McpError::ToolNotFound(format!(
                "Empty server name in tool ID: {}",
                tool_id
            )));
        }

        if tool_name.is_empty() {
            return Err(McpError::ToolNotFound(format!(
                "Empty tool name in tool ID: {}",
                tool_id
            )));
        }

        Ok((server_name, tool_name))
    }

    /// Resolve tool IDs, including hashed IDs used for OpenAI name-length compliance.
    fn resolve_tool_id(&self, tool_id: &str) -> McpResult<(String, String)> {
        if let Ok(parsed) = Self::parse_tool_id(tool_id) {
            return Ok(parsed);
        }

        for (server_name, tool) in self.client.list_all_tools() {
            if Self::create_tool_id(&server_name, &tool.name) == tool_id {
                return Ok((server_name, tool.name));
            }
        }

        Err(McpError::ToolNotFound(format!(
            "Invalid or unknown MCP tool ID '{}'",
            tool_id
        )))
    }

    /// Creates a tool ID from server and tool names.
    ///
    /// Sanitizes the names to prevent injection of delimiters.
    ///
    /// # Arguments
    ///
    /// * `server_name` - The MCP server name
    /// * `tool_name` - The tool name on the server
    pub fn create_tool_id(server_name: &str, tool_name: &str) -> String {
        // Reversible encoding to preserve original names (including delimiters)
        // while staying compatible with OpenAI function-name charset and length limits.
        let safe_server = format!(
            "{}{}",
            ENCODED_B64_PREFIX,
            URL_SAFE_NO_PAD.encode(server_name)
        );
        let safe_tool = format!(
            "{}{}",
            ENCODED_B64_PREFIX,
            URL_SAFE_NO_PAD.encode(tool_name)
        );

        let tagged_id = format!(
            "{}{}{}{}{}",
            MCP_TOOL_PREFIX, TOOL_ID_DELIMITER, safe_server, TOOL_ID_DELIMITER, safe_tool
        );

        if tagged_id.len() <= TOOL_ID_MAX_LEN {
            return tagged_id;
        }

        let compact_server = URL_SAFE_NO_PAD.encode(server_name);
        let compact_tool = URL_SAFE_NO_PAD.encode(tool_name);
        let compact_id = format!(
            "{}{}{}{}{}",
            MCP_TOOL_PREFIX, TOOL_ID_DELIMITER, compact_server, TOOL_ID_DELIMITER, compact_tool
        );
        if compact_id.len() <= TOOL_ID_MAX_LEN {
            return compact_id;
        }

        // Final fallback for very long names: deterministic hash IDs that
        // satisfy OpenAI tool-name constraints.
        let mut hasher = Sha256::new();
        hasher.update(server_name.as_bytes());
        hasher.update([0u8]);
        hasher.update(tool_name.as_bytes());
        let digest = hasher.finalize();
        let short_hash = hex::encode(&digest[..20]);
        format!(
            "{}{}h{}{}",
            MCP_TOOL_PREFIX, TOOL_ID_DELIMITER, TOOL_ID_DELIMITER, short_hash
        )
    }

    /// Checks if a tool ID is an MCP tool.
    ///
    /// # Arguments
    ///
    /// * `tool_id` - The tool ID to check
    pub fn is_mcp_tool(tool_id: &str) -> bool {
        tool_id.starts_with(&format!("{}{}", MCP_TOOL_PREFIX, TOOL_ID_DELIMITER))
    }

    /// Refreshes the cached tool names from connected MCP servers.
    ///
    /// This should be called when MCP servers connect or disconnect.
    pub fn refresh_tool_cache(&self) {
        let tools = self.client.list_all_tools();
        let tool_names: Vec<String> = tools
            .into_iter()
            .map(|(server_name, mcp_tool)| Self::create_tool_id(&server_name, &mcp_tool.name))
            .collect();

        let mut cache = self.cached_tool_names.write();
        *cache = tool_names;

        tracing::debug!(
            "[McpExecutor] Refreshed tool cache: {} tools available",
            cache.len()
        );
    }

    /// Gets the list of all available MCP tools.
    ///
    /// Returns tool IDs in the format `mcp__server__tool`.
    pub fn get_available_tools(&self) -> Vec<String> {
        // Refresh cache if empty
        {
            let cache = self.cached_tool_names.read();
            if !cache.is_empty() {
                return cache.clone();
            }
        }

        // Refresh and return
        self.refresh_tool_cache();
        self.cached_tool_names.read().clone()
    }

    /// Gets execution statistics.
    pub fn get_stats(&self) -> McpExecutorStats {
        self.stats.read().clone()
    }

    /// Resets execution statistics.
    pub fn reset_stats(&self) {
        let mut stats = self.stats.write();
        *stats = McpExecutorStats::default();
    }

    /// Records an execution result in statistics.
    fn record_execution(&self, success: bool, timed_out: bool, duration_ms: u64) {
        let mut stats = self.stats.write();
        stats.total_executions += 1;

        if success {
            stats.successful_executions += 1;
        } else {
            stats.failed_executions += 1;
        }

        if timed_out {
            stats.timed_out_executions += 1;
        }

        // Update rolling average
        let prev_total = stats.total_executions - 1;
        stats.avg_execution_time_ms = if prev_total == 0 {
            duration_ms as f64
        } else {
            ((stats.avg_execution_time_ms * prev_total as f64) + duration_ms as f64)
                / stats.total_executions as f64
        };

        stats.last_execution_timestamp = Some(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
        );
    }

    /// Executes an MCP tool with the given parameters.
    ///
    /// # Arguments
    ///
    /// * `tool_id` - The tool ID in format `mcp__server__tool`
    /// * `parameters` - The parameters to pass to the tool
    /// * `context` - The executor context for events and tracking
    ///
    /// # Returns
    ///
    /// The tool result as a JSON value.
    async fn execute_mcp_tool(
        &self,
        tool_id: &str,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<McpToolResult> {
        let start_time = Instant::now();

        // Parse the tool ID
        let (server_name, tool_name) = self
            .resolve_tool_id(tool_id)
            .map_err(|e| anyhow!("Invalid tool ID: {}", e))?;

        tracing::info!(
            "[McpExecutor] Executing tool '{}' on server '{}' with {} parameters",
            tool_name,
            server_name,
            parameters.len()
        );

        // Emit progress event
        context.emit_progress(
            &format!("Calling MCP tool {} on server {}", tool_name, server_name),
            Some(0.1),
        );

        // Validate arguments against the tool's JSON schema before sending.
        // This catches missing required fields and wrong types before the round-trip
        // to the MCP server, producing a clearer error message for the LLM.
        if let Err(validation_err) = self.validate_tool_args(&server_name, &tool_name, parameters) {
            tracing::warn!(
                "[McpExecutor] Argument validation failed for tool '{}' on '{}': {}",
                tool_name,
                server_name,
                validation_err
            );
            return Err(anyhow!(
                "MCP tool argument validation failed for '{}': {}",
                tool_name,
                validation_err
            ));
        }

        // Convert parameters to Value
        let args_value = serde_json::to_value(parameters)?;

        // Execute with timeout
        let timeout = self.default_timeout;
        let result = tokio::time::timeout(
            timeout,
            self.client.call_tool(&server_name, &tool_name, args_value),
        )
        .await;

        let duration_ms = start_time.elapsed().as_millis() as u64;

        match result {
            Ok(Ok(result_value)) => {
                self.record_execution(true, false, duration_ms);

                // Determine content type from result
                let content_type = Self::determine_content_type(&result_value);

                tracing::info!(
                    "[McpExecutor] Tool '{}' completed successfully in {}ms",
                    tool_id,
                    duration_ms
                );

                context.emit_progress("MCP tool execution completed", Some(1.0));

                Ok(McpToolResult {
                    tool_id: tool_id.to_string(),
                    server_name,
                    tool_name,
                    result: result_value,
                    duration_ms,
                    success: true,
                    error: None,
                    content_type,
                })
            }
            Ok(Err(e)) => {
                self.record_execution(false, false, duration_ms);

                let error_msg = Self::translate_mcp_error(&e);
                tracing::error!("[McpExecutor] Tool '{}' failed: {}", tool_id, error_msg);

                context.emit_error(&error_msg, start_time, true);

                Ok(McpToolResult {
                    tool_id: tool_id.to_string(),
                    server_name,
                    tool_name,
                    result: Value::Null,
                    duration_ms,
                    success: false,
                    error: Some(error_msg),
                    content_type: "error".to_string(),
                })
            }
            Err(_) => {
                self.record_execution(false, true, duration_ms);

                let error_msg = format!(
                    "Tool execution timed out after {} seconds",
                    timeout.as_secs()
                );
                tracing::error!(
                    "[McpExecutor] Tool '{}' timed out after {:?}",
                    tool_id,
                    timeout
                );

                context.emit_error(&error_msg, start_time, true);

                Ok(McpToolResult {
                    tool_id: tool_id.to_string(),
                    server_name,
                    tool_name,
                    result: Value::Null,
                    duration_ms,
                    success: false,
                    error: Some(error_msg),
                    content_type: "error".to_string(),
                })
            }
        }
    }

    /// Determines the content type from a tool result.
    fn determine_content_type(result: &Value) -> String {
        // Check if result has a content array (MCP protocol format)
        if let Some(content) = result.get("content").and_then(|c| c.as_array()) {
            if let Some(first) = content.first() {
                if let Some(content_type) = first.get("type").and_then(|t| t.as_str()) {
                    return content_type.to_string();
                }
            }
        }

        // Check for image data
        if result.get("data").is_some() && result.get("mimeType").is_some() {
            return "image".to_string();
        }

        // Default to text
        "text".to_string()
    }

    /// Translates MCP errors to user-friendly messages.
    ///
    /// Per CLAUDE.md: "MCP errors must be translated to user-friendly messages"
    fn translate_mcp_error(error: &McpError) -> String {
        match error {
            McpError::ConnectionError(msg) => {
                if msg.contains("ECONNREFUSED") {
                    "Could not connect to the service. Please check your internet connection."
                        .to_string()
                } else if msg.contains("timeout") {
                    "The connection timed out. The service may be busy or unavailable.".to_string()
                } else {
                    "Could not connect to the service. Please try again later.".to_string()
                }
            }
            McpError::ServerNotFound(msg) => {
                format!("The requested service is not available. {}", msg)
            }
            McpError::ToolNotFound(msg) => {
                format!("The requested action is not available. {}", msg)
            }
            McpError::ToolExecutionError(msg) => {
                // Try to extract user-friendly message
                if msg.contains("permission") || msg.contains("access denied") {
                    "Permission denied. You may need to authorize this action.".to_string()
                } else if msg.contains("not found") || msg.contains("404") {
                    "The requested item was not found.".to_string()
                } else if msg.contains("rate limit") {
                    "Too many requests. Please wait a moment and try again.".to_string()
                } else {
                    format!("The action could not be completed: {}", msg)
                }
            }
            McpError::ToolExecutionTimeout(msg) => {
                format!("The operation took too long and was cancelled. {}", msg)
            }
            McpError::InitializationTimeout(_) => {
                "The service is taking too long to start. Please try again.".to_string()
            }
            McpError::InvalidConfig(msg) => {
                format!("Configuration error: {}", msg)
            }
            McpError::JsonError(e) => {
                format!("Data format error: {}", e)
            }
            McpError::IoError(e) => {
                format!("Communication error: {}", e)
            }
            McpError::RmcpError(msg) => {
                format!("Protocol error: {}", msg)
            }
        }
    }

    /// Extracts text content from an MCP tool result.
    ///
    /// Handles various result formats and extracts meaningful text.
    pub fn extract_text_content(result: &Value) -> String {
        // Handle MCP content array format
        if let Some(content) = result.get("content").and_then(|c| c.as_array()) {
            let text_parts: Vec<String> = content
                .iter()
                .filter_map(|c| {
                    if let Some("text") = c.get("type").and_then(|t| t.as_str()) {
                        c.get("text")
                            .and_then(|t| t.as_str())
                            .map(|s| s.to_string())
                    } else {
                        None
                    }
                })
                .collect();

            if !text_parts.is_empty() {
                return text_parts.join("\n");
            }
        }

        // Handle direct text field
        if let Some(text) = result.get("text").and_then(|t| t.as_str()) {
            return text.to_string();
        }

        // Handle result field
        if let Some(res) = result.get("result") {
            if let Some(text) = res.as_str() {
                return text.to_string();
            }
            return serde_json::to_string_pretty(res).unwrap_or_default();
        }

        // Fallback to JSON string representation
        serde_json::to_string_pretty(result).unwrap_or_else(|_| result.to_string())
    }

    /// Validates tool arguments against the tool's JSON schema `input_schema`.
    ///
    /// Checks that all fields declared `required` in the schema are present in
    /// `parameters`, and that no additional properties violate an
    /// `additionalProperties: false` constraint if set.
    ///
    /// This is a lightweight structural check — it does not perform full JSON
    /// Schema draft validation (type checking, pattern matching, etc.).  It is
    /// intentionally lenient so that valid-but-unusual argument shapes are not
    /// rejected; the MCP server performs authoritative validation.
    fn validate_tool_args(
        &self,
        server_name: &str,
        tool_name: &str,
        parameters: &HashMap<String, Value>,
    ) -> Result<(), String> {
        // Retrieve the cached tool schema.  If the tool is not found (e.g. the
        // server has disconnected), skip validation rather than blocking the call.
        let schema = match self.client.list_server_tools(server_name) {
            Ok(tools) => match tools.into_iter().find(|t| t.name == tool_name) {
                Some(tool) => tool.input_schema,
                None => {
                    tracing::debug!(
                            "[McpExecutor] Tool '{}' not found in server '{}' cache — skipping schema validation",
                            tool_name, server_name
                        );
                    return Ok(());
                }
            },
            Err(_) => return Ok(()), // server not connected — skip
        };

        // Check required fields.
        if let Some(required) = schema.get("required").and_then(|r| r.as_array()) {
            let missing: Vec<&str> = required
                .iter()
                .filter_map(|r| r.as_str())
                .filter(|field| !parameters.contains_key(*field))
                .collect();

            if !missing.is_empty() {
                return Err(format!(
                    "Missing required fields: {}. The tool '{}' requires these parameters.",
                    missing.join(", "),
                    tool_name
                ));
            }
        }

        // Check additionalProperties: false constraint.
        if schema.get("additionalProperties").and_then(|v| v.as_bool()) == Some(false) {
            if let Some(props) = schema.get("properties").and_then(|p| p.as_object()) {
                let extra: Vec<&str> = parameters
                    .keys()
                    .map(String::as_str)
                    .filter(|k| !props.contains_key(*k))
                    .collect();

                if !extra.is_empty() {
                    return Err(format!(
                        "Unexpected fields not allowed by schema: {}. Tool '{}' only accepts: {}.",
                        extra.join(", "),
                        tool_name,
                        props.keys().cloned().collect::<Vec<_>>().join(", ")
                    ));
                }
            }
        }

        Ok(())
    }
}

impl Default for McpExecutor {
    fn default() -> Self {
        Self::new(Arc::new(McpClient::new()))
    }
}

#[async_trait]
impl ToolExecutor for McpExecutor {
    /// Returns the list of available MCP tool names.
    ///
    /// This method queries connected MCP servers for their tools and returns
    /// them in the standard `mcp__server__tool` format.
    ///
    /// Note: Returns an empty slice for static tool names since MCP tools are
    /// dynamic. Use `get_available_tools()` to get the current list of available
    /// MCP tools.
    fn tool_names(&self) -> Vec<&'static str> {
        // MCP tools are dynamic, so we cannot return static strings.
        // The registry handles MCP tool routing via the `mcp__` prefix.
        // This returns an empty list because MCP tools should be looked up
        // dynamically via the MCP client, not registered statically.
        vec![]
    }

    fn description(&self) -> &'static str {
        "Executes tools from connected MCP (Model Context Protocol) servers. \
        Handles dynamic tool discovery and routing to external services like \
        filesystem, GitHub, Slack, and other MCP-compatible integrations."
    }

    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
        _execution_context: &ExecutionContext,
    ) -> Result<Value> {
        // Validate this is an MCP tool
        if !Self::is_mcp_tool(tool_name) {
            return Err(anyhow!(
                "Tool '{}' is not an MCP tool. MCP tools must have format: mcp__<server>__<tool>",
                tool_name
            ));
        }

        // Execute the MCP tool
        let result = self
            .execute_mcp_tool(tool_name, parameters, context)
            .await?;

        if result.success {
            Ok(json!({
                "success": true,
                "tool_id": result.tool_id,
                "server": result.server_name,
                "tool": result.tool_name,
                "result": result.result,
                "duration_ms": result.duration_ms,
                "content_type": result.content_type
            }))
        } else {
            // Return error as a result (not Err) for proper error handling upstream
            Err(anyhow!(
                "MCP tool '{}' failed: {}",
                tool_name,
                result.error.unwrap_or_else(|| "Unknown error".to_string())
            ))
        }
    }
}

/// Extension trait for ExecutorRegistry to support MCP tools.
pub trait McpExecutorExt {
    /// Registers the MCP executor with dynamic tool support.
    fn register_mcp_executor(&mut self, executor: Arc<McpExecutor>);

    /// Checks if a tool should be routed to the MCP executor.
    fn is_mcp_routed(&self, tool_name: &str) -> bool;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_tool_id_valid() {
        let result = McpExecutor::parse_tool_id("mcp__filesystem__read_file");
        assert!(result.is_ok());
        let (server, tool) = result.unwrap();
        assert_eq!(server, "filesystem");
        assert_eq!(tool, "read_file");
    }

    #[test]
    fn test_parse_tool_id_invalid_prefix() {
        let result = McpExecutor::parse_tool_id("invalid__filesystem__read_file");
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_tool_id_wrong_parts() {
        let result = McpExecutor::parse_tool_id("mcp__filesystem");
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_tool_id_empty_server() {
        let result = McpExecutor::parse_tool_id("mcp____read_file");
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_tool_id_empty_tool() {
        let result = McpExecutor::parse_tool_id("mcp__filesystem__");
        assert!(result.is_err());
    }

    #[test]
    fn test_create_tool_id() {
        let tool_id = McpExecutor::create_tool_id("filesystem", "read_file");
        assert_eq!(tool_id, "mcp__b64_ZmlsZXN5c3RlbQ__b64_cmVhZF9maWxl");
    }

    #[test]
    fn test_create_tool_id_sanitizes_delimiter() {
        let tool_id = McpExecutor::create_tool_id("file__system", "read__file");
        assert_eq!(tool_id, "mcp__b64_ZmlsZV9fc3lzdGVt__b64_cmVhZF9fZmlsZQ");
    }

    #[test]
    fn test_parse_tool_id_accepts_legacy_hex_prefix() {
        let result =
            McpExecutor::parse_tool_id("mcp__hex:66696c6573797374656d__hex:726561645f66696c65");
        assert!(result.is_ok());
        let (server, tool) = result.unwrap();
        assert_eq!(server, "filesystem");
        assert_eq!(tool, "read_file");
    }

    #[test]
    fn test_create_tool_id_falls_back_to_compact_base64_for_long_names() {
        let tool_id = McpExecutor::create_tool_id("claude_in_chrome", "read_network_requests");
        assert_eq!(
            tool_id,
            "mcp__Y2xhdWRlX2luX2Nocm9tZQ__cmVhZF9uZXR3b3JrX3JlcXVlc3Rz"
        );
        assert!(tool_id.len() <= 64);
        let parsed = McpExecutor::parse_tool_id(&tool_id).expect("compact base64 tool ID parses");
        assert_eq!(parsed.0, "claude_in_chrome");
        assert_eq!(parsed.1, "read_network_requests");
    }

    #[test]
    fn test_create_tool_id_hashes_when_still_too_long() {
        let long_server = "this_is_a_very_long_server_name_used_for_testing_mcp_encoding_limits";
        let long_tool =
            "this_is_an_equally_long_tool_name_that_would_exceed_openai_function_name_limits";
        let tool_id = McpExecutor::create_tool_id(long_server, long_tool);
        assert!(tool_id.starts_with("mcp__h__"));
        assert!(tool_id.len() <= 64);
        assert!(tool_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'));
        assert!(McpExecutor::parse_tool_id(&tool_id).is_err());
    }

    #[test]
    fn test_is_mcp_tool() {
        assert!(McpExecutor::is_mcp_tool("mcp__filesystem__read_file"));
        assert!(McpExecutor::is_mcp_tool("mcp__github__list_repos"));
        assert!(!McpExecutor::is_mcp_tool("file_read"));
        assert!(!McpExecutor::is_mcp_tool("mcp_filesystem_read_file"));
    }

    #[test]
    fn test_extract_text_content_from_content_array() {
        let result = json!({
            "content": [
                {"type": "text", "text": "Hello"},
                {"type": "text", "text": "World"}
            ]
        });
        let text = McpExecutor::extract_text_content(&result);
        assert_eq!(text, "Hello\nWorld");
    }

    #[test]
    fn test_extract_text_content_direct() {
        let result = json!({
            "text": "Direct text content"
        });
        let text = McpExecutor::extract_text_content(&result);
        assert_eq!(text, "Direct text content");
    }

    #[test]
    fn test_extract_text_content_from_result_field() {
        let result = json!({
            "result": "Result field content"
        });
        let text = McpExecutor::extract_text_content(&result);
        assert_eq!(text, "Result field content");
    }

    #[test]
    fn test_determine_content_type_text() {
        let result = json!({
            "content": [{"type": "text", "text": "Hello"}]
        });
        assert_eq!(McpExecutor::determine_content_type(&result), "text");
    }

    #[test]
    fn test_determine_content_type_image() {
        let result = json!({
            "data": "base64data",
            "mimeType": "image/png"
        });
        assert_eq!(McpExecutor::determine_content_type(&result), "image");
    }

    #[test]
    fn test_default_executor() {
        let executor = McpExecutor::default();
        assert_eq!(
            executor.default_timeout,
            Duration::from_secs(DEFAULT_TOOL_TIMEOUT_SECS)
        );
    }

    #[test]
    fn test_with_timeout() {
        let client = Arc::new(McpClient::new());
        let executor = McpExecutor::with_timeout(client, 60);
        assert_eq!(executor.default_timeout, Duration::from_secs(60));
    }

    #[test]
    fn test_with_timeout_capped() {
        let client = Arc::new(McpClient::new());
        let executor = McpExecutor::with_timeout(client, 1000);
        assert_eq!(
            executor.default_timeout,
            Duration::from_secs(MAX_TOOL_TIMEOUT_SECS)
        );
    }

    #[test]
    fn test_tool_names_empty() {
        let executor = McpExecutor::default();
        // MCP tools are dynamic, so tool_names returns empty
        assert!(executor.tool_names().is_empty());
    }

    #[test]
    fn test_description() {
        let executor = McpExecutor::default();
        let desc = executor.description();
        assert!(!desc.is_empty());
        assert!(desc.contains("MCP"));
    }

    #[test]
    fn test_stats_default() {
        let executor = McpExecutor::default();
        let stats = executor.get_stats();
        assert_eq!(stats.total_executions, 0);
        assert_eq!(stats.successful_executions, 0);
        assert_eq!(stats.failed_executions, 0);
    }

    #[test]
    fn test_translate_mcp_error_connection() {
        let error = McpError::ConnectionError("ECONNREFUSED".to_string());
        let msg = McpExecutor::translate_mcp_error(&error);
        assert!(msg.contains("internet connection"));
    }

    #[test]
    fn test_translate_mcp_error_timeout() {
        let error = McpError::ConnectionError("timeout".to_string());
        let msg = McpExecutor::translate_mcp_error(&error);
        assert!(msg.contains("timed out"));
    }

    #[test]
    fn test_translate_mcp_error_permission() {
        let error = McpError::ToolExecutionError("permission denied".to_string());
        let msg = McpExecutor::translate_mcp_error(&error);
        assert!(msg.contains("Permission denied"));
    }

    #[test]
    fn test_translate_mcp_error_rate_limit() {
        let error = McpError::ToolExecutionError("rate limit exceeded".to_string());
        let msg = McpExecutor::translate_mcp_error(&error);
        assert!(msg.contains("Too many requests"));
    }
}
