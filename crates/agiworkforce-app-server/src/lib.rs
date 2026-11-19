//! AGI Workforce app-server transport layer.
//!
//! The developer-session protocol runs the full host-owned agent over typed
//! JSONL stdio or authenticated WebSocket: threads, turns, streaming,
//! interruption, MCP status, and approval round-trips share one contract.

mod client;
mod developer_sessions;

pub use client::{
    BackgroundDeveloperSessionClient, DeveloperSessionClient, DeveloperSessionClientError,
    DeveloperSessionClientEvent, DeveloperSessionClientLimits,
};

pub use developer_sessions::{
    method_effect, run_developer_session_stdio, runs_detached, serve_developer_session_io,
    DeveloperConnectionTrust, DeveloperSessionHost, DeveloperSessionHostError,
    DeveloperSessionProcessor, MethodEffect, TurnClient, METHOD_EFFECTS,
};

use agiworkforce_protocol::developer_session::{
    method as developer_method, AppServerCapabilities, AppServerNotification, AppServerRequest,
    AppServerResponse,
};
use anyhow::Result;
use axum::extract::ws::{Message, WebSocket};
use axum::extract::WebSocketUpgrade;
use axum::http::header::{AUTHORIZATION, HOST, ORIGIN};
use axum::http::uri::Authority;
use axum::http::{HeaderMap, StatusCode, Uri};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use serde::Serialize;
use std::net::SocketAddr;
use std::sync::Arc;

#[derive(Debug, Clone, Default)]
pub struct WebSocketSecurity {
    pub auth_token: Option<String>,
    /// A credential separate from `auth_token` that opens only a read-only
    /// connection, in whatever placement it arrives. It is the only
    /// credential `?token=` accepts, because URLs are captured by logs and
    /// browser history; when it is unset the query is never read.
    pub read_only_token: Option<String>,
    pub allowed_origins: Vec<String>,
    pub allow_public_listen: bool,
}

impl WebSocketSecurity {
    fn authorize_listen_address(&self, addr: SocketAddr) -> Result<()> {
        if !self.allow_public_listen && !addr.ip().is_loopback() {
            anyhow::bail!(
                "app-server refuses non-loopback listen address {addr}; pass --allow-public-listen only after adding network/firewall controls"
            );
        }
        let Some(owner_token) = self
            .auth_token
            .as_deref()
            .filter(|token| !token.trim().is_empty())
        else {
            anyhow::bail!("WebSocket app-server requires a non-empty auth token");
        };
        if let Some(read_only_token) = self.read_only_token.as_deref() {
            if read_only_token.trim().is_empty() {
                anyhow::bail!("the app-server read-only token must not be empty");
            }
            if tokens_match(read_only_token.as_bytes(), owner_token.as_bytes()) {
                anyhow::bail!(
                    "the app-server read-only token must differ from the auth token, which is never accepted in a URL"
                );
            }
        }
        Ok(())
    }
}

/// Run the full typed developer-session protocol over an authenticated
/// WebSocket. Each connection receives its own handshake/client identity while
/// sharing the host's durable threads, turns, tools, MCP attachments, and
/// approval continuations.
pub async fn run_developer_session_websocket(
    addr: SocketAddr,
    security: WebSocketSecurity,
    host: Arc<dyn DeveloperSessionHost>,
    capabilities: AppServerCapabilities,
) -> Result<()> {
    security.authorize_listen_address(addr)?;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    eprintln!("Developer app server on ws://{}", listener.local_addr()?);
    serve_developer_session_websocket(listener, security, host, capabilities).await
}

