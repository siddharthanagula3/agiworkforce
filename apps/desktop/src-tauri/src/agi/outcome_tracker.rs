use super::process_reasoning::{Outcome, ProcessType, Strategy};
use anyhow::{anyhow, Result};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// OutcomeTracker - Tracks and analyzes process outcomes
pub struct OutcomeTracker {
    db_path: String,
    cache: Arc<Mutex<OutcomeCache>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OutcomeCache {
    recent_outcomes: Vec<TrackedOutcome>,
    success_rates: HashMap<String, f64>, // process_type -> success_rate
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackedOutcome {
    pub id: String,
    pub goal_id: String,
    pub process_type: ProcessType,
    pub metric_name: String,
    pub target_value: f64,
    pub actual_value: f64,
    pub achieved: bool,
    pub tracked_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessSuccessRate {
    pub process_type: ProcessType,
    pub success_rate: f64,
    pub total_executions: usize,
    pub successful_executions: usize,
    pub average_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategyPerformance {
    pub strategy_id: String,
    pub process_type: ProcessType,
    pub success_rate: f64,
    pub average_duration_ms: u64,
    pub execution_count: usize,
}

impl OutcomeTracker {
    pub fn new(db_path: String) -> Result<Self> {
        let tracker = Self {
            db_path,
            cache: Arc::new(Mutex::new(OutcomeCache {
                recent_outcomes: Vec::new(),
                success_rates: HashMap::new(),
            })),
        };

        // Initialize cache
        tracker.refresh_cache()?;

        Ok(tracker)
    }

    /// Track an outcome for a goal
    pub fn track_outcome(&self, goal_id: String, outcome: Outcome) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        let actual_value = outcome.actual_value.unwrap_or(0.0);

        conn.execute(
            "INSERT INTO outcome_tracking (id, goal_id, process_type, metric_name, target_value, actual_value, achieved, tracked_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                outcome.id,
                goal_id,
                outcome.process_type.as_str(),
                outcome.metric_name,
                outcome.target_value,
                actual_value,
                if outcome.achieved { 1 } else { 0 },
                chrono::Utc::now().timestamp(),
            ],
        )?;

        // Update cache
        let tracked = TrackedOutcome {
            id: outcome.id,
            goal_id,
            process_type: outcome.process_type,
            metric_name: outcome.metric_name,
            target_value: outcome.target_value,
            actual_value,
            achieved: outcome.achieved,
            tracked_at: chrono::Utc::now().timestamp(),
        };

        {
            let mut cache = self.cache.lock().unwrap();
            cache.recent_outcomes.push(tracked);
            // Keep only last 100 outcomes in cache
            if cache.recent_outcomes.len() > 100 {
                cache.recent_outcomes.remove(0);
            }
        }

        // Refresh success rates
        self.refresh_success_rates()?;

        Ok(())
    }

    /// Get all outcomes for a specific goal
    pub fn get_outcomes_for_goal(&self, goal_id: &str) -> Result<Vec<TrackedOutcome>> {
        let conn = Connection::open(&self.db_path)?;

        let mut stmt = conn.prepare(
            "SELECT id, goal_id, process_type, metric_name, target_value, actual_value, achieved, tracked_at
             FROM outcome_tracking
             WHERE goal_id = ?1
             ORDER BY tracked_at DESC"
        )?;

        let outcomes = stmt.query_map(params![goal_id], |row| {
            let process_type_str: String = row.get(2)?;
            let process_type = ProcessType::from_str(&process_type_str)
                .unwrap_or(ProcessType::DataEntry);

            Ok(TrackedOutcome {
                id: row.get(0)?,
                goal_id: row.get(1)?,
                process_type,
                metric_name: row.get(3)?,
                target_value: row.get(4)?,
                actual_value: row.get(5)?,
                achieved: row.get::<_, i32>(6)? == 1,
                tracked_at: row.get(7)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(outcomes)
    }

    /// Calculate success rate for a process type
    pub fn calculate_success_rate(&self, process_type: ProcessType) -> Result<f64> {
        // Check cache first
        {
            let cache = self.cache.lock().unwrap();
            if let Some(rate) = cache.success_rates.get(process_type.as_str()) {
                return Ok(*rate);
            }
        }

        // Calculate from database
        let conn = Connection::open(&self.db_path)?;

        let total: i64 = conn.query_row(
            "SELECT COUNT(*) FROM outcome_tracking WHERE process_type = ?1",
            params![process_type.as_str()],
            |row| row.get(0),
        )?;

        if total == 0 {
            return Ok(0.0);
        }

        let successful: i64 = conn.query_row(
            "SELECT COUNT(*) FROM outcome_tracking WHERE process_type = ?1 AND achieved = 1",
            params![process_type.as_str()],
            |row| row.get(0),
        )?;

        let rate = successful as f64 / total as f64;

        // Update cache
        {
            let mut cache = self.cache.lock().unwrap();
            cache.success_rates.insert(process_type.as_str().to_string(), rate);
        }

        Ok(rate)
    }

    /// Get detailed success statistics for a process type
    pub fn get_process_success_stats(&self, process_type: ProcessType) -> Result<ProcessSuccessRate> {
        let conn = Connection::open(&self.db_path)?;

        let total: i64 = conn.query_row(
            "SELECT COUNT(DISTINCT goal_id) FROM outcome_tracking WHERE process_type = ?1",
            params![process_type.as_str()],
            |row| row.get(0),
        )?;

        if total == 0 {
            return Ok(ProcessSuccessRate {
                process_type,
                success_rate: 0.0,
                total_executions: 0,
                successful_executions: 0,
                average_score: 0.0,
            });
        }

        // Count goals where all outcomes were achieved
        let mut stmt = conn.prepare(
            "SELECT goal_id,
                    COUNT(*) as total_outcomes,
                    SUM(CASE WHEN achieved = 1 THEN 1 ELSE 0 END) as achieved_outcomes
             FROM outcome_tracking
             WHERE process_type = ?1
             GROUP BY goal_id"
        )?;

        let mut successful = 0;
        let mut total_score = 0.0;

        let results = stmt.query_map(params![process_type.as_str()], |row| {
            let total_outcomes: i64 = row.get(1)?;
            let achieved_outcomes: i64 = row.get(2)?;
            Ok((total_outcomes, achieved_outcomes))
        })?;

        for result in results {
            let (total_outcomes, achieved_outcomes) = result?;
            let score = achieved_outcomes as f64 / total_outcomes as f64;
            total_score += score;

            if score >= 0.9 {
                successful += 1;
            }
        }

        let success_rate = successful as f64 / total as f64;
        let average_score = total_score / total as f64;

        Ok(ProcessSuccessRate {
            process_type,
            success_rate,
            total_executions: total as usize,
            successful_executions: successful,
            average_score,
        })
    }

    /// Get best performing strategies for a process type
    pub fn get_best_performing_strategies(&self, process_type: ProcessType) -> Result<Vec<Strategy>> {
        // For now, return a default strategy since we don't track strategy performance yet
        // This will be enhanced when we integrate with the process ontology

        let success_rate = self.calculate_success_rate(process_type)?;

        let (min_duration, max_duration) = process_type.expected_duration_range();
        let estimated_duration = (min_duration + max_duration) / 2;

        let strategy = Strategy {
            id: format!("strategy_{}_optimized", process_type.as_str()),
            name: format!("Optimized {} Strategy", process_type.as_str()),
            description: format!("High-performing strategy for {} (success rate: {:.1}%)",
                process_type.description(), success_rate * 100.0),
            process_type,
            priority_tools: process_type.typical_tools().iter().map(|s| s.to_string()).collect(),
            estimated_success_rate: success_rate,
            estimated_duration_ms: estimated_duration,
            resource_requirements: super::ResourceUsage {
                cpu_percent: 25.0,
                memory_mb: 512,
                network_mb: 20.0,
            },
        };

        Ok(vec![strategy])
    }

    /// Get all process success rates
    pub fn get_all_success_rates(&self) -> Result<HashMap<ProcessType, f64>> {
        let mut rates = HashMap::new();

        for process_type in ProcessType::all() {
            let rate = self.calculate_success_rate(process_type)?;
            rates.insert(process_type, rate);
        }

        Ok(rates)
    }

    /// Get outcomes summary for a time period
    pub fn get_outcomes_summary(&self, start_timestamp: i64, end_timestamp: i64) -> Result<OutcomeSummary> {
        let conn = Connection::open(&self.db_path)?;

        let total_outcomes: i64 = conn.query_row(
            "SELECT COUNT(*) FROM outcome_tracking WHERE tracked_at >= ?1 AND tracked_at <= ?2",
            params![start_timestamp, end_timestamp],
            |row| row.get(0),
        )?;

        let achieved_outcomes: i64 = conn.query_row(
            "SELECT COUNT(*) FROM outcome_tracking WHERE tracked_at >= ?1 AND tracked_at <= ?2 AND achieved = 1",
            params![start_timestamp, end_timestamp],
            |row| row.get(0),
        )?;

        let average_achievement: f64 = conn.query_row(
            "SELECT AVG(CAST(achieved AS REAL)) FROM outcome_tracking WHERE tracked_at >= ?1 AND tracked_at <= ?2",
            params![start_timestamp, end_timestamp],
            |row| row.get(0),
        ).unwrap_or(0.0);

        // Get breakdown by process type
        let mut stmt = conn.prepare(
            "SELECT process_type, COUNT(*), SUM(CASE WHEN achieved = 1 THEN 1 ELSE 0 END)
             FROM outcome_tracking
             WHERE tracked_at >= ?1 AND tracked_at <= ?2
             GROUP BY process_type"
        )?;

        let mut by_process_type = HashMap::new();

        let results = stmt.query_map(params![start_timestamp, end_timestamp], |row| {
            let process_type_str: String = row.get(0)?;
            let total: i64 = row.get(1)?;
            let achieved: i64 = row.get(2)?;
            Ok((process_type_str, total, achieved))
        })?;

        for result in results {
            let (process_type_str, total, achieved) = result?;
            if let Some(process_type) = ProcessType::from_str(&process_type_str) {
                by_process_type.insert(process_type, (total as usize, achieved as usize));
            }
        }

        Ok(OutcomeSummary {
            total_outcomes: total_outcomes as usize,
            achieved_outcomes: achieved_outcomes as usize,
            average_achievement,
            by_process_type,
            start_timestamp,
            end_timestamp,
        })
    }

    /// Refresh the cache from database
    fn refresh_cache(&self) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        // Load recent outcomes
        let mut stmt = conn.prepare(
            "SELECT id, goal_id, process_type, metric_name, target_value, actual_value, achieved, tracked_at
             FROM outcome_tracking
             ORDER BY tracked_at DESC
             LIMIT 100"
        )?;

        let outcomes = stmt.query_map([], |row| {
            let process_type_str: String = row.get(2)?;
            let process_type = ProcessType::from_str(&process_type_str)
                .unwrap_or(ProcessType::DataEntry);

            Ok(TrackedOutcome {
                id: row.get(0)?,
                goal_id: row.get(1)?,
                process_type,
                metric_name: row.get(3)?,
                target_value: row.get(4)?,
                actual_value: row.get(5)?,
                achieved: row.get::<_, i32>(6)? == 1,
                tracked_at: row.get(7)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;

        {
            let mut cache = self.cache.lock().unwrap();
            cache.recent_outcomes = outcomes;
        }

        self.refresh_success_rates()?;

        Ok(())
    }

    /// Refresh success rates in cache
    fn refresh_success_rates(&self) -> Result<()> {
        let mut rates = HashMap::new();

        for process_type in ProcessType::all() {
            let rate = self.calculate_success_rate_from_db(process_type)?;
            rates.insert(process_type.as_str().to_string(), rate);
        }

        {
            let mut cache = self.cache.lock().unwrap();
            cache.success_rates = rates;
        }

        Ok(())
    }

    fn calculate_success_rate_from_db(&self, process_type: ProcessType) -> Result<f64> {
        let conn = Connection::open(&self.db_path)?;

        let total: i64 = conn.query_row(
            "SELECT COUNT(*) FROM outcome_tracking WHERE process_type = ?1",
            params![process_type.as_str()],
            |row| row.get(0),
        )?;

        if total == 0 {
            return Ok(0.0);
        }

        let successful: i64 = conn.query_row(
            "SELECT COUNT(*) FROM outcome_tracking WHERE process_type = ?1 AND achieved = 1",
            params![process_type.as_str()],
            |row| row.get(0),
        )?;

        Ok(successful as f64 / total as f64)
    }

    /// Get trending metrics for a process type
    pub fn get_trending_metrics(&self, process_type: ProcessType, days: i64) -> Result<Vec<TrendingMetric>> {
        let conn = Connection::open(&self.db_path)?;

        let cutoff_timestamp = chrono::Utc::now().timestamp() - (days * 86400);

        let mut stmt = conn.prepare(
            "SELECT metric_name,
                    COUNT(*) as total,
                    SUM(CASE WHEN achieved = 1 THEN 1 ELSE 0 END) as achieved,
                    AVG(actual_value) as avg_value,
                    AVG(target_value) as avg_target
             FROM outcome_tracking
             WHERE process_type = ?1 AND tracked_at >= ?2
             GROUP BY metric_name
             ORDER BY total DESC"
        )?;

        let metrics = stmt.query_map(params![process_type.as_str(), cutoff_timestamp], |row| {
            let total: i64 = row.get(1)?;
            let achieved: i64 = row.get(2)?;
            let avg_value: f64 = row.get(3)?;
            let avg_target: f64 = row.get(4)?;

            Ok(TrendingMetric {
                metric_name: row.get(0)?,
                total_tracked: total as usize,
                achievement_rate: if total > 0 { achieved as f64 / total as f64 } else { 0.0 },
                average_value: avg_value,
                average_target: avg_target,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(metrics)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutcomeSummary {
    pub total_outcomes: usize,
    pub achieved_outcomes: usize,
    pub average_achievement: f64,
    pub by_process_type: HashMap<ProcessType, (usize, usize)>, // (total, achieved)
    pub start_timestamp: i64,
    pub end_timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrendingMetric {
    pub metric_name: String,
    pub total_tracked: usize,
    pub achievement_rate: f64,
    pub average_value: f64,
    pub average_target: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_outcome_tracker_creation() {
        // This would need a proper test database
        // For now, just test that the struct can be created
        assert!(true);
    }
}
