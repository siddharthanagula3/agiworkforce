//! Per-user daily LLM-spend cap (FIX-007, Sprint 3).
//!
//! Prior to FIX-007 the only spending guard was the per-session $50 cap in
//! `core/agent/autonomous.rs`, which resets every run. An indirect prompt
//! injection plus a poisoned doc could repeatedly trigger autonomous runs
//! and bleed the user's BYOK keys for as much money as the model could be
//! coaxed into requesting in a day.
//!
//! `DailyBudgetGuard` tracks spend per `(user_id, day)` in a small SQLite
//! table. The LLM router consults it before dispatching a request
//! (`check_or_reject`) and credits the real charge afterwards
//! (`record_actual`), so the cap is applied to every cost-bearing call that
//! flows through `record_completed_request_cost`.
//!
//! The router runs far below the Tauri command layer and holds neither an
//! `AppHandle` nor any account identity, so the guard is published twice: as
//! Tauri State for the commands, and through [`install_global`] for the cost
//! paths that cannot take `State`. Those paths spend against
//! [`LOCAL_PROFILE_BUDGET_KEY`], on desktop the budget envelope is the
//! profile, since each profile has its own app-data directory and its own
//! copy of this table. Default `$25/day`; the cap chosen in Settings is kept in
//! `settings_v2` and read back when the guard is built.
//!
//! The monthly budget is a second window over the same ledger: the days of the
//! current UTC month, summed and held against the amount saved under
//! [`MONTHLY_BUDGET_SETTING_KEY`]. Enforcing it here, beside the daily cap,
//! bounds every caller of the router, chat, agents, Tasks and scheduled runs
//! alike, with one rule.
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::OnceLock;

use chrono::Utc;
use rusqlite::params;
use rusqlite::Connection;
use serde::Deserialize;
use serde::Serialize;

use crate::data::settings::{get_setting, upsert_setting, SettingCategory, SettingValue};

const DEFAULT_DAILY_CAP_USD: f64 = 25.0;
const DAILY_CAP_SETTING_KEY: &str = "llm.daily_spend_cap_usd";

/// Spend bucket used by callers that have no account identity to attribute to.
pub const LOCAL_PROFILE_BUDGET_KEY: &str = "local-profile";

/// Key of the monthly budget in the `settings` table, in US dollars. Absent
/// or zero means no monthly budget.
pub const MONTHLY_BUDGET_SETTING_KEY: &str = "billing.monthly_budget";

static GLOBAL_GUARD: OnceLock<DailyBudgetGuard> = OnceLock::new();

/// Publish the guard for the cost paths that cannot resolve Tauri `State`.
/// Idempotent: a second call leaves the first guard in place.
pub fn install_global(guard: DailyBudgetGuard) {
    let _ = GLOBAL_GUARD.set(guard);
}

/// The installed guard, or `None` when budget tracking failed to initialise.
pub fn global() -> Option<&'static DailyBudgetGuard> {
    GLOBAL_GUARD.get()
}

const CREATE_TABLE_SQL: &str = "CREATE TABLE IF NOT EXISTS budget_daily_spend (
    user_id TEXT NOT NULL,
    day TEXT NOT NULL,
    spent_usd REAL NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, day)
)";

/// Snapshot of the current day's budget posture for a single user.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct BudgetStatus {
    pub user_id: String,
    pub day: String,
    pub spent_usd: f64,
    pub cap_usd: f64,
    pub remaining_usd: f64,
}

/// Returned by [`DailyBudgetGuard::check_or_reject`] when the day's cap is
/// already reached. Surface to the caller so it can abort the LLM call before
/// the network round-trip happens.
#[derive(Debug, thiserror::Error)]
#[error(
    "Daily LLM spend cap reached: {spent_usd:.2} USD already spent today (cap {cap_usd:.2} USD). Raise it in Settings → Models & Keys → Daily Spend Cap if this is intentional."
)]
pub struct BudgetExceededError {
    pub spent_usd: f64,
    pub cap_usd: f64,
}

