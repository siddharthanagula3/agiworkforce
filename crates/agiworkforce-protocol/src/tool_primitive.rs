//! The one tool primitive every surface maps onto (decision D-P0-5).
//!
//! Web owns the vocabulary this contract adopts: `actionClass` over
//! read/write/delete/execute/external_send, an allow/ask/deny verdict, and the
//! lethal-trifecta escalation as a first-class reason. Desktop's `RiskLevel`
//! and `ToolSafetyTier`, the CLI's `execpolicy::Decision`, the shared
//! `agiworkforce-llm` `ToolDefinition`, and the MCP catalog descriptor map onto
//! it rather than replacing it.
//!
//! This module is the policy contract. [`crate::agent_events`] is the
//! user-facing streaming projection of the same run, so the two share
//! [`AgentEventToolCategory`] and [`AgentEventApprovalRiskLevel`] instead of
//! growing a second category or severity vocabulary.

use agiworkforce_execpolicy::Decision as ExecPolicyDecision;
use schemars::JsonSchema;
use serde::Deserialize;
use serde::Serialize;
use ts_rs::TS;

use crate::agent_events::AgentEventApprovalDecision;
use crate::agent_events::AgentEventApprovalRiskLevel;
use crate::agent_events::AgentEventToolCategory;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum ToolActionClass {
    Read,
    Write,
    Delete,
    Execute,
    ExternalSend,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum ToolRetrySafety {
    Idempotent,
    AtMostOnce,
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum ToolAuthKind {
    None,
    UserSession,
    ConnectorGrant,
    OperatorCredential,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ToolAuthRequirement {
    pub kind: ToolAuthKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub connector_id: Option<String>,
    #[serde(default)]
    pub scopes: Vec<String>,
}

/// What a tool is and what calling it costs the trust boundary.
///
/// `declared` is load-bearing: an undeclared tool must be treated as the most
/// dangerous shape it could be, which is what [`ToolDefinition::undeclared`]
/// builds.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    #[ts(type = "Record<string, unknown>")]
    pub input_schema: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional, type = "Record<string, unknown>")]
    pub output_schema: Option<serde_json::Value>,
    pub category: AgentEventToolCategory,
    pub action_class: ToolActionClass,
    pub auth: ToolAuthRequirement,
    pub reversible: bool,
    pub accepts_untrusted_content: bool,
    pub creates_egress_path: bool,
    pub retry_safety: ToolRetrySafety,
    pub declared: bool,
}

impl ToolDefinition {
    pub fn undeclared(name: String, description: String, input_schema: serde_json::Value) -> Self {
        Self {
            name,
            description,
            input_schema,
            output_schema: None,
            category: AgentEventToolCategory::Other,
            action_class: ToolActionClass::Write,
            auth: ToolAuthRequirement {
                kind: ToolAuthKind::UserSession,
                connector_id: None,
                scopes: Vec::new(),
            },
            reversible: false,
            accepts_untrusted_content: true,
            creates_egress_path: true,
            retry_safety: ToolRetrySafety::Unknown,
            declared: false,
        }
    }

    pub fn is_destructive(&self) -> bool {
        match self.action_class {
            ToolActionClass::Read => false,
            ToolActionClass::Delete | ToolActionClass::ExternalSend => true,
            ToolActionClass::Write | ToolActionClass::Execute => !self.reversible,
        }
    }

