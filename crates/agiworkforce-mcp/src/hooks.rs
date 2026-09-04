//! Host-supplied capabilities the transport-agnostic client depends on.
//!
//! Everything policy-, UI-, or persistence-shaped is injected here so the crate
//! stays free of config files, keychains, browsers, and product identity. Both
//! shipping binaries build a [`ClientHooks`] and hand it to
//! [`McpClient::connect`](crate::client::McpClient::connect).

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::elicitation::SharedElicitationHandler;

/// Client identity sent in the MCP `initialize` handshake's `clientInfo`.
///
/// Held here (not hardcoded) so each host reports its own name/version, the
/// CLI must keep sending `agiworkforce-cli` + its own crate version, not this
/// engine crate's version.
#[derive(Debug, Clone)]
pub struct ClientInfo {
    pub name: String,
    pub version: String,
}

/// One OAuth token record cached for a single MCP server.
///
/// Mirrors the on-disk shape the CLI persists; the host's [`TokenStore`] is
/// responsible for (de)serializing and securing it. The engine only ever holds
/// it in memory for the duration of a request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthToken {
    pub access_token: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    /// Typically "Bearer".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token_type: Option<String>,
    /// Unix epoch seconds when the access_token expires.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    /// AS metadata URL discovered via RFC 9728 (cached for refresh).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_server_metadata_url: Option<String>,
    /// Discovered token endpoint (cached so refresh skips discovery).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token_url: Option<String>,
    /// Dynamically-registered (or pre-supplied) client id (cached for refresh).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
}

impl OAuthToken {
    /// Returns true if `expires_at` is set and within `leeway_secs` of now. A
    /// token without `expires_at` is treated as not-expiring (servers that omit
    /// `expires_in` typically issue long-lived tokens).
    pub fn is_expiring_soon(&self, leeway_secs: u64) -> bool {
        match self.expires_at {
            Some(exp) => {
                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                exp.saturating_sub(leeway_secs) <= now
            }
            None => false,
        }
    }
}

/// Persistence for MCP OAuth tokens, keyed by canonical server URL.
///
/// The CLI's file/keyring stores implement this; the engine never touches disk.
/// Calls are infrequent (only on 401 / proactive refresh), so a load-per-call
/// implementation is fine and matches the original CLI behavior.
pub trait TokenStore: Send + Sync {
    /// Fetch the cached token for `server_url`, if any.
    fn get(&self, server_url: &str) -> Option<OAuthToken>;
    /// Persist `token` for `server_url`, replacing any existing entry.
    fn set(&self, server_url: &str, token: OAuthToken) -> anyhow::Result<()>;
}

/// A process-local, non-persistent [`TokenStore`]. Useful for hosts that don't
/// persist tokens and for the sim harness.
#[derive(Default)]
pub struct InMemoryTokenStore {
    inner: Mutex<HashMap<String, OAuthToken>>,
}

impl InMemoryTokenStore {
    pub fn new() -> Self {
        Self::default()
    }
}

impl TokenStore for InMemoryTokenStore {
    fn get(&self, server_url: &str) -> Option<OAuthToken> {
        self.inner.lock().ok()?.get(server_url).cloned()
    }
    fn set(&self, server_url: &str, token: OAuthToken) -> anyhow::Result<()> {
        self.inner
            .lock()
            .map_err(|_| anyhow::anyhow!("token store mutex poisoned"))?
            .insert(server_url.to_string(), token);
        Ok(())
    }
}

/// The browser-open + interactivity gate for the OAuth authorization-code flow.
///
/// This is a trust-boundary chokepoint: the CLI implementation only launches a
/// browser for an explicitly user-initiated action, and reports interactivity
/// from a real TTY check. The engine never opens a browser on its own.
pub trait BrowserAuthorizer: Send + Sync {
    /// Whether an interactive browser-based auth flow may run right now. A
    /// headless / non-TTY host returns `false` and the engine fails the 401
    /// with a clear "re-run interactively" error instead of hanging.
    fn is_interactive(&self) -> bool;
    /// Open the user's default browser at `url`. Returns `true` iff a browser
    /// was (or, under a test spy, would have been) launched.
    fn open_url(&self, url: &str) -> bool;
}

/// A [`BrowserAuthorizer`] that never opens anything and reports non-interactive.
/// Safe default for headless hosts and non-OAuth connections.
pub struct DenyBrowserAuthorizer;

impl BrowserAuthorizer for DenyBrowserAuthorizer {
    fn is_interactive(&self) -> bool {
        false
    }
    fn open_url(&self, _url: &str) -> bool {
        false
    }
}

/// An operational log sink. The engine keeps its original `eprintln!`
/// diagnostics verbatim; this is an *additional* structured hook for high-level
/// lifecycle events (connect/reconnect/oauth) that hosts can route to `tracing`.
pub type LogSink = Arc<dyn Fn(&str) + Send + Sync>;

/// A no-op [`LogSink`].
pub fn noop_log() -> LogSink {
    Arc::new(|_: &str| {})
}

/// The full bundle of host-supplied capabilities handed to
/// [`McpClient::connect`](crate::client::McpClient::connect). Cheap to clone
/// (all fields are `Arc` or small), so the client keeps a copy and reuses it
/// across reconnects.
#[derive(Clone)]
pub struct ClientHooks {
    /// OAuth token persistence.
    pub token_store: Arc<dyn TokenStore>,
    /// Handler for server-initiated `elicitation/create` requests.
    pub elicitation: SharedElicitationHandler,
    /// Browser-open + interactivity gate for the OAuth flow.
    pub browser: Arc<dyn BrowserAuthorizer>,
    /// Identity reported in the `initialize` handshake.
    pub client_info: ClientInfo,
    /// Structured lifecycle log sink (in addition to the engine's stderr).
    pub on_log: LogSink,
}

impl ClientHooks {
    pub(crate) fn log(&self, msg: &str) {
        (self.on_log)(msg);
    }
}
