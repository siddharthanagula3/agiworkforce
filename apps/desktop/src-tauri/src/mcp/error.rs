use thiserror::Error;

#[derive(Error, Debug)]
pub enum McpError {
    #[error("Failed to connect to MCP server: {0}")]
    ConnectionError(String),

    #[error("MCP server not found: {0}")]
    ServerNotFound(String),

    #[error("Tool not found: {0}")]
    ToolNotFound(String),

    #[error("Tool execution failed: {0}")]
    ToolExecutionError(String),

    #[error("Invalid server configuration: {0}")]
    InvalidConfig(String),

    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("RMCP error: {0}")]
    RmcpError(String),
}

pub type McpResult<T> = Result<T, McpError>;
