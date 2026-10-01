use anyhow::{Context, Result, anyhow, bail};
use futures_util::StreamExt;
use serde_json::{Value, json};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use super::sse_stream::SseDecoder;
use crate::cache::Events;
use crate::config::{McpTimeouts, OAuthConfig};
use crate::error::TransportFault;
use crate::hooks::{ClientHooks, OAuthToken};
use crate::jsonrpc::{error_body, matching_response, request_frame};
use crate::oauth::flow::{parse_insufficient_scope, perform_full_oauth, refresh_token};
use crate::peer_requests;
use crate::protocol::{
    HEADER_METHOD, HEADER_PROTOCOL_VERSION, HEADER_SESSION_ID, META_SUBSCRIPTION_ID,
};

const MAX_DIAGNOSTIC_BODY_BYTES: usize = 64 * 1024;
const MAX_REDIRECT_HOPS: usize = 5;
const LISTEN_MAX_FAILURES: u32 = 5;
const LISTEN_MAX_BACKOFF: Duration = Duration::from_secs(60);

const CREDENTIAL_HEADER_MARKERS: [&str; 9] = [
    "auth",
    "key",
    "token",
    "secret",
    "credential",
    "cookie",
    "password",
    "session",
    "signature",
];

pub(crate) struct HttpConn {
    server_name: String,
    url: String,
    headers: HashMap<String, String>,
    client: reqwest::Client,
    oauth: Option<OAuthConfig>,
    hooks: ClientHooks,
    events: Arc<Events>,
    max_frame: usize,
    max_response: u64,
    session_id: Option<String>,
    auth_epoch: u64,
}

pub(crate) struct Exchange<'a> {
    pub(crate) id: &'a Value,
    pub(crate) method: &'a str,
    pub(crate) frame: &'a Value,
    pub(crate) headers: &'a [(String, String)],
    pub(crate) timeout: Duration,
    pub(crate) legacy: bool,
}

enum Outcome {
    Done(Option<Value>),
    Challenge {
        www_authenticate: Option<String>,
        status: u16,
        body: String,
    },
}

impl HttpConn {
    pub(crate) fn connect(
        server_name: &str,
        url: &str,
        headers: &HashMap<String, String>,
        oauth: Option<&OAuthConfig>,
        timeouts: &McpTimeouts,
        hooks: ClientHooks,
        events: Arc<Events>,
    ) -> Result<Self> {
        if timeouts.validate_urls {
            crate::security::validate_server_url(url).context("[mcp http]")?;
        }
        refuse_cleartext_credentials(url, headers_carry_credentials(headers) || oauth.is_some())
            .context("[mcp http]")?;
        let builder = reqwest::Client::builder().redirect(pinned_redirect_policy(url));
        crate::security::enforce_tls_verification_policy(url, timeouts.verify_tls)
            .context("[mcp http]")?;
        #[cfg(debug_assertions)]
        let builder = if timeouts.verify_tls {
            builder
        } else {
            builder.danger_accept_invalid_certs(true)
        };
        let builder = match timeouts.connect_timeout {
            Some(connect) => builder.connect_timeout(connect),
            None => builder,
        };
        let client = builder.build().context("build reqwest client")?;

        Ok(Self {
            server_name: server_name.to_string(),
            url: url.to_string(),
            headers: headers.clone(),
            client,
            oauth: oauth.cloned(),
            hooks,
            events,
            max_frame: timeouts.frame_cap(),
            max_response: timeouts.response_cap(),
            session_id: None,
            auth_epoch: 0,
        })
    }

    pub(crate) fn auth_epoch(&self) -> u64 {
        self.auth_epoch
    }

