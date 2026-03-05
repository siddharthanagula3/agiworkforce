use crate::core::llm::LLMRouter;
use crate::data::db::models::{Message, MessageRole};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompactionConfig {
    pub max_tokens: usize,

    pub target_tokens: usize,

    pub keep_recent: usize,

    pub min_messages: usize,
}

impl Default for CompactionConfig {
    fn default() -> Self {
        Self {
            max_tokens: 100_000,
            target_tokens: 50_000,
            keep_recent: 10,
            min_messages: 20,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompactionResult {
    pub messages_compacted: usize,
    pub tokens_before: usize,
    pub tokens_after: usize,
    pub summary_created: bool,
    pub summary_message_id: Option<i64>,
}

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

    pub async fn compact_if_needed(
        &self,
        messages: &[Message],
    ) -> Result<Option<CompactionResult>> {
        let total_tokens: usize = messages
            .iter()
            .map(|m| m.tokens.unwrap_or(0) as usize)
            .sum();

        if total_tokens < self.config.max_tokens {
            return Ok(None);
        }

        if messages.len() < self.config.min_messages {
            return Ok(None);
        }

        self.compact(messages).await
    }

    async fn compact(&self, messages: &[Message]) -> Result<Option<CompactionResult>> {
        let total_tokens: usize = messages
            .iter()
            .map(|m| m.tokens.unwrap_or(0) as usize)
            .sum();

        let keep_count = self.config.keep_recent.min(messages.len());
        let (old_messages, recent_messages) = messages.split_at(messages.len() - keep_count);

        if old_messages.is_empty() {
            return Ok(None);
        }

        let old_tokens: usize = old_messages
            .iter()
            .map(|m| m.tokens.unwrap_or(0) as usize)
            .sum();

        let summary = self.generate_summary(old_messages).await?;

        let summary_tokens = self.estimate_tokens(&summary);

        // Short-circuit: if the summary is larger than the original messages,
        // compaction is counterproductive — skip it.
        if summary_tokens >= old_tokens {
            return Ok(None);
        }
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
            summary_message_id: None,
        }))
    }

    pub async fn generate_summary(&self, messages: &[Message]) -> Result<String> {
        if self.llm_router.is_some() {
            self.generate_summary_with_llm(messages).await
        } else {
            Ok(self.generate_summary_heuristic(messages))
        }
    }

    async fn generate_summary_with_llm(&self, messages: &[Message]) -> Result<String> {
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
                let truncated: String = msg.content.chars().take(250).collect();
                format!("{}... [truncated]", truncated)
            } else {
                msg.content.clone()
            };
            conversation_text.push_str(&format!(
                "[{}]: {}\n\n",
                msg.role.as_str(),
                truncated_content
            ));
        }

        if let Some(router) = &self.llm_router {
            match router.send_message(&conversation_text, None).await {
                Ok(response) => {
                    tracing::info!("Generated LLM-powered summary");
                    Ok(response)
                }
                Err(e) => {
                    tracing::warn!("LLM summary failed, using heuristic fallback: {}", e);
                    Ok(self.generate_summary_heuristic(messages))
                }
            }
        } else {
            tracing::debug!("No LLM router available, using heuristic summary");
            Ok(self.generate_summary_heuristic(messages))
        }
    }

    fn generate_summary_heuristic(&self, messages: &[Message]) -> String {
        let mut summary = String::from("**Conversation Summary**\n\n");

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
            summary.push('\n');
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

    fn estimate_tokens(&self, text: &str) -> usize {
        text.chars().count() / 4
    }

    pub fn get_compacted_messages(&self, messages: &[Message], summary: &str) -> Vec<Message> {
        let keep_count = self.config.keep_recent.min(messages.len());
        let (_old_messages, recent_messages) = messages.split_at(messages.len() - keep_count);

        let mut compacted = Vec::new();

        if !_old_messages.is_empty() {
            let summary_msg = Message {
                id: 0,
                conversation_id: messages[0].conversation_id,
                role: MessageRole::System,
                content: format!("[Compacted Context]\n\n{}", summary),
                tokens: Some(self.estimate_tokens(summary) as i32),
                cost: None,
                provider: None,
                model: None,
                created_at: chrono::Utc::now(),
                user_id: messages[0].user_id.clone(),
                parent_message_id: None,
                branch_id: Some("main".to_string()),
            };
            compacted.push(summary_msg);
        }

        compacted.extend_from_slice(recent_messages);

        compacted
    }

    pub fn calculate_tokens(messages: &[Message]) -> usize {
        messages
            .iter()
            .map(|m| m.tokens.unwrap_or(0) as usize)
            .sum()
    }

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
