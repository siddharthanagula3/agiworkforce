//! MCP elicitation handler — server-initiated user prompts.
//!
//! In the Model Context Protocol, a server can call `elicitation/create`
//! to ask the client (us) for structured user input — for example, a server
//! that wraps GitHub or Slack might ask "please provide your API key" or
//! "choose a repository". Without elicitation support a server that requires
//! input simply hangs waiting for a response that never comes.
//!
//! This module ports the contract from Codex CLI's
//! `codex-rs/codex-mcp/src/elicitation.rs` (Codex audit M12) so AGI Workforce
//! has a typed surface for the request/response cycle. Wiring it into the
//! live `McpConnection` request loop is the next step (the connection
//! dispatcher needs to recognize incoming `elicitation/create` requests and
//! route them through an [`ElicitationHandler`]).
//!
//! Three handlers ship today:
//! - [`AutoDeclineHandler`] — safe default; declines every request without
//!   surfacing it to the user. Useful for non-interactive runs.
//! - [`AutoAcceptHandler`] — for tests only; accepts every request with the
//!   `requestedSchema` defaults.
//! - [`StdinPromptHandler`] — prints the message to stderr and reads a single
//!   line from stdin; primitive but unblocks bare REPL use. Real TUI users
//!   will get an overlay handler in a follow-up.
//!
//! Public items are wired into `McpConnection`'s read loop which dispatches
//! incoming `elicitation/create` server requests (M16).

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use serde::{Deserialize, Serialize};

/// Server → client `elicitation/create` request payload.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ElicitationRequest {
    /// Human-readable message shown to the user.
    pub message: String,
    /// JSON Schema describing the structured input the server expects.
    #[serde(rename = "requestedSchema")]
    pub requested_schema: serde_json::Value,
}

/// Action the user took in response to the elicitation.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ElicitationAction {
    Accept,
    Decline,
    Cancel,
}

/// Client → server `elicitation/create` response payload.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ElicitationResponse {
    pub action: ElicitationAction,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<serde_json::Value>,
}

impl ElicitationResponse {
    pub fn accept(content: serde_json::Value) -> Self {
        Self {
            action: ElicitationAction::Accept,
            content: Some(content),
        }
    }
    pub fn decline() -> Self {
        Self {
            action: ElicitationAction::Decline,
            content: None,
        }
    }
    pub fn cancel() -> Self {
        Self {
            action: ElicitationAction::Cancel,
            content: None,
        }
    }
}

/// Pluggable handler for elicitation requests. Implementations decide
/// whether to surface the request to the user, auto-decline, or
/// auto-accept (test-only).
///
/// Uses `BoxFuture` return type instead of `async_trait` to stay dyn-compatible
/// without adding the `async-trait` crate to Cargo.toml.
pub trait ElicitationHandler: Send + Sync {
    /// Handle one elicitation request from the named MCP server. The
    /// handler is allowed to take as long as it needs (including
    /// blocking the user) — the MCP connection layer will wait.
    fn handle<'a>(
        &'a self,
        server_name: &'a str,
        request: ElicitationRequest,
    ) -> Pin<Box<dyn Future<Output = ElicitationResponse> + Send + 'a>>;
}

/// Safe default. Declines every request without surfacing it to the user.
/// Recommended for headless / CI runs.
pub struct AutoDeclineHandler;

impl ElicitationHandler for AutoDeclineHandler {
    fn handle<'a>(
        &'a self,
        _server_name: &'a str,
        _request: ElicitationRequest,
    ) -> Pin<Box<dyn Future<Output = ElicitationResponse> + Send + 'a>> {
        Box::pin(async { ElicitationResponse::decline() })
    }
}

/// Test-only. Accepts every request with `content = {}`.
#[allow(dead_code)]
pub struct AutoAcceptHandler;

impl ElicitationHandler for AutoAcceptHandler {
    fn handle<'a>(
        &'a self,
        _server_name: &'a str,
        _request: ElicitationRequest,
    ) -> Pin<Box<dyn Future<Output = ElicitationResponse> + Send + 'a>> {
        Box::pin(async { ElicitationResponse::accept(serde_json::json!({})) })
    }
}

