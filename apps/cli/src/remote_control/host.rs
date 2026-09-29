use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;

use agiworkforce_app_server::DeveloperSessionHost;
use agiworkforce_protocol::developer_session::{
    AppServerClientInfo, AppServerNotification, DeveloperFileChangeKind, DeveloperSessionSource,
    ThreadIdParams, ThreadListParams, ThreadLocation, ThreadStartParams, ThreadStatus,
};
use serde_json::{json, Value};

const PROTOCOL_VERSION: u64 = 1;
const ID_LENGTH: usize = 128;
const GUIDANCE_LENGTH: usize = 2_000;
const TASK_LENGTH: usize = 8_000;
const TITLE_LENGTH: usize = 500;
const TRANSCRIPT_MESSAGES: usize = 12;
const MESSAGE_LENGTH: usize = 2_000;
const PARTIAL_RESPONSE_LENGTH: usize = 4_000;
const DELTA_LENGTH: usize = 2_000;
const FILE_CHANGES: usize = 60;
const DIFF_LENGTH: usize = 8_000;
const QUEUED_GUIDANCE: usize = 3;
const SESSIONS: u32 = 30;
const TOOLS: usize = 20;
const TOOL_OUTPUT_LENGTH: usize = 1_500;
const HISTORY_MESSAGES: usize = 40;
const HISTORY_MESSAGE_LENGTH: usize = 8_000;
const PAYLOAD_BYTES: usize = 40_000;
const PROMPT_LENGTH: usize = 20_000;
const APPROVAL_SUMMARY_FALLBACK: &str = "The agent needs approval to continue.";
const CLIENT_NAME: &str = "agi-remote-control";
const START_WINDOW: std::time::Duration = std::time::Duration::from_secs(600);
const STARTS_PER_WINDOW: usize = 10;
const CONCURRENT_PHONE_SESSIONS: usize = 8;
const FOLDER_UNAVAILABLE: &str = "AGI Code could not open this folder. Check it in the terminal.";
const START_FAILED: &str =
    "The session could not be started in this terminal. Try again, or start it there.";
const TOO_MANY_STARTS: &str =
    "Too many sessions were started from the phone just now. Wait a few minutes.";
const TOO_MANY_RUNNING: &str =
    "Several sessions started from the phone are still running. Stop one, or wait for one to finish.";
const RUNTIME_STOPPED: &str = "AGI Code stopped in this terminal. Start it there again.";
const TASK_FAILED: &str = "The task failed in this terminal. Open it there to see why.";

pub type Outgoing = (String, Value);

#[derive(Clone)]
struct PendingApproval {
    turn_id: String,
    summary: String,
    detail: String,
}

#[derive(Default)]
struct ThreadState {
    attached: bool,
    active_turn_id: Option<String>,
    partial_response: String,
    pending_approvals: BTreeMap<String, PendingApproval>,
    tools: Vec<Value>,
    queued_guidance: Vec<String>,
}

struct DispatchedTask {
    request_id: String,
    thread_id: String,
    turn_id: String,
}

pub struct CodeHost<H: DeveloperSessionHost> {
    host: Arc<H>,
    root_id: String,
    folder: String,
    cwd: String,
    threads: HashMap<String, ThreadState>,
    dispatches: Vec<DispatchedTask>,
    phone_starts: std::collections::VecDeque<std::time::Instant>,
    phone_threads: std::collections::HashSet<String>,
}

fn clip_tail(value: &str, limit: usize) -> String {
    let count = value.chars().count();
    if count <= limit {
        return value.to_string();
    }
    value.chars().skip(count - limit).collect()
}

fn clip_head(value: &str, limit: usize) -> String {
    value.chars().take(limit).collect()
}

fn safe_tail(value: &str, limit: usize) -> String {
    clip_tail(&crate::secret_redaction::redact_tool_output(value), limit)
}

fn snapshot_partial(partial: &str) -> String {
    safe_tail(partial, PARTIAL_RESPONSE_LENGTH)
}

fn safe_head(value: &str, limit: usize) -> String {
    clip_head(&crate::secret_redaction::redact_tool_output(value), limit)
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn bounded_id(value: Option<&Value>) -> Option<String> {
    let text = value?.as_str()?.trim();
    (!text.is_empty() && text.len() <= ID_LENGTH).then(|| text.to_string())
}

fn status_name(status: &ThreadStatus) -> &'static str {
    match status {
        ThreadStatus::Idle => "idle",
        ThreadStatus::Running => "running",
        ThreadStatus::AwaitingApproval => "awaiting_approval",
        ThreadStatus::Failed => "failed",
        _ => "unknown",
    }
}

