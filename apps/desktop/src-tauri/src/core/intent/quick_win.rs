//! Quick-win optimization for simple, fast-path tasks.
//!
//! This module identifies and prioritizes simple tasks that can be completed
//! quickly with minimal complexity, providing instant responses to users.

use super::error::IntentResult;
use super::types::{Complexity, DetectedIntent, IntentCategory, ToolSelection};
use std::collections::HashMap;
use std::time::Duration;

/// Result of quick-win optimization.
#[derive(Debug, Clone)]
pub struct OptimizationResult {
    /// Whether this is a quick-win task.
    pub is_quick_win: bool,

    /// Optimized tool selection (if applicable).
    pub optimized_tools: Vec<ToolSelection>,

    /// Suggested complexity after optimization.
    pub optimized_complexity: Complexity,

    /// Estimated execution time.
    pub estimated_time: Duration,

    /// Optimization strategies applied.
    pub strategies_applied: Vec<String>,

    /// Whether to skip planning phase.
    pub skip_planning: bool,

    /// Direct answer if available (for trivial queries).
    pub direct_answer: Option<String>,
}

impl OptimizationResult {
    /// Creates a non-quick-win result.
    #[must_use]
    pub fn not_quick_win() -> Self {
        Self {
            is_quick_win: false,
            optimized_tools: Vec::new(),
            optimized_complexity: Complexity::Moderate,
            estimated_time: Duration::from_secs(30),
            strategies_applied: Vec::new(),
            skip_planning: false,
            direct_answer: None,
        }
    }

    /// Creates a quick-win result.
    #[must_use]
    pub fn quick_win(tools: Vec<ToolSelection>, time: Duration) -> Self {
        Self {
            is_quick_win: true,
            optimized_tools: tools,
            optimized_complexity: Complexity::QuickWin,
            estimated_time: time,
            strategies_applied: vec!["quick_win_path".to_string()],
            skip_planning: true,
            direct_answer: None,
        }
    }
}

/// Optimizer for quick-win tasks.
///
/// The `QuickWinOptimizer` analyzes detected intents and determines if they
/// can be handled through optimized fast paths, avoiding complex planning
/// and multi-step execution for simple tasks.
pub struct QuickWinOptimizer {
    /// Maximum steps for a task to be considered a quick win.
    max_quick_win_steps: usize,

    /// Maximum estimated time for a quick win (in seconds).
    max_quick_win_time_secs: u64,

    /// Tool priority mappings (lower = higher priority).
    tool_priorities: HashMap<String, u8>,

    /// Quick-win patterns for common operations.
    quick_win_patterns: Vec<QuickWinPattern>,
}

/// A pattern for identifying quick-win opportunities.
#[derive(Debug, Clone)]
struct QuickWinPattern {
    /// Categories this pattern applies to.
    categories: Vec<IntentCategory>,

    /// Keywords that indicate a quick-win opportunity.
    keywords: Vec<&'static str>,

    /// Tool to use for this pattern.
    tool_id: &'static str,

    /// Estimated execution time.
    estimated_time: Duration,

    /// Whether this can provide a direct answer.
    can_provide_direct_answer: bool,
}

impl QuickWinOptimizer {
    /// Creates a new quick-win optimizer with default settings.
    #[must_use]
    pub fn new() -> Self {
        let mut tool_priorities = HashMap::new();

        // Reading operations (fastest)
        tool_priorities.insert("memory_recall".to_string(), 5); // Fastest and most fundamental
        tool_priorities.insert("file_read".to_string(), 10);
        tool_priorities.insert("list_scheduled_tasks".to_string(), 10);
        tool_priorities.insert("git_status".to_string(), 15);

        // Simple write operations
        tool_priorities.insert("memory_remember".to_string(), 20);
        tool_priorities.insert("file_write".to_string(), 25);
        tool_priorities.insert("schedule_reminder".to_string(), 25);

        // Search operations
        tool_priorities.insert("search_web".to_string(), 30);
        tool_priorities.insert("memory_search".to_string(), 30);
        tool_priorities.insert("document_search".to_string(), 35);

        // Screenshot and simple UI
        tool_priorities.insert("ui_screenshot".to_string(), 40);

        Self {
            max_quick_win_steps: 2,
            max_quick_win_time_secs: 10,
            tool_priorities,
            quick_win_patterns: Self::build_quick_win_patterns(),
        }
    }

