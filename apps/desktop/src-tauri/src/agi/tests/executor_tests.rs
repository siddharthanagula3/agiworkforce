#[cfg(test)]
mod tests {
    use crate::agi::{ExecutionContext, Goal, Priority, ResourceState, ToolExecutionResult};
    use serde_json::json;
    use std::collections::HashMap;

    #[test]
    fn test_execution_context_creation() {
        let goal = Goal {
            id: "exec-goal-1".to_string(),
            description: "Test execution".to_string(),
            priority: Priority::High,
            deadline: None,
            constraints: vec![],
            success_criteria: vec![],
        };

        let context = ExecutionContext {
            goal: goal.clone(),
            current_state: HashMap::new(),
            available_resources: ResourceState {
                cpu_usage_percent: 50.0,
                memory_usage_mb: 1024,
                network_usage_mbps: 10.0,
                storage_usage_mb: 5000,
                available_tools: vec!["file_read".to_string(), "file_write".to_string()],
            },
            tool_results: vec![],
            context_memory: vec![],
        };

        assert_eq!(context.goal.id, "exec-goal-1");
        assert_eq!(context.tool_results.len(), 0);
        assert_eq!(context.available_resources.available_tools.len(), 2);
    }

    #[test]
    fn test_tool_execution_result_success() {
        let result = ToolExecutionResult {
            tool_id: "file_read".to_string(),
            success: true,
            result: json!({"content": "test content"}),
            error: None,
            execution_time_ms: 150,
            resources_used: crate::agi::ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 10,
                network_mb: 0.0,
            },
        };

