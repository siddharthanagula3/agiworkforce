//! SSRF protection and security helpers for A2A endpoints.

use std::net::{IpAddr, ToSocketAddrs};
use std::sync::atomic::{AtomicBool, Ordering};

use anyhow::{bail, Context, Result};

static PRIVATE_OVERRIDE_WARNED: AtomicBool = AtomicBool::new(false);

/// Validate that an A2A endpoint URL is safe to contact.
///
/// Rejects RFC1918 private ranges, link-local, loopback, unique-local, and
/// IMDS (169.254.169.254). Set `AGI_A2A_ALLOW_PRIVATE=1` to bypass for local
/// development — a one-time warning is printed to stderr.
pub fn validate_a2a_endpoint(url: &str) -> Result<()> {
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
    let addrs: Vec<IpAddr> = format!("{host}:{port}")
        .to_socket_addrs()
        .with_context(|| format!("could not resolve A2A host: {host}"))?
        .map(|s| s.ip())
        .collect();

    for ip in addrs {
        if is_private_ip(&ip) {
            if std::env::var("AGI_A2A_ALLOW_PRIVATE").as_deref() == Ok("1") {
                if !PRIVATE_OVERRIDE_WARNED.swap(true, Ordering::Relaxed) {
                    eprintln!(
                        "  [a2a] WARNING: AGI_A2A_ALLOW_PRIVATE=1 — SSRF protection disabled (development only)"
                    );
                }
                return Ok(());
            }
            bail!(
                "A2A endpoint resolves to a private/restricted IP ({ip}), which is not allowed. \
                 Set AGI_A2A_ALLOW_PRIVATE=1 to override for local development."
            );
        }
    }

    Ok(())
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
pub fn generate_random_token(byte_length: usize) -> String {
    use sha2::{Digest, Sha256};

    let mut hasher = Sha256::new();
    for _ in 0..((byte_length / 16) + 2) {
        hasher.update(uuid::Uuid::new_v4().as_bytes());
    }
    let hash = hasher.finalize();
    let hex: String = hash.iter().map(|b| format!("{:02x}", b)).collect();
    hex[..std::cmp::min(byte_length * 2, hex.len())].to_string()
}

