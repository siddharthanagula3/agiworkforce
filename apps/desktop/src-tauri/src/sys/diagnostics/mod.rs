//! Diagnostics system for AGI Workforce
//!
//! Provides a pluggable diagnostic check framework inspired by Moltbot /doctor
//! and Claude Code /doctor commands. Runs comprehensive health checks on the
//! application's subsystems and generates actionable suggestions.
//!
//! # Example
//!
//! ```ignore
//! use crate::sys::diagnostics::{DiagnosticRunner, DiagnosticReport};
//!
//! let runner = DiagnosticRunner::new();
//! let report = runner.run_all_checks().await;
//! println!("{}", report.to_string());
//! ```

pub mod checks;
pub mod commands;
pub mod runner;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::time::Duration;

pub use checks::{
    AuthHealthCheck, ConfigValidationCheck, DatabaseIntegrityCheck, DependencyCheck,
    DiskSpaceCheck, McpConnectivityCheck, NetworkCheck, PermissionsCheck,
};
pub use commands::{
    doctor_format_report, doctor_get_report, doctor_is_running, doctor_list_checks,
    doctor_run_check, doctor_run_checks, DiagnosticsState,
};
pub use runner::DiagnosticRunner;

/// Severity level for diagnostic results
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    /// Everything is working correctly
    Ok,
    /// Minor issue that may require attention
    Warning,
    /// Critical issue that needs immediate attention
    Error,
    /// Check was skipped (e.g., optional dependency not installed)
    Skipped,
}

impl Severity {
    /// Returns the icon for this severity level
    #[must_use]
    pub fn icon(&self) -> &'static str {
        match self {
            Severity::Ok => "\u{2713}",      // checkmark
            Severity::Warning => "\u{26A0}", // warning triangle
            Severity::Error => "\u{2717}",   // X mark
            Severity::Skipped => "\u{2014}", // em dash
        }
    }
}

impl std::fmt::Display for Severity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let text = match self {
            Severity::Ok => "OK",
            Severity::Warning => "Warning",
            Severity::Error => "Error",
            Severity::Skipped => "Skipped",
        };
        write!(f, "{}", text)
    }
}

/// Result of a single diagnostic check
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticResult {
    /// Unique identifier for the check
    pub check_id: String,
    /// Human-readable name of the check
    pub check_name: String,
    /// Severity of the result
    pub severity: Severity,
    /// Short status message
    pub message: String,
    /// Detailed information (optional)
    pub details: Option<String>,
    /// Suggested fix if there's an issue (optional)
    pub suggestion: Option<String>,
    /// Time taken to run the check
    pub duration_ms: u64,
    /// When the check was executed
    pub timestamp: DateTime<Utc>,
    /// Additional metadata
    #[serde(default)]
    pub metadata: serde_json::Value,
}

