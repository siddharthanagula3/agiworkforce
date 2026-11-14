use super::{account_cloud, TRANSCRIPT_JSON_BUDGET};
use crate::cloud::{chat, CloudClient};
use agiworkforce_app_server::DeveloperSessionHostError;
use agiworkforce_llm::{LlmError, StreamEvent};
use agiworkforce_protocol::account_cloud::{
    CloudRunAttachParams, CloudRunAttachResponse, CloudRunListParams, CloudRunListResponse,
    CloudRunSummary, CloudTurnIdParams, CloudTurnResumeAction, CloudTurnResumeParams,
    CloudTurnSnapshot, CloudTurnStartParams, CloudWorkGoal, CloudWorkPlanReview, CloudWorkPlanStep,
    CloudWorkPlanUpdateParams,
};
use agiworkforce_protocol::agent_events::{
    AgentEvent, AgentEventEnvelope, AgentEventStopReason, AGENT_EVENT_SCHEMA_VERSION,
};
use agiworkforce_protocol::task_state::AgentTaskState;
use futures_util::StreamExt;
use std::sync::{Arc, Mutex as StdMutex};
use tokio::sync::{watch, Mutex, Notify};

mod journal;
use journal::refresh_run;

#[derive(Default)]
pub(super) struct CloudTurns {
    active: Mutex<Option<Arc<Active>>>,
    binding: Mutex<()>,
}

struct Active {
    identity: Identity,
    start_request: Option<CloudTurnStartParams>,
    client: CloudClient,
    context: crate::tier_cache::ManagedRequestContext,
    snapshot: StdMutex<CloudTurnSnapshot>,
    stop: watch::Sender<bool>,
    changed: Notify,
    finished: watch::Sender<bool>,
    journal: Mutex<journal::Journal>,
    control: Mutex<()>,
    surface: &'static str,
}

struct Identity {
    workspace: Option<agiworkforce_protocol::account_cloud::CloudConversationWorkspace>,
    scope: String,
    request_id: String,
    conversation_id: Option<String>,
    page_size: u32,
}

impl Active {
    fn can_detach(&self) -> bool {
        let snapshot = self.snapshot();
        !snapshot.stream_attached
            && (self.start_request.is_none()
                || snapshot.detachable
                || (*self.finished.borrow() && !snapshot.needs_attention()))
    }
    fn new(
        identity: Identity,
        start_request: Option<CloudTurnStartParams>,
        client: CloudClient,
        context: crate::tier_cache::ManagedRequestContext,
        snapshot: CloudTurnSnapshot,
        surface: &'static str,
    ) -> Self {
        let finished = start_request.is_none();
        Self {
            identity,
            start_request,
            client,
            context,
            snapshot: StdMutex::new(snapshot),
            stop: watch::channel(false).0,
            changed: Notify::new(),
            finished: watch::channel(finished).0,
            journal: Mutex::new(journal::Journal::default()),
            control: Mutex::new(()),
            surface,
        }
    }
    fn snapshot(&self) -> CloudTurnSnapshot {
        self.snapshot
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }
    fn update(&self, update: impl FnOnce(&mut CloudTurnSnapshot)) {
        let mut snapshot = self
            .snapshot
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        snapshot.revision = snapshot.revision.saturating_add(1);
        update(&mut snapshot);
        drop(snapshot);
        self.changed.notify_waiters();
    }
}

