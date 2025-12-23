use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Todo,
    InProgress,
    Completed,
    Blocked,
    Cancelled,
}

impl TaskStatus {
    pub fn to_notion_status(&self) -> &str {
        match self {
            TaskStatus::Todo => "Not started",
            TaskStatus::InProgress => "In progress",
            TaskStatus::Completed => "Done",
            TaskStatus::Blocked => "Blocked",
            TaskStatus::Cancelled => "Cancelled",
        }
    }

    pub fn to_trello_list_name(&self) -> &str {
        match self {
            TaskStatus::Todo => "To Do",
            TaskStatus::InProgress => "In Progress",
            TaskStatus::Completed => "Done",
            TaskStatus::Blocked => "Blocked",
            TaskStatus::Cancelled => "Cancelled",
        }
    }

    pub fn to_asana_status(&self) -> &str {
        match self {
            TaskStatus::Todo => "To Do",
            TaskStatus::InProgress => "In Progress",
            TaskStatus::Completed => "Complete",
            TaskStatus::Blocked => "Blocked",
            TaskStatus::Cancelled => "Cancelled",
        }
    }

    pub fn from_notion_status(status: &str) -> Self {
        match status.to_lowercase().as_str() {
            "not started" | "to do" | "todo" => TaskStatus::Todo,
            "in progress" | "doing" => TaskStatus::InProgress,
            "done" | "completed" | "complete" => TaskStatus::Completed,
            "blocked" => TaskStatus::Blocked,
            "cancelled" | "canceled" => TaskStatus::Cancelled,
            _ => TaskStatus::Todo,
        }
    }

    pub fn from_trello_list(list_name: &str) -> Self {
        match list_name.to_lowercase().as_str() {
            "to do" | "todo" | "backlog" => TaskStatus::Todo,
            "in progress" | "doing" | "work in progress" => TaskStatus::InProgress,
            "done" | "completed" | "complete" | "finished" => TaskStatus::Completed,
            "blocked" | "waiting" => TaskStatus::Blocked,
            "cancelled" | "canceled" | "archived" => TaskStatus::Cancelled,
            _ => TaskStatus::Todo,
        }
    }

    pub fn from_asana_status(completed: bool) -> Self {
        if completed {
            TaskStatus::Completed
        } else {
            TaskStatus::Todo
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,

    pub title: String,

    pub description: Option<String>,

    pub status: TaskStatus,

    pub due_date: Option<DateTime<Utc>>,

    pub assignee: Option<String>,

    pub priority: Option<u8>,

    pub tags: Vec<String>,

    pub url: Option<String>,

    pub project_id: Option<String>,

    pub project_name: Option<String>,

    pub created_at: Option<DateTime<Utc>>,

    pub updated_at: Option<DateTime<Utc>>,
}

impl Task {
    pub fn new(id: String, title: String) -> Self {
        Self {
            id,
            title,
            description: None,
            status: TaskStatus::Todo,
            due_date: None,
            assignee: None,
            priority: None,
            tags: Vec::new(),
            url: None,
            project_id: None,
            project_name: None,
            created_at: None,
            updated_at: None,
        }
    }

    pub fn with_description(mut self, description: String) -> Self {
        self.description = Some(description);
        self
    }

    pub fn with_status(mut self, status: TaskStatus) -> Self {
        self.status = status;
        self
    }

    pub fn with_due_date(mut self, due_date: DateTime<Utc>) -> Self {
        self.due_date = Some(due_date);
        self
    }

    pub fn with_assignee(mut self, assignee: String) -> Self {
        self.assignee = Some(assignee);
        self
    }

    pub fn with_priority(mut self, priority: u8) -> Self {
        self.priority = Some(priority);
        self
    }

    pub fn with_tags(mut self, tags: Vec<String>) -> Self {
        self.tags = tags;
        self
    }

    pub fn with_url(mut self, url: String) -> Self {
        self.url = Some(url);
        self
    }

    pub fn with_project(mut self, project_id: String, project_name: String) -> Self {
        self.project_id = Some(project_id);
        self.project_name = Some(project_name);
        self
    }
}

#[async_trait::async_trait]
pub trait UnifiedTaskProvider {
    async fn list_tasks(&self) -> crate::sys::error::Result<Vec<Task>>;

    async fn create_task(&self, task: Task) -> crate::sys::error::Result<String>;

    async fn update_task(&self, task: Task) -> crate::sys::error::Result<()>;

    async fn delete_task(&self, task_id: &str) -> crate::sys::error::Result<()>;

    async fn get_task(&self, task_id: &str) -> crate::sys::error::Result<Task>;
}
