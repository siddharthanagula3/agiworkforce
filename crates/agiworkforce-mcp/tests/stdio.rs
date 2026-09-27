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

use agiworkforce_mcp::{McpClient, McpTimeouts, TransportConfig};

fn stdio_cfg(mode: &str) -> TransportConfig {
    TransportConfig::Stdio {
        command: env!("CARGO_BIN_EXE_mcp_sim_stdio").to_string(),
        args: vec![mode.to_string()],
        env: HashMap::new(),
    }
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
