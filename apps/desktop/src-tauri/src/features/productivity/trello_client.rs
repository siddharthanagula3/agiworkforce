use crate::features::productivity::unified_task::{Task, TaskStatus, UnifiedTaskProvider};
use crate::sys::error::{Error, Result};
use chrono::{DateTime, Utc};
use parking_lot::Mutex;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Arc;
use std::time::{Duration, Instant};

const TRELLO_BASE_URL: &str = "https://api.trello.com/1";

/// FIX-004: URL-encode a path segment to prevent issues with special characters
/// While Trello IDs are typically alphanumeric, user-provided values (like list names)
/// could contain special characters that need encoding
fn encode_path_segment(segment: &str) -> String {
    // Percent-encode characters that are not unreserved according to RFC 3986
    segment
        .chars()
        .map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            _ => format!("%{:02X}", c as u8),
        })
        .collect()
}

/// RTL-001 fix: Sliding window rate limiter for Trello API
/// Trello allows 10 requests per 10 seconds per token
struct TrelloRateLimiter {
    /// Timestamps of recent requests
    request_times: Arc<Mutex<VecDeque<Instant>>>,
    /// Maximum requests allowed in the window
    max_requests: usize,
    /// Time window duration
    window_duration: Duration,
}

impl TrelloRateLimiter {
    fn new() -> Self {
        Self {
            request_times: Arc::new(Mutex::new(VecDeque::with_capacity(10))),
            max_requests: 10,
            window_duration: Duration::from_secs(10),
        }
    }

