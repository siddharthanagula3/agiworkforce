//! Connection configuration for the MCP client.
//!
//! These are the engine's own transport-shaped types. Hosts keep their own
//! config-file/manifest types (the CLI's `McpServerConfig` / `McpOAuthConfig`
//! stay app-local, doing serde and back-compat) and convert into these at
//! connect time.

use std::collections::HashMap;
use std::time::Duration;

#[derive(Debug, Clone, Default)]
pub struct OAuthConfig {
    pub authorize_url: Option<String>,
    pub token_url: Option<String>,
    pub scope: Option<String>,
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
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

    /// The URL the *user* configured for a remote transport, if any.
    ///
    /// This is the trust root for anything a server later names: a POST
    /// endpoint the server pushes over SSE is only usable while it stays on
    /// this origin, because the credential headers below were configured for
    /// this server and no other.
    pub fn remote_url(&self) -> Option<&str> {
        match self {
            TransportConfig::Stdio { .. } => None,
            TransportConfig::Sse { url, .. } | TransportConfig::Http { url, .. } => Some(url),
        }
    }
}

/// Per-operation timeouts + framing limits + network hardening knobs for one
/// MCP connection. The knobs that only widen what this process will *reach*
/// (`validate_urls`) default to the original CLI behavior so LAN MCP servers
/// stay usable; the knobs that bound what a remote server can make this
/// process *allocate* (`max_frame_bytes`, `max_response_bytes`) have a
/// built-in ceiling that applies even when a host leaves them unset.
#[derive(Debug, Clone)]
pub struct McpTimeouts {
    pub initialize: Duration,
    /// Timeout for listing tools (default: 10s).
    pub list_tools: Duration,
    /// Timeout for executing a tool call (default: 120s, tool calls can be slow).
    pub call_tool: Duration,
    /// Timeout for health-check pings (default: 5s).
    pub health_check: Duration,
    /// Cap on a single accumulated SSE/HTTP frame, in bytes. `None` applies
    /// [`DEFAULT_MAX_FRAME_BYTES`]; there is no unbounded setting, because the
    /// bytes are streamed by the remote server and a host that never set this
    /// knob would otherwise buffer them until the process dies. Read it through
    /// [`McpTimeouts::frame_cap`], never as a raw `Option`.
    pub max_frame_bytes: Option<usize>,
    pub max_read_cache_entries: Option<usize>,
    pub max_read_cache_bytes: Option<usize>,
    pub max_read_cache_ttl: Option<Duration>,
    /// When `true`, remote transport URLs are validated against SSRF at connect time via
    /// [`crate::security::validate_server_url`]: loopback allowed,
    /// private/link-local/mapped ranges and numeric-domain obfuscation blocked.
    /// Default `false` (CLI parity, LAN MCP servers stay reachable there).
    pub validate_urls: bool,
    /// When `false`, remote transports accept invalid TLS certificates
    /// (`danger_accept_invalid_certs`). Default `true`, verify certificates.
    /// Mirrors the desktop `HttpSseConfig::verify_ssl` knob.
    pub verify_tls: bool,
    /// Cap on an inline HTTP response body, enforced while the body is read
    /// (`Content-Length` only short-circuits it, a chunked response carries no
    /// length to trust). `None` applies [`DEFAULT_MAX_RESPONSE_BYTES`]; as with
    /// the frame cap there is no unbounded setting. Read it through
    /// [`McpTimeouts::response_cap`].
    pub max_response_bytes: Option<u64>,
    /// Optional TCP connect timeout on the remote-transport reqwest client.
    /// `None` (default) leaves reqwest's default (no connect cap, CLI parity).
    /// Desktop sets 30s.
    pub connect_timeout: Option<Duration>,
    pub sse_read_timeout: Option<Duration>,
}

