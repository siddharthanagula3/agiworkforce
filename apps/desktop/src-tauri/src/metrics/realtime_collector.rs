use chrono::Utc;
use rusqlite::{Connection, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

use crate::realtime::RealtimeServer;

/// Configuration for hourly rate (defaults to $50/hr)
const DEFAULT_HOURLY_RATE: f64 = 50.0;

/// Automation run record for metrics calculation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationRun {
    pub id: String,
    pub user_id: String,
    pub employee_id: Option<String>,
    pub automation_name: String,
    pub estimated_manual_time_ms: u64,
    pub actual_execution_time_ms: u64,
    pub tasks_completed: u64,
    pub success: bool,
    pub validations_passed: u64,
    pub errors_prevented: u64,
    pub quality_score: f64,
    pub timestamp: i64,
}

impl AutomationRun {
    pub fn new(
        user_id: String,
        employee_id: Option<String>,
        automation_name: String,
        estimated_manual_time_ms: u64,
        actual_execution_time_ms: u64,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            user_id,
            employee_id,
            automation_name,
            estimated_manual_time_ms,
            actual_execution_time_ms,
            tasks_completed: 1,
            success: true,
            validations_passed: 0,
            errors_prevented: 0,
            quality_score: 1.0,
            timestamp: Utc::now().timestamp(),
        }
    }
}

/// Snapshot of metrics for a single automation run
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsSnapshot {
    pub id: String,
    pub user_id: String,
    pub automation_id: Option<String>,
    pub employee_id: Option<String>,
    pub time_saved_minutes: u64,
    pub cost_saved_usd: f64,
    pub tasks_completed: u64,
    pub errors_prevented: u64,
    pub quality_score: f64,
    pub timestamp: i64,
}

/// Statistics for a specific time period
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeriodStats {
    pub total_time_saved_hours: f64,
    pub total_cost_saved_usd: f64,
    pub total_automations_run: u64,
    pub avg_time_saved_per_run: f64,
    pub success_rate: f64,
    pub top_employees: Vec<EmployeePerformance>,
}

impl Default for PeriodStats {
    fn default() -> Self {
        Self {
            total_time_saved_hours: 0.0,
            total_cost_saved_usd: 0.0,
            total_automations_run: 0,
            avg_time_saved_per_run: 0.0,
            success_rate: 0.0,
            top_employees: Vec::new(),
        }
    }
}

/// Real-time statistics across different time periods
#[derive(Debug, Clone, Serialize, Deserialize)]
#[derive(Default)]
pub struct RealtimeStats {
    pub today: PeriodStats,
    pub this_week: PeriodStats,
    pub this_month: PeriodStats,
    pub all_time: PeriodStats,
}


/// Employee performance metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmployeePerformance {
    pub employee_id: String,
    pub employee_name: String,
    pub total_time_saved_hours: f64,
    pub total_cost_saved_usd: f64,
    pub automations_run: u64,
    pub success_rate: f64,
}

/// Real-time metrics collector
pub struct RealtimeMetricsCollector {
    db: Arc<Mutex<Connection>>,
    realtime_server: Arc<RealtimeServer>,
    hourly_rate: f64,
}

impl RealtimeMetricsCollector {
    pub fn new(db: Arc<Mutex<Connection>>, realtime_server: Arc<RealtimeServer>) -> Self {
        Self {
            db,
            realtime_server,
            hourly_rate: DEFAULT_HOURLY_RATE,
        }
    }

    /// Get database connection
    pub fn db_conn(&self) -> Arc<Mutex<Connection>> {
        Arc::clone(&self.db)
    }

    /// Record automation run and broadcast metrics update
    pub async fn record_automation_run(
        &self,
        run: AutomationRun,
    ) -> Result<MetricsSnapshot, String> {
        // Calculate metrics immediately
        let metrics = self.calculate_metrics(&run);

        // Store in database
        self.store_metrics(&metrics)
            .map_err(|e| format!("Failed to store metrics: {}", e))?;

        // Broadcast to UI via WebSocket
        self.broadcast_update(&run.user_id, metrics.clone()).await;

        // Check for milestones
        self.check_milestones(&run.user_id).await;

        Ok(metrics)
    }

