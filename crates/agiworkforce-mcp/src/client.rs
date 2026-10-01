use anyhow::{Context, Result, anyhow, bail};
use serde_json::{Map, Value, json};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

use agiworkforce_protocol::mcp::{CallToolResult, Tool};

use crate::cache::Events;
use crate::config::{McpTimeouts, TransportConfig};
use crate::elicitation::ElicitationRequest;
use crate::error::{McpError, ProtocolMismatch, TransportFault, fault};
use crate::hooks::ClientHooks;
use crate::jsonrpc::{into_result, notification_frame, peer_error, request_frame};
use crate::notification::McpNotification;
use crate::param_headers::{self, ParamHeader};
use crate::protocol::{
    HEADER_METHOD, HEADER_MISMATCH, HEADER_NAME, HEADER_PROTOCOL_VERSION, Implementation,
    LEGACY_PROTOCOL_VERSIONS, META_CLIENT_CAPABILITIES, META_CLIENT_INFO, META_PROTOCOL_VERSION,
    META_SERVER_INFO, MODERN_PROTOCOL_VERSION, RESULT_COMPLETE, RESULT_INPUT_REQUIRED,
    UNSUPPORTED_PROTOCOL_VERSION, encode_header_value, is_modern_version, supported_versions,
};
use crate::resources::{
    McpResource, McpResourceContents, McpResourceTemplate, parse_resource_contents,
    parse_resource_templates, parse_resources,
};
use crate::transport::http::{Exchange, HttpConn};
use crate::transport::sse::SseConn;
use crate::transport::stdio::{StderrBuffer, StdioConn};

const INPUT_REQUIRED_METHODS: &[&str] = &["tools/call", "prompts/get", "resources/read"];
const MAX_INPUT_ROUNDS: usize = 10;
const STATE_ONLY_PACING: Duration = Duration::from_millis(250);
const STDIO_SUBSCRIPTION_ID: &str = "subscription-1";

#[derive(Debug, Clone, Default)]
pub struct NegotiatedServer {
    pub protocol_version: String,
    pub server_info: Option<Implementation>,
    pub capabilities: Value,
    pub instructions: Option<String>,
}

enum Conn {
    Stdio(StdioConn),
    Http(HttpConn),
    Sse(SseConn),
}

enum Discovery {
    Modern(Value),
    Legacy,
    Silent,
}

enum Subscription {
    Stdio { id: Value, waiter: JoinHandle<()> },
    Http(JoinHandle<()>),
}

pub struct McpClient {
    server_name: String,
    transport_config: TransportConfig,
    conn: Conn,
    negotiated: NegotiatedServer,
    request_id: u64,
    timeouts: McpTimeouts,
    stderr_buf: Arc<StderrBuffer>,
    hooks: ClientHooks,
    events: Arc<Events>,
    notif_rx: Option<mpsc::Receiver<McpNotification>>,
    tool_headers: HashMap<String, Vec<ParamHeader>>,
    subscription: Option<Subscription>,
}

impl McpClient {
    pub async fn connect(
        server_name: &str,
        config: TransportConfig,
        timeouts: McpTimeouts,
        hooks: ClientHooks,
    ) -> Result<Self, McpError> {
        Self::connect_inner(server_name, config, timeouts, hooks)
            .await
            .map_err(McpError::from)
    }

    async fn connect_inner(
        server_name: &str,
        config: TransportConfig,
        timeouts: McpTimeouts,
        hooks: ClientHooks,
    ) -> Result<Self> {
        let (notif_tx, notif_rx) = mpsc::channel::<McpNotification>(128);
        let events = Arc::new(Events::new(notif_tx, &timeouts));
        let stderr_buf = Arc::new(StderrBuffer::new(&timeouts));
        let conn = open_conn(
            server_name,
            &config,
            &timeouts,
            &hooks,
            &events,
            &stderr_buf,
        )
        .await?;

        let mut client = Self {
            server_name: server_name.to_string(),
            transport_config: config,
            conn,
            negotiated: NegotiatedServer::default(),
            request_id: 0,
            timeouts,
            stderr_buf,
            hooks,
            events,
            notif_rx: Some(notif_rx),
            tool_headers: HashMap::new(),
            subscription: None,
        };
        if let Err(error) = client.negotiate().await {
            return Err(client.with_stderr(error));
        }
        client.hooks.log(&format!(
            "[{server_name}] MCP connected via {} (protocol {})",
            client.transport_kind(),
            client.negotiated.protocol_version
        ));
        Ok(client)
    }

    pub fn server(&self) -> &NegotiatedServer {
        &self.negotiated
    }

    pub async fn request(
        &mut self,
        method: &str,
        params: Option<Value>,
        timeout: Duration,
    ) -> Result<Option<Value>, McpError> {
        self.call(method, params, timeout, Self::is_connection_lost)
            .await
            .map_err(McpError::from)
    }

    pub async fn list_tools(&mut self) -> Result<Vec<Tool>, McpError> {
        let timeout = self.timeouts.list_tools;
        let response = self.request("tools/list", None, timeout).await?;

        let tools_json = response
            .and_then(|r| r.get("tools").cloned())
            .and_then(|t| t.as_array().cloned())
            .unwrap_or_default();

        let mut tools = Vec::with_capacity(tools_json.len());
        for tool in tools_json {
            let parsed = Tool::from_mcp_value(tool).map_err(|e| {
                McpError::from(anyhow!("[{}] invalid MCP tool: {e}", self.server_name))
            })?;
            tools.push(parsed);
        }
        Ok(tools)
    }

