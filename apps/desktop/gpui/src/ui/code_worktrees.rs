use super::*;
use agiworkforce_protocol::developer_session::{
    DeveloperWorkspaceIdentity, ManagedWorktreeCreateParams, ManagedWorktreeListResponse,
    ManagedWorktreeSummary, WorktreeArchive, WorktreeCreateResponse, WorktreeIdParams,
    WorktreePinParams, WorktreeStartPoint,
};

pub(super) enum CodeWorktreeMutation {
    Create(WorktreeStartPoint),
    Pin(String, bool),
    Archive(String),
}

pub(super) enum WorktreeFolderTarget {
    Checkout,
    Repository,
}

enum MutationResult {
    Created(WorktreeStartPoint, Box<WorktreeCreateResponse>),
    Pinned(
        Box<ManagedWorktreeSummary>,
        bool,
        Box<ManagedWorktreeSummary>,
    ),
    Archived(String, WorktreeArchive),
}

impl Desktop {
    pub(super) fn open_code_worktrees(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if !self
            .capabilities
            .as_ref()
            .is_some_and(|caps| caps.managed_worktrees)
        {
            return;
        }
        self.code_worktrees.visible = true;
        self.code_settings.visible = false;
        self.editor.visible = false;
        self.terminal.visible = false;
        self.terminal.epoch = uuid::Uuid::new_v4();
        self.terminal_poll_task = None;
        self.changes.visible = false;
        self.cloud.visible = false;
        self.account.visible = false;
        self.models = None;
        self.history_viewport.older();
        self.focus.focus(window, cx);
        self.read_code_worktrees(cx);
        cx.notify();
    }

