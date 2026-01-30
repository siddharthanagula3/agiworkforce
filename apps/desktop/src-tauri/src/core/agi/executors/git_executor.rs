//! Git operations executor.
//!
//! Handles Git version control operations including status, init, add, commit,
//! push, and clone operations. All operations include security validations
//! to prevent path traversal attacks.
//!
//! # Tools
//!
//! - `git_status` - Get repository status (branch, staged, modified, untracked files)
//! - `git_init` - Initialize a new git repository
//! - `git_add` - Stage files for commit
//! - `git_commit` - Create a commit with staged changes
//! - `git_push` - Push commits to a remote repository
//! - `git_clone` - Clone a remote repository
//!
//! # Security
//!
//! All path operations are validated against allowed directories to prevent
//! path traversal attacks. SSH and HTTPS authentication is supported for
//! remote operations.

use super::{ExecutorContext, ToolExecutor};
use crate::core::agi::ExecutionContext;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Executor for Git version control operations.
///
/// Provides a safe interface to common Git operations with path validation
/// and authentication support.
pub struct GitExecutor;

impl GitExecutor {
    /// Create a new Git executor.
    pub fn new() -> Self {
        Self
    }

    /// Validate a path is within allowed directories.
    ///
    /// Returns the canonical path if valid.
    pub(crate) fn validate_path(
        path: &Path,
        context: &ExecutorContext,
        operation: &str,
    ) -> Result<PathBuf> {
        let canonical_path = std::fs::canonicalize(path)
            .map_err(|e| anyhow!("Invalid or inaccessible path '{}': {}", path.display(), e))?;

        let allowed_directories = context.get_allowed_directories();
        let path_allowed = if allowed_directories.is_empty() {
            tracing::warn!(
                "[GitExecutor] No allowed_directories configured - {} access unrestricted. \
                Consider configuring allowed directories for security.",
                operation
            );
            true
        } else {
            allowed_directories
                .iter()
                .any(|allowed_dir| canonical_path.starts_with(allowed_dir))
        };

        if !path_allowed {
            tracing::error!(
                "[GitExecutor] Path traversal attempt blocked for {}: '{}' is outside allowed directories",
                operation,
                canonical_path.display()
            );
            return Err(anyhow!(
                "Access denied: path '{}' is outside allowed directories",
                path.display()
            ));
        }

        Ok(canonical_path)
    }

    /// Validate a path that may not exist yet (for git_init).
    ///
    /// If the path exists, validates it directly. If not, validates the parent.
    fn validate_new_path(
        path: &Path,
        context: &ExecutorContext,
        operation: &str,
    ) -> Result<PathBuf> {
        if path.exists() {
            return Self::validate_path(path, context, operation);
        }

        // Directory doesn't exist - validate parent directory
        let parent = path
            .parent()
            .ok_or_else(|| anyhow!("Invalid path: no parent directory"))?;

        if !parent.exists() {
            return Err(anyhow!(
                "Parent directory does not exist: {}",
                parent.display()
            ));
        }

        let canonical_parent = std::fs::canonicalize(parent)
            .map_err(|e| anyhow!("Invalid parent directory '{}': {}", parent.display(), e))?;

        let allowed_directories = context.get_allowed_directories();
        let path_allowed = if allowed_directories.is_empty() {
            tracing::warn!(
                "[GitExecutor] No allowed_directories configured - {} access unrestricted.",
                operation
            );
            true
        } else {
            allowed_directories
                .iter()
                .any(|allowed_dir| canonical_parent.starts_with(allowed_dir))
        };

        if !path_allowed {
            tracing::error!(
                "[GitExecutor] Path traversal attempt blocked for {}: parent '{}' is outside allowed directories",
                operation,
                canonical_parent.display()
            );
            return Err(anyhow!(
                "Access denied: path '{}' is outside allowed directories",
                path.display()
            ));
        }

        Ok(canonical_parent.join(
            path.file_name()
                .ok_or_else(|| anyhow!("Invalid directory name"))?,
        ))
    }

