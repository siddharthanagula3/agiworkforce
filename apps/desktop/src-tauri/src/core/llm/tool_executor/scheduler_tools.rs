use super::*;
use crate::core::scheduler::{ParsedSchedule, TaskSchedule};
use crate::sys::commands::scheduler::{ScheduledJob, SchedulerActionType, SchedulerState};

/// Stores what a phrase asked for as a job on the typed schedule the task
/// form uses, read on this computer's clock, and tells every window.
fn schedule_from_chat(
    app: &tauri::AppHandle,
    parsed: &ParsedSchedule,
    name: String,
    action_type: SchedulerActionType,
    action_data: Value,
) -> std::result::Result<ScheduledJob, String> {
    use tauri::Manager;

    let plan = TaskSchedule::from_parsed(parsed, chrono::Local::now().naive_local())?;
    let job = ScheduledJob::planned(name, plan, action_type, action_data)
        .map_err(|error| error.to_string())?;
    app.state::<SchedulerState>()
        .add_and_announce(app, job)
        .map_err(|error| error.to_string())
}

fn local_time(at: chrono::DateTime<chrono::Utc>) -> String {
    at.with_timezone(&chrono::Local)
        .format("%I:%M %p on %B %d")
        .to_string()
}

fn schedule_in_words(job: &ScheduledJob) -> String {
    job.plan
        .as_ref()
        .map(TaskSchedule::summary)
        .unwrap_or_else(|| format!("cron {} (UTC)", job.schedule))
}

impl ToolExecutor {
    pub(super) async fn execute_schedule_reminder_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::core::scheduler::parse_schedule;

            let message = args
                .get("message")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing message parameter"))?
                .to_string();

            let time_expr = args
                .get("time")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing time parameter"))?
                .to_string();

            // Parse the natural language time expression
            let parsed = parse_schedule(&time_expr).map_err(|e| {
                anyhow!(
                    "Could not understand the time '{}'. Try something like 'in 2 hours', 'at 3pm', or 'tomorrow at 9am'. Error: {}",
                    time_expr,
                    e
                )
            })?;

            let action_data = json!({
                "message": message,
                "title": "Reminder"
            });

