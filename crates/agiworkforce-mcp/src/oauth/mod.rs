//! OAuth 2.0 for MCP HTTP transports.
//!
//! [`flow`] implements the discovery + grant machinery (RFC 9728 / 8414 / 7591
//! / 6749 / 7636); [`pkce`] holds the S256 primitives. The token *record* and
//! *store* live in [`crate::hooks`] because persistence is host-owned.

pub(crate) mod flow;
mod pkce;

pub use flow::{parse_insufficient_scope, parse_resource_metadata_url};
