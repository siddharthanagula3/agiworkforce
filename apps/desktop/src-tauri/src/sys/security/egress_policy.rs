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
//! rate-limit, and it does not inspect the payload.
//!
//! A hostname is judged by the addresses it RESOLVES to, not by its spelling,
//! so `metadata.google.internal`, `localtest.me` and `127-0-0-1.sslip.io` are
//! refused on the strength of their A/AAAA records rather than a name
//! denylist. Two limits on that, stated precisely because the previous version
//! of this comment overstated them:
//!
//! * DNS REBINDING IS STILL OPEN. Resolving here closes the STATIC case (a
//!   name whose records already point inside). It does not close the RACE: a
//!   resolver that answers public for this lookup and private for the one
//!   reqwest does when it connects still wins. Closing that needs connect-time
//!   address pinning (a custom connector/`resolve()` override) or an OS-level
//!   firewall, neither of which exists yet.
//! * DNS FAILS CLOSED. A hostname has to resolve to at least one public address
//!   before an arbitrary-public request is allowed. Treating lookup failure as
//!   permission made the validator and transport two independent DNS queries:
//!   an attacker could fail the first one and answer the second one internally.
//!   This does not fully close the public-then-private rebinding race; doing
//!   that still needs connect-time address pinning or an OS-level firewall.
//!
//! REDIRECTS are part of the destination, not an afterthought: judging only the
//! first URL is no guard at all when the client follows up to ten further hops.
//! [`public_destination_redirect_policy`] re-runs the judgement on every hop and
//! is installed on every `reqwest::Client` built under `sys::api` — all five
//! `ApiClient` builders and the `OAuth2Client` one, which matters most because
//! its three token calls POST `client_secret` in a form body and a 307/308
//! preserves both method and body.

use std::fmt;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, ToSocketAddrs};

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
    /// The host could not be proven public because DNS returned no addresses
    /// or failed. Public-only callers fail closed rather than handing the same
    /// name to the transport for a second, potentially different lookup.
    UnresolvedDestination(String),
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
            EgressDenial::UnresolvedDestination(host) => write!(
                f,
                "Destination {host} could not be resolved to a public internet address and is blocked by the egress policy"
            ),
        }
    }
}

impl std::error::Error for EgressDenial {}

/// Turns a hostname into the addresses a connection to it would use.
///
/// Exists so the judgement can be exercised without a network: production wires
/// [`SystemResolver`] (the OS resolver, the same one `reqwest` will use), tests
/// wire a fixed table.
pub(crate) trait HostResolver {
    fn resolve(&self, host: &str, port: u16) -> std::io::Result<Vec<IpAddr>>;
}

/// The OS resolver. `to_socket_addrs` is `getaddrinfo`, so this BLOCKS the
/// calling thread; every caller here is either a synchronous validator or a
/// redirect callback, both of which have to answer synchronously anyway.
pub(crate) struct SystemResolver;

impl HostResolver for SystemResolver {
    fn resolve(&self, host: &str, port: u16) -> std::io::Result<Vec<IpAddr>> {
        Ok((host, port)
            .to_socket_addrs()?
            .map(|address| address.ip())
            .collect())
    }
}

/// Judge one outbound destination.
///
/// Accepts `http`/`https` URLs whose host is a public-internet destination.
/// Rejects everything else, including every spelling of an internal address
/// that `url::Url` canonicalizes (decimal `http://2130706433/`, hex
/// `http://0x7f000001/`, IPv4-in-IPv6 `[::ffff:169.254.169.254]`, NAT64), and
/// including hostnames whose A/AAAA records point at one.
pub fn ensure_public_http_destination(url: &str) -> Result<(), EgressDenial> {
    judge_destination(url, &SystemResolver)
}

