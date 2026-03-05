use futures_util::{SinkExt, StreamExt};
use reqwest::{header, Client};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackConfig {
    pub bot_token: String,
    pub app_token: String,
    pub signing_secret: String,
}

#[derive(Clone)]
pub struct SlackClient {
    client: Client,
    config: SlackConfig,
}

impl SlackClient {
    pub fn new(config: SlackConfig) -> Result<Self, Box<dyn std::error::Error>> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()?;

        Ok(Self { client, config })
    }

    pub async fn send_message(
        &self,
        channel: &str,
        text: &str,
    ) -> Result<SlackMessage, Box<dyn std::error::Error>> {
        let url = "https://slack.com/api/chat.postMessage";

        let payload = json!({
            "channel": channel,
            "text": text,
        });

        let response = self
            .client
            .post(url)
            .header(
                header::AUTHORIZATION,
                format!("Bearer {}", self.config.bot_token),
            )
            .header(header::CONTENT_TYPE, "application/json")
            .json(&payload)
            .send()
            .await?;

        let result: SlackMessageResponse = response.json().await?;

        if !result.ok {
            return Err(format!("Slack API error: {}", result.error.unwrap_or_default()).into());
        }

        Ok(SlackMessage {
            ts: result.ts.unwrap_or_default(),
            channel: result.channel.unwrap_or_default(),
            text: text.to_string(),
            user: None,
        })
    }

    pub async fn send_interactive_message(
        &self,
        channel: &str,
        blocks: Vec<SlackBlock>,
    ) -> Result<SlackMessage, Box<dyn std::error::Error>> {
        let url = "https://slack.com/api/chat.postMessage";

        let payload = json!({
            "channel": channel,
            "blocks": blocks,
        });

        let response = self
            .client
            .post(url)
            .header(
                header::AUTHORIZATION,
                format!("Bearer {}", self.config.bot_token),
            )
            .header(header::CONTENT_TYPE, "application/json")
            .json(&payload)
            .send()
            .await?;

        let result: SlackMessageResponse = response.json().await?;

        if !result.ok {
            return Err(format!("Slack API error: {}", result.error.unwrap_or_default()).into());
        }

        Ok(SlackMessage {
            ts: result.ts.unwrap_or_default(),
            channel: result.channel.unwrap_or_default(),
            text: String::new(),
            user: None,
        })
    }

    pub async fn get_conversation_history(
        &self,
        channel: &str,
        limit: usize,
    ) -> Result<Vec<SlackMessage>, Box<dyn std::error::Error>> {
        let url = format!(
            "https://slack.com/api/conversations.history?channel={}&limit={}",
            channel, limit
        );

        let response = self
            .client
            .get(&url)
            .header(
                header::AUTHORIZATION,
                format!("Bearer {}", self.config.bot_token),
            )
            .send()
            .await?;

        let result: SlackHistoryResponse = response.json().await?;

        if !result.ok {
            return Err(format!("Slack API error: {}", result.error.unwrap_or_default()).into());
        }

        Ok(result.messages.unwrap_or_default())
    }

    pub async fn handle_slash_command(
        &self,
        command: SlackCommand,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let response_text = match command.command.as_str() {
            "/agi" => {
                format!("AGI processing: {}", command.text)
            }
            _ => "Unknown command".to_string(),
        };

        self.send_message(&command.channel_id, &response_text)
            .await?;

        Ok(response_text)
    }

    pub async fn upload_file(
        &self,
        channel: &str,
        file_path: &str,
    ) -> Result<SlackFile, Box<dyn std::error::Error>> {
        let url = "https://slack.com/api/files.upload";

        let file_content = tokio::fs::read(file_path).await?;
        let filename = std::path::Path::new(file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file");

        let form = reqwest::multipart::Form::new()
            .text("channels", channel.to_string())
            .part(
                "file",
                reqwest::multipart::Part::bytes(file_content).file_name(filename.to_string()),
            );

        let response = self
            .client
            .post(url)
            .header(
                header::AUTHORIZATION,
                format!("Bearer {}", self.config.bot_token),
            )
            .multipart(form)
            .send()
            .await?;

        let result: SlackFileResponse = response.json().await?;

        if !result.ok {
            return Err(format!("Slack API error: {}", result.error.unwrap_or_default()).into());
        }

        Ok(result.file.unwrap_or_else(|| SlackFile {
            id: String::new(),
            name: filename.to_string(),
            url: String::new(),
        }))
    }

    pub async fn listen_events(&self) -> Result<SlackEventStream, Box<dyn std::error::Error>> {
        let url = "https://slack.com/api/apps.connections.open";

        let response = self
            .client
            .post(url)
            .header(
                header::AUTHORIZATION,
                format!("Bearer {}", self.config.app_token),
            )
            .send()
            .await?;

        let result: SlackSocketResponse = response.json().await?;

        if !result.ok {
            return Err(format!("Slack API error: {}", result.error.unwrap_or_default()).into());
        }

        let ws_url = result.url.ok_or("No WebSocket URL returned")?;

        let (ws_stream, _) = connect_async(&ws_url).await?;
        let (mut write, mut read) = ws_stream.split();

        let (tx, rx) = mpsc::channel(100);

        tokio::spawn(async move {
            while let Some(msg) = read.next().await {
                match msg {
                    Ok(Message::Text(text)) => {
                        if let Ok(event) = serde_json::from_str::<SlackEvent>(&text) {
                            if let Err(e) = tx.send(event).await {
                                tracing::error!("Failed to send event: {}", e);
                                break;
                            }
                        }

                        if let Ok(envelope) = serde_json::from_str::<serde_json::Value>(&text) {
                            if let Some(envelope_id) = envelope.get("envelope_id") {
                                let ack = json!({
                                    "envelope_id": envelope_id,
                                });
                                if let Err(e) = write.send(Message::Text(ack.to_string())).await {
                                    tracing::error!("Failed to send acknowledgment: {}", e);
                                }
                            }
                        }
                    }
                    Ok(Message::Close(_)) => break,
                    Err(e) => {
                        tracing::error!("WebSocket error: {}", e);
                        break;
                    }
                    _ => {}
                }
            }
        });

        Ok(SlackEventStream { receiver: rx })
    }

    pub async fn add_reaction(
        &self,
        channel: &str,
        timestamp: &str,
        emoji: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let url = "https://slack.com/api/reactions.add";

        let payload = json!({
            "channel": channel,
            "timestamp": timestamp,
            "name": emoji,
        });

        let response = self
            .client
            .post(url)
            .header(
                header::AUTHORIZATION,
                format!("Bearer {}", self.config.bot_token),
            )
            .header(header::CONTENT_TYPE, "application/json")
            .json(&payload)
            .send()
            .await?;

        let result: SlackApiResponse = response.json().await?;

        if !result.ok {
            return Err(format!("Slack API error: {}", result.error.unwrap_or_default()).into());
        }

        Ok(())
    }

    pub async fn update_message(
        &self,
        channel: &str,
        timestamp: &str,
        text: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let url = "https://slack.com/api/chat.update";

        let payload = json!({
            "channel": channel,
            "ts": timestamp,
            "text": text,
        });

        let response = self
            .client
            .post(url)
            .header(
                header::AUTHORIZATION,
                format!("Bearer {}", self.config.bot_token),
            )
            .header(header::CONTENT_TYPE, "application/json")
            .json(&payload)
            .send()
            .await?;

        let result: SlackApiResponse = response.json().await?;

        if !result.ok {
            return Err(format!("Slack API error: {}", result.error.unwrap_or_default()).into());
        }

        Ok(())
    }

    pub async fn delete_message(
        &self,
        channel: &str,
        timestamp: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let url = "https://slack.com/api/chat.delete";

        let payload = json!({
            "channel": channel,
            "ts": timestamp,
        });

        let response = self
            .client
            .post(url)
            .header(
                header::AUTHORIZATION,
                format!("Bearer {}", self.config.bot_token),
            )
            .header(header::CONTENT_TYPE, "application/json")
            .json(&payload)
            .send()
            .await?;

        let result: SlackApiResponse = response.json().await?;

        if !result.ok {
            return Err(format!("Slack API error: {}", result.error.unwrap_or_default()).into());
        }

        Ok(())
    }

    pub async fn get_user_info(
        &self,
        user_id: &str,
    ) -> Result<SlackUser, Box<dyn std::error::Error>> {
        let url = format!("https://slack.com/api/users.info?user={}", user_id);

        let response = self
            .client
            .get(&url)
            .header(
                header::AUTHORIZATION,
                format!("Bearer {}", self.config.bot_token),
            )
            .send()
            .await?;

        let result: SlackUserResponse = response.json().await?;

        if !result.ok {
            return Err(format!("Slack API error: {}", result.error.unwrap_or_default()).into());
        }

        Ok(result.user.ok_or("No user data returned")?)
    }

    pub async fn list_channels(&self) -> Result<Vec<SlackChannel>, Box<dyn std::error::Error>> {
        let url = "https://slack.com/api/conversations.list";

        let response = self
            .client
            .get(url)
            .header(
                header::AUTHORIZATION,
                format!("Bearer {}", self.config.bot_token),
            )
            .send()
            .await?;

        let result: SlackChannelsResponse = response.json().await?;

        if !result.ok {
            return Err(format!("Slack API error: {}", result.error.unwrap_or_default()).into());
        }

        Ok(result.channels.unwrap_or_default())
    }
}

