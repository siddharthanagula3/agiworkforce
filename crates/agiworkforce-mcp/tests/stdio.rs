//! stdio transport: negotiation + tools/list + tools/call, plus the
//! server-initiated `elicitation/create` ordering guard (the reply must be
//! written back before the client keeps waiting for its own response).
//!
//! Two elicitation checks: a hermetic one against the `mcp_sim_stdio` bin, and
//! the CLI's original python-driven ordering test, ported verbatim (skips when
//! python3 is unavailable).

mod support;

use std::collections::HashMap;
use std::time::Duration;

use agiworkforce_mcp::{ClientHooks, McpClient, McpTimeouts, TransportConfig};

fn stdio_cfg(mode: &str) -> TransportConfig {
    TransportConfig::Stdio {
        command: env!("CARGO_BIN_EXE_mcp_sim_stdio").to_string(),
        args: vec![mode.to_string()],
        env: HashMap::new(),
        cwd: None,
    }
}

async fn assert_stdout_frame_closed(mode: &str) {
    let timeouts = McpTimeouts {
        max_frame_bytes: Some(4096),
        list_tools: Duration::from_millis(500),
        ..McpTimeouts::default()
    };
    let mut client = McpClient::connect(
        "stdout-frame-cap",
        stdio_cfg(mode),
        timeouts,
        support::decline_hooks(),
    )
    .await
    .expect("the ordinary handshake fits within the configured frame cap");
    let response = tokio::time::timeout(Duration::from_secs(3), client.list_tools()).await;
    let _ = client.shutdown().await;
    assert!(
        client
            .drain_stderr()
            .iter()
            .any(|line| line == "stdout frame prefix flushed"),
        "the child must flush a full cap-sized prefix before the refusal assertion"
    );
    let error = response
        .expect("frame refusal must finish without waiting for a delimiter")
        .expect_err("stdout beyond the configured frame cap must be refused");
    let detail = format!("{error:#}");
    assert!(detail.contains("MCP server closed connection"), "{detail}");
    assert!(!detail.contains("response timeout"), "{detail}");
}

#[tokio::test]
async fn stdio_stdout_complete_oversized_frame_is_closed() {
    assert_stdout_frame_closed("stdout-oversized-frame").await;
}

#[tokio::test]
async fn stdio_stdout_incomplete_oversized_frame_is_closed_before_newline() {
    assert_stdout_frame_closed("stdout-unfinished-frame").await;
}

#[tokio::test]
async fn stdio_stdout_configured_cap_preserves_ordinary_frames() {
    let mut client = McpClient::connect(
        "stdout-normal",
        stdio_cfg("normal"),
        McpTimeouts {
            max_frame_bytes: Some(4096),
            ..McpTimeouts::default()
        },
        support::decline_hooks(),
    )
    .await
    .expect("the ordinary handshake fits within the configured cap");
    let tools = client.list_tools().await.expect("ordinary tool list");
    assert_eq!(tools.len(), 1);
    let result = client
        .call_tool_value("echo", serde_json::json!({ "text": "λ🙂" }))
        .await
        .expect("ordinary tool call")
        .expect("tool response");
    assert_eq!(result["content"][0]["text"], "λ🙂");
    client.shutdown().await.expect("the child shuts down");
}

async fn folder_started_in(cwd: Option<std::path::PathBuf>) -> std::path::PathBuf {
    let cfg = TransportConfig::Stdio {
        command: env!("CARGO_BIN_EXE_mcp_sim_stdio").to_string(),
        args: vec!["cwd".to_string()],
        env: HashMap::new(),
        cwd,
    };
    let mut client = McpClient::connect(
        "stdio-cwd",
        cfg,
        McpTimeouts::default(),
        support::decline_hooks(),
    )
    .await
    .expect("connect");
    let raw = client
        .call_tool_value("echo", serde_json::json!({}))
        .await
        .expect("call_tool_value")
        .expect("result");
    let _ = client.shutdown().await;
    std::path::PathBuf::from(raw["content"][0]["text"].as_str().expect("folder"))
        .canonicalize()
        .expect("the folder the server reported")
}

