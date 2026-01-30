//! Intent detection from user prompts.

use super::error::{IntentError, IntentResult};
use super::patterns::{PatternMatch, PatternMatcher};
use super::types::{Complexity, DetectedIntent, IntentCategory, IntentConfidence, RequiredServer};
use crate::core::llm::{ChatMessage, LLMRequest, LLMRouter, RouterPreferences, RoutingStrategy};
use std::sync::Arc;
use tokio::sync::RwLock;

/// Configuration for the intent detector.
#[derive(Debug, Clone)]
pub struct IntentDetectorConfig {
    /// Minimum confidence threshold for pattern-based detection.
    pub min_pattern_confidence: f64,

    /// Whether to use LLM for ambiguous intents.
    pub use_llm_fallback: bool,

    /// LLM confidence threshold for accepting LLM-based detection.
    pub llm_confidence_threshold: f64,

    /// Maximum number of secondary categories to include.
    pub max_secondary_categories: usize,
}

impl Default for IntentDetectorConfig {
    fn default() -> Self {
        Self {
            min_pattern_confidence: 0.4,
            use_llm_fallback: true,
            llm_confidence_threshold: 0.7,
            max_secondary_categories: 3,
        }
    }
}

/// Detects user intent from natural language prompts.
pub struct IntentDetector {
    config: IntentDetectorConfig,
    pattern_matcher: PatternMatcher,
    llm_router: Option<Arc<RwLock<LLMRouter>>>,
}

impl IntentDetector {
    /// Creates a new intent detector with default configuration.
    #[must_use]
    pub fn new() -> Self {
        Self {
            config: IntentDetectorConfig::default(),
            pattern_matcher: PatternMatcher::new(),
            llm_router: None,
        }
    }

    /// Creates a new intent detector with custom configuration.
    #[must_use]
    pub fn with_config(config: IntentDetectorConfig) -> Self {
        Self {
            config,
            pattern_matcher: PatternMatcher::new(),
            llm_router: None,
        }
    }

    /// Sets the LLM router for fallback detection.
    #[must_use]
    pub fn with_llm_router(mut self, router: Arc<RwLock<LLMRouter>>) -> Self {
        self.llm_router = Some(router);
        self
    }

    /// Detects intent from a user prompt.
    ///
    /// This method first attempts pattern-based detection. If the confidence
    /// is too low and an LLM router is available, it falls back to LLM-based
    /// detection for more accurate results.
    pub async fn detect(&self, prompt: &str) -> IntentResult<DetectedIntent> {
        let prompt = prompt.trim();
        if prompt.is_empty() {
            return Err(IntentError::ParseError("Empty prompt".to_string()));
        }

        // First, try pattern-based detection
        let pattern_matches = self.pattern_matcher.match_prompt(prompt);

        if pattern_matches.is_empty() {
            // No patterns matched, try LLM or return conversation
            if self.config.use_llm_fallback && self.llm_router.is_some() {
                return self.detect_with_llm(prompt).await;
            }
            return Ok(self.create_conversation_intent(prompt));
        }

        let primary_match = &pattern_matches[0];

        // If confidence is too low, try LLM
        if primary_match.score < self.config.min_pattern_confidence
            && self.config.use_llm_fallback
            && self.llm_router.is_some()
        {
            return self.detect_with_llm(prompt).await;
        }

        // Build the detected intent from pattern matches
        self.build_intent_from_patterns(prompt, &pattern_matches)
    }

    /// Detects intent synchronously using pattern matching only.
    ///
    /// This is useful when you want immediate results without LLM fallback.
    pub fn detect_sync(&self, prompt: &str) -> IntentResult<DetectedIntent> {
        let prompt = prompt.trim();
        if prompt.is_empty() {
            return Err(IntentError::ParseError("Empty prompt".to_string()));
        }

        let pattern_matches = self.pattern_matcher.match_prompt(prompt);

        if pattern_matches.is_empty() {
            return Ok(self.create_conversation_intent(prompt));
        }

        self.build_intent_from_patterns(prompt, &pattern_matches)
    }

