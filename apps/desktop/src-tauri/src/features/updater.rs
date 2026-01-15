//! Application auto-updater module.
//!
//! This module provides Tauri commands for checking, downloading, and installing
//! application updates. It uses the Tauri updater plugin with signature verification
//! to ensure update integrity.
//!
//! # Security
//!
//! All updates are verified using Ed25519 signatures. The public key is embedded
//! in the application binary via `tauri.conf.json`. The private key must be kept
//! secure and should only be stored in CI/CD secrets (e.g., GitHub Secrets).
//!
//! # Update Flow
//!
//! 1. Application calls `check_for_updates()` to query the update endpoint
//! 2. If an update is available, `UpdateInfo` is returned with version and notes
//! 3. User confirms update, then `install_update()` is called
//! 4. Update is downloaded, verified, and installed
//! 5. Application restarts with the new version
//!
//! # Events
//!
//! The updater emits events for progress tracking:
//! - `updater:checking` - Update check started
//! - `updater:available` - Update is available
//! - `updater:not-available` - No update available
//! - `updater:downloading` - Download in progress with percentage
//! - `updater:downloaded` - Download complete
//! - `updater:installing` - Installation started
//! - `updater:error` - An error occurred

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;
use tokio::sync::Mutex;

/// Information about an available update.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    /// The new version string (e.g., "1.2.0")
    pub version: String,
    /// Release notes or changelog (may be empty)
    pub body: Option<String>,
    /// Release date in ISO 8601 format
    pub date: Option<String>,
    /// Download URL for the update
    pub download_url: Option<String>,
}

/// Result of checking for updates.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status")]
pub enum UpdateCheckResult {
    /// An update is available
    #[serde(rename = "available")]
    Available { info: UpdateInfo },
    /// No update is available (current version is latest)
    #[serde(rename = "up_to_date")]
    UpToDate { current_version: String },
    /// Update check failed
    #[serde(rename = "error")]
    Error { message: String },
}

/// Progress information during update download.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateProgress {
    /// Bytes downloaded so far
    pub downloaded: u64,
    /// Total bytes to download (if known)
    pub total: Option<u64>,
    /// Download progress as percentage (0-100)
    pub percentage: Option<f64>,
}

/// Status of the update process.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UpdateStatus {
    /// Idle, no update in progress
    Idle,
    /// Checking for updates
    Checking,
    /// Update available
    Available,
    /// Downloading update
    Downloading,
    /// Download complete
    Downloaded,
    /// Installing update
    Installing,
    /// Update complete, restart required
    PendingRestart,
    /// Error occurred
    Error,
}

/// Event payload for updater events.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdaterEvent {
    /// Current status of the update process
    pub status: UpdateStatus,
    /// Progress information (if downloading)
    pub progress: Option<UpdateProgress>,
    /// Update info (if available)
    pub info: Option<UpdateInfo>,
    /// Error message (if error occurred)
    pub error: Option<String>,
}

/// Check for available updates.
///
/// This command queries the configured update endpoint to check if a new
/// version is available. The endpoint URL is configured in `tauri.conf.json`.
///
/// # Returns
///
/// - `UpdateCheckResult::Available` if an update is available
/// - `UpdateCheckResult::UpToDate` if the current version is the latest
/// - `UpdateCheckResult::Error` if the check failed
///
/// # Events
///
/// Emits `updater:checking` when the check starts, followed by either
/// `updater:available` or `updater:not-available`.
#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> Result<UpdateCheckResult, String> {
    tracing::info!("Checking for updates...");

    // Emit checking event
    let _ = app.emit(
        "updater:checking",
        UpdaterEvent {
            status: UpdateStatus::Checking,
            progress: None,
            info: None,
            error: None,
        },
    );

    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            let error_msg = format!("Failed to get updater: {e}");
            tracing::error!("{}", error_msg);
            let _ = app.emit(
                "updater:error",
                UpdaterEvent {
                    status: UpdateStatus::Error,
                    progress: None,
                    info: None,
                    error: Some(error_msg.clone()),
                },
            );
            return Ok(UpdateCheckResult::Error { message: error_msg });
        }
    };

    match updater.check().await {
        Ok(Some(update)) => {
            let info = UpdateInfo {
                version: update.version.clone(),
                body: update.body.clone(),
                date: update.date.map(|d| {
                    // Format OffsetDateTime to RFC 3339 string
                    format!(
                        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
                        d.year(),
                        u8::from(d.month()),
                        d.day(),
                        d.hour(),
                        d.minute(),
                        d.second()
                    )
                }),
                download_url: None,
            };

            tracing::info!("Update available: version {}", update.version);

            let _ = app.emit(
                "updater:available",
                UpdaterEvent {
                    status: UpdateStatus::Available,
                    progress: None,
                    info: Some(info.clone()),
                    error: None,
                },
            );

            Ok(UpdateCheckResult::Available { info })
        }
        Ok(None) => {
            let current_version = app.package_info().version.to_string();
            tracing::info!("No update available. Current version: {}", current_version);

            let _ = app.emit(
                "updater:not-available",
                UpdaterEvent {
                    status: UpdateStatus::Idle,
                    progress: None,
                    info: None,
                    error: None,
                },
            );

            Ok(UpdateCheckResult::UpToDate { current_version })
        }
        Err(e) => {
            let error_msg = format!("Update check failed: {e}");
            tracing::error!("{}", error_msg);

            let _ = app.emit(
                "updater:error",
                UpdaterEvent {
                    status: UpdateStatus::Error,
                    progress: None,
                    info: None,
                    error: Some(error_msg.clone()),
                },
            );

            Ok(UpdateCheckResult::Error { message: error_msg })
        }
    }
}

