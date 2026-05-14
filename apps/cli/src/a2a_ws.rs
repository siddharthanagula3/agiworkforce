//! a2a WebSocket transport. v1.4.0 of the a2a protocol — adds persistent
//! streaming JSON-RPC over WebSocket, on top of the v1.3.0 HTTP transport.
//!
//! Architecture:
//! - `WsServer::serve(addr)` binds a TcpListener and upgrades each connection
//!   to WS using `tokio-tungstenite`.
//! - Each text-frame message is parsed as `A2aRequest` (JSON-RPC 2.0),
//!   dispatched through `crate::a2a::jsonrpc::handle_request`, and the
//!   `A2aResponse` is sent back as a text frame.
//! - Binary frames are rejected with a JSON-RPC error.
//! - Connection-level state: each WS connection owns a clone of the
//!   `PeerRegistry` (read-only via Arc) and an immutable `self_card`.
//! - v1.5.0: `WsServer::new` accepts an optional `auth_token`. When set, the
//!   WS handshake callback rejects connections without a matching
//!   `Authorization: Bearer <token>` header with HTTP 401.

#![allow(dead_code)]

use anyhow::{Context, Result};
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio_tungstenite::{
    accept_hdr_async,
    tungstenite::{
        handshake::server::{ErrorResponse, Request, Response},
        http::StatusCode,
        Message,
    },
};

use crate::a2a::jsonrpc::{handle_request, A2aRequest, AgentCard, PeerRegistry};

pub struct WsServer {
    self_card: AgentCard,
    registry: Arc<PeerRegistry>,
    auth_token: Option<String>,
}

impl WsServer {
    pub fn new(self_card: AgentCard, registry: Arc<PeerRegistry>, auth_token: Option<String>) -> Self {
        Self { self_card, registry, auth_token }
    }

    /// Bind to `addr` and accept WS connections until cancelled.
    pub async fn serve(self, addr: &str) -> Result<()> {
        let listener = TcpListener::bind(addr).await
            .with_context(|| format!("bind a2a WebSocket to {addr}"))?;
        loop {
            let (stream, peer) = listener.accept().await?;
            tracing::debug!(target: "a2a::ws", "accepted connection from {peer}");
            let card = self.self_card.clone();
            let registry = self.registry.clone();
            let auth_token = self.auth_token.clone();
            tokio::spawn(async move {
                if let Err(e) = handle_ws_connection(stream, card, registry, auth_token).await {
                    tracing::warn!(target: "a2a::ws", "connection error: {e}");
                }
            });
        }
    }
}

async fn handle_ws_connection(
    stream: tokio::net::TcpStream,
    self_card: AgentCard,
    registry: Arc<PeerRegistry>,
    auth_token: Option<String>,
) -> Result<()> {
    let callback = move |req: &Request, response: Response| -> Result<Response, ErrorResponse> {
        if let Some(expected) = auth_token.as_deref() {
            let provided = req.headers().get("Authorization")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.strip_prefix("Bearer "));
            if provided != Some(expected) {
                let mut err = ErrorResponse::new(Some("invalid bearer token".into()));
                *err.status_mut() = StatusCode::UNAUTHORIZED;
                return Err(err);
            }
        }
        Ok(response)
    };

    let mut ws = accept_hdr_async(stream, callback).await.context("WS handshake")?;
    while let Some(frame) = ws.next().await {
        let frame = frame.context("read frame")?;
        match frame {
            Message::Text(text) => {
                let request_json = text.to_string();
                let response = process_text_frame(&request_json, &registry, &self_card);
                ws.send(Message::Text(response.into())).await?;
            }
            Message::Binary(_) => {
                let err = serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": null,
                    "error": { "code": -32700, "message": "binary frames not supported" }
                });
                ws.send(Message::Text(err.to_string().into())).await?;
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
    Ok(())
}

