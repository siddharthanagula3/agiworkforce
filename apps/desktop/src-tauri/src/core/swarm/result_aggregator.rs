//! Result Aggregation for Parallel Execution
//!
//! Synthesizes results from multiple parallel sub-agent executions,
//! handling partial failures and producing coherent final outputs.

use super::SwarmResultType;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

/// Result from a single subtask execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtaskResult {
    /// ID of the subtask.
    pub subtask_id: String,
    /// ID of the agent that executed this.
    pub agent_id: String,
    /// Whether execution was successful.
    pub success: bool,
    /// The output value if successful.
    pub output: Option<serde_json::Value>,
    /// Error message if failed.
    pub error: Option<String>,
    /// Execution time.
    pub execution_time: Duration,
    /// Number of retries used.
    pub retries_used: u32,
    /// Additional metadata.
    pub metadata: HashMap<String, serde_json::Value>,
}

impl SubtaskResult {
    /// Creates a successful result.
    pub fn success(
        subtask_id: impl Into<String>,
        agent_id: impl Into<String>,
        output: serde_json::Value,
        execution_time: Duration,
    ) -> Self {
        Self {
            subtask_id: subtask_id.into(),
            agent_id: agent_id.into(),
            success: true,
            output: Some(output),
            error: None,
            execution_time,
            retries_used: 0,
            metadata: HashMap::new(),
        }
    }

    /// Creates a failed result.
    pub fn failure(
        subtask_id: impl Into<String>,
        agent_id: impl Into<String>,
        error: impl Into<String>,
        execution_time: Duration,
    ) -> Self {
        Self {
            subtask_id: subtask_id.into(),
            agent_id: agent_id.into(),
            success: false,
            output: None,
            error: Some(error.into()),
            execution_time,
            retries_used: 0,
            metadata: HashMap::new(),
        }
    }
}

/// Strategy for aggregating results.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum AggregationStrategy {
    /// Merge all successful results into one.
    #[default]
    MergeAll,
    /// Use the first successful result.
    FirstSuccess,
    /// Use the result with the highest confidence.
    HighestConfidence,
    /// Require all subtasks to succeed.
    RequireAll,
    /// Require a majority of subtasks to succeed.
    Majority,
    /// Custom aggregation function.
    Custom,
}

/// Aggregated result from parallel execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AggregatedResult {
    /// Whether the overall execution was successful.
    pub success: bool,
    /// The aggregated output value.
    pub output: serde_json::Value,
    /// Summary of execution.
    pub summary: String,
    /// Number of subtasks that succeeded.
    pub succeeded_count: usize,
    /// Number of subtasks that failed.
    pub failed_count: usize,
    /// Total execution time (wall clock).
    pub total_wall_time: Duration,
    /// Sum of all individual execution times.
    pub total_agent_time: Duration,
    /// Calculated speedup ratio.
    pub speedup_ratio: f64,
    /// Individual subtask results.
    pub subtask_results: Vec<SubtaskResult>,
    /// Errors from failed subtasks.
    pub errors: Vec<String>,
    /// Strategy used for aggregation.
    pub strategy_used: AggregationStrategy,
}

impl AggregatedResult {
    /// Creates an empty aggregated result.
    pub fn empty() -> Self {
        Self {
            success: false,
            output: serde_json::Value::Null,
            summary: String::new(),
            succeeded_count: 0,
            failed_count: 0,
            total_wall_time: Duration::ZERO,
            total_agent_time: Duration::ZERO,
            speedup_ratio: 0.0,
            subtask_results: Vec::new(),
            errors: Vec::new(),
            strategy_used: AggregationStrategy::MergeAll,
        }
    }
}

/// Result aggregator for synthesizing parallel execution outputs.
pub struct ResultAggregator {
    /// Strategy to use for aggregation.
    strategy: AggregationStrategy,
    /// Minimum success ratio for Majority strategy (0.0 - 1.0).
    majority_threshold: f64,
    /// Custom aggregation function.
    custom_aggregator: Option<Box<dyn Fn(&[SubtaskResult]) -> serde_json::Value + Send + Sync>>,
}

