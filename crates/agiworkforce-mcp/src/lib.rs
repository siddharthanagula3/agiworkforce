#![allow(clippy::collapsible_if)]

pub mod client;
pub mod config;
pub mod elicitation;
pub mod error;
pub mod hooks;
pub mod notification;
pub mod oauth;
pub mod protocol;
pub mod resources;
pub mod security;
pub mod server;

mod cache;
mod jsonrpc;
mod param_headers;
mod peer_requests;
mod transport;

pub use client::{McpClient, NegotiatedServer};
pub use config::{McpTimeouts, OAuthConfig, TransportConfig};
pub use elicitation::{
    AutoDeclineHandler, ElicitationAction, ElicitationHandler, ElicitationMode, ElicitationRequest,
    ElicitationResponse, SharedElicitationHandler,
};
pub use error::McpError;
pub use hooks::{
    BrowserAuthorizer, ClientHooks, ClientInfo, ClientRegistration, OAuthToken, TokenStore,
};
pub use notification::McpNotification;
pub use protocol::{Implementation, RpcError};
pub use resources::{McpResource, McpResourceContents, McpResourceTemplate};
pub use transport::stdio::INHERITED_ENV_ALLOWLIST;

pub use agiworkforce_protocol::mcp::{CallToolResult, Tool};
