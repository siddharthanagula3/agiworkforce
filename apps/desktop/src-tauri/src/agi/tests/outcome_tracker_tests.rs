#[cfg(test)]
mod outcome_tracker_tests {
    use crate::agi::outcome_tracker::{ProcessSuccessRate, TrackedOutcome};
    use serde_json::json;

    fn create_test_outcome(id: &str, achieved: bool, value: f64) -> TrackedOutcome {
        TrackedOutcome {
            id: id.to_string(),
            process_id: "test-process".to_string(),
            description: format!("Outcome {}", id),
            expected_value: 1.0,
            actual_value: value,
            achieved,
            timestamp: 1234567890,
            metadata: json!({}),
        }
    }

    #[test]
    fn test_tracked_outcome_creation() {
        let outcome = create_test_outcome("outcome-1", true, 1.0);

        assert_eq!(outcome.id, "outcome-1");
        assert_eq!(outcome.process_id, "test-process");
        assert!(outcome.achieved);
        assert_eq!(outcome.actual_value, 1.0);
    }

    #[test]
    fn test_outcome_achievement_validation() {
        let achieved = create_test_outcome("achieved", true, 1.0);
        let failed = create_test_outcome("failed", false, 0.0);
        let partial = create_test_outcome("partial", true, 0.7);

        assert!(achieved.achieved);
        assert!(!failed.achieved);
        assert!(partial.achieved);
        assert_eq!(partial.actual_value, 0.7);
    }

    #[test]
    fn test_outcome_value_comparison() {
        let outcome = create_test_outcome("test", true, 0.8);

        assert_eq!(outcome.expected_value, 1.0);
        assert_eq!(outcome.actual_value, 0.8);

        let value_ratio = outcome.actual_value / outcome.expected_value;
        assert_eq!(value_ratio, 0.8);
    }

    #[test]
    fn test_process_success_rate_calculation() {
        let success_rate = ProcessSuccessRate {
            process_type: "data_processing".to_string(),
            total_attempts: 100,
            successful_outcomes: 85,
            failed_outcomes: 15,
            average_value_achieved: 0.92,
            success_rate: 0.85,
        };

        assert_eq!(success_rate.success_rate, 0.85);
        assert_eq!(
            success_rate.total_attempts,
            success_rate.successful_outcomes + success_rate.failed_outcomes
        );
    }

    #[test]
    fn test_success_rate_edge_cases() {
        let perfect = ProcessSuccessRate {
            process_type: "perfect".to_string(),
            total_attempts: 10,
            successful_outcomes: 10,
            failed_outcomes: 0,
            average_value_achieved: 1.0,
            success_rate: 1.0,
        };

        let complete_failure = ProcessSuccessRate {
            process_type: "failed".to_string(),
            total_attempts: 10,
            successful_outcomes: 0,
            failed_outcomes: 10,
            average_value_achieved: 0.0,
            success_rate: 0.0,
        };

        assert_eq!(perfect.success_rate, 1.0);
        assert_eq!(complete_failure.success_rate, 0.0);
    }

    #[test]
    fn test_outcome_metadata_storage() {
        let outcome = TrackedOutcome {
            id: "meta-test".to_string(),
            process_id: "process-1".to_string(),
            description: "Test with metadata".to_string(),
            expected_value: 1.0,
            actual_value: 0.95,
            achieved: true,
            timestamp: 1234567890,
            metadata: json!({
                "execution_time_ms": 1500,
                "resources_used": {"cpu": 50, "memory": 200},
                "retry_count": 0
            }),
        };

        assert!(outcome.metadata.is_object());
        assert_eq!(outcome.metadata["execution_time_ms"], 1500);
    }

    #[test]
    fn test_outcome_timestamp_ordering() {
        let outcome1 = TrackedOutcome {
            id: "1".to_string(),
            process_id: "p".to_string(),
            description: "First".to_string(),
            expected_value: 1.0,
            actual_value: 1.0,
            achieved: true,
            timestamp: 1000,
            metadata: json!({}),
        };

        let outcome2 = TrackedOutcome {
            id: "2".to_string(),
            process_id: "p".to_string(),
            description: "Second".to_string(),
            expected_value: 1.0,
            actual_value: 1.0,
            achieved: true,
            timestamp: 2000,
            metadata: json!({}),
        };

        assert!(outcome1.timestamp < outcome2.timestamp);
    }

