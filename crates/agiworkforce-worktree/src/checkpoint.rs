//! Per-turn checkpoints of a session's workspace.
//!
//! Each turn records the workspace twice, as it stood before the turn and as
//! the turn left it, as commits on one private ref per thread:
//!
//! ```text
//! refs/agiworkforce/checkpoints/<thread>   before 1 -> after 1 -> before 2 -> after 2 ...
//! ```
//!
//! Both snapshots stage everything under the session's directory through a
//! private index, so a file changed by a shell command or a subagent is in the
//! checkpoint exactly like one an editing tool wrote. The commits keep the
//! trees alive through `git gc` and never appear on a branch.
//!
//! The private indexes and the refs live in the repository's git directory,
//! which the sandbox keeps read-only to every command a session runs, and
//! every git this module runs is pinned to the git directory the host found
//! when it opened the workspace.

use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::git::{common_dir, Git};
use crate::managed::ARCHIVE_REF_PREFIX;
use crate::runner::{CommandRunner, PinnedRunner};
use crate::snapshot::{
    apply_patch, commit_tree, delete_ref, diff_trees_within, file_patch, index_guard_file,
    resolve_ref, select_hunks, snapshot, update_ref, write_paths_from_tree, ChangeStatus,
    FilePatch, PatchTarget, SnapshotLimits, Snapshotted, TreeChange,
};

const CHECKPOINT_REF_PREFIX: &str = "refs/agiworkforce/checkpoints/";
const REWOUND_REF_PREFIX: &str = "refs/agiworkforce/rewound/";
const METADATA_MARKER: &str = "agiworkforce-checkpoint: ";
const RECORD_SEPARATOR: char = '\u{1e}';
const FIELD_SEPARATOR: char = '\u{1f}';
const SNAPSHOT_INDEX: &str = "snapshot";
const SCRATCH_INDEX: &str = "scratch";
/// The longest session id the CLI's session store accepts, in bytes.
const MAX_THREAD_ID_BYTES: usize = 200;
/// An untracked file larger than this stays out of a checkpoint: copying a
/// dataset or a build artifact into the object store on every turn costs more
/// than rewinding it is worth. The checkpoint names every file it left out.
pub const MAX_UNTRACKED_FILE_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Before,
    After,
}