    /// Optimizes an intent for quick-win execution if possible.
    pub fn optimize(&self, intent: &DetectedIntent) -> IntentResult<OptimizationResult> {
        // Check if complexity is already identified as complex
        if intent.complexity >= Complexity::Complex {
            return Ok(OptimizationResult::not_quick_win());
        }

        // Try to match quick-win patterns
        if let Some(pattern_result) = self.try_quick_win_patterns(intent) {
            return Ok(pattern_result);
        }

        // Analyze based on category and tools
        let optimization = self.analyze_for_optimization(intent);
        Ok(optimization)
    }

    /// Prioritizes tools for optimal execution order.
    pub fn prioritize_tools(&self, tools: &[String]) -> Vec<ToolSelection> {
        let mut selections: Vec<ToolSelection> = tools
            .iter()
            .map(|tool_id| {
                let priority = self.tool_priorities.get(tool_id).copied().unwrap_or(50);
                let _estimated_time = self.estimate_tool_time(tool_id);

                ToolSelection::new(tool_id.clone(), "Selected for quick-win execution")
                    .with_priority(priority)
                    .with_confidence(0.85)
            })
            .collect();

        // Sort by priority (lower = higher priority)
        selections.sort_by_key(|s| s.priority);
        selections
    }

    /// Estimates execution time for a tool.
    fn estimate_tool_time(&self, tool_id: &str) -> Duration {
        match tool_id {
            // Instant operations
            "memory_recall" | "memory_search" | "list_scheduled_tasks" => {
                Duration::from_millis(100)
            }

            // Fast file operations
            "file_read" | "git_status" => Duration::from_millis(500),

            // Simple write operations
            "memory_remember" | "schedule_reminder" | "file_write" => Duration::from_secs(1),

            // Network operations
            "search_web" => Duration::from_secs(2),
            "api_call" => Duration::from_secs(3),

            // Screenshot
            "ui_screenshot" => Duration::from_secs(1),

            // Browser operations
            "browser_navigate" | "browser_extract" => Duration::from_secs(5),

            // Complex operations
            "code_execute" | "image_analyze" => Duration::from_secs(10),
            "image_generate" | "video_generate" => Duration::from_secs(30),

            // Default
            _ => Duration::from_secs(5),
        }
    }

    /// Tries to match quick-win patterns.
    fn try_quick_win_patterns(&self, intent: &DetectedIntent) -> Option<OptimizationResult> {
        let prompt_lower = intent.prompt.to_lowercase();

        for pattern in &self.quick_win_patterns {
            // Check if category matches
            if !pattern.categories.contains(&intent.primary_category) {
                continue;
            }

            // Check if any keyword matches
            let keyword_match = pattern.keywords.iter().any(|kw| prompt_lower.contains(kw));
            if !keyword_match {
                continue;
            }

            // Found a match
            let tool = ToolSelection::new(
                pattern.tool_id,
                format!("Quick-win pattern: {:?}", pattern.keywords),
            )
            .with_priority(10)
            .with_confidence(0.9);

            let mut result = OptimizationResult::quick_win(vec![tool], pattern.estimated_time);
            result
                .strategies_applied
                .push(format!("pattern_match:{}", pattern.tool_id));

            // Check for direct answer capability
            if pattern.can_provide_direct_answer {
                if let Some(answer) = self.try_generate_direct_answer(intent) {
                    result.direct_answer = Some(answer);
                    result.skip_planning = true;
                }
            }

            return Some(result);
        }

        None
    }

