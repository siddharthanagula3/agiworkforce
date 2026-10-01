mod support;

use std::collections::HashMap;

use agiworkforce_mcp::{McpClient, McpTimeouts, TransportConfig};

#[tokio::test]
async fn sse_upgrade_frame_over_cap_is_rejected() {
    // Server answers tools/call with a 5 KiB unbounded event-stream frame.
    let app = support::http_oversized(5000);
    let addr = support::spawn(app).await;

    let timeouts = McpTimeouts {
        max_frame_bytes: Some(1024),
        ..McpTimeouts::default()
    };
    let cfg = TransportConfig::Http {
        url: format!("http://{addr}/"),
        headers: HashMap::new(),
        oauth: None,
    };
    let mut client = McpClient::connect("oversized", cfg, timeouts, support::decline_hooks())
        .await
        .expect("connect");

    let err = client
        .call_tool_value("echo", serde_json::json!({ "text": "x" }))
        .await
        .expect_err("oversized frame must be rejected");
    assert!(format!("{err}").contains("frame exceeded"), "got: {err}");
}

#[tokio::test]
async fn default_config_resolves_the_canonical_finite_frame_cap() {
    assert_eq!(McpTimeouts::default().max_frame_bytes, None);
    assert_eq!(
        McpTimeouts::default().frame_cap(),
        agiworkforce_mcp::config::DEFAULT_MAX_FRAME_BYTES
    );
}

#[tokio::test]
async fn sse_completed_upgrade_frame_over_cap_is_rejected() {
    let app = support::http_completed_frame(5000);
    let addr = support::spawn(app).await;
    let timeouts = McpTimeouts {
        max_frame_bytes: Some(1024),
        ..McpTimeouts::default()
    };
    let cfg = TransportConfig::Http {
        url: format!("http://{addr}/"),
        headers: HashMap::new(),
        oauth: None,
    };
    let mut client = McpClient::connect(
        "completed-oversized",
        cfg,
        timeouts,
        support::decline_hooks(),
    )
    .await
    .expect("connect");
    let result = client
        .call_tool_value("echo", serde_json::json!({ "text": "x" }))
        .await;
    assert!(
        result.is_err(),
        "completed event over configured frame cap must be refused"
    );
    let error = result.unwrap_err();
    assert!(
        format!("{error}").contains("frame exceeded"),
        "got: {error}"
    );
}
