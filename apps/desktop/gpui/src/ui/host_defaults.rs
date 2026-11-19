use super::*;
use crate::host_defaults::{accept_write, admit_models, remembered, write_params, DefaultChange};
use agiworkforce_protocol::developer_session::{
    DeveloperAgentMode, DeveloperReasoningEffort, DeveloperSessionTrustMode,
    LocalModelListResponse, ModelListParams, SettingsReadResponse,
};

fn mode_label(mode: DeveloperAgentMode) -> &'static str {
    match mode {
        DeveloperAgentMode::Plan => "Plan",
        DeveloperAgentMode::Ask => "Ask",
        DeveloperAgentMode::Auto => "Auto",
        DeveloperAgentMode::Bypass => "Bypass",
    }
}

fn effort_label(effort: DeveloperReasoningEffort) -> &'static str {
    effort.as_str()
}

impl Desktop {
    pub(super) fn open_host_defaults(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if !self.capabilities.as_ref().is_some_and(|caps| caps.settings) {
            return;
        }
        self.host_defaults.visible = true;
        self.code_settings.visible = false;
        self.mcp.visible = false;
        self.code_worktrees.visible = false;
        self.editor.visible = false;
        self.terminal.visible = false;
        self.terminal.epoch = uuid::Uuid::new_v4();
        self.terminal_poll_task = None;
        self.changes.visible = false;
        self.models = None;
        self.cloud.visible = false;
        self.account.visible = false;
        self.focus.focus(window, cx);
        if self.host_defaults.snapshot.is_none() && self.host_defaults.operation.is_none() {
            self.read_host_defaults(false, cx);
        }
        cx.notify();
    }

