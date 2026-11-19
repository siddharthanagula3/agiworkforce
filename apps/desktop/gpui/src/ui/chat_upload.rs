use super::*;
use agiworkforce_protocol::cloud_uploads::*;

#[derive(Clone, Debug)]
pub(super) enum ChatUploadAction {
    Review,
    Start,
    Read,
    Cancel,
    Close,
    Finish,
    Remove(String),
    Reconnect,
}

impl Desktop {
    pub(super) fn chat_target(&self) -> anyhow::Result<CloudChatTarget> {
        let detail = self
            .cloud
            .detail
            .as_ref()
            .context("Open a Cloud conversation first")?;
        anyhow::ensure!(
            !detail.conversation.archived,
            "Restore this conversation before adding files"
        );
        let workspace = self
            .cloud
            .workspaces
            .selector()
            .cloned()
            .context("Choose a Cloud workspace")?;
        Ok(CloudChatTarget {
            scope: detail.scope.clone(),
            workspace,
            conversation_id: detail.conversation.id.clone(),
        })
    }

    pub(super) fn choose_chat_upload(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.chat_upload.pending()
            || self.cloud.navigation_busy()
            || self.attachment_recovery.busy()
            || self.attachment_recovery.verification_required
            || self.cloud.pending_turn.is_some()
            || self.cloud.loading
            || self.project_upload.target.is_some()
            || !self
                .account_capabilities
                .as_ref()
                .is_some_and(|caps| caps.cloud_uploads)
        {
            return;
        }
        let target = match self.chat_target() {
            Ok(target) => target,
            Err(error) => {
                self.cloud.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        if !self.chat_upload.files.is_empty() && self.chat_upload.target.as_ref() != Some(&target) {
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
        if let Err(error) = self.chat_upload.can_add(1) {
            self.cloud.error = Some(error.to_string());
            cx.notify();
            return;
        }
        let selection = uuid::Uuid::new_v4();
        let generation = self.account_generation;
        self.chat_upload.selection = selection;
        self.chat_upload.generation = generation;
        self.chat_upload.target = Some(target.clone());
        self.chat_upload.workspace_name = self
            .cloud
            .workspaces
            .selected
            .as_ref()
            .map(|workspace| workspace.name.clone())
            .unwrap_or_default();
        self.chat_upload.operation = Some(selection);
        self.chat_upload.error = None;
        let paths = cx.prompt_for_paths(PathPromptOptions {
            files: true,
            directories: false,
            multiple: false,
            prompt: Some("Choose a file for this Cloud message".into()),
        });
        cx.spawn_in(window, async move |view, cx| {
            let selected = async {
                let Some(paths) = paths.await?? else { return Ok(None); };
                anyhow::ensure!(paths.len() == 1, "Choose one file for review");
                let path = paths.into_iter().next().context("Choose one file")?;
                Ok::<_, anyhow::Error>(Some((path.to_str().context("Choose a file with a Unicode path")?.to_owned(), consent_timestamp_ms()?)))
            }.await;
            let selected = match selected {
                Ok(Some(selected)) => selected,
                other => { let _ = view.update(cx, |view, cx| {
                    if view.chat_upload.selection != selection { return; }
                    view.chat_upload.operation = None;
                    if let Err(error) = other { view.chat_upload.error = Some(error.to_string()); }
                    else if view.chat_upload.files.is_empty() { view.chat_upload = Default::default(); }
                    cx.notify();
                }); return; }
            };
            let prepared = view.update(cx, |view, _| {
                if view.account_generation != generation || view.chat_upload.selection != selection { return None; }
                Some(view.executor.spawn(async move { client.request::<CloudUploadSnapshot>(method::CLOUD_UPLOAD_PREPARE, CloudUploadPrepareParams { target: CloudUploadTarget::Chat { chat: target }, path: selected.0, selected_at_ms: selected.1 }).await }))
            });
            let Ok(Some(task)) = prepared else { return; };
            let response = task.await;
            let rejected = matches!(&response, Ok(Err(agiworkforce_app_server::DeveloperSessionClientError::Remote { .. })));
            let result = response.context("Preparing the selected attachment stopped").and_then(|result| result.map_err(Into::into));
            let _ = view.update_in(cx, |view, window, cx| {
                if view.account_generation != generation || view.chat_upload.selection != selection { return; }
                view.chat_upload.operation = None;
                let target = view.chat_upload.target.clone();
                let result = target.context("The chat upload lost its destination").and_then(|target| result.and_then(|snapshot| view.chat_upload.accept(&target, None, snapshot)));
                match result {
                    Ok(()) => view.review_chat_upload(window, cx),
                    Err(error) => { view.chat_upload.preparation_unknown = !rejected; view.chat_upload.error = Some(format!("The file was not prepared: {error:#}. File bytes are sent only after upload review.")); }
                }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    fn review_chat_upload(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(snapshot) = self
            .chat_upload
            .snapshot
            .as_ref()
            .filter(|snapshot| {
                snapshot.phase == CloudUploadPhase::Ready && self.chat_upload.operation.is_none()
            })
            .cloned()
        else {
            return;
        };
        if let Err(error) = self.chat_upload.can_add(snapshot.review.byte_count) {
            self.chat_upload.error = Some(error.to_string());
            cx.notify();
            return;
        }
        let selection = self.chat_upload.selection;
        let operation = uuid::Uuid::new_v4();
        self.chat_upload.operation = Some(operation);
        let review = &snapshot.review;
        let destination = if review.destination_name.is_empty() {
            "this conversation"
        } else {
            &review.destination_name
        };
        let detail = format!("Upload {} ({} bytes, {}) to {} / {} in {}?\n\nThis uses your account's Cloud storage and upload allowance. Unsent attachment references are kept on this device for this account when recovery is available. The file is then attached to this message for the selected model to read when you send it. Uploading does not send the message. Removing it from the message does not delete the Cloud copy. Only the reviewed file snapshot is uploaded; no folder access is granted.\n\nSHA-256: {}", review.file_name, review.byte_count, review.mime_type, self.chat_upload.workspace_name, destination, self.contracts.cloud_trust_label, review.checksum_sha256);
        let answer = window.prompt(
            PromptLevel::Warning,
            "Upload this file to Cloud?",
            Some(&detail),
            &["Cancel", "Upload file"],
            cx,
        );
        cx.spawn_in(window, async move |view, cx| {
            let upload = matches!(answer.await, Ok(1));
            let _ = view.update_in(cx, |view, window, cx| {
                if view.chat_upload.selection != selection
                    || view.chat_upload.operation != Some(operation)
                    || view.chat_upload.snapshot.as_ref() != Some(&snapshot)
                {
                    return;
                }
                view.chat_upload.operation = None;
                if upload {
                    view.chat_upload_action(selection, ChatUploadAction::Start, window, cx);
                } else {
                    view.chat_upload_command(ChatUploadAction::Close, cx);
                }
            });
        })
        .detach();
    }

    pub(super) fn chat_upload_action(
        &mut self,
        selection: uuid::Uuid,
        action: ChatUploadAction,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.chat_upload.selection != selection || self.chat_upload.operation.is_some() {
            return;
        }
        match action {
            ChatUploadAction::Review => self.review_chat_upload(window, cx),
            ChatUploadAction::Reconnect => self.reconnect_upload_account(window, cx),
            ChatUploadAction::Remove(id) => {
                self.remove_retained_attachment(id, cx);
            }
            ChatUploadAction::Close
                if self.chat_upload.snapshot.is_none() && !self.chat_upload.preparation_unknown =>
            {
                self.chat_upload.error = None;
                if self.chat_upload.files.is_empty() {
                    self.chat_upload = Default::default();
                }
                cx.notify();
            }
            ChatUploadAction::Close => {
                let Some(snapshot) = self
                    .chat_upload
                    .snapshot
                    .clone()
                    .filter(|snapshot| !snapshot.phase.running())
                else {
                    return;
                };
                let operation = uuid::Uuid::new_v4();
                self.chat_upload.operation = Some(operation);
                let answer = window.prompt(PromptLevel::Warning, "Close this attachment review?", Some("This discards the retained local file snapshot. The original local file is unchanged. An upload whose completion reached Cloud remains in your account; closing the review does not delete it or send a message. Unconfirmed completion must be checked before selecting the source again."), &["Keep review", "Close review"], cx);
                cx.spawn(async move |view, cx| {
                    let close = matches!(answer.await, Ok(1));
                    let _ = view.update(cx, |view, cx| {
                        if view.chat_upload.selection != selection
                            || view.chat_upload.operation != Some(operation)
                            || view.chat_upload.snapshot.as_ref() != Some(&snapshot)
                        {
                            return;
                        }
                        view.chat_upload.operation = None;
                        if close {
                            view.chat_upload_command(ChatUploadAction::Close, cx);
                        }
                        cx.notify();
                    });
                })
                .detach();
            }
            action => self.chat_upload_command(action, cx),
        }
    }

    fn chat_upload_command(&mut self, action: ChatUploadAction, cx: &mut Context<Self>) {
        let Some(snapshot) = self.chat_upload.snapshot.clone() else {
            return;
        };
        let id = snapshot.review.upload.clone();
        if self.chat_upload.operation.is_some()
            || self.chat_upload.generation != self.account_generation
        {
            return;
        }
        if matches!(action, ChatUploadAction::Start) {
            if !(snapshot.phase == CloudUploadPhase::Ready
                || snapshot.phase == CloudUploadPhase::Failed && snapshot.retryable)
            {
                return;
            }
            if let Err(error) = self.chat_upload.can_add(snapshot.review.byte_count) {
                self.chat_upload.error = Some(error.to_string());
                cx.notify();
                return;
            }
        }
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.chat_upload.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let generation = self.account_generation;
        let selection = self.chat_upload.selection;
        let operation = uuid::Uuid::new_v4();
        let finishing = matches!(action, ChatUploadAction::Finish);
        self.chat_upload.operation = Some(operation);
        self.chat_upload.error = None;
        let interval = std::time::Duration::from_millis(self.settings.cloud_poll_interval_ms);
        let request = id.clone();
        let recovery_supported = self
            .account_capabilities
            .as_ref()
            .is_some_and(|caps| caps.cloud_attachment_recovery);
        let task = self.executor.spawn(async move {
            match action {
                ChatUploadAction::Start => client
                    .request::<CloudUploadSnapshot>(method::CLOUD_UPLOAD_START, request)
                    .await
                    .map(|snapshot| (Some(snapshot), None)),
                ChatUploadAction::Read => client
                    .request::<CloudUploadSnapshot>(method::CLOUD_UPLOAD_READ, request)
                    .await
                    .map(|snapshot| (Some(snapshot), None)),
                ChatUploadAction::Cancel => client
                    .request::<CloudUploadSnapshot>(method::CLOUD_UPLOAD_CANCEL, request)
                    .await
                    .map(|snapshot| (Some(snapshot), None)),
                ChatUploadAction::Close | ChatUploadAction::Finish => {
                    if snapshot.cancelable && !finishing {
                        let mut stopped: CloudUploadSnapshot = client
                            .request(method::CLOUD_UPLOAD_CANCEL, request.clone())
                            .await?;
                        while stopped.phase.running() {
                            tokio::time::sleep(interval).await;
                            stopped = client
                                .request(method::CLOUD_UPLOAD_READ, request.clone())
                                .await?;
                        }
                    }
                    let recovery_target = match &request.target { CloudUploadTarget::Chat { chat } => chat.clone(), _ => return Err(agiworkforce_app_server::DeveloperSessionClientError::InvalidResponse("This is not a chat attachment")) };
                    let result: agiworkforce_protocol::developer_session::AcknowledgedResponse =
                        client
                            .request(method::CLOUD_UPLOAD_RELEASE, request)
                            .await?;
                    if !result.acknowledged {
                        return Err(
                            agiworkforce_app_server::DeveloperSessionClientError::InvalidResponse(
                                "The runtime did not release this attachment review",
                            ),
                        );
                    }
                    let recovery = if finishing && recovery_supported {
                        Some(client.request::<agiworkforce_protocol::attachment_recovery::AttachmentRecoveryReadResponse>(method::CLOUD_ATTACHMENT_RECOVERY_READ, recovery_target).await?)
                    } else { None };
                    Ok((None, recovery))
                }
                _ => unreachable!(),
            }
        });
        cx.spawn(async move |view, cx| {
            let result = task.await.context("The attachment command stopped").and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.account_generation != generation || view.chat_upload.selection != selection || view.chat_upload.operation != Some(operation) { return; }
                view.chat_upload.operation = None;
                match result {
                    Ok((Some(snapshot), _)) => {
                        let target = view.chat_upload.target.clone().context("The attachment lost its destination");
                        match target.and_then(|target| view.chat_upload.accept(&target, Some(&id.id), snapshot)) {
                            Ok(()) => {
                                if view.chat_upload.snapshot.as_ref().is_some_and(|snapshot| snapshot.phase == CloudUploadPhase::Succeeded) { view.chat_upload_command(ChatUploadAction::Finish, cx); }
                                else { view.poll_chat_upload(cx); }
                            }
                            Err(error) => view.chat_upload.error = Some(error.to_string()),
                        }
                    }
                    Ok((None, recovery)) if finishing => { if let Err(error) = view.finish_recovered_upload(recovery) { view.chat_upload.error = Some(error.to_string()); } }
                    Ok((None, _)) => { view.chat_upload.snapshot = None; view.chat_upload.error = None; if view.chat_upload.files.is_empty() { view.chat_upload = Default::default(); } }
                    Err(error) => view.chat_upload.error = Some(format!("Attachment status is unconfirmed: {error:#}. Check its status before retrying.")),
                }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    fn poll_chat_upload(&mut self, cx: &mut Context<Self>) {
        let Some(snapshot) = self
            .chat_upload
            .snapshot
            .as_ref()
            .filter(|snapshot| snapshot.phase.running())
        else {
            return;
        };
        let id = snapshot.review.upload.clone();
        let selection = self.chat_upload.selection;
        let generation = self.account_generation;
        let interval = std::time::Duration::from_millis(self.settings.cloud_poll_interval_ms);
        self.chat_upload_poll_task = Some(cx.spawn(async move |view, cx| {
            cx.background_executor().timer(interval).await;
            let _ = view.update(cx, |view, cx| {
                if view.account_generation == generation
                    && view.chat_upload.selection == selection
                    && view.chat_upload.operation.is_none()
                    && view.chat_upload.snapshot.as_ref().is_some_and(|snapshot| {
                        snapshot.review.upload == id && snapshot.phase.running()
                    })
                {
                    view.chat_upload_command(ChatUploadAction::Read, cx);
                }
            });
        }));
    }

    pub(super) fn render_chat_upload(
        &self,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let mut panel = div()
            .id("chat-upload-progress")
            .w_full()
            .min_w_0()
            .flex()
            .flex_col()
            .gap_1()
            .px(px(self.contracts.frame.viewport_gutter));
        if self.chat_upload.target.is_none()
            || (!self.chat_upload.pending() && self.chat_upload.error.is_none())
        {
            return panel;
        }
        panel = panel.role(gpui::Role::Group).aria_label("Chat file upload");
        let selection = self.chat_upload.selection;
        if let Some(snapshot) = &self.chat_upload.snapshot {
            panel = panel.child(gpui::text!(format!(
                "{} · {} of {} bytes",
                snapshot.review.file_name, snapshot.uploaded_bytes, snapshot.review.byte_count
            )));
            panel = panel.child(gpui::text!(match snapshot.phase {
                CloudUploadPhase::Ready => "File ready for upload review",
                CloudUploadPhase::Uploading => "Uploading attachment…",
                CloudUploadPhase::Completing => "Confirming the stored attachment…",
                CloudUploadPhase::Cancelling => "Stopping attachment upload…",
                CloudUploadPhase::Succeeded => "File uploaded. Finishing attachment…",
                CloudUploadPhase::Failed => "Attachment upload needs attention",
                CloudUploadPhase::Cancelled => "Attachment upload stopped",
            }));
            if self.chat_upload.operation.is_none() {
                let mut actions = div().flex().flex_wrap().gap_2();
                let mut buttons = Vec::new();
                let mut add = |label: &'static str, id: &'static str, action| {
                    buttons.push((label, id, action));
                };
                if snapshot.phase == CloudUploadPhase::Succeeded {
                    add(
                        "Finish attaching",
                        "finish-chat-attachment",
                        ChatUploadAction::Finish,
                    );
                } else if snapshot.phase == CloudUploadPhase::Ready
                    && self.chat_upload.error.is_none()
                {
                    add(
                        "Review upload",
                        "review-chat-upload",
                        ChatUploadAction::Review,
                    );
                } else {
                    add("Check status", "read-chat-upload", ChatUploadAction::Read);
                    if snapshot.phase == CloudUploadPhase::Failed
                        && snapshot.retryable
                        && self.chat_upload.error.is_none()
                    {
                        add(
                            if snapshot.uncertain {
                                "Check completion"
                            } else {
                                "Retry upload"
                            },
                            "retry-chat-upload",
                            ChatUploadAction::Start,
                        );
                    }
                }
                if snapshot.cancelable {
                    add(
                        "Stop upload",
                        "cancel-chat-upload",
                        ChatUploadAction::Cancel,
                    );
                }
                if !snapshot.phase.running() {
                    add("Close review", "close-chat-upload", ChatUploadAction::Close);
                }
                for (label, id, action) in buttons {
                    actions = actions.child(self.compact_button(
                        id,
                        label,
                        UiAction::ChatUpload(selection, action),
                        palette,
                        cx,
                    ));
                }
                panel = panel.child(actions);
            }
        } else if self.chat_upload.operation.is_some() {
            panel = panel.child(gpui::text!("Preparing the selected file for review…"));
        }
        if let Some(error) = self.chat_upload.error.as_ref().or_else(|| {
            self.chat_upload
                .snapshot
                .as_ref()
                .and_then(|snapshot| snapshot.error.as_ref())
        }) {
            panel = panel.child(gpui::text!(error.clone()));
        }
        if self.chat_upload.operation.is_none() {
            if self.chat_upload.snapshot.is_none() && !self.chat_upload.preparation_unknown {
                panel = panel.child(self.compact_button(
                    "close-chat-file-selection",
                    "Close file selection",
                    UiAction::ChatUpload(selection, ChatUploadAction::Close),
                    palette,
                    cx,
                ));
            }
            panel = panel.child(self.compact_button(
                "reconnect-chat-upload",
                "Reconnect account",
                UiAction::ChatUpload(selection, ChatUploadAction::Reconnect),
                palette,
                cx,
            ));
        }
        panel
    }
}
