//! Reflection Engine for Multi-Turn Agentic Reasoning
//!
//! This module provides the capability for the AGI system to reflect on its
//! execution results, identify failure patterns, suggest corrections, and
//! improve future planning through iterative learning loops.

use super::*;
use crate::core::llm::LLMRouter;
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::RwLock;

/// Configuration for the Reflection Engine
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReflectionConfig {
    /// Maximum number of reflections to keep in history
    pub max_history_size: usize,
    /// Whether to use semantic similarity for matching relevant reflections
    pub use_semantic_similarity: bool,
    /// Weight for semantic score (0.0-1.0), remainder goes to recency
    pub semantic_weight: f32,
    /// Half-life for recency decay in hours
    pub recency_half_life_hours: f32,
}

impl Default for ReflectionConfig {
    fn default() -> Self {
        Self {
            max_history_size: 100,
            use_semantic_similarity: true,
            semantic_weight: 0.7,
            recency_half_life_hours: 24.0,
        }
    }
}

/// Calculate cosine similarity between two texts using Jaccard similarity
/// as a simple TF approximation (bag-of-words intersection over union)
fn calculate_similarity(text_a: &str, text_b: &str) -> f32 {
    // Tokenize and lowercase
    let tokens_a: HashSet<String> = text_a
        .to_lowercase()
        .split_whitespace()
        .filter(|w| w.len() > 2) // Skip short words
        .map(String::from)
        .collect();

    let tokens_b: HashSet<String> = text_b
        .to_lowercase()
        .split_whitespace()
        .filter(|w| w.len() > 2)
        .map(String::from)
        .collect();

    if tokens_a.is_empty() || tokens_b.is_empty() {
        return 0.0;
    }

    // Jaccard similarity as simple TF approximation
    let intersection = tokens_a.intersection(&tokens_b).count() as f32;
    let union = tokens_a.union(&tokens_b).count() as f32;

    intersection / union
}

/// Reflection insight generated after analyzing execution results
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReflectionInsight {
    /// Unique identifier for this reflection
    pub id: String,
    /// The goal being reflected upon
    pub goal_id: String,
    /// Overall assessment of the execution
    pub assessment: ExecutionAssessment,
    /// Identified failure patterns
    pub failure_patterns: Vec<FailurePattern>,
    /// Suggested corrections for failed steps
    pub corrections: Vec<Correction>,
    /// Sub-goals derived from failed complex steps
    pub sub_goals: Vec<SubGoal>,
    /// Recommendations for the next iteration
    pub recommendations: Vec<String>,
    /// Confidence score (0.0 - 1.0)
    pub confidence: f64,
    /// Timestamp of reflection
    pub timestamp: u64,
}

/// Assessment of overall execution quality
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionAssessment {
    /// Success rate of executed steps
    pub success_rate: f64,
    /// Steps that succeeded
    pub successful_steps: Vec<String>,
    /// Steps that failed
    pub failed_steps: Vec<FailedStep>,
    /// Whether the goal appears achievable
    pub goal_achievable: bool,
    /// Estimated progress toward goal (0.0 - 1.0)
    pub progress_estimate: f64,
    /// Resource efficiency score
    pub resource_efficiency: f64,
    /// Time efficiency score
    pub time_efficiency: f64,
}

/// Details about a failed step
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FailedStep {
    pub step_id: String,
    pub tool_id: String,
    pub description: String,
    pub error: Option<String>,
    pub failure_category: FailureCategory,
    pub recoverable: bool,
}

/// Categories of failures for pattern recognition
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum FailureCategory {
    /// Resource unavailable (file, API, service)
    ResourceUnavailable,
    /// Permission denied
    PermissionDenied,
    /// Invalid input or parameters
    InvalidInput,
    /// Network or connectivity issue
    NetworkError,
    /// Timeout exceeded
    Timeout,
    /// Dependency not met
    DependencyFailed,
    /// Tool not found or misconfigured
    ToolError,
    /// Unexpected application state
    StateError,
    /// Unknown or uncategorized error
    Unknown,
}

/// Pattern identified across multiple failures
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FailurePattern {
    /// Pattern identifier
    pub pattern_id: String,
    /// Category of failures in this pattern
    pub category: FailureCategory,
    /// Description of the pattern
    pub description: String,
    /// Steps affected by this pattern
    pub affected_steps: Vec<String>,
    /// Root cause analysis
    pub root_cause: Option<String>,
    /// Frequency of this pattern (count)
    pub frequency: usize,
}

