use agiworkforce_protocol::agent_events::{
    AgentEvent, AgentEventEnvelope, AGENT_EVENT_SCHEMA_VERSION,
};
use agiworkforce_protocol::developer_session::{
    method, ActiveTurnSnapshot, AppServerNotification, ApprovalRequestedNotification,
    DeveloperMessage, DeveloperSessionTrustMode, ThreadReadResponse, ThreadReconnectResponse,
    TurnEndedNotification, TurnModelNotification, TurnOutputDeltaNotification, TurnStartResponse,
    TurnStartedNotification, TurnStatus,
};
use anyhow::{ensure, Context, Result};

pub struct Conversation {
    pub transcript: ThreadReadResponse,
    pub turn: Option<LiveTurn>,
    pub error: Option<String>,
    max_output_bytes: usize,
}

pub struct LiveTurn {
    pub id: String,
    pub output: String,
    pub next_delta: u64,
    pub status: TurnStatus,
    pub approvals: Vec<ApprovalRequestedNotification>,
    pub submitted_text: Option<String>,
    pub next_event: u64,
    pub progress: Option<String>,
}

impl Conversation {
    pub fn attach(
        mut transcript: ThreadReadResponse,
        reconnect: ThreadReconnectResponse,
        max_output_bytes: usize,
    ) -> Result<Self> {
        ensure!(
            transcript.thread.id == reconnect.thread.id,
            "The runtime returned a different session"
        );
        ensure!(
            transcript.thread.trust_mode == reconnect.thread.trust_mode,
            "The session privacy boundary changed. Choose a new conversation before sending."
        );
        transcript.thread = reconnect.thread;
        let turn = reconnect
            .active_turn
            .map(|snapshot| Self::from_snapshot(&transcript.thread.id, snapshot));
        if let Some(turn) = &turn {
            ensure!(
                turn.output.len() <= max_output_bytes,
                "The live response exceeds the display limit"
            );
        }
        Ok(Self {
            transcript,
            turn,
            error: None,
            max_output_bytes,
        })
    }

    fn from_snapshot(thread_id: &str, snapshot: ActiveTurnSnapshot) -> LiveTurn {
        let approvals = snapshot
            .pending_approvals
            .into_iter()
            .map(|request| {
                ApprovalRequestedNotification::new(
                    thread_id.to_owned(),
                    snapshot.turn_id.clone(),
                    request,
                    None,
                )
            })
            .collect();
        LiveTurn {
            id: snapshot.turn_id,
            output: snapshot.partial_response,
            next_delta: snapshot.next_delta_index,
            status: TurnStatus::Running,
            approvals,
            submitted_text: None,
            next_event: snapshot.next_event_sequence,
            progress: None,
        }
    }

    pub fn is_running(&self) -> bool {
        self.turn
            .as_ref()
            .is_some_and(|turn| turn.status == TurnStatus::Running)
    }

    pub fn replay(
        &mut self,
        notifications: impl IntoIterator<Item = AppServerNotification>,
    ) -> Result<()> {
        for notification in notifications {
            let id = notification
                .params
                .get("turnId")
                .and_then(serde_json::Value::as_str);
            let current = self
                .turn
                .as_ref()
                .is_some_and(|turn| Some(turn.id.as_str()) == id);
            let persisted = id.is_some_and(|id| {
                self.transcript.messages.iter().any(|message| {
                    message.turn_id.as_deref() == Some(id) && message.role == "assistant"
                })
            });
            if persisted && !current {
                continue;
            }
            self.apply(notification)?;
        }
        Ok(())
    }

    pub fn can_send(&self) -> bool {
        !self.is_running()
            && self.transcript.thread.trust_mode != DeveloperSessionTrustMode::Unknown
            && self.transcript.thread.model.is_some()
            && self.transcript.thread.provider.is_some()
    }

    pub fn retain_finished_turn(&mut self) {
        if self.is_running() {
            return;
        }
        if let Some(turn) = self.turn.take() {
            if let Some(text) = turn.submitted_text {
                if !self.transcript.messages.iter().any(|message| {
                    message.turn_id.as_deref() == Some(turn.id.as_str()) && message.role == "user"
                }) {
                    self.transcript.messages.push(DeveloperMessage {
                        role: "user".to_owned(),
                        text,
                        index: None,
                        turn_id: Some(turn.id.clone()),
                    });
                }
            }
            if !turn.output.is_empty()
                && !self.transcript.messages.iter().any(|message| {
                    message.turn_id.as_deref() == Some(turn.id.as_str())
                        && message.role == "assistant"
                })
            {
                self.transcript.messages.push(DeveloperMessage {
                    role: "assistant".to_owned(),
                    text: turn.output,
                    index: None,
                    turn_id: Some(turn.id),
                });
            }
        }
        let footprint = |message: &DeveloperMessage| {
            std::mem::size_of::<DeveloperMessage>()
                .saturating_add(message.text.len())
                .saturating_add(message.role.len())
                .saturating_add(message.turn_id.as_ref().map_or(0, String::len))
        };
        let mut bytes = self
            .transcript
            .messages
            .iter()
            .fold(0usize, |total, message| {
                total.saturating_add(footprint(message))
            });
        let mut remove = 0;
        while bytes > self.max_output_bytes && remove + 1 < self.transcript.messages.len() {
            bytes = bytes.saturating_sub(footprint(&self.transcript.messages[remove]));
            remove += 1;
        }
        if remove > 0 {
            self.transcript.messages.drain(..remove);
            self.transcript.transcript_truncated = true;
        }
    }

