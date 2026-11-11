use super::*;
use agiworkforce_protocol::developer_session::{
    AcknowledgedResponse, ApprovalResponseParams, DeveloperAgentMode, DeveloperSessionTrustMode,
    LocalModelListResponse, LocalModelProvider, ModelListParams, ThreadIdParams,
    ThreadReadResponse, ThreadReconnectResponse, ThreadStartParams, ThreadStartResponse,
    TurnInterruptParams, TurnStartParams, TurnStartResponse,
};
use agiworkforce_protocol::protocol::ReviewDecision;
use agiworkforce_protocol::user_input::{UserInput, MAX_USER_INPUT_TEXT_CHARS};

impl Desktop {
    pub(super) fn code_busy(&self) -> bool {
        self.changes.applying
            || self.code_worktrees.mutating
            || self.code_settings.writing
            || self.editor.recovery_browser.mutating
            || self.editor.saving
            || self.submitting
            || self
                .conversation
                .as_ref()
                .is_some_and(Conversation::is_running)
    }

    pub(super) fn busy(&self) -> bool {
        self.code_busy() || self.cloud.navigation_busy() || self.attachment_recovery.busy()
    }

    pub(super) fn needs_close_confirmation(&self, cx: &App) -> bool {
        self.code_busy()
            || self.code_worktrees.uncertain
            || self.project_upload.retains_unsaved_source()
            || self.project_download.needs_close_confirmation()
            || self.project_edit_dirty(cx)
            || self.cloud.projects.saving
            || self.cloud.work_busy()
            || self.cloud.has_unconfirmed_turn()
            || self.cloud.management.is_saving()
            || self.terminal.needs_close_confirmation()
            || self
                .editor
                .dirty(self.editor_buffer.read(cx).value().as_str())
            || !self.composer.read(cx).value().is_empty()
            || self.has_unsaved_cloud_draft(cx)
            || self.code_settings.operation.is_some()
            || self
                .code_settings
                .dirty(self.instruction_buffer.read(cx).value().as_str())
            || (self.cloud.management.editing.is_some()
                && self.cloud_title.read(cx).value().as_str()
                    != self
                        .cloud
                        .detail
                        .as_ref()
                        .and_then(|detail| detail.conversation.title.as_deref())
                        .unwrap_or_default())
            || !self.drafts.is_empty()
            || self.account.challenge.is_some()
            || self.account.pending.is_some_and(|pending| {
                matches!(
                    pending,
                    AccountOperation::Starting | AccountOperation::SigningOut
                )
            })
    }

    pub(super) fn client(&self) -> Result<BackgroundDeveloperSessionClient> {
        self.connection_client
            .as_ref()
            .filter(|client| client.is_connected())
            .cloned()
            .context("Open a folder to connect the runtime")
    }