impl CloudTurns {
    pub(super) async fn update_plan(
        &self,
        params: CloudWorkPlanUpdateParams,
    ) -> Result<CloudWorkPlanReview, DeveloperSessionHostError> {
        let (client, context, _) = account_cloud::connect(Some(&params.scope))?;
        let client = client
            .with_workspace(params.workspace.as_ref())
            .map_err(account_cloud::failure)?;
        let _binding = self.binding.lock().await;
        let active = self.active.lock().await.clone();
        let live = active
            .as_ref()
            .filter(|active| {
                active.identity.scope == params.scope
                    && active.identity.workspace == params.workspace
            })
            .cloned();
        let _control = if let Some(active) = &live {
            Some(active.control.lock().await)
        } else {
            None
        };
        let mut plan = if let Some(stored) =
            crate::cloud::work_plan::stored(&client, &params.reviewed)
                .await
                .map_err(account_cloud::failure)?
        {
            stored
        } else {
            live.as_ref()
                .and_then(|active| active.snapshot().work_plan)
                .filter(|plan| crate::cloud::work_plan::same_plan(plan, &params.reviewed))
                .ok_or_else(|| {
                    DeveloperSessionHostError::conflict("That plan is not available for review")
                })?
        };
        if params.decline {
            if let Some(active) = &live {
                if active
                    .start_request
                    .as_ref()
                    .and_then(|start| start.work.as_ref())
                    .and_then(|work| work.plan.as_ref())
                    .is_some_and(|previous| crate::cloud::work_plan::same_plan(previous, &plan))
                    && active.snapshot().accepted
                {
                    return Err(DeveloperSessionHostError::conflict(
                        "This plan already started. Open the current run and use Stop.",
                    ));
                }
            }
            plan.declined = true;
            plan.awaiting_approval = false;
            for step in &mut plan.steps {
                step.status = "cancelled".into();
            }
        }
        if !context.is_current() {
            return Err(account_cloud::changed());
        }
        crate::cloud::work_plan::save(&client, &plan)
            .await
            .map_err(account_cloud::failure)?;
        if !context.is_current() {
            return Err(account_cloud::changed());
        }
        if let Some(active) = live.as_ref().filter(|active| {
            active
                .snapshot()
                .work_plan
                .as_ref()
                .is_some_and(|current| crate::cloud::work_plan::same_plan(current, &plan))
        }) {
            active.update(|snapshot| {
                snapshot.work_plan = Some(plan.clone());
                snapshot.work_plan_saved = true;
                snapshot.work_plan_error = None;
            });
        }
        Ok(plan)
    }
    pub(super) async fn attach(
        &self,
        params: CloudRunAttachParams,
        surface: &'static str,
    ) -> Result<CloudRunAttachResponse, DeveloperSessionHostError> {
        uuid::Uuid::parse_str(&params.run_id)
            .map_err(|_| DeveloperSessionHostError::invalid_request("Run IDs must be UUIDs"))?;
        if params.page_size == 0 {
            return Err(DeveloperSessionHostError::invalid_request(
                "The journal page size must be positive",
            ));
        }
        let (client, context, scope) = account_cloud::connect(Some(&params.scope))?;
        let client = client
            .with_workspace(params.workspace.as_ref())
            .map_err(account_cloud::failure)?;
        let _binding = self.binding.lock().await;
        let run = journal::read_summary(&client, &params.run_id).await?;
        if !context.is_current() {
            return Err(account_cloud::changed());
        }
        let initial = CloudTurnSnapshot {
            attachment_recovery_error: None,
            workspace: params.workspace.clone(),
            revision: 0,
            scope: scope.clone(),
            request_id: run.request_id.clone(),
            conversation_id: run.conversation_id.clone(),
            state: run.effective_state(),
            accepted: true,
            output: String::new(),
            progress: None,
            error: None,
            run_id: Some(run.id.clone()),
            detachable: false,
            stream_attached: false,
            catching_up: true,
            approval_checkpoint: None,
            approvals: Vec::new(),
            work_plan: None,
            rejected: false,
            work_plan_saved: false,
            work_plan_error: None,
        };
        let identity = Identity {
            workspace: params.workspace.clone(),
            scope,
            request_id: run.request_id.clone(),
            conversation_id: run.conversation_id.clone(),
            page_size: params.page_size,
        };
        let active = Arc::new(Active::new(
            identity, None, client, context, initial, surface,
        ));
        if let Err(error) = refresh_run(&active, false).await {
            active.update(|snapshot| {
                snapshot.error = Some(format!(
                    "Run history could not be loaded: {error}. Refresh the run."
                ))
            });
        }
        if !active.context.is_current() {
            return Err(account_cloud::changed());
        }
        if let Some(conversation) = &run.conversation_id {
            match crate::cloud::work_plan::find_for_run(&active.client, conversation, &run.id).await
            {
                Ok(Some(plan)) => active.update(|snapshot| {
                    snapshot.work_plan = Some(plan);
                    snapshot.work_plan_saved = true;
                }),
                Ok(None) => {}
                Err(error) => active.update(|snapshot| {
                    snapshot.work_plan_error =
                        Some(format!("Saved plan review could not be loaded: {error}"))
                }),
            }
        }
        let previous = self.active.lock().await.clone();
        if let Some(previous) = &previous {
            let _control = previous.control.lock().await;
            if !previous.can_detach() {
                return Err(DeveloperSessionHostError::conflict("This request-scoped turn cannot be detached. Stop it or wait for completion before opening another run."));
            }
            let mut slot = self.active.lock().await;
            if !active.context.is_current() {
                return Err(account_cloud::changed());
            }
            previous.stop.send_replace(true);
            *slot = Some(active.clone());
        } else {
            let mut slot = self.active.lock().await;
            if !active.context.is_current() {
                return Err(account_cloud::changed());
            }
            *slot = Some(active.clone());
        }
        Ok(CloudRunAttachResponse {
            run,
            turn: active.snapshot(),
        })
    }

    pub(super) async fn detach(
        &self,
        params: CloudTurnIdParams,
    ) -> Result<(), DeveloperSessionHostError> {
        let _binding = self.binding.lock().await;
        let active = self.find(&params).await?;
        let _control = active.control.lock().await;
        if !active.can_detach() {
            return Err(DeveloperSessionHostError::conflict("This continuation depends on its attached stream. Stop it or wait for it to finish before leaving this view."));
        }
        active.stop.send_replace(true);
        *self.active.lock().await = None;
        Ok(())
    }

