//! Which browser a task runs in.
//!.

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;

use super::{BrowserState, ExtensionBridge, PlaywrightBridge};
use crate::sys::error::{Error, Result};

pub const CLOUD_BROWSER_UNAVAILABLE: &str =
    "Cloud browser sessions are not available: no remote browser backend is deployed. \
     Run this in the built-in browser, or in your own Chrome through the AGI extension.";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BrowserSessionKind {
    UserChrome,
    BuiltIn,
    Cloud,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSessionCapability {
    pub kind: BrowserSessionKind,
    pub available: bool,
    pub isolated_profile: bool,
    pub survives_client_disconnect: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unavailable_reason: Option<String>,
}

impl BrowserSessionKind {
    pub const ALL: [BrowserSessionKind; 3] = [
        BrowserSessionKind::UserChrome,
        BrowserSessionKind::BuiltIn,
        BrowserSessionKind::Cloud,
    ];

    pub fn capability(self) -> BrowserSessionCapability {
        match self {
            BrowserSessionKind::UserChrome => BrowserSessionCapability {
                kind: self,
                available: true,
                isolated_profile: false,
                survives_client_disconnect: false,
                unavailable_reason: None,
            },
            BrowserSessionKind::BuiltIn => BrowserSessionCapability {
                kind: self,
                available: true,
                isolated_profile: true,
                survives_client_disconnect: false,
                unavailable_reason: None,
            },
            BrowserSessionKind::Cloud => BrowserSessionCapability {
                kind: self,
                available: false,
                isolated_profile: true,
                survives_client_disconnect: true,
                unavailable_reason: Some(CLOUD_BROWSER_UNAVAILABLE.to_string()),
            },
        }
    }
}

/// The backend a resolved session drives. Cloud has no variant here because
/// there is nothing to drive; `BrowserState::session` refuses before this is.
pub enum BrowserSessionTarget<'a> {
    UserChrome(&'a Arc<Mutex<ExtensionBridge>>),
    BuiltIn(&'a Arc<Mutex<PlaywrightBridge>>),
}

impl BrowserSessionTarget<'_> {
    pub fn kind(&self) -> BrowserSessionKind {
        match self {
            BrowserSessionTarget::UserChrome(_) => BrowserSessionKind::UserChrome,
            BrowserSessionTarget::BuiltIn(_) => BrowserSessionKind::BuiltIn,
        }
    }
}

pub fn browser_session_capabilities() -> Vec<BrowserSessionCapability> {
    BrowserSessionKind::ALL
        .iter()
        .map(|kind| kind.capability())
        .collect()
}

/// How much of the person's own world a session reaches, ordered so that a
/// larger number is a larger reach. The Rust half of `browser-selection.ts`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BrowserSiteAccess {
    IsolatedRemote,
    IsolatedLocal,
    UserProfile,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BrowserDeclineReason {
    NotPresentOnThisSurface,
    Unavailable,
    WouldBroadenAccess,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserDeclined {
    pub kind: BrowserSessionKind,
    pub reason: BrowserDeclineReason,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSelection {
    pub kind: Option<BrowserSessionKind>,
    pub via_fallback: bool,
    pub declined: Vec<BrowserDeclined>,
}

impl BrowserSessionKind {
    /// Least privilege first, so an unconstrained pick lands on the narrowest
    /// session that can actually run.
    pub const SELECTION_ORDER: [BrowserSessionKind; 3] = [
        BrowserSessionKind::Cloud,
        BrowserSessionKind::BuiltIn,
        BrowserSessionKind::UserChrome,
    ];

    pub fn site_access(self) -> BrowserSiteAccess {
        match self {
            BrowserSessionKind::UserChrome => BrowserSiteAccess::UserProfile,
            BrowserSessionKind::BuiltIn => BrowserSiteAccess::IsolatedLocal,
            BrowserSessionKind::Cloud => BrowserSiteAccess::IsolatedRemote,
        }
    }

    pub fn broadens_over(self, chosen: BrowserSessionKind) -> bool {
        self.site_access() > chosen.site_access()
    }
}

/// Picks the session to run in. A fallback may only narrow what the run can
/// reach: a task that asked for an isolated session is refused rather than.
pub fn select_browser_session(
    requested: Option<BrowserSessionKind>,
    present: &[BrowserSessionKind],
) -> BrowserSelection {
    let mut order: Vec<BrowserSessionKind> = Vec::with_capacity(BrowserSessionKind::ALL.len());
    if let Some(kind) = requested {
        order.push(kind);
    }
    order.extend(
        BrowserSessionKind::SELECTION_ORDER
            .iter()
            .copied()
            .filter(|kind| Some(*kind) != requested),
    );

    let mut declined = Vec::new();
    for kind in order {
        let is_fallback = requested.is_some_and(|wanted| wanted != kind);
        if let Some(wanted) = requested {
            if is_fallback && kind.broadens_over(wanted) {
                declined.push(BrowserDeclined {
                    kind,
                    reason: BrowserDeclineReason::WouldBroadenAccess,
                });
                continue;
            }
        }
        if !kind.capability().available {
            declined.push(BrowserDeclined {
                kind,
                reason: BrowserDeclineReason::Unavailable,
            });
            continue;
        }
        if !present.contains(&kind) {
            declined.push(BrowserDeclined {
                kind,
                reason: BrowserDeclineReason::NotPresentOnThisSurface,
            });
            continue;
        }
        return BrowserSelection {
            kind: Some(kind),
            via_fallback: is_fallback,
            declined,
        };
    }

    BrowserSelection {
        kind: None,
        via_fallback: false,
        declined,
    }
}

impl BrowserState {
    /// Routes a requested session kind to its backend, or refuses. There is no
    /// fallback arm on purpose.
    pub fn session(&self, kind: BrowserSessionKind) -> Result<BrowserSessionTarget<'_>> {
        match kind {
            BrowserSessionKind::UserChrome => Ok(BrowserSessionTarget::UserChrome(&self.extension)),
            BrowserSessionKind::BuiltIn => Ok(BrowserSessionTarget::BuiltIn(&self.playwright)),
            BrowserSessionKind::Cloud => Err(Error::ConfigurationError(
                CLOUD_BROWSER_UNAVAILABLE.to_string(),
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn state() -> BrowserState {
        BrowserState::new(None)
            .await
            .expect("browser state constructs without a Tauri handle")
    }

    #[test]
    fn the_three_kinds_are_distinct_and_serialize_as_the_contract_names() {
        assert_eq!(
            serde_json::to_string(&BrowserSessionKind::UserChrome).unwrap(),
            "\"user-chrome\""
        );
        assert_eq!(
            serde_json::to_string(&BrowserSessionKind::BuiltIn).unwrap(),
            "\"built-in\""
        );
        assert_eq!(
            serde_json::to_string(&BrowserSessionKind::Cloud).unwrap(),
            "\"cloud\""
        );
        assert_ne!(BrowserSessionKind::UserChrome, BrowserSessionKind::BuiltIn);
        assert_ne!(BrowserSessionKind::BuiltIn, BrowserSessionKind::Cloud);
    }

    #[test]
    fn only_the_cloud_session_promises_isolation_that_outlives_the_client() {
        let user_chrome = BrowserSessionKind::UserChrome.capability();
        assert!(user_chrome.available);
        assert!(!user_chrome.isolated_profile);
        assert!(!user_chrome.survives_client_disconnect);

        let built_in = BrowserSessionKind::BuiltIn.capability();
        assert!(built_in.available);
        assert!(built_in.isolated_profile);
        assert!(!built_in.survives_client_disconnect);

        let cloud = BrowserSessionKind::Cloud.capability();
        assert!(cloud.isolated_profile);
        assert!(cloud.survives_client_disconnect);
    }

    #[test]
    fn the_cloud_session_reports_unavailable_with_a_reason_rather_than_pretending() {
        let cloud = BrowserSessionKind::Cloud.capability();
        assert!(!cloud.available);
        let reason = cloud
            .unavailable_reason
            .expect("cloud states why it cannot run");
        assert!(reason.contains("not available"));
        assert!(reason.contains("built-in browser"));
    }

    #[tokio::test]
    async fn requesting_a_cloud_session_fails_instead_of_falling_back_to_the_users_chrome() {
        let state = state().await;
        let error = state
            .session(BrowserSessionKind::Cloud)
            .err()
            .expect("a cloud session cannot be opened while no backend exists");
        assert!(error
            .to_string()
            .contains("Cloud browser sessions are not available"));
    }

    #[tokio::test]
    async fn the_available_kinds_route_to_their_own_backends() {
        let state = state().await;
        assert_eq!(
            state
                .session(BrowserSessionKind::UserChrome)
                .map(|target| target.kind())
                .unwrap(),
            BrowserSessionKind::UserChrome
        );
        assert_eq!(
            state
                .session(BrowserSessionKind::BuiltIn)
                .map(|target| target.kind())
                .unwrap(),
            BrowserSessionKind::BuiltIn
        );
    }

    #[test]
    fn an_unconstrained_pick_takes_the_narrowest_session_that_is_present() {
        let selection = select_browser_session(
            None,
            &[BrowserSessionKind::BuiltIn, BrowserSessionKind::UserChrome],
        );
        assert_eq!(selection.kind, Some(BrowserSessionKind::BuiltIn));
        assert!(!selection.via_fallback);
        assert!(selection
            .declined
            .iter()
            .any(|entry| entry.kind == BrowserSessionKind::Cloud));
    }

    #[test]
    fn a_cloud_request_is_refused_rather_than_run_in_the_signed_in_chrome() {
        let selection = select_browser_session(
            Some(BrowserSessionKind::Cloud),
            &[BrowserSessionKind::BuiltIn, BrowserSessionKind::UserChrome],
        );
        assert_eq!(selection.kind, None);
        for kind in [BrowserSessionKind::BuiltIn, BrowserSessionKind::UserChrome] {
            let entry = selection
                .declined
                .iter()
                .find(|entry| entry.kind == kind)
                .expect("every broader session is declined by name");
            assert_eq!(entry.reason, BrowserDeclineReason::WouldBroadenAccess);
        }
    }

    #[test]
    fn a_fallback_may_narrow_what_the_run_reaches_but_never_widen_it() {
        let narrowing = select_browser_session(
            Some(BrowserSessionKind::UserChrome),
            &[BrowserSessionKind::BuiltIn],
        );
        assert_eq!(narrowing.kind, Some(BrowserSessionKind::BuiltIn));
        assert!(narrowing.via_fallback);

        let widening = select_browser_session(
            Some(BrowserSessionKind::BuiltIn),
            &[BrowserSessionKind::UserChrome],
        );
        assert_eq!(widening.kind, None);
        assert!(BrowserSessionKind::UserChrome.broadens_over(BrowserSessionKind::BuiltIn));
        assert!(!BrowserSessionKind::BuiltIn.broadens_over(BrowserSessionKind::UserChrome));
    }

    #[test]
    fn a_surface_that_drives_nothing_gets_no_session_at_all() {
        let selection = select_browser_session(None, &[]);
        assert_eq!(selection.kind, None);
        assert_eq!(selection.declined.len(), BrowserSessionKind::ALL.len());
    }

    #[test]
    fn every_kind_is_advertised_so_a_caller_can_see_what_it_cannot_have() {
        let capabilities = browser_session_capabilities();
        assert_eq!(capabilities.len(), BrowserSessionKind::ALL.len());
        assert_eq!(
            capabilities.iter().filter(|c| !c.available).count(),
            1,
            "exactly one kind is unavailable today, the cloud browser"
        );
    }
}
