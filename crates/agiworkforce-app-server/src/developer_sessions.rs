use agiworkforce_protocol::developer_session::{
    method, AcknowledgedResponse, AppServerCapabilities, AppServerClientInfo,
    AppServerNotification, AppServerRequest, AppServerResponse, ApprovalResponseParams,
    InitializeParams, InitializeResponse, ThreadForkParams, ThreadIdParams, ThreadListParams,
    ThreadListResponse, ThreadReadResponse, ThreadStartParams, ThreadStartResponse, ThreadSummary,
    TurnInterruptParams, TurnStartParams, TurnStartResponse, TurnSteerParams, TurnSummary,
    DEVELOPER_SESSION_PROTOCOL_VERSION,
};
use anyhow::Result;
use async_trait::async_trait;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::fmt;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::sync::broadcast;

// v3 requires servers to enforce per-turn agent controls and workspace-scoped
// context. Older servers silently discarded these security-sensitive fields.
const SERVER_NAME: &str = "agiworkforce-app-server";
const SERVER_TITLE: &str = "AGI Workforce App Server";

/// Stable host boundary implemented by the local developer runtime.
///
/// Implementations own persistence, execution, cancellation, approvals, MCP,
/// worktrees, and checkpoints. The app-server crate owns only typed request
/// admission and transport. Long-running work must be spawned by the host so
/// `start_turn` can return while the same connection remains able to receive
/// interrupts and approval responses.
#[async_trait]
pub trait DeveloperSessionHost: Send + Sync {
    async fn start_thread(
        &self,
        params: ThreadStartParams,
        client: AppServerClientInfo,
    ) -> Result<ThreadSummary, DeveloperSessionHostError>;

    async fn list_threads(
        &self,
        params: ThreadListParams,
    ) -> Result<ThreadListResponse, DeveloperSessionHostError>;

    async fn resume_thread(
        &self,
        params: ThreadIdParams,
    ) -> Result<ThreadSummary, DeveloperSessionHostError>;

    async fn read_thread(
        &self,
        params: ThreadIdParams,
    ) -> Result<ThreadReadResponse, DeveloperSessionHostError>;

    async fn fork_thread(
        &self,
        params: ThreadForkParams,
        client: AppServerClientInfo,
    ) -> Result<ThreadSummary, DeveloperSessionHostError>;

    async fn archive_thread(&self, params: ThreadIdParams)
        -> Result<(), DeveloperSessionHostError>;

    async fn start_turn(
        &self,
        params: TurnStartParams,
    ) -> Result<TurnSummary, DeveloperSessionHostError>;

    async fn steer_turn(
        &self,
        params: TurnSteerParams,
    ) -> Result<TurnSummary, DeveloperSessionHostError>;

    async fn interrupt_turn(
        &self,
        params: TurnInterruptParams,
    ) -> Result<(), DeveloperSessionHostError>;

    async fn respond_to_approval(
        &self,
        params: ApprovalResponseParams,
    ) -> Result<(), DeveloperSessionHostError>;

    fn subscribe(&self) -> broadcast::Receiver<AppServerNotification>;
}

/// Error categories that survive the local app-server boundary without
/// leaking internal error chains to editor clients.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeveloperSessionHostError {
    code: i32,
    message: String,
}

