use super::*;
use crate::conversation_management::{
    require_unchanged, same_target, ConversationOperation, ConversationOperationKind, TitleEdit,
};
use agiworkforce_protocol::account_cloud::{
    CloudConversationChange, CloudConversationUpdateParams, CloudConversationUpdateResponse,
    CloudHistoryReadParams, CloudHistoryReadResponse,
};

impl Desktop {
    pub(super) fn can_manage_conversation(&self) -> bool {
        self.cloud.workspaces.selector().is_some()
            && self.cloud.visible
            && !self.cloud.work_visible
            && !self.cloud.loading
            && !self.cloud.navigation_busy()
            && self.cloud.pending_turn.is_none()
            && self
                .account_capabilities
                .as_ref()
                .is_some_and(|caps| caps.cloud_conversation_update)
    }

    pub(super) fn toggle_archived_cloud(&mut self, cx: &mut Context<Self>) {
        if self.cloud.loading
            || self.cloud.navigation_busy()
            || self.cloud.management.editing.is_some()
        {
            return;
        }
        if self.has_unsaved_cloud_draft(cx) {
            self.cloud.error = Some(
                "Save or resolve this draft before changing history views. You can also copy and clear it.".into(),
            );
            cx.notify();
            return;
        }
        if self.cloud.detail.is_some() {
            return;
        }
        self.cloud.conversations.clear();
        self.cloud.next_cursor = None;
        self.cloud.next_offset = 0;
        self.cloud.has_more = false;
        self.cloud.loaded = false;
        self.cloud.archived_only = !self.cloud.archived_only;
        self.load_cloud(false, cx);
    }

    pub(super) fn rename_cloud(
        &mut self,
        params: CloudConversationUpdateParams,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if !self.can_manage_conversation() || self.cloud.management.needs_reload {
            return;
        }
        let Some(detail) = &self.cloud.detail else {
            return;
        };
        if let Err(error) = require_unchanged(&detail.scope, &detail.conversation, &params) {
            self.cloud.management.error = Some(error.to_string());
            cx.notify();
            return;
        }
        let CloudConversationChange::Rename { title } = &params.change else {
            return;
        };
        self.cloud_title.update(cx, |input, cx| {
            input.set_value(title.clone(), window, cx);
            input.focus(window, cx);
        });
        self.cloud.management.editing = Some(TitleEdit {
            id: uuid::Uuid::new_v4(),
            request: params,
        });
        self.cloud.management.error = None;
        cx.notify();
    }

    pub(super) fn save_cloud_title(&mut self, id: uuid::Uuid, cx: &mut Context<Self>) {
        if !self.can_manage_conversation() || self.cloud.management.needs_reload {
            return;
        }
        let Some(edit) = self
            .cloud
            .management
            .editing
            .as_ref()
            .filter(|edit| edit.id == id)
        else {
            return;
        };
        let title = self.cloud_title.read(cx).value().to_string();
        if title.trim().is_empty()
            || title.encode_utf16().count() > self.contracts.conversation_title_max_length
        {
            self.cloud.management.error = Some(format!(
                "Enter a title with {} characters or fewer.",
                self.contracts.conversation_title_max_length
            ));
            cx.notify();
            return;
        }
        if self.cloud.detail.as_ref().is_some_and(|detail| {
            same_target(&detail.scope, &detail.conversation, &edit.request)
                && detail.conversation.title.as_deref() == Some(title.as_str())
        }) {
            self.cloud.management.editing = None;
            self.cloud.management.error = None;
            cx.notify();
            return;
        }
        let mut request = edit.request.clone();
        request.change = CloudConversationChange::Rename { title };
        self.update_cloud_conversation(request, cx);
    }

