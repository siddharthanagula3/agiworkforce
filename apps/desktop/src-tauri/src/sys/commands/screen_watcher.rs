//! Screen Watcher Tauri Commands
//!
//! Provides frontend access to the continuous screen monitoring system.
//! The screen watcher captures periodic screenshots for AGI awareness.

use crate::automation::screen_watcher::{self, ScreenCapture, ScreenWatcherConfig};
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tracing::info;

/// Request to start the screen watcher with configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartWatcherRequest {
    /// Capture interval in milliseconds (default: 3000)
    #[serde(default = "default_interval")]
    pub interval_ms: u64,
    /// Enable change detection (skip unchanged frames)
    #[serde(default = "default_true")]
    pub change_detection: bool,
}

fn default_interval() -> u64 {
    3000
}

fn default_true() -> bool {
    true
}

impl From<StartWatcherRequest> for ScreenWatcherConfig {
    fn from(req: StartWatcherRequest) -> Self {
        ScreenWatcherConfig {
            interval_ms: req.interval_ms,
            change_detection: req.change_detection,
            min_interval_ms: 1000,
            max_resolution: 1280,
        }
    }
}

/// Screen watcher status response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatcherStatus {
    pub is_running: bool,
    pub is_paused: bool,
    pub screenshot_count: usize,
}

/// Start the screen watcher
#[tauri::command]
pub async fn screen_watcher_start(
    app_handle: tauri::AppHandle,
    request: Option<StartWatcherRequest>,
) -> Result<(), String> {
    let config: ScreenWatcherConfig = request.map(|r| r.into()).unwrap_or_default();

    info!(
        "[ScreenWatcher] Starting with interval={}ms",
        config.interval_ms
    );

    screen_watcher::start_watcher_with_config(config)
        .await
        .map_err(|e| format!("Failed to start screen watcher: {}", e))?;

    // Set up event forwarding
    tokio::spawn(async move {
        let mut rx = screen_watcher::subscribe().await;
        while let Some(capture) = rx.recv().await {
            // Emit screenshot event to frontend
            let _ = app_handle.emit("screen-watcher:capture", &capture);
        }
    });

    Ok(())
}

/// Stop the screen watcher
#[tauri::command]
pub async fn screen_watcher_stop() -> Result<(), String> {
    info!("[ScreenWatcher] Stopping");
    screen_watcher::stop_watcher().await;
    Ok(())
}

/// Pause the screen watcher (keeps running but skips captures)
#[tauri::command]
pub fn screen_watcher_pause() -> Result<(), String> {
    screen_watcher::pause_watcher();
    Ok(())
}

/// Resume the screen watcher
#[tauri::command]
pub fn screen_watcher_resume() -> Result<(), String> {
    screen_watcher::resume_watcher();
    Ok(())
}

/// Get screen watcher status
#[tauri::command]
pub async fn screen_watcher_status() -> Result<WatcherStatus, String> {
    let screenshots = screen_watcher::get_recent_screenshots().await;
    Ok(WatcherStatus {
        is_running: screen_watcher::is_watcher_running(),
        is_paused: screen_watcher::is_watcher_paused(),
        screenshot_count: screenshots.len(),
    })
}

/// Get the latest screenshot
#[tauri::command]
pub async fn screen_watcher_get_latest() -> Result<Option<ScreenCapture>, String> {
    Ok(screen_watcher::get_latest_screenshot().await)
}

/// Get all recent screenshots from the buffer
#[tauri::command]
pub async fn screen_watcher_get_recent() -> Result<Vec<ScreenCapture>, String> {
    Ok(screen_watcher::get_recent_screenshots().await)
}

/// Capture a screenshot immediately (bypasses interval)
#[tauri::command]
pub async fn screen_watcher_capture_now() -> Result<ScreenCapture, String> {
    screen_watcher::capture_now()
        .await
        .map_err(|e| format!("Failed to capture screenshot: {}", e))
}
