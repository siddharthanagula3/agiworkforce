//! In-app notification center commands.
//!
//! Provides a persistent notification center for the desktop app with support for:
//! - Listing notifications with pagination and filtering
//! - Marking notifications as read
//! - Deleting notifications
//! - Notification settings (sounds, badges, etc.)
//!
//! This is separate from the OS-level desktop notifications (notifications.rs).
//! The notification center stores notifications in SQLite for persistence.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;
use uuid::Uuid;

/// Notification priority levels.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum NotificationPriority {
    Low,
    #[default]
    Normal,
    High,
    Urgent,
}

/// Notification types for categorization.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum NotificationType {
    /// System notifications (updates, errors, etc.)
    System,
    /// Task/goal completion notifications
    TaskComplete,
    /// Task failure notifications
    TaskFailed,
    /// Agent activity notifications
    AgentActivity,
    /// MCP server notifications
    McpServer,
    /// Reminder notifications
    Reminder,
    /// Achievement/milestone notifications
    Achievement,
    /// Team-related notifications
    Team,
    /// General info notifications
    #[default]
    Info,
    /// Warning notifications
    Warning,
    /// Error notifications
    Error,
}

/// An in-app notification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notification {
    /// Unique identifier.
    pub id: String,
    /// Notification title.
    pub title: String,
    /// Notification message body.
    pub message: String,
    /// Notification type for categorization.
    #[serde(rename = "type")]
    pub notification_type: NotificationType,
    /// Priority level.
    pub priority: NotificationPriority,
    /// Whether the notification has been read.
    pub read: bool,
    /// When the notification was created.
    pub created_at: DateTime<Utc>,
    /// When the notification was read (if applicable).
    pub read_at: Option<DateTime<Utc>>,
    /// Optional action URL or deep link.
    pub action_url: Option<String>,
    /// Optional action label.
    pub action_label: Option<String>,
    /// Optional icon name or path.
    pub icon: Option<String>,
    /// Optional metadata (JSON object).
    pub metadata: Option<serde_json::Value>,
    /// Whether this notification is dismissible.
    pub dismissible: bool,
    /// Optional expiration time.
    pub expires_at: Option<DateTime<Utc>>,
}

/// Input for creating a new notification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateNotificationInput {
    pub title: String,
    pub message: String,
    #[serde(rename = "type", default)]
    pub notification_type: NotificationType,
    #[serde(default)]
    pub priority: NotificationPriority,
    pub action_url: Option<String>,
    pub action_label: Option<String>,
    pub icon: Option<String>,
    pub metadata: Option<serde_json::Value>,
    #[serde(default = "default_dismissible")]
    pub dismissible: bool,
    pub expires_at: Option<String>,
}

fn default_dismissible() -> bool {
    true
}

/// Notification settings for the user.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationSettings {
    /// Whether notifications are enabled.
    pub enabled: bool,
    /// Play sound for new notifications.
    pub sound_enabled: bool,
    /// Show badge count on app icon.
    pub badge_enabled: bool,
    /// Show desktop notifications for high priority items.
    pub desktop_notifications: bool,
    /// Enabled notification types (empty = all enabled).
    pub enabled_types: Vec<NotificationType>,
    /// Do not disturb mode.
    pub do_not_disturb: bool,
    /// Do not disturb start time (HH:MM format).
    pub dnd_start_time: Option<String>,
    /// Do not disturb end time (HH:MM format).
    pub dnd_end_time: Option<String>,
}

impl Default for NotificationSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            sound_enabled: true,
            badge_enabled: true,
            desktop_notifications: true,
            enabled_types: vec![],
            do_not_disturb: false,
            dnd_start_time: None,
            dnd_end_time: None,
        }
    }
}

/// Notification list response with pagination info.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationListResponse {
    pub notifications: Vec<Notification>,
    pub total: usize,
    pub unread_count: usize,
    pub page: usize,
    pub page_size: usize,
    pub has_more: bool,
}

/// State for the notification center.
pub struct NotificationCenterState {
    /// In-memory notification storage (in production, use SQLite).
    notifications: Arc<Mutex<Vec<Notification>>>,
    /// User notification settings.
    settings: Arc<Mutex<NotificationSettings>>,
}

