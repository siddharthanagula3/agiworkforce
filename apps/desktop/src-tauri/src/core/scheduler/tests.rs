//! Comprehensive tests for the ProactiveScheduler.
//!
//! These tests cover scheduler creation, job management, execution,
//! persistence simulation, timezone handling, and concurrent operations.

use super::error::SchedulerError;
use super::proactive::ProactiveScheduler;
use super::types::{
    CallbackAction, JobAction, JobInterval, JobSchedule, JobState,
    ScheduledJob,
};
use chrono::{Duration, Timelike, Utc};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::sleep;

// Note: Helper functions below are kept for potential future use but marked
// with #[allow(dead_code)] to avoid warnings during test compilation.

/// Helper function to create a simple test job with callback action.
#[allow(dead_code)]
fn create_callback_job(
    id: &str,
    name: &str,
    schedule: JobSchedule,
    callback: Arc<dyn Fn() + Send + Sync + 'static>,
) -> ScheduledJob {
    ScheduledJob::builder(id, name)
        .action(JobAction::Callback(CallbackAction { callback }))
        .enabled(true)
        .build_with_schedule(schedule)
}

/// Helper function to create a simple emit event job for testing.
#[allow(dead_code)]
fn create_event_job(id: &str, name: &str, schedule: JobSchedule) -> ScheduledJob {
    ScheduledJob::builder(id, name)
        .action(JobAction::EmitEvent {
            event_name: format!("{}_event", id),
            payload: serde_json::json!({"test": true}),
        })
        .enabled(true)
        .build_with_schedule(schedule)
}

/// Extension trait for ScheduledJobBuilder to support schedule parameter.
trait ScheduledJobBuilderExt {
    fn build_with_schedule(self, schedule: JobSchedule) -> ScheduledJob;
}

impl ScheduledJobBuilderExt for super::types::ScheduledJobBuilder {
    fn build_with_schedule(self, schedule: JobSchedule) -> ScheduledJob {
        match schedule {
            JobSchedule::Cron(expr) => self.cron(expr).build(),
            JobSchedule::Interval(interval) => self.interval(interval).build(),
            JobSchedule::OneShot(datetime) => {
                // For one-shot, we need to set up a cron that will fire once
                // but the actual OneShot handling is in the scheduler
                let mut job = self.interval(JobInterval::seconds(1)).build();
                job.schedule = JobSchedule::OneShot(datetime);
                job
            }
        }
    }
}

// =============================================================================
// Test 1: test_create_scheduler - verify scheduler initializes
// =============================================================================

#[tokio::test]
async fn test_create_scheduler() {
    // Test successful scheduler creation
    let scheduler = ProactiveScheduler::new().await;
    assert!(scheduler.is_ok(), "Scheduler should be created successfully");

    let scheduler = scheduler.unwrap();

    // Verify initial state
    assert!(
        !scheduler.is_running().await,
        "Scheduler should not be running initially"
    );

    // Verify jobs list is empty
    let jobs = scheduler.list_jobs().await;
    assert!(jobs.is_empty(), "Scheduler should have no jobs initially");

    // Verify history is empty
    let history = scheduler.get_history(None).await;
    assert!(
        history.is_empty(),
        "Scheduler should have no history initially"
    );
}

#[tokio::test]
async fn test_create_scheduler_multiple_instances() {
    // Verify multiple schedulers can coexist
    let scheduler1 = ProactiveScheduler::new().await.unwrap();
    let scheduler2 = ProactiveScheduler::new().await.unwrap();

    // Both should be independent
    let job = ScheduledJob::builder("test-job", "Test Job")
        .interval(JobInterval::seconds(60))
        .action(JobAction::EmitEvent {
            event_name: "test".into(),
            payload: serde_json::Value::Null,
        })
        .build();

    scheduler1.add_job(job).await.unwrap();

    assert_eq!(scheduler1.list_jobs().await.len(), 1);
    assert_eq!(
        scheduler2.list_jobs().await.len(),
        0,
        "Schedulers should be independent"
    );
}

// =============================================================================
// Test 2: test_add_cron_job - add job with cron expression
// =============================================================================

#[tokio::test]
async fn test_add_cron_job() {
    let scheduler = ProactiveScheduler::new().await.unwrap();

    // Add a job with valid cron expression (every minute)
    let job = ScheduledJob::builder("cron-job-1", "Cron Job Every Minute")
        .cron("0 * * * * *") // Every minute at second 0
        .action(JobAction::EmitEvent {
            event_name: "cron_test".into(),
            payload: serde_json::json!({"type": "cron"}),
        })
        .build();

    let result = scheduler.add_job(job).await;
    assert!(result.is_ok(), "Adding cron job should succeed");

    // Verify job was added
    let jobs = scheduler.list_jobs().await;
    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0].id, "cron-job-1");
    assert!(jobs[0].schedule_description.contains("Cron"));
}

#[tokio::test]
async fn test_add_cron_job_various_expressions() {
    let scheduler = ProactiveScheduler::new().await.unwrap();

    // Test various valid cron expressions
    let cron_expressions = vec![
        ("0 0 * * * *", "hourly"),      // Every hour
        ("0 0 0 * * *", "daily"),       // Every day at midnight
        ("0 30 9 * * *", "morning"),    // Every day at 9:30
        ("0 0 0 * * MON", "weekly"),    // Every Monday at midnight
        ("0 0 0 1 * *", "monthly"),     // First day of every month
        ("0 */5 * * * *", "every-5min"), // Every 5 minutes
    ];

    let expected_count = cron_expressions.len();

    for (expr, id) in cron_expressions {
        let job = ScheduledJob::builder(id, format!("Cron Job {}", id))
            .cron(expr)
            .action(JobAction::EmitEvent {
                event_name: "test".into(),
                payload: serde_json::Value::Null,
            })
            .build();

        let result = scheduler.add_job(job).await;
        assert!(
            result.is_ok(),
            "Adding cron job with expression '{}' should succeed",
            expr
        );
    }

    assert_eq!(scheduler.list_jobs().await.len(), expected_count);
}

