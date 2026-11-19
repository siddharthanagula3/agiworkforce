use agiworkforce_protocol::developer_session::{
    ApprovalRequestedNotification, PendingApprovalSnapshot, TurnOutputDeltaNotification,
    TurnStartedNotification,
};
use serde_json::json;

#[test]
fn approval_notifications_keep_the_existing_flat_wire_shape_and_structured_questions() {
    for question in [
        None,
        Some(json!({"prompt":"Choose a target","choices":["preview","local"]})),
    ] {
        let wire = json!({
            "threadId":"thread", "turnId":"turn", "requestId":"approval",
            "kind":"command", "summary":"Run the workspace command", "detail":"Command details",
            "riskLevel":null, "reversible":null, "proposedContent":null,
            "proposedExecpolicyAmendment":null,
            "alwaysAllowSaved":false, "editable":false, "question":question,
        });
        let decoded: ApprovalRequestedNotification = serde_json::from_value(wire.clone()).unwrap();
        assert_eq!(decoded.request_id, "approval");
        assert_eq!(serde_json::to_value(decoded).unwrap(), wire);
        let request: PendingApprovalSnapshot = serde_json::from_value(wire.clone()).unwrap();
        let emitted = ApprovalRequestedNotification::new(
            "thread".to_owned(),
            "turn".to_owned(),
            request,
            question,
        );
        assert_eq!(serde_json::to_value(emitted).unwrap(), wire);
    }
}

#[test]
fn output_notifications_keep_unicode_and_the_reconnect_cursor() {
    let wire = json!({"threadId":"thread","turnId":"turn","delta":"Hello 🌍","index":7});
    let decoded: TurnOutputDeltaNotification = serde_json::from_value(wire.clone()).unwrap();
    assert_eq!(decoded.index, 7);
    assert_eq!(serde_json::to_value(decoded).unwrap(), wire);
}

#[test]
fn started_notifications_identify_both_the_session_and_turn() {
    let wire = json!({"threadId":"thread","turnId":"turn"});
    let decoded: TurnStartedNotification = serde_json::from_value(wire.clone()).unwrap();
    assert_eq!(serde_json::to_value(decoded).unwrap(), wire);
}
