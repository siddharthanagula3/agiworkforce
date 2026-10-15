//! Whole-workspace snapshots as git trees, and the plumbing to compare and
//! restore them.
//!
//! A snapshot stages every file git would see, tracked or not, through a
//! private index, so shell commands and subagents are captured as surely as an
//! editing tool, and the user's own index and branches are never touched.

use anyhow::{Context, Result};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex as StdMutex, OnceLock};
use std::time::{Duration, SystemTime};

use crate::config_guard::{verify_repository_config, ConfigUse};
use crate::git::{Git, GIT_SNAPSHOT_TIMEOUT};
use crate::include::path_inside;
use crate::runner::CommandRunner;

const IDENTITY_NAME: &str = "AGI Workforce";
const IDENTITY_EMAIL: &str = "checkpoints@agiworkforce.invalid";
const SYMLINK_MODE: &str = "120000";
const GITLINK_MODE: &str = "160000";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChangeStatus {
    Added,
    Modified,
    Deleted,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TreeChange {
    pub path: String,
    pub status: ChangeStatus,
    pub binary: bool,
}

/// One `@@` block of a file's patch, numbered from zero in patch order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Hunk {
    pub index: usize,
    pub header: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FilePatch {
    pub path: String,
    pub status: ChangeStatus,
    pub binary: bool,
    /// Everything before the first hunk: the `diff --git` line, modes, blobs.
    pub header: String,
    pub hunks: Vec<Hunk>,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TreeEntry {
    pub mode: String,
    pub oid: String,
}

/// What one snapshot may take in. The default takes every file of the whole
/// checkout, which is what an archive or a carried-over start needs.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SnapshotLimits {
    /// The directory, relative to the top of the checkout, the snapshot is of;
    /// empty for all of it. Paths outside it keep whatever the index held.
    pub scope: String,
    /// An untracked file larger than this is left out and named in
    /// [`Snapshotted::skipped`] rather than copied into the object store.
    pub max_untracked_bytes: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Snapshotted {
    pub tree: String,
    /// Untracked files left out for their size, relative to the checkout top.
    pub skipped: Vec<String>,
}

/// One mutex per private index, so two snapshots in this process never stage
/// through the same index at once, and a lock found while holding it can only
/// belong to a git that is no longer running. Each git that touches the index
/// holds the guard too, so a caller that stops waiting, as a turn's snapshot
/// limit does, releases the index only once that git has exited.
fn index_guard(index: &Path) -> Arc<tokio::sync::Mutex<()>> {
    static GUARDS: OnceLock<StdMutex<HashMap<PathBuf, Arc<tokio::sync::Mutex<()>>>>> =
        OnceLock::new();
    GUARDS
        .get_or_init(Default::default)
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .entry(index.to_path_buf())
        .or_default()
        .clone()
}

fn index_lock(index: &Path) -> PathBuf {
    with_suffix(index, ".lock")
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut named = path.as_os_str().to_os_string();
    named.push(suffix);
    PathBuf::from(named)
}

/// The file every process of ours locks while it stages through `index`: in
/// the host's protected state directory, named by a hash of the index's path,
/// so no sandboxed command can open it and hold the lock. Without that
/// directory it sits beside the index, and [`INDEX_HOLD_LIMIT`] bounds what a
/// command holding it can stall.
pub(crate) fn index_guard_file(index: &Path) -> PathBuf {
    use sha2::{Digest, Sha256};

    match crate::git::host_state_dir() {
        Some(state) => {
            let digest = Sha256::digest(index.as_os_str().as_encoded_bytes());
            state
                .join("index-locks")
                .join(format!("{}.guard", crate::git::hex(&digest)))
        }
        None => with_suffix(index, ".guard"),
    }
}

/// How long a snapshot waits for another process to let go of an index.
const INDEX_HOLD_LIMIT: Duration = Duration::from_secs(30);
const INDEX_HOLD_POLL: Duration = Duration::from_millis(50);

/// How much older than the moment the index was taken a leftover lock must
/// be before it is cleared, so a lock whose git started just before is not
/// mistaken for one a killed git left.
const STALE_LOCK_MARGIN: Duration = Duration::from_secs(2);

/// What a caller holds while it stages through a private index: this
/// process's guard, and an exclusive lock on the index's guard file that every
/// process of ours takes the same way. `None` for the file lock means the
/// filesystem would not lock it, so another process's git may be running.
pub(crate) struct IndexHold {
    _guard: tokio::sync::OwnedMutexGuard<()>,
    file: Option<std::fs::File>,
}

async fn hold_index(index: &Path) -> Result<Arc<IndexHold>> {
    hold_index_within(index, INDEX_HOLD_LIMIT).await
}

async fn hold_index_within(index: &Path, limit: Duration) -> Result<Arc<IndexHold>> {
    let guard = index_guard(index).lock_owned().await;
    if let Some(parent) = index.parent() {
        std::fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
    }
    let path = index_guard_file(index);
    if let Some(parent) = path.parent() {
        crate::git::create_private_dir(parent)
            .with_context(|| format!("create {}", parent.display()))?;
    }
    let file = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(false)
        .open(&path)
        .with_context(|| format!("open {}", path.display()))?;
    let deadline = tokio::time::Instant::now() + limit;
    let file = loop {
        match file.try_lock() {
            Ok(()) => break Some(file),
            Err(std::fs::TryLockError::WouldBlock) if tokio::time::Instant::now() < deadline => {
                tokio::time::sleep(INDEX_HOLD_POLL).await;
            }
            Err(std::fs::TryLockError::WouldBlock) => anyhow::bail!(
                "another process is holding the checkpoint lock for this repository ({}), so \
                 the snapshot did not run",
                path.display()
            ),
            Err(std::fs::TryLockError::Error(_)) => break None,
        }
    };
    Ok(Arc::new(IndexHold {
        _guard: guard,
        file,
    }))
}

/// Remove the lock a killed git left on `index`, so one interrupted snapshot
/// does not stop every later one. Only a lock this caller can prove nobody
/// holds is removed: the caller holds `hold` since `acquired`, every git of
/// ours on the index, in this process or another, holds the same until it
/// exits, and the lock is older than `acquired` by [`STALE_LOCK_MARGIN`].
/// Without the file lock, or without a modification time, the lock stays and
/// the snapshot fails on it instead.
fn clear_stale_index_lock(index: &Path, acquired: SystemTime, hold: &IndexHold) -> Result<()> {
    if hold.file.is_none() {
        return Ok(());
    }
    let lock = index_lock(index);
    let meta = match std::fs::symlink_metadata(&lock) {
        Ok(meta) => meta,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error).with_context(|| format!("inspect {}", lock.display())),
    };
    let stale = meta.modified().is_ok_and(|modified| {
        modified
            .checked_add(STALE_LOCK_MARGIN)
            .is_some_and(|limit| limit < acquired)
    });
    if stale {
        std::fs::remove_file(&lock).with_context(|| format!("remove {}", lock.display()))?;
    }
    Ok(())
}

/// A private index is trusted only as a regular file: anything else in its
/// place is removed and the index seeded again.
fn verify_private_index(index: &Path) -> Result<()> {
    match std::fs::symlink_metadata(index) {
        Ok(meta) if meta.file_type().is_file() => Ok(()),
        Ok(meta) if meta.is_dir() => {
            std::fs::remove_dir_all(index).with_context(|| format!("remove {}", index.display()))
        }
        Ok(_) => std::fs::remove_file(index).with_context(|| format!("remove {}", index.display())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error).with_context(|| format!("inspect {}", index.display())),
    }
}

/// Write every file under `workdir` that git does not ignore into a tree,
/// staging through `index` rather than the repository's own index.
///
/// A missing private index is seeded from the real one so the first snapshot
/// of a large checkout reuses the stat data git already has instead of hashing
/// every file again. The real index is only ever read.
pub async fn snapshot_tree(
    runner: &dyn CommandRunner,
    workdir: &Path,
    index: &Path,
) -> Result<String> {
    Ok(snapshot(runner, workdir, index, &SnapshotLimits::default())
        .await?
        .tree)
}

/// [`snapshot_tree`] within `limits`.
pub async fn snapshot(
    runner: &dyn CommandRunner,
    workdir: &Path,
    index: &Path,
    limits: &SnapshotLimits,
) -> Result<Snapshotted> {
    verify_repository_config(runner, workdir, workdir, ConfigUse::CONTENT).await?;
    let held = hold_index(index).await?;
    clear_stale_index_lock(index, SystemTime::now(), &held)?;
    verify_private_index(index)?;
    if !index.exists() {
        if let Some(parent) = index.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("create {}", parent.display()))?;
        }
        let real = Git::at(runner, workdir).git_path("index").await?;
        if real.is_file() {
            std::fs::copy(&real, index).with_context(|| format!("seed {}", index.display()))?;
        }
    }
    let git = Git::at(runner, workdir)
        .with_index(index)
        .with_timeout(GIT_SNAPSHOT_TIMEOUT)
        .holding(held);
    let scope = limits.scope.trim_end_matches('/');
    let scope = if scope.is_empty() { "." } else { scope };

    let mut skipped = Vec::new();
    if let Some(limit) = limits.max_untracked_bytes {
        let untracked = Git::at(runner, workdir)
            .with_env("GIT_LITERAL_PATHSPECS", "1")
            .with_timeout(GIT_SNAPSHOT_TIMEOUT)
            .ok([
                "ls-files",
                "-z",
                "--others",
                "--exclude-standard",
                "--",
                scope,
            ])
            .await?;
        for record in untracked.split(|byte| *byte == 0).filter(|r| !r.is_empty()) {
            let path = String::from_utf8_lossy(record).into_owned();
            let large = std::fs::symlink_metadata(workdir.join(&path))
                .is_ok_and(|meta| meta.is_file() && meta.len() > limit);
            if large {
                skipped.push(path);
            }
        }
    }

    let mut pathspecs = format!(":(literal){scope}\0").into_bytes();
    for path in &skipped {
        pathspecs.extend_from_slice(format!(":(exclude,literal){path}\0").as_bytes());
    }
    git.ok_with_input(
        [
            "add",
            "--all",
            "--pathspec-from-file=-",
            "--pathspec-file-nul",
        ],
        Some(pathspecs),
    )
    .await?;
    if !skipped.is_empty() {
        let mut paths = Vec::new();
        for path in &skipped {
            paths.extend_from_slice(path.as_bytes());
            paths.push(0);
        }
        git.ok_with_input(
            ["update-index", "--force-remove", "-z", "--stdin"],
            Some(paths),
        )
        .await?;
    }
    Ok(Snapshotted {
        tree: git.text(["write-tree"]).await?,
        skipped,
    })
}

