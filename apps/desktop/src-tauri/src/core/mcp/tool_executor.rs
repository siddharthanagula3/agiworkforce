use crate::core::mcp::{McpClient, McpError, McpResult};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Delimiter used to separate components in tool IDs (must match registry.rs)
const TOOL_ID_DELIMITER: &str = "__";
const ENCODED_HEX_PREFIX: &str = "hex_";
const ENCODED_HEX_PREFIX_LEGACY: &str = "hex:";
const ENCODED_B64_PREFIX: &str = "b64_";
const ENCODED_B64_PREFIX_LEGACY: &str = "b64:";

/// One successful tool call. A failed call is an `Err`, never a result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolExecutionResult {
    pub tool_id: String,
    pub server_name: String,
    pub result: Value,
    pub duration_ms: u64,
}

pub struct McpToolExecutor {
    client: Arc<McpClient>,
    default_timeout: Duration,
}

impl McpToolExecutor {
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

    pub fn new(client: Arc<McpClient>) -> Self {
        Self {
            client,
            default_timeout: Duration::from_secs(60),
        }
    }

    /// Set the default timeout for tool executions that don't specify one.
    pub fn with_default_timeout(mut self, timeout: Duration) -> Self {
        self.default_timeout = timeout;
        self
    }

    /// Execute a tool with the default timeout safety cap.
    pub async fn execute_tool(
        &self,
        tool_id: &str,
        arguments: HashMap<String, Value>,
    ) -> McpResult<ToolExecutionResult> {
        self.execute_tool_with_timeout(tool_id, arguments, self.default_timeout)
            .await
    }

    /// Inner implementation that performs the actual tool execution without any timeout.
    async fn execute_tool_inner(
        &self,
        tool_id: &str,
        arguments: HashMap<String, Value>,
    ) -> McpResult<ToolExecutionResult> {
        let start_time = Instant::now();

        // Parse tool ID using double underscore delimiter (matches registry.rs)
        let parts: Vec<&str> = tool_id.splitn(3, TOOL_ID_DELIMITER).collect();
        if parts.len() != 3 || parts[0] != "mcp" {
            return Err(McpError::ToolNotFound(format!(
                "Invalid MCP tool ID format '{}'. Expected format: mcp__<server>__<tool>",
                tool_id
            )));
        }

        let server_name = Self::decode_component(parts[1])?;
        let tool_name = Self::decode_component(parts[2])?;

        if server_name.is_empty() || tool_name.is_empty() {
            return Err(McpError::ToolNotFound(format!(
                "Empty server or tool name in tool ID: {}",
                tool_id
            )));
        }

        let args_value = serde_json::to_value(arguments)?;

        let result = self
            .client
            .call_tool(&server_name, &tool_name, args_value)
            .await
            .map_err(|e| McpError::ToolExecutionError(e.to_string()))?;

        Ok(ToolExecutionResult {
            tool_id: tool_id.to_string(),
            server_name,
            result,
            duration_ms: start_time.elapsed().as_millis() as u64,
        })
    }

    /// Execute a tool with a specific timeout.
    pub async fn execute_tool_with_timeout(
        &self,
        tool_id: &str,
        arguments: HashMap<String, Value>,
        timeout: Duration,
    ) -> McpResult<ToolExecutionResult> {
        match tokio::time::timeout(timeout, self.execute_tool_inner(tool_id, arguments)).await {
            Ok(result) => result,
            Err(_) => Err(McpError::ToolExecutionTimeout(format!(
                "Tool '{}' execution timed out after {:?}",
                tool_id, timeout
            ))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn executor() -> McpToolExecutor {
        McpToolExecutor::new(Arc::new(McpClient::new()))
    }

    #[tokio::test]
    async fn a_tool_id_that_is_not_an_mcp_id_is_refused_before_any_server_is_called() {
        for tool_id in ["file_read", "mcp__only-two-parts", "other__server__tool"] {
            let error = executor()
                .execute_tool(tool_id, HashMap::new())
                .await
                .expect_err("a malformed tool id must not run");
            assert!(matches!(error, McpError::ToolNotFound(_)), "{tool_id}");
        }
    }

    #[tokio::test]
    async fn a_call_to_a_server_that_is_not_connected_is_an_error_not_a_result() {
        let outcome = executor()
            .execute_tool("mcp__missing__tool", HashMap::new())
            .await;

        assert!(matches!(outcome, Err(McpError::ToolExecutionError(_))));
    }

    #[test]
    fn encoded_tool_id_components_decode_and_plain_ones_pass_through() {
        assert_eq!(
            McpToolExecutor::decode_component("hex_676974").unwrap(),
            "git"
        );
        assert_eq!(
            McpToolExecutor::decode_component("b64_Z2l0aHVi").unwrap(),
            "github"
        );
        assert_eq!(
            McpToolExecutor::decode_component("filesystem").unwrap(),
            "filesystem"
        );
    }
}