    /// Analyzes an intent for optimization opportunities.
    fn analyze_for_optimization(&self, intent: &DetectedIntent) -> OptimizationResult {
        // Check if the required tools are quick-win compatible
        let quick_win_tools: Vec<_> = intent
            .required_tools
            .iter()
            .filter(|t| self.is_quick_win_tool(t))
            .cloned()
            .collect();

        if quick_win_tools.is_empty() && intent.required_tools.is_empty() {
            // No tools required - might be a conversation
            if intent.primary_category == IntentCategory::Conversation {
                return OptimizationResult::quick_win(Vec::new(), Duration::from_millis(100));
            }
        }

        if !quick_win_tools.is_empty() && quick_win_tools.len() <= self.max_quick_win_steps {
            let prioritized = self.prioritize_tools(&quick_win_tools);
            let total_time: Duration = prioritized
                .iter()
                .map(|t| self.estimate_tool_time(&t.tool_id))
                .sum();

            if total_time.as_secs() <= self.max_quick_win_time_secs {
                let mut result = OptimizationResult::quick_win(prioritized, total_time);
                result.strategies_applied.push("tool_analysis".to_string());
                return result;
            }
        }

        // Check for single-step simplification
        if let Some(simplified) = self.try_single_step_simplification(intent) {
            return simplified;
        }

        // Not a quick win, but might still be optimizable
        self.create_optimized_result(intent)
    }

    /// Checks if a tool is suitable for quick-win execution.
    fn is_quick_win_tool(&self, tool_id: &str) -> bool {
        let quick_win_tools = [
            "file_read",
            "memory_recall",
            "memory_search",
            "memory_remember",
            "list_scheduled_tasks",
            "schedule_reminder",
            "git_status",
            "search_web",
            "ui_screenshot",
            "calendar_list_events",
            "email_fetch",
        ];
        quick_win_tools.contains(&tool_id)
    }

    /// Tries to simplify a multi-step task to a single step.
    fn try_single_step_simplification(
        &self,
        intent: &DetectedIntent,
    ) -> Option<OptimizationResult> {
        // If user is asking to "just" do something, try to find the core action
        let prompt_lower = intent.prompt.to_lowercase();

        if prompt_lower.contains("just ") || prompt_lower.contains("only ") {
            // Look for the primary tool
            if let Some(tool_id) = intent.required_tools.first() {
                if self.is_quick_win_tool(tool_id) {
                    let tool =
                        ToolSelection::new(tool_id.clone(), "Simplified single-step execution")
                            .with_priority(10);

                    let mut result =
                        OptimizationResult::quick_win(vec![tool], self.estimate_tool_time(tool_id));
                    result
                        .strategies_applied
                        .push("single_step_simplification".to_string());
                    return Some(result);
                }
            }
        }

        None
    }

    /// Creates an optimized (but not quick-win) result.
    fn create_optimized_result(&self, intent: &DetectedIntent) -> OptimizationResult {
        let prioritized = self.prioritize_tools(&intent.required_tools);
        let total_time: Duration = prioritized
            .iter()
            .map(|t| self.estimate_tool_time(&t.tool_id))
            .sum();

        OptimizationResult {
            is_quick_win: false,
            optimized_tools: prioritized,
            optimized_complexity: intent.complexity,
            estimated_time: total_time,
            strategies_applied: vec!["tool_prioritization".to_string()],
            skip_planning: false,
            direct_answer: None,
        }
    }

    /// Tries to generate a direct answer for trivial queries.
    fn try_generate_direct_answer(&self, intent: &DetectedIntent) -> Option<String> {
        let prompt_lower = intent.prompt.to_lowercase();

        // Greetings - keep it minimal
        if prompt_lower.starts_with("hello") {
            return Some("Hello!".to_string());
        }
        if prompt_lower.starts_with("hi") {
            return Some("Hi!".to_string());
        }
        if prompt_lower.starts_with("hey") {
            return Some("Hey!".to_string());
        }

        // Thanks
        if prompt_lower.contains("thank") {
            return Some("You're welcome!".to_string());
        }

        // What can you do - only list capabilities when explicitly asked
        if prompt_lower.contains("what can you do") {
            return Some("I can help you with files, web search, email, calendar, documents, code, automation, and more. What would you like me to do?".to_string());
        }

        None
    }

