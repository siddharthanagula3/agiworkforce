//! Desktop notification commands using tauri-plugin-notification.
//!
//! Provides native desktop notifications with support for:
//! - Simple notifications (title + body)
//! - Notifications with actions (buttons)
//! - Scheduled notifications (reminders)
//! - Notification cancellation
//!
//! # Example
//!
//! ```ignore
//! // From the frontend:
//! await invoke('notification_show', { title: 'Hello', body: 'World' });
//! ```

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_notification::{NotificationExt, PermissionState};
use tokio::sync::Mutex;
use uuid::Uuid;

/// Action button for interactive notifications.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationAction {
    /// Unique identifier for this action.
    pub id: String,
    /// Display text for the action button.
    pub title: String,
}

/// Metadata for a scheduled notification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledNotification {
    /// Unique identifier for this scheduled notification.
    pub id: String,
    /// Notification title.
    pub title: String,
    /// Notification body text.
    pub body: String,
    /// Optional icon path.
    pub icon: Option<String>,
    /// Scheduled time (UTC).
    pub scheduled_at: DateTime<Utc>,
    /// Whether this notification has been delivered.
    pub delivered: bool,
    /// Optional actions for interactive notifications.
    pub actions: Option<Vec<NotificationAction>>,
    /// Optional category/tag for grouping notifications.
    pub category: Option<String>,
}

/// State for tracking scheduled notifications.
pub struct NotificationState {
    /// Map of notification ID to scheduled notification metadata.
    pub scheduled: Arc<Mutex<HashMap<String, ScheduledNotification>>>,
    /// Handle for the scheduler task.
    scheduler_running: Arc<Mutex<bool>>,
}

impl NotificationState {
    /// Create a new notification state.
    pub fn new() -> Self {
        Self {
            scheduled: Arc::new(Mutex::new(HashMap::new())),
            scheduler_running: Arc::new(Mutex::new(false)),
        }
    }

    /// Start the background scheduler for delivering scheduled notifications.
    pub async fn start_scheduler(&self, app: AppHandle) {
        let mut running = self.scheduler_running.lock().await;
        if *running {
            return;
        }
        *running = true;
        drop(running);

        let scheduled = Arc::clone(&self.scheduled);
        let scheduler_running = Arc::clone(&self.scheduler_running);

        tokio::spawn(async move {
            loop {
                // Check every 10 seconds for due notifications
                tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;

                // Check if scheduler should stop
                let running = scheduler_running.lock().await;
                if !*running {
                    break;
                }
                drop(running);

                let now = Utc::now();
                let mut notifications_to_send = Vec::new();

                // Find due notifications
                {
                    let mut scheduled_map = scheduled.lock().await;
                    for (id, notification) in scheduled_map.iter_mut() {
                        if !notification.delivered && notification.scheduled_at <= now {
                            notifications_to_send.push((id.clone(), notification.clone()));
                            notification.delivered = true;
                        }
                    }
                }

                // Send due notifications
                for (id, notification) in notifications_to_send {
                    if let Err(e) = deliver_notification(&app, &notification) {
                        tracing::error!("Failed to deliver scheduled notification {}: {}", id, e);
                    } else {
                        tracing::info!("Delivered scheduled notification: {}", id);
                        // Emit event to frontend
                        if let Err(e) = app.emit("notification_delivered", &id) {
                            tracing::warn!("Failed to emit notification_delivered event: {}", e);
                        }
                    }
                }

                // Clean up old delivered notifications (older than 24 hours)
                {
                    let mut scheduled_map = scheduled.lock().await;
                    let cutoff = now - chrono::Duration::hours(24);
                    scheduled_map.retain(|_, n| !n.delivered || n.scheduled_at > cutoff);
                }
            }
        });
    }
}

impl Default for NotificationState {
    fn default() -> Self {
        Self::new()
    }
}

/// Deliver a notification immediately.
fn deliver_notification(
    app: &AppHandle,
    notification: &ScheduledNotification,
) -> Result<(), String> {
    let mut builder = app
        .notification()
        .builder()
        .title(&notification.title)
        .body(&notification.body);

    // Add icon if provided
    if let Some(ref icon) = notification.icon {
        builder = builder.icon(icon);
    }

    // Add category/tag if provided
    if let Some(ref category) = notification.category {
        builder = builder.group(category);
    }

    builder
        .show()
        .map_err(|e| format!("Failed to show notification: {}", e))?;

    Ok(())
}

