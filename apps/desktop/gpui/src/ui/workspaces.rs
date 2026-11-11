use super::*;
use crate::workspace_select::{self, WorkspaceSelectState};
use agiworkforce_protocol::account_cloud::*;
use gpui_component::select::SelectEvent;

pub(super) struct BoundWorkspaceSelect {
    revision: uuid::Uuid,
    state: gpui::Entity<WorkspaceSelectState>,
    _subscription: gpui::Subscription,
    width: f32,
}

impl Desktop {
    fn can_change_cloud_workspace(&self, cx: &App) -> bool {
        !self.cloud.loading
            && !self.cloud.navigation_busy()
            && !self.attachment_recovery.busy()
            && self.cloud.pending_turn.is_none()
            && self.cloud.management.editing.is_none()
            && self.cloud.projects.edit.is_none()
            && self.cloud.work_selected.is_none()
            && !self.has_unsaved_cloud_draft(cx)
    }

    pub(super) fn require_cloud_workspace(&mut self, cx: &mut Context<Self>) -> bool {
        if self.cloud.workspaces.selector().is_some() {
            return true;
        }
        if self.cloud.workspaces.operation.is_none() && !self.cloud.workspaces.initialized {
            self.load_cloud_workspaces(cx);
        }
        false
    }

    fn finish_cloud_workspace_change(&mut self, changed: bool) {
        self.cloud.scope = self.cloud.workspaces.scope.clone();
        let show_work = self.cloud.work_visible;
        let show_projects = self.cloud.projects.visible;
        if changed {
            self.cloud.reset_view();
            self.cloud.work_visible = show_work;
            self.cloud.projects.visible = show_projects;
        }
        if self.cloud.workspaces.selector().is_some()
            && (changed
                || if show_projects {
                    !self.cloud.projects.loaded
                } else if show_work {
                    !self.cloud.work_loaded
                } else {
                    !self.cloud.loaded
                })
        {
            self.cloud.workspaces.pending_load = true;
        }
    }

    pub(super) fn pump_cloud_workspace(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if !self.cloud.visible
            || self.account.visible
            || self.cloud.reset_query
            || self.cloud.navigation_busy()
            || self.cloud.loading
            || self.cloud.workspaces.selector().is_none()
        {
            return;
        }
        if let Some(work) = self.cloud.workspaces.pending_new.take() {
            self.cloud.workspaces.pending_load = false;
            self.new_cloud(work, window, cx);
        } else if std::mem::take(&mut self.cloud.workspaces.pending_load) {
            if self.cloud.projects.visible {
                self.load_projects(false, cx);
            } else if self.cloud.work_visible {
                self.load_work(false, cx);
            } else {
                self.load_cloud(false, cx);
            }
        }
    }

