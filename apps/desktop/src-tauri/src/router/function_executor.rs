use crate::agi::tools::ToolRegistry;
use crate::router::tool_executor::ToolExecutor;
use crate::router::{ToolCall, ToolDefinition};
use anyhow::{Context, Result};
use serde_json::Value;
use std::sync::Arc;
use tauri::AppHandle;

/// Function Executor - Maps LLM function calls to AGI tool executions
pub struct FunctionExecutor {
    tool_executor: ToolExecutor,
}

impl FunctionExecutor {
    pub fn new(tool_registry: Arc<ToolRegistry>) -> Self {
        Self {
            tool_executor: ToolExecutor::new(tool_registry),
        }
    }

    pub fn with_app_handle(tool_registry: Arc<ToolRegistry>, app_handle: AppHandle) -> Self {
        Self {
            tool_executor: ToolExecutor::with_app_handle(tool_registry, app_handle),
        }
    }

    /// Execute a single function call
    pub async fn execute(&self, tool_call: &ToolCall) -> Result<FunctionResult> {
        tracing::debug!(
            "Executing function call: {} ({})",
            tool_call.name,
            tool_call.id
        );

        let tool_result = self
            .tool_executor
            .execute_tool_call(tool_call)
            .await
            .context(format!("Failed to execute tool: {}", tool_call.name))?;

        Ok(FunctionResult {
            call_id: tool_call.id.clone(),
            success: tool_result.success,
            data: tool_result.data,
            error: tool_result.error,
        })
    }

    /// Execute multiple function calls in parallel
    pub async fn execute_batch(&self, tool_calls: &[ToolCall]) -> Result<Vec<FunctionResult>> {
        let mut results = Vec::new();

        for tool_call in tool_calls {
            let result = self.execute(tool_call).await;
            match result {
                Ok(res) => results.push(res),
                Err(e) => {
                    // Return error as a result instead of failing
                    results.push(FunctionResult {
                        call_id: tool_call.id.clone(),
                        success: false,
                        data: Value::Null,
                        error: Some(e.to_string()),
                    });
                }
            }
        }

        Ok(results)
    }

    /// Convert AGI tools to LLM function definitions
    pub async fn get_available_functions(&self) -> Result<Vec<ToolDefinition>> {
        Ok(self.tool_executor.get_tool_definitions(None))
    }
}

/// Result of a function execution
#[derive(Debug, Clone)]
pub struct FunctionResult {
    pub call_id: String,
    pub success: bool,
    pub data: Value,
    pub error: Option<String>,
}

impl FunctionResult {
    /// Convert to a tool result message for the LLM
    pub fn to_message_content(&self) -> String {
        if self.success {
            serde_json::to_string_pretty(&self.data).unwrap_or_else(|_| self.data.to_string())
        } else {
            format!(
                "Error: {}",
                self.error.as_deref().unwrap_or("Unknown error")
            )
        }
    }
}

#[cfg(test)]
mod tests {}
