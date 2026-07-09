//! Transport bringup for the three MCP transports. The shared JSON-RPC
//! request/response driving lives on [`crate::client::McpClient`]; these
//! modules only construct the live [`crate::client::TransportConn`] and, for
//! HTTP, own the per-request POST + OAuth retry.

pub(crate) mod http;
pub(crate) mod sse;
