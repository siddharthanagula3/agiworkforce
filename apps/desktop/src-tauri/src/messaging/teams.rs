use reqwest::{Client, header};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamsConfig {
    pub tenant_id: String,
    pub client_id: String,
    pub client_secret: String,
}

#[derive(Clone)]
pub struct TeamsClient {
    client: Client,
    tenant_id: String,
    client_id: String,
    client_secret: String,
    access_token: Option<String>,
}

impl TeamsClient {
    pub fn new(config: TeamsConfig) -> Result<Self, Box<dyn std::error::Error>> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()?;

        Ok(Self {
            client,
            tenant_id: config.tenant_id,
            client_id: config.client_id,
            client_secret: config.client_secret,
            access_token: None,
        })
    }

    /// Authenticate using OAuth2 client credentials flow
    pub async fn authenticate(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let url = format!(
            "https://login.microsoftonline.com/{}/oauth2/v2.0/token",
            self.tenant_id
        );

        let params = [
            ("client_id", self.client_id.as_str()),
            ("client_secret", self.client_secret.as_str()),
            ("scope", "https://graph.microsoft.com/.default"),
            ("grant_type", "client_credentials"),
        ];

        let response = self.client.post(&url).form(&params).send().await?;

        let result: TeamsAuthResponse = response.json().await?;
        self.access_token = Some(result.access_token);

        Ok(())
    }

    /// Ensure we have a valid access token
    async fn ensure_authenticated(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        if self.access_token.is_none() {
            self.authenticate().await?;
        }
        Ok(())
    }

    /// Get the authorization header value
    fn auth_header(&self) -> Result<String, Box<dyn std::error::Error>> {
        self.access_token
            .as_ref()
            .map(|token| format!("Bearer {}", token))
            .ok_or_else(|| "Not authenticated".into())
    }

    /// Send a message to a channel
    pub async fn send_message(
        &self,
        channel_id: &str,
        message: &str,
    ) -> Result<TeamsMessage, Box<dyn std::error::Error>> {
        let parts: Vec<&str> = channel_id.split('/').collect();
        if parts.len() < 2 {
            return Err("Invalid channel_id format. Expected: team_id/channel_id".into());
        }
        let team_id = parts[0];
        let chan_id = parts[1];

        let url = format!(
            "https://graph.microsoft.com/v1.0/teams/{}/channels/{}/messages",
            team_id, chan_id
        );

        let payload = json!({
            "body": {
                "content": message,
            }
        });

        let response = self
            .client
            .post(&url)
            .header(header::AUTHORIZATION, self.auth_header()?)
            .header(header::CONTENT_TYPE, "application/json")
            .json(&payload)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(format!("Teams API error: {}", error_text).into());
        }

        let result: TeamsMessage = response.json().await?;
        Ok(result)
    }

    /// Send a message with rich formatting (HTML)
    pub async fn send_rich_message(
        &self,
        channel_id: &str,
        content: &str,
        content_type: &str, // "text" or "html"
    ) -> Result<TeamsMessage, Box<dyn std::error::Error>> {
        let parts: Vec<&str> = channel_id.split('/').collect();
        if parts.len() < 2 {
            return Err("Invalid channel_id format. Expected: team_id/channel_id".into());
        }
        let team_id = parts[0];
        let chan_id = parts[1];

        let url = format!(
            "https://graph.microsoft.com/v1.0/teams/{}/channels/{}/messages",
            team_id, chan_id
        );

        let payload = json!({
            "body": {
                "contentType": content_type,
                "content": content,
            }
        });

        let response = self
            .client
            .post(&url)
            .header(header::AUTHORIZATION, self.auth_header()?)
            .header(header::CONTENT_TYPE, "application/json")
            .json(&payload)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(format!("Teams API error: {}", error_text).into());
        }

        let result: TeamsMessage = response.json().await?;
        Ok(result)
    }

    /// Send an Adaptive Card (rich interactive message)
    pub async fn send_adaptive_card(
        &self,
        channel_id: &str,
        card: AdaptiveCard,
    ) -> Result<TeamsMessage, Box<dyn std::error::Error>> {
        let parts: Vec<&str> = channel_id.split('/').collect();
        if parts.len() < 2 {
            return Err("Invalid channel_id format. Expected: team_id/channel_id".into());
        }
        let team_id = parts[0];
        let chan_id = parts[1];

        let url = format!(
            "https://graph.microsoft.com/v1.0/teams/{}/channels/{}/messages",
            team_id, chan_id
        );

        let payload = json!({
            "body": {
                "contentType": "html",
                "content": "<attachment id=\"adaptive_card\"></attachment>",
            },
            "attachments": [
                {
                    "id": "adaptive_card",
                    "contentType": "application/vnd.microsoft.card.adaptive",
                    "content": serde_json::to_string(&card)?,
                }
            ]
        });

        let response = self
            .client
            .post(&url)
            .header(header::AUTHORIZATION, self.auth_header()?)
            .header(header::CONTENT_TYPE, "application/json")
            .json(&payload)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(format!("Teams API error: {}", error_text).into());
        }

        let result: TeamsMessage = response.json().await?;
        Ok(result)
    }

    /// Reply to a message
    pub async fn reply_to_message(
        &self,
        channel_id: &str,
        message_id: &str,
        reply_text: &str,
    ) -> Result<TeamsMessage, Box<dyn std::error::Error>> {
        let parts: Vec<&str> = channel_id.split('/').collect();
        if parts.len() < 2 {
            return Err("Invalid channel_id format. Expected: team_id/channel_id".into());
        }
        let team_id = parts[0];
        let chan_id = parts[1];

        let url = format!(
            "https://graph.microsoft.com/v1.0/teams/{}/channels/{}/messages/{}/replies",
            team_id, chan_id, message_id
        );

        let payload = json!({
            "body": {
                "content": reply_text,
            }
        });

        let response = self
            .client
            .post(&url)
            .header(header::AUTHORIZATION, self.auth_header()?)
            .header(header::CONTENT_TYPE, "application/json")
            .json(&payload)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(format!("Teams API error: {}", error_text).into());
        }

        let result: TeamsMessage = response.json().await?;
        Ok(result)
    }

    /// Get messages from a channel
    pub async fn get_channel_messages(
        &self,
        channel_id: &str,
        limit: usize,
    ) -> Result<Vec<TeamsMessage>, Box<dyn std::error::Error>> {
        let parts: Vec<&str> = channel_id.split('/').collect();
        if parts.len() < 2 {
            return Err("Invalid channel_id format. Expected: team_id/channel_id".into());
        }
        let team_id = parts[0];
        let chan_id = parts[1];

        let url = format!(
            "https://graph.microsoft.com/v1.0/teams/{}/channels/{}/messages?$top={}",
            team_id, chan_id, limit
        );

        let response = self
            .client
            .get(&url)
            .header(header::AUTHORIZATION, self.auth_header()?)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(format!("Teams API error: {}", error_text).into());
        }

        let result: TeamsMessagesResponse = response.json().await?;
        Ok(result.value)
    }

    /// Create an online meeting
    pub async fn create_meeting(
        &self,
        title: &str,
        start_time: &str, // ISO 8601 format
        end_time: &str,
        attendees: Vec<String>,
    ) -> Result<TeamsMeeting, Box<dyn std::error::Error>> {
        let url = "https://graph.microsoft.com/v1.0/me/onlineMeetings";

        let attendee_objects: Vec<_> = attendees
            .iter()
            .map(|email| {
                json!({
                    "identity": {
                        "user": {
                            "id": email,
                        }
                    }
                })
            })
            .collect();

        let payload = json!({
            "subject": title,
            "startDateTime": start_time,
            "endDateTime": end_time,
            "participants": {
                "attendees": attendee_objects,
            }
        });

        let response = self
            .client
            .post(url)
            .header(header::AUTHORIZATION, self.auth_header()?)
            .header(header::CONTENT_TYPE, "application/json")
            .json(&payload)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(format!("Teams API error: {}", error_text).into());
        }

        let result: TeamsMeeting = response.json().await?;
        Ok(result)
    }

    /// Handle incoming activity (message, mention, etc.)
    pub fn handle_activity(
        &self,
        activity: TeamsActivity,
    ) -> Result<(), Box<dyn std::error::Error>> {
        match activity.activity_type.as_str() {
            "message" => {
                println!("Received message: {:?}", activity.text);
            }
            "mention" => {
                println!("Bot was mentioned: {:?}", activity.text);
            }
            _ => {
                println!("Unknown activity type: {}", activity.activity_type);
            }
        }

        Ok(())
    }

    /// List teams the bot has access to
    pub async fn list_teams(&self) -> Result<Vec<Team>, Box<dyn std::error::Error>> {
        let url = "https://graph.microsoft.com/v1.0/me/joinedTeams";

        let response = self
            .client
            .get(url)
            .header(header::AUTHORIZATION, self.auth_header()?)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(format!("Teams API error: {}", error_text).into());
        }

        let result: TeamsListResponse = response.json().await?;
        Ok(result.value)
    }

    /// List channels in a team
    pub async fn list_channels(
        &self,
        team_id: &str,
    ) -> Result<Vec<Channel>, Box<dyn std::error::Error>> {
        let url = format!(
            "https://graph.microsoft.com/v1.0/teams/{}/channels",
            team_id
        );

        let response = self
            .client
            .get(&url)
            .header(header::AUTHORIZATION, self.auth_header()?)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(format!("Teams API error: {}", error_text).into());
        }

        let result: ChannelsListResponse = response.json().await?;
        Ok(result.value)
    }

    /// Get user presence status
    pub async fn get_user_presence(
        &self,
        user_id: &str,
    ) -> Result<UserPresence, Box<dyn std::error::Error>> {
        let url = format!(
            "https://graph.microsoft.com/v1.0/users/{}/presence",
            user_id
        );

        let response = self
            .client
            .get(&url)
            .header(header::AUTHORIZATION, self.auth_header()?)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(format!("Teams API error: {}", error_text).into());
        }

        let result: UserPresence = response.json().await?;
        Ok(result)
    }

    /// Send a notification to a user
    pub async fn send_notification(
        &self,
        user_id: &str,
        notification: ActivityFeedNotification,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let url = format!(
            "https://graph.microsoft.com/v1.0/users/{}/teamwork/sendActivityNotification",
            user_id
        );

        let response = self
            .client
            .post(&url)
            .header(header::AUTHORIZATION, self.auth_header()?)
            .header(header::CONTENT_TYPE, "application/json")
            .json(&notification)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(format!("Teams API error: {}", error_text).into());
        }

        Ok(())
    }
}

