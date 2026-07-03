use serde::{Deserialize, Serialize};

/// Canonical 6-tier taxonomy (matches cloud subscription tier strings):
/// `local-only`, `byok`, `basic`, `pro`, `max`, `enterprise`.  `Free` is
/// retained as a backward-compat alias for legacy rows.  Any other string
/// would deserialize-fail before the variants below were added.
///
/// `basic` replaced `hobby` on 2026-07-02 (see `packages/types/src/design-system/user-identity.ts`);
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
    /// Cloud LLM access is denied only for `LocalOnly` (Ollama/LMStudio only, no managed cloud).
    /// Basic IS the first paid cloud tier — it must NOT be blocked here.
    /// Byok and all higher tiers get cloud access (Byok: user's own key; Basic+: managed credits).
    pub fn has_cloud_access(&self) -> bool {
        !matches!(self.tier, PlanTier::LocalOnly)
    }
}
