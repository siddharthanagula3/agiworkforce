use agiworkforce_protocol::developer_session::{
    AppServerClientInfo, AppServerRequest, AppServerResponse, DeveloperMessage,
    DeveloperSessionSource, DeveloperSessionTrustMode, InitializeParams, ThreadReadResponse,
    ThreadStartParams, ThreadStartResponse, ThreadStatus, ThreadSummary, TurnEndedNotification,
    TurnFailure, TurnFailureAction, TurnFailureCode, TurnStatus,
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
            protocol_version: None,
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
        git_branch: None,
        worktree_root: None,
        client: None,
        repository: None,
        writer: None,
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
            git_branch: None,
            worktree_root: None,
            client: None,
            repository: None,
            writer: None,
        },
        messages: vec![DeveloperMessage {
            role: "assistant".to_string(),
            text: "newest message".to_string(),
        }],
        transcript_truncated: true,
        approvals: Vec::new(),
        file_changes: Vec::new(),
    };

    let value = serde_json::to_value(response).expect("serialize thread read response");
    assert_eq!(value["transcriptTruncated"], true);
    assert!(value.get("approvals").is_none());
    assert!(value.get("fileChanges").is_none());

    let mut missing_flag = value;
    missing_flag
        .as_object_mut()
        .expect("thread read response object")
        .remove("transcriptTruncated");
    assert!(serde_json::from_value::<ThreadReadResponse>(missing_flag).is_err());
}

/// The widened summary is additive: a client that predates these fields sees a
/// byte-identical object, and one that postdates them can round-trip a
/// populated one.
#[test]
fn the_wider_thread_summary_stays_additive() {
    let bare = ThreadSummary {
        id: "session-1".to_string(),
        title: "Untitled".to_string(),
        model: None,
        cwd: None,
        provider: None,
        trust_mode: DeveloperSessionTrustMode::Local,
        created_at: "2026-09-14T12:00:00Z".to_string(),
        updated_at: "2026-09-14T12:00:00Z".to_string(),
        created_by: DeveloperSessionSource::Cli,
        status: ThreadStatus::Idle,
        git_branch: None,
        worktree_root: None,
        client: None,
        repository: None,
        writer: None,
    };
    let value = serde_json::to_value(&bare).expect("serialize bare summary");
    for absent in [
        "gitBranch",
        "worktreeRoot",
        "client",
        "repository",
        "writer",
    ] {
        assert!(
            value.get(absent).is_none(),
            "an unpopulated {absent} must not appear on the wire"
        );
    }
    assert_eq!(value["createdBy"], "cli");

    let widened = ThreadSummary {
        git_branch: Some("main".to_string()),
        worktree_root: Some("/workspace/project".to_string()),
        client: Some("agi-desktop".to_string()),
        created_by: DeveloperSessionSource::Desktop,
        ..bare.clone()
    };
    let value = serde_json::to_value(&widened).expect("serialize widened summary");
    assert_eq!(value["gitBranch"], "main");
    assert_eq!(value["worktreeRoot"], "/workspace/project");
    assert_eq!(value["client"], "agi-desktop");
    assert_eq!(value["createdBy"], "desktop");
    assert_eq!(
        serde_json::from_value::<ThreadSummary>(value).expect("round trip"),
        widened
    );

    // A summary persisted before these fields existed still deserializes.
    let legacy = serde_json::json!({
        "id": "session-1",
        "title": "Untitled",
        "trustMode": "local",
        "createdAt": "2026-09-14T12:00:00Z",
        "updatedAt": "2026-09-14T12:00:00Z",
        "createdBy": "cli",
        "status": "idle",
    });
    assert_eq!(
        serde_json::from_value::<ThreadSummary>(legacy).expect("legacy summary"),
        bare
    );
}

