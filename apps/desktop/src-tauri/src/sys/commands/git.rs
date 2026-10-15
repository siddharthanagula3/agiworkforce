use git2::{
    BranchType, Cred, FetchOptions, PushOptions, RemoteCallbacks, Repository, Signature,
    StatusOptions,
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::async_runtime::spawn_blocking;

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
        let mut helper = git2::CredentialHelper::new(url);
        helper.config(&cfg);
        if let Some((user, pass)) = helper.execute() {
            return Cred::userpass_plaintext(&user, &pass);
        }
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

/// What a desktop user can do when host git refuses a repository's
/// configuration: trusting the project's git settings records them as they
/// are now, through [`git_trust_repository_config`].
const DESKTOP_CONFIG_REMEDY: &str = "Remove the setting, or, if you set it yourself, open \
     Project settings \u{2192} Trust this project's git settings, and try again.";

/// `error` as the desktop shows it: a refusal of the repository's
/// configuration ends with what to do on the desktop.
pub(crate) fn desktop_git_error(error: anyhow::Error) -> String {
    match error.downcast_ref::<agiworkforce_worktree::config_guard::UntrustedRepositoryConfig>() {
        Some(refusal) => refusal.message(DESKTOP_CONFIG_REMEDY),
        None => error.to_string(),
    }
}

/// How long a host git that holds its caller's thread may run.
pub(crate) const HOST_GIT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

/// The output of a host git that blocks this thread, killed at
/// [`HOST_GIT_TIMEOUT`]: a FIFO a sandboxed command left where git reads,
/// such as `.gitattributes`, would otherwise hold the thread forever.
pub(crate) fn host_git_output(
    command: std::process::Command,
) -> Result<std::process::Output, String> {
    agiworkforce_worktree::host_git_output_blocking(command, HOST_GIT_TIMEOUT)
        .map_err(|error| host_git_failure(&error))
}

/// [`host_git_output`] for an async caller. The child is killed when the
/// deadline passes.
pub(crate) async fn host_git_output_async(
    mut command: tokio::process::Command,
) -> Result<std::process::Output, String> {
    command.kill_on_drop(true);
    match tokio::time::timeout(HOST_GIT_TIMEOUT, command.output()).await {
        Ok(result) => result.map_err(|error| host_git_failure(&error)),
        Err(_) => Err(host_git_failure(&std::io::Error::from(
            std::io::ErrorKind::TimedOut,
        ))),
    }
}

/// The sentence to show when a host git could not start or did not finish.
pub(crate) fn host_git_failure(error: &std::io::Error) -> String {
    if error.kind() == std::io::ErrorKind::TimedOut {
        "git did not finish in time and was stopped. A file git reads in this repository may \
         be a pipe or device that never ends."
            .to_string()
    } else {
        format!("Failed to run git: {error}")
    }
}

/// How long a libgit2 read of the work tree may run before the command
/// answers without it.
const WORK_TREE_READ_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

/// Run `work`, which reads the work tree through libgit2, on a blocking
/// thread with a deadline. libgit2 reads `.gitignore` and `.gitattributes` as
/// plain files, so one a sandboxed command replaced with a FIFO blocks it
/// forever. libgit2 cannot be interrupted: on a timeout the blocked thread is
/// left behind, the known cost of answering the user instead of hanging.
pub(crate) async fn read_work_tree<T: Send + 'static>(
    what: &'static str,
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    match tokio::time::timeout(WORK_TREE_READ_TIMEOUT, spawn_blocking(work)).await {
        Ok(joined) => joined.map_err(|e| e.to_string())?,
        Err(_) => Err(format!(
            "{what} did not finish in time. A file in the repository may be a pipe or device \
             that never ends."
        )),
    }
}

/// How long a fetch may spend talking to its remote.
const REMOTE_TRANSFER_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(300);

/// How much longer the caller waits for the transfer thread to notice its
/// deadline before answering without it.
const REMOTE_TRANSFER_GRACE: std::time::Duration = std::time::Duration::from_secs(10);

const REMOTE_TIMED_OUT: &str =
    "The remote did not finish in time, so the transfer was stopped. Your files were not changed.";

/// The point after which a transfer stops. libgit2 asks the progress and
/// sideband callbacks whether to continue, and `false` aborts the transfer.
#[derive(Clone)]
struct RemoteDeadline {
    at: std::time::Instant,
    passed: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

impl RemoteDeadline {
    fn after(limit: std::time::Duration) -> Self {
        Self {
            at: std::time::Instant::now() + limit,
            passed: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
        }
    }

    fn still_open(&self) -> bool {
        if std::time::Instant::now() < self.at {
            return true;
        }
        self.passed.store(true, std::sync::atomic::Ordering::SeqCst);
        false
    }

    fn callbacks(&self) -> RemoteCallbacks<'static> {
        let mut callbacks = RemoteCallbacks::new();
        callbacks.credentials(make_git_credentials);
        let transfer = self.clone();
        callbacks.transfer_progress(move |_| transfer.still_open());
        let sideband = self.clone();
        callbacks.sideband_progress(move |_| sideband.still_open());
        callbacks
    }