    pub async fn list_resources(&mut self) -> Result<Vec<McpResource>, McpError> {
        let timeout = self.timeouts.list_tools;
        let response = self.request("resources/list", None, timeout).await?;
        Ok(parse_resources(response))
    }

    pub async fn list_resource_templates(&mut self) -> Result<Vec<McpResourceTemplate>, McpError> {
        let timeout = self.timeouts.list_tools;
        let response = self
            .request("resources/templates/list", None, timeout)
            .await?;
        Ok(parse_resource_templates(response))
    }

    pub async fn read_resource(&mut self, uri: &str) -> Result<Vec<McpResourceContents>, McpError> {
        let timeout = self.timeouts.list_tools;
        let response = self
            .request("resources/read", Some(json!({ "uri": uri })), timeout)
            .await?;
        Ok(parse_resource_contents(response))
    }

    pub async fn call_tool_value(
        &mut self,
        tool_name: &str,
        arguments: Value,
    ) -> Result<Option<Value>, McpError> {
        let timeout = self.timeouts.call_tool;
        let params = json!({ "name": tool_name, "arguments": arguments });
        self.call(
            "tools/call",
            Some(params),
            timeout,
            Self::is_tool_call_resendable,
        )
        .await
        .map_err(McpError::from)
    }

    pub async fn call_tool(
        &mut self,
        tool_name: &str,
        arguments: Value,
    ) -> Result<CallToolResult, McpError> {
        let raw = self
            .call_tool_value(tool_name, arguments)
            .await?
            .unwrap_or(Value::Null);
        serde_json::from_value::<CallToolResult>(raw).map_err(|e| {
            McpError::from(anyhow!(
                "[{}] tools/call result was not a CallToolResult: {e}",
                self.server_name
            ))
        })
    }

    pub fn notifications(&mut self) -> Option<mpsc::Receiver<McpNotification>> {
        self.notif_rx.take()
    }

    pub fn transport_alive(&mut self) -> bool {
        match &mut self.conn {
            Conn::Stdio(stdio) => stdio.is_alive(),
            Conn::Http(_) | Conn::Sse(_) => true,
        }
    }

    pub fn drain_stderr(&self) -> Vec<String> {
        self.stderr_buf.drain()
    }

    pub async fn is_alive(&mut self) -> bool {
        if !self.transport_alive() {
            return false;
        }
        let timeout = self.timeouts.health_check;
        if self.is_modern() {
            self.send_modern("server/discover", json!({}), timeout)
                .await
                .is_ok()
        } else {
            self.send_legacy("tools/list", None, timeout).await.is_ok()
        }
    }

    pub async fn shutdown(&mut self) -> Result<(), McpError> {
        self.close().await;
        Ok(())
    }

    fn is_modern(&self) -> bool {
        is_modern_version(&self.negotiated.protocol_version)
    }