/// [`ensure_public_http_destination`] with the name resolver injected.
pub(crate) fn judge_destination(
    url: &str,
    resolver: &dyn HostResolver,
) -> Result<(), EgressDenial> {
    let parsed = url::Url::parse(url).map_err(|_| EgressDenial::InvalidUrl(url.to_string()))?;

    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(EgressDenial::UnsupportedScheme(scheme.to_string()));
    }

    // For `http`/`https` the url crate never yields a hostless URL — it rejects
    // `http://` and `http://:80/` outright, and reads `http:///path` as the host
    // `path` — so a missing host is an unparseable URL, not a state of its own.
    let (Some(host_str), Some(host)) = (parsed.host_str(), parsed.host()) else {
        return Err(EgressDenial::InvalidUrl(url.to_string()));
    };

    match host {
        url::Host::Ipv4(ip) => {
            if is_internal_ipv4(ip) {
                return Err(EgressDenial::InternalDestination(host_str.to_string()));
            }
        }
        url::Host::Ipv6(ip) => {
            if is_internal_ipv6(ip) {
                return Err(EgressDenial::InternalDestination(host_str.to_string()));
            }
        }
        url::Host::Domain(domain) => {
            if is_loopback_name(domain) || is_metadata_name(domain) {
                return Err(EgressDenial::InternalDestination(host_str.to_string()));
            }
            // A name whose leading labels spell a dotted quad (`10.0.0.1.nip.io`)
            // is a rebinding shortcut to that address; judge it by the address.
            if let Some(ip) = leading_ipv4_literal(domain) {
                if is_internal_ipv4(ip) {
                    return Err(EgressDenial::InternalDestination(host_str.to_string()));
                }
            }
            // The name itself proves nothing: an attacker-controlled A record is
            // the cheapest way to point a public-looking host at 169.254.169.254.
            // Judge what it resolves to. A lookup failure is not evidence that
            // the destination is public, so the public-only boundary fails
            // closed instead of letting reqwest perform a second DNS query.
            let port = parsed.port_or_known_default().unwrap_or(80);
            let addresses = resolver
                .resolve(domain, port)
                .map_err(|_| EgressDenial::UnresolvedDestination(host_str.to_string()))?;
            if addresses.is_empty() {
                return Err(EgressDenial::UnresolvedDestination(
                    host_str.to_string(),
                ));
            }
            for address in addresses {
                let internal = match address {
                    IpAddr::V4(ip) => is_internal_ipv4(ip),
                    IpAddr::V6(ip) => is_internal_ipv6(ip),
                };
                if internal {
                    return Err(EgressDenial::InternalDestination(format!(
                        "{host_str} (resolves to {address})"
                    )));
                }
            }
        }
    }

    Ok(())
}

/// Hostnames the major clouds publish for their instance metadata service.
///
/// These resolve to a link-local address only from inside the cloud that serves
/// them, so resolution alone would let them through everywhere else — including
/// on a developer laptop, where the request would then be answered by whatever
/// a hostile resolver felt like. Refusing them by name costs nothing and makes
/// the concrete IMDS case independent of where the process happens to run.
pub(crate) fn is_metadata_name(domain: &str) -> bool {
    let lower = domain.to_ascii_lowercase();
    let lower = lower.strip_suffix('.').unwrap_or(&lower);
    matches!(
        lower,
        "metadata"
            | "metadata.google.internal"
            | "metadata.goog"
            | "instance-data"
            | "instance-data.ec2.internal"
    )
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

/// Hop ceiling for a redirect chain. `reqwest`'s default policy is
/// `Policy::limited(10)`; a custom policy does not inherit its loop protection,
/// so the ceiling has to be restated here.
const MAX_REDIRECT_HOPS: usize = 10;

/// The redirect policy every outbound client is built with.
///
/// Judging only the URL a caller hands us is worthless while the client then
/// follows up to ten `Location:` headers unchecked — a front server answering
/// `302 Location: http://169.254.169.254/latest/meta-data/` turns any allowed
/// destination into a metadata read. Each hop is therefore judged by the same
/// [`ensure_public_http_destination`] the first URL went through.
///
/// One exemption: a hop that stays inside the origin it came from is followed
/// without re-judging. It cannot reach anything the first check did not already
/// permit, and it is what keeps a development API server on `localhost` — a
/// destination `ApiState::execute_request` deliberately allows — usable, since
/// those servers redirect for trailing slashes and canonical paths.
///
/// Stated plainly, because the exemption is a real (small) widening: skipping
/// the re-judgement also skips the re-RESOLUTION, so a name that answered public
/// on the first hop and private on the second is followed. That is the same DNS
/// rebinding race the module doc already declares open, not a new hole — a
/// cross-origin hop is still resolved and judged every time — but the exemption
/// does hand the race one extra turn per same-origin hop.
pub fn public_destination_redirect_policy() -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= MAX_REDIRECT_HOPS {
            return attempt.error("too many redirects");
        }

        if let Some(previous) = attempt.previous().last() {
            if same_origin(previous, attempt.url()) {
                return attempt.follow();
            }
        }

        match ensure_public_http_destination(attempt.url().as_str()) {
            Ok(()) => attempt.follow(),
            Err(denial) => attempt.error(denial),
        }
    })
}

