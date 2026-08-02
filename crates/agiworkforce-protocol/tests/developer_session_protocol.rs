use agiworkforce_protocol::developer_session::{
    AppServerClientInfo, AppServerRequest, AppServerResponse, DeveloperMessage,
    DeveloperSessionSource, DeveloperSessionTrustMode, InitializeParams, ThreadReadResponse,
    ThreadStartParams, ThreadStartResponse, ThreadStatus, ThreadSummary,
};

#[test]
fn turn_start_preserves_agent_controls_and_workspace_context() {
    let params: agiworkforce_protocol::developer_session::TurnStartParams =
        serde_json::from_value(serde_json::json!({
            "threadId": "thread-1",
            "input": [{"type": "text", "text": "fix it"}],
            "routingTaskType": "coding",
            "agentMode": "plan",
            "reasoningEffort": "high",
            "contextFiles": ["/workspace/src/lib.rs"]
        }))
        .expect("deserialize turn controls");

    let encoded = serde_json::to_value(params).expect("serialize turn controls");
    assert_eq!(encoded["routingTaskType"], "coding");
    assert_eq!(encoded["agentMode"], "plan");
    assert_eq!(encoded["reasoningEffort"], "high");
    assert_eq!(
        encoded["contextFiles"],
        serde_json::json!(["/workspace/src/lib.rs"])
    );
}

#[test]
fn legacy_turn_start_remains_valid_without_optional_controls() {
    let params: agiworkforce_protocol::developer_session::TurnStartParams =
        serde_json::from_value(serde_json::json!({
            "threadId": "thread-1",
            "input": [{"type": "text", "text": "fix it"}]
        }))
        .expect("deserialize legacy turn");

    let encoded = serde_json::to_value(params).expect("serialize legacy turn");
    assert!(encoded.get("agentMode").is_none());
    assert!(encoded.get("routingTaskType").is_none());
    assert!(encoded.get("reasoningEffort").is_none());
    assert!(encoded.get("contextFiles").is_none());
}

#[test]
fn turn_start_accepts_the_canonical_computer_use_task_spelling() {
    let params: agiworkforce_protocol::developer_session::TurnStartParams =
        serde_json::from_value(serde_json::json!({
            "threadId": "thread-1",
            "input": [{"type": "text", "text": "click the failing control"}],
            "routingTaskType": "computer-use"
        }))
        .expect("deserialize canonical computer-use task");

    let encoded = serde_json::to_value(params).expect("serialize routing task");
    assert_eq!(encoded["routingTaskType"], "computer-use");
}

#[test]
fn thread_start_request_matches_the_stable_jsonl_shape() {
    let request = AppServerRequest::new(
        10,
        "thread/start",
        ThreadStartParams {
            model: Some("registry/model-key".to_string()),
            provider: None,
            cwd: Some("/workspace/project".to_string()),
            title: None,
        },
    )
    .expect("serialize params");

    assert_eq!(
        serde_json::to_value(request).expect("serialize request"),
        serde_json::json!({
            "id": 10,
            "method": "thread/start",
            "params": {
                "model": "registry/model-key",
                "cwd": "/workspace/project"
            }
        })
    );
}

#[test]
fn initialize_is_typed_and_does_not_claim_experimental_capabilities() {
    let request = AppServerRequest::new(
        1,
        "initialize",
        InitializeParams {
            client_info: AppServerClientInfo {
                name: "agi_vscode".to_string(),
                title: "AGI for VS Code".to_string(),
                version: "0.3.0".to_string(),
            },
            experimental_api: false,
        },
    )
    .expect("serialize initialize");

    let value = serde_json::to_value(request).expect("serialize request");
    assert_eq!(value["params"]["clientInfo"]["name"], "agi_vscode");
    assert!(value["params"].get("experimentalApi").is_none());
}

#[test]
fn thread_response_keeps_cli_and_vscode_on_one_session_identity() {
    let thread = ThreadSummary {
        id: "session-123".to_string(),
        title: "Fix the parser".to_string(),
        model: Some("registry/model-key".to_string()),
        cwd: Some("/workspace/project".to_string()),
        provider: Some("anthropic".to_string()),
        trust_mode: DeveloperSessionTrustMode::Byok,
        created_at: "2026-07-14T12:00:00Z".to_string(),
        updated_at: "2026-07-14T12:01:00Z".to_string(),
        created_by: DeveloperSessionSource::Vscode,
        status: ThreadStatus::Idle,
    };
    let response = AppServerResponse::success(
        10,
        ThreadStartResponse {
            thread: thread.clone(),
        },
    )
    .expect("serialize result");

    let value = serde_json::to_value(response).expect("serialize response");
    assert_eq!(value["id"], 10);
    assert_eq!(value["result"]["thread"]["id"], thread.id);
    assert_eq!(value["result"]["thread"]["provider"], "anthropic");
    assert_eq!(value["result"]["thread"]["trustMode"], "byok");
    assert!(value.get("error").is_none());
}

#[test]
fn thread_read_reports_when_only_a_bounded_transcript_window_is_returned() {
    let response = ThreadReadResponse {
        thread: ThreadSummary {
            id: "session-large".to_string(),
            title: "Large session".to_string(),
            model: None,
            provider: Some("ollama".to_string()),
            cwd: Some("/workspace/project".to_string()),
            trust_mode: DeveloperSessionTrustMode::Local,
            created_at: "2026-07-14T12:00:00Z".to_string(),
            updated_at: "2026-07-14T12:01:00Z".to_string(),
            created_by: DeveloperSessionSource::Cli,
            status: ThreadStatus::Idle,
        },
        messages: vec![DeveloperMessage {
            role: "assistant".to_string(),
            text: "newest message".to_string(),
        }],
        transcript_truncated: true,
    };

    let value = serde_json::to_value(response).expect("serialize thread read response");
    assert_eq!(value["transcriptTruncated"], true);

    let mut missing_flag = value;
    missing_flag
        .as_object_mut()
        .expect("thread read response object")
        .remove("transcriptTruncated");
    assert!(serde_json::from_value::<ThreadReadResponse>(missing_flag).is_err());
}
