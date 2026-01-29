//! Form Undo Manager for AGI Workforce
//!
//! Provides undo capability for web form submissions during browser automation.
//! This module tracks form submissions and allows reverting them when possible
//! by navigating back and refilling the form with original values.
//!
//! # Safety Limitations
//!
//! Some forms cannot be undone:
//! - Payment forms (credit card submissions, purchase confirmations)
//! - Account deletion forms
//! - Password change forms (after confirmation)
//! - Forms that trigger irreversible external actions (emails, SMS)
//!
//! # Example
//!
//! ```rust,ignore
//! use crate::core::agent::form_undo::{FormUndoManager, FormSubmission};
//!
//! let mut manager = FormUndoManager::new(100);
//!
//! // Record a form submission before submitting
//! let submission = manager.record_submission(
//!     "https://example.com/contact",
//!     "#contact-form",
//!     vec![
//!         ("name".to_string(), "John Doe".to_string()),
//!         ("email".to_string(), "john@example.com".to_string()),
//!     ].into_iter().collect(),
//!     true, // can_undo
//! );
//!
//! // Later, attempt to undo
//! if manager.can_undo(&submission.id) {
//!     let result = manager.undo_submission(&submission.id);
//! }
//! ```

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::sync::RwLock;
use uuid::Uuid;

/// Represents a recorded form submission that may be undoable.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormSubmission {
    /// Unique identifier for this submission
    pub id: String,
    /// URL where the form was submitted
    pub url: String,
    /// CSS selector for the form element
    pub form_selector: String,
    /// Field name to value mapping at time of submission
    pub field_values: HashMap<String, String>,
    /// Timestamp when the form was submitted
    pub submitted_at: DateTime<Utc>,
    /// Whether this submission can potentially be undone
    pub can_undo: bool,
    /// Optional task ID that triggered this submission
    pub task_id: Option<String>,
    /// Whether the submission has been reverted
    pub reverted: bool,
    /// Reason why undo is not possible (if can_undo is false)
    pub undo_restriction_reason: Option<String>,
    /// The HTTP method used (GET, POST, etc.)
    pub method: Option<String>,
    /// The form action URL (where data was posted)
    pub action_url: Option<String>,
}

impl FormSubmission {
    /// Creates a new form submission record.
    pub fn new(
        url: String,
        form_selector: String,
        field_values: HashMap<String, String>,
        can_undo: bool,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            url,
            form_selector,
            field_values,
            submitted_at: Utc::now(),
            can_undo,
            task_id: None,
            reverted: false,
            undo_restriction_reason: None,
            method: None,
            action_url: None,
        }
    }

    /// Creates a submission record marked as non-undoable with a reason.
    pub fn new_non_undoable(
        url: String,
        form_selector: String,
        field_values: HashMap<String, String>,
        reason: String,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            url,
            form_selector,
            field_values,
            submitted_at: Utc::now(),
            can_undo: false,
            task_id: None,
            reverted: false,
            undo_restriction_reason: Some(reason),
            method: None,
            action_url: None,
        }
    }

    /// Sets the task ID associated with this submission.
    pub fn with_task_id(mut self, task_id: String) -> Self {
        self.task_id = Some(task_id);
        self
    }

    /// Sets the HTTP method used for the submission.
    pub fn with_method(mut self, method: String) -> Self {
        self.method = Some(method);
        self
    }

    /// Sets the form action URL.
    pub fn with_action_url(mut self, action_url: String) -> Self {
        self.action_url = Some(action_url);
        self
    }
}

/// Result of an undo attempt for a form submission.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormUndoResult {
    /// Whether the undo was successful
    pub success: bool,
    /// The submission ID that was undone
    pub submission_id: String,
    /// Human-readable message describing the result
    pub message: String,
    /// Instructions for completing the undo (if manual steps needed)
    pub instructions: Option<Vec<String>>,
    /// The URL to navigate to for undo
    pub navigate_to: Option<String>,
    /// Fields to refill after navigation
    pub fields_to_refill: Option<HashMap<String, String>>,
}

/// Patterns that indicate a form should not be undoable.
const DESTRUCTIVE_PATTERNS: &[&str] = &[
    "payment",
    "checkout",
    "purchase",
    "buy",
    "order",
    "delete",
    "remove",
    "cancel",
    "unsubscribe",
    "password",
    "credit-card",
    "creditcard",
    "billing",
    "transfer",
    "send-money",
    "wire",
];

/// Field names that indicate sensitive/payment data.
const SENSITIVE_FIELDS: &[&str] = &[
    "card",
    "cvv",
    "cvc",
    "expiry",
    "exp_month",
    "exp_year",
    "card_number",
    "account_number",
    "routing_number",
    "ssn",
    "social_security",
    "password",
    "new_password",
    "confirm_password",
];