    fn describe(&self, error: &git2::Error) -> String {
        if self.passed.load(std::sync::atomic::Ordering::SeqCst) {
            REMOTE_TIMED_OUT.to_string()
        } else {
            error.message().to_string()
        }
    }
}

/// Run `work`, which talks to a remote through libgit2, on a blocking thread.
/// The deadline it is handed stops a transfer that is still moving data; a
/// connection that has gone silent never reaches a callback, so the caller
/// also stops waiting shortly after the deadline. `work` must check the
/// deadline again before it changes anything local.
async fn run_remote_transfer<T: Send + 'static>(
    work: impl FnOnce(RemoteDeadline) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let deadline = RemoteDeadline::after(REMOTE_TRANSFER_TIMEOUT);
    match tokio::time::timeout(
        REMOTE_TRANSFER_TIMEOUT + REMOTE_TRANSFER_GRACE,
        spawn_blocking(move || work(deadline)),
    )
    .await
    {
        Ok(joined) => joined.map_err(|e| e.to_string())?,
        Err(_) => Err(REMOTE_TIMED_OUT.to_string()),
    }
}

/// FIX-013 (Sprint 2): every `path: String` argument crossing into a git
/// operation goes through `validate_path_security` so symlinks, `..`
/// traversal, and `/etc/passwd`-style targets fail loudly before libgit2
/// touches the disk. Returns the canonical path as a String for callers
/// that need to interpolate it into log lines.
fn validate_git_path(path: &str) -> Result<String, String> {
    let canonical = crate::sys::commands::file_ops::validate_path_security(path)?;
    Ok(canonical.to_string_lossy().to_string())
}

/// [`validate_git_path`] for a path the page names. Path sanity alone let
/// the page run git, and read or change a repository, anywhere on the disk,
/// so the path must also lie in a folder the user granted or in the open
/// project folder: the test `file_read` applies, against the same list.
async fn granted_git_path(app: &tauri::AppHandle, path: &str) -> Result<String, String> {
    let canonical = validate_git_path(path)?;
    let mut granted = crate::sys::commands::file_ops::granted_directories(app)
        .await
        .unwrap_or_default();
    if let Some(project) =
        crate::core::mcp::config::McpServersConfig::active_project_folder_from_env()
    {
        granted.push(std::fs::canonicalize(&project).unwrap_or_else(|_| PathBuf::from(project)));
    }
    if crate::sys::commands::file_ops::is_path_allowed(&canonical, &granted) {
        Ok(canonical)
    } else {
        Err(format!(
            "{path} is outside the folders you have allowed. Add its folder in Settings, Allowed Directories, or open it as the project folder."
        ))
    }
}

fn canonicalize_existing_or_new(path: &Path) -> Result<PathBuf, String> {
    let path_str = path
        .to_str()
        .ok_or_else(|| "Path contains invalid UTF-8".to_string())?;
    crate::sys::commands::file_ops::validate_path_security(path_str)
}

fn validate_git_relative_path(repo_path: &str, relative_path: &str) -> Result<String, String> {
    if relative_path.is_empty() {
        return Err("Git file path cannot be empty".to_string());
    }
    if relative_path.contains('\0') {
        return Err("Git file path contains null bytes".to_string());
    }
    if Path::new(relative_path)
        .components()
        .any(|component| component == std::path::Component::ParentDir)
    {
        return Err("Git file path contains directory traversal (..)".to_string());
    }

    let repo = Path::new(repo_path);
    let candidate = repo.join(relative_path);
    let canonical = canonicalize_existing_or_new(&candidate)?;
    let repo_canonical = PathBuf::from(repo_path);

    if !canonical.starts_with(&repo_canonical) {
        return Err(format!(
            "Git file path escapes repository: {}",
            relative_path
        ));
    }

    let relative = canonical
        .strip_prefix(&repo_canonical)
        .map_err(|_| format!("Git file path escapes repository: {}", relative_path))?;

    let normalized = relative.to_string_lossy().replace('\\', "/");
    if normalized.is_empty() {
        return Err("Git file path resolves to repository root".to_string());
    }
    Ok(normalized)
}

const MAX_COMMIT_MESSAGE_BYTES: usize = 10 * 1024;

/// FIX-013 (Sprint 2): bound commit messages and strip control characters
/// other than the standard whitespace ones (\\n, \\r, \\t). git itself is
/// tolerant of garbage, but anything that lands in our log/audit pipeline
/// should be safe to echo back.
fn sanitize_commit_message(message: &str) -> Result<String, String> {
    if message.is_empty() {
        return Err("Commit message must not be empty".to_string());
    }
    if message.len() > MAX_COMMIT_MESSAGE_BYTES {
        return Err(format!(
            "Commit message too long: {} bytes (max {MAX_COMMIT_MESSAGE_BYTES})",
            message.len()
        ));
    }
    if message.contains('\0') {
        return Err("Commit message contains null bytes".to_string());
    }
    let cleaned: String = message
        .chars()
        .filter(|c| !c.is_control() || matches!(c, '\n' | '\r' | '\t'))
        .collect();
    Ok(cleaned)
}

