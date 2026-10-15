//! Worktrees a host makes for one coding session each.
//!
//! Each lives in its own reserved directory under the host's worktree root:
//!
//! ```text
//! <root>/<repository key>/<id>/worktree.json   the marker: who owns it, where it started
//! <root>/<repository key>/<id>/checkout/       the detached git worktree itself
//! ```
//!
//! The marker sits beside the checkout rather than in it, so it never shows up
//! as a change the session made. A host serving a checkout locks it with
//! `git worktree lock` when it starts, which is what "active" means to
//! cleanup; a lock whose host process is gone no longer counts.
//!
//! Host git runs no filter the user configured globally, Git LFS included, so
//! a checkout made here holds LFS pointer files rather than their content.

use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use tokio::process::Command;

use crate::basic::list_worktree_entries;
use crate::checkpoint::Workspace;
use crate::config_guard::{verify_repository_config, ConfigUse};
use crate::git::{common_dir, hex, linked_git_dir, Git};
use crate::include::{copy_included_files, path_inside};
use crate::runner::{CommandRunner, PinnedRunner};
use crate::snapshot::{
    commit_tree, diff_trees, is_special_mode, resolve_ref, snapshot_tree, tree_entries, tree_of,
    update_ref, worktree_blobs, write_paths_from_tree, ChangeStatus,
};

pub use crate::include::IncludeOutcome;

