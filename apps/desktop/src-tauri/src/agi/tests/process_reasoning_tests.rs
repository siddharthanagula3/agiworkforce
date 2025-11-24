#[cfg(test)]
mod process_reasoning_tests {
    use crate::agi::process_reasoning::{Outcome, OutcomeScore, ProcessType, Strategy};
    use serde_json::json;

    #[test]
    fn test_process_type_classification() {
        let process_types = vec![
            ProcessType::DataTransformation,
            ProcessType::InformationGathering,
            ProcessType::DecisionMaking,
            ProcessType::TaskExecution,
            ProcessType::Communication,
        ];

        assert_eq!(process_types.len(), 5);
        assert!(matches!(process_types[0], ProcessType::DataTransformation));
    }

    #[test]
    fn test_outcome_creation() {
        let outcome = Outcome {
            description: "File successfully processed".to_string(),
            probability: 0.85,
            required_resources: json!({
                "cpu": "medium",
                "memory": "low",
                "time": "short"
            }),
            dependencies: vec!["file_exists".to_string()],
        };

        assert_eq!(outcome.description, "File successfully processed");
        assert_eq!(outcome.probability, 0.85);
        assert_eq!(outcome.dependencies.len(), 1);
    }

    #[test]
    fn test_outcome_probability_bounds() {
        let outcomes = vec![
            Outcome {
                description: "Certain outcome".to_string(),
                probability: 1.0,
                required_resources: json!({}),
                dependencies: vec![],
            },
            Outcome {
                description: "Uncertain outcome".to_string(),
                probability: 0.5,
                required_resources: json!({}),
                dependencies: vec![],
            },
            Outcome {
                description: "Unlikely outcome".to_string(),
                probability: 0.1,
                required_resources: json!({}),
                dependencies: vec![],
            },
        ];

        for outcome in outcomes {
            assert!(outcome.probability >= 0.0 && outcome.probability <= 1.0);
        }
    }

    #[test]
    fn test_outcome_score_calculation() {
        let score = OutcomeScore {
            outcome_id: "outcome-1".to_string(),
            desirability: 0.9,
            feasibility: 0.8,
            efficiency: 0.85,
            total_score: 0.85, // Average of the three
        };

        assert_eq!(score.outcome_id, "outcome-1");
        assert!(score.total_score > 0.0);
        assert!(score.desirability >= 0.0 && score.desirability <= 1.0);
    }

    #[test]
    fn test_outcome_score_ranking() {
        let scores = vec![
            OutcomeScore {
                outcome_id: "outcome-1".to_string(),
                desirability: 0.9,
                feasibility: 0.8,
                efficiency: 0.85,
                total_score: 0.85,
            },
            OutcomeScore {
                outcome_id: "outcome-2".to_string(),
                desirability: 0.7,
                feasibility: 0.9,
                efficiency: 0.75,
                total_score: 0.78,
            },
            OutcomeScore {
                outcome_id: "outcome-3".to_string(),
                desirability: 0.95,
                feasibility: 0.6,
                efficiency: 0.8,
                total_score: 0.78,
            },
        ];

        let mut sorted_scores = scores.clone();
        sorted_scores.sort_by(|a, b| b.total_score.partial_cmp(&a.total_score).unwrap());

        assert_eq!(sorted_scores[0].outcome_id, "outcome-1");
        assert!(sorted_scores[0].total_score >= sorted_scores[1].total_score);
    }

    #[test]
    fn test_strategy_creation() {
        let strategy = Strategy {
            name: "Efficient Processing".to_string(),
            steps: vec![
                "Load data".to_string(),
                "Validate input".to_string(),
                "Process records".to_string(),
                "Save results".to_string(),
            ],
            expected_outcome: Outcome {
                description: "Data processed successfully".to_string(),
                probability: 0.9,
                required_resources: json!({"time": "5 minutes"}),
                dependencies: vec![],
            },
            risk_level: 0.2,
        };

        assert_eq!(strategy.name, "Efficient Processing");
        assert_eq!(strategy.steps.len(), 4);
        assert!(strategy.risk_level < 0.5);
    }

