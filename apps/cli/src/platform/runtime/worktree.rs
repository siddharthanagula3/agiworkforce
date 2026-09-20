//! Git worktree wrapper for the EnterWorktree / ExitWorktree agent tools.
//!
//! Provides a thin shell over `git worktree add` / `git worktree remove`.
//! Fires the AGI hook events `WorktreeCreate` / `WorktreeRemove` (added to
//! hooks.rs in M21) so observers can react.

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use tokio::process::Command;

const GIT_WORKTREE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

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

/// One entry of `git worktree list --porcelain`, including the ones
/// [`Worktree`] cannot express: a detached checkout, the bare main worktree,
/// and a worktree another process has locked or git has marked prunable.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorktreeEntry {
    pub path: PathBuf,
    pub head: Option<String>,
    pub branch: Option<String>,
    pub bare: bool,
    pub detached: bool,
    pub locked: Option<String>,
    pub prunable: Option<String>,
}

impl WorktreeEntry {
    fn new(path: PathBuf) -> Self {
        Self {
            path,
            head: None,
            branch: None,
            bare: false,
            detached: false,
            locked: None,
            prunable: None,
        }
    }

    pub fn is_usable(&self) -> bool {
        !self.bare && self.locked.is_none() && self.prunable.is_none()
    }
}

/// Parse `git worktree list --porcelain`. Records are separated by a blank
/// line, and every record but the first field is optional, so a missing branch
/// means detached rather than a worktree to drop from the list.
pub fn parse_worktree_porcelain(text: &str) -> Vec<WorktreeEntry> {
    let mut entries = Vec::new();
    let mut current: Option<WorktreeEntry> = None;
    for line in text.lines() {
        let line = line.trim_end();
        if line.is_empty() {
            if let Some(entry) = current.take() {
                entries.push(entry);
            }
            continue;
        }
        if let Some(path) = line.strip_prefix("worktree ") {
            if let Some(entry) = current.take() {
                entries.push(entry);
            }
            current = Some(WorktreeEntry::new(PathBuf::from(path)));
            continue;
        }
        let Some(entry) = current.as_mut() else {
            continue;
        };
        if let Some(head) = line.strip_prefix("HEAD ") {
            entry.head = Some(head.to_string());
        } else if let Some(branch) = line.strip_prefix("branch ") {
            entry.branch = Some(branch.trim_start_matches("refs/heads/").to_string());
        } else if line == "bare" {
            entry.bare = true;
        } else if line == "detached" {
            entry.detached = true;
        } else if let Some(reason) = line.strip_prefix("locked") {
            entry.locked = Some(reason.trim().to_string());
        } else if let Some(reason) = line.strip_prefix("prunable") {
            entry.prunable = Some(reason.trim().to_string());
        }
    }
    if let Some(entry) = current {
        entries.push(entry);
    }
    entries
}