pub const DEFAULT_KEEP: usize = 15;
/// The most worktrees a user may ask cleanup to keep. Each holds a full
/// checkout, so a larger number is a disk problem rather than a preference.
pub const MAX_KEEP: usize = 100;
pub const MARKER_FILE: &str = "worktree.json";
pub const CHECKOUT_DIR: &str = "checkout";
/// The per-project setup script, relative to the repository root.
pub const SETUP_SCRIPT: &str = ".agiworkforce/worktree-setup";
const SETTINGS_FILE: &str = "settings.json";
const APPROVALS_FILE: &str = "setup-approvals.json";
pub(crate) const ARCHIVE_REF_PREFIX: &str = "refs/agiworkforce/worktree-archive/";
/// Archives of worktrees no session claimed sit under this owner, so deleting
/// a session never takes them with it.
const UNOWNED_ARCHIVE: &str = "unowned";
const ID_ATTEMPTS: usize = 8;
const ID_HEX_LENGTH: usize = 8;
const REPOSITORY_KEY_HASH_LENGTH: usize = 12;
const LOCK_REASON: &str = "in use by an AGI app-server";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum StartPoint {
    /// A commit-ish such as `HEAD` or `origin/main`, checked out detached.
    Ref { name: String },
    /// HEAD plus every uncommitted change in the repository, tracked or not.
    WorkingTree,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeMarker {
    pub id: String,
    pub repository_root: PathBuf,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub start: StartPoint,
    /// The commit the checkout is detached at.
    pub base_commit: String,
    /// The tree the session started from: the base commit's tree, or that
    /// tree plus the uncommitted changes it was given. Apply-to-local diffs
    /// against this, so carried-over changes are not applied twice.
    pub start_tree: String,
    pub created_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub setup_exit_code: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub setup_ran_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SetupScript {
    pub path: PathBuf,
    pub sha256: String,
    pub approved: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagedWorktree {
    pub marker: WorktreeMarker,
    pub checkout: PathBuf,
    /// Locked by a host serving it, or by someone else; either way in use.
    pub active: bool,
    /// The checkout directory is gone, so only the marker remains.
    pub missing: bool,
    pub head: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateOutcome {
    pub worktree: ManagedWorktree,
    pub included: IncludeOutcome,
    pub setup: Option<SetupScript>,
    /// Worktrees removed to stay within the keep count, archived first.
    pub cleaned: Vec<ArchiveOutcome>,
    /// Older worktrees cleanup could not archive, each with the reason. The
    /// new worktree exists either way; these are left exactly as they were.
    pub cleanup_failures: Vec<(String, String)>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CleanupOutcome {
    pub archived: Vec<ArchiveOutcome>,
    pub failed: Vec<(String, String)>,
}

/// A setup script ready to run: the command, and the private copy of the
/// exact bytes the user approved that it runs.
#[derive(Debug)]
pub struct SetupRun {
    pub command: Command,
    pub script: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArchiveOutcome {
    pub id: String,
    pub snapshot_ref: String,
    pub snapshot_commit: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ApplyOutcome {
    pub applied: Vec<String>,
    pub skipped: Vec<String>,
    pub conflicted: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct Settings {
    #[serde(default = "default_keep")]
    keep: usize,
}

fn default_keep() -> usize {
    DEFAULT_KEEP
}

/// Worktrees of one repository under one host's worktree root.
///
/// Every git it runs is pinned: against the repository, to the git directory
/// the host resolved when it opened the workspace; against a checkout, to the
/// private git directory the repository keeps for that worktree. A `.git` a
/// sandboxed command plants or rewrites therefore never decides which
/// configuration the host's git reads.
pub struct WorktreeManager<'a> {
    runner: &'a dyn CommandRunner,
    repo: PinnedRunner<'a>,
    common_dir: PathBuf,
    root: PathBuf,
    repository: PathBuf,
}

impl<'a> WorktreeManager<'a> {
    /// The worktrees of `workspace`'s repository, kept under `root`.
    pub fn open(
        runner: &'a dyn CommandRunner,
        root: impl Into<PathBuf>,
        workspace: &Workspace,
    ) -> Self {
        Self {
            runner,
            repo: workspace.runner(runner),
            common_dir: common_dir(workspace.git_dir()),
            root: root.into(),
            repository: workspace.top().to_path_buf(),
        }
    }

    /// A runner pinned to the managed checkout at `checkout`.
    fn checkout_runner(&self, checkout: &Path) -> Result<PinnedRunner<'a>> {
        let git_dir = linked_git_dir(&self.common_dir, checkout).ok_or_else(|| {
            anyhow!(
                "{} is not a worktree of this repository",
                checkout.display()
            )
        })?;
        Ok(
            PinnedRunner::new(self.runner, git_dir, checkout.to_path_buf())
                .trusting(self.repo.trusts_repository_config()),
        )
    }

    pub fn repository(&self) -> &Path {
        &self.repository
    }

    /// Newest worktrees this repository keeps before cleanup archives older
    /// ones. Read from the worktree root's `settings.json`, default 15.
    pub fn keep(&self) -> usize {
        read_keep(&self.root)
    }

    fn repository_dir(&self) -> PathBuf {
        let name: String = self
            .repository
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default()
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                    c
                } else {
                    '-'
                }
            })
            .collect();
        let digest = Sha256::digest(self.repository.to_string_lossy().as_bytes());
        let digest = hex(&digest);
        let key = &digest[..REPOSITORY_KEY_HASH_LENGTH];
        self.root.join(format!("{name}-{key}"))
    }

    fn reserved_dir(&self, id: &str) -> Result<PathBuf> {
        if id.len() != ID_HEX_LENGTH || !id.chars().all(|c| c.is_ascii_hexdigit()) {
            anyhow::bail!("{id:?} is not a worktree id");
        }
        Ok(self.repository_dir().join(id))
    }

    pub async fn create(&self, start: StartPoint, label: Option<String>) -> Result<CreateOutcome> {
        let setup = self.setup_script()?;
        let git = Git::at(&self.repo, &self.repository);
        let base_commit = match &start {
            StartPoint::Ref { name } => {
                if name.starts_with('-') || name.trim().is_empty() {
                    anyhow::bail!("{name:?} is not a ref a worktree can start from");
                }
                let spec = format!("{name}^{{commit}}");
                git.text(["rev-parse", "--verify", spec.as_str()])
                    .await
                    .map_err(|_| anyhow!("{name} does not name a commit in this repository"))?
            }
            StartPoint::WorkingTree => git
                .head()
                .await?
                .ok_or_else(|| anyhow!("this repository has no commit to start a worktree from"))?,
        };

        let (id, reserved) = self.reserve()?;
        let checkout = reserved.join(CHECKOUT_DIR);
        let created = self
            .populate(&id, &reserved, &checkout, start, label, base_commit)
            .await;
        let (marker, included) = match created {
            Ok(created) => created,
            Err(error) => {
                self.discard(&checkout, &reserved).await;
                return Err(error);
            }
        };

        let worktree = self.describe(marker, &HashSet::new()).await;
        let cleanup = self.clean_up(Some(&id)).await;
        Ok(CreateOutcome {
            setup,
            worktree,
            included,
            cleaned: cleanup.archived,
            cleanup_failures: cleanup.failed,
        })
    }

    fn reserve(&self) -> Result<(String, PathBuf)> {
        let parent = self.repository_dir();
        std::fs::create_dir_all(&parent).with_context(|| format!("create {}", parent.display()))?;
        for _ in 0..ID_ATTEMPTS {
            let id = uuid::Uuid::new_v4().simple().to_string()[..ID_HEX_LENGTH].to_string();
            let reserved = parent.join(&id);
            match std::fs::create_dir(&reserved) {
                Ok(()) => return Ok((id, reserved)),
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(error) => {
                    return Err(error).with_context(|| format!("create {}", reserved.display()))
                }
            }
        }
        anyhow::bail!(
            "could not reserve a worktree directory under {}",
            parent.display()
        )
    }

    async fn populate(
        &self,
        id: &str,
        reserved: &Path,
        checkout: &Path,
        start: StartPoint,
        label: Option<String>,
        base_commit: String,
    ) -> Result<(WorktreeMarker, IncludeOutcome)> {
        let base_tree = tree_of(&self.repo, &self.repository, &base_commit).await?;
        let start_tree = match start {
            StartPoint::WorkingTree => {
                snapshot_tree(&self.repo, &self.repository, &reserved.join("start.index")).await?
            }
            StartPoint::Ref { .. } => base_tree.clone(),
        };
        let mut marker = WorktreeMarker {
            id: id.to_string(),
            repository_root: self.repository.clone(),
            label: label
                .map(|label| label.trim().to_string())
                .filter(|l| !l.is_empty()),
            start,
            base_commit: base_commit.clone(),
            start_tree: start_tree.clone(),
            created_at: Utc::now(),
            thread_id: None,
            pinned: false,
            setup_exit_code: None,
            setup_ran_at: None,
        };
        write_marker(reserved, &marker)?;

        verify_repository_config(
            &self.repo,
            &self.repository,
            &self.repository,
            ConfigUse::CONTENT,
        )
        .await?;
        Git::at(&self.repo, &self.repository)
            .ok([
                OsStr::new("worktree"),
                OsStr::new("add"),
                OsStr::new("--detach"),
                OsStr::new("--"),
                checkout.as_os_str(),
                OsStr::new(&base_commit),
            ])
            .await?;
        let _ = std::fs::remove_file(reserved.join("start.index"));

        if start_tree != base_tree {
            let changes = diff_trees(&self.repo, &self.repository, &base_tree, &start_tree).await?;
            let (write, remove): (Vec<_>, Vec<_>) = changes
                .into_iter()
                .partition(|change| change.status != ChangeStatus::Deleted);
            write_paths_from_tree(
                &self.checkout_runner(checkout)?,
                checkout,
                &start_tree,
                &write
                    .into_iter()
                    .map(|change| change.path)
                    .collect::<Vec<_>>(),
                &remove
                    .into_iter()
                    .map(|change| change.path)
                    .collect::<Vec<_>>(),
                &reserved.join("scratch.index"),
            )
            .await?;
        }

        let included = copy_included_files(&self.repo, &self.repository, checkout).await?;
        marker.created_at = Utc::now();
        write_marker(reserved, &marker)?;
        Ok((marker, included))
    }

    /// Remove a checkout and everything git keeps for it. Callers have ruled
    /// out a live lock, so any lock left is stale: it goes first, since git
    /// neither removes nor prunes a locked worktree, and its entry would
    /// otherwise outlive the checkout for good.
    async fn discard(&self, checkout: &Path, reserved: &Path) {
        let git = Git::at(&self.repo, &self.repository);
        let _ = git
            .run(
                [
                    OsStr::new("worktree"),
                    OsStr::new("unlock"),
                    OsStr::new("--"),
                    checkout.as_os_str(),
                ],
                None,
            )
            .await;
        if checkout.exists() {
            let _ = git
                .run(
                    [
                        OsStr::new("worktree"),
                        OsStr::new("remove"),
                        OsStr::new("--force"),
                        OsStr::new("--"),
                        checkout.as_os_str(),
                    ],
                    None,
                )
                .await;
        }
        let _ = std::fs::remove_dir_all(reserved);
        let _ = git.run(["worktree", "prune"], None).await;
    }

    /// Checkouts locked by a live process. A lock this crate wrote names the
    /// host's pid; once that process is gone the lock is stale and the
    /// checkout is free. Any other lock, such as one the user made, holds.
    async fn locked_checkouts(&self) -> HashSet<PathBuf> {
        list_worktree_entries(&self.repo, &self.repository)
            .await
            .map(|entries| {
                entries
                    .into_iter()
                    .filter(|entry| {
                        entry
                            .locked
                            .as_deref()
                            .is_some_and(|reason| match lock_holder(reason) {
                                Some(pid) => process_alive(pid),
                                None => true,
                            })
                    })
                    .map(|entry| canonical(&entry.path))
                    .collect()
            })
            .unwrap_or_default()
    }

    async fn describe(&self, marker: WorktreeMarker, locked: &HashSet<PathBuf>) -> ManagedWorktree {
        let checkout = self.repository_dir().join(&marker.id).join(CHECKOUT_DIR);
        let missing = !checkout.is_dir();
        let head = if missing {
            None
        } else {
            match self.checkout_runner(&checkout) {
                Ok(runner) => Git::at(&runner, &checkout).head().await.ok().flatten(),
                Err(_) => None,
            }
        };
        ManagedWorktree {
            active: locked.contains(&canonical(&checkout)),
            missing,
            head,
            checkout,
            marker,
        }
    }

    /// Every worktree this host made for the repository, newest first.
    pub async fn list(&self) -> Result<Vec<ManagedWorktree>> {
        let dir = self.repository_dir();
        let entries = match std::fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(error).with_context(|| format!("read {}", dir.display())),
        };
        let locked = self.locked_checkouts().await;
        let mut worktrees = Vec::new();
        for entry in entries.flatten() {
            let Ok(marker) = read_marker(&entry.path()) else {
                continue;
            };
            if marker.repository_root != self.repository {
                continue;
            }
            worktrees.push(self.describe(marker, &locked).await);
        }
        worktrees.sort_by(|a, b| b.marker.created_at.cmp(&a.marker.created_at));
        Ok(worktrees)
    }

    pub async fn get(&self, id: &str) -> Result<ManagedWorktree> {
        let reserved = self.reserved_dir(id)?;
        let marker =
            read_marker(&reserved).map_err(|_| anyhow!("no worktree {id} in this repository"))?;
        let locked = self.locked_checkouts().await;
        Ok(self.describe(marker, &locked).await)
    }

    pub async fn set_pinned(&self, id: &str, pinned: bool) -> Result<ManagedWorktree> {
        let reserved = self.reserved_dir(id)?;
        let mut marker = read_marker(&reserved)?;
        marker.pinned = pinned;
        write_marker(&reserved, &marker)?;
        self.get(id).await
    }

    /// Snapshot everything in the checkout, committed or not, to a ref in the
    /// repository, then remove the worktree. The snapshot is what makes the
    /// removal recoverable, so a failure to take it stops the removal.
    pub async fn archive(&self, id: &str) -> Result<ArchiveOutcome> {
        let worktree = self.get(id).await?;
        if worktree.active {
            anyhow::bail!(
                "worktree {id} is in use by a running session; stop that session before removing it"
            );
        }
        let reserved = self.reserved_dir(id)?;
        let owner = worktree
            .marker
            .thread_id
            .as_deref()
            .filter(|thread| crate::checkpoint::is_ref_safe_thread_id(thread))
            .unwrap_or(UNOWNED_ARCHIVE);
        let snapshot_ref = format!("{ARCHIVE_REF_PREFIX}{owner}/{id}");
        let snapshot_commit = if worktree.missing {
            worktree.marker.base_commit.clone()
        } else {
            let tree = snapshot_tree(
                &self.checkout_runner(&worktree.checkout)?,
                &worktree.checkout,
                &reserved.join("archive.index"),
            )
            .await?;
            let parent = worktree
                .head
                .clone()
                .unwrap_or(worktree.marker.base_commit.clone());
            let message = format!(
                "Archive of AGI worktree {id}\n\nEverything the worktree held when it was removed, \
                 committed or not.\n"
            );
            commit_tree(&self.repo, &self.repository, &tree, Some(&parent), &message).await?
        };
        let replaced = resolve_ref(&self.repo, &self.repository, &snapshot_ref).await?;
        update_ref(
            &self.repo,
            &self.repository,
            &snapshot_ref,
            &snapshot_commit,
            replaced.as_deref(),
        )
        .await?;
        self.discard(&worktree.checkout, &reserved).await;
        Ok(ArchiveOutcome {
            id: id.to_string(),
            snapshot_ref,
            snapshot_commit,
        })
    }

    /// Archive the oldest worktrees beyond the keep count. Pinned and active
    /// worktrees are never removed, and neither is `spare`. One that cannot be
    /// archived is reported and left as it is; the rest are still cleaned.
    pub async fn clean_up(&self, spare: Option<&str>) -> CleanupOutcome {
        let keep = self.keep();
        let mut outcome = CleanupOutcome::default();
        let worktrees = match self.list().await {
            Ok(worktrees) => worktrees,
            Err(error) => {
                outcome.failed.push((String::new(), error.to_string()));
                return outcome;
            }
        };
        for (position, worktree) in worktrees.into_iter().enumerate() {
            if position < keep
                || worktree.marker.pinned
                || worktree.active
                || spare == Some(worktree.marker.id.as_str())
            {
                continue;
            }
            match self.archive(&worktree.marker.id).await {
                Ok(archived) => outcome.archived.push(archived),
                Err(error) => outcome
                    .failed
                    .push((worktree.marker.id.clone(), error.to_string())),
            }
        }
        outcome
    }

    /// Release every worktree `thread_id` owned, so another session may claim
    /// it. Returns the ids released.
    pub async fn release_thread(&self, thread_id: &str) -> Result<Vec<String>> {
        let mut released = Vec::new();
        for worktree in self.list().await? {
            if worktree.marker.thread_id.as_deref() != Some(thread_id) {
                continue;
            }
            let reserved = self.reserved_dir(&worktree.marker.id)?;
            let mut marker = worktree.marker;
            marker.thread_id = None;
            write_marker(&reserved, &marker)?;
            released.push(marker.id);
        }
        Ok(released)
    }

    /// Bring the session's changes into the repository's own working tree.
    ///
    /// A file is applied only where the local copy still matches what the
    /// worktree started from; a file already matching the worktree is skipped;
    /// anything else is a conflict and is left exactly as it is. Nothing is
    /// staged. With `preview`, nothing is written.
    pub async fn apply_to_local(&self, id: &str, preview: bool) -> Result<ApplyOutcome> {
        let worktree = self.get(id).await?;
        if worktree.missing {
            anyhow::bail!("worktree {id} no longer has a checkout to apply from");
        }
        let reserved = self.reserved_dir(id)?;
        let session_tree = snapshot_tree(
            &self.checkout_runner(&worktree.checkout)?,
            &worktree.checkout,
            &reserved.join("apply.index"),
        )
        .await?;
        let start_tree = &worktree.marker.start_tree;
        let changes = diff_trees(&self.repo, &self.repository, start_tree, &session_tree).await?;
        if changes.is_empty() {
            return Ok(ApplyOutcome::default());
        }
        let started = tree_entries(&self.repo, &self.repository, start_tree).await?;
        let ended = tree_entries(&self.repo, &self.repository, &session_tree).await?;
        let paths: Vec<String> = changes.iter().map(|change| change.path.clone()).collect();
        let local = worktree_blobs(&self.repo, &self.repository, &paths).await?;

        let mut outcome = ApplyOutcome::default();
        let mut write = Vec::new();
        let mut remove = Vec::new();
        for change in changes {
            let before = started.get(&change.path);
            let after = ended.get(&change.path);
            let special = before.is_some_and(|entry| is_special_mode(&entry.mode))
                || after.is_some_and(|entry| is_special_mode(&entry.mode))
                || path_inside(&self.repository, &change.path).is_err();
            let here = local.get(&change.path);
            let here_exists = self
                .repository
                .join(&change.path)
                .symlink_metadata()
                .is_ok();
            let matches = |entry: Option<&crate::snapshot::TreeEntry>| match entry {
                Some(entry) => here == Some(&entry.oid),
                None => !here_exists,
            };
            if special {
                outcome.conflicted.push(change.path);
            } else if matches(after) {
                outcome.skipped.push(change.path);
            } else if matches(before) {
                if after.is_some() {
                    write.push(change.path.clone());
                } else {
                    remove.push(change.path.clone());
                }
                outcome.applied.push(change.path);
            } else {
                outcome.conflicted.push(change.path);
            }
        }

        if !preview {
            write_paths_from_tree(
                &self.repo,
                &self.repository,
                &session_tree,
                &write,
                &remove,
                &reserved.join("scratch.index"),
            )
            .await?;
        }
        Ok(outcome)
    }

    /// The project's setup script, if it has one, and whether the user has
    /// approved this exact content to run.
    pub fn setup_script(&self) -> Result<Option<SetupScript>> {
        let path = self.repository.join(SETUP_SCRIPT);
        let bytes = match std::fs::read(&path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error).with_context(|| format!("read {}", path.display())),
        };
        let sha256 = hex(&Sha256::digest(&bytes));
        let approved = self
            .approvals()
            .get(&self.repository.to_string_lossy().into_owned())
            .is_some_and(|hashes| hashes.contains(&sha256));
        Ok(Some(SetupScript {
            path,
            sha256,
            approved,
        }))
    }

    fn approvals(&self) -> BTreeMap<String, Vec<String>> {
        std::fs::read(self.root.join(APPROVALS_FILE))
            .ok()
            .and_then(|raw| serde_json::from_slice(&raw).ok())
            .unwrap_or_default()
    }

    /// Build the command that runs the setup script in worktree `id`, after
    /// checking the script still hashes to what the user approved. The
    /// approval is remembered for this content only: any edit asks again.
    ///
    /// The command runs a private copy of the bytes that were hashed, kept
    /// beside the marker where no session can write, so the script cannot be
    /// swapped between the check and the run.
    pub async fn approved_setup_command(
        &self,
        id: &str,
        approved_sha256: &str,
    ) -> Result<SetupRun> {
        let worktree = self.get(id).await?;
        if worktree.missing {
            anyhow::bail!("worktree {id} no longer has a checkout to set up");
        }
        let path = self.repository.join(SETUP_SCRIPT);
        let bytes = match std::fs::read(&path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                anyhow::bail!("this repository has no {SETUP_SCRIPT}")
            }
            Err(error) => return Err(error).with_context(|| format!("read {}", path.display())),
        };
        let sha256 = hex(&Sha256::digest(&bytes));
        if sha256 != approved_sha256 {
            anyhow::bail!(
                "{SETUP_SCRIPT} changed after it was shown to you; review it again before it runs"
            );
        }
        let copy = self.reserved_dir(id)?.join("setup-script");
        let _ = std::fs::remove_file(&copy);
        std::fs::write(&copy, &bytes).with_context(|| format!("write {}", copy.display()))?;
        let mut approvals = self.approvals();
        let hashes = approvals
            .entry(self.repository.to_string_lossy().into_owned())
            .or_default();
        if !hashes.contains(&sha256) {
            hashes.push(sha256);
        }
        std::fs::create_dir_all(&self.root)?;
        std::fs::write(
            self.root.join(APPROVALS_FILE),
            serde_json::to_vec_pretty(&approvals)?,
        )?;

        let mut command = Command::new("sh");
        command
            .arg(&copy)
            .current_dir(&worktree.checkout)
            .env("AGI_WORKTREE_ID", id)
            .env("AGI_WORKTREE_SOURCE", &self.repository);
        Ok(SetupRun {
            command,
            script: copy,
        })
    }

    pub fn record_setup_result(&self, id: &str, exit_code: Option<i32>) -> Result<()> {
        let reserved = self.reserved_dir(id)?;
        let mut marker = read_marker(&reserved)?;
        marker.setup_exit_code = exit_code;
        marker.setup_ran_at = Some(Utc::now());
        write_marker(&reserved, &marker)
    }
}