#[tokio::test]
async fn test_add_cron_job_invalid_expression() {
    let scheduler = ProactiveScheduler::new().await.unwrap();
    scheduler.start().await.unwrap();

    // Note: Invalid cron expressions are caught when scheduling, not when adding
    // because the job config is stored first, then scheduled
    let job = ScheduledJob::builder("invalid-cron", "Invalid Cron Job")
        .cron("invalid cron expression")
        .action(JobAction::EmitEvent {
            event_name: "test".into(),
            payload: serde_json::Value::Null,
        })
        .build();

    // The job will be added, but scheduling will fail
    let result = scheduler.add_job(job).await;
    // With the scheduler running, invalid cron should fail to schedule
    assert!(result.is_err(), "Invalid cron expression should fail");

    scheduler.stop().await.ok();
}

// =============================================================================
// Test 3: test_add_interval_job - add job with interval
// =============================================================================

#[tokio::test]
async fn test_add_interval_job() {
    let scheduler = ProactiveScheduler::new().await.unwrap();

    // Test various interval configurations
    let intervals = vec![
        (JobInterval::seconds(30), "30-seconds"),
        (JobInterval::minutes(5), "5-minutes"),
        (JobInterval::hours(1), "1-hour"),
        (JobInterval::days(1), "1-day"),
    ];

    let expected_count = intervals.len();

    for (interval, id) in intervals {
        let job = ScheduledJob::builder(id, format!("Interval Job {}", id))
            .interval(interval)
            .action(JobAction::EmitEvent {
                event_name: "test".into(),
                payload: serde_json::Value::Null,
            })
            .build();

        let result = scheduler.add_job(job).await;
        assert!(
            result.is_ok(),
            "Adding interval job '{}' should succeed",
            id
        );
    }

    // Verify all jobs were added
    let jobs = scheduler.list_jobs().await;
    assert_eq!(jobs.len(), expected_count);

    // Verify schedule descriptions
    let summaries: HashMap<_, _> = jobs.iter().map(|j| (j.id.as_str(), &j.schedule_description)).collect();
    assert!(summaries["30-seconds"].contains("second"));
    assert!(summaries["5-minutes"].contains("minute"));
    assert!(summaries["1-hour"].contains("hour"));
    assert!(summaries["1-day"].contains("day"));
}

#[tokio::test]
async fn test_interval_job_execution() {
    let scheduler = ProactiveScheduler::new().await.unwrap();
    let counter = Arc::new(AtomicU32::new(0));
    let counter_clone = counter.clone();

    let job = ScheduledJob::builder("interval-exec", "Interval Execution Test")
        .interval(JobInterval::seconds(1))
        .action(JobAction::Callback(CallbackAction {
            callback: Arc::new(move || {
                counter_clone.fetch_add(1, Ordering::SeqCst);
            }),
        }))
        .build();

    scheduler.add_job(job).await.unwrap();
    scheduler.start().await.unwrap();

    // Wait for at least 2 executions
    sleep(std::time::Duration::from_millis(2500)).await;

    scheduler.stop().await.unwrap();

    let count = counter.load(Ordering::SeqCst);
    assert!(
        count >= 2,
        "Interval job should execute at least twice, got {}",
        count
    );
}

// =============================================================================
// Test 4: test_add_once_job - add one-time job
// =============================================================================

#[tokio::test]
async fn test_add_once_job() {
    let scheduler = ProactiveScheduler::new().await.unwrap();
    let executed = Arc::new(AtomicBool::new(false));
    let executed_clone = executed.clone();

    // Schedule job to run 500ms in the future
    let run_time = Utc::now() + Duration::milliseconds(500);

    let mut job = ScheduledJob::builder("once-job", "One-Time Job")
        .interval(JobInterval::seconds(1)) // placeholder
        .action(JobAction::Callback(CallbackAction {
            callback: Arc::new(move || {
                executed_clone.store(true, Ordering::SeqCst);
            }),
        }))
        .build();

    // Set the actual one-shot schedule
    job.schedule = JobSchedule::OneShot(run_time);

    scheduler.add_job(job).await.unwrap();
    scheduler.start().await.unwrap();

    // Wait for execution
    sleep(std::time::Duration::from_millis(1000)).await;

    let was_executed = executed.load(Ordering::SeqCst);
    assert!(was_executed, "One-shot job should have executed");

    scheduler.stop().await.unwrap();
}

#[tokio::test]
async fn test_once_job_past_time() {
    let scheduler = ProactiveScheduler::new().await.unwrap();

    // Schedule job for past time
    let past_time = Utc::now() - Duration::hours(1);

    let mut job = ScheduledJob::builder("past-once-job", "Past One-Time Job")
        .interval(JobInterval::seconds(1))
        .action(JobAction::EmitEvent {
            event_name: "test".into(),
            payload: serde_json::Value::Null,
        })
        .build();

    job.schedule = JobSchedule::OneShot(past_time);

    // Adding should succeed (validation happens at schedule time)
    scheduler.add_job(job).await.unwrap();

    // Verify next run calculation returns None for past one-shot
    let next_run = ProactiveScheduler::calculate_next_run(&JobSchedule::OneShot(past_time));
    assert!(next_run.is_none(), "Past one-shot should have no next run");
}

