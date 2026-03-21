use crate::core::agi::executors::{
    BranchDiffSummary, ConflictHunk, ConflictParser, ConflictResolver, GeneratedPrContent,
    HunkResolution, PrCreationConfig, PrCreationResult, PrCreationWorkflow, ResolutionResult,
    ResolutionStrategy,
};
use crate::core::llm::LLMRouter;
use git2::{
    BranchType, Cred, FetchOptions, PushOptions, RemoteCallbacks, Repository, Signature,
    StatusOptions,
};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use tauri::async_runtime::spawn_blocking;
use tauri::State;
use tokio::sync::RwLock;

/// Build a git2 credential fallback chain that works on all platforms.
///
/// On macOS/Linux the SSH agent is typically running so `ssh_key_from_agent`
/// succeeds on the first try. On Windows the agent is often absent; we fall
/// back to probing the standard key files in `~/.ssh` and finally to the
/// system credential helper for HTTPS remotes.
pub(crate) fn make_git_credentials(
    url: &str,
    username_from_url: Option<&str>,
    allowed_types: git2::CredentialType,
) -> std::result::Result<Cred, git2::Error> {
    let username = username_from_url.unwrap_or("git");

    if allowed_types.contains(git2::CredentialType::SSH_KEY) {
        // Prefer the SSH agent (works on macOS/Linux by default, Windows if configured).
        if let Ok(cred) = Cred::ssh_key_from_agent(username) {
            return Ok(cred);
        }

        // Fallback: probe default key files in ~/.ssh
        let ssh_dir = dirs::home_dir().unwrap_or_default().join(".ssh");

        for key_name in &["id_ed25519", "id_rsa", "id_ecdsa"] {
            let private_key = ssh_dir.join(key_name);
            if private_key.exists() {
                if let Ok(cred) = Cred::ssh_key(username, None, &private_key, None) {
                    return Ok(cred);
                }
            }
        }
    }

    // HTTPS / credential-helper path
    if allowed_types.contains(git2::CredentialType::USER_PASS_PLAINTEXT) {
        let cfg = git2::Config::open_default().unwrap_or_else(|_| {
            git2::Config::new().expect("git2 in-memory config must be constructible")
        });
        return Cred::credential_helper(&cfg, url, username_from_url);
    }

    Err(git2::Error::from_str(
        "No valid credentials found. Configure SSH agent or SSH keys in ~/.ssh/",
    ))
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCommit {
    pub hash: String,
    pub author: String,
    pub email: String,
    pub date: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
    pub last_commit: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitDiff {
    pub file_path: String,
    pub additions: usize,
    pub deletions: usize,
    pub diff_content: String,
}

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

#[tauri::command]
pub async fn git_status(path: String) -> Result<GitStatus, String> {
    tracing::info!("Getting Git status for: {}", path);

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;

        let head = repo.head().ok();
        let branch = head
            .as_ref()
            .and_then(|h| h.shorthand())
            .unwrap_or("HEAD (detached)")
            .to_string();

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

        // AUDIT-003-008 fix: Log warning when using fallback signature to make
        // it explicit that the true committer identity is not configured
        let sig = match repo.signature() {
            Ok(sig) => sig,
            Err(e) => {
                tracing::warn!(
                    "Git user.name/user.email not configured, using fallback identity 'AGI Agent <agent@agiworkforce.com>'. \
                    Original error: {}. Configure with 'git config --global user.name' and 'git config --global user.email'",
                    e.message()
                );
                Signature::now("AGI Agent", "agent@agiworkforce.com")
                    .map_err(|e| e.message().to_string())?
            }
        };

        let parent_commit = match repo.head() {
            Ok(head) => {
                let target = head.target().ok_or("HEAD has no target")?;
                Some(
                    repo.find_commit(target)
                        .map_err(|e| e.message().to_string())?,
                )
            }
            Err(_) => None,
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

#[tauri::command]
pub async fn git_push(
    app: tauri::AppHandle,
    path: String,
    remote: Option<String>,
    branch: Option<String>,
    force: bool,
) -> Result<String, String> {
    let remote_name = remote.unwrap_or_else(|| "origin".to_string());
    tracing::info!("Pushing to {}", remote_name);

    // AUDIT-FIX: Enforce user confirmation for push
    // We categorize this as "git_push" tool
    let confirmation_args = serde_json::json!({
        "path": path,
        "remote": remote_name,
        "branch": branch,
        "force": force
    });

    // We treat git push as always requiring confirmation for now,
    // or we could check command_validator::requires_confirmation("git push")
    // But since this is a specific tool command, we can just enforce it directly
    // or use the validator if we want centralized config.
    // Let's use the validator to be consistent with terminal.rs
    if crate::sys::security::command_validator::requires_confirmation("git push") {
        crate::sys::commands::tool_confirmation::request_confirmation_simple(
            &app,
            "git_push",
            &confirmation_args,
        )
        .await?;
    }

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
        callbacks.credentials(make_git_credentials);

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
        callbacks.credentials(make_git_credentials);

        let mut fetch_opts = FetchOptions::new();
        fetch_opts.remote_callbacks(callbacks);

        remote
            .fetch(&[&branch_name], Some(&mut fetch_opts), None)
            .map_err(|e| e.message().to_string())?;

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
            let head = repo.head().map_err(|e| e.message().to_string())?;
            let head_commit = repo
                .reference_to_annotated_commit(&head)
                .map_err(|e| e.message().to_string())?;
            repo.merge(&[&fetch_commit], None, None)
                .map_err(|e| e.message().to_string())?;

            let sig = repo.signature().map_err(|e| e.message().to_string())?;
            let mut index = repo.index().map_err(|e| e.message().to_string())?;
            let tree_id = index.write_tree().map_err(|e| e.message().to_string())?;
            let tree = repo
                .find_tree(tree_id)
                .map_err(|e| e.message().to_string())?;

            let head_commit_obj = repo
                .find_commit(head_commit.id())
                .map_err(|e| e.message().to_string())?;
            let fetch_commit_obj = repo
                .find_commit(fetch_commit.id())
                .map_err(|e| e.message().to_string())?;

            repo.commit(
                Some("HEAD"),
                &sig,
                &sig,
                "Merge",
                &tree,
                &[&head_commit_obj, &fetch_commit_obj],
            )
            .map_err(|e| e.message().to_string())?;

            repo.checkout_head(None)
                .map_err(|e| e.message().to_string())?;
        }

        Ok("Pull successful".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

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

#[tauri::command]
pub async fn git_delete_branch(
    app: tauri::AppHandle,
    path: String,
    branch_name: String,
    _force: bool,
) -> Result<String, String> {
    tracing::info!("Deleting branch: {}", branch_name);

    // AUDIT-FIX: Enforce user confirmation for branch deletion
    let confirmation_args = serde_json::json!({
        "path": path,
        "branch_name": branch_name,
        "force": _force
    });

    if crate::sys::security::command_validator::requires_confirmation("git branch -D") {
        crate::sys::commands::tool_confirmation::request_confirmation_simple(
            &app,
            "git_delete_branch",
            &confirmation_args,
        )
        .await?;
    }

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

        // AUDIT-003-004 fix: Replace unwrap() calls with proper error propagation
        if analysis.is_fast_forward() {
            let refname = format!("refs/heads/{}", branch_name);
            let mut reference = repo
                .find_reference(&refname)
                .map_err(|e| e.message().to_string())?;
            let target_id = annotated_commit.id();
            reference
                .set_target(target_id, "Fast-Forward")
                .map_err(|e| e.message().to_string())?;
            repo.set_head(&refname)
                .map_err(|e| e.message().to_string())?;
            repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
                .map_err(|e| e.message().to_string())?;
        } else if analysis.is_normal() {
            let head_ref = repo.head().map_err(|e| e.message().to_string())?;
            let head_commit = repo
                .reference_to_annotated_commit(&head_ref)
                .map_err(|e| e.message().to_string())?;
            repo.merge(&[&annotated_commit], None, None)
                .map_err(|e| e.message().to_string())?;

            // AUDIT-003-008 fix: Log warning when using fallback signature
            let sig = match repo.signature() {
                Ok(sig) => sig,
                Err(e) => {
                    tracing::warn!(
                        "Git user.name/user.email not configured for merge, using fallback identity. \
                        Original error: {}",
                        e.message()
                    );
                    Signature::now("AGI Agent", "agent@agiworkforce.com")
                        .map_err(|e| e.message().to_string())?
                }
            };
            let mut index = repo.index().map_err(|e| e.message().to_string())?;
            let tree_id = index.write_tree().map_err(|e| e.message().to_string())?;
            let tree = repo
                .find_tree(tree_id)
                .map_err(|e| e.message().to_string())?;

            let head_commit_obj = repo
                .find_commit(head_commit.id())
                .map_err(|e| e.message().to_string())?;
            let other_commit_obj = repo
                .find_commit(annotated_commit.id())
                .map_err(|e| e.message().to_string())?;

            repo.commit(
                Some("HEAD"),
                &sig,
                &sig,
                "Merge",
                &tree,
                &[&head_commit_obj, &other_commit_obj],
            )
            .map_err(|e| e.message().to_string())?;

            repo.checkout_head(None).map_err(|e| e.message().to_string())?;
        }

        Ok("Merge successful".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

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

        // AUDIT-P3-002: Avoid unwrap() on index() - use proper error handling
        let diff = if staged {
            let head = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
            let index = repo.index().map_err(|e| e.message().to_string())?;
            repo.diff_tree_to_index(head.as_ref(), Some(&index), Some(&mut opts))
        } else {
            repo.diff_index_to_workdir(None, Some(&mut opts))
        }
        .map_err(|e| e.message().to_string())?;

        let mut diffs = Vec::new();

        diff.print(git2::DiffFormat::Patch, |delta, _hunk, line| {
            let path = delta
                .new_file()
                .path()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| "".to_string());

            let entry_idx =
                if let Some(idx) = diffs.iter().position(|d: &GitDiff| d.file_path == path) {
                    idx
                } else {
                    diffs.push(GitDiff {
                        file_path: path.clone(),
                        additions: 0,
                        deletions: 0,
                        diff_content: String::new(),
                    });
                    diffs.len() - 1
                };

            let entry = &mut diffs[entry_idx];

            let content = std::str::from_utf8(line.content()).unwrap_or("");
            match line.origin() {
                '+' | '>' => {
                    entry.additions += 1;
                    entry.diff_content.push_str(&format!("+{}", content));
                }
                '-' | '<' => {
                    entry.deletions += 1;
                    entry.diff_content.push_str(&format!("-{}", content));
                }
                ' ' | '=' => {
                    entry.diff_content.push_str(&format!(" {}", content));
                }
                'H' | 'F' => {
                    entry.diff_content.push_str(content);
                }
                _ => {}
            }
            true
        })
        .map_err(|e| e.message().to_string())?;

        Ok(diffs)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_clone(url: String, destination: String) -> Result<String, String> {
    tracing::info!("Cloning repository from: {}", url);

    spawn_blocking(move || {
        let mut callbacks = RemoteCallbacks::new();
        callbacks.credentials(make_git_credentials);

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
        callbacks.credentials(make_git_credentials);

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

#[tauri::command]
pub async fn git_reset(
    app: tauri::AppHandle,
    path: String,
    commit: String,
    mode: String,
    files: Option<Vec<String>>,
) -> Result<String, String> {
    tracing::info!("Resetting to {} ({})", commit, mode);

    // If files specified, reset only those files (git reset HEAD -- <files>)
    if let Some(ref file_list) = files {
        if !file_list.is_empty() {
            tracing::info!("Resetting {} specific files", file_list.len());

            let confirmation_args = serde_json::json!({
                "path": path,
                "files": file_list
            });

            if crate::sys::security::command_validator::requires_confirmation("git reset") {
                crate::sys::commands::tool_confirmation::request_confirmation_simple(
                    &app,
                    "git_reset",
                    &confirmation_args,
                )
                .await?;
            }

            let path_clone = path.clone();
            let file_list_clone = file_list.clone();
            return spawn_blocking(move || {
                let mut cmd = std::process::Command::new("git");
                cmd.current_dir(&path_clone)
                    .arg("reset")
                    .arg("HEAD")
                    .arg("--");
                for f in &file_list_clone {
                    cmd.arg(f);
                }
                let output = cmd.output().map_err(|e| e.to_string())?;
                if output.status.success() {
                    Ok(format!(
                        "Reset {} file(s) successfully",
                        file_list_clone.len()
                    ))
                } else {
                    Err(String::from_utf8_lossy(&output.stderr).to_string())
                }
            })
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    // AUDIT-FIX: Enforce user confirmation for reset
    let confirmation_args = serde_json::json!({
        "path": path,
        "commit": commit,
        "mode": mode
    });

    if crate::sys::security::command_validator::requires_confirmation("git reset") {
        crate::sys::commands::tool_confirmation::request_confirmation_simple(
            &app,
            "git_reset",
            &confirmation_args,
        )
        .await?;
    }

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

#[tauri::command]
pub async fn git_checkout_files(
    app: tauri::AppHandle,
    path: String,
    files: Vec<String>,
) -> Result<String, String> {
    tracing::info!("Checking out {} files to discard changes", files.len());

    if files.is_empty() {
        return Err("No files specified".to_string());
    }

    // AUDIT-FIX: Enforce user confirmation for checkout (destructive operation)
    let confirmation_args = serde_json::json!({
        "path": path,
        "files": files
    });

    if crate::sys::security::command_validator::requires_confirmation("git checkout") {
        crate::sys::commands::tool_confirmation::request_confirmation_simple(
            &app,
            "git_checkout_files",
            &confirmation_args,
        )
        .await?;
    }

    let files_clone = files.clone();
    spawn_blocking(move || {
        let mut cmd = std::process::Command::new("git");
        cmd.current_dir(&path).arg("checkout").arg("--");
        for f in &files_clone {
            cmd.arg(f);
        }
        let output = cmd.output().map_err(|e| e.to_string())?;
        if output.status.success() {
            Ok(format!(
                "Discarded changes in {} file(s)",
                files_clone.len()
            ))
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_list_remotes(path: String) -> Result<Vec<(String, String)>, String> {
    tracing::info!("Listing remotes");

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;
        let remotes = repo.remotes().map_err(|e| e.message().to_string())?;

        let mut result = Vec::new();
        for name in remotes.iter().flatten() {
            if let Ok(remote) = repo.find_remote(name) {
                let url = remote.url().unwrap_or("").to_string();
                result.push((name.to_string(), url));
            }
        }

        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}

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

// ============================================================================
// Conflict Resolution Commands
// ============================================================================

/// Conflict details for a file, serializable for the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitConflictDetails {
    /// Relative path to the file within the repository.
    pub file_path: String,
    /// The full content of the file with conflict markers.
    pub full_content: String,
    /// Individual conflict hunks within this file.
    pub hunks: Vec<ConflictHunk>,
    /// Total number of conflicts in this file.
    pub conflict_count: usize,
}

/// List all files with merge conflicts in a repository.
///
/// Returns a list of file paths that have unresolved conflicts.
#[tauri::command]
pub async fn git_list_conflicts(path: String) -> Result<Vec<String>, String> {
    tracing::info!("Listing conflicts in: {}", path);

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;

        let mut opts = StatusOptions::new();
        opts.include_untracked(false);

        let statuses = repo
            .statuses(Some(&mut opts))
            .map_err(|e| e.message().to_string())?;

        let mut conflicts = Vec::new();

        for entry in statuses.iter() {
            let file_path = entry.path().unwrap_or("").to_string();
            let status = entry.status();

            if status.contains(git2::Status::CONFLICTED) {
                conflicts.push(file_path);
            }
        }

        // Also check for conflict markers in files that git might have missed
        // (e.g., after manual edits)
        let workdir = repo.workdir().ok_or("Not a working directory")?;

        for entry in statuses.iter() {
            let file_path = entry.path().unwrap_or("");
            if conflicts.contains(&file_path.to_string()) {
                continue;
            }

            let full_path = workdir.join(file_path);
            if full_path.is_file() {
                if let Ok(content) = std::fs::read_to_string(&full_path) {
                    if ConflictParser::has_conflicts(&content) {
                        conflicts.push(file_path.to_string());
                    }
                }
            }
        }

        tracing::info!("Found {} files with conflicts", conflicts.len());
        Ok(conflicts)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Get detailed conflict information for a specific file.
///
/// Parses the file content and extracts all conflict hunks with
/// their "ours" and "theirs" versions.
#[tauri::command]
pub async fn git_get_conflict_details(
    path: String,
    file_path: String,
) -> Result<GitConflictDetails, String> {
    tracing::info!("Getting conflict details for: {}/{}", path, file_path);

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;
        let workdir = repo.workdir().ok_or("Not a working directory")?;

        let full_path = workdir.join(&file_path);
        if !full_path.is_file() {
            return Err(format!("File not found: {}", file_path));
        }

        let content = std::fs::read_to_string(&full_path)
            .map_err(|e| format!("Failed to read file: {}", e))?;

        let hunks = ConflictParser::parse_conflicts(&content);
        let conflict_count = hunks.len();

        if conflict_count == 0 {
            return Err(format!("No conflicts found in: {}", file_path));
        }

        tracing::info!("Found {} conflicts in file: {}", conflict_count, file_path);

        Ok(GitConflictDetails {
            file_path,
            full_content: content,
            hunks,
            conflict_count,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Resolution request for the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictResolutionRequest {
    /// Index of the hunk to resolve (0-indexed).
    pub hunk_index: usize,
    /// Resolution strategy to apply.
    pub strategy: String, // "keep_ours", "keep_theirs", "keep_both", "manual"
    /// Content for manual resolution (required if strategy is "manual").
    pub manual_content: Option<String>,
}

/// Resolve conflicts in a file.
///
/// Applies the specified resolutions to the file and writes the result.
/// Returns information about the resolution result.
#[tauri::command]
pub async fn git_resolve_conflict(
    path: String,
    file_path: String,
    resolutions: Vec<ConflictResolutionRequest>,
) -> Result<ResolutionResult, String> {
    tracing::info!(
        "Resolving {} conflicts in: {}/{}",
        resolutions.len(),
        path,
        file_path
    );

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;
        let workdir = repo.workdir().ok_or("Not a working directory")?;

        let full_path = workdir.join(&file_path);
        if !full_path.is_file() {
            return Err(format!("File not found: {}", file_path));
        }

        let content = std::fs::read_to_string(&full_path)
            .map_err(|e| format!("Failed to read file: {}", e))?;

        let hunks = ConflictParser::parse_conflicts(&content);

        if hunks.is_empty() {
            return Ok(ResolutionResult {
                file_path: file_path.clone(),
                success: true,
                resolved_content: Some(content),
                error: None,
                conflicts_resolved: 0,
                conflicts_remaining: 0,
            });
        }

        // Convert frontend resolutions to internal format
        let internal_resolutions: Vec<HunkResolution> = resolutions
            .iter()
            .map(|r| {
                let strategy = match r.strategy.as_str() {
                    "keep_ours" => ResolutionStrategy::KeepOurs,
                    "keep_theirs" => ResolutionStrategy::KeepTheirs,
                    "keep_both" => ResolutionStrategy::KeepBoth,
                    "manual" => ResolutionStrategy::Manual,
                    "llm_suggested" => ResolutionStrategy::LlmSuggested,
                    _ => ResolutionStrategy::KeepOurs, // Default fallback
                };

                HunkResolution {
                    hunk_index: r.hunk_index,
                    strategy,
                    resolved_content: r.manual_content.clone(),
                }
            })
            .collect();

        // Apply resolutions
        let resolved_content =
            ConflictResolver::resolve_all_hunks(&content, &hunks, &internal_resolutions)
                .map_err(|e| format!("Resolution failed: {}", e))?;

        // Check how many conflicts remain
        let remaining_conflicts = ConflictParser::count_conflicts(&resolved_content);
        let resolved_count = hunks.len().saturating_sub(remaining_conflicts);

        // Write the resolved content back to the file
        std::fs::write(&full_path, &resolved_content)
            .map_err(|e| format!("Failed to write resolved file: {}", e))?;

        tracing::info!(
            "Resolved {} conflicts in {}, {} remaining",
            resolved_count,
            file_path,
            remaining_conflicts
        );

        Ok(ResolutionResult {
            file_path,
            success: remaining_conflicts == 0,
            resolved_content: Some(resolved_content),
            error: None,
            conflicts_resolved: resolved_count,
            conflicts_remaining: remaining_conflicts,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Mark a file's conflicts as resolved (stage it for commit).
///
/// This should be called after all conflicts in a file have been resolved.
#[tauri::command]
pub async fn git_mark_resolved(path: String, file_path: String) -> Result<String, String> {
    tracing::info!("Marking {} as resolved", file_path);

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;

        // Read the file to verify no conflicts remain
        let workdir = repo.workdir().ok_or("Not a working directory")?;
        let full_path = workdir.join(&file_path);

        if full_path.is_file() {
            let content = std::fs::read_to_string(&full_path)
                .map_err(|e| format!("Failed to read file: {}", e))?;

            if ConflictParser::has_conflicts(&content) {
                return Err(format!(
                    "File {} still has {} unresolved conflicts",
                    file_path,
                    ConflictParser::count_conflicts(&content)
                ));
            }
        }

        // Stage the resolved file
        let mut index = repo.index().map_err(|e| e.message().to_string())?;
        index
            .add_path(Path::new(&file_path))
            .map_err(|e| e.message().to_string())?;
        index.write().map_err(|e| e.message().to_string())?;

        Ok(format!("Marked {} as resolved", file_path))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Get an LLM-generated suggestion for resolving a conflict hunk.
///
/// This prepares a prompt that can be sent to the LLM router for
/// intelligent merge suggestions.
#[tauri::command]
pub async fn git_get_conflict_suggestion_prompt(
    path: String,
    file_path: String,
    hunk_index: usize,
) -> Result<String, String> {
    tracing::info!(
        "Getting conflict suggestion prompt for: {}/{} hunk {}",
        path,
        file_path,
        hunk_index
    );

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;
        let workdir = repo.workdir().ok_or("Not a working directory")?;

        let full_path = workdir.join(&file_path);
        if !full_path.is_file() {
            return Err(format!("File not found: {}", file_path));
        }

        let content = std::fs::read_to_string(&full_path)
            .map_err(|e| format!("Failed to read file: {}", e))?;

        let hunks = ConflictParser::parse_conflicts(&content);

        if hunk_index >= hunks.len() {
            return Err(format!(
                "Hunk index {} out of range (file has {} conflicts)",
                hunk_index,
                hunks.len()
            ));
        }

        let prompt = ConflictResolver::generate_llm_prompt(&hunks[hunk_index], &file_path);
        Ok(prompt)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Check if the repository is in a conflicted state (e.g., during merge/rebase).
#[tauri::command]
pub async fn git_has_conflicts(path: String) -> Result<bool, String> {
    tracing::info!("Checking for conflicts in: {}", path);

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;

        // Check repository state
        let state = repo.state();
        let in_merge = matches!(
            state,
            git2::RepositoryState::Merge
                | git2::RepositoryState::Rebase
                | git2::RepositoryState::RebaseInteractive
                | git2::RepositoryState::RebaseMerge
                | git2::RepositoryState::CherryPick
                | git2::RepositoryState::Revert
        );

        if in_merge {
            // Check for actual conflicted files
            let mut opts = StatusOptions::new();
            opts.include_untracked(false);

            let statuses = repo
                .statuses(Some(&mut opts))
                .map_err(|e| e.message().to_string())?;

            for entry in statuses.iter() {
                if entry.status().contains(git2::Status::CONFLICTED) {
                    return Ok(true);
                }
            }
        }

        // Also check for conflict markers in the working directory
        let workdir = match repo.workdir() {
            Some(w) => w,
            None => return Ok(false),
        };

        let mut opts = StatusOptions::new();
        opts.include_untracked(false);

        let statuses = repo
            .statuses(Some(&mut opts))
            .map_err(|e| e.message().to_string())?;

        for entry in statuses.iter() {
            let file_path = match entry.path() {
                Some(p) => p,
                None => continue,
            };

            let full_path = workdir.join(file_path);
            if full_path.is_file() {
                if let Ok(content) = std::fs::read_to_string(&full_path) {
                    if ConflictParser::has_conflicts(&content) {
                        return Ok(true);
                    }
                }
            }
        }

        Ok(false)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Abort an in-progress merge operation.
#[tauri::command]
pub async fn git_abort_merge(path: String) -> Result<String, String> {
    tracing::info!("Aborting merge in: {}", path);

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;

        // Check if we're actually in a merge state
        let state = repo.state();
        if !matches!(state, git2::RepositoryState::Merge) {
            return Err("No merge in progress".to_string());
        }

        // Clean up the merge state
        repo.cleanup_state().map_err(|e| e.message().to_string())?;

        // Reset to HEAD
        let head = repo.head().map_err(|e| e.message().to_string())?;
        let target = head.target().ok_or("HEAD has no target")?;
        let object = repo
            .find_object(target, None)
            .map_err(|e| e.message().to_string())?;

        repo.reset(&object, git2::ResetType::Hard, None)
            .map_err(|e| e.message().to_string())?;

        Ok("Merge aborted".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Complete a merge after all conflicts have been resolved.
#[tauri::command]
pub async fn git_complete_merge(path: String, message: Option<String>) -> Result<String, String> {
    tracing::info!("Completing merge in: {}", path);

    spawn_blocking(move || {
        let mut repo = Repository::open(&path).map_err(|e| e.message().to_string())?;

        // Check if we're in a merge state
        let state = repo.state();
        if !matches!(state, git2::RepositoryState::Merge) {
            return Err("No merge in progress".to_string());
        }

        // Check for remaining conflicts (in a separate scope to release the borrow)
        {
            let mut opts = StatusOptions::new();
            opts.include_untracked(false);

            let statuses = repo
                .statuses(Some(&mut opts))
                .map_err(|e| e.message().to_string())?;

            for entry in statuses.iter() {
                if entry.status().contains(git2::Status::CONFLICTED) {
                    return Err("Cannot complete merge: unresolved conflicts remain".to_string());
                }
            }
        } // statuses is dropped here, releasing the borrow

        // Get merge heads
        let mut merge_heads = Vec::new();
        repo.mergehead_foreach(|oid| {
            merge_heads.push(*oid);
            true
        })
        .map_err(|e| e.message().to_string())?;

        if merge_heads.is_empty() {
            return Err("No merge heads found".to_string());
        }

        // Create the merge commit
        // AUDIT-003-008 fix: Log warning when using fallback signature
        let sig = match repo.signature() {
            Ok(sig) => sig,
            Err(e) => {
                tracing::warn!(
                    "Git user.name/user.email not configured for merge completion, using fallback identity. \
                    Original error: {}",
                    e.message()
                );
                Signature::now("AGI Agent", "agent@agiworkforce.com")
                    .map_err(|e| e.message().to_string())?
            }
        };

        let head = repo.head().map_err(|e| e.message().to_string())?;
        let head_target = head.target().ok_or("HEAD has no target")?;
        let head_commit = repo
            .find_commit(head_target)
            .map_err(|e| e.message().to_string())?;

        let mut index = repo.index().map_err(|e| e.message().to_string())?;
        let tree_id = index.write_tree().map_err(|e| e.message().to_string())?;
        let tree = repo
            .find_tree(tree_id)
            .map_err(|e| e.message().to_string())?;

        // Build parent commits
        let mut parents: Vec<git2::Commit> = vec![head_commit];
        for oid in &merge_heads {
            parents.push(
                repo.find_commit(*oid)
                    .map_err(|e| e.message().to_string())?,
            );
        }
        let parent_refs: Vec<&git2::Commit> = parents.iter().collect();

        let commit_message = message.unwrap_or_else(|| {
            format!("Merge commit (resolved {} merge heads)", merge_heads.len())
        });

        let commit_id = repo
            .commit(
                Some("HEAD"),
                &sig,
                &sig,
                &commit_message,
                &tree,
                &parent_refs,
            )
            .map_err(|e| e.message().to_string())?;

        // Clean up merge state
        repo.cleanup_state().map_err(|e| e.message().to_string())?;

        Ok(commit_id.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ============================================================================
// PR Creation Commands
// ============================================================================

/// State wrapper for LLM router access in PR commands.
pub struct GitPrState {
    pub router: Arc<RwLock<LLMRouter>>,
}

impl GitPrState {
    pub fn new(router: Arc<RwLock<LLMRouter>>) -> Self {
        Self { router }
    }
}

/// Get a summary of differences between two branches for PR preview.
///
/// Returns commit history, files changed, and diff statistics.
#[tauri::command]
pub async fn git_get_branch_diff_summary(
    path: String,
    base_branch: String,
    head_branch: String,
) -> Result<BranchDiffSummary, String> {
    tracing::info!(
        "Getting branch diff summary: {} -> {} in {}",
        head_branch,
        base_branch,
        path
    );

    spawn_blocking(move || {
        PrCreationWorkflow::get_branch_diff_summary(Path::new(&path), &base_branch, &head_branch)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Generate PR title and description using AI.
///
/// Uses the LLM to analyze the diff and generate a conventional commit style
/// title and a structured description.
#[tauri::command]
pub async fn git_generate_pr_description(
    path: String,
    base_branch: String,
    head_branch: String,
    state: State<'_, Arc<RwLock<LLMRouter>>>,
) -> Result<GeneratedPrContent, String> {
    tracing::info!(
        "Generating PR description: {} -> {} in {}",
        head_branch,
        base_branch,
        path
    );

    // Get diff summary first (blocking operation)
    let diff_summary = spawn_blocking({
        let path = path.clone();
        let base_branch = base_branch.clone();
        let head_branch = head_branch.clone();
        move || {
            PrCreationWorkflow::get_branch_diff_summary(
                Path::new(&path),
                &base_branch,
                &head_branch,
            )
        }
    })
    .await
    .map_err(|e| format!("Failed to get diff summary: {}", e))?
    .map_err(|e| format!("Failed to analyze branches: {}", e))?;

    if diff_summary.commits_ahead == 0 {
        return Err(format!(
            "No commits to merge from '{}' into '{}'",
            head_branch, base_branch
        ));
    }

    // Generate PR content using LLM
    let router = state.inner().clone();
    PrCreationWorkflow::generate_pr_content(&router, &diff_summary)
        .await
        .map_err(|e| format!("Failed to generate PR content: {}", e))
}

/// Create a pull request with optional AI-generated content.
///
/// This command prepares the PR content and returns the result.
/// Actual PR creation requires GitHub API integration (via MCP or direct API).
#[tauri::command]
pub async fn git_create_pr(
    path: String,
    config: PrCreationConfig,
    state: State<'_, Arc<RwLock<LLMRouter>>>,
) -> Result<PrCreationResult, String> {
    tracing::info!(
        "Creating PR: {} -> {} in {}",
        config.head_branch,
        config.base_branch,
        path
    );

    // Validate configuration
    if config.head_branch.is_empty() {
        return Err("Head branch cannot be empty".to_string());
    }

    if config.base_branch.is_empty() {
        return Err("Base branch cannot be empty".to_string());
    }

    let router = state.inner().clone();

    PrCreationWorkflow::create_pull_request_workflow(Path::new(&path), &config, &router)
        .await
        .map_err(|e| e.to_string())
}

/// Check if a branch is ready for PR creation.
///
/// Validates:
/// - Branch exists
/// - Branch has commits ahead of base
/// - Branch is pushed to remote (if remote is configured)
#[tauri::command]
pub async fn git_check_pr_readiness(
    path: String,
    base_branch: String,
    head_branch: String,
) -> Result<PrReadinessResult, String> {
    tracing::info!(
        "Checking PR readiness: {} -> {} in {}",
        head_branch,
        base_branch,
        path
    );

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;

        let mut result = PrReadinessResult {
            ready: true,
            issues: Vec::new(),
            commits_ahead: 0,
            has_remote: false,
            remote_up_to_date: false,
        };

        // Check if base branch exists
        let base_exists = repo
            .find_branch(&base_branch, BranchType::Local)
            .or_else(|_| repo.find_branch(&base_branch, BranchType::Remote))
            .is_ok();

        if !base_exists {
            result.ready = false;
            result
                .issues
                .push(format!("Base branch '{}' not found", base_branch));
        }

        // Check if head branch exists
        let head_branch_ref = repo
            .find_branch(&head_branch, BranchType::Local)
            .map_err(|_| format!("Head branch '{}' not found", head_branch))?;

        // Check commits ahead
        if base_exists {
            if let Ok(diff_summary) = PrCreationWorkflow::get_branch_diff_summary(
                Path::new(&path),
                &base_branch,
                &head_branch,
            ) {
                result.commits_ahead = diff_summary.commits_ahead;
                if diff_summary.commits_ahead == 0 {
                    result.ready = false;
                    result.issues.push(format!(
                        "No commits to merge from '{}' into '{}'",
                        head_branch, base_branch
                    ));
                }
            }
        }

        // Check if remote tracking branch exists
        if let Ok(upstream) = head_branch_ref.upstream() {
            result.has_remote = true;

            // Check if local is ahead of remote
            let local_oid = head_branch_ref
                .get()
                .target()
                .ok_or("Failed to get local branch target")?;

            let remote_oid = upstream
                .get()
                .target()
                .ok_or("Failed to get remote branch target")?;

            if local_oid == remote_oid {
                result.remote_up_to_date = true;
            } else {
                let (ahead, _behind) = repo
                    .graph_ahead_behind(local_oid, remote_oid)
                    .map_err(|e| e.message().to_string())?;

                if ahead > 0 {
                    result.issues.push(format!(
                        "Local branch is {} commit(s) ahead of remote. Consider pushing first.",
                        ahead
                    ));
                } else {
                    result.remote_up_to_date = true;
                }
            }
        } else {
            result.issues.push(format!(
                "Branch '{}' has no upstream tracking branch. Push with -u to set upstream.",
                head_branch
            ));
        }

        // Check for uncommitted changes
        let statuses = repo.statuses(None).map_err(|e| e.message().to_string())?;
        let has_changes = statuses.iter().any(|s| {
            let status = s.status();
            status.is_index_new()
                || status.is_index_modified()
                || status.is_index_deleted()
                || status.is_wt_modified()
                || status.is_wt_deleted()
        });

        if has_changes {
            result
                .issues
                .push("Working directory has uncommitted changes".to_string());
        }

        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Result of PR readiness check.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrReadinessResult {
    /// Whether the branch is ready for PR creation.
    pub ready: bool,
    /// List of issues that may prevent or complicate PR creation.
    pub issues: Vec<String>,
    /// Number of commits ahead of base branch.
    pub commits_ahead: usize,
    /// Whether the branch has a remote tracking branch.
    pub has_remote: bool,
    /// Whether the local branch is up-to-date with remote.
    pub remote_up_to_date: bool,
}

/// Get the current branch name.
#[tauri::command]
pub async fn git_current_branch(path: String) -> Result<String, String> {
    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;
        let head = repo.head().map_err(|e| e.message().to_string())?;

        if head.is_branch() {
            Ok(head.shorthand().unwrap_or("HEAD").to_string())
        } else {
            // Detached HEAD - return commit hash
            head.target()
                .map(|oid| format!("(detached at {})", &oid.to_string()[..7]))
                .ok_or_else(|| "Failed to get HEAD target".to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Get default branch name (main or master).
#[tauri::command]
pub async fn git_default_branch(path: String) -> Result<String, String> {
    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;

        // Check for common default branch names
        for branch_name in &["main", "master", "develop"] {
            if repo.find_branch(branch_name, BranchType::Local).is_ok() {
                return Ok(branch_name.to_string());
            }
        }

        // Check remote HEAD reference
        if let Ok(remote) = repo.find_remote("origin") {
            if let Some(url) = remote.url() {
                tracing::debug!("Remote URL: {}", url);
            }

            // Try to get default branch from remote
            if let Ok(remote_head) = repo.find_reference("refs/remotes/origin/HEAD") {
                if let Some(target) = remote_head.symbolic_target() {
                    // Format: refs/remotes/origin/main
                    if let Some(branch) = target.strip_prefix("refs/remotes/origin/") {
                        return Ok(branch.to_string());
                    }
                }
            }
        }

        // Fallback to "main"
        Ok("main".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