    /// Wait if necessary to respect rate limits, then record the request
    async fn acquire(&self) {
        loop {
            let should_wait = {
                let mut times = self.request_times.lock();
                let now = Instant::now();

                // Remove expired timestamps outside the window
                while let Some(front) = times.front() {
                    if now.duration_since(*front) > self.window_duration {
                        times.pop_front();
                    } else {
                        break;
                    }
                }

                // Check if we're at the limit
                if times.len() >= self.max_requests {
                    // Calculate how long to wait until the oldest request expires
                    if let Some(oldest) = times.front() {
                        let wait_time = self
                            .window_duration
                            .saturating_sub(now.duration_since(*oldest));
                        if wait_time > Duration::ZERO {
                            Some(wait_time)
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                } else {
                    // We have capacity, record this request
                    times.push_back(now);
                    None
                }
            };

            if let Some(wait_duration) = should_wait {
                tokio::time::sleep(wait_duration + Duration::from_millis(50)).await;
            } else {
                break;
            }
        }
    }
}

pub struct TrelloClient {
    client: Client,
    api_key: String,
    token: String,
    /// RTL-001: Rate limiter for Trello API
    rate_limiter: TrelloRateLimiter,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TrelloBoard {
    id: String,
    name: String,
    url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TrelloList {
    id: String,
    name: String,
    #[serde(rename = "idBoard")]
    board_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TrelloCard {
    id: String,
    name: String,
    desc: String,
    #[serde(rename = "idList")]
    list_id: String,
    #[serde(rename = "idBoard")]
    board_id: String,
    url: String,
    due: Option<String>,
    #[serde(rename = "dateLastActivity")]
    date_last_activity: String,
    labels: Vec<TrelloLabel>,
}

#[derive(Debug, Serialize, Deserialize)]
struct TrelloLabel {
    name: String,
    color: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct TrelloMember {
    id: String,
    #[serde(rename = "fullName")]
    full_name: String,
    username: String,
}

impl TrelloClient {
    pub fn new(api_key: String, token: String) -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| Error::Other(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self {
            client,
            api_key,
            token,
            rate_limiter: TrelloRateLimiter::new(),
        })
    }

    /// Build URL without credentials (SEC-002 fix)
    fn build_url(&self, endpoint: &str) -> String {
        format!("{}{}", TRELLO_BASE_URL, endpoint)
    }

    /// FIX-004: Build URL with properly encoded path segment
    fn build_url_with_id(&self, template: &str, id: &str) -> String {
        let encoded_id = encode_path_segment(id);
        format!(
            "{}{}",
            TRELLO_BASE_URL,
            template.replace("{id}", &encoded_id)
        )
    }

    /// Get the Authorization header value for Trello API
    /// Uses OAuth format as supported by Trello's API (SEC-002 fix)
    fn auth_header(&self) -> String {
        format!(
            "OAuth oauth_consumer_key=\"{}\", oauth_token=\"{}\"",
            self.api_key, self.token
        )
    }

    pub async fn verify_connection(&mut self) -> Result<String> {
        self.rate_limiter.acquire().await;
        let url = self.build_url("/members/me");

        let response = self
            .client
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(Error::from)?;

        if response.status().is_success() {
            let member: TrelloMember = response.json().await.map_err(Error::from)?;
            Ok(member.id)
        } else {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            Err(Error::Provider(format!(
                "Trello API error ({}): {}",
                status, error_text
            )))
        }
    }

    pub async fn list_boards(&self) -> Result<Vec<TrelloBoard>> {
        self.rate_limiter.acquire().await;
        let url = self.build_url("/members/me/boards");

        let response = self
            .client
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(Error::from)?;

        if response.status().is_success() {
            let boards: Vec<TrelloBoard> = response.json().await.map_err(Error::from)?;
            Ok(boards)
        } else {
            Err(Error::Provider(format!(
                "Failed to list Trello boards: {}",
                response.status()
            )))
        }
    }

    pub async fn list_board_lists(&self, board_id: &str) -> Result<Vec<TrelloList>> {
        self.rate_limiter.acquire().await;
        let url = self.build_url_with_id("/boards/{id}/lists", board_id);

        let response = self
            .client
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(Error::from)?;

        if response.status().is_success() {
            let lists: Vec<TrelloList> = response.json().await.map_err(Error::from)?;
            Ok(lists)
        } else {
            Err(Error::Provider(format!(
                "Failed to list Trello board lists: {}",
                response.status()
            )))
        }
    }

    pub async fn list_board_cards(&self, board_id: &str) -> Result<Vec<TrelloCard>> {
        self.rate_limiter.acquire().await;
        let url = self.build_url_with_id("/boards/{id}/cards", board_id);

        let response = self
            .client
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(Error::from)?;

        if response.status().is_success() {
            let cards: Vec<TrelloCard> = response.json().await.map_err(Error::from)?;
            Ok(cards)
        } else {
            Err(Error::Provider(format!(
                "Failed to list Trello cards: {}",
                response.status()
            )))
        }
    }

    pub async fn list_list_cards(&self, list_id: &str) -> Result<Vec<TrelloCard>> {
        self.rate_limiter.acquire().await;
        let url = self.build_url_with_id("/lists/{id}/cards", list_id);

        let response = self
            .client
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(Error::from)?;

        if response.status().is_success() {
            let cards: Vec<TrelloCard> = response.json().await.map_err(Error::from)?;
            Ok(cards)
        } else {
            Err(Error::Provider(format!(
                "Failed to list Trello list cards: {}",
                response.status()
            )))
        }
    }

    pub async fn create_card(
        &self,
        list_id: &str,
        name: &str,
        description: Option<&str>,
        due: Option<DateTime<Utc>>,
    ) -> Result<String> {
        self.rate_limiter.acquire().await;
        let url = self.build_url("/cards");

        // Use JSON body instead of URL params for security (SEC-002 fix)
        let mut body = serde_json::json!({
            "idList": list_id,
            "name": name
        });

        if let Some(desc) = description {
            body["desc"] = serde_json::Value::String(desc.to_string());
        }

        if let Some(due_date) = due {
            body["due"] = serde_json::Value::String(due_date.to_rfc3339());
        }

        let response = self
            .client
            .post(&url)
            .header("Authorization", self.auth_header())
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(Error::from)?;

        if response.status().is_success() {
            let card: TrelloCard = response.json().await.map_err(Error::from)?;
            Ok(card.id)
        } else {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            Err(Error::Provider(format!(
                "Failed to create Trello card ({}): {}",
                status, error_text
            )))
        }
    }

    pub async fn move_card(&self, card_id: &str, list_id: &str) -> Result<()> {
        self.rate_limiter.acquire().await;
        let url = self.build_url_with_id("/cards/{id}", card_id);

        // Use JSON body instead of URL params for security (SEC-002 fix)
        let body = serde_json::json!({
            "idList": list_id
        });

        let response = self
            .client
            .put(&url)
            .header("Authorization", self.auth_header())
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(Error::from)?;

        if response.status().is_success() {
            Ok(())
        } else {
            Err(Error::Provider(format!(
                "Failed to move Trello card: {}",
                response.status()
            )))
        }
    }

    pub async fn add_comment(&self, card_id: &str, text: &str) -> Result<String> {
        self.rate_limiter.acquire().await;
        let url = self.build_url_with_id("/cards/{id}/actions/comments", card_id);

        // Use JSON body instead of URL params for security (SEC-002 fix)
        let body = serde_json::json!({
            "text": text
        });

        let response = self
            .client
            .post(&url)
            .header("Authorization", self.auth_header())
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(Error::from)?;

        if response.status().is_success() {
            let comment: serde_json::Value = response.json().await.map_err(Error::from)?;
            let comment_id = comment
                .get("id")
                .and_then(|id| id.as_str())
                .unwrap_or("")
                .to_string();
            Ok(comment_id)
        } else {
            Err(Error::Provider(format!(
                "Failed to add comment to Trello card: {}",
                response.status()
            )))
        }
    }

    async fn get_list_name(&self, list_id: &str) -> Result<String> {
        self.rate_limiter.acquire().await;
        let url = self.build_url_with_id("/lists/{id}", list_id);

        let response = self
            .client
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(Error::from)?;

        if response.status().is_success() {
            let list: TrelloList = response.json().await.map_err(Error::from)?;
            Ok(list.name)
        } else {
            Ok("Unknown".to_string())
        }
    }

    pub async fn card_to_task(&self, card: &TrelloCard) -> Task {
        let list_name = self.get_list_name(&card.list_id).await.unwrap_or_default();
        let status = TaskStatus::from_trello_list(&list_name);

        let due_date = card
            .due
            .as_ref()
            .and_then(|d| DateTime::parse_from_rfc3339(d).ok())
            .map(|dt| dt.with_timezone(&Utc));

        let updated_at = DateTime::parse_from_rfc3339(&card.date_last_activity)
            .ok()
            .map(|dt| dt.with_timezone(&Utc));

        let tags = card.labels.iter().map(|l| l.name.clone()).collect();

        Task {
            id: card.id.clone(),
            title: card.name.clone(),
            description: if card.desc.is_empty() {
                None
            } else {
                Some(card.desc.clone())
            },
            status,
            due_date,
            // FIX-005: Trello doesn't populate assignees in basic card fetch
            assignee: None,
            assignee_name: None,
            priority: None,
            tags,
            url: Some(card.url.clone()),
            project_id: Some(card.board_id.clone()),
            project_name: None,
            created_at: None,
            updated_at,
        }
    }
}

#[async_trait::async_trait]
impl UnifiedTaskProvider for TrelloClient {
    async fn list_tasks(&self) -> Result<Vec<Task>> {
        let boards = self.list_boards().await?;
        let mut all_tasks = Vec::new();

        for board in boards {
            let cards = self.list_board_cards(&board.id).await?;
            for card in cards {
                let mut task = self.card_to_task(&card).await;
                task.project_name = Some(board.name.clone());
                all_tasks.push(task);
            }
        }

        Ok(all_tasks)
    }

    async fn create_task(&self, task: Task) -> Result<String> {
        let board_id = task
            .project_id
            .ok_or_else(|| Error::Config("Board ID required for Trello task".to_string()))?;

        let lists = self.list_board_lists(&board_id).await?;
        let list_id = lists
            .first()
            .ok_or_else(|| Error::Provider("No lists found in board".to_string()))?
            .id
            .clone();

        self.create_card(
            &list_id,
            &task.title,
            task.description.as_deref(),
            task.due_date,
        )
        .await
    }

    async fn update_task(&self, task: Task) -> Result<()> {
        let boards = self.list_boards().await?;
        if let Some(board) = boards.first() {
            let lists = self.list_board_lists(&board.id).await?;
            let target_list_name = task.status.to_trello_list_name();

            if let Some(target_list) = lists.iter().find(|l| {
                l.name
                    .to_lowercase()
                    .contains(&target_list_name.to_lowercase())
            }) {
                self.move_card(&task.id, &target_list.id).await?;
            }
        }
        Ok(())
    }

    async fn delete_task(&self, card_id: &str) -> Result<()> {
        self.rate_limiter.acquire().await;
        let url = self.build_url_with_id("/cards/{id}", card_id);

        let response = self
            .client
            .delete(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(Error::from)?;

        if response.status().is_success() {
            Ok(())
        } else {
            Err(Error::Provider(format!(
                "Failed to delete Trello card: {}",
                response.status()
            )))
        }
    }

    async fn get_task(&self, card_id: &str) -> Result<Task> {
        self.rate_limiter.acquire().await;
        let url = self.build_url_with_id("/cards/{id}", card_id);

        let response = self
            .client
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(Error::from)?;

        if response.status().is_success() {
            let card: TrelloCard = response.json().await.map_err(Error::from)?;
            Ok(self.card_to_task(&card).await)
        } else {
            Err(Error::Provider(format!(
                "Failed to get Trello card: {}",
                response.status()
            )))
        }
    }
}