#[tokio::test]
async fn test_once_job_future_time() {
    let future_time = Utc::now() + Duration::hours(1);

    let next_run = ProactiveScheduler::calculate_next_run(&JobSchedule::OneShot(future_time));
    assert!(next_run.is_some(), "Future one-shot should have next run");
    assert_eq!(next_run.unwrap(), future_time);
}

// =============================================================================
// Test 5: test_remove_job - remove existing job
// =============================================================================

#[tokio::test]
async fn test_remove_job() {
    let scheduler = ProactiveScheduler::new().await.unwrap();

    // Add a job
    let job = ScheduledJob::builder("remove-test", "Remove Test Job")
        .interval(JobInterval::seconds(60))
        .action(JobAction::EmitEvent {
            event_name: "test".into(),
            payload: serde_json::Value::Null,
        })
        .build();

    scheduler.add_job(job).await.unwrap();
    assert_eq!(scheduler.list_jobs().await.len(), 1);

    // Remove the job
    let result = scheduler.remove_job("remove-test").await;
    assert!(result.is_ok(), "Removing existing job should succeed");
    assert_eq!(scheduler.list_jobs().await.len(), 0);
}

#[tokio::test]
async fn test_remove_job_not_found() {
    let scheduler = ProactiveScheduler::new().await.unwrap();

    let result = scheduler.remove_job("non-existent-job").await;
    assert!(result.is_err(), "Removing non-existent job should fail");

    match result {
        Err(SchedulerError::JobNotFound(id)) => {
            assert_eq!(id, "non-existent-job");
        }
        _ => panic!("Expected JobNotFound error"),
    }
}

#[tokio::test]
async fn test_remove_job_while_running() {
    let scheduler = ProactiveScheduler::new().await.unwrap();
    let counter = Arc::new(AtomicU32::new(0));
    let counter_clone = counter.clone();

    let job = ScheduledJob::builder("running-remove", "Running Remove Test")
        .interval(JobInterval::seconds(1))
        .action(JobAction::Callback(CallbackAction {
            callback: Arc::new(move || {
                counter_clone.fetch_add(1, Ordering::SeqCst);
            }),
        }))
        .build();

    scheduler.add_job(job).await.unwrap();
    scheduler.start().await.unwrap();

    // Wait for at least one execution
    sleep(std::time::Duration::from_millis(1500)).await;

    let count_before = counter.load(Ordering::SeqCst);
    assert!(count_before >= 1, "Job should have executed at least once");

    // Remove while running
    scheduler.remove_job("running-remove").await.unwrap();

    // Wait and verify no more executions
    sleep(std::time::Duration::from_millis(2000)).await;

    let count_after = counter.load(Ordering::SeqCst);
    // Count should not increase significantly after removal
    // (allow for one more execution that might have been in progress)
    assert!(
        count_after <= count_before + 1,
        "Job should stop executing after removal"
    );

    scheduler.stop().await.unwrap();
}

// =============================================================================
// Test 6: test_pause_resume_job - pause and resume functionality
// =============================================================================

#[tokio::test]
async fn test_pause_resume_job() {
    let scheduler = ProactiveScheduler::new().await.unwrap();

    let job = ScheduledJob::builder("pause-resume", "Pause Resume Test")
        .interval(JobInterval::seconds(60))
        .action(JobAction::EmitEvent {
            event_name: "test".into(),
            payload: serde_json::Value::Null,
        })
        .build();

    scheduler.add_job(job).await.unwrap();

    // Initially enabled
    let job_state = scheduler.get_job("pause-resume").await.unwrap();
    assert!(job_state.enabled, "Job should be enabled initially");

    // Pause the job
    scheduler.pause_job("pause-resume").await.unwrap();
    let job_state = scheduler.get_job("pause-resume").await.unwrap();
    assert!(!job_state.enabled, "Job should be disabled after pause");

    // Resume the job
    scheduler.resume_job("pause-resume").await.unwrap();
    let job_state = scheduler.get_job("pause-resume").await.unwrap();
    assert!(job_state.enabled, "Job should be enabled after resume");
}

#[tokio::test]
async fn test_pause_already_paused() {
    let scheduler = ProactiveScheduler::new().await.unwrap();

    let job = ScheduledJob::builder("double-pause", "Double Pause Test")
        .interval(JobInterval::seconds(60))
        .action(JobAction::EmitEvent {
            event_name: "test".into(),
            payload: serde_json::Value::Null,
        })
        .build();

    scheduler.add_job(job).await.unwrap();

    // Pause twice - should be idempotent
    scheduler.pause_job("double-pause").await.unwrap();
    let result = scheduler.pause_job("double-pause").await;
    assert!(result.is_ok(), "Pausing already paused job should succeed");

    let job_state = scheduler.get_job("double-pause").await.unwrap();
    assert!(!job_state.enabled);
}

#[tokio::test]
async fn test_resume_not_paused() {
    let scheduler = ProactiveScheduler::new().await.unwrap();

    let job = ScheduledJob::builder("not-paused", "Not Paused Test")
        .interval(JobInterval::seconds(60))
        .action(JobAction::EmitEvent {
            event_name: "test".into(),
            payload: serde_json::Value::Null,
        })
        .build();

    scheduler.add_job(job).await.unwrap();

    // Resume without pausing - should be idempotent
    let result = scheduler.resume_job("not-paused").await;
    assert!(result.is_ok(), "Resuming non-paused job should succeed");
}