    #[test]
    fn test_outcome_grouping_by_process() {
        let outcomes = vec![
            TrackedOutcome {
                id: "1".to_string(),
                process_id: "process-a".to_string(),
                description: "A1".to_string(),
                expected_value: 1.0,
                actual_value: 1.0,
                achieved: true,
                timestamp: 1000,
                metadata: json!({}),
            },
            TrackedOutcome {
                id: "2".to_string(),
                process_id: "process-a".to_string(),
                description: "A2".to_string(),
                expected_value: 1.0,
                actual_value: 0.8,
                achieved: true,
                timestamp: 2000,
                metadata: json!({}),
            },
            TrackedOutcome {
                id: "3".to_string(),
                process_id: "process-b".to_string(),
                description: "B1".to_string(),
                expected_value: 1.0,
                actual_value: 1.0,
                achieved: true,
                timestamp: 3000,
                metadata: json!({}),
            },
        ];

        let process_a_outcomes: Vec<_> = outcomes
            .iter()
            .filter(|o| o.process_id == "process-a")
            .collect();

        assert_eq!(process_a_outcomes.len(), 2);
    }

    #[test]
    fn test_average_value_calculation() {
        let outcomes = vec![
            create_test_outcome("1", true, 1.0),
            create_test_outcome("2", true, 0.9),
            create_test_outcome("3", true, 0.8),
            create_test_outcome("4", true, 0.7),
        ];

        let sum: f64 = outcomes.iter().map(|o| o.actual_value).sum();
        let average = sum / outcomes.len() as f64;

        assert_eq!(average, 0.85);
    }

    #[test]
    fn test_success_rate_trends() {
        let rates = vec![
            ProcessSuccessRate {
                process_type: "test".to_string(),
                total_attempts: 10,
                successful_outcomes: 5,
                failed_outcomes: 5,
                average_value_achieved: 0.5,
                success_rate: 0.5,
            },
            ProcessSuccessRate {
                process_type: "test".to_string(),
                total_attempts: 20,
                successful_outcomes: 14,
                failed_outcomes: 6,
                average_value_achieved: 0.7,
                success_rate: 0.7,
            },
            ProcessSuccessRate {
                process_type: "test".to_string(),
                total_attempts: 30,
                successful_outcomes: 27,
                failed_outcomes: 3,
                average_value_achieved: 0.9,
                success_rate: 0.9,
            },
        ];

        // Success rate is improving over time
        assert!(rates[0].success_rate < rates[1].success_rate);
        assert!(rates[1].success_rate < rates[2].success_rate);
    }

    #[test]
    fn test_outcome_partial_achievement() {
        let outcomes = vec![
            create_test_outcome("full", true, 1.0),
            create_test_outcome("high", true, 0.9),
            create_test_outcome("medium", true, 0.7),
            create_test_outcome("low", true, 0.5),
            create_test_outcome("failed", false, 0.1),
        ];

        let achieved_count = outcomes.iter().filter(|o| o.achieved).count();
        assert_eq!(achieved_count, 4);

        let high_value_count = outcomes.iter().filter(|o| o.actual_value > 0.8).count();
        assert_eq!(high_value_count, 2);
    }

    #[test]
    fn test_outcome_serialization() {
        let outcome = create_test_outcome("serialize-test", true, 0.95);

        let serialized = serde_json::to_string(&outcome).unwrap();
        let deserialized: TrackedOutcome = serde_json::from_str(&serialized).unwrap();

        assert_eq!(outcome.id, deserialized.id);
        assert_eq!(outcome.achieved, deserialized.achieved);
        assert_eq!(outcome.actual_value, deserialized.actual_value);
    }

    #[test]
    fn test_success_rate_serialization() {
        let rate = ProcessSuccessRate {
            process_type: "serialization_test".to_string(),
            total_attempts: 50,
            successful_outcomes: 45,
            failed_outcomes: 5,
            average_value_achieved: 0.92,
            success_rate: 0.9,
        };

        let serialized = serde_json::to_string(&rate).unwrap();
        let deserialized: ProcessSuccessRate = serde_json::from_str(&serialized).unwrap();

        assert_eq!(rate.process_type, deserialized.process_type);
        assert_eq!(rate.success_rate, deserialized.success_rate);
    }

    #[test]
    fn test_outcome_filtering_by_achievement() {
        let outcomes = vec![
            create_test_outcome("1", true, 1.0),
            create_test_outcome("2", false, 0.2),
            create_test_outcome("3", true, 0.9),
            create_test_outcome("4", false, 0.3),
            create_test_outcome("5", true, 0.8),
        ];

        let achieved: Vec<_> = outcomes.iter().filter(|o| o.achieved).collect();
        let failed: Vec<_> = outcomes.iter().filter(|o| !o.achieved).collect();

        assert_eq!(achieved.len(), 3);
        assert_eq!(failed.len(), 2);
    }

