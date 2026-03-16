//! Extended Thinking support for Claude models.
//!
//! This module provides configuration and types for Claude's extended thinking feature,
//! which allows models to "think" through complex problems before providing a response.
//!
//! # Thinking Budget Levels
//!
//! Following the Claude Code pattern, thinking is triggered by specific phrases:
//! - "think" -> Low budget (10,000 tokens)
//! - "think hard" -> Medium budget (32,000 tokens)
//! - "ultrathink" -> High budget (128,000 tokens)
//!
//! # Example
//!
//! ```rust,ignore
//! use crate::core::llm::thinking::{ThinkingConfig, ThinkingBudget};
//!
//! // Create a thinking config from user input
//! let config = ThinkingConfig::from_user_message("think hard about this problem");
//! assert!(config.enabled);
//! assert_eq!(config.budget, ThinkingBudget::Medium);
//! ```

use serde::{Deserialize, Serialize};

/// Default token budget for low thinking mode
pub const THINKING_BUDGET_LOW: u32 = 10_000;

/// Default token budget for medium thinking mode ("think hard")
pub const THINKING_BUDGET_MEDIUM: u32 = 32_000;

/// Default token budget for high thinking mode ("ultrathink")
pub const THINKING_BUDGET_HIGH: u32 = 128_000;

/// Maximum output tokens when thinking is enabled (Claude 4.5 supports up to 128K)
pub const MAX_OUTPUT_WITH_THINKING: u32 = 128_000;

/// Thinking budget levels that map to different token allocations.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThinkingBudget {
    /// Low budget thinking (10K tokens) - triggered by "think"
    #[default]
    Low,
    /// Medium budget thinking (32K tokens) - triggered by "think hard"
    Medium,
    /// High budget thinking (128K tokens) - triggered by "ultrathink"
    High,
    /// Custom token budget
    Custom(u32),
}

impl ThinkingBudget {
    /// Get the token budget for this thinking level.
    #[must_use]
    pub const fn tokens(&self) -> u32 {
        match self {
            Self::Low => THINKING_BUDGET_LOW,
            Self::Medium => THINKING_BUDGET_MEDIUM,
            Self::High => THINKING_BUDGET_HIGH,
            Self::Custom(tokens) => *tokens,
        }
    }

    /// Create a budget from a token count.
    #[must_use]
    pub const fn from_tokens(tokens: u32) -> Self {
        match tokens {
            0..=15_000 => Self::Low,
            15_001..=64_000 => Self::Medium,
            64_001.. => Self::High,
        }
    }
}

/// Configuration for extended thinking mode.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThinkingConfig {
    /// Whether thinking mode is enabled.
    pub enabled: bool,

    /// The thinking budget level.
    pub budget: ThinkingBudget,

    /// Whether to emit thinking content as events for UI visibility.
    pub emit_thinking_events: bool,

    /// Whether to include thinking summary in the response.
    /// When true, a condensed version of the thinking process is appended.
    pub include_thinking_summary: bool,
}

impl Default for ThinkingConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            budget: ThinkingBudget::Low,
            emit_thinking_events: true,
            include_thinking_summary: false,
        }
    }
}

impl ThinkingConfig {
    /// Create a new thinking config with the specified budget.
    #[must_use]
    pub const fn new(budget: ThinkingBudget) -> Self {
        Self {
            enabled: true,
            budget,
            emit_thinking_events: true,
            include_thinking_summary: false,
        }
    }