#[tokio::test]
async fn test_pause_stops_execution() {
    let scheduler = ProactiveScheduler::new().await.unwrap();
    let counter = Arc::new(AtomicU32::new(0));
    let counter_clone = counter.clone();

    let job = ScheduledJob::builder("pause-exec", "Pause Execution Test")
        .interval(JobInterval::seconds(1))
        .action(JobAction::Callback(CallbackAction {
            callback: Arc::new(move || {
                counter_clone.fetch_add(1, Ordering::SeqCst);
            }),
        }))
        .build();

    scheduler.add_job(job).await.unwrap();
    scheduler.start().await.unwrap();

    // Wait for executions
    sleep(std::time::Duration::from_millis(2500)).await;

    let count_before_pause = counter.load(Ordering::SeqCst);
    assert!(count_before_pause >= 2, "Should have at least 2 executions");

    // Pause
    scheduler.pause_job("pause-exec").await.unwrap();

    // Wait and verify no more executions
    sleep(std::time::Duration::from_millis(2000)).await;

    let count_after_pause = counter.load(Ordering::SeqCst);
    assert!(
        count_after_pause <= count_before_pause + 1,
        "Executions should stop after pause"
    );

    // Resume and verify executions restart
    scheduler.resume_job("pause-exec").await.unwrap();
    sleep(std::time::Duration::from_millis(2500)).await;

    let count_after_resume = counter.load(Ordering::SeqCst);
    assert!(
        count_after_resume > count_after_pause,
        "Executions should restart after resume"
    );

    scheduler.stop().await.unwrap();
}

// =============================================================================
// Test 7: test_list_jobs - verify job listing
// =============================================================================

#[tokio::test]
async fn test_list_jobs() {
    let scheduler = ProactiveScheduler::new().await.unwrap();

    // Initially empty
    assert!(scheduler.list_jobs().await.is_empty());

    // Add multiple jobs
    for i in 0..5 {
        let job = ScheduledJob::builder(format!("job-{}", i), format!("Job {}", i))
            .interval(JobInterval::seconds(60 * (i + 1) as u64))
            .action(JobAction::EmitEvent {
                event_name: format!("event-{}", i),
                payload: serde_json::Value::Null,
            })
            .build();
        scheduler.add_job(job).await.unwrap();
    }

    let jobs = scheduler.list_jobs().await;
    assert_eq!(jobs.len(), 5);

    // Verify all jobs are present
    let job_ids: Vec<_> = jobs.iter().map(|j| j.id.as_str()).collect();
    for i in 0..5 {
        assert!(
            job_ids.contains(&format!("job-{}", i).as_str()),
            "Job {} should be in list",
            i
        );
    }
}

#[tokio::test]
async fn test_list_jobs_with_mixed_states() {
    let scheduler = ProactiveScheduler::new().await.unwrap();

    // Add jobs
    for i in 0..3 {
        let job = ScheduledJob::builder(format!("mixed-{}", i), format!("Mixed Job {}", i))
            .interval(JobInterval::seconds(60))
            .action(JobAction::EmitEvent {
                event_name: "test".into(),
                payload: serde_json::Value::Null,
            })
            .build();
        scheduler.add_job(job).await.unwrap();
    }

    // Pause one job
    scheduler.pause_job("mixed-1").await.unwrap();

    let jobs = scheduler.list_jobs().await;
    let paused: Vec<_> = jobs.iter().filter(|j| j.state == JobState::Paused).collect();
    let scheduled: Vec<_> = jobs.iter().filter(|j| j.state == JobState::Scheduled).collect();

    assert_eq!(paused.len(), 1);
    assert_eq!(scheduled.len(), 2);
    assert_eq!(paused[0].id, "mixed-1");
}

#[tokio::test]
async fn test_job_summary_fields() {
    let scheduler = ProactiveScheduler::new().await.unwrap();

    let job = ScheduledJob::builder("summary-test", "Summary Test Job")
        .interval(JobInterval::minutes(30))
        .action(JobAction::EmitEvent {
            event_name: "test".into(),
            payload: serde_json::Value::Null,
        })
        .build();

    scheduler.add_job(job).await.unwrap();

    let jobs = scheduler.list_jobs().await;
    assert_eq!(jobs.len(), 1);

    let summary = &jobs[0];
    assert_eq!(summary.id, "summary-test");
    assert_eq!(summary.name, "Summary Test Job");
    assert!(summary.enabled);
    assert_eq!(summary.state, JobState::Scheduled);
    assert!(summary.schedule_description.contains("30"));
    assert!(summary.schedule_description.contains("minute"));
}

// =============================================================================
// Test 8: test_job_persistence - jobs survive restart (mock db)
// =============================================================================

/// Mock database for testing persistence.
struct MockJobStore {
    jobs: Arc<RwLock<HashMap<String, ScheduledJob>>>,
}