/// The tree a commit-ish points at.
pub async fn tree_of(
    runner: &dyn CommandRunner,
    workdir: &Path,
    commitish: &str,
) -> Result<String> {
    if commitish.starts_with('-') {
        anyhow::bail!("refusing a revision that starts with '-': {commitish:?}");
    }
    let spec = format!("{commitish}^{{tree}}");
    Git::at(runner, workdir)
        .text(["rev-parse", "--verify", spec.as_str()])
        .await
}

pub async fn commit_tree(
    runner: &dyn CommandRunner,
    workdir: &Path,
    tree: &str,
    parent: Option<&str>,
    message: &str,
) -> Result<String> {
    let mut args = vec!["commit-tree", "--no-gpg-sign", tree];
    if let Some(parent) = parent {
        args.push("-p");
        args.push(parent);
    }
    args.push("-F");
    args.push("-");
    let stdout = Git::at(runner, workdir)
        .with_identity(IDENTITY_NAME, IDENTITY_EMAIL)
        .ok_with_input(args, Some(message.as_bytes().to_vec()))
        .await?;
    Ok(String::from_utf8_lossy(&stdout).trim().to_string())
}

/// Point `name` at `commit` only while it still points at `previous`, or with
/// `None` only while it does not exist, so of two writers that read the same
/// ref, the second is refused rather than silently dropping the first's work.
pub async fn update_ref(
    runner: &dyn CommandRunner,
    workdir: &Path,
    name: &str,
    commit: &str,
    previous: Option<&str>,
) -> Result<()> {
    verify_repository_config(runner, workdir, workdir, ConfigUse::REFS).await?;
    Git::at(runner, workdir)
        .ok([
            "update-ref",
            "-m",
            "agiworkforce",
            name,
            commit,
            previous.unwrap_or(""),
        ])
        .await
        .map(|_| ())
}

