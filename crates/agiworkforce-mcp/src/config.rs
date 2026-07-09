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
    /// Legacy HTTP+SSE split-endpoint convention (pre-streamable-HTTP remote
    /// servers; the desktop remote MCP config shape): outbound JSON-RPC goes
    /// via POST to `{base_url}/message`, and an optional long-lived
    /// `GET {base_url}/sse` stream carries server-initiated frames. The GET is
    /// best-effort — servers without an SSE stream keep working POST-only with
    /// inline responses.
    SseLegacy {
        base_url: String,
        headers: HashMap<String, String>,
    },
}

impl TransportConfig {
    /// Short string for logging.
    pub fn kind(&self) -> &'static str {
        match self {
            TransportConfig::Stdio { .. } => "stdio",
            TransportConfig::Sse { .. } => "sse",
            TransportConfig::Http { .. } => "http",
            TransportConfig::SseLegacy { .. } => "sse-legacy",
        }
    }
}

/// Per-operation timeouts + framing limits + network hardening knobs for one
/// MCP connection. All hardening knobs default to the original CLI behavior
/// (off), so `McpTimeouts::default()` is behavior-neutral for existing hosts;
/// desktop turns them on for remote transports.
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
    /// When `true`, remote transport URLs (`Sse`, `Http`, `SseLegacy`) are
    /// validated against SSRF at connect time via
    /// [`crate::security::validate_server_url`]: loopback allowed,
    /// private/link-local/mapped ranges and numeric-domain obfuscation blocked.
    /// Default `false` (CLI parity — LAN MCP servers stay reachable there).
    pub validate_urls: bool,
    /// When `false`, remote transports accept invalid TLS certificates
    /// (`danger_accept_invalid_certs`). Default `true` — verify certificates.
    /// Mirrors the desktop `HttpSseConfig::verify_ssl` knob.
    pub verify_tls: bool,
    /// Optional cap on an inline HTTP response body, enforced via
    /// `Content-Length` before the body is read (a malicious server cannot
    /// exhaust memory with one giant response). `None` (default) is unbounded,
    /// matching the original CLI behavior. Desktop sets 50 MB.
    pub max_response_bytes: Option<u64>,
}

impl Default for McpTimeouts {
    fn default() -> Self {
        Self {
            initialize: Duration::from_secs(30),
            list_tools: Duration::from_secs(10),
            call_tool: Duration::from_secs(120),
            health_check: Duration::from_secs(5),
            max_frame_bytes: None,
            validate_urls: false,
            verify_tls: true,
            max_response_bytes: None,
        }
    }
}