fn origin_name(source: DeveloperSessionSource) -> Option<&'static str> {
    match source {
        DeveloperSessionSource::Cli => Some("cli"),
        DeveloperSessionSource::Vscode => Some("vscode"),
        DeveloperSessionSource::Desktop => Some("desktop"),
        DeveloperSessionSource::Unknown => None,
    }
}

fn user_text(text: &str) -> Value {
    json!([{ "type": "text", "text": text, "text_elements": [] }])
}

fn fit_payload(payload: &mut Value) {
    let size = |value: &Value| value.to_string().len();
    for field in ["tools", "messages", "fileChanges"] {
        while size(payload) > PAYLOAD_BYTES {
            let Some(list) = payload.get_mut(field).and_then(Value::as_array_mut) else {
                break;
            };
            if list.is_empty() {
                break;
            }
            list.remove(0);
        }
    }
    if size(payload) > PAYLOAD_BYTES {
        payload["partialResponse"] = json!("");
    }
}

impl<H: DeveloperSessionHost> CodeHost<H> {
    pub fn new(host: Arc<H>, root_id: String, folder: String, cwd: String) -> Self {
        Self {
            host,
            root_id,
            folder,
            cwd,
            threads: HashMap::new(),
            dispatches: Vec::new(),
            phone_starts: std::collections::VecDeque::new(),
            phone_threads: std::collections::HashSet::new(),
        }
    }

