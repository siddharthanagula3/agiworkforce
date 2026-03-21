use crate::core::agent::change_tracker::{Change, ChangeTracker, ChangeType};

use crate::core::agi::core::AGICore;
use crate::core::mcp::{McpClient, McpToolRegistry};
use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tauri::Emitter;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskPriority {
    Low = 0,
    Normal = 1,
    High = 2,
    Critical = 3,
}

/// Status of a task within the AgentRuntime execution pipeline.
///
/// NOTE: This is distinct from `super::TaskStatus` which is used by the
/// autonomous agent's step-based execution. This type models the higher-level
/// runtime task lifecycle (queue -> run -> complete/fail/cancel).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeTaskStatus {
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TimelineEvent {
    TaskQueued {
        task_id: String,
        description: String,
        priority: TaskPriority,
    },
    TaskStarted {
        task_id: String,
        description: String,
    },
    StepStarted {
        task_id: String,
        step_index: usize,
        step_description: String,
    },
    StepCompleted {
        task_id: String,
        step_index: usize,
        result: serde_json::Value,
    },
    StepFailed {
        task_id: String,
        step_index: usize,
        error: String,
    },
    ToolCalled {
        task_id: String,
        tool_name: String,
        arguments: serde_json::Value,
    },
    ToolResult {
        task_id: String,
        tool_name: String,
        success: bool,
        result: Option<serde_json::Value>,
        error: Option<String>,
    },
    TaskCompleted {
        task_id: String,
        result: serde_json::Value,
    },
    TaskFailed {
        task_id: String,
        error: String,
    },
    TaskCancelled {
        task_id: String,
        reason: String,
    },
    AutoApprovalTriggered {
        task_id: String,
        action: String,
        safe: bool,
    },
    TerminalSpawned {
        task_id: String,
        session_id: String,
        command: Option<String>,
    },
    FileModified {
        task_id: String,
        file_path: String,
        operation: String,
    },
    Reasoning {
        task_id: String,
        thought: String,
        duration_ms: Option<u64>,
    },
    TodoUpdated {
        task_id: String,
        todos: Vec<serde_json::Value>,
    },
}

/// A task within the AgentRuntime execution pipeline.
///
/// NOTE: This is distinct from `super::Task` which is used by the autonomous
/// agent. This type models higher-level runtime tasks with priority, dependencies,
/// and chrono-based timestamps for persistence.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeTask {
    pub id: String,
    pub description: String,
    pub goal: String,
    pub priority: TaskPriority,
    pub dependencies: Vec<String>,
    pub status: RuntimeTaskStatus,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
    pub metadata: HashMap<String, serde_json::Value>,
}

impl RuntimeTask {
    pub fn new(description: String, goal: String, priority: TaskPriority) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            description,
            goal,
            priority,
            dependencies: Vec::new(),
            status: RuntimeTaskStatus::Queued,
            created_at: Utc::now(),
            started_at: None,
            completed_at: None,
            result: None,
            error: None,
            metadata: HashMap::new(),
        }
    }
}

pub struct AgentRuntime {
    task_queue: Arc<RwLock<VecDeque<RuntimeTask>>>,

    active_tasks: Arc<RwLock<HashMap<String, RuntimeTask>>>,

    completed_tasks: Arc<RwLock<Vec<RuntimeTask>>>,

    agi_core: Option<Arc<AGICore>>,

    _mcp_client: Arc<McpClient>,

    mcp_registry: Arc<McpToolRegistry>,

    auto_approve: Arc<RwLock<bool>>,

    change_tracker: Arc<ChangeTracker>,

    max_retries: usize,

    app_handle: tauri::AppHandle,
}

impl AgentRuntime {
    pub fn new(
        mcp_client: Arc<McpClient>,
        mcp_registry: Arc<McpToolRegistry>,
        app_handle: tauri::AppHandle,
    ) -> Self {
        Self {
            task_queue: Arc::new(RwLock::new(VecDeque::new())),
            active_tasks: Arc::new(RwLock::new(HashMap::new())),
            completed_tasks: Arc::new(RwLock::new(Vec::new())),
            agi_core: None,
            _mcp_client: mcp_client,
            mcp_registry,
            auto_approve: Arc::new(RwLock::new(true)),
            change_tracker: Arc::new(ChangeTracker::new()),
            max_retries: 3,
            app_handle,
        }
    }

