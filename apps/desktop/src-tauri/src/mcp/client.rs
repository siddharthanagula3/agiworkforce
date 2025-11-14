// Real MCP Client Implementation
//
// This replaces the stub client with a real implementation using the MCP protocol

use super::protocol::McpToolDefinition;
use super::session::McpSession;
use crate::mcp::{McpError, McpResult, McpServerConfig};
use parking_lot::RwLock;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;

/// MCP Tool (simplified view for AGI integration)
#[derive(Debug, Clone)]
pub struct McpTool {
    pub name: String,
    pub description: Option<String>,
    pub input_schema: Value,
}

impl From<McpToolDefinition> for McpTool {
    fn from(def: McpToolDefinition) -> Self {
        Self {
            name: def.name,
            description: def.description,
            input_schema: def.input_schema,
        }
    }
}

/// MCP Client manager that handles multiple MCP servers
pub struct McpClient {
    sessions: Arc<RwLock<HashMap<String, Arc<RwLock<McpSession>>>>>,
}

impl McpClient {
    /// Create a new MCP client manager
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Connect to an MCP server
    pub async fn connect_server(&self, name: String, config: McpServerConfig) -> McpResult<()> {
        tracing::info!("[MCP Client] Connecting to server '{}'", name);

        // Create session
        let mut session = McpSession::connect(name.clone(), config).await?;

        // Initialize
        let init_result = session.initialize().await?;
        tracing::info!(
            "[MCP Client] Server '{}' initialized: {} v{}",
            name,
            init_result.server_info.name,
            init_result.server_info.version
        );

        // Discover tools
        let tools = session.list_tools().await?;
        tracing::info!(
            "[MCP Client] Server '{}' provides {} tools",
            name,
            tools.len()
        );

        // Store session
        self.sessions
            .write()
            .insert(name.clone(), Arc::new(RwLock::new(session)));

        Ok(())
    }

    /// Disconnect from an MCP server
    pub async fn disconnect_server(&self, name: &str) -> McpResult<()> {
        tracing::info!("[MCP Client] Disconnecting from server '{}'", name);

        let session_arc = {
            let mut sessions = self.sessions.write();
            sessions
                .remove(name)
                .ok_or_else(|| McpError::ServerNotFound(format!("Server '{}' not found", name)))?
        };

        // Shutdown session
        let mut session = session_arc.write();
        session.shutdown().await?;

        Ok(())
    }

    /// Get all connected server names
    pub fn list_servers(&self) -> Vec<String> {
        self.sessions.read().keys().cloned().collect()
    }

    /// Get all available tools from all connected servers
    pub fn list_all_tools(&self) -> Vec<(String, McpTool)> {
        let sessions = self.sessions.read();
        let mut all_tools = Vec::new();

        for (server_name, session_arc) in sessions.iter() {
            let session = session_arc.read();
            let tools = session.get_cached_tools();

            for tool_def in tools {
                all_tools.push((server_name.clone(), McpTool::from(tool_def)));
            }
        }

        all_tools
    }

    /// Get tools from a specific server
    pub fn list_server_tools(&self, server_name: &str) -> McpResult<Vec<McpTool>> {
        let sessions = self.sessions.read();
        let session_arc = sessions.get(server_name).ok_or_else(|| {
            McpError::ServerNotFound(format!("Server '{}' not found", server_name))
        })?;

        let session = session_arc.read();
        let tools = session
            .get_cached_tools()
            .into_iter()
            .map(McpTool::from)
            .collect();

        Ok(tools)
    }

    /// Refresh tools from a server
    pub async fn refresh_server_tools(&self, server_name: &str) -> McpResult<Vec<McpTool>> {
        let sessions = self.sessions.read();
        let session_arc = sessions.get(server_name).ok_or_else(|| {
            McpError::ServerNotFound(format!("Server '{}' not found", server_name))
        })?;

        let session = session_arc.read();
        let tools = session.list_tools().await?;

        Ok(tools.into_iter().map(McpTool::from).collect())
    }

    /// Call a tool on a specific server
    pub async fn call_tool(
        &self,
        server_name: &str,
        tool_name: &str,
        arguments: Value,
    ) -> McpResult<Value> {
        tracing::debug!(
            "[MCP Client] Calling tool '{}' on server '{}' with args: {:?}",
            tool_name,
            server_name,
            arguments
        );

        let sessions = self.sessions.read();
        let session_arc = sessions.get(server_name).ok_or_else(|| {
            McpError::ServerNotFound(format!("Server '{}' not found", server_name))
        })?;

        // Convert Value to HashMap
        let args_map: HashMap<String, Value> = if arguments.is_object() {
            serde_json::from_value(arguments)?
        } else {
            HashMap::new()
        };

        let session = session_arc.read();
        let result = session.call_tool(tool_name, args_map).await?;

        // Convert tool result to simple JSON value
        Ok(serde_json::to_value(result)?)
    }

    /// Search for tools across all servers
    pub fn search_tools(&self, query: &str) -> Vec<(String, McpTool)> {
        let sessions = self.sessions.read();
        let mut results = Vec::new();
        let query_lower = query.to_lowercase();

        for (server_name, session_arc) in sessions.iter() {
            let session = session_arc.read();
            let tools = session.get_cached_tools();

            for tool_def in tools {
                // Search in name and description
                let name_match = tool_def.name.to_lowercase().contains(&query_lower);
                let desc_match = tool_def
                    .description
                    .as_ref()
                    .map(|d| d.to_lowercase().contains(&query_lower))
                    .unwrap_or(false);

                if name_match || desc_match {
                    results.push((server_name.clone(), McpTool::from(tool_def)));
                }
            }
        }

        results
    }

    /// Get statistics about connected servers
    pub fn get_stats(&self) -> HashMap<String, usize> {
        let sessions = self.sessions.read();
        sessions
            .iter()
            .map(|(name, session_arc)| {
                let session = session_arc.read();
                (name.clone(), session.get_cached_tools().len())
            })
            .collect()
    }

    /// Get list of connected server names
    pub fn get_connected_servers(&self) -> Vec<String> {
        self.sessions.read().keys().cloned().collect()
    }

    /// Check if all servers are alive
    pub fn health_check(&self) -> HashMap<String, bool> {
        let sessions = self.sessions.read();
        sessions
            .iter()
            .map(|(name, session_arc)| {
                let session = session_arc.read();
                (name.clone(), session.is_alive())
            })
            .collect()
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

    #[test]
    fn test_mcp_tool_conversion() {
        let def = McpToolDefinition {
            name: "test_tool".to_string(),
            description: Some("Test description".to_string()),
            input_schema: serde_json::json!({"type": "object"}),
        };

        let tool: McpTool = def.into();
        assert_eq!(tool.name, "test_tool");
        assert_eq!(tool.description, Some("Test description".to_string()));
    }
}
