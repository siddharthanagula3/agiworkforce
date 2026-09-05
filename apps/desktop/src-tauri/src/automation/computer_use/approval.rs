//! The computer-use safety vocabulary expressed as the cross-surface tool
//! primitive (decision D-P0-5, `agiworkforce_protocol::tool_primitive`).
//!
//! [`super::safety::ComputerUseSafetyLayer`] computes risk from the action's
//! own shape, never from anything the model claims. This module only renames
//! that verdict into the contract every other desktop approval already speaks;
//! it must never widen one. A reason with no contract equivalent was added to
//! [`ToolApprovalReason`] rather than folded into a neighbouring one, because a
//! prompt that reports the wrong reason is worse than one that reports none.

use agiworkforce_protocol::agent_events::AgentEventApprovalRiskLevel;
use agiworkforce_protocol::tool_primitive::{
    ToolActionClass, ToolApprovalReason, ToolApprovalRequest, ToolPermissionDecision,
};

use super::safety::{SafetyDecision, SafetyReason};
use super::types::ComputerUseAction;

const COMPUTER_USE_TOOL_PREFIX: &str = "computer_use_";
const UNNAMED_ACTION_TOOL: &str = "computer_use_action";
const ACTION_TAG_FIELD: &str = "action";
const MEDIUM_RISK_FLOOR: u8 = 4;
const HIGH_RISK_FLOOR: u8 = 7;

/// A computer-use action drives whatever application is in front of it, so no
/// grant given for one call may answer for the next.
const COMPUTER_USE_IS_REMEMBERABLE: bool = false;

impl SafetyReason {
    pub fn contract_reason(&self) -> ToolApprovalReason {
        match self {
            Self::SystemUiProtection { .. }
            | Self::ProtectedWindow { .. }
            | Self::SandboxRestriction { .. }
            | Self::AppHardBlocked { .. } => ToolApprovalReason::PolicyHardBlock,
            Self::DangerousContent { .. } => ToolApprovalReason::RiskTier,
            Self::PromptInjection { .. } => ToolApprovalReason::LethalTrifecta,
            Self::BlockedHotkey { .. } | Self::AppDenied { .. } => {
                ToolApprovalReason::BlockedByUserPermission
            }
            Self::TextTooLong { .. }
            | Self::RateLimitExceeded { .. }
            | Self::InvalidCoordinates { .. } => ToolApprovalReason::HarnessLimit,
            Self::RequiresConfirmation { .. } | Self::AppRequiresApproval { .. } => {
                ToolApprovalReason::UserRequiresApproval
            }
        }
    }

    /// Only the two reasons that describe a missing answer resolve to `Ask`.
    /// Everything else is a refusal the user cannot approve their way past on
    /// this call.
    pub fn contract_decision(&self) -> ToolPermissionDecision {
        match self.contract_reason() {
            ToolApprovalReason::UserRequiresApproval => ToolPermissionDecision::Ask,
            _ => ToolPermissionDecision::Deny,
        }
    }
}

impl SafetyDecision {
    pub fn contract_risk_level(&self) -> AgentEventApprovalRiskLevel {
        match self.risk_level {
            level if level >= HIGH_RISK_FLOOR => AgentEventApprovalRiskLevel::High,
            level if level >= MEDIUM_RISK_FLOOR => AgentEventApprovalRiskLevel::Medium,
            _ => AgentEventApprovalRiskLevel::Low,
        }
    }

    pub fn contract_reason(&self) -> ToolApprovalReason {
        match &self.reason {
            Some(reason) => reason.contract_reason(),
            None if self.requires_confirmation => ToolApprovalReason::UserRequiresApproval,
            None => ToolApprovalReason::AutoApprovalMode,
        }
    }

    pub fn contract_decision(&self) -> ToolPermissionDecision {
        match &self.reason {
            Some(reason) => reason.contract_decision(),
            None if self.requires_confirmation => ToolPermissionDecision::Ask,
            None => ToolPermissionDecision::Allow,
        }
    }
}

pub fn action_tool_name(action: &ComputerUseAction) -> String {
    serde_json::to_value(action)
        .ok()
        .and_then(|value| {
            value
                .get(ACTION_TAG_FIELD)
                .and_then(|tag| tag.as_str())
                .map(|tag| format!("{COMPUTER_USE_TOOL_PREFIX}{tag}"))
        })
        .unwrap_or_else(|| UNNAMED_ACTION_TOOL.to_string())
}