    fn started(&mut self, id: String) -> Result<&mut LiveTurn> {
        if let Some(turn) = &self.turn {
            ensure!(
                !self.is_running() || turn.id == id,
                "The runtime started overlapping turns"
            );
        }
        if self.turn.as_ref().is_none_or(|turn| turn.id != id) {
            self.turn = Some(LiveTurn {
                id,
                output: String::new(),
                next_delta: 0,
                status: TurnStatus::Running,
                approvals: Vec::new(),
                submitted_text: None,
                next_event: 0,
                progress: None,
            });
        }
        self.turn.as_mut().context("The live turn is unavailable")
    }

    pub fn accepted(&mut self, response: TurnStartResponse, text: String) -> Result<()> {
        ensure!(
            response.turn.thread_id == self.transcript.thread.id,
            "The runtime accepted a turn in a different session"
        );
        let turn = self.started(response.turn.id)?;
        turn.submitted_text = Some(text);
        Ok(())
    }

    pub fn apply(&mut self, notification: AppServerNotification) -> Result<bool> {
        if notification.method == method::TURN_AGENT_EVENT {
            if notification
                .params
                .get("sessionId")
                .and_then(serde_json::Value::as_str)
                != Some(self.transcript.thread.id.as_str())
            {
                return Ok(false);
            }
            let event: AgentEventEnvelope = serde_json::from_value(notification.params)?;
            ensure!(
                event.schema_version == AGENT_EVENT_SCHEMA_VERSION,
                "The runtime sent an unsupported activity schema"
            );
            let turn = self.started(event.turn_id)?;
            if turn.status != TurnStatus::Running || event.sequence < turn.next_event {
                return Ok(false);
            }
            ensure!(
                event.sequence == turn.next_event,
                "The activity stream has a gap. Reopen this session to recover it."
            );
            turn.next_event = turn
                .next_event
                .checked_add(1)
                .context("The activity cursor is exhausted")?;
            match event.event {
                AgentEvent::ProgressUpdate(progress) => turn.progress = Some(progress.summary),
                AgentEvent::ApprovalResolved(resolved) => turn
                    .approvals
                    .retain(|request| request.request_id != resolved.approval_id),
                _ => {}
            }
            return Ok(false);
        }
        if notification
            .params
            .get("threadId")
            .and_then(serde_json::Value::as_str)
            != Some(self.transcript.thread.id.as_str())
        {
            return Ok(false);
        }
        match notification.method.as_str() {
            method::TURN_STARTED => {
                let value: TurnStartedNotification = serde_json::from_value(notification.params)?;
                self.started(value.turn_id)?;
            }
            method::TURN_OUTPUT_DELTA => {
                let value: TurnOutputDeltaNotification =
                    serde_json::from_value(notification.params)?;
                let limit = self.max_output_bytes;
                let turn = self.started(value.turn_id)?;
                if turn.status != TurnStatus::Running || value.index < turn.next_delta {
                    return Ok(false);
                }
                ensure!(
                    value.index == turn.next_delta,
                    "The live response has a gap. Reopen this session to recover it."
                );
                ensure!(turn.output.len().saturating_add(value.delta.len()) <= limit, "The live response exceeds the display limit. Stop the turn and reopen its saved history.");
                turn.next_delta = turn
                    .next_delta
                    .checked_add(1)
                    .context("The response cursor is exhausted")?;
                turn.output.push_str(&value.delta);
            }
            method::TURN_MODEL => {
                let value: TurnModelNotification = serde_json::from_value(notification.params)?;
                ensure!(self.transcript.thread.trust_mode == value.trust_mode,
                    "The runtime reported a different privacy boundary. Reconnect before continuing.");
                self.started(value.turn_id)?;
                self.transcript.thread.model = Some(value.model);
                self.transcript.thread.provider = Some(value.provider);
            }
            method::APPROVAL_REQUESTED => {
                let value: ApprovalRequestedNotification =
                    serde_json::from_value(notification.params)?;
                let turn = self.started(value.turn_id.clone())?;
                if turn.status == TurnStatus::Running
                    && !turn
                        .approvals
                        .iter()
                        .any(|request| request.request_id == value.request_id)
                {
                    turn.approvals.push(value);
                }
            }
            method::TURN_COMPLETED | method::TURN_FAILED => {
                let value: TurnEndedNotification = serde_json::from_value(notification.params)?;
                ensure!(
                    value.status != TurnStatus::Running,
                    "The runtime ended a turn with a running status"
                );
                ensure!(
                    value.response.len() <= self.max_output_bytes,
                    "The saved response exceeds the display limit"
                );
                let turn = self.started(value.turn_id)?;
                turn.output = value.response;
                turn.status = value.status;
                turn.approvals.clear();
                self.error = value
                    .error
                    .or_else(|| value.failure.map(|failure| failure.message));
                return Ok(true);
            }
            method::TURN_INTERRUPTED => {
                let value: TurnStartedNotification = serde_json::from_value(notification.params)?;
                let turn = self.started(value.turn_id)?;
                turn.status = TurnStatus::Interrupted;
                turn.approvals.clear();
                return Ok(true);
            }
            _ => {}
        }
        Ok(false)
    }
}