    pub(super) async fn start(
        &self,
        params: CloudTurnStartParams,
        surface: &'static str,
    ) -> Result<CloudTurnSnapshot, DeveloperSessionHostError> {
        if params.text.trim().is_empty() && params.attachments.is_empty() {
            return Err(DeveloperSessionHostError::invalid_request(
                "The message is empty",
            ));
        }
        crate::cloud::attachments::submitted(&params.attachments)
            .map_err(account_cloud::failure)?;
        if params
            .model
            .as_ref()
            .is_some_and(|model| model.trim().is_empty() || model != model.trim())
        {
            return Err(DeveloperSessionHostError::invalid_request(
                "The selected Cloud model is invalid",
            ));
        }
        for id in [&params.request_id, &params.user_message_id] {
            uuid::Uuid::parse_str(id).map_err(|_| {
                DeveloperSessionHostError::invalid_request("Cloud message IDs must be UUIDs")
            })?;
        }
        if let Some(work) = &params.work {
            if work.goal.goal.trim().is_empty() || work.mode.is_empty() {
                return Err(DeveloperSessionHostError::invalid_request(
                    "The Work goal or mode is empty",
                ));
            }
            if let Some(plan) = &work.plan {
                let (request, user) = crate::cloud::work_plan::continuation_ids(plan)
                    .map_err(account_cloud::failure)?;
                if params.request_id != request
                    || params.user_message_id != user
                    || params.conversation_id != plan.conversation_id
                    || work.goal != plan.goal
                    || work.mode != plan.mode
                    || params
                        .model
                        .as_ref()
                        .is_some_and(|model| model != &plan.model)
                {
                    return Err(DeveloperSessionHostError::invalid_request(
                        "The reviewed plan changed identity, goal, mode or model",
                    ));
                }
            }
        }
        let _binding = self.binding.lock().await;
        let (client, context, _) = account_cloud::connect(Some(&params.scope))?;
        let client = client
            .with_workspace(params.workspace.as_ref())
            .map_err(account_cloud::failure)?;
        let mut slot = self.active.lock().await;
        if let Some(previous) = &*slot {
            if previous.identity.request_id == params.request_id {
                if previous.start_request.as_ref() != Some(&params) {
                    return Err(DeveloperSessionHostError::conflict(
                        "This request ID already belongs to a different message",
                    ));
                }
                return Ok(previous.snapshot());
            }
            let snapshot = previous.snapshot();
            let continues_plan = params
                .work
                .as_ref()
                .and_then(|work| work.plan.as_ref())
                .is_some_and(|plan| {
                    snapshot.work_plan_saved
                        && snapshot.state.needs_review()
                        && !snapshot.stream_attached
                        && !snapshot.catching_up
                        && snapshot.work_plan.as_ref().is_some_and(|old| {
                            old.awaiting_approval && crate::cloud::work_plan::same_plan(old, plan)
                        })
                });
            if snapshot.needs_attention() && !continues_plan {
                return Err(DeveloperSessionHostError::conflict(
                    "Finish or stop the current Cloud turn before starting another",
                ));
            }
        }
        let snapshot = CloudTurnSnapshot {
            attachment_recovery_error: None,
            workspace: params.workspace.clone(),
            revision: 0,
            scope: params.scope.clone(),
            conversation_id: Some(params.conversation_id.clone()),
            request_id: params.request_id.clone(),
            state: AgentTaskState::Queued,
            accepted: false,
            output: String::new(),
            progress: None,
            error: None,
            run_id: None,
            detachable: false,
            stream_attached: false,
            catching_up: false,
            approval_checkpoint: None,
            approvals: Vec::new(),
            work_plan: None,
            rejected: false,
            work_plan_saved: false,
            work_plan_error: None,
        };
        let identity = Identity {
            workspace: params.workspace.clone(),
            scope: params.scope.clone(),
            request_id: params.request_id.clone(),
            conversation_id: Some(params.conversation_id.clone()),
            page_size: params.page_size,
        };
        let active = Arc::new(Active::new(
            identity,
            Some(params),
            client,
            context,
            snapshot.clone(),
            surface,
        ));
        *slot = Some(active.clone());
        tokio::spawn(async move {
            let result = execute(active.clone(), surface).await;
            if let Err(error) = result {
                if active.snapshot().detachable && active.snapshot().run_id.is_some() {
                    active.update(|snapshot| {
                        snapshot.catching_up = true;
                        snapshot.error = Some(format!("The Cloud stream was interrupted: {error}. Recovering saved run status; the run was not cancelled."));
                    });
                } else {
                    let cancellation =
                        if active.snapshot().run_id.is_some() && active.context.is_current() {
                            refresh_run(&active, true).await.err()
                        } else {
                            None
                        };
                    active.update(|snapshot| {
                        snapshot.state = AgentTaskState::Failed;
                        snapshot.error = Some(match cancellation {
                            Some(cancel) => {
                                format!("{error}. Cancellation could not be confirmed: {cancel}")
                            }
                            None => error.to_string(),
                        });
                    });
                }
            }
            active.finished.send_replace(true);
            active.changed.notify_waiters();
        });
        Ok(snapshot)
    }

