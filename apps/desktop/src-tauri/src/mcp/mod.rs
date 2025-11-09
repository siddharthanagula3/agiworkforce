// Model Context Protocol (MCP) integration
//
// This module provides full MCP client support, allowing the AGI Workforce
// application to connect to any MCP server (like cursor-agent does).

pub mod client;
pub mod config;
pub mod registry;
pub mod error;
pub mod events;
pub mod health;

pub use client::McpClient;
pub use config::{McpServerConfig, McpServersConfig};
pub use registry::McpToolRegistry;
pub use error::{McpError, McpResult};
pub use events::{McpEvent, emit_mcp_event};
pub use health::{McpHealthMonitor, ServerHealth, HealthStatus};

