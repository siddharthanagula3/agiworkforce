//! In-app notification center commands.
//!
//! Every notification the app raises goes through `deliver_notification`, which
//! applies the user's settings, stores the item and raises the OS notification.
//! The settings and the most recent items are kept in `settings_v2`.

use crate::data::settings::{SettingCategory, SettingValue, SettingsService};
use crate::sys::commands::settings_v2::SettingsServiceState;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;
use uuid::Uuid;

const SETTINGS_KEY: &str = "notification_center.settings";
const ITEMS_KEY: &str = "notification_center.items";
const MAX_NOTIFICATIONS: usize = 200;

/// Where a click on a notification takes the user. The renderer resolves these
/// in `features/notifications/notificationRoutes.ts`; a route it does not know
/// is not clickable.
pub enum NotificationRoute<'a> {
    Trigger(&'a str),
    Schedule(&'a str),
    BackgroundAgent(&'a str),
    AgentTasks,
    Settings(&'a str),
}

impl NotificationRoute<'_> {
    pub fn action_url(&self) -> String {
        match self {
            Self::Trigger(id) => format!("trigger:{id}"),
            Self::Schedule(id) => format!("schedule:{id}"),
            Self::BackgroundAgent(id) => format!("background-agent:{id}"),
            Self::AgentTasks => "agent-tasks:all".to_string(),
            Self::Settings(tab) => format!("settings:{tab}"),
        }
    }
}

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
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
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
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
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
#[serde(rename_all = "camelCase")]
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
    notifications: Arc<Mutex<Vec<Notification>>>,
    settings: Arc<Mutex<NotificationSettings>>,
}

impl NotificationCenterState {
    pub fn new() -> Self {
        Self::with(NotificationSettings::default(), Vec::new())
    }

    fn with(settings: NotificationSettings, notifications: Vec<Notification>) -> Self {
        Self {
            notifications: Arc::new(Mutex::new(notifications)),
            settings: Arc::new(Mutex::new(settings)),
        }
    }

    /// Reads back what the last session saved. A missing or unreadable row
    /// falls back to the defaults rather than blocking startup.
    pub fn restore(app: &AppHandle) -> Self {
        let Some(settings_state) = app.try_state::<SettingsServiceState>() else {
            return Self::new();
        };
        let Ok(service) = settings_state.service.lock() else {
            return Self::new();
        };
        Self::with(
            stored_settings(&service),
            stored_notifications(&service, Utc::now()),
        )
    }

    pub async fn add_notification(&self, notification: Notification) {
        let mut notifications = self.notifications.lock().await;
        notifications.insert(0, notification);
        notifications.truncate(MAX_NOTIFICATIONS);
    }

    pub async fn get_unread_count(&self) -> usize {
        let notifications = self.notifications.lock().await;
        notifications.iter().filter(|n| !n.read).count()
    }
}

fn stored_json<T: serde::de::DeserializeOwned>(service: &SettingsService, key: &str) -> Option<T> {
    match service.get(key).ok()? {
        SettingValue::Json(value) => serde_json::from_value(value).ok(),
        SettingValue::String(raw) => serde_json::from_str(&raw).ok(),
        _ => None,
    }
}

fn stored_settings(service: &SettingsService) -> NotificationSettings {
    stored_json(service, SETTINGS_KEY).unwrap_or_default()
}

fn stored_notifications(service: &SettingsService, now: DateTime<Utc>) -> Vec<Notification> {
    let mut notifications: Vec<Notification> = stored_json(service, ITEMS_KEY).unwrap_or_default();
    notifications.retain(|n| n.expires_at.is_none_or(|expires_at| expires_at >= now));
    notifications.truncate(MAX_NOTIFICATIONS);
    notifications
}

fn save_json<T: Serialize>(service: &SettingsService, key: &str, value: &T) -> Result<(), String> {
    let json = serde_json::to_value(value).map_err(|e| e.to_string())?;
    service
        .set(
            key.to_string(),
            SettingValue::Json(json),
            SettingCategory::System,
            false,
        )
        .map_err(|e| e.to_string())
}

fn save_settings(app: &AppHandle, settings: &NotificationSettings) -> Result<(), String> {
    let settings_state = app
        .try_state::<SettingsServiceState>()
        .ok_or_else(|| "Settings storage is unavailable".to_string())?;
    let service = settings_state
        .service
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?;
    save_json(&service, SETTINGS_KEY, settings)
}

fn save_notifications(app: &AppHandle, notifications: &[Notification]) {
    let Some(settings_state) = app.try_state::<SettingsServiceState>() else {
        return;
    };
    let Ok(service) = settings_state.service.lock() else {
        return;
    };
    if let Err(error) = save_json(&service, ITEMS_KEY, &notifications) {
        tracing::warn!("[NotificationCenter] The notification list was not saved: {error}");
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
            save_notifications(&app, &notifications);
            sync_badge(&app, &state, unread_count).await;
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

    save_notifications(&app, &notifications);
    sync_badge(&app, &state, 0).await;
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
        save_notifications(&app, &notifications);
        sync_badge(&app, &state, unread_count).await;
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
        save_notifications(&app, &notifications);
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
    save_settings(&app, &settings)?;
    *current_settings = settings.clone();
    drop(current_settings);

    let unread_count = state.get_unread_count().await;
    apply_badge_count(&app, badge_count(&settings, unread_count));

    tracing::info!("Updated notification settings");
    Ok(())
}

/// Why the user's settings keep this notification out altogether, or `None`
/// when it is recorded. The master switch and a type the user turned off both
/// mean "do not tell me about this": nothing is stored and nothing is shown.
pub fn refusal_reason(
    settings: &NotificationSettings,
    notification_type: &NotificationType,
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

    None
}

/// Why do-not-disturb holds back the alert for a notification right now, or
/// `None` when it may interrupt. Do-not-disturb means "not now", not "never":
/// the notification is still stored and counted on the badge, and only the OS
/// notification and its sound are skipped.
///
/// `now_hhmm` is the local wall clock in `HH:MM` so the window is decidable
/// without a clock, and so every emitter is judged by the same rule.
pub fn do_not_disturb_reason(settings: &NotificationSettings, now_hhmm: &str) -> Option<String> {
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

fn badge_count(settings: &NotificationSettings, unread_count: usize) -> Option<i64> {
    settings
        .badge_enabled
        .then_some(i64::try_from(unread_count).unwrap_or(i64::MAX))
}

/// `quiet` is true while do-not-disturb holds: the badge still counts the
/// notification, and nothing interrupts.
pub fn delivery_plan(
    settings: &NotificationSettings,
    quiet: bool,
    unread_count: usize,
) -> DeliveryPlan {
    DeliveryPlan {
        os_notification: settings.desktop_notifications && !quiet,
        sound: settings.sound_enabled && !quiet,
        badge_count: badge_count(settings, unread_count),
    }
}

/// Deliver a notification through the notification center. Every in-app
/// emitter must go through here rather than raising an OS notification of its
/// own.
///
/// The rule: the master switch or a type turned off refuses the notification
/// outright (`Err`, nothing stored). Otherwise it is stored, sent to the list
/// and counted on the badge; do-not-disturb, the desktop-notification switch
/// and the sound switch only decide whether it also interrupts.
pub async fn deliver_notification(
    app: &AppHandle,
    state: &NotificationCenterState,
    input: CreateNotificationInput,
) -> Result<Notification, String> {
    let settings = state.settings.lock().await.clone();
    if let Some(reason) = refusal_reason(&settings, &input.notification_type) {
        return Err(reason);
    }
    let now_hhmm = chrono::Local::now().format("%H:%M").to_string();
    let quiet = do_not_disturb_reason(&settings, &now_hhmm).is_some();

    let notification = store_notification(app, state, input).await?;

    let plan = delivery_plan(&settings, quiet, state.get_unread_count().await);
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

async fn sync_badge(app: &AppHandle, state: &NotificationCenterState, unread_count: usize) {
    let settings = state.settings.lock().await.clone();
    apply_badge_count(app, badge_count(&settings, unread_count));
}

fn apply_badge_count(app: &AppHandle, count: Option<i64>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if let Err(e) = window.set_badge_count(count) {
        tracing::warn!("[NotificationCenter] Failed to set badge count: {}", e);
    }
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
    save_notifications(app, &state.notifications.lock().await);

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

    fn settings_service() -> SettingsService {
        let conn = rusqlite::Connection::open_in_memory().expect("in-memory settings database");
        conn.execute(
            "CREATE TABLE settings_v2 (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                category TEXT NOT NULL,
                encrypted INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )
        .expect("create settings table");
        SettingsService::new(Arc::new(std::sync::Mutex::new(conn))).expect("settings service")
    }

    fn notification(id: &str, expires_at: Option<DateTime<Utc>>) -> Notification {
        Notification {
            id: id.to_string(),
            title: "Title".to_string(),
            message: "Message".to_string(),
            notification_type: NotificationType::Info,
            priority: NotificationPriority::Normal,
            read: false,
            created_at: Utc::now(),
            read_at: None,
            action_url: Some(NotificationRoute::Schedule("job-1").action_url()),
            action_label: None,
            icon: None,
            metadata: None,
            dismissible: true,
            expires_at,
        }
    }

    #[test]
    fn saved_settings_come_back_after_a_restart() {
        let service = settings_service();
        let chosen = settings_with(|s| {
            s.enabled = false;
            s.sound_enabled = false;
            s.enabled_types = vec![NotificationType::Reminder];
        });
        save_json(&service, SETTINGS_KEY, &chosen).expect("save settings");
        service.clear_cache();

        assert_eq!(stored_settings(&service), chosen);
    }

    #[test]
    fn missing_or_unreadable_settings_fall_back_to_the_defaults() {
        let service = settings_service();
        assert_eq!(stored_settings(&service), NotificationSettings::default());

        service
            .set(
                SETTINGS_KEY.to_string(),
                SettingValue::String("not json".to_string()),
                SettingCategory::System,
                false,
            )
            .expect("write a malformed row");
        service.clear_cache();
        assert_eq!(stored_settings(&service), NotificationSettings::default());
    }

    #[test]
    fn saved_notifications_come_back_without_the_expired_ones() {
        let service = settings_service();
        let now = Utc::now();
        let saved = vec![
            notification("kept", None),
            notification("expired", Some(now - chrono::Duration::minutes(1))),
            notification("still-valid", Some(now + chrono::Duration::hours(1))),
        ];
        save_json(&service, ITEMS_KEY, &saved).expect("save notifications");
        service.clear_cache();

        let restored: Vec<String> = stored_notifications(&service, now)
            .into_iter()
            .map(|n| n.id)
            .collect();
        assert_eq!(restored, ["kept", "still-valid"]);
    }

    #[tokio::test]
    async fn the_list_keeps_only_the_most_recent_notifications() {
        let state = NotificationCenterState::new();
        for index in 0..MAX_NOTIFICATIONS + 5 {
            state
                .add_notification(notification(&index.to_string(), None))
                .await;
        }
        let notifications = state.notifications.lock().await;
        assert_eq!(notifications.len(), MAX_NOTIFICATIONS);
        assert_eq!(notifications[0].id, (MAX_NOTIFICATIONS + 4).to_string());
    }

    #[test]
    fn the_renderer_reads_camel_case_fields() {
        let json = serde_json::to_value(notification("n1", None)).expect("serialize");
        assert_eq!(json["actionUrl"], "schedule:job-1");
        assert!(json.get("createdAt").is_some());
        assert_eq!(json["type"], "info");

        let settings = serde_json::to_value(NotificationSettings::default()).expect("serialize");
        assert_eq!(settings["desktopNotifications"], true);
        assert_eq!(settings["enabledTypes"], serde_json::json!([]));
    }

    #[test]
    fn every_route_names_a_destination_the_renderer_resolves() {
        assert_eq!(NotificationRoute::Trigger("t1").action_url(), "trigger:t1");
        assert_eq!(
            NotificationRoute::Schedule("j1").action_url(),
            "schedule:j1"
        );
        assert_eq!(
            NotificationRoute::BackgroundAgent("a1").action_url(),
            "background-agent:a1"
        );
        assert_eq!(
            NotificationRoute::AgentTasks.action_url(),
            "agent-tasks:all"
        );
        assert_eq!(
            NotificationRoute::Settings("privacy").action_url(),
            "settings:privacy"
        );
    }

    fn settings_with(mutate: impl FnOnce(&mut NotificationSettings)) -> NotificationSettings {
        let mut settings = NotificationSettings::default();
        mutate(&mut settings);
        settings
    }

    #[test]
    fn the_master_switch_refuses_every_type() {
        let settings = settings_with(|s| s.enabled = false);
        assert_eq!(
            refusal_reason(&settings, &NotificationType::AgentActivity),
            Some("Notifications are disabled".to_string())
        );
    }

    #[test]
    fn a_group_toggle_refuses_only_the_groups_left_out() {
        let settings = settings_with(|s| s.enabled_types = vec![NotificationType::Reminder]);
        assert!(refusal_reason(&settings, &NotificationType::AgentActivity).is_some());
        assert!(refusal_reason(&settings, &NotificationType::Reminder).is_none());
    }

    #[test]
    fn do_not_disturb_never_refuses_a_notification() {
        let settings = settings_with(|s| s.do_not_disturb = true);
        assert_eq!(
            refusal_reason(&settings, &NotificationType::TaskFailed),
            None
        );
        assert!(do_not_disturb_reason(&settings, "03:00").is_some());
    }

    #[test]
    fn the_dnd_window_holds_inside_it_and_not_outside_it() {
        let overnight = settings_with(|s| {
            s.do_not_disturb = true;
            s.dnd_start_time = Some("22:00".to_string());
            s.dnd_end_time = Some("06:00".to_string());
        });
        for inside in ["22:00", "23:30", "00:15", "06:00"] {
            assert!(
                do_not_disturb_reason(&overnight, inside).is_some(),
                "{inside} is inside the overnight window"
            );
        }
        for outside in ["06:01", "12:00", "21:59"] {
            assert!(
                do_not_disturb_reason(&overnight, outside).is_none(),
                "{outside} is outside the overnight window"
            );
        }

        let daytime = settings_with(|s| {
            s.do_not_disturb = true;
            s.dnd_start_time = Some("09:00".to_string());
            s.dnd_end_time = Some("17:00".to_string());
        });
        assert!(do_not_disturb_reason(&daytime, "12:00").is_some());
        assert!(do_not_disturb_reason(&daytime, "08:59").is_none());
    }

    #[test]
    fn the_sound_and_badge_settings_reach_the_delivery_plan() {
        let all_on = delivery_plan(&NotificationSettings::default(), false, 7);
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
            false,
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
    fn do_not_disturb_keeps_the_badge_and_drops_only_the_interruption() {
        let quiet = delivery_plan(&NotificationSettings::default(), true, 3);
        assert_eq!(
            quiet,
            DeliveryPlan {
                os_notification: false,
                sound: false,
                badge_count: Some(3),
            }
        );
    }

    #[tokio::test]
    async fn a_notification_held_by_do_not_disturb_is_still_in_the_list() {
        let state =
            NotificationCenterState::with(settings_with(|s| s.do_not_disturb = true), Vec::new());
        let settings = state.settings.lock().await.clone();
        assert_eq!(
            refusal_reason(&settings, &NotificationType::TaskFailed),
            None
        );

        state
            .add_notification(notification("scheduled-task-failed", None))
            .await;
        assert_eq!(state.get_unread_count().await, 1);
        assert_eq!(
            delivery_plan(&settings, true, state.get_unread_count().await),
            DeliveryPlan {
                os_notification: false,
                sound: false,
                badge_count: Some(1),
            }
        );
    }

    #[test]
    fn dnd_without_a_window_holds_around_the_clock() {
        let settings = settings_with(|s| s.do_not_disturb = true);
        assert_eq!(
            do_not_disturb_reason(&settings, "03:00"),
            Some("Do not disturb mode is enabled".to_string())
        );
    }
}