impl MockJobStore {
    fn new() -> Self {
        Self {
            jobs: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    async fn save_job(&self, job: &ScheduledJob) {
        let mut jobs = self.jobs.write().await;
        jobs.insert(job.id.clone(), job.clone());
    }

    async fn load_jobs(&self) -> Vec<ScheduledJob> {
        let jobs = self.jobs.read().await;
        jobs.values().cloned().collect()
    }

    #[allow(dead_code)]
    async fn delete_job(&self, job_id: &str) {
        let mut jobs = self.jobs.write().await;
        jobs.remove(job_id);
    }
}

#[tokio::test]
async fn test_job_persistence_simulation() {
    let store = Arc::new(MockJobStore::new());

    // Create and save jobs with first scheduler instance
    {
        let scheduler = ProactiveScheduler::new().await.unwrap();

        let jobs_to_create = vec![
            ("persist-1", "Persistent Job 1", 60),
            ("persist-2", "Persistent Job 2", 120),
            ("persist-3", "Persistent Job 3", 180),
        ];

        for (id, name, seconds) in jobs_to_create {
            let job = ScheduledJob::builder(id, name)
                .interval(JobInterval::seconds(seconds))
                .action(JobAction::EmitEvent {
                    event_name: format!("{}_event", id),
                    payload: serde_json::json!({"persisted": true}),
                })
                .build();

            scheduler.add_job(job.clone()).await.unwrap();
            store.save_job(&job).await;
        }

        // Pause one job before "shutdown"
        scheduler.pause_job("persist-2").await.unwrap();
        let paused_job = scheduler.get_job("persist-2").await.unwrap();
        store.save_job(&paused_job).await;

        assert_eq!(scheduler.list_jobs().await.len(), 3);
    }

    // Simulate restart - create new scheduler and load jobs from store
    {
        let scheduler = ProactiveScheduler::new().await.unwrap();

        // Load jobs from mock store
        let persisted_jobs = store.load_jobs().await;
        assert_eq!(persisted_jobs.len(), 3, "Store should have 3 jobs");

        // Restore jobs to new scheduler
        for job in persisted_jobs {
            scheduler.add_job(job).await.unwrap();
        }

        let jobs = scheduler.list_jobs().await;
        assert_eq!(jobs.len(), 3, "Restored scheduler should have 3 jobs");

        // Verify paused state was preserved
        let paused_job = scheduler.get_job("persist-2").await.unwrap();
        assert!(!paused_job.enabled, "Paused state should be preserved");
    }
}

#[tokio::test]
async fn test_job_persistence_with_metadata() {
    let store = Arc::new(MockJobStore::new());

    {
        let scheduler = ProactiveScheduler::new().await.unwrap();

        let job = ScheduledJob::builder("meta-persist", "Metadata Persistence Test")
            .interval(JobInterval::hours(1))
            .action(JobAction::ExecuteWorkflow {
                workflow_id: "workflow-123".into(),
                inputs: HashMap::new(),
            })
            .metadata("custom_key", serde_json::json!("custom_value"))
            .metadata("count", serde_json::json!(42))
            .max_retries(5)
            .build();

        scheduler.add_job(job.clone()).await.unwrap();
        store.save_job(&job).await;
    }

    {
        let scheduler = ProactiveScheduler::new().await.unwrap();

        let persisted_jobs = store.load_jobs().await;
        for job in persisted_jobs {
            scheduler.add_job(job).await.unwrap();
        }

        let restored_job = scheduler.get_job("meta-persist").await.unwrap();
        assert_eq!(restored_job.max_retries, 5);
        assert_eq!(
            restored_job.metadata.get("custom_key"),
            Some(&serde_json::json!("custom_value"))
        );
        assert_eq!(
            restored_job.metadata.get("count"),
            Some(&serde_json::json!(42))
        );
    }
}

// =============================================================================
// Test 9: test_timezone_handling - jobs respect timezone
// =============================================================================

#[tokio::test]
async fn test_timezone_handling_utc() {
    // All times in the scheduler are in UTC
    // Create a cron job for a specific time
    let schedule = JobSchedule::Cron("0 0 12 * * *".to_string()); // Noon UTC

    let next_run = ProactiveScheduler::calculate_next_run(&schedule);
    assert!(next_run.is_some());

    let next = next_run.unwrap();
    assert_eq!(next.hour(), 12, "Next run should be at 12:00 UTC");
    assert_eq!(next.minute(), 0);
    assert_eq!(next.second(), 0);
}

#[tokio::test]
async fn test_timezone_cron_calculation() {
    // Test that cron expressions are evaluated correctly
    let schedules = vec![
        ("0 0 0 * * *", 0),   // Midnight
        ("0 0 6 * * *", 6),   // 6 AM
        ("0 0 12 * * *", 12), // Noon
        ("0 0 18 * * *", 18), // 6 PM
        ("0 0 23 * * *", 23), // 11 PM
    ];

    for (expr, expected_hour) in schedules {
        let schedule = JobSchedule::Cron(expr.to_string());
        let next_run = ProactiveScheduler::calculate_next_run(&schedule);
        assert!(next_run.is_some(), "Schedule {} should have next run", expr);

        let next = next_run.unwrap();
        assert_eq!(
            next.hour(),
            expected_hour,
            "Schedule {} should run at hour {}",
            expr,
            expected_hour
        );
    }
}

#[tokio::test]
async fn test_oneshot_timezone() {
    // One-shot jobs use UTC timestamps
    let target_time = Utc::now() + Duration::hours(5);

    let schedule = JobSchedule::OneShot(target_time);
    let next_run = ProactiveScheduler::calculate_next_run(&schedule);

    assert!(next_run.is_some());
    assert_eq!(next_run.unwrap(), target_time);
}

// =============================================================================
// Test 10: test_next_run_calculation - verify next run times
// =============================================================================

#[tokio::test]
async fn test_next_run_calculation_cron() {
    // Test cron schedule next run
    let schedule = JobSchedule::Cron("0 * * * * *".to_string()); // Every minute
    let now = Utc::now();

    let next_run = ProactiveScheduler::calculate_next_run(&schedule);
    assert!(next_run.is_some());

    let next = next_run.unwrap();
    // Next run should be within the next minute
    assert!(next > now);
    assert!(next <= now + Duration::minutes(1));
}

#[tokio::test]
async fn test_next_run_calculation_interval() {
    let interval_seconds = 300; // 5 minutes
    let schedule = JobSchedule::Interval(JobInterval::seconds(interval_seconds));
    let before = Utc::now();

    let next_run = ProactiveScheduler::calculate_next_run(&schedule);
    let after = Utc::now();

    assert!(next_run.is_some());

    let next = next_run.unwrap();
    // Next run should be approximately interval_seconds from now
    // Allow for small timing differences
    let expected_min = before + Duration::seconds(interval_seconds as i64 - 1);
    let expected_max = after + Duration::seconds(interval_seconds as i64 + 1);

    assert!(
        next >= expected_min && next <= expected_max,
        "Next run should be approximately {} seconds from now",
        interval_seconds
    );
}

#[tokio::test]
async fn test_next_run_calculation_oneshot_future() {
    let future_time = Utc::now() + Duration::hours(2);
    let schedule = JobSchedule::OneShot(future_time);

    let next_run = ProactiveScheduler::calculate_next_run(&schedule);
    assert!(next_run.is_some());
    assert_eq!(next_run.unwrap(), future_time);
}

#[tokio::test]
async fn test_next_run_calculation_oneshot_past() {
    let past_time = Utc::now() - Duration::hours(2);
    let schedule = JobSchedule::OneShot(past_time);

    let next_run = ProactiveScheduler::calculate_next_run(&schedule);
    assert!(next_run.is_none(), "Past one-shot should return None");
}

#[tokio::test]
async fn test_next_run_calculation_various_intervals() {
    let intervals = vec![
        (1, "1 second"),
        (60, "1 minute"),
        (3600, "1 hour"),
        (86400, "1 day"),
        (604800, "1 week"),
    ];

    for (seconds, desc) in intervals {
        let schedule = JobSchedule::Interval(JobInterval::seconds(seconds));
        let before = Utc::now();
        let next_run = ProactiveScheduler::calculate_next_run(&schedule);

        assert!(next_run.is_some(), "Interval {} should have next run", desc);

        let next = next_run.unwrap();
        let diff = (next - before).num_seconds();
        assert!(
            diff >= (seconds as i64 - 1) && diff <= (seconds as i64 + 1),
            "Interval {} should be approximately {} seconds from now, got {}",
            desc,
            seconds,
            diff
        );
    }
}

// =============================================================================
// Test 11: test_concurrent_jobs - multiple jobs running
// =============================================================================

#[tokio::test]
async fn test_concurrent_jobs() {
    let scheduler = ProactiveScheduler::new().await.unwrap();

    let counters: Vec<Arc<AtomicU32>> = (0..5).map(|_| Arc::new(AtomicU32::new(0))).collect();

    for (i, counter) in counters.iter().enumerate() {
        let counter_clone = counter.clone();
        let job = ScheduledJob::builder(format!("concurrent-{}", i), format!("Concurrent Job {}", i))
            .interval(JobInterval::seconds(1))
            .action(JobAction::Callback(CallbackAction {
                callback: Arc::new(move || {
                    counter_clone.fetch_add(1, Ordering::SeqCst);
                }),
            }))
            .build();

        scheduler.add_job(job).await.unwrap();
    }

    scheduler.start().await.unwrap();

    // Wait for executions
    sleep(std::time::Duration::from_millis(3000)).await;

    scheduler.stop().await.unwrap();

    // All jobs should have executed multiple times
    for (i, counter) in counters.iter().enumerate() {
        let count = counter.load(Ordering::SeqCst);
        assert!(
            count >= 2,
            "Concurrent job {} should have executed at least twice, got {}",
            i,
            count
        );
    }
}

#[tokio::test]
async fn test_concurrent_jobs_different_intervals() {
    let scheduler = ProactiveScheduler::new().await.unwrap();

    let counter_fast = Arc::new(AtomicU32::new(0));
    let counter_slow = Arc::new(AtomicU32::new(0));

    let fast_clone = counter_fast.clone();
    let fast_job = ScheduledJob::builder("fast-job", "Fast Job")
        .interval(JobInterval::seconds(1))
        .action(JobAction::Callback(CallbackAction {
            callback: Arc::new(move || {
                fast_clone.fetch_add(1, Ordering::SeqCst);
            }),
        }))
        .build();

    let slow_clone = counter_slow.clone();
    let slow_job = ScheduledJob::builder("slow-job", "Slow Job")
        .interval(JobInterval::seconds(2))
        .action(JobAction::Callback(CallbackAction {
            callback: Arc::new(move || {
                slow_clone.fetch_add(1, Ordering::SeqCst);
            }),
        }))
        .build();

    scheduler.add_job(fast_job).await.unwrap();
    scheduler.add_job(slow_job).await.unwrap();

    scheduler.start().await.unwrap();

    // Wait for executions (4+ seconds to see difference)
    sleep(std::time::Duration::from_millis(4500)).await;

    scheduler.stop().await.unwrap();

    let fast_count = counter_fast.load(Ordering::SeqCst);
    let slow_count = counter_slow.load(Ordering::SeqCst);

    // Fast job should run approximately twice as often as slow job
    assert!(
        fast_count > slow_count,
        "Fast job ({}) should run more than slow job ({})",
        fast_count,
        slow_count
    );
}

#[tokio::test]
async fn test_concurrent_add_remove_jobs() {
    let scheduler = Arc::new(ProactiveScheduler::new().await.unwrap());

    // Start with some initial jobs
    for i in 0..3 {
        let job = ScheduledJob::builder(format!("initial-{}", i), format!("Initial Job {}", i))
            .interval(JobInterval::seconds(1))
            .action(JobAction::EmitEvent {
                event_name: "test".into(),
                payload: serde_json::Value::Null,
            })
            .build();
        scheduler.add_job(job).await.unwrap();
    }

    scheduler.start().await.unwrap();

    // Concurrently add and remove jobs
    let scheduler_add = scheduler.clone();
    let add_handle = tokio::spawn(async move {
        for i in 0..5 {
            let job = ScheduledJob::builder(format!("added-{}", i), format!("Added Job {}", i))
                .interval(JobInterval::seconds(2))
                .action(JobAction::EmitEvent {
                    event_name: "added".into(),
                    payload: serde_json::Value::Null,
                })
                .build();
            let _ = scheduler_add.add_job(job).await;
            sleep(std::time::Duration::from_millis(100)).await;
        }
    });

    let scheduler_remove = scheduler.clone();
    let remove_handle = tokio::spawn(async move {
        sleep(std::time::Duration::from_millis(200)).await;
        for i in 0..3 {
            let _ = scheduler_remove.remove_job(&format!("initial-{}", i)).await;
            sleep(std::time::Duration::from_millis(150)).await;
        }
    });

    // Wait for both operations to complete
    let _ = tokio::join!(add_handle, remove_handle);

    // Give the scheduler a moment to stabilize
    sleep(std::time::Duration::from_millis(100)).await;

    // Verify final state - should have the 5 added jobs
    let jobs = scheduler.list_jobs().await;
    assert_eq!(jobs.len(), 5, "Should have 5 added jobs remaining");

    scheduler.stop().await.unwrap();
}

// =============================================================================
// Test 12: test_job_execution - verify job actually executes (mock action)
// =============================================================================

#[tokio::test]
async fn test_job_execution_callback() {
    let scheduler = ProactiveScheduler::new().await.unwrap();
    let executed = Arc::new(AtomicBool::new(false));

    let executed_clone = executed.clone();

    let job = ScheduledJob::builder("exec-callback", "Execution Callback Test")
        .interval(JobInterval::seconds(1))
        .action(JobAction::Callback(CallbackAction {
            callback: Arc::new(move || {
                executed_clone.store(true, Ordering::SeqCst);
            }),
        }))
        .build();

    scheduler.add_job(job).await.unwrap();
    scheduler.start().await.unwrap();

    // Wait for execution
    sleep(std::time::Duration::from_millis(1500)).await;

    assert!(
        executed.load(Ordering::SeqCst),
        "Callback should have been executed"
    );

    scheduler.stop().await.unwrap();
}

#[tokio::test]
async fn test_job_execution_with_action_handler() {
    let scheduler = ProactiveScheduler::new().await.unwrap();

    let received_actions = Arc::new(RwLock::new(Vec::<(String, String)>::new()));
    let actions_clone = received_actions.clone();

    // Set up action handler
    scheduler
        .set_action_handler(move |job_id, action| {
            let event_name = match &action {
                JobAction::EmitEvent { event_name, .. } => event_name.clone(),
                _ => "unknown".to_string(),
            };
            // Use blocking approach for the closure
            let actions = actions_clone.clone();
            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(async {
                    actions.write().await.push((job_id, event_name));
                });
            });
        })
        .await;

