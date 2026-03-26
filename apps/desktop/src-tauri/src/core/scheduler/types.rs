//! Type definitions for the proactive scheduler module.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Represents a scheduled job configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledJob {
    /// Unique identifier for the job.
    pub id: String,

    /// Human-readable name for the job.
    pub name: String,

    /// The schedule configuration for when this job should run.
    pub schedule: JobSchedule,

    /// The action to execute when the job triggers.
    pub action: JobAction,

    /// Whether the job is currently enabled.
    pub enabled: bool,

    /// Timestamp of the last successful run (if any).
    #[serde(rename = "lastExecutedAt", alias = "lastRun")]
    pub last_run: Option<DateTime<Utc>>,

    /// Timestamp of the next scheduled run (if enabled).
    #[serde(rename = "nextExecutionAt", alias = "nextRun")]
    pub next_run: Option<DateTime<Utc>>,

    /// Optional metadata associated with this job.
    #[serde(default)]
    pub metadata: HashMap<String, serde_json::Value>,

    /// Maximum number of retry attempts on failure.
    #[serde(default = "default_max_retries")]
    pub max_retries: u32,

    /// Current retry count (resets on success).
    #[serde(default)]
    pub retry_count: u32,

    /// Timestamp when this job was created.
    pub created_at: DateTime<Utc>,

    /// Timestamp when this job was last modified.
    pub updated_at: DateTime<Utc>,
}

fn default_max_retries() -> u32 {
    3
}

impl ScheduledJob {
    /// Creates a new scheduled job with the given parameters.
    pub fn new(id: String, name: String, schedule: JobSchedule, action: JobAction) -> Self {
        let now = Utc::now();
        Self {
            id,
            name,
            schedule,
            action,
            enabled: true,
            last_run: None,
            next_run: None,
            metadata: HashMap::new(),
            max_retries: default_max_retries(),
            retry_count: 0,
            created_at: now,
            updated_at: now,
        }
    }

    /// Creates a builder for constructing a scheduled job.
    pub fn builder(id: impl Into<String>, name: impl Into<String>) -> ScheduledJobBuilder {
        ScheduledJobBuilder::new(id, name)
    }
}

/// Builder for creating scheduled jobs with a fluent API.
pub struct ScheduledJobBuilder {
    id: String,
    name: String,
    schedule: Option<JobSchedule>,
    action: Option<JobAction>,
    enabled: bool,
    metadata: HashMap<String, serde_json::Value>,
    max_retries: u32,
}

impl ScheduledJobBuilder {
    /// Creates a new builder with required id and name.
    pub fn new(id: impl Into<String>, name: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            schedule: None,
            action: None,
            enabled: true,
            metadata: HashMap::new(),
            max_retries: default_max_retries(),
        }
    }

    /// Sets the job schedule using a cron expression.
    pub fn cron(mut self, cron_expr: impl Into<String>) -> Self {
        self.schedule = Some(JobSchedule::Cron(cron_expr.into()));
        self
    }

    /// Sets the job schedule using a fixed interval.
    pub fn interval(mut self, interval: JobInterval) -> Self {
        self.schedule = Some(JobSchedule::Interval(interval));
        self
    }

    /// Sets the job action.
    pub fn action(mut self, action: JobAction) -> Self {
        self.action = Some(action);
        self
    }

    /// Sets whether the job is enabled.
    pub fn enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }

    /// Adds metadata to the job.
    pub fn metadata(mut self, key: impl Into<String>, value: serde_json::Value) -> Self {
        self.metadata.insert(key.into(), value);
        self
    }

    /// Sets the maximum number of retries.
    pub fn max_retries(mut self, max_retries: u32) -> Self {
        self.max_retries = max_retries;
        self
    }

    /// Builds the scheduled job.
    /// Returns Result with error if required fields are missing.
    pub fn build(self) -> Result<ScheduledJob, &'static str> {
        let now = Utc::now();
        Ok(ScheduledJob {
            id: self.id,
            name: self.name,
            schedule: self.schedule.ok_or("Schedule is required")?,
            action: self.action.ok_or("Action is required")?,
            enabled: self.enabled,
            last_run: None,
            next_run: None,
            metadata: self.metadata,
            max_retries: self.max_retries,
            retry_count: 0,
            created_at: now,
            updated_at: now,
        })
    }

    /// Attempts to build the scheduled job, returning an error if required fields are missing.
    pub fn try_build(self) -> Result<ScheduledJob, &'static str> {
        let schedule = self.schedule.ok_or("Schedule is required")?;
        let action = self.action.ok_or("Action is required")?;

        let now = Utc::now();
        Ok(ScheduledJob {
            id: self.id,
            name: self.name,
            schedule,
            action,
            enabled: self.enabled,
            last_run: None,
            next_run: None,
            metadata: self.metadata,
            max_retries: self.max_retries,
            retry_count: 0,
            created_at: now,
            updated_at: now,
        })
    }
}