    fn transport_kind(&self) -> &'static str {
        match self.conn {
            Conn::Stdio(_) => "stdio",
            Conn::Http(_) => "http",
            Conn::Sse(_) => "sse",
        }
    }

    fn auth_epoch(&self) -> u64 {
        match &self.conn {
            Conn::Http(http) => http.auth_epoch(),
            Conn::Stdio(_) | Conn::Sse(_) => 0,
        }
    }

    fn with_stderr(&self, error: anyhow::Error) -> anyhow::Error {
        let lines = self.stderr_buf.snapshot().join("\n");
        if lines.is_empty() {
            error
        } else {
            error.context(format!("[{}] server stderr:\n{lines}", self.server_name))
        }
    }

    async fn negotiate(&mut self) -> Result<()> {
        let started = Instant::now();
        let budget = self.timeouts.initialize;
        let remaining = || budget.saturating_sub(started.elapsed());
        let stdio = matches!(self.conn, Conn::Stdio(_));
        let discovery = match self.conn {
            Conn::Sse(_) => Discovery::Legacy,
            Conn::Stdio(_) => self.probe(budget / 2).await?,
            Conn::Http(_) => self.probe(budget).await?,
        };
        match discovery {
            Discovery::Modern(discover) => {
                self.adopt_modern(discover).await;
                Ok(())
            }
            Discovery::Legacy => {
                let timeout = if stdio { remaining() } else { budget };
                self.fall_back_to_legacy(timeout).await
            }
            Discovery::Silent => match self.initialize_legacy(remaining()).await {
                Err(error) if peer_error(&error).is_some() && !remaining().is_zero() => {
                    match self.probe(remaining()).await? {
                        Discovery::Modern(discover) => {
                            self.adopt_modern(discover).await;
                            Ok(())
                        }
                        Discovery::Legacy | Discovery::Silent => Err(error),
                    }
                }
                outcome => outcome,
            },
        }
    }

    async fn probe(&mut self, timeout: Duration) -> Result<Discovery> {
        match self
            .send_modern_once("server/discover", json!({}), timeout)
            .await
        {
            Ok(Some(result)) => self.classify_discover(result),
            Ok(None) => Ok(Discovery::Legacy),
            Err(error) => self.classify_probe_failure(error),
        }
    }

    fn classify_discover(&self, result: Value) -> Result<Discovery> {
        let Some(listed) = result.get("supportedVersions").and_then(Value::as_array) else {
            return Ok(Discovery::Legacy);
        };
        if !result.get("capabilities").is_some_and(Value::is_object) {
            return Ok(Discovery::Legacy);
        }
        let versions: Vec<String> = listed
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_string)
            .collect();
        if versions
            .iter()
            .any(|version| version == MODERN_PROTOCOL_VERSION)
        {
            return Ok(Discovery::Modern(result));
        }
        if versions.iter().any(|version| is_modern_version(version)) {
            return Err(self.unsupported_revision(&versions));
        }
        Ok(Discovery::Legacy)
    }

    fn classify_probe_failure(&self, error: anyhow::Error) -> Result<Discovery> {
        if let Some(rpc) = peer_error(&error) {
            return match rpc.supported_versions() {
                Some(versions) if versions.iter().any(|version| is_modern_version(version)) => {
                    Err(self.unsupported_revision(&versions))
                }
                _ => Ok(Discovery::Legacy),
            };
        }
        let stdio = matches!(self.conn, Conn::Stdio(_));
        match fault(&error) {
            Some(TransportFault::HttpStatus { status, .. })
                if (400..500).contains(status) && !matches!(status, 401 | 403) =>
            {
                Ok(Discovery::Legacy)
            }
            Some(TransportFault::Closed { .. }) if stdio => Ok(Discovery::Legacy),
            Some(TransportFault::Timeout { .. }) if stdio => Ok(Discovery::Silent),
            _ => Err(error),
        }
    }

    fn unsupported_revision(&self, versions: &[String]) -> anyhow::Error {
        ProtocolMismatch {
            server: self.server_name.clone(),
            detail: format!(
                "server supports MCP {}, which this client does not implement (supported: {})",
                versions.join(", "),
                supported_versions().join(", ")
            ),
        }
        .into()
    }

    async fn fall_back_to_legacy(&mut self, timeout: Duration) -> Result<()> {
        if let Conn::Stdio(stdio) = &mut self.conn
            && !stdio.is_alive()
        {
            self.reopen().await?;
        }
        let first = match self.initialize_legacy(timeout).await {
            Ok(()) => return Ok(()),
            Err(error) => error,
        };
        if !self.should_try_http_sse(&first) {
            return Err(first);
        }
        let TransportConfig::Http { url, headers, .. } = &self.transport_config else {
            return Err(first);
        };
        let sse = match SseConn::connect(
            &self.server_name,
            url,
            headers,
            &self.timeouts,
            Arc::clone(&self.events),
            self.hooks.clone(),
        )
        .await
        {
            Ok(sse) => sse,
            Err(_) => return Err(first),
        };
        self.conn = Conn::Sse(sse);
        self.initialize_legacy(timeout).await
    }

    fn should_try_http_sse(&self, error: &anyhow::Error) -> bool {
        matches!(self.conn, Conn::Http(_))
            && peer_error(error).is_none()
            && matches!(
                fault(error),
                Some(TransportFault::HttpStatus {
                    status: 400 | 404 | 405,
                    ..
                })
            )
    }

    async fn initialize_legacy(&mut self, timeout: Duration) -> Result<()> {
        self.negotiated = NegotiatedServer::default();
        let params = json!({
            "protocolVersion": LEGACY_PROTOCOL_VERSIONS[0],
            "capabilities": self.client_capabilities(),
            "clientInfo": self.hooks.client_info,
        });
        let result = self
            .send_legacy("initialize", Some(params), timeout)
            .await?
            .ok_or_else(|| anyhow!("[{}] initialize returned no result", self.server_name))?;
        let version = result
            .get("protocolVersion")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        if !LEGACY_PROTOCOL_VERSIONS.contains(&version.as_str()) {
            return Err(ProtocolMismatch {
                server: self.server_name.clone(),
                detail: format!(
                    "server selected MCP protocol revision '{version}', which this client does not implement (supported: {})",
                    supported_versions().join(", ")
                ),
            }
            .into());
        }
        self.negotiated = NegotiatedServer {
            protocol_version: version,
            server_info: result
                .get("serverInfo")
                .cloned()
                .and_then(|info| serde_json::from_value(info).ok()),
            capabilities: result
                .get("capabilities")
                .cloned()
                .unwrap_or_else(|| json!({})),
            instructions: result
                .get("instructions")
                .and_then(Value::as_str)
                .map(str::to_string),
        };
        if let Conn::Stdio(stdio) = &self.conn {
            stdio.answer_server_requests();
        }
        self.send_notification("notifications/initialized").await
    }

    async fn adopt_modern(&mut self, discover: Value) {
        self.negotiated = NegotiatedServer {
            protocol_version: MODERN_PROTOCOL_VERSION.to_string(),
            server_info: discover
                .get("_meta")
                .and_then(|meta| meta.get(META_SERVER_INFO))
                .cloned()
                .and_then(|info| serde_json::from_value(info).ok()),
            capabilities: discover
                .get("capabilities")
                .cloned()
                .unwrap_or_else(|| json!({})),
            instructions: discover
                .get("instructions")
                .and_then(Value::as_str)
                .map(str::to_string),
        };
        if let Some(key) = Events::cache_key("server/discover", None) {
            self.events.store(key, &discover, self.auth_epoch());
        }
        self.open_subscription().await;
    }

    fn subscription_filter(&self) -> Map<String, Value> {
        let capabilities = &self.negotiated.capabilities;
        let announces = |capability: &str| {
            capabilities
                .get(capability)
                .and_then(|entry| entry.get("listChanged"))
                .and_then(Value::as_bool)
                .unwrap_or(false)
        };
        let mut filter = Map::new();
        for (capability, flag) in [
            ("tools", "toolsListChanged"),
            ("prompts", "promptsListChanged"),
            ("resources", "resourcesListChanged"),
        ] {
            if announces(capability) {
                filter.insert(flag.to_string(), json!(true));
            }
        }
        filter
    }

    async fn open_subscription(&mut self) {
        let filter = self.subscription_filter();
        if filter.is_empty() {
            return;
        }
        let params = with_meta(
            json!({ "notifications": Value::Object(filter) }),
            self.request_meta(),
        );
        match &mut self.conn {
            Conn::Stdio(stdio) => {
                let id = json!(STDIO_SUBSCRIPTION_ID);
                let frame = request_frame(&id, "subscriptions/listen", Some(params));
                match stdio.open(&id, &frame).await {
                    Ok(closed) => {
                        let server = self.server_name.clone();
                        let waiter = tokio::spawn(async move {
                            if closed.await.is_ok() {
                                tracing::info!(
                                    "[{server}] server ended the change-notification subscription"
                                );
                            }
                        });
                        self.subscription = Some(Subscription::Stdio { id, waiter });
                    }
                    Err(error) => tracing::warn!(
                        "[{}] could not subscribe to change notifications: {error:#}",
                        self.server_name
                    ),
                }
            }
            Conn::Http(http) => {
                let listener = http.listener();
                self.subscription = Some(Subscription::Http(tokio::spawn(
                    listener.run(MODERN_PROTOCOL_VERSION.to_string(), params),
                )));
            }
            Conn::Sse(_) => {}
        }
    }

    async fn stop_subscription(&mut self) {
        match self.subscription.take() {
            Some(Subscription::Stdio { id, waiter }) => {
                waiter.abort();
                if let Conn::Stdio(stdio) = &self.conn {
                    let _ = stdio.cancel(&id, "client closed the subscription").await;
                }
            }
            Some(Subscription::Http(task)) => task.abort(),
            None => {}
        }
    }

    fn client_capabilities(&self) -> Value {
        let mut elicitation = Map::new();
        for mode in self.hooks.elicitation.modes() {
            elicitation.insert(mode.as_str().to_string(), json!({}));
        }
        if elicitation.is_empty() {
            json!({})
        } else {
            json!({ "elicitation": elicitation })
        }
    }

    fn request_meta(&self) -> Value {
        json!({
            META_PROTOCOL_VERSION: MODERN_PROTOCOL_VERSION,
            META_CLIENT_INFO: self.hooks.client_info,
            META_CLIENT_CAPABILITIES: self.client_capabilities(),
        })
    }

    fn modern_headers(&self, method: &str, params: &Value) -> Vec<(String, String)> {
        if !matches!(self.conn, Conn::Http(_)) {
            return Vec::new();
        }
        let mut headers = vec![
            (
                HEADER_PROTOCOL_VERSION.to_string(),
                MODERN_PROTOCOL_VERSION.to_string(),
            ),
            (HEADER_METHOD.to_string(), method.to_string()),
        ];
        let name = match method {
            "tools/call" | "prompts/get" => params.get("name"),
            "resources/read" => params.get("uri"),
            _ => None,
        }
        .and_then(Value::as_str);
        if let Some(name) = name {
            headers.push((HEADER_NAME.to_string(), encode_header_value(name)));
        }
        if method == "tools/call"
            && let Some(declarations) = name.and_then(|tool| self.tool_headers.get(tool))
        {
            headers.extend(param_headers::header_values(
                declarations,
                params.get("arguments").unwrap_or(&Value::Null),
            ));
        }
        headers
    }

    fn legacy_headers(&self) -> Vec<(String, String)> {
        match &self.conn {
            Conn::Http(_) if !self.negotiated.protocol_version.is_empty() => vec![(
                HEADER_PROTOCOL_VERSION.to_string(),
                self.negotiated.protocol_version.clone(),
            )],
            _ => Vec::new(),
        }
    }

    async fn call(
        &mut self,
        method: &str,
        params: Option<Value>,
        timeout: Duration,
        reconnect_on: fn(&anyhow::Error) -> bool,
    ) -> Result<Option<Value>> {
        match self.dispatch(method, params.clone(), timeout).await {
            Err(error) if reconnect_on(&error) => {
                eprintln!(
                    "[{}] Connection lost, attempting reconnect...",
                    self.server_name
                );
                self.reconnect().await.with_context(|| {
                    format!(
                        "[{}] Failed to reconnect after connection error",
                        self.server_name
                    )
                })?;
                self.dispatch(method, params, timeout).await
            }
            outcome => outcome,
        }
    }

    async fn dispatch(
        &mut self,
        method: &str,
        params: Option<Value>,
        timeout: Duration,
    ) -> Result<Option<Value>> {
        if !self.is_modern() {
            return self.send_legacy(method, params, timeout).await;
        }
        let key = Events::cache_key(method, params.as_ref());
        if let Some(key) = &key
            && let Some(hit) = self.events.cached(key, self.auth_epoch())
        {
            return Ok(Some(hit));
        }
        let (result, rounds) = self
            .exchange_modern(method, params.unwrap_or_else(|| json!({})), timeout)
            .await?;
        if let (Some(key), Some(value), 0) = (key, result.as_ref(), rounds) {
            self.events.store(key, value, self.auth_epoch());
        }
        Ok(result)
    }

    async fn exchange_modern(
        &mut self,
        method: &str,
        params: Value,
        timeout: Duration,
    ) -> Result<(Option<Value>, usize)> {
        let mut retry: Option<(Map<String, Value>, Option<String>)> = None;
        let mut rounds = 0usize;
        let mut refreshed_headers = false;
        let mut renegotiated = false;
        loop {
            let mut attempt = params.clone();
            if let Some((responses, state)) = &retry
                && let Some(object) = attempt.as_object_mut()
            {
                if !responses.is_empty() {
                    object.insert(
                        "inputResponses".to_string(),
                        Value::Object(responses.clone()),
                    );
                }
                if let Some(state) = state {
                    object.insert("requestState".to_string(), json!(state));
                }
            }
            let outcome = match self.send_modern(method, attempt, timeout).await {
                Ok(outcome) => outcome,
                Err(error) => {
                    let code = peer_error(&error).map(|rpc| rpc.code);
                    if code == Some(HEADER_MISMATCH) && method == "tools/call" && !refreshed_headers
                    {
                        refreshed_headers = true;
                        self.refresh_tool_headers(timeout).await?;
                        continue;
                    }
                    if code == Some(UNSUPPORTED_PROTOCOL_VERSION) && !renegotiated {
                        renegotiated = true;
                        self.renegotiate().await?;
                        if !self.is_modern() {
                            let result = self.send_legacy(method, Some(params), timeout).await?;
                            return Ok((result, rounds));
                        }
                        continue;
                    }
                    return Err(error);
                }
            };
            let Some(mut result) = outcome else {
                return Ok((None, rounds));
            };
            let result_type = result
                .get("resultType")
                .and_then(Value::as_str)
                .unwrap_or(RESULT_COMPLETE)
                .to_string();
            match result_type.as_str() {
                RESULT_COMPLETE => {
                    if method == "tools/list" {
                        self.record_tool_headers(&mut result);
                    }
                    return Ok((Some(result), rounds));
                }
                RESULT_INPUT_REQUIRED => {
                    if !INPUT_REQUIRED_METHODS.contains(&method) {
                        bail!(
                            "[{}] server answered '{method}' with input_required, which only tools/call, prompts/get and resources/read may return",
                            self.server_name
                        );
                    }
                    rounds += 1;
                    if rounds > MAX_INPUT_ROUNDS {
                        bail!(
                            "[{}] '{method}' still required input after {MAX_INPUT_ROUNDS} rounds",
                            self.server_name
                        );
                    }
                    let (responses, state) = self.answer_input_required(&result).await?;
                    if responses.is_empty() {
                        tokio::time::sleep(STATE_ONLY_PACING).await;
                    }
                    retry = Some((responses, state));
                }
                other => bail!(
                    "[{}] server answered '{method}' with unrecognized resultType '{other}'",
                    self.server_name
                ),
            }
        }
    }

    async fn answer_input_required(
        &self,
        result: &Value,
    ) -> Result<(Map<String, Value>, Option<String>)> {
        let state = result
            .get("requestState")
            .and_then(Value::as_str)
            .map(str::to_string);
        let requests = result.get("inputRequests").and_then(Value::as_object);
        if requests.is_none() && state.is_none() {
            bail!(
                "[{}] input_required result carried neither inputRequests nor requestState",
                self.server_name
            );
        }
        let mut responses = Map::new();
        for (key, request) in requests.into_iter().flatten() {
            let method = request
                .get("method")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if method != "elicitation/create" {
                bail!(
                    "[{}] server asked for '{method}' input, which this client did not declare",
                    self.server_name
                );
            }
            let parsed: ElicitationRequest =
                serde_json::from_value(request.get("params").cloned().unwrap_or(Value::Null))
                    .with_context(|| {
                        format!(
                            "[{}] malformed elicitation input request '{key}'",
                            self.server_name
                        )
                    })?;
            if !self.hooks.elicitation.modes().contains(&parsed.mode) {
                bail!(
                    "[{}] server asked for {} elicitation, which this client did not declare",
                    self.server_name,
                    parsed.mode.as_str()
                );
            }
            let response = self
                .hooks
                .elicitation
                .handle(&self.server_name, parsed)
                .await;
            responses.insert(key.clone(), serde_json::to_value(response)?);
        }
        Ok((responses, state))
    }

    fn record_tool_headers(&mut self, result: &mut Value) {
        if !matches!(self.conn, Conn::Http(_)) {
            return;
        }
        let Some(tools) = result.get_mut("tools").and_then(Value::as_array_mut) else {
            return;
        };
        let server = &self.server_name;
        let declared = &mut self.tool_headers;
        tools.retain(|tool| {
            let name = tool
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let Some(schema) = tool.get("inputSchema") else {
                return true;
            };
            match param_headers::scan(schema) {
                Ok(headers) if headers.is_empty() => {
                    declared.remove(name);
                    true
                }
                Ok(headers) => {
                    declared.insert(name.to_string(), headers);
                    true
                }
                Err(reason) => {
                    tracing::warn!(
                        "[{server}] excluding tool '{name}' from tools/list: invalid x-mcp-header declaration, {reason}"
                    );
                    false
                }
            }
        });
    }

    async fn refresh_tool_headers(&mut self, timeout: Duration) -> Result<()> {
        if let Some(mut result) = self.send_modern("tools/list", json!({}), timeout).await? {
            self.record_tool_headers(&mut result);
        }
        Ok(())
    }

    async fn renegotiate(&mut self) -> Result<()> {
        self.stop_subscription().await;
        self.tool_headers.clear();
        self.events.clear();
        self.negotiate().await
    }

    async fn send_modern(
        &mut self,
        method: &str,
        params: Value,
        timeout: Duration,
    ) -> Result<Option<Value>> {
        match self.send_modern_once(method, params.clone(), timeout).await {
            Err(error)
                if method != "tools/call"
                    && matches!(fault(&error), Some(TransportFault::StreamBroke { .. })) =>
            {
                self.send_modern_once(method, params, timeout).await
            }
            outcome => outcome,
        }
    }

    async fn send_modern_once(
        &mut self,
        method: &str,
        params: Value,
        timeout: Duration,
    ) -> Result<Option<Value>> {
        let params = with_meta(params, self.request_meta());
        let headers = self.modern_headers(method, &params);
        self.request_id += 1;
        let id = json!(self.request_id);
        let frame = request_frame(&id, method, Some(params));
        let response = match &mut self.conn {
            Conn::Stdio(stdio) => Some(stdio.request(&id, &frame, method, timeout).await?),
            Conn::Http(http) => {
                http.exchange(&Exchange {
                    id: &id,
                    method,
                    frame: &frame,
                    headers: &headers,
                    timeout,
                    legacy: false,
                })
                .await?
            }
            Conn::Sse(_) => bail!(
                "[{}] the HTTP+SSE transport cannot carry MCP {MODERN_PROTOCOL_VERSION} requests",
                self.server_name
            ),
        };
        response
            .map(|frame| into_result(frame, &self.server_name))
            .transpose()
    }

    async fn send_legacy(
        &mut self,
        method: &str,
        params: Option<Value>,
        timeout: Duration,
    ) -> Result<Option<Value>> {
        let headers = self.legacy_headers();
        self.request_id += 1;
        let id = json!(self.request_id);
        let frame = request_frame(&id, method, params);
        let response = match &mut self.conn {
            Conn::Stdio(stdio) => Some(stdio.request(&id, &frame, method, timeout).await?),
            Conn::Http(http) => {
                http.exchange(&Exchange {
                    id: &id,
                    method,
                    frame: &frame,
                    headers: &headers,
                    timeout,
                    legacy: true,
                })
                .await?
            }
            Conn::Sse(sse) => sse.request(&id, &frame, method, timeout).await?,
        };
        response
            .map(|frame| into_result(frame, &self.server_name))
            .transpose()
    }

    async fn send_notification(&mut self, method: &str) -> Result<()> {
        let frame = notification_frame(method, None);
        let headers = self.legacy_headers();
        match &mut self.conn {
            Conn::Stdio(stdio) => stdio.send(&frame).await,
            Conn::Http(http) => {
                http.notify(&frame, &headers).await;
                Ok(())
            }
            Conn::Sse(sse) => {
                sse.notify(&frame).await;
                Ok(())
            }
        }
    }

    async fn reopen(&mut self) -> Result<()> {
        self.stderr_buf = Arc::new(StderrBuffer::new(&self.timeouts));
        self.conn = open_conn(
            &self.server_name,
            &self.transport_config,
            &self.timeouts,
            &self.hooks,
            &self.events,
            &self.stderr_buf,
        )
        .await?;
        self.request_id = 0;
        Ok(())
    }

    async fn reconnect(&mut self) -> Result<()> {
        self.close().await;
        self.reopen().await?;
        self.negotiate().await
    }

    async fn close(&mut self) {
        self.stop_subscription().await;
        match &mut self.conn {
            Conn::Stdio(stdio) => stdio.shutdown().await,
            Conn::Http(http) => http.end_session().await,
            Conn::Sse(_) => {}
        }
        self.tool_headers.clear();
        self.events.clear();
        self.negotiated = NegotiatedServer::default();
    }

    fn is_connection_lost(error: &anyhow::Error) -> bool {
        if let Some(fault) = fault(error) {
            return match fault {
                TransportFault::Closed { .. }
                | TransportFault::StreamBroke { .. }
                | TransportFault::SessionExpired { .. } => true,
                TransportFault::HttpStatus { status, .. } => matches!(status, 502..=504),
                TransportFault::Timeout { .. } | TransportFault::AuthorizationRequired { .. } => {
                    false
                }
            };
        }
        let msg = format!("{error:#}");
        [
            "closed connection",
            "stdin not available",
            "stdout not available",
            "Broken pipe",
            "Connection reset",
            "Connection refused",
            "SSE channel closed",
            "SSE: POST",
            "SSE GET failed",
        ]
        .iter()
        .any(|marker| msg.contains(marker))
    }

    fn is_tool_call_resendable(error: &anyhow::Error) -> bool {
        !matches!(fault(error), Some(TransportFault::StreamBroke { .. }))
            && Self::is_connection_error(error)
    }

    fn is_connection_error(error: &anyhow::Error) -> bool {
        if Self::is_connection_lost(error)
            || matches!(fault(error), Some(TransportFault::Timeout { .. }))
        {
            return true;
        }
        let msg = format!("{error:#}");
        [
            "response timeout",
            "[mcp http] POST timeout",
            "non-success response 502",
            "non-success response 503",
            "non-success response 504",
        ]
        .iter()
        .any(|marker| msg.contains(marker))
    }
}

