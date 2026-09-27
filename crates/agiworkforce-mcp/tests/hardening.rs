mod support;

use std::collections::HashMap;

use axum::{Router, body::Body, http::StatusCode, response::Response, routing::post};

use agiworkforce_mcp::{McpClient, McpTimeouts, TransportConfig};

fn rpc_result(id: &serde_json::Value, result: serde_json::Value) -> String {
    serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": result }).to_string()
}

#[tokio::test]
async fn validate_urls_blocks_private_addresses() {
    let timeouts = McpTimeouts {
        validate_urls: true,
        ..McpTimeouts::default()
    };

    for url in ["http://192.168.1.10:9000/", "http://169.254.169.254/"] {
        let err = match McpClient::connect(
            "ssrf-http",
            TransportConfig::Http {
                url: url.to_string(),
                headers: HashMap::new(),
                oauth: None,
            },
            timeouts.clone(),
            support::decline_hooks(),
        )
        .await
        {
            Ok(_) => panic!("{url} must be rejected"),
            Err(e) => e,
        };
        assert!(
            format!("{:#}", err.as_anyhow()).contains("SSRF protection"),
            "unexpected error: {err}"
        );
    }
}

#[tokio::test]
async fn validate_urls_allows_loopback() {
    let (app, _) = support::http_basic(None);
    let addr = support::spawn(app).await;

    let timeouts = McpTimeouts {
        validate_urls: true,
        ..McpTimeouts::default()
    };
    let mut client = McpClient::connect(
        "ssrf-loopback",
        TransportConfig::Http {
            url: format!("http://{addr}/"),
            headers: HashMap::new(),
            oauth: None,
        },
        timeouts,
        support::decline_hooks(),
    )
    .await
    .expect("loopback must stay allowed under validation");
    let _ = client.shutdown().await;
}

/// A streamable-HTTP sim whose tools/call returns an oversized inline body
/// (Content-Length above the cap).
fn oversized_response_sim(body_bytes: usize) -> Router {
    Router::new().route(
        "/",
        post(move |body: String| async move {
            let frame: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
            let method = frame
                .get("method")
                .and_then(|m| m.as_str())
                .unwrap_or("")
                .to_string();
            let id = frame.get("id").cloned().unwrap_or(serde_json::Value::Null);
            match method.as_str() {
                "initialize" => Response::builder()
                    .status(StatusCode::OK)
                    .header("Content-Type", "application/json")
                    .body(Body::from(rpc_result(
                        &id,
                        serde_json::json!({
                            "protocolVersion": "2024-11-05",
                            "serverInfo": { "name": "big-sim", "version": "0.0.0" },
                            "capabilities": {}
                        }),
                    )))
                    .unwrap(),
                "notifications/initialized" | "notifications/cancelled" => Response::builder()
                    .status(StatusCode::ACCEPTED)
                    .body(Body::from(String::new()))
                    .unwrap(),
                "tools/call" => {
                    let padding = "x".repeat(body_bytes);
                    let body = rpc_result(
                        &id,
                        serde_json::json!({
                            "content": [{ "type": "text", "text": padding }],
                            "isError": false
                        }),
                    );
                    Response::builder()
                        .status(StatusCode::OK)
                        .header("Content-Type", "application/json")
                        .header("Content-Length", body.len().to_string())
                        .body(Body::from(body))
                        .unwrap()
                }
                _ => Response::builder()
                    .status(StatusCode::OK)
                    .header("Content-Type", "application/json")
                    .body(Body::from(rpc_result(&id, serde_json::json!({}))))
                    .unwrap(),
            }
        }),
    )
}

#[tokio::test]
async fn max_response_bytes_rejects_oversized_inline_body() {
    let addr = support::spawn(oversized_response_sim(64 * 1024)).await;

    let timeouts = McpTimeouts {
        max_response_bytes: Some(16 * 1024),
        ..McpTimeouts::default()
    };
    let mut client = McpClient::connect(
        "cap",
        TransportConfig::Http {
            url: format!("http://{addr}/"),
            headers: HashMap::new(),
            oauth: None,
        },
        timeouts,
        support::decline_hooks(),
    )
    .await
    .expect("connect (initialize body is small)");

    let err = client
        .call_tool_value("echo", serde_json::json!({}))
        .await
        .expect_err("oversized response must be rejected");
    assert!(
        format!("{:#}", err.as_anyhow()).contains("response too large"),
        "unexpected error: {err}"
    );

    let _ = client.shutdown().await;
}
