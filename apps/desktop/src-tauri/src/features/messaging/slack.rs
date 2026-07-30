use reqwest::{header, Client};
use serde::{Deserialize, Serialize};
use serde_json::json;

/// Credentials for the retained outbound Slack Web API client.
///
/// Inbound Slack-app capabilities are not part of this product surface. Socket
/// Mode app tokens and HTTP signing secrets therefore do not belong in the
/// credential contract.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackConfig {
    pub bot_token: String,
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
        let payload = json!({
            "channel": channel,
            "text": text,
        });

        let response = self
            .client
            .post("https://slack.com/api/chat.postMessage")
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
}

#[derive(Debug, Deserialize)]
struct SlackMessageResponse {
    ok: bool,
    channel: Option<String>,
    ts: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackMessage {
    pub ts: String,
    pub channel: String,
    pub text: String,
    pub user: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn outbound_config_serializes_only_the_bot_token() {
        let config = SlackConfig {
            bot_token: "xoxb-test".to_string(),
        };

        assert_eq!(
            serde_json::to_value(config).expect("serialize Slack config"),
            serde_json::json!({ "bot_token": "xoxb-test" })
        );
    }
}
