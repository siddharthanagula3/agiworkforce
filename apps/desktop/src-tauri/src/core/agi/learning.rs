use super::*;
use crate::core::agi::planner::PlanStep;
use anyhow::Result;
use std::collections::HashMap;
use tokio::sync::RwLock;

/// MEM-011 fix: Maximum number of experiences to keep in memory
/// Prevents OOM in long-running sessions while maintaining enough history for learning
const MAX_EXPERIENCES: usize = 10_000;

/// MEM-011 fix: Number of oldest experiences to remove when limit is reached
/// Removes in batches for efficiency
const EXPERIENCE_CLEANUP_BATCH: usize = 1_000;

/// MEM-014 fix: Track per-tool statistics incrementally to avoid O(n²) scans
#[derive(Debug, Clone, Default)]
struct ToolStats {
    success_count: u64,
    total_time_ms: u64,
    usage_count: u64,
}

pub struct LearningSystem {
    enabled: bool,
    self_improvement_enabled: bool,
    experiences: RwLock<Vec<Experience>>,
    strategies: RwLock<HashMap<String, Strategy>>,
    /// MEM-014 fix: Per-tool running statistics for O(1) updates
    tool_stats: RwLock<HashMap<String, ToolStats>>,
}

#[derive(Debug, Clone)]
struct Experience {
    _goal_description: String,
    tool_id: String,
    success: bool,
    execution_time_ms: u64,
    resources_used: ResourceUsage,
    _timestamp: u64,
}

#[derive(Debug, Clone)]
pub struct Strategy {
    pub tool_id: String,
    pub success_rate: f64,
    pub avg_execution_time_ms: u64,
    pub avg_resources: ResourceUsage,
    pub usage_count: u64,
}

impl LearningSystem {
    pub fn new(enabled: bool, self_improvement_enabled: bool) -> Result<Self> {
        Ok(Self {
            enabled,
            self_improvement_enabled,
            experiences: RwLock::new(Vec::new()),
            strategies: RwLock::new(HashMap::new()),
            tool_stats: RwLock::new(HashMap::new()),
        })
    }

    pub async fn record_experience(
        &self,
        step: &PlanStep,
        result: &ToolExecutionResult,
    ) -> Result<()> {
        if !self.enabled {
            return Ok(());
        }

        // AUDIT-P3-006: Use unwrap_or(0) for timestamp to avoid panic
        let experience = Experience {
            _goal_description: step.description.clone(),
            tool_id: step.tool_id.clone(),
            success: result.success,
            execution_time_ms: result.execution_time_ms,
            resources_used: result.resources_used.clone(),
            _timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
        };

        {
            let mut experiences = self.experiences.write().await;

            // MEM-011 fix: Enforce maximum experiences limit to prevent OOM
            if experiences.len() >= MAX_EXPERIENCES {
                let remove_count = EXPERIENCE_CLEANUP_BATCH.min(experiences.len());
                tracing::info!(
                    current_count = experiences.len(),
                    removing = remove_count,
                    "Experience limit reached, removing oldest entries"
                );
                // Remove oldest experiences (drain from start is O(n) but happens infrequently)
                let _ = experiences.drain(0..remove_count);
            }

            experiences.push(experience.clone());
        }

        self.update_strategy(&experience).await?;

        Ok(())
    }

    /// MEM-014 fix: O(1) incremental strategy update instead of O(n) full scan
    async fn update_strategy(&self, experience: &Experience) -> Result<()> {
        // Update running statistics incrementally (O(1))
        let (success_count, total_time_ms, usage_count) = {
            let mut tool_stats = self.tool_stats.write().await;
            let stats = tool_stats.entry(experience.tool_id.clone()).or_default();

            stats.usage_count += 1;
            stats.total_time_ms += experience.execution_time_ms;
            if experience.success {
                stats.success_count += 1;
            }

            (stats.success_count, stats.total_time_ms, stats.usage_count)
        };

        // Update strategy with pre-computed stats (O(1))
        let mut strategies = self.strategies.write().await;
        let strategy = strategies
            .entry(experience.tool_id.clone())
            .or_insert_with(|| Strategy {
                tool_id: experience.tool_id.clone(),
                success_rate: 0.0,
                avg_execution_time_ms: 0,
                avg_resources: ResourceUsage {
                    cpu_percent: 0.0,
                    memory_mb: 0,
                    network_mb: 0.0,
                },
                usage_count: 0,
            });

        strategy.usage_count = usage_count;
        strategy.success_rate = success_count as f64 / usage_count as f64;
        strategy.avg_execution_time_ms = total_time_ms / usage_count;

        // Update resources with latest values (could use exponential moving average for smoothing)
        strategy.avg_resources.cpu_percent = experience.resources_used.cpu_percent;
        strategy.avg_resources.memory_mb = experience.resources_used.memory_mb;
        strategy.avg_resources.network_mb = experience.resources_used.network_mb;

        Ok(())
    }

    pub fn get_best_strategy(&self, tool_id: &str) -> Option<Strategy> {
        // Use try_read to avoid blocking - return None if lock is held
        self.strategies.try_read().ok()?.get(tool_id).cloned()
    }

    pub async fn update(&self) -> Result<()> {
        if !self.enabled {
            return Ok(());
        }

        {
            let mut experiences = self.experiences.write().await;
            if experiences.len() > 10000 {
                let len = experiences.len();
                experiences.drain(0..len - 10000);
            }
        }

        if self.self_improvement_enabled {
            self.optimize_strategies().await?;
        }

        Ok(())
    }

    /// Optimize strategies based on learned experiences.
    ///
    /// Analyzes success/failure patterns and logs performance metrics
    /// for each strategy to help identify areas for improvement.
    async fn optimize_strategies(&self) -> Result<()> {
        let strategies = self.strategies.read().await;

        // Log current state for optimization analysis
        tracing::debug!(
            "[Learning] Strategy optimization check: {} strategies tracked",
            strategies.len()
        );

        // Analyze each strategy's performance
        for (tool_id, strategy) in strategies.iter() {
            if strategy.usage_count > 0 {
                tracing::debug!(
                    "[Learning] Strategy '{}': success_rate={:.2}%, avg_time={}ms, usage_count={}",
                    tool_id,
                    strategy.success_rate * 100.0,
                    strategy.avg_execution_time_ms,
                    strategy.usage_count
                );

                // Flag underperforming strategies
                if strategy.success_rate < 0.5 && strategy.usage_count >= 5 {
                    tracing::warn!(
                        "[Learning] Strategy '{}' has low success rate ({:.1}%) - consider optimization",
                        tool_id,
                        strategy.success_rate * 100.0
                    );
                }

                // Flag slow strategies
                if strategy.avg_execution_time_ms > 30000 && strategy.usage_count >= 3 {
                    tracing::warn!(
                        "[Learning] Strategy '{}' has high avg execution time ({}ms) - consider optimization",
                        tool_id,
                        strategy.avg_execution_time_ms
                    );
                }
            }
        }

        Ok(())
    }
}
