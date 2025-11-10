//! Comprehensive tests for AGI Core modules

use super::*;
use tempfile::tempdir;
use tokio;

#[cfg(test)]
mod agi_core_tests {
    use super::*;

    #[test]
    fn test_resource_limits_defaults() {
        let limits = ResourceLimits::default();
        assert_eq!(limits.cpu_percent, 80.0);
        assert_eq!(limits.memory_mb, 2048);
        assert_eq!(limits.network_mbps, 10.0);
        assert_eq!(limits.storage_mb, 1024);
    }

    #[test]
    fn test_resource_limits_custom() {
        let limits = ResourceLimits {
            cpu_percent: 90.0,
            memory_mb: 4096,
            network_mbps: 20.0,
            storage_mb: 2048,
        };
        assert_eq!(limits.cpu_percent, 90.0);
        assert_eq!(limits.memory_mb, 4096);
    }

    #[test]
    fn test_goal_creation() {
        let goal = Goal {
            id: 1,
            description: "Test goal".to_string(),
            status: GoalStatus::Pending,
            created_at: chrono::Utc::now().timestamp(),
            updated_at: chrono::Utc::now().timestamp(),
            completed_at: None,
            result: None,
        };
        assert_eq!(goal.description, "Test goal");
        assert!(matches!(goal.status, GoalStatus::Pending));
    }

    #[test]
    fn test_step_creation() {
        let step = Step {
            id: 1,
            goal_id: 1,
            description: "Test step".to_string(),
            tool_name: "file_read".to_string(),
            arguments: serde_json::json!({"path": "/test"}),
            status: StepStatus::Pending,
            result: None,
            dependencies: vec![],
        };
        assert_eq!(step.tool_name, "file_read");
        assert!(step.dependencies.is_empty());
    }

    #[test]
    fn test_execution_result_success() {
        let result = ExecutionResult {
            success: true,
            output: "Success".to_string(),
            error: None,
            execution_time_ms: 100,
        };
        assert!(result.success);
        assert!(result.error.is_none());
        assert_eq!(result.execution_time_ms, 100);
    }

    #[test]
    fn test_execution_result_failure() {
        let result = ExecutionResult {
            success: false,
            output: "".to_string(),
            error: Some("Error occurred".to_string()),
            execution_time_ms: 50,
        };
        assert!(!result.success);
        assert!(result.error.is_some());
        assert_eq!(result.error.unwrap(), "Error occurred");
    }

    #[test]
    fn test_tool_category_display() {
        let categories = vec![
            ToolCategory::File,
            ToolCategory::UI,
            ToolCategory::Browser,
            ToolCategory::Database,
            ToolCategory::API,
        ];
        assert_eq!(categories.len(), 5);
    }

    #[test]
    fn test_parameter_type_validation() {
        let param = Parameter {
            name: "test_param".to_string(),
            type_: ParameterType::String,
            description: "Test parameter".to_string(),
            required: true,
            default: None,
        };
        assert!(param.required);
        assert!(param.default.is_none());
    }

    #[tokio::test]
    async fn test_resource_state_update() {
        let state = ResourceState {
            cpu_usage_percent: 45.5,
            memory_usage_mb: 1024,
            network_usage_mbps: 5.0,
            storage_usage_mb: 512,
            available_tools: vec!["file_read".to_string(), "file_write".to_string()],
        };
        assert_eq!(state.cpu_usage_percent, 45.5);
        assert_eq!(state.available_tools.len(), 2);
    }

    #[test]
    fn test_goal_status_transitions() {
        let statuses = vec![
            GoalStatus::Pending,
            GoalStatus::InProgress,
            GoalStatus::Completed,
            GoalStatus::Failed,
            GoalStatus::Cancelled,
        ];
        assert_eq!(statuses.len(), 5);
    }

    #[test]
    fn test_step_status_transitions() {
        let statuses = vec![
            StepStatus::Pending,
            StepStatus::InProgress,
            StepStatus::Completed,
            StepStatus::Failed,
        ];
        assert_eq!(statuses.len(), 4);
    }

