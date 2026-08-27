//! Tauri IPC for the daily LLM-spend cap.
//!
//! Spend is written by the LLM router itself (`record_completed_request_cost`),
//! not from the frontend, so there is no command that adds spend: an IPC
//! surface that could inflate the bucket would be a way to lock the user out
//! of their own models. These two only read the posture and move the ceiling.
use tauri::State;

use crate::core::llm::daily_budget::{BudgetStatus, DailyBudgetGuard, LOCAL_PROFILE_BUDGET_KEY};

/// Read today's spend posture for the profile, for the `$X / $Y today` widget.
#[tauri::command]
pub async fn budget_get_status(guard: State<'_, DailyBudgetGuard>) -> Result<BudgetStatus, String> {
    guard.status(LOCAL_PROFILE_BUDGET_KEY)
}

/// Update the daily cap. Returns the value the guard now enforces so the
/// caller can confirm it rather than assume the request was honoured.
#[tauri::command]
pub async fn budget_set_cap_usd(
    new_cap_usd: f64,
    guard: State<'_, DailyBudgetGuard>,
) -> Result<f64, String> {
    guard.set_cap_usd(new_cap_usd)
}
