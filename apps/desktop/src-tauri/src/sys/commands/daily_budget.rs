//! Tauri IPC for FIX-007 daily LLM-spend cap.
//!
//! `budget_get_status` powers the status-bar `$X / $Y today` widget;
//! `budget_set_cap_usd` lets the Settings UI raise/lower the cap.
//! `budget_record_actual` is the bridge from the agent's per-call cost
//! calculator into the persisted spend table.
use tauri::State;

use crate::core::llm::daily_budget::{BudgetStatus, DailyBudgetGuard};

/// Read the current spend posture for the supplied user. The frontend
/// passes `current_user_id()` (or "default" for unauthenticated users)
/// and renders the result as a small "$X / $Y today" string.
#[tauri::command]
pub async fn budget_get_status(
    user_id: String,
    guard: State<'_, DailyBudgetGuard>,
) -> Result<BudgetStatus, String> {
    guard.status(&user_id)
}

/// Update the per-day cap. Returns the new cap so the caller can confirm
/// the value the guard now enforces (in case it was clamped).
#[tauri::command]
pub async fn budget_set_cap_usd(
    new_cap_usd: f64,
    guard: State<'_, DailyBudgetGuard>,
) -> Result<f64, String> {
    guard.set_cap_usd(new_cap_usd)
}

/// Record a completed-call cost into today's bucket. Called by the LLM
/// router after `cost_calculator` returns, so the budget reflects
/// post-stream actuals rather than pre-flight estimates.
#[tauri::command]
pub async fn budget_record_actual(
    user_id: String,
    actual_cost_usd: f64,
    guard: State<'_, DailyBudgetGuard>,
) -> Result<BudgetStatus, String> {
    guard.record_actual(&user_id, actual_cost_usd)?;
    guard.status(&user_id)
}
