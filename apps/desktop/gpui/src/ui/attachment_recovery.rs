use super::*;
use agiworkforce_protocol::{attachment_recovery::*, cloud_uploads::*};

#[derive(Clone)]
pub(super) enum RecoveryAction {
    Browse,
    ReloadList,
    CloseBrowser,
    Open(CloudChatTarget),
    Reload,
    Restore,
    ClearCurrent,
    ClearListed(AttachmentRecoverySummary),
}

struct SelectionReview {
    target: CloudChatTarget,
    epoch: String,
    revision: Option<String>,
    count: usize,
    pending: Option<String>,
    restore: Option<AttachmentRecoverySnapshot>,
}

impl Desktop {
    fn recovery_supported(&self) -> bool {
        self.account_capabilities
            .as_ref()
            .is_some_and(|caps| caps.cloud_attachment_recovery)
    }

    pub(super) fn ensure_attachment_recovery(
        &mut self,
        target: CloudChatTarget,
        cx: &mut Context<Self>,
    ) {
        if !self.recovery_supported() {
            return;
        }
        let cursor = self
            .cloud
            .detail
            .as_ref()
            .and_then(|detail| detail.messages.last())
            .map(|message| message.id.clone());
        if self.attachment_recovery.target.as_ref() != Some(&target) {
            if self.attachment_recovery.operation.is_some() {
                return;
            }
            self.attachment_recovery.target = Some(target.clone());
            self.attachment_recovery.current = None;
            self.attachment_recovery.loaded = false;
            self.attachment_recovery.error = None;
            self.attachment_recovery.verification_required = false;
            self.attachment_recovery.pending_remove = None;
            self.attachment_recovery.message_cursor = cursor;
        } else if self.attachment_recovery.message_cursor != cursor && !self.cloud.work_busy() {
            self.attachment_recovery.message_cursor = cursor;
            self.attachment_recovery.loaded = false;
        }
        if !self.attachment_recovery.loaded
            && !self.attachment_recovery.busy()
            && !self.chat_upload.pending()
            && !self.cloud.work_busy()
        {
            self.read_attachment_recovery(target, cx);
        }
    }

