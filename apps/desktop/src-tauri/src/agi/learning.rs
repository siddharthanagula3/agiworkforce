use super::*;
use crate::agi::planner::PlanStep;
use anyhow::Result;
use std::collections::HashMap;
use std::sync::Mutex;

/// Learning System - learns from experience and improves strategies
pub struct LearningSystem {
    enabled: bool,
    self_improvement_enabled: bool,
    experiences: Mutex<Vec<Experience>>,
    strategies: Mutex<HashMap<String, Strategy>>,
}

#[derive(Debug, Clone)]
struct Experience {
    goal_description: String,
    tool_id: String,
    success: bool,
    execution_time_ms: u64,
    resources_used: ResourceUsage,
    timestamp: u64,
}

#[derive(Debug, Clone)]
struct Strategy {
    tool_id: String,
    success_rate: f64,
    avg_execution_time_ms: u64,
    avg_resources: ResourceUsage,
    usage_count: u64,
}

impl LearningSystem {
    pub fn new(enabled: bool, self_improvement_enabled: bool) -> Result<Self> {
        Ok(Self {
            enabled,
            self_improvement_enabled,
            experiences: Mutex::new(Vec::new()),
            strategies: Mutex::new(HashMap::new()),
        })
    }

    /// Record an experience
    pub async fn record_experience(
        &self,
        step: &PlanStep,
        result: &ToolExecutionResult,
    ) -> Result<()> {
        if !self.enabled {
            return Ok(());
        }

        let experience = Experience {
            goal_description: step.description.clone(),
            tool_id: step.tool_id.clone(),
            success: result.success,
            execution_time_ms: result.execution_time_ms,
            resources_used: result.resources_used.clone(),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        };

        self.experiences.lock().unwrap().push(experience.clone());

        // Update strategy
        self.update_strategy(&experience).await?;

        Ok(())
    }

    async fn update_strategy(&self, experience: &Experience) -> Result<()> {
        let mut strategies = self.strategies.lock().unwrap();
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

        // Update statistics
        strategy.usage_count += 1;
        let success_count = self
            .experiences
            .lock()
            .unwrap()
            .iter()
            .filter(|e| e.tool_id == experience.tool_id && e.success)
            .count();
        strategy.success_rate = success_count as f64 / strategy.usage_count as f64;

        // Update average execution time
        let total_time: u64 = self
            .experiences
            .lock()
            .unwrap()
            .iter()
            .filter(|e| e.tool_id == experience.tool_id)
            .map(|e| e.execution_time_ms)
            .sum();
        strategy.avg_execution_time_ms = total_time / strategy.usage_count;

        // Update average resources (simplified)
        strategy.avg_resources.cpu_percent = experience.resources_used.cpu_percent;
        strategy.avg_resources.memory_mb = experience.resources_used.memory_mb;
        strategy.avg_resources.network_mb = experience.resources_used.network_mb;

        Ok(())
    }

    /// Get best strategy for a tool
    pub fn get_best_strategy(&self, tool_id: &str) -> Option<Strategy> {
        self.strategies.lock().unwrap().get(tool_id).cloned()
    }

    /// Update learning system (called periodically)
    pub async fn update(&self) -> Result<()> {
        if !self.enabled {
            return Ok(());
        }

        // Clean old experiences (keep last 10000)
        let mut experiences = self.experiences.lock().unwrap();
        if experiences.len() > 10000 {
            let len = experiences.len();
            experiences.drain(0..len - 10000);
        }

        // Self-improvement: optimize strategies
        if self.self_improvement_enabled {
            self.optimize_strategies().await?;
        }

        Ok(())
    }

    async fn optimize_strategies(&self) -> Result<()> {
        // Analyze experiences and optimize strategies
        // This could involve:
        // - Identifying patterns in failures
        // - Optimizing resource usage
        // - Improving tool selection
        // - Adapting parameters

        Ok(())
    }
}

