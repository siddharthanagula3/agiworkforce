use chrono::{DateTime, Utc};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};

/// Calendar provider type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CalendarProvider {
    Google,
    Outlook,
}

/// Calendar account information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarAccount {
    pub account_id: String,
    pub provider: CalendarProvider,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub connected_at: DateTime<Utc>,
}

/// Calendar information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Calendar {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub timezone: String,
    pub is_primary: bool,
    pub color: Option<String>,
    pub access_role: String,
}

/// Event attendee
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attendee {
    pub email: String,
    pub display_name: Option<String>,
    pub response_status: ResponseStatus,
    pub is_organizer: bool,
    pub is_optional: bool,
}

/// Attendee response status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ResponseStatus {
    NeedsAction,
    Accepted,
    Declined,
    Tentative,
}

/// Event recurrence rule (simplified)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recurrence {
    pub frequency: RecurrenceFrequency,
    pub interval: u32,
    pub count: Option<u32>,
    pub until: Option<DateTime<Utc>>,
}

/// Recurrence frequency
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum RecurrenceFrequency {
    Daily,
    Weekly,
    Monthly,
    Yearly,
}

/// Event reminder
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reminder {
    pub method: ReminderMethod,
    pub minutes_before: u32,
}

/// Reminder method
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReminderMethod {
    Email,
    Popup,
    Notification,
}

/// Event date/time (can be date-only or date-time)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum EventDateTime {
    DateTime {
        date_time: DateTime<Utc>,
        timezone: String,
    },
    Date {
        date: String, // YYYY-MM-DD format
    },
}

impl EventDateTime {
    /// Convert to user's local timezone
    pub fn to_local_time(&self, user_tz: Tz) -> String {
        match self {
            EventDateTime::DateTime { date_time, .. } => {
                let local_time = date_time.with_timezone(&user_tz);
                local_time.format("%Y-%m-%d %H:%M:%S %Z").to_string()
            }
            EventDateTime::Date { date } => date.clone(),
        }
    }

    /// Check if this is an all-day event
    pub fn is_all_day(&self) -> bool {
        matches!(self, EventDateTime::Date { .. })
    }
}

/// Calendar event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarEvent {
    pub id: String,
    pub calendar_id: String,
    pub title: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub start: EventDateTime,
    pub end: EventDateTime,
    pub attendees: Vec<Attendee>,
    pub reminders: Vec<Reminder>,
    pub recurrence: Option<Recurrence>,
    pub status: EventStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub html_link: Option<String>,
    pub meeting_url: Option<String>,
}

/// Event status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EventStatus {
    Confirmed,
    Tentative,
    Cancelled,
}

/// Request to create a new event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateEventRequest {
    pub calendar_id: String,
    pub title: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub start: EventDateTime,
    pub end: EventDateTime,
    pub attendees: Vec<String>, // Email addresses
    pub reminders: Vec<Reminder>,
    pub recurrence: Option<Recurrence>,
}

/// Request to update an existing event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateEventRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub location: Option<String>,
    pub start: Option<EventDateTime>,
    pub end: Option<EventDateTime>,
    pub attendees: Option<Vec<String>>,
    pub reminders: Option<Vec<Reminder>>,
    pub status: Option<EventStatus>,
}

/// Event list query parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListEventsRequest {
    pub calendar_id: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub max_results: Option<u32>,
    pub show_deleted: Option<bool>,
}

/// Paginated event list response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventListResponse {
    pub events: Vec<CalendarEvent>,
    pub next_page_token: Option<String>,
}