    pub(super) fn read_host_defaults(&mut self, refresh: bool, cx: &mut Context<Self>) {
        if self.host_defaults.operation.is_some() {
            return;
        }
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.host_defaults.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let operation = self.host_defaults.begin(false);
        let generation = self.generation;
        let task = self.executor.spawn(async move {
            let settings = client
                .request::<SettingsReadResponse>(method::SETTINGS_READ, serde_json::json!({}))
                .await?;
            let models = client
                .request::<LocalModelListResponse>(method::MODEL_LIST, ModelListParams { refresh })
                .await?;
            Ok::<_, anyhow::Error>((settings, models))
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Reading session defaults stopped")
                .and_then(|result| result);
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation || view.host_defaults.operation != Some(operation)
                {
                    return;
                }
                view.host_defaults.operation = None;
                view.host_defaults.writing = false;
                match result {
                    Ok((settings, models)) => {
                        if settings.config_path.is_empty() {
                            view.host_defaults.error =
                                Some("The coding runtime returned no configuration path.".into());
                        } else {
                            view.host_defaults.snapshot = Some(remembered(settings));
                            view.host_defaults.models = admit_models(models);
                            view.host_defaults.error = None;
                        }
                    }
                    Err(error) => {
                        view.host_defaults.error = Some(crate::host_defaults::error_message(&error))
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn save_host_default(
        &mut self,
        change: DefaultChange,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.host_defaults.operation.is_some() {
            return;
        }
        let Some(current) = self.host_defaults.snapshot.clone() else {
            return;
        };
        if let DefaultChange::Mode {
            mode: DeveloperAgentMode::Auto,
            confirmed: false,
        } = &change
        {
            let operation = self.host_defaults.begin(false);
            let generation = self.generation;
            let next = DefaultChange::Mode {
                mode: DeveloperAgentMode::Auto,
                confirmed: true,
            };
            cx.spawn_in(window, async move |view, cx| {
                let result: Result<bool> = async {
                    let prompt = cx.update(|window, cx| {
                        window.prompt(
                            PromptLevel::Warning,
                            "Allow new coding sessions to edit without asking?",
                            Some("New coding sessions will apply edits without asking first. You can still stop a session. This does not change Cloud conversations or the session that is open."),
                            &["Keep asking", "Allow edits without asking"],
                            cx,
                        )
                    })?;
                    Ok(prompt.await? == 1)
                }
                .await;
                let _ = view.update_in(cx, |view, window, cx| {
                    if view.generation != generation || view.host_defaults.operation != Some(operation)
                    {
                        return;
                    }
                    view.host_defaults.operation = None;
                    view.host_defaults.writing = false;
                    match result {
                        Ok(true) => view.save_host_default(next, window, cx),
                        Ok(false) => cx.notify(),
                        Err(error) => {
                            view.host_defaults.error = Some(error.to_string());
                            cx.notify();
                        }
                    }
                });
            })
            .detach();
            cx.notify();
            return;
        }
        let admitted = self.host_defaults.models.clone();
        let request = match write_params(&current, &change, &admitted) {
            Ok(request) => request,
            Err(error) => {
                self.host_defaults.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.host_defaults.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let operation = self.host_defaults.begin(true);
        let generation = self.generation;
        let task = self.executor.spawn(async move {
            let response = client
                .request::<SettingsReadResponse>(method::SETTINGS_WRITE, request.clone())
                .await?;
            accept_write(&request, &response)?;
            Ok::<_, anyhow::Error>(response)
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Saving the session default stopped")
                .and_then(|result| result);
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation || view.host_defaults.operation != Some(operation)
                {
                    return;
                }
                view.host_defaults.operation = None;
                view.host_defaults.writing = false;
                match result {
                    Ok(response) => {
                        view.host_defaults.snapshot = Some(remembered(response));
                        view.host_defaults.error = None;
                        view.host_defaults.notice =
                            Some("Saved for new coding sessions on this machine.".into());
                    }
                    Err(error) => {
                        view.host_defaults.error = Some(crate::host_defaults::error_message(&error))
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn render_host_defaults(
        &self,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        let state = &self.host_defaults;
        let mut panel = div()
            .w_full()
            .min_w_0()
            .max_w(px(self.contracts.frame.content_width))
            .flex()
            .flex_col()
            .gap_3()
            .child(gpui::text!("New session defaults"))
            .child(gpui::text!(
                "These defaults apply to new coding sessions on this machine. They do not change Cloud conversations or the session that is open."
            ));
        if state.operation.is_none() {
            panel = panel
                .child(self.button(
                    "close-host-defaults",
                    "Back to conversation",
                    UiAction::CloseHostDefaults,
                    palette,
                    cx,
                ))
                .child(self.button(
                    "reload-host-defaults",
                    "Refresh",
                    UiAction::ReloadHostDefaults,
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
                "Saving the default…"
            } else {
                "Reading session defaults…"
            }));
        }
        let Some(snapshot) = &state.snapshot else {
            return panel;
        };
        panel = panel.child(gpui::text!(format!(
            "Configuration: {}",
            snapshot.config_path
        )));
        panel = panel.child(gpui::text!(format!(
            "Current model: {}",
            snapshot
                .default_model
                .clone()
                .unwrap_or_else(|| "Not set".into())
        )));
        panel = panel.child(gpui::text!(format!(
            "Current effort: {}",
            snapshot
                .default_effort
                .map(effort_label)
                .unwrap_or("Not set")
        )));
        panel = panel.child(gpui::text!(format!(
            "Current permission: {}",
            snapshot
                .permission_mode
                .map(mode_label)
                .unwrap_or("Not set")
        )));
        if snapshot
            .default_model
            .as_ref()
            .is_some_and(|model| !state.models.iter().any(|item| &item.id == model))
        {
            panel = panel.child(gpui::text!(
                "The saved default is not in the models this host listed. Choose another model or refresh."
            ));
        }
        for model in &state.models {
            if model.trust_mode == DeveloperSessionTrustMode::Unknown {
                panel = panel.child(gpui::text!(format!(
                    "{} · {} · No confirmed privacy boundary",
                    model.id, model.provider
                )));
                continue;
            }
            let label = format!(
                "{} · {} · {}{}",
                model.id,
                model.provider,
                self.contracts.trust_labels.label(model.trust_mode),
                if model.reachable {
                    ""
                } else {
                    " · Not reachable right now"
                }
            );
            panel = panel.child(self.button(
                SharedString::from(format!("default-model:{}:{}", model.provider, model.id)),
                label,
                UiAction::SaveHostDefault(DefaultChange::Model {
                    id: model.id.clone(),
                    provider: model.provider.clone(),
                }),
                palette,
                cx,
            ));
        }
        if state.models.is_empty() {
            panel = panel.child(gpui::text!(
                "No models are listed. Refresh, or configure a provider key or local server in the command-line client."
            ));
        }
        for effort in DeveloperReasoningEffort::ALL {
            if snapshot.default_effort == Some(effort) {
                continue;
            }
            panel = panel.child(self.button(
                SharedString::from(format!("default-effort:{}", effort.as_str())),
                format!("Effort: {}", effort.as_str()),
                UiAction::SaveHostDefault(DefaultChange::Effort(effort)),
                palette,
                cx,
            ));
        }
        for mode in [
            DeveloperAgentMode::Plan,
            DeveloperAgentMode::Ask,
            DeveloperAgentMode::Auto,
        ] {
            if snapshot.permission_mode == Some(mode) {
                continue;
            }
            panel = panel.child(self.button(
                SharedString::from(format!("default-mode:{}", mode.wire_name())),
                format!("Permission: {}", mode_label(mode)),
                UiAction::SaveHostDefault(DefaultChange::Mode {
                    mode,
                    confirmed: false,
                }),
                palette,
                cx,
            ));
        }
        panel
    }
}
