use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::data::metrics::{
    AutomationRun, BenchmarkComparison, Comparison, EmployeePerformance, MetricsComparison,
    MetricsSnapshot, PeriodComparison, RealtimeMetricsCollector, RealtimeStats,
};

pub struct MetricsCollectorState(pub std::sync::Arc<RealtimeMetricsCollector>);

pub struct MetricsComparisonState(pub std::sync::Arc<MetricsComparison>);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordAutomationRequest {
    pub user_id: String, // TODO: Replace caller-supplied user_id with SessionState lookup
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
    user_id: String, // TODO: Replace caller-supplied user_id with SessionState lookup
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
    user_id: String, // TODO: Replace caller-supplied user_id with SessionState lookup
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
    user_id: String, // TODO: Replace caller-supplied user_id with SessionState lookup
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
    user_id: String, // TODO: Replace caller-supplied user_id with SessionState lookup
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
    user_id: String, // TODO: Replace caller-supplied user_id with SessionState lookup
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
    user_id: String, // TODO: Replace caller-supplied user_id with SessionState lookup
    collector: State<'_, MetricsCollectorState>,
) -> Result<(), String> {
    let db_conn = collector.0.db_conn();
    let conn = db_conn
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    // Verify milestone belongs to the requesting user before updating (BOLA prevention)
    let owner_check: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM user_milestones WHERE id = ?1 AND user_id = ?2)",
            rusqlite::params![&milestone_id, &user_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to verify milestone ownership: {}", e))?;

    if !owner_check {
        return Err("Milestone not found or not owned by current user".to_string());
    }

    conn.execute(
        "UPDATE user_milestones SET shared = 1 WHERE id = ?1 AND user_id = ?2",
        rusqlite::params![&milestone_id, &user_id],
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
    #[serde(rename = "totalTimeSavedHours")]
    pub total_time_saved_hours: f64,
    #[serde(rename = "totalCostSavedUsd")]
    pub total_cost_saved_usd: f64,
    #[serde(rename = "automationsRun")]
    pub automations_run: u64,
    #[serde(rename = "avgQualityScore")]
    pub avg_quality_score: f64,
    #[serde(rename = "changeFromYesterday")]
    pub change_from_yesterday: f64,
    #[serde(rename = "topEmployee")]
    pub top_employee: String,
    #[serde(rename = "topEmployeeTimeSaved")]
    pub top_employee_time_saved: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopEmployeeData {
    #[serde(rename = "employeeId")]
    pub employee_id: String,
    #[serde(rename = "employeeName")]
    pub employee_name: String,
    #[serde(rename = "timeSavedHours")]
    pub time_saved_hours: f64,
    #[serde(rename = "costSavedUsd")]
    pub cost_saved_usd: f64,
    #[serde(rename = "automationsRun")]
    pub automations_run: u64,
    #[serde(rename = "successRate")]
    pub success_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyBreakdown {
    pub date: String,
    #[serde(rename = "timeSavedHours")]
    pub time_saved_hours: f64,
    #[serde(rename = "costSavedUsd")]
    pub cost_saved_usd: f64,
    #[serde(rename = "automationsRun")]
    pub automations_run: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeekStats {
    #[serde(rename = "totalTimeSavedHours")]
    pub total_time_saved_hours: f64,
    #[serde(rename = "totalCostSavedUsd")]
    pub total_cost_saved_usd: f64,
    #[serde(rename = "automationsRun")]
    pub automations_run: u64,
    #[serde(rename = "avgQualityScore")]
    pub avg_quality_score: f64,
    #[serde(rename = "changeFromLastWeek")]
    pub change_from_last_week: f64,
    #[serde(rename = "topEmployees")]
    pub top_employees: Vec<TopEmployeeData>,
    #[serde(rename = "dailyBreakdown")]
    pub daily_breakdown: Vec<DailyBreakdown>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeeklyBreakdown {
    #[serde(rename = "weekStart")]
    pub week_start: String,
    #[serde(rename = "weekEnd")]
    pub week_end: String,
    #[serde(rename = "timeSavedHours")]
    pub time_saved_hours: f64,
    #[serde(rename = "costSavedUsd")]
    pub cost_saved_usd: f64,
    #[serde(rename = "automationsRun")]
    pub automations_run: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonthStats {
    #[serde(rename = "totalTimeSavedHours")]
    pub total_time_saved_hours: f64,
    #[serde(rename = "totalCostSavedUsd")]
    pub total_cost_saved_usd: f64,
    #[serde(rename = "automationsRun")]
    pub automations_run: u64,
    #[serde(rename = "avgQualityScore")]
    pub avg_quality_score: f64,
    #[serde(rename = "changeFromLastMonth")]
    pub change_from_last_month: f64,
    #[serde(rename = "topEmployees")]
    pub top_employees: Vec<TopEmployeeData>,
    #[serde(rename = "weeklyBreakdown")]
    pub weekly_breakdown: Vec<WeeklyBreakdown>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonthlyTrend {
    pub month: String,
    #[serde(rename = "timeSavedHours")]
    pub time_saved_hours: f64,
    #[serde(rename = "costSavedUsd")]
    pub cost_saved_usd: f64,
    #[serde(rename = "automationsRun")]
    pub automations_run: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AllTimeStats {
    #[serde(rename = "totalTimeSavedHours")]
    pub total_time_saved_hours: f64,
    #[serde(rename = "totalCostSavedUsd")]
    pub total_cost_saved_usd: f64,
    #[serde(rename = "automationsRun")]
    pub automations_run: u64,
    #[serde(rename = "avgQualityScore")]
    pub avg_quality_score: f64,
    #[serde(rename = "milestonesAchieved")]
    pub milestones_achieved: u64,
    #[serde(rename = "topEmployees")]
    pub top_employees: Vec<TopEmployeeData>,
    #[serde(rename = "monthlyTrend")]
    pub monthly_trend: Vec<MonthlyTrend>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComparisonData {
    #[serde(rename = "manualTimeHours")]
    pub manual_time_hours: f64,
    #[serde(rename = "automatedTimeHours")]
    pub automated_time_hours: f64,
    #[serde(rename = "manualCostUsd")]
    pub manual_cost_usd: f64,
    #[serde(rename = "automatedCostUsd")]
    pub automated_cost_usd: f64,
    #[serde(rename = "manualQuality")]
    pub manual_quality: f64,
    #[serde(rename = "automatedQuality")]
    pub automated_quality: f64,
    #[serde(rename = "timeSavedHours")]
    pub time_saved_hours: f64,
    #[serde(rename = "costSavedUsd")]
    pub cost_saved_usd: f64,
    #[serde(rename = "efficiencyGain")]
    pub efficiency_gain: f64,
    #[serde(rename = "qualityImprovement")]
    pub quality_improvement: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeriodComparisonData {
    #[serde(rename = "currentPeriodLabel")]
    pub current_period_label: String,
    #[serde(rename = "previousPeriodLabel")]
    pub previous_period_label: String,
    #[serde(rename = "currentTimeSavedHours")]
    pub current_time_saved_hours: f64,
    #[serde(rename = "previousTimeSavedHours")]
    pub previous_time_saved_hours: f64,
    #[serde(rename = "currentCostSavedUsd")]
    pub current_cost_saved_usd: f64,
    #[serde(rename = "previousCostSavedUsd")]
    pub previous_cost_saved_usd: f64,
    #[serde(rename = "currentAutomationsRun")]
    pub current_automations_run: u64,
    #[serde(rename = "previousAutomationsRun")]
    pub previous_automations_run: u64,
    #[serde(rename = "percentageChange")]
    pub percentage_change: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkComparisonData {
    #[serde(rename = "yourTimeSavedHours")]
    pub your_time_saved_hours: f64,
    #[serde(rename = "industryAverageTimeSavedHours")]
    pub industry_average_time_saved_hours: f64,
    #[serde(rename = "yourCostSavedUsd")]
    pub your_cost_saved_usd: f64,
    #[serde(rename = "industryAverageCostSavedUsd")]
    pub industry_average_cost_saved_usd: f64,
    #[serde(rename = "yourAutomationsRun")]
    pub your_automations_run: u64,
    #[serde(rename = "industryAverageAutomationsRun")]
    pub industry_average_automations_run: u64,
    #[serde(rename = "percentageBetter")]
    pub percentage_better: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityItem {
    pub id: String,
    #[serde(rename = "type")]
    pub activity_type: String,
    pub title: String,
    pub description: String,
    pub timestamp: i64,
    #[serde(rename = "timeSavedMinutes")]
    pub time_saved_minutes: Option<f64>,
    #[serde(rename = "costSavedUsd")]
    pub cost_saved_usd: Option<f64>,
    #[serde(rename = "employeeName")]
    pub employee_name: Option<String>,
    #[serde(rename = "automationName")]
    pub automation_name: Option<String>,
    pub status: Option<String>,
}

fn map_employees(employees: &[EmployeePerformance]) -> Vec<TopEmployeeData> {
    employees
        .iter()
        .map(|e| TopEmployeeData {
            employee_id: e.employee_id.clone(),
            employee_name: e.employee_name.clone(),
            time_saved_hours: e.total_time_saved_hours,
            cost_saved_usd: e.total_cost_saved_usd,
            automations_run: e.automations_run,
            success_rate: e.success_rate,
        })
        .collect()
}

#[tauri::command]
pub async fn get_today_stats(
    user_id: String, // TODO: Replace caller-supplied user_id with SessionState lookup
    collector: State<'_, MetricsCollectorState>,
) -> Result<DayStats, String> {
    let stats = collector.0.get_realtime_stats(&user_id)?;

    // Calculate change from yesterday using daily breakdown
    let now = Utc::now().timestamp();
    let two_days_ago = now - (2 * 24 * 60 * 60);
    let one_day_ago = now - (24 * 60 * 60);

    let yesterday_rows = collector
        .0
        .get_daily_breakdown(&user_id, two_days_ago, one_day_ago)
        .unwrap_or_default();
    let yesterday_minutes: f64 = yesterday_rows
        .iter()
        .map(|r| r.time_saved_minutes as f64)
        .sum();
    let today_minutes = stats.today.total_time_saved_hours * 60.0;

    let change_from_yesterday = if yesterday_minutes > 0.0 {
        ((today_minutes - yesterday_minutes) / yesterday_minutes) * 100.0
    } else if today_minutes > 0.0 {
        100.0
    } else {
        0.0
    };

    let top_emp = stats.today.top_employees.first();
    Ok(DayStats {
        total_time_saved_hours: stats.today.total_time_saved_hours,
        total_cost_saved_usd: stats.today.total_cost_saved_usd,
        automations_run: stats.today.total_automations_run,
        avg_quality_score: stats.today.avg_time_saved_per_run,
        change_from_yesterday,
        top_employee: if top_emp.is_some() {
            "redacted".to_string()
        } else {
            String::new()
        },
        top_employee_time_saved: top_emp.map(|e| e.total_time_saved_hours).unwrap_or(0.0),
    })
}

#[tauri::command]
pub async fn get_week_stats(
    user_id: String, // TODO: Replace caller-supplied user_id with SessionState lookup
    collector: State<'_, MetricsCollectorState>,
) -> Result<WeekStats, String> {
    let stats = collector.0.get_realtime_stats(&user_id)?;

    let now = Utc::now().timestamp();
    let seven_days_ago = now - (7 * 24 * 60 * 60);
    let fourteen_days_ago = now - (14 * 24 * 60 * 60);

    // Daily breakdown for the last 7 days
    let daily_rows = collector
        .0
        .get_daily_breakdown(&user_id, seven_days_ago, now)
        .map_err(|e| format!("Failed to get daily breakdown: {}", e))?;

    let daily_breakdown: Vec<DailyBreakdown> = daily_rows
        .iter()
        .map(|r| DailyBreakdown {
            date: r.date.clone(),
            time_saved_hours: r.time_saved_minutes as f64 / 60.0,
            cost_saved_usd: r.cost_saved_usd,
            automations_run: r.automations_run,
        })
        .collect();

    // Calculate change from last week by comparing the previous 7-day period
    let prev_week = collector
        .0
        .get_daily_breakdown(&user_id, fourteen_days_ago, seven_days_ago)
        .map_err(|e| format!("Failed to get previous week breakdown: {}", e))?;
    let prev_time: f64 = prev_week.iter().map(|r| r.time_saved_minutes as f64).sum();
    let curr_time: f64 = daily_rows.iter().map(|r| r.time_saved_minutes as f64).sum();
    let change_from_last_week = if prev_time > 0.0 {
        ((curr_time - prev_time) / prev_time) * 100.0
    } else if curr_time > 0.0 {
        100.0
    } else {
        0.0
    };

    Ok(WeekStats {
        total_time_saved_hours: stats.this_week.total_time_saved_hours,
        total_cost_saved_usd: stats.this_week.total_cost_saved_usd,
        automations_run: stats.this_week.total_automations_run,
        avg_quality_score: stats.this_week.avg_time_saved_per_run,
        change_from_last_week,
        top_employees: map_employees(&stats.this_week.top_employees),
        daily_breakdown,
    })
}

#[tauri::command]
pub async fn get_month_stats(
    user_id: String, // TODO: Replace caller-supplied user_id with SessionState lookup
    collector: State<'_, MetricsCollectorState>,
) -> Result<MonthStats, String> {
    let stats = collector.0.get_realtime_stats(&user_id)?;

    let now = Utc::now().timestamp();
    let thirty_days_ago = now - (30 * 24 * 60 * 60);
    let sixty_days_ago = now - (60 * 24 * 60 * 60);

    // Weekly breakdown for the last 30 days
    let weekly_rows = collector
        .0
        .get_weekly_breakdown(&user_id, thirty_days_ago, now)
        .map_err(|e| format!("Failed to get weekly breakdown: {}", e))?;

    let weekly_breakdown: Vec<WeeklyBreakdown> = weekly_rows
        .iter()
        .map(|r| WeeklyBreakdown {
            week_start: r.week_start.clone(),
            week_end: r.week_end.clone(),
            time_saved_hours: r.time_saved_minutes as f64 / 60.0,
            cost_saved_usd: r.cost_saved_usd,
            automations_run: r.automations_run,
        })
        .collect();

    // Calculate change from last month
    let prev_month_rows = collector
        .0
        .get_weekly_breakdown(&user_id, sixty_days_ago, thirty_days_ago)
        .map_err(|e| format!("Failed to get previous month breakdown: {}", e))?;
    let prev_time: f64 = prev_month_rows
        .iter()
        .map(|r| r.time_saved_minutes as f64)
        .sum();
    let curr_time: f64 = weekly_rows
        .iter()
        .map(|r| r.time_saved_minutes as f64)
        .sum();
    let change_from_last_month = if prev_time > 0.0 {
        ((curr_time - prev_time) / prev_time) * 100.0
    } else if curr_time > 0.0 {
        100.0
    } else {
        0.0
    };

    Ok(MonthStats {
        total_time_saved_hours: stats.this_month.total_time_saved_hours,
        total_cost_saved_usd: stats.this_month.total_cost_saved_usd,
        automations_run: stats.this_month.total_automations_run,
        avg_quality_score: stats.this_month.avg_time_saved_per_run,
        change_from_last_month,
        top_employees: map_employees(&stats.this_month.top_employees),
        weekly_breakdown,
    })
}

#[tauri::command]
pub async fn get_all_time_stats(
    user_id: String, // TODO: Replace caller-supplied user_id with SessionState lookup
    collector: State<'_, MetricsCollectorState>,
) -> Result<AllTimeStats, String> {
    let stats = collector.0.get_realtime_stats(&user_id)?;

    // Monthly trend: go back ~2 years (730 days) to cover all meaningful history
    let now = Utc::now().timestamp();
    let two_years_ago = now - (730 * 24 * 60 * 60);

    let monthly_rows = collector
        .0
        .get_monthly_breakdown(&user_id, two_years_ago, now)
        .map_err(|e| format!("Failed to get monthly breakdown: {}", e))?;

    let monthly_trend: Vec<MonthlyTrend> = monthly_rows
        .iter()
        .map(|r| MonthlyTrend {
            month: r.month.clone(),
            time_saved_hours: r.time_saved_minutes as f64 / 60.0,
            cost_saved_usd: r.cost_saved_usd,
            automations_run: r.automations_run,
        })
        .collect();

    // Count milestones from the database
    let milestones_achieved = {
        let db_conn = collector.0.db_conn();
        let conn = db_conn
            .lock()
            .map_err(|e| format!("Failed to lock database: {}", e))?;
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM user_milestones WHERE user_id = ?1",
                rusqlite::params![&user_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to count milestones: {}", e))?;
        count as u64
    };

    Ok(AllTimeStats {
        total_time_saved_hours: stats.all_time.total_time_saved_hours,
        total_cost_saved_usd: stats.all_time.total_cost_saved_usd,
        automations_run: stats.all_time.total_automations_run,
        avg_quality_score: stats.all_time.avg_time_saved_per_run,
        milestones_achieved,
        top_employees: map_employees(&stats.all_time.top_employees),
        monthly_trend,
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
        manual_time_hours: comp.manual_time_minutes as f64 / 60.0,
        automated_time_hours: comp.automated_time_minutes as f64 / 60.0,
        manual_cost_usd: comp.manual_cost_usd,
        automated_cost_usd: comp.automated_cost_usd,
        // Use error rates as quality (lower is better, so invert)
        manual_quality: (1.0 - comp.manual_error_rate) * 100.0,
        automated_quality: (1.0 - comp.automated_error_rate) * 100.0,
        time_saved_hours: comp.time_saved_minutes as f64 / 60.0,
        cost_saved_usd: comp.cost_saved_usd,
        efficiency_gain: ((comp.manual_time_minutes as f64 - comp.automated_time_minutes as f64)
            / comp.manual_time_minutes as f64)
            * 100.0,
        quality_improvement: comp.quality_improvement_percent,
    })
}

#[tauri::command]
pub async fn get_period_comparison(
    user_id: String, // TODO: Replace caller-supplied user_id with SessionState lookup
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
        current_period_label: "Current".to_string(),
        previous_period_label: "Previous".to_string(),
        current_time_saved_hours: comp.current.total_time_saved_hours,
        previous_time_saved_hours: comp.previous.total_time_saved_hours,
        current_cost_saved_usd: comp.current.total_cost_saved_usd,
        previous_cost_saved_usd: comp.previous.total_cost_saved_usd,
        current_automations_run: comp.current.total_automations_run,
        previous_automations_run: comp.previous.total_automations_run,
        percentage_change: comp.time_saved_change_percent,
    })
}

#[tauri::command]
pub async fn get_benchmark_comparison(
    user_id: String, // TODO: Replace caller-supplied user_id with SessionState lookup
    role: String,
    comparison: State<'_, MetricsComparisonState>,
) -> Result<BenchmarkComparisonData, String> {
    let comp = comparison
        .0
        .compare_to_industry_benchmark(&user_id, &role)
        .await?;
    Ok(BenchmarkComparisonData {
        your_time_saved_hours: comp.user_time_saved,
        industry_average_time_saved_hours: comp.industry_avg_time_saved,
        your_cost_saved_usd: comp.user_cost_saved,
        industry_average_cost_saved_usd: comp.industry_avg_cost_saved,
        your_automations_run: 0, // Not available in BenchmarkComparison
        industry_average_automations_run: 0, // Not available in BenchmarkComparison
        percentage_better: if comp.above_average {
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
    #[serde(rename = "dateRange")]
    pub date_range: String,
    pub format: String,
    #[serde(rename = "includeCharts")]
    pub include_charts: bool,
    #[serde(rename = "includeDetailedLog")]
    pub include_detailed_log: bool,
    #[serde(rename = "includeComparison")]
    pub include_comparison: bool,
    #[serde(rename = "includeEmployeeBreakdown")]
    pub include_employee_breakdown: bool,
    #[serde(rename = "startDate")]
    pub start_date: Option<String>,
    #[serde(rename = "endDate")]
    pub end_date: Option<String>,
}

#[tauri::command]
pub async fn export_roi_report(
    options: ExportOptions,
    user_id: String, // TODO: Replace caller-supplied user_id with SessionState lookup
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
                "period": options.date_range,
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
