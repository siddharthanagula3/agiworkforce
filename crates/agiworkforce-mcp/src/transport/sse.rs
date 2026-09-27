use anyhow::{Context, Result, bail};
use futures_util::StreamExt;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

use super::http::{
    headers_carry_credentials, pinned_redirect_policy, read_body_capped, read_text_capped,
};
use super::sse_stream::SseDecoder;
use crate::cache::Events;
use crate::config::McpTimeouts;
use crate::error::TransportFault;
use crate::hooks::ClientHooks;
use crate::jsonrpc::matching_response;
use crate::peer_requests;

const ENDPOINT_HINT_WAIT: Duration = Duration::from_millis(500);

pub(crate) struct SseConn {
    server_name: String,
    configured_url: String,
    post_url: String,
    headers: HashMap<String, String>,
    client: reqwest::Client,
    hooks: ClientHooks,
    rx: mpsc::Receiver<Value>,
    max_response: u64,
    drain: JoinHandle<()>,
}

impl SseConn {
    pub(crate) async fn connect(
        name: &str,
        url: &str,
        headers: &HashMap<String, String>,
        timeouts: &McpTimeouts,
        events: Arc<Events>,
        hooks: ClientHooks,
    ) -> Result<Self> {
        if timeouts.validate_urls {
            crate::security::validate_server_url(url).with_context(|| format!("[{name}] SSE"))?;
        }
        refuse_cleartext_credentials(name, url, headers)?;
        let client = build_sse_client(url, timeouts)?;
        let resp = open_sse_stream(name, &client, url, headers).await?;

        let (tx, rx) = mpsc::channel::<Value>(64);
        let (endpoint_tx, mut endpoint_rx) = mpsc::channel::<String>(1);
        let drain = tokio::spawn(drain_stream(
            name.to_string(),
            url.to_string(),
            resp,
            timeouts.frame_cap(),
            tx,
            endpoint_tx,
            events,
        ));

        let post_url = match tokio::time::timeout(ENDPOINT_HINT_WAIT, endpoint_rx.recv()).await {
            Ok(Some(endpoint)) => endpoint,
            _ => url.to_string(),
        };

        Ok(Self {
            server_name: name.to_string(),
            configured_url: url.to_string(),
            post_url,
            headers: headers.clone(),
            client,
            hooks,
            rx,
            max_response: timeouts.response_cap(),
            drain,
        })
    }

    pub(crate) async fn request(
        &mut self,
        id: &Value,
        frame: &Value,
        method: &str,
        timeout: Duration,
    ) -> Result<Option<Value>> {
        let server = self.server_name.clone();
        let resp = self.post(frame, method).await?;
        let inline = read_body_capped(resp, self.max_response)
            .await
            .with_context(|| format!("[{server}] SSE: POST '{method}' response"))?;
        if let Some(response) = serde_json::from_slice::<Value>(&inline)
            .ok()
            .and_then(|value| matching_response(&value, id))
        {
            return Ok(Some(response));
        }

        let wait = async {
            loop {
                let Some(value) = self.rx.recv().await else {
                    bail!("[{server}] SSE channel closed unexpectedly");
                };
                if let Some(response) = matching_response(&value, id) {
                    return Ok(Some(response));
                }
                if let Some((request_method, request_id, params)) =
                    peer_requests::server_request(&value)
                {
                    let reply = peer_requests::answer(
                        &server,
                        &self.hooks,
                        &request_method,
                        request_id,
                        params,
                    )
                    .await;
                    if let Err(e) = self.post(&reply, &request_method).await {
                        eprintln!(
                            "[{server}] reply to server request '{request_method}' failed: {e:#}"
                        );
                    }
                }
            }
        };
        match tokio::time::timeout(timeout, wait).await {
            Ok(result) => result,
            Err(_) => Err(TransportFault::Timeout {
                server,
                millis: timeout.as_millis(),
                method: method.to_string(),
            }
            .into()),
        }
    }

    pub(crate) async fn notify(&mut self, frame: &Value) {
        let method = frame
            .get("method")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        if let Err(e) = self.post(frame, &method).await {
            eprintln!(
                "[{}] SSE: notification '{method}' POST failed: {e:#}",
                self.server_name
            );
        }
    }

    async fn post(&self, frame: &Value, method: &str) -> Result<reqwest::Response> {
        let server = &self.server_name;
        crate::security::enforce_same_origin(&self.configured_url, &self.post_url, "SSE POST endpoint")
            .with_context(|| {
                format!(
                    "[{server}] refusing to send configured MCP headers to a foreign origin on '{method}'"
                )
            })?;
        let mut request = self
            .client
            .post(&self.post_url)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json, text/event-stream")
            .json(frame);
        for (k, v) in &self.headers {
            request = request.header(k, v);
        }
        let resp = request
            .send()
            .await
            .with_context(|| format!("[{server}] SSE: POST '{method}' failed"))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = read_text_capped(resp).await;
            bail!("[{server}] SSE: POST '{method}' returned {status}, {body}");
        }
        Ok(resp)
    }
}

