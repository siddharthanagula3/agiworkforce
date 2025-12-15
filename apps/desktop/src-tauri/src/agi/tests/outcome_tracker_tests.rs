#[cfg(test)]
mod tests {
    use crate::agi::outcome_tracker::OutcomeTracker;
    use crate::agi::process_reasoning::{Outcome, ProcessType};
    use rusqlite::Connection;
    use tempfile::NamedTempFile;

    fn create_tracker() -> (NamedTempFile, OutcomeTracker) {
        let db_file = NamedTempFile::new().unwrap();
        let db_path = db_file.path().to_string_lossy().to_string();

        let conn = Connection::open(&db_path).unwrap();
        conn.execute(
            "CREATE TABLE IF NOT EXISTS outcome_tracking (
                id TEXT PRIMARY KEY,
                goal_id TEXT NOT NULL,
                process_type TEXT NOT NULL,
                metric_name TEXT NOT NULL,
                target_value REAL,
                actual_value REAL,
                achieved INTEGER DEFAULT 0,
                tracked_at INTEGER DEFAULT (strftime('%s', 'now'))
            )",
            [],
        )
        .unwrap();

        let tracker = OutcomeTracker::new(db_path).unwrap();
        (db_file, tracker)
    }

    #[test]
    fn test_tracked_outcome_roundtrip_serialization() {
        use crate::agi::outcome_tracker::TrackedOutcome;

        let outcome = TrackedOutcome {
            id: "outcome_1".to_string(),
            goal_id: "goal_1".to_string(),
            process_type: ProcessType::Testing,
            metric_name: "tests_passed".to_string(),
            target_value: 1.0,
            actual_value: 1.0,
            achieved: true,
            tracked_at: 1,
        };

        let serialized = serde_json::to_string(&outcome).unwrap();
        let deserialized: TrackedOutcome = serde_json::from_str(&serialized).unwrap();

        assert_eq!(outcome.id, deserialized.id);
        assert_eq!(outcome.goal_id, deserialized.goal_id);
        assert_eq!(outcome.process_type, deserialized.process_type);
        assert_eq!(outcome.metric_name, deserialized.metric_name);
        assert_eq!(outcome.target_value, deserialized.target_value);
        assert_eq!(outcome.actual_value, deserialized.actual_value);
        assert_eq!(outcome.achieved, deserialized.achieved);
        assert_eq!(outcome.tracked_at, deserialized.tracked_at);
    }

    #[test]
    fn test_process_success_rate_roundtrip_serialization() {
        use crate::agi::outcome_tracker::ProcessSuccessRate;

        let rate = ProcessSuccessRate {
            process_type: ProcessType::Testing,
            success_rate: 0.9,
            total_executions: 10,
            successful_executions: 9,
            average_score: 0.95,
        };

        let serialized = serde_json::to_string(&rate).unwrap();
        let deserialized: ProcessSuccessRate = serde_json::from_str(&serialized).unwrap();

        assert_eq!(rate.process_type, deserialized.process_type);
        assert_eq!(rate.success_rate, deserialized.success_rate);
        assert_eq!(rate.total_executions, deserialized.total_executions);
        assert_eq!(
            rate.successful_executions,
            deserialized.successful_executions
        );
        assert_eq!(rate.average_score, deserialized.average_score);
    }

    #[test]
    fn test_track_outcome_persists_and_fetches() {
        let (_db_file, tracker) = create_tracker();

        let outcome = Outcome {
            id: "outcome_1".to_string(),
            process_type: ProcessType::Testing,
            metric_name: "tests_passed".to_string(),
            target_value: 1.0,
            actual_value: Some(1.0),
            achieved: true,
            unit: "boolean".to_string(),
        };

        tracker
            .track_outcome("goal_1".to_string(), outcome)
            .unwrap();

        let outcomes = tracker.get_outcomes_for_goal("goal_1").unwrap();
        assert_eq!(outcomes.len(), 1);
        assert_eq!(outcomes[0].metric_name, "tests_passed");
        assert!(outcomes[0].achieved);
        assert_eq!(outcomes[0].actual_value, 1.0);
    }

    #[test]
    fn test_process_success_stats_counts_by_goal() {
        let (_db_file, tracker) = create_tracker();

        // goal_1: 2/2 achieved => successful
        for (i, achieved) in [true, true].into_iter().enumerate() {
            let outcome = Outcome {
                id: format!("g1_outcome_{}", i),
                process_type: ProcessType::Testing,
                metric_name: format!("metric_{}", i),
                target_value: 1.0,
                actual_value: Some(if achieved { 1.0 } else { 0.0 }),
                achieved,
                unit: "score".to_string(),
            };
            tracker
                .track_outcome("goal_1".to_string(), outcome)
                .unwrap();
        }

        // goal_2: 1/2 achieved => not successful
        for (i, achieved) in [true, false].into_iter().enumerate() {
            let outcome = Outcome {
                id: format!("g2_outcome_{}", i),
                process_type: ProcessType::Testing,
                metric_name: format!("metric_{}", i),
                target_value: 1.0,
                actual_value: Some(if achieved { 1.0 } else { 0.0 }),
                achieved,
                unit: "score".to_string(),
            };
            tracker
                .track_outcome("goal_2".to_string(), outcome)
                .unwrap();
        }

        let stats = tracker
            .get_process_success_stats(ProcessType::Testing)
            .unwrap();
        assert_eq!(stats.total_executions, 2);
        assert_eq!(stats.successful_executions, 1);
        assert!((stats.success_rate - 0.5).abs() < f64::EPSILON);
    }
}