/// Redirect policy for a public-only client.
///
/// Unlike [`public_destination_redirect_policy`], this policy has no
/// same-origin compatibility exemption: every `Location` target is resolved
/// and judged. Use this for user-, extension-, automation-, or LLM-selected
/// public URLs. Intentional loopback clients (Ollama, CDP, local API servers)
/// must keep their own explicitly local transport instead.
pub fn strict_public_destination_redirect_policy() -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= MAX_REDIRECT_HOPS {
            return attempt.error("too many redirects");
        }

        match ensure_public_http_destination(attempt.url().as_str()) {
            Ok(()) => attempt.follow(),
            Err(denial) => attempt.error(denial),
        }
    })
}

/// A reqwest client whose request builder cannot be created until the initial
/// URL is proven public, and whose redirect policy repeats that proof for every
/// hop. Keeping the inner client private prevents a caller from accidentally
/// bypassing the first-hop check while reusing the transport.
#[derive(Clone)]
pub struct PublicHttpClient {
    inner: reqwest::Client,
}

impl PublicHttpClient {
    /// Build a public-only client with reqwest's standard configuration.
    pub fn new() -> Self {
        Self::with_builder(reqwest::Client::builder())
            .expect("standard public HTTP client configuration must build")
    }

    /// Build a public-only client while retaining caller-specific settings
    /// such as timeout or user agent. The redirect policy is always replaced
    /// with the strict per-hop public policy.
    pub fn with_builder(builder: reqwest::ClientBuilder) -> Result<Self, reqwest::Error> {
        let inner = builder
            .redirect(strict_public_destination_redirect_policy())
            .build()?;
        Ok(Self { inner })
    }

    pub fn request(
        &self,
        method: reqwest::Method,
        url: &str,
    ) -> Result<reqwest::RequestBuilder, EgressDenial> {
        ensure_public_http_destination(url)?;
        Ok(self.inner.request(method, url))
    }

    pub fn get(&self, url: &str) -> Result<reqwest::RequestBuilder, EgressDenial> {
        self.request(reqwest::Method::GET, url)
    }

    pub fn post(&self, url: &str) -> Result<reqwest::RequestBuilder, EgressDenial> {
        self.request(reqwest::Method::POST, url)
    }

    pub fn put(&self, url: &str) -> Result<reqwest::RequestBuilder, EgressDenial> {
        self.request(reqwest::Method::PUT, url)
    }

    pub fn patch(&self, url: &str) -> Result<reqwest::RequestBuilder, EgressDenial> {
        self.request(reqwest::Method::PATCH, url)
    }

    pub fn delete(&self, url: &str) -> Result<reqwest::RequestBuilder, EgressDenial> {
        self.request(reqwest::Method::DELETE, url)
    }
}

impl Default for PublicHttpClient {
    fn default() -> Self {
        Self::new()
    }
}

