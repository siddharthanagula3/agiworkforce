//! Model Context Protocol (MCP) integration layer.
//!
//! Supports stdio, SSE, and streamable HTTP transports. [`client`] manages connections
//! to external MCP servers. [`server`] exposes AGI Workforce capabilities as an MCP server.
//! [`registry`] provides O(1) tool ID resolution. [`extensions`] manages third-party integrations.

pub mod client;
pub mod config;
pub mod error;
pub mod events;
pub mod extensions;
pub mod health;
pub mod logs;
pub mod manager;
pub mod protocol;
pub mod registry;
pub mod server;
pub mod session;
pub mod tool_executor;
pub mod transport;

#[cfg(test)]
mod tests;

pub use client::{McpClient, McpTool};
pub use config::{ConfigDecryptionError, McpServerConfig, McpServersConfig};
pub use error::{McpError, McpResult};
pub use events::{emit_mcp_event, McpEvent};
pub use extensions::{
    ExtensionError, ExtensionInstaller, ExtensionManager, ExtensionManifest, ExtensionPackage,
    ExtensionRepository, ExtensionResult,
};
pub use health::{HealthStatus, McpHealthMonitor, ServerHealth};
pub use manager::{ManagedServer, McpServerManager, ServerStatus};
pub use protocol::{McpToolDefinition, ToolCallResult, ToolContent};
pub use registry::McpToolRegistry;
pub use session::McpSession;
pub use tool_executor::{McpToolExecutor, ToolExecutionResult, ToolStats};
pub use transport::{
    HttpSseConfig, HttpSseTransport, McpTransport, StdioTransport, Transport, TransportConfig,
};
