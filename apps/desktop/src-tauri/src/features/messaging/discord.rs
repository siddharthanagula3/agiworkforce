//! Discord messaging integration

use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DiscordConfig {
    pub bot_token: Option<String>,
    pub webhook_url: Option<String>,
    pub guild_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscordChannel {
    pub id: String,
    pub name: String,
    pub channel_type: DiscordChannelType,
    pub guild_name: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DiscordChannelType {
    Text,
    Voice,
    Dm,
    GroupDm,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscordMessage {
    pub id: String,
    pub channel_id: String,
    pub content: String,
    pub author: Option<DiscordUser>,
    pub timestamp: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscordUser {
    pub id: String,
    pub username: String,
    pub discriminator: Option<String>,
    pub avatar: Option<String>,
}

pub struct DiscordClient {
    config: DiscordConfig,
    client: Client,
    connected: bool,
}

impl DiscordClient {
    pub fn new(config: DiscordConfig) -> Self {
        Self {
            config,
            client: Client::new(),
            connected: false,
        }
    }

    /// Connect to Discord
    pub async fn connect(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if self.config.bot_token.is_none() && self.config.webhook_url.is_none() {
            return Err("Discord bot token or webhook URL required".into());
        }
        self.connected = true;
        Ok(())
    }

    /// Disconnect from Discord
    pub fn disconnect(&mut self) {
        self.connected = false;
    }

    /// Send message via webhook (simple method)
    pub async fn send_webhook_message(
        &self,
        content: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let webhook_url = self
            .config
            .webhook_url
            .as_ref()
            .ok_or("Webhook URL not configured")?;

        let payload = serde_json::json!({
            "content": content
        });

        let response = self
            .client
            .post(webhook_url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Discord API error: {}", e))?;

        if !response.status().is_success() {
            return Err("Failed to send Discord message".into());
        }

        Ok(())
    }

    /// Send message to a channel (requires bot token)
    pub async fn send_message(
        &self,
        channel_id: &str,
        content: &str,
    ) -> Result<DiscordMessage, Box<dyn std::error::Error + Send + Sync>> {
        let token = self
            .config
            .bot_token
            .as_ref()
            .ok_or("Bot token required for channel messages")?;

        let url = format!(
            "https://discord.com/api/v10/channels/{}/messages",
            channel_id
        );

        let payload = serde_json::json!({
            "content": content
        });

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bot {}", token))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Discord API error: {}", e))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Discord error: {}", error_text).into());
        }

        let message: DiscordMessage = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        Ok(message)
    }

    /// List channels in guild
    pub async fn list_channels(
        &self,
    ) -> Result<Vec<DiscordChannel>, Box<dyn std::error::Error + Send + Sync>> {
        let token = self.config.bot_token.as_ref().ok_or("Bot token required")?;

        let guild_id = self.config.guild_id.as_ref().ok_or("Guild ID required")?;

        let url = format!("https://discord.com/api/v10/guilds/{}/channels", guild_id);

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bot {}", token))
            .send()
            .await
            .map_err(|e| format!("Discord API error: {}", e))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Discord error: {}", error_text).into());
        }

        let data: Vec<serde_json::Value> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse channels: {}", e))?;

        Ok(data
            .iter()
            .map(|ch| DiscordChannel {
                id: ch["id"].as_str().unwrap_or("").to_string(),
                name: ch["name"].as_str().unwrap_or("").to_string(),
                channel_type: match ch["type"].as_i64().unwrap_or(0) {
                    0 => DiscordChannelType::Text,
                    2 => DiscordChannelType::Voice,
                    1 => DiscordChannelType::Dm,
                    3 => DiscordChannelType::GroupDm,
                    _ => DiscordChannelType::Text,
                },
                guild_name: None,
            })
            .collect())
    }

    /// Get messages from a channel
    pub async fn get_channel_messages(
        &self,
        channel_id: &str,
        limit: usize,
    ) -> Result<Vec<DiscordMessage>, Box<dyn std::error::Error + Send + Sync>> {
        let token = self.config.bot_token.as_ref().ok_or("Bot token required")?;

        let url = format!(
            "https://discord.com/api/v10/channels/{}/messages?limit={}",
            channel_id,
            limit.min(100) // Discord API max is 100
        );

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bot {}", token))
            .send()
            .await
            .map_err(|e| format!("Discord API error: {}", e))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Discord error: {}", error_text).into());
        }

        let messages: Vec<DiscordMessage> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse messages: {}", e))?;

        Ok(messages)
    }

    /// Delete a message
    pub async fn delete_message(
        &self,
        channel_id: &str,
        message_id: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let token = self.config.bot_token.as_ref().ok_or("Bot token required")?;

        let url = format!(
            "https://discord.com/api/v10/channels/{}/messages/{}",
            channel_id, message_id
        );

        let response = self
            .client
            .delete(&url)
            .header("Authorization", format!("Bot {}", token))
            .send()
            .await
            .map_err(|e| format!("Discord API error: {}", e))?;

        if !response.status().is_success() && response.status().as_u16() != 204 {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Discord error: {}", error_text).into());
        }

        Ok(())
    }

    /// Edit a message
    pub async fn edit_message(
        &self,
        channel_id: &str,
        message_id: &str,
        content: &str,
    ) -> Result<DiscordMessage, Box<dyn std::error::Error + Send + Sync>> {
        let token = self.config.bot_token.as_ref().ok_or("Bot token required")?;

        let url = format!(
            "https://discord.com/api/v10/channels/{}/messages/{}",
            channel_id, message_id
        );

        let payload = serde_json::json!({
            "content": content
        });

        let response = self
            .client
            .patch(&url)
            .header("Authorization", format!("Bot {}", token))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Discord API error: {}", e))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Discord error: {}", error_text).into());
        }

        let message: DiscordMessage = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        Ok(message)
    }

    /// Add a reaction to a message
    pub async fn add_reaction(
        &self,
        channel_id: &str,
        message_id: &str,
        emoji: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let token = self.config.bot_token.as_ref().ok_or("Bot token required")?;

        // URL-encode the emoji for the API
        let encoded_emoji = urlencoding::encode(emoji);
        let url = format!(
            "https://discord.com/api/v10/channels/{}/messages/{}/reactions/{}/@me",
            channel_id, message_id, encoded_emoji
        );

        let response = self
            .client
            .put(&url)
            .header("Authorization", format!("Bot {}", token))
            .header("Content-Length", "0")
            .send()
            .await
            .map_err(|e| format!("Discord API error: {}", e))?;

        if !response.status().is_success() && response.status().as_u16() != 204 {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Discord error: {}", error_text).into());
        }

        Ok(())
    }

    /// Get guild information
    pub async fn get_guild(
        &self,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let token = self.config.bot_token.as_ref().ok_or("Bot token required")?;

        let guild_id = self.config.guild_id.as_ref().ok_or("Guild ID required")?;

        let url = format!("https://discord.com/api/v10/guilds/{}", guild_id);

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bot {}", token))
            .send()
            .await
            .map_err(|e| format!("Discord API error: {}", e))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Discord error: {}", error_text).into());
        }

        let guild: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse guild: {}", e))?;

        Ok(guild)
    }

    pub fn is_connected(&self) -> bool {
        self.connected
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_discord_config_default() {
        let config = DiscordConfig::default();
        assert!(config.bot_token.is_none());
        assert!(config.webhook_url.is_none());
        assert!(config.guild_id.is_none());
    }

    #[test]
    fn test_discord_client_new() {
        let config = DiscordConfig {
            bot_token: Some("test_token".to_string()),
            webhook_url: None,
            guild_id: Some("123456".to_string()),
        };
        let client = DiscordClient::new(config);
        assert!(!client.is_connected());
    }

    #[test]
    fn test_discord_channel_type_serialization() {
        let channel = DiscordChannel {
            id: "123".to_string(),
            name: "general".to_string(),
            channel_type: DiscordChannelType::Text,
            guild_name: None,
        };

        let json = serde_json::to_string(&channel).unwrap();
        assert!(json.contains("\"channel_type\":\"text\""));
    }
}
