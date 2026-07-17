//! Git worktree wrapper for the EnterWorktree / ExitWorktree agent tools.
//!
//! Provides a thin shell over `git worktree add` / `git worktree remove`.
//! Fires the AGI hook events `WorktreeCreate` / `WorktreeRemove` (added to
//! hooks.rs in M21) so observers can react.

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use std::process::Command;

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
#[allow(dead_code)] // M35 — fields consumed by /worktree dispatch + tool catalog wiring (deferred to integration step)
pub struct Worktree {
    pub branch: String,
    pub path: PathBuf,
}

#[allow(dead_code)]
pub fn enter_worktree(repo: &Path, opts: WorktreeOptions) -> Result<Worktree> {
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
    let output = cmd.output().context("invoke git worktree add")?;
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

#[allow(dead_code)]
pub fn exit_worktree(repo: &Path, worktree_path: &Path) -> Result<()> {
    let output = Command::new("git")
        .current_dir(repo)
        .arg("worktree")
        .arg("remove")
        .arg(worktree_path)
        .output()
        .context("invoke git worktree remove")?;
    if !output.status.success() {
        anyhow::bail!(
            "git worktree remove failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    Ok(())
}

#[allow(dead_code)]
pub fn list_worktrees(repo: &Path) -> Result<Vec<Worktree>> {
    let output = Command::new("git")
        .current_dir(repo)
        .arg("worktree")
        .arg("list")
        .arg("--porcelain")
        .output()
        .context("invoke git worktree list")?;
    let text = String::from_utf8_lossy(&output.stdout);
    let mut out = Vec::new();
    let mut path: Option<PathBuf> = None;
    let mut branch: Option<String> = None;
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix("worktree ") {
            if let (Some(p), Some(b)) = (path.take(), branch.take()) {
                out.push(Worktree { branch: b, path: p });
            }
            path = Some(PathBuf::from(rest));
        } else if let Some(rest) = line.strip_prefix("branch ") {
            branch = Some(rest.trim_start_matches("refs/heads/").to_string());
        }
    }
    if let (Some(p), Some(b)) = (path, branch) {
        out.push(Worktree { branch: b, path: p });
    }
    Ok(out)
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
    fn worktree_roundtrip() {
        let tmp = tempfile::tempdir().unwrap();
        init_repo(tmp.path());
        let opts = WorktreeOptions {
            branch: "feature-x".into(),
            base: None,
            target_dir: Some(tmp.path().parent().unwrap().join("wt-feature-x")),
        };
        let wt = enter_worktree(tmp.path(), opts).expect("enter");
        assert!(wt.path.exists());
        let listed = list_worktrees(tmp.path()).expect("list");
        assert!(listed.iter().any(|w| w.branch == "feature-x"));
        exit_worktree(tmp.path(), &wt.path).expect("exit");
        let listed_after = list_worktrees(tmp.path()).expect("list after");
        assert!(!listed_after.iter().any(|w| w.branch == "feature-x"));
    }
}
