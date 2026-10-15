use super::*;

const DEFAULT_GIT_DIFF_MAX_BYTES: usize = 120_000;
const MAX_GIT_DIFF_MAX_BYTES: usize = 300_000;
const DEFAULT_GIT_LOG_LIMIT: usize = 20;
const MAX_GIT_LOG_LIMIT: usize = 100;

fn parse_git_diff_max_bytes(args: &HashMap<String, Value>) -> Result<usize> {
    match args.get("max_bytes") {
        None => Ok(DEFAULT_GIT_DIFF_MAX_BYTES),
        Some(value) => {
            let Some(raw) = value.as_u64() else {
                return Err(anyhow!("max_bytes must be a positive integer"));
            };
            if raw == 0 {
                return Err(anyhow!("max_bytes must be greater than zero"));
            }
            Ok((raw as usize).min(MAX_GIT_DIFF_MAX_BYTES))
        }
    }
}

fn parse_git_log_limit(args: &HashMap<String, Value>) -> Result<usize> {
    match args.get("limit") {
        None => Ok(DEFAULT_GIT_LOG_LIMIT),
        Some(value) => {
            let Some(raw) = value.as_u64() else {
                return Err(anyhow!("limit must be a positive integer"));
            };
            if raw == 0 {
                return Err(anyhow!("limit must be greater than zero"));
            }
            Ok((raw as usize).min(MAX_GIT_LOG_LIMIT))
        }
    }
}

fn truncate_utf8(input: &str, max_bytes: usize) -> (&str, bool) {
    if input.len() <= max_bytes {
        return (input, false);
    }

    let mut end = max_bytes;
    while end > 0 && !input.is_char_boundary(end) {
        end -= 1;
    }
    (&input[..end], true)
}