/// Serve the full typed developer-session protocol on an already-bound TCP
/// listener. Accepting a listener keeps port selection race-free for embedded
/// hosts and integration tests.
pub async fn serve_developer_session_websocket(
    listener: tokio::net::TcpListener,
    security: WebSocketSecurity,
    host: Arc<dyn DeveloperSessionHost>,
    capabilities: AppServerCapabilities,
) -> Result<()> {
    let listen_addr = listener.local_addr()?;
    security.authorize_listen_address(listen_addr)?;
    let app = Router::new()
        .route(
            "/ws",
            get({
                let host = Arc::clone(&host);
                let capabilities = capabilities.clone();
                let security = security.clone();
                move |ws: WebSocketUpgrade, headers: HeaderMap, uri: Uri| {
                    let host = Arc::clone(&host);
                    let capabilities = capabilities.clone();
                    let security = security.clone();
                    async move {
                        match validate_ws_request(&headers, &uri, listen_addr, &security) {
                            Ok(trust) => ws
                                .on_upgrade(move |socket| {
                                    handle_developer_session_ws(socket, host, capabilities, trust)
                                })
                                .into_response(),
                            Err(status) => status.into_response(),
                        }
                    }
                }
            }),
        )
        .route("/health", get(|| async { "ok" }));

    axum::serve(listener, app).await?;
    Ok(())
}

/// Validate an upgrade and report which credential the connection proved.
///
/// Trust follows the credential, never its placement: anyone who reads a URL
/// can replay its token in a header. The owner token is accepted only in a
/// header, and the read-only token never grants more than read-only access.
fn validate_ws_request(
    headers: &HeaderMap,
    uri: &Uri,
    addr: SocketAddr,
    security: &WebSocketSecurity,
) -> std::result::Result<DeveloperConnectionTrust, StatusCode> {
    if !host_allowed(headers, uri, addr) {
        return Err(StatusCode::FORBIDDEN);
    }

    let owner_token = security
        .auth_token
        .as_deref()
        .filter(|token| !token.trim().is_empty())
        .ok_or(StatusCode::UNAUTHORIZED)?;
    let read_only_token = security
        .read_only_token
        .as_deref()
        .filter(|token| !token.trim().is_empty());

    let Some(presented) = request_token(headers, uri, read_only_token.is_some()) else {
        return Err(StatusCode::UNAUTHORIZED);
    };
    let is_owner = tokens_match(presented.token.as_bytes(), owner_token.as_bytes());
    let is_read_only = read_only_token
        .is_some_and(|expected| tokens_match(presented.token.as_bytes(), expected.as_bytes()));
    let trust = match (presented.placement, is_owner, is_read_only) {
        (TokenPlacement::Header, true, false) => DeveloperConnectionTrust::LoopbackOwner,
        (_, false, true) => DeveloperConnectionTrust::Untrusted,
        _ => return Err(StatusCode::UNAUTHORIZED),
    };

    if !origin_allowed(headers, addr, &security.allowed_origins) {
        return Err(StatusCode::FORBIDDEN);
    }

    Ok(trust)
}

fn host_allowed(headers: &HeaderMap, uri: &Uri, addr: SocketAddr) -> bool {
    if !addr.ip().is_loopback() {
        return true;
    }
    let Some(authority) = headers
        .get(HOST)
        .and_then(|value| value.to_str().ok())
        .or_else(|| uri.authority().map(Authority::as_str))
    else {
        return false;
    };
    let Ok(authority) = authority.trim().parse::<Authority>() else {
        return false;
    };
    let host = authority
        .host()
        .trim_start_matches('[')
        .trim_end_matches(']');
    let names_loopback = host.eq_ignore_ascii_case("localhost")
        || host
            .parse::<std::net::IpAddr>()
            .is_ok_and(|ip| ip.is_loopback());
    names_loopback && authority.port_u16().unwrap_or(80) == addr.port()
}

