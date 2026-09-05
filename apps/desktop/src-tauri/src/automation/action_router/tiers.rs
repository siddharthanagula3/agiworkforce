//! The tiers the router asks, in the order the mandate fixes: a connector or
//! API first, then accessibility, then the DOM, then vision.
//!
//! Every check here is typed and local. A tier answers from the intent's shape,
//! from what its driver can do on this operating system, and from whether the
//! named target actually resolves, never from a model call, so the order cannot
//! be reordered by anything a planner emits.

use anyhow::Result;
use async_trait::async_trait;
use std::sync::Arc;

use super::accessibility::{AccessibilityCapability, AccessibilityProbe, ElementTarget};
use super::dom::{
    self, BrowserTransportProbe, PageSnapshot, ACCESSIBILITY_TREE_COMMAND, DOCUMENT_TREE_COMMAND,
    WHOLE_SUBTREE_DEPTH,
};
use super::intent::{ActionIntent, IntentOperation};
use super::matching::Match;
use super::{ActionTier, ExecutorTier, RoutedCall, TierDecline};
use crate::sys::security::egress_policy::ensure_public_http_destination;

pub const API_CALL_TOOL: &str = "api_call";
pub const UI_CLICK_TOOL: &str = "ui_click";
pub const UI_TYPE_TOOL: &str = "ui_type";
pub const UI_TOGGLE_TOOL: &str = "ui_toggle";
pub const UI_FOCUS_WINDOW_TOOL: &str = "ui_focus_window";
pub const UI_SCROLL_TOOL: &str = "ui_scroll";
pub const UI_READ_VALUE_TOOL: &str = "ui_read_value";
pub const BROWSER_NAVIGATE_TOOL: &str = "browser_navigate";
pub const BROWSER_CLICK_TOOL: &str = "browser_click";
pub const BROWSER_TYPE_TOOL: &str = "browser_type";
pub const BROWSER_SELECT_OPTION_TOOL: &str = "browser_select_option";
pub const BROWSER_GET_TEXT_TOOL: &str = "browser_get_text";
pub const BROWSER_SCROLL_TOOL: &str = "browser_scroll_into_view";

pub const HTTP_DRIVER: &str = "http_api";
pub const CDP_DRIVER: &str = "chrome_devtools_protocol";

const RETRIEVAL_METHOD: &str = "GET";
const URL_PARAMETER: &str = "url";
const METHOD_PARAMETER: &str = "method";
const TARGET_PARAMETER: &str = "target";
const TEXT_PARAMETER: &str = "text";
const VALUE_PARAMETER: &str = "value";
const SELECTOR_PARAMETER: &str = "selector";
const TAB_ID_PARAMETER: &str = "tab_id";
const ELEMENT_ID_KEY: &str = "element_id";
const WINDOW_KEY: &str = "window";
const NO_CONNECTED_TAB: &str = "no browser tab is connected";

fn platform() -> String {
    std::env::consts::OS.to_string()
}

/// The destination rule has one owner, and resolving a name to judge it blocks,
/// so the tier asks that owner off the async executor rather than keeping a
/// second copy of the rule or stalling the runtime on a DNS lookup.
async fn ensure_destination_allowed(url: &str) -> Result<(), TierDecline> {
    let destination = url.to_string();

    tokio::task::spawn_blocking(move || ensure_public_http_destination(&destination))
        .await
        .map_err(|error| TierDecline::DriverUnavailable {
            detail: error.to_string(),
        })?
        .map_err(|denial| TierDecline::DestinationBlocked {
            detail: denial.to_string(),
        })
}

pub struct DesktopBrowserTransportProbe {
    app_handle: Option<tauri::AppHandle>,
}

impl DesktopBrowserTransportProbe {
    pub fn new(app_handle: Option<tauri::AppHandle>) -> Self {
        Self { app_handle }
    }

    fn state(&self) -> Result<tauri::State<'_, crate::sys::commands::BrowserStateWrapper>> {
        use tauri::Manager;

        let app = self
            .app_handle
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!(BROWSER_STATE_MISSING))?;
        let state = app
            .try_state::<crate::sys::commands::BrowserStateWrapper>()
            .ok_or_else(|| anyhow::anyhow!(BROWSER_STATE_MISSING))?;

        if !state.is_available() {
            return Err(anyhow::anyhow!(state.get_error_message()));
        }

        Ok(state)
    }
}

