//! Fail-closed Desktop startup recovery.
//!.

use crate::data::db::encryption::DatabaseOpenError;
use crate::data::db::key_management::DatabaseKeyError;
use crate::upgrade::installed::{read_installed_versions, record_installed_versions};
use crate::upgrade::recovery::{recovery_action, RecoveryAction, StartupState};
use chrono::{DateTime, Utc};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

const DIAGNOSTICS_FILE_NAME: &str = "agi-desktop-startup-diagnostics.txt";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StartupRecoveryInfo {
    pub code: String,
    pub title: String,
    pub message: String,
    pub data_preserved: bool,
}

impl StartupRecoveryInfo {
    pub fn from_database_error(error: &DatabaseKeyError) -> Self {
        match error {
            DatabaseKeyError::SecureStorage(_)
            | DatabaseKeyError::InvalidStoredKey { .. }
            | DatabaseKeyError::RandomGeneration(_) => Self::secure_storage(),
            DatabaseKeyError::InvalidBundleIdentifier => Self::database_initialization(),
            DatabaseKeyError::UnidentifiedDatabase
            | DatabaseKeyError::Database(
                DatabaseOpenError::EncryptedOrCorrupt { .. } | DatabaseOpenError::KeyedDatabase(_),
            ) => Self::database_unlock(),
            DatabaseKeyError::Database(
                DatabaseOpenError::PlaintextMigration(_) | DatabaseOpenError::MigratedDatabase(_),
            ) => Self::database_migration(),
            DatabaseKeyError::Database(
                DatabaseOpenError::Inspection { .. } | DatabaseOpenError::NewDatabase(_),
            ) => Self::database_initialization(),
        }
    }

    pub fn database_initialization() -> Self {
        Self {
            code: "DB_INITIALIZATION".to_string(),
            title: "AGI could not open local data".to_string(),
            message: "The encrypted local database could not be initialized safely. Retry first, then export diagnostics if the problem continues.".to_string(),
            data_preserved: true,
        }
    }

    /// The database key lives in OS secure storage because it is what decrypts
    /// the database. A *denied* permission prompt is by far the most common way.
    fn secure_storage() -> Self {
        Self {
            code: "DB_SECURE_STORAGE".to_string(),
            title: "AGI needs permission to unlock local data".to_string(),
            message: "AGI could not read its database key from the system credential store \
                      (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux). \
                      This usually means a permission prompt was dismissed or denied. \
                      Choose Retry and allow access when prompted. Your local data was left in place."
                .to_string(),
            data_preserved: true,
        }
    }

    fn database_unlock() -> Self {
        Self {
            code: "DB_UNLOCK".to_string(),
            title: "AGI could not unlock local data".to_string(),
            message: "The database could not be opened with a verified key. AGI stopped before attempting any unsafe repair.".to_string(),
            data_preserved: true,
        }
    }