#[tauri::command]
pub async fn git_status(app: tauri::AppHandle, path: String) -> Result<GitStatus, String> {
    let path = granted_git_path(&app, &path).await?;
    git_status_at(path).await
}

/// [`git_status`] for a caller that has already held `path` to the folders it
/// may use: the tool executor, which applies the tool guard and its session
/// grants.
pub(crate) async fn git_status_at(path: String) -> Result<GitStatus, String> {
    tracing::info!("Getting Git status for: {}", path);
    let path = validate_git_path(&path)?;

    read_work_tree("git status", move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;

        let head = repo.head().ok();
        let branch = head
            .as_ref()
            .and_then(|h| h.shorthand().ok())
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
}

#[tauri::command]
pub async fn git_add(
    app: tauri::AppHandle,
    path: String,
    files: Vec<String>,
) -> Result<String, String> {
    let path = granted_git_path(&app, &path).await?;
    git_add_at(path, files).await
}

/// [`git_add`] for a caller that has already held `path` to the folders it
/// may use: the tool executor, which applies the tool guard and its session
/// grants.
pub(crate) async fn git_add_at(path: String, files: Vec<String>) -> Result<String, String> {
    tracing::info!("Adding {} files to staging", files.len());
    let path = validate_git_path(&path)?;

    // FIX-013 (Sprint 2): validate every entry in `files` before we hand
    // them to libgit2's index. The `.` shortcut is allowed verbatim; every
    // other entry must canonicalize cleanly.
    let mut validated_files = Vec::with_capacity(files.len());
    for file in &files {
        if file == "." {
            validated_files.push(file.clone());
        } else {
            validated_files.push(
                validate_git_relative_path(&path, file)
                    .map_err(|e| format!("git_add path '{file}' rejected: {e}"))?,
            );
        }
    }

    spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;
        let mut index = repo.index().map_err(|e| e.message().to_string())?;

        // A deleted file is staged by removing it from the index; add_path
        // and add_all both skip it, which left deletions unstageable.
        for file in &validated_files {
            if file == "." {
                index
                    .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
                    .map_err(|e| e.message().to_string())?;
                index
                    .update_all(["*"].iter(), None)
                    .map_err(|e| e.message().to_string())?;
            } else {
                let relative = Path::new(file);
                if Path::new(&path).join(relative).exists() {
                    index
                        .add_path(relative)
                        .map_err(|e| e.message().to_string())?;
                } else {
                    index
                        .remove_path(relative)
                        .map_err(|e| e.message().to_string())?;
                }
            }
        }

        index.write().map_err(|e| e.message().to_string())?;
        Ok(format!("Added {} files", validated_files.len()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_commit(
    app: tauri::AppHandle,
    path: String,
    message: String,
) -> Result<String, String> {
    let path = granted_git_path(&app, &path).await?;
    git_commit_at(path, message).await
}

/// [`git_commit`] for a caller that has already held `path` to the folders it
/// may use: the tool executor, which applies the tool guard and its session
/// grants.
pub(crate) async fn git_commit_at(path: String, message: String) -> Result<String, String> {
    let path = validate_git_path(&path)?;
    let message = sanitize_commit_message(&message)?;
    tracing::info!("Creating commit ({} bytes)", message.len());

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

pub async fn git_push(
    app: tauri::AppHandle,
    path: String,
    remote: Option<String>,
    branch: Option<String>,
    force: bool,
) -> Result<String, String> {
    let path = validate_git_path(&path)?;
    let remote_name = remote.unwrap_or_else(|| "origin".to_string());
    tracing::info!("Pushing to {}", remote_name);

    let confirmation_args = serde_json::json!({
        "path": path,
        "remote": remote_name,
        "branch": branch,
        "force": force
    });

    // Publishing to a remote cannot be taken back from here, and a force push
    // overwrites history other clones depend on, so it always asks.
    if !crate::sys::commands::tool_confirmation::request_confirmation_simple(
        &app,
        "git_push",
        &confirmation_args,
    )
    .await?
    {
        return Err("Operation denied by user".to_string());
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
    app: tauri::AppHandle,
    path: String,
    remote: Option<String>,
    branch: Option<String>,
) -> Result<String, String> {
    let path = granted_git_path(&app, &path).await?;
    let remote_name = remote.unwrap_or_else(|| "origin".to_string());
    tracing::info!("Pulling from {}", remote_name);

    run_remote_transfer(move |deadline| pull_fast_forward(&path, &remote_name, branch, &deadline))
        .await
}

fn pull_fast_forward(
    path: &str,
    remote_name: &str,
    branch: Option<String>,
    deadline: &RemoteDeadline,
) -> Result<String, String> {
    let repo = Repository::open(path).map_err(|e| e.message().to_string())?;
    let mut remote = repo
        .find_remote(remote_name)
        .map_err(|e| e.message().to_string())?;

    let branch_name = if let Some(b) = branch {
        b
    } else {
        let head = repo.head().map_err(|e| e.message().to_string())?;
        if !head.is_branch() {
            return Err("Switch to a branch before pulling.".to_string());
        }
        head.shorthand().unwrap_or("main").to_string()
    };
    let refname = format!("refs/heads/{}", branch_name);
    let mut reference = repo
        .find_reference(&refname)
        .map_err(|e| e.message().to_string())?;

    let mut fetch_opts = FetchOptions::new();
    fetch_opts.remote_callbacks(deadline.callbacks());

    remote
        .fetch(&[&branch_name], Some(&mut fetch_opts), None)
        .map_err(|e| deadline.describe(&e))?;
    if !deadline.still_open() {
        return Err(REMOTE_TIMED_OUT.to_string());
    }

    let fetch_head = repo
        .find_reference("FETCH_HEAD")
        .map_err(|e| e.message().to_string())?;
    let fetch_commit = repo
        .reference_to_annotated_commit(&fetch_head)
        .map_err(|e| e.message().to_string())?;
    let analysis = repo
        .merge_analysis(&[&fetch_commit])
        .map_err(|e| e.message().to_string())?;

    if analysis.0.is_up_to_date() {
        return Ok("Already up to date".to_string());
    }
    if !analysis.0.is_fast_forward() {
        return Err(format!(
            "'{branch_name}' has commits that {remote_name} does not, so this pull needs a merge. Nothing was changed."
        ));
    }

    // The work tree moves first and only where it cannot overwrite an
    // uncommitted edit; the branch follows once that has succeeded.
    let target = repo
        .find_object(fetch_commit.id(), None)
        .map_err(|e| e.message().to_string())?;
    repo.checkout_tree(&target, Some(git2::build::CheckoutBuilder::new().safe()))
        .map_err(|e| {
            format!(
                "Pull stopped before changing any file, because it would overwrite uncommitted changes: {}",
                e.message()
            )
        })?;
    reference
        .set_target(fetch_commit.id(), "Fast-Forward")
        .map_err(|e| e.message().to_string())?;
    repo.set_head(&refname)
        .map_err(|e| e.message().to_string())?;

    Ok("Pull successful".to_string())
}

#[tauri::command]
pub async fn git_checkout(
    app: tauri::AppHandle,
    path: String,
    branch_name: String,
) -> Result<String, String> {
    let path = granted_git_path(&app, &path).await?;
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
pub async fn git_checkout_new_branch(
    app: tauri::AppHandle,
    path: String,
    branch_name: String,
) -> Result<String, String> {
    let path = granted_git_path(&app, &path).await?;
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
pub async fn git_list_branches(
    app: tauri::AppHandle,
    path: String,
) -> Result<Vec<GitBranch>, String> {
    let path = granted_git_path(&app, &path).await?;
    git_list_branches_at(path).await
}

/// [`git_list_branches`] for a caller that has already held `path` to the folders it
/// may use: the tool executor, which applies the tool guard and its session
/// grants.
pub(crate) async fn git_list_branches_at(path: String) -> Result<Vec<GitBranch>, String> {
    let path = validate_git_path(&path)?;
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
            .and_then(|h| h.shorthand().ok().map(|s| s.to_string()));

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
) -> Result<String, String> {
    let path = granted_git_path(&app, &path).await?;
    tracing::info!("Deleting branch: {}", branch_name);

    // AUDIT-FIX: Enforce user confirmation for branch deletion
    let confirmation_args = serde_json::json!({
        "path": path,
        "branch_name": branch_name
    });

    if !crate::sys::commands::tool_confirmation::request_confirmation_simple(
        &app,
        "git_delete_branch",
        &confirmation_args,
    )
    .await?
    {
        return Err("Operation denied by user".to_string());
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

pub async fn git_log(path: String, limit: Option<usize>) -> Result<Vec<GitCommit>, String> {
    let path = validate_git_path(&path)?;
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
    app: tauri::AppHandle,
    path: String,
    file_path: Option<String>,
    staged: bool,
) -> Result<Vec<GitDiff>, String> {
    let path = granted_git_path(&app, &path).await?;
    git_diff_at(path, file_path, staged).await
}

/// [`git_diff`] for a caller that has already held `path` to the folders it
/// may use: the tool executor, which applies the tool guard and its session
/// grants.
pub(crate) async fn git_diff_at(
    path: String,
    file_path: Option<String>,
    staged: bool,
) -> Result<Vec<GitDiff>, String> {
    let path = validate_git_path(&path)?;
    let file_path = file_path
        .as_deref()
        .map(|pathspec| validate_git_relative_path(&path, pathspec))
        .transpose()?;
    tracing::info!("Getting diff{}", if staged { " (staged)" } else { "" });

    read_work_tree("git diff", move || {
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
}

pub async fn git_clone(url: String, destination: String) -> Result<String, String> {
    let destination = validate_git_path(&destination)?;
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
pub async fn git_fetch(
    app: tauri::AppHandle,
    path: String,
    remote: Option<String>,
) -> Result<String, String> {
    let path = granted_git_path(&app, &path).await?;
    let remote_name = remote.unwrap_or_else(|| "origin".to_string());
    tracing::info!("Fetching from: {}", remote_name);

    run_remote_transfer(move |deadline| {
        let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;
        let mut remote = repo
            .find_remote(&remote_name)
            .map_err(|e| e.message().to_string())?;

        let mut fetch_opts = FetchOptions::new();
        fetch_opts.remote_callbacks(deadline.callbacks());

        remote
            .fetch(&[] as &[&str], Some(&mut fetch_opts), None)
            .map(|_| "Fetch successful".to_string())
            .map_err(|e| deadline.describe(&e))
    })
    .await
}

#[tauri::command]
pub async fn git_reset(
    app: tauri::AppHandle,
    path: String,
    commit: String,
    mode: String,
    files: Option<Vec<String>>,
) -> Result<String, String> {
    let path = granted_git_path(&app, &path).await?;
    tracing::info!("Resetting to {} ({})", commit, mode);

    // If files specified, reset only those files (git reset HEAD -- <files>)
    if let Some(ref file_list) = files {
        if !file_list.is_empty() {
            tracing::info!("Resetting {} specific files", file_list.len());

            let path_clone = path.clone();
            let file_list_clone = file_list
                .iter()
                .map(|file| validate_git_relative_path(&path, file))
                .collect::<Result<Vec<_>, _>>()?;
            return spawn_blocking(move || {
                agiworkforce_worktree::config_guard::check_repository_config_blocking(
                    Path::new(&path_clone),
                    agiworkforce_worktree::config_guard::ConfigUse::CONTENT,
                    false,
                )
                .map_err(desktop_git_error)?;
                let mut cmd = agiworkforce_worktree::host_git();
                cmd.current_dir(&path_clone)
                    .arg("reset")
                    .arg("--no-recurse-submodules")
                    .arg("HEAD")
                    .arg("--");
                for f in &file_list_clone {
                    cmd.arg(f);
                }
                let output = host_git_output(cmd)?;
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

    let confirmation_args = serde_json::json!({
        "path": path,
        "commit": commit,
        "mode": mode
    });

    if (mode == "hard"
        || crate::sys::security::command_validator::requires_confirmation(&format!(
            "git reset --{mode}"
        )))
        && !crate::sys::commands::tool_confirmation::request_confirmation_simple(
            &app,
            "git_reset",
            &confirmation_args,
        )
        .await?
    {
        return Err("Operation denied by user".to_string());
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

/// Discards working-tree changes to `files`. The Changes panel asks first,
/// naming the files whose changes are lost, so this command does not raise a
/// second, generic question. The agent's git tools confirm on their own path.
#[tauri::command]
pub async fn git_checkout_files(
    app: tauri::AppHandle,
    path: String,
    files: Vec<String>,
) -> Result<String, String> {
    let path = granted_git_path(&app, &path).await?;
    tracing::info!("Checking out {} files to discard changes", files.len());

    if files.is_empty() {
        return Err("No files specified".to_string());
    }

    let files_clone = files
        .iter()
        .map(|file| validate_git_relative_path(&path, file))
        .collect::<Result<Vec<_>, _>>()?;
    spawn_blocking(move || {
        agiworkforce_worktree::config_guard::check_repository_config_blocking(
            Path::new(&path),
            agiworkforce_worktree::config_guard::ConfigUse::CONTENT,
            false,
        )
        .map_err(desktop_git_error)?;
        let mut cmd = agiworkforce_worktree::host_git();
        cmd.current_dir(&path)
            .arg("checkout")
            .arg("--no-recurse-submodules")
            .arg("--");
        for f in &files_clone {
            cmd.arg(f);
        }
        let output = host_git_output(cmd)?;
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

static GIT_TRUST_DECISIONS: crate::sys::native_confirm::ConfirmGate =
    crate::sys::native_confirm::ConfirmGate::new();

const TRUST_GIT_SETTINGS_LABEL: &str = "Trust Settings";

/// The question asked before a repository's code-running git settings are
/// trusted. Each one is shown with its value and the file that sets it, so
/// the answer is to what will run and not to a count. A list the dialog
/// could not show whole is refused rather than shortened.
fn git_trust_question(
    top: &Path,
    entries: &[agiworkforce_worktree::config_guard::ConfigEntry],
) -> Result<crate::sys::native_confirm::NativeConfirm, String> {
    use crate::sys::native_confirm::shown_value;

    let settings = entries
        .iter()
        .map(|entry| {
            format!(
                "{} = {}\n   set in {}",
                shown_value(&entry.key),
                shown_value(&entry.value),
                shown_value(&entry.origin)
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let body = format!(
        "In {}:\n\n{settings}\n\nEach of these names a program that git runs outside the sandbox whenever the app uses git in this folder. Anyone who can change these files can change what runs.",
        shown_value(&top.to_string_lossy())
    );
    if crate::sys::native_confirm::check_it_fits(&body).is_err() {
        return Err(
            "This repository's git settings that run programs are too many or too long to show in one dialog, so none was trusted. Remove the ones you do not need and try again."
                .to_string(),
        );
    }
    Ok(crate::sys::native_confirm::NativeConfirm {
        title: "Trust these git settings?".to_string(),
        body,
        confirm_label: TRUST_GIT_SETTINGS_LABEL.to_string(),
    })
}

/// The user's word that the git settings of the repository at `project_path`
/// are trusted as they are now: record them as its baseline, with the flag
/// that marks them trusted, which host git then obeys, and return them.
///
/// The settings are listed to the user in a native dialog first, each with
/// its value, and are trusted only when the answer there is yes and they
/// are still exactly the ones listed. The page renders model output and can
/// call this command itself, so a confirmation it draws is not the one that
/// counts. A repository with no such setting has nothing to ask about.
/// Until then the desktop trusts no repository's own settings, so the first
/// baseline it takes blesses nothing, and a setting added or changed
/// afterwards is refused until the user trusts again. See
/// [`agiworkforce_worktree::config_guard`].
#[tauri::command]
pub async fn git_trust_repository_config(
    app: tauri::AppHandle,
    project_path: String,
) -> Result<Vec<agiworkforce_worktree::config_guard::ConfigEntry>, String> {
    use agiworkforce_worktree::config_guard;

    let path = granted_git_path(&app, &project_path).await?;
    let runner = agiworkforce_worktree::TokioCommandRunner;
    let workspace =
        agiworkforce_worktree::checkpoint::Workspace::discover(&runner, Path::new(&path))
            .await
            .map_err(|error| error.to_string())?
            .ok_or_else(|| format!("{path} is not inside a git repository with a working tree"))?;
    let entries = config_guard::repository_config_to_trust(&runner, &workspace)
        .await
        .map_err(|error| error.to_string())?;
    if !entries.is_empty() {
        let question = git_trust_question(workspace.top(), &entries)?;
        let request = format!("git_trust:{}", question.body);
        match GIT_TRUST_DECISIONS.confirm(&app, &request, question).await {
            Ok(true) => {}
            Ok(false) => {
                return Err(
                    "The git settings were not trusted: trusting them was not confirmed."
                        .to_string(),
                )
            }
            Err(not_asked) => return Err(not_asked.message()),
        }
    }
    config_guard::trust_repository_config_as_shown(&runner, &workspace, &entries)
        .await
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod git_trust_tests {
    use super::*;
    use agiworkforce_worktree::config_guard::ConfigEntry;

    fn entry(key: &str, value: &str) -> ConfigEntry {
        ConfigEntry {
            key: key.to_string(),
            value: value.to_string(),
            origin: "/Users/someone/code/app/.git/config".to_string(),
        }
    }

    #[test]
    fn every_setting_is_shown_with_its_value_and_where_it_is_set() {
        let question = git_trust_question(
            Path::new("/Users/someone/code/app"),
            &[
                entry("filter.lfs.smudge", "git-lfs smudge -- %f"),
                entry("core.sshcommand", "ssh -i key\nTrust nothing else"),
            ],
        )
        .expect("a question");

        assert!(question.body.starts_with("In /Users/someone/code/app:"));
        assert!(
            question
                .body
                .contains("filter.lfs.smudge = git-lfs smudge -- %f\n   set in /Users/someone/code/app/.git/config"),
            "{}",
            question.body
        );
        assert!(question.body.contains("core.sshcommand = "));
        assert!(
            !question.body.contains("key\nTrust nothing else"),
            "a line break in a value is marked, not drawn"
        );
        assert!(question.body.contains("outside the sandbox"));
        assert_eq!(question.confirm_label, TRUST_GIT_SETTINGS_LABEL);
        assert!(crate::sys::native_confirm::can_ask_with(
            &question.confirm_label
        ));
    }

    #[test]
    fn a_list_the_dialog_cannot_show_whole_is_refused() {
        let many: Vec<ConfigEntry> = (0..30)
            .map(|index| entry(&format!("filter.f{index}.clean"), "run-me"))
            .collect();
        let refused = git_trust_question(Path::new("/Users/someone/code/app"), &many)
            .expect_err("too many rows");
        assert!(refused.contains("none was trusted"), "{refused}");

        let long = entry("core.sshcommand", &"x".repeat(4000));
        assert!(git_trust_question(Path::new("/Users/someone/code/app"), &[long]).is_err());
    }

    /// Nothing is recorded as trusted before the native answer, and what is
    /// recorded is held to what was listed.
    #[test]
    fn the_settings_are_listed_and_confirmed_natively_before_they_are_trusted() {
        let shipped = include_str!("git.rs")
            .split("pub async fn git_trust_repository_config(")
            .nth(1)
            .expect("git_trust_repository_config");
        let body = shipped.split("\n}\n").next().unwrap_or(shipped);

        let listed = body
            .find("repository_config_to_trust(")
            .expect("the settings are read first");
        let asked = body
            .find("GIT_TRUST_DECISIONS")
            .expect("the native question");
        let trusted = body
            .find("trust_repository_config_as_shown(")
            .expect("only what was shown is trusted");
        assert!(listed < asked && asked < trusted);
        assert!(!body.contains("config_guard::trust_repository_config("));
    }
}

#[cfg(test)]
mod security_tests {
    use super::{validate_git_path, validate_git_relative_path};
    use std::fs;
    use tempfile::tempdir;

    /// A destructive verb is a command, not a shell string, so the
    /// execpolicy substring list never saw it: `requires_confirmation("git push")`
    /// returned false and the push ran unasked.
    #[test]
    fn destructive_git_commands_confirm_unconditionally_before_acting() {
        const SOURCE: &str = include_str!("git.rs");
        let shipped = SOURCE.split("#[cfg(test)]").next().expect("shipped source");
        for command in ["pub async fn git_push(", "pub async fn git_delete_branch("] {
            let body = shipped.split(command).nth(1).expect(command);
            let body = body.split("#[tauri::command]").next().unwrap_or(body);
            let confirm = body
                .find("request_confirmation_simple(")
                .unwrap_or_else(|| panic!("{command} must ask before it acts"));
            let act = body
                .find("spawn_blocking(")
                .unwrap_or_else(|| panic!("{command} acts in spawn_blocking"));
            assert!(confirm < act, "{command} must ask before it acts");
            assert!(
                !body[..confirm].contains("requires_confirmation("),
                "{command} must not let a shell-string heuristic skip the question"
            );
        }

        let reset = shipped
            .split("pub async fn git_reset(")
            .nth(1)
            .expect("git_reset");
        let reset = reset.split("#[tauri::command]").next().unwrap_or(reset);
        assert!(
            reset.contains("mode == \"hard\""),
            "a hard reset must always ask"
        );
    }

    /// Path sanity alone let the page run git in any repository on the
    /// disk. Every command is held to the granted folders; only the
    /// functions Rust calls itself still take a path on sanity alone.
    #[test]
    fn every_git_command_is_held_to_the_granted_folders() {
        const SOURCE: &str = include_str!("git.rs");
        let shipped = SOURCE.split("#[cfg(test)]").next().expect("shipped source");
        let commands: Vec<&str> = shipped.split("#[tauri::command]").skip(1).collect();

        assert_eq!(commands.len(), 13, "a new git command needs the gate too");
        for command in &commands {
            let body = command.split("\n}\n").next().unwrap_or(command);
            assert!(
                body.contains("granted_git_path(&app, "),
                "not held to the granted folders: {}",
                body.lines()
                    .find(|line| line.contains("fn "))
                    .unwrap_or(body)
            );
            assert!(!body.contains("validate_git_path("));
        }
        assert_eq!(
            shipped.matches("= validate_git_path(").count(),
            9,
            "the gate itself, and the eight functions only Rust calls: git_log, git_clone, \
             git_push and the five the tool executor reaches after its own folder check"
        );
    }

    #[test]
    fn git_relative_paths_must_stay_inside_repo() {
        let repo_dir = tempdir().unwrap();
        let repo = validate_git_path(repo_dir.path().to_str().unwrap()).unwrap();

        fs::write(repo_dir.path().join("tracked.txt"), "ok").unwrap();
        assert_eq!(
            validate_git_relative_path(&repo, "tracked.txt").unwrap(),
            "tracked.txt"
        );

        let inside_absolute = repo_dir.path().join("tracked.txt");
        assert_eq!(
            validate_git_relative_path(&repo, inside_absolute.to_str().unwrap()).unwrap(),
            "tracked.txt"
        );

        let traversal = validate_git_relative_path(&repo, "../outside.txt").unwrap_err();
        assert!(traversal.contains("directory traversal"));
    }

    #[test]
    fn absolute_git_paths_must_stay_inside_repo() {
        let repo_dir = tempdir().unwrap();
        let outside_dir = tempdir().unwrap();
        let repo = validate_git_path(repo_dir.path().to_str().unwrap()).unwrap();
        let outside_file = outside_dir.path().join("outside.txt");
        fs::write(&outside_file, "outside").unwrap();
        let escaped =
            validate_git_relative_path(&repo, outside_file.to_str().unwrap()).unwrap_err();
        assert!(escaped.contains("escapes repository"));

        #[cfg(unix)]
        {
            let link = repo_dir.path().join("linked.txt");
            std::os::unix::fs::symlink(&outside_file, &link).unwrap();
            let escaped = validate_git_relative_path(&repo, "linked.txt").unwrap_err();
            assert!(escaped.contains("escapes repository"));
        }
    }
}

#[cfg(test)]
mod remote_tests {
    use super::{pull_fast_forward, RemoteDeadline, REMOTE_TIMED_OUT};
    use git2::{Oid, Repository, RepositoryState, Signature};
    use std::fs;
    use std::path::Path;
    use std::time::Duration;
    use tempfile::{tempdir, TempDir};

    fn commit_file(repo: &Repository, name: &str, content: &str) -> Oid {
        let work_tree = repo.workdir().expect("a work tree");
        fs::write(work_tree.join(name), content).unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new(name)).unwrap();
        index.write().unwrap();
        let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
        let author = Signature::now("Test User", "test@example.com").unwrap();
        let parents: Vec<git2::Commit<'_>> = repo
            .head()
            .ok()
            .and_then(|head| head.peel_to_commit().ok())
            .into_iter()
            .collect();
        let parents: Vec<&git2::Commit<'_>> = parents.iter().collect();
        repo.commit(Some("HEAD"), &author, &author, name, &tree, &parents)
            .unwrap()
    }

    fn head_of(repo: &Repository) -> Oid {
        repo.head().unwrap().target().expect("a commit")
    }

    fn open_deadline() -> RemoteDeadline {
        RemoteDeadline::after(Duration::from_secs(60))
    }

    /// An origin with `shared.txt` and `other.txt`, a clone of it, and then
    /// one more commit to `shared.txt` on the origin that the clone lacks.
    fn origin_one_commit_ahead_of_its_clone() -> (TempDir, Repository, Repository, Oid) {
        let root = tempdir().unwrap();
        let origin_path = root.path().join("origin");
        fs::create_dir_all(&origin_path).unwrap();
        let origin = Repository::init(&origin_path).unwrap();
        commit_file(&origin, "shared.txt", "one");
        commit_file(&origin, "other.txt", "base");

        let clone_path = root.path().join("clone");
        let clone = Repository::clone(origin_path.to_str().unwrap(), &clone_path).unwrap();

        let ahead = commit_file(&origin, "shared.txt", "two");
        (root, origin, clone, ahead)
    }

    fn pull(clone: &Repository) -> Result<String, String> {
        let path = clone.workdir().unwrap().to_str().unwrap().to_string();
        pull_fast_forward(&path, "origin", None, &open_deadline())
    }

    #[test]
    fn a_fast_forward_keeps_uncommitted_edits_in_files_it_does_not_touch() {
        let (_root, _origin, clone, ahead) = origin_one_commit_ahead_of_its_clone();
        let work_tree = clone.workdir().unwrap().to_path_buf();
        fs::write(work_tree.join("other.txt"), "local edit").unwrap();

        pull(&clone).expect("a fast-forward that touches no edited file succeeds");

        assert_eq!(head_of(&clone), ahead);
        assert_eq!(
            fs::read_to_string(work_tree.join("shared.txt")).unwrap(),
            "two"
        );
        assert_eq!(
            fs::read_to_string(work_tree.join("other.txt")).unwrap(),
            "local edit"
        );
    }

    #[test]
    fn a_diverged_branch_is_refused_and_no_merge_is_left_open() {
        let (_root, _origin, clone, _ahead) = origin_one_commit_ahead_of_its_clone();
        let local = commit_file(&clone, "local.txt", "local commit");
        let work_tree = clone.workdir().unwrap().to_path_buf();

        let refusal = pull(&clone).expect_err("a pull that needs a merge is refused");

        assert!(refusal.contains("needs a merge"), "{refusal}");
        assert!(refusal.contains("Nothing was changed"), "{refusal}");
        assert_eq!(head_of(&clone), local);
        assert!(!clone.path().join("MERGE_HEAD").exists());
        assert_eq!(clone.state(), RepositoryState::Clean);
        assert_eq!(
            fs::read_to_string(work_tree.join("shared.txt")).unwrap(),
            "one"
        );
    }

    #[test]
    fn an_uncommitted_edit_the_pull_would_overwrite_is_refused_and_kept() {
        let (_root, _origin, clone, _ahead) = origin_one_commit_ahead_of_its_clone();
        let before = head_of(&clone);
        let work_tree = clone.workdir().unwrap().to_path_buf();
        fs::write(work_tree.join("shared.txt"), "mine").unwrap();

        let refusal = pull(&clone).expect_err("a pull over an edited file is refused");

        assert!(refusal.contains("uncommitted changes"), "{refusal}");
        assert_eq!(head_of(&clone), before);
        assert_eq!(
            fs::read_to_string(work_tree.join("shared.txt")).unwrap(),
            "mine"
        );
    }

    #[test]
    fn a_pull_whose_deadline_passed_stops_before_the_work_tree() {
        let (_root, _origin, clone, _ahead) = origin_one_commit_ahead_of_its_clone();
        let before = head_of(&clone);
        let path = clone.workdir().unwrap().to_str().unwrap().to_string();

        let refusal = pull_fast_forward(
            &path,
            "origin",
            None,
            &RemoteDeadline::after(Duration::ZERO),
        )
        .expect_err("a transfer past its deadline is stopped");

        assert_eq!(refusal, REMOTE_TIMED_OUT);
        assert_eq!(head_of(&clone), before);
        assert_eq!(
            fs::read_to_string(clone.workdir().unwrap().join("shared.txt")).unwrap(),
            "one"
        );
    }

    #[test]
    fn a_passed_deadline_stops_the_transfer_and_names_the_reason() {
        let open = open_deadline();
        assert!(open.still_open());
        assert_eq!(open.describe(&git2::Error::from_str("refused")), "refused");

        let passed = RemoteDeadline::after(Duration::ZERO);
        assert!(!passed.still_open());
        assert_eq!(
            passed.describe(&git2::Error::from_str("user cancelled")),
            REMOTE_TIMED_OUT
        );
    }
}
