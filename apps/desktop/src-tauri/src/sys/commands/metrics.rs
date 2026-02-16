use serde::{Deserialize, Serialize};
use tauri::State;

use crate::data::metrics::{
    AutomationRun, BenchmarkComparison, Comparison, EmployeePerformance, MetricsComparison,
    MetricsSnapshot, PeriodComparison, PeriodStats, RealtimeMetricsCollector, RealtimeStats,
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

// === ROI Dashboard Command Aliases ===
// These commands provide backward-compatible names for the ROI dashboard frontend.
// They wrap the existing metrics commands and map data to the expected types.

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DayStats {
    pub totalTimeSavedHours: f64,
    pub totalCostSavedUsd: f64,
    pub automationsRun: u64,
    pub avgQualityScore: f64,
    pub changeFromYesterday: f64,
    pub topEmployee: String,
    pub topEmployeeTimeSaved: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopEmployeeData {
    pub employeeId: String,
    pub employeeName: String,
    pub timeSavedHours: f64,
    pub costSavedUsd: f64,
    pub automationsRun: u64,
    pub successRate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyBreakdown {
    pub date: String,
    pub timeSavedHours: f64,
    pub costSavedUsd: f64,
    pub automationsRun: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeekStats {
    pub totalTimeSavedHours: f64,
    pub totalCostSavedUsd: f64,
    pub automationsRun: u64,
    pub avgQualityScore: f64,
    pub changeFromLastWeek: f64,
    pub topEmployees: Vec<TopEmployeeData>,
    pub dailyBreakdown: Vec<DailyBreakdown>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeeklyBreakdown {
    pub weekStart: String,
    pub weekEnd: String,
    pub timeSavedHours: f64,
    pub costSavedUsd: f64,
    pub automationsRun: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonthStats {
    pub totalTimeSavedHours: f64,
    pub totalCostSavedUsd: f64,
    pub automationsRun: u64,
    pub avgQualityScore: f64,
    pub changeFromLastMonth: f64,
    pub topEmployees: Vec<TopEmployeeData>,
    pub weeklyBreakdown: Vec<WeeklyBreakdown>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonthlyTrend {
    pub month: String,
    pub timeSavedHours: f64,
    pub costSavedUsd: f64,
    pub automationsRun: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AllTimeStats {
    pub totalTimeSavedHours: f64,
    pub totalCostSavedUsd: f64,
    pub automationsRun: u64,
    pub avgQualityScore: f64,
    pub milestonesAchieved: u64,
    pub topEmployees: Vec<TopEmployeeData>,
    pub monthlyTrend: Vec<MonthlyTrend>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComparisonData {
    pub manualTimeHours: f64,
    pub automatedTimeHours: f64,
    pub manualCostUsd: f64,
    pub automatedCostUsd: f64,
    pub manualQuality: f64,
    pub automatedQuality: f64,
    pub timeSavedHours: f64,
    pub costSavedUsd: f64,
    pub efficiencyGain: f64,
    pub qualityImprovement: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeriodComparisonData {
    pub currentPeriodLabel: String,
    pub previousPeriodLabel: String,
    pub currentTimeSavedHours: f64,
    pub previousTimeSavedHours: f64,
    pub currentCostSavedUsd: f64,
    pub previousCostSavedUsd: f64,
    pub currentAutomationsRun: u64,
    pub previousAutomationsRun: u64,
    pub percentageChange: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkComparisonData {
    pub yourTimeSavedHours: f64,
    pub industryAverageTimeSavedHours: f64,
    pub yourCostSavedUsd: f64,
    pub industryAverageCostSavedUsd: f64,
    pub yourAutomationsRun: u64,
    pub industryAverageAutomationsRun: u64,
    pub percentageBetter: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityItem {
    pub id: String,
    #[serde(rename = "type")]
    pub activityType: String,
    pub title: String,
    pub description: String,
    pub timestamp: i64,
    pub timeSavedMinutes: Option<f64>,
    pub costSavedUsd: Option<f64>,
    pub employeeName: Option<String>,
    pub automationName: Option<String>,
    pub status: Option<String>,
}

fn map_period_stats_to_day_stats(period: &PeriodStats) -> DayStats {
    let top_emp = period.top_employees.first();
    DayStats {
        totalTimeSavedHours: period.total_time_saved_hours,
        totalCostSavedUsd: period.total_cost_saved_usd,
        automationsRun: period.total_automations_run,
        avgQualityScore: period.avg_time_saved_per_run,
        changeFromYesterday: 0.0, // Default, would need previous period data
        topEmployee: top_emp
            .map(|e| e.employee_name.clone())
            .unwrap_or_default(),
        topEmployeeTimeSaved: top_emp
            .map(|e| e.total_time_saved_hours)
            .unwrap_or(0.0),
    }
}

fn map_employees(employees: &[EmployeePerformance]) -> Vec<TopEmployeeData> {
    employees
        .iter()
        .map(|e| TopEmployeeData {
            employeeId: e.employee_id.clone(),
            employeeName: e.employee_name.clone(),
            timeSavedHours: e.total_time_saved_hours,
            costSavedUsd: e.total_cost_saved_usd,
            automationsRun: e.automations_run,
            successRate: e.success_rate,
        })
        .collect()
}

#[tauri::command]
pub async fn get_today_stats(
    user_id: String,
    collector: State<'_, MetricsCollectorState>,
) -> Result<DayStats, String> {
    let stats = collector.0.get_realtime_stats(&user_id)?;
    Ok(map_period_stats_to_day_stats(&stats.today))
}

#[tauri::command]
pub async fn get_week_stats(
    user_id: String,
    collector: State<'_, MetricsCollectorState>,
) -> Result<WeekStats, String> {
    let stats = collector.0.get_realtime_stats(&user_id)?;
    Ok(WeekStats {
        totalTimeSavedHours: stats.this_week.total_time_saved_hours,
        totalCostSavedUsd: stats.this_week.total_cost_saved_usd,
        automationsRun: stats.this_week.total_automations_run,
        avgQualityScore: stats.this_week.avg_time_saved_per_run,
        changeFromLastWeek: 0.0,
        topEmployees: map_employees(&stats.this_week.top_employees),
        dailyBreakdown: vec![], // Would need daily aggregation
    })
}

#[tauri::command]
pub async fn get_month_stats(
    user_id: String,
    collector: State<'_, MetricsCollectorState>,
) -> Result<MonthStats, String> {
    let stats = collector.0.get_realtime_stats(&user_id)?;
    Ok(MonthStats {
        totalTimeSavedHours: stats.this_month.total_time_saved_hours,
        totalCostSavedUsd: stats.this_month.total_cost_saved_usd,
        automationsRun: stats.this_month.total_automations_run,
        avgQualityScore: stats.this_month.avg_time_saved_per_run,
        changeFromLastMonth: 0.0,
        topEmployees: map_employees(&stats.this_month.top_employees),
        weeklyBreakdown: vec![], // Would need weekly aggregation
    })
}

#[tauri::command]
pub async fn get_all_time_stats(
    user_id: String,
    collector: State<'_, MetricsCollectorState>,
) -> Result<AllTimeStats, String> {
    let stats = collector.0.get_realtime_stats(&user_id)?;
    Ok(AllTimeStats {
        totalTimeSavedHours: stats.all_time.total_time_saved_hours,
        totalCostSavedUsd: stats.all_time.total_cost_saved_usd,
        automationsRun: stats.all_time.total_automations_run,
        avgQualityScore: stats.all_time.avg_time_saved_per_run,
        milestonesAchieved: 0, // Would need milestone query
        topEmployees: map_employees(&stats.all_time.top_employees),
        monthlyTrend: vec![], // Would need monthly aggregation
    })
}

#[tauri::command]
pub async fn get_manual_vs_automated_comparison(
    automation_type: String,
    comparison: State<'_, MetricsComparisonState>,
) -> Result<ComparisonData, String> {
    let comp = comparison.0.compare_to_manual(&automation_type).await?;
    // Convert minutes to hours and map fields to frontend types
    Ok(ComparisonData {
        manualTimeHours: comp.manual_time_minutes as f64 / 60.0,
        automatedTimeHours: comp.automated_time_minutes as f64 / 60.0,
        manualCostUsd: comp.manual_cost_usd,
        automatedCostUsd: comp.automated_cost_usd,
        // Use error rates as quality (lower is better, so invert)
        manualQuality: (1.0 - comp.manual_error_rate) * 100.0,
        automatedQuality: (1.0 - comp.automated_error_rate) * 100.0,
        timeSavedHours: comp.time_saved_minutes as f64 / 60.0,
        costSavedUsd: comp.cost_saved_usd,
        efficiencyGain: ((comp.manual_time_minutes as f64 - comp.automated_time_minutes as f64)
            / comp.manual_time_minutes as f64)
            * 100.0,
        qualityImprovement: comp.quality_improvement_percent,
    })
}

#[tauri::command]
pub async fn get_period_comparison(
    user_id: String,
    period: String,
    comparison: State<'_, MetricsComparisonState>,
) -> Result<PeriodComparisonData, String> {
    let days = match period.as_str() {
        "week" => 7,
        "month" => 30,
        "quarter" => 90,
        "year" => 365,
        _ => 30,
    };
    let comp = comparison
        .0
        .compare_to_previous_period(&user_id, days)
        .await?;
    Ok(PeriodComparisonData {
        currentPeriodLabel: "Current".to_string(),
        previousPeriodLabel: "Previous".to_string(),
        currentTimeSavedHours: comp.current.total_time_saved_hours,
        previousTimeSavedHours: comp.previous.total_time_saved_hours,
        currentCostSavedUsd: comp.current.total_cost_saved_usd,
        previousCostSavedUsd: comp.previous.total_cost_saved_usd,
        currentAutomationsRun: comp.current.total_automations_run,
        previousAutomationsRun: comp.previous.total_automations_run,
        percentageChange: comp.time_saved_change_percent,
    })
}

#[tauri::command]
pub async fn get_benchmark_comparison(
    user_id: String,
    role: String,
    comparison: State<'_, MetricsComparisonState>,
) -> Result<BenchmarkComparisonData, String> {
    let comp = comparison
        .0
        .compare_to_industry_benchmark(&user_id, &role)
        .await?;
    Ok(BenchmarkComparisonData {
        yourTimeSavedHours: comp.user_time_saved,
        industryAverageTimeSavedHours: comp.industry_avg_time_saved,
        yourCostSavedUsd: comp.user_cost_saved,
        industryAverageCostSavedUsd: comp.industry_avg_cost_saved,
        yourAutomationsRun: 0, // Not available in BenchmarkComparison
        industryAverageAutomationsRun: 0, // Not available in BenchmarkComparison
        percentageBetter: if comp.above_average {
            comp.percentile as f64
        } else {
            0.0
        },
    })
}

#[tauri::command]
pub async fn get_recent_activity(
    _user_id: String,
    _limit: u32,
) -> Result<Vec<ActivityItem>, String> {
    // Return empty for now - would need activity tracking system
    Ok(vec![])
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOptions {
    pub dateRange: String,
    pub format: String,
    pub includeCharts: bool,
    pub includeDetailedLog: bool,
    pub includeComparison: bool,
    pub includeEmployeeBreakdown: bool,
    pub startDate: Option<String>,
    pub endDate: Option<String>,
}

#[tauri::command]
pub async fn export_roi_report(
    options: ExportOptions,
    user_id: String,
    collector: State<'_, MetricsCollectorState>,
) -> Result<String, String> {
    // Get the stats to include in the report
    let stats = collector.0.get_realtime_stats(&user_id)?;

    // Generate a simple report based on format
    let content = match options.format.as_str() {
        "csv" => {
            let mut csv = String::from("metric,value\n");
            csv.push_str(&format!(
                "Total Time Saved (hours),{}\n",
                stats.all_time.total_time_saved_hours
            ));
            csv.push_str(&format!(
                "Total Cost Saved (USD),{}\n",
                stats.all_time.total_cost_saved_usd
            ));
            csv.push_str(&format!(
                "Total Automations Run,{}\n",
                stats.all_time.total_automations_run
            ));
            csv
        }
        "json" => {
            let report = serde_json::json!({
                "period": options.dateRange,
                "stats": {
                    "today": stats.today,
                    "thisWeek": stats.this_week,
                    "thisMonth": stats.this_month,
                    "allTime": stats.all_time,
                },
                "generatedAt": chrono::Utc::now().to_rfc3339(),
            });
            serde_json::to_string_pretty(&report).map_err(|e| e.to_string())?
        }
        _ => {
            // Default to text/markdown format
            let mut md = String::from("# ROI Report\n\n");
            md.push_str(&format!(
                "## Total Time Saved: {:.2} hours\n",
                stats.all_time.total_time_saved_hours
            ));
            md.push_str(&format!(
                "## Total Cost Saved: ${:.2}\n",
                stats.all_time.total_cost_saved_usd
            ));
            md.push_str(&format!(
                "## Total Automations: {}\n",
                stats.all_time.total_automations_run
            ));
            md
        }
    };

    // Write to a temporary file
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let filename = format!("roi_report_{}.{}", timestamp, options.format);
    let temp_dir = std::env::temp_dir();
    let file_path = temp_dir.join(&filename);

    std::fs::write(&file_path, content).map_err(|e| format!("Failed to write report: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}
