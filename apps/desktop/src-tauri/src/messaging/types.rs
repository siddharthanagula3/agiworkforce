use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum MessagingPlatform {
    Slack,
    WhatsApp,
    Teams,
}

impl MessagingPlatform {
    pub fn as_str(&self) -> &str {
        match self {
            MessagingPlatform::Slack => "slack",
            MessagingPlatform::WhatsApp => "whatsapp",
            MessagingPlatform::Teams => "teams",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "slack" => Some(MessagingPlatform::Slack),
            "whatsapp" => Some(MessagingPlatform::WhatsApp),
            "teams" => Some(MessagingPlatform::Teams),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedMessage {
    pub id: String,
    pub platform: MessagingPlatform,
    pub channel_id: String,
    pub sender_id: String,
    pub sender_name: Option<String>,
    pub text: String,
    pub timestamp: i64,
    pub attachments: Vec<Attachment>,
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attachment {
    pub attachment_type: AttachmentType,
    pub url: String,
    pub filename: Option<String>,
    pub size: Option<u64>,
    pub mime_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AttachmentType {
    Image,
    Video,
    Audio,
    Document,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageThread {
    pub thread_id: String,
    pub messages: Vec<UnifiedMessage>,
    pub participants: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendMessageRequest {
    pub platform: MessagingPlatform,
    pub channel_id: String,
    pub text: String,
    pub attachments: Option<Vec<String>>,
    pub thread_id: Option<String>,
    pub reply_to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendMessageResponse {
    pub message_id: String,
    pub timestamp: i64,
    pub platform: MessagingPlatform,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessagingConnection {
    pub id: String,
    pub user_id: String,
    pub platform: MessagingPlatform,
    pub workspace_id: Option<String>,
    pub workspace_name: Option<String>,
    pub is_active: bool,
    pub created_at: i64,
    pub last_used_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessagingError {
    pub code: String,
    pub message: String,
    pub platform: MessagingPlatform,
}

impl std::fmt::Display for MessagingError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{} error [{}]: {}",
            self.platform.as_str(),
            self.code,
            self.message
        )
    }
}

impl std::error::Error for MessagingError {}

pub type MessagingResult<T> = Result<T, MessagingError>;

use super::{SlackClient, TeamsClient, WhatsAppClient};

/// Unified router for all messaging platforms
pub struct MessagingRouter {
    slack: Option<SlackClient>,
    whatsapp: Option<WhatsAppClient>,
    teams: Option<TeamsClient>,
}

impl MessagingRouter {
    pub fn new() -> Self {
        Self {
            slack: None,
            whatsapp: None,
            teams: None,
        }
    }

    pub fn set_slack(&mut self, client: SlackClient) {
        self.slack = Some(client);
    }

    pub fn set_whatsapp(&mut self, client: WhatsAppClient) {
        self.whatsapp = Some(client);
    }

    pub fn set_teams(&mut self, client: TeamsClient) {
        self.teams = Some(client);
    }

    pub async fn send_message(
        &mut self,
        request: SendMessageRequest,
    ) -> MessagingResult<SendMessageResponse> {
        match request.platform {
            MessagingPlatform::Slack => {
                let client = self.slack.as_ref().ok_or_else(|| MessagingError {
                    code: "NOT_CONFIGURED".to_string(),
                    message: "Slack client not configured".to_string(),
                    platform: MessagingPlatform::Slack,
                })?;

                let result = client
                    .send_message(&request.channel_id, &request.text)
                    .await
                    .map_err(|e| MessagingError {
                        code: "SEND_FAILED".to_string(),
                        message: e.to_string(),
                        platform: MessagingPlatform::Slack,
                    })?;

                Ok(SendMessageResponse {
                    message_id: result.ts,
                    timestamp: chrono::Utc::now().timestamp(),
                    platform: MessagingPlatform::Slack,
                })
            }
            MessagingPlatform::WhatsApp => {
                let client = self.whatsapp.as_ref().ok_or_else(|| MessagingError {
                    code: "NOT_CONFIGURED".to_string(),
                    message: "WhatsApp client not configured".to_string(),
                    platform: MessagingPlatform::WhatsApp,
                })?;

                let message_id = client
                    .send_text(&request.channel_id, &request.text)
                    .await
                    .map_err(|e| MessagingError {
                        code: "SEND_FAILED".to_string(),
                        message: e.to_string(),
                        platform: MessagingPlatform::WhatsApp,
                    })?;

                Ok(SendMessageResponse {
                    message_id,
                    timestamp: chrono::Utc::now().timestamp(),
                    platform: MessagingPlatform::WhatsApp,
                })
            }
            MessagingPlatform::Teams => {
                let client = self.teams.as_mut().ok_or_else(|| MessagingError {
                    code: "NOT_CONFIGURED".to_string(),
                    message: "Teams client not configured".to_string(),
                    platform: MessagingPlatform::Teams,
                })?;

                let result = client
                    .send_message(&request.channel_id, &request.text)
                    .await
                    .map_err(|e| MessagingError {
                        code: "SEND_FAILED".to_string(),
                        message: e.to_string(),
                        platform: MessagingPlatform::Teams,
                    })?;

                Ok(SendMessageResponse {
                    message_id: result.id,
                    timestamp: chrono::Utc::now().timestamp(),
                    platform: MessagingPlatform::Teams,
                })
            }
        }
    }

    pub async fn get_message_history(
        &mut self,
        platform: MessagingPlatform,
        channel_id: &str,
        limit: usize,
    ) -> MessagingResult<Vec<UnifiedMessage>> {
        match platform {
            MessagingPlatform::Slack => {
                let client = self.slack.as_ref().ok_or_else(|| MessagingError {
                    code: "NOT_CONFIGURED".to_string(),
                    message: "Slack client not configured".to_string(),
                    platform: MessagingPlatform::Slack,
                })?;

                let messages = client
                    .get_conversation_history(channel_id, limit)
                    .await
                    .map_err(|e| MessagingError {
                        code: "FETCH_FAILED".to_string(),
                        message: e.to_string(),
                        platform: MessagingPlatform::Slack,
                    })?;

                Ok(messages
                    .into_iter()
                    .map(|msg| UnifiedMessage {
                        id: msg.ts.clone(),
                        platform: MessagingPlatform::Slack,
                        channel_id: msg.channel.clone(),
                        sender_id: msg.user.clone().unwrap_or_default(),
                        sender_name: None,
                        text: msg.text,
                        timestamp: msg.ts.parse::<f64>().unwrap_or(0.0) as i64,
                        attachments: vec![],
                        metadata: HashMap::new(),
                    })
                    .collect())
            }
            MessagingPlatform::WhatsApp => {
                // WhatsApp doesn't support fetching history via Business API
                Err(MessagingError {
                    code: "NOT_SUPPORTED".to_string(),
                    message: "WhatsApp Business API doesn't support message history".to_string(),
                    platform: MessagingPlatform::WhatsApp,
                })
            }
            MessagingPlatform::Teams => {
                let client = self.teams.as_mut().ok_or_else(|| MessagingError {
                    code: "NOT_CONFIGURED".to_string(),
                    message: "Teams client not configured".to_string(),
                    platform: MessagingPlatform::Teams,
                })?;

                let messages = client
                    .get_channel_messages(channel_id, limit)
                    .await
                    .map_err(|e| MessagingError {
                        code: "FETCH_FAILED".to_string(),
                        message: e.to_string(),
                        platform: MessagingPlatform::Teams,
                    })?;

                Ok(messages
                    .into_iter()
                    .map(|msg| UnifiedMessage {
                        id: msg.id.clone(),
                        platform: MessagingPlatform::Teams,
                        channel_id: channel_id.to_string(),
                        sender_id: msg.from_user_id.clone(),
                        sender_name: msg.from_user_name.clone(),
                        text: msg.body,
                        timestamp: msg.created_at,
                        attachments: vec![],
                        metadata: HashMap::new(),
                    })
                    .collect())
            }
        }
    }
}

impl Default for MessagingRouter {
    fn default() -> Self {
        Self::new()
    }
}
