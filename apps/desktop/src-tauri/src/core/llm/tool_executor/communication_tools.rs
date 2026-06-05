use super::*;
use chrono::{DateTime, Utc};

const MAX_EMAIL_FETCH_LIMIT: usize = 100;
const MAX_CALENDAR_LIST_RESULTS: u32 = 250;

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

fn parse_i64_arg(args: &HashMap<String, Value>, name: &str) -> Result<i64> {
    match args.get(name) {
        Some(Value::Number(number)) => number
            .as_i64()
            .or_else(|| number.as_u64().and_then(|n| i64::try_from(n).ok()))
            .ok_or_else(|| anyhow!("{name} must be a signed 64-bit integer")),
        Some(Value::String(text)) => text
            .trim()
            .parse::<i64>()
            .map_err(|_| anyhow!("{name} must be an integer or numeric string")),
        _ => Err(anyhow!("Missing or invalid {name} parameter")),
    }
}

fn parse_optional_usize_limit(
    args: &HashMap<String, Value>,
    name: &str,
    max: usize,
) -> Result<Option<usize>> {
    let Some(value) = args.get(name) else {
        return Ok(None);
    };

    let parsed = match value {
        Value::Number(number) => number
            .as_u64()
            .and_then(|n| usize::try_from(n).ok())
            .ok_or_else(|| anyhow!("{name} must be a positive integer"))?,
        Value::String(text) => text
            .trim()
            .parse::<usize>()
            .map_err(|_| anyhow!("{name} must be a positive integer"))?,
        _ => return Err(anyhow!("{name} must be a positive integer")),
    };

    if parsed == 0 || parsed > max {
        return Err(anyhow!("{name} must be between 1 and {max}"));
    }

    Ok(Some(parsed))
}

fn parse_optional_u32_limit(
    args: &HashMap<String, Value>,
    name: &str,
    max: u32,
) -> Result<Option<u32>> {
    let limit = parse_optional_usize_limit(args, name, max as usize)?;
    Ok(limit.map(|value| value as u32))
}

fn parse_datetime_utc(raw: &str, name: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(raw.trim())
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|_| {
            anyhow!("{name} must be an RFC3339 timestamp, for example 2026-06-04T15:00:00Z")
        })
}

fn parse_datetime_arg(args: &HashMap<String, Value>, name: &str) -> Result<DateTime<Utc>> {
    let raw = required_non_empty_string(args, name)?;
    parse_datetime_utc(&raw, name)
}

fn parse_event_datetime_arg(
    args: &HashMap<String, Value>,
    name: &str,
    timezone: &str,
) -> Result<crate::features::calendar::EventDateTime> {
    Ok(crate::features::calendar::EventDateTime::DateTime {
        date_time: parse_datetime_arg(args, name)?,
        timezone: timezone.to_string(),
    })
}

fn is_reasonable_email_address(email: &str) -> bool {
    let trimmed = email.trim();
    if trimmed.is_empty() || trimmed.chars().any(char::is_whitespace) {
        false
    } else if let Some((local, domain)) = trimmed.split_once('@') {
        !local.is_empty() && domain.contains('.') && !domain.ends_with('.')
    } else {
        false
    }
}

fn parse_email_address_value(
    value: &Value,
) -> Result<crate::features::communications::EmailAddress> {
    match value {
        Value::String(email) => {
            let email = email.trim();
            if !is_reasonable_email_address(email) {
                return Err(anyhow!("Invalid email address '{email}'"));
            }
            Ok(crate::features::communications::EmailAddress {
                email: email.to_string(),
                name: None,
            })
        }
        Value::Object(object) => {
            let email = object
                .get("email")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| anyhow!("Email address object must include email"))?;

            if !is_reasonable_email_address(email) {
                return Err(anyhow!("Invalid email address '{email}'"));
            }

            let name = object
                .get("name")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(ToOwned::to_owned);

            Ok(crate::features::communications::EmailAddress {
                email: email.to_string(),
                name,
            })
        }
        _ => Err(anyhow!("Email address must be a string or object")),
    }
}

fn parse_email_address_list(
    args: &HashMap<String, Value>,
    name: &str,
    required: bool,
) -> Result<Vec<crate::features::communications::EmailAddress>> {
    let Some(value) = args.get(name) else {
        return if required {
            Err(anyhow!("Missing {name} parameter"))
        } else {
            Ok(Vec::new())
        };
    };

    let addresses = match value {
        Value::Array(values) => values
            .iter()
            .map(parse_email_address_value)
            .collect::<Result<Vec<_>>>()?,
        _ => vec![parse_email_address_value(value)?],
    };

    if required && addresses.is_empty() {
        return Err(anyhow!("{name} must contain at least one recipient"));
    }

    Ok(addresses)
}

