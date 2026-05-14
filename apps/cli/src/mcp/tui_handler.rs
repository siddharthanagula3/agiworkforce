//! `TuiElicitationHandler` — bridges incoming MCP `elicitation/create`
//! requests to a TUI overlay. Used by [`McpConnection::set_elicitation_handler`].
//!
//! Architecture: when an MCP server sends elicitation/create, the handler's
//! `handle()` method (running in the MCP read-loop's tokio task) pushes a
//! `PendingElicitation` onto a queue and awaits a `oneshot` response. The
//! TUI render loop polls the queue via `drain_pending()`, surfaces an
//! overlay to the user, and on user submit calls `complete(id, response)`
//! to wake the awaiting handler.
//!
//! M-FINAL-B of v1.2.

#![allow(dead_code)]

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use tokio::sync::{oneshot, Mutex};
use uuid::Uuid;

use super::elicitation::{
    ElicitationAction, ElicitationHandler, ElicitationRequest, ElicitationResponse,
};

/// One request in flight: the server's payload + the response channel back to
/// the waiting MCP read-loop.
pub struct PendingElicitation {
    pub id: Uuid,
    pub server_name: String,
    pub request: ElicitationRequest,
}

/// Shared state between the MCP read-loop (producer of requests, consumer of
/// responses) and the TUI render loop (consumer of requests, producer of
/// responses).
#[derive(Default)]
pub struct TuiElicitationInner {
    pending: Vec<PendingElicitation>,
    responders: HashMap<Uuid, oneshot::Sender<ElicitationResponse>>,
}

pub struct TuiElicitationHandler {
    state: Arc<Mutex<TuiElicitationInner>>,
}

impl TuiElicitationHandler {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(TuiElicitationInner::default())),
        }
    }

    /// Cheap clone — both halves share the inner state. Named `shared_state`
    /// (not `handle`) so it doesn't collide with the trait's `handle` method.
    pub fn shared_state(&self) -> Arc<Mutex<TuiElicitationInner>> {
        self.state.clone()
    }

    /// TUI-side: pop the next pending request (FIFO). Returns None if queue empty.
    pub async fn drain_pending(&self) -> Option<PendingElicitation> {
        let mut inner = self.state.lock().await;
        if inner.pending.is_empty() {
            None
        } else {
            Some(inner.pending.remove(0))
        }
    }

    /// TUI-side: deliver the user's response back to the awaiting MCP handler.
    pub async fn complete(&self, id: Uuid, response: ElicitationResponse) {
        let mut inner = self.state.lock().await;
        if let Some(tx) = inner.responders.remove(&id) {
            let _ = tx.send(response);
        }
    }

    /// TUI-side: how many requests are pending. Useful for status line.
    pub async fn pending_count(&self) -> usize {
        self.state.lock().await.pending.len()
    }
}

impl Default for TuiElicitationHandler {
    fn default() -> Self {
        Self::new()
    }
}

impl ElicitationHandler for TuiElicitationHandler {
    fn handle<'a>(
        &'a self,
        server_name: &'a str,
        request: ElicitationRequest,
    ) -> Pin<Box<dyn Future<Output = ElicitationResponse> + Send + 'a>> {
        Box::pin(async move {
            let id = Uuid::new_v4();
            let (tx, rx) = oneshot::channel();
            {
                let mut inner = self.state.lock().await;
                inner.pending.push(PendingElicitation {
                    id,
                    server_name: server_name.to_string(),
                    request,
                });
                inner.responders.insert(id, tx);
            }
            // Block this MCP-loop task until the TUI surfaces the request and
            // delivers a response via `complete()`. If the TUI tears down without
            // responding, fall back to decline.
            rx.await.unwrap_or_else(|_| ElicitationResponse {
                action: ElicitationAction::Decline,
                content: None,
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_request() -> ElicitationRequest {
        ElicitationRequest {
            message: "Please confirm".into(),
            requested_schema: serde_json::json!({"type": "object"}),
        }
    }

    #[tokio::test]
    async fn empty_queue_returns_none() {
        let h = TuiElicitationHandler::new();
        assert!(h.drain_pending().await.is_none());
    }

    #[tokio::test]
    async fn request_queues_and_completes_roundtrip() {
        let h = TuiElicitationHandler::new();
        let h2 = h.shared_state();
        let handle_task = tokio::spawn(async move {
            let handler = TuiElicitationHandler { state: h2 };
            handler.handle("server-a", dummy_request()).await
        });
        // Give the handle() future a moment to enqueue.
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        assert_eq!(h.pending_count().await, 1);
        let pending = h.drain_pending().await.expect("should have request");
        assert_eq!(pending.server_name, "server-a");
        h.complete(
            pending.id,
            ElicitationResponse {
                action: ElicitationAction::Accept,
                content: Some(serde_json::json!({"ok": true})),
            },
        )
        .await;
        let resp = handle_task.await.expect("join");
        assert_eq!(resp.action, ElicitationAction::Accept);
        assert_eq!(resp.content, Some(serde_json::json!({"ok": true})));
    }

    #[tokio::test]
    async fn dropping_responder_declines() {
        let h = TuiElicitationHandler::new();
        let h2 = h.shared_state();
        let handle_task = tokio::spawn(async move {
            let handler = TuiElicitationHandler { state: h2 };
            handler.handle("server-b", dummy_request()).await
        });
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        // Drain to remove the responder, but never call complete() — the
        // responder Sender drops, causing rx.await to fail → Decline.
        let _pending = h.drain_pending().await.expect("queue");
        // Force-drop responders.
        {
            let mut inner = h.state.lock().await;
            inner.responders.clear();
        }
        let resp = handle_task.await.expect("join");
        assert_eq!(resp.action, ElicitationAction::Decline);
        assert!(resp.content.is_none());
    }

    #[tokio::test]
    async fn fifo_order() {
        let h = TuiElicitationHandler::new();
        // Push 3 requests directly into the queue (bypassing handle() for simplicity).
        {
            let mut inner = h.state.lock().await;
            for name in ["a", "b", "c"] {
                inner.pending.push(PendingElicitation {
                    id: Uuid::new_v4(),
                    server_name: name.into(),
                    request: dummy_request(),
                });
            }
        }
        assert_eq!(h.drain_pending().await.unwrap().server_name, "a");
        assert_eq!(h.drain_pending().await.unwrap().server_name, "b");
        assert_eq!(h.drain_pending().await.unwrap().server_name, "c");
        assert!(h.drain_pending().await.is_none());
    }
}
