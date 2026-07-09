//! Connection configuration for the MCP client.
//!
//! These are the engine's own transport-shaped types. Hosts keep their own
//! config-file/manifest types (the CLI's `McpServerConfig` / `McpOAuthConfig`
//! stay app-local, doing serde and back-compat) and convert into these at
//! connect time.

use std::collections::HashMap;
use std::time::Duration;

/// OAuth configuration for an MCP `Http` transport.
///
/// All fields optional — when absent the engine runs RFC 9728 → RFC 8414
/// discovery on the first 401. When `client_id` is also absent it attempts
/// RFC 7591 dynamic client registration against the discovered AS.
#[derive(Debug, Clone, Default)]
pub struct OAuthConfig {
    /// Override RFC 9728/8414 discovery for the authorize endpoint.
    pub authorize_url: Option<String>,
    /// Override the discovered token endpoint.
    pub token_url: Option<String>,
    /// Space-separated scopes requested.
    pub scope: Option<String>,
    /// Pre-registered client id. If unset, attempt RFC 7591 dynamic registration.
    pub client_id: Option<String>,
    /// Pre-registered client secret (confidential clients only).
    pub client_secret: Option<String>,
    /// Override redirect URI; defaults to `http://127.0.0.1:<random>/callback`.
    pub redirect_uri: Option<String>,
}

/// Which transport to speak, plus its endpoint parameters.
#[derive(Debug, Clone)]
pub enum TransportConfig {
    /// Child process speaking JSON-RPC over stdin/stdout.
    Stdio {
        command: String,
        args: Vec<String>,
        env: HashMap<String, String>,
    },
    /// Long-lived Server-Sent Events stream + POST for outbound requests.
    Sse {
        url: String,
        headers: HashMap<String, String>,
    },
    /// Streamable HTTP per the MCP 2025-06-18 spec, with sticky `Mcp-Session-Id`
    /// and optional OAuth (PKCE) on first 401.
    Http {
        url: String,
        headers: HashMap<String, String>,
        oauth: Option<OAuthConfig>,
    },
}

impl TransportConfig {
    /// Short string for logging.
    pub fn kind(&self) -> &'static str {
        match self {
            TransportConfig::Stdio { .. } => "stdio",
            TransportConfig::Sse { .. } => "sse",
            TransportConfig::Http { .. } => "http",
        }
    }
}

/// Per-operation timeouts + framing limits for one MCP connection.
#[derive(Debug, Clone)]
pub struct McpTimeouts {
    /// Timeout for the initialize handshake (default: 30s).
    pub initialize: Duration,
    /// Timeout for listing tools (default: 10s).
    pub list_tools: Duration,
    /// Timeout for executing a tool call (default: 120s — tool calls can be slow).
    pub call_tool: Duration,
    /// Timeout for health-check pings (default: 5s).
    pub health_check: Duration,
    /// Optional cap on a single accumulated SSE/HTTP frame, in bytes. `None`
    /// (the default) is unbounded, matching the original CLI behavior exactly.
    /// Hosts that want hardening (desktop) can set a ceiling; when a frame's
    /// buffer exceeds it before a frame boundary, the read fails instead of
    /// growing without bound.
    pub max_frame_bytes: Option<usize>,
}

impl Default for McpTimeouts {
    fn default() -> Self {
        Self {
            initialize: Duration::from_secs(30),
            list_tools: Duration::from_secs(10),
            call_tool: Duration::from_secs(120),
            health_check: Duration::from_secs(5),
            max_frame_bytes: None,
        }
    }
}
