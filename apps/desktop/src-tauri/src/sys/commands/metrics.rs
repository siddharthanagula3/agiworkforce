use serde::{Deserialize, Serialize};
use tauri::State;

use crate::data::metrics::{
    AutomationRun, BenchmarkComparison, Comparison, MetricsComparison, MetricsSnapshot,
    PeriodComparison, RealtimeMetricsCollector, RealtimeStats,
};

pub struct MetricsCollectorState(pub std::sync::Arc<RealtimeMetricsCollector>);

pub struct MetricsComparisonState(pub std::sync::Arc<MetricsComparison>);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordAutomationRequest {
    pub user_id: String,
    pub employee_id: Option<String>,
    pub automation_name: String,
    pub estimated_manual_time_ms: u64,
    pub actual_execution_time_ms: u64,
    pub tasks_completed: Option<u64>,
    pub errors_prevented: Option<u64>,
    pub quality_score: Option<f64>,
}

#[tauri::command]
pub async fn get_realtime_stats(
    user_id: String,
    collector: State<'_, MetricsCollectorState>,
) -> Result<RealtimeStats, String> {
    collector.0.get_realtime_stats(&user_id)
}

#[tauri::command]
pub async fn record_automation_metrics(
    request: RecordAutomationRequest,
    collector: State<'_, MetricsCollectorState>,
) -> Result<MetricsSnapshot, String> {
    let mut run = AutomationRun::new(
        request.user_id,
        request.employee_id,
        request.automation_name,
        request.estimated_manual_time_ms,
        request.actual_execution_time_ms,
    );

    if let Some(tasks) = request.tasks_completed {
        run.tasks_completed = tasks;
    }
    if let Some(errors) = request.errors_prevented {
        run.errors_prevented = errors;
    }
    if let Some(quality) = request.quality_score {
        run.quality_score = quality;
    }

    collector.0.record_automation_run(run).await
}

#[tauri::command]
pub async fn get_metrics_history(
    user_id: String,
    days: i64,
    collector: State<'_, MetricsCollectorState>,
) -> Result<Vec<MetricsSnapshot>, String> {
    collector.0.get_metrics_history(&user_id, days).await
}

#[tauri::command]
pub async fn compare_to_manual(
    automation_type: String,
    comparison: State<'_, MetricsComparisonState>,
) -> Result<Comparison, String> {
    comparison.0.compare_to_manual(&automation_type).await
}

#[tauri::command]
pub async fn compare_to_previous_period(
    user_id: String,
    days: i64,
    comparison: State<'_, MetricsComparisonState>,
) -> Result<PeriodComparison, String> {
    comparison
        .0
        .compare_to_previous_period(&user_id, days)
        .await
}

#[tauri::command]
pub async fn compare_to_industry_benchmark(
    user_id: String,
    role: String,
    comparison: State<'_, MetricsComparisonState>,
) -> Result<BenchmarkComparison, String> {
    comparison
        .0
        .compare_to_industry_benchmark(&user_id, &role)
        .await
}

#[tauri::command]
pub async fn get_milestones(
    user_id: String,
    collector: State<'_, MetricsCollectorState>,
) -> Result<Vec<MilestoneData>, String> {
    let db_conn = collector.0.db_conn();
    let conn = db_conn
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, milestone_type, threshold_value, achieved_at, shared
             FROM user_milestones
             WHERE user_id = ?1
             ORDER BY achieved_at DESC",
        )
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let milestones = stmt
        .query_map([&user_id], |row| {
            Ok(MilestoneData {
                id: row.get(0)?,
                milestone_type: row.get(1)?,
                threshold_value: row.get(2)?,
                achieved_at: row.get(3)?,
                shared: row.get(4)?,
            })
        })
        .map_err(|e| format!("Failed to query milestones: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect milestones: {}", e))?;

    Ok(milestones)
}

#[tauri::command]
pub async fn share_milestone(
    milestone_id: String,
    collector: State<'_, MetricsCollectorState>,
) -> Result<(), String> {
    let db_conn = collector.0.db_conn();
    let conn = db_conn
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    conn.execute(
        "UPDATE user_milestones SET shared = 1 WHERE id = ?1",
        [&milestone_id],
    )
    .map_err(|e| format!("Failed to share milestone: {}", e))?;

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MilestoneData {
    pub id: String,
    pub milestone_type: String,
    pub threshold_value: f64,
    pub achieved_at: i64,
    pub shared: bool,
}