impl Default for ResultAggregator {
    fn default() -> Self {
        Self::new(AggregationStrategy::MergeAll)
    }
}

impl ResultAggregator {
    /// Creates a new result aggregator with the given strategy.
    pub fn new(strategy: AggregationStrategy) -> Self {
        Self {
            strategy,
            majority_threshold: 0.5,
            custom_aggregator: None,
        }
    }

    /// Sets the majority threshold for the Majority strategy.
    pub fn with_majority_threshold(mut self, threshold: f64) -> Self {
        self.majority_threshold = threshold.clamp(0.0, 1.0);
        self
    }

    /// Sets a custom aggregation function.
    pub fn with_custom_aggregator<F>(mut self, f: F) -> Self
    where
        F: Fn(&[SubtaskResult]) -> serde_json::Value + Send + Sync + 'static,
    {
        self.custom_aggregator = Some(Box::new(f));
        self.strategy = AggregationStrategy::Custom;
        self
    }

    /// Aggregates results from parallel execution.
    pub fn aggregate(
        &self,
        results: Vec<SubtaskResult>,
        wall_time: Duration,
    ) -> SwarmResultType<AggregatedResult> {
        if results.is_empty() {
            return Ok(AggregatedResult::empty());
        }

        let succeeded_count = results.iter().filter(|r| r.success).count();
        let failed_count = results.len() - succeeded_count;
        let total_agent_time: Duration = results.iter().map(|r| r.execution_time).sum();

        let errors: Vec<String> = results.iter().filter_map(|r| r.error.clone()).collect();

        // Determine success based on strategy
        let (success, output) = match self.strategy {
            AggregationStrategy::MergeAll => {
                let output = self.merge_all_outputs(&results);
                (succeeded_count > 0, output)
            }
            AggregationStrategy::FirstSuccess => {
                let first = results.iter().find(|r| r.success);
                match first {
                    Some(r) => (true, r.output.clone().unwrap_or(serde_json::Value::Null)),
                    None => (false, serde_json::Value::Null),
                }
            }
            AggregationStrategy::HighestConfidence => {
                let output = self.select_highest_confidence(&results);
                (output != serde_json::Value::Null, output)
            }
            AggregationStrategy::RequireAll => {
                if succeeded_count == results.len() {
                    let output = self.merge_all_outputs(&results);
                    (true, output)
                } else {
                    (false, serde_json::Value::Null)
                }
            }
            AggregationStrategy::Majority => {
                let ratio = succeeded_count as f64 / results.len() as f64;
                if ratio >= self.majority_threshold {
                    let output = self.merge_all_outputs(&results);
                    (true, output)
                } else {
                    (false, serde_json::Value::Null)
                }
            }
            AggregationStrategy::Custom => {
                if let Some(ref aggregator) = self.custom_aggregator {
                    let output = aggregator(&results);
                    (output != serde_json::Value::Null, output)
                } else {
                    (false, serde_json::Value::Null)
                }
            }
        };

        // Calculate speedup ratio
        let speedup_ratio = if wall_time.as_millis() > 0 {
            total_agent_time.as_millis() as f64 / wall_time.as_millis() as f64
        } else {
            1.0
        };

        let summary = format!(
            "{}/{} subtasks succeeded in {:?} (speedup: {:.2}x)",
            succeeded_count,
            results.len(),
            wall_time,
            speedup_ratio
        );

        Ok(AggregatedResult {
            success,
            output,
            summary,
            succeeded_count,
            failed_count,
            total_wall_time: wall_time,
            total_agent_time,
            speedup_ratio,
            subtask_results: results,
            errors,
            strategy_used: self.strategy,
        })
    }