/// Download and install an available update.
///
/// This command downloads the update, verifies its signature, and installs it.
/// The application will need to restart after installation.
///
/// # Returns
///
/// - `Ok(true)` if the update was successfully installed (restart required)
/// - `Ok(false)` if no update was available
/// - `Err` if the installation failed
///
/// # Events
///
/// Emits progress events during download:
/// - `updater:downloading` with progress information
/// - `updater:downloaded` when download completes
/// - `updater:installing` when installation starts
/// - `updater:error` if an error occurs
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<bool, String> {
    tracing::info!("Starting update installation...");

    let updater = app
        .updater()
        .map_err(|e| format!("Failed to get updater: {e}"))?;

    let update = match updater.check().await {
        Ok(Some(u)) => u,
        Ok(None) => {
            tracing::info!("No update available to install");
            return Ok(false);
        }
        Err(e) => {
            let error_msg = format!("Failed to check for update: {e}");
            tracing::error!("{}", error_msg);
            return Err(error_msg);
        }
    };

    tracing::info!("Downloading update version {}...", update.version);

    // Clone app handle for the closure
    let app_clone = app.clone();
    let downloaded = Arc::new(Mutex::new(0u64));
    let last_emitted = Arc::new(Mutex::new(-1i32));

    let downloaded_clone = downloaded.clone();
    let last_emitted_clone = last_emitted.clone();

    // Download with progress tracking
    let bytes = update
        .download(
            move |chunk_len, content_len| {
                // We need to use a sync approach here since the closure is not async
                let downloaded = downloaded_clone.clone();
                let last_emitted = last_emitted_clone.clone();
                let app = app_clone.clone();

                // Spawn a blocking task to update progress
                tokio::spawn(async move {
                    let mut dl = downloaded.lock().await;
                    *dl += chunk_len as u64;
                    let current_downloaded = *dl;

                    let percentage = content_len
                        .map(|total| (current_downloaded as f64 / total as f64 * 100.0).min(100.0));

                    // Only emit every 5% to avoid flooding
                    let current_percentage = percentage.map(|p| (p / 5.0).floor() as i32 * 5);
                    let mut last = last_emitted.lock().await;

                    if current_percentage != Some(*last) {
                        if let Some(p) = current_percentage {
                            *last = p;
                        }

                        let _ = app.emit(
                            "updater:downloading",
                            UpdaterEvent {
                                status: UpdateStatus::Downloading,
                                progress: Some(UpdateProgress {
                                    downloaded: current_downloaded,
                                    total: content_len,
                                    percentage,
                                }),
                                info: None,
                                error: None,
                            },
                        );
                    }
                });
            },
            || {
                tracing::info!("Download complete");
            },
        )
        .await
        .map_err(|e| {
            let error_msg = format!("Download failed: {e}");
            tracing::error!("{}", error_msg);

            let _ = app.emit(
                "updater:error",
                UpdaterEvent {
                    status: UpdateStatus::Error,
                    progress: None,
                    info: None,
                    error: Some(error_msg.clone()),
                },
            );

            error_msg
        })?;

    let _ = app.emit(
        "updater:downloaded",
        UpdaterEvent {
            status: UpdateStatus::Downloaded,
            progress: None,
            info: None,
            error: None,
        },
    );

    tracing::info!("Installing update...");

    let _ = app.emit(
        "updater:installing",
        UpdaterEvent {
            status: UpdateStatus::Installing,
            progress: None,
            info: None,
            error: None,
        },
    );

    // Install the update with the downloaded bytes
    update.install(&bytes).map_err(|e| {
        let error_msg = format!("Installation failed: {e}");
        tracing::error!("{}", error_msg);

        let _ = app.emit(
            "updater:error",
            UpdaterEvent {
                status: UpdateStatus::Error,
                progress: None,
                info: None,
                error: Some(error_msg.clone()),
            },
        );

        error_msg
    })?;

    tracing::info!("Update installed successfully. Restart required.");

    let _ = app.emit(
        "updater:installed",
        UpdaterEvent {
            status: UpdateStatus::PendingRestart,
            progress: None,
            info: None,
            error: None,
        },
    );

    Ok(true)
}