/// Defines when a job should be scheduled to run.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum JobSchedule {
    /// Cron-based scheduling using a cron expression.
    /// Format: "sec min hour day month weekday year" (extended cron)
    Cron(String),

    /// Fixed interval scheduling.
    Interval(JobInterval),

    /// Run once at a specific time.
    OneShot(DateTime<Utc>),
}

/// Interval-based schedule configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobInterval {
    /// Number of seconds between runs.
    pub seconds: u64,
}

impl JobInterval {
    /// Creates an interval of the specified seconds.
    pub fn seconds(seconds: u64) -> Self {
        Self { seconds }
    }

    /// Creates an interval of the specified minutes.
    pub fn minutes(minutes: u64) -> Self {
        Self {
            seconds: minutes * 60,
        }
    }

    /// Creates an interval of the specified hours.
    pub fn hours(hours: u64) -> Self {
        Self {
            seconds: hours * 3600,
        }
    }

    /// Creates an interval of the specified days.
    pub fn days(days: u64) -> Self {
        Self {
            seconds: days * 86400,
        }
    }
}

/// The action to execute when a scheduled job triggers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum JobAction {
    /// Execute an AGI workflow by ID.
    ExecuteWorkflow {
        /// The workflow ID to execute.
        #[serde(rename = "workflowId")]
        workflow_id: String,
        /// Optional input parameters for the workflow.
        #[serde(default)]
        inputs: HashMap<String, serde_json::Value>,
    },

    /// Send a message to the AGI for processing.
    SendAgiMessage {
        /// The message to send.
        message: String,
        /// Optional conversation ID to continue.
        #[serde(rename = "conversationId")]
        conversation_id: Option<String>,
    },

    /// Execute an MCP tool.
    ExecuteMcpTool {
        /// The server name.
        #[serde(rename = "serverName")]
        server_name: String,
        /// The tool name.
        #[serde(rename = "toolName")]
        tool_name: String,
        /// Tool arguments.
        #[serde(default)]
        arguments: HashMap<String, serde_json::Value>,
    },

    /// Run a system command.
    RunCommand {
        /// The command to execute.
        command: String,
        /// Command arguments.
        #[serde(default)]
        args: Vec<String>,
        /// Working directory for the command.
        #[serde(rename = "workingDir")]
        working_dir: Option<String>,
    },

    /// Emit a custom event.
    EmitEvent {
        /// Event name.
        #[serde(rename = "eventName")]
        event_name: String,
        /// Event payload.
        #[serde(default)]
        payload: serde_json::Value,
    },

    /// Run memory summarization (daily batch synthesis of conversations into long-term memory).
    #[allow(dead_code)]
    RunMemorySummarization {
        /// Maximum number of conversations to summarize per run.
        #[serde(rename = "maxConversations")]
        max_conversations: Option<usize>,
    },

    /// Run memory decay (weekly importance decay on stale memories).
    #[allow(dead_code)]
    RunMemoryDecay,

    /// Execute a custom callback (internal use).
    #[serde(skip)]
    Callback(CallbackAction),
}

/// A callback action that holds a function to execute.
#[derive(Clone)]
pub struct CallbackAction {
    /// The callback function to execute.
    pub callback: std::sync::Arc<dyn Fn() + Send + Sync + 'static>,
}

impl std::fmt::Debug for CallbackAction {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CallbackAction")
            .field("callback", &"<fn>")
            .finish()
    }
}

/// Represents the current state of a job.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum JobState {
    /// Job is scheduled and will run at the next scheduled time.
    Scheduled,
    /// Job is currently running.
    Running,
    /// Job is paused and will not run until resumed.
    Paused,
    /// Job completed successfully.
    Completed,
    /// Job failed with an error.
    Failed,
    /// Job has been cancelled.
    Cancelled,
}

/// Information about a job's execution history.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobExecution {
    /// Unique ID for this execution.
    pub execution_id: String,
    /// ID of the job that was executed.
    pub job_id: String,
    /// When the execution started.
    pub started_at: DateTime<Utc>,
    /// When the execution completed (if finished).
    pub completed_at: Option<DateTime<Utc>>,
    /// The result state of the execution.
    pub state: JobState,
    /// Error message if the execution failed.
    pub error: Option<String>,
    /// Duration of the execution in milliseconds.
    pub duration_ms: Option<u64>,
}

