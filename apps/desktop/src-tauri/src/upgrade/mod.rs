//! Versions the app carries that are not the app's own version, and what an
//! upgrade is allowed to do when one of them does not line up.

pub mod recovery;

/// The bundled llama.cpp runtime. `llama-cpp-2` is a compile-time feature, so
/// without a number of its own the runtime silently inherits the app version
/// and nothing can tell a runtime change from a UI change.
/// Bump this whenever the `llama-cpp-2` requirement in Cargo.toml moves.
pub const LOCAL_RUNTIME_VERSION: u32 = 1;

/// The `llama-cpp-2` requirement `LOCAL_RUNTIME_VERSION` above was last
/// reviewed against. scripts/verify-desktop-upgrade.mjs fails when this and
/// Cargo.toml disagree, so the dependency cannot move without the runtime
/// version moving with it.
pub const LOCAL_RUNTIME_DEPENDENCY: &str = "0.1";

/// The oldest local runtime whose cached artifacts this build still reads.
/// An update that crosses this floor has to rebuild them rather than open them.
pub const MIN_COMPATIBLE_RUNTIME_VERSION: u32 = 1;

/// The on-disk layout of the local data directory. A build never writes a
/// format it cannot read back, so this only ever moves forward.
pub const LOCAL_DATA_FORMAT_VERSION: u32 = 1;

/// The bundled native-messaging host and browser bridge. The sidecar speaks to
/// a browser extension that updates on its own schedule, so it is versioned
/// separately from the app that happens to ship it.
pub const SIDECAR_DAEMON_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UpgradeDecision {
    /// Nothing to do: the installed versions are the ones this build expects.
    Proceed,
    /// The local runtime moved, so anything it produced has to be rebuilt.
    RebuildRuntimeArtifacts,
    /// The data on disk was written by a newer build. Refuse and keep it: a
    /// downgrade that "migrates" a format it does not know destroys the data.
    RefuseNewerData { found: u32, supported: u32 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct InstalledVersions {
    pub runtime: u32,
    pub data_format: u32,
}

/// What this build may do with the state it finds. Every unknown is resolved
/// towards keeping the user's data, never towards a convenient upgrade.
pub fn decide_upgrade(installed: InstalledVersions) -> UpgradeDecision {
    if installed.data_format > LOCAL_DATA_FORMAT_VERSION {
        return UpgradeDecision::RefuseNewerData {
            found: installed.data_format,
            supported: LOCAL_DATA_FORMAT_VERSION,
        };
    }
    if installed.runtime != LOCAL_RUNTIME_VERSION || installed.runtime < MIN_COMPATIBLE_RUNTIME_VERSION
    {
        return UpgradeDecision::RebuildRuntimeArtifacts;
    }
    UpgradeDecision::Proceed
}

/// Whether the updater may offer a release at all. An update that would leave
/// the installed data unreadable is not an update, it is data loss with a
/// progress bar.
pub fn updater_compatible(installed: InstalledVersions, offered_data_format: u32) -> bool {
    offered_data_format >= installed.data_format
}

#[cfg(test)]
mod tests {
    use super::*;

    fn installed(runtime: u32, data_format: u32) -> InstalledVersions {
        InstalledVersions {
            runtime,
            data_format,
        }
    }

    #[test]
    fn matching_versions_proceed() {
        assert_eq!(
            decide_upgrade(installed(LOCAL_RUNTIME_VERSION, LOCAL_DATA_FORMAT_VERSION)),
            UpgradeDecision::Proceed
        );
    }

    #[test]
    fn a_moved_runtime_rebuilds_rather_than_reusing_its_artifacts() {
        assert_eq!(
            decide_upgrade(installed(
                LOCAL_RUNTIME_VERSION + 1,
                LOCAL_DATA_FORMAT_VERSION
            )),
            UpgradeDecision::RebuildRuntimeArtifacts
        );
        assert_eq!(
            decide_upgrade(installed(0, LOCAL_DATA_FORMAT_VERSION)),
            UpgradeDecision::RebuildRuntimeArtifacts
        );
    }

    #[test]
    fn data_from_a_newer_build_is_refused_and_kept() {
        assert_eq!(
            decide_upgrade(installed(
                LOCAL_RUNTIME_VERSION,
                LOCAL_DATA_FORMAT_VERSION + 1
            )),
            UpgradeDecision::RefuseNewerData {
                found: LOCAL_DATA_FORMAT_VERSION + 1,
                supported: LOCAL_DATA_FORMAT_VERSION,
            }
        );
    }

    #[test]
    fn newer_data_wins_over_a_runtime_rebuild() {
        assert!(matches!(
            decide_upgrade(installed(
                LOCAL_RUNTIME_VERSION + 1,
                LOCAL_DATA_FORMAT_VERSION + 1
            )),
            UpgradeDecision::RefuseNewerData { .. }
        ));
    }

    #[test]
    fn the_updater_refuses_a_release_that_could_not_read_the_installed_data() {
        let current = installed(LOCAL_RUNTIME_VERSION, LOCAL_DATA_FORMAT_VERSION);
        assert!(updater_compatible(current, LOCAL_DATA_FORMAT_VERSION));
        assert!(updater_compatible(current, LOCAL_DATA_FORMAT_VERSION + 1));
        assert!(!updater_compatible(
            installed(LOCAL_RUNTIME_VERSION, LOCAL_DATA_FORMAT_VERSION + 2),
            LOCAL_DATA_FORMAT_VERSION
        ));
    }

    #[test]
    fn the_sidecar_and_runtime_carry_versions_of_their_own() {
        assert!(SIDECAR_DAEMON_VERSION >= 1);
        assert!(LOCAL_RUNTIME_VERSION >= MIN_COMPATIBLE_RUNTIME_VERSION);
    }
}
