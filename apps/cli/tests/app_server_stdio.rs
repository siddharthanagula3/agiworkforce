use serde_json::{json, Value};
use std::process::Stdio;
use tempfile::tempdir;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

#[tokio::test]
async fn thread_start_does_not_wait_for_a_stalled_mcp_server() {
    let workspace = tempdir().expect("workspace");
    let home = tempdir().expect("home");
    std::fs::write(
        workspace.path().join(".mcp.json"),
        serde_json::to_vec(&json!({
            "mcpServers": {
                "stalled": {
                    "command": "sh",
                    "args": ["-c", "while IFS= read -r _; do :; done"],
                    "enabled": true
                }
            }
        }))
        .expect("MCP config"),
    )
    .expect("write MCP config");

    let mut child = Command::new(env!("CARGO_BIN_EXE_agi"))
        .arg("app-server")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .expect("spawn app-server");
    let mut stdin = child.stdin.take().expect("stdin");
    let stdout = child.stdout.take().expect("stdout");
    let mut lines = BufReader::new(stdout).lines();

    send(
        &mut stdin,
        json!({
            "id": 1,
            "method": "initialize",
            "params": {
                "clientInfo": {
                    "name": "agi_vscode_test",
                    "title": "VS Code test",
                    "version": "0.0.0"
                }
            }
        }),
    )
    .await;
    let initialized = next_response(&mut lines).await;
    // Must match DEVELOPER_SESSION_PROTOCOL_VERSION (crates/agiworkforce-protocol);
    // it was bumped 3→5 but this assertion wasn't updated, so the test stalled.
    assert_eq!(initialized["result"]["protocolVersion"], 6);

    send(
        &mut stdin,
        json!({
            "id": 2,
            "method": "thread/start",
            "params": {
                "cwd": workspace.path(),
                "title": "Non-blocking startup"
            }
        }),
    )
    .await;

    let started =
        tokio::time::timeout(std::time::Duration::from_secs(2), next_response(&mut lines))
            .await
            .expect("thread/start must not wait for MCP discovery");
    assert_eq!(started["id"], 2);
    assert!(started.get("error").is_none(), "{started}");

    send(
        &mut stdin,
        json!({
            "id": 3,
            "method": "thread/fork",
            "params": {
                "threadId": started["result"]["thread"]["id"],
                "title": "Forked in VS Code"
            }
        }),
    )
    .await;
    let forked = next_response(&mut lines).await;
    assert_eq!(forked["result"]["thread"]["createdBy"], "vscode");

    // The stalled server is bounded by the per-server initialize timeout
    // (McpTimeouts.initialize, 30s), after which discovery skips it and still
    // resolves to ready. The host-level MCP_LOAD_TIMEOUT_SECONDS backstop is
    // deliberately longer, so `mcp/unavailable` is reserved for a hung
    // discovery pipeline, not one bad server.
    let ready = tokio::time::timeout(
        std::time::Duration::from_secs(35),
        next_notification(&mut lines, "mcp/ready"),
    )
    .await
    .expect("discovery must resolve once the stalled server times out");
    assert_eq!(ready["params"]["message"], Value::Null);

    send(
        &mut stdin,
        json!({
            "id": 4,
            "method": "shutdown",
            "params": {}
        }),
    )
    .await;
    let shutdown = next_response(&mut lines).await;
    assert_eq!(shutdown["result"]["acknowledged"], true);
    let status = tokio::time::timeout(std::time::Duration::from_secs(2), child.wait())
        .await
        .expect("shutdown must terminate the app-server process")
        .expect("wait for app-server");
    assert!(status.success(), "app-server shutdown status: {status}");
}

async fn send(stdin: &mut tokio::process::ChildStdin, value: Value) {
    stdin
        .write_all(format!("{value}\n").as_bytes())
        .await
        .expect("write request");
    stdin.flush().await.expect("flush request");
}

async fn next_response(
    lines: &mut tokio::io::Lines<BufReader<tokio::process::ChildStdout>>,
) -> Value {
    loop {
        let line = lines
            .next_line()
            .await
            .expect("read response")
            .expect("app-server closed stdout");
        let value: Value = serde_json::from_str(&line).expect("JSON response");
        if value.get("id").is_some() {
            return value;
        }
    }
}

async fn next_notification(
    lines: &mut tokio::io::Lines<BufReader<tokio::process::ChildStdout>>,
    method: &str,
) -> Value {
    loop {
        let line = lines
            .next_line()
            .await
            .expect("read notification")
            .expect("app-server closed stdout");
        let value: Value = serde_json::from_str(&line).expect("JSON notification");
        if value["method"] == method {
            return value;
        }
    }
}
