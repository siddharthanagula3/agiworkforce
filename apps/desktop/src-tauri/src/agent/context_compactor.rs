/// Automatic Context Compaction System
///
/// Automatically compacts conversation history when approaching token limits,
/// similar to Cursor and Claude Code. Keeps recent messages intact and summarizes
/// older messages to maintain context while staying within limits.
use crate::db::models::{Message, MessageRole};
use crate::router::LLMRouter;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// Configuration for context compaction
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompactionConfig {
    /// Maximum tokens before compaction is triggered
    pub max_tokens: usize,
    /// Target tokens after compaction (should be < max_tokens)
    pub target_tokens: usize,
    /// Number of recent messages to keep intact (never summarize)
    pub keep_recent: usize,
    /// Minimum messages before compaction is considered
    pub min_messages: usize,
}

impl Default for CompactionConfig {
    fn default() -> Self {
        Self {
            max_tokens: 100_000,   // ~75k tokens for GPT-4, ~200k for Claude
            target_tokens: 50_000, // Target ~50% reduction
            keep_recent: 10,       // Keep last 10 messages intact
            min_messages: 20,      // Only compact if 20+ messages
        }
    }
}

/// Result of compaction operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompactionResult {
    pub messages_compacted: usize,
    pub tokens_before: usize,
    pub tokens_after: usize,
    pub summary_created: bool,
    pub summary_message_id: Option<i64>,
}

/// Context Compactor for automatic conversation management
pub struct ContextCompactor {
    pub config: CompactionConfig,
    llm_router: Option<Arc<LLMRouter>>,
}

impl ContextCompactor {
    pub fn new(config: CompactionConfig) -> Self {
        Self {
            config,
            llm_router: None,
        }
    }

    pub fn with_default_config() -> Self {
        Self::new(CompactionConfig::default())
    }

    pub fn set_llm_router(&mut self, router: Arc<LLMRouter>) {
        self.llm_router = Some(router);
    }

    /// Check if compaction is needed and perform it if so
    pub async fn compact_if_needed(
        &self,
        messages: &[Message],
    ) -> Result<Option<CompactionResult>> {
        // Calculate total tokens
        let total_tokens: usize = messages
            .iter()
            .map(|m| m.tokens.unwrap_or(0) as usize)
            .sum();

        // Check if compaction is needed
        if total_tokens < self.config.max_tokens {
            return Ok(None);
        }

        // Check minimum message count
        if messages.len() < self.config.min_messages {
            return Ok(None);
        }

        // Perform compaction
        self.compact(messages).await
    }

    /// Compact conversation history
    async fn compact(&self, messages: &[Message]) -> Result<Option<CompactionResult>> {
        let total_tokens: usize = messages
            .iter()
            .map(|m| m.tokens.unwrap_or(0) as usize)
            .sum();

        // Split messages into recent (keep) and old (summarize)
        let keep_count = self.config.keep_recent.min(messages.len());
        let (recent_messages, old_messages) = messages.split_at(messages.len() - keep_count);

        if old_messages.is_empty() {
            return Ok(None);
        }

        // Calculate tokens in old messages
        let _old_tokens: usize = old_messages
            .iter()
            .map(|m| m.tokens.unwrap_or(0) as usize)
            .sum();

        // Generate summary of old messages
        let summary = self.generate_summary(old_messages).await?;

        // Calculate new token count
        let summary_tokens = self.estimate_tokens(&summary);
        let recent_tokens: usize = recent_messages
            .iter()
            .map(|m| m.tokens.unwrap_or(0) as usize)
            .sum();
        let tokens_after = summary_tokens + recent_tokens;

        Ok(Some(CompactionResult {
            messages_compacted: old_messages.len(),
            tokens_before: total_tokens,
            tokens_after,
            summary_created: true,
            summary_message_id: None, // Will be set when message is created
        }))
    }

    /// Generate summary of old messages using LLM
    pub async fn generate_summary(&self, messages: &[Message]) -> Result<String> {
        if let Some(ref router) = self.llm_router {
            self.generate_summary_with_llm(router, messages).await
        } else {
            // Fallback: Simple heuristic-based summary
            Ok(self.generate_summary_heuristic(messages))
        }
    }

