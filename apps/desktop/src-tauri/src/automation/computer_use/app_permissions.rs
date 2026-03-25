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
