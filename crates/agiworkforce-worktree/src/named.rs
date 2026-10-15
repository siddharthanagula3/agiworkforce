//! Slug-named worktrees under `<repo>/.agiworkforce/worktrees`, each on its own
//! `agi-worktree-<slug>` branch. These back the desktop agent's
//! `worktree_create` / `worktree_list` / `worktree_remove` tools.

use anyhow::{anyhow, Result};
use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use crate::basic::{list_worktree_entries, removal_blocker, uncommitted_paths, RemovalBlocker};
use crate::checkpoint::Workspace;
use crate::config_guard::{verify_repository_config, ConfigUse};
use crate::git::{common_dir, linked_git_dir, Git};
use crate::runner::{CommandRunner, PinnedRunner};

const MAX_WORKTREE_SLUG_LENGTH: usize = 64;
const WORKTREE_PREFIX: &str = "agi-worktree-";
const WORKTREE_DIR: &str = ".agiworkforce/worktrees";

#[derive(Debug, Clone)]
pub struct NamedWorktree {
    pub slug: String,
    pub name: String,
    pub branch: String,
    pub path: PathBuf,
    pub head: Option<String>,
    pub dirty: bool,
    pub existed: bool,
}

pub fn validate_worktree_slug(slug: &str) -> Result<String> {
    let trimmed = slug.trim();
    if trimmed.is_empty() {
        return Err(anyhow!("worktree slug must not be empty"));
    }
    if trimmed.len() > MAX_WORKTREE_SLUG_LENGTH {
        return Err(anyhow!(
            "worktree slug must be {MAX_WORKTREE_SLUG_LENGTH} characters or fewer"
        ));
    }

    for segment in trimmed.split('/') {
        if segment == "." || segment == ".." {
            return Err(anyhow!("worktree slug must not contain . or .. segments"));
        }
        if segment.is_empty()
            || !segment
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
        {
            return Err(anyhow!(
                "worktree slug segments may contain only letters, digits, dots, underscores, and dashes"
            ));
        }
    }

    Ok(trimmed.replace('/', "+"))
}

fn branch_for_flattened_slug(flattened_slug: &str) -> String {
    format!("{WORKTREE_PREFIX}{flattened_slug}")
}

fn worktree_path_for(repo_root: &Path, flattened_slug: &str) -> PathBuf {
    repo_root.join(WORKTREE_DIR).join(flattened_slug)
}

/// The repository a worktree tool works on, as the host pinned it. Every git
/// names its git directory, and a worktree's git runs against the private git
/// directory the repository keeps for it, so neither a `.git` planted under
/// the work tree nor a rewritten worktree `.git` file can point the host's git
/// at configuration a sandboxed command wrote. The host resolves the
/// [`Workspace`] once, before any sandboxed command runs, and keeps it.
struct Repository<'a> {
    top: PathBuf,
    common_dir: PathBuf,
    runner: PinnedRunner<'a>,
    inner: &'a dyn CommandRunner,
}

impl<'a> Repository<'a> {
    fn pinned(runner: &'a dyn CommandRunner, workspace: &Workspace) -> Self {
        Self {
            top: workspace.top().to_path_buf(),
            common_dir: common_dir(workspace.git_dir()),
            runner: workspace.runner(runner),
            inner: runner,
        }
    }

    /// A runner pinned to the worktree checked out at `path`, or `None` when
    /// this repository has no worktree there.
    fn worktree_runner(&self, path: &Path) -> Option<PinnedRunner<'a>> {
        linked_git_dir(&self.common_dir, path).map(|git_dir| {
            PinnedRunner::new(self.inner, git_dir, path.to_path_buf())
                .trusting(self.runner.trusts_repository_config())
        })
    }

    async fn head_and_dirty(&self, path: &Path) -> Result<(Option<String>, bool)> {
        let runner = self
            .worktree_runner(path)
            .ok_or_else(|| anyhow!("{} is not a worktree of this repository", path.display()))?;
        worktree_head_and_dirty(&runner, path).await
    }
}

async fn worktree_head_and_dirty(
    runner: &dyn CommandRunner,
    path: &Path,
) -> Result<(Option<String>, bool)> {
    let head = Git::at(runner, path).head().await?;
    let dirty = uncommitted_paths(runner, path)
        .await?
        .is_some_and(|paths| !paths.is_empty());
    Ok((head, dirty))
}