    let job = ScheduledJob::builder("handler-test", "Handler Test Job")
        .interval(JobInterval::seconds(1))
        .action(JobAction::EmitEvent {
            event_name: "handler_event".into(),
            payload: serde_json::json!({"handled": true}),
        })
        .build();

    scheduler.add_job(job).await.unwrap();
    scheduler.start().await.unwrap();

    // Wait for execution
    sleep(std::time::Duration::from_millis(2000)).await;

    scheduler.stop().await.unwrap();

    // Check that action handler received the action
    let actions = received_actions.read().await;
    assert!(
        !actions.is_empty(),
        "Action handler should have received at least one action"
    );
}

#[tokio::test]
async fn test_job_execution_trigger_now() {
    let scheduler = ProactiveScheduler::new().await.unwrap();
    let executed = Arc::new(AtomicBool::new(false));
    let executed_clone = executed.clone();

    let job = ScheduledJob::builder("trigger-exec", "Trigger Execution Test")
        .interval(JobInterval::hours(24)) // Won't auto-execute in test
        .action(JobAction::Callback(CallbackAction {
            callback: Arc::new(move || {
                executed_clone.store(true, Ordering::SeqCst);
            }),
        }))
        .build();

    scheduler.add_job(job).await.unwrap();

    // Trigger without starting scheduler
    let exec_id = scheduler.trigger_now("trigger-exec").await.unwrap();
    assert!(!exec_id.is_empty(), "Execution ID should be returned");

    // Wait for execution
    sleep(std::time::Duration::from_millis(200)).await;

    assert!(
        executed.load(Ordering::SeqCst),
        "Job should execute when triggered"
    );
}

