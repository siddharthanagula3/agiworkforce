use anyhow::Result;
use std::path::Path;
use std::process::Command;

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

        let output = Command::new("env").output()?;

        if output.status.success() {
            std::fs::write(&path, &output.stdout)?;
        }
        Ok(())
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