impl NotificationCenterState {
    /// Create a new notification center state.
    pub fn new() -> Self {
        Self {
            notifications: Arc::new(Mutex::new(Vec::new())),
            settings: Arc::new(Mutex::new(NotificationSettings::default())),
        }
    }

    /// Add a notification to the store.
    pub async fn add_notification(&self, notification: Notification) {
        let mut notifications = self.notifications.lock().await;
        notifications.insert(0, notification);

        // Keep only the last 1000 notifications
        if notifications.len() > 1000 {
            notifications.truncate(1000);
        }
    }

    /// Get unread count.
    pub async fn get_unread_count(&self) -> usize {
        let notifications = self.notifications.lock().await;
        notifications.iter().filter(|n| !n.read).count()
    }
}

impl Default for NotificationCenterState {
    fn default() -> Self {
        Self::new()
    }
}

/// List notifications with pagination and filtering.
///
/// # Arguments
///
/// * `page` - Page number (1-indexed).
/// * `page_size` - Number of notifications per page.
/// * `unread_only` - Only return unread notifications.
/// * `notification_type` - Filter by notification type.
///
/// # Returns
///
/// Returns a paginated list of notifications.
#[tauri::command]
pub async fn notification_list(
    page: Option<usize>,
    page_size: Option<usize>,
    unread_only: Option<bool>,
    notification_type: Option<NotificationType>,
    state: State<'_, NotificationCenterState>,
) -> Result<NotificationListResponse, String> {
    let page = page.unwrap_or(1).max(1);
    let page_size = page_size.unwrap_or(20).min(100);
    let unread_only = unread_only.unwrap_or(false);

    let notifications = state.notifications.lock().await;

    // Filter notifications
    let filtered: Vec<&Notification> = notifications
        .iter()
        .filter(|n| {
            // Filter out expired notifications
            if let Some(expires_at) = n.expires_at {
                if expires_at < Utc::now() {
                    return false;
                }
            }

            // Filter by read status
            if unread_only && n.read {
                return false;
            }

            // Filter by type
            if let Some(ref filter_type) = notification_type {
                if &n.notification_type != filter_type {
                    return false;
                }
            }

            true
        })
        .collect();

    let total = filtered.len();
    let unread_count = notifications.iter().filter(|n| !n.read).count();

    // Paginate
    let start = (page - 1) * page_size;
    let paginated: Vec<Notification> = filtered
        .into_iter()
        .skip(start)
        .take(page_size)
        .cloned()
        .collect();

    let has_more = start + paginated.len() < total;

    Ok(NotificationListResponse {
        notifications: paginated,
        total,
        unread_count,
        page,
        page_size,
        has_more,
    })
}

/// Mark a notification as read.
///
/// # Arguments
///
/// * `notification_id` - The ID of the notification to mark as read.
///
/// # Returns
///
/// Returns `Ok(true)` if the notification was found and marked as read.
#[tauri::command]
pub async fn notification_mark_read(
    notification_id: String,
    app: AppHandle,
    state: State<'_, NotificationCenterState>,
) -> Result<bool, String> {
    let mut notifications = state.notifications.lock().await;

    if let Some(notification) = notifications.iter_mut().find(|n| n.id == notification_id) {
        if !notification.read {
            notification.read = true;
            notification.read_at = Some(Utc::now());

            let unread_count = notifications.iter().filter(|n| !n.read).count();
            let _ = app.emit("notification:unread_count", unread_count);

            tracing::info!("Marked notification {} as read", notification_id);
            return Ok(true);
        }
        return Ok(false); // Already read
    }

    Err(format!("Notification {} not found", notification_id))
}

/// Mark all notifications as read.
///
/// # Returns
///
/// Returns the number of notifications that were marked as read.
#[tauri::command]
pub async fn notification_mark_all_read(
    app: AppHandle,
    state: State<'_, NotificationCenterState>,
) -> Result<usize, String> {
    let mut notifications = state.notifications.lock().await;
    let now = Utc::now();
    let mut count = 0;

    for notification in notifications.iter_mut() {
        if !notification.read {
            notification.read = true;
            notification.read_at = Some(now);
            count += 1;
        }
    }

    let _ = app.emit("notification:unread_count", 0usize);

    tracing::info!("Marked {} notifications as read", count);
    Ok(count)
}

