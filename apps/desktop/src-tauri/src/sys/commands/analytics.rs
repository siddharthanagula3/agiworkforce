use crate::sys::telemetry::{
    AnalyticsMetricsCollector, AppMetrics, SystemMetrics, TelemetryCollector, TelemetryEvent,
};
use chrono;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

pub struct TelemetryState {
    pub collector: Arc<RwLock<TelemetryCollector>>,
    pub metrics_collector: Arc<RwLock<AnalyticsMetricsCollector>>,
}

impl TelemetryState {
    pub fn new(
        collector: TelemetryCollector,
        metrics_collector: AnalyticsMetricsCollector,
    ) -> Self {
        Self {
            collector: Arc::new(RwLock::new(collector)),
            metrics_collector: Arc::new(RwLock::new(metrics_collector)),
        }
    }
}

#[tauri::command]
pub async fn analytics_track_event(
    event: TelemetryEvent,
    state: State<'_, TelemetryState>,
) -> Result<(), String> {
    let collector = state.collector.read().await;

    if !collector.is_enabled() {
        return Ok(());
    }

    drop(collector);
    let collector = state.collector.write().await;

    collector
        .track(event)
        .await
        .map_err(|e| format!("Failed to track event: {}", e))
}

#[tauri::command]
pub async fn analytics_flush_events(state: State<'_, TelemetryState>) -> Result<(), String> {
    let collector = state.collector.read().await;
    collector
        .flush()
        .await
        .map_err(|e| format!("Failed to flush events: {}", e))
}

#[tauri::command]
pub async fn analytics_get_session_id(state: State<'_, TelemetryState>) -> Result<String, String> {
    let collector = state.collector.read().await;
    Ok(collector.get_session_id())
}

#[tauri::command]
pub async fn analytics_set_user_property(
    key: String,
    value: Value,
    state: State<'_, TelemetryState>,
) -> Result<(), String> {
    let collector = state.collector.read().await;
    collector
        .set_user_property(key, value)
        .await
        .map_err(|e| format!("Failed to set user property: {}", e))
}

#[tauri::command]
pub async fn metrics_get_system(state: State<'_, TelemetryState>) -> Result<SystemMetrics, String> {
    let mut collector = state.metrics_collector.write().await;
    Ok(collector.collect_system_metrics())
}

#[tauri::command]
pub async fn metrics_get_app(state: State<'_, TelemetryState>) -> Result<AppMetrics, String> {
    let collector = state.metrics_collector.read().await;
    Ok(collector.collect_app_metrics())
}

use crate::sys::commands::settings::SettingsState;

#[tauri::command]
pub async fn feature_flag_get(
    flag_name: String,
    settings_state: State<'_, SettingsState>,
) -> Result<bool, String> {
    get_feature_flag(&flag_name, &settings_state).await
}

pub async fn get_feature_flag(
    flag_name: &str,
    settings_state: &SettingsState,
) -> Result<bool, String> {
    let settings = settings_state.settings.lock().await;
    Ok(settings
        .feature_flags
        .get(flag_name)
        .copied()
        .unwrap_or(false))
}

#[tauri::command]
pub async fn feature_flag_get_all(
    settings_state: State<'_, SettingsState>,
) -> Result<HashMap<String, bool>, String> {
    get_all_feature_flags(&settings_state).await
}

pub async fn get_all_feature_flags(
    settings_state: &SettingsState,
) -> Result<HashMap<String, bool>, String> {
    let settings = settings_state.settings.lock().await;
    Ok(settings.feature_flags.clone())
}

#[tauri::command]
pub async fn analytics_delete_all_data(state: State<'_, TelemetryState>) -> Result<(), String> {
    let collector = state.collector.read().await;
    collector
        .delete_all_data()
        .await
        .map_err(|e| format!("Failed to delete analytics data: {}", e))
}

