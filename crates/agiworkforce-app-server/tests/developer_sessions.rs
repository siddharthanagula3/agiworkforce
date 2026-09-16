use agiworkforce_app_server::{
    DeveloperConnectionTrust, DeveloperSessionHost, DeveloperSessionHostError,
    DeveloperSessionProcessor,
};
use agiworkforce_protocol::developer_session::{
    method, AccountLoginOutcome, AccountLoginResponse, AccountLoginWaitParams,
    AccountLoginWaitResponse, AccountSource, AccountStatusParams, AccountStatusResponse,
    AccountTokenResponse, AcknowledgedResponse, AppServerCapabilities, AppServerClientInfo,
    AppServerNotification, AppServerRequest, ApprovalResponseParams, CommandSourceKind,
    ContextInstructionsParams, ContextInstructionsResponse, DeveloperAgentMode,
    DeveloperReasoningEffort, DeveloperSessionSource, DeveloperSessionTrustMode, HookConfigScope,
    HookListResponse, HookSummary, InitializeParams, InitializeResponse, InstructionFile,
    InstructionFileKind, LocalModelListResponse, LocalModelProvider, LocalModelSummary,
    McpLoginParams, McpLoginResponse, McpServerConfiguredStatus, McpServerListResponse,
    McpServerScope, McpServerSummary, ModelListParams, PluginListResponse, PluginScope,
    PluginSetEnabledParams, PluginSummary, SettingsReadResponse, SettingsWriteParams,
    SkillCatalogScope, SkillConsentParams, SkillConsentResponse, SkillListResponse,
    SkillSetEnabledParams, SkillSummary, SlashCommandListResponse, SlashCommandResultKind,
    SlashCommandRunParams, SlashCommandRunResponse, SlashCommandSummary, ThreadForkParams,
    ThreadIdParams, ThreadListParams, ThreadListResponse, ThreadReadResponse, ThreadStartParams,
    ThreadStartResponse, ThreadStatus, ThreadSummary, TurnInterruptParams, TurnStartParams,
    TurnStartResponse, TurnStatus, TurnSteerParams, TurnSummary,
    DEVELOPER_SESSION_PROTOCOL_VERSION, LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION,
};
use async_trait::async_trait;
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::{broadcast, oneshot, Mutex};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::Message;

#[derive(Debug, Clone, PartialEq)]
enum Call {
    Start(ThreadStartParams, AppServerClientInfo),
    List(ThreadListParams),
    Resume(ThreadIdParams),
    Read(ThreadIdParams),
    Fork(ThreadForkParams),
    Archive(ThreadIdParams),
    StartTurn(TurnStartParams),
    SteerTurn(TurnSteerParams),
    Interrupt(TurnInterruptParams),
    Approval(ApprovalResponseParams),
    Shutdown,
}

struct FakeHost {
    calls: Mutex<Vec<Call>>,
    notifications: broadcast::Sender<AppServerNotification>,
    shutdown_gate: Mutex<Option<oneshot::Receiver<()>>>,
}

impl FakeHost {
    fn new() -> Self {
        let (notifications, _) = broadcast::channel(16);
        Self {
            calls: Mutex::new(Vec::new()),
            notifications,
            shutdown_gate: Mutex::new(None),
        }
    }
}

fn thread(id: &str) -> ThreadSummary {
    ThreadSummary {
        id: id.to_string(),
        title: "Shared developer thread".to_string(),
        model: None,
        cwd: Some("/workspace".to_string()),
        provider: Some("ollama".to_string()),
        trust_mode: DeveloperSessionTrustMode::Local,
        git_branch: None,
        worktree_root: None,
        client: None,
        created_at: "2026-07-14T12:00:00Z".to_string(),
        updated_at: "2026-07-14T12:01:00Z".to_string(),
        created_by: DeveloperSessionSource::Vscode,
        status: ThreadStatus::Idle,
    }
}

fn turn() -> TurnSummary {
    TurnSummary {
        id: "turn-1".to_string(),
        thread_id: "thread-1".to_string(),
        status: TurnStatus::Running,
    }
}

#[async_trait]
impl DeveloperSessionHost for FakeHost {
    async fn start_thread(
        &self,
        params: ThreadStartParams,
        client: AppServerClientInfo,
    ) -> Result<ThreadSummary, DeveloperSessionHostError> {
        self.calls.lock().await.push(Call::Start(params, client));
        Ok(thread("thread-1"))
    }

    async fn list_threads(
        &self,
        params: ThreadListParams,
    ) -> Result<ThreadListResponse, DeveloperSessionHostError> {
        self.calls.lock().await.push(Call::List(params));
        Ok(ThreadListResponse {
            threads: vec![thread("thread-1")],
            next_cursor: None,
        })
    }

    async fn list_local_models(
        &self,
        _params: ModelListParams,
    ) -> Result<LocalModelListResponse, DeveloperSessionHostError> {
        Ok(LocalModelListResponse {
            models: vec![LocalModelSummary {
                id: "fixture-local-model".to_string(),
                provider: LocalModelProvider::Ollama,
            }],
            host_models: Vec::new(),
        })
    }

    async fn resume_thread(
        &self,
        params: ThreadIdParams,
    ) -> Result<ThreadSummary, DeveloperSessionHostError> {
        self.calls.lock().await.push(Call::Resume(params));
        Ok(thread("thread-1"))
    }

