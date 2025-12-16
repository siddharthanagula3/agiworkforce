/**
 * Git Operations Integration
 * Full Git functionality for repository management using git2 (libgit2)
 * Safe replacement for shell-based commands to prevent injection
 */
use git2::{
    BranchType, Cred, FetchOptions, PushOptions, RemoteCallbacks, Repository, Signature,
    StatusOptions,
};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::async_runtime::spawn_blocking;

/// Git repository status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatus {
    pub branch: String,
    pub ahead: usize,
    pub behind: usize,
    pub staged: Vec<String>,
    pub unstaged: Vec<String>,
    pub untracked: Vec<String>,
    pub conflicts: Vec<String>,
}

/// Git commit information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCommit {
    pub hash: String,
    pub author: String,
    pub email: String,
    pub date: String,
    pub message: String,
}

/// Git branch information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
    pub last_commit: String,
}

/// Git diff information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitDiff {
    pub file_path: String,
    pub additions: usize,
    pub deletions: usize,
    pub diff_content: String,
}

/// Initialize a new Git repository
#[tauri::command]
pub async fn git_init(path: String) -> Result<String, String> {
    tracing::info!("Initializing Git repository at: {}", path);

    spawn_blocking(move || {
        Repository::init(&path)
            .map(|_| format!("Initialized empty Git repository in {}", path))
            .map_err(|e| e.message().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Get repository status
#[tauri::command]
pub async fn git_status(path: String) -> Result<GitStatus, String> {
    tracing::info!("Getting Git status for: {}", path);

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;

        // Get current branch
        let head = repo.head().ok();
        let branch = head
            .as_ref()
            .and_then(|h| h.shorthand())
            .unwrap_or("HEAD (detached)")
            .to_string();

        // Get ahead/behind count
        let (ahead, behind) = if let Some(h) = &head {
            if let Ok(upstream) = repo.branch_upstream_name(h.name().unwrap_or("")) {
                let upstream_str = upstream.as_str().unwrap_or("");
                if let (Ok(local_oid), Ok(upstream_oid)) = (
                    h.target().ok_or("No target"),
                    repo.refname_to_id(upstream_str),
                ) {
                    repo.graph_ahead_behind(local_oid, upstream_oid)
                        .unwrap_or((0, 0))
                } else {
                    (0, 0)
                }
            } else {
                (0, 0)
            }
        } else {
            (0, 0)
        };

        // Status options
        let mut opts = StatusOptions::new();
        opts.include_untracked(true).recurse_untracked_dirs(true);

        let statuses = repo
            .statuses(Some(&mut opts))
            .map_err(|e| e.message().to_string())?;

        let mut staged = Vec::new();
        let mut unstaged = Vec::new();
        let mut untracked = Vec::new();
        let mut conflicts = Vec::new();

        for entry in statuses.iter() {
            let path = entry.path().unwrap_or("").to_string();
            let status = entry.status();

            if status.contains(git2::Status::INDEX_NEW)
                || status.contains(git2::Status::INDEX_MODIFIED)
                || status.contains(git2::Status::INDEX_DELETED)
                || status.contains(git2::Status::INDEX_RENAMED)
                || status.contains(git2::Status::INDEX_TYPECHANGE)
            {
                staged.push(path.clone());
            }

            if status.contains(git2::Status::WT_MODIFIED)
                || status.contains(git2::Status::WT_DELETED)
                || status.contains(git2::Status::WT_RENAMED)
                || status.contains(git2::Status::WT_TYPECHANGE)
            {
                unstaged.push(path.clone());
            }

            if status.contains(git2::Status::WT_NEW) {
                untracked.push(path.clone());
            }

            if status.contains(git2::Status::CONFLICTED) {
                conflicts.push(path.clone());
            }
        }

        Ok(GitStatus {
            branch,
            ahead,
            behind,
            staged,
            unstaged,
            untracked,
            conflicts,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Add files to staging area
#[tauri::command]
pub async fn git_add(path: String, files: Vec<String>) -> Result<String, String> {
    tracing::info!("Adding {} files to staging", files.len());

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;
        let mut index = repo.index().map_err(|e| e.message().to_string())?;

        for file in &files {
            if file == "." {
                index
                    .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
                    .map_err(|e| e.message().to_string())?;
            } else {
                let path = Path::new(file);
                index.add_path(path).map_err(|e| e.message().to_string())?;
            }
        }

        index.write().map_err(|e| e.message().to_string())?;
        Ok(format!("Added {} files", files.len()))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Commit staged changes
#[tauri::command]
pub async fn git_commit(path: String, message: String) -> Result<String, String> {
    tracing::info!("Creating commit with message: {}", message);

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;

        let mut index = repo.index().map_err(|e| e.message().to_string())?;
        let tree_id = index.write_tree().map_err(|e| e.message().to_string())?;
        let tree = repo
            .find_tree(tree_id)
            .map_err(|e| e.message().to_string())?;

        let sig = repo
            .signature()
            .or_else(|_| Signature::now("AGI Agent", "agent@agiworkforce.com"))
            .map_err(|e| e.message().to_string())?;

        let parent_commit = match repo.head() {
            Ok(head) => {
                let target = head.target().ok_or("HEAD has no target")?;
                Some(
                    repo.find_commit(target)
                        .map_err(|e| e.message().to_string())?,
                )
            }
            Err(_) => None, // Initial commit
        };

        let parents = if let Some(ref commit) = parent_commit {
            vec![commit]
        } else {
            vec![]
        };

        let commit_id = repo
            .commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)
            .map_err(|e| e.message().to_string())?;

        Ok(commit_id.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Push to remote repository
#[tauri::command]
pub async fn git_push(
    path: String,
    remote: Option<String>,
    branch: Option<String>,
    force: bool,
) -> Result<String, String> {
    let remote_name = remote.unwrap_or_else(|| "origin".to_string());
    tracing::info!("Pushing to {}", remote_name);

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;
        let mut remote = repo
            .find_remote(&remote_name)
            .map_err(|e| e.message().to_string())?;

        let branch_name = if let Some(b) = branch {
            b
        } else {
            let head = repo.head().map_err(|e| e.message().to_string())?;
            head.shorthand().unwrap_or("main").to_string()
        };

        let refspec = format!("refs/heads/{}:refs/heads/{}", branch_name, branch_name);
        let refspec = if force {
            format!("+{}", refspec)
        } else {
            refspec
        };

        let mut callbacks = RemoteCallbacks::new();
        callbacks.credentials(|_url, username_from_url, _allowed_types| {
            Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"))
        });

        let mut push_opts = PushOptions::new();
        push_opts.remote_callbacks(callbacks);

        remote
            .push(&[&refspec], Some(&mut push_opts))
            .map_err(|e| e.message().to_string())?;

        Ok("Push successful".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Pull from remote repository
#[tauri::command]
pub async fn git_pull(
    path: String,
    remote: Option<String>,
    branch: Option<String>,
) -> Result<String, String> {
    let remote_name = remote.unwrap_or_else(|| "origin".to_string());
    tracing::info!("Pulling from {}", remote_name);

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;
        let mut remote = repo
            .find_remote(&remote_name)
            .map_err(|e| e.message().to_string())?;

        let branch_name = if let Some(b) = branch {
            b
        } else {
            let head = repo.head().map_err(|e| e.message().to_string())?;
            head.shorthand().unwrap_or("main").to_string()
        };

        let mut callbacks = RemoteCallbacks::new();
        callbacks.credentials(|_url, username_from_url, _allowed_types| {
            Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"))
        });

        let mut fetch_opts = FetchOptions::new();
        fetch_opts.remote_callbacks(callbacks);

        remote
            .fetch(&[&branch_name], Some(&mut fetch_opts), None)
            .map_err(|e| e.message().to_string())?;

        // Merge analysis
        let fetch_head = repo
            .find_reference("FETCH_HEAD")
            .map_err(|e| e.message().to_string())?;
        let fetch_commit = repo
            .reference_to_annotated_commit(&fetch_head)
            .map_err(|e| e.message().to_string())?;
        let analysis = repo
            .merge_analysis(&[&fetch_commit])
            .map_err(|e| e.message().to_string())?;

        if analysis.0.is_fast_forward() {
            let refname = format!("refs/heads/{}", branch_name);
            let mut reference = repo
                .find_reference(&refname)
                .map_err(|e| e.message().to_string())?;
            reference
                .set_target(fetch_commit.id(), "Fast-Forward")
                .map_err(|e| e.message().to_string())?;
            repo.set_head(&refname)
                .map_err(|e| e.message().to_string())?;
            repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
                .map_err(|e| e.message().to_string())?;
        } else if analysis.0.is_normal() {
            let head_commit = repo
                .reference_to_annotated_commit(&repo.head().unwrap())
                .unwrap();
            repo.merge(&[&fetch_commit], None, None)
                .map_err(|e| e.message().to_string())?;

            // Auto commit merge
            let sig = repo.signature().unwrap();
            let tree_id = repo.index().unwrap().write_tree().unwrap();
            let tree = repo.find_tree(tree_id).unwrap();

            let head_commit_obj = repo.find_commit(head_commit.id()).unwrap();
            let fetch_commit_obj = repo.find_commit(fetch_commit.id()).unwrap();

            repo.commit(
                Some("HEAD"),
                &sig,
                &sig,
                "Merge",
                &tree,
                &[&head_commit_obj, &fetch_commit_obj],
            )
            .unwrap();

            repo.checkout_head(None).unwrap();
        }

        Ok("Pull successful".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Create a new branch
#[tauri::command]
pub async fn git_create_branch(path: String, branch_name: String) -> Result<String, String> {
    tracing::info!("Creating branch: {}", branch_name);

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;
        let head = repo.head().map_err(|e| e.message().to_string())?;
        let commit = head.peel_to_commit().map_err(|e| e.message().to_string())?;

        repo.branch(&branch_name, &commit, false)
            .map_err(|e| e.message().to_string())?;

        Ok(format!("Branch '{}' created", branch_name))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Switch to a branch
#[tauri::command]
pub async fn git_checkout(path: String, branch_name: String) -> Result<String, String> {
    tracing::info!("Switching to branch: {}", branch_name);

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;
        let refname = format!("refs/heads/{}", branch_name);

        repo.set_head(&refname)
            .map_err(|e| e.message().to_string())?;
        repo.checkout_head(None)
            .map_err(|e| e.message().to_string())?;

        Ok(format!("Switched to branch '{}'", branch_name))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Create and switch to a new branch
#[tauri::command]
pub async fn git_checkout_new_branch(path: String, branch_name: String) -> Result<String, String> {
    tracing::info!("Creating and switching to branch: {}", branch_name);

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;
        let head = repo.head().map_err(|e| e.message().to_string())?;
        let commit = head.peel_to_commit().map_err(|e| e.message().to_string())?;

        repo.branch(&branch_name, &commit, false)
            .map_err(|e| e.message().to_string())?;

        let refname = format!("refs/heads/{}", branch_name);
        repo.set_head(&refname)
            .map_err(|e| e.message().to_string())?;
        repo.checkout_head(None)
            .map_err(|e| e.message().to_string())?;

        Ok(format!("Switched to new branch '{}'", branch_name))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// List all branches
#[tauri::command]
pub async fn git_list_branches(path: String) -> Result<Vec<GitBranch>, String> {
    tracing::info!("Listing branches");

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;
        let branches = repo
            .branches(Some(BranchType::Local))
            .map_err(|e| e.message().to_string())?;

        let mut result = Vec::new();
        let head_name = repo
            .head()
            .ok()
            .and_then(|h| h.shorthand().map(|s| s.to_string()));

        for b in branches {
            let (branch, _) = b.map_err(|e| e.message().to_string())?;
            let name = branch.name().unwrap_or(Some("")).unwrap_or("").to_string();
            let is_current = Some(&name) == head_name.as_ref();

            let last_commit = if let Ok(commit) = branch.get().peel_to_commit() {
                commit.id().to_string()
            } else {
                String::new()
            };

            result.push(GitBranch {
                name,
                is_current,
                last_commit,
            });
        }

        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Delete a branch
#[tauri::command]
pub async fn git_delete_branch(
    path: String,
    branch_name: String,
    _force: bool, // git2 handles safety checks
) -> Result<String, String> {
    tracing::info!("Deleting branch: {}", branch_name);

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;
        let mut branch = repo
            .find_branch(&branch_name, BranchType::Local)
            .map_err(|e| e.message().to_string())?;

        branch.delete().map_err(|e| e.message().to_string())?;

        Ok(format!("Branch '{}' deleted", branch_name))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Merge a branch
#[tauri::command]
pub async fn git_merge(path: String, branch_name: String) -> Result<String, String> {
    tracing::info!("Merging branch: {}", branch_name);

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;
        let branch = repo
            .find_branch(&branch_name, BranchType::Local)
            .map_err(|e| e.message().to_string())?;

        let annotated_commit = repo
            .reference_to_annotated_commit(branch.get())
            .map_err(|e| e.message().to_string())?;

        let (analysis, _) = repo
            .merge_analysis(&[&annotated_commit])
            .map_err(|e| e.message().to_string())?;

        if analysis.is_fast_forward() {
            let refname = format!("refs/heads/{}", branch_name);
            let mut reference = repo.find_reference(&refname).unwrap();
            let target_id = annotated_commit.id();
            reference.set_target(target_id, "Fast-Forward").unwrap();
            repo.set_head(&refname).unwrap();
            repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
                .unwrap();
        } else if analysis.is_normal() {
            let head_commit = repo
                .reference_to_annotated_commit(&repo.head().unwrap())
                .unwrap();
            repo.merge(&[&annotated_commit], None, None)
                .map_err(|e| e.message().to_string())?;

            // Auto commit
            let sig = repo.signature().unwrap();
            let tree_id = repo.index().unwrap().write_tree().unwrap();
            let tree = repo.find_tree(tree_id).unwrap();

            let head_commit_obj = repo.find_commit(head_commit.id()).unwrap();
            let other_commit_obj = repo.find_commit(annotated_commit.id()).unwrap();

            repo.commit(
                Some("HEAD"),
                &sig,
                &sig,
                "Merge",
                &tree,
                &[&head_commit_obj, &other_commit_obj],
            )
            .unwrap();

            repo.checkout_head(None).unwrap();
        }

        Ok("Merge successful".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Get commit log
#[tauri::command]
pub async fn git_log(path: String, limit: Option<usize>) -> Result<Vec<GitCommit>, String> {
    let max_count = limit.unwrap_or(50);
    tracing::info!("Getting commit log (limit: {})", max_count);

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;
        let mut revwalk = repo.revwalk().map_err(|e| e.message().to_string())?;
        revwalk.push_head().map_err(|e| e.message().to_string())?;

        let mut commits = Vec::new();
        for oid in revwalk.take(max_count) {
            let oid = oid.map_err(|e| e.message().to_string())?;
            let commit = repo.find_commit(oid).map_err(|e| e.message().to_string())?;

            let sig = commit.author();
            commits.push(GitCommit {
                hash: oid.to_string(),
                author: sig.name().unwrap_or("").to_string(),
                email: sig.email().unwrap_or("").to_string(),
                date: commit.time().seconds().to_string(),
                message: commit.message().unwrap_or("").to_string(),
            });
        }

        Ok(commits)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Get diff for a file or all changes
#[tauri::command]
pub async fn git_diff(
    path: String,
    file_path: Option<String>,
    staged: bool,
) -> Result<Vec<GitDiff>, String> {
    tracing::info!("Getting diff{}", if staged { " (staged)" } else { "" });

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;
        let mut opts = git2::DiffOptions::new();

        if let Some(fp) = file_path {
            opts.pathspec(fp);
        }

        let diff = if staged {
            let head = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
            repo.diff_tree_to_index(head.as_ref(), Some(&repo.index().unwrap()), Some(&mut opts))
        } else {
            repo.diff_index_to_workdir(None, Some(&mut opts))
        }
        .map_err(|e| e.message().to_string())?;

        let mut diffs = Vec::new();

        diff.foreach(
            &mut |delta, _progress| {
                let path = delta
                    .new_file()
                    .path()
                    .unwrap()
                    .to_string_lossy()
                    .to_string();
                diffs.push(GitDiff {
                    file_path: path,
                    additions: 0, // Calculating exact lines requires more complex diff parsing
                    deletions: 0,
                    diff_content: String::new(),
                });
                true
            },
            None,
            None,
            None,
        )
        .map_err(|e| e.message().to_string())?;

        Ok(diffs)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Clone a repository
#[tauri::command]
pub async fn git_clone(url: String, destination: String) -> Result<String, String> {
    tracing::info!("Cloning repository from: {}", url);

    spawn_blocking(move || {
        let mut callbacks = RemoteCallbacks::new();
        callbacks.credentials(|_url, username_from_url, _allowed_types| {
            Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"))
        });

        let mut fetch_opts = FetchOptions::new();
        fetch_opts.remote_callbacks(callbacks);

        let mut builder = git2::build::RepoBuilder::new();
        builder.fetch_options(fetch_opts);

        builder
            .clone(&url, Path::new(&destination))
            .map(|_| "Clone successful".to_string())
            .map_err(|e| e.message().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Fetch from remote
#[tauri::command]
pub async fn git_fetch(path: String, remote: Option<String>) -> Result<String, String> {
    let remote_name = remote.unwrap_or_else(|| "origin".to_string());
    tracing::info!("Fetching from: {}", remote_name);

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;
        let mut remote = repo
            .find_remote(&remote_name)
            .map_err(|e| e.message().to_string())?;

        let mut callbacks = RemoteCallbacks::new();
        callbacks.credentials(|_url, username_from_url, _allowed_types| {
            Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"))
        });

        let mut fetch_opts = FetchOptions::new();
        fetch_opts.remote_callbacks(callbacks);

        remote
            .fetch(&[] as &[&str], Some(&mut fetch_opts), None)
            .map(|_| "Fetch successful".to_string())
            .map_err(|e| e.message().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Stash changes
#[tauri::command]
pub async fn git_stash(path: String, message: Option<String>) -> Result<String, String> {
    tracing::info!("Stashing changes");

    spawn_blocking(move || {
        let mut repo = Repository::open(&path).map_err(|e| e.message().to_string())?;
        let sig = repo.signature().map_err(|e| e.message().to_string())?;

        repo.stash_save(
            &sig,
            message.as_deref().unwrap_or("Stash"),
            Some(git2::StashFlags::DEFAULT),
        )
        .map(|_| "Stash successful".to_string())
        .map_err(|e| e.message().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Pop stashed changes
#[tauri::command]
pub async fn git_stash_pop(path: String) -> Result<String, String> {
    tracing::info!("Popping stash");

    spawn_blocking(move || {
        let mut repo = Repository::open(&path).map_err(|e| e.message().to_string())?;
        repo.stash_pop(0, None)
            .map(|_| "Stash pop successful".to_string())
            .map_err(|e| e.message().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Reset to a specific commit
#[tauri::command]
pub async fn git_reset(
    path: String,
    commit: String,
    mode: String, // soft, mixed, hard
) -> Result<String, String> {
    tracing::info!("Resetting to {} ({})", commit, mode);

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;
        let oid = git2::Oid::from_str(&commit).map_err(|e| e.message().to_string())?;
        let object = repo
            .find_object(oid, None)
            .map_err(|e| e.message().to_string())?;

        let reset_type = match mode.as_str() {
            "soft" => git2::ResetType::Soft,
            "mixed" => git2::ResetType::Mixed,
            "hard" => git2::ResetType::Hard,
            _ => return Err(format!("Invalid reset mode: {}", mode)),
        };

        repo.reset(&object, reset_type, None)
            .map(|_| "Reset successful".to_string())
            .map_err(|e| e.message().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Get remote repositories
#[tauri::command]
pub async fn git_list_remotes(path: String) -> Result<Vec<(String, String)>, String> {
    tracing::info!("Listing remotes");

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;
        let remotes = repo.remotes().map_err(|e| e.message().to_string())?;

        let mut result = Vec::new();
        for name in remotes.iter() {
            if let Some(name) = name {
                if let Ok(remote) = repo.find_remote(name) {
                    let url = remote.url().unwrap_or("").to_string();
                    result.push((name.to_string(), url));
                }
            }
        }

        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Add a remote
#[tauri::command]
pub async fn git_add_remote(path: String, name: String, url: String) -> Result<String, String> {
    tracing::info!("Adding remote {} -> {}", name, url);

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;
        repo.remote(&name, &url)
            .map_err(|e| e.message().to_string())?;
        Ok(format!("Remote '{}' added", name))
    })
    .await
    .map_err(|e| e.to_string())?
}
