use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};

use agiworkforce_app_server::{DeveloperSessionHost, DeveloperSessionHostError};
use agiworkforce_protocol::developer_session::{
    ActiveTurnSnapshot, AppServerClientInfo, AppServerNotification, ApprovalResponseParams,
    LocalModelListResponse, ModelListParams, PendingApprovalSnapshot, ThreadForkParams,
    ThreadIdParams, ThreadListParams, ThreadListResponse, ThreadReadResponse,
    ThreadReconnectResponse, ThreadStartParams, ThreadSummary, TurnInterruptParams,
    TurnStartParams, TurnStatus, TurnSteerParams, TurnSummary,
};
use agiworkforce_protocol::protocol::ReviewDecision;
use agiworkforce_protocol::user_input::UserInput;
use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::sync::{broadcast, mpsc};
use uuid::Uuid;

use crate::app_server::CliDeveloperSessionHost;
use crate::tui::app_event::{ToolStatus, TuiAppEvent};
use crate::tui::approval_broker::{
    ApprovalBroker, ApprovalDecision, ApprovalRequest, ApprovalRequestKind,
};

pub enum RemoteInput {
    Message(String),
    Interrupt,
}

#[derive(Default)]
struct Live {
    turn_ids: Vec<String>,
    reserved: VecDeque<String>,
    partial: String,
    delta_index: u64,
    event_sequence: u64,
    broker: Option<ApprovalBroker>,
    pending: Vec<(Uuid, PendingApprovalSnapshot)>,
    answered: HashMap<Uuid, bool>,
}

pub struct TuiRemoteHost {
    inner: CliDeveloperSessionHost,
    thread_id: String,
    events: broadcast::Sender<AppServerNotification>,
    inbox: mpsc::UnboundedSender<RemoteInput>,
    live: Mutex<Live>,
}

fn refusal(message: &str) -> DeveloperSessionHostError {
    DeveloperSessionHostError::invalid_request(message)
}