/// How many of the newest worktrees cleanup keeps under `root`.
pub fn read_keep(root: &Path) -> usize {
    std::fs::read(root.join(SETTINGS_FILE))
        .ok()
        .and_then(|raw| serde_json::from_slice::<Settings>(&raw).ok())
        .map(|settings| settings.keep)
        .unwrap_or(DEFAULT_KEEP)
}

/// Set the keep count for every repository's worktrees under `root`. The next
/// worktree made applies it; nothing is removed by changing it.
pub fn write_keep(root: &Path, keep: usize) -> Result<usize> {
    if !(1..=MAX_KEEP).contains(&keep) {
        anyhow::bail!("keep between 1 and {MAX_KEEP} worktrees");
    }
    std::fs::create_dir_all(root).with_context(|| format!("create {}", root.display()))?;
    let path = root.join(SETTINGS_FILE);
    let staging = root.join(format!("{SETTINGS_FILE}.tmp"));
    std::fs::write(&staging, serde_json::to_vec_pretty(&Settings { keep })?)
        .with_context(|| format!("write {}", staging.display()))?;
    std::fs::rename(&staging, &path).with_context(|| format!("write {}", path.display()))?;
    Ok(keep)
}

/// The marker of the managed worktree whose checkout is `checkout`, if it is
/// one.
pub fn marker_for_checkout(checkout: &Path) -> Option<WorktreeMarker> {
    let checkout = canonical(checkout);
    if checkout.file_name() != Some(OsStr::new(CHECKOUT_DIR)) {
        return None;
    }
    read_marker(checkout.parent()?).ok()
}