    async fn find(
        &self,
        params: &CloudTurnIdParams,
    ) -> Result<Arc<Active>, DeveloperSessionHostError> {
        account_cloud::connect(Some(&params.scope))?;
        self.active.lock().await.as_ref().filter(|active| active.identity.request_id == params.request_id && active.identity.scope == params.scope && active.identity.workspace == params.workspace && (active.start_request.is_some() || params.run_id.is_some()) && params.run_id.as_ref().is_none_or(|id| active.snapshot().run_id.as_ref() == Some(id)))
            .cloned().ok_or_else(|| DeveloperSessionHostError::not_found("That Cloud turn is not attached to this process. Check its saved conversation before resending."))
    }

    async fn ensure_bound(&self, active: &Arc<Active>) -> Result<(), DeveloperSessionHostError> {
        if !self
            .active
            .lock()
            .await
            .as_ref()
            .is_some_and(|current| Arc::ptr_eq(current, active))
        {
            return Err(DeveloperSessionHostError::not_found(
                "This run was detached. Open it again before deciding or stopping.",
            ));
        }
        Ok(())
    }

    pub(super) async fn read(
        &self,
        params: CloudTurnIdParams,
    ) -> Result<CloudTurnSnapshot, DeveloperSessionHostError> {
        let active = self.find(&params).await?;
        if !active.context.is_current() {
            return Err(account_cloud::changed());
        }
        let snapshot = active.snapshot();
        if *active.finished.borrow() && snapshot.run_id.is_some() && snapshot.needs_attention() {
            refresh_run(&active, false).await?;
        }
        let _control = active.control.lock().await;
        let snapshot = active.snapshot();
        if snapshot.state.needs_review() && snapshot.work_plan_saved {
            if let Some(plan) = snapshot
                .work_plan
                .as_ref()
                .filter(|plan| plan.awaiting_approval)
            {
                let stored = crate::cloud::work_plan::load(&active.client, plan)
                    .await
                    .map_err(account_cloud::failure)?;
                if !active.context.is_current() {
                    return Err(account_cloud::changed());
                }
                active.update(|snapshot| snapshot.work_plan = Some(stored));
            }
        }
        Ok(active.snapshot())
    }

    pub(super) async fn stop(
        &self,
        params: CloudTurnIdParams,
    ) -> Result<CloudTurnSnapshot, DeveloperSessionHostError> {
        let active = self.find(&params).await?;
        let _control = active.control.lock().await;
        self.ensure_bound(&active).await?;
        active.stop.send_replace(true);
        loop {
            let notified = active.changed.notified();
            let snapshot = active.snapshot();
            if snapshot.run_id.is_some() {
                refresh_run(&active, true).await?;
                return Ok(active.snapshot());
            }
            if *active.finished.borrow() || !snapshot.needs_attention() {
                return Ok(snapshot);
            }
            notified.await;
        }
    }

    pub(super) async fn shutdown(&self) {
        if let Some(active) = self.active.lock().await.as_ref() {
            active.stop.send_replace(true);
        }
    }