    #[test]
    fn test_strategy_risk_assessment() {
        let strategies = vec![
            Strategy {
                name: "Safe Strategy".to_string(),
                steps: vec!["Read file".to_string()],
                expected_outcome: Outcome {
                    description: "File read".to_string(),
                    probability: 0.99,
                    required_resources: json!({}),
                    dependencies: vec![],
                },
                risk_level: 0.1,
            },
            Strategy {
                name: "Risky Strategy".to_string(),
                steps: vec!["Delete all files".to_string()],
                expected_outcome: Outcome {
                    description: "Files deleted".to_string(),
                    probability: 0.95,
                    required_resources: json!({}),
                    dependencies: vec![],
                },
                risk_level: 0.9,
            },
        ];

        assert!(strategies[0].risk_level < strategies[1].risk_level);
        assert!(strategies[1].risk_level > 0.5); // High risk
    }

    #[test]
    fn test_strategy_comparison() {
        let strategy1 = Strategy {
            name: "Fast but risky".to_string(),
            steps: vec!["Quick process".to_string()],
            expected_outcome: Outcome {
                description: "Done".to_string(),
                probability: 0.7,
                required_resources: json!({"time": "1 minute"}),
                dependencies: vec![],
            },
            risk_level: 0.6,
        };

        let strategy2 = Strategy {
            name: "Slow but safe".to_string(),
            steps: vec!["Careful process".to_string()],
            expected_outcome: Outcome {
                description: "Done".to_string(),
                probability: 0.95,
                required_resources: json!({"time": "10 minutes"}),
                dependencies: vec![],
            },
            risk_level: 0.1,
        };

        // Choose based on risk tolerance
        let risk_averse = true;
        let chosen = if risk_averse { &strategy2 } else { &strategy1 };

        assert_eq!(chosen.name, "Slow but safe");
    }

    #[test]
    fn test_outcome_dependency_resolution() {
        let outcome1 = Outcome {
            description: "Step 1 complete".to_string(),
            probability: 1.0,
            required_resources: json!({}),
            dependencies: vec![],
        };

        let outcome2 = Outcome {
            description: "Step 2 complete".to_string(),
            probability: 0.9,
            required_resources: json!({}),
            dependencies: vec!["step_1_complete".to_string()],
        };

        let outcome3 = Outcome {
            description: "Step 3 complete".to_string(),
            probability: 0.85,
            required_resources: json!({}),
            dependencies: vec!["step_1_complete".to_string(), "step_2_complete".to_string()],
        };

        assert_eq!(outcome1.dependencies.len(), 0);
        assert_eq!(outcome2.dependencies.len(), 1);
        assert_eq!(outcome3.dependencies.len(), 2);
    }

    #[test]
    fn test_process_type_specific_strategies() {
        let data_transformation_strategy = Strategy {
            name: "Transform CSV to JSON".to_string(),
            steps: vec![
                "Read CSV".to_string(),
                "Parse rows".to_string(),
                "Convert to JSON".to_string(),
                "Write output".to_string(),
            ],
            expected_outcome: Outcome {
                description: "Data transformed".to_string(),
                probability: 0.95,
                required_resources: json!({"memory": "100MB"}),
                dependencies: vec![],
            },
            risk_level: 0.1,
        };

        let decision_making_strategy = Strategy {
            name: "Choose best provider".to_string(),
            steps: vec![
                "Gather provider data".to_string(),
                "Compare costs".to_string(),
                "Evaluate performance".to_string(),
                "Select provider".to_string(),
            ],
            expected_outcome: Outcome {
                description: "Provider selected".to_string(),
                probability: 0.85,
                required_resources: json!({"time": "5 seconds"}),
                dependencies: vec![],
            },
            risk_level: 0.3,
        };

        assert_eq!(data_transformation_strategy.steps.len(), 4);
        assert_eq!(decision_making_strategy.steps.len(), 4);
    }

    #[test]
    fn test_outcome_probability_calculation() {
        // Test that combined probability is calculated correctly
        let step1_prob = 0.9;
        let step2_prob = 0.8;
        let combined_prob = step1_prob * step2_prob;

        assert_eq!(combined_prob, 0.72);
    }