#[tokio::test]
async fn test_job_execution_history_recording() {
    let scheduler = ProactiveScheduler::new().await.unwrap();

    let job = ScheduledJob::builder("history-exec", "History Execution Test")
        .interval(JobInterval::seconds(1))
        .action(JobAction::Callback(CallbackAction {
            callback: Arc::new(|| {}),
        }))
        .build();

    scheduler.add_job(job).await.unwrap();
    scheduler.start().await.unwrap();

    // Wait for multiple executions
    sleep(std::time::Duration::from_millis(3500)).await;

    scheduler.stop().await.unwrap();

    // Check execution history
    let history = scheduler.get_history(None).await;
    assert!(
        history.len() >= 3,
        "Should have at least 3 executions in history"
    );

    // Check job-specific history
    let job_history = scheduler.get_job_history("history-exec", None).await;
    assert_eq!(history.len(), job_history.len());

    // Verify execution records
    for exec in &history {
        assert_eq!(exec.job_id, "history-exec");
        assert!(exec.completed_at.is_some());
        assert!(exec.duration_ms.is_some());
        assert_eq!(exec.state, JobState::Completed);
    }
}

#[tokio::test]
async fn test_job_execution_failure_handling() {
    let scheduler = ProactiveScheduler::new().await.unwrap();

    let job = ScheduledJob::builder("failing-job", "Failing Job Test")
        .interval(JobInterval::seconds(1))
        .action(JobAction::Callback(CallbackAction {
            callback: Arc::new(|| {
                panic!("Intentional panic for testing");
            }),
        }))
        .max_retries(2)
        .build();

    scheduler.add_job(job).await.unwrap();
    scheduler.start().await.unwrap();

    // Wait for execution
    sleep(std::time::Duration::from_millis(1500)).await;

    scheduler.stop().await.unwrap();

    // Check that failure was recorded in history
    let history = scheduler.get_history(None).await;
    assert!(!history.is_empty(), "Should have execution history");

    let failed_exec = history.iter().find(|e| e.state == JobState::Failed);
    assert!(failed_exec.is_some(), "Should have recorded a failed execution");

    if let Some(exec) = failed_exec {
        assert!(exec.error.is_some(), "Failed execution should have error message");
    }
}

