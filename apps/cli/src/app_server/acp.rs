//! Agent Client Protocol (ACP) over stdio, for editors such as Zed and
//! JetBrains IDEs that launch an agent as a subprocess.
//!
//! The adapter speaks ACP major version [`ACP_PROTOCOL_VERSION`] and maps it
//! onto the same [`DeveloperSessionHost`] the stdio app-server drives: an ACP
//! session is a developer thread, a prompt is a turn, `session/cancel`
//! interrupts it, and every approval the host asks for goes back to the editor
//! as `session/request_permission`. The host keeps deciding what needs an
//! approval, which folder a thread may touch and which route it runs on.

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex as StdMutex};

use agiworkforce_app_server::{DeveloperSessionHost, DeveloperSessionHostError, TurnClient};
use agiworkforce_protocol::agent_events::{
    AgentEvent, AgentEventEnvelope, AgentEventStopReason, AgentEventToolCategory,
};
use agiworkforce_protocol::approvals::ExecPolicyAmendment;
use agiworkforce_protocol::developer_session::{
    AppServerClientInfo, AppServerNotification, ApprovalResponseParams, DeveloperSessionTrustMode,
    DeveloperStepStatus, ThreadIdParams, ThreadPlanNotification, ThreadStartParams, ThreadStatus,
    TurnEndedNotification, TurnFailureCode, TurnInterruptParams, TurnStartParams, TurnStatus,
};
use agiworkforce_protocol::protocol::ReviewDecision;
use anyhow::Result;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::sync::{broadcast, mpsc, oneshot};

pub const ACP_PROTOCOL_VERSION: u16 = 1;

const OUTBOUND_QUEUE: usize = 4096;
const PARSE_ERROR: i64 = -32700;
const INVALID_REQUEST: i64 = -32600;
const METHOD_NOT_FOUND: i64 = -32601;
const INVALID_PARAMS: i64 = -32602;
const INTERNAL_ERROR: i64 = -32603;
const RESOURCE_NOT_FOUND: i64 = -32002;
const HOST_NOT_FOUND: i32 = -32004;

#[derive(Debug, Clone, PartialEq)]
struct RpcError {
    code: i64,
    message: String,
    data: Option<Value>,
}

impl RpcError {
    fn new(code: i64, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            data: None,
        }
    }

    fn to_json(&self) -> Value {
        let mut error = json!({ "code": self.code, "message": self.message });
        if let Some(data) = &self.data {
            error["data"] = data.clone();
        }
        error
    }
}

impl From<DeveloperSessionHostError> for RpcError {
    fn from(error: DeveloperSessionHostError) -> Self {
        let code = if error.code() == HOST_NOT_FOUND {
            RESOURCE_NOT_FOUND
        } else {
            i64::from(error.code())
        };
        Self {
            code,
            message: error.message().to_string(),
            data: error.data().cloned(),
        }
    }
}

#[derive(Debug)]
enum TurnEnd {
    Ended(Box<TurnEndedNotification>),
    Cancelled,
}

struct ActiveTurn {
    turn_id: Option<String>,
    stop: Option<AgentEventStopReason>,
    cancelled: bool,
    done: oneshot::Sender<Result<Value, RpcError>>,
}

struct Session {
    cwd: String,
}

struct PendingPrompt {
    session_id: String,
    start: TurnStartParams,
    finished: oneshot::Receiver<Result<Value, RpcError>>,
}

struct AcpConnection {
    host: Arc<dyn DeveloperSessionHost>,
    outbound: mpsc::Sender<Value>,
    initialized: AtomicBool,
    client: StdMutex<Option<AppServerClientInfo>>,
    next_request_id: AtomicU64,
    client_requests: StdMutex<HashMap<u64, oneshot::Sender<Result<Value, Value>>>>,
    sessions: StdMutex<HashMap<String, Session>>,
    turns: StdMutex<HashMap<String, ActiveTurn>>,
    open_tool_calls: StdMutex<HashMap<String, HashSet<String>>>,
}

pub async fn serve_acp<R, W>(
    reader: R,
    mut writer: W,
    host: Arc<dyn DeveloperSessionHost>,
) -> Result<()>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin + Send + 'static,
{
    let (outbound, mut queue) = mpsc::channel::<Value>(OUTBOUND_QUEUE);
    let (stop_writer, mut writer_stopped) = oneshot::channel::<()>();
    let writer_task = tokio::spawn(async move {
        let mut stopping = false;
        loop {
            let message = if stopping {
                queue.recv().await
            } else {
                tokio::select! {
                    biased;
                    message = queue.recv() => message,
                    _ = &mut writer_stopped => {
                        stopping = true;
                        queue.close();
                        continue;
                    }
                }
            };
            let Some(message) = message else {
                break;
            };
            let mut line = serde_json::to_vec(&message)?;
            line.push(b'\n');
            writer.write_all(&line).await?;
            writer.flush().await?;
        }
        writer.shutdown().await?;
        anyhow::Ok(())
    });
    let connection = Arc::new(AcpConnection {
        host: host.clone(),
        outbound,
        initialized: AtomicBool::new(false),
        client: StdMutex::new(None),
        next_request_id: AtomicU64::new(0),
        client_requests: StdMutex::new(HashMap::new()),
        sessions: StdMutex::new(HashMap::new()),
        turns: StdMutex::new(HashMap::new()),
        open_tool_calls: StdMutex::new(HashMap::new()),
    });
    let pump = tokio::spawn(connection.clone().pump(host.subscribe()));

    let mut lines = BufReader::new(reader).lines();
    let read_result = loop {
        match lines.next_line().await {
            Ok(Some(line)) if line.trim().is_empty() => continue,
            Ok(Some(line)) => connection.clone().dispatch(&line).await,
            Ok(None) => break Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::BrokenPipe => break Ok(()),
            Err(error) => break Err(anyhow::Error::new(error)),
        }
    };

    connection
        .client_requests
        .lock()
        .map(|mut pending| pending.clear())
        .ok();
    let shutdown = host.shutdown().await.map_err(anyhow::Error::new);
    pump.abort();
    drop(connection);
    let _ = stop_writer.send(());
    let written = writer_task.await;
    read_result?;
    shutdown?;
    match written {
        Ok(Err(error)) if !is_broken_pipe(&error) => Err(error),
        _ => Ok(()),
    }
}

fn is_broken_pipe(error: &anyhow::Error) -> bool {
    error.chain().any(|cause| {
        cause
            .downcast_ref::<std::io::Error>()
            .is_some_and(|io| io.kind() == std::io::ErrorKind::BrokenPipe)
    })
}

impl AcpConnection {
    async fn send(&self, message: Value) {
        let _ = self.outbound.send(message).await;
    }

    async fn respond(&self, id: Value, result: Result<Value, RpcError>) {
        let message = match result {
            Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
            Err(error) => json!({ "jsonrpc": "2.0", "id": id, "error": error.to_json() }),
        };
        self.send(message).await;
    }

    async fn notify_update(&self, session_id: &str, update: Value) {
        self.send(json!({
            "jsonrpc": "2.0",
            "method": "session/update",
            "params": { "sessionId": session_id, "update": update },
        }))
        .await;
    }

