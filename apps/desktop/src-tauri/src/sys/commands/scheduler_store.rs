//! Persistence layer for the proactive scheduler.
//!
//! Stores `ScheduledJob` rows in the app's local encrypted SQLite database
//! (see `crate::data::db::encryption`): each operation opens a fresh keyed
//! connection, and the job, including its
//! nested `action_data`, is stored as a single JSON blob column rather than
//! mapped field-by-field, so it round-trips through the same
//! `Serialize`/`Deserialize` impl already used for the Tauri IPC boundary.
//!
//! Before this existed, `ProactiveScheduler` held jobs only in an in-memory
//! `RwLock<HashMap>`, so every app restart silently wiped all user-created
//! schedules.

use std::collections::HashMap;
use std::path::Path;

use rusqlite::{params, OptionalExtension};

use crate::core::scheduler::types::JobExecutionRecord;
use crate::sys::error::{Error, Result};

use super::scheduler::ScheduledJob;

/// Run history kept on disk; older runs are pruned as new ones land.
pub const MAX_PERSISTED_RUNS: usize = 500;

/// SQLite-backed store for scheduled jobs.
///
/// Each job is persisted as a single JSON blob keyed by job id. A fresh
/// connection is opened per operation; scheduler mutations (create/update/
/// delete a job, or record a run) are infrequent enough that this is not a
/// meaningful cost.
pub struct SchedulerStore {
    db_path: String,
}

impl SchedulerStore {
    pub fn new(db_path: impl AsRef<Path>) -> Self {
        Self {
            db_path: db_path.as_ref().to_string_lossy().to_string(),
        }
    }

