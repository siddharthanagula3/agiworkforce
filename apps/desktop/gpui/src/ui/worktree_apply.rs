use super::*;
use agiworkforce_protocol::{developer_session::CheckpointFileStatus, worktree_apply::*};

fn outcome_label(outcome: WorktreeApplyOutcome, uncertain: bool) -> &'static str {
    match outcome {
        WorktreeApplyOutcome::Applied => "Applied",
        WorktreeApplyOutcome::Skipped => "Skipped",
        WorktreeApplyOutcome::Conflict => "Kept: local changes",
        WorktreeApplyOutcome::Blocked => "Kept: protected or unsupported",
        WorktreeApplyOutcome::Failed if uncertain => "Needs inspection",
        WorktreeApplyOutcome::Failed => "Not applied",
    }
}

impl Desktop {
    pub(super) fn review_worktree_apply(
        &mut self,
        id: String,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.loading
            || self.code_busy()
            || self.code_worktrees.operation.is_some()
            || !self
                .capabilities
                .as_ref()
                .is_some_and(|caps| caps.worktree_apply_review)
        {
            return;
        }
        let params = match self.code_worktrees.apply_review_params(&id) {
            Ok(params) => params,
            Err(error) => {
                self.code_worktrees.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.code_worktrees.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let operation = match self.code_worktrees.begin(false) {
            Ok(operation) => operation,
            Err(_) => return,
        };
        self.code_worktrees.apply_visible = true;
        self.code_worktrees.apply_plan = None;
        self.code_worktrees.apply_result = None;
        self.code_worktrees.apply_path = None;
        self.code_worktrees.notice = None;
        self.focus.focus(window, cx);
        let generation = self.generation;
        let sent = params.clone();
        let task = self.executor.spawn(async move {
            client
                .request::<WorktreeApplyPlan>(method::WORKTREE_APPLY_PLAN, sent)
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Preparing the worktree review stopped")
                .and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation || view.code_worktrees.operation != Some(operation)
                {
                    return;
                }
                view.code_worktrees.operation = None;
                if let Err(error) =
                    result.and_then(|plan| view.code_worktrees.accept_apply_plan(&params, plan))
                {
                    view.code_worktrees.error = Some(crate::code_settings::error_message(&error));
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn commit_worktree_apply(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.code_busy() || self.loading {
            return;
        }
        let params = match self.code_worktrees.apply_commit_params() {
            Ok(params) => params,
            Err(error) => {
                self.code_worktrees.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let Some(reviewed) = self.code_worktrees.apply_plan.clone() else {
            return;
        };
        let target = match self.code_worktrees.selected(&params.worktree_id) {
            Ok(tree) => tree.repository_root.clone(),
            Err(_) => return,
        };
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.code_worktrees.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let ready = reviewed
            .files
            .iter()
            .filter(|file| file.state == WorktreeApplyFileState::Ready)
            .collect::<Vec<_>>();
        let deleted = ready
            .iter()
            .filter(|file| file.status == CheckpointFileStatus::Deleted)
            .count();
        let added = ready
            .iter()
            .filter(|file| file.status == CheckpointFileStatus::Added)
            .count();
        let shortened = ready
            .iter()
            .filter(|file| {
                file.before
                    .iter()
                    .chain(&file.after)
                    .any(|content| content.truncated)
            })
            .count();
        let detail = format!("Apply {} reviewed file changes from worktree {} to {:?}: create {added}, replace {}, delete {deleted}. {shortened} file previews are shortened. Executable flags shown in the review apply to this user. Git staging stays unchanged. Source and destination versions are checked again. If an I/O failure occurs after some files change, results and available original copies will be shown; inspect them before trying again.", ready.len(), params.worktree_id, target, ready.len() - deleted - added);
        let operation = match self.code_worktrees.begin(true) {
            Ok(operation) => operation,
            Err(error) => {
                self.code_worktrees.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        self.focus.focus(window, cx);
        let answer = window.prompt(
            PromptLevel::Warning,
            "Apply these changes to the original folder?",
            Some(&detail),
            &["Keep reviewing", "Apply reviewed changes"],
            cx,
        );
        let generation = self.generation;
        cx.spawn_in(window, async move |view, cx| {
            let mut sent = false;
            let result: Result<Option<WorktreeApplyResult>> = async {
                if answer.await? != 1 { return Ok(None); }
                view.read_with(cx, |view, _| {
                    anyhow::ensure!(view.generation == generation && view.code_worktrees.operation == Some(operation) && view.code_worktrees.apply_plan.as_ref() == Some(&reviewed) && !view.submitting && !view.conversation.as_ref().is_some_and(Conversation::is_running), "The worktree review or running session changed during confirmation");
                    Ok::<_, anyhow::Error>(())
                })??;
                sent = true;
                let request = params.clone();
                let task = view.update(cx, |view, _| view.executor.spawn(async move {
                    let first = client.request::<WorktreeApplyResultPage>(method::WORKTREE_APPLY_COMMIT, request.clone()).await?;
                    crate::code_worktree_apply::collect_apply_receipt(&client, &request, &reviewed, Some(first)).await
                }))?;
                Ok(Some(task.await.context("Applying the reviewed worktree stopped")??))
            }.await;
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation || view.code_worktrees.operation != Some(operation) { return; }
                view.code_worktrees.operation = None;
                view.code_worktrees.mutating = false;
                let result = result.and_then(|result| match result {
                    Some(result) => { view.code_worktrees.accept_apply_result(&params, result)?; view.code_worktrees.notice = Some("Apply operation finished. Review the result for each file below.".into()); Ok(()) },
                    None => Ok(()),
                });
                if let Err(error) = result {
                    let refused = crate::code_worktree_apply::clean_refusal(&params, &error);
                    view.code_worktrees.uncertain |= sent && !refused;
                    view.code_worktrees.apply_uncertain |= sent && !refused;
                    view.code_worktrees.error = Some(format!("{}\n{}", crate::code_settings::error_message(&error), if refused { "No file was applied by this request. Review the worktree again before applying." } else { "The result was not confirmed. Inspect the original folder and reconnect before another change; this request is not retried automatically." }));
                    if refused { view.code_worktrees.apply_plan = None; view.code_worktrees.apply_path = None; }
                }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    pub(super) fn read_worktree_apply_result(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.code_worktrees.operation.is_some()
            || !self.code_worktrees.apply_uncertain
            || self.code_worktrees.apply_result.is_some()
        {
            return;
        }
        let Some(plan) = self.code_worktrees.apply_plan.clone() else {
            return;
        };
        let params = WorktreeApplyCommitParams {
            root_key: plan.root_key.clone(),
            worktree_id: plan.worktree_id.clone(),
            plan_id: plan.plan_id.clone(),
        };
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.code_worktrees.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let operation = match self.code_worktrees.begin(false) {
            Ok(operation) => operation,
            Err(_) => return,
        };
        self.focus.focus(window, cx);
        let generation = self.generation;
        let requested = params.clone();
        let task = self.executor.spawn(async move {
            crate::code_worktree_apply::collect_apply_receipt(&client, &requested, &plan, None)
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Reading the apply receipt stopped")
                .and_then(|result| result);
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation || view.code_worktrees.operation != Some(operation)
                {
                    return;
                }
                view.code_worktrees.operation = None;
                if let Err(error) = result
                    .and_then(|result| view.code_worktrees.accept_apply_result(&params, result))
                {
                    view.code_worktrees.error = Some(format!(
                        "The apply receipt could not be confirmed. {}",
                        crate::code_settings::error_message(&error)
                    ));
                } else {
                    view.code_worktrees.notice = Some(
                        "Apply receipt loaded. Check each file's result before another change."
                            .into(),
                    );
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn render_worktree_apply(
        &self,
        palette: Palette,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        let state = &self.code_worktrees;
        let mut panel = div()
            .w_full()
            .min_w_0()
            .max_w(px(self.contracts.frame.content_width))
            .flex()
            .flex_col()
            .gap_3()
            .child(gpui::text!("Apply worktree changes"));
        if state.operation.is_none() {
            panel = panel.child(self.button(
                "back-from-worktree-apply",
                "Back to worktrees",
                UiAction::BackFromWorktreeApply,
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
            panel = panel.child(gpui::text!(if state.mutating {
                "Waiting for the reviewed apply operation…"
            } else {
                "Preparing the worktree review…"
            }));
        }
        if state.uncertain {
            panel = panel.child(gpui::text!("Some results need inspection. Copy the receipt and any recovery paths before closing or reconnecting."));
        }
        if state.apply_uncertain && state.apply_result.is_none() && state.operation.is_none() {
            panel = panel.child(self.button(
                "read-worktree-apply-result",
                "Check apply receipt",
                UiAction::ReadWorktreeApplyResult,
                palette,
                cx,
            ));
        }
        if let Some(result) = &state.apply_result {
            panel = panel.child(self.button(
                "copy-worktree-apply-result",
                "Copy apply receipt and recovery paths",
                UiAction::CopyWorktreeApplyResult,
                palette,
                cx,
            ));
            for file in &result.files {
                let mut row = div()
                    .id(SharedString::from(format!("apply-result:{}", file.path)))
                    .w_full()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .gap_2()
                    .child(gpui::text!(format!(
                        "{} · {:?}",
                        outcome_label(file.outcome, file.uncertain),
                        file.path
                    )));
                if let Some(reason) = &file.reason {
                    row = row.child(gpui::text!(reason.clone()));
                }
                for path in &file.recovery_paths {
                    row = row.child(gpui::text!(format!("Retained copy: {path}")));
                }
                panel = panel.child(row);
            }
        }
        let Some(plan) = &state.apply_plan else {
            return panel;
        };
        panel = panel.child(gpui::text!(format!(
            "Worktree {} · reviewed source {}",
            plan.worktree_id, plan.source_revision
        )));
        if let Ok(tree) = state.selected(&plan.worktree_id) {
            panel = panel.child(gpui::text!(format!(
                "Original folder: {}",
                tree.repository_root
            )));
        }
        if plan.files.is_empty() {
            return panel.child(gpui::text!(
                "This worktree has no file changes relative to its starting snapshot."
            ));
        }
        if state.operation.is_none()
            && state.apply_result.is_none()
            && !state.uncertain
            && !self.code_busy()
            && plan
                .files
                .iter()
                .any(|file| file.state == WorktreeApplyFileState::Ready)
        {
            panel = panel.child(self.button(
                "commit-worktree-apply",
                "Apply reviewed changes…",
                UiAction::CommitWorktreeApply,
                palette,
                cx,
            ));
        }
        panel = panel.child(gpui::text!(if state.apply_result.is_some() { "These are the versions captured for this operation. Inspect the original folder to check any later edits." } else { "Review each file before applying. Local conflicts and protected paths are kept. Binary files show their byte counts and content revisions; shortened text previews do not include every byte." }));
        for file in &plan.files {
            let planned = match file.state {
                WorktreeApplyFileState::Ready => "Will apply",
                WorktreeApplyFileState::Unchanged => "Already matches",
                WorktreeApplyFileState::Conflict => "Local changes kept",
                WorktreeApplyFileState::Blocked => "Protected or unsupported",
            };
            let label = state
                .apply_result
                .as_ref()
                .and_then(|result| result.files.iter().find(|result| result.path == file.path))
                .map_or(planned, |result| {
                    outcome_label(result.outcome, result.uncertain)
                });
            panel = panel.child(self.button(
                SharedString::from(format!("apply-file:{}", file.path)),
                format!("{label} · {:?}", file.path),
                UiAction::SelectWorktreeApplyFile(file.path.clone()),
                palette,
                cx,
            ));
        }
        let Some(file) = state
            .apply_path
            .as_ref()
            .and_then(|path| plan.files.iter().find(|file| &file.path == path))
        else {
            return panel;
        };
        panel = panel.child(gpui::text!(format!("File: {:?}", file.path)));
        if let Some(reason) = &file.reason {
            panel = panel.child(gpui::text!(reason.clone()));
        }
        let mut versions = div().w_full().min_w_0().flex().gap_3();
        if window.bounds().size.width < px(self.contracts.frame.compact_breakpoint) {
            versions = versions.flex_col();
        }
        for (label, content, executable) in [
            ("Original file", &file.before, file.executable_before),
            ("Reviewed worktree file", &file.after, file.executable_after),
        ] {
            let mut version = div()
                .id(SharedString::from(format!("apply-version:{label}")))
                .flex_1()
                .min_w_0()
                .flex()
                .flex_col()
                .gap_2()
                .child(gpui::text!(label));
            if let Some(content) = content {
                version = version.child(gpui::text!(format!(
                    "{} bytes · content {} · executable for this user: {}",
                    content.bytes,
                    content.revision,
                    executable == Some(true)
                )));
                if let Some(text) = &content.text {
                    let input = window.use_keyed_state(
                        SharedString::from(format!(
                            "apply-text:{}:{}:{label}",
                            plan.plan_id, file.path
                        )),
                        cx,
                        EditorState::new,
                    );
                    if input.read(cx).value().as_str() != text {
                        input.update(cx, |input, cx| input.set_value(text.clone(), window, cx));
                    }
                    version = version.child(crate::editor::source_editor(
                        &input,
                        label,
                        true,
                        window.bounds().size.height / 3.,
                    ));
                    if content.truncated {
                        version = version.child(gpui::text!("Text preview shortened."));
                    }
                } else {
                    version = version.child(gpui::text!("Binary content."));
                }
            } else {
                version = version.child(gpui::text!(
                    if file.state == WorktreeApplyFileState::Blocked {
                        "Content is not opened for this path."
                    } else {
                        "File absent in this version."
                    }
                ));
            }
            versions = versions.child(version);
        }
        panel.child(versions)
    }
}