/// Delete a notification.
///
/// # Arguments
///
/// * `notification_id` - The ID of the notification to delete.
///
/// # Returns
///
/// Returns `Ok(true)` if the notification was found and deleted.
#[tauri::command]
pub async fn notification_delete(
    notification_id: String,
    app: AppHandle,
    state: State<'_, NotificationCenterState>,
) -> Result<bool, String> {
    let mut notifications = state.notifications.lock().await;
    let original_len = notifications.len();

    notifications.retain(|n| n.id != notification_id);

    if notifications.len() < original_len {
        let unread_count = notifications.iter().filter(|n| !n.read).count();
        let _ = app.emit("notification:unread_count", unread_count);
        let _ = app.emit("notification:deleted", &notification_id);

        tracing::info!("Deleted notification {}", notification_id);
        return Ok(true);
    }

    Err(format!("Notification {} not found", notification_id))
}

/// Delete all read notifications.
///
/// # Returns
///
/// Returns the number of notifications that were deleted.
#[tauri::command]
pub async fn notification_delete_all_read(
    app: AppHandle,
    state: State<'_, NotificationCenterState>,
) -> Result<usize, String> {
    let mut notifications = state.notifications.lock().await;
    let original_len = notifications.len();

    notifications.retain(|n| !n.read);

    let deleted_count = original_len - notifications.len();

    if deleted_count > 0 {
        let _ = app.emit("notification:cleared", deleted_count);
        tracing::info!("Deleted {} read notifications", deleted_count);
    }

    Ok(deleted_count)
}

/// Get notification settings.
///
/// # Returns
///
/// Returns the current notification settings.
#[tauri::command]
pub async fn notification_get_settings(
    state: State<'_, NotificationCenterState>,
) -> Result<NotificationSettings, String> {
    let settings = state.settings.lock().await;
    Ok(settings.clone())
}

/// Update notification settings.
///
/// # Arguments
///
/// * `settings` - The new notification settings.
///
/// # Returns
///
/// Returns `Ok(())` on success.
#[tauri::command]
pub async fn notification_set_settings(
    settings: NotificationSettings,
    app: AppHandle,
    state: State<'_, NotificationCenterState>,
) -> Result<(), String> {
    let mut current_settings = state.settings.lock().await;
    *current_settings = settings.clone();

    let _ = app.emit("notification:settings_changed", &settings);

    tracing::info!("Updated notification settings");
    Ok(())
}

/// Why the user's settings refuse this notification, or `None` when it may be delivered.
///
/// `now_hhmm` is the local wall clock in `HH:MM` so the DND window is decidable
/// without a clock, and so every emitter is judged by the same rule.
pub fn suppression_reason(
    settings: &NotificationSettings,
    notification_type: &NotificationType,
    now_hhmm: &str,
) -> Option<String> {
    if !settings.enabled {
        return Some("Notifications are disabled".to_string());
    }

    if !settings.enabled_types.is_empty() && !settings.enabled_types.contains(notification_type) {
        return Some(format!(
            "Notification type {:?} is disabled",
            notification_type
        ));
    }

    if !settings.do_not_disturb {
        return None;
    }

    let (Some(start_time), Some(end_time)) = (&settings.dnd_start_time, &settings.dnd_end_time)
    else {
        return Some("Do not disturb mode is enabled".to_string());
    };

    let is_within_dnd = if start_time <= end_time {
        now_hhmm >= start_time.as_str() && now_hhmm <= end_time.as_str()
    } else {
        now_hhmm >= start_time.as_str() || now_hhmm <= end_time.as_str()
    };

    is_within_dnd.then(|| {
        format!(
            "Do not disturb mode is enabled ({} - {})",
            start_time, end_time
        )
    })
}

/// What the user's settings ask the OS to do once a notification is accepted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeliveryPlan {
    /// Raise an OS notification for this one.
    pub os_notification: bool,
    /// Attach the platform default sound to it.
    pub sound: bool,
    /// Unread count to paint on the app icon, or `None` to clear the badge.
    pub badge_count: Option<i64>,
}