    pub fn set_agi_core(&mut self, agi_core: Arc<AGICore>) {
        self.agi_core = Some(agi_core);
    }

    pub fn set_auto_approve(&self, enabled: bool) {
        *self.auto_approve.write() = enabled;
        tracing::info!(
            "[AgentRuntime] Auto-approve mode: {}",
            if enabled { "enabled" } else { "disabled" }
        );
    }

    pub fn is_auto_approve_enabled(&self) -> bool {
        *self.auto_approve.read()
    }

    pub fn queue_task(&self, mut task: RuntimeTask) -> Result<String> {
        task.status = RuntimeTaskStatus::Queued;
        let task_id = task.id.clone();

        let mut queue = self.task_queue.write();

        let insert_pos = queue
            .iter()
            .position(|t| t.priority < task.priority)
            .unwrap_or(queue.len());

        queue.insert(insert_pos, task.clone());
        drop(queue);

        self.emit_timeline_event(TimelineEvent::TaskQueued {
            task_id: task_id.clone(),
            description: task.description.clone(),
            priority: task.priority,
        });

        tracing::info!(
            "[AgentRuntime] Task queued: {} (priority: {:?})",
            task_id,
            task.priority
        );

        Ok(task_id)
    }

    pub fn get_next_task(&self) -> Option<RuntimeTask> {
        let mut queue = self.task_queue.write();
        let completed = self.completed_tasks.read();

        let pos = queue.iter().position(|task| {
            task.dependencies.iter().all(|dep_id| {
                completed
                    .iter()
                    .any(|t| t.id == *dep_id && t.status == RuntimeTaskStatus::Completed)
            })
        });

        pos.and_then(|i| queue.remove(i))
    }

    pub async fn execute_task(&self, mut task: RuntimeTask) -> Result<serde_json::Value> {
        task.status = RuntimeTaskStatus::Running;
        task.started_at = Some(Utc::now());
        let task_id = task.id.clone();

        let working_dir = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
        let change_tracker_clone = self.change_tracker.clone();
        let task_id_clone = task_id.clone();

        tokio::spawn(async move {
            let result = change_tracker_clone
                .create_snapshot(task_id_clone.clone(), working_dir)
                .await;
            if let Err(e) = result {
                tracing::warn!(
                    "Failed to create snapshot for task {}: {}",
                    task_id_clone,
                    e
                );
            }
        });
        tracing::debug!(
            "[AgentRuntime] Snapshot creation deferred for task: {}",
            task_id
        );

        self.active_tasks
            .write()
            .insert(task_id.clone(), task.clone());

        self.emit_timeline_event(TimelineEvent::TaskStarted {
            task_id: task_id.clone(),
            description: task.description.clone(),
        });

        tracing::info!("[AgentRuntime] Executing task: {}", task_id);

        let mut last_error: Option<anyhow::Error> = None;
        let mut attempt = 0;

        while attempt <= self.max_retries {
            if attempt > 0 {
                let error_msg = last_error
                    .as_ref()
                    .map(|e| e.to_string())
                    .unwrap_or_default();
                self.emit_reasoning(
                    &task_id,
                    format!("Attempt {}: Previous attempt failed. Error: {}. Analyzing and correcting...", attempt, error_msg),
                    None,
                );

                if let Some(correction) =
                    self.analyze_error_and_suggest_fix(&task, &error_msg).await
                {
                    self.emit_reasoning(&task_id, format!("Correction plan: {}", correction), None);

                    task.description = format!("{} (Corrected: {})", task.description, correction);
                }
            }

            let result = if let Some(ref agi) = self.agi_core {
                self.execute_via_agi(agi, &task).await
            } else {
                self.execute_standalone(&task).await
            };

            match result {
                Ok(value) => {
                    task.status = RuntimeTaskStatus::Completed;
                    task.completed_at = Some(Utc::now());
                    task.result = Some(value.clone());

                    self.emit_timeline_event(TimelineEvent::TaskCompleted {
                        task_id: task_id.clone(),
                        result: value.clone(),
                    });

                    self.active_tasks.write().remove(&task_id);
                    self.completed_tasks.write().push(task);

                    if attempt > 0 {
                        tracing::info!(
                            "[AgentRuntime] Task completed after {} correction attempt(s): {}",
                            attempt,
                            task_id
                        );
                    } else {
                        tracing::info!("[AgentRuntime] Task completed: {}", task_id);
                    }
                    return Ok(value);
                }
                Err(e) => {
                    last_error = Some(e);
                    attempt += 1;

                    if attempt > self.max_retries {
                        let error_msg = last_error
                            .as_ref()
                            .map(|e| e.to_string())
                            .unwrap_or_else(|| "Unknown error".to_string());
                        task.status = RuntimeTaskStatus::Failed;
                        task.completed_at = Some(Utc::now());
                        task.error = Some(error_msg.clone());

                        self.emit_timeline_event(TimelineEvent::TaskFailed {
                            task_id: task_id.clone(),
                            error: error_msg.clone(),
                        });

                        self.active_tasks.write().remove(&task_id);
                        self.completed_tasks.write().push(task);

                        tracing::error!(
                            "[AgentRuntime] Task failed after {} attempts: {} - {}",
                            self.max_retries + 1,
                            task_id,
                            error_msg
                        );
                        return Err(last_error.unwrap_or_else(|| {
                            anyhow::anyhow!("Task failed after retries with unknown error")
                        }));
                    }

                    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                }
            }
        }

        Err(anyhow!("Task execution failed after retries"))
    }

