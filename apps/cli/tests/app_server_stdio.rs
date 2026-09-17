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
    init_git_repository(workspace.path());

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

    // The workspace was initialised as a git repository by `agi init`, so the
    // host persists its branch and worktree root on the thread, and the name
    // this connection introduced itself with.
    let thread = &started["result"]["thread"];
    // The two are not the same fact: `createdBy` is the surface bucket this
    // client falls into, `client` is the exact name it introduced itself with.
    assert_eq!(thread["createdBy"], "vscode");
    assert_eq!(thread["client"], "agi_vscode_test");
    assert_eq!(
        thread["gitBranch"],
        current_branch(workspace.path()),
        "thread/start must persist the branch it was started on: {thread}"
    );
    assert_eq!(
        thread["worktreeRoot"],
        workspace
            .path()
            .canonicalize()
            .expect("canonical workspace")
            .display()
            .to_string()
    );

    // The same fields survive a round trip through the store rather than being
    // recomputed: thread/list reads them off the persisted thread.
    send(
        &mut stdin,
        json!({ "id": 10, "method": "thread/list", "params": { "cwd": workspace.path() } }),
    )
    .await;
    let listed = next_response(&mut lines).await;
    let threads = listed["result"]["threads"]
        .as_array()
        .expect("thread list array");
    let listed_thread = threads
        .iter()
        .find(|entry| entry["id"] == thread_id)
        .unwrap_or_else(|| panic!("started thread must appear in thread/list: {listed}"));
    assert_eq!(listed_thread["gitBranch"], thread["gitBranch"]);
    assert_eq!(listed_thread["worktreeRoot"], thread["worktreeRoot"]);
    assert_eq!(listed_thread["client"], "agi_vscode_test");

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
    let mut announced_model: Option<Value> = None;
    let mut completed: Option<Value> = None;
    let mut failed: Option<Value> = None;
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
            Some("turn/model") => {
                announced_model = Some(value["params"].clone());
            }
            Some("turn/output_delta") => {
                deltas.push_str(value["params"]["delta"].as_str().unwrap_or_default());
            }
            Some("turn/completed") => {
                completed = Some(value["params"].clone());
                turn_ended = true;
            }
            Some("turn/failed") => {
                failed = Some(value["params"].clone());
                turn_ended = true;
            }
            _ => {}
        }
    }

    send(
        &mut stdin,
        json!({ "id": 4, "method": "shutdown", "params": {} }),
    )
    .await;
    while let Ok(Ok(Some(line))) =
        tokio::time::timeout(std::time::Duration::from_secs(5), lines.next_line()).await
    {
        if line.trim().is_empty() {
            continue;
        }
        serde_json::from_str::<Value>(&line)
            .unwrap_or_else(|error| panic!("stdout carried a non-JSON line ({error}): {line}"));
    }

    if turn_ended {
        let model = announced_model
            .as_ref()
            .unwrap_or_else(|| panic!("a turn must announce the route it runs on"));
        assert_eq!(model["threadId"], thread_id);
        assert!(model["turnId"].is_string(), "{model}");
        assert!(
            model["model"]
                .as_str()
                .is_some_and(|value| !value.is_empty()),
            "{model}"
        );
        assert!(
            model["provider"]
                .as_str()
                .is_some_and(|value| !value.is_empty()),
            "{model}"
        );
        assert!(model["trustMode"].is_string(), "{model}");
        assert!(model.get("fallbackFrom").is_none(), "{model}");
    }

    if let Some(params) = failed {
        // A turn can only fail here for want of a credential: this process is
        // given none. The typed object is what lets a client offer a sign-in
        // instead of printing the provider's prose at the user.
        assert!(
            params["error"].is_string(),
            "a failed turn keeps its human-readable error: {params}"
        );
        let failure = &params["failure"];
        assert_eq!(
            failure["code"], "account_signed_out",
            "an unauthenticated turn must classify as a signed-out account: {params}"
        );
        assert_eq!(failure["action"], "sign_in_account");
        assert_eq!(failure["retryable"], false);
        assert!(
            failure["provider"].is_null(),
            "a signed-out account names no vendor route: {params}"
        );
        assert_eq!(failure["message"], params["error"]);
    } else if let Some(params) = completed {
        let response = params["response"].as_str().unwrap_or_default();
        assert!(!response.is_empty(), "a completed turn carries a response");
        assert!(
            params["failure"].is_null(),
            "a completed turn carries an explicit null failure: {params}"
        );
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

/// A workspace with no repository has no branch to persist, so the assertions
/// below would pass over an empty case. Give it one.
fn init_git_repository(workspace: &std::path::Path) {
    let run = |args: &[&str]| {
        let output = std::process::Command::new("git")
            .arg("-C")
            .arg(workspace)
            .args(args)
            .output()
            .expect("run git");
        assert!(
            output.status.success(),
            "git {args:?} failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    };
    run(&["init", "--quiet"]);
    run(&["config", "user.email", "test@example.com"]);
    run(&["config", "user.name", "Test"]);
    run(&["add", "README.md"]);
    run(&["commit", "--quiet", "-m", "initial"]);
}

fn current_branch(workspace: &std::path::Path) -> String {
    let output = std::process::Command::new("git")
        .arg("-C")
        .arg(workspace)
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .expect("git rev-parse");
    assert!(
        output.status.success(),
        "workspace must be a git repository"
    );
    String::from_utf8_lossy(&output.stdout).trim().to_string()
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
