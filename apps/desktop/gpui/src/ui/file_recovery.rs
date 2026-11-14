use super::*;
use agiworkforce_protocol::workspace_files::*;

pub(super) async fn discard_recovery(
    client: BackgroundDeveloperSessionClient,
    current: Option<WorkspaceFileRecoverySnapshot>,
) -> Result<()> {
    let Some(current) = current else {
        return Ok(());
    };
    let response: WorkspaceFileRecoveryWriteResponse = client
        .request(
            method::WORKSPACE_FILE_RECOVERY_WRITE,
            WorkspaceFileRecoveryWriteParams {
                root_key: current.root_key.clone(),
                path: current.path.clone(),
                epoch: current.epoch,
                revision: current.revision,
                change: WorkspaceFileRecoveryChange::Clear,
            },
        )
        .await?;
    anyhow::ensure!(response.accepted && response.current.root_key == current.root_key && response.current.path == current.path && response.current.recovery.is_none() && response.current.revision.is_none(), "Recovery changed or its removal could not be confirmed. Keep your text and reload recovery before discarding it.");
    uuid::Uuid::parse_str(&response.current.epoch)?;
    Ok(())
}

impl Desktop {
    pub(super) fn changed_file_recovery(&mut self, cx: &mut Context<Self>) {
        self.file_recovery_task = None;
        if self.editor.file.is_none()
            || self.editor.saving
            || self.editor.operation.is_some()
            || self.editor.recovery.current.is_none()
            || self.editor.recovery.operation.is_some()
            || self.editor.recovery.error.is_some()
            || self.editor.recovery.review.is_some()
        {
            return;
        }
        let delay = std::time::Duration::from_millis(self.settings.editor_recovery_debounce_ms);
        let generation = self.generation;
        self.file_recovery_task = Some(cx.spawn(async move |view, cx| {
            cx.background_executor().timer(delay).await;
            let _ = view.update(cx, |view, cx| {
                if view.generation == generation {
                    view.save_file_recovery(cx);
                }
            });
        }));
    }