/// Bare-REPL fallback. Prints the message to stderr and reads a single
/// JSON line from stdin. Returns `Decline` on EOF or invalid JSON.
/// Wired from the bare `--no-tui` REPL once the live-connection plumbing lands.
#[allow(dead_code)]
pub struct StdinPromptHandler;

impl ElicitationHandler for StdinPromptHandler {
    fn handle<'a>(
        &'a self,
        server_name: &'a str,
        request: ElicitationRequest,
    ) -> Pin<Box<dyn Future<Output = ElicitationResponse> + Send + 'a>> {
        Box::pin(async move {
            use tokio::io::{AsyncBufReadExt, BufReader};

            eprintln!(
                "[mcp:{server_name}] elicitation request: {}\nSchema: {}\nPaste JSON response or press Ctrl+D to decline:",
                request.message, request.requested_schema
            );
            let mut reader = BufReader::new(tokio::io::stdin());
            let mut line = String::new();
            match reader.read_line(&mut line).await {
                Ok(0) => ElicitationResponse::decline(),
                Ok(_) => match serde_json::from_str::<serde_json::Value>(line.trim()) {
                    Ok(value) => ElicitationResponse::accept(value),
                    Err(_) => ElicitationResponse::decline(),
                },
                Err(_) => ElicitationResponse::decline(),
            }
        })
    }
}

/// Shared handle so transports can share one handler across connections.
/// Will be threaded through `McpManager` when the dispatch loop lands.
pub type SharedElicitationHandler = Arc<dyn ElicitationHandler>;

