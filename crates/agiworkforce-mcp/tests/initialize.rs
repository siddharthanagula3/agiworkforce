
mod support;

use std::collections::HashMap;

use agiworkforce_mcp::{McpClient, McpTimeouts, TransportConfig};

#[tokio::test]
async fn http_initialize_sends_protocol_version_and_host_client_info() {
    let (app, rec) = support::http_basic(None);
    let addr = support::spawn(app).await;

    let cfg = TransportConfig::Http {
        url: format!("http://{addr}/"),
        headers: HashMap::new(),
        oauth: None,
    };
    let client = McpClient::connect("sim", cfg, McpTimeouts::default(), support::decline_hooks())
        .await
        .expect("connect + initialize should succeed");
    drop(client);

    let init = rec
        .last_for("initialize")
        .expect("server must have seen an initialize");
    let params = &init.body["params"];
    assert_eq!(params["protocolVersion"], "2024-11-05");
    // clientInfo must be the host's identity (from ClientHooks), not the crate's.
    assert_eq!(params["clientInfo"]["name"], "test-harness");
    assert_eq!(params["clientInfo"]["version"], "9.9.9");

    // The initialized notification must follow the handshake.
    assert!(
        rec.methods()
            .contains(&"notifications/initialized".to_string())
    );
}

#[tokio::test]
async fn stdio_initialize_and_handshake() {
    let cfg = TransportConfig::Stdio {
        command: env!("CARGO_BIN_EXE_mcp_sim_stdio").to_string(),
        args: vec!["normal".to_string()],
        env: HashMap::new(),
    };
    let mut client = McpClient::connect(
        "stdio",
        cfg,
        McpTimeouts::default(),
        support::decline_hooks(),
    )
    .await
    .expect("stdio connect + initialize should succeed");
    // A follow-up list proves the handshake left the stream in a usable state.
    let tools = client.list_tools().await.expect("list_tools");
    assert_eq!(tools.len(), 1);
    let _ = client.shutdown().await;
}
