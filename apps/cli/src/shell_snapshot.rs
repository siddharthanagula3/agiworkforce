use anyhow::Result;
use std::borrow::Cow;
use std::path::Path;

const REDACTED: &str = "<redacted>";

pub struct ShellSnapshot;

impl ShellSnapshot {
    /// Capture current shell environment to a snapshot file.
    /// Best-effort: errors are silently ignored.
    pub fn capture(home: &Path, session_id: &str) {
        let _ = Self::capture_inner(home, session_id);
    }

    fn capture_inner(home: &Path, session_id: &str) -> Result<()> {
        let snapshot_dir = home.join("shell_snapshots");
        std::fs::create_dir_all(&snapshot_dir)?;

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs();
        let filename = format!("{}.{}.sh", session_id, timestamp);
        let path = snapshot_dir.join(&filename);

        let body = Self::render_snapshot(std::env::vars());
        Self::write_private(&path, body.as_bytes())
    }

    fn render_snapshot<I>(vars: I) -> String
    where
        I: IntoIterator<Item = (String, String)>,
    {
        let mut vars: Vec<(String, String)> = vars.into_iter().collect();
        vars.sort();
        let mut body = String::new();
        for (key, value) in vars {
            body.push_str(&key);
            body.push('=');
            body.push_str(&Self::redact_env_value(&key, &value));
            body.push('\n');
        }
        body
    }

