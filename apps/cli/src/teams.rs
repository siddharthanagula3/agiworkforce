use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use colored::Colorize;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Status of a teammate in the team.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TeammateStatus {
    Active,
    Idle,
    Completed,
}

impl std::fmt::Display for TeammateStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TeammateStatus::Active => write!(f, "active"),
            TeammateStatus::Idle => write!(f, "idle"),
            TeammateStatus::Completed => write!(f, "completed"),
        }
    }
}

/// Status of a shared task.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
    Blocked,
}

impl std::fmt::Display for TaskStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskStatus::Pending => write!(f, "pending"),
            TaskStatus::InProgress => write!(f, "in_progress"),
            TaskStatus::Completed => write!(f, "completed"),
            TaskStatus::Blocked => write!(f, "blocked"),
        }
    }
}

impl TaskStatus {
    /// Parse a task status from a string.
    pub fn from_str_loose(s: &str) -> Option<Self> {
        match s.to_lowercase().trim() {
            "pending" => Some(TaskStatus::Pending),
            "in_progress" | "inprogress" | "in-progress" => Some(TaskStatus::InProgress),
            "completed" | "done" => Some(TaskStatus::Completed),
            "blocked" => Some(TaskStatus::Blocked),
            _ => None,
        }
    }
}

/// A teammate in the agent team.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Teammate {
    pub name: String,
    pub role: String,
    pub status: TeammateStatus,
    pub joined_at: DateTime<Utc>,
}

/// A message between teammates.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamMessage {
    pub from: String,
    pub to: String,
    pub content: String,
    pub timestamp: DateTime<Utc>,
}

/// A shared task visible to all teammates.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedTask {
    pub id: String,
    pub title: String,
    pub assignee: Option<String>,
    pub status: TaskStatus,
    pub dependencies: Vec<String>,
    pub created_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// TeamManager
// ---------------------------------------------------------------------------

/// Coordinates teammates, messages, and shared tasks.
#[derive(Debug, Clone)]
pub struct TeamManager {
    teammates: Arc<RwLock<HashMap<String, Teammate>>>,
    mailbox: Arc<RwLock<HashMap<String, Vec<TeamMessage>>>>,
    shared_tasks: Arc<RwLock<Vec<SharedTask>>>,
    next_task_id: Arc<RwLock<u32>>,
}

impl TeamManager {
    /// Create a new empty team manager.
    pub fn new() -> Self {
        Self {
            teammates: Arc::new(RwLock::new(HashMap::new())),
            mailbox: Arc::new(RwLock::new(HashMap::new())),
            shared_tasks: Arc::new(RwLock::new(Vec::new())),
            next_task_id: Arc::new(RwLock::new(1)),
        }
    }

    /// Register or spawn a new teammate with a given name, role, and prompt context.
    ///
    /// In single-process mode this just registers the teammate in the roster.
    /// A future multi-process version could spawn a child agent session.
    pub async fn spawn_teammate(
        &self,
        name: &str,
        role: &str,
        _prompt: &str,
    ) -> anyhow::Result<String> {
        let teammate = Teammate {
            name: name.to_string(),
            role: role.to_string(),
            status: TeammateStatus::Active,
            joined_at: Utc::now(),
        };

        let mut teammates = self.teammates.write().await;
        if teammates.contains_key(name) {
            return Err(anyhow::anyhow!(
                "Teammate '{}' already exists in this team",
                name
            ));
        }
        teammates.insert(name.to_string(), teammate);

        // Initialize mailbox for this teammate
        let mut mailbox = self.mailbox.write().await;
        mailbox.entry(name.to_string()).or_default();

        Ok(format!("Teammate '{}' spawned with role '{}'", name, role))
    }

    /// Send a message from one teammate to another.
    pub async fn send_message(
        &self,
        from: &str,
        to: &str,
        content: &str,
    ) -> anyhow::Result<String> {
        // Verify sender exists
        {
            let teammates = self.teammates.read().await;
            if !teammates.contains_key(from) {
                return Err(anyhow::anyhow!("Sender '{}' is not a teammate", from));
            }
            if !teammates.contains_key(to) {
                return Err(anyhow::anyhow!("Recipient '{}' is not a teammate", to));
            }
        }

        let message = TeamMessage {
            from: from.to_string(),
            to: to.to_string(),
            content: content.to_string(),
            timestamp: Utc::now(),
        };

        let mut mailbox = self.mailbox.write().await;
        mailbox.entry(to.to_string()).or_default().push(message);

        Ok(format!("Message sent from '{}' to '{}'", from, to))
    }

    /// Read and drain pending messages for a teammate.
    pub async fn read_messages(&self, name: &str) -> anyhow::Result<Vec<TeamMessage>> {
        let mut mailbox = self.mailbox.write().await;
        let messages = mailbox
            .get_mut(name)
            .map(std::mem::take)
            .unwrap_or_default();
        Ok(messages)
    }

