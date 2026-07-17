//! Sticky `Mcp-Session-Id`: captured from the initialize response and echoed on
//! every subsequent request.

mod support;

use std::collections::HashMap;

use agiworkforce_mcp::{McpClient, McpTimeouts, TransportConfig};

#[tokio::test]
async fn http_session_id_is_sticky() {
    let (app, rec) = support::http_basic(Some("sess-abc-123".to_string()));
    let addr = support::spawn(app).await;

    let cfg = TransportConfig::Http {
        url: format!("http://{addr}/"),
        headers: HashMap::new(),
        oauth: None,
    };
    let mut client =
        McpClient::connect("sim", cfg, McpTimeouts::default(), support::decline_hooks())
            .await
            .expect("connect");

    let _ = client.list_tools().await.expect("list_tools");
    let _ = client
        .call_tool_value("echo", serde_json::json!({ "text": "x" }))
        .await
        .expect("call");

    // The initialize itself carried no session (none issued yet).
    let init = rec.last_for("initialize").unwrap();
    assert_eq!(init.session, None);

    // Every request after the initialize response echoes the issued id.
    let list = rec.last_for("tools/list").unwrap();
    assert_eq!(list.session.as_deref(), Some("sess-abc-123"));
    let call = rec.last_for("tools/call").unwrap();
    assert_eq!(call.session.as_deref(), Some("sess-abc-123"));
}
