use serde_json::{Value, json};

use crate::protocol::{INTERNAL_ERROR, RpcError};

pub(crate) fn request_frame(id: &Value, method: &str, params: Option<Value>) -> Value {
    let mut frame = json!({ "jsonrpc": "2.0", "id": id, "method": method });
    if let Some(params) = params {
        frame["params"] = params;
    }
    frame
}

pub(crate) fn notification_frame(method: &str, params: Option<Value>) -> Value {
    let mut frame = json!({ "jsonrpc": "2.0", "method": method });
    if let Some(params) = params {
        frame["params"] = params;
    }
    frame
}

#[derive(Debug)]
pub(crate) struct PeerRpcError {
    pub(crate) server: String,
    pub(crate) error: RpcError,
}

impl std::fmt::Display for PeerRpcError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.server, self.error)
    }
}

impl std::error::Error for PeerRpcError {}

pub(crate) fn peer_error(error: &anyhow::Error) -> Option<&RpcError> {
    error.chain().find_map(|cause| {
        cause
            .downcast_ref::<PeerRpcError>()
            .map(|peer| &peer.error)
            .or_else(|| cause.downcast_ref::<RpcError>())
    })
}

fn is_response(frame: &Value) -> bool {
    frame.get("method").is_none() && (frame.get("result").is_some() || frame.get("error").is_some())
}

pub(crate) fn matching_response(frame: &Value, id: &Value) -> Option<Value> {
    let matches = |candidate: &&Value| is_response(candidate) && candidate.get("id") == Some(id);
    match frame.as_array() {
        Some(batch) => batch.iter().find(matches).cloned(),
        None => Some(frame).filter(matches).cloned(),
    }
}

pub(crate) fn into_result(frame: Value, server: &str) -> anyhow::Result<Value> {
    if let Some(error) = frame.get("error") {
        let error = serde_json::from_value::<RpcError>(error.clone())
            .unwrap_or_else(|_| RpcError::new(INTERNAL_ERROR, error.to_string()));
        return Err(anyhow::Error::new(PeerRpcError {
            server: server.to_string(),
            error,
        }));
    }
    Ok(frame.get("result").cloned().unwrap_or(Value::Null))
}

pub(crate) fn error_body(body: &[u8], server: &str) -> Option<PeerRpcError> {
    let frame: Value = serde_json::from_slice(body).ok()?;
    let error = serde_json::from_value::<RpcError>(frame.get("error")?.clone()).ok()?;
    Some(PeerRpcError {
        server: server.to_string(),
        error,
    })
}

pub(crate) fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_rpc_request_serialization() {
        let frame = request_frame(
            &json!(1),
            "server/discover",
            Some(json!({"_meta": {"io.modelcontextprotocol/protocolVersion": "2026-07-28"}})),
        );
        let json = serde_json::to_string(&frame).unwrap();
        assert!(json.contains("\"jsonrpc\":\"2.0\""));
        assert!(json.contains("\"method\":\"server/discover\""));
    }

    #[test]
    fn json_rpc_request_omits_none_params() {
        let frame = request_frame(&json!(7), "tools/list", None);
        let json = serde_json::to_string(&frame).unwrap();
        assert!(!json.contains("params"));
    }

    #[test]
    fn json_rpc_error_display() {
        let frame = json!({
            "jsonrpc": "2.0",
            "id": 3,
            "error": {"code": -32600, "message": "Invalid Request"}
        });
        let err = into_result(frame, "srv").unwrap_err();
        assert_eq!(format!("{err}"), "[srv] MCP error -32600: Invalid Request");
        assert_eq!(peer_error(&err).map(|e| e.code), Some(-32600));
    }

    #[test]
    fn extract_matches_from_array() {
        let frame = json!([
            {"jsonrpc": "2.0", "id": 1, "result": {"a": 1}},
            {"jsonrpc": "2.0", "id": 2, "result": {"b": 2}}
        ]);
        let matched = matching_response(&frame, &json!(2)).unwrap();
        assert_eq!(into_result(matched, "srv").unwrap(), json!({"b": 2}));
    }

    #[test]
    fn extract_returns_none_when_absent() {
        let frame = json!({"jsonrpc": "2.0", "id": 9, "result": {}});
        assert_eq!(matching_response(&frame, &json!(1)), None);
    }

    #[test]
    fn find_subsequence_locates_frame_boundary() {
        assert_eq!(find_subsequence(b"data: x\n\nrest", b"\n\n"), Some(7));
        assert_eq!(find_subsequence(b"no boundary", b"\n\n"), None);
    }
}
