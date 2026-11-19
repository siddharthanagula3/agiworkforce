use super::*;
use crate::code_composer_drafts::{composer_after_show, read_params, CodeDraftAction};
use agiworkforce_protocol::code_drafts::{
    CodeDraftChange, CodeDraftSnapshot, CodeDraftWriteResponse,
};
use agiworkforce_protocol::developer_session::DeveloperWorkspaceIdentity;

impl Desktop {
    pub(super) fn load_code_draft(
        &mut self,
        thread_id: String,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if !self
            .capabilities
            .as_ref()
            .is_some_and(|caps| caps.code_drafts)
        {
            return;
        }
        let client = match self.client() {
            Ok(client) => client,
            Err(_) => return,
        };
        let operation = uuid::Uuid::new_v4();
        if !self.code_draft.begin_load(operation) {
            self.code_draft.defer_load(&thread_id);
            return;
        }
        let generation = self.generation;
        let thread_for_retry = thread_id.clone();
        let task = self.executor.spawn(async move {
            let root: DeveloperWorkspaceIdentity = client
                .request(method::WORKSPACE_IDENTITY, serde_json::json!({}))
                .await?;
            let params = read_params(&root.root_key, &thread_id)?;
            let snapshot: CodeDraftSnapshot =
                client.request(method::CODE_DRAFT_READ, params).await?;
            anyhow::Ok(snapshot)
        });
        cx.spawn_in(window, async move |view, cx| {
            let result = task.await.context("Reading the coding draft stopped");
            let _ = view.update_in(cx, |view, window, cx| {
                if view.generation != generation {
                    return;
                }
                let Ok(Ok(snapshot)) = result else {
                    if view.code_draft.cancel(operation) {
                        let retry = view.code_draft.clear_requested()
                            && view.code_draft.allow_clear_reload()
                            && view.conversation.as_ref().is_some_and(|conversation| {
                                conversation.transcript.thread.id == thread_for_retry
                            });
                        if retry {
                            view.load_code_draft(thread_for_retry, window, cx);
                        } else {
                            view.follow_deferred_load(window, cx);
                        }
                    }
                    cx.notify();
                    return;
                };
                let open_thread = view
                    .conversation
                    .as_ref()
                    .map(|conversation| conversation.transcript.thread.id.clone())
                    .unwrap_or_default();
                let Some(action) = view
                    .code_draft
                    .complete_load(operation, snapshot, &open_thread)
                else {
                    cx.notify();
                    return;
                };
                let same_thread = view
                    .code_draft
                    .current_thread()
                    .is_some_and(|thread| thread == open_thread);
                view.apply_code_draft_action(action, same_thread, window, cx);
                view.follow_deferred_load(window, cx);
                cx.notify();
            });
        })
        .detach();
    }

    pub(super) fn save_code_draft(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.cloud.visible
            || !self
                .capabilities
                .as_ref()
                .is_some_and(|caps| caps.code_drafts)
        {
            return;
        }
        let Some(thread) = self
            .conversation
            .as_ref()
            .map(|conversation| conversation.transcript.thread.id.clone())
        else {
            return;
        };
        let text = self.composer.read(cx).value().to_string();
        self.code_draft.edit(&thread, &text);
        self.schedule_code_draft(window, cx);
    }

    pub(super) fn clear_code_draft(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(thread) = self
            .conversation
            .as_ref()
            .map(|conversation| conversation.transcript.thread.id.clone())
        else {
            return;
        };
        self.code_draft_task = None;
        self.code_draft.request_clear(&thread);
        if self.code_draft.needs_load() {
            self.load_code_draft(thread, window, cx);
            return;
        }
        self.flush_code_draft(window, cx);
    }

    fn schedule_code_draft(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.code_draft_task = None;
        if self.cloud.visible || !self.code_draft.waiting_for_pause() {
            return;
        }
        let generation = self.generation;
        let delay = std::time::Duration::from_millis(self.contracts.draft_save_debounce_ms);
        self.code_draft_task = Some(cx.spawn_in(window, async move |view, cx| {
            cx.background_executor().timer(delay).await;
            let _ = view.update_in(cx, |view, window, cx| {
                if view.generation == generation {
                    view.flush_code_draft(window, cx);
                }
            });
        }));
    }

