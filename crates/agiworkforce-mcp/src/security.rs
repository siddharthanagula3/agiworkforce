
use anyhow::{Context, Result, anyhow, bail};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};

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
    let parsed = match reqwest::Url::parse(url) {
        Ok(p) => p,
        Err(e) => bail!("Invalid MCP server URL: {e}"),
    };
    // Scheme comparison must be case-insensitive: `HTTP://evil.example.com/`
    // is cleartext but does not match a literal `http://` prefix test.
    if !parsed.scheme().eq_ignore_ascii_case("http") {
        return Ok(());
    }
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
    let bare = bare_host(host);
    bare == "localhost"
        || bare
            .parse::<IpAddr>()
            .map(|ip| ip.is_loopback())
            .unwrap_or(false)
}

/// `Url::host_str` keeps the brackets on IPv6 literals; every address parse and
/// every `resolve_to_addrs` key needs them gone.
fn bare_host(host: &str) -> String {
    host.strip_prefix('[')
        .and_then(|h| h.strip_suffix(']'))
        .unwrap_or(host)
        .to_string()
}

/// A URL that passed SSRF validation together with the addresses its host
/// resolved to at validation time.
#[derive(Debug, Clone)]
pub struct ValidatedEndpoint {
    pub url: reqwest::Url,
    /// Host without IPv6 brackets, as `reqwest::ClientBuilder::resolve_to_addrs`
    /// expects it.
    pub host: String,
    pub addrs: Vec<SocketAddr>,
}

