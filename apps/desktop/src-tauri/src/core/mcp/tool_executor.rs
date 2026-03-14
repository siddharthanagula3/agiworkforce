use crate::core::mcp::{McpClient, McpError, McpResult};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Delimiter used to separate components in tool IDs (must match registry.rs)
const TOOL_ID_DELIMITER: &str = "__";
const ENCODED_HEX_PREFIX: &str = "hex_";
const ENCODED_HEX_PREFIX_LEGACY: &str = "hex:";
const ENCODED_B64_PREFIX: &str = "b64_";
const ENCODED_B64_PREFIX_LEGACY: &str = "b64:";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolExecutionResult {
    pub tool_id: String,
    pub server_name: String,
    pub result: Value,
    pub duration_ms: u64,
    pub timestamp: u64,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolStats {
    pub tool_id: String,
    pub total_executions: u64,
    pub successful_executions: u64,
    pub failed_executions: u64,
    pub avg_duration_ms: f64,
    pub last_execution: Option<u64>,
}

pub struct McpToolExecutor {
    client: Arc<McpClient>,
    execution_history: Arc<RwLock<VecDeque<ToolExecutionResult>>>,
    tool_stats: Arc<RwLock<HashMap<String, ToolStats>>>,
    max_history_size: usize,
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
            execution_history: Arc::new(RwLock::new(VecDeque::with_capacity(1000))),
            tool_stats: Arc::new(RwLock::new(HashMap::new())),
            max_history_size: 1000,
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

        let result_value = self
            .client
            .call_tool(&server_name, &tool_name, args_value)
            .await;

        let duration = start_time.elapsed();
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let execution_result = match result_value {
            Ok(result) => ToolExecutionResult {
                tool_id: tool_id.to_string(),
                server_name: server_name.clone(),
                result,
                duration_ms: duration.as_millis() as u64,
                timestamp,
                success: true,
                error: None,
            },
            Err(e) => ToolExecutionResult {
                tool_id: tool_id.to_string(),
                server_name: server_name.clone(),
                result: Value::Null,
                duration_ms: duration.as_millis() as u64,
                timestamp,
                success: false,
                error: Some(e.to_string()),
            },
        };

        self.record_execution(&execution_result);

        if execution_result.success {
            Ok(execution_result)
        } else {
            Err(McpError::ToolExecutionError(
                execution_result.error.unwrap_or_default(),
            ))
        }
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

    pub async fn execute_tools_parallel(
        &self,
        executions: Vec<(String, HashMap<String, Value>)>,
    ) -> Vec<McpResult<ToolExecutionResult>> {
        let futures: Vec<_> = executions
            .into_iter()
            .map(|(tool_id, args)| async move { self.execute_tool(&tool_id, args).await })
            .collect();

        futures::future::join_all(futures).await
    }

    fn record_execution(&self, result: &ToolExecutionResult) {
        {
            let mut history = self.execution_history.write();
            // Atomically check and remove oldest entry if at capacity before adding
            while history.len() >= self.max_history_size {
                history.pop_front();
            }
            history.push_back(result.clone());
        }

        {
            let mut stats = self.tool_stats.write();
            let stat = stats.entry(result.tool_id.clone()).or_insert(ToolStats {
                tool_id: result.tool_id.clone(),
                total_executions: 0,
                successful_executions: 0,
                failed_executions: 0,
                avg_duration_ms: 0.0,
                last_execution: None,
            });

            stat.total_executions += 1;
            if result.success {
                stat.successful_executions += 1;
            } else {
                stat.failed_executions += 1;
            }

            stat.avg_duration_ms = ((stat.avg_duration_ms * (stat.total_executions - 1) as f64)
                + result.duration_ms as f64)
                / stat.total_executions as f64;

            stat.last_execution = Some(result.timestamp);
        }
    }

    pub fn get_tool_history(&self, tool_id: &str) -> Vec<ToolExecutionResult> {
        let history = self.execution_history.read();
        history
            .iter()
            .filter(|r| r.tool_id == tool_id)
            .cloned()
            .collect()
    }

    pub fn get_recent_history(&self, limit: usize) -> Vec<ToolExecutionResult> {
        let history = self.execution_history.read();
        let len = history.len();
        let skip = len.saturating_sub(limit);
        history.iter().skip(skip).cloned().collect()
    }

    pub fn get_tool_stats(&self, tool_id: &str) -> Option<ToolStats> {
        let stats = self.tool_stats.read();
        stats.get(tool_id).cloned()
    }

    pub fn get_all_stats(&self) -> Vec<ToolStats> {
        let stats = self.tool_stats.read();
        stats.values().cloned().collect()
    }

    pub fn get_success_rate(&self, tool_id: &str) -> Option<f64> {
        let stats = self.tool_stats.read();
        stats.get(tool_id).map(|s| {
            if s.total_executions == 0 {
                0.0
            } else {
                (s.successful_executions as f64 / s.total_executions as f64) * 100.0
            }
        })
    }

    pub fn clear_history(&self) {
        let mut history = self.execution_history.write();
        history.clear();
    }

    pub fn clear_stats(&self) {
        let mut stats = self.tool_stats.write();
        stats.clear();
    }

    pub fn get_most_used_tools(&self, limit: usize) -> Vec<ToolStats> {
        let stats = self.tool_stats.read();
        let mut tools: Vec<ToolStats> = stats.values().cloned().collect();
        tools.sort_by(|a, b| b.total_executions.cmp(&a.total_executions));
        tools.truncate(limit);
        tools
    }

    pub fn get_slowest_tools(&self, limit: usize) -> Vec<ToolStats> {
        let stats = self.tool_stats.read();
        let mut tools: Vec<ToolStats> = stats.values().cloned().collect();
        tools.sort_by(|a, b| {
            b.avg_duration_ms
                .partial_cmp(&a.avg_duration_ms)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        tools.truncate(limit);
        tools
    }

    pub fn get_tools_with_errors(&self) -> Vec<ToolStats> {
        let stats = self.tool_stats.read();
        stats
            .values()
            .filter(|s| s.failed_executions > 0)
            .cloned()
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_tool_executor() {
        let client = Arc::new(McpClient::new());
        let executor = McpToolExecutor::new(client);

        assert!(executor.get_all_stats().is_empty());
        assert!(executor.get_recent_history(10).is_empty());
    }

    #[test]
    fn test_history_limit() {
        let client = Arc::new(McpClient::new());
        let mut executor = McpToolExecutor::new(client);
        executor.max_history_size = 5;

        for i in 0..10 {
            let result = ToolExecutionResult {
                tool_id: format!("tool_{}", i),
                server_name: "test".to_string(),
                result: Value::Null,
                duration_ms: 100,
                timestamp: i,
                success: true,
                error: None,
            };
            executor.record_execution(&result);
        }

        let history = executor.get_recent_history(100);
        assert_eq!(history.len(), 5);
    }

    #[test]
    fn test_statistics() {
        let client = Arc::new(McpClient::new());
        let executor = McpToolExecutor::new(client);

        // Use the new delimiter format: mcp__server__tool
        let result1 = ToolExecutionResult {
            tool_id: "mcp__test__tool".to_string(),
            server_name: "test".to_string(),
            result: Value::Null,
            duration_ms: 100,
            timestamp: 1000,
            success: true,
            error: None,
        };
        executor.record_execution(&result1);

        let result2 = ToolExecutionResult {
            tool_id: "mcp__test__tool".to_string(),
            server_name: "test".to_string(),
            result: Value::Null,
            duration_ms: 200,
            timestamp: 2000,
            success: false,
            error: Some("Test error".to_string()),
        };
        executor.record_execution(&result2);

        let stats = executor.get_tool_stats("mcp__test__tool").unwrap();
        assert_eq!(stats.total_executions, 2);
        assert_eq!(stats.successful_executions, 1);
        assert_eq!(stats.failed_executions, 1);
        assert_eq!(stats.avg_duration_ms, 150.0);

        let success_rate = executor.get_success_rate("mcp__test__tool").unwrap();
        assert_eq!(success_rate, 50.0);
    }
}