    pub fn is_parallel_safe(&self) -> bool {
        self.declared && self.action_class == ToolActionClass::Read
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum ToolPermissionDecision {
    Allow,
    Ask,
    Deny,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum ToolPermissionScope {
    SingleCall,
    Session,
    Account,
    Organization,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ToolPermission {
    pub tool: String,
    pub decision: ToolPermissionDecision,
    pub scope: ToolPermissionScope,
    pub rememberable: bool,
}

impl ToolPermission {
    /// A permission a surface refuses to persist collapses to the call it was
    /// granted for, whatever scope the caller asked for.
    pub fn new(
        tool: String,
        decision: ToolPermissionDecision,
        scope: ToolPermissionScope,
        rememberable: bool,
    ) -> Self {
        Self {
            tool,
            decision,
            scope: if rememberable {
                scope
            } else {
                ToolPermissionScope::SingleCall
            },
            rememberable,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum ToolApprovalReason {
    BlockedByUserPermission,
    AlwaysAllow,
    UserRequiresApproval,
    ManualApprovalMode,
    AutoApprovalMode,
    AccountDefaultReadOnly,
    LethalTrifecta,
    NeverRememberable,
    RiskTier,
    /// A refusal the harness owns outright: no answer to the prompt, and no
    /// grant of any scope, lifts it. Desktop's computer-use layer raises it for
    /// the always-blocked application categories, the protected-window and
    /// system-UI regions, and sandboxed mode.
    PolicyHardBlock,
    /// A bound on the call itself rather than a judgement about the caller:
    /// a rate ceiling, an oversized payload, an out-of-range coordinate.
    HarnessLimit,
}

impl ToolApprovalReason {
    /// An escalation may never be answered by a grant given earlier, and on an
    /// unattended run there is no one to ask, so it denies instead of falling
    /// through to auto-allow.
    pub fn is_escalation(self) -> bool {
        matches!(
            self,
            Self::LethalTrifecta | Self::NeverRememberable | Self::PolicyHardBlock
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ToolApprovalRequest {
    pub request_id: String,
    pub call_id: String,
    pub tool: String,
    pub action_class: ToolActionClass,
    #[ts(type = "Record<string, unknown>")]
    pub arguments: serde_json::Value,
    pub reason: ToolApprovalReason,
    pub risk_level: AgentEventApprovalRiskLevel,
    pub reversible: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub undo_hint: Option<String>,
    pub unattended: bool,
    pub rememberable: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum ToolApprovalOutcome {
    Approved,
    Denied,
    TimedOut,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ToolApprovalDecision {
    pub request_id: String,
    pub outcome: ToolApprovalOutcome,
    pub remember: ToolPermissionScope,
    pub reason: ToolApprovalReason,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum ToolResultStatus {
    Ok,
    Error,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum ToolErrorClass {
    InvalidArguments,
    Unauthorized,
    PermissionDenied,
    NotFound,
    RateLimited,
    Timeout,
    Upstream,
    Cancelled,
    Internal,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum ToolArtifactKind {
    File,
    Image,
    Url,
    Json,
    Text,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ToolArtifact {
    pub id: String,
    pub kind: ToolArtifactKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub mime_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional, type = "number")]
    pub byte_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ToolCostHints {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional, type = "number")]
    pub duration_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional, type = "number")]
    pub input_tokens: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional, type = "number")]
    pub output_tokens: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional, type = "number")]
    pub micro_usd: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ToolResult {
    pub call_id: String,
    pub tool: String,
    pub status: ToolResultStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub error_class: Option<ToolErrorClass>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub message: Option<String>,
    #[serde(default)]
    pub artifacts: Vec<ToolArtifact>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub cost: Option<ToolCostHints>,
}

/// Mirrors `SourceSurface` in `packages/contracts/types/src/suite-contracts.ts`;
/// the TypeScript side asserts the two lists agree.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum ToolSurface {
    Web,
    Desktop,
    Mobile,
    Cli,
    Vscode,
    Chrome,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ToolTraceIds {
    pub call_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub trace_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub span_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub conversation_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub run_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ToolAuditRecord {
    pub occurred_at: String,
    pub surface: ToolSurface,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub user_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub organization_id: Option<String>,
    pub tool: String,
    pub action_class: ToolActionClass,
    pub decision: ToolPermissionDecision,
    pub reason: ToolApprovalReason,
    pub outcome: ToolApprovalOutcome,
    pub status: ToolResultStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub error_class: Option<ToolErrorClass>,
    pub trace: ToolTraceIds,
}

/// The CLI and desktop share `execpolicy` for shell-command risk. It is the
/// only vocabulary that was already cross-surface, and it carries no scope, so
/// it maps to the verdict alone.
impl From<ExecPolicyDecision> for ToolPermissionDecision {
    fn from(decision: ExecPolicyDecision) -> Self {
        match decision {
            ExecPolicyDecision::Allow => Self::Allow,
            ExecPolicyDecision::Prompt => Self::Ask,
            ExecPolicyDecision::Forbidden => Self::Deny,
        }
    }
}

impl From<AgentEventApprovalDecision> for ToolApprovalOutcome {
    fn from(decision: AgentEventApprovalDecision) -> Self {
        match decision {
            AgentEventApprovalDecision::Approved
            | AgentEventApprovalDecision::ApprovedForSession => Self::Approved,
            AgentEventApprovalDecision::Denied => Self::Denied,
            AgentEventApprovalDecision::Cancelled => Self::Cancelled,
        }
    }
}

/// The streaming projection distinguishes a one-shot approval from a
/// session-wide one; nothing wider than a session can be granted from a stream
/// event, so an account or organization scope never originates here.
pub fn remembered_scope(decision: AgentEventApprovalDecision) -> ToolPermissionScope {
    match decision {
        AgentEventApprovalDecision::ApprovedForSession => ToolPermissionScope::Session,
        _ => ToolPermissionScope::SingleCall,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn definition(action_class: ToolActionClass, reversible: bool) -> ToolDefinition {
        ToolDefinition {
            action_class,
            reversible,
            declared: true,
            ..ToolDefinition::undeclared(
                String::from("web_search"),
                String::from("Search the web"),
                serde_json::json!({}),
            )
        }
    }

    fn assert_round_trips<T>(value: &T)
    where
        T: Serialize + for<'de> Deserialize<'de> + PartialEq + std::fmt::Debug,
    {
        let encoded = serde_json::to_string(value).expect("serialize");
        let decoded: T = serde_json::from_str(&encoded).expect("deserialize");
        assert_eq!(value, &decoded);
    }

    #[test]
    fn action_class_wire_names_match_the_web_vocabulary() {
        let encoded = serde_json::to_value([
            ToolActionClass::Read,
            ToolActionClass::Write,
            ToolActionClass::Delete,
            ToolActionClass::Execute,
            ToolActionClass::ExternalSend,
        ])
        .expect("serialize");
        assert_eq!(
            encoded,
            serde_json::json!(["read", "write", "delete", "execute", "external_send"])
        );
    }

    #[test]
    fn an_unknown_action_class_is_rejected() {
        let parsed = serde_json::from_value::<ToolActionClass>(serde_json::json!("publish"));
        assert!(parsed.is_err());
    }

    #[test]
    fn an_unknown_permission_decision_is_rejected() {
        let parsed = serde_json::from_value::<ToolPermissionDecision>(serde_json::json!("prompt"));
        assert!(parsed.is_err());
    }

    #[test]
    fn destructiveness_follows_the_action_class_and_reversibility() {
        assert!(!definition(ToolActionClass::Read, false).is_destructive());
        assert!(definition(ToolActionClass::Delete, true).is_destructive());
        assert!(definition(ToolActionClass::ExternalSend, true).is_destructive());
        assert!(definition(ToolActionClass::Write, false).is_destructive());
        assert!(!definition(ToolActionClass::Write, true).is_destructive());
        assert!(definition(ToolActionClass::Execute, false).is_destructive());
    }

    #[test]
    fn only_a_declared_read_is_parallel_safe() {
        assert!(definition(ToolActionClass::Read, true).is_parallel_safe());
        assert!(!definition(ToolActionClass::Write, true).is_parallel_safe());
        assert!(
            !ToolDefinition::undeclared(
                String::from("mcp__acme__publish"),
                String::new(),
                serde_json::json!({})
            )
            .is_parallel_safe()
        );
    }

    #[test]
    fn an_undeclared_tool_takes_the_most_dangerous_shape() {
        let unknown = ToolDefinition::undeclared(
            String::from("mcp__acme__publish"),
            String::new(),
            serde_json::json!({}),
        );
        assert_eq!(unknown.action_class, ToolActionClass::Write);
        assert!(!unknown.reversible);
        assert!(unknown.accepts_untrusted_content);
        assert!(unknown.creates_egress_path);
        assert!(unknown.is_destructive());
    }

    #[test]
    fn a_permission_that_cannot_be_remembered_collapses_to_the_call() {
        let permission = ToolPermission::new(
            String::from("email_send"),
            ToolPermissionDecision::Allow,
            ToolPermissionScope::Account,
            false,
        );
        assert_eq!(permission.scope, ToolPermissionScope::SingleCall);
    }

    #[test]
    fn execpolicy_decisions_map_onto_the_contract_verdict() {
        assert_eq!(
            ToolPermissionDecision::from(ExecPolicyDecision::Allow),
            ToolPermissionDecision::Allow
        );
        assert_eq!(
            ToolPermissionDecision::from(ExecPolicyDecision::Prompt),
            ToolPermissionDecision::Ask
        );
        assert_eq!(
            ToolPermissionDecision::from(ExecPolicyDecision::Forbidden),
            ToolPermissionDecision::Deny
        );
    }

    #[test]
    fn stream_approvals_map_onto_the_contract_outcome_and_scope() {
        assert_eq!(
            ToolApprovalOutcome::from(AgentEventApprovalDecision::ApprovedForSession),
            ToolApprovalOutcome::Approved
        );
        assert_eq!(
            remembered_scope(AgentEventApprovalDecision::ApprovedForSession),
            ToolPermissionScope::Session
        );
        assert_eq!(
            remembered_scope(AgentEventApprovalDecision::Approved),
            ToolPermissionScope::SingleCall
        );
    }

    #[test]
    fn the_trifecta_and_never_rememberable_reasons_escalate() {
        assert!(ToolApprovalReason::LethalTrifecta.is_escalation());
        assert!(ToolApprovalReason::NeverRememberable.is_escalation());
        assert!(!ToolApprovalReason::AutoApprovalMode.is_escalation());
    }

    #[test]
    fn a_hard_block_escalates_and_a_call_bound_does_not() {
        assert!(ToolApprovalReason::PolicyHardBlock.is_escalation());
        assert!(!ToolApprovalReason::HarnessLimit.is_escalation());
    }

    #[test]
    fn the_new_reasons_carry_their_wire_names() {
        assert_eq!(
            serde_json::to_value([
                ToolApprovalReason::PolicyHardBlock,
                ToolApprovalReason::HarnessLimit,
            ])
            .expect("serialize"),
            serde_json::json!(["policy_hard_block", "harness_limit"])
        );
    }

    #[test]
    fn every_record_round_trips() {
        assert_round_trips(&definition(ToolActionClass::ExternalSend, false));
        assert_round_trips(&ToolPermission::new(
            String::from("web_search"),
            ToolPermissionDecision::Ask,
            ToolPermissionScope::Session,
            true,
        ));
        assert_round_trips(&ToolApprovalRequest {
            request_id: String::from("req-1"),
            call_id: String::from("call-1"),
            tool: String::from("url_fetch"),
            action_class: ToolActionClass::Read,
            arguments: serde_json::json!({ "url": "https://example.invalid" }),
            reason: ToolApprovalReason::LethalTrifecta,
            risk_level: AgentEventApprovalRiskLevel::High,
            reversible: true,
            undo_hint: None,
            unattended: false,
            rememberable: false,
        });
        assert_round_trips(&ToolApprovalDecision {
            request_id: String::from("req-1"),
            outcome: ToolApprovalOutcome::Denied,
            remember: ToolPermissionScope::SingleCall,
            reason: ToolApprovalReason::LethalTrifecta,
        });
        assert_round_trips(&ToolResult {
            call_id: String::from("call-1"),
            tool: String::from("url_fetch"),
            status: ToolResultStatus::Error,
            error_class: Some(ToolErrorClass::RateLimited),
            message: Some(String::from("upstream refused")),
            artifacts: vec![ToolArtifact {
                id: String::from("artifact-1"),
                kind: ToolArtifactKind::Json,
                uri: None,
                mime_type: None,
                byte_size: Some(12),
            }],
            cost: Some(ToolCostHints {
                duration_ms: Some(31),
                input_tokens: None,
                output_tokens: None,
                micro_usd: None,
            }),
        });
        assert_round_trips(&ToolAuditRecord {
            occurred_at: String::from("2026-09-05T00:00:00Z"),
            surface: ToolSurface::Desktop,
            user_id: None,
            organization_id: None,
            tool: String::from("email_send"),
            action_class: ToolActionClass::ExternalSend,
            decision: ToolPermissionDecision::Ask,
            reason: ToolApprovalReason::NeverRememberable,
            outcome: ToolApprovalOutcome::Approved,
            status: ToolResultStatus::Ok,
            error_class: None,
            trace: ToolTraceIds {
                call_id: String::from("call-1"),
                trace_id: None,
                span_id: None,
                conversation_id: None,
                run_id: None,
            },
        });
    }
}