#[derive(Debug, Deserialize)]
struct SlackApiResponse {
    ok: bool,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SlackMessageResponse {
    ok: bool,
    channel: Option<String>,
    ts: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SlackHistoryResponse {
    ok: bool,
    messages: Option<Vec<SlackMessage>>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SlackFileResponse {
    ok: bool,
    file: Option<SlackFile>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SlackSocketResponse {
    ok: bool,
    url: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SlackUserResponse {
    ok: bool,
    user: Option<SlackUser>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SlackChannelsResponse {
    ok: bool,
    channels: Option<Vec<SlackChannel>>,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackMessage {
    pub ts: String,
    pub channel: String,
    pub text: String,
    pub user: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackBlock {
    #[serde(rename = "type")]
    pub block_type: String,
    pub text: Option<SlackText>,
    pub elements: Option<Vec<SlackElement>>,
    pub accessory: Option<Box<SlackElement>>,
    pub block_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackText {
    #[serde(rename = "type")]
    pub text_type: String,
    pub text: String,
    pub emoji: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackElement {
    #[serde(rename = "type")]
    pub element_type: String,
    pub text: Option<SlackText>,
    pub action_id: Option<String>,
    pub url: Option<String>,
    pub value: Option<String>,
    pub style: Option<String>,
    pub options: Option<Vec<SlackOption>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackOption {
    pub text: SlackText,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackCommand {
    pub command: String,
    pub text: String,
    pub user_id: String,
    pub channel_id: String,
    pub team_id: String,
    pub response_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackFile {
    pub id: String,
    pub name: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub event: Option<HashMap<String, serde_json::Value>>,
}

pub struct SlackEventStream {
    receiver: mpsc::Receiver<SlackEvent>,
}

impl SlackEventStream {
    pub async fn next_event(&mut self) -> Option<SlackEvent> {
        self.receiver.recv().await
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackUser {
    pub id: String,
    pub name: String,
    pub real_name: Option<String>,
    pub profile: Option<SlackUserProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackUserProfile {
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub image_original: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackChannel {
    pub id: String,
    pub name: String,
    pub is_channel: bool,
    pub is_private: bool,
    pub is_member: bool,
}

impl SlackBlock {
    pub fn section(text: &str) -> Self {
        Self {
            block_type: "section".to_string(),
            text: Some(SlackText {
                text_type: "mrkdwn".to_string(),
                text: text.to_string(),
                emoji: None,
            }),
            elements: None,
            accessory: None,
            block_id: None,
        }
    }

    pub fn actions(elements: Vec<SlackElement>) -> Self {
        Self {
            block_type: "actions".to_string(),
            text: None,
            elements: Some(elements),
            accessory: None,
            block_id: None,
        }
    }
}

impl SlackElement {
    pub fn button(text: &str, action_id: &str, value: &str) -> Self {
        Self {
            element_type: "button".to_string(),
            text: Some(SlackText {
                text_type: "plain_text".to_string(),
                text: text.to_string(),
                emoji: Some(true),
            }),
            action_id: Some(action_id.to_string()),
            url: None,
            value: Some(value.to_string()),
            style: None,
            options: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_slack_block_section() {
        let block = SlackBlock::section("Hello, world!");
        assert_eq!(block.block_type, "section");
        assert!(block.text.is_some());
    }

    #[test]
    fn test_slack_element_button() {
        let button = SlackElement::button("Click me", "button_1", "value_1");
        assert_eq!(button.element_type, "button");
        assert!(button.text.is_some());
    }
}
