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

#[derive(Clone, Copy)]
enum Value {
    Assigned(usize),
    FlagArgument(usize),
}

struct Rule {
    pattern: Regex,
    replacement: &'static str,
    value: Option<Value>,
}

fn rule(pattern: &str, replacement: &'static str, value: Option<Value>) -> Rule {
    Rule {
        pattern: Regex::new(pattern).expect("valid redaction pattern"),
        replacement,
        value,
    }
}

fn value_patterns() -> &'static Vec<Rule> {
    static PATTERNS: OnceLock<Vec<Rule>> = OnceLock::new();
    PATTERNS.get_or_init(|| {
        vec![
            // Specific vendor formats must run before generic named/bearer rules.
            rule(
                r"\bsk-ant-[a-zA-Z0-9_-]{20,}",
                "[REDACTED_ANTHROPIC_KEY]",
                None,
            ),
            rule(
                r"\bsk-[a-zA-Z0-9_-]*[a-zA-Z0-9]{16}[a-zA-Z0-9_-]*",
                "[REDACTED_API_KEY]",
                None,
            ),
            rule(r"AIza[a-zA-Z0-9_-]{30,}", "[REDACTED_GOOGLE_KEY]", None),
            rule(r"gsk_[a-zA-Z0-9]{48,}", "[REDACTED_GROQ_KEY]", None),
            rule(
                r"(?:sk|pk|rk)_(?:test|live)_[a-zA-Z0-9]{24,}",
                "[REDACTED_STRIPE_KEY]",
                None,
            ),
            rule(r"(?:AKIA|ASIA)[A-Z0-9]{16}", "[REDACTED_AWS_KEY]", None),
            rule(
                r#"(?i)\baws[_-]?(secret[_-]?access[_-]?key|session[_-]?token)\b['"]?\s*[=:]\s*['"]?([^\s,'"}]{8,})['"]?"#,
                "aws_$1=[REDACTED]",
                Some(Value::Assigned(2)),
            ),
            rule(
                r"gh[pousr]_[a-zA-Z0-9]{30,}",
                "[REDACTED_GITHUB_TOKEN]",
                None,
            ),
            rule(
                r"github_pat_[a-zA-Z0-9_]{22,}",
                "[REDACTED_GITHUB_TOKEN]",
                None,
            ),
            rule(r"xai-[a-zA-Z0-9]{20,}", "[REDACTED_XAI_KEY]", None),
            rule(
                r"xox[baprs]-[A-Za-z0-9-]{10,}",
                "[REDACTED_SLACK_TOKEN]",
                None,
            ),
            rule(
                r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
                "[REDACTED_JWT]",
                None,
            ),
            rule(
                r"(?i)bearer\s+[a-zA-Z0-9._\-/+=]{8,}",
                "Bearer [REDACTED_TOKEN]",
                None,
            ),
            rule(
                r#"(?i)\b(api[_-]?key|apikey|secret[_-]?key|secret|access[_-]?token|auth[_-]?token|token)\b['"]?\s*[=:]\s*['"]?([^\s,'"}]{8,})['"]?"#,
                "$1=[REDACTED]",
                Some(Value::Assigned(2)),
            ),
            rule(
                r#"(["']?)\b([a-z][A-Za-z0-9]*(?:Secret|Token|Password)|verificationCode)\b(["']?\s*[=:]\s*)(["']?)([^\s,'"}]{8,})(["']?)"#,
                "$1$2$3$4[REDACTED]$6",
                Some(Value::Assigned(5)),
            ),
            rule(
                r"\b(mysql|mysqldump|mysqladmin|mariadb|sshpass)\b([^\n]*?[ \t])-p[ \t]+(\S+)",
                "${1}${2}-p [REDACTED]",
                Some(Value::FlagArgument(3)),
            ),
            rule(
                r"(?m)^(-p)[ \t]+(\S+)",
                "${1} [REDACTED]",
                Some(Value::FlagArgument(2)),
            ),
            rule(
                r"(?i)(--password)([= \t][ \t]*)(\S+)",
                "${1}${2}[REDACTED]",
                Some(Value::FlagArgument(3)),
            ),
            rule(
                r#"(?i)\b(password|passwd|pwd)\b['"]?\s*[=:]\s*['"]?([^\s,'"}]{8,})['"]?"#,
                "$1=[REDACTED]",
                Some(Value::Assigned(2)),
            ),
            // Any scheme, so a `git remote`/`git push` URL carrying userinfo is
            // redacted the same way a database URL is.
            rule(
                r"(?i)\b([a-z][a-z0-9+.-]*)://[^\s/:@]+:[^\s/@]+@",
                "$1://[CREDENTIALS_REDACTED]@",
                None,
            ),
            rule(
                r"(?s)-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----.*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
                "[REDACTED_PRIVATE_KEY]",
                None,
            ),
        ]
    })
}

fn password_line_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN
        .get_or_init(|| Regex::new(r"(?im)^.*\bpassw(?:or)?d\b.*$").expect("password line regex"))
}

fn placeholder_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"\[(?:REDACTED(?:_[A-Z]+)*|CREDENTIALS_REDACTED)\]")
            .expect("redaction placeholder regex")
    })
}

fn is_code_reference(value: &str) -> bool {
    let identifier_path = value.contains('.')
        && value.split('.').all(|segment| {
            !segment.is_empty() && segment.chars().all(|c| c.is_ascii_alphabetic() || c == '_')
        });
    let constant_name = value.contains('_')
        && value.starts_with(|c: char| c.is_ascii_uppercase())
        && value
            .chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_');
    value.starts_with('$')
        || value.contains(&['(', ')', '[', ']', '<', '>', '{'][..])
        || value.contains("::")
        || value.contains("->")
        || identifier_path
        || constant_name
}

