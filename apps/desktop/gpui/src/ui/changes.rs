use super::*;
use crate::changes::{diff_markdown, validate_outcome, Changes};
use agiworkforce_protocol::developer_session::{
    CheckpointDiffResponse, CheckpointListResponse, CheckpointSectionsResponse,
    CheckpointTurnParams, ThreadIdParams,
};

impl Desktop {
    pub(super) fn open_changes(&mut self, cx: &mut Context<Self>) {
        if self.loading
            || self.changes.applying
            || !self
                .capabilities
                .as_ref()
                .is_some_and(|caps| caps.checkpoints && caps.managed_worktrees)
        {
            return;
        }
        let Some(thread_id) = self
            .conversation
            .as_ref()
            .map(|conversation| conversation.transcript.thread.id.clone())
        else {
            return;
        };
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.fail(error, cx);
                return;
            }
        };
        self.changes = Changes {
            visible: true,
            thread_id: Some(thread_id.clone()),
            ..Default::default()
        };
        self.code_settings.visible = false;
        self.code_worktrees.visible = false;
        let operation = self.changes.begin();
        let generation = self.generation;
        self.history_viewport.older();
        let task = self.executor.spawn(async move {
            client
                .request::<CheckpointListResponse>(
                    method::CHECKPOINT_LIST,
                    ThreadIdParams { thread_id },
                )
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Loading changes stopped")
                .and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation || view.changes.operation != Some(operation) {
                    return;
                }
                view.changes.operation = None;
                if let Err(error) = result.and_then(|list| view.changes.accept_list(list)) {
                    view.changes.error = Some(format!("Changes could not be loaded: {error:#}"));
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn review_turn(&mut self, turn_id: String, cx: &mut Context<Self>) {
        if self.changes.operation.is_some()
            || !self.changes.visible
            || !self.changes.list.as_ref().is_some_and(|list| {
                list.turns
                    .iter()
                    .any(|turn| turn.turn_id == turn_id && turn.finished_at.is_some())
            })
        {
            return;
        }
        let Some(thread_id) = self.changes.thread_id.clone() else {
            return;
        };
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.fail(error, cx);
                return;
            }
        };
        let operation = self.changes.begin();
        self.changes.diff = None;
        self.changes.selected_path = None;
        self.changes.notice = None;
        let generation = self.generation;
        let requested = turn_id.clone();
        let task = self.executor.spawn(async move {
            client
                .request::<CheckpointDiffResponse>(
                    method::CHECKPOINT_DIFF,
                    CheckpointTurnParams { thread_id, turn_id },
                )
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Loading the diff stopped")
                .and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation || view.changes.operation != Some(operation) {
                    return;
                }
                view.changes.operation = None;
                if let Err(error) =
                    result.and_then(|diff| view.changes.accept_diff(&requested, diff))
                {
                    view.changes.error =
                        Some(format!("This checkpoint could not be reviewed: {error:#}"));
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn change_section(
        &mut self,
        path: String,
        hunk: Option<u32>,
        stage: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.code_busy()
            || self.loading
            || self.changes.operation.is_some()
            || !self.changes.visible
        {
            return;
        }
        let mut params = match self.changes.sections(&path, hunk, true) {
            Ok(params) => params,
            Err(error) => {
                self.changes.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        if !self
            .conversation
            .as_ref()
            .is_some_and(|conversation| conversation.transcript.thread.id == params.thread_id)
        {
            return;
        }
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.fail(error, cx);
                return;
            }
        };
        let method = if stage {
            method::CHECKPOINT_STAGE
        } else {
            method::CHECKPOINT_REVERT
        };
        let operation = self.changes.begin();
        self.changes.applying = true;
        self.changes.notice = None;
        let generation = self.generation;
        cx.spawn_in(window, async move |view, cx| {
            let result: Result<Option<CheckpointSectionsResponse>> = async {
                let preview_client = client.clone();
                let preview_params = params.clone();
                let task = view.update(cx, |view, _| view.executor.spawn(async move { preview_client.request::<CheckpointSectionsResponse>(method, preview_params).await }))?;
                let preview = task.await.context("Checking the selected changes stopped")??;
                validate_outcome(&params, &preview)?;
                anyhow::ensure!(preview.conflicted.is_empty(), "{}", preview.conflicted.iter().map(|conflict| format!("{}: {}", conflict.path, conflict.reason)).collect::<Vec<_>>().join("\n"));
                if !stage {
                    let section = hunk.map_or_else(|| "this file's checkpoint changes".to_owned(), |index| format!("section {}", index + 1));
                    let detail = format!("This removes {section} from {path} in the working folder. The saved conversation stays available. Later edits that conflict will be left in place. Copy any work you want to keep before continuing.");
                    let prompt = cx.update(|window, cx| window.prompt(PromptLevel::Warning, "Revert these changes?", Some(&detail), &["Keep changes", "Revert changes"], cx))?;
                    if prompt.await? != 1 { return Ok(None); }
                }
                view.read_with(cx, |view, _| {
                    anyhow::ensure!(view.generation == generation && view.changes.operation == Some(operation) && view.conversation.as_ref().is_some_and(|conversation| conversation.transcript.thread.id == params.thread_id && !conversation.is_running()), "The session changed or started work before this decision");
                    Ok::<_, anyhow::Error>(())
                })??;
                params.preview = false;
                let apply_params = params.clone();
                let task = view.update(cx, |view, _| view.executor.spawn(async move { client.request::<CheckpointSectionsResponse>(method, apply_params).await }))?;
                let response = task.await.context("The change operation stopped")??;
                validate_outcome(&params, &response)?;
                Ok(Some(response))
            }.await;
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation || view.changes.operation != Some(operation) { return; }
                view.changes.operation = None;
                view.changes.applying = false;
                match result {
                    Ok(Some(response)) => {
                        view.changes.notice = Some(format!("{} {} file(s).", if stage { "Staged" } else { "Reverted" }, response.applied.len()));
                        if !response.conflicted.is_empty() { view.changes.error = Some(response.conflicted.iter().map(|conflict| format!("{} was left unchanged: {}", conflict.path, conflict.reason)).collect::<Vec<_>>().join("\n")); }
                    },
                    Ok(None) => {},
                    Err(error) => view.changes.error = Some(format!("The change could not be confirmed. Refresh and check the working folder before retrying. {error:#}")),
                }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    pub(super) fn render_changes(
        &self,
        window: &mut Window,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        let mut panel = div()
            .w_full()
            .min_w_0()
            .max_w(px(self.contracts.frame.content_width))
            .flex()
            .flex_col()
            .gap_3()
            .child(gpui::text!("Changes"));
        if !self.changes.applying {
            panel = panel.child(self.button(
                "close-changes",
                "Back to conversation",
                UiAction::CloseChanges,
                palette,
                cx,
            ));
            if self.changes.operation.is_none() {
                panel = panel.child(self.button(
                    "refresh-changes",
                    "Refresh changes",
                    UiAction::Changes,
                    palette,
                    cx,
                ));
            }
        }
        if let Some(error) = &self.changes.error {
            panel = panel.child(
                div()
                    .text_color(rgb(palette.danger))
                    .child(gpui::text!(error.clone())),
            );
        }
        if let Some(notice) = &self.changes.notice {
            panel = panel.child(gpui::text!(notice.clone()));
        }
        if self.changes.operation.is_some() {
            return panel.child(gpui::text!(if self.changes.applying {
                "Checking the selected changes…"
            } else {
                "Loading changes…"
            }));
        }
        let Some(list) = &self.changes.list else {
            return panel;
        };
        if !list.available {
            return panel.child(gpui::text!(list.unavailable_reason.clone().unwrap_or_else(
                || "This folder has no checkpoint history available.".into()
            )));
        }
        panel = panel.child(gpui::text!("Per-turn snapshots include changes made by tools and commands. They record the workspace at that time; later edits may conflict with staging or reverting."));
        if list.turns.is_empty() {
            panel = panel.child(gpui::text!(
                "No turn checkpoints have been recorded in this session."
            ));
        }
        for turn in list.turns.iter().rev() {
            if turn.finished_at.is_some() {
                panel = panel.child(self.button(
                    SharedString::from(format!("checkpoint:{}", turn.turn_id)),
                    format!("Turn {} · {} changed file(s)", turn.index, turn.files.len()),
                    UiAction::ReviewTurn(turn.turn_id.clone()),
                    palette,
                    cx,
                ));
            } else {
                panel = panel.child(gpui::text!(
                    id = SharedString::from(format!("recording-turn:{}", turn.turn_id)),
                    format!(
                        "Turn {} is still recording. Refresh after it finishes.",
                        turn.index
                    )
                ));
            }
            for path in &turn.skipped_files {
                panel = panel.child(gpui::text!(
                    id = SharedString::from(format!("skipped-file:{}:{path}", turn.turn_id)),
                    format!("Outside this checkpoint: {path}")
                ));
            }
        }
        let Some(diff) = &self.changes.diff else {
            return panel;
        };
        if diff.files.is_empty() {
            return panel.child(gpui::text!("This turn recorded no file changes."));
        }
        for file in &diff.files {
            panel = panel.child(self.button(
                SharedString::from(format!("changed-file:{}", file.path)),
                file.path.clone(),
                UiAction::ReviewFile(file.path.clone()),
                palette,
                cx,
            ));
        }
        let Some(file) = diff
            .files
            .iter()
            .find(|file| Some(&file.path) == self.changes.selected_path.as_ref())
        else {
            return panel;
        };
        panel = panel.child(gpui::text!(format!("{} · {:?}", file.path, file.status)));
        let idle = !self.code_busy() && !self.loading && self.client().is_ok();
        if idle {
            panel = panel
                .child(self.button(
                    "stage-file",
                    "Stage file changes",
                    UiAction::ChangeSection(file.path.clone(), None, true),
                    palette,
                    cx,
                ))
                .child(self.button(
                    "revert-file",
                    "Revert file changes…",
                    UiAction::ChangeSection(file.path.clone(), None, false),
                    palette,
                    cx,
                ));
        }
        if file.binary {
            panel = panel.child(gpui::text!(
                "Binary changes are reviewed and applied as a whole file."
            ));
        }
        for hunk in &file.hunks {
            panel = panel.child(rich_text::markdown(
                SharedString::from(format!(
                    "checkpoint-diff:{}:{}:{}:{}",
                    self.generation, diff.turn_id, file.path, hunk.index
                )),
                diff_markdown(&hunk.text),
                &self.contracts,
                window,
                cx,
            ));
            if idle {
                panel = panel
                    .child(self.button(
                        SharedString::from(format!("stage-hunk:{}", hunk.index)),
                        "Stage section",
                        UiAction::ChangeSection(file.path.clone(), Some(hunk.index), true),
                        palette,
                        cx,
                    ))
                    .child(self.button(
                        SharedString::from(format!("revert-hunk:{}", hunk.index)),
                        "Revert section…",
                        UiAction::ChangeSection(file.path.clone(), Some(hunk.index), false),
                        palette,
                        cx,
                    ));
            }
        }
        panel
    }
}