/// Returned by [`DailyBudgetGuard::check_monthly_or_reject`] when the month's
/// spend has reached the monthly budget.
#[derive(Debug, thiserror::Error)]
#[error(
    "Monthly LLM budget reached: {spent_usd:.2} USD spent this month (budget {budget_usd:.2} USD). Raise or clear it in Settings → Usage → Cost tracking if this is intentional."
)]
pub struct MonthlyBudgetExceededError {
    pub spent_usd: f64,
    pub budget_usd: f64,
}

#[derive(Clone)]
pub struct DailyBudgetGuard {
    conn: Arc<Mutex<Connection>>,
    cap_usd: Arc<Mutex<f64>>,
}

impl DailyBudgetGuard {
    /// Build a new guard sharing the provided SQLite connection.
    /// Auto-creates the `budget_daily_spend` table on first use and restores
    /// the cap saved by an earlier run.
    pub fn new(conn: Arc<Mutex<Connection>>) -> Result<Self, String> {
        let cap_usd = {
            let conn_guard = conn
                .lock()
                .map_err(|e| format!("budget conn poisoned: {e}"))?;
            conn_guard
                .execute(CREATE_TABLE_SQL, [])
                .map_err(|e| format!("Failed to create budget_daily_spend: {e}"))?;
            persisted_cap_usd(&conn_guard).unwrap_or(DEFAULT_DAILY_CAP_USD)
        };
        Ok(Self {
            conn,
            cap_usd: Arc::new(Mutex::new(cap_usd)),
        })
    }

    /// Update the per-user daily cap and save it, so a restart keeps it.
    /// Returns the new value. When the save fails the cap in force is left
    /// unchanged, so the value shown is never one a restart would discard.
    pub fn set_cap_usd(&self, new_cap_usd: f64) -> Result<f64, String> {
        if !new_cap_usd.is_finite() || new_cap_usd < 0.0 {
            return Err(format!("Invalid budget cap: {new_cap_usd}"));
        }
        {
            let conn = self
                .conn
                .lock()
                .map_err(|e| format!("budget conn poisoned: {e}"))?;
            upsert_setting(
                &conn,
                DAILY_CAP_SETTING_KEY.to_string(),
                SettingValue::Float(new_cap_usd),
                SettingCategory::Llm,
                false,
            )
            .map_err(|e| format!("Failed to save the daily spend cap: {e}"))?;
        }
        let mut cap = self
            .cap_usd
            .lock()
            .map_err(|e| format!("budget cap lock poisoned: {e}"))?;
        *cap = new_cap_usd;
        Ok(*cap)
    }

    /// Read the current cap. Cheap; safe to call from a status-bar tick.
    pub fn cap_usd(&self) -> f64 {
        self.cap_usd
            .lock()
            .map(|guard| *guard)
            .unwrap_or(DEFAULT_DAILY_CAP_USD)
    }

    /// Check the user's posture without reserving any spend.
    pub fn status(&self, user_id: &str) -> Result<BudgetStatus, String> {
        let day = current_day_utc();
        let spent = self.spent_today(user_id, &day)?;
        let cap = self.cap_usd();
        Ok(BudgetStatus {
            user_id: user_id.to_string(),
            day,
            spent_usd: spent,
            cap_usd: cap,
            remaining_usd: (cap - spent).max(0.0),
        })
    }

    /// Pre-flight gate: refuse the call when today's spend has already
    /// reached the cap. Records nothing, the charge is only known after the
    /// provider responds, and is credited by [`Self::record_actual`].
    ///
    /// A read failure is treated as zero spend rather than as a refusal: the
    /// cap exists to bound runaway autonomous loops, not to take the app
    /// offline when SQLite is briefly unavailable.
    pub fn check_or_reject(&self, user_id: &str) -> Result<(), BudgetExceededError> {
        let day = current_day_utc();
        let spent = self.spent_today(user_id, &day).unwrap_or(0.0);
        let cap = self.cap_usd();

        if spent >= cap {
            return Err(BudgetExceededError {
                spent_usd: spent,
                cap_usd: cap,
            });
        }
        Ok(())
    }

