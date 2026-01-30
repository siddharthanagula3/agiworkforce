//! Diagnostic runner
//!
//! Orchestrates running diagnostic checks in parallel and collecting results.

use crate::sys::diagnostics::{
    checks, DiagnosticCheck, DiagnosticContext, DiagnosticReport, DiagnosticResult,
};
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;

/// Event emitted during diagnostic progress
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticProgressEvent {
    /// Current check being run
    pub current_check: String,
    /// Index of current check (1-based)
    pub current_index: usize,
    /// Total number of checks
    pub total_checks: usize,
    /// Results so far
    pub completed_results: Vec<DiagnosticResult>,
}

/// Event emitted when diagnostics complete
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticCompleteEvent {
    /// The complete report
    pub report: DiagnosticReport,
}

/// Runs diagnostic checks and aggregates results
pub struct DiagnosticRunner {
    checks: Vec<Arc<dyn DiagnosticCheck>>,
    parallel: bool,
}

impl Default for DiagnosticRunner {
    fn default() -> Self {
        Self::new()
    }
}

impl DiagnosticRunner {
    /// Create a new runner with all built-in checks
    #[must_use]
    pub fn new() -> Self {
        Self {
            checks: checks::all_checks(),
            parallel: true,
        }
    }

    /// Create a runner with critical checks only
    #[must_use]
    pub fn critical_only() -> Self {
        Self {
            checks: checks::critical_checks(),
            parallel: true,
        }
    }

    /// Create a runner with specific checks
    #[must_use]
    pub fn with_checks(checks: Vec<Arc<dyn DiagnosticCheck>>) -> Self {
        Self {
            checks,
            parallel: true,
        }
    }

    /// Add a custom check
    pub fn add_check(&mut self, check: Arc<dyn DiagnosticCheck>) {
        self.checks.push(check);
    }

    /// Set whether to run checks in parallel (default: true)
    #[must_use]
    pub fn parallel(mut self, parallel: bool) -> Self {
        self.parallel = parallel;
        self
    }

    /// Run all configured checks
    pub async fn run_all(&self, ctx: &DiagnosticContext) -> DiagnosticReport {
        let start = std::time::Instant::now();

        let results = if self.parallel {
            self.run_parallel(ctx).await
        } else {
            self.run_sequential(ctx).await
        };

        DiagnosticReport::from_results(results, start.elapsed())
    }

    /// Run all checks with progress events
    pub async fn run_all_with_progress(
        &self,
        ctx: &DiagnosticContext,
        app_handle: Option<&tauri::AppHandle>,
    ) -> DiagnosticReport {
        let start = std::time::Instant::now();
        let total = self.checks.len();
        let mut completed_results: Vec<DiagnosticResult> = Vec::new();

        for (index, check) in self.checks.iter().enumerate() {
            // Emit progress event
            if let Some(handle) = app_handle {
                let event = DiagnosticProgressEvent {
                    current_check: check.name().to_string(),
                    current_index: index + 1,
                    total_checks: total,
                    completed_results: completed_results.clone(),
                };
                let _ = handle.emit("diagnostics:progress", event);
            }

            // Run the check
            let check_start = std::time::Instant::now();
            let mut result = check.run(ctx).await;
            result.duration_ms = check_start.elapsed().as_millis() as u64;

            tracing::debug!(
                "[Diagnostics] {} ({}) - {:?} in {}ms",
                check.name(),
                check.id(),
                result.severity,
                result.duration_ms
            );

            completed_results.push(result);
        }

        let report = DiagnosticReport::from_results(completed_results, start.elapsed());

        // Emit completion event
        if let Some(handle) = app_handle {
            let event = DiagnosticCompleteEvent {
                report: report.clone(),
            };
            let _ = handle.emit("diagnostics:complete", event);
        }

        report
    }

    /// Run a specific check by ID
    pub async fn run_check(
        &self,
        check_id: &str,
        ctx: &DiagnosticContext,
    ) -> Option<DiagnosticResult> {
        let check = self.checks.iter().find(|c| c.id() == check_id)?;

        let start = std::time::Instant::now();
        let mut result = check.run(ctx).await;
        result.duration_ms = start.elapsed().as_millis() as u64;

        Some(result)
    }

    /// Get estimated total duration for all checks
    #[must_use]
    pub fn estimated_duration(&self) -> Duration {
        if self.parallel {
            // In parallel, estimate is the max individual duration + overhead
            self.checks
                .iter()
                .map(|c| c.estimated_duration())
                .max()
                .unwrap_or(Duration::ZERO)
                + Duration::from_millis(100)
        } else {
            // Sequential is sum of all
            self.checks
                .iter()
                .map(|c| c.estimated_duration())
                .sum::<Duration>()
        }
    }

    /// Get list of check IDs
    #[must_use]
    pub fn check_ids(&self) -> Vec<&'static str> {
        self.checks.iter().map(|c| c.id()).collect()
    }

    /// Get check metadata
    #[must_use]
    pub fn check_info(&self) -> Vec<CheckInfo> {
        self.checks
            .iter()
            .map(|c| CheckInfo {
                id: c.id().to_string(),
                name: c.name().to_string(),
                description: c.description().to_string(),
                category: c.category().to_string(),
                is_critical: c.is_critical(),
                estimated_duration_ms: c.estimated_duration().as_millis() as u64,
            })
            .collect()
    }

    async fn run_parallel(&self, ctx: &DiagnosticContext) -> Vec<DiagnosticResult> {
        let futures: Vec<_> = self
            .checks
            .iter()
            .map(|check| {
                let check = check.clone();
                let ctx = ctx.clone();
                async move {
                    let start = std::time::Instant::now();
                    let mut result = check.run(&ctx).await;
                    result.duration_ms = start.elapsed().as_millis() as u64;
                    result
                }
            })
            .collect();

        futures::future::join_all(futures).await
    }

    async fn run_sequential(&self, ctx: &DiagnosticContext) -> Vec<DiagnosticResult> {
        let mut results = Vec::with_capacity(self.checks.len());

        for check in &self.checks {
            let start = std::time::Instant::now();
            let mut result = check.run(ctx).await;
            result.duration_ms = start.elapsed().as_millis() as u64;
            results.push(result);
        }

        results
    }
}

/// Information about a diagnostic check
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub is_critical: bool,
    pub estimated_duration_ms: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_runner_all_checks() {
        let runner = DiagnosticRunner::new();
        let temp_dir = TempDir::new().unwrap();
        let ctx = DiagnosticContext::new(temp_dir.path().to_path_buf());

        let report = runner.run_all(&ctx).await;

        assert!(report.total_checks > 0);
        assert_eq!(report.results.len(), report.total_checks);
    }

    #[tokio::test]
    async fn test_runner_specific_check() {
        let runner = DiagnosticRunner::new();
        let temp_dir = TempDir::new().unwrap();
        let ctx = DiagnosticContext::new(temp_dir.path().to_path_buf());

        let result = runner.run_check("config_validation", &ctx).await;
        assert!(result.is_some());

        let result = runner.run_check("nonexistent_check", &ctx).await;
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_runner_sequential() {
        let runner = DiagnosticRunner::new().parallel(false);
        let temp_dir = TempDir::new().unwrap();
        let ctx = DiagnosticContext::new(temp_dir.path().to_path_buf());

        let report = runner.run_all(&ctx).await;
        assert!(report.total_checks > 0);
    }

    #[test]
    fn test_check_info() {
        let runner = DiagnosticRunner::new();
        let info = runner.check_info();

        assert!(!info.is_empty());
        assert!(info.iter().any(|i| i.id == "config_validation"));
    }
}