impl Drop for McpClient {
    fn drop(&mut self) {
        match self.subscription.take() {
            Some(Subscription::Stdio { waiter, .. }) => waiter.abort(),
            Some(Subscription::Http(task)) => task.abort(),
            None => {}
        }
    }
}

async fn open_conn(
    server_name: &str,
    config: &TransportConfig,
    timeouts: &McpTimeouts,
    hooks: &ClientHooks,
    events: &Arc<Events>,
    stderr_buf: &Arc<StderrBuffer>,
) -> Result<Conn> {
    Ok(match config {
        TransportConfig::Stdio { .. } => Conn::Stdio(StdioConn::spawn(
            server_name,
            config,
            timeouts,
            stderr_buf,
            Arc::clone(events),
            hooks.clone(),
        )?),
        TransportConfig::Sse { url, headers } => Conn::Sse(
            SseConn::connect(
                server_name,
                url,
                headers,
                timeouts,
                Arc::clone(events),
                hooks.clone(),
            )
            .await?,
        ),
        TransportConfig::Http {
            url,
            headers,
            oauth,
        } => Conn::Http(HttpConn::connect(
            server_name,
            url,
            headers,
            oauth.as_ref(),
            timeouts,
            hooks.clone(),
            Arc::clone(events),
        )?),
    })
}

