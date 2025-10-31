use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::api::oauth::{OAuth2Client, OAuth2Config, PkceChallenge, TokenResponse};
use crate::calendar::event_types::*;
use crate::error::{Error, Result};

const MICROSOFT_AUTH_URL: &str = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MICROSOFT_TOKEN_URL: &str = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_API_BASE: &str = "https://graph.microsoft.com/v1.0";

/// Microsoft Graph API scopes for calendar access
const CALENDAR_READ_SCOPE: &str = "Calendars.Read";
const CALENDAR_READWRITE_SCOPE: &str = "Calendars.ReadWrite";
const USER_READ_SCOPE: &str = "User.Read";

/// Outlook Calendar client (using Microsoft Graph API)
pub struct OutlookCalendarClient {
    client: Client,
    oauth_client: OAuth2Client,
    token: Option<TokenResponse>,
}

impl OutlookCalendarClient {
    /// Create new Outlook Calendar client
    pub fn new(client_id: String, client_secret: String, redirect_uri: String) -> Self {
        let oauth_config = OAuth2Config {
            client_id,
            client_secret: Some(client_secret),
            auth_url: MICROSOFT_AUTH_URL.to_string(),
            token_url: MICROSOFT_TOKEN_URL.to_string(),
            redirect_uri,
            scopes: vec![
                USER_READ_SCOPE.to_string(),
                CALENDAR_READWRITE_SCOPE.to_string(),
            ],
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
        tracing::info!("Authorizing with Microsoft Outlook");

        let token = self
            .oauth_client
            .exchange_code(code, Some(code_verifier))
            .await?
            .with_expiration();

        tracing::info!("Successfully authorized with Microsoft Outlook");
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

        let url = format!("{}/me/calendars", GRAPH_API_BASE);
        let token = self.get_access_token()?;

        tracing::debug!("Fetching calendar list from Microsoft Graph");

        let response = self.client.get(&url).bearer_auth(token).send().await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await?;
            return Err(Error::Other(format!(
                "Failed to list calendars: {} - {}",
                status, error_text
            )));
        }

        let calendar_list: OutlookCalendarListResponse = response.json().await?;

        let calendars: Vec<_> = calendar_list
            .value
            .into_iter()
            .map(|item| Calendar {
                id: item.id,
                name: item.name,
                description: None,
                timezone: item.time_zone.unwrap_or_else(|| "UTC".to_string()),
                is_primary: item.is_default_calendar.unwrap_or(false),
                color: item.color,
                access_role: if item.can_edit.unwrap_or(false) {
                    "writer".to_string()
                } else {
                    "reader".to_string()
                },
            })
            .collect();

        tracing::debug!("Found {} calendars", calendars.len());

        Ok(calendars)
    }

    /// List events in a calendar
    pub async fn list_events(&mut self, request: ListEventsRequest) -> Result<EventListResponse> {
        self.ensure_valid_token().await?;

        let url = format!(
            "{}/me/calendars/{}/events",
            GRAPH_API_BASE, request.calendar_id
        );
        let token = self.get_access_token()?;

        let start_time = request.start_time.to_rfc3339();
        let end_time = request.end_time.to_rfc3339();

        let filter = format!(
            "start/dateTime ge '{}' and end/dateTime le '{}'",
            start_time, end_time
        );

        let mut query_params = vec![
            ("$filter".to_string(), filter),
            ("$orderby".to_string(), "start/dateTime".to_string()),
        ];

        if let Some(max_results) = request.max_results {
            query_params.push(("$top".to_string(), max_results.to_string()));
        }

        tracing::debug!("Fetching events for calendar: {}", request.calendar_id);

        let response = self
            .client
            .get(&url)
            .bearer_auth(token)
            .query(&query_params)
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

        let events_response: OutlookEventsResponse = response.json().await?;

        let events: Vec<_> = events_response
            .value
            .into_iter()
            .map(|item| self.convert_outlook_event(item, &request.calendar_id))
            .collect();

        tracing::debug!("Found {} events", events.len());

        Ok(EventListResponse {
            events,
            next_page_token: events_response.next_link,
        })
    }

