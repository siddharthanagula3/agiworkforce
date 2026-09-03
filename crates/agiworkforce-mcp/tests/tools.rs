
mod support;

use std::collections::HashMap;

use agiworkforce_mcp::{McpClient, McpTimeouts, TransportConfig};

fn http_cfg(addr: std::net::SocketAddr) -> TransportConfig {
    TransportConfig::Http {
        url: format!("http://{addr}/"),
        headers: HashMap::new(),
        oauth: None,
    }
}

#[tokio::test]
async fn typed_list_tools_returns_protocol_tool() {
    let (app, _rec) = support::http_basic(None);
    let addr = support::spawn(app).await;

    let mut client = McpClient::connect(
        "sim",
        http_cfg(addr),
        McpTimeouts::default(),
        support::decline_hooks(),
    )
    .await
    .expect("connect");

    let tools = client.list_tools().await.expect("list_tools");
    assert_eq!(tools.len(), 1);
    assert_eq!(tools[0].name, "echo");
    assert_eq!(tools[0].input_schema["type"], "object");
}

#[tokio::test]
async fn typed_call_tool_parses_call_tool_result() {
    let (app, rec) = support::http_basic(None);
    let addr = support::spawn(app).await;

    let mut client = McpClient::connect(
        "sim",
        http_cfg(addr),
        McpTimeouts::default(),
        support::decline_hooks(),
    )
    .await
    .expect("connect");

    let result = client
        .call_tool("echo", serde_json::json!({ "text": "hello world" }))
        .await
        .expect("call_tool");
    assert_eq!(result.is_error, Some(false));
    assert_eq!(result.content.len(), 1);
    assert_eq!(result.content[0]["text"], "hello world");

    // The server received the arguments verbatim.
    let call = rec.last_for("tools/call").expect("tools/call recorded");
    assert_eq!(call.body["params"]["arguments"]["text"], "hello world");
}

#[tokio::test]
async fn raw_call_tool_value_returns_result_object() {
    // The path the CLI facade actually uses.
    let (app, _rec) = support::http_basic(None);
    let addr = support::spawn(app).await;

    let mut client = McpClient::connect(
        "sim",
        http_cfg(addr),
        McpTimeouts::default(),
        support::decline_hooks(),
    )
    .await
    .expect("connect");

    let raw = client
        .call_tool_value("echo", serde_json::json!({ "text": "abc" }))
        .await
        .expect("call_tool_value")
        .expect("some result");
    assert_eq!(raw["content"][0]["text"], "abc");
}
