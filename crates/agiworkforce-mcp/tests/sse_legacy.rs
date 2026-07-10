//! Legacy split-endpoint HTTP+SSE convention (`SseLegacy`) + the network
//! hardening knobs ported from desktop (Wave 5 stage d2): POST `{base}/message`
//! with inline responses, best-effort `GET {base}/sse`, SSRF URL validation,
//! and the inline-response size cap.

mod support;

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use axum::{
    Router,
    body::Body,
    http::StatusCode,
    response::Response,
    routing::{get, post},
};
use futures_util::StreamExt;

use agiworkforce_mcp::{McpClient, McpTimeouts, TransportConfig};

fn rpc_result(id: &serde_json::Value, result: serde_json::Value) -> String {
    serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": result }).to_string()
}

/// A scripted legacy-convention MCP server: inline JSON responses on
/// `POST /message`; `GET /sse` (when `with_sse`) holds an event stream open.
fn legacy_sim(with_sse: bool) -> (Router, Arc<AtomicUsize>) {
    let sse_hits = Arc::new(AtomicUsize::new(0));
    let sse_hits_get = Arc::clone(&sse_hits);

    let message = post(|body: String| async move {
        let frame: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
        let method = frame
            .get("method")
            .and_then(|m| m.as_str())
            .unwrap_or("")
            .to_string();
        let id = frame.get("id").cloned().unwrap_or(serde_json::Value::Null);
        let body = match method.as_str() {
            "initialize" => rpc_result(
                &id,
                serde_json::json!({
                    "protocolVersion": "2024-11-05",
                    "serverInfo": { "name": "legacy-sim", "version": "0.0.0" },
                    "capabilities": {}
                }),
            ),
            "notifications/initialized" | "notifications/cancelled" => {
                return Response::builder()
                    .status(StatusCode::ACCEPTED)
                    .body(Body::from(String::new()))
                    .unwrap();
            }
            "tools/list" => rpc_result(
                &id,
                serde_json::json!({
                    "tools": [{
                        "name": "echo",
                        "description": "Echo the input back.",
                        "inputSchema": { "type": "object", "properties": { "text": { "type": "string" } } }
                    }]
                }),
            ),
            "tools/call" => {
                let text = frame
                    .get("params")
                    .and_then(|p| p.get("arguments"))
                    .and_then(|a| a.get("text"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("(none)")
                    .to_string();
                rpc_result(
                    &id,
                    serde_json::json!({
                        "content": [{ "type": "text", "text": text }],
                        "isError": false
                    }),
                )
            }
            _ => rpc_result(&id, serde_json::json!({})),
        };
        Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", "application/json")
            .body(Body::from(body))
            .unwrap()
    });

    let mut app = Router::new().route("/message", message);
    if with_sse {
        let sse = get(move || {
            let hits = Arc::clone(&sse_hits_get);
            async move {
                hits.fetch_add(1, Ordering::SeqCst);
                // Hold the stream open (no endpoint hint — legacy POSTs are fixed).
                let body = Body::from_stream(futures_util::stream::pending::<
                    Result<axum::body::Bytes, std::io::Error>,
                >());
                Response::builder()
                    .status(StatusCode::OK)
                    .header("Content-Type", "text/event-stream")
                    .body(body)
                    .unwrap()
            }
        });
        app = app.route("/sse", sse);
    }
    (app, sse_hits)
}

#[tokio::test]
async fn legacy_split_endpoint_roundtrip() {
    let (app, sse_hits) = legacy_sim(true);
    let addr = support::spawn(app).await;

    let mut client = McpClient::connect(
        "legacy",
        TransportConfig::SseLegacy {
            base_url: format!("http://{addr}"),
            headers: HashMap::new(),
        },
        McpTimeouts::default(),
        support::decline_hooks(),
    )
    .await
    .expect("connect legacy");

    // The SSE listener attaches to GET {base}/sse asynchronously (bringup does
    // not block on it); poll briefly.
    let mut attached = false;
    for _ in 0..100 {
        if sse_hits.load(Ordering::SeqCst) >= 1 {
            attached = true;
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    }
    assert!(attached, "SSE listener never attached");

    let tools = client.list_tools().await.expect("tools/list");
    assert_eq!(tools.len(), 1);
    assert_eq!(tools[0].name, "echo");

    let raw = client
        .call_tool_value("echo", serde_json::json!({ "text": "legacy-roundtrip" }))
        .await
        .expect("tools/call")
        .expect("result");
    assert_eq!(raw["content"][0]["text"], "legacy-roundtrip");

    let _ = client.shutdown().await;
}

#[tokio::test]
async fn legacy_post_only_degrades_without_sse_stream() {
    // No /sse route: the GET 404s and bringup degrades to POST-only with
    // inline responses (desktop tolerated a failed SSE listener the same way).
    let (app, _) = legacy_sim(false);
    let addr = support::spawn(app).await;

    let mut client = McpClient::connect(
        "legacy-post-only",
        TransportConfig::SseLegacy {
            base_url: format!("http://{addr}"),
            headers: HashMap::new(),
        },
        McpTimeouts::default(),
        support::decline_hooks(),
    )
    .await
    .expect("connect legacy post-only");

    let tools = client.list_tools().await.expect("tools/list");
    assert_eq!(tools.len(), 1);

    let raw = client
        .call_tool_value("echo", serde_json::json!({ "text": "post-only" }))
        .await
        .expect("tools/call")
        .expect("result");
    assert_eq!(raw["content"][0]["text"], "post-only");

    let _ = client.shutdown().await;
}

#[tokio::test]
async fn legacy_sse_stream_reconnects_after_drop() {
    // First GET /sse: the stream ends immediately (a transient drop). The
    // supervisor must reconnect (desktop parity: linear backoff, attempts reset
    // on success); the second stream then delivers a server notification.
    let hits = Arc::new(AtomicUsize::new(0));
    let hits_get = Arc::clone(&hits);
    let sse = get(move || {
        let hits = Arc::clone(&hits_get);
        async move {
            let n = hits.fetch_add(1, Ordering::SeqCst);
            if n == 0 {
                // Drop the stream right away.
                Response::builder()
                    .status(StatusCode::OK)
                    .header("Content-Type", "text/event-stream")
                    .body(Body::from(": transient\n\n"))
                    .unwrap()
            } else {
                let notify = futures_util::stream::once(async {
                    Ok::<_, std::io::Error>(axum::body::Bytes::from(
                        "data: {\"jsonrpc\":\"2.0\",\"method\":\"notifications/message\",\"params\":{\"level\":\"info\"}}\n\n",
                    ))
                });
                let body = Body::from_stream(notify.chain(futures_util::stream::pending()));
                Response::builder()
                    .status(StatusCode::OK)
                    .header("Content-Type", "text/event-stream")
                    .body(body)
                    .unwrap()
            }
        }
    });
    let (base, _) = legacy_sim(false);
    let app = base.route("/sse", sse);
    let addr = support::spawn(app).await;

    let mut client = McpClient::connect(
        "legacy-reconnect",
        TransportConfig::SseLegacy {
            base_url: format!("http://{addr}"),
            headers: HashMap::new(),
        },
        McpTimeouts::default(),
        support::decline_hooks(),
    )
    .await
    .expect("connect");

    let mut notifications = client.notifications().expect("notification receiver");

    // The reconnect happens after the stream-end + 1s backoff; the notification
    // arriving proves the second stream is live.
    let notif = tokio::time::timeout(std::time::Duration::from_secs(10), notifications.recv())
        .await
        .expect("timed out waiting for post-reconnect notification")
        .expect("notification channel closed");
    assert_eq!(notif.method, "notifications/message");
    assert!(
        hits.load(Ordering::SeqCst) >= 2,
        "expected at least one reconnect, hits={}",
        hits.load(Ordering::SeqCst)
    );

    let _ = client.shutdown().await;
}

#[tokio::test]
async fn cleartext_remote_bringup_succeeds_post_only() {
    // Desktop parity: cleartext http to a remote host is allowed for POSTs
    // (the old desktop POST path had no HTTPS check); only the SSE GET is
    // refused, inside the supervisor (`enforce_https_for_remote`, covered by
    // its unit tests). Bringup is lazy and must therefore succeed.
    let timeouts = McpTimeouts {
        validate_urls: true,
        ..McpTimeouts::default()
    };
    let mut client = McpClient::connect_without_handshake(
        "cleartext-remote",
        TransportConfig::SseLegacy {
            // Public (passes SSRF), cleartext http: POST-only mode.
            base_url: "http://mcp.example.com/".to_string(),
            headers: HashMap::new(),
        },
        timeouts,
        support::decline_hooks(),
    )
    .await
    .expect("bringup must be lazy and succeed in POST-only mode");
    let _ = client.shutdown().await;
}

#[tokio::test]
async fn validate_urls_blocks_private_addresses() {
    let timeouts = McpTimeouts {
        validate_urls: true,
        ..McpTimeouts::default()
    };

    // Http bringup is lazy (no I/O), so the SSRF rejection must fire at
    // connect — before any network touch.
    let err = match McpClient::connect_without_handshake(
        "ssrf-http",
        TransportConfig::Http {
            url: "http://192.168.1.10:9000/".to_string(),
            headers: HashMap::new(),
            oauth: None,
        },
        timeouts.clone(),
        support::decline_hooks(),
    )
    .await
    {
        Ok(_) => panic!("private address must be rejected"),
        Err(e) => e,
    };
    assert!(
        format!("{:#}", err.as_anyhow()).contains("SSRF protection"),
        "unexpected error: {err}"
    );

    let err = match McpClient::connect_without_handshake(
        "ssrf-legacy",
        TransportConfig::SseLegacy {
            base_url: "http://169.254.169.254/".to_string(),
            headers: HashMap::new(),
        },
        timeouts,
        support::decline_hooks(),
    )
    .await
    {
        Ok(_) => panic!("link-local address must be rejected"),
        Err(e) => e,
    };
    assert!(
        format!("{:#}", err.as_anyhow()).contains("SSRF protection"),
        "unexpected error: {err}"
    );
}

#[tokio::test]
async fn validate_urls_allows_loopback() {
    let (app, _) = legacy_sim(true);
    let addr = support::spawn(app).await;

    let timeouts = McpTimeouts {
        validate_urls: true,
        ..McpTimeouts::default()
    };
    let mut client = McpClient::connect(
        "ssrf-loopback",
        TransportConfig::SseLegacy {
            base_url: format!("http://{addr}"),
            headers: HashMap::new(),
        },
        timeouts,
        support::decline_hooks(),
    )
    .await
    .expect("loopback must stay allowed under validation");
    let _ = client.shutdown().await;
}

/// A streamable-HTTP sim whose tools/call returns an oversized inline body
/// (Content-Length above the cap).
fn oversized_response_sim(body_bytes: usize) -> Router {
    Router::new().route(
        "/",
        post(move |body: String| async move {
            let frame: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
            let method = frame
                .get("method")
                .and_then(|m| m.as_str())
                .unwrap_or("")
                .to_string();
            let id = frame.get("id").cloned().unwrap_or(serde_json::Value::Null);
            match method.as_str() {
                "initialize" => Response::builder()
                    .status(StatusCode::OK)
                    .header("Content-Type", "application/json")
                    .body(Body::from(rpc_result(
                        &id,
                        serde_json::json!({
                            "protocolVersion": "2024-11-05",
                            "serverInfo": { "name": "big-sim", "version": "0.0.0" },
                            "capabilities": {}
                        }),
                    )))
                    .unwrap(),
                "notifications/initialized" | "notifications/cancelled" => Response::builder()
                    .status(StatusCode::ACCEPTED)
                    .body(Body::from(String::new()))
                    .unwrap(),
                "tools/call" => {
                    let padding = "x".repeat(body_bytes);
                    let body = rpc_result(
                        &id,
                        serde_json::json!({
                            "content": [{ "type": "text", "text": padding }],
                            "isError": false
                        }),
                    );
                    Response::builder()
                        .status(StatusCode::OK)
                        .header("Content-Type", "application/json")
                        .header("Content-Length", body.len().to_string())
                        .body(Body::from(body))
                        .unwrap()
                }
                _ => Response::builder()
                    .status(StatusCode::OK)
                    .header("Content-Type", "application/json")
                    .body(Body::from(rpc_result(&id, serde_json::json!({}))))
                    .unwrap(),
            }
        }),
    )
}

#[tokio::test]
async fn max_response_bytes_rejects_oversized_inline_body() {
    let addr = support::spawn(oversized_response_sim(64 * 1024)).await;

    let timeouts = McpTimeouts {
        max_response_bytes: Some(16 * 1024),
        ..McpTimeouts::default()
    };
    let mut client = McpClient::connect(
        "cap",
        TransportConfig::Http {
            url: format!("http://{addr}/"),
            headers: HashMap::new(),
            oauth: None,
        },
        timeouts,
        support::decline_hooks(),
    )
    .await
    .expect("connect (initialize body is small)");

    let err = client
        .call_tool_value("echo", serde_json::json!({}))
        .await
        .expect_err("oversized response must be rejected");
    assert!(
        format!("{:#}", err.as_anyhow()).contains("response too large"),
        "unexpected error: {err}"
    );

    let _ = client.shutdown().await;
}
