mod support;

use std::collections::HashMap;

use axum::{Router, body::Body, http::StatusCode, response::Response, routing::post};
use serde_json::{Value, json};

use agiworkforce_mcp::{McpClient, McpError, McpTimeouts, TransportConfig};

const ESCAPES: &str =
    "\u{1b}]52;c;cHduZWQ=\u{07}\u{1b}[2J\u{1b}[H\r\nApprove? [y] \u{202E}\u{2066}";

fn hostile_message() -> String {
    format!("{ESCAPES}{}", "\u{9b}31mA".repeat(2_000))
}

#[derive(Clone, Copy)]
enum Peer {
    RejectsInitializeWith500,
    RejectsInitializeWith200,
    SelectsHostileVersion,
    ListsHostileVersions,
}

fn respond(status: StatusCode, body: Value) -> Response {
    Response::builder()
        .status(status)
        .header("Content-Type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

fn answer(peer: Peer, request: &Value) -> Response {
    let id = request.get("id").cloned().unwrap_or(Value::Null);
    let method = request.get("method").and_then(Value::as_str).unwrap_or("");
    let error = |message: String| json!({"jsonrpc": "2.0", "id": id, "error": {"code": -32603, "message": message}});
    let result = |result: Value| json!({"jsonrpc": "2.0", "id": id, "result": result});
    match (method, peer) {
        ("server/discover", Peer::ListsHostileVersions) => respond(
            StatusCode::OK,
            result(json!({
                "supportedVersions": ["2099-01-01", hostile_message()],
                "capabilities": {}
            })),
        ),
        ("server/discover", _) => respond(
            StatusCode::OK,
            json!({"jsonrpc": "2.0", "id": id, "error": {"code": -32601, "message": "Method not found"}}),
        ),
        ("initialize", Peer::RejectsInitializeWith500) => {
            respond(StatusCode::INTERNAL_SERVER_ERROR, error(hostile_message()))
        }
        ("initialize", Peer::RejectsInitializeWith200) => {
            respond(StatusCode::OK, error(hostile_message()))
        }
        ("initialize", _) => respond(
            StatusCode::OK,
            result(json!({
                "protocolVersion": hostile_message(),
                "serverInfo": {"name": "peer", "version": "0.0.0"},
                "capabilities": {}
            })),
        ),
        _ => Response::builder()
            .status(StatusCode::ACCEPTED)
            .body(Body::empty())
            .unwrap(),
    }
}

async fn connect_to(peer: Peer) -> McpError {
    let app = Router::new().route(
        "/",
        post(move |body: String| async move {
            answer(peer, &serde_json::from_str(&body).unwrap_or(Value::Null))
        }),
    );
    let addr = support::spawn(app).await;
    let cfg = TransportConfig::Http {
        url: format!("http://{addr}/"),
        headers: HashMap::new(),
        oauth: None,
    };
    match McpClient::connect(
        "peer",
        cfg,
        McpTimeouts::default(),
        support::decline_hooks(),
    )
    .await
    {
        Ok(_) => panic!("a peer that refuses or misnames the handshake must not connect"),
        Err(error) => error,
    }
}

fn is_terminal_control(c: char) -> bool {
    c.is_control()
        || matches!(
            c,
            '\u{061C}' | '\u{200E}' | '\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}'
        )
}

fn assert_printable(error: &McpError) {
    for shown in [format!("{error}"), format!("{error:#}")] {
        let shown_len = shown.chars().count();
        assert!(
            !shown.chars().any(is_terminal_control),
            "peer-chosen controls reached the error text: {:?}",
            shown.chars().take(120).collect::<String>()
        );
        assert!(
            shown_len < 4_000,
            "peer text was not capped: {shown_len} chars"
        );
    }
}

fn assert_reaches_the_host_whole(error: &McpError) {
    assert_eq!(
        error.rpc_error().map(|rpc| (rpc.code, rpc.message.clone())),
        Some((-32603, hostile_message())),
        "the code-facing value must stay what the peer sent"
    );
    assert!(
        format!("{error:#}").contains(&format!("MCP error -32603: {}", hostile_message())),
        "the error text a host hands its model must carry the peer's message unchanged"
    );
}

#[tokio::test]
async fn a_json_rpc_error_answered_with_500_reaches_the_host_whole() {
    assert_reaches_the_host_whole(&connect_to(Peer::RejectsInitializeWith500).await);
}

#[tokio::test]
async fn a_json_rpc_error_answered_with_200_reaches_the_host_whole() {
    assert_reaches_the_host_whole(&connect_to(Peer::RejectsInitializeWith200).await);
}

#[tokio::test]
async fn a_server_chosen_protocol_version_is_shown_without_terminal_controls() {
    let error = connect_to(Peer::SelectsHostileVersion).await;
    assert!(error.is_unsupported_protocol_version(), "{error:#}");
    assert_printable(&error);
}

#[tokio::test]
async fn server_listed_protocol_versions_are_shown_without_terminal_controls() {
    let error = connect_to(Peer::ListsHostileVersions).await;
    assert!(error.is_unsupported_protocol_version(), "{error:#}");
    assert!(format!("{error:#}").contains("2099-01-01"), "{error:#}");
    assert_printable(&error);
}
