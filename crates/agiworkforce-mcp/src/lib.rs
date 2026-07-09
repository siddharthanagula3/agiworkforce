//! Shared MCP (Model Context Protocol) client engine for AGI Workforce Rust
//! surfaces.
//!
//! Extracted from `apps/cli/src/mcp/` (Wave 5, stage d1 of
//! `docs/plans/rust-engine-extraction-2026-07-09.md`). Holds the transport
//! MECHANICS only:
//!
//! - JSON-RPC framing, id correlation, per-operation timeouts, stale-request
//!   handling, and connection-error detection + one-shot reconnect on tool
//!   calls (verbatim behavior from the CLI client).
//! - the three transports: `stdio` child process, long-lived `sse`, and
//!   Streamable `http` (MCP 2025-06-18) with sticky `Mcp-Session-Id`.
//! - the complete OAuth story: RFC 9728 protected-resource discovery,
//!   RFC 8414 AS metadata, RFC 7591 dynamic registration, and the
//!   authorization-code + PKCE (RFC 7636) grant with refresh.
//! - MCP wire types are REUSED from [`agiworkforce_protocol::mcp`]
//!   ([`agiworkforce_protocol::mcp::Tool`],
//!   [`agiworkforce_protocol::mcp::CallToolResult`]) — never redefined here.
//!
//! POLICY / UI / persistence stay in the host apps and are injected via
//! [`ClientHooks`]: token storage ([`TokenStore`]), the elicitation surface
//! ([`ElicitationHandler`]), the browser-open + interactivity gate
//! ([`BrowserAuthorizer`]), the client identity sent in `initialize`
//! ([`ClientInfo`]), and an operational log sink. This crate reads no config,
//! opens no browser on its own, and persists nothing on its own.

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

mod jsonrpc;
mod transport;

pub use client::McpClient;
pub use config::{McpTimeouts, OAuthConfig, TransportConfig};
pub use elicitation::{
    AutoDeclineHandler, ElicitationAction, ElicitationHandler, ElicitationMode,
    ElicitationRequest, ElicitationResponse, SharedElicitationHandler,
};
pub use error::McpError;
pub use hooks::{BrowserAuthorizer, ClientHooks, ClientInfo, OAuthToken, TokenStore};
pub use notification::McpNotification;

// Re-export the MCP wire types this crate speaks so hosts do not have to add a
// second explicit dependency edge just to name the return types.
pub use agiworkforce_protocol::mcp::{CallToolResult, Tool};
