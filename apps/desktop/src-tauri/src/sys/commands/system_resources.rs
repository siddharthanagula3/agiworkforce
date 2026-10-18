use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;

static SYSTEM_MONITOR: LazyLock<Mutex<sysinfo::System>> =
    LazyLock::new(|| Mutex::new(sysinfo::System::new()));

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemResourcesResponse {
    pub cpu_usage_percent: f64,
    pub memory_usage_mb: u64,
    pub memory_total_mb: u64,
}

/// CPU usage is the change since the previous call, so the monitor kept between
/// calls reads a real figure from the second poll on.
#[tauri::command]
pub async fn get_system_resources() -> Result<SystemResourcesResponse, String> {
    let mut system = SYSTEM_MONITOR.lock();
    system.refresh_cpu_usage();
    system.refresh_memory();
    Ok(SystemResourcesResponse {
        cpu_usage_percent: f64::from(system.global_cpu_info().cpu_usage()),
        memory_usage_mb: system.used_memory() / 1024 / 1024,
        memory_total_mb: system.total_memory() / 1024 / 1024,
    })
}