#[tauri::command]
pub async fn metrics_increment_automations(state: State<'_, TelemetryState>) -> Result<(), String> {
    let mut collector = state.metrics_collector.write().await;
    collector.increment_automations_count();
    Ok(())
}

#[tauri::command]
pub async fn metrics_increment_goals(state: State<'_, TelemetryState>) -> Result<(), String> {
    let mut collector = state.metrics_collector.write().await;
    collector.increment_goals_count();
    Ok(())
}

#[tauri::command]
pub async fn metrics_set_mcp_servers(
    count: u64,
    state: State<'_, TelemetryState>,
) -> Result<(), String> {
    let mut collector = state.metrics_collector.write().await;
    collector.set_mcp_servers_count(count);
    Ok(())
}

#[tauri::command]
pub async fn metrics_set_cache_hit_rate(
    rate: f64,
    state: State<'_, TelemetryState>,
) -> Result<(), String> {
    let mut collector = state.metrics_collector.write().await;
    collector.set_cache_hit_rate(rate);
    Ok(())
}

#[tauri::command]
pub async fn analytics_get_usage_stats(
    state: State<'_, AppDatabase>,
) -> Result<serde_json::Value, String> {
    let db = create_analytics_db_connection(&state)?;
    let conn = db.lock().await;

    let total_events: i64 = conn
        .query_row("SELECT COUNT(*) FROM automation_history", [], |row| {
            row.get(0)
        })
        .unwrap_or(0);

    let today_start = chrono::Utc::now()
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .map(|t| t.and_utc().timestamp())
        .unwrap_or(0);
    let events_today: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM automation_history WHERE created_at >= ?1",
            [today_start],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let avg_session_duration_ms: f64 = conn.query_row(
        "SELECT AVG(last_activity - started_at) * 1000 FROM user_sessions WHERE last_activity > started_at",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);

    let active_days: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT date(started_at, 'unixepoch')) FROM user_sessions",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let mau: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT date(started_at, 'unixepoch')) FROM user_sessions WHERE started_at >= ?1",
            [chrono::Utc::now().timestamp() - 30 * 24 * 3600],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let new_users_today: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM user_sessions WHERE started_at >= ?1 AND id NOT IN (SELECT id FROM user_sessions WHERE started_at < ?1)",
            [today_start],
            |row| row.get(0),
        ).unwrap_or(0);

    Ok(serde_json::json!({
        "dau": if events_today > 0 { 1 } else { 0 },
        "mau": mau,
        "total_users": 1,
        "new_users_today": new_users_today,
        "new_users_this_week": 0,
        "new_users_this_month": 0,
        "avg_session_duration_ms": avg_session_duration_ms,
        "total_events": total_events,
        "events_today": events_today,
        "retention_rate": if active_days > 0 { 100.0 } else { 0.0 },
    }))
}

