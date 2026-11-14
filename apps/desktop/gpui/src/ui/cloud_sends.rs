use super::*;
use agiworkforce_protocol::account_cloud::{
    CloudConversationCreateParams, CloudConversationCreateResponse, CloudTurnIdParams,
    CloudTurnResumeParams, CloudTurnSnapshot, CloudTurnStartParams,
};

impl Desktop {
    pub(super) fn following_cloud_turn(&self) -> bool {
        self.cloud.visible
            && (if self.cloud.work_visible {
                self.cloud.work_selected.is_some()
            } else {
                self.cloud.detail.is_some()
            })
            && self.history_viewport.following()
    }
    pub(super) fn new_cloud(&mut self, work: bool, window: &mut Window, cx: &mut Context<Self>) {
        if self.cloud.has_unconfirmed_turn() {
            self.cloud.error = Some("Check the unconfirmed message status or its saved conversation before leaving it or starting another conversation.".into());
            cx.notify();
            return;
        }
        if self.cloud.loading || self.cloud.navigation_busy() {
            return;
        }
        if self.cloud.management.editing.is_some() {
            self.cloud.management.error = Some(
                "Save or cancel the conversation title before creating another conversation."
                    .into(),
            );
            cx.notify();
            return;
        }
        if self.has_unsaved_cloud_draft(cx) {
            self.cloud.error = Some(
                "Wait for this draft to save, or copy and clear it before creating another conversation."
                    .into(),
            );
            cx.notify();
            return;
        }
        if self.cloud.workspaces.selector().is_none() {
            self.cloud.visible = true;
            self.account.visible = false;
            self.cloud.workspaces.pending_new = Some(work);
            self.require_cloud_workspace(cx);
            cx.notify();
            return;
        }
        let Some(scope) = self.cloud.scope.clone() else {
            self.cloud.error = Some("Load Cloud history before creating a conversation.".into());
            cx.notify();
            return;
        };
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.cloud.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        self.cloud.loading = true;
        self.cloud.error = None;
        self.cloud.visible = true;
        self.account.visible = false;
        let generation = self.cloud.generation;
        let params = CloudConversationCreateParams {
            project_id: self.cloud.projects.active_id.clone(),
            workspace: self.cloud.workspaces.selector().cloned(),
            scope,
            id: uuid::Uuid::new_v4().to_string(),
        };
        let task = self.executor.spawn(async move {
            client
                .request::<CloudConversationCreateResponse>(
                    method::CLOUD_CONVERSATION_CREATE,
                    params,
                )
                .await
        });
        cx.spawn_in(window, async move |view, cx| {
            let result = task
                .await
                .context("Creating the Cloud conversation stopped")
                .and_then(|result| result.map_err(Into::into));
            let _ =
                view.update_in(cx, |view, window, cx| {
                    if view.cloud.generation != generation {
                        return;
                    }
                    view.cloud.loading = false;
                    match result {
                        Ok(response) if view.cloud.scope.as_ref() == Some(&response.scope) => {
                            view.cloud
                                .conversations
                                .insert(0, response.conversation.clone());
                            view.cloud.detail = Some(
                                agiworkforce_protocol::account_cloud::CloudHistoryReadResponse {
                                    draft: None,
                                    scope: response.scope,
                                    conversation: response.conversation,
                                    messages: Vec::new(),
                                    has_more: false,
                                    next_offset: 0,
                                    start_offset: 0,
                                    previous_before: None,
                                },
                            );
                            view.cloud.turn = None;
                            view.cloud.work_visible = false;
                            view.cloud.work_selected = None;
                            view.cloud.compose_work = work;
                            view.cloud.pending_turn = None;
                            view.cloud.draft = Default::default();
                            view.cloud_draft_task = None;
                            view.cloud_composer.update(cx, |state, cx| {
                                state.set_value("", window, cx);
                                state.focus(window, cx);
                            });
                            if let Some(detail) = &view.cloud.detail {
                                view.read_cloud(
                                    detail.conversation.id.clone(),
                                    HistoryReadIntent::Latest,
                                    cx,
                                );
                            }
                        }
                        Ok(_) => view.cloud.error = Some(
                            "The account changed while creating the conversation. Reload history."
                                .into(),
                        ),
                        Err(error) => {
                            view.cloud.error =
                                Some(format!("The conversation could not be created: {error:#}"))
                        }
                    }
                    cx.notify();
                });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn send_cloud(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if !self.cloud.visible
            || self.cloud.work_visible
            || self.cloud.loading
            || self.cloud.navigation_busy()
            || self.attachment_recovery.busy()
            || self.attachment_recovery.verification_required
        {
            return;
        }
        if self.cloud.pending_turn.is_some() {
            self.cloud.error = Some(
                "Reload the saved conversation and check its last turn before sending again."
                    .into(),
            );
            cx.notify();
            return;
        }
        if self.cloud.workspaces.selector().is_none() {
            return;
        }
        let Some(detail) = &self.cloud.detail else {
            return;
        };
        if detail
            .messages
            .iter()
            .any(|message| message.attachments_incomplete)
        {
            self.cloud.error = Some(
                "Saved files could not be read. Open this conversation on Web before continuing."
                    .into(),
            );
            cx.notify();
            return;
        }
        if detail.conversation.archived
            || self.cloud.management.editing.is_some()
            || self.cloud.management.needs_reload
        {
            return;
        }
        let text = self.cloud_composer.read(cx).value().to_string();
        if text.trim().is_empty() && self.chat_upload.files.is_empty() {
            return;
        }
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.cloud.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let attachments = match self
            .chat_target()
            .and_then(|target| self.chat_upload.files_for(&target))
        {
            Ok(files) => files,
            Err(error) => {
                self.cloud.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let params = CloudTurnStartParams {
            attachments,
            workspace: self.cloud.workspaces.selector().cloned(),
            model: detail
                .conversation
                .model
                .as_ref()
                .filter(|id| {
                    self.cloud
                        .model_picker
                        .models
                        .iter()
                        .any(|model| &model.id == *id)
                })
                .cloned(),
            work: if self.cloud.compose_work
                || detail.conversation.work_mode.as_deref()
                    == Some(self.contracts.work_mode.as_str())
            {
                Some(agiworkforce_protocol::account_cloud::CloudWorkRequest {
                    mode: self.contracts.work_mode.clone(),
                    goal: agiworkforce_protocol::account_cloud::CloudWorkGoal {
                        goal: text.trim().to_owned(),
                        constraints: None,
                        deliverable: None,
                        excluded_tools: None,
                    },
                    plan: None,
                })
            } else {
                None
            },
            scope: detail.scope.clone(),
            conversation_id: detail.conversation.id.clone(),
            request_id: uuid::Uuid::new_v4().to_string(),
            user_message_id: uuid::Uuid::new_v4().to_string(),
            text,
            page_size: self.settings.session_page_size,
        };
        self.dispatch_cloud_turn(params, client, window, cx);
    }

    pub(super) fn dispatch_cloud_turn(
        &mut self,
        params: CloudTurnStartParams,
        client: BackgroundDeveloperSessionClient,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.cloud_draft_task = None;
        self.history_viewport.latest();
        self.cloud.pending_turn = Some(params.clone());
        self.cloud.submitting = true;
        self.cloud.error = None;
        let generation = self.cloud.generation;
        let task = self.executor.spawn(async move {
            client
                .request::<CloudTurnSnapshot>(method::CLOUD_TURN_START, params)
                .await
        });
        cx.spawn_in(window, async move |view, cx| {
            let result = task.await.context("Submitting the Cloud message stopped").and_then(|result| result.map_err(Into::into));
            let _ = view.update_in(cx, |view, window, cx| {
                if view.cloud.generation != generation { return; }
                view.cloud.submitting = false;
                match result {
                    Ok(snapshot) => match view.cloud.accept_turn(snapshot) {
                        Ok(clear) => { if clear { if let Some(pending) = &view.cloud.pending_turn { view.chat_upload.sent(&pending.attachments); if !pending.attachments.is_empty() { view.attachment_recovery.loaded = false; view.attachment_recovery.verification_required = true; } } view.cloud_composer.update(cx, |state, cx| state.set_value("", window, cx)); } view.poll_cloud(window, cx); }
                        Err(error) => view.cloud.error = Some(error.to_string()),
                    },
                    Err(error) => view.cloud.error = Some(format!("Message acceptance is unconfirmed: {error:#}. Your draft is retained. Check saved history before resending.")),
                }
                view.schedule_cloud_draft(cx);
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    pub(super) fn poll_cloud(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(params) = self.cloud.turn_id() else {
            return;
        };
        let generation = self.cloud.generation;
        let interval = std::time::Duration::from_millis(self.settings.cloud_poll_interval_ms);
        self.cloud_poll_task = Some(cx.spawn_in(window, async move |view, cx| {
            loop {
                let task = match view.update(cx, |view, _| {
                    if view.cloud.generation != generation { return None; }
                    let client = view.account_client().ok()?;
                    let params = params.clone();
                    Some(view.executor.spawn(async move { client.request::<CloudTurnSnapshot>(method::CLOUD_TURN_READ, params).await }))
                }) { Ok(Some(task)) => task, _ => return };
                let result = task.await.context("Reading the Cloud turn stopped").and_then(|result| result.map_err(Into::into));
                let applied = view.update_in(cx, |view, window, cx| {
                    if view.cloud.generation != generation { return false; }
                    if !view.cloud.matches_turn(&params) { return false; }
                    match result {
                        Ok(snapshot) => {
                            let follow = view.following_cloud_turn();
                            match view.cloud.accept_turn(snapshot) {
                                Ok(clear) => { if clear { if let Some(pending) = &view.cloud.pending_turn { view.chat_upload.sent(&pending.attachments); if !pending.attachments.is_empty() { view.attachment_recovery.loaded = false; view.attachment_recovery.verification_required = true; } } view.cloud_composer.update(cx, |state, cx| state.set_value("", window, cx)); } },
                                Err(error) => { view.cloud.error = Some(error.to_string()); cx.notify(); return false; },
                            }
                            let Some(current) = view.cloud.turn.as_ref() else { return false; };
                            let active = current.needs_attention() || view.cloud.resuming;
                            let error = current.error.clone();
                            let conversation = current.conversation_id.clone();
                            let reviewing_plan = current.state.needs_review() && !current.catching_up && current.work_plan.as_ref().is_some_and(|plan| plan.awaiting_approval) && (current.work_plan_saved || current.work_plan_error.is_some());
                            if error.is_none() { view.cloud.error = None; }
                            if follow { view.history_viewport.latest(); }
                            cx.notify();
                            if reviewing_plan { return false; }
                            if !active {
                                view.cloud.stopping = false;
                                if let Some(error) = error { view.cloud.error = Some(error); }
                                else if !view.cloud.work_visible { if let Some(conversation) = conversation { view.read_cloud(conversation, HistoryReadIntent::Refresh, cx); } }
                            }
                            active
                        }
                        Err(error) => { view.cloud.error = Some(format!("Cloud turn status is unconfirmed: {error:#}. Check saved history before resending.")); cx.notify(); false }
                    }
                });
                if !matches!(applied, Ok(true)) { return; }
                cx.background_executor().timer(interval).await;
            }
        }));
    }

    pub(super) fn stop_cloud(&mut self, params: CloudTurnIdParams, cx: &mut Context<Self>) {
        if self.cloud.stopping {
            return;
        }
        if !self.cloud.matches_turn(&params) {
            return;
        }
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.cloud.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let generation = self.cloud.generation;
        self.cloud.stopping = true;
        let expected = params.clone();
        let task = self.executor.spawn(async move {
            client
                .request::<CloudTurnSnapshot>(method::CLOUD_TURN_STOP, params)
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Stopping the Cloud turn failed")
                .and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.cloud.generation != generation {
                    return;
                }
                if !view.cloud.matches_turn(&expected) {
                    return;
                }
                view.cloud.stopping = false;
                match result {
                    Ok(snapshot) => {
                        if let Err(error) = view.cloud.accept_turn(snapshot) {
                            view.cloud.error = Some(error.to_string());
                        }
                    }
                    Err(error) => {
                        view.cloud.error = Some(format!("Stopping was not confirmed: {error:#}"))
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn resume_cloud(
        &mut self,
        params: CloudTurnResumeParams,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.cloud.resuming
            || self.cloud.stopping
            || !self
                .account_capabilities
                .as_ref()
                .is_some_and(|caps| caps.cloud_turn_resume)
        {
            return;
        }
        let expected = CloudTurnIdParams {
            workspace: self.cloud.workspaces.selector().cloned(),
            scope: params.scope.clone(),
            request_id: params.request_id.clone(),
            run_id: params.run_id.clone(),
        };
        if !self.cloud.matches_turn(&expected) {
            return;
        }
        let confirmation = match &params.action {
            CloudTurnResumeAction::Approval {
                approved: true,
                reviewed,
                ..
            } => Some(
                reviewed
                    .iter()
                    .map(|call| format!("{}\n{}\n{}", call.name, call.summary, call.input))
                    .collect::<Vec<_>>()
                    .join("\n\n"),
            ),
            _ => None,
        };
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.cloud.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let generation = self.cloud.generation;
        self.cloud.resuming = true;
        self.cloud.error = None;
        cx.spawn_in(window, async move |view, cx| {
            let result: Result<Option<CloudTurnSnapshot>> = async {
                if let Some(details) = confirmation {
                    let details = format!("These Cloud actions may change external data. Allowing them once continues this run and may use account credits. Saved permissions will not change.\n\n{details}");
                    let prompt = cx.update(|window, cx| window.prompt(PromptLevel::Warning, "Allow these Cloud actions once?", Some(&details), &["Cancel", "Allow once"], cx))?;
                    if prompt.await? != 1 { return Ok(None); }
                }
                let task = view.update(cx, |view, _| view.executor.spawn(async move { client.request::<CloudTurnSnapshot>(method::CLOUD_TURN_RESUME, params).await }))?;
                Ok(Some(task.await.context("Continuing the Cloud run stopped")??))
            }.await;
            let _ = view.update_in(cx, |view, window, cx| {
                if view.cloud.generation != generation { return; }
                if !view.cloud.matches_turn(&expected) { return; }
                view.cloud.resuming = false;
                match result {
                    Ok(Some(snapshot)) => { if let Err(error) = view.cloud.accept_turn(snapshot) { view.cloud.error = Some(error.to_string()); } },
                    Ok(None) => {},
                    Err(error) => view.cloud.error = Some(format!("Continuation was not confirmed: {error:#}. Refresh the run before deciding again.")),
                }
                view.poll_cloud(window, cx);
                cx.notify();
            });
        }).detach();
        cx.notify();
    }
}
