//! Resolves an utterance's target against the platform accessibility tree.
//!
//! The ladder narrows before it widens: an exact accessibility identifier, then
//! the label under the role the utterance named, then the label alone, then the
//! nearest normalised label under that role, then the nearest label anywhere.
//! Each rung returns as soon as it resolves or ties, so a widening step never
//! overrides a narrower answer, and a tie is reported rather than broken.

use anyhow::Result;
use std::sync::Arc;

use super::intent::TargetRole;
use super::matching::{pick_best, Match};
use crate::automation::types::{ElementQuery, UIElementInfo};
use crate::automation::{accessibility_backend, AutomationService};

const CANDIDATE_LIMIT: usize = 25;
const UNIQUE_IDENTIFIER_LIMIT: usize = 2;
const UNIQUE_IDENTIFIER_MATCHES: usize = 1;
const AUTOMATION_SERVICE_MISSING: &str = "native automation service is not available";

const CAPABILITY_INVOKE: &str = "invoke a named control";
const CAPABILITY_ENTER_TEXT: &str = "type into a named field";
const CAPABILITY_TOGGLE: &str = "toggle a named control";
const CAPABILITY_FOCUS_WINDOW: &str = "focus a window by title";
const CAPABILITY_SCROLL: &str = "scroll a named region";
const CAPABILITY_READ_VALUE: &str = "read a named value";

/// Windows exposes a scroll pattern over the automation tree; the macOS
/// accessibility service in this repository exposes no equivalent, so the tier
/// declines that one verb there instead of falling back to raw input.
const SCROLL_SUPPORTED: bool = cfg!(windows);

/// `focus_window` takes a window title on macOS and a registered element handle
/// on Windows, so the token the probe hands back is resolved on the same
/// platform that will consume it.
const WINDOW_TOKEN_IS_TITLE: bool = cfg!(target_os = "macos");

const MACOS_ROLE_TOKENS: &[(TargetRole, &str)] = &[
    (TargetRole::Button, "button"),
    (TargetRole::Link, "link"),
    (TargetRole::MenuItem, "menuitem"),
    (TargetRole::Tab, "tab"),
    (TargetRole::Checkbox, "checkbox"),
    (TargetRole::TextField, "textfield"),
    (TargetRole::ListItem, "row"),
    (TargetRole::ComboBox, "popupbutton"),
    (TargetRole::Window, "window"),
    (TargetRole::StaticText, "statictext"),
    (TargetRole::ScrollArea, "scrollarea"),
];

const WINDOWS_ROLE_TOKENS: &[(TargetRole, &str)] = &[
    (TargetRole::Button, "button"),
    (TargetRole::MenuItem, "menuitem"),
    (TargetRole::Checkbox, "checkbox"),
    (TargetRole::TextField, "edit"),
    (TargetRole::ListItem, "listitem"),
    (TargetRole::ComboBox, "combobox"),
    (TargetRole::Window, "window"),
    (TargetRole::StaticText, "text"),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccessibilityCapability {
    Invoke,
    EnterText,
    Toggle,
    FocusWindow,
    Scroll,
    ReadValue,
}

impl AccessibilityCapability {
    pub fn label(self) -> &'static str {
        match self {
            Self::Invoke => CAPABILITY_INVOKE,
            Self::EnterText => CAPABILITY_ENTER_TEXT,
            Self::Toggle => CAPABILITY_TOGGLE,
            Self::FocusWindow => CAPABILITY_FOCUS_WINDOW,
            Self::Scroll => CAPABILITY_SCROLL,
            Self::ReadValue => CAPABILITY_READ_VALUE,
        }
    }
}

pub struct ElementTarget<'a> {
    pub phrase: &'a str,
    pub role: Option<TargetRole>,
    pub window: Option<&'a str>,
}

pub trait AccessibilityProbe: Send + Sync {
    fn driver(&self) -> Option<&'static str>;
    fn supports(&self, capability: AccessibilityCapability) -> bool;
    fn locate(&self, target: &ElementTarget<'_>) -> Result<Match<String>>;
    fn locate_window(&self, title: &str) -> Result<Match<String>>;
}

pub fn role_query_token(role: TargetRole) -> Option<&'static str> {
    let tokens = if cfg!(target_os = "macos") {
        MACOS_ROLE_TOKENS
    } else {
        WINDOWS_ROLE_TOKENS
    };

    tokens
        .iter()
        .find(|(candidate, _)| *candidate == role)
        .map(|(_, token)| *token)
}

pub struct NativeAccessibilityProbe {
    automation: Option<Arc<AutomationService>>,
}

