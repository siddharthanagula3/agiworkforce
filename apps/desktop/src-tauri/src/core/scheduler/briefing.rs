//! Daily briefing generation for the proactive scheduler.
//!
//! This module provides functionality to generate natural language briefings
//! that summarize calendar events, unread emails, weather conditions, and other
//! relevant information for the user's day.

use chrono::{DateTime, Datelike, Local, NaiveDate, NaiveTime, TimeZone, Timelike, Utc};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::Arc;

use super::weather::{WeatherConfig, WeatherProvider};
use crate::features::calendar::{CalendarEvent, EventDateTime, ListEventsRequest};
use crate::features::communications::{Contact, Email};
use crate::sys::commands::calendar::CalendarState;
use crate::sys::error::{Error, Result};

/// Configuration for what to include in a briefing.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BriefingConfig {
    /// Whether to include calendar events in the briefing.
    pub include_calendar: bool,

    /// Whether to include email summary in the briefing.
    pub include_email: bool,

    /// Whether to include weather information in the briefing.
    pub include_weather: bool,

    /// Whether to include task summary in the briefing.
    /// Note: Task integration is not yet implemented.
    pub include_tasks: bool,

    /// Optional custom prompt to append to the briefing.
    pub custom_prompt: Option<String>,

    /// Maximum number of calendar events to include.
    #[serde(default = "default_max_events")]
    pub max_events: usize,

    /// Maximum number of emails to summarize.
    #[serde(default = "default_max_emails")]
    pub max_emails: usize,

    /// User's timezone for displaying times.
    #[serde(default)]
    pub timezone: Option<String>,

    /// Weather configuration for fetching weather data.
    #[serde(default)]
    pub weather_config: WeatherConfig,
}

fn default_max_events() -> usize {
    10
}

fn default_max_emails() -> usize {
    10
}

impl Default for BriefingConfig {
    fn default() -> Self {
        Self {
            include_calendar: true,
            include_email: true,
            include_weather: false,
            include_tasks: false,
            custom_prompt: None,
            max_events: default_max_events(),
            max_emails: default_max_emails(),
            timezone: None,
            weather_config: WeatherConfig::default(),
        }
    }
}

/// Summary of unread emails for the briefing.
#[derive(Debug, Clone, Default)]
pub struct EmailSummary {
    /// Total number of unread emails.
    pub total_unread: usize,

    /// Number of important/flagged emails.
    pub important_count: usize,

    /// Brief descriptions of important emails.
    pub important_emails: Vec<EmailBrief>,

    /// Brief descriptions of recent emails.
    pub recent_emails: Vec<EmailBrief>,
}

/// Brief information about an email for the briefing.
#[derive(Debug, Clone)]
pub struct EmailBrief {
    /// Subject of the email.
    pub subject: String,

    /// Sender's name or email.
    pub from: String,

    /// Whether the email is flagged as important.
    pub is_important: bool,
}

/// Detailed summary of a single email for enhanced morning briefings.
///
/// Contains essential information needed to display an email in the morning briefing,
/// including sender, subject, preview text, and importance indicators.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetailedEmailSummary {
    /// Sender's name or email address.
    pub from: String,
    /// Sender's email address (for contact matching).
    pub from_email: String,
    /// Email subject line.
    pub subject: String,
    /// Preview of the email body (first 100 characters).
    pub preview: String,
    /// Unix timestamp when the email was received.
    pub received_at: i64,
    /// Whether the email is marked as important (starred/flagged).
    pub is_important: bool,
    /// Whether the email has attachments.
    pub has_attachments: bool,
    /// Whether the sender is a known contact.
    #[serde(default)]
    pub is_from_contact: bool,
}

impl DetailedEmailSummary {
    /// Creates a `DetailedEmailSummary` from an `Email`.
    #[must_use]
    pub fn from_email(email: &Email) -> Self {
        let from = email
            .from
            .name
            .clone()
            .unwrap_or_else(|| email.from.email.clone());

        let preview = Self::extract_preview(email.body_text.as_deref());

        Self {
            from,
            from_email: email.from.email.clone(),
            subject: email.subject.clone(),
            preview,
            received_at: email.date,
            is_important: email.is_flagged,
            has_attachments: !email.attachments.is_empty(),
            is_from_contact: false,
        }
    }

    /// Extracts a preview from the email body text (max 100 chars).
    fn extract_preview(body_text: Option<&str>) -> String {
        body_text
            .map(|text| {
                let cleaned: String = text
                    .chars()
                    .filter(|c| !c.is_control() || *c == ' ')
                    .take(150)
                    .collect::<String>()
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ");

                if cleaned.len() > 100 {
                    let truncated = &cleaned[..100];
                    if let Some(last_space) = truncated.rfind(' ') {
                        format!("{}...", &truncated[..last_space])
                    } else {
                        format!("{}...", &cleaned[..97])
                    }
                } else {
                    cleaned
                }
            })
            .unwrap_or_default()
    }
}

/// Aggregated email briefing summary with counts and prioritized email list.
#[derive(Debug, Clone, Default)]
pub struct EmailBriefingSummary {
    /// Total number of unread emails across all accounts.
    pub total_unread: usize,
    /// Number of important/starred emails.
    pub important_count: usize,
    /// Prioritized list of detailed email summaries.
    pub emails: Vec<DetailedEmailSummary>,
}

/// Generates daily briefings by aggregating calendar, email, and other data.
pub struct BriefingGenerator {
    /// Reference to the calendar state for fetching events.
    calendar_state: Arc<CalendarState>,

