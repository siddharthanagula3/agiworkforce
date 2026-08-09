//! Host-authoritative destination policy for outbound HTTP.
//!
//! The desktop WebView is confined by a CSP `connect-src` allowlist, but that
//! allowlist only governs requests issued by renderer JavaScript. Anything the
//! renderer hands to the Rust process — an `invoke()`d command, an LLM tool
//! call — leaves the machine from outside the WebView, where the CSP has no
//! reach. The destination therefore has to be judged in Rust, and it has to be
//! judged the same way on every surface, so this module owns that judgement:
//! `tool_guard` (LLM and MCP tool calls) and `sys::commands::api`
//! (renderer-supplied URLs) both call it rather than keeping private copies.
//!
//! What it decides is the DESTINATION only — whether the host is reachable on
//! the public internet. It does not authenticate the caller, does not
//! rate-limit, does not inspect the payload, and it cannot stop DNS rebinding:
//! a name that resolves to a public address here and a private one at connect
//! time still connects. Closing that needs connect-time address pinning or an
//! OS-level firewall, neither of which exists yet.

use std::fmt;
use std::net::{Ipv4Addr, Ipv6Addr};

/// Why a destination was refused.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EgressDenial {
    /// The string does not parse as an absolute URL.
    InvalidUrl(String),
    /// Scheme other than `http`/`https` (`file:`, `ftp:`, custom handlers).
    UnsupportedScheme(String),
    /// Host resolves to, or literally names, an address that is not routable on
    /// the public internet — loopback, private, link-local (cloud metadata),
    /// CGNAT, multicast, or reserved.
    InternalDestination(String),
    /// URL carries no host at all (`http:///path`).
    MissingHost(String),
}

impl fmt::Display for EgressDenial {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            EgressDenial::InvalidUrl(url) => write!(f, "Invalid URL format: {url}"),
            EgressDenial::UnsupportedScheme(scheme) => {
                write!(f, "Unsupported URL scheme: {scheme} (expected http or https)")
            }
            EgressDenial::InternalDestination(host) => write!(
                f,
                "Destination {host} is not reachable on the public internet and is blocked by the egress policy"
            ),
            EgressDenial::MissingHost(url) => write!(f, "URL has no host: {url}"),
        }
    }
}

impl std::error::Error for EgressDenial {}

/// Judge one outbound destination.
///
/// Accepts `http`/`https` URLs whose host is a public-internet destination.
/// Rejects everything else, including every spelling of an internal address
/// that `url::Url` canonicalizes (decimal `http://2130706433/`, hex
/// `http://0x7f000001/`, IPv4-in-IPv6 `[::ffff:169.254.169.254]`, NAT64).
pub fn ensure_public_http_destination(url: &str) -> Result<(), EgressDenial> {
    let parsed = url::Url::parse(url).map_err(|_| EgressDenial::InvalidUrl(url.to_string()))?;

    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(EgressDenial::UnsupportedScheme(scheme.to_string()));
    }

    let Some(host) = parsed.host_str() else {
        return Err(EgressDenial::MissingHost(url.to_string()));
    };

    match parsed.host() {
        Some(url::Host::Ipv4(ip)) => {
            if is_internal_ipv4(ip) {
                return Err(EgressDenial::InternalDestination(host.to_string()));
            }
        }
        Some(url::Host::Ipv6(ip)) => {
            if is_internal_ipv6(ip) {
                return Err(EgressDenial::InternalDestination(host.to_string()));
            }
        }
        Some(url::Host::Domain(domain)) => {
            if is_loopback_name(domain) {
                return Err(EgressDenial::InternalDestination(host.to_string()));
            }
            // A name whose leading labels spell a dotted quad (`10.0.0.1.nip.io`)
            // is a rebinding shortcut to that address; judge it by the address.
            if let Some(ip) = leading_ipv4_literal(domain) {
                if is_internal_ipv4(ip) {
                    return Err(EgressDenial::InternalDestination(host.to_string()));
                }
            }
        }
        None => return Err(EgressDenial::MissingHost(url.to_string())),
    }

    Ok(())
}

/// True for hostnames that name the local machine rather than an address.
/// `localhost` is the reserved name (RFC 6761) and `.localhost` its reserved
/// suffix; `localhost.<something>` is kept out for the same reason the previous
/// tool-guard denylist kept it out — it reads as the local machine to a user
/// approving a tool call.
pub(crate) fn is_loopback_name(domain: &str) -> bool {
    let lower = domain.to_ascii_lowercase();
    lower == "localhost" || lower.ends_with(".localhost") || lower.starts_with("localhost.")
}

