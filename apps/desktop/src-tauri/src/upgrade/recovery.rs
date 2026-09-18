//! What survives a failed upgrade. The rule throughout: local-only data is the
//! one thing that cannot be fetched again, so nothing here deletes it.

use serde::Serialize;

use super::{decide_upgrade, InstalledVersions, UpgradeDecision};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RecoveryAction {
    /// Start normally.
    Start,
    /// Drop what the previous runtime produced and build it again locally.
    RebuildRuntimeArtifacts,
    /// Pull the synced half back from the cloud, keeping the local-only half.
    RebuildFromCloud,
    /// Stop, keep everything, and tell the user which build wrote the data.
    HoldForNewerData { found: u32, supported: u32 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StartupState {
    pub installed: InstalledVersions,
    /// The previous run did not shut down cleanly.
    pub crashed_last_run: bool,
    /// The synced database could not be opened, so its contents are not usable.
    pub synced_store_unreadable: bool,
}

/// A build that cannot read its data must never be the one that decides to
/// migrate it. Newer data outranks every other signal, a crash alone is not a
/// reason to discard anything, and only an unreadable synced store justifies
/// rebuilding from the cloud.
pub fn recovery_action(state: StartupState) -> RecoveryAction {
    if let UpgradeDecision::RefuseNewerData { found, supported } = decide_upgrade(state.installed) {
        return RecoveryAction::HoldForNewerData { found, supported };
    }
    if state.synced_store_unreadable {
        return RecoveryAction::RebuildFromCloud;
    }
    if decide_upgrade(state.installed) == UpgradeDecision::RebuildRuntimeArtifacts {
        return RecoveryAction::RebuildRuntimeArtifacts;
    }
    RecoveryAction::Start
}

/// Whether this action is allowed to remove anything the cloud does not hold.
/// It never is: a rebuild replaces the synced half and leaves the rest alone.
pub fn discards_local_only_data(action: RecoveryAction) -> bool {
    match action {
        RecoveryAction::Start
        | RecoveryAction::RebuildRuntimeArtifacts
        | RecoveryAction::RebuildFromCloud
        | RecoveryAction::HoldForNewerData { .. } => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::upgrade::{LOCAL_DATA_FORMAT_VERSION, LOCAL_RUNTIME_VERSION};

    fn state() -> StartupState {
        StartupState {
            installed: InstalledVersions {
                runtime: LOCAL_RUNTIME_VERSION,
                data_format: LOCAL_DATA_FORMAT_VERSION,
            },
            crashed_last_run: false,
            synced_store_unreadable: false,
        }
    }

    #[test]
    fn a_healthy_install_starts() {
        assert_eq!(recovery_action(state()), RecoveryAction::Start);
    }

    #[test]
    fn a_crash_alone_discards_nothing() {
        let crashed = StartupState {
            crashed_last_run: true,
            ..state()
        };
        assert_eq!(recovery_action(crashed), RecoveryAction::Start);
    }

    #[test]
    fn an_unreadable_synced_store_rebuilds_from_the_cloud() {
        let broken = StartupState {
            synced_store_unreadable: true,
            ..state()
        };
        assert_eq!(recovery_action(broken), RecoveryAction::RebuildFromCloud);
    }

    #[test]
    fn newer_data_holds_even_when_the_synced_store_is_unreadable() {
        let newer = StartupState {
            installed: InstalledVersions {
                runtime: LOCAL_RUNTIME_VERSION,
                data_format: LOCAL_DATA_FORMAT_VERSION + 1,
            },
            synced_store_unreadable: true,
            crashed_last_run: true,
        };
        assert_eq!(
            recovery_action(newer),
            RecoveryAction::HoldForNewerData {
                found: LOCAL_DATA_FORMAT_VERSION + 1,
                supported: LOCAL_DATA_FORMAT_VERSION,
            }
        );
    }

    #[test]
    fn a_moved_runtime_rebuilds_only_its_own_artifacts() {
        let moved = StartupState {
            installed: InstalledVersions {
                runtime: LOCAL_RUNTIME_VERSION + 1,
                data_format: LOCAL_DATA_FORMAT_VERSION,
            },
            ..state()
        };
        assert_eq!(
            recovery_action(moved),
            RecoveryAction::RebuildRuntimeArtifacts
        );
    }

    #[test]
    fn no_recovery_action_may_remove_local_only_data() {
        for action in [
            RecoveryAction::Start,
            RecoveryAction::RebuildRuntimeArtifacts,
            RecoveryAction::RebuildFromCloud,
            RecoveryAction::HoldForNewerData {
                found: 2,
                supported: 1,
            },
        ] {
            assert!(!discards_local_only_data(action));
        }
    }
}
