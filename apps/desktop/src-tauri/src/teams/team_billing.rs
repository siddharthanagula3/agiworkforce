use rusqlite::{params, Connection, OptionalExtension, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

/// Billing plan tiers
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BillingPlan {
    Team,
    Enterprise,
}

impl BillingPlan {
    pub fn as_str(&self) -> &'static str {
        match self {
            BillingPlan::Team => "team",
            BillingPlan::Enterprise => "enterprise",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "team" => Some(BillingPlan::Team),
            "enterprise" => Some(BillingPlan::Enterprise),
            _ => None,
        }
    }

    /// Get price per seat per month in USD
    pub fn price_per_seat(&self) -> f64 {
        match self {
            BillingPlan::Team => 29.0,
            BillingPlan::Enterprise => 99.0,
        }
    }

    /// Get included seats
    pub fn included_seats(&self) -> usize {
        match self {
            BillingPlan::Team => 5,
            BillingPlan::Enterprise => 10,
        }
    }

    /// Get max seats
    pub fn max_seats(&self) -> Option<usize> {
        match self {
            BillingPlan::Team => Some(50),
            BillingPlan::Enterprise => None, // Unlimited
        }
    }

    /// Get features
    pub fn features(&self) -> Vec<&'static str> {
        match self {
            BillingPlan::Team => vec![
                "Up to 50 team members",
                "Shared workflows and automations",
                "Team activity logs",
                "Basic support",
                "API access",
            ],
            BillingPlan::Enterprise => vec![
                "Unlimited team members",
                "Advanced security features",
                "Priority support",
                "Custom integrations",
                "SSO and SAML",
                "Advanced analytics",
                "Dedicated account manager",
            ],
        }
    }
}

/// Billing cycle
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BillingCycle {
    Monthly,
    Annual,
}

impl BillingCycle {
    pub fn as_str(&self) -> &'static str {
        match self {
            BillingCycle::Monthly => "monthly",
            BillingCycle::Annual => "annual",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "monthly" => Some(BillingCycle::Monthly),
            "annual" => Some(BillingCycle::Annual),
            _ => None,
        }
    }

    /// Get discount multiplier (annual gets 20% discount)
    pub fn discount_multiplier(&self) -> f64 {
        match self {
            BillingCycle::Monthly => 1.0,
            BillingCycle::Annual => 0.8, // 20% discount
        }
    }
}

/// Usage metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageMetrics {
    pub workflow_executions: i64,
    pub automation_runs: i64,
    pub api_calls: i64,
    pub storage_used_gb: f64,
    pub compute_hours: f64,
    pub llm_tokens_used: i64,
}

impl Default for UsageMetrics {
    fn default() -> Self {
        Self {
            workflow_executions: 0,
            automation_runs: 0,
            api_calls: 0,
            storage_used_gb: 0.0,
            compute_hours: 0.0,
            llm_tokens_used: 0,
        }
    }
}

/// Team billing structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamBilling {
    pub team_id: String,
    pub plan_tier: BillingPlan,
    pub billing_cycle: BillingCycle,
    pub seat_count: usize,
    pub stripe_subscription_id: Option<String>,
    pub usage_metrics: UsageMetrics,
    pub next_billing_date: Option<i64>,
    pub current_period_start: Option<i64>,
    pub current_period_end: Option<i64>,
}

/// Team billing manager
pub struct TeamBillingManager {
    db: Arc<Mutex<Connection>>,
}