/// The managed checkout `path` is in, at its top or anywhere below it. A host
/// started inside a checkout reads this to learn what it serves.
pub fn checkout_containing(path: &Path) -> Option<PathBuf> {
    canonical(path)
        .ancestors()
        .find(|ancestor| marker_for_checkout(ancestor).is_some())
        .map(Path::to_path_buf)
}

/// The pid in a lock reason this crate wrote, `None` for any other lock.
fn lock_holder(reason: &str) -> Option<u32> {
    reason
        .strip_prefix(LOCK_REASON)?
        .trim()
        .strip_prefix("(pid ")?
        .strip_suffix(')')?
        .parse()
        .ok()
}

/// Whether a process with `pid` is running. A process this one cannot signal
/// still exists, so only "no such process" reads as gone.
fn process_alive(pid: u32) -> bool {
    if pid == std::process::id() {
        return true;
    }
    #[cfg(unix)]
    {
        std::process::Command::new("kill")
            .args(["-0", &pid.to_string()])
            .env("LC_ALL", "C")
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .output()
            .map(|output| {
                output.status.success()
                    || !String::from_utf8_lossy(&output.stderr)
                        .to_ascii_lowercase()
                        .contains("no such process")
            })
            .unwrap_or(true)
    }
    #[cfg(windows)]
    {
        std::process::Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/NH", "/FO", "CSV"])
            .stdin(std::process::Stdio::null())
            .output()
            .map(|output| String::from_utf8_lossy(&output.stdout).contains(&format!("\"{pid}\"")))
            .unwrap_or(true)
    }
    #[cfg(not(any(unix, windows)))]
    {
        true
    }
}

