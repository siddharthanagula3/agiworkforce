//! Log redaction utilities for preventing accidental secret leakage in logs.
//!
//! Provides functions to redact common secret patterns (API keys, tokens, passwords)
//! from strings before they are written to log output. Applied to tracing calls that
//! log user-supplied data such as terminal commands or script content.

use once_cell::sync::Lazy;
use regex::Regex;

/// Patterns that match common secret formats. Each tuple is (regex, replacement label).
/// Order matters: more specific patterns (e.g. sk-ant-) must appear before generic
/// patterns (e.g. sk-) to avoid partial matches.
static REDACTION_PATTERNS: Lazy<Vec<(Regex, &'static str)>> = Lazy::new(|| {
    vec![
        // Anthropic API keys (before generic sk- pattern)
        (
            Regex::new(r"sk-ant-[a-zA-Z0-9_-]{20,}").expect("static regex"),
            "[REDACTED_ANTHROPIC_KEY]",
        ),
        // OpenAI API keys
        (
            Regex::new(r"sk-[a-zA-Z0-9_-]{20,}").expect("static regex"),
            "[REDACTED_API_KEY]",
        ),
        // Google AI / Firebase API keys (AIzaSy prefix)
        (
            Regex::new(r"AIzaSy[a-zA-Z0-9_-]{33}").expect("static regex"),
            "[REDACTED_GOOGLE_KEY]",
        ),
        // Groq API keys
        (
            Regex::new(r"gsk_[a-zA-Z0-9]{48,}").expect("static regex"),
            "[REDACTED_GROQ_KEY]",
        ),
        // Stripe API keys (secret, publishable, restricted)
        (
            Regex::new(r"(?:sk|pk|rk)_(?:test|live)_[a-zA-Z0-9]{24,}").expect("static regex"),
            "[REDACTED_STRIPE_KEY]",
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
        // GitHub tokens (classic)
        (
            Regex::new(r"gh[ps]_[a-zA-Z0-9]{36,}").expect("static regex"),
            "[REDACTED_GITHUB_TOKEN]",
        ),
        // GitHub fine-grained personal access tokens
        (
            Regex::new(r"github_pat_[a-zA-Z0-9_]{22,}").expect("static regex"),
            "[REDACTED_GITHUB_TOKEN]",
        ),
        // Password patterns in commands
        (
            Regex::new(r"(?i)(-p|--password[= ])\s*\S+").expect("static regex"),
            "$1 [REDACTED]",
        ),
        // Connection strings with embedded credentials (postgres, mysql, mongodb, redis)
        (
            Regex::new(r"(?i)(postgres|mysql|mongodb|redis)://[^:]+:[^@]+@").expect("static regex"),
            "$1://[CREDENTIALS_REDACTED]@",
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

    #[test]
    fn test_redact_google_key() {
        let input = "GOOGLE_API_KEY=AIzaSyA1234567890abcdefghijklmnopqrstuv";
        let result = redact_secrets(input);
        assert!(!result.contains("AIzaSy"));
        assert!(result.contains("[REDACTED_GOOGLE_KEY]"));
    }

    #[test]
    fn test_redact_stripe_key() {
        let input = "sk_test_1234567890abcdefghijklmnop";
        let result = redact_secrets(input);
        assert!(!result.contains("sk_test_"));
        assert!(result.contains("[REDACTED_STRIPE_KEY]"));
    }

    #[test]
    fn test_redact_groq_key() {
        let input = "export GROQ_API_KEY=gsk_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKL";
        let result = redact_secrets(input);
        assert!(!result.contains("gsk_"));
        assert!(result.contains("[REDACTED_GROQ_KEY]"));
    }

    #[test]
    fn test_redact_connection_string() {
        let input = "DATABASE_URL=postgres://admin:s3cretP@ss@db.example.com:5432/mydb";
        let result = redact_secrets(input);
        assert!(!result.contains("s3cretP@ss"));
        assert!(result.contains("[CREDENTIALS_REDACTED]"));
    }

    #[test]
    fn test_redact_github_fine_grained_token() {
        let input = "GITHUB_TOKEN=github_pat_abcdef1234567890ABCDEF";
        let result = redact_secrets(input);
        assert!(!result.contains("github_pat_"));
        assert!(result.contains("[REDACTED_GITHUB_TOKEN]"));
    }
}