    pub(crate) async fn exchange(&mut self, request: &Exchange<'_>) -> Result<Option<Value>> {
        let bearer = self.bearer().await;
        match self.send_once(request, bearer.as_deref()).await? {
            Outcome::Done(value) => Ok(value),
            Outcome::Challenge {
                www_authenticate,
                status,
                body,
            } => {
                if status == reqwest::StatusCode::UNAUTHORIZED.as_u16()
                    && let Some(refreshed) = self.refreshed_bearer().await
                    && let Outcome::Done(value) = self.send_once(request, Some(&refreshed)).await?
                {
                    return Ok(value);
                }
                let bearer = self
                    .authorize(www_authenticate.as_deref(), request.method, status, &body)
                    .await?;
                match self.send_once(request, Some(&bearer)).await? {
                    Outcome::Done(value) => Ok(value),
                    Outcome::Challenge { status, body, .. } => bail!(
                        "[{}] [mcp http] OAuth flow completed but request still rejected with {status} \
                         on '{}', check that scopes match what the server requires. body: {body}",
                        self.server_name,
                        request.method
                    ),
                }
            }
        }
    }

    pub(crate) async fn notify(&mut self, frame: &Value, headers: &[(String, String)]) {
        let method = frame
            .get("method")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let bearer = self.cached_bearer();
        if let Err(e) = refuse_cleartext_credentials(
            &self.url,
            bearer.is_some() || headers_carry_credentials(&self.headers),
        ) {
            eprintln!(
                "[{}] HTTP: notification '{method}' not sent: {e:#}",
                self.server_name
            );
            return;
        }
        let request = self.post(frame, headers, true, bearer.as_deref());
        if let Err(e) = request.send().await {
            eprintln!(
                "[{}] HTTP: notification '{method}' POST failed: {e}",
                self.server_name
            );
        }
    }

    pub(crate) async fn end_session(&mut self) {
        let Some(session_id) = self.session_id.take() else {
            return;
        };
        let mut request = self
            .client
            .delete(&self.url)
            .header(HEADER_SESSION_ID, session_id);
        for (k, v) in &self.headers {
            request = request.header(k, v);
        }
        if let Some(bearer) = self.cached_bearer() {
            request = request.header("Authorization", format!("Bearer {bearer}"));
        }
        let _ = tokio::time::timeout(Duration::from_secs(5), request.send()).await;
    }

    pub(crate) fn listener(&self) -> Listener {
        Listener {
            server_name: self.server_name.clone(),
            url: self.url.clone(),
            headers: self.headers.clone(),
            client: self.client.clone(),
            oauth: self.oauth.clone(),
            hooks: self.hooks.clone(),
            events: Arc::clone(&self.events),
            max_frame: self.max_frame,
        }
    }

    async fn bearer(&self) -> Option<String> {
        match &self.oauth {
            Some(cfg) => prepare_bearer(&self.url, cfg, &self.hooks).await,
            None => None,
        }
    }

    async fn refreshed_bearer(&self) -> Option<String> {
        let cfg = self.oauth.as_ref()?;
        let cached = self.hooks.token_store.get(&self.url)?;
        cached.refresh_token.as_ref()?;
        match refresh_token(&cached, cfg, &self.url).await {
            Ok(refreshed) => {
                let access = refreshed.access_token.clone();
                if let Err(e) = self.hooks.token_store.set(&self.url, refreshed) {
                    eprintln!(
                        "[{}] [mcp http] warning: failed to persist the refreshed OAuth token: {e}",
                        self.server_name
                    );
                }
                Some(access)
            }
            Err(e) => {
                eprintln!(
                    "[{}] [mcp oauth] the server rejected the stored refresh token ({e})",
                    self.server_name
                );
                None
            }
        }
    }

    fn cached_bearer(&self) -> Option<String> {
        self.oauth.as_ref()?;
        self.hooks
            .token_store
            .get(&self.url)
            .filter(|token| !token.is_expiring_soon(60))
            .map(|token| token.access_token)
    }

    async fn authorize(
        &mut self,
        www_authenticate: Option<&str>,
        method: &str,
        status: u16,
        body: &str,
    ) -> Result<String> {
        let server = self.server_name.clone();
        let Some(cfg) = self.oauth.clone() else {
            return Err(TransportFault::HttpStatus {
                server,
                status,
                method: method.to_string(),
                body: format!("no OAuth configured: {body}"),
            }
            .into());
        };
        if !self.hooks.browser.is_interactive() {
            return Err(TransportFault::AuthorizationRequired {
                server,
                url: self.url.clone(),
                status,
                method: method.to_string(),
                challenged_scope: parse_insufficient_scope(www_authenticate),
            }
            .into());
        }
        eprintln!(
            "[{server}] [mcp http] received {status} on '{method}', running OAuth flow{}",
            parse_insufficient_scope(www_authenticate)
                .map(|scope| format!(" (step-up scope: {scope})"))
                .unwrap_or_default()
        );
        let token = perform_full_oauth(&self.url, &cfg, www_authenticate, &self.hooks)
            .await
            .with_context(|| format!("[{server}] OAuth flow failed"))?;
        if let Err(e) = self.hooks.token_store.set(&self.url, token.clone()) {
            eprintln!("[{server}] [mcp http] warning: failed to persist OAuth token: {e}");
        }
        self.auth_epoch += 1;
        Ok(token.access_token)
    }