impl ToolExecutor {
    pub(crate) async fn execute_git_status_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let path_input = args
            .get("path")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| self.project_folder.clone())
            .unwrap_or_else(|| ".".to_string());
        let path = self.resolve_path(&path_input);

        if let Err(e) = self.validate_path(&path).await {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::from([("path".to_string(), json!(path))]),
            });
        }

        use crate::sys::commands::git::git_status_at;

        match git_status_at(path.clone()).await {
            Ok(status) => Ok(ToolResult {
                success: true,
                data: json!({
                    "branch": status.branch,
                    "staged": status.staged,
                    "unstaged": status.unstaged,
                    "untracked": status.untracked,
                    "conflicts": status.conflicts,
                    "ahead": status.ahead,
                    "behind": status.behind,
                }),
                error: None,
                metadata: HashMap::from([("path".to_string(), json!(path))]),
            }),
            Err(e) => {
                let err_msg = format!("Git status failed: {}", e);
                Ok(ToolResult {
                    success: false,
                    data: json!({ "error": err_msg.clone(), "success": false }),
                    error: Some(err_msg),
                    metadata: HashMap::from([("path".to_string(), json!(path))]),
                })
            }
        }
    }

    pub(crate) async fn execute_git_commit_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let path = args
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing path parameter"))?
            .to_string();
        let message = args
            .get("message")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing message parameter"))?
            .to_string();

        if let Err(e) = self.validate_modifiable_path(&path).await {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::from([("path".to_string(), json!(path))]),
            });
        }

        use crate::sys::commands::git::git_commit_at;

        match git_commit_at(path.clone(), message.clone()).await {
            Ok(commit_id) => Ok(ToolResult {
                success: true,
                data: json!({
                    "success": true,
                    "commit_id": commit_id,
                    "message": message,
                }),
                error: None,
                metadata: HashMap::from([
                    ("path".to_string(), json!(path)),
                    ("message".to_string(), json!(message)),
                ]),
            }),
            Err(e) => {
                let err_msg = format!("Git commit failed: {}", e);
                Ok(ToolResult {
                    success: false,
                    data: json!({ "error": err_msg.clone(), "success": false }),
                    error: Some(err_msg),
                    metadata: HashMap::from([("path".to_string(), json!(path))]),
                })
            }
        }
    }

    pub(crate) async fn execute_git_clone_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let url = args
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing url parameter"))?
            .to_string();
        let destination = args
            .get("destination")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing destination parameter"))?
            .to_string();

        if let Err(e) = self.validate_modifiable_path(&destination).await {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::from([("destination".to_string(), json!(destination))]),
            });
        }

        use crate::sys::commands::git::git_clone;

        match git_clone(url.clone(), destination.clone()).await {
            Ok(msg) => Ok(ToolResult {
                success: true,
                data: json!({
                    "success": true,
                    "message": msg,
                    "url": url,
                    "destination": destination,
                }),
                error: None,
                metadata: HashMap::from([
                    ("url".to_string(), json!(url)),
                    ("destination".to_string(), json!(destination)),
                ]),
            }),
            Err(e) => {
                let err_msg = format!("Git clone failed: {}", e);
                Ok(ToolResult {
                    success: false,
                    data: json!({ "error": err_msg.clone(), "success": false }),
                    error: Some(err_msg),
                    metadata: HashMap::from([("url".to_string(), json!(url))]),
                })
            }
        }
    }

    pub(crate) async fn execute_git_add_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let path = args
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing path parameter"))?
            .to_string();
        let files: Vec<String> = args
            .get("files")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_else(|| vec![".".to_string()]);

        if let Err(e) = self.validate_modifiable_path(&path).await {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::from([("path".to_string(), json!(path))]),
            });
        }

        use crate::sys::commands::git::git_add_at;

        match git_add_at(path.clone(), files.clone()).await {
            Ok(msg) => Ok(ToolResult {
                success: true,
                data: json!({
                    "success": true,
                    "message": msg,
                    "files": files,
                }),
                error: None,
                metadata: HashMap::from([("path".to_string(), json!(path))]),
            }),
            Err(e) => {
                let err_msg = format!("Git add failed: {}", e);
                Ok(ToolResult {
                    success: false,
                    data: json!({ "error": err_msg.clone(), "success": false }),
                    error: Some(err_msg),
                    metadata: HashMap::from([("path".to_string(), json!(path))]),
                })
            }
        }
    }

    pub(crate) async fn execute_git_diff_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let path_input = args
            .get("path")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| self.project_folder.clone())
            .unwrap_or_else(|| ".".to_string());
        let path = self.resolve_path(&path_input);
        let file_path = args
            .get("file_path")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned);
        let staged = args
            .get("staged")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let max_bytes = parse_git_diff_max_bytes(args)?;

        if let Err(e) = self.validate_path(&path).await {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::from([("path".to_string(), json!(path))]),
            });
        }

        use crate::sys::commands::git::git_diff_at;

        match git_diff_at(path.clone(), file_path.clone(), staged).await {
            Ok(diffs) => {
                let mut remaining_bytes = max_bytes;
                let mut any_truncated = false;
                let mut total_additions = 0usize;
                let mut total_deletions = 0usize;
                let mut total_original_bytes = 0usize;
                let mut total_returned_bytes = 0usize;
                let entries = diffs
                    .into_iter()
                    .map(|diff| {
                        total_additions += diff.additions;
                        total_deletions += diff.deletions;
                        let original_bytes = diff.diff_content.len();
                        total_original_bytes += original_bytes;

                        let (content, truncated) =
                            truncate_utf8(&diff.diff_content, remaining_bytes.min(original_bytes));
                        let returned = content.len();
                        remaining_bytes = remaining_bytes.saturating_sub(returned);
                        total_returned_bytes += returned;
                        any_truncated = any_truncated || truncated || returned < original_bytes;

                        json!({
                            "file_path": diff.file_path,
                            "additions": diff.additions,
                            "deletions": diff.deletions,
                            "diff_content": content,
                            "original_bytes": original_bytes,
                            "returned_bytes": returned,
                            "truncated": truncated || returned < original_bytes
                        })
                    })
                    .collect::<Vec<_>>();
                let file_count = entries.len();

                Ok(ToolResult {
                    success: true,
                    data: json!({
                        "success": true,
                        "staged": staged,
                        "file_path": file_path,
                        "diffs": entries,
                        "file_count": file_count,
                        "total_additions": total_additions,
                        "total_deletions": total_deletions,
                        "original_bytes": total_original_bytes,
                        "returned_bytes": total_returned_bytes,
                        "max_bytes": max_bytes,
                        "truncated": any_truncated,
                        "includes_untracked_file_content": false
                    }),
                    error: None,
                    metadata: HashMap::from([
                        ("path".to_string(), json!(path)),
                        ("staged".to_string(), json!(staged)),
                    ]),
                })
            }
            Err(e) => {
                let err_msg = format!("Git diff failed: {}", e);
                Ok(ToolResult {
                    success: false,
                    data: json!({ "error": err_msg.clone(), "success": false }),
                    error: Some(err_msg),
                    metadata: HashMap::from([("path".to_string(), json!(path))]),
                })
            }
        }
    }

    pub(crate) async fn execute_git_log_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let path_input = args
            .get("path")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| self.project_folder.clone())
            .unwrap_or_else(|| ".".to_string());
        let path = self.resolve_path(&path_input);
        let limit = parse_git_log_limit(args)?;

        if let Err(e) = self.validate_path(&path).await {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::from([("path".to_string(), json!(path))]),
            });
        }

        use crate::sys::commands::git::git_log;

        match git_log(path.clone(), Some(limit)).await {
            Ok(commits) => {
                let commit_count = commits.len();
                Ok(ToolResult {
                    success: true,
                    data: json!({
                        "success": true,
                        "limit": limit,
                        "commit_count": commit_count,
                        "commits": commits
                    }),
                    error: None,
                    metadata: HashMap::from([
                        ("path".to_string(), json!(path)),
                        ("limit".to_string(), json!(limit)),
                    ]),
                })
            }
            Err(e) => {
                let err_msg = format!("Git log failed: {}", e);
                Ok(ToolResult {
                    success: false,
                    data: json!({ "error": err_msg.clone(), "success": false }),
                    error: Some(err_msg),
                    metadata: HashMap::from([("path".to_string(), json!(path))]),
                })
            }
        }
    }

    pub(crate) async fn execute_git_list_branches_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let path_input = args
            .get("path")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| self.project_folder.clone())
            .unwrap_or_else(|| ".".to_string());
        let path = self.resolve_path(&path_input);

        if let Err(e) = self.validate_path(&path).await {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::from([("path".to_string(), json!(path))]),
            });
        }

        use crate::sys::commands::git::git_list_branches_at;

        match git_list_branches_at(path.clone()).await {
            Ok(branches) => {
                let branch_count = branches.len();
                Ok(ToolResult {
                    success: true,
                    data: json!({
                        "success": true,
                        "branch_count": branch_count,
                        "branches": branches
                    }),
                    error: None,
                    metadata: HashMap::from([("path".to_string(), json!(path))]),
                })
            }
            Err(e) => {
                let err_msg = format!("Git branch listing failed: {}", e);
                Ok(ToolResult {
                    success: false,
                    data: json!({ "error": err_msg.clone(), "success": false }),
                    error: Some(err_msg),
                    metadata: HashMap::from([("path".to_string(), json!(path))]),
                })
            }
        }
    }

    pub(crate) async fn execute_git_push_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let path = args
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing path parameter"))?
            .to_string();
        let remote = args
            .get("remote")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let branch = args
            .get("branch")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        if let Some(app) = &self.app_handle {
            if let Err(e) = self.validate_modifiable_path(&path).await {
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": e.to_string(), "success": false }),
                    error: Some(e.to_string()),
                    metadata: HashMap::from([("path".to_string(), json!(path))]),
                });
            }

            use crate::sys::commands::git::git_push;

            match git_push(
                app.clone(),
                path.clone(),
                remote.clone(),
                branch.clone(),
                false,
            )
            .await
            {
                Ok(msg) => Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "message": msg }),
                    error: None,
                    metadata: HashMap::from([
                        ("path".to_string(), json!(path)),
                        ("remote".to_string(), json!(remote)),
                        ("branch".to_string(), json!(branch)),
                    ]),
                }),
                Err(e) => {
                    let err_msg = format!("Git push failed: {}", e);
                    Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::from([("path".to_string(), json!(path))]),
                    })
                }
            }
        } else {
            let err_msg = "App handle not available for git_push".to_string();
            Ok(ToolResult {
                success: false,
                data: json!({ "error": err_msg.clone(), "success": false }),
                error: Some(err_msg),
                metadata: HashMap::new(),
            })
        }
    }

    pub(crate) async fn execute_git_init_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let path = args
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing path parameter"))?;

        // Validate the path
        if let Err(e) = self.validate_modifiable_path(path).await {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::from([("path".to_string(), json!(path))]),
            });
        }

        let mut command = agiworkforce_worktree::host_git_async();
        command.args(["init"]).current_dir(path);
        let output = crate::sys::commands::git::host_git_output_async(command)
            .await
            .map_err(|e| anyhow!("Failed to run git init: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        Ok(ToolResult {
            success: output.status.success(),
            data: json!({
                "message": stdout.trim(),
                "path": path
            }),
            error: if !output.status.success() {
                Some(stderr)
            } else {
                None
            },
            metadata: HashMap::from([("path".to_string(), json!(path))]),
        })
    }

    pub(crate) async fn execute_github_create_repo_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let name = args
            .get("name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing name parameter"))?;
        let description = args
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let private = args
            .get("private")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        // Use gh CLI which handles auth
        let mut cmd_args = vec!["repo", "create", name, "--confirm"];
        if private {
            cmd_args.push("--private");
        } else {
            cmd_args.push("--public");
        }
        if !description.is_empty() {
            cmd_args.push("--description");
            cmd_args.push(description);
        }

        let output = tokio::process::Command::new("gh")
            .args(&cmd_args)
            .output()
            .await
            .map_err(|e| anyhow!("Failed to create repo: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        Ok(ToolResult {
            success: output.status.success(),
            data: json!({
                "name": name,
                "url": stdout.trim(),
                "private": private
            }),
            error: if !output.status.success() {
                Some(stderr)
            } else {
                None
            },
            metadata: HashMap::from([
                ("name".to_string(), json!(name)),
                ("private".to_string(), json!(private)),
            ]),
        })
    }
}

