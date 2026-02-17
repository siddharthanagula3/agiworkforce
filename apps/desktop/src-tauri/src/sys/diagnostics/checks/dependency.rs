//! Dependency check
//!
//! Checks for required external binaries and dependencies.

use crate::sys::diagnostics::{DiagnosticCheck, DiagnosticContext, DiagnosticResult};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::time::Duration;

/// Checks for required external dependencies
pub struct DependencyCheck;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DependencyStatus {
    name: String,
    required: bool,
    found: bool,
    version: Option<String>,
    path: Option<String>,
    purpose: String,
}

/// Dependencies to check
const DEPENDENCIES: &[(&str, bool, &str, &[&str])] = &[
    ("node", false, "Required for MCP servers", &["--version"]),
    (
        "npm",
        false,
        "Required for installing MCP servers",
        &["--version"],
    ),
    (
        "npx",
        false,
        "Required for running MCP servers",
        &["--version"],
    ),
    (
        "git",
        false,
        "Required for GitHub integration",
        &["--version"],
    ),
    (
        "ffmpeg",
        false,
        "Required for audio/video processing",
        &["-version"],
    ),
];

#[async_trait]
impl DiagnosticCheck for DependencyCheck {
    fn id(&self) -> &'static str {
        "dependencies"
    }

    fn name(&self) -> &'static str {
        "External Dependencies"
    }

    fn description(&self) -> &'static str {
        "Checks for required external binaries (node, npm, git, etc.)"
    }

    fn category(&self) -> &'static str {
        "system"
    }

    fn is_critical(&self) -> bool {
        false // Most deps are optional
    }

    fn estimated_duration(&self) -> Duration {
        Duration::from_secs(5)
    }

    async fn run(&self, _ctx: &DiagnosticContext) -> DiagnosticResult {
        let start = std::time::Instant::now();

        let mut statuses: Vec<DependencyStatus> = Vec::new();
        let mut missing_required: Vec<String> = Vec::new();
        let mut missing_optional: Vec<String> = Vec::new();

        for (name, required, purpose, version_args) in DEPENDENCIES {
            let status = check_dependency(name, *required, purpose, version_args);

            if !status.found {
                if *required {
                    missing_required.push(name.to_string());
                } else {
                    missing_optional.push(name.to_string());
                }
            }

            statuses.push(status);
        }

        // Platform-specific checks
        #[cfg(target_os = "macos")]
        {
            // Check for macOS-specific dependencies
            let xcode_status = check_xcode_cli_tools();
            if !xcode_status.found {
                missing_optional.push("Xcode CLI Tools".to_string());
            }
            statuses.push(xcode_status);
        }

        let duration = start.elapsed();
        let found_count = statuses.iter().filter(|s| s.found).count();
        let total_count = statuses.len();

        if !missing_required.is_empty() {
            return DiagnosticResult::error(
                self.id(),
                self.name(),
                format!(
                    "Missing required dependencies: {}",
                    missing_required.join(", ")
                ),
                "Install the missing dependencies to enable full functionality.",
            )
            .with_duration(duration)
            .with_metadata(serde_json::json!({
                "dependencies": statuses,
                "found": found_count,
                "total": total_count,
                "missing_required": missing_required,
                "missing_optional": missing_optional,
            }));
        }

        if !missing_optional.is_empty() {
            return DiagnosticResult::warning(
                self.id(),
                self.name(),
                format!(
                    "Dependencies: {}/{} found (missing: {})",
                    found_count,
                    total_count,
                    missing_optional.join(", ")
                ),
                "Some optional features may be unavailable. Install missing dependencies for full functionality.",
            )
            .with_duration(duration)
            .with_metadata(serde_json::json!({
                "dependencies": statuses,
                "found": found_count,
                "total": total_count,
                "missing_optional": missing_optional,
            }));
        }

        DiagnosticResult::ok(
            self.id(),
            self.name(),
            format!("Dependencies OK ({}/{})", found_count, total_count),
        )
        .with_duration(duration)
        .with_metadata(serde_json::json!({
            "dependencies": statuses,
            "found": found_count,
            "total": total_count,
        }))
    }
}

fn check_dependency(
    name: &str,
    required: bool,
    purpose: &str,
    version_args: &[&str],
) -> DependencyStatus {
    // Try to find the binary
    let path = which::which(name).ok();
    let found = path.is_some();

    let version = if found {
        // Try to get version
        Command::new(name)
            .args(version_args)
            .output()
            .ok()
            .and_then(|output| {
                if output.status.success() {
                    String::from_utf8(output.stdout)
                        .ok()
                        .map(|s| s.lines().next().unwrap_or("").trim().to_string())
                        .filter(|s| !s.is_empty())
                } else {
                    None
                }
            })
    } else {
        None
    };

    DependencyStatus {
        name: name.to_string(),
        required,
        found,
        version,
        path: path.map(|p| p.to_string_lossy().to_string()),
        purpose: purpose.to_string(),
    }
}

#[cfg(target_os = "macos")]
fn check_xcode_cli_tools() -> DependencyStatus {
    let output = Command::new("xcode-select").arg("-p").output();

    let (found, path) = match output {
        Ok(output) if output.status.success() => {
            let path = String::from_utf8(output.stdout)
                .ok()
                .map(|s| s.trim().to_string());
            (true, path)
        }
        _ => (false, None),
    };

    DependencyStatus {
        name: "Xcode CLI Tools".to_string(),
        required: false,
        found,
        version: None,
        path,
        purpose: "Required for building native extensions".to_string(),
    }
}

#[cfg(not(target_os = "macos"))]
#[allow(dead_code)]
fn check_xcode_cli_tools() -> DependencyStatus {
    DependencyStatus {
        name: "Xcode CLI Tools".to_string(),
        required: false,
        found: true, // Not applicable
        version: None,
        path: None,
        purpose: "macOS only".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sys::diagnostics::Severity;

    #[tokio::test]
    async fn test_dependency_check() {
        let check = DependencyCheck;
        let ctx = DiagnosticContext::new(std::path::PathBuf::from("/tmp"));

        let result = check.run(&ctx).await;
        // Result depends on what's installed
        assert!(
            result.severity == Severity::Ok
                || result.severity == Severity::Warning
                || result.severity == Severity::Error
        );
    }

    #[test]
    fn test_check_dependency_node() {
        let status = check_dependency("node", false, "test", &["--version"]);
        // Node may or may not be installed
        if status.found {
            assert!(status.version.is_some());
            assert!(status.path.is_some());
        }
    }
}
