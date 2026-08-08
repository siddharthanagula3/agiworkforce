//! Network hardening helpers for remote MCP transports.
//!
//! Ported from the desktop transport's `validate_mcp_server_url` (Wave 5 stage
//! d2) so the SSRF posture survives the transport swap onto this crate.
//! Enforcement is opt-in via [`crate::McpTimeouts::validate_urls`] — the CLI
//! keeps its original behavior (LAN MCP servers reachable) unless a host turns
//! the knob on.

use anyhow::{Result, bail};

/// Validate an MCP server URL to prevent SSRF against private networks.
///
/// Blocks requests to private/link-local IP ranges and IPv6-mapped IPv4.
/// Loopback addresses (127.0.0.0/8, ::1, localhost) are allowed because MCP
/// servers commonly run locally. Numeric-only hostnames (decimal-IP
/// obfuscation like `2130706433`) are blocked.
pub fn validate_server_url(url: &str) -> Result<()> {
    let parsed = match reqwest::Url::parse(url) {
        Ok(p) => p,
        Err(e) => bail!("Invalid MCP server URL: {e}"),
    };

    let host = parsed.host_str().unwrap_or("");

    // IPv6 hosts serialize with brackets in host_str().
    let v6_candidate = host.strip_prefix('[').and_then(|h| h.strip_suffix(']'));

    if let Some(v6_str) = v6_candidate {
        if let Ok(v6) = v6_str.parse::<std::net::Ipv6Addr>() {
            if v6.is_loopback() {
                return Ok(());
            }
            let segments = v6.segments();
            // fe80::/10 (link-local)
            let is_link_local = (segments[0] & 0xffc0) == 0xfe80;
            // fc00::/7 (unique local)
            let is_unique_local = (segments[0] & 0xfe00) == 0xfc00;
            // IPv6-mapped IPv4 (::ffff:x.x.x.x)
            let is_ipv4_mapped = segments[0..5] == [0, 0, 0, 0, 0] && segments[5] == 0xffff;
            if is_link_local || is_unique_local || is_ipv4_mapped {
                bail!(
                    "SSRF protection: private/link-local/mapped IPv6 address {v6} is not allowed for remote MCP servers"
                );
            }
            return Ok(());
        }
    }

    if let Ok(v4) = host.parse::<std::net::Ipv4Addr>() {
        if v4.is_loopback() {
            return Ok(());
        }
        if v4.is_private() || v4.is_link_local() {
            bail!(
                "SSRF protection: private/link-local IP address {v4} is not allowed for remote MCP servers"
            );
        }
        if v4.is_unspecified() {
            bail!("SSRF protection: unspecified address 0.0.0.0 is not allowed");
        }
        return Ok(());
    }

    // Domain host.
    if host == "localhost" {
        return Ok(());
    }
    if !host.is_empty() && host.chars().all(|c| c.is_ascii_digit()) {
        bail!(
            "SSRF protection: numeric hostname '{host}' is not allowed (potential IP obfuscation)"
        );
    }

    Ok(())
}

/// Enforce HTTPS for non-loopback URLs (desktop parity: cleartext HTTP is
/// allowed only for local MCP servers, so credentials cannot transit a network
/// unencrypted).
pub fn enforce_https_for_remote(url: &str) -> Result<()> {
    if !url.starts_with("http://") {
        return Ok(());
    }
    let parsed = match reqwest::Url::parse(url) {
        Ok(p) => p,
        Err(e) => bail!("Invalid MCP server URL: {e}"),
    };
    let host = parsed.host_str().unwrap_or("");
    if !host_is_loopback(host) {
        bail!(
            "Refusing to connect to non-localhost HTTP URL '{host}'. Remote MCP servers must use HTTPS."
        );
    }
    Ok(())
}

/// True when `host` names the local machine.
fn host_is_loopback(host: &str) -> bool {
    host == "localhost"
        || host == "127.0.0.1"
        || host == "::1"
        || host == "[::1]"
        || host
            .parse::<std::net::Ipv4Addr>()
            .map(|v4| v4.is_loopback())
            .unwrap_or(false)
}

