use super::*;
use crate::code_sessions::{
    accept_archive, accept_delete, accept_rename, delete_params, discard_params, remove_thread,
    rename_params, replace_thread,
};
use agiworkforce_protocol::developer_session::{
    AcknowledgedResponse, ThreadDeleteResponse, ThreadIdParams, ThreadReadResponse,
    ThreadRenameResponse, ThreadStatus, ThreadSummary,
};

impl Desktop {
    fn session_running(&self, thread_id: &str) -> bool {
        self.conversation.as_ref().is_some_and(|conversation| {
            conversation.transcript.thread.id == thread_id && conversation.is_running()
        })
    }

    fn session_idle(&self, thread_id: &str) -> bool {
        self.code_sessions.operation.is_none() && !self.loading && !self.session_running(thread_id)
    }

    pub(super) fn toggle_archived_sessions(&mut self, cx: &mut Context<Self>) {
        if self.code_sessions.operation.is_some() || self.loading {
            return;
        }
        self.code_sessions.include_archived = !self.code_sessions.include_archived;
        if self.code_search.results().is_some() {
            self.search_sessions(cx);
        }
        self.load_sessions(false, cx);
    }

    pub(super) fn begin_code_rename(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(thread) = self.open_thread() else {
            return;
        };
        if !self.session_idle(&thread.id)
            || !self
                .capabilities
                .as_ref()
                .is_some_and(|caps| caps.thread_rename)
            || thread.status == ThreadStatus::Archived
        {
            return;
        }
        let title = thread.title.clone();
        let id = thread.id;
        self.code_title.update(cx, |input, cx| {
            input.set_value(title, window, cx);
            input.focus(window, cx);
        });
        self.code_sessions.renaming = Some(id);
        self.code_sessions.error = None;
        cx.notify();
    }

