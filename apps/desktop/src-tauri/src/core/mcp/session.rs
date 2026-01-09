use super::protocol::{
    ClientCapabilities, Implementation, InitializeParams, InitializeResult, McpToolDefinition,
    ResourceDefinition, ResourceReadParams, ResourceReadResult, ResourcesListParams,
    ResourcesListResult, ToolCallParams, ToolCallResult, ToolsListResult,
};
use super::transport::StdioTransport;
use crate::core::mcp::{McpError, McpResult, McpServerConfig};
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

/// Default timeout for session initialization (10 seconds)
const INITIALIZATION_TIMEOUT_SECS: u64 = 10;

pub struct McpSession {
    name: String,

    transport: Arc<StdioTransport>,

    /// Server info, protected by RwLock for thread-safe access
    server_info: Arc<RwLock<Option<Implementation>>>,

    /// Server capabilities, protected by RwLock for thread-safe access
    capabilities: Arc<RwLock<Option<super::protocol::ServerCapabilities>>>,

    tools: Arc<RwLock<Vec<McpToolDefinition>>>,

    /// Guard to ensure initialize() is only called once
    initialized: AtomicBool,
}

impl McpSession {
    pub async fn connect(name: String, config: McpServerConfig) -> McpResult<Self> {
        tracing::info!("[MCP Session] Connecting to server '{}'", name);

        let transport =
            StdioTransport::new(name.clone(), &config.command, &config.args, &config.env).await?;

        let session = Self {
            name,
            transport: Arc::new(transport),
            server_info: Arc::new(RwLock::new(None)),
            capabilities: Arc::new(RwLock::new(None)),
            tools: Arc::new(RwLock::new(Vec::new())),
            initialized: AtomicBool::new(false),
        };

        Ok(session)
    }

    pub async fn initialize(&self) -> McpResult<InitializeResult> {
        // Guard to ensure initialize is only called once
        if self
            .initialized
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err(McpError::InvalidConfig(
                "Session already initialized".to_string(),
            ));
        }

        tracing::info!("[MCP Session] Initializing session for '{}'", self.name);

        let params = InitializeParams {
            protocol_version: "2024-11-05".to_string(),
            capabilities: ClientCapabilities::default(),
            client_info: Implementation {
                name: "AGI Workforce".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
            },
        };

        // Wrap initialization in a timeout
        let init_future = async {
            let response = self
                .transport
                .send_request(
                    "initialize".to_string(),
                    Some(serde_json::to_value(params)?),
                )
                .await?;

            let result: InitializeResult = serde_json::from_value(response.result)?;
            Ok::<InitializeResult, McpError>(result)
        };

        let result = match tokio::time::timeout(
            Duration::from_secs(INITIALIZATION_TIMEOUT_SECS),
            init_future,
        )
        .await
        {
            Ok(Ok(result)) => result,
            Ok(Err(e)) => {
                // Reset initialized flag on failure
                self.initialized.store(false, Ordering::SeqCst);
                return Err(e);
            }
            Err(_) => {
                // Reset initialized flag on timeout
                self.initialized.store(false, Ordering::SeqCst);
                return Err(McpError::InitializationTimeout(format!(
                    "Session '{}' initialization timed out after {} seconds",
                    self.name, INITIALIZATION_TIMEOUT_SECS
                )));
            }
        };

        // Update server info and capabilities with RwLock protection
        {
            let mut server_info = self.server_info.write();
            *server_info = Some(result.server_info.clone());
        }
        {
            let mut capabilities = self.capabilities.write();
            *capabilities = Some(result.capabilities.clone());
        }

        tracing::info!(
            "[MCP Session] Initialized server '{}' ({})",
            result.server_info.name,
            result.server_info.version
        );

        // Send notification and log any errors (don't fail the initialization)
        self.transport
            .send_notification("notifications/initialized".to_string(), None);
        tracing::debug!(
            "[MCP Session] Sent initialized notification for '{}'",
            self.name
        );

        Ok(result)
    }

    pub async fn list_tools(&self) -> McpResult<Vec<McpToolDefinition>> {
        tracing::debug!("[MCP Session] Listing tools for '{}'", self.name);

        let response = self
            .transport
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
            .transport
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
            .transport
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
            .transport
            .send_request(
                "resources/read".to_string(),
                Some(serde_json::to_value(params)?),
            )
            .await?;

        let result: ResourceReadResult = serde_json::from_value(response.result)?;

        Ok(result)
    }

    pub fn get_server_info(&self) -> Option<Implementation> {
        self.server_info.read().clone()
    }

    pub fn get_capabilities(&self) -> Option<super::protocol::ServerCapabilities> {
        self.capabilities.read().clone()
    }

    /// Check if the session has been initialized
    pub fn is_initialized(&self) -> bool {
        self.initialized.load(Ordering::SeqCst)
    }

    pub fn get_cached_tools(&self) -> Vec<McpToolDefinition> {
        self.tools.read().clone()
    }

    pub fn is_alive(&self) -> bool {
        self.transport.is_alive()
    }

    pub async fn shutdown(&self) -> McpResult<()> {
        tracing::info!("[MCP Session] Shutting down session for '{}'", self.name);
        self.transport.shutdown().await
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