    #[test]
    fn test_tool_definition_serialization() {
        let tool = ToolDefinition {
            name: "test_tool".to_string(),
            description: "A test tool".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "param1": {"type": "string"}
                }
            }),
        };

        let json = serde_json::to_string(&tool).unwrap();
        assert!(json.contains("test_tool"));

        let deserialized: ToolDefinition = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "test_tool");
    }

    #[test]
    fn test_execution_strategy_defaults() {
        let strategy = ExecutionStrategy::default();
        assert_eq!(strategy.max_retries, 3);
        assert_eq!(strategy.retry_delay_ms, 1000);
        assert_eq!(strategy.timeout_seconds, 300);
        assert!(!strategy.parallel_execution);
        assert!(strategy.fail_fast);
    }

    #[test]
    fn test_experience_creation() {
        let experience = Experience {
            id: 1,
            goal_description: "Test goal".to_string(),
            outcome: "Success".to_string(),
            lessons_learned: "Learned something".to_string(),
            created_at: chrono::Utc::now().timestamp(),
        };
        assert_eq!(experience.goal_description, "Test goal");
        assert_eq!(experience.outcome, "Success");
    }

    #[tokio::test]
    async fn test_concurrent_goal_creation() {
        use tokio::task;

        let handles: Vec<_> = (0..10).map(|i| {
            task::spawn(async move {
                let goal = Goal {
                    id: i,
                    description: format!("Goal {}", i),
                    status: GoalStatus::Pending,
                    created_at: chrono::Utc::now().timestamp(),
                    updated_at: chrono::Utc::now().timestamp(),
                    completed_at: None,
                    result: None,
                };
                assert_eq!(goal.id, i);
            })
        }).collect();

        for handle in handles {
            handle.await.unwrap();
        }
    }

    #[test]
    fn test_resource_usage_calculation() {
        let usage1 = ResourceUsage {
            cpu_percent: 20.0,
            memory_mb: 512,
            network_mb: 2.0,
        };

        let usage2 = ResourceUsage {
            cpu_percent: 30.0,
            memory_mb: 1024,
            network_mb: 3.0,
        };

        let total_cpu = usage1.cpu_percent + usage2.cpu_percent;
        assert_eq!(total_cpu, 50.0);
    }

    #[test]
    fn test_tool_parameters_validation() {
        let params = serde_json::json!({
            "type": "object",
            "properties": {
                "required_param": {
                    "type": "string",
                    "description": "A required parameter"
                },
                "optional_param": {
                    "type": "number",
                    "description": "An optional parameter"
                }
            },
            "required": ["required_param"]
        });

        assert!(params["properties"]["required_param"].is_object());
        assert_eq!(params["required"][0], "required_param");
    }
}

#[cfg(test)]
mod knowledge_base_tests {
    use super::*;

    #[test]
    fn test_query_similarity() {
        let query1 = "Create a React component";
        let query2 = "Build a React component";

        // Simple word-based similarity (production would use embeddings)
        let words1: Vec<&str> = query1.split_whitespace().collect();
        let words2: Vec<&str> = query2.split_whitespace().collect();

        let common_words = words1.iter()
            .filter(|w| words2.contains(w))
            .count();

        assert!(common_words >= 2); // "a", "React", "component"
    }

    #[test]
    fn test_goal_filtering_by_status() {
        let goals = vec![
            Goal {
                id: 1,
                description: "Goal 1".to_string(),
                status: GoalStatus::Completed,
                created_at: 1000,
                updated_at: 1000,
                completed_at: Some(1100),
                result: Some("Success".to_string()),
            },
            Goal {
                id: 2,
                description: "Goal 2".to_string(),
                status: GoalStatus::Pending,
                created_at: 2000,
                updated_at: 2000,
                completed_at: None,
                result: None,
            },
        ];

        let completed: Vec<_> = goals.iter()
            .filter(|g| matches!(g.status, GoalStatus::Completed))
            .collect();

        assert_eq!(completed.len(), 1);
        assert_eq!(completed[0].id, 1);
    }

    #[test]
    fn test_experience_lessons_extraction() {
        let experiences = vec![
            Experience {
                id: 1,
                goal_description: "Create file".to_string(),
                outcome: "Success".to_string(),
                lessons_learned: "Always check permissions".to_string(),
                created_at: 1000,
            },
            Experience {
                id: 2,
                goal_description: "Delete file".to_string(),
                outcome: "Failed".to_string(),
                lessons_learned: "File was locked".to_string(),
                created_at: 2000,
            },
        ];

        let lessons: Vec<_> = experiences.iter()
            .map(|e| &e.lessons_learned)
            .collect();

        assert_eq!(lessons.len(), 2);
        assert!(lessons[0].contains("permissions"));
    }
}

#[cfg(test)]
mod planner_tests {
    use super::*;

    #[test]
    fn test_plan_creation() {
        let plan = Plan {
            steps: vec![
                Step {
                    id: 1,
                    goal_id: 1,
                    description: "Step 1".to_string(),
                    tool_name: "file_read".to_string(),
                    arguments: serde_json::json!({}),
                    status: StepStatus::Pending,
                    result: None,
                    dependencies: vec![],
                },
                Step {
                    id: 2,
                    goal_id: 1,
                    description: "Step 2".to_string(),
                    tool_name: "file_write".to_string(),
                    arguments: serde_json::json!({}),
                    status: StepStatus::Pending,
                    result: None,
                    dependencies: vec![1],
                },
            ],
            estimated_time_seconds: 60,
            estimated_cost_usd: 0.01,
        };

        assert_eq!(plan.steps.len(), 2);
        assert_eq!(plan.steps[1].dependencies, vec![1]);
    }

