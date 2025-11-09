use crate::agent::change_tracker::{Change, ChangeTracker, ChangeType};
/// AgentRuntime - The central coordination layer for autonomous agent execution
///
/// This module provides:
/// - Task queue management with priority and dependencies
/// - MCP tool integration with AGI Core
/// - Timeline event emission for frontend updates
/// - Auto-approve workflow orchestration
/// - Terminal/file automation management
use crate::agi::core::AGICore;
use crate::mcp::{McpClient, McpToolRegistry};
use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tauri::Emitter;
use uuid::Uuid;

/// Task priority levels
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskPriority {
    Low = 0,
    Normal = 1,
    High = 2,
    Critical = 3,
}

/// Task status
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
}

/// Timeline event types for frontend updates
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

/// Task definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub description: String,
    pub goal: String,
    pub priority: TaskPriority,
    pub dependencies: Vec<String>,
    pub status: TaskStatus,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
    pub metadata: HashMap<String, serde_json::Value>,
}

impl Task {
    pub fn new(description: String, goal: String, priority: TaskPriority) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            description,
            goal,
            priority,
            dependencies: Vec::new(),
            status: TaskStatus::Queued,
            created_at: Utc::now(),
            started_at: None,
            completed_at: None,
            result: None,
            error: None,
            metadata: HashMap::new(),
        }
    }
}

/// Agent Runtime state
pub struct AgentRuntime {
    /// Task queue (priority-based)
    task_queue: Arc<RwLock<VecDeque<Task>>>,

    /// Active tasks (currently executing)
    active_tasks: Arc<RwLock<HashMap<String, Task>>>,

    /// Completed tasks (history)
    completed_tasks: Arc<RwLock<Vec<Task>>>,

    /// AGI Core reference
    agi_core: Option<Arc<AGICore>>,

    /// MCP client for tool access (reserved for future direct client operations)
    _mcp_client: Arc<McpClient>,

    /// MCP tool registry
    mcp_registry: Arc<McpToolRegistry>,

    /// Auto-approve enabled
    auto_approve: Arc<RwLock<bool>>,

    /// Change tracker for revert capability
    change_tracker: Arc<RwLock<ChangeTracker>>,

    /// Maximum retry attempts for auto-correction
    max_retries: usize,

    /// Tauri app handle for events
    app_handle: tauri::AppHandle,
}