    /// Optional callback for fetching emails.
    /// This allows dependency injection for testing and flexibility.
    email_fetcher: Option<Arc<dyn EmailFetcher + Send + Sync>>,
}

/// Trait for fetching emails, allowing for dependency injection.
#[async_trait::async_trait]
pub trait EmailFetcher: Send + Sync {
    /// Fetches unread emails for the given account.
    async fn fetch_unread_emails(&self, account_id: i64, limit: usize) -> Result<Vec<Email>>;

    /// Lists all configured email account IDs.
    fn list_account_ids(&self) -> Vec<i64>;

    /// Lists all known contacts for prioritization.
    async fn list_contacts(&self) -> Result<Vec<Contact>> {
        Ok(Vec::new())
    }
}

impl BriefingGenerator {
    /// Creates a new briefing generator with the given calendar state.
    ///
    /// # Arguments
    ///
    /// * `calendar_state` - Arc reference to the calendar state.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// use std::sync::Arc;
    /// use crate::core::scheduler::briefing::BriefingGenerator;
    /// use crate::sys::commands::calendar::CalendarState;
    ///
    /// let calendar_state = Arc::new(CalendarState::new());
    /// let generator = BriefingGenerator::new(calendar_state);
    /// ```
    pub fn new(calendar_state: Arc<CalendarState>) -> Self {
        Self {
            calendar_state,
            email_fetcher: None,
        }
    }

    /// Sets the email fetcher for retrieving email summaries.
    ///
    /// # Arguments
    ///
    /// * `fetcher` - Implementation of the `EmailFetcher` trait.
    #[must_use]
    pub fn with_email_fetcher(mut self, fetcher: Arc<dyn EmailFetcher + Send + Sync>) -> Self {
        self.email_fetcher = Some(fetcher);
        self
    }

    /// Fetches unread emails with detailed summaries.
    ///
    /// # Arguments
    ///
    /// * `limit` - Maximum number of emails to fetch per account.
    pub async fn fetch_unread_emails(&self, limit: usize) -> Result<Vec<DetailedEmailSummary>> {
        let Some(fetcher) = &self.email_fetcher else {
            return Err(Error::Other(
                "No email fetcher configured. Please connect an email account first.".to_string(),
            ));
        };

        let account_ids = fetcher.list_account_ids();
        if account_ids.is_empty() {
            return Ok(Vec::new());
        }

        let mut all_emails = Vec::new();
        for account_id in account_ids {
            match fetcher.fetch_unread_emails(account_id, limit).await {
                Ok(emails) => {
                    for email in emails {
                        all_emails.push(DetailedEmailSummary::from_email(&email));
                    }
                }
                Err(e) => {
                    tracing::debug!("Failed to fetch emails for account {}: {}", account_id, e);
                }
            }
        }

        Ok(all_emails)
    }

    /// Prioritizes emails based on importance criteria.
    ///
    /// Order: starred first, then from contacts, then by recency.
    pub async fn prioritize_emails(
        &self,
        emails: &[DetailedEmailSummary],
    ) -> Vec<DetailedEmailSummary> {
        let contact_emails: HashSet<String> = if let Some(fetcher) = &self.email_fetcher {
            fetcher
                .list_contacts()
                .await
                .unwrap_or_default()
                .into_iter()
                .map(|c| c.email.to_lowercase())
                .collect()
        } else {
            HashSet::new()
        };

        let mut prioritized: Vec<DetailedEmailSummary> = emails
            .iter()
            .map(|e| {
                let mut email = e.clone();
                email.is_from_contact = contact_emails.contains(&e.from_email.to_lowercase());
                email
            })
            .collect();

        prioritized.sort_by(|a, b| {
            match (a.is_important, b.is_important) {
                (true, false) => return std::cmp::Ordering::Less,
                (false, true) => return std::cmp::Ordering::Greater,
                _ => {}
            }

            match (a.is_from_contact, b.is_from_contact) {
                (true, false) => return std::cmp::Ordering::Less,
                (false, true) => return std::cmp::Ordering::Greater,
                _ => {}
            }

            b.received_at.cmp(&a.received_at)
        });

        prioritized
    }

    /// Formats the email section with enhanced details for morning briefings.
    #[must_use]
    pub fn format_email_section_detailed(&self, emails: &[DetailedEmailSummary]) -> String {
        if emails.is_empty() {
            return "## Unread Emails\n\nNo unread emails.".to_string();
        }

        let total_count = emails.len();
        let show_count = total_count.min(10);
        let display_emails = &emails[..show_count];

        let mut lines = Vec::new();

        if total_count > show_count {
            lines.push(format!(
                "## Unread Emails ({} total, showing top {})",
                total_count, show_count
            ));
        } else {
            lines.push(format!("## Unread Emails ({})", total_count));
        }
        lines.push(String::new());

        for email in display_emails {
            let star = if email.is_important { "* " } else { "" };
            lines.push(format!("{}From: {}", star, email.from));
            lines.push(format!("   Subject: {}", email.subject));

            if !email.preview.is_empty() {
                lines.push(format!("   Preview: {}", email.preview));
            }

            if email.has_attachments {
                lines.push("   [Has attachments]".to_string());
            }

            lines.push(String::new());
        }

        lines.join("\n")
    }