fn worktree_info_json(info: &agiworkforce_worktree::NamedWorktree) -> Value {
    json!({
        "slug": info.slug,
        "name": info.name,
        "branch": info.branch,
        "path": info.path,
        "head": info.head,
        "dirty": info.dirty,
        "existed": info.existed
    })
}

type PinnedRepositories = HashMap<PathBuf, Option<agiworkforce_worktree::checkpoint::Workspace>>;

/// The repository each folder held the first time this process looked,
/// kept for the life of the process. The worktree tools run host git pinned
/// to that git directory, so a `.git` a sandboxed command creates in the
/// folder afterwards is never discovered and never configures the host's git.
/// Its code-running settings are recorded then too, unless they were before,
/// and host git refuses any added or changed later. The desktop keeps no
/// trust record of its own: settings in the repository's own configuration
/// or its work tree are obeyed only once the user has trusted them through
/// `git_trust_repository_config`, which keeps that trust with the baseline,
/// so a first baseline taken after a sandboxed command planted something
/// blesses nothing. A failure to ask git at all is not remembered; an
/// answer is.
static PINNED_REPOSITORIES: std::sync::LazyLock<std::sync::Mutex<PinnedRepositories>> =
    std::sync::LazyLock::new(Default::default);

async fn pinned_repository(
    dir: &Path,
) -> Result<Option<agiworkforce_worktree::checkpoint::Workspace>> {
    let dir = dir.canonicalize().unwrap_or_else(|_| dir.to_path_buf());
    if let Some(found) = PINNED_REPOSITORIES
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(&dir)
    {
        return Ok(found.clone());
    }
    let found = agiworkforce_worktree::checkpoint::Workspace::discover(
        &agiworkforce_worktree::TokioCommandRunner,
        &dir,
    )
    .await?;
    if let Some(workspace) = &found {
        if let Err(error) = agiworkforce_worktree::config_guard::ensure_baseline(
            &agiworkforce_worktree::TokioCommandRunner,
            workspace,
        )
        .await
        {
            tracing::warn!(folder = %dir.display(), %error, "repository git settings not recorded");
        }
    }
    Ok(PINNED_REPOSITORIES
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .entry(dir)
        .or_insert(found)
        .clone())
}

