use agiworkforce_protocol::developer_session::{
    method, AccountLoginResponse, AccountLoginWaitParams, AccountLoginWaitResponse,
    AccountStatusParams, AccountStatusResponse, AccountTokenResponse, AcknowledgedResponse,
    AppServerCapabilities, AppServerClientInfo, AppServerNotification, AppServerRequest,
    AppServerResponse, ApprovalResponseParams, ContextInstructionsParams,
    ContextInstructionsResponse, HookListResponse, InitializeParams, InitializeResponse,
    LocalModelListResponse, McpLoginParams, McpLoginResponse, McpServerListResponse,
    ModelListParams, PluginListResponse, PluginSetEnabledParams, SettingsReadResponse,
    SettingsWriteParams, SkillConsentParams, SkillConsentResponse, SkillListResponse,
    SkillSetEnabledParams, SlashCommandListResponse, SlashCommandRunParams,
    SlashCommandRunResponse, ThreadForkParams, ThreadIdParams, ThreadListParams,
    ThreadListResponse, ThreadReadResponse, ThreadStartParams, ThreadStartResponse, ThreadSummary,
    TurnInterruptParams, TurnStartParams, TurnStartResponse, TurnSteerParams, TurnSummary,
    LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION, SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS,
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
    /// Version of the executable that owns this host. The transport crate has
    /// its own package version, but clients need the shipped runtime version
    /// when deciding whether the installed CLI is compatible.
    fn server_version(&self) -> &'static str {
        env!("CARGO_PKG_VERSION")
    }

    async fn start_thread(
        &self,
        params: ThreadStartParams,
        client: AppServerClientInfo,
    ) -> Result<ThreadSummary, DeveloperSessionHostError>;

    async fn list_threads(
        &self,
        params: ThreadListParams,
    ) -> Result<ThreadListResponse, DeveloperSessionHostError>;

    /// Models this host knows about, and whether it can reach them.
    ///
    /// `params.refresh` asks for a fresh answer rather than what the session
    /// already resolved: reachability costs a probe per local runtime and a
    /// credential lookup per route, so it is not recomputed per request.
    async fn list_local_models(
        &self,
        params: ModelListParams,
    ) -> Result<LocalModelListResponse, DeveloperSessionHostError>;

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

    /// Report the signed-in account from the runtime's own credential store.
    ///
    /// Defaults exist for every v8 surface so an embedder that owns none of
    /// them answers "unavailable" rather than silently reporting a signed-out
    /// account or an empty catalog.
    async fn account_status(
        &self,
        _params: AccountStatusParams,
    ) -> Result<AccountStatusResponse, DeveloperSessionHostError> {
        Err(unsupported("account/status"))
    }

    async fn account_login(&self) -> Result<AccountLoginResponse, DeveloperSessionHostError> {
        Err(unsupported("account/login"))
    }

    async fn account_login_wait(
        &self,
        _params: AccountLoginWaitParams,
    ) -> Result<AccountLoginWaitResponse, DeveloperSessionHostError> {
        Err(unsupported("account/login/wait"))
    }

    async fn account_logout(&self) -> Result<(), DeveloperSessionHostError> {
        Err(unsupported("account/logout"))
    }

    /// Mint a bearer token for the hosted API from the runtime's credential.
    ///
    /// The transport refuses this on a connection that did not prove it holds
    /// the loopback app-server token before the host is ever consulted.
    async fn account_token(&self) -> Result<AccountTokenResponse, DeveloperSessionHostError> {
        Err(unsupported("account/token"))
    }

    async fn context_instructions(
        &self,
        _params: ContextInstructionsParams,
    ) -> Result<ContextInstructionsResponse, DeveloperSessionHostError> {
        Err(unsupported("context/instructions"))
    }

    async fn list_skills(&self) -> Result<SkillListResponse, DeveloperSessionHostError> {
        Err(unsupported("skills/list"))
    }

    async fn set_skill_enabled(
        &self,
        _params: SkillSetEnabledParams,
    ) -> Result<SkillListResponse, DeveloperSessionHostError> {
        Err(unsupported("skills/setEnabled"))
    }

    async fn set_skill_consent(
        &self,
        _params: SkillConsentParams,
    ) -> Result<SkillConsentResponse, DeveloperSessionHostError> {
        Err(unsupported("skills/consent"))
    }

    async fn list_plugins(&self) -> Result<PluginListResponse, DeveloperSessionHostError> {
        Err(unsupported("plugins/list"))
    }

    async fn set_plugin_enabled(
        &self,
        _params: PluginSetEnabledParams,
    ) -> Result<PluginListResponse, DeveloperSessionHostError> {
        Err(unsupported("plugins/setEnabled"))
    }

    async fn list_mcp_servers(&self) -> Result<McpServerListResponse, DeveloperSessionHostError> {
        Err(unsupported("mcp/list"))
    }

    async fn login_mcp_server(
        &self,
        _params: McpLoginParams,
    ) -> Result<McpLoginResponse, DeveloperSessionHostError> {
        Err(unsupported("mcp/login"))
    }

    async fn list_hooks(&self) -> Result<HookListResponse, DeveloperSessionHostError> {
        Err(unsupported("hooks/list"))
    }

    async fn read_settings(&self) -> Result<SettingsReadResponse, DeveloperSessionHostError> {
        Err(unsupported("settings/read"))
    }

    async fn write_settings(
        &self,
        _params: SettingsWriteParams,
    ) -> Result<SettingsReadResponse, DeveloperSessionHostError> {
        Err(unsupported("settings/write"))
    }

    async fn list_commands(&self) -> Result<SlashCommandListResponse, DeveloperSessionHostError> {
        Err(unsupported("commands/list"))
    }

    async fn run_command(
        &self,
        _params: SlashCommandRunParams,
    ) -> Result<SlashCommandRunResponse, DeveloperSessionHostError> {
        Err(unsupported("commands/run"))
    }

    /// Stop accepting work, cancel every active host operation, and wait until
    /// owned resources are quiescent. A transport must not acknowledge
    /// `shutdown` before this resolves successfully.
    async fn shutdown(&self) -> Result<(), DeveloperSessionHostError>;

    fn subscribe(&self) -> broadcast::Receiver<AppServerNotification>;
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct ShutdownParams {}