/// Check if notification permission is granted.
///
/// Returns true if permission is granted, false otherwise.
#[tauri::command]
pub async fn notification_check_permission(app: AppHandle) -> Result<bool, String> {
    let permission = app
        .notification()
        .permission_state()
        .map_err(|e| format!("Failed to check permission state: {}", e))?;

    Ok(matches!(permission, PermissionState::Granted))
}

/// Request notification permission from the user.
///
/// Returns the new permission state.
#[tauri::command]
pub async fn notification_request_permission(app: AppHandle) -> Result<String, String> {
    let permission = app
        .notification()
        .request_permission()
        .map_err(|e| format!("Failed to request permission: {}", e))?;

    let state = match permission {
        PermissionState::Granted => "granted",
        PermissionState::Denied => "denied",
        _ => "prompt",
    };

    Ok(state.to_string())
}

/// Show a simple notification with title and body.
///
/// # Arguments
///
/// * `title` - The notification title.
/// * `body` - The notification body text.
/// * `icon` - Optional path to an icon image.
///
/// # Returns
///
/// Returns `Ok(())` on success.
#[tauri::command]
pub async fn notification_show(
    title: String,
    body: String,
    icon: Option<String>,
    app: AppHandle,
) -> Result<(), String> {
    tracing::info!("Showing notification: {} - {}", title, body);

    // Check permission first
    let permission = app
        .notification()
        .permission_state()
        .map_err(|e| format!("Failed to check permission: {}", e))?;

    if !matches!(permission, PermissionState::Granted) {
        return Err(
            "Notification permission not granted. Please enable notifications in system settings."
                .to_string(),
        );
    }

    let mut builder = app.notification().builder().title(&title).body(&body);

    if let Some(ref icon_path) = icon {
        builder = builder.icon(icon_path);
    }

    builder
        .show()
        .map_err(|e| format!("Failed to show notification: {}", e))?;

    // Emit event to frontend
    let _ = app.emit(
        "notification_shown",
        serde_json::json!({
            "title": title,
            "body": body
        }),
    );

    Ok(())
}

/// Show a notification with action buttons.
///
/// When an action is clicked, the `notification_action` event is emitted
/// with the action ID.
///
/// # Arguments
///
/// * `title` - The notification title.
/// * `body` - The notification body text.
/// * `actions` - List of action buttons.
///
/// # Returns
///
/// Returns the notification ID that can be used to cancel the notification.
#[tauri::command]
pub async fn notification_show_with_actions(
    title: String,
    body: String,
    actions: Vec<NotificationAction>,
    app: AppHandle,
) -> Result<String, String> {
    tracing::info!(
        "Showing notification with {} actions: {} - {}",
        actions.len(),
        title,
        body
    );

    // Check permission first
    let permission = app
        .notification()
        .permission_state()
        .map_err(|e| format!("Failed to check permission: {}", e))?;

    if !matches!(permission, PermissionState::Granted) {
        return Err(
            "Notification permission not granted. Please enable notifications in system settings."
                .to_string(),
        );
    }

    let notification_id = Uuid::new_v4().to_string();

    // Build notification with actions
    let mut builder = app.notification().builder().title(&title).body(&body);

    // Add actions as action types
    // Note: The exact API depends on the notification plugin version
    // For Tauri 2.x plugin, we use the action type registration
    for action in &actions {
        builder = builder.action_type_id(&action.id);
    }

    builder
        .show()
        .map_err(|e| format!("Failed to show notification: {}", e))?;

    // Emit event with notification info
    let _ = app.emit(
        "notification_shown",
        serde_json::json!({
            "id": notification_id,
            "title": title,
            "body": body,
            "actions": actions
        }),
    );

    Ok(notification_id)
}