    /// Get credentials for git authentication.
    ///
    /// Tries multiple authentication methods in order:
    /// 1. SSH agent
    /// 2. SSH key files (ed25519, then RSA)
    /// 3. Git credential helper
    fn get_credentials(
        url: &str,
        username_from_url: Option<&str>,
        allowed_types: git2::CredentialType,
    ) -> Result<git2::Cred, git2::Error> {
        // Try SSH agent authentication first
        if allowed_types.contains(git2::CredentialType::SSH_KEY) {
            if let Some(username) = username_from_url {
                // Try SSH agent
                if let Ok(cred) = git2::Cred::ssh_key_from_agent(username) {
                    return Ok(cred);
                }

                // Try default SSH key locations
                if let Some(home) = dirs::home_dir() {
                    let id_ed25519 = home.join(".ssh").join("id_ed25519");
                    let id_rsa = home.join(".ssh").join("id_rsa");

                    // Try ed25519 first (more modern)
                    if id_ed25519.exists() {
                        if let Ok(cred) = git2::Cred::ssh_key(username, None, &id_ed25519, None) {
                            return Ok(cred);
                        }
                    }

                    // Fall back to RSA
                    if id_rsa.exists() {
                        if let Ok(cred) = git2::Cred::ssh_key(username, None, &id_rsa, None) {
                            return Ok(cred);
                        }
                    }
                }
            }
        }

        // Try default credentials (git credential helper)
        if allowed_types.contains(git2::CredentialType::USER_PASS_PLAINTEXT) {
            if let Ok(cred) = git2::Cred::default() {
                return Ok(cred);
            }
        }

        // Try credential helper via git config
        if allowed_types.contains(git2::CredentialType::USER_PASS_PLAINTEXT) {
            return git2::Cred::credential_helper(
                &git2::Config::open_default().unwrap_or_else(|_| git2::Config::new().unwrap()),
                url,
                username_from_url,
            );
        }

        Err(git2::Error::from_str(
            "No valid credentials found. Ensure SSH agent is running or git credentials are configured.",
        ))
    }

    /// Execute git_status operation.
    ///
    /// Returns the status of a git repository including:
    /// - Current branch name (or detached HEAD info)
    /// - List of staged files
    /// - List of modified files (unstaged)
    /// - List of untracked files
    /// - Whether the working directory is clean
    async fn execute_status(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let path = parameters
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing 'path' parameter"))?;

        let canonical_path = Self::validate_path(Path::new(path), context, "git_status")?;

        // Open the git repository
        let repo = git2::Repository::open(&canonical_path).map_err(|e| {
            anyhow!(
                "Failed to open git repository at '{}': {}",
                canonical_path.display(),
                e
            )
        })?;

        // Get current branch name
        let branch = match repo.head() {
            Ok(head) => {
                if head.is_branch() {
                    head.shorthand().map(|s| s.to_string())
                } else {
                    // Detached HEAD - show commit hash
                    head.target()
                        .map(|oid| format!("HEAD detached at {}", &oid.to_string()[..7]))
                }
            }
            Err(_) => None,
        }
        .unwrap_or_else(|| "unknown".to_string());

        // Get repository status
        let statuses = repo
            .statuses(None)
            .map_err(|e| anyhow!("Failed to get repository status: {}", e))?;

        let mut staged: Vec<String> = Vec::new();
        let mut modified: Vec<String> = Vec::new();
        let mut untracked: Vec<String> = Vec::new();

        for entry in statuses.iter() {
            let path_str = entry.path().unwrap_or("unknown").to_string();
            let status = entry.status();

            // Check for staged changes (index changes)
            if status.is_index_new()
                || status.is_index_modified()
                || status.is_index_deleted()
                || status.is_index_renamed()
                || status.is_index_typechange()
            {
                staged.push(path_str.clone());
            }

            // Check for working directory modifications (unstaged)
            if status.is_wt_modified()
                || status.is_wt_deleted()
                || status.is_wt_renamed()
                || status.is_wt_typechange()
            {
                modified.push(path_str.clone());
            }

            // Check for untracked files
            if status.is_wt_new() {
                untracked.push(path_str);
            }
        }

        let clean = staged.is_empty() && modified.is_empty() && untracked.is_empty();

        tracing::info!(
            "[GitExecutor] git_status completed for '{}': branch={}, staged={}, modified={}, untracked={}, clean={}",
            canonical_path.display(),
            branch,
            staged.len(),
            modified.len(),
            untracked.len(),
            clean
        );

        Ok(json!({
            "success": true,
            "path": canonical_path.to_string_lossy(),
            "branch": branch,
            "staged": staged,
            "modified": modified,
            "untracked": untracked,
            "clean": clean
        }))
    }

