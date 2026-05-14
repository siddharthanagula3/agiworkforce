//! Per-App Permission System for Computer Use.
//!
//! Controls which applications the Computer Use agent is allowed to interact with.
//! Matches Claude Desktop's model: each app can be Allowed, Denied, or AskEveryTime.

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Bundle IDs (macOS) and process names (Windows) that are ALWAYS blocked
/// regardless of user-configured permissions. Mirrors Claude Cowork's
/// hard-blocked categories: investment / brokerage / crypto / banking.
///
/// On macOS, matches against the foreground app's bundle identifier.
/// On Windows, matches against the substring of the executable name (case
/// insensitive — e.g. `robinhood.exe`, `coinbase.exe`).
pub const ALWAYS_BLOCKED_BUNDLE_IDS: &[&str] = &[
    // Brokerage / trading
    "com.robinhood.app",
    "com.robinhood",
    "com.fidelity",
    "com.fidelity.investments",
    "com.schwab",
    "com.tdameritrade",
    "com.etrade.investing",
    "com.vanguard",
    "com.interactivebrokers.tws",
    // Crypto exchanges & wallets
    "com.coinbase.app",
    "com.coinbase.wallet",
    "com.binance",
    "com.binance.us",
    "com.kraken",
    "com.gemini.exchange",
    "io.metamask",
    "io.ledger.live",
    "com.ledger.live",
    "com.trezor.suite",
    // Consumer banking
    "com.chase.sig.Chase",
    "com.bankofamerica.cashpro",
    "com.bofa.iphone",
    "com.wellsfargo.mobile",
    "com.citi.citimobile",
    "com.capitalone.android",
    // Payment apps
    "com.venmo",
    "com.squareup.cash",
    "com.paypal.ppclient",
    "com.zellepay.zelle",
];

/// URL host patterns that should be treated as ALWAYS blocked when the
/// agent is targeting a browser tab via the browser bridge. Used for
/// regex-style substring matches against `window.location.host`.
///
/// Mirrors the bundle-id list above but covers the case where the user
/// is on the web app instead of the native client.
pub const ALWAYS_BLOCKED_URL_HOSTS: &[&str] = &[
    "robinhood.com",
    "fidelity.com",
    "schwab.com",
    "tdameritrade.com",
    "etrade.com",
    "vanguard.com",
    "interactivebrokers.com",
    "coinbase.com",
    "binance.com",
    "binance.us",
    "kraken.com",
    "gemini.com",
    "metamask.io",
    "ledger.com",
    "trezor.io",
    "chase.com",
    "bankofamerica.com",
    "wellsfargo.com",
    "citi.com",
    "capitalone.com",
    "venmo.com",
    "cash.app",
    "paypal.com",
    "zellepay.com",
];

/// Returns `true` if the given bundle id (or process name) is on the
/// always-blocked list. Case-insensitive substring matching against the
/// listed identifiers.
pub fn is_always_blocked_bundle(identifier: &str) -> bool {
    let lowered = identifier.to_lowercase();
    ALWAYS_BLOCKED_BUNDLE_IDS
        .iter()
        .any(|blocked| lowered.contains(&blocked.to_lowercase()))
}

/// Returns `true` if the given URL host is on the always-blocked list.
/// Case-insensitive substring matching.
pub fn is_always_blocked_host(host: &str) -> bool {
    let lowered = host.to_lowercase();
    ALWAYS_BLOCKED_URL_HOSTS
        .iter()
        .any(|blocked| lowered.contains(blocked))
}

/// Permission status for an application.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionStatus {
    /// App is allowed for computer use.
    Allowed,
    /// App is explicitly denied.
    Denied,
    /// User will be prompted each time.
    AskEveryTime,
}

/// Permission record for a single application.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppPermission {
    /// Human-readable application name (e.g., "Safari", "Terminal").
    pub app_name: String,
    /// OS-specific bundle identifier (e.g., "com.apple.Safari" on macOS).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bundle_id: Option<String>,
    /// Current permission status.
    pub status: PermissionStatus,
    /// When the permission was granted (if Allowed).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub granted_at: Option<DateTime<Utc>>,
    /// When the permission was denied (if Denied).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub denied_at: Option<DateTime<Utc>>,
}

