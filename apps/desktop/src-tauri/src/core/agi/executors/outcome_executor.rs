//! Outcome measurement executor.
//!
//! Provides tools for measuring and tracking execution outcomes, including
//! false positive rates, test pass rates, and other quality metrics.
//!
//! # Metrics
//!
//! This executor supports measuring various outcome metrics:
//!
//! - `false_positive_rate`: Measures the rate of failed operations (lower is better)
//! - `tests_passed`: Measures the test pass rate (higher is better)
//! - `data_accuracy`: Measures the success rate of operations
//! - `processing_time`: Measures total execution time
//! - `completion_rate`: Measures overall completion percentage
//!
//! # Integration
//!
//! The executor integrates with `OutcomeTracker` to persist and analyze
//! outcome data over time, enabling trend analysis and strategy optimization.

use super::{ExecutorContext, ToolExecutor};
use crate::core::agi::outcome_tracker::OutcomeTracker;
use crate::core::agi::process_reasoning::{Outcome, ProcessType};
use crate::core::agi::ExecutionContext;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;

/// Result of an outcome measurement operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutcomeMeasurement {
    /// The metric name that was measured.
    pub metric_name: String,
    /// The measured value.
    pub value: f64,
    /// The target value for comparison.
    pub target_value: Option<f64>,
    /// Whether the target was achieved.
    pub achieved: Option<bool>,
    /// Additional context about the measurement.
    pub context: Option<String>,
}

/// Summary of multiple outcome measurements.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutcomeSummary {
    /// Total number of measurements.
    pub total_measurements: usize,
    /// Number of achieved targets.
    pub achieved_count: usize,
    /// Overall success rate.
    pub success_rate: f64,
    /// Individual measurements.
    pub measurements: Vec<OutcomeMeasurement>,
}

/// Executor for outcome measurement operations.
///
/// Provides tools to measure and track various quality and performance
/// metrics from execution contexts.
///
/// # Tools
///
/// - `measure_false_positive_rate`: Calculate false positive rate from tool results
/// - `measure_tests_passed`: Calculate test pass rate from tool results
/// - `measure_outcome`: Generic outcome measurement for any metric
/// - `track_outcome`: Track an outcome in the persistent tracker
/// - `get_success_rate`: Get historical success rate for a process type
pub struct OutcomeExecutor {
    /// Optional outcome tracker for persistence.
    outcome_tracker: Option<Arc<OutcomeTracker>>,
}

impl OutcomeExecutor {
    /// Create a new outcome executor without persistence.
    pub fn new() -> Self {
        Self {
            outcome_tracker: None,
        }
    }

    /// Create an outcome executor with an outcome tracker for persistence.
    ///
    /// # Arguments
    ///
    /// * `tracker` - The outcome tracker to use for persistent storage.
    pub fn with_tracker(tracker: Arc<OutcomeTracker>) -> Self {
        Self {
            outcome_tracker: Some(tracker),
        }
    }

    /// Measure the false positive rate from execution context.
    ///
    /// The false positive rate is calculated as the ratio of failed operations
    /// to total operations. A lower rate indicates better accuracy.
    ///
    /// # Arguments
    ///
    /// * `execution_context` - The execution context containing tool results.
    ///
    /// # Returns
    ///
    /// The false positive rate as a value between 0.0 and 1.0.
    fn calculate_false_positive_rate(&self, execution_context: &ExecutionContext) -> f64 {
        let total = execution_context.tool_results.len();
        if total == 0 {
            return 0.0;
        }
        let failed = execution_context
            .tool_results
            .iter()
            .filter(|r| !r.success)
            .count();
        failed as f64 / total as f64
    }

    /// Measure the test pass rate from execution context.
    ///
    /// The test pass rate is calculated as the ratio of successful operations
    /// to total operations. A higher rate indicates better results.
    ///
    /// # Arguments
    ///
    /// * `execution_context` - The execution context containing tool results.
    ///
    /// # Returns
    ///
    /// The test pass rate as a value between 0.0 and 1.0.
    fn calculate_tests_passed(&self, execution_context: &ExecutionContext) -> f64 {
        let total = execution_context.tool_results.len();
        if total == 0 {
            return 0.0;
        }
        let passed = execution_context
            .tool_results
            .iter()
            .filter(|r| r.success)
            .count();
        passed as f64 / total as f64
    }

