//! Daily briefing generation for the proactive scheduler.
//!
//! This module provides functionality to generate natural language briefings
//! that summarize calendar events, unread emails, and other relevant information
//! for the user's day.

use chrono::{DateTime, Datelike, Local, NaiveTime, TimeZone, Timelike, Utc};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::features::calendar::{CalendarEvent, EventDateTime, ListEventsRequest};
use crate::features::communications::Email;
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
    /// Note: Weather integration is not yet implemented.
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
    pub fn with_email_fetcher(mut self, fetcher: Arc<dyn EmailFetcher + Send + Sync>) -> Self {
        self.email_fetcher = Some(fetcher);
        self
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
                    let calendar_section = self.format_calendar_section(&events, user_tz);
                    sections.push(calendar_section);
                }
                Err(e) => {
                    tracing::warn!("Failed to fetch calendar events for briefing: {}", e);
                    sections.push(
                        "Calendar: Unable to fetch today's events. Please check your calendar connection."
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

        // Weather (placeholder for future implementation)
        if config.include_weather {
            sections.push("Weather: Weather integration coming soon.".to_string());
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

    /// Formats the calendar section of the briefing.
    fn format_calendar_section(&self, events: &[CalendarEvent], user_tz: Tz) -> String {
        if events.is_empty() {
            return "Calendar: You have no meetings scheduled for today.".to_string();
        }

        let event_count = events.len();
        let mut lines = vec![format!(
            "Calendar: You have {} meeting{} today:",
            event_count,
            if event_count == 1 { "" } else { "s" }
        )];

        for event in events {
            let time_str = self.format_event_time(&event.start, user_tz);
            let title = &event.title;

            let mut event_line = format!("- {}: {}", time_str, title);

            // Add location if available
            if let Some(location) = &event.location {
                if !location.is_empty() {
                    event_line.push_str(&format!(" ({})", location));
                }
            }

            // Add meeting URL if available
            if let Some(url) = &event.meeting_url {
                if !url.is_empty() {
                    event_line.push_str(" [Online]");
                }
            }

            lines.push(event_line);
        }

        lines.join("\n")
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
        let section = generator.format_calendar_section(&events, tz);
        assert_eq!(
            section,
            "Calendar: You have no meetings scheduled for today."
        );
    }
}