fn starts_logged(log: &std::path::Path) -> usize {
    std::fs::read_to_string(log)
        .unwrap_or_default()
        .lines()
        .count()
}

async fn crashing_server(log: &std::path::Path, hooks: ClientHooks) -> McpClient {
    let cfg = TransportConfig::Stdio {
        command: env!("CARGO_BIN_EXE_mcp_sim_stdio").to_string(),
        args: vec!["die".to_string(), log.to_string_lossy().into_owned()],
        env: HashMap::new(),
        cwd: None,
    };
    McpClient::connect("stdio-respawn", cfg, McpTimeouts::default(), hooks)
        .await
        .expect("connect")
}

#[tokio::test]
async fn a_stopped_stdio_server_restarts_only_when_the_host_still_allows_it() {
    let folder = tempfile::tempdir().expect("tempdir");

    let unchecked = folder.path().join("unchecked");
    let mut client = crashing_server(&unchecked, support::decline_hooks()).await;
    let raw = client
        .call_tool_value("echo", serde_json::json!({ "text": "after the restart" }))
        .await
        .expect("a host with no check gets the restart it always got")
        .expect("result");
    assert_eq!(raw["content"][0]["text"], "after the restart");
    assert_eq!(starts_logged(&unchecked), 2);
    let _ = client.shutdown().await;

    let refused = folder.path().join("refused");
    let hooks = ClientHooks {
        before_respawn: Some(std::sync::Arc::new(|| {
            Err("its launch changed since it was approved".to_string())
        })),
        ..support::decline_hooks()
    };
    let mut client = crashing_server(&refused, hooks).await;
    let error = client
        .call_tool_value("echo", serde_json::json!({ "text": "never answered" }))
        .await
        .expect_err("a launch the host no longer allows was started again");
    let error = format!("{error:#}");
    assert!(
        error.contains("not restarted: its launch changed since it was approved"),
        "{error}"
    );
    assert_eq!(
        starts_logged(&refused),
        1,
        "the server was started again in silence"
    );
    assert!(
        client
            .call_tool_value("echo", serde_json::json!({ "text": "still down" }))
            .await
            .is_err(),
        "a server kept down answered"
    );
    assert_eq!(starts_logged(&refused), 1, "it stays down on the next call");
    let _ = client.shutdown().await;
}

#[tokio::test]
async fn stdio_child_starts_in_the_folder_the_transport_names() {
    let folder = tempfile::tempdir().expect("tempdir");
    let named = folder.path().canonicalize().expect("canonical folder");

    assert_eq!(
        folder_started_in(Some(folder.path().to_path_buf())).await,
        named
    );

    let here = std::env::current_dir()
        .expect("current dir")
        .canonicalize()
        .expect("canonical current dir");
    assert_ne!(here, named);
    assert_eq!(
        folder_started_in(None).await,
        here,
        "a transport that names no folder moved the server out of this process's"
    );
}

#[tokio::test]
async fn stdio_list_and_call() {
    let mut client = McpClient::connect(
        "stdio",
        stdio_cfg("normal"),
        McpTimeouts::default(),
        support::decline_hooks(),
    )
    .await
    .expect("connect");

    let tools = client.list_tools().await.expect("list_tools");
    assert_eq!(tools.len(), 1);
    assert_eq!(tools[0].name, "echo");

    let raw = client
        .call_tool_value("echo", serde_json::json!({ "text": "roundtrip" }))
        .await
        .expect("call_tool_value")
        .expect("result");
    assert_eq!(raw["content"][0]["text"], "roundtrip");

    let _ = client.shutdown().await;
}

#[tokio::test]
async fn stdio_connect_negotiates_the_legacy_handshake() {
    let mut client = McpClient::connect(
        "stdio-negotiated",
        stdio_cfg("normal"),
        McpTimeouts::default(),
        support::decline_hooks(),
    )
    .await
    .expect("connect");

    assert_eq!(client.server().protocol_version, "2025-11-25");
    assert_eq!(
        client
            .server()
            .server_info
            .as_ref()
            .map(|info| info.name.as_str()),
        Some("mcp-sim-stdio")
    );

    let tools = client.list_tools().await.expect("list_tools");
    assert_eq!(tools.len(), 1);
    assert_eq!(tools[0].name, "echo");

    let raw = client
        .call_tool_value("echo", serde_json::json!({ "text": "negotiated" }))
        .await
        .expect("call_tool_value")
        .expect("result");
    assert_eq!(raw["content"][0]["text"], "negotiated");

    assert!(
        client.transport_alive(),
        "child should be alive mid-session"
    );

    let _ = client.shutdown().await;
    assert!(
        !client.transport_alive(),
        "child should be reaped after shutdown"
    );
}