    /// Create a thinking config from user message content.
    ///
    /// Detects thinking trigger phrases:
    /// - "ultrathink" -> High budget
    /// - "think hard", "think harder", "think deeply" -> Medium budget
    /// - "think" (standalone or at phrase boundaries) -> Low budget
    #[must_use]
    pub fn from_user_message(message: &str) -> Self {
        let lower = message.to_lowercase();

        // Check for ultrathink (highest priority)
        if lower.contains("ultrathink") {
            return Self::new(ThinkingBudget::High);
        }

        // Check for "think hard" variants (medium priority)
        if lower.contains("think hard")
            || lower.contains("think harder")
            || lower.contains("think deeply")
            || lower.contains("think carefully")
            || lower.contains("think thoroughly")
        {
            return Self::new(ThinkingBudget::Medium);
        }

        // Check for standalone "think" - be careful not to match "thinking" in normal context
        // We look for "think" at word boundaries
        let think_patterns = [
            "think about",
            "think through",
            "please think",
            "let's think",
            "lets think",
            "need to think",
            "want you to think",
        ];

        for pattern in think_patterns {
            if lower.contains(pattern) {
                return Self::new(ThinkingBudget::Low);
            }
        }

        // Check if message starts with "think" or ends with "think"
        let words: Vec<&str> = lower.split_whitespace().collect();
        if words.first().is_some_and(|w| *w == "think")
            || words.last().is_some_and(|w| *w == "think")
        {
            return Self::new(ThinkingBudget::Low);
        }

        // No thinking trigger detected
        Self::default()
    }

    /// Create a disabled thinking config.
    #[must_use]
    pub const fn disabled() -> Self {
        Self {
            enabled: false,
            budget: ThinkingBudget::Low,
            emit_thinking_events: false,
            include_thinking_summary: false,
        }
    }

    /// Get the token budget for this config.
    #[must_use]
    pub const fn budget_tokens(&self) -> u32 {
        if self.enabled {
            self.budget.tokens()
        } else {
            0
        }
    }

    /// Convert this thinking config into a `ThinkingParameter` suitable for `LLMRequest`.
    ///
    /// Returns `None` when thinking is disabled.  For Anthropic Claude Opus 4.x models
    /// with tool use the caller should prefer `ThinkingParameter::Adaptive` — this
    /// method produces `Budget` or `Enabled` variants which are correct for all other
    /// thinking-capable models.
    #[must_use]
    pub fn to_thinking_parameter(&self) -> Option<super::ThinkingParameter> {
        if !self.enabled {
            return None;
        }

        let tokens = self.budget.tokens();
        if tokens > 0 {
            Some(super::ThinkingParameter::Budget {
                thinking_type: "enabled".to_string(),
                budget_tokens: tokens,
            })
        } else {
            Some(super::ThinkingParameter::Enabled(true))
        }
    }

    /// Check if a model supports extended thinking.
    #[must_use]
    pub fn model_supports_thinking(model: &str) -> bool {
        let model_lower = model.to_lowercase();

        // GPT-5 family supports reasoning controls, except nano tier.
        let is_gpt5_reasoning = (model_lower.starts_with("gpt-5")
            || model_lower.contains("gpt-5-codex")
            || model_lower.contains("gpt-5.2-codex"))
            && !model_lower.starts_with("gpt-5-nano");

        // Claude 4+ models support extended thinking
        // (broader "claude-sonnet-4" already covers "claude-sonnet-4-5", etc.)
        model_lower.contains("claude-sonnet-4")
            || model_lower.contains("claude-opus-4")
            || model_lower.contains("claude-haiku-4")
            || model_lower.contains("claude-4")
            || is_gpt5_reasoning
            // OpenAI reasoning models
            || model_lower.contains("o3")
            || model_lower.contains("o4")
            // Google deep thinking models
            || (model_lower.contains("gemini") && model_lower.contains("think"))
            // Claude 3.5 Sonnet (new)
            || model_lower.contains("claude-3-5-sonnet")
    }
}

/// Represents thinking content extracted from a model response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThinkingContent {
    /// The raw thinking text from the model.
    pub thinking: String,

    /// A signature for the thinking block (used for streaming continuity).
    pub signature: Option<String>,

    /// Token count for the thinking content (if available).
    pub thinking_tokens: Option<u32>,

    /// Timestamp when thinking started.
    pub started_at: Option<i64>,

    /// Timestamp when thinking completed.
    pub completed_at: Option<i64>,
}

impl ThinkingContent {
    /// Create new thinking content.
    #[must_use]
    pub fn new(thinking: String) -> Self {
        Self {
            thinking,
            signature: None,
            thinking_tokens: None,
            started_at: Some(chrono::Utc::now().timestamp_millis()),
            completed_at: None,
        }
    }

    /// Mark the thinking as completed.
    pub fn complete(&mut self) {
        self.completed_at = Some(chrono::Utc::now().timestamp_millis());
    }

