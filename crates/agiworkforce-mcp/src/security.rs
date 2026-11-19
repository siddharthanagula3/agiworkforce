//! Network hardening helpers for remote MCP transports.
//!
//! Transport bringup enforcement is opt-in via
//! [`crate::McpTimeouts::validate_urls`], the CLI keeps its original behavior
//! (LAN MCP servers reachable) unless a host turns the knob on. The OAuth flow
//! is not opt-in: every URL it fetches is named by the remote server, so
//! [`resolve_validated_endpoint`] runs there unconditionally, anchored on the
//! server URL the user configured so a remote party can never widen its own
//! reach into this machine.

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

const PEER_PROBE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AddrClass {
    Public,
    Loopback,
    SiteLocal(SiteBlock),
    Forbidden(&'static str),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SiteBlock {
    Private10,
    Private172,
    Private192,
    CarrierGradeNat,
    UniqueLocal,
    Ipv6SiteLocal,
}

impl SiteBlock {
    fn kind(self) -> &'static str {
        match self {
            SiteBlock::Private10 | SiteBlock::Private172 | SiteBlock::Private192 => "private",
            SiteBlock::CarrierGradeNat => "carrier-grade NAT",
            SiteBlock::UniqueLocal => "unique-local",
            SiteBlock::Ipv6SiteLocal => "IPv6 site-local",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum SiteUnlock {
    Nothing,
    EveryBlock,
    Blocks(Vec<SiteBlock>),
}

/// Validate `url`, pin its host to the addresses it resolves to right now, and
/// refuse any address that reaches further into this machine's networks than
/// `anchor` already does.
///
/// [`validate_server_url`] only inspects the literal host text, so a hostname
/// that resolves to 127.0.0.1, 10.0.0.0/8 or 169.254.169.254 sails through it.
/// Any caller that fetches a URL supplied by a remote party must resolve the
/// name first, reject every address the remote party has no business naming,
/// and hand the surviving addresses to `reqwest::ClientBuilder::resolve_to_addrs`
///, otherwise a second lookup can rebind the name to an internal target
/// between the check and the connect.
///
/// `anchor` is the trust root: the URL the *user* configured (the MCP server,
/// or the record cached from a flow against it). A remote server may name its
/// own authorization server, but it must not be able to name
/// `http://127.0.0.1:9200/` and have this process fetch it. Loopback is
/// unlocked only when `anchor` literally names the local machine, never by
/// resolution, which a rebind could steer, and RFC 1918 / CGNAT / ULA targets
/// only when `anchor` is a literal such address, or its certificate-verified
/// server answered from an address in the target's own private block. A
/// literal address in `url` is judged by the same rule as one a name resolved
/// to.
pub async fn resolve_validated_endpoint(url: &str, anchor: &str) -> Result<ValidatedEndpoint> {
    validate_endpoint_on(&SystemNetwork, url, anchor).await
}

async fn validate_endpoint_on(
    network: &impl SiteNetwork,
    url: &str,
    anchor: &str,
) -> Result<ValidatedEndpoint> {
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
    let mut evidence = SiteLocalEvidence::new(network, anchor);
    let literal = bare.parse::<IpAddr>().ok();
    if let Some(ip) = literal {
        ensure_addr_reachable(&bare, ip, &mut evidence).await?;
    }
    enforce_https_for_remote(url)?;

    let addrs: Vec<SocketAddr> = match literal {
        Some(ip) => vec![SocketAddr::new(ip, port)],
        None => {
            let addrs = network
                .resolve(&bare, port)
                .await
                .with_context(|| format!("resolve host '{bare}'"))?;
            for addr in &addrs {
                ensure_addr_reachable(&bare, addr.ip(), &mut evidence).await?;
            }
            addrs
        }
    };
    if addrs.is_empty() {
        bail!("SSRF protection: host '{bare}' did not resolve to any address");
    }

    Ok(ValidatedEndpoint {
        url: parsed,
        host: bare,
        addrs,
    })
}

/// Validate a URL that is handed to the user's browser instead of being fetched
/// here.
///
/// DNS pinning would prove nothing (the browser resolves the name itself), but
/// the scheme does: anything other than http(s) turns the host's "open this
/// URL" call into a command surface. The loopback rule is the same as
/// [`resolve_validated_endpoint`]'s, a public authorization server must not be
/// able to drive the browser at services listening on this machine.
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
async fn ensure_addr_reachable(
    host: &str,
    ip: IpAddr,
    evidence: &mut SiteLocalEvidence<'_, impl SiteNetwork>,
) -> Result<()> {
    let ip = unmap_ipv4(ip);
    let anchor = evidence.anchor;
    let denial = match classify_addr(ip) {
        AddrClass::Public => return Ok(()),
        AddrClass::Loopback => {
            if anchor_is_local(anchor) {
                return Ok(());
            }
            "loopback"
        }
        AddrClass::SiteLocal(block) => {
            if anchor_is_local(anchor)
                || is_anchor_host(host, anchor)
                || evidence.unlocks(block).await
            {
                return Ok(());
            }
            block.kind()
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

/// The anchor's own host may sit at a site-local address: the request to it is
/// pinned to the validated addresses and only proceeds after the certificate
/// for that name verifies there, which is the same evidence the probe gathers.
fn is_anchor_host(host: &str, anchor: &str) -> bool {
    reqwest::Url::parse(anchor)
        .ok()
        .and_then(|parsed| parsed.host_str().map(bare_host))
        .is_some_and(|anchor_host| anchor_host.eq_ignore_ascii_case(host))
}

/// How this client reaches the network when it judges an anchor: name
/// resolution and the certificate-verified probe.
trait SiteNetwork {
    async fn resolve(&self, host: &str, port: u16) -> std::io::Result<Vec<SocketAddr>>;
    async fn probe(
        &self,
        origin: &reqwest::Url,
        host: &str,
        addrs: &[SocketAddr],
    ) -> Option<IpAddr>;
}

struct SystemNetwork;

impl SiteNetwork for SystemNetwork {
    async fn resolve(&self, host: &str, port: u16) -> std::io::Result<Vec<SocketAddr>> {
        Ok(tokio::net::lookup_host((host, port)).await?.collect())
    }

    async fn probe(
        &self,
        origin: &reqwest::Url,
        host: &str,
        addrs: &[SocketAddr],
    ) -> Option<IpAddr> {
        answering_peer(origin, host, addrs).await
    }
}

/// Whether the anchor sits on this site's network, decided at most once per
/// endpoint validation and never cached across validations.
struct SiteLocalEvidence<'a, N: SiteNetwork> {
    network: &'a N,
    anchor: &'a str,
    verdict: Option<SiteUnlock>,
}

impl<'a, N: SiteNetwork> SiteLocalEvidence<'a, N> {
    fn new(network: &'a N, anchor: &'a str) -> Self {
        Self {
            network,
            anchor,
            verdict: None,
        }
    }

    async fn unlocks(&mut self, block: SiteBlock) -> bool {
        if self.verdict.is_none() {
            let verdict = self.decide().await;
            self.verdict = Some(verdict);
        }
        match &self.verdict {
            Some(SiteUnlock::EveryBlock) => true,
            Some(SiteUnlock::Blocks(verified)) => verified.contains(&block),
            Some(SiteUnlock::Nothing) | None => false,
        }
    }

    /// Security constraint: a site-local address at which the anchor name
    /// completes certificate-verified TLS unlocks only targets in that
    /// address's own block (10/8, 172.16/12, 192.168/16, 100.64/10, fc00::/7
    /// and fec0::/10 are each separate). Each block the anchor resolves into
    /// gets its own probe, pinned to one answer in that block, and unlocks
    /// only when that probe's verified peer sits in that block. A later change
    /// must not widen this, for example by unlocking every block, letting one
    /// block's probe vouch for another, accepting a DNS answer alone, a
    /// proxied peer address, or an unverified connection.
    async fn decide(&self) -> SiteUnlock {
        let Ok(parsed) = reqwest::Url::parse(self.anchor) else {
            return SiteUnlock::Nothing;
        };
        let Some(host) = parsed.host_str().map(bare_host) else {
            return SiteUnlock::Nothing;
        };
        if let Ok(ip) = host.parse::<IpAddr>() {
            return match site_block(ip) {
                Some(_) => SiteUnlock::EveryBlock,
                None => SiteUnlock::Nothing,
            };
        }
        if !parsed.scheme().eq_ignore_ascii_case("https") {
            return SiteUnlock::Nothing;
        }
        let Some(port) = parsed.port_or_known_default() else {
            return SiteUnlock::Nothing;
        };
        let Ok(answers) = self.network.resolve(&host, port).await else {
            return SiteUnlock::Nothing;
        };
        let candidates = one_answer_per_site_block(answers);
        if candidates.is_empty() {
            return SiteUnlock::Nothing;
        }
        let mut origin = parsed.clone();
        origin.set_path("/");
        origin.set_query(None);
        origin.set_fragment(None);
        let probes = candidates.into_iter().map(|(block, addr)| {
            let origin = &origin;
            let host = host.as_str();
            async move {
                let peer = self.network.probe(origin, host, &[addr]).await;
                (peer.and_then(site_block) == Some(block)).then_some(block)
            }
        });
        let verified: Vec<SiteBlock> = futures_util::future::join_all(probes)
            .await
            .into_iter()
            .flatten()
            .collect();
        if verified.is_empty() {
            SiteUnlock::Nothing
        } else {
            SiteUnlock::Blocks(verified)
        }
    }
}

fn one_answer_per_site_block(answers: Vec<SocketAddr>) -> Vec<(SiteBlock, SocketAddr)> {
    let mut chosen: Vec<(SiteBlock, SocketAddr)> = Vec::new();
    for addr in answers {
        if let Some(block) = site_block(addr.ip())
            && !chosen.iter().any(|(seen, _)| *seen == block)
        {
            chosen.push((block, addr));
        }
    }
    chosen
}

fn site_block(ip: IpAddr) -> Option<SiteBlock> {
    match classify_addr(unmap_ipv4(ip)) {
        AddrClass::SiteLocal(block) => Some(block),
        _ => None,
    }
}

/// The address that answered a request to `origin`, pinned to `addrs`. The
/// client must stay direct (`no_proxy`, since through a proxy `remote_addr` is
/// the proxy's address), pinned (`resolve_to_addrs`, so direct traffic only
/// reaches the site-local addresses the caller passed), certificate-verified,
/// and must never follow redirects.
async fn answering_peer(origin: &reqwest::Url, host: &str, addrs: &[SocketAddr]) -> Option<IpAddr> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .resolve_to_addrs(host, addrs)
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(PEER_PROBE_TIMEOUT)
        .timeout(PEER_PROBE_TIMEOUT)
        .build()
        .ok()?;
    let response = client.get(origin.clone()).send().await.ok()?;
    response.remote_addr().map(|addr| addr.ip())
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
    if o[0] == 10 {
        return AddrClass::SiteLocal(SiteBlock::Private10);
    }
    if o[0] == 172 && (16..=31).contains(&o[1]) {
        return AddrClass::SiteLocal(SiteBlock::Private172);
    }
    if o[0] == 192 && o[1] == 168 {
        return AddrClass::SiteLocal(SiteBlock::Private192);
    }
    if o[0] == 100 && (64..=127).contains(&o[1]) {
        return AddrClass::SiteLocal(SiteBlock::CarrierGradeNat);
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
        return AddrClass::SiteLocal(SiteBlock::UniqueLocal);
    }
    if (s[0] & 0xffc0) == 0xfec0 {
        return AddrClass::SiteLocal(SiteBlock::Ipv6SiteLocal);
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

/// Text a remote party chose, made safe to print: control characters (ESC,
/// C1 introducers, newlines) and bidirectional overrides removed and the
/// length capped, so a diagnostic cannot carry a terminal escape sequence,
/// forge extra output lines, or reorder the line it sits in.
pub(crate) fn printable(text: &str, max_chars: usize) -> String {
    let mut cleaned = String::with_capacity(text.len());
    let mut after_control = false;
    for c in text.chars() {
        if is_bidi_control(c) {
            continue;
        }
        if c.is_control() {
            if !after_control {
                cleaned.push(' ');
            }
            after_control = true;
        } else {
            cleaned.push(c);
            after_control = false;
        }
    }
    match cleaned.char_indices().nth(max_chars) {
        Some((idx, _)) => format!("{}…", &cleaned[..idx]),
        None => cleaned,
    }
}

fn is_bidi_control(c: char) -> bool {
    matches!(
        c,
        '\u{061C}' | '\u{200E}' | '\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}'
    )
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

/// Decide whether a transport may skip TLS certificate verification.
///
/// WHY THIS LIVES HERE. `danger_accept_invalid_certs(true)` is called in
/// `transport/http.rs` and `transport/sse.rs` whenever [`crate::McpTimeouts`]
/// carries `verify_tls: false`. The only guard against that was in the DESKTOP
/// caller (`apps/desktop/src-tauri/src/core/mcp/transport.rs`, SEV-DESK-07),
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

    #[derive(Default)]
    struct FakeNetwork {
        answers: std::collections::HashMap<&'static str, Vec<IpAddr>>,
        peer: Option<IpAddr>,
        verified_at: Vec<IpAddr>,
        probes: std::sync::Mutex<Vec<Vec<SocketAddr>>>,
    }

    impl FakeNetwork {
        fn with(answers: &[(&'static str, &[&str])], peer: Option<&str>) -> Self {
            Self {
                answers: answers
                    .iter()
                    .map(|(host, ips)| (*host, ips.iter().map(|ip| ip.parse().unwrap()).collect()))
                    .collect(),
                peer: peer.map(|ip| ip.parse().unwrap()),
                ..Default::default()
            }
        }

        fn verified_at(answers: &[(&'static str, &[&str])], verified_at: &[&str]) -> Self {
            Self {
                verified_at: verified_at.iter().map(|ip| ip.parse().unwrap()).collect(),
                ..Self::with(answers, None)
            }
        }

        fn probes(&self) -> Vec<Vec<SocketAddr>> {
            self.probes.lock().expect("probe log").clone()
        }
    }

    impl SiteNetwork for FakeNetwork {
        async fn resolve(&self, host: &str, port: u16) -> std::io::Result<Vec<SocketAddr>> {
            self.answers
                .get(host)
                .map(|ips| ips.iter().map(|ip| SocketAddr::new(*ip, port)).collect())
                .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "no such host"))
        }

        async fn probe(
            &self,
            _origin: &reqwest::Url,
            _host: &str,
            addrs: &[SocketAddr],
        ) -> Option<IpAddr> {
            self.probes.lock().expect("probe log").push(addrs.to_vec());
            self.peer.or_else(|| {
                addrs
                    .iter()
                    .map(SocketAddr::ip)
                    .find(|ip| self.verified_at.contains(ip))
            })
        }
    }

    async fn reachable(host: &str, ip: &str, anchor: &str) -> Result<()> {
        let offline = FakeNetwork::default();
        let mut evidence = SiteLocalEvidence::new(&offline, anchor);
        ensure_addr_reachable(host, ip.parse().unwrap(), &mut evidence).await
    }

    const ONPREM_SERVER: &str = "https://onprem.corp.example/mcp";
    const ONPREM_TOKEN: &str = "https://as.corp.example/token";

    #[tokio::test]
    async fn resolution_rejects_a_name_that_lands_on_the_local_machine() {
        let err = reachable("evil.example.com", "127.0.0.1", REMOTE_SERVER)
            .await
            .unwrap_err();
        assert!(format!("{err:#}").contains("loopback"));
        assert!(
            reachable("localhost", "127.0.0.1", LOCAL_SERVER)
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
            ("fec0::1", "IPv6 site-local"),
            ("64:ff9b::a01:203", "IPv4/IPv6 translation"),
        ] {
            let err = reachable("evil.example.com", ip, REMOTE_SERVER)
                .await
                .unwrap_err();
            let msg = format!("{err:#}");
            assert!(msg.contains(needle), "{ip}: unexpected error: {msg}");
        }
        assert!(
            reachable("mcp.example.com", "8.8.8.8", REMOTE_SERVER)
                .await
                .is_ok()
        );
    }

    #[test]
    fn deprecated_ipv6_site_local_is_site_local() {
        for ip in ["fec0::1", "feff:ffff::1"] {
            assert_eq!(
                classify_addr(ip.parse().unwrap()),
                AddrClass::SiteLocal(SiteBlock::Ipv6SiteLocal),
                "{ip}"
            );
        }
        assert_eq!(
            classify_addr("fe80::1".parse().unwrap()),
            AddrClass::Forbidden("link-local")
        );
    }

    #[tokio::test]
    async fn site_local_targets_need_a_site_local_server() {
        assert!(
            reachable("as.corp.example", "10.1.2.4", REMOTE_SERVER)
                .await
                .is_err(),
            "a public MCP server must not reach RFC 1918"
        );
        assert!(
            reachable("as.corp.example", "10.1.2.4", "https://10.1.2.3/mcp")
                .await
                .is_ok(),
            "an on-prem MCP server keeps its on-prem authorization server"
        );
        assert!(
            reachable("as.corp.example", "127.0.0.1", "https://10.1.2.3/mcp")
                .await
                .is_err(),
            "an on-prem server still may not reach this machine"
        );
    }

    #[tokio::test]
    async fn a_literal_site_local_address_follows_the_same_rule_as_a_resolved_one() {
        let offline = FakeNetwork::default();
        assert!(
            validate_endpoint_on(&offline, "https://10.1.2.4/token", "https://10.1.2.3/mcp")
                .await
                .is_ok(),
            "an on-prem MCP server keeps an on-prem authorization server named by address"
        );
        let err = validate_endpoint_on(&offline, "https://10.1.2.4/token", REMOTE_SERVER)
            .await
            .unwrap_err();
        assert!(format!("{err:#}").contains("private"), "{err:#}");
        assert!(offline.probes().is_empty());
    }

    #[tokio::test]
    async fn private_only_dns_without_verified_tls_does_not_unlock_site_local_targets() {
        let network = FakeNetwork::with(
            &[
                ("onprem.corp.example", &["10.0.0.7"]),
                ("as.corp.example", &["10.1.2.4"]),
            ],
            None,
        );
        let err = validate_endpoint_on(&network, ONPREM_TOKEN, ONPREM_SERVER)
            .await
            .unwrap_err();
        assert!(format!("{err:#}").contains("private"), "{err:#}");
        assert_eq!(
            network.probes(),
            vec![vec!["10.0.0.7:443".parse().unwrap()]]
        );
    }

    #[tokio::test]
    async fn a_public_peer_does_not_unlock_site_local_targets_whatever_dns_answers() {
        let network = FakeNetwork::with(
            &[
                ("onprem.corp.example", &["10.0.0.7"]),
                ("as.corp.example", &["10.1.2.4"]),
            ],
            Some("203.0.113.7"),
        );
        assert!(
            validate_endpoint_on(&network, ONPREM_TOKEN, ONPREM_SERVER)
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn a_verified_private_peer_unlocks_site_local_targets() {
        let network = FakeNetwork::with(
            &[
                ("onprem.corp.example", &["10.0.0.7"]),
                ("as.corp.example", &["10.1.2.4"]),
            ],
            Some("10.0.0.7"),
        );
        assert!(
            validate_endpoint_on(&network, ONPREM_TOKEN, ONPREM_SERVER)
                .await
                .is_ok()
        );
    }

    async fn unlocked_by_peer(peer: &'static str, target: &'static str) -> bool {
        let network = FakeNetwork::with(
            &[
                ("onprem.corp.example", &[peer]),
                ("as.corp.example", &[target]),
            ],
            Some(peer),
        );
        validate_endpoint_on(&network, ONPREM_TOKEN, ONPREM_SERVER)
            .await
            .is_ok()
    }

    #[tokio::test]
    async fn probe_evidence_unlocks_targets_in_the_block_the_peer_answered_from() {
        for (peer, target) in [
            ("10.0.0.7", "10.200.2.4"),
            ("172.16.0.7", "172.31.2.4"),
            ("192.168.1.5", "192.168.200.4"),
            ("100.64.0.5", "100.127.1.1"),
            ("fd00::7", "fc12:3456::4"),
        ] {
            assert!(
                unlocked_by_peer(peer, target).await,
                "{peer} should unlock {target}"
            );
        }
    }

    #[tokio::test]
    async fn probe_evidence_from_one_private_block_does_not_unlock_another() {
        for (peer, target) in [
            ("192.168.1.5", "10.1.2.4"),
            ("192.168.1.5", "172.16.0.3"),
            ("10.0.0.7", "192.168.1.9"),
            ("10.0.0.7", "172.16.0.3"),
            ("172.16.0.7", "10.1.2.4"),
            ("100.64.0.5", "10.1.2.4"),
            ("100.64.0.5", "172.16.0.3"),
            ("100.64.0.5", "192.168.1.9"),
            ("10.0.0.7", "100.64.0.9"),
            ("10.0.0.7", "fd00::4"),
            ("fd00::7", "10.1.2.4"),
            ("fd00::7", "fec0::4"),
        ] {
            assert!(
                !unlocked_by_peer(peer, target).await,
                "{peer} must not unlock {target}"
            );
        }
    }

    #[tokio::test]
    async fn a_literal_site_local_anchor_still_unlocks_every_site_local_block() {
        let offline = FakeNetwork::default();
        for target in [
            "https://10.1.2.4/token",
            "https://192.168.1.9/token",
            "https://172.16.0.3/token",
            "https://100.64.0.9/token",
            "https://[fd00::4]/token",
        ] {
            assert!(
                validate_endpoint_on(&offline, target, "https://10.1.2.3/mcp")
                    .await
                    .is_ok(),
                "{target}"
            );
        }
        assert!(offline.probes().is_empty());
    }

    #[tokio::test]
    async fn an_anchor_resolving_only_to_public_addresses_is_never_probed() {
        let network = FakeNetwork::with(
            &[
                ("onprem.corp.example", &["8.8.8.8", "2606:4700::1"]),
                ("as.corp.example", &["10.1.2.4"]),
            ],
            Some("10.0.0.7"),
        );
        assert!(
            validate_endpoint_on(&network, ONPREM_TOKEN, ONPREM_SERVER)
                .await
                .is_err()
        );
        assert!(network.probes().is_empty());
    }

    #[tokio::test]
    async fn the_probe_is_pinned_to_the_anchors_site_local_answers_only() {
        let network = FakeNetwork::with(
            &[
                ("onprem.corp.example", &["8.8.8.8", "10.0.0.7", "fd00::7"]),
                ("as.corp.example", &["10.1.2.4"]),
            ],
            Some("10.0.0.7"),
        );
        assert!(
            validate_endpoint_on(&network, ONPREM_TOKEN, ONPREM_SERVER)
                .await
                .is_ok()
        );
        assert_eq!(
            network.probes(),
            vec![
                vec!["10.0.0.7:443".parse().unwrap()],
                vec!["[fd00::7]:443".parse().unwrap()]
            ]
        );
    }

    async fn verdicts(network: &FakeNetwork, targets: &[&str]) -> Vec<bool> {
        let mut verdicts = Vec::new();
        for target in targets {
            verdicts.push(
                validate_endpoint_on(network, target, ONPREM_SERVER)
                    .await
                    .is_ok(),
            );
        }
        verdicts
    }

    const PRIVATE_10_TARGET: &str = "https://10.1.2.4/token";
    const UNIQUE_LOCAL_TARGET: &str = "https://[fd00::4]/token";
    const PRIVATE_192_TARGET: &str = "https://192.168.1.9/token";

    #[tokio::test]
    async fn an_anchor_in_two_private_blocks_unlocks_each_block_that_verifies_whatever_the_answer_order()
     {
        for anchor_answers in [
            &["fd00::7", "10.0.0.7"] as &[&str],
            &["10.0.0.7", "fd00::7"],
        ] {
            let network = FakeNetwork::verified_at(
                &[
                    ("onprem.corp.example", anchor_answers),
                    ("as.corp.example", &["10.1.2.4"]),
                ],
                &["fd00::7", "10.0.0.7"],
            );
            assert!(
                validate_endpoint_on(&network, ONPREM_TOKEN, ONPREM_SERVER)
                    .await
                    .is_ok(),
                "{anchor_answers:?}: the on-prem authorization server in 10/8 must stay reachable"
            );
            assert_eq!(
                verdicts(
                    &network,
                    &[PRIVATE_10_TARGET, UNIQUE_LOCAL_TARGET, PRIVATE_192_TARGET]
                )
                .await,
                vec![true, true, false],
                "{anchor_answers:?}"
            );
        }
    }

    #[tokio::test]
    async fn a_block_whose_probe_fails_stays_locked_while_a_verified_block_unlocks() {
        let network = FakeNetwork::verified_at(
            &[("onprem.corp.example", &["10.0.0.7", "fd00::7"])],
            &["fd00::7"],
        );
        assert_eq!(
            verdicts(&network, &[PRIVATE_10_TARGET, UNIQUE_LOCAL_TARGET]).await,
            vec![false, true]
        );
    }

    #[tokio::test]
    async fn a_probe_reporting_a_peer_outside_its_block_unlocks_nothing() {
        let network = FakeNetwork::with(&[("onprem.corp.example", &["fd00::7"])], Some("10.0.0.7"));
        assert_eq!(
            verdicts(&network, &[PRIVATE_10_TARGET, UNIQUE_LOCAL_TARGET]).await,
            vec![false, false]
        );
    }

    #[tokio::test]
    async fn each_block_is_probed_at_one_answer_once_per_validation() {
        let network = FakeNetwork::verified_at(
            &[
                (
                    "onprem.corp.example",
                    &["8.8.8.8", "10.0.0.7", "fd00::7", "10.0.0.8", "fd00::8"],
                ),
                ("as.corp.example", &["10.1.2.4", "fd00::4", "10.1.2.5"]),
            ],
            &["10.0.0.7", "10.0.0.8", "fd00::7", "fd00::8"],
        );
        let one_pass: Vec<Vec<SocketAddr>> = vec![
            vec!["10.0.0.7:443".parse().unwrap()],
            vec!["[fd00::7]:443".parse().unwrap()],
        ];
        validate_endpoint_on(&network, ONPREM_TOKEN, ONPREM_SERVER)
            .await
            .expect("both blocks verified");
        assert_eq!(network.probes(), one_pass);
        validate_endpoint_on(&network, ONPREM_TOKEN, ONPREM_SERVER)
            .await
            .expect("both blocks verified again");
        assert_eq!(network.probes(), [one_pass.clone(), one_pass].concat());
    }

    #[tokio::test]
    async fn evidence_is_gathered_once_per_validation_and_not_cached_across_them() {
        let network = FakeNetwork::with(
            &[
                ("onprem.corp.example", &["10.0.0.7"]),
                ("as.corp.example", &["10.1.2.4", "10.1.2.5", "10.200.0.4"]),
            ],
            Some("10.0.0.7"),
        );
        validate_endpoint_on(&network, ONPREM_TOKEN, ONPREM_SERVER)
            .await
            .expect("verified on-prem anchor");
        assert_eq!(network.probes().len(), 1);
        validate_endpoint_on(&network, "https://10.1.2.9/token", ONPREM_SERVER)
            .await
            .expect("verified on-prem anchor, literal target");
        assert_eq!(network.probes().len(), 2);
    }

    #[tokio::test]
    async fn the_anchors_own_host_needs_no_probe() {
        let network = FakeNetwork::with(&[("onprem.corp.example", &["10.0.0.7"])], None);
        let endpoint = validate_endpoint_on(
            &network,
            "https://onprem.corp.example/.well-known/oauth-protected-resource/mcp",
            ONPREM_SERVER,
        )
        .await
        .expect("an on-prem server's own metadata stays reachable");
        assert_eq!(endpoint.addrs, vec!["10.0.0.7:443".parse().unwrap()]);
        assert!(network.probes().is_empty());
    }

    #[tokio::test]
    async fn a_cleartext_anchor_is_never_probed() {
        let network = FakeNetwork::with(
            &[
                ("onprem.corp.example", &["10.0.0.7"]),
                ("as.corp.example", &["10.1.2.4"]),
            ],
            Some("10.0.0.7"),
        );
        assert!(
            validate_endpoint_on(&network, ONPREM_TOKEN, "http://onprem.corp.example/mcp")
                .await
                .is_err()
        );
        assert!(network.probes().is_empty());
    }

    #[tokio::test]
    async fn the_probe_reports_the_pinned_address_that_answered() {
        let (listener, hits) = crate::transport::http::raw_http::spawn_collector().await;
        let origin =
            reqwest::Url::parse(&format!("http://onprem.test:{}/", listener.port())).unwrap();
        assert_eq!(
            answering_peer(&origin, "onprem.test", &[listener]).await,
            Some(listener.ip())
        );
        assert_eq!(hits.lock().expect("collector lock").len(), 1);
    }

    #[tokio::test]
    async fn a_listener_that_ends_the_tls_handshake_gives_no_peer_evidence_before_the_timeout() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind listener");
        let addr = listener.local_addr().expect("listener addr");
        let accepted = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let counter = std::sync::Arc::clone(&accepted);
        tokio::spawn(async move {
            while let Ok((sock, _)) = listener.accept().await {
                counter.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                drop(sock);
            }
        });
        let origin = reqwest::Url::parse(&format!("https://onprem.test:{}/", addr.port())).unwrap();
        let started = std::time::Instant::now();
        let peer = tokio::time::timeout(
            PEER_PROBE_TIMEOUT * 6,
            answering_peer(&origin, "onprem.test", &[addr]),
        )
        .await
        .expect("the probe must end on its own");
        let elapsed = started.elapsed();
        assert_eq!(peer, None);
        assert!(
            elapsed < PEER_PROBE_TIMEOUT,
            "the probe waited out its timeout ({elapsed:?}) instead of failing the handshake"
        );
        assert!(accepted.load(std::sync::atomic::Ordering::SeqCst) >= 1);
    }

    fn der(tag: u8, body: &[u8]) -> Vec<u8> {
        let mut out = vec![tag];
        match body.len() {
            len @ 0..=0x7f => out.push(len as u8),
            len @ 0x80..=0xff => out.extend([0x81, len as u8]),
            len => out.extend([0x82, (len >> 8) as u8, len as u8]),
        }
        out.extend_from_slice(body);
        out
    }

    fn self_signed_certificate(
        host: &str,
    ) -> (
        tokio_rustls::rustls::pki_types::CertificateDer<'static>,
        tokio_rustls::rustls::pki_types::PrivateKeyDer<'static>,
    ) {
        use tokio_rustls::rustls::{
            SignatureScheme,
            crypto::aws_lc_rs::sign::any_eddsa_type,
            pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer},
        };
        let mut pkcs8 = vec![
            0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22,
            0x04, 0x20,
        ];
        pkcs8.extend([7u8; 32]);
        let key = PrivatePkcs8KeyDer::from(pkcs8);
        let signing_key = any_eddsa_type(&key).expect("ed25519 test key");
        let spki = signing_key.public_key().expect("ed25519 public key");
        let ed25519 = der(0x30, &der(0x06, &[0x2b, 0x65, 0x70]));
        let name = der(
            0x30,
            &der(
                0x31,
                &der(
                    0x30,
                    &[der(0x06, &[0x55, 0x04, 0x03]), der(0x0c, host.as_bytes())].concat(),
                ),
            ),
        );
        let validity = der(
            0x30,
            &[der(0x17, b"250101000000Z"), der(0x18, b"20991231235959Z")].concat(),
        );
        let subject_alt_name = der(0x30, &der(0x82, host.as_bytes()));
        let extensions = der(
            0xa3,
            &der(
                0x30,
                &der(
                    0x30,
                    &[der(0x06, &[0x55, 0x1d, 0x11]), der(0x04, &subject_alt_name)].concat(),
                ),
            ),
        );
        let tbs = der(
            0x30,
            &[
                der(0xa0, &der(0x02, &[2])),
                der(0x02, &[1]),
                ed25519.clone(),
                name.clone(),
                validity,
                name,
                spki.as_ref().to_vec(),
                extensions,
            ]
            .concat(),
        );
        let signature = signing_key
            .choose_scheme(&[SignatureScheme::ED25519])
            .expect("ed25519 signer")
            .sign(&tbs)
            .expect("sign certificate");
        let certificate = der(
            0x30,
            &[tbs, ed25519, der(0x03, &[&[0u8][..], &signature].concat())].concat(),
        );
        (CertificateDer::from(certificate), PrivateKeyDer::Pkcs8(key))
    }

    struct TlsListener {
        addr: SocketAddr,
        accepted: std::sync::Arc<std::sync::atomic::AtomicUsize>,
        answered: std::sync::Arc<std::sync::atomic::AtomicUsize>,
    }

    async fn spawn_untrusted_tls_listener(host: &str) -> TlsListener {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio_rustls::rustls::{ServerConfig, crypto::aws_lc_rs::default_provider};
        let (certificate, key) = self_signed_certificate(host);
        let config = ServerConfig::builder_with_provider(std::sync::Arc::new(default_provider()))
            .with_safe_default_protocol_versions()
            .expect("tls versions")
            .with_no_client_auth()
            .with_single_cert(vec![certificate], key)
            .expect("server certificate");
        let acceptor = tokio_rustls::TlsAcceptor::from(std::sync::Arc::new(config));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind listener");
        let addr = listener.local_addr().expect("listener addr");
        let accepted = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let answered = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let (accept_count, answer_count) = (accepted.clone(), answered.clone());
        tokio::spawn(async move {
            while let Ok((sock, _)) = listener.accept().await {
                accept_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                let (acceptor, answer_count) = (acceptor.clone(), answer_count.clone());
                tokio::spawn(async move {
                    let Ok(mut stream) = acceptor.accept(sock).await else {
                        return;
                    };
                    let mut request = Vec::new();
                    let mut chunk = [0u8; 1024];
                    while !request.windows(4).any(|w| w == b"\r\n\r\n") {
                        match stream.read(&mut chunk).await {
                            Ok(0) | Err(_) => return,
                            Ok(n) => request.extend_from_slice(&chunk[..n]),
                        }
                    }
                    answer_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                    let _ = stream
                        .write_all(
                            b"HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                        )
                        .await;
                    let _ = stream.shutdown().await;
                });
            }
        });
        TlsListener {
            addr,
            accepted,
            answered,
        }
    }

    #[tokio::test]
    async fn a_listener_whose_certificate_does_not_verify_gives_no_peer_evidence() {
        let host = "onprem.test";
        let listener = spawn_untrusted_tls_listener(host).await;
        let origin =
            reqwest::Url::parse(&format!("https://{host}:{}/", listener.addr.port())).unwrap();

        let unverified = reqwest::Client::builder()
            .no_proxy()
            .resolve_to_addrs(host, &[listener.addr])
            .tls_danger_accept_invalid_certs(true)
            .build()
            .expect("control client")
            .get(origin.clone())
            .send()
            .await
            .expect("the listener completes TLS and answers when verification is off");
        assert_eq!(unverified.status(), reqwest::StatusCode::NO_CONTENT);
        assert_eq!(
            listener.answered.load(std::sync::atomic::Ordering::SeqCst),
            1
        );

        let accepted_before = listener.accepted.load(std::sync::atomic::Ordering::SeqCst);
        let started = std::time::Instant::now();
        let peer = tokio::time::timeout(
            PEER_PROBE_TIMEOUT * 6,
            answering_peer(&origin, host, &[listener.addr]),
        )
        .await
        .expect("the probe must end on its own");
        assert_eq!(peer, None, "an unverified certificate is not peer evidence");
        assert!(
            started.elapsed() < PEER_PROBE_TIMEOUT,
            "the probe must fail on the certificate, not on its timeout"
        );
        assert!(listener.accepted.load(std::sync::atomic::Ordering::SeqCst) > accepted_before);
        assert_eq!(
            listener.answered.load(std::sync::atomic::Ordering::SeqCst),
            1,
            "the probe must not complete a request over an unverified connection"
        );
    }

    #[test]
    fn printable_strips_terminal_controls_and_caps_length() {
        let hostile = "ok\u{1b}]52;c;cHduZWQ=\u{07}\u{1b}[2J\nApprove? [y]\u{9b}31m";
        let shown = printable(hostile, 1000);
        assert!(!shown.chars().any(char::is_control), "{shown:?}");
        assert_eq!(
            printable("Bad Request\nmissing field", 100),
            "Bad Request missing field"
        );
        assert_eq!(printable("a\r\n\u{1b}]52;c;x\u{07}b", 100), "a ]52;c;x b");
        assert_eq!(
            printable(&"x".repeat(50), 10),
            format!("{}…", "x".repeat(10))
        );
    }

    #[test]
    fn printable_strips_bidi_controls_and_keeps_ordinary_text() {
        let spoof = "tool\u{202E}]y[ ?evorppA\u{202C} \u{2066}x\u{2069}\u{200E}\u{200F}\u{061C}\
                     \u{202A}\u{202B}\u{202D}\u{2067}\u{2068}end";
        assert_eq!(printable(spoof, 1000), "tool]y[ ?evorppA xend");
        assert_eq!(printable("a\u{202E}\u{1b}b", 100), "a b");
        let ordinary = "héllo 日本語 مرحبا 👩\u{200D}💻 ok";
        assert_eq!(printable(ordinary, 100), ordinary);
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