    /// Execute git_init operation.
    ///
    /// Initializes a new git repository at the specified path.
    /// Creates the directory if it doesn't exist.
    async fn execute_init(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let path = parameters
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing 'path' parameter"))?;

        let canonical_path = Self::validate_new_path(Path::new(path), context, "git_init")?;

        // Create the directory if it doesn't exist
        if !canonical_path.exists() {
            std::fs::create_dir_all(&canonical_path).map_err(|e| {
                anyhow!(
                    "Failed to create directory '{}': {}",
                    canonical_path.display(),
                    e
                )
            })?;
        }

        // Initialize the git repository
        let repo = git2::Repository::init(&canonical_path).map_err(|e| {
            anyhow!(
                "Failed to initialize git repository at '{}': {}",
                canonical_path.display(),
                e
            )
        })?;

        let git_dir = repo.path().to_string_lossy().to_string();

        tracing::info!(
            "[GitExecutor] git_init completed: initialized repository at '{}'",
            canonical_path.display()
        );

        Ok(json!({
            "success": true,
            "path": canonical_path.to_string_lossy(),
            "git_dir": git_dir,
            "message": format!("Initialized empty Git repository in {}", canonical_path.display())
        }))
    }

    /// Execute git_add operation.
    ///
    /// Adds files to the git staging area. Supports:
    /// - Specific file paths
    /// - "." or "*" to add all files
    async fn execute_add(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let path = parameters
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing 'path' parameter"))?;
        let files = parameters
            .get("files")
            .and_then(|v| v.as_array())
            .ok_or_else(|| anyhow!("Missing 'files' parameter"))?;

        let canonical_path = Self::validate_path(Path::new(path), context, "git_add")?;

        let repo = git2::Repository::open(&canonical_path).map_err(|e| {
            anyhow!(
                "Failed to open git repository at '{}': {}",
                canonical_path.display(),
                e
            )
        })?;

        let mut index = repo
            .index()
            .map_err(|e| anyhow!("Failed to get repository index: {}", e))?;

        // Collect file paths to add
        let file_paths: Vec<String> = files
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();

        if file_paths.is_empty() {
            return Err(anyhow!("No valid file paths provided in 'files' array"));
        }

        let mut files_added: Vec<String> = Vec::new();

        // Check if adding all files (e.g., ["."] or ["*"])
        let add_all = file_paths.len() == 1 && (file_paths[0] == "." || file_paths[0] == "*");

        if add_all {
            // Add all files using glob pattern
            index
                .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
                .map_err(|e| anyhow!("Failed to add all files to index: {}", e))?;

            // Get list of files that were staged
            for entry in index.iter() {
                if let Ok(path_str) = std::str::from_utf8(&entry.path) {
                    files_added.push(path_str.to_string());
                }
            }

            tracing::info!(
                "[GitExecutor] git_add: Added all files ({} total) to staging area in '{}'",
                files_added.len(),
                canonical_path.display()
            );
        } else {
            // Add specific files
            for file_path in &file_paths {
                // SECURITY: Ensure the file path doesn't escape the repository
                let full_path = canonical_path.join(file_path);
                let canonical_file_path = match std::fs::canonicalize(&full_path) {
                    Ok(p) => p,
                    Err(_) => {
                        // File might not exist yet (new file), check parent
                        let parent = full_path.parent();
                        if let Some(p) = parent {
                            if let Ok(canonical_parent) = std::fs::canonicalize(p) {
                                if !canonical_parent.starts_with(&canonical_path) {
                                    tracing::error!(
                                        "[GitExecutor] git_add: File path '{}' escapes repository",
                                        file_path
                                    );
                                    return Err(anyhow!(
                                        "File path '{}' is outside the repository",
                                        file_path
                                    ));
                                }
                            }
                        }
                        full_path.clone()
                    }
                };

                // Ensure file is within repository
                if canonical_file_path != full_path
                    && !canonical_file_path.starts_with(&canonical_path)
                {
                    tracing::error!(
                        "[GitExecutor] git_add: File path '{}' escapes repository",
                        file_path
                    );
                    return Err(anyhow!(
                        "File path '{}' is outside the repository",
                        file_path
                    ));
                }

                // Add the file to the index
                index
                    .add_path(Path::new(file_path))
                    .map_err(|e| anyhow!("Failed to add '{}' to index: {}", file_path, e))?;

                files_added.push(file_path.clone());
            }

            tracing::info!(
                "[GitExecutor] git_add: Added {} files to staging area in '{}'",
                files_added.len(),
                canonical_path.display()
            );
        }

        // Write the index to disk
        index
            .write()
            .map_err(|e| anyhow!("Failed to write index: {}", e))?;

        Ok(json!({
            "success": true,
            "repository_path": canonical_path.to_string_lossy(),
            "files_added": files_added,
            "files_count": files_added.len()
        }))
    }

