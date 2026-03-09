use super::*;

impl ToolExecutor {
    pub(super) async fn execute_schedule_reminder_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::core::scheduler::{parse_schedule, ParsedSchedule};
            use crate::sys::commands::scheduler::{SchedulerActionType, SchedulerState};
            use chrono::{Datelike, Local, Timelike};
            use tauri::Manager;

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

            // Convert to cron expression or one-time schedule
            let (schedule_expr, is_recurring) = match &parsed {
                ParsedSchedule::Once(dt) => {
                    // For one-time reminders, create a specific cron that matches this exact time
                    let local = dt.with_timezone(&Local);
                    let cron = format!(
                        "{} {} {} {} *",
                        local.minute(),
                        local.hour(),
                        local.day(),
                        local.month()
                    );
                    (cron, false)
                }
                ParsedSchedule::Cron(expr) => (expr.clone(), true),
                ParsedSchedule::Interval(duration) => {
                    // Convert interval to approximate cron (limited precision)
                    let minutes = duration.num_minutes();
                    if minutes < 60 {
                        (format!("*/{} * * * *", minutes.max(1)), true)
                    } else {
                        let hours = duration.num_hours();
                        (format!("0 */{} * * *", hours.max(1)), true)
                    }
                }
            };

            let state = app.state::<SchedulerState>();
            let action_data = json!({
                "message": message,
                "title": "Reminder"
            });

            match state.scheduler.add_job(
                format!("Reminder: {}", message),
                schedule_expr,
                SchedulerActionType::Notification,
                action_data,
            ) {
                Ok(job_id) => {
                    // Format user-friendly response
                    let friendly_time = match &parsed {
                        ParsedSchedule::Once(dt) => {
                            let local = dt.with_timezone(&Local);
                            local.format("%I:%M %p on %B %d").to_string()
                        }
                        ParsedSchedule::Cron(_) | ParsedSchedule::Interval(_) => time_expr.clone(),
                    };

                    let response_msg = if is_recurring {
                        format!(
                            "I've scheduled a recurring reminder for '{}' ({})",
                            message, time_expr
                        )
                    } else {
                        format!("I've set a reminder for {} to '{}'", friendly_time, message)
                    };

                    Ok(ToolResult {
                        success: true,
                        data: json!({
                            "job_id": job_id,
                            "message": message,
                            "scheduled_time": friendly_time,
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
            use crate::core::scheduler::{parse_schedule, ParsedSchedule};
            use crate::sys::commands::scheduler::{SchedulerActionType, SchedulerState};
            use tauri::Manager;

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

            let action_type_str = args
                .get("action_type")
                .and_then(|v| v.as_str())
                .unwrap_or("agi_task");

            let action_data = args
                .get("action_data")
                .cloned()
                .unwrap_or_else(|| json!({}));

            // Parse the natural language schedule expression
            let parsed = parse_schedule(&schedule_expr).map_err(|e| {
                anyhow!(
                    "Could not understand the schedule '{}'. Try 'every day at 9am', 'every monday', or 'every morning'. Error: {}",
                    schedule_expr,
                    e
                )
            })?;

            // Convert to cron expression
            let cron_expr = match &parsed {
                ParsedSchedule::Cron(expr) => expr.clone(),
                ParsedSchedule::Interval(duration) => {
                    let minutes = duration.num_minutes();
                    if minutes < 60 {
                        format!("*/{} * * * *", minutes.max(1))
                    } else {
                        let hours = duration.num_hours();
                        format!("0 */{} * * *", hours.max(1))
                    }
                }
                ParsedSchedule::Once(_) => {
                    let err_msg = "Recurring tasks require a repeating schedule like 'every day at 9am' or 'every monday'. For one-time tasks, use schedule_reminder instead.".to_string();
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                    });
                }
            };

            // Parse action type
            let action_type = match action_type_str.to_lowercase().as_str() {
                "workflow" => SchedulerActionType::Workflow,
                "agi_task" | "agitask" | "agi-task" => SchedulerActionType::AgiTask,
                "shell_command" | "shellcommand" | "shell-command" | "shell" => {
                    SchedulerActionType::ShellCommand
                }
                "notification" | "notify" => SchedulerActionType::Notification,
                "webhook" => SchedulerActionType::Webhook,
                "script" => SchedulerActionType::Script,
                _ => SchedulerActionType::AgiTask,
            };

            let state = app.state::<SchedulerState>();

            match state.scheduler.add_job(
                task_name.clone(),
                cron_expr.clone(),
                action_type.clone(),
                action_data,
            ) {
                Ok(job_id) => {
                    // Format user-friendly response
                    let friendly_schedule = match &parsed {
                        ParsedSchedule::Cron(_) => schedule_expr.clone(),
                        ParsedSchedule::Interval(d) => {
                            let hours = d.num_hours();
                            let minutes = d.num_minutes() % 60;
                            if hours > 0 && minutes > 0 {
                                format!("every {} hours and {} minutes", hours, minutes)
                            } else if hours > 0 {
                                format!("every {} hour(s)", hours)
                            } else {
                                format!("every {} minute(s)", d.num_minutes())
                            }
                        }
                        ParsedSchedule::Once(_) => schedule_expr.clone(),
                    };

                    let response_msg = format!(
                        "I've scheduled '{}' to run {}",
                        task_name, friendly_schedule
                    );

                    Ok(ToolResult {
                        success: true,
                        data: json!({
                            "job_id": job_id,
                            "name": task_name,
                            "schedule": friendly_schedule,
                            "cron_expression": cron_expr,
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
            use crate::sys::commands::scheduler::SchedulerState;
            use tauri::Manager;

            let job_id = args
                .get("job_id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing job_id parameter"))?
                .to_string();

            let state = app.state::<SchedulerState>();

            // First get the job details for a friendly message
            let job_name = state
                .scheduler
                .get_job(&job_id)
                .ok()
                .flatten()
                .map(|j| j.name.clone());

            match state.scheduler.remove_job(&job_id) {
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
            use crate::sys::commands::scheduler::SchedulerState;
            use chrono::Local;
            use tauri::Manager;

            let state = app.state::<SchedulerState>();

            match state.scheduler.list_jobs() {
                Ok(jobs) => {
                    let task_list: Vec<serde_json::Value> = jobs
                        .iter()
                        .map(|job| {
                            let next_run_str = job.next_run.map(|dt| {
                                dt.with_timezone(&Local)
                                    .format("%I:%M %p on %B %d")
                                    .to_string()
                            });

                            let last_run_str = job.last_run.map(|dt| {
                                dt.with_timezone(&Local)
                                    .format("%I:%M %p on %B %d")
                                    .to_string()
                            });

                            json!({
                                "id": job.id,
                                "name": job.name,
                                "schedule": job.schedule,
                                "action_type": job.action_type.to_string(),
                                "status": format!("{:?}", job.status).to_lowercase(),
                                "next_run": next_run_str,
                                "last_run": last_run_str,
                                "run_count": job.run_count,
                                "description": job.description
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
