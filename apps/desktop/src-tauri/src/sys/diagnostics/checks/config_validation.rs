//! Configuration validation check
//!
//! Validates application settings and configuration files.

use crate::sys::diagnostics::{DiagnosticCheck, DiagnosticContext, DiagnosticResult};
use async_trait::async_trait;
use std::time::Duration;

/// Validates configuration and settings
pub struct ConfigValidationCheck;

#[async_trait]
impl DiagnosticCheck for ConfigValidationCheck {
    fn id(&self) -> &'static str {
        "config_validation"
    }

    fn name(&self) -> &'static str {
        "Configuration Validation"
    }

    fn description(&self) -> &'static str {
        "Validates application settings, configuration files, and environment"
    }

    fn category(&self) -> &'static str {
        "system"
    }

    fn is_critical(&self) -> bool {
        true
    }

    fn estimated_duration(&self) -> Duration {
        Duration::from_millis(50)
    }

    async fn run(&self, ctx: &DiagnosticContext) -> DiagnosticResult {
        let start = std::time::Instant::now();
        let mut issues: Vec<String> = Vec::new();
        let mut warnings: Vec<String> = Vec::new();

        // Check if app data directory exists
        if !ctx.app_data_dir.exists() {
            issues.push("App data directory does not exist".to_string());
        } else if !ctx.app_data_dir.is_dir() {
            issues.push("App data path is not a directory".to_string());
        }

        // Check if database file exists
        if !ctx.db_path.exists() {
            // This is a warning, not an error - DB might be created on first run
            warnings.push("Database file does not exist (may be first run)".to_string());
        }

        // Check for MCP config file
        let mcp_config_path = ctx.app_data_dir.join("mcp_config.json");
        if mcp_config_path.exists() {
            // Validate MCP config is valid JSON
            match std::fs::read_to_string(&mcp_config_path) {
                Ok(content) => {
                    if let Err(e) = serde_json::from_str::<serde_json::Value>(&content) {
                        issues.push(format!("MCP config is invalid JSON: {}", e));
                    }
                }
                Err(e) => {
                    warnings.push(format!("Could not read MCP config: {}", e));
                }
            }
        }

        // Check for settings database integrity
        if ctx.db_path.exists() {
            match validate_settings_schema(&ctx.db_path) {
                Ok(()) => {}
                Err(e) => {
                    warnings.push(format!("Settings schema issue: {}", e));
                }
            }
        }

        // Check environment variables
        let required_env_vars: Vec<&str> = vec![];
        let optional_env_vars = vec![
            ("AGI_WORKFORCE_LOG_LEVEL", "Controls logging verbosity"),
            ("AGI_WORKFORCE_API_BASE", "Custom API base URL"),
        ];

        for var in required_env_vars {
            if std::env::var(var).is_err() {
                issues.push(format!("Required environment variable {} is not set", var));
            }
        }

        // Check optional env vars for warnings
        let mut env_info: Vec<String> = Vec::new();
        for (var, desc) in optional_env_vars {
            if std::env::var(var).is_ok() {
                env_info.push(format!("{}: set ({})", var, desc));
            }
        }

        let duration = start.elapsed();

        if !issues.is_empty() {
            return DiagnosticResult::error(
                self.id(),
                self.name(),
                format!("Configuration invalid: {}", issues.join("; ")),
                "Check your configuration files and ensure app data directory is writable",
            )
            .with_duration(duration)
            .with_metadata(serde_json::json!({
                "issues": issues,
                "warnings": warnings,
                "app_data_dir": ctx.app_data_dir.to_string_lossy(),
            }));
        }

        if !warnings.is_empty() {
            return DiagnosticResult::warning(
                self.id(),
                self.name(),
                format!("Configuration valid with warnings: {}", warnings.join("; ")),
                "Review the warnings and address any that affect your workflow",
            )
            .with_duration(duration)
            .with_metadata(serde_json::json!({
                "warnings": warnings,
                "env_info": env_info,
            }));
        }

        DiagnosticResult::ok(self.id(), self.name(), "Configuration valid")
            .with_duration(duration)
            .with_metadata(serde_json::json!({
                "app_data_dir": ctx.app_data_dir.to_string_lossy(),
                "db_path": ctx.db_path.to_string_lossy(),
                "env_info": env_info,
            }))
    }
}

fn validate_settings_schema(db_path: &std::path::Path) -> Result<(), String> {
    let conn = rusqlite::Connection::open(db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    // Check if settings table exists
    let table_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='settings'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to check settings table: {}", e))?;

    if !table_exists {
        return Err("Settings table does not exist".to_string());
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sys::diagnostics::Severity;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_config_validation_missing_dir() {
        let check = ConfigValidationCheck;
        let ctx = DiagnosticContext::new(std::path::PathBuf::from("/nonexistent/path"));

        let result = check.run(&ctx).await;
        assert_eq!(result.severity, Severity::Error);
    }

    #[tokio::test]
    async fn test_config_validation_valid_dir() {
        let check = ConfigValidationCheck;
        let temp_dir = TempDir::new().unwrap();
        let ctx = DiagnosticContext::new(temp_dir.path().to_path_buf());

        let result = check.run(&ctx).await;
        // Should be warning (no DB) or OK
        assert!(result.severity == Severity::Ok || result.severity == Severity::Warning);
    }
}
