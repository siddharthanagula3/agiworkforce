use super::*;

impl ToolExecutor {
    pub(crate) async fn execute_email_send_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::email::{email_send, SendEmailRequest};
            let account_id = args
                .get("account_id")
                .and_then(|v| v.as_i64())
                .ok_or_else(|| anyhow!("Missing account_id parameter"))?;

            let to: Vec<crate::features::communications::EmailAddress> = args
                .get("to")
                .map(|v| serde_json::from_value(v.clone()).unwrap_or_default())
                .unwrap_or_default();

            let subject = args
                .get("subject")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let body_text = args
                .get("body_text")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let body_html = args
                .get("body_html")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let request = SendEmailRequest {
                account_id,
                to,
                cc: vec![],
                bcc: vec![],
                reply_to: None,
                subject,
                body_text,
                body_html,
                attachments: vec![],
            };

            match email_send(app.clone(), request).await {
                Ok(message_id) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "message_id": message_id,
                        "status": "sent"
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to send email: {}", e), "success": false }),
                    error: Some(format!("Failed to send email: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for email operations", "success": false }),
                error: Some("App handle not available for email operations".to_string()),
                metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
            })
        }
    }

    pub(crate) async fn execute_email_fetch_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::email::email_fetch_inbox;

            let account_id = args
                .get("account_id")
                .and_then(|v| v.as_i64())
                .ok_or_else(|| anyhow!("Missing account_id parameter"))?;

            let folder = args
                .get("folder")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let limit = args
                .get("limit")
                .and_then(|v| v.as_u64())
                .map(|n| n as usize);

            match email_fetch_inbox(app.clone(), account_id, folder, limit, None).await {
                Ok(emails) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "emails": emails,
                        "count": emails.len()
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to fetch emails: {}", e), "success": false }),
                    error: Some(format!("Failed to fetch emails: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for email operations", "success": false }),
                error: Some("App handle not available for email operations".to_string()),
                metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
            })
        }
    }

    pub(crate) async fn execute_calendar_create_event_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::features::calendar::CreateEventRequest;
            use crate::sys::commands::calendar::{calendar_create_event, CalendarState};
            use tauri::Manager;

            let state = app.state::<CalendarState>();
            let account_id = args
                .get("account_id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing account_id parameter"))?
                .to_string();

            let request: CreateEventRequest =
                serde_json::from_value(args.get("event").cloned().unwrap_or(json!({})))
                    .map_err(|e| anyhow!("Invalid event data: {}", e))?;

            match calendar_create_event(account_id, request, state, app.clone()).await {
                Ok(event) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "event": event,
                        "status": "created"
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to create calendar event: {}", e), "success": false }),
                    error: Some(format!("Failed to create calendar event: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for calendar operations", "success": false }),
                error: Some("App handle not available for calendar operations".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    pub(crate) async fn execute_calendar_list_events_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::features::calendar::ListEventsRequest;
            use crate::sys::commands::calendar::{calendar_list_events, CalendarState};
            use tauri::Manager;

            let state = app.state::<CalendarState>();
            let account_id = args
                .get("account_id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing account_id parameter"))?
                .to_string();

            let request: ListEventsRequest =
                serde_json::from_value(args.get("request").cloned().unwrap_or(json!({})))
                    .map_err(|e| anyhow!("Invalid request format: {}", e))?;

            match calendar_list_events(account_id, request, state, app.clone()).await {
                Ok(response) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "events": response.events,
                        "next_page_token": response.next_page_token
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to list calendar events: {}", e), "success": false }),
                    error: Some(format!("Failed to list calendar events: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for calendar operations", "success": false }),
                error: Some("App handle not available for calendar operations".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

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

            let local_path = args
                .get("local_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing local_path parameter"))?
                .to_string();

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

            let local_path = args
                .get("local_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing local_path parameter"))?
                .to_string();

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
            use crate::features::productivity::{Provider, Task};
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

            let task: Task = serde_json::from_value(args.get("task").cloned().unwrap_or(json!({})))
                .map_err(|e| anyhow!("Invalid task data: {}", e))?;

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
