use crate::error::{Error, Result};
use crate::productivity::unified_task::{Task, TaskStatus, UnifiedTaskProvider};
use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const ASANA_BASE_URL: &str = "https://app.asana.com/api/1.0";

/// Asana API client with OAuth2 or Personal Access Token
pub struct AsanaClient {
    client: Client,
    token: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct AsanaUser {
    gid: String,
    name: String,
    email: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AsanaWorkspace {
    gid: String,
    name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AsanaProject {
    gid: String,
    name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AsanaTask {
    gid: String,
    name: String,
    notes: Option<String>,
    completed: bool,
    due_on: Option<String>,
    due_at: Option<String>,
    assignee: Option<AsanaUser>,
    projects: Option<Vec<AsanaProject>>,
    tags: Option<Vec<AsanaTag>>,
    created_at: String,
    modified_at: String,
    permalink_url: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct AsanaTag {
    gid: String,
    name: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct AsanaResponse<T> {
    data: T,
}

#[derive(Debug, Serialize, Deserialize)]
struct AsanaListResponse<T> {
    data: Vec<T>,
}

#[derive(Debug, Serialize, Deserialize)]
struct AsanaTaskCreate {
    name: String,
    notes: Option<String>,
    projects: Option<Vec<String>>,
    assignee: Option<String>,
    due_on: Option<String>,
    workspace: Option<String>,
}

impl AsanaClient {
    /// Create a new Asana client with OAuth2 access token or Personal Access Token
    pub fn new(token: String) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        Self { client, token }
    }

    /// Verify connection by getting user info
    pub async fn verify_connection(&mut self) -> Result<String> {
        let response = self
            .client
            .get(format!("{}/users/me", ASANA_BASE_URL))
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(|e| Error::from(e))?;

        if response.status().is_success() {
            let data: AsanaResponse<AsanaUser> = response
                .json()
                .await
                .map_err(|e| Error::Http(e.to_string()))?;
            Ok(data.data.gid)
        } else {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            Err(Error::Provider(format!(
                "Asana API error ({}): {}",
                status, error_text
            )))
        }
    }

    /// List all workspaces
    pub async fn list_workspaces(&self) -> Result<Vec<AsanaWorkspace>> {
        let response = self
            .client
            .get(format!("{}/workspaces", ASANA_BASE_URL))
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(|e| Error::from(e))?;

        if response.status().is_success() {
            let data: AsanaListResponse<AsanaWorkspace> =
                response.json().await.map_err(|e| Error::from(e))?;
            Ok(data.data)
        } else {
            Err(Error::Provider(format!(
                "Failed to list Asana workspaces: {}",
                response.status()
            )))
        }
    }

    /// List all projects in a workspace
    pub async fn list_projects(&self, workspace_id: &str) -> Result<Vec<AsanaProject>> {
        let response = self
            .client
            .get(format!(
                "{}/workspaces/{}/projects",
                ASANA_BASE_URL, workspace_id
            ))
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(|e| Error::from(e))?;

        if response.status().is_success() {
            let data: AsanaListResponse<AsanaProject> =
                response.json().await.map_err(|e| Error::from(e))?;
            Ok(data.data)
        } else {
            Err(Error::Provider(format!(
                "Failed to list Asana projects: {}",
                response.status()
            )))
        }
    }

    /// List all tasks in a project
    pub async fn list_project_tasks(&self, project_id: &str) -> Result<Vec<AsanaTask>> {
        let response = self
            .client
            .get(format!(
                "{}/projects/{}/tasks?opt_fields=name,notes,completed,due_on,due_at,assignee,projects,tags,created_at,modified_at,permalink_url",
                ASANA_BASE_URL, project_id
            ))
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(|e| Error::from(e))?;

        if response.status().is_success() {
            let data: AsanaListResponse<AsanaTask> = response
                .json()
                .await
                .map_err(|e| Error::Http(e.to_string()))?;
            Ok(data.data)
        } else {
            Err(Error::Provider(format!(
                "Failed to list Asana tasks: {}",
                response.status()
            )))
        }
    }

    /// Create a new task
    pub async fn create_task_raw(
        &self,
        name: &str,
        notes: Option<&str>,
        workspace_id: Option<&str>,
        project_id: Option<&str>,
        assignee_id: Option<&str>,
        due_on: Option<&str>,
    ) -> Result<String> {
        let task = AsanaTaskCreate {
            name: name.to_string(),
            notes: notes.map(|s| s.to_string()),
            projects: project_id.map(|id| vec![id.to_string()]),
            assignee: assignee_id.map(|s| s.to_string()),
            due_on: due_on.map(|s| s.to_string()),
            workspace: workspace_id.map(|s| s.to_string()),
        };

        let body = serde_json::json!({ "data": task });

        let response = self
            .client
            .post(format!("{}/tasks", ASANA_BASE_URL))
            .bearer_auth(&self.token)
            .json(&body)
            .send()
            .await
            .map_err(|e| Error::from(e))?;

        if response.status().is_success() {
            let data: AsanaResponse<AsanaTask> = response
                .json()
                .await
                .map_err(|e| Error::Http(e.to_string()))?;
            Ok(data.data.gid)
        } else {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            Err(Error::Provider(format!(
                "Failed to create Asana task ({}): {}",
                status, error_text
            )))
        }
    }

    /// Assign a task to a user
    pub async fn assign_task(&self, task_id: &str, assignee_id: &str) -> Result<()> {
        let body = serde_json::json!({
            "data": {
                "assignee": assignee_id
            }
        });

        let response = self
            .client
            .put(format!("{}/tasks/{}", ASANA_BASE_URL, task_id))
            .bearer_auth(&self.token)
            .json(&body)
            .send()
            .await
            .map_err(|e| Error::from(e))?;

        if response.status().is_success() {
            Ok(())
        } else {
            Err(Error::Provider(format!(
                "Failed to assign Asana task: {}",
                response.status()
            )))
        }
    }

    /// Mark a task as complete
    pub async fn mark_task_complete(&self, task_id: &str, completed: bool) -> Result<()> {
        let body = serde_json::json!({
            "data": {
                "completed": completed
            }
        });

        let response = self
            .client
            .put(format!("{}/tasks/{}", ASANA_BASE_URL, task_id))
            .bearer_auth(&self.token)
            .json(&body)
            .send()
            .await
            .map_err(|e| Error::from(e))?;

        if response.status().is_success() {
            Ok(())
        } else {
            Err(Error::Provider(format!(
                "Failed to update Asana task: {}",
                response.status()
            )))
        }
    }

    /// Get a specific task
    pub async fn get_task_raw(&self, task_id: &str) -> Result<AsanaTask> {
        let response = self
            .client
            .get(format!(
                "{}/tasks/{}?opt_fields=name,notes,completed,due_on,due_at,assignee,projects,tags,created_at,modified_at,permalink_url",
                ASANA_BASE_URL, task_id
            ))
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(|e| Error::from(e))?;

        if response.status().is_success() {
            let data: AsanaResponse<AsanaTask> = response
                .json()
                .await
                .map_err(|e| Error::Http(e.to_string()))?;
            Ok(data.data)
        } else {
            Err(Error::Provider(format!(
                "Failed to get Asana task: {}",
                response.status()
            )))
        }
    }

    /// Convert Asana task to unified Task
    pub fn asana_task_to_task(&self, task: &AsanaTask) -> Task {
        let status = TaskStatus::from_asana_status(task.completed);

        let due_date = task
            .due_at
            .as_ref()
            .or(task.due_on.as_ref())
            .and_then(|d| DateTime::parse_from_rfc3339(d).ok())
            .map(|dt| dt.with_timezone(&Utc));

        let assignee = task.assignee.as_ref().map(|a| a.name.clone());

        let tags = task
            .tags
            .as_ref()
            .map(|tags| tags.iter().map(|t| t.name.clone()).collect())
            .unwrap_or_default();

        let (project_id, project_name) = task
            .projects
            .as_ref()
            .and_then(|projects| projects.first())
            .map(|p| (Some(p.gid.clone()), Some(p.name.clone())))
            .unwrap_or((None, None));

        let created_at = DateTime::parse_from_rfc3339(&task.created_at)
            .ok()
            .map(|dt| dt.with_timezone(&Utc));

        let updated_at = DateTime::parse_from_rfc3339(&task.modified_at)
            .ok()
            .map(|dt| dt.with_timezone(&Utc));

        Task {
            id: task.gid.clone(),
            title: task.name.clone(),
            description: task.notes.clone(),
            status,
            due_date,
            assignee,
            priority: None,
            tags,
            url: Some(task.permalink_url.clone()),
            project_id,
            project_name,
            created_at,
            updated_at,
        }
    }
}

#[async_trait::async_trait]
impl UnifiedTaskProvider for AsanaClient {
    async fn list_tasks(&self) -> Result<Vec<Task>> {
        let workspaces = self.list_workspaces().await?;
        let mut all_tasks = Vec::new();

        for workspace in workspaces {
            let projects = self.list_projects(&workspace.gid).await?;
            for project in projects {
                let tasks = self.list_project_tasks(&project.gid).await?;
                for task in tasks {
                    all_tasks.push(self.asana_task_to_task(&task));
                }
            }
        }

        Ok(all_tasks)
    }

    async fn create_task(&self, task: Task) -> Result<String> {
        // Get first workspace if project_id not specified
        let workspace_id = if task.project_id.is_none() {
            let workspaces = self.list_workspaces().await?;
            workspaces
                .first()
                .map(|w| w.gid.clone())
                .ok_or_else(|| Error::Provider("No workspaces found".to_string()))?
        } else {
            // If project_id is provided, we still need the workspace
            // For simplicity, get the first workspace
            let workspaces = self.list_workspaces().await?;
            workspaces
                .first()
                .map(|w| w.gid.clone())
                .ok_or_else(|| Error::Provider("No workspaces found".to_string()))?
        };

        let due_on = task.due_date.map(|d| d.format("%Y-%m-%d").to_string());

        self.create_task_raw(
            &task.title,
            task.description.as_deref(),
            Some(&workspace_id),
            task.project_id.as_deref(),
            task.assignee.as_deref(),
            due_on.as_deref(),
        )
        .await
    }

    async fn update_task(&self, task: Task) -> Result<()> {
        let completed = task.status == TaskStatus::Completed;
        self.mark_task_complete(&task.id, completed).await?;

        if let Some(assignee) = task.assignee {
            self.assign_task(&task.id, &assignee).await?;
        }

        Ok(())
    }

    async fn delete_task(&self, task_id: &str) -> Result<()> {
        let response = self
            .client
            .delete(format!("{}/tasks/{}", ASANA_BASE_URL, task_id))
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(|e| Error::from(e))?;

        if response.status().is_success() {
            Ok(())
        } else {
            Err(Error::Provider(format!(
                "Failed to delete Asana task: {}",
                response.status()
            )))
        }
    }

    async fn get_task(&self, task_id: &str) -> Result<Task> {
        let asana_task = self.get_task_raw(task_id).await?;
        Ok(self.asana_task_to_task(&asana_task))
    }
}