    /// Fetches a briefing summary of unread emails across all accounts.
    pub async fn get_email_briefing_summary(&self, limit: usize) -> Result<EmailBriefingSummary> {
        let Some(fetcher) = &self.email_fetcher else {
            return Ok(EmailBriefingSummary::default());
        };

        let mut all_emails = Vec::new();
        let account_ids = fetcher.list_account_ids();

        for account_id in account_ids {
            match fetcher.fetch_unread_emails(account_id, limit * 2).await {
                Ok(emails) => {
                    for email in emails {
                        all_emails.push(DetailedEmailSummary::from_email(&email));
                    }
                }
                Err(e) => {
                    tracing::debug!("Failed to fetch emails for account {}: {}", account_id, e);
                }
            }
        }

        let total_unread = all_emails.len();
        let important_count = all_emails.iter().filter(|e| e.is_important).count();
        let prioritized = self.prioritize_emails(&all_emails).await;
        let limited: Vec<DetailedEmailSummary> = prioritized.into_iter().take(limit).collect();

        Ok(EmailBriefingSummary {
            total_unread,
            important_count,
            emails: limited,
        })
    }

    /// Fetches calendar events for a specific date.
    ///
    /// This method retrieves all calendar events for the given date from all
    /// connected calendar accounts. Events are sorted by start time and
    /// deduplicated by event ID.
    ///
    /// # Arguments
    ///
    /// * `date` - The date to fetch events for.
    ///
    /// # Returns
    ///
    /// A vector of `CalendarEvent` objects sorted by start time.
    ///
    /// # Errors
    ///
    /// Returns an error if the date range cannot be calculated.
    pub async fn fetch_calendar_events(&self, date: NaiveDate) -> Result<Vec<CalendarEvent>> {
        let user_tz = self.parse_timezone(None);
        self.fetch_calendar_events_with_tz(date, user_tz).await
    }

    /// Fetches calendar events for a specific date with a custom timezone.
    async fn fetch_calendar_events_with_tz(
        &self,
        date: NaiveDate,
        user_tz: Tz,
    ) -> Result<Vec<CalendarEvent>> {
        let start_of_day = user_tz
            .with_ymd_and_hms(date.year(), date.month(), date.day(), 0, 0, 0)
            .single()
            .ok_or_else(|| Error::Other("Failed to calculate start of day".to_string()))?;

        let end_of_day = user_tz
            .with_ymd_and_hms(date.year(), date.month(), date.day(), 23, 59, 59)
            .single()
            .ok_or_else(|| Error::Other("Failed to calculate end of day".to_string()))?;

        let start_utc = start_of_day.with_timezone(&Utc);
        let end_utc = end_of_day.with_timezone(&Utc);

        let mut all_events = Vec::new();
        let mut seen_event_ids = HashSet::new();
        let account_ids = self.calendar_state.manager.list_accounts();

        if account_ids.is_empty() {
            return Ok(Vec::new());
        }

        for account_id in account_ids {
            if let Ok(calendars) = self
                .calendar_state
                .manager
                .list_calendars(&account_id)
                .await
            {
                for calendar in calendars {
                    let request = ListEventsRequest {
                        calendar_id: calendar.id.clone(),
                        start_time: start_utc,
                        end_time: end_utc,
                        max_results: Some(100),
                        show_deleted: Some(false),
                    };

                    if let Ok(response) = self
                        .calendar_state
                        .manager
                        .list_events(&account_id, &request)
                        .await
                    {
                        for event in response.events {
                            if seen_event_ids.insert(event.id.clone()) {
                                all_events.push(event);
                            }
                        }
                    }
                }
            }
        }

        all_events.sort_by(|a, b| {
            let a_time = self.event_start_timestamp(&a.start);
            let b_time = self.event_start_timestamp(&b.start);
            a_time.cmp(&b_time)
        });

        Ok(all_events)
    }

    /// Formats a calendar section for the morning briefing with detailed event information.
    ///
    /// This method produces a well-formatted markdown section showing all calendar
    /// events for the day, including time ranges, titles, locations, and attendees.
    #[must_use]
    pub fn format_calendar_section(&self, events: &[CalendarEvent]) -> String {
        let user_tz = self.parse_timezone(None);
        self.format_calendar_section_internal(events, user_tz)
    }