    async fn request_client(&self, method: &str, params: Value) -> Result<Value, Value> {
        let id = self.next_request_id.fetch_add(1, Ordering::SeqCst);
        let (sender, receiver) = oneshot::channel();
        if let Ok(mut pending) = self.client_requests.lock() {
            pending.insert(id, sender);
        }
        self.send(json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }))
            .await;
        receiver
            .await
            .unwrap_or_else(|_| Err(json!({ "message": "The editor closed the connection" })))
    }

    async fn dispatch(self: Arc<Self>, line: &str) {
        let message: Value = match serde_json::from_str(line) {
            Ok(message) => message,
            Err(error) => {
                self.respond(
                    Value::Null,
                    Err(RpcError::new(PARSE_ERROR, format!("Parse error: {error}"))),
                )
                .await;
                return;
            }
        };
        let method = message.get("method").and_then(Value::as_str);
        let id = message.get("id").cloned();
        let params = message.get("params").cloned().unwrap_or(Value::Null);
        match (method, id) {
            (None, Some(id)) => self.settle_client_request(&id, &message),
            (Some(method), None) => self.handle_notification(method, params).await,
            (Some(method), Some(id)) => {
                let method = method.to_string();
                if method == "initialize" {
                    let result = Ok(self.initialize(&params));
                    self.respond(id, result).await;
                    return;
                }
                if method == "session/prompt" {
                    match self.begin_prompt(&params) {
                        Ok(pending) => {
                            tokio::spawn(async move {
                                let result = self.clone().run_prompt(pending).await;
                                self.respond(id, result).await;
                            });
                        }
                        Err(error) => self.respond(id, Err(error)).await,
                    }
                    return;
                }
                tokio::spawn(async move {
                    let result = self.handle_request(&method, params).await;
                    self.respond(id, result).await;
                });
            }
            (None, None) => {
                self.respond(
                    Value::Null,
                    Err(RpcError::new(
                        INVALID_REQUEST,
                        "A message needs a method or an id",
                    )),
                )
                .await;
            }
        }
    }

    fn settle_client_request(&self, id: &Value, message: &Value) {
        let Some(id) = id.as_u64() else {
            return;
        };
        let Some(sender) = self
            .client_requests
            .lock()
            .ok()
            .and_then(|mut pending| pending.remove(&id))
        else {
            return;
        };
        let reply = match message.get("error") {
            Some(error) => Err(error.clone()),
            None => Ok(message.get("result").cloned().unwrap_or(Value::Null)),
        };
        let _ = sender.send(reply);
    }

    async fn handle_notification(self: Arc<Self>, method: &str, params: Value) {
        if method == "session/cancel" {
            if let Some(session_id) = params.get("sessionId").and_then(Value::as_str) {
                self.cancel(session_id.to_string()).await;
            }
        }
    }

    async fn handle_request(&self, method: &str, params: Value) -> Result<Value, RpcError> {
        if !self.initialized.load(Ordering::SeqCst) {
            return Err(RpcError::new(
                INVALID_REQUEST,
                "Send initialize before any other request",
            ));
        }
        match method {
            "authenticate" => Err(RpcError::new(
                INVALID_PARAMS,
                "This agent offers no ACP sign-in method; run `agi login` in a terminal",
            )),
            "session/new" => self.new_session(&params).await,
            _ => Err(RpcError::new(
                METHOD_NOT_FOUND,
                format!("Method not found: {method}"),
            )),
        }
    }

    fn initialize(&self, params: &Value) -> Value {
        if let Some(info) = params.get("clientInfo").filter(|info| info.is_object()) {
            let name = info
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("acp-client")
                .to_string();
            let client = AppServerClientInfo {
                title: info
                    .get("title")
                    .and_then(Value::as_str)
                    .unwrap_or(&name)
                    .to_string(),
                version: info
                    .get("version")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                name,
            };
            if let Ok(mut slot) = self.client.lock() {
                *slot = Some(client);
            }
        }
        self.initialized.store(true, Ordering::SeqCst);
        json!({
            "protocolVersion": ACP_PROTOCOL_VERSION,
            "agentCapabilities": {
                "loadSession": false,
                "promptCapabilities": {
                    "image": false,
                    "audio": false,
                    "embeddedContext": true,
                },
                "mcpCapabilities": { "http": false, "sse": false },
            },
            "agentInfo": {
                "name": "agiworkforce",
                "title": crate::PRODUCT_NAME,
                "version": self.host.server_version(),
            },
            "authMethods": [],
        })
    }

    async fn new_session(&self, params: &Value) -> Result<Value, RpcError> {
        let cwd = params
            .get("cwd")
            .and_then(Value::as_str)
            .ok_or_else(|| RpcError::new(INVALID_PARAMS, "session/new needs a cwd"))?;
        if !Path::new(cwd).is_absolute() {
            return Err(RpcError::new(
                INVALID_PARAMS,
                "session/new needs an absolute cwd",
            ));
        }
        let editor_servers: Vec<&str> = params
            .get("mcpServers")
            .and_then(Value::as_array)
            .map(|servers| {
                servers
                    .iter()
                    .filter_map(|server| server.get("name").and_then(Value::as_str))
                    .collect()
            })
            .unwrap_or_default();
        let client = self
            .client
            .lock()
            .ok()
            .and_then(|client| client.clone())
            .unwrap_or_else(|| AppServerClientInfo {
                name: "acp-client".to_string(),
                title: "ACP client".to_string(),
                version: String::new(),
            });
        let thread = self
            .host
            .start_thread(
                ThreadStartParams {
                    cwd: Some(cwd.to_string()),
                    ..ThreadStartParams::default()
                },
                client,
            )
            .await?;
        if thread.trust_mode == DeveloperSessionTrustMode::Unknown {
            return Err(RpcError::new(
                INTERNAL_ERROR,
                "The new session has no routing boundary; start it from `agi` in a terminal",
            ));
        }
        if !editor_servers.is_empty() {
            eprintln!(
                "{}: MCP servers sent by the editor were not started ({}); add them with `agi mcp add` to use them here.",
                crate::PRODUCT_NAME,
                editor_servers.join(", ")
            );
        }
        if let Ok(mut sessions) = self.sessions.lock() {
            sessions.insert(
                thread.id.clone(),
                Session {
                    cwd: thread.cwd.clone().unwrap_or_else(|| cwd.to_string()),
                },
            );
        }
        Ok(json!({ "sessionId": thread.id }))
    }

    fn begin_prompt(&self, params: &Value) -> Result<PendingPrompt, RpcError> {
        if !self.initialized.load(Ordering::SeqCst) {
            return Err(RpcError::new(
                INVALID_REQUEST,
                "Send initialize before any other request",
            ));
        }
        let session_id = params
            .get("sessionId")
            .and_then(Value::as_str)
            .ok_or_else(|| RpcError::new(INVALID_PARAMS, "session/prompt needs a sessionId"))?
            .to_string();
        let cwd = self
            .sessions
            .lock()
            .ok()
            .and_then(|sessions| sessions.get(&session_id).map(|session| session.cwd.clone()))
            .ok_or_else(|| {
                RpcError::new(
                    RESOURCE_NOT_FOUND,
                    format!("No session {session_id} on this connection"),
                )
            })?;
        let text = prompt_text(params.get("prompt"))?;
        let start: TurnStartParams = serde_json::from_value(json!({
            "threadId": session_id,
            "input": [{ "type": "text", "text": text }],
            "cwd": cwd,
        }))
        .map_err(|error| RpcError::new(INVALID_PARAMS, error.to_string()))?;

        let (done, finished) = oneshot::channel();
        {
            let mut turns = self.turns.lock().map_err(|_| poisoned())?;
            if turns.contains_key(&session_id) {
                return Err(RpcError::new(
                    INVALID_REQUEST,
                    "This session is already answering a prompt",
                ));
            }
            turns.insert(
                session_id.clone(),
                ActiveTurn {
                    turn_id: None,
                    stop: None,
                    cancelled: false,
                    done,
                },
            );
        }
        Ok(PendingPrompt {
            session_id,
            start,
            finished,
        })
    }

    async fn run_prompt(self: Arc<Self>, pending: PendingPrompt) -> Result<Value, RpcError> {
        let PendingPrompt {
            session_id,
            start,
            finished,
        } = pending;
        let started = self
            .host
            .start_turn_for(
                start,
                TurnClient {
                    answers_user_input: false,
                },
            )
            .await;
        match started {
            Err(error) => {
                if let Ok(mut turns) = self.turns.lock() {
                    turns.remove(&session_id);
                }
                return Err(error.into());
            }
            Ok(summary) => {
                let cancel_now = self
                    .turns
                    .lock()
                    .ok()
                    .and_then(|mut turns| {
                        turns.get_mut(&session_id).map(|turn| {
                            let cancel_already_sent = turn.turn_id.is_some();
                            turn.turn_id.get_or_insert(summary.id.clone());
                            turn.cancelled && !cancel_already_sent
                        })
                    })
                    .unwrap_or(false);
                if cancel_now {
                    self.clone().interrupt(session_id.clone(), summary.id).await;
                }
            }
        }
        finished
            .await
            .unwrap_or_else(|_| Err(RpcError::new(INTERNAL_ERROR, "The turn ended unseen")))
    }

    async fn cancel(self: Arc<Self>, session_id: String) {
        let turn_id = {
            let Ok(mut turns) = self.turns.lock() else {
                return;
            };
            let Some(turn) = turns.get_mut(&session_id) else {
                return;
            };
            turn.cancelled = true;
            turn.turn_id.clone()
        };
        if let Some(turn_id) = turn_id {
            tokio::spawn(self.interrupt(session_id, turn_id));
        }
    }

    async fn interrupt(self: Arc<Self>, session_id: String, turn_id: String) {
        let interrupted = self
            .host
            .interrupt_turn(TurnInterruptParams {
                thread_id: session_id.clone(),
                turn_id,
            })
            .await;
        if interrupted.is_err() {
            self.finish(&session_id, TurnEnd::Cancelled);
        }
    }

    fn finish(&self, session_id: &str, end: TurnEnd) {
        let Some(turn) = self
            .turns
            .lock()
            .ok()
            .and_then(|mut turns| turns.remove(session_id))
        else {
            return;
        };
        let result = if turn.cancelled {
            Ok(json!({ "stopReason": "cancelled" }))
        } else {
            match end {
                TurnEnd::Cancelled => Ok(json!({ "stopReason": "cancelled" })),
                TurnEnd::Ended(ended) if ended.status == TurnStatus::Completed => {
                    Ok(json!({ "stopReason": stop_reason(turn.stop) }))
                }
                TurnEnd::Ended(ended)
                    if ended.failure.as_ref().is_some_and(|failure| {
                        failure.code == TurnFailureCode::RefusedBySafety
                    }) =>
                {
                    Ok(json!({ "stopReason": "refusal" }))
                }
                TurnEnd::Ended(ended)
                    if ended.failure.as_ref().is_some_and(|failure| {
                        failure.code == TurnFailureCode::OutputLimitReached
                    }) =>
                {
                    Ok(json!({ "stopReason": "max_tokens" }))
                }
                TurnEnd::Ended(ended) => {
                    let message = ended
                        .failure
                        .as_ref()
                        .map(|failure| failure.message.clone())
                        .or(ended.error.clone())
                        .unwrap_or_else(|| "The turn ended with an error".to_string());
                    let mut error = RpcError::new(INTERNAL_ERROR, message);
                    error.data = ended
                        .failure
                        .as_ref()
                        .and_then(|failure| serde_json::to_value(failure).ok());
                    Err(error)
                }
            }
        };
        let _ = turn.done.send(result);
    }

    fn owns(&self, session_id: &str) -> bool {
        self.sessions
            .lock()
            .map(|sessions| sessions.contains_key(session_id))
            .unwrap_or(false)
    }

    async fn pump(self: Arc<Self>, mut events: broadcast::Receiver<AppServerNotification>) {
        loop {
            match events.recv().await {
                Ok(notification) => self.clone().forward(notification).await,
                Err(broadcast::error::RecvError::Lagged(skipped)) => {
                    eprintln!(
                        "{}: {skipped} session events were dropped under load; checking running prompts.",
                        crate::PRODUCT_NAME
                    );
                    self.settle_after_lag().await;
                }
                Err(broadcast::error::RecvError::Closed) => return,
            }
        }
    }

    async fn settle_after_lag(&self) {
        let running: Vec<String> = self
            .turns
            .lock()
            .map(|turns| turns.keys().cloned().collect())
            .unwrap_or_default();
        for session_id in running {
            let Ok(read) = self
                .host
                .read_thread(ThreadIdParams {
                    thread_id: session_id.clone(),
                })
                .await
            else {
                continue;
            };
            if !matches!(
                read.thread.status,
                ThreadStatus::Running | ThreadStatus::AwaitingApproval
            ) {
                let turn_id = self
                    .turns
                    .lock()
                    .ok()
                    .and_then(|turns| turns.get(&session_id).and_then(|turn| turn.turn_id.clone()))
                    .unwrap_or_default();
                let status = if read.thread.status == ThreadStatus::Failed {
                    TurnStatus::Failed
                } else {
                    TurnStatus::Completed
                };
                self.finish(
                    &session_id,
                    TurnEnd::Ended(Box::new(TurnEndedNotification {
                        thread_id: session_id.clone(),
                        turn_id,
                        status,
                        response: String::new(),
                        input_tokens: 0,
                        output_tokens: 0,
                        error: None,
                        failure: None,
                        managed_request_ids: Vec::new(),
                        unsent_steers: 0,
                    })),
                );
            }
        }
    }

    async fn forward(self: Arc<Self>, notification: AppServerNotification) {
        let params = &notification.params;
        let thread_id = params
            .get("threadId")
            .or_else(|| params.get("sessionId"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        if !self.owns(&thread_id) {
            return;
        }
        match notification.method.as_str() {
            "turn/started" => {
                if let Some(turn_id) = params.get("turnId").and_then(Value::as_str) {
                    if let Ok(mut turns) = self.turns.lock() {
                        if let Some(turn) = turns.get_mut(&thread_id) {
                            turn.turn_id.get_or_insert_with(|| turn_id.to_string());
                        }
                    }
                }
            }
            "turn/output_delta" => {
                if let Some(delta) = params.get("delta").and_then(Value::as_str) {
                    self.notify_update(
                        &thread_id,
                        json!({
                            "sessionUpdate": "agent_message_chunk",
                            "content": { "type": "text", "text": delta },
                        }),
                    )
                    .await;
                }
            }
            "turn/agent_event" => {
                if let Ok(envelope) =
                    serde_json::from_value::<AgentEventEnvelope>(notification.params.clone())
                {
                    self.forward_agent_event(&thread_id, envelope.event).await;
                }
            }
            "thread/plan" => {
                if let Ok(plan) =
                    serde_json::from_value::<ThreadPlanNotification>(notification.params.clone())
                {
                    if let Some(entries) = plan_entries(&plan) {
                        self.notify_update(
                            &thread_id,
                            json!({ "sessionUpdate": "plan", "entries": entries }),
                        )
                        .await;
                    }
                }
            }
            "approval/requested" => {
                let connection = self.clone();
                let request = notification.params.clone();
                tokio::spawn(async move { connection.ask_permission(thread_id, request).await });
            }
            "turn/completed" | "turn/failed" => {
                if let Ok(ended) =
                    serde_json::from_value::<TurnEndedNotification>(notification.params.clone())
                {
                    self.close_open_tool_calls(&thread_id).await;
                    self.finish(&thread_id, TurnEnd::Ended(Box::new(ended)));
                }
            }
            "turn/interrupted" => {
                self.close_open_tool_calls(&thread_id).await;
                self.finish(&thread_id, TurnEnd::Cancelled);
            }
            _ => {}
        }
    }

    async fn forward_agent_event(&self, session_id: &str, event: AgentEvent) {
        match event {
            AgentEvent::ReasoningDelta(reasoning) => {
                self.notify_update(
                    session_id,
                    json!({
                        "sessionUpdate": "agent_thought_chunk",
                        "content": { "type": "text", "text": reasoning.delta },
                    }),
                )
                .await;
            }
            AgentEvent::ToolExecutionStart(started) => {
                if let Ok(mut open) = self.open_tool_calls.lock() {
                    open.entry(session_id.to_string())
                        .or_default()
                        .insert(started.tool_call_id.clone());
                }
                let title = if started.summary.trim().is_empty() {
                    started.name.clone()
                } else {
                    started.summary.clone()
                };
                self.notify_update(
                    session_id,
                    json!({
                        "sessionUpdate": "tool_call",
                        "toolCallId": started.tool_call_id,
                        "title": title,
                        "name": started.name,
                        "kind": tool_kind(&started.name, started.category),
                        "status": "in_progress",
                        "rawInput": started.input,
                    }),
                )
                .await;
            }
            AgentEvent::ToolExecutionEnd(ended) => {
                if let Ok(mut open) = self.open_tool_calls.lock() {
                    if let Some(calls) = open.get_mut(session_id) {
                        calls.remove(&ended.tool_call_id);
                    }
                }
                self.notify_update(
                    session_id,
                    json!({
                        "sessionUpdate": "tool_call_update",
                        "toolCallId": ended.tool_call_id,
                        "status": if ended.is_error { "failed" } else { "completed" },
                        "content": [{
                            "type": "content",
                            "content": { "type": "text", "text": tool_output_text(&ended.output) },
                        }],
                        "rawOutput": ended.output,
                    }),
                )
                .await;
            }
            AgentEvent::FileChanged(change) => {
                let cwd = self
                    .sessions
                    .lock()
                    .ok()
                    .and_then(|sessions| sessions.get(session_id).map(|s| s.cwd.clone()))
                    .unwrap_or_default();
                let path = Path::new(&cwd).join(&change.path);
                self.notify_update(
                    session_id,
                    json!({
                        "sessionUpdate": "tool_call_update",
                        "toolCallId": change.tool_call_id,
                        "locations": [{ "path": path.to_string_lossy() }],
                    }),
                )
                .await;
            }
            AgentEvent::Stop(stop) => {
                if let Ok(mut turns) = self.turns.lock() {
                    if let Some(turn) = turns.get_mut(session_id) {
                        turn.stop = Some(stop.reason);
                    }
                }
            }
            _ => {}
        }
    }

    async fn close_open_tool_calls(&self, session_id: &str) {
        let open: Vec<String> = self
            .open_tool_calls
            .lock()
            .ok()
            .and_then(|mut open| open.remove(session_id))
            .map(|calls| calls.into_iter().collect())
            .unwrap_or_default();
        for tool_call_id in open {
            self.notify_update(
                session_id,
                json!({
                    "sessionUpdate": "tool_call_update",
                    "toolCallId": tool_call_id,
                    "status": "failed",
                }),
            )
            .await;
        }
    }

    async fn ask_permission(&self, session_id: String, request: Value) {
        let Some(turn_id) = request.get("turnId").and_then(Value::as_str) else {
            return;
        };
        let Some(request_id) = request.get("requestId").and_then(Value::as_str) else {
            return;
        };
        let choices = permission_choices(&request);
        let options: Vec<Value> = choices
            .iter()
            .map(
                |choice| json!({ "optionId": choice.id, "name": choice.name, "kind": choice.kind }),
            )
            .collect();
        let tool_call_id = format!("approval-{request_id}");
        let reply = self
            .request_client(
                "session/request_permission",
                json!({
                    "sessionId": session_id,
                    "toolCall": permission_tool_call(&tool_call_id, &request),
                    "options": options,
                }),
            )
            .await;
        let selected = reply.ok().and_then(|result| {
            let outcome = result.get("outcome")?;
            if outcome.get("outcome").and_then(Value::as_str) != Some("selected") {
                return None;
            }
            let option_id = outcome.get("optionId").and_then(Value::as_str)?;
            choices
                .iter()
                .find(|choice| choice.id == option_id)
                .cloned()
        });
        let (decision, note) = match selected {
            Some(choice) => {
                let allowed = !matches!(choice.decision, ReviewDecision::Denied);
                self.notify_update(
                    &session_id,
                    json!({
                        "sessionUpdate": "tool_call_update",
                        "toolCallId": tool_call_id,
                        "status": if allowed { "completed" } else { "failed" },
                    }),
                )
                .await;
                (choice.decision, choice.note)
            }
            None => (ReviewDecision::Abort, None),
        };
        let _ = self
            .host
            .respond_to_approval(ApprovalResponseParams {
                thread_id: session_id.clone(),
                turn_id: turn_id.to_string(),
                request_id: request_id.to_string(),
                decision,
                note,
                edited_content: None,
            })
            .await;
    }
}

fn poisoned() -> RpcError {
    RpcError::new(INTERNAL_ERROR, "The session state is unavailable")
}

#[derive(Debug, Clone)]
struct PermissionChoice {
    id: String,
    name: String,
    kind: &'static str,
    decision: ReviewDecision,
    note: Option<String>,
}

fn permission_choices(request: &Value) -> Vec<PermissionChoice> {
    let question_options = request
        .get("question")
        .and_then(|question| question.get("options"))
        .and_then(Value::as_array)
        .filter(|options| !options.is_empty());
    if let Some(options) = question_options {
        let mut choices: Vec<PermissionChoice> = options
            .iter()
            .filter_map(Value::as_str)
            .enumerate()
            .map(|(index, option)| PermissionChoice {
                id: format!("answer-{index}"),
                name: option.to_string(),
                kind: "allow_once",
                decision: ReviewDecision::Approved,
                note: Some(option.to_string()),
            })
            .collect();
        choices.push(PermissionChoice {
            id: "skip".to_string(),
            name: "Skip".to_string(),
            kind: "reject_once",
            decision: ReviewDecision::Denied,
            note: None,
        });
        return choices;
    }

    let mut choices = vec![
        PermissionChoice {
            id: "allow-once".to_string(),
            name: "Allow".to_string(),
            kind: "allow_once",
            decision: ReviewDecision::Approved,
            note: None,
        },
        PermissionChoice {
            id: "allow-session".to_string(),
            name: "Allow for this session".to_string(),
            kind: "allow_always",
            decision: ReviewDecision::ApprovedForSession,
            note: None,
        },
    ];
    let amendment = request
        .get("proposedExecpolicyAmendment")
        .filter(|value| !value.is_null())
        .and_then(|value| serde_json::from_value::<ExecPolicyAmendment>(value.clone()).ok());
    if let Some(amendment) = amendment {
        choices.push(PermissionChoice {
            id: "allow-always".to_string(),
            name: format!("Always allow {}", amendment.command().join(" ")),
            kind: "allow_always",
            decision: ReviewDecision::ApprovedExecpolicyAmendment {
                proposed_execpolicy_amendment: amendment,
            },
            note: None,
        });
    } else if request.get("alwaysAllowSaved").and_then(Value::as_bool) == Some(true) {
        choices.push(PermissionChoice {
            id: "allow-always".to_string(),
            name: "Always allow".to_string(),
            kind: "allow_always",
            decision: ReviewDecision::AlwaysAllow,
            note: None,
        });
    }
    choices.push(PermissionChoice {
        id: "deny".to_string(),
        name: "Deny".to_string(),
        kind: "reject_once",
        decision: ReviewDecision::Denied,
        note: None,
    });
    choices
}

fn permission_tool_call(tool_call_id: &str, request: &Value) -> Value {
    let summary = request
        .get("summary")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let detail = request
        .get("detail")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let kind = request
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let mut content = Vec::new();
    if !detail.trim().is_empty() {
        content.push(json!({ "type": "content", "content": { "type": "text", "text": detail } }));
    }
    if let Some(proposed) = request.get("proposedContent").and_then(Value::as_str) {
        content.push(json!({ "type": "content", "content": { "type": "text", "text": proposed } }));
    }
    json!({
        "toolCallId": tool_call_id,
        "title": if summary.trim().is_empty() { "Approval needed" } else { summary },
        "kind": approval_kind(kind),
        "status": "pending",
        "content": content,
    })
}

fn approval_kind(kind: &str) -> &'static str {
    let variant = kind
        .split(|character: char| !character.is_ascii_alphanumeric())
        .next()
        .unwrap_or_default();
    match variant {
        "Exec" | "Git" | "GitPush" => "execute",
        "FileWrite" | "FileEdit" | "Patch" => "edit",
        "Network" => "fetch",
        _ => "other",
    }
}