pub fn delivery_plan(settings: &NotificationSettings, unread_count: usize) -> DeliveryPlan {
    DeliveryPlan {
        os_notification: settings.desktop_notifications,
        sound: settings.sound_enabled,
        badge_count: settings
            .badge_enabled
            .then_some(i64::try_from(unread_count).unwrap_or(i64::MAX)),
    }
}

/// Deliver a notification through the notification center, honoring the user's
/// master switch, per-type toggles, DND window, sound and badge settings. Every
/// in-app emitter must go through here rather than raising an OS notification of
/// its own.
pub async fn deliver_notification(
    app: &AppHandle,
    state: &NotificationCenterState,
    input: CreateNotificationInput,
) -> Result<Notification, String> {
    let guard = state.settings.lock().await;
    let now_hhmm = chrono::Local::now().format("%H:%M").to_string();
    if let Some(reason) = suppression_reason(&guard, &input.notification_type, &now_hhmm) {
        return Err(reason);
    }
    let settings = guard.clone();
    drop(guard);

    let notification = store_notification(app, state, input).await?;

    let plan = delivery_plan(&settings, state.get_unread_count().await);
    if plan.os_notification {
        show_os_notification(app, &notification.title, &notification.message, plan.sound);
    }
    apply_badge_count(app, plan.badge_count);
    Ok(notification)
}

fn show_os_notification(app: &AppHandle, title: &str, body: &str, sound: bool) {
    use tauri_plugin_notification::NotificationExt;

    let mut builder = app.notification().builder().title(title).body(body);
    if sound {
        builder = builder.sound(DEFAULT_NOTIFICATION_SOUND);
    }
    if let Err(e) = builder.show() {
        tracing::warn!("[NotificationCenter] Failed to show OS notification: {}", e);
    }
}

const DEFAULT_NOTIFICATION_SOUND: &str = "default";

fn apply_badge_count(app: &AppHandle, count: Option<i64>) {
    use tauri::Manager;

    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if let Err(e) = window.set_badge_count(count) {
        tracing::warn!("[NotificationCenter] Failed to set badge count: {}", e);
    }
}

/// Create a new notification (internal use or for testing).
///
/// # Arguments
///
/// * `input` - The notification creation input.
///
/// # Returns
///
/// Returns the created notification.
#[tauri::command]
pub async fn notification_create(
    input: CreateNotificationInput,
    app: AppHandle,
    state: State<'_, NotificationCenterState>,
) -> Result<Notification, String> {
    let settings = state.settings.lock().await;
    let now_hhmm = chrono::Local::now().format("%H:%M").to_string();
    if let Some(reason) = suppression_reason(&settings, &input.notification_type, &now_hhmm) {
        return Err(reason);
    }
    drop(settings);

    store_notification(&app, &state, input).await
}

async fn store_notification(
    app: &AppHandle,
    state: &NotificationCenterState,
    input: CreateNotificationInput,
) -> Result<Notification, String> {
    let expires_at = input
        .expires_at
        .map(|s| DateTime::parse_from_rfc3339(&s).map(|dt| dt.with_timezone(&Utc)))
        .transpose()
        .map_err(|e| format!("Invalid expires_at format: {}", e))?;

    let notification = Notification {
        id: Uuid::new_v4().to_string(),
        title: input.title,
        message: input.message,
        notification_type: input.notification_type,
        priority: input.priority,
        read: false,
        created_at: Utc::now(),
        read_at: None,
        action_url: input.action_url,
        action_label: input.action_label,
        icon: input.icon,
        metadata: input.metadata,
        dismissible: input.dismissible,
        expires_at,
    };

    state.add_notification(notification.clone()).await;

    let unread_count = state.get_unread_count().await;
    let _ = app.emit("notification:new", &notification);
    let _ = app.emit("notification:unread_count", unread_count);

    tracing::info!(
        "Created notification: {} - {}",
        notification.id,
        notification.title
    );

    Ok(notification)
}