impl DiagnosticResult {
    /// Create a new successful result
    #[must_use]
    pub fn ok(
        check_id: impl Into<String>,
        check_name: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            check_id: check_id.into(),
            check_name: check_name.into(),
            severity: Severity::Ok,
            message: message.into(),
            details: None,
            suggestion: None,
            duration_ms: 0,
            timestamp: Utc::now(),
            metadata: serde_json::Value::Null,
        }
    }

    /// Create a warning result
    #[must_use]
    pub fn warning(
        check_id: impl Into<String>,
        check_name: impl Into<String>,
        message: impl Into<String>,
        suggestion: impl Into<String>,
    ) -> Self {
        Self {
            check_id: check_id.into(),
            check_name: check_name.into(),
            severity: Severity::Warning,
            message: message.into(),
            details: None,
            suggestion: Some(suggestion.into()),
            duration_ms: 0,
            timestamp: Utc::now(),
            metadata: serde_json::Value::Null,
        }
    }

    /// Create an error result
    #[must_use]
    pub fn error(
        check_id: impl Into<String>,
        check_name: impl Into<String>,
        message: impl Into<String>,
        suggestion: impl Into<String>,
    ) -> Self {
        Self {
            check_id: check_id.into(),
            check_name: check_name.into(),
            severity: Severity::Error,
            message: message.into(),
            details: None,
            suggestion: Some(suggestion.into()),
            duration_ms: 0,
            timestamp: Utc::now(),
            metadata: serde_json::Value::Null,
        }
    }

    /// Create a skipped result
    #[must_use]
    pub fn skipped(
        check_id: impl Into<String>,
        check_name: impl Into<String>,
        reason: impl Into<String>,
    ) -> Self {
        Self {
            check_id: check_id.into(),
            check_name: check_name.into(),
            severity: Severity::Skipped,
            message: reason.into(),
            details: None,
            suggestion: None,
            duration_ms: 0,
            timestamp: Utc::now(),
            metadata: serde_json::Value::Null,
        }
    }

    /// Add details to the result
    #[must_use]
    pub fn with_details(mut self, details: impl Into<String>) -> Self {
        self.details = Some(details.into());
        self
    }

    /// Add metadata to the result
    #[must_use]
    pub fn with_metadata(mut self, metadata: serde_json::Value) -> Self {
        self.metadata = metadata;
        self
    }

    /// Set the duration
    #[must_use]
    pub fn with_duration(mut self, duration: Duration) -> Self {
        self.duration_ms = duration.as_millis() as u64;
        self
    }

    /// Format as a single line for display
    #[must_use]
    pub fn format_line(&self) -> String {
        format!("{} {}", self.severity.icon(), self.message)
    }
}

/// Context provided to diagnostic checks
#[derive(Clone)]
pub struct DiagnosticContext {
    /// App data directory path
    pub app_data_dir: std::path::PathBuf,
    /// Database path
    pub db_path: std::path::PathBuf,
    /// Whether to run extended checks
    pub extended: bool,
    /// Tauri app handle (optional, for accessing managed state)
    pub app_handle: Option<tauri::AppHandle>,
}

impl DiagnosticContext {
    /// Create a new diagnostic context
    #[must_use]
    pub fn new(app_data_dir: std::path::PathBuf) -> Self {
        let db_path = app_data_dir.join("agiworkforce.db");
        Self {
            app_data_dir,
            db_path,
            extended: false,
            app_handle: None,
        }
    }

    /// Enable extended checks
    #[must_use]
    pub fn with_extended(mut self, extended: bool) -> Self {
        self.extended = extended;
        self
    }

    /// Set the app handle
    #[must_use]
    pub fn with_app_handle(mut self, app_handle: tauri::AppHandle) -> Self {
        self.app_handle = Some(app_handle);
        self
    }
}

/// Trait for implementing diagnostic checks
///
/// Each check should be focused on a single concern and provide clear,
/// actionable feedback. Checks are run in parallel by the `DiagnosticRunner`.
#[async_trait]
pub trait DiagnosticCheck: Send + Sync {
    /// Unique identifier for this check
    fn id(&self) -> &'static str;

    /// Human-readable name for this check
    fn name(&self) -> &'static str;

    /// Description of what this check verifies
    fn description(&self) -> &'static str;

    /// Category of the check (e.g., "system", "network", "security")
    fn category(&self) -> &'static str;

    /// Run the diagnostic check
    async fn run(&self, ctx: &DiagnosticContext) -> DiagnosticResult;

    /// Whether this check is critical (failures should block operations)
    fn is_critical(&self) -> bool {
        false
    }

    /// Estimated time to run this check (for progress reporting)
    fn estimated_duration(&self) -> Duration {
        Duration::from_millis(100)
    }
}

/// Aggregated diagnostic report
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticReport {
    /// All check results
    pub results: Vec<DiagnosticResult>,
    /// Total number of checks run
    pub total_checks: usize,
    /// Number of checks that passed
    pub passed: usize,
    /// Number of warnings
    pub warnings: usize,
    /// Number of errors
    pub errors: usize,
    /// Number of skipped checks
    pub skipped: usize,
    /// Overall health status
    pub overall_status: Severity,
    /// All suggestions aggregated
    pub suggestions: Vec<String>,
    /// Total time taken
    pub duration_ms: u64,
    /// When the report was generated
    pub timestamp: DateTime<Utc>,
}

