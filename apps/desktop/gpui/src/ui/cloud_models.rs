use super::*;
use crate::cloud_model_select::{self, ModelSelectState};
use gpui_component::select::SelectEvent;

pub(super) struct BoundModelSelect {
    request: uuid::Uuid,
    state: gpui::Entity<ModelSelectState>,
    _subscription: gpui::Subscription,
    available_width: f32,
}
use agiworkforce_protocol::account_cloud::{CloudModelListParams, CloudModelListResponse};

impl Desktop {
    fn can_change_cloud_model(&self) -> bool {
        self.can_manage_conversation()
            && !self.cloud.management.needs_reload
            && self.cloud.management.editing.is_none()
            && self.cloud.detail.as_ref().is_some_and(|detail| {
                !detail.conversation.archived && detail.conversation.version.is_some()
            })
    }

    fn save_cloud_model(&mut self, request: uuid::Uuid, id: &str, cx: &mut Context<Self>) {
        if !self.can_change_cloud_model() {
            cx.notify();
            return;
        }
        let Some(detail) = &self.cloud.detail else {
            return;
        };
        let params = self
            .cloud
            .model_picker
            .validate_choice(request, &detail.scope, &detail.conversation.id, id)
            .and_then(|()| {
                crate::conversation_management::update_request(
                    &detail.scope,
                    &detail.conversation,
                    agiworkforce_protocol::account_cloud::CloudConversationChange::Model {
                        model: id.into(),
                    },
                )
            });
        match params {
            Ok(params) if detail.conversation.model.as_deref() != Some(id) => {
                self.update_cloud_conversation(params, cx);
            }
            Ok(_) => {
                cx.notify();
            }
            Err(error) => {
                self.cloud.management.error = Some(error.to_string());
                cx.notify();
            }
        }
    }