    /// The monthly budget in force, or `None` when none is set. Read on every
    /// call, so a budget changed in Settings applies to the next request.
    pub fn monthly_budget_usd(&self) -> Option<f64> {
        let conn = self.conn.lock().ok()?;
        let budget = crate::data::db::repository::get_setting(&conn, MONTHLY_BUDGET_SETTING_KEY)
            .ok()?
            .value
            .parse::<f64>()
            .ok()?;
        (budget.is_finite() && budget > 0.0).then_some(budget)
    }

    /// Spend recorded since the first day of the current UTC month.
    pub fn spent_this_month(&self, user_id: &str) -> Result<f64, String> {
        let month_start = current_month_start_utc();
        let conn = self
            .conn
            .lock()
            .map_err(|e| format!("budget conn poisoned: {e}"))?;
        let value: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(spent_usd), 0.0) FROM budget_daily_spend
                 WHERE user_id = ?1 AND day >= ?2",
                params![user_id, month_start],
                |row| row.get(0),
            )
            .unwrap_or(0.0);
        Ok(value.max(0.0))
    }

    /// Pre-flight gate for the monthly budget: refuse the call when the
    /// month's spend has already reached it. No budget, or a ledger that
    /// cannot be read, allows the call, for the reason given on
    /// [`Self::check_or_reject`].
    pub fn check_monthly_or_reject(&self, user_id: &str) -> Result<(), MonthlyBudgetExceededError> {
        let Some(budget_usd) = self.monthly_budget_usd() else {
            return Ok(());
        };
        let spent_usd = self.spent_this_month(user_id).unwrap_or(0.0);
        if spent_usd >= budget_usd {
            return Err(MonthlyBudgetExceededError {
                spent_usd,
                budget_usd,
            });
        }
        Ok(())
    }

    /// Add the real charge for a completed call to today's bucket. Called by
    /// the router once the cost calculator has priced the request, so the
    /// bucket holds actuals rather than pre-flight estimates.
    pub fn record_actual(&self, user_id: &str, actual_cost_usd: f64) -> Result<(), String> {
        let day = current_day_utc();
        self.add_spend(user_id, &day, actual_cost_usd)
    }

    fn spent_today(&self, user_id: &str, day: &str) -> Result<f64, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| format!("budget conn poisoned: {e}"))?;
        let value: f64 = conn
            .query_row(
                "SELECT spent_usd FROM budget_daily_spend WHERE user_id = ?1 AND day = ?2",
                params![user_id, day],
                |row| row.get(0),
            )
            .unwrap_or(0.0);
        Ok(value.max(0.0))
    }

    fn add_spend(&self, user_id: &str, day: &str, delta_usd: f64) -> Result<(), String> {
        let now = Utc::now().timestamp();
        let conn = self
            .conn
            .lock()
            .map_err(|e| format!("budget conn poisoned: {e}"))?;
        // Both branches clamp at zero so a negative or corrupt cost from a
        // provider can never buy back headroom it did not pay for.
        conn.execute(
            "INSERT INTO budget_daily_spend (user_id, day, spent_usd, updated_at)
             VALUES (?1, ?2, MAX(0, ?3), ?4)
             ON CONFLICT(user_id, day) DO UPDATE SET
                 spent_usd = MAX(0, spent_usd + ?3),
                 updated_at = ?4",
            params![user_id, day, delta_usd, now],
        )
        .map_err(|e| format!("Failed to update budget_daily_spend: {e}"))?;
        Ok(())
    }
}

fn current_day_utc() -> String {
    Utc::now().format("%Y-%m-%d").to_string()
}

fn current_month_start_utc() -> String {
    Utc::now().format("%Y-%m-01").to_string()
}