pub async fn enter_worktree(repo: &Path, opts: WorktreeOptions) -> Result<Worktree> {
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
    let mut cmd = Command::new("git");
    cmd.current_dir(repo)
        .arg("worktree")
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
    let output = crate::process_tree::output(cmd, None, Some(GIT_WORKTREE_TIMEOUT))
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

pub async fn exit_worktree(repo: &Path, worktree_path: &Path) -> Result<()> {
    // `git worktree remove` refuses a dirty worktree, but it says only that it
    // is dirty. Read the tree first so the refusal names the files that would
    // have been lost, which is the difference between a user keeping their work
    // and a user hunting for it.
    if let Ok(snapshot) = super::git::GitApi::at(worktree_path)
        .status(agiworkforce_protocol::code_domain::RepositoryId::new(
            worktree_path.display().to_string(),
        ))
        .await
    {
        if !snapshot.is_clean() {
            let mut paths: Vec<String> = snapshot
                .changes
                .iter()
                .map(|change| change.path.display().to_string())
                .collect();
            paths.sort();
            paths.dedup();
            anyhow::bail!(
                "worktree {} has uncommitted changes and was not removed: {}. Commit, stash or \
                 discard them deliberately first.",
                worktree_path.display(),
                paths.join(", ")
            );
        }
    }

    let mut command = Command::new("git");
    command
        .current_dir(repo)
        .arg("worktree")
        .arg("remove")
        .arg(worktree_path);
    let output = crate::process_tree::output(command, None, Some(GIT_WORKTREE_TIMEOUT))
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
pub async fn list_worktree_entries(repo: &Path) -> Result<Vec<WorktreeEntry>> {
    let mut command = Command::new("git");
    command
        .current_dir(repo)
        .arg("worktree")
        .arg("list")
        .arg("--porcelain");
    let output = crate::process_tree::output(command, None, Some(GIT_WORKTREE_TIMEOUT))
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

pub async fn list_worktrees(repo: &Path) -> Result<Vec<Worktree>> {
    Ok(list_worktree_entries(repo)
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
    use std::process::Command;

    // Tests run against a freshly-init'd repo in tempdir; require `git` on PATH.
    fn init_repo(dir: &Path) {
        Command::new("git")
            .current_dir(dir)
            .args(["init", "-q", "-b", "main"])
            .status()
            .expect("git init");
        Command::new("git")
            .current_dir(dir)
            .args(["config", "user.email", "test@example.invalid"])
            .status()
            .unwrap();
        Command::new("git")
            .current_dir(dir)
            .args(["config", "user.name", "Test"])
            .status()
            .unwrap();
        std::fs::write(dir.join("README.md"), "hello").unwrap();
        Command::new("git")
            .current_dir(dir)
            .args(["add", "."])
            .status()
            .unwrap();
        Command::new("git")
            .current_dir(dir)
            .args(["commit", "-q", "-m", "init"])
            .status()
            .unwrap();
    }

    #[test]
    fn porcelain_keeps_the_worktrees_a_branch_filter_would_drop() {
        let entries = parse_worktree_porcelain(
            "worktree /work/repo\n\
             HEAD abc123\n\
             branch refs/heads/main\n\
             \n\
             worktree /work/wt-detached\n\
             HEAD def456\n\
             detached\n\
             \n\
             worktree /work/bare\n\
             bare\n\
             \n\
             worktree /work/wt-locked\n\
             HEAD 789abc\n\
             branch refs/heads/feature\n\
             locked under review\n",
        );

        assert_eq!(entries.len(), 4);
        assert_eq!(entries[0].branch.as_deref(), Some("main"));
        assert!(entries[0].is_usable());
        assert!(entries[1].detached);
        assert!(entries[1].branch.is_none());
        assert!(entries[2].bare);
        assert!(!entries[2].is_usable());
        assert_eq!(entries[3].locked.as_deref(), Some("under review"));
        assert!(!entries[3].is_usable());
    }

    #[tokio::test]
    async fn removing_a_dirty_worktree_names_what_would_be_lost() {
        let _serial = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        let tmp = tempfile::tempdir().unwrap();
        init_repo(tmp.path());
        let worktrees = tempfile::tempdir().unwrap();
        let target = worktrees.path().join("dirty-guard");
        let worktree = enter_worktree(
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

        let error = exit_worktree(tmp.path(), &worktree.path)
            .await
            .expect_err("a dirty worktree must not be removed");

        assert!(error.to_string().contains("unsaved.txt"));
        assert!(worktree.path.exists());

        std::fs::remove_file(worktree.path.join("unsaved.txt")).unwrap();
        exit_worktree(tmp.path(), &worktree.path)
            .await
            .expect("a clean worktree still removes");
    }

    #[tokio::test]
    async fn worktree_entries_carry_head_and_branch() {
        let _serial = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        let tmp = tempfile::tempdir().unwrap();
        init_repo(tmp.path());

        let entries = list_worktree_entries(tmp.path()).await.expect("list");

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].branch.as_deref(), Some("main"));
        assert!(entries[0].head.is_some());
        assert!(entries[0].is_usable());
    }

    #[tokio::test]
    async fn worktree_roundtrip() {
        let _serial = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        let tmp = tempfile::tempdir().unwrap();
        init_repo(tmp.path());
        let worktrees = tempfile::tempdir().unwrap();
        let opts = WorktreeOptions {
            branch: "feature-x".into(),
            base: None,
            target_dir: Some(worktrees.path().join("feature-x")),
        };
        let wt = enter_worktree(tmp.path(), opts).await.expect("enter");
        assert!(wt.path.exists());
        let listed = list_worktrees(tmp.path()).await.expect("list");
        assert!(listed.iter().any(|w| w.branch == "feature-x"));
        exit_worktree(tmp.path(), &wt.path).await.expect("exit");
        let listed_after = list_worktrees(tmp.path()).await.expect("list after");
        assert!(!listed_after.iter().any(|w| w.branch == "feature-x"));
    }
}