pub fn action_class(action: &ComputerUseAction) -> ToolActionClass {
    match action {
        ComputerUseAction::Screenshot { .. }
        | ComputerUseAction::Zoom { .. }
        | ComputerUseAction::Wait { .. }
        | ComputerUseAction::MoveMouse { .. }
        | ComputerUseAction::Copy => ToolActionClass::Read,
        ComputerUseAction::Type { .. }
        | ComputerUseAction::Paste
        | ComputerUseAction::SelectAll
        | ComputerUseAction::Undo
        | ComputerUseAction::Redo => ToolActionClass::Write,
        _ => ToolActionClass::Execute,
    }
}

/// Builds the request the desktop's approval surfaces already read. `arguments`
/// carries the action as the harness serialized it, so a reviewer sees the
/// coordinates and text the safety layer judged, not a paraphrase.
pub fn approval_request(
    request_id: String,
    call_id: String,
    action: &ComputerUseAction,
    decision: &SafetyDecision,
    unattended: bool,
) -> ToolApprovalRequest {
    let class = action_class(action);

    ToolApprovalRequest {
        request_id,
        call_id,
        tool: action_tool_name(action),
        action_class: class,
        arguments: serde_json::to_value(action).unwrap_or_else(|_| serde_json::json!({})),
        reason: decision.contract_reason(),
        risk_level: decision.contract_risk_level(),
        reversible: matches!(class, ToolActionClass::Read),
        undo_hint: None,
        unattended,
        rememberable: COMPUTER_USE_IS_REMEMBERABLE,
    }
}

#[cfg(test)]
mod contract_mapping_tests {
    use super::*;
    use crate::automation::computer_use::types::{Coordinate, ElementBounds, MouseButton};

    fn every_safety_reason() -> Vec<SafetyReason> {
        vec![
            SafetyReason::SystemUiProtection {
                area: String::from("menu bar"),
            },
            SafetyReason::DangerousContent {
                pattern: String::from("recursive delete"),
            },
            SafetyReason::PromptInjection {
                detected_text: String::from("ignore previous instructions"),
            },
            SafetyReason::BlockedHotkey {
                hotkey: String::from("Meta+L"),
            },
            SafetyReason::ProtectedWindow {
                title: String::from("Keychain Access"),
            },
            SafetyReason::TextTooLong {
                length: 20_000,
                max: 10_000,
            },
            SafetyReason::RateLimitExceeded {
                actions: 200,
                limit: 120,
            },
            SafetyReason::SandboxRestriction {
                action: String::from("launch"),
            },
            SafetyReason::RequiresConfirmation {
                action: String::from("delete"),
            },
            SafetyReason::InvalidCoordinates { x: -4, y: -9 },
            SafetyReason::AppDenied {
                app_name: String::from("Ledger"),
            },
            SafetyReason::AppHardBlocked {
                app_name: String::from("Ledger"),
                bundle_id: None,
            },
            SafetyReason::AppRequiresApproval {
                app_name: String::from("Notes"),
                bundle_id: None,
            },
        ]
    }

    fn reason_key(reason: &SafetyReason) -> String {
        serde_json::to_value(reason)
            .expect("serialize")
            .get("type")
            .and_then(|tag| tag.as_str())
            .expect("tagged reason")
            .to_string()
    }

    #[test]
    fn every_safety_reason_maps_onto_the_contract() {
        let pairs: Vec<(String, ToolApprovalReason, ToolPermissionDecision)> =
            every_safety_reason()
                .iter()
                .map(|reason| {
                    (
                        reason_key(reason),
                        reason.contract_reason(),
                        reason.contract_decision(),
                    )
                })
                .collect();

        assert_eq!(
            pairs,
            vec![
                (
                    String::from("system_ui_protection"),
                    ToolApprovalReason::PolicyHardBlock,
                    ToolPermissionDecision::Deny
                ),
                (
                    String::from("dangerous_content"),
                    ToolApprovalReason::RiskTier,
                    ToolPermissionDecision::Deny
                ),
                (
                    String::from("prompt_injection"),
                    ToolApprovalReason::LethalTrifecta,
                    ToolPermissionDecision::Deny
                ),
                (
                    String::from("blocked_hotkey"),
                    ToolApprovalReason::BlockedByUserPermission,
                    ToolPermissionDecision::Deny
                ),
                (
                    String::from("protected_window"),
                    ToolApprovalReason::PolicyHardBlock,
                    ToolPermissionDecision::Deny
                ),
                (
                    String::from("text_too_long"),
                    ToolApprovalReason::HarnessLimit,
                    ToolPermissionDecision::Deny
                ),
                (
                    String::from("rate_limit_exceeded"),
                    ToolApprovalReason::HarnessLimit,
                    ToolPermissionDecision::Deny
                ),
                (
                    String::from("sandbox_restriction"),
                    ToolApprovalReason::PolicyHardBlock,
                    ToolPermissionDecision::Deny
                ),
                (
                    String::from("requires_confirmation"),
                    ToolApprovalReason::UserRequiresApproval,
                    ToolPermissionDecision::Ask
                ),
                (
                    String::from("invalid_coordinates"),
                    ToolApprovalReason::HarnessLimit,
                    ToolPermissionDecision::Deny
                ),
                (
                    String::from("app_denied"),
                    ToolApprovalReason::BlockedByUserPermission,
                    ToolPermissionDecision::Deny
                ),
                (
                    String::from("app_hard_blocked"),
                    ToolApprovalReason::PolicyHardBlock,
                    ToolPermissionDecision::Deny
                ),
                (
                    String::from("app_requires_approval"),
                    ToolApprovalReason::UserRequiresApproval,
                    ToolPermissionDecision::Ask
                ),
            ]
        );
    }