    pub(super) async fn resume(
        &self,
        params: CloudTurnResumeParams,
    ) -> Result<CloudTurnSnapshot, DeveloperSessionHostError> {
        let active = self
            .find(&CloudTurnIdParams {
                workspace: params.workspace.clone(),
                scope: params.scope,
                request_id: params.request_id,
                run_id: params.run_id,
            })
            .await?;
        let _control = active.control.lock().await;
        self.ensure_bound(&active).await?;
        if !*active.finished.borrow() {
            return Err(DeveloperSessionHostError::conflict(
                "Wait for the current stream to settle before continuing",
            ));
        }
        refresh_run(&active, false).await?;
        let snapshot = active.snapshot();
        if snapshot.catching_up || snapshot.stream_attached || !active.context.is_current() {
            return Err(DeveloperSessionHostError::conflict(
                "Wait for the current account's run history to finish loading",
            ));
        }
        let run_id = snapshot.run_id.as_deref().ok_or_else(|| {
            DeveloperSessionHostError::invalid_request("This turn has no durable run")
        })?;
        let (paused, body) = match params.action {
            CloudTurnResumeAction::Approval {
                checkpoint,
                approved,
                reviewed,
            } => {
                if snapshot.approval_checkpoint.as_deref() != Some(checkpoint.as_str())
                    || reviewed.is_empty()
                    || reviewed != snapshot.approvals
                    || !snapshot.state.needs_input()
                {
                    return Err(DeveloperSessionHostError::conflict(
                        "The pending actions changed. Review the current approval before deciding.",
                    ));
                }
                let approvals: Vec<_> = reviewed.iter().map(|call| serde_json::json!({ "tool_call_id": call.tool_call_id, "decision": if approved { "approved" } else { "rejected" } })).collect();
                (
                    false,
                    serde_json::json!({ "run_id": run_id, "tool_approvals": approvals, "detached": true }),
                )
            }
            CloudTurnResumeAction::Paused => {
                if snapshot.state != AgentTaskState::Paused || !snapshot.approvals.is_empty() {
                    return Err(DeveloperSessionHostError::conflict(
                        "This run is no longer paused",
                    ));
                }
                (true, serde_json::json!({}))
            }
        };
        let response = active
            .client
            .open_chat_resume(
                paused.then_some(run_id),
                &body,
                &uuid::Uuid::new_v4().to_string(),
                active.surface,
            )
            .await
            .map_err(account_cloud::failure)?;
        let attached = paused
            && response
                .headers()
                .get("x-agi-agent-transport")
                .and_then(|value| value.to_str().ok())
                != Some("durable");
        if response
            .headers()
            .get(agiworkforce_llm::stream::AGENT_RUN_ID_HEADER)
            .and_then(|value| value.to_str().ok())
            != Some(run_id)
        {
            return Err(DeveloperSessionHostError::unavailable("The continuation response did not confirm the requested run. Refresh its status before deciding again."));
        }
        if !active.context.is_current() {
            return Err(account_cloud::changed());
        }
        active.update(|snapshot| {
            snapshot.state = AgentTaskState::Resuming;
            snapshot.progress = Some("Continuing Cloud work".into());
            snapshot.approvals.clear();
            snapshot.approval_checkpoint = None;
            snapshot.stream_attached = attached;
            if paused {
                snapshot.detachable = !attached;
            }
        });
        if attached {
            let active = active.clone();
            tokio::spawn(async move {
                let mut stream = response.bytes_stream();
                let mut stop = active.stop.subscribe();
                let mut bytes = 0usize;
                let drained = async {
                    while let Some(chunk) = stream.next().await {
                        let chunk = chunk.map_err(|error| error.to_string())?;
                        bytes = bytes.saturating_add(chunk.len());
                        if bytes > TRANSCRIPT_JSON_BUDGET * 4 {
                            return Err(
                                "The continuation stream exceeds the native response budget"
                                    .to_string(),
                            );
                        }
                    }
                    Ok::<_, String>(())
                };
                let outcome = tokio::select! { biased; _ = stop.wait_for(|stop| *stop) => Ok(()), result = drained => result };
                active.update(|snapshot| {
                    snapshot.stream_attached = false;
                    if let Err(error) = outcome { snapshot.error = Some(format!("The attached continuation stream ended unexpectedly: {error}. Refresh the run.")); snapshot.catching_up = true; }
                });
            });
        } else {
            drop(response);
        }
        Ok(active.snapshot())
    }
}

pub(super) async fn list(
    params: CloudRunListParams,
) -> Result<CloudRunListResponse, DeveloperSessionHostError> {
    if params.limit == 0 {
        return Err(DeveloperSessionHostError::invalid_request(
            "The run page size must be positive",
        ));
    }
    let (client, context, scope) = account_cloud::connect(params.scope.as_deref())?;
    let client = client
        .with_workspace(params.workspace.as_ref())
        .map_err(account_cloud::failure)?;
    let path = client.gateway_runs_path().map_err(account_cloud::failure)?;
    let mut query = vec![("limit", params.limit.to_string())];
    if let Some(cursor) = &params.cursor {
        query.push(("cursor", cursor.clone()));
    }
    for state in &params.states {
        query.push((
            "state",
            serde_json::to_value(state)
                .map_err(|error| DeveloperSessionHostError::invalid_request(error.to_string()))?
                .as_str()
                .unwrap_or_default()
                .to_owned(),
        ));
    }
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Page {
        runs: Vec<CloudRunSummary>,
        next_cursor: Option<String>,
    }
    if !context.is_current() {
        return Err(account_cloud::changed());
    }
    let page: Page = client
        .get_bounded(&path, &query, TRANSCRIPT_JSON_BUDGET)
        .await
        .map_err(account_cloud::failure)?;
    if !context.is_current() {
        return Err(account_cloud::changed());
    }
    if page
        .next_cursor
        .as_ref()
        .is_some_and(|next| params.cursor.as_ref() == Some(next))
    {
        return Err(DeveloperSessionHostError::unavailable(
            "The Work cursor did not advance",
        ));
    }
    for run in &page.runs {
        uuid::Uuid::parse_str(&run.id).map_err(|_| {
            DeveloperSessionHostError::unavailable("The gateway returned an invalid run ID")
        })?;
        if run.request_id.is_empty() {
            return Err(DeveloperSessionHostError::unavailable(
                "The gateway returned an empty request ID",
            ));
        }
    }
    Ok(CloudRunListResponse {
        workspace: params.workspace.clone(),
        scope,
        runs: page.runs,
        next_cursor: page.next_cursor,
    })
}

