use crate::data::db::models::{
    Conversation, ConversationCostBreakdown, CostTimeseriesPoint, Message, MessageRole,
    ProviderCostBreakdown,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateConversationRequest {
    pub title: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateMessageRequest {
    pub conversation_id: i64,
    pub role: MessageRole,
    pub content: String,
    pub tokens: Option<i32>,
    pub cost: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateConversationRequest {
    pub title: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatSendMessageRequest {
    #[serde(default, alias = "conversationId")]
    pub conversation_id: Option<i64>,
    pub content: String,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default, alias = "providerOverride")]
    pub provider_override: Option<String>,
    #[serde(default, alias = "modelOverride")]
    pub model_override: Option<String>,
    #[serde(default)]
    pub strategy: Option<String>,
    #[serde(default)]
    pub stream: Option<bool>,
    #[serde(default, alias = "enableTools")]
    pub enable_tools: Option<bool>,
    #[serde(default, alias = "conversationMode")]
    pub conversation_mode: Option<String>,
    #[serde(default, alias = "workflowHash")]
    pub workflow_hash: Option<String>,
    #[serde(default, alias = "taskMetadata")]
    pub task_metadata: Option<TaskMetadata>,

    #[serde(default, alias = "focusMode")]
    pub focus_mode: Option<String>,

    #[serde(default)]
    pub attachments: Option<Vec<ChatAttachment>>,
    #[serde(default, alias = "thinkingMode")]
    pub thinking_mode: Option<bool>,

    #[serde(default, alias = "enableAgentMode")]
    pub enable_agent_mode: Option<bool>,
    #[serde(default, alias = "preferCloudCredits")]
    pub prefer_cloud_credits: bool,

    // Frontend message ID for event coordination
    #[serde(default, alias = "frontendMessageId")]
    pub frontend_message_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatAttachment {
    pub id: String,
    #[serde(rename = "type")]
    pub attachment_type: String,
    pub name: String,
    #[serde(default)]
    pub mime_type: Option<String>,

    #[serde(default)]
    pub content: Option<String>,

    #[serde(default)]
    pub path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskMetadata {
    #[serde(default)]
    pub intents: Vec<String>,
    #[serde(default)]
    pub requires_vision: bool,
    #[serde(default)]
    pub token_estimate: Option<u32>,
    #[serde(default)]
    pub cost_priority: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ChatSendMessageResponse {
    pub conversation: Conversation,
    pub user_message: Message,
    pub assistant_message: Message,
    pub stats: ConversationStats,
    pub last_message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ConversationStats {
    pub message_count: usize,
    pub total_tokens: i32,
    pub total_cost: f64,
}

#[derive(Debug, Serialize)]
pub struct CostOverviewResponse {
    pub today_total: f64,
    pub month_total: f64,
    pub monthly_budget: Option<f64>,
    pub remaining_budget: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct CostAnalyticsResponse {
    pub timeseries: Vec<CostTimeseriesPoint>,
    pub providers: Vec<ProviderCostBreakdown>,
    pub top_conversations: Vec<ConversationCostBreakdown>,
}
