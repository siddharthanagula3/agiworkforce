use crate::data::db::models::{
    Conversation, ConversationCostBreakdown, CostTimeseriesPoint, Message, MessageRole,
    ProviderCostBreakdown,
};
use serde::{Deserialize, Serialize};
use std::path::Path;

// === Smart Intent Detection ===
/// User intent types for smart routing between conversation and action
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum UserIntent {
    /// Pure conversation - user is chatting, asking questions, or seeking information
    #[default]
    Conversation,
    /// Action request - user wants something done (open, send, create, delete, etc.)
    ActionRequest,
    /// User wants to stop/cancel the current operation
    Stop,
    /// User is asking a clarifying question about a previous action or result
    Clarification,
}

impl std::fmt::Display for UserIntent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UserIntent::Conversation => write!(f, "conversation"),
            UserIntent::ActionRequest => write!(f, "action_request"),
            UserIntent::Stop => write!(f, "stop"),
            UserIntent::Clarification => write!(f, "clarification"),
        }
    }
}

/// Result of intent detection with confidence
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntentResult {
    /// The detected intent type
    pub intent: UserIntent,
    /// Confidence score from 0.0 to 1.0
    pub confidence: f32,
    /// Detected action verbs if any
    pub action_verbs: Vec<String>,
    /// Whether auto mode should be activated
    pub should_auto_execute: bool,
}

// === MEDIUM-001 fix: Input validation constants ===
/// Maximum content length for chat messages (1MB)
pub const MAX_CONTENT_LENGTH: usize = 1024 * 1024;
/// Maximum title length for conversations
pub const MAX_TITLE_LENGTH: usize = 500;
/// Maximum number of attachments per message
pub const MAX_ATTACHMENTS: usize = 20;
/// Maximum custom instructions length
pub const MAX_CUSTOM_INSTRUCTIONS_LENGTH: usize = 50_000;
/// Maximum user ID length
pub const MAX_USER_ID_LENGTH: usize = 256;

/// MEDIUM-001 fix: Validation error type
#[derive(Debug, Clone)]
pub struct ValidationError {
    pub field: String,
    pub message: String,
}

impl std::fmt::Display for ValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.field, self.message)
    }
}

impl std::error::Error for ValidationError {}