    /// Execute git_commit operation.
    ///
    /// Creates a new commit with the staged changes. Uses the configured
    /// git user or falls back to "AGI Workforce" as author/committer.
    async fn execute_commit(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
        session_id: &str,
    ) -> Result<Value> {
        let path = parameters
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing 'path' parameter"))?;
        let message = parameters
            .get("message")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing 'message' parameter"))?;

        let canonical_path = Self::validate_path(Path::new(path), context, "git_commit")?;

        // Perform all git operations in a synchronous closure to avoid Send issues
        // git2 types are not Send, so we extract simple Send-able results
        // Returns Option<(commit_hash, author_string)> - None means no changes to commit
        let git_result: Result<Option<(String, String)>, anyhow::Error> = (|| {
            let repo = git2::Repository::open(&canonical_path).map_err(|e| {
                anyhow!(
                    "Failed to open git repository at '{}': {}",
                    canonical_path.display(),
                    e
                )
            })?;

            // Get the index
            let mut index = repo
                .index()
                .map_err(|e| anyhow!("Failed to get repository index: {}", e))?;

            // Check if there are staged changes
            let tree_id = index
                .write_tree()
                .map_err(|e| anyhow!("Failed to write tree from index: {}", e))?;

            let tree = repo
                .find_tree(tree_id)
                .map_err(|e| anyhow!("Failed to find tree: {}", e))?;

            // Get the signature (author/committer)
            let signature = repo
                .signature()
                .or_else(|_| {
                    // Fallback to a default signature if git config is not set
                    git2::Signature::now("AGI Workforce", "agi@agiworkforce.com")
                })
                .map_err(|e| anyhow!("Failed to create signature: {}", e))?;

            // Get the parent commit (HEAD), if it exists
            let parent_commit = match repo.head() {
                Ok(head) => {
                    let oid = head
                        .target()
                        .ok_or_else(|| anyhow!("HEAD reference has no target"))?;
                    Some(
                        repo.find_commit(oid)
                            .map_err(|e| anyhow!("Failed to find HEAD commit: {}", e))?,
                    )
                }
                Err(e) => {
                    // No HEAD means this is the first commit
                    if e.code() == git2::ErrorCode::UnbornBranch
                        || e.code() == git2::ErrorCode::NotFound
                    {
                        None
                    } else {
                        return Err(anyhow!("Failed to get HEAD: {}", e));
                    }
                }
            };

            // Check if there are actual changes to commit
            if let Some(ref parent) = parent_commit {
                let parent_tree = parent
                    .tree()
                    .map_err(|e| anyhow!("Failed to get parent tree: {}", e))?;

                let diff = repo
                    .diff_tree_to_tree(Some(&parent_tree), Some(&tree), None)
                    .map_err(|e| anyhow!("Failed to compute diff: {}", e))?;

                if diff.deltas().count() == 0 {
                    tracing::info!(
                        "[GitExecutor] git_commit: No changes to commit in '{}'",
                        canonical_path.display()
                    );
                    // Return None to signal no changes
                    return Ok(None);
                }
            }

            // Create the commit
            let parents: Vec<&git2::Commit> = parent_commit.iter().collect();
            let commit_oid = repo
                .commit(
                    Some("HEAD"),
                    &signature,
                    &signature,
                    message,
                    &tree,
                    &parents,
                )
                .map_err(|e| anyhow!("Failed to create commit: {}", e))?;

            let commit_hash = commit_oid.to_string();

            // Extract author string before signature goes out of scope
            let author_string = format!(
                "{} <{}>",
                signature.name().unwrap_or("Unknown"),
                signature.email().unwrap_or("unknown@example.com")
            );

            Ok(Some((commit_hash, author_string)))
        })();

        // Handle the result outside the git2 scope
        let Some((commit_hash, author_string)) = git_result? else {
            // No changes to commit
            return Ok(json!({
                "success": false,
                "repository_path": canonical_path.to_string_lossy(),
                "message": "Nothing to commit - no changes staged",
                "commit_hash": null
            }));
        };

        tracing::info!(
            "[GitExecutor] git_commit: Created commit {} with message '{}' in '{}'",
            &commit_hash[..8],
            message,
            canonical_path.display()
        );

        // Track git commit for audit trail (note: commits are not auto-revertible)
        if let Some(ref tracker) = context.change_tracker {
            tracker
                .record_git_commit(
                    PathBuf::from(&canonical_path),
                    commit_hash.clone(),
                    message.to_string(),
                    session_id.to_string(),
                )
                .await;
            tracing::debug!(
                "[GitExecutor] Tracked git commit {} for audit: {}",
                &commit_hash[..8],
                canonical_path.display()
            );
        }

        Ok(json!({
            "success": true,
            "repository_path": canonical_path.to_string_lossy(),
            "commit_hash": commit_hash,
            "commit_hash_short": &commit_hash[..8.min(commit_hash.len())],
            "message": message,
            "author": author_string
        }))
    }