    /// Generates a complete briefing based on the provided configuration.
    ///
    /// # Arguments
    ///
    /// * `config` - Configuration specifying what to include in the briefing.
    ///
    /// # Returns
    ///
    /// A formatted string containing the complete briefing.
    ///
    /// # Errors
    ///
    /// Returns an error if calendar or email data cannot be fetched.
    pub async fn generate_briefing(&self, config: &BriefingConfig) -> Result<String> {
        let user_tz = self.parse_timezone(config.timezone.as_deref());
        let now = Local::now();

        let mut sections = Vec::new();

        // Greeting based on time of day
        let greeting = self.get_greeting(&now);
        sections.push(greeting);

        // Calendar events
        if config.include_calendar {
            match self.get_today_events(config.max_events, user_tz).await {
                Ok(events) => {
                    let calendar_section = self.format_calendar_section_internal(&events, user_tz);
                    sections.push(calendar_section);
                }
                Err(e) => {
                    tracing::warn!("Failed to fetch calendar events for briefing: {}", e);
                    sections.push(
                        "## Today's Calendar\n\nUnable to fetch today's events. Please check your calendar connection."
                            .to_string(),
                    );
                }
            }
        }

        // Email summary
        if config.include_email {
            match self.get_unread_emails_summary(config.max_emails).await {
                Ok(summary) => {
                    let email_section = self.format_email_section(&summary);
                    sections.push(email_section);
                }
                Err(e) => {
                    tracing::warn!("Failed to fetch email summary for briefing: {}", e);
                    sections.push(
                        "Email: Unable to fetch email summary. Please check your email connection."
                            .to_string(),
                    );
                }
            }
        }

        // Weather
        if config.include_weather {
            let weather_provider = WeatherProvider::new(config.weather_config.clone());
            match weather_provider.fetch_current().await {
                Ok(Some(weather)) => {
                    let weather_section =
                        WeatherProvider::format_for_briefing(&weather, config.weather_config.units);
                    sections.push(weather_section);
                }
                Ok(None) => {
                    // Weather disabled or no API key configured
                    if config.weather_config.api_key.is_none() {
                        sections.push(
                            "Weather: Configure an OpenWeatherMap API key to enable weather updates."
                                .to_string(),
                        );
                    }
                }
                Err(e) => {
                    tracing::warn!("Failed to fetch weather for briefing: {}", e);
                    sections.push(
                        "Weather: Unable to fetch weather data. Please check your configuration."
                            .to_string(),
                    );
                }
            }
        }

        // Tasks (placeholder for future implementation)
        if config.include_tasks {
            sections.push("Tasks: Task integration coming soon.".to_string());
        }

        // Custom prompt
        if let Some(custom) = &config.custom_prompt {
            if !custom.is_empty() {
                sections.push(format!("\n{}", custom));
            }
        }

        // Closing
        sections.push("\nHave a productive day!".to_string());

        Ok(sections.join("\n\n"))
    }

    /// Fetches calendar events for today.
    ///
    /// # Arguments
    ///
    /// * `max_events` - Maximum number of events to return.
    /// * `user_tz` - User's timezone for determining "today".
    ///
    /// # Returns
    ///
    /// A vector of calendar events scheduled for today.
    async fn get_today_events(&self, max_events: usize, user_tz: Tz) -> Result<Vec<CalendarEvent>> {
        let now = Utc::now();
        let local_now = now.with_timezone(&user_tz);

        // Get start of today in user's timezone
        let start_of_day = user_tz
            .with_ymd_and_hms(
                local_now.year(),
                local_now.month(),
                local_now.day(),
                0,
                0,
                0,
            )
            .single()
            .ok_or_else(|| Error::Other("Failed to calculate start of day".to_string()))?;

        // Get end of today in user's timezone
        let end_of_day = user_tz
            .with_ymd_and_hms(
                local_now.year(),
                local_now.month(),
                local_now.day(),
                23,
                59,
                59,
            )
            .single()
            .ok_or_else(|| Error::Other("Failed to calculate end of day".to_string()))?;

        let start_utc = start_of_day.with_timezone(&Utc);
        let end_utc = end_of_day.with_timezone(&Utc);

        let mut all_events = Vec::new();

        // Get all connected calendar accounts
        let account_ids = self.calendar_state.manager.list_accounts();

        for account_id in account_ids {
            // Get calendars for this account
            match self
                .calendar_state
                .manager
                .list_calendars(&account_id)
                .await
            {
                Ok(calendars) => {
                    for calendar in calendars {
                        let request = ListEventsRequest {
                            calendar_id: calendar.id.clone(),
                            start_time: start_utc,
                            end_time: end_utc,
                            max_results: Some(max_events as u32),
                            show_deleted: Some(false),
                        };

                        match self
                            .calendar_state
                            .manager
                            .list_events(&account_id, &request)
                            .await
                        {
                            Ok(response) => {
                                all_events.extend(response.events);
                            }
                            Err(e) => {
                                tracing::debug!(
                                    "Failed to fetch events from calendar {}: {}",
                                    calendar.id,
                                    e
                                );
                            }
                        }
                    }
                }
                Err(e) => {
                    tracing::debug!("Failed to list calendars for account {}: {}", account_id, e);
                }
            }
        }

        // Sort events by start time
        all_events.sort_by(|a, b| {
            let a_time = self.event_start_timestamp(&a.start);
            let b_time = self.event_start_timestamp(&b.start);
            a_time.cmp(&b_time)
        });

        // Limit to max_events
        all_events.truncate(max_events);

        Ok(all_events)
    }

    /// Fetches a summary of unread emails across all accounts.
    ///
    /// # Arguments
    ///
    /// * `max_emails` - Maximum number of emails to include in the summary.
    ///
    /// # Returns
    ///
    /// An `EmailSummary` containing counts and brief descriptions.
    async fn get_unread_emails_summary(&self, max_emails: usize) -> Result<EmailSummary> {
        let Some(fetcher) = &self.email_fetcher else {
            return Ok(EmailSummary::default());
        };

        let mut summary = EmailSummary::default();
        let account_ids = fetcher.list_account_ids();

        for account_id in account_ids {
            match fetcher.fetch_unread_emails(account_id, max_emails).await {
                Ok(emails) => {
                    summary.total_unread += emails.len();

                    for email in emails {
                        let brief = EmailBrief {
                            subject: email.subject.clone(),
                            from: email
                                .from
                                .name
                                .clone()
                                .unwrap_or_else(|| email.from.email.clone()),
                            is_important: email.is_flagged,
                        };

                        if email.is_flagged {
                            summary.important_count += 1;
                            summary.important_emails.push(brief);
                        } else if summary.recent_emails.len() < max_emails {
                            summary.recent_emails.push(brief);
                        }
                    }
                }
                Err(e) => {
                    tracing::debug!("Failed to fetch emails for account {}: {}", account_id, e);
                }
            }
        }

        // Limit important emails to reasonable count
        summary.important_emails.truncate(5);
        summary
            .recent_emails
            .truncate(max_emails - summary.important_emails.len());

        Ok(summary)
    }

