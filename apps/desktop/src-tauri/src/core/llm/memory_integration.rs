//! Memory integration for LLM context injection
//!
//! This module provides utilities for loading and formatting memories into LLM system prompts
//! and context. It handles:
//! - Loading project-specific memories
//! - Detecting decision statements in chat
//! - Formatting memories as context for the LLM
//! - Maintaining memory importance and relevance

use crate::core::agi::memory_manager::{MemoryCategory, MemoryEntry, MemoryManager};
use crate::sys::error::Result;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::LazyLock;

static DECISION_PATTERNS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    vec![
        Regex::new(r"(?i)(decided|decided to|we(?:'ll| will)|let's|i(?:'ll| will)|use|implement|adopt|switch to|migrate to|prefer|choose)").expect("valid decision regex"),
        Regex::new(r"(?i)(architecture|tech stack|technology stack|style guide|coding standard|convention|pattern)").expect("valid architecture regex"),
    ]
});

/// Configuration for memory injection into LLM context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryInjectionConfig {
    /// Whether memory injection is enabled
    pub enabled: bool,
    /// Maximum number of memories to include
    pub max_memories: usize,
    /// Minimum importance threshold for memories to include
    pub min_importance: i32,
    /// Categories to prioritize when selecting memories
    pub priority_categories: Vec<MemoryCategory>,
}

impl Default for MemoryInjectionConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            max_memories: 10,
            min_importance: 5,
            priority_categories: vec![
                MemoryCategory::Decision,
                MemoryCategory::Preference,
                MemoryCategory::Fact,
            ],
        }
    }
}

/// Result of memory injection analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryInjectionResult {
    /// Number of memories loaded
    pub memories_loaded: usize,
    /// Formatted context string for LLM
    pub context: String,
    /// Whether memories were found for this project
    pub has_relevant_memories: bool,
    /// Summary of memory types included
    pub summary: MemorySummary,
}

/// Summary of injected memories by category
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemorySummary {
    pub decisions: usize,
    pub preferences: usize,
    pub facts: usize,
    pub context_entries: usize,
    pub total_importance_weight: i32,
}

/// Decision detection result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecisionDetectionResult {
    /// Whether a decision was detected
    pub is_decision: bool,
    /// The extracted decision topic
    pub topic: Option<String>,
    /// The decision content
    pub content: String,
    /// Detected importance (1-10)
    pub importance: i32,
}

/// Memory injector for LLM context
pub struct MemoryInjector {
    config: MemoryInjectionConfig,
    decision_patterns: Vec<Regex>,
}

impl MemoryInjector {
    /// Create a new memory injector with default configuration
    pub fn new(config: MemoryInjectionConfig) -> Result<Self> {
        let decision_patterns = DECISION_PATTERNS.clone();

        Ok(Self {
            config,
            decision_patterns,
        })
    }

