//! Disk space check
//!
//! Verifies sufficient storage is available for application operations.

use crate::sys::diagnostics::{DiagnosticCheck, DiagnosticContext, DiagnosticResult};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use sysinfo::Disks;

/// Checks available disk space
pub struct DiskSpaceCheck;

/// Minimum recommended free space (1 GB)
const MIN_FREE_SPACE_BYTES: u64 = 1_073_741_824;
/// Warning threshold (5 GB)
const WARNING_FREE_SPACE_BYTES: u64 = 5_368_709_120;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DiskInfo {
    mount_point: String,
    total_bytes: u64,
    available_bytes: u64,
    used_percent: f64,
    filesystem: String,
}

#[async_trait]
impl DiagnosticCheck for DiskSpaceCheck {
    fn id(&self) -> &'static str {
        "disk_space"
    }

    fn name(&self) -> &'static str {
        "Disk Space"
    }

    fn description(&self) -> &'static str {
        "Checks available storage space on the disk containing app data"
    }

    fn category(&self) -> &'static str {
        "system"
    }

    fn is_critical(&self) -> bool {
        false
    }

    fn estimated_duration(&self) -> Duration {
        Duration::from_millis(100)
    }

    async fn run(&self, ctx: &DiagnosticContext) -> DiagnosticResult {
        let start = std::time::Instant::now();

        // Get disk info for the app data directory
        let disks = Disks::new_with_refreshed_list();
        let app_data_dir = &ctx.app_data_dir;

        // Find the disk that contains our app data directory
        let disk_info = find_disk_for_path(&disks, app_data_dir);

        let duration = start.elapsed();

        match disk_info {
            Some(info) => {
                let available_gb = info.available_bytes as f64 / 1_073_741_824.0;

                if info.available_bytes < MIN_FREE_SPACE_BYTES {
                    DiagnosticResult::error(
                        self.id(),
                        self.name(),
                        format!(
                            "Critically low disk space: {:.2} GB available",
                            available_gb
                        ),
                        "Free up disk space to ensure proper operation. Delete unused files or move data to another drive.",
                    )
                    .with_duration(duration)
                    .with_metadata(serde_json::to_value(&info).unwrap_or_default())
                } else if info.available_bytes < WARNING_FREE_SPACE_BYTES {
                    DiagnosticResult::warning(
                        self.id(),
                        self.name(),
                        format!("Low disk space: {:.2} GB available", available_gb),
                        "Consider freeing up disk space to prevent issues during large operations.",
                    )
                    .with_duration(duration)
                    .with_metadata(serde_json::to_value(&info).unwrap_or_default())
                } else {
                    DiagnosticResult::ok(
                        self.id(),
                        self.name(),
                        format!("Disk space: {:.2}GB available", available_gb),
                    )
                    .with_duration(duration)
                    .with_metadata(serde_json::to_value(&info).unwrap_or_default())
                }
            }
            None => DiagnosticResult::warning(
                self.id(),
                self.name(),
                "Could not determine disk space",
                "Unable to find disk information for the app data directory.",
            )
            .with_duration(duration),
        }
    }
}

fn find_disk_for_path(disks: &Disks, path: &std::path::Path) -> Option<DiskInfo> {
    let path_str = path.to_string_lossy();

    // Find the disk with the longest matching mount point
    let mut best_match: Option<(&sysinfo::Disk, usize)> = None;

    for disk in disks.list() {
        let mount = disk.mount_point().to_string_lossy();
        if path_str.starts_with(mount.as_ref()) {
            let mount_len = mount.len();
            if best_match.is_none_or(|(_, len)| mount_len > len) {
                best_match = Some((disk, mount_len));
            }
        }
    }

    best_match.map(|(disk, _)| {
        let total = disk.total_space();
        let available = disk.available_space();
        let used = total.saturating_sub(available);
        let used_percent = if total > 0 {
            (used as f64 / total as f64) * 100.0
        } else {
            0.0
        };

        DiskInfo {
            mount_point: disk.mount_point().to_string_lossy().to_string(),
            total_bytes: total,
            available_bytes: available,
            used_percent,
            filesystem: disk.file_system().to_string_lossy().to_string(),
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_disk_space_check() {
        let check = DiskSpaceCheck;
        let ctx = DiagnosticContext::new(std::env::temp_dir());

        let result = check.run(&ctx).await;
        // Should succeed on any system with temp dir
        assert!(
            result.severity == crate::sys::diagnostics::Severity::Ok
                || result.severity == crate::sys::diagnostics::Severity::Warning
        );
    }
}
