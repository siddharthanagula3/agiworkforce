use serde::{Deserialize, Serialize};

/// Canonical billing taxonomy (matches
/// `packages/contracts/types/src/billing-catalog.ts`).
///
/// `basic` replaced `hobby` on 2026-07-02 (see `packages/contracts/types/src/design-system/user-identity.ts`);
/// `pro_plus` was removed the same day with no successor.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum PlanTier {
    #[serde(rename = "local-only")]
    LocalOnly,
    #[serde(rename = "byok")]
    Byok,
    #[serde(rename = "basic", alias = "hobby")]
    Basic,
    #[serde(rename = "pro")]
    Pro,
    #[serde(rename = "max")]
    Max,
    #[serde(rename = "max_15x", alias = "max-15x", alias = "max15x")]
    Max15x,
    #[serde(rename = "team")]
    Team,
    #[serde(rename = "enterprise")]
    Enterprise,
    /// Legacy alias retained for backward compatibility with older rows.
    #[serde(rename = "free")]
    Free,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct UserSubscription {
    pub tier: PlanTier,
    pub credits_total: f64,
    pub credits_used: f64,
    pub renewal_date: String,
}

impl UserSubscription {
    pub fn has_cloud_access(&self) -> bool {
        !matches!(self.tier, PlanTier::LocalOnly)
    }
}
