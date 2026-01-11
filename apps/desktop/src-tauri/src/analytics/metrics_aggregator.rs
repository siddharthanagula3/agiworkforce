use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Metrics aggregated by process type
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessMetrics {
    pub process_type: String,
    pub execution_count: usize,
    pub success_count: usize,
    pub failure_count: usize,
    pub success_rate: f64,
    pub avg_duration_seconds: f64,
    pub total_duration_seconds: f64,
    pub time_saved_hours: f64,
    pub cost_savings_usd: f64,
    pub error_rate: f64,
}

/// Metrics aggregated by user
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserMetrics {
    pub user_id: String,
    pub automation_count: usize,
    pub goal_count: usize,
    pub time_saved_hours: f64,
    pub cost_savings_usd: f64,
    pub most_used_tool: String,
    pub most_used_process: String,
    pub avg_success_rate: f64,
}

/// Metrics aggregated by tool
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolMetrics {
    pub tool_name: String,
    pub usage_count: usize,
    pub success_count: usize,
    pub failure_count: usize,
    pub success_rate: f64,
    pub avg_execution_time_ms: f64,
    pub total_time_saved_hours: f64,
}

/// Trend data point
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrendPoint {
    pub date: String, // ISO 8601 date format
    pub value: f64,
}

/// Metrics aggregator for comprehensive analytics
pub struct MetricsAggregator {
    db: Arc<Mutex<Connection>>,
    avg_hourly_rate: f64,
}

