//! One planned step, read as something a driver can address.
//!
//! The visual loop plans in screen coordinates, which no driver below vision
//! can act on. A step that also names the control it addresses can be tried on
//! the api, accessibility and DOM tiers first, and the coordinates it carries
//! become the fallback rather than the first resort. Two verbs, a read and a
//! navigation, have no raw form in the loop's vocabulary at all: a tier drives
//! them or the step is recorded as one no driver could take.
//!
//! Nothing here calls a model. A step is routable because it stated a target,
//! never because a planner claimed a tier could handle it.

use serde_json::Value;

use super::types::ComputerUseAction;
use crate::automation::action_router::{
    ActionIntent, PlannedStepIntent, RoutedCall, RoutingDecision, StepVerb,
};

const ACTION_FIELD: &str = "action";
const TARGET_FIELD: &str = "target";
const VALUE_FIELD: &str = "value";
const TEXT_FIELD: &str = "text";
const TITLE_FIELD: &str = "title";
const URL_FIELD: &str = "url";

pub const CLICK_STEP: &str = "click";
pub const TYPE_STEP: &str = "type";
pub const SCROLL_STEP: &str = "scroll";
pub const FOCUS_WINDOW_STEP: &str = "focus_window";
pub const READ_STEP: &str = "read";
pub const NAVIGATE_STEP: &str = "navigate";

const LABEL_SEPARATOR: &str = " ";
const NO_DRIVER_TOOK_THE_STEP: &str = "no driver could take this step";
const DECLINE_SEPARATOR: &str = ", ";

/// What the loop holds for one entry of a plan.
///
/// `Direct` names no control, so raw input is the only way to take it.
/// `Targeted` names one and keeps the raw form the loop falls back to.
/// `Routed` names one the raw vocabulary cannot express, so it has no
/// fallback and a decline ends the step rather than moving the pointer.
pub enum PlannedStep {
    Direct {
        action: ComputerUseAction,
    },
    Targeted {
        intent: ActionIntent,
        action: ComputerUseAction,
    },
    Routed {
        intent: ActionIntent,
    },
}

impl PlannedStep {
    pub fn raw(&self) -> Option<&ComputerUseAction> {
        match self {
            Self::Direct { action } | Self::Targeted { action, .. } => Some(action),
            Self::Routed { .. } => None,
        }
    }

    pub fn intent(&self) -> Option<&ActionIntent> {
        match self {
            Self::Targeted { intent, .. } | Self::Routed { intent } => Some(intent),
            Self::Direct { .. } => None,
        }
    }

    pub fn label(&self) -> String {
        match self {
            Self::Direct { action } | Self::Targeted { action, .. } => action.description(),
            Self::Routed { intent } => intent.utterance.clone(),
        }
    }
}

/// What the loop does with the router's answer for one step. The raw form
/// belongs to the step, so `Raw` says only that the step keeps one.
pub enum StepExecution<'a> {
    Drive(&'a RoutedCall),
    Raw,
    Unavailable,
}

/// A tier that accepted drives the step. Otherwise the raw form takes it, and
/// a step with no raw form is one no driver could take.
pub fn step_execution<'a>(
    step: &'a PlannedStep,
    decision: &'a RoutingDecision,
) -> StepExecution<'a> {
    match (decision.call.as_ref(), step.raw()) {
        (Some(call), _) => StepExecution::Drive(call),
        (None, Some(_)) => StepExecution::Raw,
        (None, None) => StepExecution::Unavailable,
    }
}

/// The reasons every tier gave, as one line for the record a failed step
/// leaves behind.
pub fn decline_summary(decision: &RoutingDecision) -> String {
    if decision.declined.is_empty() {
        return String::from(NO_DRIVER_TOOK_THE_STEP);
    }

    decision
        .declined
        .iter()
        .map(|assessment| {
            serde_json::to_string(&assessment.decline)
                .unwrap_or_else(|_| format!("{:?}", assessment.decline))
        })
        .collect::<Vec<_>>()
        .join(DECLINE_SEPARATOR)
}

/// Whether a plan entry names a verb the raw vocabulary cannot perform.
pub fn is_routed_only(entry: &Value) -> bool {
    matches!(
        entry.get(ACTION_FIELD).and_then(Value::as_str),
        Some(READ_STEP) | Some(NAVIGATE_STEP)
    )
}

fn step_verb(action_type: &str) -> Option<StepVerb> {
    match action_type {
        CLICK_STEP => Some(StepVerb::Activate),
        TYPE_STEP => Some(StepVerb::EnterText),
        SCROLL_STEP => Some(StepVerb::Scroll),
        FOCUS_WINDOW_STEP => Some(StepVerb::FocusWindow),
        READ_STEP => Some(StepVerb::Read),
        NAVIGATE_STEP => Some(StepVerb::Navigate),
        _ => None,
    }
}