/// Record `thread_id` as the one session a checkout belongs to, and lock the
/// checkout so cleanup leaves it alone while this host serves it. A checkout
/// another session already owns is refused.
pub async fn claim_checkout(
    runner: &dyn CommandRunner,
    checkout: &Path,
    thread_id: &str,
) -> Result<WorktreeMarker> {
    let checkout = canonical(checkout);
    let reserved = checkout
        .parent()
        .ok_or_else(|| anyhow!("{} is not a managed worktree", checkout.display()))?;
    let mut marker = read_marker(reserved)?;
    match marker.thread_id.as_deref() {
        Some(owner) if owner != thread_id => {
            anyhow::bail!("This worktree is owned by another session.")
        }
        Some(_) => {}
        None => {
            marker.thread_id = Some(thread_id.to_string());
            write_marker(reserved, &marker)?;
        }
    }
    lock_checkout(runner, &checkout).await;
    Ok(marker)
}

/// Release `checkout` from `thread_id`, so another session may claim it.
/// Returns whether that thread owned it.
pub fn release_checkout(checkout: &Path, thread_id: &str) -> Result<bool> {
    let checkout = canonical(checkout);
    let reserved = checkout
        .parent()
        .ok_or_else(|| anyhow!("{} is not a managed worktree", checkout.display()))?;
    let mut marker = read_marker(reserved)?;
    if marker.thread_id.as_deref() != Some(thread_id) {
        return Ok(false);
    }
    marker.thread_id = None;
    write_marker(reserved, &marker)?;
    Ok(true)
}

