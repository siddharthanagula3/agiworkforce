use crate::agi::tools::{Tool, ToolRegistry, ToolResult};
use crate::router::{ToolCall, ToolDefinition};
use anyhow::{anyhow, Result};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;

/// Bridges between LLM function calling and AGI tool execution
pub struct ToolExecutor {
    registry: Arc<ToolRegistry>,
}

impl ToolExecutor {
    pub fn new(registry: Arc<ToolRegistry>) -> Self {
        Self { registry }
    }

    /// Convert AGI tools to LLM tool definitions
    pub fn get_tool_definitions(&self, tool_ids: Option<Vec<String>>) -> Vec<ToolDefinition> {
        let tools = if let Some(ids) = tool_ids {
            ids.iter()
                .filter_map(|id| self.registry.get_tool(id))
                .collect()
        } else {
            self.registry.list_tools()
        };

        tools
            .iter()
            .map(|tool| self.convert_tool_to_definition(tool))
            .collect()
    }

    /// Convert a single AGI tool to LLM tool definition
    fn convert_tool_to_definition(&self, tool: &Tool) -> ToolDefinition {
        // Build JSON schema from tool parameters
        let mut properties = json!({});
        let mut required = Vec::new();

        for param in &tool.parameters {
            properties[&param.name] = json!({
                "type": self.get_json_schema_type(&param.parameter_type),
                "description": param.description,
            });

            if param.required {
                required.push(param.name.clone());
            }
        }

        let parameters = json!({
            "type": "object",
            "properties": properties,
            "required": required,
        });

        ToolDefinition {
            name: tool.id.clone(),
            description: tool.description.clone(),
            parameters,
        }
    }

    /// Map AGI parameter types to JSON schema types
    fn get_json_schema_type(&self, param_type: &crate::agi::tools::ParameterType) -> &str {
        match param_type {
            crate::agi::tools::ParameterType::String => "string",
            crate::agi::tools::ParameterType::Integer => "integer",
            crate::agi::tools::ParameterType::Float => "number",
            crate::agi::tools::ParameterType::Boolean => "boolean",
            crate::agi::tools::ParameterType::Object => "object",
            crate::agi::tools::ParameterType::Array => "array",
            crate::agi::tools::ParameterType::FilePath => "string",
            crate::agi::tools::ParameterType::URL => "string",
        }
    }

    /// Execute a tool call from the LLM
    pub async fn execute_tool_call(&self, tool_call: &ToolCall) -> Result<ToolResult> {
        // Get the tool from registry
        let tool = self
            .registry
            .get_tool(&tool_call.name)
            .ok_or_else(|| anyhow!("Tool not found: {}", tool_call.name))?;

        // Parse arguments
        let args: HashMap<String, serde_json::Value> =
            serde_json::from_str(&tool_call.arguments)
                .map_err(|e| anyhow!("Invalid tool arguments: {}", e))?;

        // Validate required parameters
        for param in &tool.parameters {
            if param.required && !args.contains_key(&param.name) {
                return Ok(ToolResult {
                    success: false,
                    data: json!(null),
                    error: Some(format!("Missing required parameter: {}", param.name)),
                    metadata: HashMap::new(),
                });
            }
        }

        // Execute the tool based on its ID
        self.execute_tool_impl(&tool, args).await
    }