const BROWSER_STATE_MISSING: &str = "browser automation state is not available";

#[async_trait]
impl BrowserTransportProbe for DesktopBrowserTransportProbe {
    async fn connected_tab(&self) -> Result<Option<String>> {
        Ok(self.state()?.resolve_cdp_tab(None, false, None).await.ok())
    }

    async fn snapshot(&self, tab_id: &str) -> Result<PageSnapshot> {
        let state = self.state()?;
        let (client, _) = state
            .get_client_for_tab(Some(tab_id.to_string()))
            .await
            .map_err(|error| anyhow::anyhow!(error))?;

        let accessibility = client
            .send_command(ACCESSIBILITY_TREE_COMMAND, serde_json::json!({}))
            .await?;
        let document = client
            .send_command(
                DOCUMENT_TREE_COMMAND,
                serde_json::json!({ "depth": WHOLE_SUBTREE_DEPTH }),
            )
            .await?;

        Ok(PageSnapshot {
            accessibility,
            document,
        })
    }
}

pub struct ApiTier;

#[async_trait]
impl ActionTier for ApiTier {
    fn tier(&self) -> ExecutorTier {
        ExecutorTier::Api
    }

    async fn assess(&self, intent: &ActionIntent) -> Result<RoutedCall, TierDecline> {
        if !intent.is_single_operation() {
            return Err(TierDecline::MultipleOperations {
                clauses: intent.clauses,
            });
        }

        if intent.operation != IntentOperation::Retrieve {
            return Err(TierDecline::OutOfScope);
        }

        let Some(url) = intent.web_url.as_deref() else {
            return Err(TierDecline::OutOfScope);
        };

        ensure_destination_allowed(url).await?;

        Ok(RoutedCall {
            tier: ExecutorTier::Api,
            driver: String::from(HTTP_DRIVER),
            tool: API_CALL_TOOL.to_string(),
            parameters: serde_json::json!({
                URL_PARAMETER: url,
                METHOD_PARAMETER: RETRIEVAL_METHOD,
            }),
        })
    }
}

struct UiVerb {
    capability: AccessibilityCapability,
    tool: &'static str,
}

fn ui_verb(operation: IntentOperation) -> Option<UiVerb> {
    let (capability, tool) = match operation {
        IntentOperation::Invoke => (AccessibilityCapability::Invoke, UI_CLICK_TOOL),
        IntentOperation::EnterText => (AccessibilityCapability::EnterText, UI_TYPE_TOOL),
        IntentOperation::Toggle => (AccessibilityCapability::Toggle, UI_TOGGLE_TOOL),
        IntentOperation::Focus => (AccessibilityCapability::FocusWindow, UI_FOCUS_WINDOW_TOOL),
        IntentOperation::Scroll => (AccessibilityCapability::Scroll, UI_SCROLL_TOOL),
        IntentOperation::Read => (AccessibilityCapability::ReadValue, UI_READ_VALUE_TOOL),
        _ => return None,
    };

    Some(UiVerb { capability, tool })
}

pub struct UiTier {
    probe: Arc<dyn AccessibilityProbe>,
}

impl UiTier {
    pub fn new(probe: Arc<dyn AccessibilityProbe>) -> Self {
        Self { probe }
    }

    fn resolve(
        &self,
        phrase: &str,
        resolved: Result<Match<String>>,
    ) -> Result<String, TierDecline> {
        match resolved {
            Ok(Match::Found(token)) => Ok(token),
            Ok(Match::Ambiguous { candidates }) => Err(TierDecline::TargetAmbiguous {
                query: phrase.to_string(),
                candidates,
            }),
            Ok(Match::NotFound) => Err(TierDecline::TargetNotFound {
                query: phrase.to_string(),
            }),
            Err(error) => Err(TierDecline::DriverUnavailable {
                detail: error.to_string(),
            }),
        }
    }
}

#[async_trait]
impl ActionTier for UiTier {
    fn tier(&self) -> ExecutorTier {
        ExecutorTier::Ui
    }