            match schedule_from_chat(
                app,
                &parsed,
                format!("Reminder: {}", message),
                SchedulerActionType::Notification,
                action_data,
            ) {
                Ok(job) => {
                    let job_id = job.id.clone();
                    let is_recurring = !parsed.is_once();
                    let schedule = schedule_in_words(&job);
                    let next_run = job.next_run.map(local_time);

                    let response_msg = if is_recurring {
                        format!(
                            "I've scheduled a recurring reminder for '{}' ({})",
                            message, schedule
                        )
                    } else {
                        format!(
                            "I've set a reminder for {} to '{}'",
                            next_run.as_deref().unwrap_or(&schedule),
                            message
                        )
                    };

                    Ok(ToolResult {
                        success: true,
                        data: json!({
                            "job_id": job_id,
                            "message": message,
                            "schedule": schedule,
                            "scheduled_time": next_run,
                            "is_recurring": is_recurring,
                            "confirmation": response_msg
                        }),
                        error: None,
                        metadata: HashMap::from([
                            ("tool".to_string(), json!(tool_id)),
                            ("job_id".to_string(), json!(job_id)),
                        ]),
                    })
                }
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to schedule reminder: {}", e), "success": false }),
                    error: Some(format!("Failed to schedule reminder: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for scheduling", "success": false }),
                error: Some("App handle not available for scheduling".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    pub(super) async fn execute_schedule_recurring_task_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::core::scheduler::parse_schedule;

            let task_name = args
                .get("name")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing name parameter"))?
                .to_string();

            let schedule_expr = args
                .get("schedule")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing schedule parameter"))?
                .to_string();

            let task_description = args
                .get("task_description")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| anyhow!("Missing task_description parameter"))?
                .to_string();

            // Parse the natural language schedule expression
            let parsed = parse_schedule(&schedule_expr).map_err(|e| {
                anyhow!(
                    "Could not understand the schedule '{}'. Try 'every day at 9am', 'every monday', or 'every morning'. Error: {}",
                    schedule_expr,
                    e
                )
            })?;

            if parsed.is_once() {
                let err_msg = "Recurring tasks require a repeating schedule like 'every day at 9am' or 'every monday'. For one-time tasks, use schedule_reminder instead.".to_string();
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": err_msg.clone(), "success": false }),
                    error: Some(err_msg),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                });
            }

            // A task made in chat is an AI prompt, as one made in the task
            // form is; no other kind of job can be scheduled.
            let action_type = SchedulerActionType::AgiTask;
            let action_data = json!({ "prompt": task_description });

            match schedule_from_chat(
                app,
                &parsed,
                task_name.clone(),
                action_type.clone(),
                action_data,
            ) {
                Ok(job) => {
                    let job_id = job.id.clone();
                    let schedule = schedule_in_words(&job);
                    let response_msg =
                        format!("I've scheduled '{}' to run {}", task_name, schedule);

                    Ok(ToolResult {
                        success: true,
                        data: json!({
                            "job_id": job_id,
                            "name": task_name,
                            "schedule": schedule,
                            "cron_expression": job.schedule,
                            "next_run": job.next_run.map(local_time),
                            "action_type": action_type.to_string(),
                            "confirmation": response_msg
                        }),
                        error: None,
                        metadata: HashMap::from([
                            ("tool".to_string(), json!(tool_id)),
                            ("job_id".to_string(), json!(job_id)),
                        ]),
                    })
                }
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to schedule task: {}", e), "success": false }),
                    error: Some(format!("Failed to schedule task: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for scheduling", "success": false }),
                error: Some("App handle not available for scheduling".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    pub(super) async fn execute_cancel_scheduled_task_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use tauri::Manager;

            let job_id = args
                .get("task_id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing task_id parameter"))?
                .to_string();

            let state = app.state::<SchedulerState>();

            // First get the job details for a friendly message
            let job_name = state
                .scheduler
                .get_job(&job_id)
                .ok()
                .flatten()
                .map(|j| j.name.clone());

            match state.remove_and_announce(app, &job_id) {
                Ok(removed) => {
                    if removed {
                        let response_msg = match job_name {
                            Some(name) => {
                                format!("I've cancelled the scheduled task '{}'", name)
                            }
                            None => format!("I've cancelled the scheduled task with ID {}", job_id),
                        };

                        Ok(ToolResult {
                            success: true,
                            data: json!({
                                "job_id": job_id,
                                "cancelled": true,
                                "confirmation": response_msg
                            }),
                            error: None,
                            metadata: HashMap::from([
                                ("tool".to_string(), json!(tool_id)),
                                ("job_id".to_string(), json!(job_id)),
                            ]),
                        })
                    } else {
                        let err_msg = format!("No scheduled task found with ID '{}'. Use list_scheduled_tasks to see available tasks.", job_id);
                        Ok(ToolResult {
                            success: false,
                            data: json!({ "error": err_msg.clone(), "success": false }),
                            error: Some(err_msg),
                            metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                        })
                    }
                }
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to cancel task: {}", e), "success": false }),
                    error: Some(format!("Failed to cancel task: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for scheduling", "success": false }),
                error: Some("App handle not available for scheduling".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    pub(super) async fn execute_list_scheduled_tasks_tool(
        &self,
        _args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use tauri::Manager;

            let state = app.state::<SchedulerState>();

            match state.scheduler.list_jobs() {
                Ok(jobs) => {
                    let task_list: Vec<serde_json::Value> = jobs
                        .iter()
                        .map(|job| {
                            json!({
                                "id": job.id,
                                "name": job.name,
                                "schedule": schedule_in_words(job),
                                "action_type": job.action_type.to_string(),
                                "status": format!("{:?}", job.status).to_lowercase(),
                                "next_run": job.next_run.map(local_time),
                                "last_run": job.last_run.map(local_time),
                                "run_count": job.run_count,
                                "description": job.description,
                                "last_problem": job.last_problem.as_ref().map(|problem| &problem.reason)
                            })
                        })
                        .collect();

                    let count = task_list.len();
                    let response_msg = if count == 0 {
                        "You have no scheduled tasks.".to_string()
                    } else if count == 1 {
                        "You have 1 scheduled task.".to_string()
                    } else {
                        format!("You have {} scheduled tasks.", count)
                    };

                    Ok(ToolResult {
                        success: true,
                        data: json!({
                            "tasks": task_list,
                            "count": count,
                            "summary": response_msg
                        }),
                        error: None,
                        metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                    })
                }
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to list tasks: {}", e), "success": false }),
                    error: Some(format!("Failed to list tasks: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for scheduling", "success": false }),
                error: Some("App handle not available for scheduling".to_string()),
                metadata: HashMap::new(),
            })
        }
    }
}
