use super::*;
use agiworkforce_protocol::account_cloud::{
    CloudHistoryListParams, CloudHistoryListResponse, CloudHistoryReadParams,
    CloudHistoryReadResponse,
};

impl Desktop {
    pub(super) fn open_cloud(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.cloud.work_loading {
            return;
        }
        if self.cloud.work_selected.is_some() {
            self.leave_work(super::frame::WorkDestination::Chat, window, cx);
            return;
        }
        self.save_draft(cx);
        self.account.visible = false;
        self.cloud.visible = true;
        self.cloud.projects.visible = false;
        self.cloud.projects.active_id = None;
        self.cloud.work_visible = false;
        self.focus.focus(window, cx);
        if !self.cloud.navigation_busy() {
            self.load_cloud(false, cx);
        }
    }

    pub(super) fn load_cloud(&mut self, more: bool, cx: &mut Context<Self>) {
        if self.cloud.has_unconfirmed_turn() {
            self.cloud.error = Some("Check the unconfirmed message status or its saved conversation before leaving it or starting another conversation.".into());
            cx.notify();
            return;
        }
        if self.cloud.loading || self.cloud.reset_query || self.cloud.navigation_busy() {
            return;
        }
        if self.has_unsaved_cloud_draft(cx) && self.cloud.detail.is_some() {
            self.cloud.error = Some(
                "Wait for this draft to save, or copy and clear it before leaving this conversation.".into(),
            );
            cx.notify();
            return;
        }
        if self.cloud.management.editing.is_some() {
            self.cloud.management.error =
                Some("Save or cancel the conversation title before leaving this view.".into());
            cx.notify();
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
        if !self
            .account
            .status
            .as_ref()
            .is_some_and(|status| status.signed_in)
        {
            self.cloud.error = Some("Sign in from Account to read Cloud history.".into());
            cx.notify();
            return;
        }
        let params = CloudHistoryListParams {
            project_id: self.cloud.projects.active_id.clone(),
            workspace: self.cloud.workspaces.selector().cloned(),
            archive_filter: Some(if self.cloud.archived_only {
                agiworkforce_protocol::account_cloud::CloudHistoryArchiveFilter::Only
            } else if !self.cloud.query.trim().is_empty() {
                agiworkforce_protocol::account_cloud::CloudHistoryArchiveFilter::Include
            } else {
                agiworkforce_protocol::account_cloud::CloudHistoryArchiveFilter::Exclude
            }),
            limit: self.settings.session_page_size,
            offset: if more { self.cloud.next_offset } else { 0 },
            cursor: if more {
                self.cloud.next_cursor.clone()
            } else {
                None
            },
            query: Some(self.cloud.query.clone()),
            scope: self.cloud.scope.clone(),
        };
        let generation = self.cloud.generation;
        self.cloud.loading = true;
        self.cloud.error = None;
        let task = self.executor.spawn(async move {
            client
                .request::<CloudHistoryListResponse>(method::CLOUD_HISTORY_LIST, params)
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Reading Cloud history stopped")
                .and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.cloud.generation != generation {
                    return;
                }
                view.cloud.loading = false;
                let result = result.and_then(|page| view.cloud.accept_list(page, more));
                if let Err(error) = result {
                    view.cloud.reset_view();
                    view.cloud.error = Some(format!("Cloud history could not be read: {error:#}"));
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn read_cloud(
        &mut self,
        id: String,
        intent: HistoryReadIntent,
        cx: &mut Context<Self>,
    ) {
        if self.cloud.has_unconfirmed_turn()
            && self
                .cloud
                .pending_turn
                .as_ref()
                .is_some_and(|pending| pending.conversation_id != id)
        {
            self.cloud.error = Some("Check the unconfirmed message in its saved conversation before selecting another one.".into());
            cx.notify();
            return;
        }
        let more = matches!(intent, HistoryReadIntent::Older);
        if self.cloud.loading || self.cloud.navigation_busy() {
            return;
        }
        if more {
            self.history_viewport.older();
        }
        if self.has_unsaved_cloud_draft(cx)
            && self
                .cloud
                .detail
                .as_ref()
                .is_none_or(|detail| detail.conversation.id != id)
            && self.cloud.draft.target.as_ref().is_none_or(|target| {
                target.conversation_id != id || self.cloud.scope.as_ref() != Some(&target.scope)
            })
        {
            self.cloud.error = Some(
                "Save or resolve this draft before selecting another conversation. You can also copy and clear it."
                    .into(),
            );
            cx.notify();
            return;
        }
        if self.cloud.management.editing.is_some()
            && self
                .cloud
                .detail
                .as_ref()
                .is_none_or(|detail| detail.conversation.id != id)
        {
            self.cloud.management.error = Some(
                "Save or cancel the conversation title before selecting another conversation."
                    .into(),
            );
            cx.notify();
            return;
        }
        if !self.require_cloud_workspace(cx) {
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
        let before = if more {
            self.cloud
                .detail
                .as_ref()
                .and_then(|detail| detail.previous_before)
        } else {
            None
        };
        let offset = if more && before.is_none() {
            self.cloud
                .detail
                .as_ref()
                .map_or(0, |detail| detail.next_offset)
        } else {
            0
        };
        let params = CloudHistoryReadParams {
            workspace: self.cloud.workspaces.selector().cloned(),
            scope,
            conversation_id: id.clone(),
            limit: self.settings.session_page_size,
            offset,
            latest: !more,
            before,
        };
        let generation = self.cloud.generation;
        self.cloud.loading = true;
        self.cloud.error = None;
        if matches!(intent, HistoryReadIntent::Latest)
            || matches!(intent, HistoryReadIntent::Refresh) && self.following_cloud_turn()
        {
            self.history_viewport.latest();
        }
        let task = self.executor.spawn(async move {
            client
                .request::<CloudHistoryReadResponse>(method::CLOUD_HISTORY_READ, params)
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Reading the Cloud conversation stopped")
                .and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.cloud.generation != generation {
                    return;
                }
                view.cloud.loading = false;
                let work_intent = view.cloud.compose_work
                    && view
                        .cloud
                        .detail
                        .as_ref()
                        .is_some_and(|detail| detail.conversation.id == id);
                let result = result.and_then(|page| {
                    anyhow::ensure!(
                        page.conversation.id == id,
                        "The account returned a different conversation"
                    );
                    view.cloud.accept_detail(page, more)
                });
                if result.is_ok() {
                    view.cloud.compose_work = work_intent
                        || view.cloud.detail.as_ref().is_some_and(|detail| {
                            detail.conversation.work_mode.as_deref()
                                == Some(view.contracts.work_mode.as_str())
                        });
                }
                if result.is_ok()
                    && view.cloud.visible
                    && !view.cloud.work_visible
                    && (matches!(intent, HistoryReadIntent::Latest)
                        || matches!(intent, HistoryReadIntent::Refresh)
                            && view.following_cloud_turn())
                {
                    view.history_viewport.latest();
                }
                if let Err(error) = result {
                    view.cloud.reset_view();
                    view.cloud.error = Some(format!(
                        "The Cloud conversation could not be read: {error:#}"
                    ));
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn render_cloud(
        &self,
        window: &mut Window,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> gpui::AnyElement {
        if self.cloud.workspaces.selector().is_none() {
            return self.render_cloud_workspaces(palette, cx).into_any_element();
        }
        if self.cloud.projects.visible {
            return self.render_projects(palette, window, cx).into_any_element();
        }
        if self.cloud.work_visible {
            return div()
                .w_full()
                .min_w_0()
                .flex()
                .flex_col()
                .gap_4()
                .child(self.render_work(window, palette, cx))
                .into_any_element();
        }
        let mut panel = div()
            .w_full()
            .max_w(px(self.contracts.frame.content_width))
            .flex()
            .flex_col()
            .gap_4()
            .when(self.cloud.detail.is_none(), |panel| {
                panel.child(
                    Input::new(&self.cloud_query)
                        .aria_label("Search Cloud conversations")
                        .disabled(self.cloud.loading),
                )
            });
        if self
            .account_capabilities
            .as_ref()
            .is_some_and(|caps| caps.cloud_attachment_recovery)
        {
            panel = panel.child(self.compact_button(
                "browse-recovered-attachments",
                "Recovered attachments",
                UiAction::AttachmentRecovery(super::attachment_recovery::RecoveryAction::Browse),
                palette,
                cx,
            ));
        }
        if !self.cloud.loading && self.cloud.detail.is_none() {
            panel = panel.child(self.button(
                "search-cloud",
                "Search",
                UiAction::SearchCloud,
                palette,
                cx,
            ));
        }
        let project_id = self
            .cloud
            .detail
            .as_ref()
            .and_then(|detail| detail.conversation.project_id.as_ref())
            .or(self.cloud.projects.active_id.as_ref());
        if let Some(id) = project_id {
            let project = self
                .cloud
                .projects
                .selected
                .as_ref()
                .filter(|project| project.id == *id)
                .or_else(|| {
                    self.cloud
                        .projects
                        .rows
                        .iter()
                        .find(|project| project.id == *id)
                });
            let label = project
                .filter(|project| !project.name.trim().is_empty())
                .map(|project| format!("Project: {}", project.name))
                .unwrap_or_else(|| "Project conversation".into());
            panel = panel.child(gpui::text!(label));
            if self.cloud.projects.active_id.is_some() {
                panel = panel.child(self.compact_button(
                    "all-cloud-conversations",
                    "All conversations",
                    UiAction::CloudHistory,
                    palette,
                    cx,
                ));
            }
        }
        if let Some(error) = &self.cloud.error {
            panel = panel.child(
                div()
                    .text_color(rgb(palette.danger))
                    .child(gpui::text!(error.clone())),
            );
        }
        if self.cloud.loading {
            panel = panel.child(gpui::text!("Loading Cloud history…"));
        }
        if self.cloud.windowed {
            panel = panel.child(gpui::text!(if self.cloud.detail.is_some() {
                "Showing a window of messages. Use Latest messages to return to the end."
            } else {
                "Showing a window of loaded history. Search again to return to the first page."
            }));
        }
        if self.cloud.detail.is_none() && !self.cloud.loading && !self.cloud.navigation_busy() {
            panel = panel.child(self.button(
                "toggle-archived-cloud",
                if self.cloud.archived_only {
                    "Show active conversations"
                } else {
                    "Archived conversations"
                },
                UiAction::ToggleArchivedCloud,
                palette,
                cx,
            ));
        }
        if let Some(detail) = &self.cloud.detail {
            if !self.cloud.loading && !self.cloud.navigation_busy() {
                panel = panel.child(self.button(
                    "reload-cloud-messages",
                    "Latest messages",
                    UiAction::ReadCloud(detail.conversation.id.clone()),
                    palette,
                    cx,
                ));
            }
            panel = panel.child(div().text_color(rgb(palette.secondary)).child(gpui::text!(
                if detail.conversation.organization_id.is_some() {
                    "Workspace conversation"
                } else {
                    "Personal conversation"
                }
            )));
            panel = panel.child(self.render_conversation_management(palette, cx));
            if detail.previous_before.is_some()
                && !self.cloud.loading
                && !self.cloud.navigation_busy()
            {
                panel = panel.child(self.button(
                    "older-cloud-messages",
                    "Load older messages",
                    UiAction::MoreCloudMessages,
                    palette,
                    cx,
                ));
            }
            for message in &detail.messages {
                panel = panel.child(
                    div()
                        .id(SharedString::from(format!("cloud-message:{}", message.id)))
                        .flex()
                        .flex_col()
                        .gap_2()
                        .child(gpui::text!(message.role.clone()))
                        .child(if message.role == "assistant" {
                            rich_text::markdown(
                                SharedString::from(format!(
                                    "cloud:{}:{}:message:{}",
                                    detail.scope, detail.conversation.id, message.id
                                )),
                                message.content.clone(),
                                &self.contracts,
                                window,
                                cx,
                            )
                            .into_any_element()
                        } else {
                            gpui::text!(message.content.clone()).into_any_element()
                        }),
                );
                for attachment in &message.attachments {
                    let mut description = format!(
                        "{}: {}",
                        match attachment.kind {
                            agiworkforce_protocol::account_cloud::CloudHistoryAttachmentKind::Image => "Image",
                            agiworkforce_protocol::account_cloud::CloudHistoryAttachmentKind::File => "File",
                        },
                        attachment.name
                    );
                    if let Some(size) = attachment.size {
                        description.push_str(&format!(" · {size} bytes"));
                    }
                    if let Some(mime) = &attachment.mime_type {
                        description.push_str(&format!(" · {mime}"));
                    }
                    panel = panel.child(
                        div()
                            .min_w_0()
                            .text_color(rgb(palette.secondary))
                            .child(gpui::text!(description)),
                    );
                }
                if message.attachments_incomplete {
                    panel = panel.child(gpui::text!(
                        "Saved files could not be read. Open this conversation on Web before continuing."
                    ));
                }
                if message.content_truncated {
                    panel = panel.child(gpui::text!(id = SharedString::from(format!("cloud-truncated:{}", message.id)), "This message preview is truncated. The complete message remains in Cloud history."));
                }
                if let Some(plan) = &message.work_plan {
                    if !self
                        .cloud
                        .turn
                        .as_ref()
                        .and_then(|turn| turn.work_plan.as_ref())
                        .is_some_and(|live| live.same_content(plan))
                    {
                        panel = panel.child(self.render_work_plan(plan, true, palette, cx));
                    }
                }
                if message.work_plan_incomplete {
                    panel = panel.child(gpui::text!(
                        "This saved plan review is incomplete. Continue it in your web account."
                    ));
                }
            }
            if let Some(turn) = &self.cloud.turn {
                if let Some(error) = &turn.attachment_recovery_error {
                    panel = panel.child(gpui::text!(error.clone()));
                }
                if let Some(pending) = &self.cloud.pending_turn {
                    if turn.accepted
                        && !detail
                            .messages
                            .iter()
                            .any(|message| message.id == pending.user_message_id)
                    {
                        panel = panel.child(
                            div()
                                .child(gpui::text!("You"))
                                .child(gpui::text!(pending.text.clone())),
                        );
                    }
                }
                if !detail
                    .messages
                    .iter()
                    .any(|message| message.id == turn.request_id)
                {
                    panel = panel.child(rich_text::markdown(
                        SharedString::from(format!(
                            "cloud:{}:{}:turn:{}",
                            detail.scope, detail.conversation.id, turn.request_id
                        )),
                        turn.output.clone(),
                        &self.contracts,
                        window,
                        cx,
                    ));
                }
                panel = panel.child(self.render_cloud_controls(turn, palette, cx));
                if !turn.needs_attention()
                    && self.cloud.pending_turn.is_some()
                    && !self.cloud.loading
                {
                    panel = panel.child(self.button(
                        "reload-cloud-turn",
                        "Reload saved conversation",
                        UiAction::ReadCloud(detail.conversation.id.clone()),
                        palette,
                        cx,
                    ));
                }
            }
            if detail.conversation.archived {
                panel = panel.child(gpui::text!(
                    "This conversation is archived. Restore it to continue chatting."
                ));
                return panel.into_any_element();
            }
            if detail.has_more
                && detail.previous_before.is_none()
                && !self.cloud.loading
                && !self.cloud.navigation_busy()
            {
                panel = panel.child(self.button(
                    "more-cloud-messages",
                    "Load more messages",
                    UiAction::MoreCloudMessages,
                    palette,
                    cx,
                ));
            }
            if detail.messages.is_empty() && !self.cloud.loading {
                panel = panel.child(gpui::text!("This conversation has no messages."));
            }
        } else if self.cloud.conversations.is_empty()
            && !self.cloud.loading
            && self.cloud.error.is_none()
        {
            panel = panel.child(gpui::text!(if self.cloud.loaded {
                "No Cloud conversations match this search."
            } else {
                "Search to load this account's Cloud conversations."
            }));
        }
        if self.cloud.detail.is_none() && !self.cloud_composer.read(cx).value().is_empty() {
            panel = panel.child(gpui::text!("An unsent draft is retained from the previous selection. Copy or clear it before continuing."))
                .child(Textarea::new(&self.cloud_composer).aria_label("Retained Cloud draft"));
        }
        if self.cloud.detail.is_none()
            && !self.cloud.loading
            && !self.cloud.conversations.is_empty()
        {
            panel = panel.child(gpui::text!(
                "Choose a recent conversation in navigation, or start a new one."
            ));
        }
        panel.into_any_element()
    }

    pub(super) fn render_cloud_composer(
        &self,
        window: &mut Window,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> Option<gpui::AnyElement> {
        if self.cloud.projects.visible
            || self.cloud.work_visible
            || self.cloud.workspaces.selector().is_none()
        {
            return None;
        }
        let detail = self.cloud.detail.as_ref()?;
        let archived = detail.conversation.archived;
        if archived
            && self.cloud_composer.read(cx).value().is_empty()
            && !self.cloud.draft.dirty()
            && self.chat_upload.files.is_empty()
        {
            return None;
        }
        let mut action = None;
        if !archived
            && self.cloud.work_busy()
            && !self.cloud.turn.as_ref().is_some_and(|turn| {
                turn.state.needs_review()
                    && turn
                        .work_plan
                        .as_ref()
                        .is_some_and(|plan| plan.awaiting_approval)
            })
        {
            if let Some(params) = self.cloud.turn_id() {
                action = Some(
                    self.compact_button(
                        "stop-cloud",
                        if self.cloud.stopping {
                            "Stopping…"
                        } else {
                            "Stop"
                        },
                        UiAction::StopCloud(params),
                        palette,
                        cx,
                    )
                    .into_any_element(),
                );
            }
        } else if !archived
            && !self.cloud.loading
            && !self.cloud.navigation_busy()
            && self.cloud.management.editing.is_none()
            && !self.cloud.management.needs_reload
            && !detail
                .messages
                .iter()
                .any(|message| message.attachments_incomplete)
            && self.cloud.pending_turn.is_none()
            && !self.chat_upload.pending()
            && !self.attachment_recovery.busy()
            && !self.attachment_recovery.verification_required
            && (!self.cloud_composer.read(cx).value().trim().is_empty()
                || !self.chat_upload.files.is_empty())
        {
            action = Some(
                self.compact_button("send-cloud", "Send", UiAction::SendCloud, palette, cx)
                    .into_any_element(),
            );
        }
        let mut footer = div()
            .w_full()
            .min_w_0()
            .flex()
            .flex_col()
            .gap(px(self.contracts.frame.control_gap));
        footer = footer.child(self.render_current_attachment_recovery(palette, cx));
        let matching_attachments = self.chat_upload.target.as_ref().is_some_and(|target| {
            target.scope == detail.scope
                && target.conversation_id == detail.conversation.id
                && Some(&target.workspace) == self.cloud.workspaces.selector()
        });
        for attachment in self
            .chat_upload
            .files
            .iter()
            .filter(|_| matching_attachments)
        {
            footer = footer.child(
                div()
                    .flex()
                    .flex_wrap()
                    .min_w_0()
                    .gap_2()
                    .child(gpui::text!(format!(
                        "{} · {} bytes",
                        attachment.name,
                        attachment.size.unwrap_or_default()
                    )))
                    .child(self.compact_button(
                        SharedString::from(format!(
                            "remove-chat-attachment:{}",
                            attachment.asset_id
                        )),
                        "Remove from message",
                        UiAction::ChatUpload(
                            self.chat_upload.selection,
                            super::chat_upload::ChatUploadAction::Remove(
                                attachment.asset_id.clone(),
                            ),
                        ),
                        palette,
                        cx,
                    )),
            );
        }
        if !self.chat_upload.files.is_empty() {
            footer = footer.child(gpui::text!(if self.attachment_recovery.retained(&self.chat_upload) { "Unsent attachments are recoverable on this device for this account. They are not part of the synced text draft." } else { "Send or remove these attachments before leaving; local recovery has not been confirmed." }));
            if !matching_attachments {
                footer = footer.child(gpui::text!("These attachments belong to another conversation or workspace. Reconnect to close that selection."))
                    .child(self.compact_button("reconnect-mismatched-chat-attachments", "Reconnect account", UiAction::ReconnectAccount, palette, cx));
            }
        }
        if !archived
            && !self.cloud.loading
            && !self.cloud.navigation_busy()
            && !self.attachment_recovery.busy()
            && !self.attachment_recovery.verification_required
            && self.cloud.pending_turn.is_none()
            && !self.chat_upload.pending()
            && self.project_upload.target.is_none()
            && self
                .account_capabilities
                .as_ref()
                .is_some_and(|caps| caps.cloud_uploads)
        {
            footer = footer.child(self.compact_button(
                "add-chat-attachment",
                "Add file",
                UiAction::ChooseChatUpload,
                palette,
                cx,
            ));
        }
        if self.cloud.pending_turn.is_some() && self.cloud.turn.is_none() && !self.cloud.loading {
            footer = footer.child(self.compact_button(
                "check-unconfirmed-cloud-turn",
                "Check message status",
                UiAction::RefreshCloudTurn,
                palette,
                cx,
            ));
            footer = footer.child(self.compact_button(
                "reload-unconfirmed-cloud",
                "Reload saved conversation",
                UiAction::ReadCloud(detail.conversation.id.clone()),
                palette,
                cx,
            ));
        }
        if self.cloud.compose_work && detail.messages.is_empty() && self.cloud.turn.is_none() {
            footer = footer.child(gpui::text!(
                "Describe the goal. A plan will be prepared for review before work starts."
            ));
        }
        footer = footer.child(crate::native_frame::composer(
            &self.cloud_composer,
            if archived {
                "Retained Cloud draft"
            } else {
                "Cloud message"
            },
            !archived
                && (self.cloud.busy()
                    || self.cloud.loading
                    || self.cloud.management.editing.is_some()),
            archived,
            action,
            &self.contracts,
            palette,
        ));
        footer = footer.child(self.render_cloud_draft(window, palette, cx));
        if !archived {
            if self.cloud.management.needs_reload && !self.cloud.navigation_busy() {
                footer = footer
                    .child(gpui::text!(
                        "Review the latest conversation before sending."
                    ))
                    .child(self.compact_button(
                        "review-conversation-for-send",
                        "Review latest conversation",
                        UiAction::ReloadCloudMetadata,
                        palette,
                        cx,
                    ));
            }
            footer = footer.child(self.render_cloud_model_select(palette, cx));
        }
        Some(
            crate::native_frame::footer(footer.into_any_element(), &self.contracts)
                .into_any_element(),
        )
    }
}
