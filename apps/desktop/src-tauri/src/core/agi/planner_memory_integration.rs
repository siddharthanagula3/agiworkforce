//! Memory-aware planning for AGI
//!
//! This module integrates the long-term memory system with AGI planning,
//! allowing the planner to reference previous solutions, decisions, and coding styles.

use crate::core::agi::memory_manager::{MemoryCategory, MemoryManager};
use crate::core::llm::memory_integration::MemoryInjector;
use crate::sys::error::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tracing::{debug, info};

/// Context about memory-based planning decisions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryPlanContext {
    /// Referenced memories from decisions
    pub referenced_decisions: Vec<String>,
    /// Previous solutions found in memory
    pub previous_solutions: Vec<String>,
    /// Coding style preferences
    pub style_preferences: Vec<String>,
    /// Architecture patterns to follow
    pub architecture_patterns: Vec<String>,
    /// Total importance weight of referenced memories
    pub memory_confidence: f32,
}

impl Default for MemoryPlanContext {
    fn default() -> Self {
        Self {
            referenced_decisions: Vec::new(),
            previous_solutions: Vec::new(),
            style_preferences: Vec::new(),
            architecture_patterns: Vec::new(),
            memory_confidence: 0.5,
        }
    }
}

/// Memory-aware planner enhancement
pub struct PlannerMemoryIntegration {
    memory_manager: Arc<MemoryManager>,
    _memory_injector: MemoryInjector,
}

impl PlannerMemoryIntegration {
    /// Create a new planner memory integration
    pub fn new(memory_manager: Arc<MemoryManager>, memory_injector: MemoryInjector) -> Self {
        Self {
            memory_manager,
            _memory_injector: memory_injector,
        }
    }

    /// Analyze a goal and find relevant memories
    pub fn analyze_goal_memories(&self, goal: &str) -> Result<MemoryPlanContext> {
        let mut context = MemoryPlanContext::default();

        // Search for relevant memories
        let relevant_memories = self.memory_manager.hybrid_search(goal, 10)?;
        let memory_count = relevant_memories.len();

        for search_result in relevant_memories {
            let memory = &search_result.memory;

            match memory.category {
                crate::core::agi::memory_manager::MemoryCategory::Decision => {
                    context.referenced_decisions.push(memory.content.clone());
                }
                crate::core::agi::memory_manager::MemoryCategory::Preference => {
                    context.style_preferences.push(memory.content.clone());
                }
                crate::core::agi::memory_manager::MemoryCategory::Fact => {
                    context.previous_solutions.push(memory.content.clone());
                }
                crate::core::agi::memory_manager::MemoryCategory::Context => {
                    context.architecture_patterns.push(memory.content.clone());
                }
            }

            // Weight confidence by similarity score
            context.memory_confidence =
                (context.memory_confidence + search_result.combined_score) / 2.0;
        }

        // Cap confidence at 1.0
        context.memory_confidence = context.memory_confidence.min(1.0);

        info!(
            "[PlannerMemory] Found {} relevant memories for goal: {} (confidence: {:.2})",
            memory_count, goal, context.memory_confidence
        );

        Ok(context)
    }

    /// Build a memory-informed system prompt for planning
    pub fn build_planner_system_prompt(&self, goal: &str) -> Result<String> {
        let memory_context = self.analyze_goal_memories(goal)?;

        let mut prompt = String::from("You are an expert AGI planner with access to previous solutions and architectural decisions.\n\n");

        if !memory_context.referenced_decisions.is_empty() {
            prompt.push_str("## Previous Architectural Decisions\n");
            for decision in &memory_context.referenced_decisions {
                prompt.push_str(&format!("- {}\n", decision));
            }
            prompt.push('\n');
        }

        if !memory_context.style_preferences.is_empty() {
            prompt.push_str("## Coding Style Preferences\n");
            for pref in &memory_context.style_preferences {
                prompt.push_str(&format!("- {}\n", pref));
            }
            prompt.push('\n');
        }

        if !memory_context.previous_solutions.is_empty() {
            prompt.push_str("## Previous Solutions\n");
            for solution in &memory_context.previous_solutions {
                prompt.push_str(&format!("- {}\n", solution));
            }
            prompt.push('\n');
        }

        prompt.push_str(&format!(
            "When planning, ensure consistency with these decisions and preferences.\n\
            Confidence level in memory context: {:.0}%\n",
            memory_context.memory_confidence * 100.0
        ));

        Ok(prompt)
    }

    /// Check if a solution exists in memory and return it
    pub fn find_previous_solution(&self, problem: &str) -> Result<Option<String>> {
        let solutions = self
            .memory_manager
            .search(&format!("solution: {}", problem), 1)?;

        if let Some(solution) = solutions.first() {
            debug!(
                "[PlannerMemory] Found previous solution: {}",
                solution.topic
            );
            Ok(Some(solution.content.clone()))
        } else {
            Ok(None)
        }
    }

    /// Save a new solution to memory for future reference
    pub fn save_solution(&self, problem: &str, solution: &str) -> Result<i64> {
        let importance = if solution.len() > 500 { 8 } else { 6 };

        let topic = format!("solution_{}", problem.chars().take(20).collect::<String>());

        let memory_id = self.memory_manager.remember(
            MemoryCategory::Fact,
            &topic,
            solution,
            Some(importance),
            Some("auto-saved solution"),
        )?;

        info!(
            "[PlannerMemory] Saved solution for '{}' with importance {}",
            problem, importance
        );

        Ok(memory_id)
    }

    /// Analyze architectural pattern from goal
    pub fn identify_architecture_patterns(&self, goal: &str) -> Result<Vec<String>> {
        let keywords = vec![
            "microservices",
            "monolith",
            "serverless",
            "event-driven",
            "mvc",
            "mvvm",
            "hexagonal",
            "layered",
        ];

        let mut patterns = Vec::new();

        for keyword in keywords {
            if goal.to_lowercase().contains(keyword) {
                patterns.push(keyword.to_string());
            }
        }

        // Also search memory for architecture patterns
        let arch_memories = self.memory_manager.search("architecture", 5)?;
        for memory in arch_memories {
            if memory.importance >= 7 {
                patterns.push(memory.topic.clone());
            }
        }

        Ok(patterns)
    }

    /// Get memory context for plan execution
    pub fn get_execution_memory_context(&self) -> Result<HashMap<String, Vec<String>>> {
        let mut context = HashMap::new();

        // Get all decision memories
        let decisions = self
            .memory_manager
            .get_by_category(MemoryCategory::Decision, Some(20))?;
        context.insert(
            "decisions".to_string(),
            decisions.iter().map(|m| m.content.clone()).collect(),
        );

        // Get style preferences
        let prefs = self
            .memory_manager
            .get_by_category(MemoryCategory::Preference, Some(20))?;
        context.insert(
            "preferences".to_string(),
            prefs.iter().map(|m| m.content.clone()).collect(),
        );

        // Get facts and previous solutions
        let facts = self
            .memory_manager
            .get_by_category(MemoryCategory::Fact, Some(20))?;
        context.insert(
            "facts".to_string(),
            facts.iter().map(|m| m.content.clone()).collect(),
        );

        Ok(context)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_memory_plan_context_default() {
        let ctx = MemoryPlanContext::default();
        assert_eq!(ctx.referenced_decisions.len(), 0);
        assert_eq!(ctx.memory_confidence, 0.5);
    }

    #[test]
    fn test_architecture_pattern_identification() {
        // This would need a full memory manager setup
        // Placeholder for integration testing
    }
}
