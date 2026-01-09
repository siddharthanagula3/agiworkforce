use once_cell::sync::Lazy;
use parking_lot::RwLock;
use std::collections::{HashMap, VecDeque};

/// Maximum number of log lines to keep per server
const MAX_LOG_LINES_PER_SERVER: usize = 1000;

/// Global log buffer for MCP server logs
static SERVER_LOG_BUFFER: Lazy<RwLock<HashMap<String, VecDeque<String>>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));

/// Append a log line to a server's log buffer
pub fn append_server_log(server_name: &str, log_line: impl Into<String>) {
    let mut logs = SERVER_LOG_BUFFER.write();
    let buffer = logs.entry(server_name.to_string()).or_default();
    buffer.push_back(log_line.into());

    // Trim to max size
    while buffer.len() > MAX_LOG_LINES_PER_SERVER {
        buffer.pop_front();
    }
}

/// Clear logs for a specific server
pub fn clear_server_logs(server_name: &str) {
    let mut logs = SERVER_LOG_BUFFER.write();
    logs.remove(server_name);
}

/// Get logs for a specific server
pub fn get_server_logs(server_name: &str, lines: Option<usize>) -> Vec<String> {
    let logs = SERVER_LOG_BUFFER.read();
    if let Some(buffer) = logs.get(server_name) {
        let limit = lines.unwrap_or(MAX_LOG_LINES_PER_SERVER);
        buffer.iter().rev().take(limit).rev().cloned().collect()
    } else {
        Vec::new()
    }
}