    pub(super) fn load_cloud_workspaces(&mut self, cx: &mut Context<Self>) {
        if !self.can_change_cloud_workspace(cx) {
            self.cloud.workspaces.error = Some("Finish the current Cloud operation and save or resolve its draft before changing workspaces.".into());
            cx.notify();
            return;
        }
        if !self
            .account
            .status
            .as_ref()
            .is_some_and(|status| status.signed_in)
        {
            self.cloud.workspaces.error =
                Some("Sign in from Account to load your workspaces.".into());
            cx.notify();
            return;
        }
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.cloud.workspaces.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let params = CloudWorkspacesListParams {
            scope: self.cloud.scope.clone(),
        };
        let operation = uuid::Uuid::new_v4();
        let generation = self.cloud.generation;
        self.cloud.workspaces.operation = Some(operation);
        self.cloud.workspaces.error = None;
        let task = self.executor.spawn(async move {
            client
                .request::<CloudWorkspacesListResponse>(method::CLOUD_WORKSPACES_LIST, params)
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Loading workspaces stopped")
                .and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.cloud.generation != generation
                    || view.cloud.workspaces.operation != Some(operation)
                {
                    return;
                }
                view.cloud.workspaces.operation = None;
                match result.and_then(|response| view.cloud.workspaces.accept_list(response)) {
                    Ok(changed) => view.finish_cloud_workspace_change(changed),
                    Err(_) => {
                        view.cloud.workspaces.error = Some("Workspaces could not be loaded. Check your account connection, then reload workspaces.".into())
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    fn select_cloud_workspace(&mut self, revision: uuid::Uuid, id: String, cx: &mut Context<Self>) {
        if self.cloud.workspaces.uncertain
            || revision != self.cloud.workspaces.revision
            || !self.can_change_cloud_workspace(cx)
        {
            cx.notify();
            return;
        }
        if self
            .cloud
            .workspaces
            .selected
            .as_ref()
            .is_some_and(|selected| selected.id == id)
            && !self.cloud.workspaces.uncertain
        {
            return;
        }
        if !self
            .cloud
            .workspaces
            .choices
            .iter()
            .any(|choice| choice.id == id)
        {
            return;
        }
        let Some(scope) = self.cloud.workspaces.scope.clone() else {
            return;
        };
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.cloud.workspaces.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let params = CloudWorkspaceSelectParams {
            scope,
            id: id.clone(),
        };
        let operation = uuid::Uuid::new_v4();
        let generation = self.cloud.generation;
        self.cloud.workspaces.operation = Some(operation);
        self.cloud.workspaces.requested = Some(id);
        self.cloud.workspaces.error = None;
        let task = self.executor.spawn(async move {
            client
                .request::<CloudWorkspaceSelectResponse>(method::CLOUD_WORKSPACE_SELECT, params)
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task.await.context("Switching workspaces stopped").and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.cloud.generation != generation || view.cloud.workspaces.operation != Some(operation) { return; }
                view.cloud.workspaces.operation = None;
                match result.and_then(|response| view.cloud.workspaces.accept_selection(response)) {
                    Ok(()) => view.finish_cloud_workspace_change(true),
                    Err(_) => { view.cloud.workspaces.uncertain = true; view.cloud.workspaces.error = Some("The workspace switch was not confirmed. Reload workspaces before continuing.".into()); }
                }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    pub(super) fn sync_cloud_workspace_select(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if !self.cloud.visible
            || !self.cloud.workspaces.initialized
            || self.cloud.workspaces.choices.is_empty()
        {
            self.cloud_workspace_select = None;
            return;
        }
        let expected = self
            .cloud
            .workspaces
            .selected
            .as_ref()
            .map(|selected| selected.id.clone());
        if self
            .cloud_workspace_select
            .as_ref()
            .is_none_or(|control| control.revision != self.cloud.workspaces.revision)
        {
            let state = cx.new(|cx| {
                workspace_select::state(
                    &self.cloud.workspaces.choices,
                    expected.as_deref(),
                    self.contracts.clone(),
                    window,
                    cx,
                )
            });
            let revision = self.cloud.workspaces.revision;
            let generation = self.cloud.generation;
            let subscription = cx.subscribe_in(
                &state,
                window,
                move |view: &mut Desktop, _, event: &SelectEvent<_>, _, cx| {
                    if view.cloud.generation != generation {
                        return;
                    }
                    if let SelectEvent::Confirm(Some(id)) = event {
                        view.select_cloud_workspace(revision, id.clone(), cx);
                    }
                },
            );
            self.cloud_workspace_select = Some(BoundWorkspaceSelect {
                revision,
                state,
                _subscription: subscription,
                width: window.bounds().size.width.into(),
            });
        } else if let Some(control) = &mut self.cloud_workspace_select {
            control.width = window.bounds().size.width.into();
            if control.state.read(cx).selected_value() != expected.as_ref() {
                control.state.update(cx, |state, cx| {
                    if let Some(expected) = &expected {
                        state.set_selected_value(expected, window, cx);
                    } else {
                        state.set_selected_index(None, window, cx);
                    }
                });
            }
        }
    }

    pub(super) fn render_cloud_workspaces(
        &self,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        let mut panel = div().w_full().min_w_0().flex().flex_col().gap_2();
        let allowed = self.can_change_cloud_workspace(cx);
        if let Some(control) = &self.cloud_workspace_select {
            panel = panel.child(workspace_select::control(
                &control.state,
                &self.contracts,
                control.width,
                !allowed
                    || self.cloud.workspaces.operation.is_some()
                    || self.cloud.workspaces.uncertain,
            ));
        }
        if self.cloud.workspaces.operation.is_some() {
            panel = panel.child(gpui::text!(if self.cloud.workspaces.requested.is_some() {
                "Switching workspace…"
            } else {
                "Loading workspaces…"
            }));
        }
        if let Some(selected) = &self.cloud.workspaces.selected {
            panel = panel.child(
                div()
                    .min_w_0()
                    .truncate()
                    .text_color(rgb(palette.secondary))
                    .child(workspace_select::guidance(selected)),
            );
        }
        if let Some(error) = &self.cloud.workspaces.error {
            panel = panel.child(gpui::text!(error.clone()));
        }
        if allowed {
            panel = panel.child(self.button(
                "reload-cloud-workspaces",
                "Reload workspaces",
                UiAction::ReloadCloudWorkspaces,
                palette,
                cx,
            ));
        } else if !self.cloud_composer.read(cx).value().is_empty() {
            panel = panel.child(gpui::text!(
                "Save or resolve this draft before switching workspaces."
            ));
        } else if self.cloud.work_selected.is_some() {
            panel = panel.child(gpui::text!(
                "Return to the Work list before switching workspaces."
            ));
        }
        panel
    }
}