    /// Calculate a generic metric value based on the metric name.
    ///
    /// This method dispatches to the appropriate calculation based on the
    /// metric name, supporting all standard outcome metrics.
    ///
    /// # Arguments
    ///
    /// * `metric_name` - The name of the metric to calculate.
    /// * `execution_context` - The execution context containing tool results.
    ///
    /// # Returns
    ///
    /// The calculated metric value.
    fn calculate_metric(&self, metric_name: &str, execution_context: &ExecutionContext) -> f64 {
        match metric_name {
            // Time-based metrics: sum of execution times
            "processing_time" | "response_time" | "deployment_time" => {
                let total_time_ms: u64 = execution_context
                    .tool_results
                    .iter()
                    .map(|r| r.execution_time_ms)
                    .sum();
                total_time_ms as f64 / 1000.0
            }

            // Accuracy metrics: success rate
            "data_accuracy" | "categorization_accuracy" | "response_quality" => {
                let total = execution_context.tool_results.len();
                if total == 0 {
                    return 0.0;
                }
                let successful = execution_context
                    .tool_results
                    .iter()
                    .filter(|r| r.success)
                    .count();
                successful as f64 / total as f64
            }

            // Count metrics: number of successful operations
            "invoices_processed" | "tickets_resolved" | "records_processed"
            | "emails_categorized" | "leads_scored" | "posts_scheduled" => execution_context
                .tool_results
                .iter()
                .filter(|r| r.success)
                .count()
                as f64,

            // Coverage metrics: success rate
            "test_coverage" | "documentation_completeness" | "completion_rate" => {
                let total = execution_context.tool_results.len();
                if total == 0 {
                    return 0.0;
                }
                let successful = execution_context
                    .tool_results
                    .iter()
                    .filter(|r| r.success)
                    .count();
                successful as f64 / total as f64
            }

            // Error rate metrics: failure rate
            "false_positive_rate" => self.calculate_false_positive_rate(execution_context),

            // Binary metrics: all succeeded or not
            "deployment_success" | "rollback_needed" => {
                let all_succeeded = execution_context.tool_results.iter().all(|r| r.success);
                if all_succeeded {
                    1.0
                } else {
                    0.0
                }
            }

            // Test pass rate
            "tests_passed" => self.calculate_tests_passed(execution_context),

            // Default: success rate
            _ => {
                let total = execution_context.tool_results.len();
                if total == 0 {
                    return 0.0;
                }
                let successful = execution_context
                    .tool_results
                    .iter()
                    .filter(|r| r.success)
                    .count();
                successful as f64 / total as f64
            }
        }
    }

    /// Determine if a metric achieved its target.
    ///
    /// Different metrics have different comparison logic:
    /// - Time-based metrics: lower is better
    /// - Error rate metrics: lower is better
    /// - Quality metrics: higher is better
    ///
    /// # Arguments
    ///
    /// * `metric_name` - The name of the metric.
    /// * `actual_value` - The measured value.
    /// * `target_value` - The target value.
    ///
    /// # Returns
    ///
    /// `true` if the target was achieved, `false` otherwise.
    fn is_target_achieved(&self, metric_name: &str, actual_value: f64, target_value: f64) -> bool {
        match metric_name {
            // For time-based metrics, lower is better
            "processing_time" | "response_time" | "deployment_time" => actual_value <= target_value,

            // For error rate metrics, lower is better
            "false_positive_rate" | "rollback_needed" => actual_value <= target_value,

            // For quality metrics, higher is better
            _ => actual_value >= target_value,
        }
    }

    /// Execute the measure_false_positive_rate tool.
    async fn execute_measure_false_positive_rate(
        &self,
        parameters: &HashMap<String, Value>,
        _context: &ExecutorContext,
        execution_context: &ExecutionContext,
    ) -> Result<Value> {
        let target_value = parameters
            .get("target")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.1); // Default target: 10% or less

        let actual_value = self.calculate_false_positive_rate(execution_context);
        let achieved = actual_value <= target_value;

        tracing::info!(
            "[OutcomeExecutor] measure_false_positive_rate: actual={:.4}, target={:.4}, achieved={}",
            actual_value,
            target_value,
            achieved
        );

