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
/// development, a one-time warning is printed to stderr.
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
                        "  [a2a] WARNING: AGI_A2A_ALLOW_PRIVATE=1, SSRF protection disabled (development only)"
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
///
/// The client also refuses to follow redirects: pinning only covers the host
/// that was validated, so a peer answering `302 Location: http://169.254.169.254/`
/// would otherwise walk the connection straight past this allowlist. Callers
/// see the 3xx as a non-success response and surface it as an error.
pub fn a2a_pinned_client(url: &str, timeout_secs: u64) -> Result<reqwest::Client> {
    let (host, addrs) = validate_a2a_endpoint_resolved(url)?;
    build_pinned_client(&host, &addrs, timeout_secs)
}

fn build_pinned_client(
    host: &str,
    addrs: &[SocketAddr],
    timeout_secs: u64,
) -> Result<reqwest::Client> {
    let mut builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .redirect(reqwest::redirect::Policy::none());
    if !addrs.is_empty() {
        builder = builder.resolve_to_addrs(host, addrs);
    }
    builder
        .build()
        .context("failed to build pinned A2A HTTP client")
}

pub fn is_private_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let octets = v4.octets();
            octets[0] == 0
                || octets[0] == 127
                || octets[0] == 10
                || (octets[0] == 172 && (16..=31).contains(&octets[1]))
                || (octets[0] == 192 && octets[1] == 168)
                || (octets[0] == 169 && octets[1] == 254)
                || (octets[0] == 100 && (64..=127).contains(&octets[1]))
                || (octets[0] == 192 && octets[1] == 0 && octets[2] == 0)
                || (octets[0] == 198 && (18..=19).contains(&octets[1]))
                || octets[0] >= 224
        }
        IpAddr::V6(v6) => {
            let segments = v6.segments();
            if let Some(embedded) = embedded_ipv4(&segments) {
                return is_private_ip(&IpAddr::V4(embedded));
            }
            v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                || (segments[0] & 0xffc0) == 0xfe80
                || (segments[0] & 0xfe00) == 0xfc00
        }
    }
}

/// Extract the IPv4 address carried by a v4-mapped (`::ffff:0:0/96`) or NAT64
/// (`64:ff9b::/96`) address so the v4 blocklist applies to it too, otherwise
/// `::ffff:169.254.169.254` reaches IMDS through the v6 branch untouched.
fn embedded_ipv4(segments: &[u16; 8]) -> Option<std::net::Ipv4Addr> {
    let is_v4_mapped = segments[0..5] == [0, 0, 0, 0, 0] && segments[5] == 0xffff;
    let is_nat64 = segments[0] == 0x0064 && segments[1] == 0xff9b && segments[2..6] == [0, 0, 0, 0];
    if !is_v4_mapped && !is_nat64 {
        return None;
    }
    Some(std::net::Ipv4Addr::new(
        (segments[6] >> 8) as u8,
        segments[6] as u8,
        (segments[7] >> 8) as u8,
        segments[7] as u8,
    ))
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
/// construction for an authentication secret, deriving the token by hashing
/// UUID v4 bytes adds no entropy and is a non-standard, harder-to-audit shape.
pub fn generate_random_token(byte_length: usize) -> String {
    use rand::RngCore;

    let mut bytes = vec![0u8; byte_length];
    rand::rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;
    use std::str::FromStr;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    async fn serve_once(response: String) -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            if let Ok((mut stream, _)) = listener.accept().await {
                let mut scratch = [0u8; 1024];
                let _ = stream.read(&mut scratch).await;
                let _ = stream.write_all(response.as_bytes()).await;
                let _ = stream.flush().await;
            }
        });
        port
    }

    #[tokio::test]
    async fn a_pinned_client_refuses_to_follow_a_redirect() {
        let secret_port = serve_once(
            "HTTP/1.1 200 OK\r\nContent-Length: 6\r\nConnection: close\r\n\r\nSECRET".to_string(),
        )
        .await;
        let redirect_port = serve_once(format!(
            "HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:{secret_port}/\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        ))
        .await;

        let client = build_pinned_client("127.0.0.1", &[], 5).unwrap();
        let resp = client
            .get(format!("http://127.0.0.1:{redirect_port}/a2a/card"))
            .send()
            .await
            .unwrap();

        assert_eq!(resp.status().as_u16(), 302, "redirect was followed");
        let body = resp.text().await.unwrap_or_default();
        assert!(!body.contains("SECRET"), "redirect target body was fetched");
    }

    #[test]
    fn is_private_ip_covers_the_full_reserved_ipv4_space() {
        for blocked in [
            "0.0.0.0",
            "0.1.2.3",
            "127.0.0.1",
            "10.1.2.3",
            "172.20.0.1",
            "192.168.0.1",
            "169.254.169.254",
            "100.64.0.1",
            "100.127.255.254",
            "192.0.0.1",
            "198.18.0.1",
            "198.19.255.255",
            "224.0.0.1",
            "255.255.255.255",
        ] {
            assert!(
                is_private_ip(&IpAddr::from_str(blocked).unwrap()),
                "{blocked} was treated as public"
            );
        }
        for allowed in ["1.1.1.1", "8.8.8.8", "100.63.255.255", "198.20.0.1"] {
            assert!(
                !is_private_ip(&IpAddr::from_str(allowed).unwrap()),
                "{allowed} was treated as private"
            );
        }
    }

    #[test]
    fn is_private_ip_covers_mapped_and_nat64_ipv6_forms() {
        for blocked in [
            "::",
            "::1",
            "fe80::1",
            "fc00::1",
            "ff02::1",
            "::ffff:169.254.169.254",
            "::ffff:127.0.0.1",
            "64:ff9b::169.254.169.254",
        ] {
            assert!(
                is_private_ip(&IpAddr::from_str(blocked).unwrap()),
                "{blocked} was treated as public"
            );
        }
        assert!(!is_private_ip(
            &IpAddr::from_str("2001:4860:4860::8888").unwrap()
        ));
    }

    #[test]
    fn embedded_ipv4_ignores_ordinary_ipv6() {
        let ordinary = std::net::Ipv6Addr::from_str("2001:db8::1").unwrap();
        assert!(embedded_ipv4(&ordinary.segments()).is_none());
        let mapped = std::net::Ipv6Addr::from_str("::ffff:10.0.0.1").unwrap();
        assert_eq!(
            embedded_ipv4(&mapped.segments()),
            Some(Ipv4Addr::new(10, 0, 0, 1))
        );
    }
}
