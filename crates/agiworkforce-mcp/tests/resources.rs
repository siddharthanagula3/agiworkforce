//! Resource discovery and reads over the wire. A server offers things to READ
//! as well as things to call, and until this the CLI could only ever see the
//! tools half of what it had connected to.

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

async fn connected(addr: std::net::SocketAddr) -> McpClient {
    McpClient::connect(
        "sim",
        http_cfg(addr),
        McpTimeouts::default(),
        support::decline_hooks(),
    )
    .await
    .expect("connect")
}

#[tokio::test]
async fn lists_what_the_server_offers_to_read() {
    let (app, _rec) = support::http_basic(None);
    let addr = support::spawn(app).await;
    let mut client = connected(addr).await;

    let resources = client.list_resources().await.expect("list_resources");

    assert_eq!(resources.len(), 2);
    assert_eq!(resources[0].uri, "file:///readme.md");
    assert_eq!(resources[0].title.as_deref(), Some("Read me first"));
    assert_eq!(resources[0].mime_type.as_deref(), Some("text/markdown"));
    assert_eq!(resources[0].size, Some(128));
    assert!(resources[1].size.is_none());
}

#[tokio::test]
async fn lists_the_templates_a_caller_has_to_fill_in() {
    let (app, _rec) = support::http_basic(None);
    let addr = support::spawn(app).await;
    let mut client = connected(addr).await;

    let templates = client
        .list_resource_templates()
        .await
        .expect("list_resource_templates");

    assert_eq!(templates.len(), 1);
    assert_eq!(templates[0].uri_template, "sim://issues/{id}");
    assert_eq!(templates[0].title.as_deref(), Some("Issue by number"));
}

#[tokio::test]
async fn reads_one_resource_by_its_uri() {
    let (app, rec) = support::http_basic(None);
    let addr = support::spawn(app).await;
    let mut client = connected(addr).await;

    let contents = client
        .read_resource("file:///readme.md")
        .await
        .expect("read_resource");

    assert_eq!(contents.len(), 1);
    assert_eq!(contents[0].uri, "file:///readme.md");
    assert_eq!(contents[0].text.as_deref(), Some("# hello"));
    assert!(contents[0].blob.is_none());

    let sent = rec.requests.lock().unwrap();
    let read = sent
        .iter()
        .find(|req| req.method == "resources/read")
        .expect("a resources/read frame");
    assert_eq!(read.body["params"]["uri"], "file:///readme.md");
}

#[tokio::test]
async fn a_server_that_offers_nothing_to_read_still_lists_its_tools() {
    let (app, _rec) = support::http_no_resources();
    let addr = support::spawn(app).await;
    let mut client = connected(addr).await;

    assert!(client.list_resources().await.expect("list").is_empty());
    assert_eq!(client.list_tools().await.expect("tools").len(), 1);
}
