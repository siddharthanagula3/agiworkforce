use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum PlanTier {
    Hobby,
    Pro,
    Max,
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
        !matches!(self.tier, PlanTier::Hobby)
    }
}
