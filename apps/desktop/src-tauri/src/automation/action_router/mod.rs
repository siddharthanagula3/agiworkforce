//! Resolves which executor drives one classified action.
//!
//! The order is fixed in code, not left to tool choice: a connector or API,
//! then accessibility, then the DOM, then the visual observe-plan-act loop as
//! the last resort. Each tier answers from a typed capability check, so a tier
//! is skipped only for a reason the decision records, and the visual loop is
//! reached only after every cheaper tier has said no.

pub mod dispatch;
pub mod intent;
pub mod tiers;

use anyhow::Result;
use async_trait::async_trait;
use serde::Serialize;
use std::sync::Arc;

pub use dispatch::{DispatchError, TierDispatch};
pub use intent::{ActionIntent, IntentOperation};
pub use tiers::{
    AccessibilityProbe, ApiTier, BrowserTier, BrowserTransportProbe, DesktopBrowserTransportProbe,
    NativeAccessibilityProbe, UiTier,
};

use crate::automation::AutomationService;

/// The tier that runs when every other tier declines. It is not a member of the
/// tier list, so no configuration can leave an action with nowhere to go and
/// none can put vision ahead of a cheaper driver.
pub const FALLBACK_TIER: ExecutorTier = ExecutorTier::Visual;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutorTier {
    Api,
    Ui,
    Browser,
    Visual,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "decline", rename_all = "snake_case")]
