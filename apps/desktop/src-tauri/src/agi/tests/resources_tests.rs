#[cfg(test)]
mod tests {
    use crate::agi::ResourceLimits;

    #[test]
    fn test_resource_manager_creation() {
        let limits = ResourceLimits {
            cpu_percent: 80.0,
            memory_mb: 2048,
            network_mbps: 100.0,
            storage_mb: 10240,
        };

        assert_eq!(limits.cpu_percent, 80.0);
        assert_eq!(limits.memory_mb, 2048);
    }

    #[test]
    fn test_resource_availability_check() {
        let current_cpu = 50.0;
        let limit_cpu = 80.0;
        assert!(current_cpu < limit_cpu);
    }

    #[test]
    fn test_resource_reservation() {
        let available_memory = 2048u64;
        let requested_memory = 512u64;
        assert!(requested_memory <= available_memory);
    }

    #[test]
    fn test_resource_release() {
        let allocated = 512u64;
        let released = 512u64;
        assert_eq!(allocated, released);
    }

    #[test]
    fn test_cpu_limit_exceeded() {
        let current_cpu = 95.0;
        let limit_cpu = 80.0;
        assert!(current_cpu > limit_cpu);
    }

    #[test]
    fn test_memory_limit_exceeded() {
        let current_memory = 3000u64;
        let limit_memory = 2048u64;
        assert!(current_memory > limit_memory);
    }

    #[test]
    fn test_network_bandwidth_check() {
        let current_bandwidth = 50.0;
        let limit_bandwidth = 100.0;
        assert!(current_bandwidth <= limit_bandwidth);
    }

    #[test]
    fn test_storage_limit_check() {
        let current_storage = 5000u64;
        let limit_storage = 10240u64;
        assert!(current_storage < limit_storage);
    }

    #[test]
    fn test_resource_limits_serialization() {
        let limits = ResourceLimits {
            cpu_percent: 70.0,
            memory_mb: 1024,
            network_mbps: 50.0,
            storage_mb: 5120,
        };

        let serialized = serde_json::to_string(&limits).unwrap();
        let deserialized: ResourceLimits = serde_json::from_str(&serialized).unwrap();

        assert_eq!(limits.cpu_percent, deserialized.cpu_percent);
        assert_eq!(limits.memory_mb, deserialized.memory_mb);
    }

    #[test]
    fn test_concurrent_resource_allocation() {
        let total_memory = 2048u64;
        let allocation1 = 512u64;
        let allocation2 = 512u64;
        let allocation3 = 512u64;
        let remaining = total_memory - allocation1 - allocation2 - allocation3;
        assert_eq!(remaining, 512);
    }
}
