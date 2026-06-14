use crate::network_policy::NetworkDecisionSource;
use crate::network_policy::NetworkPolicyDecision;
use crate::network_policy::NetworkProtocol;
use crate::reasons::REASON_DENIED;
use crate::reasons::REASON_METHOD_NOT_ALLOWED;
use crate::reasons::REASON_MITM_REQUIRED;
use crate::reasons::REASON_NOT_ALLOWED;
use crate::reasons::REASON_NOT_ALLOWED_LOCAL;
use rama_http::Body;
use rama_http::Response;
use rama_http::StatusCode;
use serde::Serialize;
use tracing::error;

pub struct PolicyDecisionDetails<'a> {
    pub decision: NetworkPolicyDecision,
    pub reason: &'a str,
    pub source: NetworkDecisionSource,
    pub protocol: NetworkProtocol,
    pub host: &'a str,
    pub port: u16,
}

pub fn text_response(status: StatusCode, body: &str) -> Response {
    Response::builder()
        .status(status)
        .header("content-type", "text/plain")
        .body(Body::from(body.to_string()))
        .unwrap_or_else(|_| Response::new(Body::from(body.to_string())))
}

pub fn json_response<T: Serialize>(value: &T) -> Response {
    let body = match serde_json::to_string(value) {
        Ok(body) => body,
        Err(err) => {
            error!("failed to serialize JSON response: {err}");
            "{}".to_string()
        }
    };
    Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "application/json")
        .body(Body::from(body))
        .unwrap_or_else(|err| {
            error!("failed to build JSON response: {err}");
            Response::new(Body::from("{}"))
        })
}

pub fn blocked_header_value(reason: &str) -> &'static str {
    match reason {
        REASON_NOT_ALLOWED | REASON_NOT_ALLOWED_LOCAL => "blocked-by-allowlist",
        REASON_DENIED => "blocked-by-denylist",
        REASON_METHOD_NOT_ALLOWED => "blocked-by-method-policy",
        REASON_MITM_REQUIRED => "blocked-by-mitm-required",
        _ => "blocked-by-policy",
    }
}

pub fn blocked_message(reason: &str) -> &'static str {
    match reason {
        REASON_NOT_ALLOWED => {
            "Codex blocked this request: domain not in allowlist (this is not a denylist block)."
        }
        REASON_NOT_ALLOWED_LOCAL => {
            "Codex blocked this request: local/private addresses not allowed."
        }
        REASON_DENIED => "Codex blocked this request: domain denied by policy.",
        REASON_METHOD_NOT_ALLOWED => {
            "Codex blocked this request: method not allowed in limited mode."
        }
        REASON_MITM_REQUIRED => "Codex blocked this request: MITM required for limited HTTPS.",
        _ => "Codex blocked this request by network policy.",
    }
}

pub fn blocked_text_response(reason: &str) -> Response {
    Response::builder()
        .status(StatusCode::FORBIDDEN)
        .header("content-type", "text/plain")
        .header("x-proxy-error", blocked_header_value(reason))
        .body(Body::from(blocked_message(reason)))
        .unwrap_or_else(|_| Response::new(Body::from("blocked")))
}
/// Build a human-readable block message that folds the policy decision context
/// (target host:port, protocol, decision, and source) into the generic
/// per-reason text, so callers passing rich [`PolicyDecisionDetails`] get a
/// message that actually reflects them rather than the bare reason string.
pub fn blocked_message_with_policy(reason: &str, details: &PolicyDecisionDetails<'_>) -> String {
    // Callers populate `details.reason` with the same reason string passed here;
    // assert that invariant so the field stays a read (and a future divergence
    // surfaces in tests) rather than silently dead.
    debug_assert_eq!(
        reason, details.reason,
        "reason arg and details.reason must agree"
    );
    format!(
        "{} [host={}:{} protocol={} decision={} source={}]",
        blocked_message(reason),
        details.host,
        details.port,
        details.protocol.as_policy_protocol(),
        details.decision.as_str(),
        details.source.as_str(),
    )
}

pub fn blocked_text_response_with_policy(
    reason: &str,
    details: &PolicyDecisionDetails<'_>,
) -> Response {
    Response::builder()
        .status(StatusCode::FORBIDDEN)
        .header("content-type", "text/plain")
        .header("x-proxy-error", blocked_header_value(reason))
        .body(Body::from(blocked_message_with_policy(reason, details)))
        .unwrap_or_else(|_| Response::new(Body::from("blocked")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::reasons::REASON_NOT_ALLOWED;
    use pretty_assertions::assert_eq;

    #[test]
    fn blocked_message_with_policy_folds_policy_details() {
        let details = PolicyDecisionDetails {
            decision: NetworkPolicyDecision::Ask,
            reason: REASON_NOT_ALLOWED,
            source: NetworkDecisionSource::Decider,
            protocol: NetworkProtocol::HttpsConnect,
            host: "api.example.com",
            port: 443,
        };

        let message = blocked_message_with_policy(REASON_NOT_ALLOWED, &details);
        // Still carries the generic per-reason text...
        assert!(
            message.starts_with(blocked_message(REASON_NOT_ALLOWED)),
            "message should start with the generic reason text: {message}"
        );
        // ...and now reflects the policy decision context instead of discarding it.
        assert_eq!(
            message,
            "Codex blocked this request: domain not in allowlist (this is not a denylist block). \
             [host=api.example.com:443 protocol=https_connect decision=ask source=decider]"
        );
    }
}
