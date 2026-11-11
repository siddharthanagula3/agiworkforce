use super::*;
use agiworkforce_protocol::account_cloud::{
    CloudRunAttachParams, CloudRunAttachResponse, CloudRunListParams, CloudRunListResponse,
};
use agiworkforce_protocol::task_state::AgentTaskState;

fn state_label(state: AgentTaskState) -> String {
    serde_json::to_value(state)
        .ok()
        .and_then(|value| value.as_str().map(|text| text.replace('_', " ")))
        .unwrap_or_else(|| "Status unavailable".into())
}

impl Desktop {
    pub(super) fn open_work(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.save_draft(cx);
        self.account.visible = false;
        self.cloud.visible = true;
        self.cloud.projects.visible = false;
        self.cloud.projects.active_id = None;
        self.cloud.work_visible = true;
        self.focus.focus(window, cx);
        if self.cloud.work_selected.is_none() {
            self.load_work(false, cx);
        }
        cx.notify();
    }

    pub(super) fn load_work(&mut self, more: bool, cx: &mut Context<Self>) {
        if self.cloud.work_loading || self.cloud.resuming || self.cloud.submitting {
            return;
        }
        if !self.require_cloud_workspace(cx) {
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
        let params = CloudRunListParams {
            workspace: self.cloud.workspaces.selector().cloned(),
            scope: self.cloud.scope.clone(),
            limit: self.settings.session_page_size,
            cursor: if more {
                self.cloud.work_next_cursor.clone()
            } else {
                None
            },
            states: self.cloud.work_states.clone(),
        };
        self.cloud.work_loading = true;
        self.cloud.error = None;
        let generation = self.cloud.generation;
        let task = self.executor.spawn(async move {
            client
                .request::<CloudRunListResponse>(method::CLOUD_RUN_LIST, params)
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Loading Work stopped")
                .and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.cloud.generation != generation {
                    return;
                }
                view.cloud.work_loading = false;
                match result {
                    Ok(page) => {
                        if let Err(error) = view.cloud.accept_runs(page, more) {
                            view.cloud.error = Some(error.to_string());
                        }
                    }
                    Err(error) => {
                        view.cloud.error = Some(format!("Work could not be loaded: {error:#}"))
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn attach_work(&mut self, id: String, window: &mut Window, cx: &mut Context<Self>) {
        if self.cloud.has_unconfirmed_turn() {
            self.cloud.error = Some("Check the unconfirmed message status or its saved conversation before leaving it or starting another conversation.".into());
            cx.notify();
            return;
        }
        if self.cloud.work_loading || self.cloud.resuming || self.cloud.submitting {
            return;
        }
        if self.has_unsaved_cloud_draft(cx) {
            self.cloud.error = Some(
                "Save or resolve this draft before opening a Work run. You can also copy and clear it.".into(),
            );
            cx.notify();
            return;
        }
        let Some(scope) = self.cloud.scope.clone() else {
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
        let params = CloudRunAttachParams {
            workspace: self.cloud.workspaces.selector().cloned(),
            scope,
            run_id: id.clone(),
            page_size: self.settings.session_page_size,
        };
        let generation = self.cloud.generation;
        self.cloud.work_loading = true;
        self.cloud.error = None;
        let task = self.executor.spawn(async move {
            client
                .request::<CloudRunAttachResponse>(method::CLOUD_RUN_ATTACH, params)
                .await
        });
        cx.spawn_in(window, async move |view, cx| {
            let result = task
                .await
                .context("Opening the Work run stopped")
                .and_then(|result| result.map_err(Into::into));
            let _ = view.update_in(cx, |view, window, cx| {
                if view.cloud.generation != generation {
                    return;
                }
                view.cloud.work_loading = false;
                match result {
                    Ok(response)
                        if response.run.id == id
                            && view.cloud.scope.as_ref() == Some(&response.turn.scope) =>
                    {
                        view.cloud_poll_task = None;
                        view.cloud.clear_turn();
                        view.cloud.work_selected = Some(response.run);
                        view.history_viewport.latest();
                        match view.cloud.accept_turn(response.turn) {
                            Ok(_) => view.poll_cloud(window, cx),
                            Err(error) => view.cloud.error = Some(error.to_string()),
                        }
                    }
                    Ok(_) => {
                        view.cloud.error = Some(
                            "The returned run changed identity or account scope. Refresh Work."
                                .into(),
                        )
                    }
                    Err(error) => {
                        view.cloud.error =
                            Some(format!("This Work run could not be opened: {error:#}"))
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn leave_work(
        &mut self,
        destination: super::frame::WorkDestination,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.cloud.work_loading || self.cloud.resuming || self.cloud.stopping {
            return;
        }
        let Some(params) = self.cloud.turn_id() else {
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
        self.cloud.work_loading = true;
        let generation = self.cloud.generation;
        let task = self.executor.spawn(async move {
            client
                .request::<serde_json::Value>(method::CLOUD_TURN_DETACH, params)
                .await
        });
        cx.spawn_in(window, async move |view, cx| {
            let result = task
                .await
                .context("Leaving the Work view stopped")
                .and_then(|result| result.map_err(Into::into));
            let _ = view.update_in(cx, |view, window, cx| {
                if view.cloud.generation != generation {
                    return;
                }
                view.cloud.work_loading = false;
                match result {
                    Ok(_) => {
                        view.cloud_poll_task = None;
                        view.cloud.clear_turn();
                        view.cloud.work_selected = None;
                        view.cloud.error = None;
                        match destination {
                            super::frame::WorkDestination::Projects => {
                                view.open_projects(window, cx)
                            }
                            super::frame::WorkDestination::Chat => view.open_cloud(window, cx),
                            super::frame::WorkDestination::List => view.load_work(false, cx),
                            super::frame::WorkDestination::Code => view.open_code(window, cx),
                        }
                    }
                    Err(error) => {
                        view.cloud.error = Some(format!("This run is still attached: {error:#}"))
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn render_work(
        &self,
        window: &mut Window,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        let mut panel = div()
            .w_full()
            .max_w(px(self.contracts.frame.content_width))
            .min_w_0()
            .flex()
            .flex_col()
            .gap_4()
            .child(
                div()
                    .text_color(rgb(palette.secondary))
                    .child(gpui::text!(self.contracts.cloud_trust_label.clone())),
            );
        if let Some(error) = &self.cloud.error {
            panel = panel.child(
                div()
                    .text_color(rgb(palette.danger))
                    .child(gpui::text!(error.clone())),
            );
        }
        if self.cloud.work_loading {
            panel = panel.child(gpui::text!("Loading Work…"));
        }
        if let Some(run) = &self.cloud.work_selected {
            if let Some(turn) = &self.cloud.turn {
                panel = panel
                    .child(gpui::text!(state_label(turn.state)))
                    .child(rich_text::markdown(
                        SharedString::from(format!("work:{}:{}", turn.scope, run.id)),
                        turn.output.clone(),
                        &self.contracts,
                        window,
                        cx,
                    ))
                    .child(self.render_cloud_controls(turn, palette, cx));
                if (!turn.state.is_terminal() && !turn.state.needs_review() || turn.stream_attached)
                    && !self.cloud.stopping
                    && !self.cloud.resuming
                    && !self.cloud.work_loading
                {
                    panel = panel.child(self.button(
                        "stop-work-run",
                        "Stop",
                        UiAction::StopCloud(
                            agiworkforce_protocol::account_cloud::CloudTurnIdParams {
                                workspace: self.cloud.workspaces.selector().cloned(),
                                scope: turn.scope.clone(),
                                request_id: turn.request_id.clone(),
                                run_id: turn.run_id.clone(),
                            },
                        ),
                        palette,
                        cx,
                    ));
                }
                panel = panel.child(gpui::text!(if turn.stream_attached {
                    "Keep this window open while the attached continuation runs."
                } else {
                    "Leaving this view does not stop the run."
                }));
            }
            if !self.cloud.work_loading {
                panel = panel.child(self.button(
                    "back-work",
                    "Back to Work",
                    UiAction::LeaveWork,
                    palette,
                    cx,
                ));
            }
        } else {
            if !self.cloud.work_loading {
                if !self.cloud.navigation_busy()
                    && self
                        .account_capabilities
                        .as_ref()
                        .is_some_and(|caps| caps.cloud_work_start)
                {
                    panel = panel.child(self.button(
                        "new-work",
                        format!("New {}", self.contracts.work_name),
                        UiAction::NewWork,
                        palette,
                        cx,
                    ));
                }
                panel = panel.child(self.button(
                    "refresh-work",
                    "Refresh",
                    UiAction::Work,
                    palette,
                    cx,
                ));
                let mut filters = div().flex().flex_wrap().gap_2();
                for (id, label, state) in [
                    ("active-work", "In progress", None),
                    (
                        "completed-work",
                        "Completed",
                        Some(AgentTaskState::Completed),
                    ),
                    ("failed-work", "Failed", Some(AgentTaskState::Failed)),
                    (
                        "cancelled-work",
                        "Cancelled",
                        Some(AgentTaskState::Cancelled),
                    ),
                ] {
                    filters = filters.child(self.button(
                        id,
                        label,
                        UiAction::FilterWork(state),
                        palette,
                        cx,
                    ));
                }
                panel = panel.child(filters).child(gpui::text!(format!(
                    "Viewing: {}",
                    self.cloud
                        .work_states
                        .first()
                        .map_or_else(|| "in progress".to_owned(), |state| state_label(*state))
                )));
            }
            if self.cloud.work_windowed {
                panel = panel.child(gpui::text!(
                    "Showing a window of loaded Work. Refresh to return to the first page."
                ));
            }
            for run in &self.cloud.work_runs {
                panel = panel.child(
                    div()
                        .id(SharedString::from(format!("work-run-row:{}", run.id)))
                        .w_full()
                        .min_w_0()
                        .flex()
                        .flex_col()
                        .gap_2()
                        .child(
                            self.button(
                                SharedString::from(format!("work-run:{}", run.id)),
                                run.conversation_title
                                    .clone()
                                    .unwrap_or_else(|| "Untitled work".into()),
                                UiAction::OpenWork(run.id.clone()),
                                palette,
                                cx,
                            ),
                        )
                        .children(
                            run.conversation_preview
                                .clone()
                                .map(|preview| gpui::text!(preview)),
                        )
                        .child(div().text_color(rgb(palette.secondary)).child(gpui::text!(
                            format!(
                                "{} · {}",
                                state_label(run.effective_state()),
                                run.origin_surface
                            )
                        ))),
                );
            }
            if self.cloud.work_loaded
                && self.cloud.work_runs.is_empty()
                && self.cloud.error.is_none()
                && !self.cloud.work_loading
                && !self.cloud.work_windowed
            {
                panel = panel.child(gpui::text!(
                    "No Work runs match this filter. Work started in your account appears here."
                ));
            }
            if self.cloud.work_next_cursor.is_some() && !self.cloud.work_loading {
                panel = panel.child(self.button(
                    "more-work",
                    "Load more",
                    UiAction::MoreWork,
                    palette,
                    cx,
                ));
            }
        }
        panel
    }
}