/// Suggested correction for a failed step
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Correction {
    /// Which step this correction is for
    pub for_step_id: String,
    /// Type of correction
    pub correction_type: CorrectionType,
    /// Detailed correction description
    pub description: String,
    /// Alternative tool to use (if applicable)
    pub alternative_tool: Option<String>,
    /// Modified parameters (if applicable)
    pub modified_parameters: Option<HashMap<String, serde_json::Value>>,
    /// Priority of this correction (1 = highest)
    pub priority: u32,
}

/// Types of corrections that can be applied
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CorrectionType {
    /// Retry with same parameters
    Retry,
    /// Retry with modified parameters
    RetryWithModification,
    /// Use an alternative tool
    UseAlternativeTool,
    /// Skip this step (not critical)
    Skip,
    /// Decompose into smaller sub-goals
    Decompose,
    /// Wait and retry later
    Defer,
    /// Requires human intervention
    RequiresHuman,
}

/// Sub-goal derived from a complex failed step
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubGoal {
    /// Unique identifier
    pub id: String,
    /// Parent goal ID
    pub parent_goal_id: String,
    /// Original step that spawned this sub-goal
    pub from_step_id: String,
    /// Description of the sub-goal
    pub description: String,
    /// Success criteria for this sub-goal
    pub success_criteria: Vec<String>,
    /// Suggested tools for this sub-goal
    pub suggested_tools: Vec<String>,
    /// Priority relative to other sub-goals
    pub priority: u32,
}

/// Plan critique before execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanCritique {
    /// Overall quality score (0-100)
    pub quality_score: u32,
    /// Is the plan likely to succeed?
    pub likely_to_succeed: bool,
    /// Identified risks
    pub risks: Vec<PlanRisk>,
    /// Suggestions for improvement
    pub suggestions: Vec<String>,
    /// Missing steps or considerations
    pub missing_elements: Vec<String>,
}

/// Risk identified in a plan
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanRisk {
    /// Risk description
    pub description: String,
    /// Severity (1-5, 5 being most severe)
    pub severity: u32,
    /// Which step(s) this risk affects
    pub affected_steps: Vec<String>,
    /// Mitigation suggestion
    pub mitigation: Option<String>,
}

/// The Reflection Engine for multi-turn reasoning
pub struct ReflectionEngine {
    /// LLM router for intelligent reflection
    router: Arc<RwLock<LLMRouter>>,
    /// Knowledge base for context
    knowledge_base: Arc<KnowledgeBase>,
    /// Learning system for strategy updates. Called via update() after each
    /// successful reflection to keep tool performance strategies current.
    learning: Arc<LearningSystem>,
    /// History of reflections for pattern analysis
    reflection_history: Arc<tokio::sync::Mutex<Vec<ReflectionInsight>>>,
    /// Configuration for the reflection engine
    config: ReflectionConfig,
}

impl ReflectionEngine {
    /// Create a new ReflectionEngine with default configuration
    pub fn new(
        router: Arc<RwLock<LLMRouter>>,
        knowledge_base: Arc<KnowledgeBase>,
        learning: Arc<LearningSystem>,
    ) -> Result<Self> {
        Self::with_config(
            router,
            knowledge_base,
            learning,
            ReflectionConfig::default(),
        )
    }

    /// Create a new ReflectionEngine with custom configuration
    pub fn with_config(
        router: Arc<RwLock<LLMRouter>>,
        knowledge_base: Arc<KnowledgeBase>,
        learning: Arc<LearningSystem>,
        config: ReflectionConfig,
    ) -> Result<Self> {
        Ok(Self {
            router,
            knowledge_base,
            learning,
            reflection_history: Arc::new(tokio::sync::Mutex::new(Vec::new())),
            config,
        })
    }

