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

        use crate::sys::commands::git::git_status;

        match git_status(path.clone()).await {
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

        if let Err(e) = self.validate_path(&path).await {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::from([("path".to_string(), json!(path))]),
            });
        }

        use crate::sys::commands::git::git_commit;

        match git_commit(path.clone(), message.clone()).await {
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

        if let Err(e) = self.validate_path(&destination).await {
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

        if let Err(e) = self.validate_path(&path).await {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::from([("path".to_string(), json!(path))]),
            });
        }

        use crate::sys::commands::git::git_add;

        match git_add(path.clone(), files.clone()).await {
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

        use crate::sys::commands::git::git_diff;

        match git_diff(path.clone(), file_path.clone(), staged).await {
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

        use crate::sys::commands::git::git_list_branches;

        match git_list_branches(path.clone()).await {
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
            if let Err(e) = self.validate_path(&path).await {
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
        if let Err(e) = self.validate_path(path).await {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::from([("path".to_string(), json!(path))]),
            });
        }

        let output = tokio::process::Command::new("git")
            .args(["init"])
            .current_dir(path)
            .output()
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