/// Pure function: parse one JSON text frame, dispatch, return serialized
/// response. Extracted so tests can call it without a live TCP listener.
pub fn process_text_frame(
    request_json: &str,
    registry: &PeerRegistry,
    self_card: &AgentCard,
) -> String {
    match serde_json::from_str::<A2aRequest>(request_json) {
        Ok(req) => {
            let resp = handle_request(req, registry, self_card);
            serde_json::to_string(&resp).unwrap_or_else(|_| {
                r#"{"jsonrpc":"2.0","id":null,"error":{"code":-32603,"message":"serialization"}}"#.to_string()
            })
        }
        Err(e) => serde_json::json!({
            "jsonrpc": "2.0",
            "id": null,
            "error": { "code": -32700, "message": format!("parse error: {e}") }
        }).to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn card() -> AgentCard {
        AgentCard {
            id: "agi-test".into(),
            name: "AGI WS Test".into(),
            model: "claude-opus-4-7".into(),
            capabilities: vec!["code".into()],
            tools: vec!["read_file".into()],
            version: "1.4.0".into(),
        }
    }

    fn registry() -> PeerRegistry {
        let mut r = PeerRegistry::new();
        r.register(AgentCard { id: "peer-1".into(), ..card() });
        r
    }

    #[test]
    fn process_text_frame_discover_returns_self_card() {
        let req = r#"{"jsonrpc":"2.0","id":1,"method":"discover","params":{}}"#;
        let resp = process_text_frame(req, &registry(), &card());
        assert!(resp.contains("\"id\":1"));
        assert!(resp.contains("agi-test"));
    }

    #[test]
    fn process_text_frame_list_peers_returns_registry() {
        let req = r#"{"jsonrpc":"2.0","id":2,"method":"list_peers","params":{}}"#;
        let resp = process_text_frame(req, &registry(), &card());
        assert!(resp.contains("peer-1"));
    }

    #[test]
    fn process_text_frame_unknown_method_returns_error() {
        let req = r#"{"jsonrpc":"2.0","id":3,"method":"bogus","params":{}}"#;
        let resp = process_text_frame(req, &registry(), &card());
        assert!(resp.contains("\"code\":-32601"));
    }

    #[test]
    fn process_text_frame_malformed_json_returns_parse_error() {
        let req = "not json at all";
        let resp = process_text_frame(req, &registry(), &card());
        assert!(resp.contains("\"code\":-32700"));
        assert!(resp.contains("parse error"));
    }

    #[test]
    fn ws_server_can_be_constructed() {
        let server = WsServer::new(card(), Arc::new(registry()), None);
        let _ = server;
    }

    #[test]
    fn ws_server_can_be_constructed_with_auth_token() {
        let server = WsServer::new(card(), Arc::new(registry()), Some("secret".into()));
        let _ = server;
    }

    // E2E tests: these bind real TCP sockets and test WS auth end-to-end.
    // The dropped-listener pattern has a tiny rebind race; if it proves flaky
    // in CI, switch serve() to accept a TcpListener directly via serve_on().

    #[tokio::test]
    async fn ws_server_e2e_discover_no_auth() {
        use futures_util::{SinkExt, StreamExt};
        use tokio_tungstenite::tungstenite::Message;

        let server = WsServer::new(card(), Arc::new(registry()), None);

        // Bind an ephemeral port to discover the OS-assigned address, then
        // drop the listener so serve() can rebind the same addr.
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        drop(listener);

        let handle = tokio::spawn(async move {
            let _ = server.serve(&addr.to_string()).await;
        });

        tokio::time::sleep(std::time::Duration::from_millis(100)).await;

        let url = format!("ws://{}", addr);
        let (mut ws, _) = tokio_tungstenite::connect_async(url).await.unwrap();

        let req = r#"{"jsonrpc":"2.0","id":1,"method":"discover","params":{}}"#;
        ws.send(Message::Text(req.to_string().into())).await.unwrap();

        let resp = ws.next().await.unwrap().unwrap();
        let body = resp.into_text().unwrap();
        assert!(body.contains("agi-test"));

        handle.abort();
    }

    #[tokio::test]
    async fn ws_server_e2e_auth_required_rejects_missing_token() {
        let server = WsServer::new(card(), Arc::new(registry()), Some("secret-token".into()));

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        drop(listener);

        let handle = tokio::spawn(async move {
            let _ = server.serve(&addr.to_string()).await;
        });
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;

        let url = format!("ws://{}", addr);
        let result = tokio_tungstenite::connect_async(url).await;
        assert!(result.is_err(), "connection should fail without bearer token");

        handle.abort();
    }

    #[tokio::test]
    async fn ws_server_e2e_auth_accepts_valid_token() {
        use futures_util::{SinkExt, StreamExt};
        use tokio_tungstenite::tungstenite::client::IntoClientRequest;
        use tokio_tungstenite::tungstenite::Message;

        let token = "secret-token";
        let server = WsServer::new(card(), Arc::new(registry()), Some(token.into()));

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        drop(listener);

        let handle = tokio::spawn(async move {
            let _ = server.serve(&addr.to_string()).await;
        });
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;

        let url = format!("ws://{}", addr);
        let mut req = url.into_client_request().unwrap();
        req.headers_mut().insert("Authorization", format!("Bearer {token}").parse().unwrap());

        let (mut ws, _) = tokio_tungstenite::connect_async(req).await.unwrap();
        ws.send(Message::Text(
            r#"{"jsonrpc":"2.0","id":1,"method":"discover","params":{}}"#.to_string().into(),
        ))
        .await
        .unwrap();
        let resp = ws.next().await.unwrap().unwrap();
        assert!(resp.into_text().unwrap().contains("agi-test"));

        handle.abort();
    }
}