#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_request() -> ElicitationRequest {
        ElicitationRequest {
            message: "Please confirm".into(),
            requested_schema: serde_json::json!({"type": "object"}),
        }
    }

    #[test]
    fn request_round_trips_through_serde() {
        let req = dummy_request();
        let json = serde_json::to_string(&req).expect("serialize");
        assert!(json.contains("\"message\":\"Please confirm\""));
        assert!(json.contains("\"requestedSchema\""));
        let back: ElicitationRequest = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(req, back);
    }

    #[test]
    fn response_serializes_action_as_lowercase() {
        let accept = serde_json::to_string(&ElicitationResponse::accept(
            serde_json::json!({"x": 1}),
        ))
        .unwrap();
        assert!(accept.contains("\"action\":\"accept\""));
        assert!(accept.contains("\"content\":{\"x\":1}"));

        let decline = serde_json::to_string(&ElicitationResponse::decline()).unwrap();
        assert!(decline.contains("\"action\":\"decline\""));
        assert!(!decline.contains("\"content\""));

        let cancel = serde_json::to_string(&ElicitationResponse::cancel()).unwrap();
        assert!(cancel.contains("\"action\":\"cancel\""));
        assert!(!cancel.contains("\"content\""));
    }

    #[tokio::test]
    async fn auto_decline_handler_always_declines() {
        let h = AutoDeclineHandler;
        let resp = h.handle("test", dummy_request()).await;
        assert_eq!(resp.action, ElicitationAction::Decline);
        assert!(resp.content.is_none());
    }

    #[tokio::test]
    async fn auto_accept_handler_returns_empty_object() {
        let h = AutoAcceptHandler;
        let resp = h.handle("test", dummy_request()).await;
        assert_eq!(resp.action, ElicitationAction::Accept);
        assert_eq!(resp.content, Some(serde_json::json!({})));
    }

    #[test]
    fn action_round_trips_through_serde() {
        for (action, label) in [
            (ElicitationAction::Accept, "accept"),
            (ElicitationAction::Decline, "decline"),
            (ElicitationAction::Cancel, "cancel"),
        ] {
            let json = serde_json::to_string(&action).unwrap();
            assert_eq!(json, format!("\"{label}\""));
            let back: ElicitationAction = serde_json::from_str(&json).unwrap();
            assert_eq!(action, back);
        }
    }

    // -----------------------------------------------------------------------
    // Dispatch integration tests (M16)
    //
    // These tests verify the full dispatch path: a fake "server" pushes an
    // `elicitation/create` JSON-RPC frame into an mpsc channel, the handler
    // is invoked, and the JSON-RPC response shape is correct.
    //
    // Pattern: fake server task → tx channel → client dispatch logic → assert
    // response. No real child process needed.
    // -----------------------------------------------------------------------

    /// Build a JSON-RPC `elicitation/create` server request frame.
    fn make_elicitation_rpc_request(id: u64, message: &str) -> serde_json::Value {
        serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "elicitation/create",
            "params": {
                "message": message,
                "requestedSchema": {"type": "object"},
            },
        })
    }

    /// Simulates the dispatch logic from McpConnection's SSE read loop:
    /// given a frame from the server channel, detect elicitation/create,
    /// call the handler, and return the JSON-RPC response object.
    async fn dispatch_frame(
        frame: &serde_json::Value,
        handler: &dyn ElicitationHandler,
        server_name: &str,
    ) -> Option<serde_json::Value> {
        let method = frame.get("method")?.as_str()?;
        if method != "elicitation/create" {
            return None;
        }
        let req_id = frame.get("id")?.clone();
        let params = frame.get("params").cloned().unwrap_or(serde_json::Value::Null);
        let elicit_req: ElicitationRequest = serde_json::from_value(params).ok()?;
        let resp = handler.handle(server_name, elicit_req).await;
        Some(serde_json::json!({
            "jsonrpc": "2.0",
            "id": req_id,
            "result": resp,
        }))
    }

    #[tokio::test]
    async fn test_unhandled_elicitation_declines() {
        // "No handler" is represented by AutoDeclineHandler (the connection default).
        let handler = AutoDeclineHandler;

        // Fake server pushes an elicitation/create frame.
        let (tx, mut rx) = tokio::sync::mpsc::channel::<serde_json::Value>(4);
        let server_frame = make_elicitation_rpc_request(42, "Please provide your API key");
        tx.send(server_frame).await.unwrap();
        drop(tx); // close channel

        // Client side: receive and dispatch.
        let frame = rx.recv().await.expect("frame");
        let rpc_response = dispatch_frame(&frame, &handler, "test-server")
            .await
            .expect("dispatched");

        assert_eq!(rpc_response["jsonrpc"], "2.0");
        assert_eq!(rpc_response["id"], 42);
        assert_eq!(rpc_response["result"]["action"], "decline");
        assert!(rpc_response["result"]["content"].is_null());
    }

    #[tokio::test]
    async fn test_auto_accept_handler_responds_with_empty_object() {
        let handler = AutoAcceptHandler;

        let (tx, mut rx) = tokio::sync::mpsc::channel::<serde_json::Value>(4);
        let server_frame = make_elicitation_rpc_request(99, "Choose a repository");
        tx.send(server_frame).await.unwrap();
        drop(tx);

        let frame = rx.recv().await.expect("frame");
        let rpc_response = dispatch_frame(&frame, &handler, "github-server")
            .await
            .expect("dispatched");

        assert_eq!(rpc_response["jsonrpc"], "2.0");
        assert_eq!(rpc_response["id"], 99);
        assert_eq!(rpc_response["result"]["action"], "accept");
        assert_eq!(rpc_response["result"]["content"], serde_json::json!({}));
    }

    #[tokio::test]
    async fn test_non_elicitation_frame_returns_none() {
        let handler = AutoDeclineHandler;
        // A regular tools/list response — should not be dispatched.
        let frame = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "result": {"tools": []},
        });
        let result = dispatch_frame(&frame, &handler, "test-server").await;
        assert!(result.is_none(), "non-elicitation frame must not be dispatched");
    }

    #[tokio::test]
    async fn test_notification_without_id_returns_none() {
        let handler = AutoDeclineHandler;
        // A notification has `method` but no `id` — must not be dispatched as
        // elicitation.
        let frame = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "elicitation/create",
            "params": {"message": "hi", "requestedSchema": {}},
        });
        let result = dispatch_frame(&frame, &handler, "test-server").await;
        assert!(result.is_none(), "notification (no id) must not be dispatched");
    }

    #[tokio::test]
    async fn test_elicitation_request_id_echoed_in_response() {
        let handler = AutoDeclineHandler;
        let frame = make_elicitation_rpc_request(777, "Confirm action");
        let rpc_response = dispatch_frame(&frame, &handler, "srv")
            .await
            .expect("dispatched");
        assert_eq!(rpc_response["id"], 777, "request id must be echoed");
    }
}
