use crate::db::models::Message;
use crate::router::{ChatMessage, LLMRouter, RouterPreferences};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// Context Manager - manages conversation context to prevent token limit issues
/// Implements auto-compaction similar to Cursor's context management
pub struct ContextManager {
    max_tokens: usize,
    warning_threshold: f32, // % of max_tokens to trigger compaction
    messages: Vec<Message>,
    summaries: Vec<Summary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Summary {
    pub id: String,
    pub original_message_ids: Vec<String>,
    pub content: String,
    pub token_count: usize,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone)]
pub struct CompactionResult {
    pub messages_compacted: usize,
    pub tokens_saved: usize,
    pub summary_count: usize,
}

impl ContextManager {
    pub fn new(max_tokens: usize) -> Self {
        Self {
            max_tokens,
            warning_threshold: 0.7, // Compact at 70% capacity
            messages: Vec::new(),
            summaries: Vec::new(),
        }
    }

    /// Load messages from conversation
    pub fn load_messages(&mut self, messages: Vec<Message>) {
        self.messages = messages;
    }

    /// Get current token count (approximation)
    pub fn current_tokens(&self) -> usize {
        self.messages
            .iter()
            .filter_map(|m| m.tokens)
            .map(|t| t as usize)
            .sum::<usize>()
            + self.summaries.iter().map(|s| s.token_count).sum::<usize>()
    }

    /// Check if compaction is needed
    pub fn needs_compaction(&self) -> bool {
        let current = self.current_tokens();
        let threshold = (self.max_tokens as f32 * self.warning_threshold) as usize;
        current > threshold
    }

    /// Auto-compact conversation if needed
    pub async fn compact_if_needed(
        &mut self,
        router: Arc<tokio::sync::Mutex<LLMRouter>>,
    ) -> Result<Option<CompactionResult>> {
        if self.needs_compaction() {
            tracing::info!(
                "[ContextManager] Compaction triggered: {}/{} tokens ({}%)",
                self.current_tokens(),
                self.max_tokens,
                (self.current_tokens() as f32 / self.max_tokens as f32 * 100.0) as u32
            );
            Ok(Some(self.auto_compact(router).await?))
        } else {
            Ok(None)
        }
    }

    /// Perform automatic compaction
    async fn auto_compact(
        &mut self,
        router: Arc<tokio::sync::Mutex<LLMRouter>>,
    ) -> Result<CompactionResult> {
        // 1. Identify compactable segments (keep recent messages, compact old ones)
        let keep_recent = 10; // Keep last 10 messages
        let total_messages = self.messages.len();

        if total_messages <= keep_recent {
            return Ok(CompactionResult {
                messages_compacted: 0,
                tokens_saved: 0,
                summary_count: 0,
            });
        }

        let compactable_end = total_messages - keep_recent;
        let mut segments = self.identify_segments(&self.messages[..compactable_end]);

        let mut total_compacted = 0;
        let mut total_tokens_saved = 0;
        let mut summaries_created = 0;

        // 2. Summarize each segment
        for segment in &mut segments {
            if let Some(summary) = self
                .summarize_segment(segment.clone(), router.clone())
                .await?
            {
                let tokens_before: usize = segment
                    .messages
                    .iter()
                    .filter_map(|m| m.tokens)
                    .map(|t| t as usize)
                    .sum();
                let tokens_after = summary.token_count;

                total_compacted += segment.messages.len();
                total_tokens_saved += tokens_before.saturating_sub(tokens_after);
                summaries_created += 1;

                self.summaries.push(summary);
            }
        }

        // 3. Remove compacted messages
        self.messages.drain(..compactable_end);

        tracing::info!(
            "[ContextManager] Compaction complete: {} messages → {} summaries, saved {} tokens",
            total_compacted,
            summaries_created,
            total_tokens_saved
        );

        Ok(CompactionResult {
            messages_compacted: total_compacted,
            tokens_saved: total_tokens_saved,
            summary_count: summaries_created,
        })
    }

    /// Identify logical segments in conversation (by topic/task)
    fn identify_segments(&self, messages: &[Message]) -> Vec<ConversationSegment> {
        let mut segments = Vec::new();
        let mut current_segment = Vec::new();
        let segment_size = 5; // Group every 5 messages into a segment

        for (i, message) in messages.iter().enumerate() {
            current_segment.push(message.clone());

            if current_segment.len() >= segment_size || i == messages.len() - 1 {
                segments.push(ConversationSegment {
                    messages: current_segment.clone(),
                    _start_idx: i.saturating_sub(current_segment.len() - 1),
                    _end_idx: i,
                });
                current_segment.clear();
            }
        }

        segments
    }

