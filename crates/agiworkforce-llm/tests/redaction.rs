//! Key-redaction guarantees (extraction-plan watch item: this crate handles
//! BYOK keys for every surface after stage c, so its logging must never leak
//! key material).
//!
//! Two layers:
//! 1. `Debug` of [`Auth`]/[`ProviderSpec`] redacts secret values.
//! 2. End-to-end: run a real `stream_chat` request against a local server
//!    with a TRACE-level subscriber capturing everything this crate logs
//!    (including the `spec = ?spec` request traces) and assert the captured
//!    output contains no key material.

use std::io::Write;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use agiworkforce_llm::{
    Auth, ChatRequest, Dialect, LlmError, Message, OpenAiOpts, ProviderSpec, StreamEvent,
    stream_chat,
};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const SECRET: &str = "sk-test-SUPERSECRET-9f8e7d6c";

#[test]
fn provider_spec_debug_redacts_key_material() {
    let bearer_spec = ProviderSpec {
        id: "openai".into(),
        dialect: Dialect::OpenAiCompat(OpenAiOpts::default()),
        base_url: "https://api.openai.com/v1/chat/completions".into(),
        auth: Auth::Bearer(SECRET.into()),
        extra_headers: vec![("User-Agent".into(), "agiworkforce-test/0.0".into())],
    };
    let rendered = format!("{bearer_spec:?}");
    assert!(!rendered.contains(SECRET), "Bearer key leaked: {rendered}");
    assert!(rendered.contains("[redacted]"), "expected redaction marker: {rendered}");

    let header_spec = ProviderSpec {
        id: "anthropic".into(),
        dialect: Dialect::Anthropic,
        base_url: "https://api.anthropic.com/v1/messages".into(),
        auth: Auth::Header {
            name: "x-api-key".into(),
            value: SECRET.into(),
        },
        extra_headers: Vec::new(),
    };
    let rendered = format!("{header_spec:?}");
    assert!(!rendered.contains(SECRET), "header key leaked: {rendered}");
    assert!(rendered.contains("x-api-key"), "header NAME stays visible: {rendered}");
}

/// Shared buffer the tracing subscriber writes into.
#[derive(Clone, Default)]
struct Capture(Arc<Mutex<Vec<u8>>>);

impl Capture {
    fn contents(&self) -> String {
        String::from_utf8_lossy(&self.0.lock().unwrap()).into_owned()
    }
}

impl Write for Capture {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(buf);
        Ok(buf.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

impl<'a> tracing_subscriber::fmt::MakeWriter<'a> for Capture {
    type Writer = Capture;
    fn make_writer(&'a self) -> Self::Writer {
        self.clone()
    }
}

/// Minimal one-shot HTTP server: accept a single connection, read the request
/// until the end of headers plus the JSON body, respond with a canned SSE
/// stream, close.
async fn spawn_sse_server() -> u16 {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind test listener");
    let port = listener.local_addr().unwrap().port();
    tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.expect("accept");
        // Read the request (headers + body) best-effort; we only need to
        // consume enough for the client to consider the request sent.
        let mut buf = vec![0u8; 65536];
        let mut read_total = 0usize;
        loop {
            match socket.read(&mut buf[read_total..]).await {
                Ok(0) => break,
                Ok(n) => {
                    read_total += n;
                    let text = String::from_utf8_lossy(&buf[..read_total]);
                    if let Some(header_end) = text.find("\r\n\r\n") {
                        let content_length = text
                            .lines()
                            .find_map(|l| {
                                l.to_ascii_lowercase()
                                    .strip_prefix("content-length:")
                                    .map(|v| v.trim().parse::<usize>().unwrap_or(0))
                            })
                            .unwrap_or(0);
                        if read_total >= header_end + 4 + content_length {
                            break;
                        }
                    }
                    if read_total == buf.len() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        let body = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\n",
            "data: [DONE]\n\n",
        );
        let response = format!(
            "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        let _ = socket.write_all(response.as_bytes()).await;
        let _ = socket.shutdown().await;
    });
    port
}

#[tokio::test]
async fn trace_output_of_real_request_contains_no_key_material() {
    let capture = Capture::default();
    let subscriber = tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::new("agiworkforce_llm=trace"))
        .with_writer(capture.clone())
        .with_ansi(false)
        .finish();
    // Thread-local default: fine under the current-thread tokio test runtime.
    let _guard = tracing::subscriber::set_default(subscriber);

    let port = spawn_sse_server().await;
    let spec = ProviderSpec {
        id: "openai".into(),
        dialect: Dialect::OpenAiCompat(OpenAiOpts::default()),
        base_url: format!("http://127.0.0.1:{port}/v1/chat/completions"),
        auth: Auth::Bearer(SECRET.into()),
        extra_headers: vec![("User-Agent".into(), "agiworkforce-test/0.0".into())],
    };
    let messages = [Message::text("user", "hi")];
    let req = ChatRequest {
        model: "test-model",
        messages: &messages,
        max_tokens: 16,
        temperature: None,
        tools: None,
        thinking_budget: None,
        idle_timeout: Duration::from_secs(5),
    };

    let mut text = String::new();
    let mut on_event = |event: StreamEvent| {
        if let StreamEvent::TextDelta { text: t } = event {
            text.push_str(&t);
        }
    };
    let client = reqwest::Client::new();
    let outcome: Result<_, LlmError> = stream_chat(&client, &spec, &req, &mut on_event).await;
    let outcome = outcome.expect("local SSE request should succeed");
    assert_eq!(outcome.text, "ok");
    assert_eq!(text, "ok");

    let logged = capture.contents();
    assert!(
        logged.contains("sending openai-compatible chat request"),
        "the crate must have TRACE-logged the request (test would otherwise be vacuous): {logged}"
    );
    assert!(
        !logged.contains(SECRET),
        "TRACE output leaked key material:\n{logged}"
    );
    assert!(
        logged.contains("[redacted]"),
        "spec debug in TRACE output should show the redaction marker:\n{logged}"
    );
}