/// MEDIUM-001 fix: Validation trait for request types
pub trait Validate {
    fn validate(&self) -> Result<(), ValidationError>;
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateConversationRequest {
    pub title: String,
    pub user_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateMessageRequest {
    pub conversation_id: i64,
    pub user_id: String,
    pub role: MessageRole,
    pub content: String,
    pub tokens: Option<i32>,
    pub cost: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateConversationRequest {
    pub title: String,
    pub user_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatSendMessageRequest {
    #[serde(default, alias = "conversationId")]
    pub conversation_id: Option<i64>,
    #[serde(alias = "userId")]
    pub user_id: String,
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

    /// Deep research task ID for progress/event correlation
    #[serde(default, alias = "researchTaskId")]
    pub research_task_id: Option<String>,

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

    /// Custom instructions to include in the system prompt
    /// These are merged from global, conversation, and project instructions
    #[serde(default, alias = "customInstructions")]
    pub custom_instructions: Option<String>,

    /// Project folder path for scoping file operations
    /// When set, file and terminal tools will use this as the default working directory
    #[serde(default, alias = "projectFolder")]
    pub project_folder: Option<String>,
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

/// Task metadata containing intent classification and routing decisions
/// Passed from TypeScript frontend to Rust backend
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskMetadata {
    // Legacy fields (backward compatible)
    #[serde(default)]
    pub intents: Vec<String>,
    #[serde(default)]
    pub requires_vision: bool,
    #[serde(default)]
    pub token_estimate: Option<u32>,
    #[serde(default)]
    pub cost_priority: Option<String>,

    // New intelligent routing fields (January 2026)
    /// Primary classified intent type (chat, coding, image-gen, video-gen, search, etc.)
    #[serde(default)]
    pub intent_type: Option<String>,
    /// Model category for routing (chat, image, video, search, tts, stt, music)
    #[serde(default)]
    pub model_category: Option<String>,
    /// Selected model from intelligent routing
    #[serde(default)]
    pub selected_model: Option<String>,
    /// Tool categories that should be available
    #[serde(default)]
    pub suggested_tool_categories: Option<Vec<String>>,
    /// Whether tools should auto-execute (full autonomy mode)
    #[serde(default)]
    pub auto_execute_tools: Option<bool>,
    /// Classification confidence (0-1)
    #[serde(default)]
    pub confidence: Option<f32>,
    /// Routing reasoning for debugging
    #[serde(default)]
    pub routing_reason: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ChatSendMessageResponse {
    pub conversation: Conversation,
    pub user_message: Message,
    pub assistant_message: Message,
    pub stats: ConversationStats,
    pub last_message: Option<String>,
    pub credits: Option<crate::core::llm::CreditsInfo>,
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

// === MEDIUM-001 fix: Validation implementations ===

impl Validate for CreateConversationRequest {
    fn validate(&self) -> Result<(), ValidationError> {
        if self.title.is_empty() {
            return Err(ValidationError {
                field: "title".to_string(),
                message: "Title cannot be empty".to_string(),
            });
        }
        if self.title.len() > MAX_TITLE_LENGTH {
            return Err(ValidationError {
                field: "title".to_string(),
                message: format!(
                    "Title exceeds maximum length of {} characters",
                    MAX_TITLE_LENGTH
                ),
            });
        }
        if self.user_id.is_empty() {
            return Err(ValidationError {
                field: "user_id".to_string(),
                message: "User ID cannot be empty".to_string(),
            });
        }
        if self.user_id.len() > MAX_USER_ID_LENGTH {
            return Err(ValidationError {
                field: "user_id".to_string(),
                message: format!(
                    "User ID exceeds maximum length of {} characters",
                    MAX_USER_ID_LENGTH
                ),
            });
        }
        Ok(())
    }
}

impl Validate for ChatSendMessageRequest {
    fn validate(&self) -> Result<(), ValidationError> {
        // Validate user_id
        if self.user_id.is_empty() {
            return Err(ValidationError {
                field: "user_id".to_string(),
                message: "User ID cannot be empty".to_string(),
            });
        }
        if self.user_id.len() > MAX_USER_ID_LENGTH {
            return Err(ValidationError {
                field: "user_id".to_string(),
                message: format!(
                    "User ID exceeds maximum length of {} characters",
                    MAX_USER_ID_LENGTH
                ),
            });
        }

        // Validate content
        if self.content.len() > MAX_CONTENT_LENGTH {
            return Err(ValidationError {
                field: "content".to_string(),
                message: format!(
                    "Content exceeds maximum length of {} bytes",
                    MAX_CONTENT_LENGTH
                ),
            });
        }

        // Validate custom instructions
        if let Some(ref instructions) = self.custom_instructions {
            if instructions.len() > MAX_CUSTOM_INSTRUCTIONS_LENGTH {
                return Err(ValidationError {
                    field: "custom_instructions".to_string(),
                    message: format!(
                        "Custom instructions exceed maximum length of {} characters",
                        MAX_CUSTOM_INSTRUCTIONS_LENGTH
                    ),
                });
            }
        }

        // Validate attachments
        if let Some(ref attachments) = self.attachments {
            if attachments.len() > MAX_ATTACHMENTS {
                return Err(ValidationError {
                    field: "attachments".to_string(),
                    message: format!("Too many attachments (max: {})", MAX_ATTACHMENTS),
                });
            }
            for (i, attachment) in attachments.iter().enumerate() {
                attachment.validate().map_err(|e| ValidationError {
                    field: format!("attachments[{}].{}", i, e.field),
                    message: e.message,
                })?;
            }
        }

        Ok(())
    }
}

impl Validate for ChatAttachment {
    fn validate(&self) -> Result<(), ValidationError> {
        // Validate ID
        if self.id.is_empty() {
            return Err(ValidationError {
                field: "id".to_string(),
                message: "Attachment ID cannot be empty".to_string(),
            });
        }

        // Validate name (no path traversal)
        if self.name.contains("..") || self.name.contains('/') || self.name.contains('\\') {
            return Err(ValidationError {
                field: "name".to_string(),
                message: "Attachment name contains invalid characters".to_string(),
            });
        }

        // MEDIUM-011 fix: Validate path for traversal attacks
        if let Some(ref path) = self.path {
            if !is_safe_path(path) {
                return Err(ValidationError {
                    field: "path".to_string(),
                    message: "Path contains potentially unsafe traversal patterns".to_string(),
                });
            }
        }

        // Validate attachment type
        let valid_types = ["file", "image", "document", "code", "url"];
        if !valid_types.contains(&self.attachment_type.as_str()) {
            return Err(ValidationError {
                field: "type".to_string(),
                message: format!(
                    "Invalid attachment type '{}'. Valid types: {:?}",
                    self.attachment_type, valid_types
                ),
            });
        }

        Ok(())
    }
}

/// MEDIUM-011 fix: Check if a path is safe (no traversal attacks).
/// Returns false if the path contains suspicious patterns.
fn is_safe_path(path: &str) -> bool {
    // Check for obvious traversal patterns
    if path.contains("..") {
        return false;
    }

    // Check for null bytes (can be used to bypass checks)
    if path.contains('\0') {
        return false;
    }

    // On Windows, check for alternate data streams
    if cfg!(windows) && path.contains(':') && !path.starts_with("C:") && !path.starts_with("D:") {
        // Allow drive letters but not ADS
        let colon_count = path.matches(':').count();
        if colon_count > 1 || path.chars().nth(1) != Some(':') {
            return false;
        }
    }

    // Normalize and check the path doesn't escape
    let path_obj = Path::new(path);

    // Check each component for suspicious patterns
    for component in path_obj.components() {
        match component {
            std::path::Component::ParentDir => return false, // ".." component
            std::path::Component::Normal(s) => {
                let s_str = s.to_string_lossy();
                // Check for hidden files starting with . followed by suspicious patterns
                if s_str.starts_with('.') && s_str.len() > 1 {
                    let rest = &s_str[1..];
                    if rest.starts_with('.') || rest.is_empty() {
                        return false;
                    }
                }
            }
            _ => {}
        }
    }

    true
}
