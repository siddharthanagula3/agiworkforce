//! Which surface is calling, which build of it, and which contract it speaks.
//! These mirror `packages/contracts/cloud-contracts/src/client-handshake.ts`,
//! and `scripts/check-client-handshake.mjs` fails when the two drift apart.

pub const SURFACE_HEADER: &str = "x-agi-surface";
pub const CLIENT_VERSION_HEADER: &str = "x-agi-client-version";
pub const API_VERSION_HEADER: &str = "x-agi-api-version";

pub const SOURCE_SURFACE: &str = "cli";
pub const API_CONTRACT_VERSION: &str = "2026-09-17";

/// Taken from the crate this binary was compiled from, never a literal.
pub const CLIENT_VERSION: &str = env!("CARGO_PKG_VERSION");

pub fn headers() -> [(&'static str, &'static str); 3] {
    [
        (SURFACE_HEADER, SOURCE_SURFACE),
        (CLIENT_VERSION_HEADER, CLIENT_VERSION),
        (API_VERSION_HEADER, API_CONTRACT_VERSION),
    ]
}

pub fn apply(builder: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    headers()
        .into_iter()
        .fold(builder, |builder, (name, value)| {
            builder.header(name, value)
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_platform_request_names_the_surface_the_build_and_the_contract() {
        let names: Vec<&str> = headers().iter().map(|(name, _)| *name).collect();
        assert_eq!(
            names,
            vec![SURFACE_HEADER, CLIENT_VERSION_HEADER, API_VERSION_HEADER]
        );
    }

    #[test]
    fn the_client_version_is_the_crate_version_and_never_a_literal() {
        assert_eq!(CLIENT_VERSION, env!("CARGO_PKG_VERSION"));
        assert!(!CLIENT_VERSION.is_empty());
    }
}