    async fn read_thread(
        &self,
        params: ThreadIdParams,
    ) -> Result<ThreadReadResponse, DeveloperSessionHostError> {
        self.calls.lock().await.push(Call::Read(params));
        Ok(ThreadReadResponse {
            thread: thread("thread-1"),
            messages: Vec::new(),
            transcript_truncated: false,
        })
    }

    async fn fork_thread(
        &self,
        params: ThreadForkParams,
        _client: AppServerClientInfo,
    ) -> Result<ThreadSummary, DeveloperSessionHostError> {
        self.calls.lock().await.push(Call::Fork(params));
        Ok(thread("thread-2"))
    }

    async fn archive_thread(
        &self,
        params: ThreadIdParams,
    ) -> Result<(), DeveloperSessionHostError> {
        self.calls.lock().await.push(Call::Archive(params));
        Ok(())
    }

    async fn start_turn(
        &self,
        params: TurnStartParams,
    ) -> Result<TurnSummary, DeveloperSessionHostError> {
        self.calls.lock().await.push(Call::StartTurn(params));
        Ok(turn())
    }

    async fn steer_turn(
        &self,
        params: TurnSteerParams,
    ) -> Result<TurnSummary, DeveloperSessionHostError> {
        self.calls.lock().await.push(Call::SteerTurn(params));
        Ok(turn())
    }

    async fn interrupt_turn(
        &self,
        params: TurnInterruptParams,
    ) -> Result<(), DeveloperSessionHostError> {
        self.calls.lock().await.push(Call::Interrupt(params));
        Ok(())
    }

    async fn respond_to_approval(
        &self,
        params: ApprovalResponseParams,
    ) -> Result<(), DeveloperSessionHostError> {
        self.calls.lock().await.push(Call::Approval(params));
        Ok(())
    }

    async fn shutdown(&self) -> Result<(), DeveloperSessionHostError> {
        self.calls.lock().await.push(Call::Shutdown);
        if let Some(gate) = self.shutdown_gate.lock().await.take() {
            let _ = gate.await;
        }
        Ok(())
    }

    fn subscribe(&self) -> broadcast::Receiver<AppServerNotification> {
        self.notifications.subscribe()
    }
}

fn request(id: i64, method: &str, params: impl serde::Serialize) -> AppServerRequest {
    AppServerRequest::new(id, method, params).expect("request must serialize")
}

fn initialize() -> AppServerRequest {
    initialize_at(Some(DEVELOPER_SESSION_PROTOCOL_VERSION))
}

fn initialize_at(protocol_version: Option<u32>) -> AppServerRequest {
    request(
        1,
        method::INITIALIZE,
        InitializeParams {
            client_info: AppServerClientInfo {
                name: "agi_vscode".to_string(),
                title: "AGI for VS Code".to_string(),
                version: "0.3.0".to_string(),
            },
            experimental_api: false,
            protocol_version,
        },
    )
}

fn capabilities() -> AppServerCapabilities {
    AppServerCapabilities {
        threads: true,
        turns: true,
        streaming: true,
        approvals: true,
        tools: true,
        mcp: true,
        checkpoints: false,
        worktrees: false,
        models: true,
        account: false,
        instructions: false,
        skills: false,
        plugins: false,
        hooks: false,
        settings: false,
        commands: false,
    }
}

#[tokio::test]
async fn requires_a_valid_one_time_initialize_handshake() {
    let host = Arc::new(FakeHost::new());
    let mut processor = DeveloperSessionProcessor::new(host, capabilities());

    let before_initialize = processor
        .process(request(2, method::THREAD_LIST, ThreadListParams::default()))
        .await;
    assert_eq!(before_initialize.error.expect("must fail").code, -32002);

    let initialized = processor.process(initialize()).await;
    let result: InitializeResponse = serde_json::from_value(
        initialized
            .result
            .expect("initialize must return capabilities"),
    )
    .expect("typed initialize response");
    assert_eq!(result.protocol_version, DEVELOPER_SESSION_PROTOCOL_VERSION);
    assert_eq!(result.capabilities, capabilities());

    let repeated = processor.process(initialize()).await;
    assert_eq!(repeated.error.expect("repeat must fail").code, -32003);
}

