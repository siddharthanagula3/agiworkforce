use super::*;

impl ToolExecutor {
    pub(crate) async fn execute_git_status_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let path = args
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing path parameter"))?
            .to_string();

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