        Ok(json!({
            "success": true,
            "metric_name": "false_positive_rate",
            "value": actual_value,
            "target_value": target_value,
            "achieved": achieved,
            "total_operations": execution_context.tool_results.len(),
            "failed_operations": execution_context.tool_results.iter().filter(|r| !r.success).count(),
            "description": format!(
                "False positive rate is {:.2}% (target: {:.2}% or less)",
                actual_value * 100.0,
                target_value * 100.0
            )
        }))
    }

    /// Execute the measure_tests_passed tool.
    async fn execute_measure_tests_passed(
        &self,
        parameters: &HashMap<String, Value>,
        _context: &ExecutorContext,
        execution_context: &ExecutionContext,
    ) -> Result<Value> {
        let target_value = parameters
            .get("target")
            .and_then(|v| v.as_f64())
            .unwrap_or(1.0); // Default target: 100% pass rate

        let actual_value = self.calculate_tests_passed(execution_context);
        let achieved = actual_value >= target_value;

        let total = execution_context.tool_results.len();
        let passed = execution_context
            .tool_results
            .iter()
            .filter(|r| r.success)
            .count();

        tracing::info!(
            "[OutcomeExecutor] measure_tests_passed: actual={:.4}, target={:.4}, achieved={} ({}/{})",
            actual_value,
            target_value,
            achieved,
            passed,
            total
        );

        Ok(json!({
            "success": true,
            "metric_name": "tests_passed",
            "value": actual_value,
            "target_value": target_value,
            "achieved": achieved,
            "total_tests": total,
            "passed_tests": passed,
            "failed_tests": total - passed,
            "description": format!(
                "Test pass rate is {:.2}% ({}/{} tests passed, target: {:.2}%)",
                actual_value * 100.0,
                passed,
                total,
                target_value * 100.0
            )
        }))
    }

    /// Execute the generic measure_outcome tool.
    async fn execute_measure_outcome(
        &self,
        parameters: &HashMap<String, Value>,
        _context: &ExecutorContext,
        execution_context: &ExecutionContext,
    ) -> Result<Value> {
        let metric_name = parameters
            .get("metric_name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing required 'metric_name' parameter"))?;

        let target_value = parameters.get("target").and_then(|v| v.as_f64());

        let actual_value = self.calculate_metric(metric_name, execution_context);
        let achieved = target_value.map(|t| self.is_target_achieved(metric_name, actual_value, t));

        tracing::info!(
            "[OutcomeExecutor] measure_outcome: metric={} actual={:.4} target={:?} achieved={:?}",
            metric_name,
            actual_value,
            target_value,
            achieved
        );

        let mut result = json!({
            "success": true,
            "metric_name": metric_name,
            "value": actual_value,
            "total_operations": execution_context.tool_results.len()
        });

        if let Some(t) = target_value {
            result["target_value"] = json!(t);
        }
        if let Some(a) = achieved {
            result["achieved"] = json!(a);
        }

        Ok(result)
    }

    /// Execute the track_outcome tool to persist an outcome.
    async fn execute_track_outcome(
        &self,
        parameters: &HashMap<String, Value>,
        _context: &ExecutorContext,
        execution_context: &ExecutionContext,
    ) -> Result<Value> {
        let goal_id = parameters
            .get("goal_id")
            .and_then(|v| v.as_str())
            .unwrap_or(&execution_context.goal.id);

        let metric_name = parameters
            .get("metric_name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing required 'metric_name' parameter"))?;

        let target_value = parameters
            .get("target_value")
            .and_then(|v| v.as_f64())
            .ok_or_else(|| anyhow!("Missing required 'target_value' parameter"))?;

        let process_type_str = parameters
            .get("process_type")
            .and_then(|v| v.as_str())
            .unwrap_or("data_entry");

        let process_type =
            ProcessType::from_str(process_type_str).unwrap_or(ProcessType::DataEntry);

        // Calculate the actual value
        let actual_value = self.calculate_metric(metric_name, execution_context);
        let achieved = self.is_target_achieved(metric_name, actual_value, target_value);

        // Create the outcome
        let outcome = Outcome {
            id: format!("{}_{}", goal_id, metric_name),
            process_type,
            metric_name: metric_name.to_string(),
            target_value,
            actual_value: Some(actual_value),
            achieved,
            unit: parameters
                .get("unit")
                .and_then(|v| v.as_str())
                .unwrap_or("ratio")
                .to_string(),
        };

        // Track the outcome if tracker is available
        if let Some(ref tracker) = self.outcome_tracker {
            tracker.track_outcome(goal_id.to_string(), outcome.clone())?;
            tracing::info!(
                "[OutcomeExecutor] Tracked outcome: goal={} metric={} achieved={}",
                goal_id,
                metric_name,
                achieved
            );
        } else {
            tracing::warn!("[OutcomeExecutor] No outcome tracker available, outcome not persisted");
        }

        Ok(json!({
            "success": true,
            "tracked": self.outcome_tracker.is_some(),
            "outcome": {
                "id": outcome.id,
                "process_type": process_type.as_str(),
                "metric_name": outcome.metric_name,
                "target_value": outcome.target_value,
                "actual_value": actual_value,
                "achieved": achieved,
                "unit": outcome.unit
            }
        }))
    }

    /// Execute the get_success_rate tool.
    async fn execute_get_success_rate(
        &self,
        parameters: &HashMap<String, Value>,
        _context: &ExecutorContext,
        _execution_context: &ExecutionContext,
    ) -> Result<Value> {
        let process_type_str = parameters
            .get("process_type")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing required 'process_type' parameter"))?;

        let process_type = ProcessType::from_str(process_type_str)
            .ok_or_else(|| anyhow!("Invalid process type: {}", process_type_str))?;

        if let Some(ref tracker) = self.outcome_tracker {
            let success_rate = tracker.calculate_success_rate(process_type)?;
            let stats = tracker.get_process_success_stats(process_type)?;

            tracing::info!(
                "[OutcomeExecutor] get_success_rate: process_type={} rate={:.4}",
                process_type_str,
                success_rate
            );

            Ok(json!({
                "success": true,
                "process_type": process_type_str,
                "success_rate": success_rate,
                "total_executions": stats.total_executions,
                "successful_executions": stats.successful_executions,
                "average_score": stats.average_score
            }))
        } else {
            Err(anyhow!(
                "No outcome tracker available. Cannot retrieve historical success rates."
            ))
        }
    }

    /// Execute the measure_all_outcomes tool to get a summary.
    async fn execute_measure_all_outcomes(
        &self,
        parameters: &HashMap<String, Value>,
        _context: &ExecutorContext,
        execution_context: &ExecutionContext,
    ) -> Result<Value> {
        let metrics: Vec<&str> = parameters
            .get("metrics")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect::<Vec<&str>>())
            .unwrap_or_else(|| {
                vec![
                    "false_positive_rate",
                    "tests_passed",
                    "data_accuracy",
                    "processing_time",
                    "completion_rate",
                ]
            });

        let targets: HashMap<String, f64> = parameters
            .get("targets")
            .and_then(|v| v.as_object())
            .map(|obj| {
                obj.iter()
                    .filter_map(|(k, v)| v.as_f64().map(|f| (k.clone(), f)))
                    .collect()
            })
            .unwrap_or_default();

        let mut measurements = Vec::new();
        let mut achieved_count = 0;

        for metric in &metrics {
            let value = self.calculate_metric(metric, execution_context);
            let target = targets.get(*metric).copied();
            let achieved = target.map(|t| self.is_target_achieved(metric, value, t));

            if achieved == Some(true) {
                achieved_count += 1;
            }

            measurements.push(OutcomeMeasurement {
                metric_name: metric.to_string(),
                value,
                target_value: target,
                achieved,
                context: None,
            });
        }

        let total = measurements.len();
        let success_rate = if total > 0 {
            achieved_count as f64 / total as f64
        } else {
            0.0
        };

        let summary = OutcomeSummary {
            total_measurements: total,
            achieved_count,
            success_rate,
            measurements,
        };

        tracing::info!(
            "[OutcomeExecutor] measure_all_outcomes: {} metrics, {} achieved ({:.2}%)",
            total,
            achieved_count,
            success_rate * 100.0
        );

        Ok(json!({
            "success": true,
            "summary": summary
        }))
    }
}