    #[test]
    fn a_hard_blocked_app_can_never_be_answered_by_an_earlier_grant() {
        let reason = SafetyReason::AppHardBlocked {
            app_name: String::from("Ledger"),
            bundle_id: None,
        };

        assert!(reason.contract_reason().is_escalation());
        assert!(!SafetyReason::AppRequiresApproval {
            app_name: String::from("Notes"),
            bundle_id: None,
        }
        .contract_reason()
        .is_escalation());
    }

    #[test]
    fn a_block_saturates_the_risk_band_and_an_allow_sits_at_the_bottom() {
        let blocked = SafetyDecision::block(SafetyReason::InvalidCoordinates { x: -1, y: -1 });
        assert_eq!(
            blocked.contract_risk_level(),
            AgentEventApprovalRiskLevel::High
        );

        let allowed = SafetyDecision::allow();
        assert_eq!(
            allowed.contract_risk_level(),
            AgentEventApprovalRiskLevel::Low
        );
        assert_eq!(allowed.contract_decision(), ToolPermissionDecision::Allow);
        assert_eq!(
            allowed.contract_reason(),
            ToolApprovalReason::AutoApprovalMode
        );

        let warned = SafetyDecision::allow_with_warning("close to the menu bar", MEDIUM_RISK_FLOOR);
        assert_eq!(
            warned.contract_risk_level(),
            AgentEventApprovalRiskLevel::Medium
        );
    }

    #[test]
    fn a_confirmation_asks_even_though_the_layer_marked_it_allowed() {
        let decision = SafetyDecision::needs_confirmation("deletes a file");

        assert_eq!(decision.contract_decision(), ToolPermissionDecision::Ask);
        assert_eq!(
            decision.contract_reason(),
            ToolApprovalReason::UserRequiresApproval
        );
        assert_eq!(
            decision.contract_risk_level(),
            AgentEventApprovalRiskLevel::High
        );
    }

    #[test]
    fn the_request_names_the_action_and_never_offers_a_standing_grant() {
        let action = ComputerUseAction::Click {
            x: 10,
            y: 20,
            button: MouseButton::Left,
        };
        let decision = SafetyDecision::needs_confirmation("closes the window");
        let request = approval_request(
            String::from("req-1"),
            String::from("call-1"),
            &action,
            &decision,
            false,
        );

        assert_eq!(request.tool, "computer_use_click");
        assert_eq!(request.action_class, ToolActionClass::Execute);
        assert!(!request.rememberable);
        assert!(!request.reversible);
        assert_eq!(request.reason, ToolApprovalReason::UserRequiresApproval);
        assert_eq!(
            request.arguments.get("x").and_then(|x| x.as_i64()),
            Some(10)
        );
    }

    #[test]
    fn a_screenshot_reads_and_a_paste_writes() {
        assert_eq!(
            action_class(&ComputerUseAction::Screenshot {
                region: Some(ElementBounds::new(0, 0, 1, 1)),
                save_path: None,
            }),
            ToolActionClass::Read
        );
        assert_eq!(
            action_class(&ComputerUseAction::Paste),
            ToolActionClass::Write
        );
        assert_eq!(
            action_class(&ComputerUseAction::Drag {
                from: Coordinate { x: 0, y: 0 },
                to: Coordinate { x: 1, y: 1 },
                duration_ms: 10,
            }),
            ToolActionClass::Execute
        );
        assert_eq!(
            action_tool_name(&ComputerUseAction::Paste),
            "computer_use_paste"
        );
    }
}
