//! Log redaction utilities for preventing accidental secret leakage in logs.
//!
//! Provides functions to redact common secret patterns (API keys, tokens, passwords)
//! from strings before they are written to log output. Applied to tracing calls that
//! log user-supplied data such as terminal commands or script content.

use once_cell::sync::Lazy;
use regex::Regex;

/// Patterns that match common secret formats. Each tuple is (regex, replacement label).
static REDACTION_PATTERNS: Lazy<Vec<(Regex, &'static str)>> = Lazy::new(|| {
    vec![
        // OpenAI API keys
        (
            Regex::new(r"sk-[a-zA-Z0-9_-]{20,}").expect("static regex"),
            "[REDACTED_API_KEY]",
        ),
        // Anthropic API keys
        (
            Regex::new(r"sk-ant-[a-zA-Z0-9_-]{20,}").expect("static regex"),
            "[REDACTED_ANTHROPIC_KEY]",
        ),
        // Generic bearer tokens
        (
            Regex::new(r"(?i)bearer\s+[a-zA-Z0-9._\-/+=]{20,}").expect("static regex"),
            "Bearer [REDACTED_TOKEN]",
        ),
        // Generic API key patterns in key=value or key:value format
        (
            Regex::new(r#"(?i)(api[_-]?key|apikey|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[=:]\s*['"]?[a-zA-Z0-9_\-/.+=]{16,}['"]?"#).expect("static regex"),
            "$1=[REDACTED]",
        ),
        // AWS access keys
        (
            Regex::new(r"AKIA[A-Z0-9]{16}").expect("static regex"),
            "[REDACTED_AWS_KEY]",
        ),
        // GitHub tokens
        (
            Regex::new(r"gh[ps]_[a-zA-Z0-9]{36,}").expect("static regex"),
            "[REDACTED_GITHUB_TOKEN]",
        ),
        // Password patterns in commands
        (
            Regex::new(r"(?i)(-p|--password[= ])\s*\S+").expect("static regex"),
            "$1 [REDACTED]",
        ),
    ]
});

/// Redact known secret patterns from the given text.
///
/// Returns a new string with sensitive values replaced by placeholder labels.
/// Safe to call on any string; returns the original if no patterns match.
pub fn redact_secrets(text: &str) -> String {
    let mut result = text.to_string();
    for (pattern, replacement) in REDACTION_PATTERNS.iter() {
        result = pattern.replace_all(&result, *replacement).to_string();
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_redact_openai_key() {
        let input = "curl -H 'Authorization: Bearer sk-1234567890abcdef1234567890abcdef' https://api.openai.com";
        let result = redact_secrets(input);
        assert!(!result.contains("sk-1234567890abcdef"));
        assert!(result.contains("[REDACTED"));
    }

    #[test]
    fn test_redact_aws_key() {
        let input = "export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE";
        let result = redact_secrets(input);
        assert!(!result.contains("AKIAIOSFODNN7EXAMPLE"));
    }

    #[test]
    fn test_no_false_positive_on_normal_text() {
        let input = "ls -la /home/user/projects";
        let result = redact_secrets(input);
        assert_eq!(input, result);
    }
}