    fn merge_all_outputs(&self, results: &[SubtaskResult]) -> serde_json::Value {
        let successful_outputs: Vec<_> = results
            .iter()
            .filter(|r| r.success)
            .filter_map(|r| r.output.clone())
            .collect();

        if successful_outputs.is_empty() {
            return serde_json::Value::Null;
        }

        if successful_outputs.len() == 1 {
            // Safe: we just confirmed len() == 1
            return successful_outputs.into_iter().next().unwrap_or(serde_json::Value::Null);
        }

        // If all outputs are objects, merge them
        if successful_outputs.iter().all(|v| v.is_object()) {
            let mut merged = serde_json::Map::new();
            for output in successful_outputs {
                if let serde_json::Value::Object(map) = output {
                    for (k, v) in map {
                        merged.insert(k, v);
                    }
                }
            }
            return serde_json::Value::Object(merged);
        }

        // Otherwise, return as array
        serde_json::Value::Array(successful_outputs)
    }

    fn select_highest_confidence(&self, results: &[SubtaskResult]) -> serde_json::Value {
        // Look for confidence scores in metadata
        let with_confidence: Vec<_> = results
            .iter()
            .filter(|r| r.success)
            .filter_map(|r| {
                let confidence = r
                    .metadata
                    .get("confidence")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.5);
                r.output.clone().map(|o| (o, confidence))
            })
            .collect();

        if with_confidence.is_empty() {
            return serde_json::Value::Null;
        }

        with_confidence
            .into_iter()
            .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(o, _)| o)
            .unwrap_or(serde_json::Value::Null)
    }

    /// Aggregates results with dependency ordering.
    pub fn aggregate_with_dependencies(
        &self,
        results: Vec<SubtaskResult>,
        dependency_order: &[String],
        wall_time: Duration,
    ) -> SwarmResultType<AggregatedResult> {
        // Sort results by dependency order
        let mut sorted_results = results.clone();
        sorted_results.sort_by(|a, b| {
            let a_idx = dependency_order
                .iter()
                .position(|id| id == &a.subtask_id)
                .unwrap_or(usize::MAX);
            let b_idx = dependency_order
                .iter()
                .position(|id| id == &b.subtask_id)
                .unwrap_or(usize::MAX);
            a_idx.cmp(&b_idx)
        });

        self.aggregate(sorted_results, wall_time)
    }

    /// Creates a summary report of the aggregation.
    pub fn create_summary_report(&self, result: &AggregatedResult) -> String {
        let mut report = String::new();

        report.push_str("=== Swarm Execution Summary ===\n\n");

        report.push_str(&format!(
            "Status: {}\n",
            if result.success { "SUCCESS" } else { "FAILED" }
        ));
        report.push_str(&format!("Strategy: {:?}\n", result.strategy_used));
        report.push_str(&format!(
            "Subtasks: {}/{} succeeded\n",
            result.succeeded_count,
            result.succeeded_count + result.failed_count
        ));
        report.push_str(&format!("Wall Time: {:?}\n", result.total_wall_time));
        report.push_str(&format!(
            "Total Agent Time: {:?}\n",
            result.total_agent_time
        ));
        report.push_str(&format!("Speedup Ratio: {:.2}x\n", result.speedup_ratio));

        if !result.errors.is_empty() {
            report.push_str("\n--- Errors ---\n");
            for (i, error) in result.errors.iter().enumerate() {
                report.push_str(&format!("{}. {}\n", i + 1, error));
            }
        }

        report.push_str("\n--- Subtask Results ---\n");
        for sub_result in &result.subtask_results {
            let status = if sub_result.success { "OK" } else { "FAIL" };
            report.push_str(&format!(
                "[{}] {} (agent: {}, time: {:?})\n",
                status, sub_result.subtask_id, sub_result.agent_id, sub_result.execution_time
            ));
        }

        report
    }
}

/// Builder for creating aggregated results.
pub struct AggregatedResultBuilder {
    results: Vec<SubtaskResult>,
    wall_time: Duration,
    strategy: AggregationStrategy,
}

impl AggregatedResultBuilder {
    /// Creates a new builder.
    pub fn new() -> Self {
        Self {
            results: Vec::new(),
            wall_time: Duration::ZERO,
            strategy: AggregationStrategy::MergeAll,
        }
    }