/// Summary information about a job for listing purposes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobSummary {
    /// Job ID.
    pub id: String,
    /// Job name.
    pub name: String,
    /// Current state of the job.
    pub state: JobState,
    /// Whether the job is enabled.
    pub enabled: bool,
    /// Last run timestamp.
    #[serde(rename = "lastExecutedAt", alias = "lastRun")]
    pub last_run: Option<DateTime<Utc>>,
    /// Next scheduled run.
    #[serde(rename = "nextExecutionAt", alias = "nextRun")]
    pub next_run: Option<DateTime<Utc>>,
    /// Schedule description.
    pub schedule_description: String,
}

/// Record of a job execution persisted to the database.
///
/// This differs from `JobExecution` in that it uses database-friendly types
/// (i64 for ID, String for timestamps) and is designed for persistence.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobExecutionRecord {
    /// Unique database ID for this execution record.
    pub id: i64,
    /// ID of the job that was executed.
    pub job_id: String,
    /// When the execution started (ISO 8601 format).
    pub started_at: String,
    /// When the execution completed (ISO 8601 format), if finished.
    pub completed_at: Option<String>,
    /// The status of this execution.
    pub status: ExecutionStatus,
    /// Error message if the execution failed.
    pub error: Option<String>,
    /// Duration of the execution in milliseconds.
    pub duration_ms: Option<i64>,
}

/// Status of a job execution.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ExecutionStatus {
    /// Execution is currently running.
    Running,
    /// Execution completed successfully.
    Completed,
    /// Execution failed with an error.
    Failed,
    /// Execution was cancelled before completion.
    Cancelled,
}

impl From<&ScheduledJob> for JobSummary {
    fn from(job: &ScheduledJob) -> Self {
        let schedule_description = match &job.schedule {
            JobSchedule::Cron(expr) => format!("Cron: {}", expr),
            JobSchedule::Interval(interval) => {
                if interval.seconds >= 86400 {
                    format!("Every {} day(s)", interval.seconds / 86400)
                } else if interval.seconds >= 3600 {
                    format!("Every {} hour(s)", interval.seconds / 3600)
                } else if interval.seconds >= 60 {
                    format!("Every {} minute(s)", interval.seconds / 60)
                } else {
                    format!("Every {} second(s)", interval.seconds)
                }
            }
            JobSchedule::OneShot(time) => format!("Once at {}", time.format("%Y-%m-%d %H:%M:%S")),
        };

        let state = if job.enabled {
            JobState::Scheduled
        } else {
            JobState::Paused
        };

        Self {
            id: job.id.clone(),
            name: job.name.clone(),
            state,
            enabled: job.enabled,
            last_run: job.last_run,
            next_run: job.next_run,
            schedule_description,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    #[test]
    fn scheduled_job_serializes_canonical_execution_fields() {
        let timestamp = Utc::now();
        let job = ScheduledJob {
            id: "job-1".to_string(),
            name: "Test job".to_string(),
            schedule: JobSchedule::Interval(JobInterval::minutes(5)),
            action: JobAction::EmitEvent {
                event_name: "scheduler:test".to_string(),
                payload: serde_json::json!({ "message": "world" }),
            },
            enabled: true,
            last_run: Some(timestamp),
            next_run: Some(timestamp),
            metadata: HashMap::new(),
            max_retries: 3,
            retry_count: 0,
            created_at: timestamp,
            updated_at: timestamp,
        };

        let value = serde_json::to_value(&job).expect("job should serialize");
        assert_eq!(value["lastExecutedAt"], serde_json::json!(timestamp));
        assert_eq!(value["nextExecutionAt"], serde_json::json!(timestamp));
        assert!(value.get("lastRun").is_none());
        assert!(value.get("nextRun").is_none());
    }

    #[test]
    fn scheduled_job_deserializes_legacy_execution_fields() {
        let payload = serde_json::json!({
            "id": "job-1",
            "name": "Legacy job",
            "schedule": { "type": "interval", "seconds": 60 },
            "action": { "type": "emitEvent", "eventName": "scheduler:test", "payload": { "message": "world" } },
            "enabled": true,
            "lastRun": "2026-03-20T12:00:00Z",
            "nextRun": "2026-03-20T13:00:00Z",
            "metadata": {},
            "maxRetries": 3,
            "retryCount": 0,
            "createdAt": "2026-03-20T11:00:00Z",
            "updatedAt": "2026-03-20T11:00:00Z"
        });

        let job: ScheduledJob =
            serde_json::from_value(payload).expect("legacy payload should deserialize");
        assert!(job.last_run.is_some());
        assert!(job.next_run.is_some());
    }
}
