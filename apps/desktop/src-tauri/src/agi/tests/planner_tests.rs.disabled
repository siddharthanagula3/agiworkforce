#[cfg(test)]
mod tests {
    use crate::agi::planner::{Plan, PlanStep};
    use serde_json::json;
    use std::collections::HashMap;

    #[test]
    fn test_plan_step_creation() {
        let step = PlanStep {
            id: "step1".to_string(),
            description: "Read configuration file".to_string(),
            tool_id: "file_read".to_string(),
            parameters: {
                let mut params = HashMap::new();
                params.insert("path".to_string(), json!("/config.json"));
                params
            },
            dependencies: vec![],
            estimated_duration_ms: 100,
        };

        assert_eq!(step.id, "step1");
        assert_eq!(step.tool_id, "file_read");
        assert_eq!(step.dependencies.len(), 0);
        assert_eq!(step.estimated_duration_ms, 100);
    }

    #[test]
    fn test_plan_creation() {
        let plan = Plan {
            id: "plan1".to_string(),
            goal_id: "goal1".to_string(),
            steps: vec![
                PlanStep {
                    id: "step1".to_string(),
                    description: "Step 1".to_string(),
                    tool_id: "tool1".to_string(),
                    parameters: HashMap::new(),
                    dependencies: vec![],
                    estimated_duration_ms: 100,
                },
                PlanStep {
                    id: "step2".to_string(),
                    description: "Step 2".to_string(),
                    tool_id: "tool2".to_string(),
                    parameters: HashMap::new(),
                    dependencies: vec!["step1".to_string()],
                    estimated_duration_ms: 200,
                },
            ],
            total_estimated_duration_ms: 300,
            confidence: 0.85,
        };

        assert_eq!(plan.steps.len(), 2);
        assert_eq!(plan.total_estimated_duration_ms, 300);
        assert!(plan.confidence > 0.0 && plan.confidence <= 1.0);
    }

    #[test]
    fn test_plan_dependency_chain() {
        let steps = vec![
            PlanStep {
                id: "step1".to_string(),
                description: "First step".to_string(),
                tool_id: "tool1".to_string(),
                parameters: HashMap::new(),
                dependencies: vec![],
                estimated_duration_ms: 100,
            },
            PlanStep {
                id: "step2".to_string(),
                description: "Second step".to_string(),
                tool_id: "tool2".to_string(),
                parameters: HashMap::new(),
                dependencies: vec!["step1".to_string()],
                estimated_duration_ms: 150,
            },
            PlanStep {
                id: "step3".to_string(),
                description: "Third step".to_string(),
                tool_id: "tool3".to_string(),
                parameters: HashMap::new(),
                dependencies: vec!["step1".to_string(), "step2".to_string()],
                estimated_duration_ms: 200,
            },
        ];

        // Verify dependency chain
        assert_eq!(steps[0].dependencies.len(), 0);
        assert_eq!(steps[1].dependencies.len(), 1);
        assert_eq!(steps[2].dependencies.len(), 2);
    }

    #[test]
    fn test_plan_serialization() {
        let plan = Plan {
            id: "test_plan".to_string(),
            goal_id: "test_goal".to_string(),
            steps: vec![],
            total_estimated_duration_ms: 0,
            confidence: 0.9,
        };

        let serialized = serde_json::to_string(&plan).unwrap();
        let deserialized: Plan = serde_json::from_str(&serialized).unwrap();

        assert_eq!(plan.id, deserialized.id);
        assert_eq!(plan.goal_id, deserialized.goal_id);
        assert_eq!(plan.confidence, deserialized.confidence);
    }

    #[test]
    fn test_step_serialization() {
        let step = PlanStep {
            id: "test_step".to_string(),
            description: "Test step".to_string(),
            tool_id: "test_tool".to_string(),
            parameters: {
                let mut params = HashMap::new();
                params.insert("key".to_string(), json!("value"));
                params
            },
            dependencies: vec!["dep1".to_string()],
            estimated_duration_ms: 250,
        };

        let serialized = serde_json::to_string(&step).unwrap();
        let deserialized: PlanStep = serde_json::from_str(&serialized).unwrap();

        assert_eq!(step.id, deserialized.id);
        assert_eq!(step.tool_id, deserialized.tool_id);
        assert_eq!(step.estimated_duration_ms, deserialized.estimated_duration_ms);
    }

