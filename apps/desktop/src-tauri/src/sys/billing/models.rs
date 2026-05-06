use serde::{Deserialize, Serialize};

/// Canonical 6-tier taxonomy (matches Supabase `subscriptions.tier` strings):
/// `local-only`, `byok`, `hobby`, `pro`, `max`, `enterprise`.  `Free` is
/// retained as a backward-compat alias for legacy rows.  Any other string
/// would deserialize-fail before the variants below were added.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum PlanTier {
    #[serde(rename = "local-only")]
    LocalOnly,
    #[serde(rename = "byok")]
    Byok,
    #[serde(rename = "hobby")]
    Hobby,
    #[serde(rename = "pro")]
    Pro,
    #[serde(rename = "max")]
    Max,
    #[serde(rename = "enterprise")]
    Enterprise,
    /// Legacy alias retained for backward compatibility with older Supabase rows.
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
    /// Cloud LLM access is denied only for `LocalOnly` (Ollama/LMStudio only, no managed cloud).
    /// Hobby IS the first paid cloud tier — it must NOT be blocked here.
    /// Byok and all higher tiers get cloud access (Byok: user's own key; Hobby+: managed credits).
    pub fn has_cloud_access(&self) -> bool {
        !matches!(self.tier, PlanTier::LocalOnly)
    }
}
