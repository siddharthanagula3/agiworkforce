use agiworkforce_protocol::developer_session::DEVELOPER_SESSION_PROTOCOL_VERSION;
use serde_json::{json, Value};
use std::process::Stdio;
use tempfile::tempdir;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

#[tokio::test]
async fn thread_start_does_not_wait_for_a_stalled_mcp_server() {
    let workspace = tempdir().expect("workspace");
    let home = tempdir().expect("home");
    // App-server is a headless developer entry point and must fail closed for
    // an untrusted workspace. Establish trust through the same explicit `init`
    // action documented for users before exercising the stdio protocol.
    let initialized_project = Command::new(env!("CARGO_BIN_EXE_agi"))
        .arg("init")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .output()
        .await
        .expect("initialize trusted test project");
    assert!(
        initialized_project.status.success(),
        "agi init failed: {}",
        String::from_utf8_lossy(&initialized_project.stderr)
    );
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
                },
                "protocolVersion": DEVELOPER_SESSION_PROTOCOL_VERSION
            }
        }),
    )
    .await;
    let initialized = next_response(&mut lines).await;
    assert_eq!(
        initialized["result"]["protocolVersion"],
        DEVELOPER_SESSION_PROTOCOL_VERSION
    );
    assert_eq!(
        initialized["result"]["serverInfo"]["version"],
        env!("CARGO_PKG_VERSION")
    );

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
    assert_ne!(started["result"]["thread"]["trustMode"], "unknown");
    assert!(started["result"]["thread"]["provider"].is_string());

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

/// Regression: on a tool turn the host installed no continuation sink, so the
/// reply after the tool call was written raw to stdout, which under this
/// transport is the JSON-RPC channel. The VS Code extension's reader hit the
/// non-JSON line and closed with "AGI local runtime emitted malformed JSON",
/// killing every tool turn started from the IDE.
///
/// Whether the turn reaches a model depends on credentials this process is not
/// given, so the framing assertion below is the deterministic one: every byte
/// the server writes to stdout, from initialize through shutdown, is a JSON
/// line. The delta/response parity check runs additionally whenever a model
/// was reachable, and the assertion at the end names which of the two the run
/// exercised rather than passing silently over an empty case.
#[tokio::test]
async fn every_line_the_stdio_transport_writes_is_json() {
    let workspace = tempdir().expect("workspace");
    let home = tempdir().expect("home");
    let initialized_project = Command::new(env!("CARGO_BIN_EXE_agi"))
        .arg("init")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .output()
        .await
        .expect("initialize trusted test project");
    assert!(
        initialized_project.status.success(),
        "agi init failed: {}",
        String::from_utf8_lossy(&initialized_project.stderr)
    );
    std::fs::write(workspace.path().join("README.md"), "# QA project\n").expect("write README");

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
                },
                "protocolVersion": DEVELOPER_SESSION_PROTOCOL_VERSION
            }
        }),
    )
    .await;
    let initialized = next_response(&mut lines).await;
    assert_eq!(
        initialized["result"]["protocolVersion"],
        DEVELOPER_SESSION_PROTOCOL_VERSION
    );

    send(
        &mut stdin,
        json!({
            "id": 2,
            "method": "thread/start",
            "params": { "cwd": workspace.path(), "title": "Tool turn framing" }
        }),
    )
    .await;
    let started = next_response(&mut lines).await;
    assert!(started.get("error").is_none(), "{started}");
    let thread_id = started["result"]["thread"]["id"].clone();

    send(
        &mut stdin,
        json!({
            "id": 3,
            "method": "turn/start",
            "params": {
                "threadId": thread_id,
                "input": [{
                    "type": "text",
                    "text": "Read README.md in this folder and quote its first line"
                }]
            }
        }),
    )
    .await;

    // `next_line` is what the extension's reader does, and `from_str` below is
    // where it fails: a raw continuation line ends the session there.
    let mut deltas = String::new();
    let mut completed: Option<Value> = None;
    let mut turn_ended = false;
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(45);
    while !turn_ended {
        let Ok(Ok(Some(line))) = tokio::time::timeout_at(deadline, lines.next_line()).await else {
            break;
        };
        if line.trim().is_empty() {
            continue;
        }
        let value: Value = serde_json::from_str(&line)
            .unwrap_or_else(|error| panic!("stdout carried a non-JSON line ({error}): {line}"));
        match value["method"].as_str() {
            Some("turn/output_delta") => {
                deltas.push_str(value["params"]["delta"].as_str().unwrap_or_default());
            }
            Some("turn/completed") => {
                completed = Some(value["params"].clone());
                turn_ended = true;
            }
            Some("turn/failed") => turn_ended = true,
            _ => {}
        }
    }

    send(&mut stdin, json!({ "id": 4, "method": "shutdown", "params": {} })).await;
    while let Ok(Ok(Some(line))) = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        lines.next_line(),
    )
    .await
    {
        if line.trim().is_empty() {
            continue;
        }
        serde_json::from_str::<Value>(&line)
            .unwrap_or_else(|error| panic!("stdout carried a non-JSON line ({error}): {line}"));
    }

    if let Some(params) = completed {
        let response = params["response"].as_str().unwrap_or_default();
        assert!(!response.is_empty(), "a completed turn carries a response");
        assert_eq!(
            deltas, response,
            "the transcript rebuilt from deltas must match the completed \
             response; a shortfall is continuation text that went somewhere \
             other than the client"
        );
    } else {
        assert!(
            turn_ended,
            "the turn neither completed nor failed within the deadline, so \
             this run proved nothing about the protocol stream"
        );
    }
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
