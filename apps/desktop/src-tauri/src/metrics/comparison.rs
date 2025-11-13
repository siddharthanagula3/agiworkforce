use chrono::Utc;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

use super::PeriodStats;

/// Comparison between automated and manual approaches
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Comparison {
    pub manual_time_minutes: u64,
    pub automated_time_minutes: u64,
    pub time_saved_minutes: u64,
    pub manual_cost_usd: f64,
    pub automated_cost_usd: f64,
    pub cost_saved_usd: f64,
    pub manual_error_rate: f64,
    pub automated_error_rate: f64,
    pub quality_improvement_percent: f64,
}

/// Comparison between two time periods
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeriodComparison {
    pub current: PeriodStats,
    pub previous: PeriodStats,
    pub time_saved_change_percent: f64,
    pub cost_saved_change_percent: f64,
    pub automations_change_percent: f64,
}

/// Comparison to industry benchmarks
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkComparison {
    pub user_time_saved: f64,
    pub industry_avg_time_saved: f64,
    pub user_cost_saved: f64,
    pub industry_avg_cost_saved: f64,
    pub percentile: u8,
    pub above_average: bool,
}

/// Metrics comparison engine
pub struct MetricsComparison {
    db: Arc<Mutex<Connection>>,
}

impl MetricsComparison {
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        Self { db }
    }

    /// Compare automated vs manual approach for a specific automation type
    pub async fn compare_to_manual(&self, automation_type: &str) -> Result<Comparison, String> {
        // TODO: Load actual benchmark data based on automation type
        // For now, return example data

        let (manual_time, automated_time) = match automation_type {
            "data_entry" => (120, 5),
            "report_generation" => (60, 3),
            "email_processing" => (90, 4),
            "web_scraping" => (180, 10),
            _ => (120, 5),
        };

        let time_saved = manual_time - automated_time;
        let hourly_rate = 50.0;
        let manual_cost = (manual_time as f64 / 60.0) * hourly_rate;
        let automated_cost = 0.50; // LLM API cost

        Ok(Comparison {
            manual_time_minutes: manual_time,
            automated_time_minutes: automated_time,
            time_saved_minutes: time_saved,
            manual_cost_usd: manual_cost,
            automated_cost_usd: automated_cost,
            cost_saved_usd: manual_cost - automated_cost,
            manual_error_rate: 0.15,
            automated_error_rate: 0.02,
            quality_improvement_percent: 87.0,
        })
    }

    /// Compare current period to previous period
    pub async fn compare_to_previous_period(
        &self,
        user_id: &str,
        days: i64,
    ) -> Result<PeriodComparison, String> {
        let current = self.get_period_stats(user_id, 0, days).await?;
        let previous = self.get_period_stats(user_id, days, days).await?;

        let time_saved_change_percent = if previous.total_time_saved_hours > 0.0 {
            ((current.total_time_saved_hours - previous.total_time_saved_hours)
                / previous.total_time_saved_hours)
                * 100.0
        } else {
            0.0
        };

        let cost_saved_change_percent = if previous.total_cost_saved_usd > 0.0 {
            ((current.total_cost_saved_usd - previous.total_cost_saved_usd)
                / previous.total_cost_saved_usd)
                * 100.0
        } else {
            0.0
        };

        let automations_change_percent = if previous.total_automations_run > 0 {
            ((current.total_automations_run as f64 - previous.total_automations_run as f64)
                / previous.total_automations_run as f64)
                * 100.0
        } else {
            0.0
        };

        Ok(PeriodComparison {
            current,
            previous,
            time_saved_change_percent,
            cost_saved_change_percent,
            automations_change_percent,
        })
    }

    /// Compare user's performance to industry benchmarks
    pub async fn compare_to_industry_benchmark(
        &self,
        user_id: &str,
        role: &str,
    ) -> Result<BenchmarkComparison, String> {
        let user_stats = self.get_period_stats(user_id, 0, 30).await?;

        // Industry averages by role (example data)
        let (industry_time_saved, industry_cost_saved) = match role {
            "data_analyst" => (40.0, 2000.0),
            "sales_rep" => (30.0, 1500.0),
            "customer_support" => (50.0, 2500.0),
            "software_engineer" => (60.0, 3000.0),
            _ => (35.0, 1750.0),
        };

        let above_average = user_stats.total_time_saved_hours > industry_time_saved;
        let percentile = if above_average { 75 } else { 45 };

        Ok(BenchmarkComparison {
            user_time_saved: user_stats.total_time_saved_hours,
            industry_avg_time_saved: industry_time_saved,
            user_cost_saved: user_stats.total_cost_saved_usd,
            industry_avg_cost_saved: industry_cost_saved,
            percentile,
            above_average,
        })
    }

    /// Get period statistics
    async fn get_period_stats(
        &self,
        user_id: &str,
        offset_days: i64,
        period_days: i64,
    ) -> Result<PeriodStats, String> {
        let conn = self.db.lock().unwrap();
        let now = Utc::now().timestamp();
        let end = now - (offset_days * 24 * 60 * 60);
        let start = end - (period_days * 24 * 60 * 60);

        let (total_time_minutes, total_cost, count): (Option<i64>, Option<f64>, i64) = conn
            .query_row(
                "SELECT
                    SUM(time_saved_minutes),
                    SUM(cost_saved_usd),
                    COUNT(*)
                FROM realtime_metrics
                WHERE user_id = ?1 AND timestamp >= ?2 AND timestamp < ?3",
                rusqlite::params![user_id, start, end],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|e| format!("Failed to query stats: {}", e))?;

        let total_time_saved_hours = total_time_minutes.unwrap_or(0) as f64 / 60.0;
        let total_cost_saved_usd = total_cost.unwrap_or(0.0);
        let total_automations_run = count as u64;
        let avg_time_saved_per_run = if count > 0 {
            total_time_saved_hours / count as f64
        } else {
            0.0
        };

        Ok(PeriodStats {
            total_time_saved_hours,
            total_cost_saved_usd,
            total_automations_run,
            avg_time_saved_per_run,
            success_rate: 1.0,
            top_employees: Vec::new(),
        })
    }
}