impl DeveloperSessionHostError {
    pub fn invalid_request(message: impl Into<String>) -> Self {
        Self::new(-32602, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(-32004, message)
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::new(-32009, message)
    }

    pub fn unavailable(message: impl Into<String>) -> Self {
        Self::new(-32010, message)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(-32603, message)
    }

    pub fn code(&self) -> i32 {
        self.code
    }

    pub fn message(&self) -> &str {
        &self.message
    }

    fn new(code: i32, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl fmt::Display for DeveloperSessionHostError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for DeveloperSessionHostError {}

/// Connection-local request processor for the shared CLI/VS Code runtime.
///
/// A processor is intentionally not shared between connections: handshake
/// state and the client identity belong to one stdio or WebSocket client.
pub struct DeveloperSessionProcessor {
    host: Arc<dyn DeveloperSessionHost>,
    capabilities: AppServerCapabilities,
    initialized: bool,
    client: Option<AppServerClientInfo>,
}

impl DeveloperSessionProcessor {
    pub fn new(host: Arc<dyn DeveloperSessionHost>, capabilities: AppServerCapabilities) -> Self {
        Self {
            host,
            capabilities,
            initialized: false,
            client: None,
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<AppServerNotification> {
        self.host.subscribe()
    }

    pub async fn process(&mut self, request: AppServerRequest) -> AppServerResponse {
        if request.method == method::INITIALIZE {
            return self.initialize(request);
        }

        if !self.initialized {
            return AppServerResponse::failure(
                request.id,
                -32002,
                "Client must initialize before invoking app-server methods",
            );
        }

        let id = request.id.clone();
        let result = match request.method.as_str() {
            method::THREAD_START => {
                let params = match parse_params::<ThreadStartParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                let client = match self.client.clone() {
                    Some(client) => client,
                    None => {
                        return AppServerResponse::failure(
                            request.id,
                            -32603,
                            "Initialized app-server connection is missing client identity",
                        )
                    }
                };
                self.host
                    .start_thread(params, client)
                    .await
                    .map(|thread| serde_json::to_value(ThreadStartResponse { thread }))
            }
            method::THREAD_LIST => {
                let params = match parse_params::<ThreadListParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .list_threads(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::THREAD_RESUME => {
                let params = match parse_params::<ThreadIdParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .resume_thread(params)
                    .await
                    .map(|thread| serde_json::to_value(ThreadStartResponse { thread }))
            }
            method::THREAD_READ => {
                let params = match parse_params::<ThreadIdParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .read_thread(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::THREAD_FORK => {
                let params = match parse_params::<ThreadForkParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                let client = match self.client.clone() {
                    Some(client) => client,
                    None => {
                        return AppServerResponse::failure(
                            request.id,
                            -32603,
                            "Initialized app-server connection is missing client identity",
                        )
                    }
                };
                self.host
                    .fork_thread(params, client)
                    .await
                    .map(|thread| serde_json::to_value(ThreadStartResponse { thread }))
            }
            method::THREAD_ARCHIVE => {
                let params = match parse_params::<ThreadIdParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .archive_thread(params)
                    .await
                    .map(|()| serde_json::to_value(AcknowledgedResponse { acknowledged: true }))
            }
            method::TURN_START => {
                let params = match parse_params::<TurnStartParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .start_turn(params)
                    .await
                    .map(|turn| serde_json::to_value(TurnStartResponse { turn }))
            }
            method::TURN_STEER => {
                let params = match parse_params::<TurnSteerParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .steer_turn(params)
                    .await
                    .map(|turn| serde_json::to_value(TurnStartResponse { turn }))
            }
            method::TURN_INTERRUPT => {
                let params = match parse_params::<TurnInterruptParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .interrupt_turn(params)
                    .await
                    .map(|()| serde_json::to_value(AcknowledgedResponse { acknowledged: true }))
            }
            method::APPROVAL_RESPOND => {
                let params = match parse_params::<ApprovalResponseParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .respond_to_approval(params)
                    .await
                    .map(|()| serde_json::to_value(AcknowledgedResponse { acknowledged: true }))
            }
            method::SHUTDOWN => Ok(serde_json::to_value(AcknowledgedResponse {
                acknowledged: true,
            })),
            _ => {
                return AppServerResponse::failure(
                    request.id,
                    -32601,
                    format!("Method not found: {}", request.method),
                )
            }
        };

        response_from_host_result(id, result)
    }

    fn initialize(&mut self, request: AppServerRequest) -> AppServerResponse {
        if self.initialized {
            return AppServerResponse::failure(
                request.id,
                -32003,
                "Client has already initialized this connection",
            );
        }

        let params = match parse_params::<InitializeParams>(&request) {
            Ok(params) => params,
            Err(response) => return *response,
        };

        self.initialized = true;
        self.client = Some(params.client_info);
        response_from_serializable(
            request.id,
            InitializeResponse {
                server_info: AppServerClientInfo {
                    name: SERVER_NAME.to_string(),
                    title: SERVER_TITLE.to_string(),
                    version: env!("CARGO_PKG_VERSION").to_string(),
                },
                protocol_version: DEVELOPER_SESSION_PROTOCOL_VERSION,
                capabilities: self.capabilities.clone(),
            },
        )
    }
}

/// Serve the typed developer-session protocol over newline-delimited JSON.
///
/// Request handling and host notifications share one writer, so every output
/// remains an atomic JSON line. The host must return from `start_turn` before
/// doing long-running work; streamed deltas then arrive through `subscribe`.
pub async fn serve_developer_session_io<R, W>(
    reader: R,
    mut writer: W,
    host: Arc<dyn DeveloperSessionHost>,
    capabilities: AppServerCapabilities,
) -> Result<()>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut processor = DeveloperSessionProcessor::new(host, capabilities);
    let mut notifications = processor.subscribe();
    let mut lines = BufReader::new(reader).lines();
    let mut initialized = false;

    loop {
        tokio::select! {
            line = lines.next_line() => {
                let Some(line) = line? else {
                    break;
                };
                if line.trim().is_empty() {
                    continue;
                }

                let request = match serde_json::from_str::<AppServerRequest>(&line) {
                    Ok(request) => request,
                    Err(error) => {
                        write_json_line(
                            &mut writer,
                            &AppServerResponse::failure(
                                serde_json::Value::Null,
                                -32700,
                                format!("Parse error: {error}"),
                            ),
                        )
                        .await?;
                        continue;
                    }
                };
                let is_initialize = request.method == method::INITIALIZE;
                let is_shutdown = request.method == method::SHUTDOWN;
                let response = processor.process(request).await;
                if is_initialize && response.error.is_none() {
                    initialized = true;
                }
                write_json_line(&mut writer, &response).await?;
                if is_shutdown && response.error.is_none() {
                    break;
                }
            }
            notification = notifications.recv(), if initialized => {
                match notification {
                    Ok(notification) => write_json_line(&mut writer, &notification).await?,
                    Err(broadcast::error::RecvError::Lagged(skipped)) => {
                        let warning = AppServerNotification::new(
                            "server/warning",
                            serde_json::json!({
                                "code": "notification_lag",
                                "skipped": skipped,
                            }),
                        )?;
                        write_json_line(&mut writer, &warning).await?;
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }

    writer.shutdown().await?;
    Ok(())
}

/// Run the typed developer-session app-server on process stdio.
pub async fn run_developer_session_stdio(
    host: Arc<dyn DeveloperSessionHost>,
    capabilities: AppServerCapabilities,
) -> Result<()> {
    serve_developer_session_io(tokio::io::stdin(), tokio::io::stdout(), host, capabilities).await
}

async fn write_json_line(
    writer: &mut (impl AsyncWrite + Unpin),
    value: &impl Serialize,
) -> Result<()> {
    let bytes = serde_json::to_vec(value)?;
    writer.write_all(&bytes).await?;
    writer.write_all(b"\n").await?;
    writer.flush().await?;
    Ok(())
}

fn parse_params<T: DeserializeOwned>(
    request: &AppServerRequest,
) -> Result<T, Box<AppServerResponse>> {
    request.parse_params().map_err(|error| {
        Box::new(AppServerResponse::failure(
            request.id.clone(),
            -32602,
            format!("Invalid parameters for {}: {error}", request.method),
        ))
    })
}

fn response_from_serializable(id: serde_json::Value, result: impl Serialize) -> AppServerResponse {
    match AppServerResponse::success(id.clone(), result) {
        Ok(response) => response,
        Err(error) => AppServerResponse::failure(
            id,
            -32603,
            format!("Failed to serialize app-server response: {error}"),
        ),
    }
}

fn response_from_host_result(
    id: serde_json::Value,
    result: Result<Result<serde_json::Value, serde_json::Error>, DeveloperSessionHostError>,
) -> AppServerResponse {
    match result {
        Ok(Ok(value)) => response_from_serializable(id, value),
        Ok(Err(error)) => AppServerResponse::failure(
            id,
            -32603,
            format!("Failed to serialize app-server response: {error}"),
        ),
        Err(error) => AppServerResponse::failure(id, error.code(), error.message()),
    }
}
