use super::*;
use agiworkforce_protocol::{
    developer_session::{
        ContextInstructionsParams, ContextInstructionsResponse, DeveloperWorkspaceIdentity,
    },
    instruction_settings::*,
};

fn scope_label(scope: InstructionSettingsScope) -> &'static str {
    match scope {
        InstructionSettingsScope::User => "All coding folders in this profile",
        InstructionSettingsScope::Project => "This coding folder",
    }
}

impl Desktop {
    pub(super) fn open_code_settings(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if !self
            .capabilities
            .as_ref()
            .is_some_and(|caps| caps.settings_instructions)
        {
            return;
        }
        self.code_settings.visible = true;
        self.code_worktrees.visible = false;
        self.focus.focus(window, cx);
        self.cloud.visible = false;
        self.account.visible = false;
        self.editor.visible = false;
        self.terminal.visible = false;
        self.terminal.epoch = uuid::Uuid::new_v4();
        self.terminal_poll_task = None;
        self.changes.visible = false;
        self.models = None;
        self.history_viewport.older();
        if self.code_settings.snapshot.is_none() && self.code_settings.operation.is_none() {
            self.read_code_settings(InstructionSettingsScope::Project, window, cx);
        }
        cx.notify();
    }

    pub(super) fn read_code_settings(
        &mut self,
        scope: InstructionSettingsScope,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.code_settings.operation.is_some() {
            return;
        }
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.code_settings.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let previous = self.code_settings.snapshot.clone();
        let text = self.instruction_buffer.read(cx).value().to_string();
        let switching = previous
            .as_ref()
            .is_none_or(|snapshot| snapshot.scope != scope);
        let dirty = self.code_settings.dirty(&text);
        let previous_error = self.code_settings.error.clone();
        self.focus.focus(window, cx);
        let id = self.code_settings.begin();
        let generation = self.generation;
        cx.spawn_in(window, async move |view, cx| {
            let result: Result<Option<(InstructionSettingsReadParams, InstructionSettingsSnapshot)>> = async {
                if switching && dirty {
                    let answer = cx.update(|window, cx| window.prompt(PromptLevel::Warning, "Discard instruction edits in this window?", Some("Switching scope replaces this window's unsaved instruction text. Stored instructions stay unchanged. Copy anything you need before switching."), &["Keep editing", "Discard and switch"], cx))?;
                    if answer.await? != 1 { return Ok(None); }
                }
                let task = view.update(cx, |view, _| view.executor.spawn(async move {
                    let root: DeveloperWorkspaceIdentity = client.request(method::WORKSPACE_IDENTITY, serde_json::json!({})).await?;
                    anyhow::ensure!(!root.root_key.is_empty(), "The coding folder has no identity");
                    let params = InstructionSettingsReadParams { root_key: root.root_key, scope };
                    let response = client.request::<InstructionSettingsSnapshot>(method::SETTINGS_INSTRUCTIONS_READ, params.clone()).await?;
                    Ok::<_, anyhow::Error>((params, response))
                }))?;
                Ok(Some(task.await.context("Reading instruction settings stopped")??))
            }.await;
            let _ = view.update_in(cx, |view, window, cx| {
                if view.generation != generation || view.code_settings.operation != Some(id) { return; }
                view.code_settings.operation = None;
                let result = result.and_then(|loaded| {
                    let Some((params, snapshot)) = loaded else { view.code_settings.error = previous_error; return Ok(()); };
                    let current = view.instruction_buffer.read(cx).value().to_string();
                    let replacement = if switching {
                        anyhow::ensure!(current == text && view.code_settings.snapshot == previous, "Instruction edits changed while settings were loading. Keep your text and try again.");
                        Some(view.code_settings.replace(&params, snapshot)?)
                    } else { view.code_settings.refresh(&params, snapshot, &current)? };
                    if let Some(text) = replacement { view.instruction_buffer.update(cx, |input, cx| input.set_value(text, window, cx)); }
                    Ok(())
                });
                if let Err(error) = result { view.code_settings.error = Some(crate::code_settings::error_message(&error)); }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    pub(super) fn save_code_instructions(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.code_settings.operation.is_some() {
            return;
        }
        let text = self.instruction_buffer.read(cx).value().to_string();
        if !self.code_settings.dirty(&text) {
            return;
        }
        let params = match self.code_settings.write_params(text.clone()) {
            Ok(params) => params,
            Err(error) => {
                self.code_settings.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let Some(reviewed) = self.code_settings.snapshot.clone() else {
            return;
        };
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.code_settings.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let detail = format!("Replace the text in {:?}. Scope: {}. These instructions can be included with future coding requests. Other discovered instruction files and host limits still apply. Empty text clears this file's contents without deleting it.", reviewed.path, scope_label(reviewed.scope));
        self.focus.focus(window, cx);
        let answer = window.prompt(
            PromptLevel::Warning,
            "Save additional coding instructions?",
            Some(&detail),
            &["Keep editing", "Save instructions"],
            cx,
        );
        let id = self.code_settings.begin();
        self.code_settings.writing = true;
        let generation = self.generation;
        cx.spawn_in(window, async move |view, cx| {
            let result: Result<Option<InstructionSettingsWriteResponse>> = async {
                if answer.await? != 1 {
                    return Ok(None);
                }
                let sent = params.clone();
                let task = view.update(cx, |view, cx| {
                    anyhow::ensure!(
                        view.generation == generation
                            && view.code_settings.operation == Some(id)
                            && view.code_settings.snapshot.as_ref() == Some(&reviewed)
                            && view.instruction_buffer.read(cx).value().as_str() == text,
                        "Instructions changed during confirmation. Review the current text again."
                    );
                    Ok::<_, anyhow::Error>(view.executor.spawn(async move {
                        client
                            .request::<InstructionSettingsWriteResponse>(
                                method::SETTINGS_INSTRUCTIONS_WRITE,
                                sent,
                            )
                            .await
                    }))
                })??;
                Ok(Some(task.await.context("Saving instructions stopped")??))
            }
            .await;
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation || view.code_settings.operation != Some(id) {
                    return;
                }
                view.code_settings.operation = None;
                view.code_settings.writing = false;
                view.code_settings.notice = None;
                if let Err(error) = result.and_then(|response| {
                    response.map_or(Ok(()), |response| {
                        view.code_settings.finish(&params, response)
                    })
                }) {
                    view.code_settings.error = Some(crate::code_settings::error_message(&error));
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn use_stored_code_instructions(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.code_settings.operation.is_some() {
            return;
        }
        let Some(reviewed) = self.code_settings.conflict.clone() else {
            return;
        };
        let text = self.instruction_buffer.read(cx).value().to_string();
        let answer = window.prompt(PromptLevel::Warning, "Use the stored instruction text?", Some("This replaces the instruction edits in this window. Stored instructions stay unchanged. Copy your edits first if you need them."), &["Keep editing", "Use stored text"], cx);
        let id = self.code_settings.begin();
        let generation = self.generation;
        cx.spawn_in(window, async move |view, cx| {
            let answer = answer.await;
            let _ = view.update_in(cx, |view, window, cx| {
                if view.generation != generation || view.code_settings.operation != Some(id) {
                    return;
                }
                view.code_settings.operation = None;
                if !matches!(answer, Ok(1)) {
                    cx.notify();
                    return;
                }
                if view.code_settings.conflict.as_ref() != Some(&reviewed)
                    || view.instruction_buffer.read(cx).value().as_str() != text
                {
                    view.code_settings.error = Some(
                        "Instruction edits changed during confirmation. Review them again.".into(),
                    );
                    cx.notify();
                    return;
                }
                let params = InstructionSettingsReadParams {
                    root_key: reviewed.root_key.clone(),
                    scope: reviewed.scope,
                };
                match view.code_settings.replace(&params, reviewed) {
                    Ok(text) => view
                        .instruction_buffer
                        .update(cx, |input, cx| input.set_value(text, window, cx)),
                    Err(error) => view.code_settings.error = Some(error.to_string()),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn load_code_instruction_sources(&mut self, cx: &mut Context<Self>) {
        if self.code_settings.operation.is_some() {
            return;
        }
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.code_settings.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let previous_error = self.code_settings.error.clone();
        let id = self.code_settings.begin();
        self.code_settings.error = previous_error;
        let generation = self.generation;
        let task = self.executor.spawn(async move {
            client
                .request::<ContextInstructionsResponse>(
                    method::CONTEXT_INSTRUCTIONS,
                    ContextInstructionsParams { cwd: None },
                )
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Reading instruction sources stopped")
                .and_then(|response| response.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation || view.code_settings.operation != Some(id) {
                    return;
                }
                view.code_settings.operation = None;
                match result {
                    Ok(sources) => view.code_settings.sources = Some(sources),
                    Err(error) => {
                        view.code_settings.notice =
                            Some(crate::code_settings::error_message(&error))
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn render_code_settings(
        &self,
        palette: Palette,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        let state = &self.code_settings;
        let mut panel = div()
            .w_full()
            .min_w_0()
            .max_w(px(self.contracts.frame.content_width))
            .flex()
            .flex_col()
            .gap_3();
        panel = panel.child(gpui::text!("Code settings"));
        if state.operation.is_none() {
            panel = panel
                .child(self.button(
                    "close-code-settings",
                    "Back to conversation",
                    UiAction::CloseCodeSettings,
                    palette,
                    cx,
                ))
                .child(self.button(
                    "profile-instruction-scope",
                    scope_label(InstructionSettingsScope::User),
                    UiAction::InstructionScope(InstructionSettingsScope::User),
                    palette,
                    cx,
                ))
                .child(self.button(
                    "project-instruction-scope",
                    scope_label(InstructionSettingsScope::Project),
                    UiAction::InstructionScope(InstructionSettingsScope::Project),
                    palette,
                    cx,
                ));
        }
        if let Some(error) = &state.error {
            panel = panel.child(gpui::text!(error.clone()));
        }
        if let Some(notice) = &state.notice {
            panel = panel.child(gpui::text!(notice.clone()));
        }
        if state.operation.is_some() {
            panel = panel.child(gpui::text!(if state.writing {
                "Waiting for instruction save…"
            } else {
                "Reading instruction settings…"
            }));
        }
        let Some(snapshot) = &state.snapshot else {
            return panel;
        };
        panel = panel.child(gpui::text!(scope_label(snapshot.scope)))
            .child(gpui::text!(snapshot.path.clone()))
            .child(gpui::text!("Additional instructions are stored on this device and can be included with future coding requests. Other discovered instruction files and host limits still apply."));
        let text = self.instruction_buffer.read(cx).value();
        panel = panel
            .child(gpui::text!(format!(
                "{} / {MAX_INSTRUCTION_EDIT_BYTES} UTF-8 bytes{}",
                text.len(),
                if state.dirty(&text) {
                    " · Unsaved"
                } else {
                    ""
                }
            )))
            .child(crate::editor::source_editor(
                &self.instruction_buffer,
                "Additional coding instructions",
                state.operation.is_some(),
                window.bounds().size.height / 3.,
            ));
        if let Some(conflict) = &state.conflict {
            panel = panel.child(gpui::text!(
                "Stored instructions changed. Your edits are retained in this window."
            ));
            let stored = window.use_keyed_state("code-settings-stored-text", cx, |window, cx| {
                EditorState::new(window, cx)
            });
            if stored.read(cx).value().as_str() != conflict.text {
                stored.update(cx, |input, cx| {
                    input.set_value(conflict.text.clone(), window, cx)
                });
            }
            panel = panel.child(crate::editor::source_editor(
                &stored,
                "Stored coding instructions",
                true,
                window.bounds().size.height / 3.,
            ));
            if state.operation.is_none() {
                panel = panel
                    .child(self.button(
                        "use-stored-code-instructions",
                        "Use stored text…",
                        UiAction::UseStoredCodeInstructions,
                        palette,
                        cx,
                    ))
                    .child(self.button(
                        "keep-code-instruction-edits",
                        "Keep my edits",
                        UiAction::KeepCodeInstructionEdits,
                        palette,
                        cx,
                    ));
            }
        }
        if state.operation.is_none() {
            panel = panel.child(self.button(
                "reload-code-settings",
                "Reload stored instructions",
                UiAction::ReloadCodeSettings,
                palette,
                cx,
            ));
            if state.dirty(&text) && state.conflict.is_none() && state.error.is_none() {
                panel = panel.child(self.button(
                    "save-code-instructions",
                    "Save instructions…",
                    UiAction::SaveCodeInstructions,
                    palette,
                    cx,
                ));
            }
            panel = panel.child(self.button(
                "code-instruction-sources",
                "Review discovered instruction sources",
                UiAction::CodeInstructionSources,
                palette,
                cx,
            ));
        }
        panel = panel.child(gpui::text!(
            "Configured defaults · read-only here. Active sessions keep their current selections."
        ));
        if let Some(model) = &snapshot.profile.default_model {
            panel = panel.child(gpui::text!(format!("Model: {model}")));
        }
        if let Some(effort) = snapshot.profile.default_effort {
            panel = panel.child(gpui::text!(format!("Effort: {}", effort.as_str())));
        }
        if let Some(mode) = snapshot.profile.permission_mode {
            panel = panel.child(gpui::text!(format!("Permissions: {}", mode.wire_name())));
        }
        if let Some(sources) = &state.sources {
            if sources.truncated {
                panel = panel.child(gpui::text!(
                    "The host's instruction budget excluded some discovered sources."
                ));
            }
            if sources.files.is_empty() {
                panel = panel.child(gpui::text!(
                    "No instruction files were reported for this coding folder."
                ));
            }
            for file in &sources.files {
                panel = panel.child(gpui::text!(
                    id = SharedString::from(format!("code-instruction-source:{}", file.path)),
                    format!("{} · {} bytes", file.path, file.bytes)
                ));
            }
        }
        panel
    }
}
