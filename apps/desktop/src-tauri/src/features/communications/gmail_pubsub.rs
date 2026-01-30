//! Gmail Pub/Sub Integration for Real-Time Email Notifications
//!
//! This module provides real-time email notifications using Google Cloud Pub/Sub
//! and the Gmail API push notification system.
//!
//! # Architecture
//! 1. Set up a Gmail watch on the user's inbox
//! 2. Gmail sends notifications to a Pub/Sub topic when changes occur
//! 3. The client pulls messages from a Pub/Sub subscription
//! 4. On receiving a notification, sync emails since the last history ID
//!
//! # Example
//! ```ignore
//! let client = GmailPubSubClient::new(
//!     "my-project-id".to_string(),
//!     "my-subscription".to_string(),
//!     "oauth_access_token".to_string(),
//! );
//!
//! // Set up watch on inbox
//! let watch_response = client.setup_watch("projects/my-project/topics/gmail-notifications").await?;
//!
//! // Start streaming notifications
//! client.start_streaming(|notification| {
//!     println!("New email notification: {:?}", notification);
//! }).await?;
//! ```

use base64::Engine as _;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

use crate::sys::error::{Error, Result};

/// Gmail API base URL
const GMAIL_API_BASE: &str = "https://gmail.googleapis.com/gmail/v1";

/// Google Cloud Pub/Sub API base URL
const PUBSUB_API_BASE: &str = "https://pubsub.googleapis.com/v1";

/// Maximum number of messages to pull at once
const MAX_MESSAGES_PER_PULL: i32 = 10;

// AUDIT-004-015: Added limit for history sync to prevent unbounded fetching
/// Maximum number of history items to fetch in a single sync operation
const MAX_HISTORY_ITEMS: usize = 1000;

// ============================================================================
// Types
// ============================================================================

/// Response from Gmail watch setup
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchResponse {
    /// The history ID at the time of the watch setup
    pub history_id: String,
    /// Expiration time of the watch in milliseconds since epoch
    pub expiration: String,
}

/// Pub/Sub message wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PubSubMessage {
    /// Base64-encoded message data
    pub data: Option<String>,
    /// Message attributes
    #[serde(default)]
    pub attributes: std::collections::HashMap<String, String>,
    /// Message ID
    pub message_id: Option<String>,
    /// Publish time
    pub publish_time: Option<String>,
}

/// Received Pub/Sub message with acknowledgement ID
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceivedMessage {
    /// Acknowledgement ID for this message
    pub ack_id: String,
    /// The actual message content
    pub message: PubSubMessage,
}

/// Response from Pub/Sub pull request
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullResponse {
    /// List of received messages
    #[serde(default)]
    pub received_messages: Vec<ReceivedMessage>,
}

/// Parsed email notification from Gmail
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailNotification {
    /// The user's email address
    pub email_address: String,
    /// The history ID to sync from
    pub history_id: String,
    /// Timestamp when the notification was received
    pub received_at: i64,
}

/// Gmail history record for incremental sync
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRecord {
    /// History ID
    pub id: String,
    /// Messages added in this history entry
    #[serde(default)]
    pub messages_added: Vec<MessageAdded>,
    /// Messages deleted in this history entry
    #[serde(default)]
    pub messages_deleted: Vec<MessageDeleted>,
    /// Label changes
    #[serde(default)]
    pub labels_added: Vec<LabelChange>,
    #[serde(default)]
    pub labels_removed: Vec<LabelChange>,
}

/// Message added event
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageAdded {
    /// The message that was added
    pub message: MessageRef,
}

/// Message deleted event
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageDeleted {
    /// The message that was deleted
    pub message: MessageRef,
}

/// Reference to a message
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageRef {
    /// Message ID
    pub id: String,
    /// Thread ID
    pub thread_id: String,
    /// Label IDs
    #[serde(default)]
    pub label_ids: Vec<String>,
}

