//! Git worktree wrapper for the EnterWorktree / ExitWorktree agent tools.
//!
//! Provides a thin shell over `git worktree add` / `git worktree remove`.

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};

use crate::checkpoint::Workspace;
use crate::config_guard::{verify_repository_config, ConfigUse};
use crate::git::{common_dir, git_command, linked_git_dir, status_paths, GIT_TIMEOUT};
use crate::porcelain::{parse_worktree_porcelain, WorktreeEntry};
use crate::runner::{CommandRunner, PinnedRunner};

#[derive(Debug, Clone)]
pub struct WorktreeOptions {
    /// Branch name to create (or check out). Required.
    pub branch: String,
    /// Optional commit/ref to base the worktree on. None = HEAD.
    pub base: Option<String>,
    /// Where to put the worktree dir. None = sibling of the repo with -<branch> suffix.
    pub target_dir: Option<PathBuf>,
}

#[derive(Debug, Clone)]
pub struct Worktree {
    pub branch: String,
    pub path: PathBuf,
}

pub async fn enter_worktree(
    runner: &dyn CommandRunner,
    repo: &Path,
    opts: WorktreeOptions,
) -> Result<Worktree> {
    let target = opts.target_dir.unwrap_or_else(|| {
        let parent = repo.parent().unwrap_or(repo);
        parent.join(format!(
            "{}-{}",
            repo.file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default(),
            opts.branch
        ))
    });
    // Reject agent-controlled values that would be parsed as git options. The
    // `--` separator below protects the positional <path>/<commit-ish> args, but
    // `-b <branch>` is an option-argument, so guard the branch name explicitly
    // to keep a dash-prefixed value from being mis-parsed.
    if opts.branch.starts_with('-') {
        anyhow::bail!(
            "worktree branch name must not start with '-': {:?}",
            opts.branch
        );
    }
    if let Some(base) = opts.base.as_deref() {
        if base.starts_with('-') {
            anyhow::bail!("worktree base ref must not start with '-': {base:?}");
        }
    }
    verify_repository_config(runner, repo, repo, ConfigUse::CONTENT).await?;
    let mut cmd = git_command(repo).await?;
    cmd.arg("worktree")
        .arg("add")
        .arg("-b")
        .arg(&opts.branch)
        // End-of-options separator: everything after `--` is treated as a
        // positional path/commit-ish, never a git option (argument injection).
        .arg("--")
        .arg(&target);
    if let Some(base) = opts.base {
        cmd.arg(base);
    }
    let output = runner
        .output(cmd, None, Some(GIT_TIMEOUT))
        .await
        .context("invoke git worktree add")?;
    if !output.status.success() {
        anyhow::bail!(
            "git worktree add failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    Ok(Worktree {
        branch: opts.branch,
        path: target,
    })
}

/// Paths a checkout holds that are not committed, or `None` when git could not
/// say. A repository whose settings the guard refuses is an error, never
/// "not known to be dirty". A submodule's own changes are not looked for:
/// git would read them with the configuration of whatever git directory the
/// submodule's `.git` file names. A moved submodule pointer is still a change
/// here, since comparing commits runs nothing in the submodule.
pub(crate) async fn uncommitted_paths(
    runner: &dyn CommandRunner,
    worktree_path: &Path,
) -> Result<Option<Vec<String>>> {
    verify_repository_config(runner, worktree_path, worktree_path, ConfigUse::CONTENT).await?;
    let mut command = git_command(worktree_path).await?;
    command.args([
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
        "--ignore-submodules=dirty",
    ]);
    let Ok(output) = runner.output(command, None, Some(GIT_TIMEOUT)).await else {
        return Ok(None);
    };
    Ok(output
        .status
        .success()
        .then(|| status_paths(&output.stdout)))
}

/// Why a linked worktree cannot be removed without the user's explicit
/// `force`: what a plain `git worktree remove` would refuse over, found
/// without letting git run its own `git status` in the checkout, which
/// would obey whatever the checkout's settings name.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum RemovalBlocker {
    /// Git could not say what the checkout holds.
    Unreadable,
    /// Uncommitted or untracked paths, sorted, each once.
    Changes(Vec<String>),
    /// A submodule is checked out inside it.
    Submodules,
}

