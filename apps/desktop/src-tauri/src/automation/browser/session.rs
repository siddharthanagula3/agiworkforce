//! Which browser a task runs in.
//!
//! The kinds and their capabilities are the Rust half of
//! `packages/contracts/types/src/browser-session.ts`, which owns the wire names
//! and the sentence a person reads. Kept as an explicit enum rather than
//! inferred from which bridge happens to be connected, because the three
//! sessions differ in ways a caller must choose deliberately: the user's own
//! Chrome carries their signed-in profile, the built-in webview carries its
//! own, and the cloud session would carry its own AND keep running once the
//! client goes away.
//!
//! The cloud backend does not exist. Asking for it is refused in words. It must
//! never degrade into the user's Chrome: that would run an isolated-by-request
//! task inside their logged-in profile and leave its cookies and history there.

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
/// there is nothing to drive; `BrowserState::session` refuses before this is
/// constructed.
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