/// Label change event
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelChange {
    /// The message affected
    pub message: MessageRef,
    /// Label IDs involved in the change
    #[serde(default)]
    pub label_ids: Vec<String>,
}

/// Response from Gmail history list
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryResponse {
    /// History records
    #[serde(default)]
    pub history: Vec<HistoryRecord>,
    /// Next page token for pagination
    pub next_page_token: Option<String>,
    /// Current history ID
    pub history_id: String,
}

/// Watch request body
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WatchRequest {
    /// Pub/Sub topic to publish to
    topic_name: String,
    /// Label IDs to watch (empty means all)
    #[serde(skip_serializing_if = "Vec::is_empty")]
    label_ids: Vec<String>,
    /// Filter expression
    #[serde(skip_serializing_if = "Option::is_none")]
    label_filter_action: Option<String>,
}

/// Pub/Sub pull request body
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PullRequest {
    /// Maximum number of messages to return
    max_messages: i32,
}

/// Pub/Sub acknowledge request body
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AcknowledgeRequest {
    /// Acknowledgement IDs
    ack_ids: Vec<String>,
}

// ============================================================================
// Client
// ============================================================================

/// Gmail Pub/Sub client for real-time email notifications
pub struct GmailPubSubClient {
    /// Google Cloud project ID
    project_id: String,
    /// Pub/Sub subscription name (without full path)
    subscription_name: String,
    /// OAuth 2.0 access token
    oauth_token: String,
    /// HTTP client
    client: Client,
    /// Flag to control streaming loop
    is_running: Arc<AtomicBool>,
    /// Last known history ID
    last_history_id: Option<String>,
}

impl GmailPubSubClient {
    /// Create a new Gmail Pub/Sub client
    ///
    /// # Arguments
    /// * `project_id` - Google Cloud project ID
    /// * `subscription_name` - Pub/Sub subscription name (not the full path)
    /// * `oauth_token` - OAuth 2.0 access token with Gmail and Pub/Sub scopes
    ///
    /// # Example
    /// ```ignore
    /// let client = GmailPubSubClient::new(
    ///     "my-gcp-project".to_string(),
    ///     "gmail-notifications-sub".to_string(),
    ///     "ya29.access_token_here".to_string(),
    /// );
    /// ```
    pub fn new(project_id: String, subscription_name: String, oauth_token: String) -> Result<Self> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .map_err(|e| Error::Other(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self {
            project_id,
            subscription_name,
            oauth_token,
            client,
            is_running: Arc::new(AtomicBool::new(false)),
            last_history_id: None,
        })
    }

    /// Update the OAuth token
    ///
    /// Use this when the token has been refreshed.
    pub fn set_oauth_token(&mut self, token: String) {
        self.oauth_token = token;
    }

    /// Get the full subscription path
    fn subscription_path(&self) -> String {
        format!(
            "projects/{}/subscriptions/{}",
            self.project_id, self.subscription_name
        )
    }

    /// Set up a Gmail watch for inbox changes
    ///
    /// This configures Gmail to send push notifications to a Pub/Sub topic
    /// when changes occur in the user's mailbox.
    ///
    /// # Arguments
    /// * `topic_name` - Full Pub/Sub topic name (e.g., "projects/my-project/topics/gmail-push")
    ///
    /// # Returns
    /// `WatchResponse` containing the initial history ID and expiration time
    ///
    /// # Errors
    /// Returns an error if the API call fails or the response cannot be parsed
    pub async fn setup_watch(&mut self, topic_name: &str) -> Result<WatchResponse> {
        info!("Setting up Gmail watch with topic: {}", topic_name);

        let url = format!("{}/users/me/watch", GMAIL_API_BASE);

        let request_body = WatchRequest {
            topic_name: topic_name.to_string(),
            label_ids: vec!["INBOX".to_string()],
            label_filter_action: Some("include".to_string()),
        };

        let response = self
            .client
            .post(&url)
            .bearer_auth(&self.oauth_token)
            .json(&request_body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            error!("Failed to set up Gmail watch: {} - {}", status, error_text);
            return Err(Error::Other(format!(
                "Failed to set up Gmail watch: {} - {}",
                status, error_text
            )));
        }

        let watch_response: WatchResponse = response
            .json()
            .await
            .map_err(|e| Error::Other(format!("Failed to parse watch response: {}", e)))?;

        self.last_history_id = Some(watch_response.history_id.clone());

        info!(
            "Gmail watch set up successfully. History ID: {}, Expiration: {}",
            watch_response.history_id, watch_response.expiration
        );

        Ok(watch_response)
    }