    /// Execute git_push operation.
    ///
    /// Pushes commits to a remote repository. Supports:
    /// - SSH authentication (agent or key files)
    /// - HTTPS with credential helper
    /// - Progress reporting via tool events
    async fn execute_push(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let path = parameters
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing 'path' parameter"))?;
        let remote = parameters
            .get("remote")
            .and_then(|v| v.as_str())
            .unwrap_or("origin");
        let branch = parameters.get("branch").and_then(|v| v.as_str());

        let canonical_path = Self::validate_path(Path::new(path), context, "git_push")?;

        // Open the repository
        let repo = git2::Repository::open(&canonical_path)
            .map_err(|e| anyhow!("Failed to open git repository at '{}': {}", path, e))?;

        // Get the branch to push (current branch if not specified)
        let branch_name = if let Some(b) = branch {
            b.to_string()
        } else {
            let head = repo
                .head()
                .map_err(|e| anyhow!("Failed to get HEAD reference: {}", e))?;
            if !head.is_branch() {
                return Err(anyhow!(
                    "HEAD is detached. Please specify a branch to push."
                ));
            }
            head.shorthand()
                .ok_or_else(|| anyhow!("Failed to get current branch name"))?
                .to_string()
        };

        // Get the remote
        let mut remote_obj = repo
            .find_remote(remote)
            .map_err(|e| anyhow!("Failed to find remote '{}': {}", remote, e))?;

        // Set up callbacks for authentication
        let mut callbacks = git2::RemoteCallbacks::new();

        // Credential callback - tries SSH agent first, then username from URL
        callbacks.credentials(|url, username_from_url, allowed_types| {
            Self::get_credentials(url, username_from_url, allowed_types)
        });

        // Progress callback for UI feedback
        let tool_id = context.tool_id.clone();
        let app_handle = context.app_handle.clone();
        callbacks.push_transfer_progress(move |current, total, _bytes| {
            if let Some(ref app) = app_handle {
                let progress = if total > 0 {
                    current as f32 / total as f32
                } else {
                    0.0
                };
                crate::ui::events::tool_stream::emit_tool_progress(
                    app,
                    &tool_id,
                    progress,
                    Some(&format!("Pushing objects: {}/{}", current, total)),
                );
            }
        });

        // Create push options with callbacks
        let mut push_options = git2::PushOptions::new();
        push_options.remote_callbacks(callbacks);

        // Build the refspec for pushing
        let refspec = format!("refs/heads/{}:refs/heads/{}", branch_name, branch_name);

        // Perform the push
        remote_obj
            .push(&[&refspec], Some(&mut push_options))
            .map_err(|e| {
                anyhow!(
                    "Failed to push branch '{}' to remote '{}': {}",
                    branch_name,
                    remote,
                    e
                )
            })?;

        tracing::info!(
            "[GitExecutor] Git push successful: branch={} remote={} path={}",
            branch_name,
            remote,
            canonical_path.display()
        );

        Ok(json!({
            "success": true,
            "branch": branch_name,
            "remote": remote,
            "path": canonical_path.to_string_lossy()
        }))
    }