    pub(super) fn open_cloud_models(&mut self, cx: &mut Context<Self>) {
        if self.cloud.loading
            || self.cloud.navigation_busy()
            || !self
                .account_capabilities
                .as_ref()
                .is_some_and(|caps| caps.cloud_models)
        {
            return;
        }
        let Some(detail) = &self.cloud.detail else {
            return;
        };
        let scope = detail.scope.clone();
        let conversation = detail.conversation.id.clone();
        let request = self.cloud.model_picker.begin(&scope, &conversation);
        self.cloud_model_select = None;
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.cloud.model_picker.error = Some(error.to_string());
                self.cloud.model_picker.loading = false;
                cx.notify();
                return;
            }
        };
        let generation = self.cloud.generation;
        let task = self.executor.spawn(async move {
            client
                .request::<CloudModelListResponse>(
                    method::CLOUD_MODEL_LIST,
                    CloudModelListParams { scope },
                )
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Loading Cloud models stopped")
                .and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if generation != view.cloud.generation
                    || request != view.cloud.model_picker.request
                    || view
                        .cloud
                        .detail
                        .as_ref()
                        .is_none_or(|detail| detail.conversation.id != conversation)
                {
                    return;
                }
                view.cloud.model_picker.loading = false;
                match result.and_then(|response| view.cloud.model_picker.accept(request, response))
                {
                    Ok(()) => {}
                    Err(error) => {
                        view.cloud.model_picker.error =
                            Some(format!("Models could not be loaded: {error:#}"))
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn sync_cloud_model_select(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.cloud.workspaces.selector().is_none()
            || !self.cloud.visible
            || self.cloud.work_visible
            || self.account.visible
            || self.terminal.visible
            || self.editor.visible
            || !self
                .account_capabilities
                .as_ref()
                .is_some_and(|caps| caps.cloud_models)
        {
            self.cloud_model_select = None;
            return;
        }
        let Some(detail) = &self.cloud.detail else {
            self.cloud_model_select = None;
            return;
        };
        if self.cloud.model_picker.scope != detail.scope
            || self.cloud.model_picker.conversation_id != detail.conversation.id
        {
            self.cloud_model_select = None;
            if !self.cloud.loading && !self.cloud.navigation_busy() {
                self.open_cloud_models(cx);
            }
            return;
        }
        let picker = &self.cloud.model_picker;
        if picker.loading || picker.error.is_some() || picker.models.is_empty() {
            self.cloud_model_select = None;
            return;
        }
        let current = detail.conversation.model.as_ref();
        let expected = current
            .filter(|id| picker.models.iter().any(|model| model.id == **id))
            .cloned();
        if self
            .cloud_model_select
            .as_ref()
            .is_none_or(|control| control.request != picker.request)
        {
            let state = cx.new(|cx| {
                cloud_model_select::state(
                    &picker.models,
                    expected.as_deref(),
                    self.contracts.clone(),
                    window,
                    cx,
                )
            });
            let request = picker.request;
            let generation = self.cloud.generation;
            let scope = detail.scope.clone();
            let conversation = detail.conversation.id.clone();
            let subscription = cx.subscribe_in(
                &state,
                window,
                move |view: &mut Desktop, _, event: &SelectEvent<_>, _, cx| {
                    let SelectEvent::Confirm(Some(id)) = event else {
                        return;
                    };
                    if view.cloud.model_picker.request != request
                        || view.cloud.generation != generation
                        || view.cloud.navigation_busy()
                        || view.cloud.loading
                        || view.cloud.detail.as_ref().is_none_or(|detail| {
                            detail.scope != scope || detail.conversation.id != conversation
                        })
                    {
                        cx.notify();
                        return;
                    }
                    view.save_cloud_model(request, id, cx);
                },
            );
            self.cloud_model_select = Some(BoundModelSelect {
                request,
                state,
                _subscription: subscription,
                available_width: window.bounds().size.width.into(),
            });
        } else if let Some(control) = &mut self.cloud_model_select {
            control.available_width = window.bounds().size.width.into();
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

    pub(super) fn render_cloud_model_select(
        &self,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> gpui::AnyElement {
        if !self
            .account_capabilities
            .as_ref()
            .is_some_and(|caps| caps.cloud_models)
        {
            return div().into_any_element();
        }
        if self.cloud.model_picker.loading {
            return div()
                .child(gpui::text!("Loading models…"))
                .into_any_element();
        }
        if let Some(error) = &self.cloud.model_picker.error {
            return div()
                .flex()
                .flex_col()
                .min_w_0()
                .child(gpui::text!(error.clone()))
                .child(self.button(
                    "retry-cloud-models",
                    "Retry models",
                    UiAction::CloudModels,
                    palette,
                    cx,
                ))
                .into_any_element();
        }
        let Some(control) = &self.cloud_model_select else {
            return div()
                .flex()
                .flex_col()
                .min_w_0()
                .child(gpui::text!(
                    "No models are offered for this account right now."
                ))
                .child(self.button(
                    "refresh-cloud-models",
                    "Refresh models",
                    UiAction::CloudModels,
                    palette,
                    cx,
                ))
                .into_any_element();
        };
        let unavailable = self
            .cloud
            .detail
            .as_ref()
            .and_then(|detail| detail.conversation.model.as_ref())
            .is_some_and(|id| {
                self.cloud
                    .model_picker
                    .models
                    .iter()
                    .find(|model| model.id == *id)
                    .is_some_and(|model| !model.selectable())
            });
        let refresh = (!self.cloud.loading && !self.cloud.navigation_busy()).then(|| {
            self.button(
                "refresh-ready-cloud-models",
                "Refresh models",
                UiAction::CloudModels,
                palette,
                cx,
            )
            .into_any_element()
        });
        cloud_model_select::row(
            &control.state,
            &self.contracts,
            control.available_width,
            !self.can_change_cloud_model(),
            unavailable,
            refresh,
        )
        .into_any_element()
    }
}