/// Request for app permission (sent to frontend for user decision).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppPermissionRequest {
    /// Unique request identifier.
    pub request_id: String,
    /// Application name that needs permission.
    pub app_name: String,
    /// Bundle identifier if known.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bundle_id: Option<String>,
    /// Description of the intended action.
    pub action_description: String,
}

/// User's response to an app permission request.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionDecision {
    /// Allow for this session only.
    AllowOnce,
    /// Allow permanently.
    AlwaysAllow,
    /// Deny this app.
    Deny,
}

/// Manages per-app permissions for Computer Use.
pub struct AppPermissionManager {
    permissions: Arc<RwLock<HashMap<String, AppPermission>>>,
}

impl AppPermissionManager {
    /// Creates a new manager with no permissions.
    pub fn new() -> Self {
        Self {
            permissions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Creates a manager pre-loaded with permissions.
    pub fn with_permissions(permissions: Vec<AppPermission>) -> Self {
        let map: HashMap<String, AppPermission> = permissions
            .into_iter()
            .map(|p| (p.app_name.clone(), p))
            .collect();
        Self {
            permissions: Arc::new(RwLock::new(map)),
        }
    }

    /// Checks the permission status for an app by name.
    pub async fn check_app(&self, app_name: &str) -> Option<PermissionStatus> {
        let perms = self.permissions.read().await;
        perms.get(app_name).map(|p| p.status)
    }

    /// Returns the effective permission decision for an app, taking into
    /// account both the hardcoded `ALWAYS_BLOCKED_BUNDLE_IDS` refuse-list
    /// and any user-configured per-app permission. Apps not in either
    /// list default to `AskEveryTime` so the user is prompted on first use.
    pub async fn decide(
        &self,
        app_name: &str,
        bundle_id: Option<&str>,
    ) -> PermissionStatus {
        // Hard-blocked categories (investment / crypto / banking) always win.
        if let Some(bid) = bundle_id {
            if is_always_blocked_bundle(bid) {
                return PermissionStatus::Denied;
            }
        }
        if is_always_blocked_bundle(app_name) {
            return PermissionStatus::Denied;
        }

        // Check user-configured permission by app name first, then bundle id.
        let perms = self.permissions.read().await;
        if let Some(p) = perms.get(app_name) {
            return p.status;
        }
        if let Some(bid) = bundle_id {
            if let Some(p) = perms.values().find(|p| p.bundle_id.as_deref() == Some(bid)) {
                return p.status;
            }
        }

        // Default: prompt the user (Cowork-style first-encounter behavior).
        PermissionStatus::AskEveryTime
    }

    /// Sets the permission for an app.
    pub async fn set_permission(&self, app_name: &str, status: PermissionStatus) {
        let mut perms = self.permissions.write().await;
        let now = Utc::now();
        let entry = perms.entry(app_name.to_string()).or_insert(AppPermission {
            app_name: app_name.to_string(),
            bundle_id: None,
            status,
            granted_at: None,
            denied_at: None,
        });
        entry.status = status;
        match status {
            PermissionStatus::Allowed => entry.granted_at = Some(now),
            PermissionStatus::Denied => entry.denied_at = Some(now),
            PermissionStatus::AskEveryTime => {}
        }
    }

    /// Sets the permission with bundle ID context.
    pub async fn set_permission_with_bundle(
        &self,
        app_name: &str,
        bundle_id: Option<&str>,
        status: PermissionStatus,
    ) {
        let mut perms = self.permissions.write().await;
        let now = Utc::now();
        let entry = perms.entry(app_name.to_string()).or_insert(AppPermission {
            app_name: app_name.to_string(),
            bundle_id: bundle_id.map(String::from),
            status,
            granted_at: None,
            denied_at: None,
        });
        entry.status = status;
        if bundle_id.is_some() {
            entry.bundle_id = bundle_id.map(String::from);
        }
        match status {
            PermissionStatus::Allowed => entry.granted_at = Some(now),
            PermissionStatus::Denied => entry.denied_at = Some(now),
            PermissionStatus::AskEveryTime => {}
        }
    }

    /// Removes a permission entry.
    pub async fn remove_permission(&self, app_name: &str) {
        let mut perms = self.permissions.write().await;
        perms.remove(app_name);
    }

    /// Returns all permissions as a list.
    pub async fn list_permissions(&self) -> Vec<AppPermission> {
        let perms = self.permissions.read().await;
        perms.values().cloned().collect()
    }

    /// Returns only allowed apps.
    pub async fn allowed_apps(&self) -> Vec<AppPermission> {
        let perms = self.permissions.read().await;
        perms
            .values()
            .filter(|p| p.status == PermissionStatus::Allowed)
            .cloned()
            .collect()
    }

    /// Returns only denied apps.
    pub async fn denied_apps(&self) -> Vec<AppPermission> {
        let perms = self.permissions.read().await;
        perms
            .values()
            .filter(|p| p.status == PermissionStatus::Denied)
            .cloned()
            .collect()
    }

    /// Clears all permissions.
    pub async fn clear_all(&self) {
        let mut perms = self.permissions.write().await;
        perms.clear();
    }

    /// Serializes permissions to JSON for persistence.
    pub async fn to_json(&self) -> Result<String> {
        let perms = self.permissions.read().await;
        let list: Vec<&AppPermission> = perms.values().collect();
        Ok(serde_json::to_string(&list)?)
    }

    /// Loads permissions from a JSON string.
    pub async fn from_json(&self, json: &str) -> Result<()> {
        let list: Vec<AppPermission> = serde_json::from_str(json)?;
        let mut perms = self.permissions.write().await;
        perms.clear();
        for p in list {
            perms.insert(p.app_name.clone(), p);
        }
        Ok(())
    }
}

impl Default for AppPermissionManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_set_and_check_permission() {
        let mgr = AppPermissionManager::new();
        assert!(mgr.check_app("Safari").await.is_none());

        mgr.set_permission("Safari", PermissionStatus::Allowed).await;
        assert_eq!(
            mgr.check_app("Safari").await,
            Some(PermissionStatus::Allowed)
        );
    }

    #[tokio::test]
    async fn test_list_allowed_denied() {
        let mgr = AppPermissionManager::new();
        mgr.set_permission("Safari", PermissionStatus::Allowed).await;
        mgr.set_permission("Terminal", PermissionStatus::Denied).await;
        mgr.set_permission("Finder", PermissionStatus::Allowed).await;

        let allowed = mgr.allowed_apps().await;
        assert_eq!(allowed.len(), 2);

        let denied = mgr.denied_apps().await;
        assert_eq!(denied.len(), 1);
        assert_eq!(denied[0].app_name, "Terminal");
    }

    #[tokio::test]
    async fn test_json_roundtrip() {
        let mgr = AppPermissionManager::new();
        mgr.set_permission("Safari", PermissionStatus::Allowed).await;
        mgr.set_permission("Terminal", PermissionStatus::Denied).await;

        let json = mgr.to_json().await.unwrap();

        let mgr2 = AppPermissionManager::new();
        mgr2.from_json(&json).await.unwrap();

        assert_eq!(
            mgr2.check_app("Safari").await,
            Some(PermissionStatus::Allowed)
        );
        assert_eq!(
            mgr2.check_app("Terminal").await,
            Some(PermissionStatus::Denied)
        );
    }

    #[tokio::test]
    async fn test_remove_permission() {
        let mgr = AppPermissionManager::new();
        mgr.set_permission("Safari", PermissionStatus::Allowed).await;
        mgr.remove_permission("Safari").await;
        assert!(mgr.check_app("Safari").await.is_none());
    }
}
