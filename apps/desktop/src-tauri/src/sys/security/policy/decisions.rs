use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "decision", rename_all = "snake_case")]
pub enum PolicyDecision {
    Allow {
        reason: Option<String>,
    },

    RequireApproval {
        risk_level: RiskLevel,

        reason: String,

        allow_remember: bool,
    },

    Deny {
        reason: String,

        can_elevate: bool,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[derive(Default)]
pub enum TrustLevel {
    #[default]
    Normal,

    Elevated,

    FullSystem,
}

impl TrustLevel {
    pub fn description(&self) -> &'static str {
        match self {
            TrustLevel::Normal => "Standard security mode - workspace-scoped access with approval prompts for sensitive operations",
            TrustLevel::Elevated => "Elevated access - broader permissions with reduced approval prompts",
            TrustLevel::FullSystem => "Full system access - agent can perform any operation a human can, with comprehensive audit logging",
        }
    }

    pub fn is_elevated(&self) -> bool {
        matches!(self, TrustLevel::Elevated | TrustLevel::FullSystem)
    }

    pub fn is_full_system(&self) -> bool {
        matches!(self, TrustLevel::FullSystem)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    Low,

    Medium,

    High,

    Critical,
}

impl RiskLevel {
    pub fn description(&self) -> &'static str {
        match self {
            RiskLevel::Low => "Low risk operation",
            RiskLevel::Medium => "Medium risk operation",
            RiskLevel::High => "High risk operation - requires careful review",
            RiskLevel::Critical => "Critical risk operation - potentially dangerous",
        }
    }

    pub fn color(&self) -> &'static str {
        match self {
            RiskLevel::Low => "green",
            RiskLevel::Medium => "yellow",
            RiskLevel::High => "orange",
            RiskLevel::Critical => "red",
        }
    }
}

impl PolicyDecision {
    pub fn is_allowed(&self) -> bool {
        matches!(self, PolicyDecision::Allow { .. })
    }

    pub fn requires_approval(&self) -> bool {
        matches!(self, PolicyDecision::RequireApproval { .. })
    }

    pub fn is_denied(&self) -> bool {
        matches!(self, PolicyDecision::Deny { .. })
    }

    pub fn reason(&self) -> Option<&str> {
        match self {
            PolicyDecision::Allow { reason } => reason.as_deref(),
            PolicyDecision::RequireApproval { reason, .. } => Some(reason.as_str()),
            PolicyDecision::Deny { reason, .. } => Some(reason.as_str()),
        }
    }
}