    /// Create a new event
    pub async fn create_event(&mut self, request: CreateEventRequest) -> Result<CalendarEvent> {
        self.ensure_valid_token().await?;

        let url = format!(
            "{}/me/calendars/{}/events",
            GRAPH_API_BASE, request.calendar_id
        );
        let token = self.get_access_token()?;

        let outlook_event = self.convert_to_outlook_event(&request);

        tracing::debug!("Creating event: {}", request.title);

        let response = self
            .client
            .post(&url)
            .bearer_auth(token)
            .json(&outlook_event)
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

        let created_event: OutlookEvent = response.json().await?;

        tracing::info!("Successfully created event: {}", created_event.id);

        Ok(self.convert_outlook_event(created_event, &request.calendar_id))
    }

    /// Update an existing event
    pub async fn update_event(
        &mut self,
        calendar_id: &str,
        event_id: &str,
        request: UpdateEventRequest,
    ) -> Result<CalendarEvent> {
        self.ensure_valid_token().await?;

        let url = format!("{}/me/events/{}", GRAPH_API_BASE, event_id);
        let token = self.get_access_token()?;

        // Build update payload
        let mut update_data = serde_json::Map::new();

        if let Some(title) = request.title {
            update_data.insert("subject".to_string(), serde_json::json!(title));
        }
        if let Some(description) = request.description {
            update_data.insert(
                "body".to_string(),
                serde_json::json!({
                    "contentType": "Text",
                    "content": description
                }),
            );
        }
        if let Some(location) = request.location {
            update_data.insert(
                "location".to_string(),
                serde_json::json!({
                    "displayName": location
                }),
            );
        }

        if let Some(start) = request.start {
            update_data.insert(
                "start".to_string(),
                serde_json::to_value(self.convert_to_outlook_datetime(&start)).unwrap(),
            );
        }

        if let Some(end) = request.end {
            update_data.insert(
                "end".to_string(),
                serde_json::to_value(self.convert_to_outlook_datetime(&end)).unwrap(),
            );
        }

        tracing::debug!("Updating event: {}", event_id);

        let response = self
            .client
            .patch(&url)
            .bearer_auth(token)
            .json(&update_data)
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

        let updated_event: OutlookEvent = response.json().await?;

        tracing::info!("Successfully updated event: {}", event_id);

        Ok(self.convert_outlook_event(updated_event, calendar_id))
    }

