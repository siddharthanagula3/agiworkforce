use crate::filesystem::FileWatcher;
use std::sync::Mutex;
use tauri::State;
use tracing::{debug, info};

/// File watcher state wrapper for Tauri
pub struct FileWatcherState(pub Mutex<Option<FileWatcher>>);

impl Default for FileWatcherState {
    fn default() -> Self {
        Self::new()
    }
}

impl FileWatcherState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

/// Start watching a file or directory
#[tauri::command]
pub async fn file_watch_start(
    path: String,
    recursive: bool,
    state: State<'_, FileWatcherState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    debug!("Starting file watch: {} (recursive: {})", path, recursive);

    let mut watcher_lock = state
        .0
        .lock()
        .map_err(|e| format!("Failed to lock watcher: {}", e))?;

    // Initialize watcher if not exists
    if watcher_lock.is_none() {
        *watcher_lock = Some(FileWatcher::new(app_handle)?);
    }

    // Start watching
    if let Some(watcher) = watcher_lock.as_mut() {
        watcher.watch(&path, recursive)?;
        info!("Started watching: {}", path);
        Ok(())
    } else {
        Err("File watcher not initialized".to_string())
    }
}

/// Stop watching a file or directory
#[tauri::command]
pub async fn file_watch_stop(
    path: String,
    state: State<'_, FileWatcherState>,
) -> Result<(), String> {
    debug!("Stopping file watch: {}", path);

    let mut watcher_lock = state
        .0
        .lock()
        .map_err(|e| format!("Failed to lock watcher: {}", e))?;

    if let Some(watcher) = watcher_lock.as_mut() {
        watcher.unwatch(&path)?;
        info!("Stopped watching: {}", path);
        Ok(())
    } else {
        Err("File watcher not initialized".to_string())
    }
}

/// Get all currently watched paths
#[tauri::command]
pub async fn file_watch_list(state: State<'_, FileWatcherState>) -> Result<Vec<String>, String> {
    let watcher_lock = state
        .0
        .lock()
        .map_err(|e| format!("Failed to lock watcher: {}", e))?;

    if let Some(watcher) = watcher_lock.as_ref() {
        watcher.get_watched_paths()
    } else {
        Ok(Vec::new())
    }
}

/// Stop watching all paths
#[tauri::command]
pub async fn file_watch_stop_all(state: State<'_, FileWatcherState>) -> Result<(), String> {
    debug!("Stopping all file watches");

    let mut watcher_lock = state
        .0
        .lock()
        .map_err(|e| format!("Failed to lock watcher: {}", e))?;

    if let Some(watcher) = watcher_lock.as_mut() {
        watcher.unwatch_all()?;
        info!("Stopped watching all paths");
        Ok(())
    } else {
        Ok(()) // Nothing to stop
    }
}