/// Resolve the repository of a folder before a sandboxed command can write
/// in it.
pub(crate) async fn pin_repository(dir: &Path) {
    if let Err(error) = pinned_repository(dir).await {
        tracing::warn!(folder = %dir.display(), %error, "repository not resolved");
    }
}

impl ToolExecutor {
    /// The repository the worktree tools act on: the one pinned for the
    /// active project folder, and only that one. A `repo_path` is accepted
    /// when it is a checkout of that same repository, and even then the
    /// pinned repository is what git runs against: a folder a sandboxed
    /// command could have made into a repository of its own, with filters in
    /// its configuration, is never handed to host git.
    async fn worktree_repository(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<agiworkforce_worktree::checkpoint::Workspace> {
        let project = self
            .project_folder
            .clone()
            .ok_or_else(|| anyhow!("worktree tools need an active project folder"))?;
        let folder = self
            .canonicalize_validated_path(&self.resolve_path(&project))
            .await?;
        let repository = pinned_repository(&folder).await?.ok_or_else(|| {
            anyhow!(
                "{} held no git repository with a working tree when this app first used it, so worktree tools stay off for it. If you have created one since, restart the app.",
                folder.display()
            )
        })?;
        let Some(requested) = args
            .get("repo_path")
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            return Ok(repository);
        };
        let requested = self
            .canonicalize_validated_path(&self.resolve_path(requested))
            .await?;
        let same = requested == folder
            || agiworkforce_worktree::checkpoint::Workspace::discover(
                &agiworkforce_worktree::TokioCommandRunner,
                &requested,
            )
            .await?
            .is_some_and(|found| found.same_repository(&repository));
        if !same {
            return Err(anyhow!(
                "{} is not a checkout of the project's repository; worktree tools act only on the repository of the active project folder",
                requested.display()
            ));
        }
        Ok(repository)
    }