fn kept_as_written(value: Value, captures: &regex::Captures<'_>) -> bool {
    match value {
        Value::Assigned(group) => captures.get(group).is_some_and(|found| {
            let found = found.as_str().trim_end_matches(';');
            found.len() < 8 || is_code_reference(found)
        }),
        Value::FlagArgument(group) => captures.get(group).is_some_and(|found| {
            let found = found.as_str();
            is_code_reference(found)
                || found.starts_with(&['/', '.', '~'][..])
                || found
                    .chars()
                    .all(|c| c.is_ascii_digit() || c == ':' || c == '.')
        }),
    }
}

fn apply(input: &str, rules: &[Rule]) -> String {
    let mut redacted = input.to_string();
    for rule in rules {
        redacted = match rule.value {
            None => rule
                .pattern
                .replace_all(&redacted, rule.replacement)
                .into_owned(),
            Some(value) => rule
                .pattern
                .replace_all(&redacted, |captures: &regex::Captures<'_>| {
                    if kept_as_written(value, captures) {
                        captures[0].to_string()
                    } else {
                        let mut replaced = String::new();
                        captures.expand(rule.replacement, &mut replaced);
                        replaced
                    }
                })
                .into_owned(),
        };
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

/// How many redaction placeholders `text` carries, the marks
/// [`redact_tool_output`] puts where a value was.
pub fn placeholder_count(text: &str) -> usize {
    placeholder_pattern().find_iter(text).count()
}

#[cfg(test)]
mod tests {
    use super::{placeholder_count, redact_secrets, redact_tool_output};

    #[test]
    fn ordinary_code_and_commands_reach_the_model_unchanged() {
        for line in [
            "RUN mkdir -p /app/data",
            "docker run -p 8080:80 nginx",
            "ssh -p 2222 user@host 'uptime'",
            "  -p 3000:3000 \\",
            "-p 8080:80",
            "task-management-application",
            "const slug = \"sk-dark-mode-toggle-button\";",
            "  token: process.env.API_TOKEN,",
            "let token = std::env::var(\"TOKEN\")?;",
            "  password: hashPassword(input),",
            "password = req.body.password;",
            "api_key = ${API_KEY}",
            "token: GITHUB_TOKEN_VALUE",
            "secret: boolean;",
            "sshpass -f ~/.pw ssh -p 2222 host",
            "mysql -h db -P 3306 -u root",
        ] {
            assert_eq!(redact_tool_output(line), line, "mangled: {line}");
        }
    }

    #[test]
    fn password_flags_of_programs_that_take_one_still_lose_their_value() {
        assert_eq!(
            redact_tool_output("mysqldump -u root -p s3cretpw app > dump.sql"),
            "mysqldump -u root -p [REDACTED] app > dump.sql"
        );
        assert_eq!(
            redact_tool_output("sshpass -p hunter22 ssh -p 2222 host"),
            "sshpass -p [REDACTED] ssh -p 2222 host"
        );
        assert_eq!(
            redact_tool_output("token: abcdef0123456789xyz,"),
            "token=[REDACTED],"
        );
        assert_eq!(
            redact_tool_output("ya29.a0AfH6SMBx3kq9 token = ya29.a0AfH6SMBx3kq9"),
            "ya29.a0AfH6SMBx3kq9 token=[REDACTED]"
        );
    }

    #[test]
    fn placeholders_are_counted_wherever_redaction_put_them() {
        let redacted = redact_tool_output(
            "OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz0123\napi_key = sk-test-secret\n",
        );
        assert_eq!(placeholder_count(&redacted), 2, "{redacted}");
        assert_eq!(placeholder_count("RUN mkdir -p /app/data"), 0);
        assert_eq!(placeholder_count("x [CREDENTIALS_REDACTED] y"), 1);
    }

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
            "Exit code: 0\nOPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz0123\nDATABASE_URL=postgres://alice:PLACEHOLDER@db.example.com:5432/app\n",
        );

        assert!(!transcript.contains("sk-proj-abcdefghijklmnopqrstuvwxyz0123"));
        assert!(!transcript.contains("PLACEHOLDER"));
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
    fn tool_output_redacts_camel_case_secret_keys_in_json_and_assignments() {
        let json = r#"{"trigger":{"id":"t-1"},"signingSecret":"whsec_0a1b2c3d4e5f6a7b","verificationCode":"a1b2c3d4e5f6","clientSecret":"cs_live_1234567890","refreshToken":"rt-abcdefgh12345678"}"#;
        let redacted = redact_tool_output(json);
        for secret in [
            "whsec_0a1b2c3d4e5f6a7b",
            "a1b2c3d4e5f6",
            "cs_live_1234567890",
            "rt-abcdefgh12345678",
        ] {
            assert!(
                !redacted.contains(secret),
                "secret survived: {secret} in {redacted}"
            );
        }
        assert!(
            redacted.contains(r#""signingSecret":"[REDACTED]""#),
            "{redacted}"
        );
        assert!(redacted.contains(r#""trigger":{"id":"t-1"}"#), "{redacted}");
        assert_eq!(
            redact_tool_output("accessToken = abcdef0123456789"),
            "accessToken=[REDACTED]"
        );
    }

    #[test]
    fn camel_case_type_declarations_are_not_secrets() {
        for line in [
            "  signingSecret: string | null;",
            "interface Session { accessToken: string }",
            "const verificationCode = code;",
        ] {
            assert_eq!(redact_tool_output(line), line, "mangled: {line}");
        }
    }

    #[test]
    fn only_the_log_strength_blanks_whole_password_lines() {
        let line = "const digest = sha256(password + salt);";
        assert_eq!(redact_secrets(line), "[REDACTED LINE]");
        assert_eq!(redact_tool_output(line), line);
    }
}