    /// Calculate metrics from automation run
    fn calculate_metrics(&self, run: &AutomationRun) -> MetricsSnapshot {
        let time_saved_minutes = if run.estimated_manual_time_ms > run.actual_execution_time_ms {
            (run.estimated_manual_time_ms - run.actual_execution_time_ms) / 60_000
        } else {
            0
        };

        let cost_saved_usd = (time_saved_minutes as f64 / 60.0) * self.hourly_rate;

        MetricsSnapshot {
            id: Uuid::new_v4().to_string(),
            user_id: run.user_id.clone(),
            automation_id: Some(run.id.clone()),
            employee_id: run.employee_id.clone(),
            time_saved_minutes,
            cost_saved_usd,
            tasks_completed: run.tasks_completed,
            errors_prevented: run.errors_prevented,
            quality_score: run.quality_score,
            timestamp: run.timestamp,
        }
    }

    /// Store metrics in database
    fn store_metrics(&self, metrics: &MetricsSnapshot) -> SqliteResult<()> {
        let conn = self.db.lock().map_err(|e| {
            rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(
                format!("Database lock poisoned: {}", e),
            )))
        })?;
        conn.execute(
            "INSERT INTO realtime_metrics (
                id, user_id, automation_id, employee_id,
                time_saved_minutes, cost_saved_usd, tasks_completed,
                errors_prevented, quality_score, timestamp
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                &metrics.id,
                &metrics.user_id,
                &metrics.automation_id,
                &metrics.employee_id,
                metrics.time_saved_minutes as i64,
                metrics.cost_saved_usd,
                metrics.tasks_completed as i64,
                metrics.errors_prevented as i64,
                metrics.quality_score,
                metrics.timestamp,
            ],
        )?;
        Ok(())
    }

    /// Broadcast metrics update via WebSocket
    async fn broadcast_update(&self, user_id: &str, metrics: MetricsSnapshot) {
        use crate::realtime::RealtimeEvent;

        let metrics_value = match serde_json::to_value(metrics) {
            Ok(value) => value,
            Err(e) => {
                tracing::error!("Failed to serialize metrics for broadcast: {}", e);
                return;
            }
        };

        let event = RealtimeEvent::MetricsUpdated {
            metrics: metrics_value,
        };

        // Broadcast to user's connections
        let _ = self.realtime_server.broadcast_to_user(user_id, event).await;
    }

    /// Check for milestones and celebrate
    async fn check_milestones(&self, user_id: &str) {
        if let Ok(stats) = self.get_realtime_stats(user_id).await {
            let all_time = &stats.all_time;

            // Define milestone thresholds
            let milestones = vec![
                (10.0, "First 10 Hours Saved!"),
                (100.0, "100 Hours Saved!"),
                (1000.0, "1,000 Hours Saved!"),
            ];

            for (threshold, title) in milestones {
                if all_time.total_time_saved_hours >= threshold {
                    // Check if milestone already recorded
                    if !self.is_milestone_recorded(user_id, title).unwrap_or(true) {
                        self.record_milestone(
                            user_id,
                            title,
                            threshold,
                            all_time.total_cost_saved_usd,
                        )
                        .ok();

                        // Broadcast milestone event
                        use crate::realtime::RealtimeEvent;
                        let event = RealtimeEvent::MilestoneReached {
                            milestone: serde_json::json!({
                                "title": title,
                                "hours_saved": threshold,
                                "total_cost_saved": all_time.total_cost_saved_usd,
                            }),
                        };
                        let _ = self.realtime_server.broadcast_to_user(user_id, event).await;
                    }
                }
            }
        }
    }

    /// Check if milestone has been recorded
    fn is_milestone_recorded(&self, user_id: &str, milestone_type: &str) -> SqliteResult<bool> {
        let conn = self.db.lock().map_err(|e| {
            rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(
                format!("Database lock poisoned: {}", e),
            )))
        })?;
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM user_milestones WHERE user_id = ?1 AND milestone_type = ?2",
            rusqlite::params![user_id, milestone_type],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    /// Record milestone achievement
    fn record_milestone(
        &self,
        user_id: &str,
        milestone_type: &str,
        threshold_value: f64,
        _cost_saved: f64,
    ) -> SqliteResult<()> {
        let conn = self.db.lock().map_err(|e| {
            rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(
                format!("Database lock poisoned: {}", e),
            )))
        })?;
        conn.execute(
            "INSERT INTO user_milestones (id, user_id, milestone_type, threshold_value, achieved_at, shared)
             VALUES (?1, ?2, ?3, ?4, ?5, 0)",
            rusqlite::params![
                Uuid::new_v4().to_string(),
                user_id,
                milestone_type,
                threshold_value,
                Utc::now().timestamp(),
            ],
        )?;
        Ok(())
    }

    /// Get real-time statistics for a user
    pub async fn get_realtime_stats(&self, user_id: &str) -> Result<RealtimeStats, String> {
        let today = self
            .aggregate_period(user_id, 1)
            .await
            .map_err(|e| format!("Failed to get today stats: {}", e))?;
        let this_week = self
            .aggregate_period(user_id, 7)
            .await
            .map_err(|e| format!("Failed to get week stats: {}", e))?;
        let this_month = self
            .aggregate_period(user_id, 30)
            .await
            .map_err(|e| format!("Failed to get month stats: {}", e))?;
        let all_time = self
            .aggregate_all_time(user_id)
            .await
            .map_err(|e| format!("Failed to get all-time stats: {}", e))?;

        Ok(RealtimeStats {
            today,
            this_week,
            this_month,
            all_time,
        })
    }

    /// Aggregate metrics for a specific time period (in days)
    async fn aggregate_period(&self, user_id: &str, days: i64) -> SqliteResult<PeriodStats> {
        let conn = self.db.lock().map_err(|e| {
            rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(
                format!("Database lock poisoned: {}", e),
            )))
        })?;
        let cutoff = Utc::now().timestamp() - (days * 24 * 60 * 60);

        let (total_time_minutes, total_cost, count): (Option<i64>, Option<f64>, i64) = conn
            .query_row(
                "SELECT
                    SUM(time_saved_minutes),
                    SUM(cost_saved_usd),
                    COUNT(*)
                FROM realtime_metrics
                WHERE user_id = ?1 AND timestamp >= ?2",
                rusqlite::params![user_id, cutoff],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )?;

        let total_time_saved_hours = total_time_minutes.unwrap_or(0) as f64 / 60.0;
        let total_cost_saved_usd = total_cost.unwrap_or(0.0);
        let total_automations_run = count as u64;
        let avg_time_saved_per_run = if count > 0 {
            total_time_saved_hours / count as f64
        } else {
            0.0
        };

        // Get top employees
        let top_employees = self.get_top_employees(user_id, Some(cutoff))?;

        Ok(PeriodStats {
            total_time_saved_hours,
            total_cost_saved_usd,
            total_automations_run,
            avg_time_saved_per_run,
            success_rate: 1.0, // TODO: Track failures
            top_employees,
        })
    }

    /// Aggregate all-time metrics
    async fn aggregate_all_time(&self, user_id: &str) -> SqliteResult<PeriodStats> {
        let conn = self.db.lock().map_err(|e| {
            rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(
                format!("Database lock poisoned: {}", e),
            )))
        })?;

        let (total_time_minutes, total_cost, count): (Option<i64>, Option<f64>, i64) = conn
            .query_row(
                "SELECT
                    SUM(time_saved_minutes),
                    SUM(cost_saved_usd),
                    COUNT(*)
                FROM realtime_metrics
                WHERE user_id = ?1",
                rusqlite::params![user_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )?;

        let total_time_saved_hours = total_time_minutes.unwrap_or(0) as f64 / 60.0;
        let total_cost_saved_usd = total_cost.unwrap_or(0.0);
        let total_automations_run = count as u64;
        let avg_time_saved_per_run = if count > 0 {
            total_time_saved_hours / count as f64
        } else {
            0.0
        };

        // Get top employees
        let top_employees = self.get_top_employees(user_id, None)?;

        Ok(PeriodStats {
            total_time_saved_hours,
            total_cost_saved_usd,
            total_automations_run,
            avg_time_saved_per_run,
            success_rate: 1.0,
            top_employees,
        })
    }

    /// Get top performing employees
    fn get_top_employees(
        &self,
        user_id: &str,
        cutoff_timestamp: Option<i64>,
    ) -> SqliteResult<Vec<EmployeePerformance>> {
        let conn = self.db.lock().map_err(|e| {
            rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(
                format!("Database lock poisoned: {}", e),
            )))
        })?;

        let query = if let Some(_cutoff) = cutoff_timestamp {
            "SELECT
                employee_id,
                SUM(time_saved_minutes) as total_time_minutes,
                SUM(cost_saved_usd) as total_cost,
                COUNT(*) as count
            FROM realtime_metrics
            WHERE user_id = ?1 AND employee_id IS NOT NULL AND timestamp >= ?2
            GROUP BY employee_id
            ORDER BY total_cost DESC
            LIMIT 10"
        } else {
            "SELECT
                employee_id,
                SUM(time_saved_minutes) as total_time_minutes,
                SUM(cost_saved_usd) as total_cost,
                COUNT(*) as count
            FROM realtime_metrics
            WHERE user_id = ?1 AND employee_id IS NOT NULL
            GROUP BY employee_id
            ORDER BY total_cost DESC
            LIMIT 10"
        };

        let mut stmt = conn.prepare(query)?;

        let employees = if let Some(cutoff) = cutoff_timestamp {
            stmt.query_map([user_id, &cutoff.to_string()], |row| {
                let employee_id: String = row.get(0)?;
                let total_time_minutes: i64 = row.get(1)?;
                let total_cost: f64 = row.get(2)?;
                let count: i64 = row.get(3)?;

                Ok(EmployeePerformance {
                    employee_id: employee_id.clone(),
                    employee_name: format!("Employee {}", employee_id), // TODO: Get actual name
                    total_time_saved_hours: total_time_minutes as f64 / 60.0,
                    total_cost_saved_usd: total_cost,
                    automations_run: count as u64,
                    success_rate: 1.0,
                })
            })?
            .collect::<SqliteResult<Vec<_>>>()?
        } else {
            stmt.query_map([user_id], |row| {
                let employee_id: String = row.get(0)?;
                let total_time_minutes: i64 = row.get(1)?;
                let total_cost: f64 = row.get(2)?;
                let count: i64 = row.get(3)?;

                Ok(EmployeePerformance {
                    employee_id: employee_id.clone(),
                    employee_name: format!("Employee {}", employee_id), // TODO: Get actual name
                    total_time_saved_hours: total_time_minutes as f64 / 60.0,
                    total_cost_saved_usd: total_cost,
                    automations_run: count as u64,
                    success_rate: 1.0,
                })
            })?
            .collect::<SqliteResult<Vec<_>>>()?
        };

        Ok(employees)
    }

    /// Get metrics history for charting
    pub async fn get_metrics_history(
        &self,
        user_id: &str,
        days: i64,
    ) -> Result<Vec<MetricsSnapshot>, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock poisoned: {}", e))?;
        let cutoff = Utc::now().timestamp() - (days * 24 * 60 * 60);

        let mut stmt = conn
            .prepare(
                "SELECT id, user_id, automation_id, employee_id, time_saved_minutes,
                        cost_saved_usd, tasks_completed, errors_prevented, quality_score, timestamp
                 FROM realtime_metrics
                 WHERE user_id = ?1 AND timestamp >= ?2
                 ORDER BY timestamp DESC",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let metrics = stmt
            .query_map(rusqlite::params![user_id, cutoff], |row| {
                Ok(MetricsSnapshot {
                    id: row.get(0)?,
                    user_id: row.get(1)?,
                    automation_id: row.get(2)?,
                    employee_id: row.get(3)?,
                    time_saved_minutes: row.get::<_, i64>(4)? as u64,
                    cost_saved_usd: row.get(5)?,
                    tasks_completed: row.get::<_, i64>(6)? as u64,
                    errors_prevented: row.get::<_, i64>(7)? as u64,
                    quality_score: row.get(8)?,
                    timestamp: row.get(9)?,
                })
            })
            .map_err(|e| format!("Failed to query metrics: {}", e))?
            .collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| format!("Failed to collect metrics: {}", e))?;

        Ok(metrics)
    }
}
