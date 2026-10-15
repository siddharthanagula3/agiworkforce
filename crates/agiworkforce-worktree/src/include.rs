//! `.worktreeinclude`: files git does not carry into a fresh checkout, such as
//! a `.env`, that the repository asks to have copied into each new worktree.
//! The file uses `.gitignore` syntax and git does the matching.

use anyhow::Result;
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};

use crate::git::Git;
use crate::runner::CommandRunner;

pub(crate) const INCLUDE_FILE: &str = ".worktreeinclude";

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct IncludeOutcome {
    pub copied: Vec<String>,
    /// Paths matched but not copied, each with the reason.
    pub refused: Vec<(String, String)>,
}

/// Directories no listing walks into for `.worktreeinclude`: dependency and
/// build output trees hold hundreds of thousands of files and never the
/// configuration a worktree needs.
const UNWALKED: [&str; 2] = [":(exclude,glob)**/node_modules", ":(exclude,glob)**/target"];

/// Copy every untracked file under `source` that `.worktreeinclude` names and
/// git ignores into the same place under `target`. A path that runs through a
/// symlink, on either side, is refused: following it could read or write
/// something outside the repository.
pub(crate) async fn copy_included_files(
    runner: &dyn CommandRunner,
    source: &Path,
    target: &Path,
) -> Result<IncludeOutcome> {
    let list = source.join(INCLUDE_FILE);
    if !list.is_file() {
        return Ok(IncludeOutcome::default());
    }
    let exclude_from = format!("--exclude-from={}", list.display());
    let mut args = vec![
        "ls-files",
        "-z",
        "--others",
        "--ignored",
        exclude_from.as_str(),
        "--",
        ".",
    ];
    args.extend(UNWALKED);
    let named = Git::at(runner, source).ok(args).await?;
    let named: Vec<&[u8]> = named
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty())
        .collect();
    if named.is_empty() {
        return Ok(IncludeOutcome::default());
    }
    let ignored = ignored_by_standard_excludes(runner, source, &named).await?;
    let mut outcome = IncludeOutcome::default();
    for record in named {
        if !ignored.contains(record) {
            continue;
        }
        let relative = String::from_utf8_lossy(record).into_owned();
        match copy_one(source, target, &relative) {
            Ok(()) => outcome.copied.push(relative),
            Err(reason) => outcome.refused.push((relative, reason)),
        }
    }
    Ok(outcome)
}

/// Which of `paths` the standard ignore rules ignore: the repository's
/// `.gitignore` files and `info/exclude`, and the user's `core.excludesFile`,
/// which host git is handed explicitly since it reads no global configuration.
/// A file git would carry into the new checkout anyway is not copied over it.
async fn ignored_by_standard_excludes(
    runner: &dyn CommandRunner,
    source: &Path,
    paths: &[&[u8]],
) -> Result<HashSet<Vec<u8>>> {
    let mut input = Vec::new();
    for path in paths {
        input.extend_from_slice(path);
        input.push(0);
    }
    let output = Git::at(runner, source)
        .with_env("GIT_LITERAL_PATHSPECS", "1")
        .run(["check-ignore", "-z", "--stdin"], Some(input))
        .await?;
    // One means none of them is ignored; anything else is a failure.
    if !output.status.success() && output.status.code() != Some(1) {
        anyhow::bail!(
            "git check-ignore failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    Ok(output
        .stdout
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty())
        .map(<[u8]>::to_vec)
        .collect())
}