    /// Reflect on execution results and generate insights
    pub async fn reflect(
        &self,
        goal: &Goal,
        context: &ExecutionContext,
        plan: &planner::Plan,
    ) -> Result<ReflectionInsight> {
        tracing::info!("[Reflection] Starting reflection for goal: {}", goal.id);

        // Analyze execution results
        let assessment = self.assess_execution(context, plan).await?;

        // Identify failure patterns
        let failure_patterns = self.identify_failure_patterns(&assessment).await?;

        // Generate corrections for failed steps
        let corrections = self
            .generate_corrections(goal, &assessment, &failure_patterns)
            .await?;

        // Decompose complex failed steps into sub-goals
        let sub_goals = self
            .decompose_failed_steps(goal, &assessment, context)
            .await?;

        // Generate recommendations using LLM
        let recommendations = self
            .generate_recommendations(goal, &assessment, &failure_patterns, context)
            .await?;

        // Calculate confidence based on available information
        let confidence = self.calculate_confidence(&assessment, &failure_patterns);

        let insight = ReflectionInsight {
            id: uuid::Uuid::new_v4().to_string(),
            goal_id: goal.id.clone(),
            assessment,
            failure_patterns,
            corrections,
            sub_goals,
            recommendations,
            confidence,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
        };

        // Store in history
        self.store_reflection(&insight).await?;

        // Wire learning feedback loop: trigger strategy optimization after each
        // successful reflection so tool performance data stays current.
        if let Err(e) = self.learning.update().await {
            tracing::warn!("[Reflection] Learning update failed after reflection: {}", e);
        }

        tracing::info!(
            "[Reflection] Generated insight with {} corrections, {} sub-goals, confidence: {:.2}",
            insight.corrections.len(),
            insight.sub_goals.len(),
            insight.confidence
        );

        Ok(insight)
    }

    /// Critique a plan before execution
    pub async fn critique_plan(
        &self,
        goal: &Goal,
        plan: &planner::Plan,
        _context: &ExecutionContext,
    ) -> Result<PlanCritique> {
        tracing::info!("[Reflection] Critiquing plan for goal: {}", goal.id);

        // Get relevant knowledge for context
        let knowledge = self.knowledge_base.query(&goal.description, 5).await?;

        // Get past reflections for this type of goal
        let past_insights = self.get_relevant_reflections(&goal.description, 3).await?;

        // Build prompt for LLM critique
        let prompt = self.build_critique_prompt(goal, plan, &knowledge, &past_insights);

        // Get LLM analysis
        let router = self.router.read().await;
        let response = router
            .send_message(&prompt, None)
            .await
            .map_err(|e| anyhow!("Failed to get LLM critique: {}", e))?;

        // Parse critique from response
        let critique = self.parse_critique_response(&response, plan)?;

        tracing::info!(
            "[Reflection] Plan critique: score={}, likely_to_succeed={}, risks={}",
            critique.quality_score,
            critique.likely_to_succeed,
            critique.risks.len()
        );

        Ok(critique)
    }

    /// Assess execution results
    async fn assess_execution(
        &self,
        context: &ExecutionContext,
        plan: &planner::Plan,
    ) -> Result<ExecutionAssessment> {
        let total_steps = plan.steps.len();
        let mut successful_steps = Vec::new();
        let mut failed_steps = Vec::new();
        let mut total_execution_time: u64 = 0;
        let mut total_resource_usage = ResourceUsage {
            cpu_percent: 0.0,
            memory_mb: 0,
            network_mb: 0.0,
        };

        for result in &context.tool_results {
            total_execution_time += result.execution_time_ms;
            total_resource_usage.cpu_percent += result.resources_used.cpu_percent;
            total_resource_usage.memory_mb += result.resources_used.memory_mb;
            total_resource_usage.network_mb += result.resources_used.network_mb;

            if result.success {
                successful_steps.push(result.step_id.clone());
            } else {
                let step = plan.steps.iter().find(|s| s.id == result.step_id);
                let failure_category = self.categorize_failure(&result.error);

                failed_steps.push(FailedStep {
                    step_id: result.step_id.clone(),
                    tool_id: result.tool_id.clone(),
                    description: step.map(|s| s.description.clone()).unwrap_or_default(),
                    error: result.error.clone(),
                    failure_category: failure_category.clone(),
                    recoverable: self.is_recoverable(&failure_category),
                });
            }
        }

        let success_rate = if total_steps > 0 {
            successful_steps.len() as f64 / total_steps as f64
        } else {
            0.0
        };

        // Estimate progress based on successful critical steps
        let progress_estimate = self.estimate_progress(&successful_steps, plan);

        // Calculate efficiency scores
        let expected_duration = plan.estimated_duration.as_millis() as u64;
        let time_efficiency = if expected_duration > 0 {
            (expected_duration as f64 / total_execution_time.max(1) as f64).min(1.0)
        } else {
            1.0
        };

        let resource_efficiency = self.calculate_resource_efficiency(&total_resource_usage, plan);

        // Clone failed_steps before moving it into the struct, since we need to use it again
        let goal_achievable = success_rate > 0.3 || failed_steps.iter().all(|f| f.recoverable);

        Ok(ExecutionAssessment {
            success_rate,
            successful_steps,
            failed_steps,
            goal_achievable,
            progress_estimate,
            resource_efficiency,
            time_efficiency,
        })
    }