    /// Builds a detected intent from pattern matches.
    fn build_intent_from_patterns(
        &self,
        prompt: &str,
        matches: &[PatternMatch],
    ) -> IntentResult<DetectedIntent> {
        let primary_match = &matches[0];

        // Extract entities
        let entities = self.pattern_matcher.extract_entities(prompt);

        // Estimate complexity
        let complexity = self
            .pattern_matcher
            .estimate_complexity(prompt, primary_match.category);

        // Calculate confidence
        let category_confidence = primary_match.score;
        let tool_confidence = if primary_match.tools.is_empty() {
            0.5
        } else {
            0.8
        };
        let complexity_confidence = 0.7; // Pattern-based complexity estimation is moderately reliable
        let confidence =
            IntentConfidence::new(category_confidence, tool_confidence, complexity_confidence);

        // Get secondary categories
        let secondary_categories: Vec<IntentCategory> = matches
            .iter()
            .skip(1)
            .take(self.config.max_secondary_categories)
            .filter(|m| m.score > 0.2)
            .map(|m| m.category)
            .collect();

        // Build suggested action
        let suggested_action = self.build_suggested_action(primary_match, &entities);

        Ok(DetectedIntent {
            prompt: prompt.to_string(),
            primary_category: primary_match.category,
            secondary_categories,
            complexity,
            confidence,
            required_tools: primary_match.tools.clone(),
            required_servers: primary_match.servers.clone(),
            entities,
            is_quick_win: complexity == Complexity::QuickWin,
            suggested_action,
            matched_keywords: primary_match.matched_keywords.clone(),
        })
    }

    /// Creates a conversation intent for unrecognized prompts.
    fn create_conversation_intent(&self, prompt: &str) -> DetectedIntent {
        DetectedIntent {
            prompt: prompt.to_string(),
            primary_category: IntentCategory::Conversation,
            secondary_categories: Vec::new(),
            complexity: Complexity::QuickWin,
            confidence: IntentConfidence::new(0.3, 0.3, 0.8),
            required_tools: Vec::new(),
            required_servers: Vec::new(),
            entities: self.pattern_matcher.extract_entities(prompt),
            is_quick_win: true,
            suggested_action: "Continue the conversation".to_string(),
            matched_keywords: Vec::new(),
        }
    }

    /// Builds a suggested action description.
    fn build_suggested_action(
        &self,
        pattern_match: &PatternMatch,
        entities: &std::collections::HashMap<String, String>,
    ) -> String {
        let category_desc = pattern_match.category.description();

        // Build context from entities
        let context = if let Some(path) = entities.get("file_path") {
            format!(" for '{}'", path)
        } else if let Some(url) = entities.get("url") {
            format!(" at {}", url)
        } else if let Some(query) = entities.get("query") {
            format!(" for '{}'", query)
        } else {
            String::new()
        };

        format!("{}{}", category_desc, context)
    }

    /// Detects intent using LLM for ambiguous or complex prompts.
    async fn detect_with_llm(&self, prompt: &str) -> IntentResult<DetectedIntent> {
        let router = self
            .llm_router
            .as_ref()
            .ok_or_else(|| IntentError::LlmError("LLM router not available".to_string()))?;

        let categories: Vec<&str> = IntentCategory::all()
            .iter()
            .map(|c| c.description())
            .collect();

        let llm_prompt = format!(
            r#"Analyze the following user request and determine the intent category.

User request: "{}"

Available categories:
{}

Respond with a JSON object containing:
{{
  "category": "<category_name>",
  "confidence": <0.0-1.0>,
  "complexity": "<quick_win|simple|moderate|complex|long_running>",
  "required_tools": ["<tool1>", "<tool2>"],
  "suggested_action": "<brief description of what to do>"
}}

Only respond with the JSON object, no other text."#,
            prompt,
            categories.join("\n")
        );

        let preferences = RouterPreferences {
            provider: None,
            model: None,
            strategy: RoutingStrategy::Auto,
            context: None,
            prefer_cloud_credits: false,
        };

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: llm_prompt,
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: String::new(),
            temperature: Some(0.1),
            max_tokens: Some(500),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
        };