    /// Adds a subtask result.
    pub fn add_result(mut self, result: SubtaskResult) -> Self {
        self.results.push(result);
        self
    }

    /// Sets the wall time.
    pub fn wall_time(mut self, time: Duration) -> Self {
        self.wall_time = time;
        self
    }

    /// Sets the aggregation strategy.
    pub fn strategy(mut self, strategy: AggregationStrategy) -> Self {
        self.strategy = strategy;
        self
    }

    /// Builds the aggregated result.
    pub fn build(self) -> SwarmResultType<AggregatedResult> {
        let aggregator = ResultAggregator::new(self.strategy);
        aggregator.aggregate(self.results, self.wall_time)
    }
}

impl Default for AggregatedResultBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_merge_all_strategy() {
        let aggregator = ResultAggregator::new(AggregationStrategy::MergeAll);

        let results = vec![
            SubtaskResult::success(
                "s1",
                "a1",
                serde_json::json!({"key1": "value1"}),
                Duration::from_millis(100),
            ),
            SubtaskResult::success(
                "s2",
                "a2",
                serde_json::json!({"key2": "value2"}),
                Duration::from_millis(150),
            ),
            SubtaskResult::failure("s3", "a3", "error", Duration::from_millis(50)),
        ];

        let aggregated = aggregator
            .aggregate(results, Duration::from_millis(200))
            .unwrap();

        assert!(aggregated.success);
        assert_eq!(aggregated.succeeded_count, 2);
        assert_eq!(aggregated.failed_count, 1);

        // Check merged output contains both keys
        let output = aggregated.output.as_object().unwrap();
        assert!(output.contains_key("key1"));
        assert!(output.contains_key("key2"));
    }

    #[test]
    fn test_require_all_strategy() {
        let aggregator = ResultAggregator::new(AggregationStrategy::RequireAll);

        let results = vec![
            SubtaskResult::success(
                "s1",
                "a1",
                serde_json::json!("ok"),
                Duration::from_millis(100),
            ),
            SubtaskResult::failure("s2", "a2", "error", Duration::from_millis(50)),
        ];

        let aggregated = aggregator
            .aggregate(results, Duration::from_millis(100))
            .unwrap();

        assert!(!aggregated.success);
    }

    #[test]
    fn test_speedup_calculation() {
        let aggregator = ResultAggregator::new(AggregationStrategy::MergeAll);

        let results = vec![
            SubtaskResult::success(
                "s1",
                "a1",
                serde_json::json!("ok"),
                Duration::from_millis(500),
            ),
            SubtaskResult::success(
                "s2",
                "a2",
                serde_json::json!("ok"),
                Duration::from_millis(500),
            ),
            SubtaskResult::success(
                "s3",
                "a3",
                serde_json::json!("ok"),
                Duration::from_millis(500),
            ),
            SubtaskResult::success(
                "s4",
                "a4",
                serde_json::json!("ok"),
                Duration::from_millis(500),
            ),
        ];

        // 2000ms total agent time, but only 500ms wall time = 4x speedup
        let aggregated = aggregator
            .aggregate(results, Duration::from_millis(500))
            .unwrap();

        assert!((aggregated.speedup_ratio - 4.0).abs() < 0.01);
    }

    #[test]
    fn test_majority_strategy() {
        let aggregator =
            ResultAggregator::new(AggregationStrategy::Majority).with_majority_threshold(0.6);

        // 2 out of 3 success = 66% > 60% threshold
        let results = vec![
            SubtaskResult::success(
                "s1",
                "a1",
                serde_json::json!("ok"),
                Duration::from_millis(100),
            ),
            SubtaskResult::success(
                "s2",
                "a2",
                serde_json::json!("ok"),
                Duration::from_millis(100),
            ),
            SubtaskResult::failure("s3", "a3", "error", Duration::from_millis(100)),
        ];

        let aggregated = aggregator
            .aggregate(results, Duration::from_millis(100))
            .unwrap();

        assert!(aggregated.success);
    }
}