fn tool_kind(name: &str, category: AgentEventToolCategory) -> &'static str {
    match category {
        AgentEventToolCategory::Shell | AgentEventToolCategory::CodeExecution => "execute",
        AgentEventToolCategory::WebFetch => "fetch",
        AgentEventToolCategory::WebSearch => "search",
        AgentEventToolCategory::Filesystem
            if crate::runtime::tool_catalog::is_file_edit_tool(name) =>
        {
            "edit"
        }
        AgentEventToolCategory::Filesystem => "read",
        _ => "other",
    }
}

fn tool_output_text(output: &Value) -> String {
    match output {
        Value::String(text) => text.clone(),
        Value::Object(fields) => match fields.get("text") {
            Some(Value::String(text)) if fields.len() == 1 => text.clone(),
            _ => output.to_string(),
        },
        other => other.to_string(),
    }
}

fn stop_reason(stop: Option<AgentEventStopReason>) -> &'static str {
    match stop {
        Some(AgentEventStopReason::MaxTokens) => "max_tokens",
        Some(AgentEventStopReason::Refusal) => "refusal",
        Some(AgentEventStopReason::Cancelled) => "cancelled",
        _ => "end_turn",
    }
}

fn plan_entries(plan: &ThreadPlanNotification) -> Option<Vec<Value>> {
    let status = |status: DeveloperStepStatus| match status {
        DeveloperStepStatus::InProgress => "in_progress",
        DeveloperStepStatus::Done
        | DeveloperStepStatus::Skipped
        | DeveloperStepStatus::Superseded => "completed",
        DeveloperStepStatus::Pending | DeveloperStepStatus::Blocked => "pending",
    };
    if let Some(todos) = &plan.todos {
        return Some(
            todos
                .iter()
                .map(|todo| {
                    let priority = match todo.priority.as_str() {
                        "high" | "low" => todo.priority.as_str(),
                        _ => "medium",
                    };
                    json!({ "content": todo.content, "priority": priority, "status": status(todo.status) })
                })
                .collect(),
        );
    }
    plan.plan.as_ref().map(|steps| {
        steps
            .iter()
            .map(|step| {
                json!({ "content": step.description, "priority": "medium", "status": status(step.status) })
            })
            .collect()
    })
}

