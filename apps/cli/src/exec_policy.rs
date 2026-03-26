#![allow(dead_code, unused_imports)]
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyRule {
    pub effect: PolicyEffect,
    pub matcher: PolicyMatcher,
    pub source: String,
}

/// The effect of a matched policy rule on command execution.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PolicyEffect {
    /// Permit the command to execute without user confirmation.
    Allow,
    /// Block the command from executing. Deny always takes precedence over Allow.
    Deny,
}

/// Matching strategy for a policy rule against a command string.
#[derive(Debug, Clone)]
pub enum PolicyMatcher {
    /// Match if the command starts with the given prefix string.
    Prefix(String),
    /// Match if the command matches the given regular expression.
    Regex(regex::Regex),
    /// Match if the first word of the command equals the given program name.
    Heuristic(String),
    /// Match if the base program name (without path) equals the given name.
    Program(String),
}

impl Serialize for PolicyMatcher {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        match self {
            Self::Prefix(s) => {
                serializer.serialize_newtype_variant("PolicyMatcher", 0, "Prefix", s)
            }
            Self::Regex(r) => {
                serializer.serialize_newtype_variant("PolicyMatcher", 1, "Regex", r.as_str())
            }
            Self::Heuristic(s) => {
                serializer.serialize_newtype_variant("PolicyMatcher", 2, "Heuristic", s)
            }
            Self::Program(s) => {
                serializer.serialize_newtype_variant("PolicyMatcher", 3, "Program", s)
            }
        }
    }
}

impl<'de> Deserialize<'de> for PolicyMatcher {
    fn deserialize<D: serde::Deserializer<'de>>(
        deserializer: D,
    ) -> std::result::Result<Self, D::Error> {
        #[derive(Deserialize)]
        enum Raw {
            Prefix(String),
            Regex(String),
            Heuristic(String),
            Program(String),
        }
        match Raw::deserialize(deserializer)? {
            Raw::Prefix(s) => Ok(Self::Prefix(s)),
            Raw::Regex(s) => regex::Regex::new(&s)
                .map(Self::Regex)
                .map_err(serde::de::Error::custom),
            Raw::Heuristic(s) => Ok(Self::Heuristic(s)),
            Raw::Program(s) => Ok(Self::Program(s)),
        }
    }
}

#[derive(Debug, Default)]
pub struct ExecPolicy {
    pub rules: Vec<PolicyRule>,
}

impl ExecPolicy {
    pub fn load() -> Result<Self> {
        let home = match dirs::home_dir() {
            Some(h) => h,
            None => {
                eprintln!("exec_policy: could not determine home directory, skipping rule loading");
                return Ok(Self::default());
            }
        };
        let dir = home.join(".agiworkforce").join("rules");
        if !dir.exists() {
            return Ok(Self::default());
        }
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

        let rule_matches = |rule: &PolicyRule| -> bool {
            match &rule.matcher {
                PolicyMatcher::Prefix(p) => trimmed.starts_with(p.as_str()),
                PolicyMatcher::Program(p) => {
                    trimmed
                        .split_whitespace()
                        .next()
                        .unwrap_or("")
                        .rsplit('/')
                        .next()
                        .unwrap_or("")
                        == p.as_str()
                }
                PolicyMatcher::Regex(re) => re.is_match(trimmed),
                PolicyMatcher::Heuristic(cmd) => {
                    trimmed.split_whitespace().next().unwrap_or("") == cmd.as_str()
                }
            }
        };

        // Deny takes precedence: scan ALL deny rules first, regardless of order.
        for rule in &self.rules {
            if rule.effect == PolicyEffect::Deny && rule_matches(rule) {
                return PolicyEvaluation::Denied {
                    rule: rule.source.clone(),
                };
            }
        }

        // Then check allow rules (first match wins among allows).
        for rule in &self.rules {
            if rule.effect == PolicyEffect::Allow && rule_matches(rule) {
                return PolicyEvaluation::Allowed {
                    rule: rule.source.clone(),
                };
            }
        }

        PolicyEvaluation::NoMatch
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PolicyEvaluation {
    Allowed { rule: String },
    Denied { rule: String },
    NoMatch,
}

fn parse_rules(content: &str, path: &Path) -> Vec<PolicyRule> {
    let fname = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let mut rules = Vec::new();
    for (i, line) in content.lines().enumerate() {
        let line_num = i + 1;
        let t = line.trim();
        if t.is_empty() || t.starts_with('#') {
            continue;
        }
        let parts: Vec<&str> = t.splitn(3, ' ').collect();
        if parts.len() < 3 {
            eprintln!(
                "exec_policy: {}:{}: skipping malformed rule (too few parts): {}",
                fname, line_num, t
            );
            continue;
        }
        let effect = match parts[0] {
            "allow" => PolicyEffect::Allow,
            "deny" => PolicyEffect::Deny,
            other => {
                eprintln!(
                    "exec_policy: {}:{}: skipping rule with unknown effect '{}': {}",
                    fname, line_num, other, t
                );
                continue;
            }
        };
        let matcher = match parts[1] {
            "prefix" => PolicyMatcher::Prefix(parts[2].to_string()),
            "regex" => match regex::Regex::new(parts[2]) {
                Ok(re) => PolicyMatcher::Regex(re),
                Err(e) => {
                    eprintln!(
                        "exec_policy: {}:{}: skipping rule with invalid regex '{}': {}",
                        fname, line_num, parts[2], e
                    );
                    continue;
                }
            },
            "heuristic" => PolicyMatcher::Heuristic(parts[2].to_string()),
            "program" => PolicyMatcher::Program(parts[2].to_string()),
            other => {
                eprintln!(
                    "exec_policy: {}:{}: skipping rule with unknown matcher '{}': {}",
                    fname, line_num, other, t
                );
                continue;
            }
        };
        rules.push(PolicyRule {
            effect,
            matcher,
            source: format!("{}:{}: {}", fname, line_num, t),
        });
    }
    rules
}