    /// Creates the `scheduled_jobs` table if it does not already exist.
    /// Safe to call on every startup.
    pub fn init(&self) -> Result<()> {
        let conn = crate::data::db::encryption::open_keyed_connection(&self.db_path)
            .map_err(|e| Error::Generic(format!("Failed to open scheduler database: {}", e)))?;

        conn.execute_batch("PRAGMA journal_mode = WAL")
            .map_err(|e| Error::Generic(format!("Failed to set WAL mode: {}", e)))?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS scheduled_jobs (
                id TEXT PRIMARY KEY,
                job_json TEXT NOT NULL,
                updated_at_ms INTEGER NOT NULL
            )",
            [],
        )
        .map_err(|e| Error::Generic(format!("Failed to create scheduled_jobs table: {}", e)))?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS scheduled_job_runs (
                seq INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT NOT NULL,
                run_json TEXT NOT NULL
            )",
            [],
        )
        .map_err(|e| Error::Generic(format!("Failed to create scheduled_job_runs table: {}", e)))?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS scheduler_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            [],
        )
        .map_err(|e| Error::Generic(format!("Failed to create scheduler_settings table: {}", e)))?;

        Ok(())
    }

    /// Whether scheduled tasks keep the computer awake. Off until the user
    /// turns it on.
    pub fn keep_awake(&self) -> Result<bool> {
        let conn = crate::data::db::encryption::open_keyed_connection(&self.db_path)
            .map_err(|e| Error::Generic(format!("Failed to open scheduler database: {}", e)))?;
        let value: Option<String> = conn
            .query_row(
                "SELECT value FROM scheduler_settings WHERE key = 'keep_awake'",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| Error::Generic(format!("Failed to read keep-awake setting: {}", e)))?;
        Ok(value.as_deref() == Some("true"))
    }

    pub fn set_keep_awake(&self, enabled: bool) -> Result<()> {
        let conn = crate::data::db::encryption::open_keyed_connection(&self.db_path)
            .map_err(|e| Error::Generic(format!("Failed to open scheduler database: {}", e)))?;
        conn.execute(
            "INSERT INTO scheduler_settings (key, value) VALUES ('keep_awake', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![if enabled { "true" } else { "false" }],
        )
        .map_err(|e| Error::Generic(format!("Failed to save keep-awake setting: {}", e)))?;
        Ok(())
    }

    /// Appends a finished run and prunes the history to
    /// [`MAX_PERSISTED_RUNS`] rows.
    pub fn record_run(&self, run: &JobExecutionRecord) -> Result<()> {
        let conn = crate::data::db::encryption::open_keyed_connection(&self.db_path)
            .map_err(|e| Error::Generic(format!("Failed to open scheduler database: {}", e)))?;
        let run_json = serde_json::to_string(run)
            .map_err(|e| Error::Generic(format!("Failed to serialize run: {}", e)))?;

        conn.execute(
            "INSERT INTO scheduled_job_runs (job_id, run_json) VALUES (?1, ?2)",
            params![run.job_id, run_json],
        )
        .map_err(|e| {
            Error::Generic(format!("Failed to record run of job {}: {}", run.job_id, e))
        })?;
        conn.execute(
            "DELETE FROM scheduled_job_runs WHERE seq <= (SELECT MAX(seq) FROM scheduled_job_runs) - ?1",
            params![MAX_PERSISTED_RUNS as i64],
        )
        .map_err(|e| Error::Generic(format!("Failed to prune run history: {}", e)))?;

        Ok(())
    }

    /// Loads persisted runs, oldest first. Unreadable rows are skipped.
    pub fn load_runs(&self) -> Result<Vec<JobExecutionRecord>> {
        let conn = crate::data::db::encryption::open_keyed_connection(&self.db_path)
            .map_err(|e| Error::Generic(format!("Failed to open scheduler database: {}", e)))?;
        let mut stmt = conn
            .prepare("SELECT run_json FROM scheduled_job_runs ORDER BY seq ASC")
            .map_err(|e| Error::Generic(format!("Failed to prepare run query: {}", e)))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| Error::Generic(format!("Failed to query run history: {}", e)))?;

        Ok(rows
            .filter_map(|row| row.ok())
            .filter_map(|json| serde_json::from_str::<JobExecutionRecord>(&json).ok())
            .collect())
    }

    /// Loads every persisted job into memory, keyed by job id.
    ///
    /// A row that fails to deserialize (e.g. after a future schema change)
    /// is skipped with a warning rather than failing the whole load, so one
    /// corrupt row cannot brick scheduler startup.
    pub fn load_all(&self) -> Result<HashMap<String, ScheduledJob>> {
        let conn = crate::data::db::encryption::open_keyed_connection(&self.db_path)
            .map_err(|e| Error::Generic(format!("Failed to open scheduler database: {}", e)))?;

        let mut stmt = conn
            .prepare("SELECT job_json FROM scheduled_jobs")
            .map_err(|e| Error::Generic(format!("Failed to prepare job query: {}", e)))?;

        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| Error::Generic(format!("Failed to query scheduled jobs: {}", e)))?;

        let mut jobs = HashMap::new();
        for row in rows {
            let job_json = match row {
                Ok(json) => json,
                Err(e) => {
                    tracing::warn!("[SchedulerStore] Skipping unreadable job row: {}", e);
                    continue;
                }
            };
            match serde_json::from_str::<ScheduledJob>(&job_json) {
                Ok(job) => {
                    jobs.insert(job.id.clone(), job);
                }
                Err(e) => {
                    tracing::warn!("[SchedulerStore] Skipping job row with corrupt JSON: {}", e);
                }
            }
        }

        Ok(jobs)
    }

    /// Inserts or updates a job's persisted row.
    pub fn upsert_job(&self, job: &ScheduledJob) -> Result<()> {
        let conn = crate::data::db::encryption::open_keyed_connection(&self.db_path)
            .map_err(|e| Error::Generic(format!("Failed to open scheduler database: {}", e)))?;

        let job_json = serde_json::to_string(job)
            .map_err(|e| Error::Generic(format!("Failed to serialize job: {}", e)))?;
        let updated_at_ms = chrono::Utc::now().timestamp_millis();

        conn.execute(
            "INSERT INTO scheduled_jobs (id, job_json, updated_at_ms) VALUES (?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET job_json = excluded.job_json, updated_at_ms = excluded.updated_at_ms",
            params![job.id, job_json, updated_at_ms],
        )
        .map_err(|e| Error::Generic(format!("Failed to persist job {}: {}", job.id, e)))?;

        Ok(())
    }

    /// Deletes a job's persisted row, if present. Deleting an id that has
    /// no row is not an error.
    pub fn delete_job(&self, job_id: &str) -> Result<()> {
        let conn = crate::data::db::encryption::open_keyed_connection(&self.db_path)
            .map_err(|e| Error::Generic(format!("Failed to open scheduler database: {}", e)))?;

        conn.execute("DELETE FROM scheduled_jobs WHERE id = ?1", params![job_id])
            .map_err(|e| Error::Generic(format!("Failed to delete job {}: {}", job_id, e)))?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sys::commands::scheduler::{JobStatus, SchedulerActionType};

    fn temp_store() -> (tempfile::TempDir, SchedulerStore) {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("scheduler_test.db");
        let store = SchedulerStore::new(&db_path);
        store.init().unwrap();
        (dir, store)
    }

    fn sample_job(id: &str, name: &str) -> ScheduledJob {
        let mut job = ScheduledJob::new(
            name.to_string(),
            "0 0 9 * * *".to_string(),
            SchedulerActionType::Notification,
            serde_json::json!({ "message": "hi" }),
        )
        .unwrap();
        job.id = id.to_string();
        job
    }

    #[test]
    fn init_creates_table_and_load_all_starts_empty() {
        let (_dir, store) = temp_store();
        let jobs = store.load_all().unwrap();
        assert!(jobs.is_empty());
    }

    #[test]
    fn init_is_idempotent() {
        let (_dir, store) = temp_store();
        // Calling init() again (e.g. on a second launch against the same
        // file) must not error just because the table already exists.
        assert!(store.init().is_ok());
    }

    #[test]
    fn upsert_then_load_round_trips_a_job() {
        let (_dir, store) = temp_store();
        let job = sample_job("job-1", "Test Job");
        store.upsert_job(&job).unwrap();

        let jobs = store.load_all().unwrap();
        assert_eq!(jobs.len(), 1);
        let loaded = jobs.get("job-1").unwrap();
        assert_eq!(loaded.name, "Test Job");
        assert_eq!(loaded.status, JobStatus::Active);
        assert_eq!(loaded.schedule, "0 0 9 * * *");
    }

    #[test]
    fn upsert_overwrites_existing_row_for_same_id() {
        let (_dir, store) = temp_store();
        let mut job = sample_job("job-1", "Original Name");
        store.upsert_job(&job).unwrap();

        job.name = "Renamed".to_string();
        job.status = JobStatus::Paused;
        store.upsert_job(&job).unwrap();

        let jobs = store.load_all().unwrap();
        assert_eq!(jobs.len(), 1, "upsert must not create a duplicate row");
        let loaded = jobs.get("job-1").unwrap();
        assert_eq!(loaded.name, "Renamed");
        assert_eq!(loaded.status, JobStatus::Paused);
    }

    #[test]
    fn delete_removes_the_row() {
        let (_dir, store) = temp_store();
        let job = sample_job("job-1", "Test Job");
        store.upsert_job(&job).unwrap();
        store.delete_job("job-1").unwrap();

        let jobs = store.load_all().unwrap();
        assert!(jobs.is_empty());
    }

    #[test]
    fn delete_of_nonexistent_id_is_not_an_error() {
        let (_dir, store) = temp_store();
        assert!(store.delete_job("does-not-exist").is_ok());
    }

    #[test]
    fn load_all_skips_corrupt_row_without_failing() {
        let (_dir, store) = temp_store();
        let good_job = sample_job("job-good", "Good Job");
        store.upsert_job(&good_job).unwrap();

        // Insert a row with unparseable JSON directly, bypassing upsert_job,
        // to simulate a corrupted or future-schema row.
        let conn = crate::data::db::encryption::open_keyed_connection(&store.db_path).unwrap();
        conn.execute(
            "INSERT INTO scheduled_jobs (id, job_json, updated_at_ms) VALUES (?1, ?2, ?3)",
            params!["job-corrupt", "{not valid json", 0i64],
        )
        .unwrap();

        let jobs = store.load_all().unwrap();
        assert_eq!(jobs.len(), 1, "corrupt row must be skipped, not fatal");
        assert!(jobs.contains_key("job-good"));
    }

    fn sample_run(job_id: &str, id: i64) -> JobExecutionRecord {
        JobExecutionRecord {
            id,
            job_id: job_id.to_string(),
            started_at: "2026-10-10T09:00:00Z".to_string(),
            completed_at: Some("2026-10-10T09:00:02Z".to_string()),
            status: crate::core::scheduler::types::ExecutionStatus::Completed,
            error: None,
            duration_ms: Some(2_000),
            output: Some("2 files synced".to_string()),
        }
    }

    #[test]
    fn run_history_survives_reopening_the_store() {
        let (dir, store) = temp_store();
        store.record_run(&sample_run("job-1", 1)).unwrap();
        store.record_run(&sample_run("job-1", 2)).unwrap();

        let reopened = SchedulerStore::new(dir.path().join("scheduler_test.db"));
        reopened.init().unwrap();
        let runs = reopened.load_runs().unwrap();

        assert_eq!(runs.len(), 2);
        assert_eq!(runs[0].id, 1);
        assert_eq!(runs[1].id, 2);
        assert_eq!(runs[1].output.as_deref(), Some("2 files synced"));
    }

    #[test]
    fn rows_written_before_run_output_existed_still_load() {
        let (_dir, store) = temp_store();
        let job = sample_job("job-old", "Older Job");
        let mut job_json = serde_json::to_value(&job).unwrap();
        job_json.as_object_mut().unwrap().remove("lastOutput");
        job_json.as_object_mut().unwrap().remove("runMode");
        let mut run_json = serde_json::to_value(sample_run("job-old", 7)).unwrap();
        run_json.as_object_mut().unwrap().remove("output");

        let conn = crate::data::db::encryption::open_keyed_connection(&store.db_path).unwrap();
        conn.execute(
            "INSERT INTO scheduled_jobs (id, job_json, updated_at_ms) VALUES (?1, ?2, ?3)",
            params!["job-old", job_json.to_string(), 0i64],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO scheduled_job_runs (job_id, run_json) VALUES (?1, ?2)",
            params!["job-old", run_json.to_string()],
        )
        .unwrap();

        let jobs = store.load_all().unwrap();
        assert_eq!(jobs.get("job-old").unwrap().last_output, None);
        assert_eq!(
            jobs.get("job-old").unwrap().run_mode,
            crate::sys::commands::scheduler::JobRunMode::Local
        );
        let runs = store.load_runs().unwrap();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].output, None);
    }

    #[test]
    fn keep_awake_is_off_until_turned_on_and_survives_reopening() {
        let (dir, store) = temp_store();
        assert!(!store.keep_awake().unwrap());

        store.set_keep_awake(true).unwrap();
        let reopened = SchedulerStore::new(dir.path().join("scheduler_test.db"));
        reopened.init().unwrap();

        assert!(reopened.keep_awake().unwrap());
    }

    #[test]
    fn run_history_is_pruned_to_the_cap() {
        let (_dir, store) = temp_store();
        for id in 0..(MAX_PERSISTED_RUNS as i64 + 5) {
            store.record_run(&sample_run("job-1", id)).unwrap();
        }

        let runs = store.load_runs().unwrap();

        assert_eq!(runs.len(), MAX_PERSISTED_RUNS);
        assert_eq!(runs[0].id, 5);
    }

    #[test]
    fn multiple_jobs_round_trip_independently() {
        let (_dir, store) = temp_store();
        store.upsert_job(&sample_job("job-1", "First")).unwrap();
        store.upsert_job(&sample_job("job-2", "Second")).unwrap();
        store.upsert_job(&sample_job("job-3", "Third")).unwrap();

        let jobs = store.load_all().unwrap();
        assert_eq!(jobs.len(), 3);
        assert_eq!(jobs.get("job-2").unwrap().name, "Second");
    }
}
