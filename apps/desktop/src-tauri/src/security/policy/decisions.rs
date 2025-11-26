/// Policy decisions and risk levels
use serde::{Deserialize, Serialize};

/// The decision made by the policy engine
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "decision", rename_all = "snake_case")]
pub enum PolicyDecision {
    /// Allow the action without user confirmation
    Allow {
        /// Optional reason/context for the decision
        reason: Option<String>,
    },
    /// Require user approval before proceeding
    RequireApproval {
        /// Risk level of this action
        risk_level: RiskLevel,
        /// Explanation for the user
        reason: String,
        /// Can the user remember this decision for future similar actions?
        allow_remember: bool,
    },
    /// Deny the action
    Deny {
        /// Explanation why this was denied
        reason: String,
        /// Can this be overridden by elevating trust level?
        can_elevate: bool,
    },
}

/// User's trust level - determines how permissive the policy is
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TrustLevel {
    /// Normal mode - restrictive, workspace-scoped, many approvals required
    /// Suitable for general use and untrusted automation
    Normal,

    /// Elevated mode - fewer approvals, broader scope
    /// User has explicitly granted more trust for a workspace/session
    Elevated,

    /// Full system mode - minimal restrictions, comprehensive logging
    /// User wants the agent to act like a full human operator
    /// This mode should be clearly marked in UI with warnings
    FullSystem,
}

impl Default for TrustLevel {
    fn default() -> Self {
        TrustLevel::Normal
    }
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

/// Risk level of a specific action
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    /// Low risk - read operations in workspace, benign automation
    Low,
    /// Medium risk - write operations in workspace, external network calls
    Medium,
    /// High risk - operations outside workspace, database modifications, destructive commands
    High,
    /// Critical risk - system-level changes, bulk deletions, credential access
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