#[tauri::command]
pub async fn analytics_get_feature_usage(
    state: State<'_, AppDatabase>,
) -> Result<Vec<serde_json::Value>, String> {
    let db = create_analytics_db_connection(&state)?;
    let conn = db.lock().await;

    let mut stmt = conn
        .prepare(
            "SELECT task_type, COUNT(*) as usage_count, MAX(created_at) as last_used
         FROM automation_history
         GROUP BY task_type
         ORDER BY usage_count DESC",
        )
        .map_err(|e| e.to_string())?;

    let features = stmt
        .query_map([], |row| {
            let feature_name: String = row.get(0)?;
            let usage_count: i64 = row.get(1)?;
            let last_used: Option<String> = row.get(2)?;

            Ok(serde_json::json!({
                "feature_name": feature_name,
                "usage_count": usage_count,
                "unique_users": 1,
                "trend": "stable",
                "last_used": last_used
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(features)
}

use crate::data::analytics::{
    MetricsAggregator, ProcessMetrics, ROICalculator, ROIReport, ReportGenerator,
    ScheduledReportGenerator, ToolMetrics, TrendPoint, UserMetrics,
};
use crate::sys::commands::AppDatabase;
use rusqlite::Connection;

fn create_analytics_db_connection(
    app_db: &AppDatabase,
) -> Result<Arc<tokio::sync::Mutex<Connection>>, String> {
    let _conn = app_db
        .conn
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    let db_path = std::env::var("AGI_DB_PATH").unwrap_or_else(|_| {
        std::path::PathBuf::from(".")
            .join("agiworkforce.db")
            .to_string_lossy()
            .to_string()
    });

    let new_conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open analytics connection: {}", e))?;

    Ok(Arc::new(tokio::sync::Mutex::new(new_conn)))
}

#[tauri::command]
pub async fn analytics_calculate_roi(
    start_date: i64,
    end_date: i64,
    state: State<'_, AppDatabase>,
) -> Result<ROIReport, String> {
    let db = create_analytics_db_connection(&state)?;
    let calculator = ROICalculator::new(db);

    calculator
        .calculate_roi(start_date, end_date)
        .await
        .map_err(|e| format!("Failed to calculate ROI: {}", e))
}

#[tauri::command]
pub async fn analytics_get_process_metrics(
    start_date: i64,
    end_date: i64,
    state: State<'_, AppDatabase>,
) -> Result<Vec<ProcessMetrics>, String> {
    let db = create_analytics_db_connection(&state)?;
    let aggregator = MetricsAggregator::new(db);

    aggregator
        .aggregate_by_process_type(start_date, end_date)
        .await
        .map_err(|e| format!("Failed to aggregate process metrics: {}", e))
}

#[tauri::command]
pub async fn analytics_get_user_metrics(
    start_date: i64,
    end_date: i64,
    state: State<'_, AppDatabase>,
) -> Result<Vec<UserMetrics>, String> {
    let db = create_analytics_db_connection(&state)?;
    let aggregator = MetricsAggregator::new(db);

    aggregator
        .aggregate_by_user(start_date, end_date)
        .await
        .map_err(|e| format!("Failed to aggregate user metrics: {}", e))
}

#[tauri::command]
pub async fn analytics_get_tool_metrics(
    start_date: i64,
    end_date: i64,
    state: State<'_, AppDatabase>,
) -> Result<Vec<ToolMetrics>, String> {
    let db = create_analytics_db_connection(&state)?;
    let aggregator = MetricsAggregator::new(db);

    aggregator
        .aggregate_by_tool(start_date, end_date)
        .await
        .map_err(|e| format!("Failed to aggregate tool metrics: {}", e))
}

#[tauri::command]
pub async fn analytics_get_metric_trends(
    metric: String,
    days: usize,
    state: State<'_, AppDatabase>,
) -> Result<Vec<TrendPoint>, String> {
    let db = create_analytics_db_connection(&state)?;
    let aggregator = MetricsAggregator::new(db);

    aggregator
        .calculate_trends(&metric, days)
        .await
        .map_err(|e| format!("Failed to calculate trends: {}", e))
}

// AUDIT-ANALYTICS-087 fix: Aliases for specific trend commands
#[tauri::command]
pub async fn analytics_get_time_saved_trend(
    days: usize,
    state: State<'_, AppDatabase>,
) -> Result<Vec<TrendPoint>, String> {
    analytics_get_metric_trends("time_saved".to_string(), days, state).await
}

#[tauri::command]
pub async fn analytics_get_cost_saved_trend(
    days: usize,
    state: State<'_, AppDatabase>,
) -> Result<Vec<TrendPoint>, String> {
    analytics_get_metric_trends("cost_saved".to_string(), days, state).await
}

#[tauri::command]
pub async fn analytics_export_report(
    format: String,
    start_date: i64,
    end_date: i64,
    state: State<'_, AppDatabase>,
) -> Result<String, String> {
    let db = create_analytics_db_connection(&state)?;

    let calculator = ROICalculator::new(db.clone());
    let aggregator = MetricsAggregator::new(db.clone());
    let generator = ReportGenerator::new();

    let roi = calculator
        .calculate_roi(start_date, end_date)
        .await
        .map_err(|e| format!("Failed to calculate ROI: {}", e))?;

    match format.as_str() {
        "markdown" | "md" => {
            let process_metrics = aggregator
                .aggregate_by_process_type(start_date, end_date)
                .await
                .map_err(|e| format!("Failed to aggregate metrics: {}", e))?;
            Ok(generator.generate_executive_summary(&roi, &process_metrics))
        }
        "csv" => {
            let process_metrics = aggregator
                .aggregate_by_process_type(start_date, end_date)
                .await
                .map_err(|e| format!("Failed to aggregate metrics: {}", e))?;
            Ok(generator.generate_csv_export(&process_metrics))
        }
        "json" => {
            let process_metrics = aggregator
                .aggregate_by_process_type(start_date, end_date)
                .await
                .map_err(|e| format!("Failed to aggregate metrics: {}", e))?;
            let user_metrics = aggregator
                .aggregate_by_user(start_date, end_date)
                .await
                .map_err(|e| format!("Failed to aggregate metrics: {}", e))?;
            let tool_metrics = aggregator
                .aggregate_by_tool(start_date, end_date)
                .await
                .map_err(|e| format!("Failed to aggregate metrics: {}", e))?;

            generator
                .generate_json_export(&roi, &process_metrics, &user_metrics, &tool_metrics)
                .map_err(|e| format!("Failed to generate JSON: {}", e))
        }
        _ => Err(format!(
            "Unsupported format: {}. Use 'markdown', 'csv', or 'json'",
            format
        )),
    }
}

#[tauri::command]
pub async fn analytics_generate_weekly_report(
    user_id: String,
    state: State<'_, AppDatabase>,
) -> Result<String, String> {
    let db = create_analytics_db_connection(&state)?;
    let generator = ScheduledReportGenerator::new(db);

    generator.generate_weekly_report(&user_id).await
}

#[tauri::command]
pub async fn analytics_generate_monthly_report(
    user_id: String,
    state: State<'_, AppDatabase>,
) -> Result<String, String> {
    let db = create_analytics_db_connection(&state)?;
    let generator = ScheduledReportGenerator::new(db);

    generator.generate_monthly_report(&user_id).await
}

#[tauri::command]
pub async fn analytics_get_top_processes(
    start_date: i64,
    end_date: i64,
    limit: usize,
    state: State<'_, AppDatabase>,
) -> Result<Vec<ProcessMetrics>, String> {
    let db = create_analytics_db_connection(&state)?;
    let aggregator = MetricsAggregator::new(db);

    aggregator
        .get_top_processes(start_date, end_date, limit)
        .await
        .map_err(|e| format!("Failed to get top processes: {}", e))
}

#[tauri::command]
pub async fn analytics_save_snapshot(
    user_id: String,
    team_id: Option<String>,
    start_date: i64,
    end_date: i64,
    state: State<'_, AppDatabase>,
) -> Result<String, String> {
    let db = create_analytics_db_connection(&state)?;
    let calculator = ROICalculator::new(db);

    let roi = calculator
        .calculate_roi(start_date, end_date)
        .await
        .map_err(|e| format!("Failed to calculate ROI: {}", e))?;

    calculator
        .save_snapshot(&user_id, team_id.as_deref(), &roi)
        .await
        .map_err(|e| format!("Failed to save snapshot: {}", e))
}

#[tauri::command]
pub async fn track_workflow_view(
    workflow_id: String,
    user_id: String,
    state: State<'_, TelemetryState>,
) -> Result<(), String> {
    let collector = state.collector.read().await;

    if !collector.is_enabled() {
        return Ok(());
    }

    drop(collector);

    let mut properties = std::collections::HashMap::new();
    properties.insert("workflow_id".to_string(), serde_json::json!(workflow_id));
    properties.insert("user_id".to_string(), serde_json::json!(user_id));

    let event = TelemetryEvent {
        name: "workflow_view".to_string(),
        properties,
        timestamp: chrono::Utc::now().timestamp_millis() as u64,
        session_id: state.collector.read().await.get_session_id(),
        user_id: Some(user_id),
    };

    let collector = state.collector.write().await;
    collector
        .track(event)
        .await
        .map_err(|e| format!("Failed to track workflow view: {}", e))
}

#[tauri::command]
pub async fn acknowledge_milestone(
    milestone_id: String,
    user_id: String,
    state: State<'_, TelemetryState>,
) -> Result<(), String> {
    let collector = state.collector.read().await;

    if !collector.is_enabled() {
        return Ok(());
    }

    drop(collector);

    let mut properties = std::collections::HashMap::new();
    properties.insert("milestone_id".to_string(), serde_json::json!(milestone_id));
    properties.insert("user_id".to_string(), serde_json::json!(user_id));
    properties.insert(
        "acknowledged_at".to_string(),
        serde_json::json!(chrono::Utc::now().to_rfc3339()),
    );

    let event = TelemetryEvent {
        name: "milestone_acknowledged".to_string(),
        properties,
        timestamp: chrono::Utc::now().timestamp_millis() as u64,
        session_id: state.collector.read().await.get_session_id(),
        user_id: Some(user_id),
    };

    let collector = state.collector.write().await;
    collector
        .track(event)
        .await
        .map_err(|e| format!("Failed to acknowledge milestone: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sys::telemetry::CollectorConfig;

    fn create_test_state() -> TelemetryState {
        let config = CollectorConfig {
            enabled: true,
            batch_size: 10,
            flush_interval_secs: 30,
            app_data_dir: None,
        };
        let collector = TelemetryCollector::new(config);
        let metrics_collector = AnalyticsMetricsCollector::new();
        TelemetryState::new(collector, metrics_collector)
    }

    #[tokio::test]
    async fn test_analytics_track_event() {
        let state = create_test_state();
        let event = TelemetryEvent {
            name: "test_event".to_string(),
            properties: HashMap::new(),
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
            session_id: "test_session".to_string(),
            user_id: None,
        };

        let collector = state.collector.read().await;
        let result = collector.track(event).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_analytics_get_session_id() {
        let state = create_test_state();
        let session_id = state.collector.read().await.get_session_id();
        assert!(!session_id.is_empty());
    }

    #[tokio::test]
    async fn test_metrics_get_system() {
        let state = create_test_state();
        let metrics = state
            .metrics_collector
            .write()
            .await
            .collect_system_metrics();
        assert!(metrics.memory_total_mb > 0);
    }

    #[tokio::test]
    async fn test_metrics_get_app() {
        let state = create_test_state();
        let metrics = state.metrics_collector.read().await.collect_app_metrics();
        assert_eq!(metrics.automations_count, 0);
        assert_eq!(metrics.goals_count, 0);
    }

    #[tokio::test]
    async fn test_feature_flag_get() {
        let state = SettingsState::new();
        // Insert parallel_execution = true
        {
            let mut settings = state.settings.lock().await;
            settings
                .feature_flags
                .insert("parallel_execution".to_string(), true);
        }

        let result = get_feature_flag("parallel_execution", &state).await;
        assert!(result.is_ok());
        assert!(result.unwrap());

        let result = get_feature_flag("unknown_flag", &state).await;
        assert!(result.is_ok());
        assert!(!result.unwrap());
    }

    #[tokio::test]
    async fn test_feature_flag_get_all() {
        let state = SettingsState::new();
        {
            let mut settings = state.settings.lock().await;
            settings
                .feature_flags
                .insert("parallel_execution".to_string(), true);
        }

        let result = get_all_feature_flags(&state).await;
        assert!(result.is_ok());

        let flags = result.unwrap();
        assert!(!flags.is_empty());
        assert_eq!(flags.get("parallel_execution"), Some(&true));
    }
}