    fn post(
        &self,
        frame: &Value,
        headers: &[(String, String)],
        legacy: bool,
        bearer: Option<&str>,
    ) -> reqwest::RequestBuilder {
        let mut request = self
            .client
            .post(&self.url)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json, text/event-stream")
            .json(frame);
        for (k, v) in &self.headers {
            request = request.header(k, v);
        }
        for (k, v) in headers {
            request = request.header(k, v);
        }
        if legacy && let Some(session_id) = self.session_id.as_deref() {
            request = request.header(HEADER_SESSION_ID, session_id);
        }
        if let Some(bearer) = bearer {
            request = request.header("Authorization", format!("Bearer {bearer}"));
        }
        request
    }

    async fn send_once(&mut self, request: &Exchange<'_>, bearer: Option<&str>) -> Result<Outcome> {
        let server = self.server_name.clone();
        let method = request.method;
        refuse_cleartext_credentials(
            &self.url,
            bearer.is_some() || headers_carry_credentials(&self.headers),
        )
        .with_context(|| format!("[{server}] [mcp http] '{method}'"))?;

        let post = self.post(request.frame, request.headers, request.legacy, bearer);
        let resp = match tokio::time::timeout(request.timeout, post.send()).await {
            Ok(r) => r.with_context(|| format!("[{server}] [mcp http] POST '{method}' failed"))?,
            Err(_) => bail!(
                "[{server}] [mcp http] POST timeout ({}ms) on '{method}'",
                request.timeout.as_millis()
            ),
        };

        if request.legacy
            && let Some(session_id) = resp
                .headers()
                .get(HEADER_SESSION_ID)
                .and_then(|v| v.to_str().ok())
        {
            self.session_id = Some(session_id.to_string());
        }

        let status = resp.status();
        if status == reqwest::StatusCode::ACCEPTED {
            return Ok(Outcome::Done(None));
        }

        let www_authenticate = resp
            .headers()
            .get("WWW-Authenticate")
            .and_then(|v| v.to_str().ok())
            .map(String::from);
        let step_up = status == reqwest::StatusCode::FORBIDDEN
            && parse_insufficient_scope(www_authenticate.as_deref()).is_some();
        if status == reqwest::StatusCode::UNAUTHORIZED || step_up {
            let body = read_text_capped(resp).await;
            return Ok(Outcome::Challenge {
                www_authenticate,
                status: status.as_u16(),
                body,
            });
        }

        if !status.is_success() {
            let body = read_capped_bytes(resp).await;
            if request.legacy
                && status == reqwest::StatusCode::NOT_FOUND
                && self.session_id.take().is_some()
            {
                return Err(TransportFault::SessionExpired {
                    server,
                    method: method.to_string(),
                }
                .into());
            }
            if let Some(peer) = error_body(&body, &server) {
                return Err(peer.into());
            }
            return Err(TransportFault::HttpStatus {
                server,
                status: status.as_u16(),
                method: method.to_string(),
                body: String::from_utf8_lossy(&body).into_owned(),
            }
            .into());
        }

        let event_stream = resp
            .headers()
            .get("Content-Type")
            .and_then(|v| v.to_str().ok())
            .is_some_and(|ct| ct.starts_with("text/event-stream"));
        if event_stream {
            return self.read_stream(resp, request).await.map(Outcome::Done);
        }

        let raw = read_body_capped(resp, self.max_response)
            .await
            .with_context(|| format!("[{server}] [mcp http] on '{method}'"))?;
        let value: Value = serde_json::from_slice(&raw)
            .with_context(|| format!("[{server}] [mcp http] parse json body on '{method}'"))?;
        Ok(Outcome::Done(matching_response(&value, request.id)))
    }