    /// Categorize a failure based on error message
    fn categorize_failure(&self, error: &Option<String>) -> FailureCategory {
        let error_lower = error.as_ref().map(|e| e.to_lowercase()).unwrap_or_default();

        if error_lower.contains("not found")
            || error_lower.contains("does not exist")
            || error_lower.contains("no such file")
        {
            FailureCategory::ResourceUnavailable
        } else if error_lower.contains("permission")
            || error_lower.contains("denied")
            || error_lower.contains("unauthorized")
        {
            FailureCategory::PermissionDenied
        } else if error_lower.contains("invalid")
            || error_lower.contains("malformed")
            || error_lower.contains("parse error")
        {
            FailureCategory::InvalidInput
        } else if error_lower.contains("timeout") || error_lower.contains("timed out") {
            FailureCategory::Timeout
        } else if error_lower.contains("network")
            || error_lower.contains("connection")
            || error_lower.contains("dns")
        {
            FailureCategory::NetworkError
        } else if error_lower.contains("dependency") || error_lower.contains("depends on") {
            FailureCategory::DependencyFailed
        } else if error_lower.contains("tool") || error_lower.contains("command not found") {
            FailureCategory::ToolError
        } else if error_lower.contains("state") || error_lower.contains("already") {
            FailureCategory::StateError
        } else {
            FailureCategory::Unknown
        }
    }

    /// Check if a failure category is recoverable
    fn is_recoverable(&self, category: &FailureCategory) -> bool {
        matches!(
            category,
            FailureCategory::NetworkError
                | FailureCategory::Timeout
                | FailureCategory::ResourceUnavailable
                | FailureCategory::StateError
        )
    }

    /// Identify patterns across failures
    async fn identify_failure_patterns(
        &self,
        assessment: &ExecutionAssessment,
    ) -> Result<Vec<FailurePattern>> {
        let mut patterns: HashMap<FailureCategory, Vec<&FailedStep>> = HashMap::new();

        for failed in &assessment.failed_steps {
            patterns
                .entry(failed.failure_category.clone())
                .or_default()
                .push(failed);
        }

        let mut result = Vec::new();

        for (category, steps) in patterns {
            if steps.is_empty() {
                continue;
            }

            let affected_steps: Vec<String> = steps.iter().map(|s| s.step_id.clone()).collect();
            let root_cause = self.analyze_root_cause(&category, &steps);

            result.push(FailurePattern {
                pattern_id: format!("pattern_{:?}_{}", category, uuid::Uuid::new_v4()),
                category: category.clone(),
                description: format!("{} failures of type {:?}", steps.len(), category),
                affected_steps,
                root_cause,
                frequency: steps.len(),
            });
        }

        // Sort by frequency (most common first)
        result.sort_by(|a, b| b.frequency.cmp(&a.frequency));

        Ok(result)
    }

    /// Analyze root cause of failures
    fn analyze_root_cause(
        &self,
        category: &FailureCategory,
        steps: &[&FailedStep],
    ) -> Option<String> {
        let errors: Vec<String> = steps.iter().filter_map(|s| s.error.clone()).collect();

        match category {
            FailureCategory::ResourceUnavailable => {
                Some("Required resources (files, APIs, services) may not exist or be accessible".to_string())
            }
            FailureCategory::PermissionDenied => {
                Some("Insufficient permissions to perform the requested operations".to_string())
            }
            FailureCategory::InvalidInput => {
                Some("Input parameters may be incorrectly formatted or contain invalid values".to_string())
            }
            FailureCategory::NetworkError => {
                Some("Network connectivity issues or service unavailability".to_string())
            }
            FailureCategory::Timeout => {
                Some("Operations are taking longer than expected, possibly due to resource constraints or large data".to_string())
            }
            FailureCategory::DependencyFailed => {
                Some("A required precondition or dependent step has not been satisfied".to_string())
            }
            FailureCategory::ToolError => {
                Some("The tool may be misconfigured or not available in the current environment".to_string())
            }
            FailureCategory::StateError => {
                Some("The system is in an unexpected state, possibly due to concurrent operations".to_string())
            }
            FailureCategory::Unknown => {
                if !errors.is_empty() {
                    Some(format!("Unknown error pattern. Common errors: {}", errors.join("; ")))
                } else {
                    None
                }
            }
        }
    }

