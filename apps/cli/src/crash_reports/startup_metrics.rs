//! Launch health, kept apart from crash reports. A crash report says the
//! process died; it cannot say whether a launch ever became usable, and a.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

const STARTUP_METRICS_FILE: &str = "startup-metrics.json";
const MAX_TRACKED_VERSIONS: usize = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TerminalErrorKind {
    /// The CLI recognized the failure, told the user, and ended the run.
    Handled,
    /// The CLI recovered and kept running.
    Recovered,
    /// A panic reached the crash handler.
    Unhandled,
    /// A crash report could not be written, so this run is invisible to Sentry.
    ReportUnwritable,
}

impl TerminalErrorKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Handled => "handled",
            Self::Recovered => "recovered",
            Self::Unhandled => "unhandled",
            Self::ReportUnwritable => "report_unwritable",
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct VersionMetrics {
    pub launches_ready: u64,
    pub terminal_errors: BTreeMap<String, u64>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct StartupMetrics {
    pub versions: BTreeMap<String, VersionMetrics>,
}

impl StartupMetrics {
    pub fn ready_count(&self, version: &str) -> u64 {
        self.versions
            .get(version)
            .map(|entry| entry.launches_ready)
            .unwrap_or_default()
    }

    pub fn terminal_error_count(&self, version: &str, kind: TerminalErrorKind) -> u64 {
        self.versions
            .get(version)
            .and_then(|entry| entry.terminal_errors.get(kind.as_str()))
            .copied()
            .unwrap_or_default()
    }

    /// Versions are dropped oldest-key-first so an upgraded install does not
    /// accumulate a row per release it ever ran.
    fn prune(&mut self) {
        while self.versions.len() > MAX_TRACKED_VERSIONS {
            let Some(oldest) = self.versions.keys().next().cloned() else {
                return;
            };
            self.versions.remove(&oldest);
        }
    }
}

pub fn metrics_path(dir: &Path) -> PathBuf {
    dir.join(STARTUP_METRICS_FILE)
}

pub fn current_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

pub fn load(dir: &Path) -> StartupMetrics {
    std::fs::read(metrics_path(dir))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<StartupMetrics>(&bytes).ok())
        .unwrap_or_default()
}

fn store(dir: &Path, metrics: &StartupMetrics) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let body = serde_json::to_vec(metrics).map_err(std::io::Error::other)?;
    std::fs::write(metrics_path(dir), body)
}

fn update(dir: &Path, apply: impl FnOnce(&mut VersionMetrics)) -> std::io::Result<StartupMetrics> {
    let mut metrics = load(dir);
    apply(metrics.versions.entry(current_version()).or_default());
    metrics.prune();
    store(dir, &metrics)?;
    Ok(metrics)
}

/// The run reached the point where it can serve the user. Recorded per version
/// so a release that fails to launch shows up as launches that stop arriving.
pub fn record_ready(dir: &Path) -> std::io::Result<StartupMetrics> {
    update(dir, |entry| entry.launches_ready += 1)
}

pub fn record_terminal_error(
    dir: &Path,
    kind: TerminalErrorKind,
) -> std::io::Result<StartupMetrics> {
    update(dir, |entry| {
        *entry
            .terminal_errors
            .entry(kind.as_str().to_string())
            .or_default() += 1;
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_ready_launch_is_counted_per_version() {
        let dir = tempfile::tempdir().unwrap();
        let version = current_version();

        assert_eq!(load(dir.path()).ready_count(&version), 0);
        record_ready(dir.path()).unwrap();
        record_ready(dir.path()).unwrap();

        assert_eq!(load(dir.path()).ready_count(&version), 2);
    }

    #[test]
    fn handled_terminal_errors_are_counted_apart_from_panics() {
        let dir = tempfile::tempdir().unwrap();
        let version = current_version();

        record_terminal_error(dir.path(), TerminalErrorKind::Handled).unwrap();
        record_terminal_error(dir.path(), TerminalErrorKind::Handled).unwrap();
        record_terminal_error(dir.path(), TerminalErrorKind::Unhandled).unwrap();

        let metrics = load(dir.path());
        assert_eq!(
            metrics.terminal_error_count(&version, TerminalErrorKind::Handled),
            2
        );
        assert_eq!(
            metrics.terminal_error_count(&version, TerminalErrorKind::Unhandled),
            1
        );
        assert_eq!(
            metrics.terminal_error_count(&version, TerminalErrorKind::Recovered),
            0
        );
    }

    #[test]
    fn a_startup_that_never_becomes_ready_leaves_no_ready_count() {
        let dir = tempfile::tempdir().unwrap();
        record_terminal_error(dir.path(), TerminalErrorKind::Unhandled).unwrap();

        let metrics = load(dir.path());
        assert_eq!(metrics.ready_count(&current_version()), 0);
        assert_eq!(
            metrics.terminal_error_count(&current_version(), TerminalErrorKind::Unhandled),
            1
        );
    }

    #[test]
    fn a_corrupt_ledger_is_replaced_rather_than_failing_the_launch() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path()).unwrap();
        std::fs::write(metrics_path(dir.path()), b"{not json").unwrap();

        record_ready(dir.path()).unwrap();

        assert_eq!(load(dir.path()).ready_count(&current_version()), 1);
    }

    #[test]
    fn the_ledger_never_grows_past_the_tracked_version_ceiling() {
        let dir = tempfile::tempdir().unwrap();
        let mut seeded = StartupMetrics::default();
        for index in 0..(MAX_TRACKED_VERSIONS + 4) {
            seeded
                .versions
                .insert(format!("0.0.{index:03}"), VersionMetrics::default());
        }
        store(dir.path(), &seeded).unwrap();

        record_ready(dir.path()).unwrap();

        let metrics = load(dir.path());
        assert_eq!(metrics.versions.len(), MAX_TRACKED_VERSIONS);
        assert_eq!(metrics.ready_count(&current_version()), 1);
    }
}
