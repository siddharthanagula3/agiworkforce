//! Tests for the Continuous Execution Mode
//!
//! These tests verify the behavior of the continuous executor, including:
//! - Task lifecycle management
//! - Daily limit tracking
//! - Checkpoint persistence
//! - Recovery from failures

use crate::core::agent::continuous_executor::{
    ContinuousExecutorConfig, ContinuousTask, ContinuousTaskStatus, DailyLimitTracker,
    DailyUsageStats, ExecutionCheckpoint, ExecutionStatePersistence,
};
use chrono::Utc;
use std::collections::HashMap;
use tempfile::tempdir;
use uuid::Uuid;

fn create_test_config() -> ContinuousExecutorConfig {
    ContinuousExecutorConfig {
        checkpoint_interval: 2,
        max_consecutive_failures: 3,
        daily_token_limit: 1000,
        daily_request_limit: 100,
        auto_resume_on_restart: true,
        timezone: "UTC".to_string(),
        deadline: None,
    }
}

#[test]
fn test_continuous_task_creation() {
    let config = create_test_config();
    let task = ContinuousTask::new("Test task".to_string(), config);

    assert_eq!(task.status, ContinuousTaskStatus::Pending);
    assert_eq!(task.current_step, 0);
    assert_eq!(task.consecutive_failures, 0);
    assert_eq!(task.tokens_used, 0);
    assert_eq!(task.requests_made, 0);
    assert!(!task.id.is_empty());
}

#[test]
fn test_continuous_task_with_priority() {
    let config = create_test_config();
    let task = ContinuousTask::new("Test task".to_string(), config)
        .with_priority(crate::core::agi::Priority::High);

    assert_eq!(task.priority, crate::core::agi::Priority::High);
}

#[test]
fn test_task_status_is_terminal() {
    assert!(ContinuousTaskStatus::Completed.is_terminal());
    assert!(ContinuousTaskStatus::Failed.is_terminal());
    assert!(ContinuousTaskStatus::Cancelled.is_terminal());

    assert!(!ContinuousTaskStatus::Pending.is_terminal());
    assert!(!ContinuousTaskStatus::Running.is_terminal());
    assert!(!ContinuousTaskStatus::Paused.is_terminal());
    assert!(!ContinuousTaskStatus::LimitReached.is_terminal());
    assert!(!ContinuousTaskStatus::Recovering.is_terminal());
}

#[test]
fn test_task_status_can_resume() {
    assert!(ContinuousTaskStatus::Paused.can_resume());
    assert!(ContinuousTaskStatus::LimitReached.can_resume());

    assert!(!ContinuousTaskStatus::Pending.can_resume());
    assert!(!ContinuousTaskStatus::Running.can_resume());
    assert!(!ContinuousTaskStatus::Completed.can_resume());
    assert!(!ContinuousTaskStatus::Failed.can_resume());
    assert!(!ContinuousTaskStatus::Cancelled.can_resume());
    assert!(!ContinuousTaskStatus::Recovering.can_resume());
}

#[test]
fn test_daily_usage_stats_new_for_today() {
    let stats = DailyUsageStats::new_for_today();

    assert_eq!(stats.tokens_used, 0);
    assert_eq!(stats.requests_made, 0);
    assert_eq!(stats.cost_incurred, 0.0);
    assert!(!stats.date.is_empty());

    // Verify date format is YYYY-MM-DD
    assert_eq!(stats.date.len(), 10);
    assert!(stats.date.chars().nth(4) == Some('-'));
    assert!(stats.date.chars().nth(7) == Some('-'));
}

#[test]
fn test_daily_limit_tracker_creation() {
    let config = create_test_config();
    let tracker = DailyLimitTracker::new(&config);

    assert!(!tracker.is_limit_exceeded());

    let stats = tracker.get_stats();
    assert_eq!(stats.tokens_used, 0);
    assert_eq!(stats.requests_made, 0);
}

#[test]
fn test_daily_limit_tracker_record_usage() {
    let config = create_test_config();
    let tracker = DailyLimitTracker::new(&config);

    // Record some usage
    tracker.record_usage(100, 0.01);

    let stats = tracker.get_stats();
    assert_eq!(stats.tokens_used, 100);
    assert_eq!(stats.requests_made, 1);
    assert!((stats.cost_incurred - 0.01).abs() < f64::EPSILON);
}

