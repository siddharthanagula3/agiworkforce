//! Proactive scheduler module for automated task execution.
//!
//! This module provides scheduling capabilities for running automated tasks
//! and managing scheduled jobs.
//!
//! # Overview
//!
//! The scheduler module consists of:
//!
//! - **Types**: Core data structures for scheduled jobs, schedules, and actions.
//! - **Error**: Error types and result aliases for scheduler operations.
//! - **NLP Parser**: Natural language parsing for schedule expressions.
//! - **Proactive**: Proactive scheduler for automated task execution.

pub mod error;
pub mod nlp_parser;
pub mod proactive;
pub mod types;

#[cfg(test)]
mod tests;

// Re-export error types
pub use error::{SchedulerError, SchedulerResult};

// Re-export NLP parser types
pub use nlp_parser::{parse_schedule, ParseError, ParsedSchedule};

// Re-export proactive scheduler
pub use proactive::{ActionHandler, ProactiveScheduler};

// Re-export job types
pub use types::{
    CallbackAction, ExecutionStatus, JobAction, JobExecution, JobExecutionRecord, JobInterval,
    JobSchedule, JobState, JobSummary, ScheduledJob, ScheduledJobBuilder,
};