    /// Start streaming pull for notifications
    ///
    /// This method runs a continuous loop that pulls messages from the Pub/Sub
    /// subscription and sends parsed notifications through the provided channel.
    ///
    /// # Arguments
    /// * `notification_tx` - Channel sender for email notifications
    ///
    /// # Returns
    /// This method returns when `stop_watch()` is called or an unrecoverable error occurs
    ///
    /// # Example
    /// ```ignore
    /// let (tx, mut rx) = mpsc::channel(100);
    ///
    /// // Start streaming in a background task
    /// tokio::spawn(async move {
    ///     client.start_streaming(tx).await.unwrap();
    /// });
    ///
    /// // Process notifications
    /// while let Some(notification) = rx.recv().await {
    ///     println!("Got notification: {:?}", notification);
    /// }
    /// ```
    pub async fn start_streaming(
        &self,
        notification_tx: mpsc::Sender<EmailNotification>,
    ) -> Result<()> {
        info!("Starting Pub/Sub streaming pull");
        self.is_running.store(true, Ordering::SeqCst);

        let subscription_path = self.subscription_path();
        let pull_url = format!("{}/{}:pull", PUBSUB_API_BASE, subscription_path);
        let ack_url = format!("{}/{}:acknowledge", PUBSUB_API_BASE, subscription_path);

        while self.is_running.load(Ordering::SeqCst) {
            match self.pull_messages(&pull_url).await {
                Ok(messages) => {
                    if messages.is_empty() {
                        // No messages, wait a bit before polling again
                        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                        continue;
                    }

                    let mut ack_ids = Vec::new();

                    for received in messages {
                        ack_ids.push(received.ack_id.clone());

                        if let Some(notification) = self.parse_notification(&received.message) {
                            if notification_tx.send(notification).await.is_err() {
                                warn!("Notification channel closed, stopping streaming");
                                self.is_running.store(false, Ordering::SeqCst);
                                break;
                            }
                        }
                    }

                    // Acknowledge processed messages
                    if !ack_ids.is_empty() {
                        if let Err(e) = self.acknowledge_messages(&ack_url, ack_ids).await {
                            warn!("Failed to acknowledge messages: {}", e);
                        }
                    }
                }
                Err(e) => {
                    error!("Error pulling messages: {}", e);
                    // Back off on error
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                }
            }
        }

        info!("Pub/Sub streaming stopped");
        Ok(())
    }

    /// Pull messages from the subscription
    async fn pull_messages(&self, url: &str) -> Result<Vec<ReceivedMessage>> {
        let request_body = PullRequest {
            max_messages: MAX_MESSAGES_PER_PULL,
        };

        let response = self
            .client
            .post(url)
            .bearer_auth(&self.oauth_token)
            .json(&request_body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(Error::Other(format!(
                "Failed to pull messages: {} - {}",
                status, error_text
            )));
        }

        let pull_response: PullResponse = response
            .json()
            .await
            .map_err(|e| Error::Other(format!("Failed to parse pull response: {}", e)))?;

        debug!(
            "Pulled {} messages from Pub/Sub",
            pull_response.received_messages.len()
        );

        Ok(pull_response.received_messages)
    }

