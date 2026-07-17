//! Oversized-frame rejection (the crate's one intentional hardening over the
//! CLI). The frame cap is OFF by default (CLI parity); when a host sets
//! `max_frame_bytes`, an SSE-upgrade frame that grows past the cap without a
//! boundary is rejected instead of buffered without bound.

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
async fn default_config_has_no_frame_cap() {
    // Regression guard: the default is unbounded so CLI behavior is unchanged.
    assert_eq!(McpTimeouts::default().max_frame_bytes, None);
}
