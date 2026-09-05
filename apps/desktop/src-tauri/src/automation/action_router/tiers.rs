//! The four tiers the router asks, in the order the mandate fixes: a
//! connector or API first, then accessibility, then the DOM, then vision.
//!
//! Every check here is typed and local. A tier answers from the intent's shape
//! and from its own driver's reachability, never from a model call, so the
//! order cannot be reordered by anything a planner emits.

use anyhow::Result;
use async_trait::async_trait;
use std::sync::Arc;

use super::intent::{ActionIntent, IntentOperation};
use super::{ActionTier, ExecutorTier, RoutedCall, TierDecline};
use crate::automation::types::ElementQuery;
use crate::automation::AutomationService;

pub const API_CALL_TOOL: &str = "api_call";
pub const UI_CLICK_TOOL: &str = "ui_click";
pub const BROWSER_NAVIGATE_TOOL: &str = "browser_navigate";

const RETRIEVAL_METHOD: &str = "GET";
const URL_PARAMETER: &str = "url";
const METHOD_PARAMETER: &str = "method";
const TARGET_PARAMETER: &str = "target";
const ELEMENT_ID_KEY: &str = "element_id";
const SINGLE_ELEMENT_MATCH: usize = 1;

/// The accessibility services are real on macOS and Windows and a permanent
/// erroring stub elsewhere, so the tier reports an unsupported platform rather
/// than an unavailable driver the user could go and fix.
const ACCESSIBILITY_SUPPORTED: bool = cfg!(any(target_os = "macos", windows));

pub trait AccessibilityProbe: Send + Sync {
    fn is_supported(&self) -> bool;
    fn locate(&self, phrase: &str, window: Option<&str>) -> Result<Option<String>>;
}

#[async_trait]
pub trait BrowserTransportProbe: Send + Sync {
    async fn connected_tab(&self) -> Result<Option<String>>;
}

pub struct NativeAccessibilityProbe {
    automation: Option<Arc<AutomationService>>,
}

impl NativeAccessibilityProbe {
    pub fn new(automation: Option<Arc<AutomationService>>) -> Self {
        Self { automation }
    }
}

impl AccessibilityProbe for NativeAccessibilityProbe {
    fn is_supported(&self) -> bool {
        ACCESSIBILITY_SUPPORTED
    }

    fn locate(&self, phrase: &str, window: Option<&str>) -> Result<Option<String>> {
        let automation = self
            .automation
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!(AUTOMATION_SERVICE_MISSING))?;

        let query = ElementQuery {
            window: window.map(str::to_string),
            name: Some(phrase.to_string()),
            max_results: Some(SINGLE_ELEMENT_MATCH),
            ..ElementQuery::default()
        };

        let found = automation.native.find_elements(None, &query)?;
        Ok(found.first().map(|element| element.id.clone()))
    }
}

const AUTOMATION_SERVICE_MISSING: &str = "native automation service is not available";
const BROWSER_STATE_MISSING: &str = "browser automation state is not available";

pub struct DesktopBrowserTransportProbe {
    app_handle: Option<tauri::AppHandle>,
}

impl DesktopBrowserTransportProbe {
    pub fn new(app_handle: Option<tauri::AppHandle>) -> Self {
        Self { app_handle }
    }
}

#[async_trait]
impl BrowserTransportProbe for DesktopBrowserTransportProbe {
    async fn connected_tab(&self) -> Result<Option<String>> {
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

        Ok(state.resolve_cdp_tab(None, false, None).await.ok())
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

        Ok(RoutedCall {
            tier: ExecutorTier::Api,
            tool: API_CALL_TOOL.to_string(),
            parameters: serde_json::json!({
                URL_PARAMETER: url,
                METHOD_PARAMETER: RETRIEVAL_METHOD,
            }),
        })
    }
}

pub struct UiTier {
    probe: Arc<dyn AccessibilityProbe>,
}

impl UiTier {
    pub fn new(probe: Arc<dyn AccessibilityProbe>) -> Self {
        Self { probe }
    }
}