    pub(super) fn update_cloud_conversation(
        &mut self,
        params: CloudConversationUpdateParams,
        cx: &mut Context<Self>,
    ) {
        if !self.can_manage_conversation() || self.cloud.management.needs_reload {
            return;
        }
        if self.cloud.management.editing.is_some()
            && !matches!(&params.change, CloudConversationChange::Rename { .. })
        {
            return;
        }
        let Some(detail) = &self.cloud.detail else {
            return;
        };
        if let Err(error) = require_unchanged(&detail.scope, &detail.conversation, &params) {
            self.cloud.management.error = Some(error.to_string());
            self.cloud.management.needs_reload = true;
            cx.notify();
            return;
        }
        let original = detail.conversation.clone();
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.cloud.management.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let operation = uuid::Uuid::new_v4();
        self.cloud.management.operation = Some(ConversationOperation {
            id: operation,
            kind: ConversationOperationKind::Save,
        });
        self.cloud.management.error = None;
        let generation = self.cloud.generation;
        let scope = params.scope.clone();
        let task = self.executor.spawn(async move {
            client
                .request::<CloudConversationUpdateResponse>(
                    method::CLOUD_CONVERSATION_UPDATE,
                    params,
                )
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Updating the conversation stopped")
                .and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.cloud.generation != generation
                    || view.cloud.management.operation.as_ref().map(|operation| operation.id) != Some(operation)
                {
                    return;
                }
                view.cloud.management.operation = None;
                let result = result.and_then(|response| {
                    anyhow::ensure!(
                        response.scope == scope,
                        "The account changed during the update"
                    );
                    view.cloud
                        .accept_metadata(&scope, &original, response.conversation)
                });
                match result {
                    Ok(()) => {
                        view.cloud.management.editing = None;
                        view.cloud.management.needs_reload = false;
                    }
                    Err(error) => {
                        view.cloud.management.error =
                            Some(format!("The change could not be confirmed: {error:#}"));
                        view.cloud.management.needs_reload = !matches!(error.downcast_ref::<agiworkforce_app_server::DeveloperSessionClientError>(), Some(agiworkforce_app_server::DeveloperSessionClientError::Remote { code: -32602, .. }));
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn reload_cloud_metadata(&mut self, cx: &mut Context<Self>) {
        if !self.can_manage_conversation() {
            return;
        }
        let Some(detail) = &self.cloud.detail else {
            return;
        };
        let original = detail.conversation.clone();
        let scope = detail.scope.clone();
        let params = CloudHistoryReadParams {
            workspace: Some(
                agiworkforce_protocol::account_cloud::CloudConversationWorkspace::from_organization(
                    original.organization_id.as_deref(),
                ),
            ),
            scope: scope.clone(),
            conversation_id: original.id.clone(),
            limit: 1,
            offset: 0,
            latest: false,
            before: None,
        };
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.cloud.management.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let operation = uuid::Uuid::new_v4();
        let generation = self.cloud.generation;
        self.cloud.management.operation = Some(ConversationOperation {
            id: operation,
            kind: ConversationOperationKind::Review,
        });
        let task = self.executor.spawn(async move {
            client
                .request::<CloudHistoryReadResponse>(method::CLOUD_HISTORY_READ, params)
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task.await.context("Reloading conversation metadata stopped").and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.cloud.generation != generation || view.cloud.management.operation.as_ref().map(|operation| operation.id) != Some(operation) { return; }
                view.cloud.management.operation = None;
                let result = result.and_then(|page| { anyhow::ensure!(page.scope == scope, "The account changed while reloading metadata"); view.cloud.accept_metadata(&scope, &original, page.conversation) });
                match result {
                    Ok(()) => {
                        view.cloud.management.needs_reload = false;
                        view.cloud.management.error = None;
                        if let Some(edit) = &mut view.cloud.management.editing {
                            if let Some(detail) = &view.cloud.detail {
                                if same_target(&detail.scope, &detail.conversation, &edit.request) {
                                    if let Some(version) = &detail.conversation.version { edit.request.expected_version = version.clone(); }
                                    view.cloud.management.error = Some("The latest saved title is shown above. Your proposed title is retained; review it before saving again.".into());
                                }
                            }
                        }
                    }
                    Err(error) => { view.cloud.management.error = Some(format!("The latest conversation details could not be loaded: {error:#}")); view.cloud.management.needs_reload = true; }
                }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    pub(super) fn render_conversation_management(
        &self,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        use crate::conversation_management::ConversationAction;
        if !self
            .account_capabilities
            .as_ref()
            .is_some_and(|caps| caps.cloud_conversation_update)
        {
            return div();
        }
        let Some(detail) = &self.cloud.detail else {
            return div();
        };
        crate::conversation_controls::controls(
            crate::conversation_controls::ConversationControlProps {
                contracts: &self.contracts,
                scope: &detail.scope,
                conversation: &detail.conversation,
                management: &self.cloud.management,
                title: &self.cloud_title,
                enabled: self.can_manage_conversation(),
                busy: self.cloud.navigation_busy(),
            },
            palette,
            |view: &mut Desktop, action, window, cx| {
                let action = match action {
                    ConversationAction::Rename(params) => UiAction::RenameCloud(params),
                    ConversationAction::SaveTitle(id) => UiAction::SaveCloudTitle(id),
                    ConversationAction::CancelTitle(id) => UiAction::CancelCloudTitle(id),
                    ConversationAction::Update(params) => UiAction::UpdateCloudConversation(params),
                    ConversationAction::ReviewLatest => UiAction::ReloadCloudMetadata,
                };
                view.dispatch(action, window, cx);
            },
            cx,
        )
    }
}
