use crate::mcp::{McpClient, McpError, McpResult};
use parking_lot::RwLock;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Tool execution result with timing and metadata
#[derive(Debug, Clone)]
pub struct ToolExecutionResult {
    pub tool_id: String,
    pub server_name: String,
    pub result: Value,
    pub duration_ms: u64,
    pub timestamp: u64,
    pub success: bool,
    pub error: Option<String>,
}

/// Tool execution statistics
#[derive(Debug, Clone)]
pub struct ToolStats {
    pub tool_id: String,
    pub total_executions: u64,
    pub successful_executions: u64,
    pub failed_executions: u64,
    pub avg_duration_ms: f64,
    pub last_execution: Option<u64>,
}

/// Tool executor with statistics and error handling
pub struct McpToolExecutor {
    client: Arc<McpClient>,
    execution_history: Arc<RwLock<Vec<ToolExecutionResult>>>,
    tool_stats: Arc<RwLock<HashMap<String, ToolStats>>>,
    max_history_size: usize,
}

impl McpToolExecutor {
    /// Create a new tool executor
    pub fn new(client: Arc<McpClient>) -> Self {
        Self {
            client,
            execution_history: Arc::new(RwLock::new(Vec::new())),
            tool_stats: Arc::new(RwLock::new(HashMap::new())),
            max_history_size: 1000, // Keep last 1000 executions
        }
    }

    /// Execute a tool and track statistics
    pub async fn execute_tool(
        &self,
        tool_id: &str,
        arguments: HashMap<String, Value>,
    ) -> McpResult<ToolExecutionResult> {
        let start_time = Instant::now();

        // Parse tool_id: "mcp_<server>_<tool>"
        let parts: Vec<&str> = tool_id.split('_').collect();
        if parts.len() < 3 || parts[0] != "mcp" {
            return Err(McpError::ToolNotFound(format!(
                "Invalid MCP tool ID: {}",
                tool_id
            )));
        }

        let server_name = parts[1];
        let tool_name = parts[2..].join("_");

        // Convert arguments to JSON Value
        let args_value = serde_json::to_value(arguments)?;

        // Execute the tool
        let result_value = self
            .client
            .call_tool(server_name, &tool_name, args_value)
            .await;

        let duration = start_time.elapsed();
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let execution_result = match result_value {
            Ok(result) => ToolExecutionResult {
                tool_id: tool_id.to_string(),
                server_name: server_name.to_string(),
                result,
                duration_ms: duration.as_millis() as u64,
                timestamp,
                success: true,
                error: None,
            },
            Err(e) => ToolExecutionResult {
                tool_id: tool_id.to_string(),
                server_name: server_name.to_string(),
                result: Value::Null,
                duration_ms: duration.as_millis() as u64,
                timestamp,
                success: false,
                error: Some(e.to_string()),
            },
        };

        // Record execution
        self.record_execution(&execution_result);

        if execution_result.success {
            Ok(execution_result)
        } else {
            Err(McpError::ToolNotFound(
                execution_result.error.unwrap_or_default(),
            ))
        }
    }

    /// Execute a tool with timeout
    pub async fn execute_tool_with_timeout(
        &self,
        tool_id: &str,
        arguments: HashMap<String, Value>,
        timeout: Duration,
    ) -> McpResult<ToolExecutionResult> {
        match tokio::time::timeout(timeout, self.execute_tool(tool_id, arguments)).await {
            Ok(result) => result,
            Err(_) => Err(McpError::ToolNotFound(format!(
                "Tool execution timed out after {:?}",
                timeout
            ))),
        }
    }

    /// Execute multiple tools in parallel
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

    /// Record execution in history and update statistics
    fn record_execution(&self, result: &ToolExecutionResult) {
        // Add to history
        {
            let mut history = self.execution_history.write();
            history.push(result.clone());

            // Trim history if it exceeds max size
            if history.len() > self.max_history_size {
                history.remove(0);
            }
        }

        // Update statistics
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

            // Update average duration
            stat.avg_duration_ms = ((stat.avg_duration_ms * (stat.total_executions - 1) as f64)
                + result.duration_ms as f64)
                / stat.total_executions as f64;

            stat.last_execution = Some(result.timestamp);
        }
    }

    /// Get execution history for a specific tool
    pub fn get_tool_history(&self, tool_id: &str) -> Vec<ToolExecutionResult> {
        let history = self.execution_history.read();
        history
            .iter()
            .filter(|r| r.tool_id == tool_id)
            .cloned()
            .collect()
    }

    /// Get recent execution history (last N executions)
    pub fn get_recent_history(&self, limit: usize) -> Vec<ToolExecutionResult> {
        let history = self.execution_history.read();
        let start = if history.len() > limit {
            history.len() - limit
        } else {
            0
        };
        history[start..].to_vec()
    }

    /// Get statistics for a specific tool
    pub fn get_tool_stats(&self, tool_id: &str) -> Option<ToolStats> {
        let stats = self.tool_stats.read();
        stats.get(tool_id).cloned()
    }

    /// Get statistics for all tools
    pub fn get_all_stats(&self) -> Vec<ToolStats> {
        let stats = self.tool_stats.read();
        stats.values().cloned().collect()
    }

    /// Get success rate for a tool
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

    /// Clear execution history
    pub fn clear_history(&self) {
        let mut history = self.execution_history.write();
        history.clear();
    }

    /// Clear statistics
    pub fn clear_stats(&self) {
        let mut stats = self.tool_stats.write();
        stats.clear();
    }

    /// Get most used tools
    pub fn get_most_used_tools(&self, limit: usize) -> Vec<ToolStats> {
        let stats = self.tool_stats.read();
        let mut tools: Vec<ToolStats> = stats.values().cloned().collect();
        tools.sort_by(|a, b| b.total_executions.cmp(&a.total_executions));
        tools.truncate(limit);
        tools
    }

    /// Get slowest tools
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

    /// Get tools with errors
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

        // Stats should be empty initially
        assert!(executor.get_all_stats().is_empty());
        assert!(executor.get_recent_history(10).is_empty());
    }

    #[test]
    fn test_history_limit() {
        let client = Arc::new(McpClient::new());
        let mut executor = McpToolExecutor::new(client);
        executor.max_history_size = 5;

        // Simulate recording executions
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

        // History should be limited to 5
        let history = executor.get_recent_history(100);
        assert_eq!(history.len(), 5);
    }

    #[test]
    fn test_statistics() {
        let client = Arc::new(McpClient::new());
        let executor = McpToolExecutor::new(client);

        // Record successful execution
        let result1 = ToolExecutionResult {
            tool_id: "mcp_test_tool".to_string(),
            server_name: "test".to_string(),
            result: Value::Null,
            duration_ms: 100,
            timestamp: 1000,
            success: true,
            error: None,
        };
        executor.record_execution(&result1);

        // Record failed execution
        let result2 = ToolExecutionResult {
            tool_id: "mcp_test_tool".to_string(),
            server_name: "test".to_string(),
            result: Value::Null,
            duration_ms: 200,
            timestamp: 2000,
            success: false,
            error: Some("Test error".to_string()),
        };
        executor.record_execution(&result2);

        // Check statistics
        let stats = executor.get_tool_stats("mcp_test_tool").unwrap();
        assert_eq!(stats.total_executions, 2);
        assert_eq!(stats.successful_executions, 1);
        assert_eq!(stats.failed_executions, 1);
        assert_eq!(stats.avg_duration_ms, 150.0);

        // Check success rate
        let success_rate = executor.get_success_rate("mcp_test_tool").unwrap();
        assert_eq!(success_rate, 50.0);
    }
}