    /// Generate corrections for failed steps
    async fn generate_corrections(
        &self,
        _goal: &Goal,
        assessment: &ExecutionAssessment,
        _patterns: &[FailurePattern],
    ) -> Result<Vec<Correction>> {
        let mut corrections = Vec::new();

        for (priority, failed) in assessment.failed_steps.iter().enumerate() {
            let correction = match failed.failure_category {
                FailureCategory::NetworkError | FailureCategory::Timeout => Correction {
                    for_step_id: failed.step_id.clone(),
                    correction_type: CorrectionType::Defer,
                    description:
                        "Retry after a brief delay to allow for transient issues to resolve"
                            .to_string(),
                    alternative_tool: None,
                    modified_parameters: None,
                    priority: (priority + 1) as u32,
                },
                FailureCategory::ResourceUnavailable => Correction {
                    for_step_id: failed.step_id.clone(),
                    correction_type: CorrectionType::Decompose,
                    description: "Create the missing resource or find an alternative path"
                        .to_string(),
                    alternative_tool: None,
                    modified_parameters: None,
                    priority: (priority + 1) as u32,
                },
                FailureCategory::InvalidInput => Correction {
                    for_step_id: failed.step_id.clone(),
                    correction_type: CorrectionType::RetryWithModification,
                    description: "Validate and correct input parameters before retrying"
                        .to_string(),
                    alternative_tool: None,
                    modified_parameters: None,
                    priority: (priority + 1) as u32,
                },
                FailureCategory::PermissionDenied => Correction {
                    for_step_id: failed.step_id.clone(),
                    correction_type: CorrectionType::RequiresHuman,
                    description: "Requires elevated permissions or user authorization".to_string(),
                    alternative_tool: None,
                    modified_parameters: None,
                    priority: (priority + 1) as u32,
                },
                FailureCategory::ToolError => Correction {
                    for_step_id: failed.step_id.clone(),
                    correction_type: CorrectionType::UseAlternativeTool,
                    description: "Try using an alternative tool with similar capabilities"
                        .to_string(),
                    alternative_tool: self.find_alternative_tool(&failed.tool_id),
                    modified_parameters: None,
                    priority: (priority + 1) as u32,
                },
                FailureCategory::DependencyFailed => {
                    Correction {
                        for_step_id: failed.step_id.clone(),
                        correction_type: CorrectionType::Decompose,
                        description: "Ensure dependencies are satisfied before retrying"
                            .to_string(),
                        alternative_tool: None,
                        modified_parameters: None,
                        priority: 1, // High priority - fix dependencies first
                    }
                }
                _ => Correction {
                    for_step_id: failed.step_id.clone(),
                    correction_type: CorrectionType::Retry,
                    description: "Retry the step with fresh context".to_string(),
                    alternative_tool: None,
                    modified_parameters: None,
                    priority: (priority + 1) as u32,
                },
            };

            corrections.push(correction);
        }

        // Sort by priority
        corrections.sort_by(|a, b| a.priority.cmp(&b.priority));

        Ok(corrections)
    }

    /// Find an alternative tool for a failed tool
    fn find_alternative_tool(&self, tool_id: &str) -> Option<String> {
        // Map of tools to their alternatives
        let alternatives: HashMap<&str, &str> = [
            ("file_read", "browser_fetch"),
            ("browser_navigate", "ui_open_url"),
            ("ui_click", "browser_click"),
            ("api_call", "browser_fetch"),
        ]
        .into_iter()
        .collect();

        alternatives.get(tool_id).map(|s| s.to_string())
    }

    /// Decompose failed complex steps into sub-goals
    async fn decompose_failed_steps(
        &self,
        goal: &Goal,
        assessment: &ExecutionAssessment,
        _context: &ExecutionContext,
    ) -> Result<Vec<SubGoal>> {
        let mut sub_goals = Vec::new();

        for (idx, failed) in assessment.failed_steps.iter().enumerate() {
            // Only decompose complex or critical failures
            if !failed.recoverable
                || matches!(
                    failed.failure_category,
                    FailureCategory::ResourceUnavailable | FailureCategory::DependencyFailed
                )
            {
                let sub_goal = SubGoal {
                    id: format!("subgoal_{}_{}", goal.id, uuid::Uuid::new_v4()),
                    parent_goal_id: goal.id.clone(),
                    from_step_id: failed.step_id.clone(),
                    description: format!("Resolve prerequisite for: {}", failed.description),
                    success_criteria: vec![format!(
                        "Step '{}' can execute successfully",
                        failed.description
                    )],
                    suggested_tools: self.suggest_tools_for_subgoal(&failed.failure_category),
                    priority: (idx + 1) as u32,
                };

                sub_goals.push(sub_goal);
            }
        }

        Ok(sub_goals)
    }

