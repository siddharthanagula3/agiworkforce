//! Telegram messaging integration using Bot API

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;

/// Configuration for Telegram bot connection
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TelegramConfig {
    /// Bot token from BotFather
    pub bot_token: Option<String>,
    /// Default chat ID for sending messages
    pub default_chat_id: Option<i64>,
}

/// Represents a Telegram message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramMessage {
    pub message_id: i64,
    pub chat_id: i64,
    pub from_id: Option<i64>,
    pub from_username: Option<String>,
    pub text: String,
    pub date: i64,
}

/// Represents a Telegram chat
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramChat {
    pub id: i64,
    pub chat_type: String,
    pub title: Option<String>,
    pub username: Option<String>,
    pub first_name: Option<String>,
}

/// Client for interacting with the Telegram Bot API
pub struct TelegramClient {
    config: TelegramConfig,
    client: Client,
    connected: bool,
    last_update_id: i64,
}

impl TelegramClient {
    /// Create a new Telegram client with the given configuration
    pub fn new(config: TelegramConfig) -> Self {
        Self {
            config,
            client: Client::new(),
            connected: false,
            last_update_id: 0,
        }
    }

    fn api_url(&self, method: &str) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let token = self
            .config
            .bot_token
            .as_ref()
            .ok_or("Telegram bot token required")?;
        Ok(format!("https://api.telegram.org/bot{}/{}", token, method))
    }

    /// Connect and verify bot token
    pub async fn connect(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let url = self.api_url("getMe")?;

        let response = self.client.get(&url).send().await?;

        let data: serde_json::Value = response.json().await?;

        if !data["ok"].as_bool().unwrap_or(false) {
            return Err("Invalid Telegram bot token".into());
        }

        self.connected = true;
        Ok(())
    }

    /// Send a text message to a specific chat
    pub async fn send_message(
        &self,
        chat_id: i64,
        text: &str,
    ) -> Result<TelegramMessage, Box<dyn std::error::Error + Send + Sync>> {
        let url = self.api_url("sendMessage")?;

        let payload = json!({
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "Markdown"
        });

        let response = self.client.post(&url).json(&payload).send().await?;

        let data: serde_json::Value = response.json().await?;

        if !data["ok"].as_bool().unwrap_or(false) {
            let desc = data["description"].as_str().unwrap_or("Unknown error");
            return Err(format!("Telegram error: {}", desc).into());
        }

        let result = &data["result"];
        Ok(TelegramMessage {
            message_id: result["message_id"].as_i64().unwrap_or(0),
            chat_id: result["chat"]["id"].as_i64().unwrap_or(0),
            from_id: result["from"].get("id").and_then(|v| v.as_i64()),
            from_username: result["from"]
                .get("username")
                .and_then(|v| v.as_str())
                .map(String::from),
            text: result["text"].as_str().unwrap_or("").to_string(),
            date: result["date"].as_i64().unwrap_or(0),
        })
    }

    /// Send a message to the default chat
    pub async fn send_to_default(
        &self,
        text: &str,
    ) -> Result<TelegramMessage, Box<dyn std::error::Error + Send + Sync>> {
        let chat_id = self
            .config
            .default_chat_id
            .ok_or("Default chat ID not configured")?;
        self.send_message(chat_id, text).await
    }

    /// Get updates (new messages) using long polling
    pub async fn get_updates(
        &mut self,
    ) -> Result<Vec<TelegramMessage>, Box<dyn std::error::Error + Send + Sync>> {
        let url = self.api_url("getUpdates")?;

        let payload = json!({
            "offset": self.last_update_id + 1,
            "timeout": 1,
            "allowed_updates": ["message"]
        });

        let response = self.client.post(&url).json(&payload).send().await?;

        let data: serde_json::Value = response.json().await?;

        if !data["ok"].as_bool().unwrap_or(false) {
            return Ok(vec![]);
        }

        let updates = data["result"].as_array().cloned().unwrap_or_default();
        let mut messages = Vec::new();

        for update in updates {
            if let Some(update_id) = update["update_id"].as_i64() {
                self.last_update_id = update_id;
            }

            if let Some(message) = update.get("message") {
                messages.push(TelegramMessage {
                    message_id: message["message_id"].as_i64().unwrap_or(0),
                    chat_id: message["chat"]["id"].as_i64().unwrap_or(0),
                    from_id: message["from"].get("id").and_then(|v| v.as_i64()),
                    from_username: message["from"]
                        .get("username")
                        .and_then(|v| v.as_str())
                        .map(String::from),
                    text: message["text"].as_str().unwrap_or("").to_string(),
                    date: message["date"].as_i64().unwrap_or(0),
                });
            }
        }

        Ok(messages)
    }

    /// Get information about a specific chat
    pub async fn get_chat(
        &self,
        chat_id: i64,
    ) -> Result<TelegramChat, Box<dyn std::error::Error + Send + Sync>> {
        let url = self.api_url("getChat")?;

        let payload = json!({
            "chat_id": chat_id
        });

        let response = self.client.post(&url).json(&payload).send().await?;

        let data: serde_json::Value = response.json().await?;

        if !data["ok"].as_bool().unwrap_or(false) {
            let desc = data["description"].as_str().unwrap_or("Unknown error");
            return Err(format!("Telegram error: {}", desc).into());
        }

        let result = &data["result"];
        Ok(TelegramChat {
            id: result["id"].as_i64().unwrap_or(0),
            chat_type: result["type"].as_str().unwrap_or("").to_string(),
            title: result
                .get("title")
                .and_then(|v| v.as_str())
                .map(String::from),
            username: result
                .get("username")
                .and_then(|v| v.as_str())
                .map(String::from),
            first_name: result
                .get("first_name")
                .and_then(|v| v.as_str())
                .map(String::from),
        })
    }

    /// Check if the client is connected
    pub fn is_connected(&self) -> bool {
        self.connected
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_telegram_config_default() {
        let config = TelegramConfig::default();
        assert!(config.bot_token.is_none());
        assert!(config.default_chat_id.is_none());
    }

    #[test]
    fn test_telegram_client_new() {
        let config = TelegramConfig {
            bot_token: Some("test_token".to_string()),
            default_chat_id: Some(123456),
        };
        let client = TelegramClient::new(config);
        assert!(!client.is_connected());
    }

    #[test]
    fn test_api_url_without_token() {
        let config = TelegramConfig::default();
        let client = TelegramClient::new(config);
        let result = client.api_url("getMe");
        assert!(result.is_err());
    }

    #[test]
    fn test_api_url_with_token() {
        let config = TelegramConfig {
            bot_token: Some("test_token".to_string()),
            default_chat_id: None,
        };
        let client = TelegramClient::new(config);
        let result = client.api_url("getMe");
        assert!(result.is_ok());
        assert_eq!(
            result.unwrap(),
            "https://api.telegram.org/bottest_token/getMe"
        );
    }
}