pub async fn create_or_resume_named_worktree(
    runner: &dyn CommandRunner,
    workspace: &Workspace,
    slug: &str,
) -> Result<NamedWorktree> {
    let flattened_slug = validate_worktree_slug(slug)?;
    let repository = Repository::pinned(runner, workspace);
    let repo_root = repository.top.clone();
    let branch = branch_for_flattened_slug(&flattened_slug);
    let path = worktree_path_for(&repo_root, &flattened_slug);
    let name = branch.clone();

    if path.exists() {
        let (head, dirty) = repository.head_and_dirty(&path).await?;
        return Ok(NamedWorktree {
            slug: slug.trim().to_string(),
            name,
            branch,
            path,
            head,
            dirty,
            existed: true,
        });
    }

    std::fs::create_dir_all(repo_root.join(WORKTREE_DIR))?;

    let git = Git::at(&repository.runner, &repo_root);
    let head_commit = git
        .head()
        .await?
        .ok_or_else(|| anyhow!("Failed to resolve repository HEAD"))?;
    let branch_ref = format!("refs/heads/{branch}");
    let branch_exists = git
        .succeeds(["show-ref", "--verify", "--quiet", branch_ref.as_str()])
        .await?;
    verify_repository_config(
        &repository.runner,
        &repo_root,
        &repo_root,
        ConfigUse::CONTENT,
    )
    .await?;
    let path_arg = path.as_os_str();
    if branch_exists {
        git.ok([
            OsStr::new("worktree"),
            OsStr::new("add"),
            OsStr::new("--"),
            path_arg,
            OsStr::new(&branch),
        ])
        .await
        .map_err(|e| anyhow!("Failed to create worktree {name}: {e}"))?;
    } else {
        git.ok([
            OsStr::new("worktree"),
            OsStr::new("add"),
            OsStr::new("-b"),
            OsStr::new(&branch),
            OsStr::new("--"),
            path_arg,
            OsStr::new(&head_commit),
        ])
        .await
        .map_err(|e| anyhow!("Failed to create worktree {name}: {e}"))?;
    }

    let (head, dirty) = repository.head_and_dirty(&path).await?;
    Ok(NamedWorktree {
        slug: slug.trim().to_string(),
        name,
        branch,
        path,
        head,
        dirty,
        existed: false,
    })
}

pub async fn list_named_worktrees(
    runner: &dyn CommandRunner,
    workspace: &Workspace,
) -> Result<Vec<NamedWorktree>> {
    let repository = Repository::pinned(runner, workspace);
    let entries = list_worktree_entries(&repository.runner, &repository.top)
        .await
        .map_err(|e| anyhow!("Failed to list worktrees: {e}"))?;

    let mut worktrees = Vec::new();
    for entry in entries {
        let Some(branch) = entry.branch.clone() else {
            continue;
        };
        if !branch.starts_with(WORKTREE_PREFIX) {
            continue;
        }
        let (head, dirty) = match repository.worktree_runner(&entry.path) {
            Some(worktree) if entry.path.exists() => {
                worktree_head_and_dirty(&worktree, &entry.path).await?
            }
            _ => (None, false),
        };
        worktrees.push(NamedWorktree {
            slug: branch.trim_start_matches(WORKTREE_PREFIX).replace('+', "/"),
            name: branch.clone(),
            branch,
            path: entry.path,
            head,
            dirty,
            existed: true,
        });
    }

    worktrees.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(worktrees)
}