    /// Suggest tools for resolving a sub-goal based on failure category
    fn suggest_tools_for_subgoal(&self, category: &FailureCategory) -> Vec<String> {
        match category {
            FailureCategory::ResourceUnavailable => {
                vec!["file_write".to_string(), "browser_navigate".to_string()]
            }
            FailureCategory::DependencyFailed => {
                vec!["file_read".to_string(), "api_call".to_string()]
            }
            FailureCategory::PermissionDenied => {
                vec!["ui_dialog".to_string()]
            }
            _ => vec![],
        }
    }

    /// Generate recommendations using LLM
    async fn generate_recommendations(
        &self,
        goal: &Goal,
        assessment: &ExecutionAssessment,
        patterns: &[FailurePattern],
        context: &ExecutionContext,
    ) -> Result<Vec<String>> {
        let prompt = format!(
            r#"You are AGI Workforce's reflection engine. Analyze the execution results and provide 3-5 actionable recommendations to help complete the user's task.

Goal: {}

Execution Summary:
- Success rate: {:.1}%
- Successful steps: {}
- Failed steps: {}
- Progress estimate: {:.1}%

Failure Patterns:
{}

Recent Results:
{}

Provide 3-5 specific, actionable recommendations to improve the next iteration. Focus on:
1. How to avoid repeated failures
2. Alternative approaches that might work better
3. Missing steps or considerations
4. Resource or timing optimizations

Format: Return a JSON array of strings, each being one recommendation.
Example: ["Recommendation 1", "Recommendation 2", "Recommendation 3"]"#,
            goal.description,
            assessment.success_rate * 100.0,
            assessment.successful_steps.len(),
            assessment.failed_steps.len(),
            assessment.progress_estimate * 100.0,
            patterns
                .iter()
                .map(|p| format!("- {:?}: {} ({}x)", p.category, p.description, p.frequency))
                .collect::<Vec<_>>()
                .join("\n"),
            context
                .tool_results
                .iter()
                .take(5)
                .map(|r| format!(
                    "- {}: {} ({}ms)",
                    r.tool_id,
                    if r.success { "success" } else { "failed" },
                    r.execution_time_ms
                ))
                .collect::<Vec<_>>()
                .join("\n")
        );

        let router = self.router.read().await;
        let response = router
            .send_message(&prompt, None)
            .await
            .unwrap_or_else(|_| "[]".to_string());

        // Parse recommendations from JSON response
        let recommendations: Vec<String> = serde_json::from_str(&response).unwrap_or_else(|_| {
            // Fallback: generate basic recommendations
            vec![
                "Review and validate all input parameters before execution".to_string(),
                "Consider breaking complex steps into smaller, verifiable sub-tasks".to_string(),
                "Implement retry logic for transient failures".to_string(),
            ]
        });

        Ok(recommendations)
    }

    /// Build prompt for plan critique
    fn build_critique_prompt(
        &self,
        goal: &Goal,
        plan: &planner::Plan,
        knowledge: &[knowledge::KnowledgeEntry],
        past_insights: &[ReflectionInsight],
    ) -> String {
        let steps_desc: Vec<String> = plan
            .steps
            .iter()
            .enumerate()
            .map(|(i, s)| format!("{}. {} (tool: {})", i + 1, s.description, s.tool_id))
            .collect();

        let past_patterns: Vec<String> = past_insights
            .iter()
            .flat_map(|i| i.failure_patterns.iter())
            .map(|p| format!("- {:?}: {}", p.category, p.description))
            .take(5)
            .collect();

        format!(
            r#"You are AGI Workforce's plan critic. Evaluate this plan before execution and identify potential issues that could prevent the user's task from completing successfully.

Goal: {}

Proposed Plan ({} steps):
{}

Relevant Knowledge:
{}

Past Failure Patterns (from similar goals):
{}

Evaluate the plan and respond with a JSON object:
{{
  "quality_score": <0-100>,
  "likely_to_succeed": <true/false>,
  "risks": [
    {{"description": "...", "severity": <1-5>, "affected_steps": [...], "mitigation": "..."}}
  ],
  "suggestions": ["..."],
  "missing_elements": ["..."]
}}"#,
            goal.description,
            plan.steps.len(),
            steps_desc.join("\n"),
            knowledge
                .iter()
                .take(3)
                .map(|k| format!("- {}", k.content))
                .collect::<Vec<_>>()
                .join("\n"),
            if past_patterns.is_empty() {
                "None".to_string()
            } else {
                past_patterns.join("\n")
            }
        )
    }

