//! SSE tool calls that fail after the server received them are not sent again,
//! and a stream that ended is rebuilt before the next request goes out.

mod support;

use std::collections::HashMap;
use std::sync::atomic::Ordering;

use agiworkforce_mcp::{McpClient, McpTimeouts, TransportConfig};
use support::SseCallFault;

fn sse_cfg(addr: std::net::SocketAddr) -> TransportConfig {
    TransportConfig::Sse {
        url: format!("http://{addr}/sse"),
        headers: HashMap::new(),
    }
}

async fn connected(addr: std::net::SocketAddr) -> McpClient {
    McpClient::connect(
        "sse-sim",
        sse_cfg(addr),
        McpTimeouts::default(),
        support::decline_hooks(),
    )
    .await
    .expect("connect")
}

#[tokio::test]
async fn a_tool_call_answered_with_a_gateway_error_is_not_sent_again() {
    let (app, rec) = support::sse_sim(1);
    let addr = support::spawn(app).await;
    let mut client = connected(addr).await;

    let err = client
        .call_tool_value("echo", serde_json::json!({ "text": "once" }))
        .await
        .expect_err("a 503 after dispatch must surface, not be replayed");
    assert!(format!("{err}").contains("503"), "got: {err}");
    assert_eq!(rec.call_attempts.load(Ordering::SeqCst), 1);
    assert_eq!(rec.get_hits.load(Ordering::SeqCst), 1);

    let raw = client
        .call_tool_value("echo", serde_json::json!({ "text": "next" }))
        .await
        .expect("a later call still works")
        .expect("some result");
    assert_eq!(raw["content"][0]["text"], "next");
    assert_eq!(rec.call_attempts.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn a_tool_call_whose_stream_ends_before_its_response_is_not_sent_again() {
    let (app, rec) = support::sse_sim_with(1, SseCallFault::AcceptedThenStreamEnds);
    let addr = support::spawn(app).await;
    let mut client = connected(addr).await;

    let err = client
        .call_tool_value("echo", serde_json::json!({ "text": "once" }))
        .await
        .expect_err("a call whose response was lost must surface, not be replayed");
    assert!(
        format!("{err}").contains("ended before its response"),
        "got: {err}"
    );
    assert_eq!(
        rec.call_attempts.load(Ordering::SeqCst),
        1,
        "the server ran the call once and must not receive it again"
    );
    assert_eq!(rec.get_hits.load(Ordering::SeqCst), 1);

    let raw = client
        .call_tool_value("echo", serde_json::json!({ "text": "next" }))
        .await
        .expect("the next call rebuilds the ended stream first")
        .expect("some result");
    assert_eq!(raw["content"][0]["text"], "next");
    assert_eq!(rec.call_attempts.load(Ordering::SeqCst), 2);
    assert_eq!(
        rec.get_hits.load(Ordering::SeqCst),
        2,
        "the ended stream must be re-established before the next dispatch"
    );
}

#[tokio::test]
async fn persistent_failure_errors_without_replaying_the_call() {
    let (app, rec) = support::sse_sim(99);
    let addr = support::spawn(app).await;
    let mut client = connected(addr).await;

    let err = client
        .call_tool_value("echo", serde_json::json!({ "text": "x" }))
        .await
        .expect_err("persistent failure must surface as an error");
    assert!(format!("{err}").contains("503"), "got: {err}");

    assert_eq!(rec.call_attempts.load(Ordering::SeqCst), 1);
    assert_eq!(rec.get_hits.load(Ordering::SeqCst), 1);
}