impl RemovalBlocker {
    pub(crate) fn describe(&self) -> String {
        match self {
            Self::Unreadable => "could not be read to see what it holds".to_string(),
            Self::Changes(paths) => format!("has uncommitted changes: {}", paths.join(", ")),
            Self::Submodules => "has a submodule checked out in it".to_string(),
        }
    }
}

/// What stops the worktree checked out at `checkout`, whose private git
/// directory is `git_dir`, from being removed, or `None` when nothing does
/// and `git worktree remove --force` loses nothing, as when the checkout is
/// already gone. `runner` runs git pinned to that worktree. A refusal of the
/// repository's settings is an error.
pub(crate) async fn removal_blocker(
    runner: &dyn CommandRunner,
    checkout: &Path,
    git_dir: &Path,
) -> Result<Option<RemovalBlocker>> {
    if std::fs::symlink_metadata(checkout).is_err() {
        return Ok(None);
    }
    match uncommitted_paths(runner, checkout).await? {
        None => return Ok(Some(RemovalBlocker::Unreadable)),
        Some(mut paths) if !paths.is_empty() => {
            paths.sort();
            paths.dedup();
            return Ok(Some(RemovalBlocker::Changes(paths)));
        }
        Some(_) => {}
    }
    if holds_submodules(runner, checkout, git_dir).await? {
        return Ok(Some(RemovalBlocker::Submodules));
    }
    Ok(None)
}

