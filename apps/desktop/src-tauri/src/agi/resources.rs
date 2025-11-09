use super::*;
use anyhow::Result;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use sysinfo::System;

/// Resource Manager - monitors and manages system resources
pub struct ResourceManager {
    limits: ResourceLimits,
    current_usage: Arc<Mutex<ResourceState>>,
    reservations: Arc<Mutex<HashMap<String, ResourceUsage>>>,
    _last_update: Arc<Mutex<Instant>>,
    system: Arc<Mutex<System>>,
}

impl ResourceManager {
    pub fn new(limits: ResourceLimits) -> Result<Self> {
        let mut system = System::new_all();
        system.refresh_all();

        Ok(Self {
            limits,
            current_usage: Arc::new(Mutex::new(ResourceState {
                cpu_usage_percent: 0.0,
                memory_usage_mb: 0,
                network_usage_mbps: 0.0,
                storage_usage_mb: 0,
                available_tools: vec![],
            })),
            reservations: Arc::new(Mutex::new(HashMap::new())),
            _last_update: Arc::new(Mutex::new(Instant::now())),
            system: Arc::new(Mutex::new(system)),
        })
    }

    /// Get current resource state
    pub async fn get_state(&self) -> Result<ResourceState> {
        self.update_usage().await?;
        Ok(self.current_usage.lock().unwrap().clone())
    }

    /// Check if resources are available
    pub async fn check_availability(&self) -> Result<bool> {
        self.update_usage().await?;
        let usage = self.current_usage.lock().unwrap();

        Ok(usage.cpu_usage_percent < self.limits.cpu_percent
            && usage.memory_usage_mb < self.limits.memory_mb
            && usage.network_usage_mbps < self.limits.network_mbps
            && usage.storage_usage_mb < self.limits.storage_mb)
    }

    /// Reserve resources for a task
    pub async fn reserve_resources(&self, resources: &ResourceUsage) -> Result<bool> {
        let mut usage = self.current_usage.lock().unwrap();
        self.update_usage_internal(&mut usage)?;

        // Check if we can reserve
        let can_reserve = (usage.cpu_usage_percent + resources.cpu_percent)
            <= self.limits.cpu_percent
            && (usage.memory_usage_mb + resources.memory_mb) <= self.limits.memory_mb
            && (usage.network_usage_mbps + resources.network_mb) <= self.limits.network_mbps;

        if can_reserve {
            usage.cpu_usage_percent += resources.cpu_percent;
            usage.memory_usage_mb += resources.memory_mb;
            usage.network_usage_mbps += resources.network_mb;
        }

        Ok(can_reserve)
    }

    /// Release reserved resources
    pub async fn release_resources(&self, resources: &ResourceUsage) -> Result<()> {
        let mut usage = self.current_usage.lock().unwrap();
        usage.cpu_usage_percent = (usage.cpu_usage_percent - resources.cpu_percent).max(0.0);
        usage.memory_usage_mb = usage.memory_usage_mb.saturating_sub(resources.memory_mb);
        usage.network_usage_mbps = (usage.network_usage_mbps - resources.network_mb).max(0.0);
        Ok(())
    }

    /// Update resource usage (called periodically)
    async fn update_usage(&self) -> Result<()> {
        let mut usage = self.current_usage.lock().unwrap();
        self.update_usage_internal(&mut usage)
    }

    fn update_usage_internal(&self, usage: &mut ResourceState) -> Result<()> {
        let mut system = self.system.lock().unwrap();
        system.refresh_cpu();
        system.refresh_memory();

        // Update CPU usage using sysinfo
        let cpu_usage = system.global_cpu_info().cpu_usage() as f64;
        let reservations = self.reservations.lock().unwrap();
        let reserved_cpu: f64 = reservations.values().map(|r| r.cpu_percent).sum();
        usage.cpu_usage_percent = cpu_usage + reserved_cpu;

        // Update memory usage - get current process memory + reservations
        let current_pid = std::process::id();
        let process_memory_mb = system
            .process(sysinfo::Pid::from(current_pid as usize))
            .map(|p| p.memory() / 1024 / 1024) // Convert bytes to MB
            .unwrap_or(0);
        let reserved_memory: u64 = reservations.values().map(|r| r.memory_mb).sum();
        usage.memory_usage_mb = process_memory_mb + reserved_memory;

        // Network usage tracking (simplified - would need network monitoring library)
        // For now, track based on reservations
        let reserved_network: f64 = reservations.values().map(|r| r.network_mb).sum();
        usage.network_usage_mbps = reserved_network;

        // Storage usage - get disk usage for app data directory
        // Simplified: track based on reservations for now
        // Note: ResourceUsage doesn't have storage_mb, so we track it separately
        usage.storage_usage_mb = 0; // Will be tracked separately if needed

        Ok(())
    }

    #[allow(dead_code)]
    fn estimate_cpu_usage(&self) -> f64 {
        // This is now handled in update_usage_internal
        let reservations = self.reservations.lock().unwrap();
        reservations.values().map(|r| r.cpu_percent).sum()
    }

    #[allow(dead_code)]
    fn estimate_memory_usage(&self) -> u64 {
        // This is now handled in update_usage_internal
        let reservations = self.reservations.lock().unwrap();
        reservations.values().map(|r| r.memory_mb).sum()
    }
}
