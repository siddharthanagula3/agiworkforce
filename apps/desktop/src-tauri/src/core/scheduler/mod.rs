//! Proactive scheduler module for automated task execution and briefings.
//!
//! This module provides scheduling capabilities for running automated tasks,
//! generating daily briefings, and managing scheduled jobs.
//!
//! # Overview
//!
//! The scheduler module consists of:
//!
//! - **Types**: Core data structures for scheduled jobs, schedules, and actions.
//! - **Error**: Error types and result aliases for scheduler operations.
//! - **Briefing**: Daily briefing generation with calendar and email summaries.
//! - **NLP Parser**: Natural language parsing for schedule expressions.
//! - **Proactive**: Proactive scheduler for automated task execution.
//!
//! # Example
//!
//! ```ignore
//! use crate::core::scheduler::{
//!     BriefingConfig, BriefingGenerator, JobSchedule, ScheduledJob,
//! };
//! use std::sync::Arc;
//!
//! // Create a briefing generator
//! let calendar_state = Arc::new(CalendarState::new());
//! let generator = BriefingGenerator::new(calendar_state);
//!
//! // Generate a morning briefing
//! let config = BriefingConfig::default();
//! let briefing = generator.generate_briefing(&config).await?;
//! println!("{}", briefing);
//! ```

pub mod briefing;
pub mod error;
pub mod nlp_parser;
pub mod proactive;
pub mod types;
pub mod weather;

#[cfg(test)]
mod tests;

// Re-export briefing types
pub use briefing::{BriefingConfig, BriefingGenerator, EmailBrief, EmailFetcher, EmailSummary};

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

// Re-export weather types
pub use weather::{WeatherConfig, WeatherData, WeatherForecast, WeatherProvider, WeatherUnits};
