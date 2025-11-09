#[cfg(test)]
mod tests {
    use crate::agi::{AGICapabilities, AGIConfig, Goal, Priority, ResourceLimits};

    #[test]
    fn test_agi_config_default() {
        let config = AGIConfig::default();
        assert_eq!(config.max_concurrent_tools, 10);
        assert_eq!(config.knowledge_memory_mb, 1024);
        assert!(config.enable_learning);
        assert!(config.enable_self_improvement);
        assert_eq!(config.max_planning_depth, 20);
        assert!(config.enable_multimodal);
    }

    #[test]
    fn test_agi_config_custom() {
        let config = AGIConfig {
            max_concurrent_tools: 5,
            knowledge_memory_mb: 512,
            enable_learning: false,
            enable_self_improvement: false,
            resource_limits: ResourceLimits {
                cpu_percent: 50.0,
                memory_mb: 1024,
                network_mbps: 50.0,
                storage_mb: 5120,
            },
            max_planning_depth: 10,
            enable_multimodal: false,
        };

        assert_eq!(config.max_concurrent_tools, 5);
        assert_eq!(config.knowledge_memory_mb, 512);
        assert!(!config.enable_learning);
        assert!(!config.enable_self_improvement);
        assert_eq!(config.resource_limits.cpu_percent, 50.0);
        assert_eq!(config.max_planning_depth, 10);
        assert!(!config.enable_multimodal);
    }

    #[test]
    fn test_resource_limits_validation() {
        let limits = ResourceLimits {
            cpu_percent: 100.0,
            memory_mb: 4096,
            network_mbps: 200.0,
            storage_mb: 20480,
        };

        assert!(limits.cpu_percent <= 100.0);
        assert!(limits.memory_mb > 0);
        assert!(limits.network_mbps > 0.0);
        assert!(limits.storage_mb > 0);
    }

    #[test]
    fn test_agi_capabilities_default() {
        let capabilities = AGICapabilities::default();

        assert!(capabilities.can_read_files);
        assert!(capabilities.can_write_files);
        assert!(capabilities.can_execute_code);
        assert!(capabilities.can_automate_ui);
        assert!(capabilities.can_use_browser);
        assert!(capabilities.can_access_databases);
        assert!(capabilities.can_make_api_calls);
        assert!(capabilities.can_process_images);
        assert!(!capabilities.can_process_audio); // Not implemented yet
        assert!(capabilities.can_understand_code);
        assert!(capabilities.can_learn_from_experience);
        assert!(capabilities.can_plan_complex_tasks);
        assert!(capabilities.can_adapt_strategies);
    }

    #[test]
    fn test_goal_creation() {
        let goal = Goal {
            id: "test-goal-1".to_string(),
            description: "Test automation goal".to_string(),
            priority: Priority::High,
            deadline: Some(1234567890),
            constraints: vec![],
            success_criteria: vec!["Task completed".to_string()],
        };

        assert_eq!(goal.id, "test-goal-1");
        assert_eq!(goal.description, "Test automation goal");
        assert_eq!(goal.priority, Priority::High);
        assert_eq!(goal.deadline, Some(1234567890));
        assert_eq!(goal.success_criteria.len(), 1);
    }

    #[test]
    fn test_priority_ordering() {
        let low = Priority::Low;
        let medium = Priority::Medium;
        let high = Priority::High;
        let critical = Priority::Critical;

        assert!(low < medium);
        assert!(medium < high);
        assert!(high < critical);
        assert!(low < critical);
    }

    #[test]
    fn test_priority_values() {
        assert_eq!(Priority::Low as i32, 1);
        assert_eq!(Priority::Medium as i32, 2);
        assert_eq!(Priority::High as i32, 3);
        assert_eq!(Priority::Critical as i32, 4);
    }

    #[test]
    fn test_goal_serialization() {
        let goal = Goal {
            id: "test-goal-2".to_string(),
            description: "Serialization test".to_string(),
            priority: Priority::Medium,
            deadline: None,
            constraints: vec![],
            success_criteria: vec!["Success".to_string()],
        };

        let serialized = serde_json::to_string(&goal).unwrap();
        let deserialized: Goal = serde_json::from_str(&serialized).unwrap();

        assert_eq!(goal.id, deserialized.id);
        assert_eq!(goal.description, deserialized.description);
        assert_eq!(goal.priority, deserialized.priority);
    }

    #[test]
    fn test_config_serialization() {
        let config = AGIConfig::default();
        let serialized = serde_json::to_string(&config).unwrap();
        let deserialized: AGIConfig = serde_json::from_str(&serialized).unwrap();

        assert_eq!(
            config.max_concurrent_tools,
            deserialized.max_concurrent_tools
        );
        assert_eq!(config.knowledge_memory_mb, deserialized.knowledge_memory_mb);
        assert_eq!(config.enable_learning, deserialized.enable_learning);
    }

    #[test]
    fn test_capabilities_serialization() {
        let capabilities = AGICapabilities::default();
        let serialized = serde_json::to_string(&capabilities).unwrap();
        let deserialized: AGICapabilities = serde_json::from_str(&serialized).unwrap();

        assert_eq!(capabilities.can_read_files, deserialized.can_read_files);
        assert_eq!(capabilities.can_use_browser, deserialized.can_use_browser);
        assert_eq!(
            capabilities.can_process_audio,
            deserialized.can_process_audio
        );
    }

    #[test]
    fn test_resource_limits_extreme_values() {
        let limits = ResourceLimits {
            cpu_percent: 0.1,
            memory_mb: 128,
            network_mbps: 1.0,
            storage_mb: 100,
        };

        assert!(limits.cpu_percent > 0.0);
        assert!(limits.memory_mb >= 128);
    }

    #[test]
    fn test_multiple_goals_priority_sorting() {
        let mut goals = vec![
            Goal {
                id: "1".to_string(),
                description: "Low priority".to_string(),
                priority: Priority::Low,
                deadline: None,
                constraints: vec![],
                success_criteria: vec![],
            },
            Goal {
                id: "2".to_string(),
                description: "Critical priority".to_string(),
                priority: Priority::Critical,
                deadline: None,
                constraints: vec![],
                success_criteria: vec![],
            },
            Goal {
                id: "3".to_string(),
                description: "High priority".to_string(),
                priority: Priority::High,
                deadline: None,
                constraints: vec![],
                success_criteria: vec![],
            },
        ];

        goals.sort_by(|a, b| b.priority.cmp(&a.priority));

        assert_eq!(goals[0].priority, Priority::Critical);
        assert_eq!(goals[1].priority, Priority::High);
        assert_eq!(goals[2].priority, Priority::Low);
    }
}
