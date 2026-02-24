//! Shared dangerous-pattern definitions used by both `safety.rs` (ComputerUseSafety)
//! and `computer_use/safety.rs` (ComputerUseSafetyLayer).
//!
//! This module is the single source of truth for command/text patterns that are
//! considered dangerous in automation contexts.

use regex::Regex;
use std::sync::OnceLock;

/// Dangerous text/command patterns that should be blocked or flagged.
///
/// This is the canonical union of patterns previously defined in
/// `automation::safety` and `automation::computer_use::safety`.
static DANGEROUS_COMMAND_PATTERNS: OnceLock<Vec<Regex>> = OnceLock::new();

/// Dangerous keyboard shortcuts that should be blocked.
static DANGEROUS_KEY_COMBOS: OnceLock<Vec<String>> = OnceLock::new();

/// Returns the shared set of dangerous command/text regex patterns.
///
/// The list is initialised once and cached for the lifetime of the process.
pub fn dangerous_command_patterns() -> &'static Vec<Regex> {
    DANGEROUS_COMMAND_PATTERNS.get_or_init(|| {
        vec![
            // Destructive file-system commands
            Regex::new(r"(?i)rm\s+-rf").unwrap(),
            Regex::new(r"(?i)format\s+[a-z]:").unwrap(),
            Regex::new(r"(?i)del\s+/[fqs]").unwrap(),
            Regex::new(r"(?i)deltree").unwrap(),
            Regex::new(r"(?i)mkfs").unwrap(),
            // Sensitive system paths
            Regex::new(r"(?i)system32").unwrap(),
            Regex::new(r"(?i)/etc/passwd").unwrap(),
            Regex::new(r"(?i)~/.ssh").unwrap(),
            // Sensitive data keywords
            Regex::new(r"(?i)password|passwd|credential|api[_-]?key|secret|token").unwrap(),
            // Registry manipulation (Windows)
            Regex::new(r"(?i)regedit|reg\s+delete|reg\s+add").unwrap(),
            // Privileged destructive commands
            Regex::new(r"(?i)sudo\s+rm|sudo\s+dd").unwrap(),
        ]
    })
}

/// Returns the shared set of dangerous key combinations.
pub fn dangerous_key_combinations() -> &'static Vec<String> {
    DANGEROUS_KEY_COMBOS.get_or_init(|| {
        vec![
            "Alt+F4".to_string(),
            "Ctrl+Alt+Del".to_string(),
            "Win+L".to_string(),
        ]
    })
}

/// Dangerous task-level keywords checked against full task descriptions.
pub const DANGEROUS_TASK_KEYWORDS: &[&str] = &[
    "delete system",
    "format drive",
    "remove windows",
    "steal",
    "hack",
    "crack password",
    "bypass security",
    "disable firewall",
    "disable antivirus",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dangerous_command_patterns_initialise() {
        let patterns = dangerous_command_patterns();
        // Must contain at least the patterns that were in both modules
        assert!(patterns.len() >= 9, "expected at least 9 patterns, got {}", patterns.len());

        // Spot-check a few
        assert!(patterns.iter().any(|p| p.is_match("rm -rf /")));
        assert!(patterns.iter().any(|p| p.is_match("format c:")));
        assert!(patterns.iter().any(|p| p.is_match("del /f /s")));
        assert!(patterns.iter().any(|p| p.is_match("sudo rm -rf /")));
        assert!(patterns.iter().any(|p| p.is_match("/etc/passwd")));
        assert!(patterns.iter().any(|p| p.is_match("~/.ssh")));
    }

    #[test]
    fn test_dangerous_key_combinations() {
        let keys = dangerous_key_combinations();
        assert!(keys.contains(&"Alt+F4".to_string()));
        assert!(keys.contains(&"Ctrl+Alt+Del".to_string()));
        assert!(keys.contains(&"Win+L".to_string()));
    }

    #[test]
    fn test_safe_text_not_flagged() {
        let patterns = dangerous_command_patterns();
        let safe_texts = vec!["Hello world", "npm install", "cargo build", "git push"];
        for text in safe_texts {
            assert!(
                !patterns.iter().any(|p| p.is_match(text)),
                "Safe text '{}' was incorrectly flagged",
                text
            );
        }
    }
}
