
use serde::{Deserialize, Serialize};

/// A content block within a message (supports text, images, and tool interactions).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
    /// Base64-encoded image with MIME type (e.g. "image/png"). Created by
    /// image attachment paths (the CLI's `--file / -f` flag). Provider
    /// serializers translate this into the correct provider-specific format.
    #[serde(rename = "image")]
    Image {
        /// MIME type, e.g. "image/png", "image/jpeg", "image/webp", "image/gif".
        mime: String,
        data_b64: String,
    },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        content: String,
        #[serde(default)]
        is_error: bool,
    },
}

#[derive(Debug, Clone, Serialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
    /// Tool only reads filesystem / network state; never mutates. Read-only
    /// tools are safe to batch concurrently.
    #[serde(skip)]
    #[serde(default)]
    pub is_read_only: bool,
    /// Tool can run concurrently with other concurrency-safe tools without
    /// races. Defaults to false; only set true after auditing the tool for
    /// shared mutable state.
    #[serde(skip)]
    #[serde(default)]
    pub is_concurrency_safe: bool,
    /// Per-tool override for output truncation in chars. None falls back to
    /// the executor's global cap. Larger for `web_fetch`, smaller for
    /// status-only tools.
    #[serde(skip)]
    #[serde(default)]
    pub max_result_size_chars: Option<usize>,
    #[serde(skip)]
    #[serde(default)]
    pub should_defer: bool,
    /// Compatibility aliases accepted by executor/schema lookup. Kept local so
    /// reference-compatible names (`Read`, `Bash`, etc.) do not leak into provider
    /// schemas.
    #[serde(skip)]
    #[serde(default)]
    pub aliases: Vec<String>,
    /// Owning runtime lane/module for diagnostics and future delegated work.
    #[serde(skip)]
    #[serde(default)]
    pub owner: String,
    /// Permission intent used by diagnostics and guardrail tests.
    #[serde(skip)]
    #[serde(default)]
    pub permission_class: String,
    /// Stable tags for doctor output, metrics, and future tool-management UI.
    #[serde(skip)]
    #[serde(default)]
    pub diagnostic_tags: Vec<String>,
}

/// A fully-assembled tool call parsed from a provider response.
///
/// (The CLI re-exports this as `ToolCallResponse`.)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MessageContent {
    Text(String),
    Blocks(Vec<ContentBlock>),
}

/// A single message in a conversation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: MessageContent,
}

impl Message {
    /// Create a simple text message.
    pub fn text(role: &str, text: impl Into<String>) -> Self {
        Self {
            role: role.to_string(),
            content: MessageContent::Text(text.into()),
        }
    }

    /// Create a message with content blocks.
    pub fn blocks(role: &str, blocks: Vec<ContentBlock>) -> Self {
        Self {
            role: role.to_string(),
            content: MessageContent::Blocks(blocks),
        }
    }

    /// Extract text content from this message (concatenates all text blocks).
    pub fn text_content(&self) -> String {
        match &self.content {
            MessageContent::Text(t) => t.clone(),
            MessageContent::Blocks(blocks) => blocks
                .iter()
                .filter_map(|b| match b {
                    ContentBlock::Text { text } => Some(text.as_str()),
                    ContentBlock::Image { .. }
                    | ContentBlock::ToolUse { .. }
                    | ContentBlock::ToolResult { .. } => None,
                })
                .collect::<Vec<_>>()
                .join(""),
        }
    }
}