/// True when an IPv4 address is not routable on the public internet.
/// Kept in lockstep with the web egress policy (`apps/web/lib/egress-policy.ts`),
/// which is the reference list for what counts as internal.
pub(crate) fn is_internal_ipv4(ip: Ipv4Addr) -> bool {
    let [a, b, _, _] = ip.octets();
    ip.is_loopback() // 127.0.0.0/8
        || ip.is_private() // 10/8, 172.16/12, 192.168/16
        || ip.is_link_local() // 169.254/16 — cloud metadata (IMDS)
        || ip.is_broadcast()
        || ip.is_documentation()
        || a == 0 // 0.0.0.0/8 — "this network"; most stacks route it to the local host
        || (a == 100 && (64..=127).contains(&b)) // 100.64/10 CGNAT — carrier and mesh-VPN peers
        || a >= 224 // 224/4 multicast + 240/4 reserved
}

/// True when an IPv6 address is not routable on the public internet. IPv4 riding
/// inside IPv6 (mapped, compatible, or NAT64) is judged as the IPv4 address it carries,
/// so `::ffff:169.254.169.254` cannot smuggle a metadata request past the guard.
pub(crate) fn is_internal_ipv6(ip: Ipv6Addr) -> bool {
    if let Some(v4) = ip.to_ipv4() {
        return is_internal_ipv4(v4);
    }
    let seg = ip.segments();
    if seg[0] == 0x0064 && seg[1] == 0xff9b {
        let v4 = Ipv4Addr::new(
            (seg[6] >> 8) as u8,
            (seg[6] & 0xff) as u8,
            (seg[7] >> 8) as u8,
            (seg[7] & 0xff) as u8,
        );
        return is_internal_ipv4(v4);
    }
    ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_multicast()
        || (seg[0] & 0xfe00) == 0xfc00 // fc00::/7 unique local
        || (seg[0] & 0xffc0) == 0xfe80 // fe80::/10 link-local
}

/// Reads a dotted quad off the front of a hostname (`10.0.0.1.nip.io`), if present.
pub(crate) fn leading_ipv4_literal(domain: &str) -> Option<Ipv4Addr> {
    let mut labels = domain.split('.');
    let quad = [
        labels.next()?,
        labels.next()?,
        labels.next()?,
        labels.next()?,
    ]
    .join(".");
    quad.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_internal_ipv4_literals() {
        for url in [
            "http://127.0.0.1/",
            "http://10.0.0.5/",
            "http://172.20.1.1/",
            "http://192.168.1.1/",
            "http://169.254.169.254/latest/meta-data/",
            "http://100.100.100.200/",
            "http://0.1.2.3/",
            "http://224.0.0.1/",
            "http://255.255.255.255/",
        ] {
            assert!(
                matches!(
                    ensure_public_http_destination(url),
                    Err(EgressDenial::InternalDestination(_))
                ),
                "{url} must be refused"
            );
        }
    }

    #[test]
    fn rejects_alternate_encodings_and_local_names() {
        for url in [
            "http://2130706433/",
            "http://0x7f000001/",
            "http://[::1]/",
            "http://[fe80::1]/",
            "http://[::ffff:169.254.169.254]/",
            "http://[64:ff9b::a9fe:a9fe]/",
            "http://10.0.0.1.nip.io/",
            "http://localhost:11434/api/tags",
            "http://LOCALHOST:3000/",
            "http://api.localhost/",
        ] {
            assert!(
                matches!(
                    ensure_public_http_destination(url),
                    Err(EgressDenial::InternalDestination(_))
                ),
                "{url} must be refused"
            );
        }
    }

    #[test]
    fn rejects_non_http_schemes() {
        for url in [
            "file:///etc/passwd",
            "ftp://example.com/",
            "data:text/plain,x",
        ] {
            assert!(
                matches!(
                    ensure_public_http_destination(url),
                    Err(EgressDenial::UnsupportedScheme(_)) | Err(EgressDenial::InvalidUrl(_))
                ),
                "{url} must be refused"
            );
        }
    }

    #[test]
    fn allows_public_destinations() {
        for url in [
            "https://api.agiworkforce.com/v1/models",
            "https://8.8.8.8/",
            "https://fcc.gov/",
            "https://fdic.gov/",
            "https://[2606:4700::1111]/",
        ] {
            assert!(
                ensure_public_http_destination(url).is_ok(),
                "{url} must reach the public internet"
            );
        }
    }
}

