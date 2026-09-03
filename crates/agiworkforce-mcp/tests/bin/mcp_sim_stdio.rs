
use std::io::{BufRead, Write};

fn main() {
    let mode = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "normal".to_string());
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
            "notifications/initialized" => {}
            "notifications/cancelled" => {}
            "tools/list" => {
                if mode == "stale" {
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
