//! Git worktree wrapper for the EnterWorktree / ExitWorktree agent tools, and
//! the runner the app-server's own git bookkeeping uses.
//!
//! The git work lives in `agiworkforce-worktree`; this module runs it through
//! the CLI's process-tree supervisor, so a cancelled turn takes the agent's
//! git subprocesses with it.

use anyhow::{Context, Result};
use async_trait::async_trait;
use std::path::{Path, PathBuf};
use std::process::Output;
use std::time::Duration;
use tokio::process::Command;

pub use agiworkforce_worktree::{
    parse_worktree_porcelain, Worktree, WorktreeEntry, WorktreeOptions,
};

/// Runs the shared crate's subprocesses under the CLI's process-tree owner.
pub struct ProcessTreeRunner;

#[async_trait]
impl agiworkforce_worktree::CommandRunner for ProcessTreeRunner {
    async fn output(
        &self,
        command: Command,
        stdin: Option<Vec<u8>>,
        timeout: Option<Duration>,
    ) -> std::io::Result<Output> {
        crate::process_tree::output(command, stdin, timeout).await
    }
}

/// Runs the host's own git bookkeeping (checkpoints, worktree management)
/// outside any turn's process owner and outside the caller's future. A
/// snapshot or ref update killed halfway leaves a `.lock` file that breaks
/// every later one, so interrupting a turn, or dropping a request, lets the
/// git that is already running finish; only its own timeout ends it early.
pub struct BookkeepingRunner;

#[async_trait]
impl agiworkforce_worktree::CommandRunner for BookkeepingRunner {
    async fn output(
        &self,
        command: Command,
        stdin: Option<Vec<u8>>,
        timeout: Option<Duration>,
    ) -> std::io::Result<Output> {
        tokio::spawn(crate::process_tree::output(command, stdin, timeout))
            .await
            .map_err(std::io::Error::other)?
    }

    /// The git outlives a dropped caller here, so `held` goes into the same
    /// task and is released only once that git has exited.
    async fn output_holding(
        &self,
        command: Command,
        stdin: Option<Vec<u8>>,
        timeout: Option<Duration>,
        held: agiworkforce_worktree::Held,
    ) -> std::io::Result<Output> {
        tokio::spawn(async move {
            let output = crate::process_tree::output(command, stdin, timeout).await;
            drop(held);
            output
        })
        .await
        .map_err(std::io::Error::other)?
    }
}

/// Create a worktree of `repo`. Its configuration is obeyed only as far as
/// the user trusts the folder; see [`agiworkforce_worktree::config_guard`].
pub async fn enter_worktree(repo: &Path, opts: WorktreeOptions) -> Result<Worktree> {
    if crate::trust::restrictions_for(repo).repository_config {
        let trusted = agiworkforce_worktree::TrustedConfigRunner(&ProcessTreeRunner);
        agiworkforce_worktree::enter_worktree(&trusted, repo, opts).await
    } else {
        agiworkforce_worktree::enter_worktree(&ProcessTreeRunner, repo, opts).await
    }
}

pub async fn exit_worktree(repo: &Path, worktree_path: &Path) -> Result<()> {
    agiworkforce_worktree::exit_worktree(&ProcessTreeRunner, repo, worktree_path).await
}

/// Every worktree git knows about, with its metadata.
pub async fn list_worktree_entries(repo: &Path) -> Result<Vec<WorktreeEntry>> {
    agiworkforce_worktree::list_worktree_entries(&ProcessTreeRunner, repo).await
}

pub async fn list_worktrees(repo: &Path) -> Result<Vec<Worktree>> {
    agiworkforce_worktree::list_worktrees(&ProcessTreeRunner, repo).await
}

const GIT_WORKTREE_TIMEOUT: Duration = Duration::from_secs(30);
pub const SESSION_WORKTREE_DIR: &str = ".agiworkforce/worktrees";
const SESSION_BRANCH_PREFIX: &str = "worktree-";
const MAX_SESSION_WORKTREE_NAME: usize = 64;

#[derive(Debug, Clone)]
pub struct SessionWorktree {
    pub name: String,
    pub path: PathBuf,
    pub branch: String,
    pub base: String,
    pub root: PathBuf,
    pub generated: bool,
    pub created: bool,
}

