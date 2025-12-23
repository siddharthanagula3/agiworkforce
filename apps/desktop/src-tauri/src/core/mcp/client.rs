use super::protocol::McpToolDefinition;
use super::session::McpSession;
use crate::core::mcp::{McpError, McpResult, McpServerConfig};
use parking_lot::RwLock;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;

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

pub struct McpClient {
    sessions: Arc<RwLock<HashMap<String, Arc<McpSession>>>>,
}

impl McpClient {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn connect_server(&self, name: String, config: McpServerConfig) -> McpResult<()> {
        tracing::info!("[MCP Client] Connecting to server '{}'", name);

        let mut session = McpSession::connect(name.clone(), config).await?;

        let init_result = session.initialize().await?;
        tracing::info!(
            "[MCP Client] Server '{}' initialized: {} v{}",
            name,
            init_result.server_info.name,
            init_result.server_info.version
        );

        let tools = session.list_tools().await?;
        tracing::info!(
            "[MCP Client] Server '{}' provides {} tools",
            name,
            tools.len()
        );

        self.sessions
            .write()
            .insert(name.clone(), Arc::new(session));

        Ok(())
    }

    pub async fn disconnect_server(&self, name: &str) -> McpResult<()> {
        tracing::info!("[MCP Client] Disconnecting from server '{}'", name);

        let session_arc = {
            let mut sessions = self.sessions.write();
            sessions
                .remove(name)
                .ok_or_else(|| McpError::ServerNotFound(format!("Server '{}' not found", name)))?
        };

        session_arc.shutdown().await?;

        Ok(())
    }

    pub fn list_servers(&self) -> Vec<String> {
        self.sessions.read().keys().cloned().collect()
    }

    pub fn list_all_tools(&self) -> Vec<(String, McpTool)> {
        let sessions = self.sessions.read();
        let mut all_tools = Vec::new();

        for (server_name, session_arc) in sessions.iter() {
            let tools = session_arc.get_cached_tools();

            for tool_def in tools {
                all_tools.push((server_name.clone(), McpTool::from(tool_def)));
            }
        }

        all_tools
    }

    pub fn list_server_tools(&self, server_name: &str) -> McpResult<Vec<McpTool>> {
        let session_arc = {
            let sessions = self.sessions.read();
            sessions.get(server_name).cloned().ok_or_else(|| {
                McpError::ServerNotFound(format!("Server '{}' not found", server_name))
            })?
        };

        let tools = session_arc
            .get_cached_tools()
            .into_iter()
            .map(McpTool::from)
            .collect();

        Ok(tools)
    }

    pub async fn refresh_server_tools(&self, server_name: &str) -> McpResult<Vec<McpTool>> {
        let session_arc = {
            let sessions = self.sessions.read();
            sessions.get(server_name).cloned().ok_or_else(|| {
                McpError::ServerNotFound(format!("Server '{}' not found", server_name))
            })?
        };

        let tools = session_arc.list_tools().await?;

        Ok(tools.into_iter().map(McpTool::from).collect())
    }

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

        let session_arc = {
            let sessions = self.sessions.read();
            sessions.get(server_name).cloned().ok_or_else(|| {
                McpError::ServerNotFound(format!("Server '{}' not found", server_name))
            })?
        };

        let args_map: HashMap<String, Value> = if arguments.is_object() {
            serde_json::from_value(arguments)?
        } else {
            HashMap::new()
        };

        let result = session_arc.call_tool(tool_name, args_map).await?;

        Ok(serde_json::to_value(result)?)
    }

    pub fn search_tools(&self, query: &str) -> Vec<(String, McpTool)> {
        let sessions = self.sessions.read();
        let mut results = Vec::new();
        let query_lower = query.to_lowercase();

        for (server_name, session_arc) in sessions.iter() {
            let tools = session_arc.get_cached_tools();

            for tool_def in tools {
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

    pub fn get_stats(&self) -> HashMap<String, usize> {
        let sessions = self.sessions.read();
        sessions
            .iter()
            .map(|(name, session_arc)| (name.clone(), session_arc.get_cached_tools().len()))
            .collect()
    }

    pub fn get_connected_servers(&self) -> Vec<String> {
        self.sessions.read().keys().cloned().collect()
    }

    pub fn health_check(&self) -> HashMap<String, bool> {
        let sessions = self.sessions.read();
        sessions
            .iter()
            .map(|(name, session_arc)| (name.clone(), session_arc.is_alive()))
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