impl TeamBillingManager {
    /// Create a new TeamBillingManager
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        Self { db }
    }

    /// Initialize billing for a new team
    pub fn initialize_team_billing(
        &self,
        team_id: &str,
        plan_tier: BillingPlan,
        billing_cycle: BillingCycle,
        seat_count: usize,
    ) -> Result<TeamBilling, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;
        let now = chrono::Utc::now().timestamp();

        let usage_metrics = UsageMetrics::default();
        let usage_json = serde_json::to_string(&usage_metrics)
            .map_err(|e| format!("Failed to serialize usage metrics: {}", e))?;

        // Calculate next billing date based on cycle
        let next_billing_date = match billing_cycle {
            BillingCycle::Monthly => now + (30 * 24 * 60 * 60),
            BillingCycle::Annual => now + (365 * 24 * 60 * 60),
        };

        conn.execute(
            "INSERT INTO team_billing (team_id, plan_tier, billing_cycle, seat_count, usage_metrics, next_billing_date, current_period_start, current_period_end)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                team_id,
                plan_tier.as_str(),
                billing_cycle.as_str(),
                seat_count as i64,
                usage_json,
                next_billing_date,
                now,
                next_billing_date
            ],
        ).map_err(|e| format!("Failed to initialize billing: {}", e))?;

        Ok(TeamBilling {
            team_id: team_id.to_string(),
            plan_tier,
            billing_cycle,
            seat_count,
            stripe_subscription_id: None,
            usage_metrics,
            next_billing_date: Some(next_billing_date),
            current_period_start: Some(now),
            current_period_end: Some(next_billing_date),
        })
    }

    /// Get team billing information
    pub fn get_team_billing(&self, team_id: &str) -> Result<Option<TeamBilling>, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT team_id, plan_tier, billing_cycle, seat_count, stripe_subscription_id,
                        usage_metrics, next_billing_date, current_period_start, current_period_end
                 FROM team_billing
                 WHERE team_id = ?1",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let billing = stmt
            .query_row(params![team_id], |row| {
                let plan_str: String = row.get(1)?;
                let plan_tier = BillingPlan::from_str(&plan_str).unwrap_or(BillingPlan::Team);

                let cycle_str: String = row.get(2)?;
                let billing_cycle =
                    BillingCycle::from_str(&cycle_str).unwrap_or(BillingCycle::Monthly);

                let usage_json: String = row.get(5)?;
                let usage_metrics: UsageMetrics =
                    serde_json::from_str(&usage_json).unwrap_or_default();

                Ok(TeamBilling {
                    team_id: row.get(0)?,
                    plan_tier,
                    billing_cycle,
                    seat_count: row.get::<_, i64>(3)? as usize,
                    stripe_subscription_id: row.get(4)?,
                    usage_metrics,
                    next_billing_date: row.get(6)?,
                    current_period_start: row.get(7)?,
                    current_period_end: row.get(8)?,
                })
            })
            .optional()
            .map_err(|e| format!("Failed to get billing: {}", e))?;

        Ok(billing)
    }

    /// Update team plan
    pub fn update_team_plan(&self, team_id: &str, new_plan: BillingPlan) -> Result<(), String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        // Check max seats limit
        let current_seat_count: i64 = conn
            .query_row(
                "SELECT seat_count FROM team_billing WHERE team_id = ?1",
                params![team_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to get current seat count: {}", e))?;

        if let Some(max_seats) = new_plan.max_seats() {
            if current_seat_count as usize > max_seats {
                return Err(format!(
                    "Current seat count ({}) exceeds new plan limit ({})",
                    current_seat_count, max_seats
                ));
            }
        }

        conn.execute(
            "UPDATE team_billing SET plan_tier = ?1 WHERE team_id = ?2",
            params![new_plan.as_str(), team_id],
        )
        .map_err(|e| format!("Failed to update plan: {}", e))?;

        Ok(())
    }

    /// Update billing cycle
    pub fn update_billing_cycle(
        &self,
        team_id: &str,
        new_cycle: BillingCycle,
    ) -> Result<(), String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;
        let now = chrono::Utc::now().timestamp();

        // Calculate new next billing date
        let next_billing_date = match new_cycle {
            BillingCycle::Monthly => now + (30 * 24 * 60 * 60),
            BillingCycle::Annual => now + (365 * 24 * 60 * 60),
        };

        conn.execute(
            "UPDATE team_billing SET billing_cycle = ?1, next_billing_date = ?2, current_period_start = ?3, current_period_end = ?4
             WHERE team_id = ?5",
            params![new_cycle.as_str(), next_billing_date, now, next_billing_date, team_id],
        ).map_err(|e| format!("Failed to update billing cycle: {}", e))?;

        Ok(())
    }

    /// Add seats to team
    pub fn add_seats(&self, team_id: &str, count: usize) -> Result<(), String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        // Get current billing info
        let (current_seats, plan_str): (i64, String) = conn
            .query_row(
                "SELECT seat_count, plan_tier FROM team_billing WHERE team_id = ?1",
                params![team_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| format!("Failed to get billing info: {}", e))?;

        let plan = BillingPlan::from_str(&plan_str).unwrap_or(BillingPlan::Team);
        let new_seat_count = current_seats as usize + count;

        // Check max seats limit
        if let Some(max_seats) = plan.max_seats() {
            if new_seat_count > max_seats {
                return Err(format!(
                    "Cannot add {} seats. New total ({}) would exceed plan limit ({})",
                    count, new_seat_count, max_seats
                ));
            }
        }

        conn.execute(
            "UPDATE team_billing SET seat_count = ?1 WHERE team_id = ?2",
            params![new_seat_count as i64, team_id],
        )
        .map_err(|e| format!("Failed to add seats: {}", e))?;

        Ok(())
    }

    /// Remove seats from team
    pub fn remove_seats(&self, team_id: &str, count: usize) -> Result<(), String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        // Get current seat count and member count
        let current_seats: i64 = conn
            .query_row(
                "SELECT seat_count FROM team_billing WHERE team_id = ?1",
                params![team_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to get seat count: {}", e))?;

        let member_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM team_members WHERE team_id = ?1",
                params![team_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to count members: {}", e))?;

        let new_seat_count = (current_seats as usize).saturating_sub(count);

        // Cannot reduce below current member count
        if (new_seat_count as i64) < member_count {
            return Err(format!(
                "Cannot remove {} seats. New total ({}) would be less than current members ({})",
                count, new_seat_count, member_count
            ));
        }

        conn.execute(
            "UPDATE team_billing SET seat_count = ?1 WHERE team_id = ?2",
            params![new_seat_count as i64, team_id],
        )
        .map_err(|e| format!("Failed to remove seats: {}", e))?;

        Ok(())
    }

    /// Update usage metrics
    pub fn update_usage_metrics(&self, team_id: &str, metrics: UsageMetrics) -> Result<(), String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        let metrics_json = serde_json::to_string(&metrics)
            .map_err(|e| format!("Failed to serialize metrics: {}", e))?;

        conn.execute(
            "UPDATE team_billing SET usage_metrics = ?1 WHERE team_id = ?2",
            params![metrics_json, team_id],
        )
        .map_err(|e| format!("Failed to update usage metrics: {}", e))?;

        Ok(())
    }

    /// Increment usage metric
    pub fn increment_usage(
        &self,
        team_id: &str,
        metric: UsageMetricType,
        amount: i64,
    ) -> Result<(), String> {
        let billing = self
            .get_team_billing(team_id)?
            .ok_or_else(|| "Team billing not found".to_string())?;

        let mut metrics = billing.usage_metrics;

        match metric {
            UsageMetricType::WorkflowExecutions => metrics.workflow_executions += amount,
            UsageMetricType::AutomationRuns => metrics.automation_runs += amount,
            UsageMetricType::ApiCalls => metrics.api_calls += amount,
            UsageMetricType::LlmTokens => metrics.llm_tokens_used += amount,
        }

        self.update_usage_metrics(team_id, metrics)
    }

    /// Calculate team cost
    pub fn calculate_team_cost(&self, team_id: &str) -> Result<f64, String> {
        let billing = self
            .get_team_billing(team_id)?
            .ok_or_else(|| "Team billing not found".to_string())?;

        let base_price = billing.plan_tier.price_per_seat();
        let seat_count = billing.seat_count;
        let discount = billing.billing_cycle.discount_multiplier();

        let monthly_cost = base_price * seat_count as f64 * discount;

        let total_cost = match billing.billing_cycle {
            BillingCycle::Monthly => monthly_cost,
            BillingCycle::Annual => monthly_cost * 12.0,
        };

        Ok(total_cost)
    }

    /// Update Stripe subscription ID
    pub fn update_stripe_subscription(
        &self,
        team_id: &str,
        subscription_id: String,
    ) -> Result<(), String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        conn.execute(
            "UPDATE team_billing SET stripe_subscription_id = ?1 WHERE team_id = ?2",
            params![subscription_id, team_id],
        )
        .map_err(|e| format!("Failed to update subscription ID: {}", e))?;

        Ok(())
    }

    /// Get usage summary
    pub fn get_usage_summary(&self, team_id: &str) -> Result<UsageSummary, String> {
        let billing = self
            .get_team_billing(team_id)?
            .ok_or_else(|| "Team billing not found".to_string())?;

        let cost = self.calculate_team_cost(team_id)?;

        Ok(UsageSummary {
            plan_name: format!("{:?} Plan", billing.plan_tier),
            billing_cycle: billing.billing_cycle,
            seat_count: billing.seat_count,
            cost_per_period: cost,
            usage_metrics: billing.usage_metrics,
            next_billing_date: billing.next_billing_date,
        })
    }
}