    pub(super) fn new_session(&mut self, cx: &mut Context<Self>) {
        if self.loading || self.code_busy() {
            return;
        }
        self.code_settings.visible = false;
        self.code_worktrees.visible = false;
        self.editor.visible = false;
        self.terminal.visible = false;
        self.terminal.epoch = uuid::Uuid::new_v4();
        self.terminal_poll_task = None;
        self.changes = crate::changes::Changes::default();
        let Ok(client) = self.client() else {
            self.fail(
                anyhow::anyhow!("Open a folder before creating a conversation."),
                cx,
            );
            return;
        };
        self.loading = true;
        self.account.visible = false;
        self.cloud.visible = false;
        self.error = None;
        let generation = self.generation;
        let task = self.executor.spawn(async move {
            client
                .request::<LocalModelListResponse>(
                    method::MODEL_LIST,
                    ModelListParams { refresh: true },
                )
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Model discovery stopped")
                .and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation {
                    return;
                }
                view.loading = false;
                match result {
                    Ok(response) => {
                        let mut models = response.host_models;
                        for local in response.models {
                            if !models.iter().any(|model| {
                                model.id == local.id && model.provider == local.provider.as_str()
                            }) {
                                models.push(HostModelSummary {
                                    id: local.id,
                                    provider: local.provider.as_str().to_owned(),
                                    reachable: true,
                                    unreachable: None,
                                    trust_mode: DeveloperSessionTrustMode::Local,
                                });
                            }
                        }
                        view.models = Some(models);
                    }
                    Err(error) => view.fail(error, cx),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn create_session(
        &mut self,
        index: usize,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.loading || self.code_busy() {
            return;
        }
        let Some(model) = self
            .models
            .as_ref()
            .and_then(|models| models.get(index))
            .cloned()
            .filter(|model| {
                model.reachable && model.trust_mode != DeveloperSessionTrustMode::Unknown
            })
        else {
            return;
        };
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.fail(error, cx);
                return;
            }
        };
        self.save_draft(cx);
        self.changes = crate::changes::Changes::default();
        self.loading = true;
        self.error = None;
        self.pending_events.clear();
        let generation = self.generation;
        let workspace = self
            .workspace
            .as_ref()
            .map(|path| path.to_string_lossy().into_owned());
        let limit = self.contracts.max_frame_bytes.get();
        let task = self.executor.spawn(async move {
            let provider = if model.trust_mode == DeveloperSessionTrustMode::Local {
                match model.provider.as_str() {
                    "ollama" => Some(LocalModelProvider::Ollama),
                    "lmstudio" => Some(LocalModelProvider::Lmstudio),
                    _ => None,
                }
            } else { None };
            let started: ThreadStartResponse = client.request(method::THREAD_START, ThreadStartParams {
                model: Some(model.id), provider, cwd: workspace, title: None,
            }).await?;
            anyhow::ensure!(started.thread.trust_mode == model.trust_mode,
                "The selected model resolved to a different privacy boundary. No message was sent. Choose another model.");
            Self::read_conversation(client, started.thread.id, limit).await
        });
        self.finish_open(task, generation, window, cx);
    }

    pub(super) fn save_draft(&mut self, cx: &App) {
        if let Some(conversation) = &self.conversation {
            let id = conversation.transcript.thread.id.clone();
            let text = self.composer.read(cx).value().to_string();
            if text.is_empty() {
                self.drafts.remove(&id);
            } else {
                self.drafts.insert(id, text);
            }
        }
    }

    async fn read_conversation(
        client: BackgroundDeveloperSessionClient,
        id: String,
        limit: usize,
    ) -> Result<Conversation> {
        let transcript: ThreadReadResponse = client
            .request(
                method::THREAD_READ,
                ThreadIdParams {
                    thread_id: id.clone(),
                },
            )
            .await?;
        let reconnect: ThreadReconnectResponse = client
            .request(method::THREAD_RECONNECT, ThreadIdParams { thread_id: id })
            .await?;
        Conversation::attach(transcript, reconnect, limit)
    }

    pub(super) fn read_session(&mut self, id: String, window: &mut Window, cx: &mut Context<Self>) {
        if !self.code_settings.writing
            && !self.editor.saving
            && !self.editor.recovery_browser.mutating
        {
            self.code_settings.visible = false;
            self.code_worktrees.visible = false;
            self.editor.visible = false;
            self.terminal.visible = false;
            self.terminal.epoch = uuid::Uuid::new_v4();
            self.terminal_poll_task = None;
        }
        if self
            .conversation
            .as_ref()
            .is_some_and(|conversation| conversation.transcript.thread.id == id)
        {
            self.cloud.visible = false;
            self.account.visible = false;
            if !self.changes.applying {
                self.changes.visible = false;
                self.changes.operation = None;
            }
            cx.notify();
            return;
        }
        if self.loading || self.code_busy() {
            self.fail(
                anyhow::anyhow!("Stop the current turn before opening another conversation."),
                cx,
            );
            return;
        }
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.fail(error, cx);
                return;
            }
        };
        self.save_draft(cx);
        self.loading = true;
        self.account.visible = false;
        self.cloud.visible = false;
        self.error = None;
        self.pending_events.clear();
        self.changes = crate::changes::Changes::default();
        let limit = self.contracts.max_frame_bytes.get();
        let task = self
            .executor
            .spawn(Self::read_conversation(client, id, limit));
        self.finish_open(task, self.generation, window, cx);
    }

