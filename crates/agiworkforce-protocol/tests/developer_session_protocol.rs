use agiworkforce_protocol::developer_session::{
    AppServerClientInfo, AppServerRequest, AppServerResponse, DeveloperMessage,
    DeveloperSessionSource, DeveloperSessionTrustMode, InitializeParams,
    MAX_STATED_RETRY_AFTER_SECONDS, TURN_FAILURE_CODES, ThreadReadResponse, ThreadStartParams,
    ThreadStartResponse, ThreadStatus, ThreadSummary, TurnEndedNotification, TurnFailure,
    TurnFailureAction, TurnFailureCode, TurnStatus,
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
            TurnFailureCode::AccountSignedOut,
            false,
            TurnFailureAction::SignInAccount,
        ),
        (
            TurnFailureCode::PlanExcludesModel,
            false,
            TurnFailureAction::UpgradePlan,
        ),
        (
            TurnFailureCode::UsageLimitReached,
            false,
            TurnFailureAction::None,
        ),
        (
            TurnFailureCode::ProviderRateLimited,
            true,
            TurnFailureAction::Retry,
        ),
        (
            TurnFailureCode::FreeAllowanceExhausted,
            false,
            TurnFailureAction::None,
        ),
        (
            TurnFailureCode::ProviderUnavailable,
            true,
            TurnFailureAction::Retry,
        ),
        (
            TurnFailureCode::StreamInterrupted,
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
            TurnFailureCode::OutputLimitReached,
            false,
            TurnFailureAction::None,
        ),
        (
            TurnFailureCode::RefusedBySafety,
            false,
            TurnFailureAction::None,
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

/// The listing every surface is held to has to be the enum itself, not the
/// members whoever edited it last remembered. `schemars` reads the derive, so
/// a variant added without a line in `TURN_FAILURE_CODES` fails here and the
/// case above stops being a decision about a subset.
#[test]
fn the_published_code_listing_is_the_whole_enum() {
    let schema = serde_json::to_value(schemars::schema_for!(TurnFailureCode))
        .expect("the derive produces a schema");
    let declared: std::collections::BTreeSet<String> = schema["oneOf"]
        .as_array()
        .expect("TurnFailureCode is a closed string set")
        .iter()
        .flat_map(|variant| {
            variant["enum"]
                .as_array()
                .expect("each subschema lists its own spellings")
                .iter()
                .map(|value| {
                    value
                        .as_str()
                        .expect("a code is a string on the wire")
                        .to_string()
                })
        })
        .collect();
    let listed: std::collections::BTreeSet<String> = TURN_FAILURE_CODES
        .iter()
        .map(|code| {
            serde_json::to_value(code)
                .expect("serialize code")
                .as_str()
                .expect("a code is a string on the wire")
                .to_string()
        })
        .collect();
    assert_eq!(declared, listed);

    for code in TURN_FAILURE_CODES {
        let failure = TurnFailure::new(*code, "message");
        assert_eq!(
            failure.retryable,
            code.is_retryable(),
            "retryability for {code:?}"
        );
        assert_eq!(failure.action, code.default_action(), "action for {code:?}");
    }
}

/// Every kind the developer surfaces now have to be able to tell apart has a
/// member of its own. Collapsing any pair of these back together takes a
/// reader's next move away from them: a spent shared allowance is not the
/// reader's own limit, a truncated answer is not an outage, and a refusal is
/// not a model that could not be reached.
#[test]
fn the_failures_a_reader_has_to_tell_apart_are_separate_codes() {
    let distinct = [
        TurnFailureCode::ProviderRateLimited,
        TurnFailureCode::FreeAllowanceExhausted,
        TurnFailureCode::UsageLimitReached,
        TurnFailureCode::ProviderUnavailable,
        TurnFailureCode::ContextWindowExceeded,
        TurnFailureCode::OutputLimitReached,
        TurnFailureCode::RefusedBySafety,
        TurnFailureCode::StreamInterrupted,
        TurnFailureCode::Interrupted,
        TurnFailureCode::AccountSignedOut,
    ];
    let wire: std::collections::BTreeSet<String> = distinct
        .iter()
        .map(|code| serde_json::to_value(code).expect("serialize").to_string())
        .collect();
    assert_eq!(
        wire.len(),
        distinct.len(),
        "two of these share a code, so no client can tell them apart: {wire:?}"
    );
    for code in distinct {
        assert!(
            TURN_FAILURE_CODES.contains(&code),
            "{code:?} is not on the wire"
        );
    }
}

/// A wait is only ever the provider's own figure, and a reference is only ever
/// one the host recorded. Both are absent by default, both survive the wire,
/// and a figure no sentence should be built on is dropped where it arrives
/// rather than in each surface.
#[test]
fn a_failure_carries_only_a_wait_and_a_reference_it_was_given() {
    let bare = TurnFailure::new(TurnFailureCode::ProviderRateLimited, "rate limited");
    let wire = serde_json::to_value(&bare).expect("serialize");
    assert!(
        wire.get("retryAfterSeconds").is_none() && wire.get("requestId").is_none(),
        "a failure nobody timed or logged states neither: {wire}"
    );

    let stated = bare
        .clone()
        .with_retry_after_seconds(45_u64)
        .with_request_id("req_7f3a".to_string());
    let wire = serde_json::to_value(&stated).expect("serialize");
    assert_eq!(wire["retryAfterSeconds"], 45);
    assert_eq!(wire["requestId"], "req_7f3a");
    assert_eq!(
        serde_json::from_value::<TurnFailure>(wire).expect("round trip"),
        stated
    );

    assert_eq!(
        bare.clone()
            .with_retry_after_seconds(None)
            .retry_after_seconds,
        None,
        "no header, no figure"
    );
    assert_eq!(
        bare.clone()
            .with_retry_after_seconds(0_u64)
            .retry_after_seconds,
        None,
        "a zero-second wait is not a wait a reader can act on"
    );
    assert_eq!(
        bare.clone()
            .with_retry_after_seconds(u64::from(MAX_STATED_RETRY_AFTER_SECONDS) + 1)
            .retry_after_seconds,
        None,
        "past a day the figure is clock skew, and a sentence built on it is worse than none"
    );
    assert_eq!(
        bare.with_request_id("   ".to_string()).request_id,
        None,
        "a blank id is not an id a reader can quote"
    );
}

/// A client built before these fields existed still parses a failure that
/// carries them, and a host built before them still produces one this build
/// parses. Both directions matter: the CLI and the editor ship separately.
#[test]
fn a_failure_reads_the_same_across_a_version_skew() {
    let from_an_older_host = serde_json::json!({
        "code": "provider_rate_limited",
        "message": "rate limited",
        "retryable": true,
        "action": "retry"
    });
    let parsed: TurnFailure =
        serde_json::from_value(from_an_older_host).expect("a failure without the new fields");
    assert_eq!(parsed.retry_after_seconds, None);
    assert_eq!(parsed.request_id, None);
    assert_eq!(parsed.code, TurnFailureCode::ProviderRateLimited);

    let from_a_newer_host = serde_json::to_value(
        TurnFailure::new(TurnFailureCode::FreeAllowanceExhausted, "allowance spent")
            .with_retry_after_seconds(7_200_u64)
            .with_request_id("req_7f3a".to_string()),
    )
    .expect("serialize");
    let object = from_a_newer_host.as_object().expect("an object");
    for field in ["code", "message", "retryable", "action"] {
        assert!(
            object.contains_key(field),
            "an older client reads {field} and it must still be there: {from_a_newer_host}"
        );
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
    // A spent account quota is the reader's own limit, not the provider
    // refusing traffic: told it was a rate limit, a reader waits out a moment
    // that never passes and blames a provider that was working.
    assert_eq!(
        TurnFailure::from_agiworkforce_err(&AgiworkforceErr::QuotaExceeded).code,
        TurnFailureCode::UsageLimitReached
    );
    assert_eq!(
        TurnFailure::from_agiworkforce_err(&AgiworkforceErr::ServerOverloaded).code,
        TurnFailureCode::ProviderUnavailable
    );
    assert_eq!(
        TurnFailure::from_agiworkforce_err(&AgiworkforceErr::UsageNotIncluded).code,
        TurnFailureCode::ProviderAuthMissing
    );
    // A connection that ended part way through an answer is not a provider
    // that never answered, and the two have different next moves.
    assert_eq!(
        TurnFailure::from_agiworkforce_err(&AgiworkforceErr::Stream("dropped".to_string(), None))
            .code,
        TurnFailureCode::StreamInterrupted
    );

    let unmapped = TurnFailure::from_agiworkforce_err(&AgiworkforceErr::InternalAgentDied);
    assert_eq!(unmapped.code, TurnFailureCode::Unknown);
    assert_eq!(
        unmapped.message,
        AgiworkforceErr::InternalAgentDied.to_string(),
        "an unmapped error still carries its own text"
    );
}

/// The wait and the reference the engine already knows reach the client. Both
/// were dropped at this conversion: the reset instant a usage limit carries,
/// the delay a disconnected stream asks for, and the request id three of these
/// errors have had all along.
#[test]
fn the_engines_own_waits_and_request_ids_survive_the_conversion() {
    use agiworkforce_protocol::error::{
        AgiworkforceErr, ResponseStreamFailed, RetryLimitReachedError, UsageLimitReachedError,
    };
    use chrono::{Duration as ChronoDuration, TimeZone, Utc};

    let now = Utc
        .with_ymd_and_hms(2026, 9, 21, 12, 0, 0)
        .single()
        .expect("a fixed instant");
    let limited = AgiworkforceErr::UsageLimitReached(UsageLimitReachedError {
        plan_type: None,
        resets_at: Some(now + ChronoDuration::seconds(600)),
        rate_limits: None,
        promo_message: None,
    });
    let failure = TurnFailure::from_agiworkforce_err_at(&limited, now);
    assert_eq!(failure.code, TurnFailureCode::UsageLimitReached);
    assert_eq!(failure.retry_after_seconds, Some(600));

    let already_reset = AgiworkforceErr::UsageLimitReached(UsageLimitReachedError {
        plan_type: None,
        resets_at: Some(now - ChronoDuration::seconds(60)),
        rate_limits: None,
        promo_message: None,
    });
    assert_eq!(
        TurnFailure::from_agiworkforce_err_at(&already_reset, now).retry_after_seconds,
        None,
        "a window that has already reopened is no wait to state"
    );

    let delayed = AgiworkforceErr::Stream(
        "dropped".to_string(),
        Some(std::time::Duration::from_secs(12)),
    );
    assert_eq!(
        TurnFailure::from_agiworkforce_err_at(&delayed, now).retry_after_seconds,
        Some(12)
    );

    let retry_limit = AgiworkforceErr::RetryLimit(RetryLimitReachedError {
        status: http::StatusCode::SERVICE_UNAVAILABLE,
        request_id: Some("req_7f3a".to_string()),
    });
    assert_eq!(
        TurnFailure::from_agiworkforce_err_at(&retry_limit, now).request_id,
        Some("req_7f3a".to_string())
    );

    let read_failed = ResponseStreamFailed {
        source: reqwest_error(),
        request_id: None,
    };
    assert_eq!(
        TurnFailure::from_agiworkforce_err_at(
            &AgiworkforceErr::ResponseStreamFailed(read_failed),
            now
        )
        .request_id,
        None,
        "a failure the service did not label carries no reference to quote"
    );
}

/// A `reqwest::Error` cannot be constructed directly, so one is provoked from
/// the only shape that needs no network: a URL the client refuses to parse.
fn reqwest_error() -> reqwest::Error {
    reqwest::Client::new()
        .get("http:")
        .build()
        .expect_err("an unparseable url is refused before any request is sent")
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