/// Usage metric type
#[derive(Debug, Clone, Copy)]
pub enum UsageMetricType {
    WorkflowExecutions,
    AutomationRuns,
    ApiCalls,
    LlmTokens,
}

/// Usage summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageSummary {
    pub plan_name: String,
    pub billing_cycle: BillingCycle,
    pub seat_count: usize,
    pub cost_per_period: f64,
    pub usage_metrics: UsageMetrics,
    pub next_billing_date: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_test_db() -> Arc<Mutex<Connection>> {
        let conn = Connection::open_in_memory().unwrap();

        conn.execute(
            "CREATE TABLE team_billing (
                team_id TEXT PRIMARY KEY,
                plan_tier TEXT NOT NULL,
                billing_cycle TEXT NOT NULL,
                seat_count INTEGER NOT NULL DEFAULT 1,
                stripe_subscription_id TEXT,
                usage_metrics TEXT,
                next_billing_date INTEGER,
                current_period_start INTEGER,
                current_period_end INTEGER
            )",
            [],
        )
        .unwrap();

        conn.execute(
            "CREATE TABLE team_members (
                team_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                role TEXT NOT NULL,
                PRIMARY KEY (team_id, user_id)
            )",
            [],
        )
        .unwrap();

        Arc::new(Mutex::new(conn))
    }

    #[test]
    fn test_initialize_billing() {
        let db = setup_test_db();
        let manager = TeamBillingManager::new(db);

        let billing = manager
            .initialize_team_billing("team123", BillingPlan::Team, BillingCycle::Monthly, 5)
            .unwrap();

        assert_eq!(billing.plan_tier, BillingPlan::Team);
        assert_eq!(billing.seat_count, 5);
    }

    #[test]
    fn test_calculate_cost() {
        let db = setup_test_db();
        let manager = TeamBillingManager::new(db);

        manager
            .initialize_team_billing("team123", BillingPlan::Team, BillingCycle::Monthly, 5)
            .unwrap();

        let cost = manager.calculate_team_cost("team123").unwrap();
        assert_eq!(cost, 29.0 * 5.0); // $29 per seat * 5 seats
    }

    #[test]
    fn test_add_seats() {
        let db = setup_test_db();
        let manager = TeamBillingManager::new(db);

        manager
            .initialize_team_billing("team123", BillingPlan::Team, BillingCycle::Monthly, 5)
            .unwrap();

        manager.add_seats("team123", 3).unwrap();

        let billing = manager.get_team_billing("team123").unwrap().unwrap();
        assert_eq!(billing.seat_count, 8);
    }

    #[test]
    fn test_annual_discount() {
        let db = setup_test_db();
        let manager = TeamBillingManager::new(db);

        manager
            .initialize_team_billing("team123", BillingPlan::Team, BillingCycle::Annual, 5)
            .unwrap();

        let cost = manager.calculate_team_cost("team123").unwrap();
        let expected = 29.0 * 5.0 * 0.8 * 12.0; // 20% discount + 12 months
        assert_eq!(cost, expected);
    }
}
