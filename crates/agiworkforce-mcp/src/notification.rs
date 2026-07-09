//! Server-initiated MCP notifications delivered out-of-band of request/response
//! correlation.
//!
//! Only the long-lived `sse` transport has a persistent server→client push
//! channel, so that is the transport that feeds [`McpClient::notifications`].
//! Delivery is best-effort: the SSE drain task uses a bounded `try_send`, so a
//! consumer that never drains the receiver can never stall or grow the drain
//! loop. The `stdio` and `http` transports return an already-empty receiver.
//!
//! [`McpClient::notifications`]: crate::client::McpClient::notifications

/// A JSON-RPC notification (a frame with a `method` and no `id`) pushed by the
/// server. `elicitation/create` server *requests* are handled inline by the
/// client and are never surfaced here.
#[derive(Debug, Clone, PartialEq)]
pub struct McpNotification {
    /// The notification method, e.g. `notifications/tools/list_changed`.
    pub method: String,
    /// The `params` object as sent (or `Null` when absent).
    pub params: serde_json::Value,
}