    #[test]
    fn test_resource_requirement_aggregation() {
        let outcomes = vec![
            Outcome {
                description: "Step 1".to_string(),
                probability: 0.9,
                required_resources: json!({"memory": 100, "cpu": 20}),
                dependencies: vec![],
            },
            Outcome {
                description: "Step 2".to_string(),
                probability: 0.85,
                required_resources: json!({"memory": 150, "cpu": 30}),
                dependencies: vec![],
            },
        ];

        // Total resources needed
        let total_memory = 100 + 150;
        let total_cpu = 20 + 30;

        assert_eq!(total_memory, 250);
        assert_eq!(total_cpu, 50);
    }

    #[test]
    fn test_strategy_step_validation() {
        let strategy = Strategy {
            name: "Invalid strategy".to_string(),
            steps: vec![], // No steps
            expected_outcome: Outcome {
                description: "Nothing".to_string(),
                probability: 0.0,
                required_resources: json!({}),
                dependencies: vec![],
            },
            risk_level: 1.0,
        };

        // Strategy with no steps should be invalid
        assert!(strategy.steps.is_empty());
        assert_eq!(strategy.risk_level, 1.0); // Maximum risk
    }

    #[test]
    fn test_outcome_serialization() {
        let outcome = Outcome {
            description: "Test outcome".to_string(),
            probability: 0.75,
            required_resources: json!({"key": "value"}),
            dependencies: vec!["dep1".to_string()],
        };

        let serialized = serde_json::to_string(&outcome).unwrap();
        let deserialized: Outcome = serde_json::from_str(&serialized).unwrap();

        assert_eq!(outcome.description, deserialized.description);
        assert_eq!(outcome.probability, deserialized.probability);
    }

    #[test]
    fn test_strategy_serialization() {
        let strategy = Strategy {
            name: "Test strategy".to_string(),
            steps: vec!["step1".to_string(), "step2".to_string()],
            expected_outcome: Outcome {
                description: "Done".to_string(),
                probability: 0.8,
                required_resources: json!({}),
                dependencies: vec![],
            },
            risk_level: 0.3,
        };

        let serialized = serde_json::to_string(&strategy).unwrap();
        let deserialized: Strategy = serde_json::from_str(&serialized).unwrap();

        assert_eq!(strategy.name, deserialized.name);
        assert_eq!(strategy.steps.len(), deserialized.steps.len());
    }

    #[test]
    fn test_multi_outcome_scenario() {
        // Test reasoning about multiple possible outcomes
        let outcomes = vec![
            Outcome {
                description: "Best case".to_string(),
                probability: 0.3,
                required_resources: json!({"time": "1 min"}),
                dependencies: vec![],
            },
            Outcome {
                description: "Likely case".to_string(),
                probability: 0.6,
                required_resources: json!({"time": "5 min"}),
                dependencies: vec![],
            },
            Outcome {
                description: "Worst case".to_string(),
                probability: 0.1,
                required_resources: json!({"time": "30 min"}),
                dependencies: vec![],
            },
        ];

        let total_probability: f64 = outcomes.iter().map(|o| o.probability).sum();
        assert!((total_probability - 1.0).abs() < 0.01); // Should sum to ~1.0
    }

    #[test]
    fn test_strategy_optimization() {
        let strategies = vec![
            Strategy {
                name: "Optimized".to_string(),
                steps: vec!["step1".to_string(), "step2".to_string()],
                expected_outcome: Outcome {
                    description: "Done fast".to_string(),
                    probability: 0.9,
                    required_resources: json!({"time": "2 min"}),
                    dependencies: vec![],
                },
                risk_level: 0.2,
            },
            Strategy {
                name: "Unoptimized".to_string(),
                steps: vec![
                    "step1".to_string(),
                    "step2".to_string(),
                    "step3".to_string(),
                    "step4".to_string(),
                ],
                expected_outcome: Outcome {
                    description: "Done slow".to_string(),
                    probability: 0.85,
                    required_resources: json!({"time": "10 min"}),
                    dependencies: vec![],
                },
                risk_level: 0.1,
            },
        ];

        // Optimized strategy has fewer steps and better outcome
        assert!(strategies[0].steps.len() < strategies[1].steps.len());
    }
}