/// `drain_stderr` streams a stdio child's stderr lines to the host (desktop's
/// per-server log viewer) and empties the buffer on each call.
#[tokio::test]
async fn stdio_drain_stderr_returns_child_stderr_lines() {
    let python_available = std::process::Command::new("python3")
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false);
    if !python_available {
        return;
    }

    let script = r#"
import json
import sys

print("boot line one", file=sys.stderr, flush=True)
print("boot line two", file=sys.stderr, flush=True)

while True:
    init = json.loads(sys.stdin.readline())
    if init.get("method") != "server/discover":
        break
    print(json.dumps({"jsonrpc": "2.0", "id": init["id"], "error": {"code": -32601, "message": "Method not found"}}), flush=True)
print(json.dumps({"jsonrpc": "2.0", "id": init["id"], "result": {"protocolVersion": "2025-11-25", "serverInfo": {"name": "t", "version": "0"}}}), flush=True)
sys.stdin.readline()  # notifications/initialized
sys.stdin.readline()  # block until shutdown
"#;

    let cfg = TransportConfig::Stdio {
        command: "python3".to_string(),
        args: vec!["-u".to_string(), "-c".to_string(), script.to_string()],
        env: HashMap::new(),
        cwd: None,
    };
    let mut client = McpClient::connect(
        "stdio-stderr",
        cfg,
        McpTimeouts::default(),
        support::decline_hooks(),
    )
    .await
    .expect("connect");

    // The stderr drain task races the handshake; poll briefly for both lines.
    let mut drained: Vec<String> = Vec::new();
    for _ in 0..50 {
        drained.extend(client.drain_stderr());
        if drained.len() >= 2 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert_eq!(drained, vec!["boot line one", "boot line two"]);

    // Buffer is emptied by draining.
    assert!(client.drain_stderr().is_empty());

    let _ = client.shutdown().await;
}

#[tokio::test]
async fn stdio_elicitation_reply_unblocks_response() {
    let timeouts = McpTimeouts {
        initialize: Duration::from_secs(3),
        list_tools: Duration::from_secs(3),
        ..McpTimeouts::default()
    };
    let mut client = McpClient::connect(
        "stdio-elicit",
        stdio_cfg("elicit"),
        timeouts,
        support::decline_hooks(),
    )
    .await
    .expect("connect");

    let tools = client
        .list_tools()
        .await
        .expect("list_tools after elicitation");
    assert_eq!(tools.len(), 1);
    let _ = client.shutdown().await;
}

/// Ported verbatim from the CLI's
/// `stdio_elicitation_reply_is_written_before_waiting_for_response`.
#[tokio::test]
async fn python_stdio_elicitation_ordering() {
    let python_available = std::process::Command::new("python3")
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false);
    if !python_available {
        return;
    }

    let script = r#"
import json
import sys

def read_frame():
    line = sys.stdin.readline()
    if not line:
        sys.exit(2)
    return json.loads(line)

def write_frame(frame):
    print(json.dumps(frame), flush=True)

init = read_frame()
while init.get("method") == "server/discover":
    write_frame({"jsonrpc": "2.0", "id": init["id"], "error": {"code": -32601, "message": "Method not found"}})
    init = read_frame()
write_frame({"jsonrpc": "2.0", "id": init["id"], "result": {"protocolVersion": "2025-11-25", "serverInfo": {"name": "test", "version": "0"}}})
read_frame()  # notifications/initialized
tools = read_frame()
write_frame({
    "jsonrpc": "2.0",
    "id": "elicit-1",
    "method": "elicitation/create",
    "params": {
        "message": "confirm",
        "requestedSchema": {"type": "object"}
    }
})
reply = read_frame()
if reply.get("id") != "elicit-1" or reply.get("result", {}).get("action") != "decline":
    sys.exit(3)