#[tokio::test]
async fn shutdown_is_runtime_validated_and_acknowledged_only_after_the_host_is_quiet() {
    let host = Arc::new(FakeHost::new());
    let (release_shutdown, shutdown_gate) = oneshot::channel();
    *host.shutdown_gate.lock().await = Some(shutdown_gate);
    let mut processor = DeveloperSessionProcessor::new(host.clone(), capabilities());
    processor.process(initialize()).await;

    let shutdown_task = tokio::spawn(async move {
        processor
            .process(request(2, method::SHUTDOWN, serde_json::json!({})))
            .await
    });
    tokio::time::timeout(std::time::Duration::from_secs(1), async {
        loop {
            if host.calls.lock().await.contains(&Call::Shutdown) {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("shutdown reaches host");
    assert!(
        !shutdown_task.is_finished(),
        "transport acknowledged shutdown before the host released quiescence"
    );

    release_shutdown.send(()).expect("release host shutdown");
    let response = shutdown_task.await.expect("shutdown processor task");
    let acknowledged: AcknowledgedResponse =
        serde_json::from_value(response.result.expect("shutdown response"))
            .expect("typed shutdown acknowledgment");
    assert!(acknowledged.acknowledged);

    let other_host = Arc::new(FakeHost::new());
    let mut other_processor = DeveloperSessionProcessor::new(other_host.clone(), capabilities());
    other_processor.process(initialize()).await;
    let invalid = other_processor
        .process(request(
            3,
            method::SHUTDOWN,
            serde_json::json!({ "unexpected": true }),
        ))
        .await;
    assert_eq!(invalid.error.expect("invalid shutdown params").code, -32602);
    assert!(!other_host.calls.lock().await.contains(&Call::Shutdown));
}

#[tokio::test]
async fn stdio_eof_quiesces_the_host_even_without_an_explicit_shutdown_request() {
    let host = Arc::new(FakeHost::new());
    let (request_writer, request_reader) = tokio::io::duplex(1024);
    let (_response_reader, response_writer) = tokio::io::duplex(1024);
    drop(request_writer);

    agiworkforce_app_server::serve_developer_session_io(
        request_reader,
        response_writer,
        host.clone(),
        capabilities(),
    )
    .await
    .expect("stdio server exits cleanly on EOF");

    assert_eq!(host.calls.lock().await.as_slice(), &[Call::Shutdown]);
}

#[tokio::test]
async fn routes_thread_turn_and_control_methods_to_one_host() {
    let host = Arc::new(FakeHost::new());
    let mut processor = DeveloperSessionProcessor::new(host.clone(), capabilities());
    processor.process(initialize()).await;

    let start = processor
        .process(request(
            2,
            method::THREAD_START,
            ThreadStartParams {
                model: None,
                provider: None,
                cwd: Some("/workspace".to_string()),
                title: None,
            },
        ))
        .await;
    let started: ThreadStartResponse =
        serde_json::from_value(start.result.expect("thread/start result")).expect("typed result");
    assert_eq!(started.thread.id, "thread-1");

    processor
        .process(request(3, method::THREAD_LIST, ThreadListParams::default()))
        .await;
    processor
        .process(request(
            4,
            method::THREAD_RESUME,
            ThreadIdParams {
                thread_id: "thread-1".to_string(),
            },
        ))
        .await;
    processor
        .process(request(
            40,
            method::THREAD_READ,
            ThreadIdParams {
                thread_id: "thread-1".to_string(),
            },
        ))
        .await;
    processor
        .process(request(
            5,
            method::THREAD_FORK,
            ThreadForkParams {
                thread_id: "thread-1".to_string(),
                title: None,
            },
        ))
        .await;
    processor
        .process(request(
            6,
            method::THREAD_ARCHIVE,
            ThreadIdParams {
                thread_id: "thread-2".to_string(),
            },
        ))
        .await;

    let start_turn = request(
        7,
        method::TURN_START,
        serde_json::json!({
            "threadId": "thread-1",
            "input": [{"type": "text", "text": "fix it"}],
            "agentMode": "plan",
            "reasoningEffort": "high",
            "contextFiles": ["/workspace/src/lib.rs"]
        }),
    );
    let started_turn = processor.process(start_turn).await;
    let turn_result: TurnStartResponse =
        serde_json::from_value(started_turn.result.expect("turn/start result"))
            .expect("typed turn result");
    assert_eq!(turn_result.turn.status, TurnStatus::Running);

    processor
        .process(request(
            8,
            method::TURN_STEER,
            serde_json::json!({"threadId": "thread-1", "input": [{"type": "text", "text": "also test it"}]}),
        ))
        .await;
    processor
        .process(request(
            9,
            method::TURN_INTERRUPT,
            TurnInterruptParams {
                thread_id: "thread-1".to_string(),
                turn_id: "turn-1".to_string(),
            },
        ))
        .await;

    let calls = host.calls.lock().await;
    assert_eq!(calls.len(), 9);
    assert!(matches!(calls[0], Call::Start(_, _)));
    match &calls[0] {
        Call::Start(_, client) => assert_eq!(client.name, "agi_vscode"),
        other => panic!("expected start call, got {other:?}"),
    }
    assert!(matches!(calls[3], Call::Read(_)));
    match &calls[6] {
        Call::StartTurn(params) => {
            let encoded = serde_json::to_value(params).expect("serialize routed controls");
            assert_eq!(encoded["agentMode"], "plan");
            assert_eq!(encoded["reasoningEffort"], "high");
            assert_eq!(
                encoded["contextFiles"],
                serde_json::json!(["/workspace/src/lib.rs"])
            );
        }
        other => panic!("expected turn/start call, got {other:?}"),
    }
    assert!(matches!(calls[7], Call::SteerTurn(_)));
    assert!(matches!(calls[8], Call::Interrupt(_)));
}

#[tokio::test]
async fn returns_typed_invalid_params_host_errors_and_acknowledgements() {
    let host = Arc::new(FakeHost::new());
    let mut processor = DeveloperSessionProcessor::new(host.clone(), capabilities());
    processor.process(initialize()).await;

    let malformed = processor
        .process(request(
            2,
            method::THREAD_RESUME,
            serde_json::json!({"wrong": true}),
        ))
        .await;
    assert_eq!(malformed.error.expect("invalid params").code, -32602);

    let archived = processor
        .process(request(
            3,
            method::THREAD_ARCHIVE,
            ThreadIdParams {
                thread_id: "thread-1".to_string(),
            },
        ))
        .await;
    let ack: AcknowledgedResponse =
        serde_json::from_value(archived.result.expect("archive ack")).expect("typed ack");
    assert!(ack.acknowledged);

    let unknown = processor
        .process(request(4, "unknown/method", serde_json::json!({})))
        .await;
    assert_eq!(unknown.error.expect("method not found").code, -32601);

    assert_eq!(
        DeveloperSessionHostError::not_found("missing").code(),
        -32004
    );
}

#[tokio::test]
async fn stdio_transport_interleaves_responses_and_host_notifications_as_json_lines() {
    let host = Arc::new(FakeHost::new());
    let (mut request_writer, request_reader) = tokio::io::duplex(16 * 1024);
    let (response_writer, response_reader) = tokio::io::duplex(16 * 1024);
    let server_host = host.clone();
    let server_task = tokio::spawn(async move {
        agiworkforce_app_server::serve_developer_session_io(
            request_reader,
            response_writer,
            server_host,
            capabilities(),
        )
        .await
    });

    let mut responses = BufReader::new(response_reader).lines();
    request_writer
        .write_all(
            format!(
                "{}\n",
                serde_json::to_string(&initialize()).expect("serialize initialize")
            )
            .as_bytes(),
        )
        .await
        .expect("write initialize");
    let init_line = responses
        .next_line()
        .await
        .expect("read initialize")
        .expect("initialize response line");
    let init_response: agiworkforce_protocol::developer_session::AppServerResponse =
        serde_json::from_str(&init_line).expect("parse initialize response");
    assert!(init_response.error.is_none());

    host.notifications
        .send(
            AppServerNotification::new(
                "turn/output_delta",
                serde_json::json!({"threadId": "thread-1", "turnId": "turn-1", "delta": "hi"}),
            )
            .expect("notification"),
        )
        .expect("subscriber is active");
    let notification_line = responses
        .next_line()
        .await
        .expect("read notification")
        .expect("notification line");
    let notification: AppServerNotification =
        serde_json::from_str(&notification_line).expect("parse notification");
    assert_eq!(notification.method, "turn/output_delta");

    request_writer
        .write_all(
            format!(
                "{}\n",
                serde_json::to_string(&request(99, method::SHUTDOWN, serde_json::json!({})))
                    .expect("serialize shutdown")
            )
            .as_bytes(),
        )
        .await
        .expect("write shutdown");
    let shutdown_line = responses
        .next_line()
        .await
        .expect("read shutdown")
        .expect("shutdown response line");
    let shutdown: agiworkforce_protocol::developer_session::AppServerResponse =
        serde_json::from_str(&shutdown_line).expect("parse shutdown response");
    assert!(shutdown.error.is_none());
    server_task
        .await
        .expect("server task")
        .expect("server exits cleanly");
}

#[tokio::test]
async fn websocket_transport_carries_typed_approval_round_trips() {
    use agiworkforce_protocol::protocol::ReviewDecision;

    let host = Arc::new(FakeHost::new());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind test listener");
    let addr = listener.local_addr().expect("test listener address");
    let server_host = host.clone();
    let server_task = tokio::spawn(async move {
        agiworkforce_app_server::serve_developer_session_websocket(
            listener,
            agiworkforce_app_server::WebSocketSecurity {
                auth_token: Some("test-secret".to_string()),
                allowed_origins: Vec::new(),
                allow_query_token: false,
            },
            server_host,
            capabilities(),
        )
        .await
    });

    let mut websocket_request = format!("ws://{addr}/ws")
        .into_client_request()
        .expect("valid websocket request");
    websocket_request.headers_mut().insert(
        "authorization",
        HeaderValue::from_static("Bearer test-secret"),
    );
    let (mut websocket, _) = tokio_tungstenite::connect_async(websocket_request)
        .await
        .expect("authenticated websocket connects");

    websocket
        .send(Message::text(
            serde_json::to_string(&initialize()).expect("serialize initialize"),
        ))
        .await
        .expect("send initialize");
    let initialize_response = websocket
        .next()
        .await
        .expect("initialize response frame")
        .expect("initialize response succeeds");
    let initialize_response: agiworkforce_protocol::developer_session::AppServerResponse =
        serde_json::from_str(initialize_response.to_text().expect("text response"))
            .expect("typed initialize response");
    assert!(initialize_response.error.is_none());

    host.notifications
        .send(
            AppServerNotification::new(
                "approval/requested",
                serde_json::json!({
                    "threadId": "thread-1",
                    "turnId": "turn-1",
                    "requestId": "approval-1",
                    "kind": "Exec",
                    "summary": "Run tests",
                    "detail": "cargo test",
                }),
            )
            .expect("approval notification"),
        )
        .expect("websocket subscriber is active");
    let approval_notification = websocket
        .next()
        .await
        .expect("approval notification frame")
        .expect("approval notification succeeds");
    let approval_notification: AppServerNotification =
        serde_json::from_str(approval_notification.to_text().expect("text notification"))
            .expect("typed approval notification");
    assert_eq!(approval_notification.method, "approval/requested");

    let approval = ApprovalResponseParams {
        thread_id: "thread-1".to_string(),
        turn_id: "turn-1".to_string(),
        request_id: "approval-1".to_string(),
        decision: ReviewDecision::ApprovedForSession,
    };
    websocket
        .send(Message::text(
            serde_json::to_string(&request(2, method::APPROVAL_RESPOND, approval.clone()))
                .expect("serialize approval response"),
        ))
        .await
        .expect("send approval response");
    let approval_response = websocket
        .next()
        .await
        .expect("approval acknowledgement frame")
        .expect("approval acknowledgement succeeds");
    let approval_response: agiworkforce_protocol::developer_session::AppServerResponse =
        serde_json::from_str(approval_response.to_text().expect("text response"))
            .expect("typed approval acknowledgement");
    let acknowledgement: AcknowledgedResponse = serde_json::from_value(
        approval_response
            .result
            .expect("approval acknowledgement result"),
    )
    .expect("typed acknowledgement");
    assert!(acknowledgement.acknowledged);
    assert_eq!(
        host.calls.lock().await.last(),
        Some(&Call::Approval(approval))
    );

    websocket.close(None).await.expect("close websocket");
    server_task.abort();
}

// ---------------------------------------------------------------------------
// v8 surfaces
// ---------------------------------------------------------------------------

struct SurfaceHost {
    notifications: broadcast::Sender<AppServerNotification>,
}

impl SurfaceHost {
    fn new() -> Self {
        let (notifications, _) = broadcast::channel(4);
        Self { notifications }
    }
}

#[async_trait]
impl DeveloperSessionHost for SurfaceHost {
    async fn start_thread(
        &self,
        _params: ThreadStartParams,
        _client: AppServerClientInfo,
    ) -> Result<ThreadSummary, DeveloperSessionHostError> {
        Ok(thread("thread-1"))
    }

    async fn list_threads(
        &self,
        _params: ThreadListParams,
    ) -> Result<ThreadListResponse, DeveloperSessionHostError> {
        Ok(ThreadListResponse {
            threads: Vec::new(),
            next_cursor: None,
        })
    }

    async fn list_local_models(
        &self,
        _params: ModelListParams,
    ) -> Result<LocalModelListResponse, DeveloperSessionHostError> {
        Ok(LocalModelListResponse {
            models: Vec::new(),
            host_models: Vec::new(),
        })
    }

    async fn resume_thread(
        &self,
        _params: ThreadIdParams,
    ) -> Result<ThreadSummary, DeveloperSessionHostError> {
        Ok(thread("thread-1"))
    }

    async fn read_thread(
        &self,
        _params: ThreadIdParams,
    ) -> Result<ThreadReadResponse, DeveloperSessionHostError> {
        Ok(ThreadReadResponse {
            thread: thread("thread-1"),
            messages: Vec::new(),
            transcript_truncated: false,
        })
    }

    async fn fork_thread(
        &self,
        _params: ThreadForkParams,
        _client: AppServerClientInfo,
    ) -> Result<ThreadSummary, DeveloperSessionHostError> {
        Ok(thread("thread-1"))
    }

    async fn archive_thread(
        &self,
        _params: ThreadIdParams,
    ) -> Result<(), DeveloperSessionHostError> {
        Ok(())
    }

    async fn start_turn(
        &self,
        _params: TurnStartParams,
    ) -> Result<TurnSummary, DeveloperSessionHostError> {
        Ok(turn())
    }

    async fn steer_turn(
        &self,
        _params: TurnSteerParams,
    ) -> Result<TurnSummary, DeveloperSessionHostError> {
        Ok(turn())
    }

    async fn interrupt_turn(
        &self,
        _params: TurnInterruptParams,
    ) -> Result<(), DeveloperSessionHostError> {
        Ok(())
    }

    async fn respond_to_approval(
        &self,
        _params: ApprovalResponseParams,
    ) -> Result<(), DeveloperSessionHostError> {
        Ok(())
    }

    async fn account_status(
        &self,
        params: AccountStatusParams,
    ) -> Result<AccountStatusResponse, DeveloperSessionHostError> {
        Ok(AccountStatusResponse {
            signed_in: true,
            email: Some("developer@example.com".to_string()),
            tier: Some("max".to_string()),
            balance_credits: Some(120.5),
            purchased_credits: None,
            cached: !params.refresh,
            source: AccountSource::Cli,
        })
    }

    async fn account_login(&self) -> Result<AccountLoginResponse, DeveloperSessionHostError> {
        Ok(AccountLoginResponse {
            login_id: "login-1".to_string(),
            verification_url: "https://agiworkforce.com/auth/device".to_string(),
            user_code: Some("ABCD-EFGH".to_string()),
            expires_at: Some("2026-09-14T12:15:00Z".to_string()),
        })
    }

    async fn account_login_wait(
        &self,
        _params: AccountLoginWaitParams,
    ) -> Result<AccountLoginWaitResponse, DeveloperSessionHostError> {
        Ok(AccountLoginWaitResponse {
            outcome: AccountLoginOutcome::Completed,
            message: None,
            account: self.account_status(AccountStatusParams::default()).await?,
        })
    }

    async fn account_logout(&self) -> Result<(), DeveloperSessionHostError> {
        Ok(())
    }

    async fn account_token(&self) -> Result<AccountTokenResponse, DeveloperSessionHostError> {
        Ok(AccountTokenResponse {
            token: "fixture-token".to_string(),
            expires_at: Some("2026-09-14T13:00:00Z".to_string()),
        })
    }

    async fn context_instructions(
        &self,
        _params: ContextInstructionsParams,
    ) -> Result<ContextInstructionsResponse, DeveloperSessionHostError> {
        Ok(ContextInstructionsResponse {
            files: vec![InstructionFile {
                path: "/workspace/AGENTS.md".to_string(),
                kind: InstructionFileKind::Agents,
                bytes: 42,
                root: "/workspace".to_string(),
            }],
            project_root: Some("/workspace".to_string()),
            truncated: false,
        })
    }

    async fn list_skills(&self) -> Result<SkillListResponse, DeveloperSessionHostError> {
        Ok(SkillListResponse {
            skills: vec![SkillSummary {
                name: "release-notes".to_string(),
                description: "Draft release notes".to_string(),
                scope: SkillCatalogScope::User,
                path: "/home/dev/.agiworkforce/skills/release-notes/SKILL.md".to_string(),
                enabled: true,
                consented: true,
            }],
        })
    }

    async fn set_skill_enabled(
        &self,
        _params: SkillSetEnabledParams,
    ) -> Result<SkillListResponse, DeveloperSessionHostError> {
        self.list_skills().await
    }

    async fn set_skill_consent(
        &self,
        params: SkillConsentParams,
    ) -> Result<SkillConsentResponse, DeveloperSessionHostError> {
        Ok(SkillConsentResponse {
            consented: params.granted,
            path: "/workspace/.agiworkforce/skills/.consent".to_string(),
        })
    }

    async fn list_plugins(&self) -> Result<PluginListResponse, DeveloperSessionHostError> {
        Ok(PluginListResponse {
            plugins: vec![PluginSummary {
                id: "reviewer".to_string(),
                name: "Reviewer".to_string(),
                version: Some("1.2.0".to_string()),
                enabled: true,
                source: PluginScope::User,
                path: "/home/dev/.agiworkforce/plugins/reviewer".to_string(),
                format: Some("agi".to_string()),
            }],
        })
    }

    async fn set_plugin_enabled(
        &self,
        _params: PluginSetEnabledParams,
    ) -> Result<PluginListResponse, DeveloperSessionHostError> {
        self.list_plugins().await
    }

    async fn list_mcp_servers(&self) -> Result<McpServerListResponse, DeveloperSessionHostError> {
        Ok(McpServerListResponse {
            servers: vec![McpServerSummary {
                name: "github".to_string(),
                transport: "http".to_string(),
                scope: McpServerScope::User,
                status: McpServerConfiguredStatus::NeedsAuth,
                url: Some("https://api.githubcopilot.com/mcp".to_string()),
            }],
        })
    }

    async fn login_mcp_server(
        &self,
        params: McpLoginParams,
    ) -> Result<McpLoginResponse, DeveloperSessionHostError> {
        Ok(McpLoginResponse {
            name: params.name,
            status: McpServerConfiguredStatus::Authorized,
        })
    }

    async fn list_hooks(&self) -> Result<HookListResponse, DeveloperSessionHostError> {
        Ok(HookListResponse {
            hooks: vec![HookSummary {
                event: "PreToolUse".to_string(),
                command: "./scripts/audit.sh".to_string(),
                scope: HookConfigScope::User,
                trusted: true,
                source: Some("/home/dev/.agiworkforce/hooks.json".to_string()),
            }],
        })
    }

    async fn read_settings(&self) -> Result<SettingsReadResponse, DeveloperSessionHostError> {
        Ok(SettingsReadResponse {
            default_model: Some("fixture-model".to_string()),
            default_effort: Some(DeveloperReasoningEffort::High),
            permission_mode: Some(DeveloperAgentMode::Ask),
            user_instructions: Some("Be brief".to_string()),
            project_instructions: None,
            user_instructions_path: "/home/dev/.agiworkforce/instructions.md".to_string(),
            project_instructions_path: "/workspace/.agiworkforce/instructions.md".to_string(),
            config_path: "/home/dev/.agiworkforce/config.toml".to_string(),
        })
    }

    async fn write_settings(
        &self,
        _params: SettingsWriteParams,
    ) -> Result<SettingsReadResponse, DeveloperSessionHostError> {
        self.read_settings().await
    }

    async fn list_commands(&self) -> Result<SlashCommandListResponse, DeveloperSessionHostError> {
        Ok(SlashCommandListResponse {
            commands: vec![SlashCommandSummary {
                name: "skills".to_string(),
                description: "List skills".to_string(),
                args_hint: None,
                source: CommandSourceKind::Builtin,
                aliases: Vec::new(),
                runnable: true,
            }],
        })
    }

    async fn run_command(
        &self,
        _params: SlashCommandRunParams,
    ) -> Result<SlashCommandRunResponse, DeveloperSessionHostError> {
        Ok(SlashCommandRunResponse {
            kind: SlashCommandResultKind::Skills,
            text: "release-notes".to_string(),
            payload: Some(serde_json::json!({ "skills": [] })),
        })
    }

    async fn shutdown(&self) -> Result<(), DeveloperSessionHostError> {
        Ok(())
    }

    fn subscribe(&self) -> broadcast::Receiver<AppServerNotification> {
        self.notifications.subscribe()
    }
}

async fn surface_processor() -> DeveloperSessionProcessor {
    let mut processor =
        DeveloperSessionProcessor::new(Arc::new(SurfaceHost::new()), capabilities());
    processor.process(initialize()).await;
    processor
}

fn result_of(response: agiworkforce_protocol::developer_session::AppServerResponse) -> Value {
    response
        .result
        .unwrap_or_else(|| panic!("method must succeed, got {:?}", response.error))
}

#[tokio::test]
async fn every_v8_method_dispatches_and_returns_its_typed_shape() {
    let mut processor = surface_processor().await;

    let account = result_of(
        processor
            .process(request(
                2,
                method::ACCOUNT_STATUS,
                serde_json::json!({ "refresh": true }),
            ))
            .await,
    );
    assert_eq!(account["signedIn"], serde_json::json!(true));
    assert_eq!(account["source"], serde_json::json!("cli"));
    assert_eq!(account["cached"], serde_json::json!(false));
    serde_json::from_value::<AccountStatusResponse>(account).expect("typed account status");

    let login = result_of(
        processor
            .process(request(3, method::ACCOUNT_LOGIN, serde_json::json!({})))
            .await,
    );
    assert_eq!(login["userCode"], serde_json::json!("ABCD-EFGH"));
    let login: AccountLoginResponse = serde_json::from_value(login).expect("typed login");

    let waited = result_of(
        processor
            .process(request(
                4,
                method::ACCOUNT_LOGIN_WAIT,
                serde_json::json!({ "loginId": login.login_id }),
            ))
            .await,
    );
    assert_eq!(waited["outcome"], serde_json::json!("completed"));
    serde_json::from_value::<AccountLoginWaitResponse>(waited).expect("typed login wait");

    let token = result_of(
        processor
            .process(request(5, method::ACCOUNT_TOKEN, serde_json::json!({})))
            .await,
    );
    serde_json::from_value::<AccountTokenResponse>(token).expect("typed token");

    let instructions = result_of(
        processor
            .process(request(
                6,
                method::CONTEXT_INSTRUCTIONS,
                serde_json::json!({ "cwd": "/workspace/apps/web" }),
            ))
            .await,
    );
    assert_eq!(
        instructions["files"][0]["kind"],
        serde_json::json!("AGENTS.md")
    );
    serde_json::from_value::<ContextInstructionsResponse>(instructions)
        .expect("typed instructions");

    let skills = result_of(
        processor
            .process(request(7, method::SKILLS_LIST, serde_json::json!({})))
            .await,
    );
    assert_eq!(skills["skills"][0]["scope"], serde_json::json!("user"));
    serde_json::from_value::<SkillListResponse>(skills).expect("typed skills");

    let toggled = result_of(
        processor
            .process(request(
                8,
                method::SKILLS_SET_ENABLED,
                serde_json::json!({ "name": "release-notes", "enabled": false }),
            ))
            .await,
    );
    serde_json::from_value::<SkillListResponse>(toggled).expect("typed skill toggle");

    let consent = result_of(
        processor
            .process(request(
                9,
                method::SKILLS_CONSENT,
                serde_json::json!({ "granted": true }),
            ))
            .await,
    );
    assert_eq!(consent["consented"], serde_json::json!(true));
    serde_json::from_value::<SkillConsentResponse>(consent).expect("typed consent");

    let plugins = result_of(
        processor
            .process(request(10, method::PLUGINS_LIST, serde_json::json!({})))
            .await,
    );
    assert_eq!(plugins["plugins"][0]["source"], serde_json::json!("user"));
    serde_json::from_value::<PluginListResponse>(plugins).expect("typed plugins");

    let plugin_toggled = result_of(
        processor
            .process(request(
                11,
                method::PLUGINS_SET_ENABLED,
                serde_json::json!({ "id": "reviewer", "enabled": false }),
            ))
            .await,
    );
    serde_json::from_value::<PluginListResponse>(plugin_toggled).expect("typed plugin toggle");

    let servers = result_of(
        processor
            .process(request(12, method::MCP_LIST, serde_json::json!({})))
            .await,
    );
    assert_eq!(
        servers["servers"][0]["status"],
        serde_json::json!("needs_auth")
    );
    serde_json::from_value::<McpServerListResponse>(servers).expect("typed mcp list");

    let logged_in = result_of(
        processor
            .process(request(
                13,
                method::MCP_LOGIN,
                serde_json::json!({ "name": "github" }),
            ))
            .await,
    );
    assert_eq!(logged_in["status"], serde_json::json!("authorized"));
    serde_json::from_value::<McpLoginResponse>(logged_in).expect("typed mcp login");

    let hooks = result_of(
        processor
            .process(request(14, method::HOOKS_LIST, serde_json::json!({})))
            .await,
    );
    assert_eq!(hooks["hooks"][0]["scope"], serde_json::json!("user"));
    serde_json::from_value::<HookListResponse>(hooks).expect("typed hooks");

    let settings = result_of(
        processor
            .process(request(15, method::SETTINGS_READ, serde_json::json!({})))
            .await,
    );
    assert_eq!(settings["permissionMode"], serde_json::json!("ask"));
    serde_json::from_value::<SettingsReadResponse>(settings).expect("typed settings");

    let written = result_of(
        processor
            .process(request(
                16,
                method::SETTINGS_WRITE,
                serde_json::json!({ "defaultEffort": "high" }),
            ))
            .await,
    );
    serde_json::from_value::<SettingsReadResponse>(written).expect("typed settings write");

    let commands = result_of(
        processor
            .process(request(17, method::COMMANDS_LIST, serde_json::json!({})))
            .await,
    );
    assert_eq!(commands["commands"][0]["runnable"], serde_json::json!(true));
    serde_json::from_value::<SlashCommandListResponse>(commands).expect("typed commands");

    let ran = result_of(
        processor
            .process(request(
                18,
                method::COMMANDS_RUN,
                serde_json::json!({ "name": "skills" }),
            ))
            .await,
    );
    assert_eq!(ran["kind"], serde_json::json!("skills"));
    serde_json::from_value::<SlashCommandRunResponse>(ran).expect("typed command run");

    let logged_out = result_of(
        processor
            .process(request(19, method::ACCOUNT_LOGOUT, serde_json::json!({})))
            .await,
    );
    serde_json::from_value::<AcknowledgedResponse>(logged_out).expect("typed logout");
}

#[tokio::test]
async fn account_token_is_refused_on_a_connection_that_did_not_prove_header_auth() {
    let mut processor = DeveloperSessionProcessor::new_with_trust(
        Arc::new(SurfaceHost::new()),
        capabilities(),
        DeveloperConnectionTrust::Untrusted,
    );
    processor.process(initialize()).await;

    let refused = processor
        .process(request(2, method::ACCOUNT_TOKEN, serde_json::json!({})))
        .await;
    let error = refused.error.expect("account/token must be refused");
    assert_eq!(error.code, -32006);
    assert!(refused.result.is_none(), "no credential may be returned");

    // The same connection still reads everything that is not a credential.
    let status = processor
        .process(request(3, method::ACCOUNT_STATUS, serde_json::json!({})))
        .await;
    assert!(status.error.is_none(), "only credential minting is refused");
}

#[tokio::test]
async fn an_unauthenticated_websocket_never_reaches_the_account_surface() {
    let host = Arc::new(SurfaceHost::new());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind loopback listener");
    let addr = listener.local_addr().expect("listener address");
    let server = tokio::spawn(agiworkforce_app_server::serve_developer_session_websocket(
        listener,
        agiworkforce_app_server::WebSocketSecurity {
            auth_token: Some("secret-token".to_string()),
            allowed_origins: Vec::new(),
            allow_query_token: false,
        },
        host,
        capabilities(),
    ));

    let unauthenticated = tokio_tungstenite::connect_async(format!("ws://{addr}/ws")).await;
    assert!(
        unauthenticated.is_err(),
        "an upgrade without the app-server token must be rejected before any frame"
    );

    let mut authenticated_request = format!("ws://{addr}/ws")
        .into_client_request()
        .expect("client request");
    authenticated_request.headers_mut().insert(
        "x-agi-app-server-token",
        HeaderValue::from_static("secret-token"),
    );
    let (mut socket, _) = tokio_tungstenite::connect_async(authenticated_request)
        .await
        .expect("token-carrying upgrade is accepted");
    socket
        .send(Message::text(
            serde_json::to_string(&initialize()).expect("initialize frame"),
        ))
        .await
        .expect("send initialize");
    let _ = socket.next().await.expect("handshake response");
    socket
        .send(Message::text(
            serde_json::to_string(&request(2, method::ACCOUNT_TOKEN, serde_json::json!({})))
                .expect("token frame"),
        ))
        .await
        .expect("send account/token");
    let raw = socket.next().await.expect("token response").expect("frame");
    let response: serde_json::Value =
        serde_json::from_str(raw.to_text().expect("text frame")).expect("json response");
    assert_eq!(
        response["result"]["token"],
        serde_json::json!("fixture-token")
    );

    server.abort();
}

#[tokio::test]
async fn a_client_that_states_no_version_is_answered_with_the_legacy_one() {
    let mut processor =
        DeveloperSessionProcessor::new(Arc::new(SurfaceHost::new()), capabilities());
    let legacy: InitializeResponse =
        serde_json::from_value(result_of(processor.process(initialize_at(None)).await))
            .expect("typed handshake");
    assert_eq!(
        legacy.protocol_version,
        LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION
    );

    // A v7 client still reaches the methods it knows.
    let threads = processor
        .process(request(2, method::THREAD_LIST, ThreadListParams::default()))
        .await;
    assert!(threads.error.is_none());

    let mut current = DeveloperSessionProcessor::new(Arc::new(SurfaceHost::new()), capabilities());
    let negotiated: InitializeResponse = serde_json::from_value(result_of(
        current
            .process(initialize_at(Some(DEVELOPER_SESSION_PROTOCOL_VERSION)))
            .await,
    ))
    .expect("typed handshake");
    assert_eq!(
        negotiated.protocol_version,
        DEVELOPER_SESSION_PROTOCOL_VERSION
    );

    let mut unsupported =
        DeveloperSessionProcessor::new(Arc::new(SurfaceHost::new()), capabilities());
    let refused = unsupported.process(initialize_at(Some(99))).await;
    assert_eq!(refused.error.expect("unsupported version").code, -32005);
}
