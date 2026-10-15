//! Scheduling types and parsing.
//!
//! Schedule types and natural-language schedule parsing. The scheduler that
//! runs jobs is `sys::commands::scheduler`.
//!
//! # Overview
//!
//! The scheduler module consists of:
//!
//! - **Types**: The record of one job run and its status.
//! - **Error**: Error types and result aliases for scheduler operations.
//! - **NLP Parser**: Natural language parsing for schedule expressions.
//! - **Schedule**: The schedule a task stores, and its next run in a time zone.

pub mod error;
pub mod nlp_parser;
pub mod schedule;
pub mod types;

// Re-export error types
pub use error::{SchedulerError, SchedulerResult};

// Re-export NLP parser types
pub use nlp_parser::{parse_schedule, ParseError, ParsedSchedule};

pub use schedule::{cron_schedule, TaskSchedule};

// Re-export job run types
pub use types::{ExecutionStatus, JobExecutionRecord};
