//! Stale-request timeout: a server that accepts the request but never answers
//! must surface the client's per-operation timeout, not hang forever.

mod support;

use std::collections::HashMap;
use std::time::Duration;

use agiworkforce_mcp::{McpClient, McpTimeouts, TransportConfig};

#[tokio::test]
async fn http_request_times_out_when_server_never_answers() {
    let app = support::http_stale();
    let addr = support::spawn(app).await;

    let timeouts = McpTimeouts {
        list_tools: Duration::from_millis(300),
        ..McpTimeouts::default()
    };
    let cfg = TransportConfig::Http {
        url: format!("http://{addr}/"),
        headers: HashMap::new(),
        oauth: None,
    };
    // initialize is answered, so connect succeeds.
    let mut client = McpClient::connect("stale", cfg, timeouts, support::decline_hooks())
        .await
        .expect("connect");

    // tools/list hangs on the server → per-op timeout fires here.
    let err = client
        .request("tools/list", None, Duration::from_millis(300))
        .await
        .expect_err("stale request must time out");
    assert!(
        format!("{err}").to_lowercase().contains("timeout"),
        "got: {err}"
    );
}
