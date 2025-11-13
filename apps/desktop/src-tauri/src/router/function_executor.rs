use crate::agi::tools::ToolRegistry;
use crate::router::{ToolCall, ToolDefinition};
use anyhow::{Context, Result};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Function Executor - Maps LLM function calls to AGI tool executions
pub struct FunctionExecutor {
    tool_registry: Arc<Mutex<ToolRegistry>>,
}

impl FunctionExecutor {
    pub fn new(tool_registry: Arc<Mutex<ToolRegistry>>) -> Self {
        Self { tool_registry }
    }

    /// Execute a single function call
    pub async fn execute(&self, tool_call: &ToolCall) -> Result<FunctionResult> {
        tracing::debug!(
            "Executing function call: {} ({})",
            tool_call.name,
            tool_call.id
        );

        // Parse arguments
        let args: Value = serde_json::from_str(&tool_call.arguments)
            .context("Failed to parse function arguments")?;

        // Get tool registry
        let registry = self.tool_registry.lock().await;

        // Find tool by name
        let tool_result = registry
            .execute_tool(&tool_call.name, args)
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
        let registry = self.tool_registry.lock().await;
        let tools = registry.list_tools().await?;

        let functions = tools
            .into_iter()
            .map(|tool| {
                // Convert tool parameters to JSON Schema
                let parameters = Self::tool_params_to_json_schema(&tool.parameters);

                ToolDefinition {
                    name: tool.id,
                    description: tool.description,
                    parameters,
                }
            })
            .collect();

        Ok(functions)
    }

    /// Convert AGI tool parameters to JSON Schema format
    fn tool_params_to_json_schema(params: &[crate::agi::tools::ToolParameter]) -> Value {
        use crate::agi::tools::ParameterType;

        let mut properties = serde_json::Map::new();
        let mut required = Vec::new();

        for param in params {
            if param.required {
                required.push(param.name.clone());
            }

            let param_type = match param.parameter_type {
                ParameterType::String => "string",
                ParameterType::Integer => "integer",
                ParameterType::Float => "number",
                ParameterType::Boolean => "boolean",
                ParameterType::Object => "object",
                ParameterType::Array => "array",
                ParameterType::FilePath => "string",
                ParameterType::URL => "string",
            };

            let mut param_schema = serde_json::Map::new();
            param_schema.insert("type".to_string(), Value::String(param_type.to_string()));
            param_schema.insert(
                "description".to_string(),
                Value::String(param.description.clone()),
            );

            if let Some(default) = &param.default {
                param_schema.insert("default".to_string(), default.clone());
            }

            properties.insert(param.name.clone(), Value::Object(param_schema));
        }

        serde_json::json!({
            "type": "object",
            "properties": properties,
            "required": required
        })
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
mod tests {
    use super::*;

    #[test]
    fn test_json_schema_conversion() {
        use crate::agi::tools::{ParameterType, ToolParameter};

        let params = vec![
            ToolParameter {
                name: "path".to_string(),
                parameter_type: ParameterType::FilePath,
                required: true,
                description: "File path".to_string(),
                default: None,
            },
            ToolParameter {
                name: "count".to_string(),
                parameter_type: ParameterType::Integer,
                required: false,
                description: "Number of items".to_string(),
                default: Some(serde_json::json!(10)),
            },
        ];

        let schema = FunctionExecutor::tool_params_to_json_schema(&params);

        assert_eq!(schema["type"], "object");
        assert_eq!(schema["required"], serde_json::json!(["path"]));
        assert_eq!(schema["properties"]["path"]["type"], "string");
        assert_eq!(schema["properties"]["count"]["type"], "integer");
        assert_eq!(schema["properties"]["count"]["default"], 10);
    }
}
