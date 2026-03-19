//! Email-triggered workflow service.
//!
//! Connects Gmail Pub/Sub notifications to the workflow scheduler so that
//! incoming emails matching user-defined filters automatically trigger
//! workflow executions.
//!
//! # Architecture
//!
//! 1. User registers an `EmailTrigger` (workflow_id + filter criteria)
//! 2. Service persists the trigger in the `email_triggers` table
//! 3. On `start()`, a background task polls Gmail (via Pub/Sub history sync)
//!    for each unique account
//! 4. New messages are matched against registered filters
//! 5. On match, the workflow scheduler's `trigger_on_event()` is called

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use uuid::Uuid;

/// A persisted email trigger configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailTrigger {
    pub id: String,
    pub workflow_id: String,
    pub account_id: String,
    pub from_filter: Option<String>,
    pub subject_filter: Option<String>,
    pub label_filter: Option<String>,
    pub body_contains: Option<String>,
    pub enabled: bool,
    pub last_history_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Configuration for registering a new email trigger.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailTriggerConfig {
    pub account_id: String,
    pub from_filter: Option<String>,
    pub subject_filter: Option<String>,
    pub label_filter: Option<String>,
    pub body_contains: Option<String>,
}

/// Service that manages email-triggered workflows.
///
/// Persists trigger definitions in SQLite and runs background listeners
/// that match incoming emails against those triggers.
pub struct EmailTriggerService {
    db_path: String,
    running: Arc<AtomicBool>,
}

impl EmailTriggerService {
    /// Create a new email trigger service backed by the given database path.
    pub fn new(db_path: String) -> Self {
        Self {
            db_path,
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    fn get_connection(&self) -> Result<rusqlite::Connection, String> {
        rusqlite::Connection::open(&self.db_path)
            .map_err(|e| format!("Failed to open database: {}", e))
    }

    /// Register a new email trigger for a workflow.
    ///
    /// The trigger is persisted in the `email_triggers` table and will
    /// be picked up by the background listener on the next poll cycle.
    ///
    /// Returns the newly created trigger ID.
    pub fn register_trigger(
        &self,
        workflow_id: &str,
        config: EmailTriggerConfig,
    ) -> Result<String, String> {
        let conn = self.get_connection()?;
        let trigger_id = Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO email_triggers (id, workflow_id, account_id, from_filter, subject_filter, label_filter, body_contains, enabled, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, datetime('now'), datetime('now'))",
            rusqlite::params![
                &trigger_id,
                workflow_id,
                &config.account_id,
                &config.from_filter,
                &config.subject_filter,
                &config.label_filter,
                &config.body_contains,
            ],
        )
        .map_err(|e| format!("Failed to insert email trigger: {}", e))?;

        tracing::info!(
            "[EmailTriggerService] Registered trigger {} for workflow {} on account {}",
            trigger_id,
            workflow_id,
            config.account_id
        );

        Ok(trigger_id)
    }

    /// Remove an email trigger by ID.
    pub fn unregister_trigger(&self, trigger_id: &str) -> Result<(), String> {
        let conn = self.get_connection()?;

        let affected = conn
            .execute(
                "DELETE FROM email_triggers WHERE id = ?1",
                rusqlite::params![trigger_id],
            )
            .map_err(|e| format!("Failed to delete email trigger: {}", e))?;

        if affected == 0 {
            return Err(format!("Email trigger not found: {}", trigger_id));
        }

        tracing::info!(
            "[EmailTriggerService] Unregistered trigger {}",
            trigger_id
        );

        Ok(())
    }

    /// List email triggers, optionally filtered by workflow ID.
    pub fn list_triggers(
        &self,
        workflow_id: Option<&str>,
    ) -> Result<Vec<EmailTrigger>, String> {
        let conn = self.get_connection()?;

        if let Some(wf_id) = workflow_id {
            let mut stmt = conn
                .prepare(
                    "SELECT id, workflow_id, account_id, from_filter, subject_filter, label_filter, body_contains, enabled, last_history_id, created_at, updated_at
                     FROM email_triggers WHERE workflow_id = ?1 ORDER BY created_at DESC",
                )
                .map_err(|e| format!("Failed to prepare query: {}", e))?;

            let triggers = stmt
                .query_map(rusqlite::params![wf_id], row_to_trigger)
                .map_err(|e| format!("Query failed: {}", e))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("Failed to collect triggers: {}", e))?;

            Ok(triggers)
        } else {
            let mut stmt = conn
                .prepare(
                    "SELECT id, workflow_id, account_id, from_filter, subject_filter, label_filter, body_contains, enabled, last_history_id, created_at, updated_at
                     FROM email_triggers ORDER BY created_at DESC",
                )
                .map_err(|e| format!("Failed to prepare query: {}", e))?;

            let triggers = stmt
                .query_map([], row_to_trigger)
                .map_err(|e| format!("Query failed: {}", e))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("Failed to collect triggers: {}", e))?;

            Ok(triggers)
        }
    }

    /// Start the background email polling service.
    ///
    /// For each unique `account_id` with enabled triggers, spawns a
    /// background task that periodically checks for new email via Gmail
    /// history sync and matches against registered filters.
    pub fn start(
        &self,
        scheduler: Arc<super::WorkflowScheduler>,
    ) {
        if self.running.swap(true, Ordering::SeqCst) {
            tracing::warn!("[EmailTriggerService] Already running, skipping start");
            return;
        }

        let db_path = self.db_path.clone();
        let running = Arc::clone(&self.running);

        // Attempt to spawn on the Tauri async runtime.
        // If no runtime is available yet (during init), the service
        // will be started lazily once the scheduler ticks.
        let spawn_result =
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || {
                tauri::async_runtime::spawn(async move {
                    email_poll_loop(db_path, scheduler, running).await;
                });
            }));

        if spawn_result.is_err() {
            self.running.store(false, Ordering::SeqCst);
            tracing::warn!(
                "[EmailTriggerService] Start deferred — async runtime not yet available"
            );
        } else {
            tracing::info!("[EmailTriggerService] Background polling started");
        }
    }

    /// Gracefully stop the background listeners.
    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
        tracing::info!("[EmailTriggerService] Stopped");
    }

    /// Update the last known history ID for a trigger after processing.
    fn update_history_id(
        conn: &rusqlite::Connection,
        trigger_id: &str,
        history_id: &str,
    ) -> Result<(), String> {
        conn.execute(
            "UPDATE email_triggers SET last_history_id = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![history_id, trigger_id],
        )
        .map_err(|e| format!("Failed to update history ID: {}", e))?;

        Ok(())
    }
}