#[test]
fn test_daily_limit_tracker_exceeds_token_limit() {
    let config = create_test_config();
    let tracker = DailyLimitTracker::new(&config);

    // Record usage up to the limit (1000 tokens)
    for _ in 0..10 {
        tracker.record_usage(100, 0.01);
    }

    // Should be at limit now
    assert!(tracker.is_limit_exceeded());

    let stats = tracker.get_stats();
    assert_eq!(stats.tokens_used, 1000);
    assert_eq!(stats.requests_made, 10);
}

#[test]
fn test_daily_limit_tracker_exceeds_request_limit() {
    let mut config = create_test_config();
    config.daily_token_limit = 0; // Disable token limit
    config.daily_request_limit = 5;

    let tracker = DailyLimitTracker::new(&config);

    // Record 5 requests
    for _ in 0..5 {
        tracker.record_usage(10, 0.001);
    }

    // Should be at limit now
    assert!(tracker.is_limit_exceeded());

    let stats = tracker.get_stats();
    assert_eq!(stats.requests_made, 5);
}

#[test]
fn test_daily_limit_tracker_update_limits() {
    let config = create_test_config();
    let tracker = DailyLimitTracker::new(&config);

    // Record usage that would exceed original limit
    for _ in 0..20 {
        tracker.record_usage(100, 0.01);
    }

    assert!(tracker.is_limit_exceeded());

    // Increase the limit
    tracker.update_limits(5000, 1000);

    // Should no longer be exceeded
    assert!(!tracker.is_limit_exceeded());
}

#[test]
fn test_execution_state_persistence_tables() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test.db").to_str().unwrap().to_string();

    // Creating persistence should create tables without error
    let persistence = ExecutionStatePersistence::new(db_path.clone()).unwrap();

    // Creating again should also work (tables already exist)
    let _ = ExecutionStatePersistence::new(db_path).unwrap();

    drop(persistence);
}

#[test]
fn test_task_persistence_save_and_load() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test.db").to_str().unwrap().to_string();

    let persistence = ExecutionStatePersistence::new(db_path).unwrap();

    // Create and save a task
    let config = create_test_config();
    let mut task = ContinuousTask::new("Test task description".to_string(), config);
    task.current_step = 5;
    task.tokens_used = 500;
    task.requests_made = 10;
    task.total_cost = 0.5;
    task.status = ContinuousTaskStatus::Running;

    persistence.save_task(&task).unwrap();

    // Load it back
    let loaded = persistence.load_task(&task.id).unwrap().unwrap();

    assert_eq!(loaded.id, task.id);
    assert_eq!(loaded.description, "Test task description");
    assert_eq!(loaded.current_step, 5);
    assert_eq!(loaded.tokens_used, 500);
    assert_eq!(loaded.requests_made, 10);
    assert!((loaded.total_cost - 0.5).abs() < f64::EPSILON);
    assert_eq!(loaded.status, ContinuousTaskStatus::Running);
}

#[test]
fn test_task_persistence_update() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test.db").to_str().unwrap().to_string();

    let persistence = ExecutionStatePersistence::new(db_path).unwrap();

    // Create and save a task
    let config = create_test_config();
    let mut task = ContinuousTask::new("Test task".to_string(), config);
    persistence.save_task(&task).unwrap();

    // Update the task
    task.status = ContinuousTaskStatus::Completed;
    task.current_step = 100;
    task.finished_at = Some(Utc::now());
    persistence.save_task(&task).unwrap();

    // Load and verify
    let loaded = persistence.load_task(&task.id).unwrap().unwrap();
    assert_eq!(loaded.status, ContinuousTaskStatus::Completed);
    assert_eq!(loaded.current_step, 100);
    assert!(loaded.finished_at.is_some());
}

#[test]
fn test_task_persistence_load_nonexistent() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test.db").to_str().unwrap().to_string();

    let persistence = ExecutionStatePersistence::new(db_path).unwrap();

    // Try to load a non-existent task
    let result = persistence.load_task("nonexistent-id").unwrap();
    assert!(result.is_none());
}