        let router_guard = router.read().await;
        let response = router_guard
            .send_message(&request.messages[0].content, Some(preferences))
            .await
            .map_err(|e| IntentError::LlmError(e.to_string()))?;
        drop(router_guard);

        // Parse LLM response
        self.parse_llm_response(prompt, &response)
    }

    /// Parses the LLM response to extract intent information.
    fn parse_llm_response(&self, prompt: &str, response: &str) -> IntentResult<DetectedIntent> {
        // Try to extract JSON from response
        let json_str = response
            .trim()
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim();

        let parsed: serde_json::Value = serde_json::from_str(json_str)
            .map_err(|e| IntentError::LlmError(format!("Failed to parse LLM response: {}", e)))?;

        // Extract category
        let category_str = parsed["category"].as_str().unwrap_or("conversation");
        let category = self.parse_category(category_str);

        // Extract confidence
        let llm_confidence = parsed["confidence"].as_f64().unwrap_or(0.7);

        // Extract complexity
        let complexity_str = parsed["complexity"].as_str().unwrap_or("simple");
        let complexity = self.parse_complexity(complexity_str);

        // Extract tools
        let required_tools: Vec<String> = parsed["required_tools"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();

        // Extract suggested action
        let suggested_action = parsed["suggested_action"]
            .as_str()
            .unwrap_or("")
            .to_string();

        // Extract entities using pattern matcher
        let entities = self.pattern_matcher.extract_entities(prompt);

        // Build confidence
        let confidence = IntentConfidence::new(llm_confidence, 0.7, 0.8);

        Ok(DetectedIntent {
            prompt: prompt.to_string(),
            primary_category: category,
            secondary_categories: Vec::new(),
            complexity,
            confidence,
            required_tools,
            required_servers: self.get_servers_for_category(category),
            entities,
            is_quick_win: complexity == Complexity::QuickWin,
            suggested_action,
            matched_keywords: Vec::new(),
        })
    }

    /// Parses a category string to an IntentCategory.
    fn parse_category(&self, s: &str) -> IntentCategory {
        let s_lower = s.to_lowercase();

        if s_lower.contains("file") {
            IntentCategory::FileOperation
        } else if s_lower.contains("web") || s_lower.contains("search") {
            IntentCategory::WebSearch
        } else if s_lower.contains("code") {
            IntentCategory::CodeTask
        } else if s_lower.contains("email") || s_lower.contains("mail") {
            IntentCategory::Email
        } else if s_lower.contains("calendar") || s_lower.contains("schedule") {
            IntentCategory::Calendar
        } else if s_lower.contains("document") {
            IntentCategory::Document
        } else if s_lower.contains("automat") || s_lower.contains("browser") {
            IntentCategory::Automation
        } else if s_lower.contains("database") || s_lower.contains("sql") {
            IntentCategory::Database
        } else if s_lower.contains("api") {
            IntentCategory::ApiIntegration
        } else if s_lower.contains("image") {
            IntentCategory::ImageProcessing
        } else if s_lower.contains("git") || s_lower.contains("version") {
            IntentCategory::VersionControl
        } else if s_lower.contains("system") || s_lower.contains("terminal") {
            IntentCategory::SystemCommand
        } else if s_lower.contains("memory") || s_lower.contains("remember") {
            IntentCategory::Memory
        } else if s_lower.contains("remind") || s_lower.contains("recurring") {
            IntentCategory::Scheduling
        } else if s_lower.contains("media")
            || s_lower.contains("generate image")
            || s_lower.contains("generate video")
        {
            IntentCategory::MediaGeneration
        } else if s_lower.contains("cloud") || s_lower.contains("storage") {
            IntentCategory::CloudStorage
        } else if s_lower.contains("task") || s_lower.contains("productivity") {
            IntentCategory::Productivity
        } else {
            IntentCategory::Conversation
        }
    }

    /// Parses a complexity string to a Complexity.
    fn parse_complexity(&self, s: &str) -> Complexity {
        let s_lower = s.to_lowercase();

        if s_lower.contains("quick") {
            Complexity::QuickWin
        } else if s_lower.contains("simple") {
            Complexity::Simple
        } else if s_lower.contains("moderate") {
            Complexity::Moderate
        } else if s_lower.contains("complex") {
            Complexity::Complex
        } else if s_lower.contains("long") {
            Complexity::LongRunning
        } else {
            Complexity::Simple
        }
    }

    /// Gets required servers for a category.
    fn get_servers_for_category(&self, category: IntentCategory) -> Vec<RequiredServer> {
        match category {
            IntentCategory::FileOperation => vec![RequiredServer::new("filesystem").optional()],
            IntentCategory::WebSearch => vec![
                RequiredServer::new("brave-search"),
                RequiredServer::new("web-search").optional(),
            ],
            IntentCategory::Email => vec![
                RequiredServer::new("gmail").optional(),
                RequiredServer::new("google-workspace").optional(),
            ],
            IntentCategory::Calendar => vec![
                RequiredServer::new("google-calendar").optional(),
                RequiredServer::new("google-workspace").optional(),
            ],
            IntentCategory::Document => vec![
                RequiredServer::new("google-docs").optional(),
                RequiredServer::new("google-drive").optional(),
            ],
            IntentCategory::Automation => vec![
                RequiredServer::new("puppeteer").optional(),
                RequiredServer::new("playwright").optional(),
            ],
            IntentCategory::Database => vec![
                RequiredServer::new("postgres").optional(),
                RequiredServer::new("mysql").optional(),
                RequiredServer::new("sqlite").optional(),
            ],
            IntentCategory::VersionControl => vec![
                RequiredServer::new("github").optional(),
                RequiredServer::new("gitlab").optional(),
            ],
            IntentCategory::CloudStorage => vec![
                RequiredServer::new("google-drive").optional(),
                RequiredServer::new("dropbox").optional(),
                RequiredServer::new("s3").optional(),
            ],
            IntentCategory::Productivity => vec![
                RequiredServer::new("notion").optional(),
                RequiredServer::new("trello").optional(),
                RequiredServer::new("linear").optional(),
            ],
            _ => Vec::new(),
        }
    }

    /// Returns the underlying pattern matcher for advanced usage.
    #[must_use]
    pub fn pattern_matcher(&self) -> &PatternMatcher {
        &self.pattern_matcher
    }
}