    /// Parse critique response from LLM
    fn parse_critique_response(
        &self,
        response: &str,
        plan: &planner::Plan,
    ) -> Result<PlanCritique> {
        // Try to parse as JSON
        if let Ok(critique) = serde_json::from_str::<PlanCritique>(response) {
            return Ok(critique);
        }

        // Fallback: generate basic critique
        Ok(PlanCritique {
            quality_score: 70,
            likely_to_succeed: plan.steps.len() <= 10,
            risks: vec![PlanRisk {
                description: "Plan complexity may lead to cascading failures".to_string(),
                severity: 2,
                affected_steps: plan.steps.iter().map(|s| s.id.clone()).collect(),
                mitigation: Some("Consider breaking into smaller phases".to_string()),
            }],
            suggestions: vec![
                "Validate inputs before each step".to_string(),
                "Add checkpoints for long-running operations".to_string(),
            ],
            missing_elements: vec![],
        })
    }

    /// Calculate confidence score
    fn calculate_confidence(
        &self,
        assessment: &ExecutionAssessment,
        patterns: &[FailurePattern],
    ) -> f64 {
        let mut confidence = 0.5; // Base confidence

        // Increase confidence if success rate is high
        confidence += assessment.success_rate * 0.3;

        // Decrease confidence if there are many failure patterns
        confidence -= (patterns.len() as f64) * 0.05;

        // Increase confidence if failures are recoverable
        let recoverable_ratio = assessment
            .failed_steps
            .iter()
            .filter(|f| f.recoverable)
            .count() as f64
            / assessment.failed_steps.len().max(1) as f64;
        confidence += recoverable_ratio * 0.15;

        // Clamp to [0.0, 1.0]
        confidence.clamp(0.0, 1.0)
    }

    /// Estimate progress toward goal
    fn estimate_progress(&self, successful_steps: &[String], plan: &planner::Plan) -> f64 {
        if plan.steps.is_empty() {
            return 0.0;
        }

        // Simple: percentage of steps completed
        // More sophisticated: weight critical steps higher
        let completed = successful_steps.len() as f64;
        let total = plan.steps.len() as f64;

        (completed / total).min(1.0)
    }

    /// Calculate resource efficiency
    fn calculate_resource_efficiency(&self, used: &ResourceUsage, plan: &planner::Plan) -> f64 {
        let expected = &plan.estimated_resources;

        let cpu_eff = if expected.cpu_percent > 0.0 {
            (expected.cpu_percent / used.cpu_percent.max(0.1)).min(1.0)
        } else {
            1.0
        };

        let mem_eff = if expected.memory_mb > 0 {
            (expected.memory_mb as f64 / used.memory_mb.max(1) as f64).min(1.0)
        } else {
            1.0
        };

        (cpu_eff + mem_eff) / 2.0
    }

    /// Store reflection in history
    pub async fn store_reflection(&self, insight: &ReflectionInsight) -> Result<()> {
        let mut history = self.reflection_history.lock().await;

        history.push(insight.clone());

        // Trim to max size
        while history.len() > self.config.max_history_size {
            history.remove(0);
        }

        Ok(())
    }

