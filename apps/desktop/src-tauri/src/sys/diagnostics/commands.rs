//! Tauri commands for diagnostics
//!
//! Provides the `/doctor` command and related UI integration.

use crate::sys::diagnostics::{
    runner::{CheckInfo, DiagnosticRunner},
    DiagnosticContext, DiagnosticReport, DiagnosticResult,
};
use parking_lot::RwLock;
use std::sync::Arc;
use tauri::{Manager, State};

/// State for diagnostics
pub struct DiagnosticsState {
    /// Last generated report (cached)
    last_report: Arc<RwLock<Option<DiagnosticReport>>>,
    /// Whether a diagnostic run is in progress
    running: Arc<RwLock<bool>>,
}

impl Default for DiagnosticsState {
    fn default() -> Self {
        Self::new()
    }
}

impl DiagnosticsState {
    /// Create new diagnostics state
    #[must_use]
    pub fn new() -> Self {
        Self {
            last_report: Arc::new(RwLock::new(None)),
            running: Arc::new(RwLock::new(false)),
        }
    }

    /// Get the last report
    #[must_use]
    pub fn last_report(&self) -> Option<DiagnosticReport> {
        self.last_report.read().clone()
    }

    /// Check if diagnostics are running
    #[must_use]
    pub fn is_running(&self) -> bool {
        *self.running.read()
    }

    fn set_running(&self, running: bool) {
        *self.running.write() = running;
    }

    fn set_report(&self, report: DiagnosticReport) {
        *self.last_report.write() = Some(report);
    }
}

/// Response for doctor command
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DoctorResponse {
    /// The diagnostic report
    pub report: DiagnosticReport,
    /// Human-readable formatted output
    pub formatted_output: String,
}

/// Run all diagnostic checks (the /doctor command)
///
/// This is the main entry point for the diagnostics system. It runs all
/// configured health checks and returns a comprehensive report.
#[tauri::command]
pub async fn doctor_run_checks(
    app_handle: tauri::AppHandle,
    state: State<'_, DiagnosticsState>,
    extended: Option<bool>,
) -> Result<DoctorResponse, String> {
    // Check if already running
    if state.is_running() {
        return Err("Diagnostics are already running".to_string());
    }

    state.set_running(true);

    // Get app data directory
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let ctx = DiagnosticContext::new(app_data_dir)
        .with_extended(extended.unwrap_or(false))
        .with_app_handle(app_handle.clone());

    let runner = DiagnosticRunner::new();

    // Run with progress events
    let report = runner.run_all_with_progress(&ctx, Some(&app_handle)).await;

    let formatted_output = report.format_text();

    state.set_report(report.clone());
    state.set_running(false);

    tracing::info!(
        "[Diagnostics] Completed: {} passed, {} warnings, {} errors in {}ms",
        report.passed,
        report.warnings,
        report.errors,
        report.duration_ms
    );

    Ok(DoctorResponse {
        report,
        formatted_output,
    })
}

/// Run a specific diagnostic check by ID
#[tauri::command]
pub async fn doctor_run_check(
    app_handle: tauri::AppHandle,
    check_id: String,
    extended: Option<bool>,
) -> Result<DiagnosticResult, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let ctx = DiagnosticContext::new(app_data_dir)
        .with_extended(extended.unwrap_or(false))
        .with_app_handle(app_handle);

    let runner = DiagnosticRunner::new();

    runner
        .run_check(&check_id, &ctx)
        .await
        .ok_or_else(|| format!("Check '{}' not found", check_id))
}

/// Get the last diagnostic report (cached)
#[tauri::command]
pub async fn doctor_get_report(
    state: State<'_, DiagnosticsState>,
) -> Result<Option<DiagnosticReport>, String> {
    Ok(state.last_report())
}

/// Get list of available checks
#[tauri::command]
pub async fn doctor_list_checks() -> Result<Vec<CheckInfo>, String> {
    let runner = DiagnosticRunner::new();
    Ok(runner.check_info())
}

/// Check if diagnostics are currently running
#[tauri::command]
pub async fn doctor_is_running(state: State<'_, DiagnosticsState>) -> Result<bool, String> {
    Ok(state.is_running())
}

/// Format a diagnostic report as text (for /doctor command output)
#[tauri::command]
pub async fn doctor_format_report(report: DiagnosticReport) -> Result<String, String> {
    Ok(report.format_text())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_diagnostics_state() {
        let state = DiagnosticsState::new();

        assert!(!state.is_running());
        assert!(state.last_report().is_none());

        state.set_running(true);
        assert!(state.is_running());

        state.set_running(false);
        assert!(!state.is_running());
    }
}