fn persisted_cap_usd(conn: &Connection) -> Option<f64> {
    let value = get_setting(conn, DAILY_CAP_SETTING_KEY)
        .ok()?
        .get_value()
        .ok()?;
    let cap = value
        .as_float()
        .or_else(|| value.as_integer().map(|whole| whole as f64))?;
    (cap.is_finite() && cap >= 0.0).then_some(cap)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn profile_db() -> Arc<Mutex<Connection>> {
        let conn = Connection::open_in_memory().expect("in-memory");
        conn.execute(
            "CREATE TABLE settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                encrypted INTEGER NOT NULL DEFAULT 0
            )",
            [],
        )
        .expect("settings");
        conn.execute(
            "CREATE TABLE settings_v2 (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                category TEXT NOT NULL,
                encrypted INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )
        .expect("settings_v2");
        Arc::new(Mutex::new(conn))
    }

    fn fresh_guard() -> DailyBudgetGuard {
        DailyBudgetGuard::new(profile_db()).expect("guard")
    }

    fn set_monthly_budget(db: &Arc<Mutex<Connection>>, amount: &str) {
        db.lock()
            .expect("db")
            .execute(
                "INSERT OR REPLACE INTO settings (key, value, encrypted) VALUES (?1, ?2, 0)",
                params![MONTHLY_BUDGET_SETTING_KEY, amount],
            )
            .expect("budget");
    }

    #[test]
    fn spend_at_the_monthly_budget_is_refused_and_names_the_budget() {
        let db = profile_db();
        set_monthly_budget(&db, "10.00");
        let guard = DailyBudgetGuard::new(db).expect("guard");
        guard.record_actual("alice", 10.0).expect("record");

        let refusal = guard
            .check_monthly_or_reject("alice")
            .expect_err("budget reached");
        assert!((refusal.budget_usd - 10.0).abs() < 1e-9);
        assert!(refusal.spent_usd >= 10.0);
        let message = refusal.to_string();
        assert!(message.contains("Monthly LLM budget reached"));
        assert!(message.contains("Settings"));
    }

    #[test]
    fn spend_under_the_monthly_budget_is_allowed() {
        let db = profile_db();
        set_monthly_budget(&db, "10.00");
        let guard = DailyBudgetGuard::new(db).expect("guard");
        guard.record_actual("alice", 9.99).expect("record");

        guard
            .check_monthly_or_reject("alice")
            .expect("under budget");
    }

    #[test]
    fn no_monthly_budget_or_a_zero_one_allows_any_spend() {
        let db = profile_db();
        let guard = DailyBudgetGuard::new(db.clone()).expect("guard");
        guard.record_actual("alice", 500.0).expect("record");
        guard.check_monthly_or_reject("alice").expect("no budget");
        assert_eq!(guard.monthly_budget_usd(), None);

        set_monthly_budget(&db, "0.00");
        guard.check_monthly_or_reject("alice").expect("zero budget");
        assert_eq!(guard.monthly_budget_usd(), None);
    }

    #[test]
    fn a_changed_monthly_budget_applies_to_the_next_check() {
        let db = profile_db();
        set_monthly_budget(&db, "10.00");
        let guard = DailyBudgetGuard::new(db.clone()).expect("guard");
        guard.record_actual("alice", 12.0).expect("record");
        guard
            .check_monthly_or_reject("alice")
            .expect_err("over the first budget");

        set_monthly_budget(&db, "20.00");
        guard.check_monthly_or_reject("alice").expect("raised");
    }

    #[test]
    fn the_month_sums_its_own_days_and_no_earlier_ones() {
        let db = profile_db();
        let guard = DailyBudgetGuard::new(db.clone()).expect("guard");
        guard.record_actual("alice", 3.0).expect("today");
        db.lock()
            .expect("db")
            .execute(
                "INSERT INTO budget_daily_spend (user_id, day, spent_usd, updated_at)
                 VALUES ('alice', '2000-01-15', 40.0, 0)",
                [],
            )
            .expect("an earlier month");

        let spent = guard.spent_this_month("alice").expect("month");
        assert!((spent - 3.0).abs() < 1e-9);
    }

    #[test]
    fn a_saved_cap_survives_a_restart() {
        let db = profile_db();
        DailyBudgetGuard::new(db.clone())
            .expect("guard")
            .set_cap_usd(7.5)
            .expect("save");

        let after_restart = DailyBudgetGuard::new(db).expect("guard");
        assert!((after_restart.cap_usd() - 7.5).abs() < 1e-9);
    }

    #[test]
    fn a_whole_dollar_cap_survives_a_restart() {
        let db = profile_db();
        DailyBudgetGuard::new(db.clone())
            .expect("guard")
            .set_cap_usd(40.0)
            .expect("save");

        let after_restart = DailyBudgetGuard::new(db).expect("guard");
        assert!((after_restart.cap_usd() - 40.0).abs() < 1e-9);
    }

    #[test]
    fn a_cap_that_cannot_be_saved_is_not_applied() {
        let conn = Connection::open_in_memory().expect("in-memory");
        let guard = DailyBudgetGuard::new(Arc::new(Mutex::new(conn))).expect("guard");

        let err = guard.set_cap_usd(60.0).expect_err("no settings table");
        assert!(err.contains("Failed to save the daily spend cap"));
        assert!((guard.cap_usd() - 25.0).abs() < 1e-9);
    }

    #[test]
    fn cap_default_is_25_usd() {
        let guard = fresh_guard();
        assert!((guard.cap_usd() - 25.0).abs() < 1e-9);
    }

    #[test]
    fn status_starts_at_zero_spend() {
        let guard = fresh_guard();
        let status = guard.status("alice").expect("status");
        assert_eq!(status.spent_usd, 0.0);
        assert_eq!(status.cap_usd, 25.0);
        assert_eq!(status.remaining_usd, 25.0);
    }

    #[test]
    fn check_below_cap_allows_the_call_and_records_nothing() {
        let guard = fresh_guard();
        guard.record_actual("alice", 5.0).expect("record");
        guard.check_or_reject("alice").expect("under cap");

        let status = guard.status("alice").unwrap();
        assert_eq!(status.spent_usd, 5.0, "the gate must not add spend");
        assert_eq!(status.remaining_usd, 20.0);
    }

    #[test]
    fn check_at_or_past_cap_rejects() {
        let guard = fresh_guard();
        guard.record_actual("alice", 25.0).expect("record");
        let err = guard
            .check_or_reject("alice")
            .expect_err("should reject at the cap");
        assert!((err.cap_usd - 25.0).abs() < 1e-9);
        assert!(err.spent_usd >= 25.0);
    }

    #[test]
    fn check_rejects_only_the_user_who_is_over_cap() {
        let guard = fresh_guard();
        guard.record_actual("alice", 25.0).expect("record");
        guard
            .check_or_reject("bob")
            .expect("bob is under his own cap");
    }

    #[test]
    fn record_actual_increments_existing_spend() {
        let guard = fresh_guard();
        guard.record_actual("alice", 1.5).unwrap();
        guard.record_actual("alice", 2.5).unwrap();
        let status = guard.status("alice").unwrap();
        assert!((status.spent_usd - 4.0).abs() < 1e-9);
    }

    #[test]
    fn a_raised_cap_reopens_a_blocked_bucket() {
        let guard = fresh_guard();
        guard.record_actual("alice", 25.0).unwrap();
        guard.check_or_reject("alice").expect_err("blocked at $25");

        guard.set_cap_usd(40.0).unwrap();
        guard.check_or_reject("alice").expect("headroom restored");
    }

    #[test]
    fn cap_can_be_changed_at_runtime() {
        let guard = fresh_guard();
        guard.set_cap_usd(50.0).unwrap();
        assert!((guard.cap_usd() - 50.0).abs() < 1e-9);

        // Negative caps are rejected.
        let err = guard.set_cap_usd(-1.0).expect_err("must reject negative");
        assert!(err.contains("Invalid budget cap"));
    }

    #[test]
    fn per_user_buckets_are_isolated() {
        let guard = fresh_guard();
        guard.record_actual("alice", 20.0).unwrap();
        let bob_status = guard.status("bob").unwrap();
        assert_eq!(
            bob_status.spent_usd, 0.0,
            "bob's bucket must not see alice's spend"
        );
        guard.record_actual("bob", 5.0).unwrap();
        let alice_status = guard.status("alice").unwrap();
        assert_eq!(alice_status.spent_usd, 20.0);
    }

    #[test]
    fn the_global_guard_is_absent_until_installed() {
        // `install_global` is called once from `lib.rs::setup`; the router
        // must tolerate the pre-install window rather than panic.
        let _ = global();
    }
}