    /// Internal method to format the calendar section with enhanced details.
    ///
    /// Produces a markdown-formatted calendar section with:
    /// - Header with event count
    /// - Time ranges (start - end) for timed events
    /// - "All day" for all-day events
    /// - Location or meeting service name
    /// - Attendee list (excluding organizer)
    fn format_calendar_section_internal(&self, events: &[CalendarEvent], user_tz: Tz) -> String {
        if events.is_empty() {
            return "## Today's Calendar (0 events)\n\nNo events scheduled for today.".to_string();
        }

        let event_count = events.len();
        let mut lines = vec![format!(
            "## Today's Calendar ({} event{})\n",
            event_count,
            if event_count == 1 { "" } else { "s" }
        )];

        for event in events {
            let time_range = self.format_event_time_range(&event.start, &event.end, user_tz);
            let title = &event.title;

            let mut event_line = format!("- {}: {}", time_range, title);

            // Add location (prefer meeting service name for online meetings)
            if let Some(url) = &event.meeting_url {
                if !url.is_empty() {
                    let service = Self::extract_meeting_service(url);
                    event_line.push_str(&format!(" ({})", service));
                }
            } else if let Some(location) = &event.location {
                if !location.is_empty() {
                    event_line.push_str(&format!(" ({})", location));
                }
            }

            lines.push(event_line);

            // Add attendees on a separate line (excluding organizer)
            let attendee_names: Vec<String> = event
                .attendees
                .iter()
                .filter(|a| !a.is_organizer)
                .map(|a| {
                    a.display_name
                        .clone()
                        .unwrap_or_else(|| Self::extract_name_from_email(&a.email))
                })
                .collect();

            if !attendee_names.is_empty() {
                lines.push(format!("  Attendees: {}", attendee_names.join(", ")));
            }
        }

        lines.join("\n")
    }

