//! Public error type for the MCP client.
//!
//! Internally the transport paths use `anyhow` so the exact context strings
//! that [`crate::client`]'s connection-error classifier matches on stay
//! byte-for-byte identical to the CLI original. [`McpError`] is the typed
//! public boundary; it is transparent over the underlying `anyhow` chain so
//! callers that work in `anyhow` (both shipping binaries do) keep the full
//! message via `?`.

use thiserror::Error;

/// Error returned by the public [`crate::client::McpClient`] surface.
#[derive(Debug, Error)]
pub enum McpError {
    /// Any transport / protocol / OAuth failure. Wraps the internal `anyhow`
    /// chain so the message and `{:#}` context are preserved unchanged.
    #[error(transparent)]
    Transport(#[from] anyhow::Error),
}

impl McpError {
    /// Borrow the underlying error chain (useful for host-side classification).
    pub fn as_anyhow(&self) -> &anyhow::Error {
        match self {
            McpError::Transport(e) => e,
        }
    }
}