#[async_trait]
impl ActionTier for UiTier {
    fn tier(&self) -> ExecutorTier {
        ExecutorTier::Ui
    }

    async fn assess(&self, intent: &ActionIntent) -> Result<RoutedCall, TierDecline> {
        if !self.probe.is_supported() {
            return Err(TierDecline::PlatformUnsupported {
                platform: std::env::consts::OS.to_string(),
            });
        }

        if !intent.is_single_operation() {
            return Err(TierDecline::MultipleOperations {
                clauses: intent.clauses,
            });
        }

        if intent.operation != IntentOperation::Invoke {
            return Err(TierDecline::OutOfScope);
        }

        let Some(phrase) = intent.target_phrase.as_deref() else {
            return Err(TierDecline::OutOfScope);
        };

        match self.probe.locate(phrase, intent.application.as_deref()) {
            Ok(Some(element_id)) => Ok(RoutedCall {
                tier: ExecutorTier::Ui,
                tool: UI_CLICK_TOOL.to_string(),
                parameters: serde_json::json!({
                    TARGET_PARAMETER: { ELEMENT_ID_KEY: element_id },
                }),
            }),
            Ok(None) => Err(TierDecline::TargetNotFound {
                query: phrase.to_string(),
            }),
            Err(error) => Err(TierDecline::DriverUnavailable {
                detail: error.to_string(),
            }),
        }
    }
}

pub struct BrowserTier {
    probe: Arc<dyn BrowserTransportProbe>,
}