    async fn assess(&self, intent: &ActionIntent) -> Result<RoutedCall, TierDecline> {
        let Some(driver) = self.probe.driver() else {
            return Err(TierDecline::PlatformUnsupported {
                platform: platform(),
                capability: None,
            });
        };

        if !intent.is_single_operation() {
            return Err(TierDecline::MultipleOperations {
                clauses: intent.clauses,
            });
        }

        let Some(verb) = ui_verb(intent.operation) else {
            return Err(TierDecline::OutOfScope);
        };

        if !self.probe.supports(verb.capability) {
            return Err(TierDecline::PlatformUnsupported {
                platform: platform(),
                capability: Some(verb.capability.label().to_string()),
            });
        }

        let Some(phrase) = intent.target_phrase.as_deref() else {
            return Err(TierDecline::OutOfScope);
        };

        let parameters = if verb.capability == AccessibilityCapability::FocusWindow {
            let token = self.resolve(phrase, self.probe.locate_window(phrase))?;
            serde_json::json!({ TARGET_PARAMETER: { WINDOW_KEY: token } })
        } else {
            let element_id = self.resolve(
                phrase,
                self.probe.locate(&ElementTarget {
                    phrase,
                    role: intent.target_role,
                    window: intent.application.as_deref(),
                }),
            )?;

            match intent.operation {
                IntentOperation::EnterText => {
                    let Some(value) = intent.value.as_deref() else {
                        return Err(TierDecline::OutOfScope);
                    };
                    serde_json::json!({
                        TARGET_PARAMETER: { ELEMENT_ID_KEY: element_id },
                        TEXT_PARAMETER: value,
                    })
                }
                _ => serde_json::json!({ TARGET_PARAMETER: { ELEMENT_ID_KEY: element_id } }),
            }
        };

        Ok(RoutedCall {
            tier: ExecutorTier::Ui,
            driver: driver.to_string(),
            tool: verb.tool.to_string(),
            parameters,
        })
    }
}

pub struct BrowserTier {
    probe: Arc<dyn BrowserTransportProbe>,
}

impl BrowserTier {
    pub fn new(probe: Arc<dyn BrowserTransportProbe>) -> Self {
        Self { probe }
    }

    async fn tab(&self) -> Result<String, TierDecline> {
        match self.probe.connected_tab().await {
            Ok(Some(tab_id)) => Ok(tab_id),
            Ok(None) => Err(TierDecline::DriverUnavailable {
                detail: String::from(NO_CONNECTED_TAB),
            }),
            Err(error) => Err(TierDecline::DriverUnavailable {
                detail: error.to_string(),
            }),
        }
    }

    async fn selector(&self, tab_id: &str, intent: &ActionIntent) -> Result<String, TierDecline> {
        let Some(phrase) = intent.target_phrase.as_deref() else {
            return Err(TierDecline::OutOfScope);
        };

        let snapshot =
            self.probe
                .snapshot(tab_id)
                .await
                .map_err(|error| TierDecline::DriverUnavailable {
                    detail: error.to_string(),
                })?;

        match dom::locate(&snapshot, phrase, intent.target_role) {
            Match::Found(selector) => Ok(selector),
            Match::Ambiguous { candidates } => Err(TierDecline::TargetAmbiguous {
                query: phrase.to_string(),
                candidates,
            }),
            Match::NotFound => Err(TierDecline::TargetNotFound {
                query: phrase.to_string(),
            }),
        }
    }
}

#[async_trait]
impl ActionTier for BrowserTier {
    fn tier(&self) -> ExecutorTier {
        ExecutorTier::Browser
    }