impl Drop for SseConn {
    fn drop(&mut self) {
        self.drain.abort();
    }
}

fn refuse_cleartext_credentials(
    name: &str,
    url: &str,
    headers: &HashMap<String, String>,
) -> Result<()> {
    if !headers_carry_credentials(headers) {
        return Ok(());
    }
    crate::security::enforce_https_for_remote(url)
        .with_context(|| format!("[{name}] refusing to send configured MCP headers in cleartext"))
}

fn build_sse_client(url: &str, timeouts: &McpTimeouts) -> Result<reqwest::Client> {
    let mut builder = reqwest::Client::builder().redirect(pinned_redirect_policy(url));
    crate::security::enforce_tls_verification_policy(url, timeouts.verify_tls)?;
    #[cfg(debug_assertions)]
    if !timeouts.verify_tls {
        builder = builder.danger_accept_invalid_certs(true);
    }
    if let Some(ct) = timeouts.connect_timeout {
        builder = builder.connect_timeout(ct);
    }
    if let Some(rt) = timeouts.sse_read_timeout {
        builder = builder.read_timeout(rt);
    }
    builder.build().context("build reqwest client")
}

async fn open_sse_stream(
    name: &str,
    client: &reqwest::Client,
    url: &str,
    headers: &HashMap<String, String>,
) -> Result<reqwest::Response> {
    let mut req = client.get(url);
    for (k, v) in headers {
        req = req.header(k, v);
    }
    req = req.header("Accept", "text/event-stream");

    let resp = req
        .send()
        .await
        .with_context(|| format!("[{name}] SSE GET failed"))?;
    if !resp.status().is_success() {
        bail!("[{name}] SSE server returned {}", resp.status());
    }
    Ok(resp)
}

async fn drain_stream(
    server_name: String,
    base_url: String,
    resp: reqwest::Response,
    max_frame: usize,
    tx: mpsc::Sender<Value>,
    endpoint_tx: mpsc::Sender<String>,
    events: Arc<Events>,
) {
    let mut stream = resp.bytes_stream();
    let mut decoder = SseDecoder::new(max_frame);
    while let Some(chunk) = stream.next().await {
        let chunk = match chunk {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[{server_name}] SSE stream error: {e}");
                return;
            }
        };
        let frames = match decoder.push(&chunk) {
            Ok(frames) => frames,
            Err(e) => {
                eprintln!("[{server_name}] SSE {e}; closing stream");
                return;
            }
        };
        for event in frames {
            if event.event.as_deref() == Some("endpoint") {
                match resolve_endpoint(&base_url, event.data.trim()) {
                    Ok(endpoint) => {
                        let _ = endpoint_tx.try_send(endpoint);
                    }
                    Err(e) => eprintln!(
                        "[{server_name}] SSE: ignoring endpoint hint: {e:#}; POSTing to {base_url}"
                    ),
                }
                continue;
            }
            let value = match serde_json::from_str::<Value>(&event.data) {
                Ok(value) => value,
                Err(e) => {
                    eprintln!(
                        "[{server_name}] SSE: invalid JSON in data frame: {e} (payload: {})",
                        event.data
                    );
                    return;
                }
            };
            if let Some((method, params)) = peer_requests::notification(&value) {
                events.notify(method, params);
                continue;
            }
            if tx.send(value).await.is_err() {
                return;
            }
        }
    }
}

