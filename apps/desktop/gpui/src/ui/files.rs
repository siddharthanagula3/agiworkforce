use super::*;
use agiworkforce_protocol::{developer_session::DeveloperWorkspaceIdentity, workspace_files::*};

impl Desktop {
    pub(super) fn open_files(&mut self, cx: &mut Context<Self>) {
        if self.loading
            || !self
                .capabilities
                .as_ref()
                .is_some_and(|caps| caps.workspace_files)
        {
            return;
        }
        self.editor.visible = true;
        self.code_settings.visible = false;
        self.code_worktrees.visible = false;
        self.account.visible = false;
        self.cloud.visible = false;
        self.models = None;
        self.changes.visible = false;
        self.history_viewport.older();
        if self.editor.root.is_some() {
            cx.notify();
            return;
        }
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.editor.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let operation = self.editor.begin();
        let generation = self.generation;
        let task = self.executor.spawn(async move {
            client
                .request::<DeveloperWorkspaceIdentity>(
                    method::WORKSPACE_IDENTITY,
                    serde_json::json!({}),
                )
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Opening coding files stopped")
                .and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation || view.editor.operation != Some(operation) {
                    return;
                }
                view.editor.operation = None;
                match result {
                    Ok(root) if !root.root_key.is_empty() && !root.cwd.is_empty() => {
                        view.editor.root = Some(root);
                        view.browse_files(String::new(), None, cx);
                    }
                    Ok(_) => {
                        view.editor.error =
                            Some("The coding host returned no folder identity".into())
                    }
                    Err(error) => {
                        view.editor.error = Some(format!("Files could not be opened: {error:#}"))
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn browse_files(
        &mut self,
        path: String,
        after: Option<String>,
        cx: &mut Context<Self>,
    ) {
        if self.editor.operation.is_some() || !self.editor.visible {
            return;
        }
        let Some(root) = &self.editor.root else {
            return;
        };
        let params = WorkspaceDirectoryParams {
            root_key: root.root_key.clone(),
            path,
            after,
        };
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.editor.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let operation = self.editor.begin();
        let generation = self.generation;
        let requested = params.clone();
        let task = self.executor.spawn(async move {
            client
                .request::<WorkspaceDirectoryResponse>(method::WORKSPACE_FILES_LIST, params)
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Loading the folder stopped")
                .and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation || view.editor.operation != Some(operation) {
                    return;
                }
                view.editor.operation = None;
                if let Err(error) =
                    result.and_then(|page| view.editor.accept_directory(&requested, page))
                {
                    view.editor.error = Some(format!("The folder could not be read: {error:#}"));
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn read_file(&mut self, path: String, window: &mut Window, cx: &mut Context<Self>) {
        if self.editor.recovery.operation.is_some() {
            self.editor.notice =
                Some("Wait for editor recovery to finish before opening another file.".into());
            cx.notify();
            return;
        }
        if self.editor.operation.is_some()
            || self.editor.recovery.operation.is_some()
            || !self.editor.visible
        {
            return;
        }
        let Some(root) = &self.editor.root else {
            return;
        };
        let params = WorkspaceFileParams {
            root_key: root.root_key.clone(),
            path,
        };
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.editor.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let dirty = self
            .editor
            .dirty(self.editor_buffer.read(cx).value().as_str());
        self.file_recovery_task = None;
        let recovery = self.editor.recovery.current.clone();
        let recovery_supported = self
            .capabilities
            .as_ref()
            .is_some_and(|caps| caps.workspace_file_recovery);
        let operation = self.editor.begin();
        let generation = self.generation;
        cx.spawn_in(window, async move |view, cx| {
            let result: Result<Option<(WorkspaceFileResponse, Option<WorkspaceFileRecoverySnapshot>)>> = async {
                if dirty {
                    let prompt = cx.update(|window, cx| window.prompt(PromptLevel::Warning, "Discard unsaved file edits?", Some("Opening or reloading replaces this window's editor text and removes its retained recovery copy. Save or copy the text first if you want to keep it."), &["Keep editing", "Discard and open"], cx))?;
                    if prompt.await? != 1 { return Ok(None); }
                    let discard_client = client.clone();
                    let discard = view.update(cx, |view, _| view.executor.spawn(super::file_recovery::discard_recovery(discard_client, recovery)))?;
                    discard.await.context("Discarding recovered edits stopped")??;
                }
                let requested = params.clone();
                let task = view.update(cx, |view, _| view.executor.spawn(async move {
                    let file = client.request::<WorkspaceFileResponse>(method::WORKSPACE_FILE_READ, requested.clone()).await?;
                    let recovery = if recovery_supported { Some(client.request::<WorkspaceFileRecoverySnapshot>(method::WORKSPACE_FILE_RECOVERY_READ, requested).await?) } else { None };
                    Ok::<_, anyhow::Error>((file, recovery))
                }))?;
                Ok(Some(task.await.context("Opening the file stopped")??))
            }.await;
            let _ = view.update_in(cx, |view, window, cx| {
                if view.generation != generation || view.editor.operation != Some(operation) { return; }
                view.editor.operation = None;
                let result = result.and_then(|response| {
                    if let Some((file, recovery)) = response {
                        let content = file.content.clone();
                        let mut retained = crate::editor_recovery::EditorRecovery::default();
                        if let Some(snapshot) = recovery { retained.observe(&file, &content, snapshot)?; }
                        view.editor.accept_file(&params, file)?;
                        view.editor.recovery = retained;
                        view.editor_buffer.update(cx, |state, cx| { state.set_value(content, window, cx); state.focus(window, cx); });
                        view.editor_path.update(cx, |state, cx| state.set_value(params.path.clone(), window, cx));
                    }
                    Ok(())
                });
                if let Err(error) = result { view.editor.error = Some(format!("The file could not be opened. Your current editor text is retained. {error:#}")); }
                else { view.changed_file_recovery(cx); }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    pub(super) fn save_file(&mut self, cx: &mut Context<Self>) {
        if !self.editor.visible
            || self.editor.recovery_browser.visible
            || self.editor.operation.is_some()
            || self.editor.recovery.operation.is_some()
            || self.code_busy()
            || self.loading
        {
            return;
        }
        let text = self.editor_buffer.read(cx).value().to_string();
        if !self.editor.dirty(&text) {
            return;
        }
        let params = match self.editor.write_params(text) {
            Ok(params) => params,
            Err(error) => {
                self.editor.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.editor.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let operation = self.editor.begin();
        self.editor.saving = true;
        let generation = self.generation;
        let sent = params.clone();
        let task = self.executor.spawn(async move {
            client
                .request::<WorkspaceFileWriteResponse>(method::WORKSPACE_FILE_WRITE, sent)
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task.await.context("Saving the file stopped").and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation || view.editor.operation != Some(operation) { return; }
                view.editor.operation = None; view.editor.saving = false;
                if let Err(error) = result.and_then(|response| view.editor.accept_save(params, response)) { view.editor.error = Some(format!("Saving could not be confirmed. Your text is retained. Check the file before retrying or copy your edits before reloading. {error:#}")); }
                else { view.changed_file_recovery(cx); }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    pub(super) fn close_file(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.editor.operation.is_some()
            || self.editor.recovery.operation.is_some()
            || self.editor.file.is_none()
        {
            return;
        }
        let dirty = self
            .editor
            .dirty(self.editor_buffer.read(cx).value().as_str());
        self.file_recovery_task = None;
        let recovery = self.editor.recovery.current.clone();
        let client = self.client();
        let operation = self.editor.begin();
        let generation = self.generation;
        cx.spawn_in(window, async move |view, cx| {
            let result: Result<bool> = async {
                if !dirty { return Ok(true); }
                let prompt = cx.update(|window, cx| window.prompt(PromptLevel::Warning, "Close without saving?", Some("This discards the editor text and removes its retained recovery copy. The file on disk stays as it is. Copy the text first if you need it."), &["Keep editing", "Discard and close"], cx))?;
                if prompt.await? != 1 { return Ok(false); }
                let discard = view.update(cx, |view, _| view.executor.spawn(async move { super::file_recovery::discard_recovery(client?, recovery).await }))?;
                discard.await.context("Discarding file recovery stopped")??;
                Ok(true)
            }.await;
            let _ = view.update_in(cx, |view, window, cx| {
                if view.generation != generation || view.editor.operation != Some(operation) { return; }
                view.editor.operation = None;
                match result { Ok(true) => { view.editor.file = None; view.editor.recovery = Default::default(); view.editor_buffer.update(cx, |state, cx| state.set_value("", window, cx)); }, Ok(false) => { view.changed_file_recovery(cx); }, Err(error) => view.editor.error = Some(error.to_string()) }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    pub(super) fn render_files(
        &self,
        palette: Palette,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        if self.editor.recovery_browser.visible {
            return self.render_recovered_files(palette, window, cx);
        }
        let mut panel = div()
            .w_full()
            .min_w_0()
            .max_w(px(self.contracts.frame.content_width))
            .flex()
            .flex_col()
            .gap_3();
        if !self.editor.saving {
            panel = panel.child(self.button(
                "back-from-files",
                "Back to conversation",
                UiAction::BackFromFiles,
                palette,
                cx,
            ));
        }
        if self
            .capabilities
            .as_ref()
            .is_some_and(|caps| caps.workspace_file_recovery_browser)
        {
            panel = panel.child(self.button(
                "recovered-files",
                "Recovered edits",
                UiAction::RecoveredFiles,
                palette,
                cx,
            ));
        }
        if let Some(error) = &self.editor.error {
            panel = panel.child(
                div()
                    .text_color(rgb(palette.danger))
                    .child(gpui::text!(error.clone())),
            );
        }
        if let Some(notice) = &self.editor.notice {
            panel = panel.child(gpui::text!(notice.clone()));
        }
        if let Some(file) = &self.editor.file {
            let text = self.editor_buffer.read(cx).value();
            let dirty = self.editor.dirty(&text);
            panel = panel.child(gpui::text!(format!(
                "{}{}",
                file.path,
                if dirty { " · Unsaved" } else { "" }
            )));
            panel = panel.child(gpui::text!(format!(
                "UTF-8 text · {} / {MAX_EDITOR_TEXT_BYTES} bytes",
                text.len()
            )));
            if self.editor.operation.is_none() && self.editor.recovery.operation.is_none() {
                if dirty && !self.code_busy() && !self.loading {
                    panel = panel.child(self.button(
                        "save-file",
                        "Save file",
                        UiAction::SaveFile,
                        palette,
                        cx,
                    ));
                }
                panel = panel
                    .child(self.button(
                        "reload-file",
                        "Reload file…",
                        UiAction::ReadFile(file.path.clone()),
                        palette,
                        cx,
                    ))
                    .child(self.button(
                        "close-file",
                        "Close file…",
                        UiAction::CloseFile,
                        palette,
                        cx,
                    ));
            }
            panel = panel.child(crate::editor::source_editor(
                &self.editor_buffer,
                format!("File editor: {}", file.path),
                self.editor.operation.is_some(),
                window.bounds().size.height / 2.,
            ));
            panel = panel.child(self.render_file_recovery(file, palette, window, cx));
        }
        if self.editor.operation.is_some() {
            return panel.child(gpui::text!(if self.editor.saving {
                "Saving file…"
            } else {
                "Loading files…"
            }));
        }
        let Some(root) = &self.editor.root else {
            return panel;
        };
        panel = panel
            .child(gpui::text!(root.cwd.clone()))
            .child(
                Input::new(&self.editor_path)
                    .aria_label("Relative file path")
                    .accessibility_id("editor-path"),
            )
            .child(self.button(
                "open-file-path",
                "Open file",
                UiAction::OpenFilePath,
                palette,
                cx,
            ));
        let path = self
            .editor
            .directory
            .as_ref()
            .map(|directory| directory.path.clone())
            .unwrap_or_default();
        panel = panel.child(self.button(
            "refresh-files",
            "Refresh folder",
            UiAction::BrowseFiles(path.clone(), None),
            palette,
            cx,
        ));
        if !path.is_empty() {
            let parent = path
                .rsplit_once('/')
                .map(|(parent, _)| parent.to_owned())
                .unwrap_or_default();
            panel = panel.child(self.button(
                "parent-folder",
                "Parent folder",
                UiAction::BrowseFiles(parent, None),
                palette,
                cx,
            ));
        }
        if let Some(directory) = &self.editor.directory {
            if directory.entries.is_empty() {
                panel = panel.child(gpui::text!("No files in this page."));
            }
            if directory.omitted_names > 0 {
                panel = panel.child(gpui::text!(format!(
                    "{} filename(s) are unsupported by this file browser.",
                    directory.omitted_names
                )));
            }
            for entry in &directory.entries {
                if entry.blocked {
                    panel = panel.child(gpui::text!(
                        id = SharedString::from(format!("blocked-file:{}", entry.path)),
                        format!("{} · Blocked by host file policy", entry.name)
                    ));
                    continue;
                }
                let action = match entry.kind {
                    WorkspaceEntryKind::File => UiAction::ReadFile(entry.path.clone()),
                    WorkspaceEntryKind::Directory => {
                        UiAction::BrowseFiles(entry.path.clone(), None)
                    }
                    WorkspaceEntryKind::Unsupported => continue,
                };
                let label = format!(
                    "{}{}",
                    entry.name,
                    if entry.kind == WorkspaceEntryKind::Directory {
                        "/"
                    } else {
                        ""
                    }
                );
                panel = panel.child(self.button(
                    SharedString::from(format!("workspace-file:{}", entry.path)),
                    label,
                    action,
                    palette,
                    cx,
                ));
            }
            if let Some(after) = &directory.next_after {
                panel = panel.child(self.button(
                    "next-files",
                    "Next files",
                    UiAction::BrowseFiles(directory.path.clone(), Some(after.clone())),
                    palette,
                    cx,
                ));
            }
        }
        panel
    }
}