/// Delete `name` only while it still points at `previous`.
pub async fn delete_ref(
    runner: &dyn CommandRunner,
    workdir: &Path,
    name: &str,
    previous: &str,
) -> Result<()> {
    verify_repository_config(runner, workdir, workdir, ConfigUse::REFS).await?;
    Git::at(runner, workdir)
        .ok(["update-ref", "-d", name, previous])
        .await
        .map(|_| ())
}

pub async fn resolve_ref(
    runner: &dyn CommandRunner,
    workdir: &Path,
    name: &str,
) -> Result<Option<String>> {
    let output = Git::at(runner, workdir)
        .run(["rev-parse", "--verify", "--quiet", name], None)
        .await?;
    Ok(output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .filter(|oid| !oid.is_empty()))
}

/// Paths that differ between two trees, renames reported as a delete and an
/// add so every path is restorable on its own.
pub async fn diff_trees(
    runner: &dyn CommandRunner,
    workdir: &Path,
    from: &str,
    to: &str,
) -> Result<Vec<TreeChange>> {
    diff_trees_within(runner, workdir, from, to, "").await
}

/// [`diff_trees`] limited to `scope`, a directory relative to the top of the
/// checkout; empty for all of it.
pub async fn diff_trees_within(
    runner: &dyn CommandRunner,
    workdir: &Path,
    from: &str,
    to: &str,
    scope: &str,
) -> Result<Vec<TreeChange>> {
    let git = Git::at(runner, workdir).with_env("GIT_LITERAL_PATHSPECS", "1");
    let scope = scope.trim_end_matches('/');
    let mut names_args = vec![
        "diff-tree",
        "-r",
        "-z",
        "--no-renames",
        "--name-status",
        from,
        to,
    ];
    let mut numstat_args = vec![
        "diff-tree",
        "-r",
        "-z",
        "--no-renames",
        "--numstat",
        from,
        to,
    ];
    if !scope.is_empty() {
        names_args.extend(["--", scope]);
        numstat_args.extend(["--", scope]);
    }
    let names = git.ok(names_args).await?;
    let numstat = git.ok(numstat_args).await?;
    let binary = binary_paths(&numstat);
    Ok(parse_name_status(&names)
        .into_iter()
        .map(|(path, status)| TreeChange {
            binary: binary.contains(&path),
            path,
            status,
        })
        .collect())
}

