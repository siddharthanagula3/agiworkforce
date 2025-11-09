use crate::error::{Error, Result};
use crate::productivity::unified_task::{Task, TaskStatus, UnifiedTaskProvider};
use chrono::{DateTime, Utc};
use reqwest::{header, Client};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Semaphore;
use tokio::time::sleep;

const NOTION_API_VERSION: &str = "2022-06-28";
const NOTION_BASE_URL: &str = "https://api.notion.com/v1";
const MAX_REQUESTS_PER_SECOND: usize = 3;

/// Rate limiter for Notion API (max 3 req/sec)
struct RateLimiter {
    semaphore: Arc<Semaphore>,
}

impl RateLimiter {
    fn new(max_concurrent: usize) -> Self {
        Self {
            semaphore: Arc::new(Semaphore::new(max_concurrent)),
        }
    }

    async fn acquire(&self) -> tokio::sync::SemaphorePermit<'_> {
        self.semaphore.acquire().await.expect("Semaphore closed")
    }

    async fn wait_for_rate_limit(&self) {
        // Wait 350ms to ensure we don't exceed 3 req/sec
        sleep(Duration::from_millis(350)).await;
    }
}

/// Notion API client with OAuth2 or integration token support
pub struct NotionClient {
    client: Client,
    token: String,
    rate_limiter: RateLimiter,
}

