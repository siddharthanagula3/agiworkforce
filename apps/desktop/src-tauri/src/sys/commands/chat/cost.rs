use chrono::{Datelike, Duration as ChronoDuration, TimeZone, Utc};
use tauri::State;

use crate::core::llm::daily_budget::{self, LOCAL_PROFILE_BUDGET_KEY, MONTHLY_BUDGET_SETTING_KEY};
use crate::data::db::repository;

use super::{AppDatabase, CostAnalyticsResponse, CostOverviewResponse};

#[tauri::command]
pub fn chat_get_cost_overview(
    db: State<'_, AppDatabase>,
    user_id: String,
) -> Result<CostOverviewResponse, String> {
    if user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }

    let now = Utc::now();
    let today_start = Utc
        .with_ymd_and_hms(now.year(), now.month(), now.day(), 0, 0, 0)
        .single()
        .ok_or_else(|| "Failed to compute start-of-day".to_string())?;
    let month_start = Utc
        .with_ymd_and_hms(now.year(), now.month(), 1, 0, 0, 0)
        .single()
        .ok_or_else(|| "Failed to compute start-of-month".to_string())?;

    let (today_total, month_total, monthly_budget) = {
        let conn = db.connection()?;
        let today_total = repository::sum_cost_since(&conn, today_start, &user_id)
            .map_err(|e| format!("Failed to compute today's cost: {e}"))?;
        let month_total = repository::sum_cost_since(&conn, month_start, &user_id)
            .map_err(|e| format!("Failed to compute monthly cost: {e}"))?;
        let monthly_budget = repository::get_setting(&conn, MONTHLY_BUDGET_SETTING_KEY)
            .ok()
            .and_then(|setting| setting.value.parse::<f64>().ok());
        (today_total, month_total, monthly_budget)
    };

    // The spend guard shares this connection, so it is asked only after the
    // lock above is released. What it reports is what the router enforces:
    // every request against the user's own keys, agent runs included, where
    // `month_total` is this account's chat messages alone.
    let budget_spend = daily_budget::global()
        .and_then(|guard| guard.spent_this_month(LOCAL_PROFILE_BUDGET_KEY).ok())
        .unwrap_or(month_total);
    let remaining_budget = monthly_budget.map(|budget| (budget - budget_spend).max(0.0));

    Ok(CostOverviewResponse {
        today_total,
        month_total,
        monthly_budget,
        remaining_budget,
    })
}

#[tauri::command]
pub fn chat_get_cost_analytics(
    db: State<'_, AppDatabase>,
    user_id: String,
    days: Option<i64>,
    provider: Option<String>,
    model: Option<String>,
) -> Result<CostAnalyticsResponse, String> {
    if user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }
    if let Some(value) = days {
        if value <= 0 {
            return Err(format!(
                "Invalid days value: {}. Days must be positive",
                value
            ));
        }
        if value > 3650 {
            return Err(format!(
                "Invalid days value: {}. Days cannot exceed 3650 (10 years)",
                value
            ));
        }
    }

    let conn = db.connection()?;
    let window = days.unwrap_or(30).max(1);

    let provider_clean = provider
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let model_clean = model
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let provider_ref = provider_clean.as_deref();
    let model_ref = model_clean.as_deref();

    let end = Utc::now();
    let span = window - 1;
    let start = if span > 0 {
        end - ChronoDuration::days(span)
    } else {
        end
    };

    let timeseries =
        repository::list_cost_timeseries(&conn, window, provider_ref, model_ref, &user_id)
            .map_err(|e| format!("Failed to load cost timeseries: {e}"))?;
    let providers = repository::list_cost_by_provider(
        &conn,
        Some(start),
        Some(end),
        provider_ref,
        model_ref,
        &user_id,
    )
    .map_err(|e| format!("Failed to load provider breakdown: {e}"))?;
    let top_conversations = repository::list_top_conversations_by_cost_filtered(
        &conn,
        10,
        Some(start),
        Some(end),
        provider_ref,
        model_ref,
        &user_id,
    )
    .map_err(|e| format!("Failed to load top conversations: {e}"))?;

    Ok(CostAnalyticsResponse {
        timeseries,
        providers,
        top_conversations,
    })
}

#[tauri::command]
pub fn chat_set_monthly_budget(
    db: State<'_, AppDatabase>,
    amount: Option<f64>,
) -> Result<(), String> {
    if let Some(value) = amount {
        if value < 0.0 {
            return Err(format!(
                "Invalid budget amount: {}. Budget must be non-negative",
                value
            ));
        }
        if value > 1_000_000.0 {
            return Err(format!(
                "Invalid budget amount: {}. Budget cannot exceed $1,000,000",
                value
            ));
        }
    }

    let conn = db.connection()?;

    match amount {
        Some(value) => repository::set_setting(
            &conn,
            MONTHLY_BUDGET_SETTING_KEY.to_string(),
            format!("{:.2}", value),
            false,
        )
        .map_err(|e| format!("Failed to save monthly budget: {e}"))?,
        None => repository::delete_setting(&conn, MONTHLY_BUDGET_SETTING_KEY)
            .map_err(|e| format!("Failed to clear monthly budget: {e}"))?,
    }

    Ok(())
}