    pub(super) fn save_code_rename(&mut self, cx: &mut Context<Self>) {
        let Some(thread_id) = self.code_sessions.renaming.clone() else {
            return;
        };
        if !self.session_idle(&thread_id) {
            return;
        }
        let title = self.code_title.read(cx).value().to_string();
        let request = match rename_params(&thread_id, &title) {
            Ok(request) => request,
            Err(error) => {
                self.code_sessions.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.code_sessions.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let operation = self.code_sessions.begin();
        let generation = self.generation;
        let task = self.executor.spawn(async move {
            client
                .request::<ThreadRenameResponse>(method::THREAD_RENAME, request.clone())
                .await
                .map(|response| (request, response))
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Renaming the session stopped")
                .and_then(|result| result.map_err(Into::into))
                .and_then(|(request, response)| {
                    accept_rename(&request, &response)?;
                    Ok(response.thread)
                });
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation || view.code_sessions.operation != Some(operation)
                {
                    return;
                }
                view.code_sessions.operation = None;
                match result {
                    Ok(thread) => {
                        view.store_thread(thread);
                        view.code_sessions.renaming = None;
                        view.code_sessions.notice = Some("Session title saved.".into());
                    }
                    Err(error) => {
                        view.code_sessions.error = Some(crate::code_sessions::error_message(&error))
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn archive_code_session(&mut self, archive: bool, cx: &mut Context<Self>) {
        let Some(thread) = self.open_thread() else {
            return;
        };
        let allowed = if archive {
            self.session_idle(&thread.id) && thread.status != ThreadStatus::Archived
        } else {
            self.code_sessions.operation.is_none()
                && !self.loading
                && thread.status == ThreadStatus::Archived
                && self
                    .capabilities
                    .as_ref()
                    .is_some_and(|caps| caps.thread_unarchive)
        };
        if !allowed {
            return;
        }
        let thread_id = thread.id;
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.code_sessions.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let operation = self.code_sessions.begin();
        let generation = self.generation;
        let method_name = if archive {
            method::THREAD_ARCHIVE
        } else {
            method::THREAD_UNARCHIVE
        };
        let archived_id = thread_id.clone();
        let task = self.executor.spawn(async move {
            let acknowledged = client
                .request::<AcknowledgedResponse>(
                    method_name,
                    ThreadIdParams {
                        thread_id: thread_id.clone(),
                    },
                )
                .await?;
            accept_archive(&acknowledged)?;
            if archive {
                return Ok(None);
            }
            let transcript = client
                .request::<ThreadReadResponse>(method::THREAD_READ, ThreadIdParams { thread_id })
                .await?;
            Ok::<_, anyhow::Error>(Some(transcript.thread))
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Updating the session stopped")
                .and_then(|result| result);
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation || view.code_sessions.operation != Some(operation)
                {
                    return;
                }
                view.code_sessions.operation = None;
                match result {
                    Ok(thread) => {
                        if archive {
                            if let Some(mut current) = view.open_thread() {
                                if current.id == archived_id {
                                    current.status = ThreadStatus::Archived;
                                    view.store_thread(current);
                                }
                            }
                            if !view.code_sessions.include_archived {
                                remove_thread(&mut view.threads, &archived_id);
                                view.code_search.remove_thread(&archived_id);
                            }
                            view.code_sessions.notice = Some(
                                "Session archived. Unarchive it before sending another message."
                                    .into(),
                            );
                        } else if let Some(thread) = thread {
                            view.store_thread(thread);
                            view.code_sessions.notice =
                                Some("Session restored to the active list.".into());
                        }
                        view.code_sessions.renaming = None;
                    }
                    Err(error) => {
                        view.code_sessions.error = Some(crate::code_sessions::error_message(&error))
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn delete_code_session(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(thread) = self.open_thread() else {
            return;
        };
        if !self.session_idle(&thread.id)
            || !self
                .capabilities
                .as_ref()
                .is_some_and(|caps| caps.thread_delete)
        {
            return;
        }
        let thread_id = thread.id.clone();
        let title = thread.title;
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.code_sessions.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let operation = self.code_sessions.begin();
        let generation = self.generation;
        cx.spawn_in(window, async move |view, cx| {
            let result: Result<Option<ThreadDeleteResponse>> = async {
                let detail = format!("This removes \"{title}\" and its saved messages on this machine. Worktree archives are kept. You can discard those archives in a separate step. This cannot be undone.");
                let prompt = cx.update(|window, cx| {
                    window.prompt(
                        PromptLevel::Warning,
                        "Delete this coding session?",
                        Some(detail.as_str()),
                        &["Keep session", "Delete session"],
                        cx,
                    )
                })?;
                if prompt.await? != 1 {
                    return Ok(None);
                }
                let task = view.update(cx, |view, _| {
                    anyhow::ensure!(
                        view.generation == generation
                            && view.code_sessions.operation == Some(operation)
                            && !view.session_running(&thread_id)
                            && view.conversation.as_ref().is_some_and(|conversation| {
                                conversation.transcript.thread.id == thread_id
                            }),
                        "The session changed before it could be deleted"
                    );
                    let params = delete_params(&thread_id)?;
                    Ok(view.executor.spawn(async move {
                        client
                            .request::<ThreadDeleteResponse>(method::THREAD_DELETE, params.clone())
                            .await
                            .map(|response| (params, response))
                    }))
                })??;
                let (params, response) = task.await.context("Deleting the session stopped")??;
                accept_delete(&params, &response)?;
                Ok(Some(response))
            }
            .await;
            let _ = view.update_in(cx, |view, window, cx| {
                if view.generation != generation || view.code_sessions.operation != Some(operation) {
                    return;
                }
                view.code_sessions.operation = None;
                match result {
                    Ok(None) => {}
                    Ok(Some(response)) => {
                        view.finish_code_delete(&thread_id, response, window, cx);
                    }
                    Err(error) => {
                        view.code_sessions.error = Some(crate::code_sessions::error_message(&error))
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn discard_code_archives(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(kept) = self.code_sessions.kept_archives.clone() else {
            return;
        };
        if self.code_sessions.operation.is_some() {
            return;
        }
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.code_sessions.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let operation = self.code_sessions.begin();
        let generation = self.generation;
        let listed = kept.refs.join(", ");
        cx.spawn_in(window, async move |view, cx| {
            let result: Result<Option<Option<crate::code_sessions::KeptArchives>>> = async {
                let detail = format!("These archive refs are the only recorded copy of work that was not committed: {listed}. Deleting them cannot be undone.");
                let prompt = cx.update(|window, cx| {
                    window.prompt(
                        PromptLevel::Warning,
                        "Delete the kept worktree archives?",
                        Some(detail.as_str()),
                        &["Keep archives", "Delete archives"],
                        cx,
                    )
                })?;
                if prompt.await? != 1 {
                    return Ok(None);
                }
                let task = view.update(cx, |view, _| {
                    anyhow::ensure!(
                        view.generation == generation
                            && view.code_sessions.operation == Some(operation)
                            && view.code_sessions.kept_archives.as_ref() == Some(&kept),
                        "The kept archives changed before they could be discarded"
                    );
                    let params = discard_params(&kept)?;
                    Ok(view.executor.spawn(async move {
                        client
                            .request::<ThreadDeleteResponse>(method::THREAD_DELETE, params.clone())
                            .await
                            .map(|response| (params, response))
                    }))
                })??;
                let (params, response) = task.await.context("Discarding the archives stopped")??;
                let reviewed = accept_delete(&params, &response)?;
                Ok(Some(reviewed))
            }
            .await;
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation || view.code_sessions.operation != Some(operation) {
                    return;
                }
                view.code_sessions.operation = None;
                match result {
                    Ok(None) => {}
                    Ok(Some(None)) => {
                        view.code_sessions.kept_archives = None;
                        view.code_sessions.notice =
                            Some("Kept worktree archives were deleted.".into());
                    }
                    Ok(Some(Some(remaining))) => {
                        view.code_sessions.kept_archives = Some(remaining);
                        view.code_sessions.error = Some(
                            "Some worktree archives are still kept. Review them before trying again."
                                .into(),
                        );
                    }
                    Err(error) => {
                        view.code_sessions.error = Some(crate::code_sessions::error_message(&error))
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    fn finish_code_delete(
        &mut self,
        thread_id: &str,
        response: ThreadDeleteResponse,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let request = match delete_params(thread_id) {
            Ok(request) => request,
            Err(error) => {
                self.code_sessions.error = Some(error.to_string());
                return;
            }
        };
        match accept_delete(&request, &response) {
            Ok(kept) => {
                remove_thread(&mut self.threads, thread_id);
                self.code_search.remove_thread(thread_id);
                self.drafts.remove(thread_id);
                if self
                    .conversation
                    .as_ref()
                    .is_some_and(|conversation| conversation.transcript.thread.id == thread_id)
                {
                    self.conversation = None;
                    self.composer
                        .update(cx, |state, cx| state.set_value(String::new(), window, cx));
                }
                self.code_sessions.renaming = None;
                self.code_sessions.kept_archives = kept;
                self.code_sessions.notice = Some(if self.code_sessions.kept_archives.is_some() {
                    "Session deleted. Review the kept worktree archives before discarding them."
                        .into()
                } else {
                    "Session deleted.".into()
                });
            }
            Err(error) => self.code_sessions.error = Some(error.to_string()),
        }
    }

    fn open_thread(&self) -> Option<ThreadSummary> {
        self.conversation
            .as_ref()
            .map(|conversation| conversation.transcript.thread.clone())
    }

    fn store_thread(&mut self, thread: ThreadSummary) {
        if let Some(conversation) = &mut self.conversation {
            if conversation.transcript.thread.id == thread.id {
                conversation.transcript.thread = thread.clone();
            }
        }
        self.code_search.replace_thread(&thread);
        let _ = replace_thread(&mut self.threads, thread);
    }

    pub(super) fn render_code_session_actions(
        &self,
        palette: Palette,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> gpui::AnyElement {
        let Some(thread) = self.open_thread() else {
            return div().into_any_element();
        };
        let caps = self.capabilities.clone().unwrap_or_default();
        let idle = self.session_idle(&thread.id);
        let mut row = div()
            .w_full()
            .max_w(px(self.contracts.frame.content_width))
            .flex()
            .flex_col()
            .gap_2();
        if let Some(error) = &self.code_sessions.error {
            row = row.child(gpui::text!(error.clone()));
        }
        if let Some(notice) = &self.code_sessions.notice {
            row = row.child(gpui::text!(notice.clone()));
        }
        if self.code_sessions.renaming.as_deref() == Some(thread.id.as_str()) {
            row = row
                .child(
                    Input::new(&self.code_title)
                        .aria_label("Session title")
                        .disabled(self.code_sessions.operation.is_some()),
                )
                .child(self.button(
                    "save-code-title",
                    "Save title",
                    UiAction::SaveCodeRename,
                    palette,
                    cx,
                ))
                .child(self.button(
                    "cancel-code-title",
                    "Cancel title",
                    UiAction::CancelCodeRename,
                    palette,
                    cx,
                ));
        } else if caps.thread_rename && idle && thread.status != ThreadStatus::Archived {
            row = row.child(self.button(
                "rename-code-session",
                "Rename",
                UiAction::BeginCodeRename,
                palette,
                cx,
            ));
        }
        if caps.thread_unarchive && thread.status == ThreadStatus::Archived {
            row = row.child(self.button(
                "unarchive-code-session",
                "Unarchive",
                UiAction::UnarchiveCode,
                palette,
                cx,
            ));
        } else if idle && thread.status != ThreadStatus::Archived {
            row = row.child(self.button(
                "archive-code-session",
                "Archive",
                UiAction::ArchiveCode,
                palette,
                cx,
            ));
        }
        if caps.thread_delete && idle {
            row = row.child(self.button(
                "delete-code-session",
                "Delete session",
                UiAction::DeleteCode,
                palette,
                cx,
            ));
        }
        if let Some(kept) = &self.code_sessions.kept_archives {
            row = row
                .child(gpui::text!(format!(
                    "Kept worktree archives: {}",
                    kept.refs.join(", ")
                )))
                .child(self.button(
                    "discard-code-archives",
                    "Discard kept archives",
                    UiAction::DiscardCodeArchives,
                    palette,
                    cx,
                ));
        }
        if thread.status == ThreadStatus::Archived {
            row = row.child(gpui::text!(
                "This session is archived. Unarchive it before sending another message."
            ));
        } else if !idle {
            row = row.child(gpui::text!(
                "Stop the turn before renaming, archiving or deleting this session."
            ));
        }
        let _ = window;
        row.into_any_element()
    }
}
