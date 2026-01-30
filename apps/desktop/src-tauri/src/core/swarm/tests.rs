//! Tests for the Swarm module
//!
//! These tests verify the core functionality of the agent swarm system.

use super::*;
use std::time::Duration;

mod task_decomposer_tests {
    use super::*;
    use task_decomposer::*;

    #[test]
    fn test_subtask_creation() {
        let subtask = Subtask::new("test_1", "Test subtask", SubtaskType::Computation, "goal_1");

        assert_eq!(subtask.id, "test_1");
        assert_eq!(subtask.description, "Test subtask");
        assert_eq!(subtask.task_type, SubtaskType::Computation);
        assert_eq!(subtask.status, SubtaskStatus::Pending);
        assert!(subtask.dependencies.is_empty());
    }

    #[test]
    fn test_subtask_lifecycle() {
        let mut subtask = Subtask::new(
            "test_1",
            "Test subtask",
            SubtaskType::FileOperation,
            "goal_1",
        );

        assert_eq!(subtask.status, SubtaskStatus::Pending);

        subtask.start();
        assert_eq!(subtask.status, SubtaskStatus::Running);

        subtask.complete();
        assert_eq!(subtask.status, SubtaskStatus::Completed);
    }

    #[test]
    fn test_subtask_retry() {
        let mut subtask = Subtask::new(
            "test_1",
            "Test subtask",
            SubtaskType::NetworkRequest,
            "goal_1",
        );
        subtask.retries_remaining = 2;

        // First failure - should retry
        assert!(subtask.fail());
        assert_eq!(subtask.status, SubtaskStatus::Pending);
        assert_eq!(subtask.retries_remaining, 1);

        // Second failure - should retry
        assert!(subtask.fail());
        assert_eq!(subtask.status, SubtaskStatus::Pending);
        assert_eq!(subtask.retries_remaining, 0);

        // Third failure - no more retries
        assert!(!subtask.fail());
        assert_eq!(subtask.status, SubtaskStatus::Failed);
    }

    #[test]
    fn test_dependency_graph_ordering() {
        let mut graph = DependencyGraph::new();

        // Create a chain: s1 -> s2 -> s3
        let s1 = Subtask::new("s1", "First", SubtaskType::Computation, "goal");
        let mut s2 = Subtask::new("s2", "Second", SubtaskType::Computation, "goal");
        s2.dependencies = vec!["s1".to_string()];
        let mut s3 = Subtask::new("s3", "Third", SubtaskType::Computation, "goal");
        s3.dependencies = vec!["s2".to_string()];

        graph.add_subtask(s1);
        graph.add_subtask(s2);
        graph.add_subtask(s3);

        // Only s1 should be ready
        let ready = graph.get_ready_subtasks();
        assert_eq!(ready.len(), 1);
        assert_eq!(ready[0].id, "s1");

        // Complete s1
        graph.mark_running("s1");
        let unblocked = graph.mark_completed("s1");
        assert!(unblocked.contains(&"s2".to_string()));

        // Now s2 should be ready
        let ready = graph.get_ready_subtasks();
        assert_eq!(ready.len(), 1);
        assert_eq!(ready[0].id, "s2");
    }

    #[test]
    fn test_parallel_subtasks() {
        let mut graph = DependencyGraph::new();

        // Create parallel tasks: s1 and s2 can run together
        let s1 = Subtask::new("s1", "Parallel 1", SubtaskType::Computation, "goal");
        let s2 = Subtask::new("s2", "Parallel 2", SubtaskType::Computation, "goal");

        graph.add_subtask(s1);
        graph.add_subtask(s2);

        // Both should be ready
        let ready = graph.get_ready_subtasks();
        assert_eq!(ready.len(), 2);
    }

    #[test]
    fn test_critical_path_calculation() {
        let mut graph = DependencyGraph::new();

        // Create: s1 -> s2 -> s4
        //         s1 -> s3 -> s4
        let s1 = Subtask::new("s1", "Start", SubtaskType::Computation, "goal");
        let mut s2 = Subtask::new("s2", "Path A", SubtaskType::Computation, "goal");
        s2.dependencies = vec!["s1".to_string()];
        let mut s3 = Subtask::new("s3", "Path B", SubtaskType::Computation, "goal");
        s3.dependencies = vec!["s1".to_string()];
        let mut s4 = Subtask::new("s4", "End", SubtaskType::Computation, "goal");
        s4.dependencies = vec!["s2".to_string(), "s3".to_string()];

        graph.add_subtask(s1);
        graph.add_subtask(s2);
        graph.add_subtask(s3);
        graph.add_subtask(s4);

        // Critical path should be length 3 (s1 -> s2/s3 -> s4)
        let path = graph.get_critical_path();
        assert_eq!(path.len(), 3);
        assert_eq!(path[0], "s1");
        assert_eq!(path[2], "s4");
    }
}

mod result_aggregator_tests {
    use super::*;
    use result_aggregator::*;

    #[test]
    fn test_successful_aggregation() {
        let aggregator = ResultAggregator::new(AggregationStrategy::MergeAll);

        let results = vec![
            SubtaskResult::success(
                "s1",
                "a1",
                serde_json::json!({"data": "result1"}),
                Duration::from_millis(100),
            ),
            SubtaskResult::success(
                "s2",
                "a2",
                serde_json::json!({"more": "result2"}),
                Duration::from_millis(200),
            ),
        ];

        let aggregated = aggregator
            .aggregate(results, Duration::from_millis(250))
            .unwrap();

        assert!(aggregated.success);
        assert_eq!(aggregated.succeeded_count, 2);
        assert_eq!(aggregated.failed_count, 0);

        // Speedup: 300ms agent time / 250ms wall time = 1.2x
        assert!(aggregated.speedup_ratio > 1.0);
    }

