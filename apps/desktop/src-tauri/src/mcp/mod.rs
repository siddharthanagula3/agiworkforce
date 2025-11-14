// Model Context Protocol (MCP) integration
//
// This module provides full MCP client support, allowing the AGI Workforce
// application to connect to any MCP server (like cursor-agent does).

pub mod client;
pub mod config;
pub mod error;
pub mod events;
pub mod health;
pub mod manager;
pub mod registry;
pub mod tool_executor;

pub use client::McpClient;
pub use config::{McpServerConfig, McpServersConfig};
pub use error::{McpError, McpResult};
pub use events::{emit_mcp_event, McpEvent};
pub use health::{HealthStatus, McpHealthMonitor, ServerHealth};
pub use manager::{ManagedServer, McpServerManager, ServerStatus};
pub use registry::McpToolRegistry;
pub use tool_executor::{McpToolExecutor, ToolExecutionResult, ToolStats};
