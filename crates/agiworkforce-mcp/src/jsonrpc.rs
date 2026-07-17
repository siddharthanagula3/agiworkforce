//! JSON-RPC 2.0 wire frames + id-correlation helpers shared by the transports.

use anyhow::{Result, bail};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub(crate) struct JsonRpcRequest {
    pub(crate) jsonrpc: String,
    pub(crate) id: u64,
    pub(crate) method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) params: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcResponse {
    #[allow(dead_code)]
    jsonrpc: String,
    #[allow(dead_code)]
    id: Option<u64>,
    result: Option<serde_json::Value>,
    error: Option<JsonRpcError>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcError {
    code: i64,
    message: String,
}

impl std::fmt::Display for JsonRpcError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "MCP error {}: {}", self.code, self.message)
    }
}

/// Given a JSON value that may be either a single JSON-RPC response or an array
/// of responses (batched), extract the one matching `expected_id`.
///
/// Returns `Ok(Some(result))` if matched, `Ok(None)` if not in this frame, or
/// `Err(...)` if the matched response carries a JSON-RPC error.
pub(crate) fn extract_matching_response(
    frame: &serde_json::Value,
    expected_id: u64,
    server_name: &str,
) -> Result<Option<Option<serde_json::Value>>> {
    // Frames may be a single object or an array (batched responses).
    let candidates: Vec<&serde_json::Value> = if let Some(arr) = frame.as_array() {
        arr.iter().collect()
    } else {
        vec![frame]
    };
    for candidate in candidates {
        let response: JsonRpcResponse = match serde_json::from_value(candidate.clone()) {
            Ok(r) => r,
            Err(_) => continue,
        };
        if response.id == Some(expected_id) {
            if let Some(error) = response.error {
                bail!("[{server_name}] {error}");
            }
            return Ok(Some(response.result));
        }
    }
    Ok(None)
}

/// A stdio/SSE single-frame decode used by the read loops: returns the matching
/// response, or `None` if the frame is a notification / different-id response.
///
/// This is the non-batched sibling used by the stdio read loop.
pub(crate) fn match_single_response(
    frame: serde_json::Value,
    expected_id: u64,
    server_name: &str,
) -> Result<Option<Option<serde_json::Value>>> {
    let response: JsonRpcResponse = match serde_json::from_value(frame) {
        Ok(r) => r,
        Err(_) => return Ok(None),
    };
    if response.id == Some(expected_id) {
        if let Some(error) = response.error {
            bail!("[{server_name}] {error}");
        }
        return Ok(Some(response.result));
    }
    Ok(None)
}

/// Locate the first occurrence of `needle` in `haystack`. Used by the SSE-frame
/// splitters (b"\n\n" boundary detection).
pub(crate) fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_rpc_request_serialization() {
        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: 1,
            method: "initialize".to_string(),
            params: Some(serde_json::json!({"protocolVersion": "2024-11-05"})),
        };
        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("\"jsonrpc\":\"2.0\""));
        assert!(json.contains("\"method\":\"initialize\""));
    }

    #[test]
    fn json_rpc_request_omits_none_params() {
        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: 7,
            method: "tools/list".to_string(),
            params: None,
        };
        let json = serde_json::to_string(&req).unwrap();
        assert!(!json.contains("params"));
    }

    #[test]
    fn json_rpc_error_display() {
        let frame = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 3,
            "error": {"code": -32600, "message": "Invalid Request"}
        });
        let err = extract_matching_response(&frame, 3, "srv").unwrap_err();
        assert_eq!(format!("{err}"), "[srv] MCP error -32600: Invalid Request");
    }

    #[test]
    fn extract_matches_from_array() {
        let frame = serde_json::json!([
            {"jsonrpc": "2.0", "id": 1, "result": {"a": 1}},
            {"jsonrpc": "2.0", "id": 2, "result": {"b": 2}}
        ]);
        let matched = extract_matching_response(&frame, 2, "srv").unwrap();
        assert_eq!(matched, Some(Some(serde_json::json!({"b": 2}))));
    }

    #[test]
    fn extract_returns_none_when_absent() {
        let frame = serde_json::json!({"jsonrpc": "2.0", "id": 9, "result": {}});
        let matched = extract_matching_response(&frame, 1, "srv").unwrap();
        assert_eq!(matched, None);
    }

    #[test]
    fn find_subsequence_locates_frame_boundary() {
        assert_eq!(find_subsequence(b"data: x\n\nrest", b"\n\n"), Some(7));
        assert_eq!(find_subsequence(b"no boundary", b"\n\n"), None);
    }
}