    fn read_attachment_recovery(&mut self, target: CloudChatTarget, cx: &mut Context<Self>) {
        if !self.recovery_supported() || self.attachment_recovery.busy() {
            return;
        }
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.attachment_recovery.error = Some(error.to_string());
                return;
            }
        };
        let generation = self.account_generation;
        let operation = uuid::Uuid::new_v4();
        self.attachment_recovery.operation = Some(operation);
        self.attachment_recovery.target = Some(target.clone());
        let request = target.clone();
        let task = self.executor.spawn(async move {
            client
                .request::<AttachmentRecoveryReadResponse>(
                    method::CLOUD_ATTACHMENT_RECOVERY_READ,
                    request,
                )
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task.await.context("Reading attachment recovery stopped").and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.account_generation != generation || view.attachment_recovery.operation != Some(operation) || view.attachment_recovery.target.as_ref() != Some(&target) { return; }
                view.attachment_recovery.operation = None;
                view.attachment_recovery.loaded = true;
                match result.and_then(|response| view.attachment_recovery.accept(&target, response)) {
                    Ok(()) => {
                        if let Some(id) = view.attachment_recovery.pending_remove.take() {
                            if view.attachment_recovery.current.as_ref().is_none_or(|snapshot| !snapshot.files.iter().any(|file| file.asset_id == id)) { view.chat_upload.remove(&id); }
                        }
                    }
                    Err(error) => { view.attachment_recovery.verification_required = true; view.attachment_recovery.error = Some(format!("Attachment recovery is unconfirmed: {error:#}. Reload it before sending these files.")); }
                }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    pub(super) fn finish_recovered_upload(
        &mut self,
        response: Option<AttachmentRecoveryReadResponse>,
    ) -> anyhow::Result<()> {
        if let Some(response) = response {
            let target = self
                .chat_upload
                .target
                .clone()
                .context("The attachment has no destination")?;
            self.attachment_recovery.accept(&target, response)?;
            if let Some(recovery) = &self.attachment_recovery.current {
                let Some(CloudUploadedFile::Chat { attachment }) = self
                    .chat_upload
                    .snapshot
                    .as_ref()
                    .and_then(|snapshot| snapshot.file.as_ref())
                else {
                    anyhow::bail!("The upload has no completed attachment");
                };
                anyhow::ensure!(recovery.files.contains(attachment), "The retained selection changed before the file was attached. Reload recovery and review it.");
            }
        }
        self.chat_upload.finish()
    }

    pub(super) fn remove_retained_attachment(&mut self, id: String, cx: &mut Context<Self>) {
        if self.chat_upload.pending() || self.attachment_recovery.busy() {
            return;
        }
        if self.attachment_recovery.available {
            let Some(snapshot) = self
                .attachment_recovery
                .current
                .as_ref()
                .filter(|snapshot| self.chat_upload.target.as_ref() == Some(&snapshot.target))
                .cloned()
            else {
                return;
            };
            self.attachment_recovery.pending_remove = Some(id.clone());
            self.change_attachment_recovery(
                AttachmentRecoveryChangeParams {
                    target: snapshot.target,
                    epoch: snapshot.epoch,
                    revision: snapshot.revision,
                    change: AttachmentRecoveryChange::Remove { asset_id: id },
                },
                false,
                cx,
            );
        } else {
            self.chat_upload.remove(&id);
            cx.notify();
        }
    }

    pub(super) fn attachment_recovery_action(
        &mut self,
        action: RecoveryAction,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if !self.recovery_supported() {
            return;
        }
        match action {
            RecoveryAction::Browse => {
                if self.has_unsaved_cloud_draft(cx)
                    || self.cloud.has_unconfirmed_turn()
                    || self.cloud.navigation_busy()
                {
                    self.cloud.error = Some("Finish or resolve the current selection before opening recovered attachments.".into());
                    cx.notify();
                    return;
                }
                self.attachment_recovery.visible = true;
                self.cloud.visible = true;
                self.cloud.projects.visible = false;
                self.cloud.work_visible = false;
                self.account.visible = false;
                self.load_attachment_recovery_list(cx);
            }
            RecoveryAction::ReloadList => self.load_attachment_recovery_list(cx),
            RecoveryAction::CloseBrowser => {
                self.attachment_recovery.visible = false;
                cx.notify();
            }
            RecoveryAction::Open(target) => {
                if self.cloud.workspaces.selector() != Some(&target.workspace)
                    || self.cloud.scope.as_ref() != Some(&target.scope)
                {
                    return;
                }
                self.attachment_recovery.visible = false;
                self.read_cloud(target.conversation_id, HistoryReadIntent::Latest, cx);
            }
            RecoveryAction::Reload => {
                if let Some(target) = self.attachment_recovery.target.clone() {
                    self.read_attachment_recovery(target, cx);
                }
            }
            RecoveryAction::Restore | RecoveryAction::ClearCurrent => {
                let restore = matches!(action, RecoveryAction::Restore);
                if self.attachment_recovery.busy()
                    || self.chat_upload.pending()
                    || self.cloud.work_busy()
                {
                    return;
                }
                if restore && !self.chat_upload.files.is_empty() {
                    self.attachment_recovery.error = Some(
                        "Send or remove the current attachments before restoring this selection."
                            .into(),
                    );
                    cx.notify();
                    return;
                }
                let Some(snapshot) = self
                    .attachment_recovery
                    .current
                    .clone()
                    .filter(|snapshot| !snapshot.files.is_empty())
                else {
                    return;
                };
                if self.cloud.detail.as_ref().is_none_or(|detail| {
                    detail.scope != snapshot.target.scope
                        || detail.conversation.id != snapshot.target.conversation_id
                }) || self.cloud.workspaces.selector() != Some(&snapshot.target.workspace)
                {
                    return;
                }
                self.confirm_attachment_recovery(
                    SelectionReview {
                        target: snapshot.target.clone(),
                        epoch: snapshot.epoch.clone(),
                        revision: snapshot.revision.clone(),
                        count: snapshot.files.len(),
                        pending: snapshot
                            .pending_send
                            .as_ref()
                            .map(|pending| pending.user_message_id.clone()),
                        restore: restore.then_some(snapshot),
                    },
                    window,
                    cx,
                );
            }
            RecoveryAction::ClearListed(row) => {
                let Some(list) = self.attachment_recovery.list.as_ref() else {
                    return;
                };
                if list.scope != row.target.scope || !list.selections.contains(&row) {
                    return;
                }
                self.confirm_attachment_recovery(
                    SelectionReview {
                        target: row.target,
                        epoch: list.epoch.clone(),
                        revision: Some(row.revision),
                        count: row.file_count as usize,
                        pending: row.pending_send.then(|| "an earlier message".into()),
                        restore: None,
                    },
                    window,
                    cx,
                );
            }
        }
    }

    fn confirm_attachment_recovery(
        &mut self,
        review: SelectionReview,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let SelectionReview {
            target,
            epoch,
            revision,
            count,
            pending,
            restore,
        } = review;
        if self.attachment_recovery.busy() {
            return;
        }
        let operation = uuid::Uuid::new_v4();
        self.attachment_recovery.operation = Some(operation);
        let names = restore
            .as_ref()
            .map(|snapshot| {
                snapshot
                    .files
                    .iter()
                    .map(|file| file.name.as_str())
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .unwrap_or_default();
        let label = self
            .cloud
            .detail
            .as_ref()
            .filter(|detail| detail.conversation.id == target.conversation_id)
            .and_then(|detail| detail.conversation.title.clone())
            .unwrap_or_else(|| target.conversation_id.clone());
        let detail = if restore.is_some() {
            format!("Restore {count} attachment references to {label} on this device? No file is uploaded and no message is sent.\n\n{names}{}", pending.as_ref().map(|id| format!("\n\nThe send for {id} is unconfirmed. Check saved history before restoring; sending this selection again can create another message.")).unwrap_or_default())
        } else {
            format!("Discard {count} retained attachment references for {label} from this device? They cannot be restored from this recovery list afterward. Cloud files and saved messages are not deleted.{}", if pending.is_some() { " An earlier send is unconfirmed; it may already be in saved history." } else { "" })
        };
        let restoring = restore.is_some();
        let answer = window.prompt(
            PromptLevel::Warning,
            if restoring {
                "Restore recovered attachments?"
            } else {
                "Discard recovered selection?"
            },
            Some(&detail),
            &[
                "Cancel",
                if restoring {
                    "Restore attachments"
                } else {
                    "Discard selection"
                },
            ],
            cx,
        );
        cx.spawn(async move |view, cx| {
            let confirmed = matches!(answer.await, Ok(1));
            let _ = view.update(cx, |view, cx| {
                if view.attachment_recovery.operation != Some(operation) {
                    return;
                }
                view.attachment_recovery.operation = None;
                if confirmed {
                    view.change_attachment_recovery(
                        AttachmentRecoveryChangeParams {
                            target,
                            epoch,
                            revision,
                            change: if restoring {
                                AttachmentRecoveryChange::Restore
                            } else {
                                AttachmentRecoveryChange::Clear
                            },
                        },
                        restoring,
                        cx,
                    );
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn change_attachment_recovery(
        &mut self,
        params: AttachmentRecoveryChangeParams,
        restore: bool,
        cx: &mut Context<Self>,
    ) {
        if self.attachment_recovery.busy() {
            return;
        }
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.attachment_recovery.error = Some(error.to_string());
                return;
            }
        };
        let operation = uuid::Uuid::new_v4();
        let generation = self.account_generation;
        let target = params.target.clone();
        let clear = matches!(params.change, AttachmentRecoveryChange::Clear);
        self.attachment_recovery.operation = Some(operation);
        let task = self.executor.spawn(async move {
            client
                .request::<AttachmentRecoveryChangeResponse>(
                    method::CLOUD_ATTACHMENT_RECOVERY_CHANGE,
                    params,
                )
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task.await.context("Updating attachment recovery stopped").and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.account_generation != generation || view.attachment_recovery.operation != Some(operation) { return; }
                view.attachment_recovery.operation = None;
                match result.and_then(|response| view.attachment_recovery.accept_change(&target, response)) {
                    Ok(true) => {
                        if restore {
                            if view.cloud.detail.as_ref().is_none_or(|detail| detail.scope != target.scope || detail.conversation.id != target.conversation_id) || view.cloud.workspaces.selector() != Some(&target.workspace) { view.attachment_recovery.error = Some("The selection remains retained. Open its original conversation before restoring it.".into()); cx.notify(); return; }
                            if let Some(snapshot) = &view.attachment_recovery.current {
                                view.chat_upload = crate::chat_upload::ChatUpload { selection: uuid::Uuid::new_v4(), generation, target: Some(target.clone()), files: snapshot.files.clone(), ..Default::default() };
                            }
                        } else if clear {
                            if view.chat_upload.target.as_ref() == Some(&target) { view.chat_upload = Default::default(); }
                            if view.attachment_recovery.target.as_ref() == Some(&target) { view.attachment_recovery.current = None; view.attachment_recovery.loaded = false; }
                            view.load_attachment_recovery_list(cx);
                        } else if let Some(id) = view.attachment_recovery.pending_remove.take() { view.chat_upload.remove(&id); }
                    }
                    Ok(false) => {}
                    Err(error) => { view.attachment_recovery.verification_required = true; view.attachment_recovery.error = Some(format!("The recovery change is unconfirmed: {error:#}. Reload before trying again.")); }
                }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    fn load_attachment_recovery_list(&mut self, cx: &mut Context<Self>) {
        if self.attachment_recovery.busy() {
            return;
        }
        let Some(scope) = self.cloud.scope.clone() else {
            return;
        };
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.attachment_recovery.error = Some(error.to_string());
                return;
            }
        };
        let operation = uuid::Uuid::new_v4();
        let generation = self.account_generation;
        self.attachment_recovery.list_operation = Some(operation);
        let request = AttachmentRecoveryListParams {
            scope: scope.clone(),
            workspace: None,
        };
        let task = self.executor.spawn(async move {
            client
                .request::<AttachmentRecoveryListResponse>(
                    method::CLOUD_ATTACHMENT_RECOVERY_LIST,
                    request,
                )
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Listing recovered attachments stopped")
                .and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.account_generation != generation
                    || view.attachment_recovery.list_operation != Some(operation)
                {
                    return;
                }
                view.attachment_recovery.list_operation = None;
                if let Err(error) = result
                    .and_then(|response| view.attachment_recovery.accept_list(&scope, response))
                {
                    view.attachment_recovery.error = Some(error.to_string());
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn render_attachment_recovery(
        &self,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        let mut panel = div().flex().flex_col().w_full().min_w_0().max_w(px(self.contracts.frame.content_width)).gap_2().child(gpui::text!("Recovered attachments"))
            .child(gpui::text!("Unsent upload references kept on this device for this account. Recovering a selection does not upload a file or send a message."))
            .child(self.compact_button("close-attachment-recovery", "Back to conversation", UiAction::AttachmentRecovery(RecoveryAction::CloseBrowser), palette, cx));
        if self.attachment_recovery.list_operation.is_some() {
            return panel.child(gpui::text!("Checking recovered selections…"));
        }
        panel = panel.child(self.compact_button(
            "reload-attachment-recovery-list",
            "Refresh selections",
            UiAction::AttachmentRecovery(RecoveryAction::ReloadList),
            palette,
            cx,
        ));
        if let Some(error) = &self.attachment_recovery.error {
            panel = panel.child(gpui::text!(error.clone()));
        }
        if let Some(list) = &self.attachment_recovery.list {
            if list.selections.is_empty() {
                panel = panel.child(gpui::text!(
                    "No recovered attachment selections for this account."
                ));
            }
            for row in &list.selections {
                let workspace = self
                    .cloud
                    .workspaces
                    .choices
                    .iter()
                    .find(|workspace| workspace.selector == row.target.workspace)
                    .map(|workspace| workspace.name.as_str())
                    .unwrap_or("Unavailable workspace");
                panel = panel.child(gpui::text!(format!(
                    "{} · {} · {} files{}",
                    workspace,
                    row.title.as_deref().unwrap_or(if row.readable {
                        "Untitled conversation"
                    } else {
                        "Unavailable conversation"
                    }),
                    row.file_count,
                    if row.pending_send {
                        " · Send unconfirmed"
                    } else {
                        ""
                    }
                )));
                if row.readable && self.cloud.workspaces.selector() == Some(&row.target.workspace) {
                    panel = panel.child(self.compact_button(
                        SharedString::from(format!(
                            "open-recovered-attachments:{}",
                            row.target.conversation_id
                        )),
                        "Open conversation",
                        UiAction::AttachmentRecovery(RecoveryAction::Open(row.target.clone())),
                        palette,
                        cx,
                    ));
                } else if row.readable {
                    panel = panel.child(gpui::text!(format!(
                        "Choose {workspace} from the workspace menu to open this selection."
                    )));
                }
                panel = panel.child(self.compact_button(
                    SharedString::from(format!(
                        "clear-recovered-attachments:{}",
                        row.target.conversation_id
                    )),
                    "Discard local selection",
                    UiAction::AttachmentRecovery(RecoveryAction::ClearListed(row.clone())),
                    palette,
                    cx,
                ));
            }
        }
        panel
    }

    pub(super) fn render_current_attachment_recovery(
        &self,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        let mut panel = div().flex().flex_col().min_w_0().gap_2();
        if !self.recovery_supported() {
            return panel;
        }
        if let Some(error) = &self.attachment_recovery.error {
            panel = panel.child(gpui::text!(error.clone()));
        }
        if self.attachment_recovery.operation.is_some() {
            return panel.child(gpui::text!("Checking attachment recovery…"));
        }
        if self.attachment_recovery.verification_required {
            return panel.child(self.compact_button(
                "verify-attachment-recovery",
                "Reload attachment recovery",
                UiAction::AttachmentRecovery(RecoveryAction::Reload),
                palette,
                cx,
            ));
        }
        let Some(snapshot) = self
            .attachment_recovery
            .current
            .as_ref()
            .filter(|snapshot| {
                self.cloud.detail.as_ref().is_some_and(|detail| {
                    detail.scope == snapshot.target.scope
                        && detail.conversation.id == snapshot.target.conversation_id
                }) && self.cloud.workspaces.selector() == Some(&snapshot.target.workspace)
            })
        else {
            return panel;
        };
        let additional = snapshot
            .files
            .iter()
            .filter(|file| !self.chat_upload.files.contains(file))
            .count();
        if additional == 0 || self.cloud.work_busy() {
            return panel;
        }
        panel = panel.child(gpui::text!(format!(
            "{} recovered attachment references are available for this conversation.",
            snapshot.files.len()
        )));
        for file in &snapshot.files {
            panel = panel.child(gpui::text!(file.name.clone()));
        }
        if let Some(pending) = &snapshot.pending_send {
            panel = panel.child(gpui::text!(format!("The send for message {} is unconfirmed. Check saved history before restoring these files.", pending.user_message_id)));
        }
        panel
            .child(self.compact_button(
                "restore-attachment-recovery",
                "Review and restore",
                UiAction::AttachmentRecovery(RecoveryAction::Restore),
                palette,
                cx,
            ))
            .child(self.compact_button(
                "clear-attachment-recovery",
                "Discard local selection",
                UiAction::AttachmentRecovery(RecoveryAction::ClearCurrent),
                palette,
                cx,
            ))
            .child(self.compact_button(
                "reload-attachment-recovery",
                "Refresh recovery",
                UiAction::AttachmentRecovery(RecoveryAction::Reload),
                palette,
                cx,
            ))
    }
}