impl Default for IntentDetector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_file_operation() {
        let detector = IntentDetector::new();
        let intent = detector.detect_sync("read the file /tmp/test.txt").unwrap();

        assert_eq!(intent.primary_category, IntentCategory::FileOperation);
        assert!(intent.confidence.score > 0.4);
    }

    #[test]
    fn test_detect_web_search() {
        let detector = IntentDetector::new();
        let intent = detector
            .detect_sync("search the web for rust programming tutorials")
            .unwrap();

        assert_eq!(intent.primary_category, IntentCategory::WebSearch);
    }

    #[test]
    fn test_detect_email() {
        let detector = IntentDetector::new();
        let intent = detector
            .detect_sync("send an email to john@example.com")
            .unwrap();

        assert_eq!(intent.primary_category, IntentCategory::Email);
    }

    #[test]
    fn test_detect_calendar() {
        let detector = IntentDetector::new();
        let intent = detector
            .detect_sync("schedule a meeting for tomorrow at 3pm")
            .unwrap();

        assert_eq!(intent.primary_category, IntentCategory::Calendar);
    }

    #[test]
    fn test_detect_quick_win() {
        let detector = IntentDetector::new();
        let intent = detector
            .detect_sync("what is the capital of France")
            .unwrap();

        assert!(intent.is_quick_win);
    }

    #[test]
    fn test_detect_empty_prompt() {
        let detector = IntentDetector::new();
        let result = detector.detect_sync("");

        assert!(result.is_err());
    }

    #[test]
    fn test_detect_conversation_fallback() {
        let detector = IntentDetector::new();
        let intent = detector.detect_sync("hello there").unwrap();

        assert_eq!(intent.primary_category, IntentCategory::Conversation);
    }

    #[test]
    fn test_entity_extraction() {
        let detector = IntentDetector::new();
        let intent = detector
            .detect_sync("navigate to https://example.com/page")
            .unwrap();

        assert!(intent.entities.contains_key("url"));
    }
}
