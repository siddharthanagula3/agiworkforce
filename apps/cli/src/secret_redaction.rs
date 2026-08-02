//! Shared CLI secret-redaction mechanics for persisted logs and explicit
//! Local→cloud payload previews. Product actions decide what content is in
//! scope; this module only performs deterministic value scrubbing.

use regex::Regex;
use std::sync::OnceLock;

fn patterns() -> &'static Vec<(Regex, &'static str)> {
    static PATTERNS: OnceLock<Vec<(Regex, &'static str)>> = OnceLock::new();
    PATTERNS.get_or_init(|| {
        vec![
            // Specific vendor formats must run before generic named/bearer rules.
            (
                Regex::new(r"sk-ant-[a-zA-Z0-9_-]{20,}").expect("Anthropic key regex"),
                "[REDACTED_ANTHROPIC_KEY]",
            ),
            (
                Regex::new(r"sk-[a-zA-Z0-9_-]{20,}").expect("OpenAI key regex"),
                "[REDACTED_API_KEY]",
            ),
            (
                Regex::new(r"AIza[a-zA-Z0-9_-]{30,}").expect("Google key regex"),
                "[REDACTED_GOOGLE_KEY]",
            ),
            (
                Regex::new(r"gsk_[a-zA-Z0-9]{48,}").expect("Groq key regex"),
                "[REDACTED_GROQ_KEY]",
            ),
            (
                Regex::new(r"(?:sk|pk|rk)_(?:test|live)_[a-zA-Z0-9]{24,}")
                    .expect("Stripe key regex"),
                "[REDACTED_STRIPE_KEY]",
            ),
            (
                Regex::new(r"(?:AKIA|ASIA)[A-Z0-9]{16}").expect("AWS key regex"),
                "[REDACTED_AWS_KEY]",
            ),
            (
                Regex::new(
                    r#"(?i)\baws[_-]?(secret[_-]?access[_-]?key|session[_-]?token)\b['"]?\s*[=:]\s*['"]?[^\s,'"}]{8,}['"]?"#,
                )
                .expect("AWS secret regex"),
                "aws_$1=[REDACTED]",
            ),
            (
                Regex::new(r"gh[pousr]_[a-zA-Z0-9]{30,}").expect("GitHub token regex"),
                "[REDACTED_GITHUB_TOKEN]",
            ),
            (
                Regex::new(r"github_pat_[a-zA-Z0-9_]{22,}").expect("GitHub PAT regex"),
                "[REDACTED_GITHUB_TOKEN]",
            ),
            (
                Regex::new(r"xai-[a-zA-Z0-9]{20,}").expect("xAI key regex"),
                "[REDACTED_XAI_KEY]",
            ),
            (
                Regex::new(r"xox[baprs]-[A-Za-z0-9-]{10,}").expect("Slack token regex"),
                "[REDACTED_SLACK_TOKEN]",
            ),
            (
                Regex::new(
                    r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
                )
                .expect("JWT regex"),
                "[REDACTED_JWT]",
            ),
            (
                Regex::new(r"(?i)bearer\s+[a-zA-Z0-9._\-/+=]{8,}")
                    .expect("bearer token regex"),
                "Bearer [REDACTED_TOKEN]",
            ),
            (
                Regex::new(
                    r#"(?i)\b(api[_-]?key|apikey|secret[_-]?key|secret|access[_-]?token|auth[_-]?token|token)\b['"]?\s*[=:]\s*['"]?[^\s,'"}]{8,}['"]?"#,
                )
                .expect("named secret regex"),
                "$1=[REDACTED]",
            ),
            (
                Regex::new(r"(?i)(-p|--password[= ])\s*\S+").expect("password flag regex"),
                "$1 [REDACTED]",
            ),
            (
                Regex::new(
                    r"(?i)(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis)://[^\s/:]+:[^\s]+@",
                )
                .expect("credential URL regex"),
                "$1://[CREDENTIALS_REDACTED]@",
            ),
            (
                Regex::new(
                    r"(?s)-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----.*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
                )
                .expect("private key regex"),
                "[REDACTED_PRIVATE_KEY]",
            ),
            (
                Regex::new(r"(?im)^.*\bpassw(?:or)?d\b.*$").expect("password line regex"),
                "[REDACTED LINE]",
            ),
        ]
    })
}

/// Redact known credential shapes without changing unrelated text.
pub fn redact_secrets(input: &str) -> String {
    let mut redacted = input.to_string();
    for (pattern, replacement) in patterns() {
        redacted = pattern.replace_all(&redacted, *replacement).into_owned();
    }
    redacted
}

#[cfg(test)]
mod tests {
    use super::redact_secrets;

    #[test]
    fn redacts_cross_provider_tokens_jwts_and_database_credentials() {
        let raw_secrets = [
            "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij",
            "AKIAIOSFODNN7EXAMPLE",
            "aws_secret_access_key=abcdefghijklmnopqrstuvwxyz0123456789ABCD",
            "AIzaSyA1234567890abcdefghijklmnopqrstuv",
            "gsk_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKL",
            "xai-abcdefghijklmnopqrstuvwxyz012345",
            "xoxb-1234567890-abcdefghijklmnop",
            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
            "postgres://alice:hunter2@db.example.com:5432/app",
        ];
        let redacted = redact_secrets(&raw_secrets.join("\n"));

        for secret in raw_secrets {
            assert!(!redacted.contains(secret), "secret survived: {secret}");
        }
        for marker in [
            "[REDACTED_GITHUB_TOKEN]",
            "[REDACTED_AWS_KEY]",
            "[REDACTED_GOOGLE_KEY]",
            "[REDACTED_GROQ_KEY]",
            "[REDACTED_XAI_KEY]",
            "[REDACTED_SLACK_TOKEN]",
            "[REDACTED_JWT]",
            "[CREDENTIALS_REDACTED]",
        ] {
            assert!(redacted.contains(marker), "missing marker: {marker}");
        }
    }

    #[test]
    fn redacts_named_short_secrets_without_destroying_normal_text() {
        assert_eq!(
            redact_secrets("use api_key = sk-test-secret"),
            "use api_key=[REDACTED]"
        );
        assert_eq!(
            redact_secrets("ordinary project context"),
            "ordinary project context"
        );
    }
}