    /// Implementation of tool execution
    /// This delegates to the appropriate MCP module based on tool type
    async fn execute_tool_impl(
        &self,
        tool: &Tool,
        args: HashMap<String, serde_json::Value>,
    ) -> Result<ToolResult> {
        // For now, return a stub result
        // In production, this would dispatch to actual MCP implementations
        match tool.id.as_str() {
            "file_read" => {
                let path = args
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing path parameter"))?;

                // TODO: Call actual filesystem MCP
                Ok(ToolResult {
                    success: false,
                    data: json!(null),
                    error: Some("File operations not yet implemented".to_string()),
                    metadata: HashMap::from([("path".to_string(), json!(path))]),
                })
            }
            "file_write" => {
                let path = args
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing path parameter"))?;
                let content = args
                    .get("content")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing content parameter"))?;

                // TODO: Call actual filesystem MCP
                Ok(ToolResult {
                    success: false,
                    data: json!(null),
                    error: Some("File operations not yet implemented".to_string()),
                    metadata: HashMap::from([
                        ("path".to_string(), json!(path)),
                        ("content_length".to_string(), json!(content.len())),
                    ]),
                })
            }
            "ui_click" | "ui_type" | "ui_screenshot" => {
                // TODO: Call automation MCP
                Ok(ToolResult {
                    success: false,
                    data: json!(null),
                    error: Some("UI automation not yet implemented".to_string()),
                    metadata: HashMap::from([("tool".to_string(), json!(tool.id))]),
                })
            }
            "browser_navigate" => {
                // TODO: Call browser MCP
                Ok(ToolResult {
                    success: false,
                    data: json!(null),
                    error: Some("Browser automation not yet implemented".to_string()),
                    metadata: HashMap::new(),
                })
            }
            "code_execute" => {
                // TODO: Call code execution MCP
                Ok(ToolResult {
                    success: false,
                    data: json!(null),
                    error: Some("Code execution not yet implemented".to_string()),
                    metadata: HashMap::new(),
                })
            }
            "db_query" => {
                // TODO: Call database MCP
                Ok(ToolResult {
                    success: false,
                    data: json!(null),
                    error: Some("Database operations not yet implemented".to_string()),
                    metadata: HashMap::new(),
                })
            }
            "api_call" => {
                // TODO: Call API MCP
                Ok(ToolResult {
                    success: false,
                    data: json!(null),
                    error: Some("API calls not yet implemented".to_string()),
                    metadata: HashMap::new(),
                })
            }
            "image_ocr" => {
                // TODO: Call image processing MCP
                Ok(ToolResult {
                    success: false,
                    data: json!(null),
                    error: Some("Image processing not yet implemented".to_string()),
                    metadata: HashMap::new(),
                })
            }
            "code_analyze" => {
                // TODO: Call code analysis MCP
                Ok(ToolResult {
                    success: false,
                    data: json!(null),
                    error: Some("Code analysis not yet implemented".to_string()),
                    metadata: HashMap::new(),
                })
            }
            "llm_reason" => {
                // TODO: Call LLM router for sub-reasoning
                Ok(ToolResult {
                    success: false,
                    data: json!(null),
                    error: Some("LLM reasoning not yet implemented".to_string()),
                    metadata: HashMap::new(),
                })
            }
            "email_send" | "email_fetch" => {
                // TODO: Call communications MCP
                Ok(ToolResult {
                    success: false,
                    data: json!(null),
                    error: Some("Email operations not yet implemented".to_string()),
                    metadata: HashMap::new(),
                })
            }
            "calendar_create_event" | "calendar_list_events" => {
                // TODO: Call calendar MCP
                Ok(ToolResult {
                    success: false,
                    data: json!(null),
                    error: Some("Calendar operations not yet implemented".to_string()),
                    metadata: HashMap::new(),
                })
            }
            "cloud_upload" | "cloud_download" => {
                // TODO: Call cloud storage MCP
                Ok(ToolResult {
                    success: false,
                    data: json!(null),
                    error: Some("Cloud storage not yet implemented".to_string()),
                    metadata: HashMap::new(),
                })
            }
            "productivity_create_task" => {
                // TODO: Call productivity MCP
                Ok(ToolResult {
                    success: false,
                    data: json!(null),
                    error: Some("Productivity tools not yet implemented".to_string()),
                    metadata: HashMap::new(),
                })
            }
            "document_read" | "document_search" => {
                // TODO: Call document MCP
                Ok(ToolResult {
                    success: false,
                    data: json!(null),
                    error: Some("Document operations not yet implemented".to_string()),
                    metadata: HashMap::new(),
                })
            }
            _ => Err(anyhow!("Unknown tool: {}", tool.id)),
        }
    }

    /// Format tool result for LLM consumption
    pub fn format_tool_result(&self, _tool_call: &ToolCall, result: &ToolResult) -> String {
        if result.success {
            serde_json::to_string_pretty(&result.data).unwrap_or_else(|_| "{}".to_string())
        } else {
            format!(
                "Error: {}",
                result.error.as_ref().unwrap_or(&"Unknown error".to_string())
            )
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_tool_definition_conversion() {
        // Test will be implemented when MCPs are connected
    }

    #[tokio::test]
    async fn test_tool_execution() {
        // Test will be implemented when MCPs are connected
    }
}
