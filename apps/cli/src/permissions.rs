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
        let contents = std::fs::read_to_string(&path).context("Failed to read permissions.toml")?;
        let store: PermissionStore =
            toml::from_str(&contents).context("Failed to parse permissions.toml")?;
        Ok(store)
    }

    pub fn save(&self) -> Result<()> {
        let dir = crate::config::CliConfig::config_dir()?;
        std::fs::create_dir_all(&dir)?;
        let path = Self::path()?;
        let contents = toml::to_string_pretty(self).context("Failed to serialize permissions")?;
        std::fs::write(&path, &contents).context("Failed to write permissions.toml")?;
        // Restrict file permissions to owner-only (contains allow/deny lists)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
        }
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

    /// Tabbed display matching Claude Code /permissions UX.
    ///
    /// `tab` is one of: "allow" | "deny" | "session" | "workspace" | "recently-denied".
    /// Unknown values fall back to "allow".
    ///
    /// Output format:
    ///   Permissions:  Recently denied  Allow  Ask  Deny  Workspace
    ///
    ///   AGI Workforce won't ask before using allowed tools.
    ///
    ///   Search…
    ///
    ///    1.  Add a new rule…
    ///    2.  Bash(cargo *)
    ///    3.  …
    ///
    ///   /  tab switch · return · Esc cancel
    pub fn display_tab(&self, tab: &str) -> String {
        let tabs = ["recently-denied", "allow", "session", "deny", "workspace"];
        let active = match tab.to_lowercase().as_str() {
            "allow" | "always-allow" => "allow",
            "deny" | "always-deny" => "deny",
            "session" => "session",
            "workspace" => "workspace",
            "recently-denied" | "recent" => "recently-denied",
            _ => "allow",
        };

        // Build tab header line, marking the active tab with [brackets].
        let tab_header: Vec<String> = tabs
            .iter()
            .map(|&t| {
                let label = match t {
                    "recently-denied" => "Recently denied",
                    "allow" => "Allow",
                    "session" => "Session",
                    "deny" => "Deny",
                    "workspace" => "Workspace",
                    _ => t,
                };
                if t == active {
                    format!("[{}]", label)
                } else {
                    label.to_string()
                }
            })
            .collect();

        let hint = match active {
            "allow" => "AGI Workforce won't ask before using allowed tools.",
            "deny" => "AGI Workforce will never use denied tools.",
            "session" => "Session-scoped approvals (cleared on exit).",
            "workspace" => "Workspace rules apply only in this directory.",
            "recently-denied" => "Tools denied during this session.",
            _ => "",
        };

        let rules: Vec<String> = match active {
            "allow" => {
                let mut v: Vec<String> = self.always_allow.iter().cloned().collect();
                v.sort();
                v
            }
            "deny" => {
                let mut v: Vec<String> = self.always_deny.iter().cloned().collect();
                v.sort();
                v
            }
            "session" => {
                let mut v: Vec<String> = self.session_allow.iter().cloned().collect();
                v.sort();
                v
            }
            _ => vec![],
        };

        let mut out = String::new();
        out.push_str(&format!("Permissions:  {}\n\n", tab_header.join("  ")));
        out.push_str(&format!("  {}\n\n", hint));
        out.push_str("  Search…\n\n");

        out.push_str(&format!("   {:>2}.  Add a new rule…\n", 1));
        for (i, rule) in rules.iter().enumerate() {
            out.push_str(&format!("   {:>2}.  {}\n", i + 2, rule));
        }
        if rules.is_empty() {
            out.push_str("        (no rules)\n");
        }

        out.push('\n');
        out.push_str("  /  tab switch · return · Esc cancel\n");
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
        let display = store.display_tab("allow");
        // Tabbed header is always present
        assert!(display.contains("Permissions:"));
        assert!(display.contains("[Allow]"));
        // No rules means the empty-state marker
        assert!(display.contains("(no rules)"));
    }

    #[test]
    fn test_display_with_entries() {
        let mut store = PermissionStore::default();
        store.allow_always("npm test");
        let display = store.display_tab("allow");
        assert!(display.contains("Permissions:"));
        assert!(display.contains("npm test"));
        assert!(display.contains("Add a new rule"));
    }

    #[test]
    fn test_display_tab_deny() {
        let mut store = PermissionStore::default();
        store.deny_always("rm -rf");
        let display = store.display_tab("deny");
        assert!(display.contains("[Deny]"));
        assert!(display.contains("rm -rf"));
        assert!(display.contains("AGI Workforce will never use denied tools."));
    }

    #[test]
    fn test_display_tab_session() {
        let mut store = PermissionStore::default();
        store.allow_session("cargo test");
        let display = store.display_tab("session");
        assert!(display.contains("[Session]"));
        assert!(display.contains("cargo test"));
    }

    #[test]
    fn test_display_tab_unknown_falls_back_to_allow() {
        let store = PermissionStore::default();
        let display = store.display_tab("bogus");
        assert!(display.contains("[Allow]"));
    }

    #[test]
    fn test_display_tab_rules_sorted() {
        let mut store = PermissionStore::default();
        store.allow_always("zzz");
        store.allow_always("aaa");
        store.allow_always("mmm");
        let display = store.display_tab("allow");
        let aaa_pos = display.find("aaa").unwrap();
        let mmm_pos = display.find("mmm").unwrap();
        let zzz_pos = display.find("zzz").unwrap();
        assert!(aaa_pos < mmm_pos && mmm_pos < zzz_pos, "rules should be sorted");
    }

    #[test]
    fn test_display_tab_footer() {
        let store = PermissionStore::default();
        let display = store.display_tab("allow");
        assert!(display.contains("tab switch"));
        assert!(display.contains("Esc cancel"));
    }
}
