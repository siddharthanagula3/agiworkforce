#![allow(dead_code, unused_imports)]
use std::path::{Path, PathBuf};
use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyRule {
    pub effect: PolicyEffect,
    pub matcher: PolicyMatcher,
    pub source: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PolicyEffect { Allow, Deny }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PolicyMatcher {
    Prefix(String), Regex(String), Heuristic(String), Program(String),
}

#[derive(Debug, Default)]
pub struct ExecPolicy { pub rules: Vec<PolicyRule> }

impl ExecPolicy {
    pub fn load() -> Result<Self> {
        let dir = dirs::home_dir().unwrap_or_default().join(".agiworkforce").join("rules");
        if !dir.exists() { return Ok(Self::default()); }
        let mut rules = Vec::new();
        for entry in std::fs::read_dir(&dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().is_some_and(|e| e == "rules") {
                let content = std::fs::read_to_string(&path)?;
                rules.extend(parse_rules(&content, &path));
            }
        }
        Ok(Self { rules })
    }
    pub fn evaluate(&self, command: &str) -> PolicyEvaluation {
        let trimmed = command.trim();
        for rule in &self.rules {
            let matches = match &rule.matcher {
                PolicyMatcher::Prefix(p) => trimmed.starts_with(p.as_str()),
                PolicyMatcher::Program(p) => trimmed.split_whitespace().next().unwrap_or("").rsplit('/').next().unwrap_or("") == p.as_str(),
                PolicyMatcher::Regex(pat) => regex::Regex::new(pat).map(|r| r.is_match(trimmed)).unwrap_or(false),
                PolicyMatcher::Heuristic(cmd) => trimmed.split_whitespace().next().unwrap_or("") == cmd.as_str(),
            };
            if matches {
                return match rule.effect {
                    PolicyEffect::Allow => PolicyEvaluation::Allowed { rule: rule.source.clone() },
                    PolicyEffect::Deny => PolicyEvaluation::Denied { rule: rule.source.clone() },
                };
            }
        }
        PolicyEvaluation::NoMatch
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PolicyEvaluation {
    Allowed { rule: String }, Denied { rule: String }, NoMatch,
}

fn parse_rules(content: &str, path: &Path) -> Vec<PolicyRule> {
    let fname = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let mut rules = Vec::new();
    for (i, line) in content.lines().enumerate() {
        let t = line.trim();
        if t.is_empty() || t.starts_with('#') { continue; }
        let parts: Vec<&str> = t.splitn(3, ' ').collect();
        if parts.len() < 3 { continue; }
        let effect = match parts[0] { "allow" => PolicyEffect::Allow, "deny" => PolicyEffect::Deny, _ => continue };
        let matcher = match parts[1] {
            "prefix" => PolicyMatcher::Prefix(parts[2].to_string()),
            "regex" => PolicyMatcher::Regex(parts[2].to_string()),
            "heuristic" => PolicyMatcher::Heuristic(parts[2].to_string()),
            "program" => PolicyMatcher::Program(parts[2].to_string()),
            _ => continue,
        };
        rules.push(PolicyRule { effect, matcher, source: format!("{}:{}: {}", fname, i + 1, t) });
    }
    rules
}