    /// Add a new task to the shared task list.
    pub async fn add_task(
        &self,
        title: &str,
        assignee: Option<&str>,
        dependencies: Vec<String>,
    ) -> anyhow::Result<String> {
        let mut id_counter = self.next_task_id.write().await;
        let task_id = format!("task-{}", *id_counter);
        *id_counter += 1;

        let task = SharedTask {
            id: task_id.clone(),
            title: title.to_string(),
            assignee: assignee.map(|s| s.to_string()),
            status: TaskStatus::Pending,
            dependencies,
            created_at: Utc::now(),
        };

        let mut tasks = self.shared_tasks.write().await;
        tasks.push(task);

        Ok(task_id)
    }

    /// Update the status of a task by its ID.
    pub async fn update_task(&self, task_id: &str, status: TaskStatus) -> anyhow::Result<String> {
        let mut tasks = self.shared_tasks.write().await;
        if let Some(task) = tasks.iter_mut().find(|t| t.id == task_id) {
            task.status = status.clone();
            Ok(format!("Task '{}' updated to {}", task_id, status))
        } else {
            Err(anyhow::anyhow!("Task '{}' not found", task_id))
        }
    }

    /// Get all shared tasks with their current status and dependency info.
    pub async fn get_tasks(&self) -> Vec<SharedTask> {
        let tasks = self.shared_tasks.read().await;
        tasks.clone()
    }

    /// List all teammates with their status.
    pub async fn list_teammates(&self) -> Vec<Teammate> {
        let teammates = self.teammates.read().await;
        teammates.values().cloned().collect()
    }

