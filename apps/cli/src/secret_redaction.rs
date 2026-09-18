//! Shared CLI secret-redaction mechanics for persisted logs, tool output that
//! reaches the model, and explicit Local→cloud payload previews. Product
//! actions decide what content is in scope; this module only performs
//! deterministic value scrubbing.
//!
//! Two strengths are published. `redact_tool_output` runs the value-shaped
//! rules only, so command output and file reads keep every line the model
//! needs while credential material never survives. `redact_secrets` adds the
//! whole-line password sweep, which is safe for a log nobody reads back as
//! code but would blank legitimate source lines on the way to the model.

use regex::Regex;
use std::sync::OnceLock;

fn value_patterns() -> &'static Vec<(Regex, &'static str)> {
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
            // `-p` only counts as a flag when it is a whole argument: an
            // unanchored match mangles every hyphenated word (`raw-parallel`).
            (
                Regex::new(r"(?im)(^|[ \t])(-p)[ \t]+\S+").expect("password short flag regex"),
                "${1}${2} [REDACTED]",
            ),
            (
                Regex::new(r"(?i)(--password)([= \t][ \t]*)\S+").expect("password long flag regex"),
                "${1}${2}[REDACTED]",
            ),
            (
                Regex::new(
                    r#"(?i)\b(password|passwd|pwd)\b['"]?\s*[=:]\s*['"]?[^\s,'"}]{8,}['"]?"#,
                )
                .expect("password assignment regex"),
                "$1=[REDACTED]",
            ),
            // Any scheme, so a `git remote`/`git push` URL carrying userinfo is
            // redacted the same way a database URL is.
            (
                Regex::new(r"(?i)\b([a-z][a-z0-9+.-]*)://[^\s/:@]+:[^\s/@]+@")
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
        ]
    })
}

fn password_line_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN
        .get_or_init(|| Regex::new(r"(?im)^.*\bpassw(?:or)?d\b.*$").expect("password line regex"))
}

fn apply(input: &str, patterns: &[(Regex, &'static str)]) -> String {
    let mut redacted = input.to_string();
    for (pattern, replacement) in patterns {
        redacted = pattern.replace_all(&redacted, *replacement).into_owned();
    }
    redacted
}

/// Redact known credential shapes without changing unrelated text.
pub fn redact_secrets(input: &str) -> String {
    let redacted = apply(input, value_patterns());
    password_line_pattern()
        .replace_all(&redacted, "[REDACTED LINE]")
        .into_owned()
}

/// Redact credential values from tool output before it reaches the model, the
/// transcript, or the saved overflow file. Unlike [`redact_secrets`] this keeps
/// every line, so source code that merely mentions a password stays readable
/// while the values themselves do not survive.
pub fn redact_tool_output(input: &str) -> String {
    apply(input, value_patterns())
}

#[cfg(test)]
mod tests {
    use super::{redact_secrets, redact_tool_output};

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

    #[test]
    fn tool_output_redacts_command_output_carrying_an_api_key() {
        let transcript = redact_tool_output(
            "Exit code: 0\nOPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz0123\nDATABASE_URL=postgres://alice:hunter2@db.internal:5432/app\n",
        );

        assert!(!transcript.contains("sk-proj-abcdefghijklmnopqrstuvwxyz0123"));
        assert!(!transcript.contains("hunter2"));
        assert!(transcript.contains("[REDACTED_API_KEY]"));
        assert!(transcript.contains("[CREDENTIALS_REDACTED]"));
        assert!(transcript.starts_with("Exit code: 0\n"));
    }

    #[test]
    fn tool_output_redacts_a_git_remote_url_with_embedded_credentials() {
        let redacted =
            redact_tool_output("origin\thttps://agi:ghp_0123456789abcdefghijklmnopqrstuvwx@github.com/acme/app.git (push)");

        assert!(!redacted.contains("ghp_0123456789abcdefghijklmnopqrstuvwx"));
        assert!(redacted.contains("https://[CREDENTIALS_REDACTED]@github.com/acme/app.git"));
    }

    #[test]
    fn tool_output_keeps_source_code_that_only_mentions_secrets() {
        // The false-positive guard: a file read must survive intact when it
        // names a credential without carrying one.
        for line in [
            "interface Credentials { password: string; apiKey: string }",
            "const digest = sha256(password + salt);",
            "// rotate the api key every 90 days",
            "https://registry.example.com:8443/simple/index.html",
            "let checksum = \"9f2c4ae81b3d5f60a7c81e2d4b6f8a01\";",
        ] {
            assert_eq!(redact_tool_output(line), line, "mangled: {line}");
        }
    }

    #[test]
    fn a_hyphenated_word_is_not_a_password_flag() {
        for line in [
            "opened src/my-project/x",
            "raw-parallel-body",
            "--print-path /usr/bin",
            "fn handle_raw_parallel_body() -> Result<()>",
        ] {
            assert_eq!(redact_tool_output(line), line, "mangled: {line}");
            assert_eq!(redact_secrets(line), line, "mangled: {line}");
        }
    }

    #[test]
    fn a_standalone_password_flag_loses_its_value() {
        assert_eq!(
            redact_tool_output("mysql -u root -p hunter2"),
            "mysql -u root -p [REDACTED]"
        );
        assert_eq!(redact_tool_output("-p hunter2"), "-p [REDACTED]");
        assert_eq!(
            redact_tool_output("curl --password=hunter2 https://example.com"),
            "curl --password=[REDACTED] https://example.com"
        );
        assert_eq!(
            redact_tool_output("curl --password hunter2"),
            "curl --password [REDACTED]"
        );
    }

    #[test]
    fn only_the_log_strength_blanks_whole_password_lines() {
        let line = "const digest = sha256(password + salt);";
        assert_eq!(redact_secrets(line), "[REDACTED LINE]");
        assert_eq!(redact_tool_output(line), line);
    }
}
