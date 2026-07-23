use agiworkforce_app_server::{
    DeveloperSessionHost, DeveloperSessionHostError, DeveloperSessionProcessor,
};
use agiworkforce_protocol::developer_session::{
    method, AcknowledgedResponse, AppServerCapabilities, AppServerClientInfo,
    AppServerNotification, AppServerRequest, ApprovalResponseParams, DeveloperSessionSource,
    InitializeParams, InitializeResponse, LocalModelListResponse, LocalModelProvider,
    LocalModelSummary, ThreadForkParams, ThreadIdParams, ThreadListParams, ThreadListResponse,
    ThreadReadResponse, ThreadStartParams, ThreadStartResponse, ThreadStatus, ThreadSummary,
    TurnInterruptParams, TurnStartParams, TurnStartResponse, TurnStatus, TurnSteerParams,
    TurnSummary, DEVELOPER_SESSION_PROTOCOL_VERSION,
};
use async_trait::async_trait;
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::{broadcast, Mutex};
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
}

struct FakeHost {
    calls: Mutex<Vec<Call>>,
    notifications: broadcast::Sender<AppServerNotification>,
}

impl FakeHost {
    fn new() -> Self {
        let (notifications, _) = broadcast::channel(16);
        Self {
            calls: Mutex::new(Vec::new()),
            notifications,
        }
    }
}

fn thread(id: &str) -> ThreadSummary {
    ThreadSummary {
        id: id.to_string(),
        title: "Shared developer thread".to_string(),
        model: None,
        cwd: Some("/workspace".to_string()),
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

    async fn list_local_models(&self) -> Result<LocalModelListResponse, DeveloperSessionHostError> {
        Ok(LocalModelListResponse {
            models: vec![LocalModelSummary {
                id: "gemma4:e4b".to_string(),
                provider: LocalModelProvider::Ollama,
            }],
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

    fn subscribe(&self) -> broadcast::Receiver<AppServerNotification> {
        self.notifications.subscribe()
    }
}

fn request(id: i64, method: &str, params: impl serde::Serialize) -> AppServerRequest {
    AppServerRequest::new(id, method, params).expect("request must serialize")
}

fn initialize() -> AppServerRequest {
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
        .send(Message::Text(
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
        .send(Message::Text(
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