    /// Execute git_clone operation.
    ///
    /// Clones a remote repository to a local path. Supports:
    /// - HTTPS URLs
    /// - SSH URLs (git@host:user/repo format)
    /// - Progress reporting via tool events
    async fn execute_clone(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let url = parameters
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing 'url' parameter"))?;
        let destination = parameters
            .get("destination")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing 'destination' parameter"))?;

        // Validate the URL format - accept both HTTPS and SSH URLs
        let is_valid_url = if url.starts_with("git@") || (url.contains(':') && !url.contains("://"))
        {
            // SSH URL format (git@github.com:user/repo.git)
            true
        } else {
            // Try parsing as standard URL
            url::Url::parse(url).is_ok()
        };

        if !is_valid_url {
            return Err(anyhow!("Invalid repository URL format: {}", url));
        }

        // Validate destination path
        let dest_path = Path::new(destination);

        // If destination exists, it must be empty
        if dest_path.exists() {
            let is_empty = dest_path
                .read_dir()
                .map(|mut d| d.next().is_none())
                .unwrap_or(false);
            if !is_empty {
                return Err(anyhow!(
                    "Destination directory '{}' already exists and is not empty",
                    destination
                ));
            }
        }

        // Validate parent directory exists and is allowed
        let parent = dest_path
            .parent()
            .ok_or_else(|| anyhow!("Invalid destination path: no parent directory"))?;

        if !parent.exists() {
            return Err(anyhow!(
                "Parent directory does not exist: {}",
                parent.display()
            ));
        }

        let canonical_parent = std::fs::canonicalize(parent)
            .map_err(|e| anyhow!("Invalid parent directory '{}': {}", parent.display(), e))?;

        // SECURITY: Validate destination is within allowed directories
        let allowed_directories = context.get_allowed_directories();
        let path_allowed = if allowed_directories.is_empty() {
            tracing::warn!(
                "[GitExecutor] No allowed_directories configured - git clone unrestricted. \
                Consider configuring allowed directories for security."
            );
            true
        } else {
            allowed_directories
                .iter()
                .any(|allowed_dir| canonical_parent.starts_with(allowed_dir))
        };

        if !path_allowed {
            tracing::error!(
                "[GitExecutor] Path traversal attempt blocked: destination parent '{}' is outside allowed directories",
                canonical_parent.display()
            );
            return Err(anyhow!(
                "Access denied: destination '{}' is outside allowed directories",
                destination
            ));
        }

        // Compute final destination path
        let final_dest = canonical_parent.join(
            dest_path
                .file_name()
                .ok_or_else(|| anyhow!("Invalid destination path"))?,
        );

        // Set up fetch options with callbacks for authentication
        let mut callbacks = git2::RemoteCallbacks::new();

        // Credential callback - same as git_push
        callbacks.credentials(|url, username_from_url, allowed_types| {
            Self::get_credentials(url, username_from_url, allowed_types)
        });

        // Progress callback for fetch/clone progress
        let tool_id = context.tool_id.clone();
        let app_handle = context.app_handle.clone();
        callbacks.transfer_progress(move |stats| {
            if let Some(ref app) = app_handle {
                let received = stats.received_objects();
                let total = stats.total_objects();
                let progress = if total > 0 {
                    received as f32 / total as f32
                } else {
                    0.0
                };
                crate::ui::events::tool_stream::emit_tool_progress(
                    app,
                    &tool_id,
                    progress,
                    Some(&format!(
                        "Cloning: {}/{} objects ({} bytes)",
                        received,
                        total,
                        stats.received_bytes()
                    )),
                );
            }
            true
        });

        // Build fetch options
        let mut fetch_options = git2::FetchOptions::new();
        fetch_options.remote_callbacks(callbacks);

        // Build clone options
        let mut builder = git2::build::RepoBuilder::new();
        builder.fetch_options(fetch_options);

        // Perform the clone
        let repo = builder.clone(url, &final_dest).map_err(|e| {
            anyhow!(
                "Failed to clone repository '{}' to '{}': {}",
                url,
                final_dest.display(),
                e
            )
        })?;

        // Get the default branch name
        let head = repo.head().ok();
        let branch_name = head
            .as_ref()
            .and_then(|h| h.shorthand())
            .unwrap_or("unknown");

        tracing::info!(
            "[GitExecutor] Git clone successful: url={} destination={} branch={}",
            url,
            final_dest.display(),
            branch_name
        );

        Ok(json!({
            "success": true,
            "url": url,
            "path": final_dest.to_string_lossy(),
            "branch": branch_name
        }))
    }
}