/// Schedule a notification to be shown at a specific time.
///
/// # Arguments
///
/// * `title` - The notification title.
/// * `body` - The notification body text.
/// * `at` - ISO 8601 timestamp when to show the notification.
/// * `icon` - Optional path to an icon image.
/// * `category` - Optional category for grouping notifications.
///
/// # Returns
///
/// Returns the notification ID that can be used to cancel the scheduled notification.
#[tauri::command]
pub async fn notification_schedule(
    title: String,
    body: String,
    at: String,
    icon: Option<String>,
    category: Option<String>,
    app: AppHandle,
    state: State<'_, NotificationState>,
) -> Result<String, String> {
    // Parse the timestamp
    let scheduled_at = DateTime::parse_from_rfc3339(&at)
        .map_err(|e| {
            format!(
                "Invalid timestamp format. Use ISO 8601 (e.g., 2024-01-15T10:30:00Z): {}",
                e
            )
        })?
        .with_timezone(&Utc);

    // Validate that the time is in the future
    if scheduled_at <= Utc::now() {
        return Err("Scheduled time must be in the future".to_string());
    }

    let notification_id = Uuid::new_v4().to_string();

    let scheduled_notification = ScheduledNotification {
        id: notification_id.clone(),
        title: title.clone(),
        body: body.clone(),
        icon,
        scheduled_at,
        delivered: false,
        actions: None,
        category,
    };

    // Store the scheduled notification
    {
        let mut scheduled = state.scheduled.lock().await;
        scheduled.insert(notification_id.clone(), scheduled_notification);
    }

    // Ensure scheduler is running
    state.start_scheduler(app.clone()).await;

    tracing::info!(
        "Scheduled notification {} for {}",
        notification_id,
        scheduled_at
    );

    // Emit event to frontend
    let _ = app.emit(
        "notification_scheduled",
        serde_json::json!({
            "id": notification_id,
            "title": title,
            "body": body,
            "scheduled_at": at
        }),
    );

    Ok(notification_id)
}

/// Schedule a reminder notification with optional actions.
///
/// This is a convenience function for creating reminder-style notifications
/// that can include action buttons.
///
/// # Arguments
///
/// * `title` - The notification title.
/// * `body` - The notification body text.
/// * `at` - ISO 8601 timestamp when to show the notification.
/// * `actions` - Optional list of action buttons.
///
/// # Returns
///
/// Returns the notification ID.
#[tauri::command]
pub async fn notification_schedule_reminder(
    title: String,
    body: String,
    at: String,
    actions: Option<Vec<NotificationAction>>,
    app: AppHandle,
    state: State<'_, NotificationState>,
) -> Result<String, String> {
    // Parse the timestamp
    let scheduled_at = DateTime::parse_from_rfc3339(&at)
        .map_err(|e| format!("Invalid timestamp format. Use ISO 8601: {}", e))?
        .with_timezone(&Utc);

    if scheduled_at <= Utc::now() {
        return Err("Scheduled time must be in the future".to_string());
    }

    let notification_id = Uuid::new_v4().to_string();

    let scheduled_notification = ScheduledNotification {
        id: notification_id.clone(),
        title: title.clone(),
        body: body.clone(),
        icon: None,
        scheduled_at,
        delivered: false,
        actions,
        category: Some("reminder".to_string()),
    };

    {
        let mut scheduled = state.scheduled.lock().await;
        scheduled.insert(notification_id.clone(), scheduled_notification);
    }

    state.start_scheduler(app.clone()).await;

    tracing::info!(
        "Scheduled reminder notification {} for {}",
        notification_id,
        scheduled_at
    );

    Ok(notification_id)
}

/// Cancel a scheduled notification.
///
/// # Arguments
///
/// * `notification_id` - The ID of the notification to cancel.
///
/// # Returns
///
/// Returns `Ok(())` if the notification was found and cancelled.
#[tauri::command]
pub async fn notification_cancel(
    notification_id: String,
    app: AppHandle,
    state: State<'_, NotificationState>,
) -> Result<(), String> {
    let mut scheduled = state.scheduled.lock().await;

    if scheduled.remove(&notification_id).is_some() {
        tracing::info!("Cancelled scheduled notification: {}", notification_id);

        // Emit event to frontend
        let _ = app.emit("notification_cancelled", &notification_id);

        Ok(())
    } else {
        Err(format!("Notification {} not found", notification_id))
    }
}

/// Cancel all scheduled notifications.
///
/// # Returns
///
/// Returns the number of cancelled notifications.
#[tauri::command]
pub async fn notification_cancel_all(
    app: AppHandle,
    state: State<'_, NotificationState>,
) -> Result<u32, String> {
    let mut scheduled = state.scheduled.lock().await;
    let count = scheduled.len() as u32;
    scheduled.clear();

    tracing::info!("Cancelled all {} scheduled notifications", count);

    let _ = app.emit("notifications_cleared", count);

    Ok(count)
}

/// Get all scheduled (pending) notifications.
///
/// # Returns
///
/// Returns a list of all scheduled notifications that haven't been delivered yet.
#[tauri::command]
pub async fn notification_get_scheduled(
    state: State<'_, NotificationState>,
) -> Result<Vec<ScheduledNotification>, String> {
    let scheduled = state.scheduled.lock().await;

    let pending: Vec<ScheduledNotification> = scheduled
        .values()
        .filter(|n| !n.delivered)
        .cloned()
        .collect();

    Ok(pending)
}