/// Cap on metadata/token response bodies read from an endpoint whose URL came
/// from a remote party.
pub const MAX_METADATA_BODY_BYTES: usize = 256 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AddrClass {
    Public,
    Loopback,
    SiteLocal(&'static str),
    Forbidden(&'static str),
}

pub async fn resolve_validated_endpoint(url: &str, anchor: &str) -> Result<ValidatedEndpoint> {
    validate_server_url(url)?;
    enforce_https_for_remote(url)?;

    let parsed = reqwest::Url::parse(url).map_err(|e| anyhow!("Invalid MCP server URL: {e}"))?;
    let scheme = parsed.scheme().to_ascii_lowercase();
    if scheme != "http" && scheme != "https" {
        bail!("SSRF protection: scheme '{scheme}' is not allowed for MCP/OAuth endpoints");
    }

    let host = parsed.host_str().unwrap_or_default().to_string();
    if host.is_empty() {
        bail!("SSRF protection: URL '{url}' has no host");
    }
    let port = parsed
        .port_or_known_default()
        .ok_or_else(|| anyhow!("SSRF protection: URL '{url}' has no usable port"))?;

    let bare = bare_host(&host);

    let addrs: Vec<SocketAddr> = match bare.parse::<IpAddr>() {
        Ok(ip) => vec![SocketAddr::new(ip, port)],
        Err(_) => tokio::net::lookup_host((bare.as_str(), port))
            .await
            .with_context(|| format!("resolve host '{bare}'"))?
            .collect(),
    };
    if addrs.is_empty() {
        bail!("SSRF protection: host '{bare}' did not resolve to any address");
    }

    for addr in &addrs {
        ensure_addr_reachable(&bare, addr.ip(), anchor).await?;
    }

    Ok(ValidatedEndpoint {
        url: parsed,
        host: bare,
        addrs,
    })
}

pub fn validate_browser_endpoint(url: &str, anchor: &str) -> Result<()> {
    let parsed =
        reqwest::Url::parse(url).map_err(|e| anyhow!("Invalid OAuth authorization URL: {e}"))?;
    let scheme = parsed.scheme().to_ascii_lowercase();
    if scheme != "http" && scheme != "https" {
        bail!("SSRF protection: scheme '{scheme}' is not allowed for an OAuth authorization URL");
    }
    validate_server_url(url)?;
    enforce_https_for_remote(url)?;

    let host = bare_host(parsed.host_str().unwrap_or_default());
    if host_is_loopback(&host) && !anchor_is_local(anchor) {
        bail!(
            "SSRF protection: authorization URL host '{host}' names this machine, which an MCP server at '{anchor}' may not do"
        );
    }
    Ok(())
}

/// Reject a resolved address the party that named it has no business reaching.
async fn ensure_addr_reachable(host: &str, ip: IpAddr, anchor: &str) -> Result<()> {
    let ip = unmap_ipv4(ip);
    let denial = match classify_addr(ip) {
        AddrClass::Public => return Ok(()),
        AddrClass::Loopback => {
            if anchor_is_local(anchor) {
                return Ok(());
            }
            "loopback"
        }
        AddrClass::SiteLocal(kind) => {
            if anchor_is_local(anchor) || anchor_is_site_local(anchor).await {
                return Ok(());
            }
            kind
        }
        AddrClass::Forbidden(kind) => kind,
    };
    bail!(
        "SSRF protection: host '{host}' resolves to {denial} address {ip}, which is not allowed for remote MCP servers"
    )
}

/// True when the user pointed this client at the local machine by name, so the
/// endpoints that deployment advertises may stay on loopback. Deliberately
/// text-only: resolution is what a rebind attacks.
fn anchor_is_local(anchor: &str) -> bool {
    reqwest::Url::parse(anchor)
        .ok()
        .and_then(|parsed| parsed.host_str().map(bare_host))
        .map(|host| host_is_loopback(&host))
        .unwrap_or(false)
}

/// True when the MCP server the user configured is itself reached at an RFC
/// 1918 / CGNAT / ULA address, which is what makes an on-prem authorization
/// server on the same network legitimate. A rebind cannot abuse this: cleartext
/// to a non-loopback host is already refused, so the fetch is HTTPS and the
/// certificate still has to match the name.
async fn anchor_is_site_local(anchor: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(anchor) else {
        return false;
    };
    let Some(host) = parsed.host_str().map(bare_host) else {
        return false;
    };
    let site_local = |ip: IpAddr| matches!(classify_addr(unmap_ipv4(ip)), AddrClass::SiteLocal(_));
    if let Ok(ip) = host.parse::<IpAddr>() {
        return site_local(ip);
    }
    let Some(port) = parsed.port_or_known_default() else {
        return false;
    };
    match tokio::net::lookup_host((host.as_str(), port)).await {
        Ok(mut addrs) => addrs.any(|addr| site_local(addr.ip())),
        Err(_) => false,
    }
}

fn unmap_ipv4(ip: IpAddr) -> IpAddr {
    match ip {
        IpAddr::V6(v6) => v6
            .to_ipv4_mapped()
            .map(IpAddr::V4)
            .unwrap_or(IpAddr::V6(v6)),
        v4 => v4,
    }
}

fn classify_addr(ip: IpAddr) -> AddrClass {
    match ip {
        IpAddr::V4(v4) => classify_ipv4(v4),
        IpAddr::V6(v6) => classify_ipv6(v6),
    }
}

fn classify_ipv4(v4: Ipv4Addr) -> AddrClass {
    let o = v4.octets();
    if v4.is_loopback() {
        return AddrClass::Loopback;
    }
    if v4.is_private() {
        return AddrClass::SiteLocal("private");
    }
    if o[0] == 100 && (64..=127).contains(&o[1]) {
        return AddrClass::SiteLocal("carrier-grade NAT");
    }
    if v4.is_link_local() {
        return AddrClass::Forbidden("link-local");
    }
    if v4.is_unspecified() {
        return AddrClass::Forbidden("unspecified");
    }
    if v4.is_broadcast() {
        return AddrClass::Forbidden("broadcast");
    }
    if v4.is_documentation() {
        return AddrClass::Forbidden("documentation");
    }
    if v4.is_multicast() {
        return AddrClass::Forbidden("multicast");
    }
    if o[0] == 192 && o[1] == 0 && o[2] == 0 {
        return AddrClass::Forbidden("IETF protocol assignment");
    }
    if o[0] == 198 && (o[1] == 18 || o[1] == 19) {
        return AddrClass::Forbidden("benchmarking");
    }
    if o[0] >= 240 {
        return AddrClass::Forbidden("reserved");
    }
    AddrClass::Public
}

fn classify_ipv6(v6: Ipv6Addr) -> AddrClass {
    let s = v6.segments();
    if v6.is_loopback() {
        return AddrClass::Loopback;
    }
    if (s[0] & 0xfe00) == 0xfc00 {
        return AddrClass::SiteLocal("unique-local");
    }
    if v6.is_unspecified() {
        return AddrClass::Forbidden("unspecified");
    }
    if v6.is_multicast() {
        return AddrClass::Forbidden("multicast");
    }
    if (s[0] & 0xffc0) == 0xfe80 {
        return AddrClass::Forbidden("link-local");
    }
    // 64:ff9b::/96 embeds an IPv4 address the v6 rules above would not inspect.
    if s[0] == 0x0064 && s[1] == 0xff9b {
        return AddrClass::Forbidden("IPv4/IPv6 translation");
    }
    if s[0] == 0x2001 && s[1] == 0x0db8 {
        return AddrClass::Forbidden("documentation");
    }
    AddrClass::Public
}

/// Read a response body with a hard size cap so a hostile endpoint cannot
/// stream an unbounded body into memory.
pub async fn read_body_capped(mut resp: reqwest::Response, what: &str) -> Result<Vec<u8>> {
    let mut out: Vec<u8> = Vec::new();
    while let Some(chunk) = resp
        .chunk()
        .await
        .with_context(|| format!("read {what} response body"))?
    {
        if out.len() + chunk.len() > MAX_METADATA_BODY_BYTES {
            bail!(
                "{what} response body exceeds {MAX_METADATA_BODY_BYTES} bytes, refusing to buffer it"
            );
        }
        out.extend_from_slice(&chunk);
    }
    Ok(out)
}

/// Refuse a URL whose origin differs from the pinned one, so a poisoned cache
/// or a re-discovered endpoint cannot redirect credentials to another host.
pub fn enforce_same_origin(expected: &str, candidate: &str, what: &str) -> Result<()> {
    let expected_url =
        reqwest::Url::parse(expected).with_context(|| format!("parse pinned {what} URL"))?;
    let candidate_url =
        reqwest::Url::parse(candidate).with_context(|| format!("parse {what} URL"))?;
    if expected_url.origin() != candidate_url.origin() {
        bail!(
            "{what} origin {} does not match the pinned origin {}, refusing to use it",
            candidate_url.origin().ascii_serialization(),
            expected_url.origin().ascii_serialization()
        );
    }
    Ok(())
}

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
    fn https_enforcement_is_case_insensitive_about_the_scheme() {
        let err = enforce_https_for_remote("HTTP://mcp.example.com/").unwrap_err();
        assert!(format!("{err:#}").contains("must use HTTPS"));
    }

    const LOCAL_SERVER: &str = "http://127.0.0.1:3000/mcp";
    const REMOTE_SERVER: &str = "https://mcp.example.com/mcp";

    #[tokio::test]
    async fn resolved_endpoint_keeps_literal_loopback_for_a_local_server() {
        let endpoint = resolve_validated_endpoint("http://127.0.0.1:8080/token", LOCAL_SERVER)
            .await
            .expect("literal loopback should stay reachable for a loopback MCP server");
        assert_eq!(endpoint.host, "127.0.0.1");
        assert_eq!(endpoint.addrs, vec!["127.0.0.1:8080".parse().unwrap()]);
    }

    #[tokio::test]
    async fn resolved_endpoint_refuses_loopback_named_by_a_remote_server() {
        for target in [
            "http://127.0.0.1:9200/_cat/indices",
            "http://localhost:11434/api/tags",
            "http://[::1]:2375/containers/json",
        ] {
            let err = resolve_validated_endpoint(target, REMOTE_SERVER)
                .await
                .unwrap_err();
            let msg = format!("{err:#}");
            assert!(msg.contains("SSRF protection"), "{target}: {msg}");
            assert!(msg.contains("loopback"), "{target}: {msg}");
        }
    }

    #[tokio::test]
    async fn resolved_endpoint_allows_localhost_by_name_for_a_local_server() {
        let endpoint = resolve_validated_endpoint("http://localhost:8080/token", LOCAL_SERVER)
            .await
            .expect("localhost should stay reachable");
        assert!(endpoint.addrs.iter().all(|a| a.ip().is_loopback()));
        assert!(endpoint.addrs.iter().all(|a| a.port() == 8080));
    }

    #[tokio::test]
    async fn resolved_endpoint_blocks_link_local_metadata_service() {
        let err =
            resolve_validated_endpoint("http://169.254.169.254/latest/meta-data/", LOCAL_SERVER)
                .await
                .unwrap_err();
        assert!(format!("{err:#}").contains("SSRF protection"));
    }

    #[tokio::test]
    async fn resolved_endpoint_blocks_cleartext_remote_before_any_lookup() {
        let err = resolve_validated_endpoint("http://as.example.com/token", REMOTE_SERVER)
            .await
            .unwrap_err();
        assert!(format!("{err:#}").contains("must use HTTPS"));
    }

    #[tokio::test]
    async fn resolved_endpoint_blocks_non_http_schemes() {
        let err = resolve_validated_endpoint("file:///etc/passwd", LOCAL_SERVER)
            .await
            .unwrap_err();
        assert!(format!("{err:#}").contains("is not allowed"));
    }

    #[tokio::test]
    async fn resolution_rejects_a_name_that_lands_on_the_local_machine() {
        let err = ensure_addr_reachable(
            "evil.example.com",
            "127.0.0.1".parse().unwrap(),
            REMOTE_SERVER,
        )
        .await
        .unwrap_err();
        assert!(format!("{err:#}").contains("loopback"));
        assert!(
            ensure_addr_reachable("localhost", "127.0.0.1".parse().unwrap(), LOCAL_SERVER)
                .await
                .is_ok()
        );
    }

    #[tokio::test]
    async fn resolution_rejects_private_and_obfuscated_addresses() {
        for (ip, needle) in [
            ("10.1.2.3", "private"),
            ("169.254.169.254", "link-local"),
            ("100.64.0.1", "carrier-grade NAT"),
            ("198.18.0.1", "benchmarking"),
            ("::ffff:10.1.2.3", "private"),
            ("fd00::1", "unique-local"),
            ("64:ff9b::a01:203", "IPv4/IPv6 translation"),
        ] {
            let err = ensure_addr_reachable("evil.example.com", ip.parse().unwrap(), REMOTE_SERVER)
                .await
                .unwrap_err();
            let msg = format!("{err:#}");
            assert!(msg.contains(needle), "{ip}: unexpected error: {msg}");
        }
        assert!(
            ensure_addr_reachable("mcp.example.com", "8.8.8.8".parse().unwrap(), REMOTE_SERVER)
                .await
                .is_ok()
        );
    }

    #[tokio::test]
    async fn site_local_targets_need_a_site_local_server() {
        assert!(
            ensure_addr_reachable(
                "as.corp.example",
                "10.1.2.4".parse().unwrap(),
                REMOTE_SERVER
            )
            .await
            .is_err(),
            "a public MCP server must not reach RFC 1918"
        );
        assert!(
            ensure_addr_reachable(
                "as.corp.example",
                "10.1.2.4".parse().unwrap(),
                "https://10.1.2.3/mcp"
            )
            .await
            .is_ok(),
            "an on-prem MCP server keeps its on-prem authorization server"
        );
        assert!(
            ensure_addr_reachable(
                "as.corp.example",
                "127.0.0.1".parse().unwrap(),
                "https://10.1.2.3/mcp"
            )
            .await
            .is_err(),
            "an on-prem server still may not reach this machine"
        );
    }

    #[test]
    fn browser_endpoint_refuses_non_web_schemes() {
        for url in [
            "javascript:alert(1)",
            "file:///etc/passwd",
            "data:text/html,<script>1</script>",
        ] {
            let err = validate_browser_endpoint(url, REMOTE_SERVER)
                .expect_err("a non-web scheme must never reach a browser");
            assert!(format!("{err:#}").contains("is not allowed"), "{url}");
        }
    }

    #[test]
    fn browser_endpoint_refuses_loopback_from_a_remote_server() {
        let err = validate_browser_endpoint("http://127.0.0.1:9200/authorize", REMOTE_SERVER)
            .unwrap_err();
        assert!(format!("{err:#}").contains("names this machine"));
        assert!(
            validate_browser_endpoint("http://127.0.0.1:9200/authorize", LOCAL_SERVER).is_ok(),
            "a loopback deployment keeps its loopback authorize endpoint"
        );
        assert!(
            validate_browser_endpoint("https://as.example.com/authorize", REMOTE_SERVER).is_ok()
        );
    }

    #[test]
    fn same_origin_pin_rejects_a_host_swap() {
        assert!(
            enforce_same_origin(
                "https://as.example.com/token",
                "https://as.example.com/oauth/token",
                "token endpoint"
            )
            .is_ok()
        );
        let err = enforce_same_origin(
            "https://as.example.com/token",
            "https://evil.example.com/token",
            "token endpoint",
        )
        .unwrap_err();
        let msg = format!("{err:#}");
        assert!(msg.contains("does not match the pinned origin"), "{msg}");
        assert!(
            enforce_same_origin(
                "https://as.example.com/token",
                "http://as.example.com/token",
                "token endpoint"
            )
            .is_err(),
            "a scheme downgrade is an origin change"
        );
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
