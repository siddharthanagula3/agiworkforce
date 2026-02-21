use crate::core::agi::tools::{ParameterType, Tool, ToolCapability, ToolParameter};
use crate::core::mcp::client::McpTool;
use crate::core::mcp::{McpClient, McpError, McpResult};
use base64::Engine as _;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;

/// Delimiter used to separate components in tool IDs.
/// Format: mcp__<server_name>__<tool_name>
const TOOL_ID_DELIMITER: &str = "__";
const ENCODED_HEX_PREFIX: &str = "hex_";
const ENCODED_HEX_PREFIX_LEGACY: &str = "hex:";
const ENCODED_B64_PREFIX: &str = "b64_";
const ENCODED_B64_PREFIX_LEGACY: &str = "b64:";

/// Helper to create safe tool IDs with sanitized names.
fn create_safe_tool_id(server_name: &str, tool_name: &str) -> String {
    // OpenAI function names must match ^[a-zA-Z0-9_-]+$ and max length constraints.
    // Prefer tagged URL-safe base64 for robust decoding; fall back to untagged
    // base64 when needed to stay under 64 chars.
    let safe_server = format!(
        "{}{}",
        ENCODED_B64_PREFIX,
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(server_name)
    );
    let safe_tool = format!(
        "{}{}",
        ENCODED_B64_PREFIX,
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(tool_name)
    );

    let tagged_id = format!(
        "mcp{}{}{}{}",
        TOOL_ID_DELIMITER, safe_server, TOOL_ID_DELIMITER, safe_tool
    );

    if tagged_id.len() <= 64 {
        return tagged_id;
    }

    let compact_server = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(server_name);
    let compact_tool = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(tool_name);
    format!(
        "mcp{}{}{}{}",
        TOOL_ID_DELIMITER, compact_server, TOOL_ID_DELIMITER, compact_tool
    )
}

pub struct McpToolRegistry {
    mcp_client: Arc<McpClient>,
}

impl McpToolRegistry {
    pub fn new(mcp_client: Arc<McpClient>) -> Self {
        Self { mcp_client }
    }

    pub fn get_all_tool_schemas(&self) -> Vec<Tool> {
        let tools = self.mcp_client.list_all_tools();
        tools
            .into_iter()
            .map(|(server_name, mcp_tool)| self.mcp_tool_to_schema(&server_name, &mcp_tool))
            .collect()
    }