    pub(super) fn save_file_recovery(&mut self, cx: &mut Context<Self>) {
        self.file_recovery_task = None;
        if self.editor.saving || self.editor.operation.is_some() {
            return;
        }
        let Some(file) = self.editor.file.clone() else {
            return;
        };
        let text = self.editor_buffer.read(cx).value().to_string();
        let job = self.editor.recovery.begin(&file, &text);
        let (id, params) = match job {
            Ok(Some(job)) => job,
            Ok(None) => return,
            Err(error) => {
                self.editor.recovery.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        self.editor.notice = None;
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.editor.recovery.operation = None;
                self.editor.recovery.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let generation = self.generation;
        let sent = params.clone();
        let task = self.executor.spawn(async move {
            client
                .request::<WorkspaceFileRecoveryWriteResponse>(
                    method::WORKSPACE_FILE_RECOVERY_WRITE,
                    sent,
                )
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task.await.context("Retaining file edits stopped").and_then(|response| response.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation || view.editor.recovery.operation != Some(id) { return; }
                view.editor.notice = None;
                let result = result.and_then(|response| view.editor.recovery.finish(&file, id, &params, response));
                if let Err(error) = result {
                    view.editor.recovery.operation = None;
                    view.editor.recovery.error = Some(format!("Recovery saving could not be confirmed. Your editor text is retained; reload recovery before retrying. {error:#}"));
                } else { view.changed_file_recovery(cx); }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    pub(super) fn reload_file_recovery(&mut self, cx: &mut Context<Self>) {
        if self.editor.operation.is_some() || self.editor.recovery.operation.is_some() {
            return;
        }
        let Some(file) = self.editor.file.clone() else {
            return;
        };
        if !self
            .capabilities
            .as_ref()
            .is_some_and(|caps| caps.workspace_file_recovery)
        {
            return;
        }
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.editor.recovery.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        self.file_recovery_task = None;
        self.editor.notice = None;
        let id = uuid::Uuid::new_v4();
        self.editor.recovery.operation = Some(id);
        let params = WorkspaceFileParams {
            root_key: file.root_key.clone(),
            path: file.path.clone(),
        };
        let generation = self.generation;
        let task = self.executor.spawn(async move {
            client
                .request::<WorkspaceFileRecoverySnapshot>(
                    method::WORKSPACE_FILE_RECOVERY_READ,
                    params,
                )
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Reloading file recovery stopped")
                .and_then(|response| response.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation
                    || view.editor.recovery.operation != Some(id)
                    || view.editor.file.as_ref() != Some(&file)
                {
                    return;
                }
                view.editor.recovery.operation = None;
                view.editor.notice = None;
                let text = view.editor_buffer.read(cx).value().to_string();
                if let Err(error) =
                    result.and_then(|snapshot| view.editor.recovery.observe(&file, &text, snapshot))
                {
                    view.editor.recovery.error = Some(format!(
                        "Recovery could not be read. Your editor text is retained. {error:#}"
                    ));
                } else {
                    view.changed_file_recovery(cx);
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn resolve_file_recovery(
        &mut self,
        restore: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.editor.operation.is_some() || self.editor.recovery.operation.is_some() {
            return;
        }
        let Some(reviewed) = self.editor.recovery.review.clone() else {
            return;
        };
        let Some(file) = self.editor.file.clone() else {
            return;
        };
        if restore && reviewed.recovery.is_none() {
            return;
        }
        let text = self.editor_buffer.read(cx).value().to_string();
        let changed_disk = reviewed
            .recovery
            .as_ref()
            .is_some_and(|value| value.base_revision != file.revision);
        let detail = if restore {
            if changed_disk {
                "The file on disk changed since these edits were retained. Restoring replaces this window's editor text. Saving afterward replaces the currently loaded file; compare both versions first. Copy your current text before replacing it."
            } else {
                "Restoring replaces this window's editor text with the retained edits. The file on disk changes only when you save it. Copy your current text before replacing it."
            }
        } else {
            "This replaces the retained recovery copy with your current editor text, or removes that copy if the editor matches the file. Copy the recovered text first if you need it."
        };
        let answer = window.prompt(
            PromptLevel::Warning,
            if restore {
                "Restore recovered file edits?"
            } else {
                "Keep the current editor text?"
            },
            Some(detail),
            &[
                "Cancel",
                if restore {
                    "Restore into editor"
                } else {
                    "Keep current text"
                },
            ],
            cx,
        );
        let generation = self.generation;
        let id = uuid::Uuid::new_v4();
        self.editor.recovery.operation = Some(id);
        cx.spawn_in(window, async move |view, cx| {
            let answer = answer.await;
            let _ = view.update_in(cx, |view, window, cx| {
                if view.generation != generation || view.editor.recovery.operation != Some(id) { return; }
                view.editor.recovery.operation = None;
                if !matches!(answer, Ok(1)) { cx.notify(); return; }
                if view.editor.file.as_ref() != Some(&file) || view.editor.recovery.review.as_ref() != Some(&reviewed) || view.editor_buffer.read(cx).value().as_str() != text {
                    view.editor.recovery.error = Some("The file, recovery or editor text changed during confirmation. Review it again.".into()); cx.notify(); return;
                }
                view.editor.recovery.review = None;
                view.editor.recovery.error = None;
                view.editor.recovery.verification_required = true;
                if restore {
                    if let Some(value) = reviewed.recovery { view.editor_buffer.update(cx, |state, cx| state.set_value(value.content, window, cx)); }
                }
                view.save_file_recovery(cx);
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    pub(super) fn render_file_recovery(
        &self,
        file: &WorkspaceFileResponse,
        palette: Palette,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        let mut panel = div().w_full().min_w_0().flex().flex_col().gap_2();
        if !self
            .capabilities
            .as_ref()
            .is_some_and(|caps| caps.workspace_file_recovery)
        {
            return panel.child(gpui::text!(
                "Editor recovery is unavailable on this connection. Keep a copy of unsaved text."
            ));
        }
        if let Some(error) = &self.editor.recovery.error {
            panel = panel.child(gpui::text!(error.clone()));
        }
        if let Some(reviewed) = &self.editor.recovery.review {
            panel = panel.child(gpui::text!("Review recovered file edits"));
            if let Some(value) = &reviewed.recovery {
                if value.base_revision != file.revision {
                    panel = panel.child(gpui::text!(
                        "The file on disk changed since these edits were retained."
                    ));
                }
                let review = window.use_keyed_state("file-recovery-review", cx, |window, cx| {
                    EditorState::new(window, cx)
                });
                if review.read(cx).value().as_str() != value.content {
                    review.update(cx, |state, cx| {
                        state.set_value(value.content.clone(), window, cx)
                    });
                }
                panel = panel
                    .child(crate::editor::source_editor(
                        &review,
                        "Recovered file edits",
                        true,
                        window.bounds().size.height / 3.,
                    ))
                    .child(self.button(
                        "copy-file-recovery",
                        "Copy recovered edits",
                        UiAction::CopyFileRecovery,
                        palette,
                        cx,
                    ));
                if self.editor.recovery.operation.is_none() {
                    panel = panel.child(self.button(
                        "restore-file-recovery",
                        "Restore recovered edits…",
                        UiAction::ResolveFileRecovery(true),
                        palette,
                        cx,
                    ));
                }
            } else {
                panel = panel.child(gpui::text!(
                    "There is currently no retained copy. Your editor text remains in this window."
                ));
            }
            if self.editor.recovery.operation.is_none() {
                panel = panel.child(self.button(
                    "keep-current-file-editor",
                    "Keep current editor text…",
                    UiAction::ResolveFileRecovery(false),
                    palette,
                    cx,
                ));
            }
        } else {
            panel = panel.child(gpui::text!(if self.editor.recovery.operation.is_some() {
                "Retaining file edits…"
            } else if self
                .editor
                .recovery
                .retained(file, self.editor_buffer.read(cx).value().as_str())
            {
                "Editor recovery is current on this device."
            } else {
                "Editor recovery is pending."
            }));
        }
        if self.editor.recovery.operation.is_none() {
            panel = panel.child(self.button(
                "reload-file-recovery",
                "Reload recovery",
                UiAction::ReloadFileRecovery,
                palette,
                cx,
            ));
        }
        panel
    }
}