    /// Generate summary using LLM
    async fn generate_summary_with_llm(
        &self,
        router: &Arc<LLMRouter>,
        messages: &[Message],
    ) -> Result<String> {
        // Build conversation context
        let mut conversation_text = String::new();
        conversation_text.push_str("Summarize the following conversation history, preserving:\n");
        conversation_text.push_str("- Key decisions and outcomes\n");
        conversation_text.push_str("- Important context and constraints\n");
        conversation_text.push_str("- Code changes and implementations\n");
        conversation_text.push_str("- User preferences and requirements\n");
        conversation_text.push_str("- Tasks completed and in progress\n");
        conversation_text.push_str("- Error messages and resolutions\n\n");
        conversation_text.push_str("Be concise but comprehensive. Keep technical details.\n\n");
        conversation_text.push_str("Conversation:\n\n");

        for msg in messages {
            let truncated_content = if msg.content.len() > 1000 {
                format!("{}... [truncated]", &msg.content[..1000])
            } else {
                msg.content.clone()
            };
            conversation_text.push_str(&format!(
                "[{}]: {}\n\n",
                msg.role.as_str(),
                truncated_content
            ));
        }

        // Use LLM to generate summary
        match router.send_message(&conversation_text, None).await {
            Ok(summary) => Ok(summary),
            Err(e) => {
                tracing::warn!(
                    "LLM summary generation failed: {}, using heuristic fallback",
                    e
                );
                Ok(self.generate_summary_heuristic(messages))
            }
        }
    }

    /// Generate heuristic-based summary (fallback)
    fn generate_summary_heuristic(&self, messages: &[Message]) -> String {
        let mut summary = String::from("**Conversation Summary**\n\n");

        // Extract key information
        let mut user_requests = Vec::new();
        let mut assistant_responses = Vec::new();
        let mut code_blocks = Vec::new();

        for msg in messages {
            match msg.role {
                MessageRole::User => {
                    if msg.content.len() > 50 {
                        user_requests.push(msg.content.chars().take(200).collect::<String>());
                    }
                }
                MessageRole::Assistant => {
                    if msg.content.contains("```") {
                        code_blocks.push("Code changes were made");
                    }
                    if msg.content.len() > 100 {
                        assistant_responses.push(msg.content.chars().take(200).collect::<String>());
                    }
                }
                MessageRole::System => {
                    summary.push_str(&format!("System: {}\n", msg.content));
                }
            }
        }

        if !user_requests.is_empty() {
            summary.push_str("**User Requests:**\n");
            for (i, req) in user_requests.iter().take(5).enumerate() {
                summary.push_str(&format!("{}. {}\n", i + 1, req));
            }
            summary.push_str("\n");
        }

        if !code_blocks.is_empty() {
            summary.push_str("**Code Changes:** Multiple code modifications were made.\n\n");
        }

        if !assistant_responses.is_empty() {
            summary.push_str("**Assistant Responses:**\n");
            for (i, resp) in assistant_responses.iter().take(3).enumerate() {
                summary.push_str(&format!("{}. {}\n", i + 1, resp));
            }
        }

        summary
    }

    /// Estimate token count for text (rough approximation)
    fn estimate_tokens(&self, text: &str) -> usize {
        // Rough approximation: ~4 characters per token
        // In production, use actual tokenizer
        text.chars().count() / 4
    }

    /// Get compacted message list (recent + summary)
    pub fn get_compacted_messages(&self, messages: &[Message], summary: &str) -> Vec<Message> {
        let keep_count = self.config.keep_recent.min(messages.len());
        let (recent_messages, _old_messages) = messages.split_at(messages.len() - keep_count);

        let mut compacted = Vec::new();

        // Add summary message if we have old messages to summarize
        if !_old_messages.is_empty() {
            let summary_msg = Message {
                id: 0, // Will be set by database
                conversation_id: messages[0].conversation_id,
                role: MessageRole::System,
                content: format!("[Compacted Context]\n\n{}", summary),
                tokens: Some(self.estimate_tokens(summary) as i32),
                cost: None,
                provider: None,
                model: None,
                created_at: chrono::Utc::now(),
            };
            compacted.push(summary_msg);
        }

        // Add recent messages
        compacted.extend_from_slice(recent_messages);

        compacted
    }

    /// Calculate token usage for messages
    pub fn calculate_tokens(messages: &[Message]) -> usize {
        messages
            .iter()
            .map(|m| m.tokens.unwrap_or(0) as usize)
            .sum()
    }

    /// Check if compaction would be beneficial
    pub fn should_compact(&self, messages: &[Message]) -> bool {
        if messages.len() < self.config.min_messages {
            return false;
        }

        let total_tokens = Self::calculate_tokens(messages);
        total_tokens >= self.config.max_tokens
    }
}

impl Default for ContextCompactor {
    fn default() -> Self {
        Self::with_default_config()
    }
}