    async fn read_stream(
        &self,
        resp: reqwest::Response,
        request: &Exchange<'_>,
    ) -> Result<Option<Value>> {
        let server = &self.server_name;
        let method = request.method;
        let mut stream = resp.bytes_stream();
        let mut decoder = SseDecoder::new(self.max_frame);
        loop {
            let next = tokio::time::timeout(request.timeout, stream.next())
                .await
                .map_err(|_| TransportFault::Timeout {
                    server: server.clone(),
                    millis: request.timeout.as_millis(),
                    method: method.to_string(),
                })?;
            let chunk = match next {
                Some(Ok(chunk)) => chunk,
                Some(Err(_)) | None => {
                    return Err(TransportFault::StreamBroke {
                        server: server.clone(),
                        method: method.to_string(),
                    }
                    .into());
                }
            };
            let events = decoder
                .push(&chunk)
                .map_err(|e| anyhow!("[{server}] [mcp http] sse-upgrade {e} on '{method}'"))?;
            for event in events {
                let value: Value = serde_json::from_str(&event.data).with_context(|| {
                    format!("[{server}] [mcp http] invalid JSON in sse-upgrade frame on '{method}'")
                })?;
                if let Some(frame) = matching_response(&value, request.id) {
                    return Ok(Some(frame));
                }
                self.handle_side_message(&value, request.legacy).await;
            }
        }
    }

    async fn handle_side_message(&self, value: &Value, legacy: bool) {
        if let Some((method, params)) = peer_requests::notification(value) {
            self.events.notify(method, params);
            return;
        }
        let Some((method, id, params)) = peer_requests::server_request(value) else {
            return;
        };
        if !legacy {
            tracing::warn!(
                "[{}] ignoring server-initiated '{method}' on a stateless response stream",
                self.server_name
            );
            return;
        }
        let reply =
            peer_requests::answer(&self.server_name, &self.hooks, &method, id, params).await;
        let request = self.post(&reply, &[], true, self.cached_bearer().as_deref());
        if let Err(e) = request.send().await {
            eprintln!(
                "[{}] reply to server request '{method}' failed: {e}",
                self.server_name
            );
        }
    }
}

pub(crate) struct Listener {
    server_name: String,
    url: String,
    headers: HashMap<String, String>,
    client: reqwest::Client,
    oauth: Option<OAuthConfig>,
    hooks: ClientHooks,
    events: Arc<Events>,
    max_frame: usize,
}

enum ListenEnd {
    Graceful,
    Dropped,
    Retry(anyhow::Error),
    Fatal(anyhow::Error),
}

impl Listener {
    pub(crate) async fn run(self, protocol_version: String, params: Value) {
        let mut failures = 0u32;
        let mut sequence = 0u64;
        loop {
            sequence += 1;
            let id = json!(format!("subscription-{sequence}"));
            match self.listen_once(&id, &protocol_version, &params).await {
                ListenEnd::Graceful => return,
                ListenEnd::Dropped => failures = 0,
                ListenEnd::Retry(error) => {
                    failures += 1;
                    if failures >= LISTEN_MAX_FAILURES {
                        tracing::warn!(
                            "[{}] giving up on change notifications after {failures} attempts: {error:#}",
                            self.server_name
                        );
                        return;
                    }
                }
                ListenEnd::Fatal(error) => {
                    tracing::warn!(
                        "[{}] change notifications unavailable: {error:#}",
                        self.server_name
                    );
                    return;
                }
            }
            let backoff = Duration::from_secs(1u64 << failures.min(6)).min(LISTEN_MAX_BACKOFF);
            tokio::time::sleep(backoff).await;
        }
    }