fn parse_optional_email_address(
    args: &HashMap<String, Value>,
    name: &str,
) -> Result<Option<crate::features::communications::EmailAddress>> {
    args.get(name).map(parse_email_address_value).transpose()
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

fn build_create_event_request(
    args: &HashMap<String, Value>,
) -> Result<crate::features::calendar::CreateEventRequest> {
    if let Some(event) = args.get("event") {
        return serde_json::from_value(event.clone())
            .map_err(|e| anyhow!("Invalid event data: {e}"));
    }

    let timezone = optional_non_empty_string(args, "timezone").unwrap_or_else(|| "UTC".to_string());

    Ok(crate::features::calendar::CreateEventRequest {
        calendar_id: required_non_empty_string(args, "calendar_id")?,
        title: required_non_empty_string(args, "title")?,
        description: optional_non_empty_string(args, "description"),
        location: optional_non_empty_string(args, "location"),
        start: parse_event_datetime_arg(args, "start_time", &timezone)?,
        end: parse_event_datetime_arg(args, "end_time", &timezone)?,
        attendees: parse_optional_string_array(args, "attendees")?,
        reminders: args
            .get("reminders")
            .map(|value| serde_json::from_value(value.clone()))
            .transpose()
            .map_err(|e| anyhow!("Invalid reminders data: {e}"))?
            .unwrap_or_default(),
        recurrence: args
            .get("recurrence")
            .map(|value| serde_json::from_value(value.clone()))
            .transpose()
            .map_err(|e| anyhow!("Invalid recurrence data: {e}"))?,
    })
}

fn build_list_events_request(
    args: &HashMap<String, Value>,
) -> Result<crate::features::calendar::ListEventsRequest> {
    if let Some(request) = args.get("request") {
        return serde_json::from_value(request.clone())
            .map_err(|e| anyhow!("Invalid request format: {e}"));
    }

    Ok(crate::features::calendar::ListEventsRequest {
        calendar_id: required_non_empty_string(args, "calendar_id")?,
        start_time: parse_datetime_arg(args, "start_time")?,
        end_time: parse_datetime_arg(args, "end_time")?,
        max_results: parse_optional_u32_limit(args, "max_results", MAX_CALENDAR_LIST_RESULTS)?,
        show_deleted: args.get("show_deleted").and_then(|v| v.as_bool()),
    })
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
    if let Some(task) = args.get("task") {
        return serde_json::from_value(task.clone()).map_err(|e| anyhow!("Invalid task data: {e}"));
    }

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
    pub(crate) async fn execute_email_send_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::email::{email_send, SendEmailRequest};
            let account_id = parse_i64_arg(args, "account_id")?;
            let to = parse_email_address_list(args, "to", true)?;
            let cc = parse_email_address_list(args, "cc", false)?;
            let bcc = parse_email_address_list(args, "bcc", false)?;
            let reply_to = parse_optional_email_address(args, "reply_to")?;
            let subject = required_non_empty_string(args, "subject")?;
            let body_text = optional_non_empty_string(args, "body_text")
                .or_else(|| optional_non_empty_string(args, "body"));
            let body_html = optional_non_empty_string(args, "body_html");

            if body_text.is_none() && body_html.is_none() {
                return Err(anyhow!(
                    "Missing email body. Provide body, body_text, or body_html"
                ));
            }

            let request = SendEmailRequest {
                account_id,
                to,
                cc,
                bcc,
                reply_to,
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

            let account_id = parse_i64_arg(args, "account_id")?;

            let folder = args
                .get("folder")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let limit = parse_optional_usize_limit(args, "limit", MAX_EMAIL_FETCH_LIMIT)?;

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
            use crate::sys::commands::calendar::{calendar_create_event, CalendarState};
            use tauri::Manager;

            let state = app.state::<CalendarState>();
            let account_id = args
                .get("account_id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing account_id parameter"))?
                .to_string();

            let request = build_create_event_request(args)?;

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
            use crate::sys::commands::calendar::{calendar_list_events, CalendarState};
            use tauri::Manager;

            let state = app.state::<CalendarState>();
            let account_id = args
                .get("account_id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing account_id parameter"))?
                .to_string();

            let request = build_list_events_request(args)?;

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
    fn parses_simple_email_schema_without_dropping_recipients() {
        let mut args = HashMap::new();
        args.insert("to".to_string(), json!(["user@example.com"]));

        let recipients = parse_email_address_list(&args, "to", true).expect("recipients");

        assert_eq!(recipients.len(), 1);
        assert_eq!(recipients[0].email, "user@example.com");
    }

    #[test]
    fn rejects_invalid_email_recipient() {
        let mut args = HashMap::new();
        args.insert("to".to_string(), json!(["not-an-email"]));

        let error = parse_email_address_list(&args, "to", true).expect_err("invalid recipient");

        assert!(error.to_string().contains("Invalid email address"));
    }

    #[test]
    fn builds_calendar_create_request_from_advertised_top_level_fields() {
        let mut args = HashMap::new();
        args.insert("calendar_id".to_string(), json!("primary"));
        args.insert("title".to_string(), json!("Demo"));
        args.insert("start_time".to_string(), json!("2026-06-04T15:00:00Z"));
        args.insert("end_time".to_string(), json!("2026-06-04T16:00:00Z"));
        args.insert("attendees".to_string(), json!(["user@example.com"]));

        let request = build_create_event_request(&args).expect("calendar request");

        assert_eq!(request.calendar_id, "primary");
        assert_eq!(request.title, "Demo");
        assert_eq!(request.attendees, vec!["user@example.com".to_string()]);
    }

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
