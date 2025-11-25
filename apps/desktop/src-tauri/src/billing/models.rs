use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum PlanTier {
    Hobby, // Free: Local LLMs only
    Pro,   // $29/mo ($24.99/yr): $20 Cloud Credits/mo + Rollover
    Max,   // $299/mo: $300 Cloud Credits/mo + Priority Support
}

#[derive(Serialize, Deserialize, Debug)]
pub struct UserSubscription {
    pub tier: PlanTier,
    pub credits_total: f64, // Base + Rollover
    pub credits_used: f64,
    pub renewal_date: String,
}

impl UserSubscription {
    pub fn has_cloud_access(&self) -> bool {
        match self.tier {
            PlanTier::Hobby => false,
            _ => true,
        }
    }
}
