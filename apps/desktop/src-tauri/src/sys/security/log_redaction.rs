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
        // xAI API keys — ported from the TS redactor
        // (packages/platform/utils/src/logger.ts) to close the pattern-drift
        // gap flagged in the trust-boundary audit (desktop-trust-boundary-01).
        (
            Regex::new(r"xai-[a-zA-Z0-9]{20,}").expect("static regex"),
            "[REDACTED_XAI_KEY]",
        ),
        // JWTs (header.payload.signature) — ported from the TS redactor.
        (
            Regex::new(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")
                .expect("static regex"),
            "[REDACTED_JWT]",
        ),
        // Generic bearer tokens. Deliberately placed *after* all
        // vendor-specific formats above (sk-ant-/sk-/AIzaSy/gsk_/stripe/
        // AKIA/gh[ps]_/github_pat_/xai-/JWT) — same ordering the TS redactor
        // uses — so a vendor-specific label wins when a value happens to
        // match both a specific format and this generic one.
        (
            Regex::new(r"(?i)bearer\s+[a-zA-Z0-9._\-/+=]{20,}").expect("static regex"),
            "Bearer [REDACTED_TOKEN]",
        ),
        // Generic API key / bearer token patterns in key=value or key:value
        // format. Also placed after the vendor-specific patterns for the
        // same reason. Widened to also catch bare `secret`/`token` key names
        // (not just `secret_key`/`auth_token`/`access_token`) per the
        // trust-boundary audit (desktop-trust-boundary-01) — the existing
        // alternatives are kept, this only adds coverage. Without the
        // reordering above, this alone would swallow e.g. `GITHUB_TOKEN=...`
        // or `XAI_API_KEY=...` before the more specific label got a chance.
        (
            Regex::new(r#"(?i)(api[_-]?key|apikey|secret[_-]?key|secret|access[_-]?token|auth[_-]?token|token)['"]?\s*[=:]\s*['"]?[a-zA-Z0-9_\-/.+=]{16,}['"]?"#).expect("static regex"),
            "$1=[REDACTED]",
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
        // Payment-card-like digit runs: grouped 4-4-4-4, Amex 4-6-5, or a
        // contiguous 13-19 digit run starting with a plausible IIN (3-6).
        // Narrowed from a generic 13-19 digit run so epoch-millis timestamps
        // (leading 1) and hyphenated dates next to numeric IDs survive.
        (
            Regex::new(r"\b(?:\d{4}[ \t-]){3}\d{4}\b|\b\d{4}[ \t-]\d{6}[ \t-]\d{5}\b|\b[3-6]\d{12,18}\b").expect("static regex"),
            "[REDACTED]",
        ),
        // Password label at end-of-line with the value on the next line
        // (e.g. pretty-printed JSON `"password":\n  "hunter2"`). Must run
        // before the whole-line pattern below, which would otherwise redact
        // only the label line and leave the value line intact.
        (
            Regex::new(r#"(?im)^.*\bpassw(?:or)?d\b["']?\s*[:=][ \t]*\n[ \t]*\S+"#)
                .expect("static regex"),
            "[REDACTED LINE]",
        ),
        // Whole lines that mention "password"/"passwd" — catches form-label
        // style logging (e.g. `password: hunter2`) that the key=value
        // pattern above doesn't parse. Ported from the TS redactor; mirrors
        // its whole-line redaction rather than trying to isolate the value,
        // since labels and values are not reliably separated by `=`/`:` in
        // free-form command/log text.
        (
            Regex::new(r"(?im)^.*\bpassw(?:or)?d\b.*$").expect("static regex"),
            "[REDACTED LINE]",
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

    // --- desktop-trust-boundary-01: pattern-drift fixes below ---

    #[test]
    fn test_redact_xai_key() {
        let input = "export XAI_API_KEY=xai-abcdefghijklmnopqrstuvwxyz012345";
        let result = redact_secrets(input);
        assert!(!result.contains("xai-abcdefghijklmnopqrstuvwxyz"));
        assert!(result.contains("[REDACTED_XAI_KEY]"));
    }

    #[test]
    fn test_redact_jwt() {
        let input = "Authorization: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
        let result = redact_secrets(input);
        assert!(!result.contains("eyJhbGciOiJIUzI1NiJ9"));
        assert!(result.contains("[REDACTED_JWT]"));
    }

    #[test]
    fn test_redact_credit_card_digit_run() {
        let input = "card on file: 4111 1111 1111 1111";
        let result = redact_secrets(input);
        assert!(!result.contains("4111 1111 1111 1111"));
        assert!(result.contains("[REDACTED]"));
    }

    #[test]
    fn test_redact_password_line() {
        let input = "user: alice\npassword: hunter2\nhost: db.example.com";
        let result = redact_secrets(input);
        assert!(!result.contains("hunter2"));
        assert!(result.contains("[REDACTED LINE]"));
        // Unrelated lines are left alone.
        assert!(result.contains("user: alice"));
        assert!(result.contains("host: db.example.com"));
    }

    #[test]
    fn test_redact_bare_secret_and_token_key_value() {
        let secret_input = "secret: abcdefghijklmnopqrstuvwxyz";
        let secret_result = redact_secrets(secret_input);
        assert!(!secret_result.contains("abcdefghijklmnopqrstuvwxyz"));
        assert!(secret_result.contains("[REDACTED]"));

        let token_input = "token=abcdefghijklmnopqrstuvwxyz";
        let token_result = redact_secrets(token_input);
        assert!(!token_result.contains("abcdefghijklmnopqrstuvwxyz"));
        assert!(token_result.contains("[REDACTED]"));
    }

    #[test]
    fn test_bare_secret_widening_does_not_break_secret_key_capture() {
        // Regression guard: adding a bare `secret` alternative must not
        // change which branch matches `secret_key=...` (it should still be
        // captured by the more specific `secret[_-]?key` alternative, not
        // truncated at `secret`).
        let input = "secret_key=abcdefghijklmnopqrstuvwxyz";
        let result = redact_secrets(input);
        assert!(!result.contains("abcdefghijklmnopqrstuvwxyz"));
        assert!(result.contains("[REDACTED]"));
        assert!(!result.contains("_key=abcdefghijklmnopqrstuvwxyz"));
    }

    #[test]
    fn test_redact_password_next_line_value() {
        let input = "{\"password\":\n  \"hunter2\"}";
        let result = redact_secrets(input);
        assert!(!result.contains("hunter2"));
        assert!(result.contains("[REDACTED LINE]"));
    }

    #[test]
    fn test_redact_quoted_json_token_key() {
        let input = "curl -d '{\"token\": \"abcdefghijklmnopqrstuvwx\"}'";
        let result = redact_secrets(input);
        assert!(!result.contains("abcdefghijklmnopqrstuvwx"));
        assert!(result.contains("[REDACTED]"));
    }

    #[test]
    fn test_token_count_keys_survive() {
        let quoted = "\"token_count\": 123456";
        assert_eq!(redact_secrets(quoted), quoted);
        let bare = "token_count=12345678";
        assert_eq!(redact_secrets(bare), bare);
        // Values long enough to trip the secret-value length threshold: only
        // the `_count` key boundary keeps these out of the `token=` branch.
        let quoted_long = "\"token_count\": 12345678901234567890";
        assert_eq!(redact_secrets(quoted_long), quoted_long);
        let bare_long = "token_count=12345678901234567890";
        assert_eq!(redact_secrets(bare_long), bare_long);
    }

    #[test]
    fn test_card_pattern_negatives_survive() {
        let epoch_millis = "ts=1721469876543";
        assert_eq!(redact_secrets(epoch_millis), epoch_millis);
        let unix_ts = "started at 1721469876";
        assert_eq!(redact_secrets(unix_ts), unix_ts);
        let date_and_id = "2026-07-20 12345678";
        assert_eq!(redact_secrets(date_and_id), date_and_id);
    }

    #[test]
    fn test_contiguous_card_still_redacted() {
        let input = "card 4111111111111111";
        let result = redact_secrets(input);
        assert!(!result.contains("4111111111111111"));
        assert!(result.contains("[REDACTED]"));
    }
}