    /// Acknowledge processed messages
    async fn acknowledge_messages(&self, url: &str, ack_ids: Vec<String>) -> Result<()> {
        let request_body = AcknowledgeRequest { ack_ids };

        let response = self
            .client
            .post(url)
            .bearer_auth(&self.oauth_token)
            .json(&request_body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(Error::Other(format!(
                "Failed to acknowledge messages: {} - {}",
                status, error_text
            )));
        }

        debug!("Acknowledged {} messages", request_body.ack_ids.len());
        Ok(())
    }

    /// Parse a Pub/Sub message into an email notification
    fn parse_notification(&self, message: &PubSubMessage) -> Option<EmailNotification> {
        let data = message.data.as_ref()?;

        // Decode base64 data
        let decoded = match base64::engine::general_purpose::STANDARD.decode(data) {
            Ok(bytes) => bytes,
            Err(e) => {
                warn!("Failed to decode base64 message data: {}", e);
                return None;
            }
        };

        // Parse JSON
        let json_str = match String::from_utf8(decoded) {
            Ok(s) => s,
            Err(e) => {
                warn!("Failed to decode message as UTF-8: {}", e);
                return None;
            }
        };

        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct GmailNotification {
            email_address: String,
            history_id: u64,
        }

        match serde_json::from_str::<GmailNotification>(&json_str) {
            Ok(notification) => Some(EmailNotification {
                email_address: notification.email_address,
                history_id: notification.history_id.to_string(),
                received_at: chrono::Utc::now().timestamp(),
            }),
            Err(e) => {
                warn!("Failed to parse Gmail notification: {}", e);
                None
            }
        }
    }

    /// Sync emails since the given history ID
    ///
    /// This fetches all changes (added, deleted, label changes) since the
    /// specified history ID, up to MAX_HISTORY_ITEMS.
    ///
    /// # Arguments
    /// * `history_id` - The history ID to start syncing from
    ///
    /// # Returns
    /// List of history records containing all changes (limited to MAX_HISTORY_ITEMS)
    ///
    /// # Errors
    /// Returns an error if the API call fails
    // AUDIT-004-015: Added MAX_HISTORY_ITEMS limit to prevent unbounded fetching
    pub async fn sync_from_history(&mut self, history_id: &str) -> Result<Vec<HistoryRecord>> {
        info!("Syncing emails from history ID: {}", history_id);

        let mut all_history = Vec::new();
        let mut page_token: Option<String> = None;

        loop {
            // Stop if we've reached the maximum history items limit
            if all_history.len() >= MAX_HISTORY_ITEMS {
                warn!(
                    "Reached maximum history items limit ({}), stopping sync",
                    MAX_HISTORY_ITEMS
                );
                break;
            }

            let mut url = format!(
                "{}/users/me/history?startHistoryId={}",
                GMAIL_API_BASE, history_id
            );

            if let Some(token) = &page_token {
                url.push_str(&format!("&pageToken={}", token));
            }

            let response = self
                .client
                .get(&url)
                .bearer_auth(&self.oauth_token)
                .send()
                .await?;

            if !response.status().is_success() {
                let status = response.status();
                let error_text = response.text().await.unwrap_or_default();

                // Handle case where history ID is too old
                if status == reqwest::StatusCode::NOT_FOUND || error_text.contains("historyId") {
                    warn!(
                        "History ID {} is no longer valid, full sync required",
                        history_id
                    );
                    return Err(Error::Other(
                        "History ID expired, full sync required".to_string(),
                    ));
                }

                return Err(Error::Other(format!(
                    "Failed to list history: {} - {}",
                    status, error_text
                )));
            }

            let history_response: HistoryResponse = response
                .json()
                .await
                .map_err(|e| Error::Other(format!("Failed to parse history response: {}", e)))?;

            // Update last known history ID
            self.last_history_id = Some(history_response.history_id.clone());

            all_history.extend(history_response.history);

            // Check limit again after extending
            if all_history.len() >= MAX_HISTORY_ITEMS {
                all_history.truncate(MAX_HISTORY_ITEMS);
                warn!("Truncated history to {} items", MAX_HISTORY_ITEMS);
                break;
            }

            match history_response.next_page_token {
                Some(token) => page_token = Some(token),
                None => break,
            }
        }

        info!("Synced {} history records", all_history.len());
        Ok(all_history)
    }

