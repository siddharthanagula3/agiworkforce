use agiworkforce_protocol::developer_session::DEVELOPER_SESSION_PROTOCOL_VERSION;
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
    trust_workspace(workspace.path(), home.path()).await;
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
        .send(Message::text(
            json!({
                "id": 1,
                "method": "initialize",
                "params": {
                    "clientInfo": {
                        "name": "agi_cowork_test",
                        "title": "Cowork test",
                        "version": "0.0.0"
                    },
                    "protocolVersion": DEVELOPER_SESSION_PROTOCOL_VERSION
                }
            })
            .to_string(),
        ))
        .await
        .expect("send initialize");
    let initialized = next_json(&mut websocket).await;
    assert_eq!(
        initialized["result"]["protocolVersion"],
        DEVELOPER_SESSION_PROTOCOL_VERSION
    );
    assert_eq!(
        initialized["result"]["serverInfo"]["version"],
        env!("CARGO_PKG_VERSION")
    );
    assert_eq!(initialized["result"]["capabilities"]["tools"], true);
    assert_eq!(initialized["result"]["capabilities"]["approvals"], true);

    websocket
        .send(Message::text(
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
    trust_workspace(workspace.path(), home.path()).await;
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

#[tokio::test]
async fn every_connected_client_sees_a_thread_another_client_deleted() {
    let workspace = tempdir().expect("workspace");
    let home = tempdir().expect("home");
    trust_workspace(workspace.path(), home.path()).await;
    let workspace_root = workspace
        .path()
        .canonicalize()
        .expect("canonical workspace");
    let sessions = home.path().join(".agiworkforce").join("managed_sessions");
    std::fs::create_dir_all(&sessions).expect("session store");
    std::fs::write(
        sessions.join("shared-thread.jsonl"),
        format!(
            "{}\n",
            json!({
                "record_type": "header",
                "version": 5,
                "session_id": "shared-thread",
                "created_at": "2026-09-17T00:00:00Z",
                "updated_at": "2026-09-17T00:00:00Z",
                "title": "Shared thread",
                "workspace_root": workspace_root,
            })
        ),
    )
    .expect("seed a thread both clients can see");

    let port = available_loopback_port();
    let token = "app-server-readers-secret";
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

    let mut writer = connect_with_retry(port, token, &mut child).await;
    let mut reader = connect_with_retry(port, token, &mut child).await;
    for (client, name) in [
        (&mut writer, "agi_writer_test"),
        (&mut reader, "agi_reader_test"),
    ] {
        client
            .send(Message::text(
                json!({
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "clientInfo": { "name": name, "title": name, "version": "0.0.0" },
                        "protocolVersion": DEVELOPER_SESSION_PROTOCOL_VERSION
                    }
                })
                .to_string(),
            ))
            .await
            .expect("send initialize");
        let initialized = next_json(client).await;
        assert_eq!(initialized["result"]["capabilities"]["threadDelete"], true);
        assert_eq!(initialized["result"]["capabilities"]["reconnect"], true);
        assert_eq!(initialized["result"]["capabilities"]["writerLease"], true);
    }

    writer
        .send(Message::text(
            json!({
                "id": 2,
                "method": "thread/delete",
                "params": { "threadId": "shared-thread" }
            })
            .to_string(),
        ))
        .await
        .expect("send thread/delete");
    let mut acknowledged = false;
    while !acknowledged {
        let frame = next_json(&mut writer).await;
        if frame["id"] == 2 {
            assert!(frame.get("error").is_none(), "{frame}");
            assert_eq!(frame["result"]["acknowledged"], true);
            acknowledged = true;
        }
    }

    let seen = next_json(&mut reader).await;
    assert_eq!(seen["method"], "thread/deleted");
    assert_eq!(seen["params"]["threadId"], "shared-thread");
    assert!(!sessions.join("shared-thread.jsonl").exists());

    writer.close(None).await.expect("close writer");
    reader.close(None).await.expect("close reader");
    child.kill().await.expect("stop websocket app-server");
}

async fn trust_workspace(workspace: &std::path::Path, home: &std::path::Path) {
    // WebSocket is a headless developer entry point just like stdio. Reach the
    // transport assertions only after exercising the supported explicit trust
    // action; never weaken the production gate in a test fixture.
    let output = Command::new(env!("CARGO_BIN_EXE_agi"))
        .arg("init")
        .current_dir(workspace)
        .env("HOME", home)
        .output()
        .await
        .expect("initialize trusted WebSocket test project");
    assert!(
        output.status.success(),
        "agi init failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
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