/// Manages form submission history and undo operations.
pub struct FormUndoManager {
    state: RwLock<FormUndoManagerState>,
}

struct FormUndoManagerState {
    submissions: Vec<FormSubmission>,
    max_history: usize,
}

impl FormUndoManager {
    /// Creates a new FormUndoManager with the specified maximum history size.
    pub fn new(max_history: usize) -> Self {
        Self {
            state: RwLock::new(FormUndoManagerState {
                submissions: Vec::new(),
                max_history,
            }),
        }
    }

    /// Records a form submission before it is executed.
    ///
    /// # Arguments
    ///
    /// * `url` - The URL where the form is being submitted
    /// * `form_selector` - CSS selector for the form element
    /// * `field_values` - Map of field names to their values
    /// * `can_undo` - Whether this submission should be marked as undoable
    ///
    /// # Returns
    ///
    /// The created `FormSubmission` record.
    pub async fn record_submission(
        &self,
        url: String,
        form_selector: String,
        field_values: HashMap<String, String>,
        can_undo: bool,
    ) -> FormSubmission {
        let mut state = self.state.write().await;

        // Auto-detect if this should be non-undoable
        let (final_can_undo, restriction_reason) =
            Self::check_undo_eligibility(&url, &form_selector, &field_values, can_undo);

        let submission = if final_can_undo {
            FormSubmission::new(url, form_selector, field_values, true)
        } else {
            FormSubmission::new_non_undoable(
                url,
                form_selector,
                field_values,
                restriction_reason.unwrap_or_else(|| "Cannot be undone".to_string()),
            )
        };

        // Trim history if needed
        if state.submissions.len() >= state.max_history {
            // Remove oldest non-reverted submission
            if let Some(idx) = state.submissions.iter().position(|s| s.reverted) {
                state.submissions.remove(idx);
            } else if !state.submissions.is_empty() {
                state.submissions.remove(0);
            }
        }

        let result = submission.clone();
        state.submissions.push(submission);

        result
    }

    /// Records a submission with additional metadata.
    pub async fn record_submission_with_metadata(
        &self,
        url: String,
        form_selector: String,
        field_values: HashMap<String, String>,
        can_undo: bool,
        task_id: Option<String>,
        method: Option<String>,
        action_url: Option<String>,
    ) -> FormSubmission {
        let mut submission = self
            .record_submission(url, form_selector, field_values, can_undo)
            .await;

        // Update with metadata
        let mut state = self.state.write().await;
        if let Some(stored) = state.submissions.iter_mut().find(|s| s.id == submission.id) {
            stored.task_id = task_id.clone();
            stored.method = method.clone();
            stored.action_url = action_url.clone();
            submission = stored.clone();
        }

        submission
    }

    /// Checks if a submission can be undone based on URL, selector, and field patterns.
    fn check_undo_eligibility(
        url: &str,
        form_selector: &str,
        field_values: &HashMap<String, String>,
        requested_can_undo: bool,
    ) -> (bool, Option<String>) {
        // If explicitly marked as non-undoable, respect that
        if !requested_can_undo {
            return (false, Some("Marked as non-undoable by caller".to_string()));
        }

        let url_lower = url.to_lowercase();
        let selector_lower = form_selector.to_lowercase();

        // Check URL for destructive patterns
        for pattern in DESTRUCTIVE_PATTERNS {
            if url_lower.contains(pattern) {
                return (
                    false,
                    Some(format!(
                        "URL contains '{}' - likely a destructive action",
                        pattern
                    )),
                );
            }
            if selector_lower.contains(pattern) {
                return (
                    false,
                    Some(format!(
                        "Form selector contains '{}' - likely a destructive action",
                        pattern
                    )),
                );
            }
        }

        // Check field names for sensitive data
        for field_name in field_values.keys() {
            let field_lower = field_name.to_lowercase();
            for sensitive in SENSITIVE_FIELDS {
                if field_lower.contains(sensitive) {
                    return (
                        false,
                        Some(format!(
                            "Contains sensitive field '{}' - cannot be safely undone",
                            field_name
                        )),
                    );
                }
            }
        }

        (true, None)
    }

    /// Checks if a specific submission can be undone.
    pub async fn can_undo(&self, submission_id: &str) -> bool {
        let state = self.state.read().await;
        state
            .submissions
            .iter()
            .find(|s| s.id == submission_id)
            .map(|s| s.can_undo && !s.reverted)
            .unwrap_or(false)
    }