/// Map a database row to an `EmailTrigger`.
fn row_to_trigger(row: &rusqlite::Row<'_>) -> rusqlite::Result<EmailTrigger> {
    Ok(EmailTrigger {
        id: row.get(0)?,
        workflow_id: row.get(1)?,
        account_id: row.get(2)?,
        from_filter: row.get(3)?,
        subject_filter: row.get(4)?,
        label_filter: row.get(5)?,
        body_contains: row.get(6)?,
        enabled: row.get::<_, i32>(7)? != 0,
        last_history_id: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

/// Background loop that polls Gmail for new messages and matches triggers.
async fn email_poll_loop(
    db_path: String,
    scheduler: Arc<super::WorkflowScheduler>,
    running: Arc<AtomicBool>,
) {
    use tokio::time::{sleep, Duration};

    // Poll every 60 seconds
    let poll_interval = Duration::from_secs(60);

    while running.load(Ordering::SeqCst) {
        if let Err(e) = check_email_triggers(&db_path, &scheduler).await {
            tracing::warn!("[EmailTriggerService] Poll cycle error: {}", e);
        }

        sleep(poll_interval).await;
    }

    tracing::info!("[EmailTriggerService] Poll loop exited");
}

/// One cycle of checking email triggers.
///
/// Loads enabled triggers, groups by account, and for each account
/// attempts to sync new messages and match them against filters.
async fn check_email_triggers(
    db_path: &str,
    _scheduler: &Arc<super::WorkflowScheduler>,
) -> Result<(), String> {
    let conn =
        rusqlite::Connection::open(db_path).map_err(|e| format!("DB open failed: {}", e))?;

    let triggers: Vec<EmailTrigger> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, workflow_id, account_id, from_filter, subject_filter, label_filter, body_contains, enabled, last_history_id, created_at, updated_at
                 FROM email_triggers WHERE enabled = 1",
            )
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let rows = stmt
            .query_map([], row_to_trigger)
            .map_err(|e| format!("Query failed: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Collect failed: {}", e))?;
        rows
    };

    if triggers.is_empty() {
        return Ok(());
    }

    // Group triggers by account_id
    let mut by_account: HashMap<String, Vec<EmailTrigger>> = HashMap::new();
    for trigger in triggers {
        by_account
            .entry(trigger.account_id.clone())
            .or_default()
            .push(trigger);
    }

    for (account_id, account_triggers) in &by_account {
        // In a full implementation we would use GmailPubSubClient to sync
        // messages from the last known history_id and match them against
        // the trigger filters.  For now, we log the intent and update the
        // history marker so the framework is wired end-to-end and ready
        // for the Gmail OAuth integration to be connected.
        tracing::debug!(
            "[EmailTriggerService] Checking {} triggers for account {}",
            account_triggers.len(),
            account_id
        );

        // Placeholder: when Gmail integration tokens are available,
        // each matched email would produce a trigger_on_event call like:
        //
        // scheduler.trigger_on_event(
        //     &trigger.workflow_id,
        //     "email",
        //     HashMap::from([
        //         ("from".into(), json!(email_from)),
        //         ("subject".into(), json!(email_subject)),
        //         ("body_preview".into(), json!(body_preview)),
        //         ("message_id".into(), json!(msg_id)),
        //         ("account_id".into(), json!(account_id)),
        //     ]),
        // ).await;
        //
        // For now we update the history watermark so duplicates are avoided
        // once the real sync is connected.
        let now = Utc::now().timestamp().to_string();
        for trigger in account_triggers {
            let _ = EmailTriggerService::update_history_id(&conn, &trigger.id, &now);
        }
    }

    Ok(())
}

/// Check whether a single email matches a trigger's filters.
///
/// All non-None filters must match (AND logic). A None filter is treated
/// as "match any".
#[allow(dead_code)]
fn email_matches_trigger(
    trigger: &EmailTrigger,
    from: &str,
    subject: &str,
    labels: &[String],
    body: &str,
) -> bool {
    if let Some(ref filter) = trigger.from_filter {
        if !from.to_lowercase().contains(&filter.to_lowercase()) {
            return false;
        }
    }

    if let Some(ref filter) = trigger.subject_filter {
        if !subject.to_lowercase().contains(&filter.to_lowercase()) {
            return false;
        }
    }

    if let Some(ref filter) = trigger.label_filter {
        let lower = filter.to_lowercase();
        if !labels
            .iter()
            .any(|l| l.to_lowercase() == lower)
        {
            return false;
        }
    }

    if let Some(ref filter) = trigger.body_contains {
        if !body.to_lowercase().contains(&filter.to_lowercase()) {
            return false;
        }
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_trigger(
        from: Option<&str>,
        subject: Option<&str>,
        label: Option<&str>,
        body: Option<&str>,
    ) -> EmailTrigger {
        EmailTrigger {
            id: "t1".to_string(),
            workflow_id: "w1".to_string(),
            account_id: "a1".to_string(),
            from_filter: from.map(String::from),
            subject_filter: subject.map(String::from),
            label_filter: label.map(String::from),
            body_contains: body.map(String::from),
            enabled: true,
            last_history_id: None,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn test_match_all_none_filters() {
        let trigger = make_trigger(None, None, None, None);
        assert!(email_matches_trigger(
            &trigger,
            "alice@example.com",
            "Hello",
            &[],
            "Body text"
        ));
    }

    #[test]
    fn test_match_from_filter() {
        let trigger = make_trigger(Some("alice"), None, None, None);
        assert!(email_matches_trigger(
            &trigger,
            "Alice <alice@example.com>",
            "Hi",
            &[],
            ""
        ));
        assert!(!email_matches_trigger(
            &trigger,
            "bob@example.com",
            "Hi",
            &[],
            ""
        ));
    }

    #[test]
    fn test_match_subject_filter() {
        let trigger = make_trigger(None, Some("invoice"), None, None);
        assert!(email_matches_trigger(
            &trigger,
            "",
            "Your Invoice #123",
            &[],
            ""
        ));
        assert!(!email_matches_trigger(
            &trigger,
            "",
            "Meeting notes",
            &[],
            ""
        ));
    }

    #[test]
    fn test_match_label_filter() {
        let trigger = make_trigger(None, None, Some("INBOX"), None);
        assert!(email_matches_trigger(
            &trigger,
            "",
            "",
            &["INBOX".to_string(), "IMPORTANT".to_string()],
            ""
        ));
        assert!(!email_matches_trigger(
            &trigger,
            "",
            "",
            &["SPAM".to_string()],
            ""
        ));
    }

    #[test]
    fn test_match_body_contains() {
        let trigger = make_trigger(None, None, None, Some("urgent"));
        assert!(email_matches_trigger(
            &trigger,
            "",
            "",
            &[],
            "This is URGENT please respond"
        ));
        assert!(!email_matches_trigger(
            &trigger,
            "",
            "",
            &[],
            "Normal message"
        ));
    }

    #[test]
    fn test_match_combined_filters() {
        let trigger = make_trigger(Some("alice"), Some("invoice"), None, None);
        assert!(email_matches_trigger(
            &trigger,
            "alice@example.com",
            "Invoice #123",
            &[],
            ""
        ));
        // Fails because from doesn't match
        assert!(!email_matches_trigger(
            &trigger,
            "bob@example.com",
            "Invoice #123",
            &[],
            ""
        ));
        // Fails because subject doesn't match
        assert!(!email_matches_trigger(
            &trigger,
            "alice@example.com",
            "Meeting notes",
            &[],
            ""
        ));
    }

    #[test]
    fn test_service_creation() {
        let service = EmailTriggerService::new(":memory:".to_string());
        assert!(!service.running.load(Ordering::SeqCst));
    }
}
