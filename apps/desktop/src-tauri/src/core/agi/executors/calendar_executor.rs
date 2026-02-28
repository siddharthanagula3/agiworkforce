//! Calendar operations executor.
//!
//! Handles calendar operations including creating events and listing events.
//! Supports both Google Calendar and Outlook Calendar providers through
//! the unified CalendarManager interface.

use super::{ExecutorContext, ToolExecutor};
use crate::core::agi::ExecutionContext;
use crate::features::calendar::{CreateEventRequest, EventDateTime, ListEventsRequest};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use serde_json::{json, Value};
use std::collections::HashMap;

/// Executor for calendar operations.
///
/// Provides tools for creating and listing calendar events across
/// connected Google Calendar and Outlook Calendar accounts.
pub struct CalendarExecutor;

impl CalendarExecutor {
    /// Create a new calendar executor.
    pub fn new() -> Self {
        Self
    }

    /// Parse a date/time string into EventDateTime.
    ///
    /// Supports two formats:
    /// - RFC3339 datetime with 'T' separator (e.g., "2024-01-15T10:00:00Z")
    /// - Date-only format (e.g., "2024-01-15") for all-day events
    fn parse_event_date_time(value: &str, timezone_hint: Option<&str>) -> Result<EventDateTime> {
        if value.contains('T') {
            let parsed = DateTime::parse_from_rfc3339(value)
                .map_err(|e| anyhow!("Invalid datetime '{}': {}", value, e))?
                .with_timezone(&Utc);
            Ok(EventDateTime::DateTime {
                date_time: parsed,
                timezone: timezone_hint.unwrap_or("UTC").to_string(),
            })
        } else {
            Ok(EventDateTime::Date {
                date: value.to_string(),
            })
        }
    }

    /// Parse an RFC3339 timestamp.
    fn parse_rfc3339_ts(value: &str) -> Result<DateTime<Utc>> {
        Ok(DateTime::parse_from_rfc3339(value)
            .map_err(|e| anyhow!("Invalid datetime '{}': {}", value, e))?
            .with_timezone(&Utc))
    }
}

impl Default for CalendarExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolExecutor for CalendarExecutor {
    fn tool_names(&self) -> Vec<&'static str> {
        vec!["calendar_create_event", "calendar_list_events"]
    }

    fn description(&self) -> &'static str {
        "Calendar operations executor for creating and listing events"
    }

    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
        _execution_context: &ExecutionContext,
    ) -> Result<Value> {
        match tool_name {
            "calendar_create_event" => self.execute_create_event(parameters, context).await,
            "calendar_list_events" => self.execute_list_events(parameters, context).await,
            _ => Err(anyhow!("Unknown calendar tool: {}", tool_name)),
        }
    }
}

impl CalendarExecutor {
    /// Execute calendar_create_event operation.
    ///
    /// Creates a new event in the specified calendar.
    ///
    /// # Parameters
    /// - `account_id` (required): The calendar account ID
    /// - `title` (required): Event title
    /// - `start_time` (required): Start time in RFC3339 format or date string
    /// - `end_time` (required): End time in RFC3339 format or date string
    /// - `calendar_id` (optional): Calendar ID, defaults to "primary"
    /// - `description` (optional): Event description
    /// - `location` (optional): Event location
    /// - `attendees` (optional): Array of attendee email addresses
    /// - `timezone` (optional): Default timezone for start/end
    /// - `start_timezone` (optional): Specific timezone for start time
    /// - `end_timezone` (optional): Specific timezone for end time
    async fn execute_create_event(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let account_id = parameters
            .get("account_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing 'account_id' parameter"))?;
        let title = parameters
            .get("title")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing 'title' parameter"))?;
        let start_time = parameters
            .get("start_time")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing 'start_time' parameter"))?;
        let end_time = parameters
            .get("end_time")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing 'end_time' parameter"))?;
        let calendar_id = parameters
            .get("calendar_id")
            .and_then(|v| v.as_str())
            .unwrap_or("primary");

        let Some(ref app) = context.app_handle else {
            return Err(anyhow!(
                "App handle not available for calendar event creation"
            ));
        };

        use tauri::Manager;

        let calendar_state = app.state::<crate::sys::commands::CalendarState>();

        // Get timezone hints - prefer specific timezone over general
        let start_timezone = parameters
            .get("start_timezone")
            .and_then(|v| v.as_str())
            .or_else(|| parameters.get("timezone").and_then(|v| v.as_str()));
        let end_timezone = parameters
            .get("end_timezone")
            .and_then(|v| v.as_str())
            .or_else(|| parameters.get("timezone").and_then(|v| v.as_str()));