/// Download and install update, then restart the application.
///
/// This is a convenience command that combines `install_update` with an
/// automatic restart.
///
/// # Returns
///
/// This function does not return if successful, as the application restarts.
///
/// # Errors
///
/// Returns an error if the update installation fails.
#[tauri::command]
pub async fn install_update_and_restart(app: AppHandle) -> Result<(), String> {
    tracing::info!("Starting update installation with restart...");

    let updater = app
        .updater()
        .map_err(|e| format!("Failed to get updater: {e}"))?;

    let update = match updater.check().await {
        Ok(Some(u)) => u,
        Ok(None) => {
            return Err("No update available".to_string());
        }
        Err(e) => {
            return Err(format!("Failed to check for update: {e}"));
        }
    };

    tracing::info!(
        "Downloading and installing update version {}...",
        update.version
    );

    // Download and install
    update
        .download_and_install(
            |_, _| {},
            || {
                tracing::info!("Download complete, installing...");
            },
        )
        .await
        .map_err(|e| format!("Update failed: {e}"))?;

    tracing::info!("Update installed, restarting application...");

    // Restart the application
    app.restart();
}

/// Get the current application version.
///
/// # Returns
///
/// The current version string from `Cargo.toml` / `tauri.conf.json`.
#[tauri::command]
pub fn get_current_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

/// Get detailed version information.
///
/// # Returns
///
/// A struct containing the version, name, and other package info.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionInfo {
    /// Application version (e.g., "1.2.0")
    pub version: String,
    /// Application name
    pub name: String,
    /// Tauri version
    pub tauri_version: String,
}

#[tauri::command]
pub fn get_version_info(app: AppHandle) -> VersionInfo {
    let package = app.package_info();
    VersionInfo {
        version: package.version.to_string(),
        name: package.name.clone(),
        tauri_version: tauri::VERSION.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_update_info_serialization() {
        let info = UpdateInfo {
            version: "1.2.0".to_string(),
            body: Some("Bug fixes and improvements".to_string()),
            date: Some("2024-01-15T12:00:00Z".to_string()),
            download_url: Some("https://example.com/update.tar.gz".to_string()),
        };

        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("1.2.0"));
        assert!(json.contains("Bug fixes"));
    }

    #[test]
    fn test_update_check_result_serialization() {
        let available = UpdateCheckResult::Available {
            info: UpdateInfo {
                version: "2.0.0".to_string(),
                body: None,
                date: None,
                download_url: None,
            },
        };

        let json = serde_json::to_string(&available).unwrap();
        assert!(json.contains(r#""status":"available""#));

        let up_to_date = UpdateCheckResult::UpToDate {
            current_version: "1.0.0".to_string(),
        };

        let json = serde_json::to_string(&up_to_date).unwrap();
        assert!(json.contains(r#""status":"up_to_date""#));
    }

    #[test]
    fn test_update_progress() {
        let progress = UpdateProgress {
            downloaded: 5_000_000,
            total: Some(10_000_000),
            percentage: Some(50.0),
        };

        let json = serde_json::to_string(&progress).unwrap();
        assert!(json.contains("5000000"));
        assert!(json.contains("50.0"));
    }

    #[test]
    fn test_update_status_serialization() {
        let statuses = vec![
            UpdateStatus::Idle,
            UpdateStatus::Checking,
            UpdateStatus::Available,
            UpdateStatus::Downloading,
            UpdateStatus::Downloaded,
            UpdateStatus::Installing,
            UpdateStatus::PendingRestart,
            UpdateStatus::Error,
        ];

        for status in statuses {
            let json = serde_json::to_string(&status).unwrap();
            assert!(!json.is_empty());
        }
    }
}