async fn git_text(dir: &Path, args: &[&str]) -> Result<String> {
    let mut command = Command::new("git");
    command.current_dir(dir).args(args);
    let output = crate::process_tree::output(command, None, Some(GIT_WORKTREE_TIMEOUT))
        .await
        .with_context(|| format!("invoke git {}", args.join(" ")))?;
    if !output.status.success() {
        anyhow::bail!(
            "git {} failed: {}",
            args.join(" "),
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub async fn main_checkout_root(dir: &Path) -> Result<PathBuf> {
    let common = PathBuf::from(
        git_text(
            dir,
            &["rev-parse", "--path-format=absolute", "--git-common-dir"],
        )
        .await?,
    );
    if common.file_name().is_some_and(|name| name == ".git") {
        if let Some(parent) = common.parent() {
            return Ok(parent.to_path_buf());
        }
    }
    Ok(PathBuf::from(
        git_text(dir, &["rev-parse", "--show-toplevel"]).await?,
    ))
}

pub fn valid_session_worktree_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= MAX_SESSION_WORKTREE_NAME
        && !name.starts_with(['-', '.'])
        && name.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
}

fn same_path(left: &Path, right: &Path) -> bool {
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => left == right,
    }
}

async fn default_base(root: &Path) -> String {
    let base = git_text(
        root,
        &[
            "symbolic-ref",
            "--quiet",
            "--short",
            "refs/remotes/origin/HEAD",
        ],
    )
    .await
    .ok()
    .filter(|base| !base.is_empty())
    .unwrap_or_else(|| "HEAD".to_string());
    git_text(root, &["rev-parse", "--verify", "--quiet", &base])
        .await
        .unwrap_or(base)
}

async fn exclude_session_worktrees(root: &Path) -> Result<()> {
    let common = PathBuf::from(
        git_text(
            root,
            &["rev-parse", "--path-format=absolute", "--git-common-dir"],
        )
        .await?,
    );
    let exclude = common.join("info").join("exclude");
    let entry = format!("/{SESSION_WORKTREE_DIR}/");
    let existing = std::fs::read_to_string(&exclude).unwrap_or_default();
    if existing.lines().any(|line| line.trim() == entry) {
        return Ok(());
    }
    if let Some(parent) = exclude.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let separator = if existing.is_empty() || existing.ends_with('\n') {
        ""
    } else {
        "\n"
    };
    std::fs::write(&exclude, format!("{existing}{separator}{entry}\n"))
        .with_context(|| format!("writing {}", exclude.display()))
}

async fn copy_worktree_includes(root: &Path, worktree: &Path) -> Result<usize> {
    let Ok(text) = std::fs::read_to_string(root.join(".worktreeinclude")) else {
        return Ok(0);
    };
    let mut copied = 0;
    for pattern in text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
    {
        let full = root.join(pattern.trim_start_matches('/'));
        let Some(full) = full.to_str() else {
            continue;
        };
        for source in glob::glob(full)
            .with_context(|| format!("reading the .worktreeinclude pattern {pattern}"))?
            .flatten()
        {
            let Ok(relative) = source.strip_prefix(root) else {
                continue;
            };
            if !source.is_file()
                || relative.starts_with(SESSION_WORKTREE_DIR)
                || relative.starts_with(".git")
            {
                continue;
            }
            let mut check = Command::new("git");
            check
                .current_dir(root)
                .args(["check-ignore", "--quiet", "--"])
                .arg(relative);
            let ignored = crate::process_tree::output(check, None, Some(GIT_WORKTREE_TIMEOUT))
                .await
                .is_ok_and(|output| output.status.success());
            if !ignored {
                continue;
            }
            let target = worktree.join(relative);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(&source, &target)
                .with_context(|| format!("copying {} into the worktree", relative.display()))?;
            copied += 1;
        }
    }
    Ok(copied)
}

pub async fn open_session_worktree(
    start: &Path,
    requested: Option<&str>,
) -> Result<SessionWorktree> {
    let root = main_checkout_root(start).await?;
    let requested = requested.map(str::trim).filter(|name| !name.is_empty());
    let (name, generated) = match requested {
        Some(name) => {
            anyhow::ensure!(
                valid_session_worktree_name(name),
                "a worktree name uses letters, digits, '-', '_' or '.', up to {MAX_SESSION_WORKTREE_NAME} characters, and does not start with '-' or '.'"
            );
            (name.to_string(), false)
        }
        None => (
            format!(
                "session-{}",
                &uuid::Uuid::new_v4().simple().to_string()[..8]
            ),
            true,
        ),
    };
    let path = root.join(SESSION_WORKTREE_DIR).join(&name);
    let branch = format!("{SESSION_BRANCH_PREFIX}{name}");
    for component in [
        root.join(".agiworkforce"),
        root.join(SESSION_WORKTREE_DIR),
        path.clone(),
    ] {
        if std::fs::symlink_metadata(&component).is_ok_and(|meta| meta.file_type().is_symlink()) {
            anyhow::bail!(
                "{} is a symbolic link, so no worktree is created there; remove the link and try again",
                component.display()
            );
        }
    }
    let base = default_base(&root).await;
    if list_worktree_entries(&root)
        .await?
        .iter()
        .any(|entry| same_path(&entry.path, &path))
    {
        return Ok(SessionWorktree {
            name,
            path,
            branch,
            base,
            root,
            generated,
            created: false,
        });
    }
    anyhow::ensure!(
        !path.exists(),
        "{} exists but is not a git worktree; move it aside and try again",
        path.display()
    );
    std::fs::create_dir_all(root.join(SESSION_WORKTREE_DIR))?;
    exclude_session_worktrees(&root).await?;
    let branch_exists = git_text(
        &root,
        &[
            "rev-parse",
            "--verify",
            "--quiet",
            &format!("refs/heads/{branch}"),
        ],
    )
    .await
    .is_ok();
    let mut command = Command::new("git");
    command.current_dir(&root).args(["worktree", "add"]);
    if branch_exists {
        command.arg("--").arg(&path).arg(&branch);
    } else {
        command.args(["-b", &branch, "--"]).arg(&path).arg(&base);
    }
    let output = crate::process_tree::output(command, None, Some(GIT_WORKTREE_TIMEOUT))
        .await
        .context("invoke git worktree add")?;
    if !output.status.success() {
        anyhow::bail!(
            "git worktree add failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    copy_worktree_includes(&root, &path).await?;
    Ok(SessionWorktree {
        name,
        path,
        branch,
        base,
        root,
        generated,
        created: true,
    })
}

pub async fn session_worktree_has_work(worktree: &SessionWorktree) -> Result<bool> {
    if !git_text(&worktree.path, &["status", "--porcelain"])
        .await?
        .is_empty()
    {
        return Ok(true);
    }
    let ahead = git_text(
        &worktree.path,
        &["rev-list", "--count", &format!("{}..HEAD", worktree.base)],
    )
    .await?;
    Ok(ahead != "0")
}

pub async fn list_session_worktrees(start: &Path) -> Result<Vec<SessionWorktree>> {
    let root = main_checkout_root(start).await?;
    let base = default_base(&root).await;
    let dir = root.join(SESSION_WORKTREE_DIR);
    Ok(list_worktree_entries(&root)
        .await?
        .into_iter()
        .filter(|entry| {
            entry
                .path
                .parent()
                .is_some_and(|parent| same_path(parent, &dir))
        })
        .filter_map(|entry| {
            let name = entry.path.file_name()?.to_string_lossy().into_owned();
            Some(SessionWorktree {
                branch: entry
                    .branch
                    .clone()
                    .unwrap_or_else(|| format!("{SESSION_BRANCH_PREFIX}{name}")),
                name,
                path: entry.path,
                base: base.clone(),
                root: root.clone(),
                generated: false,
                created: false,
            })
        })
        .collect())
}

pub async fn remove_session_worktree(worktree: &SessionWorktree, force: bool) -> Result<()> {
    if force {
        git_text(
            &worktree.root,
            &[
                "worktree",
                "remove",
                "--force",
                &worktree.path.to_string_lossy(),
            ],
        )
        .await?;
    } else {
        exit_worktree(&worktree.root, &worktree.path).await?;
    }
    if worktree.branch.starts_with(SESSION_BRANCH_PREFIX) {
        git_text(&worktree.root, &["branch", "-D", &worktree.branch]).await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn init_repo(dir: &Path) {
        let run = |args: &[&str]| {
            std::process::Command::new("git")
                .current_dir(dir)
                .args(args)
                .status()
                .expect("git");
        };
        run(&["init", "-q", "-b", "main"]);
        run(&["config", "user.email", "test@example.invalid"]);
        run(&["config", "user.name", "Test"]);
        std::fs::write(dir.join("README.md"), "hello").unwrap();
        run(&["add", "."]);
        run(&["commit", "-q", "-m", "init"]);
    }

    #[tokio::test]
    async fn the_cli_drives_the_shared_crate_through_its_process_tree_runner() {
        let _serial = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        let tmp = tempfile::tempdir().unwrap();
        init_repo(tmp.path());
        let worktrees = tempfile::tempdir().unwrap();
        let wt = enter_worktree(
            tmp.path(),
            WorktreeOptions {
                branch: "feature-x".into(),
                base: None,
                target_dir: Some(worktrees.path().join("feature-x")),
            },
        )
        .await
        .expect("enter");
        assert!(list_worktrees(tmp.path())
            .await
            .expect("list")
            .iter()
            .any(|w| w.branch == "feature-x"));
        exit_worktree(tmp.path(), &wt.path).await.expect("exit");
        assert_eq!(
            list_worktree_entries(tmp.path())
                .await
                .expect("entries")
                .len(),
            1
        );
    }
}
