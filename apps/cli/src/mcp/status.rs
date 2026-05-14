//! MCP server health snapshots.

use serde::{Deserialize, Serialize};

#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum McpServerStatus {
    Connected,
    Disabled,
    NeedsAuth,
    Failed,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerStatusSnapshot {
    pub server: String,
    pub status: McpServerStatus,
    pub tool_count: Option<usize>,
    pub error: Option<String>,
    pub last_checked_unix: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_connected_serializes_lowercase() {
        let s = serde_json::to_string(&McpServerStatus::Connected).unwrap();
        assert_eq!(s, "\"connected\"");
    }

    #[test]
    fn status_needs_auth_serializes_lowercase() {
        let s = serde_json::to_string(&McpServerStatus::NeedsAuth).unwrap();
        assert_eq!(s, "\"needsauth\"");
    }

    #[test]
    fn status_failed_serializes_lowercase() {
        let s = serde_json::to_string(&McpServerStatus::Failed).unwrap();
        assert_eq!(s, "\"failed\"");
    }

    #[test]
    fn snapshot_round_trips() {
        let snap = McpServerStatusSnapshot {
            server: "github".into(),
            status: McpServerStatus::Connected,
            tool_count: Some(34),
            error: None,
            last_checked_unix: 1_700_000_000,
        };
        let j = serde_json::to_string(&snap).unwrap();
        let back: McpServerStatusSnapshot = serde_json::from_str(&j).unwrap();
        assert_eq!(back.tool_count, Some(34));
        assert_eq!(back.server, "github");
        assert_eq!(back.status, McpServerStatus::Connected);
    }

    #[test]
    fn snapshot_with_error_round_trips() {
        let snap = McpServerStatusSnapshot {
            server: "slack".into(),
            status: McpServerStatus::Failed,
            tool_count: None,
            error: Some("connection refused".into()),
            last_checked_unix: 1_700_000_001,
        };
        let j = serde_json::to_string(&snap).unwrap();
        let back: McpServerStatusSnapshot = serde_json::from_str(&j).unwrap();
        assert_eq!(back.error.as_deref(), Some("connection refused"));
    }

    #[test]
    fn disabled_status_serializes() {
        let s = serde_json::to_string(&McpServerStatus::Disabled).unwrap();
        assert_eq!(s, "\"disabled\"");
    }
}
