use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::api::oauth::{OAuth2Client, OAuth2Config, PkceChallenge, TokenResponse};
use crate::calendar::event_types::*;
use crate::error::{Error, Result};

const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API_BASE: &str = "https://www.googleapis.com/calendar/v3";

/// Google Calendar API scopes
const CALENDAR_READONLY_SCOPE: &str = "https://www.googleapis.com/auth/calendar.readonly";
const CALENDAR_EVENTS_SCOPE: &str = "https://www.googleapis.com/auth/calendar.events";
const CALENDAR_SCOPE: &str = "https://www.googleapis.com/auth/calendar";

/// Google Calendar client
pub struct GoogleCalendarClient {
    client: Client,
    oauth_client: OAuth2Client,
    token: Option<TokenResponse>,
}

impl GoogleCalendarClient {
    /// Create new Google Calendar client
    pub fn new(client_id: String, client_secret: String, redirect_uri: String) -> Self {
        let oauth_config = OAuth2Config {
            client_id,
            client_secret: Some(client_secret),
            auth_url: GOOGLE_AUTH_URL.to_string(),
            token_url: GOOGLE_TOKEN_URL.to_string(),
            redirect_uri,
            scopes: vec![CALENDAR_SCOPE.to_string()],
            use_pkce: true,
        };

        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        let oauth_client = OAuth2Client::new(oauth_config);

        Self {
            client,
            oauth_client,
            token: None,
        }
    }

    /// Start OAuth authorization flow
    pub fn get_authorization_url(&self, state: &str) -> (String, PkceChallenge) {
        let pkce = PkceChallenge::generate();
        let auth_url = self.oauth_client.get_authorization_url(state, Some(&pkce));
        (auth_url, pkce)
    }

    /// Complete OAuth authorization with code
    pub async fn authorize_with_code(&mut self, code: &str, code_verifier: &str) -> Result<()> {
        tracing::info!("Authorizing with Google Calendar");

        let token = self
            .oauth_client
            .exchange_code(code, Some(code_verifier))
            .await?
            .with_expiration();

        tracing::info!("Successfully authorized with Google Calendar");
        self.token = Some(token);

        Ok(())
    }

    /// Set access token directly
    pub fn set_token(&mut self, token: TokenResponse) {
        self.token = Some(token);
    }

    /// Current token snapshot
    pub fn token(&self) -> Option<TokenResponse> {
        self.token.clone()
    }

    /// Get current access token
    fn get_access_token(&self) -> Result<&str> {
        self.token
            .as_ref()
            .map(|t| t.access_token.as_str())
            .ok_or_else(|| Error::Other("Not authenticated".to_string()))
    }

    /// Refresh access token if expired
    pub async fn ensure_valid_token(&mut self) -> Result<()> {
        if let Some(token) = &self.token {
            if token.is_expired() {
                tracing::info!("Access token expired, refreshing");

                if let Some(ref refresh_token) = token.refresh_token {
                    let new_token = self
                        .oauth_client
                        .refresh_token(refresh_token)
                        .await?
                        .with_expiration();
                    self.token = Some(new_token);
                    tracing::info!("Successfully refreshed access token");
                } else {
                    return Err(Error::Other(
                        "No refresh token available, re-authentication required".to_string(),
                    ));
                }
            }
        }

        Ok(())
    }

    /// List all calendars
    pub async fn list_calendars(&mut self) -> Result<Vec<Calendar>> {
        self.ensure_valid_token().await?;

        let url = format!("{}/users/me/calendarList", GOOGLE_CALENDAR_API_BASE);
        let token = self.get_access_token()?;

        tracing::debug!("Fetching calendar list");

        let response = self.client.get(&url).bearer_auth(token).send().await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await?;
            return Err(Error::Other(format!(
                "Failed to list calendars: {} - {}",
                status, error_text
            )));
        }

        let calendar_list: GoogleCalendarListResponse = response.json().await?;

        let calendars: Vec<_> = calendar_list
            .items
            .into_iter()
            .map(|item| Calendar {
                id: item.id,
                name: item.summary,
                description: item.description,
                timezone: item.time_zone,
                is_primary: item.primary.unwrap_or(false),
                color: item.background_color,
                access_role: item.access_role,
            })
            .collect();

        tracing::debug!("Found {} calendars", calendars.len());