#[derive(serde::Deserialize, Default)]
#[serde(deny_unknown_fields)]
struct NoParams {}

fn unsupported(method: &str) -> DeveloperSessionHostError {
    DeveloperSessionHostError::unavailable(format!(
        "This app-server host does not implement {method}"
    ))
}

/// Whether a connection proved it may mint account credentials.
///
/// Stdio is the process owner's own pipe. A WebSocket connection qualifies
/// only once the upgrade carried the loopback app-server token, which the
/// transport checks before any frame is read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeveloperConnectionTrust {
    LoopbackOwner,
    Untrusted,
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
    trust: DeveloperConnectionTrust,
    negotiated_version: u32,
}

impl DeveloperSessionProcessor {
    pub fn new(host: Arc<dyn DeveloperSessionHost>, capabilities: AppServerCapabilities) -> Self {
        Self::new_with_trust(host, capabilities, DeveloperConnectionTrust::LoopbackOwner)
    }

    /// Build a processor for a connection whose authentication is known.
    ///
    /// Only a connection that proved ownership out of band, process stdio or a
    /// WebSocket upgrade carrying the token in a header, may mint account
    /// credentials. A URL query token is logged by browsers and proxies, so a
    /// connection authenticated that way is `Untrusted` for that one method.
    pub fn new_with_trust(
        host: Arc<dyn DeveloperSessionHost>,
        capabilities: AppServerCapabilities,
        trust: DeveloperConnectionTrust,
    ) -> Self {
        Self {
            host,
            capabilities,
            initialized: false,
            client: None,
            trust,
            negotiated_version: LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION,
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<AppServerNotification> {
        self.host.subscribe()
    }

    /// Wire version agreed during `initialize`. Before the handshake this is
    /// the legacy version, which is what a client that states none receives.
    pub fn negotiated_protocol_version(&self) -> u32 {
        self.negotiated_version
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
                        );
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
            method::MODEL_LIST => {
                let params = match parse_optional_params::<ModelListParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .list_local_models(params)
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
                        );
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
            method::ACCOUNT_STATUS => {
                let params = match parse_optional_params::<AccountStatusParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .account_status(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::ACCOUNT_LOGIN => {
                if let Err(response) = parse_optional_params::<NoParams>(&request) {
                    return *response;
                }
                self.host.account_login().await.map(serde_json::to_value)
            }
            method::ACCOUNT_LOGIN_WAIT => {
                let params = match parse_params::<AccountLoginWaitParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .account_login_wait(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::ACCOUNT_LOGOUT => {
                if let Err(response) = parse_optional_params::<NoParams>(&request) {
                    return *response;
                }
                self.host
                    .account_logout()
                    .await
                    .map(|()| serde_json::to_value(AcknowledgedResponse { acknowledged: true }))
            }
            method::ACCOUNT_TOKEN => {
                if self.trust != DeveloperConnectionTrust::LoopbackOwner {
                    return AppServerResponse::failure(
                        request.id,
                        -32006,
                        "account/token is refused on this connection: mint a credential only over process stdio or a WebSocket whose upgrade carried the app-server token in a header",
                    );
                }
                if let Err(response) = parse_optional_params::<NoParams>(&request) {
                    return *response;
                }
                self.host.account_token().await.map(serde_json::to_value)
            }
            method::CONTEXT_INSTRUCTIONS => {
                let params = match parse_optional_params::<ContextInstructionsParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .context_instructions(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::SKILLS_LIST => {
                if let Err(response) = parse_optional_params::<NoParams>(&request) {
                    return *response;
                }
                self.host.list_skills().await.map(serde_json::to_value)
            }
            method::SKILLS_SET_ENABLED => {
                let params = match parse_params::<SkillSetEnabledParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .set_skill_enabled(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::SKILLS_CONSENT => {
                let params = match parse_params::<SkillConsentParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .set_skill_consent(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::PLUGINS_LIST => {
                if let Err(response) = parse_optional_params::<NoParams>(&request) {
                    return *response;
                }
                self.host.list_plugins().await.map(serde_json::to_value)
            }
            method::PLUGINS_SET_ENABLED => {
                let params = match parse_params::<PluginSetEnabledParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .set_plugin_enabled(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::MCP_LIST => {
                if let Err(response) = parse_optional_params::<NoParams>(&request) {
                    return *response;
                }
                self.host.list_mcp_servers().await.map(serde_json::to_value)
            }
            method::MCP_LOGIN => {
                let params = match parse_params::<McpLoginParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .login_mcp_server(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::HOOKS_LIST => {
                if let Err(response) = parse_optional_params::<NoParams>(&request) {
                    return *response;
                }
                self.host.list_hooks().await.map(serde_json::to_value)
            }
            method::SETTINGS_READ => {
                if let Err(response) = parse_optional_params::<NoParams>(&request) {
                    return *response;
                }
                self.host.read_settings().await.map(serde_json::to_value)
            }
            method::SETTINGS_WRITE => {
                let params = match parse_params::<SettingsWriteParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .write_settings(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::COMMANDS_LIST => {
                if let Err(response) = parse_optional_params::<NoParams>(&request) {
                    return *response;
                }
                self.host.list_commands().await.map(serde_json::to_value)
            }
            method::COMMANDS_RUN => {
                let params = match parse_params::<SlashCommandRunParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .run_command(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::SHUTDOWN => {
                if let Err(response) = parse_params::<ShutdownParams>(&request) {
                    return *response;
                }
                self.host
                    .shutdown()
                    .await
                    .map(|()| serde_json::to_value(AcknowledgedResponse { acknowledged: true }))
            }
            _ => {
                return AppServerResponse::failure(
                    request.id,
                    -32601,
                    format!("Method not found: {}", request.method),
                );
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

        let negotiated = match params.protocol_version {
            None => LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION,
            Some(requested)
                if SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS.contains(&requested) =>
            {
                requested
            }
            Some(requested) => {
                let supported = SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS
                    .iter()
                    .map(u32::to_string)
                    .collect::<Vec<_>>()
                    .join(", ");
                return AppServerResponse::failure(
                    request.id,
                    -32005,
                    format!(
                        "Client requested developer-session protocol {requested}; this server speaks {supported}"
                    ),
                );
            }
        };

        self.initialized = true;
        self.negotiated_version = negotiated;
        self.client = Some(params.client_info);
        response_from_serializable(
            request.id,
            InitializeResponse {
                server_info: AppServerClientInfo {
                    name: SERVER_NAME.to_string(),
                    title: SERVER_TITLE.to_string(),
                    version: self.host.server_version().to_string(),
                },
                protocol_version: negotiated,
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
    let mut host_shutdown = false;

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
                    host_shutdown = true;
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

    if !host_shutdown {
        processor
            .host
            .shutdown()
            .await
            .map_err(anyhow::Error::new)?;
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

/// Parse params for a method whose params object is entirely optional, so a
/// client may omit the field rather than sending `{}`.
fn parse_optional_params<T: DeserializeOwned + Default>(
    request: &AppServerRequest,
) -> Result<T, Box<AppServerResponse>> {
    if request.params.is_null() {
        return Ok(T::default());
    }
    parse_params(request)
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