/// Lock a checkout for the life of the host serving it. Already locked is
/// fine; a lock left by a host that is no longer running is replaced, so
/// cleanup sees this one as active.
pub async fn lock_checkout(runner: &dyn CommandRunner, checkout: &Path) {
    let checkout = &canonical(checkout);
    let stale = list_worktree_entries(runner, checkout)
        .await
        .ok()
        .and_then(|entries| {
            entries
                .into_iter()
                .find(|entry| canonical(&entry.path) == *checkout)
        })
        .and_then(|entry| entry.locked)
        .and_then(|reason| lock_holder(&reason))
        .is_some_and(|pid| !process_alive(pid));
    if stale {
        unlock_checkout(runner, checkout).await;
    }
    let reason = format!("{LOCK_REASON} (pid {})", std::process::id());
    let _ = Git::at(runner, checkout)
        .run(
            [
                OsStr::new("worktree"),
                OsStr::new("lock"),
                OsStr::new("--reason"),
                OsStr::new(&reason),
                OsStr::new("--"),
                checkout.as_os_str(),
            ],
            None,
        )
        .await;
}

pub async fn unlock_checkout(runner: &dyn CommandRunner, checkout: &Path) {
    let _ = Git::at(runner, checkout)
        .run(
            [
                OsStr::new("worktree"),
                OsStr::new("unlock"),
                OsStr::new("--"),
                checkout.as_os_str(),
            ],
            None,
        )
        .await;
}

fn read_marker(reserved: &Path) -> Result<WorktreeMarker> {
    let raw = std::fs::read(reserved.join(MARKER_FILE))?;
    Ok(serde_json::from_slice(&raw)?)
}

fn write_marker(reserved: &Path, marker: &WorktreeMarker) -> Result<()> {
    let path = reserved.join(MARKER_FILE);
    let staging = reserved.join(format!("{MARKER_FILE}.tmp"));
    std::fs::write(&staging, serde_json::to_vec_pretty(marker)?)
        .with_context(|| format!("write {}", staging.display()))?;
    std::fs::rename(&staging, &path).with_context(|| format!("write {}", path.display()))
}