    async fn assess(&self, intent: &ActionIntent) -> Result<RoutedCall, TierDecline> {
        if !intent.is_single_operation() {
            return Err(TierDecline::MultipleOperations {
                clauses: intent.clauses,
            });
        }

        let navigating = matches!(
            intent.operation,
            IntentOperation::Navigate | IntentOperation::Retrieve
        );

        if navigating {
            let Some(url) = intent.web_url.as_deref() else {
                return Err(TierDecline::OutOfScope);
            };

            ensure_destination_allowed(url).await?;

            self.tab().await?;

            return Ok(RoutedCall {
                tier: ExecutorTier::Browser,
                driver: String::from(CDP_DRIVER),
                tool: BROWSER_NAVIGATE_TOOL.to_string(),
                parameters: serde_json::json!({ URL_PARAMETER: url }),
            });
        }

        let tool = match intent.operation {
            IntentOperation::Invoke => BROWSER_CLICK_TOOL,
            IntentOperation::EnterText => BROWSER_TYPE_TOOL,
            IntentOperation::SelectOption => BROWSER_SELECT_OPTION_TOOL,
            IntentOperation::Read => BROWSER_GET_TEXT_TOOL,
            IntentOperation::Scroll => BROWSER_SCROLL_TOOL,
            _ => return Err(TierDecline::OutOfScope),
        };

        let tab_id = self.tab().await?;
        let selector = self.selector(&tab_id, intent).await?;

        let mut parameters = serde_json::json!({
            SELECTOR_PARAMETER: selector,
            TAB_ID_PARAMETER: tab_id,
        });

        match intent.operation {
            IntentOperation::EnterText => {
                let Some(value) = intent.value.as_deref() else {
                    return Err(TierDecline::OutOfScope);
                };
                parameters[TEXT_PARAMETER] = serde_json::Value::from(value);
            }
            IntentOperation::SelectOption => {
                let Some(value) = intent.value.as_deref() else {
                    return Err(TierDecline::OutOfScope);
                };
                parameters[VALUE_PARAMETER] = serde_json::Value::from(value);
            }
            _ => {}
        }

        Ok(RoutedCall {
            tier: ExecutorTier::Browser,
            driver: String::from(CDP_DRIVER),
            tool: tool.to_string(),
            parameters,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::automation::action_router::intent::TargetRole;
    use serde_json::json;

    const STUB_DRIVER: &str = "stub_accessibility";
    const STUB_TAB: &str = "tab-1";
    /// Address literals rather than names, so no test result depends on the
    /// machine resolving a domain.
    const PUBLIC_DESTINATION: &str = "https://93.184.216.34/pricing";
    const INTERNAL_DESTINATION: &str = "http://127.0.0.1/secrets";

    struct StubAccessibility {
        driver: Option<&'static str>,
        scroll: bool,
        element: fn() -> Result<Match<String>>,
        window: fn() -> Result<Match<String>>,
    }

    impl Default for StubAccessibility {
        fn default() -> Self {
            Self {
                driver: Some(STUB_DRIVER),
                scroll: true,
                element: || Ok(Match::Found(String::from("ax-42"))),
                window: || Ok(Match::Found(String::from("Notes"))),
            }
        }
    }

    impl AccessibilityProbe for StubAccessibility {
        fn driver(&self) -> Option<&'static str> {
            self.driver
        }

        fn supports(&self, capability: AccessibilityCapability) -> bool {
            match capability {
                AccessibilityCapability::Scroll => self.scroll,
                _ => self.driver.is_some(),
            }
        }

        fn locate(&self, _target: &ElementTarget<'_>) -> Result<Match<String>> {
            (self.element)()
        }

        fn locate_window(&self, _title: &str) -> Result<Match<String>> {
            (self.window)()
        }
    }

    struct StubBrowser {
        tab: fn() -> Result<Option<String>>,
        page: fn() -> Result<PageSnapshot>,
    }

    impl Default for StubBrowser {
        fn default() -> Self {
            Self {
                tab: || Ok(Some(String::from(STUB_TAB))),
                page: || Ok(page_snapshot()),
            }
        }
    }

    #[async_trait]
    impl BrowserTransportProbe for StubBrowser {
        async fn connected_tab(&self) -> Result<Option<String>> {
            (self.tab)()
        }

        async fn snapshot(&self, _tab_id: &str) -> Result<PageSnapshot> {
            (self.page)()
        }
    }

    fn page_snapshot() -> PageSnapshot {
        PageSnapshot {
            accessibility: json!({
                "nodes": [
                    { "role": { "value": "button" }, "name": { "value": "Send" }, "backendDOMNodeId": 11 },
                    { "role": { "value": "textbox" }, "name": { "value": "Search" }, "backendDOMNodeId": 12 },
                    { "role": { "value": "combobox" }, "name": { "value": "Frequency" }, "backendDOMNodeId": 13 },
                    { "role": { "value": "text" }, "name": { "value": "Total" }, "backendDOMNodeId": 14 }
                ]
            }),
            document: json!({
                "root": {
                    "nodeType": 9,
                    "nodeName": "#document",
                    "children": [{
                        "nodeType": 1,
                        "nodeName": "BODY",
                        "backendNodeId": 2,
                        "children": [
                            { "nodeType": 1, "nodeName": "BUTTON", "backendNodeId": 11, "attributes": ["id", "send"] },
                            { "nodeType": 1, "nodeName": "INPUT", "backendNodeId": 12, "attributes": ["id", "search"] },
                            { "nodeType": 1, "nodeName": "SELECT", "backendNodeId": 13, "attributes": ["id", "frequency"] },
                            { "nodeType": 1, "nodeName": "SPAN", "backendNodeId": 14, "attributes": ["id", "total"] }
                        ]
                    }]
                }
            }),
        }
    }

    fn ui_tier(probe: StubAccessibility) -> UiTier {
        UiTier::new(Arc::new(probe))
    }

    fn browser_tier(probe: StubBrowser) -> BrowserTier {
        BrowserTier::new(Arc::new(probe))
    }

    async fn ui_call(utterance: &str) -> RoutedCall {
        ui_tier(StubAccessibility::default())
            .assess(&ActionIntent::parse(utterance, None))
            .await
            .expect("accepted")
    }

    async fn ui_decline(probe: StubAccessibility, utterance: &str) -> TierDecline {
        ui_tier(probe)
            .assess(&ActionIntent::parse(utterance, None))
            .await
            .expect_err("declined")
    }

    async fn browser_call(utterance: &str) -> RoutedCall {
        browser_tier(StubBrowser::default())
            .assess(&ActionIntent::parse(utterance, None))
            .await
            .expect("accepted")
    }

    fn target_element(call: &RoutedCall) -> Option<&str> {
        call.parameters
            .get(TARGET_PARAMETER)?
            .get(ELEMENT_ID_KEY)?
            .as_str()
    }

    #[tokio::test]
    async fn the_api_tier_takes_a_retrieval_of_an_absolute_url() {
        let intent = ActionIntent::parse(&format!("fetch {PUBLIC_DESTINATION}"), None);
        let call = ApiTier.assess(&intent).await.expect("accepted");

        assert_eq!(call.tier, ExecutorTier::Api);
        assert_eq!(call.tool, API_CALL_TOOL);
        assert_eq!(call.driver, HTTP_DRIVER);
        assert_eq!(
            call.parameters
                .get(METHOD_PARAMETER)
                .and_then(|method| method.as_str()),
            Some(RETRIEVAL_METHOD)
        );
    }

    #[tokio::test]
    async fn the_api_tier_declines_an_invocation() {
        let intent = ActionIntent::parse("click the Send button", None);

        assert!(matches!(
            ApiTier.assess(&intent).await,
            Err(TierDecline::OutOfScope)
        ));
    }

    #[tokio::test]
    async fn a_destination_the_egress_policy_refuses_never_reaches_a_driver() {
        let intent = ActionIntent::parse(&format!("fetch {INTERNAL_DESTINATION}"), None);

        assert!(matches!(
            ApiTier.assess(&intent).await,
            Err(TierDecline::DestinationBlocked { .. })
        ));
        assert!(matches!(
            browser_tier(StubBrowser::default()).assess(&intent).await,
            Err(TierDecline::DestinationBlocked { .. })
        ));
    }

    #[tokio::test]
    async fn the_ui_tier_invokes_a_named_control() {
        let call = ui_call("click the Send button in Slack").await;

        assert_eq!(call.tier, ExecutorTier::Ui);
        assert_eq!(call.tool, UI_CLICK_TOOL);
        assert_eq!(call.driver, STUB_DRIVER);
        assert_eq!(target_element(&call), Some("ax-42"));
    }

    #[tokio::test]
    async fn the_ui_tier_selects_a_named_menu_item_through_the_same_tool() {
        let call = ui_call("select the New Window menu item").await;

        assert_eq!(call.tool, UI_CLICK_TOOL);
        assert_eq!(target_element(&call), Some("ax-42"));
    }

    #[tokio::test]
    async fn the_ui_tier_types_a_literal_into_a_named_field() {
        let call = ui_call("type hello into the Search field").await;

        assert_eq!(call.tool, UI_TYPE_TOOL);
        assert_eq!(target_element(&call), Some("ax-42"));
        assert_eq!(
            call.parameters.get(TEXT_PARAMETER).and_then(|t| t.as_str()),
            Some("hello")
        );
    }

    #[tokio::test]
    async fn the_ui_tier_toggles_a_named_control() {
        let call = ui_call("toggle the Do Not Disturb switch").await;

        assert_eq!(call.tool, UI_TOGGLE_TOOL);
        assert_eq!(target_element(&call), Some("ax-42"));
    }

    #[tokio::test]
    async fn the_ui_tier_focuses_a_window_by_title() {
        let call = ui_call("switch to the Notes window").await;

        assert_eq!(call.tool, UI_FOCUS_WINDOW_TOOL);
        assert_eq!(
            call.parameters
                .get(TARGET_PARAMETER)
                .and_then(|target| target.get(WINDOW_KEY))
                .and_then(|window| window.as_str()),
            Some("Notes")
        );
    }

    #[tokio::test]
    async fn the_ui_tier_reads_a_named_value_back() {
        let call = ui_call("read the Total field").await;

        assert_eq!(call.tool, UI_READ_VALUE_TOOL);
        assert_eq!(target_element(&call), Some("ax-42"));
    }

    #[tokio::test]
    async fn the_ui_tier_scrolls_a_named_region_where_the_service_can() {
        let call = ui_call("scroll the Messages list").await;

        assert_eq!(call.tool, UI_SCROLL_TOOL);
    }

    #[tokio::test]
    async fn a_platform_without_a_scroll_pattern_declines_that_verb_by_name() {
        let probe = StubAccessibility {
            scroll: false,
            ..StubAccessibility::default()
        };
        let decline = ui_decline(probe, "scroll the Messages list").await;

        let TierDecline::PlatformUnsupported {
            capability: Some(capability),
            ..
        } = decline
        else {
            panic!("expected a named capability decline");
        };
        assert_eq!(capability, AccessibilityCapability::Scroll.label());
    }

    #[tokio::test]
    async fn a_platform_with_no_accessibility_service_declines_the_whole_tier() {
        let probe = StubAccessibility {
            driver: None,
            ..StubAccessibility::default()
        };
        let decline = ui_decline(probe, "click the Send button").await;

        assert!(matches!(
            decline,
            TierDecline::PlatformUnsupported {
                capability: None,
                ..
            }
        ));
    }

    #[tokio::test]
    async fn the_ui_tier_reports_a_tie_rather_than_picking_one() {
        let probe = StubAccessibility {
            element: || Ok(Match::Ambiguous { candidates: 2 }),
            ..StubAccessibility::default()
        };

        assert!(matches!(
            ui_decline(probe, "click the Send button").await,
            TierDecline::TargetAmbiguous { candidates: 2, .. }
        ));
    }

    #[tokio::test]
    async fn the_ui_tier_declines_when_the_tree_has_no_such_element() {
        let probe = StubAccessibility {
            element: || Ok(Match::NotFound),
            ..StubAccessibility::default()
        };

        assert!(matches!(
            ui_decline(probe, "click the Send button").await,
            TierDecline::TargetNotFound { .. }
        ));
    }

    #[tokio::test]
    async fn the_ui_tier_declines_when_the_driver_cannot_be_reached() {
        let probe = StubAccessibility {
            element: || Err(anyhow::anyhow!("accessibility permission not granted")),
            ..StubAccessibility::default()
        };

        assert!(matches!(
            ui_decline(probe, "click the Send button").await,
            TierDecline::DriverUnavailable { .. }
        ));
    }

    #[tokio::test]
    async fn the_ui_tier_declines_an_unnamed_target() {
        let decline = ui_decline(
            StubAccessibility::default(),
            "click whichever one of these seven similar looking controls is right",
        )
        .await;

        assert!(matches!(decline, TierDecline::OutOfScope));
    }

    #[tokio::test]
    async fn the_ui_tier_declines_a_navigation_it_does_not_drive() {
        let decline = ui_decline(
            StubAccessibility::default(),
            &format!("open {PUBLIC_DESTINATION}"),
        )
        .await;

        assert!(matches!(decline, TierDecline::OutOfScope));
    }

    #[tokio::test]
    async fn the_browser_tier_navigates_when_a_tab_is_connected() {
        let call = browser_call(&format!("open {PUBLIC_DESTINATION}")).await;

        assert_eq!(call.tier, ExecutorTier::Browser);
        assert_eq!(call.tool, BROWSER_NAVIGATE_TOOL);
        assert_eq!(call.driver, CDP_DRIVER);
    }

    #[tokio::test]
    async fn the_browser_tier_clicks_a_control_resolved_by_accessible_name() {
        let call = browser_call("click the Send button").await;

        assert_eq!(call.tool, BROWSER_CLICK_TOOL);
        assert_eq!(
            call.parameters
                .get(SELECTOR_PARAMETER)
                .and_then(|selector| selector.as_str()),
            Some("#send")
        );
        assert_eq!(
            call.parameters
                .get(TAB_ID_PARAMETER)
                .and_then(|tab| tab.as_str()),
            Some(STUB_TAB)
        );
    }

    #[tokio::test]
    async fn the_browser_tier_types_into_a_field_resolved_by_accessible_name() {
        let call = browser_call("type hello into the Search field").await;

        assert_eq!(call.tool, BROWSER_TYPE_TOOL);
        assert_eq!(
            call.parameters
                .get(SELECTOR_PARAMETER)
                .and_then(|selector| selector.as_str()),
            Some("#search")
        );
        assert_eq!(
            call.parameters.get(TEXT_PARAMETER).and_then(|t| t.as_str()),
            Some("hello")
        );
    }

    #[tokio::test]
    async fn the_browser_tier_selects_an_option_by_value() {
        let call = browser_call("select Weekly from the Frequency dropdown").await;

        assert_eq!(call.tool, BROWSER_SELECT_OPTION_TOOL);
        assert_eq!(
            call.parameters
                .get(VALUE_PARAMETER)
                .and_then(|value| value.as_str()),
            Some("Weekly")
        );
        assert_eq!(
            call.parameters
                .get(SELECTOR_PARAMETER)
                .and_then(|selector| selector.as_str()),
            Some("#frequency")
        );
    }

    #[tokio::test]
    async fn the_browser_tier_reads_text_back() {
        let call = browser_call("read the Total label").await;

        assert_eq!(call.tool, BROWSER_GET_TEXT_TOOL);
        assert_eq!(
            call.parameters
                .get(SELECTOR_PARAMETER)
                .and_then(|selector| selector.as_str()),
            Some("#total")
        );
    }

    #[tokio::test]
    async fn the_browser_tier_reports_a_page_tie_rather_than_picking_one() {
        let probe = StubBrowser {
            page: || {
                let mut page = page_snapshot();
                page.accessibility = json!({
                    "nodes": [
                        { "role": { "value": "button" }, "name": { "value": "Send" }, "backendDOMNodeId": 11 },
                        { "role": { "value": "button" }, "name": { "value": "Send" }, "backendDOMNodeId": 13 }
                    ]
                });
                Ok(page)
            },
            ..StubBrowser::default()
        };

        let decline = browser_tier(probe)
            .assess(&ActionIntent::parse("click the Send button", None))
            .await
            .expect_err("declined");

        assert!(matches!(
            decline,
            TierDecline::TargetAmbiguous { candidates: 2, .. }
        ));
    }

    #[tokio::test]
    async fn the_browser_tier_declines_when_no_tab_is_connected() {
        let probe = StubBrowser {
            tab: || Ok(None),
            ..StubBrowser::default()
        };
        let decline = browser_tier(probe)
            .assess(&ActionIntent::parse(
                &format!("open {PUBLIC_DESTINATION}"),
                None,
            ))
            .await
            .expect_err("declined");

        assert!(matches!(decline, TierDecline::DriverUnavailable { .. }));
    }

    #[tokio::test]
    async fn the_browser_tier_declines_a_control_the_page_does_not_carry() {
        let decline = browser_tier(StubBrowser::default())
            .assess(&ActionIntent::parse("click the Archive button", None))
            .await
            .expect_err("declined");

        assert!(matches!(decline, TierDecline::TargetNotFound { .. }));
    }

    #[tokio::test]
    async fn the_browser_tier_declines_a_toggle_it_cannot_express() {
        let decline = browser_tier(StubBrowser::default())
            .assess(&ActionIntent::parse("toggle the Alerts switch", None))
            .await
            .expect_err("declined");

        assert!(matches!(decline, TierDecline::OutOfScope));
    }

    #[tokio::test]
    async fn every_tier_declines_a_multi_operation_utterance() {
        let intent =
            ActionIntent::parse(&format!("fetch {PUBLIC_DESTINATION} then click Send"), None);

        assert!(matches!(
            ApiTier.assess(&intent).await,
            Err(TierDecline::MultipleOperations { .. })
        ));
        assert!(matches!(
            ui_tier(StubAccessibility::default()).assess(&intent).await,
            Err(TierDecline::MultipleOperations { .. })
        ));
        assert!(matches!(
            browser_tier(StubBrowser::default()).assess(&intent).await,
            Err(TierDecline::MultipleOperations { .. })
        ));
    }

    #[tokio::test]
    async fn a_role_the_utterance_named_reaches_the_probe() {
        let intent = ActionIntent::parse("click the Send button", None);

        assert_eq!(intent.target_role, Some(TargetRole::Button));
    }
}