pub async fn remove_named_worktree(
    runner: &dyn CommandRunner,
    workspace: &Workspace,
    slug: &str,
    force: bool,
    delete_branch: bool,
) -> Result<NamedWorktree> {
    let flattened_slug = validate_worktree_slug(slug)?;
    let repository = Repository::pinned(runner, workspace);
    let branch = branch_for_flattened_slug(&flattened_slug);
    let path = worktree_path_for(&repository.top, &flattened_slug);
    let name = branch.clone();

    if !path.exists() {
        return Err(anyhow!("worktree path does not exist: {}", path.display()));
    }

    let git_dir = linked_git_dir(&repository.common_dir, &path)
        .ok_or_else(|| anyhow!("{} is not a worktree of this repository", path.display()))?;
    let worktree = repository
        .worktree_runner(&path)
        .ok_or_else(|| anyhow!("{} is not a worktree of this repository", path.display()))?;
    let head = Git::at(&worktree, &path).head().await?;
    let blocker = removal_blocker(&worktree, &path, &git_dir).await?;
    let dirty = matches!(blocker, Some(RemovalBlocker::Changes(_)));
    if let (Some(blocker), false) = (&blocker, force) {
        let reason = match blocker {
            RemovalBlocker::Changes(paths) => {
                format!("has uncommitted or untracked changes: {}", paths.join(", "))
            }
            other => other.describe(),
        };
        return Err(anyhow!(
            "worktree {reason}; pass force=true only after user approval"
        ));
    }

    // Git is always told `--force`: either the user approved losing what is
    // there, or the check above found nothing to lose, and either way git
    // runs no status of its own in the checkout.
    let git = Git::at(&repository.runner, &repository.top);
    let args = [
        OsStr::new("worktree"),
        OsStr::new("remove"),
        OsStr::new("--force"),
        path.as_os_str(),
    ];
    let output = git.run(&args, None).await?;
    if !output.status.success() {
        return Err(anyhow!(
            "git worktree remove failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    if delete_branch {
        let branch_ref = format!("refs/heads/{branch}");
        if git
            .succeeds(["show-ref", "--verify", "--quiet", branch_ref.as_str()])
            .await?
        {
            git.ok(["branch", "-D", "--", branch.as_str()])
                .await
                .map_err(|e| anyhow!("Failed to delete branch {branch}: {e}"))?;
        }
    }

    Ok(NamedWorktree {
        slug: slug.trim().to_string(),
        name,
        branch,
        path,
        head,
        dirty,
        existed: true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::test_support::init_repo;
    use crate::runner::TokioCommandRunner;

    async fn pinned(dir: &Path) -> Workspace {
        Workspace::discover(&TokioCommandRunner, dir)
            .await
            .expect("discover")
            .expect("a repository")
    }

    #[test]
    fn worktree_slug_validation_rejects_escape_segments() {
        assert!(validate_worktree_slug("../outside").is_err());
        assert!(validate_worktree_slug("nested/feature").is_ok());
        assert!(validate_worktree_slug("bad space").is_err());
    }

    #[tokio::test]
    async fn worktree_create_list_and_remove_round_trip() {
        let repo_dir = tempfile::tempdir().unwrap();
        init_repo(repo_dir.path());
        let workspace = pinned(repo_dir.path()).await;

        let created =
            create_or_resume_named_worktree(&TokioCommandRunner, &workspace, "demo/feature")
                .await
                .expect("create worktree");
        assert!(!created.existed);
        assert!(created.path.exists());
        assert_eq!(created.branch, "agi-worktree-demo+feature");

        let resumed =
            create_or_resume_named_worktree(&TokioCommandRunner, &workspace, "demo/feature")
                .await
                .expect("resume worktree");
        assert!(resumed.existed);
        assert_eq!(resumed.path, created.path);

        let listed = list_named_worktrees(&TokioCommandRunner, &workspace)
            .await
            .expect("list worktrees");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].slug, "demo/feature");

        let removed =
            remove_named_worktree(&TokioCommandRunner, &workspace, "demo/feature", false, true)
                .await
                .expect("remove worktree");
        assert_eq!(removed.branch, "agi-worktree-demo+feature");
        assert!(!created.path.exists());
    }

    #[tokio::test]
    async fn worktree_remove_requires_force_for_dirty_tree() {
        let repo_dir = tempfile::tempdir().unwrap();
        init_repo(repo_dir.path());
        let workspace = pinned(repo_dir.path()).await;
        let created = create_or_resume_named_worktree(&TokioCommandRunner, &workspace, "dirty")
            .await
            .expect("create worktree");
        std::fs::write(created.path.join("untracked.txt"), "dirty\n").expect("write dirty file");

        let error = remove_named_worktree(&TokioCommandRunner, &workspace, "dirty", false, false)
            .await
            .expect_err("dirty worktree should need force");
        assert!(error.to_string().contains("uncommitted or untracked"));
        assert!(error.to_string().contains("untracked.txt"));

        remove_named_worktree(&TokioCommandRunner, &workspace, "dirty", true, true)
            .await
            .expect("force remove dirty worktree");
    }

    #[tokio::test]
    async fn a_rewritten_worktree_git_file_does_not_redirect_host_git() {
        let repo_dir = tempfile::tempdir().unwrap();
        init_repo(repo_dir.path());
        let workspace = pinned(repo_dir.path()).await;
        let created = create_or_resume_named_worktree(&TokioCommandRunner, &workspace, "pinned")
            .await
            .expect("create worktree");
        let planted = tempfile::tempdir().unwrap();
        init_repo(planted.path());
        crate::git::test_support::git(
            planted.path(),
            &["commit", "--allow-empty", "-q", "-m", "planted"],
        );
        std::fs::write(
            created.path.join(".git"),
            format!("gitdir: {}\n", planted.path().join(".git").display()),
        )
        .unwrap();

        let listed = list_named_worktrees(&TokioCommandRunner, &workspace)
            .await
            .expect("list worktrees");

        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].head, created.head);
    }
}
