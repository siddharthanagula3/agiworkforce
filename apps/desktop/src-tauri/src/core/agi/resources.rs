use super::*;
use anyhow::Result;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use sysinfo::System;

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

    pub async fn get_state(&self) -> Result<ResourceState> {
        self.update_usage().await?;
        let usage = self
            .current_usage
            .lock()
            .map_err(|e| anyhow::anyhow!("Resource state lock poisoned: {}", e))?;
        Ok(usage.clone())
    }

    pub async fn check_availability(&self) -> Result<bool> {
        self.update_usage().await?;
        let usage = self
            .current_usage
            .lock()
            .map_err(|e| anyhow::anyhow!("Resource state lock poisoned: {}", e))?;

        Ok(usage.cpu_usage_percent < self.limits.cpu_percent
            && usage.memory_usage_mb < self.limits.memory_mb
            && usage.network_usage_mbps < self.limits.network_mbps
            && usage.storage_usage_mb < self.limits.storage_mb)
    }

    pub async fn reserve_resources(&self, resources: &ResourceUsage) -> Result<bool> {
        let mut usage = self
            .current_usage
            .lock()
            .map_err(|e| anyhow::anyhow!("Resource state lock poisoned: {}", e))?;
        self.update_usage_internal(&mut usage)?;

        let can_reserve = (usage.cpu_usage_percent + resources.cpu_percent)
            <= self.limits.cpu_percent
            && (usage.memory_usage_mb + resources.memory_mb) <= self.limits.memory_mb
            && (usage.network_usage_mbps + resources.network_mb) <= self.limits.network_mbps;

        if can_reserve {
            let mut reservations = self
                .reservations
                .lock()
                .map_err(|e| anyhow::anyhow!("Resource reservations lock poisoned: {}", e))?;

            // Create a unique ID for this reservation
            let reservation_id = uuid::Uuid::new_v4().to_string();
            reservations.insert(reservation_id, resources.clone());

            // Update current usage immediately to reflect reservation
            usage.cpu_usage_percent += resources.cpu_percent;
            usage.memory_usage_mb += resources.memory_mb;
            usage.network_usage_mbps += resources.network_mb;
        }

        Ok(can_reserve)
    }

    pub async fn release_resources(&self, resources: &ResourceUsage) -> Result<()> {
        let mut usage = self
            .current_usage
            .lock()
            .map_err(|e| anyhow::anyhow!("Resource state lock poisoned: {}", e))?;

        // We're just decrementing usage here, but in a real system we'd remove by ID
        // For now, this matches the simplistic implementation in reserve_resources
        usage.cpu_usage_percent = (usage.cpu_usage_percent - resources.cpu_percent).max(0.0);
        usage.memory_usage_mb = usage.memory_usage_mb.saturating_sub(resources.memory_mb);
        usage.network_usage_mbps = (usage.network_usage_mbps - resources.network_mb).max(0.0);
        Ok(())
    }

    async fn update_usage(&self) -> Result<()> {
        let mut usage = self
            .current_usage
            .lock()
            .map_err(|e| anyhow::anyhow!("Resource state lock poisoned: {}", e))?;
        self.update_usage_internal(&mut usage)
    }

    fn update_usage_internal(&self, usage: &mut ResourceState) -> Result<()> {
        let mut system = self
            .system
            .lock()
            .map_err(|e| anyhow::anyhow!("System monitor lock poisoned: {}", e))?;
        system.refresh_cpu();
        system.refresh_memory();

        let cpu_usage = system.global_cpu_info().cpu_usage() as f64;
        let reservations = self
            .reservations
            .lock()
            .map_err(|e| anyhow::anyhow!("Resource reservations lock poisoned: {}", e))?;
        let reserved_cpu: f64 = reservations.values().map(|r| r.cpu_percent).sum();
        usage.cpu_usage_percent = cpu_usage + reserved_cpu;

        let current_pid = std::process::id();
        let process_memory_mb = system
            .process(sysinfo::Pid::from(current_pid as usize))
            .map(|p| p.memory() / 1024 / 1024)
            .unwrap_or(0);
        let reserved_memory: u64 = reservations.values().map(|r| r.memory_mb).sum();
        usage.memory_usage_mb = process_memory_mb + reserved_memory;

        let reserved_network: f64 = reservations.values().map(|r| r.network_mb).sum();
        usage.network_usage_mbps = reserved_network;

        usage.storage_usage_mb = 0;

        Ok(())
    }
}