    #[test]
    fn test_outcome_value_distribution() {
        let outcomes = vec![
            create_test_outcome("1", true, 1.0),
            create_test_outcome("2", true, 0.95),
            create_test_outcome("3", true, 0.9),
            create_test_outcome("4", true, 0.85),
            create_test_outcome("5", true, 0.8),
        ];

        let high_value = outcomes.iter().filter(|o| o.actual_value >= 0.9).count();
        let medium_value = outcomes
            .iter()
            .filter(|o| o.actual_value >= 0.8 && o.actual_value < 0.9)
            .count();

        assert_eq!(high_value, 3);
        assert_eq!(medium_value, 2);
    }

    #[test]
    fn test_process_learning_from_outcomes() {
        // Simulate learning from past outcomes
        let past_outcomes = vec![
            create_test_outcome("1", true, 0.7),
            create_test_outcome("2", true, 0.8),
            create_test_outcome("3", true, 0.9),
        ];

        let values: Vec<f64> = past_outcomes.iter().map(|o| o.actual_value).collect();
        let trend_improving = values.windows(2).all(|w| w[1] >= w[0]);

        assert!(trend_improving);
    }

    #[test]
    fn test_outcome_confidence_intervals() {
        let outcomes = vec![
            create_test_outcome("1", true, 0.85),
            create_test_outcome("2", true, 0.88),
            create_test_outcome("3", true, 0.82),
            create_test_outcome("4", true, 0.87),
            create_test_outcome("5", true, 0.86),
        ];

        let sum: f64 = outcomes.iter().map(|o| o.actual_value).sum();
        let mean = sum / outcomes.len() as f64;

        let variance: f64 = outcomes
            .iter()
            .map(|o| (o.actual_value - mean).powi(2))
            .sum::<f64>()
            / outcomes.len() as f64;

        let std_dev = variance.sqrt();

        assert!(mean > 0.8);
        assert!(std_dev < 0.1); // Low variance indicates consistency
    }

    #[test]
    fn test_outcome_retry_tracking() {
        let outcomes = vec![
            TrackedOutcome {
                id: "retry-0".to_string(),
                process_id: "p1".to_string(),
                description: "First attempt".to_string(),
                expected_value: 1.0,
                actual_value: 1.0,
                achieved: true,
                timestamp: 1000,
                metadata: json!({"retry_count": 0}),
            },
            TrackedOutcome {
                id: "retry-1".to_string(),
                process_id: "p2".to_string(),
                description: "Second attempt after retry".to_string(),
                expected_value: 1.0,
                actual_value: 1.0,
                achieved: true,
                timestamp: 2000,
                metadata: json!({"retry_count": 1}),
            },
        ];

        let no_retry_count = outcomes
            .iter()
            .filter(|o| o.metadata["retry_count"] == 0)
            .count();

        assert_eq!(no_retry_count, 1);
    }

    #[test]
    fn test_outcome_impact_measurement() {
        let outcome = TrackedOutcome {
            id: "impact-test".to_string(),
            process_id: "high-impact".to_string(),
            description: "High impact outcome".to_string(),
            expected_value: 1.0,
            actual_value: 0.95,
            achieved: true,
            timestamp: 1234567890,
            metadata: json!({
                "impact_score": 0.9,
                "affected_systems": ["system_a", "system_b", "system_c"],
                "user_satisfaction": 0.92
            }),
        };

        assert_eq!(outcome.metadata["impact_score"], 0.9);
        assert_eq!(
            outcome.metadata["affected_systems"]
                .as_array()
                .unwrap()
                .len(),
            3
        );
    }

    #[test]
    fn test_comparative_outcome_analysis() {
        let strategy_a_outcomes = vec![
            create_test_outcome("a1", true, 0.85),
            create_test_outcome("a2", true, 0.87),
            create_test_outcome("a3", true, 0.83),
        ];

        let strategy_b_outcomes = vec![
            create_test_outcome("b1", true, 0.92),
            create_test_outcome("b2", true, 0.94),
            create_test_outcome("b3", true, 0.91),
        ];

        let avg_a: f64 = strategy_a_outcomes
            .iter()
            .map(|o| o.actual_value)
            .sum::<f64>()
            / 3.0;
        let avg_b: f64 = strategy_b_outcomes
            .iter()
            .map(|o| o.actual_value)
            .sum::<f64>()
            / 3.0;

        // Strategy B performs better
        assert!(avg_b > avg_a);
    }
}
