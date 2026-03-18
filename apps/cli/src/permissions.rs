use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::PathBuf;

/// Persistent permission store for command approvals.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PermissionStore {
    /// Commands/prefixes that are always allowed (user said "always allow").
    #[serde(default)]
    pub always_allow: HashSet<String>,

    /// Commands/prefixes that are always denied.
    #[serde(default)]
    pub always_deny: HashSet<String>,

    /// Session-scoped approvals (not persisted, but tracked in memory).
    #[serde(skip)]
    pub session_allow: HashSet<String>,
}

impl PermissionStore {
    fn path() -> Result<PathBuf> {
        Ok(crate::config::CliConfig::config_dir()?.join("permissions.toml"))
    }

    pub fn load() -> Result<Self> {
        let path = Self::path()?;
        if !path.exists() {
            return Ok(Self::default());
        }
        let contents =
            std::fs::read_to_string(&path).context("Failed to read permissions.toml")?;
        let store: PermissionStore =
            toml::from_str(&contents).context("Failed to parse permissions.toml")?;
        Ok(store)
    }

    pub fn save(&self) -> Result<()> {
        let dir = crate::config::CliConfig::config_dir()?;
        std::fs::create_dir_all(&dir)?;
        let path = Self::path()?;
        let contents = toml::to_string_pretty(self).context("Failed to serialize permissions")?;
        std::fs::write(&path, contents).context("Failed to write permissions.toml")?;
        Ok(())
    }

    /// Check if a command is permitted (by prefix match against allow/deny lists).
    /// Returns Some(true) if allowed, Some(false) if denied, None if no match.
    #[allow(dead_code)]
    pub fn check(&self, command: &str) -> Option<bool> {
        let trimmed = command.trim();

        // Check deny list first (deny takes precedence).
        for denied in &self.always_deny {
            if trimmed.starts_with(denied.as_str()) {
                return Some(false);
            }
        }

        // Check allow lists.
        for allowed in self.always_allow.iter().chain(self.session_allow.iter()) {
            if trimmed.starts_with(allowed.as_str()) {
                return Some(true);
            }
        }

        None
    }

    /// Add a command prefix to the "always allow" persistent list.
    #[allow(dead_code)]
    pub fn allow_always(&mut self, prefix: &str) {
        self.always_allow.insert(prefix.to_string());
    }

    /// Add a command prefix to the session allow list.
    #[allow(dead_code)]
    pub fn allow_session(&mut self, prefix: &str) {
        self.session_allow.insert(prefix.to_string());
    }

    /// Add a command prefix to the "always deny" persistent list.
    #[allow(dead_code)]
    pub fn deny_always(&mut self, prefix: &str) {
        self.always_deny.insert(prefix.to_string());
    }

    /// Reset all permissions.
    pub fn reset(&mut self) {
        self.always_allow.clear();
        self.always_deny.clear();
        self.session_allow.clear();
    }

    /// Display current permissions for the /permissions command.
    pub fn display(&self) -> String {
        let mut out = String::new();

        if self.always_allow.is_empty()
            && self.always_deny.is_empty()
            && self.session_allow.is_empty()
        {
            return "No custom permissions configured.".to_string();
        }

        if !self.always_allow.is_empty() {
            out.push_str("Always Allow:\n");
            for cmd in &self.always_allow {
                out.push_str(&format!("  + {}\n", cmd));
            }
        }

        if !self.always_deny.is_empty() {
            out.push_str("Always Deny:\n");
            for cmd in &self.always_deny {
                out.push_str(&format!("  - {}\n", cmd));
            }
        }

        if !self.session_allow.is_empty() {
            out.push_str("Session Allow:\n");
            for cmd in &self.session_allow {
                out.push_str(&format!("  ~ {}\n", cmd));
            }
        }

        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_store_returns_none() {
        let store = PermissionStore::default();
        assert_eq!(store.check("ls -la"), None);
    }

    #[test]
    fn test_allow_always() {
        let mut store = PermissionStore::default();
        store.allow_always("npm");
        assert_eq!(store.check("npm install express"), Some(true));
        assert_eq!(store.check("cargo build"), None);
    }

    #[test]
    fn test_deny_takes_precedence() {
        let mut store = PermissionStore::default();
        store.allow_always("npm");
        store.deny_always("npm install");
        assert_eq!(store.check("npm install malware"), Some(false));
        assert_eq!(store.check("npm test"), Some(true));
    }

    #[test]
    fn test_session_allow() {
        let mut store = PermissionStore::default();
        store.allow_session("cargo build");
        assert_eq!(store.check("cargo build --release"), Some(true));
        assert_eq!(store.check("cargo test"), None);
    }

    #[test]
    fn test_reset() {
        let mut store = PermissionStore::default();
        store.allow_always("npm");
        store.deny_always("rm");
        store.allow_session("cargo");
        store.reset();
        assert_eq!(store.check("npm test"), None);
        assert_eq!(store.check("rm file"), None);
        assert_eq!(store.check("cargo build"), None);
    }

    #[test]
    fn test_display_empty() {
        let store = PermissionStore::default();
        assert!(store.display().contains("No custom permissions"));
    }

    #[test]
    fn test_display_with_entries() {
        let mut store = PermissionStore::default();
        store.allow_always("npm test");
        let display = store.display();
        assert!(display.contains("Always Allow"));
        assert!(display.contains("npm test"));
    }
}