write_frame({"jsonrpc": "2.0", "id": tools["id"], "result": {"tools": []}})
"#;

    let cfg = TransportConfig::Stdio {
        command: "python3".to_string(),
        args: vec!["-u".to_string(), "-c".to_string(), script.to_string()],
        env: HashMap::new(),
        cwd: None,
    };
    let timeouts = McpTimeouts {
        initialize: Duration::from_secs(2),
        list_tools: Duration::from_millis(500),
        call_tool: Duration::from_secs(2),
        health_check: Duration::from_millis(500),
        ..McpTimeouts::default()
    };

    let mut client = McpClient::connect("stdio-elicit", cfg, timeouts, support::decline_hooks())
        .await
        .expect("connect");
    let tools = client.list_tools().await.expect("list tools");
    assert!(tools.is_empty());
    let _ = client.shutdown().await;
}

async fn bounded_stderr(mode: &str) -> Vec<String> {
    let mut client = McpClient::connect(
        mode,
        stdio_cfg(mode),
        McpTimeouts::default(),
        support::decline_hooks(),
    )
    .await
    .expect("connect after all stderr writes finish");
    assert_eq!(client.list_tools().await.expect("live child").len(), 1);
    client
        .shutdown()
        .await
        .expect("shutdown drains final stderr");
    let mut lines = Vec::new();
    for _ in 0..100 {
        lines.extend(client.drain_stderr());
        if lines.last().is_some_and(|line| line == "stderr complete") {
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert_eq!(lines.last().map(String::as_str), Some("stderr complete"));
    assert!(client.drain_stderr().is_empty());
    lines
}

#[tokio::test]
async fn stdio_stderr_queue_keeps_recent_diagnostics_within_limits() {
    use agiworkforce_mcp::config::{DEFAULT_MAX_STDERR_BUFFER_BYTES, DEFAULT_MAX_STDERR_LINES};

    let lines = bounded_stderr("stderr-lines").await;
    assert_eq!(lines.last().map(String::as_str), Some("stderr complete"));
    assert!(
        lines
            .iter()
            .any(|line| line.starts_with("diagnostic 4999 "))
    );
    assert!(lines.len() <= DEFAULT_MAX_STDERR_LINES);
    assert!(lines.iter().map(String::len).sum::<usize>() <= DEFAULT_MAX_STDERR_BUFFER_BYTES);
    assert_eq!(lines.first().map(String::as_str), Some("[stderr omitted]"));
}

#[tokio::test]
async fn stdio_stderr_long_line_is_bounded_and_pipe_keeps_draining() {
    use agiworkforce_mcp::config::DEFAULT_MAX_STDERR_LINE_BYTES;

    let lines = bounded_stderr("stderr-long-line").await;
    assert_eq!(lines.last().map(String::as_str), Some("stderr complete"));
    assert_eq!(lines.len(), 2);
    assert!(lines[0].len() <= DEFAULT_MAX_STDERR_LINE_BYTES);
    assert!(lines[0].ends_with(" [stderr truncated]"));
}

#[tokio::test]
async fn stdio_configured_stderr_limits_apply_to_real_child_output() {
    let timeouts = McpTimeouts {
        max_stderr_line_bytes: Some(64),
        max_stderr_buffer_bytes: Some(128),
        max_stderr_lines: Some(3),
        ..McpTimeouts::default()
    };
    let mut client = McpClient::connect(
        "custom-stderr",
        stdio_cfg("stderr-lines"),
        timeouts,
        support::decline_hooks(),
    )
    .await
    .expect("connect after stderr burst");
    client.shutdown().await.expect("shutdown");
    let lines = client.drain_stderr();
    assert_eq!(lines.last().map(String::as_str), Some("stderr complete"));
    assert!(lines.len() <= 3);
    assert!(lines.iter().all(|line| line.len() <= 64));
    assert!(lines.iter().map(String::len).sum::<usize>() <= 128);
}
