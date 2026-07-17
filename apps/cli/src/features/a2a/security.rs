//! SSRF protection and security helpers for A2A endpoints.

use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use std::sync::atomic::{AtomicBool, Ordering};

use anyhow::{bail, Context, Result};

static PRIVATE_OVERRIDE_WARNED: AtomicBool = AtomicBool::new(false);

/// Validate that an A2A endpoint URL is safe to contact, returning the host and
/// the validated socket addresses it resolved to.
///
/// Rejects RFC1918 private ranges, link-local, loopback, unique-local, and
/// IMDS (169.254.169.254). Set `AGI_A2A_ALLOW_PRIVATE=1` to bypass for local
/// development — a one-time warning is printed to stderr.
///
/// Callers that go on to make an HTTP request MUST pin their client to the
/// returned addresses (see [`a2a_pinned_client`]); otherwise reqwest re-resolves
/// the host at connect time and a malicious DNS server can rebind it to a
/// private IP *after* this check passes (check-then-use / DNS rebinding).
pub fn validate_a2a_endpoint_resolved(url: &str) -> Result<(String, Vec<SocketAddr>)> {
    let parsed = url
        .parse::<reqwest::Url>()
        .with_context(|| format!("invalid A2A endpoint URL: {url}"))?;

    match parsed.scheme() {
        "http" | "https" => {}
        scheme => bail!("A2A endpoint scheme must be http or https, got: {scheme}"),
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| anyhow::anyhow!("A2A endpoint has no host: {url}"))?;

    let port = parsed.port_or_known_default().unwrap_or(80);
    let addrs: Vec<SocketAddr> = format!("{host}:{port}")
        .to_socket_addrs()
        .with_context(|| format!("could not resolve A2A host: {host}"))?
        .collect();

    let allow_private = std::env::var("AGI_A2A_ALLOW_PRIVATE").as_deref() == Ok("1");
    for sa in &addrs {
        if is_private_ip(&sa.ip()) {
            if allow_private {
                if !PRIVATE_OVERRIDE_WARNED.swap(true, Ordering::Relaxed) {
                    eprintln!(
                        "  [a2a] WARNING: AGI_A2A_ALLOW_PRIVATE=1 — SSRF protection disabled (development only)"
                    );
                }
                return Ok((host.to_string(), addrs));
            }
            bail!(
                "A2A endpoint resolves to a private/restricted IP ({}), which is not allowed. \
                 Set AGI_A2A_ALLOW_PRIVATE=1 to override for local development.",
                sa.ip()
            );
        }
    }

    Ok((host.to_string(), addrs))
}

/// Validate that an A2A endpoint URL is safe to contact (discarding the resolved
/// addresses). Prefer [`a2a_pinned_client`] when you will make a request.
pub fn validate_a2a_endpoint(url: &str) -> Result<()> {
    validate_a2a_endpoint_resolved(url).map(|_| ())
}

/// Validate `url` and build a reqwest client whose DNS resolution for the host
/// is PINNED to the validated addresses, closing the SSRF DNS-rebinding gap
/// between the check and the connect. TLS SNI / `Host` still use the original
/// hostname, so certificate validation is unaffected.
pub fn a2a_pinned_client(url: &str, timeout_secs: u64) -> Result<reqwest::Client> {
    let (host, addrs) = validate_a2a_endpoint_resolved(url)?;
    let mut builder =
        reqwest::Client::builder().timeout(std::time::Duration::from_secs(timeout_secs));
    if !addrs.is_empty() {
        builder = builder.resolve_to_addrs(&host, &addrs);
    }
    builder
        .build()
        .context("failed to build pinned A2A HTTP client")
}

pub fn is_private_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let octets = v4.octets();
            octets[0] == 127
                || octets[0] == 10
                || (octets[0] == 172 && (16..=31).contains(&octets[1]))
                || (octets[0] == 192 && octets[1] == 168)
                || (octets[0] == 169 && octets[1] == 254)
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || (v6.segments()[0] & 0xffc0) == 0xfe80
                || (v6.segments()[0] & 0xfe00) == 0xfc00
        }
    }
}

/// Constant-time byte comparison to prevent timing-based token extraction.
pub fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut result = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        result |= x ^ y;
    }
    result == 0
}

/// Constant-time string comparison (pub for use by sibling modules such as `a2a_ws`).
pub fn constant_time_eq_str(a: &str, b: &str) -> bool {
    constant_time_eq(a.as_bytes(), b.as_bytes())
}

/// Generate a cryptographically random hex token of the given byte length.
///
/// Draws `byte_length` bytes directly from the OS-seeded CSPRNG
/// (`rand::rng()` / `ThreadRng`) and hex-encodes them, yielding a
/// `byte_length * 2`-character lowercase hex string. This is the standard
/// construction for an authentication secret — deriving the token by hashing
/// UUID v4 bytes adds no entropy and is a non-standard, harder-to-audit shape.
pub fn generate_random_token(byte_length: usize) -> String {
    use rand::RngCore;

    let mut bytes = vec![0u8; byte_length];
    rand::rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}