/// Decide whether a transport may skip TLS certificate verification.
///
/// WHY THIS LIVES HERE. `danger_accept_invalid_certs(true)` is called in
/// `transport/http.rs` and `transport/sse.rs` whenever [`crate::McpTimeouts`]
/// carries `verify_tls: false`. The only guard against that was in the DESKTOP
/// caller (`apps/desktop/src-tauri/src/core/mcp/transport.rs`, SEV-DESK-07) —
/// far away from the code that performs the dangerous action, and invisible to
/// any other caller. The CLI happens to pass `McpTimeouts::default()`
/// (`verify_tls: true`), so nothing is exploitable today, but the safety
/// property held only by luck and by a guard in a different crate. One new
/// caller, or one new config knob, and TLS silently downgrades.
///
/// The policy is the desktop's, moved to where it is actually enforceable:
///
/// - Release builds refuse `verify_tls: false` for ANY host. A malicious or
///   mistaken config file must not be able to downgrade TLS on a shipped
///   binary, regardless of what it points at.
/// - Debug builds allow it for loopback only, so a developer can run a local
///   MCP server behind a self-signed certificate without disabling the check
///   for the whole internet.
///
/// The desktop's own check stays where it is; it is now defence in depth
/// rather than the sole barrier.
pub fn enforce_tls_verification_policy(url: &str, verify_tls: bool) -> Result<()> {
    if verify_tls {
        return Ok(());
    }

    #[cfg(not(debug_assertions))]
    {
        let _ = url;
        bail!(
            "TLS certificate verification cannot be disabled in release builds. \
             Use a properly-signed certificate, or a loopback server in a debug build."
        );
    }

    #[cfg(debug_assertions)]
    {
        let host = reqwest::Url::parse(url)
            .ok()
            .and_then(|parsed| parsed.host_str().map(str::to_owned))
            .unwrap_or_default();
        if !host_is_loopback(&host) {
            bail!(
                "Refusing to disable TLS certificate verification for non-loopback host '{host}'. \
                 It is permitted only for localhost, and only in debug builds."
            );
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ok(url: &str) {
        assert!(validate_server_url(url).is_ok(), "{url} should be allowed");
    }

    fn blocked(url: &str, needle: &str) {
        let err = validate_server_url(url).expect_err(&format!("{url} should be blocked"));
        let msg = format!("{err:#}");
        assert!(msg.contains(needle), "{url}: unexpected error: {msg}");
    }

    #[test]
    fn loopback_allowed() {
        ok("http://127.0.0.1:8080/");
        ok("http://127.1.2.3/");
        ok("http://localhost:3000/sse");
        ok("http://[::1]:9000/");
    }

    #[test]
    fn public_hosts_allowed() {
        ok("https://mcp.example.com/");
        ok("https://8.8.8.8/");
        ok("https://[2001:4860:4860::8888]/");
    }

    #[test]
    fn private_ipv4_blocked() {
        blocked("http://192.168.1.10:8080/", "SSRF protection");
        blocked("http://10.0.0.5/", "SSRF protection");
        blocked("http://172.16.4.2/", "SSRF protection");
        blocked("http://169.254.169.254/", "SSRF protection");
    }

    #[test]
    fn unspecified_ipv4_blocked() {
        blocked("http://0.0.0.0:8080/", "0.0.0.0");
    }

    #[test]
    fn private_ipv6_blocked() {
        blocked("http://[fe80::1]/", "SSRF protection");
        blocked("http://[fc00::1]/", "SSRF protection");
        blocked("http://[fd12:3456::1]/", "SSRF protection");
        blocked("http://[::ffff:192.168.1.1]/", "SSRF protection");
    }

    #[test]
    fn decimal_ip_hosts_normalize_and_get_ip_rules() {
        // The WHATWG URL parser (used by desktop's validator too) normalizes
        // pure-decimal hosts into IPv4 before our checks run, so the decoded
        // address is what gets evaluated: 2130706433 = 127.0.0.1 (loopback,
        // allowed), 3232235777 = 192.168.1.1 (private, blocked). The explicit
        // numeric-hostname branch stays as defense-in-depth for inputs the
        // parser leaves as domains.
        ok("http://2130706433/");
        blocked("http://3232235777/", "SSRF protection");
    }

    #[test]
    fn invalid_url_rejected() {
        blocked("not a url", "Invalid MCP server URL");
    }

    #[test]
    fn https_enforcement_allows_loopback_http() {
        assert!(enforce_https_for_remote("http://localhost:8080/").is_ok());
        assert!(enforce_https_for_remote("http://127.0.0.1:8080/").is_ok());
        assert!(enforce_https_for_remote("http://[::1]:8080/").is_ok());
        assert!(enforce_https_for_remote("https://mcp.example.com/").is_ok());
    }

    #[test]
    fn https_enforcement_blocks_cleartext_remote() {
        let err = enforce_https_for_remote("http://mcp.example.com/").unwrap_err();
        assert!(format!("{err:#}").contains("must use HTTPS"));
    }

    #[test]
    fn tls_policy_is_a_no_op_when_verification_stays_on() {
        // The overwhelmingly common case must cost nothing and never fail,
        // including for hosts the policy would otherwise reject.
        assert!(enforce_tls_verification_policy("https://mcp.example.com/", true).is_ok());
        assert!(enforce_tls_verification_policy("http://127.0.0.1:8080/", true).is_ok());
        assert!(enforce_tls_verification_policy("not a url", true).is_ok());
    }

    #[test]
    fn tls_policy_refuses_a_remote_downgrade() {
        // Release: refused for every host. Debug: refused for non-loopback.
        // Either way this URL must never reach danger_accept_invalid_certs.
        let err = enforce_tls_verification_policy("https://mcp.example.com/", false).unwrap_err();
        let rendered = format!("{err:#}");
        assert!(
            rendered.contains("cannot be disabled in release builds")
                || rendered.contains("non-loopback host"),
            "unexpected refusal message: {rendered}"
        );
    }

    #[test]
    fn tls_policy_refuses_an_unparseable_url_rather_than_defaulting_open() {
        // A URL we cannot resolve a host from must fail closed. Under the
        // debug branch the host resolves to "", which is not loopback.
        assert!(enforce_tls_verification_policy("://malformed", false).is_err());
    }

    #[cfg(debug_assertions)]
    #[test]
    fn tls_policy_allows_loopback_in_debug_builds_only() {
        // The developer affordance: a local MCP server behind a self-signed
        // certificate. Deliberately not compiled into release builds, where
        // the refusal above is unconditional.
        for url in [
            "https://localhost:8443/",
            "https://127.0.0.1:8443/",
            "https://[::1]:8443/",
        ] {
            assert!(
                enforce_tls_verification_policy(url, false).is_ok(),
                "{url} should be permitted in a debug build"
            );
        }
    }

    #[cfg(not(debug_assertions))]
    #[test]
    fn tls_policy_refuses_loopback_too_in_release_builds() {
        assert!(enforce_tls_verification_policy("https://localhost:8443/", false).is_err());
    }
}