fn field<'a>(entry: &'a Value, name: &str) -> Option<&'a str> {
    entry.get(name).and_then(Value::as_str)
}

fn step_label(action_type: &str, subject: Option<&str>) -> String {
    match subject {
        Some(subject) => format!("{action_type}{LABEL_SEPARATOR}{subject}"),
        None => action_type.to_string(),
    }
}

/// The routable reading of one plan entry, or `None` when the entry names no
/// control the tiers below vision can address.
pub fn step_intent(entry: &Value, application: Option<&str>) -> Option<ActionIntent> {
    let action_type = field(entry, ACTION_FIELD)?;
    let verb = step_verb(action_type)?;

    let target = match verb {
        StepVerb::FocusWindow => field(entry, TITLE_FIELD),
        _ => field(entry, TARGET_FIELD),
    };
    let value = match verb {
        StepVerb::EnterText => field(entry, TEXT_FIELD),
        _ => field(entry, VALUE_FIELD),
    };
    let url = field(entry, URL_FIELD);
    let label = step_label(action_type, target.or(url));

    ActionIntent::from_planned_step(PlannedStepIntent {
        verb,
        target,
        value,
        url,
        application,
        label: &label,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::automation::action_router::{
        ExecutorTier, IntentOperation, TargetRole, TierAssessment, TierDecline,
    };
    use crate::automation::computer_use::types::{MouseButton, ScrollDirection};
    use serde_json::json;

    const APPLICATION: &str = "Mail";
    const SEND_TARGET: &str = "the Send button";
    const BLOCKED_DESTINATION: &str = "http://127.0.0.1/secrets";
    const PUBLIC_DESTINATION: &str = "https://93.184.216.34/pricing";

    fn click_action() -> ComputerUseAction {
        ComputerUseAction::Click {
            x: 10,
            y: 20,
            button: MouseButton::Left,
        }
    }

    fn decision(intent: ActionIntent, call: Option<RoutedCall>) -> RoutingDecision {
        RoutingDecision {
            intent,
            selected: if call.is_some() {
                ExecutorTier::Ui
            } else {
                ExecutorTier::Visual
            },
            driver: String::from("driver"),
            call,
            declined: Vec::new(),
        }
    }

    fn accessibility_call() -> RoutedCall {
        RoutedCall {
            tier: ExecutorTier::Ui,
            driver: String::from("macos_accessibility"),
            tool: String::from("ui_click"),
            parameters: json!({}),
        }
    }

    #[test]
    fn a_click_naming_a_control_reads_as_an_invoke_on_that_control() {
        let intent = step_intent(
            &json!({ "action": "click", "x": 10, "y": 20, "target": SEND_TARGET }),
            Some(APPLICATION),
        )
        .expect("a named target is routable");

        assert_eq!(intent.operation, IntentOperation::Invoke);
        assert_eq!(intent.target_phrase.as_deref(), Some("Send"));
        assert_eq!(intent.target_role, Some(TargetRole::Button));
        assert_eq!(intent.application.as_deref(), Some(APPLICATION));
        assert!(intent.is_single_operation());
    }

    #[test]
    fn a_click_with_no_target_names_nothing_a_driver_can_address() {
        assert!(step_intent(&json!({ "action": "click", "x": 10, "y": 20 }), None).is_none());
    }

    #[test]
    fn the_role_the_step_named_decides_between_pressing_and_toggling() {
        let toggled = step_intent(
            &json!({ "action": "click", "target": "the Notifications switch" }),
            None,
        )
        .expect("routable");
        let selected = step_intent(
            &json!({ "action": "click", "target": "the Language dropdown", "value": "French" }),
            None,
        )
        .expect("routable");

        assert_eq!(toggled.operation, IntentOperation::Toggle);
        assert_eq!(selected.operation, IntentOperation::SelectOption);
        assert_eq!(selected.value.as_deref(), Some("French"));
    }

    #[test]
    fn a_typed_step_carries_its_literal_and_a_bare_one_is_not_routable() {
        let typed = step_intent(
            &json!({ "action": "type", "text": "hello", "target": "the Search field" }),
            None,
        )
        .expect("routable");

        assert_eq!(typed.operation, IntentOperation::EnterText);
        assert_eq!(typed.value.as_deref(), Some("hello"));
        assert_eq!(typed.target_phrase.as_deref(), Some("Search"));
        assert!(step_intent(
            &json!({ "action": "type", "target": "the Search field" }),
            None
        )
        .is_none());
    }

    #[test]
    fn a_window_title_is_matched_whole_rather_than_stripped_of_its_last_noun() {
        let focused = step_intent(
            &json!({ "action": "focus_window", "title": "Inbox list" }),
            None,
        )
        .expect("routable");

        assert_eq!(focused.operation, IntentOperation::Focus);
        assert_eq!(focused.target_phrase.as_deref(), Some("Inbox list"));
        assert_eq!(focused.target_role, Some(TargetRole::Window));
    }

    #[test]
    fn the_two_verbs_with_no_raw_form_are_the_ones_that_route_or_stop() {
        assert!(is_routed_only(
            &json!({ "action": "read", "target": "the total" })
        ));
        assert!(is_routed_only(
            &json!({ "action": "navigate", "url": PUBLIC_DESTINATION })
        ));
        assert!(!is_routed_only(
            &json!({ "action": "click", "target": SEND_TARGET })
        ));
        assert!(!is_routed_only(
            &json!({ "action": "scroll", "direction": "down" })
        ));
    }

    #[test]
    fn a_navigation_needs_a_destination_and_a_read_needs_a_target() {
        assert!(step_intent(&json!({ "action": "navigate" }), None).is_none());
        assert!(step_intent(&json!({ "action": "read" }), None).is_none());

        let navigation = step_intent(
            &json!({ "action": "navigate", "url": PUBLIC_DESTINATION }),
            None,
        )
        .expect("routable");
        assert_eq!(navigation.operation, IntentOperation::Navigate);
        assert_eq!(navigation.web_url.as_deref(), Some(PUBLIC_DESTINATION));
    }

    #[test]
    fn an_action_the_router_has_no_verb_for_stays_out_of_the_driven_tiers() {
        assert!(step_intent(
            &json!({ "action": "hotkey", "modifiers": ["ctrl"], "key": "c", "target": SEND_TARGET }),
            None,
        )
        .is_none());
        assert!(step_intent(&json!({ "action": "drag", "target": SEND_TARGET }), None).is_none());
    }

    #[test]
    fn a_step_a_tier_accepted_is_driven_by_that_tier_and_never_by_the_pointer() {
        let intent = step_intent(&json!({ "action": "click", "target": SEND_TARGET }), None)
            .expect("routable");
        let step = PlannedStep::Targeted {
            intent: intent.clone(),
            action: click_action(),
        };
        let decision = decision(intent, Some(accessibility_call()));

        match step_execution(&step, &decision) {
            StepExecution::Drive(call) => {
                assert_eq!(call.tool, "ui_click");
                assert_eq!(call.driver, "macos_accessibility");
            }
            _ => panic!("a tier accepted this step"),
        }
    }

    #[test]
    fn a_step_every_tier_declined_falls_to_the_pointer_it_planned() {
        let intent = step_intent(&json!({ "action": "click", "target": SEND_TARGET }), None)
            .expect("routable");
        let step = PlannedStep::Targeted {
            intent: intent.clone(),
            action: click_action(),
        };
        let decision = decision(intent, None);

        assert!(matches!(
            step_execution(&step, &decision),
            StepExecution::Raw
        ));
        match step.raw() {
            Some(ComputerUseAction::Click { x, y, .. }) => assert_eq!((*x, *y), (10, 20)),
            _ => panic!("the step kept the pointer form it planned"),
        }
    }

    #[test]
    fn a_step_with_no_raw_form_stops_rather_than_moving_the_pointer() {
        let intent = step_intent(
            &json!({ "action": "navigate", "url": BLOCKED_DESTINATION }),
            None,
        )
        .expect("routable");
        let step = PlannedStep::Routed {
            intent: intent.clone(),
        };
        let mut decision = decision(intent, None);
        decision.declined = vec![
            TierAssessment {
                tier: ExecutorTier::Api,
                decline: TierDecline::DestinationBlocked {
                    detail: String::from("private address"),
                },
            },
            TierAssessment {
                tier: ExecutorTier::Browser,
                decline: TierDecline::DestinationBlocked {
                    detail: String::from("private address"),
                },
            },
        ];

        assert!(matches!(
            step_execution(&step, &decision),
            StepExecution::Unavailable
        ));

        let summary = decline_summary(&decision);
        assert!(summary.contains("destination_blocked"), "{summary}");
        assert!(summary.contains("private address"), "{summary}");
    }

    #[test]
    fn a_direct_step_is_never_offered_to_a_tier() {
        let step = PlannedStep::Direct {
            action: ComputerUseAction::Scroll {
                direction: ScrollDirection::Down,
                amount: 3,
                at: None,
            },
        };

        assert!(step.intent().is_none());
        assert!(step.raw().is_some());
    }
}