    #[test]
    fn test_plan_confidence_range() {
        let plan = Plan {
            id: "confidence_test".to_string(),
            goal_id: "goal".to_string(),
            steps: vec![],
            total_estimated_duration_ms: 1000,
            confidence: 0.75,
        };

        assert!(plan.confidence >= 0.0);
        assert!(plan.confidence <= 1.0);
    }

    #[test]
    fn test_parallel_steps_no_dependencies() {
        let parallel_steps = vec![
            PlanStep {
                id: "parallel1".to_string(),
                description: "Parallel 1".to_string(),
                tool_id: "tool1".to_string(),
                parameters: HashMap::new(),
                dependencies: vec![],
                estimated_duration_ms: 100,
            },
            PlanStep {
                id: "parallel2".to_string(),
                description: "Parallel 2".to_string(),
                tool_id: "tool2".to_string(),
                parameters: HashMap::new(),
                dependencies: vec![],
                estimated_duration_ms: 100,
            },
            PlanStep {
                id: "parallel3".to_string(),
                description: "Parallel 3".to_string(),
                tool_id: "tool3".to_string(),
                parameters: HashMap::new(),
                dependencies: vec![],
                estimated_duration_ms: 100,
            },
        ];

        let independent: Vec<_> = parallel_steps.iter().filter(|s| s.dependencies.is_empty()).collect();
        assert_eq!(independent.len(), 3);
    }

    #[test]
    fn test_plan_duration_calculation() {
        let steps = vec![
            PlanStep {
                id: "s1".to_string(),
                description: "Step 1".to_string(),
                tool_id: "t1".to_string(),
                parameters: HashMap::new(),
                dependencies: vec![],
                estimated_duration_ms: 100,
            },
            PlanStep {
                id: "s2".to_string(),
                description: "Step 2".to_string(),
                tool_id: "t2".to_string(),
                parameters: HashMap::new(),
                dependencies: vec![],
                estimated_duration_ms: 200,
            },
            PlanStep {
                id: "s3".to_string(),
                description: "Step 3".to_string(),
                tool_id: "t3".to_string(),
                parameters: HashMap::new(),
                dependencies: vec![],
                estimated_duration_ms: 150,
            },
        ];

        let total: u64 = steps.iter().map(|s| s.estimated_duration_ms).sum();
        assert_eq!(total, 450);
    }

    #[test]
    fn test_step_parameter_substitution() {
        let step = PlanStep {
            id: "param_step".to_string(),
            description: "Step with parameters".to_string(),
            tool_id: "file_write".to_string(),
            parameters: {
                let mut params = HashMap::new();
                params.insert("path".to_string(), json!("/output.txt"));
                params.insert("content".to_string(), json!("Hello World"));
                params
            },
            dependencies: vec![],
            estimated_duration_ms: 50,
        };

        assert_eq!(step.parameters.len(), 2);
        assert!(step.parameters.contains_key("path"));
        assert!(step.parameters.contains_key("content"));
    }

    #[test]
    fn test_complex_dependency_graph() {
        let steps = vec![
            PlanStep {
                id: "root".to_string(),
                description: "Root".to_string(),
                tool_id: "t1".to_string(),
                parameters: HashMap::new(),
                dependencies: vec![],
                estimated_duration_ms: 100,
            },
            PlanStep {
                id: "child1".to_string(),
                description: "Child 1".to_string(),
                tool_id: "t2".to_string(),
                parameters: HashMap::new(),
                dependencies: vec!["root".to_string()],
                estimated_duration_ms: 100,
            },
            PlanStep {
                id: "child2".to_string(),
                description: "Child 2".to_string(),
                tool_id: "t3".to_string(),
                parameters: HashMap::new(),
                dependencies: vec!["root".to_string()],
                estimated_duration_ms: 100,
            },
            PlanStep {
                id: "grandchild".to_string(),
                description: "Grandchild".to_string(),
                tool_id: "t4".to_string(),
                parameters: HashMap::new(),
                dependencies: vec!["child1".to_string(), "child2".to_string()],
                estimated_duration_ms: 100,
            },
        ];

        let root_steps: Vec<_> = steps.iter().filter(|s| s.dependencies.is_empty()).collect();
        let leaf_steps: Vec<_> = steps
            .iter()
            .filter(|s| !steps.iter().any(|other| other.dependencies.contains(&s.id)))
            .collect();

        assert_eq!(root_steps.len(), 1);
        assert_eq!(leaf_steps.len(), 1);
    }
}