    /// Extracts a friendly meeting service name from a URL.
    fn extract_meeting_service(url: &str) -> &'static str {
        let url_lower = url.to_lowercase();
        if url_lower.contains("zoom.us") || url_lower.contains("zoom.com") {
            "Zoom"
        } else if url_lower.contains("meet.google.com") {
            "Google Meet"
        } else if url_lower.contains("teams.microsoft.com") || url_lower.contains("teams.live.com")
        {
            "Teams"
        } else if url_lower.contains("webex.com") {
            "Webex"
        } else if url_lower.contains("gotomeeting.com") {
            "GoToMeeting"
        } else if url_lower.contains("whereby.com") {
            "Whereby"
        } else if url_lower.contains("discord.com") || url_lower.contains("discord.gg") {
            "Discord"
        } else if url_lower.contains("slack.com") {
            "Slack Huddle"
        } else {
            "Online"
        }
    }

    /// Extracts a display name from an email address.
    fn extract_name_from_email(email: &str) -> String {
        email
            .split('@')
            .next()
            .unwrap_or(email)
            .split('.')
            .map(|part| {
                let mut chars = part.chars();
                match chars.next() {
                    None => String::new(),
                    Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                }
            })
            .collect::<Vec<_>>()
            .join(" ")
    }

    /// Formats a time range for an event (start - end time).
    fn format_event_time_range(
        &self,
        start: &EventDateTime,
        end: &EventDateTime,
        user_tz: Tz,
    ) -> String {
        match (start, end) {
            (
                EventDateTime::DateTime {
                    date_time: start_dt,
                    ..
                },
                EventDateTime::DateTime {
                    date_time: end_dt, ..
                },
            ) => {
                let start_local = start_dt.with_timezone(&user_tz);
                let end_local = end_dt.with_timezone(&user_tz);

                let start_str = start_local
                    .format("%I:%M %p")
                    .to_string()
                    .trim_start_matches('0')
                    .to_string();
                let end_str = end_local
                    .format("%I:%M %p")
                    .to_string()
                    .trim_start_matches('0')
                    .to_string();

                format!("{} - {}", start_str, end_str)
            }
            _ => "All day".to_string(),
        }
    }

    /// Formats the email section of the briefing.
    fn format_email_section(&self, summary: &EmailSummary) -> String {
        if summary.total_unread == 0 {
            return "Email: No unread emails.".to_string();
        }

        let mut lines = Vec::new();

        // Header with counts
        if summary.important_count > 0 {
            lines.push(format!(
                "Email: {} unread email{}, {} marked important:",
                summary.total_unread,
                if summary.total_unread == 1 { "" } else { "s" },
                summary.important_count
            ));
        } else {
            lines.push(format!(
                "Email: {} unread email{}:",
                summary.total_unread,
                if summary.total_unread == 1 { "" } else { "s" }
            ));
        }

        // Important emails first
        for email in &summary.important_emails {
            lines.push(format!(
                "- [Important] {} from {}",
                email.subject, email.from
            ));
        }

        // Recent emails
        for email in &summary.recent_emails {
            lines.push(format!("- {} from {}", email.subject, email.from));
        }

        lines.join("\n")
    }

    /// Gets an appropriate greeting based on the time of day.
    fn get_greeting(&self, now: &DateTime<Local>) -> String {
        let hour = now.hour();
        let greeting = if hour < 12 {
            "Good morning"
        } else if hour < 17 {
            "Good afternoon"
        } else {
            "Good evening"
        };

        let date_str = now.format("%A, %B %d, %Y").to_string();
        format!("{}! Here's your briefing for {}:", greeting, date_str)
    }

    /// Formats the start time of an event for display.
    #[allow(dead_code)]
    fn format_event_time(&self, start: &EventDateTime, user_tz: Tz) -> String {
        match start {
            EventDateTime::DateTime { date_time, .. } => {
                let local_time = date_time.with_timezone(&user_tz);
                local_time
                    .format("%I:%M %p")
                    .to_string()
                    .trim_start_matches('0')
                    .to_string()
            }
            EventDateTime::Date { date } => {
                format!("All day ({})", date)
            }
        }
    }

    /// Gets the timestamp from an event start time for sorting.
    fn event_start_timestamp(&self, start: &EventDateTime) -> i64 {
        match start {
            EventDateTime::DateTime { date_time, .. } => date_time.timestamp(),
            EventDateTime::Date { date } => {
                // Parse the date and return midnight timestamp
                chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
                    .map(|d| d.and_time(NaiveTime::MIN).and_utc().timestamp())
                    .unwrap_or(0)
            }
        }
    }

    /// Parses a timezone string or returns the system default.
    fn parse_timezone(&self, tz_str: Option<&str>) -> Tz {
        tz_str
            .and_then(|s| s.parse::<Tz>().ok())
            .unwrap_or_else(|| {
                // Try to get system timezone
                use crate::features::calendar::timezone::get_system_timezone;
                get_system_timezone()
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_briefing_config_default() {
        let config = BriefingConfig::default();
        assert!(config.include_calendar);
        assert!(config.include_email);
        assert!(!config.include_weather);
        assert!(!config.include_tasks);
        assert!(config.custom_prompt.is_none());
        assert_eq!(config.max_events, 10);
        assert_eq!(config.max_emails, 10);
        assert!(!config.weather_config.enabled);
        assert!(config.weather_config.api_key.is_none());
    }

    #[test]
    fn test_greeting_morning() {
        let calendar_state = Arc::new(CalendarState::new());
        let generator = BriefingGenerator::new(calendar_state);

        // Create a morning time
        let morning = Local::now().date_naive().and_hms_opt(9, 0, 0).unwrap();
        let morning_dt = Local.from_local_datetime(&morning).unwrap();

        let greeting = generator.get_greeting(&morning_dt);
        assert!(greeting.starts_with("Good morning"));
    }

    #[test]
    fn test_greeting_afternoon() {
        let calendar_state = Arc::new(CalendarState::new());
        let generator = BriefingGenerator::new(calendar_state);

        // Create an afternoon time
        let afternoon = Local::now().date_naive().and_hms_opt(14, 0, 0).unwrap();
        let afternoon_dt = Local.from_local_datetime(&afternoon).unwrap();

        let greeting = generator.get_greeting(&afternoon_dt);
        assert!(greeting.starts_with("Good afternoon"));
    }

    #[test]
    fn test_greeting_evening() {
        let calendar_state = Arc::new(CalendarState::new());
        let generator = BriefingGenerator::new(calendar_state);

        // Create an evening time
        let evening = Local::now().date_naive().and_hms_opt(19, 0, 0).unwrap();
        let evening_dt = Local.from_local_datetime(&evening).unwrap();

        let greeting = generator.get_greeting(&evening_dt);
        assert!(greeting.starts_with("Good evening"));
    }

    #[test]
    fn test_format_email_section_empty() {
        let calendar_state = Arc::new(CalendarState::new());
        let generator = BriefingGenerator::new(calendar_state);

        let summary = EmailSummary::default();
        let section = generator.format_email_section(&summary);
        assert_eq!(section, "Email: No unread emails.");
    }

    #[test]
    fn test_format_email_section_with_emails() {
        let calendar_state = Arc::new(CalendarState::new());
        let generator = BriefingGenerator::new(calendar_state);

        let summary = EmailSummary {
            total_unread: 5,
            important_count: 2,
            important_emails: vec![
                EmailBrief {
                    subject: "Budget approval".to_string(),
                    from: "Finance".to_string(),
                    is_important: true,
                },
                EmailBrief {
                    subject: "Project update".to_string(),
                    from: "Engineering".to_string(),
                    is_important: true,
                },
            ],
            recent_emails: vec![EmailBrief {
                subject: "Newsletter".to_string(),
                from: "Marketing".to_string(),
                is_important: false,
            }],
        };

        let section = generator.format_email_section(&summary);
        assert!(section.contains("5 unread emails"));
        assert!(section.contains("2 marked important"));
        assert!(section.contains("[Important] Budget approval"));
        assert!(section.contains("Newsletter from Marketing"));
    }

    #[test]
    fn test_format_calendar_section_empty() {
        let calendar_state = Arc::new(CalendarState::new());
        let generator = BriefingGenerator::new(calendar_state);

        let events: Vec<CalendarEvent> = vec![];
        let tz: Tz = "America/New_York".parse().unwrap();
        let section = generator.format_calendar_section_internal(&events, tz);
        assert_eq!(
            section,
            "## Today's Calendar (0 events)\n\nNo events scheduled for today."
        );
    }

    #[test]
    fn test_format_calendar_section_with_events() {
        use crate::features::calendar::{Attendee, EventStatus, ResponseStatus};

        let calendar_state = Arc::new(CalendarState::new());
        let generator = BriefingGenerator::new(calendar_state);

        let now = Utc::now();
        let events = vec![
            CalendarEvent {
                id: "1".to_string(),
                calendar_id: "cal1".to_string(),
                title: "Team Standup".to_string(),
                description: None,
                location: None,
                start: EventDateTime::DateTime {
                    date_time: now,
                    timezone: "America/New_York".to_string(),
                },
                end: EventDateTime::DateTime {
                    date_time: now + chrono::Duration::hours(1),
                    timezone: "America/New_York".to_string(),
                },
                attendees: vec![],
                reminders: vec![],
                recurrence: None,
                status: EventStatus::Confirmed,
                created_at: now,
                updated_at: now,
                html_link: None,
                meeting_url: Some("https://zoom.us/j/123456".to_string()),
            },
            CalendarEvent {
                id: "2".to_string(),
                calendar_id: "cal1".to_string(),
                title: "Project Review".to_string(),
                description: None,
                location: Some("Conference Room B".to_string()),
                start: EventDateTime::DateTime {
                    date_time: now + chrono::Duration::hours(3),
                    timezone: "America/New_York".to_string(),
                },
                end: EventDateTime::DateTime {
                    date_time: now + chrono::Duration::hours(4),
                    timezone: "America/New_York".to_string(),
                },
                attendees: vec![
                    Attendee {
                        email: "organizer@example.com".to_string(),
                        display_name: Some("Organizer".to_string()),
                        response_status: ResponseStatus::Accepted,
                        is_organizer: true,
                        is_optional: false,
                    },
                    Attendee {
                        email: "alice@example.com".to_string(),
                        display_name: Some("Alice".to_string()),
                        response_status: ResponseStatus::Accepted,
                        is_organizer: false,
                        is_optional: false,
                    },
                    Attendee {
                        email: "bob.smith@example.com".to_string(),
                        display_name: None,
                        response_status: ResponseStatus::Tentative,
                        is_organizer: false,
                        is_optional: false,
                    },
                ],
                reminders: vec![],
                recurrence: None,
                status: EventStatus::Confirmed,
                created_at: now,
                updated_at: now,
                html_link: None,
                meeting_url: None,
            },
        ];

        let tz: Tz = "America/New_York".parse().unwrap();
        let section = generator.format_calendar_section_internal(&events, tz);

        assert!(section.contains("## Today's Calendar (2 events)"));
        assert!(section.contains("Team Standup (Zoom)"));
        assert!(section.contains("Project Review (Conference Room B)"));
        assert!(section.contains("Attendees: Alice, Bob Smith"));
    }

    #[test]
    fn test_format_calendar_section_all_day_event() {
        use crate::features::calendar::EventStatus;

        let calendar_state = Arc::new(CalendarState::new());
        let generator = BriefingGenerator::new(calendar_state);

        let now = Utc::now();
        let events = vec![CalendarEvent {
            id: "1".to_string(),
            calendar_id: "cal1".to_string(),
            title: "Company Holiday".to_string(),
            description: None,
            location: None,
            start: EventDateTime::Date {
                date: "2025-01-27".to_string(),
            },
            end: EventDateTime::Date {
                date: "2025-01-27".to_string(),
            },
            attendees: vec![],
            reminders: vec![],
            recurrence: None,
            status: EventStatus::Confirmed,
            created_at: now,
            updated_at: now,
            html_link: None,
            meeting_url: None,
        }];

        let tz: Tz = "America/New_York".parse().unwrap();
        let section = generator.format_calendar_section_internal(&events, tz);

        assert!(section.contains("## Today's Calendar (1 event)"));
        assert!(section.contains("All day: Company Holiday"));
    }

    #[test]
    fn test_extract_meeting_service() {
        assert_eq!(
            BriefingGenerator::extract_meeting_service("https://zoom.us/j/123456"),
            "Zoom"
        );
        assert_eq!(
            BriefingGenerator::extract_meeting_service("https://meet.google.com/abc-defg-hij"),
            "Google Meet"
        );
        assert_eq!(
            BriefingGenerator::extract_meeting_service(
                "https://teams.microsoft.com/l/meetup-join/123"
            ),
            "Teams"
        );
        assert_eq!(
            BriefingGenerator::extract_meeting_service("https://webex.com/meet/user"),
            "Webex"
        );
        assert_eq!(
            BriefingGenerator::extract_meeting_service("https://custom-video.com/room/123"),
            "Online"
        );
    }

    #[test]
    fn test_extract_name_from_email() {
        assert_eq!(
            BriefingGenerator::extract_name_from_email("john.doe@example.com"),
            "John Doe"
        );
        assert_eq!(
            BriefingGenerator::extract_name_from_email("alice@company.org"),
            "Alice"
        );
        assert_eq!(
            BriefingGenerator::extract_name_from_email("bob.james.smith@test.com"),
            "Bob James Smith"
        );
    }

    #[test]
    fn test_format_calendar_section_public_api() {
        let calendar_state = Arc::new(CalendarState::new());
        let generator = BriefingGenerator::new(calendar_state);

        let events: Vec<CalendarEvent> = vec![];
        let section = generator.format_calendar_section(&events);

        assert!(section.contains("Today's Calendar"));
        assert!(section.contains("0 events"));
    }

    // Tests for enhanced email functionality

    #[test]
    fn test_detailed_email_summary_from_email() {
        use crate::features::communications::{EmailAddress, EmailAttachment};

        let email = Email {
            id: "test-1".to_string(),
            uid: 1,
            account_id: 1,
            message_id: "<test@example.com>".to_string(),
            subject: "Test Subject".to_string(),
            from: EmailAddress {
                email: "sender@example.com".to_string(),
                name: Some("John Doe".to_string()),
            },
            to: vec![],
            cc: vec![],
            bcc: vec![],
            reply_to: None,
            date: Utc::now().timestamp(),
            body_text: Some("This is the email body text.".to_string()),
            body_html: None,
            attachments: vec![EmailAttachment {
                filename: "test.pdf".to_string(),
                content_type: "application/pdf".to_string(),
                size: 1024,
                content_id: None,
                file_path: None,
            }],
            is_read: false,
            is_flagged: true,
            folder: "INBOX".to_string(),
            size: 1024,
        };

        let summary = DetailedEmailSummary::from_email(&email);

        assert_eq!(summary.from, "John Doe");
        assert_eq!(summary.from_email, "sender@example.com");
        assert_eq!(summary.subject, "Test Subject");
        assert!(summary.is_important);
        assert!(summary.has_attachments);
        assert!(!summary.preview.is_empty());
    }

    #[test]
    fn test_extract_preview_long_text() {
        let long_text = "This is a very long email body that should definitely be truncated because it exceeds the maximum preview length of one hundred characters which we have set for brevity.";
        let preview = DetailedEmailSummary::extract_preview(Some(long_text));

        assert!(preview.len() <= 103);
        assert!(preview.ends_with("..."));
    }

    #[test]
    fn test_extract_preview_short_text() {
        let short_text = "Short email body.";
        let preview = DetailedEmailSummary::extract_preview(Some(short_text));

        assert_eq!(preview, "Short email body.");
        assert!(!preview.ends_with("..."));
    }

    #[test]
    fn test_extract_preview_empty() {
        let preview = DetailedEmailSummary::extract_preview(None);
        assert!(preview.is_empty());
    }

    #[test]
    fn test_format_email_section_detailed_empty() {
        let calendar_state = Arc::new(CalendarState::new());
        let generator = BriefingGenerator::new(calendar_state);

        let emails: Vec<DetailedEmailSummary> = vec![];
        let section = generator.format_email_section_detailed(&emails);

        assert!(section.contains("## Unread Emails"));
        assert!(section.contains("No unread emails"));
    }

    #[test]
    fn test_format_email_section_detailed_with_emails() {
        let calendar_state = Arc::new(CalendarState::new());
        let generator = BriefingGenerator::new(calendar_state);

        let now = Utc::now().timestamp();
        let emails = vec![
            DetailedEmailSummary {
                from: "Boss".to_string(),
                from_email: "boss@company.com".to_string(),
                subject: "Q4 Planning - Action Required".to_string(),
                preview: "Please review the attached document...".to_string(),
                received_at: now,
                is_important: true,
                has_attachments: true,
                is_from_contact: true,
            },
            DetailedEmailSummary {
                from: "john@example.com".to_string(),
                from_email: "john@example.com".to_string(),
                subject: "Lunch tomorrow?".to_string(),
                preview: "Hey, are you free for lunch?".to_string(),
                received_at: now - 3600,
                is_important: false,
                has_attachments: false,
                is_from_contact: false,
            },
        ];

        let section = generator.format_email_section_detailed(&emails);

        assert!(section.contains("## Unread Emails (2)"));
        assert!(section.contains("* From: Boss"));
        assert!(section.contains("Q4 Planning"));
        assert!(section.contains("[Has attachments]"));
        assert!(section.contains("From: john@example.com"));
    }

    #[tokio::test]
    async fn test_prioritize_emails() {
        let calendar_state = Arc::new(CalendarState::new());
        let generator = BriefingGenerator::new(calendar_state);

        let now = Utc::now().timestamp();
        let emails = vec![
            DetailedEmailSummary {
                from: "Normal".to_string(),
                from_email: "normal@example.com".to_string(),
                subject: "Normal email".to_string(),
                preview: "Normal".to_string(),
                received_at: now - 1000,
                is_important: false,
                has_attachments: false,
                is_from_contact: false,
            },
            DetailedEmailSummary {
                from: "Important".to_string(),
                from_email: "important@example.com".to_string(),
                subject: "Important email".to_string(),
                preview: "Important".to_string(),
                received_at: now - 2000,
                is_important: true,
                has_attachments: false,
                is_from_contact: false,
            },
            DetailedEmailSummary {
                from: "Recent".to_string(),
                from_email: "recent@example.com".to_string(),
                subject: "Recent email".to_string(),
                preview: "Recent".to_string(),
                received_at: now,
                is_important: false,
                has_attachments: false,
                is_from_contact: false,
            },
        ];

        let prioritized = generator.prioritize_emails(&emails).await;

        assert_eq!(prioritized[0].subject, "Important email");
        assert_eq!(prioritized[1].subject, "Recent email");
        assert_eq!(prioritized[2].subject, "Normal email");
    }

    #[test]
    fn test_email_briefing_summary_default() {
        let summary = EmailBriefingSummary::default();
        assert_eq!(summary.total_unread, 0);
        assert_eq!(summary.important_count, 0);
        assert!(summary.emails.is_empty());
    }
}