fn canonical(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::test_support::{git, init_repo};
    use crate::runner::TokioCommandRunner;

    async fn manager<'a>(root: &Path, repo: &Path) -> WorktreeManager<'a> {
        let workspace = Workspace::discover(&TokioCommandRunner, repo)
            .await
            .expect("discover")
            .expect("a repository");
        WorktreeManager::open(&TokioCommandRunner, root, &workspace)
    }

    #[tokio::test]
    async fn a_worktree_starts_detached_in_its_own_marked_directory() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let root = tempfile::tempdir().unwrap();
        let manager = manager(root.path(), repo.path()).await;

        let created = manager
            .create(
                StartPoint::Ref {
                    name: "HEAD".into(),
                },
                Some("try it".into()),
            )
            .await
            .expect("create");

        let checkout = &created.worktree.checkout;
        assert!(checkout.join("README.md").is_file());
        assert!(checkout.parent().unwrap().join(MARKER_FILE).is_file());
        assert_eq!(git(checkout, &["status", "--porcelain"]), "");
        assert_eq!(
            git(checkout, &["rev-parse", "--abbrev-ref", "HEAD"]),
            "HEAD"
        );
        assert_eq!(created.worktree.marker.label.as_deref(), Some("try it"));
        assert_eq!(manager.list().await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn starting_from_the_working_tree_carries_uncommitted_and_untracked_changes() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        std::fs::write(repo.path().join("README.md"), "edited\n").unwrap();
        std::fs::write(repo.path().join("draft.txt"), "draft\n").unwrap();
        let root = tempfile::tempdir().unwrap();
        let manager = manager(root.path(), repo.path()).await;

        let created = manager.create(StartPoint::WorkingTree, None).await.unwrap();

        let checkout = &created.worktree.checkout;
        assert_eq!(
            std::fs::read_to_string(checkout.join("README.md")).unwrap(),
            "edited\n"
        );
        assert_eq!(
            std::fs::read_to_string(checkout.join("draft.txt")).unwrap(),
            "draft\n"
        );
        assert_eq!(git(repo.path(), &["diff", "--cached", "--name-only"]), "");
    }

    #[tokio::test]
    async fn apply_to_local_applies_skips_and_reports_conflicts() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        std::fs::write(repo.path().join("shared.txt"), "base\n").unwrap();
        std::fs::write(repo.path().join("same.txt"), "base\n").unwrap();
        git(repo.path(), &["add", "."]);
        git(repo.path(), &["commit", "-q", "-m", "files"]);
        let root = tempfile::tempdir().unwrap();
        let manager = manager(root.path(), repo.path()).await;
        let created = manager
            .create(
                StartPoint::Ref {
                    name: "HEAD".into(),
                },
                None,
            )
            .await
            .unwrap();
        let checkout = created.worktree.checkout.clone();
        std::fs::write(checkout.join("README.md"), "from the session\n").unwrap();
        std::fs::write(checkout.join("shared.txt"), "session\n").unwrap();
        std::fs::write(checkout.join("same.txt"), "both\n").unwrap();
        std::fs::write(checkout.join("added.txt"), "new\n").unwrap();
        std::fs::write(repo.path().join("shared.txt"), "local edit\n").unwrap();
        std::fs::write(repo.path().join("same.txt"), "both\n").unwrap();

        let preview = manager
            .apply_to_local(&created.worktree.marker.id, true)
            .await
            .unwrap();
        assert_eq!(preview.applied, vec!["README.md", "added.txt"]);
        assert_eq!(preview.skipped, vec!["same.txt"]);
        assert_eq!(preview.conflicted, vec!["shared.txt"]);
        assert_eq!(
            std::fs::read_to_string(repo.path().join("README.md")).unwrap(),
            "hello\n"
        );

        manager
            .apply_to_local(&created.worktree.marker.id, false)
            .await
            .unwrap();
        assert_eq!(
            std::fs::read_to_string(repo.path().join("README.md")).unwrap(),
            "from the session\n"
        );
        assert_eq!(
            std::fs::read_to_string(repo.path().join("added.txt")).unwrap(),
            "new\n"
        );
        assert_eq!(
            std::fs::read_to_string(repo.path().join("shared.txt")).unwrap(),
            "local edit\n"
        );
        assert_eq!(git(repo.path(), &["diff", "--cached", "--name-only"]), "");
    }

    #[tokio::test]
    async fn archiving_snapshots_uncommitted_work_before_removing_the_worktree() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let root = tempfile::tempdir().unwrap();
        let manager = manager(root.path(), repo.path()).await;
        let created = manager
            .create(
                StartPoint::Ref {
                    name: "HEAD".into(),
                },
                None,
            )
            .await
            .unwrap();
        std::fs::write(created.worktree.checkout.join("unsaved.txt"), "keep me\n").unwrap();

        let archived = manager.archive(&created.worktree.marker.id).await.unwrap();

        assert!(!created.worktree.checkout.exists());
        assert_eq!(
            git(
                repo.path(),
                &["show", &format!("{}:unsaved.txt", archived.snapshot_commit)]
            ),
            "keep me"
        );
        assert!(manager.list().await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn cleanup_keeps_the_newest_and_never_removes_pinned_or_active_worktrees() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join(SETTINGS_FILE), r#"{"keep":1}"#).unwrap();
        let manager = manager(root.path(), repo.path()).await;
        let head = StartPoint::Ref {
            name: "HEAD".into(),
        };

        let pinned = manager.create(head.clone(), None).await.unwrap().worktree;
        manager.set_pinned(&pinned.marker.id, true).await.unwrap();
        let active = manager.create(head.clone(), None).await.unwrap().worktree;
        lock_checkout(&TokioCommandRunner, &active.checkout).await;
        let plain = manager.create(head.clone(), None).await.unwrap().worktree;
        let newest = manager.create(head.clone(), None).await.unwrap();

        let removed: Vec<_> = newest
            .cleaned
            .iter()
            .map(|outcome| outcome.id.clone())
            .collect();
        assert_eq!(removed, vec![plain.marker.id.clone()]);
        let left: Vec<_> = manager
            .list()
            .await
            .unwrap()
            .into_iter()
            .map(|worktree| worktree.marker.id)
            .collect();
        assert!(left.contains(&pinned.marker.id));
        assert!(left.contains(&active.marker.id));
        assert!(left.contains(&newest.worktree.marker.id));
        unlock_checkout(&TokioCommandRunner, &active.checkout).await;
    }

    #[test]
    fn the_keep_count_is_bounded_and_read_back() {
        let root = tempfile::tempdir().unwrap();
        assert_eq!(read_keep(root.path()), DEFAULT_KEEP);
        assert_eq!(write_keep(root.path(), 3).unwrap(), 3);
        assert_eq!(read_keep(root.path()), 3);
        assert!(write_keep(root.path(), 0).is_err());
        assert!(write_keep(root.path(), MAX_KEEP + 1).is_err());
        assert_eq!(read_keep(root.path()), 3);
    }

    #[tokio::test]
    async fn a_checkout_belongs_to_the_first_session_that_claims_it() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let root = tempfile::tempdir().unwrap();
        let manager = manager(root.path(), repo.path()).await;
        let created = manager
            .create(
                StartPoint::Ref {
                    name: "HEAD".into(),
                },
                None,
            )
            .await
            .unwrap();
        let checkout = created.worktree.checkout.clone();

        claim_checkout(&TokioCommandRunner, &checkout, "thread-a")
            .await
            .unwrap();
        let refused = claim_checkout(&TokioCommandRunner, &checkout, "thread-b")
            .await
            .unwrap_err();

        assert!(refused.to_string().contains("owned by another session"));
        assert_eq!(
            marker_for_checkout(&checkout).unwrap().thread_id.as_deref(),
            Some("thread-a")
        );
        assert!(
            manager
                .get(&created.worktree.marker.id)
                .await
                .unwrap()
                .active
        );
        unlock_checkout(&TokioCommandRunner, &checkout).await;
    }

    #[tokio::test]
    async fn a_setup_script_runs_only_for_the_content_that_was_approved() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        std::fs::create_dir_all(repo.path().join(".agiworkforce")).unwrap();
        std::fs::write(repo.path().join(SETUP_SCRIPT), "echo ready\n").unwrap();
        let root = tempfile::tempdir().unwrap();
        let manager = manager(root.path(), repo.path()).await;
        let created = manager
            .create(
                StartPoint::Ref {
                    name: "HEAD".into(),
                },
                None,
            )
            .await
            .unwrap();
        let script = created.setup.expect("the script is found");
        assert!(!script.approved);

        assert!(manager
            .approved_setup_command(&created.worktree.marker.id, "not-the-hash")
            .await
            .is_err());
        let run = manager
            .approved_setup_command(&created.worktree.marker.id, &script.sha256)
            .await
            .expect("the shown content runs");
        assert!(manager.setup_script().unwrap().unwrap().approved);
        assert!(!run.script.starts_with(&created.worktree.checkout));
        assert!(!run.script.starts_with(repo.path()));

        std::fs::write(repo.path().join(SETUP_SCRIPT), "echo changed\n").unwrap();
        assert_eq!(
            std::fs::read_to_string(&run.script).unwrap(),
            "echo ready\n",
            "the run keeps the bytes that were approved"
        );
        assert!(!manager.setup_script().unwrap().unwrap().approved);
    }

    #[tokio::test]
    async fn a_lock_whose_host_is_gone_does_not_keep_a_worktree_active() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let root = tempfile::tempdir().unwrap();
        let manager = manager(root.path(), repo.path()).await;
        let created = manager
            .create(
                StartPoint::Ref {
                    name: "HEAD".into(),
                },
                None,
            )
            .await
            .unwrap();
        let checkout = created.worktree.checkout.clone();
        let gone = format!("{LOCK_REASON} (pid 4194399)");
        git(
            repo.path(),
            &[
                "worktree",
                "lock",
                "--reason",
                &gone,
                checkout.to_str().unwrap(),
            ],
        );
        assert!(
            !manager
                .get(&created.worktree.marker.id)
                .await
                .unwrap()
                .active
        );

        lock_checkout(&TokioCommandRunner, &checkout).await;
        assert!(
            manager
                .get(&created.worktree.marker.id)
                .await
                .unwrap()
                .active
        );
        unlock_checkout(&TokioCommandRunner, &checkout).await;

        git(
            repo.path(),
            &[
                "worktree",
                "lock",
                "--reason",
                "the user's own lock",
                checkout.to_str().unwrap(),
            ],
        );
        assert!(
            manager
                .get(&created.worktree.marker.id)
                .await
                .unwrap()
                .active
        );
        unlock_checkout(&TokioCommandRunner, &checkout).await;
    }

    #[tokio::test]
    async fn archiving_a_worktree_with_a_stale_lock_leaves_no_entry_behind() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let root = tempfile::tempdir().unwrap();
        let manager = manager(root.path(), repo.path()).await;
        let created = manager
            .create(
                StartPoint::Ref {
                    name: "HEAD".into(),
                },
                None,
            )
            .await
            .unwrap();
        let checkout = created.worktree.checkout.clone();
        let gone = format!("{LOCK_REASON} (pid 4194399)");
        git(
            repo.path(),
            &[
                "worktree",
                "lock",
                "--reason",
                &gone,
                checkout.to_str().unwrap(),
            ],
        );

        manager.archive(&created.worktree.marker.id).await.unwrap();

        assert!(!checkout.exists());
        let listed = git(repo.path(), &["worktree", "list", "--porcelain"]);
        let entry = format!("{}/{CHECKOUT_DIR}", created.worktree.marker.id);
        assert!(
            !listed.contains(&entry),
            "a stale lock kept the entry: {listed}"
        );
    }

    #[tokio::test]
    async fn a_git_directory_planted_in_the_workspace_does_not_redirect_the_manager() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        std::fs::create_dir_all(repo.path().join("app")).unwrap();
        let workspace = Workspace::discover(&TokioCommandRunner, &repo.path().join("app"))
            .await
            .unwrap()
            .unwrap();
        init_repo(&repo.path().join("app"));
        let root = tempfile::tempdir().unwrap();
        let manager = WorktreeManager::open(&TokioCommandRunner, root.path(), &workspace);

        let created = manager
            .create(
                StartPoint::Ref {
                    name: "HEAD".into(),
                },
                None,
            )
            .await
            .unwrap();

        assert_eq!(manager.repository(), workspace.top());
        assert!(created.worktree.checkout.join("README.md").is_file());
        assert!(created.worktree.head.is_some());
        let entry = format!("{}/{CHECKOUT_DIR}", created.worktree.marker.id);
        assert!(git(repo.path(), &["worktree", "list", "--porcelain"]).contains(&entry));
        assert!(!git(
            &repo.path().join("app"),
            &["worktree", "list", "--porcelain"]
        )
        .contains(&entry));
    }

    #[tokio::test]
    async fn a_host_started_below_the_top_of_a_checkout_still_finds_it() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let root = tempfile::tempdir().unwrap();
        let manager = manager(root.path(), repo.path()).await;
        let created = manager
            .create(
                StartPoint::Ref {
                    name: "HEAD".into(),
                },
                None,
            )
            .await
            .unwrap();
        let nested = created.worktree.checkout.join("src/deep");
        std::fs::create_dir_all(&nested).unwrap();

        assert_eq!(
            checkout_containing(&nested),
            Some(canonical(&created.worktree.checkout))
        );
        assert_eq!(checkout_containing(repo.path()), None);
    }

    #[tokio::test]
    async fn a_worktree_that_cannot_be_archived_is_reported_and_creation_still_succeeds() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join(SETTINGS_FILE), r#"{"keep":1}"#).unwrap();
        let manager = manager(root.path(), repo.path()).await;
        let head = StartPoint::Ref {
            name: "HEAD".into(),
        };
        let broken = manager.create(head.clone(), None).await.unwrap().worktree;
        let admin = std::fs::read_dir(repo.path().join(".git/worktrees"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        std::fs::write(admin.join("gitdir"), "not a gitdir\n").unwrap();

        let newest = manager.create(head, None).await.expect("creation succeeds");

        assert!(newest.cleaned.is_empty());
        assert_eq!(newest.cleanup_failures.len(), 1);
        assert_eq!(newest.cleanup_failures[0].0, broken.marker.id);
        assert!(newest.worktree.checkout.join("README.md").is_file());
    }

    #[tokio::test]
    async fn deleting_a_thread_releases_the_worktrees_it_owned() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let root = tempfile::tempdir().unwrap();
        let manager = manager(root.path(), repo.path()).await;
        let created = manager
            .create(
                StartPoint::Ref {
                    name: "HEAD".into(),
                },
                None,
            )
            .await
            .unwrap();
        claim_checkout(&TokioCommandRunner, &created.worktree.checkout, "thread-a")
            .await
            .unwrap();
        unlock_checkout(&TokioCommandRunner, &created.worktree.checkout).await;

        let released = manager.release_thread("thread-a").await.unwrap();

        assert_eq!(released, vec![created.worktree.marker.id.clone()]);
        claim_checkout(&TokioCommandRunner, &created.worktree.checkout, "thread-b")
            .await
            .expect("a released worktree can be claimed again");
        unlock_checkout(&TokioCommandRunner, &created.worktree.checkout).await;
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn apply_to_local_never_follows_a_symlinked_directory_out_of_the_repository() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let root = tempfile::tempdir().unwrap();
        let manager = manager(root.path(), repo.path()).await;
        let created = manager
            .create(
                StartPoint::Ref {
                    name: "HEAD".into(),
                },
                None,
            )
            .await
            .unwrap();
        std::fs::create_dir_all(created.worktree.checkout.join("conf")).unwrap();
        std::fs::write(created.worktree.checkout.join("conf/app.toml"), "x\n").unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(outside.path(), repo.path().join("conf")).unwrap();

        let outcome = manager
            .apply_to_local(&created.worktree.marker.id, false)
            .await
            .unwrap();

        assert_eq!(outcome.conflicted, vec!["conf/app.toml"]);
        assert!(!outside.path().join("app.toml").exists());
    }
}