    /// Delete an event
    pub async fn delete_event(&mut self, _calendar_id: &str, event_id: &str) -> Result<()> {
        self.ensure_valid_token().await?;

        let url = format!("{}/me/events/{}", GRAPH_API_BASE, event_id);
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

    /// Convert Outlook event to our event type
    fn convert_outlook_event(&self, event: OutlookEvent, calendar_id: &str) -> CalendarEvent {
        let start = self.convert_from_outlook_datetime(&event.start);
        let end = self.convert_from_outlook_datetime(&event.end);

        let attendees = event
            .attendees
            .unwrap_or_default()
            .into_iter()
            .map(|a| Attendee {
                email: a.email_address.address,
                display_name: Some(a.email_address.name),
                response_status: match a.status.response.as_str() {
                    "accepted" => ResponseStatus::Accepted,
                    "declined" => ResponseStatus::Declined,
                    "tentativelyAccepted" => ResponseStatus::Tentative,
                    _ => ResponseStatus::NeedsAction,
                },
                is_organizer: a.type_.as_deref() == Some("organizer"),
                is_optional: a.type_.as_deref() == Some("optional"),
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
            title: event.subject,
            description: event.body.map(|b| b.content),
            location: event.location.map(|l| l.display_name),
            start,
            end,
            attendees,
            reminders: vec![],
            recurrence: None,
            status,
            created_at: event.created_date_time,
            updated_at: event.last_modified_date_time,
            html_link: event.web_link,
            meeting_url: event.online_meeting_url,
        }
    }

    /// Convert our event to Outlook event format
    fn convert_to_outlook_event(&self, request: &CreateEventRequest) -> OutlookEventCreate {
        let attendees: Vec<OutlookAttendeeCreate> = request
            .attendees
            .iter()
            .map(|email| OutlookAttendeeCreate {
                email_address: OutlookEmailAddress {
                    address: email.clone(),
                    name: email.clone(),
                },
                type_: "required".to_string(),
            })
            .collect();

        OutlookEventCreate {
            subject: request.title.clone(),
            body: request.description.as_ref().map(|desc| OutlookBody {
                content_type: "Text".to_string(),
                content: desc.clone(),
            }),
            location: request.location.as_ref().map(|loc| OutlookLocation {
                display_name: loc.clone(),
            }),
            start: self.convert_to_outlook_datetime(&request.start),
            end: self.convert_to_outlook_datetime(&request.end),
            attendees: if attendees.is_empty() {
                None
            } else {
                Some(attendees)
            },
        }
    }

    fn convert_from_outlook_datetime(&self, dt: &OutlookDateTime) -> EventDateTime {
        // Parse the datetime string
        if let Ok(parsed_dt) = DateTime::parse_from_rfc3339(&dt.date_time) {
            EventDateTime::DateTime {
                date_time: parsed_dt.with_timezone(&Utc),
                timezone: dt.time_zone.clone(),
            }
        } else {
            // Try as date-only
            EventDateTime::Date {
                date: dt
                    .date_time
                    .split('T')
                    .next()
                    .unwrap_or(&dt.date_time)
                    .to_string(),
            }
        }
    }

    fn convert_to_outlook_datetime(&self, dt: &EventDateTime) -> OutlookDateTime {
        match dt {
            EventDateTime::DateTime {
                date_time,
                timezone,
            } => OutlookDateTime {
                date_time: date_time.to_rfc3339(),
                time_zone: timezone.clone(),
            },
            EventDateTime::Date { date } => OutlookDateTime {
                date_time: format!("{}T00:00:00", date),
                time_zone: "UTC".to_string(),
            },
        }
    }
}

// Microsoft Graph API response types
#[derive(Debug, Deserialize)]
struct OutlookCalendarListResponse {
    value: Vec<OutlookCalendarItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OutlookCalendarItem {
    id: String,
    name: String,
    color: Option<String>,
    is_default_calendar: Option<bool>,
    can_edit: Option<bool>,
    time_zone: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OutlookEventsResponse {
    value: Vec<OutlookEvent>,
    #[serde(rename = "@odata.nextLink")]
    next_link: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OutlookEvent {
    id: String,
    subject: String,
    body: Option<OutlookBody>,
    location: Option<OutlookLocation>,
    start: OutlookDateTime,
    end: OutlookDateTime,
    attendees: Option<Vec<OutlookAttendee>>,
    status: Option<String>,
    web_link: Option<String>,
    online_meeting_url: Option<String>,
    created_date_time: DateTime<Utc>,
    last_modified_date_time: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OutlookDateTime {
    date_time: String,
    time_zone: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OutlookBody {
    content_type: String,
    content: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OutlookLocation {
    display_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OutlookAttendee {
    email_address: OutlookEmailAddress,
    status: OutlookAttendeeStatus,
    #[serde(rename = "type")]
    type_: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OutlookEmailAddress {
    address: String,
    name: String,
}

#[derive(Debug, Deserialize)]
struct OutlookAttendeeStatus {
    response: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutlookEventCreate {
    subject: String,
    body: Option<OutlookBody>,
    location: Option<OutlookLocation>,
    start: OutlookDateTime,
    end: OutlookDateTime,
    attendees: Option<Vec<OutlookAttendeeCreate>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutlookAttendeeCreate {
    email_address: OutlookEmailAddress,
    #[serde(rename = "type")]
    type_: String,
}