fn parse_name_status(raw: &[u8]) -> Vec<(String, ChangeStatus)> {
    let mut fields = raw
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty());
    let mut changes = Vec::new();
    while let (Some(code), Some(path)) = (fields.next(), fields.next()) {
        let status = match code.first() {
            Some(b'A') => ChangeStatus::Added,
            Some(b'D') => ChangeStatus::Deleted,
            _ => ChangeStatus::Modified,
        };
        changes.push((String::from_utf8_lossy(path).into_owned(), status));
    }
    changes
}

fn binary_paths(raw: &[u8]) -> HashSet<String> {
    raw.split(|byte| *byte == 0)
        .filter_map(|record| {
            let text = String::from_utf8_lossy(record);
            let mut parts = text.splitn(3, '\t');
            let added = parts.next()?;
            let deleted = parts.next()?;
            let path = parts.next()?;
            (added == "-" && deleted == "-").then(|| path.to_string())
        })
        .collect()
}

/// The patch that turns `from` into `to` for one path, split into hunks.
pub async fn file_patch(
    runner: &dyn CommandRunner,
    workdir: &Path,
    from: &str,
    to: &str,
    change: &TreeChange,
) -> Result<FilePatch> {
    let raw = Git::at(runner, workdir)
        .with_env("GIT_LITERAL_PATHSPECS", "1")
        .ok([
            "diff-tree",
            "-p",
            "--no-renames",
            "--full-index",
            "--binary",
            "--no-color",
            "--no-ext-diff",
            "--no-textconv",
            from,
            to,
            "--",
            change.path.as_str(),
        ])
        .await?;
    let text = String::from_utf8_lossy(&raw).into_owned();
    let (header, hunks) = split_hunks(&text);
    Ok(FilePatch {
        path: change.path.clone(),
        status: change.status,
        binary: change.binary,
        header,
        hunks,
        text,
    })
}

/// Split a single-file patch at each `@@` line. A binary patch has no hunks.
pub fn split_hunks(patch: &str) -> (String, Vec<Hunk>) {
    let mut header = String::new();
    let mut hunks: Vec<Hunk> = Vec::new();
    for line in patch.split_inclusive('\n') {
        if line.starts_with("@@") {
            hunks.push(Hunk {
                index: hunks.len(),
                header: line.trim_end().to_string(),
                text: line.to_string(),
            });
        } else if let Some(current) = hunks.last_mut() {
            current.text.push_str(line);
        } else {
            header.push_str(line);
        }
    }
    (header, hunks)
}