    /// Load memories for a project folder
    pub fn load_project_memories(
        &self,
        manager: &MemoryManager,
        project_path: Option<&str>,
    ) -> Result<MemoryInjectionResult> {
        let mut memories = Vec::new();

        // Load high-importance memories
        let important_memories = manager.get_important_memories(self.config.min_importance)?;
        memories.extend(important_memories);

        // If project path is provided, search for project-specific memories
        if let Some(path) = project_path {
            let project_name = Path::new(path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(path);

            let project_memories = manager.search(project_name, self.config.max_memories)?;
            memories.extend(project_memories);
        }

        // Deduplicate by ID
        memories.sort_by_key(|m| m.id);
        memories.dedup_by_key(|m| m.id);

        // Sort by importance and limit
        memories.sort_by(|a, b| b.importance.cmp(&a.importance));
        memories.truncate(self.config.max_memories);

        let summary = self.summarize_memories(&memories);
        let context = self.format_memories(&memories);
        let has_relevant = !memories.is_empty();

        Ok(MemoryInjectionResult {
            memories_loaded: memories.len(),
            context,
            has_relevant_memories: has_relevant,
            summary,
        })
    }

    /// Detect if a message contains a decision statement
    pub fn detect_decision(&self, message: &str) -> DecisionDetectionResult {
        let mut is_decision = false;
        let mut max_importance = 5;

        // Check for decision patterns
        for pattern in &self.decision_patterns {
            if pattern.is_match(message) {
                is_decision = true;
                max_importance = 8; // High importance for detected decisions
                break;
            }
        }

        // Extract topic from message (first few words)
        let words: Vec<&str> = message.split_whitespace().collect();
        let topic = if words.len() > 2 {
            words[0..3.min(words.len())]
                .join("_")
                .to_lowercase()
                .replace(" ", "_")
        } else {
            message
                .chars()
                .take(20)
                .collect::<String>()
                .replace(" ", "_")
        };

        // Boost importance for architectural decisions
        let importance = if message.to_lowercase().contains("architecture")
            || message.to_lowercase().contains("design")
            || message.to_lowercase().contains("pattern")
        {
            9
        } else if is_decision {
            max_importance
        } else {
            5
        };

        DecisionDetectionResult {
            is_decision,
            topic: if is_decision { Some(topic) } else { None },
            content: message.to_string(),
            importance,
        }
    }

    /// Format memories as context for LLM inclusion
    pub fn format_memories(&self, memories: &[MemoryEntry]) -> String {
        if memories.is_empty() {
            return String::new();
        }

        let mut context = String::from("## Relevant Project Memories\n\n");

        // Group memories by category
        let mut by_category: std::collections::HashMap<String, Vec<&MemoryEntry>> =
            std::collections::HashMap::new();

        for memory in memories {
            by_category
                .entry(memory.category.as_str().to_string())
                .or_default()
                .push(memory);
        }

        // Format in order of priority
        let priority_order = vec!["Decision", "Preference", "Fact", "Context"];

        for category in priority_order {
            if let Some(mems) = by_category.get(category) {
                context.push_str(&format!("### {}\n\n", category));

                for memory in mems {
                    let importance_indicator = match memory.importance {
                        9..=10 => "🔴 Critical",
                        7..=8 => "🟡 High",
                        5..=6 => "🟢 Medium",
                        _ => "⚪ Low",
                    };

                    context.push_str(&format!(
                        "- **{}** {}: {}\n",
                        memory.topic, importance_indicator, memory.content
                    ));
                }
                context.push('\n');
            }
        }

        context
    }

    /// Summarize memory statistics
    fn summarize_memories(&self, memories: &[MemoryEntry]) -> MemorySummary {
        let mut summary = MemorySummary {
            decisions: 0,
            preferences: 0,
            facts: 0,
            context_entries: 0,
            total_importance_weight: 0,
        };

        for memory in memories {
            summary.total_importance_weight += memory.importance;

            match memory.category {
                MemoryCategory::Decision => summary.decisions += 1,
                MemoryCategory::Preference => summary.preferences += 1,
                MemoryCategory::Fact => summary.facts += 1,
                MemoryCategory::Context => summary.context_entries += 1,
            }
        }

        summary
    }

    /// Build a system prompt enhancement with memories
    pub fn build_system_prompt_enhancement(&self, injection: &MemoryInjectionResult) -> String {
        if !injection.has_relevant_memories {
            return String::new();
        }

        let mut prompt = String::new();

        if injection.summary.decisions > 0 {
            prompt.push_str(&format!(
                "Remember the following {} architectural and technical decisions:\n",
                injection.summary.decisions
            ));
        }

        if injection.summary.preferences > 0 {
            prompt.push_str(&format!(
                "Consider these {} user preferences and style preferences:\n",
                injection.summary.preferences
            ));
        }

        if injection.summary.facts > 0 {
            prompt.push_str(&format!(
                "Keep these {} important facts in mind:\n",
                injection.summary.facts
            ));
        }

        prompt.push('\n');
        prompt.push_str(&injection.context);

        prompt
    }

    /// Set the configuration
    pub fn set_config(&mut self, config: MemoryInjectionConfig) {
        self.config = config;
    }

    /// Get the current configuration
    pub fn get_config(&self) -> &MemoryInjectionConfig {
        &self.config
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decision_detection() {
        let injector = MemoryInjector::new(MemoryInjectionConfig::default()).unwrap();

        let decision_msg = "We decided to use Rust for the backend";
        let result = injector.detect_decision(decision_msg);
        assert!(result.is_decision);
        assert!(result.importance >= 7);

        let arch_msg = "Architecture: Microservices pattern";
        let result = injector.detect_decision(arch_msg);
        assert!(result.is_decision);
        assert!(result.importance >= 8);

        let regular_msg = "Hello, how are you?";
        let result = injector.detect_decision(regular_msg);
        assert!(!result.is_decision);
    }

    #[test]
    fn test_format_memories() {
        let injector = MemoryInjector::new(MemoryInjectionConfig::default()).unwrap();

        let memories = vec![
            MemoryEntry {
                id: 1,
                category: MemoryCategory::Decision,
                topic: "backend_lang".to_string(),
                content: "Use Rust for type safety".to_string(),
                importance: 9,
                source: None,
                created_at: "2025-01-01".to_string(),
                updated_at: "2025-01-01".to_string(),
                last_accessed: None,
            },
            MemoryEntry {
                id: 2,
                category: MemoryCategory::Preference,
                topic: "code_style".to_string(),
                content: "Prefer functional paradigms".to_string(),
                importance: 7,
                source: None,
                created_at: "2025-01-01".to_string(),
                updated_at: "2025-01-01".to_string(),
                last_accessed: None,
            },
        ];

        let formatted = injector.format_memories(&memories);
        assert!(formatted.contains("Decision"));
        assert!(formatted.contains("backend_lang"));
        assert!(formatted.contains("Preference"));
        assert!(formatted.contains("code_style"));
    }
}