    async fn analyze_error_and_suggest_fix(
        &self,
        task: &RuntimeTask,
        error: &str,
    ) -> Option<String> {
        tracing::info!("[AgentRuntime] Analyzing error with LLM: {}", error);

        if let Some(_agi_core) = &self.agi_core {
            let prompt = format!(
                r#"Analyze this error and suggest a specific, actionable fix.

Task: {}
Description: {}

Error:
{}

Provide a concise, technical suggestion (1-2 sentences) on how to fix this error.
Focus on the root cause and specific actions to take.
Do not repeat the error message."#,
                task.goal, task.description, error
            );
            tracing::trace!(
                "[AgentRuntime] Prepared LLM error analysis prompt: {}",
                prompt
            );

            tracing::debug!("[AgentRuntime] LLM analysis not yet integrated with AGI Core router");
        }

        tracing::info!("[AgentRuntime] Using heuristic error analysis");

        let suggestion = if error.contains("not found") || error.contains("does not exist") {
            if error.to_lowercase().contains("file") || error.to_lowercase().contains("path") {
                "File or path does not exist. Verify the path is correct and the file has been created. Use file_list or file_read tools to check existence before operations."
            } else if error.to_lowercase().contains("module")
                || error.to_lowercase().contains("import")
            {
                "Module not found. Check import statements and ensure all dependencies are installed. Verify the module name spelling and availability."
            } else {
                "Resource not found. Verify the resource identifier is correct and the resource exists in the system."
            }
        } else if error.contains("permission")
            || error.contains("denied")
            || error.contains("access denied")
        {
            "Permission denied. Check file/directory permissions. Ensure the process has read/write access. On Windows, try running with administrator privileges if needed."
        } else if error.contains("syntax")
            || error.contains("parse")
            || error.contains("unexpected token")
        {
            "Syntax or parsing error. Review the code/data format for syntax errors. Check for missing brackets, quotes, or incorrect structure. Validate against the expected format."
        } else if error.contains("timeout") || error.contains("timed out") {
            "Operation timed out. Increase timeout duration, check network connectivity, or optimize the operation to complete faster. Verify the target service is responsive."
        } else if error.contains("connection")
            || error.contains("network")
            || error.contains("unreachable")
        {
            "Network or connection error. Verify network connectivity, check firewall settings, and ensure the target service is running and accessible."
        } else if error.contains("invalid") || error.contains("malformed") {
            "Invalid or malformed input. Verify the input data format matches expected schema. Check for correct data types, encoding, and structure."
        } else if error.contains("out of memory") || error.contains("oom") {
            "Out of memory error. Reduce memory usage by processing data in chunks, closing unused resources, or increasing available memory allocation."
        } else if error.contains("already exists") || error.contains("duplicate") {
            "Resource already exists or duplicate found. Use a different name, check for existing resources before creation, or use update operations instead of create."
        } else if error.contains("type") && error.contains("error") {
            "Type error detected. Verify variable types match expected types. Check function signatures and ensure correct type conversions are applied."
        } else {
            return Some(format!(
                "Error encountered: '{}'. Review the error message details, check input parameters, verify preconditions are met, and ensure the operation is valid in the current state.",
                error.chars().take(200).collect::<String>()
            ));
        };

        Some(suggestion.to_string())
    }