    fn finish_open(
        &mut self,
        task: tokio::task::JoinHandle<Result<Conversation>>,
        generation: u64,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        cx.spawn_in(window, async move |view, cx| {
            let result = task
                .await
                .context("Opening the conversation stopped")
                .and_then(|result| result);
            let _ = view.update_in(cx, |view, window, cx| {
                if view.generation != generation {
                    return;
                }
                view.loading = false;
                let result = result.and_then(|mut conversation| {
                    conversation.replay(view.pending_events.drain(..))?;
                    Ok(conversation)
                });
                match result {
                    Ok(conversation) => {
                        let id = &conversation.transcript.thread.id;
                        let draft = view.drafts.get(id).cloned().unwrap_or_default();
                        if !view.threads.iter().any(|thread| thread.id == *id) {
                            view.threads
                                .insert(0, conversation.transcript.thread.clone());
                        }
                        view.conversation = Some(conversation);
                        view.changes = crate::changes::Changes::default();
                        view.models = None;
                        view.composer.update(cx, |state, cx| {
                            state.set_value(draft, window, cx);
                            state.focus(window, cx);
                        });
                    }
                    Err(error) => view.fail(error, cx),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn send(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.loading
            || self.code_busy()
            || self.models.is_some()
            || self.account.visible
            || self.cloud.visible
            || self.changes.visible
            || self.editor.visible
            || self.terminal.visible
        {
            return;
        }
        let text = self.composer.read(cx).value().to_string();
        if text.trim().is_empty() {
            return;
        }
        if text.chars().count() > MAX_USER_INPUT_TEXT_CHARS {
            self.fail(
                anyhow::anyhow!(
                    "This message exceeds the runtime's text limit. Shorten it before sending."
                ),
                cx,
            );
            return;
        }
        let Some(conversation) = self.conversation.as_ref().filter(|value| value.can_send()) else {
            self.fail(
                anyhow::anyhow!(
                    "Choose a conversation with a known privacy boundary before sending."
                ),
                cx,
            );
            return;
        };
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.fail(error, cx);
                return;
            }
        };
        let thread_id = conversation.transcript.thread.id.clone();
        let params = TurnStartParams {
            thread_id: thread_id.clone(),
            input: vec![UserInput::Text {
                text: text.clone(),
                text_elements: Vec::new(),
            }],
            model: conversation.transcript.thread.model.clone(),
            cwd: None,
            agent_mode: Some(DeveloperAgentMode::Ask),
            client_turn_id: Some(uuid::Uuid::new_v4().to_string()),
            routing_task_type: None,
            reasoning_effort: None,
            context_files: None,
            max_turns: None,
            routing_profile: None,
            cloud_project_id: None,
            allowed_tools: None,
            disallowed_tools: None,
        };
        if let Some(conversation) = &mut self.conversation {
            conversation.retain_finished_turn();
        }
        self.submitting = true;
        self.error = None;
        let task = self.executor.spawn(async move {
            client
                .request::<TurnStartResponse>(method::TURN_START, params)
                .await
        });
        cx.spawn_in(window, async move |view, cx| {
            let result = task.await.context("Sending the message stopped").and_then(|result| result.map_err(Into::into));
            let _ = view.update_in(cx, |view, window, cx| {
                view.submitting = false;
                let result = result.and_then(|response| {
                    view.conversation.as_mut().filter(|value| value.transcript.thread.id == thread_id)
                        .context("The selected conversation changed while sending")?.accepted(response, text.clone())
                });
                match result {
                    Ok(()) => {
                        view.drafts.remove(&thread_id);
                        view.composer.update(cx, |state, cx| state.set_value("", window, cx));
                    }
                    Err(error) => view.fail(error.context("Message acceptance could not be confirmed. Your draft is retained. Reopen the session and check its history before sending again."), cx),
                }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    pub(super) fn stop(&mut self, cx: &mut Context<Self>) {
        if self.stopping {
            return;
        }
        let Some(conversation) = self
            .conversation
            .as_ref()
            .filter(|value| value.is_running())
        else {
            return;
        };
        let Some(turn) = &conversation.turn else {
            return;
        };
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.fail(error, cx);
                return;
            }
        };
        let params = TurnInterruptParams {
            thread_id: conversation.transcript.thread.id.clone(),
            turn_id: turn.id.clone(),
        };
        self.stopping = true;
        let task = self.executor.spawn(async move {
            client
                .request::<AcknowledgedResponse>(method::TURN_INTERRUPT, params)
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Stopping the turn failed")
                .and_then(|result| result.map_err(Into::into))
                .and_then(|response| {
                    anyhow::ensure!(
                        response.acknowledged,
                        "The runtime did not acknowledge stopping this turn"
                    );
                    Ok(())
                });
            let _ = view.update(cx, |view, cx| {
                view.stopping = false;
                if let Err(error) = result {
                    view.fail(error, cx);
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn approval(
        &mut self,
        id: String,
        allow: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.approval_pending.is_some() {
            return;
        }
        let Some(conversation) = self
            .conversation
            .as_ref()
            .filter(|value| value.is_running())
        else {
            return;
        };
        let Some(turn) = &conversation.turn else {
            return;
        };
        let Some(request) = turn
            .approvals
            .iter()
            .find(|request| request.request_id == id)
            .cloned()
        else {
            return;
        };
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.fail(error, cx);
                return;
            }
        };
        self.approval_pending = Some(id.clone());
        cx.spawn_in(window, async move |view, cx| {
            let result: Result<()> = async {
                if allow {
                    let detail = format!(
                        "{}\n\n{}\n\n{}",
                        request.summary,
                        request.detail,
                        match request.reversible {
                            Some(true) => "The runtime marks this action as reversible.",
                            Some(false) => "This action cannot be undone.",
                            None => "The runtime has not stated whether this action can be undone.",
                        }
                    );
                    let answer = cx.update(|window, cx| {
                        window.prompt(
                            PromptLevel::Warning,
                            "Allow this action once?",
                            Some(&detail),
                            &["Allow once", "Cancel"],
                            cx,
                        )
                    })?;
                    if answer.await? != 0 {
                        return Ok(());
                    }
                }
                let params = ApprovalResponseParams {
                    thread_id: request.thread_id,
                    turn_id: request.turn_id,
                    request_id: id.clone(),
                    decision: if allow {
                        ReviewDecision::Approved
                    } else {
                        ReviewDecision::Denied
                    },
                    note: None,
                    edited_content: None,
                };
                let task = view.update(cx, |view, _| {
                    view.executor.spawn(async move {
                        client
                            .request::<AcknowledgedResponse>(method::APPROVAL_RESPOND, params)
                            .await
                    })
                })?;
                let response = task.await.context("The approval task stopped")??;
                anyhow::ensure!(
                    response.acknowledged,
                    "The runtime did not accept this approval decision"
                );
                view.update(cx, |view, cx| {
                    if let Some(turn) = view
                        .conversation
                        .as_mut()
                        .and_then(|value| value.turn.as_mut())
                    {
                        turn.approvals.retain(|value| value.request_id != id);
                    }
                    cx.notify();
                })?;
                Ok(())
            }
            .await;
            let _ = view.update(cx, |view, cx| {
                view.approval_pending = None;
                if let Err(error) = result {
                    view.fail(error, cx);
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn request_close(
        &mut self,
        quit: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.code_worktrees.mutating {
            self.code_worktrees.visible = true;
            self.code_settings.visible = false;
            self.editor.visible = false;
            self.terminal.visible = false;
            self.cloud.visible = false;
            self.account.visible = false;
            self.code_worktrees.notice = Some("Wait for the worktree change to finish before closing so its result can be confirmed.".into());
            cx.notify();
            return;
        }
        if self.code_settings.writing {
            self.code_settings.visible = true;
            self.editor.visible = false;
            self.terminal.visible = false;
            self.cloud.visible = false;
            self.account.visible = false;
            self.code_settings.notice = Some("Wait for the instruction save to finish before closing so its result can be confirmed.".into());
            cx.notify();
            return;
        }
        if self.cloud.workspaces.is_selecting() {
            self.cloud.workspaces.error = Some("Wait for the workspace switch to finish before closing so its result can be confirmed.".into());
            cx.notify();
            return;
        }
        if self.editor.saving || self.editor.recovery_browser.mutating {
            self.editor.visible = true;
            self.terminal.visible = false;
            self.terminal.epoch = uuid::Uuid::new_v4();
            self.terminal_poll_task = None;
            self.editor.error =
                Some("Wait for the file save to finish before closing this window.".into());
            cx.notify();
            return;
        }
        self.save_file_recovery(cx);
        if self.editor.recovery.operation.is_some() {
            self.editor.visible = true;
            self.editor.notice = Some(
                "Wait for editor recovery to finish before closing so its result can be confirmed."
                    .into(),
            );
            cx.notify();
            return;
        }
        if self.cloud.projects.saving {
            self.cloud.projects.error = Some("Wait for the project save to finish before closing so its result can be confirmed.".into());
            cx.notify();
            return;
        }
        if self.cloud.draft.dirty() && self.cloud.draft.error.is_none() {
            self.save_cloud_draft(cx);
        }
        if self.cloud.draft.operation.is_some() {
            self.cloud.draft.error = Some(
                "Wait for the draft save to finish before closing so its result can be confirmed."
                    .into(),
            );
            cx.notify();
            return;
        }
        if self.cloud.management.is_saving() {
            self.cloud.management.error = Some("Wait for the conversation change to finish before closing so its result can be confirmed.".into());
            cx.notify();
            return;
        }
        if self.closing {
            return;
        }
        if self.submitting {
            self.fail(anyhow::anyhow!("Wait for message acceptance before closing so the runtime can stop the correct turn."), cx);
            return;
        }
        if !self.needs_close_confirmation(cx) {
            if quit {
                cx.quit();
            } else {
                window.remove_window();
            }
            return;
        }
        self.closing = true;
        let answer = window.prompt(PromptLevel::Warning, "Close this window?",
            Some("Closing stops local coding work, terminal jobs, pending sign-in and this window's file upload. Its local upload snapshot is discarded; a file whose completion reached Cloud remains in the account. Attachments with confirmed local recovery remain on this device for this account. Selections without confirmed recovery may be lost. Downloads stop before local saving; a save that has started finishes before the runtime closes. Saved local copies remain. Cloud work may continue in your account; use Stop and wait for confirmation first if you want it cancelled. File edits whose recovery finished remain on this device. Newer edits without confirmed recovery, unsaved instruction edits, drafts, project details, title edits and work inside terminal programs may be lost. Saved messages and completed file changes remain."), &["Keep working", "Close window"], cx);
        cx.spawn_in(window, async move |view, cx| {
            let answer = answer.await;
            if matches!(answer, Ok(1)) {
                let task = view.update(cx, |view, _| {
                    let conversation = view
                        .conversation
                        .as_ref()
                        .filter(|value| value.is_running())?;
                    let turn = conversation.turn.as_ref()?;
                    let client = view
                        .connection_client
                        .as_ref()
                        .filter(|client| client.is_connected())?
                        .clone();
                    let params = TurnInterruptParams {
                        thread_id: conversation.transcript.thread.id.clone(),
                        turn_id: turn.id.clone(),
                    };
                    Some(view.executor.spawn(async move {
                        client
                            .request::<AcknowledgedResponse>(method::TURN_INTERRUPT, params)
                            .await
                    }))
                });
                if let Ok(Some(task)) = task {
                    let stopped = task
                        .await
                        .context("Stopping work before closing failed")
                        .and_then(|result| result.map_err(Into::into))
                        .and_then(|response| { anyhow::ensure!(response.acknowledged, "The runtime did not acknowledge stopping work. Keep the window open and check its status."); Ok(()) });
                    if let Err(error) = stopped {
                        let _ = view.update(cx, |view, cx| {
                            view.closing = false;
                            view.fail(error, cx);
                        });
                        return;
                    }
                }
            }
            if matches!(answer,Ok(1)) {
                let result:Result<()>=async {
                    let task=view.update(cx,|view,_|->Result<_>{
                        let ids=view.terminal.ids_for_close();
                        for id in &ids {view.terminal.pause(&id.terminal_id);}
                        if ids.is_empty(){return Ok(None);}
                        let client=view.client()?;
                        Ok(Some(view.executor.spawn(async move{
                            for id in ids {
                                let summary=client.request::<agiworkforce_protocol::workspace_terminal::TerminalSummary>(method::TERMINAL_CLOSE,id.clone()).await?;
                                anyhow::ensure!(summary.plan.root_key==id.root_key&&summary.plan.terminal_id==id.terminal_id&&matches!(summary.state,agiworkforce_protocol::workspace_terminal::TerminalState::Stopped|agiworkforce_protocol::workspace_terminal::TerminalState::Exited),"The terminal jobs were not confirmed stopped");
                            }
                            Ok::<_,anyhow::Error>(())
                        })))
                    })??;
                    if let Some(task)=task{task.await.context("Stopping terminal jobs before closing failed")??;}
                    Ok(())
                }.await;
                if let Err(error)=result{let _=view.update(cx,|view,cx|{view.closing=false;view.terminal.visible=true;view.terminal.error=Some(format!("Terminal cleanup could not be confirmed. Keep the window open and check its status. {error:#}"));cx.notify();});return;}
            }
            let _ = view.update_in(cx, |view, window, cx| {
                view.closing = false;
                if matches!(answer, Ok(1)) {
                    if quit {
                        cx.quit();
                    } else {
                        window.remove_window();
                    }
                }
            });
        })
        .detach();
    }
}
