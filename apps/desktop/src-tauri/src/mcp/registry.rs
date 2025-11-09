use crate::agi::tools::{ParameterType, Tool, ToolCapability, ToolParameter};
use crate::mcp::client::McpTool;
use crate::mcp::{McpClient, McpResult};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;

/// Registry that bridges MCP tools with the AGI tool system
pub struct McpToolRegistry {
    mcp_client: Arc<McpClient>,
}

impl McpToolRegistry {
    /// Create a new MCP tool registry
    pub fn new(mcp_client: Arc<McpClient>) -> Self {
        Self { mcp_client }
    }

    /// Convert MCP tools to AGI tool schemas
    pub fn get_all_tool_schemas(&self) -> Vec<Tool> {
        let tools = self.mcp_client.list_all_tools();
        tools
            .into_iter()
            .map(|(server_name, mcp_tool)| self.mcp_tool_to_schema(&server_name, &mcp_tool))
            .collect()
    }

    /// Convert a single MCP tool to AGI tool schema
    fn mcp_tool_to_schema(&self, server_name: &str, mcp_tool: &McpTool) -> Tool {
        // Prefix tool name with server name to avoid conflicts
        let tool_id = format!("mcp_{}_{}", server_name, mcp_tool.name);

        // Extract parameters from input schema
        let parameters = self.extract_parameters(&mcp_tool.input_schema);

        // Map to capabilities (generic for now)
        let capabilities = vec![
            ToolCapability::FileRead,
            ToolCapability::FileWrite,
            ToolCapability::NetworkOperation,
        ];

        Tool {
            id: tool_id,
            name: mcp_tool.name.clone(),
            description: mcp_tool
                .description
                .clone()
                .unwrap_or_else(|| format!("MCP tool from {} server", server_name)),
            capabilities,
            parameters,
            estimated_resources: crate::agi::ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 50,
                network_mb: 0.1,
            },
            dependencies: vec![],
        }
    }

    /// Extract parameters from MCP input schema
    fn extract_parameters(&self, input_schema: &Value) -> Vec<ToolParameter> {
        let mut parameters = Vec::new();

        if let Some(properties) = input_schema.get("properties").and_then(|p| p.as_object()) {
            // Get required fields
            let required: Vec<String> = input_schema
                .get("required")
                .and_then(|r| r.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();

            for (name, schema) in properties {
                let param_type_str = schema
                    .get("type")
                    .and_then(|t| t.as_str())
                    .unwrap_or("string");

                let parameter_type = match param_type_str {
                    "string" => ParameterType::String,
                    "integer" | "number" => ParameterType::Integer,
                    "boolean" => ParameterType::Boolean,
                    "object" => ParameterType::Object,
                    "array" => ParameterType::Array,
                    _ => ParameterType::String,
                };

                let description = schema
                    .get("description")
                    .and_then(|d| d.as_str())
                    .unwrap_or("")
                    .to_string();

                parameters.push(ToolParameter {
                    name: name.clone(),
                    parameter_type,
                    required: required.contains(name),
                    description,
                    default: schema.get("default").cloned(),
                });
            }
        }

        parameters
    }

    /// Execute an MCP tool
    pub async fn execute_tool(
        &self,
        tool_id: &str,
        arguments: HashMap<String, Value>,
    ) -> McpResult<Value> {
        // Parse tool_id: "mcp_<server>_<tool>"
        let parts: Vec<&str> = tool_id.split('_').collect();
        if parts.len() < 3 || parts[0] != "mcp" {
            return Err(crate::mcp::McpError::ToolNotFound(format!(
                "Invalid MCP tool ID: {}",
                tool_id
            )));
        }

        let server_name = parts[1];
        let tool_name = parts[2..].join("_");

        // Convert arguments to JSON Value
        let args_value = serde_json::to_value(arguments)?;

        // Call the tool
        self.mcp_client
            .call_tool(server_name, &tool_name, args_value)
            .await
    }

    /// Search for tools
    pub fn search_tools(&self, query: &str) -> Vec<Tool> {
        let results = self.mcp_client.search_tools(query);
        results
            .into_iter()
            .map(|(server_name, mcp_tool)| self.mcp_tool_to_schema(&server_name, &mcp_tool))
            .collect()
    }

    /// Get tools from a specific server
    pub fn get_server_tools(&self, server_name: &str) -> McpResult<Vec<Tool>> {
        let tools = self.mcp_client.list_server_tools(server_name)?;
        Ok(tools
            .into_iter()
            .map(|mcp_tool| self.mcp_tool_to_schema(server_name, &mcp_tool))
            .collect())
    }

    /// Convert MCP tool to router ToolDefinition format
    pub fn to_tool_definition(&self, server_name: &str, mcp_tool: &McpTool) -> crate::router::ToolDefinition {
        crate::router::ToolDefinition {
            name: format!("mcp_{}_{}", server_name, mcp_tool.name),
            description: mcp_tool.description.clone().unwrap_or_default(),
            parameters: mcp_tool.input_schema.clone(),
        }
    }

    /// Get all tools as router ToolDefinition format
    pub fn get_all_tool_definitions(&self) -> Vec<crate::router::ToolDefinition> {
        let tools = self.mcp_client.list_all_tools();
        tools
            .into_iter()
            .map(|(server_name, mcp_tool)| self.to_tool_definition(&server_name, &mcp_tool))
            .collect()
    }

    /// Convert MCP tool schema to OpenAI function definition format
    pub fn to_openai_function(&self, server_name: &str, mcp_tool: &McpTool) -> Value {
        serde_json::json!({
            "type": "function",
            "function": {
                "name": format!("mcp_{}_{}", server_name, mcp_tool.name),
                "description": mcp_tool.description.clone().unwrap_or_default(),
                "parameters": mcp_tool.input_schema
            }
        })
    }

    /// Get all tools in OpenAI function format
    pub fn get_all_openai_functions(&self) -> Vec<Value> {
        let tools = self.mcp_client.list_all_tools();
        tools
            .into_iter()
            .map(|(server_name, mcp_tool)| self.to_openai_function(&server_name, &mcp_tool))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_parameters() {
        let registry = McpToolRegistry::new(Arc::new(McpClient::new()));

        let input_schema = serde_json::json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "File path"
                },
                "content": {
                    "type": "string",
                    "description": "File content"
                }
            },
            "required": ["path"]
        });

        let params = registry.extract_parameters(&input_schema);
        assert_eq!(params.len(), 2);
        assert!(params.iter().any(|p| p.name == "path" && p.required));
        assert!(params.iter().any(|p| p.name == "content" && !p.required));
    }
}