    fn start_refusal(&mut self) -> Option<&'static str> {
        let now = std::time::Instant::now();
        while self
            .phone_starts
            .front()
            .is_some_and(|started| now.duration_since(*started) > START_WINDOW)
        {
            self.phone_starts.pop_front();
        }
        if self.phone_starts.len() >= STARTS_PER_WINDOW {
            return Some(TOO_MANY_STARTS);
        }
        let threads = &self.threads;
        self.phone_threads.retain(|thread_id| {
            threads
                .get(thread_id)
                .is_some_and(|state| state.active_turn_id.is_some())
        });
        (self.phone_threads.len() >= CONCURRENT_PHONE_SESSIONS).then_some(TOO_MANY_RUNNING)
    }

    fn record_phone_start(&mut self, thread_id: &str) {
        self.phone_starts.push_back(std::time::Instant::now());
        self.phone_threads.insert(thread_id.to_string());
    }

    pub fn reset(&mut self) {
        for state in self.threads.values_mut() {
            state.attached = false;
        }
    }

    fn client() -> AppServerClientInfo {
        AppServerClientInfo {
            name: CLIENT_NAME.to_string(),
            title: "AGI Workforce Remote Control".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
        }
    }

    fn event(&self, thread_id: &str, event: Value) -> Option<Outgoing> {
        self.threads.get(thread_id).filter(|state| state.attached)?;
        Some((
            "code.session.event".to_string(),
            json!({
                "action": "code.session.event",
                "version": PROTOCOL_VERSION,
                "rootId": self.root_id,
                "threadId": thread_id,
                "event": event,
                "sentAt": now_iso(),
            }),
        ))
    }

    fn task_status(request_id: &str, status: &str, detail: Value) -> Outgoing {
        let mut payload = json!({
            "version": PROTOCOL_VERSION,
            "requestId": request_id,
            "status": status,
            "updatedAt": now_iso(),
        });
        if let (Some(target), Some(extra)) = (payload.as_object_mut(), detail.as_object()) {
            for (key, value) in extra {
                target.insert(key.clone(), value.clone());
            }
        }
        ("dispatch.task.status".to_string(), payload)
    }

    pub async fn sessions(&self) -> Vec<Outgoing> {
        let listed = self
            .host
            .list_threads(ThreadListParams {
                cwd: Some(self.cwd.clone()),
                limit: Some(SESSIONS),
                include_cloud: true,
                ..ThreadListParams::default()
            })
            .await;
        let (threads, unavailable) = match listed {
            Ok(response) => (response.threads, Vec::new()),
            Err(error) => {
                tracing::warn!("[remote-control] sessions could not be listed: {error}");
                (
                    Vec::new(),
                    vec![json!({ "folder": self.folder, "message": FOLDER_UNAVAILABLE })],
                )
            }
        };
        let sessions: Vec<Value> = threads
            .iter()
            .map(|thread| {
                let state = self.threads.get(&thread.id);
                let status = match state {
                    Some(state) if !state.pending_approvals.is_empty() => "awaiting_approval",
                    Some(state) if state.active_turn_id.is_some() => "running",
                    _ => status_name(&thread.status),
                };
                let mut summary = json!({
                    "rootId": self.root_id,
                    "threadId": thread.id,
                    "title": clip_head(&thread.title, TITLE_LENGTH),
                    "folder": self.folder,
                    "branch": thread.git_branch,
                    "status": status,
                    "model": thread.model,
                    "updatedAt": thread.updated_at,
                });
                if let Some(origin) = origin_name(thread.created_by) {
                    summary["origin"] = json!(origin);
                }
                if thread.location == Some(ThreadLocation::Cloud) {
                    summary["location"] = json!("cloud");
                }
                summary
            })
            .collect();
        let branch = threads.first().and_then(|thread| thread.git_branch.clone());
        vec![(
            "code.sessions".to_string(),
            json!({
                "action": "code.sessions",
                "version": PROTOCOL_VERSION,
                "sessions": sessions,
                "unavailable": unavailable,
                "roots": [{
                    "rootId": self.root_id,
                    "name": self.folder,
                    "branch": branch,
                    "available": true,
                }],
                "syncedAt": now_iso(),
            }),
        )]
    }

    async fn snapshot(&mut self, thread_id: &str) -> Vec<Outgoing> {
        let params = ThreadIdParams {
            thread_id: thread_id.to_string(),
        };
        let read = match self.host.read_thread(params.clone()).await {
            Ok(read) => read,
            Err(error) => {
                tracing::warn!("[remote-control] thread could not be read: {error}");
                return self
                    .event(
                        thread_id,
                        json!({ "type": "runtime-stopped", "message": RUNTIME_STOPPED }),
                    )
                    .into_iter()
                    .collect();
            }
        };
        let active = self
            .host
            .reconnect_thread(params)
            .await
            .ok()
            .and_then(|response| response.active_turn);
        let state = self.threads.entry(thread_id.to_string()).or_default();
        if let Some(active) = &active {
            state.active_turn_id = Some(active.turn_id.clone());
            state.partial_response = safe_tail(&active.partial_response, PARTIAL_RESPONSE_LENGTH);
            for approval in &active.pending_approvals {
                state.pending_approvals.insert(
                    approval.request_id.clone(),
                    PendingApproval {
                        turn_id: active.turn_id.clone(),
                        summary: safe_head(&approval.summary, MESSAGE_LENGTH),
                        detail: safe_head(&approval.detail, MESSAGE_LENGTH),
                    },
                );
            }
        }
        let messages: Vec<Value> = read
            .messages
            .iter()
            .filter(|message| message.role == "user" || message.role == "assistant")
            .map(|message| json!({ "role": message.role, "text": safe_tail(&message.text, MESSAGE_LENGTH) }))
            .collect();
        let messages = messages[messages.len().saturating_sub(TRANSCRIPT_MESSAGES)..].to_vec();
        let file_changes: Vec<Value> = read
            .file_changes
            .iter()
            .filter_map(|change| {
                let kind = match change.kind {
                    DeveloperFileChangeKind::Created => "created",
                    DeveloperFileChangeKind::Modified => "modified",
                    _ => return None,
                };
                Some(json!({
                    "path": change.path,
                    "kind": kind,
                    "tool": clip_head(&change.tool, ID_LENGTH),
                    "changedAt": change.changed_at,
                }))
            })
            .collect();
        let file_changes = file_changes[file_changes.len().saturating_sub(FILE_CHANGES)..].to_vec();
        let status = if !state.pending_approvals.is_empty() {
            "awaiting_approval"
        } else if state.active_turn_id.is_some() {
            "running"
        } else {
            status_name(&read.thread.status)
        };
        let pending: Vec<Value> = state
            .pending_approvals
            .iter()
            .map(|(request_id, approval)| {
                json!({
                    "turnId": approval.turn_id,
                    "requestId": request_id,
                    "summary": approval.summary,
                    "detail": approval.detail,
                })
            })
            .collect();
        let mut payload = json!({
            "action": "code.session.snapshot",
            "version": PROTOCOL_VERSION,
            "rootId": self.root_id,
            "threadId": thread_id,
            "title": clip_head(&read.thread.title, TITLE_LENGTH),
            "status": status,
            "activeTurnId": state.active_turn_id,
            "partialResponse": snapshot_partial(&state.partial_response),
            "messages": messages,
            "pendingApprovals": pending,
            "fileChanges": file_changes,
            "queuedGuidance": state.queued_guidance,
            "tools": state.tools,
            "syncedAt": now_iso(),
        });
        fit_payload(&mut payload);
        vec![("code.session.snapshot".to_string(), payload)]
    }

    async fn transcript(&self, thread_id: &str, before: Option<u64>) -> Vec<Outgoing> {
        let Ok(read) = self
            .host
            .read_thread(ThreadIdParams {
                thread_id: thread_id.to_string(),
            })
            .await
        else {
            return Vec::new();
        };
        let eligible: Vec<Value> = read
            .messages
            .iter()
            .enumerate()
            .filter_map(|(position, message)| {
                let index = message.index.map(u64::from).unwrap_or(position as u64);
                let wanted = (message.role == "user" || message.role == "assistant")
                    && before.is_none_or(|limit| index < limit);
                wanted.then(|| {
                    json!({
                        "role": message.role,
                        "text": safe_tail(&message.text, HISTORY_MESSAGE_LENGTH),
                        "index": index,
                    })
                })
            })
            .collect();
        let mut page: Vec<Value> = Vec::new();
        let mut bytes = 0;
        for message in eligible.iter().rev() {
            let size = message.to_string().len() + 1;
            if page.len() >= HISTORY_MESSAGES
                || (!page.is_empty() && bytes + size > PAYLOAD_BYTES - 1_000)
            {
                break;
            }
            bytes += size;
            page.insert(0, message.clone());
        }
        let has_earlier =
            !page.is_empty() && (page.len() < eligible.len() || read.transcript_truncated);
        vec![(
            "code.session.transcript".to_string(),
            json!({
                "action": "code.session.transcript",
                "version": PROTOCOL_VERSION,
                "rootId": self.root_id,
                "threadId": thread_id,
                "before": before,
                "messages": page,
                "hasEarlier": has_earlier,
                "syncedAt": now_iso(),
            }),
        )]
    }

    async fn start_turn(&self, thread_id: &str, text: &str) -> anyhow::Result<String> {
        let params = serde_json::from_value(json!({
            "threadId": thread_id,
            "input": user_text(text),
            "cwd": self.cwd,
        }))?;
        let turn = self
            .host
            .start_turn(params)
            .await
            .map_err(|error| anyhow::anyhow!(error.to_string()))?;
        Ok(turn.id)
    }

    async fn start_thread(&self, title: &str) -> anyhow::Result<String> {
        let thread = self
            .host
            .start_thread(
                ThreadStartParams {
                    cwd: Some(self.cwd.clone()),
                    title: Some(clip_head(title, TITLE_LENGTH)),
                    ..ThreadStartParams::default()
                },
                Self::client(),
            )
            .await
            .map_err(|error| anyhow::anyhow!(error.to_string()))?;
        Ok(thread.id)
    }

    async fn interrupt(&self, thread_id: &str, turn_id: &str) {
        if let Ok(params) =
            serde_json::from_value(json!({ "threadId": thread_id, "turnId": turn_id }))
        {
            let _ = self.host.interrupt_turn(params).await;
        }
    }

    async fn deliver_guidance(&mut self, thread_id: &str) -> Vec<Outgoing> {
        let Some(state) = self.threads.get_mut(thread_id) else {
            return Vec::new();
        };
        if state.active_turn_id.is_some() || state.queued_guidance.is_empty() {
            return Vec::new();
        }
        let text = state.queued_guidance.join("\n\n");
        state.queued_guidance.clear();
        match self.start_turn(thread_id, &text).await {
            Ok(turn_id) => {
                if let Some(state) = self.threads.get_mut(thread_id) {
                    state.active_turn_id.get_or_insert(turn_id.clone());
                }
                self.event(
                    thread_id,
                    json!({ "type": "guidance-delivered", "turnId": turn_id, "queuedGuidance": [] }),
                )
                .into_iter()
                .collect()
            }
            Err(error) => {
                tracing::warn!("[remote-control] guidance could not start a turn: {error}");
                self.event(
                    thread_id,
                    json!({ "type": "runtime-stopped", "message": RUNTIME_STOPPED }),
                )
                .into_iter()
                .collect()
            }
        }
    }

    async fn start_session(
        &mut self,
        request_id: &str,
        root_id: &str,
        text: &str,
        title: Option<&str>,
    ) -> Vec<Outgoing> {
        let reply = |thread_id: Option<&str>, error: Option<String>| {
            (
                "code.session.started".to_string(),
                json!({
                    "action": "code.session.started",
                    "version": PROTOCOL_VERSION,
                    "requestId": request_id,
                    "rootId": root_id,
                    "threadId": thread_id,
                    "error": error,
                    "sentAt": now_iso(),
                }),
            )
        };
        if root_id != self.root_id {
            return vec![reply(
                None,
                Some("That folder is not served by this terminal.".to_string()),
            )];
        }
        if let Some(refusal) = self.start_refusal() {
            return vec![reply(None, Some(refusal.to_string()))];
        }
        let title = title
            .map(str::to_string)
            .unwrap_or_else(|| clip_head(text, TITLE_LENGTH));
        let started = async {
            let thread_id = self.start_thread(&title).await?;
            let turn_id = self.start_turn(&thread_id, text).await?;
            anyhow::Ok((thread_id, turn_id))
        }
        .await;
        match started {
            Ok((thread_id, turn_id)) => {
                self.threads
                    .entry(thread_id.clone())
                    .or_default()
                    .active_turn_id = Some(turn_id);
                self.record_phone_start(&thread_id);
                let mut out = vec![reply(Some(&thread_id), None)];
                out.extend(self.sessions().await);
                out
            }
            Err(error) => {
                tracing::warn!("[remote-control] session start failed: {error}");
                vec![reply(None, Some(START_FAILED.to_string()))]
            }
        }
    }

    async fn dispatch_create(
        &mut self,
        request_id: &str,
        prompt: &str,
        title: Option<&str>,
    ) -> Vec<Outgoing> {
        if let Some(refusal) = self.start_refusal() {
            return vec![Self::task_status(
                request_id,
                "rejected",
                json!({ "error": refusal }),
            )];
        }
        let title = title
            .map(str::to_string)
            .unwrap_or_else(|| clip_head(prompt, TITLE_LENGTH));
        let started = async {
            let thread_id = self.start_thread(&title).await?;
            let turn_id = self.start_turn(&thread_id, prompt).await?;
            anyhow::Ok((thread_id, turn_id))
        }
        .await;
        match started {
            Ok((thread_id, turn_id)) => {
                self.threads
                    .entry(thread_id.clone())
                    .or_default()
                    .active_turn_id = Some(turn_id.clone());
                self.record_phone_start(&thread_id);
                self.dispatches.push(DispatchedTask {
                    request_id: request_id.to_string(),
                    thread_id: thread_id.clone(),
                    turn_id,
                });
                let mut out = vec![Self::task_status(
                    request_id,
                    "running",
                    json!({ "taskId": thread_id, "message": format!("Started in {}.", self.folder) }),
                )];
                out.extend(self.sessions().await);
                out
            }
            Err(error) => {
                tracing::warn!("[remote-control] dispatched task failed to start: {error}");
                vec![Self::task_status(
                    request_id,
                    "failed",
                    json!({ "error": START_FAILED }),
                )]
            }
        }
    }

    async fn answer(&mut self, thread_id: &str, request_id: &str, approved: bool) -> Vec<Outgoing> {
        let Some(approval) = self
            .threads
            .get(thread_id)
            .and_then(|state| state.pending_approvals.get(request_id))
            .cloned()
        else {
            return Vec::new();
        };
        let Ok(params) = serde_json::from_value(json!({
            "threadId": thread_id,
            "turnId": approval.turn_id,
            "requestId": request_id,
            "decision": if approved { "approved" } else { "denied" },
        })) else {
            return Vec::new();
        };
        if self.host.respond_to_approval(params).await.is_err() {
            return Vec::new();
        }
        if let Some(state) = self.threads.get_mut(thread_id) {
            state.pending_approvals.remove(request_id);
        }
        self.event(
            thread_id,
            json!({ "type": "approval-answered", "requestId": request_id, "approved": approved }),
        )
        .into_iter()
        .collect()
    }

    pub async fn handle_control(&mut self, action: &str, payload: &Value) -> Vec<Outgoing> {
        if payload.get("version").and_then(Value::as_u64) != Some(PROTOCOL_VERSION) {
            return Vec::new();
        }
        let Some(request_id) = bounded_id(payload.get("requestId")) else {
            return Vec::new();
        };
        match action {
            "code.sessions.list" | "sync_request" => return self.sessions().await,
            "code.session.start" => {
                let (Some(root_id), Some(text)) = (
                    bounded_id(payload.get("rootId")),
                    payload.get("text").and_then(Value::as_str).map(str::trim),
                ) else {
                    return Vec::new();
                };
                if text.is_empty() || text.chars().count() > TASK_LENGTH {
                    return Vec::new();
                }
                let title = payload.get("title").and_then(Value::as_str).map(str::trim);
                return self.start_session(&request_id, &root_id, text, title).await;
            }
            "dispatch.task.create" => {
                let Some(prompt) = payload.get("prompt").and_then(Value::as_str).map(str::trim)
                else {
                    return Vec::new();
                };
                if prompt.is_empty() || prompt.chars().count() > PROMPT_LENGTH {
                    return Vec::new();
                }
                let title = payload.get("title").and_then(Value::as_str).map(str::trim);
                return self.dispatch_create(&request_id, prompt, title).await;
            }
            "dispatch.task.reply" => {
                let Some(task_request_id) = bounded_id(payload.get("taskRequestId")) else {
                    return Vec::new();
                };
                let Some(thread_id) = self
                    .dispatches
                    .iter()
                    .find(|task| task.request_id == task_request_id)
                    .map(|task| task.thread_id.clone())
                else {
                    return Vec::new();
                };
                let replies = payload
                    .get("replies")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                let mut out = Vec::new();
                for reply in replies.iter().take(10) {
                    if reply.get("kind").and_then(Value::as_str) != Some("approval") {
                        continue;
                    }
                    let (Some(tool_call_id), Some(approved)) = (
                        bounded_id(reply.get("toolCallId")),
                        reply.get("approved").and_then(Value::as_bool),
                    ) else {
                        continue;
                    };
                    out.extend(self.answer(&thread_id, &tool_call_id, approved).await);
                }
                return out;
            }
            "dispatch.task.cancel" => {
                let Some(task) = self
                    .dispatches
                    .iter()
                    .find(|task| task.request_id == request_id)
                else {
                    return vec![Self::task_status(
                        &request_id,
                        "rejected",
                        json!({ "error": "No matching task is running in this terminal." }),
                    )];
                };
                let (thread_id, turn_id) = (task.thread_id.clone(), task.turn_id.clone());
                self.interrupt(&thread_id, &turn_id).await;
                return Vec::new();
            }
            _ => {}
        }
        let (Some(root_id), Some(thread_id)) = (
            bounded_id(payload.get("rootId")),
            bounded_id(payload.get("threadId")),
        ) else {
            return Vec::new();
        };
        if root_id != self.root_id {
            return Vec::new();
        }
        match action {
            "code.session.attach" => {
                self.threads.entry(thread_id.clone()).or_default().attached = true;
                self.snapshot(&thread_id).await
            }
            "code.session.detach" => {
                if let Some(state) = self.threads.get_mut(&thread_id) {
                    state.attached = false;
                }
                Vec::new()
            }
            "code.session.history" => {
                let before = match payload.get("before") {
                    None | Some(Value::Null) => None,
                    Some(value) => match value.as_u64() {
                        Some(before) => Some(before),
                        None => return Vec::new(),
                    },
                };
                self.transcript(&thread_id, before).await
            }
            "code.session.steer" => {
                let Some(text) = payload.get("text").and_then(Value::as_str).map(str::trim) else {
                    return Vec::new();
                };
                if text.is_empty() || text.chars().count() > GUIDANCE_LENGTH {
                    return Vec::new();
                }
                let interrupt = payload.get("interrupt").and_then(Value::as_bool) == Some(true);
                let state = self.threads.entry(thread_id.clone()).or_default();
                if state.queued_guidance.len() >= QUEUED_GUIDANCE {
                    state.queued_guidance.remove(0);
                }
                state.queued_guidance.push(text.to_string());
                let Some(active) = state.active_turn_id.clone() else {
                    return self.deliver_guidance(&thread_id).await;
                };
                let queued = state.queued_guidance.clone();
                let out = self
                    .event(
                        &thread_id,
                        json!({ "type": "guidance-queued", "queuedGuidance": queued }),
                    )
                    .into_iter()
                    .collect();
                if interrupt {
                    self.interrupt(&thread_id, &active).await;
                }
                out
            }
            "code.turn.interrupt" => {
                if let Some(turn_id) = bounded_id(payload.get("turnId")) {
                    self.interrupt(&thread_id, &turn_id).await;
                }
                Vec::new()
            }
            "code.approval.respond" => {
                let (Some(approval_id), Some(approved)) = (
                    bounded_id(payload.get("approvalRequestId")),
                    payload.get("approved").and_then(Value::as_bool),
                ) else {
                    return Vec::new();
                };
                self.answer(&thread_id, &approval_id, approved).await
            }
            _ => Vec::new(),
        }
    }

    fn record_tool(state: &mut ThreadState, tool: Value) {
        let id = tool["toolCallId"].clone();
        state.tools.retain(|entry| entry["toolCallId"] != id);
        state.tools.push(tool);
        if state.tools.len() > TOOLS {
            state.tools.remove(0);
        }
    }

    fn settle_tools(state: &mut ThreadState) {
        for tool in &mut state.tools {
            if tool["state"] == "running" {
                tool["state"] = json!("failed");
            }
        }
    }

    pub async fn handle_notification(
        &mut self,
        notification: &AppServerNotification,
    ) -> Vec<Outgoing> {
        let params = &notification.params;
        let text =
            |value: &Value, key: &str| value.get(key).and_then(Value::as_str).map(str::to_string);
        if notification.method == "turn/agent_event" {
            let (Some(thread_id), Some(turn_id), Some(event)) = (
                text(params, "sessionId"),
                text(params, "turnId"),
                params.get("event"),
            ) else {
                return Vec::new();
            };
            let kind = event
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if kind == "turn-diff" {
                let diff = crate::secret_redaction::redact_tool_output(
                    &text(event, "unifiedDiff").unwrap_or_default(),
                );
                let mut out = Vec::new();
                for section in diff
                    .split("diff --git ")
                    .filter(|section| !section.trim().is_empty())
                {
                    let patch = format!("diff --git {}", section.trim_end());
                    let Some(path) = patch
                        .lines()
                        .find_map(|line| line.strip_prefix("+++ b/"))
                        .map(str::to_string)
                    else {
                        continue;
                    };
                    out.extend(self.event(
                        &thread_id,
                        json!({
                            "type": "diff",
                            "diff": {
                                "path": path,
                                "patch": clip_head(&patch, DIFF_LENGTH),
                                "truncated": patch.chars().count() > DIFF_LENGTH,
                            },
                        }),
                    ));
                }
                return out;
            }
            let (Some(tool_call_id), Some(name)) = (text(event, "toolCallId"), text(event, "name"))
            else {
                return Vec::new();
            };
            if tool_call_id.len() > ID_LENGTH {
                return Vec::new();
            }
            let name = clip_head(&name, ID_LENGTH);
            let state = self.threads.entry(thread_id.clone()).or_default();
            if kind == "tool-execution-start" {
                let summary = safe_head(
                    &text(event, "summary").unwrap_or_else(|| name.clone()),
                    MESSAGE_LENGTH,
                );
                Self::record_tool(
                    state,
                    json!({ "toolCallId": tool_call_id, "name": name, "summary": summary, "state": "running", "output": "" }),
                );
                return self
                    .event(
                        &thread_id,
                        json!({ "type": "tool-started", "turnId": turn_id, "toolCallId": tool_call_id, "name": name, "summary": summary }),
                    )
                    .into_iter()
                    .collect();
            }
            if kind == "tool-execution-end" {
                let output = match event.get("output") {
                    Some(Value::String(output)) => output.clone(),
                    Some(Value::Null) | None => String::new(),
                    Some(other) => other.to_string(),
                };
                let output = safe_tail(&output, TOOL_OUTPUT_LENGTH);
                let is_error = event.get("isError").and_then(Value::as_bool) == Some(true);
                let summary = state
                    .tools
                    .iter()
                    .find(|tool| tool["toolCallId"] == tool_call_id.as_str())
                    .and_then(|tool| tool["summary"].as_str().map(str::to_string))
                    .unwrap_or_else(|| name.clone());
                Self::record_tool(
                    state,
                    json!({
                        "toolCallId": tool_call_id,
                        "name": name,
                        "summary": summary,
                        "state": if is_error { "failed" } else { "done" },
                        "output": output,
                    }),
                );
                return self
                    .event(
                        &thread_id,
                        json!({ "type": "tool-finished", "turnId": turn_id, "toolCallId": tool_call_id, "name": name, "isError": is_error, "output": output }),
                    )
                    .into_iter()
                    .collect();
            }
            return Vec::new();
        }

        let (Some(thread_id), Some(turn_id)) = (text(params, "threadId"), text(params, "turnId"))
        else {
            return Vec::new();
        };
        match notification.method.as_str() {
            "turn/started" => {
                let state = self.threads.entry(thread_id.clone()).or_default();
                state.active_turn_id = Some(turn_id.clone());
                state.partial_response.clear();
                self.event(
                    &thread_id,
                    json!({ "type": "turn-started", "turnId": turn_id }),
                )
                .into_iter()
                .collect()
            }
            "turn/output_delta" => {
                let Some(delta) = text(params, "delta") else {
                    return Vec::new();
                };
                let state = self.threads.entry(thread_id.clone()).or_default();
                state.partial_response = clip_tail(
                    &format!("{}{delta}", state.partial_response),
                    PARTIAL_RESPONSE_LENGTH,
                );
                self.event(
                    &thread_id,
                    json!({ "type": "output-delta", "turnId": turn_id, "delta": safe_tail(&delta, DELTA_LENGTH) }),
                )
                .into_iter()
                .collect()
            }
            "approval/requested" => {
                let Some(request_id) = text(params, "requestId").filter(|id| id.len() <= ID_LENGTH)
                else {
                    return Vec::new();
                };
                let approval = PendingApproval {
                    turn_id: turn_id.clone(),
                    summary: safe_head(
                        &text(params, "summary")
                            .unwrap_or_else(|| APPROVAL_SUMMARY_FALLBACK.to_string()),
                        MESSAGE_LENGTH,
                    ),
                    detail: safe_head(&text(params, "detail").unwrap_or_default(), MESSAGE_LENGTH),
                };
                self.threads
                    .entry(thread_id.clone())
                    .or_default()
                    .pending_approvals
                    .insert(request_id.clone(), approval.clone());
                let mut out: Vec<Outgoing> = self
                    .event(
                        &thread_id,
                        json!({
                            "type": "approval-requested",
                            "turnId": turn_id,
                            "requestId": request_id,
                            "summary": approval.summary,
                            "detail": approval.detail,
                        }),
                    )
                    .into_iter()
                    .collect();
                if let Some(task) = self
                    .dispatches
                    .iter()
                    .find(|task| task.thread_id == thread_id)
                {
                    out.push(Self::task_status(
                        &task.request_id,
                        "awaiting_input",
                        json!({
                            "taskId": thread_id,
                            "message": format!("Waiting for approval: {}", approval.summary),
                            "pending": [{ "toolCallId": request_id, "kind": "approval", "summary": clip_head(&approval.summary, 1_000) }],
                        }),
                    ));
                }
                out
            }
            method @ ("turn/completed" | "turn/failed" | "turn/interrupted") => {
                let outcome = match method {
                    "turn/completed" => "completed",
                    "turn/failed" => "failed",
                    _ => "interrupted",
                };
                let response = crate::secret_redaction::redact_tool_output(
                    &text(params, "response").unwrap_or_default(),
                );
                let state = self.threads.entry(thread_id.clone()).or_default();
                state.active_turn_id = None;
                state.partial_response.clear();
                state.pending_approvals.clear();
                Self::settle_tools(state);
                let mut out: Vec<Outgoing> = self
                    .event(
                        &thread_id,
                        json!({ "type": "turn-finished", "turnId": turn_id, "outcome": outcome, "response": clip_tail(&response, MESSAGE_LENGTH) }),
                    )
                    .into_iter()
                    .collect();
                if let Some(position) = self
                    .dispatches
                    .iter()
                    .position(|task| task.thread_id == thread_id && task.turn_id == turn_id)
                {
                    let task = self.dispatches.remove(position);
                    if let Some(failure) = params.get("failure").or_else(|| params.get("error")) {
                        tracing::warn!("[remote-control] dispatched task failed: {failure}");
                    }
                    out.push(match outcome {
                        "completed" => Self::task_status(
                            &task.request_id,
                            "completed",
                            json!({ "taskId": thread_id, "result": clip_tail(&response, PARTIAL_RESPONSE_LENGTH) }),
                        ),
                        "interrupted" => Self::task_status(
                            &task.request_id,
                            "cancelled",
                            json!({ "taskId": thread_id, "message": "The task was stopped in this terminal." }),
                        ),
                        _ => Self::task_status(
                            &task.request_id,
                            "failed",
                            json!({ "taskId": thread_id, "error": TASK_FAILED }),
                        ),
                    });
                }
                let queued = self
                    .threads
                    .get(&thread_id)
                    .is_some_and(|state| !state.queued_guidance.is_empty());
                if queued {
                    out.extend(self.deliver_guidance(&thread_id).await);
                } else if self
                    .threads
                    .get(&thread_id)
                    .is_some_and(|state| state.attached)
                {
                    out.extend(self.snapshot(&thread_id).await);
                }
                out
            }
            _ => Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_snapshot_never_carries_a_secret_streamed_into_the_partial_answer() {
        let partial = "Found the key sk-ant-abcdefghijklmnopqrstuvwxyz0123 in .env";
        let sent = snapshot_partial(partial);
        assert!(!sent.contains("sk-ant-abcdefghijklmnopqrstuvwxyz0123"));
        assert!(sent.contains("[REDACTED_ANTHROPIC_KEY]"));
    }

    #[test]
    fn a_snapshot_keeps_the_newest_part_of_a_long_partial_answer() {
        let partial = format!("{}tail", "x".repeat(PARTIAL_RESPONSE_LENGTH));
        let sent = snapshot_partial(&partial);
        assert_eq!(sent.chars().count(), PARTIAL_RESPONSE_LENGTH);
        assert!(sent.ends_with("tail"));
    }
}