    async fn listen_once(&self, id: &Value, protocol_version: &str, params: &Value) -> ListenEnd {
        let bearer = match &self.oauth {
            Some(cfg) => prepare_bearer(&self.url, cfg, &self.hooks).await,
            None => None,
        };
        if let Err(e) = refuse_cleartext_credentials(
            &self.url,
            bearer.is_some() || headers_carry_credentials(&self.headers),
        ) {
            return ListenEnd::Fatal(e);
        }
        let frame = request_frame(id, "subscriptions/listen", Some(params.clone()));
        let mut request = self
            .client
            .post(&self.url)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json, text/event-stream")
            .header(HEADER_PROTOCOL_VERSION, protocol_version)
            .header(HEADER_METHOD, "subscriptions/listen")
            .json(&frame);
        for (k, v) in &self.headers {
            request = request.header(k, v);
        }
        if let Some(bearer) = bearer {
            request = request.header("Authorization", format!("Bearer {bearer}"));
        }
        let resp = match request.send().await {
            Ok(resp) => resp,
            Err(e) => return ListenEnd::Retry(e.into()),
        };
        let status = resp.status();
        if status.is_server_error() {
            return ListenEnd::Retry(anyhow!("subscriptions/listen returned {status}"));
        }
        if !status.is_success() {
            return ListenEnd::Fatal(anyhow!("subscriptions/listen returned {status}"));
        }
        let mut stream = resp.bytes_stream();
        let mut decoder = SseDecoder::new(self.max_frame);
        while let Some(chunk) = stream.next().await {
            let Ok(chunk) = chunk else {
                return ListenEnd::Dropped;
            };
            let events = match decoder.push(&chunk) {
                Ok(events) => events,
                Err(e) => return ListenEnd::Retry(e),
            };
            for event in events {
                let Ok(value) = serde_json::from_str::<Value>(&event.data) else {
                    continue;
                };
                if matching_response(&value, id).is_some() {
                    return ListenEnd::Graceful;
                }
                let Some((method, params)) = peer_requests::notification(&value) else {
                    continue;
                };
                let tagged = params
                    .get("_meta")
                    .and_then(|meta| meta.get(META_SUBSCRIPTION_ID))
                    == Some(id);
                if tagged && method != "notifications/subscriptions/acknowledged" {
                    self.events.notify(method, params);
                }
            }
        }
        ListenEnd::Dropped
    }
}

pub(crate) fn refuse_cleartext_credentials(url: &str, has_credentials: bool) -> Result<()> {
    if !has_credentials {
        return Ok(());
    }
    crate::security::enforce_https_for_remote(url)
        .context("refusing to send MCP credentials in cleartext")
}

pub(crate) fn headers_carry_credentials(headers: &HashMap<String, String>) -> bool {
    headers.keys().any(|name| {
        let lower = name.to_ascii_lowercase();
        CREDENTIAL_HEADER_MARKERS
            .iter()
            .any(|marker| lower.contains(marker))
    })
}

pub(crate) fn pinned_redirect_policy(url: &str) -> reqwest::redirect::Policy {
    let pinned = url.to_string();
    reqwest::redirect::Policy::custom(move |attempt| {
        if attempt.previous().len() >= MAX_REDIRECT_HOPS {
            return attempt.error(format!("more than {MAX_REDIRECT_HOPS} MCP redirects"));
        }
        match crate::security::enforce_same_origin(
            &pinned,
            attempt.url().as_str(),
            "MCP redirect target",
        ) {
            Ok(()) => attempt.follow(),
            Err(e) => attempt.error(format!("{e:#}")),
        }
    })
}

pub(crate) async fn read_body_capped(mut resp: reqwest::Response, cap: u64) -> Result<Vec<u8>> {
    if let Some(len) = resp.content_length() {
        if len > cap {
            bail!("response too large ({len} bytes, max {cap} bytes)");
        }
    }
    let mut out: Vec<u8> = Vec::new();
    while let Some(chunk) = resp.chunk().await.context("read response body")? {
        if out.len() as u64 + chunk.len() as u64 > cap {
            bail!("response too large (over {cap} bytes)");
        }
        out.extend_from_slice(&chunk);
    }
    Ok(out)
}

async fn read_capped_bytes(mut resp: reqwest::Response) -> Vec<u8> {
    let mut out: Vec<u8> = Vec::new();
    while let Ok(Some(chunk)) = resp.chunk().await {
        let room = MAX_DIAGNOSTIC_BODY_BYTES.saturating_sub(out.len());
        if room == 0 {
            break;
        }
        out.extend_from_slice(&chunk[..chunk.len().min(room)]);
    }
    out
}