    fn read_code_worktrees(&mut self, cx: &mut Context<Self>) {
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.code_worktrees.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let id = match self.code_worktrees.begin(false) {
            Ok(id) => id,
            Err(_) => return,
        };
        let generation = self.generation;
        let task = self.executor.spawn(async move {
            let root = client
                .request::<DeveloperWorkspaceIdentity>(
                    method::WORKSPACE_IDENTITY,
                    serde_json::json!({}),
                )
                .await?;
            let list = client
                .request::<ManagedWorktreeListResponse>(
                    method::MANAGED_WORKTREE_LIST,
                    serde_json::json!({}),
                )
                .await?;
            Ok::<_, anyhow::Error>((root, list))
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Reading worktrees stopped")
                .and_then(|result| result);
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation || view.code_worktrees.operation != Some(id) {
                    return;
                }
                view.code_worktrees.operation = None;
                if let Err(error) =
                    result.and_then(|(root, list)| view.code_worktrees.accept_list(root, list))
                {
                    view.code_worktrees.error = Some(crate::code_settings::error_message(&error));
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn change_code_worktree(
        &mut self,
        mutation: CodeWorktreeMutation,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.loading || self.code_busy() || self.code_worktrees.operation.is_some() {
            return;
        }
        if !self.code_worktrees.can_create() {
            self.code_worktrees.error = Some("Open the original repository to manage its worktrees. This runtime is limited to the current checkout.".into());
            cx.notify();
            return;
        }
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.code_worktrees.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let Some(list) = self.code_worktrees.list.as_ref() else {
            return;
        };
        let selected = match &mutation {
            CodeWorktreeMutation::Create(_) => None,
            CodeWorktreeMutation::Pin(id, _) | CodeWorktreeMutation::Archive(id) => {
                match self.code_worktrees.selected(id) {
                    Ok(tree) => Some(tree.clone()),
                    Err(error) => {
                        self.code_worktrees.error = Some(error.to_string());
                        cx.notify();
                        return;
                    }
                }
            }
        };
        let (title, detail, accept) = match &mutation {
            CodeWorktreeMutation::Create(start) => (
                "Create an isolated worktree?",
                format!("{} The host keeps {} recent worktrees. Creating another may archive older inactive, unpinned checkouts after saving their Git-visible contents. Ignored files or nested repositories prevent archival. The host may copy files selected by the repository's worktree include rules. Unsaved editor text is not included. Setup scripts will not run automatically.", match start { WorktreeStartPoint::WorkingTree => "Start with the original folder's committed and uncommitted files included by Git.", WorktreeStartPoint::Ref { .. } => "Start from the latest local commit in a detached checkout." }, list.keep),
                "Create worktree",
            ),
            CodeWorktreeMutation::Pin(_, pinned) => (
                if *pinned { "Pin this worktree?" } else { "Unpin this worktree?" },
                format!("{} {}", selected.as_ref().map(|tree| tree.path.as_str()).unwrap_or_default(), if *pinned { "Automatic cleanup will keep this checkout." } else { "Later worktree creation may archive this inactive checkout when it falls outside the host's keep count." }),
                if *pinned { "Pin worktree" } else { "Unpin worktree" },
            ),
            CodeWorktreeMutation::Archive(_) => {
                if selected.as_ref().is_some_and(|tree| tree.active) { self.code_worktrees.error = Some("Stop the runtime serving this worktree before archiving it.".into()); cx.notify(); return; }
                ("Archive and remove this checkout?", format!("The checkout at {} will be removed after the host records its Git-visible files on an archive ref. Its saved session remains. Ignored files or nested repositories stop removal. Keep the returned archive ref to recover the recorded files. Work inside another program must finish first.", selected.as_ref().map(|tree| tree.path.as_str()).unwrap_or_default()), "Archive worktree")
            },
        };
        let id = match self.code_worktrees.begin(true) {
            Ok(id) => id,
            Err(error) => {
                self.code_worktrees.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        self.focus.focus(window, cx);
        let answer = window.prompt(
            PromptLevel::Warning,
            title,
            Some(&detail),
            &["Cancel", accept],
            cx,
        );
        let generation = self.generation;
        cx.spawn_in(window, async move |view, cx| {
            let mut sent = false;
            let result: Result<Option<MutationResult>> = async {
                if answer.await? != 1 { return Ok(None); }
                view.read_with(cx, |view, _| {
                    anyhow::ensure!(view.generation == generation && view.code_worktrees.operation == Some(id), "The coding folder changed during confirmation");
                    if let Some(selected) = &selected { anyhow::ensure!(view.code_worktrees.selected(&selected.id)? == selected, "The worktree changed during confirmation"); }
                    Ok::<_, anyhow::Error>(())
                })??;
                sent = true;
                let task = view.update(cx, |view, _| view.executor.spawn(async move {
                    match mutation {
                        CodeWorktreeMutation::Create(start) => {
                            let result = client.request::<WorktreeCreateResponse>(method::MANAGED_WORKTREE_CREATE, ManagedWorktreeCreateParams { start: start.clone(), label: None }).await?;
                            Ok::<_, anyhow::Error>(MutationResult::Created(start, Box::new(result)))
                        },
                        CodeWorktreeMutation::Pin(worktree_id, pinned) => {
                            let reviewed = selected.context("Reload the worktree before pinning")?;
                            let result = client.request::<ManagedWorktreeSummary>(method::WORKTREE_PIN, WorktreePinParams { worktree_id, pinned }).await?;
                            Ok(MutationResult::Pinned(Box::new(reviewed), pinned, Box::new(result)))
                        },
                        CodeWorktreeMutation::Archive(worktree_id) => {
                            let result = client.request::<WorktreeArchive>(method::WORKTREE_DELETE, WorktreeIdParams { worktree_id: worktree_id.clone() }).await?;
                            Ok(MutationResult::Archived(worktree_id, result))
                        },
                    }
                }))?;
                Ok(Some(task.await.context("The worktree operation stopped")??))
            }.await;
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation || view.code_worktrees.operation != Some(id) { return; }
                view.code_worktrees.operation = None;
                view.code_worktrees.mutating = false;
                let changed = result.as_ref().is_ok_and(Option::is_some);
                let result = result.and_then(|result| match result {
                    Some(MutationResult::Created(start, created)) => view.code_worktrees.accept_created(&start, *created),
                    Some(MutationResult::Pinned(reviewed, pinned, result)) => view.code_worktrees.accept_pin(&reviewed, pinned, *result),
                    Some(MutationResult::Archived(expected, archive)) => {
                        crate::code_worktrees::validate_archive(&expected, &archive)?;
                        view.code_worktrees.notice = Some("Checkout removed after archiving its recorded files. The archive receipt is shown below.".into());
                        view.code_worktrees.archives.push(archive);
                        Ok(())
                    },
                    None => Ok(()),
                });
                if let Err(error) = result {
                    view.code_worktrees.uncertain |= sent;
                    view.code_worktrees.error = Some(format!("{}\nInspect the worktree list and reopen the coding folder before another change. The request is not retried automatically.", crate::code_settings::error_message(&error)));
                } else if changed { view.read_code_worktrees(cx); }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    pub(super) fn open_managed_worktree(
        &mut self,
        id: String,
        target: WorktreeFolderTarget,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.code_worktrees.operation.is_some() || !self.can_change_code_folder(window, cx) {
            return;
        }
        let selected = match self.code_worktrees.selected(&id) {
            Ok(tree) if !tree.missing => tree.clone(),
            _ => return,
        };
        let generation = self.generation;
        let (path, title, action) = match target {
            WorktreeFolderTarget::Checkout => (
                selected.path.clone(),
                "Open this worktree for coding?",
                "Open worktree",
            ),
            WorktreeFolderTarget::Repository => (
                selected.repository_root.clone(),
                "Open the original repository for coding?",
                "Open repository",
            ),
        };
        let detail = format!("The current coding runtime and terminal jobs will stop. The CLI will start in {path}. Repository hooks and MCP configuration may run. This grants only that folder; existing tool approvals and sandbox rules remain in force.");
        let answer = window.prompt(
            PromptLevel::Warning,
            title,
            Some(&detail),
            &["Cancel", action],
            cx,
        );
        self.focus.focus(window, cx);
        cx.spawn_in(window, async move |view, cx| {
            if !matches!(answer.await, Ok(1)) {
                return;
            }
            let _ = view.update_in(cx, |view, window, cx| {
                if view.generation != generation
                    || view.code_worktrees.selected(&id).ok() != Some(&selected)
                    || !view.can_change_code_folder(window, cx)
                {
                    return;
                }
                match consent_timestamp_ms() {
                    Ok(consent) => {
                        view.save_draft(cx);
                        view.connect(PathBuf::from(path), consent, cx);
                    }
                    Err(error) => {
                        view.code_worktrees.error = Some(error.to_string());
                        cx.notify();
                    }
                }
            });
        })
        .detach();
    }

    pub(super) fn render_code_worktrees(
        &self,
        palette: Palette,
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
            .child(gpui::text!("Worktrees"));
        if state.operation.is_none() {
            panel = panel
                .child(self.button(
                    "back-from-worktrees",
                    "Back to conversation",
                    UiAction::CloseCodeWorktrees,
                    palette,
                    cx,
                ))
                .child(self.button(
                    "refresh-worktrees",
                    "Refresh worktrees",
                    UiAction::CodeWorktrees,
                    palette,
                    cx,
                ));
            if state.apply_plan.is_some() {
                panel = panel.child(self.button(
                    "show-worktree-apply",
                    "View worktree apply review and results",
                    UiAction::ShowWorktreeApply,
                    palette,
                    cx,
                ));
            }
        }
        if let Some(error) = &state.error {
            panel = panel.child(gpui::text!(error.clone()));
        }
        if let Some(notice) = &state.notice {
            panel = panel.child(gpui::text!(notice.clone()));
        }
        if state.uncertain {
            panel = panel.child(gpui::text!("A previous change was not confirmed. Inspect the list, then reopen the coding folder before making another change."));
        }
        if state.operation.is_some() {
            panel = panel.child(gpui::text!(if state.mutating {
                "Waiting for the worktree change…"
            } else {
                "Reading worktrees…"
            }));
        }
        if let Some(list) = &state.list {
            panel = panel.child(gpui::text!(format!("Isolated checkouts share this repository's Git history. The host keeps {} recent checkouts; pinned or active checkouts are retained.", list.keep)));
            if state.operation.is_none()
                && !state.uncertain
                && !self.code_busy()
                && state.can_create()
            {
                panel = panel
                    .child(self.button(
                        "create-worktree-head",
                        "Create from latest commit…",
                        UiAction::CreateWorktree(WorktreeStartPoint::Ref {
                            name: "HEAD".into(),
                        }),
                        palette,
                        cx,
                    ))
                    .child(self.button(
                        "create-worktree-working",
                        "Create with current folder changes…",
                        UiAction::CreateWorktree(WorktreeStartPoint::WorkingTree),
                        palette,
                        cx,
                    ));
            }
            if list.worktrees.is_empty() {
                panel = panel.child(gpui::text!("No managed worktrees for this repository yet."));
            }
            for tree in &list.worktrees {
                let mut row = div()
                    .id(SharedString::from(format!("worktree:{}", tree.id)))
                    .w_full()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .gap_2()
                    .child(gpui::text!(tree
                        .label
                        .clone()
                        .unwrap_or_else(|| format!("Worktree {}", tree.id))))
                    .child(gpui::text!(tree.path.clone()))
                    .child(gpui::text!(format!(
                        "{}{}{}",
                        if tree.pinned { "Pinned · " } else { "" },
                        if tree.active {
                            "Runtime active · "
                        } else {
                            ""
                        },
                        if tree.missing {
                            "Checkout missing"
                        } else {
                            "Checkout available"
                        }
                    )));
                if let Some(thread) = &tree.thread {
                    row = row.child(gpui::text!(format!("Session: {}", thread.title)));
                }
                if state.operation.is_none() {
                    let current = state.root.as_ref().is_some_and(|root| {
                        std::path::Path::new(&root.cwd).starts_with(&tree.path)
                    });
                    if !tree.missing && !current {
                        row = row.child(self.button(
                            SharedString::from(format!("open-worktree:{}", tree.id)),
                            "Open for coding…",
                            UiAction::OpenWorktree(tree.id.clone()),
                            palette,
                            cx,
                        ));
                    }
                    if !state.can_create() {
                        row = row.child(gpui::text!("This runtime is scoped to this checkout. Open the original repository to create, pin, or archive worktrees."))
                            .child(self.button(SharedString::from(format!("open-worktree-repository:{}", tree.id)), "Open original repository…", UiAction::OpenWorktreeRepository(tree.id.clone()), palette, cx));
                    }
                    if !state.uncertain && !self.code_busy() && state.can_create() {
                        if !tree.active
                            && !tree.missing
                            && state
                                .root
                                .as_ref()
                                .is_some_and(|root| root.cwd == tree.repository_root)
                            && self
                                .capabilities
                                .as_ref()
                                .is_some_and(|caps| caps.worktree_apply_review)
                        {
                            row = row.child(self.button(
                                SharedString::from(format!("review-worktree-apply:{}", tree.id)),
                                "Review changes for original folder…",
                                UiAction::ReviewWorktreeApply(tree.id.clone()),
                                palette,
                                cx,
                            ));
                        }
                        row = row.child(self.button(
                            SharedString::from(format!("pin-worktree:{}", tree.id)),
                            if tree.pinned { "Unpin…" } else { "Pin…" },
                            UiAction::PinWorktree(tree.id.clone(), !tree.pinned),
                            palette,
                            cx,
                        ));
                        if !tree.active {
                            row = row.child(self.button(
                                SharedString::from(format!("archive-worktree:{}", tree.id)),
                                "Archive and remove checkout…",
                                UiAction::ArchiveWorktree(tree.id.clone()),
                                palette,
                                cx,
                            ));
                        }
                    }
                }
                panel = panel.child(row);
            }
            if let Some(script) = &list.setup_script {
                panel = panel.child(gpui::text!(format!(
                    "Setup script detected: {}. It has not been run by this panel.",
                    script.path
                )));
            }
        }
        if let Some(created) = &state.created {
            for file in &created.copied_files {
                panel = panel.child(gpui::text!(format!("Copied by the include rules: {file}")));
            }
            for refused in &created.refused_files {
                panel = panel.child(gpui::text!(format!(
                    "Not copied: {} · {}",
                    refused.path, refused.reason
                )));
            }
            for failure in &created.cleanup_failures {
                panel = panel.child(gpui::text!(format!(
                    "Older checkout retained: {} · {}",
                    failure.worktree_id, failure.reason
                )));
            }
            for receipt in &created.archived {
                panel = panel.child(gpui::text!(format!(
                    "Archived {} · {} · {}",
                    receipt.worktree_id, receipt.snapshot_ref, receipt.snapshot_commit
                )));
            }
        }
        for receipt in &state.archives {
            panel = panel.child(gpui::text!(format!(
                "Archived {} · {} · {}",
                receipt.worktree_id, receipt.snapshot_ref, receipt.snapshot_commit
            )));
        }
        panel
    }
}
