mod support;

use std::collections::HashMap;
use std::time::Duration;

use agiworkforce_mcp::{McpClient, McpTimeouts, TransportConfig};

async fn connected(timeouts: McpTimeouts, ttl_ms: u64, payload_bytes: usize) -> McpClient {
    let (app, _) = support::http_modern_read_cache(ttl_ms, payload_bytes);
    let addr = support::spawn(app).await;
    let client = McpClient::connect(
        "bounded-cache",
        TransportConfig::Http {
            url: format!("http://{addr}/"),
            headers: HashMap::new(),
            oauth: None,
        },
        timeouts,
        support::decline_hooks(),
    )
    .await
    .unwrap();
    assert_eq!(
        client.server().protocol_version,
        agiworkforce_mcp::protocol::MODERN_PROTOCOL_VERSION
    );
    client
}

async fn read(client: &mut McpClient, uri: &str, count: usize, payload_bytes: usize) {
    let contents = client.read_resource(uri).await.unwrap();
    assert_eq!(contents.len(), 1);
    assert_eq!(contents[0].uri, uri);
    assert_eq!(
        contents[0].text.as_deref(),
        Some(format!("{count}:{}", "x".repeat(payload_bytes)).as_str())
    );
}

#[tokio::test]
async fn modern_read_cache_evicts_least_recently_used_distinct_resource() {
    let mut client = connected(
        McpTimeouts {
            max_read_cache_entries: Some(2),
            ..McpTimeouts::default()
        },
        60_000,
        32,
    )
    .await;
    read(&mut client, "sim://a", 1, 32).await;
    read(&mut client, "sim://b", 1, 32).await;
    read(&mut client, "sim://a", 1, 32).await;
    read(&mut client, "sim://c", 1, 32).await;
    read(&mut client, "sim://b", 2, 32).await;
    client.shutdown().await.unwrap();
}

#[tokio::test]
async fn modern_read_cache_enforces_aggregate_key_and_payload_bytes() {
    let mut client = connected(
        McpTimeouts {
            max_read_cache_bytes: Some(512),
            ..McpTimeouts::default()
        },
        60_000,
        256,
    )
    .await;
    read(&mut client, "sim://a", 1, 256).await;
    read(&mut client, "sim://a", 1, 256).await;
    read(&mut client, "sim://b", 1, 256).await;
    read(&mut client, "sim://a", 2, 256).await;
    client.shutdown().await.unwrap();
}

#[tokio::test]
async fn modern_read_cache_caps_server_ttl_without_extending_it_on_hit() {
    let mut client = connected(
        McpTimeouts {
            max_read_cache_ttl: Some(Duration::from_millis(20)),
            ..McpTimeouts::default()
        },
        60_000,
        32,
    )
    .await;
    read(&mut client, "sim://a", 1, 32).await;
    tokio::time::sleep(Duration::from_millis(50)).await;
    read(&mut client, "sim://a", 2, 32).await;
    client.shutdown().await.unwrap();
}

#[tokio::test]
async fn modern_read_cache_bypasses_oversized_response_without_changing_content() {
    let mut client = connected(
        McpTimeouts {
            max_read_cache_bytes: Some(64),
            ..McpTimeouts::default()
        },
        60_000,
        256,
    )
    .await;
    read(&mut client, "sim://a", 1, 256).await;
    read(&mut client, "sim://a", 2, 256).await;
    client.shutdown().await.unwrap();
}
