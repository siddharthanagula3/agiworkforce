use super::*;
use chrono::{DateTime, Utc};

fn required_non_empty_string(args: &HashMap<String, Value>, name: &str) -> Result<String> {
    args.get(name)
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| anyhow!("Missing or invalid {name} parameter"))
}

fn optional_non_empty_string(args: &HashMap<String, Value>, name: &str) -> Option<String> {
    args.get(name)
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned)
}

fn parse_datetime_utc(raw: &str, name: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(raw.trim())
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|_| {
            anyhow!("{name} must be an RFC3339 timestamp, for example 2026-06-04T15:00:00Z")
        })
}

fn parse_optional_string_array(args: &HashMap<String, Value>, name: &str) -> Result<Vec<String>> {
    let Some(value) = args.get(name) else {
        return Ok(Vec::new());
    };

    let values = value
        .as_array()
        .ok_or_else(|| anyhow!("{name} must be an array of strings"))?;

    let mut parsed = Vec::with_capacity(values.len());
    for (index, value) in values.iter().enumerate() {
        match value.as_str().map(str::trim) {
            Some(text) if !text.is_empty() => parsed.push(text.to_string()),
            _ => return Err(anyhow!("{name}[{index}] must be a non-empty string")),
        }
    }

    Ok(parsed)
}

fn parse_task_status(raw: Option<&str>) -> Result<crate::features::productivity::TaskStatus> {
    match raw.map(str::trim).filter(|s| !s.is_empty()) {
        None => Ok(crate::features::productivity::TaskStatus::Todo),
        Some(status) => match status.to_lowercase().as_str() {
            "todo" | "to_do" | "pending" | "not_started" | "not started" => {
                Ok(crate::features::productivity::TaskStatus::Todo)
            }
            "in_progress" | "in progress" | "doing" => {
                Ok(crate::features::productivity::TaskStatus::InProgress)
            }
            "completed" | "complete" | "done" => {
                Ok(crate::features::productivity::TaskStatus::Completed)
            }
            "blocked" => Ok(crate::features::productivity::TaskStatus::Blocked),
            "cancelled" | "canceled" => Ok(crate::features::productivity::TaskStatus::Cancelled),
            _ => Err(anyhow!(
                "Invalid task status '{status}'. Use todo, in_progress, completed, blocked, or cancelled"
            )),
        },
    }
}

fn build_productivity_task(
    args: &HashMap<String, Value>,
) -> Result<crate::features::productivity::Task> {
    let title = required_non_empty_string(args, "title")?;
    let id =
        optional_non_empty_string(args, "id").unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let mut task = crate::features::productivity::Task::new(id, title);

    task.description = optional_non_empty_string(args, "description");
    task.status = parse_task_status(args.get("status").and_then(|v| v.as_str()))?;
    task.due_date = optional_non_empty_string(args, "due_date")
        .map(|value| parse_datetime_utc(&value, "due_date"))
        .transpose()?;
    task.assignee = optional_non_empty_string(args, "assignee");
    task.assignee_name = optional_non_empty_string(args, "assignee_name");
    task.project_id = optional_non_empty_string(args, "project_id");
    task.project_name = optional_non_empty_string(args, "project_name");
    task.url = optional_non_empty_string(args, "url");
    task.tags = parse_optional_string_array(args, "tags")?;

    if let Some(priority) = args.get("priority") {
        let value = priority
            .as_u64()
            .ok_or_else(|| anyhow!("priority must be an integer from 0 to 5"))?;
        if value > 5 {
            return Err(anyhow!("priority must be an integer from 0 to 5"));
        }
        task.priority = Some(value as u8);
    }

    Ok(task)
}

impl ToolExecutor {
    pub(crate) async fn execute_cloud_upload_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::cloud::{cloud_upload, CloudState, CloudUploadRequest};
            use tauri::Manager;