/// What the host needs to rewind the conversation along with the files: how
/// many messages the thread held when the turn began, and a fingerprint of
/// them so a transcript compacted since is never cut at the wrong place.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationMark {
    pub message_count: usize,
    pub fingerprint: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Metadata {
    turn_id: String,
    turn_index: u32,
    phase: Phase,
    at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    conversation: Option<ConversationMark>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    skipped: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Snapshot {
    pub commit: String,
    pub tree: String,
    pub at: DateTime<Utc>,
    /// Untracked files left out for their size.
    pub skipped: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TurnCheckpoint {
    pub turn_id: String,
    /// One-based position of the turn in the thread.
    pub index: u32,
    pub before: Snapshot,
    /// Absent while the turn runs, or when the host stopped before recording it.
    pub after: Option<Snapshot>,
    pub conversation: Option<ConversationMark>,
    /// The commit the ref pointed at before this turn's first snapshot.
    previous: Option<String>,
}

impl TurnCheckpoint {
    /// Every file either snapshot of this turn left out, so neither its review
    /// nor a rewind covers it.
    pub fn skipped(&self) -> Vec<String> {
        let mut skipped: Vec<String> = self
            .before
            .skipped
            .iter()
            .chain(self.after.iter().flat_map(|after| after.skipped.iter()))
            .cloned()
            .collect();
        skipped.sort();
        skipped.dedup();
        skipped
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Section {
    pub path: String,
    /// Hunk indices from [`FilePatch::hunks`]; empty means the whole file.
    pub hunks: Vec<usize>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SectionOutcome {
    pub applied: Vec<String>,
    /// Each section git refused, with git's reason.
    pub conflicted: Vec<(String, String)>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RewindOutcome {
    /// Every file whose current content the rewind replaces or deletes.
    pub files: Vec<String>,
    /// Untracked files too large to snapshot, which the rewind leaves as they
    /// are.
    pub skipped: Vec<String>,
    /// Where the workspace as it stood before the rewind was kept, when it ran.
    pub recovery_ref: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ForgottenThread {
    /// Checkpoint history and rewind recovery points removed.
    pub removed: Vec<String>,
    /// Archives of worktrees the thread owned, removed because the caller
    /// asked for it.
    pub removed_archives: Vec<String>,
    /// Archives of worktrees the thread owned that were kept. Each may be the
    /// only copy of uncommitted work, so they go only when asked.
    pub kept_archives: Vec<String>,
}

/// A thread id that can sit in a ref name as one path component: the session
/// store's charset (letters, digits, `.`, `-`, `_`) without the spellings git
/// refuses in a ref (a leading or trailing dot, `..`, a `.lock` suffix).
pub(crate) fn is_ref_safe_thread_id(thread_id: &str) -> bool {
    !thread_id.is_empty()
        && thread_id.len() <= MAX_THREAD_ID_BYTES
        && thread_id
            .chars()
            .all(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '.'))
        && !thread_id.starts_with('.')
        && !thread_id.ends_with('.')
        && !thread_id.ends_with(".lock")
        && !thread_id.contains("..")
}

/// The private index one thread keeps for one purpose, inside the git
/// directory's `agiworkforce` folder.
fn index_file_name(thread_id: &str, purpose: &str) -> String {
    format!("{thread_id}-{purpose}.index")
}

/// The repository a host's workspace lives in, resolved once. Every later git
/// run for it names this git directory and work tree, so a `.git` that a
/// sandboxed command creates under the workspace afterwards cannot redirect
/// the host's own git to configuration it wrote.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Workspace {
    top: PathBuf,
    git_dir: PathBuf,
    scope: String,
    config_trusted: bool,
}

impl Workspace {
    /// `None` when `dir` is not inside a git working tree: checkpoints are git
    /// trees, and a folder without git has nowhere to keep them.
    pub async fn discover(runner: &dyn CommandRunner, dir: &Path) -> Result<Option<Self>> {
        let output = Git::at(runner, dir)
            .run(
                [
                    "rev-parse",
                    "--is-inside-work-tree",
                    "--show-toplevel",
                    "--absolute-git-dir",
                    "--show-prefix",
                ],
                None,
            )
            .await?;
        if !output.status.success() {
            return Ok(None);
        }
        let text = String::from_utf8_lossy(&output.stdout);
        let mut lines = text.lines();
        if lines.next() != Some("true") {
            return Ok(None);
        }
        let (Some(top), Some(git_dir)) = (lines.next(), lines.next()) else {
            return Ok(None);
        };
        Ok(Some(Self {
            top: PathBuf::from(top),
            git_dir: PathBuf::from(git_dir),
            scope: lines.next().unwrap_or_default().to_string(),
            config_trusted: false,
        }))
    }

    /// This workspace with the host's current trust decision for its folder.
    /// Either way, a setting in the repository's configuration that runs code
    /// refuses every host git that would run it unless its baseline holds it;
    /// untrusted, one in the work tree refuses even then. See
    /// [`crate::config_guard::untrusted_settings`].
    pub fn with_config_trusted(mut self, trusted: bool) -> Self {
        self.config_trusted = trusted;
        self
    }

    /// The top of the working tree.
    pub fn top(&self) -> &Path {
        &self.top
    }

    /// The workspace directory relative to [`Self::top`], empty at the top.
    pub fn scope(&self) -> &str {
        &self.scope
    }

    /// The git directory every git run for this workspace names: the
    /// repository's own, or a linked worktree's private one.
    pub(crate) fn git_dir(&self) -> &Path {
        &self.git_dir
    }

    pub(crate) fn runner<'a>(&self, inner: &'a dyn CommandRunner) -> PinnedRunner<'a> {
        PinnedRunner::new(inner, self.git_dir.clone(), self.top.clone())
            .trusting(self.config_trusted)
    }

    /// Whether `other` is a checkout of this same repository: both share one
    /// common git directory, whichever worktree each is.
    pub fn same_repository(&self, other: &Workspace) -> bool {
        let common = |workspace: &Workspace| {
            let common = common_dir(&workspace.git_dir);
            std::fs::canonicalize(&common).unwrap_or(common)
        };
        common(self) == common(other)
    }
}

/// Delete what a deleted thread left in the workspace's repository: its
/// checkpoint history, the recovery points its rewinds kept, and its private
/// snapshot indexes. The archives of worktrees it owned are removed only with
/// `discard_archives`, since one may hold the only copy of uncommitted work.
pub async fn forget_thread(
    runner: &dyn CommandRunner,
    workspace: &Workspace,
    thread_id: &str,
    discard_archives: bool,
) -> Result<ForgottenThread> {
    if !is_ref_safe_thread_id(thread_id) {
        anyhow::bail!("{thread_id:?} cannot name a checkpoint ref");
    }
    let pinned = workspace.runner(runner);
    let git = Git::at(&pinned, &workspace.top);
    let mut removed = refs_named(&git, CHECKPOINT_REF_PREFIX, thread_id).await?;
    removed.extend(refs_named(&git, REWOUND_REF_PREFIX, thread_id).await?);
    let archives = refs_named(&git, ARCHIVE_REF_PREFIX, thread_id).await?;
    let (removed_archives, kept_archives) = if discard_archives {
        (archives, Vec::new())
    } else {
        (Vec::new(), archives)
    };
    if !removed.is_empty() || !removed_archives.is_empty() {
        let commands: String = removed
            .iter()
            .chain(&removed_archives)
            .map(|name| format!("delete {name}\n"))
            .collect();
        crate::config_guard::verify_repository_config(
            &pinned,
            &workspace.top,
            &workspace.top,
            crate::config_guard::ConfigUse::REFS,
        )
        .await?;
        git.ok_with_input(["update-ref", "--stdin"], Some(commands.into_bytes()))
            .await?;
    }

    let indexes = git.git_path("agiworkforce").await?;
    for purpose in [SNAPSHOT_INDEX, SCRATCH_INDEX] {
        let index = indexes.join(index_file_name(thread_id, purpose));
        let mut lock = index.clone().into_os_string();
        lock.push(".lock");
        let _ = std::fs::remove_file(&index);
        let _ = std::fs::remove_file(PathBuf::from(lock));
        let _ = std::fs::remove_file(index_guard_file(&index));
    }
    Ok(ForgottenThread {
        removed,
        removed_archives,
        kept_archives,
    })
}

/// Every ref at `<prefix><thread_id>` or below it.
async fn refs_named(git: &Git<'_>, prefix: &str, thread_id: &str) -> Result<Vec<String>> {
    let pattern = format!("{prefix}{thread_id}");
    let listed = git
        .text(["for-each-ref", "--format=%(refname)", pattern.as_str()])
        .await?;
    Ok(listed
        .lines()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .collect())
}

/// The checkpoints of one thread in one workspace.
pub struct Checkpoints<'a> {
    runner: PinnedRunner<'a>,
    workdir: PathBuf,
    scope: String,
    thread_id: String,
}

impl<'a> Checkpoints<'a> {
    pub fn open(
        runner: &'a dyn CommandRunner,
        workspace: &Workspace,
        thread_id: &str,
    ) -> Result<Self> {
        if !is_ref_safe_thread_id(thread_id) {
            anyhow::bail!("{thread_id:?} cannot name a checkpoint ref");
        }
        Ok(Self {
            runner: workspace.runner(runner),
            workdir: workspace.top.clone(),
            scope: workspace.scope.clone(),
            thread_id: thread_id.to_string(),
        })
    }

    pub fn workdir(&self) -> &Path {
        &self.workdir
    }

    fn git_runner(&self) -> &dyn CommandRunner {
        &self.runner
    }

    fn ref_name(&self) -> String {
        format!("{CHECKPOINT_REF_PREFIX}{}", self.thread_id)
    }

    async fn index_path(&self, purpose: &str) -> Result<PathBuf> {
        Git::at(self.git_runner(), &self.workdir)
            .git_path(&format!(
                "agiworkforce/{}",
                index_file_name(&self.thread_id, purpose)
            ))
            .await
    }

    /// `error`, from a ref update that expected the checkpoint ref at
    /// `expected`, named as `moved` when the ref has moved since: another
    /// recording or rewind of this thread got there first.
    async fn unless_moved(
        &self,
        error: anyhow::Error,
        expected: Option<&str>,
        moved: &str,
    ) -> anyhow::Error {
        match resolve_ref(self.git_runner(), &self.workdir, &self.ref_name()).await {
            Ok(now) if now.as_deref() != expected => anyhow!("{moved}"),
            _ => error,
        }
    }

    /// The session's directory as it stands now, large untracked files aside.
    async fn snapshot(&self) -> Result<Snapshotted> {
        snapshot(
            self.git_runner(),
            &self.workdir,
            &self.index_path(SNAPSHOT_INDEX).await?,
            &SnapshotLimits {
                scope: self.scope.clone(),
                max_untracked_bytes: Some(MAX_UNTRACKED_FILE_BYTES),
            },
        )
        .await
    }

    /// Snapshot the workspace for one phase of one turn.
    pub async fn record(
        &self,
        turn_id: &str,
        phase: Phase,
        conversation: Option<ConversationMark>,
    ) -> Result<Snapshot> {
        let snapshotted = self.snapshot().await?;
        self.commit(turn_id, phase, conversation, snapshotted).await
    }

    /// [`Self::record`], giving up when staging the files takes longer than
    /// `limit`: `None` means this phase has no checkpoint. Nothing is written
    /// after the limit passes, so a snapshot that finishes late can never be
    /// recorded as the state before work that has since started.
    pub async fn record_within(
        &self,
        turn_id: &str,
        phase: Phase,
        conversation: Option<ConversationMark>,
        limit: Duration,
    ) -> Result<Option<Snapshot>> {
        let Ok(snapshotted) = tokio::time::timeout(limit, self.snapshot()).await else {
            return Ok(None);
        };
        self.commit(turn_id, phase, conversation, snapshotted?)
            .await
            .map(Some)
    }

    async fn commit(
        &self,
        turn_id: &str,
        phase: Phase,
        conversation: Option<ConversationMark>,
        snapshotted: Snapshotted,
    ) -> Result<Snapshot> {
        let Snapshotted { tree, skipped } = snapshotted;
        let parent = resolve_ref(self.git_runner(), &self.workdir, &self.ref_name()).await?;
        let turns = self.list().await?;
        let turn_index = match phase {
            Phase::Before => turns.last().map_or(1, |turn| turn.index + 1),
            Phase::After => turns
                .iter()
                .find(|turn| turn.turn_id == turn_id)
                .map(|turn| turn.index)
                .ok_or_else(|| anyhow!("turn {turn_id} has no before-snapshot to pair with"))?,
        };
        let at = Utc::now();
        let metadata = Metadata {
            turn_id: turn_id.to_string(),
            turn_index,
            phase,
            at,
            conversation,
            skipped: skipped.clone(),
        };
        let message = format!(
            "AGI checkpoint: turn {turn_index} {}\n\n{METADATA_MARKER}{}\n",
            match phase {
                Phase::Before => "before",
                Phase::After => "after",
            },
            serde_json::to_string(&metadata)?
        );
        let commit = commit_tree(
            self.git_runner(),
            &self.workdir,
            &tree,
            parent.as_deref(),
            &message,
        )
        .await?;
        if let Err(error) = update_ref(
            self.git_runner(),
            &self.workdir,
            &self.ref_name(),
            &commit,
            parent.as_deref(),
        )
        .await
        {
            return Err(self
                .unless_moved(
                    error,
                    parent.as_deref(),
                    "checkpoint history changed while recording; not recorded",
                )
                .await);
        }
        Ok(Snapshot {
            commit,
            tree,
            at,
            skipped,
        })
    }

    /// Every turn this thread has checkpointed, oldest first.
    pub async fn list(&self) -> Result<Vec<TurnCheckpoint>> {
        let reference = self.ref_name();
        if resolve_ref(self.git_runner(), &self.workdir, &reference)
            .await?
            .is_none()
        {
            return Ok(Vec::new());
        }
        let format = format!(
            "--format=%H{FIELD_SEPARATOR}%T{FIELD_SEPARATOR}%P{FIELD_SEPARATOR}%B{RECORD_SEPARATOR}"
        );
        let raw = Git::at(self.git_runner(), &self.workdir)
            .ok([
                "log",
                "--first-parent",
                "--reverse",
                format.as_str(),
                reference.as_str(),
                "--",
            ])
            .await?;
        let text = String::from_utf8_lossy(&raw);
        let mut turns: Vec<TurnCheckpoint> = Vec::new();
        for record in text.split(RECORD_SEPARATOR) {
            let mut fields = record.trim_start_matches('\n').splitn(4, FIELD_SEPARATOR);
            let (Some(commit), Some(tree), Some(parents), Some(body)) =
                (fields.next(), fields.next(), fields.next(), fields.next())
            else {
                continue;
            };
            let Some(metadata) = body
                .lines()
                .find_map(|line| line.strip_prefix(METADATA_MARKER))
                .and_then(|json| serde_json::from_str::<Metadata>(json).ok())
            else {
                continue;
            };
            let snapshot = Snapshot {
                commit: commit.to_string(),
                tree: tree.to_string(),
                at: metadata.at,
                skipped: metadata.skipped,
            };
            match metadata.phase {
                Phase::Before => turns.push(TurnCheckpoint {
                    turn_id: metadata.turn_id,
                    index: metadata.turn_index,
                    before: snapshot,
                    after: None,
                    conversation: metadata.conversation,
                    previous: parents.split_whitespace().next().map(str::to_string),
                }),
                Phase::After => {
                    if let Some(turn) = turns
                        .iter_mut()
                        .rev()
                        .find(|turn| turn.turn_id == metadata.turn_id)
                    {
                        turn.after = Some(snapshot);
                    }
                }
            }
        }
        Ok(turns)
    }

    pub async fn turn(&self, turn_id: &str) -> Result<TurnCheckpoint> {
        self.list()
            .await?
            .into_iter()
            .find(|turn| turn.turn_id == turn_id)
            .ok_or_else(|| anyhow!("no checkpoint for turn {turn_id} in this thread"))
    }

    fn finished(turn: &TurnCheckpoint) -> Result<&Snapshot> {
        turn.after.as_ref().ok_or_else(|| {
            anyhow!(
                "turn {} has not finished, so it has no changes to review yet",
                turn.index
            )
        })
    }

    /// What one turn changed, per file.
    pub async fn changes(&self, turn: &TurnCheckpoint) -> Result<Vec<TreeChange>> {
        let after = Self::finished(turn)?;
        diff_trees_within(
            self.git_runner(),
            &self.workdir,
            &turn.before.tree,
            &after.tree,
            &self.scope,
        )
        .await
    }

    /// One turn's patch for every file it changed.
    pub async fn patches(&self, turn: &TurnCheckpoint) -> Result<Vec<FilePatch>> {
        let after = Self::finished(turn)?;
        let mut patches = Vec::new();
        for change in self.changes(turn).await? {
            patches.push(
                file_patch(
                    self.git_runner(),
                    &self.workdir,
                    &turn.before.tree,
                    &after.tree,
                    &change,
                )
                .await?,
            );
        }
        Ok(patches)
    }

    async fn section_patches(
        &self,
        turn: &TurnCheckpoint,
        sections: &[Section],
    ) -> Result<Vec<(String, String)>> {
        let patches = self.patches(turn).await?;
        sections
            .iter()
            .map(|section| {
                let patch = patches
                    .iter()
                    .find(|patch| patch.path == section.path)
                    .ok_or_else(|| {
                        anyhow!("turn {} did not change {}", turn.index, section.path)
                    })?;
                Ok((section.path.clone(), select_hunks(patch, &section.hunks)?))
            })
            .collect()
    }

    async fn apply_sections(
        &self,
        turn_id: &str,
        sections: &[Section],
        reverse: bool,
        target: PatchTarget,
        preview: bool,
    ) -> Result<SectionOutcome> {
        let turn = self.turn(turn_id).await?;
        let mut outcome = SectionOutcome::default();
        for (path, patch) in self.section_patches(&turn, sections).await? {
            let checked = apply_patch(
                self.git_runner(),
                &self.workdir,
                &patch,
                reverse,
                target,
                true,
            )
            .await;
            let result = match (checked, preview) {
                (Ok(()), false) => {
                    apply_patch(
                        self.git_runner(),
                        &self.workdir,
                        &patch,
                        reverse,
                        target,
                        false,
                    )
                    .await
                }
                (checked, _) => checked,
            };
            match result {
                Ok(()) => outcome.applied.push(path),
                Err(error) => outcome.conflicted.push((path, error.to_string())),
            }
        }
        Ok(outcome)
    }

    /// Undo chosen sections of one turn in the files on disk. A section the
    /// files have moved on from since is reported as a conflict and left alone.
    pub async fn revert_sections(
        &self,
        turn_id: &str,
        sections: &[Section],
        preview: bool,
    ) -> Result<SectionOutcome> {
        self.apply_sections(turn_id, sections, true, PatchTarget::WorkingTree, preview)
            .await
    }

    /// Stage chosen sections of one turn in the repository's index.
    pub async fn stage_sections(
        &self,
        turn_id: &str,
        sections: &[Section],
        preview: bool,
    ) -> Result<SectionOutcome> {
        self.apply_sections(turn_id, sections, false, PatchTarget::Index, preview)
            .await
    }

    /// Put every file in the session's directory back as it stood before
    /// `turn_id` began, and drop that turn and every later one from the
    /// checkpoint history.
    ///
    /// With `preview` nothing changes and the outcome names exactly the files
    /// a rewind would replace or delete: everything that differs from the
    /// before-snapshot now, whoever changed it. Untracked files too large to
    /// snapshot now, or when either snapshot of the turn was taken, are named
    /// apart, and a rewind leaves them alone, even where the before-snapshot
    /// holds an older copy or none at all: the recovery ref cannot hold their
    /// content, so replacing or deleting one could not be undone. Otherwise
    /// the current workspace is kept under a recovery ref first, so the rewind
    /// itself can be undone.
    pub async fn rewind(&self, turn_id: &str, preview: bool) -> Result<RewindOutcome> {
        let turn = self.turn(turn_id).await?;
        let current = self.snapshot().await?;
        let mut skipped = turn.skipped();
        skipped.extend(current.skipped.iter().cloned());
        skipped.sort();
        skipped.dedup();
        let changes: Vec<TreeChange> = diff_trees_within(
            self.git_runner(),
            &self.workdir,
            &current.tree,
            &turn.before.tree,
            &self.scope,
        )
        .await?
        .into_iter()
        .filter(|change| !skipped.contains(&change.path))
        .collect();
        let files: Vec<String> = changes.iter().map(|change| change.path.clone()).collect();
        if preview {
            return Ok(RewindOutcome {
                files,
                skipped,
                recovery_ref: None,
            });
        }

        let head = resolve_ref(self.git_runner(), &self.workdir, &self.ref_name()).await?;
        let recovery_ref = format!(
            "{REWOUND_REF_PREFIX}{}/{}",
            self.thread_id,
            Utc::now().timestamp_millis()
        );
        let recovery = commit_tree(
            self.git_runner(),
            &self.workdir,
            &current.tree,
            head.as_deref(),
            &format!(
                "AGI rewind: workspace before rewinding to turn {}\n",
                turn.index
            ),
        )
        .await?;
        update_ref(
            self.git_runner(),
            &self.workdir,
            &recovery_ref,
            &recovery,
            None,
        )
        .await?;

        let (write, remove): (Vec<_>, Vec<_>) = changes
            .into_iter()
            .partition(|change| change.status != ChangeStatus::Deleted);
        write_paths_from_tree(
            self.git_runner(),
            &self.workdir,
            &turn.before.tree,
            &write
                .into_iter()
                .map(|change| change.path)
                .collect::<Vec<_>>(),
            &remove
                .into_iter()
                .map(|change| change.path)
                .collect::<Vec<_>>(),
            &self.index_path(SCRATCH_INDEX).await?,
        )
        .await
        .context("restore the files to their state before the turn")?;

        let trimmed = match (&turn.previous, head.as_deref()) {
            (Some(previous), head) => {
                update_ref(
                    self.git_runner(),
                    &self.workdir,
                    &self.ref_name(),
                    previous,
                    head,
                )
                .await
            }
            (None, Some(head)) => {
                delete_ref(self.git_runner(), &self.workdir, &self.ref_name(), head).await
            }
            (None, None) => Ok(()),
        };
        if let Err(error) = trimmed {
            return Err(self
                .unless_moved(
                    error,
                    head.as_deref(),
                    "checkpoint history changed during the rewind; the files were restored but \
                     the history was left as it is",
                )
                .await);
        }
        Ok(RewindOutcome {
            files,
            skipped,
            recovery_ref: Some(recovery_ref),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::test_support::{git, init_repo};
    use crate::runner::TokioCommandRunner;

    async fn open(repo: &Path, thread: &str) -> Checkpoints<'static> {
        let workspace = Workspace::discover(&TokioCommandRunner, repo)
            .await
            .unwrap()
            .expect("a repository has a workspace");
        Checkpoints::open(&TokioCommandRunner, &workspace, thread).unwrap()
    }

    fn mark(count: usize) -> Option<ConversationMark> {
        Some(ConversationMark {
            message_count: count,
            fingerprint: format!("fp-{count}"),
        })
    }

    #[tokio::test]
    async fn a_turn_records_every_change_including_ones_no_editing_tool_made() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let checkpoints = open(repo.path(), "thread-1").await;

        checkpoints
            .record("turn-a", Phase::Before, mark(0))
            .await
            .unwrap();
        std::fs::write(repo.path().join("README.md"), "edited by a shell command\n").unwrap();
        std::fs::write(repo.path().join("generated.txt"), "made by a subagent\n").unwrap();
        checkpoints
            .record("turn-a", Phase::After, None)
            .await
            .unwrap();

        let turns = checkpoints.list().await.unwrap();
        assert_eq!(turns.len(), 1);
        assert_eq!(turns[0].index, 1);
        assert_eq!(turns[0].conversation, mark(0));
        let changes = checkpoints.changes(&turns[0]).await.unwrap();
        let paths: Vec<_> = changes.iter().map(|change| change.path.as_str()).collect();
        assert_eq!(paths, vec!["README.md", "generated.txt"]);
        assert_eq!(git(repo.path(), &["branch", "--list"]), "* main");
        assert_eq!(git(repo.path(), &["diff", "--cached", "--name-only"]), "");
    }

    #[tokio::test]
    async fn rewinding_restores_the_files_names_them_first_and_keeps_a_recovery_ref() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let checkpoints = open(repo.path(), "thread-2").await;
        checkpoints
            .record("turn-1", Phase::Before, mark(0))
            .await
            .unwrap();
        std::fs::write(repo.path().join("one.txt"), "1\n").unwrap();
        checkpoints
            .record("turn-1", Phase::After, None)
            .await
            .unwrap();
        checkpoints
            .record("turn-2", Phase::Before, mark(2))
            .await
            .unwrap();
        std::fs::write(repo.path().join("README.md"), "turn two\n").unwrap();
        checkpoints
            .record("turn-2", Phase::After, None)
            .await
            .unwrap();

        let preview = checkpoints.rewind("turn-2", true).await.unwrap();
        assert_eq!(preview.files, vec!["README.md"]);
        assert_eq!(
            std::fs::read_to_string(repo.path().join("README.md")).unwrap(),
            "turn two\n"
        );

        let rewound = checkpoints.rewind("turn-2", false).await.unwrap();
        assert_eq!(
            std::fs::read_to_string(repo.path().join("README.md")).unwrap(),
            "hello\n"
        );
        assert!(repo.path().join("one.txt").exists());
        let recovery = rewound.recovery_ref.expect("a recovery ref");
        assert_eq!(
            git(repo.path(), &["show", &format!("{recovery}:README.md")]),
            "turn two"
        );
        let left: Vec<_> = checkpoints
            .list()
            .await
            .unwrap()
            .into_iter()
            .map(|turn| turn.turn_id)
            .collect();
        assert_eq!(left, vec!["turn-1"]);
    }

    #[tokio::test]
    async fn one_hunk_of_a_turn_reverts_and_a_moved_on_file_conflicts() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let lines: String = (1..=30).map(|n| format!("line {n}\n")).collect();
        std::fs::write(repo.path().join("long.txt"), &lines).unwrap();
        git(repo.path(), &["add", "."]);
        git(repo.path(), &["commit", "-q", "-m", "long"]);
        let checkpoints = open(repo.path(), "thread-3").await;
        checkpoints
            .record("turn-1", Phase::Before, mark(0))
            .await
            .unwrap();
        let edited = lines
            .replace("line 2\n", "line two\n")
            .replace("line 28\n", "line twenty-eight\n");
        std::fs::write(repo.path().join("long.txt"), &edited).unwrap();
        std::fs::write(repo.path().join("README.md"), "agent\n").unwrap();
        checkpoints
            .record("turn-1", Phase::After, None)
            .await
            .unwrap();
        std::fs::write(repo.path().join("README.md"), "the user moved on\n").unwrap();

        let outcome = checkpoints
            .revert_sections(
                "turn-1",
                &[
                    Section {
                        path: "long.txt".into(),
                        hunks: vec![1],
                    },
                    Section {
                        path: "README.md".into(),
                        hunks: vec![],
                    },
                ],
                false,
            )
            .await
            .unwrap();

        assert_eq!(outcome.applied, vec!["long.txt"]);
        assert_eq!(outcome.conflicted.len(), 1);
        assert_eq!(outcome.conflicted[0].0, "README.md");
        let now = std::fs::read_to_string(repo.path().join("long.txt")).unwrap();
        assert!(now.contains("line two\n"));
        assert!(now.contains("line 28\n"));
        assert_eq!(
            std::fs::read_to_string(repo.path().join("README.md")).unwrap(),
            "the user moved on\n"
        );
    }

    #[tokio::test]
    async fn forgetting_a_thread_removes_its_refs_and_leaves_other_threads_alone() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        for thread in ["gone", "kept"] {
            let checkpoints = open(repo.path(), thread).await;
            checkpoints
                .record("turn-1", Phase::Before, mark(0))
                .await
                .unwrap();
            checkpoints
                .record("turn-1", Phase::After, None)
                .await
                .unwrap();
            checkpoints.rewind("turn-1", false).await.unwrap();
            checkpoints
                .record("turn-2", Phase::Before, mark(0))
                .await
                .unwrap();
        }
        let head = git(repo.path(), &["rev-parse", "HEAD"]);
        git(
            repo.path(),
            &[
                "update-ref",
                &format!("{ARCHIVE_REF_PREFIX}gone/0a1b2c3d"),
                &head,
            ],
        );

        let workspace = Workspace::discover(&TokioCommandRunner, repo.path())
            .await
            .unwrap()
            .unwrap();
        let forgotten = forget_thread(&TokioCommandRunner, &workspace, "gone", false)
            .await
            .unwrap();

        assert_eq!(forgotten.removed.len(), 2, "{forgotten:?}");
        assert_eq!(
            forgotten.kept_archives,
            vec![format!("{ARCHIVE_REF_PREFIX}gone/0a1b2c3d")]
        );
        let left = git(
            repo.path(),
            &["for-each-ref", "--format=%(refname)", "refs/agiworkforce"],
        );
        assert!(!left.contains("checkpoints/gone"), "{left}");
        assert!(!left.contains("rewound/gone"), "{left}");
        assert!(left.contains("worktree-archive/gone/"), "{left}");
        assert!(left.contains("checkpoints/kept"), "{left}");
        assert!(left.contains("rewound/kept/"), "{left}");

        let confirmed = forget_thread(&TokioCommandRunner, &workspace, "gone", true)
            .await
            .unwrap();
        assert!(confirmed.removed.is_empty());
        assert_eq!(
            confirmed.removed_archives,
            vec![format!("{ARCHIVE_REF_PREFIX}gone/0a1b2c3d")]
        );
        assert!(confirmed.kept_archives.is_empty());
    }

    #[tokio::test]
    async fn a_folder_without_git_has_no_checkpoints() {
        let folder = tempfile::tempdir().unwrap();
        assert!(Workspace::discover(&TokioCommandRunner, folder.path())
            .await
            .unwrap()
            .is_none());
    }

    #[tokio::test]
    async fn a_session_in_a_subdirectory_checkpoints_and_rewinds_only_that_directory() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        std::fs::create_dir_all(repo.path().join("app")).unwrap();
        let checkpoints = open(&repo.path().join("app"), "thread-scope").await;
        checkpoints
            .record("turn-1", Phase::Before, mark(0))
            .await
            .unwrap();
        std::fs::write(repo.path().join("app/made.txt"), "agent\n").unwrap();
        std::fs::write(repo.path().join("README.md"), "someone else\n").unwrap();
        checkpoints
            .record("turn-1", Phase::After, None)
            .await
            .unwrap();

        let turn = checkpoints.turn("turn-1").await.unwrap();
        let changes = checkpoints.changes(&turn).await.unwrap();
        let paths: Vec<_> = changes.iter().map(|change| change.path.as_str()).collect();
        assert_eq!(paths, vec!["app/made.txt"]);

        let preview = checkpoints.rewind("turn-1", true).await.unwrap();
        assert_eq!(preview.files, vec!["app/made.txt"]);
        checkpoints.rewind("turn-1", false).await.unwrap();
        assert!(!repo.path().join("app/made.txt").exists());
        assert_eq!(
            std::fs::read_to_string(repo.path().join("README.md")).unwrap(),
            "someone else\n"
        );
    }

    #[tokio::test]
    async fn a_large_untracked_file_is_named_and_left_alone_by_a_rewind() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let checkpoints = open(repo.path(), "thread-large").await;
        checkpoints
            .record("turn-1", Phase::Before, mark(0))
            .await
            .unwrap();
        let size = usize::try_from(MAX_UNTRACKED_FILE_BYTES).unwrap() + 1;
        std::fs::write(repo.path().join("dataset.bin"), vec![0u8; size]).unwrap();
        checkpoints
            .record("turn-1", Phase::After, None)
            .await
            .unwrap();

        let turn = checkpoints.turn("turn-1").await.unwrap();
        assert_eq!(turn.skipped(), vec!["dataset.bin"]);
        assert!(checkpoints.changes(&turn).await.unwrap().is_empty());
        let rewound = checkpoints.rewind("turn-1", false).await.unwrap();
        assert_eq!(rewound.skipped, vec!["dataset.bin"]);
        assert!(rewound.files.is_empty());
        assert!(repo.path().join("dataset.bin").exists());
    }

    #[tokio::test]
    async fn a_rewind_never_replaces_a_file_too_large_to_keep_a_recovery_copy_of() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        std::fs::write(repo.path().join("model.bin"), "small\n").unwrap();
        let checkpoints = open(repo.path(), "thread-grown").await;
        checkpoints
            .record("turn-1", Phase::Before, mark(0))
            .await
            .unwrap();
        let size = usize::try_from(MAX_UNTRACKED_FILE_BYTES).unwrap() + 1;
        std::fs::write(repo.path().join("model.bin"), vec![7u8; size]).unwrap();
        checkpoints
            .record("turn-1", Phase::After, None)
            .await
            .unwrap();

        let preview = checkpoints.rewind("turn-1", true).await.unwrap();
        assert!(preview.files.is_empty(), "{:?}", preview.files);
        assert_eq!(preview.skipped, vec!["model.bin"]);
        let rewound = checkpoints.rewind("turn-1", false).await.unwrap();
        assert!(rewound.files.is_empty());
        assert_eq!(
            std::fs::metadata(repo.path().join("model.bin"))
                .unwrap()
                .len(),
            u64::try_from(size).unwrap()
        );
    }

    #[tokio::test]
    async fn a_large_file_that_existed_before_the_turn_survives_a_rewind() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let size = usize::try_from(MAX_UNTRACKED_FILE_BYTES * 2).unwrap();
        std::fs::write(repo.path().join("dataset.bin"), vec![1u8; size]).unwrap();
        let checkpoints = open(repo.path(), "thread-shrunk").await;
        checkpoints
            .record("turn-1", Phase::Before, mark(0))
            .await
            .unwrap();
        std::fs::write(repo.path().join("dataset.bin"), "trimmed\n").unwrap();
        checkpoints
            .record("turn-1", Phase::After, None)
            .await
            .unwrap();

        let preview = checkpoints.rewind("turn-1", true).await.unwrap();
        assert!(preview.files.is_empty(), "{:?}", preview.files);
        assert_eq!(preview.skipped, vec!["dataset.bin"]);
        let rewound = checkpoints.rewind("turn-1", false).await.unwrap();
        assert_eq!(rewound.skipped, vec!["dataset.bin"]);
        assert_eq!(
            std::fs::read_to_string(repo.path().join("dataset.bin")).unwrap(),
            "trimmed\n"
        );
    }

    /// Moves the thread's checkpoint ref the moment a commit has been
    /// written for it, as a second recording of the same thread would.
    struct Racing {
        repo: PathBuf,
        reference: String,
    }

    #[async_trait::async_trait]
    impl CommandRunner for Racing {
        async fn output(
            &self,
            command: tokio::process::Command,
            stdin: Option<Vec<u8>>,
            timeout: Option<Duration>,
        ) -> std::io::Result<std::process::Output> {
            let commits = command
                .as_std()
                .get_args()
                .any(|arg| arg == std::ffi::OsStr::new("commit-tree"));
            let output = TokioCommandRunner.output(command, stdin, timeout).await?;
            if commits {
                let head = git(&self.repo, &["rev-parse", "HEAD"]);
                git(&self.repo, &["update-ref", &self.reference, &head]);
            }
            Ok(output)
        }
    }

    #[tokio::test]
    async fn a_recording_that_loses_a_race_for_the_ref_is_refused() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let workspace = Workspace::discover(&TokioCommandRunner, repo.path())
            .await
            .unwrap()
            .unwrap();
        let racing = Racing {
            repo: repo.path().to_path_buf(),
            reference: format!("{CHECKPOINT_REF_PREFIX}thread-race"),
        };
        let checkpoints = Checkpoints::open(&racing, &workspace, "thread-race").unwrap();

        let error = checkpoints
            .record("turn-1", Phase::Before, mark(0))
            .await
            .expect_err("the ref moved under the recording");

        assert!(
            error.to_string().contains("checkpoint history changed"),
            "{error}"
        );
        assert_eq!(
            git(repo.path(), &["rev-parse", &racing.reference]),
            git(repo.path(), &["rev-parse", "HEAD"])
        );
    }

    #[tokio::test]
    async fn forgetting_a_thread_keeps_the_indexes_of_a_thread_its_id_prefixes() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        for thread in ["gone", "gone-2"] {
            open(repo.path(), thread)
                .await
                .record("turn-1", Phase::Before, mark(0))
                .await
                .unwrap();
        }
        let indexes = repo.path().join(".git/agiworkforce");
        assert!(indexes.join("gone-snapshot.index").exists());
        let workspace = Workspace::discover(&TokioCommandRunner, repo.path())
            .await
            .unwrap()
            .unwrap();

        forget_thread(&TokioCommandRunner, &workspace, "gone", false)
            .await
            .unwrap();

        assert!(!indexes.join("gone-snapshot.index").exists());
        assert!(indexes.join("gone-2-snapshot.index").exists());
    }

    #[tokio::test]
    async fn a_git_directory_planted_later_does_not_redirect_a_pinned_workspace() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        std::fs::create_dir_all(repo.path().join("app")).unwrap();
        let workspace = Workspace::discover(&TokioCommandRunner, &repo.path().join("app"))
            .await
            .unwrap()
            .unwrap();
        init_repo(&repo.path().join("app"));
        let checkpoints = Checkpoints::open(&TokioCommandRunner, &workspace, "thread-pin").unwrap();

        checkpoints
            .record("turn-1", Phase::Before, mark(0))
            .await
            .unwrap();

        assert!(git(
            repo.path(),
            &["for-each-ref", "--format=%(refname)", "refs/agiworkforce"]
        )
        .contains("checkpoints/thread-pin"));
        assert!(!git(
            &repo.path().join("app"),
            &["for-each-ref", "--format=%(refname)"]
        )
        .contains("refs/agiworkforce"));
    }

    #[test]
    fn thread_ids_take_the_session_charset_but_never_a_spelling_git_refuses() {
        for id in ["thread-1", "a.b_c-d", "sess.2026.10.10", "\u{e9}t\u{e9}"] {
            assert!(is_ref_safe_thread_id(id), "{id}");
        }
        for id in ["", ".hidden", "trailing.", "a..b", "x.lock", "a/b", "a b"] {
            assert!(!is_ref_safe_thread_id(id), "{id:?}");
        }
        assert!(!is_ref_safe_thread_id(&"x".repeat(MAX_THREAD_ID_BYTES + 1)));
    }
}
