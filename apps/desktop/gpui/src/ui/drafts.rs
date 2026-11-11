use super::*;
use crate::drafts::DraftTarget;
use agiworkforce_protocol::account_cloud::{
    CloudConversationDraft, CloudConversationWorkspace, CloudDraftSaveResponse,
};

impl Desktop {
    pub(super) fn has_unsaved_cloud_draft(&self, cx: &App) -> bool {
        (self.chat_upload.retains_selection()
            && !self.attachment_recovery.retained(&self.chat_upload))
            || self.cloud.draft.dirty()
            || self.cloud_composer.read(cx).value().as_str()
                != self
                    .cloud
                    .draft
                    .saved
                    .as_ref()
                    .map(|saved| saved.text.as_str())
                    .unwrap_or_default()
    }

    pub(super) fn sync_cloud_draft(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(detail) = &self.cloud.detail else {
            if self.cloud.draft.target.is_some()
                && self.cloud.draft.operation.is_none()
                && (!self.has_unsaved_cloud_draft(cx)
                    || self.cloud_composer.read(cx).value().is_empty())
            {
                self.cloud.draft = Default::default();
                self.cloud_draft_task = None;
                self.cloud_composer
                    .update(cx, |input, cx| input.set_value("", window, cx));
            }
            return;
        };
        let recovery_target = agiworkforce_protocol::cloud_uploads::CloudChatTarget {
            scope: detail.scope.clone(),
            workspace: CloudConversationWorkspace::from_organization(
                detail.conversation.organization_id.as_deref(),
            ),
            conversation_id: detail.conversation.id.clone(),
        };
        if self
            .chat_upload
            .target
            .as_ref()
            .is_some_and(|target| *target != recovery_target)
            && self.attachment_recovery.retained(&self.chat_upload)
        {
            self.chat_upload = Default::default();
            self.chat_upload_poll_task = None;
        }
        let target = DraftTarget {
            scope: detail.scope.clone(),
            conversation_id: detail.conversation.id.clone(),
            workspace: CloudConversationWorkspace::from_organization(
                detail.conversation.organization_id.as_deref(),
            ),
        };
        match self.cloud.draft.observe(target, detail.draft.clone()) {
            Ok(Some(text)) => self
                .cloud_composer
                .update(cx, |input, cx| input.set_value(text, window, cx)),
            Ok(None) => {}
            Err(error) => self.cloud.draft.error = Some(error.to_string()),
        }
        self.ensure_attachment_recovery(recovery_target, cx);
    }

    pub(super) fn changed_cloud_draft(&mut self, cx: &mut Context<Self>) {
        self.cloud
            .draft
            .edit(self.cloud_composer.read(cx).value().to_string());
        self.schedule_cloud_draft(cx);
        cx.notify();
    }

    pub(super) fn schedule_cloud_draft(&mut self, cx: &mut Context<Self>) {
        self.cloud_draft_task = None;
        if self.cloud.draft.target.is_none()
            || self.cloud.draft.saved.is_none()
            || self.cloud.draft.conflict.is_some()
            || self.cloud.draft.error.is_some()
            || !self.cloud.draft.dirty()
        {
            return;
        }
        let generation = self.cloud.generation;
        let delay = std::time::Duration::from_millis(self.contracts.draft_save_debounce_ms);
        self.cloud_draft_task = Some(cx.spawn(async move |view, cx| {
            cx.background_executor().timer(delay).await;
            let _ = view.update(cx, |view, cx| {
                if view.cloud.generation == generation {
                    view.save_cloud_draft(cx);
                }
            });
        }));
    }