    pub(crate) async fn execute_worktree_create_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let repository = self.worktree_repository(args).await?;
        let slug = args
            .get("slug")
            .and_then(|value| value.as_str())
            .ok_or_else(|| anyhow!("Missing slug parameter"))?
            .to_string();

        let info = agiworkforce_worktree::create_or_resume_named_worktree(
            &agiworkforce_worktree::TokioCommandRunner,
            &repository,
            &slug,
        )
        .await
        .map_err(|error| anyhow!(crate::sys::commands::git::desktop_git_error(error)))?;

        Ok(ToolResult {
            success: true,
            data: json!({
                "success": true,
                "worktree": worktree_info_json(&info),
                "message": if info.existed { "worktree already existed" } else { "worktree created" },
                "note": "This creates an isolated git worktree directory, not an OS sandbox."
            }),
            error: None,
            metadata: HashMap::from([("tool".to_string(), json!("worktree_create"))]),
        })
    }

    pub(crate) async fn execute_worktree_list_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let repository = self.worktree_repository(args).await?;

        let worktrees = agiworkforce_worktree::list_named_worktrees(
            &agiworkforce_worktree::TokioCommandRunner,
            &repository,
        )
        .await?;

        let count = worktrees.len();
        let values: Vec<Value> = worktrees.iter().map(worktree_info_json).collect();

        Ok(ToolResult {
            success: true,
            data: json!({
                "success": true,
                "worktrees": values,
                "count": count
            }),
            error: None,
            metadata: HashMap::from([("tool".to_string(), json!("worktree_list"))]),
        })
    }

    pub(crate) async fn execute_worktree_remove_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let repository = self.worktree_repository(args).await?;
        let slug = args
            .get("slug")
            .and_then(|value| value.as_str())
            .ok_or_else(|| anyhow!("Missing slug parameter"))?
            .to_string();
        let force = args
            .get("force")
            .and_then(|value| value.as_bool())
            .unwrap_or(false);
        let delete_branch = args
            .get("delete_branch")
            .and_then(|value| value.as_bool())
            .unwrap_or(false);

        let info = agiworkforce_worktree::remove_named_worktree(
            &agiworkforce_worktree::TokioCommandRunner,
            &repository,
            &slug,
            force,
            delete_branch,
        )
        .await?;

        Ok(ToolResult {
            success: true,
            data: json!({
                "success": true,
                "removed": true,
                "worktree": worktree_info_json(&info),
                "branch_deleted": delete_branch
            }),
            error: None,
            metadata: HashMap::from([("tool".to_string(), json!("worktree_remove"))]),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::agi::tools::ToolRegistry;
    use std::sync::Arc;
    use tempfile::TempDir;

    fn init_repo_with_commit() -> Result<TempDir> {
        let dir = tempfile::tempdir()?;
        let repo = git2::Repository::init(dir.path())?;
        std::fs::write(dir.path().join("README.md"), "hello\n")?;

        let mut index = repo.index()?;
        index.add_path(Path::new("README.md"))?;
        index.write()?;
        let tree_id = index.write_tree()?;
        let tree = repo.find_tree(tree_id)?;
        let signature = git2::Signature::now("AGI Test", "agi@example.com")?;
        repo.commit(Some("HEAD"), &signature, &signature, "initial", &tree, &[])?;

        drop(tree);
        drop(repo);
        Ok(dir)
    }

    fn commit_file(
        repo_dir: &TempDir,
        relative_path: &str,
        content: &str,
        message: &str,
    ) -> Result<()> {
        std::fs::write(repo_dir.path().join(relative_path), content)?;
        let repo = git2::Repository::open(repo_dir.path())?;
        let mut index = repo.index()?;
        index.add_path(Path::new(relative_path))?;
        index.write()?;
        let tree_id = index.write_tree()?;
        let tree = repo.find_tree(tree_id)?;
        let signature = git2::Signature::now("AGI Test", "agi@example.com")?;
        let parent = repo.head()?.peel_to_commit()?;
        repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &[&parent],
        )?;
        Ok(())
    }

    #[test]
    fn git_diff_truncation_preserves_utf8_boundaries() {
        let (content, truncated) = truncate_utf8("aéz", 2);
        assert_eq!(content, "a");
        assert!(truncated);
    }

    #[tokio::test]
    async fn git_diff_returns_tracked_changes_with_truncation_metadata() {
        let repo_dir = init_repo_with_commit().expect("repo");
        std::fs::write(repo_dir.path().join("README.md"), "hello\nchanged\n").expect("modify file");

        let mut executor = ToolExecutor::new(Arc::new(ToolRegistry::new().expect("registry")));
        executor.set_project_folder(Some(repo_dir.path().to_string_lossy().to_string()));
        let result = executor
            .execute_git_diff_tool(&HashMap::from([
                (
                    "path".to_string(),
                    json!(repo_dir.path().to_string_lossy().to_string()),
                ),
                ("max_bytes".to_string(), json!(32)),
            ]))
            .await
            .expect("git diff");

        assert!(result.success);
        assert_eq!(result.data["success"], json!(true));
        assert_eq!(result.data["includes_untracked_file_content"], json!(false));
        assert_eq!(result.data["truncated"], json!(true));
        assert_eq!(result.data["file_count"], json!(1));
        assert_eq!(result.data["total_additions"], json!(1));
        assert_eq!(result.data["total_deletions"], json!(0));
        assert_eq!(result.data["returned_bytes"], json!(32));

        let diffs = result.data["diffs"].as_array().expect("diffs array");
        assert_eq!(diffs[0]["file_path"], json!("README.md"));
        assert_eq!(diffs[0]["truncated"], json!(true));
    }

    #[tokio::test]
    async fn git_diff_rejects_invalid_max_bytes() {
        let executor = ToolExecutor::new(Arc::new(ToolRegistry::new().expect("registry")));
        let error = executor
            .execute_git_diff_tool(&HashMap::from([("max_bytes".to_string(), json!(0))]))
            .await
            .expect_err("zero max_bytes should fail");
        assert!(error.to_string().contains("greater than zero"));
    }

    #[tokio::test]
    async fn git_log_returns_bounded_commits_from_project_folder() {
        let repo_dir = init_repo_with_commit().expect("repo");
        commit_file(&repo_dir, "README.md", "hello\nsecond\n", "second").expect("second commit");

        let mut executor = ToolExecutor::new(Arc::new(ToolRegistry::new().expect("registry")));
        executor.set_project_folder(Some(repo_dir.path().to_string_lossy().to_string()));
        let result = executor
            .execute_git_log_tool(&HashMap::from([("limit".to_string(), json!(1))]))
            .await
            .expect("git log");

        assert!(result.success);
        assert_eq!(result.data["success"], json!(true));
        assert_eq!(result.data["limit"], json!(1));
        assert_eq!(result.data["commit_count"], json!(1));
        let commits = result.data["commits"].as_array().expect("commits array");
        assert_eq!(commits[0]["message"], json!("second"));
    }

    #[tokio::test]
    async fn git_log_rejects_invalid_limit() {
        let executor = ToolExecutor::new(Arc::new(ToolRegistry::new().expect("registry")));
        let error = executor
            .execute_git_log_tool(&HashMap::from([("limit".to_string(), json!(0))]))
            .await
            .expect_err("zero limit should fail");
        assert!(error.to_string().contains("greater than zero"));
    }

    #[tokio::test]
    async fn git_list_branches_returns_local_branch_metadata() {
        let repo_dir = init_repo_with_commit().expect("repo");
        {
            let repo = git2::Repository::open(repo_dir.path()).expect("open repo");
            let head = repo.head().expect("head").peel_to_commit().expect("commit");
            repo.branch("feature/demo", &head, false)
                .expect("create branch");
        }

        let mut executor = ToolExecutor::new(Arc::new(ToolRegistry::new().expect("registry")));
        executor.set_project_folder(Some(repo_dir.path().to_string_lossy().to_string()));
        let result = executor
            .execute_git_list_branches_tool(&HashMap::new())
            .await
            .expect("git list branches");

        assert!(result.success);
        assert_eq!(result.data["success"], json!(true));
        assert_eq!(result.data["branch_count"], json!(2));
        let branches = result.data["branches"].as_array().expect("branches array");
        assert!(branches
            .iter()
            .any(|branch| branch["name"] == json!("feature/demo")));
        assert!(branches
            .iter()
            .any(|branch| branch["is_current"] == json!(true)));
    }

    #[tokio::test]
    async fn a_folder_without_a_repository_keeps_worktree_tools_off_after_one_appears() {
        let folder = tempfile::tempdir().expect("folder");
        pin_repository(folder.path()).await;
        git2::Repository::init(folder.path()).expect("planted repository");

        let mut executor = ToolExecutor::new(Arc::new(ToolRegistry::new().expect("registry")));
        executor.set_project_folder(Some(folder.path().to_string_lossy().to_string()));
        let error = executor
            .execute_worktree_list_tool(&HashMap::new())
            .await
            .expect_err("a repository created after pinning is not used");

        assert!(error.to_string().contains("held no git repository"));
    }

    #[tokio::test]
    async fn worktree_tools_refuse_a_repository_planted_inside_the_project() {
        let repo_dir = init_repo_with_commit().expect("repo");
        pin_repository(repo_dir.path()).await;
        let planted = repo_dir.path().join("planted");
        std::fs::create_dir_all(&planted).expect("planted folder");
        git2::Repository::init(&planted).expect("planted repository");

        let mut executor = ToolExecutor::new(Arc::new(ToolRegistry::new().expect("registry")));
        executor.set_project_folder(Some(repo_dir.path().to_string_lossy().to_string()));
        let args = HashMap::from([(
            "repo_path".to_string(),
            json!(planted.to_string_lossy().to_string()),
        )]);
        let error = executor
            .execute_worktree_list_tool(&args)
            .await
            .expect_err("a repository other than the project's is refused");
        assert!(error
            .to_string()
            .contains("not a checkout of the project's repository"));

        let subfolder = repo_dir.path().join("src");
        std::fs::create_dir_all(&subfolder).expect("subfolder");
        let args = HashMap::from([(
            "repo_path".to_string(),
            json!(subfolder.to_string_lossy().to_string()),
        )]);
        assert!(
            executor
                .execute_worktree_list_tool(&args)
                .await
                .expect("a folder of the project's own repository")
                .success
        );
    }

    #[tokio::test]
    async fn worktree_tools_use_the_repository_pinned_for_the_folder() {
        let repo_dir = init_repo_with_commit().expect("repo");
        pin_repository(repo_dir.path()).await;

        let mut executor = ToolExecutor::new(Arc::new(ToolRegistry::new().expect("registry")));
        executor.set_project_folder(Some(repo_dir.path().to_string_lossy().to_string()));
        let result = executor
            .execute_worktree_list_tool(&HashMap::new())
            .await
            .expect("worktree list");

        assert!(result.success);
    }
}