/// A completed turn carries `failure: null`; a failed one carries the typed
/// object alongside the unchanged `error` string.
#[test]
fn a_turn_ends_with_a_typed_failure_or_an_explicit_null() {
    let completed = TurnEndedNotification {
        thread_id: "thread-1".to_string(),
        turn_id: "turn-1".to_string(),
        status: TurnStatus::Completed,
        response: "done".to_string(),
        input_tokens: 10,
        output_tokens: 3,
        error: None,
        failure: None,
    };
    let value = serde_json::to_value(&completed).expect("serialize completed");
    assert_eq!(value["status"], "completed");
    assert!(
        value["failure"].is_null() && value["error"].is_null(),
        "both fields must be present and null, never absent: {value}"
    );

    let failed = TurnEndedNotification {
        status: TurnStatus::Failed,
        response: String::new(),
        error: Some("[deepseek] Authentication failed: No API key found.".to_string()),
        failure: Some(
            TurnFailure::new(
                TurnFailureCode::ProviderAuthMissing,
                "[deepseek] Authentication failed: No API key found.",
            )
            .with_provider("deepseek"),
        ),
        ..completed
    };
    let value = serde_json::to_value(&failed).expect("serialize failed");
    assert_eq!(value["failure"]["code"], "provider_auth_missing");
    assert_eq!(value["failure"]["provider"], "deepseek");
    assert_eq!(value["failure"]["action"], "sign_in_provider");
    assert_eq!(value["failure"]["retryable"], false);
    assert_eq!(value["failure"]["message"], value["error"]);
    assert_eq!(
        serde_json::from_value::<TurnEndedNotification>(value).expect("round trip"),
        failed
    );
}

/// Retryability and the offered action are decided once, by the code, so two
/// hosts cannot disagree about what a rate limit means.
#[test]
fn every_failure_code_decides_its_own_action_and_retryability() {
    for (code, retryable, action) in [
        (
            TurnFailureCode::ProviderAuthMissing,
            false,
            TurnFailureAction::SignInProvider,
        ),
        (
            TurnFailureCode::ProviderAuthInvalid,
            false,
            TurnFailureAction::SignInProvider,
        ),
        (
            TurnFailureCode::ProviderRateLimited,
            true,
            TurnFailureAction::Retry,
        ),
        (
            TurnFailureCode::ProviderUnavailable,
            true,
            TurnFailureAction::Retry,
        ),
        (TurnFailureCode::Network, true, TurnFailureAction::Retry),
        (TurnFailureCode::Timeout, true, TurnFailureAction::Retry),
        (
            TurnFailureCode::ContextWindowExceeded,
            false,
            TurnFailureAction::OpenSettings,
        ),
        (
            TurnFailureCode::InvalidRequest,
            false,
            TurnFailureAction::OpenSettings,
        ),
        (TurnFailureCode::ToolDenied, false, TurnFailureAction::None),
        (TurnFailureCode::Interrupted, false, TurnFailureAction::None),
        (TurnFailureCode::Unknown, false, TurnFailureAction::None),
    ] {
        let failure = TurnFailure::new(code, "message");
        assert_eq!(failure.retryable, retryable, "retryable for {code:?}");
        assert_eq!(failure.action, action, "action for {code:?}");
    }
}

/// The shared engine's errors classify into the same closed set the CLI uses,
/// so a client never sees one host's code vocabulary and another's prose.
#[test]
fn engine_errors_classify_into_the_shared_code_set() {
    use agiworkforce_protocol::error::AgiworkforceErr;

    assert_eq!(
        TurnFailure::from_agiworkforce_err(&AgiworkforceErr::ContextWindowExceeded).code,
        TurnFailureCode::ContextWindowExceeded
    );
    assert_eq!(
        TurnFailure::from_agiworkforce_err(&AgiworkforceErr::Interrupted).code,
        TurnFailureCode::Interrupted
    );
    assert_eq!(
        TurnFailure::from_agiworkforce_err(&AgiworkforceErr::Timeout).code,
        TurnFailureCode::Timeout
    );
    assert_eq!(
        TurnFailure::from_agiworkforce_err(&AgiworkforceErr::QuotaExceeded).code,
        TurnFailureCode::ProviderRateLimited
    );
    assert_eq!(
        TurnFailure::from_agiworkforce_err(&AgiworkforceErr::ServerOverloaded).code,
        TurnFailureCode::ProviderUnavailable
    );
    assert_eq!(
        TurnFailure::from_agiworkforce_err(&AgiworkforceErr::UsageNotIncluded).code,
        TurnFailureCode::ProviderAuthMissing
    );

    let unmapped = TurnFailure::from_agiworkforce_err(&AgiworkforceErr::InternalAgentDied);
    assert_eq!(unmapped.code, TurnFailureCode::Unknown);
    assert_eq!(
        unmapped.message,
        AgiworkforceErr::InternalAgentDied.to_string(),
        "an unmapped error still carries its own text"
    );
}