    pub fn mcp_tool_to_schema(&self, server_name: &str, mcp_tool: &McpTool) -> Tool {
        // HIGH-004 fix: Use helper for safe tool ID creation
        let tool_id = create_safe_tool_id(server_name, &mcp_tool.name);

        let parameters = self.extract_parameters(&mcp_tool.input_schema);

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
            estimated_resources: crate::core::agi::ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 50,
                network_mb: 0.1,
            },
            dependencies: vec![],
        }
    }

    fn extract_parameters(&self, input_schema: &Value) -> Vec<ToolParameter> {
        let mut parameters = Vec::new();

        if let Some(properties) = input_schema.get("properties").and_then(|p| p.as_object()) {
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

    /// Parses a tool ID into (server_name, tool_name) components
    /// Tool IDs are in the format: mcp__<server_name>__<tool_name>
    fn parse_tool_id(tool_id: &str) -> McpResult<(String, String)> {
        let parts: Vec<&str> = tool_id.splitn(3, TOOL_ID_DELIMITER).collect();
        if parts.len() != 3 || parts[0] != "mcp" {
            return Err(McpError::ToolNotFound(format!(
                "Invalid MCP tool ID format '{}'. Expected format: mcp__<server>__<tool>",
                tool_id
            )));
        }
        let decode_component = |value: &str| -> McpResult<String> {
            if let Some(encoded) = value
                .strip_prefix(ENCODED_HEX_PREFIX)
                .or_else(|| value.strip_prefix(ENCODED_HEX_PREFIX_LEGACY))
            {
                let bytes = hex::decode(encoded).map_err(|_| {
                    McpError::ToolNotFound(format!(
                        "Invalid encoded MCP tool ID component: {}",
                        value
                    ))
                })?;
                String::from_utf8(bytes).map_err(|_| {
                    McpError::ToolNotFound(format!(
                        "Invalid UTF-8 in MCP tool ID component: {}",
                        value
                    ))
                })
            } else if let Some(encoded) = value
                .strip_prefix(ENCODED_B64_PREFIX)
                .or_else(|| value.strip_prefix(ENCODED_B64_PREFIX_LEGACY))
            {
                let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
                    .decode(encoded)
                    .map_err(|_| {
                        McpError::ToolNotFound(format!(
                            "Invalid encoded MCP tool ID component: {}",
                            value
                        ))
                    })?;
                String::from_utf8(bytes).map_err(|_| {
                    McpError::ToolNotFound(format!(
                        "Invalid UTF-8 in MCP tool ID component: {}",
                        value
                    ))
                })
            } else if value.len() >= 20 {
                // Compact untagged URL-safe base64 fallback for long tool IDs.
                let bytes = match base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(value) {
                    Ok(bytes) => bytes,
                    Err(_) => return Ok(value.to_string()),
                };
                let decoded = match String::from_utf8(bytes) {
                    Ok(decoded) => decoded,
                    Err(_) => return Ok(value.to_string()),
                };
                // Guard against accidental decoding of plain legacy names.
                if base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(decoded.as_bytes())
                    == value
                {
                    Ok(decoded)
                } else {
                    Ok(value.to_string())
                }
            } else {
                // Backward-compatible legacy IDs.
                Ok(value.to_string())
            }
        };

        let server_name = decode_component(parts[1])?;
        let tool_name = decode_component(parts[2])?;

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

        Ok((server_name.to_string(), tool_name.to_string()))
    }

    pub async fn execute_tool(
        &self,
        tool_id: &str,
        arguments: HashMap<String, Value>,
    ) -> McpResult<Value> {
        tracing::debug!("[MCP Registry] execute_tool called: tool_id={}", tool_id);

        let (server_name, tool_name) = Self::parse_tool_id(tool_id)?;

        // Validate that the server exists before attempting to call the tool
        let servers = self.mcp_client.list_servers();
        if !servers.iter().any(|s| s == &server_name) {
            return Err(McpError::ServerNotFound(format!(
                "Server '{}' not found. Available servers: {:?}",
                server_name, servers
            )));
        }

        let args_value = serde_json::to_value(arguments)?;

        self.mcp_client
            .call_tool(&server_name, &tool_name, args_value)
            .await
    }

    pub fn search_tools(&self, query: &str) -> Vec<Tool> {
        let results = self.mcp_client.search_tools(query);
        results
            .into_iter()
            .map(|(server_name, mcp_tool)| self.mcp_tool_to_schema(&server_name, &mcp_tool))
            .collect()
    }

    pub fn get_tool(&self, tool_id: &str) -> McpResult<Tool> {
        let (server_name, tool_name) = Self::parse_tool_id(tool_id)?;

        // Validate that the server exists
        let servers = self.mcp_client.list_servers();
        if !servers.iter().any(|s| s == &server_name) {
            return Err(McpError::ServerNotFound(format!(
                "Server '{}' not found. Available servers: {:?}",
                server_name, servers
            )));
        }

        let tools = self.mcp_client.list_server_tools(&server_name)?;
        let tool = tools
            .into_iter()
            .find(|t| t.name == tool_name)
            .ok_or_else(|| {
                McpError::ToolNotFound(format!(
                    "Tool '{}' not found on server '{}'",
                    tool_name, server_name
                ))
            })?;

        Ok(self.mcp_tool_to_schema(&server_name, &tool))
    }

    pub fn get_server_tools(&self, server_name: &str) -> McpResult<Vec<Tool>> {
        let tools = self.mcp_client.list_server_tools(server_name)?;
        Ok(tools
            .into_iter()
            .map(|mcp_tool| self.mcp_tool_to_schema(server_name, &mcp_tool))
            .collect())
    }

    pub fn to_tool_definition(
        &self,
        server_name: &str,
        mcp_tool: &McpTool,
    ) -> crate::core::llm::ToolDefinition {
        crate::core::llm::ToolDefinition {
            // HIGH-004 fix: Use helper for safe tool ID creation
            name: create_safe_tool_id(server_name, &mcp_tool.name),
            description: mcp_tool.description.clone().unwrap_or_default(),
            parameters: mcp_tool.input_schema.clone(),
        }
    }

    pub fn get_all_tool_definitions(&self) -> Vec<crate::core::llm::ToolDefinition> {
        let tools = self.mcp_client.list_all_tools();
        tools
            .into_iter()
            .map(|(server_name, mcp_tool)| self.to_tool_definition(&server_name, &mcp_tool))
            .collect()
    }

    pub fn to_openai_function(&self, server_name: &str, mcp_tool: &McpTool) -> Value {
        serde_json::json!({
            "type": "function",
            "function": {
                // HIGH-004 fix: Use helper for safe tool ID creation
                "name": create_safe_tool_id(server_name, &mcp_tool.name),
                "description": mcp_tool.description.clone().unwrap_or_default(),
                "parameters": mcp_tool.input_schema
            }
        })
    }

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

    #[test]
    fn test_create_safe_tool_id_uses_openai_safe_charset() {
        let tool_id = create_safe_tool_id("filesystem", "read_file");
        assert_eq!(
            tool_id,
            "mcp__b64_ZmlsZXN5c3RlbQ__b64_cmVhZF9maWxl"
        );
        assert!(tool_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'));
    }

    #[test]
    fn test_parse_tool_id_accepts_legacy_hex_prefix() {
        let parsed =
            McpToolRegistry::parse_tool_id("mcp__hex:66696c6573797374656d__hex:726561645f66696c65");
        assert!(parsed.is_ok());
        let (server, tool) = parsed.unwrap();
        assert_eq!(server, "filesystem");
        assert_eq!(tool, "read_file");
    }

    #[test]
    fn test_create_safe_tool_id_falls_back_to_compact_base64_for_long_names() {
        let tool_id = create_safe_tool_id("claude_in_chrome", "read_network_requests");
        assert_eq!(
            tool_id,
            "mcp__Y2xhdWRlX2luX2Nocm9tZQ__cmVhZF9uZXR3b3JrX3JlcXVlc3Rz"
        );
        assert!(tool_id.len() <= 64);
        let parsed = McpToolRegistry::parse_tool_id(&tool_id).expect("compact base64 parses");
        assert_eq!(parsed.0, "claude_in_chrome");
        assert_eq!(parsed.1, "read_network_requests");
    }
}
