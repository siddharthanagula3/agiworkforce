use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionResult {
    pub plan_id: String,
    pub sandbox_id: String,
    pub success: bool,
    pub output: serde_json::Value,
    pub execution_time_ms: u64,
    pub steps_completed: usize,
    pub steps_failed: usize,
    pub error: Option<String>,
    pub cost: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoredResult {
    pub result: ExecutionResult,
    pub score: f64,
    pub rank: usize,
    pub reasons: Vec<String>,
}

pub struct ResultComparator;

impl ResultComparator {
    pub fn new() -> Self {
        Self
    }

    pub fn compare_and_rank(&self, results: Vec<ExecutionResult>) -> Vec<ScoredResult> {
        let mut scored_results: Vec<ScoredResult> = results
            .into_iter()
            .map(|result| {
                let (score, reasons) = self.calculate_score(&result);
                ScoredResult {
                    result,
                    score,
                    rank: 0,
                    reasons,
                }
            })
            .collect();

        scored_results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());

        for (idx, scored) in scored_results.iter_mut().enumerate() {
            scored.rank = idx + 1;
        }

        scored_results
    }

    fn calculate_score(&self, result: &ExecutionResult) -> (f64, Vec<String>) {
        let mut score = 0.0;
        let mut reasons = Vec::new();

        if result.success {
            score += 50.0;
            reasons.push("Task completed successfully".to_string());
        } else {
            score += 10.0;
            if let Some(ref error) = result.error {
                reasons.push(format!("Failed: {}", error));
            }
        }

        let completion_rate = if result.steps_completed + result.steps_failed > 0 {
            result.steps_completed as f64 / (result.steps_completed + result.steps_failed) as f64
        } else {
            0.0
        };
        score += completion_rate * 30.0;
        if completion_rate > 0.0 {
            reasons.push(format!(
                "Completed {}/{} steps ({:.0}%)",
                result.steps_completed,
                result.steps_completed + result.steps_failed,
                completion_rate * 100.0
            ));
        }

        let time_bonus = if result.execution_time_ms < 30000 {
            10.0
        } else if result.execution_time_ms < 60000 {
            5.0
        } else {
            0.0
        };
        score += time_bonus;
        if time_bonus > 0.0 {
            reasons.push(format!(
                "Fast execution ({:.1}s)",
                result.execution_time_ms as f64 / 1000.0
            ));
        }

        if let Some(cost) = result.cost {
            let cost_bonus = if cost < 0.01 {
                10.0
            } else if cost < 0.05 {
                5.0
            } else {
                0.0
            };
            score += cost_bonus;
            if cost_bonus > 0.0 {
                reasons.push(format!("Low cost (${:.4})", cost));
            }
        }

        (score, reasons)
    }

    pub fn get_best_result(&self, results: Vec<ExecutionResult>) -> Option<ScoredResult> {
        let scored = self.compare_and_rank(results);
        scored.into_iter().next()
    }

    pub fn format_comparison(&self, scored_results: &[ScoredResult]) -> String {
        let mut output = String::new();
        output.push_str("=== Parallel Execution Results ===\n\n");

        for scored in scored_results {
            output.push_str(&format!(
                "Rank #{} - Plan {} (Score: {:.1})\n",
                scored.rank, scored.result.plan_id, scored.score
            ));
            output.push_str(&format!("  Sandbox: {}\n", scored.result.sandbox_id));
            output.push_str(&format!(
                "  Success: {} | Time: {:.1}s | Steps: {}/{}\n",
                scored.result.success,
                scored.result.execution_time_ms as f64 / 1000.0,
                scored.result.steps_completed,
                scored.result.steps_completed + scored.result.steps_failed
            ));

            if let Some(cost) = scored.result.cost {
                output.push_str(&format!("  Cost: ${:.4}\n", cost));
            }

            output.push_str("  Reasons:\n");
            for reason in &scored.reasons {
                output.push_str(&format!("    - {}\n", reason));
            }

            if let Some(ref error) = scored.result.error {
                output.push_str(&format!("  Error: {}\n", error));
            }

            output.push_str("\n");
        }

        output
    }
}

impl Default for ResultComparator {
    fn default() -> Self {
        Self::new()
    }
}