    /// Summarize a segment of conversation
    async fn summarize_segment(
        &self,
        segment: ConversationSegment,
        router: Arc<tokio::sync::Mutex<LLMRouter>>,
    ) -> Result<Option<Summary>> {
        if segment.messages.is_empty() {
            return Ok(None);
        }

        // Build prompt for summarization
        let conversation_text = segment
            .messages
            .iter()
            .map(|m| format!("{}: {}", m.role.as_str(), m.content))
            .collect::<Vec<_>>()
            .join("\n\n");

        let summarization_prompt = format!(
            "Summarize the following conversation segment, preserving key information like file paths, variables, decisions, and errors:\n\n{}\n\nProvide a concise summary that captures the essential context.",
            conversation_text
        );

        // Use LLM to generate summary
        let router_guard = router.lock().await;
        let summary_response = router_guard
            .send_message(
                &summarization_prompt,
                Some(RouterPreferences {
                    provider: None,
                    model: Some("gpt-4o-mini".to_string()), // Use fast, cheap model
                    strategy: crate::router::RoutingStrategy::Auto,
                }),
            )
            .await?;
        drop(router_guard);

        // Estimate token count (rough approximation: 1 token ≈ 4 characters)
        let token_count = summary_response.len() / 4;

        Ok(Some(Summary {
            id: uuid::Uuid::new_v4().to_string(),
            original_message_ids: segment.messages.iter().map(|m| m.id.to_string()).collect(),
            content: summary_response,
            token_count,
            created_at: chrono::Utc::now(),
        }))
    }

    /// Get messages for LLM request (includes summaries)
    pub fn get_messages_for_llm(&self) -> Vec<ChatMessage> {
        let mut result = Vec::new();

        // Add summaries first
        for summary in &self.summaries {
            result.push(ChatMessage {
                role: "system".to_string(),
                content: format!("[Previous conversation summary]: {}", summary.content),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            });
        }

        // Add recent messages
        for message in &self.messages {
            result.push(ChatMessage {
                role: message.role.as_str().to_string(),
                content: message.content.clone(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            });
        }

        result
    }

    /// Get compaction statistics
    pub fn get_stats(&self) -> CompactionStats {
        CompactionStats {
            total_messages: self.messages.len(),
            total_summaries: self.summaries.len(),
            current_tokens: self.current_tokens(),
            max_tokens: self.max_tokens,
            usage_percent: (self.current_tokens() as f32 / self.max_tokens as f32 * 100.0),
            needs_compaction: self.needs_compaction(),
        }
    }
}

#[derive(Debug, Clone)]
struct ConversationSegment {
    messages: Vec<Message>,
    _start_idx: usize,
    _end_idx: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompactionStats {
    pub total_messages: usize,
    pub total_summaries: usize,
    pub current_tokens: usize,
    pub max_tokens: usize,
    pub usage_percent: f32,
    pub needs_compaction: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_context_manager_creation() {
        let cm = ContextManager::new(8000);
        assert_eq!(cm.max_tokens, 8000);
        assert_eq!(cm.current_tokens(), 0);
        assert!(!cm.needs_compaction());
    }

    #[test]
    fn test_needs_compaction() {
        let mut cm = ContextManager::new(1000);
        cm.messages = vec![
            Message {
                id: 1,
                conversation_id: 1,
                role: crate::db::models::MessageRole::User,
                content: "test".to_string(),
                tokens: Some(700), // 70% of max
                ..Default::default()
            },
            Message {
                id: 2,
                conversation_id: 1,
                role: crate::db::models::MessageRole::Assistant,
                content: "response".to_string(),
                tokens: Some(100),
                ..Default::default()
            },
        ];

        assert!(cm.needs_compaction()); // 800 tokens > 70% of 1000
    }

    #[test]
    fn test_segment_identification() {
        let cm = ContextManager::new(8000);
        let messages = (0..12)
            .map(|i| Message {
                id: i,
                conversation_id: 1,
                role: crate::db::models::MessageRole::User,
                content: format!("Message {}", i),
                ..Default::default()
            })
            .collect::<Vec<_>>();

        let segments = cm.identify_segments(&messages);
        assert_eq!(segments.len(), 3); // 12 messages / 5 per segment = 2.4 → 3 segments
    }
}