/// Whether a submodule is checked out in the worktree at `checkout`, as git
/// decides before it refuses to remove one: its git directory holds
/// `modules`, or a gitlink in its index has a `.git` in the checkout.
async fn holds_submodules(
    runner: &dyn CommandRunner,
    checkout: &Path,
    git_dir: &Path,
) -> Result<bool> {
    if git_dir.join("modules").is_dir() {
        return Ok(true);
    }
    let mut command = git_command(checkout).await?;
    command.args(["ls-files", "--stage", "-z"]);
    let output = runner
        .output(command, None, Some(GIT_TIMEOUT))
        .await
        .context("invoke git ls-files")?;
    if !output.status.success() {
        anyhow::bail!(
            "git ls-files failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    Ok(output
        .stdout
        .split(|byte| *byte == 0)
        .filter(|record| record.starts_with(b"160000 "))
        .filter_map(|record| record.splitn(2, |byte| *byte == b'\t').nth(1))
        .any(|path| {
            std::fs::symlink_metadata(checkout.join(&*String::from_utf8_lossy(path)).join(".git"))
                .is_ok()
        }))
}

/// Remove the linked worktree of `repo`'s repository checked out at
/// `worktree_path`. Every git this runs names its git directory: the
/// repository's own for the removal, and for the worktree the private
/// directory the repository keeps for it, so a path naming anything else,
/// such as a repository a sandboxed command created with its own filters, is
/// refused before git runs there.
///
/// Whether the worktree may go is decided here, from a status read under the
/// guard, and git is then told `--force`, so it never runs a status of its
/// own in a checkout whose settings were not checked.
pub async fn exit_worktree(
    runner: &dyn CommandRunner,
    repo: &Path,
    worktree_path: &Path,
) -> Result<()> {
    let workspace = Workspace::discover(runner, repo)
        .await?
        .ok_or_else(|| anyhow::anyhow!("{} is not inside a git working tree", repo.display()))?;
    let checkout = repo.join(worktree_path);
    let checkout = std::fs::canonicalize(&checkout).unwrap_or(checkout);
    let git_dir = linked_git_dir(&common_dir(workspace.git_dir()), &checkout).ok_or_else(|| {
        anyhow::anyhow!(
            "{} is not a linked worktree of the repository at {}",
            worktree_path.display(),
            workspace.top().display()
        )
    })?;
    let worktree = PinnedRunner::new(runner, git_dir.clone(), checkout.clone());

    // Name the files that would have been lost, which is the difference
    // between a user keeping their work and a user hunting for it.
    if let Some(blocker) = removal_blocker(&worktree, &checkout, &git_dir).await? {
        anyhow::bail!(
            "worktree {} {} and was not removed. Commit, stash or discard deliberately first.",
            worktree_path.display(),
            blocker.describe()
        );
    }

    let mut command = git_command(workspace.top()).await?;
    command
        .arg("worktree")
        .arg("remove")
        .arg("--force")
        .arg(&checkout);
    let output = workspace
        .runner(runner)
        .output(command, None, Some(GIT_TIMEOUT))
        .await
        .context("invoke git worktree remove")?;
    if !output.status.success() {
        anyhow::bail!(
            "git worktree remove failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    Ok(())
}

/// Every worktree git knows about, with its metadata.
pub async fn list_worktree_entries(
    runner: &dyn CommandRunner,
    repo: &Path,
) -> Result<Vec<WorktreeEntry>> {
    let mut command = git_command(repo).await?;
    command.arg("worktree").arg("list").arg("--porcelain");
    let output = runner
        .output(command, None, Some(GIT_TIMEOUT))
        .await
        .context("invoke git worktree list")?;
    if !output.status.success() {
        anyhow::bail!(
            "git worktree list failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    Ok(parse_worktree_porcelain(&String::from_utf8_lossy(
        &output.stdout,
    )))
}

pub async fn list_worktrees(runner: &dyn CommandRunner, repo: &Path) -> Result<Vec<Worktree>> {
    Ok(list_worktree_entries(runner, repo)
        .await?
        .into_iter()
        .filter_map(|entry| {
            entry.branch.map(|branch| Worktree {
                branch,
                path: entry.path,
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::test_support::init_repo;
    use crate::runner::TokioCommandRunner;

    #[tokio::test]
    async fn removing_a_dirty_worktree_names_what_would_be_lost() {
        let tmp = tempfile::tempdir().unwrap();
        init_repo(tmp.path());
        let worktrees = tempfile::tempdir().unwrap();
        let target = worktrees.path().join("dirty-guard");
        let worktree = enter_worktree(
            &TokioCommandRunner,
            tmp.path(),
            WorktreeOptions {
                branch: "dirty-guard".into(),
                base: None,
                target_dir: Some(target),
            },
        )
        .await
        .expect("enter");
        std::fs::write(worktree.path.join("unsaved.txt"), "work in progress").unwrap();

        let error = exit_worktree(&TokioCommandRunner, tmp.path(), &worktree.path)
            .await
            .expect_err("a dirty worktree must not be removed");

        assert!(error.to_string().contains("unsaved.txt"));
        assert!(worktree.path.exists());

        std::fs::remove_file(worktree.path.join("unsaved.txt")).unwrap();
        exit_worktree(&TokioCommandRunner, tmp.path(), &worktree.path)
            .await
            .expect("a clean worktree still removes");
    }

    async fn entered(repo: &Path, branch: &str) -> (tempfile::TempDir, Worktree) {
        let worktrees = tempfile::tempdir().unwrap();
        let worktree = enter_worktree(
            &TokioCommandRunner,
            repo,
            WorktreeOptions {
                branch: branch.into(),
                base: None,
                target_dir: Some(worktrees.path().join(branch)),
            },
        )
        .await
        .expect("enter");
        (worktrees, worktree)
    }

    #[tokio::test]
    async fn a_refused_filter_stops_removal_and_git_never_runs_it() {
        let tmp = tempfile::tempdir().unwrap();
        init_repo(tmp.path());
        let (_worktrees, worktree) = entered(tmp.path(), "filtered").await;
        std::fs::write(worktree.path.join(".gitattributes"), "*.txt filter=x\n").unwrap();
        std::fs::write(worktree.path.join("a.txt"), "a\n").unwrap();
        crate::git::test_support::git(&worktree.path, &["-c", "filter.x.clean=cat", "add", "-A"]);
        crate::git::test_support::git(&worktree.path, &["commit", "-q", "-m", "filtered"]);
        std::fs::File::options()
            .write(true)
            .open(worktree.path.join("a.txt"))
            .unwrap()
            .set_modified(std::time::SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1))
            .unwrap();
        let marker = tmp.path().join("filter-ran");
        crate::git::test_support::git(
            tmp.path(),
            &[
                "config",
                "filter.x.clean",
                &format!("touch '{}'; cat", marker.display()),
            ],
        );

        let error = exit_worktree(&TokioCommandRunner, tmp.path(), &worktree.path)
            .await
            .expect_err("a refused setting must stop the removal");

        assert!(
            error
                .downcast_ref::<crate::config_guard::UntrustedRepositoryConfig>()
                .is_some(),
            "{error}"
        );
        assert!(worktree.path.exists());
        assert!(!marker.exists(), "the refused filter ran under host git");
    }

    #[tokio::test]
    async fn a_worktree_with_a_submodule_checked_out_is_not_removed() {
        let tmp = tempfile::tempdir().unwrap();
        init_repo(tmp.path());
        let library = tempfile::tempdir().unwrap();
        init_repo(library.path());
        let (_worktrees, worktree) = entered(tmp.path(), "with-lib").await;
        crate::git::test_support::git(
            &worktree.path,
            &[
                "-c",
                "protocol.file.allow=always",
                "submodule",
                "add",
                "-q",
                library.path().to_str().unwrap(),
                "lib",
            ],
        );
        crate::git::test_support::git(&worktree.path, &["commit", "-q", "-m", "add lib"]);

        let error = exit_worktree(&TokioCommandRunner, tmp.path(), &worktree.path)
            .await
            .expect_err("git itself refuses a worktree holding a submodule");

        assert!(error.to_string().contains("submodule"), "{error}");
        assert!(worktree.path.join("lib").exists());
    }

    #[tokio::test]
    async fn exiting_refuses_a_path_that_is_not_a_worktree_of_this_repository() {
        let tmp = tempfile::tempdir().unwrap();
        init_repo(tmp.path());
        let planted = tmp.path().join("planted");
        std::fs::create_dir_all(&planted).unwrap();
        init_repo(&planted);
        let marker = tmp.path().join("filter-ran");
        crate::git::test_support::git(
            &planted,
            &[
                "config",
                "filter.probe.clean",
                &format!("touch '{}'; cat", marker.display()),
            ],
        );
        std::fs::write(planted.join(".gitattributes"), "* filter=probe\n").unwrap();
        std::fs::write(planted.join("README.md"), "changed\n").unwrap();

        let error = exit_worktree(&TokioCommandRunner, tmp.path(), &planted)
            .await
            .expect_err("a separate repository is not a worktree to remove");

        assert!(
            error.to_string().contains("not a linked worktree"),
            "{error}"
        );
        assert!(planted.exists());
        assert!(!marker.exists(), "a filter of the planted repository ran");
    }

    #[tokio::test]
    async fn worktree_entries_carry_head_and_branch() {
        let tmp = tempfile::tempdir().unwrap();
        init_repo(tmp.path());

        let entries = list_worktree_entries(&TokioCommandRunner, tmp.path())
            .await
            .expect("list");

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].branch.as_deref(), Some("main"));
        assert!(entries[0].head.is_some());
        assert!(entries[0].is_usable());
    }

    #[tokio::test]
    async fn worktree_roundtrip() {
        let tmp = tempfile::tempdir().unwrap();
        init_repo(tmp.path());
        let worktrees = tempfile::tempdir().unwrap();
        let opts = WorktreeOptions {
            branch: "feature-x".into(),
            base: None,
            target_dir: Some(worktrees.path().join("feature-x")),
        };
        let wt = enter_worktree(&TokioCommandRunner, tmp.path(), opts)
            .await
            .expect("enter");
        assert!(wt.path.exists());
        let listed = list_worktrees(&TokioCommandRunner, tmp.path())
            .await
            .expect("list");
        assert!(listed.iter().any(|w| w.branch == "feature-x"));
        exit_worktree(&TokioCommandRunner, tmp.path(), &wt.path)
            .await
            .expect("exit");
        let listed_after = list_worktrees(&TokioCommandRunner, tmp.path())
            .await
            .expect("list after");
        assert!(!listed_after.iter().any(|w| w.branch == "feature-x"));
    }
}