impl BrowserTier {
    pub fn new(probe: Arc<dyn BrowserTransportProbe>) -> Self {
        Self { probe }
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

        let Some(url) = intent.web_url.as_deref() else {
            return Err(TierDecline::OutOfScope);
        };

        match self.probe.connected_tab().await {
            Ok(Some(_)) => Ok(RoutedCall {
                tier: ExecutorTier::Browser,
                tool: BROWSER_NAVIGATE_TOOL.to_string(),
                parameters: serde_json::json!({ URL_PARAMETER: url }),
            }),
            Ok(None) => Err(TierDecline::TargetNotFound {
                query: url.to_string(),
            }),
            Err(error) => Err(TierDecline::DriverUnavailable {
                detail: error.to_string(),
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct StubAccessibility {
        result: fn() -> Result<Option<String>>,
    }

    impl AccessibilityProbe for StubAccessibility {
        fn is_supported(&self) -> bool {
            true
        }

        fn locate(&self, _phrase: &str, _window: Option<&str>) -> Result<Option<String>> {
            (self.result)()
        }
    }

    struct StubBrowser {
        result: fn() -> Result<Option<String>>,
    }

    #[async_trait]
    impl BrowserTransportProbe for StubBrowser {
        async fn connected_tab(&self) -> Result<Option<String>> {
            (self.result)()
        }
    }

    fn ui_tier(result: fn() -> Result<Option<String>>) -> UiTier {
        UiTier::new(Arc::new(StubAccessibility { result }))
    }

    fn browser_tier(result: fn() -> Result<Option<String>>) -> BrowserTier {
        BrowserTier::new(Arc::new(StubBrowser { result }))
    }

    struct UnsupportedPlatform;

    impl AccessibilityProbe for UnsupportedPlatform {
        fn is_supported(&self) -> bool {
            false
        }

        fn locate(&self, _phrase: &str, _window: Option<&str>) -> Result<Option<String>> {
            unreachable!("an unsupported platform is answered before the tree is read")
        }
    }

    #[tokio::test]
    async fn the_ui_tier_declines_a_platform_with_no_accessibility_service() {
        let intent = ActionIntent::parse("click the Send button", None);
        let decline = UiTier::new(Arc::new(UnsupportedPlatform))
            .assess(&intent)
            .await
            .expect_err("declined");

        assert!(matches!(decline, TierDecline::PlatformUnsupported { .. }));
    }

    #[tokio::test]
    async fn the_api_tier_takes_a_retrieval_of_an_absolute_url() {
        let intent = ActionIntent::parse("read https://example.invalid/pricing", None);
        let call = ApiTier.assess(&intent).await.expect("accepted");

        assert_eq!(call.tier, ExecutorTier::Api);
        assert_eq!(call.tool, API_CALL_TOOL);
        assert_eq!(
            call.parameters
                .get(METHOD_PARAMETER)
                .and_then(|m| m.as_str()),
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
    async fn the_ui_tier_takes_an_invocation_whose_element_the_tree_exposes() {
        let intent = ActionIntent::parse("click the Send button in Slack", None);
        let call = ui_tier(|| Ok(Some(String::from("ax-42"))))
            .assess(&intent)
            .await
            .expect("accepted");

        assert_eq!(call.tier, ExecutorTier::Ui);
        assert_eq!(call.tool, UI_CLICK_TOOL);
        assert_eq!(
            call.parameters
                .get(TARGET_PARAMETER)
                .and_then(|target| target.get(ELEMENT_ID_KEY))
                .and_then(|id| id.as_str()),
            Some("ax-42")
        );
    }

    #[tokio::test]
    async fn the_ui_tier_declines_when_the_tree_has_no_such_element() {
        let intent = ActionIntent::parse("click the Send button", None);
        let decline = ui_tier(|| Ok(None))
            .assess(&intent)
            .await
            .expect_err("declined");

        assert!(matches!(decline, TierDecline::TargetNotFound { .. }));
    }

    #[tokio::test]
    async fn the_ui_tier_declines_when_the_driver_cannot_be_reached() {
        let intent = ActionIntent::parse("click the Send button", None);
        let decline = ui_tier(|| Err(anyhow::anyhow!(AUTOMATION_SERVICE_MISSING)))
            .assess(&intent)
            .await
            .expect_err("declined");

        assert!(matches!(decline, TierDecline::DriverUnavailable { .. }));
    }

    #[tokio::test]
    async fn the_ui_tier_declines_an_unnamed_target() {
        let intent = ActionIntent::parse(
            "click whichever one of these seven similar looking controls is right",
            None,
        );
        let decline = ui_tier(|| Ok(Some(String::from("ax-42"))))
            .assess(&intent)
            .await
            .expect_err("declined");

        assert!(matches!(decline, TierDecline::OutOfScope));
    }

    #[tokio::test]
    async fn the_browser_tier_takes_a_web_target_when_a_tab_is_connected() {
        let intent = ActionIntent::parse("open https://example.invalid/inbox", None);
        let call = browser_tier(|| Ok(Some(String::from("tab-1"))))
            .assess(&intent)
            .await
            .expect("accepted");

        assert_eq!(call.tier, ExecutorTier::Browser);
        assert_eq!(call.tool, BROWSER_NAVIGATE_TOOL);
    }

    #[tokio::test]
    async fn the_browser_tier_declines_when_no_tab_is_connected() {
        let intent = ActionIntent::parse("open https://example.invalid/inbox", None);
        let decline = browser_tier(|| Ok(None))
            .assess(&intent)
            .await
            .expect_err("declined");

        assert!(matches!(decline, TierDecline::TargetNotFound { .. }));
    }

    #[tokio::test]
    async fn every_tier_declines_a_multi_operation_utterance() {
        let intent = ActionIntent::parse("read https://example.invalid then click Send", None);

        assert!(matches!(
            ApiTier.assess(&intent).await,
            Err(TierDecline::MultipleOperations { .. })
        ));
        assert!(matches!(
            ui_tier(|| Ok(Some(String::from("ax-42"))))
                .assess(&intent)
                .await,
            Err(TierDecline::MultipleOperations { .. })
        ));
        assert!(matches!(
            browser_tier(|| Ok(Some(String::from("tab-1"))))
                .assess(&intent)
                .await,
            Err(TierDecline::MultipleOperations { .. })
        ));
    }
}
