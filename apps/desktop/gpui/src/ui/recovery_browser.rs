use super::*;
use agiworkforce_protocol::workspace_files::*;

impl Desktop {
    pub(super) fn open_recovered_files(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.editor.saving
            || self.editor.operation.is_some()
            || !self
                .capabilities
                .as_ref()
                .is_some_and(|caps| caps.workspace_file_recovery_browser)
        {
            return;
        }
        self.editor.recovery_browser.visible = true;
        self.focus.focus(window, cx);
        self.refresh_recovered_files(cx);
        cx.notify();
    }

    pub(super) fn refresh_recovered_files(&mut self, cx: &mut Context<Self>) {
        if self.editor.recovery_browser.operation.is_some() {
            return;
        }
        let Some(root) = self.editor.root.as_ref().map(|root| root.root_key.clone()) else {
            return;
        };
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.editor.recovery_browser.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let id = self.editor.recovery_browser.begin();
        let generation = self.generation;
        let requested = root.clone();
        let task = self.executor.spawn(async move {
            client
                .request::<WorkspaceFileRecoveryListResponse>(
                    method::WORKSPACE_FILE_RECOVERY_LIST,
                    WorkspaceFileRecoveryListParams {
                        root_key: requested,
                    },
                )
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Listing recovered files stopped")
                .and_then(|value| value.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation
                    || view.editor.recovery_browser.operation != Some(id)
                {
                    return;
                }
                view.editor.recovery_browser.operation = None;
                if let Err(error) =
                    result.and_then(|page| view.editor.recovery_browser.accept_list(&root, page))
                {
                    view.editor.recovery_browser.error = Some(format!(
                        "Recovered edits could not be listed. Stored copies are retained. {}",
                        crate::recovery_browser::recovery_error_message(&error)
                    ));
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn read_recovered_file(
        &mut self,
        path: String,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.editor.recovery_browser.operation.is_some() {
            return;
        }
        let Some(root) = self.editor.root.as_ref().map(|root| root.root_key.clone()) else {
            return;
        };
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.editor.recovery_browser.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let id = self.editor.recovery_browser.begin();
        let generation = self.generation;
        let target = WorkspaceFileParams {
            root_key: root.clone(),
            path: path.clone(),
        };
        let task = self.executor.spawn(async move {
            client
                .request::<WorkspaceFileRecoverySnapshot>(
                    method::WORKSPACE_FILE_RECOVERY_READ,
                    target,
                )
                .await
        });
        cx.spawn_in(window, async move |view, cx| {
            let result = task
                .await
                .context("Opening recovered edits stopped")
                .and_then(|value| value.map_err(Into::into));
            let _ = view.update_in(cx, |view, window, cx| {
                if view.generation != generation
                    || view.editor.recovery_browser.operation != Some(id)
                {
                    return;
                }
                view.editor.recovery_browser.operation = None;
                if let Err(error) = result.and_then(|snapshot| {
                    view.editor
                        .recovery_browser
                        .accept_snapshot(&root, &path, snapshot)
                }) {
                    view.editor.recovery_browser.error = Some(format!(
                        "Recovered edits could not be opened. The previous preview is retained. {}",
                        crate::recovery_browser::recovery_error_message(&error)
                    ));
                } else {
                    view.recovery_destination
                        .update(cx, |input, cx| input.set_value("", window, cx));
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn save_recovery_copy(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.editor.recovery_browser.operation.is_some()
            || self.editor.recovery.operation.is_some()
            || self.editor.saving
        {
            return;
        }
        if self.code_busy() || self.loading {
            self.editor.recovery_browser.error =
                Some("Finish the current coding work before creating a recovery file.".into());
            cx.notify();
            return;
        }
        let destination = self.recovery_destination.read(cx).value().to_string();
        let params = match self
            .editor
            .recovery_browser
            .copy_params(destination.clone())
        {
            Ok(params) => params,
            Err(error) => {
                self.editor.recovery_browser.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.editor.recovery_browser.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let reviewed = self.editor.recovery_browser.selected.clone();
        let detail = format!("Create {:?} in this coding folder from the retained edits for {:?}. The destination must be unused. The recovery copy remains available.", params.destination, params.path);
        self.focus.focus(window, cx);
        let answer = window.prompt(
            PromptLevel::Warning,
            "Create a file from recovered edits?",
            Some(&detail),
            &["Cancel", "Create file"],
            cx,
        );
        let id = self.editor.recovery_browser.begin();
        self.editor.recovery_browser.mutating = true;
        let generation = self.generation;
        cx.spawn_in(window, async move |view, cx| {
            let result: Result<Option<WorkspaceFileRecoveryRestoreResponse>> = async {
                if answer.await? != 1 { return Ok(None); }
                let sent = params.clone();
                let task = view.update(cx, |view, cx| {
                    anyhow::ensure!(view.generation == generation && view.editor.recovery_browser.operation == Some(id) && view.editor.recovery_browser.selected == reviewed && view.recovery_destination.read(cx).value().as_str() == destination, "The recovered edits or destination changed during confirmation. Review them again.");
                    view.editor.recovery_browser.attempted = Some(sent.clone());
                    Ok::<_, anyhow::Error>(view.executor.spawn(async move { client.request::<WorkspaceFileRecoveryRestoreResponse>(method::WORKSPACE_FILE_RECOVERY_RESTORE, sent).await }))
                })??;
                Ok(Some(task.await.context("Saving the recovery copy stopped")??))
            }.await;
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation || view.editor.recovery_browser.operation != Some(id) { return; }
                view.editor.recovery_browser.operation = None;
                view.editor.recovery_browser.mutating = false;
                if let Err(error) = result.and_then(|response| response.map_or(Ok(()), |response| view.editor.recovery_browser.accept_copy(&params, response))) { view.editor.recovery_browser.error = Some(crate::recovery_browser::copy_error_message(&params, &error)); }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    pub(super) fn discard_recovery_copy(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.editor.recovery_browser.operation.is_some()
            || self.editor.recovery.operation.is_some()
            || self.editor.saving
        {
            return;
        }
        let params = match self.editor.recovery_browser.clear_params() {
            Ok(params) => params,
            Err(error) => {
                self.editor.recovery_browser.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.editor.recovery_browser.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let reviewed = self.editor.recovery_browser.selected.clone();
        let detail = format!("This removes the retained recovery copy for {:?}. Workspace files and any open editor text remain unchanged. Copy the recovered text or create a file first if you need it.", params.path);
        self.focus.focus(window, cx);
        let answer = window.prompt(
            PromptLevel::Warning,
            "Discard this recovery copy?",
            Some(&detail),
            &["Keep recovery", "Discard recovery"],
            cx,
        );
        let id = self.editor.recovery_browser.begin();
        self.editor.recovery_browser.mutating = true;
        self.file_recovery_task = None;
        let generation = self.generation;
        cx.spawn_in(window, async move |view, cx| {
            let result: Result<Option<WorkspaceFileRecoveryWriteResponse>> = async {
                if answer.await? != 1 { return Ok(None); }
                let sent = params.clone();
                let task = view.update(cx, |view, _| {
                    anyhow::ensure!(view.generation == generation && view.editor.recovery_browser.operation == Some(id) && view.editor.recovery_browser.selected == reviewed, "Recovered edits changed during confirmation. Review them again.");
                    Ok::<_, anyhow::Error>(view.executor.spawn(async move { client.request::<WorkspaceFileRecoveryWriteResponse>(method::WORKSPACE_FILE_RECOVERY_WRITE, sent).await }))
                })??;
                Ok(Some(task.await.context("Discarding recovery stopped")??))
            }.await;
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation || view.editor.recovery_browser.operation != Some(id) { return; }
                view.editor.recovery_browser.operation = None;
                view.editor.recovery_browser.mutating = false;
                let result = result.and_then(|response| {
                    let Some(response) = response else { return Ok(()); };
                    crate::editor_recovery::validate_recovery_target(&params.root_key, &params.path, &response.current)?;
                    anyhow::ensure!(!response.accepted || response.current.recovery.is_none(), "The host acknowledged a different recovery operation");
                    if let Some(file) = view.editor.file.as_ref().filter(|file| file.root_key == params.root_key && file.path == params.path) {
                        let text = view.editor_buffer.read(cx).value().to_string();
                        view.editor.recovery.observe(file, &text, response.current.clone())?;
                    }
                    if response.current.recovery.is_none() {
                        view.editor.recovery_browser.selected = None;
                        view.refresh_recovered_files(cx);
                    } else {
                        view.editor.recovery_browser.selected = Some(response.current);
                        anyhow::bail!("The retained edits changed. Review the current copy before discarding it.");
                    }
                    Ok(())
                });
                if let Err(error) = result { view.editor.recovery_browser.error = Some(format!("Recovery removal could not be confirmed. Reload the list before retrying. {}", crate::recovery_browser::recovery_error_message(&error))); }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    pub(super) fn render_recovered_files(
        &self,
        palette: Palette,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        let state = &self.editor.recovery_browser;
        let mut panel = div()
            .w_full()
            .min_w_0()
            .max_w(px(self.contracts.frame.content_width))
            .flex()
            .flex_col()
            .gap_3();
        panel = panel.child(gpui::text!("Recovered edits"));
        if state.operation.is_none() {
            panel = panel
                .child(self.button(
                    "back-from-recovery-browser",
                    "Back to files",
                    UiAction::BackFromRecoveredFiles,
                    palette,
                    cx,
                ))
                .child(self.button(
                    "refresh-recovered-files",
                    "Refresh recovered edits",
                    UiAction::RefreshRecoveredFiles,
                    palette,
                    cx,
                ));
        }
        if let Some(root) = &self.editor.root {
            panel = panel.child(gpui::text!(root.cwd.clone()));
        }
        if let Some(error) = &state.error {
            panel = panel.child(gpui::text!(error.clone()));
            if state.operation.is_none() {
                if let Some(attempted) = &state.attempted {
                    panel = panel.child(self.button(
                        "inspect-recovery-destination",
                        "Inspect attempted destination",
                        UiAction::OpenRecoveredOriginal(attempted.destination.clone()),
                        palette,
                        cx,
                    ));
                }
            }
        }
        if state.operation.is_some() {
            panel = panel.child(gpui::text!(if state.mutating {
                "Waiting for recovery completion…"
            } else {
                "Loading recovered edits…"
            }));
        }
        if let Some(list) = &state.list {
            if list.unavailable > 0 {
                panel = panel.child(gpui::text!(format!("{} retained file(s) are unavailable under the current file policy. Their stored edits remain retained.", list.unavailable)));
            }
            if list.entries.is_empty() {
                panel = panel.child(gpui::text!(
                    "No recovered edits are listed for this folder."
                ));
            }
            if state.operation.is_none() {
                for entry in &list.entries {
                    panel = panel.child(self.button(
                        format!("recovery-entry:{}", entry.path),
                        format!("{} · {} bytes", entry.path, entry.byte_count),
                        UiAction::ReadRecoveredFile(entry.path.clone()),
                        palette,
                        cx,
                    ));
                }
            }
        }
        if let Some(snapshot) = &state.selected {
            panel = panel.child(gpui::text!(snapshot.path.clone()));
            if let Some(value) = &snapshot.recovery {
                let preview = window.use_keyed_state("recovery-browser-text", cx, |window, cx| {
                    EditorState::new(window, cx)
                });
                if preview.read(cx).value().as_str() != value.content {
                    preview.update(cx, |input, cx| {
                        input.set_value(value.content.clone(), window, cx)
                    });
                }
                panel = panel.child(crate::editor::source_editor(
                    &preview,
                    "Retained recovery text",
                    true,
                    window.bounds().size.height / 3.,
                ));
                if state.operation.is_none() {
                    panel = panel.child(self.button(
                        "copy-recovery-browser-text",
                        "Copy recovered text",
                        UiAction::CopyRecoveredText,
                        palette,
                        cx,
                    ));
                    if state.list.as_ref().is_some_and(|list| {
                        list.entries
                            .iter()
                            .any(|entry| entry.path == snapshot.path && entry.source_available)
                    }) {
                        panel = panel.child(self.button(
                            "open-recovery-original",
                            "Open original file",
                            UiAction::OpenRecoveredOriginal(snapshot.path.clone()),
                            palette,
                            cx,
                        ));
                    } else {
                        panel = panel.child(gpui::text!("The original file was unavailable when last checked. You can create a new copy from these retained edits."));
                    }
                    panel = panel.child(
                        Input::new(&self.recovery_destination)
                            .aria_label("New relative recovery file path")
                            .accessibility_id("recovery-destination"),
                    );
                    if self.editor.recovery.operation.is_none() {
                        if !self.code_busy() && !self.loading {
                            panel = panel.child(self.button(
                                "save-recovery-copy",
                                "Create file from recovered edits…",
                                UiAction::SaveRecoveryCopy,
                                palette,
                                cx,
                            ));
                        }
                        panel = panel.child(self.button(
                            "discard-browser-recovery",
                            "Discard recovery copy…",
                            UiAction::DiscardRecoveryCopy,
                            palette,
                            cx,
                        ));
                    }
                }
            }
        }
        if let Some(saved) = &state.saved {
            panel = panel.child(gpui::text!(format!(
                "Last confirmed copy: {}",
                saved.destination
            )));
            if state.operation.is_none() {
                panel = panel.child(self.button(
                    "open-recovery-created-file",
                    "Open created file",
                    UiAction::OpenRecoveredOriginal(saved.destination.clone()),
                    palette,
                    cx,
                ));
            }
        }
        panel
    }
}