    /// Builds the default quick-win patterns.
    fn build_quick_win_patterns() -> Vec<QuickWinPattern> {
        vec![
            // Memory operations
            QuickWinPattern {
                categories: vec![IntentCategory::Memory],
                keywords: vec!["recall", "what did i say", "remember", "what was"],
                tool_id: "memory_recall",
                estimated_time: Duration::from_millis(100),
                can_provide_direct_answer: false,
            },
            QuickWinPattern {
                categories: vec![IntentCategory::Memory],
                keywords: vec!["search memory", "find in memory", "look up"],
                tool_id: "memory_search",
                estimated_time: Duration::from_millis(200),
                can_provide_direct_answer: false,
            },
            // File operations
            QuickWinPattern {
                categories: vec![IntentCategory::FileOperation],
                keywords: vec!["read file", "show file", "cat ", "display file"],
                tool_id: "file_read",
                estimated_time: Duration::from_millis(500),
                can_provide_direct_answer: false,
            },
            // Scheduling
            QuickWinPattern {
                categories: vec![IntentCategory::Scheduling],
                keywords: vec!["list reminder", "show reminder", "my reminder", "scheduled"],
                tool_id: "list_scheduled_tasks",
                estimated_time: Duration::from_millis(100),
                can_provide_direct_answer: false,
            },
            // Git
            QuickWinPattern {
                categories: vec![IntentCategory::VersionControl],
                keywords: vec!["git status", "repo status", "what changed"],
                tool_id: "git_status",
                estimated_time: Duration::from_secs(1),
                can_provide_direct_answer: false,
            },
            // Web search
            QuickWinPattern {
                categories: vec![IntentCategory::WebSearch],
                keywords: vec!["search for", "google", "look up", "find info"],
                tool_id: "search_web",
                estimated_time: Duration::from_secs(2),
                can_provide_direct_answer: false,
            },
            // Screenshot
            QuickWinPattern {
                categories: vec![IntentCategory::Automation],
                keywords: vec!["screenshot", "capture screen", "take a picture of screen"],
                tool_id: "ui_screenshot",
                estimated_time: Duration::from_secs(1),
                can_provide_direct_answer: false,
            },
            // Conversation
            QuickWinPattern {
                categories: vec![IntentCategory::Conversation],
                keywords: vec!["hello", "hi", "hey", "thanks", "thank you", "help"],
                tool_id: "",
                estimated_time: Duration::from_millis(50),
                can_provide_direct_answer: true,
            },
        ]
    }
}

impl Default for QuickWinOptimizer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_intent(category: IntentCategory, prompt: &str) -> DetectedIntent {
        DetectedIntent::new(prompt.to_string(), category)
    }

    #[test]
    fn test_memory_recall_quick_win() {
        let optimizer = QuickWinOptimizer::new();
        let intent = create_test_intent(IntentCategory::Memory, "recall what I said about rust");

        let result = optimizer.optimize(&intent).unwrap();

        assert!(result.is_quick_win);
        assert!(result.skip_planning);
    }

    #[test]
    fn test_file_read_quick_win() {
        let optimizer = QuickWinOptimizer::new();
        let mut intent =
            create_test_intent(IntentCategory::FileOperation, "read file /tmp/test.txt");
        intent.required_tools = vec!["file_read".to_string()];

        let result = optimizer.optimize(&intent).unwrap();

        assert!(result.is_quick_win);
    }

    #[test]
    fn test_complex_not_quick_win() {
        let optimizer = QuickWinOptimizer::new();
        let mut intent = create_test_intent(
            IntentCategory::CodeTask,
            "analyze and refactor the entire codebase",
        );
        intent.complexity = Complexity::Complex;

        let result = optimizer.optimize(&intent).unwrap();

        assert!(!result.is_quick_win);
    }

    #[test]
    fn test_greeting_direct_answer() {
        let optimizer = QuickWinOptimizer::new();
        let intent = create_test_intent(IntentCategory::Conversation, "hello there");

        let result = optimizer.optimize(&intent).unwrap();

        assert!(result.is_quick_win);
        assert!(result.direct_answer.is_some());
    }

    #[test]
    fn test_tool_prioritization() {
        let optimizer = QuickWinOptimizer::new();
        let tools = vec![
            "file_write".to_string(),
            "memory_recall".to_string(),
            "search_web".to_string(),
        ];

        let prioritized = optimizer.prioritize_tools(&tools);

        // memory_recall should be first (priority 10)
        assert_eq!(prioritized[0].tool_id, "memory_recall");
        // file_write should be second (priority 25)
        assert_eq!(prioritized[1].tool_id, "file_write");
        // search_web should be last (priority 30)
        assert_eq!(prioritized[2].tool_id, "search_web");
    }
}