fn input_text(input: &[UserInput]) -> String {
    input
        .iter()
        .filter_map(|part| match part {
            UserInput::Text { text, .. } => Some(text.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n")
}

impl TuiRemoteHost {
    pub fn new(
        inner: CliDeveloperSessionHost,
        thread_id: String,
    ) -> (Arc<Self>, mpsc::UnboundedReceiver<RemoteInput>) {
        let (events, _) = broadcast::channel(1024);
        let (inbox, received) = mpsc::unbounded_channel();
        (
            Arc::new(Self {
                inner,
                thread_id,
                events,
                inbox,
                live: Mutex::new(Live::default()),
            }),
            received,
        )
    }

    fn live(&self) -> std::sync::MutexGuard<'_, Live> {
        self.live
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn emit(&self, method: &str, params: Value) {
        if let Ok(notification) = AppServerNotification::new(method, params) {
            let _ = self.events.send(notification);
        }
    }

    fn own(&self, thread_id: &str) -> Result<(), DeveloperSessionHostError> {
        if thread_id == self.thread_id {
            Ok(())
        } else {
            Err(DeveloperSessionHostError::not_found(
                "Only the session open in this terminal is shared.",
            ))
        }
    }

    fn reserve(&self, text: String) -> Result<String, DeveloperSessionHostError> {
        if text.trim().is_empty() {
            return Err(refusal("The message is empty."));
        }
        let turn_id = Uuid::new_v4().to_string();
        self.live().reserved.push_back(turn_id.clone());
        self.inbox.send(RemoteInput::Message(text)).map_err(|_| {
            DeveloperSessionHostError::unavailable("The terminal session has closed.")
        })?;
        Ok(turn_id)
    }

    pub fn begin_turn(&self, broker: ApprovalBroker) {
        let turn_ids = {
            let mut live = self.live();
            let mut turn_ids: Vec<String> = live.reserved.drain(..).collect();
            if turn_ids.is_empty() {
                turn_ids.push(Uuid::new_v4().to_string());
            }
            *live = Live {
                turn_ids: turn_ids.clone(),
                broker: Some(broker),
                ..Live::default()
            };
            turn_ids
        };
        for turn_id in turn_ids {
            self.emit(
                "turn/started",
                json!({ "threadId": self.thread_id, "turnId": turn_id }),
            );
        }
    }

    fn turn_id(&self) -> Option<String> {
        self.live().turn_ids.first().cloned()
    }

    pub fn output(&self, streamed: &str) {
        let (turn_id, delta, index) = {
            let mut live = self.live();
            let Some(turn_id) = live.turn_ids.first().cloned() else {
                return;
            };
            let Some(delta) = streamed
                .strip_prefix(live.partial.as_str())
                .map(str::to_string)
            else {
                live.partial = streamed.to_string();
                return;
            };
            if delta.is_empty() {
                return;
            }
            live.partial = streamed.to_string();
            let index = live.delta_index;
            live.delta_index += 1;
            (turn_id, delta, index)
        };
        self.emit(
            "turn/output_delta",
            json!({ "threadId": self.thread_id, "turnId": turn_id, "delta": delta, "index": index }),
        );
    }

    pub fn tool_event(&self, event: &TuiAppEvent) {
        let payload = match event {
            TuiAppEvent::ToolStarted {
                call_id,
                name,
                summary,
                ..
            } => {
                json!({ "type": "tool-execution-start", "toolCallId": call_id, "name": name, "summary": summary })
            }
            TuiAppEvent::ToolCompleted {
                call_id,
                name,
                status,
                output,
                ..
            } => json!({
                "type": "tool-execution-end",
                "toolCallId": call_id,
                "name": name,
                "output": output,
                "isError": matches!(status, ToolStatus::Failed | ToolStatus::Cancelled),
            }),
            _ => return,
        };
        let (turn_id, sequence) = {
            let mut live = self.live();
            let Some(turn_id) = live.turn_ids.first().cloned() else {
                return;
            };
            let sequence = live.event_sequence;
            live.event_sequence += 1;
            (turn_id, sequence)
        };
        self.emit(
            "turn/agent_event",
            json!({ "sessionId": self.thread_id, "turnId": turn_id, "sequence": sequence, "event": payload }),
        );
    }

    pub fn approval_requested(&self, request: &ApprovalRequest) {
        if matches!(request.kind, ApprovalRequestKind::Question { .. }) {
            return;
        }
        let Some(turn_id) = self.turn_id() else {
            return;
        };
        let risk = request.kind.risk();
        let snapshot = PendingApprovalSnapshot {
            request_id: request.id.to_string(),
            kind: format!("{:?}", request.kind),
            summary: request.summary.clone(),
            detail: request.detail.join("\n"),
            risk_level: Some(risk.level),
            reversible: Some(risk.reversible),
            proposed_content: None,
            always_allow_saved: false,
        };
        self.live().pending.push((request.id, snapshot.clone()));
        self.emit(
            "approval/requested",
            json!({
                "threadId": self.thread_id,
                "turnId": turn_id,
                "requestId": snapshot.request_id,
                "kind": snapshot.kind,
                "summary": snapshot.summary,
                "detail": snapshot.detail,
                "riskLevel": snapshot.risk_level,
                "reversible": snapshot.reversible,
            }),
        );
    }

    pub fn approval_settled(&self, id: Uuid) {
        self.live().pending.retain(|(pending, _)| *pending != id);
    }

    pub fn answered_remotely(&self, id: Uuid) -> Option<bool> {
        self.live().answered.get(&id).copied()
    }

    pub fn end_turn(&self, status: TurnStatus, response: &str) {
        let turn_ids = std::mem::take(&mut *self.live()).turn_ids;
        let method = match status {
            TurnStatus::Completed => "turn/completed",
            TurnStatus::Interrupted => "turn/interrupted",
            _ => "turn/failed",
        };
        for turn_id in turn_ids {
            self.emit(
                method,
                json!({ "threadId": self.thread_id, "turnId": turn_id, "response": response }),
            );
        }
    }

    async fn summary(&self) -> Result<ThreadSummary, DeveloperSessionHostError> {
        Ok(self
            .inner
            .read_thread(ThreadIdParams {
                thread_id: self.thread_id.clone(),
            })
            .await?
            .thread)
    }
}

#[async_trait]
impl DeveloperSessionHost for TuiRemoteHost {
    async fn start_thread(
        &self,
        _params: ThreadStartParams,
        _client: AppServerClientInfo,
    ) -> Result<ThreadSummary, DeveloperSessionHostError> {
        self.summary().await
    }

    async fn list_threads(
        &self,
        params: ThreadListParams,
    ) -> Result<ThreadListResponse, DeveloperSessionHostError> {
        let mut listed = self.inner.list_threads(params).await?;
        listed.threads.retain(|thread| thread.id == self.thread_id);
        if listed.threads.is_empty() {
            listed.threads.push(self.summary().await?);
        }
        listed.next_cursor = None;
        Ok(listed)
    }

    async fn list_local_models(
        &self,
        params: ModelListParams,
    ) -> Result<LocalModelListResponse, DeveloperSessionHostError> {
        self.inner.list_local_models(params).await
    }

    async fn resume_thread(
        &self,
        params: ThreadIdParams,
    ) -> Result<ThreadSummary, DeveloperSessionHostError> {
        self.own(&params.thread_id)?;
        self.summary().await
    }

    async fn read_thread(
        &self,
        params: ThreadIdParams,
    ) -> Result<ThreadReadResponse, DeveloperSessionHostError> {
        self.own(&params.thread_id)?;
        self.inner.read_thread(params).await
    }

    async fn reconnect_thread(
        &self,
        params: ThreadIdParams,
    ) -> Result<ThreadReconnectResponse, DeveloperSessionHostError> {
        self.own(&params.thread_id)?;
        let thread = self.summary().await?;
        let live = self.live();
        let active_turn = live.turn_ids.first().map(|turn_id| ActiveTurnSnapshot {
            turn_id: turn_id.clone(),
            partial_response: live.partial.clone(),
            next_delta_index: live.delta_index,
            next_event_sequence: live.event_sequence,
            pending_approvals: live
                .pending
                .iter()
                .map(|(_, snapshot)| snapshot.clone())
                .collect(),
        });
        Ok(ThreadReconnectResponse {
            thread,
            active_turn,
        })
    }

    async fn fork_thread(
        &self,
        _params: ThreadForkParams,
        _client: AppServerClientInfo,
    ) -> Result<ThreadSummary, DeveloperSessionHostError> {
        Err(refusal(
            "Forking is not available for a shared terminal session.",
        ))
    }

    async fn archive_thread(
        &self,
        _params: ThreadIdParams,
    ) -> Result<(), DeveloperSessionHostError> {
        Err(refusal(
            "Archiving is not available for a shared terminal session.",
        ))
    }

    async fn start_turn(
        &self,
        params: TurnStartParams,
    ) -> Result<TurnSummary, DeveloperSessionHostError> {
        self.own(&params.thread_id)?;
        let id = self.reserve(input_text(&params.input))?;
        Ok(TurnSummary {
            id,
            thread_id: params.thread_id,
            status: TurnStatus::Running,
        })
    }

    async fn steer_turn(
        &self,
        params: TurnSteerParams,
    ) -> Result<TurnSummary, DeveloperSessionHostError> {
        self.own(&params.thread_id)?;
        let id = self.reserve(input_text(&params.input))?;
        Ok(TurnSummary {
            id,
            thread_id: params.thread_id,
            status: TurnStatus::Running,
        })
    }

    async fn interrupt_turn(
        &self,
        params: TurnInterruptParams,
    ) -> Result<(), DeveloperSessionHostError> {
        self.own(&params.thread_id)?;
        self.inbox
            .send(RemoteInput::Interrupt)
            .map_err(|_| DeveloperSessionHostError::unavailable("The terminal session has closed."))
    }

    async fn respond_to_approval(
        &self,
        params: ApprovalResponseParams,
    ) -> Result<(), DeveloperSessionHostError> {
        self.own(&params.thread_id)?;
        let decision = match params.decision {
            ReviewDecision::Approved => ApprovalDecision::AllowOnce,
            ReviewDecision::ApprovedForSession => ApprovalDecision::AllowSession,
            ReviewDecision::Abort => ApprovalDecision::Cancel,
            _ => ApprovalDecision::Deny,
        };
        let (id, broker) = {
            let live = self.live();
            let id = live
                .pending
                .iter()
                .map(|(id, _)| *id)
                .find(|id| id.to_string() == params.request_id)
                .ok_or_else(|| {
                    DeveloperSessionHostError::not_found("That approval is no longer waiting.")
                })?;
            (id, live.broker.clone())
        };
        let broker = broker.ok_or_else(|| {
            DeveloperSessionHostError::not_found("That approval is no longer waiting.")
        })?;
        if !broker.complete(id, decision).await {
            return Err(DeveloperSessionHostError::not_found(
                "That approval is no longer waiting.",
            ));
        }
        let mut live = self.live();
        live.answered.insert(id, decision.is_allowing());
        live.pending.retain(|(pending, _)| *pending != id);
        Ok(())
    }

    async fn shutdown(&self) -> Result<(), DeveloperSessionHostError> {
        Ok(())
    }

    fn subscribe(&self) -> broadcast::Receiver<AppServerNotification> {
        self.events.subscribe()
    }
}
