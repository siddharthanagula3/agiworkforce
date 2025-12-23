use serde::{Deserialize, Serialize};
use sysinfo::{Networks, System};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemMetrics {
    pub cpu_usage: f32,
    pub memory_used_mb: u64,
    pub memory_total_mb: u64,
    pub disk_used_gb: f64,
    pub disk_total_gb: f64,
    pub network_rx_bytes: u64,
    pub network_tx_bytes: u64,
    pub uptime_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppMetrics {
    pub automations_count: u64,
    pub goals_count: u64,
    pub mcp_servers_count: u64,
    pub cache_hit_rate: f64,
    pub avg_goal_duration_ms: f64,
    pub active_sessions: u64,
    pub total_api_calls: u64,
    pub failed_operations: u64,
}

pub struct AnalyticsMetricsCollector {
    system: System,
    networks: Networks,
    app_metrics: AppMetrics,
}

impl AnalyticsMetricsCollector {
    pub fn new() -> Self {
        let mut system = System::new_all();
        system.refresh_all();
        let networks = Networks::new_with_refreshed_list();

        Self {
            system,
            networks,
            app_metrics: AppMetrics::default(),
        }
    }

    pub fn collect_system_metrics(&mut self) -> SystemMetrics {
        self.system.refresh_all();
        self.networks.refresh();

        let cpu_usage = self
            .system
            .cpus()
            .iter()
            .map(|cpu| cpu.cpu_usage())
            .sum::<f32>()
            / self.system.cpus().len() as f32;

        let memory_used_mb = self.system.used_memory() / 1024 / 1024;
        let memory_total_mb = self.system.total_memory() / 1024 / 1024;

        let disks = sysinfo::Disks::new_with_refreshed_list();
        let (disk_used_gb, disk_total_gb) = if let Some(disk) = disks.list().first() {
            let total = disk.total_space() as f64 / 1024.0 / 1024.0 / 1024.0;
            let available = disk.available_space() as f64 / 1024.0 / 1024.0 / 1024.0;
            (total - available, total)
        } else {
            (0.0, 0.0)
        };

        let (network_rx_bytes, network_tx_bytes) =
            self.networks.iter().fold((0, 0), |acc, (_, data)| {
                (
                    acc.0 + data.total_received(),
                    acc.1 + data.total_transmitted(),
                )
            });

        let uptime_seconds = sysinfo::System::uptime();

        SystemMetrics {
            cpu_usage,
            memory_used_mb,
            memory_total_mb,
            disk_used_gb,
            disk_total_gb,
            network_rx_bytes,
            network_tx_bytes,
            uptime_seconds,
        }
    }

    pub fn collect_app_metrics(&self) -> AppMetrics {
        self.app_metrics.clone()
    }

    pub fn increment_automations_count(&mut self) {
        self.app_metrics.automations_count += 1;
    }

    pub fn increment_goals_count(&mut self) {
        self.app_metrics.goals_count += 1;
    }

    pub fn set_mcp_servers_count(&mut self, count: u64) {
        self.app_metrics.mcp_servers_count = count;
    }

    pub fn set_cache_hit_rate(&mut self, rate: f64) {
        self.app_metrics.cache_hit_rate = rate;
    }

    pub fn set_avg_goal_duration(&mut self, duration_ms: f64) {
        self.app_metrics.avg_goal_duration_ms = duration_ms;
    }

    pub fn set_active_sessions(&mut self, count: u64) {
        self.app_metrics.active_sessions = count;
    }

    pub fn increment_api_calls(&mut self) {
        self.app_metrics.total_api_calls += 1;
    }

    pub fn increment_failed_operations(&mut self) {
        self.app_metrics.failed_operations += 1;
    }

    pub fn reset_app_metrics(&mut self) {
        self.app_metrics = AppMetrics::default();
    }
}

impl Default for AnalyticsMetricsCollector {
    fn default() -> Self {
        Self::new()
    }
}

impl Default for AppMetrics {
    fn default() -> Self {
        Self {
            automations_count: 0,
            goals_count: 0,
            mcp_servers_count: 0,
            cache_hit_rate: 0.0,
            avg_goal_duration_ms: 0.0,
            active_sessions: 0,
            total_api_calls: 0,
            failed_operations: 0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_collect_system_metrics() {
        let mut collector = AnalyticsMetricsCollector::new();
        let metrics = collector.collect_system_metrics();

        assert!(metrics.cpu_usage >= 0.0);
        assert!(metrics.memory_total_mb > 0);
        assert!(metrics.memory_used_mb <= metrics.memory_total_mb);
    }

    #[test]
    fn test_app_metrics_increment() {
        let mut collector = AnalyticsMetricsCollector::new();

        collector.increment_automations_count();
        collector.increment_automations_count();

        let metrics = collector.collect_app_metrics();
        assert_eq!(metrics.automations_count, 2);

        collector.increment_goals_count();
        let metrics = collector.collect_app_metrics();
        assert_eq!(metrics.goals_count, 1);
    }

    #[test]
    fn test_app_metrics_setters() {
        let mut collector = AnalyticsMetricsCollector::new();

        collector.set_mcp_servers_count(5);
        collector.set_cache_hit_rate(0.85);
        collector.set_avg_goal_duration(5000.0);
        collector.set_active_sessions(3);

        let metrics = collector.collect_app_metrics();
        assert_eq!(metrics.mcp_servers_count, 5);
        assert_eq!(metrics.cache_hit_rate, 0.85);
        assert_eq!(metrics.avg_goal_duration_ms, 5000.0);
        assert_eq!(metrics.active_sessions, 3);
    }

    #[test]
    fn test_reset_app_metrics() {
        let mut collector = AnalyticsMetricsCollector::new();

        collector.increment_automations_count();
        collector.increment_goals_count();
        collector.set_mcp_servers_count(5);

        let metrics = collector.collect_app_metrics();
        assert_eq!(metrics.automations_count, 1);
        assert_eq!(metrics.goals_count, 1);
        assert_eq!(metrics.mcp_servers_count, 5);

        collector.reset_app_metrics();

        let metrics = collector.collect_app_metrics();
        assert_eq!(metrics.automations_count, 0);
        assert_eq!(metrics.goals_count, 0);
        assert_eq!(metrics.mcp_servers_count, 0);
    }
}
