use crate::mcp::{McpError, McpResult, McpServerConfig};
use parking_lot::RwLock;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;

/// Simplified tool definition (matching MCP format)
#[derive(Debug, Clone)]
pub struct McpTool {
    pub name: String,
    pub description: Option<String>,
    pub input_schema: Value,
}

/// A connected MCP server (stub implementation for now)
struct ConnectedServer {
    config: McpServerConfig,
    tools: Vec<McpTool>,
}

impl ConnectedServer {
    fn new(name: &str, config: McpServerConfig) -> Self {
        let tools = Self::infer_tools(name, &config);
        Self { config, tools }
    }

    fn infer_tools(server_name: &str, config: &McpServerConfig) -> Vec<McpTool> {
        let signature = format!(
            "{} {}",
            config.command,
            config
                .args
                .iter()
                .map(|arg| arg.as_str())
                .collect::<Vec<&str>>()
                .join(" ")
        )
        .to_lowercase();

        if server_name.contains("filesystem") || signature.contains("server-filesystem") {
            return vec![
                McpTool {
                    name: "read_file".to_string(),
                    description: Some("Read the contents of a file from disk".to_string()),
                    input_schema: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Absolute or relative path to the file"
                            }
                        },
                        "required": ["path"]
                    }),
                },
                McpTool {
                    name: "write_file".to_string(),
                    description: Some(
                        "Write contents to a file. Creates the file if missing.".to_string(),
                    ),
                    input_schema: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Destination path for the file"
                            },
                            "content": {
                                "type": "string",
                                "description": "UTF-8 content to write"
                            }
                        },
                        "required": ["path", "content"]
                    }),
                },
                McpTool {
                    name: "list_directory".to_string(),
                    description: Some("List files and folders within a directory".to_string()),
                    input_schema: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Directory path to inspect"
                            },
                            "recursive": {
                                "type": "boolean",
                                "description": "Whether to recursively list directories",
                                "default": false
                            }
                        },
                        "required": ["path"]
                    }),
                },
            ];
        }

        if server_name.contains("github") || signature.contains("server-github") {
            return vec![
                McpTool {
                    name: "list_repositories".to_string(),
                    description: Some("List accessible GitHub repositories".to_string()),
                    input_schema: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "visibility": {
                                "type": "string",
                                "enum": ["all", "public", "private"],
                                "default": "all"
                            }
                        }
                    }),
                },
                McpTool {
                    name: "create_issue".to_string(),
                    description: Some("Open an issue in a GitHub repository".to_string()),
                    input_schema: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "owner": { "type": "string" },
                            "repo": { "type": "string" },
                            "title": { "type": "string" },
                            "body": { "type": "string" }
                        },
                        "required": ["owner", "repo", "title"]
                    }),
                },
            ];
        }

        if server_name.contains("slack") || signature.contains("server-slack") {
            return vec![
                McpTool {
                    name: "list_channels".to_string(),
                    description: Some("List Slack channels available to the bot token".to_string()),
                    input_schema: serde_json::json!({ "type": "object" }),
                },
                McpTool {
                    name: "post_message".to_string(),
                    description: Some("Post a message to a Slack channel".to_string()),
                    input_schema: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "channel": { "type": "string" },
                            "text": { "type": "string" }
                        },
                        "required": ["channel", "text"]
                    }),
                },
            ];
        }

        if server_name.contains("brave") || signature.contains("server-brave-search") {
            return vec![McpTool {
                name: "web_search".to_string(),
                description: Some("Search the web via Brave Search".to_string()),
                input_schema: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Search query" },
                        "count": {
                            "type": "integer",
                            "description": "Number of results",
                            "minimum": 1,
                            "maximum": 20,
                            "default": 5
                        }
                    },
                    "required": ["query"]
                }),
            }];
        }

        // Default fallback tool
        vec![McpTool {
            name: "ping".to_string(),
            description: Some("Check availability of the MCP server (stub)".to_string()),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "message": {
                        "type": "string",
                        "description": "Optional text to echo back",
                        "default": "hello"
                    }
                }
            }),
        }]
    }
}

/// MCP Client manager that handles multiple MCP servers
pub struct McpClient {
    servers: Arc<RwLock<HashMap<String, ConnectedServer>>>,
}

