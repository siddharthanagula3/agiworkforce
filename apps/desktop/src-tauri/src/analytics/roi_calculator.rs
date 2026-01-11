use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;

/// ROI Report with comprehensive business metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ROIReport {
    pub time_saved_hours: f64,
    pub cost_savings_usd: f64,
    pub error_reduction_percent: f64,
    pub productivity_gain_percent: f64,
    pub total_automations: usize,
    pub successful_executions: usize,
    pub failed_executions: usize,
    pub avg_execution_time_ms: f64,
    pub total_llm_cost_usd: f64,
    pub llm_cost_saved_usd: f64,
    pub report_start_date: i64,
    pub report_end_date: i64,
}

/// ROI Calculator with multi-factor analysis
pub struct ROICalculator {
    db: Arc<Mutex<Connection>>,
    avg_hourly_rate: f64, // Configurable average hourly rate for cost calculations
    baseline_error_rate: f64, // Baseline manual error rate for comparison
}

impl ROICalculator {
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        Self {
            db,
            avg_hourly_rate: 50.0,     // Default $50/hour
            baseline_error_rate: 0.15, // Default 15% manual error rate
        }
    }

    pub fn with_hourly_rate(mut self, rate: f64) -> Self {
        self.avg_hourly_rate = rate;
        self
    }

    pub fn with_baseline_error_rate(mut self, rate: f64) -> Self {
        self.baseline_error_rate = rate;
        self
    }

    /// Calculate comprehensive ROI for a date range
    pub async fn calculate_roi(&self, start_date: i64, end_date: i64) -> Result<ROIReport> {
        let time_saved = self.calculate_time_saved(start_date, end_date).await?;
        let cost_savings = self
            .calculate_cost_savings(start_date, end_date, time_saved)
            .await?;
        let error_reduction = self.calculate_error_reduction(start_date, end_date).await?;
        let productivity = self
            .calculate_productivity_gains(start_date, end_date)
            .await?;
        let (total_automations, successful, failed) =
            self.count_executions(start_date, end_date).await?;
        let avg_execution_time = self
            .calculate_avg_execution_time(start_date, end_date)
            .await?;
        let (llm_cost, llm_saved) = self.calculate_llm_costs(start_date, end_date).await?;

        Ok(ROIReport {
            time_saved_hours: time_saved,
            cost_savings_usd: cost_savings,
            error_reduction_percent: error_reduction,
            productivity_gain_percent: productivity,
            total_automations,
            successful_executions: successful,
            failed_executions: failed,
            avg_execution_time_ms: avg_execution_time,
            total_llm_cost_usd: llm_cost,
            llm_cost_saved_usd: llm_saved,
            report_start_date: start_date,
            report_end_date: end_date,
        })
    }

    /// Calculate time saved from automation (in hours)
    async fn calculate_time_saved(&self, start: i64, end: i64) -> Result<f64> {
        let conn = self.db.lock().await;

        // Query outcome_tracking for time-based metrics
        let time_saved_seconds: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(target_value - actual_value), 0) as time_saved
             FROM outcome_tracking
             WHERE (metric_name LIKE '%time%' OR metric_name LIKE '%duration%')
             AND timestamp >= ? AND timestamp <= ?
             AND achieved = 1",
                params![start, end],
                |row| row.get(0),
            )
            .unwrap_or(0.0);

        // Also calculate from automation_history duration vs estimated manual time
        let automation_time_saved: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(duration_ms), 0) as total_duration_ms
             FROM automation_history
             WHERE created_at >= ? AND created_at <= ?
             AND success = 1",
                params![start, end],
                |row| row.get(0),
            )
            .unwrap_or(0.0);

        // Estimate: automated tasks take 1/10th the time of manual execution
        let estimated_manual_time_ms = automation_time_saved * 10.0;
        let saved_from_automation_ms = estimated_manual_time_ms - automation_time_saved;

        // Convert to hours
        let total_saved_hours =
            (time_saved_seconds / 3600.0) + (saved_from_automation_ms / 3600000.0);

        Ok(total_saved_hours.max(0.0))
    }

    /// Calculate cost savings from multiple sources
    async fn calculate_cost_savings(
        &self,
        start: i64,
        end: i64,
        time_saved_hours: f64,
    ) -> Result<f64> {
        // Cost savings from time saved
        let time_cost_savings = time_saved_hours * self.avg_hourly_rate;

        // Cost savings from error reduction
        let error_savings = self.calculate_error_cost_savings(start, end).await?;

        // Cost savings from LLM optimization (Ollama vs cloud)
        let llm_savings = self.calculate_llm_cost_optimization(start, end).await?;

        Ok(time_cost_savings + error_savings + llm_savings)
    }

    /// Calculate error reduction percentage
    async fn calculate_error_reduction(&self, start: i64, end: i64) -> Result<f64> {
        let conn = self.db.lock().await;

        // Calculate success rate from automation_history
        let (total_automations, successful): (i64, i64) = conn
            .query_row(
                "SELECT COUNT(*), SUM(success)
             FROM automation_history
             WHERE created_at >= ? AND created_at <= ?",
                params![start, end],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap_or((0, 0));

        if total_automations == 0 {
            return Ok(0.0);
        }

        let automation_success_rate = successful as f64 / total_automations as f64;

        // Compare to baseline manual error rate
        let improvement = ((automation_success_rate - (1.0 - self.baseline_error_rate))
            / (1.0 - self.baseline_error_rate))
            * 100.0;

        Ok(improvement.max(0.0))
    }

    /// Calculate productivity gains
    async fn calculate_productivity_gains(&self, start: i64, end: i64) -> Result<f64> {
        let conn = self.db.lock().await;

        // Calculate from autonomous sessions completion rate
        let (total_sessions, completed_sessions): (i64, i64) = conn
            .query_row(
                "SELECT COUNT(*), SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)
             FROM autonomous_sessions
             WHERE created_at >= ? AND created_at <= ?",
                params![start, end],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap_or((0, 0));

        if total_sessions == 0 {
            return Ok(0.0);
        }

        let completion_rate = completed_sessions as f64 / total_sessions as f64;

        // Productivity gain is based on completion rate and time efficiency
        // Assumption: each completed automation increases productivity by its time savings
        let productivity_multiplier = completion_rate * 1.5; // 50% productivity boost per completed automation

        Ok(productivity_multiplier * 100.0)
    }

    /// Count total automations and their success/failure rates
    async fn count_executions(&self, start: i64, end: i64) -> Result<(usize, usize, usize)> {
        let conn = self.db.lock().await;

        let (total, successful): (i64, i64) = conn
            .query_row(
                "SELECT COUNT(*), SUM(success)
             FROM automation_history
             WHERE created_at >= ? AND created_at <= ?",
                params![start, end],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap_or((0, 0));

        let failed = total - successful;

        Ok((total as usize, successful as usize, failed as usize))
    }

    /// Calculate average execution time
    async fn calculate_avg_execution_time(&self, start: i64, end: i64) -> Result<f64> {
        let conn = self.db.lock().await;

        let avg_time: f64 = conn
            .query_row(
                "SELECT COALESCE(AVG(duration_ms), 0.0)
             FROM automation_history
             WHERE created_at >= ? AND created_at <= ?
             AND success = 1",
                params![start, end],
                |row| row.get(0),
            )
            .unwrap_or(0.0);

        Ok(avg_time)
    }

    /// Calculate LLM costs and savings
    async fn calculate_llm_costs(&self, start: i64, end: i64) -> Result<(f64, f64)> {
        let conn = self.db.lock().await;

        // Total LLM cost from messages
        let total_cost: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(cost), 0.0)
             FROM messages
             WHERE created_at >= ? AND created_at <= ?
             AND cost IS NOT NULL",
                params![start, end],
                |row| row.get(0),
            )
            .unwrap_or(0.0);

        // Calculate savings from using Ollama (local models)
        let ollama_tokens: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(tokens), 0)
             FROM messages
             WHERE created_at >= ? AND created_at <= ?
             AND provider = 'ollama'",
                params![start, end],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // Estimate cost savings (assume $0.002 per 1K tokens for GPT-4 equivalent)
        let cost_saved = (ollama_tokens as f64 / 1000.0) * 0.002;

        Ok((total_cost, cost_saved))
    }

    /// Calculate error cost savings
    async fn calculate_error_cost_savings(&self, start: i64, end: i64) -> Result<f64> {
        let conn = self.db.lock().await;

        // Count errors prevented by automation
        let errors_prevented: i64 = conn
            .query_row(
                "SELECT COUNT(*)
             FROM automation_history
             WHERE created_at >= ? AND created_at <= ?
             AND success = 1",
                params![start, end],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // Estimate: each prevented error saves $100 (avg cost of fixing an error)
        let avg_error_cost = 100.0;
        let estimated_errors_if_manual = errors_prevented as f64 * self.baseline_error_rate;

        Ok(estimated_errors_if_manual * avg_error_cost)
    }

    /// Calculate LLM cost optimization savings
    async fn calculate_llm_cost_optimization(&self, start: i64, end: i64) -> Result<f64> {
        let conn = self.db.lock().await;

        // Calculate cache hit savings
        let cache_savings: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(cost_saved), 0.0)
             FROM cache_entries
             WHERE created_at >= ? AND created_at <= ?",
                params![start, end],
                |row| row.get(0),
            )
            .unwrap_or(0.0);

        Ok(cache_savings)
    }

    /// Save ROI snapshot to database
    pub async fn save_snapshot(
        &self,
        user_id: &str,
        team_id: Option<&str>,
        report: &ROIReport,
    ) -> Result<String> {
        let conn = self.db.lock().await;
        let snapshot_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp();

        let roi_json = serde_json::to_string(report)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

        conn.execute(
            "INSERT INTO analytics_snapshots
             (id, user_id, team_id, snapshot_date, roi_data, metrics_data, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, '{}', ?6)",
            params![
                snapshot_id,
                user_id,
                team_id,
                report.report_end_date,
                roi_json,
                now
            ],
        )?;

        Ok(snapshot_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[tokio::test]
    async fn test_roi_calculator_initialization() {
        let conn = Connection::open_in_memory().unwrap();
        let db = Arc::new(Mutex::new(conn));
        let calculator = ROICalculator::new(db);

        assert_eq!(calculator.avg_hourly_rate, 50.0);
        assert_eq!(calculator.baseline_error_rate, 0.15);
    }

    #[tokio::test]
    async fn test_roi_calculator_with_custom_rates() {
        let conn = Connection::open_in_memory().unwrap();
        let db = Arc::new(Mutex::new(conn));
        let calculator = ROICalculator::new(db)
            .with_hourly_rate(75.0)
            .with_baseline_error_rate(0.20);

        assert_eq!(calculator.avg_hourly_rate, 75.0);
        assert_eq!(calculator.baseline_error_rate, 0.20);
    }
}