fn prompt_text(prompt: Option<&Value>) -> Result<String, RpcError> {
    let blocks = prompt
        .and_then(Value::as_array)
        .ok_or_else(|| RpcError::new(INVALID_PARAMS, "session/prompt needs a prompt array"))?;
    let mut parts = Vec::new();
    for block in blocks {
        match block.get("type").and_then(Value::as_str) {
            Some("text") => {
                if let Some(text) = block.get("text").and_then(Value::as_str) {
                    parts.push(text.to_string());
                }
            }
            Some("resource_link") => {
                let uri = block.get("uri").and_then(Value::as_str).unwrap_or_default();
                let name = block.get("name").and_then(Value::as_str).unwrap_or(uri);
                parts.push(format!("[{name}]({uri})"));
            }
            Some("resource") => {
                let resource = block.get("resource").cloned().unwrap_or(Value::Null);
                let uri = resource
                    .get("uri")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let Some(text) = resource.get("text").and_then(Value::as_str) else {
                    return Err(RpcError::new(
                        INVALID_PARAMS,
                        format!("Only text resources can be attached; {uri} is binary"),
                    ));
                };
                parts.push(format!("<context uri=\"{uri}\">\n{text}\n</context>"));
            }
            Some(other) => {
                return Err(RpcError::new(
                    INVALID_PARAMS,
                    format!("This agent does not accept {other} content in a prompt"),
                ));
            }
            None => {
                return Err(RpcError::new(
                    INVALID_PARAMS,
                    "Every prompt block needs a type",
                ));
            }
        }
    }
    let text = parts.join("\n\n");
    if text.trim().is_empty() {
        return Err(RpcError::new(INVALID_PARAMS, "The prompt is empty"));
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use agiworkforce_app_server::DeveloperConnectionTrust;
    use agiworkforce_protocol::developer_session::{
        DeveloperSessionSource, LocalModelListResponse, ModelListParams, ThreadForkParams,
        ThreadListParams, ThreadListResponse, ThreadReadResponse, ThreadSummary, TurnSteerParams,
        TurnSummary,
    };
    use async_trait::async_trait;
    use tokio::io::{DuplexStream, Lines};
    use tokio::sync::Mutex;

    #[derive(Clone, Copy)]
    enum Script {
        Answer,
        AskApproval,
        Stall,
        Fail,
    }

    struct FakeHost {
        script: Script,
        notifications: broadcast::Sender<AppServerNotification>,
        starts: Mutex<Vec<(ThreadStartParams, AppServerClientInfo)>>,
        turns: Mutex<Vec<(TurnStartParams, TurnClient)>>,
        approvals: Mutex<Vec<ApprovalResponseParams>>,
        interrupts: Mutex<Vec<TurnInterruptParams>>,
        shutdowns: Mutex<u32>,
    }

    impl FakeHost {
        fn new(script: Script) -> Arc<Self> {
            let (notifications, _) = broadcast::channel(64);
            Arc::new(Self {
                script,
                notifications,
                starts: Mutex::new(Vec::new()),
                turns: Mutex::new(Vec::new()),
                approvals: Mutex::new(Vec::new()),
                interrupts: Mutex::new(Vec::new()),
                shutdowns: Mutex::new(0),
            })
        }

        fn emit(&self, method: &str, params: Value) {
            let _ = self
                .notifications
                .send(AppServerNotification::new(method, params).expect("notification"));
        }

        fn agent_event(&self, event: Value) {
            self.emit(
                "turn/agent_event",
                json!({
                    "schemaVersion": agiworkforce_protocol::agent_events::AGENT_EVENT_SCHEMA_VERSION,
                    "sessionId": "thread-1",
                    "turnId": "turn-1",
                    "sequence": 0,
                    "emittedAtMs": 0,
                    "event": event,
                }),
            );
        }

        fn end_turn(&self, method: &str, status: &str, failure: Option<Value>) {
            self.emit(
                method,
                json!({
                    "threadId": "thread-1",
                    "turnId": "turn-1",
                    "status": status,
                    "response": "",
                    "inputTokens": 0,
                    "outputTokens": 0,
                    "error": failure.as_ref().map(|failure| failure["message"].clone()),
                    "failure": failure,
                }),
            );
        }
    }

    #[cfg(windows)]
    const WORKSPACE: &str = r"C:\workspace";
    #[cfg(not(windows))]
    const WORKSPACE: &str = "/workspace";

    fn thread() -> ThreadSummary {
        ThreadSummary {
            id: "thread-1".to_string(),
            title: "Editor session".to_string(),
            model: None,
            cwd: Some(WORKSPACE.to_string()),
            provider: Some("ollama".to_string()),
            trust_mode: DeveloperSessionTrustMode::Local,
            git_branch: None,
            worktree_root: None,
            client: None,
            repository: None,
            writer: None,
            created_at: "2026-10-22T00:00:00Z".to_string(),
            updated_at: "2026-10-22T00:00:00Z".to_string(),
            created_by: DeveloperSessionSource::Cli,
            status: ThreadStatus::Idle,
            location: None,
        }
    }

    fn unused() -> DeveloperSessionHostError {
        DeveloperSessionHostError::internal("not used by the ACP adapter")
    }

    #[async_trait]
    impl DeveloperSessionHost for FakeHost {
        async fn start_thread(
            &self,
            params: ThreadStartParams,
            client: AppServerClientInfo,
        ) -> Result<ThreadSummary, DeveloperSessionHostError> {
            self.starts.lock().await.push((params, client));
            Ok(thread())
        }

        async fn list_threads(
            &self,
            _params: ThreadListParams,
        ) -> Result<ThreadListResponse, DeveloperSessionHostError> {
            Err(unused())
        }

        async fn list_local_models(
            &self,
            _params: ModelListParams,
            _trust: DeveloperConnectionTrust,
        ) -> Result<LocalModelListResponse, DeveloperSessionHostError> {
            Err(unused())
        }

        async fn resume_thread(
            &self,
            _params: ThreadIdParams,
        ) -> Result<ThreadSummary, DeveloperSessionHostError> {
            Err(unused())
        }

        async fn read_thread(
            &self,
            _params: ThreadIdParams,
        ) -> Result<ThreadReadResponse, DeveloperSessionHostError> {
            Err(unused())
        }

        async fn fork_thread(
            &self,
            _params: ThreadForkParams,
            _client: AppServerClientInfo,
        ) -> Result<ThreadSummary, DeveloperSessionHostError> {
            Err(unused())
        }

        async fn archive_thread(
            &self,
            _params: ThreadIdParams,
        ) -> Result<(), DeveloperSessionHostError> {
            Err(unused())
        }

        async fn start_turn(
            &self,
            params: TurnStartParams,
        ) -> Result<TurnSummary, DeveloperSessionHostError> {
            self.start_turn_for(params, TurnClient::default()).await
        }

        async fn start_turn_for(
            &self,
            params: TurnStartParams,
            client: TurnClient,
        ) -> Result<TurnSummary, DeveloperSessionHostError> {
            self.turns.lock().await.push((params, client));
            self.emit(
                "turn/started",
                json!({ "threadId": "thread-1", "turnId": "turn-1" }),
            );
            match self.script {
                Script::Answer => {
                    self.emit(
                        "turn/output_delta",
                        json!({ "threadId": "thread-1", "turnId": "turn-1", "delta": "Hello", "index": 0 }),
                    );
                    self.agent_event(json!({
                        "type": "tool-execution-start",
                        "toolCallId": "call-1",
                        "name": "read_file",
                        "category": "filesystem",
                        "summary": "Read src/main.rs",
                        "input": { "path": "src/main.rs" },
                    }));
                    self.agent_event(json!({
                        "type": "tool-execution-end",
                        "toolCallId": "call-1",
                        "name": "read_file",
                        "output": { "text": "fn main() {}" },
                        "isError": false,
                    }));
                    self.agent_event(json!({ "type": "stop", "reason": "max-tokens" }));
                    self.end_turn("turn/completed", "completed", None);
                }
                Script::AskApproval => {
                    self.emit(
                        "approval/requested",
                        json!({
                            "threadId": "thread-1",
                            "turnId": "turn-1",
                            "requestId": "approval-1",
                            "kind": "Exec { command: \"git status\" }",
                            "summary": "Run git status",
                            "detail": "git status",
                            "alwaysAllowSaved": false,
                            "proposedExecpolicyAmendment": ["git", "status"],
                            "question": null,
                        }),
                    );
                }
                Script::Stall => {}
                Script::Fail => {
                    self.end_turn(
                        "turn/failed",
                        "failed",
                        Some(json!({
                            "code": "provider_unavailable",
                            "message": "The provider is unavailable.",
                            "retryable": true,
                            "action": "retry",
                        })),
                    );
                }
            }
            Ok(TurnSummary {
                id: "turn-1".to_string(),
                thread_id: "thread-1".to_string(),
                status: TurnStatus::Running,
            })
        }

        async fn steer_turn(
            &self,
            _params: TurnSteerParams,
        ) -> Result<TurnSummary, DeveloperSessionHostError> {
            Err(unused())
        }

        async fn interrupt_turn(
            &self,
            params: TurnInterruptParams,
        ) -> Result<(), DeveloperSessionHostError> {
            self.interrupts.lock().await.push(params);
            self.emit(
                "turn/interrupted",
                json!({ "threadId": "thread-1", "turnId": "turn-1", "status": "interrupted" }),
            );
            Ok(())
        }

        async fn respond_to_approval(
            &self,
            params: ApprovalResponseParams,
        ) -> Result<(), DeveloperSessionHostError> {
            let abort = params.decision == ReviewDecision::Abort;
            self.approvals.lock().await.push(params);
            if !abort {
                self.end_turn("turn/completed", "completed", None);
            }
            Ok(())
        }

        async fn shutdown(&self) -> Result<(), DeveloperSessionHostError> {
            *self.shutdowns.lock().await += 1;
            Ok(())
        }

        fn subscribe(&self) -> broadcast::Receiver<AppServerNotification> {
            self.notifications.subscribe()
        }
    }

    struct Client {
        input: DuplexStream,
        output: Lines<BufReader<DuplexStream>>,
        server: tokio::task::JoinHandle<Result<()>>,
    }

    impl Client {
        fn start(host: Arc<FakeHost>) -> Self {
            let (input, server_input) = tokio::io::duplex(1 << 16);
            let (server_output, output) = tokio::io::duplex(1 << 16);
            let server = tokio::spawn(serve_acp(server_input, server_output, host));
            Self {
                input,
                output: BufReader::new(output).lines(),
                server,
            }
        }

        async fn send(&mut self, message: Value) {
            let mut line = serde_json::to_vec(&message).expect("json");
            line.push(b'\n');
            self.input.write_all(&line).await.expect("write");
        }

        async fn next(&mut self) -> Value {
            let line =
                tokio::time::timeout(std::time::Duration::from_secs(5), self.output.next_line())
                    .await
                    .expect("the agent answered in time")
                    .expect("read")
                    .expect("the agent kept the connection open");
            serde_json::from_str(&line).expect("one JSON value per line")
        }

        async fn response(&mut self, id: u64, seen: &mut Vec<Value>) -> Value {
            loop {
                let message = self.next().await;
                if message.get("id") == Some(&json!(id)) && message.get("method").is_none() {
                    return message;
                }
                seen.push(message);
            }
        }

        async fn open_session(&mut self) -> String {
            self.send(json!({
                "jsonrpc": "2.0", "id": 0, "method": "initialize",
                "params": {
                    "protocolVersion": 1,
                    "clientCapabilities": { "fs": { "readTextFile": true, "writeTextFile": true }, "terminal": true },
                    "clientInfo": { "name": "zed", "title": "Zed", "version": "1.0.0" },
                },
            }))
            .await;
            self.response(0, &mut Vec::new()).await;
            self.send(json!({
                "jsonrpc": "2.0", "id": 1, "method": "session/new",
                "params": { "cwd": WORKSPACE, "mcpServers": [] },
            }))
            .await;
            let created = self.response(1, &mut Vec::new()).await;
            created["result"]["sessionId"]
                .as_str()
                .expect("session id")
                .to_string()
        }

        async fn prompt(&mut self, session_id: &str) {
            self.send(json!({
                "jsonrpc": "2.0", "id": 2, "method": "session/prompt",
                "params": {
                    "sessionId": session_id,
                    "prompt": [{ "type": "text", "text": "Explain main.rs" }],
                },
            }))
            .await;
        }

        async fn close(self) -> Result<()> {
            drop(self.input);
            self.server.await.expect("server task")
        }
    }

    fn updates(messages: &[Value]) -> Vec<Value> {
        messages
            .iter()
            .filter(|message| message["method"] == "session/update")
            .map(|message| message["params"]["update"].clone())
            .collect()
    }

    #[tokio::test]
    async fn handshake_pins_the_protocol_version_and_maps_a_session_to_a_thread() {
        let host = FakeHost::new(Script::Answer);
        let mut client = Client::start(host.clone());

        client
            .send(json!({
                "jsonrpc": "2.0", "id": 7, "method": "session/new",
                "params": { "cwd": WORKSPACE, "mcpServers": [] },
            }))
            .await;
        let early = client.response(7, &mut Vec::new()).await;
        assert_eq!(early["error"]["code"], INVALID_REQUEST);

        client
            .send(json!({
                "jsonrpc": "2.0", "id": 0, "method": "initialize",
                "params": {
                    "protocolVersion": 3,
                    "clientInfo": { "name": "zed", "title": "Zed", "version": "1.0.0" },
                },
            }))
            .await;
        let initialized = client.response(0, &mut Vec::new()).await;
        let result = &initialized["result"];
        assert_eq!(result["protocolVersion"], json!(ACP_PROTOCOL_VERSION));
        assert_eq!(result["agentCapabilities"]["loadSession"], false);
        assert_eq!(
            result["agentCapabilities"]["promptCapabilities"]["embeddedContext"],
            true
        );
        assert_eq!(
            result["agentCapabilities"]["promptCapabilities"]["image"],
            false
        );
        assert_eq!(result["agentInfo"]["title"], crate::PRODUCT_NAME);
        assert_eq!(result["authMethods"], json!([]));

        client
            .send(json!({
                "jsonrpc": "2.0", "id": 1, "method": "session/new",
                "params": { "cwd": "relative/path", "mcpServers": [] },
            }))
            .await;
        let relative = client.response(1, &mut Vec::new()).await;
        assert_eq!(relative["error"]["code"], INVALID_PARAMS);

        client
            .send(json!({
                "jsonrpc": "2.0", "id": 2, "method": "session/new",
                "params": { "cwd": WORKSPACE, "mcpServers": [] },
            }))
            .await;
        let created = client.response(2, &mut Vec::new()).await;
        assert_eq!(created["result"]["sessionId"], "thread-1");
        let starts = host.starts.lock().await.clone();
        assert_eq!(starts.len(), 1);
        assert_eq!(starts[0].0.cwd.as_deref(), Some(WORKSPACE));
        assert_eq!(starts[0].1.name, "zed");

        client
            .send(json!({ "jsonrpc": "2.0", "id": 3, "method": "session/load", "params": {} }))
            .await;
        let load = client.response(3, &mut Vec::new()).await;
        assert_eq!(load["error"]["code"], METHOD_NOT_FOUND);

        client.close().await.expect("clean shutdown");
        assert_eq!(*host.shutdowns.lock().await, 1);
    }

    #[tokio::test]
    async fn a_prompt_turn_streams_text_and_tool_calls_before_its_stop_reason() {
        let host = FakeHost::new(Script::Answer);
        let mut client = Client::start(host.clone());
        let session_id = client.open_session().await;
        client.prompt(&session_id).await;

        let mut seen = Vec::new();
        let finished = client.response(2, &mut seen).await;
        assert_eq!(finished["result"]["stopReason"], "max_tokens");

        let updates = updates(&seen);
        assert_eq!(updates[0]["sessionUpdate"], "agent_message_chunk");
        assert_eq!(updates[0]["content"]["text"], "Hello");
        assert_eq!(updates[1]["sessionUpdate"], "tool_call");
        assert_eq!(updates[1]["toolCallId"], "call-1");
        assert_eq!(updates[1]["kind"], "read");
        assert_eq!(updates[1]["status"], "in_progress");
        assert_eq!(updates[2]["sessionUpdate"], "tool_call_update");
        assert_eq!(updates[2]["status"], "completed");
        assert_eq!(updates[2]["content"][0]["content"]["text"], "fn main() {}");

        let turns = host.turns.lock().await.clone();
        assert_eq!(turns.len(), 1);
        assert_eq!(turns[0].0.thread_id, "thread-1");
        assert_eq!(turns[0].0.cwd.as_deref(), Some(WORKSPACE));
        assert!(!turns[0].1.answers_user_input);
        client.close().await.expect("clean shutdown");
    }

    #[tokio::test]
    async fn a_failed_turn_answers_the_prompt_with_the_failure() {
        let host = FakeHost::new(Script::Fail);
        let mut client = Client::start(host);
        let session_id = client.open_session().await;
        client.prompt(&session_id).await;

        let failed = client.response(2, &mut Vec::new()).await;
        assert_eq!(failed["error"]["code"], INTERNAL_ERROR);
        assert_eq!(failed["error"]["message"], "The provider is unavailable.");
        assert_eq!(failed["error"]["data"]["code"], "provider_unavailable");
        client.close().await.expect("clean shutdown");
    }

    #[tokio::test]
    async fn a_permission_request_goes_to_the_editor_and_its_answer_reaches_the_host() {
        let host = FakeHost::new(Script::AskApproval);
        let mut client = Client::start(host.clone());
        let session_id = client.open_session().await;
        client.prompt(&session_id).await;

        let asked = client.next().await;
        assert_eq!(asked["method"], "session/request_permission");
        assert_eq!(asked["params"]["sessionId"], "thread-1");
        assert_eq!(asked["params"]["toolCall"]["kind"], "execute");
        assert_eq!(asked["params"]["toolCall"]["status"], "pending");
        let options = asked["params"]["options"]
            .as_array()
            .expect("options")
            .clone();
        let kinds: Vec<&str> = options
            .iter()
            .map(|option| option["kind"].as_str().expect("kind"))
            .collect();
        assert_eq!(
            kinds,
            ["allow_once", "allow_always", "allow_always", "reject_once"]
        );
        assert_eq!(options[2]["name"], "Always allow git status");

        client
            .send(json!({
                "jsonrpc": "2.0",
                "id": asked["id"],
                "result": { "outcome": { "outcome": "selected", "optionId": options[2]["optionId"] } },
            }))
            .await;
        let mut seen = Vec::new();
        let finished = client.response(2, &mut seen).await;
        assert_eq!(finished["result"]["stopReason"], "end_turn");
        let resolved = updates(&seen);
        assert_eq!(resolved[0]["toolCallId"], "approval-approval-1");
        assert_eq!(resolved[0]["status"], "completed");

        let approvals = host.approvals.lock().await.clone();
        assert_eq!(approvals.len(), 1);
        assert_eq!(approvals[0].request_id, "approval-1");
        assert_eq!(approvals[0].turn_id, "turn-1");
        assert_eq!(
            approvals[0].decision,
            ReviewDecision::ApprovedExecpolicyAmendment {
                proposed_execpolicy_amendment: ExecPolicyAmendment::new(vec![
                    "git".to_string(),
                    "status".to_string()
                ]),
            }
        );
        client.close().await.expect("clean shutdown");
    }

    #[tokio::test]
    async fn cancel_interrupts_the_turn_and_answers_cancelled() {
        let host = FakeHost::new(Script::AskApproval);
        let mut client = Client::start(host.clone());
        let session_id = client.open_session().await;
        client.prompt(&session_id).await;

        let asked = client.next().await;
        assert_eq!(asked["method"], "session/request_permission");
        client
            .send(json!({
                "jsonrpc": "2.0", "method": "session/cancel",
                "params": { "sessionId": session_id },
            }))
            .await;
        client
            .send(json!({
                "jsonrpc": "2.0",
                "id": asked["id"],
                "result": { "outcome": { "outcome": "cancelled" } },
            }))
            .await;

        let finished = client.response(2, &mut Vec::new()).await;
        assert_eq!(finished["result"]["stopReason"], "cancelled");
        let interrupts = host.interrupts.lock().await.clone();
        assert_eq!(interrupts.len(), 1);
        assert_eq!(interrupts[0].turn_id, "turn-1");

        tokio::time::timeout(std::time::Duration::from_secs(5), async {
            while host.approvals.lock().await.is_empty() {
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("the cancelled permission reached the host");
        assert_eq!(
            host.approvals.lock().await[0].decision,
            ReviewDecision::Abort
        );
        client.close().await.expect("clean shutdown");
    }

    #[tokio::test]
    async fn cancel_before_the_turn_reports_back_still_stops_it() {
        let host = FakeHost::new(Script::Stall);
        let mut client = Client::start(host.clone());
        let session_id = client.open_session().await;
        client.prompt(&session_id).await;
        client
            .send(json!({
                "jsonrpc": "2.0", "method": "session/cancel",
                "params": { "sessionId": session_id },
            }))
            .await;

        let finished = client.response(2, &mut Vec::new()).await;
        assert_eq!(finished["result"]["stopReason"], "cancelled");
        assert_eq!(host.interrupts.lock().await.len(), 1);
        client.close().await.expect("clean shutdown");
    }

    #[test]
    fn a_question_offers_each_answer_and_a_skip() {
        let choices = permission_choices(&json!({
            "question": { "question": "Which branch?", "options": ["main", "dev"] },
        }));
        let names: Vec<&str> = choices.iter().map(|choice| choice.name.as_str()).collect();
        assert_eq!(names, ["main", "dev", "Skip"]);
        assert_eq!(choices[1].note.as_deref(), Some("dev"));
        assert_eq!(choices[2].decision, ReviewDecision::Denied);
    }

    #[test]
    fn prompt_blocks_become_one_message_and_unsupported_ones_are_refused() {
        let text = prompt_text(Some(&json!([
            { "type": "text", "text": "Review this" },
            { "type": "resource_link", "uri": "file:///workspace/a.rs", "name": "a.rs" },
            { "type": "resource", "resource": { "uri": "file:///workspace/b.rs", "text": "fn b() {}" } },
        ])))
        .expect("text prompt");
        assert_eq!(
            text,
            "Review this\n\n[a.rs](file:///workspace/a.rs)\n\n<context uri=\"file:///workspace/b.rs\">\nfn b() {}\n</context>"
        );

        let image = prompt_text(Some(&json!([
            { "type": "image", "data": "", "mimeType": "image/png" },
        ])))
        .expect_err("images are not advertised");
        assert_eq!(image.code, INVALID_PARAMS);
        let blob = prompt_text(Some(&json!([
            { "type": "resource", "resource": { "uri": "file:///x.bin", "blob": "AA==" } },
        ])))
        .expect_err("binary resources are refused");
        assert_eq!(blob.code, INVALID_PARAMS);
    }
}
