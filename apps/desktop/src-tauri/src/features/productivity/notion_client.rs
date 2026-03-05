use crate::features::productivity::unified_task::{Task, TaskStatus, UnifiedTaskProvider};
use crate::sys::error::{Error, Result};
use chrono::{DateTime, Utc};
use reqwest::{header, Client};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Semaphore;
use tokio::time::sleep;

const NOTION_API_VERSION: &str = "2025-12-01";
const NOTION_BASE_URL: &str = "https://api.notion.com/v1";

const MAX_REQUESTS_PER_SECOND: usize = 3;

/// IMP-001 fix: Configurable rate limit delay between requests (in milliseconds).
/// Notion's rate limit is 3 requests/second for most endpoints.
/// Default: 350ms provides safety margin below 333ms (1000ms / 3).
/// Can be overridden via NOTION_RATE_LIMIT_DELAY_MS env var.
fn get_rate_limit_delay_ms() -> u64 {
    std::env::var("NOTION_RATE_LIMIT_DELAY_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(350)
}

struct RateLimiter {
    semaphore: Arc<Semaphore>,
}

impl RateLimiter {
    fn new(max_concurrent: usize) -> Self {
        Self {
            semaphore: Arc::new(Semaphore::new(max_concurrent)),
        }
    }

    async fn acquire(&self) -> Result<tokio::sync::SemaphorePermit<'_>> {
        self.semaphore
            .acquire()
            .await
            .map_err(|_| Error::Other("Semaphore closed".to_string()))
    }

    /// IMP-001 fix: Use configurable delay instead of hard-coded 350ms
    async fn wait_for_rate_limit(&self) {
        sleep(Duration::from_millis(get_rate_limit_delay_ms())).await;
    }
}

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
    pub fn new(token: String) -> Result<Self> {
        let mut headers = header::HeaderMap::new();
        headers.insert(
            "Notion-Version",
            header::HeaderValue::from_static(NOTION_API_VERSION),
        );

        let client = Client::builder()
            .default_headers(headers)
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| Error::Other(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self {
            client,
            token,
            rate_limiter: RateLimiter::new(MAX_REQUESTS_PER_SECOND),
        })
    }

    pub async fn verify_connection(&mut self) -> Result<String> {
        let _permit = self.rate_limiter.acquire().await?;

        let response = self
            .client
            .get(format!("{}/users/me", NOTION_BASE_URL))
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(Error::from)?;

        self.rate_limiter.wait_for_rate_limit().await;

        if response.status().is_success() {
            let user: NotionUser = response.json().await.map_err(Error::from)?;
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

    /// INC-002 fix: Add pagination support using has_more and next_cursor
    /// This ensures we get all pages, not just the first 100
    pub async fn list_pages(&self) -> Result<Vec<NotionPage>> {
        let mut all_pages = Vec::new();
        let mut next_cursor: Option<String> = None;
        const MAX_PAGES_TO_FETCH: usize = 10; // Safety limit: 10 * 100 = 1000 max items
        let mut page_count = 0;

        loop {
            let _permit = self.rate_limiter.acquire().await?;

            let mut request_body = serde_json::json!({
                "filter": {
                    "property": "object",
                    "value": "page"
                },
                "page_size": 100
            });

            // Add cursor for pagination if we have one
            if let Some(cursor) = &next_cursor {
                request_body["start_cursor"] = serde_json::Value::String(cursor.clone());
            }

            let response = self
                .client
                .post(format!("{}/search", NOTION_BASE_URL))
                .bearer_auth(&self.token)
                .json(&request_body)
                .send()
                .await
                .map_err(Error::from)?;

            self.rate_limiter.wait_for_rate_limit().await;

            if response.status().is_success() {
                let data: NotionListResponse<NotionPage> =
                    response.json().await.map_err(Error::from)?;

                all_pages.extend(data.results);
                page_count += 1;

                // Check if there are more pages and we haven't hit our safety limit
                if data.has_more && page_count < MAX_PAGES_TO_FETCH {
                    next_cursor = data.next_cursor;
                } else {
                    break;
                }
            } else {
                return Err(Error::Provider(format!(
                    "Failed to list Notion pages: {}",
                    response.status()
                )));
            }
        }

        Ok(all_pages)
    }

    pub async fn get_page_content(&self, page_id: &str) -> Result<serde_json::Value> {
        let _permit = self.rate_limiter.acquire().await;

        let response = self
            .client
            .get(format!("{}/blocks/{}/children", NOTION_BASE_URL, page_id))
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(Error::from)?;

        self.rate_limiter.wait_for_rate_limit().await;

        if response.status().is_success() {
            let data = response.json().await.map_err(Error::from)?;
            Ok(data)
        } else {
            Err(Error::Provider(format!(
                "Failed to get Notion page content: {}",
                response.status()
            )))
        }
    }

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
            .map_err(Error::from)?;

        self.rate_limiter.wait_for_rate_limit().await;

        if response.status().is_success() {
            let page: NotionPage = response.json().await.map_err(Error::from)?;
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
            .map_err(Error::from)?;

        self.rate_limiter.wait_for_rate_limit().await;

        if response.status().is_success() {
            let data: NotionListResponse<serde_json::Value> =
                response.json().await.map_err(Error::from)?;
            Ok(data.results)
        } else {
            Err(Error::Provider(format!(
                "Failed to query Notion database: {}",
                response.status()
            )))
        }
    }

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
            .map_err(Error::from)?;

        self.rate_limiter.wait_for_rate_limit().await;

        if response.status().is_success() {
            let page: NotionPage = response.json().await.map_err(Error::from)?;
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

    /// FIX-003: Try multiple common property names for status field
    /// Notion databases can use different property names for status
    fn extract_status(properties: &serde_json::Value) -> TaskStatus {
        // Common status property names in different languages and conventions
        const STATUS_PROPERTY_NAMES: &[&str] = &[
            "Status", "status", "Estado",  // Spanish
            "Statut",  // French
            "État",    // French
            "Stato",   // Italian
            "Zustand", // German
            "State", "state", "Progress", "progress", "Stage", "stage", "Phase", "phase",
            "Workflow", "workflow",
        ];

        let props = match properties.as_object() {
            Some(p) => p,
            None => return TaskStatus::Todo,
        };

        // Try each potential status property name
        for name in STATUS_PROPERTY_NAMES {
            if let Some(status_prop) = props.get(*name) {
                // Try to extract status value from different Notion property types
                let status_value = status_prop
                    .get("status")
                    .or_else(|| status_prop.get("select"))
                    .or_else(|| {
                        status_prop
                            .get("multi_select")
                            .and_then(|ms| ms.as_array()?.first())
                    })
                    .and_then(|s| s.get("name"))
                    .and_then(|n| n.as_str());

                if let Some(value) = status_value {
                    return TaskStatus::from_notion_status(value);
                }
            }
        }

        // If no status property found, try to find any property with "status" type
        for (_key, prop) in props {
            if let Some(prop_type) = prop.get("type").and_then(|t| t.as_str()) {
                if prop_type == "status" {
                    if let Some(status_name) = prop
                        .get("status")
                        .and_then(|s| s.get("name"))
                        .and_then(|n| n.as_str())
                    {
                        return TaskStatus::from_notion_status(status_name);
                    }
                }
            }
        }

        TaskStatus::Todo
    }

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
            // FIX-005: Notion people properties could be extracted here if needed
            assignee: None,
            assignee_name: None,
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
        Err(Error::Provider(
            "Creating tasks requires a database_id. Use create_database_row instead.".to_string(),
        ))
    }

    /// INC-001 fix: Implement Notion update operation using PATCH /pages/{id}
    async fn update_task(&self, task: Task) -> Result<()> {
        let _permit = self.rate_limiter.acquire().await?;

        // Build properties object for update
        let mut properties = serde_json::json!({});

        // Update title if present
        if !task.title.is_empty() {
            properties["Name"] = serde_json::json!({
                "title": [{
                    "text": { "content": task.title }
                }]
            });
        }

        // Update status if we can map it
        let status_name = task.status.to_notion_status();
        properties["Status"] = serde_json::json!({
            "status": { "name": status_name }
        });

        let body = serde_json::json!({
            "properties": properties
        });

        let response = self
            .client
            .patch(format!("{}/pages/{}", NOTION_BASE_URL, task.id))
            .bearer_auth(&self.token)
            .json(&body)
            .send()
            .await
            .map_err(Error::from)?;

        self.rate_limiter.wait_for_rate_limit().await;

        if response.status().is_success() {
            Ok(())
        } else {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            Err(Error::Provider(format!(
                "Failed to update Notion page ({}): {}",
                status, error_text
            )))
        }
    }

    /// INC-001 fix: Implement Notion delete operation by archiving the page
    /// Note: Notion API doesn't support permanent deletion, pages are archived instead
    async fn delete_task(&self, task_id: &str) -> Result<()> {
        let _permit = self.rate_limiter.acquire().await?;

        // Archive the page (Notion's equivalent of soft delete)
        let body = serde_json::json!({
            "archived": true
        });

        let response = self
            .client
            .patch(format!("{}/pages/{}", NOTION_BASE_URL, task_id))
            .bearer_auth(&self.token)
            .json(&body)
            .send()
            .await
            .map_err(Error::from)?;

        self.rate_limiter.wait_for_rate_limit().await;

        if response.status().is_success() {
            Ok(())
        } else {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            Err(Error::Provider(format!(
                "Failed to archive Notion page ({}): {}",
                status, error_text
            )))
        }
    }

    async fn get_task(&self, page_id: &str) -> Result<Task> {
        let _permit = self.rate_limiter.acquire().await;

        let response = self
            .client
            .get(format!("{}/pages/{}", NOTION_BASE_URL, page_id))
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(Error::from)?;

        self.rate_limiter.wait_for_rate_limit().await;

        if response.status().is_success() {
            let page: serde_json::Value = response.json().await.map_err(Error::from)?;
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
