// MCP Session Management
//
// Manages the lifecycle of an MCP server connection, including initialization,
// capabilities negotiation, and tool discovery.

use super::protocol::{
    ClientCapabilities, Implementation, InitializeParams, InitializeResult, McpToolDefinition,
    ResourceDefinition, ResourceReadParams, ResourceReadResult, ResourcesListParams,
    ResourcesListResult, ToolCallParams, ToolCallResult, ToolsListResult,
};
use super::transport::StdioTransport;
use crate::mcp::{McpError, McpResult, McpServerConfig};
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;

/// MCP Session with a connected server
pub struct McpSession {
    /// Server name
    name: String,
    /// Transport layer
    transport: Arc<RwLock<StdioTransport>>,
    /// Server info from initialization
    server_info: Option<Implementation>,
    /// Server capabilities
    capabilities: Option<super::protocol::ServerCapabilities>,
    /// Cached tools
    tools: Arc<RwLock<Vec<McpToolDefinition>>>,
}

impl McpSession {
    /// Create a new session and connect to the server
    pub async fn connect(name: String, config: McpServerConfig) -> McpResult<Self> {
        tracing::info!("[MCP Session] Connecting to server '{}'", name);

        // Create transport
        let transport = StdioTransport::new(&config.command, &config.args, &config.env).await?;

        let session = Self {
            name,
            transport: Arc::new(RwLock::new(transport)),
            server_info: None,
            capabilities: None,
            tools: Arc::new(RwLock::new(Vec::new())),
        };

        Ok(session)
    }

    /// Initialize the session with the server
    pub async fn initialize(&mut self) -> McpResult<InitializeResult> {
        tracing::info!("[MCP Session] Initializing session for '{}'", self.name);

        let params = InitializeParams {
            protocol_version: "2024-11-05".to_string(),
            capabilities: ClientCapabilities::default(),
            client_info: Implementation {
                name: "AGI Workforce".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
            },
        };

        let response = self
            .transport
            .read()
            .send_request(
                "initialize".to_string(),
                Some(serde_json::to_value(params)?),
            )
            .await?;

        let result: InitializeResult = serde_json::from_value(response.result)?;

        // Store server info and capabilities
        self.server_info = Some(result.server_info.clone());
        self.capabilities = Some(result.capabilities.clone());

        tracing::info!(
            "[MCP Session] Initialized server '{}' ({})",
            result.server_info.name,
            result.server_info.version
        );

        // Send initialized notification
        self.transport
            .read()
            .send_notification("notifications/initialized".to_string(), None);

        Ok(result)
    }

    /// List all available tools from the server
    pub async fn list_tools(&self) -> McpResult<Vec<McpToolDefinition>> {
        tracing::debug!("[MCP Session] Listing tools for '{}'", self.name);

        let response = self
            .transport
            .read()
            .send_request("tools/list".to_string(), None)
            .await?;

        let result: ToolsListResult = serde_json::from_value(response.result)?;

        // Cache tools
        {
            let mut tools = self.tools.write();
            *tools = result.tools.clone();
        }

        tracing::info!(
            "[MCP Session] Found {} tools for server '{}'",
            result.tools.len(),
            self.name
        );

        Ok(result.tools)
    }

    /// Call a tool on the server
    pub async fn call_tool(
        &self,
        tool_name: &str,
        arguments: HashMap<String, serde_json::Value>,
    ) -> McpResult<ToolCallResult> {
        tracing::debug!(
            "[MCP Session] Calling tool '{}' on server '{}'",
            tool_name,
            self.name
        );

        let params = ToolCallParams {
            name: tool_name.to_string(),
            arguments: Some(arguments),
        };

        let response = self
            .transport
            .read()
            .send_request(
                "tools/call".to_string(),
                Some(serde_json::to_value(params)?),
            )
            .await?;

        let result: ToolCallResult = serde_json::from_value(response.result)?;

        if result.is_error.unwrap_or(false) {
            return Err(McpError::ToolExecutionError(format!(
                "Tool '{}' returned an error",
                tool_name
            )));
        }

        Ok(result)
    }

    /// List available resources (if supported)
    pub async fn list_resources(&self) -> McpResult<Vec<ResourceDefinition>> {
        tracing::debug!("[MCP Session] Listing resources for '{}'", self.name);

        let params = ResourcesListParams { cursor: None };

        let response = self
            .transport
            .read()
            .send_request(
                "resources/list".to_string(),
                Some(serde_json::to_value(params)?),
            )
            .await?;

        let result: ResourcesListResult = serde_json::from_value(response.result)?;

        Ok(result.resources)
    }

    /// Read a resource by URI
    pub async fn read_resource(&self, uri: &str) -> McpResult<ResourceReadResult> {
        tracing::debug!(
            "[MCP Session] Reading resource '{}' from server '{}'",
            uri,
            self.name
        );

        let params = ResourceReadParams {
            uri: uri.to_string(),
        };

        let response = self
            .transport
            .read()
            .send_request(
                "resources/read".to_string(),
                Some(serde_json::to_value(params)?),
            )
            .await?;

        let result: ResourceReadResult = serde_json::from_value(response.result)?;

        Ok(result)
    }

    /// Get server information
    pub fn get_server_info(&self) -> Option<Implementation> {
        self.server_info.clone()
    }

    /// Get server capabilities
    pub fn get_capabilities(&self) -> Option<super::protocol::ServerCapabilities> {
        self.capabilities.clone()
    }

    /// Get cached tools
    pub fn get_cached_tools(&self) -> Vec<McpToolDefinition> {
        self.tools.read().clone()
    }

    /// Check if session is alive
    pub fn is_alive(&self) -> bool {
        self.transport.read().is_alive()
    }

    /// Shutdown the session
    pub async fn shutdown(&mut self) -> McpResult<()> {
        tracing::info!("[MCP Session] Shutting down session for '{}'", self.name);
        self.transport.write().shutdown().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_capabilities() {
        let caps = ClientCapabilities::default();
        let json = serde_json::to_string(&caps).unwrap();
        assert!(json.contains("{}") || json.contains("null"));
    }

    #[test]
    fn test_initialize_params() {
        let params = InitializeParams {
            protocol_version: "2024-11-05".to_string(),
            capabilities: ClientCapabilities::default(),
            client_info: Implementation {
                name: "Test".to_string(),
                version: "1.0.0".to_string(),
            },
        };
        let json = serde_json::to_string(&params).unwrap();
        assert!(json.contains("protocolVersion"));
        assert!(json.contains("clientInfo"));
    }
}