impl MetricsAggregator {
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        Self {
            db,
            avg_hourly_rate: 50.0,
        }
    }

    pub fn with_hourly_rate(mut self, rate: f64) -> Self {
        self.avg_hourly_rate = rate;
        self
    }

    /// Aggregate metrics by process type
    pub async fn aggregate_by_process_type(
        &self,
        start: i64,
        end: i64,
    ) -> Result<Vec<ProcessMetrics>> {
        let conn = self.db.lock().await;
        let mut stmt = conn.prepare(
            "SELECT
                task_type,
                COUNT(*) as total,
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
                SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed,
                AVG(duration_ms) as avg_duration_ms,
                SUM(duration_ms) as total_duration_ms
             FROM automation_history
             WHERE created_at >= ? AND created_at <= ?
             GROUP BY task_type
             ORDER BY total DESC",
        )?;

        let metrics_iter = stmt.query_map(params![start, end], |row| {
            let process_type: String = row.get(0)?;
            let total: i64 = row.get(1)?;
            let successful: i64 = row.get(2)?;
            let failed: i64 = row.get(3)?;
            let avg_duration_ms: f64 = row.get(4)?;
            let total_duration_ms: f64 = row.get(5)?;

            let success_rate = if total > 0 {
                (successful as f64 / total as f64) * 100.0
            } else {
                0.0
            };

            let error_rate = if total > 0 {
                (failed as f64 / total as f64) * 100.0
            } else {
                0.0
            };

            // Estimate time saved (automation is 10x faster than manual)
            let manual_time_ms = total_duration_ms * 10.0;
            let time_saved_ms = manual_time_ms - total_duration_ms;
            let time_saved_hours = time_saved_ms / 3600000.0;

            // Calculate cost savings
            let cost_savings_usd = time_saved_hours * 50.0; // Using default hourly rate

            Ok(ProcessMetrics {
                process_type,
                execution_count: total as usize,
                success_count: successful as usize,
                failure_count: failed as usize,
                success_rate,
                avg_duration_seconds: avg_duration_ms / 1000.0,
                total_duration_seconds: total_duration_ms / 1000.0,
                time_saved_hours,
                cost_savings_usd,
                error_rate,
            })
        })?;

        let mut metrics = Vec::new();
        for metric in metrics_iter {
            metrics.push(metric?);
        }

        Ok(metrics)
    }

    /// Aggregate metrics by user (simplified - assumes single user for now)
    pub async fn aggregate_by_user(&self, start: i64, end: i64) -> Result<Vec<UserMetrics>> {
        let conn = self.db.lock().await;

        // Count automations
        let automation_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM automation_history
             WHERE created_at >= ? AND created_at <= ?",
                params![start, end],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // Count goals
        let goal_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM autonomous_sessions
             WHERE created_at >= ? AND created_at <= ?",
                params![start, end],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // Calculate time saved
        let total_duration_ms: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(duration_ms), 0.0) FROM automation_history
             WHERE created_at >= ? AND created_at <= ? AND success = 1",
                params![start, end],
                |row| row.get(0),
            )
            .unwrap_or(0.0);

        let manual_time_ms = total_duration_ms * 10.0;
        let time_saved_hours = (manual_time_ms - total_duration_ms) / 3600000.0;
        let cost_savings_usd = time_saved_hours * self.avg_hourly_rate;

        // Find most used tool (from task logs)
        let most_used_tool: String = conn
            .query_row(
                "SELECT COALESCE(tool_name, 'unknown') FROM autonomous_task_logs
             WHERE created_at >= ? AND created_at <= ?
             GROUP BY tool_name
             ORDER BY COUNT(*) DESC
             LIMIT 1",
                params![start, end],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| "none".to_string());

        // Find most used process
        let most_used_process: String = conn
            .query_row(
                "SELECT task_type FROM automation_history
             WHERE created_at >= ? AND created_at <= ?
             GROUP BY task_type
             ORDER BY COUNT(*) DESC
             LIMIT 1",
                params![start, end],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| "none".to_string());

        // Calculate success rate
        let (total, successful): (i64, i64) = conn
            .query_row(
                "SELECT COUNT(*), SUM(success) FROM automation_history
             WHERE created_at >= ? AND created_at <= ?",
                params![start, end],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap_or((0, 0));

        let avg_success_rate = if total > 0 {
            (successful as f64 / total as f64) * 100.0
        } else {
            0.0
        };

        Ok(vec![UserMetrics {
            user_id: "default_user".to_string(),
            automation_count: automation_count as usize,
            goal_count: goal_count as usize,
            time_saved_hours,
            cost_savings_usd,
            most_used_tool,
            most_used_process,
            avg_success_rate,
        }])
    }

    /// Aggregate metrics by tool
    pub async fn aggregate_by_tool(&self, start: i64, end: i64) -> Result<Vec<ToolMetrics>> {
        let conn = self.db.lock().await;
        let mut stmt = conn.prepare(
            "SELECT
                tool_name,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                AVG(duration_ms) as avg_duration_ms
             FROM autonomous_task_logs
             WHERE created_at >= ? AND created_at <= ?
             AND tool_name IS NOT NULL
             GROUP BY tool_name
             ORDER BY total DESC",
        )?;

        let metrics_iter = stmt.query_map(params![start, end], |row| {
            let tool_name: String = row.get(0)?;
            let total: i64 = row.get(1)?;
            let successful: i64 = row.get(2)?;
            let failed: i64 = row.get(3)?;
            let avg_duration_ms: f64 = row.get(4).unwrap_or(0.0);

            let success_rate = if total > 0 {
                (successful as f64 / total as f64) * 100.0
            } else {
                0.0
            };

            // Estimate time saved per tool (5 minutes manual vs automated)
            let manual_time_per_use_hours = 5.0 / 60.0; // 5 minutes
            let automated_time_hours = (avg_duration_ms / 1000.0) / 3600.0;
            let time_saved_per_use = manual_time_per_use_hours - automated_time_hours;
            let total_time_saved_hours = time_saved_per_use * successful as f64;

            Ok(ToolMetrics {
                tool_name,
                usage_count: total as usize,
                success_count: successful as usize,
                failure_count: failed as usize,
                success_rate,
                avg_execution_time_ms: avg_duration_ms,
                total_time_saved_hours: total_time_saved_hours.max(0.0),
            })
        })?;

        let mut metrics = Vec::new();
        for metric in metrics_iter {
            metrics.push(metric?);
        }

        Ok(metrics)
    }

    /// Calculate daily trends for a specific metric
    pub async fn calculate_trends(&self, metric: &str, days: usize) -> Result<Vec<TrendPoint>> {
        let conn = self.db.lock().await;
        let end = chrono::Utc::now().timestamp();
        let start = end - (days as i64 * 24 * 60 * 60);

        let query = match metric {
            "automations" => {
                "SELECT DATE(created_at, 'unixepoch') as date, COUNT(*) as value
                 FROM automation_history
                 WHERE created_at >= ? AND created_at <= ?
                 GROUP BY date
                 ORDER BY date"
            }
            "success_rate" => {
                "SELECT DATE(created_at, 'unixepoch') as date,
                        AVG(CAST(success AS FLOAT)) * 100 as value
                 FROM automation_history
                 WHERE created_at >= ? AND created_at <= ?
                 GROUP BY date
                 ORDER BY date"
            }
            "time_saved" => {
                "SELECT DATE(tracked_at, 'unixepoch') as date,
                        SUM(target_value - actual_value) / 3600.0 as value
                 FROM outcome_tracking
                 WHERE tracked_at >= ? AND tracked_at <= ?
                 AND metric_name LIKE '%time%'
                 GROUP BY date
                 ORDER BY date"
            }
            "cost_savings" => {
                // Simplified: time saved * hourly rate
                "SELECT DATE(created_at, 'unixepoch') as date,
                        (SUM(duration_ms) * 9.0 / 3600000.0) * 50.0 as value
                 FROM automation_history
                 WHERE created_at >= ? AND created_at <= ?
                 AND success = 1
                 GROUP BY date
                 ORDER BY date"
            }
            _ => return Err(rusqlite::Error::InvalidQuery),
        };

        let mut stmt = conn.prepare(query)?;
        let trends_iter = stmt.query_map(params![start, end], |row| {
            Ok(TrendPoint {
                date: row.get(0)?,
                value: row.get(1)?,
            })
        })?;

        let mut trends = Vec::new();
        for trend in trends_iter {
            trends.push(trend?);
        }

        Ok(trends)
    }

    /// Get top performing processes
    pub async fn get_top_processes(
        &self,
        start: i64,
        end: i64,
        limit: usize,
    ) -> Result<Vec<ProcessMetrics>> {
        let mut all_metrics = self.aggregate_by_process_type(start, end).await?;

        // Sort by cost savings (descending)
        all_metrics.sort_by(|a, b| {
            b.cost_savings_usd
                .partial_cmp(&a.cost_savings_usd)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // Take top N
        all_metrics.truncate(limit);

        Ok(all_metrics)
    }

    /// Calculate overall metrics summary
    pub async fn get_summary(&self, start: i64, end: i64) -> Result<HashMap<String, f64>> {
        let conn = self.db.lock().await;
        let mut summary = HashMap::new();

        // Total automations
        let total: f64 = conn
            .query_row(
                "SELECT COUNT(*) FROM automation_history WHERE created_at >= ? AND created_at <= ?",
                params![start, end],
                |row| row.get(0),
            )
            .unwrap_or(0.0);
        summary.insert("total_automations".to_string(), total);

        // Success rate
        let success_rate: f64 = conn
            .query_row(
                "SELECT AVG(CAST(success AS FLOAT)) * 100
             FROM automation_history
             WHERE created_at >= ? AND created_at <= ?",
                params![start, end],
                |row| row.get(0),
            )
            .unwrap_or(0.0);
        summary.insert("success_rate".to_string(), success_rate);

        // Total time saved
        let duration: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(duration_ms), 0)
             FROM automation_history
             WHERE created_at >= ? AND created_at <= ? AND success = 1",
                params![start, end],
                |row| row.get(0),
            )
            .unwrap_or(0.0);
        let time_saved = (duration * 9.0) / 3600000.0; // 10x faster, so saved 9x
        summary.insert("time_saved_hours".to_string(), time_saved);

        // Cost savings
        let cost_savings = time_saved * self.avg_hourly_rate;
        summary.insert("cost_savings_usd".to_string(), cost_savings);

        Ok(summary)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[tokio::test]
    async fn test_metrics_aggregator_initialization() {
        let conn = Connection::open_in_memory().unwrap();
        let db = Arc::new(Mutex::new(conn));
        let aggregator = MetricsAggregator::new(db);

        assert_eq!(aggregator.avg_hourly_rate, 50.0);
    }
}