// Response types
#[derive(Debug, Deserialize)]
struct TeamsAuthResponse {
    access_token: String,
    token_type: String,
    expires_in: i32,
}

#[derive(Debug, Deserialize)]
struct TeamsMessagesResponse {
    value: Vec<TeamsMessage>,
}

#[derive(Debug, Deserialize)]
struct TeamsListResponse {
    value: Vec<Team>,
}

#[derive(Debug, Deserialize)]
struct ChannelsListResponse {
    value: Vec<Channel>,
}

// Data types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamsMessage {
    pub id: String,
    #[serde(rename = "createdDateTime")]
    pub created_at: i64,
    pub from_user_id: String,
    pub from_user_name: Option<String>,
    pub body: String,
    #[serde(default)]
    pub attachments: Vec<TeamsAttachment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamsAttachment {
    pub id: String,
    #[serde(rename = "contentType")]
    pub content_type: String,
    pub content: Option<String>,
    #[serde(rename = "contentUrl")]
    pub content_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdaptiveCard {
    #[serde(rename = "type")]
    pub card_type: String, // "AdaptiveCard"
    pub version: String,   // "1.4"
    pub body: Vec<AdaptiveCardElement>,
    pub actions: Option<Vec<AdaptiveCardAction>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdaptiveCardElement {
    #[serde(rename = "type")]
    pub element_type: String, // "TextBlock", "Image", "Container"
    pub text: Option<String>,
    pub url: Option<String>,
    pub size: Option<String>,
    pub weight: Option<String>,
    pub wrap: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdaptiveCardAction {
    #[serde(rename = "type")]
    pub action_type: String, // "Action.Submit", "Action.OpenUrl"
    pub title: String,
    pub url: Option<String>,
    pub data: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamsMeeting {
    pub id: String,
    #[serde(rename = "joinWebUrl")]
    pub join_url: String,
    pub subject: String,
    #[serde(rename = "startDateTime")]
    pub start_time: String,
    #[serde(rename = "endDateTime")]
    pub end_time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamsActivity {
    #[serde(rename = "type")]
    pub activity_type: String, // "message", "mention", etc.
    pub text: Option<String>,
    pub from: Option<TeamsUser>,
    pub conversation: Option<TeamsConversation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamsUser {
    pub id: String,
    pub name: String,
    #[serde(rename = "aadObjectId")]
    pub aad_object_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamsConversation {
    pub id: String,
    #[serde(rename = "conversationType")]
    pub conversation_type: String, // "channel", "groupChat", "personal"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Team {
    pub id: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Channel {
    pub id: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPresence {
    pub availability: String, // "Available", "Busy", "Away", "BeRightBack", "DoNotDisturb", "Offline"
    pub activity: String,     // "Available", "InACall", "InAMeeting", etc.
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityFeedNotification {
    pub topic: ActivityFeedTopic,
    #[serde(rename = "activityType")]
    pub activity_type: String,
    #[serde(rename = "previewText")]
    pub preview_text: PreviewText,
    #[serde(rename = "templateParameters")]
    pub template_parameters: Vec<KeyValuePair>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityFeedTopic {
    pub source: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewText {
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyValuePair {
    pub name: String,
    pub value: String,
}

// Helper functions
impl AdaptiveCard {
    pub fn new() -> Self {
        Self {
            card_type: "AdaptiveCard".to_string(),
            version: "1.4".to_string(),
            body: vec![],
            actions: None,
        }
    }

    pub fn add_text(&mut self, text: &str, size: Option<&str>, weight: Option<&str>) -> &mut Self {
        self.body.push(AdaptiveCardElement {
            element_type: "TextBlock".to_string(),
            text: Some(text.to_string()),
            url: None,
            size: size.map(|s| s.to_string()),
            weight: weight.map(|w| w.to_string()),
            wrap: Some(true),
        });
        self
    }

    pub fn add_image(&mut self, url: &str) -> &mut Self {
        self.body.push(AdaptiveCardElement {
            element_type: "Image".to_string(),
            text: None,
            url: Some(url.to_string()),
            size: None,
            weight: None,
            wrap: None,
        });
        self
    }

    pub fn add_action(&mut self, title: &str, url: &str) -> &mut Self {
        if self.actions.is_none() {
            self.actions = Some(vec![]);
        }
        if let Some(actions) = &mut self.actions {
            actions.push(AdaptiveCardAction {
                action_type: "Action.OpenUrl".to_string(),
                title: title.to_string(),
                url: Some(url.to_string()),
                data: None,
            });
        }
        self
    }
}

impl Default for AdaptiveCard {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_adaptive_card_creation() {
        let mut card = AdaptiveCard::new();
        card.add_text("Hello, Teams!", Some("Large"), Some("Bolder"))
            .add_action("Learn More", "https://example.com");

        assert_eq!(card.body.len(), 1);
        assert_eq!(card.actions.as_ref().unwrap().len(), 1);
    }

    #[test]
    fn test_adaptive_card_default() {
        let card = AdaptiveCard::default();
        assert_eq!(card.card_type, "AdaptiveCard");
        assert_eq!(card.version, "1.4");
    }
}