    pub(super) fn save_cloud_draft(&mut self, cx: &mut Context<Self>) {
        if !self
            .account_capabilities
            .as_ref()
            .is_some_and(|caps| caps.cloud_drafts)
        {
            return;
        }
        let Some(detail) = &self.cloud.detail else {
            return;
        };
        if self.cloud.draft.target.as_ref().is_none_or(|target| {
            target.scope != detail.scope
                || target.conversation_id != detail.conversation.id
                || Some(&target.workspace) != self.cloud.workspaces.selector()
        }) {
            return;
        }
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.cloud.draft.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let job = match self.cloud.draft.begin(self.contracts.draft_max_length) {
            Ok(Some(job)) => job,
            Ok(None) => return,
            Err(error) => {
                self.cloud.draft.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let generation = self.cloud.generation;
        let request = job.request.clone();
        let task = self.executor.spawn(async move {
            client
                .request::<CloudDraftSaveResponse>(method::CLOUD_DRAFT_SAVE, request)
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Saving the draft stopped")
                .and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.cloud.generation != generation {
                    return;
                }
                let result = result.and_then(|response| view.cloud.draft.finish(&job, response));
                if let Err(error) = result {
                    view.cloud.draft.fail(
                        &job,
                        format!("Draft save is unconfirmed: {error:#}. Your text is retained."),
                    );
                }
                view.schedule_cloud_draft(cx);
                if !view.cloud.work_visible
                    && view.cloud.pending_turn.is_some()
                    && !view.cloud.loading
                {
                    let conversation = view
                        .cloud
                        .turn
                        .as_ref()
                        .filter(|turn| {
                            turn.accepted && turn.error.is_none() && !turn.needs_attention()
                        })
                        .and_then(|turn| turn.conversation_id.clone());
                    if let Some(id) = conversation {
                        view.read_cloud(id, HistoryReadIntent::Refresh, cx);
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn resolve_cloud_draft(
        &mut self,
        reviewed: CloudConversationDraft,
        keep_mine: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.cloud.draft.conflict.as_ref() != Some(&reviewed) || self.cloud.navigation_busy() {
            return;
        }
        let generation = self.cloud.generation;
        let text = self.cloud_composer.read(cx).value().to_string();
        let answer = window.prompt(PromptLevel::Warning, if keep_mine { "Replace the saved draft?" } else { "Use the saved draft?" },
            Some(if keep_mine { "This replaces the unsent draft saved for this conversation. Other devices will see your draft." }
                else { "This discards the unsent text in this window and uses the saved draft. Copy your text first if you need it." }),
            &["Cancel", if keep_mine { "Replace saved draft" } else { "Use saved draft" }], cx);
        cx.spawn_in(window, async move |view, cx| {
            if !matches!(answer.await, Ok(1)) {
                return;
            }
            let _ = view.update_in(cx, |view, window, cx| {
                if view.cloud.generation != generation {
                    return;
                }
                if view.cloud_composer.read(cx).value().as_str() != text {
                    view.cloud.draft.error = Some("Your draft changed while the confirmation was open. Review both drafts again.".into());
                    cx.notify();
                    return;
                }
                match view.cloud.draft.resolve(&reviewed, keep_mine) {
                    Ok(text) => {
                        view.cloud_composer
                            .update(cx, |input, cx| input.set_value(text, window, cx));
                        if keep_mine {
                            view.save_cloud_draft(cx);
                        }
                    }
                    Err(error) => view.cloud.draft.error = Some(error.to_string()),
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(super) fn render_cloud_draft(
        &self,
        window: &mut Window,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        crate::draft_controls::controls(
            &self.cloud.draft,
            !self.cloud.navigation_busy() && !self.cloud.loading,
            &self.contracts,
            palette,
            |view: &mut Desktop, action, window, cx| {
                let action = match action {
                    crate::draft_controls::DraftAction::Save => UiAction::SaveCloudDraft,
                    crate::draft_controls::DraftAction::Copy(draft) => {
                        UiAction::CopySavedCloudDraft(draft)
                    }
                    crate::draft_controls::DraftAction::Resolve(draft, mine) => {
                        UiAction::ResolveCloudDraft(draft, mine)
                    }
                };
                view.dispatch(action, window, cx);
            },
            window,
            cx,
        )
    }
}
