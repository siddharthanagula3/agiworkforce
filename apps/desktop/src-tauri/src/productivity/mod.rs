pub mod asana_client;
pub mod notion_client;
pub mod trello_client;
pub mod unified_task;

pub use asana_client::AsanaClient;
pub use notion_client::NotionClient;
pub use trello_client::TrelloClient;
pub use unified_task::{Task, TaskStatus, UnifiedTaskProvider};

use crate::error::{Error, Result};
use std::sync::Arc;
use tokio::sync::Mutex;

/// Provider type for productivity tools
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Notion,
    Trello,
    Asana,
}

/// Unified productivity manager that handles all providers
pub struct ProductivityManager {
    notion_client: Option<Arc<Mutex<NotionClient>>>,
    trello_client: Option<Arc<Mutex<TrelloClient>>>,
    asana_client: Option<Arc<Mutex<AsanaClient>>>,
}

impl ProductivityManager {
    pub fn new() -> Self {
        Self {
            notion_client: None,
            trello_client: None,
            asana_client: None,
        }
    }

    /// Connect to a productivity provider
    pub async fn connect(
        &mut self,
        provider: Provider,
        credentials: serde_json::Value,
    ) -> Result<String> {
        match provider {
            Provider::Notion => {
                let token = credentials
                    .get("token")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| Error::Config("Missing Notion token".to_string()))?;

                let mut client = NotionClient::new(token.to_string());
                let account_id = client.verify_connection().await?;
                self.notion_client = Some(Arc::new(Mutex::new(client)));
                Ok(account_id)
            }
            Provider::Trello => {
                let api_key = credentials
                    .get("api_key")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| Error::Config("Missing Trello API key".to_string()))?;
                let token = credentials
                    .get("token")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| Error::Config("Missing Trello token".to_string()))?;

                let mut client = TrelloClient::new(api_key.to_string(), token.to_string());
                let account_id = client.verify_connection().await?;
                self.trello_client = Some(Arc::new(Mutex::new(client)));
                Ok(account_id)
            }
            Provider::Asana => {
                let token = credentials
                    .get("token")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| Error::Config("Missing Asana token".to_string()))?;

                let mut client = AsanaClient::new(token.to_string());
                let account_id = client.verify_connection().await?;
                self.asana_client = Some(Arc::new(Mutex::new(client)));
                Ok(account_id)
            }
        }
    }

    /// List tasks from a provider
    pub async fn list_tasks(&self, provider: Provider) -> Result<Vec<Task>> {
        match provider {
            Provider::Notion => {
                let client = self
                    .notion_client
                    .as_ref()
                    .ok_or_else(|| Error::Config("Notion client not connected".to_string()))?;
                let client = client.lock().await;
                client.list_tasks().await
            }
            Provider::Trello => {
                let client = self
                    .trello_client
                    .as_ref()
                    .ok_or_else(|| Error::Config("Trello client not connected".to_string()))?;
                let client = client.lock().await;
                client.list_tasks().await
            }
            Provider::Asana => {
                let client = self
                    .asana_client
                    .as_ref()
                    .ok_or_else(|| Error::Config("Asana client not connected".to_string()))?;
                let client = client.lock().await;
                client.list_tasks().await
            }
        }
    }

    /// Create a task in a provider
    pub async fn create_task(&self, provider: Provider, task: Task) -> Result<String> {
        match provider {
            Provider::Notion => {
                let client = self
                    .notion_client
                    .as_ref()
                    .ok_or_else(|| Error::Config("Notion client not connected".to_string()))?;
                let client = client.lock().await;
                client.create_task(task).await
            }
            Provider::Trello => {
                let client = self
                    .trello_client
                    .as_ref()
                    .ok_or_else(|| Error::Config("Trello client not connected".to_string()))?;
                let client = client.lock().await;
                client.create_task(task).await
            }
            Provider::Asana => {
                let client = self
                    .asana_client
                    .as_ref()
                    .ok_or_else(|| Error::Config("Asana client not connected".to_string()))?;
                let client = client.lock().await;
                client.create_task(task).await
            }
        }
    }

    /// Get a reference to the Notion client
    pub fn notion_client(&self) -> Option<&Arc<Mutex<NotionClient>>> {
        self.notion_client.as_ref()
    }

    /// Get a reference to the Trello client
    pub fn trello_client(&self) -> Option<&Arc<Mutex<TrelloClient>>> {
        self.trello_client.as_ref()
    }

    /// Get a reference to the Asana client
    pub fn asana_client(&self) -> Option<&Arc<Mutex<AsanaClient>>> {
        self.asana_client.as_ref()
    }
}

impl Default for ProductivityManager {
    fn default() -> Self {
        Self::new()
    }
}