fn tokens_match(presented: &[u8], expected: &[u8]) -> bool {
    let mut difference = presented.len() ^ expected.len();
    for (index, expected_byte) in expected.iter().enumerate() {
        let presented_byte = presented.get(index).copied().unwrap_or(0);
        difference |= usize::from(presented_byte ^ expected_byte);
    }
    std::hint::black_box(difference) == 0
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TokenPlacement {
    Header,
    Query,
}

struct PresentedToken {
    token: String,
    placement: TokenPlacement,
}

fn request_token(headers: &HeaderMap, uri: &Uri, read_query: bool) -> Option<PresentedToken> {
    if let Some(value) = headers.get(AUTHORIZATION).and_then(|v| v.to_str().ok()) {
        if let Some(token) = value.strip_prefix("Bearer ") {
            return Some(PresentedToken {
                token: token.to_string(),
                placement: TokenPlacement::Header,
            });
        }
    }

    if let Some(value) = headers
        .get("x-agi-app-server-token")
        .and_then(|v| v.to_str().ok())
    {
        return Some(PresentedToken {
            token: value.to_string(),
            placement: TokenPlacement::Header,
        });
    }

    if read_query {
        uri.query()?.split('&').find_map(|pair| {
            let (key, value) = pair.split_once('=')?;
            (key == "token").then(|| PresentedToken {
                token: value.to_string(),
                placement: TokenPlacement::Query,
            })
        })
    } else {
        None
    }
}

fn origin_allowed(headers: &HeaderMap, addr: SocketAddr, configured: &[String]) -> bool {
    let Some(origin) = headers.get(ORIGIN).and_then(|v| v.to_str().ok()) else {
        // Defense-in-depth: when an explicit allowlist is configured, treat a
        // missing Origin as untrusted (reject) so a non-browser client cannot
        // skip the cross-site origin check by omitting the header. When no
        // explicit allowlist is set we fall back to permissive loopback defaults
        // (local dev / native tooling legitimately omit Origin); token auth in
        // `validate_ws_request` remains the mandatory boundary for that case.
        return configured.is_empty();
    };
    let origin = normalize_origin(origin);
    let allowed = if configured.is_empty() {
        default_allowed_origins(addr)
    } else {
        configured.to_vec()
    };

    allowed
        .iter()
        .map(|candidate| normalize_origin(candidate))
        .any(|candidate| candidate == origin)
}

fn normalize_origin(origin: &str) -> String {
    origin.trim().trim_end_matches('/').to_ascii_lowercase()
}

fn default_allowed_origins(addr: SocketAddr) -> Vec<String> {
    let port = addr.port();
    [
        format!("http://localhost:{port}"),
        format!("https://localhost:{port}"),
        format!("http://127.0.0.1:{port}"),
        format!("https://127.0.0.1:{port}"),
        format!("http://[::1]:{port}"),
        format!("https://[::1]:{port}"),
    ]
    .into()
}

async fn handle_developer_session_ws(
    socket: WebSocket,
    host: Arc<dyn DeveloperSessionHost>,
    capabilities: AppServerCapabilities,
    trust: DeveloperConnectionTrust,
) {
    let mut processor = DeveloperSessionProcessor::new_with_trust(host, capabilities, trust);
    let mut notifications = processor.subscribe();
    let (mut sender, mut receiver) = futures_util::StreamExt::split(socket);
    let mut initialized = false;
    let mut detached: tokio::task::JoinSet<AppServerResponse> = tokio::task::JoinSet::new();

    loop {
        tokio::select! {
            Some(finished) = detached.join_next(), if !detached.is_empty() => {
                if let Ok(response) = finished {
                    if send_developer_ws_json(&mut sender, &response).await.is_err() {
                        break;
                    }
                }
            }
            incoming = futures_util::StreamExt::next(&mut receiver) => {
                let Some(incoming) = incoming else {
                    break;
                };
                let message = match incoming {
                    Ok(message) => message,
                    Err(error) => {
                        eprintln!("Developer app-server WebSocket receive error: {error}");
                        break;
                    }
                };

                match message {
                    Message::Text(text) => {
                        let (response, is_initialize, is_shutdown) =
                            match serde_json::from_str::<AppServerRequest>(text.as_str()) {
                                Ok(request) if initialized && runs_detached(&request.method) => {
                                    match developer_sessions::spawn_detached(
                                        &mut detached,
                                        processor.clone(),
                                        request,
                                    ) {
                                        Some(refused) => (refused, false, false),
                                        None => continue,
                                    }
                                }
                                Ok(request) => {
                                    let is_initialize = request.method == developer_method::INITIALIZE;
                                    let is_shutdown = request.method == developer_method::SHUTDOWN;
                                    (processor.process(request).await, is_initialize, is_shutdown)
                                }
                                Err(error) => (
                                    AppServerResponse::failure(
                                        serde_json::Value::Null,
                                        -32700,
                                        format!("Parse error: {error}"),
                                    ),
                                    false,
                                    false,
                                ),
                            };
                        if is_initialize && response.error.is_none() {
                            initialized = true;
                        }
                        // The host waited for every admitted request before
                        // acknowledging shutdown, so their answers go out first.
                        let mut delivered = true;
                        if is_shutdown && response.error.is_none() {
                            while let Some(finished) = detached.join_next().await {
                                if let Ok(earlier) = finished {
                                    if send_developer_ws_json(&mut sender, &earlier).await.is_err() {
                                        delivered = false;
                                        break;
                                    }
                                }
                            }
                        }
                        if !delivered || send_developer_ws_json(&mut sender, &response).await.is_err() {
                            break;
                        }
                        if is_shutdown && response.error.is_none() {
                            break;
                        }
                    }
                    Message::Binary(_) => {
                        let response = AppServerResponse::failure(
                            serde_json::Value::Null,
                            -32700,
                            "Developer-session requests must be UTF-8 JSON text",
                        );
                        if send_developer_ws_json(&mut sender, &response).await.is_err() {
                            break;
                        }
                    }
                    Message::Ping(payload) => {
                        if futures_util::SinkExt::send(&mut sender, Message::Pong(payload))
                            .await
                            .is_err()
                        {
                            break;
                        }
                    }
                    Message::Pong(_) => {}
                    Message::Close(_) => break,
                }
            }
            notification = notifications.recv(), if initialized => {
                match notification {
                    Ok(notification) => {
                        if send_developer_ws_json(&mut sender, &notification).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                        let warning = match AppServerNotification::new(
                            "server/warning",
                            serde_json::json!({
                                "code": "notification_lag",
                                "skipped": skipped,
                            }),
                        ) {
                            Ok(warning) => warning,
                            Err(error) => {
                                eprintln!("Developer app-server warning serialization failed: {error}");
                                break;
                            }
                        };
                        if send_developer_ws_json(&mut sender, &warning).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }

    // A request still running belongs to the host now; its git is left to
    // finish rather than cut off with the connection.
    detached.detach_all();
    let _ = futures_util::SinkExt::close(&mut sender).await;
}

async fn send_developer_ws_json(
    sender: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    value: &impl Serialize,
) -> Result<()> {
    let serialized = serde_json::to_string(value)?;
    futures_util::SinkExt::send(sender, Message::Text(serialized.into())).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ws_security() -> WebSocketSecurity {
        WebSocketSecurity {
            auth_token: Some("secret-token".into()),
            read_only_token: None,
            allowed_origins: Vec::new(),
            allow_public_listen: false,
        }
    }

    fn ws_security_with_read_only_token() -> WebSocketSecurity {
        WebSocketSecurity {
            read_only_token: Some("read-only-token".into()),
            ..ws_security()
        }
    }

    fn loopback_headers() -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(HOST, "127.0.0.1:8787".parse().unwrap());
        headers
    }

    #[test]
    fn ws_security_rejects_missing_token() {
        let headers = loopback_headers();
        let uri: Uri = "/ws".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        assert_eq!(
            validate_ws_request(&headers, &uri, addr, &ws_security()),
            Err(StatusCode::UNAUTHORIZED)
        );
    }

    #[test]
    fn ws_security_accepts_bearer_token_and_loopback_origin() {
        let mut headers = loopback_headers();
        headers.insert(AUTHORIZATION, "Bearer secret-token".parse().unwrap());
        headers.insert(ORIGIN, "http://localhost:8787".parse().unwrap());
        let uri: Uri = "/ws".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        assert_eq!(
            validate_ws_request(&headers, &uri, addr, &ws_security()),
            Ok(DeveloperConnectionTrust::LoopbackOwner)
        );
    }

    #[test]
    fn ws_security_accepts_custom_header_token() {
        let mut headers = loopback_headers();
        headers.insert("x-agi-app-server-token", "secret-token".parse().unwrap());
        let uri: Uri = "/ws".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        assert_eq!(
            validate_ws_request(&headers, &uri, addr, &ws_security()),
            Ok(DeveloperConnectionTrust::LoopbackOwner)
        );
    }

    #[test]
    fn ws_security_rejects_query_token_by_default() {
        let headers = loopback_headers();
        let uri: Uri = "/ws?token=secret-token".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        assert_eq!(
            validate_ws_request(&headers, &uri, addr, &ws_security()),
            Err(StatusCode::UNAUTHORIZED)
        );
    }

    #[test]
    fn ws_security_accepts_the_read_only_token_in_the_query_as_untrusted() {
        let headers = loopback_headers();
        let uri: Uri = "/ws?token=read-only-token".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        assert_eq!(
            validate_ws_request(&headers, &uri, addr, &ws_security_with_read_only_token()),
            Ok(DeveloperConnectionTrust::Untrusted)
        );
    }

    #[test]
    fn ws_security_refuses_the_owner_token_in_the_query() {
        let headers = loopback_headers();
        let uri: Uri = "/ws?token=secret-token".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        assert_eq!(
            validate_ws_request(&headers, &uri, addr, &ws_security_with_read_only_token()),
            Err(StatusCode::UNAUTHORIZED)
        );
    }

    #[test]
    fn ws_security_never_makes_the_read_only_token_an_owner_in_a_header() {
        let uri: Uri = "/ws".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        for (name, value) in [
            (AUTHORIZATION.as_str(), "Bearer read-only-token"),
            ("x-agi-app-server-token", "read-only-token"),
        ] {
            let mut headers = loopback_headers();
            headers.insert(name, value.parse().unwrap());
            assert_eq!(
                validate_ws_request(&headers, &uri, addr, &ws_security_with_read_only_token()),
                Ok(DeveloperConnectionTrust::Untrusted),
                "{name}"
            );
        }
    }

    #[test]
    fn ws_security_keeps_the_owner_token_in_a_header_as_owner() {
        let mut headers = loopback_headers();
        headers.insert(AUTHORIZATION, "Bearer secret-token".parse().unwrap());
        let uri: Uri = "/ws?token=read-only-token".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        assert_eq!(
            validate_ws_request(&headers, &uri, addr, &ws_security_with_read_only_token()),
            Ok(DeveloperConnectionTrust::LoopbackOwner)
        );
    }

    #[test]
    fn ws_security_refuses_a_read_only_token_that_matches_neither_secret() {
        let headers = loopback_headers();
        let uri: Uri = "/ws?token=read-only-tokeN".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        assert_eq!(
            validate_ws_request(&headers, &uri, addr, &ws_security_with_read_only_token()),
            Err(StatusCode::UNAUTHORIZED)
        );
    }

    #[test]
    fn a_read_only_token_must_be_its_own_secret() {
        let loopback: SocketAddr = "127.0.0.1:8788".parse().unwrap();
        assert!(ws_security_with_read_only_token()
            .authorize_listen_address(loopback)
            .is_ok());
        for read_only_token in ["secret-token", "", "  "] {
            let security = WebSocketSecurity {
                read_only_token: Some(read_only_token.into()),
                ..ws_security()
            };
            assert!(
                security.authorize_listen_address(loopback).is_err(),
                "{read_only_token:?}"
            );
        }
    }

    #[test]
    fn ws_security_rejects_untrusted_origin() {
        let mut headers = loopback_headers();
        headers.insert(AUTHORIZATION, "Bearer secret-token".parse().unwrap());
        headers.insert(ORIGIN, "https://evil.example".parse().unwrap());
        let uri: Uri = "/ws".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        assert_eq!(
            validate_ws_request(&headers, &uri, addr, &ws_security()),
            Err(StatusCode::FORBIDDEN)
        );
    }

    #[test]
    fn ws_security_rejects_missing_origin_when_allowlist_configured() {
        // Defense-in-depth: with an explicit allowlist set, a request that omits
        // the Origin header must not bypass the cross-site origin check.
        let mut headers = loopback_headers();
        headers.insert(AUTHORIZATION, "Bearer secret-token".parse().unwrap());
        let uri: Uri = "/ws".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        let mut security = ws_security();
        security.allowed_origins = vec!["https://trusted.example".into()];
        assert_eq!(
            validate_ws_request(&headers, &uri, addr, &security),
            Err(StatusCode::FORBIDDEN)
        );
    }

    #[test]
    fn ws_security_allows_missing_origin_without_explicit_allowlist() {
        // With no explicit allowlist (defaults), missing Origin stays permissive
        // for native/local tooling; token auth remains the mandatory boundary.
        let mut headers = loopback_headers();
        headers.insert(AUTHORIZATION, "Bearer secret-token".parse().unwrap());
        let uri: Uri = "/ws".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        assert_eq!(
            validate_ws_request(&headers, &uri, addr, &ws_security()),
            Ok(DeveloperConnectionTrust::LoopbackOwner)
        );
    }

    #[test]
    fn ws_security_rejects_a_host_the_loopback_server_is_not_bound_to() {
        let uri: Uri = "/ws".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        for host in [
            "attacker.example:8787",
            "localhost.attacker.example:8787",
            "localhost:9999",
            "192.168.1.20:8787",
            "",
        ] {
            let mut headers = HeaderMap::new();
            headers.insert(HOST, host.parse().unwrap());
            headers.insert(AUTHORIZATION, "Bearer secret-token".parse().unwrap());
            assert_eq!(
                validate_ws_request(&headers, &uri, addr, &ws_security()),
                Err(StatusCode::FORBIDDEN),
                "{host}"
            );
        }
    }

    #[test]
    fn ws_security_accepts_every_loopback_name_for_the_bound_port() {
        let uri: Uri = "/ws".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        for host in [
            "127.0.0.1:8787",
            "localhost:8787",
            "LOCALHOST:8787",
            "[::1]:8787",
        ] {
            let mut headers = HeaderMap::new();
            headers.insert(HOST, host.parse().unwrap());
            headers.insert(AUTHORIZATION, "Bearer secret-token".parse().unwrap());
            assert_eq!(
                validate_ws_request(&headers, &uri, addr, &ws_security()),
                Ok(DeveloperConnectionTrust::LoopbackOwner),
                "{host}"
            );
        }
    }

    #[test]
    fn ws_security_rejects_tokens_that_only_share_a_prefix() {
        let uri: Uri = "/ws".parse().unwrap();
        let addr: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        for presented in ["secret", "secret-token-2", "secret-tokeN", ""] {
            let mut headers = loopback_headers();
            headers.insert(
                AUTHORIZATION,
                format!("Bearer {presented}").parse().unwrap(),
            );
            assert_eq!(
                validate_ws_request(&headers, &uri, addr, &ws_security()),
                Err(StatusCode::UNAUTHORIZED),
                "{presented}"
            );
        }
        assert!(tokens_match(b"secret-token", b"secret-token"));
        assert!(!tokens_match(b"secret-token", b"secret-tokem"));
        assert!(!tokens_match(b"secret-token\0", b"secret-token"));
    }

    #[test]
    fn a_public_listen_address_needs_the_explicit_opt_in() {
        let public: SocketAddr = "0.0.0.0:8788".parse().unwrap();
        let loopback: SocketAddr = "127.0.0.1:8788".parse().unwrap();
        assert!(ws_security().authorize_listen_address(public).is_err());
        assert!(ws_security().authorize_listen_address(loopback).is_ok());
        let mut opted_in = ws_security();
        opted_in.allow_public_listen = true;
        assert!(opted_in.authorize_listen_address(public).is_ok());
    }
}