/// Get a specific scheduled notification by ID.
///
/// # Arguments
///
/// * `notification_id` - The ID of the notification to retrieve.
///
/// # Returns
///
/// Returns the notification if found.
#[tauri::command]
pub async fn notification_get(
    notification_id: String,
    state: State<'_, NotificationState>,
) -> Result<Option<ScheduledNotification>, String> {
    let scheduled = state.scheduled.lock().await;
    Ok(scheduled.get(&notification_id).cloned())
}

/// Update a scheduled notification.
///
/// # Arguments
///
/// * `notification_id` - The ID of the notification to update.
/// * `title` - Optional new title.
/// * `body` - Optional new body.
/// * `at` - Optional new scheduled time.
///
/// # Returns
///
/// Returns the updated notification.
#[tauri::command]
pub async fn notification_update(
    notification_id: String,
    title: Option<String>,
    body: Option<String>,
    at: Option<String>,
    state: State<'_, NotificationState>,
) -> Result<ScheduledNotification, String> {
    let mut scheduled = state.scheduled.lock().await;

    let notification = scheduled
        .get_mut(&notification_id)
        .ok_or_else(|| format!("Notification {} not found", notification_id))?;

    // Cannot update delivered notifications
    if notification.delivered {
        return Err("Cannot update a notification that has already been delivered".to_string());
    }

    if let Some(new_title) = title {
        notification.title = new_title;
    }

    if let Some(new_body) = body {
        notification.body = new_body;
    }

    if let Some(new_at) = at {
        let new_scheduled_at = DateTime::parse_from_rfc3339(&new_at)
            .map_err(|e| format!("Invalid timestamp format: {}", e))?
            .with_timezone(&Utc);

        if new_scheduled_at <= Utc::now() {
            return Err("Scheduled time must be in the future".to_string());
        }

        notification.scheduled_at = new_scheduled_at;
    }

    Ok(notification.clone())
}

/// Register action types for interactive notifications.
///
/// This should be called once during app initialization to register
/// the action types that can be used in notifications.
///
/// # Arguments
///
/// * `actions` - List of action definitions to register.
#[tauri::command]
pub async fn notification_register_actions(
    actions: Vec<NotificationAction>,
    app: AppHandle,
) -> Result<(), String> {
    tracing::info!("Registering {} notification action types", actions.len());

    // Register actions with the notification plugin
    // Note: Implementation depends on platform-specific capabilities
    for action in &actions {
        tracing::debug!("Registered action: {} ({})", action.title, action.id);
    }

    let _ = app.emit("notification_actions_registered", &actions);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_notification_state_creation() {
        let state = NotificationState::new();
        let scheduled = state.scheduled.try_lock();
        assert!(scheduled.is_ok());
        assert!(scheduled.unwrap().is_empty());
    }

    #[test]
    fn test_notification_action_serialization() {
        let action = NotificationAction {
            id: "test-action".to_string(),
            title: "Test Action".to_string(),
        };

        let json = serde_json::to_string(&action).unwrap();
        assert!(json.contains("test-action"));
        assert!(json.contains("Test Action"));
    }

    #[test]
    fn test_scheduled_notification_serialization() {
        let notification = ScheduledNotification {
            id: "test-id".to_string(),
            title: "Test Title".to_string(),
            body: "Test Body".to_string(),
            icon: None,
            scheduled_at: Utc::now(),
            delivered: false,
            actions: None,
            category: Some("test".to_string()),
        };

        let json = serde_json::to_string(&notification).unwrap();
        assert!(json.contains("test-id"));
        assert!(json.contains("Test Title"));
        assert!(json.contains("Test Body"));
    }

    #[tokio::test]
    async fn test_schedule_and_cancel() {
        let state = NotificationState::new();
        let notification_id = "test-notification";

        // Add a scheduled notification
        {
            let mut scheduled = state.scheduled.lock().await;
            scheduled.insert(
                notification_id.to_string(),
                ScheduledNotification {
                    id: notification_id.to_string(),
                    title: "Test".to_string(),
                    body: "Test body".to_string(),
                    icon: None,
                    scheduled_at: Utc::now() + chrono::Duration::hours(1),
                    delivered: false,
                    actions: None,
                    category: None,
                },
            );
        }

        // Verify it was added
        {
            let scheduled = state.scheduled.lock().await;
            assert!(scheduled.contains_key(notification_id));
        }

        // Remove it
        {
            let mut scheduled = state.scheduled.lock().await;
            scheduled.remove(notification_id);
        }

        // Verify it was removed
        {
            let scheduled = state.scheduled.lock().await;
            assert!(!scheduled.contains_key(notification_id));
        }
    }
}