    fn database_migration() -> Self {
        Self {
            code: "DB_MIGRATION".to_string(),
            title: "Local data upgrade needs attention".to_string(),
            message: "AGI could not finish a safe encrypted-database upgrade. The original local data was preserved.".to_string(),
            data_preserved: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpgradeStatus {
    pub action: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub found_data_format: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supported_data_format: Option<u32>,
}

impl From<RecoveryAction> for UpgradeStatus {
    fn from(action: RecoveryAction) -> Self {
        match action {
            RecoveryAction::Start => Self {
                action: "start",
                found_data_format: None,
                supported_data_format: None,
            },
            RecoveryAction::RebuildRuntimeArtifacts => Self {
                action: "rebuildRuntimeArtifacts",
                found_data_format: None,
                supported_data_format: None,
            },
            RecoveryAction::RebuildFromCloud => Self {
                action: "rebuildFromCloud",
                found_data_format: None,
                supported_data_format: None,
            },
            RecoveryAction::HoldForNewerData { found, supported } => Self {
                action: "holdForNewerData",
                found_data_format: Some(found),
                supported_data_format: Some(supported),
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StartupStateReport {
    pub recovery: Option<StartupRecoveryInfo>,
    pub upgrade: UpgradeStatus,
}

/// An unreadable or migrating database is the synced store being unusable; a
/// key-store or initialization failure is not, so it must not trigger a cloud.
fn synced_store_unreadable(recovery: Option<&StartupRecoveryInfo>) -> bool {
    matches!(
        recovery.map(|info| info.code.as_str()),
        Some("DB_UNLOCK") | Some("DB_MIGRATION")
    )
}

#[derive(Clone)]
pub struct StartupRecoveryState {
    current: Arc<Mutex<Option<StartupRecoveryInfo>>>,
    data_dir: PathBuf,
    database_path: PathBuf,
}

impl StartupRecoveryState {
    pub fn new(data_dir: PathBuf, database_path: PathBuf) -> Self {
        Self {
            current: Arc::new(Mutex::new(None)),
            data_dir,
            database_path,
        }
    }

    pub fn record(&self, info: StartupRecoveryInfo) {
        match self.current.lock() {
            Ok(mut current) => *current = Some(info),
            Err(poisoned) => *poisoned.into_inner() = Some(info),
        }
    }

    fn current(&self) -> Option<StartupRecoveryInfo> {
        match self.current.lock() {
            Ok(current) => current.clone(),
            Err(poisoned) => poisoned
                .into_inner()
                .clone()
                .or_else(|| Some(StartupRecoveryInfo::database_initialization())),
        }
    }

    fn report(&self) -> StartupStateReport {
        let recovery = self.current();
        let action = recovery_action(StartupState {
            installed: read_installed_versions(&self.data_dir),
            crashed_last_run: recovery.is_some(),
            synced_store_unreadable: synced_store_unreadable(recovery.as_ref()),
        });
        if action == RecoveryAction::Start {
            if let Err(error) = record_installed_versions(&self.data_dir) {
                tracing::warn!("Failed to record the installed local-format versions: {error}");
            }
        }
        StartupStateReport {
            recovery,
            upgrade: action.into(),
        }
    }
}

pub fn show_recovery_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        tracing::error!("Startup recovery could not find the main window");
        return;
    };

    if let Err(error) = window.set_title("AGI, Local data recovery") {
        tracing::warn!("Failed to set startup-recovery window title: {error}");
    }
    if let Err(error) = window.show() {
        tracing::warn!("Failed to show startup-recovery window: {error}");
    }
    if let Err(error) = window.set_focus() {
        tracing::warn!("Failed to focus startup-recovery window: {error}");
    }
}

#[tauri::command]
pub fn startup_get_recovery_state(state: State<'_, StartupRecoveryState>) -> StartupStateReport {
    state.report()
}

#[tauri::command]
pub fn startup_retry(app: AppHandle) {
    app.request_restart();
}

#[tauri::command]
pub fn startup_open_data_folder(state: State<'_, StartupRecoveryState>) -> Result<(), String> {
    open::that_detached(&state.data_dir).map_err(|error| {
        tracing::error!("Failed to open the startup-recovery data folder: {error}");
        "AGI could not open the data folder.".to_string()
    })
}

#[tauri::command]
pub async fn startup_export_diagnostics(
    app: AppHandle,
    state: State<'_, StartupRecoveryState>,
) -> Result<bool, String> {
    let Some(info) = state.current() else {
        return Err("No startup recovery information is available.".to_string());
    };

    let destination = app
        .dialog()
        .file()
        .set_title("Export AGI startup diagnostics")
        .set_file_name(DIAGNOSTICS_FILE_NAME)
        .add_filter("Text", &["txt"])
        .blocking_save_file();

    let Some(destination) = destination else {
        return Ok(false);
    };
    let destination = destination.into_path().map_err(|error| {
        tracing::error!("Startup diagnostics destination was not a local path: {error}");
        "AGI could not use that diagnostics destination.".to_string()
    })?;

    let diagnostics = build_diagnostics(
        &info,
        &state.database_path,
        &app.package_info().version.to_string(),
        Utc::now(),
    );
    std::fs::write(destination, diagnostics).map_err(|error| {
        tracing::error!("Failed to export sanitized startup diagnostics: {error}");
        "AGI could not export diagnostics to that location.".to_string()
    })?;
    Ok(true)
}

#[tauri::command]
pub fn startup_quit(app: AppHandle) {
    app.exit(0);
}

fn build_diagnostics(
    info: &StartupRecoveryInfo,
    database_path: &Path,
    app_version: &str,
    generated_at: DateTime<Utc>,
) -> String {
    let (database_present, database_bytes) = match std::fs::metadata(database_path) {
        Ok(metadata) => ("yes", metadata.len().to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => ("no", "0".to_string()),
        Err(_) => ("unknown", "unknown".to_string()),
    };

    format!(
        "AGI Desktop startup diagnostics\n\
         Generated (UTC): {}\n\
         App version: {}\n\
         Platform: {} ({})\n\
         Recovery code: {}\n\
         Database present: {}\n\
         Database size (bytes): {}\n\
         Data preservation: AGI did not delete, reset, rename, or replace the database while diagnosing this startup failure.\n",
        generated_at.to_rfc3339(),
        app_version,
        std::env::consts::OS,
        std::env::consts::ARCH,
        info.code,
        database_present,
        database_bytes,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recovery_info_never_exposes_source_errors() {
        let raw_secret = "keychain denied for /Users/private-user token=super-secret";
        let error = DatabaseKeyError::SecureStorage(raw_secret.to_string());

        let info = StartupRecoveryInfo::from_database_error(&error);

        assert_eq!(info.code, "DB_SECURE_STORAGE");
        assert!(info.data_preserved);
        assert!(!info.title.contains(raw_secret));
        assert!(!info.message.contains(raw_secret));
        assert!(!info.message.contains("/Users/private-user"));
    }

    #[test]
    fn denied_credential_prompt_tells_the_user_how_to_recover() {
        // Reaching this screen by dismissing a Keychain prompt is recoverable,
        // and the previous copy ("Secure storage is unavailable") gave no way.
        let info = StartupRecoveryInfo::from_database_error(&DatabaseKeyError::SecureStorage(
            "User denied access".to_string(),
        ));

        assert!(
            info.message.contains("Retry"),
            "message must point at the Retry control: {}",
            info.message
        );
        assert!(
            info.message.to_lowercase().contains("permission")
                || info.message.to_lowercase().contains("denied"),
            "message must name the likely cause: {}",
            info.message
        );
        assert!(
            info.data_preserved,
            "a denied prompt must never imply data loss"
        );
    }

    fn state_in(dir: &Path) -> StartupRecoveryState {
        StartupRecoveryState::new(dir.to_path_buf(), dir.join("agiworkforce.db"))
    }

    #[test]
    fn a_healthy_start_reports_no_recovery_and_records_the_installed_formats() {
        let temp_dir = tempfile::tempdir().expect("temp directory");
        let state = state_in(temp_dir.path());

        let report = state.report();

        assert!(report.recovery.is_none());
        assert_eq!(report.upgrade.action, "start");
        assert!(crate::upgrade::installed::installed_versions_path(temp_dir.path()).exists());
    }

    #[test]
    fn data_written_by_a_newer_build_holds_and_names_both_formats() {
        use crate::upgrade::{LOCAL_DATA_FORMAT_VERSION, LOCAL_RUNTIME_VERSION};
        let temp_dir = tempfile::tempdir().expect("temp directory");
        std::fs::write(
            crate::upgrade::installed::installed_versions_path(temp_dir.path()),
            serde_json::json!({
                "runtime": LOCAL_RUNTIME_VERSION,
                "data_format": LOCAL_DATA_FORMAT_VERSION + 1,
            })
            .to_string(),
        )
        .expect("seed marker");

        let report = state_in(temp_dir.path()).report();

        assert_eq!(report.upgrade.action, "holdForNewerData");
        assert_eq!(
            report.upgrade.found_data_format,
            Some(LOCAL_DATA_FORMAT_VERSION + 1)
        );
        assert_eq!(
            report.upgrade.supported_data_format,
            Some(LOCAL_DATA_FORMAT_VERSION)
        );
    }

    #[test]
    fn an_unreadable_database_rebuilds_from_the_cloud_and_keeps_the_recovery_screen() {
        let temp_dir = tempfile::tempdir().expect("temp directory");
        let state = state_in(temp_dir.path());
        state.record(StartupRecoveryInfo::from_database_error(
            &DatabaseKeyError::UnidentifiedDatabase,
        ));

        let report = state.report();

        assert_eq!(
            report.recovery.map(|info| info.code).as_deref(),
            Some("DB_UNLOCK")
        );
        assert_eq!(report.upgrade.action, "rebuildFromCloud");
        assert!(
            !crate::upgrade::installed::installed_versions_path(temp_dir.path()).exists(),
            "a build that could not open its data must not claim it installed the format"
        );
    }

    #[test]
    fn a_denied_key_store_does_not_rebuild_from_the_cloud() {
        let temp_dir = tempfile::tempdir().expect("temp directory");
        let state = state_in(temp_dir.path());
        state.record(StartupRecoveryInfo::from_database_error(
            &DatabaseKeyError::SecureStorage("denied".to_string()),
        ));

        assert_eq!(state.report().upgrade.action, "start");
    }

    #[test]
    fn diagnostics_are_allowlisted_and_omit_paths_messages_and_secrets() {
        let temp_dir = tempfile::tempdir().expect("temp directory");
        let database_path = temp_dir.path().join("private-user-super-secret.db");
        std::fs::write(&database_path, b"not opened by this test").expect("seed metadata file");
        let info = StartupRecoveryInfo {
            code: "DB_UNLOCK".to_string(),
            title: "ignored title".to_string(),
            message: "raw keychain error token=super-secret".to_string(),
            data_preserved: true,
        };
        let generated_at = DateTime::parse_from_rfc3339("2026-07-26T12:34:56Z")
            .expect("fixed timestamp")
            .with_timezone(&Utc);

        let diagnostics = build_diagnostics(&info, &database_path, "1.2.0", generated_at);

        assert!(diagnostics.contains("Recovery code: DB_UNLOCK"));
        assert!(diagnostics.contains("Database size (bytes): 23"));
        assert!(diagnostics.contains("did not delete, reset, rename, or replace"));
        assert!(!diagnostics.contains("private-user-super-secret.db"));
        assert!(!diagnostics.contains(temp_dir.path().to_string_lossy().as_ref()));
        assert!(!diagnostics.contains("raw keychain error"));
        assert!(!diagnostics.contains("super-secret"));
    }
}