    /// Get the duration of thinking in milliseconds.
    #[must_use]
    pub fn duration_ms(&self) -> Option<i64> {
        match (self.started_at, self.completed_at) {
            (Some(start), Some(end)) => Some(end - start),
            _ => None,
        }
    }

    /// Check if the thinking content is empty.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.thinking.trim().is_empty()
    }

    /// Generate a summary of the thinking content (first N characters).
    #[must_use]
    pub fn summary(&self, max_chars: usize) -> String {
        if self.thinking.len() <= max_chars {
            self.thinking.clone()
        } else {
            let truncated: String = self.thinking.chars().take(max_chars).collect();
            format!("{}...", truncated)
        }
    }
}

/// Event payload for thinking content updates (emitted via Tauri events).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThinkingEvent {
    /// Event type: "start", "delta", "complete"
    pub event_type: ThinkingEventType,

    /// The thinking content (full for start/complete, delta for incremental updates).
    pub content: String,

    /// Conversation or message ID this thinking belongs to.
    pub message_id: Option<String>,

    /// Token count (if available).
    pub tokens: Option<u32>,

    /// Timestamp of the event.
    pub timestamp: i64,
}

/// Types of thinking events.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ThinkingEventType {
    /// Thinking has started.
    Start,
    /// Incremental thinking content update.
    Delta,
    /// Thinking has completed.
    Complete,
}

impl ThinkingEvent {
    /// Create a new thinking start event.
    #[must_use]
    pub fn start(message_id: Option<String>) -> Self {
        Self {
            event_type: ThinkingEventType::Start,
            content: String::new(),
            message_id,
            tokens: None,
            timestamp: chrono::Utc::now().timestamp_millis(),
        }
    }

    /// Create a new thinking delta event.
    #[must_use]
    pub fn delta(content: String, message_id: Option<String>) -> Self {
        Self {
            event_type: ThinkingEventType::Delta,
            content,
            message_id,
            tokens: None,
            timestamp: chrono::Utc::now().timestamp_millis(),
        }
    }

