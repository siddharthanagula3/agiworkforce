use crate::error::{Error, Result};
use crate::productivity::unified_task::{Task, TaskStatus, UnifiedTaskProvider};
use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const TRELLO_BASE_URL: &str = "https://api.trello.com/1";

/// Trello API client with API key + token authentication
pub struct TrelloClient {
    client: Client,
    api_key: String,
    token: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TrelloBoard {
    id: String,
    name: String,
    url: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct TrelloList {
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
    /// Create a new Trello client with API key and token
    pub fn new(api_key: String, token: String) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            api_key,
            token,
        }
    }

    /// Build URL with authentication parameters
    fn build_url(&self, endpoint: &str) -> String {
        format!(
            "{}{}?key={}&token={}",
            TRELLO_BASE_URL, endpoint, self.api_key, self.token
        )
    }

    /// Verify connection by getting member info
    pub async fn verify_connection(&mut self) -> Result<String> {
        let url = self.build_url("/members/me");

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| Error::Http(e))?;

        if response.status().is_success() {
            let member: TrelloMember = response.json().await.map_err(|e| Error::Http(e))?;
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

    /// List all boards for the authenticated user
    pub async fn list_boards(&self) -> Result<Vec<TrelloBoard>> {
        let url = self.build_url("/members/me/boards");

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| Error::Http(e))?;

        if response.status().is_success() {
            let boards: Vec<TrelloBoard> = response.json().await.map_err(|e| Error::Http(e))?;
            Ok(boards)
        } else {
            Err(Error::Provider(format!(
                "Failed to list Trello boards: {}",
                response.status()
            )))
        }
    }

    /// List all lists in a board
    pub async fn list_board_lists(&self, board_id: &str) -> Result<Vec<TrelloList>> {
        let url = self.build_url(&format!("/boards/{}/lists", board_id));

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| Error::Http(e))?;

        if response.status().is_success() {
            let lists: Vec<TrelloList> = response.json().await.map_err(|e| Error::Http(e))?;
            Ok(lists)
        } else {
            Err(Error::Provider(format!(
                "Failed to list Trello board lists: {}",
                response.status()
            )))
        }
    }

    /// List all cards in a board
    pub async fn list_board_cards(&self, board_id: &str) -> Result<Vec<TrelloCard>> {
        let url = self.build_url(&format!("/boards/{}/cards", board_id));

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| Error::Http(e))?;

        if response.status().is_success() {
            let cards: Vec<TrelloCard> = response.json().await.map_err(|e| Error::Http(e))?;
            Ok(cards)
        } else {
            Err(Error::Provider(format!(
                "Failed to list Trello cards: {}",
                response.status()
            )))
        }
    }

    /// List all cards in a list
    pub async fn list_list_cards(&self, list_id: &str) -> Result<Vec<TrelloCard>> {
        let url = self.build_url(&format!("/lists/{}/cards", list_id));

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| Error::Http(e))?;

        if response.status().is_success() {
            let cards: Vec<TrelloCard> = response.json().await.map_err(|e| Error::Http(e))?;
            Ok(cards)
        } else {
            Err(Error::Provider(format!(
                "Failed to list Trello list cards: {}",
                response.status()
            )))
        }
    }

    /// Create a new card
    pub async fn create_card(
        &self,
        list_id: &str,
        name: &str,
        description: Option<&str>,
        due: Option<DateTime<Utc>>,
    ) -> Result<String> {
        let mut url = self.build_url("/cards");
        url.push_str(&format!(
            "&idList={}&name={}",
            list_id,
            urlencoding::encode(name)
        ));

        if let Some(desc) = description {
            url.push_str(&format!("&desc={}", urlencoding::encode(desc)));
        }

        if let Some(due_date) = due {
            url.push_str(&format!("&due={}", due_date.to_rfc3339()));
        }

        let response = self
            .client
            .post(&url)
            .send()
            .await
            .map_err(|e| Error::Http(e))?;

        if response.status().is_success() {
            let card: TrelloCard = response.json().await.map_err(|e| Error::Http(e))?;
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

    /// Move a card to a different list
    pub async fn move_card(&self, card_id: &str, list_id: &str) -> Result<()> {
        let mut url = self.build_url(&format!("/cards/{}", card_id));
        url.push_str(&format!("&idList={}", list_id));

        let response = self
            .client
            .put(&url)
            .send()
            .await
            .map_err(|e| Error::Http(e))?;

        if response.status().is_success() {
            Ok(())
        } else {
            Err(Error::Provider(format!(
                "Failed to move Trello card: {}",
                response.status()
            )))
        }
    }

    /// Add a comment to a card
    pub async fn add_comment(&self, card_id: &str, text: &str) -> Result<String> {
        let mut url = self.build_url(&format!("/cards/{}/actions/comments", card_id));
        url.push_str(&format!("&text={}", urlencoding::encode(text)));

        let response = self
            .client
            .post(&url)
            .send()
            .await
            .map_err(|e| Error::Http(e))?;

        if response.status().is_success() {
            let comment: serde_json::Value = response.json().await.map_err(|e| Error::Http(e))?;
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

    /// Get list name for a list ID
    async fn get_list_name(&self, list_id: &str) -> Result<String> {
        let url = self.build_url(&format!("/lists/{}", list_id));

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| Error::Http(e))?;

        if response.status().is_success() {
            let list: TrelloList = response.json().await.map_err(|e| Error::Http(e))?;
            Ok(list.name)
        } else {
            Ok("Unknown".to_string())
        }
    }

    /// Convert Trello card to unified Task
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
            assignee: None,
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
        // Need to determine which list to create the card in
        // For simplicity, we'll require project_id (board_id) to be set
        let board_id = task
            .project_id
            .ok_or_else(|| Error::Config("Board ID required for Trello task".to_string()))?;

        // Get the first list in the board
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
        // To update a task, we'd need to move it to the appropriate list based on status
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
        let url = self.build_url(&format!("/cards/{}", card_id));

        let response = self
            .client
            .delete(&url)
            .send()
            .await
            .map_err(|e| Error::Http(e))?;

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
        let url = self.build_url(&format!("/cards/{}", card_id));

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| Error::Http(e))?;

        if response.status().is_success() {
            let card: TrelloCard = response.json().await.map_err(|e| Error::Http(e))?;
            Ok(self.card_to_task(&card).await)
        } else {
            Err(Error::Provider(format!(
                "Failed to get Trello card: {}",
                response.status()
            )))
        }
    }
}
