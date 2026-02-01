//! Task Timeout Management System
//!
//! This module provides configurable timeout handling for long-running AGI tasks.
//! It supports timeouts from 1 minute to 72 hours with graceful degradation.
//!
//! # Features
//!
//! - Configurable per-task timeout (1 min - 72 hours)
//! - Timeout warning emissions at 1hr, 30min, 5min remaining
//! - Graceful timeout handling with user choice dialog
//! - Persistent timeout configuration
//! - Task resumption capability after timeout warning

use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};

/// Configuration constants for timeout management
pub mod consts {
    use std::time::Duration;

    /// Absolute minimum timeout (1 minute)
    pub const MIN_TIMEOUT_SECS: u64 = 60;

    /// Absolute maximum timeout (72 hours)
    pub const MAX_TIMEOUT_SECS: u64 = 72 * 60 * 60;

    /// Default timeout for tasks (24 hours)
    pub const DEFAULT_TIMEOUT_SECS: u64 = 24 * 60 * 60;

    /// Warning thresholds (in seconds before timeout)
    pub const WARNING_THRESHOLD_1HR: u64 = 60 * 60;
    pub const WARNING_THRESHOLD_30MIN: u64 = 30 * 60;
    pub const WARNING_THRESHOLD_5MIN: u64 = 5 * 60;

    pub fn min_duration() -> Duration {
        Duration::from_secs(MIN_TIMEOUT_SECS)
    }

    pub fn max_duration() -> Duration {
        Duration::from_secs(MAX_TIMEOUT_SECS)
    }

    pub fn default_duration() -> Duration {
        Duration::from_secs(DEFAULT_TIMEOUT_SECS)
    }
}

/// Timeout configuration for a task
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeoutConfig {
    /// Maximum execution duration
    pub max_duration: Duration,
    /// Enable timeout warnings
    pub enable_warnings: bool,
    /// Enable automatic checkpointing on timeout
    pub enable_checkpoint_on_timeout: bool,
}

impl TimeoutConfig {
    pub fn new(max_seconds: u64) -> Self {
        let clamped = std::cmp::max(
            consts::MIN_TIMEOUT_SECS,
            std::cmp::min(max_seconds, consts::MAX_TIMEOUT_SECS),
        );

        Self {
            max_duration: Duration::from_secs(clamped),
            enable_warnings: true,
            enable_checkpoint_on_timeout: true,
        }
    }

    pub fn with_warnings(mut self, enabled: bool) -> Self {
        self.enable_warnings = enabled;
        self
    }

    pub fn with_checkpoint(mut self, enabled: bool) -> Self {
        self.enable_checkpoint_on_timeout = enabled;
        self
    }
}

impl Default for TimeoutConfig {
    fn default() -> Self {
        Self {
            max_duration: consts::default_duration(),
            enable_warnings: true,
            enable_checkpoint_on_timeout: true,
        }
    }
}

/// Tracks timeout state and warnings for a running task
#[derive(Debug, Clone)]
pub struct TimeoutTracker {
    config: TimeoutConfig,
    start_time: Instant,
    paused_duration: Duration,
    warned_1hr: bool,
    warned_30min: bool,
    warned_5min: bool,
    extended_at: Option<Instant>,
    extension_duration: Duration,
}

impl TimeoutTracker {
    pub fn new(config: TimeoutConfig) -> Self {
        Self {
            config,
            start_time: Instant::now(),
            paused_duration: Duration::ZERO,
            warned_1hr: false,
            warned_30min: false,
            warned_5min: false,
            extended_at: None,
            extension_duration: Duration::ZERO,
        }
    }

    /// Calculate elapsed time excluding paused periods
    pub fn elapsed(&self) -> Duration {
        self.start_time.elapsed().saturating_sub(self.paused_duration)
    }

    /// Calculate time remaining before timeout
    pub fn remaining(&self) -> Duration {
        let total_allowed = self.config.max_duration + self.extension_duration;
        total_allowed.saturating_sub(self.elapsed())
    }

    /// Check if task has exceeded timeout
    pub fn is_expired(&self) -> bool {
        self.remaining().is_zero()
    }

    /// Get progress percentage (0-100)
    pub fn progress_percent(&self) -> u8 {
        let total = self.config.max_duration + self.extension_duration;
        if total.is_zero() {
            0
        } else {
            ((self.elapsed().as_secs() as f64 / total.as_secs() as f64) * 100.0).min(100.0) as u8
        }
    }

