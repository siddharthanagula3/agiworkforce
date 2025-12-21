// Model Context Protocol (MCP) integration
//
// This module provides full MCP client support, allowing the AGI Workforce
// application to connect to any MCP server using the official MCP protocol.
//
// Architecture:
// - protocol: JSON-RPC 2.0 message definitions
// - transport: STDIO transport for process communication
// - session: Session management with initialization and capabilities
// - client: High-level client API for multiple servers
// - manager: Server lifecycle management
// - registry: AGI tool integration
// - tool_executor: Execution tracking and statistics

pub mod client;
pub mod config;
pub mod error;
pub mod events;
pub mod health;
pub mod manager;
pub mod protocol;
pub mod registry;
pub mod session;
pub mod tool_executor;
pub mod transport;

#[cfg(test)]
mod tests;

pub use client::{McpClient, McpTool};
pub use config::{McpServerConfig, McpServersConfig};
pub use error::{McpError, McpResult};
pub use events::{emit_mcp_event, McpEvent};
pub use health::{HealthStatus, McpHealthMonitor, ServerHealth};
pub use manager::{ManagedServer, McpServerManager, ServerStatus};
pub use protocol::{McpToolDefinition, ToolCallResult, ToolContent};
pub use registry::McpToolRegistry;
pub use session::McpSession;
pub use tool_executor::{McpToolExecutor, ToolExecutionResult, ToolStats};
