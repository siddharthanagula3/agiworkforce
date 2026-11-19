use agiworkforce_protocol::developer_session::*;
use anyhow::{ensure, Context, Result};
use std::{collections::HashSet, path::Path};

#[derive(Default)]
pub struct CodeWorktrees {
    pub visible: bool,
    pub root: Option<DeveloperWorkspaceIdentity>,
    pub list: Option<ManagedWorktreeListResponse>,
    pub operation: Option<uuid::Uuid>,
    pub mutating: bool,
    pub uncertain: bool,
    pub error: Option<String>,
    pub notice: Option<String>,
    pub created: Option<WorktreeCreateResponse>,
    pub archives: Vec<WorktreeArchive>,
    pub apply_plan: Option<agiworkforce_protocol::worktree_apply::WorktreeApplyPlan>,
    pub apply_result: Option<agiworkforce_protocol::worktree_apply::WorktreeApplyResult>,
    pub apply_path: Option<String>,
    pub apply_visible: bool,
    pub apply_uncertain: bool,
}

pub fn validate_worktree(
    root: &DeveloperWorkspaceIdentity,
    tree: &ManagedWorktreeSummary,
) -> Result<()> {
    let repository = Path::new(&tree.repository_root);
    let checkout = Path::new(&tree.path);
    ensure!(
        !root.root_key.is_empty() && Path::new(&root.cwd).is_absolute(),
        "The coding folder has no verified identity"
    );
    ensure!(
        repository.is_absolute() && checkout.is_absolute() && checkout != repository,
        "The worktree paths are invalid"
    );
    ensure!(
        !tree.id.is_empty()
            && tree.id.chars().all(|c| c.is_ascii_hexdigit())
            && !tree.base_commit.is_empty(),
        "The worktree identity is invalid"
    );
    ensure!(
        tree.thread
            .as_ref()
            .is_none_or(|thread| tree.thread_id.as_deref() == Some(thread.id.as_str())),
        "The worktree's session identity is inconsistent"
    );
    ensure!(
        !tree.missing || !tree.active,
        "A missing worktree was reported active"
    );
    if let WorktreeStartPoint::Ref { name } = &tree.start {
        ensure!(!name.trim().is_empty(), "The worktree has no starting ref");
    }
    Ok(())
}

pub fn validate_archive(expected: &str, archive: &WorktreeArchive) -> Result<()> {
    ensure!(
        !expected.is_empty()
            && archive.worktree_id == expected
            && archive
                .snapshot_ref
                .strip_prefix("refs/")
                .is_some_and(|name| !name.is_empty())
            && !archive.snapshot_commit.is_empty(),
        "The runtime returned a different or incomplete archive receipt"
    );
    Ok(())
}

impl CodeWorktrees {
    pub fn can_create(&self) -> bool {
        self.root.as_ref().is_some_and(|root| {
            self.list.as_ref().is_some_and(|list| {
                list.worktrees
                    .first()
                    .is_none_or(|tree| Path::new(&root.cwd).starts_with(&tree.repository_root))
            })
        })
    }
    pub fn begin(&mut self, mutating: bool) -> Result<uuid::Uuid> {
        ensure!(
            self.operation.is_none(),
            "Wait for the current worktree operation"
        );
        ensure!(!mutating || !self.uncertain, "Reopen the coding folder before another worktree change; the previous result is unknown");
        let id = uuid::Uuid::new_v4();
        self.operation = Some(id);
        self.mutating = mutating;
        self.error = None;
        if mutating {
            self.notice = None;
        }
        Ok(id)
    }

    pub fn accept_list(
        &mut self,
        root: DeveloperWorkspaceIdentity,
        list: ManagedWorktreeListResponse,
    ) -> Result<()> {
        ensure!(
            !root.root_key.is_empty() && Path::new(&root.cwd).is_absolute(),
            "The coding folder has no verified identity"
        );
        ensure!(
            list.keep > 0,
            "The runtime returned an invalid worktree keep count"
        );
        ensure!(
            self.root.as_ref().is_none_or(|previous| previous == &root),
            "The coding folder identity changed; reopen it"
        );
        let mut ids = HashSet::new();
        let mut paths = HashSet::new();
        for tree in &list.worktrees {
            validate_worktree(&root, tree)?;
            ensure!(
                ids.insert(&tree.id) && paths.insert(&tree.path),
                "The runtime repeated a worktree"
            );
        }
        if let Some(first) = list.worktrees.first() {
            ensure!(
                list.worktrees
                    .iter()
                    .all(|tree| tree.repository_root == first.repository_root),
                "The runtime mixed repositories in one worktree list"
            );
            ensure!(
                Path::new(&root.cwd).starts_with(&first.repository_root)
                    || list
                        .worktrees
                        .iter()
                        .any(|tree| Path::new(&root.cwd).starts_with(&tree.path)),
                "The worktree list does not include this coding folder's repository"
            );
        }
        self.root = Some(root);
        self.list = Some(list);
        Ok(())
    }

    pub fn selected(&self, id: &str) -> Result<&ManagedWorktreeSummary> {
        self.list
            .as_ref()
            .and_then(|list| list.worktrees.iter().find(|tree| tree.id == id))
            .context("Refresh the worktree list before choosing this checkout")
    }

    pub fn accept_created(
        &mut self,
        start: &WorktreeStartPoint,
        created: WorktreeCreateResponse,
    ) -> Result<()> {
        ensure!(
            &created.worktree.start == start,
            "The runtime created a worktree from another starting point"
        );
        validate_worktree(
            self.root
                .as_ref()
                .context("Reload the coding folder identity")?,
            &created.worktree,
        )?;
        ensure!(
            Path::new(
                &self
                    .root
                    .as_ref()
                    .context("Reload the coding folder identity")?
                    .cwd
            )
            .starts_with(&created.worktree.repository_root),
            "Create worktrees from the original repository folder"
        );
        ensure!(
            !self
                .list
                .as_ref()
                .is_some_and(|list| list.worktrees.iter().any(|tree| tree.id
                    == created.worktree.id
                    || tree.path == created.worktree.path)),
            "The runtime returned an existing worktree as newly created"
        );
        let mut ids = HashSet::new();
        for archive in &created.archived {
            validate_archive(&archive.worktree_id, archive)?;
            ensure!(
                archive.worktree_id != created.worktree.id && ids.insert(&archive.worktree_id),
                "The new worktree was archived or an archive was repeated"
            );
        }
        self.notice = Some(
            "Worktree created on this device. Open it to start or resume its coding session."
                .into(),
        );
        self.created = Some(created);
        Ok(())
    }

    pub fn accept_pin(
        &mut self,
        reviewed: &ManagedWorktreeSummary,
        pinned: bool,
        result: ManagedWorktreeSummary,
    ) -> Result<()> {
        validate_worktree(
            self.root
                .as_ref()
                .context("Reload the coding folder identity")?,
            &result,
        )?;
        ensure!(
            result.id == reviewed.id
                && result.path == reviewed.path
                && result.repository_root == reviewed.repository_root
                && result.pinned == pinned,
            "The runtime acknowledged a different worktree or pin setting"
        );
        let row = self
            .list
            .as_mut()
            .and_then(|list| list.worktrees.iter_mut().find(|row| row.id == reviewed.id))
            .context("The selected worktree is no longer listed")?;
        *row = result;
        self.notice = Some(
            if pinned {
                "Worktree pinned. Automatic cleanup will keep it."
            } else {
                "Worktree unpinned. It may be archived by later cleanup."
            }
            .into(),
        );
        Ok(())
    }
}