impl NativeAccessibilityProbe {
    pub fn new(automation: Option<Arc<AutomationService>>) -> Self {
        Self { automation }
    }

    fn service(&self) -> Result<&Arc<AutomationService>> {
        self.automation
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!(AUTOMATION_SERVICE_MISSING))
    }

    fn find(&self, query: ElementQuery) -> Result<Vec<UIElementInfo>> {
        self.service()?.native.find_elements(None, &query)
    }
}

impl AccessibilityProbe for NativeAccessibilityProbe {
    fn driver(&self) -> Option<&'static str> {
        accessibility_backend()
    }

    fn supports(&self, capability: AccessibilityCapability) -> bool {
        if self.driver().is_none() {
            return false;
        }

        match capability {
            AccessibilityCapability::Scroll => SCROLL_SUPPORTED,
            _ => true,
        }
    }

    fn locate(&self, target: &ElementTarget<'_>) -> Result<Match<String>> {
        let window = target.window.map(str::to_string);
        let role = target.role.and_then(role_query_token).map(str::to_string);

        let identified = self.find(ElementQuery {
            window: window.clone(),
            automation_id: Some(target.phrase.to_string()),
            max_results: Some(UNIQUE_IDENTIFIER_LIMIT),
            ..ElementQuery::default()
        })?;
        if identified.len() == UNIQUE_IDENTIFIER_MATCHES {
            if let Some(element) = identified.into_iter().next() {
                return Ok(Match::Found(element.id));
            }
        }

        let ladder = [
            (Some(target.phrase.to_string()), role.clone()),
            (Some(target.phrase.to_string()), None),
            (None, role),
            (None, None),
        ];

        for (name, control_type) in ladder {
            let found = self.find(ElementQuery {
                window: window.clone(),
                name,
                control_type,
                max_results: Some(CANDIDATE_LIMIT),
                ..ElementQuery::default()
            })?;

            let picked = pick_best(
                target.phrase,
                found.into_iter().map(|element| (element.name, element.id)),
            );

            if !picked.is_not_found() {
                return Ok(picked);
            }
        }

        Ok(Match::NotFound)
    }

    fn locate_window(&self, title: &str) -> Result<Match<String>> {
        let windows = self.service()?.native.list_windows()?;

        Ok(pick_best(
            title,
            windows.into_iter().map(|window| {
                let token = if WINDOW_TOKEN_IS_TITLE {
                    window.name.clone()
                } else {
                    window.id
                };
                (window.name, token)
            }),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_capability_names_itself_for_a_decline() {
        for capability in [
            AccessibilityCapability::Invoke,
            AccessibilityCapability::EnterText,
            AccessibilityCapability::Toggle,
            AccessibilityCapability::FocusWindow,
            AccessibilityCapability::Scroll,
            AccessibilityCapability::ReadValue,
        ] {
            assert!(!capability.label().is_empty());
        }
    }

    #[test]
    fn the_roles_a_platform_can_query_resolve_to_its_own_vocabulary() {
        assert!(role_query_token(TargetRole::Button).is_some());
        assert!(role_query_token(TargetRole::TextField).is_some());
        assert!(role_query_token(TargetRole::Checkbox).is_some());
        assert!(role_query_token(TargetRole::Window).is_some());
    }

    #[test]
    fn a_role_the_platform_has_no_token_for_widens_instead_of_failing() {
        for (role, _) in MACOS_ROLE_TOKENS {
            assert!(
                WINDOWS_ROLE_TOKENS.iter().any(|(mapped, _)| mapped == role)
                    || matches!(
                        role,
                        TargetRole::Link | TargetRole::Tab | TargetRole::ScrollArea
                    )
            );
        }
    }

    #[test]
    fn a_probe_with_no_service_reports_the_driver_and_fails_the_lookup() {
        let probe = NativeAccessibilityProbe::new(None);

        assert_eq!(probe.driver(), accessibility_backend());
        assert!(probe
            .locate(&ElementTarget {
                phrase: "Send",
                role: Some(TargetRole::Button),
                window: None,
            })
            .is_err());
        assert!(probe.locate_window("Notes").is_err());
    }

    #[test]
    fn scrolling_is_the_only_capability_a_supported_platform_can_lack() {
        let probe = NativeAccessibilityProbe::new(None);
        let supported = probe.driver().is_some();

        assert_eq!(probe.supports(AccessibilityCapability::Invoke), supported);
        assert_eq!(
            probe.supports(AccessibilityCapability::Scroll),
            supported && SCROLL_SUPPORTED
        );
    }
}