    /// Create a new thinking complete event.
    #[must_use]
    pub fn complete(content: String, tokens: Option<u32>, message_id: Option<String>) -> Self {
        Self {
            event_type: ThinkingEventType::Complete,
            content,
            message_id,
            tokens,
            timestamp: chrono::Utc::now().timestamp_millis(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_thinking_budget_tokens() {
        assert_eq!(ThinkingBudget::Low.tokens(), 10_000);
        assert_eq!(ThinkingBudget::Medium.tokens(), 32_000);
        assert_eq!(ThinkingBudget::High.tokens(), 128_000);
        assert_eq!(ThinkingBudget::Custom(50_000).tokens(), 50_000);
    }

    #[test]
    fn test_thinking_budget_from_tokens() {
        assert_eq!(ThinkingBudget::from_tokens(5_000), ThinkingBudget::Low);
        assert_eq!(ThinkingBudget::from_tokens(30_000), ThinkingBudget::Medium);
        assert_eq!(ThinkingBudget::from_tokens(100_000), ThinkingBudget::High);
    }

    #[test]
    fn test_thinking_config_from_message_ultrathink() {
        let config = ThinkingConfig::from_user_message("Can you ultrathink about this?");
        assert!(config.enabled);
        assert_eq!(config.budget, ThinkingBudget::High);
    }

    #[test]
    fn test_thinking_config_from_message_think_hard() {
        let config = ThinkingConfig::from_user_message("Please think hard about this problem");
        assert!(config.enabled);
        assert_eq!(config.budget, ThinkingBudget::Medium);

        let config2 = ThinkingConfig::from_user_message("Think deeply about the implications");
        assert!(config2.enabled);
        assert_eq!(config2.budget, ThinkingBudget::Medium);
    }

    #[test]
    fn test_thinking_config_from_message_think() {
        let config = ThinkingConfig::from_user_message("Think about this question");
        assert!(config.enabled);
        assert_eq!(config.budget, ThinkingBudget::Low);

        let config2 = ThinkingConfig::from_user_message("I need you to think through this");
        assert!(config2.enabled);
        assert_eq!(config2.budget, ThinkingBudget::Low);
    }

    #[test]
    fn test_thinking_config_from_message_no_trigger() {
        let config = ThinkingConfig::from_user_message("What do you think about AI?");
        // "think" followed by "about" should trigger
        assert!(config.enabled);

        let config2 = ThinkingConfig::from_user_message("I was thinking about going to the store");
        // "thinking" should not trigger
        assert!(!config2.enabled);

        let config3 = ThinkingConfig::from_user_message("Write me a poem");
        assert!(!config3.enabled);
    }

    #[test]
    fn test_model_supports_thinking() {
        assert!(ThinkingConfig::model_supports_thinking("claude-sonnet-4-5"));
        assert!(ThinkingConfig::model_supports_thinking("claude-opus-4-6"));
        assert!(ThinkingConfig::model_supports_thinking("claude-haiku-4-5"));
        assert!(ThinkingConfig::model_supports_thinking(
            "claude-3-5-sonnet-20241022"
        ));
        assert!(ThinkingConfig::model_supports_thinking("gpt-5.2"));
        assert!(ThinkingConfig::model_supports_thinking(
            "gpt-5.2-codex-medium"
        ));

        // These should not support thinking
        assert!(!ThinkingConfig::model_supports_thinking("gpt-4"));
        assert!(!ThinkingConfig::model_supports_thinking("gpt-5-nano"));
        assert!(!ThinkingConfig::model_supports_thinking("gemini-pro"));
    }

    #[test]
    fn test_to_thinking_parameter_disabled() {
        let config = ThinkingConfig::disabled();
        assert!(config.to_thinking_parameter().is_none());
    }

    #[test]
    fn test_to_thinking_parameter_low() {
        let config = ThinkingConfig::new(ThinkingBudget::Low);
        let param = config.to_thinking_parameter().expect("should be Some");
        match param {
            super::super::ThinkingParameter::Budget { budget_tokens, .. } => {
                assert_eq!(budget_tokens, 10_000);
            }
            other => panic!("Expected Budget, got {:?}", other),
        }
    }

    #[test]
    fn test_to_thinking_parameter_medium() {
        let config = ThinkingConfig::new(ThinkingBudget::Medium);
        let param = config.to_thinking_parameter().expect("should be Some");
        match param {
            super::super::ThinkingParameter::Budget { budget_tokens, .. } => {
                assert_eq!(budget_tokens, 32_000);
            }
            other => panic!("Expected Budget, got {:?}", other),
        }
    }

    #[test]
    fn test_to_thinking_parameter_high() {
        let config = ThinkingConfig::new(ThinkingBudget::High);
        let param = config.to_thinking_parameter().expect("should be Some");
        match param {
            super::super::ThinkingParameter::Budget { budget_tokens, .. } => {
                assert_eq!(budget_tokens, 128_000);
            }
            other => panic!("Expected Budget, got {:?}", other),
        }
    }

    #[test]
    fn test_from_user_message_returns_convertible_config() {
        // "ultrathink" should produce a config that converts to Budget with 128K tokens
        let config = ThinkingConfig::from_user_message("ultrathink about this");
        assert!(config.enabled);
        let param = config.to_thinking_parameter().expect("should be Some");
        match param {
            super::super::ThinkingParameter::Budget { budget_tokens, .. } => {
                assert_eq!(budget_tokens, 128_000);
            }
            other => panic!("Expected Budget, got {:?}", other),
        }
    }

    #[test]
    fn test_thinking_content() {
        let mut content = ThinkingContent::new("Let me analyze this step by step...".to_string());
        assert!(!content.is_empty());
        assert!(content.started_at.is_some());
        assert!(content.completed_at.is_none());

        content.complete();
        assert!(content.completed_at.is_some());
        assert!(content.duration_ms().is_some());
    }

    #[test]
    fn test_thinking_content_summary() {
        let content = ThinkingContent::new("A".repeat(100));
        let summary = content.summary(50);
        assert_eq!(summary.len(), 53); // 50 chars + "..."
        assert!(summary.ends_with("..."));

        let short_content = ThinkingContent::new("Short".to_string());
        let short_summary = short_content.summary(50);
        assert_eq!(short_summary, "Short");
    }
}