#[derive(Debug, Serialize, Deserialize)]
struct NotionUser {
    id: String,
    name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NotionPage {
    id: String,
    properties: serde_json::Value,
    url: String,
    created_time: String,
    last_edited_time: String,
}

// NotionRichText struct - will be used when Notion API integration is complete
#[derive(Debug, Serialize, Deserialize)]
#[allow(dead_code)]
struct NotionRichText {
    plain_text: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct NotionListResponse<T> {
    results: Vec<T>,
    has_more: bool,
    next_cursor: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct NotionDatabaseQuery {
    filter: Option<serde_json::Value>,
    sorts: Option<Vec<serde_json::Value>>,
}

impl NotionClient {
    /// Create a new Notion client with an integration token or OAuth access token
    pub fn new(token: String) -> Self {
        let mut headers = header::HeaderMap::new();
        headers.insert(
            "Notion-Version",
            header::HeaderValue::from_static(NOTION_API_VERSION),
        );

        let client = Client::builder()
            .default_headers(headers)
            .timeout(Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            token,
            rate_limiter: RateLimiter::new(MAX_REQUESTS_PER_SECOND),
        }
    }

    /// Verify connection and get user info
    pub async fn verify_connection(&mut self) -> Result<String> {
        let _permit = self.rate_limiter.acquire().await;

        let response = self
            .client
            .get(format!("{}/users/me", NOTION_BASE_URL))
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(Error::Http)?;

        self.rate_limiter.wait_for_rate_limit().await;

        if response.status().is_success() {
            let user: NotionUser = response.json().await.map_err(Error::Http)?;
            Ok(user.id)
        } else {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            Err(Error::Provider(format!(
                "Notion API error ({}): {}",
                status, error_text
            )))
        }
    }

    /// List all pages in workspace (limited to 100)
    pub async fn list_pages(&self) -> Result<Vec<NotionPage>> {
        let _permit = self.rate_limiter.acquire().await;

        let response = self
            .client
            .post(format!("{}/search", NOTION_BASE_URL))
            .bearer_auth(&self.token)
            .json(&serde_json::json!({
                "filter": {
                    "property": "object",
                    "value": "page"
                },
                "page_size": 100
            }))
            .send()
            .await
            .map_err(Error::Http)?;

        self.rate_limiter.wait_for_rate_limit().await;

        if response.status().is_success() {
            let data: NotionListResponse<NotionPage> =
                response.json().await.map_err(Error::Http)?;
            Ok(data.results)
        } else {
            Err(Error::Provider(format!(
                "Failed to list Notion pages: {}",
                response.status()
            )))
        }
    }

    /// Get page content (blocks)
    pub async fn get_page_content(&self, page_id: &str) -> Result<serde_json::Value> {
        let _permit = self.rate_limiter.acquire().await;

        let response = self
            .client
            .get(format!("{}/blocks/{}/children", NOTION_BASE_URL, page_id))
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(Error::Http)?;

        self.rate_limiter.wait_for_rate_limit().await;

        if response.status().is_success() {
            let data = response.json().await.map_err(Error::Http)?;
            Ok(data)
        } else {
            Err(Error::Provider(format!(
                "Failed to get Notion page content: {}",
                response.status()
            )))
        }
    }

    /// Create a new page in a parent page or database
    pub async fn create_page(
        &self,
        parent_id: &str,
        title: &str,
        properties: Option<serde_json::Value>,
    ) -> Result<String> {
        let _permit = self.rate_limiter.acquire().await;

        let mut body = serde_json::json!({
            "parent": { "page_id": parent_id },
            "properties": {
                "title": {
                    "title": [
                        {
                            "text": { "content": title }
                        }
                    ]
                }
            }
        });

        if let Some(props) = properties {
            if let Some(obj) = body.get_mut("properties") {
                if let Some(obj) = obj.as_object_mut() {
                    if let Some(props_obj) = props.as_object() {
                        for (key, value) in props_obj {
                            obj.insert(key.clone(), value.clone());
                        }
                    }
                }
            }
        }

        let response = self
            .client
            .post(format!("{}/pages", NOTION_BASE_URL))
            .bearer_auth(&self.token)
            .json(&body)
            .send()
            .await
            .map_err(Error::Http)?;

        self.rate_limiter.wait_for_rate_limit().await;

        if response.status().is_success() {
            let page: NotionPage = response.json().await.map_err(Error::Http)?;
            Ok(page.id)
        } else {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            Err(Error::Provider(format!(
                "Failed to create Notion page ({}): {}",
                status, error_text
            )))
        }
    }

    /// Query a database with filters and sorting
    pub async fn query_database(
        &self,
        database_id: &str,
        filter: Option<serde_json::Value>,
        sorts: Option<Vec<serde_json::Value>>,
    ) -> Result<Vec<serde_json::Value>> {
        let _permit = self.rate_limiter.acquire().await;

        let query = NotionDatabaseQuery { filter, sorts };

        let response = self
            .client
            .post(format!(
                "{}/databases/{}/query",
                NOTION_BASE_URL, database_id
            ))
            .bearer_auth(&self.token)
            .json(&query)
            .send()
            .await
            .map_err(Error::Http)?;

        self.rate_limiter.wait_for_rate_limit().await;

        if response.status().is_success() {
            let data: NotionListResponse<serde_json::Value> =
                response.json().await.map_err(Error::Http)?;
            Ok(data.results)
        } else {
            Err(Error::Provider(format!(
                "Failed to query Notion database: {}",
                response.status()
            )))
        }
    }

    /// Create a new row in a database
    pub async fn create_database_row(
        &self,
        database_id: &str,
        properties: serde_json::Value,
    ) -> Result<String> {
        let _permit = self.rate_limiter.acquire().await;

        let body = serde_json::json!({
            "parent": { "database_id": database_id },
            "properties": properties
        });

        let response = self
            .client
            .post(format!("{}/pages", NOTION_BASE_URL))
            .bearer_auth(&self.token)
            .json(&body)
            .send()
            .await
            .map_err(Error::Http)?;

        self.rate_limiter.wait_for_rate_limit().await;

        if response.status().is_success() {
            let page: NotionPage = response.json().await.map_err(Error::Http)?;
            Ok(page.id)
        } else {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            Err(Error::Provider(format!(
                "Failed to create Notion database row ({}): {}",
                status, error_text
            )))
        }
    }

    /// Extract title from Notion page properties
    fn extract_title(properties: &serde_json::Value) -> String {
        properties
            .as_object()
            .and_then(|props| {
                props.values().find_map(|prop| {
                    prop.get("title")
                        .and_then(|title| title.as_array())
                        .and_then(|arr| arr.first())
                        .and_then(|item| item.get("plain_text"))
                        .and_then(|text| text.as_str())
                        .map(|s| s.to_string())
                })
            })
            .unwrap_or_else(|| "Untitled".to_string())
    }

    /// Extract status from Notion page properties
    fn extract_status(properties: &serde_json::Value) -> TaskStatus {
        properties
            .as_object()
            .and_then(|props| props.get("Status").or_else(|| props.get("status")))
            .and_then(|status_prop| {
                status_prop
                    .get("status")
                    .or_else(|| status_prop.get("select"))
                    .and_then(|status| status.get("name"))
                    .and_then(|name| name.as_str())
            })
            .map(TaskStatus::from_notion_status)
            .unwrap_or(TaskStatus::Todo)
    }

    /// Convert Notion page to unified Task
    fn page_to_task(&self, page: &serde_json::Value) -> Option<Task> {
        let id = page.get("id")?.as_str()?.to_string();
        let properties = page.get("properties")?;
        let title = Self::extract_title(properties);
        let status = Self::extract_status(properties);
        let url = page.get("url")?.as_str().map(|s| s.to_string());

        let created_at = page
            .get("created_time")
            .and_then(|t| t.as_str())
            .and_then(|t| DateTime::parse_from_rfc3339(t).ok())
            .map(|dt| dt.with_timezone(&Utc));

        let updated_at = page
            .get("last_edited_time")
            .and_then(|t| t.as_str())
            .and_then(|t| DateTime::parse_from_rfc3339(t).ok())
            .map(|dt| dt.with_timezone(&Utc));

        Some(Task {
            id,
            title,
            description: None,
            status,
            due_date: None,
            assignee: None,
            priority: None,
            tags: Vec::new(),
            url,
            project_id: None,
            project_name: None,
            created_at,
            updated_at,
        })
    }
}

#[async_trait::async_trait]
impl UnifiedTaskProvider for NotionClient {
    async fn list_tasks(&self) -> Result<Vec<Task>> {
        let pages = self.list_pages().await?;
        let tasks = pages
            .iter()
            .filter_map(|page| {
                let page_json = serde_json::to_value(page).ok()?;
                self.page_to_task(&page_json)
            })
            .collect();
        Ok(tasks)
    }

    async fn create_task(&self, _task: Task) -> Result<String> {
        // This is a simplified implementation
        // In a real scenario, you'd need a target database_id
        Err(Error::Provider(
            "Creating tasks requires a database_id. Use create_database_row instead.".to_string(),
        ))
    }

    async fn update_task(&self, _task: Task) -> Result<()> {
        Err(Error::Provider("Not yet implemented".to_string()))
    }

    async fn delete_task(&self, _task_id: &str) -> Result<()> {
        Err(Error::Provider("Not yet implemented".to_string()))
    }

    async fn get_task(&self, page_id: &str) -> Result<Task> {
        let _permit = self.rate_limiter.acquire().await;

        let response = self
            .client
            .get(format!("{}/pages/{}", NOTION_BASE_URL, page_id))
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(Error::Http)?;

        self.rate_limiter.wait_for_rate_limit().await;

        if response.status().is_success() {
            let page: serde_json::Value = response.json().await.map_err(Error::Http)?;
            self.page_to_task(&page)
                .ok_or_else(|| Error::Provider("Failed to parse Notion page".to_string()))
        } else {
            Err(Error::Provider(format!(
                "Failed to get Notion page: {}",
                response.status()
            )))
        }
    }
}
