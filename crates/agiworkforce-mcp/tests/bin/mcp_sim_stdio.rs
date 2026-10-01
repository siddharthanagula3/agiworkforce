//! Scripted fake stdio MCP server for the integration sim harness.
//!
//! Speaks JSON-RPC over stdin/stdout, line-delimited, per a mode selected by
//! argv[1]:
//!   * `normal` (default), initialize + tools/list + tools/call + prompts/list.
//!   * `stale`: handshake, then never answers the next request (client times out).
//!   * `elicit`: on tools/list, first sends `elicitation/create`, reads the
//!     client's reply, then answers tools/list. Mirrors the CLI's stdio
//!     elicitation ordering test without requiring python3.
//!
//! Kept deliberately dependency-light (std io + serde_json) so it starts fast.

use std::io::{BufRead, Write};

fn main() {
    let mode = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "normal".to_string());
    if mode == "stderr-lines" {
        let mut stderr = std::io::stderr().lock();
        for i in 0..5000 {
            writeln!(stderr, "diagnostic {i:04} {}", "x".repeat(100)).unwrap();
        }
        writeln!(stderr, "stderr complete").unwrap();
    }
    if mode == "stderr-long-line" {
        let mut stderr = std::io::stderr().lock();
        for _ in 0..256 {
            stderr.write_all(&[b'x'; 8192]).unwrap();
        }
        stderr.write_all(b"\nstderr complete\n").unwrap();
    }
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    let mut lines = stdin.lock().lines();

    let mut answered_handshake = false;

    while let Some(Ok(line)) = lines.next() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let frame: serde_json::Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let method = frame.get("method").and_then(|m| m.as_str()).unwrap_or("");
        let id = frame.get("id").cloned();

        match method {
            "initialize" => {
                let pv = frame
                    .get("params")
                    .and_then(|p| p.get("protocolVersion"))
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!("2024-11-05"));
                reply(
                    &mut stdout,
                    &id,
                    serde_json::json!({
                        "protocolVersion": pv,
                        "serverInfo": { "name": "mcp-sim-stdio", "version": "0.0.0" },
                        "capabilities": {}
                    }),
                );
                answered_handshake = true;
            }
            // Notification, no id, no reply.
            "notifications/initialized" => {}
            "notifications/cancelled" => {}
            "tools/list" => {
                if mode == "stdout-oversized-frame" || mode == "stdout-unfinished-frame" {
                    let bytes = if mode == "stdout-oversized-frame" {
                        let mut frame = serde_json::to_vec(&serde_json::json!({
                            "jsonrpc": "2.0", "id": id,
                            "result": { "tools": [], "padding": "x".repeat(8192) }
                        }))
                        .unwrap();
                        frame.push(b'\n');
                        frame
                    } else {
                        vec![b'x'; 8192]
                    };
                    stdout.write_all(&bytes[..4096]).unwrap();
                    stdout.flush().unwrap();
                    writeln!(std::io::stderr(), "stdout frame prefix flushed").unwrap();
                    let _ = stdout.write_all(&bytes[4096..]);
                    let _ = stdout.flush();
                    continue;
                }
                if mode == "stale" {
                    // Never answer, block until the child is killed. The client
                    // times out on this request.
                    for l in lines.by_ref() {
                        if l.is_err() {
                            break;
                        }
                    }
                    return;
                }
                if mode == "elicit" && answered_handshake {
                    // Ask the client for input first, then read its reply.
                    write_frame(
                        &mut stdout,
                        serde_json::json!({
                            "jsonrpc": "2.0",
                            "id": "elicit-1",
                            "method": "elicitation/create",
                            "params": {
                                "message": "confirm",
                                "requestedSchema": {"type": "object"}
                            }
                        }),
                    );
                    // Read exactly one reply frame (the client's elicitation response).
                    if let Some(Ok(reply_line)) = lines.next() {
                        let reply: serde_json::Value = serde_json::from_str(reply_line.trim())
                            .unwrap_or(serde_json::Value::Null);
                        // Only proceed if it is the elicitation reply we expect.
                        let ok = reply.get("id").and_then(|v| v.as_str()) == Some("elicit-1");
                        if !ok {
                            return;
                        }
                    }
                }
                reply(
                    &mut stdout,
                    &id,
                    serde_json::json!({
                        "tools": [{
                            "name": "echo",
                            "description": "Echo the input back as text.",
                            "inputSchema": {
                                "type": "object",
                                "properties": { "text": { "type": "string" } }
                            }
                        }]
                    }),
                );
            }
            "tools/call" => {
                let args = frame
                    .get("params")
                    .and_then(|p| p.get("arguments"))
                    .cloned()
                    .unwrap_or(serde_json::Value::Null);
                let echoed = args
                    .get("text")
                    .and_then(|t| t.as_str())
                    .unwrap_or("(no text)")
                    .to_string();
                reply(
                    &mut stdout,
                    &id,
                    serde_json::json!({
                        "content": [{ "type": "text", "text": echoed }],
                        "isError": false
                    }),
                );
            }
            "prompts/list" => {
                reply(&mut stdout, &id, serde_json::json!({ "prompts": [] }));
            }
            _ => {
                if let Some(id) = id {
                    write_frame(
                        &mut stdout,
                        serde_json::json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "error": { "code": -32601, "message": "method not found" }
                        }),
                    );
                }
            }
        }
    }
}

fn reply(stdout: &mut std::io::Stdout, id: &Option<serde_json::Value>, result: serde_json::Value) {
    let Some(id) = id else { return };
    write_frame(
        stdout,
        serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": result }),
    );
}

fn write_frame(stdout: &mut std::io::Stdout, frame: serde_json::Value) {
    let mut line = serde_json::to_string(&frame).unwrap();
    line.push('\n');
    let _ = stdout.write_all(line.as_bytes());
    let _ = stdout.flush();
}