/// Get unread notification count.
///
/// # Returns
///
/// Returns the number of unread notifications.
#[tauri::command]
pub async fn notification_unread_count(
    state: State<'_, NotificationCenterState>,
) -> Result<usize, String> {
    Ok(state.get_unread_count().await)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_notification_center_state_creation() {
        let state = NotificationCenterState::new();
        let notifications = state.notifications.try_lock();
        assert!(notifications.is_ok());
        assert!(notifications.unwrap().is_empty());
    }

    #[test]
    fn test_default_notification_settings() {
        let settings = NotificationSettings::default();
        assert!(settings.enabled);
        assert!(settings.sound_enabled);
        assert!(settings.badge_enabled);
        assert!(settings.desktop_notifications);
        assert!(!settings.do_not_disturb);
    }

    #[test]
    fn test_notification_serialization() {
        let notification = Notification {
            id: "test-id".to_string(),
            title: "Test Title".to_string(),
            message: "Test Message".to_string(),
            notification_type: NotificationType::Info,
            priority: NotificationPriority::Normal,
            read: false,
            created_at: Utc::now(),
            read_at: None,
            action_url: None,
            action_label: None,
            icon: None,
            metadata: None,
            dismissible: true,
            expires_at: None,
        };

        let json = serde_json::to_string(&notification).unwrap();
        assert!(json.contains("test-id"));
        assert!(json.contains("Test Title"));
        assert!(json.contains("Test Message"));
    }

    fn settings_with(mutate: impl FnOnce(&mut NotificationSettings)) -> NotificationSettings {
        let mut settings = NotificationSettings::default();
        mutate(&mut settings);
        settings
    }

    #[test]
    fn the_master_switch_suppresses_every_type() {
        let settings = settings_with(|s| s.enabled = false);
        assert_eq!(
            suppression_reason(&settings, &NotificationType::AgentActivity, "12:00"),
            Some("Notifications are disabled".to_string())
        );
    }

    #[test]
    fn a_group_toggle_suppresses_only_the_groups_left_out() {
        let settings = settings_with(|s| s.enabled_types = vec![NotificationType::Reminder]);
        assert!(suppression_reason(&settings, &NotificationType::AgentActivity, "12:00").is_some());
        assert!(suppression_reason(&settings, &NotificationType::Reminder, "12:00").is_none());
    }

    #[test]
    fn the_dnd_window_suppresses_inside_it_and_allows_outside_it() {
        let overnight = settings_with(|s| {
            s.do_not_disturb = true;
            s.dnd_start_time = Some("22:00".to_string());
            s.dnd_end_time = Some("06:00".to_string());
        });
        for inside in ["22:00", "23:30", "00:15", "06:00"] {
            assert!(
                suppression_reason(&overnight, &NotificationType::Info, inside).is_some(),
                "{inside} is inside the overnight window"
            );
        }
        for outside in ["06:01", "12:00", "21:59"] {
            assert!(
                suppression_reason(&overnight, &NotificationType::Info, outside).is_none(),
                "{outside} is outside the overnight window"
            );
        }

        let daytime = settings_with(|s| {
            s.do_not_disturb = true;
            s.dnd_start_time = Some("09:00".to_string());
            s.dnd_end_time = Some("17:00".to_string());
        });
        assert!(suppression_reason(&daytime, &NotificationType::Info, "12:00").is_some());
        assert!(suppression_reason(&daytime, &NotificationType::Info, "08:59").is_none());
    }

    #[test]
    fn the_sound_and_badge_settings_reach_the_delivery_plan() {
        let all_on = delivery_plan(&NotificationSettings::default(), 7);
        assert_eq!(
            all_on,
            DeliveryPlan {
                os_notification: true,
                sound: true,
                badge_count: Some(7),
            }
        );

        let muted = delivery_plan(
            &settings_with(|s| {
                s.sound_enabled = false;
                s.badge_enabled = false;
                s.desktop_notifications = false;
            }),
            7,
        );
        assert_eq!(
            muted,
            DeliveryPlan {
                os_notification: false,
                sound: false,
                badge_count: None,
            }
        );
    }

    #[test]
    fn dnd_without_a_window_suppresses_around_the_clock() {
        let settings = settings_with(|s| s.do_not_disturb = true);
        assert_eq!(
            suppression_reason(&settings, &NotificationType::Info, "03:00"),
            Some("Do not disturb mode is enabled".to_string())
        );
    }
}
