
// The transport read-loops and OAuth paths are ported line-for-line from the
// CLI's `McpConnection` so behavior is provably unchanged. Several are nested
// `if cond { if let Some(x) = .. }` forms that clippy 1.91 would rewrite into
// let-chains; we keep the original nesting so the port stays auditable against
// the source. This suppresses only the stylistic collapse, not any deny-lint.
#![allow(clippy::collapsible_if)]

pub mod client;
pub mod config;
pub mod elicitation;
pub mod error;
pub mod hooks;
pub mod notification;
pub mod oauth;
pub mod security;

mod jsonrpc;
mod transport;

pub use client::McpClient;
pub use config::{McpTimeouts, OAuthConfig, TransportConfig};
pub use elicitation::{
    AutoDeclineHandler, ElicitationAction, ElicitationHandler, ElicitationMode, ElicitationRequest,
    ElicitationResponse, SharedElicitationHandler,
};
pub use error::McpError;
pub use hooks::{BrowserAuthorizer, ClientHooks, ClientInfo, OAuthToken, TokenStore};
pub use notification::McpNotification;

// Re-export the MCP wire types this crate speaks so hosts do not have to add a
// second explicit dependency edge just to name the return types.
pub use agiworkforce_protocol::mcp::{CallToolResult, Tool};
