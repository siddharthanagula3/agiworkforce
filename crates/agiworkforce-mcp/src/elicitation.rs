
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use serde::{Deserialize, Serialize};

/// UI mode for an MCP elicitation request.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum ElicitationMode {
    /// Render `requestedSchema` as a local form.
    #[default]
    Form,
    /// Ask the user to complete the request at an external URL.
    Url,
}

/// Server → client `elicitation/create` request payload.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ElicitationRequest {
    /// Human-readable message shown to the user.
    pub message: String,
    /// JSON Schema describing the structured input the server expects.
    #[serde(rename = "requestedSchema")]
    pub requested_schema: serde_json::Value,
    /// How the user should complete the request.
    #[serde(default)]
    pub mode: ElicitationMode,
    /// URL for URL-mode elicitations.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// Server-supplied correlation identifier.
    #[serde(
        default,
        rename = "elicitationId",
        skip_serializing_if = "Option::is_none"
    )]
    pub elicitation_id: Option<String>,
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
    pub fn accept_without_content() -> Self {
        Self {
            action: ElicitationAction::Accept,
            content: None,
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

/// Pluggable handler for elicitation requests. Implementations decide whether
/// to surface the request to the user, auto-decline, or auto-accept.
///
/// Uses a `BoxFuture` return type instead of `async_trait` to stay
/// dyn-compatible without adding the `async-trait` crate.
pub trait ElicitationHandler: Send + Sync {
    fn handle<'a>(
        &'a self,
        server_name: &'a str,
        request: ElicitationRequest,
    ) -> Pin<Box<dyn Future<Output = ElicitationResponse> + Send + 'a>>;
}

/// Safe, UI-agnostic default. Declines every request without surfacing it.
/// Recommended for headless / CI runs and used by the crate's sim harness.
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

/// Shared handle so a transport can share one handler across connections.
pub type SharedElicitationHandler = Arc<dyn ElicitationHandler>;

#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_request() -> ElicitationRequest {
        ElicitationRequest {
            message: "Please confirm".into(),
            requested_schema: serde_json::json!({"type": "object"}),
            mode: ElicitationMode::Form,
            url: None,
            elicitation_id: None,
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
    fn request_defaults_to_form_mode_when_omitted() {
        let req: ElicitationRequest = serde_json::from_value(serde_json::json!({
            "message": "Please confirm",
            "requestedSchema": {"type": "object"}
        }))
        .expect("deserialize");

        assert_eq!(req.mode, ElicitationMode::Form);
        assert!(req.url.is_none());
        assert!(req.elicitation_id.is_none());
    }

    #[test]
    fn url_mode_and_elicitation_id_round_trip() {
        let req = ElicitationRequest {
            message: "Open browser".into(),
            requested_schema: serde_json::json!({"type": "object"}),
            mode: ElicitationMode::Url,
            url: Some("https://example.com/oauth".into()),
            elicitation_id: Some("req-123".into()),
        };
        let json = serde_json::to_value(&req).expect("serialize");

        assert_eq!(json["mode"], "url");
        assert_eq!(json["url"], "https://example.com/oauth");
        assert_eq!(json["elicitationId"], "req-123");
        let back: ElicitationRequest = serde_json::from_value(json).expect("deserialize");
        assert_eq!(back, req);
    }

    #[test]
    fn response_serializes_action_as_lowercase() {
        let accept =
            serde_json::to_string(&ElicitationResponse::accept(serde_json::json!({"x": 1})))
                .unwrap();
        assert!(accept.contains("\"action\":\"accept\""));
        assert!(accept.contains("\"content\":{\"x\":1}"));

        let decline = serde_json::to_string(&ElicitationResponse::decline()).unwrap();
        assert!(decline.contains("\"action\":\"decline\""));
        assert!(!decline.contains("\"content\""));

        let cancel = serde_json::to_string(&ElicitationResponse::cancel()).unwrap();
        assert!(cancel.contains("\"action\":\"cancel\""));
        assert!(!cancel.contains("\"content\""));

        let empty_accept = serde_json::to_string(&ElicitationResponse::accept_without_content())
            .expect("serialize");
        assert!(empty_accept.contains("\"action\":\"accept\""));
        assert!(!empty_accept.contains("\"content\""));
    }

    #[tokio::test]
    async fn auto_decline_handler_always_declines() {
        let h = AutoDeclineHandler;
        let resp = h.handle("test", dummy_request()).await;
        assert_eq!(resp.action, ElicitationAction::Decline);
        assert!(resp.content.is_none());
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
}