/// Every method added for session lifecycle and concurrency is additive to v8:
/// the capability flags stay off the wire on a host that lacks them, and a
/// `turn/start` from a client that predates `clientTurnId` still parses.
#[test]
fn session_lifecycle_and_writer_surfaces_are_additive_to_v8() {
    use agiworkforce_protocol::developer_session::{
        ActiveTurnSnapshot, AppServerCapabilities, DEVELOPER_SESSION_PROTOCOL_VERSION,
        DeveloperSessionWriter, DeveloperSessionWriterChange, ThreadReconnectResponse,
        ThreadWriterChangedNotification, TurnStartParams, method,
    };

    assert_eq!(DEVELOPER_SESSION_PROTOCOL_VERSION, 8);
    assert_eq!(method::THREAD_DELETE, "thread/delete");
    assert_eq!(method::THREAD_RECONNECT, "thread/reconnect");
    assert_eq!(method::THREAD_WRITER_RELEASE, "thread/writer/release");
    assert_eq!(method::THREAD_WRITER_TAKEOVER, "thread/writer/takeover");

    let legacy_capabilities = serde_json::json!({
        "threads": true, "turns": true, "streaming": true, "approvals": true,
        "tools": true, "mcp": false, "checkpoints": false, "worktrees": false,
        "models": true,
    });
    let parsed: AppServerCapabilities =
        serde_json::from_value(legacy_capabilities.clone()).expect("v8 capabilities");
    assert!(!parsed.thread_delete && !parsed.reconnect && !parsed.writer_lease);
    assert_eq!(serde_json::to_value(&parsed).unwrap(), legacy_capabilities);

    let legacy_turn: TurnStartParams = serde_json::from_value(serde_json::json!({
        "threadId": "thread-1",
        "input": [],
    }))
    .expect("turn/start without clientTurnId");
    assert_eq!(legacy_turn.client_turn_id, None);

    let writer = DeveloperSessionWriter {
        holder_id: "writer-1".to_string(),
        holder_label: "AGI CLI (pid 42)".to_string(),
        acquired_at: "2026-09-17T00:00:00Z".to_string(),
        expires_at: "2026-09-17T00:02:00Z".to_string(),
        held_by_this_host: false,
        stale: false,
    };
    let changed = serde_json::to_value(ThreadWriterChangedNotification {
        thread_id: "thread-1".to_string(),
        change: DeveloperSessionWriterChange::StaleTakeover,
        writer: Some(writer.clone()),
        previous: None,
    })
    .unwrap();
    assert_eq!(changed["change"], "stale_takeover");
    assert_eq!(changed["writer"]["holderLabel"], "AGI CLI (pid 42)");
    assert!(changed.get("previous").is_none());

    let reconnect = serde_json::to_value(ThreadReconnectResponse {
        thread: serde_json::from_value(serde_json::json!({
            "id": "thread-1", "title": "t", "trustMode": "local",
            "createdAt": "2026-09-17T00:00:00Z", "updatedAt": "2026-09-17T00:00:00Z",
            "createdBy": "cli", "status": "running",
            "writer": writer,
        }))
        .unwrap(),
        active_turn: Some(ActiveTurnSnapshot {
            turn_id: "turn-1".to_string(),
            partial_response: "so far".to_string(),
            next_delta_index: 3,
            next_event_sequence: 7,
            pending_approvals: Vec::new(),
        }),
    })
    .unwrap();
    assert_eq!(reconnect["activeTurn"]["nextDeltaIndex"], 3);
    assert_eq!(reconnect["activeTurn"]["nextEventSequence"], 7);
    assert_eq!(reconnect["thread"]["writer"]["holderId"], "writer-1");
}