        Ok(calendars)
    }

    /// List events in a calendar
    pub async fn list_events(&mut self, request: ListEventsRequest) -> Result<EventListResponse> {
        self.ensure_valid_token().await?;

        let url = format!(
            "{}/calendars/{}/events",
            GOOGLE_CALENDAR_API_BASE, request.calendar_id
        );
        let token = self.get_access_token()?;

        let mut params = vec![
            ("timeMin", request.start_time.to_rfc3339()),
            ("timeMax", request.end_time.to_rfc3339()),
            ("singleEvents", "true".to_string()),
            ("orderBy", "startTime".to_string()),
        ];

        if let Some(max_results) = request.max_results {
            params.push(("maxResults", max_results.to_string()));
        }

        if let Some(show_deleted) = request.show_deleted {
            params.push(("showDeleted", show_deleted.to_string()));
        }

        tracing::debug!("Fetching events for calendar: {}", request.calendar_id);

        let response = self
            .client
            .get(&url)
            .bearer_auth(token)
            .query(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await?;
            return Err(Error::Other(format!(
                "Failed to list events: {} - {}",
                status, error_text
            )));
        }

        let events_response: GoogleEventsResponse = response.json().await?;

        let events: Vec<_> = events_response
            .items
            .into_iter()
            .map(|item| self.convert_google_event(item, &request.calendar_id))
            .collect();

        tracing::debug!("Found {} events", events.len());

        Ok(EventListResponse {
            events,
            next_page_token: events_response.next_page_token,
        })
    }

    /// Create a new event
    pub async fn create_event(&mut self, request: CreateEventRequest) -> Result<CalendarEvent> {
        self.ensure_valid_token().await?;

        let url = format!(
            "{}/calendars/{}/events",
            GOOGLE_CALENDAR_API_BASE, request.calendar_id
        );
        let token = self.get_access_token()?;

        let google_event = self.convert_to_google_event(&request);

        tracing::debug!("Creating event: {}", request.title);

        let response = self
            .client
            .post(&url)
            .bearer_auth(token)
            .json(&google_event)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await?;
            return Err(Error::Other(format!(
                "Failed to create event: {} - {}",
                status, error_text
            )));
        }

        let created_event: GoogleEvent = response.json().await?;

        tracing::info!("Successfully created event: {}", created_event.id);

        Ok(self.convert_google_event(created_event, &request.calendar_id))
    }

    /// Update an existing event
    pub async fn update_event(
        &mut self,
        calendar_id: &str,
        event_id: &str,
        request: UpdateEventRequest,
    ) -> Result<CalendarEvent> {
        self.ensure_valid_token().await?;

        let url = format!(
            "{}/calendars/{}/events/{}",
            GOOGLE_CALENDAR_API_BASE, calendar_id, event_id
        );
        let token = self.get_access_token()?;

        // First, get the existing event
        let existing_response = self.client.get(&url).bearer_auth(token).send().await?;

        if !existing_response.status().is_success() {
            return Err(Error::Other("Event not found".to_string()));
        }

        let mut google_event: GoogleEvent = existing_response.json().await?;

        // Update fields
        if let Some(title) = request.title {
            google_event.summary = title;
        }
        if let Some(description) = request.description {
            google_event.description = Some(description);
        }
        if let Some(location) = request.location {
            google_event.location = Some(location);
        }
        if let Some(start) = request.start {
            google_event.start = self.convert_to_google_datetime(&start);
        }
        if let Some(end) = request.end {
            google_event.end = self.convert_to_google_datetime(&end);
        }

        tracing::debug!("Updating event: {}", event_id);

        let response = self
            .client
            .put(&url)
            .bearer_auth(token)
            .json(&google_event)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await?;
            return Err(Error::Other(format!(
                "Failed to update event: {} - {}",
                status, error_text
            )));
        }

        let updated_event: GoogleEvent = response.json().await?;

        tracing::info!("Successfully updated event: {}", event_id);

        Ok(self.convert_google_event(updated_event, calendar_id))
    }

    /// Delete an event
    pub async fn delete_event(&mut self, calendar_id: &str, event_id: &str) -> Result<()> {
        self.ensure_valid_token().await?;

        let url = format!(
            "{}/calendars/{}/events/{}",
            GOOGLE_CALENDAR_API_BASE, calendar_id, event_id
        );
        let token = self.get_access_token()?;

        tracing::debug!("Deleting event: {}", event_id);

        let response = self.client.delete(&url).bearer_auth(token).send().await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await?;
            return Err(Error::Other(format!(
                "Failed to delete event: {} - {}",
                status, error_text
            )));
        }

        tracing::info!("Successfully deleted event: {}", event_id);

        Ok(())
    }

    /// Convert Google event to our event type
    fn convert_google_event(&self, event: GoogleEvent, calendar_id: &str) -> CalendarEvent {
        let start = self.convert_from_google_datetime(&event.start);
        let end = self.convert_from_google_datetime(&event.end);

        let attendees = event
            .attendees
            .unwrap_or_default()
            .into_iter()
            .map(|a| Attendee {
                email: a.email,
                display_name: a.display_name,
                response_status: match a.response_status.as_deref() {
                    Some("accepted") => ResponseStatus::Accepted,
                    Some("declined") => ResponseStatus::Declined,
                    Some("tentative") => ResponseStatus::Tentative,
                    _ => ResponseStatus::NeedsAction,
                },
                is_organizer: a.organizer.unwrap_or(false),
                is_optional: a.optional.unwrap_or(false),
            })
            .collect();

        let status = match event.status.as_deref() {
            Some("confirmed") => EventStatus::Confirmed,
            Some("tentative") => EventStatus::Tentative,
            Some("cancelled") => EventStatus::Cancelled,
            _ => EventStatus::Confirmed,
        };

        CalendarEvent {
            id: event.id,
            calendar_id: calendar_id.to_string(),
            title: event.summary,
            description: event.description,
            location: event.location,
            start,
            end,
            attendees,
            reminders: vec![],
            recurrence: None,
            status,
            created_at: event.created,
            updated_at: event.updated,
            html_link: Some(event.html_link),
            meeting_url: event.hangout_link,
        }
    }

    /// Convert our event to Google event format
    fn convert_to_google_event(&self, request: &CreateEventRequest) -> GoogleEventCreate {
        let attendees: Vec<GoogleAttendee> = request
            .attendees
            .iter()
            .map(|email| GoogleAttendee {
                email: email.clone(),
                display_name: None,
                organizer: None,
                optional: None,
                response_status: None,
            })
            .collect();

        GoogleEventCreate {
            summary: request.title.clone(),
            description: request.description.clone(),
            location: request.location.clone(),
            start: self.convert_to_google_datetime(&request.start),
            end: self.convert_to_google_datetime(&request.end),
            attendees: if attendees.is_empty() {
                None
            } else {
                Some(attendees)
            },
        }
    }

    fn convert_from_google_datetime(&self, dt: &GoogleDateTime) -> EventDateTime {
        if let Some(date_time) = &dt.date_time {
            EventDateTime::DateTime {
                date_time: date_time.clone(),
                timezone: dt.time_zone.clone().unwrap_or_else(|| "UTC".to_string()),
            }
        } else if let Some(date) = &dt.date {
            EventDateTime::Date { date: date.clone() }
        } else {
            EventDateTime::DateTime {
                date_time: Utc::now(),
                timezone: "UTC".to_string(),
            }
        }
    }

    fn convert_to_google_datetime(&self, dt: &EventDateTime) -> GoogleDateTime {
        match dt {
            EventDateTime::DateTime {
                date_time,
                timezone,
            } => GoogleDateTime {
                date_time: Some(date_time.clone()),
                date: None,
                time_zone: Some(timezone.clone()),
            },
            EventDateTime::Date { date } => GoogleDateTime {
                date_time: None,
                date: Some(date.clone()),
                time_zone: None,
            },
        }
    }
}

// Google API response types
#[derive(Debug, Deserialize)]
struct GoogleCalendarListResponse {
    items: Vec<GoogleCalendarItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleCalendarItem {
    id: String,
    summary: String,
    description: Option<String>,
    time_zone: String,
    primary: Option<bool>,
    background_color: Option<String>,
    access_role: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleEventsResponse {
    items: Vec<GoogleEvent>,
    next_page_token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleEvent {
    id: String,
    status: Option<String>,
    html_link: String,
    created: DateTime<Utc>,
    updated: DateTime<Utc>,
    summary: String,
    description: Option<String>,
    location: Option<String>,
    start: GoogleDateTime,
    end: GoogleDateTime,
    attendees: Option<Vec<GoogleAttendee>>,
    hangout_link: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleDateTime {
    date_time: Option<DateTime<Utc>>,
    date: Option<String>,
    time_zone: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleAttendee {
    email: String,
    display_name: Option<String>,
    organizer: Option<bool>,
    optional: Option<bool>,
    response_status: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GoogleEventCreate {
    summary: String,
    description: Option<String>,
    location: Option<String>,
    start: GoogleDateTime,
    end: GoogleDateTime,
    attendees: Option<Vec<GoogleAttendee>>,
}