/// `relative` under `root`, refused when it is not a plain relative path or
/// when a directory on the way to it is a symbolic link, which could carry a
/// read, a write or a delete outside `root`. Directories that do not exist yet
/// are fine; the final component is the caller's to judge.
pub(crate) fn path_inside(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let path = Path::new(relative);
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("not a plain path inside the repository".to_string());
    }
    let mut walked = root.to_path_buf();
    let mut components = path.components().peekable();
    while let Some(component) = components.next() {
        if components.peek().is_none() {
            break;
        }
        walked.push(component);
        match std::fs::symlink_metadata(&walked) {
            Ok(meta) if meta.file_type().is_symlink() => {
                return Err("runs through a symbolic link".to_string())
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(root.join(path))
}

fn copy_one(source: &Path, target: &Path, relative: &str) -> Result<(), String> {
    let from = path_inside(source, relative)?;
    let meta = std::fs::symlink_metadata(&from).map_err(|error| error.to_string())?;
    if meta.file_type().is_symlink() {
        return Err("runs through a symbolic link".to_string());
    }
    if !meta.is_file() {
        return Err("not a regular file".to_string());
    }
    let destination = path_inside(target, relative)?;
    if std::fs::symlink_metadata(&destination).is_ok() {
        return Err("the new worktree already has a file there".to_string());
    }
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    std::fs::copy(&from, &destination)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::test_support::init_repo;
    use crate::runner::TokioCommandRunner;

    #[tokio::test]
    async fn listed_ignored_files_are_copied_and_unlisted_ones_are_not() {
        let source = tempfile::tempdir().unwrap();
        init_repo(source.path());
        std::fs::write(
            source.path().join(".gitignore"),
            ".env\n.env.local\nbuild/\n",
        )
        .unwrap();
        std::fs::write(source.path().join(INCLUDE_FILE), ".env\n").unwrap();
        std::fs::write(source.path().join(".env"), "SECRET=1\n").unwrap();
        std::fs::write(source.path().join(".env.local"), "LOCAL=1\n").unwrap();
        let target = tempfile::tempdir().unwrap();

        let outcome = copy_included_files(&TokioCommandRunner, source.path(), target.path())
            .await
            .unwrap();

        assert_eq!(outcome.copied, vec![".env".to_string()]);
        assert_eq!(
            std::fs::read_to_string(target.path().join(".env")).unwrap(),
            "SECRET=1\n"
        );
        assert!(!target.path().join(".env.local").exists());
    }

    #[cfg(unix)]
    #[test]
    fn a_path_through_a_symlink_is_refused() {
        let source = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("secret"), "x").unwrap();
        std::os::unix::fs::symlink(outside.path(), source.path().join("linked")).unwrap();
        let target = tempfile::tempdir().unwrap();

        let refused = copy_one(source.path(), target.path(), "linked/secret").unwrap_err();

        assert!(refused.contains("symbolic link"));
        assert!(!target.path().join("linked").exists());
    }

    #[cfg(unix)]
    #[test]
    fn a_destination_through_a_symlinked_directory_is_refused() {
        let source = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(source.path().join("config")).unwrap();
        std::fs::write(source.path().join("config/.env"), "x").unwrap();
        let target = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(outside.path(), target.path().join("config")).unwrap();

        let refused = copy_one(source.path(), target.path(), "config/.env").unwrap_err();

        assert!(refused.contains("symbolic link"));
        assert!(!outside.path().join(".env").exists());
    }

    #[tokio::test]
    async fn a_listed_file_git_already_carries_is_not_copied_and_dependency_trees_are_skipped() {
        let source = tempfile::tempdir().unwrap();
        init_repo(source.path());
        std::fs::write(source.path().join(".gitignore"), ".env\nnode_modules/\n").unwrap();
        std::fs::write(
            source.path().join(INCLUDE_FILE),
            ".env\nnotes.txt\n**/.env.local\n",
        )
        .unwrap();
        std::fs::write(source.path().join(".env"), "SECRET=1\n").unwrap();
        std::fs::write(source.path().join("notes.txt"), "untracked, not ignored\n").unwrap();
        std::fs::create_dir_all(source.path().join("node_modules/pkg")).unwrap();
        std::fs::write(source.path().join("node_modules/pkg/.env.local"), "x").unwrap();
        let target = tempfile::tempdir().unwrap();

        let outcome = copy_included_files(&TokioCommandRunner, source.path(), target.path())
            .await
            .unwrap();

        assert_eq!(outcome.copied, vec![".env".to_string()]);
        assert!(outcome.refused.is_empty());
        assert!(!target.path().join("notes.txt").exists());
        assert!(!target.path().join("node_modules").exists());
    }
}