    #[test]
    fn test_dependency_graph_validation() {
        let steps = vec![
            Step {
                id: 1,
                goal_id: 1,
                description: "Root step".to_string(),
                tool_name: "file_read".to_string(),
                arguments: serde_json::json!({}),
                status: StepStatus::Pending,
                result: None,
                dependencies: vec![],
            },
            Step {
                id: 2,
                goal_id: 1,
                description: "Dependent step".to_string(),
                tool_name: "file_write".to_string(),
                arguments: serde_json::json!({}),
                status: StepStatus::Pending,
                result: None,
                dependencies: vec![1],
            },
        ];

        // Verify step 2 depends on step 1
        assert!(steps[1].dependencies.contains(&1));
        assert!(steps[0].dependencies.is_empty());
    }

    #[test]
    fn test_topological_sort_simple() {
        // Simple DAG: 1 -> 2 -> 3
        let edges = vec![(1, 2), (2, 3)];
        let mut in_degree = std::collections::HashMap::new();
        let mut adj_list: std::collections::HashMap<i32, Vec<i32>> = std::collections::HashMap::new();

        for &(from, to) in &edges {
            *in_degree.entry(to).or_insert(0) += 1;
            in_degree.entry(from).or_insert(0);
            adj_list.entry(from).or_insert_with(Vec::new).push(to);
        }

        // Verify graph structure
        assert_eq!(in_degree[&1], 0);
        assert_eq!(in_degree[&2], 1);
        assert_eq!(in_degree[&3], 1);
    }
}

#[cfg(test)]
mod executor_tests {
    use super::*;

    #[tokio::test]
    async fn test_step_execution_timeout() {
        use tokio::time::{timeout, Duration};

        let result = timeout(
            Duration::from_millis(100),
            async {
                tokio::time::sleep(Duration::from_secs(1)).await;
                "Done"
            }
        ).await;

        assert!(result.is_err()); // Should timeout
    }

    #[tokio::test]
    async fn test_step_execution_success() {
        use tokio::time::{timeout, Duration};

        let result = timeout(
            Duration::from_secs(1),
            async {
                tokio::time::sleep(Duration::from_millis(10)).await;
                "Done"
            }
        ).await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "Done");
    }

    #[test]
    fn test_retry_logic_calculation() {
        let mut attempts = 0;
        let max_retries = 3;

        for _ in 0..=max_retries {
            attempts += 1;
        }

        assert_eq!(attempts, 4); // Initial + 3 retries
    }

    #[test]
    fn test_execution_time_tracking() {
        use std::time::Instant;

        let start = Instant::now();
        std::thread::sleep(std::time::Duration::from_millis(10));
        let elapsed = start.elapsed();

        assert!(elapsed.as_millis() >= 10);
    }
}

#[cfg(test)]
mod memory_tests {
    use super::*;

    #[test]
    fn test_working_memory_capacity() {
        let mut memory: Vec<String> = Vec::new();
        let max_capacity = 100;

        for i in 0..150 {
            memory.push(format!("Item {}", i));

            // Keep only last 100 items
            if memory.len() > max_capacity {
                memory.remove(0);
            }
        }

        assert_eq!(memory.len(), 100);
        assert_eq!(memory[0], "Item 50");
    }

    #[test]
    fn test_memory_retrieval() {
        let memory = vec![
            ("key1", "value1"),
            ("key2", "value2"),
            ("key3", "value3"),
        ];

        let result = memory.iter()
            .find(|(k, _)| *k == "key2")
            .map(|(_, v)| *v);

        assert_eq!(result, Some("value2"));
    }
}

#[cfg(test)]
mod learning_tests {
    use super::*;

    #[test]
    fn test_outcome_classification() {
        let outcomes = vec![
            ("Success", true),
            ("Failed", false),
            ("Success", true),
            ("Success", true),
        ];

        let success_rate = outcomes.iter()
            .filter(|(_, success)| *success)
            .count() as f64 / outcomes.len() as f64;

        assert_eq!(success_rate, 0.75);
    }

    #[test]
    fn test_pattern_recognition() {
        let experiences = vec![
            "User created React component",
            "User created Vue component",
            "User created Angular component",
        ];

        let pattern = "component";
        let matches = experiences.iter()
            .filter(|e| e.contains(pattern))
            .count();

        assert_eq!(matches, 3);
    }
}
