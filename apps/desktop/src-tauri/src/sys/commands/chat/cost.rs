//! Billing budget checks and cost analytics commands.

use crate::data::db::repository;
use chrono::{Datelike, Duration as ChronoDuration, TimeZone, Utc};
use tauri::State;

use super::state::AppDatabase;
use super::types::{CostAnalyticsResponse, CostOverviewResponse};

/// Check billing subscription access and monthly budget limits.
/// Returns Ok(()) if the request is allowed, Err(String) if blocked.
pub(crate) fn check_billing_and_budget(
    #[cfg(feature = "billing")] _billing_state: &tokio::sync::MutexGuard<
        '_,
        crate::sys::billing::BillingState,
    >,
    db: &AppDatabase,
    user_id: &str,
) -> Result<(), String> {
    #[cfg(feature = "billing")]
    {
        if !_billing_state.check_cloud_access() {
            return Err(
                "Subscription required. Please upgrade to the Hobby plan to use the AGI agent."
                    .to_string(),
            );
        }
    }

    {
        let conn = db
            .connection()
            .map_err(|e| format!("Budget check failed: {e}"))?;

        if let Ok(budget_setting) = repository::get_setting(&conn, "billing.monthly_budget") {
            if let Ok(budget_limit) = budget_setting.value.parse::<f64>() {
                if budget_limit > 0.0 {
                    let now = Utc::now();
                    let start_of_month = now
                        .date_naive()
                        .with_day(1)
                        .ok_or_else(|| "Failed to determine start of month".to_string())?
                        .and_hms_opt(0, 0, 0)
                        .ok_or_else(|| "Failed to set time for start of month".to_string())?
                        .and_utc();

                    let current_usage = repository::sum_cost_since(&conn, start_of_month, user_id)
                        .map_err(|e| format!("Failed to query usage for budget check: {}", e))?;

                    if current_usage >= budget_limit {
                        return Err(format!(
                            "Monthly budget exceeded. Usage: ${:.2}, Limit: ${:.2}. Please update settings.",
                            current_usage,
                            budget_limit
                        ));
                    }
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn chat_get_cost_overview(
    db: State<'_, AppDatabase>,
    user_id: String,
) -> Result<CostOverviewResponse, String> {
    if user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }

    let conn = db.connection()?;

    let now = Utc::now();
    let today_start = Utc
        .with_ymd_and_hms(now.year(), now.month(), now.day(), 0, 0, 0)
        .single()
        .ok_or_else(|| "Failed to compute start-of-day".to_string())?;
    let month_start = Utc
        .with_ymd_and_hms(now.year(), now.month(), 1, 0, 0, 0)
        .single()
        .ok_or_else(|| "Failed to compute start-of-month".to_string())?;

    let today_total = repository::sum_cost_since(&conn, today_start, &user_id)
        .map_err(|e| format!("Failed to compute today's cost: {e}"))?;
    let month_total = repository::sum_cost_since(&conn, month_start, &user_id)
        .map_err(|e| format!("Failed to compute monthly cost: {e}"))?;

    let monthly_budget = repository::get_setting(&conn, "billing.monthly_budget")
        .ok()
        .and_then(|setting| setting.value.parse::<f64>().ok());
    let remaining_budget = monthly_budget.map(|budget| (budget - month_total).max(0.0));

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
    if let Some(d) = days {
        if d <= 0 {
            return Err(format!("Invalid days value: {}. Days must be positive", d));
        }
        if d > 3650 {
            return Err(format!(
                "Invalid days value: {}. Days cannot exceed 3650 (10 years)",
                d
            ));
        }
    }

    let conn = db.connection()?;
    let window = days.unwrap_or(30).max(1);

    let provider_clean = provider
        .as_ref()
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty());
    let model_clean = model
        .as_ref()
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty());

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
            "billing.monthly_budget".to_string(),
            format!("{:.2}", value),
            false,
        )
        .map_err(|e| format!("Failed to save monthly budget: {e}"))?,
        None => repository::delete_setting(&conn, "billing.monthly_budget")
            .map_err(|e| format!("Failed to clear monthly budget: {e}"))?,
    }

    Ok(())
}
