//! File system permissions check
//!
//! Verifies the application has required file system permissions.

use crate::sys::diagnostics::{DiagnosticCheck, DiagnosticContext, DiagnosticResult};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Checks file system permissions
pub struct PermissionsCheck;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PermissionStatus {
    path: String,
    exists: bool,
    readable: bool,
    writable: bool,
    error: Option<String>,
}

#[async_trait]
impl DiagnosticCheck for PermissionsCheck {
    fn id(&self) -> &'static str {
        "permissions"
    }

    fn name(&self) -> &'static str {
        "File System Permissions"
    }

    fn description(&self) -> &'static str {
        "Verifies read/write permissions for app data directories"
    }

    fn category(&self) -> &'static str {
        "system"
    }

    fn is_critical(&self) -> bool {
        true
    }

    fn estimated_duration(&self) -> Duration {
        Duration::from_millis(100)
    }

    async fn run(&self, ctx: &DiagnosticContext) -> DiagnosticResult {
        let start = std::time::Instant::now();

        let mut statuses: Vec<PermissionStatus> = Vec::new();
        let mut issues: Vec<String> = Vec::new();
        let mut warnings: Vec<String> = Vec::new();

        // Check app data directory
        let app_data_status = check_directory_permissions(&ctx.app_data_dir);
        if !app_data_status.exists {
            // Try to create it
            if std::fs::create_dir_all(&ctx.app_data_dir).is_ok() {
                let status = check_directory_permissions(&ctx.app_data_dir);
                if !status.writable {
                    issues.push(format!(
                        "App data directory not writable: {}",
                        ctx.app_data_dir.display()
                    ));
                }
                statuses.push(status);
            } else {
                issues.push(format!(
                    "Cannot create app data directory: {}",
                    ctx.app_data_dir.display()
                ));
                statuses.push(app_data_status);
            }
        } else {
            if !app_data_status.writable {
                issues.push(format!(
                    "App data directory not writable: {}",
                    ctx.app_data_dir.display()
                ));
            }
            statuses.push(app_data_status);
        }

        // Check database file permissions (if exists)
        if ctx.db_path.exists() {
            let db_status = check_file_permissions(&ctx.db_path);
            if !db_status.readable {
                issues.push(format!(
                    "Database file not readable: {}",
                    ctx.db_path.display()
                ));
            }
            if !db_status.writable {
                issues.push(format!(
                    "Database file not writable: {}",
                    ctx.db_path.display()
                ));
            }
            statuses.push(db_status);
        }

        // Check common directories that might be needed
        let optional_dirs = [
            (ctx.app_data_dir.join("logs"), "logs"),
            (ctx.app_data_dir.join("cache"), "cache"),
            (ctx.app_data_dir.join("mcp"), "MCP servers"),
        ];

        for (path, name) in &optional_dirs {
            if path.exists() {
                let status = check_directory_permissions(path);
                if !status.writable {
                    warnings.push(format!(
                        "{} directory not writable: {}",
                        name,
                        path.display()
                    ));
                }
                statuses.push(status);
            }
        }

        // Check temp directory
        let temp_dir = std::env::temp_dir();
        let temp_status = check_directory_permissions(&temp_dir);
        if !temp_status.writable {
            warnings.push("System temp directory not writable".to_string());
        }
        statuses.push(temp_status);

        let duration = start.elapsed();

        if !issues.is_empty() {
            return DiagnosticResult::error(
                self.id(),
                self.name(),
                format!("Permission issues: {}", issues.join("; ")),
                "Check directory permissions. On macOS/Linux, use chmod. On Windows, check folder security properties.",
            )
            .with_duration(duration)
            .with_metadata(serde_json::json!({
                "permissions": statuses,
                "issues": issues,
            }));
        }

        if !warnings.is_empty() {
            return DiagnosticResult::warning(
                self.id(),
                self.name(),
                format!("Minor permission issues: {}", warnings.join("; ")),
                "Some optional directories have limited permissions.",
            )
            .with_duration(duration)
            .with_metadata(serde_json::json!({
                "permissions": statuses,
                "warnings": warnings,
            }));
        }

        DiagnosticResult::ok(self.id(), self.name(), "File permissions OK")
            .with_duration(duration)
            .with_metadata(serde_json::json!({
                "permissions": statuses,
            }))
    }
}

fn check_directory_permissions(path: &std::path::Path) -> PermissionStatus {
    let exists = path.exists();
    let readable = exists && path.read_dir().is_ok();

    // Check writable by trying to create a temp file
    let writable = if exists {
        let test_file = path.join(".permission_test");
        let can_write = std::fs::write(&test_file, b"test").is_ok();
        let _ = std::fs::remove_file(&test_file);
        can_write
    } else {
        false
    };

    PermissionStatus {
        path: path.to_string_lossy().to_string(),
        exists,
        readable,
        writable,
        error: None,
    }
}

fn check_file_permissions(path: &std::path::Path) -> PermissionStatus {
    let exists = path.exists();
    let readable = exists && std::fs::read(path).is_ok();

    // Check writable by opening in append mode
    let writable = if exists {
        std::fs::OpenOptions::new().append(true).open(path).is_ok()
    } else {
        false
    };

    PermissionStatus {
        path: path.to_string_lossy().to_string(),
        exists,
        readable,
        writable,
        error: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sys::diagnostics::Severity;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_permissions_check_temp_dir() {
        let check = PermissionsCheck;
        let temp_dir = TempDir::new().unwrap();
        let ctx = DiagnosticContext::new(temp_dir.path().to_path_buf());

        let result = check.run(&ctx).await;
        assert_eq!(result.severity, Severity::Ok);
    }

    #[tokio::test]
    async fn test_permissions_check_nonexistent() {
        let check = PermissionsCheck;
        // Use a path that definitely doesn't exist and can't be created
        let ctx = DiagnosticContext::new(std::path::PathBuf::from(
            "/root/definitely_not_writable_12345",
        ));

        let result = check.run(&ctx).await;
        // Should be error because we can't create the directory
        assert!(result.severity == Severity::Error || result.severity == Severity::Warning);
    }
}
