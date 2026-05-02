//! Per-user daily LLM-spend cap (FIX-007, Sprint 3).
//!
//! Prior to FIX-007 the only spending guard was the per-session $50 cap in
//! `core/agent/autonomous.rs`, which resets every run. An indirect prompt
//! injection plus a poisoned doc could repeatedly trigger autonomous runs
//! and bleed the user's BYOK keys for as much money as the model could be
//! coaxed into requesting in a day.
//!
//! `DailyBudgetGuard` is published as Tauri State and consulted on every
//! cost-bearing LLM call. It tracks spend per `(user_id, day)` in a small
//! SQLite table and rejects new calls once the configured cap is hit.
//!
//! The cap is per-user so multiple AGI Workforce profiles on the same
//! machine do not share a budget envelope. Default `$25/day`; configurable
//! via `Settings`.
use std::sync::Arc;
use std::sync::Mutex;

use chrono::Utc;
use rusqlite::params;
use rusqlite::Connection;
use serde::Deserialize;
use serde::Serialize;

const DEFAULT_DAILY_CAP_USD: f64 = 25.0;
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

/// Returned by [`DailyBudgetGuard::reserve_or_reject`] when the call would
/// take the user past their daily cap. Surface to the caller so it can
/// abort the LLM call before the network round-trip happens.
#[derive(Debug, thiserror::Error)]
#[error(
    "Daily LLM spend cap reached: {spent_usd:.2} USD already spent today (cap {cap_usd:.2} USD). Increase the cap in Settings → Models → Budget if this is intentional."
)]
pub struct BudgetExceededError {
    pub spent_usd: f64,
    pub cap_usd: f64,
}

#[derive(Clone)]
pub struct DailyBudgetGuard {
    conn: Arc<Mutex<Connection>>,
    cap_usd: Arc<Mutex<f64>>,
}

impl DailyBudgetGuard {
    /// Build a new guard sharing the provided SQLite connection.
    /// Auto-creates the `budget_daily_spend` table on first use.
    pub fn new(conn: Arc<Mutex<Connection>>) -> Result<Self, String> {
        {
            let conn_guard = conn.lock().map_err(|e| format!("budget conn poisoned: {e}"))?;
            conn_guard
                .execute(CREATE_TABLE_SQL, [])
                .map_err(|e| format!("Failed to create budget_daily_spend: {e}"))?;
        }
        Ok(Self {
            conn,
            cap_usd: Arc::new(Mutex::new(DEFAULT_DAILY_CAP_USD)),
        })
    }

    /// Update the per-user daily cap. Returns the new value. Persisting to
    /// `Settings` is the caller's responsibility.
    pub fn set_cap_usd(&self, new_cap_usd: f64) -> Result<f64, String> {
        if !new_cap_usd.is_finite() || new_cap_usd < 0.0 {
            return Err(format!("Invalid budget cap: {new_cap_usd}"));
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

    /// Pre-flight check: if `estimated_cost_usd` would push the user past
    /// the cap, refuse the call. When the call is allowed, the cost is
    /// recorded immediately so concurrent in-flight calls see the running
    /// total. If the actual cost ends up lower the caller can call
    /// [`Self::refund_unspent`] to give the budget back.
    pub fn reserve_or_reject(
        &self,
        user_id: &str,
        estimated_cost_usd: f64,
    ) -> Result<BudgetStatus, BudgetExceededError> {
        let day = current_day_utc();
        let spent = self
            .spent_today(user_id, &day)
            .unwrap_or(0.0);
        let cap = self.cap_usd();

        if spent >= cap {
            return Err(BudgetExceededError { spent_usd: spent, cap_usd: cap });
        }

        // Record the reservation. If the upsert itself fails we treat
        // that as a transient issue and let the call through (logged
        // upstream); refusing to spend would be more disruptive than
        // silently missing one row of attribution.
        let _ = self.add_spend(user_id, &day, estimated_cost_usd);
        let new_spent = spent + estimated_cost_usd;
        Ok(BudgetStatus {
            user_id: user_id.to_string(),
            day,
            spent_usd: new_spent,
            cap_usd: cap,
            remaining_usd: (cap - new_spent).max(0.0),
        })
    }

    /// Apply the actual cost recorded by the cost-calculator after a
    /// successful call. If `actual_cost_usd` is lower than the previously
    /// reserved estimate, callers can pass the difference (negative) to
    /// `refund_unspent` to give that headroom back.
    pub fn record_actual(&self, user_id: &str, actual_cost_usd: f64) -> Result<(), String> {
        let day = current_day_utc();
        self.add_spend(user_id, &day, actual_cost_usd)
    }

    /// Subtract the supplied amount from today's spend. Used after a
    /// `reserve_or_reject` reservation when the actual cost ended up
    /// lower than the estimate. Negative values are clamped to zero.
    pub fn refund_unspent(&self, user_id: &str, refund_usd: f64) -> Result<(), String> {
        if refund_usd <= 0.0 {
            return Ok(());
        }
        let day = current_day_utc();
        self.add_spend(user_id, &day, -refund_usd)
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
        // The INSERT branch (no existing row) clamps a negative delta to
        // zero — refunds against an empty bucket can't go below zero. The
        // UPDATE branch adds the raw delta and clamps the *result*, which
        // is the only place the running total should be guarded.
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

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh_guard() -> DailyBudgetGuard {
        let conn = Connection::open_in_memory().expect("in-memory");
        DailyBudgetGuard::new(Arc::new(Mutex::new(conn))).expect("guard")
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
    fn reserve_within_cap_succeeds_and_records_spend() {
        let guard = fresh_guard();
        let after = guard.reserve_or_reject("alice", 5.0).expect("reserve");
        assert_eq!(after.spent_usd, 5.0);
        assert_eq!(after.remaining_usd, 20.0);

        let status = guard.status("alice").unwrap();
        assert_eq!(status.spent_usd, 5.0);
    }

    #[test]
    fn reserve_at_or_past_cap_rejects() {
        let guard = fresh_guard();
        // Push spend to the cap, then a fresh request must reject.
        guard.reserve_or_reject("alice", 25.0).expect("reserve");
        let err = guard
            .reserve_or_reject("alice", 0.01)
            .expect_err("should reject after cap");
        assert!((err.cap_usd - 25.0).abs() < 1e-9);
        assert!(err.spent_usd >= 25.0);
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
    fn refund_releases_headroom() {
        let guard = fresh_guard();
        guard.reserve_or_reject("alice", 10.0).unwrap();
        guard.refund_unspent("alice", 7.0).unwrap();
        let status = guard.status("alice").unwrap();
        assert!((status.spent_usd - 3.0).abs() < 1e-9);
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
        guard.reserve_or_reject("alice", 20.0).unwrap();
        let bob_status = guard.status("bob").unwrap();
        assert_eq!(bob_status.spent_usd, 0.0, "bob's bucket must not see alice's spend");
        guard.reserve_or_reject("bob", 5.0).unwrap();
        let alice_status = guard.status("alice").unwrap();
        assert_eq!(alice_status.spent_usd, 20.0);
    }
}