pub enum TierDecline {
    /// The intent does not address anything this tier drives.
    OutOfScope,
    /// The utterance carries more operations than one existing tool call.
    MultipleOperations { clauses: usize },
    /// The tier's driver is a permanent stub on this operating system.
    PlatformUnsupported { platform: String },
    /// The driver exists but could not be reached on this run.
    DriverUnavailable { detail: String },
    /// The driver was reached and the target is not there.
    TargetNotFound { query: String },
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutedCall {
    pub tier: ExecutorTier,
    pub tool: String,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TierAssessment {
    pub tier: ExecutorTier,
    pub decline: TierDecline,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutingDecision {
    pub intent: ActionIntent,
    pub selected: ExecutorTier,
    pub call: Option<RoutedCall>,
    pub declined: Vec<TierAssessment>,
}

impl RoutingDecision {
    pub fn is_visual(&self) -> bool {
        self.selected == FALLBACK_TIER
    }
}

#[async_trait]
pub trait ActionTier: Send + Sync {
    fn tier(&self) -> ExecutorTier;
    async fn assess(&self, intent: &ActionIntent) -> Result<RoutedCall, TierDecline>;
}

pub struct ActionRouter {
    tiers: Vec<Arc<dyn ActionTier>>,
}

impl ActionRouter {
    pub fn new(tiers: Vec<Arc<dyn ActionTier>>) -> Self {
        Self { tiers }
    }

    pub fn for_desktop(
        automation: Option<Arc<AutomationService>>,
        app_handle: Option<tauri::AppHandle>,
    ) -> Self {
        Self::new(vec![
            Arc::new(ApiTier),
            Arc::new(UiTier::new(Arc::new(NativeAccessibilityProbe::new(
                automation,
            )))),
            Arc::new(BrowserTier::new(Arc::new(
                DesktopBrowserTransportProbe::new(app_handle),
            ))),
        ])
    }

    pub async fn route(&self, intent: ActionIntent) -> RoutingDecision {
        let mut declined = Vec::new();

        for tier in &self.tiers {
            match tier.assess(&intent).await {
                Ok(call) => {
                    return RoutingDecision {
                        intent,
                        selected: tier.tier(),
                        call: Some(call),
                        declined,
                    }
                }
                Err(decline) => declined.push(TierAssessment {
                    tier: tier.tier(),
                    decline,
                }),
            }
        }

        RoutingDecision {
            intent,
            selected: FALLBACK_TIER,
            call: None,
            declined,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FixedTier {
        tier: ExecutorTier,
        verdict: fn() -> Result<RoutedCall, TierDecline>,
    }

    #[async_trait]
    impl ActionTier for FixedTier {
        fn tier(&self) -> ExecutorTier {
            self.tier
        }

        async fn assess(&self, _intent: &ActionIntent) -> Result<RoutedCall, TierDecline> {
            (self.verdict)()
        }
    }

    fn accepting(tier: ExecutorTier) -> Arc<dyn ActionTier> {
        Arc::new(FixedTier {
            tier,
            verdict: || {
                Ok(RoutedCall {
                    tier: ExecutorTier::Api,
                    tool: String::from("api_call"),
                    parameters: serde_json::json!({}),
                })
            },
        })
    }

    fn declining(tier: ExecutorTier) -> Arc<dyn ActionTier> {
        Arc::new(FixedTier {
            tier,
            verdict: || Err(TierDecline::OutOfScope),
        })
    }

    fn intent() -> ActionIntent {
        ActionIntent::parse("click the Send button", None)
    }

    #[tokio::test]
    async fn the_first_tier_that_can_act_takes_the_action() {
        let router = ActionRouter::new(vec![
            declining(ExecutorTier::Api),
            accepting(ExecutorTier::Ui),
            accepting(ExecutorTier::Browser),
        ]);

        let decision = router.route(intent()).await;

        assert_eq!(decision.selected, ExecutorTier::Ui);
        assert!(decision.call.is_some());
        assert_eq!(
            decision
                .declined
                .iter()
                .map(|assessment| assessment.tier)
                .collect::<Vec<_>>(),
            vec![ExecutorTier::Api]
        );
    }

    #[tokio::test]
    async fn an_earlier_tier_is_never_skipped_for_a_later_one() {
        let router = ActionRouter::new(vec![
            accepting(ExecutorTier::Api),
            accepting(ExecutorTier::Ui),
        ]);

        let decision = router.route(intent()).await;

        assert_eq!(decision.selected, ExecutorTier::Api);
        assert!(decision.declined.is_empty());
    }

    #[tokio::test]
    async fn every_decline_falls_through_to_the_visual_loop() {
        let router = ActionRouter::new(vec![
            declining(ExecutorTier::Api),
            declining(ExecutorTier::Ui),
            declining(ExecutorTier::Browser),
        ]);

        let decision = router.route(intent()).await;

        assert!(decision.is_visual());
        assert_eq!(decision.selected, ExecutorTier::Visual);
        assert!(decision.call.is_none());
        assert_eq!(
            decision
                .declined
                .iter()
                .map(|assessment| assessment.tier)
                .collect::<Vec<_>>(),
            vec![ExecutorTier::Api, ExecutorTier::Ui, ExecutorTier::Browser]
        );
    }

    #[tokio::test]
    async fn an_empty_tier_list_still_reaches_the_visual_loop() {
        let decision = ActionRouter::new(Vec::new()).route(intent()).await;

        assert!(decision.is_visual());
        assert!(decision.declined.is_empty());
    }

    #[tokio::test]
    async fn the_recorded_declines_name_their_reason() {
        let router = ActionRouter::new(vec![Arc::new(FixedTier {
            tier: ExecutorTier::Ui,
            verdict: || {
                Err(TierDecline::TargetNotFound {
                    query: String::from("Send"),
                })
            },
        })]);

        let decision = router.route(intent()).await;
        let recorded = serde_json::to_value(&decision.declined).expect("serialize");

        assert_eq!(
            recorded,
            serde_json::json!([{
                "tier": "ui",
                "decline": { "decline": "target_not_found", "query": "Send" }
            }])
        );
    }

    #[tokio::test]
    async fn the_default_desktop_router_asks_the_three_tiers_in_order() {
        let router = ActionRouter::for_desktop(None, None);

        assert_eq!(
            router
                .tiers
                .iter()
                .map(|tier| tier.tier())
                .collect::<Vec<_>>(),
            vec![ExecutorTier::Api, ExecutorTier::Ui, ExecutorTier::Browser]
        );
    }
}