    /// Print a formatted summary of the team state to stderr.
    /// Will be wired into the /team REPL command for team status display.
    #[allow(dead_code)]
    pub async fn print_team_status(&self) {
        let teammates = self.list_teammates().await;
        let tasks = self.get_tasks().await;

        eprintln!("{}", "Team Status".bold().cyan());
        eprintln!("{}", "───────────".dimmed());

        if teammates.is_empty() {
            eprintln!("  No teammates registered.");
        } else {
            eprintln!("  {}", "Teammates:".bold());
            for tm in &teammates {
                let status_color = match tm.status {
                    TeammateStatus::Active => tm.status.to_string().green(),
                    TeammateStatus::Idle => tm.status.to_string().yellow(),
                    TeammateStatus::Completed => tm.status.to_string().dimmed(),
                };
                eprintln!(
                    "    {} — {} [{}]",
                    tm.name.bold(),
                    tm.role.dimmed(),
                    status_color
                );
            }
        }

        if tasks.is_empty() {
            eprintln!("  No shared tasks.");
        } else {
            eprintln!("  {}", "Tasks:".bold());
            for task in &tasks {
                let status_color = match task.status {
                    TaskStatus::Pending => task.status.to_string().yellow(),
                    TaskStatus::InProgress => task.status.to_string().cyan(),
                    TaskStatus::Completed => task.status.to_string().green(),
                    TaskStatus::Blocked => task.status.to_string().red(),
                };
                let assignee = task.assignee.as_deref().unwrap_or("unassigned");
                let deps = if task.dependencies.is_empty() {
                    String::new()
                } else {
                    format!(" (deps: {})", task.dependencies.join(", "))
                };
                eprintln!(
                    "    [{}] {} — {} → {}{}",
                    task.id.dimmed(),
                    task.title,
                    assignee.dimmed(),
                    status_color,
                    deps.dimmed()
                );
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tool execution helpers (called from tools.rs)
// ---------------------------------------------------------------------------

/// Execute the `send_message` team tool.
pub async fn execute_send_message(
    team: &TeamManager,
    args: &HashMap<String, String>,
) -> anyhow::Result<crate::tools::ToolResult> {
    let from = args.get("from").map(|s| s.as_str()).unwrap_or("");
    let to = args.get("to").map(|s| s.as_str()).unwrap_or("");
    let content = args.get("content").map(|s| s.as_str()).unwrap_or("");

    if from.is_empty() || to.is_empty() || content.is_empty() {
        return Ok(crate::tools::ToolResult {
            tool_name: "send_message".to_string(),
            success: false,
            output: "Missing required arguments: from, to, content".to_string(),
        });
    }

    match team.send_message(from, to, content).await {
        Ok(msg) => Ok(crate::tools::ToolResult {
            tool_name: "send_message".to_string(),
            success: true,
            output: msg,
        }),
        Err(e) => Ok(crate::tools::ToolResult {
            tool_name: "send_message".to_string(),
            success: false,
            output: format!("Failed to send message: {:#}", e),
        }),
    }
}

/// Execute the `team_task` team tool (create or update tasks).
pub async fn execute_team_task(
    team: &TeamManager,
    args: &HashMap<String, String>,
) -> anyhow::Result<crate::tools::ToolResult> {
    let action = args.get("action").map(|s| s.as_str()).unwrap_or("create");

    match action {
        "create" => {
            let title = args.get("title").map(|s| s.as_str()).unwrap_or("");
            if title.is_empty() {
                return Ok(crate::tools::ToolResult {
                    tool_name: "team_task".to_string(),
                    success: false,
                    output: "Missing required argument: title".to_string(),
                });
            }
            let assignee = args.get("assignee").map(|s| s.as_str());
            let deps: Vec<String> = args
                .get("dependencies")
                .map(|s| {
                    s.split(',')
                        .map(|d| d.trim().to_string())
                        .filter(|d| !d.is_empty())
                        .collect()
                })
                .unwrap_or_default();

            match team.add_task(title, assignee, deps).await {
                Ok(task_id) => Ok(crate::tools::ToolResult {
                    tool_name: "team_task".to_string(),
                    success: true,
                    output: format!("Task created: {}", task_id),
                }),
                Err(e) => Ok(crate::tools::ToolResult {
                    tool_name: "team_task".to_string(),
                    success: false,
                    output: format!("Failed to create task: {:#}", e),
                }),
            }
        }
        "update" => {
            let task_id = args.get("task_id").map(|s| s.as_str()).unwrap_or("");
            let status_str = args.get("status").map(|s| s.as_str()).unwrap_or("");

            if task_id.is_empty() || status_str.is_empty() {
                return Ok(crate::tools::ToolResult {
                    tool_name: "team_task".to_string(),
                    success: false,
                    output: "Missing required arguments: task_id, status".to_string(),
                });
            }

            let status = match TaskStatus::from_str_loose(status_str) {
                Some(s) => s,
                None => {
                    return Ok(crate::tools::ToolResult {
                        tool_name: "team_task".to_string(),
                        success: false,
                        output: format!(
                            "Invalid status '{}'. Valid: pending, in_progress, completed, blocked",
                            status_str
                        ),
                    });
                }
            };

            match team.update_task(task_id, status).await {
                Ok(msg) => Ok(crate::tools::ToolResult {
                    tool_name: "team_task".to_string(),
                    success: true,
                    output: msg,
                }),
                Err(e) => Ok(crate::tools::ToolResult {
                    tool_name: "team_task".to_string(),
                    success: false,
                    output: format!("Failed to update task: {:#}", e),
                }),
            }
        }
        "list" => {
            let tasks = team.get_tasks().await;
            if tasks.is_empty() {
                return Ok(crate::tools::ToolResult {
                    tool_name: "team_task".to_string(),
                    success: true,
                    output: "No shared tasks.".to_string(),
                });
            }
            let mut lines = Vec::new();
            for task in &tasks {
                let assignee = task.assignee.as_deref().unwrap_or("unassigned");
                let deps = if task.dependencies.is_empty() {
                    String::new()
                } else {
                    format!(" (deps: {})", task.dependencies.join(", "))
                };
                lines.push(format!(
                    "[{}] {} — assignee: {} — status: {}{}",
                    task.id, task.title, assignee, task.status, deps
                ));
            }
            Ok(crate::tools::ToolResult {
                tool_name: "team_task".to_string(),
                success: true,
                output: lines.join("\n"),
            })
        }
        other => Ok(crate::tools::ToolResult {
            tool_name: "team_task".to_string(),
            success: false,
            output: format!("Unknown action '{}'. Valid: create, update, list", other),
        }),
    }
}

/// Execute the `read_messages` team tool.
pub async fn execute_read_messages(
    team: &TeamManager,
    args: &HashMap<String, String>,
) -> anyhow::Result<crate::tools::ToolResult> {
    let name = args.get("name").map(|s| s.as_str()).unwrap_or("");
    if name.is_empty() {
        return Ok(crate::tools::ToolResult {
            tool_name: "read_messages".to_string(),
            success: false,
            output: "Missing required argument: name".to_string(),
        });
    }

    match team.read_messages(name).await {
        Ok(messages) => {
            if messages.is_empty() {
                return Ok(crate::tools::ToolResult {
                    tool_name: "read_messages".to_string(),
                    success: true,
                    output: format!("No pending messages for '{}'.", name),
                });
            }
            let mut lines = Vec::new();
            for msg in &messages {
                lines.push(format!(
                    "[{}] {} -> {}: {}",
                    msg.timestamp.format("%H:%M:%S"),
                    msg.from,
                    msg.to,
                    msg.content
                ));
            }
            Ok(crate::tools::ToolResult {
                tool_name: "read_messages".to_string(),
                success: true,
                output: lines.join("\n"),
            })
        }
        Err(e) => Ok(crate::tools::ToolResult {
            tool_name: "read_messages".to_string(),
            success: false,
            output: format!("Failed to read messages: {:#}", e),
        }),
    }
}

/// Execute the `list_teammates` team tool.
pub async fn execute_list_teammates(
    team: &TeamManager,
) -> anyhow::Result<crate::tools::ToolResult> {
    let teammates = team.list_teammates().await;
    if teammates.is_empty() {
        return Ok(crate::tools::ToolResult {
            tool_name: "list_teammates".to_string(),
            success: true,
            output: "No teammates registered.".to_string(),
        });
    }
    let mut lines = Vec::new();
    for tm in &teammates {
        lines.push(format!(
            "{} — role: {} — status: {}",
            tm.name, tm.role, tm.status
        ));
    }
    Ok(crate::tools::ToolResult {
        tool_name: "list_teammates".to_string(),
        success: true,
        output: lines.join("\n"),
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_spawn_teammate() {
        let tm = TeamManager::new();
        let result = tm
            .spawn_teammate("alice", "engineer", "You are a software engineer")
            .await;
        assert!(result.is_ok());

        let teammates = tm.list_teammates().await;
        assert_eq!(teammates.len(), 1);
        assert_eq!(teammates[0].name, "alice");
        assert_eq!(teammates[0].role, "engineer");
    }

    #[tokio::test]
    async fn test_spawn_duplicate_teammate() {
        let tm = TeamManager::new();
        tm.spawn_teammate("bob", "tester", "You test things")
            .await
            .unwrap();
        let result = tm
            .spawn_teammate("bob", "designer", "You design things")
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_send_and_read_messages() {
        let tm = TeamManager::new();
        tm.spawn_teammate("alice", "engineer", "").await.unwrap();
        tm.spawn_teammate("bob", "tester", "").await.unwrap();

        tm.send_message("alice", "bob", "Please review the PR")
            .await
            .unwrap();
        tm.send_message("alice", "bob", "It is urgent")
            .await
            .unwrap();

        let messages = tm.read_messages("bob").await.unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].from, "alice");
        assert_eq!(messages[0].content, "Please review the PR");

        // Messages should be drained after reading
        let messages_after = tm.read_messages("bob").await.unwrap();
        assert!(messages_after.is_empty());
    }

    #[tokio::test]
    async fn test_send_message_unknown_sender() {
        let tm = TeamManager::new();
        tm.spawn_teammate("alice", "engineer", "").await.unwrap();
        let result = tm.send_message("unknown", "alice", "hello").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_add_and_update_task() {
        let tm = TeamManager::new();
        let task_id = tm
            .add_task("Build feature X", Some("alice"), vec![])
            .await
            .unwrap();
        assert_eq!(task_id, "task-1");

        let tasks = tm.get_tasks().await;
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].status, TaskStatus::Pending);

        tm.update_task(&task_id, TaskStatus::InProgress)
            .await
            .unwrap();
        let tasks = tm.get_tasks().await;
        assert_eq!(tasks[0].status, TaskStatus::InProgress);
    }

    #[tokio::test]
    async fn test_task_with_dependencies() {
        let tm = TeamManager::new();
        let t1 = tm.add_task("Setup DB", None, vec![]).await.unwrap();
        let t2 = tm
            .add_task("Build API", Some("bob"), vec![t1.clone()])
            .await
            .unwrap();

        let tasks = tm.get_tasks().await;
        assert_eq!(tasks.len(), 2);
        assert_eq!(tasks[1].dependencies, vec![t1]);
        assert_eq!(t2, "task-2");
    }

    #[tokio::test]
    async fn test_update_nonexistent_task() {
        let tm = TeamManager::new();
        let result = tm.update_task("task-999", TaskStatus::Completed).await;
        assert!(result.is_err());
    }

    #[test]
    fn test_task_status_from_str() {
        assert_eq!(
            TaskStatus::from_str_loose("pending"),
            Some(TaskStatus::Pending)
        );
        assert_eq!(
            TaskStatus::from_str_loose("in_progress"),
            Some(TaskStatus::InProgress)
        );
        assert_eq!(
            TaskStatus::from_str_loose("in-progress"),
            Some(TaskStatus::InProgress)
        );
        assert_eq!(
            TaskStatus::from_str_loose("completed"),
            Some(TaskStatus::Completed)
        );
        assert_eq!(
            TaskStatus::from_str_loose("done"),
            Some(TaskStatus::Completed)
        );
        assert_eq!(
            TaskStatus::from_str_loose("blocked"),
            Some(TaskStatus::Blocked)
        );
        assert_eq!(TaskStatus::from_str_loose("invalid"), None);
    }
}
