#![allow(dead_code)]
//! Policy evaluation engine — matches tool calls against declarative rules.
//!
//! Rules are loaded from `.agiworkforce/policy.toml` in the workspace root.
//! Format:
//! ```toml
//! [[rules]]
//! tool = "run_command"
//! pattern = "npm test"      # regex against command args
//! decision = "allow"        # allow | deny | ask
//! priority = 100            # 0-999, higher = more specific
//!
//! [[rules]]
//! tool = "write_file"
//! pattern = ".*\\.env$"     # deny writing .env files
//! decision = "deny"
//! priority = 500
//! ```

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Decision for a tool call after policy evaluation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyDecision {
    /// Auto-approve without user confirmation.
    Allow,
    /// Block execution entirely.
    Deny,
    /// Ask the user for confirmation (default if no rule matches).
    Ask,
}

/// A single policy rule from the TOML config.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyRule {
    /// Tool name to match (e.g., "run_command", "write_file", "*").
    pub tool: String,

    /// Regex pattern to match against the tool's primary argument.
    /// For run_command: matches against the command string.
    /// For write_file/edit_file: matches against the file path.
    #[serde(default)]
    pub pattern: Option<String>,

    /// The decision when this rule matches.
    pub decision: String,

    /// Priority (0-999). Higher priority rules override lower ones.
    /// Default: 0.
    #[serde(default)]
    pub priority: u16,

    /// Optional human-readable reason for the rule.
    #[serde(default)]
    pub reason: Option<String>,
}

/// Workspace policy loaded from `.agiworkforce/policy.toml`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WorkspacePolicy {
    #[serde(default)]
    pub rules: Vec<PolicyRule>,
}

/// Policy engine that evaluates tool calls against workspace rules.
pub struct PolicyEngine {
    policy: WorkspacePolicy,
}

impl PolicyEngine {
    /// Load policy from workspace `.agiworkforce/policy.toml`.
    /// Returns an empty policy if the file doesn't exist.
    pub fn load_workspace(workspace_root: &Path) -> Result<Self> {
        let policy_path = workspace_root.join(".agiworkforce").join("policy.toml");

        if !policy_path.exists() {
            return Ok(Self {
                policy: WorkspacePolicy::default(),
            });
        }

        let contents = std::fs::read_to_string(&policy_path)
            .with_context(|| format!("Failed to read {}", policy_path.display()))?;

        let policy: WorkspacePolicy = toml::from_str(&contents)
            .with_context(|| format!("Failed to parse {}", policy_path.display()))?;

        // Validate priority ranges
        for (i, rule) in policy.rules.iter().enumerate() {
            if rule.priority > 999 {
                anyhow::bail!(
                    "Rule {} has priority {} (max 999) in {}",
                    i + 1,
                    rule.priority,
                    policy_path.display()
                );
            }
            // Validate decision string
            match rule.decision.as_str() {
                "allow" | "deny" | "ask" => {}
                other => {
                    anyhow::bail!(
                        "Rule {} has invalid decision '{}' (must be allow/deny/ask) in {}",
                        i + 1,
                        other,
                        policy_path.display()
                    );
                }
            }
        }

        Ok(Self { policy })
    }

    /// Evaluate a tool call against loaded policy rules.
    /// Returns the decision from the highest-priority matching rule,
    /// or `Ask` if no rules match.
    pub fn evaluate(&self, tool_name: &str, primary_arg: &str) -> PolicyDecision {
        let mut best_match: Option<(&PolicyRule, u16)> = None;

        for rule in &self.policy.rules {
            // Check tool name match (supports "*" wildcard)
            if rule.tool != "*" && rule.tool != tool_name {
                continue;
            }

            // Check pattern match (if specified)
            if let Some(ref pattern) = rule.pattern {
                match regex::Regex::new(pattern) {
                    Ok(re) => {
                        if !re.is_match(primary_arg) {
                            continue;
                        }
                    }
                    Err(e) => {
                        eprintln!("[policy] invalid regex pattern '{}': {e}, skipping rule", pattern);
                        continue;
                    }
                }
            }

            // This rule matches — check if it's higher priority
            match best_match {
                Some((_, prev_prio)) if rule.priority <= prev_prio => {}
                _ => best_match = Some((rule, rule.priority)),
            }
        }

        match best_match {
            Some((rule, _)) => match rule.decision.as_str() {
                "allow" => PolicyDecision::Allow,
                "deny" => PolicyDecision::Deny,
                _ => PolicyDecision::Ask,
            },
            None => PolicyDecision::Ask,
        }
    }

    /// Returns true if any rules are loaded.
    pub fn has_rules(&self) -> bool {
        !self.policy.rules.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_engine(rules: Vec<PolicyRule>) -> PolicyEngine {
        PolicyEngine {
            policy: WorkspacePolicy { rules },
        }
    }

    #[test]
    fn test_no_rules_returns_ask() {
        let engine = make_engine(vec![]);
        assert_eq!(engine.evaluate("run_command", "ls"), PolicyDecision::Ask);
    }

    #[test]
    fn test_wildcard_tool_match() {
        let engine = make_engine(vec![PolicyRule {
            tool: "*".into(),
            pattern: None,
            decision: "allow".into(),
            priority: 0,
            reason: None,
        }]);
        assert_eq!(
            engine.evaluate("any_tool", "any_arg"),
            PolicyDecision::Allow
        );
    }

    #[test]
    fn test_specific_tool_match() {
        let engine = make_engine(vec![PolicyRule {
            tool: "run_command".into(),
            pattern: Some("npm test".into()),
            decision: "allow".into(),
            priority: 0,
            reason: None,
        }]);
        assert_eq!(
            engine.evaluate("run_command", "npm test"),
            PolicyDecision::Allow
        );
        assert_eq!(
            engine.evaluate("run_command", "rm -rf /"),
            PolicyDecision::Ask
        );
    }

    #[test]
    fn test_deny_overrides_allow_by_priority() {
        let engine = make_engine(vec![
            PolicyRule {
                tool: "run_command".into(),
                pattern: None,
                decision: "allow".into(),
                priority: 100,
                reason: None,
            },
            PolicyRule {
                tool: "run_command".into(),
                pattern: Some("rm".into()),
                decision: "deny".into(),
                priority: 500,
                reason: None,
            },
        ]);
        assert_eq!(
            engine.evaluate("run_command", "rm -rf /"),
            PolicyDecision::Deny
        );
        assert_eq!(
            engine.evaluate("run_command", "ls -la"),
            PolicyDecision::Allow
        );
    }

    #[test]
    fn test_env_file_deny() {
        let engine = make_engine(vec![PolicyRule {
            tool: "write_file".into(),
            pattern: Some(r".*\.env$".into()),
            decision: "deny".into(),
            priority: 500,
            reason: Some("Never write .env files".into()),
        }]);
        assert_eq!(
            engine.evaluate("write_file", ".env"),
            PolicyDecision::Deny
        );
        assert_eq!(
            engine.evaluate("write_file", "src/main.rs"),
            PolicyDecision::Ask
        );
    }
}