        // Parse attendees from array of strings
        let attendees = parameters
            .get("attendees")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| item.as_str().map(|s| s.to_string()))
                    .collect::<Vec<String>>()
            })
            .unwrap_or_default();

        let request = CreateEventRequest {
            calendar_id: calendar_id.to_string(),
            title: title.to_string(),
            description: parameters
                .get("description")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            start: Self::parse_event_date_time(start_time, start_timezone)?,
            end: Self::parse_event_date_time(end_time, end_timezone)?,
            location: parameters
                .get("location")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            attendees,
            reminders: Vec::new(),
            recurrence: None,
        };

        let event = calendar_state
            .manager
            .create_event(account_id, &request)
            .await
            .map_err(|e| {
                anyhow!(
                    "Failed to create calendar event: {}. Ensure the calendar account is connected via calendar_connect.",
                    e
                )
            })?;

        tracing::info!(
            "[CalendarExecutor] Calendar event created: id={}, title={}",
            event.id,
            event.title
        );

        Ok(json!({
            "success": true,
            "event_id": event.id,
            "title": event.title,
            "start": event.start,
            "end": event.end,
            "calendar_id": calendar_id
        }))
    }

    /// Execute calendar_list_events operation.
    ///
    /// Lists events in a calendar within a time range.
    ///
    /// # Parameters
    /// - `account_id` (required): The calendar account ID
    /// - `calendar_id` (optional): Calendar ID, defaults to "primary"
    /// - `start_time` or `time_min` (optional): Start of time range (RFC3339), defaults to now
    /// - `end_time` or `time_max` (optional): End of time range (RFC3339), defaults to 7 days from start
    /// - `max_results` (optional): Maximum number of events to return
    /// - `show_deleted` (optional): Whether to include deleted events
    async fn execute_list_events(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let account_id = parameters
            .get("account_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing 'account_id' parameter"))?;

        let Some(ref app) = context.app_handle else {
            return Err(anyhow!("App handle not available for calendar list events"));
        };

        use tauri::Manager;

        let calendar_state = app.state::<crate::sys::commands::CalendarState>();

        // Support both parameter naming conventions
        let start_time = parameters
            .get("start_time")
            .or_else(|| parameters.get("time_min"))
            .and_then(|v| v.as_str());
        let end_time = parameters
            .get("end_time")
            .or_else(|| parameters.get("time_max"))
            .and_then(|v| v.as_str());

        // Parse time range with sensible defaults
        let parsed_start = match start_time {
            Some(value) => Self::parse_rfc3339_ts(value)?,
            None => Utc::now(),
        };
        let parsed_end = match end_time {
            Some(value) => Self::parse_rfc3339_ts(value)?,
            None => parsed_start + ChronoDuration::days(7),
        };

        let request = ListEventsRequest {
            calendar_id: parameters
                .get("calendar_id")
                .and_then(|v| v.as_str())
                .unwrap_or("primary")
                .to_string(),
            start_time: parsed_start,
            end_time: parsed_end,
            max_results: parameters
                .get("max_results")
                .and_then(|v| v.as_u64())
                .map(|n| n as u32),
            show_deleted: parameters.get("show_deleted").and_then(|v| v.as_bool()),
        };

        let response = calendar_state
            .manager
            .list_events(account_id, &request)
            .await
            .map_err(|e| {
                anyhow!(
                    "Failed to list calendar events: {}. Ensure the calendar account is connected via calendar_connect.",
                    e
                )
            })?;

        tracing::info!(
            "[CalendarExecutor] Listed {} calendar events for account_id={}",
            response.events.len(),
            account_id
        );

        Ok(json!({
            "success": true,
            "account_id": account_id,
            "count": response.events.len(),
            "events": serde_json::to_value(&response.events).map_err(|e| anyhow!("Failed to serialize events: {}", e))?,
            "next_page_token": response.next_page_token
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calendar_executor_tool_names() {
        let executor = CalendarExecutor::new();
        let names = executor.tool_names();

        assert!(names.contains(&"calendar_create_event"));
        assert!(names.contains(&"calendar_list_events"));
        assert_eq!(names.len(), 2);
    }

    #[test]
    fn test_calendar_executor_description() {
        let executor = CalendarExecutor::new();
        assert!(!executor.description().is_empty());
    }

    #[test]
    fn test_parse_event_date_time_datetime() {
        let result = CalendarExecutor::parse_event_date_time(
            "2024-01-15T10:00:00Z",
            Some("America/New_York"),
        );
        assert!(result.is_ok());

        if let Ok(EventDateTime::DateTime { timezone, .. }) = result {
            assert_eq!(timezone, "America/New_York");
        } else {
            panic!("Expected DateTime variant");
        }
    }

    #[test]
    fn test_parse_event_date_time_date_only() {
        let result = CalendarExecutor::parse_event_date_time("2024-01-15", None);
        assert!(result.is_ok());

        if let Ok(EventDateTime::Date { date }) = result {
            assert_eq!(date, "2024-01-15");
        } else {
            panic!("Expected Date variant");
        }
    }

    #[test]
    fn test_parse_event_date_time_default_timezone() {
        let result = CalendarExecutor::parse_event_date_time("2024-01-15T10:00:00Z", None);
        assert!(result.is_ok());

        if let Ok(EventDateTime::DateTime { timezone, .. }) = result {
            assert_eq!(timezone, "UTC");
        } else {
            panic!("Expected DateTime variant");
        }
    }

    #[test]
    fn test_parse_event_date_time_invalid() {
        let result = CalendarExecutor::parse_event_date_time("not-a-date", None);
        // Date-only format accepts any string without 'T', so this returns Date variant
        assert!(result.is_ok());

        // Invalid RFC3339 datetime should fail
        let result = CalendarExecutor::parse_event_date_time("2024-01-15Tinvalid", None);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_rfc3339_ts() {
        let result = CalendarExecutor::parse_rfc3339_ts("2024-01-15T10:00:00Z");
        assert!(result.is_ok());

        let result = CalendarExecutor::parse_rfc3339_ts("invalid");
        assert!(result.is_err());
    }

    #[test]
    fn test_default_impl() {
        let executor = CalendarExecutor::new();
        assert_eq!(executor.tool_names().len(), 2);
    }
}