#[test]
fn test_task_persistence_list_resumable() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test.db").to_str().unwrap().to_string();

    let persistence = ExecutionStatePersistence::new(db_path).unwrap();
    let config = create_test_config();

    // Create tasks with different statuses
    let mut pending = ContinuousTask::new("Pending task".to_string(), config.clone());
    pending.status = ContinuousTaskStatus::Pending;

    let mut running = ContinuousTask::new("Running task".to_string(), config.clone());
    running.status = ContinuousTaskStatus::Running;

    let mut paused = ContinuousTask::new("Paused task".to_string(), config.clone());
    paused.status = ContinuousTaskStatus::Paused;

    let mut completed = ContinuousTask::new("Completed task".to_string(), config.clone());
    completed.status = ContinuousTaskStatus::Completed;

    let mut failed = ContinuousTask::new("Failed task".to_string(), config.clone());
    failed.status = ContinuousTaskStatus::Failed;

    let mut cancelled = ContinuousTask::new("Cancelled task".to_string(), config);
    cancelled.status = ContinuousTaskStatus::Cancelled;

    persistence.save_task(&pending).unwrap();
    persistence.save_task(&running).unwrap();
    persistence.save_task(&paused).unwrap();
    persistence.save_task(&completed).unwrap();
    persistence.save_task(&failed).unwrap();
    persistence.save_task(&cancelled).unwrap();

    // Only non-terminal tasks should be resumable
    let resumable = persistence.list_resumable_tasks().unwrap();
    assert_eq!(resumable.len(), 3); // pending, running, paused

    let resumable_ids: Vec<&str> = resumable.iter().map(|t| t.id.as_str()).collect();
    assert!(resumable_ids.contains(&pending.id.as_str()));
    assert!(resumable_ids.contains(&running.id.as_str()));
    assert!(resumable_ids.contains(&paused.id.as_str()));
    assert!(!resumable_ids.contains(&completed.id.as_str()));
    assert!(!resumable_ids.contains(&failed.id.as_str()));
    assert!(!resumable_ids.contains(&cancelled.id.as_str()));
}

#[test]
fn test_checkpoint_save_and_load() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test.db").to_str().unwrap().to_string();

    let persistence = ExecutionStatePersistence::new(db_path).unwrap();

    let task_id = Uuid::new_v4().to_string();

    // Create a checkpoint
    let checkpoint = ExecutionCheckpoint {
        id: Uuid::new_v4().to_string(),
        task_id: task_id.clone(),
        step_number: 10,
        total_steps_completed: 10,
        context_json: r#"{"key": "value"}"#.to_string(),
        tool_results_json: r#"[{"result": "success"}]"#.to_string(),
        goal_json: r#""Complete the task""#.to_string(),
        metadata: HashMap::from([
            ("tokens_used".to_string(), "500".to_string()),
            ("requests_made".to_string(), "10".to_string()),
        ]),
        created_at: Utc::now(),
    };

    persistence.save_checkpoint(&checkpoint).unwrap();

    // Load it back
    let loaded = persistence
        .load_latest_checkpoint(&task_id)
        .unwrap()
        .unwrap();

    assert_eq!(loaded.id, checkpoint.id);
    assert_eq!(loaded.task_id, task_id);
    assert_eq!(loaded.step_number, 10);
    assert_eq!(loaded.total_steps_completed, 10);
    assert_eq!(loaded.context_json, r#"{"key": "value"}"#);
    assert_eq!(loaded.metadata.get("tokens_used"), Some(&"500".to_string()));
}

#[test]
fn test_checkpoint_load_latest() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test.db").to_str().unwrap().to_string();

    let persistence = ExecutionStatePersistence::new(db_path).unwrap();

    let task_id = Uuid::new_v4().to_string();

    // Create multiple checkpoints
    for step in 1..=5 {
        let checkpoint = ExecutionCheckpoint {
            id: Uuid::new_v4().to_string(),
            task_id: task_id.clone(),
            step_number: step,
            total_steps_completed: step,
            context_json: "{}".to_string(),
            tool_results_json: "[]".to_string(),
            goal_json: "\"test\"".to_string(),
            metadata: HashMap::new(),
            created_at: Utc::now(),
        };
        persistence.save_checkpoint(&checkpoint).unwrap();

        // Small delay to ensure different timestamps
        std::thread::sleep(std::time::Duration::from_millis(10));
    }

    // Should get the latest checkpoint (step 5)
    let loaded = persistence
        .load_latest_checkpoint(&task_id)
        .unwrap()
        .unwrap();
    assert_eq!(loaded.step_number, 5);
}