    /// Attempts to undo a form submission.
    ///
    /// This method does not actually perform the browser navigation - it returns
    /// the instructions needed to undo the submission. The caller is responsible
    /// for executing the browser automation steps.
    ///
    /// # Arguments
    ///
    /// * `submission_id` - The ID of the submission to undo
    ///
    /// # Returns
    ///
    /// A `FormUndoResult` containing instructions for undoing the submission.
    pub async fn undo_submission(&self, submission_id: &str) -> Result<FormUndoResult, String> {
        let mut state = self.state.write().await;

        let submission = state
            .submissions
            .iter_mut()
            .find(|s| s.id == submission_id)
            .ok_or_else(|| format!("Submission not found: {}", submission_id))?;

        if submission.reverted {
            return Err(format!(
                "Submission {} has already been reverted",
                submission_id
            ));
        }

        if !submission.can_undo {
            let reason = submission
                .undo_restriction_reason
                .clone()
                .unwrap_or_else(|| "Unknown reason".to_string());
            return Err(format!("Cannot undo submission: {}", reason));
        }

        // Mark as reverted
        submission.reverted = true;

        // Build undo instructions
        let mut instructions = Vec::new();
        instructions.push(format!("Navigate to: {}", submission.url));
        instructions.push(format!(
            "Locate form with selector: {}",
            submission.form_selector
        ));
        instructions.push("Clear existing form values".to_string());

        for field in submission.field_values.keys() {
            instructions.push(format!("Set field '{}' to original value", field));
        }

        Ok(FormUndoResult {
            success: true,
            submission_id: submission_id.to_string(),
            message: "Form submission can be undone. Follow the instructions to restore the form."
                .to_string(),
            instructions: Some(instructions),
            navigate_to: Some(submission.url.clone()),
            fields_to_refill: Some(submission.field_values.clone()),
        })
    }

    /// Gets recent form submissions, optionally filtered by task ID.
    pub async fn get_recent_submissions(
        &self,
        limit: Option<usize>,
        task_id: Option<&str>,
    ) -> Vec<FormSubmission> {
        let state = self.state.read().await;
        let limit = limit.unwrap_or(20);

        state
            .submissions
            .iter()
            .rev()
            .filter(|s| task_id.is_none() || s.task_id.as_deref() == task_id)
            .take(limit)
            .cloned()
            .collect()
    }

    /// Gets all undoable submissions.
    pub async fn get_undoable_submissions(&self) -> Vec<FormSubmission> {
        let state = self.state.read().await;
        state
            .submissions
            .iter()
            .filter(|s| s.can_undo && !s.reverted)
            .cloned()
            .collect()
    }

    /// Gets a specific submission by ID.
    pub async fn get_submission(&self, submission_id: &str) -> Option<FormSubmission> {
        let state = self.state.read().await;
        state
            .submissions
            .iter()
            .find(|s| s.id == submission_id)
            .cloned()
    }

    /// Clears all submission history.
    pub async fn clear_history(&self) {
        let mut state = self.state.write().await;
        state.submissions.clear();
    }

    /// Clears submissions older than the specified duration.
    pub async fn clear_old_submissions(&self, max_age_hours: u64) {
        let mut state = self.state.write().await;
        let cutoff = Utc::now() - chrono::Duration::hours(max_age_hours as i64);
        state.submissions.retain(|s| s.submitted_at > cutoff);
    }

    /// Gets the count of submissions in history.
    pub async fn submission_count(&self) -> usize {
        let state = self.state.read().await;
        state.submissions.len()
    }

    /// Gets the count of undoable submissions.
    pub async fn undoable_count(&self) -> usize {
        let state = self.state.read().await;
        state
            .submissions
            .iter()
            .filter(|s| s.can_undo && !s.reverted)
            .count()
    }
}