pub(crate) async fn read_text_capped(resp: reqwest::Response) -> String {
    String::from_utf8_lossy(&read_capped_bytes(resp).await).into_owned()
}

async fn prepare_bearer(url: &str, cfg: &OAuthConfig, hooks: &ClientHooks) -> Option<String> {
    let cached = hooks.token_store.get(url)?;

    if !cached.is_expiring_soon(60) {
        return Some(cached.access_token);
    }

    match refresh_token(&cached, cfg, url).await {
        Ok(refreshed) => {
            let access = refreshed.access_token.clone();
            let merged = OAuthToken {
                auth_server_metadata_url: refreshed
                    .auth_server_metadata_url
                    .clone()
                    .or(cached.auth_server_metadata_url),
                ..refreshed
            };
            let _ = hooks.token_store.set(url, merged);
            Some(access)
        }
        Err(e) => {
            eprintln!("[mcp oauth] refresh for {url} failed ({e}); will re-auth on 401");
            None
        }
    }
}

#[cfg(test)]
pub(crate) mod raw_http {
    use std::collections::VecDeque;
    use std::net::SocketAddr;
    use std::sync::{Arc, Mutex};

    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::{TcpListener, TcpStream};

    use crate::jsonrpc::find_subsequence;

    async fn read_request(sock: &mut TcpStream) -> String {
        let mut buf: Vec<u8> = Vec::new();
        let mut chunk = [0u8; 1024];
        loop {
            if let Some(pos) = find_subsequence(&buf, b"\r\n\r\n") {
                let head = String::from_utf8_lossy(&buf[..pos]).to_ascii_lowercase();
                let len: usize = head
                    .lines()
                    .find_map(|line| line.strip_prefix("content-length:"))
                    .and_then(|v| v.trim().parse().ok())
                    .unwrap_or(0);
                if buf.len() >= pos + 4 + len {
                    break;
                }
            }
            match sock.read(&mut chunk).await {
                Ok(0) | Err(_) => break,
                Ok(n) => buf.extend_from_slice(&chunk[..n]),
            }
        }
        String::from_utf8_lossy(&buf).into_owned()
    }