    fn flush_code_draft(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if !self.code_draft.clear_requested() {
            if let Some(thread) = self
                .conversation
                .as_ref()
                .map(|conversation| conversation.transcript.thread.id.clone())
            {
                let text = self.composer.read(cx).value().to_string();
                self.code_draft.edit(&thread, &text);
            }
        }
        let request = match self.code_draft.next_write(self.contracts.draft_max_length) {
            Ok(Some(request)) => request,
            _ => return,
        };
        self.write_code_draft(request, window, cx);
    }

    fn apply_code_draft_action(
        &mut self,
        action: CodeDraftAction,
        same_thread: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if same_thread {
            let current = self.composer.read(cx).value().to_string();
            let next = composer_after_show(&action, &current);
            if next != current {
                self.composer
                    .update(cx, |state, cx| state.set_value(next, window, cx));
            }
        }
        match action {
            CodeDraftAction::Pause if same_thread => self.schedule_code_draft(window, cx),
            CodeDraftAction::Clear => self.flush_code_draft(window, cx),
            CodeDraftAction::Commit => self.flush_code_draft(window, cx),
            _ => {}
        }
    }

    pub(super) fn commit_open_draft(
        &mut self,
        next_thread: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.code_draft_task = None;
        let request = match self
            .code_draft
            .commit_before_switch(next_thread, self.contracts.draft_max_length)
        {
            Ok(Some(request)) => request,
            _ => return,
        };
        self.write_code_draft(request, window, cx);
    }

    fn follow_deferred_load(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(thread) = self.code_draft.take_deferred_load() else {
            return;
        };
        if self
            .conversation
            .as_ref()
            .is_some_and(|conversation| conversation.transcript.thread.id == thread)
        {
            self.load_code_draft(thread, window, cx);
        }
    }

    fn write_code_draft(
        &mut self,
        request: agiworkforce_protocol::code_drafts::CodeDraftWriteParams,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if !self
            .capabilities
            .as_ref()
            .is_some_and(|caps| caps.code_drafts)
        {
            return;
        }
        let client = match self.client() {
            Ok(client) => client,
            Err(_) => return,
        };
        let operation = uuid::Uuid::new_v4();
        if !self.code_draft.begin(operation, &request) {
            return;
        }
        let generation = self.generation;
        let sent = request.clone();
        let task = self.executor.spawn(async move {
            client
                .request::<CodeDraftWriteResponse>(method::CODE_DRAFT_WRITE, request)
                .await
        });
        cx.spawn_in(window, async move |view, cx| {
            let result = task.await.context("Saving the coding draft stopped");
            let _ =
                view.update_in(cx, |view, window, cx| {
                    if view.generation != generation {
                        return;
                    }
                    let Ok(Ok(response)) = result else {
                        if !view.code_draft.cancel(operation) {
                            return;
                        }
                        let thread = sent.thread_id.clone();
                        let retry_clear = matches!(sent.change, CodeDraftChange::Clear)
                            || view.code_draft.clear_requested();
                        if retry_clear && view.code_draft.allow_clear_reload() {
                            view.code_draft.request_clear(&thread);
                            view.code_draft.invalidate();
                            if view.conversation.as_ref().is_some_and(|conversation| {
                                conversation.transcript.thread.id == thread
                            }) {
                                view.load_code_draft(thread, window, cx);
                            }
                        } else if view
                            .conversation
                            .as_ref()
                            .is_some_and(|conversation| conversation.transcript.thread.id == thread)
                        {
                            view.schedule_code_draft(window, cx);
                        }
                        cx.notify();
                        return;
                    };
                    let composer_thread = view
                        .conversation
                        .as_ref()
                        .map(|conversation| conversation.transcript.thread.id.clone());
                    let composer = composer_thread
                        .as_ref()
                        .filter(|thread| *thread == response.current.thread_id.as_str())
                        .map(|_| view.composer.read(cx).value().to_string());
                    let Some(action) =
                        view.code_draft
                            .finished(operation, response, composer.as_deref())
                    else {
                        return;
                    };
                    let same_thread = view
                        .code_draft
                        .current_thread()
                        .is_some_and(|thread| composer_thread.as_deref() == Some(thread));
                    view.apply_code_draft_action(action, same_thread, window, cx);
                    view.follow_deferred_load(window, cx);
                    cx.notify();
                });
        })
        .detach();
    }
}