            let state = app.state::<CloudState>();
            let account_id = args
                .get("account_id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing account_id parameter"))?
                .to_string();

            let requested_path = args
                .get("local_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing local_path parameter"))?;
            let local_path = self
                .canonicalize_readable_path(&self.resolve_path(requested_path))
                .await?
                .to_string_lossy()
                .into_owned();

            let remote_path = args
                .get("remote_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing remote_path parameter"))?
                .to_string();

            let request = CloudUploadRequest {
                account_id: account_id.clone(),
                local_path: local_path.clone(),
                remote_path: remote_path.clone(),
            };

            match cloud_upload(request, state, app.clone()).await {
                Ok(file_id) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "file_id": file_id,
                        "local_path": local_path,
                        "remote_path": remote_path,
                        "status": "uploaded"
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to upload to cloud storage: {}", e), "success": false }),
                    error: Some(format!("Failed to upload to cloud storage: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for cloud storage", "success": false }),
                error: Some("App handle not available for cloud storage".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    pub(crate) async fn execute_cloud_download_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::cloud::{cloud_download, CloudDownloadRequest, CloudState};
            use tauri::Manager;

            let state = app.state::<CloudState>();
            let account_id = args
                .get("account_id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing account_id parameter"))?
                .to_string();

            let remote_path = args
                .get("remote_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing remote_path parameter"))?
                .to_string();

            let requested_path = args
                .get("local_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing local_path parameter"))?;
            let local_path = self
                .canonicalize_modifiable_path(&self.resolve_path(requested_path))
                .await?
                .to_string_lossy()
                .into_owned();

            let request = CloudDownloadRequest {
                account_id: account_id.clone(),
                remote_path: remote_path.clone(),
                local_path: local_path.clone(),
            };

            match cloud_download(request, state, app.clone()).await {
                Ok(()) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "remote_path": remote_path,
                        "local_path": local_path,
                        "status": "downloaded"
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to download from cloud storage: {}", e), "success": false }),
                    error: Some(format!("Failed to download from cloud storage: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for cloud storage", "success": false }),
                error: Some("App handle not available for cloud storage".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    pub(crate) async fn execute_productivity_create_task_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::features::productivity::Provider;
            use crate::sys::commands::productivity::{productivity_create_task, ProductivityState};
            use tauri::Manager;

            let state = app.state::<ProductivityState>();

            let provider_str = args
                .get("provider")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing provider parameter"))?;

            let provider = match provider_str.to_lowercase().as_str() {
                "notion" => Provider::Notion,
                "trello" => Provider::Trello,
                "asana" => Provider::Asana,
                other => {
                    let err_msg = format!(
                        "Unknown provider: {}. Use 'notion', 'trello', or 'asana'",
                        other
                    );
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                    });
                }
            };

            let task = build_productivity_task(args)?;

            match productivity_create_task(state, provider, task).await {
                Ok(response) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "task_id": response.task_id,
                        "success": response.success,
                        "status": "created"
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to create task: {}", e), "success": false }),
                    error: Some(format!("Failed to create task: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for productivity tools", "success": false }),
                error: Some("App handle not available for productivity tools".to_string()),
                metadata: HashMap::new(),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_productivity_task_from_advertised_top_level_fields() {
        let mut args = HashMap::new();
        args.insert("title".to_string(), json!("Ship beta"));
        args.insert(
            "description".to_string(),
            json!("Finish specialized tool pass"),
        );
        args.insert("status".to_string(), json!("in_progress"));
        args.insert("priority".to_string(), json!(3));
        args.insert("tags".to_string(), json!(["demo", "beta"]));

        let task = build_productivity_task(&args).expect("productivity task");

        assert_eq!(task.title, "Ship beta");
        assert_eq!(
            task.description.as_deref(),
            Some("Finish specialized tool pass")
        );
        assert_eq!(
            task.status,
            crate::features::productivity::TaskStatus::InProgress
        );
        assert_eq!(task.priority, Some(3));
        assert_eq!(task.tags, vec!["demo".to_string(), "beta".to_string()]);
    }
}