    pub(crate) async fn spawn_collector() -> (SocketAddr, Arc<Mutex<Vec<String>>>) {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind collector");
        let addr = listener.local_addr().expect("collector addr");
        let hits: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&hits);
        tokio::spawn(async move {
            while let Ok((mut sock, _)) = listener.accept().await {
                let req = read_request(&mut sock).await;
                sink.lock().expect("collector lock").push(req);
                let _ = sock
                    .write_all(
                        b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}",
                    )
                    .await;
            }
        });
        (addr, hits)
    }

    pub(crate) async fn spawn_scripted(script: Vec<String>) -> SocketAddr {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind scripted");
        let addr = listener.local_addr().expect("scripted addr");
        let queue = Arc::new(Mutex::new(VecDeque::from(script)));
        tokio::spawn(async move {
            while let Ok((mut sock, _)) = listener.accept().await {
                let queue = Arc::clone(&queue);
                tokio::spawn(async move {
                    loop {
                        if read_request(&mut sock).await.is_empty() {
                            return;
                        }
                        let next = queue.lock().expect("script lock").pop_front();
                        let Some(resp) = next else { return };
                        if sock.write_all(resp.as_bytes()).await.is_err() {
                            return;
                        }
                    }
                });
            }
        });
        addr
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::elicitation::AutoDeclineHandler;
    use crate::hooks::{DenyBrowserAuthorizer, InMemoryTokenStore, noop_log};

    fn api_key_headers() -> HashMap<String, String> {
        HashMap::from([("X-Api-Key".to_string(), "STATIC_API_KEY".to_string())])
    }

    fn http_conn(url: &str, headers: &HashMap<String, String>) -> HttpConn {
        let hooks = ClientHooks {
            token_store: Arc::new(InMemoryTokenStore::new()),
            elicitation: Arc::new(AutoDeclineHandler),
            browser: Arc::new(DenyBrowserAuthorizer),
            client_info: crate::hooks::ClientInfo {
                name: "unit-test".to_string(),
                version: "0.0.0".to_string(),
            },
            client_metadata_url: None,
            on_log: noop_log(),
        };
        let (tx, _rx) = tokio::sync::mpsc::channel(1);
        HttpConn::connect(
            "redirect",
            url,
            headers,
            None,
            &McpTimeouts::default(),
            hooks,
            Arc::new(Events::new(tx, &McpTimeouts::default())),
        )
        .expect("connect")
    }

    async fn post_once(conn: &mut HttpConn) -> Result<Outcome> {
        let id = json!(1);
        let frame = request_frame(&id, "tools/call", None);
        conn.send_once(
            &Exchange {
                id: &id,
                method: "tools/call",
                frame: &frame,
                headers: &[],
                timeout: Duration::from_secs(5),
                legacy: false,
            },
            Some("OAUTH_TOKEN"),
        )
        .await
    }

    #[tokio::test]
    async fn cross_origin_redirect_on_a_credentialed_post_is_refused() {
        let (collector, hits) = raw_http::spawn_collector().await;
        let server = raw_http::spawn_scripted(vec![format!(
            "HTTP/1.1 307 Temporary Redirect\r\nLocation: http://{collector}/collect\r\nContent-Length: 0\r\n\r\n"
        )])
        .await;

        let url = format!("http://{server}/");
        let mut conn = http_conn(&url, &api_key_headers());

        let result = post_once(&mut conn).await;

        let seen = hits.lock().expect("collector lock").clone();
        assert!(seen.is_empty(), "attacker origin was contacted: {seen:?}");
        let err = result
            .err()
            .expect("a cross-origin redirect must not be followed");
        assert!(format!("{err:#}").contains("tools/call"), "{err:#}");
    }

    #[tokio::test]
    async fn same_origin_redirect_is_still_followed() {
        let body = r#"{"jsonrpc":"2.0","id":1,"result":{"ok":true}}"#;
        let len = body.len();
        let server = raw_http::spawn_scripted(vec![
            "HTTP/1.1 307 Temporary Redirect\r\nLocation: /v2\r\nContent-Length: 0\r\n\r\n"
                .to_string(),
            format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {len}\r\n\r\n{body}"
            ),
        ])
        .await;

        let url = format!("http://{server}/");
        let mut conn = http_conn(&url, &api_key_headers());

        let outcome = post_once(&mut conn)
            .await
            .expect("a same-origin redirect must still be followed");
        assert!(matches!(outcome, Outcome::Done(Some(_))));
    }

    #[test]
    fn only_credential_shaped_headers_gate_the_cleartext_refusal() {
        assert!(headers_carry_credentials(&api_key_headers()));
        assert!(headers_carry_credentials(&HashMap::from([(
            "authorization".to_string(),
            "Bearer s3cret".to_string()
        )])));
        assert!(headers_carry_credentials(&HashMap::from([(
            "X-Auth-Token".to_string(),
            "s3cret".to_string()
        )])));
        assert!(!headers_carry_credentials(&HashMap::from([(
            "X-Client".to_string(),
            "agi".to_string()
        )])));
        assert!(!headers_carry_credentials(&HashMap::new()));
    }

    #[test]
    fn credentials_are_refused_over_cleartext_to_a_remote_host() {
        let err = refuse_cleartext_credentials("http://mcp.example.com/", true)
            .expect_err("cleartext credentials must be refused");
        assert!(format!("{err:#}").contains("must use HTTPS"), "{err:#}");
    }

    #[test]
    fn cleartext_without_credentials_stays_allowed() {
        assert!(refuse_cleartext_credentials("http://mcp.example.com/", false).is_ok());
    }

    #[test]
    fn loopback_and_https_stay_allowed_with_credentials() {
        assert!(refuse_cleartext_credentials("http://127.0.0.1:3000/", true).is_ok());
        assert!(refuse_cleartext_credentials("http://localhost:3000/", true).is_ok());
        assert!(refuse_cleartext_credentials("https://mcp.example.com/", true).is_ok());
    }

    #[test]
    fn uppercase_cleartext_scheme_is_still_cleartext() {
        assert!(refuse_cleartext_credentials("HTTP://mcp.example.com/", true).is_err());
    }
}