async fn execute(active: Arc<Active>, surface: &str) -> Result<(), DeveloperSessionHostError> {
    let params = active.start_request.as_ref().ok_or_else(|| {
        DeveloperSessionHostError::invalid_request("Recovered runs cannot dispatch a new message")
    })?;
    if !active.context.is_current() {
        return Err(account_cloud::changed());
    }
    if let Some(model) = &params.model {
        let catalogue =
            account_cloud::models(agiworkforce_protocol::account_cloud::CloudModelListParams {
                scope: params.scope.clone(),
            })
            .await
            .inspect_err(|_| active.update(|snapshot| snapshot.rejected = true))?;
        if !catalogue
            .models
            .iter()
            .any(|entry| entry.id == *model && entry.selectable())
        {
            active.update(|snapshot| snapshot.rejected = true);
            return Err(DeveloperSessionHostError::invalid_request("The selected model is no longer available for this account. Reload the model picker."));
        }
    }
    let (conversation, mut messages) = chat::gateway_history_until(
        &active.client,
        &params.conversation_id,
        params.page_size,
        params.work.as_ref().and_then(|work| work.plan.as_ref()),
    )
    .await
    .map_err(account_cloud::failure)
    .inspect_err(|_| active.update(|snapshot| snapshot.rejected = true))?;
    if *active.stop.borrow() {
        active.update(|snapshot| snapshot.state = AgentTaskState::Cancelled);
        return Ok(());
    }
    if !active.context.is_current() {
        return Err(account_cloud::changed());
    }
    if let Some(project_id) = &conversation.project_id {
        let project = async {
            let workspace = active.identity.workspace.clone().ok_or_else(|| {
                DeveloperSessionHostError::invalid_request(
                    "Choose a workspace before sending in a project conversation",
                )
            })?;
            crate::cloud::projects::api::read(
                &active.client,
                &agiworkforce_protocol::account_cloud::CloudProjectTarget {
                    scope: active.identity.scope.clone(),
                    workspace,
                    project_id: project_id.clone(),
                },
            )
            .await
            .map_err(account_cloud::failure)
        }
        .await;
        project.inspect_err(|_| active.update(|snapshot| snapshot.rejected = true))?;
        if *active.stop.borrow() {
            active.update(|snapshot| snapshot.state = AgentTaskState::Cancelled);
            return Ok(());
        }
        if !active.context.is_current() {
            return Err(account_cloud::changed());
        }
    }
    let attachment_target = (!params.attachments.is_empty()).then(|| {
        agiworkforce_protocol::cloud_uploads::CloudChatTarget {
            scope: params.scope.clone(),
            workspace:
                agiworkforce_protocol::account_cloud::CloudConversationWorkspace::from_organization(
                    conversation.organization_id.as_deref(),
                ),
            conversation_id: params.conversation_id.clone(),
        }
    });
    let model = params
        .work
        .as_ref()
        .and_then(|work| work.plan.as_ref())
        .map(|plan| plan.model.clone())
        .or_else(|| params.model.clone())
        .or(conversation.model)
        .ok_or_else(|| {
            DeveloperSessionHostError::invalid_request(
                "Choose a model for this conversation before sending",
            )
        })?;
    let metadata = crate::cloud::attachments::message_metadata(&params.attachments);
    let content = crate::cloud::attachments::history_content("user", &params.text, Some(&metadata))
        .map_err(account_cloud::failure)?;
    messages.push(serde_json::json!({ "role": "user", "content": content }));
    let mut body = serde_json::json!({ "model": model, "messages": messages, "conversation_id": params.conversation_id,
        "assistant_message_id": params.request_id, "user_message": { "id": params.user_message_id, "metadata": metadata }, "stream": true });
    if let Some(work) = &params.work {
        body["work_mode"] = serde_json::json!(work.mode);
        body["agi_work_goal"] = serde_json::json!(work.goal);
        if let Some(plan) = &work.plan {
            body["agi_work_plan"] = serde_json::json!({ "steps": plan.steps.iter().map(|step| &step.description).collect::<Vec<_>>() });
        } else {
            body["agi_work_plan_approval"] = serde_json::json!(true);
        }
    }
    if let Some(target) = &attachment_target {
        super::attachment_recovery::begin_send(
            &active.client,
            &active.context,
            target,
            &params.attachments,
            &params.request_id,
            &params.user_message_id,
        )
        .await
        .inspect_err(|_| active.update(|snapshot| snapshot.rejected = true))?;
        if *active.stop.borrow() {
            let error = super::attachment_recovery::finish_send(
                &active.client,
                &active.context,
                target,
                &params.request_id,
                false,
            )
            .await
            .err();
            active.update(|snapshot| {
                snapshot.state = AgentTaskState::Cancelled;
                snapshot.rejected = true;
                snapshot.attachment_recovery_error = error.map(|error| error.to_string());
            });
            return Ok(());
        }
    }
    let response = match active
        .client
        .open_chat_stream(&body, &params.request_id, surface)
        .await
    {
        Ok(response) => response,
        Err(error) => {
            if matches!(
                &error,
                crate::cloud::CloudError::Api {
                    status: 400 | 401 | 403 | 413 | 422 | 429,
                    ..
                }
            ) {
                active.update(|snapshot| snapshot.rejected = true);
                if let Some(target) = &attachment_target {
                    if let Err(recovery) = super::attachment_recovery::finish_send(
                        &active.client,
                        &active.context,
                        target,
                        &params.request_id,
                        false,
                    )
                    .await
                    {
                        active.update(|snapshot| {
                            snapshot.attachment_recovery_error = Some(recovery.to_string())
                        });
                    }
                }
            }
            return Err(account_cloud::failure(error));
        }
    };
    if !active.context.is_current() {
        return Err(account_cloud::changed());
    }
    let run_id = response
        .headers()
        .get(agiworkforce_llm::stream::AGENT_RUN_ID_HEADER)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    if let Some(id) = &run_id {
        uuid::Uuid::parse_str(id).map_err(|_| {
            DeveloperSessionHostError::unavailable("The gateway returned an invalid run ID")
        })?;
    }
    let detachable = response
        .headers()
        .get("x-agi-tool-loop")
        .and_then(|value| value.to_str().ok())
        == Some("durable");
    active.update(|snapshot| {
        snapshot.accepted = true;
        snapshot.state = AgentTaskState::Running;
        snapshot.run_id = run_id;
        snapshot.detachable = detachable;
    });
    if let Some(target) = &attachment_target {
        if let Err(error) = super::attachment_recovery::finish_send(
            &active.client,
            &active.context,
            target,
            &params.request_id,
            true,
        )
        .await
        {
            active.update(|snapshot| snapshot.attachment_recovery_error = Some(format!("The message was accepted, but clearing its local attachment recovery is unconfirmed. Check saved history before restoring that selection. {error}")));
        }
    }
    if let Some(plan) = params.work.as_ref().and_then(|work| work.plan.as_ref()) {
        let mut continued = plan.clone();
        continued.awaiting_approval = false;
        if !active.context.is_current() {
            return Err(account_cloud::changed());
        }
        if let Err(error) = crate::cloud::work_plan::save(&active.client, &continued).await {
            active.update(|snapshot| {
                snapshot.work_plan_error = Some(format!(
                    "Work started, but the planning record update is unconfirmed: {error}"
                ))
            });
        }
        if !active.context.is_current() {
            return Err(account_cloud::changed());
        }
    }
    if *active.stop.borrow() {
        if active.snapshot().run_id.is_some() {
            return Ok(());
        }
        active.update(|snapshot| snapshot.state = AgentTaskState::Cancelled);
        return Ok(());
    }
    let mut stop = active.stop.subscribe();
    let (parser_abort, mut aborted) = watch::channel(false);
    let mut legacy = String::new();
    let mut structured = String::new();
    let mut sequence = 0u64;
    let mut projection_error = None;
    let mut received = 0usize;
    let stream = response.bytes_stream().map(|chunk| {
        let chunk = chunk.map_err(|error| LlmError::Network {
            url: "managed gateway".into(),
            message: error.to_string(),
        })?;
        received = received.saturating_add(chunk.len());
        if received > TRANSCRIPT_JSON_BUDGET * 4 {
            return Err(LlmError::Network {
                url: "managed gateway".into(),
                message: "The stream exceeds the native response budget".into(),
            });
        }
        Ok(chunk)
    });
    let callback_active = active.clone();
    let mut on_event = |event| {
        match event {
            StreamEvent::TextDelta { text } => legacy.push_str(&text),
            StreamEvent::Vendor { event, data } if event == "x_agiwork_plan" => {
                #[derive(serde::Deserialize)]
                struct Frame {
                    steps: Vec<CloudWorkPlanStep>,
                    goal: Option<CloudWorkGoal>,
                    awaiting_approval: Option<bool>,
                }
                let parsed = serde_json::from_value::<Frame>(data)
                    .map_err(|error| error.to_string())
                    .and_then(|frame| {
                        let work = params.work.as_ref().ok_or_else(|| {
                            "A Work plan arrived outside a Work request".to_string()
                        })?;
                        let previous = callback_active.snapshot();
                        let run_id = previous
                            .run_id
                            .ok_or_else(|| "The Work plan has no owned run ID".to_string())?;
                        crate::cloud::work_plan::seal(CloudWorkPlanReview {
                            review_id: String::new(),
                            planning_message_id: params.request_id.clone(),
                            run_id,
                            conversation_id: params.conversation_id.clone(),
                            model: model.clone(),
                            mode: work.mode.clone(),
                            goal: frame
                                .goal
                                .or_else(|| {
                                    previous.work_plan.as_ref().map(|plan| plan.goal.clone())
                                })
                                .unwrap_or_else(|| work.goal.clone()),
                            steps: frame.steps,
                            awaiting_approval: frame.awaiting_approval.unwrap_or(false),
                            declined: false,
                        })
                        .map_err(|error| error.to_string())
                    });
                match parsed {
                    Ok(plan)
                        if serde_json::to_vec(&plan).is_ok_and(|bytes| {
                            bytes
                                .len()
                                .saturating_add(callback_active.snapshot().output.len())
                                <= TRANSCRIPT_JSON_BUDGET
                        }) =>
                    {
                        callback_active.update(|snapshot| snapshot.work_plan = Some(plan))
                    }
                    Ok(_) => {
                        projection_error =
                            Some("The Work plan exceeds the native display budget".into());
                        parser_abort.send_replace(true);
                    }
                    Err(error) => {
                        projection_error =
                            Some(format!("The Work plan could not be read: {error}"));
                        parser_abort.send_replace(true);
                    }
                }
            }
            StreamEvent::Vendor { event, data } if event == "x_agent_event" => {
                let result = serde_json::from_value::<AgentEventEnvelope>(data);
                match result {
                    Ok(envelope)
                        if envelope.schema_version == AGENT_EVENT_SCHEMA_VERSION
                            && callback_active.identity.conversation_id.as_deref()
                                == Some(envelope.session_id.as_str())
                            && envelope.sequence == sequence =>
                    {
                        sequence = sequence.saturating_add(1);
                        match envelope.event {
                            AgentEvent::TextDelta(delta) => structured.push_str(&delta.delta),
                            AgentEvent::ProgressUpdate(progress) => callback_active
                                .update(|snapshot| snapshot.progress = Some(progress.summary)),
                            AgentEvent::TaskStateChanged(state) => {
                                callback_active.update(|snapshot| snapshot.state = state.state)
                            }
                            AgentEvent::Error(error) => projection_error = Some(error.message),
                            AgentEvent::Stop(stop)
                                if stop.reason == AgentEventStopReason::EndTurn =>
                            {
                                callback_active.update(|snapshot| {
                                    snapshot.state = AgentTaskState::ReadyForReview
                                })
                            }
                            _ => {}
                        }
                    }
                    _ => {
                        projection_error = Some(
                            "The gateway activity stream changed identity, schema or sequence"
                                .into(),
                        );
                        parser_abort.send_replace(true);
                    }
                }
            }
            _ => {}
        }
        let text = if structured.is_empty() {
            &legacy
        } else {
            &structured
        };
        if text.len() > TRANSCRIPT_JSON_BUDGET {
            projection_error = Some("The reply exceeds the native display budget".into());
            parser_abort.send_replace(true);
        } else {
            callback_active.update(|snapshot| snapshot.output = text.clone());
        }
    };
    let decoded = agiworkforce_llm::run_openai_compat_stream(
        stream,
        crate::cloud::client::CLOUD_TIMEOUT,
        "managed_cloud",
        &mut on_event,
    );
    let result = tokio::select! { biased; _ = stop.wait_for(|stop| *stop) => None, _ = aborted.wait_for(|abort| *abort) => None, result = decoded => Some(result) };
    if let Some(error) = projection_error {
        return Err(DeveloperSessionHostError::unavailable(error));
    }
    if let Some(result) = result {
        let outcome =
            result.map_err(|error| DeveloperSessionHostError::unavailable(error.to_string()))?;
        if !outcome.tool_calls.is_empty() {
            return Err(DeveloperSessionHostError::unavailable("The gateway requested client-side tools. This account connection cannot execute local tools; continue through an admitted tool host."));
        }
        if !legacy.is_empty() && !structured.is_empty() && legacy != structured {
            return Err(DeveloperSessionHostError::unavailable(
                "The gateway returned inconsistent text projections",
            ));
        }
        if active.snapshot().run_id.is_some() {
            if let Err(error) = refresh_run(&active, false).await {
                active.update(|snapshot| {
                    snapshot.catching_up = true;
                    snapshot.error = Some(format!("The stream ended, but saved run status could not be confirmed: {error}. Refresh the run or use Stop."));
                });
            }
        } else if outcome.stop_reason.is_some()
            || active.snapshot().state == AgentTaskState::ReadyForReview
        {
            active.update(|snapshot| snapshot.state = AgentTaskState::ReadyForReview);
        } else {
            return Err(DeveloperSessionHostError::unavailable(
                "The reply ended without a confirmed completion state",
            ));
        }
        let _control = active.control.lock().await;
        if let Some(plan) = active
            .snapshot()
            .work_plan
            .filter(|plan| plan.awaiting_approval)
        {
            if !active.context.is_current() {
                return Err(account_cloud::changed());
            }
            match crate::cloud::work_plan::save(&active.client, &plan).await {
                Ok(()) => active.update(|snapshot| { snapshot.work_plan_saved = true; snapshot.work_plan_error = None; }),
                Err(error) => active.update(|snapshot| snapshot.work_plan_error = Some(format!("The plan is ready, but its review could not be saved: {error}. Save it before starting work."))),
            }
            if !active.context.is_current() {
                return Err(account_cloud::changed());
            }
        }
    } else if active.snapshot().run_id.is_none() {
        active.update(|snapshot| snapshot.state = AgentTaskState::Cancelled);
    }
    Ok(())
}