    #[test]
    fn test_partial_failure() {
        let aggregator = ResultAggregator::new(AggregationStrategy::MergeAll);

        let results = vec![
            SubtaskResult::success(
                "s1",
                "a1",
                serde_json::json!("ok"),
                Duration::from_millis(100),
            ),
            SubtaskResult::failure("s2", "a2", "error occurred", Duration::from_millis(50)),
        ];

        let aggregated = aggregator
            .aggregate(results, Duration::from_millis(100))
            .unwrap();

        assert!(aggregated.success); // MergeAll succeeds if any succeed
        assert_eq!(aggregated.succeeded_count, 1);
        assert_eq!(aggregated.failed_count, 1);
        assert_eq!(aggregated.errors.len(), 1);
    }

    #[test]
    fn test_require_all_strategy() {
        let aggregator = ResultAggregator::new(AggregationStrategy::RequireAll);

        let results_with_failure = vec![
            SubtaskResult::success(
                "s1",
                "a1",
                serde_json::json!("ok"),
                Duration::from_millis(100),
            ),
            SubtaskResult::failure("s2", "a2", "error", Duration::from_millis(50)),
        ];

        let aggregated = aggregator
            .aggregate(results_with_failure, Duration::from_millis(100))
            .unwrap();

        assert!(!aggregated.success);

        // All success case
        let results_all_success = vec![
            SubtaskResult::success(
                "s1",
                "a1",
                serde_json::json!("ok"),
                Duration::from_millis(100),
            ),
            SubtaskResult::success(
                "s2",
                "a2",
                serde_json::json!("ok"),
                Duration::from_millis(100),
            ),
        ];

        let aggregated = aggregator
            .aggregate(results_all_success, Duration::from_millis(100))
            .unwrap();

        assert!(aggregated.success);
    }

    #[test]
    fn test_high_speedup() {
        let aggregator = ResultAggregator::new(AggregationStrategy::MergeAll);

        // Simulate 10 parallel tasks each taking 100ms
        // If run sequentially: 1000ms, parallel: ~100ms
        let results: Vec<SubtaskResult> = (0..10)
            .map(|i| {
                SubtaskResult::success(
                    format!("s{}", i),
                    format!("a{}", i),
                    serde_json::json!({"task": i}),
                    Duration::from_millis(100),
                )
            })
            .collect();

        let aggregated = aggregator
            .aggregate(results, Duration::from_millis(100))
            .unwrap();

        // Should achieve ~10x speedup
        assert!(aggregated.speedup_ratio >= 9.0);
    }
}

mod orchestrator_tests {
    use super::*;
    use orchestrator::*;

    #[test]
    fn test_swarm_config_default() {
        let config = SwarmConfig::default();

        assert_eq!(config.max_agents, constants::MAX_CONCURRENT_AGENTS);
        assert_eq!(config.swarm_timeout, constants::DEFAULT_SWARM_TIMEOUT);
        assert!(config.auto_spawn);
        assert!(config.optimize_critical_path);
    }

    #[test]
    fn test_swarm_stats() {
        let mut stats = SwarmStats::default();

        stats.goals_processed = 5;
        stats.subtasks_completed = 20;
        stats.subtasks_failed = 2;
        stats.peak_agents = 10;
        stats.avg_speedup_ratio = 4.2;

        assert_eq!(stats.goals_processed, 5);
        assert!(stats.avg_speedup_ratio > 4.0);
    }
}

mod agent_spawner_tests {
    use super::*;
    use agent_spawner::*;

    #[test]
    fn test_subagent_config_default() {
        let config = SubAgentConfig::default();

        assert!(config.frozen); // Sub-agents are frozen by default
        assert_eq!(config.max_concurrent_tasks, 1);
        assert!(config.use_local_llm_fallback);
    }
}

mod integration_tests {
    use super::*;

    #[test]
    fn test_swarm_metrics_calculation() {
        let mut metrics = SwarmMetrics::default();

        metrics.total_agent_time_ms = 4500;
        metrics.wall_clock_time_ms = 1000;
        metrics.calculate_speedup();

        // Should achieve 4.5x speedup (matching Kimi K2.5 target)
        assert!((metrics.speedup_ratio - 4.5).abs() < 0.01);
    }

    #[test]
    fn test_subtask_priority_ordering() {
        assert!(SubtaskPriority::Critical > SubtaskPriority::High);
        assert!(SubtaskPriority::High > SubtaskPriority::Normal);
        assert!(SubtaskPriority::Normal > SubtaskPriority::Low);
    }

    #[test]
    fn test_swarm_error_display() {
        let error = SwarmError::CapacityExceeded {
            current: 100,
            max: 100,
        };
        let display = format!("{}", error);
        assert!(display.contains("100"));

        let timeout_error = SwarmError::Timeout {
            elapsed: Duration::from_secs(300),
            limit: Duration::from_secs(300),
        };
        let display = format!("{}", timeout_error);
        assert!(display.contains("300"));
    }
}
