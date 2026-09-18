//! What the previous run left on disk. Absent or unreadable state is resolved
//! to the versions this build ships, never to zero: a zero would be read as a.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::{InstalledVersions, LOCAL_DATA_FORMAT_VERSION, LOCAL_RUNTIME_VERSION};

const INSTALLED_VERSIONS_FILE: &str = "installed-versions.json";

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
struct InstalledVersionsFile {
    runtime: u32,
    data_format: u32,
}

pub fn installed_versions_path(data_dir: &Path) -> PathBuf {
    data_dir.join(INSTALLED_VERSIONS_FILE)
}

pub fn current_versions() -> InstalledVersions {
    InstalledVersions {
        runtime: LOCAL_RUNTIME_VERSION,
        data_format: LOCAL_DATA_FORMAT_VERSION,
    }
}

pub fn read_installed_versions(data_dir: &Path) -> InstalledVersions {
    let Ok(bytes) = std::fs::read(installed_versions_path(data_dir)) else {
        return current_versions();
    };
    match serde_json::from_slice::<InstalledVersionsFile>(&bytes) {
        Ok(file) => InstalledVersions {
            runtime: file.runtime,
            data_format: file.data_format,
        },
        Err(error) => {
            tracing::warn!("Installed-version marker was unreadable, assuming this build: {error}");
            current_versions()
        }
    }
}

/// Only a build that started is allowed to claim it installed its formats, so
/// this is written after the upgrade decision resolves to Start.
pub fn record_installed_versions(data_dir: &Path) -> std::io::Result<()> {
    let current = current_versions();
    if read_installed_versions(data_dir) == current
        && installed_versions_path(data_dir)
            .try_exists()
            .unwrap_or(false)
    {
        return Ok(());
    }
    std::fs::create_dir_all(data_dir)?;
    let file = InstalledVersionsFile {
        runtime: current.runtime,
        data_format: current.data_format,
    };
    let body = serde_json::to_vec(&file).map_err(std::io::Error::other)?;
    std::fs::write(installed_versions_path(data_dir), body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_fresh_install_reads_as_this_build_rather_than_as_a_downgrade() {
        let dir = tempfile::tempdir().expect("temp dir");
        assert_eq!(read_installed_versions(dir.path()), current_versions());
    }

    #[test]
    fn a_recorded_marker_round_trips() {
        let dir = tempfile::tempdir().expect("temp dir");
        record_installed_versions(dir.path()).expect("write marker");
        assert_eq!(read_installed_versions(dir.path()), current_versions());
        assert!(installed_versions_path(dir.path()).exists());
    }

    #[test]
    fn data_written_by_a_newer_build_is_read_back_as_newer() {
        let dir = tempfile::tempdir().expect("temp dir");
        std::fs::write(
            installed_versions_path(dir.path()),
            serde_json::json!({ "runtime": LOCAL_RUNTIME_VERSION, "data_format": LOCAL_DATA_FORMAT_VERSION + 3 })
                .to_string(),
        )
        .expect("seed marker");

        let installed = read_installed_versions(dir.path());

        assert_eq!(installed.data_format, LOCAL_DATA_FORMAT_VERSION + 3);
    }

    #[test]
    fn a_corrupt_marker_does_not_trigger_a_migration() {
        let dir = tempfile::tempdir().expect("temp dir");
        std::fs::write(installed_versions_path(dir.path()), b"{not json").expect("seed marker");
        assert_eq!(read_installed_versions(dir.path()), current_versions());
    }
}
