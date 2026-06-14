use anyhow::Result;
use std::path::Path;

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

        // Capture the environment in-process and REDACT secret-bearing variables.
        // Previously this shelled out to `env` and wrote the raw dump verbatim,
        // persisting ANTHROPIC_API_KEY / OPENAI_API_KEY / *_TOKEN / etc. to a
        // plaintext file that survived for 3 days — the same `env` dump the
        // safety classifier refuses to auto-approve.
        let mut vars: Vec<(String, String)> = std::env::vars().collect();
        vars.sort();
        let mut body = String::new();
        for (key, value) in vars {
            let rendered = if Self::is_secret_env_key(&key) {
                "<redacted>"
            } else {
                value.as_str()
            };
            body.push_str(&key);
            body.push('=');
            body.push_str(rendered);
            body.push('\n');
        }

        Self::write_private(&path, body.as_bytes())
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
        ];
        NEEDLES.iter().any(|needle| k.contains(needle))
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