impl Default for FormUndoManager {
    fn default() -> Self {
        Self::new(100)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_record_submission() {
        let manager = FormUndoManager::new(10);

        let fields: HashMap<String, String> = vec![
            ("name".to_string(), "John".to_string()),
            ("email".to_string(), "john@example.com".to_string()),
        ]
        .into_iter()
        .collect();

        let submission = manager
            .record_submission(
                "https://example.com/contact".to_string(),
                "#contact-form".to_string(),
                fields.clone(),
                true,
            )
            .await;

        assert!(!submission.id.is_empty());
        assert!(submission.can_undo);
        assert!(!submission.reverted);
        assert_eq!(submission.field_values.len(), 2);
    }

    #[tokio::test]
    async fn test_payment_form_not_undoable() {
        let manager = FormUndoManager::new(10);

        let fields: HashMap<String, String> = vec![("amount".to_string(), "100".to_string())]
            .into_iter()
            .collect();

        let submission = manager
            .record_submission(
                "https://example.com/payment/checkout".to_string(),
                "#payment-form".to_string(),
                fields,
                true,
            )
            .await;

        assert!(!submission.can_undo);
        assert!(submission.undo_restriction_reason.is_some());
    }

    #[tokio::test]
    async fn test_sensitive_field_not_undoable() {
        let manager = FormUndoManager::new(10);

        let fields: HashMap<String, String> = vec![
            ("card_number".to_string(), "4111111111111111".to_string()),
            ("cvv".to_string(), "123".to_string()),
        ]
        .into_iter()
        .collect();

        let submission = manager
            .record_submission(
                "https://example.com/form".to_string(),
                "#form".to_string(),
                fields,
                true,
            )
            .await;

        assert!(!submission.can_undo);
    }

    #[tokio::test]
    async fn test_can_undo() {
        let manager = FormUndoManager::new(10);

        let fields: HashMap<String, String> = vec![("name".to_string(), "John".to_string())]
            .into_iter()
            .collect();

        let submission = manager
            .record_submission(
                "https://example.com/form".to_string(),
                "#form".to_string(),
                fields,
                true,
            )
            .await;

        assert!(manager.can_undo(&submission.id).await);
    }

    #[tokio::test]
    async fn test_undo_submission() {
        let manager = FormUndoManager::new(10);

        let fields: HashMap<String, String> = vec![
            ("name".to_string(), "John".to_string()),
            ("email".to_string(), "john@example.com".to_string()),
        ]
        .into_iter()
        .collect();

        let submission = manager
            .record_submission(
                "https://example.com/form".to_string(),
                "#form".to_string(),
                fields,
                true,
            )
            .await;

        let result = manager.undo_submission(&submission.id).await.unwrap();

        assert!(result.success);
        assert!(result.navigate_to.is_some());
        assert!(result.fields_to_refill.is_some());
        assert_eq!(result.fields_to_refill.unwrap().len(), 2);

        // Should not be able to undo again
        assert!(!manager.can_undo(&submission.id).await);
    }

    #[tokio::test]
    async fn test_clear_history() {
        let manager = FormUndoManager::new(10);

        let fields: HashMap<String, String> = vec![("name".to_string(), "John".to_string())]
            .into_iter()
            .collect();

        manager
            .record_submission(
                "https://example.com/form".to_string(),
                "#form".to_string(),
                fields,
                true,
            )
            .await;

        assert_eq!(manager.submission_count().await, 1);

        manager.clear_history().await;

        assert_eq!(manager.submission_count().await, 0);
    }

    #[tokio::test]
    async fn test_max_history_limit() {
        let manager = FormUndoManager::new(3);

        for i in 0..5 {
            let fields: HashMap<String, String> = vec![("name".to_string(), format!("User{}", i))]
                .into_iter()
                .collect();

            manager
                .record_submission(
                    format!("https://example.com/form{}", i),
                    "#form".to_string(),
                    fields,
                    true,
                )
                .await;
        }

        // Should be limited to max_history
        assert!(manager.submission_count().await <= 3);
    }

    #[tokio::test]
    async fn test_get_recent_submissions() {
        let manager = FormUndoManager::new(10);

        for i in 0..5 {
            let fields: HashMap<String, String> = vec![("name".to_string(), format!("User{}", i))]
                .into_iter()
                .collect();

            manager
                .record_submission(
                    format!("https://example.com/form{}", i),
                    "#form".to_string(),
                    fields,
                    true,
                )
                .await;
        }

        let recent = manager.get_recent_submissions(Some(3), None).await;
        assert_eq!(recent.len(), 3);

        // Should be in reverse order (most recent first)
        assert!(recent[0].url.contains("form4"));
    }

    #[tokio::test]
    async fn test_submission_with_task_id() {
        let manager = FormUndoManager::new(10);

        let fields: HashMap<String, String> = vec![("name".to_string(), "John".to_string())]
            .into_iter()
            .collect();

        let submission = manager
            .record_submission_with_metadata(
                "https://example.com/form".to_string(),
                "#form".to_string(),
                fields,
                true,
                Some("task-123".to_string()),
                Some("POST".to_string()),
                Some("https://example.com/submit".to_string()),
            )
            .await;

        assert_eq!(submission.task_id, Some("task-123".to_string()));
        assert_eq!(submission.method, Some("POST".to_string()));

        let filtered = manager.get_recent_submissions(None, Some("task-123")).await;
        assert_eq!(filtered.len(), 1);
    }
}
