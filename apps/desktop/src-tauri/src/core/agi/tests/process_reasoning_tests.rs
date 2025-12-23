#[cfg(test)]
mod tests {
    use crate::core::agi::process_reasoning::{Outcome, ProcessReasoning, ProcessType, Strategy};
    use crate::core::agi::{
        ExecutionContext, Goal, Priority, ResourceState, ResourceUsage, ToolExecutionResult,
    };
    use crate::core::router::LLMRouter;
    use std::collections::HashMap;
    use std::sync::Arc;

    fn create_execution_context(tool_results: Vec<ToolExecutionResult>) -> ExecutionContext {
        ExecutionContext {
            goal: Goal {
                id: "goal_1".to_string(),
                description: "Run tests".to_string(),
                priority: Priority::High,
                deadline: None,
                constraints: Vec::new(),
                success_criteria: vec!["All tests pass".to_string()],
            },
            current_state: HashMap::new(),
            available_resources: ResourceState {
                cpu_usage_percent: 10.0,
                memory_usage_mb: 512,
                network_usage_mbps: 0.0,
                storage_usage_mb: 1024,
                available_tools: vec!["code_execute".to_string()],
            },
            tool_results,
            context_memory: Vec::new(),
        }
    }

    #[test]
    fn test_process_type_string_roundtrip() {
        let pt = ProcessType::Testing;
        assert_eq!(ProcessType::from_str(pt.as_str()), Some(pt));
        assert_eq!(ProcessType::from_str("unknown_process"), None);
    }

    #[test]
    fn test_outcome_roundtrip_serialization() {
        let outcome = Outcome {
            id: "outcome_1".to_string(),
            process_type: ProcessType::Testing,
            metric_name: "data_accuracy".to_string(),
            target_value: 1.0,
            actual_value: Some(0.95),
            achieved: true,
            unit: "score".to_string(),
        };

        let serialized = serde_json::to_string(&outcome).unwrap();
        let deserialized: Outcome = serde_json::from_str(&serialized).unwrap();

        assert_eq!(outcome.id, deserialized.id);
        assert_eq!(outcome.process_type, deserialized.process_type);
        assert_eq!(outcome.metric_name, deserialized.metric_name);
        assert_eq!(outcome.target_value, deserialized.target_value);
        assert_eq!(outcome.actual_value, deserialized.actual_value);
        assert_eq!(outcome.achieved, deserialized.achieved);
        assert_eq!(outcome.unit, deserialized.unit);
    }

    #[test]
    fn test_strategy_roundtrip_serialization() {
        let strategy = Strategy {
            id: "strategy_1".to_string(),
            name: "Test Strategy".to_string(),
            description: "A test strategy".to_string(),
            process_type: ProcessType::Testing,
            priority_tools: vec!["code_execute".to_string()],
            estimated_success_rate: 0.9,
            estimated_duration_ms: 30_000,
            resource_requirements: ResourceUsage {
                cpu_percent: 20.0,
                memory_mb: 256,
                network_mb: 0.0,
            },
        };

        let serialized = serde_json::to_string(&strategy).unwrap();
        let deserialized: Strategy = serde_json::from_str(&serialized).unwrap();

        assert_eq!(strategy.id, deserialized.id);
        assert_eq!(strategy.process_type, deserialized.process_type);
        assert_eq!(strategy.priority_tools, deserialized.priority_tools);
        assert_eq!(
            strategy.estimated_duration_ms,
            deserialized.estimated_duration_ms
        );
    }

    #[tokio::test]
    async fn test_select_optimal_strategy_includes_typical_tools() {
        let router = Arc::new(tokio::sync::Mutex::new(LLMRouter::new()));
        let reasoning = ProcessReasoning::new(router).unwrap();

        let context = create_execution_context(Vec::new());
        let strategy = reasoning.select_optimal_strategy(ProcessType::Testing, &context);

        assert_eq!(strategy.id, "strategy_testing_default");
        assert!(strategy
            .priority_tools
            .contains(&"code_execute".to_string()));
    }

    #[tokio::test]
    async fn test_evaluate_outcome_uses_tool_success_rate_for_accuracy_metrics() {
        let router = Arc::new(tokio::sync::Mutex::new(LLMRouter::new()));
        let reasoning = ProcessReasoning::new(router).unwrap();

        let expected_outcomes = vec![Outcome {
            id: "expected_1".to_string(),
            process_type: ProcessType::Testing,
            metric_name: "data_accuracy".to_string(),
            target_value: 1.0,
            actual_value: None,
            achieved: false,
            unit: "score".to_string(),
        }];

        let tool_results = vec![
            ToolExecutionResult {
                tool_id: "tool_1".to_string(),
                step_id: "test_step_1".to_string(),
                success: true,
                result: serde_json::json!({}),
                error: None,
                execution_time_ms: 100,
                resources_used: ResourceUsage {
                    cpu_percent: 1.0,
                    memory_mb: 10,
                    network_mb: 0.0,
                },
            },
            ToolExecutionResult {
                tool_id: "tool_2".to_string(),
                step_id: "test_step_2".to_string(),
                success: false,
                result: serde_json::json!({}),
                error: Some("failed".to_string()),
                execution_time_ms: 100,
                resources_used: ResourceUsage {
                    cpu_percent: 1.0,
                    memory_mb: 10,
                    network_mb: 0.0,
                },
            },
        ];

        let context = create_execution_context(tool_results);
        let score = reasoning.evaluate_outcome(ProcessType::Testing, &expected_outcomes, &context);

        assert_eq!(score.outcomes_total, 1);
        assert_eq!(score.outcomes_achieved, 0);
        assert!((score.overall_score - 0.5).abs() < f64::EPSILON);
        assert_eq!(score.details.len(), 1);
        assert!((score.details[0].achievement_rate - 0.5).abs() < f64::EPSILON);
    }
}