    fn redact_env_value<'a>(key: &str, value: &'a str) -> Cow<'a, str> {
        if Self::is_secret_env_key(key) {
            return Cow::Borrowed(REDACTED);
        }
        Self::redact_url_userinfo(value)
    }

    /// True for env keys whose value is likely a credential and must never be
    /// persisted to disk.
    fn is_secret_env_key(key: &str) -> bool {
        let k = key.to_ascii_uppercase();
        const NEEDLES: &[&str] = &[
            "KEY",
            "TOKEN",
            "SECRET",
            "PASSWORD",
            "PASSWD",
            "PASSPHRASE",
            "CREDENTIAL",
            "AUTH",
            "SESSION",
            "COOKIE",
            "PRIVATE",
            "CONNECTION",
        ];
        // Matched per name segment, not as substrings: `PAT` occurs inside
        // `PATH`, `URL` inside `CURL_*`, `URI` inside `SECURITY_*`, and
        // redacting those would gut the snapshot without protecting anything.
        const SEGMENT_NEEDLES: &[&str] = &["URL", "URI", "DSN", "ENDPOINT", "PAT"];
        NEEDLES.iter().any(|needle| k.contains(needle))
            || k.split(|c: char| !c.is_ascii_alphanumeric())
                .any(|segment| SEGMENT_NEEDLES.contains(&segment))
    }

    /// Delimiters that cannot appear unencoded in an authority. `,` and `;`
    /// matter because a list of URLs in one variable would otherwise let the
    /// first authority swallow the next URL's scheme, leaving it unredacted.
    fn ends_authority(c: char) -> bool {
        c.is_whitespace()
            || matches!(
                c,
                '/' | '?' | '#' | ',' | ';' | '"' | '\'' | '<' | '>' | '\\' | '|'
            )
    }

    /// Strip the userinfo of any `scheme://user:pass@host` occurrence, so a
    /// credential embedded in a connection string is never persisted even when
    /// the variable name looks harmless (`DATABASE_URL`, `SENTRY_DSN`, ...).
    fn redact_url_userinfo(value: &str) -> Cow<'_, str> {
        let mut out = String::new();
        let mut cursor = 0usize;
        let mut redacted_any = false;
        while let Some(offset) = value[cursor..].find("://") {
            let authority_start = cursor + offset + 3;
            let authority_end = value[authority_start..]
                .find(Self::ends_authority)
                .map_or(value.len(), |i| authority_start + i);
            let authority = &value[authority_start..authority_end];
            match authority.rfind('@') {
                Some(at) => {
                    out.push_str(&value[cursor..authority_start]);
                    out.push_str(REDACTED);
                    out.push_str(&authority[at..]);
                    redacted_any = true;
                }
                None => out.push_str(&value[cursor..authority_end]),
            }
            cursor = authority_end;
        }
        if !redacted_any {
            return Cow::Borrowed(value);
        }
        out.push_str(&value[cursor..]);
        Cow::Owned(out)
    }

    /// Write a file with owner-only (0600) permissions on Unix; best-effort
    /// elsewhere.
    fn write_private(path: &Path, bytes: &[u8]) -> Result<()> {
        #[cfg(unix)]
        {
            use std::io::Write;
            use std::os::unix::fs::OpenOptionsExt;
            let mut f = std::fs::OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .mode(0o600)
                .open(path)?;
            f.write_all(bytes)?;
            Ok(())
        }
        #[cfg(not(unix))]
        {
            std::fs::write(path, bytes)?;
            Ok(())
        }
    }

    /// Remove snapshots older than 3 days.
    /// Best-effort: errors are silently ignored.
    pub fn cleanup_stale(home: &Path) {
        let _ = Self::cleanup_stale_inner(home);
    }

    fn cleanup_stale_inner(home: &Path) -> Result<()> {
        let snapshot_dir = home.join("shell_snapshots");
        if !snapshot_dir.exists() {
            return Ok(());
        }

        let three_days_ago = std::time::SystemTime::now()
            .checked_sub(std::time::Duration::from_secs(3 * 24 * 60 * 60))
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);

        for entry in std::fs::read_dir(&snapshot_dir)? {
            let entry = entry?;
            if let Ok(metadata) = entry.metadata() {
                if let Ok(modified) = metadata.modified() {
                    if modified < three_days_ago {
                        let _ = std::fs::remove_file(entry.path());
                    }
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn render(pairs: &[(&str, &str)]) -> String {
        ShellSnapshot::render_snapshot(
            pairs
                .iter()
                .map(|(k, v)| ((*k).to_string(), (*v).to_string())),
        )
    }

    #[test]
    fn redacts_password_embedded_in_connection_string() {
        let body = render(&[(
            "DATABASE_URL",
            "postgres://EXAMPLE_USER:EXAMPLE_FAKE_PASS@db.example.invalid:5432/app",
        )]);
        assert!(
            !body.contains("EXAMPLE_FAKE_PASS"),
            "body leaked password: {body}"
        );
        assert!(
            !body.contains("EXAMPLE_USER"),
            "body leaked username: {body}"
        );
    }

    #[test]
    fn redacts_userinfo_in_a_value_under_a_harmless_key() {
        let redacted = ShellSnapshot::redact_env_value(
            "SERVICE_ADDR",
            "amqp://rabbit:hunter2@broker.internal:5672/vhost",
        );
        assert_eq!(redacted, "amqp://<redacted>@broker.internal:5672/vhost");
    }

    #[test]
    fn redacts_every_url_in_a_multi_value_variable() {
        let redacted = ShellSnapshot::redact_env_value(
            "PROXY_LIST",
            "http://u1:p1@a.example:8080,http://u2:p2@b.example:8080",
        );
        assert_eq!(
            redacted,
            "http://<redacted>@a.example:8080,http://<redacted>@b.example:8080"
        );
    }

    #[test]
    fn redacts_dsn_and_uri_keys_entirely() {
        for key in ["SENTRY_DSN", "MONGODB_URI", "REDIS_URL", "GITHUB_PAT"] {
            assert!(
                ShellSnapshot::is_secret_env_key(key),
                "{key} should be treated as secret"
            );
        }
    }

    #[test]
    fn keeps_existing_key_needles() {
        for key in ["ANTHROPIC_API_KEY", "AWS_SESSION_TOKEN", "DB_PASSWORD"] {
            assert_eq!(ShellSnapshot::redact_env_value(key, "raw"), REDACTED);
        }
    }

    #[test]
    fn does_not_redact_benign_keys_or_values() {
        for key in ["PATH", "CURL_CA_BUNDLE", "SECURITY_MODE", "HOME", "LANG"] {
            assert!(
                !ShellSnapshot::is_secret_env_key(key),
                "{key} should not be redacted"
            );
        }
        assert_eq!(
            ShellSnapshot::redact_env_value("HOMEBREW_MIRROR", "https://mirror.example/brew"),
            "https://mirror.example/brew"
        );
    }

    #[test]
    fn handles_malformed_and_multibyte_values() {
        for value in [
            "://",
            "://@",
            "x://@host",
            "scheme://ü:pö@hößt/påth",
            "no scheme here @ all",
            "",
        ] {
            let redacted = ShellSnapshot::redact_env_value("ANY", value);
            assert!(!redacted.contains("pö"), "leaked userinfo from {value}");
        }
    }

    #[test]
    fn renders_sorted_key_value_lines() {
        let body = render(&[("B_VAR", "2"), ("A_VAR", "1")]);
        assert_eq!(body, "A_VAR=1\nB_VAR=2\n");
    }
}