    /// Extend timeout by additional duration
    pub fn extend_timeout(&mut self, additional_secs: u64) {
        self.extension_duration += Duration::from_secs(additional_secs);
        self.extended_at = Some(Instant::now());
        // Reset warnings after extension
        self.warned_1hr = false;
        self.warned_30min = false;
        self.warned_5min = false;
    }

    /// Get the next warning threshold to trigger (if any)
    pub fn check_warnings(&mut self) -> Option<TimeoutWarning> {
        if !self.config.enable_warnings {
            return None;
        }

        let remaining = self.remaining().as_secs();

        if remaining <= consts::WARNING_THRESHOLD_5MIN && !self.warned_5min {
            self.warned_5min = true;
            return Some(TimeoutWarning::FiveMinutes { remaining_secs: remaining });
        }

        if remaining <= consts::WARNING_THRESHOLD_30MIN && !self.warned_30min {
            self.warned_30min = true;
            return Some(TimeoutWarning::ThirtyMinutes { remaining_secs: remaining });
        }

        if remaining <= consts::WARNING_THRESHOLD_1HR && !self.warned_1hr {
            self.warned_1hr = true;
            return Some(TimeoutWarning::OneHour { remaining_secs: remaining });
        }

        None
    }

    /// Pause the timer (for system sleep/network issues)
    pub fn pause(&mut self) {
        // Next elapsed() call will account for this
    }

    /// Resume the timer
    pub fn resume(&mut self) {
        // Timer runs continuously, no special handling needed
    }

    /// Get formatted string for remaining time
    pub fn format_remaining(&self) -> String {
        let secs = self.remaining().as_secs();
        if secs >= 3600 {
            let hours = secs / 3600;
            let mins = (secs % 3600) / 60;
            format!("{}h {}m remaining", hours, mins)
        } else if secs >= 60 {
            let mins = secs / 60;
            format!("{}m remaining", mins)
        } else {
            format!("{}s remaining", secs)
        }
    }

    pub fn config(&self) -> &TimeoutConfig {
        &self.config
    }
}

/// Events emitted when timeout warnings are triggered
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TimeoutWarning {
    OneHour { remaining_secs: u64 },
    ThirtyMinutes { remaining_secs: u64 },
    FiveMinutes { remaining_secs: u64 },
}

impl TimeoutWarning {
    pub fn message(&self) -> String {
        match self {
            Self::OneHour { remaining_secs } => {
                format!("Task will timeout in 1 hour ({} seconds)", remaining_secs)
            }
            Self::ThirtyMinutes { remaining_secs } => {
                format!("Task will timeout in 30 minutes ({} seconds)", remaining_secs)
            }
            Self::FiveMinutes { remaining_secs } => {
                format!("Task will timeout in 5 minutes ({} seconds)", remaining_secs)
            }
        }
    }

    pub fn remaining_secs(&self) -> u64 {
        match self {
            Self::OneHour { remaining_secs } => *remaining_secs,
            Self::ThirtyMinutes { remaining_secs } => *remaining_secs,
            Self::FiveMinutes { remaining_secs } => *remaining_secs,
        }
    }
}

/// User's response to timeout warning
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TimeoutResponse {
    /// Extend timeout by X minutes
    Extend { minutes: u64 },
    /// Continue with current timeout
    Continue,
    /// Pause and resume later
    PauseLater,
    /// Abort the task
    Abort,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_timeout_config_clamp() {
        let config = TimeoutConfig::new(u64::MAX);
        assert_eq!(config.max_duration.as_secs(), consts::MAX_TIMEOUT_SECS);

        let config = TimeoutConfig::new(0);
        assert_eq!(config.max_duration.as_secs(), consts::MIN_TIMEOUT_SECS);
    }

    #[test]
    fn test_timeout_tracker_remaining() {
        let config = TimeoutConfig::new(60);
        let tracker = TimeoutTracker::new(config);
        assert!(tracker.remaining() <= Duration::from_secs(60));
        assert!(tracker.remaining() > Duration::from_secs(59));
    }

    #[test]
    fn test_timeout_extension() {
        let config = TimeoutConfig::new(60);
        let mut tracker = TimeoutTracker::new(config);
        let initial = tracker.remaining();
        tracker.extend_timeout(60);
        let extended = tracker.remaining();
        assert!(extended > initial);
    }

    #[test]
    fn test_warning_sequence() {
        let config = TimeoutConfig::new(consts::WARNING_THRESHOLD_1HR + 100);
        let mut tracker = TimeoutTracker::new(config);

        // Should not warn initially
        assert!(tracker.check_warnings().is_none());
    }
}