        assert!(result.success);
        assert!(result.error.is_none());
        assert_eq!(result.tool_id, "file_read");
        assert_eq!(result.execution_time_ms, 150);
    }

    #[test]
    fn test_tool_execution_result_failure() {
        let result = ToolExecutionResult {
            tool_id: "invalid_tool".to_string(),
            success: false,
            result: json!({}),
            error: Some("Tool not found".to_string()),
            execution_time_ms: 10,
            resources_used: crate::agi::ResourceUsage {
                cpu_percent: 0.1,
                memory_mb: 1,
                network_mb: 0.0,
            },
        };

        assert!(!result.success);
        assert!(result.error.is_some());
        assert_eq!(result.error.unwrap(), "Tool not found");
    }

    #[test]
    fn test_execution_context_state_update() {
        let goal = Goal {
            id: "state-test".to_string(),
            description: "State update test".to_string(),
            priority: Priority::Medium,
            deadline: None,
            constraints: vec![],
            success_criteria: vec![],
        };

        let mut context = ExecutionContext {
            goal,
            current_state: HashMap::new(),
            available_resources: ResourceState {
                cpu_usage_percent: 30.0,
                memory_usage_mb: 512,
                network_usage_mbps: 5.0,
                storage_usage_mb: 2000,
                available_tools: vec![],
            },
            tool_results: vec![],
            context_memory: vec![],
        };

        context.current_state.insert("step_1".to_string(), json!({"status": "completed"}));
        context.current_state.insert("step_2".to_string(), json!({"status": "in_progress"}));

        assert_eq!(context.current_state.len(), 2);
        assert!(context.current_state.contains_key("step_1"));
        assert!(context.current_state.contains_key("step_2"));
    }

    #[test]
    fn test_resource_state_validation() {
        let resources = ResourceState {
            cpu_usage_percent: 75.5,
            memory_usage_mb: 2048,
            network_usage_mbps: 25.3,
            storage_usage_mb: 10240,
            available_tools: vec![
                "file_read".to_string(),
                "file_write".to_string(),
                "ui_click".to_string(),
            ],
        };

        assert!(resources.cpu_usage_percent < 100.0);
        assert!(resources.memory_usage_mb > 0);
        assert_eq!(resources.available_tools.len(), 3);
    }

    #[test]
    fn test_tool_results_accumulation() {
        let goal = Goal {
            id: "accumulation-test".to_string(),
            description: "Test result accumulation".to_string(),
            priority: Priority::Low,
            deadline: None,
            constraints: vec![],
            success_criteria: vec![],
        };

        let mut context = ExecutionContext {
            goal,
            current_state: HashMap::new(),
            available_resources: ResourceState {
                cpu_usage_percent: 20.0,
                memory_usage_mb: 256,
                network_usage_mbps: 2.0,
                storage_usage_mb: 1000,
                available_tools: vec![],
            },
            tool_results: vec![],
            context_memory: vec![],
        };

        // Add multiple tool results
        context.tool_results.push(ToolExecutionResult {
            tool_id: "step_1".to_string(),
            success: true,
            result: json!({"value": 42}),
            error: None,
            execution_time_ms: 100,
            resources_used: crate::agi::ResourceUsage {
                cpu_percent: 2.0,
                memory_mb: 5,
                network_mb: 0.0,
            },
        });

        context.tool_results.push(ToolExecutionResult {
            tool_id: "step_2".to_string(),
            success: true,
            result: json!({"value": 84}),
            error: None,
            execution_time_ms: 150,
            resources_used: crate::agi::ResourceUsage {
                cpu_percent: 3.0,
                memory_mb: 8,
                network_mb: 0.0,
            },
        });

        assert_eq!(context.tool_results.len(), 2);
        assert!(context.tool_results.iter().all(|r| r.success));
    }

    #[test]
    fn test_execution_result_serialization() {
        let result = ToolExecutionResult {
            tool_id: "test_tool".to_string(),
            success: true,
            result: json!({"output": "success"}),
            error: None,
            execution_time_ms: 200,
            resources_used: crate::agi::ResourceUsage {
                cpu_percent: 10.0,
                memory_mb: 20,
                network_mb: 1.5,
            },
        };

        let serialized = serde_json::to_string(&result).unwrap();
        let deserialized: ToolExecutionResult = serde_json::from_str(&serialized).unwrap();

        assert_eq!(result.tool_id, deserialized.tool_id);
        assert_eq!(result.success, deserialized.success);
        assert_eq!(result.execution_time_ms, deserialized.execution_time_ms);
    }

    #[test]
    fn test_context_memory_entry() {
        use crate::agi::ContextEntry;

        let entry = ContextEntry {
            timestamp: 1234567890,
            event: "tool_executed".to_string(),
            data: json!({"tool": "file_read", "status": "success"}),
        };

        assert_eq!(entry.event, "tool_executed");
        assert_eq!(entry.timestamp, 1234567890);
    }

    #[test]
    fn test_resource_usage_tracking() {
        let usage = crate::agi::ResourceUsage {
            cpu_percent: 15.5,
            memory_mb: 128,
            network_mb: 5.2,
        };

        assert!(usage.cpu_percent > 0.0);
        assert!(usage.memory_mb > 0);
        assert!(usage.network_mb > 0.0);
    }

    #[test]
    fn test_multiple_tool_results_filtering() {
        let results = vec![
            ToolExecutionResult {
                tool_id: "tool_1".to_string(),
                success: true,
                result: json!({}),
                error: None,
                execution_time_ms: 100,
                resources_used: crate::agi::ResourceUsage {
                    cpu_percent: 5.0,
                    memory_mb: 10,
                    network_mb: 0.0,
                },
            },
            ToolExecutionResult {
                tool_id: "tool_2".to_string(),
                success: false,
                result: json!({}),
                error: Some("Failed".to_string()),
                execution_time_ms: 50,
                resources_used: crate::agi::ResourceUsage {
                    cpu_percent: 2.0,
                    memory_mb: 5,
                    network_mb: 0.0,
                },
            },
            ToolExecutionResult {
                tool_id: "tool_3".to_string(),
                success: true,
                result: json!({}),
                error: None,
                execution_time_ms: 150,
                resources_used: crate::agi::ResourceUsage {
                    cpu_percent: 8.0,
                    memory_mb: 15,
                    network_mb: 0.0,
                },
            },
        ];

        let successful: Vec<_> = results.iter().filter(|r| r.success).collect();
        let failed: Vec<_> = results.iter().filter(|r| !r.success).collect();

        assert_eq!(successful.len(), 2);
        assert_eq!(failed.len(), 1);
    }
}