#[test]
fn test_checkpoint_prune() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test.db").to_str().unwrap().to_string();

    let persistence = ExecutionStatePersistence::new(db_path).unwrap();

    let task_id = Uuid::new_v4().to_string();

    // Create 10 checkpoints
    for step in 1..=10 {
        let checkpoint = ExecutionCheckpoint {
            id: Uuid::new_v4().to_string(),
            task_id: task_id.clone(),
            step_number: step,
            total_steps_completed: step,
            context_json: "{}".to_string(),
            tool_results_json: "[]".to_string(),
            goal_json: "\"test\"".to_string(),
            metadata: HashMap::new(),
            created_at: Utc::now(),
        };
        persistence.save_checkpoint(&checkpoint).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
    }

    // Prune to keep only 3
    let deleted = persistence.prune_checkpoints(&task_id, 3).unwrap();
    assert_eq!(deleted, 7);

    // Latest checkpoint should still be there
    let loaded = persistence
        .load_latest_checkpoint(&task_id)
        .unwrap()
        .unwrap();
    assert_eq!(loaded.step_number, 10);
}

#[test]
fn test_checkpoint_load_nonexistent() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test.db").to_str().unwrap().to_string();

    let persistence = ExecutionStatePersistence::new(db_path).unwrap();

    // Try to load checkpoint for non-existent task
    let result = persistence
        .load_latest_checkpoint("nonexistent-task")
        .unwrap();
    assert!(result.is_none());
}

#[test]
fn test_task_delete() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test.db").to_str().unwrap().to_string();

    let persistence = ExecutionStatePersistence::new(db_path).unwrap();

    // Create and save a task
    let config = create_test_config();
    let task = ContinuousTask::new("Test task".to_string(), config);
    let task_id = task.id.clone();
    persistence.save_task(&task).unwrap();

    // Create a checkpoint
    let checkpoint = ExecutionCheckpoint {
        id: Uuid::new_v4().to_string(),
        task_id: task_id.clone(),
        step_number: 5,
        total_steps_completed: 5,
        context_json: "{}".to_string(),
        tool_results_json: "[]".to_string(),
        goal_json: "\"test\"".to_string(),
        metadata: HashMap::new(),
        created_at: Utc::now(),
    };
    persistence.save_checkpoint(&checkpoint).unwrap();

    // Verify they exist
    assert!(persistence.load_task(&task_id).unwrap().is_some());
    assert!(persistence
        .load_latest_checkpoint(&task_id)
        .unwrap()
        .is_some());

    // Delete the task
    persistence.delete_task(&task_id).unwrap();

    // Verify they are gone
    assert!(persistence.load_task(&task_id).unwrap().is_none());
    assert!(persistence
        .load_latest_checkpoint(&task_id)
        .unwrap()
        .is_none());
}

#[test]
fn test_config_default() {
    let config = ContinuousExecutorConfig::default();

    assert_eq!(config.checkpoint_interval, 5);
    assert_eq!(config.max_consecutive_failures, 10);
    assert_eq!(config.daily_token_limit, 10_000_000);
    assert_eq!(config.daily_request_limit, 10_000);
    assert!(config.auto_resume_on_restart);
    assert_eq!(config.timezone, "UTC");
    assert!(config.deadline.is_none());
}

#[test]
fn test_daily_limit_tracker_unlimited() {
    let mut config = create_test_config();
    config.daily_token_limit = 0; // 0 = unlimited
    config.daily_request_limit = 0; // 0 = unlimited

    let tracker = DailyLimitTracker::new(&config);

    // Record massive usage
    for _ in 0..1000 {
        tracker.record_usage(1_000_000, 100.0);
    }

    // Should never be exceeded when limits are 0
    assert!(!tracker.is_limit_exceeded());
}
