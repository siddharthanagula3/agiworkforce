//! SSE drop -> reconnect, and the reconnect cap.
//!
//! A transient `503` on a `tools/call` POST trips the client's
//! connection-error classifier, which tears the transport down and rebuilds it
//! (a fresh SSE GET + re-initialize) before retrying the call exactly once.

mod support;

use std::collections::HashMap;
use std::sync::atomic::Ordering;

use agiworkforce_mcp::{McpClient, McpTimeouts, TransportConfig};

fn sse_cfg(addr: std::net::SocketAddr) -> TransportConfig {
    TransportConfig::Sse {
        url: format!("http://{addr}/sse"),
        headers: HashMap::new(),
    }
}

#[tokio::test]
async fn transient_failure_reconnects_and_succeeds() {
    let (app, rec) = support::sse_sim(1); // first tools/call fails, then succeeds
    let addr = support::spawn(app).await;

    let mut client = McpClient::connect(
        "sse-sim",
        sse_cfg(addr),
        McpTimeouts::default(),
        support::decline_hooks(),
    )
    .await
    .expect("connect");

    let raw = client
        .call_tool_value("echo", serde_json::json!({ "text": "after-reconnect" }))
        .await
        .expect("call should succeed after one reconnect")
        .expect("some result");
    assert_eq!(raw["content"][0]["text"], "after-reconnect");

    // Two call attempts (original 503 + retry) and two GET stream connections
    // (initial + reconnect).
    assert_eq!(rec.call_attempts.load(Ordering::SeqCst), 2);
    assert!(
        rec.get_hits.load(Ordering::SeqCst) >= 2,
        "reconnect must re-establish the SSE stream"
    );
}

#[tokio::test]
async fn persistent_failure_errors_after_single_reconnect() {
    let (app, rec) = support::sse_sim(99); // every tools/call fails
    let addr = support::spawn(app).await;

    let mut client = McpClient::connect(
        "sse-sim",
        sse_cfg(addr),
        McpTimeouts::default(),
        support::decline_hooks(),
    )
    .await
    .expect("connect");

    let err = client
        .call_tool_value("echo", serde_json::json!({ "text": "x" }))
        .await
        .expect_err("persistent failure must surface as an error");
    assert!(format!("{err}").contains("503"), "got: {err}");

    // The cap: exactly one reconnect (2 GET connections) and exactly two call
    // attempts — no unbounded retry loop.
    assert_eq!(rec.call_attempts.load(Ordering::SeqCst), 2);
    assert_eq!(rec.get_hits.load(Ordering::SeqCst), 2);
}