fn with_meta(params: Value, meta: Value) -> Value {
    let mut object = match params {
        Value::Object(object) => object,
        Value::Null => Map::new(),
        other => return other,
    };
    let merged = match (object.remove("_meta"), meta) {
        (Some(Value::Object(mut existing)), Value::Object(ours)) => {
            existing.extend(ours);
            Value::Object(existing)
        }
        (_, ours) => ours,
    };
    object.insert("_meta".to_string(), merged);
    Value::Object(object)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::elicitation::AutoDeclineHandler;
    use crate::hooks::{ClientInfo, DenyBrowserAuthorizer, InMemoryTokenStore, noop_log};

    fn test_hooks() -> ClientHooks {
        ClientHooks {
            token_store: Arc::new(InMemoryTokenStore::new()),
            elicitation: Arc::new(AutoDeclineHandler),
            browser: Arc::new(DenyBrowserAuthorizer),
            client_info: ClientInfo {
                name: "unit-test".to_string(),
                version: "0.0.0".to_string(),
            },
            client_metadata_url: None,
            on_log: noop_log(),
        }
    }

    fn auth_header() -> HashMap<String, String> {
        HashMap::from([("Authorization".to_string(), "Bearer s3cret".to_string())])
    }

    #[tokio::test]
    async fn http_bringup_refuses_cleartext_credentials() {
        let err = match McpClient::connect(
            "cleartext-http",
            TransportConfig::Http {
                url: "http://mcp.example.com/".to_string(),
                headers: auth_header(),
                oauth: None,
            },
            McpTimeouts::default(),
            test_hooks(),
        )
        .await
        {
            Ok(_) => panic!("cleartext credentials must be refused"),
            Err(e) => e,
        };
        let msg = format!("{:#}", err.as_anyhow());
        assert!(msg.contains("must use HTTPS"), "unexpected error: {msg}");
    }

    #[tokio::test]
    async fn sse_bringup_refuses_cleartext_credentials_before_any_request() {
        let err = match McpClient::connect(
            "cleartext-sse",
            TransportConfig::Sse {
                url: "http://mcp.example.com/sse".to_string(),
                headers: auth_header(),
            },
            McpTimeouts::default(),
            test_hooks(),
        )
        .await
        {
            Ok(_) => panic!("cleartext credentials must be refused"),
            Err(e) => e,
        };
        let msg = format!("{:#}", err.as_anyhow());
        assert!(msg.contains("must use HTTPS"), "unexpected error: {msg}");
    }

    #[test]
    fn is_connection_error_closed() {
        assert!(McpClient::is_connection_error(&anyhow!(
            "MCP server closed connection"
        )));
    }

    #[test]
    fn is_connection_error_stdin() {
        assert!(McpClient::is_connection_error(&anyhow!(
            "MCP server stdin not available"
        )));
    }

    #[test]
    fn is_connection_error_timeout() {
        assert!(McpClient::is_connection_error(&anyhow!(
            "MCP server response timeout (30000ms)"
        )));
    }

    #[test]
    fn is_connection_error_broken_pipe() {
        assert!(McpClient::is_connection_error(&anyhow!("Broken pipe")));
    }

    #[test]
    fn is_connection_error_reset() {
        assert!(McpClient::is_connection_error(&anyhow!(
            "Connection reset by peer"
        )));
    }

    #[test]
    fn is_connection_error_http_timeout() {
        assert!(McpClient::is_connection_error(&anyhow!(
            "[srv] [mcp http] POST timeout (5000ms) on 'tools/call'"
        )));
    }

    #[test]
    fn is_not_connection_error_protocol() {
        assert!(!McpClient::is_connection_error(&anyhow!(
            "MCP error -32600: Invalid Request"
        )));
    }

    #[test]
    fn is_not_connection_error_json() {
        assert!(!McpClient::is_connection_error(&anyhow!(
            "Failed to parse JSON response"
        )));
    }

    fn filter_manifest_env(
        manifest_env: &HashMap<String, String>,
    ) -> (HashMap<String, String>, Vec<String>) {
        const BLOCKED: &[&str] = &[
            "DYLD_INSERT_LIBRARIES",
            "DYLD_LIBRARY_PATH",
            "DYLD_FORCE_FLAT_NAMESPACE",
            "LD_PRELOAD",
            "LD_LIBRARY_PATH",
            "LD_AUDIT",
            "NODE_OPTIONS",
            "PYTHONPATH",
            "RUBYLIB",
            "PERL5LIB",
            "http_proxy",
            "https_proxy",
            "HTTP_PROXY",
            "HTTPS_PROXY",
            "ALL_PROXY",
            "all_proxy",
        ];
        let mut allowed = HashMap::new();
        let mut blocked_keys = Vec::new();
        for (k, v) in manifest_env {
            let key_upper = k.to_uppercase();
            let is_blocked =
                BLOCKED.iter().any(|b| b.eq_ignore_ascii_case(k)) || key_upper.ends_with("_PROXY");
            if is_blocked {
                blocked_keys.push(k.clone());
            } else {
                allowed.insert(k.clone(), v.clone());
            }
        }
        (allowed, blocked_keys)
    }

    fn manifest_env(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn env_blocks_dyld_insert_libraries() {
        let env = manifest_env(&[("DYLD_INSERT_LIBRARIES", "~/.config/evil.dylib")]);
        let (allowed, blocked) = filter_manifest_env(&env);
        assert!(!allowed.contains_key("DYLD_INSERT_LIBRARIES"));
        assert!(blocked.contains(&"DYLD_INSERT_LIBRARIES".to_string()));
    }

    #[test]
    fn env_blocks_ld_preload() {
        let env = manifest_env(&[("LD_PRELOAD", "/tmp/evil.so")]);
        let (allowed, blocked) = filter_manifest_env(&env);
        assert!(!allowed.contains_key("LD_PRELOAD"));
        assert!(blocked.contains(&"LD_PRELOAD".to_string()));
    }

    #[test]
    fn env_blocks_node_options() {
        let env = manifest_env(&[("NODE_OPTIONS", "--require ./malicious.js")]);
        let (allowed, blocked) = filter_manifest_env(&env);
        assert!(!allowed.contains_key("NODE_OPTIONS"));
        assert!(blocked.contains(&"NODE_OPTIONS".to_string()));
    }

    #[test]
    fn env_blocks_http_proxy_family() {
        for var in &[
            "HTTP_PROXY",
            "HTTPS_PROXY",
            "http_proxy",
            "https_proxy",
            "ALL_PROXY",
        ] {
            let env = manifest_env(&[(var, "http://attacker.com")]);
            let (allowed, blocked) = filter_manifest_env(&env);
            assert!(!allowed.contains_key(*var), "{var} should be blocked");
            assert!(
                blocked.iter().any(|k| k.eq_ignore_ascii_case(var)),
                "{var} not in blocked list"
            );
        }
    }

    #[test]
    fn env_blocks_custom_proxy_suffix() {
        let env = manifest_env(&[("MY_CUSTOM_PROXY", "http://attacker.com")]);
        let (allowed, blocked) = filter_manifest_env(&env);
        assert!(!allowed.contains_key("MY_CUSTOM_PROXY"));
        assert!(blocked.contains(&"MY_CUSTOM_PROXY".to_string()));
    }

    #[test]
    fn env_allows_path_from_manifest() {
        let env = manifest_env(&[("PATH", "/usr/local/bin:/usr/bin")]);
        let (allowed, blocked) = filter_manifest_env(&env);
        assert_eq!(
            allowed.get("PATH").map(String::as_str),
            Some("/usr/local/bin:/usr/bin")
        );
        assert!(!blocked.contains(&"PATH".to_string()));
    }

    #[test]
    fn env_allows_safe_custom_vars() {
        let env = manifest_env(&[
            ("MY_SERVER_PORT", "8080"),
            ("DEBUG", "true"),
            ("SERVER_CONFIG", "/etc/myserver.json"),
        ]);
        let (allowed, blocked) = filter_manifest_env(&env);
        assert_eq!(allowed.len(), 3);
        assert!(blocked.is_empty());
    }

    #[test]
    fn env_api_keys_not_in_parent_allowlist() {
        assert!(!crate::INHERITED_ENV_ALLOWLIST.contains(&"ANTHROPIC_API_KEY"));
        assert!(!crate::INHERITED_ENV_ALLOWLIST.contains(&"OPENAI_API_KEY"));
    }
}