fn resolve_endpoint(base_url: &str, hint: &str) -> Result<String> {
    let base = reqwest::Url::parse(base_url)
        .with_context(|| format!("parse SSE base URL '{base_url}'"))?;
    let resolved = base
        .join(hint)
        .with_context(|| format!("resolve SSE endpoint hint '{hint}'"))?;
    crate::security::enforce_same_origin(base_url, resolved.as_str(), "SSE endpoint hint")?;
    Ok(resolved.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    const BASE: &str = "https://legit-mcp.example.com/sse";

    #[test]
    fn relative_hint_resolves_against_the_configured_url() {
        assert_eq!(
            resolve_endpoint(BASE, "/messages?sessionId=42").unwrap(),
            "https://legit-mcp.example.com/messages?sessionId=42"
        );
    }

    #[test]
    fn same_origin_absolute_hint_is_kept() {
        assert_eq!(
            resolve_endpoint(BASE, "https://legit-mcp.example.com/messages").unwrap(),
            "https://legit-mcp.example.com/messages"
        );
    }

    #[test]
    fn cross_origin_absolute_hint_is_refused() {
        let err = resolve_endpoint(BASE, "https://attacker.example/collect")
            .expect_err("cross-origin endpoint hint must be refused");
        assert!(
            format!("{err:#}").contains("does not match the pinned origin"),
            "{err:#}"
        );
    }

    #[test]
    fn protocol_relative_hint_is_refused() {
        let err = resolve_endpoint(BASE, "//attacker.example/collect")
            .expect_err("protocol-relative endpoint hint must be refused");
        assert!(
            format!("{err:#}").contains("does not match the pinned origin"),
            "{err:#}"
        );
    }

    #[test]
    fn downgraded_and_offport_hints_are_refused() {
        assert!(resolve_endpoint(BASE, "http://legit-mcp.example.com/messages").is_err());
        assert!(resolve_endpoint(BASE, "https://legit-mcp.example.com:8443/messages").is_err());
        assert!(resolve_endpoint(BASE, "file:///etc/passwd").is_err());
    }

    #[test]
    fn loopback_dev_server_hint_still_works() {
        assert_eq!(
            resolve_endpoint(
                "http://127.0.0.1:3000/sse",
                "http://127.0.0.1:3000/messages"
            )
            .unwrap(),
            "http://127.0.0.1:3000/messages"
        );
    }

    #[test]
    fn credential_headers_are_refused_over_cleartext_to_a_remote_host() {
        let creds = HashMap::from([("Authorization".to_string(), "Bearer s3cret".to_string())]);
        assert!(refuse_cleartext_credentials("t", "http://mcp.example.com/sse", &creds).is_err());
        assert!(refuse_cleartext_credentials("t", "https://mcp.example.com/sse", &creds).is_ok());
        assert!(refuse_cleartext_credentials("t", "http://127.0.0.1:3000/sse", &creds).is_ok());
        assert!(
            refuse_cleartext_credentials("t", "http://mcp.example.com/sse", &HashMap::new())
                .is_ok()
        );
    }

    #[test]
    fn a_benign_header_does_not_block_a_cleartext_lan_server() {
        let benign = HashMap::from([("X-Client".to_string(), "agi".to_string())]);
        assert!(refuse_cleartext_credentials("t", "http://192.168.1.5:3000/sse", &benign).is_ok());
        let key = HashMap::from([("X-Api-Key".to_string(), "s3cret".to_string())]);
        assert!(refuse_cleartext_credentials("t", "http://192.168.1.5:3000/sse", &key).is_err());
    }

    #[tokio::test]
    async fn cross_origin_redirect_on_a_credentialed_post_is_refused() {
        let (collector, hits) = crate::transport::http::raw_http::spawn_collector().await;
        let server = crate::transport::http::raw_http::spawn_scripted(vec![format!(
            "HTTP/1.1 307 Temporary Redirect\r\nLocation: http://{collector}/collect\r\nContent-Length: 0\r\n\r\n"
        )])
        .await;

        let url = format!("http://{server}/sse");
        let client = build_sse_client(&url, &McpTimeouts::default()).expect("build sse client");

        let result = client
            .post(&url)
            .header("X-Api-Key", "STATIC_API_KEY")
            .json(&serde_json::json!({"jsonrpc": "2.0", "id": 1, "method": "tools/call"}))
            .send()
            .await;

        let seen = hits.lock().expect("collector lock").clone();
        assert!(seen.is_empty(), "attacker origin was contacted: {seen:?}");
        let err = result.expect_err("a cross-origin redirect must not be followed");
        assert!(err.is_redirect(), "{err}");
    }

    #[tokio::test]
    async fn same_origin_redirect_on_the_sse_client_is_followed() {
        let server = crate::transport::http::raw_http::spawn_scripted(vec![
            "HTTP/1.1 307 Temporary Redirect\r\nLocation: /message\r\nContent-Length: 0\r\n\r\n"
                .to_string(),
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}"
                .to_string(),
        ])
        .await;

        let url = format!("http://{server}/sse");
        let client = build_sse_client(&url, &McpTimeouts::default()).expect("build sse client");

        let resp = client
            .post(&url)
            .json(&serde_json::json!({"jsonrpc": "2.0", "id": 1, "method": "tools/call"}))
            .send()
            .await
            .expect("a same-origin redirect must still be followed");
        assert!(resp.status().is_success(), "{}", resp.status());
        assert!(resp.url().path().ends_with("/message"), "{}", resp.url());
    }
}