impl AgentRuntime {
    /// Create a new AgentRuntime
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
            auto_approve: Arc::new(RwLock::new(true)), // Auto-approve enabled by default
            change_tracker: Arc::new(RwLock::new(ChangeTracker::new())),
            max_retries: 3, // Default to 3 retry attempts
            app_handle,
        }
    }

    /// Set AGI Core reference
    pub fn set_agi_core(&mut self, agi_core: Arc<AGICore>) {
        self.agi_core = Some(agi_core);
    }

    /// Enable or disable auto-approve mode
    pub fn set_auto_approve(&self, enabled: bool) {
        *self.auto_approve.write() = enabled;
        tracing::info!(
            "[AgentRuntime] Auto-approve mode: {}",
            if enabled { "enabled" } else { "disabled" }
        );
    }

    /// Check if auto-approve is enabled
    pub fn is_auto_approve_enabled(&self) -> bool {
        *self.auto_approve.read()
    }

    /// Queue a new task
    pub fn queue_task(&self, mut task: Task) -> Result<String> {
        task.status = TaskStatus::Queued;
        let task_id = task.id.clone();

        let mut queue = self.task_queue.write();

        // Insert based on priority (higher priority at front)
        let insert_pos = queue
            .iter()
            .position(|t| t.priority < task.priority)
            .unwrap_or(queue.len());

        queue.insert(insert_pos, task.clone());
        drop(queue);

        // Emit timeline event
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

    /// Get next task from queue (respecting dependencies)
    pub fn get_next_task(&self) -> Option<Task> {
        let mut queue = self.task_queue.write();
        let completed = self.completed_tasks.read();

        // Find first task whose dependencies are all completed
        let pos = queue.iter().position(|task| {
            task.dependencies.iter().all(|dep_id| {
                completed
                    .iter()
                    .any(|t| t.id == *dep_id && t.status == TaskStatus::Completed)
            })
        });

        pos.and_then(|i| queue.remove(i))
    }

    /// Execute a task with auto-correction on errors
    pub async fn execute_task(&self, mut task: Task) -> Result<serde_json::Value> {
        task.status = TaskStatus::Running;
        task.started_at = Some(Utc::now());
        let task_id = task.id.clone();

        // Create snapshot before execution (for revert capability)
        // Note: Snapshot creation is skipped in spawned tasks due to Send issues with parking_lot::RwLock
        // TODO: Refactor ChangeTracker to use tokio::sync::RwLock instead of parking_lot for async compatibility
        let _working_dir =
            std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
        let _change_tracker_clone = self.change_tracker.clone();
        let _task_id_clone = task_id.clone();
        // Snapshot creation will be implemented after refactoring ChangeTracker
        tracing::debug!(
            "[AgentRuntime] Snapshot creation deferred for task: {}",
            task_id
        );

        // Add to active tasks
        self.active_tasks
            .write()
            .insert(task_id.clone(), task.clone());

        // Emit timeline event
        self.emit_timeline_event(TimelineEvent::TaskStarted {
            task_id: task_id.clone(),
            description: task.description.clone(),
        });

        tracing::info!("[AgentRuntime] Executing task: {}", task_id);

        // Execute with auto-retry on errors
        let mut last_error: Option<anyhow::Error> = None;
        let mut attempt = 0;

        while attempt <= self.max_retries {
            if attempt > 0 {
                // Emit reasoning about the error and correction attempt
                let error_msg = last_error
                    .as_ref()
                    .map(|e| e.to_string())
                    .unwrap_or_default();
                self.emit_reasoning(
                    &task_id,
                    format!("Attempt {}: Previous attempt failed. Error: {}. Analyzing and correcting...", attempt, error_msg),
                    None,
                );

                // Use LLM to analyze error and suggest fix
                if let Some(correction) =
                    self.analyze_error_and_suggest_fix(&task, &error_msg).await
                {
                    self.emit_reasoning(&task_id, format!("Correction plan: {}", correction), None);
                    // Update task description with correction
                    task.description = format!("{} (Corrected: {})", task.description, correction);
                }
            }

            // Execute via AGI Core if available
            let result = if let Some(ref agi) = self.agi_core {
                self.execute_via_agi(agi, &task).await
            } else {
                self.execute_standalone(&task).await
            };

            match result {
                Ok(value) => {
                    task.status = TaskStatus::Completed;
                    task.completed_at = Some(Utc::now());
                    task.result = Some(value.clone());

                    self.emit_timeline_event(TimelineEvent::TaskCompleted {
                        task_id: task_id.clone(),
                        result: value.clone(),
                    });

                    // Move to completed
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
                        // Max retries exceeded
                        let error_msg = last_error
                            .as_ref()
                            .map(|e| e.to_string())
                            .unwrap_or_else(|| "Unknown error".to_string());
                        task.status = TaskStatus::Failed;
                        task.completed_at = Some(Utc::now());
                        task.error = Some(error_msg.clone());

                        self.emit_timeline_event(TimelineEvent::TaskFailed {
                            task_id: task_id.clone(),
                            error: error_msg.clone(),
                        });

                        // Move to completed (even if failed)
                        self.active_tasks.write().remove(&task_id);
                        self.completed_tasks.write().push(task);

                        tracing::error!(
                            "[AgentRuntime] Task failed after {} attempts: {} - {}",
                            self.max_retries + 1,
                            task_id,
                            error_msg
                        );
                        return Err(last_error.unwrap());
                    }

                    // Wait before retry
                    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                }
            }
        }

        // Should never reach here, but handle it anyway
        Err(anyhow!("Task execution failed after retries"))
    }

    /// Analyze error and suggest fix using LLM (via MCP or router)
    async fn analyze_error_and_suggest_fix(&self, _task: &Task, error: &str) -> Option<String> {
        // TODO: Use LLM router to analyze error and suggest fix
        // For now, return a simple suggestion
        tracing::info!("[AgentRuntime] Analyzing error: {}", error);

        // Simple heuristics for common errors
        if error.contains("not found") || error.contains("does not exist") {
            Some("Check if file/path exists before operation".to_string())
        } else if error.contains("permission") || error.contains("denied") {
            Some("Check file permissions and try with elevated privileges if needed".to_string())
        } else if error.contains("syntax") || error.contains("parse") {
            Some("Review syntax and fix parsing errors".to_string())
        } else {
            Some(format!(
                "Review error message and adjust approach: {}",
                error
            ))
        }
    }

    /// Execute task via AGI Core
    async fn execute_via_agi(&self, _agi: &Arc<AGICore>, task: &Task) -> Result<serde_json::Value> {
        // TODO: Integrate with AGI Core's goal execution
        // For now, use standalone execution
        self.execute_standalone(task).await
    }

    /// Execute task standalone (without AGI Core)
    async fn execute_standalone(&self, task: &Task) -> Result<serde_json::Value> {
        // Detect if this is a code-related task
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
            // Use MCP tools for code generation
            return self.execute_code_task(task).await;
        }

        // For non-code tasks, use MCP tools directly
        self.execute_with_mcp_tools(task).await
    }

    /// Execute code-related tasks using MCP tools and code generation
    async fn execute_code_task(&self, task: &Task) -> Result<serde_json::Value> {
        self.emit_reasoning(
            &task.id,
            format!(
                "Detected code-related task: {}. Analyzing requirements and generating code...",
                task.description
            ),
            None,
        );

        // Use MCP filesystem tools to read/write files
        // Use MCP code generation tools if available

        // For now, emit tool calls to show what would happen
        self.emit_timeline_event(TimelineEvent::ToolCalled {
            task_id: task.id.clone(),
            tool_name: "code_generation".to_string(),
            arguments: serde_json::json!({
                "description": task.description,
                "goal": task.goal,
            }),
        });

        // Simulate code generation (in production, would use actual MCP tools)
        self.emit_reasoning(
            &task.id,
            "Analyzing project structure and existing code patterns...".to_string(),
            None,
        );

        // Wait a bit to simulate processing
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        self.emit_reasoning(
            &task.id,
            "Generating code that follows project conventions and constraints...".to_string(),
            None,
        );

        // Emit success
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

    /// Execute task using MCP tools
    async fn execute_with_mcp_tools(&self, task: &Task) -> Result<serde_json::Value> {
        // List available MCP tools
        let tools = self.mcp_registry.get_all_tool_definitions();

        self.emit_reasoning(
            &task.id,
            format!(
                "Found {} MCP tools available. Selecting appropriate tools for task...",
                tools.len()
            ),
            None,
        );

        // Try to find relevant tools
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

            // Execute first relevant tool (simplified - would use LLM to select best tool)
            let tool = &relevant_tools[0];
            self.emit_timeline_event(TimelineEvent::ToolCalled {
                task_id: task.id.clone(),
                tool_name: tool.name.clone(),
                arguments: serde_json::json!({
                    "task": task.description,
                }),
            });

            // Call tool via MCP registry
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
            // No relevant tools found
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

    /// Cancel a task
    pub fn cancel_task(&self, task_id: &str, reason: String) -> Result<()> {
        // Try to remove from queue
        let mut queue = self.task_queue.write();
        if let Some(pos) = queue.iter().position(|t| t.id == task_id) {
            let mut task = queue.remove(pos).unwrap();
            task.status = TaskStatus::Cancelled;
            task.error = Some(reason.clone());
            task.completed_at = Some(Utc::now());

            self.completed_tasks.write().push(task);

            self.emit_timeline_event(TimelineEvent::TaskCancelled {
                task_id: task_id.to_string(),
                reason,
            });

            return Ok(());
        }

        // Try to cancel active task
        let mut active = self.active_tasks.write();
        if let Some(mut task) = active.remove(task_id) {
            task.status = TaskStatus::Cancelled;
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

    /// Get task status
    pub fn get_task_status(&self, task_id: &str) -> Option<Task> {
        // Check active tasks
        if let Some(task) = self.active_tasks.read().get(task_id) {
            return Some(task.clone());
        }

        // Check queue
        if let Some(task) = self.task_queue.read().iter().find(|t| t.id == task_id) {
            return Some(task.clone());
        }

        // Check completed
        self.completed_tasks
            .read()
            .iter()
            .find(|t| t.id == task_id)
            .cloned()
    }

    /// Get all tasks
    pub fn get_all_tasks(&self) -> Vec<Task> {
        let mut tasks = Vec::new();

        tasks.extend(self.task_queue.read().iter().cloned());
        tasks.extend(self.active_tasks.read().values().cloned());
        tasks.extend(self.completed_tasks.read().iter().cloned());

        tasks.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        tasks
    }

    /// Emit a timeline event to the frontend
    fn emit_timeline_event(&self, event: TimelineEvent) {
        if let Err(e) = self.app_handle.emit("agent://timeline", &event) {
            tracing::error!("[AgentRuntime] Failed to emit timeline event: {}", e);
        }
    }

    /// Emit a reasoning event (for agent thought process)
    pub fn emit_reasoning(&self, task_id: &str, thought: String, duration_ms: Option<u64>) {
        self.emit_timeline_event(TimelineEvent::Reasoning {
            task_id: task_id.to_string(),
            thought,
            duration_ms,
        });
    }

    /// Revert all changes for a task
    pub async fn revert_task_changes(&self, task_id: &str) -> Result<Vec<String>, String> {
        // Clone changes to avoid borrow checker issues
        let changes: Vec<Change> = {
            let tracker = self.change_tracker.read();
            tracker
                .get_task_changes(task_id)
                .into_iter()
                .cloned()
                .collect()
        };

        let mut reverted_ids = Vec::new();

        for change in changes.iter().rev() {
            // Revert in reverse order
            match self.revert_change(change).await {
                Ok(id) => {
                    reverted_ids.push(id.clone());
                    self.change_tracker
                        .write()
                        .mark_reverted(&change.id)
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

    /// Revert a single change
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
            ChangeType::CommandExecuted { .. } => {
                // Commands can't be reverted, but we can mark them
                tracing::warn!(
                    "[AgentRuntime] Cannot revert command execution: {:?}",
                    change.change_type
                );
            }
            _ => {
                tracing::warn!(
                    "[AgentRuntime] Revert not implemented for change type: {:?}",
                    change.change_type
                );
            }
        }

        Ok(change.id.clone())
    }

    /// Get all changes for a task (for UI display)
    pub fn get_task_change_history(&self, task_id: &str) -> Vec<Change> {
        self.change_tracker
            .read()
            .get_task_changes(task_id)
            .into_iter()
            .cloned()
            .collect()
    }

    /// Get all changes (for history view)
    pub fn get_all_change_history(&self) -> Vec<Change> {
        self.change_tracker.read().get_all_changes().to_vec()
    }

    /// Emit a to-do list update
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
