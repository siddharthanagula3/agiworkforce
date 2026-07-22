use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::process::Stdio;
use tempfile::tempdir;
use tokio::process::{Child, Command};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::Message;

#[tokio::test]
async fn cli_websocket_uses_the_full_typed_developer_session() {
    let workspace = tempdir().expect("workspace");
    let home = tempdir().expect("home");
    let port = available_loopback_port();
    let token = "app-server-test-secret";
    let mut child = Command::new(env!("CARGO_BIN_EXE_agi"))
        .arg("app-server")
        .arg("--listen")
        .arg(format!("127.0.0.1:{port}"))
        .arg("--auth-token")
        .arg(token)
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .expect("spawn websocket app-server");

    let mut websocket = connect_with_retry(port, token, &mut child).await;
    websocket
        .send(Message::Text(
            json!({
                "id": 1,
                "method": "initialize",
                "params": {
                    "clientInfo": {
                        "name": "agi_cowork_test",
                        "title": "Cowork test",
                        "version": "0.0.0"
                    }
                }
            })
            .to_string(),
        ))
        .await
        .expect("send initialize");
    let initialized = next_json(&mut websocket).await;
    assert_eq!(initialized["result"]["protocolVersion"], 5);
    assert_eq!(initialized["result"]["capabilities"]["tools"], true);
    assert_eq!(initialized["result"]["capabilities"]["approvals"], true);

    websocket
        .send(Message::Text(
            json!({
                "id": 2,
                "method": "thread/list",
                "params": { "limit": 1 }
            })
            .to_string(),
        ))
        .await
        .expect("send thread/list");
    let listed = next_json(&mut websocket).await;
    assert_eq!(listed["id"], 2);
    assert!(listed.get("error").is_none(), "{listed}");
    assert!(listed["result"]["threads"].is_array());

    websocket.close(None).await.expect("close websocket");
    child.kill().await.expect("stop websocket app-server");
}

#[tokio::test]
async fn cli_websocket_requires_an_explicit_token_instead_of_printing_one() {
    let workspace = tempdir().expect("workspace");
    let home = tempdir().expect("home");
    let output = Command::new(env!("CARGO_BIN_EXE_agi"))
        .arg("app-server")
        .arg("--listen")
        .arg(format!("127.0.0.1:{}", available_loopback_port()))
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .env_remove("AGI_APP_SERVER_TOKEN")
        .output()
        .await
        .expect("run websocket app-server without a token");

    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("requires --auth-token or AGI_APP_SERVER_TOKEN"));
    assert!(!stderr.contains("Generated app-server auth token"));
}

fn available_loopback_port() -> u16 {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind temporary port");
    listener.local_addr().expect("temporary address").port()
}

async fn connect_with_retry(
    port: u16,
    token: &str,
    child: &mut Child,
) -> tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>> {
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        if let Some(status) = child.try_wait().expect("poll app-server") {
            panic!("app-server exited before accepting WebSocket: {status}");
        }

        let mut request = format!("ws://127.0.0.1:{port}/ws")
            .into_client_request()
            .expect("valid websocket request");
        request.headers_mut().insert(
            "authorization",
            HeaderValue::from_str(&format!("Bearer {token}")).expect("valid auth header"),
        );
        match tokio_tungstenite::connect_async(request).await {
            Ok((websocket, _)) => return websocket,
            Err(error) if tokio::time::Instant::now() < deadline => {
                let _ = error;
                tokio::time::sleep(std::time::Duration::from_millis(25)).await;
            }
            Err(error) => panic!("connect to app-server WebSocket: {error}"),
        }
    }
}

async fn next_json(
    websocket: &mut tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
) -> Value {
    let message = tokio::time::timeout(std::time::Duration::from_secs(5), websocket.next())
        .await
        .expect("WebSocket response timeout")
        .expect("WebSocket response frame")
        .expect("WebSocket response succeeds");
    serde_json::from_str(message.to_text().expect("text response")).expect("JSON response")
}