/// The patch narrowed to the chosen hunks, or the whole patch when none are
/// named. Hunks go in patch order once each, however they were named, since
/// `git apply` needs them in order; an index past the end is refused rather
/// than silently dropped.
pub fn select_hunks(patch: &FilePatch, chosen: &[usize]) -> Result<String> {
    if chosen.is_empty() {
        return Ok(patch.text.clone());
    }
    if patch.binary || patch.hunks.is_empty() {
        anyhow::bail!(
            "{} has no hunks to choose from; take or leave the whole file",
            patch.path
        );
    }
    let mut chosen = chosen.to_vec();
    chosen.sort_unstable();
    chosen.dedup();
    let mut text = patch.header.clone();
    for index in &chosen {
        let hunk = patch
            .hunks
            .get(*index)
            .with_context(|| format!("{} has no hunk {index}", patch.path))?;
        text.push_str(&hunk.text);
    }
    Ok(text)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PatchTarget {
    /// The files on disk, leaving every index alone.
    WorkingTree,
    /// The repository's own index, which is what staging means.
    Index,
}

/// Apply a patch, or with `check` only report whether it would apply. Returns
/// git's refusal as the error so a caller can say why a section conflicted.
pub async fn apply_patch(
    runner: &dyn CommandRunner,
    workdir: &Path,
    patch: &str,
    reverse: bool,
    target: PatchTarget,
    check: bool,
) -> Result<()> {
    let mut args = vec!["apply", "--whitespace=nowarn"];
    if reverse {
        args.push("-R");
    }
    if target == PatchTarget::Index {
        args.push("--cached");
    }
    if check {
        args.push("--check");
    }
    args.push("-");
    verify_repository_config(runner, workdir, workdir, ConfigUse::CONTENT).await?;
    Git::at(runner, workdir)
        .ok_with_input(args, Some(patch.as_bytes().to_vec()))
        .await
        .map(|_| ())
}

/// Every blob in a tree, by path.
pub async fn tree_entries(
    runner: &dyn CommandRunner,
    workdir: &Path,
    tree: &str,
) -> Result<HashMap<String, TreeEntry>> {
    let raw = Git::at(runner, workdir)
        .ok(["ls-tree", "-r", "-z", "--full-tree", tree])
        .await?;
    Ok(raw
        .split(|byte| *byte == 0)
        .filter_map(|record| {
            let text = String::from_utf8_lossy(record);
            let (meta, path) = text.split_once('\t')?;
            let mut parts = meta.split(' ');
            let mode = parts.next()?.to_string();
            let _kind = parts.next()?;
            let oid = parts.next()?.to_string();
            Some((path.to_string(), TreeEntry { mode, oid }))
        })
        .collect())
}

pub fn is_special_mode(mode: &str) -> bool {
    mode == SYMLINK_MODE || mode == GITLINK_MODE
}

/// `path` as one C-quoted line, the form `--stdin-paths` unquotes, so a path
/// that begins with a quote or holds a line break reaches git intact.
fn c_quoted(path: &str) -> String {
    let mut quoted = String::with_capacity(path.len() + 2);
    quoted.push('"');
    for ch in path.chars() {
        match ch {
            '"' => quoted.push_str("\\\""),
            '\\' => quoted.push_str("\\\\"),
            '\n' => quoted.push_str("\\n"),
            '\t' => quoted.push_str("\\t"),
            '\r' => quoted.push_str("\\r"),
            ch if (ch as u32) < 0x20 || ch == '\u{7f}' => {
                quoted.push_str(&format!("\\{:03o}", ch as u32));
            }
            ch => quoted.push(ch),
        }
    }
    quoted.push('"');
    quoted
}

/// What the files at `paths` would hash to as blobs, with this checkout's
/// attributes applied. A path that is missing, not a regular file, or reached
/// through a symlinked directory has none, so a caller treats it as differing.
pub async fn worktree_blobs(
    runner: &dyn CommandRunner,
    workdir: &Path,
    paths: &[String],
) -> Result<HashMap<String, String>> {
    let present: Vec<&String> = paths
        .iter()
        .filter(|path| {
            path_inside(workdir, path).is_ok_and(|absolute| {
                std::fs::symlink_metadata(absolute).is_ok_and(|meta| meta.file_type().is_file())
            })
        })
        .collect();
    if present.is_empty() {
        return Ok(HashMap::new());
    }
    verify_repository_config(runner, workdir, workdir, ConfigUse::CONTENT).await?;
    let mut input = String::new();
    for path in &present {
        input.push_str(&c_quoted(path));
        input.push('\n');
    }
    let stdout = Git::at(runner, workdir)
        .ok_with_input(["hash-object", "--stdin-paths"], Some(input.into_bytes()))
        .await?;
    let hashes = String::from_utf8_lossy(&stdout);
    Ok(present
        .into_iter()
        .cloned()
        .zip(hashes.lines().map(str::to_string))
        .collect())
}

/// Make the files at `write` match `tree`, and delete the files at `remove`,
/// in `workdir`. Writing goes through a throwaway index so filters, modes and
/// symlinks come out exactly as a checkout would make them. Every path is
/// checked before anything changes: one that leaves the checkout, or runs
/// through a symlinked directory, refuses the whole set.
pub async fn write_paths_from_tree(
    runner: &dyn CommandRunner,
    workdir: &Path,
    tree: &str,
    write: &[String],
    remove: &[String],
    scratch_index: &Path,
) -> Result<()> {
    if !write.is_empty() {
        verify_repository_config(runner, workdir, workdir, ConfigUse::CONTENT).await?;
    }
    let mut removals = Vec::with_capacity(remove.len());
    for path in remove.iter().chain(write) {
        let absolute = path_inside(workdir, path)
            .map_err(|reason| anyhow::anyhow!("refusing {path}: {reason}"))?;
        if removals.len() < remove.len() {
            removals.push(absolute);
        }
    }
    for absolute in removals {
        match std::fs::remove_file(&absolute) {
            Ok(()) => prune_empty_parents(workdir, &absolute),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(error).with_context(|| format!("remove {}", absolute.display()))
            }
        }
    }
    if write.is_empty() {
        return Ok(());
    }
    let held = hold_index(scratch_index).await?;
    clear_stale_index_lock(scratch_index, SystemTime::now(), &held)?;
    let _ = std::fs::remove_file(scratch_index);
    let git = Git::at(runner, workdir)
        .with_index(scratch_index)
        .with_timeout(GIT_SNAPSHOT_TIMEOUT)
        .holding(held);
    let result = async {
        git.ok(["read-tree", tree]).await?;
        let mut input = Vec::new();
        for path in write {
            input.extend_from_slice(path.as_bytes());
            input.push(0);
        }
        git.ok_with_input(["checkout-index", "-f", "-z", "--stdin"], Some(input))
            .await
            .map(|_| ())
    }
    .await;
    let _ = std::fs::remove_file(scratch_index);
    result
}

