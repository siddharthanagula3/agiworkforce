use super::protocol::{
    ClientCapabilities, Implementation, InitializeParams, InitializeResult, McpToolDefinition,
    ResourceDefinition, ResourceReadParams, ResourceReadResult, ResourcesListParams,
    ResourcesListResult, ToolCallParams, ToolCallResult, ToolsListResult,
};
use super::transport::StdioTransport;
use crate::core::mcp::{McpError, McpResult, McpServerConfig};
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;

pub struct McpSession {
    name: String,

    transport: Arc<StdioTransport>,

    server_info: Option<Implementation>,

    capabilities: Option<super::protocol::ServerCapabilities>,

    tools: Arc<RwLock<Vec<McpToolDefinition>>>,
}

impl McpSession {
    pub async fn connect(name: String, config: McpServerConfig) -> McpResult<Self> {
        tracing::info!("[MCP Session] Connecting to server '{}'", name);

        let transport = StdioTransport::new(&config.command, &config.args, &config.env).await?;

        let session = Self {
            name,
            transport: Arc::new(transport),
            server_info: None,
            capabilities: None,
            tools: Arc::new(RwLock::new(Vec::new())),
        };

        Ok(session)
    }

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
            .transpor
            .send_request(
                "initialize".to_string(),
                Some(serde_json::to_value(params)?),
            )
            .await?;

        let result: InitializeResult = serde_json::from_value(response.result)?;

        self.server_info = Some(result.server_info.clone());
        self.capabilities = Some(result.capabilities.clone());

        tracing::info!(
            "[MCP Session] Initialized server '{}' ({})",
            result.server_info.name,
            result.server_info.version
        );

        self.transpor
            .send_notification("notifications/initialized".to_string(), None);

        Ok(result)
    }

    pub async fn list_tools(&self) -> McpResult<Vec<McpToolDefinition>> {
        tracing::debug!("[MCP Session] Listing tools for '{}'", self.name);

        let response = self
            .transpor
            .send_request("tools/list".to_string(), None)
            .await?;

        let result: ToolsListResult = serde_json::from_value(response.result)?;

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
            .transpor
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

    pub async fn list_resources(&self) -> McpResult<Vec<ResourceDefinition>> {
        tracing::debug!("[MCP Session] Listing resources for '{}'", self.name);

        let params = ResourcesListParams { cursor: None };

        let response = self
            .transpor
            .send_request(
                "resources/list".to_string(),
                Some(serde_json::to_value(params)?),
            )
            .await?;

        let result: ResourcesListResult = serde_json::from_value(response.result)?;

        Ok(result.resources)
    }

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
            .transpor
            .send_request(
                "resources/read".to_string(),
                Some(serde_json::to_value(params)?),
            )
            .await?;

        let result: ResourceReadResult = serde_json::from_value(response.result)?;

        Ok(result)
    }

    pub fn get_server_info(&self) -> Option<Implementation> {
        self.server_info.clone()
    }

    pub fn get_capabilities(&self) -> Option<super::protocol::ServerCapabilities> {
        self.capabilities.clone()
    }

    pub fn get_cached_tools(&self) -> Vec<McpToolDefinition> {
        self.tools.read().clone()
    }

    pub fn is_alive(&self) -> bool {
        self.transport.is_alive()
    }

    pub async fn shutdown(&self) -> McpResult<()> {
        tracing::info!("[MCP Session] Shutting down session for '{}'", self.name);
        self.transport.shutdown().awai
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