impl DiagnosticReport {
    /// Create a new report from results
    #[must_use]
    pub fn from_results(results: Vec<DiagnosticResult>, duration: Duration) -> Self {
        let total_checks = results.len();
        let passed = results
            .iter()
            .filter(|r| r.severity == Severity::Ok)
            .count();
        let warnings = results
            .iter()
            .filter(|r| r.severity == Severity::Warning)
            .count();
        let errors = results
            .iter()
            .filter(|r| r.severity == Severity::Error)
            .count();
        let skipped = results
            .iter()
            .filter(|r| r.severity == Severity::Skipped)
            .count();

        let overall_status = if errors > 0 {
            Severity::Error
        } else if warnings > 0 {
            Severity::Warning
        } else {
            Severity::Ok
        };

        let suggestions: Vec<String> = results
            .iter()
            .filter_map(|r| r.suggestion.clone())
            .collect();

        Self {
            results,
            total_checks,
            passed,
            warnings,
            errors,
            skipped,
            overall_status,
            suggestions,
            duration_ms: duration.as_millis() as u64,
            timestamp: Utc::now(),
        }
    }

    /// Format as human-readable text
    #[must_use]
    pub fn format_text(&self) -> String {
        let mut output = String::new();

        // Results section
        for result in &self.results {
            output.push_str(&result.format_line());
            output.push('\n');
        }

        // Suggestions section
        if !self.suggestions.is_empty() {
            output.push('\n');
            output.push_str("Suggestions:\n");
            for suggestion in &self.suggestions {
                output.push_str(&format!("- {}\n", suggestion));
            }
        }

        // Summary
        output.push('\n');
        output.push_str(&format!(
            "Summary: {} passed, {} warnings, {} errors, {} skipped ({} total) in {}ms\n",
            self.passed,
            self.warnings,
            self.errors,
            self.skipped,
            self.total_checks,
            self.duration_ms
        ));

        output
    }
}

impl std::fmt::Display for DiagnosticReport {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.format_text())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_severity_ordering() {
        assert!(Severity::Ok < Severity::Warning);
        assert!(Severity::Warning < Severity::Error);
    }

    #[test]
    fn test_severity_icons() {
        assert_eq!(Severity::Ok.icon(), "\u{2713}");
        assert_eq!(Severity::Warning.icon(), "\u{26A0}");
        assert_eq!(Severity::Error.icon(), "\u{2717}");
    }

    #[test]
    fn test_diagnostic_result_creation() {
        let result = DiagnosticResult::ok("test_check", "Test Check", "All good");
        assert_eq!(result.severity, Severity::Ok);
        assert_eq!(result.check_id, "test_check");
        assert!(result.suggestion.is_none());

        let warning =
            DiagnosticResult::warning("warn_check", "Warning Check", "Something's off", "Fix it");
        assert_eq!(warning.severity, Severity::Warning);
        assert_eq!(warning.suggestion, Some("Fix it".to_string()));
    }

    #[test]
    fn test_report_aggregation() {
        let results = vec![
            DiagnosticResult::ok("check1", "Check 1", "OK"),
            DiagnosticResult::warning("check2", "Check 2", "Warning", "Fix this"),
            DiagnosticResult::error("check3", "Check 3", "Error", "Fix that"),
            DiagnosticResult::skipped("check4", "Check 4", "Not applicable"),
        ];

        let report = DiagnosticReport::from_results(results, Duration::from_millis(100));

        assert_eq!(report.total_checks, 4);
        assert_eq!(report.passed, 1);
        assert_eq!(report.warnings, 1);
        assert_eq!(report.errors, 1);
        assert_eq!(report.skipped, 1);
        assert_eq!(report.overall_status, Severity::Error);
        assert_eq!(report.suggestions.len(), 2);
    }
}