/// True when two URLs share scheme, host and effective port.
fn same_origin(left: &url::Url, right: &url::Url) -> bool {
    left.scheme() == right.scheme()
        && left.host() == right.host()
        && left.port_or_known_default() == right.port_or_known_default()
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
    use std::collections::HashMap;

    /// A resolver with a fixed table, so the address-based judgement can be
    /// tested without depending on what the machine's DNS happens to answer.
    struct StubResolver {
        records: HashMap<&'static str, Vec<IpAddr>>,
    }

    impl StubResolver {
        fn new(records: &[(&'static str, &str)]) -> Self {
            let mut table: HashMap<&'static str, Vec<IpAddr>> = HashMap::new();
            for (host, address) in records {
                table
                    .entry(host)
                    .or_default()
                    .push(address.parse().expect("test address must parse"));
            }
            Self { records: table }
        }
    }

    impl HostResolver for StubResolver {
        fn resolve(&self, host: &str, _port: u16) -> std::io::Result<Vec<IpAddr>> {
            self.records.get(host).cloned().ok_or_else(|| {
                std::io::Error::new(std::io::ErrorKind::NotFound, "no such host in stub")
            })
        }
    }

    /// The bypass the verifier proved: the guard read the host STRING, so any
    /// name whose records point inside walked straight through.
    #[test]
    fn rejects_public_looking_names_that_resolve_to_internal_addresses() {
        let resolver = StubResolver::new(&[
            ("cdn.attacker.example", "169.254.169.254"),
            ("localtest.me", "127.0.0.1"),
            ("127-0-0-1.sslip.io", "127.0.0.1"),
            ("v6.attacker.example", "::1"),
            ("nat64.attacker.example", "64:ff9b::a9fe:a9fe"),
            // A name that answers with a public record FIRST and an internal one
            // second: reqwest may connect to either, so either one denies.
            ("mixed.attacker.example", "93.184.216.34"),
            ("mixed.attacker.example", "10.1.2.3"),
        ]);

        for host in [
            "cdn.attacker.example",
            "localtest.me",
            "127-0-0-1.sslip.io",
            "v6.attacker.example",
            "nat64.attacker.example",
            "mixed.attacker.example",
        ] {
            let url = format!("https://{host}/latest/meta-data/");
            assert!(
                matches!(
                    judge_destination(&url, &resolver),
                    Err(EgressDenial::InternalDestination(_))
                ),
                "{url} resolves inside and must be refused"
            );
        }
    }

    #[test]
    fn allows_names_whose_records_are_public() {
        let resolver = StubResolver::new(&[
            ("api.agiworkforce.com", "216.198.79.1"),
            ("ipv6.example", "2606:4700::1111"),
        ]);

        for url in [
            "https://api.agiworkforce.com/v1/models",
            "https://ipv6.example/",
        ] {
            assert!(
                judge_destination(url, &resolver).is_ok(),
                "{url} must reach the public internet"
            );
        }
    }

    /// A failed validation lookup cannot be treated as permission to let the
    /// transport perform a second, potentially different DNS lookup.
    #[test]
    fn rejects_names_that_do_not_resolve() {
        let resolver = StubResolver::new(&[]);
        assert!(matches!(
            judge_destination("https://nothing.invalid/", &resolver),
            Err(EgressDenial::UnresolvedDestination(_))
        ));
    }

    #[test]
    fn public_client_refuses_an_internal_initial_url_before_building_a_request() {
        let client = PublicHttpClient::new();
        assert!(matches!(
            client.get("http://127.0.0.1/latest/meta-data/"),
            Err(EgressDenial::InternalDestination(_))
        ));
    }

    /// These are the source-proven arbitrary-public native egress surfaces.
    /// Pinning their use of the boundary prevents a later feature edit from
    /// quietly replacing the guarded client with `reqwest::Client::new()`.
    #[test]
    fn arbitrary_public_surfaces_remain_wired_to_the_public_boundary() {
        let guarded_surfaces = [
            (
                "Discord webhook",
                include_str!("../../features/messaging/discord.rs"),
                "client: PublicHttpClient",
            ),
            (
                "generic webhook",
                include_str!("../../features/webhooks/mod.rs"),
                "client: PublicHttpClient",
            ),
            (
                "scheduler webhook",
                include_str!("../commands/scheduler.rs"),
                "egress_policy::PublicHttpClient::new()",
            ),
            (
                "LLM API upload/download",
                include_str!("../../core/llm/tool_executor/api_tools.rs"),
                "PublicHttpClient::new()",
            ),
            (
                "LLM physical scrape",
                include_str!("../../core/llm/tool_executor/search_tools.rs"),
                "PublicHttpClient::with_builder",
            ),
            (
                "AGI API tools",
                include_str!("../../core/agi/api_tools_impl.rs"),
                "execute_public_request(request)",
            ),
        ];

        for (name, source, boundary_marker) in guarded_surfaces {
            assert!(
                source.contains(boundary_marker),
                "{name} no longer uses the strict public HTTP boundary"
            );
        }
    }

    /// The canonical metadata names are refused by name, so the IMDS case does
    /// not depend on running inside the cloud that publishes their records.
    #[test]
    fn rejects_cloud_metadata_hostnames_without_resolving_them() {
        let resolver = StubResolver::new(&[]);
        for url in [
            "http://metadata.google.internal/computeMetadata/v1/",
            "http://metadata.google.internal./computeMetadata/v1/",
            "http://METADATA.GOOGLE.INTERNAL/",
            "http://metadata.goog/",
            "http://metadata/computeMetadata/v1/",
            "http://instance-data/latest/meta-data/",
        ] {
            assert!(
                matches!(
                    judge_destination(url, &resolver),
                    Err(EgressDenial::InternalDestination(_))
                ),
                "{url} must be refused without needing a resolver"
            );
            // And through the production entry point, which wires the OS
            // resolver — off-cloud these names have no records at all.
            assert!(
                matches!(
                    ensure_public_http_destination(url),
                    Err(EgressDenial::InternalDestination(_))
                ),
                "{url} must be refused by the production entry point"
            );
        }
    }

    /// The production entry point resolves through the OS. Proven on
    /// `localhost`, the one name every platform answers for without a network.
    #[test]
    fn system_resolver_reads_the_os_resolver() {
        let addresses = SystemResolver
            .resolve("localhost", 80)
            .expect("localhost must resolve on every platform");
        assert!(
            addresses.iter().any(|address| match address {
                IpAddr::V4(ip) => is_internal_ipv4(*ip),
                IpAddr::V6(ip) => is_internal_ipv6(*ip),
            }),
            "localhost must resolve to a loopback address, got {addresses:?}"
        );
    }

    /// `http:///path` — the example the deleted `MissingHost` variant claimed —
    /// is read by the url crate as the host `path`, and a hostless `http://` does
    /// not parse at all. Pinned so the variant is not reintroduced.
    #[test]
    fn http_urls_always_carry_a_host() {
        let parsed = url::Url::parse("http:///path").expect("http:///path parses");
        assert_eq!(parsed.host_str(), Some("path"));
        for url in ["http://", "http://:80/"] {
            assert!(
                matches!(
                    ensure_public_http_destination(url),
                    Err(EgressDenial::InvalidUrl(_))
                ),
                "{url} must be refused as unparseable"
            );
        }
    }

    #[test]
    fn same_origin_compares_scheme_host_and_effective_port() {
        let parse = |raw: &str| url::Url::parse(raw).expect("test URL must parse");
        assert!(same_origin(
            &parse("https://example.com/a"),
            &parse("https://example.com:443/b")
        ));
        assert!(!same_origin(
            &parse("http://127.0.0.1:8080/a"),
            &parse("http://127.0.0.1:9090/a")
        ));
        assert!(!same_origin(
            &parse("https://example.com/a"),
            &parse("http://example.com/a")
        ));
    }

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