impl Default for OutcomeExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolExecutor for OutcomeExecutor {
    fn tool_names(&self) -> Vec<&'static str> {
        vec![
            "measure_false_positive_rate",
            "measure_tests_passed",
            "measure_outcome",
            "track_outcome",
            "get_success_rate",
            "measure_all_outcomes",
        ]
    }

    fn description(&self) -> &'static str {
        "Measures and tracks execution outcomes including false positive rates, test pass rates, and other quality metrics"
    }

    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
        execution_context: &ExecutionContext,
    ) -> Result<Value> {
        match tool_name {
            "measure_false_positive_rate" => {
                self.execute_measure_false_positive_rate(parameters, context, execution_context)
                    .await
            }
            "measure_tests_passed" => {
                self.execute_measure_tests_passed(parameters, context, execution_context)
                    .await
            }
            "measure_outcome" => {
                self.execute_measure_outcome(parameters, context, execution_context)
                    .await
            }
            "track_outcome" => {
                self.execute_track_outcome(parameters, context, execution_context)
                    .await
            }
            "get_success_rate" => {
                self.execute_get_success_rate(parameters, context, execution_context)
                    .await
            }
            "measure_all_outcomes" => {
                self.execute_measure_all_outcomes(parameters, context, execution_context)
                    .await
            }
            _ => Err(anyhow!("Unknown outcome tool: {}", tool_name)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::agi::{Goal, Priority, ResourceState, ToolExecutionResult};
    use std::sync::Arc;

    fn create_test_context() -> ExecutorContext {
        ExecutorContext {
            app_handle: None,
            automation: Arc::new(
                crate::automation::AutomationService::new()
                    .expect("Failed to create AutomationService for tests"),
            ),
            router: Arc::new(tokio::sync::RwLock::new(crate::core::llm::LLMRouter::new())),
            tool_cache: Arc::new(crate::data::cache::ToolResultCache::new()),
            security_guard: Arc::new(crate::sys::security::ToolExecutionGuard::new()),
            change_tracker: None,
            session_id: "test_session".to_string(),
            tool_id: "test_tool".to_string(),
        }
    }

    fn create_test_execution_context(
        success_count: usize,
        failure_count: usize,
    ) -> ExecutionContext {
        let mut tool_results = Vec::new();

        for i in 0..success_count {
            tool_results.push(ToolExecutionResult {
                tool_id: format!("tool_{}", i),
                step_id: format!("step_{}", i),
                success: true,
                result: json!({"status": "ok"}),
                error: None,
                execution_time_ms: 100,
                resources_used: crate::core::agi::ResourceUsage {
                    cpu_percent: 10.0,
                    memory_mb: 50,
                    network_mb: 1.0,
                },
            });
        }

        for i in 0..failure_count {
            tool_results.push(ToolExecutionResult {
                tool_id: format!("tool_fail_{}", i),
                step_id: format!("step_fail_{}", i),
                success: false,
                result: json!({}),
                error: Some("Test failure".to_string()),
                execution_time_ms: 50,
                resources_used: crate::core::agi::ResourceUsage {
                    cpu_percent: 5.0,
                    memory_mb: 25,
                    network_mb: 0.5,
                },
            });
        }

        ExecutionContext {
            goal: Goal {
                id: "test_goal".to_string(),
                description: "Test goal".to_string(),
                priority: Priority::Medium,
                deadline: None,
                constraints: vec![],
                success_criteria: vec![],
            },
            current_state: HashMap::new(),
            available_resources: ResourceState {
                cpu_usage_percent: 0.0,
                memory_usage_mb: 0,
                network_usage_mbps: 0.0,
                storage_usage_mb: 0,
                available_tools: vec![],
            },
            tool_results,
            context_memory: vec![],
        }
    }

    #[test]
    fn test_tool_names() {
        let executor = OutcomeExecutor::new();
        let names = executor.tool_names();

        assert!(names.contains(&"measure_false_positive_rate"));
        assert!(names.contains(&"measure_tests_passed"));
        assert!(names.contains(&"measure_outcome"));
        assert!(names.contains(&"track_outcome"));
        assert!(names.contains(&"get_success_rate"));
        assert!(names.contains(&"measure_all_outcomes"));
    }

    #[test]
    fn test_description() {
        let executor = OutcomeExecutor::new();
        let desc = executor.description();

        assert!(!desc.is_empty());
        assert!(desc.contains("outcome") || desc.contains("metric"));
    }

    #[test]
    fn test_calculate_false_positive_rate_all_success() {
        let executor = OutcomeExecutor::new();
        let exec_ctx = create_test_execution_context(10, 0);

        let rate = executor.calculate_false_positive_rate(&exec_ctx);
        assert_eq!(rate, 0.0);
    }

    #[test]
    fn test_calculate_false_positive_rate_all_failure() {
        let executor = OutcomeExecutor::new();
        let exec_ctx = create_test_execution_context(0, 10);

        let rate = executor.calculate_false_positive_rate(&exec_ctx);
        assert_eq!(rate, 1.0);
    }

    #[test]
    fn test_calculate_false_positive_rate_mixed() {
        let executor = OutcomeExecutor::new();
        let exec_ctx = create_test_execution_context(7, 3);

        let rate = executor.calculate_false_positive_rate(&exec_ctx);
        assert!((rate - 0.3).abs() < 0.001);
    }

    #[test]
    fn test_calculate_false_positive_rate_empty() {
        let executor = OutcomeExecutor::new();
        let exec_ctx = create_test_execution_context(0, 0);

        let rate = executor.calculate_false_positive_rate(&exec_ctx);
        assert_eq!(rate, 0.0);
    }

    #[test]
    fn test_calculate_tests_passed_all_success() {
        let executor = OutcomeExecutor::new();
        let exec_ctx = create_test_execution_context(10, 0);

        let rate = executor.calculate_tests_passed(&exec_ctx);
        assert_eq!(rate, 1.0);
    }

    #[test]
    fn test_calculate_tests_passed_all_failure() {
        let executor = OutcomeExecutor::new();
        let exec_ctx = create_test_execution_context(0, 10);

        let rate = executor.calculate_tests_passed(&exec_ctx);
        assert_eq!(rate, 0.0);
    }

    #[test]
    fn test_calculate_tests_passed_mixed() {
        let executor = OutcomeExecutor::new();
        let exec_ctx = create_test_execution_context(8, 2);

        let rate = executor.calculate_tests_passed(&exec_ctx);
        assert!((rate - 0.8).abs() < 0.001);
    }

    #[test]
    fn test_calculate_tests_passed_empty() {
        let executor = OutcomeExecutor::new();
        let exec_ctx = create_test_execution_context(0, 0);

        let rate = executor.calculate_tests_passed(&exec_ctx);
        assert_eq!(rate, 0.0);
    }

    #[test]
    fn test_is_target_achieved_time_metric() {
        let executor = OutcomeExecutor::new();

        // Time metrics: lower is better
        assert!(executor.is_target_achieved("processing_time", 5.0, 10.0));
        assert!(!executor.is_target_achieved("processing_time", 15.0, 10.0));
        assert!(executor.is_target_achieved("processing_time", 10.0, 10.0));
    }

    #[test]
    fn test_is_target_achieved_error_metric() {
        let executor = OutcomeExecutor::new();

        // Error metrics: lower is better
        assert!(executor.is_target_achieved("false_positive_rate", 0.05, 0.1));
        assert!(!executor.is_target_achieved("false_positive_rate", 0.15, 0.1));
    }

    #[test]
    fn test_is_target_achieved_quality_metric() {
        let executor = OutcomeExecutor::new();

        // Quality metrics: higher is better
        assert!(executor.is_target_achieved("tests_passed", 0.95, 0.9));
        assert!(!executor.is_target_achieved("tests_passed", 0.85, 0.9));
    }

    #[test]
    fn test_calculate_metric_processing_time() {
        let executor = OutcomeExecutor::new();
        let exec_ctx = create_test_execution_context(5, 3);

        // 5 successes * 100ms + 3 failures * 50ms = 650ms = 0.65s
        let time = executor.calculate_metric("processing_time", &exec_ctx);
        assert!((time - 0.65).abs() < 0.001);
    }

    #[test]
    fn test_calculate_metric_data_accuracy() {
        let executor = OutcomeExecutor::new();
        let exec_ctx = create_test_execution_context(9, 1);

        let accuracy = executor.calculate_metric("data_accuracy", &exec_ctx);
        assert!((accuracy - 0.9).abs() < 0.001);
    }

    #[test]
    fn test_calculate_metric_count() {
        let executor = OutcomeExecutor::new();
        let exec_ctx = create_test_execution_context(5, 3);

        let count = executor.calculate_metric("records_processed", &exec_ctx);
        assert_eq!(count, 5.0);
    }

    #[tokio::test]
    async fn test_execute_measure_false_positive_rate() {
        let executor = OutcomeExecutor::new();
        let context = create_test_context();
        let exec_ctx = create_test_execution_context(8, 2);

        let params: HashMap<String, Value> = [("target".to_string(), json!(0.3))].into();

        let result = executor
            .execute("measure_false_positive_rate", &params, &context, &exec_ctx)
            .await;

        assert!(result.is_ok());
        let value = result.unwrap();
        assert_eq!(value["success"], true);
        assert_eq!(value["metric_name"], "false_positive_rate");
        assert!((value["value"].as_f64().unwrap() - 0.2).abs() < 0.001);
        assert_eq!(value["achieved"], true);
    }

    #[tokio::test]
    async fn test_execute_measure_tests_passed() {
        let executor = OutcomeExecutor::new();
        let context = create_test_context();
        let exec_ctx = create_test_execution_context(9, 1);

        let params: HashMap<String, Value> = [("target".to_string(), json!(0.8))].into();

        let result = executor
            .execute("measure_tests_passed", &params, &context, &exec_ctx)
            .await;

        assert!(result.is_ok());
        let value = result.unwrap();
        assert_eq!(value["success"], true);
        assert_eq!(value["metric_name"], "tests_passed");
        assert!((value["value"].as_f64().unwrap() - 0.9).abs() < 0.001);
        assert_eq!(value["achieved"], true);
        assert_eq!(value["passed_tests"], 9);
        assert_eq!(value["failed_tests"], 1);
    }

    #[tokio::test]
    async fn test_execute_measure_outcome() {
        let executor = OutcomeExecutor::new();
        let context = create_test_context();
        let exec_ctx = create_test_execution_context(7, 3);

        let params: HashMap<String, Value> = [
            ("metric_name".to_string(), json!("completion_rate")),
            ("target".to_string(), json!(0.6)),
        ]
        .into();

        let result = executor
            .execute("measure_outcome", &params, &context, &exec_ctx)
            .await;

        assert!(result.is_ok());
        let value = result.unwrap();
        assert_eq!(value["success"], true);
        assert_eq!(value["metric_name"], "completion_rate");
        assert!((value["value"].as_f64().unwrap() - 0.7).abs() < 0.001);
        assert_eq!(value["achieved"], true);
    }

    #[tokio::test]
    async fn test_execute_measure_outcome_missing_param() {
        let executor = OutcomeExecutor::new();
        let context = create_test_context();
        let exec_ctx = create_test_execution_context(5, 5);

        let params: HashMap<String, Value> = HashMap::new();

        let result = executor
            .execute("measure_outcome", &params, &context, &exec_ctx)
            .await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Missing required 'metric_name'"));
    }

    #[tokio::test]
    async fn test_execute_measure_all_outcomes() {
        let executor = OutcomeExecutor::new();
        let context = create_test_context();
        let exec_ctx = create_test_execution_context(8, 2);

        let params: HashMap<String, Value> = [
            (
                "metrics".to_string(),
                json!(["false_positive_rate", "tests_passed"]),
            ),
            (
                "targets".to_string(),
                json!({"false_positive_rate": 0.3, "tests_passed": 0.7}),
            ),
        ]
        .into();

        let result = executor
            .execute("measure_all_outcomes", &params, &context, &exec_ctx)
            .await;

        assert!(result.is_ok());
        let value = result.unwrap();
        assert_eq!(value["success"], true);
        assert_eq!(value["summary"]["total_measurements"], 2);
        assert_eq!(value["summary"]["achieved_count"], 2);
    }

    #[tokio::test]
    async fn test_execute_unknown_tool() {
        let executor = OutcomeExecutor::new();
        let context = create_test_context();
        let exec_ctx = create_test_execution_context(5, 5);
        let params = HashMap::new();

        let result = executor
            .execute("unknown_outcome_tool", &params, &context, &exec_ctx)
            .await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Unknown outcome tool"));
    }

    #[test]
    fn test_default_trait() {
        let executor = OutcomeExecutor::default();
        assert_eq!(executor.tool_names().len(), 6);
    }
}