impl McpClient {
    /// Create a new MCP client manager
    pub fn new() -> Self {
        Self {
            servers: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Connect to an MCP server (stub implementation)
    pub async fn connect_server(&self, name: String, config: McpServerConfig) -> McpResult<()> {
        tracing::info!("Connecting to MCP server: {}", name);

        // TODO: Implement actual connection using rmcp SDK
        // For now, just store the config and create empty tools list

        let connected = ConnectedServer::new(&name, config);

        self.servers.write().insert(name.clone(), connected);

        tracing::info!("Connected to MCP server '{}'", name);
        Ok(())
    }

    /// Disconnect from an MCP server
    pub async fn disconnect_server(&self, name: &str) -> McpResult<()> {
        tracing::info!("Disconnecting from MCP server: {}", name);

        let mut servers = self.servers.write();
        if servers.remove(name).is_some() {
            Ok(())
        } else {
            Err(McpError::ServerNotFound(name.to_string()))
        }
    }

    /// Get all connected server names
    pub fn list_servers(&self) -> Vec<String> {
        self.servers.read().keys().cloned().collect()
    }

    /// Get all available tools from all connected servers
    pub fn list_all_tools(&self) -> Vec<(String, McpTool)> {
        let servers = self.servers.read();
        let mut all_tools = Vec::new();

        for (server_name, server) in servers.iter() {
            for tool in &server.tools {
                all_tools.push((server_name.clone(), tool.clone()));
            }
        }

        all_tools
    }

    /// Get tools from a specific server
    pub fn list_server_tools(&self, server_name: &str) -> McpResult<Vec<McpTool>> {
        let servers = self.servers.read();
        if let Some(server) = servers.get(server_name) {
            Ok(server.tools.clone())
        } else {
            Err(McpError::ServerNotFound(server_name.to_string()))
        }
    }

    /// Call a tool on a specific server (stub implementation)
    pub async fn call_tool(
        &self,
        server_name: &str,
        tool_name: &str,
        arguments: Value,
    ) -> McpResult<Value> {
        tracing::debug!(
            "Calling tool '{}' on server '{}' with args: {:?}",
            tool_name,
            server_name,
            arguments
        );

        // Verify server exists
        {
            let servers = self.servers.read();
            let server = servers
                .get(server_name)
                .ok_or_else(|| McpError::ServerNotFound(server_name.to_string()))?;

            // Check if tool exists
            if !server.tools.iter().any(|t| t.name == tool_name) {
                return Err(McpError::ToolNotFound(format!(
                    "Tool '{}' not found on server '{}'",
                    tool_name, server_name
                )));
            }
        }

        // TODO: Implement actual tool calling using rmcp SDK
        // For now, return a stub response
        Ok(serde_json::json!({
            "success": true,
            "message": format!("Tool {} called successfully (stub implementation)", tool_name),
            "server": server_name,
            "tool": tool_name,
            "arguments": arguments
        }))
    }

    /// Search for tools across all servers
    pub fn search_tools(&self, query: &str) -> Vec<(String, McpTool)> {
        let servers = self.servers.read();
        let mut results = Vec::new();
        let query_lower = query.to_lowercase();

        for (server_name, server) in servers.iter() {
            for tool in &server.tools {
                // Search in name and description
                let name_match = tool.name.to_lowercase().contains(&query_lower);
                let desc_match = tool
                    .description
                    .as_ref()
                    .map(|d| d.to_lowercase().contains(&query_lower))
                    .unwrap_or(false);

                if name_match || desc_match {
                    results.push((server_name.clone(), tool.clone()));
                }
            }
        }

        results
    }

    /// Get statistics about connected servers
    pub fn get_stats(&self) -> HashMap<String, usize> {
        let servers = self.servers.read();
        servers
            .iter()
            .map(|(name, server)| {
                let _config_signature = &server.config.command;
                (name.clone(), server.tools.len())
            })
            .collect()
    }

    /// Get list of connected server names
    pub fn get_connected_servers(&self) -> Vec<String> {
        let servers = self.servers.read();
        servers.keys().cloned().collect()
    }
}

impl Default for McpClient {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_client() {
        let client = McpClient::new();
        assert_eq!(client.list_servers().len(), 0);
    }

    #[test]
    fn test_search_tools_empty() {
        let client = McpClient::new();
        let results = client.search_tools("test");
        assert_eq!(results.len(), 0);
    }
}