// =============================================================================
// Additional edge case tests
// =============================================================================

#[tokio::test]
async fn test_duplicate_job_id_rejection() {
    let scheduler = ProactiveScheduler::new().await.unwrap();

    let job1 = ScheduledJob::builder("duplicate-id", "First Job")
        .interval(JobInterval::seconds(60))
        .action(JobAction::EmitEvent {
            event_name: "test".into(),
            payload: serde_json::Value::Null,
        })
        .build();

    let job2 = ScheduledJob::builder("duplicate-id", "Second Job with Same ID")
        .interval(JobInterval::seconds(120))
        .action(JobAction::EmitEvent {
            event_name: "test2".into(),
            payload: serde_json::Value::Null,
        })
        .build();

    scheduler.add_job(job1).await.unwrap();
    let result = scheduler.add_job(job2).await;

    assert!(result.is_err(), "Adding duplicate job ID should fail");
    match result {
        Err(SchedulerError::AddJobFailed(msg)) => {
            assert!(msg.contains("duplicate-id"));
        }
        _ => panic!("Expected AddJobFailed error"),
    }
}

#[tokio::test]
async fn test_scheduler_start_stop_restart() {
    let scheduler = ProactiveScheduler::new().await.unwrap();
    let counter = Arc::new(AtomicU32::new(0));
    let counter_clone = counter.clone();

    let job = ScheduledJob::builder("restart-test", "Restart Test Job")
        .interval(JobInterval::seconds(1))
        .action(JobAction::Callback(CallbackAction {
            callback: Arc::new(move || {
                counter_clone.fetch_add(1, Ordering::SeqCst);
            }),
        }))
        .build();

    scheduler.add_job(job).await.unwrap();

    // First run
    scheduler.start().await.unwrap();
    sleep(std::time::Duration::from_millis(2500)).await;
    scheduler.stop().await.unwrap();

    let count_after_first = counter.load(Ordering::SeqCst);
    assert!(count_after_first >= 2, "Should have executions after first run");

    // Second run (restart)
    scheduler.start().await.unwrap();
    sleep(std::time::Duration::from_millis(2500)).await;
    scheduler.stop().await.unwrap();

    let count_after_second = counter.load(Ordering::SeqCst);
    assert!(
        count_after_second > count_after_first,
        "Should have more executions after restart"
    );
}

#[tokio::test]
async fn test_update_job() {
    let scheduler = ProactiveScheduler::new().await.unwrap();

    let job = ScheduledJob::builder("update-test", "Update Test Job")
        .interval(JobInterval::seconds(60))
        .action(JobAction::EmitEvent {
            event_name: "original".into(),
            payload: serde_json::Value::Null,
        })
        .build();

    scheduler.add_job(job).await.unwrap();

    // Get and modify the job
    let mut job = scheduler.get_job("update-test").await.unwrap();
    job.name = "Updated Job Name".to_string();
    job.schedule = JobSchedule::Interval(JobInterval::seconds(120));

    scheduler.update_job(job).await.unwrap();

    // Verify update
    let updated_job = scheduler.get_job("update-test").await.unwrap();
    assert_eq!(updated_job.name, "Updated Job Name");

    match updated_job.schedule {
        JobSchedule::Interval(interval) => {
            assert_eq!(interval.seconds, 120);
        }
        _ => panic!("Expected Interval schedule"),
    }
}

#[tokio::test]
async fn test_history_limit() {
    let scheduler = ProactiveScheduler::new().await.unwrap();

    let job = ScheduledJob::builder("history-limit", "History Limit Test")
        .interval(JobInterval::seconds(1))
        .action(JobAction::Callback(CallbackAction {
            callback: Arc::new(|| {}),
        }))
        .build();

    scheduler.add_job(job).await.unwrap();
    scheduler.start().await.unwrap();

    // Wait for many executions
    sleep(std::time::Duration::from_millis(5000)).await;

    scheduler.stop().await.unwrap();

    // Request limited history
    let limited_history = scheduler.get_history(Some(2)).await;
    assert_eq!(
        limited_history.len(),
        2,
        "History should be limited to requested amount"
    );

    // Request more than available
    let full_history = scheduler.get_history(None).await;
    let large_limit_history = scheduler.get_history(Some(1000)).await;
    assert_eq!(
        full_history.len(),
        large_limit_history.len(),
        "Large limit should return all available"
    );
}
