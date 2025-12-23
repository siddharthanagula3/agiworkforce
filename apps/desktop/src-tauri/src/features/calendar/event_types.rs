use chrono::{DateTime, Utc};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CalendarProvider {
    Google,
    Outlook,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarAccount {
    pub account_id: String,
    pub provider: CalendarProvider,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub connected_at: DateTime<Utc>,
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attendee {
    pub email: String,
    pub display_name: Option<String>,
    pub response_status: ResponseStatus,
    pub is_organizer: bool,
    pub is_optional: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ResponseStatus {
    NeedsAction,
    Accepted,
    Declined,
    Tentative,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recurrence {
    pub frequency: RecurrenceFrequency,
    pub interval: u32,
    pub count: Option<u32>,
    pub until: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum RecurrenceFrequency {
    Daily,
    Weekly,
    Monthly,
    Yearly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reminder {
    pub method: ReminderMethod,
    pub minutes_before: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReminderMethod {
    Email,
    Popup,
    Notification,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum EventDateTime {
    DateTime {
        date_time: DateTime<Utc>,
        timezone: String,
    },
    Date {
        date: String,
    },
}

impl EventDateTime {
    pub fn to_local_time(&self, user_tz: Tz) -> String {
        match self {
            EventDateTime::DateTime { date_time, .. } => {
                let local_time = date_time.with_timezone(&user_tz);
                local_time.format("%Y-%m-%d %H:%M:%S %Z").to_string()
            }
            EventDateTime::Date { date } => date.clone(),
        }
    }

    pub fn is_all_day(&self) -> bool {
        matches!(self, EventDateTime::Date { .. })
    }
}

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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EventStatus {
    Confirmed,
    Tentative,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateEventRequest {
    pub calendar_id: String,
    pub title: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub start: EventDateTime,
    pub end: EventDateTime,
    pub attendees: Vec<String>,
    pub reminders: Vec<Reminder>,
    pub recurrence: Option<Recurrence>,
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListEventsRequest {
    pub calendar_id: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub max_results: Option<u32>,
    pub show_deleted: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventListResponse {
    pub events: Vec<CalendarEvent>,
    pub next_page_token: Option<String>,
}