    /// Get relevant past reflections using semantic similarity when enabled
    async fn get_relevant_reflections(
        &self,
        goal_description: &str,
        limit: usize,
    ) -> Result<Vec<ReflectionInsight>> {
        let history = self.reflection_history.lock().await;

        if !self.config.use_semantic_similarity || goal_description.is_empty() {
            // Fall back to recency-only
            return Ok(history.iter().rev().take(limit).cloned().collect());
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        // Score each reflection combining semantic similarity and recency
        let mut scored: Vec<(f32, &ReflectionInsight)> = history
            .iter()
            .map(|insight| {
                // Combine text fields for similarity matching
                let insight_text = format!(
                    "{} {}",
                    insight.recommendations.join(" "),
                    insight
                        .sub_goals
                        .iter()
                        .map(|g| g.description.as_str())
                        .collect::<Vec<_>>()
                        .join(" ")
                );

                let semantic_score = calculate_similarity(goal_description, &insight_text);

                // Recency score: exponential decay over configured half-life
                let age_hours = (now.saturating_sub(insight.timestamp)) as f32 / 3600.0;
                let recency_score = (-age_hours / self.config.recency_half_life_hours).exp();

                // Blend semantic and recency scores using configured weight
                let semantic_weight = self.config.semantic_weight.clamp(0.0, 1.0);
                let final_score =
                    (semantic_weight * semantic_score) + ((1.0 - semantic_weight) * recency_score);

                (final_score, insight)
            })
            .collect();

        // Sort by score descending
        scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

        Ok(scored
            .into_iter()
            .take(limit)
            .map(|(_, i)| i.clone())
            .collect())
    }

    /// Apply corrections to generate a revised plan
    pub async fn apply_corrections(
        &self,
        original_plan: &planner::Plan,
        corrections: &[Correction],
    ) -> Result<planner::Plan> {
        let mut revised_steps = original_plan.steps.clone();

        for correction in corrections {
            if let Some(step_idx) = revised_steps
                .iter()
                .position(|s| s.id == correction.for_step_id)
            {
                match correction.correction_type {
                    CorrectionType::Skip => {
                        revised_steps.remove(step_idx);
                    }
                    CorrectionType::UseAlternativeTool => {
                        if let Some(alt_tool) = &correction.alternative_tool {
                            revised_steps[step_idx].tool_id = alt_tool.clone();
                        }
                    }
                    CorrectionType::RetryWithModification => {
                        if let Some(params) = &correction.modified_parameters {
                            revised_steps[step_idx].parameters.extend(params.clone());
                        }
                    }
                    _ => {
                        // Other corrections don't modify the plan directly
                    }
                }
            }
        }

        Ok(planner::Plan {
            goal_id: original_plan.goal_id.clone(),
            steps: revised_steps,
            estimated_duration: original_plan.estimated_duration,
            estimated_resources: original_plan.estimated_resources.clone(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_failure_categorization() {
        let engine = create_test_engine();

        assert_eq!(
            engine.categorize_failure(&Some("file not found".to_string())),
            FailureCategory::ResourceUnavailable
        );

        assert_eq!(
            engine.categorize_failure(&Some("permission denied".to_string())),
            FailureCategory::PermissionDenied
        );

        assert_eq!(
            engine.categorize_failure(&Some("connection timeout".to_string())),
            FailureCategory::Timeout
        );
    }

    #[test]
    fn test_calculate_similarity_identical() {
        let score = calculate_similarity("hello world test", "hello world test");
        assert!(
            (score - 1.0).abs() < 0.01,
            "Identical texts should have similarity ~1.0, got {}",
            score
        );
    }

    #[test]
    fn test_calculate_similarity_partial() {
        let score = calculate_similarity("hello world test example", "hello world other sample");
        assert!(
            score > 0.2 && score < 0.8,
            "Partial overlap should have moderate similarity, got {}",
            score
        );
    }

    #[test]
    fn test_calculate_similarity_no_overlap() {
        let score = calculate_similarity("hello world test", "foo bar baz");
        assert!(
            score < 0.01,
            "No overlap should have near-zero similarity, got {}",
            score
        );
    }

    #[test]
    fn test_calculate_similarity_empty_text() {
        let score = calculate_similarity("", "hello world");
        assert!(
            score < 0.01,
            "Empty text should have zero similarity, got {}",
            score
        );

        let score2 = calculate_similarity("hello world", "");
        assert!(
            score2 < 0.01,
            "Empty text should have zero similarity, got {}",
            score2
        );
    }

    #[test]
    fn test_calculate_similarity_short_words_filtered() {
        // Words with <= 2 chars are filtered out
        let score = calculate_similarity("a b c d e", "a b c d e");
        assert!(
            score < 0.01,
            "Only short words should result in zero similarity, got {}",
            score
        );
    }

    #[test]
    fn test_calculate_similarity_case_insensitive() {
        let score = calculate_similarity("HELLO WORLD TEST", "hello world test");
        assert!(
            (score - 1.0).abs() < 0.01,
            "Similarity should be case insensitive, got {}",
            score
        );
    }

    #[test]
    fn test_reflection_config_default() {
        let config = ReflectionConfig::default();
        assert_eq!(config.max_history_size, 100);
        assert!(config.use_semantic_similarity);
        assert!((config.semantic_weight - 0.7).abs() < 0.01);
        assert!((config.recency_half_life_hours - 24.0).abs() < 0.01);
    }

    fn create_test_engine() -> ReflectionEngine {
        create_test_engine_with_config(ReflectionConfig::default())
    }

    fn create_test_engine_with_config(config: ReflectionConfig) -> ReflectionEngine {
        use crate::core::llm::LLMRouter;

        // Create minimal dependencies for testing
        let router = Arc::new(RwLock::new(LLMRouter::new()));
        let knowledge_base =
            Arc::new(KnowledgeBase::new(64).expect("Failed to create test knowledge base"));
        let learning = Arc::new(
            LearningSystem::new(false, false).expect("Failed to create test learning system"),
        );

        ReflectionEngine {
            router,
            knowledge_base,
            learning,
            reflection_history: Arc::new(tokio::sync::Mutex::new(Vec::new())),
            config,
        }
    }
}