    /// Stop the watch and streaming
    ///
    /// This stops the Gmail watch and the streaming pull loop.
    ///
    /// # Errors
    /// Returns an error if the stop watch API call fails
    pub async fn stop_watch(&self) -> Result<()> {
        info!("Stopping Gmail watch");

        // Stop the streaming loop
        self.is_running.store(false, Ordering::SeqCst);

        // Call Gmail API to stop the watch
        let url = format!("{}/users/me/stop", GMAIL_API_BASE);

        let response = self
            .client
            .post(&url)
            .bearer_auth(&self.oauth_token)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            warn!("Failed to stop Gmail watch: {} - {}", status, error_text);
            // Don't return error as the streaming is already stopped
        }

        info!("Gmail watch stopped");
        Ok(())
    }

    /// Check if the client is currently streaming
    #[must_use]
    pub fn is_streaming(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }

    /// Get the last known history ID
    #[must_use]
    pub fn last_history_id(&self) -> Option<&str> {
        self.last_history_id.as_deref()
    }

    /// Set the last history ID
    ///
    /// Use this to restore state from persistent storage.
    pub fn set_last_history_id(&mut self, history_id: String) {
        self.last_history_id = Some(history_id);
    }

    /// Modify the acknowledgement deadline for a message
    ///
    /// Extends or shortens the deadline for acknowledging a message.
    /// Useful when processing takes longer than expected.
    ///
    /// # Arguments
    /// * `ack_ids` - Acknowledgement IDs to modify
    /// * `deadline_seconds` - New deadline in seconds (0 to nack)
    #[allow(dead_code)]
    pub async fn modify_ack_deadline(
        &self,
        ack_ids: Vec<String>,
        deadline_seconds: i32,
    ) -> Result<()> {
        let subscription_path = self.subscription_path();
        let url = format!(
            "{}/{}:modifyAckDeadline",
            PUBSUB_API_BASE, subscription_path
        );

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct ModifyAckDeadlineRequest {
            ack_ids: Vec<String>,
            ack_deadline_seconds: i32,
        }

        let request_body = ModifyAckDeadlineRequest {
            ack_ids,
            ack_deadline_seconds: deadline_seconds,
        };

        let response = self
            .client
            .post(&url)
            .bearer_auth(&self.oauth_token)
            .json(&request_body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(Error::Other(format!(
                "Failed to modify ack deadline: {} - {}",
                status, error_text
            )));
        }

        Ok(())
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_creation() {
        let client = GmailPubSubClient::new(
            "test-project".to_string(),
            "test-subscription".to_string(),
            "test-token".to_string(),
        )
        .expect("Failed to create client");

        assert!(!client.is_streaming());
        assert!(client.last_history_id().is_none());
    }

    #[test]
    fn test_subscription_path() {
        let client = GmailPubSubClient::new(
            "my-project".to_string(),
            "my-subscription".to_string(),
            "token".to_string(),
        )
        .expect("Failed to create client");

        assert_eq!(
            client.subscription_path(),
            "projects/my-project/subscriptions/my-subscription"
        );
    }

    #[test]
    fn test_set_oauth_token() {
        let mut client = GmailPubSubClient::new(
            "project".to_string(),
            "sub".to_string(),
            "old-token".to_string(),
        )
        .expect("Failed to create client");

        client.set_oauth_token("new-token".to_string());
        // Token is private, but we can verify it doesn't panic
    }

    #[test]
    fn test_set_last_history_id() {
        let mut client = GmailPubSubClient::new(
            "project".to_string(),
            "sub".to_string(),
            "token".to_string(),
        )
        .expect("Failed to create client");

        assert!(client.last_history_id().is_none());

        client.set_last_history_id("12345".to_string());
        assert_eq!(client.last_history_id(), Some("12345"));
    }

    #[test]
    fn test_parse_notification_valid() {
        let client = GmailPubSubClient::new(
            "project".to_string(),
            "sub".to_string(),
            "token".to_string(),
        )
        .expect("Failed to create client");

        // Create a valid Gmail notification
        let notification_json = r#"{"emailAddress":"test@gmail.com","historyId":12345}"#;
        let encoded = base64::engine::general_purpose::STANDARD.encode(notification_json);

        let message = PubSubMessage {
            data: Some(encoded),
            attributes: std::collections::HashMap::new(),
            message_id: Some("msg-1".to_string()),
            publish_time: None,
        };

        let notification = client.parse_notification(&message);
        assert!(notification.is_some());

        let notification = notification.unwrap();
        assert_eq!(notification.email_address, "test@gmail.com");
        assert_eq!(notification.history_id, "12345");
    }

    #[test]
    fn test_parse_notification_invalid_base64() {
        let client = GmailPubSubClient::new(
            "project".to_string(),
            "sub".to_string(),
            "token".to_string(),
        )
        .expect("Failed to create client");

        let message = PubSubMessage {
            data: Some("not-valid-base64!!!".to_string()),
            attributes: std::collections::HashMap::new(),
            message_id: None,
            publish_time: None,
        };

        let notification = client.parse_notification(&message);
        assert!(notification.is_none());
    }

    #[test]
    fn test_parse_notification_invalid_json() {
        let client = GmailPubSubClient::new(
            "project".to_string(),
            "sub".to_string(),
            "token".to_string(),
        )
        .expect("Failed to create client");

        let encoded = base64::engine::general_purpose::STANDARD.encode("not valid json");

        let message = PubSubMessage {
            data: Some(encoded),
            attributes: std::collections::HashMap::new(),
            message_id: None,
            publish_time: None,
        };

        let notification = client.parse_notification(&message);
        assert!(notification.is_none());
    }

    #[test]
    fn test_parse_notification_no_data() {
        let client = GmailPubSubClient::new(
            "project".to_string(),
            "sub".to_string(),
            "token".to_string(),
        )
        .expect("Failed to create client");

        let message = PubSubMessage {
            data: None,
            attributes: std::collections::HashMap::new(),
            message_id: None,
            publish_time: None,
        };

        let notification = client.parse_notification(&message);
        assert!(notification.is_none());
    }

    #[test]
    fn test_watch_response_serialization() {
        let response = WatchResponse {
            history_id: "123456".to_string(),
            expiration: "1704067200000".to_string(),
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("historyId"));
        assert!(json.contains("123456"));

        let parsed: WatchResponse = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.history_id, "123456");
    }

    #[test]
    fn test_email_notification_serialization() {
        let notification = EmailNotification {
            email_address: "user@example.com".to_string(),
            history_id: "98765".to_string(),
            received_at: 1704067200,
        };

        let json = serde_json::to_string(&notification).unwrap();
        let parsed: EmailNotification = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.email_address, notification.email_address);
        assert_eq!(parsed.history_id, notification.history_id);
        assert_eq!(parsed.received_at, notification.received_at);
    }

    #[test]
    fn test_history_record_deserialization() {
        let json = r#"{
            "id": "12345",
            "messagesAdded": [
                {
                    "message": {
                        "id": "msg-1",
                        "threadId": "thread-1",
                        "labelIds": ["INBOX", "UNREAD"]
                    }
                }
            ],
            "messagesDeleted": [],
            "labelsAdded": [],
            "labelsRemoved": []
        }"#;

        let record: HistoryRecord = serde_json::from_str(json).unwrap();
        assert_eq!(record.id, "12345");
        assert_eq!(record.messages_added.len(), 1);
        assert_eq!(record.messages_added[0].message.id, "msg-1");
        assert_eq!(record.messages_added[0].message.label_ids.len(), 2);
    }
}