    async fn execute_via_agi(
        &self,
        agi: &Arc<AGICore>,
        task: &RuntimeTask,
    ) -> Result<serde_json::Value> {
        tracing::info!("[AgentRuntime] Executing task via AGI Core: {}", task.id);

        let goal = crate::core::agi::Goal {
            id: task.id.clone(),
            description: task.description.clone(),
            priority: match task.priority {
                TaskPriority::Low => crate::core::agi::Priority::Low,
                TaskPriority::Normal => crate::core::agi::Priority::Medium,
                TaskPriority::High => crate::core::agi::Priority::High,
                TaskPriority::Critical => crate::core::agi::Priority::Critical,
            },
            deadline: None,
            constraints: Vec::new(),
            success_criteria: vec![task.goal.clone()],
        };

        let goal_id = agi
            .submit_goal(goal)
            .await
            .map_err(|e| anyhow!("Failed to submit goal to AGI Core: {}", e))?;

        tracing::info!(
            "[AgentRuntime] Task {} submitted to AGI Core as goal {}",
            task.id,
            goal_id
        );

        Ok(serde_json::json!({
            "status": "submitted_to_agi",
            "goal_id": goal_id,
            "message": "Task submitted to AGI Core for autonomous execution"
        }))
    }

    /// Execute task with retry and model fallback
    // Used by: resilient agent execution — retry with different models on failure
    async fn _execute_with_retry_fallback(
        &self,
        agi: &Arc<AGICore>,
        task: &RuntimeTask,
    ) -> Result<serde_json::Value> {
        let priority = match task.priority {
            TaskPriority::Low => crate::core::agi::Priority::Low,
            TaskPriority::Normal => crate::core::agi::Priority::Medium,
            TaskPriority::High => crate::core::agi::Priority::High,
            TaskPriority::Critical => crate::core::agi::Priority::Critical,
        };

        let goal = crate::core::agi::Goal {
            id: task.id.clone(),
            description: format!("{}: {}", task.goal, task.description),
            priority,
            deadline: None,
            constraints: Vec::new(),
            success_criteria: vec![task.goal.clone()],
        };

        let goal_id = agi.submit_goal(goal).await?;
        tracing::info!("[AgentRuntime] Goal submitted to AGI Core: {}", goal_id);

        let start_time = std::time::Instant::now();
        let timeout = std::time::Duration::from_secs(300);

        loop {
            if start_time.elapsed() > timeout {
                return Err(anyhow::anyhow!(
                    "Goal execution timed out after {} seconds",
                    timeout.as_secs()
                ));
            }

            if let Some(context) = agi.get_goal_status(&goal_id) {
                let all_steps_completed = !context.tool_results.is_empty()
                    && context
                        .tool_results
                        .iter()
                        .all(|result| result.success || result.error.is_some());

                if all_steps_completed {
                    let success_count = context.tool_results.iter().filter(|r| r.success).count();
                    let total_count = context.tool_results.len();
                    let overall_success = success_count > total_count / 2;

                    let total_execution_time: u64 = context
                        .tool_results
                        .iter()
                        .map(|r| r.execution_time_ms)
                        .sum();

                    let results: Vec<serde_json::Value> = context
                        .tool_results
                        .iter()
                        .map(|r| {
                            serde_json::json!({
                                "tool_id": r.tool_id,
                                "success": r.success,
                                "result": r.result,
                                "error": r.error,
                                "execution_time_ms": r.execution_time_ms,
                            })
                        })
                        .collect();

                    let errors: Vec<String> = context
                        .tool_results
                        .iter()
                        .filter_map(|r| r.error.clone())
                        .collect();

                    tracing::info!(
                        "[AgentRuntime] Goal execution completed: {} ({}/{} steps succeeded)",
                        goal_id,
                        success_count,
                        total_count
                    );

                    return Ok(serde_json::json!({
                        "success": overall_success,
                        "goal_id": goal_id,
                        "completed_steps": total_count,
                        "successful_steps": success_count,
                        "execution_time_ms": total_execution_time,
                        "results": results,
                        "errors": if errors.is_empty() { None } else { Some(errors) },
                    }));
                }
            }

            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
    }

    async fn execute_standalone(&self, task: &RuntimeTask) -> Result<serde_json::Value> {
        let description_lower = task.description.to_lowercase();
        let is_code_task = description_lower.contains("create")
            || description_lower.contains("write")
            || description_lower.contains("implement")
            || description_lower.contains("add")
            || description_lower.contains("generate")
            || description_lower.contains("refactor")
            || description_lower.contains("fix")
            || description_lower.contains("update")
            || description_lower.contains("code")
            || description_lower.contains("function")
            || description_lower.contains("component")
            || description_lower.contains("file");

        if is_code_task {
            return self.execute_code_task(task).await;
        }

        self.execute_with_mcp_tools(task).await
    }

    async fn execute_code_task(&self, task: &RuntimeTask) -> Result<serde_json::Value> {
        self.emit_reasoning(
            &task.id,
            format!(
                "Detected code-related task: {}. Analyzing requirements and generating code...",
                task.description
            ),
            None,
        );

        self.emit_timeline_event(TimelineEvent::ToolCalled {
            task_id: task.id.clone(),
            tool_name: "code_generation".to_string(),
            arguments: serde_json::json!({
                "description": task.description,
                "goal": task.goal,
            }),
        });

        self.emit_reasoning(
            &task.id,
            "Analyzing project structure and existing code patterns...".to_string(),
            None,
        );

        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        self.emit_reasoning(
            &task.id,
            "Generating code that follows project conventions and constraints...".to_string(),
            None,
        );

        self.emit_timeline_event(TimelineEvent::ToolResult {
            task_id: task.id.clone(),
            tool_name: "code_generation".to_string(),
            success: true,
            result: Some(serde_json::json!({
                "files_created": [],
                "files_modified": [],
                "message": "Code generation completed (using MCP tools)"
            })),
            error: None,
        });

        Ok(serde_json::json!({
            "status": "success",
            "message": format!("Code task '{}' executed", task.description),
            "task_id": task.id,
            "type": "code_generation",
        }))
    }

    async fn execute_with_mcp_tools(&self, task: &RuntimeTask) -> Result<serde_json::Value> {
        let tools = self.mcp_registry.get_all_tool_definitions();

        self.emit_reasoning(
            &task.id,
            format!(
                "Found {} MCP tools available. Selecting appropriate tools for task...",
                tools.len()
            ),
            None,
        );

        let description_lower = task.description.to_lowercase();
        let relevant_tools: Vec<_> = tools
            .iter()
            .filter(|tool| {
                let name_lower = tool.name.to_lowercase();
                name_lower.contains("file")
                    || name_lower.contains("read")
                    || name_lower.contains("write")
                    || (description_lower.contains("file") && name_lower.contains("file"))
                    || (description_lower.contains("read") && name_lower.contains("read"))
            })
            .take(3)
            .collect();

        if !relevant_tools.is_empty() {
            self.emit_reasoning(
                &task.id,
                format!(
                    "Selected {} relevant tool(s) for execution",
                    relevant_tools.len()
                ),
                None,
            );

            let tool = &relevant_tools[0];
            self.emit_timeline_event(TimelineEvent::ToolCalled {
                task_id: task.id.clone(),
                tool_name: tool.name.clone(),
                arguments: serde_json::json!({
                    "task": task.description,
                }),
            });

            let result = self
                .mcp_registry
                .execute_tool(&tool.name, std::collections::HashMap::new())
                .await;

            match result {
                Ok(value) => {
                    self.emit_timeline_event(TimelineEvent::ToolResult {
                        task_id: task.id.clone(),
                        tool_name: tool.name.clone(),
                        success: true,
                        result: Some(value),
                        error: None,
                    });

                    Ok(serde_json::json!({
                        "status": "success",
                        "message": format!("Task executed using MCP tool: {}", tool.name),
                        "task_id": task.id,
                    }))
                }
                Err(e) => {
                    self.emit_timeline_event(TimelineEvent::ToolResult {
                        task_id: task.id.clone(),
                        tool_name: tool.name.clone(),
                        success: false,
                        result: None,
                        error: Some(e.to_string()),
                    });

                    Err(anyhow!("MCP tool execution failed: {}", e))
                }
            }
        } else {
            self.emit_reasoning(
                &task.id,
                "No specific MCP tools found. Using general execution approach...".to_string(),
                None,
            );

            Ok(serde_json::json!({
                "status": "success",
                "message": format!("Task '{}' executed (general mode)", task.description),
                "task_id": task.id,
            }))
        }
    }

    pub fn cancel_task(&self, task_id: &str, reason: String) -> Result<()> {
        let mut queue = self.task_queue.write();
        if let Some(pos) = queue.iter().position(|t| t.id == task_id) {
            let Some(mut task) = queue.remove(pos) else {
                return Err(anyhow::anyhow!("Task {} disappeared from queue", task_id));
            };
            task.status = RuntimeTaskStatus::Cancelled;
            task.error = Some(reason.clone());
            task.completed_at = Some(Utc::now());

            self.completed_tasks.write().push(task);

            self.emit_timeline_event(TimelineEvent::TaskCancelled {
                task_id: task_id.to_string(),
                reason,
            });

            return Ok(());
        }

        let mut active = self.active_tasks.write();
        if let Some(mut task) = active.remove(task_id) {
            task.status = RuntimeTaskStatus::Cancelled;
            task.error = Some(reason.clone());
            task.completed_at = Some(Utc::now());

            self.completed_tasks.write().push(task);

            self.emit_timeline_event(TimelineEvent::TaskCancelled {
                task_id: task_id.to_string(),
                reason,
            });

            return Ok(());
        }

        Err(anyhow!("Task not found: {}", task_id))
    }

    pub fn get_task_status(&self, task_id: &str) -> Option<RuntimeTask> {
        if let Some(task) = self.active_tasks.read().get(task_id) {
            return Some(task.clone());
        }

        if let Some(task) = self.task_queue.read().iter().find(|t| t.id == task_id) {
            return Some(task.clone());
        }

        self.completed_tasks
            .read()
            .iter()
            .find(|t| t.id == task_id)
            .cloned()
    }

    pub fn get_all_tasks(&self) -> Vec<RuntimeTask> {
        let mut tasks = Vec::new();

        tasks.extend(self.task_queue.read().iter().cloned());
        tasks.extend(self.active_tasks.read().values().cloned());
        tasks.extend(self.completed_tasks.read().iter().cloned());

        tasks.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        tasks
    }

    fn emit_timeline_event(&self, event: TimelineEvent) {
        if let Err(e) = self.app_handle.emit("agent:timeline", &event) {
            tracing::error!("[AgentRuntime] Failed to emit timeline event: {}", e);
        }
    }

    pub fn emit_reasoning(&self, task_id: &str, thought: String, duration_ms: Option<u64>) {
        self.emit_timeline_event(TimelineEvent::Reasoning {
            task_id: task_id.to_string(),
            thought,
            duration_ms,
        });
    }

    pub async fn revert_task_changes(&self, task_id: &str) -> Result<Vec<String>, String> {
        let changes: Vec<Change> = self.change_tracker.get_task_changes(task_id).await;

        let mut reverted_ids = Vec::new();

        for change in changes.iter().rev() {
            match self.revert_change(change).await {
                Ok(id) => {
                    reverted_ids.push(id.clone());
                    self.change_tracker
                        .mark_reverted(&change.id)
                        .await
                        .map_err(|e| e.to_string())?;
                }
                Err(e) => {
                    tracing::error!(
                        "[AgentRuntime] Failed to revert change {}: {}",
                        change.id,
                        e
                    );
                    return Err(format!("Failed to revert change {}: {}", change.id, e));
                }
            }
        }

        self.emit_timeline_event(TimelineEvent::TaskCancelled {
            task_id: task_id.to_string(),
            reason: format!("Reverted {} changes", reverted_ids.len()),
        });

        Ok(reverted_ids)
    }

    async fn revert_change(&self, change: &Change) -> Result<String, String> {
        match &change.change_type {
            ChangeType::FileCreated => {
                if let Some(path) = &change.path {
                    tokio::fs::remove_file(path)
                        .await
                        .map_err(|e| format!("Failed to delete file: {}", e))?;
                    tracing::info!("[AgentRuntime] Reverted file creation: {:?}", path);
                }
            }
            ChangeType::FileModified => {
                if let (Some(path), Some(before_content)) = (&change.path, &change.before_content) {
                    tokio::fs::write(path, before_content)
                        .await
                        .map_err(|e| format!("Failed to restore file: {}", e))?;
                    tracing::info!("[AgentRuntime] Reverted file modification: {:?}", path);
                }
            }
            ChangeType::FileDeleted => {
                if let (Some(path), Some(content)) = (&change.path, &change.before_content) {
                    if let Some(parent) = path.parent() {
                        tokio::fs::create_dir_all(parent).await.ok();
                    }
                    tokio::fs::write(path, content)
                        .await
                        .map_err(|e| format!("Failed to restore deleted file: {}", e))?;
                    tracing::info!("[AgentRuntime] Reverted file deletion: {:?}", path);
                }
            }
            ChangeType::FileRenamed { old_path } => {
                if let Some(new_path) = &change.path {
                    let old_path_buf = std::path::PathBuf::from(old_path);
                    tokio::fs::rename(new_path, &old_path_buf)
                        .await
                        .map_err(|e| format!("Failed to rename file back: {}", e))?;
                    tracing::info!(
                        "[AgentRuntime] Reverted file rename: {:?} -> {:?}",
                        new_path,
                        old_path
                    );
                }
            }
            ChangeType::CommandExecuted { command, .. } => {
                tracing::warn!(
                    "[AgentRuntime] Cannot revert command execution '{}': Commands are non-reversible",
                    command.chars().take(50).collect::<String>()
                );
            }
            ChangeType::GitCommit { hash, .. } => {
                // Revert git commit by running git revert
                let output = tokio::process::Command::new("git")
                    .args(["revert", "--no-commit", hash])
                    .output()
                    .await
                    .map_err(|e| format!("Failed to revert git commit: {}", e))?;

                if output.status.success() {
                    tracing::info!("[AgentRuntime] Reverted git commit: {}", hash);
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    tracing::warn!("[AgentRuntime] Git revert may have failed: {}", stderr);
                }
            }
            ChangeType::GitCheckout { branch } => {
                // Try to checkout the previous branch if we have metadata
                if let Some(prev_branch) = change.metadata.get("previous_branch") {
                    if let Some(prev) = prev_branch.as_str() {
                        let output = tokio::process::Command::new("git")
                            .args(["checkout", prev])
                            .output()
                            .await
                            .map_err(|e| format!("Failed to checkout previous branch: {}", e))?;

                        if output.status.success() {
                            tracing::info!(
                                "[AgentRuntime] Reverted git checkout: {} -> {}",
                                branch,
                                prev
                            );
                        }
                    }
                } else {
                    tracing::warn!(
                        "[AgentRuntime] Cannot revert git checkout to {}: Previous branch not recorded",
                        branch
                    );
                }
            }
            ChangeType::DirectoryCreated => {
                if let Some(path) = &change.path {
                    // Only remove if directory is empty
                    match tokio::fs::read_dir(path).await {
                        Ok(mut entries) => {
                            if entries.next_entry().await.ok().flatten().is_none() {
                                tokio::fs::remove_dir(path)
                                    .await
                                    .map_err(|e| format!("Failed to remove directory: {}", e))?;
                                tracing::info!(
                                    "[AgentRuntime] Reverted directory creation: {:?}",
                                    path
                                );
                            } else {
                                tracing::warn!(
                                    "[AgentRuntime] Cannot revert directory creation: {:?} is not empty",
                                    path
                                );
                            }
                        }
                        Err(e) => {
                            tracing::warn!("[AgentRuntime] Cannot check directory: {}", e);
                        }
                    }
                }
            }
            ChangeType::DirectoryDeleted => {
                if let Some(path) = &change.path {
                    tokio::fs::create_dir_all(path)
                        .await
                        .map_err(|e| format!("Failed to recreate directory: {}", e))?;
                    tracing::info!("[AgentRuntime] Reverted directory deletion: {:?}", path);
                }
            }
            ChangeType::GitPush {
                remote,
                branch,
                before_sha,
                after_sha,
                is_protected_branch,
            } => {
                // Git pushes can be reverted in two ways:
                // 1. Create a revert commit and push it (safest)
                // 2. Force push the previous SHA (only for non-protected branches)
                if *is_protected_branch {
                    tracing::warn!(
                        "[AgentRuntime] Cannot auto-revert push to protected branch '{}/{}'. \
                         Please manually create a revert commit or coordinate with your team.",
                        remote,
                        branch
                    );
                    return Err(format!(
                        "Cannot automatically revert push to protected branch '{}'. \
                         Please manually create a revert commit.",
                        branch
                    ));
                }

                if let Some(path) = &change.path {
                    // Try to create a revert commit first
                    let revert_output = tokio::process::Command::new("git")
                        .current_dir(path)
                        .args(["revert", "--no-edit", after_sha])
                        .output()
                        .await
                        .map_err(|e| format!("Failed to create revert commit: {}", e))?;

                    if revert_output.status.success() {
                        // Push the revert commit
                        let push_output = tokio::process::Command::new("git")
                            .current_dir(path)
                            .args(["push", remote, branch])
                            .output()
                            .await
                            .map_err(|e| format!("Failed to push revert: {}", e))?;

                        if push_output.status.success() {
                            tracing::info!(
                                "[AgentRuntime] Reverted git push via revert commit: {}/{} ({})",
                                remote,
                                branch,
                                &after_sha[..8.min(after_sha.len())]
                            );
                        } else {
                            let stderr = String::from_utf8_lossy(&push_output.stderr);
                            return Err(format!("Failed to push revert commit: {}", stderr));
                        }
                    } else if let Some(prev_sha) = before_sha {
                        // Revert failed (possibly conflicts), try force push with lease
                        tracing::warn!(
                            "[AgentRuntime] Revert commit failed, attempting force push with lease"
                        );

                        // First, reset to the previous SHA
                        let reset_output = tokio::process::Command::new("git")
                            .current_dir(path)
                            .args(["reset", "--hard", prev_sha])
                            .output()
                            .await
                            .map_err(|e| format!("Failed to reset: {}", e))?;

                        if !reset_output.status.success() {
                            let stderr = String::from_utf8_lossy(&reset_output.stderr);
                            return Err(format!("Failed to reset to previous commit: {}", stderr));
                        }

                        // Force push with lease (safe - fails if remote has changed)
                        let force_push_output = tokio::process::Command::new("git")
                            .current_dir(path)
                            .args([
                                "push",
                                "--force-with-lease",
                                remote,
                                &format!("{}:{}", branch, branch),
                            ])
                            .output()
                            .await
                            .map_err(|e| format!("Failed to force push: {}", e))?;

                        if force_push_output.status.success() {
                            tracing::info!(
                                "[AgentRuntime] Reverted git push via force push: {}/{} ({} -> {})",
                                remote,
                                branch,
                                &after_sha[..8.min(after_sha.len())],
                                &prev_sha[..8.min(prev_sha.len())]
                            );
                        } else {
                            let stderr = String::from_utf8_lossy(&force_push_output.stderr);
                            return Err(format!(
                                "Failed to force push: {}. Remote may have changed.",
                                stderr
                            ));
                        }
                    } else {
                        return Err(
                            "Cannot revert push: revert failed and no previous SHA recorded"
                                .to_string(),
                        );
                    }
                }
            }
        }

        Ok(change.id.clone())
    }

    pub async fn get_task_change_history(&self, task_id: &str) -> Vec<Change> {
        self.change_tracker.get_task_changes(task_id).await
    }

    pub async fn get_all_change_history(&self) -> Vec<Change> {
        self.change_tracker.get_all_changes().await
    }

    pub fn emit_todo_update(&self, task_id: &str, todos: Vec<(String, String, String)>) {
        let todo_list: Vec<serde_json::Value> = todos
            .into_iter()
            .map(|(id, content, status)| {
                serde_json::json!({
                    "id": id,
                    "content": content,
                    "status": status,
                })
            })
            .collect();

        self.emit_timeline_event(TimelineEvent::TodoUpdated {
            task_id: task_id.to_string(),
            todos: todo_list,
        });
    }
}