impl Default for GitExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolExecutor for GitExecutor {
    fn tool_names(&self) -> Vec<&'static str> {
        vec![
            "git_status",
            "git_init",
            "git_add",
            "git_commit",
            "git_push",
            "git_clone",
        ]
    }

    fn description(&self) -> &'static str {
        "Git version control operations executor"
    }

    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
        execution_context: &ExecutionContext,
    ) -> Result<Value> {
        // Extract session_id from execution context for audit tracking
        let session_id = &execution_context.goal.id;

        match tool_name {
            "git_status" => self.execute_status(parameters, context).await,
            "git_init" => self.execute_init(parameters, context).await,
            "git_add" => self.execute_add(parameters, context).await,
            "git_commit" => self.execute_commit(parameters, context, session_id).await,
            "git_push" => self.execute_push(parameters, context).await,
            "git_clone" => self.execute_clone(parameters, context).await,
            _ => Err(anyhow!("Unknown git tool: {}", tool_name)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use tempfile::TempDir;

    fn create_test_context() -> ExecutorContext {
        ExecutorContext {
            app_handle: None,
            automation: Arc::new(
                crate::automation::AutomationService::new()
                    .expect("Failed to create AutomationService for tests"),
            ),
            router: Arc::new(tokio::sync::RwLock::new(crate::core::llm::LLMRouter::new())),
            tool_cache: Arc::new(crate::data::cache::ToolResultCache::new()),
            security_guard: Arc::new(crate::sys::security::ToolExecutionGuard::new()),
            change_tracker: None,
            session_id: "test_session".to_string(),
            tool_id: "test_tool".to_string(),
        }
    }

    fn create_test_execution_context() -> ExecutionContext {
        ExecutionContext {
            goal: crate::core::agi::Goal {
                id: "test_goal".to_string(),
                description: "Test goal".to_string(),
                priority: crate::core::agi::Priority::Medium,
                deadline: None,
                constraints: vec![],
                success_criteria: vec![],
            },
            current_state: HashMap::new(),
            available_resources: crate::core::agi::ResourceState {
                cpu_usage_percent: 0.0,
                memory_usage_mb: 0,
                network_usage_mbps: 0.0,
                storage_usage_mb: 0,
                available_tools: vec![],
            },
            tool_results: vec![],
            context_memory: vec![],
        }
    }

    #[test]
    fn test_git_executor_tool_names() {
        let executor = GitExecutor::new();
        let names = executor.tool_names();

        assert!(names.contains(&"git_status"));
        assert!(names.contains(&"git_init"));
        assert!(names.contains(&"git_add"));
        assert!(names.contains(&"git_commit"));
        assert!(names.contains(&"git_push"));
        assert!(names.contains(&"git_clone"));
        assert_eq!(names.len(), 6);
    }

    #[test]
    fn test_git_executor_description() {
        let executor = GitExecutor::new();
        assert_eq!(
            executor.description(),
            "Git version control operations executor"
        );
    }

    #[tokio::test]
    async fn test_git_init_and_status() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().join("test_repo");

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        // Test git_init
        let mut init_params = HashMap::new();
        init_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );

        let result = executor
            .execute("git_init", &init_params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["success"], true);
        assert!(repo_path.join(".git").exists());

        // Test git_status on new repo
        let mut status_params = HashMap::new();
        status_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );

        let result = executor
            .execute("git_status", &status_params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["success"], true);
        assert_eq!(result["clean"], true);
    }

    #[tokio::test]
    async fn test_git_add_and_commit() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().join("test_repo");

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        // Initialize repo
        let mut init_params = HashMap::new();
        init_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        executor
            .execute("git_init", &init_params, &context, &exec_context)
            .await
            .unwrap();

        // Create a test file
        std::fs::write(repo_path.join("test.txt"), "Hello, World!").unwrap();

        // Test git_add
        let mut add_params = HashMap::new();
        add_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        add_params.insert(
            "files".to_string(),
            Value::Array(vec![Value::String("test.txt".to_string())]),
        );

        let result = executor
            .execute("git_add", &add_params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["success"], true);
        assert_eq!(result["files_count"], 1);

        // Test git_commit
        let mut commit_params = HashMap::new();
        commit_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        commit_params.insert(
            "message".to_string(),
            Value::String("Initial commit".to_string()),
        );

        let result = executor
            .execute("git_commit", &commit_params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["success"], true);
        assert!(result["commit_hash"].as_str().is_some());
    }

    #[tokio::test]
    async fn test_git_add_all() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().join("test_repo");

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        // Initialize repo
        let mut init_params = HashMap::new();
        init_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        executor
            .execute("git_init", &init_params, &context, &exec_context)
            .await
            .unwrap();

        // Create multiple test files
        std::fs::write(repo_path.join("file1.txt"), "Content 1").unwrap();
        std::fs::write(repo_path.join("file2.txt"), "Content 2").unwrap();

        // Test git_add with "."
        let mut add_params = HashMap::new();
        add_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        add_params.insert(
            "files".to_string(),
            Value::Array(vec![Value::String(".".to_string())]),
        );

        let result = executor
            .execute("git_add", &add_params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["success"], true);
        assert!(result["files_count"].as_i64().unwrap() >= 2);
    }

    #[tokio::test]
    async fn test_commit_no_changes() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().join("test_repo");

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        // Initialize repo and make initial commit
        let mut init_params = HashMap::new();
        init_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        executor
            .execute("git_init", &init_params, &context, &exec_context)
            .await
            .unwrap();

        std::fs::write(repo_path.join("test.txt"), "Hello").unwrap();

        let mut add_params = HashMap::new();
        add_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        add_params.insert(
            "files".to_string(),
            Value::Array(vec![Value::String(".".to_string())]),
        );
        executor
            .execute("git_add", &add_params, &context, &exec_context)
            .await
            .unwrap();

        let mut commit_params = HashMap::new();
        commit_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        commit_params.insert(
            "message".to_string(),
            Value::String("Initial commit".to_string()),
        );
        executor
            .execute("git_commit", &commit_params, &context, &exec_context)
            .await
            .unwrap();

        // Try to commit again with no changes
        let result = executor
            .execute("git_commit", &commit_params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["success"], false);
        assert!(result["message"]
            .as_str()
            .unwrap()
            .contains("Nothing to commit"));
    }

    #[test]
    fn test_path_validation() {
        let temp_dir = TempDir::new().unwrap();
        let context = create_test_context();

        // Valid path within allowed directories should succeed
        let result = GitExecutor::validate_path(temp_dir.path(), &context, "test");
        assert!(result.is_ok());

        // Note: More comprehensive path traversal tests would require mocking
        // the allowed directories, which depends on app state
    }
}