/// Ceiling applied to one accumulated SSE frame when a host leaves
/// [`McpTimeouts::max_frame_bytes`] unset. Matches the desktop inline-response
/// ceiling so a legitimate large tool result still fits in a single frame.
pub const DEFAULT_MAX_FRAME_BYTES: usize = 50_000_000;

/// Ceiling applied to an inline HTTP/SSE response body when a host leaves
/// [`McpTimeouts::max_response_bytes`] unset (the desktop 50 MB ceiling).
pub const DEFAULT_MAX_RESPONSE_BYTES: u64 = 50_000_000;

pub const DEFAULT_MAX_READ_CACHE_ENTRIES: usize = 128;
pub const DEFAULT_MAX_READ_CACHE_BYTES: usize = 16 * 1024 * 1024;
pub const DEFAULT_MAX_READ_CACHE_TTL: Duration = Duration::from_secs(5 * 60);
pub const READ_CACHE_PRUNE_INTERVAL: Duration = Duration::from_secs(1);

impl McpTimeouts {
    /// The frame ceiling to enforce, whatever the host configured.
    pub fn frame_cap(&self) -> usize {
        self.max_frame_bytes.unwrap_or(DEFAULT_MAX_FRAME_BYTES)
    }

    /// The response-body ceiling to enforce, whatever the host configured.
    pub fn response_cap(&self) -> u64 {
        self.max_response_bytes
            .unwrap_or(DEFAULT_MAX_RESPONSE_BYTES)
    }

    pub fn read_cache_entries_cap(&self) -> usize {
        self.max_read_cache_entries
            .unwrap_or(DEFAULT_MAX_READ_CACHE_ENTRIES)
    }

    pub fn read_cache_bytes_cap(&self) -> usize {
        self.max_read_cache_bytes
            .unwrap_or(DEFAULT_MAX_READ_CACHE_BYTES)
    }

    pub fn read_cache_ttl_cap(&self) -> Duration {
        self.max_read_cache_ttl
            .unwrap_or(DEFAULT_MAX_READ_CACHE_TTL)
    }
}

impl Default for McpTimeouts {
    fn default() -> Self {
        Self {
            initialize: Duration::from_secs(30),
            list_tools: Duration::from_secs(10),
            call_tool: Duration::from_secs(120),
            health_check: Duration::from_secs(5),
            max_frame_bytes: None,
            max_read_cache_entries: None,
            max_read_cache_bytes: None,
            max_read_cache_ttl: None,
            validate_urls: false,
            verify_tls: true,
            max_response_bytes: None,
            connect_timeout: None,
            sse_read_timeout: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unset_byte_caps_still_have_a_ceiling() {
        let t = McpTimeouts::default();
        assert_eq!(t.max_frame_bytes, None);
        assert_eq!(t.frame_cap(), DEFAULT_MAX_FRAME_BYTES);
        assert_eq!(t.response_cap(), DEFAULT_MAX_RESPONSE_BYTES);
    }

    #[test]
    fn host_configured_byte_caps_win() {
        let t = McpTimeouts {
            max_frame_bytes: Some(1024),
            max_response_bytes: Some(2048),
            ..McpTimeouts::default()
        };
        assert_eq!(t.frame_cap(), 1024);
        assert_eq!(t.response_cap(), 2048);
    }

    #[test]
    fn remote_url_names_the_configured_server() {
        assert_eq!(
            TransportConfig::Sse {
                url: "https://mcp.example.com/sse".to_string(),
                headers: HashMap::new(),
            }
            .remote_url(),
            Some("https://mcp.example.com/sse")
        );
        assert_eq!(
            TransportConfig::Http {
                url: "https://mcp.example.com/mcp".to_string(),
                headers: HashMap::new(),
                oauth: None,
            }
            .remote_url(),
            Some("https://mcp.example.com/mcp")
        );
        assert_eq!(
            TransportConfig::Stdio {
                command: "server".to_string(),
                args: Vec::new(),
                env: HashMap::new(),
            }
            .remote_url(),
            None
        );
    }
}