fn prune_empty_parents(workdir: &Path, removed: &Path) {
    let mut current = removed.parent();
    while let Some(dir) = current {
        if dir == workdir || !dir.starts_with(workdir) {
            break;
        }
        if std::fs::remove_dir(dir).is_err() {
            break;
        }
        current = dir.parent();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::test_support::{git, init_repo};
    use crate::runner::TokioCommandRunner;

    #[test]
    fn hunks_split_at_each_range_line_and_keep_the_header() {
        let patch = "diff --git a/a.txt b/a.txt\n\
                     index 1111111..2222222 100644\n\
                     --- a/a.txt\n\
                     +++ b/a.txt\n\
                     @@ -1,2 +1,2 @@\n\
                     -one\n\
                     +uno\n \
                     two\n\
                     @@ -10,1 +10,1 @@\n\
                     -ten\n\
                     +diez\n";
        let (header, hunks) = split_hunks(patch);
        assert!(header.starts_with("diff --git"));
        assert!(header.ends_with("+++ b/a.txt\n"));
        assert_eq!(hunks.len(), 2);
        assert_eq!(hunks[1].header, "@@ -10,1 +10,1 @@");
        assert!(hunks[1].text.ends_with("+diez\n"));
    }

    #[test]
    fn choosing_a_hunk_that_does_not_exist_is_refused() {
        let (header, hunks) = split_hunks("diff --git a/a b/a\n@@ -1 +1 @@\n-a\n+b\n");
        let patch = FilePatch {
            path: "a".into(),
            status: ChangeStatus::Modified,
            binary: false,
            header,
            hunks,
            text: String::new(),
        };
        assert!(select_hunks(&patch, &[3]).is_err());
        assert!(select_hunks(&patch, &[0]).unwrap().contains("+b"));
    }

    #[test]
    fn chosen_hunks_go_in_patch_order_once_each() {
        let (header, hunks) =
            split_hunks("diff --git a/a b/a\n@@ -1 +1 @@\n-a\n+b\n@@ -9 +9 @@\n-y\n+z\n");
        let patch = FilePatch {
            path: "a".into(),
            status: ChangeStatus::Modified,
            binary: false,
            header,
            hunks,
            text: String::new(),
        };
        let text = select_hunks(&patch, &[1, 0, 1]).unwrap();
        assert_eq!(text.matches("@@ -9").count(), 1);
        assert!(text.find("@@ -1").unwrap() < text.find("@@ -9").unwrap());
    }

    #[tokio::test]
    async fn a_scoped_snapshot_leaves_out_large_untracked_files_and_other_directories() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        std::fs::create_dir_all(repo.path().join("app")).unwrap();
        std::fs::write(repo.path().join("app/small.txt"), "small\n").unwrap();
        std::fs::write(repo.path().join("app/big.bin"), vec![0u8; 4096]).unwrap();
        std::fs::write(repo.path().join("outside.txt"), "not in scope\n").unwrap();
        let index = repo.path().join(".git/agi-scoped.index");
        let head_tree = tree_of(&TokioCommandRunner, repo.path(), "HEAD")
            .await
            .unwrap();

        let snapshotted = snapshot(
            &TokioCommandRunner,
            repo.path(),
            &index,
            &SnapshotLimits {
                scope: "app/".into(),
                max_untracked_bytes: Some(1024),
            },
        )
        .await
        .unwrap();

        assert_eq!(snapshotted.skipped, vec!["app/big.bin"]);
        let changes = diff_trees(
            &TokioCommandRunner,
            repo.path(),
            &head_tree,
            &snapshotted.tree,
        )
        .await
        .unwrap();
        let paths: Vec<_> = changes.iter().map(|change| change.path.as_str()).collect();
        assert_eq!(paths, vec!["app/small.txt"]);
    }

    #[tokio::test]
    async fn a_lock_left_by_a_killed_snapshot_does_not_stop_the_next_one() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let index = repo.path().join(".git/agi-locked.index");
        snapshot_tree(&TokioCommandRunner, repo.path(), &index)
            .await
            .unwrap();
        let lock = index_lock(&index);
        std::fs::write(&lock, b"").unwrap();
        let earlier = SystemTime::now() - Duration::from_secs(3600);
        std::fs::File::options()
            .write(true)
            .open(&lock)
            .unwrap()
            .set_modified(earlier)
            .unwrap();

        snapshot_tree(&TokioCommandRunner, repo.path(), &index)
            .await
            .expect("an old lock no git of ours holds is cleared");

        std::fs::write(&lock, b"").unwrap();
        assert!(
            snapshot_tree(&TokioCommandRunner, repo.path(), &index)
                .await
                .is_err(),
            "a lock made just now may belong to a git that is still starting"
        );
        let _ = std::fs::remove_file(&lock);
    }

    #[tokio::test]
    async fn an_old_lock_stays_while_another_process_holds_the_index() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let index = repo.path().join(".git/agiworkforce/shared.index");
        snapshot_tree(&TokioCommandRunner, repo.path(), &index)
            .await
            .unwrap();
        let other = std::fs::OpenOptions::new()
            .write(true)
            .open(index_guard_file(&index))
            .unwrap();
        other.lock().unwrap();
        let lock = index_lock(&index);
        std::fs::write(&lock, b"").unwrap();
        std::fs::File::options()
            .write(true)
            .open(&lock)
            .unwrap()
            .set_modified(SystemTime::now() - Duration::from_secs(3600))
            .unwrap();

        let waiting = tokio::spawn({
            let repo = repo.path().to_path_buf();
            let index = index.clone();
            async move { snapshot_tree(&TokioCommandRunner, &repo, &index).await }
        });
        tokio::time::sleep(Duration::from_millis(300)).await;
        assert!(
            lock.exists(),
            "a lock was cleared while another process held the index"
        );
        assert!(!waiting.is_finished());
        drop(other);
        waiting
            .await
            .unwrap()
            .expect("once the other process lets go, its old lock is stale");
    }

    #[tokio::test(start_paused = true)]
    async fn a_held_index_lock_fails_the_snapshot_after_a_bounded_wait() {
        let repo = tempfile::tempdir().unwrap();
        let index = repo.path().join(".git/agiworkforce/held.index");
        let guard = index_guard_file(&index);
        assert!(
            !guard.starts_with(repo.path()),
            "the lock file lives outside the repository, where no command can open it"
        );
        crate::git::create_private_dir(guard.parent().unwrap()).unwrap();
        let other = std::fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .open(&guard)
            .unwrap();
        other.lock().unwrap();

        let refused = hold_index_within(&index, Duration::from_secs(5))
            .await
            .err()
            .expect("a lock held past the limit refuses");
        assert!(
            refused
                .to_string()
                .contains("another process is holding the checkpoint lock"),
            "{refused}"
        );
        drop(other);
        assert!(hold_index_within(&index, Duration::from_secs(5))
            .await
            .unwrap()
            .file
            .is_some());
    }

    #[tokio::test]
    async fn a_ref_update_is_refused_once_the_ref_has_moved() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let head = git(repo.path(), &["rev-parse", "HEAD"]);
        git(
            repo.path(),
            &["commit", "--allow-empty", "-q", "-m", "second"],
        );
        let second = git(repo.path(), &["rev-parse", "HEAD"]);
        let name = "refs/agiworkforce/probe";

        update_ref(&TokioCommandRunner, repo.path(), name, &head, None)
            .await
            .unwrap();
        assert!(
            update_ref(&TokioCommandRunner, repo.path(), name, &second, None)
                .await
                .is_err(),
            "creating a ref that exists is refused"
        );
        assert!(
            update_ref(
                &TokioCommandRunner,
                repo.path(),
                name,
                &second,
                Some(&second)
            )
            .await
            .is_err(),
            "moving a ref from a value it does not hold is refused"
        );
        assert_eq!(git(repo.path(), &["rev-parse", name]), head);
        update_ref(&TokioCommandRunner, repo.path(), name, &second, Some(&head))
            .await
            .unwrap();
        assert!(delete_ref(&TokioCommandRunner, repo.path(), name, &head)
            .await
            .is_err());
        delete_ref(&TokioCommandRunner, repo.path(), name, &second)
            .await
            .unwrap();
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn writing_through_a_symlinked_directory_is_refused_before_anything_changes() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let head_tree = tree_of(&TokioCommandRunner, repo.path(), "HEAD")
            .await
            .unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("victim.txt"), "keep\n").unwrap();
        std::os::unix::fs::symlink(outside.path(), repo.path().join("linked")).unwrap();
        std::fs::write(repo.path().join("README.md"), "edited\n").unwrap();

        let refused = write_paths_from_tree(
            &TokioCommandRunner,
            repo.path(),
            &head_tree,
            &["README.md".to_string()],
            &["linked/victim.txt".to_string()],
            &repo.path().join(".git/agi-scratch.index"),
        )
        .await;

        assert!(refused.is_err());
        assert!(outside.path().join("victim.txt").exists());
        assert_eq!(
            std::fs::read_to_string(repo.path().join("README.md")).unwrap(),
            "edited\n"
        );
    }

    #[test]
    fn paths_are_c_quoted_for_stdin_paths() {
        assert_eq!(c_quoted("plain.txt"), "\"plain.txt\"");
        assert_eq!(c_quoted("\"lead"), "\"\\\"lead\"");
        assert_eq!(c_quoted("a\\b\nc\u{1}"), "\"a\\\\b\\nc\\001\"");
        assert_eq!(c_quoted("\u{e9}t\u{e9}"), "\"\u{e9}t\u{e9}\"");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn paths_with_quotes_and_line_breaks_get_their_own_blobs() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let names = ["\"quoted.txt", "odd\nname", "back\\slash"];
        for (n, name) in names.iter().enumerate() {
            std::fs::write(repo.path().join(name), format!("content {n}\n")).unwrap();
        }
        let mut paths: Vec<String> = names.iter().map(|name| name.to_string()).collect();
        paths.push("README.md".to_string());
        paths.push("missing.txt".to_string());

        let blobs = worktree_blobs(&TokioCommandRunner, repo.path(), &paths)
            .await
            .unwrap();

        assert_eq!(blobs.len(), 4, "{blobs:?}");
        assert!(!blobs.contains_key("missing.txt"));
        for (n, name) in names.iter().enumerate() {
            let expected = Git::at(&TokioCommandRunner, repo.path())
                .ok_with_input(
                    ["hash-object", "--stdin"],
                    Some(format!("content {n}\n").into_bytes()),
                )
                .await
                .unwrap();
            assert_eq!(
                blobs[*name],
                String::from_utf8_lossy(&expected).trim(),
                "{name:?}"
            );
        }
    }

    #[tokio::test]
    async fn a_snapshot_sees_untracked_files_and_leaves_the_real_index_alone() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let staged_before = git(repo.path(), &["diff", "--cached", "--name-only"]);
        std::fs::write(repo.path().join("README.md"), "changed\n").unwrap();
        std::fs::write(repo.path().join("new.txt"), "fresh\n").unwrap();
        let index = repo.path().join(".git/agi-test.index");

        let head_tree = tree_of(&TokioCommandRunner, repo.path(), "HEAD")
            .await
            .unwrap();
        let snapshot = snapshot_tree(&TokioCommandRunner, repo.path(), &index)
            .await
            .unwrap();
        let changes = diff_trees(&TokioCommandRunner, repo.path(), &head_tree, &snapshot)
            .await
            .unwrap();

        let paths: Vec<_> = changes.iter().map(|change| change.path.as_str()).collect();
        assert_eq!(paths, vec!["README.md", "new.txt"]);
        assert_eq!(changes[1].status, ChangeStatus::Added);
        assert_eq!(
            git(repo.path(), &["diff", "--cached", "--name-only"]),
            staged_before
        );
    }

    #[tokio::test]
    async fn writing_paths_from_a_tree_restores_and_deletes_without_staging() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let head_tree = tree_of(&TokioCommandRunner, repo.path(), "HEAD")
            .await
            .unwrap();
        std::fs::write(repo.path().join("README.md"), "edited\n").unwrap();
        std::fs::create_dir_all(repo.path().join("made/by")).unwrap();
        std::fs::write(repo.path().join("made/by/agent.txt"), "x\n").unwrap();

        write_paths_from_tree(
            &TokioCommandRunner,
            repo.path(),
            &head_tree,
            &["README.md".to_string()],
            &["made/by/agent.txt".to_string()],
            &repo.path().join(".git/agi-scratch.index"),
        )
        .await
        .unwrap();

        assert_eq!(
            std::fs::read_to_string(repo.path().join("README.md")).unwrap(),
            "hello\n"
        );
        assert!(!repo.path().join("made").exists());
        assert_eq!(git(repo.path(), &["status", "--porcelain"]), "");
    }

    /// A runner whose subprocesses outlive the call, keeping what they were
    /// handed until the test lets them go.
    struct Detached(StdMutex<Vec<crate::runner::Held>>);

    #[async_trait::async_trait]
    impl CommandRunner for Detached {
        async fn output(
            &self,
            command: tokio::process::Command,
            stdin: Option<Vec<u8>>,
            timeout: Option<Duration>,
        ) -> std::io::Result<std::process::Output> {
            TokioCommandRunner.output(command, stdin, timeout).await
        }

        async fn output_holding(
            &self,
            command: tokio::process::Command,
            stdin: Option<Vec<u8>>,
            timeout: Option<Duration>,
            held: crate::runner::Held,
        ) -> std::io::Result<std::process::Output> {
            self.0.lock().unwrap().push(held);
            self.output(command, stdin, timeout).await
        }
    }

    #[tokio::test]
    async fn the_private_index_stays_locked_while_a_git_that_staged_through_it_lives() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let index = repo.path().join(".git/agiworkforce/held.index");
        let runner = Detached(StdMutex::new(Vec::new()));

        snapshot_tree(&runner, repo.path(), &index).await.unwrap();

        assert!(
            index_guard(&index).try_lock().is_err(),
            "the index was released while its git was still counted as running"
        );
        runner.0.lock().unwrap().clear();
        assert!(index_guard(&index).try_lock().is_ok());
    }
}
